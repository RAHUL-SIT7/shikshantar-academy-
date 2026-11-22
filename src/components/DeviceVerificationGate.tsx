import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  Monitor,
  MapPin,
  RefreshCw,
  LogOut,
  AlertCircle,
  CheckCircle2,
  MailWarning
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type DeliveryState = 'sent' | 'failed' | 'unconfigured';

export default function DeviceVerificationGate() {
  const {
    user,
    userRole,
    sessionId,
    deviceVerificationMeta,
    completeDeviceVerification,
    logout
  } = useAuth();

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [trustDevice, setTrustDevice] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [deliveryState, setDeliveryState] = useState<DeliveryState>(() => {
    if (deviceVerificationMeta?.smtpNotConfigured) return 'unconfigured';
    if (deviceVerificationMeta?.emailDispatched === false) return 'failed';
    return 'sent';
  });
  const [deliveryHint, setDeliveryHint] = useState<string>(
    deviceVerificationMeta?.emailErrorHint || ''
  );
  const [activeSenderEmail, setActiveSenderEmail] = useState<string>(
    deviceVerificationMeta?.senderEmail || 'securityalerts@shikshantaracademy.edu.np'
  );
  const [resendCooldown, setResendCooldown] = useState<number>(
    deviceVerificationMeta?.resendCooldownSeconds ?? 60
  );
  const [activeChallengeToken, setActiveChallengeToken] = useState<string>(
    deviceVerificationMeta?.challengeToken || ''
  );

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    setResendCooldown(deviceVerificationMeta?.resendCooldownSeconds ?? 60);
    if (deviceVerificationMeta?.challengeToken) {
      setActiveChallengeToken(deviceVerificationMeta.challengeToken);
    }
    if (deviceVerificationMeta?.senderEmail) {
      setActiveSenderEmail(deviceVerificationMeta.senderEmail);
    }
    if (deviceVerificationMeta?.smtpNotConfigured) {
      setDeliveryState('unconfigured');
    } else if (deviceVerificationMeta?.emailDispatched === false) {
      setDeliveryState('failed');
    } else {
      setDeliveryState('sent');
    }
    setDeliveryHint(deviceVerificationMeta?.emailErrorHint || '');
  }, [
    deviceVerificationMeta?.sessionId,
    deviceVerificationMeta?.challengeToken,
    deviceVerificationMeta?.emailDispatched,
    deviceVerificationMeta?.smtpNotConfigured,
    deviceVerificationMeta?.emailErrorHint,
    deviceVerificationMeta?.senderEmail,
    deviceVerificationMeta?.resendCooldownSeconds
  ]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const codeValue = digits.join('');

  const handleDigitChange = (index: number, rawValue: string) => {
    const cleaned = rawValue.replace(/\D/g, '');
    setError(null);

    if (!cleaned) {
      const next = [...digits];
      next[index] = '';
      setDigits(next);
      return;
    }

    if (cleaned.length > 1) {
      const next = [...digits];
      for (let i = 0; i < cleaned.length && index + i < 6; i++) {
        next[index + i] = cleaned[i];
      }
      setDigits(next);
      const focusIdx = Math.min(5, index + cleaned.length);
      inputRefs.current[focusIdx]?.focus();
      return;
    }

    const next = [...digits];
    next[index] = cleaned;
    setDigits(next);
    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setDigits(next);
    setError(null);
    inputRefs.current[Math.min(5, pasted.length)]?.focus();
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || submitting || signingOut) return;
    if (codeValue.length !== 6) {
      setError('Please enter all 6 digits of your verification code.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setStatusMessage(null);

    try {
      const token = await user.getIdToken();
      const targetSessionId = deviceVerificationMeta?.sessionId || sessionId;
      const res = await fetch('/api/auth/verify-device-otp', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionId: targetSessionId,
          code: codeValue,
          trustDevice,
          challengeToken: activeChallengeToken || deviceVerificationMeta?.challengeToken || ''
        })
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        setError(body?.error || 'Verification failed. Please check the code and try again.');
        if (body?.locked) {
          setDigits(['', '', '', '', '', '']);
        }
        return;
      }

      completeDeviceVerification(body?.deviceTrustToken || null);
    } catch {
      setError('Network error while verifying your code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!user || resendCooldown > 0 || resending || signingOut) return;
    setResending(true);
    setError(null);
    setStatusMessage(null);

    try {
      const token = await user.getIdToken();
      const targetSessionId = deviceVerificationMeta?.sessionId || sessionId;
      const res = await fetch('/api/auth/resend-device-otp', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionId: targetSessionId,
          challengeToken: activeChallengeToken || deviceVerificationMeta?.challengeToken || ''
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        setError(body?.error || 'Unable to resend code right now.');
        if (typeof body?.retryAfterSeconds === 'number') {
          setResendCooldown(body.retryAfterSeconds);
        }
        return;
      }

      if (typeof body?.challengeToken === 'string' && body.challengeToken) {
        setActiveChallengeToken(body.challengeToken);
      }
      if (typeof body?.senderEmail === 'string' && body.senderEmail) {
        setActiveSenderEmail(body.senderEmail);
      }
      setDigits(['', '', '', '', '', '']);
      setResendCooldown(body?.resendCooldownSeconds ?? 60);

      if (body?.smtpNotConfigured) {
        setDeliveryState('unconfigured');
        setDeliveryHint(
          body?.emailErrorHint ||
            'Outbound email delivery is not configured on this server yet.'
        );
      } else if (body?.emailDispatched === false) {
        setDeliveryState('failed');
        setDeliveryHint(
          body?.emailErrorHint ||
            'Email delivery failed on the mail server. Please check SMTP credentials or retry shortly.'
        );
      } else {
        setDeliveryState('sent');
        setDeliveryHint('');
        setStatusMessage('A fresh 6-digit verification code has been sent to your inbox.');
      }
      inputRefs.current[0]?.focus();
    } catch {
      setError('Network error while requesting a new verification code.');
    } finally {
      setResending(false);
    }
  };

  const handleCancelAndSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);
    setStatusMessage(null);
    try {
      await logout('device_verification_cancelled');
    } finally {
      setSigningOut(false);
    }
  };

  const reasonText =
    deviceVerificationMeta?.reason === 'NEW_LOCATION'
      ? 'New location detected'
      : deviceVerificationMeta?.reason === 'DEVICE_MISMATCH'
        ? 'Browser profile changed'
        : 'New browser detected';

  const roleLabel =
    userRole === 'admin'
      ? 'Administrator Security'
      : userRole === 'teacher'
        ? 'Faculty Security'
        : 'Student Security';

  const maskedRecipient = deviceVerificationMeta?.maskedEmail || 'your registered email';

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-4 py-6 sm:py-10">
      <div className="w-full max-w-[464px] bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        {/* Subtle institutional top rule */}
        <div className="h-1 bg-[#0A2540]" />

        <div className="p-6 sm:p-8">
          {/* Genuine School Brand Header */}
          <div className="flex items-center gap-3.5 pb-5 border-b border-slate-100">
            <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200/80 p-1.5 flex items-center justify-center shrink-0">
              {!logoFailed ? (
                <img
                  src="/logo.png"
                  alt="Shikshantar Academy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <span className="font-display text-sm font-bold text-[#0A2540]">SA</span>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-[17px] font-bold text-[#0A2540] leading-tight">
                Shikshantar Academy
              </h1>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                Karjanha Municipality, Bastipur-05, Siraha
              </p>
            </div>
          </div>

          {/* Title & Context */}
          <div className="mt-5">
            <p className="text-xs font-semibold text-slate-500 tracking-wide">
              {roleLabel} &middot; {reasonText}
            </p>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-1">
              Verify your sign-in
            </h2>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              {deliveryState === 'unconfigured' ? (
                <>
                  A 6-digit code is required for{' '}
                  <span className="font-semibold text-slate-900">{maskedRecipient}</span>, but
                  outbound email is not configured on this server.
                </>
              ) : deliveryState === 'failed' ? (
                <>
                  We attempted to send a 6-digit code to{' '}
                  <span className="font-semibold text-slate-900">{maskedRecipient}</span>, but the
                  mail server could not deliver it.
                </>
              ) : (
                <>
                  Enter the 6-digit code sent to{' '}
                  <span className="font-semibold text-slate-900">{maskedRecipient}</span> from{' '}
                  <span className="font-mono text-xs text-slate-800">{activeSenderEmail}</span>.
                </>
              )}
            </p>
          </div>

          {/* Clean Hairline Context Strip (no nested box) */}
          <div className="mt-4 py-3 border-y border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
              <Monitor className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {deviceVerificationMeta?.browser || 'Browser'} &middot;{' '}
              {deviceVerificationMeta?.os || 'Device'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {deviceVerificationMeta?.location || 'Detected Network'}
            </span>
            {deviceVerificationMeta?.ipAddress && (
              <span className="font-mono tabular-nums text-[11px] text-slate-500">
                IP {deviceVerificationMeta.ipAddress}
              </span>
            )}
          </div>

          {/* Single Honest Status / Error Slot (never renders contradictory alerts together) */}
          {error ? (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200/80 text-xs text-red-800 flex items-start gap-2 leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          ) : deliveryState === 'unconfigured' ? (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200/80 text-xs text-red-800 flex items-start gap-2 leading-relaxed">
              <MailWarning className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>
                {deliveryHint ||
                  'Configure RESEND_API_KEY or SMTP_HOST, SMTP_USER, and SMTP_PASSWORD on this server so verification codes can be delivered.'}
              </span>
            </div>
          ) : deliveryState === 'failed' ? (
            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200/90 text-xs text-amber-900 flex items-start gap-2 leading-relaxed">
              <MailWarning className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <span>
                {deliveryHint ||
                  'Email delivery could not complete right now. Please click Resend code below or check your mail server settings.'}
              </span>
            </div>
          ) : statusMessage ? (
            <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200/80 text-xs text-emerald-800 flex items-start gap-2 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{statusMessage}</span>
            </div>
          ) : null}

          {/* 6-Digit Verification Form */}
          <form onSubmit={handleVerify} className="mt-5 space-y-5">
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <label className="text-xs font-semibold text-slate-700">
                  6-digit verification code
                </label>
                <span className="text-[11px] text-slate-400">Valid for 10 min</span>
              </div>
              <div className="grid grid-cols-6 gap-2 sm:gap-2.5">
                {digits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                    maxLength={6}
                    value={digit}
                    disabled={submitting || signingOut}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    onPaste={handlePaste}
                    aria-label={`Verification code digit ${idx + 1}`}
                    className="h-12 sm:h-13 text-center text-xl font-bold font-mono tabular-nums text-[#0A2540] bg-white border border-slate-300 rounded-xl focus:border-[#0A2540] focus:ring-2 focus:ring-[#0A2540]/15 outline-none transition-all disabled:bg-slate-50"
                  />
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={trustDevice}
                disabled={submitting || signingOut}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0A2540] focus:ring-[#0A2540]"
              />
              <span className="text-xs text-slate-600 leading-relaxed">
                <span className="font-semibold text-slate-800">Trust this browser for 30 days.</span>{' '}
                Skip verification on future sign-ins from this browser.
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting || signingOut || codeValue.length !== 6}
              className="w-full py-2.5 px-4 rounded-xl bg-[#0A2540] hover:bg-[#06182C] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Verify &amp; Continue
                </>
              )}
            </button>
          </form>

          {/* Footer Actions */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || resending || signingOut}
              className="inline-flex items-center gap-1.5 font-semibold text-[#0A2540] hover:text-[#06182C] disabled:text-slate-400 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
              {resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : resending
                  ? 'Sending...'
                  : 'Resend code'}
            </button>

            <button
              type="button"
              onClick={handleCancelAndSignOut}
              disabled={signingOut}
              className="inline-flex items-center gap-1.5 font-semibold text-slate-500 hover:text-red-700 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {signingOut ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Signing out...
                </>
              ) : (
                <>
                  <LogOut className="w-3.5 h-3.5" />
                  Cancel &amp; Sign Out
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-slate-400 text-center">
        Protected portal sign-in &middot; Shikshantar Academy, Siraha
      </p>
    </div>
  );
}
