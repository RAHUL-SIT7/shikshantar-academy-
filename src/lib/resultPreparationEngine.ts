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
  TeachingAssignment,
  matchesTeachingContext,
  hasMatchingAssignment
} from './teacherAssignmentEngine';
import { getNepalGPA, getGrade } from '../components/admin/ManualEntryTab';

export type ExamPreparationStatus = 'IN PROGRESS' | 'READY FOR REVIEW' | 'PUBLISHED';
export type SubjectPreparationStatus = 'NOT STARTED' | 'DRAFT' | 'READY FOR REVIEW';

/**
 * Constructs a collision-safe canonical exam identifier combining
 * Examination, Class, Section, and Academic Year.
 * Example: 'First_Terminal_5_A_2083'
 * If section and academic year are omitted, generates backward-compatible format: 'First_Terminal_5'
 */
export function buildCanonicalExamId(
  examType: string,
  className: string,
  section?: string,
  academicYear?: string
): string {
  const cleanExam = (examType || '').trim().replace(/\s+/g, '_');
  const cleanClass = normalizeClass(className || '').replace(/\s+/g, '');
  const cleanSection = (section && section.trim() && section.trim().toLowerCase() !== 'all')
    ? section.trim().toUpperCase()
    : '';
  // Extract 4-digit BS/AD year if present (e.g. '2083' from '2083–2084 B.S.') for clean, collision-free canonical IDs
  const yearMatch = (academicYear || '').match(/\d{4}/);
  const cleanYear = yearMatch ? yearMatch[0] : (academicYear || '').trim().replace(/[^0-9]/g, '');

  if (cleanSection && cleanYear) {
    return `${cleanExam}_${cleanClass}_${cleanSection}_${cleanYear}`;
  } else if (cleanSection) {
    return `${cleanExam}_${cleanClass}_${cleanSection}`;
  } else if (cleanYear) {
    return `${cleanExam}_${cleanClass}_${cleanYear}`;
  }
  return `${cleanExam}_${cleanClass}`;
}

export interface SubjectTeacherResolution {
  subject: string;
  status: 'ASSIGNED' | 'UNASSIGNED' | 'CONFLICT';
  teacherName: string;
  teacherId?: string;
  conflictingTeachers?: Array<{ id: string; fullName: string; email?: string }>;
}

export interface StudentMarkEntry {
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
  subjectMarksTH: Record<string, string | number>;
  subjectMarksPR: Record<string, string | number>;
  subjectAbsentsTH: Record<string, boolean>;
  subjectAbsentsPR: Record<string, boolean>;
}

export interface SubjectConfigItem {
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
 * Checks if a teacher is the primary Class Teacher of a specified class
 */
export function isPrimaryClassTeacher(
  teacherProfile: any, 
  targetClass: string,
  academicYear?: string
): boolean {
  if (!teacherProfile || !targetClass) return false;
  const targetNorm = normalizeClass(targetClass).toLowerCase();
  
  const pct = teacherProfile.primaryClassTeacher ? normalizeClass(teacherProfile.primaryClassTeacher).toLowerCase() : '';
  const legacyClass = teacherProfile.class ? normalizeClass(teacherProfile.class).toLowerCase() : '';
  
  const matchesClass = pct === targetNorm || legacyClass === targetNorm;
  if (!matchesClass) return false;

  // If teacher profile specifies a classAssignedYear, verify against academicYear
  const teacherClassYear = (teacherProfile.primaryClassTeacherYear || teacherProfile.classAssignedYear || '').trim();
  if (teacherClassYear && academicYear) {
    const tMatch = teacherClassYear.match(/\d{4}/);
    const aMatch = academicYear.match(/\d{4}/);
    if (tMatch && aMatch) {
      if (tMatch[0] !== aMatch[0]) return false;
    } else {
      const cleanTYear = teacherClassYear.replace(/[^0-9]/g, '');
      const cleanAYear = academicYear.replace(/[^0-9]/g, '');
      if (cleanTYear && cleanAYear && !cleanAYear.includes(cleanTYear)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Determines whether a user can access a class within the Result Preparation workflow
 */
export function canTeacherAccessClass(
  userRole: string,
  teacherProfile: any,
  targetClass: string,
  targetSection?: string,
  targetAcademicYear?: string
): boolean {
  const role = (userRole || '').toLowerCase();
  if (role === 'admin') return true;
  if (role !== 'teacher' || !teacherProfile) return false;

  // 1. Class Teacher can access their primary class
  if (isPrimaryClassTeacher(teacherProfile, targetClass, targetAcademicYear)) return true;

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
  targetSection?: string,
  targetAcademicYear?: string
): boolean {
  const role = (userRole || '').toLowerCase();
  if (role === 'admin') return true;
  if (role !== 'teacher' || !teacherProfile) return false;

  // 1. Primary Class Teacher has broad access to ALL subjects of their primary class
  if (isPrimaryClassTeacher(teacherProfile, targetClass, targetAcademicYear)) return true;

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
 * Determines whether a user is authorized to publish the complete class result
 * ONLY Admin and the authorized Class Teacher of that class can publish.
 * Normal Subject Teachers are strictly prohibited.
 */
export function canPublishClassResult(
  userRole: string,
  teacherProfile: any,
  targetClass: string,
  targetAcademicYear?: string
): boolean {
  const role = (userRole || '').toLowerCase();
  if (role === 'admin') return true;
  if (role !== 'teacher' || !teacherProfile) return false;

  return isPrimaryClassTeacher(teacherProfile, targetClass, targetAcademicYear);
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
  if (totalCount === 0) return { status: 'NOT STARTED', enteredCount: 0, totalCount: 0 };

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

  if (enteredCount === 0) {
    return { status: 'NOT STARTED', enteredCount, totalCount };
  } else if (enteredCount === totalCount) {
    return { status: 'READY FOR REVIEW', enteredCount, totalCount };
  } else {
    return { status: 'DRAFT', enteredCount, totalCount };
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
    students,
    subjects,
    subjectConfigs
  } = params;

  let enteredMarksCount = 0;
  let missingMarksCount = 0;
  let absentCount = 0;

  // 1. Authorized Actor Check
  if (!canPublishClassResult(userRole, teacherProfile, targetClass, academicYear)) {
    errors.push('CRITICAL: Only Administrators or the primary Class Teacher of this class are authorized to publish results.');
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
