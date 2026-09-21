import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Ban, 
  Printer, 
  Search, 
  PlusCircle,
  FileSpreadsheet,
  Layers
} from 'lucide-react';
import { 
  NEPALI_MONTH_SEQUENCE, 
  getStudentBillingCoverage,
  getStudentYearCoverage, 
  MonthCoverageDetail,
  BillingCoverageSnapshot
} from '../../lib/nepaliBillingCoverage';
import { BillingCoverageReconciliationModal } from './BillingCoverageReconciliationModal';

interface AcademicYearBillingMatrixProps {
  students: any[];
  remitBills: any[];
  classes: string[];
  selectedClass: string;
  onSelectClass: (cls: string) => void;
  academicYear: string;
  onQuickGenerateMonth?: (cls: string, month: string) => void;
  onViewBillDetails?: (bill: any) => void;
  onOpenVoidModal?: (bill: any) => void;
}

export default function AcademicYearBillingMatrix({
  students,
  remitBills,
  classes,
  selectedClass,
  onSelectClass,
  academicYear,
  onQuickGenerateMonth,
  onViewBillDetails,
  onOpenVoidModal
}: AcademicYearBillingMatrixProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unbilled_any' | 'fully_billed'>('all');
  const [reconcileModalOpen, setReconcileModalOpen] = useState(false);
  const [reconcileStudentId, setReconcileStudentId] = useState<string>('');

  // Filter students by selected class
  const classStudents = useMemo(() => {
    return students.filter(s => (s.class || '').toLowerCase() === (selectedClass || '').toLowerCase());
  }, [students, selectedClass]);

  // Compute authoritative 12-month coverage snapshot for each student in the class
  const studentSnapshots = useMemo(() => {
    const map = new Map<string, BillingCoverageSnapshot>();
    classStudents.forEach(s => {
      const snap = getStudentBillingCoverage(s, academicYear, remitBills);
      map.set(s.id, snap);
    });
    return map;
  }, [classStudents, academicYear, remitBills]);

  // Map for backward compatibility with cell rendering
  const studentCoverages = useMemo(() => {
    const map = new Map<string, Record<string, MonthCoverageDetail>>();
    classStudents.forEach(s => {
      const cov = getStudentYearCoverage(s.id, academicYear, remitBills);
      map.set(s.id, cov);
    });
    return map;
  }, [classStudents, academicYear, remitBills]);

  // Compute month-by-month aggregate statistics across the class using the snapshots
  const monthStats = useMemo(() => {
    return NEPALI_MONTH_SEQUENCE.map((month, idx) => {
      let paidCount = 0;
      let dueCount = 0;
      let voidCount = 0;
      let unbilledCount = 0;

      classStudents.forEach(s => {
        const snap = studentSnapshots.get(s.id);
        const mCov = snap?.monthMap[month];
        if (mCov) {
          if (mCov.monthStatus === 'PAID') paidCount++;
          else if (mCov.monthStatus === 'GENERATED_DUE' || mCov.monthStatus === 'PARTIAL') dueCount++;
          else if (mCov.monthStatus === 'VOIDED') voidCount++;
          else unbilledCount++;
        } else {
          unbilledCount++;
        }
      });

      const totalActiveBilled = paidCount + dueCount;
      const totalStudents = classStudents.length;
      const percentage = totalStudents > 0 ? Math.round((totalActiveBilled / totalStudents) * 100) : 0;

      let state: 'FULL' | 'PARTIAL' | 'NONE' = 'NONE';
      if (totalStudents > 0 && totalActiveBilled === totalStudents) state = 'FULL';
      else if (totalActiveBilled > 0) state = 'PARTIAL';

      return {
        month,
        monthIndex: idx + 1,
        paidCount,
        dueCount,
        voidCount,
        unbilledCount,
        totalActiveBilled,
        totalStudents,
        percentage,
        state
      };
    });
  }, [classStudents, studentSnapshots]);

  // Filter student rows
  const filteredStudents = useMemo(() => {
    return classStudents.filter(s => {
      const nameMatch = (s.fullName || s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.rollNumber || s.studentId || '').toLowerCase().includes(searchTerm.toLowerCase());
      if (!nameMatch) return false;

      if (statusFilter === 'all') return true;

      const snap = studentSnapshots.get(s.id);
      if (!snap) return true;

      const unbilledMonthsCount = snap.missingMonthCount;

      if (statusFilter === 'unbilled_any') return unbilledMonthsCount > 0;
      if (statusFilter === 'fully_billed') return unbilledMonthsCount === 0;

      return true;
    });
  }, [classStudents, searchTerm, statusFilter, studentSnapshots]);

  // Print matrix table representation
  const handlePrintMatrix = () => {
    window.print();
  };

  const handleOpenReconcile = (studentId?: string) => {
    setReconcileStudentId(studentId || classStudents[0]?.id || '');
    setReconcileModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Controls Header */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#1B4F72]/10 text-[#1B4F72] flex items-center justify-center shrink-0">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-slate-900 uppercase tracking-wide">
                  12-Month Academic Billing Matrix
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-[#1B4F72] text-white text-[10px] font-black uppercase tracking-wider">
                  {academicYear} BS
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Exact month-level protection check for all 12 Nepali calendar months (Baisakh to Chaitra).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Class:</span>
              <select
                value={selectedClass}
                onChange={e => onSelectClass(e.target.value)}
                className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:border-[#1B4F72] cursor-pointer"
              >
                {classes.map(cls => (
                  <option key={cls} value={cls}>Class {cls}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => handleOpenReconcile()}
              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Audit individual fee head coverage and detect duplicates"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
              Reconcile Coverage
            </button>

            <button
              type="button"
              onClick={handlePrintMatrix}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              Print Matrix
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-slate-100 text-xs font-semibold text-slate-600">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Status Indicators:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500 inline-block"></span>
            Paid / Deposited
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-400 inline-block"></span>
            Generated & Due (Active)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-slate-200 inline-block border border-slate-300"></span>
            Not Generated (Unbilled)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-rose-500 inline-block"></span>
            VOID (Released)
          </span>
        </div>
      </div>

      {/* 12-Month Calendar Grid Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {monthStats.map(m => {
          let cardBg = 'bg-white border-slate-200';
          let badgeBg = 'bg-slate-100 text-slate-600';
          let badgeText = 'Unbilled';

          if (m.state === 'FULL') {
            cardBg = 'bg-emerald-50/40 border-emerald-200';
            badgeBg = 'bg-emerald-100 text-emerald-800';
            badgeText = '100% Billed';
          } else if (m.state === 'PARTIAL') {
            cardBg = 'bg-amber-50/40 border-amber-200';
            badgeBg = 'bg-amber-100 text-amber-800';
            badgeText = `${m.percentage}% Billed`;
          }

          return (
            <div 
              key={m.month}
              className={`border rounded-2xl p-3.5 space-y-2.5 transition-all shadow-2xs hover:shadow-sm ${cardBg}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-black text-slate-400">
                  {String(m.monthIndex).padStart(2, '0')}
                </span>
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${badgeBg}`}>
                  {badgeText}
                </span>
              </div>

              <div>
                <h4 className="text-sm font-black text-slate-800">{m.month}</h4>
                <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                  {m.totalActiveBilled} of {m.totalStudents} students
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    m.state === 'FULL' ? 'bg-emerald-500' : (m.state === 'PARTIAL' ? 'bg-amber-400' : 'bg-transparent')
                  }`}
                  style={{ width: `${m.percentage}%` }}
                />
              </div>

              {/* Quick action button */}
              {m.unbilledCount > 0 && onQuickGenerateMonth ? (
                <button
                  type="button"
                  onClick={() => onQuickGenerateMonth(selectedClass, m.month)}
                  className="w-full py-1.5 bg-[#1B4F72] hover:bg-[#153e5b] text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <PlusCircle className="w-3 h-3" />
                  Bill {m.unbilledCount} Pupil{m.unbilledCount > 1 ? 's' : ''}
                </button>
              ) : (
                <div className="py-1 text-center text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                  ✓ Protected
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Detailed Student x 12 Month Table */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search student name or roll..."
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-700 w-full sm:w-64 focus:border-[#1B4F72]"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <span className="text-[10px] font-black uppercase text-slate-400">Filter:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">All Pupils ({classStudents.length})</option>
              <option value="unbilled_any">Needs Generation (Has Unbilled Months)</option>
              <option value="fully_billed">Fully Billed (All 12 Months)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                <th className="py-3 px-4 sticky left-0 bg-slate-50 z-10 shadow-xs">Student</th>
                {NEPALI_MONTH_SEQUENCE.map(m => (
                  <th key={m} className="py-3 px-2 text-center min-w-[72px]">
                    {m.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-400 font-bold">
                    No students found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredStudents.map(student => {
                  const cov = studentCoverages.get(student.id);

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 sticky left-0 bg-white z-10 shadow-xs">
                        <div 
                          className="font-bold text-slate-800 text-xs truncate max-w-[180px] hover:text-[#1B4F72] hover:underline cursor-pointer flex items-center gap-1"
                          onClick={() => handleOpenReconcile(student.id)}
                          title="Click to view detailed billing coverage & fee heads audit"
                        >
                          {student.fullName || student.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-semibold mt-0.5">
                          Roll: {student.rollNumber || student.roll || 'N/A'}
                        </div>
                      </td>

                      {NEPALI_MONTH_SEQUENCE.map(month => {
                        const detail = cov ? cov[month] : undefined;
                        const status = detail?.status || 'NOT_GENERATED';

                        let cellClass = 'bg-slate-50/50 text-slate-300';
                        let pill = <span className="text-slate-300 font-bold">-</span>;

                        if (status === 'PAID') {
                          cellClass = 'bg-emerald-50/60';
                          pill = (
                            <span 
                              className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.5 rounded cursor-pointer"
                              title={`Paid: NRs. ${(detail?.amount || 0).toLocaleString()} (Bill ${detail?.billNo || 'N/A'})`}
                              onClick={() => {
                                if (onViewBillDetails && detail?.billId) {
                                  const b = remitBills.find(x => x.id === detail.billId);
                                  if (b) onViewBillDetails(b);
                                }
                              }}
                            >
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                              Paid
                            </span>
                          );
                        } else if (status === 'GENERATED_DUE' || status === 'PARTIAL') {
                          cellClass = 'bg-amber-50/60';
                          pill = (
                            <div className="inline-flex flex-col items-center">
                              <span 
                                className="bg-amber-100 text-amber-900 border border-amber-200 text-[9px] font-black px-1.5 py-0.5 rounded cursor-pointer hover:bg-amber-200"
                                title={`Due: NRs. ${(detail?.amount || 0).toLocaleString()} (Bill ${detail?.billNo || 'N/A'})`}
                                onClick={() => {
                                  if (onViewBillDetails && detail?.billId) {
                                    const b = remitBills.find(x => x.id === detail.billId);
                                    if (b) onViewBillDetails(b);
                                  }
                                }}
                              >
                                {status === 'PARTIAL' ? 'Part' : 'Due'}
                              </span>
                              {onOpenVoidModal && detail?.billId && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const b = remitBills.find(x => x.id === detail.billId);
                                    if (b) onOpenVoidModal(b);
                                  }}
                                  className="text-[8px] text-red-500 hover:underline mt-0.5 cursor-pointer font-bold"
                                  title="Void this bill to allow reissue"
                                >
                                  Void
                                </button>
                              )}
                            </div>
                          );
                        } else if (status === 'VOID') {
                          cellClass = 'bg-rose-50/40';
                          pill = (
                            <span 
                              className="bg-rose-100 text-rose-700 text-[8px] font-black px-1.5 py-0.5 rounded line-through"
                              title={`Voided: ${detail?.voidReason || 'Clerical error'} (Authorized)`}
                            >
                              VOID
                            </span>
                          );
                        } else {
                          // NOT_GENERATED
                          pill = onQuickGenerateMonth ? (
                            <button
                              type="button"
                              onClick={() => onQuickGenerateMonth(selectedClass, month)}
                              className="w-5 h-5 rounded-full hover:bg-[#1B4F72] hover:text-white text-slate-300 text-xs font-black inline-flex items-center justify-center transition cursor-pointer"
                              title={`Bill ${month} for Class ${selectedClass}`}
                            >
                              +
                            </button>
                          ) : (
                            <span className="text-slate-300 font-bold">-</span>
                          );
                        }

                        return (
                          <td 
                            key={month} 
                            className={`py-2 px-1 text-center border-l border-slate-100 ${cellClass}`}
                          >
                            {pill}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reconciliation Diagnostic Modal */}
      <BillingCoverageReconciliationModal
        isOpen={reconcileModalOpen}
        onClose={() => setReconcileModalOpen(false)}
        students={classStudents}
        currentAcademicYear={academicYear}
        remitBills={remitBills}
        initialStudentId={reconcileStudentId}
        onViewBillDetails={onViewBillDetails}
        onOpenVoidModal={onOpenVoidModal}
      />
    </div>
  );
}
