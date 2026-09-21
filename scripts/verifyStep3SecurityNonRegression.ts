import { db, auth } from '../src/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc 
} from 'firebase/firestore';
import * as fs from 'fs';

async function runSecurityNonRegressionTest() {
  console.log("==============================================================================");
  console.log("STEP 3 & STEP 4 SECURITY NON-REGRESSION AUDIT");
  console.log("==============================================================================");

  const results: Array<{ identity: string; test: string; expected: string; actual: string; status: 'PASS' | 'FAIL' }> = [];

  // Helper to ensure user exists and configure profile as Admin
  async function setupAccount(email: string, pass: string, role: string, studentId?: string) {
    // 1. Sign in as Admin to establish Admin context
    await signInWithEmailAndPassword(auth, adminEmail, adminPass);

    let targetUid = '';
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      targetUid = cred.user.uid;
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        targetUid = cred.user.uid;
      }
    }

    // Sign back in as Admin to write target user's role in /users collection
    await signInWithEmailAndPassword(auth, adminEmail, adminPass);

    const userDocData: any = {
      email,
      role,
      fullName: `Test ${role}`,
      updatedAt: new Date().toISOString()
    };
    if (studentId) userDocData.studentId = studentId;

    await setDoc(doc(db, 'users', targetUid), userDocData, { merge: true });
    return targetUid;
  }

  // Set up Admin account
  const adminEmail = 'admin_step4_audit@shikshantar.edu.np';
  const adminPass = 'AdminStep4Pass123!';
  let adminUid = '';
  try {
    const cred = await signInWithEmailAndPassword(auth, adminEmail, adminPass);
    adminUid = cred.user.uid;
  } catch (err: any) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
      const cred = await createUserWithEmailAndPassword(auth, adminEmail, adminPass);
      adminUid = cred.user.uid;
    }
  }

  await signInWithEmailAndPassword(auth, adminEmail, adminPass);
  await setDoc(doc(db, 'users', adminUid), {
    email: adminEmail,
    role: 'admin',
    fullName: 'Audit Admin'
  }, { merge: true });

  const teacherEmail = 'teacher_step4_audit@shikshantar.edu.np';
  const teacherPass = 'TeacherStep4Pass123!';
  const teacherUid = await setupAccount(teacherEmail, teacherPass, 'teacher');

  const studentAEmail = 'student_a_audit@shikshantar.edu.np';
  const studentAPass = 'StudentAPass123!';
  const studentAUid = await setupAccount(studentAEmail, studentAPass, 'student', 'STU_A_101');

  const studentBEmail = 'student_b_audit@shikshantar.edu.np';
  const studentBPass = 'StudentBPass123!';
  const studentBUid = await setupAccount(studentBEmail, studentBPass, 'student', 'STU_B_202');

  // Create test bill docs for Student A and Student B
  const billAId = 'BILL_SEC_STU_A_101';
  const billBId = 'BILL_SEC_STU_B_202';
  await setDoc(doc(db, 'remitBills', billAId), {
    studentId: 'STU_A_101',
    netPayable: 5000,
    status: 'UNPAID'
  });
  await setDoc(doc(db, 'remitBills', billBId), {
    studentId: 'STU_B_202',
    netPayable: 7000,
    status: 'UNPAID'
  });

  // TEST 1: ADMIN
  await signInWithEmailAndPassword(auth, adminEmail, adminPass);
  try {
    await setDoc(doc(db, 'document_sequences', 'TEST_SEQ_ADMIN'), { currentNumber: 1 });
    results.push({
      identity: 'ADMIN',
      test: 'Write document_sequences',
      expected: 'ALLOWED',
      actual: 'ALLOWED (Success)',
      status: 'PASS'
    });
  } catch (err: any) {
    results.push({
      identity: 'ADMIN',
      test: 'Write document_sequences',
      expected: 'ALLOWED',
      actual: `DENIED: ${err.message}`,
      status: 'FAIL'
    });
  }

  // TEST 2: TEACHER
  await signInWithEmailAndPassword(auth, teacherEmail, teacherPass);
  try {
    await getDoc(doc(db, 'cash_ledger', 'SOME_LEDGER_DOC'));
    results.push({
      identity: 'TEACHER',
      test: 'Read cash_ledger',
      expected: 'DENIED',
      actual: 'ALLOWED (Failure)',
      status: 'FAIL'
    });
  } catch (err: any) {
    results.push({
      identity: 'TEACHER',
      test: 'Read cash_ledger',
      expected: 'DENIED',
      actual: `BLOCKED (${err.code})`,
      status: err.code === 'permission-denied' ? 'PASS' : 'FAIL'
    });
  }

  try {
    await setDoc(doc(db, 'remitBills', 'UNAUTHORIZED_TEACHER_BILL'), { amount: 100 });
    results.push({
      identity: 'TEACHER',
      test: 'Write remitBills',
      expected: 'DENIED',
      actual: 'ALLOWED (Failure)',
      status: 'FAIL'
    });
  } catch (err: any) {
    results.push({
      identity: 'TEACHER',
      test: 'Write remitBills',
      expected: 'DENIED',
      actual: `BLOCKED (${err.code})`,
      status: err.code === 'permission-denied' ? 'PASS' : 'FAIL'
    });
  }

  // TEST 3: STUDENT_A
  await signInWithEmailAndPassword(auth, studentAEmail, studentAPass);
  try {
    const snap = await getDoc(doc(db, 'remitBills', billAId));
    if (snap.exists() && snap.data().studentId === 'STU_A_101') {
      results.push({
        identity: 'STUDENT_A',
        test: 'Read own bill (STU_A_101)',
        expected: 'ALLOWED',
        actual: 'ALLOWED (Successfully retrieved own bill)',
        status: 'PASS'
      });
    } else {
      results.push({
        identity: 'STUDENT_A',
        test: 'Read own bill (STU_A_101)',
        expected: 'ALLOWED',
        actual: 'Doc missing or invalid data',
        status: 'FAIL'
      });
    }
  } catch (err: any) {
    results.push({
      identity: 'STUDENT_A',
      test: 'Read own bill (STU_A_101)',
      expected: 'ALLOWED',
      actual: `DENIED: ${err.message}`,
      status: 'FAIL'
    });
  }

  try {
    await getDoc(doc(db, 'remitBills', billBId));
    results.push({
      identity: 'STUDENT_A',
      test: 'Read Student B bill (STU_B_202)',
      expected: 'DENIED',
      actual: 'ALLOWED (Security Breach - Student A read Student B data)',
      status: 'FAIL'
    });
  } catch (err: any) {
    results.push({
      identity: 'STUDENT_A',
      test: 'Read Student B bill (STU_B_202)',
      expected: 'DENIED',
      actual: `BLOCKED (${err.code})`,
      status: err.code === 'permission-denied' ? 'PASS' : 'FAIL'
    });
  }

  try {
    await setDoc(doc(db, 'remitBills', 'UNAUTHORIZED_STUDENT_BILL'), { amount: 100 });
    results.push({
      identity: 'STUDENT_A',
      test: 'Write remitBills',
      expected: 'DENIED',
      actual: 'ALLOWED (Failure)',
      status: 'FAIL'
    });
  } catch (err: any) {
    results.push({
      identity: 'STUDENT_A',
      test: 'Write remitBills',
      expected: 'DENIED',
      actual: `BLOCKED (${err.code})`,
      status: err.code === 'permission-denied' ? 'PASS' : 'FAIL'
    });
  }

  // TEST 4: STUDENT_B
  await signInWithEmailAndPassword(auth, studentBEmail, studentBPass);
  try {
    const snap = await getDoc(doc(db, 'remitBills', billBId));
    if (snap.exists() && snap.data().studentId === 'STU_B_202') {
      results.push({
        identity: 'STUDENT_B',
        test: 'Read own bill (STU_B_202)',
        expected: 'ALLOWED',
        actual: 'ALLOWED (Successfully retrieved own bill)',
        status: 'PASS'
      });
    } else {
      results.push({
        identity: 'STUDENT_B',
        test: 'Read own bill (STU_B_202)',
        expected: 'ALLOWED',
        actual: 'Doc missing or invalid data',
        status: 'FAIL'
      });
    }
  } catch (err: any) {
    results.push({
      identity: 'STUDENT_B',
      test: 'Read own bill (STU_B_202)',
      expected: 'ALLOWED',
      actual: `DENIED: ${err.message}`,
      status: 'FAIL'
    });
  }

  try {
    await getDoc(doc(db, 'remitBills', billAId));
    results.push({
      identity: 'STUDENT_B',
      test: 'Read Student A bill (STU_A_101)',
      expected: 'DENIED',
      actual: 'ALLOWED (Security Breach - Student B read Student A data)',
      status: 'FAIL'
    });
  } catch (err: any) {
    results.push({
      identity: 'STUDENT_B',
      test: 'Read Student A bill (STU_A_101)',
      expected: 'DENIED',
      actual: `BLOCKED (${err.code})`,
      status: err.code === 'permission-denied' ? 'PASS' : 'FAIL'
    });
  }

  // TEST 5: UNAUTHENTICATED
  await signOut(auth);
  try {
    await getDoc(doc(db, 'cash_ledger', 'SOME_LEDGER_DOC'));
    results.push({
      identity: 'UNAUTHENTICATED',
      test: 'Read cash_ledger',
      expected: 'DENIED',
      actual: 'ALLOWED (Security Breach)',
      status: 'FAIL'
    });
  } catch (err: any) {
    results.push({
      identity: 'UNAUTHENTICATED',
      test: 'Read cash_ledger',
      expected: 'DENIED',
      actual: `BLOCKED (${err.code})`,
      status: err.code === 'permission-denied' ? 'PASS' : 'FAIL'
    });
  }

  console.log("\nSECURITY NON-REGRESSION RESULTS:");
  let allPass = true;
  for (const r of results) {
    console.log(`[${r.status}] ${r.identity} -> ${r.test}: Expected=${r.expected}, Actual=${r.actual}`);
    if (r.status !== 'PASS') allPass = false;
  }

  fs.writeFileSync('step3_security_non_regression_evidence.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    overallVerdict: allPass ? 'VERIFIED' : 'FAILED',
    results
  }, null, 2));

  console.log(`\nOVERALL SECURITY VERDICT: ${allPass ? 'VERIFIED (PASS)' : 'FAILED'}`);
  process.exit(allPass ? 0 : 1);
}

runSecurityNonRegressionTest().catch((err) => {
  console.error("Fatal error in security test:", err);
  process.exit(1);
});
