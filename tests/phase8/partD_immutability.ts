import { 
  doc, 
  updateDoc, 
  deleteDoc, 
  setDoc,
  getDoc
} from 'firebase/firestore';
import { 
  recordTest, 
  adminDb, 
  createClientContext, 
  TestClientContext 
} from './framework';

export async function runPartDTests(): Promise<void> {
  console.log('\n======================================================================');
  console.log('PART D: FINANCIAL FIELD IMMUTABILITY');
  console.log('======================================================================\n');

  const student = await createClientContext({ role: 'student', emailPrefix: 'mut_std' });
  const teacher = await createClientContext({ role: 'teacher', emailPrefix: 'mut_tch' });

  // Seed baseline financial docs
  const testTxId = 'tx_immut_test_001';
  await adminDb.collection('transactions').doc(testTxId).set({
    transactionId: testTxId,
    studentId: student.uid,
    amount: 5000,
    receipt: 'REC-IMMUT-001',
    status: 'SUCCESS',
    createdAt: new Date().toISOString(),
  });

  const testBillId = 'bill_immut_test_001';
  await adminDb.collection('remitBills').doc(testBillId).set({
    billId: testBillId,
    studentId: student.uid,
    totalAmount: 5000,
    paidAmount: 5000,
    dueAmount: 0,
    status: 'paid',
    academicYear: '2082',
    month: 'Baisakh',
  });

  const testAdvId = 'adv_immut_test_001';
  await adminDb.collection('student_advances').doc(testAdvId).set({
    advanceId: testAdvId,
    studentId: student.uid,
    balance: 1000,
  });

  const testLedgerId = 'ledger_immut_test_001';
  await adminDb.collection('cash_ledger').doc(testLedgerId).set({
    ledgerId: testLedgerId,
    studentId: student.uid,
    amount: 5000,
    receipt: 'REC-IMMUT-001',
    type: 'INCOME',
  });

  // 1. Student attempts direct mutation of transaction amount
  try {
    let denied = false;
    try {
      await updateDoc(doc(student.db, 'transactions', testTxId), { amount: 100 });
    } catch {
      denied = true;
    }
    recordTest({
      id: 'IMMUT-01',
      category: 'FINANCIAL IMMUTABILITY',
      scenario: 'Student attempts direct alteration of transaction amount',
      command: 'updateDoc(transactions/id, { amount: 100 })',
      input: { originalAmount: 5000, maliciousAmount: 100 },
      operation: 'Tampering with settled transaction amount',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (FINANCIAL FRAUD)',
      difference: denied ? 'None (Matched)' : 'Transaction amount mutated directly',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'IMMUT-01', category: 'FINANCIAL IMMUTABILITY', scenario: 'Mutate tx amount', command: 'updateDoc', input: {}, operation: 'Mutate', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 2. Student attempts direct mutation of remitBill dueAmount
  try {
    let denied = false;
    try {
      await updateDoc(doc(student.db, 'remitBills', testBillId), { dueAmount: 0, status: 'paid' });
    } catch {
      denied = true;
    }
    recordTest({
      id: 'IMMUT-02',
      category: 'FINANCIAL IMMUTABILITY',
      scenario: 'Student attempts direct alteration of remitBill dueAmount & status',
      command: 'updateDoc(remitBills/id, { dueAmount: 0, status: "paid" })',
      input: { targetField: 'dueAmount', value: 0 },
      operation: 'Direct bill debt wipeout',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (FRAUD)',
      difference: denied ? 'None (Matched)' : 'Bill debt wiped directly',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'IMMUT-02', category: 'FINANCIAL IMMUTABILITY', scenario: 'Mutate bill due', command: 'updateDoc', input: {}, operation: 'Mutate', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 3. Student attempts direct mutation of student_advances balance
  try {
    let denied = false;
    try {
      await updateDoc(doc(student.db, 'student_advances', testAdvId), { balance: 999999 });
    } catch {
      denied = true;
    }
    recordTest({
      id: 'IMMUT-03',
      category: 'FINANCIAL IMMUTABILITY',
      scenario: 'Student attempts direct alteration of advance balance',
      command: 'updateDoc(student_advances/id, { balance: 999999 })',
      input: { originalBalance: 1000, maliciousBalance: 999999 },
      operation: 'Direct advance ledger inflation',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (THEFT)',
      difference: denied ? 'None (Matched)' : 'Advance balance inflated directly',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'IMMUT-03', category: 'FINANCIAL IMMUTABILITY', scenario: 'Mutate advance', command: 'updateDoc', input: {}, operation: 'Mutate', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 4. Student attempts direct mutation of cash_ledger
  try {
    let denied = false;
    try {
      await updateDoc(doc(student.db, 'cash_ledger', testLedgerId), { amount: 0 });
    } catch {
      denied = true;
    }
    recordTest({
      id: 'IMMUT-04',
      category: 'FINANCIAL IMMUTABILITY',
      scenario: 'Student attempts direct alteration of cash ledger entry',
      command: 'updateDoc(cash_ledger/id, { amount: 0 })',
      input: { targetField: 'amount', value: 0 },
      operation: 'Direct physical cash ledger erasure',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (CORRUPTION)',
      difference: denied ? 'None (Matched)' : 'Cash ledger modified directly',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'IMMUT-04', category: 'FINANCIAL IMMUTABILITY', scenario: 'Mutate cash ledger', command: 'updateDoc', input: {}, operation: 'Mutate', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 5. Teacher attempts direct mutation of transaction amount
  try {
    let denied = false;
    try {
      await updateDoc(doc(teacher.db, 'transactions', testTxId), { amount: 0 });
    } catch {
      denied = true;
    }
    recordTest({
      id: 'IMMUT-05',
      category: 'FINANCIAL IMMUTABILITY',
      scenario: 'Teacher attempts direct alteration of transaction amount',
      command: 'updateDoc(transactions/id, { amount: 0 })',
      input: { caller: 'teacher', targetField: 'amount', value: 0 },
      operation: 'Teacher altering settled transaction',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (BREACH)',
      difference: denied ? 'None (Matched)' : 'Transaction mutated by teacher',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'IMMUT-05', category: 'FINANCIAL IMMUTABILITY', scenario: 'Teacher mutate tx', command: 'updateDoc', input: {}, operation: 'Mutate', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 6. Teacher attempts direct deletion of settled transaction
  try {
    let denied = false;
    try {
      await deleteDoc(doc(teacher.db, 'transactions', testTxId));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'IMMUT-06',
      category: 'FINANCIAL IMMUTABILITY',
      scenario: 'Teacher attempts direct deletion of settled transaction',
      command: 'deleteDoc(transactions/id)',
      input: { caller: 'teacher', target: testTxId },
      operation: 'Teacher deleting financial transaction record',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (AUDIT ERASURE)',
      difference: denied ? 'None (Matched)' : 'Transaction deleted by teacher',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'IMMUT-06', category: 'FINANCIAL IMMUTABILITY', scenario: 'Teacher delete tx', command: 'deleteDoc', input: {}, operation: 'Delete', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }
}
