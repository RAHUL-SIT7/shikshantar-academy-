import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc 
} from 'firebase/firestore';
import { 
  recordTest, 
  adminDb, 
  createClientContext, 
  TestClientContext 
} from './framework';

export async function runPartITests(): Promise<void> {
  console.log('\n======================================================================');
  console.log('PART I: RESULTS MODULE CROSS-ACCESS & STABLE IDENTITY');
  console.log('======================================================================\n');

  const permIdA = 'STU-RES-001';
  const permIdB = 'STU-RES-002';

  const studentA = await createClientContext({ 
    role: 'student', 
    emailPrefix: 'res_std_a',
    permanentStudentId: permIdA,
    admissionNo: 'ADM-2081-01',
    class: '10'
  });

  const studentB = await createClientContext({ 
    role: 'student', 
    emailPrefix: 'res_std_b',
    permanentStudentId: permIdB,
    admissionNo: 'ADM-2081-02',
    class: '10'
  });

  const resAId = 'result_res_001_a';
  const resBId = 'result_res_002_b';

  // Seed results tagged with permanent studentId
  await adminDb.collection('results').doc(resAId).set({
    resultId: resAId,
    studentId: studentA.uid,
    permanentStudentId: permIdA,
    rollNumber: 1,
    examType: 'Annual Examination',
    class: '10',
    gpa: 3.8,
    published: true,
  });

  await adminDb.collection('results').doc(resBId).set({
    resultId: resBId,
    studentId: studentB.uid,
    permanentStudentId: permIdB,
    rollNumber: 2,
    examType: 'Annual Examination',
    class: '10',
    gpa: 3.6,
    published: true,
  });

  // 1. Student A accesses own result -> ALLOWED
  try {
    let allowed = false;
    try {
      const snap = await getDoc(doc(studentA.db, 'results', resAId));
      allowed = snap.exists();
    } catch (_) {}
    recordTest({
      id: 'RES-01',
      category: 'RESULTS ACCESS',
      scenario: 'Student A accesses own academic result',
      command: 'getDoc(studentADb, results/resAId)',
      input: { caller: studentA.uid, resultStudentId: studentA.uid },
      operation: 'Owner read of published examination result',
      expected: 'ALLOWED (Doc retrieved)',
      actual: allowed ? 'ALLOWED (Doc retrieved)' : 'DENIED (Unexpected block)',
      difference: allowed ? 'None (Matched)' : 'Owner result read failed',
      status: allowed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `allowed=${allowed}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'RES-01', category: 'RESULTS ACCESS', scenario: 'Student own result', command: 'getDoc', input: {}, operation: 'Read', expected: 'ALLOWED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 2. Student A accesses Student B result -> DENIED
  try {
    let denied = false;
    try {
      await getDoc(doc(studentA.db, 'results', resBId));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'RES-02',
      category: 'RESULTS ACCESS',
      scenario: 'Student A attempts to access Student B academic result',
      command: 'getDoc(studentADb, results/resBId)',
      input: { caller: studentA.uid, targetResultOwner: studentB.uid },
      operation: 'Cross-student academic result read attempt',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (ACADEMIC LEAK)',
      difference: denied ? 'None (Matched)' : 'Cross-student result read allowed',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'RES-02', category: 'RESULTS ACCESS', scenario: 'Student read other result', command: 'getDoc', input: {}, operation: 'Read', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 3. Roll-number changes do not transfer ownership
  // Simulate promotion or roll reshuffle: Student A roll becomes 2, Student B roll becomes 1
  try {
    await adminDb.collection('users').doc(studentA.uid).update({ rollNumber: 2 });
    await adminDb.collection('users').doc(studentB.uid).update({ rollNumber: 1 });

    // Student A tries to read Result B (which has rollNumber: 2) -> MUST STILL BE DENIED!
    let denied = false;
    try {
      await getDoc(doc(studentA.db, 'results', resBId));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'RES-03',
      category: 'RESULTS ACCESS',
      scenario: 'Roll number reshuffle does not transfer result ownership',
      command: 'Roll reshuffle (A=2, B=1) -> getDoc(studentADb, results/resBId)',
      input: { studentA_newRoll: 2, resultB_oldRoll: 2, resultB_studentId: studentB.uid },
      operation: 'Verification that ownership is anchored to stable studentId, not rollNumber',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (OWNERSHIP LEAK)',
      difference: denied ? 'None (Matched)' : 'Roll change transferred result access',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'RES-03', category: 'RESULTS ACCESS', scenario: 'Roll number transfer test', command: 'update/get', input: {}, operation: 'Check stable ID', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }
}
