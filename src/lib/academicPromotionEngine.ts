/**
 * Authoritative Academic Year, Student Enrollment & Promotion Engine
 * Shikshantar Academy School ERP
 *
 * Enforces:
 * 1. Permanent Student Identity (STU-XXXXXX, studentUid, EMIS) decoupling from Academic Enrollment.
 * 2. Academic Enrollment (ENR-YYYY-XXXXXX) immutability across historical Bikram Sambat (B.S.) years.
 * 3. Governed Promotion Outcomes: PROMOTED, RETAINED, TRANSFERRED, GRADUATED, INACTIVE.
 * 4. Duplicate active enrollment & roll number conflict protection.
 * 5. Transactional concurrency control & canonical audit logging.
 * 6. Non-cascading historical preservation (Results, Marksheets, Report Cards, Fees, Ledger).
 */

import { db, auth } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  runTransaction,
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { recordAuditLog } from './auditLogger';
import { getBSYearMonthDate } from './nepaliDate';
import {
  generateNextEnrollmentId,
  getCurrentBSAcademicYear
} from './permanentIdentityEngine';
import { normalizeClass } from './teacherAssignmentEngine';

export type PromotionOutcome =
  | 'PROMOTED'
  | 'RETAINED'
  | 'TRANSFERRED'
  | 'GRADUATED'
  | 'INACTIVE';

export interface AcademicEnrollment {
  id: string; // Document ID (ENR-2083-000001)
  enrollmentId: string; // Immutable unique identifier
  studentUid: string; // Permanent User UID
  studentId: string; // Permanent Student ID (STU-XXXXXX)
  permanentStudentId?: string;
  emisNumber?: string;
  studentName: string;
  academicYear: string; // e.g. "2083-2084 B.S." or "2083"
  bsYear: number; // e.g. 2083
  class: string; // e.g. "6"
  section: string; // e.g. "A"
  roll: string; // e.g. "7"
  rollNumber: string; // e.g. "7"
  status: 'active' | 'promoted' | 'retained' | 'transferred' | 'graduated' | 'inactive';
  promotionOutcome?: PromotionOutcome;
  sourceEnrollmentId?: string;
  sourceAcademicYear?: string;
  sourceClass?: string;
  sourceSection?: string;
  sourceRoll?: string;
  remarks?: string;
  enrolledAt?: any;
  createdAt: string;
  createdBy: string;
  createdByName?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface PromotionCandidate {
  studentUid: string;
  studentId: string;
  permanentStudentId?: string;
  emisNumber?: string;
  studentName: string;
  gender?: string;
  currentClass: string;
  currentSection: string;
  currentRoll: string;
  currentStatus: string;
  sourceAcademicYear: string;
  sourceEnrollmentId?: string;
  targetAcademicYear: string;
  targetClass: string;
  targetSection: string;
  targetRoll: string;
  proposedOutcome: PromotionOutcome;
  alreadyEnrolledInTargetYear: boolean;
  existingTargetEnrollment?: AcademicEnrollment;
  hasRollConflict?: boolean;
  rollConflictMessage?: string;
}

export interface PromotionBatchResult {
  totalSelected: number;
  promotedCount: number;
  retainedCount: number;
  transferredCount: number;
  graduatedCount: number;
  skippedCount: number;
  failedCount: number;
  errors: { studentUid: string; studentName: string; error: string }[];
  details: {
    studentUid: string;
    studentName: string;
    outcome: PromotionOutcome;
    enrollmentId?: string;
    status: 'SUCCESS' | 'SKIPPED' | 'FAILED';
    message: string;
  }[];
}

export const CANONICAL_CLASS_ORDER = [
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

/**
 * Returns available Bikram Sambat (B.S.) academic years for selection
 */
export function getAvailableAcademicYears(): { id: string; name: string; bsYear: number; isCurrent: boolean }[] {
  const currentBs = getBSYearMonthDate().year;
  const years = [];
  for (let yr = currentBs - 3; yr <= currentBs + 2; yr++) {
    years.push({
      id: `${yr}-${yr + 1} B.S.`,
      name: `${yr}-${yr + 1} B.S. (${yr})`,
      bsYear: yr,
      isCurrent: yr === currentBs
    });
  }
  return years;
}

/**
 * Derives next class in the academic progression
 */
export function getNextAcademicClass(currentClass: string): { nextClass: string; isGraduated: boolean } {
  const norm = normalizeClass(currentClass).toLowerCase();
  const idx = CANONICAL_CLASS_ORDER.findIndex(c => c.toLowerCase() === norm);
  
  if (idx === -1) {
    return { nextClass: currentClass, isGraduated: false };
  }
  if (idx === CANONICAL_CLASS_ORDER.length - 1) {
    return { nextClass: 'Graduated / Alumni', isGraduated: true };
  }
  return { nextClass: CANONICAL_CLASS_ORDER[idx + 1], isGraduated: false };
}

/**
 * Fetches all academic enrollments for a specific student across all years
 */
export async function getStudentAcademicEnrollments(
  studentUidOrId: string
): Promise<AcademicEnrollment[]> {
  const cleanId = (studentUidOrId || '').trim();
  if (!cleanId) return [];

  const list: AcademicEnrollment[] = [];
  const seenIds = new Set<string>();

  try {
    // 1. Query by studentUid
    const qUid = query(
      collection(db, 'student_enrollments'),
      where('studentUid', '==', cleanId)
    );
    const snapUid = await getDocs(qUid);
    snapUid.forEach(d => {
      if (!seenIds.has(d.id)) {
        seenIds.add(d.id);
        list.push({ id: d.id, ...d.data() } as AcademicEnrollment);
      }
    });

    // 2. Query by studentId
    const qSid = query(
      collection(db, 'student_enrollments'),
      where('studentId', '==', cleanId)
    );
    const snapSid = await getDocs(qSid);
    snapSid.forEach(d => {
      if (!seenIds.has(d.id)) {
        seenIds.add(d.id);
        list.push({ id: d.id, ...d.data() } as AcademicEnrollment);
      }
    });

    // Sort descending by bsYear
    list.sort((a, b) => (b.bsYear || 0) - (a.bsYear || 0));
  } catch (err) {
    console.error('Failed to fetch student enrollments:', err);
  }

  return list;
}

/**
 * Loads eligible promotion candidate students for a given source academic context
 */
export async function getPromotionCandidates(
  sourceAcademicYear: string,
  sourceClass: string,
  targetAcademicYear: string,
  targetClass?: string,
  sourceSection?: string
): Promise<PromotionCandidate[]> {
  const normSourceClass = normalizeClass(sourceClass);
  const sourceBsYear = getCurrentBSAcademicYear(sourceAcademicYear);
  const targetBsYear = getCurrentBSAcademicYear(targetAcademicYear);

  // 1. Fetch active students from users collection
  const qUsers = query(
    collection(db, 'users'),
    where('role', '==', 'student')
  );
  const usersSnap = await getDocs(qUsers);
  const candidateUsers: any[] = [];

  usersSnap.forEach(d => {
    const u = d.data();
    if (u.status === 'DELETED' || u.deleted === true) return;
    
    const uClass = normalizeClass(u.class || '');
    if (uClass.toLowerCase() === normSourceClass.toLowerCase()) {
      if (!sourceSection || sourceSection === 'All' || (u.section || 'A').toLowerCase() === sourceSection.toLowerCase()) {
        candidateUsers.push({ id: d.id, ...u });
      }
    }
  });

  // 2. Fetch existing enrollments for target academic year to identify already-promoted students
  const qTargetEnr = query(
    collection(db, 'student_enrollments'),
    where('bsYear', '==', targetBsYear)
  );
  const targetEnrSnap = await getDocs(qTargetEnr);
  const targetEnrByUid: Record<string, AcademicEnrollment> = {};
  const targetAssignedRolls: Record<string, string[]> = {}; // key: "class_section" -> array of rolls

  targetEnrSnap.forEach(d => {
    const enr = { id: d.id, ...d.data() } as AcademicEnrollment;
    if (enr.studentUid) {
      targetEnrByUid[enr.studentUid] = enr;
    }
    const groupKey = `${normalizeClass(enr.class)}_${(enr.section || 'A').toUpperCase()}`;
    if (!targetAssignedRolls[groupKey]) targetAssignedRolls[groupKey] = [];
    if (enr.rollNumber || enr.roll) {
      targetAssignedRolls[groupKey].push(String(enr.rollNumber || enr.roll).trim());
    }
  });

  // 3. Assemble promotion candidate objects
  const defaultTargetNext = targetClass || getNextAcademicClass(sourceClass).nextClass;
  const isGraduating = defaultTargetNext.toLowerCase().includes('graduated');

  const candidates: PromotionCandidate[] = candidateUsers.map(u => {
    const existingTarget = targetEnrByUid[u.id];
    const alreadyEnrolled = Boolean(existingTarget);
    const assignedRoll = u.rollNumber || u.rollNo || '';
    
    return {
      studentUid: u.id,
      studentId: u.permanentStudentId || u.studentId || `STU-${u.id.substring(0, 6)}`,
      permanentStudentId: u.permanentStudentId || u.studentId,
      emisNumber: u.emisNumber || u.studentEmis || '',
      studentName: u.fullName || u.name || 'Unnamed Student',
      gender: u.gender || '',
      currentClass: u.class || sourceClass,
      currentSection: u.section || 'A',
      currentRoll: assignedRoll,
      currentStatus: u.academicStatus || u.status || 'active',
      sourceAcademicYear: sourceAcademicYear,
      targetAcademicYear: targetAcademicYear,
      targetClass: alreadyEnrolled ? existingTarget.class : (isGraduating ? 'Graduated' : defaultTargetNext),
      targetSection: alreadyEnrolled ? existingTarget.section : (u.section || 'A'),
      targetRoll: alreadyEnrolled ? (existingTarget.rollNumber || existingTarget.roll) : assignedRoll,
      proposedOutcome: alreadyEnrolled 
        ? (existingTarget.promotionOutcome || 'PROMOTED')
        : (isGraduating ? 'GRADUATED' : 'PROMOTED'),
      alreadyEnrolledInTargetYear: alreadyEnrolled,
      existingTargetEnrollment: existingTarget
    };
  });

  // Sort candidates by current roll number numerically
  candidates.sort((a, b) => {
    const numA = parseInt(a.currentRoll, 10) || 999;
    const numB = parseInt(b.currentRoll, 10) || 999;
    return numA - numB;
  });

  return candidates;
}

/**
 * Checks for roll number conflicts in the target class and section
 */
export function validateTargetRollAssignments(
  candidates: PromotionCandidate[]
): { valid: boolean; conflicts: { studentUid: string; studentName: string; roll: string; reason: string }[] } {
  const conflicts: { studentUid: string; studentName: string; roll: string; reason: string }[] = [];
  const assignedInBatch: Record<string, { studentUid: string; studentName: string }> = {};

  candidates.forEach(c => {
    if (c.proposedOutcome === 'TRANSFERRED' || c.proposedOutcome === 'GRADUATED' || c.proposedOutcome === 'INACTIVE') {
      return; // Non-active outcomes don't conflict on class roll
    }

    const cleanRoll = (c.targetRoll || '').trim();
    if (!cleanRoll) return;

    const groupKey = `${normalizeClass(c.targetClass)}_${(c.targetSection || 'A').toUpperCase()}_${cleanRoll}`;
    
    if (assignedInBatch[groupKey]) {
      const prior = assignedInBatch[groupKey];
      conflicts.push({
        studentUid: c.studentUid,
        studentName: c.studentName,
        roll: cleanRoll,
        reason: `Duplicate Roll No. "${cleanRoll}" in Class ${c.targetClass} (Sec ${c.targetSection}) assigned to both "${prior.studentName}" and "${c.studentName}".`
      });
    } else {
      assignedInBatch[groupKey] = { studentUid: c.studentUid, studentName: c.studentName };
    }
  });

  return {
    valid: conflicts.length === 0,
    conflicts
  };
}

/**
 * Executes an individual student promotion or status transition inside an atomic transaction
 */
export async function executeSingleStudentPromotion(
  candidate: PromotionCandidate,
  actorUid: string,
  actorRole: string,
  actorName: string = 'Administrator'
): Promise<{ success: boolean; enrollmentId?: string; message: string }> {
  if (!candidate.studentUid) {
    throw new Error('Missing studentUid for promotion.');
  }

  const targetBsYear = getCurrentBSAcademicYear(candidate.targetAcademicYear);
  const now = new Date().toISOString();
  const userRef = doc(db, 'users', candidate.studentUid);

  return await runTransaction(db, async (tx) => {
    const userDoc = await tx.get(userRef);
    if (!userDoc.exists()) {
      throw new Error(`Student record ${candidate.studentUid} not found.`);
    }

    const userData = userDoc.data();
    if (userData.status === 'DELETED' || userData.deleted === true) {
      throw new Error(`Cannot promote deleted student account ${candidate.studentUid}.`);
    }

    const permanentStudentId = userData.permanentStudentId || userData.studentId || candidate.studentId;
    const emisNumber = userData.emisNumber || userData.studentEmis || candidate.emisNumber || '';
    const studentName = userData.fullName || userData.name || candidate.studentName;

    // Verify if an enrollment for this student in targetBsYear already exists
    const enrId = `ENR-${targetBsYear}-${candidate.studentUid.substring(0, 8).toUpperCase()}`;
    const targetEnrRef = doc(db, 'student_enrollments', enrId);
    const existingEnrDoc = await tx.get(targetEnrRef);

    let enrollmentId = enrId;
    let isUpdate = existingEnrDoc.exists();

    if (!isUpdate) {
      // Create new sequence-based enrollment ID
      enrollmentId = await generateNextEnrollmentId(targetBsYear);
    }

    const finalEnrRef = doc(db, 'student_enrollments', enrollmentId);

    // Build target enrollment data based on outcome
    let enrStatus: AcademicEnrollment['status'] = 'active';
    let targetClass = candidate.targetClass;
    let targetSection = candidate.targetSection || 'A';
    let targetRoll = candidate.targetRoll || '';

    if (candidate.proposedOutcome === 'RETAINED') {
      enrStatus = 'retained';
      targetClass = candidate.currentClass;
    } else if (candidate.proposedOutcome === 'TRANSFERRED') {
      enrStatus = 'transferred';
    } else if (candidate.proposedOutcome === 'GRADUATED') {
      enrStatus = 'graduated';
      targetClass = 'Graduated';
    } else if (candidate.proposedOutcome === 'INACTIVE') {
      enrStatus = 'inactive';
    } else {
      enrStatus = 'promoted';
    }

    const enrollmentRecord: AcademicEnrollment = {
      id: enrollmentId,
      enrollmentId,
      studentUid: candidate.studentUid,
      studentId: permanentStudentId,
      permanentStudentId,
      emisNumber,
      studentName,
      academicYear: candidate.targetAcademicYear,
      bsYear: targetBsYear,
      class: targetClass,
      section: targetSection,
      roll: targetRoll,
      rollNumber: targetRoll,
      status: enrStatus,
      promotionOutcome: candidate.proposedOutcome,
      sourceAcademicYear: candidate.sourceAcademicYear,
      sourceClass: candidate.currentClass,
      sourceSection: candidate.currentSection,
      sourceRoll: candidate.currentRoll,
      createdAt: isUpdate && existingEnrDoc.exists() ? existingEnrDoc.data()?.createdAt || now : now,
      createdBy: isUpdate && existingEnrDoc.exists() ? existingEnrDoc.data()?.createdBy || actorUid : actorUid,
      createdByName: actorName,
      updatedAt: now,
      updatedBy: actorUid
    };

    tx.set(finalEnrRef, {
      ...enrollmentRecord,
      enrolledAt: serverTimestamp()
    }, { merge: true });

    // Update user profile current academic context without mutating historical identity
    const userUpdates: any = {
      classAssignedYear: candidate.targetAcademicYear,
      updatedAt: now,
      updatedBy: actorUid
    };

    if (candidate.proposedOutcome === 'PROMOTED' || candidate.proposedOutcome === 'RETAINED') {
      userUpdates.class = targetClass;
      userUpdates.section = targetSection;
      userUpdates.rollNumber = targetRoll;
      userUpdates.rollNo = targetRoll;
      userUpdates.academicStatus = 'ACTIVE';
    } else if (candidate.proposedOutcome === 'TRANSFERRED') {
      userUpdates.academicStatus = 'TRANSFERRED';
    } else if (candidate.proposedOutcome === 'GRADUATED') {
      userUpdates.class = 'Graduated';
      userUpdates.academicStatus = 'GRADUATED';
    } else if (candidate.proposedOutcome === 'INACTIVE') {
      userUpdates.academicStatus = 'INACTIVE';
    }

    tx.update(userRef, userUpdates);

    return {
      success: true,
      enrollmentId,
      message: `Successfully processed ${studentName} -> ${candidate.proposedOutcome} (${targetClass} Sec ${targetSection} Roll ${targetRoll || '-'})`
    };
  });
}

/**
 * Executes bulk academic promotion for an array of candidate students with atomic safeguards and audit logging
 */
export async function executePromotionBatch(
  candidates: PromotionCandidate[],
  sourceAcademicYear: string,
  targetAcademicYear: string,
  actorUid: string,
  actorRole: string,
  actorName: string = 'Administrator'
): Promise<PromotionBatchResult> {
  const result: PromotionBatchResult = {
    totalSelected: candidates.length,
    promotedCount: 0,
    retainedCount: 0,
    transferredCount: 0,
    graduatedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    errors: [],
    details: []
  };

  // 1. Validate Roll Conflicts
  const rollValidation = validateTargetRollAssignments(candidates);
  if (!rollValidation.valid) {
    const firstConflict = rollValidation.conflicts[0];
    throw new Error(`Roll Assignment Conflict: ${firstConflict.reason}`);
  }

  // 2. Audit preparation initiation
  try {
    await recordAuditLog({
      category: 'academic',
      actionType: 'PROMOTION_PREPARED',
      targetType: 'academic_promotion_batch',
      targetId: `${sourceAcademicYear}_TO_${targetAcademicYear}`,
      studentClass: candidates[0]?.currentClass || 'All',
      previousValue: `Source Year: ${sourceAcademicYear}`,
      newValue: `Target Year: ${targetAcademicYear}, Candidates: ${candidates.length}`,
      reason: `Admin initiated promotion preparation for ${candidates.length} students from ${sourceAcademicYear} to ${targetAcademicYear}`,
      result: 'SUCCESS'
    });
  } catch (e) {
    console.warn('Audit log failed for PROMOTION_PREPARED:', e);
  }

  // 3. Process each candidate with error isolation
  for (const candidate of candidates) {
    try {
      const outcomeRes = await executeSingleStudentPromotion(
        candidate,
        actorUid,
        actorRole,
        actorName
      );

      if (candidate.proposedOutcome === 'PROMOTED') result.promotedCount++;
      else if (candidate.proposedOutcome === 'RETAINED') result.retainedCount++;
      else if (candidate.proposedOutcome === 'TRANSFERRED') result.transferredCount++;
      else if (candidate.proposedOutcome === 'GRADUATED') result.graduatedCount++;
      else result.skippedCount++;

      result.details.push({
        studentUid: candidate.studentUid,
        studentName: candidate.studentName,
        outcome: candidate.proposedOutcome,
        enrollmentId: outcomeRes.enrollmentId,
        status: 'SUCCESS',
        message: outcomeRes.message
      });

      // Individual Audit Record
      try {
        const actionTypeMap: Record<PromotionOutcome, string> = {
          PROMOTED: 'STUDENT_PROMOTED',
          RETAINED: 'STUDENT_RETAINED',
          TRANSFERRED: 'STUDENT_TRANSFERRED',
          GRADUATED: 'STUDENT_GRADUATED',
          INACTIVE: 'STUDENT_MARKED_INACTIVE'
        };

        await recordAuditLog({
          category: 'academic',
          actionType: actionTypeMap[candidate.proposedOutcome] || 'STUDENT_PROMOTED',
          targetType: 'student_enrollment',
          targetId: outcomeRes.enrollmentId || candidate.studentUid,
          studentId: candidate.studentId,
          studentUid: candidate.studentUid,
          studentName: candidate.studentName,
          studentClass: candidate.targetClass,
          academicYear: candidate.targetAcademicYear,
          enrollmentId: outcomeRes.enrollmentId,
          previousValue: `${candidate.sourceAcademicYear}: Class ${candidate.currentClass} (${candidate.currentSection}) Roll ${candidate.currentRoll}`,
          newValue: `${candidate.targetAcademicYear}: ${candidate.proposedOutcome} -> Class ${candidate.targetClass} (${candidate.targetSection}) Roll ${candidate.targetRoll}`,
          reason: `Admin confirmed ${candidate.proposedOutcome} for ${candidate.studentName}`,
          result: 'SUCCESS'
        });
      } catch (auditErr) {
        console.warn('Audit record failed for individual promotion:', auditErr);
      }
    } catch (err: any) {
      console.error(`Failed to promote student ${candidate.studentName} (${candidate.studentUid}):`, err);
      result.failedCount++;
      result.errors.push({
        studentUid: candidate.studentUid,
        studentName: candidate.studentName,
        error: err.message || 'Unknown promotion error'
      });
      result.details.push({
        studentUid: candidate.studentUid,
        studentName: candidate.studentName,
        outcome: candidate.proposedOutcome,
        status: 'FAILED',
        message: err.message || 'Failed'
      });
    }
  }

  return result;
}
