/**
 * Teacher Assignment Engine for Shikshantar Academy School ERP
 * Authoritative source of truth for:
 * - Exact Teaching Assignments (Teacher + Class + Subject + Section + Academic Year)
 * - Dynamic Subject Configuration per Class
 * - Duplicate Prevention & Validation
 * - Legacy compatibility derivation (assignedClasses & assignedSubjects)
 */

export interface TeachingAssignment {
  class: string;           // e.g. "5", "Class 5", "Play Group", "Nursery", "LKG", "UKG"
  subject: string;         // e.g. "Mathematics", "Science"
  section?: string;        // e.g. "A", "B", "All" (default: "All")
  academicYear?: string;   // e.g. "2083"
}

export const TEACHER_CLASSES = [
  'Play Group',
  'Nursery',
  'LKG',
  'UKG',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10'
];

export const STANDARD_SUBJECTS = [
  'Mathematics',
  'Science',
  'English',
  'Nepali',
  'Social Studies',
  'Computer',
  'HPE',
  'Opt. Math',
  'Moral Science',
  'GK',
  'Drawing',
  'Rhymes'
];

export const CLASS_SUBJECT_MAP: Record<string, string[]> = {
  'Play Group': ['English', 'Nepali', 'Mathematics', 'Drawing', 'Rhymes'],
  'PG': ['English', 'Nepali', 'Mathematics', 'Drawing', 'Rhymes'],
  'Nursery': ['English', 'Nepali', 'Mathematics', 'Drawing', 'Rhymes'],
  'LKG': ['English', 'Nepali', 'Mathematics', 'Drawing', 'Rhymes'],
  'UKG': ['English', 'Nepali', 'Mathematics', 'Drawing', 'Rhymes'],
  '1': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK'],
  '2': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK'],
  '3': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK'],
  '4': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK', 'Moral Science'],
  '5': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK', 'Moral Science'],
  '6': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK', 'Moral Science', 'Opt. Math'],
  '7': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK', 'Moral Science', 'Opt. Math'],
  '8': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK', 'Moral Science', 'Opt. Math', 'HPE'],
  '9': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Opt. Math', 'Computer', 'HPE'],
  '10': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Opt. Math', 'Computer', 'HPE']
};

/**
 * Normalizes class representation for consistent comparison and display
 */
export function normalizeClass(cls: string): string {
  if (!cls) return '';
  const trimmed = cls.trim();
  if (trimmed.toLowerCase().startsWith('class ')) {
    return trimmed.substring(6).trim();
  }
  return trimmed;
}

/**
 * Returns the configured subjects for a given class, merging standard subjects and custom subjects.
 * Filters out archived custom subjects and matches targetClass scope.
 */
export function getClassConfiguredSubjects(
  cls: string,
  customSubjects: (string | { name: string; status?: string; targetClass?: string })[] = []
): string[] {
  const normCls = normalizeClass(cls);
  const baseSubjects = CLASS_SUBJECT_MAP[normCls] || CLASS_SUBJECT_MAP[cls] || STANDARD_SUBJECTS;
  
  const activeCustomNames: string[] = [];
  customSubjects.forEach(s => {
    if (typeof s === 'string') {
      if (s.trim()) activeCustomNames.push(s.trim());
    } else if (s && s.name) {
      const isArchived = s.status?.toUpperCase() === 'ARCHIVED' || s.status?.toUpperCase() === 'INACTIVE';
      const classMatches = !s.targetClass || s.targetClass === 'All' || normalizeClass(s.targetClass) === normCls;
      if (!isArchived && classMatches && s.name.trim()) {
        activeCustomNames.push(s.name.trim());
      }
    }
  });

  const combined = Array.from(new Set([...baseSubjects, ...activeCustomNames]));
  return combined;
}

/**
 * Validates a teaching assignment against existing assignments to prevent duplicates
 */
export function validateTeachingAssignment(
  newAssignment: TeachingAssignment,
  existingAssignments: TeachingAssignment[]
): { valid: boolean; error?: string } {
  if (!newAssignment.class || !newAssignment.class.trim()) {
    return { valid: false, error: 'Class is mandatory for teaching assignment.' };
  }
  if (!newAssignment.subject || !newAssignment.subject.trim()) {
    return { valid: false, error: 'Subject is mandatory for teaching assignment.' };
  }

  const normNewClass = normalizeClass(newAssignment.class).toLowerCase();
  const normNewSubject = newAssignment.subject.trim().toLowerCase();
  const normNewSection = (newAssignment.section || 'All').trim().toLowerCase();
  const normNewYear = (newAssignment.academicYear || '').trim();

  const isDuplicate = existingAssignments.some(existing => {
    const normExistingClass = normalizeClass(existing.class).toLowerCase();
    const normExistingSubject = existing.subject.trim().toLowerCase();
    const normExistingSection = (existing.section || 'All').trim().toLowerCase();
    const normExistingYear = (existing.academicYear || '').trim();

    const sameClass = normNewClass === normExistingClass;
    const sameSubject = normNewSubject === normExistingSubject;
    const sameSection = normNewSection === normExistingSection || normNewSection === 'all' || normExistingSection === 'all';
    const sameYear = !normNewYear || !normExistingYear || normNewYear === normExistingYear;

    return sameClass && sameSubject && sameSection && sameYear;
  });

  if (isDuplicate) {
    return {
      valid: false,
      error: `Duplicate assignment: Class ${newAssignment.class} - ${newAssignment.subject} is already assigned to this teacher.`
    };
  }

  return { valid: true };
}

/**
 * Adds an exact teaching assignment with duplicate rejection
 */
export function addTeachingAssignment(
  existing: TeachingAssignment[],
  newAssignment: TeachingAssignment
): { success: boolean; assignments: TeachingAssignment[]; error?: string } {
  const validation = validateTeachingAssignment(newAssignment, existing);
  if (!validation.valid) {
    return { success: false, assignments: existing, error: validation.error };
  }

  const cleanedAssignment: TeachingAssignment = {
    class: normalizeClass(newAssignment.class),
    subject: newAssignment.subject.trim(),
    section: newAssignment.section?.trim() || 'All',
    academicYear: newAssignment.academicYear?.trim() || ''
  };

  return {
    success: true,
    assignments: [...existing, cleanedAssignment]
  };
}

/**
 * Bulk assigns one subject to multiple selected classes (skipping duplicates)
 */
export function bulkAssignSubjectToClasses(
  existing: TeachingAssignment[],
  subject: string,
  classes: string[],
  academicYear?: string
): { assignments: TeachingAssignment[]; addedCount: number } {
  if (!subject || !subject.trim() || !classes || classes.length === 0) {
    return { assignments: existing, addedCount: 0 };
  }

  const cleanSubject = subject.trim();
  let updated = [...existing];
  let added = 0;

  for (const cls of classes) {
    const candidate: TeachingAssignment = {
      class: normalizeClass(cls),
      subject: cleanSubject,
      section: 'All',
      academicYear: academicYear?.trim() || ''
    };
    const validation = validateTeachingAssignment(candidate, updated);
    if (validation.valid) {
      updated.push(candidate);
      added++;
    }
  }

  return { assignments: updated, addedCount: added };
}

/**
 * Removes an assignment by index or matching reference without affecting other assignments
 */
export function removeTeachingAssignment(
  existing: TeachingAssignment[],
  target: number | TeachingAssignment
): TeachingAssignment[] {
  if (typeof target === 'number') {
    return existing.filter((_, idx) => idx !== target);
  }

  const normTargetClass = normalizeClass(target.class).toLowerCase();
  const normTargetSubject = target.subject.trim().toLowerCase();
  const normTargetSection = (target.section || 'All').trim().toLowerCase();

  return existing.filter(item => {
    const normItemClass = normalizeClass(item.class).toLowerCase();
    const normItemSubject = item.subject.trim().toLowerCase();
    const normItemSection = (item.section || 'All').trim().toLowerCase();

    return !(normItemClass === normTargetClass && normItemSubject === normTargetSubject && normItemSection === normTargetSection);
  });
}

/**
 * Derives legacy assignedClasses array for backward compatibility
 */
export function deriveLegacyAssignedClasses(
  assignments: TeachingAssignment[] = [],
  primaryClassTeacher?: string
): string[] {
  const classSet = new Set<string>();
  if (primaryClassTeacher && primaryClassTeacher.trim()) {
    classSet.add(normalizeClass(primaryClassTeacher));
  }
  for (const a of assignments) {
    if (a.class && a.class.trim()) {
      classSet.add(normalizeClass(a.class));
    }
  }
  return Array.from(classSet);
}

/**
 * Derives legacy assignedSubjects array for backward compatibility
 */
export function deriveLegacyAssignedSubjects(
  assignments: TeachingAssignment[] = [],
  mainSubject?: string
): string[] {
  const subjectSet = new Set<string>();
  if (mainSubject && mainSubject.trim()) {
    subjectSet.add(mainSubject.trim());
  }
  for (const a of assignments) {
    if (a.subject && a.subject.trim()) {
      subjectSet.add(a.subject.trim());
    }
  }
  return Array.from(subjectSet);
}

/**
 * Groups assignments by class for clean, structured UI display
 */
export function groupAssignmentsByClass(
  assignments: TeachingAssignment[] = []
): Record<string, TeachingAssignment[]> {
  const grouped: Record<string, TeachingAssignment[]> = {};
  for (const a of assignments) {
    const clsKey = normalizeClass(a.class);
    if (!grouped[clsKey]) {
      grouped[clsKey] = [];
    }
    grouped[clsKey].push(a);
  }
  return grouped;
}

/**
 * Authoritative check whether an assignment matches the exact target teaching context,
 * taking into account Class, Subject, and optional Section and Academic Year.
 */
export function matchesTeachingContext(
  assignment: TeachingAssignment,
  targetClass: string,
  targetSubject: string,
  targetSection?: string,
  targetAcademicYear?: string
): boolean {
  if (!assignment) return false;

  // 1. Class Check
  const normAssignClass = normalizeClass(assignment.class).toLowerCase();
  const normTargetClass = normalizeClass(targetClass).toLowerCase();
  if (normAssignClass !== normTargetClass) return false;

  // 2. Subject Check
  const normAssignSubject = (assignment.subject || '').trim().toLowerCase();
  const normTargetSubject = (targetSubject || '').trim().toLowerCase();
  const cleanAssignSubj = normAssignSubject.replace(/[^a-z0-9]/g, '');
  const cleanTargetSubj = normTargetSubject.replace(/[^a-z0-9]/g, '');
  if (cleanAssignSubj !== cleanTargetSubj && normAssignSubject !== normTargetSubject) return false;

  // 3. Section Check
  // If assignment specifies a section other than 'All', it must match targetSection
  const assignSec = (assignment.section || 'All').trim().toLowerCase();
  const targetSec = (targetSection || 'All').trim().toLowerCase();
  if (assignSec !== 'all' && targetSec !== 'all' && assignSec !== targetSec) {
    return false;
  }

  // 4. Academic Year Check
  // If assignment specifies an academic year, it must match targetAcademicYear
  const assignYear = (assignment.academicYear || '').trim().toLowerCase();
  const targetYear = (targetAcademicYear || '').trim().toLowerCase();
  if (assignYear && targetYear) {
    const assignMatch = assignYear.match(/\d{4}/);
    const targetMatch = targetYear.match(/\d{4}/);
    if (assignMatch && targetMatch) {
      if (assignMatch[0] !== targetMatch[0]) {
        return false;
      }
    } else {
      const cleanAssignYear = assignYear.replace(/[^0-9]/g, '');
      const cleanTargetYear = targetYear.replace(/[^0-9]/g, '');
      if (cleanAssignYear && cleanTargetYear) {
        if (!cleanTargetYear.includes(cleanAssignYear) && !cleanAssignYear.includes(cleanTargetYear)) {
          return false;
        }
      } else if (assignYear !== targetYear) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Authoritative check if a list of assignments contains a match for the target context
 */
export function hasMatchingAssignment(
  assignments: TeachingAssignment[] = [],
  targetClass: string,
  targetSubject: string,
  targetSection?: string,
  targetAcademicYear?: string
): boolean {
  return assignments.some(a => matchesTeachingContext(a, targetClass, targetSubject, targetSection, targetAcademicYear));
}
