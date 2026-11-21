/**
 * Result Preparation Engine for Shikshantar Academy School ERP
 * Authoritative workflow engine for:
 * - STEP 1 Teacher Assignment Resolution (Subject -> Teacher)
 * - Conflict & Unassigned Subject Detection
 * - Role Authorization (Admin, Class Teacher, Subject Teacher)
 * - Save as Draft (Unpublished)
 * - Review & Correction Workflow
 * - Comprehensive 20-Point Pre-Publication Validation
 * - Deterministic Publication, Idempotent Bell Notifications & Student Emails
 */

import { 
  normalizeClass, 
  getClassConfiguredSubjects, 
  type TeachingAssignment,
  matchesTeachingContext,
  hasMatchingAssignment
} from './teacherAssignmentEngine.js';
import { getNepalGPA, getGrade } from './nepalGradingEngine.js';

export type WorkflowMode = 'STANDALONE' | 'CONNECTED';
export type ExamPreparationStatus = 'DRAFT' | 'IN PROGRESS' | 'READY_FOR_REVIEW' | 'READY FOR REVIEW' | 'APPROVED' | 'PUBLISHED';
export type ExamLifecycleStatus = 'NOT STARTED' | 'DRAFT' | 'READY_FOR_REVIEW' | 'READY FOR REVIEW' | 'APPROVED' | 'PUBLISHED';
export type SubjectPreparationStatus =
  | 'NOT_STARTED'
  | 'PARTIALLY_FILLED'
  | 'MARKS_COMPLETE'
  | 'SUBMITTED'
  | 'CORRECTION_REQUESTED'
  | 'RESUBMITTED'
  | 'APPROVED'
  | 'NOT STARTED'
  | 'DRAFT'
  | 'READY FOR REVIEW';

const ACADEMIC_SESSION_REGEX = /^([2][0-1]\d{2})[-–—]([2][0-1]\d{2})\s*B\.?S\.?$/i;
const ACADEMIC_SINGLE_YEAR_REGEX = /^([2][0-1]\d{2})(?:\s*B\.?S\.?)?$/i;

/**
 * Validates and extracts a canonical 4-digit BS academic year from:
 * 1. Single 4-digit BS year (e.g. "2083")
 * 2. Consecutive two-year session range (e.g. "2083–2084 B.S.", "2083-2084 BS", with hyphen/en-dash/em-dash)
 * Enforces consecutive year rule: endYear === startYear + 1.
 * Fails closed (returns null) on empty, malformed, non-consecutive, or invalid inputs.
 */
export function parseAndValidateAcademicYear(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Single 4-digit BS year (e.g. "2083")
  const singleMatch = trimmed.match(ACADEMIC_SINGLE_YEAR_REGEX);
  if (singleMatch) {
    return singleMatch[1];
  }

  // 2. Consecutive two-year session range (e.g. "2083–2084 B.S.", "2083-2084 BS")
  const sessionMatch = trimmed.match(ACADEMIC_SESSION_REGEX);
  if (sessionMatch) {
    const startYear = parseInt(sessionMatch[1], 10);
    const endYear = parseInt(sessionMatch[2], 10);
    // Strict consecutive verification: endYear MUST be startYear + 1
    if (endYear === startYear + 1) {
      return String(startYear);
    }
  }

  // Fail closed on invalid format or non-consecutive session
  return null;
}

/**
 * Validates a lifecycle transition for class exam results:
 * NOT STARTED -> DRAFT (First draft saved)
 * DRAFT -> DRAFT (Draft updates)
 * DRAFT -> READY FOR REVIEW (All subjects entered & pass validation)
 * READY FOR REVIEW -> DRAFT (Mark correction / incomplete edit triggered)
 * READY FOR REVIEW -> READY FOR REVIEW (Re-verification)
 * READY FOR REVIEW -> PUBLISHED (Authorized publisher ONLY - Admin or Class Teacher)
 * Reopening (PUBLISHED -> any) is strictly denied for non-admins and OUT OF SCOPE.
 */
export function validateLifecycleTransition(params: {
  currentStatus?: ExamLifecycleStatus | string;
  targetStatus: ExamLifecycleStatus;
  userRole: string;
  teacherProfile?: any;
  targetClass: string;
  targetSection?: string;
  targetAcademicYear?: string;
  hasEntries?: boolean;
  allSubjectsComplete?: boolean;
}): { allowed: boolean; error?: string } {
  const current = (params.currentStatus || 'NOT STARTED') as ExamLifecycleStatus;
  const target = params.targetStatus;
  const role = (params.userRole || '').toLowerCase();
  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher';

  // 1. Terminal / Published checks (Admin can unpublish with audit reason)
  if (current === 'PUBLISHED') {
    if (target === 'PUBLISHED') return { allowed: true };
    if (!isAdmin) {
      return {
        allowed: false,
        error: 'REOPEN_FORBIDDEN: Published results cannot be reverted to draft by teachers. Reopening requires Administrator authority.'
      };
    }
    if (target === 'DRAFT' || target === 'APPROVED') {
      return { allowed: true };
    }
    return {
      allowed: false,
      error: `INVALID_TRANSITION: Published exams can only be reopened to DRAFT or APPROVED by an Administrator.`
    };
  }

  // 2. Transition to PUBLISHED (Admin-only, requires APPROVED state)
  if (target === 'PUBLISHED') {
    if (current !== 'APPROVED') {
      return {
        allowed: false,
        error: `INVALID_TRANSITION: Cannot transition directly from ${current} to PUBLISHED. Exam must be explicitly APPROVED by Admin before publication.`
      };
    }
    const canPublish = canPublishClassResult(
      params.userRole,
      params.teacherProfile,
      params.targetClass,
      params.targetAcademicYear,
      params.targetSection
    );
    if (!canPublish) {
      return {
        allowed: false,
        error: 'UNAUTHORIZED_PUBLISHER: Publication authority is strictly Admin-only.'
      };
    }
    return { allowed: true };
  }

  // 2.5. Transition to APPROVED (Admin-only, requires READY_FOR_REVIEW)
  if (target === 'APPROVED') {
    if (!isAdmin) {
      return {
        allowed: false,
        error: 'UNAUTHORIZED_APPROVER: Only Administrators can approve examinations.'
      };
    }
    if (current !== 'READY_FOR_REVIEW' && current !== 'READY FOR REVIEW') {
      return {
        allowed: false,
        error: `INVALID_TRANSITION: Cannot transition from ${current} to APPROVED. Exam must be in READY_FOR_REVIEW state.`
      };
    }
    return { allowed: true };
  }

  // 3. Transition to READY FOR REVIEW
  if (target === 'READY FOR REVIEW') {
    if (current !== 'DRAFT' && current !== 'READY FOR REVIEW') {
      return {
        allowed: false,
        error: `INVALID_TRANSITION: Cannot transition from ${current} to READY FOR REVIEW. Exam must have draft entries.`
      };
    }
    if (params.allSubjectsComplete === false) {
      return {
        allowed: false,
        error: 'INCOMPLETE_SUBJECTS: All configured class subjects must be entered and complete before advancing to READY FOR REVIEW.'
      };
    }
    return { allowed: true };
  }

  // 4. Transition to DRAFT
  if (target === 'DRAFT') {
    if (current === 'NOT STARTED') {
      if (params.hasEntries === false) {
        return {
          allowed: false,
          error: 'NO_ENTRIES: Saving draft requires at least one student mark entry.'
        };
      }
      return { allowed: true };
    }
    if (current === 'DRAFT' || current === 'READY FOR REVIEW') {
      return { allowed: true };
    }
    return {
      allowed: false,
      error: `INVALID_TRANSITION: Cannot transition from ${current} to DRAFT.`
    };
  }

  // 5. Transition to NOT STARTED
  if (target === 'NOT STARTED') {
    if (current === 'NOT STARTED') return { allowed: true };
    return {
      allowed: false,
      error: `INVALID_TRANSITION: Cannot reset active exam (${current}) back to NOT STARTED.`
    };
  }

  return {
    allowed: false,
    error: `INVALID_TRANSITION: Unknown target status ${target}.`
  };
}

/**
 * Normalizes raw terminal name inputs into canonical terminal keys:
 * "First Terminal Examination" / "First Terminal" / "FIRST_TERMINAL" -> "FIRST_TERMINAL"
 * "Second Terminal Examination" / "Second Terminal" / "SECOND_TERMINAL" -> "SECOND_TERMINAL"
 * "Third Terminal Examination" / "Third Terminal" / "THIRD_TERMINAL" -> "THIRD_TERMINAL"
 * "Final Examination" / "Final Terminal" / "FINAL" / "FINAL_TERMINAL" -> "FINAL_TERMINAL"
 * Returns null if the raw type is not a valid terminal examination.
 */
export function normalizeTerminalExamType(rawType?: string): 'FIRST_TERMINAL' | 'SECOND_TERMINAL' | 'THIRD_TERMINAL' | 'FINAL_TERMINAL' | null {
  if (!rawType || typeof rawType !== 'string') return null;
  const cleaned = rawType.trim().toLowerCase().replace(/_/g, ' ');

  if (cleaned.includes('first') || cleaned === 'first terminal' || cleaned === 'first terminal examination') {
    return 'FIRST_TERMINAL';
  }
  if (cleaned.includes('second') || cleaned === 'second terminal' || cleaned === 'second terminal examination') {
    return 'SECOND_TERMINAL';
  }
  if (cleaned.includes('third') || cleaned === 'third terminal' || cleaned === 'third terminal examination') {
    return 'THIRD_TERMINAL';
  }
  if (cleaned.includes('final') || cleaned === 'final examination' || cleaned === 'final terminal' || cleaned === 'final terminal examination') {
    return 'FINAL_TERMINAL';
  }

  return null;
}

/**
 * Normalizes raw section string to canonical single uppercase letter (default 'A').
 * Section 'All' or empty/null values normalize to 'A' for single-section examinations.
 */
export function getCanonicalSection(section?: string): string {
  const rawSec = (section || '').replace(/^Section\s+/i, '').trim();
  return (rawSec && rawSec.toLowerCase() !== 'all') ? rawSec.toUpperCase() : 'A';
}

/**
 * Constructs a collision-safe canonical exam identifier combining
 * Examination, Class, Section, and Academic Year.
 * Example: 'First_Terminal_5_A_2083'
 * If section and academic year are omitted, generates backward-compatible format: 'First_Terminal_5'
 * If academicYear is provided, it is strictly validated via parseAndValidateAcademicYear().
 * Throws error on invalid academic year input rather than silently creating malformed IDs.
 */
export function buildCanonicalExamId(
  examType: string,
  className: string,
  section?: string,
  academicYear?: string,
  options?: {
    category?: 'TERMINAL' | 'TEST';
    instanceId?: string;
  }
): string {
  const isTest = options?.category === 'TEST' || (examType || '').toLowerCase().startsWith('test_') || (examType || '').toLowerCase().includes('unit test') || (examType || '').toLowerCase().includes('class test') || (examType || '').toLowerCase().includes('weekly test') || (examType || '').toLowerCase().includes('monthly test');

  let cleanExam = (examType || '').trim().replace(/\s+/g, '_');
  const normalizedTerminal = normalizeTerminalExamType(examType);
  if (!isTest && normalizedTerminal) {
    cleanExam = normalizedTerminal;
  }

  const cleanClass = normalizeClass(className || '').replace(/\s+/g, '');
  const cleanSection = getCanonicalSection(section);

  let cleanYear = '2083';
  if (academicYear && academicYear.trim()) {
    const validatedYear = parseAndValidateAcademicYear(academicYear);
    if (!validatedYear) {
      throw new Error(
        `INVALID_ACADEMIC_YEAR: Academic year "${academicYear}" is not a valid 4-digit BS year or consecutive session (e.g., "2083" or "2083–2084 B.S.").`
      );
    }
    cleanYear = validatedYear;
  }

  if (isTest) {
    const sanitizedSlug = cleanExam.replace(/^TEST_/i, '').replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
    const instId = (options?.instanceId || '').trim();
    if (instId) {
      return `TEST_${sanitizedSlug}_${cleanClass}_${cleanSection}_${cleanYear}_${instId}`;
    }
    return `TEST_${sanitizedSlug}_${cleanClass}_${cleanSection}_${cleanYear}`;
  }

  return `${cleanExam}_${cleanClass}_${cleanSection}_${cleanYear}`;
}

/**
 * Validates individual subject configuration item schema:
 * Require:
 * - subjectKey (string)
 * - subjectName (string)
 * - enabled (boolean)
 * - hasTh (boolean) & hasPr (boolean)
 * - thFullMarks, thPassMarks, prFullMarks, prPassMarks (numbers)
 * Enforces:
 * - At least one component enabled for an enabled subject.
 * - Total full marks > 0 for enabled subject.
 * - Pass marks >= 0 and <= full marks for enabled components.
 */
export function validateSubjectConfigItem(item: any): { isValid: boolean; error?: string } {
  if (!item || typeof item !== 'object') {
    return { isValid: false, error: 'Subject configuration item must be an object.' };
  }
  const subjKey = item.subjectKey || item.subjectName || item.key;
  if (!subjKey || typeof subjKey !== 'string') {
    return { isValid: false, error: 'Missing or invalid subjectKey.' };
  }
  const subjName = item.subjectName || item.subjectKey || item.name;
  if (!subjName || typeof subjName !== 'string') {
    return { isValid: false, error: 'Missing or invalid subjectName.' };
  }

  const enabled = item.enabled !== false;
  if (!enabled) {
    return { isValid: true };
  }

  const hasTh = item.hasTh === true;
  const hasPr = item.hasPr === true;

  if (!hasTh && !hasPr) {
    return { isValid: false, error: `Subject "${subjName}" must have at least Theory or Practical enabled.` };
  }

  const thFull = hasTh ? Number(item.thFullMarks ?? item.theoryFullMarks ?? 0) : 0;
  const thPass = hasTh ? Number(item.thPassMarks ?? item.theoryPassMarks ?? 0) : 0;
  const prFull = hasPr ? Number(item.prFullMarks ?? item.practicalFullMarks ?? 0) : 0;
  const prPass = hasPr ? Number(item.prPassMarks ?? item.practicalPassMarks ?? 0) : 0;

  if (isNaN(thFull) || isNaN(thPass) || isNaN(prFull) || isNaN(prPass)) {
    return { isValid: false, error: `Subject "${subjName}" has invalid numeric marks.` };
  }

  if (hasTh) {
    if (thFull <= 0) {
      return { isValid: false, error: `Subject "${subjName}" Theory full marks must be greater than 0.` };
    }
    if (thPass < 0 || thPass > thFull) {
      return { isValid: false, error: `Subject "${subjName}" Theory pass marks must be between 0 and full marks (${thFull}).` };
    }
  }

  if (hasPr) {
    if (prFull <= 0) {
      return { isValid: false, error: `Subject "${subjName}" Practical full marks must be greater than 0.` };
    }
    if (prPass < 0 || prPass > prFull) {
      return { isValid: false, error: `Subject "${subjName}" Practical pass marks must be between 0 and full marks (${prFull}).` };
    }
  }

  const totalFull = thFull + prFull;
  if (totalFull <= 0) {
    return { isValid: false, error: `Subject "${subjName}" total full marks must be greater than 0.` };
  }

  return { isValid: true };
}

export interface SubjectTeacherResolution {
  subject: string;
  status: 'ASSIGNED' | 'UNASSIGNED' | 'CONFLICT';
  teacherName: string;
  teacherId?: string;
  conflictingTeachers?: Array<{ id: string; fullName: string; email?: string }>;
}

export interface StudentMarkEntry {
  uid?: string;
  studentUid: string;
  studentId: string;
  permanentStudentId?: string;
  studentEmis?: string;
  studentName: string;
  rollNo: string;
  rollNumberSnapshot?: string;
  class: string;
  section?: string;
  academicYear?: string;
  email?: string;
  guardianEmail?: string;
  guardianName?: string;
  subjectMarksTH: Record<string, string | number>;
  subjectMarksPR: Record<string, string | number>;
  subjectAbsentsTH: Record<string, boolean>;
  subjectAbsentsPR: Record<string, boolean>;
}

export interface SubjectConfigItem {
  subjectKey?: string;
  subjectName?: string;
  enabled?: boolean;
  thFullMarks: number;
  thPassMarks: number;
  prFullMarks: number;
  prPassMarks: number;
  hasTh: boolean;
  hasPr: boolean;
}

export interface ValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalStudents: number;
    totalSubjects: number;
    enteredMarksCount: number;
    missingMarksCount: number;
    absentCount: number;
  };
}

/**
 * Normalizes subject names for uniform comparison
 */
export function normalizeSubject(subj: string): string {
  if (!subj) return '';
  const s = subj.trim().toLowerCase();
  if (s === 'math' || s === 'mathematics') return 'mathematics';
  if (s === 'social' || s === 'social studies') return 'social studies';
  if (s === 'opt math' || s === 'opt. math') return 'opt. math';
  return s;
}

/**
 * Checks if a teacher is the primary Class Teacher of a specified class context.
 * Strict 4-Dimensional Authorization:
 * 1. Matching class (explicit primaryClassTeacher non-empty string). Legacy fallback removed.
 * 2. Explicit matching academic year (primaryClassTeacherYear must be non-empty and match).
 *    Missing or empty year FAILS CLOSED. (classAssignedYear fallback strictly removed).
 * 3. Explicit matching section (primaryClassTeacherSection: 'All' or matches targetSection).
 *    Missing, null or empty section FAILS CLOSED.
 * Missing or invalid authorization information returns false.
 */
export function isPrimaryClassTeacher(
  teacherProfile: any, 
  targetClass: string,
  academicYear: string,
  targetSection: string
): boolean {
  if (!teacherProfile || !targetClass || !academicYear || !targetSection) return false;
  
  // 1. Class Check: Explicit primaryClassTeacher only. No legacy class fallback.
  const rawPct = (teacherProfile.primaryClassTeacher || '').trim();
  if (!rawPct) return false;

  const targetNorm = normalizeClass(targetClass).toLowerCase();
  const pctNorm = normalizeClass(rawPct).toLowerCase();
  if (pctNorm !== targetNorm) return false;

  // 2. Academic Year Check: Explicit non-empty primaryClassTeacherYear only.
  const rawTeacherYear = (teacherProfile.primaryClassTeacherYear || '').trim();
  if (!rawTeacherYear) return false; // Fail closed if missing

  const parsedTeacherYear = parseAndValidateAcademicYear(rawTeacherYear) || rawTeacherYear.match(/\d{4}/)?.[0];
  const parsedTargetYear = parseAndValidateAcademicYear(academicYear) || academicYear.match(/\d{4}/)?.[0];

  if (!parsedTeacherYear || !parsedTargetYear || parsedTeacherYear !== parsedTargetYear) {
    return false;
  }

  // 3. Section Check: Explicit non-empty primaryClassTeacherSection only.
  const rawTeacherSec = (teacherProfile.primaryClassTeacherSection || '').trim();
  if (!rawTeacherSec) return false; // Fail closed if section assignment missing

  const teacherSecLower = rawTeacherSec.toLowerCase();
  const targetSecLower = targetSection.trim().toLowerCase();

  // Allow section All only when the teacher profile explicitly contains All.
  if (teacherSecLower === 'all') {
    return true;
  }

  return teacherSecLower === targetSecLower;
}

/**
 * Determines whether a user can access a class within the Result Preparation workflow
 */
export function canTeacherAccessClass(
  userRole: string,
  teacherProfile: any,
  targetClass: string,
  targetSection: string = 'All',
  targetAcademicYear?: string
): boolean {
  const role = (userRole || '').toLowerCase();
  if (role === 'admin') return true;
  if (role !== 'teacher' || !teacherProfile) return false;

  // 1. Class Teacher can access their primary class
  const sec = targetSection || 'All';
  if (targetAcademicYear && isPrimaryClassTeacher(teacherProfile, targetClass, targetAcademicYear, sec)) return true;

  // 2. Subject Teacher can access any class where they hold at least one exact assignment
  const assignments: TeachingAssignment[] = Array.isArray(teacherProfile.teachingAssignments) 
    ? teacherProfile.teachingAssignments 
    : [];

  const targetClassNorm = normalizeClass(targetClass).toLowerCase();
  const hasAssignmentInClass = assignments.some(a => {
    if (normalizeClass(a.class).toLowerCase() !== targetClassNorm) return false;
    // Section check if specific
    const assignSec = (a.section || 'All').trim().toLowerCase();
    const tgtSec = (targetSection || 'All').trim().toLowerCase();
    if (assignSec !== 'all' && tgtSec !== 'all' && assignSec !== tgtSec) return false;
    // Year check if specific
    const assignYear = (a.academicYear || '').trim().replace(/[^0-9]/g, '');
    const tgtYear = (targetAcademicYear || '').trim().replace(/[^0-9]/g, '');
    if (assignYear && tgtYear && !tgtYear.includes(assignYear) && !assignYear.includes(tgtYear)) return false;
    return true;
  });

  if (hasAssignmentInClass) return true;

  // Legacy fallback
  const legacyClasses: string[] = Array.isArray(teacherProfile.assignedClasses) ? teacherProfile.assignedClasses : [];
  return legacyClasses.some(c => normalizeClass(c).toLowerCase() === targetClassNorm);
}

/**
 * Determines whether a user can view or edit marks for an exact class + subject
 * Uses authoritative STEP 1 teacherAssignmentEngine.
 */
export function canTeacherAccessSubject(
  userRole: string,
  teacherProfile: any,
  targetClass: string,
  targetSubject: string,
  targetSection: string = 'All',
  targetAcademicYear?: string
): boolean {
  const role = (userRole || '').toLowerCase();
  if (role === 'admin') return true;
  if (role !== 'teacher' || !teacherProfile) return false;

  // 1. Primary Class Teacher has broad access to ALL subjects of their primary class
  const sec = targetSection || 'All';
  if (targetAcademicYear && isPrimaryClassTeacher(teacherProfile, targetClass, targetAcademicYear, sec)) return true;

  // 2. Normal Subject Teacher checks authoritative STEP 1 teacherAssignmentEngine
  const assignments: TeachingAssignment[] = Array.isArray(teacherProfile.teachingAssignments) 
    ? teacherProfile.teachingAssignments 
    : [];

  if (assignments.length > 0) {
    return hasMatchingAssignment(assignments, targetClass, targetSubject, targetSection, targetAcademicYear);
  }

  // Legacy fallback (only if no teachingAssignments array exists)
  const legacyClasses: string[] = Array.isArray(teacherProfile.assignedClasses) ? teacherProfile.assignedClasses : [];
  const legacySubjects: string[] = Array.isArray(teacherProfile.assignedSubjects) ? teacherProfile.assignedSubjects : [];
  return legacyClasses.some(c => normalizeClass(c).toLowerCase() === normalizeClass(targetClass).toLowerCase()) &&
         legacySubjects.some(s => normalizeSubject(s) === normalizeSubject(targetSubject));
}

/**
 * Determines whether a user is authorized to publish the complete class result.
 * Strictly Admin-only (`admin` or `super_admin`).
 */
export function canPublishClassResult(
  userRole: string,
  _teacherProfile: any,
  _targetClass: string,
  _targetAcademicYear: string = '',
  _targetSection: string = 'All'
): boolean {
  const role = (userRole || '').toLowerCase();
  return role === 'admin' || role === 'super_admin';
}

/**
 * Resolves the assigned teacher for every configured subject of a class using STEP 1 Teacher Assignments
 * Authoritatively respects Academic Year and Section context.
 */
export function resolveSubjectTeachersForClass(
  targetClass: string,
  configuredSubjects: string[],
  allTeachers: any[],
  targetSection?: string,
  targetAcademicYear?: string
): Record<string, SubjectTeacherResolution> {
  const resolutions: Record<string, SubjectTeacherResolution> = {};

  for (const subj of configuredSubjects) {
    const matchedTeachers: any[] = [];

    for (const t of allTeachers) {
      if (t.role !== 'teacher') continue;
      const assignments: TeachingAssignment[] = Array.isArray(t.teachingAssignments) ? t.teachingAssignments : [];

      if (assignments.length > 0) {
        if (hasMatchingAssignment(assignments, targetClass, subj, targetSection, targetAcademicYear)) {
          matchedTeachers.push(t);
        }
      } else {
        // Legacy fallback
        const legacyClasses: string[] = Array.isArray(t.assignedClasses) ? t.assignedClasses : [];
        const legacySubjects: string[] = Array.isArray(t.assignedSubjects) ? t.assignedSubjects : [];
        const matchesClass = legacyClasses.some(c => normalizeClass(c).toLowerCase() === normalizeClass(targetClass).toLowerCase());
        const matchesSubj = legacySubjects.some(s => normalizeSubject(s) === normalizeSubject(subj));
        if (matchesClass && matchesSubj) {
          matchedTeachers.push(t);
        }
      }
    }

    if (matchedTeachers.length === 1) {
      resolutions[subj] = {
        subject: subj,
        status: 'ASSIGNED',
        teacherName: matchedTeachers[0].fullName || matchedTeachers[0].name || 'Teacher',
        teacherId: matchedTeachers[0].id || matchedTeachers[0].uid
      };
    } else if (matchedTeachers.length === 0) {
      resolutions[subj] = {
        subject: subj,
        status: 'UNASSIGNED',
        teacherName: 'UNASSIGNED'
      };
    } else {
      resolutions[subj] = {
        subject: subj,
        status: 'CONFLICT',
        teacherName: 'MULTIPLE TEACHERS ASSIGNED',
        conflictingTeachers: matchedTeachers.map(m => ({
          id: m.id || m.uid,
          fullName: m.fullName || m.name || 'Teacher',
          email: m.email || ''
        }))
      };
    }
  }

  return resolutions;
}

/**
 * Derives subject preparation status based on student mark completeness
 */
export function computeSubjectPreparationStatus(
  subject: string,
  students: StudentMarkEntry[],
  subjectConfigs: Record<string, SubjectConfigItem>
): { status: SubjectPreparationStatus; enteredCount: number; totalCount: number } {
  const totalCount = students.length;
  if (totalCount === 0) return { status: 'NOT_STARTED', enteredCount: 0, totalCount: 0 };

  const config = subjectConfigs[subject] || {
    hasTh: true,
    hasPr: true,
    thFullMarks: 75,
    thPassMarks: 27,
    prFullMarks: 25,
    prPassMarks: 9
  };

  let enteredCount = 0;

  for (const s of students) {
    const thEntered = s.subjectAbsentsTH?.[subject] || (s.subjectMarksTH?.[subject] !== '' && s.subjectMarksTH?.[subject] !== undefined && s.subjectMarksTH?.[subject] !== null);
    const prEntered = s.subjectAbsentsPR?.[subject] || (s.subjectMarksPR?.[subject] !== '' && s.subjectMarksPR?.[subject] !== undefined && s.subjectMarksPR?.[subject] !== null);

    const isComplete = (!config.hasTh || thEntered) && (!config.hasPr || prEntered);
    if (isComplete) {
      enteredCount++;
    }
  }

  if (enteredCount === 0) {
    return { status: 'NOT_STARTED', enteredCount, totalCount };
  } else if (enteredCount === totalCount) {
    return { status: 'MARKS_COMPLETE', enteredCount, totalCount };
  } else {
    return { status: 'PARTIALLY_FILLED', enteredCount, totalCount };
  }
}

/**
 * Comprehensive 20-Point Pre-Publication Validation
 */
export function validatePrePublication(params: {
  userRole: string;
  teacherProfile?: any;
  targetClass: string;
  examType: string;
  academicYear: string;
  targetSection?: string;
  students: StudentMarkEntry[];
  subjects: string[];
  subjectConfigs: Record<string, SubjectConfigItem>;
  examPublished?: boolean;
}): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const {
    userRole,
    teacherProfile,
    targetClass,
    examType,
    academicYear,
    targetSection = 'All',
    students,
    subjects,
    subjectConfigs
  } = params;

  let enteredMarksCount = 0;
  let missingMarksCount = 0;
  let absentCount = 0;

  // 1. Authorized Actor Check (Admin-only publication policy)
  if (!canPublishClassResult(userRole, teacherProfile, targetClass, academicYear, targetSection)) {
    errors.push('CRITICAL: Publication authority is strictly Admin-only.');
  }

  // 2. Exam Name / Type Check
  if (!examType || !examType.trim()) {
    errors.push('Examination name / terminal type is mandatory.');
  }

  // 3. Academic Year Check
  if (!academicYear || !academicYear.trim()) {
    errors.push('Academic session / year is mandatory.');
  }

  // 4. Class Check
  if (!targetClass || !targetClass.trim()) {
    errors.push('Target Class is mandatory.');
  }

  // 5. Students Presence Check
  if (!students || students.length === 0) {
    errors.push('No students enrolled in this class to publish results for.');
  }

  // 6. Configured Subjects Check
  if (!subjects || subjects.length === 0) {
    errors.push('No subjects configured for this class.');
  }

  // Student Identity & Marks Inspection
  const seenStudentIds = new Set<string>();

  for (let i = 0; i < students.length; i++) {
    const std = students[i];
    const stdIdentifier = std.permanentStudentId || std.studentId || std.studentUid;

    // 17. Stable Identity Check
    if (!stdIdentifier || !stdIdentifier.trim()) {
      errors.push(`Student row #${i + 1} is missing a permanent Student ID or UID.`);
    }

    // 18. Duplicate Student Check
    if (stdIdentifier) {
      if (seenStudentIds.has(stdIdentifier)) {
        errors.push(`Duplicate student identity detected: ${stdIdentifier} (${std.studentName}).`);
      } else {
        seenStudentIds.add(stdIdentifier);
      }
    }

    // Inspect marks for every subject
    for (const subj of subjects) {
      const config = subjectConfigs[subj] || {
        hasTh: true,
        hasPr: true,
        thFullMarks: 75,
        thPassMarks: 30,
        prFullMarks: 25,
        prPassMarks: 10
      };

      // Theory Check
      if (config.hasTh) {
        const isAbsent = Boolean(std.subjectAbsentsTH?.[subj]);
        const markVal = std.subjectMarksTH?.[subj];

        if (isAbsent) {
          absentCount++;
          enteredMarksCount++;
        } else if (markVal === '' || markVal === undefined || markVal === null) {
          missingMarksCount++;
          errors.push(`Missing Theory mark for ${std.studentName} (${std.rollNo || std.studentId}) in ${subj}.`);
        } else {
          const num = Number(markVal);
          // 9. Negative marks check
          if (isNaN(num) || num < 0) {
            errors.push(`Invalid negative/non-numeric Theory mark for ${std.studentName} in ${subj}: ${markVal}`);
          }
          // 10. Exceeding full marks check
          if (num > config.thFullMarks) {
            errors.push(`Theory mark (${num}) exceeds configured Full Marks (${config.thFullMarks}) for ${std.studentName} in ${subj}.`);
          }
          enteredMarksCount++;
        }
      }

      // Practical Check
      if (config.hasPr) {
        const isAbsent = Boolean(std.subjectAbsentsPR?.[subj]);
        const markVal = std.subjectMarksPR?.[subj];

        if (isAbsent) {
          absentCount++;
          enteredMarksCount++;
        } else if (markVal === '' || markVal === undefined || markVal === null) {
          missingMarksCount++;
          errors.push(`Missing Practical mark for ${std.studentName} (${std.rollNo || std.studentId}) in ${subj}.`);
        } else {
          const num = Number(markVal);
          // 9. Negative marks check
          if (isNaN(num) || num < 0) {
            errors.push(`Invalid negative/non-numeric Practical mark for ${std.studentName} in ${subj}: ${markVal}`);
          }
          // 10. Exceeding full marks check
          if (num > config.prFullMarks) {
            errors.push(`Practical mark (${num}) exceeds configured Full Marks (${config.prFullMarks}) for ${std.studentName} in ${subj}.`);
          }
          enteredMarksCount++;
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalStudents: students.length,
      totalSubjects: subjects.length,
      enteredMarksCount,
      missingMarksCount,
      absentCount
    }
  };
}

/**
 * Calculates deterministic ranks with standard tie-handling (1, 2, 2, 4...)
 */
export function calculateClassRanks(records: Array<{ total: number; [key: string]: any }>): Array<any> {
  const sorted = [...records].sort((a, b) => b.total - a.total);
  let currentRank = 1;
  let prevTotal = -1;
  let sameRankCount = 0;

  return sorted.map((std, idx) => {
    if (std.total === prevTotal) {
      sameRankCount++;
    } else {
      currentRank += sameRankCount;
      if (idx === 0) currentRank = 1;
      sameRankCount = 1;
      prevTotal = std.total;
    }
    return {
      ...std,
      rank: currentRank
    };
  });
}

// ============================================================================
// STAGE 2 — EXAMINATION MANAGEMENT & TERMINAL PUBLICATION POLICY UTILITIES
// ============================================================================

export const CANONICAL_TERMINAL_EXAMS = [
  { id: 'FIRST_TERMINAL', name: 'First Terminal Examination' },
  { id: 'SECOND_TERMINAL', name: 'Second Terminal Examination' },
  { id: 'THIRD_TERMINAL', name: 'Third Terminal Examination' },
  { id: 'FINAL_TERMINAL', name: 'Final Terminal Examination' }
] as const;

export type CanonicalTerminalId = typeof CANONICAL_TERMINAL_EXAMS[number]['id'];

export interface TerminalStatusInfo {
  terminalId: CanonicalTerminalId;
  name: string;
  exists: boolean;
  published: boolean;
  status: string;
  isLocked: boolean;
  examId?: string;
}

export interface TerminalAvailabilityResult {
  academicYear: string;
  class: string;
  section: string;
  terminals: Record<CanonicalTerminalId, TerminalStatusInfo>;
  allFourPublished: boolean;
  publishedCount: number;
  availableTerminals: CanonicalTerminalId[];
}


/**
 * Derives terminal publication lock and availability for a year/class/section combination.
 * Exactly 4 terminals are permitted: FIRST_TERMINAL, SECOND_TERMINAL, THIRD_TERMINAL, FINAL_TERMINAL.
 * A terminal is locked ONLY when published === true or status === 'PUBLISHED'.
 * Drafts, in-progress, ready-for-review do NOT lock out the terminal.
 */
export function getTerminalAvailability(params: {
  academicYear: string;
  className: string;
  section: string;
  existingExams: Array<Record<string, any>>;
}): TerminalAvailabilityResult {
  const normYear = parseAndValidateAcademicYear(params.academicYear) || (params.academicYear || '').trim();
  const normClass = normalizeClass(params.className || '').trim();
  const rawSec = (params.section || '').replace(/^Section\s+/i, '').trim();
  const normSec = (rawSec && rawSec.toLowerCase() !== 'all') ? rawSec.toUpperCase() : 'A';

  const terminalsRecord: Record<CanonicalTerminalId, TerminalStatusInfo> = {
    FIRST_TERMINAL: { terminalId: 'FIRST_TERMINAL', name: 'First Terminal Examination', exists: false, published: false, status: 'NOT_STARTED', isLocked: false },
    SECOND_TERMINAL: { terminalId: 'SECOND_TERMINAL', name: 'Second Terminal Examination', exists: false, published: false, status: 'NOT_STARTED', isLocked: false },
    THIRD_TERMINAL: { terminalId: 'THIRD_TERMINAL', name: 'Third Terminal Examination', exists: false, published: false, status: 'NOT_STARTED', isLocked: false },
    FINAL_TERMINAL: { terminalId: 'FINAL_TERMINAL', name: 'Final Terminal Examination', exists: false, published: false, status: 'NOT_STARTED', isLocked: false }
  };

  for (const ex of params.existingExams) {
    if (!ex) continue;
    const exCat = String(ex.category || '').toUpperCase();
    if (exCat === 'TEST') continue; // TEST examinations are exempt

    const exYear = parseAndValidateAcademicYear(ex.canonicalAcademicYearId || ex.academicYear || ex.targetAcademicYear || '');
    if (exYear !== normYear) continue;

    const exClass = normalizeClass(ex.canonicalClassId || ex.class || ex.selectedClass || '').trim();
    if (exClass !== normClass) continue;

    const exRawSec = String(ex.canonicalSectionId || ex.section || ex.selectedSection || 'A').replace(/^Section\s+/i, '').trim();
    const exSec = (exRawSec && exRawSec.toLowerCase() !== 'all') ? exRawSec.toUpperCase() : 'A';
    if (exSec !== normSec) continue;

    const termType = normalizeTerminalExamType(ex.terminalExamType || ex.examType || ex.type || ex.name || '');
    if (!termType) continue;

    const isPublished = Boolean(ex.published === true || ex.status === 'PUBLISHED');
    const status = String(ex.status || (isPublished ? 'PUBLISHED' : 'DRAFT')).toUpperCase();

    terminalsRecord[termType] = {
      terminalId: termType,
      name: CANONICAL_TERMINAL_EXAMS.find(t => t.id === termType)?.name || termType,
      exists: true,
      published: isPublished,
      status: isPublished ? 'PUBLISHED' : status,
      isLocked: isPublished,
      examId: ex.id
    };
  }

  const publishedCount = Object.values(terminalsRecord).filter(t => t.isLocked).length;
  const allFourPublished = publishedCount === 4;
  const availableTerminals = (Object.keys(terminalsRecord) as CanonicalTerminalId[]).filter(
    id => !terminalsRecord[id].isLocked
  );

  return {
    academicYear: normYear,
    class: normClass,
    section: normSec,
    terminals: terminalsRecord,
    allFourPublished,
    publishedCount,
    availableTerminals
  };
}

export type SubjectWorkflowStatus = 
  | 'UNASSIGNED' 
  | 'NOT_STARTED' 
  | 'PARTIALLY_FILLED' 
  | 'MARKS_COMPLETE' 
  | 'SUBMITTED' 
  | 'CORRECTION_REQUESTED' 
  | 'APPROVED';

/**
 * Computes authoritatively derived subject-level workflow status for Admin progress monitoring.
 * Status precedence:
 * 1. UNASSIGNED (if teacher resolution is unassigned)
 * 2. CORRECTION_REQUESTED (if flagged in correctionsRequested or subjectStatus)
 * 3. APPROVED (if marked approved)
 * 4. SUBMITTED (if submitted by teacher)
 * 5. MARKS_COMPLETE (if all eligible students have marks, but not submitted)
 * 6. PARTIALLY_FILLED (if enteredCount > 0 and enteredCount < totalCount, treating numeric 0 and 'AB' as entered)
 * 7. NOT_STARTED (if enteredCount === 0)
 */
export function computeSubjectWorkflowStatus(params: {
  subject: string;
  students: StudentMarkEntry[];
  subjectConfigs: Record<string, SubjectConfigItem>;
  teacherResolution?: SubjectTeacherResolution;
  examDocData?: any;
}): {
  status: SubjectWorkflowStatus;
  enteredCount: number;
  totalCount: number;
  progressPercent: number;
  lastSavedAt?: string;
  assignedTeacherName?: string;
} {
  const { subject, students, subjectConfigs, teacherResolution, examDocData } = params;
  const totalCount = students.length;

  const config = subjectConfigs[subject] || {
    hasTh: true,
    hasPr: true,
    thFullMarks: 75,
    thPassMarks: 30,
    prFullMarks: 25,
    prPassMarks: 10
  };

  let enteredCount = 0;
  for (const s of students) {
    const thEntered = s.subjectAbsentsTH?.[subject] || (s.subjectMarksTH?.[subject] !== '' && s.subjectMarksTH?.[subject] !== undefined);
    const prEntered = s.subjectAbsentsPR?.[subject] || (s.subjectMarksPR?.[subject] !== '' && s.subjectMarksPR?.[subject] !== undefined);

    const isComplete = (!config.hasTh || thEntered) && (!config.hasPr || prEntered);
    if (isComplete) {
      enteredCount++;
    }
  }

  const progressPercent = totalCount > 0 ? Math.round((enteredCount / totalCount) * 100) : 0;
  const lastSavedAt = examDocData?.subjectStatus?.[subject]?.lastSavedAt || undefined;
  const assignedTeacherName = teacherResolution?.status === 'ASSIGNED' ? teacherResolution.teacherName : undefined;

  // 1. Unassigned teacher check
  if (teacherResolution && teacherResolution.status === 'UNASSIGNED') {
    return {
      status: 'UNASSIGNED',
      enteredCount,
      totalCount,
      progressPercent,
      lastSavedAt,
      assignedTeacherName: 'UNASSIGNED'
    };
  }

  // 2. Correction Requested check
  const correction = examDocData?.correctionsRequested?.[subject];
  const subjDocStatus = examDocData?.subjectStatus?.[subject];
  if ((correction && !correction.resolved) || subjDocStatus?.status === 'CORRECTION_REQUESTED' || subjDocStatus?.correctionRequested === true) {
    return {
      status: 'CORRECTION_REQUESTED',
      enteredCount,
      totalCount,
      progressPercent,
      lastSavedAt,
      assignedTeacherName
    };
  }

  // 3. Approved check
  if (subjDocStatus?.status === 'APPROVED' || subjDocStatus?.approved === true) {
    return {
      status: 'APPROVED',
      enteredCount,
      totalCount,
      progressPercent,
      lastSavedAt,
      assignedTeacherName
    };
  }

  // 4. Submitted check
  if (subjDocStatus?.status === 'SUBMITTED' || subjDocStatus?.submitted === true) {
    return {
      status: 'SUBMITTED',
      enteredCount,
      totalCount,
      progressPercent,
      lastSavedAt,
      assignedTeacherName
    };
  }

  // 5. Marks complete check (all marks entered, but not yet formally submitted)
  if (totalCount > 0 && enteredCount === totalCount) {
    return {
      status: 'MARKS_COMPLETE',
      enteredCount,
      totalCount,
      progressPercent,
      lastSavedAt,
      assignedTeacherName
    };
  }

  // 6. Partially filled (some, but not all, required marks)
  if (enteredCount > 0) {
    return {
      status: 'PARTIALLY_FILLED',
      enteredCount,
      totalCount,
      progressPercent,
      lastSavedAt,
      assignedTeacherName
    };
  }

  // 7. Not started
  return {
    status: 'NOT_STARTED',
    enteredCount,
    totalCount,
    progressPercent,
    lastSavedAt,
    assignedTeacherName
  };
}

export interface AuthoritativeRosterStudent {
  studentUid: string;
  studentId: string;
  permanentStudentId?: string;
  studentEmis?: string;
  studentName: string;
  rollNo: string;
  rollNumberSnapshot: string;
  class: string;
  section: string;
  academicYear: string;
  email?: string;
  guardianEmail?: string;
  guardianName?: string;
}

/**
 * Filter and resolve eligible students adhering strictly to the contract:
 * 1. Validate academic year once; fail closed if missing or invalid (no hardcoded fallback).
 * 2. If student_enrollments has documents for that academic year, it is authoritative.
 *    Never use docSnap.id as studentUid (requires data.studentUid).
 *    If class/section has 0 students in student_enrollments, return 0 (no fallback to users).
 * 3. Fallback to users only when student_enrollments has zero records for that entire academic year (legacy data policy).
 * 4. Deduplicate student UIDs and exclude inactive/deleted/transferred records.
 * Supports both object params and positional (rawEnrollments, rawUsers, className, section, academicYear) invocation.
 */
export function filterEligibleStudentsFromRaw(
  paramsOrEnrollments: any,
  userDocsArg?: any[],
  classNameArg?: string,
  sectionArg?: string,
  academicYearArg?: string,
  currentAcademicYearArg?: string
): any {
  const isPositional = Array.isArray(paramsOrEnrollments);
  let academicYear: string;
  let className: string;
  let section: string;
  let enrollmentDocs: Array<{ id: string; data: any }>;
  let userDocs: Array<{ id: string; data: any }>;
  let currentAcademicYearRaw: string | undefined;

  if (isPositional) {
    enrollmentDocs = (paramsOrEnrollments || []).map((x: any) => ({
      id: x.id || x.studentUid || '',
      data: x.data !== undefined ? x.data : x
    }));
    userDocs = (userDocsArg || []).map((x: any) => ({
      id: x.id || x.studentUid || '',
      data: x.data !== undefined ? x.data : x
    }));
    className = classNameArg || '';
    section = sectionArg || 'A';
    academicYear = academicYearArg || '';
    currentAcademicYearRaw = currentAcademicYearArg;
  } else {
    academicYear = paramsOrEnrollments.academicYear;
    className = paramsOrEnrollments.className;
    section = paramsOrEnrollments.section;
    enrollmentDocs = paramsOrEnrollments.enrollmentDocs || [];
    userDocs = paramsOrEnrollments.userDocs || [];
    currentAcademicYearRaw = paramsOrEnrollments.currentAcademicYear;
  }

  const canonicalYear = parseAndValidateAcademicYear(academicYear);
  if (!canonicalYear) {
    if (isPositional) return [];
    return {
      success: false,
      error: `INVALID_ACADEMIC_YEAR: Academic year "${academicYear}" is missing or invalid. Expected 4-digit BS year or consecutive session.`,
      students: [],
      source: 'student_enrollments'
    };
  }

  const canonicalCurrentYear = currentAcademicYearRaw
    ? parseAndValidateAcademicYear(currentAcademicYearRaw)
    : null;

  const normClass = normalizeClass(className || '').trim().toLowerCase();
  const rawSec = (section || '').replace(/^Section\s+/i, '').trim();
  const normSec = (rawSec && rawSec.toLowerCase() !== 'all') ? rawSec.toUpperCase() : 'A';

  // Check if student_enrollments has ANY records for this academic year
  const yearEnrollments = enrollmentDocs.filter(docItem => {
    const d = docItem.data;
    if (!d) return false;
    const docYear = parseAndValidateAcademicYear(d.academicYearId || d.academicYear || (d.bsYear ? String(d.bsYear) : ''));
    return docYear === canonicalYear;
  });

  if (yearEnrollments.length > 0) {
    // Authoritative source: student_enrollments
    const seenUids = new Set<string>();
    const eligibleStudents: AuthoritativeRosterStudent[] = [];

    for (const enr of yearEnrollments) {
      const d = enr.data;
      const st = String(d.status || '').toLowerCase();
      if (st === 'inactive' || st === 'transferred' || st === 'deleted' || st === 'blocked' || st === 'rejected') continue;

      const enrClass = normalizeClass(d.class || '').trim().toLowerCase();
      if (enrClass !== normClass) continue;

      const enrSec = String(d.section || 'A').replace(/^Section\s+/i, '').trim().toUpperCase();
      if (normSec !== 'ALL' && enrSec !== normSec) continue;

      const sUid = (d.studentUid || '').trim();
      if (!sUid) {
        // Enforce contract: Never use enr.id as studentUid
        console.warn(`[ROSTER] Invalid enrollment record ${enr.id} missing studentUid. Skipping.`);
        continue;
      }

      if (seenUids.has(sUid)) continue;
      seenUids.add(sUid);

      const roll = String(d.rollNo || d.rollNumber || d.schoolId || '').trim();
      const sId = String(d.permanentStudentId || d.studentId || sUid).trim();

      // Enrich metadata from userDocs if available
      const matchedUser = userDocs.find(u => u.id === sUid || u.data?.studentUid === sUid);
      const uData = matchedUser?.data || matchedUser || {};

      eligibleStudents.push({
        studentUid: sUid,
        studentId: sId,
        permanentStudentId: sId,
        studentEmis: d.studentEmis || d.emisNumber || uData.studentEmis || uData.emisNumber || '',
        studentName: d.studentName || d.fullName || uData.fullName || uData.displayName || uData.name || 'Student',
        rollNo: roll,
        rollNumberSnapshot: roll,
        class: className,
        section: normSec,
        academicYear: canonicalYear,
        email: d.email || uData.email || '',
        guardianEmail: d.guardianEmail || d.parentEmail || uData.guardianEmail || uData.parentEmail || '',
        guardianName: d.guardianName || d.parentName || uData.guardianName || uData.parentName || ''
      });
    }

    eligibleStudents.sort((a, b) => {
      const rA = parseInt(a.rollNo, 10);
      const rB = parseInt(b.rollNo, 10);
      if (!isNaN(rA) && !isNaN(rB)) return rA - rB;
      return a.studentName.localeCompare(b.studentName);
    });

    if (isPositional) return eligibleStudents;

    return {
      success: true,
      students: eligibleStudents,
      source: 'student_enrollments'
    };
  }

  // Never leak legacy/current users into a future academic year with zero enrollments
  if (canonicalCurrentYear && Number(canonicalYear) > Number(canonicalCurrentYear)) {
    if (isPositional) return [];
    return {
      success: true,
      students: [],
      source: 'student_enrollments'
    };
  }

  // Fallback to users collection ONLY when student_enrollments has zero records for that entire year (legacy)
  const seenUids = new Set<string>();
  const legacyStudents: AuthoritativeRosterStudent[] = [];

  for (const uItem of userDocs) {
    const u = uItem.data;
    if (!u) continue;
    if (String(u.role || '').toLowerCase() !== 'student') continue;
    const uStat = String(u.status || '').toLowerCase();
    if (uStat === 'inactive' || uStat === 'transferred' || uStat === 'deleted' || uStat === 'blocked' || uStat === 'rejected' || u.active === false || u.deleted === true) continue;

    const uClass = normalizeClass(u.class || '').trim().toLowerCase();
    if (uClass !== normClass) continue;

    const uSec = String(u.section || 'A').replace(/^Section\s+/i, '').trim().toUpperCase();
    if (normSec !== 'ALL' && uSec !== normSec) continue;

    // Academic year matching for legacy:
    // - If student profile has an explicit year, it must match canonicalYear.
    // - If student profile has NO year set (legacy record), ONLY include it for the current active academic year!
    const uYear = parseAndValidateAcademicYear(u.academicYear || u.classAssignedYear || u.session || '');
    if (uYear) {
      if (uYear !== canonicalYear) continue;
    } else if (canonicalCurrentYear && canonicalYear !== canonicalCurrentYear) {
      continue;
    }

    const sUid = uItem.id;
    if (seenUids.has(sUid)) continue;
    seenUids.add(sUid);

    const roll = String(u.rollNo || u.rollNumber || '').trim();
    const sId = String(u.permanentStudentId || u.studentId || sUid).trim();

    legacyStudents.push({
      studentUid: sUid,
      studentId: sId,
      permanentStudentId: sId,
      studentEmis: u.studentEmis || u.emisNumber || '',
      studentName: u.fullName || u.displayName || u.name || 'Student',
      rollNo: roll,
      rollNumberSnapshot: roll,
      class: className,
      section: normSec,
      academicYear: canonicalYear,
      email: u.email || '',
      guardianEmail: u.guardianEmail || u.parentEmail || '',
      guardianName: u.guardianName || u.parentName || ''
    });
  }

  legacyStudents.sort((a, b) => {
    const rA = parseInt(a.rollNo, 10);
    const rB = parseInt(b.rollNo, 10);
    if (!isNaN(rA) && !isNaN(rB)) return rA - rB;
    return a.studentName.localeCompare(b.studentName);
  });

  if (isPositional) return legacyStudents;

  return {
    success: true,
    students: legacyStudents,
    source: 'users_legacy'
  };
}
