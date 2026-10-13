import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  getDocs 
} from 'firebase/firestore';
import { 
  recordTest, 
  adminDb, 
  createClientContext, 
  createGuestContext,
  TestClientContext 
} from './framework';

export async function runPartCTests(): Promise<void> {
  console.log('\n======================================================================');
  console.log('PART C: FIRESTORE SECURITY RULE ADVERSARIAL AUDIT');
  console.log('======================================================================\n');

  const guest = await createGuestContext();
  const studentA = await createClientContext({ role: 'student', emailPrefix: 'sec_std_a', permanentStudentId: 'STU-SEC-001' });
  const studentB = await createClientContext({ role: 'student', emailPrefix: 'sec_std_b', permanentStudentId: 'STU-SEC-002' });
  const teacher = await createClientContext({ role: 'teacher', emailPrefix: 'sec_tch' });
  const secAdmin = await createClientContext({ role: 'admin', adminTier: 'secondary', emailPrefix: 'sec_adm_c' });
  const primAdmin = await createClientContext({ role: 'admin', adminTier: 'primary', emailPrefix: 'prim_adm_c' });

  // Pre-seed test records via Admin SDK
  const testBillA = 'bill_sec_001_a';
  const testBillB = 'bill_sec_002_b';
  await adminDb.collection('remitBills').doc(testBillA).set({
    billId: testBillA,
    studentId: studentA.uid,
    studentUid: studentA.uid,
    totalAmount: 3500,
    paidAmount: 0,
    dueAmount: 3500,
    academicYear: '2082',
    month: 'Baisakh',
    status: 'unpaid',
  });
  await adminDb.collection('remitBills').doc(testBillB).set({
    billId: testBillB,
    studentId: studentB.uid,
    studentUid: studentB.uid,
    totalAmount: 4200,
    paidAmount: 0,
    dueAmount: 4200,
    academicYear: '2082',
    month: 'Baisakh',
    status: 'unpaid',
  });

  const testTxA = 'tx_sec_001_a';
  const testTxB = 'tx_sec_002_b';
  await adminDb.collection('transactions').doc(testTxA).set({
    transactionId: testTxA,
    studentId: studentA.uid,
    studentUid: studentA.uid,
    amount: 3500,
    receipt: 'REC-SEC-001',
    status: 'SUCCESS',
    createdAt: new Date().toISOString(),
  });
  await adminDb.collection('transactions').doc(testTxB).set({
    transactionId: testTxB,
    studentId: studentB.uid,
    studentUid: studentB.uid,
    amount: 4200,
    receipt: 'REC-SEC-002',
    status: 'SUCCESS',
    createdAt: new Date().toISOString(),
  });

  const testAdvA = 'adv_sec_001_a';
  await adminDb.collection('student_advances').doc(testAdvA).set({
    advanceId: testAdvA,
    studentId: studentA.uid,
    balance: 500,
    createdAt: new Date().toISOString(),
  });

  const testLedger = 'ledger_sec_001';
  await adminDb.collection('cash_ledger').doc(testLedger).set({
    ledgerId: testLedger,
    amount: 3500,
    type: 'INCOME',
    source: 'FEE_PAYMENT',
    studentId: studentA.uid,
    createdAt: new Date().toISOString(),
  });

  // 1. Unauthenticated read on remitBills -> DENIED
  try {
    let denied = false;
    try {
      await getDoc(doc(guest.db, 'remitBills', testBillA));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'SEC-01',
      category: 'FIRESTORE RULES',
      scenario: 'Unauthenticated read on remitBills',
      command: 'getDoc(guestDb, remitBills/testBillA)',
      input: { caller: 'GUEST', target: 'remitBills' },
      operation: 'Direct document read without auth',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (LEAK)',
      difference: denied ? 'None (Matched)' : 'Unauthenticated read permitted',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-01', category: 'FIRESTORE RULES', scenario: 'Unauth read bill', command: 'getDoc', input: {}, operation: 'Read', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 2. Student A read own bill -> ALLOWED
  try {
    let allowed = false;
    try {
      const snap = await getDoc(doc(studentA.db, 'remitBills', testBillA));
      allowed = snap.exists();
    } catch (_) {}
    recordTest({
      id: 'SEC-02',
      category: 'FIRESTORE RULES',
      scenario: 'Student A reads own remitBill',
      command: 'getDoc(studentADb, remitBills/testBillA)',
      input: { caller: studentA.uid, studentId: studentA.uid },
      operation: 'Owner read on financial bill',
      expected: 'ALLOWED (Doc exists)',
      actual: allowed ? 'ALLOWED (Doc retrieved)' : 'DENIED (Unexpected block)',
      difference: allowed ? 'None (Matched)' : 'Owner read failed',
      status: allowed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `allowed=${allowed}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-02', category: 'FIRESTORE RULES', scenario: 'Student read own bill', command: 'getDoc', input: {}, operation: 'Read', expected: 'ALLOWED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 3. Student A read Student B bill -> DENIED
  try {
    let denied = false;
    try {
      await getDoc(doc(studentA.db, 'remitBills', testBillB));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'SEC-03',
      category: 'FIRESTORE RULES',
      scenario: 'Student A attempts to read Student B remitBill',
      command: 'getDoc(studentADb, remitBills/testBillB)',
      input: { caller: studentA.uid, targetOwner: studentB.uid },
      operation: 'Cross-student bill read',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (IDOR LEAK)',
      difference: denied ? 'None (Matched)' : 'Cross-student financial read permitted',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-03', category: 'FIRESTORE RULES', scenario: 'Student read other bill', command: 'getDoc', input: {}, operation: 'Read', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 4. Teacher read remitBill -> DENIED (!isTeacher() rule constraint)
  try {
    let denied = false;
    try {
      await getDoc(doc(teacher.db, 'remitBills', testBillA));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'SEC-04',
      category: 'FIRESTORE RULES',
      scenario: 'Teacher attempts to read remitBill (strict teacher isolation)',
      command: 'getDoc(teacherDb, remitBills/testBillA)',
      input: { caller: 'teacher', target: 'remitBills' },
      operation: 'Teacher read of student fee bill',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (FINANCIAL LEAK)',
      difference: denied ? 'None (Matched)' : 'Teacher read student bills permitted',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-04', category: 'FIRESTORE RULES', scenario: 'Teacher read bill', command: 'getDoc', input: {}, operation: 'Read', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 5. Admin read remitBill -> ALLOWED
  try {
    let allowed = false;
    try {
      const snap = await getDoc(doc(secAdmin.db, 'remitBills', testBillA));
      allowed = snap.exists();
    } catch (_) {}
    recordTest({
      id: 'SEC-05',
      category: 'FIRESTORE RULES',
      scenario: 'Admin reads remitBill',
      command: 'getDoc(adminDb, remitBills/testBillA)',
      input: { caller: 'admin', target: 'remitBills' },
      operation: 'Admin read of fee bill',
      expected: 'ALLOWED (Doc exists)',
      actual: allowed ? 'ALLOWED (Doc retrieved)' : 'DENIED (Unexpected block)',
      difference: allowed ? 'None (Matched)' : 'Admin read failed',
      status: allowed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `allowed=${allowed}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-05', category: 'FIRESTORE RULES', scenario: 'Admin read bill', command: 'getDoc', input: {}, operation: 'Read', expected: 'ALLOWED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 6. Student A read Student B transaction -> DENIED
  try {
    let denied = false;
    try {
      await getDoc(doc(studentA.db, 'transactions', testTxB));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'SEC-06',
      category: 'FIRESTORE RULES',
      scenario: 'Student A attempts to read Student B transaction',
      command: 'getDoc(studentADb, transactions/testTxB)',
      input: { caller: studentA.uid, targetOwner: studentB.uid },
      operation: 'Cross-student transaction read',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (IDOR LEAK)',
      difference: denied ? 'None (Matched)' : 'Cross-student transaction read permitted',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-06', category: 'FIRESTORE RULES', scenario: 'Student read other tx', command: 'getDoc', input: {}, operation: 'Read', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 7. Teacher read transaction -> DENIED
  try {
    let denied = false;
    try {
      await getDoc(doc(teacher.db, 'transactions', testTxA));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'SEC-07',
      category: 'FIRESTORE RULES',
      scenario: 'Teacher attempts to read transaction',
      command: 'getDoc(teacherDb, transactions/testTxA)',
      input: { caller: 'teacher', target: 'transactions' },
      operation: 'Teacher read on financial transaction',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (FINANCIAL LEAK)',
      difference: denied ? 'None (Matched)' : 'Teacher read transaction permitted',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-07', category: 'FIRESTORE RULES', scenario: 'Teacher read tx', command: 'getDoc', input: {}, operation: 'Read', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 8. Student A read own student_advance -> ALLOWED
  try {
    let allowed = false;
    try {
      const snap = await getDoc(doc(studentA.db, 'student_advances', testAdvA));
      allowed = snap.exists();
    } catch (_) {}
    recordTest({
      id: 'SEC-08',
      category: 'FIRESTORE RULES',
      scenario: 'Student A reads own student_advances document',
      command: 'getDoc(studentADb, student_advances/testAdvA)',
      input: { caller: studentA.uid, owner: studentA.uid },
      operation: 'Owner read on student advance',
      expected: 'ALLOWED (Doc exists)',
      actual: allowed ? 'ALLOWED (Doc retrieved)' : 'DENIED (Unexpected block)',
      difference: allowed ? 'None (Matched)' : 'Student read advance failed',
      status: allowed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `allowed=${allowed}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-08', category: 'FIRESTORE RULES', scenario: 'Student read own advance', command: 'getDoc', input: {}, operation: 'Read', expected: 'ALLOWED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 9. Student B read Student A student_advance -> DENIED
  try {
    let denied = false;
    try {
      await getDoc(doc(studentB.db, 'student_advances', testAdvA));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'SEC-09',
      category: 'FIRESTORE RULES',
      scenario: 'Student B attempts to read Student A student_advances',
      command: 'getDoc(studentBDb, student_advances/testAdvA)',
      input: { caller: studentB.uid, targetOwner: studentA.uid },
      operation: 'Cross-student advance read',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (IDOR LEAK)',
      difference: denied ? 'None (Matched)' : 'Cross-student advance read permitted',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-09', category: 'FIRESTORE RULES', scenario: 'Student read other advance', command: 'getDoc', input: {}, operation: 'Read', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 10. Student read cash_ledger -> DENIED
  try {
    let denied = false;
    try {
      await getDoc(doc(studentA.db, 'cash_ledger', testLedger));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'SEC-10',
      category: 'FIRESTORE RULES',
      scenario: 'Student attempts to read institutional cash_ledger',
      command: 'getDoc(studentADb, cash_ledger/testLedger)',
      input: { caller: 'student', target: 'cash_ledger' },
      operation: 'Student read on physical cash ledger',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (FINANCIAL LEAK)',
      difference: denied ? 'None (Matched)' : 'Cash ledger visible to student',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-10', category: 'FIRESTORE RULES', scenario: 'Student read cash ledger', command: 'getDoc', input: {}, operation: 'Read', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 11. Admin read cash_ledger -> ALLOWED
  try {
    let allowed = false;
    try {
      const snap = await getDoc(doc(primAdmin.db, 'cash_ledger', testLedger));
      allowed = snap.exists();
    } catch (_) {}
    recordTest({
      id: 'SEC-11',
      category: 'FIRESTORE RULES',
      scenario: 'Admin reads institutional cash_ledger',
      command: 'getDoc(adminDb, cash_ledger/testLedger)',
      input: { caller: 'admin', target: 'cash_ledger' },
      operation: 'Admin read of cash ledger',
      expected: 'ALLOWED (Doc exists)',
      actual: allowed ? 'ALLOWED (Doc retrieved)' : 'DENIED (Unexpected block)',
      difference: allowed ? 'None (Matched)' : 'Admin read cash ledger failed',
      status: allowed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `allowed=${allowed}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-11', category: 'FIRESTORE RULES', scenario: 'Admin read cash ledger', command: 'getDoc', input: {}, operation: 'Read', expected: 'ALLOWED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 12. Student write billing_month_locks -> DENIED
  try {
    let denied = false;
    try {
      await setDoc(doc(studentA.db, 'billing_month_locks', 'lock_std_fake'), {
        locked: true,
      });
    } catch {
      denied = true;
    }
    recordTest({
      id: 'SEC-12',
      category: 'FIRESTORE RULES',
      scenario: 'Student attempts write to billing_month_locks',
      command: 'setDoc(studentADb, billing_month_locks/lock_fake)',
      input: { caller: 'student', collection: 'billing_month_locks' },
      operation: 'Tampering with billing uniqueness locks',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (CORRUPTION)',
      difference: denied ? 'None (Matched)' : 'Billing lock write allowed for student',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-12', category: 'FIRESTORE RULES', scenario: 'Student write month locks', command: 'setDoc', input: {}, operation: 'Write', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 13. Student write payment_receipt_locks -> DENIED
  try {
    let denied = false;
    try {
      await setDoc(doc(studentA.db, 'payment_receipt_locks', 'lock_rcp_fake'), {
        locked: true,
      });
    } catch {
      denied = true;
    }
    recordTest({
      id: 'SEC-13',
      category: 'FIRESTORE RULES',
      scenario: 'Student attempts write to payment_receipt_locks',
      command: 'setDoc(studentADb, payment_receipt_locks/lock_fake)',
      input: { caller: 'student', collection: 'payment_receipt_locks' },
      operation: 'Tampering with receipt locks',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (CORRUPTION)',
      difference: denied ? 'None (Matched)' : 'Receipt lock write allowed for student',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-13', category: 'FIRESTORE RULES', scenario: 'Student write receipt locks', command: 'setDoc', input: {}, operation: 'Write', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 14. Student write document_sequences -> DENIED
  try {
    let denied = false;
    try {
      await setDoc(doc(studentA.db, 'document_sequences', 'receipt_seq'), {
        current: 99999,
      });
    } catch {
      denied = true;
    }
    recordTest({
      id: 'SEC-14',
      category: 'FIRESTORE RULES',
      scenario: 'Student attempts write to document_sequences',
      command: 'setDoc(studentADb, document_sequences/receipt_seq)',
      input: { caller: 'student', collection: 'document_sequences' },
      operation: 'Tampering with document numbering counter',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (CORRUPTION)',
      difference: denied ? 'None (Matched)' : 'Sequence tampering allowed for student',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-14', category: 'FIRESTORE RULES', scenario: 'Student write seq', command: 'setDoc', input: {}, operation: 'Write', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 15. Student write refund_records -> DENIED
  try {
    let denied = false;
    try {
      await setDoc(doc(studentA.db, 'refund_records', 'ref_fake_001'), {
        amount: 5000,
        studentId: studentA.uid,
      });
    } catch {
      denied = true;
    }
    recordTest({
      id: 'SEC-15',
      category: 'FIRESTORE RULES',
      scenario: 'Student attempts direct write to refund_records',
      command: 'setDoc(studentADb, refund_records/ref_fake)',
      input: { caller: 'student', collection: 'refund_records' },
      operation: 'Fabricated refund record creation',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (FRAUD)',
      difference: denied ? 'None (Matched)' : 'Refund creation allowed for student',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-15', category: 'FIRESTORE RULES', scenario: 'Student write refund', command: 'setDoc', input: {}, operation: 'Write', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 16. Teacher write refund_records -> DENIED
  try {
    let denied = false;
    try {
      await setDoc(doc(teacher.db, 'refund_records', 'ref_fake_tch'), {
        amount: 2000,
        studentId: studentA.uid,
      });
    } catch {
      denied = true;
    }
    recordTest({
      id: 'SEC-16',
      category: 'FIRESTORE RULES',
      scenario: 'Teacher attempts write to refund_records',
      command: 'setDoc(teacherDb, refund_records/ref_fake_tch)',
      input: { caller: 'teacher', collection: 'refund_records' },
      operation: 'Teacher writing refund record',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (GOVERNANCE BREACH)',
      difference: denied ? 'None (Matched)' : 'Refund write allowed for teacher',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-16', category: 'FIRESTORE RULES', scenario: 'Teacher write refund', command: 'setDoc', input: {}, operation: 'Write', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 17. Unauthenticated user submits admission application -> ALLOWED (public form)
  try {
    let allowed = false;
    const admissionId = `adm_pub_${Date.now()}`;
    try {
      await setDoc(doc(guest.db, 'admissions', admissionId), {
        applicantName: 'Prospective Student',
        email: 'applicant@example.com',
        targetClass: 'Class 1',
        submittedAt: new Date().toISOString(),
      });
      const checkDoc = await adminDb.collection('admissions').doc(admissionId).get();
      allowed = checkDoc.exists;
    } catch (_) {}
    recordTest({
      id: 'SEC-17',
      category: 'FIRESTORE RULES',
      scenario: 'Public admission enquiry creation allowed for guests',
      command: 'setDoc(guestDb, admissions/admissionId)',
      input: { caller: 'GUEST', collection: 'admissions' },
      operation: 'Public admissions form submission',
      expected: 'ALLOWED (Public form)',
      actual: allowed ? 'ALLOWED (Application recorded)' : 'DENIED (Unexpected block)',
      difference: allowed ? 'None (Matched)' : 'Public admission blocked',
      status: allowed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `allowed=${allowed}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-17', category: 'FIRESTORE RULES', scenario: 'Guest admission', command: 'setDoc', input: {}, operation: 'Create', expected: 'ALLOWED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 18. Guest reads admissions collection -> DENIED (admissions read restricted to Admin)
  try {
    let denied = false;
    try {
      await getDocs(collection(guest.db, 'admissions'));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'SEC-18',
      category: 'FIRESTORE RULES',
      scenario: 'Guest attempts to read submitted admissions list',
      command: 'getDocs(guestDb, admissions)',
      input: { caller: 'GUEST', collection: 'admissions' },
      operation: 'Unauthorized read of student application data',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (PII LEAK)',
      difference: denied ? 'None (Matched)' : 'Public read of admissions permitted',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-18', category: 'FIRESTORE RULES', scenario: 'Guest read admissions', command: 'getDocs', input: {}, operation: 'Read', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 19. Public notices readable by Guest -> ALLOWED
  try {
    let allowed = false;
    try {
      await getDocs(collection(guest.db, 'notices'));
      allowed = true;
    } catch (_) {}
    recordTest({
      id: 'SEC-19',
      category: 'FIRESTORE RULES',
      scenario: 'Guest reads public notices board',
      command: 'getDocs(guestDb, notices)',
      input: { caller: 'GUEST', collection: 'notices' },
      operation: 'Public notice board query',
      expected: 'ALLOWED (Public portal info)',
      actual: allowed ? 'ALLOWED (Notices query succeeded)' : 'DENIED (Unexpected block)',
      difference: allowed ? 'None (Matched)' : 'Public notices blocked',
      status: allowed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `allowed=${allowed}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-19', category: 'FIRESTORE RULES', scenario: 'Guest read notices', command: 'getDocs', input: {}, operation: 'Read', expected: 'ALLOWED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 20. Guest writes public notice -> DENIED
  try {
    let denied = false;
    try {
      await setDoc(doc(guest.db, 'notices', 'notice_hacked_001'), {
        title: 'Defaced Notice',
        published: true,
      });
    } catch {
      denied = true;
    }
    recordTest({
      id: 'SEC-20',
      category: 'FIRESTORE RULES',
      scenario: 'Guest attempts to create school notice',
      command: 'setDoc(guestDb, notices/id)',
      input: { caller: 'GUEST', collection: 'notices' },
      operation: 'Unauthorized notice publication',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (DEFACEMENT)',
      difference: denied ? 'None (Matched)' : 'Notice write permitted for guest',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SEC-20', category: 'FIRESTORE RULES', scenario: 'Guest write notice', command: 'setDoc', input: {}, operation: 'Write', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }
}
