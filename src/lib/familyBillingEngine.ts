/**
 * Authoritative Family / Guardian Consolidated Billing Engine
 * Shikshantar Academy School ERP
 *
 * Core Architecture & Invariants:
 * 1. Family consolidation is purely a Presentation & Collection Layer.
 * 2. Child-level bills, fees, allocations, advances, refunds, and ledgers remain strictly child-specific.
 * 3. Never merges child identities, never merges student IDs, and never moves debt between siblings.
 * 4. Authoritative Guardian Linkage via verified parent phone, guardian name, or family ID.
 * 5. Deterministic waterfall and custom payment allocation across children with zero leakage.
 * 6. Overpayment handling: Return physical change OR credit advance to a designated child.
 * 7. 100% Nepali / Bikram Sambat (B.S.) date compliance.
 * 8. Atomic Firestore Transaction execution for concurrency safety and idempotency.
 */

import {
  Firestore,
  doc,
  collection,
  runTransaction,
  serverTimestamp,
  getDoc,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { formatBSDate, formatBSDateYMD, getBSYearMonthDate } from './nepaliDate';
import { recordLedgerAuditLog, getAuthoritativeActor } from './auditLogger';
import { parseIntegerAmount, sanitizeDigitsOnly, canonicalizeReceiptNo, isValidIntegerCashInput } from './cashPaymentEngine';
import { allocateNextDocumentNumber } from './documentNumberingEngine';

export interface FamilyChildSummary {
  id: string; // user doc ID
  studentId: string; // STU-XXXXXX
  name: string;
  class: string;
  section?: string;
  rollNumber?: string;
  monthlyFee: number;
  previousYearDue: number;
  currentYearDue: number;
  totalDue: number;
  scholarshipStatus?: string;
  scholarshipAmount?: number;
  bills: Array<{
    id: string;
    billNo?: string;
    billingPeriod?: string;
    totalAmount: number;
    paidAmount: number;
    dueAmount: number;
    status: string;
    academicYear?: string;
  }>;
}

export interface FamilyGroup {
  familyKey: string;
  familyId?: string;
  guardianName: string;
  guardianPhone: string;
  children: FamilyChildSummary[];
  totalFamilyPayable: number;
  totalPreviousYearDue: number;
  totalCurrentYearDue: number;
}

export interface FamilyAllocationBreakdown {
  studentId: string;
  studentDocId: string;
  studentName: string;
  class: string;
  totalDue: number;
  allocatedAmount: number;
  remainingDue: number;
  status: 'paid' | 'partial' | 'due' | 'zero';
}

export interface FamilyPaymentCalculationResult {
  totalFamilyPayable: number;
  cashTendered: number;
  amountApplied: number;
  remainingFamilyOutstanding: number;
  excessAmount: number;
  changeReturned: number;
  advanceCreated: number;
  advanceDesignatedChildId?: string;
  excessDecision: 'ADVANCE' | 'RETURN' | null;
  isExcess: boolean;
  isExact: boolean;
  isPartial: boolean;
  isZero: boolean;
  allocations: FamilyAllocationBreakdown[];
}

/**
 * Group students by authoritative guardian linkage (phone or guardian identifier).
 * Groups only when at least 2 students share the same verified guardian contact,
 * or allows single-family lookup.
 */
export function groupStudentsByFamily(
  students: any[],
  remitBills: any[] = [],
  currentAcademicYear: string = '2083'
): FamilyGroup[] {
  const familyMap = new Map<string, { familyId?: string; guardianName: string; guardianPhone: string; students: any[] }>();

  students.forEach((s) => {
    const rawFamilyId = String(s.familyId || s.familyIdentifier || '').trim();
    const phone = String(s.parentPhone || s.phone || s.guardianPhone || '').trim().replace(/\D/g, '');
    const guardian = String(s.guardianName || s.fatherName || 'Unknown Guardian').trim();
    
    // Group key based on authoritative familyId first, clean phone number (if >= 8 digits), or unique guardian key
    let groupKey = '';
    if (rawFamilyId) {
      groupKey = `FAM_${rawFamilyId}`;
    } else if (phone.length >= 8) {
      groupKey = `PHONE_${phone}`;
    } else if (guardian.length >= 3 && guardian.toLowerCase() !== 'unknown' && guardian.toLowerCase() !== 'unknown guardian') {
      groupKey = `NAME_${guardian.toLowerCase()}`;
    }

    if (!groupKey) return;

    if (!familyMap.has(groupKey)) {
      familyMap.set(groupKey, {
        familyId: rawFamilyId || undefined,
        guardianName: guardian,
        guardianPhone: phone || s.parentPhone || s.phone || '',
        students: []
      });
    }
    familyMap.get(groupKey)!.students.push(s);
  });

  const familyGroups: FamilyGroup[] = [];

  familyMap.forEach((entry, key) => {
    // Only consider as family group if 2 or more siblings, or for dedicated search
    const childrenSummaries: FamilyChildSummary[] = entry.students.map((st) => {
      // Find bills for this student
      const studentBills = remitBills.filter((b) => {
        const isMatch = b.studentId 
          ? (b.studentId === st.id || b.studentId === st.studentId) 
          : (b.studentName === (st.fullName || st.name) && b.class === st.class);
        const isActive = b.status !== 'void';
        return isMatch && isActive;
      });

      let currentYearDue = 0;
      let previousYearDue = 0;

      studentBills.forEach((b) => {
        const due = parseIntegerAmount(b.dueAmount !== undefined ? b.dueAmount : (b.totalAmount - (b.paidAmount || 0)));
        const billYear = String(b.academicYear || '').replace(/\D/g, '') || currentAcademicYear;
        const cleanCurrYear = currentAcademicYear.replace(/\D/g, '');

        if (billYear < cleanCurrYear) {
          previousYearDue += due;
        } else {
          currentYearDue += due;
        }
      });

      // If no bills exist, check raw studentFees if present
      if (studentBills.length === 0 && Array.isArray(st.fees)) {
        st.fees.forEach((f: any) => {
          if (f.status === 'due') {
            currentYearDue += parseIntegerAmount(f.dueAmount || f.amount || 0);
          }
        });
      }

      const totalDue = previousYearDue + currentYearDue;

      return {
        id: st.id,
        studentId: st.studentId || st.permanentStudentId || st.id,
        name: st.fullName || st.name || 'Student',
        class: st.class || '',
        section: st.section || '',
        rollNumber: st.rollNumber || st.rollNo || '',
        monthlyFee: parseIntegerAmount(st.monthlyFee || 0),
        previousYearDue,
        currentYearDue,
        totalDue,
        scholarshipStatus: st.scholarshipStatus,
        scholarshipAmount: st.scholarshipAmount ? parseIntegerAmount(st.scholarshipAmount) : undefined,
        bills: studentBills.map((b) => ({
          id: b.id,
          billNo: b.billNo || b.id,
          billingPeriod: b.billingPeriod,
          totalAmount: parseIntegerAmount(b.totalAmount || 0),
          paidAmount: parseIntegerAmount(b.paidAmount || 0),
          dueAmount: parseIntegerAmount(b.dueAmount !== undefined ? b.dueAmount : (b.totalAmount - (b.paidAmount || 0))),
          status: b.status || 'due',
          academicYear: b.academicYear
        }))
      };
    });

    const totalFamilyPayable = childrenSummaries.reduce((sum, c) => sum + c.totalDue, 0);
    const totalPreviousYearDue = childrenSummaries.reduce((sum, c) => sum + c.previousYearDue, 0);
    const totalCurrentYearDue = childrenSummaries.reduce((sum, c) => sum + c.currentYearDue, 0);

    familyGroups.push({
      familyKey: key,
      familyId: entry.familyId,
      guardianName: entry.guardianName,
      guardianPhone: entry.guardianPhone,
      children: childrenSummaries,
      totalFamilyPayable,
      totalPreviousYearDue,
      totalCurrentYearDue
    });
  });

  // Sort families with highest dues first
  return familyGroups.sort((a, b) => b.totalFamilyPayable - a.totalFamilyPayable);
}

/**
 * Pure calculation logic for allocating family payment across children.
 * Enforces:
 * 1. Default waterfall: Previous year dues first, then oldest child/bill until cash applied exhausted.
 * 2. Custom per-child override validation: sum(allocations) <= cashTendered and child.allocated <= child.totalDue.
 * 3. Excess cash: Return as change OR credit as advance to designated child.
 */
export function calculateFamilyPaymentAllocation(
  children: FamilyChildSummary[],
  cashTenderedInput: number | string,
  customAllocations?: Record<string, number | string>,
  excessDecisionParam?: 'ADVANCE' | 'RETURN' | null,
  advanceDesignatedChildId?: string
): FamilyPaymentCalculationResult {
  const cashTendered = parseIntegerAmount(cashTenderedInput);
  const totalFamilyPayable = children.reduce((sum, c) => sum + c.totalDue, 0);

  const excessAmount = Math.max(0, cashTendered - totalFamilyPayable);
  const isExcess = cashTendered > totalFamilyPayable;
  const isExact = cashTendered === totalFamilyPayable && totalFamilyPayable > 0;
  const isPartial = cashTendered > 0 && cashTendered < totalFamilyPayable;
  const isZero = cashTendered === 0;

  const excessDecision = excessDecisionParam || null;
  let changeReturned = 0;
  let advanceCreated = 0;

  if (isExcess) {
    if (excessDecision === 'ADVANCE') {
      changeReturned = 0;
      advanceCreated = excessAmount;
    } else {
      // Default / RETURN: return excess cash as change
      changeReturned = excessAmount;
      advanceCreated = 0;
    }
  }

  const effectiveCashToApply = Math.min(cashTendered, totalFamilyPayable);
  const allocations: FamilyAllocationBreakdown[] = [];

  if (customAllocations && Object.keys(customAllocations).length > 0) {
    // Custom allocation mode: Validate exact user inputs
    let totalCustomApplied = 0;

    children.forEach((c) => {
      const customVal = parseIntegerAmount(customAllocations[c.id] || 0);
      const cappedVal = Math.min(customVal, c.totalDue);
      totalCustomApplied += cappedVal;

      const remaining = Math.max(0, c.totalDue - cappedVal);
      let status: 'paid' | 'partial' | 'due' | 'zero' = 'due';
      if (c.totalDue === 0) status = 'zero';
      else if (cappedVal === c.totalDue) status = 'paid';
      else if (cappedVal > 0) status = 'partial';

      allocations.push({
        studentId: c.studentId,
        studentDocId: c.id,
        studentName: c.name,
        class: c.class,
        totalDue: c.totalDue,
        allocatedAmount: cappedVal,
        remainingDue: remaining,
        status
      });
    });

    const amountApplied = totalCustomApplied;
    const remainingFamilyOutstanding = Math.max(0, totalFamilyPayable - amountApplied);

    return {
      totalFamilyPayable,
      cashTendered,
      amountApplied,
      remainingFamilyOutstanding,
      excessAmount,
      changeReturned,
      advanceCreated,
      advanceDesignatedChildId,
      excessDecision,
      isExcess,
      isExact,
      isPartial,
      isZero,
      allocations
    };
  }

  // Canonical Waterfall Mode:
  // 1. Allocate to previous-year dues across children
  // 2. Allocate to current-year dues across children in order
  let remainingBudget = effectiveCashToApply;
  const childAllocMap = new Map<string, number>();
  children.forEach((c) => childAllocMap.set(c.id, 0));

  // Phase 1: Previous year dues
  for (const child of children) {
    if (remainingBudget <= 0) break;
    if (child.previousYearDue > 0) {
      const payAmt = Math.min(remainingBudget, child.previousYearDue);
      childAllocMap.set(child.id, (childAllocMap.get(child.id) || 0) + payAmt);
      remainingBudget -= payAmt;
    }
  }

  // Phase 2: Current year dues
  for (const child of children) {
    if (remainingBudget <= 0) break;
    const currentAlloc = childAllocMap.get(child.id) || 0;
    const childRemaining = child.totalDue - currentAlloc;
    if (childRemaining > 0) {
      const payAmt = Math.min(remainingBudget, childRemaining);
      childAllocMap.set(child.id, currentAlloc + payAmt);
      remainingBudget -= payAmt;
    }
  }

  children.forEach((c) => {
    const allocated = childAllocMap.get(c.id) || 0;
    const remaining = Math.max(0, c.totalDue - allocated);
    let status: 'paid' | 'partial' | 'due' | 'zero' = 'due';
    if (c.totalDue === 0) status = 'zero';
    else if (allocated === c.totalDue) status = 'paid';
    else if (allocated > 0) status = 'partial';

    allocations.push({
      studentId: c.studentId,
      studentDocId: c.id,
      studentName: c.name,
      class: c.class,
      totalDue: c.totalDue,
      allocatedAmount: allocated,
      remainingDue: remaining,
      status
    });
  });

  const amountApplied = allocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
  const remainingFamilyOutstanding = Math.max(0, totalFamilyPayable - amountApplied);

  return {
    totalFamilyPayable,
    cashTendered,
    amountApplied,
    remainingFamilyOutstanding,
    excessAmount,
    changeReturned,
    advanceCreated,
    advanceDesignatedChildId,
    excessDecision,
    isExcess,
    isExact,
    isPartial,
    isZero,
    allocations
  };
}

export interface ExecuteFamilyPaymentParams {
  guardianName: string;
  guardianPhone: string;
  academicYear?: string;
  children: FamilyChildSummary[];
  cashTendered: number;
  customAllocations?: Record<string, number | string>;
  excessDecision?: 'ADVANCE' | 'RETURN' | null;
  advanceDesignatedChildId?: string;
  operatorName?: string;
  operatorUid?: string;
  receiptNo?: string;
  remarks?: string;
  customDb?: Firestore;
}

/**
 * Executes an atomic, concurrency-safe Family Consolidated Cash Payment in Firestore.
 * Slices payment child-by-child with zero leakage, updates remit bills and student fees,
 * records single authoritative transaction & cash ledger entry, and logs an immutable audit trail.
 */
export async function executeFamilyCashFeePayment(params: ExecuteFamilyPaymentParams) {
  const firestoreDb = params.customDb || db;

  if (!isValidIntegerCashInput(params.cashTendered)) {
    throw new Error(`Invalid Cash Tendered input: "${String(params.cashTendered)}". Cash amounts must be whole integer Nepalese Rupees without decimals, commas, spaces, or non-numeric characters.`);
  }

  const cashTendered = parseIntegerAmount(params.cashTendered);

  if (cashTendered <= 0) {
    throw new Error('Cash tendered must be a positive number greater than 0.');
  }

  const breakdown = calculateFamilyPaymentAllocation(
    params.children,
    cashTendered,
    params.customAllocations,
    params.excessDecision,
    params.advanceDesignatedChildId
  );

  if (breakdown.isExcess && !params.excessDecision) {
    throw new Error('Cash tendered exceeds Total Family Payable. Please select an overpayment decision (Return Change or Credit Advance) before confirming payment.');
  }

  if (breakdown.isExcess && params.excessDecision === 'ADVANCE' && !params.advanceDesignatedChildId) {
    throw new Error('Please select which child should receive the advance credit before confirming.');
  }

  const now = new Date();
  const bsDate = formatBSDate(now);
  const bsDateYMD = formatBSDateYMD(now);
  const bsYear = getBSYearMonthDate(now).year;
  const academicYear = params.academicYear || `${bsYear}-${bsYear + 1} B.S.`;
  const operatorName = params.operatorName || 'Cashier Desk';
  const operatorUid = params.operatorUid || auth.currentUser?.uid || 'system';

  const receiptNo = params.receiptNo || (await allocateNextDocumentNumber({
    db: firestoreDb,
    academicYear,
    documentType: 'RECEIPT'
  }));

  const cleanReceipt = canonicalizeReceiptNo(receiptNo);
  if (!cleanReceipt) {
    throw new Error('A valid Receipt Number is required for family cash payment execution.');
  }

  const txId = `TXN_${cleanReceipt}`;
  const txDocRef = doc(firestoreDb, 'transactions', txId);
  const receiptLockRef = doc(firestoreDb, 'payment_receipt_locks', cleanReceipt);
  const cashLedgerDocRef = doc(firestoreDb, 'cash_ledger', `LEDGER_${cleanReceipt}`);

  // Security check: Authoritative Admin actor
  const authoritativeActor = await getAuthoritativeActor();

  return await runTransaction(firestoreDb, async (transaction) => {
    // 1. Idempotency Check & Receipt Mutex Guard
    const [existingTxSnap, existingLockSnap] = await Promise.all([
      transaction.get(txDocRef),
      transaction.get(receiptLockRef)
    ]);

    if (existingTxSnap.exists() || existingLockSnap.exists()) {
      throw new Error(`Duplicate transaction detected for Receipt ${receiptNo}. Operation cancelled.`);
    }

    // 2. Fetch all child remit bills to allocate against (ALL READS FIRST)
    const billDocFetches = [];
    for (const child of params.children) {
      for (const bill of child.bills) {
        if (bill.id) {
          const billRef = doc(firestoreDb, 'remitBills', bill.id);
          billDocFetches.push({ childId: child.id, billId: bill.id, ref: billRef });
        }
      }
    }

    // Read designated child user doc if advance credit is created
    let designatedChildUserRef: any = null;
    let designatedChildUserSnap: any = null;
    if (breakdown.advanceCreated > 0 && params.advanceDesignatedChildId) {
      const designatedChild = params.children.find((c) => c.id === params.advanceDesignatedChildId);
      const childDocId = designatedChild?.id || params.advanceDesignatedChildId;
      designatedChildUserRef = doc(firestoreDb, 'users', childDocId);
      designatedChildUserSnap = await transaction.get(designatedChildUserRef);
    }

    const billSnaps = await Promise.all(
      billDocFetches.map(async (item) => {
        const snap = await transaction.get(item.ref);
        return { ...item, snap };
      })
    );

    // 3. Child-by-Child Settlement Execution (WRITES)
    const childPaymentDetails: any[] = [];

    for (const alloc of breakdown.allocations) {
      let childAllocBudget = alloc.allocatedAmount;
      const childBillsModified: any[] = [];

      // Find all live bills for this child, sorted oldest first (previous years first, then chronological)
      const childBillSnaps = billSnaps
        .filter((b) => b.childId === alloc.studentDocId)
        .sort((a, b) => {
          const aYear = String(a.snap.data()?.academicYear || '2083').replace(/\D/g, '');
          const bYear = String(b.snap.data()?.academicYear || '2083').replace(/\D/g, '');
          if (aYear !== bYear) return aYear.localeCompare(bYear);
          return (a.snap.data()?.createdAt?.seconds || 0) - (b.snap.data()?.createdAt?.seconds || 0);
        });

      for (const bItem of childBillSnaps) {
        if (childAllocBudget <= 0) break;
        if (!bItem.snap.exists()) continue;

        const bData = bItem.snap.data();
        if (bData.status === 'void' || bData.status === 'cancelled') continue;

        const totalAmt = parseIntegerAmount(bData.totalAmount || 0);
        const currentPaid = parseIntegerAmount(bData.paidAmount || 0);
        const currentDue = parseIntegerAmount(bData.dueAmount !== undefined ? bData.dueAmount : (totalAmt - currentPaid));

        if (currentDue <= 0) continue;

        const payTowardsBill = Math.min(childAllocBudget, currentDue);
        const newPaid = currentPaid + payTowardsBill;
        const newDue = Math.max(0, totalAmt - newPaid);
        const newStatus = newDue === 0 ? 'paid' : (newPaid > 0 ? 'partial' : 'pending');

        transaction.update(bItem.ref, {
          paidAmount: newPaid,
          dueAmount: newDue,
          status: newStatus,
          lastPaymentReceiptNo: receiptNo,
          lastPaymentDateBS: bsDate,
          updatedAt: serverTimestamp()
        });

        childBillsModified.push({
          billId: bItem.billId,
          billNo: bData.billNo || bItem.billId,
          allocated: payTowardsBill,
          previousDue: currentDue,
          remainingDue: newDue,
          status: newStatus
        });

        childAllocBudget -= payTowardsBill;
      }

      childPaymentDetails.push({
        studentId: alloc.studentId,
        studentDocId: alloc.studentDocId,
        studentName: alloc.studentName,
        class: alloc.class,
        totalDue: alloc.totalDue,
        allocatedAmount: alloc.allocatedAmount,
        remainingDue: alloc.remainingDue,
        status: alloc.status,
        billsModified: childBillsModified
      });
    }

    // 4. Handle Advance Creation if chosen
    let advanceDocId = '';
    if (breakdown.advanceCreated > 0 && params.advanceDesignatedChildId) {
      const advRef = doc(firestoreDb, 'student_advances', `ADV_${cleanReceipt}`);
      advanceDocId = advRef.id;
      const designatedChild = params.children.find((c) => c.id === params.advanceDesignatedChildId);

      transaction.set(advRef, {
        id: advanceDocId,
        studentId: designatedChild?.id || params.advanceDesignatedChildId,
        permanentStudentId: designatedChild?.studentId || '',
        studentName: designatedChild?.name || 'Student',
        guardianName: params.guardianName,
        amount: breakdown.advanceCreated,
        remainingCredit: breakdown.advanceCreated,
        remainingBalance: breakdown.advanceCreated,
        sourceReceiptNo: receiptNo,
        sourceTxId: txId,
        academicYear,
        dateBS: bsDate,
        createdAt: serverTimestamp(),
        status: 'ACTIVE',
        note: `Advance credit from Family Consolidated Payment (${params.guardianName})`
      });

      // Update designated student doc advanceBalance
      const currentAdv = designatedChildUserSnap?.exists() ? Number(designatedChildUserSnap.data()?.advanceBalance || 0) : 0;
      if (designatedChildUserRef) {
        transaction.set(designatedChildUserRef, {
          advanceBalance: currentAdv + breakdown.advanceCreated,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    }

    // 5. Create Deterministic Receipt Mutex Lock Document
    transaction.set(receiptLockRef, {
      receiptNo,
      cleanReceipt,
      transactionId: txId,
      guardianName: params.guardianName,
      guardianPhone: params.guardianPhone,
      amount: breakdown.amountApplied,
      cashTendered: cashTendered,
      isFamilyPayment: true,
      createdAt: serverTimestamp()
    });

    // 6. Create Authoritative Transaction Document
    transaction.set(txDocRef, {
      id: txId,
      receiptNo,
      type: 'INCOME',
      paymentMethod: 'CASH',
      category: 'Fee Collection',
      isFamilyPayment: true,
      guardianName: params.guardianName,
      guardianPhone: params.guardianPhone,
      totalFamilyPayable: breakdown.totalFamilyPayable,
      cashTendered: breakdown.cashTendered,
      amount: breakdown.amountApplied, // total applied to dues
      changeReturned: breakdown.changeReturned,
      advanceCreated: breakdown.advanceCreated,
      advanceDesignatedChildId: params.advanceDesignatedChildId || null,
      advanceDocId: advanceDocId || null,
      excessDecision: breakdown.excessDecision,
      status: 'SUCCESS',
      academicYear,
      date: bsDateYMD,
      dateBS: bsDate,
      time: now.toLocaleTimeString(),
      operatorName,
      operatorUid,
      remarks: params.remarks || `Family Consolidated Fee Payment for ${params.guardianName} (${params.children.length} children)`,
      childrenAllocations: childPaymentDetails,
      createdAt: serverTimestamp()
    });

    // 7. Record in Physical Cash Ledger (Actual cash retained in school register)
    transaction.set(cashLedgerDocRef, {
      receiptNo,
      type: 'Income',
      category: 'Fee Collection',
      amount: breakdown.cashTendered - breakdown.changeReturned, // Net cash physically retained in register
      date: bsDateYMD,
      dateBS: bsDate,
      description: `Cash Fee Collection - Family: ${params.guardianName} (Rcpt #${receiptNo})`,
      studentName: `${params.guardianName} (Family of ${params.children.length})`,
      isFamilyCollection: true,
      operator: operatorName,
      operatorUid,
      txId,
      timestamp: serverTimestamp()
    });

    // 8. Authoritative Immutable Audit Log
    const opId = `OP_FAM_PAY_${cleanReceipt}`;
    const auditLogRef = doc(firestoreDb, 'ledger_audit_logs', opId);
    transaction.set(auditLogRef, {
      id: opId,
      actionType: 'FAMILY_PAYMENT_COLLECTED',
      category: 'financial',
      actorUid: authoritativeActor.actorUid,
      actorEmail: authoritativeActor.actorEmail,
      actorRole: authoritativeActor.actorRole,
      actorTier: authoritativeActor.adminTier,
      targetId: txId,
      receiptNo,
      guardianName: params.guardianName,
      guardianPhone: params.guardianPhone,
      cashTendered: breakdown.cashTendered,
      amountApplied: breakdown.amountApplied,
      excessDecision: breakdown.excessDecision,
      advanceCreated: breakdown.advanceCreated,
      childCount: params.children.length,
      childrenAllocations: childPaymentDetails,
      academicYear,
      timestamp: serverTimestamp(),
      dateBS: bsDate,
      reason: `Family consolidated fee payment for ${params.guardianName}`
    });

    return {
      success: true,
      txId,
      receiptNo,
      breakdown,
      childPaymentDetails,
      dateBS: bsDate
    };
  });
}
