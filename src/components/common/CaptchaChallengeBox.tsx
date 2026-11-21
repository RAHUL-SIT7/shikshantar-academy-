import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react';

interface CaptchaChallengeBoxProps {
  onVerified: (verificationToken: string) => void;
  onReset?: () => void;
  className?: string;
}

export default function CaptchaChallengeBox({ onVerified, onReset, className = '' }: CaptchaChallengeBoxProps) {
  const [question, setQuestion] = useState<string>('');
  const [challengeToken, setChallengeToken] = useState<string>('');
  const [answer, setAnswer] = useState<string>('');
  const [loadingChallenge, setLoadingChallenge] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [verifiedToken, setVerifiedToken] = useState<string | null>(null);
  const [error, setError] = useState<string>('');

  const onResetRef = React.useRef(onReset);
  onResetRef.current = onReset;

  const loadChallenge = useCallback(async (isManualReset = false) => {
    setLoadingChallenge(true);
    setError('');
    setVerifiedToken(null);
    setAnswer('');
    if (isManualReset) {
      onResetRef.current?.();
    }
    try {
      const res = await fetch('/api/auth/verify-captcha');
      const data = await res.json();
      if (!res.ok || !data.challengeToken || !data.question) {
        throw new Error(data.error || 'Could not load security challenge.');
      }
      setQuestion(data.question);
      setChallengeToken(data.challengeToken);
    } catch (err: any) {
      setError(err?.message || 'Unable to load security verification.');
    } finally {
      setLoadingChallenge(false);
    }
  }, []);

  useEffect(() => {
    loadChallenge(false);
  }, [loadChallenge]);

  const handleVerify = async () => {
    if (!challengeToken || !answer.trim()) {
      setError('Please enter your answer.');
      return;
    }
    setVerifying(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken, answer: answer.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.verificationToken) {
        setError(data.error || 'Incorrect answer. Please try again.');
        setVerifying(false);
        return;
      }
      setVerifiedToken(data.verificationToken);
      onVerified(data.verificationToken);
    } catch (err: any) {
      setError(err?.message || 'Verification failed. Please retry.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-800/60 p-3.5 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
          <ShieldCheck className="w-4 h-4 text-primary" />
          Security Verification
        </span>
        <button
          type="button"
          onClick={() => loadChallenge(true)}
          disabled={loadingChallenge || verifying}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
          title="Load a new challenge"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingChallenge ? 'animate-spin' : ''}`} />
          New Challenge
        </button>
      </div>

      {verifiedToken ? (
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm font-semibold py-1">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Human verification complete</span>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-sm font-bold text-gray-900 dark:text-white select-none shrink-0">
            {loadingChallenge ? 'Loading...' : (question || 'Challenge unavailable')}
          </div>
          <input
            type="text"
            inputMode="numeric"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleVerify();
              }
            }}
            placeholder="Enter answer"
            aria-label="CAPTCHA answer"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="button"
            onClick={handleVerify}
            disabled={verifying || loadingChallenge || !challengeToken}
            className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 disabled:opacity-50 cursor-pointer shrink-0"
          >
            {verifying ? 'Checking...' : 'Verify'}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
