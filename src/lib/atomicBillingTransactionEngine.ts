import {
  Firestore,
  doc,
  collection,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import { sanitizeForFirestore, validateRemitBillPayload } from './firestoreSanitize';
import { formatBSDate } from './nepaliDate';

export interface AtomicBillingStudentRequest {
  student: {
    id: string;
    name?: string;
    fullName?: string;
    rollNumber?: string | number;
    studentId?: string;
    class?: string;
    guardianName?: string;
    admissionEventId?: string;
    admissionNumber?: string;
    admissionNo?: string;
  };
  unbilledForStudent: string[];
  mappedNepaliMonthIds: Array<{ monthName: string; monthId: string; fullKey: string }>;
  itemizedCharges: Array<{
    name: string;
    rate: number;
    multiplier?: number;
    discount?: number;
    total: number;
    month?: string;
    frequency?: string;
  }>;
  totalAmount: number;
}

export interface AtomicBillingExecutionOptions {
  db: Firestore;
  academicYear: string;
  creatorName: string;
  reissueContext?: { fromBillNo?: string };
}

export interface AtomicBillingResult {
  success: boolean;
  skipped: boolean;
  billId?: string;
  billNo?: string;
  studentId: string;
  studentName: string;
  totalAmount: number;
  itemizedCharges: any[];
  coveredMonths: string[];
  reissuedFromBillNo?: string;
  message?: string;
}

/**
 * Atomically generates a remit bill for a student within a Firestore transaction.
 * Enforces mutual exclusion on:
 * 1. Annual Fee (once per academic year per student via annual_fee_locks/{year}_{studentId})
 * 2. Admission Fee (once per admission event via admission_fee_locks/{admissionEventId})
 * 3. Monthly charges (via billing_month_locks/{year}_{studentId}_{monthId})
 * 4. Sequential collision-free document numbering (via document_sequences/RMT_{year})
 */
export async function generateSingleStudentBillTransactionally(
  options: AtomicBillingExecutionOptions,
  req: AtomicBillingStudentRequest
): Promise<AtomicBillingResult> {
  const { db, academicYear, creatorName, reissueContext } = options;
  const { student, unbilledForStudent, mappedNepaliMonthIds, itemizedCharges } = req;

  const studentId = student.id;
  const studentName = student.name || student.fullName || 'Student';
  const cleanYear = (academicYear || '').replace(/\D/g, '') || '2083';

  // Determine explicit admission event identity:
  // Defaults to student.admissionEventId -> student.admissionNumber -> student.admissionNo -> student.id
  const admissionEventId =
    student.admissionEventId ||
    student.admissionNumber ||
    student.admissionNo ||
    student.id;

  return await runTransaction(db, async (transaction) => {
    // ----------------------------------------------------------------------
    // PHASE 1: READ ALL LOCKS & SEQUENCES INSIDE THE TRANSACTION
    // ----------------------------------------------------------------------

    // A. Annual Fee Lock
    const hasAnnualCharge = itemizedCharges.some(it => it.name.includes('Annual'));
    const annualLockRef = doc(db, 'annual_fee_locks', `${cleanYear}_${studentId}`);
    let annualLockDoc: any = null;
    if (hasAnnualCharge) {
      annualLockDoc = await transaction.get(annualLockRef);
    }

    // B. Admission Fee Lock
    const hasAdmissionCharge = itemizedCharges.some(it => it.name.includes('Admission'));
    const admissionLockRef = doc(db, 'admission_fee_locks', `${admissionEventId}`);
    let admissionLockDoc: any = null;
    if (hasAdmissionCharge) {
      admissionLockDoc = await transaction.get(admissionLockRef);
    }

    // C. Monthly Coverage Locks
    const monthLockRefs = unbilledForStudent.map(mName => {
      const mapping = mappedNepaliMonthIds.find(m => m.monthName === mName);
      const mId = mapping?.monthId || mName;
      return {
        monthName: mName,
        monthId: mId,
        ref: doc(db, 'billing_month_locks', `${cleanYear}_${studentId}_${mId}`)
      };
    });

    const monthLockDocs = await Promise.all(
      monthLockRefs.map(async item => {
        const snap = await transaction.get(item.ref);
        return { ...item, snap };
      })
    );

    // D. Document Number Sequence
    const seqDocRef = doc(db, 'document_sequences', `RMT_${cleanYear}`);
    const seqSnap = await transaction.get(seqDocRef);

    // ----------------------------------------------------------------------
    // PHASE 2: ATOMIC CONFLICT FILTERING & ELIGIBILITY EVALUATION
    // ----------------------------------------------------------------------

    const effectiveCharges: typeof itemizedCharges = [];
    const effectiveMonths: string[] = [];

    // Filter Monthly charges against claimed month locks
    unbilledForStudent.forEach(mName => {
      const lock = monthLockDocs.find(l => l.monthName === mName);
      if (lock?.snap?.exists() && lock.snap.data()?.status === 'active') {
        // Month already claimed by a concurrent active bill! Skip this month.
        return;
      }
      effectiveMonths.push(mName);
    });

    // Filter itemized charges
    itemizedCharges.forEach(item => {
      const iName = item.name || '';

      // Annual Fee Check
      if (iName.includes('Annual')) {
        if (annualLockDoc?.exists() && annualLockDoc.data()?.status === 'active') {
          // Annual Fee has ALREADY been claimed by another active bill! Omit from this bill.
          return;
        }
      }

      // Admission Fee Check
      if (iName.includes('Admission')) {
        if (admissionLockDoc?.exists() && admissionLockDoc.data()?.status === 'active') {
          // Admission Fee has ALREADY been claimed for this admission event! Omit from this bill.
          return;
        }
      }

      // Monthly Recurring Items Check (Tuition, Transport, Computer, Academy, etc.)
      const isRecurringMonthly =
        iName.includes('Tuition') ||
        iName.includes('Transport') ||
        iName.includes('Computer') ||
        iName.includes('Academy') ||
        iName.includes('Sports');

      if (isRecurringMonthly) {
        if (effectiveMonths.length === 0) {
          // No unbilled months remain for this student
          return;
        }
        // Scale rate accurately to effective unbilled months
        const unitRate = item.rate || (item.total / Math.max(1, unbilledForStudent.length));
        const newTotal = unitRate * effectiveMonths.length;
        const discount = (item.discount || 0) * (effectiveMonths.length / Math.max(1, unbilledForStudent.length));
        effectiveCharges.push({
          ...item,
          multiplier: effectiveMonths.length,
          rate: unitRate,
          discount,
          total: Math.max(0, newTotal - discount)
        });
        return;
      }

      // Other custom / exam charges
      effectiveCharges.push(item);
    });

    // If zero effective charges or zero effective months remain, abort bill creation cleanly
    const effectiveTotalAmount = effectiveCharges.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
    if (effectiveCharges.length === 0 || effectiveTotalAmount <= 0) {
      return {
        success: true,
        skipped: true,
        studentId,
        studentName,
        totalAmount: 0,
        itemizedCharges: [],
        coveredMonths: [],
        message: `Student ${studentName} was skipped because all requested charges/months are already claimed.`
      };
    }

    // ----------------------------------------------------------------------
    // PHASE 3: ALLOCATE ATOMIC SEQUENTIAL DOCUMENT NUMBER
    // ----------------------------------------------------------------------
    let currentLastNum = 0;
    if (seqSnap.exists()) {
      currentLastNum = Number(seqSnap.data()?.lastNumber || 0);
    }
    const nextNum = currentLastNum + 1;
    const docSerial = `RMT-${cleanYear}-${String(nextNum).padStart(6, '0')}`;

    // ----------------------------------------------------------------------
    // PHASE 4: ATOMIC TRANSACTIONAL WRITES
    // ----------------------------------------------------------------------

    // A. Update Sequence Counter
    transaction.set(
      seqDocRef,
      {
        lastNumber: nextNum,
        docType: 'RMT',
        academicYear: cleanYear,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    // B. Create Remit Bill Document
    const billRef = doc(collection(db, 'remitBills'));
    const currentBS = formatBSDate(new Date());
    const periodLabel = effectiveMonths.length === 1
      ? `${effectiveMonths[0]} (1 Month)`
      : `${effectiveMonths[0]} to ${effectiveMonths[effectiveMonths.length - 1]} (${effectiveMonths.length} Months)`;

    const billPayload: Record<string, any> = {
      id: billRef.id,
      billNo: docSerial,
      studentId: student.id,
      studentName: studentName,
      class: student.class || '',
      billingPeriod: periodLabel,
      periodMonths: effectiveMonths.length,
      coveredMonths: effectiveMonths,
      academicYear: cleanYear,
      itemizedCharges: effectiveCharges,
      totalAmount: effectiveTotalAmount,
      status: 'pending',
      createdAt: currentBS,
      createdBy: creatorName
    };

    const rollVal = student.rollNumber || student.studentId;
    if (rollVal && String(rollVal).trim() !== '') {
      billPayload.studentRoll = String(rollVal).trim();
    }
    if (student.guardianName && String(student.guardianName).trim() !== '') {
      billPayload.guardianName = String(student.guardianName).trim();
    }
    if (reissueContext && typeof reissueContext.fromBillNo === 'string' && reissueContext.fromBillNo.trim() !== '') {
      billPayload.reissuedFromBillNo = reissueContext.fromBillNo.trim();
    }

    const validation = validateRemitBillPayload(billPayload);
    if (!validation.isValid) {
      throw new Error(`Validation failed for student ${studentName}: ${validation.errors.join(', ')}`);
    }

    transaction.set(billRef, sanitizeForFirestore(billPayload));

    // C. Write Uniqueness Locks
    // 1. Annual Fee Lock
    if (effectiveCharges.some(it => it.name.includes('Annual'))) {
      transaction.set(annualLockRef, {
        claimed: true,
        status: 'active',
        studentId,
        academicYear: cleanYear,
        billId: billRef.id,
        billNo: docSerial,
        amount: effectiveCharges.find(it => it.name.includes('Annual'))?.total || 3500,
        claimedAt: new Date().toISOString()
      });
    }

    // 2. Admission Fee Lock
    if (effectiveCharges.some(it => it.name.includes('Admission'))) {
      transaction.set(admissionLockRef, {
        claimed: true,
        status: 'active',
        studentId,
        admissionEventId,
        billId: billRef.id,
        billNo: docSerial,
        amount: effectiveCharges.find(it => it.name.includes('Admission'))?.total || 2500,
        claimedAt: new Date().toISOString()
      });
    }

    // 3. Monthly Locks
    effectiveMonths.forEach(mName => {
      const lock = monthLockRefs.find(l => l.monthName === mName);
      if (lock) {
        transaction.set(lock.ref, {
          claimed: true,
          status: 'active',
          studentId,
          academicYear: cleanYear,
          monthName: mName,
          monthId: lock.monthId,
          billId: billRef.id,
          billNo: docSerial,
          claimedAt: new Date().toISOString()
        });
      }
    });

    // D. Write Deterministic Child Documents
    // 1. billItems
    effectiveCharges.forEach(item => {
      const chargeSlug = (item.name || 'charge').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      effectiveMonths.forEach(mName => {
        const mapping = mappedNepaliMonthIds.find(m => m.monthName === mName);
        const mId = mapping?.monthId || mName;
        const billItemDocId = `${studentId}_${cleanYear}_${mId}_${chargeSlug}`;
        const billItemRef = doc(db, 'billItems', billItemDocId);

        transaction.set(
          billItemRef,
          sanitizeForFirestore({
            id: billItemDocId,
            billId: billRef.id,
            billNo: docSerial,
            studentId,
            academicYear: cleanYear,
            month: mName,
            monthId: mId,
            chargeName: item.name,
            chargeSlug,
            unitRate: item.rate,
            amount: item.rate,
            total: item.total,
            status: 'active',
            createdAt: new Date().toISOString()
          }),
          { merge: true }
        );
      });
    });

    // 2. studentFees
    effectiveCharges.forEach(item => {
      if (item.name.includes('Arrears') || item.name.includes('Outstanding') || item.rate < 0) return;

      let fType = 'Other Fee';
      if (item.name.includes('Tuition')) fType = 'Tuition Fee';
      else if (item.name.includes('Computer')) fType = 'Computer Fee';
      else if (item.name.includes('Transport')) fType = 'Transportation Fee';
      else if (item.name.includes('Academy') || item.name.includes('Sports')) fType = 'Academy Fee';
      else if (item.name.includes('Annual')) fType = 'Annual Fee';
      else if (item.name.includes('Admission')) fType = 'Admission Fee';
      else if (item.name.includes('Exam')) fType = 'Terminal Exam Fee';
      else fType = item.name;

      if (fType === 'Annual Fee' || fType === 'Admission Fee') {
        const feeId = `${studentId}_${cleanYear}_${fType.replace(/\s+/g, '')}`;
        const feeRef = doc(db, 'studentFees', feeId);
        transaction.set(
          feeRef,
          sanitizeForFirestore({
            studentId,
            month: effectiveMonths[0] || 'Baisakh',
            academicYear: cleanYear,
            type: fType,
            totalFee: item.rate || item.total,
            paidAmount: 0,
            dueAmount: item.rate || item.total,
            status: 'due',
            remitBillId: billRef.id,
            createdAt: new Date().toISOString()
          }),
          { merge: true }
        );
      } else {
        effectiveMonths.forEach(monthName => {
          const feeId = `${studentId}_${monthName.replace(/\s+/g, '')}_${fType.replace(/\s+/g, '')}`;
          const feeRef = doc(db, 'studentFees', feeId);
          const monthlyRate = item.rate || (item.total / effectiveMonths.length);

          transaction.set(
            feeRef,
            sanitizeForFirestore({
              studentId,
              month: monthName,
              academicYear: cleanYear,
              type: fType,
              totalFee: monthlyRate,
              paidAmount: 0,
              dueAmount: monthlyRate,
              status: 'due',
              remitBillId: billRef.id,
              createdAt: new Date().toISOString()
            }),
            { merge: true }
          );
        });
      }
    });

    return {
      success: true,
      skipped: false,
      billId: billRef.id,
      billNo: docSerial,
      studentId,
      studentName,
      totalAmount: effectiveTotalAmount,
      itemizedCharges: effectiveCharges,
      coveredMonths: effectiveMonths
    };
  });
}

/**
 * Releases/voids all uniqueness locks associated with a remit bill upon Voiding.
 */
export async function releaseBillUniquenessLocks(
  db: Firestore,
  bill: {
    id: string;
    studentId: string;
    academicYear: string;
    coveredMonths?: string[];
    itemizedCharges?: Array<{ name: string }>;
    admissionEventId?: string;
  }
): Promise<void> {
  const cleanYear = (bill.academicYear || '').replace(/\D/g, '') || '2083';
  const studentId = bill.studentId;

  // Release Annual Fee Lock if present
  if (bill.itemizedCharges?.some(it => it.name?.includes('Annual'))) {
    const annualLockRef = doc(db, 'annual_fee_locks', `${cleanYear}_${studentId}`);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(annualLockRef);
      if (snap.exists() && snap.data()?.billId === bill.id) {
        tx.set(annualLockRef, { status: 'void', voidedAt: new Date().toISOString() }, { merge: true });
      }
    });
  }

  // Release Admission Fee Lock if present
  if (bill.itemizedCharges?.some(it => it.name?.includes('Admission'))) {
    const admissionEventId = bill.admissionEventId || studentId;
    const admissionLockRef = doc(db, 'admission_fee_locks', `${admissionEventId}`);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(admissionLockRef);
      if (snap.exists() && snap.data()?.billId === bill.id) {
        tx.set(admissionLockRef, { status: 'void', voidedAt: new Date().toISOString() }, { merge: true });
      }
    });
  }

  // Release Monthly Locks
  if (Array.isArray(bill.coveredMonths)) {
    for (const mName of bill.coveredMonths) {
      const mLockRef = doc(db, 'billing_month_locks', `${cleanYear}_${studentId}_${mName}`);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(mLockRef);
        if (snap.exists() && snap.data()?.billId === bill.id) {
          tx.set(mLockRef, { status: 'void', voidedAt: new Date().toISOString() }, { merge: true });
        }
      });
    }
  }
}
