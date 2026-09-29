import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Ban,
  FileSpreadsheet,
  Printer,
  Calendar,
  Layers,
  Info,
  RefreshCw,
  Eye,
  UserCheck
} from 'lucide-react';
import {
  getStudentBillingCoverage,
  NEPALI_MONTH_SEQUENCE,
  BillingCoverageSnapshot,
  BillingMonthCoverage
} from '../../lib/nepaliBillingCoverage';
import { formatBSDate } from '../../lib/nepaliDate';

interface BillingCoverageReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: any[];
  currentAcademicYear: string;
  remitBills: any[];
  billItems?: any[];
  initialStudentId?: string;
  onViewBillDetails?: (bill: any) => void;
  onOpenVoidModal?: (bill: any) => void;
}

export const BillingCoverageReconciliationModal: React.FC<BillingCoverageReconciliationModalProps> = ({
  isOpen,
  onClose,
  students,
  currentAcademicYear,
  remitBills,
  billItems = [],
  initialStudentId,
  onViewBillDetails,
  onOpenVoidModal
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    initialStudentId || (students[0]?.id || '')
  );
  const [academicYear, setAcademicYear] = useState<string>(currentAcademicYear || '2083');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'12_months' | 'fee_heads' | 'raw_bills'>('12_months');

  // Sync if initialStudentId changes
  React.useEffect(() => {
    if (initialStudentId) {
      setSelectedStudentId(initialStudentId);
    } else if (students.length > 0 && !selectedStudentId) {
      setSelectedStudentId(students[0]?.id || '');
    }
  }, [initialStudentId, students]);

  const selectedStudent = useMemo(() => {
    return students.find(s => s.id === selectedStudentId) || students[0];
  }, [students, selectedStudentId]);

  const snapshot: BillingCoverageSnapshot | null = useMemo(() => {
    if (!selectedStudent) return null;
    return getStudentBillingCoverage(selectedStudent, academicYear, remitBills, billItems);
  }, [selectedStudent, academicYear, remitBills, billItems]);

  const filteredStudents = useMemo(() => {
    if (!searchFilter.trim()) return students;
    const term = searchFilter.toLowerCase();
    return students.filter(s =>
      (s.fullName || s.name || '').toLowerCase().includes(term) ||
      (s.rollNumber || s.studentId || '').toLowerCase().includes(term) ||
      (s.class || '').toLowerCase().includes(term)
    );
  }, [students, searchFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="bg-[#1B4F72] text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black tracking-wide uppercase">
                  Billing Coverage Reconciliation
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-900 text-[10px] font-black uppercase tracking-wider">
                  Diagnostic Tool
                </span>
              </div>
              <p className="text-xs text-sky-100 font-medium">
                Authoritative single source of truth inspection across Student × Academic Year × Month × Fee Head
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Bar & Student Picker */}
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase text-slate-500 tracking-wider">
                Select Pupil:
              </span>
              <select
                value={selectedStudentId}
                onChange={e => setSelectedStudentId(e.target.value)}
                className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl font-bold text-slate-800 outline-none focus:border-[#1B4F72] cursor-pointer max-w-[240px]"
              >
                {filteredStudents.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.fullName || s.name} (Class {s.class}, Roll {s.rollNumber || s.studentId || 'N/A'})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase text-slate-500 tracking-wider">
                Academic Year:
              </span>
              <input
                type="text"
                value={academicYear}
                onChange={e => setAcademicYear(e.target.value)}
                placeholder="2083"
                className="w-20 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xl font-black text-slate-800 text-center outline-none focus:border-[#1B4F72]"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                placeholder="Quick find pupil..."
                className="pl-8 pr-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-medium text-slate-700 outline-none focus:border-[#1B4F72] w-48"
              />
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
          {snapshot ? (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                  <div className="text-[10px] font-black uppercase text-slate-400">Total Billed Months</div>
                  <div className="text-xl font-black text-slate-900 mt-1">
                    {snapshot.generatedMonthCount} <span className="text-xs font-bold text-slate-400">/ 12</span>
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 mt-0.5">
                    {snapshot.missingMonthCount} unbilled / missing
                  </div>
                </div>

                <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-3">
                  <div className="text-[10px] font-black uppercase text-emerald-700">Fully Paid Months</div>
                  <div className="text-xl font-black text-emerald-800 mt-1">
                    {snapshot.paidMonthCount}
                  </div>
                  <div className="text-[10px] font-bold text-emerald-600 mt-0.5">
                    {snapshot.partialMonthCount} partially paid
                  </div>
                </div>

                <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-3">
                  <div className="text-[10px] font-black uppercase text-blue-700">Total Charged</div>
                  <div className="text-xl font-black text-blue-900 mt-1">
                    NRs. {snapshot.totalChargedAmount.toLocaleString()}
                  </div>
                  <div className="text-[10px] font-bold text-blue-600 mt-0.5">
                    For {academicYear} BS
                  </div>
                </div>

                <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-3">
                  <div className="text-[10px] font-black uppercase text-amber-700">Outstanding Due</div>
                  <div className="text-xl font-black text-amber-900 mt-1">
                    NRs. {snapshot.totalOutstandingAmount.toLocaleString()}
                  </div>
                  <div className="text-[10px] font-bold text-amber-600 mt-0.5">
                    Collected: NRs. {snapshot.totalPaidAmount.toLocaleString()}
                  </div>
                </div>

                <div className="bg-purple-50/50 border border-purple-200 rounded-2xl p-3 col-span-2 sm:col-span-1">
                  <div className="text-[10px] font-black uppercase text-purple-700">Duplicate Protection</div>
                  <div className="text-sm font-black mt-1 flex items-center gap-1">
                    {snapshot.hasDuplicateActiveCharges ? (
                      <span className="text-rose-600 flex items-center gap-1 font-black">
                        <AlertTriangle className="w-4 h-4" /> Duplicate!
                      </span>
                    ) : (
                      <span className="text-emerald-700 flex items-center gap-1 font-black">
                        <CheckCircle2 className="w-4 h-4" /> Protected
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-bold text-purple-600 mt-0.5">
                    {snapshot.hasDuplicateActiveCharges ? `${snapshot.duplicateCharges.length} conflicts` : 'Zero overlaps'}
                  </div>
                </div>
              </div>

              {/* Duplicate Active Charge Alert */}
              {snapshot.hasDuplicateActiveCharges && (
                <div className="p-4 bg-rose-50 border-2 border-rose-400 rounded-2xl flex items-start gap-3 text-rose-900">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase tracking-wide">
                      Critical Notice: Duplicate Active Charges Detected
                    </h4>
                    <p className="text-xs font-medium">
                      Multiple active bills cover the same month and fee head for this student. Please void the redundant bill before generating any further billing.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {snapshot.duplicateCharges.map((dc, i) => (
                        <span key={i} className="px-2 py-0.5 bg-rose-200 text-rose-900 rounded text-[10px] font-black">
                          {dc.month}: {dc.feeHead} ({dc.bills.length} bills)
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* View Navigation Tabs */}
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('12_months')}
                  className={`px-3 py-1.5 text-xs font-black rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                    activeTab === '12_months'
                      ? 'bg-[#1B4F72] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  12-Month Coverage Matrix
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('fee_heads')}
                  className={`px-3 py-1.5 text-xs font-black rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'fee_heads'
                      ? 'bg-[#1B4F72] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Itemized Fee Heads Breakdown
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('raw_bills')}
                  className={`px-3 py-1.5 text-xs font-black rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'raw_bills'
                      ? 'bg-[#1B4F72] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Raw Associated Remit Bills ({snapshot.rawBills.length})
                </button>
              </div>

              {/* TAB 1: 12-Month Grid Table */}
              {activeTab === '12_months' && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          <th className="py-2.5 px-3">Seq / Month</th>
                          <th className="py-2.5 px-3">Billing Status</th>
                          <th className="py-2.5 px-3">Covering Bill No</th>
                          <th className="py-2.5 px-3">Fee Heads Charged</th>
                          <th className="py-2.5 px-3 text-right">Charged</th>
                          <th className="py-2.5 px-3 text-right">Paid</th>
                          <th className="py-2.5 px-3 text-right">Balance Due</th>
                          <th className="py-2.5 px-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {snapshot.months.map(m => {
                          let badgeBg = 'bg-slate-100 text-slate-600';
                          let statusLabel = 'NOT GENERATED';

                          if (m.monthStatus === 'PAID') {
                            badgeBg = 'bg-emerald-100 text-emerald-800';
                            statusLabel = 'PAID (100%)';
                          } else if (m.monthStatus === 'PARTIAL') {
                            badgeBg = 'bg-blue-100 text-blue-800';
                            statusLabel = 'PARTIAL PAYMENT';
                          } else if (m.monthStatus === 'GENERATED_DUE') {
                            badgeBg = 'bg-amber-100 text-amber-900 border border-amber-300';
                            statusLabel = 'GENERATED & DUE';
                          } else if (m.monthStatus === 'VOIDED') {
                            badgeBg = 'bg-rose-100 text-rose-800 line-through';
                            statusLabel = 'VOIDED';
                          }

                          return (
                            <tr key={m.monthId} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-2.5 px-3">
                                <span className="font-mono text-slate-400 font-bold mr-1.5">
                                  {String(m.monthSequence).padStart(2, '0')}
                                </span>
                                <span className="font-black text-slate-800">{m.monthName}</span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${badgeBg}`}>
                                  {statusLabel}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                {m.billNos.length > 0 ? (
                                  <div className="flex flex-col gap-0.5">
                                    {m.billNos.map((bNo, idx) => (
                                      <span key={idx} className="font-mono font-bold text-slate-800 text-[11px]">
                                        {bNo}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-xs italic">None</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                {m.feeHeads.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {m.feeHeads.map((fh, idx) => (
                                      <span
                                        key={idx}
                                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                          fh.isDuplicate ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-slate-100 text-slate-700'
                                        }`}
                                      >
                                        {fh.feeHeadName}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-xs">-</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                                NRs. {m.totalCharged.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                                NRs. {m.totalPaid.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-800">
                                NRs. {m.totalDue.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {m.billIds[0] && (
                                  <div className="flex items-center justify-center gap-1">
                                    {onViewBillDetails && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const bill = remitBills.find(x => x.id === m.billIds[0]);
                                          if (bill) onViewBillDetails(bill);
                                        }}
                                        className="p-1 hover:bg-slate-200 rounded text-slate-600 transition cursor-pointer"
                                        title="View Bill Details"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    {onOpenVoidModal && m.monthStatus !== 'VOIDED' && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const bill = remitBills.find(x => x.id === m.billIds[0]);
                                          if (bill) onOpenVoidModal(bill);
                                        }}
                                        className="p-1 hover:bg-rose-100 rounded text-rose-600 transition cursor-pointer"
                                        title="Void Bill"
                                      >
                                        <Ban className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 2: Fee Heads Itemized Breakdown */}
              {activeTab === 'fee_heads' && (
                <div className="space-y-3">
                  {snapshot.months.map(m => (
                    <div key={m.monthId} className="border border-slate-200 rounded-2xl p-3 bg-white space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-black text-slate-400">
                            {String(m.monthSequence).padStart(2, '0')}
                          </span>
                          <h5 className="font-black text-sm text-slate-800">{m.monthName}</h5>
                        </div>
                        <span className="text-xs font-bold text-slate-500">
                          Total: NRs. {m.totalCharged.toLocaleString()}
                        </span>
                      </div>

                      {m.feeHeads.length === 0 ? (
                        <div className="text-xs text-slate-400 italic py-1">No fee heads charged for this month.</div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {m.feeHeads.map((fh, idx) => (
                            <div
                              key={idx}
                              className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                                fh.isDuplicate
                                  ? 'bg-rose-50 border-rose-300'
                                  : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-black text-slate-800">{fh.feeHeadName}</span>
                                <span className="font-mono font-bold text-slate-700">
                                  NRs. {fh.chargedAmount.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                                <span>Bill: {fh.billNo || 'N/A'}</span>
                                <span className="font-bold text-emerald-700">
                                  Paid: NRs. {fh.paidAmount.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 3: Raw Associated Remit Bills */}
              {activeTab === 'raw_bills' && (
                <div className="space-y-2">
                  {snapshot.rawBills.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 font-medium">
                      No remit bills found for this student in {academicYear} BS.
                    </div>
                  ) : (
                    snapshot.rawBills.map((b: any) => (
                      <div
                        key={b.id}
                        className={`p-3.5 border rounded-2xl flex items-center justify-between gap-3 ${
                          b.status === 'void'
                            ? 'bg-rose-50/50 border-rose-200'
                            : b.status === 'paid'
                            ? 'bg-emerald-50/40 border-emerald-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-xs text-slate-900">{b.billNo}</span>
                            <span
                              className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                                b.status === 'paid'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : b.status === 'void'
                                  ? 'bg-rose-100 text-rose-800 line-through'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {b.status || 'Active'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 font-medium mt-1">
                            Period: <strong className="text-slate-700">{b.billingPeriod}</strong> | Created: {typeof b.createdAt === 'object' && b.createdAt !== null ? (b.createdAt.seconds ? formatBSDate(new Date(b.createdAt.seconds * 1000)) : 'N/A') : String(b.createdAt || 'N/A')}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-mono font-black text-sm text-slate-900">
                            NRs. {(b.totalAmount || 0).toLocaleString()}
                          </div>
                          {onViewBillDetails && (
                            <button
                              type="button"
                              onClick={() => onViewBillDetails(b)}
                              className="text-[10px] font-bold text-[#1B4F72] hover:underline mt-0.5 cursor-pointer inline-flex items-center gap-0.5"
                            >
                              <Eye className="w-3 h-3" /> View Bill
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-slate-400 font-bold">
              Select a student to view authoritative billing coverage.
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <Info className="w-4 h-4 text-slate-400" />
            100% unified with 12-Month Academic Matrix & Remit Bill Generator
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition cursor-pointer"
          >
            Close Inspector
          </button>
        </div>

      </div>
    </div>
  );
};

export default BillingCoverageReconciliationModal;
