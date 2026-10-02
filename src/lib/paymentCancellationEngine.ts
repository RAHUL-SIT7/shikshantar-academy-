/**
 * PAYMENT CANCELLATION ENGINE
 * 
 * Formal, concurrency-safe, transactional payment cancellation engine for Shikshantar Academy ERP.
 * Enforces:
 * 1. Read-phase concurrency control via Firestore runTransaction.
 * 2. Group-level atomicity for multi-bill payments sharing a paymentGroupId or receipt.
 * 3. Exact reversal of created advances and exact restoration of consumed advances.
 * 4. Exact cash-ledger entry removal linked to transactionId or paymentGroupId.
 * 5. Atomic audit logging inside the exact same transaction.
 * 6. Strict idempotency to prevent double-reversal or double-decrement.
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
import { db, auth } from '../firebase';
import { sanitizeForFirestore } from './firestoreSanitize';
import { formatBSDate } from './nepaliDate';
import { getAuthoritativeActor } from './auditLogger';

export interface CancelPaymentParams {
  transactionId: string;
  adminName: string;
  adminEmail: string;
  reason?: string;
  paymentGroupId?: string;
  customDb?: Firestore;
}

export interface CancelPaymentResult {
  success: boolean;
  paymentGroupId: string;
  cancelledTransactionIds: string[];
  totalAmountReversed: number;
  billsRestoredCount: number;
  feesRestoredCount: number;
  advancesReversedAmount: number;
  advancesRestoredAmount: number;
  auditLogId: string;
}

/**
 * Cancels a payment transaction and all linked artifacts atomically.
 * If the transaction belongs to a multi-bill payment group, ALL transactions
 * in that group are cancelled atomically (Option A: Full Group Reversal).
 */
export async function cancelPaymentTransaction(params: CancelPaymentParams): Promise<CancelPaymentResult> {
  const firestore = params.customDb || db;
  const targetTxRef = doc(firestore, 'transactions', params.transactionId);

  // 1. Initial pre-read to resolve the payment group and discover affected document references
  const targetTxSnap = await getDoc(targetTxRef);
  if (!targetTxSnap.exists()) {
    throw new Error(`TRANSACTION_NOT_FOUND: Transaction ${params.transactionId} does not exist.`);
  }

  const targetTx = targetTxSnap.data() as any;

  // Idempotency check 1
  if (['CANCELLED', 'REFUNDED', 'VOID', 'VOIDED'].includes(targetTx.status)) {
    throw new Error(`TRANSACTION_ALREADY_CANCELLED: Transaction ${params.transactionId} is already in status ${targetTx.status}.`);
  }

  const paymentGroupId = targetTx.paymentGroupId || params.paymentGroupId || null;
  const receiptNo = String(targetTx.receipt || targetTx.receiptNo || '').trim();

  // 2. Discover all transactions belonging to this payment group
  const txDocMap = new Map<string, any>();
  txDocMap.set(params.transactionId, targetTx);

  if (paymentGroupId) {
    const q = query(collection(firestore, 'transactions'), where('paymentGroupId', '==', paymentGroupId));
    const snap = await getDocs(q);
    snap.forEach(d => txDocMap.set(d.id, d.data()));
  } else if (receiptNo) {
    // Legacy fallback: locate transactions sharing the exact same receipt or receipt-prefix
    const q = query(collection(firestore, 'transactions'), where('receipt', '==', receiptNo));
    const snap = await getDocs(q);
    snap.forEach(d => txDocMap.set(d.id, d.data()));
  }

  const allTxIds = Array.from(txDocMap.keys());
  const allTxList = Array.from(txDocMap.values());

  // 3. Discover all linked studentFees
  const feeDocRefs = new Map<string, any>();
  for (const txId of allTxIds) {
    const feeQ = query(collection(firestore, 'studentFees'), where('transactionId', '==', txId));
    const feeSnap = await getDocs(feeQ);
    feeSnap.forEach(d => feeDocRefs.set(d.id, d.ref));
  }

  // Also check allocations and months for each transaction
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

  // 5. Discover all advances CREATED by this payment (to be reversed)
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
  for (const tx of allTxList) {
    if (tx.advanceDocId) {
      advCreatedRefs.set(tx.advanceDocId, doc(firestore, 'student_advances', tx.advanceDocId));
    }
  }

  // 6. Discover all advances CONSUMED by this payment (to be restored)
  const advConsumedRefs = new Map<string, { ref: any; amountToRestore: number }>();
  for (const tx of allTxList) {
    if (tx.consumedAdvances && Array.isArray(tx.consumedAdvances)) {
      tx.consumedAdvances.forEach((ca: any) => {
        const aId = ca.advanceId || ca.id;
        const amt = Number(ca.amount || ca.consumedAmount || 0);
        if (aId && amt > 0) {
          const prev = advConsumedRefs.get(aId);
          advConsumedRefs.set(aId, {
            ref: doc(firestore, 'student_advances', aId),
            amountToRestore: (prev?.amountToRestore || 0) + amt
          });
        }
      });
    }
    if (tx.consumedAdvanceDocId && Number(tx.advanceUsed || 0) > 0) {
      const aId = tx.consumedAdvanceDocId;
      const amt = Number(tx.advanceUsed || 0);
      const prev = advConsumedRefs.get(aId);
      advConsumedRefs.set(aId, {
        ref: doc(firestore, 'student_advances', aId),
        amountToRestore: (prev?.amountToRestore || 0) + amt
      });
    }
  }

  // 7. Student user document for advance balance
  const primaryStudentId = targetTx.studentId || allTxList.find(t => t.studentId)?.studentId || '';
  const studentUserRef = primaryStudentId ? doc(firestore, 'users', primaryStudentId) : null;

  // 8. Discover all cash_ledger entries to delete
  const cashLedgerRefs = new Map<string, any>();
  const allReceipts = new Set<string>();
  allTxList.forEach(t => {
    if (t.receipt) allReceipts.add(t.receipt);
    if (t.receiptNo) allReceipts.add(t.receiptNo);
  });
  if (receiptNo) allReceipts.add(receiptNo);

  const cashQuery = query(collection(firestore, 'cash_ledger'));
  const cashSnap = await getDocs(cashQuery);
  cashSnap.forEach(d => {
    const data = d.data();
    const matchesGroup = paymentGroupId && data.paymentGroupId === paymentGroupId;
    const matchesTxId = allTxIds.includes(data.transactionId) || allTxIds.includes(data.sourceTransactionId);
    const matchesReceipt = allReceipts.has(data.receiptNo) || allReceipts.has(data.relatedTransactionId);
    
    // Exact token regex fallback on remarks
    let matchesRemarks = false;
    if (data.category === 'Fee Collection' && data.remarks) {
      for (const r of allReceipts) {
        const escaped = r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const tokenRegex = new RegExp(`(^|[^a-zA-Z0-9_-])${escaped}([^a-zA-Z0-9_-]|$)`);
        if (tokenRegex.test(String(data.remarks))) {
          matchesRemarks = true;
          break;
        }
      }
    }

    if (matchesGroup || matchesTxId || matchesReceipt || matchesRemarks) {
      cashLedgerRefs.set(d.id, d.ref);
    }
  });

  const resolvedPaymentGroup = paymentGroupId || `PAY_${params.transactionId}`;

  // Security & Authority: Fail closed if authoritative actor cannot be resolved from Firestore
  const authoritativeActor = await getAuthoritativeActor();

  // 9. Pre-allocate deterministic audit log references
  const auditLogRef = doc(firestore, 'ledger_audit_logs', resolvedPaymentGroup);
  const systemAuditLogRef = doc(firestore, 'audit_logs', resolvedPaymentGroup);

  // 10. Execute the entire cancellation inside runTransaction for strict concurrency control
  return await runTransaction(firestore, async (t) => {
    // ==========================================
    // TRANSACTION READ PHASE (All reads MUST happen before any writes)
    // ==========================================

    // A. Read all transactions in the group
    const readTxMap = new Map<string, any>();
    for (const txId of allTxIds) {
      const ref = doc(firestore, 'transactions', txId);
      const snap = await t.get(ref);
      if (!snap.exists()) {
        throw new Error(`TRANSACTION_NOT_FOUND: Transaction ${txId} was removed.`);
      }
      const data = snap.data();
      // Concurrency / Idempotency check inside transaction
      if (['CANCELLED', 'REFUNDED', 'VOID', 'VOIDED'].includes(data.status)) {
        throw new Error(`IDEMPOTENCY_ABORT: Transaction ${txId} is already ${data.status}. Cancellation aborted.`);
      }
      readTxMap.set(txId, data);
    }

    // B. Read all affected student fees
    const readFeeMap = new Map<string, any>();
    for (const [feeId, feeRef] of feeDocRefs.entries()) {
      const snap = await t.get(feeRef);
      if (snap.exists()) {
        readFeeMap.set(feeId, snap.data());
      }
    }

    // C. Read all affected remit bills
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

    // G. Verify cash_ledger documents still exist
    const validCashRefs: any[] = [];
    for (const [cId, cRef] of cashLedgerRefs.entries()) {
      const snap = await t.get(cRef);
      if (snap.exists()) {
        validCashRefs.push(cRef);
      }
    }

    // ==========================================
    // TRANSACTION WRITE PHASE (All writes happen atomically)
    // ==========================================

    let totalAmountReversed = 0;

    // 1. Cancel all transactions in the group
    for (const [txId, txData] of readTxMap.entries()) {
      totalAmountReversed += Number(txData.amount || 0);
      const ref = doc(firestore, 'transactions', txId);
      t.update(ref, sanitizeForFirestore({
        status: 'CANCELLED',
        cancelledAt: serverTimestamp(),
        cancelledBy: params.adminName,
        cancelledByEmail: params.adminEmail,
        cancelReason: params.reason || 'Instant payment undo within operator window'
      }));
    }

    // 2. Proportional Fee Reversion (Reverse ONLY allocations belonging to this cancelled transaction group)
    let feesRestoredCount = 0;
    for (const [feeId, feeData] of readFeeMap.entries()) {
      const ref = feeDocRefs.get(feeId);
      if (ref) {
        feesRestoredCount++;
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
            collectorName: deleteField()
          }));
        } else {
          t.update(ref, sanitizeForFirestore({
            status: newStatus,
            paidAmount: newPaid,
            dueAmount: newDue
          }));
        }
      }
    }

    // 3. Proportional Remit Bill Reversion (Reverse ONLY allocations belonging to this cancelled transaction group)
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
            updatedAt: serverTimestamp()
          }));
        } else {
          t.update(ref, sanitizeForFirestore({
            status: newBillStatus,
            paidAmount: newBillPaid,
            dueAmount: newBillDue,
            updatedAt: serverTimestamp()
          }));
        }
      }
    }

    // 4. Reverse created advances
    for (const [advId] of readAdvCreatedMap.entries()) {
      const ref = advCreatedRefs.get(advId);
      if (ref) {
        t.update(ref, sanitizeForFirestore({
          status: 'CANCELLED',
          remainingCredit: 0,
          cancelledAt: serverTimestamp(),
          cancelReason: `Reversed via payment cancellation for receipt ${receiptNo}`
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

    // 7. Delete linked cash_ledger entries
    for (const cRef of validCashRefs) {
      t.delete(cRef);
    }

    // 8. Write Audit Logs atomically inside the transaction
    const now = new Date();
    const bsDate = formatBSDate(now);
    const auditData = {
      id: auditLogRef.id,
      auditLogId: auditLogRef.id,
      operationId: resolvedPaymentGroup,
      correlationId: resolvedPaymentGroup,
      transactionId: params.transactionId,
      paymentGroupId: resolvedPaymentGroup,
      receipt: receiptNo || params.transactionId,
      receiptNo: receiptNo || params.transactionId,
      studentId: primaryStudentId || '',
      studentUid: primaryStudentId || '',
      studentName: targetTx.studentName || 'Student',
      studentClass: targetTx.class || '-',
      category: 'financial',
      action: 'PAYMENT_UNDONE',
      actionType: 'PAYMENT_UNDONE',
      targetType: 'transaction',
      targetId: params.transactionId,
      amountReversed: totalAmountReversed,
      billsRestoredCount,
      feesRestoredCount,
      advancesReversedAmount: totalAdvanceCreatedToReverse,
      advancesRestoredAmount: totalAdvanceConsumedToRestore,
      beforeState: {
        status: targetTx.status || 'SUCCESS',
        amount: totalAmountReversed,
        paymentGroupId: resolvedPaymentGroup,
        transactionCount: allTxIds.length
      },
      afterState: {
        status: 'CANCELLED',
        feesRestoredCount,
        billsRestoredCount,
        advancesReversedAmount: totalAdvanceCreatedToReverse,
        advancesRestoredAmount: totalAdvanceConsumedToRestore
      },
      previousValue: `Status: ACTIVE | Amount: NRs. ${totalAmountReversed.toLocaleString()} | Group: ${resolvedPaymentGroup} | TxCount: ${allTxIds.length}`,
      newValue: `Status: CANCELLED (Atomic Payment Undo) | Fees restored: ${feesRestoredCount} | Bills restored: ${billsRestoredCount}`,
      reason: params.reason || 'Instant payment undo within operator window with concurrency protection',
      result: 'SUCCESS',
      actorUid: authoritativeActor.actorUid,
      adminUid: authoritativeActor.adminUid,
      actorName: authoritativeActor.actorName || params.adminName,
      adminName: authoritativeActor.adminName || params.adminName,
      actorRole: authoritativeActor.actorRole || 'admin',
      adminEmail: authoritativeActor.adminEmail || params.adminEmail,
      adminTier: authoritativeActor.adminTier || 'primary',
      date: bsDate,
      dateBS: bsDate,
      timestampStr: `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp()
    };
    t.set(auditLogRef, sanitizeForFirestore(auditData));
    t.set(systemAuditLogRef, sanitizeForFirestore(auditData));

    return {
      success: true,
      paymentGroupId: resolvedPaymentGroup,
      cancelledTransactionIds: allTxIds,
      totalAmountReversed,
      billsRestoredCount,
      feesRestoredCount,
      advancesReversedAmount: totalAdvanceCreatedToReverse,
      advancesRestoredAmount: totalAdvanceConsumedToRestore,
      auditLogId: auditLogRef.id
    };
  });
}
