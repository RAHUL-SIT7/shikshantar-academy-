/**
 * DIRECT DATABASE SECURITY RULES VERIFICATION SUITE
 * 
 * Verifies that an authenticated normal ADMIN client is REJECTED by Firestore Security Rules
 * when directly attempting unauthorized financial and linkage mutations.
 */

import fs from 'fs';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  serverTimestamp
} from 'firebase/firestore';

interface TestResult {
  id: string;
  name: string;
  category: 'REAL FIRESTORE TEST';
  passed: boolean;
  expectedRejection: boolean;
  errorReceived?: string;
  details: string;
}

const testResults: TestResult[] = [];

function record(id: string, name: string, passed: boolean, details: string, errorReceived?: string) {
  testResults.push({
    id,
    name,
    category: 'REAL FIRESTORE TEST',
    passed,
    expectedRejection: true,
    errorReceived,
    details
  });
  console.log(`[${id}] ${passed ? '✅ PASS' : '❌ FAIL'}: ${name}`);
  if (!passed) {
    console.error(`      Details: ${details}`);
  }
}

async function runDirectSecurityVerification() {
  console.log('==============================================================================');
  console.log('STARTING DIRECT DATABASE SECURITY RULES VERIFICATION SUITE');
  console.log('==============================================================================\n');

  const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
  const dbName = cfg.firestoreDatabaseId;
  const app = getApps().length === 0 ? initializeApp(cfg) : getApp();
  const auth = getAuth(app);
  const db = dbName ? getFirestore(app, dbName) : getFirestore(app);

  // Authenticate as normal Admin client
  await signInWithEmailAndPassword(auth, 'admin_test_integration@shikshantar.edu.np', 'AdminTest@12345');
  console.log('Authenticated as Admin client: admin_test_integration@shikshantar.edu.np\n');

  const nonce = Date.now();
  const testStudentId = `SEC_STUDENT_${nonce}`;
  const prodTxId = `TXN_PROD_${nonce}`;
  const paidBillId = `BILL_PAID_${nonce}`;
  const cashLedgerId = `LEDGER_FEE_${nonce}`;

  // -------------------------------------------------------------
  // SETUP FIXTURES: Create initial valid fixtures
  // -------------------------------------------------------------
  console.log('Setting up test fixtures on live Firestore...');
  
  // 1. Production Transaction fixture
  await setDoc(doc(db, 'transactions', prodTxId), {
    id: prodTxId,
    amount: 5000,
    amountApplied: 5000,
    netPayable: 5000,
    receipt: `REC-${nonce}`,
    receiptNo: `REC-${nonce}`,
    studentId: testStudentId,
    studentName: 'Security Audit Student',
    class: '10',
    rollNo: '1',
    method: 'Cash',
    paymentMethod: 'Cash',
    date: '2081-01-15',
    status: 'SUCCESS',
    transactionType: 'FEE_PAYMENT',
    paymentGroupId: `PAY_GRP_${nonce}`,
    sourceTransactionId: prodTxId,
    isProduction: true,
    isTest: false,
    createdAt: '2081-01-15',
    createdBy: 'Admin Cashier',
    creatorUid: auth.currentUser?.uid || 'admin',
    academicYearId: '2081',
    timestamp: serverTimestamp()
  });

  // 2. Paid Remit Bill fixture
  await setDoc(doc(db, 'remitBills', paidBillId), {
    id: paidBillId,
    billNo: `BIL-${nonce}`,
    studentId: testStudentId,
    studentName: 'Security Audit Student',
    class: '10',
    totalAmount: 5000,
    amount: 5000,
    paidAmount: 5000,
    dueAmount: 0,
    status: 'paid',
    transactionId: prodTxId,
    paymentGroupId: `PAY_GRP_${nonce}`,
    createdAt: '2081-01-15',
    createdBy: 'Admin Cashier'
  });

  // 3. Fee Collection Cash Ledger entry
  await setDoc(doc(db, 'cash_ledger', cashLedgerId), {
    id: cashLedgerId,
    type: 'Income',
    amount: 5000,
    category: 'Fee Collection',
    transactionId: prodTxId,
    sourceTransactionId: prodTxId,
    paymentGroupId: `PAY_GRP_${nonce}`,
    receiptNo: `REC-${nonce}`,
    date: '2081-01-15',
    recordedBy: 'Admin Cashier'
  });

  console.log('Fixtures established successfully.\n');

  // =============================================================
  // SECTION 1: PRODUCTION TRANSACTION IMMUTABILITY TESTS
  // =============================================================
  console.log('--- SECTION 1: PRODUCTION TRANSACTION DIRECT MUTATION TESTS ---');

  // 1. Direct update amount
  try {
    await updateDoc(doc(db, 'transactions', prodTxId), { amount: 1000 });
    record('SEC-TX-1', 'Direct update transaction amount', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-TX-1', 'Direct update transaction amount rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 2. Direct update status to unauthorized value
  try {
    await updateDoc(doc(db, 'transactions', prodTxId), { status: 'DRAFT' });
    record('SEC-TX-2', 'Direct update transaction status to DRAFT', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-TX-2', 'Direct update transaction status to DRAFT rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 3. Direct update isTest -> true
  try {
    await updateDoc(doc(db, 'transactions', prodTxId), { isTest: true });
    record('SEC-TX-3', 'Direct spoof update isTest to true', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-TX-3', 'Direct spoof update isTest to true rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 4. Direct update isSandbox -> true
  try {
    await updateDoc(doc(db, 'transactions', prodTxId), { isSandbox: true });
    record('SEC-TX-4', 'Direct spoof update isSandbox to true', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-TX-4', 'Direct spoof update isSandbox to true rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 5. Direct update environment -> 'test'
  try {
    await updateDoc(doc(db, 'transactions', prodTxId), { environment: 'test' });
    record('SEC-TX-5', 'Direct spoof update environment to test', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-TX-5', 'Direct spoof update environment to test rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 6. Direct update paymentGroupId
  try {
    await updateDoc(doc(db, 'transactions', prodTxId), { paymentGroupId: 'SPOOFED_GROUP' });
    record('SEC-TX-6', 'Direct update paymentGroupId', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-TX-6', 'Direct update paymentGroupId rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 7. Direct update sourceTransactionId
  try {
    await updateDoc(doc(db, 'transactions', prodTxId), { sourceTransactionId: 'SPOOFED_SOURCE' });
    record('SEC-TX-7', 'Direct update sourceTransactionId', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-TX-7', 'Direct update sourceTransactionId rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 8. Direct update studentId
  try {
    await updateDoc(doc(db, 'transactions', prodTxId), { studentId: 'SPOOFED_STUDENT' });
    record('SEC-TX-8', 'Direct update studentId', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-TX-8', 'Direct update studentId rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 9. Direct update receipt
  try {
    await updateDoc(doc(db, 'transactions', prodTxId), { receipt: 'REC-FORGED' });
    record('SEC-TX-9', 'Direct update receipt/receiptNo', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-TX-9', 'Direct update receipt/receiptNo rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 10. Direct delete production transaction
  try {
    await deleteDoc(doc(db, 'transactions', prodTxId));
    record('SEC-TX-10', 'Direct delete production transaction', false, 'Expected PERMISSION_DENIED but delete succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-TX-10', 'Direct delete production transaction rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // =============================================================
  // SECTION 2: PAID REMIT BILL IMMUTABILITY TESTS
  // =============================================================
  console.log('\n--- SECTION 2: PAID REMIT BILL DIRECT MUTATION TESTS ---');

  // 1. Direct update paidAmount -> 0 on paid bill
  try {
    await updateDoc(doc(db, 'remitBills', paidBillId), { paidAmount: 0 });
    record('SEC-BILL-1', 'Direct update paidAmount to 0 on paid bill', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-BILL-1', 'Direct update paidAmount to 0 on paid bill rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 2. Direct update status -> draft on paid bill
  try {
    await updateDoc(doc(db, 'remitBills', paidBillId), { status: 'draft' });
    record('SEC-BILL-2', 'Direct update status to draft on paid bill', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-BILL-2', 'Direct update status to draft on paid bill rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 3. Direct update totalAmount on bill
  try {
    await updateDoc(doc(db, 'remitBills', paidBillId), { totalAmount: 1000 });
    record('SEC-BILL-3', 'Direct update totalAmount on bill', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-BILL-3', 'Direct update totalAmount on bill rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 4. Direct detach transactionId from paid bill
  try {
    await updateDoc(doc(db, 'remitBills', paidBillId), { transactionId: '' });
    record('SEC-BILL-4', 'Direct detach transactionId on paid bill', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-BILL-4', 'Direct detach transactionId on paid bill rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 5. Direct change studentId on bill
  try {
    await updateDoc(doc(db, 'remitBills', paidBillId), { studentId: 'SPOOFED_STUDENT' });
    record('SEC-BILL-5', 'Direct change studentId on bill', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-BILL-5', 'Direct change studentId on bill rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 6. Direct delete on paid bill
  try {
    await deleteDoc(doc(db, 'remitBills', paidBillId));
    record('SEC-BILL-6', 'Direct delete on paid bill', false, 'Expected PERMISSION_DENIED but delete succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-BILL-6', 'Direct delete on paid bill rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // =============================================================
  // SECTION 3: CASH LEDGER FEE COLLECTION TESTS
  // =============================================================
  console.log('\n--- SECTION 3: CASH LEDGER FEE COLLECTION DIRECT MUTATION TESTS ---');

  // 1. Direct update amount on Fee Collection entry
  try {
    await updateDoc(doc(db, 'cash_ledger', cashLedgerId), { amount: 100 });
    record('SEC-CASH-1', 'Direct update amount on Fee Collection cash ledger entry', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-CASH-1', 'Direct update amount on Fee Collection cash ledger entry rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 2. Direct update category on Fee Collection entry
  try {
    await updateDoc(doc(db, 'cash_ledger', cashLedgerId), { category: 'General Inflow' });
    record('SEC-CASH-2', 'Direct update category on Fee Collection cash ledger entry', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-CASH-2', 'Direct update category on Fee Collection cash ledger entry rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 3. Direct update type on Fee Collection entry
  try {
    await updateDoc(doc(db, 'cash_ledger', cashLedgerId), { type: 'Expense' });
    record('SEC-CASH-3', 'Direct update type on Fee Collection cash ledger entry', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-CASH-3', 'Direct update type on Fee Collection cash ledger entry rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 4. Direct removal of transactionId on Fee Collection entry
  try {
    await updateDoc(doc(db, 'cash_ledger', cashLedgerId), { transactionId: '' });
    record('SEC-CASH-4', 'Direct removal of transactionId on Fee Collection cash ledger entry', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-CASH-4', 'Direct removal of transactionId on Fee Collection cash ledger entry rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // 5. Direct delete on Fee Collection cash ledger entry
  try {
    await deleteDoc(doc(db, 'cash_ledger', cashLedgerId));
    record('SEC-CASH-5', 'Direct delete on Fee Collection cash ledger entry', false, 'Expected PERMISSION_DENIED but delete succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-CASH-5', 'Direct delete on Fee Collection cash ledger entry rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // =============================================================
  // SECTION 4: AUDIT LOGS & REFUND RECORDS APPEND-ONLY TESTS
  // =============================================================
  console.log('\n--- SECTION 4: AUDIT LOGS & REFUND RECORDS APPEND-ONLY TESTS ---');

  const auditLogId = `AUDIT_${nonce}`;
  await setDoc(doc(db, 'ledger_audit_logs', auditLogId), {
    id: auditLogId,
    actionType: 'TEST_AUDIT',
    adminEmail: 'admin_test_integration@shikshantar.edu.np',
    timestamp: serverTimestamp()
  });

  // Direct update audit log
  try {
    await updateDoc(doc(db, 'ledger_audit_logs', auditLogId), { actionType: 'FORGED_AUDIT' });
    record('SEC-AUDIT-1', 'Direct update on ledger_audit_logs', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-AUDIT-1', 'Direct update on ledger_audit_logs rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // Direct delete audit log
  try {
    await deleteDoc(doc(db, 'ledger_audit_logs', auditLogId));
    record('SEC-AUDIT-2', 'Direct delete on ledger_audit_logs', false, 'Expected PERMISSION_DENIED but delete succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-AUDIT-2', 'Direct delete on ledger_audit_logs rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  const refundDocId = `REFUND_${nonce}`;
  await setDoc(doc(db, 'refund_records', refundDocId), {
    id: refundDocId,
    amount: 1000,
    sourceTransactionId: prodTxId,
    status: 'REFUNDED_TO_GUARDIAN',
    timestamp: serverTimestamp()
  });

  // Direct update refund record
  try {
    await updateDoc(doc(db, 'refund_records', refundDocId), { amount: 9999 });
    record('SEC-REFUND-1', 'Direct update on refund_records', false, 'Expected PERMISSION_DENIED but update succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-REFUND-1', 'Direct update on refund_records rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // Direct delete refund record
  try {
    await deleteDoc(doc(db, 'refund_records', refundDocId));
    record('SEC-REFUND-2', 'Direct delete on refund_records', false, 'Expected PERMISSION_DENIED but delete succeeded!');
  } catch (err: any) {
    const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
    record('SEC-REFUND-2', 'Direct delete on refund_records rejected by Firestore rules', isDenied, isDenied ? 'Rejected with PERMISSION_DENIED' : err.message, err.code);
  }

  // SUMMARY
  const allPassed = testResults.every(r => r.passed);
  console.log('\n==============================================================================');
  console.log(`DIRECT DATABASE SECURITY SUITE: ${allPassed ? 'ALL PASS' : 'SOME FAILED'} (${testResults.filter(r => r.passed).length}/${testResults.length})`);
  console.log('==============================================================================\n');

  if (!allPassed) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runDirectSecurityVerification().catch(err => {
  console.error('Test suite execution error:', err);
  process.exit(1);
});
