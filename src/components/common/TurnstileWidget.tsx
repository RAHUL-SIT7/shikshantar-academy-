import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, RefreshCw, AlertCircle } from 'lucide-react';

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement | string, options: Record<string, any>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onTurnstileLoadCallback?: () => void;
  }
}

export interface TurnstileWidgetProps {
  action?: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: (error?: string) => void;
  resetKey?: number | string;
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
}

// Cloudflare official test site key when VITE_TURNSTILE_SITE_KEY is not configured in dev/test
const DEFAULT_TEST_SITE_KEY = '1x00000000000000000000AA';

export const TurnstileWidget: React.FC<TurnstileWidgetProps> = ({
  action = 'submit',
  onVerify,
  onExpire,
  onError,
  resetKey = 0,
  theme = 'light',
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'verified' | 'expired' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const env = (import.meta as any).env || {};
  const bakedSiteKey = String(env.VITE_TURNSTILE_SITE_KEY || '').trim();
  const [siteKey, setSiteKey] = useState<string>(bakedSiteKey);

  useEffect(() => {
    if (bakedSiteKey) {
      setSiteKey(bakedSiteKey);
      return;
    }
    let cancelled = false;
    fetch('/api/auth/public-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        if (cancelled) return;
        const runtimeKey = String(cfg?.turnstileSiteKey || '').trim();
        setSiteKey(runtimeKey || DEFAULT_TEST_SITE_KEY);
      })
      .catch(() => {
        if (!cancelled) setSiteKey(DEFAULT_TEST_SITE_KEY);
      });
    return () => {
      cancelled = true;
    };
  }, [bakedSiteKey]);

  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
    onErrorRef.current = onError;
  }, [onVerify, onExpire, onError]);

  useEffect(() => {
    if (!siteKey) return;
    let isMounted = true;
    setStatus('loading');
    setErrorMsg('');

    const renderWidget = () => {
      if (!isMounted || !containerRef.current || !window.turnstile) return;
      try {
        if (widgetIdRef.current) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {}
          widgetIdRef.current = null;
        }
        containerRef.current.innerHTML = '';
        const id = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme,
          callback: (token: string) => {
            if (!isMounted) return;
            setStatus('verified');
            setErrorMsg('');
            onVerifyRef.current(token);
          },
          'expired-callback': () => {
            if (!isMounted) return;
            setStatus('expired');
            setErrorMsg('Security verification expired. Please verify again.');
            onVerifyRef.current('');
            onExpireRef.current?.();
          },
          'error-callback': (errCode?: string) => {
            if (!isMounted) return;
            setStatus('error');
            const msg = `Turnstile verification error${errCode ? ` (${errCode})` : ''}. Please refresh the challenge.`;
            setErrorMsg(msg);
            onVerifyRef.current('');
            onErrorRef.current?.(msg);
          }
        });
        widgetIdRef.current = id;
        setStatus('ready');
      } catch (err: any) {
        if (!isMounted) return;
        setStatus('error');
        setErrorMsg('Could not initialize security challenge.');
      }
    };

    const existingScript = document.querySelector('script[data-turnstile-script="true"]') as HTMLScriptElement | null;
    if (window.turnstile) {
      renderWidget();
    } else if (existingScript) {
      const checkInterval = window.setInterval(() => {
        if (window.turnstile) {
          window.clearInterval(checkInterval);
          renderWidget();
        }
      }, 150);
      return () => {
        isMounted = false;
        window.clearInterval(checkInterval);
      };
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.setAttribute('data-turnstile-script', 'true');
      script.onload = () => {
        renderWidget();
      };
      script.onerror = () => {
        if (!isMounted) return;
        setStatus('error');
        setErrorMsg('Unable to load Cloudflare Turnstile security widget. Check your internet connection.');
        onErrorRef.current?.('Turnstile script load failed');
      };
      document.head.appendChild(script);
    }

    return () => {
      isMounted = false;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, action, theme, resetKey]);

  const handleManualReset = () => {
    setErrorMsg('');
    onVerifyRef.current('');
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
        setStatus('ready');
      } catch {}
    }
  };

  return (
    <div className={`w-full ${className}`} data-testid="turnstile-widget-container">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 font-semibold">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className={`w-4 h-4 ${status === 'verified' ? 'text-emerald-600' : 'text-blue-600'}`} />
            Cloudflare Turnstile Protection
          </span>
          {(status === 'verified' || status === 'expired' || status === 'error') && (
            <button
              type="button"
              onClick={handleManualReset}
              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-bold cursor-pointer"
              title="Reset verification challenge"
            >
              <RefreshCw className="w-3 h-3" /> Reset
            </button>
          )}
        </div>

        <div ref={containerRef} className="min-h-[65px] flex items-center justify-center overflow-x-auto" />

        {errorMsg && (
          <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TurnstileWidget;
