import React, { useMemo } from 'react';
import { 
  Calendar, 
  CalendarPlus,
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  User, 
  Users, 
  Info
} from 'lucide-react';
import { 
  NEPALI_MONTH_SEQUENCE, 
  NepaliMonth,
  getStudentYearCoverage, 
  MonthCoverageDetail 
} from '../../lib/nepaliBillingCoverage';

export interface BillingCoveragePreviewProps {
  selectedClass: string;
  classes?: string[];
  onSelectClass?: (cls: string) => void;
  academicYear: string;
  students: any[];
  remitBills: any[];
  studentFees?: any[];
  selectedStudentId?: string;
  generationMode?: 'class' | 'student';
  currentSelectedMonths?: string[];
  onSelectMonth?: (month: string) => void;
}

export default function BillingCoveragePreview({
  selectedClass,
  classes = [],
  onSelectClass,
  academicYear,
  students,
  remitBills,
  selectedStudentId,
  generationMode = 'class',
  currentSelectedMonths = [],
  onSelectMonth
}: BillingCoveragePreviewProps) {
  // Filter students by selected class
  const classStudents = useMemo(() => {
    if (!selectedClass) return [];
    return students.filter(
      s => (s.class || '').toString().trim().toLowerCase() === selectedClass.toString().trim().toLowerCase()
    );
  }, [students, selectedClass]);

  // Selected student object if in single student mode
  const selectedStudent = useMemo(() => {
    if (generationMode !== 'student' || !selectedStudentId) return null;
    return students.find(s => s.id === selectedStudentId) || null;
  }, [students, generationMode, selectedStudentId]);

  // Compute 12-month coverage for all students in the class
  const studentCoverages = useMemo(() => {
    const map = new Map<string, Record<string, MonthCoverageDetail>>();
    const targetList = selectedStudent ? [selectedStudent] : classStudents;
    targetList.forEach(s => {
      const cov = getStudentYearCoverage(s.id, academicYear, remitBills, s.fees);
      map.set(s.id, cov);
    });
    return map;
  }, [classStudents, selectedStudent, academicYear, remitBills]);

  // Compute month-by-month status across all 12 Nepali months
  const monthMatrix = useMemo(() => {
    const totalTargetCount = selectedStudent ? 1 : classStudents.length;

    return NEPALI_MONTH_SEQUENCE.map((month, idx) => {
      let billedCount = 0;
      let paidCount = 0;
      let dueCount = 0;
      let activeBillNos: string[] = [];

      const targetList = selectedStudent ? [selectedStudent] : classStudents;

      targetList.forEach(s => {
        const cov = studentCoverages.get(s.id);
        const detail = cov ? cov[month] : undefined;
        const st = detail?.status || 'NOT_GENERATED';

        if (st === 'PAID') {
          billedCount++;
          paidCount++;
          if (detail?.billNo && !activeBillNos.includes(detail.billNo)) {
            activeBillNos.push(detail.billNo);
          }
        } else if (st === 'GENERATED_DUE' || st === 'PARTIAL') {
          billedCount++;
          dueCount++;
          if (detail?.billNo && !activeBillNos.includes(detail.billNo)) {
            activeBillNos.push(detail.billNo);
          }
        }
      });

      const isFullyBilled = totalTargetCount > 0 && billedCount === totalTargetCount;
      const isPartiallyBilled = billedCount > 0 && billedCount < totalTargetCount;
      const isNotGenerated = billedCount === 0;

      // Status indicator: Green = Already Billed, Grey = Not Yet Generated
      const isBilled = isFullyBilled || (selectedStudent ? billedCount > 0 : false);
      const isPartial = isPartiallyBilled && !selectedStudent;

      const isSelectedInDraft = currentSelectedMonths.includes(month);

      return {
        month,
        monthIndex: idx + 1,
        billedCount,
        paidCount,
        dueCount,
        totalTargetCount,
        isFullyBilled,
        isPartiallyBilled,
        isNotGenerated,
        isBilled,
        isPartial,
        isSelectedInDraft,
        activeBillNos
      };
    });
  }, [classStudents, selectedStudent, studentCoverages, currentSelectedMonths]);

  // Aggregate statistics
  const summaryStats = useMemo(() => {
    const fullyBilledMonths = monthMatrix.filter(m => m.isBilled).length;
    const partialMonths = monthMatrix.filter(m => m.isPartial).length;
    const notGeneratedMonths = monthMatrix.filter(m => m.isNotGenerated).length;

    // Find the first unbilled month in the academic year
    const nextUnbilled = monthMatrix.find(m => m.isNotGenerated || m.isPartial);

    return {
      fullyBilledMonths,
      partialMonths,
      notGeneratedMonths,
      nextUnbilledMonth: nextUnbilled?.month || null
    };
  }, [monthMatrix]);

  // If no class is selected, show an inviting selection prompt
  if (!selectedClass) {
    return (
      <div 
        id="billing-coverage-preview-card"
        className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                Billing Coverage Preview (12 Nepali Months)
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Select a class to view which months are already billed (green) vs not yet generated (grey).
              </p>
            </div>
          </div>

          {classes.length > 0 && onSelectClass && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">
                Quick Select:
              </span>
              {classes.slice(0, 8).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onSelectClass(c)}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 hover:border-[#1B4F72] hover:bg-[#1B4F72]/5 text-slate-700 transition cursor-pointer"
                >
                  Class {c}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div 
      id="billing-coverage-preview-card"
      className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-xs space-y-4 animate-in fade-in duration-200"
    >
      {/* Header with Title, Context, and Green/Grey Indicators Legend */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-100">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#1B4F72]/10 border border-[#1B4F72]/20 flex items-center justify-center text-[#1B4F72] shrink-0 mt-0.5 sm:mt-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                Billing Coverage Preview
              </h3>
              <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-[#1B4F72] text-white tracking-wider">
                Class {selectedClass}
              </span>
              <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                {academicYear} B.S.
              </span>
            </div>
            
            <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-2 flex-wrap">
              {generationMode === 'student' && selectedStudent ? (
                <span className="inline-flex items-center gap-1 font-bold text-slate-700">
                  <User className="w-3.5 h-3.5 text-indigo-600" />
                  Pupil: {selectedStudent.fullName || selectedStudent.name} (Roll: {selectedStudent.rollNumber || selectedStudent.studentId || 'N/A'})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  {classStudents.length} Students in Class {selectedClass}
                </span>
              )}
              <span className="text-slate-300">•</span>
              <span>12 Months Academic Cycle</span>
            </p>
          </div>
        </div>

        {/* Status Indicators & Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Green Indicator Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-2xs animate-pulse" />
            <span className="text-[11px]">Billed</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-emerald-200/80 rounded-full font-black text-emerald-900 ml-0.5">
              {summaryStats.fullyBilledMonths}
            </span>
          </div>

          {/* Partial Indicator Pill (if any partials) */}
          {summaryStats.partialMonths > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-2xs" />
              <span className="text-[11px]">Partial</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-amber-200/80 rounded-full font-black text-amber-900 ml-0.5">
                {summaryStats.partialMonths}
              </span>
            </div>
          )}

          {/* Grey Indicator Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            <span className="text-[11px]">Not Generated</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 rounded-full font-black text-slate-700 ml-0.5">
              {summaryStats.notGeneratedMonths}
            </span>
          </div>

          {/* Quick jump to next unbilled month button */}
          {summaryStats.nextUnbilledMonth && onSelectMonth && (
            <button
              type="button"
              id="btn-quick-select-next-unbilled"
              onClick={() => onSelectMonth(summaryStats.nextUnbilledMonth!)}
              className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ml-auto sm:ml-0"
              title={`Quickly set ${summaryStats.nextUnbilledMonth} as Starting Month`}
            >
              <CalendarPlus className="w-3 h-3 text-indigo-600" />
              <span>Next: <strong>{summaryStats.nextUnbilledMonth}</strong></span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 12 Nepali Month Matrix Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12 gap-2 sm:gap-2.5">
        {monthMatrix.map(m => {
          // Color schemes based on user requirement: Green (Billed) vs Grey (Not Generated)
          let cardBg = 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300';
          let indicatorBg = 'bg-slate-400';
          let indicatorText = 'Not Generated';
          let badgeBg = 'bg-slate-200 text-slate-700';

          if (m.isBilled) {
            // GREEN indicator: Already Billed
            cardBg = 'bg-emerald-50/80 border-emerald-200 text-emerald-900 hover:border-emerald-300 hover:bg-emerald-50';
            indicatorBg = 'bg-emerald-500';
            indicatorText = 'Billed';
            badgeBg = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
          } else if (m.isPartial) {
            // Partial: Amber/Emerald
            cardBg = 'bg-amber-50/70 border-amber-200 text-amber-900 hover:border-amber-300';
            indicatorBg = 'bg-amber-500';
            indicatorText = 'Partial';
            badgeBg = 'bg-amber-100 text-amber-800 border border-amber-200';
          }

          // Active in current generator draft highlight
          const activeDraftRing = m.isSelectedInDraft 
            ? 'ring-2 ring-[#1B4F72] ring-offset-1 border-[#1B4F72] shadow-sm' 
            : '';

          return (
            <div
              key={m.month}
              id={`billing-coverage-month-${m.month.toLowerCase()}`}
              onClick={() => {
                if (onSelectMonth) {
                  onSelectMonth(m.month);
                }
              }}
              className={`relative rounded-2xl border p-2.5 flex flex-col justify-between transition-all select-none cursor-pointer group ${cardBg} ${activeDraftRing}`}
              title={
                m.isBilled
                  ? `${m.month}: Already Billed (${m.billedCount}/${m.totalTargetCount} students)${m.activeBillNos && m.activeBillNos.length > 0 ? ` [Bill Ref: ${m.activeBillNos.join(', ')}]` : ''}. Click to set as start month.`
                  : `${m.month}: Not Yet Generated. Click to select as start month.`
              }
            >
              {/* Top Row: Month Index & Green/Grey Status Dot */}
              <div className="flex items-center justify-between gap-1">
                <span className="text-[9px] font-mono font-bold text-slate-400">
                  {m.monthIndex.toString().padStart(2, '0')}
                </span>
                
                {/* Visual Status Dot Indicator */}
                <div className="flex items-center gap-1">
                  <span 
                    className={`w-2 h-2 rounded-full ${indicatorBg} ${
                      m.isBilled ? 'shadow-xs' : ''
                    }`} 
                  />
                  {m.isBilled && (
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                  )}
                  {m.isNotGenerated && (
                    <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                  )}
                </div>
              </div>

              {/* Month Name */}
              <div className="my-1.5">
                <span className="text-xs font-black tracking-tight block truncate">
                  {m.month}
                </span>
              </div>

              {/* Bottom Badge / Status Pill */}
              <div className="pt-1 border-t border-black/5 flex flex-col gap-0.5">
                <div className="flex items-center justify-between text-[9px] font-bold">
                  <span className={`px-1.5 py-0.5 rounded-md font-extrabold uppercase tracking-wider ${badgeBg}`}>
                    {indicatorText}
                  </span>

                  {generationMode === 'class' && m.totalTargetCount > 0 && (
                    <span className="font-mono font-semibold text-slate-500">
                      {m.billedCount}/{m.totalTargetCount}
                    </span>
                  )}
                </div>

                {/* Draft Badge Indicator */}
                {m.isSelectedInDraft && (
                  <span className="text-[8px] font-black uppercase text-[#1B4F72] bg-blue-100/70 border border-blue-200 px-1 rounded text-center mt-1">
                    In Draft
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Helper Note & Dynamic Guidance */}
      <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>
            Click any month above to quickly set it as the <strong>Starting Month</strong> in the bill generator form.
          </span>
        </div>

        {summaryStats.nextUnbilledMonth ? (
          <span className="text-slate-600 font-medium">
            Next pending billing: <strong className="text-[#1B4F72]">{summaryStats.nextUnbilledMonth}</strong> ({academicYear} BS)
          </span>
        ) : (
          <span className="text-emerald-700 font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            All 12 months for this academic year are fully billed!
          </span>
        )}
      </div>
    </div>
  );
}
