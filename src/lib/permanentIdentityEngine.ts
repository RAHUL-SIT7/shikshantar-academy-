import { db } from '../firebase';
import { 
  doc, 
  runTransaction, 
  getDocs, 
  collection, 
  query, 
  where,
  setDoc,
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { getBSYearMonthDate } from './nepaliDate';

export type IdentityNamespace = 'STU' | 'TCH' | 'ADM' | 'ENR';

/**
 * Normalizes an academic year identifier or extracts the 4-digit BS year.
 * Examples: '2083-2084 B.S.' -> 2083, '2084' -> 2084, undefined -> current BS year.
 */
export function getCurrentBSAcademicYear(academicYearInput?: string): number {
  if (academicYearInput) {
    const match = String(academicYearInput).match(/\b(20[4-9][0-9])\b/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return getBSYearMonthDate().year;
}

/**
 * Scans existing user collections to discover the highest existing sequence counter for seeding.
 */
async function scanHighestExistingIdentitySeq(prefix: 'STU' | 'TCH' | 'ADM'): Promise<number> {
  let maxSeq = 0;
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const regex = new RegExp(`^${prefix}[-_]?0*(\\d+)$`, 'i');
    usersSnap.forEach(d => {
      const u = d.data();
      const idToCheck = prefix === 'STU' 
        ? (u.studentId || u.permanentStudentId || '') 
        : prefix === 'TCH' 
        ? (u.teacherId || u.staffId || '') 
        : (u.adminId || u.staffId || '');
      
      const m = String(idToCheck).trim().match(regex);
      if (m && m[1]) {
        const num = parseInt(m[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    });
  } catch (err) {
    console.warn(`Could not scan existing sequences for ${prefix}:`, err);
  }
  return maxSeq;
}

/**
 * Scans existing enrollment collection to discover the highest existing enrollment sequence for a BS year.
 */
async function scanHighestExistingEnrollmentSeq(bsYear: number): Promise<number> {
  let maxSeq = 0;
  try {
    const enrSnap = await getDocs(collection(db, 'student_enrollments'));
    const regex = new RegExp(`^ENR[-_]?${bsYear}[-_]?0*(\\d+)$`, 'i');
    enrSnap.forEach(d => {
      const e = d.data();
      const idToCheck = e.enrollmentId || d.id || '';
      const m = String(idToCheck).trim().match(regex);
      if (m && m[1]) {
        const num = parseInt(m[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    });
  } catch (err) {
    console.warn(`Could not scan existing enrollments for ${bsYear}:`, err);
  }
  return maxSeq;
}

/**
 * Concurrency-safe atomic generator for Permanent Student ID.
 * Format: STU-000001, STU-000002, STU-000003...
 */
export async function generateNextStudentId(): Promise<string> {
  const seqRef = doc(db, 'document_sequences', 'SEQ_STUDENT');
  
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(seqRef);
    let nextSeq = 1;
    
    if (snap.exists()) {
      const data = snap.data();
      nextSeq = Number(data.lastIssuedSequence || 0) + 1;
    } else {
      const highest = await scanHighestExistingIdentitySeq('STU');
      nextSeq = highest + 1;
    }

    const formattedId = `STU-${String(nextSeq).padStart(6, '0')}`;
    
    tx.set(seqRef, {
      prefix: 'STU',
      lastIssuedSequence: nextSeq,
      lastIssuedId: formattedId,
      updatedAt: serverTimestamp()
    }, { merge: true });

    return formattedId;
  });
}

/**
 * Concurrency-safe atomic generator for Permanent Teacher ID.
 * Format: TCH-000001, TCH-000002, TCH-000003...
 */
export async function generateNextTeacherId(): Promise<string> {
  const seqRef = doc(db, 'document_sequences', 'SEQ_TEACHER');
  
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(seqRef);
    let nextSeq = 1;
    
    if (snap.exists()) {
      const data = snap.data();
      nextSeq = Number(data.lastIssuedSequence || 0) + 1;
    } else {
      const highest = await scanHighestExistingIdentitySeq('TCH');
      nextSeq = highest + 1;
    }

    const formattedId = `TCH-${String(nextSeq).padStart(6, '0')}`;
    
    tx.set(seqRef, {
      prefix: 'TCH',
      lastIssuedSequence: nextSeq,
      lastIssuedId: formattedId,
      updatedAt: serverTimestamp()
    }, { merge: true });

    return formattedId;
  });
}

/**
 * Concurrency-safe atomic generator for Permanent Admin ID.
 * Format: ADM-000001, ADM-000002, ADM-000003...
 */
export async function generateNextAdminId(): Promise<string> {
  const seqRef = doc(db, 'document_sequences', 'SEQ_ADMIN');
  
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(seqRef);
    let nextSeq = 1;
    
    if (snap.exists()) {
      const data = snap.data();
      nextSeq = Number(data.lastIssuedSequence || 0) + 1;
    } else {
      const highest = await scanHighestExistingIdentitySeq('ADM');
      nextSeq = highest + 1;
    }

    const formattedId = `ADM-${String(nextSeq).padStart(6, '0')}`;
    
    tx.set(seqRef, {
      prefix: 'ADM',
      lastIssuedSequence: nextSeq,
      lastIssuedId: formattedId,
      updatedAt: serverTimestamp()
    }, { merge: true });

    return formattedId;
  });
}

/**
 * Concurrency-safe atomic generator for Academic Enrollment ID.
 * Format: ENR-2083-000001, ENR-2084-000001...
 */
export async function generateNextEnrollmentId(bsYear?: number): Promise<string> {
  const year = bsYear || getCurrentBSAcademicYear();
  const seqRef = doc(db, 'document_sequences', `SEQ_ENR_${year}`);
  
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(seqRef);
    let nextSeq = 1;
    
    if (snap.exists()) {
      const data = snap.data();
      nextSeq = Number(data.lastIssuedSequence || 0) + 1;
    } else {
      const highest = await scanHighestExistingEnrollmentSeq(year);
      nextSeq = highest + 1;
    }

    const formattedId = `ENR-${year}-${String(nextSeq).padStart(6, '0')}`;
    
    tx.set(seqRef, {
      prefix: 'ENR',
      bsYear: year,
      lastIssuedSequence: nextSeq,
      lastIssuedId: formattedId,
      updatedAt: serverTimestamp()
    }, { merge: true });

    return formattedId;
  });
}

/**
 * Verifies that the EMIS number is unique across all student records in the system.
 * Throws an explicit error if a duplicate is found.
 */
export async function assertEmisIsUnique(emisInput: string, currentUid?: string): Promise<void> {
  const cleanEmis = emisInput.trim();
  if (!cleanEmis) {
    throw new Error('EMIS Number is mandatory for new student registration.');
  }

  // Check in users collection for matching emisNumber or studentEmis
  const q1 = query(collection(db, 'users'), where('emisNumber', '==', cleanEmis));
  const snap1 = await getDocs(q1);
  
  for (const docSnap of snap1.docs) {
    if (docSnap.id !== currentUid) {
      const data = docSnap.data();
      if (data.status !== 'DELETED' && data.deleted !== true) {
        throw new Error(`EMIS Number '${cleanEmis}' is already registered to student ${data.fullName || data.name || 'Student'} (${data.studentId || docSnap.id}). Duplicate EMIS numbers are strictly prohibited.`);
      }
    }
  }

  const q2 = query(collection(db, 'users'), where('studentEmis', '==', cleanEmis));
  const snap2 = await getDocs(q2);
  for (const docSnap of snap2.docs) {
    if (docSnap.id !== currentUid) {
      const data = docSnap.data();
      if (data.status !== 'DELETED' && data.deleted !== true) {
        throw new Error(`EMIS Number '${cleanEmis}' is already registered to student ${data.fullName || data.name || 'Student'} (${data.studentId || docSnap.id}). Duplicate EMIS numbers are strictly prohibited.`);
      }
    }
  }
}

export interface AcademicEnrollmentData {
  studentUid: string;
  studentId: string;
  emisNumber?: string;
  bsYear?: number;
  className: string;
  sectionName?: string;
  rollNumber?: string;
  status?: 'active' | 'promoted' | 'held' | 'transferred' | 'graduated';
}

/**
 * Creates an immutable academic enrollment record for a student for a specific academic year.
 */
export async function recordStudentEnrollment(data: AcademicEnrollmentData): Promise<string> {
  const bsYear = data.bsYear || getCurrentBSAcademicYear();
  const enrollmentId = await generateNextEnrollmentId(bsYear);
  const enrollmentRef = doc(db, 'student_enrollments', enrollmentId);

  await setDoc(enrollmentRef, {
    id: enrollmentId,
    enrollmentId,
    studentUid: data.studentUid,
    studentId: data.studentId,
    emisNumber: data.emisNumber?.trim() || '',
    academicYear: `${bsYear}-${bsYear + 1} B.S.`,
    bsYear,
    class: data.className,
    section: data.sectionName || 'A',
    roll: data.rollNumber || '',
    rollNumber: data.rollNumber || '',
    status: data.status || 'active',
    enrolledAt: serverTimestamp(),
    createdAt: new Date().toISOString()
  });

  return enrollmentId;
}

/**
 * Safely backfills permanent unique IDs and initial academic enrollments for existing users
 * without overwriting any valid existing IDs or inventing EMIS values.
 * Idempotent and non-destructive.
 */
export async function ensurePermanentIdentitiesForExistingUsers(): Promise<{ migratedCount: number }> {
  let migratedCount = 0;
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    for (const docSnap of usersSnap.docs) {
      const u = docSnap.data();
      // Skip already deleted or tombstoned records
      if (u.status === 'DELETED' || u.deleted === true) continue;

      const userRef = doc(db, 'users', docSnap.id);
      const updates: any = {};

      if (u.role === 'student') {
        const hasValidPermanentId = u.permanentStudentId && /^STU-\d{6}$/i.test(u.permanentStudentId);
        if (!hasValidPermanentId) {
          if (u.studentId && /^STU-\d{6}$/i.test(u.studentId)) {
            updates.permanentStudentId = u.studentId.toUpperCase();
          } else {
            if (u.studentId && !u.legacyStudentId) {
              updates.legacyStudentId = u.studentId;
            }
            const newStuId = await generateNextStudentId();
            updates.permanentStudentId = newStuId;
            updates.studentId = newStuId;
          }
          migratedCount++;
        }

        // Initialize historical academic enrollment foundation if missing
        if (u.class) {
          const currentBsYear = getCurrentBSAcademicYear();
          const existingEnrQuery = query(
            collection(db, 'student_enrollments'),
            where('studentUid', '==', docSnap.id)
          );
          const enrSnap = await getDocs(existingEnrQuery);
          if (enrSnap.empty) {
            const sid = updates.permanentStudentId || u.permanentStudentId || u.studentId || docSnap.id;
            await recordStudentEnrollment({
              studentUid: docSnap.id,
              studentId: sid,
              emisNumber: u.emisNumber || u.studentEmis || '',
              bsYear: currentBsYear,
              className: u.class,
              sectionName: u.section || 'A',
              rollNumber: u.rollNumber || u.rollNo || '',
              status: 'active'
            });
          }
        }
      } else if (u.role === 'teacher') {
        const hasValidTeacherId = (u.teacherId && /^TCH-\d{6}$/i.test(u.teacherId)) || (u.permanentTeacherId && /^TCH-\d{6}$/i.test(u.permanentTeacherId));
        if (!hasValidTeacherId) {
          const newTchId = await generateNextTeacherId();
          updates.permanentTeacherId = newTchId;
          updates.teacherId = newTchId;
          updates.staffId = newTchId;
          migratedCount++;
        }
      } else if (u.role === 'admin') {
        const hasValidAdminId = (u.adminId && /^ADM-\d{6}$/i.test(u.adminId)) || (u.permanentAdminId && /^ADM-\d{6}$/i.test(u.permanentAdminId));
        if (!hasValidAdminId) {
          const newAdmId = await generateNextAdminId();
          updates.permanentAdminId = newAdmId;
          updates.adminId = newAdmId;
          updates.staffId = newAdmId;
          migratedCount++;
        }
      }

      if (Object.keys(updates).length > 0) {
        await setDoc(userRef, updates, { merge: true });
      }
    }
  } catch (err) {
    console.error("ensurePermanentIdentitiesForExistingUsers error:", err);
  }
  return { migratedCount };
}

export interface ResultMigrationReport {
  scanned: number;
  migrated: number;
  unverified: number;
  unverifiedDetails: Array<{ docId: string; examId: string; studentId: string; rollNo?: string; class?: string }>;
}

/**
 * Safely resolves and updates historical result documents with permanent Student ID and stable studentUid.
 * Strictly non-destructive: preserves marks, grades, GPA, academicYear, and records rollNumberSnapshot.
 * Never guesses: leaves ambiguous records intact and reports them for manual mapping.
 */
export async function ensureResultPermanentIdentities(): Promise<ResultMigrationReport> {
  const report: ResultMigrationReport = {
    scanned: 0,
    migrated: 0,
    unverified: 0,
    unverifiedDetails: []
  };

  try {
    const [summarySnap, usersSnap] = await Promise.all([
      getDocs(collection(db, 'resultSummary')),
      getDocs(collection(db, 'users'))
    ]);

    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
    const students = users.filter(u => u.role === 'student' && u.status !== 'DELETED' && u.deleted !== true);

    for (const docSnap of summarySnap.docs) {
      report.scanned++;
      const data = docSnap.data();
      
      // If already has both studentUid and permanentStudentId, it's already reconciled
      if (data.studentUid && data.permanentStudentId && data.studentId === data.permanentStudentId) {
        continue;
      }

      const rawId = String(data.studentId || '').trim();
      const rawRoll = String(data.rollNo || data.rollNumber || data.rollNumberSnapshot || '').trim();
      const rawClass = String(data.class || '').trim().toLowerCase();
      const rawName = String(data.studentName || '').trim().toLowerCase();

      // Find candidate matches unambiguously
      let matches = students.filter(s => s.id === rawId);
      if (matches.length === 0 && rawId) {
        matches = students.filter(s => 
          String(s.studentId || '').toLowerCase() === rawId.toLowerCase() ||
          String(s.permanentStudentId || '').toLowerCase() === rawId.toLowerCase() ||
          String(s.legacyStudentId || '').toLowerCase() === rawId.toLowerCase()
        );
      }
      if (matches.length === 0 && rawClass && rawRoll) {
        matches = students.filter(s => 
          String(s.class || '').trim().toLowerCase() === rawClass &&
          (String(s.rollNumber || '').trim() === rawRoll || String(s.rollNo || '').trim() === rawRoll)
        );
      }
      if (matches.length === 0 && rawClass && rawName) {
        matches = students.filter(s => 
          String(s.class || '').trim().toLowerCase() === rawClass &&
          String(s.fullName || s.name || '').trim().toLowerCase() === rawName
        );
      }

      if (matches.length === 1) {
        const student = matches[0];
        const studentUid = student.id;
        const permanentId = student.permanentStudentId || student.studentId || studentUid;
        const emis = student.emisNumber || student.studentEmis || '';
        const rollSnapshot = rawRoll || String(student.rollNumber || student.rollNo || '');

        const updates: any = {
          studentUid,
          studentId: permanentId,
          permanentStudentId: permanentId,
          rollNumberSnapshot: rollSnapshot,
          updatedAt: serverTimestamp()
        };
        if (emis) {
          updates.studentEmis = emis;
        }

        await updateDoc(doc(db, 'resultSummary', docSnap.id), updates);

        // Also update individual results matching this exam and previous studentId if permitted
        try {
          const resultsSnap = await getDocs(query(
            collection(db, 'results'),
            where('examId', '==', data.examId || ''),
            where('studentId', '==', rawId)
          ));
          for (const resDoc of resultsSnap.docs) {
            await updateDoc(doc(db, 'results', resDoc.id), {
              studentUid,
              studentId: permanentId,
              permanentStudentId: permanentId,
              studentEmis: emis,
              rollNumberSnapshot: rollSnapshot
            });
          }
        } catch (_) {}

        report.migrated++;
      } else {
        report.unverified++;
        report.unverifiedDetails.push({
          docId: docSnap.id,
          examId: data.examId || '',
          studentId: rawId,
          rollNo: rawRoll,
          class: data.class
        });
      }
    }
  } catch (err) {
    console.error("ensureResultPermanentIdentities error:", err);
  }

  return report;
}
