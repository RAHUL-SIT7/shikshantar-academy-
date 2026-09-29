/**
 * PAYMENT REFUND & TRANSACTION SAFETY ENGINE
 * 
 * Formal, concurrency-safe, transactional refund engine and financial deletion
 * protection service for Shikshantar Academy ERP.
 * 
 * Enforces:
 * 1. Read-phase concurrency control via Firestore runTransaction.
 * 2. Group-level atomicity for multi-bill payments sharing a paymentGroupId.
 * 3. Exact reversal of created advances (cancel/refund credit) and restoration of consumed advances.
 * 4. Preserves the original cash receipt in cash_ledger and creates an official cash outflow (Expense: Fee Refund).
 * 5. Official refund record creation in refund_records collection.
 * 6. Atomic audit logging inside the exact same transaction (actionType = REFUND).
 * 7. Strict database-level idempotency to prevent double-refund or double-disbursement.
 * 8. Strict prohibition against physical deletion of institutional financial vouchers.
 */

import {
  doc,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  runTransaction,
  deleteField,
  serverTimestamp,
  Firestore
} from 'firebase/firestore';
import { db } from '../firebase';
import { sanitizeForFirestore } from './firestoreSanitize';
import { formatBSDate } from './nepaliDate';

export interface ProcessRefundParams {
  transactionId: string;
  adminName: string;
  adminEmail: string;
  reason: string;
  paymentGroupId?: string;
  customDb?: Firestore;
}

export interface ProcessRefundResult {
  success: boolean;
  paymentGroupId: string;
  refundedTransactionIds: string[];
  refundRecordId: string;
  cashLedgerExpenseId: string;
  auditLogId: string;
  totalRefundAmount: number;
  billsRestoredCount: number;
  feesRestoredCount: number;
  advancesCancelledAmount: number;
  advancesRestoredAmount: number;
}

export interface DeleteTransactionParams {
  transactionId: string;
  adminName: string;
  adminEmail: string;
  reason?: string;
  customDb?: Firestore;
}

export interface DeleteTransactionResult {
  success: boolean;
  message: string;
  auditLogId?: string;
}

/**
 * Executes a full financial refund for a payment or multi-bill payment group.
 * Preserves the original transaction vouchers with status = 'REFUNDED',
 * generates a formal refund_records entry, posts an Expense outflow in cash_ledger,
 * resets fee dues and remit bills, cancels created advances, restores consumed advances,
 * and writes an audit log inside the same Firestore runTransaction.
 */
export async function processPaymentRefund(params: ProcessRefundParams): Promise<ProcessRefundResult> {
  const firestore = params.customDb || db;
  const targetTxRef = doc(firestore, 'transactions', params.transactionId);

  // ==========================================
  // 1. DISCOVERY & PRE-READ PHASE (Outside Transaction)
  // ==========================================
  const targetTxSnap = await getDoc(targetTxRef);
  if (!targetTxSnap.exists()) {
    throw new Error(`TRANSACTION_NOT_FOUND: Transaction ${params.transactionId} does not exist.`);
  }

  const targetTx = targetTxSnap.data() as any;

  // Pre-check idempotency
  if (targetTx.status === 'REFUNDED') {
    throw new Error(`TRANSACTION_ALREADY_REFUNDED: Transaction ${params.transactionId} is already in status REFUNDED.`);
  }
  if (['CANCELLED', 'VOID', 'VOIDED'].includes(targetTx.status)) {
    throw new Error(`TRANSACTION_NOT_REFUNDABLE: Transaction ${params.transactionId} is in status ${targetTx.status} and cannot be refunded.`);
  }

  const paymentGroupId = targetTx.paymentGroupId || params.paymentGroupId || null;
  const receiptNo = String(targetTx.receipt || targetTx.receiptNo || '').trim();

  // 2. Discover all transactions belonging to this physical payment group
  const txDocMap = new Map<string, any>();
  txDocMap.set(params.transactionId, targetTx);

  if (paymentGroupId) {
    const q = query(collection(firestore, 'transactions'), where('paymentGroupId', '==', paymentGroupId));
    const snap = await getDocs(q);
    snap.forEach(d => txDocMap.set(d.id, d.data()));
  } else if (receiptNo) {
    const q = query(collection(firestore, 'transactions'), where('receipt', '==', receiptNo));
    const snap = await getDocs(q);
    snap.forEach(d => txDocMap.set(d.id, d.data()));
  }

  const allTxIds = Array.from(txDocMap.keys());
  const allTxList = Array.from(txDocMap.values());

  // Check if any sibling transaction is already REFUNDED
  for (const [id, tData] of txDocMap.entries()) {
    if (tData.status === 'REFUNDED') {
      throw new Error(`TRANSACTION_ALREADY_REFUNDED: Sibling transaction ${id} in payment group is already REFUNDED.`);
    }
  }

  // 3. Discover all linked studentFees
  const feeDocRefs = new Map<string, any>();
  for (const txId of allTxIds) {
    const feeQ = query(collection(firestore, 'studentFees'), where('transactionId', '==', txId));
    const feeSnap = await getDocs(feeQ);
    feeSnap.forEach(d => feeDocRefs.set(d.id, d.ref));
  }

  for (const tx of allTxList) {
    if (tx.allocations && Array.isArray(tx.allocations)) {
      tx.allocations.forEach((alloc: any) => {
        if (alloc.feeId) {
          feeDocRefs.set(alloc.feeId, doc(firestore, 'studentFees', alloc.feeId));
        }
      });
    }
    if (tx.months && Array.isArray(tx.months) && tx.studentId) {
      tx.months.forEach((m: string) => {
        const id = `${tx.studentId}_${m}`;
        feeDocRefs.set(id, doc(firestore, 'studentFees', id));
      });
    }
  }

  // 4. Discover all linked remitBills
  const remitDocRefs = new Map<string, any>();
  for (const tx of allTxList) {
    if (tx.remitBillId) {
      remitDocRefs.set(tx.remitBillId, doc(firestore, 'remitBills', tx.remitBillId));
    }
    const rNo = tx.receipt || tx.receiptNo;
    if (rNo) {
      const remitQ = query(collection(firestore, 'remitBills'), where('transactionId', '==', rNo));
      const remitSnap = await getDocs(remitQ);
      remitSnap.forEach(d => remitDocRefs.set(d.id, d.ref));
    }
  }

  // 5. Discover all advances CREATED by this payment (to be cancelled/refunded)
  const advCreatedRefs = new Map<string, any>();
  for (const txId of allTxIds) {
    const advQ = query(collection(firestore, 'student_advances'), where('sourceTransactionId', '==', txId));
    const advSnap = await getDocs(advQ);
    advSnap.forEach(d => advCreatedRefs.set(d.id, d.ref));
  }
  if (paymentGroupId) {
    const advGroupQ = query(collection(firestore, 'student_advances'), where('paymentGroupId', '==', paymentGroupId));
    const advGroupSnap = await getDocs(advGroupQ);
    advGroupSnap.forEach(d => advCreatedRefs.set(d.id, d.ref));
  }

  // 6. Discover all advances CONSUMED by this payment (to be restored)
  const advConsumedRefs = new Map<string, { ref: any; amountToRestore: number }>();
  for (const tx of allTxList) {
    if (tx.advanceConsumed && Number(tx.advanceConsumed) > 0) {
      if (tx.consumedAdvanceId) {
        advConsumedRefs.set(tx.consumedAdvanceId, {
          ref: doc(firestore, 'student_advances', tx.consumedAdvanceId),
          amountToRestore: Number(tx.advanceConsumed)
        });
      }
    }
    if (tx.allocations && Array.isArray(tx.allocations)) {
      tx.allocations.forEach((alloc: any) => {
        if (alloc.fromAdvance && alloc.advanceId && Number(alloc.amount) > 0) {
          const current = advConsumedRefs.get(alloc.advanceId)?.amountToRestore || 0;
          advConsumedRefs.set(alloc.advanceId, {
            ref: doc(firestore, 'student_advances', alloc.advanceId),
            amountToRestore: current + Number(alloc.amount)
          });
        }
      });
    }
  }

  // 7. Resolve Primary Student Document Ref
  const primaryStudentId = targetTx.studentId || allTxList.find(x => x.studentId)?.studentId || null;
  const studentUserRef = primaryStudentId ? doc(firestore, 'users', primaryStudentId) : null;

  // Pre-allocate document references for atomic writes
  const refundRecordRef = doc(collection(firestore, 'refund_records'));
  const cashExpenseRef = doc(collection(firestore, 'cash_ledger'));
  const auditLogRef = doc(collection(firestore, 'ledger_audit_logs'));

  // ==========================================
  // 2. ATOMIC TRANSACTION (runTransaction)
  // ==========================================
  return await runTransaction(firestore, async (t) => {
    // ----------------------------------------------------
    // READ PHASE: Every document MUST be read before any write
    // ----------------------------------------------------
    const readTxMap = new Map<string, any>();
    for (const txId of allTxIds) {
      const ref = doc(firestore, 'transactions', txId);
      const snap = await t.get(ref);
      if (!snap.exists()) {
        throw new Error(`TRANSACTION_NOT_FOUND: Transaction ${txId} was removed during concurrent modification.`);
      }
      const data = snap.data();
      if (data.status === 'REFUNDED') {
        throw new Error(`IDEMPOTENCY_ABORT: Transaction ${txId} is already REFUNDED. Refund aborted.`);
      }
      if (['CANCELLED', 'VOID', 'VOIDED'].includes(data.status)) {
        throw new Error(`IDEMPOTENCY_ABORT: Transaction ${txId} is ${data.status}. Refund aborted.`);
      }
      readTxMap.set(txId, data);
    }

    // B. Read all fees
    const readFeeMap = new Map<string, any>();
    for (const [feeId, feeRef] of feeDocRefs.entries()) {
      const snap = await t.get(feeRef);
      if (snap.exists()) {
        readFeeMap.set(feeId, snap.data());
      }
    }

    // C. Read all remit bills
    const readRemitMap = new Map<string, any>();
    for (const [billId, billRef] of remitDocRefs.entries()) {
      const snap = await t.get(billRef);
      if (snap.exists()) {
        readRemitMap.set(billId, snap.data());
      }
    }

    // D. Read all created advances
    const readAdvCreatedMap = new Map<string, any>();
    let totalAdvanceCreatedToReverse = 0;
    for (const [advId, advRef] of advCreatedRefs.entries()) {
      const snap = await t.get(advRef);
      if (snap.exists()) {
        const data = snap.data() as any;
        if (data.status === 'ACTIVE') {
          totalAdvanceCreatedToReverse += Number(data.amount || data.remainingCredit || 0);
          readAdvCreatedMap.set(advId, data);
        }
      }
    }

    // E. Read all consumed advances
    const readAdvConsumedMap = new Map<string, { currentRemaining: number; toRestore: number }>();
    let totalAdvanceConsumedToRestore = 0;
    for (const [advId, { ref, amountToRestore }] of advConsumedRefs.entries()) {
      const snap = await t.get(ref);
      if (snap.exists()) {
        const currentRem = Number((snap.data() as any)?.remainingCredit || 0);
        totalAdvanceConsumedToRestore += amountToRestore;
        readAdvConsumedMap.set(advId, { currentRemaining: currentRem, toRestore: amountToRestore });
      }
    }

    // F. Read student user document for advanceBalance
    let currentStudentAdvanceBalance = 0;
    if (studentUserRef) {
      const userSnap = await t.get(studentUserRef);
      if (userSnap.exists()) {
        currentStudentAdvanceBalance = Number(userSnap.data().advanceBalance || 0);
      }
    }

    // ----------------------------------------------------
    // WRITE PHASE: Atomic updates across all entities
    // ----------------------------------------------------
    let totalCashToRefund = 0;

    // 1. Update all transactions in the group to REFUNDED
    for (const [txId, txData] of readTxMap.entries()) {
      totalCashToRefund += Number(txData.amount || 0);
      const ref = doc(firestore, 'transactions', txId);
      t.update(ref, sanitizeForFirestore({
        status: 'REFUNDED',
        refundedAt: serverTimestamp(),
        refundedBy: params.adminName,
        refundedByEmail: params.adminEmail,
        refundReason: params.reason || 'Administrative refund processed with password verification',
        refundRecordId: refundRecordRef.id
      }));
    }

    // 2. Proportional Fee Reversion (Reverse ONLY allocations belonging to this refunded transaction group)
    let feesRestoredCount = 0;
    for (const [feeId, feeData] of readFeeMap.entries()) {
      const ref = feeDocRefs.get(feeId);
      if (ref) {
        feesRestoredCount++;
        // Calculate exact allocation applied to this fee by the refunded transactions
        let allocatedAmountToReverse = 0;
        for (const [txId, txData] of readTxMap.entries()) {
          if (txData.allocations && Array.isArray(txData.allocations)) {
            txData.allocations.forEach((alloc: any) => {
              if (alloc.feeId === feeId || alloc.id === feeId) {
                allocatedAmountToReverse += Number(alloc.amount || 0);
              }
            });
          } else if (feeData.transactionId === txId || feeData.receiptNo === txData.receipt || feeData.receiptNo === txData.receiptNo) {
            allocatedAmountToReverse += Number(feeData.paidAmount || txData.amountApplied || txData.amount || 0);
          }
        }
        if (allocatedAmountToReverse === 0 && (feeData.transactionId || feeData.receiptNo)) {
          allocatedAmountToReverse = Number(feeData.paidAmount || 0);
        }

        const prevPaid = Number(feeData.paidAmount || 0);
        const newPaid = Math.max(0, prevPaid - allocatedAmountToReverse);
        const totalFee = Number(feeData.totalFee || feeData.amount || 0);
        const newDue = Math.max(0, totalFee - newPaid);
        const newStatus = newPaid === 0 ? 'due' : (newPaid >= totalFee ? 'paid' : 'partial');

        if (newPaid === 0) {
          t.update(ref, sanitizeForFirestore({
            status: 'due',
            paidAmount: 0,
            dueAmount: totalFee,
            paidAt: deleteField(),
            receiptNo: deleteField(),
            transactionId: deleteField(),
            paymentMethod: deleteField(),
            collectorId: deleteField(),
            collectorName: deleteField(),
            refundedAt: serverTimestamp(),
            refundReason: params.reason
          }));
        } else {
          t.update(ref, sanitizeForFirestore({
            status: newStatus,
            paidAmount: newPaid,
            dueAmount: newDue,
            refundedAt: serverTimestamp(),
            refundReason: params.reason
          }));
        }
      }
    }

    // 3. Proportional Remit Bill Reversion (Reverse ONLY allocations belonging to this refunded transaction group)
    let billsRestoredCount = 0;
    for (const [billId, billData] of readRemitMap.entries()) {
      const ref = remitDocRefs.get(billId);
      if (ref) {
        billsRestoredCount++;
        let allocatedBillAmountToReverse = 0;
        for (const [txId, txData] of readTxMap.entries()) {
          if (txData.remitBillId === billId) {
            allocatedBillAmountToReverse += Number(txData.amountApplied || txData.amount || 0);
          } else if (txData.allocations && Array.isArray(txData.allocations)) {
            txData.allocations.forEach((alloc: any) => {
              if (alloc.remitBillId === billId || alloc.billId === billId) {
                allocatedBillAmountToReverse += Number(alloc.amount || 0);
              }
            });
          } else if (billData.transactionId === txId || billData.transactionId === txData.receipt || billData.transactionId === txData.receiptNo) {
            allocatedBillAmountToReverse += Number(billData.paidAmount || txData.amountApplied || txData.amount || 0);
          }
        }
        if (allocatedBillAmountToReverse === 0 && billData.transactionId) {
          allocatedBillAmountToReverse = Number(billData.paidAmount || 0);
        }

        const prevBillPaid = Number(billData.paidAmount || 0);
        const newBillPaid = Math.max(0, prevBillPaid - allocatedBillAmountToReverse);
        const totalBillAmount = Number(billData.totalAmount || billData.amount || 0);
        const newBillDue = Math.max(0, totalBillAmount - newBillPaid);
        const newBillStatus = newBillPaid === 0 ? 'pending' : (newBillPaid >= totalBillAmount ? 'paid' : 'partial');

        if (newBillPaid === 0) {
          t.update(ref, sanitizeForFirestore({
            status: 'pending',
            paidAmount: 0,
            dueAmount: totalBillAmount,
            paidAt: deleteField(),
            transactionId: deleteField(),
            updatedAt: serverTimestamp(),
            refundedAt: serverTimestamp()
          }));
        } else {
          t.update(ref, sanitizeForFirestore({
            status: newBillStatus,
            paidAmount: newBillPaid,
            dueAmount: newBillDue,
            updatedAt: serverTimestamp(),
            refundedAt: serverTimestamp()
          }));
        }
      }
    }

    // 4. Cancel/Refund created advances
    for (const [advId] of readAdvCreatedMap.entries()) {
      const ref = advCreatedRefs.get(advId);
      if (ref) {
        t.update(ref, sanitizeForFirestore({
          status: 'REFUNDED',
          remainingCredit: 0,
          refundedAt: serverTimestamp(),
          refundReason: `Refunded to guardian for receipt ${receiptNo}`,
          refundRecordId: refundRecordRef.id
        }));
      }
    }

    // 5. Restore consumed advances
    for (const [advId, { currentRemaining, toRestore }] of readAdvConsumedMap.entries()) {
      const item = advConsumedRefs.get(advId);
      if (item) {
        t.update(item.ref, sanitizeForFirestore({
          remainingCredit: currentRemaining + toRestore,
          updatedAt: serverTimestamp()
        }));
      }
    }

    // 6. Update student user advance balance
    const netAdvanceDelta = totalAdvanceConsumedToRestore - totalAdvanceCreatedToReverse;
    if (studentUserRef && netAdvanceDelta !== 0) {
      const newAdvBalance = Math.max(0, currentStudentAdvanceBalance + netAdvanceDelta);
      t.set(studentUserRef, sanitizeForFirestore({
        advanceBalance: newAdvBalance,
        updatedAt: serverTimestamp()
      }), { merge: true });
    }

    const resolvedPaymentGroup = paymentGroupId || `PAY_${params.transactionId}`;
    const now = new Date();
    const bsDate = formatBSDate(now);

    // 7. Create official refund_records document
    const refundDocData = {
      id: refundRecordRef.id,
      studentId: primaryStudentId || '',
      studentName: targetTx.studentName || 'Student',
      class: targetTx.class || '-',
      amount: totalCashToRefund,
      sourceTransactionId: params.transactionId,
      transactionIds: allTxIds,
      paymentGroupId: resolvedPaymentGroup,
      receiptNo: receiptNo || params.transactionId,
      type: 'PAYMENT_REFUND',
      status: 'REFUNDED_TO_GUARDIAN',
      approvedBy: params.adminName,
      adminEmail: params.adminEmail,
      reason: params.reason || 'Administrative refund processed with password verification',
      dateBS: bsDate,
      timestamp: serverTimestamp()
    };
    t.set(refundRecordRef, sanitizeForFirestore(refundDocData));

    // 8. Create cash_ledger OUTFLOW entry (Expense: Fee Refund)
    // Note: The original cash inflow remains intact in cash_ledger; this records the actual cash returned
    const cashOutflowData = {
      id: cashExpenseRef.id,
      type: 'Expense',
      date: bsDate,
      amount: totalCashToRefund,
      category: 'Fee Refund',
      remarks: `Fee Refund for Receipt #${receiptNo || params.transactionId} (${targetTx.studentName || 'Student'}) | Reason: ${params.reason} | Approved by: ${params.adminName}`,
      recordedBy: params.adminName,
      transactionId: params.transactionId,
      sourceTransactionId: params.transactionId,
      paymentGroupId: resolvedPaymentGroup,
      receiptNo: receiptNo || params.transactionId,
      refundRecordId: refundRecordRef.id,
      timestamp: serverTimestamp()
    };
    t.set(cashExpenseRef, sanitizeForFirestore(cashOutflowData));

    // 9. Create ledger_audit_logs document atomically inside the same transaction
    const auditData = {
      id: auditLogRef.id,
      transactionId: params.transactionId,
      paymentGroupId: resolvedPaymentGroup,
      receipt: receiptNo || params.transactionId,
      studentId: primaryStudentId || '',
      studentName: targetTx.studentName || 'Student',
      studentClass: targetTx.class || '-',
      actionType: 'REFUND',
      amountReversed: totalCashToRefund,
      refundAmount: totalCashToRefund,
      billsRestoredCount,
      feesRestoredCount,
      advancesCancelledAmount: totalAdvanceCreatedToReverse,
      advancesRestoredAmount: totalAdvanceConsumedToRestore,
      refundRecordId: refundRecordRef.id,
      cashLedgerExpenseId: cashExpenseRef.id,
      previousValue: `Status: ${targetTx.status || 'SUCCESS'} | Amount: NRs. ${totalCashToRefund.toLocaleString()} | Group: ${resolvedPaymentGroup} | TxCount: ${allTxIds.length}`,
      newValue: `Status: REFUNDED | Cash Outflow: NRs. ${totalCashToRefund.toLocaleString()} in cash_ledger | Refund Record: ${refundRecordRef.id} | Fees restored: ${feesRestoredCount} | Bills restored: ${billsRestoredCount}`,
      reason: params.reason || 'Administrative refund processed with password verification',
      adminName: params.adminName,
      adminEmail: params.adminEmail,
      timestamp: serverTimestamp()
    };
    t.set(auditLogRef, sanitizeForFirestore(auditData));

    return {
      success: true,
      paymentGroupId: resolvedPaymentGroup,
      refundedTransactionIds: allTxIds,
      refundRecordId: refundRecordRef.id,
      cashLedgerExpenseId: cashExpenseRef.id,
      auditLogId: auditLogRef.id,
      totalRefundAmount: totalCashToRefund,
      billsRestoredCount,
      feesRestoredCount,
      advancesCancelledAmount: totalAdvanceCreatedToReverse,
      advancesRestoredAmount: totalAdvanceConsumedToRestore
    };
  });
}

/**
 * Validates and executes safe system transaction deletion.
 * STRICT FINANCIAL RULE: Real institutional financial transactions can NEVER be physically deleted.
 * Physical deletion is only permitted for test/sandbox fixtures to maintain audit compliance.
 */
export async function deleteSystemTransactionSafe(params: DeleteTransactionParams): Promise<DeleteTransactionResult> {
  const firestore = params.customDb || db;
  const txRef = doc(firestore, 'transactions', params.transactionId);

  return await runTransaction(firestore, async (t) => {
    const snap = await t.get(txRef);
    if (!snap.exists()) {
      throw new Error(`TRANSACTION_NOT_FOUND: Transaction ${params.transactionId} does not exist.`);
    }

    const tx = snap.data() as any;

    // Check if the transaction has any test / sandbox markers
    const isTestOrSandbox = Boolean(
      tx.isTest ||
      tx.isSandbox ||
      tx.environment === 'test' ||
      tx.isTestTransaction ||
      params.transactionId.startsWith('TEST_') ||
      tx.studentId?.startsWith('TEST_') ||
      (typeof tx.remarks === 'string' && tx.remarks.includes('[TEST_FIXTURE]')) ||
      (typeof tx.notes === 'string' && tx.notes.includes('[TEST_FIXTURE]'))
    );

    if (!isTestOrSandbox) {
      // STRICT SAFETY INVARIANT: Real institutional financial vouchers must NEVER be physically destroyed
      throw new Error(
        `PROHIBITED_FINANCIAL_DELETION: Physical deletion of institutional financial vouchers is strictly prohibited. ` +
        `Transaction ${params.transactionId} is a permanent financial record. To reverse charges, use 'Undo' (within 3h operator window) ` +
        `or 'Refund' to preserve immutable accounting ledgers and legal auditability.`
      );
    }

    // For verified test/sandbox transactions only:
    t.delete(txRef);

    const auditRef = doc(collection(firestore, 'ledger_audit_logs'));
    t.set(auditRef, sanitizeForFirestore({
      id: auditRef.id,
      transactionId: params.transactionId,
      receipt: tx.receipt || params.transactionId,
      studentId: tx.studentId || '',
      studentName: tx.studentName || 'Test Student',
      actionType: 'TEST_TRANSACTION_PURGED',
      previousValue: `Test fixture ${params.transactionId} purged`,
      newValue: 'DELETED',
      reason: params.reason || 'Sandbox test cleanup',
      adminName: params.adminName,
      adminEmail: params.adminEmail,
      timestamp: serverTimestamp()
    }));

    return {
      success: true,
      message: `Sandbox test transaction ${params.transactionId} purged successfully.`,
      auditLogId: auditRef.id
    };
  });
}
