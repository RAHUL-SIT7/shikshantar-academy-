/**
 * Canonical Nepal CDC / NEB Letter Grading Directive (2078) Engine
 * Single authoritative grading implementation for Shikshantar Academy (Play Group – Grade 10).
 *
 * Core Rules:
 * 1. Independent 35% passing threshold on EVERY configured evaluated component (Theory & Practical).
 * 2. Five strictly distinct mark concepts:
 *    - Numeric zero (0): Valid numeric mark; below 35% => NG.
 *    - Absent ('AB'): Distinct from 0; results in NG in that component & subject.
 *    - Missing (null / undefined / ''): Preserved as missing; never silently converted to 0; yields INCOMPLETE.
 *    - Not Applicable (hasPr = false or prFullMarks = 0): Practical never invented or required.
 *    - Invalid (negative, > fullMarks, non-numeric string): Rejected explicitly.
 * 3. Strict NG Aggregate Rule:
 *    - If ANY subject has NG (including AB or <35% in Theory/Practical), overall GPA = null (display '-'),
 *      overallGrade = 'NG', overallStatus = 'NG', and failedSubjects lists every NG subject.
 *    - If ANY subject has missing marks, overall GPA = null (display '-'), overallGrade = 'INC',
 *      overallStatus = 'INCOMPLETE' — never fabricates a PASS or numeric GPA.
 * 4. Standard unweighted Nepal CDC GPA (no credit-hour weighting).
 */

export interface SubjectConfig {
  thFullMarks?: number;
  thPassMarks?: number;
  prFullMarks?: number;
  prPassMarks?: number;
  hasTh?: boolean;
  hasPr?: boolean;
}

export interface SubjectInputMarks {
  theoryMarks: number | 'AB' | null | undefined;
  practicalMarks: number | 'AB' | null | undefined;
  isAbsentTheory?: boolean;
  isAbsentPractical?: boolean;
}

export interface SubjectGradeOutput {
  subjectId: string;
  subjectName: string;
  theoryMarks: number | 'AB' | null;
  practicalMarks: number | 'AB' | null;
  thFullMarks: number;
  prFullMarks: number;
  totalFullMarks: number;
  totalObtainedMarks: number | null;
  theoryGrade: string;
  practicalGrade: string;
  subjectGrade: string;
  subjectGradePoint: number;
  isNg: boolean;
  isIncomplete: boolean;
  isInvalid: boolean;
  failureReasons: string[];
}

export interface AggregateResultOutput {
  totalFullMarks: number;
  totalObtainedMarks: number;
  aggregatePercentage: number;
  overallGrade: string;
  overallGpa: number | null; // Null when any subject is NG or INCOMPLETE
  gpaDisplayText: string;    // '-' when NG or INCOMPLETE
  overallStatus: 'PASSED' | 'NG' | 'INCOMPLETE' | 'QUALITATIVE' | 'CAS';
  failedSubjects: string[];
  incompleteSubjects: string[];
  isNg: boolean;
  isIncomplete: boolean;
  academicTier: 'EARLY_CHILDHOOD' | 'LOWER_PRIMARY' | 'UPPER_PRIMARY' | 'SECONDARY';
}

export interface MarkValidationResult {
  valid: boolean;
  kind: 'NUMBER' | 'AB' | 'MISSING' | 'NOT_APPLICABLE' | 'INVALID';
  value: number | 'AB' | null;
  error?: string;
}

export const NEPAL_CDC_GRADING_SCALE = [
  { interval: '90% – 100%', grade: 'A+', gpa: '4.0', gpaMin: 3.61, description: 'Outstanding' },
  { interval: '80% – <90%', grade: 'A',  gpa: '3.6', gpaMin: 3.21, description: 'Excellent' },
  { interval: '70% – <80%', grade: 'B+', gpa: '3.2', gpaMin: 2.81, description: 'Very Good' },
  { interval: '60% – <70%', grade: 'B',  gpa: '2.8', gpaMin: 2.41, description: 'Good' },
  { interval: '50% – <60%', grade: 'C+', gpa: '2.4', gpaMin: 2.01, description: 'Satisfactory' },
  { interval: '40% – <50%', grade: 'C',  gpa: '2.0', gpaMin: 1.61, description: 'Acceptable' },
  { interval: '35% – <40%', grade: 'D',  gpa: '1.6', gpaMin: 1.60, description: 'Basic' },
  { interval: 'Below 35% / AB', grade: 'NG', gpa: '-', gpaMin: 0.0, description: 'Not Graded' }
] as const;

/**
 * Authoritative single-component mark validator shared identically between Frontend and Backend.
 */
export function validateMarkValue(
  raw: unknown,
  fullMarks: number,
  isAbsent: boolean = false,
  componentEnabled: boolean = true
): MarkValidationResult {
  if (!componentEnabled || fullMarks <= 0) {
    const hasUnexpectedInput =
      isAbsent ||
      (raw !== undefined && raw !== null && raw !== '' && raw !== 0 && raw !== '0');
    if (hasUnexpectedInput) {
      return {
        valid: false,
        kind: 'INVALID',
        value: null,
        error: 'Marks or absent status cannot be submitted for an unconfigured component.'
      };
    }
    return { valid: true, kind: 'NOT_APPLICABLE', value: null };
  }

  // Normalize string inputs
  const strVal = typeof raw === 'string' ? raw.trim() : '';
  const rawIsAb = typeof raw === 'string' && strVal.toUpperCase() === 'AB';

  // Mutual exclusivity: numeric value + absent flag simultaneously
  if (isAbsent && raw !== undefined && raw !== null && raw !== '' && !rawIsAb) {
    return {
      valid: false,
      kind: 'INVALID',
      value: null,
      error: 'Both numeric marks and Absent (AB) cannot be set simultaneously.'
    };
  }

  if (isAbsent || rawIsAb) {
    return { valid: true, kind: 'AB', value: 'AB' };
  }

  // Strictly preserve missing/empty inputs as MISSING (never convert to 0)
  if (raw === undefined || raw === null || (typeof raw === 'string' && strVal === '')) {
    return { valid: true, kind: 'MISSING', value: null };
  }

  // Reject non-numeric strings (e.g. "abc", "NaN", "12a")
  if (typeof raw === 'string' && !/^-?\d+(\.\d+)?$/.test(strVal)) {
    return {
      valid: false,
      kind: 'INVALID',
      value: null,
      error: `Invalid mark value "${raw}". Enter a number between 0 and ${fullMarks}, or mark AB.`
    };
  }

  const num = Number(raw);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    return {
      valid: false,
      kind: 'INVALID',
      value: null,
      error: `Invalid numeric mark "${raw}".`
    };
  }

  if (num < 0) {
    return {
      valid: false,
      kind: 'INVALID',
      value: null,
      error: `Mark (${num}) cannot be negative.`
    };
  }

  if (num > fullMarks) {
    return {
      valid: false,
      kind: 'INVALID',
      value: null,
      error: `Mark (${num}) exceeds configured full marks (${fullMarks}).`
    };
  }

  return { valid: true, kind: 'NUMBER', value: num };
}

/**
 * Maps a numerical percentage (0–100) to official Nepal CDC Letter Grade and Grade Point.
 */
export function getNepalGradePoint(percentage: number): { grade: string; gradePoint: number } {
  if (!Number.isFinite(percentage) || percentage < 0) {
    return { grade: 'NG', gradePoint: 0.0 };
  }
  const p = Math.round(percentage * 100) / 100;
  if (p >= 90) return { grade: 'A+', gradePoint: 4.0 };
  if (p >= 80) return { grade: 'A', gradePoint: 3.6 };
  if (p >= 70) return { grade: 'B+', gradePoint: 3.2 };
  if (p >= 60) return { grade: 'B', gradePoint: 2.8 };
  if (p >= 50) return { grade: 'C+', gradePoint: 2.4 };
  if (p >= 40) return { grade: 'C', gradePoint: 2.0 };
  if (p >= 35) return { grade: 'D', gradePoint: 1.6 };
  return { grade: 'NG', gradePoint: 0.0 };
}

/**
 * Maps an unweighted Nepal CDC GPA (0.0–4.0) to its official Letter Grade.
 */
export function getNepalGradeFromGpa(gpa: number | null): string {
  if (gpa === null || !Number.isFinite(gpa) || gpa < 1.6) return 'NG';
  if (gpa > 3.6) return 'A+';
  if (gpa > 3.2) return 'A';
  if (gpa > 2.8) return 'B+';
  if (gpa > 2.4) return 'B';
  if (gpa > 2.0) return 'C+';
  if (gpa > 1.6) return 'C';
  return 'D';
}

/**
 * Backward-compatible alias using the single canonical Nepal CDC engine.
 */
export function getNepalGPA(percentage: number): number {
  return getNepalGradePoint(percentage).gradePoint;
}

/**
 * Backward-compatible single-value grade helper using the canonical 35% Nepal CDC rule.
 */
export function getGrade(marks: number | 'AB' | null | undefined, fm: number, pm?: number): string {
  if (marks === null || marks === undefined) return 'INC';
  if (marks === 'AB' || fm <= 0) return 'NG';
  if (!Number.isFinite(marks) || marks < 0 || marks > fm) return 'NG';
  const pct = (marks / fm) * 100;
  if (pct < 35) return 'NG';
  if (pm !== undefined && pm > 0 && marks < pm) return 'NG';
  return getNepalGradePoint(pct).grade;
}

/**
 * Normalizes class string to standard academic tier (Play Group through Grade 10 only).
 */
export function getAcademicTier(className: string): 'EARLY_CHILDHOOD' | 'LOWER_PRIMARY' | 'UPPER_PRIMARY' | 'SECONDARY' {
  const clean = String(className || '').replace(/^Class\s+/i, '').trim().toUpperCase();
  if (['PG', 'PLAY GROUP', 'PLAYGROUP', 'NURSERY', 'LKG', 'UKG'].includes(clean)) {
    return 'EARLY_CHILDHOOD';
  }
  if (['1', '2', '3'].includes(clean)) {
    return 'LOWER_PRIMARY';
  }
  if (['4', '5'].includes(clean)) {
    return 'UPPER_PRIMARY';
  }
  return 'SECONDARY'; // Grades 6–10
}

/**
 * Computes authoritative grade, independent 35% component pass checks, and grade points for a single subject.
 */
export function calculateSubjectResult(
  subjectId: string,
  subjectName: string,
  input: SubjectInputMarks,
  config: SubjectConfig
): SubjectGradeOutput {
  const failureReasons: string[] = [];
  let isNg = false;
  let isIncomplete = false;
  let isInvalid = false;

  const hasTh = config.hasTh !== false && (config.thFullMarks === undefined ? true : Number(config.thFullMarks) > 0);
  const hasPr = config.hasPr === true && Number(config.prFullMarks || 0) > 0;

  const thFull = hasTh ? Number(config.thFullMarks ?? 75) : 0;
  const prFull = hasPr ? Number(config.prFullMarks ?? 25) : 0;
  const totalFullMarks = thFull + prFull;

  // Nepal CDC 35% threshold (exact percentage check >= 35%, plus configured pass mark if higher)
  const thPass = hasTh
    ? (config.thPassMarks !== undefined && Number(config.thPassMarks) > 0 ? Number(config.thPassMarks) : Math.ceil(thFull * 0.35))
    : 0;
  const prPass = hasPr
    ? (config.prPassMarks !== undefined && Number(config.prPassMarks) > 0 ? Number(config.prPassMarks) : Math.ceil(prFull * 0.35))
    : 0;

  const thCheck = validateMarkValue(input.theoryMarks, thFull, Boolean(input.isAbsentTheory), hasTh);
  const prCheck = validateMarkValue(input.practicalMarks, prFull, Boolean(input.isAbsentPractical), hasPr);

  const thObtained = thCheck.value;
  const prObtained = prCheck.value;

  let thGrade = hasTh ? '-' : 'N/A';
  let prGrade = hasPr ? '-' : 'N/A';

  // 1. Evaluate Theory Component (independent 35% gate)
  if (hasTh) {
    if (!thCheck.valid || thCheck.kind === 'INVALID') {
      isInvalid = true;
      isNg = true;
      thGrade = 'ERR';
      failureReasons.push(thCheck.error || 'Invalid Theory Mark');
    } else if (thCheck.kind === 'MISSING') {
      isIncomplete = true;
      thGrade = 'INC';
      failureReasons.push('Theory Mark Missing');
    } else if (thCheck.kind === 'AB') {
      isNg = true;
      thGrade = 'NG';
      failureReasons.push('Theory Absent (AB)');
    } else if (typeof thObtained === 'number') {
      const thPct = thFull > 0 ? (thObtained / thFull) * 100 : 0;
      const mapped = getNepalGradePoint(thPct);
      thGrade = mapped.grade;
      // Independent 35% pass check on Theory component
      if (thPct < 35 || (thPass > 0 && thObtained < thPass && thPass <= thFull && (thPass / thFull) * 100 >= 35)) {
        isNg = true;
        thGrade = 'NG';
        failureReasons.push(`Theory Below 35% Pass Threshold (${thObtained}/${thFull})`);
      }
    }
  }

  // 2. Evaluate Practical Component (independent 35% gate, ONLY if Practical is configured)
  if (hasPr) {
    if (!prCheck.valid || prCheck.kind === 'INVALID') {
      isInvalid = true;
      isNg = true;
      prGrade = 'ERR';
      failureReasons.push(prCheck.error || 'Invalid Practical Mark');
    } else if (prCheck.kind === 'MISSING') {
      isIncomplete = true;
      prGrade = 'INC';
      failureReasons.push('Practical Mark Missing');
    } else if (prCheck.kind === 'AB') {
      isNg = true;
      prGrade = 'NG';
      failureReasons.push('Practical Absent (AB)');
    } else if (typeof prObtained === 'number') {
      const prPct = prFull > 0 ? (prObtained / prFull) * 100 : 0;
      const mapped = getNepalGradePoint(prPct);
      prGrade = mapped.grade;
      // Independent 35% pass check on Practical component
      if (prPct < 35 || (prPass > 0 && prObtained < prPass && prPass <= prFull && (prPass / prFull) * 100 >= 35)) {
        isNg = true;
        prGrade = 'NG';
        failureReasons.push(`Practical Below 35% Pass Threshold (${prObtained}/${prFull})`);
      }
    }
  } else if (!prCheck.valid) {
    isInvalid = true;
    isNg = true;
    prGrade = 'ERR';
    failureReasons.push(prCheck.error || 'Unconfigured Practical Mark Rejected');
  }

  // 3. Compute Subject Total & Overall Subject Grade
  let totalObtainedMarks: number | null = null;
  let subjectGrade = 'NG';
  let subjectGradePoint = 0.0;

  if (isInvalid) {
    subjectGrade = 'NG';
    subjectGradePoint = 0.0;
    isNg = true;
  } else if (isIncomplete) {
    // Missing marks MUST NOT be fabricated into 0 or PASS
    subjectGrade = 'INC';
    subjectGradePoint = 0.0;
    totalObtainedMarks = null;
  } else if (isNg) {
    // Preserve numeric sum if both components are numeric (even when one failed <35%), null if AB-only
    const thNum = hasTh && typeof thObtained === 'number' ? thObtained : null;
    const prNum = hasPr && typeof prObtained === 'number' ? prObtained : null;
    if ((hasTh && thNum === null) && (hasPr && prNum === null)) {
      totalObtainedMarks = null;
    } else if ((hasTh && thObtained === 'AB') && !hasPr) {
      totalObtainedMarks = null;
    } else {
      totalObtainedMarks = (thNum ?? 0) + (prNum ?? 0);
    }
    subjectGrade = 'NG';
    subjectGradePoint = 0.0;
  } else {
    const thNum = hasTh && typeof thObtained === 'number' ? thObtained : 0;
    const prNum = hasPr && typeof prObtained === 'number' ? prObtained : 0;
    totalObtainedMarks = thNum + prNum;

    const overallSubjectPct = totalFullMarks > 0 ? (totalObtainedMarks / totalFullMarks) * 100 : 0;
    const mapped = getNepalGradePoint(overallSubjectPct);
    subjectGrade = mapped.grade;
    subjectGradePoint = mapped.gradePoint;

    if (subjectGrade === 'NG') {
      isNg = true;
      failureReasons.push(`Subject Total Below 35% Pass Threshold (${totalObtainedMarks}/${totalFullMarks})`);
    }
  }

  return {
    subjectId,
    subjectName,
    theoryMarks: thObtained,
    practicalMarks: prObtained,
    thFullMarks: thFull,
    prFullMarks: prFull,
    totalFullMarks,
    totalObtainedMarks,
    theoryGrade: thGrade,
    practicalGrade: prGrade,
    subjectGrade,
    subjectGradePoint,
    isNg,
    isIncomplete,
    isInvalid,
    failureReasons
  };
}

/**
 * Computes overall aggregate result, total marks, percentage, unweighted Nepal CDC GPA, and Strict NG.
 */
export function calculateAggregateResult(
  className: string,
  subjectOutputs: SubjectGradeOutput[]
): AggregateResultOutput {
  const tier = getAcademicTier(className);
  let totalFullMarks = 0;
  let totalObtainedMarks = 0;
  const failedSubjects: string[] = [];
  const incompleteSubjects: string[] = [];
  let isNg = false;
  let isIncomplete = false;
  let gpSum = 0;

  for (const sub of subjectOutputs) {
    totalFullMarks += sub.totalFullMarks;
    if (sub.totalObtainedMarks !== null && typeof sub.totalObtainedMarks === 'number') {
      totalObtainedMarks += sub.totalObtainedMarks;
    }
    if (sub.isIncomplete) {
      isIncomplete = true;
      incompleteSubjects.push(sub.subjectName || sub.subjectId);
    } else if (sub.isNg || sub.subjectGrade === 'NG') {
      isNg = true;
      failedSubjects.push(sub.subjectName || sub.subjectId);
    } else {
      gpSum += sub.subjectGradePoint;
    }
  }

  if (subjectOutputs.length === 0) {
    return {
      totalFullMarks: 0,
      totalObtainedMarks: 0,
      aggregatePercentage: 0,
      overallGrade: 'INC',
      overallGpa: null,
      gpaDisplayText: '-',
      overallStatus: 'INCOMPLETE',
      failedSubjects: [],
      incompleteSubjects: [],
      isNg: false,
      isIncomplete: true,
      academicTier: tier
    };
  }

  // Handle incomplete marks BEFORE fabricating any grade or status
  if (isIncomplete || incompleteSubjects.length > 0) {
    const partialPct = totalFullMarks > 0 ? Math.round(((totalObtainedMarks / totalFullMarks) * 100) * 100) / 100 : 0;
    return {
      totalFullMarks,
      totalObtainedMarks,
      aggregatePercentage: partialPct,
      overallGrade: 'INC',
      overallGpa: null,
      gpaDisplayText: '-',
      overallStatus: 'INCOMPLETE',
      failedSubjects,
      incompleteSubjects,
      isNg,
      isIncomplete: true,
      academicTier: tier
    };
  }

  const aggregatePercentage = totalFullMarks > 0 ? Math.round(((totalObtainedMarks / totalFullMarks) * 100) * 100) / 100 : 0;

  // STRICT NEPAL CDC / NEB NG RULE:
  // If ANY subject is NG (failed <35% or AB), overall GPA MUST be null, display = '-', overallGrade = 'NG'
  if (isNg || failedSubjects.length > 0) {
    return {
      totalFullMarks,
      totalObtainedMarks,
      aggregatePercentage,
      overallGrade: 'NG',
      overallGpa: null,
      gpaDisplayText: '-',
      overallStatus: 'NG',
      failedSubjects,
      incompleteSubjects: [],
      isNg: true,
      isIncomplete: false,
      academicTier: tier
    };
  }

  // Unweighted Nepal CDC GPA (average of subject grade points, no credit-hour weighting)
  const avgGpa = Math.round((gpSum / subjectOutputs.length) * 100) / 100;
  const overallGrade = getNepalGradeFromGpa(avgGpa);

  return {
    totalFullMarks,
    totalObtainedMarks,
    aggregatePercentage,
    overallGrade,
    overallGpa: avgGpa,
    gpaDisplayText: avgGpa.toFixed(2),
    overallStatus: 'PASSED',
    failedSubjects: [],
    incompleteSubjects: [],
    isNg: false,
    isIncomplete: false,
    academicTier: tier
  };
}
