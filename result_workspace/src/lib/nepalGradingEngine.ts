export interface SubjectConfig {
  thFullMarks?: number;
  thPassMarks?: number;
  prFullMarks?: number;
  prPassMarks?: number;
  hasTh?: boolean;
  hasPr?: boolean;
}

export interface SubjectInputMarks {
  theoryMarks: number | 'AB' | null;
  practicalMarks: number | 'AB' | null;
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
  failureReasons: string[];
}

export interface AggregateResultOutput {
  totalFullMarks: number;
  totalObtainedMarks: number;
  aggregatePercentage: number;
  overallGrade: string;
  overallGpa: number | null; // Null when any subject is NG
  gpaDisplayText: string;    // '-' when NG
  overallStatus: 'PASSED' | 'NG' | 'QUALITATIVE' | 'CAS';
  failedSubjects: string[];
  isNg: boolean;
  academicTier: 'EARLY_CHILDHOOD' | 'LOWER_PRIMARY' | 'UPPER_PRIMARY' | 'SECONDARY';
}

/**
 * Maps a numerical percentage (0–100) to official Nepal Letter Grade and Grade Point.
 */
export function getNepalGradePoint(percentage: number): { grade: string; gradePoint: number } {
  if (!Number.isFinite(percentage) || percentage < 0) {
    return { grade: 'NG', gradePoint: 0.0 };
  }
  // Standardize to 1 decimal place max for boundary safety
  const p = Math.round(percentage * 10) / 10;
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
 * Normalizes class string to standard academic tier
 */
export function getAcademicTier(className: string): 'EARLY_CHILDHOOD' | 'LOWER_PRIMARY' | 'UPPER_PRIMARY' | 'SECONDARY' {
  const clean = String(className || '').replace(/^Class\s+/i, '').trim().toUpperCase();
  if (['PG', 'NURSERY', 'LKG', 'UKG'].includes(clean)) {
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
 * Computes authoritative grade, component pass checks, and grade points for a single subject.
 */
export function calculateSubjectResult(
  subjectId: string,
  subjectName: string,
  input: SubjectInputMarks,
  config: SubjectConfig
): SubjectGradeOutput {
  const failureReasons: string[] = [];
  let isNg = false;

  const thFull = config.hasTh ? (config.thFullMarks || 0) : 0;
  const prFull = config.hasPr ? (config.prFullMarks || 0) : 0;
  const totalFullMarks = thFull + prFull;

  // Derive explicit pass thresholds for dual component
  const thPass = config.thPassMarks !== undefined ? config.thPassMarks : Math.ceil(thFull * 0.35);
  const prPass = config.prPassMarks !== undefined ? config.prPassMarks : Math.ceil(prFull * 0.35);

  let thObtained = input.theoryMarks;
  let prObtained = input.practicalMarks;

  if (input.isAbsentTheory) thObtained = 'AB';
  if (input.isAbsentPractical) prObtained = 'AB';

  let thGrade = '-';
  let prGrade = '-';

  const isDualComponent = Boolean(config.hasTh && config.hasPr);

  // 1. Evaluate Theory Component
  if (config.hasTh) {
    if (thObtained === 'AB' || thObtained === null || thObtained === undefined) {
      thGrade = 'NG';
      isNg = true;
      failureReasons.push(thObtained === 'AB' ? 'Theory Absent' : 'Theory Mark Missing');
    } else {
      const thPct = (Number(thObtained) / thFull) * 100;
      thGrade = getNepalGradePoint(thPct).grade;
      
      // Separate 35% theory gate applies ONLY for subjects configured with BOTH Theory and Practical
      if (isDualComponent && Number(thObtained) < thPass) {
        isNg = true;
        thGrade = 'NG';
        failureReasons.push(`Theory Below Pass Mark (${thObtained}/${thPass})`);
      }
    }
  }

  // 2. Evaluate Practical Component
  if (config.hasPr) {
    if (prObtained === 'AB' || prObtained === null || prObtained === undefined) {
      prGrade = 'NG';
      isNg = true;
      failureReasons.push(prObtained === 'AB' ? 'Practical Absent' : 'Practical Mark Missing');
    } else {
      const prPct = (Number(prObtained) / prFull) * 100;
      prGrade = getNepalGradePoint(prPct).grade;

      // Separate 35% practical gate applies ONLY for subjects configured with BOTH Theory and Practical
      if (isDualComponent && Number(prObtained) < prPass) {
        isNg = true;
        prGrade = 'NG';
        failureReasons.push(`Practical Below Pass Mark (${prObtained}/${prPass})`);
      }
    }
  }

  // 3. Compute Total Subject Marks & Overall Subject Grade
  let totalObtainedMarks: number | null = null;
  let subjectGrade = 'NG';
  let subjectGradePoint = 0.0;

  const thValid = !config.hasTh || (thObtained !== 'AB' && thObtained !== null && thObtained !== undefined);
  const prValid = !config.hasPr || (prObtained !== 'AB' && prObtained !== null && prObtained !== undefined);

  if (!isNg && thValid && prValid) {
    const thNum = (config.hasTh && typeof thObtained === 'number') ? thObtained : 0;
    const prNum = (config.hasPr && typeof prObtained === 'number') ? prObtained : 0;
    totalObtainedMarks = thNum + prNum;

    const overallSubjectPct = totalFullMarks > 0 ? (totalObtainedMarks / totalFullMarks) * 100 : 0;
    const mapped = getNepalGradePoint(overallSubjectPct);
    subjectGrade = mapped.grade;
    subjectGradePoint = mapped.gradePoint;

    // Double-check subject grade is not NG
    if (subjectGrade === 'NG') {
      isNg = true;
      failureReasons.push(`Subject Total Below Pass Threshold (${totalObtainedMarks}/${totalFullMarks})`);
    }
  } else {
    isNg = true;
    subjectGrade = 'NG';
    subjectGradePoint = 0.0;
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
    failureReasons
  };
}

/**
 * Computes overall aggregate result, total marks, aggregate percentage, aggregate GPA, and Strict NG.
 */
export function calculateAggregateResult(
  className: string,
  subjectOutputs: SubjectGradeOutput[]
): AggregateResultOutput {
  const tier = getAcademicTier(className);
  let totalFullMarks = 0;
  let totalObtainedMarks = 0;
  const failedSubjects: string[] = [];
  let isNg = false;

  for (const sub of subjectOutputs) {
    totalFullMarks += sub.totalFullMarks;
    if (sub.totalObtainedMarks !== null && typeof sub.totalObtainedMarks === 'number') {
      totalObtainedMarks += sub.totalObtainedMarks;
    }
    if (sub.isNg || sub.subjectGrade === 'NG') {
      isNg = true;
      failedSubjects.push(sub.subjectName || sub.subjectId);
    }
  }

  // Handle Early Childhood & Lower Primary Qualitative Tiers
  if (tier === 'EARLY_CHILDHOOD') {
    return {
      totalFullMarks: 0,
      totalObtainedMarks: 0,
      aggregatePercentage: 0,
      overallGrade: 'QUALITATIVE',
      overallGpa: null,
      gpaDisplayText: '-',
      overallStatus: 'QUALITATIVE',
      failedSubjects: [],
      isNg: false,
      academicTier: tier
    };
  }

  if (tier === 'LOWER_PRIMARY') {
    return {
      totalFullMarks: 0,
      totalObtainedMarks: 0,
      aggregatePercentage: 0,
      overallGrade: 'CAS',
      overallGpa: null,
      gpaDisplayText: '-',
      overallStatus: 'CAS',
      failedSubjects: [],
      isNg: false,
      academicTier: tier
    };
  }

  // Upper Primary (4–5) & Secondary (6–10) Numerical Evaluation
  const aggregatePercentage = totalFullMarks > 0 ? (totalObtainedMarks / totalFullMarks) * 100 : 0;
  const mapped = getNepalGradePoint(aggregatePercentage);

  // STRICT NG OPTION A ENFORCEMENT:
  // If ANY subject is NG, overall result status = 'NG', overall GPA = null, display = '-'
  if (isNg || failedSubjects.length > 0) {
    return {
      totalFullMarks,
      totalObtainedMarks,
      aggregatePercentage: Math.round(aggregatePercentage * 100) / 100,
      overallGrade: 'NG',
      overallGpa: null,
      gpaDisplayText: '-',
      overallStatus: 'NG',
      failedSubjects,
      isNg: true,
      academicTier: tier
    };
  }

  return {
    totalFullMarks,
    totalObtainedMarks,
    aggregatePercentage: Math.round(aggregatePercentage * 100) / 100,
    overallGrade: mapped.grade,
    overallGpa: mapped.gradePoint,
    gpaDisplayText: mapped.gradePoint.toFixed(2),
    overallStatus: 'PASSED',
    failedSubjects: [],
    isNg: false,
    academicTier: tier
  };
}
