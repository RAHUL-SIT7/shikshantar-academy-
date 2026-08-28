import React, { useState, useEffect, useRef } from 'react';
import { Timer, AlertTriangle, LogOut, ShieldCheck, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

interface SessionTimeoutHandlerProps {
  isAuthenticated: boolean;
}

const INACTIVITY_TIMEOUT = 8 * 60 * 1000; // 8 minutes of inactivity
const WARNING_THRESHOLD = 2 * 60 * 1000;  // 2 minutes warning countdown
const STORAGE_KEY_LAST_ACTIVITY = 'shikshantar_last_activity';

export default function SessionTimeoutHandler({ isAuthenticated }: SessionTimeoutHandlerProps) {
  const [showWarning, setShowWarning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(120); // 120 seconds warning countdown
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Reset inactivity timestamp on user action and synchronize to localStorage
  const resetInactivity = () => {
    const now = Date.now();
    lastActivityRef.current = now;
    try {
      localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, now.toString());
    } catch (e) {
      // Ignore storage errors
    }
  };

  const handleAutoLogout = async () => {
    setShowWarning(false);
    try {
      localStorage.removeItem(STORAGE_KEY_LAST_ACTIVITY);
      localStorage.removeItem('userRole');
      localStorage.removeItem('studentId');
      localStorage.removeItem('studentClass');
      await signOut(auth);
      window.location.href = '/login?reason=expired';
    } catch (err) {
      console.error('Auto logout error:', err);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setShowWarning(false);
      localStorage.removeItem(STORAGE_KEY_LAST_ACTIVITY);
      return;
    }

    // Check if user was already inactive before this page/tab was opened
    const storedLastActivityStr = localStorage.getItem(STORAGE_KEY_LAST_ACTIVITY);
    const now = Date.now();

    if (storedLastActivityStr) {
      const storedLastActivity = parseInt(storedLastActivityStr, 10);
      if (!isNaN(storedLastActivity)) {
        const elapsedSinceLastActivity = now - storedLastActivity;
        if (elapsedSinceLastActivity >= INACTIVITY_TIMEOUT) {
          // User was inactive for too long while the tab/browser was closed
          handleAutoLogout();
          return;
        } else {
          lastActivityRef.current = storedLastActivity;
        }
      } else {
        resetInactivity();
      }
    } else {
      resetInactivity();
    }

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    
    // Throttle updating localStorage so we don't spam localStorage on every mousemove/scroll
    let lastThrottledUpdate = 0;
    const handleActivity = () => {
      const currentTime = Date.now();
      lastActivityRef.current = currentTime;
      if (currentTime - lastThrottledUpdate > 2000) {
        lastThrottledUpdate = currentTime;
        try {
          localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, currentTime.toString());
        } catch (e) {}
      }
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Handle tab visibility change / focus (e.g. user comes back to this tab or opens browser again)
    const handleVisibilityOrFocusChange = () => {
      const checkNow = Date.now();
      const savedTimeStr = localStorage.getItem(STORAGE_KEY_LAST_ACTIVITY);
      const savedTime = savedTimeStr ? parseInt(savedTimeStr, 10) : lastActivityRef.current;
      
      if (!isNaN(savedTime)) {
        const elapsed = checkNow - savedTime;
        if (elapsed >= INACTIVITY_TIMEOUT) {
          handleAutoLogout();
        } else if (elapsed < INACTIVITY_TIMEOUT - WARNING_THRESHOLD) {
          // Still active, hide warning if it was shown
          setShowWarning(false);
        }
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityOrFocusChange);
    window.addEventListener('focus', handleVisibilityOrFocusChange);

    // Periodically check inactivity status every second
    timerRef.current = setInterval(() => {
      const currentTime = Date.now();
      const savedTimeStr = localStorage.getItem(STORAGE_KEY_LAST_ACTIVITY);
      const effectiveLastActivity = savedTimeStr ? Math.max(lastActivityRef.current, parseInt(savedTimeStr, 10) || 0) : lastActivityRef.current;
      const elapsed = currentTime - effectiveLastActivity;

      if (elapsed >= INACTIVITY_TIMEOUT) {
        handleAutoLogout();
      } else if (elapsed >= INACTIVITY_TIMEOUT - WARNING_THRESHOLD) {
        if (!showWarning) {
          const remainingSecs = Math.max(0, Math.floor((INACTIVITY_TIMEOUT - elapsed) / 1000));
          setTimeLeft(remainingSecs);
          setShowWarning(true);
        }
      }
    }, 1000);

    // Global testing function hook
    (window as any).triggerSessionTimeoutWarning = () => {
      const fakeTime = Date.now() - (INACTIVITY_TIMEOUT - 30 * 1000);
      lastActivityRef.current = fakeTime;
      localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, fakeTime.toString());
      setTimeLeft(30);
      setShowWarning(true);
    };

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      window.removeEventListener('visibilitychange', handleVisibilityOrFocusChange);
      window.removeEventListener('focus', handleVisibilityOrFocusChange);
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      delete (window as any).triggerSessionTimeoutWarning;
    };
  }, [isAuthenticated, showWarning]);

  // Countdown clock timer logic when warning modal is active
  useEffect(() => {
    if (showWarning) {
      countdownRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!);
            handleAutoLogout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    }

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [showWarning]);

  const handleKeepSignedIn = async () => {
    setIsRefreshing(true);
    try {
      if (auth.currentUser) {
        await auth.currentUser.getIdToken(true);
      }
      resetInactivity();
      setShowWarning(false);
    } catch (error) {
      console.error('Failed to refresh auth session:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleManualLogout = async () => {
    setShowWarning(false);
    try {
      localStorage.removeItem(STORAGE_KEY_LAST_ACTIVITY);
      localStorage.removeItem('userRole');
      localStorage.removeItem('studentId');
      localStorage.removeItem('studentClass');
      await signOut(auth);
      window.location.href = '/login?reason=manual';
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const warningSecondsTotal = WARNING_THRESHOLD / 1000;
  const progressPercent = Math.min(100, Math.max(0, (timeLeft / warningSecondsTotal) * 100));

  return (
    <AnimatePresence>
      {showWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={handleKeepSignedIn}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-amber-100 overflow-hidden z-10"
          >
            <div className="h-2 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 w-full" />

            <div className="p-6 md:p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0 animate-pulse">
                  <Timer className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-gray-900 tracking-tight">Session Expiring Soon</h3>
                  <p className="text-xs text-gray-500 font-medium">Your session will automatically expire due to inactivity.</p>
                </div>
              </div>

              <div className="bg-amber-50/60 rounded-2xl p-5 border border-amber-100/50 mb-6 text-center">
                <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1.5 flex items-center justify-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Auto-logout countdown
                </p>
                <div className="text-4xl font-black text-gray-900 tracking-tight font-mono">
                  {formatTime(timeLeft)}
                </div>
                
                <div className="w-full bg-gray-200 h-1.5 rounded-full mt-4 overflow-hidden">
                  <motion.div 
                    className="bg-amber-500 h-full rounded-full"
                    style={{ width: `${progressPercent}%` }}
                    transition={{ ease: 'linear', duration: 0.2 }}
                  />
                </div>
              </div>

              <div className="text-xs text-gray-600 leading-relaxed font-semibold mb-6 flex gap-2">
                <span className="text-amber-500">🛡️</span>
                <span>
                  To protect your educational records, results, and billing info, Shikshantar Academy logs out inactive sessions automatically.
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={handleKeepSignedIn}
                  disabled={isRefreshing}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-75 cursor-pointer"
                >
                  {isRefreshing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  {isRefreshing ? 'Refreshing session...' : 'Keep Me Signed In'}
                </button>

                <button
                  type="button"
                  onClick={handleManualLogout}
                  className="w-full bg-white hover:bg-gray-50 text-gray-700 font-bold text-sm py-2.5 px-4 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-gray-400" />
                  Sign Out Now
                </button>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-center">
                <span className="text-[10px] text-gray-400 font-mono">
                  Session security enforced by Shikshantar Cloud
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
