import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  ShieldAlert, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  UserCheck, 
  Loader2,
  Trash2,
  RotateCcw
} from 'lucide-react';
import { getCurrentAdminProfile, verifyCurrentAdminPassword, AdminSecurityProfile } from '../../lib/authSecurity';

export interface SecurityConfirmProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (authData: { adminName: string; adminEmail: string; reason: string }) => Promise<void> | void;
  title: string;
  actionDescription?: string;
  targetDetails?: {
    receiptOrId?: string;
    particulars?: string;
    amount?: number | string;
    date?: string;
    additionalInfo?: string;
  };
  confirmButtonText?: string;
  confirmButtonVariant?: 'danger' | 'warning' | 'primary';
  defaultReason?: string;
  reasonLabel?: string;
}

export default function SecurityPasswordConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  actionDescription,
  targetDetails,
  confirmButtonText = 'Confirm & Delete Permanently',
  confirmButtonVariant = 'danger',
  defaultReason = 'Administrative correction & record cleanup',
  reasonLabel = 'Reason / Justification for Deletion'
}: SecurityConfirmProps) {
  const [adminProfile, setAdminProfile] = useState<AdminSecurityProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [reason, setReason] = useState(defaultReason);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setErrorMsg('');
      setReason(defaultReason);
      setLoadingProfile(true);
      getCurrentAdminProfile()
        .then(profile => {
          setAdminProfile(profile);
          setLoadingProfile(false);
        })
        .catch(err => {
          console.error(err);
          setLoadingProfile(false);
        });
    }
  }, [isOpen, defaultReason]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg('Please enter your account password to authorize this action.');
      return;
    }
    if (!reason.trim()) {
      setErrorMsg('Please provide a brief reason for this administrative action.');
      return;
    }

    setVerifying(true);
    setErrorMsg('');

    try {
      const authResult = await verifyCurrentAdminPassword(password);
      if (!authResult.success) {
        setErrorMsg(authResult.error || 'Authentication failed. Incorrect password.');
        setVerifying(false);
        return;
      }

      const adminName = authResult.adminName || adminProfile?.displayName || 'Administrator';
      const adminEmail = authResult.adminEmail || adminProfile?.email || '';

      await onConfirm({
        adminName,
        adminEmail,
        reason: reason.trim()
      });

      onClose();
    } catch (err: any) {
      console.error('Security confirmation failed:', err);
      setErrorMsg(err.message || 'An unexpected error occurred while executing this action.');
    } finally {
      setVerifying(false);
    }
  };

  const isDanger = confirmButtonVariant === 'danger';
  const isWarning = confirmButtonVariant === 'warning';

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="bg-white max-w-lg w-full rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Security Header */}
        <div className={`p-5 sm:p-6 text-white ${isDanger ? 'bg-gradient-to-r from-rose-900 via-red-800 to-slate-900' : isWarning ? 'bg-gradient-to-r from-amber-900 via-orange-800 to-slate-900' : 'bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl ${isDanger ? 'bg-rose-500/20 text-rose-300 border border-rose-400/30' : isWarning ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30' : 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30'}`}>
                {isDanger ? <Trash2 className="w-6 h-6" /> : isWarning ? <RotateCcw className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 bg-white/10 px-2 py-0.5 rounded-full inline-block mb-1">
                  High Security Authorization
                </span>
                <h3 className="text-lg font-black text-white leading-tight">
                  {title}
                </h3>
              </div>
            </div>
            <button 
              onClick={onClose} 
              disabled={verifying}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
              title="Close Dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
          {/* Active Admin Session Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm shadow-xs">
                {(adminProfile?.displayName || 'Admin').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-slate-900">
                    {adminProfile?.displayName || 'Administrator'}
                  </span>
                  <span className="text-[9px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded border border-emerald-200">
                    Active Session
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-500 block">
                  {adminProfile?.email || 'admin@shikshantar.edu.np'}
                </span>
              </div>
            </div>
            <UserCheck className="w-5 h-5 text-emerald-600 shrink-0" />
          </div>

          {/* Action Context Box */}
          {targetDetails && (
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
                <span className="font-black text-amber-900 uppercase tracking-wider text-[10px]">
                  Target Record to Remove:
                </span>
                {targetDetails.receiptOrId && (
                  <span className="font-mono font-black text-amber-950 bg-amber-200/60 px-2 py-0.5 rounded">
                    {targetDetails.receiptOrId}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {targetDetails.particulars && (
                  <div>
                    <span className="text-amber-700 block text-[10px] font-bold">Particulars / Student</span>
                    <span className="font-black text-slate-900">{targetDetails.particulars}</span>
                  </div>
                )}
                {targetDetails.amount !== undefined && (
                  <div className="text-right">
                    <span className="text-amber-700 block text-[10px] font-bold">Amount</span>
                    <span className="font-black text-slate-900 font-mono">NRs. {Number(targetDetails.amount).toLocaleString()}</span>
                  </div>
                )}
              </div>
              {targetDetails.additionalInfo && (
                <p className="text-[11px] text-amber-900 font-medium italic pt-1 border-t border-amber-200/60">
                  {targetDetails.additionalInfo}
                </p>
              )}
            </div>
          )}

          {actionDescription && (
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              {actionDescription}
            </p>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="bg-rose-50 border-2 border-rose-300 text-rose-900 rounded-2xl p-3.5 text-xs flex items-start gap-2.5 animate-in shake">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-bold">
                {errorMsg}
              </div>
            </div>
          )}

          {/* Reason Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
              {reasonLabel} *
            </label>
            <input 
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Duplicate test record / Cash entry correction"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
              required
            />
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                Confirm Your Account Password *
              </label>
              <span className="text-[10px] text-slate-400 font-medium">
                Identity Verification
              </span>
            </div>
            <div className="relative">
              <input 
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={`Enter login password for ${adminProfile?.displayName || 'your account'}`}
                className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 border-2 border-slate-300 focus:border-rose-500 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-rose-100 outline-none transition-all font-mono"
                autoFocus
                required
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 font-medium">
              You must enter the password for your currently logged-in account (<strong>{adminProfile?.displayName || 'Rahul Sah'}</strong> / {adminProfile?.email}) to authenticate this destructive deletion.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button 
              type="button"
              onClick={onClose}
              disabled={verifying}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={verifying || !password.trim()}
              className={`px-5 py-2.5 text-white font-black rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 ${
                isDanger 
                  ? 'bg-rose-600 hover:bg-rose-700 active:scale-95 shadow-rose-200' 
                  : isWarning 
                  ? 'bg-amber-600 hover:bg-amber-700 active:scale-95 shadow-amber-200' 
                  : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-indigo-200'
              }`}
            >
              {verifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying Password...
                </>
              ) : (
                <>
                  {isDanger ? <Trash2 className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                  {confirmButtonText}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
