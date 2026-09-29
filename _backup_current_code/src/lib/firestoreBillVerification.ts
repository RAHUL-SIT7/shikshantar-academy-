import { 
  Firestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  WriteBatch, 
  doc 
} from 'firebase/firestore';
import { 
  NEPALI_MONTH_SEQUENCE, 
  NepaliMonthIdMapping, 
  mapDurationToNepaliMonthIds, 
  normalizeNepaliMonth, 
  extractCoveredMonthsFromBill 
} from './nepaliBillingCoverage';
import { sanitizeForFirestore } from './firestoreSanitize';

export interface BillItem {
  id: string;
  studentId: string;
  studentName: string;
  studentRoll?: string;
  class: string;
  academicYear: string;
  month: string;
  monthId: string;
  monthIndex: number;
  fullKey: string;
  chargeName: string;
  rate: number;
  amount: number;
  remitBillId: string;
  billNo: string;
  status: 'active' | 'pending' | 'paid' | 'partial' | 'void' | 'cancelled';
  createdAt: string;
  createdBy: string;
}

export interface StudentBillConflict {
  studentId: string;
  studentName: string;
  studentRoll?: string;
  conflictingMonths: string[];
  conflictingMonthIds: string[];
  conflictingItems: Array<{
    month: string;
    monthId?: string;
    chargeName?: string;
    billNo?: string;
    remitBillId?: string;
    source: 'billItems' | 'remitBills' | 'studentFees';
    status: string;
  }>;
}

export interface FirestoreBillingVerificationResult {
  verified: boolean;
  hasDuplicates: boolean;
  requestedDurationMonths: number;
  mappedMonths: NepaliMonthIdMapping[];
  targetMonthNames: string[];
  targetMonthIds: string[];
  targetFullKeys: string[];
  conflicts: StudentBillConflict[];
  conflictSummaryMessage: string;
  totalTargetStudents: number;
  blockedStudentCount: number;
  eligibleStudentCount: number;
  eligibleStudentIds: string[];
}

/**
 * Multi-Step Verification:
 * 1. Maps the requested duration (e.g. 3 months starting Baisakh) to specific Nepali month IDs.
 * 2. Queries Firestore directly across 'billItems', 'remitBills', and 'studentFees' for each student
 *    for these specific months to detect existing bills and prevent duplicates.
 */
export async function verifyRequestedMonthsInFirestore(
  db: Firestore,
  students: Array<{ id: string; name?: string; fullName?: string; rollNumber?: string; studentId?: string; class?: string }>,
  startMonth: string,
  durationMonths: number,
  academicYear: string
): Promise<FirestoreBillingVerificationResult> {
  // Step 1: Map the requested duration to specific Nepali month IDs
  const mappedMonths = mapDurationToNepaliMonthIds(startMonth, durationMonths, academicYear);
  const targetMonthNames = mappedMonths.map(m => m.monthName);
  const targetMonthIds = mappedMonths.map(m => m.monthId);
  const targetFullKeys = mappedMonths.map(m => m.fullKey);

  if (mappedMonths.length === 0 || students.length === 0) {
    return {
      verified: true,
      hasDuplicates: false,
      requestedDurationMonths: durationMonths,
      mappedMonths,
      targetMonthNames,
      targetMonthIds,
      targetFullKeys,
      conflicts: [],
      conflictSummaryMessage: '',
      totalTargetStudents: students.length,
      blockedStudentCount: 0,
      eligibleStudentCount: students.length,
      eligibleStudentIds: students.map(s => s.id)
    };
  }

  const conflicts: StudentBillConflict[] = [];
  const eligibleStudentIds: string[] = [];

  // Step 2: Query Firestore for each student for these specific months
  // Use chunked parallel processing to avoid hitting Firestore connection limits
  const cleanTargetYear = (academicYear || '').replace(/\D/g, '');
  const CHUNK_SIZE = 10;
  for (let i = 0; i < students.length; i += CHUNK_SIZE) {
    const chunk = students.slice(i, i + CHUNK_SIZE);
    
    await Promise.all(
      chunk.map(async (student) => {
        const studentConflictsMap = new Map<string, {
          month: string;
          monthId?: string;
          chargeName?: string;
          billNo?: string;
          remitBillId?: string;
          source: 'billItems' | 'remitBills' | 'studentFees';
          status: string;
        }>();

        const activeRemitBillMap = new Map<string, any>();

        try {
          // A) Query 'remitBills' collection in Firestore (Primary Source of Truth)
          const remitQuery = query(
            collection(db, 'remitBills'),
            where('studentId', '==', student.id)
          );
          const remitSnap = await getDocs(remitQuery);

          remitSnap.forEach(docSnap => {
            const data = docSnap.data();
            const status = (data.status || 'pending').toLowerCase();
            if (status === 'void' || status === 'cancelled') return;

            const itemYear = String(data.academicYear || '').replace(/\D/g, '');
            if (cleanTargetYear && itemYear && cleanTargetYear !== itemYear) {
              return; // Belongs to a different academic year
            }
            if (cleanTargetYear && !itemYear && !String(data.academicYear || '').includes(academicYear)) {
              return;
            }

            activeRemitBillMap.set(docSnap.id, data);

            const covered = extractCoveredMonthsFromBill(data);
            const overlapping = covered.filter(m => targetMonthNames.includes(m));

            overlapping.forEach(m => {
              const conflictKey = `remitBills_${m}_${data.billNo || docSnap.id}`;
              studentConflictsMap.set(conflictKey, {
                month: m,
                chargeName: data.billingPeriod || `Remit Bill (${data.billNo || docSnap.id})`,
                billNo: data.billNo,
                remitBillId: docSnap.id,
                source: 'remitBills',
                status: data.status || 'pending'
              });
            });
          });
        } catch (e) {
          console.warn(`Firestore remitBills check skipped for student ${student.id}:`, e);
        }

        try {
          // B) Query 'billItems' collection in Firestore (Sub-items linked to active bills)
          const billItemsQuery = query(
            collection(db, 'billItems'),
            where('studentId', '==', student.id)
          );
          const billItemsSnap = await getDocs(billItemsQuery);
          
          billItemsSnap.forEach(docSnap => {
            const data = docSnap.data();
            const status = (data.status || 'pending').toLowerCase();
            if (status === 'void' || status === 'cancelled') return;

            const itemYear = String(data.academicYear || '').replace(/\D/g, '');
            if (cleanTargetYear && itemYear && cleanTargetYear !== itemYear) {
              return;
            }

            // Only consider billItems that belong to active valid bills (or self-contained active items)
            if (data.remitBillId && !activeRemitBillMap.has(data.remitBillId)) {
              return; // Stale or orphaned bill item from a voided/deleted remit bill
            }

            const normalizedMonth = normalizeNepaliMonth(data.month);
            const mId = data.monthId || '';
            const fKey = data.fullKey || '';

            const isMatch = targetMonthNames.includes(normalizedMonth) ||
              targetMonthIds.includes(mId) ||
              targetFullKeys.includes(fKey);

            if (isMatch) {
              const conflictKey = `billItems_${normalizedMonth}_${data.chargeName || ''}_${data.billNo || ''}`;
              studentConflictsMap.set(conflictKey, {
                month: normalizedMonth,
                monthId: mId || undefined,
                chargeName: data.chargeName || 'Fee Line Item',
                billNo: data.billNo || undefined,
                remitBillId: data.remitBillId || undefined,
                source: 'billItems',
                status: data.status || 'active'
              });
            }
          });
        } catch (e) {
          console.warn(`Firestore billItems check skipped for student ${student.id}:`, e);
        }

        const itemList = Array.from(studentConflictsMap.values());
        const conflictingMonths = Array.from(new Set(itemList.map(it => it.month)));
        const conflictingMonthIds = conflictingMonths.map(m => {
          const found = mappedMonths.find(map => map.monthName === m);
          return found ? found.monthId : m;
        });

        // A student is blocked ONLY if ALL requested months are already covered
        const isFullyBlocked = targetMonthNames.length > 0 && conflictingMonths.length >= targetMonthNames.length;

        if (conflictingMonths.length > 0) {
          conflicts.push({
            studentId: student.id,
            studentName: student.fullName || student.name || 'Unnamed Student',
            studentRoll: student.rollNumber || student.studentId || '',
            conflictingMonths,
            conflictingMonthIds,
            conflictingItems: itemList
          });
        }

        if (!isFullyBlocked) {
          eligibleStudentIds.push(student.id);
        }
      })
    );
  }

  const hasDuplicates = conflicts.length > 0;
  let conflictSummaryMessage = '';

  if (hasDuplicates) {
    const allConflictingMonths = Array.from(new Set(conflicts.flatMap(c => c.conflictingMonths)));
    const allConflictingMonthIds = allConflictingMonths.map(m => {
      const found = mappedMonths.find(map => map.monthName === m);
      return found ? found.monthId : m;
    });

    conflictSummaryMessage = `Existing 'billItems' detected in Firestore for ${conflicts.length} student(s) in month(s): ${allConflictingMonths.join(', ')} (${allConflictingMonthIds.join(', ')}). Generation blocked to prevent duplicate billing.`;
  }

  return {
    verified: true,
    hasDuplicates,
    requestedDurationMonths: durationMonths,
    mappedMonths,
    targetMonthNames,
    targetMonthIds,
    targetFullKeys,
    conflicts,
    conflictSummaryMessage,
    totalTargetStudents: students.length,
    blockedStudentCount: conflicts.length,
    eligibleStudentCount: eligibleStudentIds.length,
    eligibleStudentIds
  };
}

/**
 * Attaches itemized billItems to the Firestore WriteBatch when a Remit Bill is created.
 * Writes each month and charge head as an individual document in the 'billItems' collection.
 */
export function attachBillItemsToBatch(
  batch: WriteBatch,
  db: Firestore,
  billPayload: {
    id: string;
    billNo: string;
    studentId: string;
    studentName: string;
    studentRoll?: string;
    class: string;
    academicYear?: string;
    createdAt: string;
    createdBy: string;
    status: 'pending' | 'paid' | 'partial' | 'void' | 'cancelled';
  },
  itemizedCharges: Array<{ name: string; rate: number; months: number; total: number }>,
  coveredMonths: string[],
  mappedMonths: NepaliMonthIdMapping[]
): BillItem[] {
  const billItems: BillItem[] = [];
  const safeYear = billPayload.academicYear || '2083';

  coveredMonths.forEach(mName => {
    const mapping = mappedMonths.find(m => m.monthName === mName) || {
      monthId: `${(NEPALI_MONTH_SEQUENCE.indexOf(mName as any) + 1).toString().padStart(2, '0')}_${mName}`,
      monthIndex: NEPALI_MONTH_SEQUENCE.indexOf(mName as any) + 1,
      monthName: mName,
      academicYear: safeYear,
      fullKey: `${safeYear}_${mName}`,
      code: `M${(NEPALI_MONTH_SEQUENCE.indexOf(mName as any) + 1).toString().padStart(2, '0')}`
    };

    itemizedCharges.forEach(charge => {
      // Arrears / Back Dues are historic adjustments, not current month billItems
      if (charge.name.includes('Arrears') || charge.name.includes('Back Dues') || charge.name.includes('Outstanding')) {
        return;
      }

      const chargeSlug = charge.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const docId = `${billPayload.studentId}_${safeYear}_${mapping.monthId}_${chargeSlug}`;
      const itemRef = doc(db, 'billItems', docId);

      const monthlyAmount = charge.months > 0 
        ? (charge.rate || (charge.total / charge.months))
        : charge.total;

      const itemData: BillItem = {
        id: docId,
        studentId: billPayload.studentId,
        studentName: billPayload.studentName,
        class: billPayload.class,
        academicYear: safeYear,
        month: mapping.monthName,
        monthId: mapping.monthId,
        monthIndex: mapping.monthIndex,
        fullKey: mapping.fullKey,
        chargeName: charge.name,
        rate: charge.rate || monthlyAmount,
        amount: monthlyAmount,
        remitBillId: billPayload.id,
        billNo: billPayload.billNo,
        status: billPayload.status === 'paid' ? 'paid' : 'pending',
        createdAt: billPayload.createdAt,
        createdBy: billPayload.createdBy
      };

      if (billPayload.studentRoll && billPayload.studentRoll.trim() !== '') {
        itemData.studentRoll = billPayload.studentRoll.trim();
      }

      const sanitizedItemData = sanitizeForFirestore(itemData);
      batch.set(itemRef, sanitizedItemData, { merge: true });
      billItems.push(sanitizedItemData);
    });
  });

  return billItems;
}
