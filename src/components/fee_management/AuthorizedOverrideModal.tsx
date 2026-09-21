import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert, KeyRound, X, Check, Loader2, AlertTriangle } from 'lucide-react';

interface AuthorizedOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, overridePasscode: string) => void;
  studentCount: number;
  monthsText: string;
}

export default function AuthorizedOverrideModal({
  isOpen,
  onClose,
  onConfirm,
  studentCount,
  monthsText
}: AuthorizedOverrideModalProps) {
  const [reason, setReason] = useState('');
  const [passcode, setPasscode] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a mandatory justification reason for this override.');
      return;
    }
    if (!passcode.trim()) {
      setError('Please enter administrative override authorization code or PIN.');
      return;
    }
    if (!confirmed) {
      setError('Please check the confirmation box acknowledging this action is audited.');
      return;
    }
    setError('');
    onConfirm(reason.trim(), passcode.trim());
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-amber-200 space-y-5 animate-in zoom-in-95 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 uppercase tracking-wide">
              Authorized Billing Override
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Generates an explicit supplementary/override charge with strict audit logging.
            </p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-950">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Target: {studentCount} student(s) for {monthsText}</span>
          </div>
          <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
            Standard billing prevents duplicate generation. Use this override ONLY when generating an official supplementary fee or approved duplicate billing.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
              Mandatory Justification Reason *
            </label>
            <textarea
              required
              rows={2}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g., Re-enrollment adjustment, board approved supplementary charge..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-1 focus:ring-amber-500 font-medium"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
              Admin Authorization Passcode / PIN *
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={passcode}
                onChange={e => setPasscode(e.target.value)}
                placeholder="Enter PIN (e.g. 1234 or admin password)"
                className="w-full px-3 py-2 pl-9 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-1 focus:ring-amber-500 font-medium"
              />
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>

          <label className="flex items-start gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="w-4 h-4 text-amber-600 rounded border-slate-300 mt-0.5 cursor-pointer"
            />
            <span className="text-[11px] text-slate-700 font-semibold leading-snug">
              I certify that this supplementary billing is authorized by School Management and will be recorded in the audit trail.
            </span>
          </label>

          {error && (
            <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer shadow-md"
            >
              Confirm & Allow Override
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
