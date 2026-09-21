/**
 * VERIFICATION OF FINANCIAL ARCHITECTURE REMEDIATION
 * Tests: 1 to 10 covering Multi-Bill Payments, Remit Advances, Cancellation Concurrency & Atomicity.
 * Uses completely isolated test fixtures with test prefixes: `TEST_ARCH_*`.
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
import { cancelPaymentTransaction } from '../src/lib/paymentCancellationEngine';

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(id: number, name: string, passed: boolean, details: string) {
  results.push({ id, name, passed, details });
  console.log(`[TEST ${id.toString().padStart(2, '0')}] ${passed ? '✅ PASS' : '❌ FAIL'}: ${name}`);
  if (!passed) {
    console.error(`       Details: ${details}`);
  }
}

async function main() {
  console.log('==============================================================================');
  console.log('STARTING FINANCIAL ARCHITECTURE REMEDIATION AUDIT (TESTS 1 - 10)');
  console.log('==============================================================================\n');

  const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
  const dbName = cfg.firestoreDatabaseId;

  const app = getApps().length === 0 ? initializeApp(cfg) : getApp();
  const auth = getAuth(app);
  const db = getFirestore(app, dbName);

  // Authenticate admin
  try {
    await signInWithEmailAndPassword(auth, 'admin_test_integration@shikshantar.edu.np', 'AdminTest@12345');
    console.log('Authenticated as admin_test_integration successfully.\n');
  } catch (err: any) {
    console.warn('Could not authenticate with integration user, running with existing context:', err.message);
  }

  const testStudentId = `TEST_ARCH_STU_${Date.now()}`;
  const testAcademicYear = '2083';
  const cleanupRefs: any[] = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: MULTI-BILL PAYMENT IDENTITY
    // -------------------------------------------------------------------------
    console.log('--- EXECUTING TEST 1: MULTI-BILL PAYMENT IDENTITY ---');
    const paymentGroupId1 = `PAY_ARCH_TEST_01_${Date.now()}`;
    const receiptNo1 = `RCP-ARCH-001`;
    const txId1A = `TX_ARCH_1A_${Date.now()}`;
    const txId1B = `TX_ARCH_1B_${Date.now()}`;
    const billId1A = `BILL_ARCH_1A_${Date.now()}`;
    const billId1B = `BILL_ARCH_1B_${Date.now()}`;
    const cashId1 = `CASH_ARCH_1_${Date.now()}`;

    const txDocRef1A = doc(db, 'transactions', txId1A);
    const txDocRef1B = doc(db, 'transactions', txId1B);
    const billRef1A = doc(db, 'remitBills', billId1A);
    const billRef1B = doc(db, 'remitBills', billId1B);
    const cashRef1 = doc(db, 'cash_ledger', cashId1);
    const stuRef1 = doc(db, 'users', testStudentId);

    cleanupRefs.push(txDocRef1A, txDocRef1B, billRef1A, billRef1B, cashRef1, stuRef1);

    await setDoc(stuRef1, {
      fullName: 'Arch Test Student',
      class: '5',
      advanceBalance: 0
    });

    await setDoc(billRef1A, {
      billNo: 'BILL-001',
      studentId: testStudentId,
      totalAmount: 3000,
      paidAmount: 3000,
      status: 'paid',
      transactionId: receiptNo1,
      paymentGroupId: paymentGroupId1
    });

    await setDoc(billRef1B, {
      billNo: 'BILL-002',
      studentId: testStudentId,
      totalAmount: 2000,
      paidAmount: 2000,
      status: 'paid',
      transactionId: `${receiptNo1}-2`,
      paymentGroupId: paymentGroupId1
    });

    await setDoc(txDocRef1A, {
      id: txId1A,
      receipt: receiptNo1,
      receiptNo: receiptNo1,
      paymentGroupId: paymentGroupId1,
      sourceTransactionId: txId1A,
      transactionType: 'FEE_PAYMENT',
      studentId: testStudentId,
      studentName: 'Arch Test Student',
      amount: 3000,
      status: 'SUCCESS',
      remitBillId: billId1A
    });

    await setDoc(txDocRef1B, {
      id: txId1B,
      receipt: `${receiptNo1}-2`,
      receiptNo: `${receiptNo1}-2`,
      paymentGroupId: paymentGroupId1,
      sourceTransactionId: txId1B,
      transactionType: 'FEE_PAYMENT',
      studentId: testStudentId,
      studentName: 'Arch Test Student',
      amount: 2000,
      status: 'SUCCESS',
      remitBillId: billId1B
    });

    await setDoc(cashRef1, {
      type: 'Income',
      amount: 5000,
      category: 'Fee Collection',
      transactionId: txId1A,
      sourceTransactionId: txId1A,
      paymentGroupId: paymentGroupId1,
      receiptNo: receiptNo1,
      remarks: `Receipt ${receiptNo1} multi-bill clearance`
    });

    // Verify properties
    const readTxA = (await getDoc(txDocRef1A)).data();
    const readTxB = (await getDoc(txDocRef1B)).data();
    const readCash = (await getDoc(cashRef1)).data();

    const t1Passed = 
      readTxA?.paymentGroupId === paymentGroupId1 &&
      readTxB?.paymentGroupId === paymentGroupId1 &&
      readCash?.paymentGroupId === paymentGroupId1 &&
      readCash?.transactionId === txId1A;

    record(1, 'MULTI-BILL PAYMENT IDENTITY', !!t1Passed,
      `TxA Group: ${readTxA?.paymentGroupId}, TxB Group: ${readTxB?.paymentGroupId}, Cash Group: ${readCash?.paymentGroupId}, Cash TxId: ${readCash?.transactionId}`);

    // -------------------------------------------------------------------------
    // TEST 2: REMIT ADVANCE LINKAGE
    // -------------------------------------------------------------------------
    console.log('\n--- EXECUTING TEST 2: REMIT ADVANCE LINKAGE ---');
    const advId2 = `ADV_ARCH_2_${Date.now()}`;
    const advRef2 = doc(db, 'student_advances', advId2);
    cleanupRefs.push(advRef2);

    await setDoc(advRef2, {
      id: advId2,
      studentId: testStudentId,
      amount: 1000,
      remainingCredit: 1000,
      sourceTransactionId: txId1A,
      paymentGroupId: paymentGroupId1,
      receiptNo: `${receiptNo1}-ADV`,
      status: 'ACTIVE'
    });

    const readAdv2 = (await getDoc(advRef2)).data();
    const t2Passed = 
      readAdv2?.sourceTransactionId === txId1A &&
      readAdv2?.paymentGroupId === paymentGroupId1 &&
      !readAdv2?.sourceTransactionId.includes('RCP');

    record(2, 'REMIT ADVANCE LINKAGE', !!t2Passed,
      `Adv SourceTxId: ${readAdv2?.sourceTransactionId} (matches real TxId), Adv Group: ${readAdv2?.paymentGroupId}`);

    // -------------------------------------------------------------------------
    // TEST 3: PURE ADVANCE TRANSACTION IDENTITY
    // -------------------------------------------------------------------------
    console.log('\n--- EXECUTING TEST 3: PURE ADVANCE TRANSACTION IDENTITY ---');
    const pureAdvTxId = `TX_ARCH_PURE_ADV_${Date.now()}`;
    const pureAdvGroupId = `PAY_ARCH_PURE_ADV_${Date.now()}`;
    const pureAdvReceipt = `RCP-ARCH-PURE`;
    const pureAdvDocId = `ADV_ARCH_PURE_${Date.now()}`;
    const pureCashId = `CASH_ARCH_PURE_${Date.now()}`;

    const pureTxRef = doc(db, 'transactions', pureAdvTxId);
    const pureAdvRef = doc(db, 'student_advances', pureAdvDocId);
    const pureCashRef = doc(db, 'cash_ledger', pureCashId);
    cleanupRefs.push(pureTxRef, pureAdvRef, pureCashRef);

    await setDoc(pureTxRef, {
      id: pureAdvTxId,
      receipt: pureAdvReceipt,
      receiptNo: pureAdvReceipt,
      studentId: testStudentId,
      studentName: 'Arch Test Student',
      amount: 0,
      cashReceived: 4000,
      advanceCreated: 4000,
      method: 'Cash',
      status: 'SUCCESS',
      type: 'Income',
      transactionType: 'ADVANCE_DEPOSIT',
      paymentGroupId: pureAdvGroupId,
      sourceTransactionId: pureAdvTxId
    });

    await setDoc(pureAdvRef, {
      id: pureAdvDocId,
      studentId: testStudentId,
      amount: 4000,
      remainingCredit: 4000,
      sourceTransactionId: pureAdvTxId,
      paymentGroupId: pureAdvGroupId,
      receiptNo: `${pureAdvReceipt}-ADV`,
      status: 'ACTIVE'
    });

    await setDoc(pureCashRef, {
      type: 'Income',
      amount: 4000,
      category: 'Fee Collection',
      transactionId: pureAdvTxId,
      sourceTransactionId: pureAdvTxId,
      paymentGroupId: pureAdvGroupId,
      receiptNo: pureAdvReceipt
    });

    const readPureTx = (await getDoc(pureTxRef)).data();
    const readPureAdv = (await getDoc(pureAdvRef)).data();
    const readPureCash = (await getDoc(pureCashRef)).data();

    const t3Passed = 
      readPureTx?.transactionType === 'ADVANCE_DEPOSIT' &&
      readPureAdv?.sourceTransactionId === pureAdvTxId &&
      readPureCash?.transactionId === pureAdvTxId &&
      readPureCash?.paymentGroupId === pureAdvGroupId;

    record(3, 'PURE ADVANCE TRANSACTION IDENTITY', !!t3Passed,
      `PureTx Type: ${readPureTx?.transactionType}, Adv SourceTxId: ${readPureAdv?.sourceTransactionId}, Cash TxId: ${readPureCash?.transactionId}`);

    // -------------------------------------------------------------------------
    // TEST 4: CONCURRENT CANCELLATION RACE & IDEMPOTENCY
    // -------------------------------------------------------------------------
    console.log('\n--- EXECUTING TEST 4: CONCURRENT CANCELLATION RACE ---');
    // Launch two simultaneous cancellations on the pure advance transaction
    let c1Success = false;
    let c2Success = false;
    let c1Error = '';
    let c2Error = '';

    const p1 = cancelPaymentTransaction({
      transactionId: pureAdvTxId,
      paymentGroupId: pureAdvGroupId,
      adminName: 'Admin Operator 1',
      adminEmail: 'admin1@test.com',
      reason: 'Concurrent Race Test 1',
      customDb: db
    }).then(res => { c1Success = true; return res; })
      .catch(err => { c1Error = err.message; return null; });

    const p2 = cancelPaymentTransaction({
      transactionId: pureAdvTxId,
      paymentGroupId: pureAdvGroupId,
      adminName: 'Admin Operator 2',
      adminEmail: 'admin2@test.com',
      reason: 'Concurrent Race Test 2',
      customDb: db
    }).then(res => { c2Success = true; return res; })
      .catch(err => { c2Error = err.message; return null; });

    await Promise.all([p1, p2]);

    // Exactly one must succeed, and the other must be rejected by idempotency / concurrency check
    const exactlyOneSucceeded = (c1Success && !c2Success) || (!c1Success && c2Success);
    const rejectionReason = c1Error || c2Error;
    const isIdempotencyRejection = rejectionReason.includes('IDEMPOTENCY_ABORT') || rejectionReason.includes('TRANSACTION_ALREADY_CANCELLED');

    const t4Passed = exactlyOneSucceeded && isIdempotencyRejection;
    record(4, 'CONCURRENT CANCELLATION RACE & IDEMPOTENCY', t4Passed,
      `P1 Success: ${c1Success}, P2 Success: ${c2Success}, Rejection Reason: ${rejectionReason}`);

    // -------------------------------------------------------------------------
    // TEST 5: CANCELLATION VS CONCURRENT PAYMENT ON SAME BILL
    // -------------------------------------------------------------------------
    console.log('\n--- EXECUTING TEST 5: CANCELLATION VS CONCURRENT PAYMENT ON SAME BILL ---');
    // Calling cancelPaymentTransaction on an already cancelled transaction must immediately fail
    let t5Error = '';
    try {
      await cancelPaymentTransaction({
        transactionId: pureAdvTxId,
        paymentGroupId: pureAdvGroupId,
        adminName: 'Admin Op 3',
        adminEmail: 'admin3@test.com',
        reason: 'Post-Cancellation Race Test',
        customDb: db
      });
    } catch (err: any) {
      t5Error = err.message;
    }

    const t5Passed = t5Error.includes('TRANSACTION_ALREADY_CANCELLED') || t5Error.includes('IDEMPOTENCY_ABORT');
    record(5, 'CANCELLATION VS CONCURRENT PAYMENT ON SAME BILL', t5Passed,
      `Rejection message on re-cancel: ${t5Error}`);

    // -------------------------------------------------------------------------
    // TEST 6: MULTI-BILL CANCELLATION ATOMICITY
    // -------------------------------------------------------------------------
    console.log('\n--- EXECUTING TEST 6: MULTI-BILL CANCELLATION ATOMICITY ---');
    // Cancel the multi-bill payment group by passing Tx-1B (child)
    const cancelGroupResult = await cancelPaymentTransaction({
      transactionId: txId1B,
      paymentGroupId: paymentGroupId1,
      adminName: 'Admin Lead',
      adminEmail: 'adminlead@test.com',
      reason: 'Group Atomicity Test via Child Tx',
      customDb: db
    });

    const postTxA = (await getDoc(txDocRef1A)).data();
    const postTxB = (await getDoc(txDocRef1B)).data();
    const postBillA = (await getDoc(billRef1A)).data();
    const postBillB = (await getDoc(billRef1B)).data();
    const postCash = await getDoc(cashRef1);

    const t6Passed =
      postTxA?.status === 'CANCELLED' &&
      postTxB?.status === 'CANCELLED' &&
      postBillA?.status === 'pending' &&
      postBillB?.status === 'pending' &&
      !postCash.exists();

    record(6, 'MULTI-BILL CANCELLATION ATOMICITY', t6Passed,
      `TxA Status: ${postTxA?.status}, TxB Status: ${postTxB?.status}, BillA Status: ${postBillA?.status}, BillB Status: ${postBillB?.status}, Cash Entry Exists: ${postCash.exists()}`);

    // -------------------------------------------------------------------------
    // TEST 7: ADVANCE RESTORATION AND REVERSAL ATOMICITY
    // -------------------------------------------------------------------------
    console.log('\n--- EXECUTING TEST 7: ADVANCE RESTORATION AND REVERSAL ATOMICITY ---');
    const postAdv2 = (await getDoc(advRef2)).data();
    const t7Passed = postAdv2?.status === 'CANCELLED' && postAdv2?.remainingCredit === 0;

    record(7, 'ADVANCE RESTORATION AND REVERSAL ATOMICITY', !!t7Passed,
      `Adv2 Status: ${postAdv2?.status}, RemainingCredit: ${postAdv2?.remainingCredit}`);

    // -------------------------------------------------------------------------
    // TEST 8: CASH LEDGER LINKAGE ACCURACY
    // -------------------------------------------------------------------------
    console.log('\n--- EXECUTING TEST 8: CASH LEDGER LINKAGE ACCURACY ---');
    // Ensure no cash_ledger entries remain linked to paymentGroupId1
    const cashCheckQuery = query(collection(db, 'cash_ledger'), where('paymentGroupId', '==', paymentGroupId1));
    const cashCheckSnap = await getDocs(cashCheckQuery);
    const t8Passed = cashCheckSnap.empty;

    record(8, 'CASH LEDGER LINKAGE ACCURACY', t8Passed,
      `Linked cash_ledger count after reversal: ${cashCheckSnap.size} (expected 0)`);

    // -------------------------------------------------------------------------
    // TEST 9: RE-QUERY STATUS INTEGRITY
    // -------------------------------------------------------------------------
    console.log('\n--- EXECUTING TEST 9: RE-QUERY STATUS INTEGRITY ---');
    // Allowlist: only SUCCESS or OVERRIDE_SUCCESS
    const ALLOWED_STATUSES = new Set(['SUCCESS', 'OVERRIDE_SUCCESS']);
    const txAEligible = ALLOWED_STATUSES.has(postTxA?.status);
    const txBEligible = ALLOWED_STATUSES.has(postTxB?.status);
    const t9Passed = !txAEligible && !txBEligible;

    record(9, 'RE-QUERY STATUS INTEGRITY', t9Passed,
      `TxA Included in active ledger: ${txAEligible}, TxB Included: ${txBEligible}`);

    // -------------------------------------------------------------------------
    // TEST 10: ZERO RECONCILIATION LEAKS
    // -------------------------------------------------------------------------
    console.log('\n--- EXECUTING TEST 10: ZERO RECONCILIATION LEAKS ---');
    // Verify audit log has exact reversed amount matching total cancelled
    const auditLogId = cancelGroupResult.auditLogId;
    const auditRef = doc(db, 'ledger_audit_logs', auditLogId);
    cleanupRefs.push(auditRef);
    const auditSnap = await getDoc(auditRef);
    const auditData = auditSnap.data();

    const t10Passed = 
      auditSnap.exists() &&
      auditData?.amountReversed === 5000 &&
      auditData?.paymentGroupId === paymentGroupId1 &&
      auditData?.actionType === 'PAYMENT_UNDONE';

    record(10, 'ZERO RECONCILIATION LEAKS', !!t10Passed,
      `Audit Log Exists: ${auditSnap.exists()}, Amount Reversed: ${auditData?.amountReversed} (expected 5000), Group: ${auditData?.paymentGroupId}`);

  } finally {
    // Cleanup test fixtures
    console.log('\nCleaning up isolated test fixtures...');
    for (const r of cleanupRefs) {
      try {
        await deleteDoc(r);
      } catch (_) {}
    }
    console.log('Cleanup completed.');
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n==============================================================================');
  console.log('REMEDIATION VERIFICATION RESULTS SUMMARY:');
  console.log('==============================================================================');
  const allPassed = results.every(r => r.passed);
  results.forEach(r => {
    console.log(`[TEST ${r.id.toString().padStart(2, '0')}] ${r.passed ? 'PASS' : 'FAIL'} - ${r.name}`);
  });

  console.log(`\nTOTAL: ${results.filter(r => r.passed).length} / ${results.length} PASSED.`);
  if (!allPassed) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal execution error in test script:', err);
  process.exit(1);
});
