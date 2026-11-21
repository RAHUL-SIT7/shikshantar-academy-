/**
 * Class Result Matrix Engine for Shikshantar Academy School ERP
 * Pure, authoritative data aggregation and calculation engine for:
 * - Transforming enrolled students, configured subjects, and saved marks into a structured matrix
 * - Preserving precise distinction between Missing, Zero (0), Absent (AB), and N/A (non-applicable)
 * - Integrating official Nepal Letter Grading rules (calculateSubjectResult, calculateAggregateResult)
 * - Enforcing Strict NG Option A (any failed or absent subject yields overall NG with no GPA)
 * - Enforcing completeness gates (incomplete rows receive no misleading GPA, grade, or rank)
 * - Explicitly identifying conflicting duplicate marks and returning validation error / conflict indicators
 * - Distinguishing provisional pre-publication ranking from official published ranks
 * - Computing class-level and subject-level completeness and performance statistics
 * 
 * Strict Architectural Restriction:
 * PURE TYPESCRIPT ONLY. No Firestore reads/writes, no network calls, no auth checks, no side-effects.
 */

import {
  calculateSubjectResult,
  calculateAggregateResult,
  SubjectConfig,
  SubjectInputMarks,
  SubjectGradeOutput,
  AggregateResultOutput
} from './nepalGradingEngine';
import { calculateClassRanks } from './resultPreparationEngine';

export interface EnrolledStudentInput {
  studentUid: string;
  studentId?: string;
  permanentStudentId?: string;
  studentEmis?: string;
  studentName: string;
  rollNo?: string;
  class?: string;
  section?: string;
  academicYear?: string;
  email?: string;
}

export interface SubjectConfigItem {
  thFullMarks?: number;
  thPassMarks?: number;
  prFullMarks?: number;
  prPassMarks?: number;
  hasTh?: boolean;
  hasPr?: boolean;
}

export interface SavedSubjectMarkRecord {
  studentUid?: string;
  studentId?: string;
  permanentStudentId?: string;
  examId?: string;
  subject: string;
  subjectKey?: string;
  marks?: number | 'AB' | string | null;
  thMarks?: number | 'AB' | string | null;
  prMarks?: number | 'AB' | string | null;
  thFull?: number;
  prFull?: number;
  thPass?: number;
  prPass?: number;
  fullMarks?: number;
  isAbsentTheory?: boolean;
  isAbsentPractical?: boolean;
  updatedAt?: string;
}

export interface MatrixAcademicContext {
  examId?: string;
  examType?: string;
  class: string;
  section?: string;
  academicYear?: string;
  isPublished?: boolean;
  status?: string;
}

export type MatrixComponentStatus = 'ENTERED' | 'ZERO' | 'ABSENT' | 'MISSING' | 'NOT_APPLICABLE';

export interface MatrixSubjectCell {
  subjectId: string;
  subjectName: string;
  subjectKey: string;
  hasTh: boolean;
  hasPr: boolean;
  thMarks: number | 'AB' | null;
  prMarks: number | 'AB' | null;
  thFullMarks: number;
  prFullMarks: number;
  totalFullMarks: number;
  totalObtainedMarks: number | null;
  thStatus: MatrixComponentStatus;
  prStatus: MatrixComponentStatus;
  isMissing: boolean;
  isAbsent: boolean;
  isTheoryAbsent: boolean;
  isPracticalAbsent: boolean;
  theoryGrade: string;
  practicalGrade: string;
  subjectGrade: string;
  subjectGradePoint: number;
  isNg: boolean;
  failureReasons: string[];
  hasConflict: boolean;
  conflictDetails?: string;
}

export interface MatrixStudentRow {
  studentUid: string;
  studentId: string;
  permanentStudentId: string;
  studentEmis: string;
  studentName: string;
  rollNo: string;
  class: string;
  section: string;
  academicYear: string;
  cells: Record<string, MatrixSubjectCell>;
  isComplete: boolean;
  missingSubjectCount: number;
  absentSubjectCount: number;
  totalFullMarks: number;
  totalObtainedMarks: number;
  aggregatePercentage: number;
  overallGrade: string;
  overallGpa: number | null;
  gpaDisplayText: string;
  overallStatus: 'PASSED' | 'NG' | 'QUALITATIVE' | 'CAS' | 'INCOMPLETE';
  failedSubjects: string[];
  rank: number | null;
  isProvisionalRank: boolean;
  provisionalRank: number | null;
  hasConflict: boolean;
  conflicts: string[];
}

export interface MatrixSubjectStat {
  subjectName: string;
  subjectKey: string;
  totalAssignedStudents: number;
  enteredCount: number;
  missingCount: number;
  absentCount: number;
  passCount: number;
  ngCount: number;
  isComplete: boolean;
}

export interface MatrixConflictRecord {
  studentIdentifier: string;
  studentName?: string;
  subject: string;
  details: string;
  conflictingMarks: Array<{
    thMarks?: number | 'AB' | string | null;
    prMarks?: number | 'AB' | string | null;
    updatedAt?: string;
  }>;
}

export interface ClassResultMatrixOutput {
  context: MatrixAcademicContext;
  configuredSubjects: string[];
  subjectConfigs: Record<string, SubjectConfigItem>;
  students: MatrixStudentRow[];
  conflicts: MatrixConflictRecord[];
  validationErrors: string[];
  stats: {
    totalStudents: number;
    completeStudents: number;
    incompleteStudents: number;
    conflictedStudentsCount: number;
    absentStudentsCount: number;
    passedStudentsCount: number;
    ngStudentsCount: number;
    qualitativeOrCasCount: number;
    subjectStats: Record<string, MatrixSubjectStat>;
  };
}

/**
 * Normalizes subject string for uniform map keys
 */
export function normalizeMatrixSubject(subj: string): string {
  if (!subj) return '';
  return subj.trim().toLowerCase();
}

/**
 * Parses numerical marks safely, preserving null on missing and 'AB' on absent.
 * Accepts numbers, strings containing numbers/decimals, and 'AB'.
 */
function parseComponentMark(val: unknown, isAbsentFlag?: boolean): number | 'AB' | null {
  if (isAbsentFlag === true) return 'AB';
  if (val === 'AB' || val === 'ab') return 'AB';
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  if (Number.isFinite(num) && !isNaN(num)) {
    return num;
  }
  return null;
}

/**
 * Evaluates component status accurately distinguishing Missing, Valid Zero, Absent, and N/A.
 */
function deriveComponentStatus(
  hasComponent: boolean,
  mark: number | 'AB' | null
): MatrixComponentStatus {
  if (!hasComponent) return 'NOT_APPLICABLE';
  if (mark === 'AB') return 'ABSENT';
  if (mark === null) return 'MISSING';
  if (mark === 0) return 'ZERO';
  return 'ENTERED';
}

/**
 * Checks whether two saved mark records for the same student + subject contain identical marks.
 */
function areSubjectMarksEqual(a: SavedSubjectMarkRecord, b: SavedSubjectMarkRecord): boolean {
  const isAbsThA = Boolean(a.isAbsentTheory || a.thMarks === 'AB' || a.thMarks === 'ab');
  const isAbsThB = Boolean(b.isAbsentTheory || b.thMarks === 'AB' || b.thMarks === 'ab');
  if (isAbsThA !== isAbsThB) return false;

  const thA = isAbsThA
    ? 'AB'
    : (a.thMarks !== undefined && a.thMarks !== null && a.thMarks !== ''
        ? (a.thMarks === 'AB' ? 'AB' : Number(a.thMarks))
        : (a.marks !== undefined && a.marks !== null && a.marks !== ''
            ? (a.marks === 'AB' ? 'AB' : Number(a.marks))
            : null));

  const thB = isAbsThB
    ? 'AB'
    : (b.thMarks !== undefined && b.thMarks !== null && b.thMarks !== ''
        ? (b.thMarks === 'AB' ? 'AB' : Number(b.thMarks))
        : (b.marks !== undefined && b.marks !== null && b.marks !== ''
            ? (b.marks === 'AB' ? 'AB' : Number(b.marks))
            : null));

  if (thA !== thB) return false;

  const isAbsPrA = Boolean(a.isAbsentPractical || a.prMarks === 'AB' || a.prMarks === 'ab');
  const isAbsPrB = Boolean(b.isAbsentPractical || b.prMarks === 'AB' || b.prMarks === 'ab');
  if (isAbsPrA !== isAbsPrB) return false;

  const prA = isAbsPrA
    ? 'AB'
    : (a.prMarks !== undefined && a.prMarks !== null && a.prMarks !== ''
        ? (a.prMarks === 'AB' ? 'AB' : Number(a.prMarks))
        : null);

  const prB = isAbsPrB
    ? 'AB'
    : (b.prMarks !== undefined && b.prMarks !== null && b.prMarks !== ''
        ? (b.prMarks === 'AB' ? 'AB' : Number(b.prMarks))
        : null);

  if (prA !== prB) return false;

  return true;
}

/**
 * Pure engine that generates the structured Class Result Matrix.
 */
export function generateClassResultMatrix(params: {
  enrolledStudents: EnrolledStudentInput[];
  configuredSubjects: string[];
  subjectConfigs?: Record<string, SubjectConfigItem>;
  savedMarks: SavedSubjectMarkRecord[];
  context: MatrixAcademicContext;
}): ClassResultMatrixOutput {
  const {
    enrolledStudents = [],
    configuredSubjects = [],
    subjectConfigs = {},
    savedMarks = [],
    context
  } = params;

  // 1. Defensively deduplicate configured subjects maintaining original order
  const uniqueSubjects: string[] = [];
  const seenSubjKeys = new Set<string>();
  for (const s of configuredSubjects) {
    if (typeof s === 'string' && s.trim()) {
      const clean = s.trim();
      const norm = normalizeMatrixSubject(clean);
      if (!seenSubjKeys.has(norm)) {
        seenSubjKeys.add(norm);
        uniqueSubjects.push(clean);
      }
    }
  }

  // 2. Build normalized Subject Configuration map
  const resolvedConfigs: Record<string, SubjectConfigItem> = {};
  for (const s of uniqueSubjects) {
    const rawCfg = subjectConfigs[s] || {};
    const hasTh = rawCfg.hasTh !== undefined ? Boolean(rawCfg.hasTh) : true;
    const hasPr = rawCfg.hasPr !== undefined ? Boolean(rawCfg.hasPr) : false;

    // Explicit full marks or standard default (do not default practical if hasPr is false)
    const thFull = hasTh ? (typeof rawCfg.thFullMarks === 'number' && rawCfg.thFullMarks >= 0 ? rawCfg.thFullMarks : 75) : 0;
    const prFull = hasPr ? (typeof rawCfg.prFullMarks === 'number' && rawCfg.prFullMarks >= 0 ? rawCfg.prFullMarks : 25) : 0;

    const thPass = hasTh
      ? (typeof rawCfg.thPassMarks === 'number' && rawCfg.thPassMarks >= 0 ? rawCfg.thPassMarks : Math.ceil(thFull * 0.35))
      : 0;
    const prPass = hasPr
      ? (typeof rawCfg.prPassMarks === 'number' && rawCfg.prPassMarks >= 0 ? rawCfg.prPassMarks : Math.ceil(prFull * 0.35))
      : 0;

    resolvedConfigs[s] = {
      thFullMarks: thFull,
      prFullMarks: prFull,
      thPassMarks: thPass,
      prPassMarks: prPass,
      hasTh,
      hasPr
    };
  }

  // 3. Build index for saved marks: studentUid/studentId + normalizedSubject
  // Explicitly detects conflicting duplicate marks instead of silently selecting one
  const marksMap = new Map<string, SavedSubjectMarkRecord>();
  const conflictMap = new Map<string, MatrixConflictRecord>();

  for (const m of savedMarks) {
    if (!m || !m.subject) continue;
    const normSubj = normalizeMatrixSubject(m.subject);

    const keysToMap: Array<{ key: string; id: string }> = [];
    if (m.studentUid) keysToMap.push({ key: `${m.studentUid}_${normSubj}`, id: m.studentUid });
    if (m.studentId) keysToMap.push({ key: `${m.studentId}_${normSubj}`, id: m.studentId });
    if (m.permanentStudentId) keysToMap.push({ key: `${m.permanentStudentId}_${normSubj}`, id: m.permanentStudentId });

    for (const { key, id } of keysToMap) {
      const existing = marksMap.get(key);
      if (!existing) {
        marksMap.set(key, m);
      } else {
        if (areSubjectMarksEqual(existing, m)) {
          // Identical duplicate marks: deterministic deduplication is safe
          const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
          const newTime = m.updatedAt ? new Date(m.updatedAt).getTime() : 0;
          if (newTime >= existingTime) {
            marksMap.set(key, m);
          }
        } else {
          // Conflicting duplicate marks: DO NOT silently select one!
          const thA = existing.isAbsentTheory ? 'AB' : (existing.thMarks ?? existing.marks ?? 'null');
          const prA = existing.isAbsentPractical ? 'AB' : (existing.prMarks ?? 'null');
          const thB = m.isAbsentTheory ? 'AB' : (m.thMarks ?? m.marks ?? 'null');
          const prB = m.isAbsentPractical ? 'AB' : (m.prMarks ?? 'null');

          const conflictDetails = `Conflicting duplicate marks for student "${id}" in subject "${m.subject}": Record 1 has [TH: ${thA}, PR: ${prA}], Record 2 has [TH: ${thB}, PR: ${prB}].`;

          const existingConflict = conflictMap.get(key);
          if (!existingConflict) {
            conflictMap.set(key, {
              studentIdentifier: id,
              subject: m.subject,
              details: conflictDetails,
              conflictingMarks: [
                { thMarks: existing.thMarks, prMarks: existing.prMarks, updatedAt: existing.updatedAt },
                { thMarks: m.thMarks, prMarks: m.prMarks, updatedAt: m.updatedAt }
              ]
            });
          } else {
            existingConflict.conflictingMarks.push({
              thMarks: m.thMarks,
              prMarks: m.prMarks,
              updatedAt: m.updatedAt
            });
          }
        }
      }
    }
  }

  // 4. Defensively deduplicate students deterministically
  const deduplicatedStudents: EnrolledStudentInput[] = [];
  const seenStudentUids = new Set<string>();

  for (const std of enrolledStudents) {
    if (!std) continue;
    const uid = (std.studentUid || std.studentId || '').trim();
    if (!uid) continue;

    if (!seenStudentUids.has(uid)) {
      seenStudentUids.add(uid);
      deduplicatedStudents.push({ ...std });
    }
  }

  // Sort students deterministically: rollNo ascending (numeric if possible), then studentName, then studentUid
  deduplicatedStudents.sort((a, b) => {
    const rollA = parseInt(a.rollNo || '', 10);
    const rollB = parseInt(b.rollNo || '', 10);
    if (!isNaN(rollA) && !isNaN(rollB) && rollA !== rollB) {
      return rollA - rollB;
    }
    const nameCmp = (a.studentName || '').localeCompare(b.studentName || '');
    if (nameCmp !== 0) return nameCmp;
    return (a.studentUid || '').localeCompare(b.studentUid || '');
  });

  // 5. Build Student Rows and Subject Cells
  const studentRows: MatrixStudentRow[] = [];
  const allMatrixConflicts: MatrixConflictRecord[] = [];
  const validationErrors: string[] = [];

  for (const std of deduplicatedStudents) {
    const cells: Record<string, MatrixSubjectCell> = {};
    const subjectOutputsForAggregate: SubjectGradeOutput[] = [];
    const studentConflicts: string[] = [];

    let isStudentComplete = true;
    let missingSubjCount = 0;
    let absentSubjCount = 0;
    let totalFullSum = 0;
    let totalObtSum = 0;
    let studentHasConflict = false;
    const failedSubjects: string[] = [];

    for (const subj of uniqueSubjects) {
      const cfg = resolvedConfigs[subj];
      const normSubj = normalizeMatrixSubject(subj);

      // Check if there is an unresolved conflict for this student + subject
      const conflictRecord =
        conflictMap.get(`${std.studentUid}_${normSubj}`) ||
        (std.studentId ? conflictMap.get(`${std.studentId}_${normSubj}`) : undefined) ||
        (std.permanentStudentId ? conflictMap.get(`${std.permanentStudentId}_${normSubj}`) : undefined);

      if (conflictRecord) {
        // Conflicting duplicate marks: fail closed, do not silently select
        isStudentComplete = false;
        studentHasConflict = true;
        missingSubjCount++;
        studentConflicts.push(conflictRecord.details);

        if (!allMatrixConflicts.some(c => c.studentIdentifier === conflictRecord.studentIdentifier && c.subject === conflictRecord.subject)) {
          allMatrixConflicts.push({ ...conflictRecord, studentName: std.studentName });
          validationErrors.push(conflictRecord.details);
        }

        const totalFull = (cfg.thFullMarks || 0) + (cfg.prFullMarks || 0);
        totalFullSum += totalFull;

        cells[subj] = {
          subjectId: subj,
          subjectName: subj,
          subjectKey: subj.replace(/[^a-zA-Z0-9_.-]/g, ''),
          hasTh: cfg.hasTh!,
          hasPr: cfg.hasPr!,
          thMarks: null,
          prMarks: null,
          thFullMarks: cfg.thFullMarks!,
          prFullMarks: cfg.prFullMarks!,
          totalFullMarks: totalFull,
          totalObtainedMarks: null,
          thStatus: 'MISSING',
          prStatus: cfg.hasPr ? 'MISSING' : 'NOT_APPLICABLE',
          isMissing: true,
          isAbsent: false,
          isTheoryAbsent: false,
          isPracticalAbsent: false,
          theoryGrade: 'CONFLICT',
          practicalGrade: 'CONFLICT',
          subjectGrade: 'CONFLICT',
          subjectGradePoint: 0.0,
          isNg: true,
          failureReasons: [conflictRecord.details],
          hasConflict: true,
          conflictDetails: conflictRecord.details
        };
        continue;
      }

      // Search mark record
      const markRecord =
        marksMap.get(`${std.studentUid}_${normSubj}`) ||
        (std.studentId ? marksMap.get(`${std.studentId}_${normSubj}`) : undefined) ||
        (std.permanentStudentId ? marksMap.get(`${std.permanentStudentId}_${normSubj}`) : undefined);

      // Parse TH and PR components
      let rawTh: unknown = markRecord ? (markRecord.thMarks !== undefined ? markRecord.thMarks : null) : null;
      let rawPr: unknown = markRecord ? (markRecord.prMarks !== undefined ? markRecord.prMarks : null) : null;

      // Handle legacy records where single total marks was supplied for theory-only
      if (rawTh === null && rawPr === null && markRecord && markRecord.marks !== undefined && markRecord.marks !== null) {
        if (cfg.hasTh && !cfg.hasPr) {
          rawTh = markRecord.marks;
        }
      }

      const thMark = cfg.hasTh ? parseComponentMark(rawTh, markRecord?.isAbsentTheory) : null;
      const prMark = cfg.hasPr ? parseComponentMark(rawPr, markRecord?.isAbsentPractical) : null;

      const thStatus = deriveComponentStatus(cfg.hasTh!, thMark);
      const prStatus = deriveComponentStatus(cfg.hasPr!, prMark);

      const isThMissing = cfg.hasTh! && thStatus === 'MISSING';
      const isPrMissing = cfg.hasPr! && prStatus === 'MISSING';
      const isCellMissing = isThMissing || isPrMissing;

      const isThAbs = cfg.hasTh! && thStatus === 'ABSENT';
      const isPrAbs = cfg.hasPr! && prStatus === 'ABSENT';
      const isCellAbsent = isThAbs || isPrAbs;

      if (isCellMissing) {
        isStudentComplete = false;
        missingSubjCount++;
      }
      if (isCellAbsent) {
        absentSubjCount++;
      }

      // Reusable grading engine input
      const gradingInput: SubjectInputMarks = {
        theoryMarks: thMark,
        practicalMarks: prMark,
        isAbsentTheory: isThAbs,
        isAbsentPractical: isPrAbs
      };

      const gradingConfig: SubjectConfig = {
        thFullMarks: cfg.thFullMarks,
        prFullMarks: cfg.prFullMarks,
        thPassMarks: cfg.thPassMarks,
        prPassMarks: cfg.prPassMarks,
        hasTh: cfg.hasTh,
        hasPr: cfg.hasPr
      };

      const subjResult = calculateSubjectResult(
        subj,
        subj,
        gradingInput,
        gradingConfig
      );

      // Total obtained calculation
      let cellTotalObt: number | null = null;
      if (!isCellMissing) {
        let obt = 0;
        if (cfg.hasTh && typeof thMark === 'number') obt += thMark;
        if (cfg.hasPr && typeof prMark === 'number') obt += prMark;
        cellTotalObt = obt;
        totalObtSum += obt;
      }
      totalFullSum += subjResult.totalFullMarks;

      if (subjResult.isNg) {
        failedSubjects.push(subj);
      }

      cells[subj] = {
        subjectId: subj,
        subjectName: subj,
        subjectKey: markRecord?.subjectKey || subj.replace(/[^a-zA-Z0-9_.-]/g, ''),
        hasTh: cfg.hasTh!,
        hasPr: cfg.hasPr!,
        thMarks: thMark,
        prMarks: prMark,
        thFullMarks: cfg.thFullMarks!,
        prFullMarks: cfg.prFullMarks!,
        totalFullMarks: subjResult.totalFullMarks,
        totalObtainedMarks: cellTotalObt,
        thStatus,
        prStatus,
        isMissing: isCellMissing,
        isAbsent: isCellAbsent,
        isTheoryAbsent: isThAbs,
        isPracticalAbsent: isPrAbs,
        theoryGrade: subjResult.theoryGrade,
        practicalGrade: subjResult.practicalGrade,
        subjectGrade: isCellMissing ? '-' : subjResult.subjectGrade,
        subjectGradePoint: isCellMissing ? 0.0 : subjResult.subjectGradePoint,
        isNg: subjResult.isNg,
        failureReasons: subjResult.failureReasons,
        hasConflict: false
      };

      subjectOutputsForAggregate.push(subjResult);
    }

    // Evaluate overall aggregate for the student row
    let overallGrade = '-';
    let overallGpa: number | null = null;
    let gpaDisplayText = '-';
    let overallStatus: 'PASSED' | 'NG' | 'QUALITATIVE' | 'CAS' | 'INCOMPLETE' = 'INCOMPLETE';
    let aggregatePct = 0;

    if (!isStudentComplete) {
      overallStatus = 'INCOMPLETE';
      overallGrade = 'INCOMPLETE';
      overallGpa = null;
      gpaDisplayText = '-';
      aggregatePct = totalFullSum > 0 ? Math.round(((totalObtSum / totalFullSum) * 100) * 100) / 100 : 0;
    } else {
      // Complete row: Authoritatively evaluate via calculateAggregateResult
      const aggregateOutput: AggregateResultOutput = calculateAggregateResult(
        context.class,
        subjectOutputsForAggregate
      );

      overallGrade = aggregateOutput.overallGrade;
      overallGpa = aggregateOutput.overallGpa;
      gpaDisplayText = aggregateOutput.gpaDisplayText;
      overallStatus = aggregateOutput.overallStatus;
      aggregatePct = aggregateOutput.aggregatePercentage;
    }

    studentRows.push({
      studentUid: std.studentUid,
      studentId: std.studentId || std.permanentStudentId || std.studentUid,
      permanentStudentId: std.permanentStudentId || std.studentId || std.studentUid,
      studentEmis: std.studentEmis || '',
      studentName: std.studentName,
      rollNo: std.rollNo || '',
      class: std.class || context.class,
      section: std.section || context.section || 'All',
      academicYear: std.academicYear || context.academicYear || '',
      cells,
      isComplete: isStudentComplete,
      missingSubjectCount: missingSubjCount,
      absentSubjectCount: absentSubjCount,
      totalFullMarks: totalFullSum,
      totalObtainedMarks: totalObtSum,
      aggregatePercentage: aggregatePct,
      overallGrade,
      overallGpa,
      gpaDisplayText,
      overallStatus,
      failedSubjects,
      rank: null,
      isProvisionalRank: false,
      provisionalRank: null,
      hasConflict: studentHasConflict,
      conflicts: studentConflicts
    });
  }

  // 6. Ranking Policy: Do not generate new rank or provisional rank for new workflow.
  // Preserve existing historical rank if present on pre-existing documents.
  for (const r of studentRows) {
    r.rank = (r as any).existingRank ?? null;
    r.provisionalRank = null;
    r.isProvisionalRank = false;
  }

  // 7. Calculate Subject-Wise and Class-Level Statistics
  const subjectStats: Record<string, MatrixSubjectStat> = {};
  for (const subj of uniqueSubjects) {
    let entered = 0;
    let missing = 0;
    let absent = 0;
    let pass = 0;
    let ng = 0;

    for (const row of studentRows) {
      const cell = row.cells[subj];
      if (!cell) continue;

      if (cell.isMissing) {
        missing++;
      } else {
        entered++;
      }

      if (cell.isAbsent) {
        absent++;
      }

      if (!cell.isMissing) {
        if (cell.isNg) {
          ng++;
        } else {
          pass++;
        }
      }
    }

    subjectStats[subj] = {
      subjectName: subj,
      subjectKey: resolvedConfigs[subj] ? subj.replace(/[^a-zA-Z0-9_.-]/g, '') : subj,
      totalAssignedStudents: studentRows.length,
      enteredCount: entered,
      missingCount: missing,
      absentCount: absent,
      passCount: pass,
      ngCount: ng,
      isComplete: studentRows.length > 0 && missing === 0
    };
  }

  const completeStudents = studentRows.filter(r => r.isComplete).length;
  const incompleteStudents = studentRows.length - completeStudents;
  const conflictedStudentsCount = studentRows.filter(r => r.hasConflict).length;
  const absentStudentsCount = studentRows.filter(r => r.absentSubjectCount > 0).length;
  const passedStudentsCount = studentRows.filter(r => r.isComplete && r.overallStatus === 'PASSED').length;
  const ngStudentsCount = studentRows.filter(r => r.isComplete && r.overallStatus === 'NG').length;
  const qualitativeOrCasCount = studentRows.filter(r => r.isComplete && (r.overallStatus === 'QUALITATIVE' || r.overallStatus === 'CAS')).length;

  return {
    context: { ...context },
    configuredSubjects: uniqueSubjects,
    subjectConfigs: resolvedConfigs,
    students: studentRows,
    conflicts: allMatrixConflicts,
    validationErrors,
    stats: {
      totalStudents: studentRows.length,
      completeStudents,
      incompleteStudents,
      conflictedStudentsCount,
      absentStudentsCount,
      passedStudentsCount,
      ngStudentsCount,
      qualitativeOrCasCount,
      subjectStats
    }
  };
}
