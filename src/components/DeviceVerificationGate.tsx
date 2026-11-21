import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  Mail,
  Monitor,
  MapPin,
  Globe,
  RefreshCw,
  LogOut,
  AlertCircle,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

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
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(
    deviceVerificationMeta?.resendCooldownSeconds ?? 60
  );

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    setResendCooldown(deviceVerificationMeta?.resendCooldownSeconds ?? 60);
  }, [deviceVerificationMeta?.sessionId]);

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
    if (!user) return;
    if (codeValue.length !== 6) {
      setError('Please enter all 6 digits of your security code.');
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionId: targetSessionId,
          code: codeValue,
          trustDevice
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
      setError('Network error while verifying security code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!user || resendCooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    setStatusMessage(null);

    try {
      const token = await user.getIdToken();
      const targetSessionId = deviceVerificationMeta?.sessionId || sessionId;
      const res = await fetch('/api/auth/resend-device-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ sessionId: targetSessionId })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        setError(body?.error || 'Unable to resend code right now.');
        if (typeof body?.retryAfterSeconds === 'number') {
          setResendCooldown(body.retryAfterSeconds);
        }
        return;
      }

      setDigits(['', '', '', '', '', '']);
      setResendCooldown(body?.resendCooldownSeconds ?? 60);
      setStatusMessage('A fresh 6-digit verification code has been sent to your registered email.');
      inputRefs.current[0]?.focus();
    } catch {
      setError('Network error while requesting a new security code.');
    } finally {
      setResending(false);
    }
  };

  const reasonBadgeText =
    deviceVerificationMeta?.reason === 'NEW_LOCATION'
      ? 'New Location Detected'
      : deviceVerificationMeta?.reason === 'DEVICE_MISMATCH'
        ? 'Browser / Device Profile Changed'
        : 'New Browser or Device Detected';

  const roleLabel = userRole === 'admin' ? 'Administrator Account' : 'Teacher Account';

  return (
    <div className="min-h-screen bg-[#06182C] bg-gradient-to-br from-[#041C2E] via-[#0A2540] to-[#0F172A] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Institutional Header */}
        <div className="bg-[#0A2540] px-6 py-5 border-b-4 border-[#F1C40F] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-[#F1C40F]">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white tracking-wide">
                SHIKSHANTAR ACADEMY
              </h1>
              <p className="text-xs text-slate-300 font-medium">
                {roleLabel} &bull; Security Verification
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-400/20 text-amber-200 border border-amber-300/30">
            <Lock className="w-3 h-3" />
            2-Step Gate
          </span>
        </div>

        <div className="p-6 sm:p-7">
          <div className="mb-5">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md mb-2.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {reasonBadgeText}
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              Verify this sign-in to continue
            </h2>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              We sent a 6-digit security code to{' '}
              <span className="font-semibold text-slate-900">
                {deviceVerificationMeta?.maskedEmail || 'your registered email'}
              </span>{' '}
              from{' '}
              <span className="font-mono text-xs bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded">
                {deviceVerificationMeta?.senderEmail || 'securityalerts@shikshantaracademy.edu.np'}
              </span>
              .
            </p>
          </div>

          {/* Detected Sign-In Context */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="flex items-start gap-2">
              <Monitor className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-slate-500 font-medium">Browser &amp; OS</div>
                <div className="text-slate-900 font-semibold">
                  {deviceVerificationMeta?.browser || 'Browser'} &bull;{' '}
                  {deviceVerificationMeta?.os || 'Device'}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-slate-500 font-medium">Approx. Location</div>
                <div className="text-slate-900 font-semibold">
                  {deviceVerificationMeta?.location || 'Detected Network'}
                </div>
              </div>
            </div>
            {deviceVerificationMeta?.ipAddress && (
              <div className="flex items-start gap-2 sm:col-span-2 pt-1.5 border-t border-slate-200/80">
                <Globe className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-500 font-medium">IP Address:</span>
                  <span className="font-mono text-slate-800 font-semibold">
                    {deviceVerificationMeta.ipAddress}
                  </span>
                </div>
              </div>
            )}
          </div>

          {deviceVerificationMeta?.emailDispatched === false && (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <Mail className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <span>
                Email delivery encountered a temporary delay. Please click <strong>Resend Code</strong> after a moment if the code does not arrive in your inbox or spam folder.
              </span>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {statusMessage && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{statusMessage}</span>
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                Enter 6-Digit Security Code
              </label>
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
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    onPaste={handlePaste}
                    aria-label={`Security code digit ${idx + 1}`}
                    className="h-12 sm:h-14 text-center text-xl sm:text-2xl font-extrabold font-mono text-[#0A2540] bg-white border-2 border-slate-300 rounded-xl focus:border-[#0A3D62] focus:ring-2 focus:ring-[#0A3D62]/20 outline-none transition-all"
                  />
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Code expires in 10 minutes. You can paste the full 6-digit code directly.
              </p>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer select-none bg-slate-50 border border-slate-200 rounded-xl p-3">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0A3D62] focus:ring-[#0A3D62]"
              />
              <span className="text-xs text-slate-700 leading-snug">
                <strong className="text-slate-900 block">Trust this browser for 30 days</strong>
                Future sign-ins from this browser &amp; location will skip verification automatically.
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting || codeValue.length !== 6}
              className="w-full py-3 px-4 rounded-xl bg-[#0A3D62] hover:bg-[#041C2E] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Verifying Code...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Verify &amp; Continue to Portal
                </>
              )}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || resending}
              className="inline-flex items-center gap-1.5 font-semibold text-[#0A3D62] hover:text-[#041C2E] disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
              {resendCooldown > 0
                ? `Resend code in ${resendCooldown}s`
                : resending
                  ? 'Sending new code...'
                  : 'Resend 6-digit code'}
            </button>

            <button
              type="button"
              onClick={() => logout('device_verification_cancelled')}
              className="inline-flex items-center gap-1.5 font-semibold text-slate-600 hover:text-red-700 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Cancel &amp; Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
