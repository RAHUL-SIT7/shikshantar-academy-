import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  RefreshCw, 
  CheckCircle2, 
  Wrench, 
  X, 
  Activity, 
  ChevronRight, 
  FileText, 
  Archive, 
  Scale
} from 'lucide-react';
import { db } from '../../firebase';
import { 
  auditStudentFinancials, 
  repairStudentFinancialRecords, 
  auditAllStudentsFinancials,
  StudentFinancialAuditResult 
} from '../../lib/financialReconciliation';

interface FinancialAuditRepairModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: any | null;
  allStudents?: any[];
  operatorName: string;
  onSuccess: () => void;
}

export const FinancialAuditRepairModal: React.FC<FinancialAuditRepairModalProps> = ({
  isOpen,
  onClose,
  student,
  allStudents = [],
  operatorName,
  onSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>(student ? 'single' : 'batch');
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [auditResult, setAuditResult] = useState<StudentFinancialAuditResult | null>(null);
  const [batchResults, setBatchResults] = useState<{
    totalAudited: number;
    healthyCount: number;
    discrepancyCount: number;
    problematicStudents: Array<{
      studentId: string;
      studentName: string;
      studentClass: string;
      discrepancyCount: number;
      discrepancies: Array<{ type: string; title: string; details: string }>;
    }>;
  } | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (student) {
        setActiveTab('single');
        runSingleAudit(student.id);
      } else {
        setActiveTab('batch');
        runBatchAudit();
      }
    } else {
      setAuditResult(null);
      setBatchResults(null);
      setActionMessage(null);
    }
  }, [isOpen, student]);

  const runSingleAudit = async (studentId: string) => {
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await auditStudentFinancials(db, studentId);
      setAuditResult(res);
    } catch (err: any) {
      console.error('Failed to run audit:', err);
      setActionMessage({
        type: 'error',
        text: err.message || 'Failed to complete financial ledger audit.'
      });
    } finally {
      setLoading(false);
    }
  };

  const runBatchAudit = async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      const studentIds = allStudents.map(s => s.id || s.studentId).filter(Boolean);
      const res = await auditAllStudentsFinancials(db, studentIds);
      setBatchResults(res);
    } catch (err: any) {
      console.error('Failed batch audit:', err);
      setActionMessage({
        type: 'error',
        text: err.message || 'Failed to audit student batch.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRepairSingle = async () => {
    if (!student && !auditResult) return;
    const sId = student?.id || auditResult?.studentId;
    if (!sId) return;

    setRepairing(true);
    setActionMessage(null);
    try {
      const repairRes = await repairStudentFinancialRecords(db, sId, operatorName);
      if (repairRes.success) {
        setActionMessage({
          type: 'success',
          text: repairRes.message
        });
        // Re-run audit to confirm health
        await runSingleAudit(sId);
        onSuccess();
      } else {
        setActionMessage({
          type: 'error',
          text: repairRes.message
        });
      }
    } catch (err: any) {
      console.error('Failed to repair student ledger:', err);
      setActionMessage({
        type: 'error',
        text: err.message || 'Failed to repair records. Check permissions or network.'
      });
    } finally {
      setRepairing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white px-6 py-5 flex items-center justify-between border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest bg-indigo-500/30 border border-indigo-400/30 px-2 py-0.5 rounded-full text-indigo-200">
                  Production Financial Logic Safety Layer
                </span>
              </div>
              <h3 className="text-lg font-black mt-0.5 tracking-tight">
                {student ? `Financial Audit: ${student.fullName || student.name}` : 'System Financial Audit & Reconciliation'}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
              title="Close Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation if allStudents is available */}
        {allStudents.length > 0 && (
          <div className="flex border-b border-gray-200 bg-gray-50/70 px-6 pt-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveTab('single');
                if (student) runSingleAudit(student.id);
              }}
              className={`pb-2.5 px-4 text-xs font-black uppercase tracking-wider transition-colors border-b-2 ${
                activeTab === 'single'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {student ? `${student.fullName || student.name} Audit` : 'Student Audit'}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('batch');
                if (!batchResults) runBatchAudit();
              }}
              className={`pb-2.5 px-4 text-xs font-black uppercase tracking-wider transition-colors border-b-2 ${
                activeTab === 'batch'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              Batch Scan ({allStudents.length} Students)
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          {actionMessage && (
            <div
              className={`p-4 rounded-2xl border text-xs font-bold flex items-start gap-2.5 animate-in fade-in duration-200 ${
                actionMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : actionMessage.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}
            >
              {actionMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">{actionMessage.text}</div>
            </div>
          )}

          {/* SINGLE STUDENT AUDIT TAB */}
          {activeTab === 'single' && (
            <div className="space-y-6">
              {loading ? (
                <div className="p-12 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
                  <p className="text-sm font-bold text-gray-600">
                    Auditing Firestore collections (studentFees, remitBills, transactions, advances)...
                  </p>
                </div>
              ) : auditResult ? (
                <>
                  {/* Status Banner */}
                  <div
                    className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      auditResult.isHealthy
                        ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                        : 'bg-amber-50/80 border-amber-200 text-amber-950'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-3 rounded-2xl shrink-0 ${
                          auditResult.isHealthy
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {auditResult.isHealthy ? (
                          <ShieldCheck className="w-7 h-7" />
                        ) : (
                          <AlertTriangle className="w-7 h-7" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-black text-base">
                          {auditResult.isHealthy
                            ? 'Financial Records Reconciled & 100% Intact'
                            : `${auditResult.discrepancies.length} Discrepancy Found in Database`}
                        </h4>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {auditResult.isHealthy
                            ? 'Zero duplicate records, no overpaid items, and all payments strictly match billing heads.'
                            : 'Legacy duplicated documents or overlapping Remit Bills detected requiring safe alignment.'}
                        </p>
                      </div>
                    </div>

                    {!auditResult.isHealthy && (
                      <button
                        type="button"
                        onClick={handleRepairSingle}
                        disabled={repairing}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 shrink-0 shadow-sm active:scale-95 disabled:opacity-50"
                      >
                        {repairing ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Wrench className="w-4 h-4" />
                        )}
                        <span>{repairing ? 'Repairing Records...' : 'Run Auto-Repair'}</span>
                      </button>
                    )}
                  </div>

                  {/* Financial Metrics Matrix */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-gray-50 border border-gray-200/80 p-3.5 rounded-2xl">
                      <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 block">Total Billed</span>
                      <span className="font-mono font-black text-gray-900 text-base mt-0.5 block">
                        NRs. {(auditResult?.totalBilled ?? 0).toLocaleString()}
                      </span>
                      <span className="text-[9px] text-gray-400">Sum of all valid bill items</span>
                    </div>

                    <div className="bg-emerald-50/60 border border-emerald-200/70 p-3.5 rounded-2xl">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">Total Paid</span>
                      <span className="font-mono font-black text-emerald-800 text-base mt-0.5 block">
                        NRs. {(auditResult?.totalPaid ?? 0).toLocaleString()}
                      </span>
                      <span className="text-[9px] text-emerald-600">Settled towards dues</span>
                    </div>

                    <div className="bg-red-50/60 border border-red-200/70 p-3.5 rounded-2xl">
                      <span className="text-[10px] font-black uppercase tracking-wider text-red-800 block">Outstanding Due</span>
                      <span className="font-mono font-black text-red-800 text-base mt-0.5 block">
                        NRs. {(auditResult?.totalOutstanding ?? 0).toLocaleString()}
                      </span>
                      <span className="text-[9px] text-red-600">Billed minus Paid</span>
                    </div>

                    <div className="bg-blue-50/60 border border-blue-200/70 p-3.5 rounded-2xl">
                      <span className="text-[10px] font-black uppercase tracking-wider text-blue-800 block">Total Cash Logged</span>
                      <span className="font-mono font-black text-blue-800 text-base mt-0.5 block">
                        NRs. {(auditResult?.totalTransactionsAmount ?? 0).toLocaleString()}
                      </span>
                      <span className="text-[9px] text-blue-600">Physical receipts total</span>
                    </div>
                  </div>

                  {/* Discrepancies Detailed List */}
                  {auditResult.discrepancies.length > 0 ? (
                    <div className="space-y-3">
                      <h5 className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600" /> Detected Discrepancies Details
                      </h5>
                      <div className="space-y-2">
                        {auditResult.discrepancies.map((disc, idx) => (
                          <div
                            key={idx}
                            className="bg-white border border-amber-200 rounded-xl p-3.5 flex items-start justify-between gap-3 shadow-2xs"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                                  {disc.type}
                                </span>
                                <span className="font-bold text-xs text-gray-900">{disc.title}</span>
                              </div>
                              <p className="text-xs text-gray-600">{disc.details}</p>
                              {disc.affectedDocId && (
                                <span className="text-[10px] font-mono text-gray-400 block">
                                  Document ID: {disc.affectedDocId}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg shrink-0">
                              Auto-Fixable
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-center text-xs text-gray-500 font-medium">
                      ✓ No database anomalies detected for this student ledger. All records strictly adhere to the Single Source of Truth architecture.
                    </div>
                  )}

                  {/* Remit Bills Overview */}
                  {auditResult.remitBillsSummary.length > 0 && (
                    <div className="space-y-2.5">
                      <h5 className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-indigo-600" /> Associated Remit Bills ({auditResult.remitBillsSummary.length})
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {auditResult.remitBillsSummary.map((b, idx) => (
                          <div
                            key={idx}
                            className="bg-white p-3 rounded-xl border border-gray-200 text-xs flex justify-between items-center shadow-2xs"
                          >
                            <div>
                              <p className="font-bold text-gray-900">{b.billNo}</p>
                              <p className="text-[10px] text-gray-500">{b.period} &bull; Total: NRs. {(b?.totalAmount ?? 0).toLocaleString()}</p>
                            </div>
                            <div className="text-right">
                              <span
                                className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                  b.status === 'paid'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : b.status === 'partial'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {b.status}
                              </span>
                              <p className="text-[10px] font-mono text-gray-600 mt-0.5">Due: NRs. {(b?.dueAmount ?? 0).toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-8 text-center text-gray-400 font-bold text-sm">
                  Please select a student to run the financial audit.
                </div>
              )}
            </div>
          )}

          {/* BATCH AUDIT TAB */}
          {activeTab === 'batch' && (
            <div className="space-y-6">
              {loading ? (
                <div className="p-12 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
                  <p className="text-sm font-bold text-gray-600">
                    Scanning all students across Firestore for financial consistency...
                  </p>
                </div>
              ) : batchResults ? (
                <>
                  {/* Batch Summary Strip */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-50 border border-gray-200 p-4 rounded-2xl text-center">
                      <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 block">Total Audited</span>
                      <span className="text-2xl font-black text-gray-900 mt-1 block">{batchResults.totalAudited}</span>
                    </div>

                    <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-center">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 block">100% Healthy</span>
                      <span className="text-2xl font-black text-emerald-700 mt-1 block">{batchResults.healthyCount}</span>
                    </div>

                    <div className={`p-4 rounded-2xl border text-center ${batchResults.discrepancyCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                      <span className={`text-[10px] font-black uppercase tracking-wider block ${batchResults.discrepancyCount > 0 ? 'text-amber-800' : 'text-gray-500'}`}>
                        Discrepancies
                      </span>
                      <span className={`text-2xl font-black mt-1 block ${batchResults.discrepancyCount > 0 ? 'text-amber-800' : 'text-gray-900'}`}>
                        {batchResults.discrepancyCount}
                      </span>
                    </div>
                  </div>

                  {/* Problematic Students List */}
                  {batchResults.problematicStudents.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h5 className="text-xs font-black uppercase tracking-wider text-gray-700">
                          Students Requiring Ledger Alignment ({batchResults.problematicStudents.length})
                        </h5>
                        <button
                          type="button"
                          onClick={runBatchAudit}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" /> Rescan
                        </button>
                      </div>

                      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                        {batchResults.problematicStudents.map(p => (
                          <div
                            key={p.studentId}
                            className="bg-white border border-gray-200 rounded-xl p-3.5 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors shadow-2xs"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-900 text-xs">{p.studentName}</span>
                                <span className="text-[10px] text-gray-500 font-semibold">Class {p.studentClass}</span>
                              </div>
                              <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                                {p.discrepancyCount} issue(s): {p.discrepancies.map(d => d.title).join(', ')}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={async () => {
                                setRepairing(true);
                                try {
                                  await repairStudentFinancialRecords(db, p.studentId, operatorName);
                                  await runBatchAudit();
                                  onSuccess();
                                } catch (e: any) {
                                  setActionMessage({ type: 'error', text: e.message || 'Repair failed.' });
                                } finally {
                                  setRepairing(false);
                                }
                              }}
                              disabled={repairing}
                              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1 shrink-0"
                            >
                              <Wrench className="w-3 h-3" /> Repair
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-emerald-700 font-bold text-sm bg-emerald-50 rounded-2xl border border-emerald-200">
                      ✨ All {batchResults.totalAudited} students in the database are 100% reconciled with zero discrepancies.
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-gray-500 font-medium">
            Operator: <strong className="text-gray-700">{operatorName || 'System Admin'}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl text-xs font-bold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
