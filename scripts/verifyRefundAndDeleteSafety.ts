/**
 * TARGETED FINANCIAL VERIFICATION SUITE:
 * ADMIN REFUND & TRANSACTION DELETE SAFETY
 * 
 * Required Tests:
 * TEST R1: Normal single-bill refund
 * TEST R2: Multi-bill payment refund (group atomicity)
 * TEST R3: Refund of payment with created advance (no orphan advance)
 * TEST R4: Double-refund idempotency
 * TEST R5: Concurrent race protection
 * TEST D1: Attempt destructive delete on valid institutional payment (prohibited/rejected)
 * TEST D2: Sandbox-only cleanup behavior (verified test-only guard protects production records)
 */

import fs from 'fs';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  collection,
  where,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { processPaymentRefund, deleteSystemTransactionSafe } from '../src/lib/paymentRefundEngine';
import { executeCashFeePayment } from '../src/lib/cashPaymentEngine';

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(id: string, name: string, passed: boolean, details: string) {
  results.push({ id, name, passed, details });
  console.log(`[TEST ${id}] ${passed ? '✅ PASS' : '❌ FAIL'}: ${name}`);
  if (!passed) {
    console.error(`       Details: ${details}`);
  }
}

async function main() {
  console.log('==============================================================================');
  console.log('STARTING TARGETED FINANCIAL ACTION REMEDIATION SUITE (R1-R5, D1-D2)');
  console.log('==============================================================================\n');

  const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
  const dbName = cfg.firestoreDatabaseId;

  const app = getApps().length === 0 ? initializeApp(cfg) : getApp();
  const auth = getAuth(app);

  try {
    await signInWithEmailAndPassword(auth, 'admin_test_integration@shikshantar.edu.np', 'AdminTest@12345');
    console.log('Authenticated as admin_test_integration successfully.\n');
  } catch (e: any) {
    console.warn('Could not authenticate:', e.message);
  }

  const firestore = dbName ? getFirestore(app, dbName) : getFirestore(app);

  const cleanupDocRefs: any[] = [];
  const markCleanup = (ref: any) => {
    if (ref && ref.path && (
      ref.path.includes('ledger_audit_logs') || 
      ref.path.includes('refund_records') || 
      ref.path.includes('cash_ledger')
    )) {
      return; // Protected immutable collections in firestore.rules
    }
    cleanupDocRefs.push(ref);
  };

  try {
    // ============================================================================
    // TEST R1: Normal single-bill refund
    // ============================================================================
    console.log('\n--- TEST R1: Normal single-bill refund ---');
    const r1TxId = `TEST_REFUND_R1_TX_${Date.now()}`;
    const r1FeeId = `TEST_REFUND_R1_FEE_${Date.now()}`;
    const r1Receipt = `REC_R1_${Date.now()}`;
    const r1StudentId = `TEST_STU_R1_${Date.now()}`;

    const r1TxRef = doc(firestore, 'transactions', r1TxId);
    const r1FeeRef = doc(firestore, 'studentFees', r1FeeId);
    const r1CashInflowRef = doc(firestore, 'cash_ledger', `CASH_IN_${r1TxId}`);
    markCleanup(r1TxRef);
    markCleanup(r1FeeRef);
    markCleanup(r1CashInflowRef);

    await setDoc(r1TxRef, {
      id: r1TxId,
      receipt: r1Receipt,
      studentId: r1StudentId,
      studentName: 'Test Student R1',
      class: 'Class 5',
      amount: 2500,
      status: 'SUCCESS',
      allocations: [{ feeId: r1FeeId, amount: 2500 }],
      createdAt: serverTimestamp(),
      isTest: true
    });

    await setDoc(r1FeeRef, {
      id: r1FeeId,
      studentId: r1StudentId,
      totalFee: 2500,
      status: 'paid',
      paidAmount: 2500,
      dueAmount: 0,
      transactionId: r1TxId,
      receiptNo: r1Receipt,
      isTest: true
    });

    await setDoc(r1CashInflowRef, {
      id: r1CashInflowRef.id,
      type: 'Income',
      amount: 2500,
      category: 'Fee Collection',
      transactionId: r1TxId,
      receiptNo: r1Receipt,
      remarks: `Tuition fee payment Receipt #${r1Receipt}`,
      isTest: true
    });

    const r1Result = await processPaymentRefund({
      transactionId: r1TxId,
      adminName: 'Audit Admin',
      adminEmail: 'admin@shikshantar.edu.np',
      reason: 'Administrative Refund R1 Verification',
      customDb: firestore
    });

    const r1TxSnap = await getDoc(r1TxRef);
    const r1FeeSnap = await getDoc(r1FeeRef);
    const r1CashInflowSnap = await getDoc(r1CashInflowRef);
    const r1RefundRecordRef = doc(firestore, 'refund_records', r1Result.refundRecordId);
    const r1RefundRecordSnap = await getDoc(r1RefundRecordRef);
    const r1CashExpenseRef = doc(firestore, 'cash_ledger', r1Result.cashLedgerExpenseId);
    const r1CashExpenseSnap = await getDoc(r1CashExpenseRef);
    const r1AuditRef = doc(firestore, 'ledger_audit_logs', r1Result.auditLogId);
    const r1AuditSnap = await getDoc(r1AuditRef);

    markCleanup(r1RefundRecordRef);
    markCleanup(r1CashExpenseRef);
    markCleanup(r1AuditRef);

    const r1Passed = Boolean(
      r1Result.success &&
      r1TxSnap.data()?.status === 'REFUNDED' &&
      r1FeeSnap.data()?.status === 'due' &&
      r1FeeSnap.data()?.paidAmount === 0 &&
      r1CashInflowSnap.exists() && // Original inflow PRESERVED
      r1RefundRecordSnap.exists() &&
      r1RefundRecordSnap.data()?.status === 'REFUNDED_TO_GUARDIAN' &&
      r1RefundRecordSnap.data()?.amount === 2500 &&
      r1CashExpenseSnap.exists() &&
      r1CashExpenseSnap.data()?.type === 'Expense' &&
      r1CashExpenseSnap.data()?.amount === 2500 &&
      r1AuditSnap.exists() &&
      r1AuditSnap.data()?.actionType === 'REFUND'
    );

    record('R1', 'Normal single-bill refund', r1Passed,
      `TxStatus=${r1TxSnap.data()?.status}, FeeStatus=${r1FeeSnap.data()?.status}, CashInflowPreserved=${r1CashInflowSnap.exists()}, RefundRecord=${r1RefundRecordSnap.exists()}, CashExpenseOutflow=${r1CashExpenseSnap.exists()}`);

    // ============================================================================
    // TEST R2: Multi-bill payment refund (group atomicity)
    // ============================================================================
    console.log('\n--- TEST R2: Multi-bill payment refund (group atomicity) ---');
    const r2GroupId = `PAY_GROUP_R2_${Date.now()}`;
    const r2TxId1 = `TEST_REFUND_R2_TX1_${Date.now()}`;
    const r2TxId2 = `TEST_REFUND_R2_TX2_${Date.now()}`;
    const r2BillId1 = `TEST_REMIT_R2_1_${Date.now()}`;
    const r2BillId2 = `TEST_REMIT_R2_2_${Date.now()}`;
    const r2Receipt = `REC_R2_${Date.now()}`;
    const r2StudentId = `TEST_STU_R2_${Date.now()}`;

    const r2TxRef1 = doc(firestore, 'transactions', r2TxId1);
    const r2TxRef2 = doc(firestore, 'transactions', r2TxId2);
    const r2BillRef1 = doc(firestore, 'remitBills', r2BillId1);
    const r2BillRef2 = doc(firestore, 'remitBills', r2BillId2);
    markCleanup(r2TxRef1);
    markCleanup(r2TxRef2);
    markCleanup(r2BillRef1);
    markCleanup(r2BillRef2);

    await setDoc(r2TxRef1, {
      id: r2TxId1,
      paymentGroupId: r2GroupId,
      receipt: r2Receipt,
      studentId: r2StudentId,
      amount: 1500,
      status: 'SUCCESS',
      remitBillId: r2BillId1,
      isTest: true
    });

    await setDoc(r2TxRef2, {
      id: r2TxId2,
      paymentGroupId: r2GroupId,
      receipt: r2Receipt,
      studentId: r2StudentId,
      amount: 2000,
      status: 'SUCCESS',
      remitBillId: r2BillId2,
      isTest: true
    });

    await setDoc(r2BillRef1, {
      id: r2BillId1,
      studentId: r2StudentId,
      status: 'paid',
      totalAmount: 1500,
      paidAmount: 1500,
      transactionId: r2Receipt,
      isTest: true
    });

    await setDoc(r2BillRef2, {
      id: r2BillId2,
      studentId: r2StudentId,
      status: 'paid',
      totalAmount: 2000,
      paidAmount: 2000,
      transactionId: r2Receipt,
      isTest: true
    });

    const r2Result = await processPaymentRefund({
      transactionId: r2TxId1,
      adminName: 'Audit Admin',
      adminEmail: 'admin@shikshantar.edu.np',
      reason: 'Multi-bill group refund test',
      customDb: firestore
    });

    const r2Tx1Snap = await getDoc(r2TxRef1);
    const r2Tx2Snap = await getDoc(r2TxRef2);
    const r2Bill1Snap = await getDoc(r2BillRef1);
    const r2Bill2Snap = await getDoc(r2BillRef2);

    const r2RefundRecRef = doc(firestore, 'refund_records', r2Result.refundRecordId);
    const r2RefundRecSnap = await getDoc(r2RefundRecRef);
    const r2CashExpRef = doc(firestore, 'cash_ledger', r2Result.cashLedgerExpenseId);
    const r2CashExpSnap = await getDoc(r2CashExpRef);
    const r2AuditRef = doc(firestore, 'ledger_audit_logs', r2Result.auditLogId);
    markCleanup(r2RefundRecRef);
    markCleanup(r2CashExpRef);
    markCleanup(r2AuditRef);

    const r2Passed = Boolean(
      r2Result.success &&
      r2Result.totalRefundAmount === 3500 &&
      r2Result.refundedTransactionIds.length === 2 &&
      r2Tx1Snap.data()?.status === 'REFUNDED' &&
      r2Tx2Snap.data()?.status === 'REFUNDED' &&
      r2Bill1Snap.data()?.status === 'pending' &&
      r2Bill2Snap.data()?.status === 'pending' &&
      r2RefundRecSnap.data()?.amount === 3500 &&
      r2CashExpSnap.data()?.amount === 3500
    );

    record('R2', 'Multi-bill payment refund (group atomicity)', r2Passed,
      `TotalRefunded=${r2Result.totalRefundAmount}, Tx1Status=${r2Tx1Snap.data()?.status}, Tx2Status=${r2Tx2Snap.data()?.status}, Bill1Status=${r2Bill1Snap.data()?.status}, Bill2Status=${r2Bill2Snap.data()?.status}`);

    // ============================================================================
    // TEST R3: Refund of payment with created advance (no orphan advance)
    // ============================================================================
    console.log('\n--- TEST R3: Refund of payment with created advance (no orphan advance) ---');
    const r3TxId = `TEST_REFUND_R3_TX_${Date.now()}`;
    const r3AdvId = `TEST_ADV_R3_${Date.now()}`;
    const r3StudentId = `TEST_STU_R3_${Date.now()}`;
    const r3Receipt = `REC_R3_${Date.now()}`;

    const r3TxRef = doc(firestore, 'transactions', r3TxId);
    const r3AdvRef = doc(firestore, 'student_advances', r3AdvId);
    const r3UserRef = doc(firestore, 'users', r3StudentId);
    markCleanup(r3TxRef);
    markCleanup(r3AdvRef);
    markCleanup(r3UserRef);

    await setDoc(r3UserRef, {
      id: r3StudentId,
      name: 'Test Student R3',
      advanceBalance: 500,
      isTest: true
    });

    await setDoc(r3TxRef, {
      id: r3TxId,
      receipt: r3Receipt,
      studentId: r3StudentId,
      amount: 3000,
      status: 'SUCCESS',
      advanceCreated: 500,
      isTest: true
    });

    await setDoc(r3AdvRef, {
      id: r3AdvId,
      studentId: r3StudentId,
      sourceTransactionId: r3TxId,
      amount: 500,
      remainingCredit: 500,
      status: 'ACTIVE',
      isTest: true
    });

    const r3Result = await processPaymentRefund({
      transactionId: r3TxId,
      adminName: 'Audit Admin',
      adminEmail: 'admin@shikshantar.edu.np',
      reason: 'Advance refund test',
      customDb: firestore
    });

    const r3AdvSnap = await getDoc(r3AdvRef);
    const r3UserSnap = await getDoc(r3UserRef);
    markCleanup(doc(firestore, 'refund_records', r3Result.refundRecordId));
    markCleanup(doc(firestore, 'cash_ledger', r3Result.cashLedgerExpenseId));
    markCleanup(doc(firestore, 'ledger_audit_logs', r3Result.auditLogId));

    const r3Passed = Boolean(
      r3Result.success &&
      r3AdvSnap.data()?.status === 'REFUNDED' &&
      r3AdvSnap.data()?.remainingCredit === 0 &&
      r3UserSnap.data()?.advanceBalance === 0
    );

    record('R3', 'Refund of payment with created advance (no orphan advance)', r3Passed,
      `AdvStatus=${r3AdvSnap.data()?.status}, AdvRemaining=${r3AdvSnap.data()?.remainingCredit}, UserAdvanceBalance=${r3UserSnap.data()?.advanceBalance}`);

    // ============================================================================
    // TEST R4: Double-refund idempotency
    // ============================================================================
    console.log('\n--- TEST R4: Double-refund idempotency ---');
    let r4CaughtError = false;
    let r4ErrorMsg = '';

    try {
      // Attempting to refund r1TxId a second time
      await processPaymentRefund({
        transactionId: r1TxId,
        adminName: 'Audit Admin',
        adminEmail: 'admin@shikshantar.edu.np',
        reason: 'Duplicate refund test',
        customDb: firestore
      });
    } catch (err: any) {
      r4CaughtError = true;
      r4ErrorMsg = err.message || String(err);
    }

    const r4Passed = r4CaughtError && (r4ErrorMsg.includes('ALREADY_REFUNDED') || r4ErrorMsg.includes('IDEMPOTENCY_ABORT'));
    record('R4', 'Double-refund idempotency', r4Passed,
      `CaughtError=${r4CaughtError}, ErrorMessage=${r4ErrorMsg}`);

    // ============================================================================
    // TEST R5: Real Concurrent payment vs refund race
    // ============================================================================
    console.log('\n--- TEST R5: Real Concurrent payment vs refund race ---');
    const r5Nonce = `${Date.now()}_R5`;
    const r5StudentId = `TEST_STU_R5_${r5Nonce}`;
    const r5BillId = `TEST_BILL_R5_${r5Nonce}`;
    const r5StudentUserRef = doc(firestore, 'users', r5StudentId);
    const r5BillRef = doc(firestore, 'remitBills', r5BillId);
    markCleanup(r5StudentUserRef);
    markCleanup(r5BillRef);

    await setDoc(r5StudentUserRef, {
      id: r5StudentId,
      fullName: 'Concurrent Test Student R5',
      name: 'Concurrent Test Student R5',
      class: 'Class 7',
      rollNumber: '5',
      roll: '5',
      advanceBalance: 0,
      monthlyFee: 2000,
      transportFee: 0,
      isTest: true
    });

    await setDoc(r5BillRef, {
      id: r5BillId,
      billNo: `BIL_R5_${r5Nonce}`,
      studentId: r5StudentId,
      studentName: 'Concurrent Test Student R5',
      class: 'Class 7',
      totalAmount: 4000,
      amount: 4000,
      paidAmount: 0,
      dueAmount: 4000,
      status: 'pending',
      itemizedCharges: [
        { name: 'Tuition Fee - Month 1', rate: 2000, total: 2000 },
        { name: 'Tuition Fee - Month 2', rate: 2000, total: 2000 }
      ],
      createdAt: '2081-01-01',
      createdBy: 'Admin Cashier',
      isTest: true
    });

    const r5StudentData = {
      id: r5StudentId,
      name: 'Concurrent Test Student R5',
      fullName: 'Concurrent Test Student R5',
      class: 'Class 7',
      rollNumber: '5',
      roll: '5',
      monthlyFee: 2000,
      transportFee: 0
    };

    // First sequential payment P1 (2000)
    const r5BillSnapPre = await getDoc(r5BillRef);
    const p1Result = await executeCashFeePayment({
      student: r5StudentData,
      netPayable: 2000,
      cashTendered: 2000,
      amountApplied: 2000,
      receiptNo: `REC_P1_${r5Nonce}`,
      paymentCategory: 'regular',
      baseAmount: 2000,
      additionalCharges: [],
      discounts: [],
      prefilledBillData: r5BillSnapPre.data() as any,
      operatorName: 'Cashier R5',
      operatorUid: 'admin_test'
    });

    const r5Tx1Id = p1Result.transactionId;
    const r5Tx1Ref = doc(firestore, 'transactions', r5Tx1Id);
    markCleanup(r5Tx1Ref);

    // Concurrent race: Payment P2 (2000) vs Refund of P1 targeting same student and bill
    const r5BillSnapMid = await getDoc(r5BillRef);
    const p2Promise = executeCashFeePayment({
      student: r5StudentData,
      netPayable: 2000,
      cashTendered: 2000,
      amountApplied: 2000,
      receiptNo: `REC_P2_${r5Nonce}`,
      paymentCategory: 'regular',
      baseAmount: 2000,
      additionalCharges: [],
      discounts: [],
      prefilledBillData: r5BillSnapMid.data() as any,
      operatorName: 'Cashier R5',
      operatorUid: 'admin_test'
    });

    const refund1Promise = processPaymentRefund({
      transactionId: r5Tx1Id,
      adminName: 'Audit Admin',
      adminEmail: 'admin@shikshantar.edu.np',
      reason: 'Concurrent Race Verification R5',
      customDb: firestore
    });

    const [p2Settled, refundSettled] = await Promise.allSettled([p2Promise, refund1Promise]);

    const r5BillSnapPost = await getDoc(r5BillRef);
    const r5FinalBill = r5BillSnapPost.data() as any;
    const finalPaid = Number(r5FinalBill?.paidAmount || 0);
    const finalDue = Number(r5FinalBill?.dueAmount || 0);

    const r5NoNegative = finalPaid >= 0 && finalDue >= 0;
    const r5MathConsistent = (finalPaid + finalDue === 4000);
    const r5StatusConsistent = (finalPaid === 0 && r5FinalBill.status === 'pending') ||
      (finalPaid > 0 && finalPaid < 4000 && r5FinalBill.status === 'partial') ||
      (finalPaid === 4000 && r5FinalBill.status === 'paid');

    const r5Passed = r5NoNegative && r5MathConsistent && r5StatusConsistent;
    record('R5', 'Concurrent payment vs refund race protection', r5Passed,
      `P2=${p2Settled.status}, Refund=${refundSettled.status}, FinalPaid=${finalPaid}, FinalDue=${finalDue}, Status=${r5FinalBill?.status}`);

    // ============================================================================
    // TEST D1: Attempt destructive delete on valid institutional payment
    // ============================================================================
    console.log('\n--- TEST D1: Attempt destructive delete on valid institutional payment ---');
    const d1TxId = `TXN_INSTITUTIONAL_${Date.now()}`;
    const d1TxRef = doc(firestore, 'transactions', d1TxId);
    markCleanup(d1TxRef);

    // Create authentic institutional payment record WITHOUT test/sandbox markers
    await setDoc(d1TxRef, {
      id: d1TxId,
      receipt: `REC_${Date.now()}`,
      studentId: `STU_${Date.now()}`,
      studentName: 'Permanent Student',
      amount: 5000,
      status: 'SUCCESS',
      isTest: false,
      isSandbox: false
    });

    let d1Caught = false;
    let d1Msg = '';
    try {
      await deleteSystemTransactionSafe({
        transactionId: d1TxId,
        adminName: 'Rogue Operator',
        adminEmail: 'admin@shikshantar.edu.np',
        reason: 'Attempted destruction of production record',
        customDb: firestore
      });
    } catch (err: any) {
      d1Caught = true;
      d1Msg = err.message || String(err);
    }

    const d1TxSnapAfter = await getDoc(d1TxRef);
    const d1Passed = Boolean(
      d1Caught &&
      d1Msg.includes('PROHIBITED_FINANCIAL_DELETION') &&
      d1TxSnapAfter.exists() // Transaction remains completely intact!
    );

    record('D1', 'Attempt destructive delete on valid institutional payment', d1Passed,
      `CaughtRejection=${d1Caught}, DocStillExists=${d1TxSnapAfter.exists()}, ErrorMsg=${d1Msg}`);

    // ============================================================================
    // TEST D2: Sandbox-only cleanup behavior
    // ============================================================================
    console.log('\n--- TEST D2: Sandbox-only cleanup behavior ---');
    const d2TxId = `TEST_SANDBOX_FIXTURE_${Date.now()}`;
    const d2TxRef = doc(firestore, 'transactions', d2TxId);

    // Create fixture with verified sandbox markers
    await setDoc(d2TxRef, {
      id: d2TxId,
      receipt: `TEST_REC_${Date.now()}`,
      studentId: `TEST_STU_${Date.now()}`,
      studentName: 'Sandbox Dummy',
      amount: 100,
      status: 'SUCCESS',
      isSandbox: true,
      isTest: true
    });

    const d2Result = await deleteSystemTransactionSafe({
      transactionId: d2TxId,
      adminName: 'Audit Admin',
      adminEmail: 'admin@shikshantar.edu.np',
      reason: 'Sandbox fixture cleanup',
      customDb: firestore
    });

    const d2TxSnapAfter = await getDoc(d2TxRef);
    if (d2Result.auditLogId) {
      markCleanup(doc(firestore, 'ledger_audit_logs', d2Result.auditLogId));
    }

    const d2Passed = Boolean(
      d2Result.success &&
      !d2TxSnapAfter.exists()
    );

    record('D2', 'Sandbox-only cleanup behavior', d2Passed,
      `Success=${d2Result.success}, DocDeleted=${!d2TxSnapAfter.exists()}`);

  } finally {
    // Clean up isolated test fixtures
    console.log(`\nCleaning up ${cleanupDocRefs.length} isolated test fixtures...`);
    for (const ref of cleanupDocRefs) {
      try {
        await deleteDoc(ref);
      } catch (e) {
        // ignore cleanup errors
      }
    }
  }

  console.log('\n==============================================================================');
  console.log('TARGETED REMEDIATION TEST RESULTS SUMMARY');
  console.log('==============================================================================');
  const allPassed = results.every(r => r.passed);
  results.forEach(r => console.log(`[${r.id}] ${r.passed ? '✅ PASS' : '❌ FAIL'}: ${r.name}`));
  console.log('==============================================================================');
  console.log(`FINAL OUTCOME: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);

  if (!allPassed) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
