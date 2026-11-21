/**
 * Personalized Academic Remark Engine for Shikshantar Academy
 * 
 * Generates objective, evidence-based, respectful, and constructive student remarks
 * derived directly from official Nepal Letter Grading rules (nepalGradingEngine.ts)
 * and actual assessment components.
 * 
 * Strict Academic Integrity Rules:
 * 1. Full Marks Validation: Requires explicit, valid (> 0) full marks. Never defaults missing/invalid to 100.
 * 2. Component Configuration: Evaluates hasTh/hasPr explicitly. Never assumes theory-only just because practical is unentered.
 * 3. Pass Marks Validation: Authoritative configured pass marks. Dual-component subjects require explicit pass marks.
 *    No unconfirmed assumptions or silent defaults.
 * 4. Incomplete Marks vs Teacher Remark Precedence: Non-empty teacher remarks are preserved, but incomplete data
 *    NEVER presents a false finalized evaluation—returns INCOMPLETE status and notes pending evaluation.
 * 5. Qualitative & CAS: Validates actual assessment completeness; uses neutral developmental language with no unsupported behavioral observations.
 */

import {
  getNepalGradePoint,
  getAcademicTier,
  SubjectConfig
} from './nepalGradingEngine';

export interface FormattedRemarkSegment {
  text: string;
  bold: boolean;
}

export interface FormattedRemark {
  rawText: string;
  segments: FormattedRemarkSegment[];
  status: 'COMPLETE' | 'INCOMPLETE' | 'ABSENT' | 'NG' | 'TEACHER_OVERRIDE';
  gradeCategory?: string;
  strongSubjects: string[];
  weakSubjects: string[];
  failedSubjects: string[];
  absentSubjects: string[];
  incompleteSubjects: string[];
  invalidConfigSubjects?: string[];
  teacherRemark?: string;
}

export interface SubjectAssessmentData {
  subjectName?: string;
  fullMarks?: number | null;
  obtained?: number | 'AB' | string | null;
  thMarks?: number | 'AB' | string | null;
  prMarks?: number | 'AB' | string | null;
  thFull?: number | null;
  prFull?: number | null;
  thPass?: number | null;
  prPass?: number | null;
  hasTh?: boolean;
  hasPr?: boolean;
  isAbsentTheory?: boolean;
  isAbsentPractical?: boolean;
}

export interface StudentRemarkInput {
  studentName?: string;
  class?: string;
  percentage?: number;
  grade?: string;
  subjects?: Record<string, SubjectAssessmentData | any>;
  classTeacherRemark?: string | null;
}

/**
 * Computes authoritative marksheet pass mark display value.
 * Strictly prevents silent conversion of missing/invalid values to zero.
 */
export function getSubjectPassMarkDisplay(marks: any): string | number {
  if (!marks || typeof marks !== 'object') return '-';

  // Both hasTh and hasPr must be explicitly provided as booleans. No inference from thFull, prFull, or marks.
  if (typeof marks.hasTh !== 'boolean' || typeof marks.hasPr !== 'boolean') {
    return '-';
  }

  const hasTh = marks.hasTh;
  const hasPr = marks.hasPr;

  const isNumeric = (v: any): boolean => {
    if (v === null || v === undefined || v === '') return false;
    const n = Number(v);
    return Number.isFinite(n) && !isNaN(n) && n >= 0;
  };

  const hasValidThPass = isNumeric(marks.thPass);
  const hasValidPrPass = isNumeric(marks.prPass);

  // Case 1: Theory + Practical Dual Component
  if (hasTh && hasPr) {
    if (hasValidThPass && hasValidPrPass) {
      return Number(marks.thPass) + Number(marks.prPass);
    }
    // If either component pass mark is missing or invalid, do not silently convert to 0 or invent a value
    return '-';
  }

  // Case 2: Theory-Only Subject
  if (hasTh && !hasPr) {
    if (hasValidThPass) {
      return Number(marks.thPass);
    }
    return '-';
  }

  // Case 3: Practical-Only Subject
  if (!hasTh && hasPr) {
    if (hasValidPrPass) {
      return Number(marks.prPass);
    }
    return '-';
  }

  return '-';
}

/**
 * Safely parses markdown-like bold markers (**text**) into structured text segments
 * without unsafe HTML injection.
 */
export function parseBoldMarkers(text: string): FormattedRemarkSegment[] {
  if (!text) return [];
  const segments: FormattedRemarkSegment[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      segments.push({
        text: part.slice(2, -2),
        bold: true
      });
    } else {
      segments.push({
        text: part,
        bold: false
      });
    }
  }

  return segments;
}

/**
 * Builds a FormattedRemark structure from template segments.
 */
function createFormattedRemark(
  segments: FormattedRemarkSegment[],
  status: FormattedRemark['status'],
  meta: {
    gradeCategory?: string;
    strongSubjects?: string[];
    weakSubjects?: string[];
    failedSubjects?: string[];
    absentSubjects?: string[];
    incompleteSubjects?: string[];
    invalidConfigSubjects?: string[];
    teacherRemark?: string;
  } = {}
): FormattedRemark {
  const rawText = segments.map(s => s.text).join('');
  return {
    rawText,
    segments,
    status,
    gradeCategory: meta.gradeCategory,
    strongSubjects: meta.strongSubjects || [],
    weakSubjects: meta.weakSubjects || [],
    failedSubjects: meta.failedSubjects || [],
    absentSubjects: meta.absentSubjects || [],
    incompleteSubjects: meta.incompleteSubjects || [],
    invalidConfigSubjects: meta.invalidConfigSubjects || [],
    teacherRemark: meta.teacherRemark
  };
}

/**
 * Authoritative generator for student academic progress report remarks.
 */
export function generatePersonalizedRemark(student: StudentRemarkInput): FormattedRemark {
  const manualRemark = typeof student.classTeacherRemark === 'string' ? student.classTeacherRemark.trim() : '';
  const subjectsObj = student.subjects || {};
  const subjectEntries = Object.entries(subjectsObj);

  // If no subject data at all
  if (subjectEntries.length === 0) {
    if (manualRemark.length > 0) {
      return createFormattedRemark(
        parseBoldMarkers(manualRemark),
        'TEACHER_OVERRIDE',
        { teacherRemark: manualRemark }
      );
    }
    return createFormattedRemark(
      [
        { text: 'Assessment data is ', bold: false },
        { text: 'not yet available', bold: true },
        { text: ' for evaluation.', bold: false }
      ],
      'INCOMPLETE'
    );
  }

  // Identify Academic Tier
  const tier = getAcademicTier(student.class || '');

  // Qualitative Early Childhood handling (PG to UKG)
  if (tier === 'EARLY_CHILDHOOD') {
    // Audit: Verify whether assessment records actually exist and are entered
    const incompleteSubjs: string[] = [];
    for (const [subjName, rawData] of subjectEntries) {
      const data: SubjectAssessmentData = rawData || {};
      const val = data.obtained !== undefined ? data.obtained : (data.thMarks !== undefined ? data.thMarks : null);
      if (val === null || val === undefined || val === '' || (typeof val === 'string' && val.trim() === '')) {
        incompleteSubjs.push(subjName);
      }
    }

    if (incompleteSubjs.length > 0) {
      const listStr = incompleteSubjs.slice(0, 3).join(', ') + (incompleteSubjs.length > 3 ? ' and others' : '');
      const segments: FormattedRemarkSegment[] = [
        { text: 'Assessment data is ', bold: false },
        { text: 'incomplete', bold: true },
        { text: ` for ${listStr}. Final developmental evaluation is `, bold: false },
        { text: 'pending completion', bold: true },
        { text: '.', bold: false }
      ];
      if (manualRemark.length > 0) {
        segments.push({ text: ` Teacher Remark: ${manualRemark}`, bold: false });
      }
      return createFormattedRemark(
        segments,
        'INCOMPLETE',
        { incompleteSubjects: incompleteSubjs, teacherRemark: manualRemark || undefined }
      );
    }

    if (manualRemark.length > 0) {
      return createFormattedRemark(
        parseBoldMarkers(manualRemark),
        'TEACHER_OVERRIDE',
        { gradeCategory: 'QUALITATIVE', teacherRemark: manualRemark }
      );
    }
    return createFormattedRemark(
      [
        { text: 'Foundational developmental records maintained per curriculum framework. Focus on ', bold: false },
        { text: 'early learning and developmental milestones', bold: true },
        { text: ' across curriculum domains.', bold: false }
      ],
      'COMPLETE',
      { gradeCategory: 'QUALITATIVE' }
    );
  }

  // CAS Lower Primary handling (Grades 1 to 3)
  if (tier === 'LOWER_PRIMARY') {
    // Audit: Verify whether assessment records actually exist and are entered
    const incompleteSubjs: string[] = [];
    for (const [subjName, rawData] of subjectEntries) {
      const data: SubjectAssessmentData = rawData || {};
      const val = data.obtained !== undefined ? data.obtained : (data.thMarks !== undefined ? data.thMarks : null);
      if (val === null || val === undefined || val === '' || (typeof val === 'string' && val.trim() === '')) {
        incompleteSubjs.push(subjName);
      }
    }

    if (incompleteSubjs.length > 0) {
      const listStr = incompleteSubjs.slice(0, 3).join(', ') + (incompleteSubjs.length > 3 ? ' and others' : '');
      const segments: FormattedRemarkSegment[] = [
        { text: 'Assessment data is ', bold: false },
        { text: 'incomplete', bold: true },
        { text: ` for ${listStr}. Final CAS evaluation is `, bold: false },
        { text: 'pending completion', bold: true },
        { text: '.', bold: false }
      ];
      if (manualRemark.length > 0) {
        segments.push({ text: ` Teacher Remark: ${manualRemark}`, bold: false });
      }
      return createFormattedRemark(
        segments,
        'INCOMPLETE',
        { incompleteSubjects: incompleteSubjs, teacherRemark: manualRemark || undefined }
      );
    }

    if (manualRemark.length > 0) {
      return createFormattedRemark(
        parseBoldMarkers(manualRemark),
        'TEACHER_OVERRIDE',
        { gradeCategory: 'CAS', teacherRemark: manualRemark }
      );
    }
    return createFormattedRemark(
      [
        { text: 'Continuous Assessment System (CAS) records maintained across prescribed curriculum areas.', bold: false }
      ],
      'COMPLETE',
      { gradeCategory: 'CAS' }
    );
  }

  // Upper Primary & Secondary: Rigorous Subject-Wise Evaluation
  const incompleteSubjects: string[] = [];
  const invalidConfigSubjects: string[] = [];
  const absentSubjects: string[] = [];
  const failedSubjects: string[] = [];
  const evaluatedSubjects: Array<{
    name: string;
    percentage: number;
    grade: string;
    gradePoint: number;
    thPct?: number;
    prPct?: number;
    thFailed?: boolean;
    prFailed?: boolean;
  }> = [];

  for (const [subjName, rawData] of subjectEntries) {
    const data: SubjectAssessmentData = rawData || {};

    // 1. FULL MARKS VALIDATION: Must be an explicit, valid number > 0
    const rawFm: any = data.fullMarks;
    if (rawFm === undefined || rawFm === null || rawFm === '' || isNaN(Number(rawFm)) || Number(rawFm) <= 0) {
      invalidConfigSubjects.push(subjName);
      continue;
    }
    const fullMarks = Number(rawFm);

    // 2. AUTHORITATIVE COMPONENT CONFIGURATION:
    // Both hasTh and hasPr must be explicitly configured. Do not infer that a subject is theory-only
    // simply because practical marks have not yet been entered or hasPr is omitted.
    if (data.hasTh === undefined || data.hasPr === undefined) {
      invalidConfigSubjects.push(subjName);
      continue;
    }

    const hasTh = Boolean(data.hasTh);
    const hasPr = Boolean(data.hasPr);

    // Subject must have at least one component enabled
    if (!hasTh && !hasPr) {
      invalidConfigSubjects.push(subjName);
      continue;
    }

    // Component max marks derivation & validation
    let thFull = 0;
    let prFull = 0;

    if (hasTh && hasPr) {
      thFull = data.thFull !== undefined && data.thFull !== null ? Number(data.thFull) : Math.round(fullMarks * 0.75);
      prFull = data.prFull !== undefined && data.prFull !== null ? Number(data.prFull) : Math.round(fullMarks * 0.25);

      // Verify that configured component full marks sum up to total full marks
      if (data.thFull !== undefined && data.prFull !== undefined && (thFull + prFull !== fullMarks)) {
        invalidConfigSubjects.push(subjName);
        continue;
      }
      if (thFull <= 0 || prFull <= 0 || isNaN(thFull) || isNaN(prFull)) {
        invalidConfigSubjects.push(subjName);
        continue;
      }
    } else if (hasTh) {
      thFull = data.thFull !== undefined && data.thFull !== null ? Number(data.thFull) : fullMarks;
      if (data.thFull !== undefined && thFull !== fullMarks) {
        invalidConfigSubjects.push(subjName);
        continue;
      }
      if (thFull <= 0 || isNaN(thFull)) {
        invalidConfigSubjects.push(subjName);
        continue;
      }
    } else {
      prFull = data.prFull !== undefined && data.prFull !== null ? Number(data.prFull) : fullMarks;
      if (data.prFull !== undefined && prFull !== fullMarks) {
        invalidConfigSubjects.push(subjName);
        continue;
      }
      if (prFull <= 0 || isNaN(prFull)) {
        invalidConfigSubjects.push(subjName);
        continue;
      }
    }

    // 3. PASS MARKS VALIDATION:
    // Configured subject/component pass marks remain authoritative.
    // Dual-component subjects require authoritative component pass marks; never silently assume or apply 35%.
    let thPass: number | undefined = undefined;
    let prPass: number | undefined = undefined;

    if (hasTh && hasPr) {
      // Dual component requires authoritative pass marks
      if (data.thPass === undefined || data.thPass === null || data.prPass === undefined || data.prPass === null) {
        invalidConfigSubjects.push(subjName);
        continue;
      }
      thPass = Number(data.thPass);
      prPass = Number(data.prPass);
      if (isNaN(thPass) || isNaN(prPass) || thPass < 0 || thPass > thFull || prPass < 0 || prPass > prFull) {
        invalidConfigSubjects.push(subjName);
        continue;
      }
    } else if (hasTh) {
      if (data.thPass !== undefined && data.thPass !== null) {
        thPass = Number(data.thPass);
        if (isNaN(thPass) || thPass < 0 || thPass > thFull) {
          invalidConfigSubjects.push(subjName);
          continue;
        }
      }
    } else if (hasPr) {
      if (data.prPass !== undefined && data.prPass !== null) {
        prPass = Number(data.prPass);
        if (isNaN(prPass) || prPass < 0 || prPass > prFull) {
          invalidConfigSubjects.push(subjName);
          continue;
        }
      }
    }

    // Determine marks values
    const thVal = data.thMarks !== undefined ? data.thMarks : (hasTh && !hasPr ? data.obtained : null);
    const prVal = data.prMarks !== undefined ? data.prMarks : null;

    // Check for absence
    const isAbsentTh = Boolean(data.isAbsentTheory || thVal === 'AB');
    const isAbsentPr = Boolean(data.isAbsentPractical || prVal === 'AB');

    if ((hasTh && isAbsentTh) || (hasPr && isAbsentPr)) {
      absentSubjects.push(subjName);
      continue;
    }

    // Check for missing marks
    let thMissing = false;
    if (hasTh) {
      if (thVal === null || thVal === undefined || thVal === '' || (typeof thVal === 'string' && thVal.trim() === '')) {
        thMissing = true;
      }
    }

    let prMissing = false;
    if (hasPr) {
      if (prVal === null || prVal === undefined || prVal === '' || (typeof prVal === 'string' && (prVal.trim() === '' || prVal === '-'))) {
        prMissing = true;
      }
    }

    if (thMissing || prMissing) {
      incompleteSubjects.push(subjName);
      continue;
    }

    // Both configured components are present and non-empty
    const thNum = hasTh ? Number(thVal) : 0;
    const prNum = hasPr ? Number(prVal) : 0;

    // Validate numbers and boundaries (no negative marks, no non-numeric)
    if (isNaN(thNum) || isNaN(prNum) || thNum < 0 || prNum < 0) {
      incompleteSubjects.push(subjName);
      continue;
    }

    // Detect marks exceeding full marks
    if ((hasTh && thNum > thFull) || (hasPr && prNum > prFull) || (thNum + prNum > fullMarks)) {
      incompleteSubjects.push(subjName);
      continue;
    }

    // Component gate pass checks (applies to dual-component subjects with configured pass marks)
    const isDual = hasTh && hasPr;
    const thFailed = isDual && thPass !== undefined && thNum < thPass;
    const prFailed = isDual && prPass !== undefined && prNum < prPass;

    const totalObtained = thNum + prNum;
    const totalFull = thFull + prFull || fullMarks;
    const subjPct = totalFull > 0 ? (totalObtained / totalFull) * 100 : 0;
    const mapped = getNepalGradePoint(subjPct);

    const isSubjNg = mapped.grade === 'NG' || thFailed || prFailed;

    if (isSubjNg) {
      failedSubjects.push(subjName);
    }

    evaluatedSubjects.push({
      name: subjName,
      percentage: subjPct,
      grade: isSubjNg ? 'NG' : mapped.grade,
      gradePoint: isSubjNg ? 0 : mapped.gradePoint,
      thPct: thFull > 0 ? (thNum / thFull) * 100 : undefined,
      prPct: prFull > 0 ? (prNum / prFull) * 100 : undefined,
      thFailed,
      prFailed
    });
  }

  // Combine incomplete and invalid config subjects
  const allIncomplete = Array.from(new Set([...invalidConfigSubjects, ...incompleteSubjects]));

  // 4. PRECEDENCE: INCOMPLETE / INVALID CONFIGURATION
  // Incomplete marks must NEVER present a false finalized evaluation, even if teacher remark is present!
  if (allIncomplete.length > 0) {
    const listStr = allIncomplete.slice(0, 3).join(', ') + (allIncomplete.length > 3 ? ' and others' : '');
    const segments: FormattedRemarkSegment[] = [
      { text: 'Marks entry is ', bold: false },
      { text: 'incomplete', bold: true },
      { text: ` for ${listStr}. Final evaluation is `, bold: false },
      { text: 'pending completion', bold: true },
      { text: '.', bold: false }
    ];

    if (manualRemark.length > 0) {
      segments.push({
        text: ` Teacher Remark: ${manualRemark}`,
        bold: false
      });
    }

    return createFormattedRemark(
      segments,
      'INCOMPLETE',
      {
        incompleteSubjects: allIncomplete,
        invalidConfigSubjects,
        teacherRemark: manualRemark || undefined
      }
    );
  }

  // 5. TEACHER REMARK PRECEDENCE (Option A) on Complete Assessments
  // When assessment data is complete and teacher provided a non-empty manual remark, manual remark takes precedence.
  if (manualRemark.length > 0) {
    return createFormattedRemark(
      parseBoldMarkers(manualRemark),
      'TEACHER_OVERRIDE',
      { teacherRemark: manualRemark }
    );
  }

  // 6. ABSENTEEISM (AB)
  if (absentSubjects.length > 0) {
    const listStr = absentSubjects.join(', ');
    return createFormattedRemark(
      [
        { text: 'Recorded as ', bold: false },
        { text: `Absent (AB) in ${listStr}`, bold: true },
        { text: '. Final result is ', bold: false },
        { text: 'Non-Graded (NG)', bold: true },
        { text: ' pending formal examination re-assessment.', bold: false }
      ],
      'ABSENT',
      { absentSubjects, gradeCategory: 'NG' }
    );
  }

  // 7. GENUINE NG / COMPONENT GATE FAILURE
  if (failedSubjects.length > 0) {
    const listStr = failedSubjects.join(', ');
    return createFormattedRemark(
      [
        { text: 'Currently at ', bold: false },
        { text: 'Non-Graded (NG) level', bold: true },
        { text: ` in ${listStr}. Immediate `, bold: false },
        { text: 'focused academic practice and remedial support', bold: true },
        { text: ' are required to achieve the passing threshold.', bold: false }
      ],
      'NG',
      { failedSubjects, gradeCategory: 'NG' }
    );
  }

  // 8. SUCCESSFUL NUMERICAL EVALUATION (Grades A+ down to D)
  evaluatedSubjects.sort((a, b) => b.percentage - a.percentage);

  const topScore = evaluatedSubjects.length > 0 ? evaluatedSubjects[0].percentage : 0;
  const strongSubjects = evaluatedSubjects
    .filter(s => s.percentage >= 70 && s.percentage >= topScore - 3)
    .map(s => s.name);

  const avgPct = evaluatedSubjects.reduce((acc, s) => acc + s.percentage, 0) / (evaluatedSubjects.length || 1);
  const weakSubjects = evaluatedSubjects
    .filter(s => (s.percentage < avgPct - 15 || s.percentage < 50) && s.percentage < 70)
    .map(s => s.name);

  const overallGrade = student.grade || getNepalGradePoint(student.percentage ?? avgPct).grade;
  const strongStr = strongSubjects.length > 0 ? strongSubjects.slice(0, 2).join(' and ') : 'all subjects';
  const weakStr = weakSubjects.length > 0 ? weakSubjects.slice(0, 2).join(' and ') : '';

  switch (overallGrade) {
    case 'A+':
      return createFormattedRemark(
        [
          { text: 'Demonstrates ', bold: false },
          { text: 'outstanding academic excellence', bold: true },
          { text: ` with exceptional mastery across subjects, excelling particularly in `, bold: false },
          { text: strongStr, bold: true },
          { text: '.', bold: false }
        ],
        'COMPLETE',
        { gradeCategory: 'A+', strongSubjects }
      );

    case 'A':
      if (weakStr) {
        return createFormattedRemark(
          [
            { text: 'Shows ', bold: false },
            { text: 'excellent academic understanding', bold: true },
            { text: ` with high achievement in `, bold: false },
            { text: strongStr, bold: true },
            { text: `. Recommended to devote additional time to `, bold: false },
            { text: weakStr, bold: true },
            { text: ' to achieve all-round distinction.', bold: false }
          ],
          'COMPLETE',
          { gradeCategory: 'A', strongSubjects, weakSubjects }
        );
      }
      return createFormattedRemark(
        [
          { text: 'Shows ', bold: false },
          { text: 'excellent conceptual understanding', bold: true },
          { text: `, excelling particularly in `, bold: false },
          { text: strongStr, bold: true },
          { text: '. Continue maintaining high standards.', bold: false }
        ],
        'COMPLETE',
        { gradeCategory: 'A', strongSubjects }
      );

    case 'B+':
      if (weakStr) {
        return createFormattedRemark(
          [
            { text: 'Displays ', bold: false },
            { text: 'very good performance', bold: true },
            { text: ` with solid capability in `, bold: false },
            { text: strongStr, bold: true },
            { text: `. Targeted revision in `, bold: false },
            { text: weakStr, bold: true },
            { text: ' will help elevate overall results.', bold: false }
          ],
          'COMPLETE',
          { gradeCategory: 'B+', strongSubjects, weakSubjects }
        );
      }
      return createFormattedRemark(
        [
          { text: 'Displays ', bold: false },
          { text: 'very good academic capability', bold: true },
          { text: `, showing strong aptitude in `, bold: false },
          { text: strongStr, bold: true },
          { text: '. Capable of achieving even higher distinction.', bold: false }
        ],
        'COMPLETE',
        { gradeCategory: 'B+', strongSubjects }
      );

    case 'B':
      if (weakStr) {
        return createFormattedRemark(
          [
            { text: 'Demonstrates ', bold: false },
            { text: 'good general capability', bold: true },
            { text: `, performing well in `, bold: false },
            { text: strongStr, bold: true },
            { text: `. Focused practice and regular revision are recommended in `, bold: false },
            { text: weakStr, bold: true },
            { text: ' to improve overall consistency.', bold: false }
          ],
          'COMPLETE',
          { gradeCategory: 'B', strongSubjects, weakSubjects }
        );
      }
      return createFormattedRemark(
        [
          { text: 'Demonstrates ', bold: false },
          { text: 'good general comprehension', bold: true },
          { text: ` across subjects, with steady results in `, bold: false },
          { text: strongStr, bold: true },
          { text: '. Greater focus during revision will yield further progress.', bold: false }
        ],
        'COMPLETE',
        { gradeCategory: 'B', strongSubjects }
      );

    case 'C+':
      return createFormattedRemark(
        [
          { text: 'Has attained a ', bold: false },
          { text: 'satisfactory foundation', bold: true },
          { text: weakStr ? ` with passing competence in ` : `. Competence demonstrated in `, bold: false },
          { text: strongStr, bold: true },
          { text: weakStr ? `, but requires consistent reinforcement in ` : `. Academic reinforcement in `, bold: false },
          { text: weakStr || 'core subjects', bold: true },
          { text: ' is recommended.', bold: false }
        ],
        'COMPLETE',
        { gradeCategory: 'C+', strongSubjects, weakSubjects }
      );

    case 'C':
      return createFormattedRemark(
        [
          { text: 'Performance meets the ', bold: false },
          { text: 'acceptable passing standard', bold: true },
          { text: `. Intensive study and `, bold: false },
          { text: 'regular practice in core subjects', bold: true },
          { text: weakStr ? ` (particularly in ${weakStr})` : '', bold: false },
          { text: ' are required to build academic confidence.', bold: false }
        ],
        'COMPLETE',
        { gradeCategory: 'C', strongSubjects, weakSubjects }
      );

    case 'D':
      return createFormattedRemark(
        [
          { text: 'Has secured a ', bold: false },
          { text: 'basic passing level', bold: true },
          { text: `. Requires `, bold: false },
          { text: 'immediate and sustained attention to fundamental concepts', bold: true },
          { text: weakStr ? ` in ${weakStr}` : ' across all subjects', bold: false },
          { text: ' to ensure future academic progress.', bold: false }
        ],
        'COMPLETE',
        { gradeCategory: 'D', strongSubjects, weakSubjects }
      );

    default:
      return createFormattedRemark(
        [
          { text: 'Academic progress evaluated. Academic revision and ', bold: false },
          { text: 'targeted practice', bold: true },
          { text: ' are recommended.', bold: false }
        ],
        'COMPLETE',
        { gradeCategory: overallGrade }
      );
  }
}
