import React, { forwardRef, useState, useEffect } from 'react';
import { formatBSDate } from '../../lib/nepaliDate';
import { NEPAL_CDC_GRADING_SCALE, calculateSubjectResult } from '../../lib/nepalGradingEngine';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const defaultLogoImage = '/logo.png';

interface ReportCardProps {
  student: any;
}

export const ReportCardTemplate = forwardRef<HTMLDivElement, ReportCardProps>(
  ({ student }, ref) => {
    const [liveTemplateConfig, setLiveTemplateConfig] = useState<any>(null);

    // Prefer immutable templateSnapshot stored at publication time so historical report cards never mutate
    const templateConfig = student?.templateSnapshot || liveTemplateConfig;

    useEffect(() => {
      if (student?.templateSnapshot) return;
      const loadTemplate = async () => {
        try {
          const tDoc = await getDoc(doc(db, 'settings', 'result_template'));
          if (tDoc.exists()) {
            setLiveTemplateConfig(tDoc.data());
          }
        } catch (e) {
          console.warn('Failed to load active template in ReportCardTemplate:', e);
        }
      };
      loadTemplate();
    }, [student?.templateSnapshot]);

    const schoolName = templateConfig?.schoolName || 'Shikshantar Academy';
    const schoolMotto = templateConfig?.schoolMotto || 'A School for Inspiring Minds';
    const schoolAddress = templateConfig?.schoolAddress || 'Bastipur, Karjanha-05, Siraha, Madhesh, Nepal';
    const logoImage = templateConfig?.schoolLogoUrl || defaultLogoImage;
    const headerLogoSize = templateConfig?.headerLogoSize || 88;

    const watermarkEnabled = templateConfig?.watermark?.enabled !== false;
    const watermarkLogo = templateConfig?.watermark?.logoUrl || logoImage;
    const watermarkOpacity =
      templateConfig?.watermark?.opacity !== undefined ? templateConfig.watermark.opacity : 0.08;
    const watermarkSize = templateConfig?.watermark?.size || 420;
    const watermarkX =
      templateConfig?.watermark?.positionX !== undefined ? templateConfig.watermark.positionX : 50;
    const watermarkY =
      templateConfig?.watermark?.positionY !== undefined ? templateConfig.watermark.positionY : 50;

    const pinkHeaderBg = templateConfig?.typography?.pinkHeaderBg || '#f0a4c2';

    // Actual recorded behavioral assessments only — NEVER fabricated from percentage
    const recordedTraits: Array<{ name: string; grade: string }> = (() => {
      const raw = student?.behavioralAssessments || student?.traits;
      if (Array.isArray(raw)) {
        return raw
          .filter((item: any) => item && item.name && item.grade)
          .map((item: any) => ({ name: String(item.name), grade: String(item.grade) }));
      }
      if (raw && typeof raw === 'object') {
        return Object.entries(raw)
          .filter(([, val]) => val !== null && val !== undefined && String(val).trim() !== '')
          .map(([k, val]) => ({ name: k, grade: String(val) }));
      }
      return [];
    })();

    // Authorized teacher remark only — NEVER auto-fabricated
    const authorizedRemark =
      (typeof student?.classTeacherRemark === 'string' && student.classTeacherRemark.trim()) ||
      (typeof student?.remarks === 'string' && student.remarks.trim()) ||
      '';

    // Determine overall status, grade, and Nepal CDC GPA display ('-' when NG or null)
    const subjectEntries = Object.entries(student?.subjects || {});
    const computedRows = subjectEntries.map(([subName, rawMarks]: [string, any]) => {
      const hasTh = rawMarks?.hasTh !== undefined ? Boolean(rawMarks.hasTh) : (rawMarks?.thFull ?? rawMarks?.thFullMarks ?? 75) > 0;
      const thFull = hasTh ? Number(rawMarks?.thFull ?? rawMarks?.thFullMarks ?? rawMarks?.fullMarks ?? 75) : 0;
      const prFullRaw = rawMarks?.prFull ?? rawMarks?.prFullMarks ?? 0;
      const hasPr = rawMarks?.hasPr !== undefined ? Boolean(rawMarks.hasPr) && Number(prFullRaw) > 0 : Number(prFullRaw) > 0;
      const prFull = hasPr ? Number(prFullRaw) : 0;
      const totalFull = Number(rawMarks?.fullMarks ?? thFull + prFull);

      const thPass = hasTh ? Number(rawMarks?.thPass ?? rawMarks?.thPassMarks ?? Math.ceil(thFull * 0.35)) : 0;
      const prPass = hasPr ? Number(rawMarks?.prPass ?? rawMarks?.prPassMarks ?? Math.ceil(prFull * 0.35)) : 0;

      const rawTh = rawMarks?.thMarks !== undefined ? rawMarks.thMarks : rawMarks?.obtained;
      const rawPr = hasPr ? rawMarks?.prMarks : null;

      const calc = calculateSubjectResult(
        subName.replace(/\s+/g, ''),
        subName,
        {
          theoryMarks: rawTh === undefined || rawTh === '' ? null : rawTh === 'AB' ? 'AB' : Number(rawTh),
          practicalMarks: !hasPr ? null : rawPr === undefined || rawPr === '' ? null : rawPr === 'AB' ? 'AB' : Number(rawPr),
          isAbsentTheory: rawTh === 'AB',
          isAbsentPractical: hasPr && rawPr === 'AB',
        },
        {
          hasTh,
          thFullMarks: thFull,
          thPassMarks: thPass,
          hasPr,
          prFullMarks: prFull,
          prPassMarks: prPass,
        }
      );

      const passDisplay = hasTh && hasPr ? `${thPass}+${prPass}` : hasTh ? `${thPass}` : `${prPass}`;
      const displayTh = !hasTh
        ? '-'
        : rawTh === 'AB'
        ? 'AB'
        : rawTh === null || rawTh === undefined || rawTh === ''
        ? '-'
        : String(rawTh);
      const displayPr = !hasPr
        ? '-'
        : rawPr === 'AB'
        ? 'AB'
        : rawPr === null || rawPr === undefined || rawPr === ''
        ? '-'
        : String(rawPr);

      const isNg = rawMarks?.subjectGrade === 'NG' || rawMarks?.grade === 'NG' || rawMarks?.status === 'NG' || rawMarks?.status === 'FAIL' || rawMarks?.isNg === true || calc.isNg;
      const rowGrade = rawMarks?.subjectGrade || rawMarks?.grade || calc.subjectGrade;
      const rowTotal =
        rawMarks?.obtained !== undefined && rawMarks?.obtained !== null
          ? rawMarks.obtained
          : calc.totalObtainedMarks ?? '-';

      return {
        subName,
        fullMarks: totalFull,
        passDisplay,
        displayTh,
        displayPr,
        rowTotal: displayTh === 'AB' && (!hasPr || displayPr === 'AB') ? 'AB' : rowTotal,
        rowGrade,
        isNg,
      };
    });

    const anySubjectNg = computedRows.some((r) => r.isNg);
    const finalGrade = anySubjectNg ? 'NG' : student?.grade || 'NG';
    const isOverallNg = finalGrade === 'NG' || student?.overallStatus === 'NG' || student?.status === 'FAIL';
    const resultStatusText = isOverallNg ? 'NG (Non-Graded)' : 'PASSED';

    const gpaDisplay = (() => {
      if (isOverallNg) return '-';
      if (student?.gpaDisplayText) return student.gpaDisplayText;
      if (typeof student?.gpa === 'number' && !isNaN(student.gpa)) return student.gpa.toFixed(2);
      if (typeof student?.overallGpa === 'number' && !isNaN(student.overallGpa)) return student.overallGpa.toFixed(2);
      return '-';
    })();

    const percentageDisplay =
      typeof student?.percentage === 'number' && !isNaN(student.percentage)
        ? `${student.percentage.toFixed(2)}%`
        : '-';

    const totalMarksDisplay =
      student?.total !== undefined && student?.total !== null
        ? student.total
        : student?.totalMarks !== undefined && student?.totalMarks !== null
        ? student.totalMarks
        : '-';

    // Policy: Rank shown ONLY for preserved historical snapshots with a saved rank
    const showHistoricalRank = Boolean(student?.isHistoricalSnapshot && student?.rank);

    const publishedDateDisplay = (() => {
      if (student?.publishedAt) {
        try {
          const d =
            typeof student.publishedAt?.toDate === 'function'
              ? student.publishedAt.toDate()
              : new Date(student.publishedAt);
          if (!isNaN(d.getTime())) return formatBSDate(d);
        } catch (_) {}
      }
      return formatBSDate(new Date());
    })();

    return (
      <div
        ref={ref}
        className="bg-white p-4 w-[210mm] min-h-[297mm] mx-auto text-gray-900 font-sans relative flex flex-col shadow-lg print:shadow-none box-border"
      >
        {/* Double Border Frame */}
        <div className="border-[3px] border-[#1a2b4c] rounded-sm flex-1 flex flex-col p-1 relative z-0 box-border">
          <div className="border border-[#1a2b4c] rounded-sm flex-1 flex flex-col relative z-0 overflow-hidden box-border">
            {/* Background Watermark */}
            {watermarkEnabled && (
              <div
                className="absolute pointer-events-none z-0 transform -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${watermarkX}%`,
                  top: `${watermarkY}%`,
                  opacity: watermarkOpacity,
                }}
              >
                <img
                  src={watermarkLogo}
                  alt="Watermark"
                  style={{ width: `${watermarkSize}px` }}
                  className="object-contain"
                />
              </div>
            )}

            <div className="relative z-10 flex flex-col h-full p-5 flex-1 box-border">
              {/* Header */}
              <div className="flex flex-row justify-between items-center mb-3 pb-3 border-b-2 border-[#1a2b4c]">
                <img
                  src={logoImage}
                  alt="School Logo"
                  style={{ width: `${headerLogoSize}px`, height: `${headerLogoSize}px` }}
                  className="object-contain shrink-0"
                />
                <div className="text-center flex-1 px-4">
                  <h1 className="text-3xl font-black text-[#1a2b4c] uppercase tracking-wider leading-tight">
                    {schoolName}
                  </h1>
                  <p className="text-xs italic font-semibold text-[#1a2b4c]/80 mt-0.5">
                    &ldquo;{schoolMotto}&rdquo;
                  </p>
                  <h2 className="text-[11px] font-bold text-gray-600 tracking-widest uppercase mt-1">
                    {schoolAddress}
                  </h2>
                  <div className="inline-block mt-2 bg-[#1a2b4c] text-white px-5 py-1 rounded-full shadow-sm">
                    <span className="text-[11px] uppercase tracking-[0.18em] font-bold">
                      Academic Progress Report
                    </span>
                  </div>
                </div>
                <div style={{ width: `${Math.min(headerLogoSize, 64)}px` }} className="shrink-0" />
              </div>

              {/* Exam Heading */}
              <div className="text-center font-black text-lg mb-3 text-[#1a2b4c] uppercase tracking-widest py-1.5 border border-blue-100 rounded bg-slate-50/60">
                {student?.academicYear
                  ? student.examType?.includes(student.academicYear)
                    ? student.examType
                    : `${student.examType} — Academic Year ${student.academicYear}`
                  : student?.examType}
              </div>

              {/* Student Info Card */}
              <div className="border-[#1a2b4c] border rounded-lg p-3 mb-3 grid grid-cols-2 gap-y-1.5 text-xs font-bold uppercase tracking-wide flex-none bg-white/90">
                <div className="border-r border-[#1a2b4c]/15 pr-3">
                  Name:{' '}
                  <span className="font-bold text-[#1a2b4c] ml-1.5 text-sm normal-case">
                    {student?.studentName || '-'}
                  </span>
                </div>
                <div className="pl-3">
                  Class / Section:{' '}
                  <span className="font-bold text-[#1a2b4c] ml-1.5">
                    {student?.class || '-'}
                    {student?.section ? ` (${student.section})` : ''}
                  </span>
                </div>
                <div className="border-r border-[#1a2b4c]/15 pr-3 pt-1.5 border-t border-[#1a2b4c]/15">
                  Regd / Student ID:{' '}
                  <span className="font-bold text-[#1a2b4c] ml-1.5 font-mono normal-case">
                    {student?.registrationNo || student?.permanentStudentId || student?.studentId || '-'}
                  </span>
                </div>
                <div className="pl-3 pt-1.5 border-t border-[#1a2b4c]/15">
                  Roll No:{' '}
                  <span className="font-bold text-[#1a2b4c] ml-1.5">
                    {student?.rollNo || student?.rollNumberSnapshot || '-'}
                  </span>
                </div>
              </div>

              {/* Official Nepal CDC Subject Marks Table */}
              <div className="border border-[#1a2b4c] mb-3 flex-none box-border bg-white/95">
                <table className="w-full border-collapse text-[11px] text-[#1a2b4c]">
                  <thead style={{ backgroundColor: pinkHeaderBg }} className="text-[#1a2b4c]">
                    <tr>
                      <th className="border border-[#1a2b4c] p-1.5 w-9 text-center" rowSpan={2}>
                        S.N.
                      </th>
                      <th className="border border-[#1a2b4c] p-1.5 text-left" rowSpan={2}>
                        Subject
                      </th>
                      <th className="border border-[#1a2b4c] p-1.5 w-14 text-center" rowSpan={2}>
                        Full Mark
                      </th>
                      <th className="border border-[#1a2b4c] p-1.5 w-16 text-center" rowSpan={2}>
                        Pass Mark (35%)
                      </th>
                      <th className="border border-[#1a2b4c] p-1 text-center" colSpan={2}>
                        Marks Obtained
                      </th>
                      <th className="border border-[#1a2b4c] p-1.5 w-16 text-center" rowSpan={2}>
                        Total
                      </th>
                      <th className="border border-[#1a2b4c] p-1.5 w-16 text-center" rowSpan={2}>
                        Grade
                      </th>
                    </tr>
                    <tr>
                      <th className="border border-[#1a2b4c] p-1 w-16 text-center font-semibold">
                        Theory
                      </th>
                      <th className="border border-[#1a2b4c] p-1 w-16 text-center font-semibold">
                        Practical
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {computedRows.map((row, i) => (
                      <tr key={row.subName} className={row.isNg ? 'bg-rose-50/60' : ''}>
                        <td className="border border-[#1a2b4c]/50 p-1.5 text-center">{i + 1}.</td>
                        <td className="border border-[#1a2b4c]/50 p-1.5 font-bold">{row.subName}</td>
                        <td className="border border-[#1a2b4c]/50 p-1.5 text-center text-[10px]">
                          {row.fullMarks}
                        </td>
                        <td className="border border-[#1a2b4c]/50 p-1.5 text-center text-[10px]">
                          {row.passDisplay}
                        </td>
                        <td
                          className={`border border-[#1a2b4c]/50 p-1.5 text-center font-bold ${
                            row.displayTh === 'AB' ? 'text-rose-700' : ''
                          }`}
                        >
                          {row.displayTh}
                        </td>
                        <td
                          className={`border border-[#1a2b4c]/50 p-1.5 text-center font-bold ${
                            row.displayPr === 'AB' ? 'text-rose-700' : 'text-gray-600'
                          }`}
                        >
                          {row.displayPr}
                        </td>
                        <td className="border border-[#1a2b4c]/50 p-1.5 text-center font-bold">
                          {row.rowTotal}
                        </td>
                        <td
                          className={`border border-[#1a2b4c]/50 p-1.5 text-center font-black ${
                            row.isNg ? 'text-rose-700' : 'text-[#1a2b4c]'
                          }`}
                        >
                          {row.rowGrade}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Performance Summary Cards */}
              <div
                className={`grid ${
                  showHistoricalRank ? 'grid-cols-6' : 'grid-cols-5'
                } gap-2.5 mb-3 flex-none box-border`}
              >
                <div className="border border-[#1a2b4c] rounded-lg p-2 text-center bg-white">
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-wider mb-0.5">
                    Total Marks
                  </p>
                  <p className="text-base font-black text-[#1a2b4c]">
                    {totalMarksDisplay}
                    {student?.fullMarksTotal ? (
                      <span className="text-[10px] font-semibold text-slate-500">
                        /{student.fullMarksTotal}
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="border border-[#1a2b4c] rounded-lg p-2 text-center bg-white">
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-wider mb-0.5">
                    Percentage
                  </p>
                  <p className="text-base font-black text-[#1a2b4c]">{percentageDisplay}</p>
                </div>

                <div className="border border-[#1a2b4c] rounded-lg p-2 text-center bg-white">
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-wider mb-0.5">
                    GPA (CDC)
                  </p>
                  <p
                    className={`text-base font-black ${
                      isOverallNg ? 'text-rose-700' : 'text-[#1a2b4c]'
                    }`}
                  >
                    {gpaDisplay}
                  </p>
                </div>

                <div className="border border-[#1a2b4c] rounded-lg p-2 text-center bg-white">
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-wider mb-0.5">
                    Final Grade
                  </p>
                  <p
                    className={`text-base font-black ${
                      isOverallNg ? 'text-rose-700' : 'text-[#1a2b4c]'
                    }`}
                  >
                    {finalGrade}
                  </p>
                </div>

                <div className="border border-[#1a2b4c] rounded-lg p-2 text-center bg-white">
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-wider mb-0.5">
                    Result Status
                  </p>
                  <p
                    className={`text-xs font-black mt-1 ${
                      isOverallNg ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {resultStatusText}
                  </p>
                </div>

                {showHistoricalRank && (
                  <div className="border border-[#1a2b4c] rounded-lg p-2 text-center bg-amber-50/50">
                    <p className="text-slate-500 text-[9px] font-black uppercase tracking-wider mb-0.5">
                      Historical Rank
                    </p>
                    <p className="text-base font-black text-[#1a2b4c]">{student.rank}</p>
                  </div>
                )}
              </div>

              {/* Lower Section: Recorded Remarks/Traits + Official Nepal CDC Grading Scale */}
              <div className="flex gap-3 flex-none box-border min-h-0">
                {/* Left: Recorded Behavioral Assessment & Teacher Remark (Never Fabricated) */}
                <div className="border border-[#1a2b4c]/70 rounded-lg overflow-hidden flex-[0.46] flex flex-col bg-white">
                  <div className="px-3 py-1.5 bg-[#1a2b4c] text-white shrink-0">
                    <h3 className="text-[10px] font-black uppercase tracking-widest">
                      Assessment &amp; Remarks
                    </h3>
                  </div>
                  <div className="flex flex-col flex-1 p-3 justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-500 mb-1.5">
                        Behavioral Traits
                      </p>
                      {recordedTraits.length > 0 ? (
                        <div className="flex flex-col space-y-1.5">
                          {recordedTraits.map((trait, idx) => (
                            <div
                              key={idx}
                              className="flex justify-between items-center border-b border-gray-100 pb-0.5 last:border-0"
                            >
                              <span className="text-[10px] font-bold text-[#1a2b4c]">
                                {trait.name}
                              </span>
                              <span className="text-[10px] font-black text-[#1a2b4c]">
                                {trait.grade}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] italic text-slate-500">
                          Not recorded for this examination.
                        </p>
                      )}
                    </div>

                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Authorized Teacher Remark
                      </p>
                      {authorizedRemark ? (
                        <p className="text-[11px] font-medium text-[#1a2b4c] leading-snug">
                          {authorizedRemark}
                        </p>
                      ) : (
                        <p className="text-[10px] italic text-slate-500">
                          No additional remarks recorded.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Official Nepal CDC / NEB Letter Grading Scale */}
                <div className="border border-[#1a2b4c] rounded-lg overflow-hidden flex-[0.54] flex flex-col bg-white">
                  <table className="w-full text-left text-[9.5px] border-collapse h-full">
                    <thead className="bg-[#1a2b4c] text-white">
                      <tr>
                        <th className="px-2.5 py-1.5 font-bold uppercase tracking-wider">
                          Interval (%)
                        </th>
                        <th className="px-2 py-1.5 font-bold uppercase tracking-wider text-center">
                          Grade
                        </th>
                        <th className="px-2 py-1.5 font-bold uppercase tracking-wider text-center">
                          GPA
                        </th>
                        <th className="px-2.5 py-1.5 font-bold uppercase tracking-wider">
                          Description
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-semibold text-[#1a2b4c]">
                      {NEPAL_CDC_GRADING_SCALE.map((row) => (
                        <tr key={row.grade} className={row.grade === 'NG' ? 'bg-rose-50/50' : ''}>
                          <td className="px-2.5 py-1">{row.interval}</td>
                          <td className="px-2 py-1 text-center font-black">{row.grade}</td>
                          <td className="px-2 py-1 text-center font-mono">{row.gpa}</td>
                          <td className="px-2.5 py-1 text-slate-700">{row.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="text-[9px] text-slate-500 mt-2 text-center">
                Grading Policy: Nepal CDC / NEB Standard — Independent 35% pass threshold required in each configured Theory and Practical component. AB = Absent (Non-Graded).
              </p>

              {/* Spacer */}
              <div className="flex-1 min-h-[16px]" />

              {/* Footer with Signatures */}
              <div className="flex justify-between items-end px-2 pt-4 shrink-0 box-border border-t border-gray-200 mt-3">
                <div className="flex flex-col items-center">
                  <div className="font-bold italic text-[#1a2b4c] text-[11px] mb-1.5">
                    {publishedDateDisplay}
                  </div>
                  <div className="w-32 border-b-2 border-[#1a2b4c]" />
                  <div className="mt-1 font-bold text-[#1a2b4c] text-[10px] uppercase">
                    Date of Issue
                  </div>
                </div>

                <div className="flex flex-col items-center">
                  <div className="w-32 border-b-2 border-[#1a2b4c] mt-7" />
                  <div className="mt-1 font-bold text-[#1a2b4c] text-[10px] uppercase">
                    Class Teacher
                  </div>
                </div>

                <div className="flex flex-col items-center">
                  <div className="w-32 border-b-2 border-[#1a2b4c] mt-7" />
                  <div className="mt-1 font-bold text-[#1a2b4c] text-[10px] uppercase">
                    Principal
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
