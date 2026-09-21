import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export interface StudentProfileMinimal {
  id?: string;
  fullName?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  class?: string;
  studentClass?: string;
  studentId?: string;
  rollNumber?: string | number;
  rollNo?: string | number;
  role?: string;
  status?: string;
}

/**
 * Normalizes class name for reliable comparison.
 * e.g., 'Class 10' -> '10', 'Play Group' -> 'playgroup', 'L.K.G.' -> 'lkg', '5' -> '5'
 */
export function normalizeClassName(rawClass?: string): string {
  if (!rawClass) return '';
  let cleaned = String(rawClass).trim().toLowerCase();
  
  // Remove 'class ' prefix if present
  if (cleaned.startsWith('class ')) {
    cleaned = cleaned.substring(6).trim();
  }
  
  // Clean punctuation and excess spacing for word-based classes
  cleaned = cleaned.replace(/[\.\-_]/g, '').replace(/\s+/g, '');
  
  // Common alias normalization
  if (cleaned === 'playgroup' || cleaned === 'pg') return 'playgroup';
  if (cleaned === 'nursery' || cleaned === 'nur') return 'nursery';
  if (cleaned === 'lkg' || cleaned === 'lowerkg') return 'lkg';
  if (cleaned === 'ukg' || cleaned === 'upperkg') return 'ukg';
  
  return cleaned;
}

/**
 * Extracts and normalizes the roll number from a student's data or studentId.
 * e.g. SA524 in Class 5 -> '24'
 * e.g. SA501 in Class 5 -> '1'
 * e.g. SA1005 in Class 10 -> '5'
 * e.g. '05' -> '5'
 */
export function extractStudentRoll(studentId?: string, className?: string, explicitRoll?: string | number): string {
  // If explicit roll is provided and non-empty
  if (explicitRoll !== undefined && explicitRoll !== null && String(explicitRoll).trim() !== '') {
    const rollStr = String(explicitRoll).trim();
    // Normalize leading zeros if purely numeric (e.g. '05' -> '5')
    if (/^\d+$/.test(rollStr)) {
      return parseInt(rollStr, 10).toString();
    }
    return rollStr;
  }

  const sId = (studentId || '').trim();
  if (!sId) return '';

  const clsClean = (className || '').trim();
  const clsNum = clsClean.replace(/\D/g, '');

  // Case 1: Standard SA[Class][Roll] format, e.g. SA524, SA0524, SA1005
  const match = sId.match(/^SA_?([A-Z0-9]+)$/i);
  if (match) {
    const afterSA = match[1];
    
    // Numeric class matching (e.g., Class 5, Class 10)
    if (clsNum) {
      if (afterSA.startsWith('0' + clsNum)) {
        const remaining = afterSA.substring(clsNum.length + 1);
        if (/^\d+$/.test(remaining)) return parseInt(remaining, 10).toString();
        if (remaining) return remaining;
      }
      if (afterSA.startsWith(clsNum)) {
        const remaining = afterSA.substring(clsNum.length);
        if (/^\d+$/.test(remaining)) return parseInt(remaining, 10).toString();
        if (remaining) return remaining;
      }
    }
    
    // Non-numeric class matching (e.g., Nursery, LKG, UKG)
    const normClass = normalizeClassName(clsClean).toUpperCase();
    if (normClass && afterSA.toUpperCase().startsWith(normClass)) {
      const remaining = afterSA.substring(normClass.length).replace(/^[-_]/, '');
      if (/^\d+$/.test(remaining)) return parseInt(remaining, 10).toString();
      if (remaining) return remaining;
    }
    
    // If it ends in digits, extract the trailing digits
    const digitsMatch = afterSA.match(/(\d+)$/);
    if (digitsMatch) {
      return parseInt(digitsMatch[1], 10).toString();
    }
  }

  // If studentId itself is numeric (e.g. '24' or '05')
  if (/^\d+$/.test(sId)) {
    return parseInt(sId, 10).toString();
  }

  return sId;
}

export interface DuplicateRollCheckResult {
  isDuplicate: boolean;
  conflictingStudent?: StudentProfileMinimal;
  extractedRoll: string;
  normalizedClass: string;
  message?: string;
}

/**
 * Checks if a target student roll or student ID already exists in the given class among the provided list of students.
 * Different classes CAN have the same roll number. Only the SAME class triggers duplicate rejection.
 */
export function checkDuplicateStudentRoll(
  studentsList: StudentProfileMinimal[],
  targetClass: string,
  targetRollOrStudentId: string,
  excludeUserId?: string
): DuplicateRollCheckResult {
  const normTargetClass = normalizeClassName(targetClass);
  const targetRoll = extractStudentRoll(targetRollOrStudentId, targetClass, targetRollOrStudentId);
  const cleanTargetId = (targetRollOrStudentId || '').trim().toUpperCase();

  if (!normTargetClass || !targetRoll) {
    return {
      isDuplicate: false,
      extractedRoll: targetRoll,
      normalizedClass: normTargetClass
    };
  }

  // Find if any other student in the SAME class has the same roll number or same studentId
  const conflict = studentsList.find(s => {
    // Exclude the student currently being updated
    if (excludeUserId && s.id === excludeUserId) return false;
    
    // Must be student role (or undefined role in student list)
    if (s.role && s.role !== 'student') return false;

    // Check class match
    const studentCls = s.class || s.studentClass || '';
    const normStudentCls = normalizeClassName(studentCls);
    if (!normStudentCls || normStudentCls !== normTargetClass) {
      // DIFFERENT CLASS -> completely allowed!
      return false;
    }

    // Check roll match in the SAME class
    const sRoll = extractStudentRoll(s.studentId, studentCls, s.rollNumber || s.rollNo);
    if (sRoll && sRoll.toLowerCase() === targetRoll.toLowerCase()) {
      return true;
    }

    // Also check exact studentId match if present
    const sId = (s.studentId || '').trim().toUpperCase();
    if (cleanTargetId.startsWith('SA') && sId && sId === cleanTargetId) {
      return true;
    }

    return false;
  });

  if (conflict) {
    const studentName = conflict.fullName || conflict.name || (conflict.firstName && conflict.lastName ? `${conflict.firstName} ${conflict.lastName}` : 'Existing Student');
    const existingId = conflict.studentId || 'N/A';
    return {
      isDuplicate: true,
      conflictingStudent: conflict,
      extractedRoll: targetRoll,
      normalizedClass: normTargetClass,
      message: `Roll Number already exists! Roll No. ${targetRoll} is already registered in Class ${targetClass} (Assigned to: ${studentName} [${existingId}]). Duplicate roll numbers in the same class are not permitted.`
    };
  }

  return {
    isDuplicate: false,
    extractedRoll: targetRoll,
    normalizedClass: normTargetClass
  };
}

/**
 * Checks Firestore directly for duplicate roll in the same class.
 */
export async function checkDuplicateStudentRollInFirestore(
  targetClass: string,
  targetRollOrStudentId: string,
  excludeUserId?: string
): Promise<DuplicateRollCheckResult> {
  const normTargetClass = normalizeClassName(targetClass);
  const targetRoll = extractStudentRoll(targetRollOrStudentId, targetClass, targetRollOrStudentId);

  if (!normTargetClass || !targetRoll) {
    return {
      isDuplicate: false,
      extractedRoll: targetRoll,
      normalizedClass: normTargetClass
    };
  }

  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('role', '==', 'student'));
    const snap = await getDocs(q);
    
    const students: StudentProfileMinimal[] = [];
    snap.forEach(docSnap => {
      students.push({ id: docSnap.id, ...docSnap.data() } as StudentProfileMinimal);
    });

    return checkDuplicateStudentRoll(students, targetClass, targetRollOrStudentId, excludeUserId);
  } catch (err) {
    console.error('Error querying Firestore for duplicate roll validation:', err);
    // Fallback if network or permissions fail: non-blocking
    return {
      isDuplicate: false,
      extractedRoll: targetRoll,
      normalizedClass: normTargetClass
    };
  }
}
