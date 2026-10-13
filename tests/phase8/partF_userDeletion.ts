import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { 
  recordTest, 
  adminAuth, 
  adminDb, 
  createClientContext, 
  TestClientContext 
} from './framework';

export async function runPartFTests(): Promise<void> {
  console.log('\n======================================================================');
  console.log('PART F: USER DELETION STATE MACHINE');
  console.log('======================================================================\n');

  const student = await createClientContext({ role: 'student', emailPrefix: 'del_test_std' });
  const teacher = await createClientContext({ role: 'teacher', emailPrefix: 'del_test_tch' });
  const secAdmin = await createClientContext({ role: 'admin', adminTier: 'secondary', emailPrefix: 'del_test_sec' });
  const primAdmin = await createClientContext({ role: 'admin', adminTier: 'primary', emailPrefix: 'del_test_prim' });

  // Seed financial history for a student to ensure preservation across deletion
  const victimStudent = await createClientContext({ role: 'student', emailPrefix: 'victim_std' });
  const victimBillId = `bill_victim_${Date.now()}`;
  const victimTxId = `tx_victim_${Date.now()}`;

  await adminDb.collection('remitBills').doc(victimBillId).set({
    billId: victimBillId,
    studentId: victimStudent.uid,
    totalAmount: 5000,
    paidAmount: 5000,
    dueAmount: 0,
    status: 'paid',
  });
  await adminDb.collection('transactions').doc(victimTxId).set({
    transactionId: victimTxId,
    studentId: victimStudent.uid,
    amount: 5000,
    receipt: 'REC-VICTIM-001',
    status: 'SUCCESS',
  });

  // 1. Student attempts to invoke /api/users/delete-auth -> 403 Forbidden
  try {
    const res = await fetch('http://127.0.0.1:3000/api/users/delete-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${student.token}`,
      },
      body: JSON.stringify({ uid: victimStudent.uid }),
    });
    const status = res.status;
    const passed = status === 403;
    recordTest({
      id: 'DEL-01',
      category: 'USER DELETION',
      scenario: 'Student attempts calling /api/users/delete-auth endpoint',
      command: 'fetch(/api/users/delete-auth, { caller: student })',
      input: { caller: 'student', target: victimStudent.uid },
      operation: 'Unauthorized API call to delete user auth',
      expected: 'HTTP 403 Forbidden',
      actual: `HTTP ${status}`,
      difference: passed ? 'None (Matched)' : `Unexpected status: ${status}`,
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `Status: ${status}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'DEL-01', category: 'USER DELETION', scenario: 'Student delete-auth', command: 'fetch', input: {}, operation: 'Delete', expected: '403', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 2. Teacher attempts to invoke /api/users/delete-auth -> 403 Forbidden
  try {
    const res = await fetch('http://127.0.0.1:3000/api/users/delete-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacher.token}`,
      },
      body: JSON.stringify({ uid: victimStudent.uid }),
    });
    const status = res.status;
    const passed = status === 403;
    recordTest({
      id: 'DEL-02',
      category: 'USER DELETION',
      scenario: 'Teacher attempts calling /api/users/delete-auth endpoint',
      command: 'fetch(/api/users/delete-auth, { caller: teacher })',
      input: { caller: 'teacher', target: victimStudent.uid },
      operation: 'Unauthorized API call to delete user auth',
      expected: 'HTTP 403 Forbidden',
      actual: `HTTP ${status}`,
      difference: passed ? 'None (Matched)' : `Unexpected status: ${status}`,
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `Status: ${status}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'DEL-02', category: 'USER DELETION', scenario: 'Teacher delete-auth', command: 'fetch', input: {}, operation: 'Delete', expected: '403', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 3. 2° Admin attempts to delete Admin user -> 403 Forbidden
  try {
    const res = await fetch('http://127.0.0.1:3000/api/users/delete-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secAdmin.token}`,
      },
      body: JSON.stringify({ uid: primAdmin.uid }),
    });
    const status = res.status;
    const passed = status === 403;
    recordTest({
      id: 'DEL-03',
      category: 'USER DELETION',
      scenario: '2° Admin attempts deleting another Admin user account',
      command: 'fetch(/api/users/delete-auth, { caller: secAdmin, target: primAdmin })',
      input: { caller: 'secondary_admin', target: 'primary_admin' },
      operation: 'Governance violation: 2° admin deleting Admin',
      expected: 'HTTP 403 Forbidden',
      actual: `HTTP ${status}`,
      difference: passed ? 'None (Matched)' : `Unexpected status: ${status}`,
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `Status: ${status}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'DEL-03', category: 'USER DELETION', scenario: '2° Admin delete Admin', command: 'fetch', input: {}, operation: 'Delete', expected: '403', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 4. Admin self-deletion prohibited -> 400 Bad Request
  try {
    const res = await fetch('http://127.0.0.1:3000/api/users/delete-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${primAdmin.token}`,
      },
      body: JSON.stringify({ uid: primAdmin.uid }),
    });
    const status = res.status;
    const passed = status === 400;
    recordTest({
      id: 'DEL-04',
      category: 'USER DELETION',
      scenario: 'Administrator self-deletion prohibited',
      command: 'fetch(/api/users/delete-auth, { uid: primAdmin.uid })',
      input: { caller: primAdmin.uid, target: primAdmin.uid },
      operation: 'Self-deletion of active administrator',
      expected: 'HTTP 400 Bad Request (Self-deletion prohibited)',
      actual: `HTTP ${status}`,
      difference: passed ? 'None (Matched)' : `Unexpected status: ${status}`,
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `Status: ${status}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'DEL-04', category: 'USER DELETION', scenario: 'Self deletion', command: 'fetch', input: {}, operation: 'Delete', expected: '400', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 5. Successful deletion lifecycle: ACTIVE -> DELETION_PENDING -> Auth Deletion -> TOMBSTONE
  try {
    const targetUid = victimStudent.uid;
    // Step 1: Set DELETION_PENDING in Firestore
    await adminDb.collection('users').doc(targetUid).update({
      status: 'DELETION_PENDING',
      deletionRequestedAt: new Date().toISOString(),
    });

    // Step 2: Delete from Firebase Auth via server endpoint
    const res = await fetch('http://127.0.0.1:3000/api/users/delete-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${primAdmin.token}`,
      },
      body: JSON.stringify({ uid: targetUid }),
    });
    const authDeletedOk = res.ok;

    // Step 3: Finalize tombstone in Firestore
    await adminDb.collection('users').doc(targetUid).update({
      status: 'DELETED',
      deleted: true,
      active: false,
      tombstone: true,
      anonymizedAt: new Date().toISOString(),
    });

    // Verify Auth record is gone
    let authGone = false;
    try {
      await adminAuth.getUser(targetUid);
    } catch (err: any) {
      authGone = err.code === 'auth/user-not-found';
    }

    // Verify Firestore tombstone state
    const postDoc = await adminDb.collection('users').doc(targetUid).get();
    const tombstoneValid = postDoc.data()?.status === 'DELETED' && postDoc.data()?.tombstone === true;

    const passed = authDeletedOk && authGone && tombstoneValid;
    recordTest({
      id: 'DEL-05',
      category: 'USER DELETION',
      scenario: 'Full lifecycle: ACTIVE -> DELETION_PENDING -> Auth Deletion -> TOMBSTONE',
      command: 'Execute complete 3-step deletion state machine',
      input: { targetUid },
      operation: 'Authoritative user deletion workflow',
      expected: 'Auth deleted, tombstone saved with status=DELETED and tombstone=true',
      actual: `authDeletedOk=${authDeletedOk}, authGone=${authGone}, tombstoneValid=${tombstoneValid}`,
      difference: passed ? 'None (Matched)' : 'Incomplete deletion transition',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(postDoc.data() || {}),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'DEL-05', category: 'USER DELETION', scenario: 'Deletion lifecycle', command: 'Lifecycle', input: {}, operation: 'Delete', expected: 'TOMBSTONE', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 6. Verify financial history is preserved (IMMUTABLE AUDIT PRESERVATION)
  try {
    const billDoc = await adminDb.collection('remitBills').doc(victimBillId).get();
    const txDoc = await adminDb.collection('transactions').doc(victimTxId).get();
    const billPreserved = billDoc.exists && billDoc.data()?.totalAmount === 5000;
    const txPreserved = txDoc.exists && txDoc.data()?.amount === 5000;
    const passed = billPreserved && txPreserved;
    recordTest({
      id: 'DEL-06',
      category: 'USER DELETION',
      scenario: 'Financial history preserved untouched after user deletion',
      command: 'Check remitBills and transactions for deleted student UID',
      input: { studentUid: victimStudent.uid, billId: victimBillId, txId: victimTxId },
      operation: 'Verification of immutable financial records preservation',
      expected: 'Bill and Transaction documents exist intact with original amounts',
      actual: `billPreserved=${billPreserved}, txPreserved=${txPreserved}`,
      difference: passed ? 'None (Matched)' : 'Financial history deleted or corrupted (VIOLATION)',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `Bill: ${billDoc.exists}, Tx: ${txDoc.exists}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'DEL-06', category: 'USER DELETION', scenario: 'Financial history preservation', command: 'get', input: {}, operation: 'Check records', expected: 'Preserved', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 7. Idempotency: Re-calling delete-auth on already deleted user
  try {
    const res = await fetch('http://127.0.0.1:3000/api/users/delete-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${primAdmin.token}`,
      },
      body: JSON.stringify({ uid: victimStudent.uid }),
    });
    const data = await res.json();
    const passed = res.ok && data.success === true;
    recordTest({
      id: 'DEL-07',
      category: 'USER DELETION',
      scenario: 'Idempotency: Re-deleting already deleted auth user returns success',
      command: 'fetch(/api/users/delete-auth, { uid: alreadyDeletedUid })',
      input: { uid: victimStudent.uid },
      operation: 'Re-invocation of delete endpoint on deleted target',
      expected: 'HTTP 200 with success: true (idempotent)',
      actual: `HTTP ${res.status}, success=${data.success}`,
      difference: passed ? 'None (Matched)' : 'Idempotency failure',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(data),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'DEL-07', category: 'USER DELETION', scenario: 'Idempotent delete', command: 'fetch', input: {}, operation: 'Re-delete', expected: '200 OK', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }
}
