/**
 * Authoritative Custom Subject Engine for Shikshantar Academy
 * Enforces:
 * - Stable immutable identity (CSUB-XXXXX)
 * - Scope validation (by class or 'All')
 * - Case-insensitive & trimmed uniqueness
 * - Reference checking across Teachers, Results, Summaries, Exams
 * - Safe Delete vs Archive/Restore governance
 * - System subject immutability
 * - Idempotent concurrency & canonical audit logging
 */

import { db, auth } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  runTransaction
} from 'firebase/firestore';
import { recordAuditLog } from './auditLogger';
import { STANDARD_SUBJECTS, normalizeClass } from './teacherAssignmentEngine';

export interface CustomSubject {
  id: string; // Stable internal identifier, e.g. CSUB-1780330000-A1B2
  code?: string; // Optional code, e.g. CS-101
  name: string; // Display name
  normalizedName: string; // Lowercase trimmed for collision check
  targetClass: string; // 'All' or specific class e.g. '5'
  type: 'CUSTOM' | 'SYSTEM';
  isSystem: boolean;
  status: 'ACTIVE' | 'ARCHIVED';
  description?: string;
  thFullMarks?: number;
  thPassMarks?: number;
  prFullMarks?: number;
  prPassMarks?: number;
  hasTh?: boolean;
  hasPr?: boolean;
  createdAt: string;
  createdBy: string;
  createdByName?: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string;
  archivedAt?: string | null;
  archivedBy?: string | null;
  archivedByName?: string | null;
}

export interface SubjectUsageSummary {
  teacherAssignments: number;
  results: number;
  resultSummaries: number;
  exams: number;
  totalReferences: number;
  canDelete: boolean;
  blockReason?: string;
}

/**
 * Normalizes subject names for case-insensitive, whitespace-trimmed comparison
 */
export function normalizeSubjectName(name: string): string {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Generates a stable, immutable unique ID for a custom subject
 */
export function generateCustomSubjectId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CSUB-${timestamp}-${random}`;
}

/**
 * Checks whether a given subject name is a built-in standard system curriculum subject
 */
export function isStandardSystemSubject(name: string): boolean {
  const norm = normalizeSubjectName(name);
  return STANDARD_SUBJECTS.some(s => normalizeSubjectName(s) === norm);
}

/**
 * Fetches all custom subjects from Firestore
 */
export async function getCustomSubjects(): Promise<CustomSubject[]> {
  try {
    const qSnap = await getDocs(collection(db, 'custom_subjects'));
    const list: CustomSubject[] = [];
    qSnap.forEach(d => {
      const data = d.data();
      list.push({
        id: d.id,
        ...data
      } as CustomSubject);
    });
    return list;
  } catch (err) {
    console.warn('Failed to load custom subjects:', err);
    return [];
  }
}

/**
 * Filters active custom subjects for a specific class
 */
export function filterActiveCustomSubjectsForClass(
  subjects: CustomSubject[],
  targetClass: string
): CustomSubject[] {
  const normTarget = normalizeClass(targetClass);
  return subjects.filter(s => {
    if (s.status !== 'ACTIVE') return false;
    if (s.targetClass === 'All' || !s.targetClass) return true;
    return normalizeClass(s.targetClass) === normTarget;
  });
}

/**
 * Performs a deep forensic reference check across the entire database
 * to determine if a subject is referenced anywhere in existing academic records.
 */
export async function checkSubjectUsage(
  subjectId: string,
  subjectName: string,
  targetClass?: string
): Promise<SubjectUsageSummary> {
  const normName = normalizeSubjectName(subjectName);
  let teacherAssignments = 0;
  let results = 0;
  let resultSummaries = 0;
  let exams = 0;

  try {
    // 1. Check Teacher Assignments in users collection
    const teachersSnap = await getDocs(
      query(collection(db, 'users'), where('role', '==', 'teacher'))
    );
    teachersSnap.forEach(d => {
      const uData = d.data();
      // Check structured teachingAssignments
      if (Array.isArray(uData.teachingAssignments)) {
        uData.teachingAssignments.forEach((assign: any) => {
          if (normalizeSubjectName(assign.subject) === normName) {
            teacherAssignments++;
          }
        });
      }
      // Check legacy assignedSubjects array
      if (Array.isArray(uData.assignedSubjects)) {
        uData.assignedSubjects.forEach((subj: string) => {
          if (normalizeSubjectName(subj) === normName) {
            teacherAssignments++;
          }
        });
      }
    });

    // 2. Check Results collection
    const resultsSnap = await getDocs(collection(db, 'results'));
    resultsSnap.forEach(d => {
      const rData = d.data();
      if (normalizeSubjectName(rData.subject) === normName) {
        results++;
      }
    });

    // 3. Check Result Summaries
    const summarySnap = await getDocs(collection(db, 'resultSummary'));
    summarySnap.forEach(d => {
      const sData = d.data();
      if (sData.subjects && typeof sData.subjects === 'object') {
        Object.keys(sData.subjects).forEach(subKey => {
          if (normalizeSubjectName(subKey) === normName) {
            resultSummaries++;
          }
        });
      }
    });

    // 4. Check Exams collection (subjectStatus or correctionsRequested)
    const examsSnap = await getDocs(collection(db, 'exams'));
    examsSnap.forEach(d => {
      const eData = d.data();
      if (eData.subjectStatus && typeof eData.subjectStatus === 'object') {
        Object.keys(eData.subjectStatus).forEach(subKey => {
          if (normalizeSubjectName(subKey) === normName) {
            exams++;
          }
        });
      }
      if (eData.correctionsRequested && typeof eData.correctionsRequested === 'object') {
        Object.keys(eData.correctionsRequested).forEach(subKey => {
          if (normalizeSubjectName(subKey) === normName) {
            exams++;
          }
        });
      }
    });
  } catch (err) {
    console.error('Error during subject reference check:', err);
  }

  const totalReferences = teacherAssignments + results + resultSummaries + exams;
  const canDelete = totalReferences === 0;
  const blockReason = canDelete
    ? undefined
    : `This subject cannot be permanently deleted because it is referenced by existing academic records (${totalReferences} references: ${teacherAssignments} teacher assignment${teacherAssignments === 1 ? '' : 's'}, ${results} result mark${results === 1 ? '' : 's'}, ${resultSummaries} summary reference${resultSummaries === 1 ? '' : 's'}, ${exams} exam configuration${exams === 1 ? '' : 's'}). Archive it instead.`;

  return {
    teacherAssignments,
    results,
    resultSummaries,
    exams,
    totalReferences,
    canDelete,
    blockReason
  };
}

/**
 * Creates a new custom subject with uniqueness and authority validation
 */
export async function createCustomSubject(input: {
  name: string;
  code?: string;
  targetClass?: string;
  description?: string;
  thFullMarks?: number;
  thPassMarks?: number;
  prFullMarks?: number;
  prPassMarks?: number;
  hasTh?: boolean;
  hasPr?: boolean;
}): Promise<CustomSubject> {
  const rawName = (input.name || '').trim();
  if (!rawName) {
    throw new Error('Subject Name is required and cannot be empty.');
  }

  const normalized = normalizeSubjectName(rawName);
  const targetClass = input.targetClass?.trim() || 'All';
  const normClass = normalizeClass(targetClass);

  // 1. Check against standard built-in subjects
  if (isStandardSystemSubject(rawName)) {
    throw new Error(`"${rawName}" is a built-in system curriculum subject and already exists.`);
  }

  // 2. Check for duplicate active custom subject in same class scope
  const existingList = await getCustomSubjects();
  const collision = existingList.find(s => {
    if (s.status !== 'ACTIVE') return false;
    if (normalizeSubjectName(s.name) !== normalized) return false;
    if (s.targetClass === 'All' || targetClass === 'All') return true;
    return normalizeClass(s.targetClass) === normClass;
  });

  if (collision) {
    throw new Error(
      `An active subject with the name "${rawName}" already exists in ${collision.targetClass === 'All' ? 'All Classes' : `Class ${collision.targetClass}`}.`
    );
  }

  const subjectId = generateCustomSubjectId();
  const currentUser = auth.currentUser;
  const now = new Date().toISOString();

  const newSubject: CustomSubject = {
    id: subjectId,
    code: input.code?.trim() || undefined,
    name: rawName,
    normalizedName: normalized,
    targetClass: targetClass,
    type: 'CUSTOM',
    isSystem: false,
    status: 'ACTIVE',
    description: input.description?.trim() || '',
    thFullMarks: input.thFullMarks ?? 75,
    thPassMarks: input.thPassMarks ?? 30,
    prFullMarks: input.prFullMarks ?? 25,
    prPassMarks: input.prPassMarks ?? 10,
    hasTh: input.hasTh ?? true,
    hasPr: input.hasPr ?? true,
    createdAt: now,
    createdBy: currentUser?.uid || 'admin',
    createdByName: currentUser?.displayName || 'Administrator',
    updatedAt: now,
    updatedBy: currentUser?.uid || 'admin',
    updatedByName: currentUser?.displayName || 'Administrator'
  };

  const docRef = doc(db, 'custom_subjects', subjectId);
  await setDoc(docRef, newSubject);

  // Audit Logging
  try {
    await recordAuditLog({
      category: 'academic',
      actionType: 'SUBJECT_CREATED',
      targetType: 'custom_subject',
      targetId: subjectId,
      studentClass: targetClass,
      previousValue: 'None',
      newValue: `Created custom subject ${rawName} (${targetClass})`,
      reason: `Admin created custom subject ${rawName} for ${targetClass === 'All' ? 'All Classes' : `Class ${targetClass}`}`,
      result: 'SUCCESS'
    });
  } catch (e) {
    console.warn('Audit log failed for SUBJECT_CREATED:', e);
  }

  return newSubject;
}

/**
 * Updates an existing custom subject.
 * Renaming is permitted ONLY if the subject has zero references.
 */
export async function updateCustomSubject(
  subjectId: string,
  updates: {
    name?: string;
    code?: string;
    targetClass?: string;
    description?: string;
    thFullMarks?: number;
    thPassMarks?: number;
    prFullMarks?: number;
    prPassMarks?: number;
    hasTh?: boolean;
    hasPr?: boolean;
  }
): Promise<void> {
  const docRef = doc(db, 'custom_subjects', subjectId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error('Custom subject not found.');
  }

  const existing = docSnap.data() as CustomSubject;
  if (existing.isSystem) {
    throw new Error('Built-in system subjects cannot be modified.');
  }

  const currentUser = auth.currentUser;
  const now = new Date().toISOString();

  // If name is changing, verify that the subject is unused
  if (updates.name && updates.name.trim() !== existing.name) {
    const rawNewName = updates.name.trim();
    if (!rawNewName) {
      throw new Error('Subject name cannot be empty.');
    }

    const usage = await checkSubjectUsage(subjectId, existing.name, existing.targetClass);
    if (!usage.canDelete) {
      throw new Error(
        `This subject cannot be renamed because it is referenced by ${usage.totalReferences} existing academic record(s). Renaming is blocked to protect historical integrity. Archive it and create a new subject instead.`
      );
    }

    // Check collision with other active subjects
    const allSubjects = await getCustomSubjects();
    const newNorm = normalizeSubjectName(rawNewName);
    const newClass = updates.targetClass || existing.targetClass;
    const normClass = normalizeClass(newClass);

    const collision = allSubjects.find(s => {
      if (s.id === subjectId || s.status !== 'ACTIVE') return false;
      if (normalizeSubjectName(s.name) !== newNorm) return false;
      if (s.targetClass === 'All' || newClass === 'All') return true;
      return normalizeClass(s.targetClass) === normClass;
    });

    if (collision) {
      throw new Error(`An active subject named "${rawNewName}" already exists in Class ${collision.targetClass}.`);
    }
  }

  const finalName = updates.name ? updates.name.trim() : existing.name;

  await updateDoc(docRef, {
    name: finalName,
    normalizedName: normalizeSubjectName(finalName),
    code: updates.code !== undefined ? updates.code.trim() : existing.code,
    targetClass: updates.targetClass || existing.targetClass,
    description: updates.description !== undefined ? updates.description.trim() : existing.description,
    thFullMarks: updates.thFullMarks ?? existing.thFullMarks ?? 75,
    thPassMarks: updates.thPassMarks ?? existing.thPassMarks ?? 30,
    prFullMarks: updates.prFullMarks ?? existing.prFullMarks ?? 25,
    prPassMarks: updates.prPassMarks ?? existing.prPassMarks ?? 10,
    hasTh: updates.hasTh ?? existing.hasTh ?? true,
    hasPr: updates.hasPr ?? existing.hasPr ?? true,
    updatedAt: now,
    updatedBy: currentUser?.uid || 'admin',
    updatedByName: currentUser?.displayName || 'Administrator'
  });

  // Audit Logging
  try {
    await recordAuditLog({
      category: 'academic',
      actionType: 'SUBJECT_EDITED',
      targetType: 'custom_subject',
      targetId: subjectId,
      studentClass: existing.targetClass,
      previousValue: `Name: ${existing.name}, Class: ${existing.targetClass}`,
      newValue: `Name: ${finalName}, Class: ${updates.targetClass || existing.targetClass}`,
      reason: `Admin updated custom subject ${subjectId}`,
      result: 'SUCCESS'
    });
  } catch (e) {
    console.warn('Audit log failed for SUBJECT_EDITED:', e);
  }
}

/**
 * Archives a custom subject safely so it remains stored for historical records
 * but is excluded from new teacher assignments and result preparation.
 */
export async function archiveCustomSubject(subjectId: string, reason?: string): Promise<void> {
  const docRef = doc(db, 'custom_subjects', subjectId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error('Custom subject not found.');
  }

  const existing = docSnap.data() as CustomSubject;
  if (existing.isSystem) {
    throw new Error('System curriculum subjects cannot be archived.');
  }

  if (existing.status === 'ARCHIVED') {
    return; // Idempotent no-op
  }

  const currentUser = auth.currentUser;
  const now = new Date().toISOString();

  await updateDoc(docRef, {
    status: 'ARCHIVED',
    archivedAt: now,
    archivedBy: currentUser?.uid || 'admin',
    archivedByName: currentUser?.displayName || 'Administrator',
    updatedAt: now,
    updatedBy: currentUser?.uid || 'admin',
    updatedByName: currentUser?.displayName || 'Administrator'
  });

  // Audit Logging
  try {
    await recordAuditLog({
      category: 'academic',
      actionType: 'SUBJECT_ARCHIVED',
      targetType: 'custom_subject',
      targetId: subjectId,
      studentClass: existing.targetClass,
      previousValue: 'Status: ACTIVE',
      newValue: 'Status: ARCHIVED',
      reason: reason || `Admin archived custom subject ${existing.name}`,
      result: 'SUCCESS'
    });
  } catch (e) {
    console.warn('Audit log failed for SUBJECT_ARCHIVED:', e);
  }
}

/**
 * Restores an archived custom subject if no active subject with the same name collides in its scope.
 */
export async function restoreCustomSubject(subjectId: string): Promise<void> {
  const docRef = doc(db, 'custom_subjects', subjectId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error('Custom subject not found.');
  }

  const existing = docSnap.data() as CustomSubject;
  if (existing.status === 'ACTIVE') {
    return; // Idempotent no-op
  }

  // Check collision with existing active subjects
  const allSubjects = await getCustomSubjects();
  const normName = normalizeSubjectName(existing.name);
  const normClass = normalizeClass(existing.targetClass);

  const collision = allSubjects.find(s => {
    if (s.id === subjectId || s.status !== 'ACTIVE') return false;
    if (normalizeSubjectName(s.name) !== normName) return false;
    if (s.targetClass === 'All' || existing.targetClass === 'All') return true;
    return normalizeClass(s.targetClass) === normClass;
  });

  if (collision) {
    throw new Error(
      `Cannot restore: An active subject named "${existing.name}" already exists in ${collision.targetClass === 'All' ? 'All Classes' : `Class ${collision.targetClass}`}. Rename or archive the active subject first.`
    );
  }

  const currentUser = auth.currentUser;
  const now = new Date().toISOString();

  await updateDoc(docRef, {
    status: 'ACTIVE',
    archivedAt: null,
    archivedBy: null,
    archivedByName: null,
    updatedAt: now,
    updatedBy: currentUser?.uid || 'admin',
    updatedByName: currentUser?.displayName || 'Administrator'
  });

  // Audit Logging
  try {
    await recordAuditLog({
      category: 'academic',
      actionType: 'SUBJECT_RESTORED',
      targetType: 'custom_subject',
      targetId: subjectId,
      studentClass: existing.targetClass,
      previousValue: 'Status: ARCHIVED',
      newValue: 'Status: ACTIVE',
      reason: `Admin restored custom subject ${existing.name}`,
      result: 'SUCCESS'
    });
  } catch (e) {
    console.warn('Audit log failed for SUBJECT_RESTORED:', e);
  }
}

/**
 * Authoritatively deletes an unused custom subject.
 * Strictly verifies zero references at execution time.
 */
export async function deleteCustomSubject(subjectId: string): Promise<void> {
  const docRef = doc(db, 'custom_subjects', subjectId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error('Custom subject not found.');
  }

  const existing = docSnap.data() as CustomSubject;
  if (existing.isSystem) {
    throw new Error('System curriculum subjects cannot be deleted.');
  }

  // 1. Authoritative Reference Check at execution time
  const usage = await checkSubjectUsage(subjectId, existing.name, existing.targetClass);
  if (!usage.canDelete) {
    throw new Error(usage.blockReason || 'Subject cannot be deleted because references exist.');
  }

  // 2. Perform atomic deletion in transaction
  await runTransaction(db, async (txn) => {
    const currentDoc = await txn.get(docRef);
    if (!currentDoc.exists()) return;
    txn.delete(docRef);
  });

  // 3. Audit Logging
  try {
    await recordAuditLog({
      category: 'academic',
      actionType: 'SUBJECT_DELETED',
      targetType: 'custom_subject',
      targetId: subjectId,
      studentClass: existing.targetClass,
      previousValue: `Subject ${existing.name} (${existing.targetClass})`,
      newValue: 'Permanently Deleted',
      reason: `Admin permanently deleted unused custom subject ${existing.name}`,
      result: 'SUCCESS'
    });
  } catch (e) {
    console.warn('Audit log failed for SUBJECT_DELETED:', e);
  }
}
