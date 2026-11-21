import React from 'react';
import { AlertTriangle, X, CheckCircle2, Ban, Hash, Save } from 'lucide-react';
import { ModalPortal } from '../common/ModalPortal';

export interface EmptyCellInfo {
  studentId: string;
  studentName: string;
  rollNo: string;
  subjectCode: string;
  subjectName: string;
  component: 'TH' | 'PR';
}

interface EmptyCellsModalProps {
  isOpen: boolean;
  mode: 'DRAFT' | 'SUBMIT';
  emptyCells: EmptyCellInfo[];
  onClose: () => void;
  onMarkAllAbsent: () => void;
  onFillAllZero: () => void;
  onKeepEmptyAndSaveDraft?: () => void;
}

export const EmptyCellsModal: React.FC<EmptyCellsModalProps> = ({
  isOpen,
  mode,
  emptyCells,
  onClose,
  onMarkAllAbsent,
  onFillAllZero,
  onKeepEmptyAndSaveDraft,
}) => {
  if (!isOpen || emptyCells.length === 0) return null;

  const uniqueStudents = new Set(emptyCells.map((c) => c.studentId)).size;

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="empty-cells-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4 bg-amber-50 border-b border-amber-200">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="empty-cells-modal-title" className="text-base font-bold text-slate-900">
                {emptyCells.length} Empty Mark {emptyCells.length === 1 ? 'Cell' : 'Cells'} Detected
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Across {uniqueStudents} eligible {uniqueStudents === 1 ? 'student' : 'students'} —{' '}
                {mode === 'SUBMIT'
                  ? 'Submission requires every cell to have a valid numeric mark (0 to Full Marks) or AB.'
                  : 'Empty cells are never auto-converted to 0. Choose how to handle them.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-amber-100/70 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nepal CDC / NEB Policy Explanation */}
        <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs text-slate-700 space-y-2">
            <p className="font-semibold text-slate-900">
              Nepal CDC / NEB Examination Marking Policy
            </p>
            <ul className="space-y-1.5 list-disc pl-4">
              <li>
                <span className="font-semibold text-slate-900">Empty Cell (Missing):</span>{' '}
                Treated as <em>not yet entered</em> — never silently saved as <code className="px-1 py-0.5 bg-slate-200 rounded">0</code>. Blocks Subject Submission and Result Publication.
              </li>
              <li>
                <span className="font-semibold text-slate-900">0 (Zero Score):</span>{' '}
                Valid numeric score for a student who appeared but scored 0. Because 0 is below the independent 35% component pass threshold, the subject receives <strong>NG</strong> and overall GPA becomes <strong>-</strong>.
              </li>
              <li>
                <span className="font-semibold text-rose-700">AB (Absent):</span>{' '}
                Student was absent for that component. Under Nepal CDC / NEB standards, <strong>AB</strong> marks the subject as <strong>NG (Non-Graded)</strong>, resulting in overall status <strong>NG</strong> and overall GPA displayed as <strong>-</strong>.
              </li>
            </ul>
          </div>

          {/* List of empty cells */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-100 px-3.5 py-2 text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex justify-between">
              <span>Pending Empty Cells</span>
              <span>Showing {Math.min(emptyCells.length, 50)} of {emptyCells.length}</span>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
              {emptyCells.slice(0, 50).map((cell, idx) => (
                <div
                  key={`${cell.studentId}-${cell.subjectCode}-${cell.component}-${idx}`}
                  className="px-3.5 py-2 text-xs flex items-center justify-between gap-2 bg-white hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-slate-900">{cell.studentName}</span>
                    {cell.rollNo && (
                      <span className="ml-2 text-slate-500">Roll: {cell.rollNo}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-slate-600 truncate max-w-[160px]">{cell.subjectName}</span>
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold text-[11px]">
                      {cell.component}
                    </span>
                  </div>
                </div>
              ))}
              {emptyCells.length > 50 && (
                <div className="px-3.5 py-2 text-xs text-slate-500 text-center bg-slate-50">
                  + {emptyCells.length - 50} more empty cells
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors"
          >
            Go Back &amp; Fill Manually
          </button>

          {mode === 'DRAFT' && onKeepEmptyAndSaveDraft && (
            <button
              type="button"
              onClick={onKeepEmptyAndSaveDraft}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              Save Draft (Keep Missing)
            </button>
          )}

          <button
            type="button"
            onClick={onFillAllZero}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-slate-800 bg-slate-200 hover:bg-slate-300 transition-colors"
          >
            <Hash className="w-3.5 h-3.5" />
            Fill Empty as 0
          </button>

          <button
            type="button"
            onClick={onMarkAllAbsent}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors"
          >
            <Ban className="w-3.5 h-3.5" />
            Mark Empty as AB (Absent)
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};
