import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Lock, 
  Mail, 
  User, 
  ArrowLeft, 
  Eye, 
  EyeOff,
  CheckCircle2,
  ShieldAlert,
  RotateCw,
  Check
} from 'lucide-react';
import { auth, db } from '../firebase';
import { 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  confirmPasswordReset,
  signOut
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import TurnstileWidget from '../components/common/TurnstileWidget';
import { useAuth } from '../contexts/AuthContext';

const LOCK_STORAGE_KEY = 'shikshantar_login_lock_until';

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const BOOTSTRAP_OWNER_EMAIL = 'rahulsah4534@gmail.com';

const logoUrl = "/logo.png";
const logoFallback = "/logo.png";

const ensureSafePassword = (pwd: string) => {
  if (pwd.length < 6) {
    return `${pwd}_shikshantar`;
  }
  return pwd;
};

type View = 'login' | 'forgot' | 'reset';

export default function Login({ setIsAuthenticated }: { setIsAuthenticated?: (val: boolean) => void }) {
  const { refreshProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<View>('login');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Server-verified Cloudflare Turnstile token + reset keys
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [forgotTurnstileResetKey, setForgotTurnstileResetKey] = useState(0);
  const [lockedUntilMs, setLockedUntilMs] = useState<number>(() => {
    try {
      const saved = Number(sessionStorage.getItem(LOCK_STORAGE_KEY) || 0);
      return saved > Date.now() ? saved : 0;
    } catch {
      return 0;
    }
  });
  const [lockRemainingSeconds, setLockRemainingSeconds] = useState<number>(() => {
    try {
      const saved = Number(sessionStorage.getItem(LOCK_STORAGE_KEY) || 0);
      return saved > Date.now() ? Math.ceil((saved - Date.now()) / 1000) : 0;
    } catch {
      return 0;
    }
  });
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [oobCode, setOobCode] = useState<string | null>(null);

  const usernameInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const applyLockoutUntil = (untilMs: number, customMsg?: string) => {
    const safeUntil = untilMs > Date.now() ? untilMs : Date.now() + 5 * 60 * 1000;
    setLockedUntilMs(safeUntil);
    setLockRemainingSeconds(Math.max(1, Math.ceil((safeUntil - Date.now()) / 1000)));
    setRemainingAttempts(0);
    try {
      sessionStorage.setItem(LOCK_STORAGE_KEY, String(safeUntil));
    } catch {}
    if (customMsg) {
      setError(customMsg);
    }
  };

  useEffect(() => {
    if (!lockedUntilMs || lockedUntilMs <= Date.now()) {
      setLockRemainingSeconds(0);
      try {
        sessionStorage.removeItem(LOCK_STORAGE_KEY);
      } catch {}
      return;
    }

    const tick = () => {
      const diff = lockedUntilMs - Date.now();
      if (diff <= 0) {
        setLockedUntilMs(0);
        setLockRemainingSeconds(0);
        setRemainingAttempts(null);
        setError('');
        try {
          sessionStorage.removeItem(LOCK_STORAGE_KEY);
        } catch {}
      } else {
        setLockRemainingSeconds(Math.ceil(diff / 1000));
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntilMs]);

  useEffect(() => {
    const mode = searchParams.get('mode');
    const code = searchParams.get('oobCode');
    if (mode === 'resetPassword' && code) {
      setOobCode(code);
      setView('reset');
    }
    
    const reason = searchParams.get('reason');
    if (reason === 'expired') {
      setError('Your session has expired due to inactivity. Please sign in again.');
    } else if (reason === 'manual') {
      setMessage('You have been signed out successfully.');
    } else if (reason === 'device_verification_cancelled') {
      setMessage('Device verification was cancelled. You have been signed out safely.');
    } else if (reason === 'device_verification_error') {
      setError('Device verification could not be completed. Please sign in again.');
    }
  }, [searchParams]);

  const handleContinueAsGuest = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('userRoleOverride');
    localStorage.setItem('isGuest', 'true');
    localStorage.removeItem('studentId');
    localStorage.removeItem('studentClass');
    localStorage.removeItem('adminSearchStudentId');
    localStorage.removeItem('teacherSubjects');
    setIsAuthenticated?.(false);
    navigate('/');
  };

  const resetLoginTurnstile = () => {
    setTurnstileToken('');
    setTurnstileResetKey(k => k + 1);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (lockRemainingSeconds > 0) {
      setError(`Account temporarily locked. Please wait ${formatCountdown(lockRemainingSeconds)} before trying again.`);
      return;
    }

    if (!turnstileToken) {
      setError('Please complete the Cloudflare Turnstile security verification before signing in.');
      return;
    }

    localStorage.removeItem('userRole');
    localStorage.removeItem('studentId');
    localStorage.removeItem('studentClass');
    localStorage.removeItem('adminSearchStudentId');
    localStorage.removeItem('isGuest');
    localStorage.removeItem('teacherSubjects');
    
    setLoading(true);

    try {
      const emailInput = email.trim();
      let emailToAuth = emailInput;

      if (!emailToAuth.includes('@')) {
        emailToAuth = `${emailToAuth.toLowerCase()}@shikshantar.edu.np`;
      }

      const cleanEmail = emailToAuth.trim().toLowerCase();

      // 1. Fail-closed server-side brute-force lockout & Cloudflare Turnstile verification gate
      try {
        const precheckRes = await fetch('/api/auth/login-precheck', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: cleanEmail,
            turnstileToken,
            action: 'login'
          })
        });
        const precheckData = await precheckRes.json().catch(() => ({}));
        if (precheckRes.status === 429 || precheckData.locked) {
          const untilMs = precheckData.lockedUntil
            ? Date.parse(precheckData.lockedUntil)
            : Date.now() + Number(precheckData.retryAfterSeconds || 300) * 1000;
          applyLockoutUntil(
            untilMs,
            precheckData.error || 'Account temporarily locked after 4 consecutive failed attempts. Please wait 5 minutes.'
          );
          resetLoginTurnstile();
          setLoading(false);
          return;
        }
        if (!precheckRes.ok || precheckData.allowed !== true) {
          if (precheckData.error) {
            setError(precheckData.error);
          } else if (precheckRes.status >= 500) {
            setError(`Login security service is temporarily unavailable (HTTP ${precheckRes.status}). Please wait a few seconds and try again.`);
          } else {
            setError('Cloudflare Turnstile security verification failed. Please verify again.');
          }
          resetLoginTurnstile();
          setLoading(false);
          return;
        }
      } catch {
        setError('Security verification service is unreachable. Login blocked for your protection. Please try again.');
        resetLoginTurnstile();
        setLoading(false);
        return;
      }

      // Keep Turnstile widget steady on success; reset only on auth failure/block branches below

      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      } catch (signInErr: any) {
        const errCode = String(signInErr?.code || '');
        if (errCode === 'auth/network-request-failed' || errCode === 'auth/too-many-requests') {
          throw signInErr;
        }

        const attempts = [
          ensureSafePassword(password),
          password.trim(),
          ensureSafePassword(password.trim()),
          password.replace(/_shikshantar$/, '')
        ].filter((p, idx, arr) => p !== password && arr.indexOf(p) === idx);

        let resolved = false;
        for (const candidate of attempts) {
          try {
            userCredential = await signInWithEmailAndPassword(auth, cleanEmail, candidate);
            resolved = true;
            break;
          } catch (fallbackErr: any) {
            const fbCode = String(fallbackErr?.code || '');
            if (fbCode === 'auth/network-request-failed' || fbCode === 'auth/too-many-requests') {
              throw fallbackErr;
            }
          }
        }
        if (!resolved) {
          try {
            const failRes = await fetch('/api/auth/login-attempt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ identifier: cleanEmail, outcome: 'FAILURE' })
            });
            const failData = await failRes.json().catch(() => ({}));
            if (failRes.status === 429 || failData.locked) {
              const untilMs = failData.lockedUntil
                ? Date.parse(failData.lockedUntil)
                : Date.now() + Number(failData.retryAfterSeconds || 300) * 1000;
              applyLockoutUntil(
                untilMs,
                failData.error || 'Account temporarily locked for 5 minutes after 4 consecutive failed password attempts.'
              );
              resetLoginTurnstile();
              setLoading(false);
              return;
            }
            if (typeof failData.remainingAttemptsBeforeCooldown === 'number') {
              setRemainingAttempts(failData.remainingAttemptsBeforeCooldown);
              setError(
                `Invalid username or password. ${failData.remainingAttemptsBeforeCooldown} attempt${failData.remainingAttemptsBeforeCooldown === 1 ? '' : 's'} remaining before temporary 5-minute lock.`
              );
              resetLoginTurnstile();
              setLoading(false);
              return;
            }
          } catch {
            // fall through to generic invalid credential error
          }
          throw signInErr;
        }
      }

      // Reset server-side failed login counter using verified Firebase ID token
      try {
        const idToken = await userCredential.user.getIdToken();
        const resetAttemptRes = await fetch('/api/auth/login-attempt', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ identifier: cleanEmail, outcome: 'SUCCESS' })
        });
        if (resetAttemptRes.status === 423) {
          const lockData = await resetAttemptRes.json().catch(() => ({}));
          await signOut(auth);
          const untilMs = lockData.lockedUntil
            ? Date.parse(lockData.lockedUntil)
            : Date.now() + Number(lockData.retryAfterSeconds || 300) * 1000;
          applyLockoutUntil(
            untilMs,
            lockData.error || 'Account is temporarily locked. Please wait before signing in.'
          );
          resetLoginTurnstile();
          setLoading(false);
          return;
        }
      } catch {
        // non-blocking
      }

      setRemainingAttempts(null);
      setLockedUntilMs(0);
      setLockRemainingSeconds(0);
      try {
        sessionStorage.removeItem(LOCK_STORAGE_KEY);
      } catch {}
      
      const userSnap = await getDoc(doc(db, 'users', userCredential.user.uid));
      const isVerifiedOwner =
        (userCredential.user.email || '').trim().toLowerCase() === BOOTSTRAP_OWNER_EMAIL &&
        userCredential.user.emailVerified === true;

      if (userSnap.exists()) {
        const userData = userSnap.data();
        const stUpper = String(userData.status || '').trim().toUpperCase();
        if (stUpper === 'PENDING') {
          await signOut(auth);
          setError('Invalid username or password.');
          resetLoginTurnstile();
          setLoading(false);
          return;
        }

        if (
          userData.deleted === true ||
          userData.active === false ||
          ['BLOCKED', 'REJECTED', 'SUSPENDED', 'INACTIVE', 'DELETED', 'ARCHIVED', 'AUTH_DELETED_PENDING_FINALIZATION', 'DELETION_PENDING'].includes(stUpper)
        ) {
          await signOut(auth);
          setError('Your account has been deactivated. Please contact school administration.');
          resetLoginTurnstile();
          setLoading(false);
          return;
        }

        if (!userData.role && !isVerifiedOwner) {
          await signOut(auth);
          setError('Invalid username or password.');
          resetLoginTurnstile();
          setLoading(false);
          return;
        }

        if (userData.children && userData.children.length > 0) {
          localStorage.setItem('studentId', userData.children[0].studentId);
        } else if (userData.studentId) {
          localStorage.setItem('studentId', userData.studentId);
        }
      } else if (!isVerifiedOwner) {
        await signOut(auth);
        setError('Invalid username or password.');
        resetLoginTurnstile();
        setLoading(false);
        return;
      }

      try {
        localStorage.setItem('shikshantar_last_activity', Date.now().toString());
      } catch {}

      await refreshProfile().catch(() => {});
      setIsAuthenticated?.(true);
      navigate('/');
    } catch (err: any) {
      if (
        err.code === 'auth/wrong-password' || 
        err.code === 'auth/user-not-found' || 
        err.code === 'auth/invalid-credential' || 
        err.code === 'auth/invalid-email' ||
        String(err.message).includes('auth/invalid-credential') ||
        String(err.message).includes('auth/user-not-found')
      ) {
         setError('Invalid username or password.');
      } else if (err.code === 'auth/too-many-requests' || String(err.message).includes('too-many-requests')) {
         setError('Access to this account has been temporarily disabled due to many failed login attempts. Please try again later.');
      } else if (err.code === 'auth/network-request-failed' || String(err.message).includes('network-request-failed')) {
         setError('Network connection failed. Please check your internet connection and try again.');
      } else {
         setError('Invalid username or password.');
      }
      resetLoginTurnstile();
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    
    const inputIdentifier = email.trim();
    if (!inputIdentifier) {
      setError('Please enter your username or registered email address.');
      return;
    }

    if (!turnstileToken) {
      setError('Please complete the Cloudflare Turnstile security verification before requesting a password reset.');
      return;
    }

    setLoading(true);
    try {
      let emailToSend = inputIdentifier;
      if (!emailToSend.includes('@')) {
        emailToSend = `${emailToSend.toLowerCase()}@shikshantar.edu.np`;
      }

      const resetCheckRes = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: emailToSend,
          turnstileToken
        })
      });
      const resetCheckData = await resetCheckRes.json().catch(() => ({}));
      setTurnstileToken('');
      setForgotTurnstileResetKey(k => k + 1);
      if (resetCheckRes.status === 429) {
        setError(resetCheckData.error || 'Password reset limit reached (maximum 2 requests per 5 minutes). Please wait before trying again.');
        setLoading(false);
        return;
      }
      if (!resetCheckRes.ok) {
        setError(resetCheckData.error || 'Security verification failed. Please complete Turnstile again.');
        setLoading(false);
        return;
      }

      await sendPasswordResetEmail(auth, emailToSend).catch(() => {});
      setMessage('If an authorized account exists for this identifier, password reset instructions have been sent.');
    } catch (err: any) {
      setTurnstileToken('');
      setForgotTurnstileResetKey(k => k + 1);
      if (err.code === 'auth/too-many-requests') {
        setError('Too many requests. Please try again later.');
      } else {
        setMessage('If an authorized account exists for this identifier, password reset instructions have been sent.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const validatePasswordRule = (pass: string) => {
      if (pass.length < 8) return 'Password must be at least 8 characters long.';
      if (!/[A-Z]/.test(pass)) return 'Password must contain at least one uppercase letter.';
      if (!/[a-z]/.test(pass)) return 'Password must contain at least one lowercase letter.';
      if (!/[0-9]/.test(pass)) return 'Password must contain at least one number.';
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(pass)) return 'Password must contain at least one special character.';
      return null;
    };

    const passwordValidationError = validatePasswordRule(password);
    if (passwordValidationError) {
      setError(passwordValidationError);
      return;
    }

    if (!oobCode) {
      setError('Invalid or missing password reset link.');
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, ensureSafePassword(password));
      setMessage('Password has been reset successfully! You can now log in.');
      setTimeout(() => {
        setView('login');
        setPassword('');
        setConfirmPassword('');
        setMessage('');
      }, 2500);
    } catch (err: any) {
      setError('Failed to reset password. The link might be expired or already used.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#06152b] text-slate-100 flex flex-col justify-center items-center relative overflow-x-hidden font-sans selection:bg-amber-500 selection:text-slate-900 py-8 px-4 sm:px-6">
      
      {/* ========================================================================= */}
      {/* LAYER 1: DEEP NAVY MATRIX BACKGROUND                                      */}
      {/* ========================================================================= */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#091f3d] via-[#06152b] to-[#020914] z-0 pointer-events-none" />
      
      {/* Dot Grid Pattern Overlay */}
      <div 
        className="absolute inset-0 z-0 opacity-25 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}
      />

      {/* Ambient Lighting Spheres */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-blue-500/15 blur-[140px] pointer-events-none z-0" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-amber-400/10 blur-[110px] pointer-events-none z-0" />

      {/* ========================================================================= */}
      {/* LAYER 2: SHIKSHANTAR ACADEMY EMBLEM AS PROMINENT WATERMARK BACKGROUND      */}
      {/* ========================================================================= */}
      <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
        <div className="relative w-[560px] h-[560px] sm:w-[680px] sm:h-[680px] lg:w-[760px] lg:h-[760px] flex items-center justify-center">
          {/* Subtle Ambient Halo behind Background Logo */}
          <div className="absolute inset-6 rounded-full bg-gradient-to-tr from-blue-600/20 via-amber-400/15 to-sky-400/20 blur-2xl pointer-events-none" />
          
          <img 
            src={logoUrl} 
            alt="Shikshantar Academy Background Crest" 
            className="w-full h-full object-contain filter drop-shadow-[0_0_80px_rgba(30,58,138,0.45)] opacity-[0.25]"
            onError={(e) => {
              const target = e.currentTarget;
              if (target.src !== logoFallback) {
                target.src = logoFallback;
              }
            }}
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* LAYER 3: MASTER LOGIN CARD                                                */}
      {/* ========================================================================= */}
      <div className="relative z-10 w-full max-w-[460px] sm:max-w-[490px] my-auto">
        
        {/* Outer Aura Glow Ring (Emerald / Sky / Amber Glow) */}
        <div 
          className="absolute -inset-1.5 rounded-[42px] bg-gradient-to-tr from-amber-400/40 via-sky-400/35 to-emerald-400/40 opacity-80 blur-xl pointer-events-none"
          aria-hidden="true"
        />

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="relative w-full rounded-[34px] sm:rounded-[38px] bg-white/95 backdrop-blur-2xl text-[#092b4c] p-7 sm:p-9 shadow-[0_30px_80px_rgba(0,0,0,0.65),0_0_60px_rgba(30,58,138,0.2)] border border-white overflow-hidden"
        >
          {/* Form Content */}
          <div className="relative z-10 flex flex-col">
            
            {/* Header School Logo & Identity Row */}
            <div className="flex items-center gap-3.5 mb-5">
              <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-white p-1.5 shadow-md border border-slate-200/90 shrink-0 flex items-center justify-center">
                <img 
                  src={logoUrl} 
                  alt="Shikshantar Academy Crest" 
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (target.src !== logoFallback) {
                      target.src = logoFallback;
                    }
                  }}
                />
              </div>
              <div className="flex flex-col">
                <h1 className="text-base sm:text-[17px] font-serif font-black tracking-wide text-[#092b4c] leading-[1.15]">
                  SHIKSHANTAR
                  <br />
                  ACADEMY
                </h1>
                <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 tracking-wider uppercase mt-0.5">
                  KARJANHA MUNICIPALITY, BASTIPUR -05, SIRAHA
                </p>
              </div>
            </div>

            {/* Title Section */}
            <div className="mb-5 text-left">
              <h2 className="text-2xl sm:text-[28px] font-serif font-black text-[#092b4c] tracking-tight leading-tight">
                {view === 'forgot' && 'Reset Password'}
                {view === 'reset' && 'Create New Password'}
                {view === 'login' && 'Welcome Back'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
                {view === 'login' && 'Sign in to access your academy portal securely'}
                {view === 'forgot' && 'Enter your username or email to receive password reset instructions.'}
                {view === 'reset' && 'Enter your new secure password below.'}
              </p>
            </div>

            {/* Feedback Messages & Lockout Countdown */}
            {lockRemainingSeconds > 0 && view === 'login' && (
              <div className="mb-4 p-3.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>Temporary security lockout active. Please wait before signing in again.</span>
                </div>
                <span className="font-mono text-sm font-black px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                  {formatCountdown(lockRemainingSeconds)}
                </span>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-xs">
                <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            {remainingAttempts !== null && remainingAttempts > 0 && remainingAttempts < 4 && lockRemainingSeconds === 0 && view === 'login' && (
              <div className="mb-4 px-3 py-2 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-[11px] font-semibold">
                Security Notice: {remainingAttempts} failed attempt{remainingAttempts === 1 ? '' : 's'} left before a 5-minute cooldown lock.
              </div>
            )}

            {message && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{message}</span>
              </div>
            )}

            {/* --- 1. LOGIN VIEW FORM --- */}
            {view === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                
                {/* USERNAME INPUT WITH REVOLVING MULTI-COLOR BORDER ON FOCUS */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 tracking-wider mb-1.5 uppercase">
                    USERNAME
                  </label>
                  
                  <div className="relative rounded-2xl p-[2px] overflow-hidden transition-all duration-300">
                    {/* Multi-color revolving gradient border when selected */}
                    {focusedField === 'username' ? (
                      <div 
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300%] h-[300%] animate-rainbow-spin pointer-events-none"
                        style={{
                          background: 'conic-gradient(from 0deg, #3b82f6, #06b6d4, #10b981, #f59e0b, #ef4444, #8b5cf6, #3b82f6)'
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 border border-slate-300 rounded-2xl pointer-events-none" />
                    )}

                    {/* Inner Input Card */}
                    <div className="relative flex items-center bg-white rounded-[14px] overflow-hidden z-10">
                      <div className="pl-4 pr-1 text-slate-400 flex items-center pointer-events-none">
                        <User className={`w-4.5 h-4.5 transition-colors ${focusedField === 'username' ? 'text-blue-600' : 'text-slate-400'}`} />
                      </div>
                      <input
                        ref={usernameInputRef}
                        type="text"
                        required
                        value={email}
                        onFocus={() => setFocusedField('username')}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full py-3.5 pr-4 pl-2 text-sm text-slate-800 font-medium bg-transparent border-0 focus:outline-none placeholder:text-slate-400"
                        placeholder="Enter Username"
                      />
                    </div>
                  </div>
                </div>

                {/* PASSWORD INPUT WITH REVOLVING MULTI-COLOR BORDER & BOLD CHARACTERS */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 tracking-wider mb-1.5 uppercase">
                    PASSWORD
                  </label>
                  
                  <div className="relative rounded-2xl p-[2px] overflow-hidden transition-all duration-300">
                    {/* Multi-color revolving gradient border when selected */}
                    {focusedField === 'password' ? (
                      <div 
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300%] h-[300%] animate-rainbow-spin pointer-events-none"
                        style={{
                          background: 'conic-gradient(from 0deg, #3b82f6, #06b6d4, #10b981, #f59e0b, #ef4444, #8b5cf6, #3b82f6)'
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 border border-slate-300 rounded-2xl pointer-events-none" />
                    )}

                    {/* Inner Input Card */}
                    <div className="relative flex items-center bg-white rounded-[14px] overflow-hidden z-10">
                      <div className="pl-4 pr-1 text-slate-400 flex items-center pointer-events-none">
                        <Lock className={`w-4.5 h-4.5 transition-colors ${focusedField === 'password' ? 'text-blue-600' : 'text-slate-400'}`} />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`w-full py-3.5 pr-11 pl-2 text-sm bg-transparent border-0 focus:outline-none placeholder:text-slate-400 ${
                          password.length > 0 
                            ? 'font-bold tracking-widest text-slate-900 text-base' 
                            : 'font-medium text-slate-800 text-sm'
                        }`}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 text-slate-400 hover:text-slate-600 focus:outline-none p-1 transition-colors cursor-pointer"
                        title={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* FORGOT PASSWORD LINK */}
                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setView('forgot');
                      setError('');
                      setMessage('');
                      setTurnstileToken('');
                      setForgotTurnstileResetKey(k => k + 1);
                    }}
                    className="text-xs font-semibold text-[#1d70b8] hover:text-[#0c4b8e] hover:underline transition-colors cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>

                {/* CLOUDFLARE TURNSTILE ANTI-BOT VERIFICATION */}
                <TurnstileWidget
                  action="login"
                  resetKey={turnstileResetKey}
                  onVerify={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken('')}
                  onError={() => setTurnstileToken('')}
                />

                {/* SIGN IN TO PORTAL BUTTON */}
                <button
                  type="submit"
                  disabled={loading || lockRemainingSeconds > 0}
                  className="w-full mt-2 py-3.5 px-6 rounded-2xl bg-gradient-to-b from-[#1c4b78] via-[#13375b] to-[#0d2847] hover:from-[#173e63] hover:to-[#0a1f38] text-white font-black text-sm tracking-wider uppercase flex items-center justify-center gap-2.5 shadow-lg shadow-[#0d2847]/35 hover:shadow-[#0d2847]/50 transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99] relative overflow-hidden"
                >
                  <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
                  <span>
                    {lockRemainingSeconds > 0
                      ? `LOCKED (${formatCountdown(lockRemainingSeconds)})`
                      : (loading ? 'AUTHENTICATING...' : 'SIGN IN TO PORTAL')}
                  </span>
                </button>

                {/* CONTINUE AS GUEST USER BUTTON */}
                <button
                  type="button"
                  onClick={handleContinueAsGuest}
                  className="w-full py-3.5 px-6 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-[#092b4c] text-xs sm:text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer active:scale-[0.99]"
                >
                  <User className="w-4 h-4 text-[#092b4c]" />
                  <span>CONTINUE AS GUEST USER</span>
                </button>

              </form>
            )}

            {/* --- 2. FORGOT PASSWORD VIEW --- */}
            {view === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 tracking-wider mb-1.5 uppercase">
                    USERNAME / EMAIL
                  </label>
                  <div className="relative rounded-2xl p-[2px] overflow-hidden transition-all duration-300">
                    {focusedField === 'forgot-email' ? (
                      <div 
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300%] h-[300%] animate-rainbow-spin pointer-events-none"
                        style={{
                          background: 'conic-gradient(from 0deg, #3b82f6, #06b6d4, #10b981, #f59e0b, #ef4444, #8b5cf6, #3b82f6)'
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 border border-slate-300 rounded-2xl pointer-events-none" />
                    )}
                    <div className="relative flex items-center bg-white rounded-[14px] overflow-hidden z-10">
                      <div className="pl-4 pr-1 text-slate-400 flex items-center pointer-events-none">
                        <Mail className="w-4.5 h-4.5" />
                      </div>
                      <input
                        type="text"
                        required
                        value={email}
                        onFocus={() => setFocusedField('forgot-email')}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full py-3.5 pr-4 pl-2 text-sm text-slate-800 font-medium bg-transparent border-0 focus:outline-none placeholder:text-slate-400"
                        placeholder="Enter your username or email"
                      />
                    </div>
                  </div>
                </div>

                <TurnstileWidget
                  action="password_reset"
                  resetKey={forgotTurnstileResetKey}
                  onVerify={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken('')}
                  onError={() => setTurnstileToken('')}
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-b from-[#1c4b78] to-[#0d2847] hover:from-[#173e63] hover:to-[#0a1f38] text-white font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <span>{loading ? 'SENDING INSTRUCTIONS...' : 'SEND RESET INSTRUCTIONS'}</span>
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setView('login');
                      setError('');
                      setMessage('');
                      setTurnstileToken('');
                      setTurnstileResetKey(k => k + 1);
                    }}
                    className="text-xs font-bold text-[#092b4c] hover:underline flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
                  </button>
                </div>
              </form>
            )}

            {/* --- 3. RESET PASSWORD VIEW --- */}
            {view === 'reset' && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 tracking-wider mb-1.5 uppercase">
                    NEW PASSWORD
                  </label>
                  <div className="relative rounded-2xl p-[2px] overflow-hidden transition-all duration-300">
                    {focusedField === 'new-pass' ? (
                      <div 
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300%] h-[300%] animate-rainbow-spin pointer-events-none"
                        style={{
                          background: 'conic-gradient(from 0deg, #3b82f6, #06b6d4, #10b981, #f59e0b, #ef4444, #8b5cf6, #3b82f6)'
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 border border-slate-300 rounded-2xl pointer-events-none" />
                    )}
                    <div className="relative flex items-center bg-white rounded-[14px] overflow-hidden z-10">
                      <div className="pl-4 pr-1 text-slate-400 flex items-center pointer-events-none">
                        <Lock className="w-4.5 h-4.5" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onFocus={() => setFocusedField('new-pass')}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`w-full py-3.5 pr-11 pl-2 text-sm bg-transparent border-0 focus:outline-none placeholder:text-slate-400 ${
                          password.length > 0 ? 'font-bold tracking-widest text-slate-900 text-base' : 'font-medium text-slate-800'
                        }`}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 text-slate-400 hover:text-slate-600 focus:outline-none p-1 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 tracking-wider mb-1.5 uppercase">
                    CONFIRM NEW PASSWORD
                  </label>
                  <div className="relative rounded-2xl p-[2px] overflow-hidden transition-all duration-300">
                    {focusedField === 'confirm-pass' ? (
                      <div 
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300%] h-[300%] animate-rainbow-spin pointer-events-none"
                        style={{
                          background: 'conic-gradient(from 0deg, #3b82f6, #06b6d4, #10b981, #f59e0b, #ef4444, #8b5cf6, #3b82f6)'
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 border border-slate-300 rounded-2xl pointer-events-none" />
                    )}
                    <div className="relative flex items-center bg-white rounded-[14px] overflow-hidden z-10">
                      <div className="pl-4 pr-1 text-slate-400 flex items-center pointer-events-none">
                        <Lock className="w-4.5 h-4.5" />
                      </div>
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        required
                        value={confirmPassword}
                        onFocus={() => setFocusedField('confirm-pass')}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`w-full py-3.5 pr-11 pl-2 text-sm bg-transparent border-0 focus:outline-none placeholder:text-slate-400 ${
                          confirmPassword.length > 0 ? 'font-bold tracking-widest text-slate-900 text-base' : 'font-medium text-slate-800'
                        }`}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3.5 text-slate-400 hover:text-slate-600 focus:outline-none p-1 cursor-pointer"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-b from-[#1c4b78] to-[#0d2847] hover:from-[#173e63] hover:to-[#0a1f38] text-white font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <span>{loading ? 'UPDATING PASSWORD...' : 'CHANGE PASSWORD'}</span>
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setView('login');
                      setError('');
                      setMessage('');
                    }}
                    className="text-xs font-bold text-[#092b4c] hover:underline flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
                  </button>
                </div>
              </form>
            )}

          </div>
        </motion.div>

      </div>

    </div>
  );
}
