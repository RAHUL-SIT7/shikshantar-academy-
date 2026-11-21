import React, { useEffect } from 'react';
import { AlertTriangle, LogOut, Save, ShieldAlert, X, Loader2 } from 'lucide-react';
import { ModalPortal } from '../common/ModalPortal';

export interface WorkflowExitConfirmModalProps {
  isOpen: boolean;
  workflowName: string;
  contextSummary?: string;
  targetDestination?: string;
  hasUnsavedChanges: boolean;
  canSaveDraft?: boolean;
  isSavingDraft?: boolean;
  onStay: () => void;
  onSaveAndLeave?: () => Promise<void> | void;
  onConfirmExit: () => void;
}

export const WorkflowExitConfirmModal: React.FC<WorkflowExitConfirmModalProps> = ({
  isOpen,
  workflowName,
  contextSummary,
  targetDestination,
  hasUnsavedChanges,
  canSaveDraft = false,
  isSavingDraft = false,
  onStay,
  onSaveAndLeave,
  onConfirmExit,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSavingDraft) {
        onStay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSavingDraft, onStay]);

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-exit-modal-title"
      >
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`p-2.5 rounded-xl border shrink-0 ${
                    hasUnsavedChanges
                      ? 'bg-rose-50 text-rose-600 border-rose-200'
                      : 'bg-amber-50 text-amber-600 border-amber-200'
                  }`}
                >
                  {hasUnsavedChanges ? (
                    <ShieldAlert className="w-5 h-5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3
                    id="workflow-exit-modal-title"
                    className="text-base font-bold text-slate-900 leading-snug"
                  >
                    {hasUnsavedChanges
                      ? 'Unsaved Result Work — Confirm Exit'
                      : 'Exit Active Result Workflow?'}
                  </h3>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">
                    {workflowName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSavingDraft}
                onClick={onStay}
                aria-label="Stay in workflow"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {contextSummary && (
              <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
                Active Task: <span className="text-slate-900">{contextSummary}</span>
              </div>
            )}

            <p className="text-xs text-slate-600 leading-relaxed">
              {hasUnsavedChanges ? (
                <>
                  You have <strong className="text-rose-700">unsaved marks or setup changes</strong> in your
                  current result preparation task. Leaving now
                  {targetDestination ? ` to open ${targetDestination}` : ''} will{' '}
                  <strong className="text-slate-900">permanently discard</strong> all unsaved progress.
                </>
              ) : (
                <>
                  You are currently inside an active result preparation workspace. Are you sure you
                  want to close this task
                  {targetDestination ? (
                    <>
                      {' '}
                      and switch to <strong className="text-slate-900">{targetDestination}</strong>
                    </>
                  ) : (
                    ''
                  )}
                  ? Any unsubmitted task view will be closed.
                </>
              )}
            </p>
          </div>

          <div className="px-5 py-3.5 sm:px-6 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={isSavingDraft}
              onClick={onStay}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              {hasUnsavedChanges ? 'Stay & Continue' : 'Stay in Workflow'}
            </button>

            {hasUnsavedChanges && canSaveDraft && onSaveAndLeave && (
              <button
                type="button"
                disabled={isSavingDraft}
                onClick={onSaveAndLeave}
                className="px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isSavingDraft ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" /> Save Draft &amp; Exit
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              disabled={isSavingDraft}
              onClick={onConfirmExit}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold text-white inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                hasUnsavedChanges
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-slate-900 hover:bg-slate-800'
              }`}
            >
              <LogOut className="w-3.5 h-3.5" />
              {hasUnsavedChanges ? 'Discard & Exit' : 'Exit & Continue'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
