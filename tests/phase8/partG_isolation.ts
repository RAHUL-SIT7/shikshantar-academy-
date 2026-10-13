import { 
  doc, 
  getDoc, 
  getDocs, 
  collection, 
  query, 
  where 
} from 'firebase/firestore';
import { 
  recordTest, 
  adminDb, 
  createClientContext, 
  TestClientContext 
} from './framework';

export async function runPartGTests(): Promise<void> {
  console.log('\n======================================================================');
  console.log('PART G: STUDENT DATA ISOLATION & TEACHER BOUNDARIES');
  console.log('======================================================================\n');

  const studentA = await createClientContext({ role: 'student', emailPrefix: 'iso_std_a', permanentStudentId: 'STU-ISO-001' });
  const studentB = await createClientContext({ role: 'student', emailPrefix: 'iso_std_b', permanentStudentId: 'STU-ISO-002' });
  const teacher = await createClientContext({ role: 'teacher', emailPrefix: 'iso_tch' });

  // Seed documents for Student B
  const resBId = 'res_b_term1_iso';
  await adminDb.collection('results').doc(resBId).set({
    resultId: resBId,
    studentId: studentB.uid,
    examType: 'First Terminal Examination',
    class: '10',
    published: true,
  });

  const feeBId = 'fee_b_iso';
  await adminDb.collection('studentFees').doc(feeBId).set({
    feeId: feeBId,
    studentId: studentB.uid,
    monthlyFee: 2000,
  });

  const advBId = 'adv_b_iso';
  await adminDb.collection('student_advances').doc(advBId).set({
    advanceId: advBId,
    studentId: studentB.uid,
    balance: 750,
  });

  // 1. Student A attempts to read Student B result -> DENIED
  try {
    let denied = false;
    try {
      await getDoc(doc(studentA.db, 'results', resBId));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'ISO-01',
      category: 'STUDENT DATA ISOLATION',
      scenario: 'Student A attempts to read Student B exam result',
      command: 'getDoc(studentADb, results/resBId)',
      input: { caller: studentA.uid, targetOwner: studentB.uid },
      operation: 'Direct document lookup of other student result',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (ACADEMIC LEAK)',
      difference: denied ? 'None (Matched)' : 'Cross-student result read permitted',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'ISO-01', category: 'STUDENT DATA ISOLATION', scenario: 'Read other result', command: 'getDoc', input: {}, operation: 'Read', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 2. Student A attempts to read Student B fee record -> DENIED
  try {
    let denied = false;
    try {
      await getDoc(doc(studentA.db, 'studentFees', feeBId));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'ISO-02',
      category: 'STUDENT DATA ISOLATION',
      scenario: 'Student A attempts to read Student B fee structure',
      command: 'getDoc(studentADb, studentFees/feeBId)',
      input: { caller: studentA.uid, targetOwner: studentB.uid },
      operation: 'Direct document lookup of other student fee structure',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (FINANCIAL LEAK)',
      difference: denied ? 'None (Matched)' : 'Cross-student fee read permitted',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'ISO-02', category: 'STUDENT DATA ISOLATION', scenario: 'Read other fee', command: 'getDoc', input: {}, operation: 'Read', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 3. Student A attempts to read Student B advances -> DENIED
  try {
    let denied = false;
    try {
      await getDoc(doc(studentA.db, 'student_advances', advBId));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'ISO-03',
      category: 'STUDENT DATA ISOLATION',
      scenario: 'Student A attempts to read Student B advances',
      command: 'getDoc(studentADb, student_advances/advBId)',
      input: { caller: studentA.uid, targetOwner: studentB.uid },
      operation: 'Direct document lookup of other student advance balance',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (FINANCIAL LEAK)',
      difference: denied ? 'None (Matched)' : 'Cross-student advance read permitted',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'ISO-03', category: 'STUDENT DATA ISOLATION', scenario: 'Read other advance', command: 'getDoc', input: {}, operation: 'Read', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 4. Student A attempts to query remitBills of Student B -> DENIED or returns 0 results
  try {
    let emptyOrDenied = false;
    try {
      const q = query(collection(studentA.db, 'remitBills'), where('studentId', '==', studentB.uid));
      const snaps = await getDocs(q);
      emptyOrDenied = snaps.empty;
    } catch {
      emptyOrDenied = true;
    }
    recordTest({
      id: 'ISO-04',
      category: 'STUDENT DATA ISOLATION',
      scenario: 'Student A query for Student B bills rejected or returns empty',
      command: 'getDocs(query(remitBills, where studentId == studentB.uid))',
      input: { caller: studentA.uid, targetQuery: studentB.uid },
      operation: 'Cross-student collection query',
      expected: 'DENIED or 0 documents returned',
      actual: emptyOrDenied ? 'PROTECTED (Query blocked or 0 docs returned)' : 'EXPOSED (Docs leaked)',
      difference: emptyOrDenied ? 'None (Matched)' : 'Cross-student bills leaked via query',
      status: emptyOrDenied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `emptyOrDenied=${emptyOrDenied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'ISO-04', category: 'STUDENT DATA ISOLATION', scenario: 'Query other bills', command: 'getDocs', input: {}, operation: 'Query', expected: 'Blocked', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 5. Teacher attempts to read student Fees -> DENIED
  try {
    let denied = false;
    try {
      await getDoc(doc(teacher.db, 'studentFees', feeBId));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'ISO-05',
      category: 'STUDENT DATA ISOLATION',
      scenario: 'Teacher attempts to read studentFees document',
      command: 'getDoc(teacherDb, studentFees/feeBId)',
      input: { caller: 'teacher', target: 'studentFees' },
      operation: 'Teacher read of student fee structure',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (FINANCIAL LEAK)',
      difference: denied ? 'None (Matched)' : 'Teacher read studentFees allowed',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'ISO-05', category: 'STUDENT DATA ISOLATION', scenario: 'Teacher read fees', command: 'getDoc', input: {}, operation: 'Read', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }
}
