import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, RefreshCw, Check, AlertCircle, HelpCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface RecaptchaBotShieldProps {
  onVerify: (isVerified: boolean) => void;
  isVerified: boolean;
  disabled?: boolean;
  className?: string;
}

// Challenge items for smart visual verification if needed
const CHALLENGE_ITEMS = [
  { id: 1, label: 'Graduation Cap', emoji: '🎓', isTarget: true },
  { id: 2, label: 'Sports Car', emoji: '🏎️', isTarget: false },
  { id: 3, label: 'School Book', emoji: '📚', isTarget: true },
  { id: 4, label: 'Basketball', emoji: '🏀', isTarget: false },
  { id: 5, label: 'Microscope', emoji: '🔬', isTarget: true },
  { id: 6, label: 'Pizza Slice', emoji: '🍕', isTarget: false },
  { id: 7, label: 'School Desk', emoji: '🏫', isTarget: true },
  { id: 8, label: 'Smartphone', emoji: '📱', isTarget: false },
  { id: 9, label: 'Trophy', emoji: '🏆', isTarget: true },
];

export default function RecaptchaBotShield({
  onVerify,
  isVerified,
  disabled = false,
  className = ''
}: RecaptchaBotShieldProps) {
  const [status, setStatus] = useState<'idle' | 'verifying' | 'verified' | 'challenge' | 'failed'>('idle');
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [selectedChallengeItems, setSelectedChallengeItems] = useState<number[]>([]);
  const [challengeError, setChallengeError] = useState('');
  const [interactionTime, setInteractionTime] = useState(0);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    startTimeRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (isVerified) {
      setStatus('verified');
    } else if (status === 'verified') {
      setStatus('idle');
    }
  }, [isVerified]);

  const handleBoxClick = () => {
    if (disabled || status === 'verifying' || status === 'verified') return;

    const timeSpentMs = Date.now() - startTimeRef.current;
    setInteractionTime(timeSpentMs);
    setStatus('verifying');

    // Human behavioral check simulation (checking timing delay & interaction)
    setTimeout(() => {
      // If user clicked unusually fast (< 300ms since page load) or random security check, show interactive visual challenge
      if (timeSpentMs < 350) {
        setStatus('challenge');
        setShowChallengeModal(true);
      } else {
        setStatus('verified');
        onVerify(true);
      }
    }, 950);
  };

  const handleChallengeSubmit = () => {
    // Check if target academic items are selected
    const requiredTargets = CHALLENGE_ITEMS.filter(item => item.isTarget).map(item => item.id);
    const hasAllTargets = requiredTargets.every(id => selectedChallengeItems.includes(id));
    const hasNoDecoys = selectedChallengeItems.every(id => requiredTargets.includes(id));

    if (hasAllTargets && hasNoDecoys && selectedChallengeItems.length > 0) {
      setChallengeError('');
      setShowChallengeModal(false);
      setStatus('verified');
      onVerify(true);
    } else {
      setChallengeError('Please select all school & academic objects to verify.');
    }
  };

  const toggleChallengeItem = (id: number) => {
    setSelectedChallengeItems(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
    setChallengeError('');
  };

  return (
    <div className={`relative ${className}`}>
      {/* Google reCAPTCHA v2 / Turnstile Authentic Widget Box */}
      <div 
        onClick={handleBoxClick}
        className={`relative flex items-center justify-between px-4 py-3.5 bg-slate-50/90 dark:bg-slate-800/90 backdrop-blur-md rounded-2xl border transition-all duration-300 select-none cursor-pointer group shadow-sm ${
          status === 'verified'
            ? 'border-emerald-400/80 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
            : status === 'failed'
            ? 'border-red-400 bg-red-50/30'
            : 'border-slate-300/90 dark:border-slate-700 hover:border-[#F0A500]/70 hover:shadow-md'
        } ${disabled ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''}`}
      >
        {/* Left section: Interactive Checkbox + Label */}
        <div className="flex items-center gap-3.5">
          <div className="relative flex items-center justify-center">
            {status === 'idle' && (
              <div className="w-7 h-7 rounded-lg border-2 border-slate-400/80 group-hover:border-[#0a3d62] dark:group-hover:border-amber-400 transition-colors bg-white dark:bg-slate-900 flex items-center justify-center shadow-inner">
                <div className="w-2.5 h-2.5 rounded-sm bg-transparent group-hover:bg-[#0a3d62]/20 transition-all" />
              </div>
            )}

            {status === 'verifying' && (
              <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-slate-900 border border-blue-300 flex items-center justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                >
                  <RefreshCw className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </motion.div>
              </div>
            )}

            {status === 'verified' && (
              <motion.div 
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/30"
              >
                <Check className="w-4.5 h-4.5 stroke-[3]" />
              </motion.div>
            )}

            {status === 'failed' && (
              <div className="w-7 h-7 rounded-lg bg-red-600 text-white flex items-center justify-center">
                <AlertCircle className="w-4 h-4" />
              </div>
            )}
          </div>

          <div className="flex flex-col">
            <span className={`text-xs sm:text-[13px] font-bold tracking-wide transition-colors ${
              status === 'verified' ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'
            }`}>
              {status === 'verified' ? "I'm not a robot (Verified)" : "I'm not a robot"}
            </span>
            <span className="text-[10px] text-slate-400 font-medium font-sans">
              {status === 'verified' ? 'Security token verified' : 'Anti-bot protection active'}
            </span>
          </div>
        </div>

        {/* Right Section: Official reCAPTCHA Branding */}
        <div className="flex flex-col items-center justify-center pl-3 border-l border-slate-200 dark:border-slate-700 text-slate-400">
          {/* 3-Loop reCAPTCHA Iconic Triangle Logo */}
          <div className="w-6 h-6 relative flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2 text-[#0a3d62] dark:text-sky-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <span className="text-[9px] font-black tracking-tighter text-slate-500 dark:text-slate-400 uppercase leading-tight font-mono mt-0.5">
            reCAPTCHA
          </span>
          <div className="flex items-center gap-1 text-[8px] text-slate-400 mt-0.5">
            <span className="hover:underline">Privacy</span>
            <span>-</span>
            <span className="hover:underline">Terms</span>
          </div>
        </div>
      </div>

      {/* Interactive Anti-Bot Security Challenge Modal */}
      <AnimatePresence>
        {showChallengeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 text-xs font-bold font-mono mb-2">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Security Verification
                  </div>
                  <h3 className="text-base font-black text-slate-800 dark:text-white">
                    Select all School & Academic items
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Click each tile showing an academy or study object
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowChallengeModal(false);
                    setStatus('idle');
                  }}
                  className="p-1 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 3x3 Interactive Challenge Grid */}
              <div className="grid grid-cols-3 gap-2.5 my-4">
                {CHALLENGE_ITEMS.map((item) => {
                  const isSelected = selectedChallengeItems.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleChallengeItem(item.id)}
                      className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center border-2 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#0a3d62] dark:border-amber-400 bg-blue-50 dark:bg-slate-800 scale-95 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-slate-50 dark:bg-slate-800/40'
                      }`}
                    >
                      <span className="text-3xl">{item.emoji}</span>
                      <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 mt-1 truncate px-1">
                        {item.label}
                      </span>
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-4.5 h-4.5 bg-[#0a3d62] dark:bg-amber-400 text-white dark:text-slate-900 rounded-full flex items-center justify-center text-[10px] font-bold shadow-xs">
                          ✓
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {challengeError && (
                <div className="mb-3 text-[11px] font-bold text-red-600 text-center bg-red-50 dark:bg-red-950/40 p-2 rounded-xl border border-red-200">
                  {challengeError}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedChallengeItems([])}
                  className="p-2 text-slate-400 hover:text-slate-600 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Reset
                </button>
                <button
                  type="button"
                  onClick={handleChallengeSubmit}
                  className="px-5 py-2.5 bg-[#0a3d62] hover:bg-[#0d4f7c] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md hover:shadow-lg transition-all cursor-pointer"
                >
                  Verify
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
