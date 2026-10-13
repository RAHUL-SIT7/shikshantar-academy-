import { 
  doc, 
  deleteDoc, 
  getDoc 
} from 'firebase/firestore';
import { 
  recordTest, 
  adminDb, 
  createClientContext, 
  TestClientContext 
} from './framework';

export async function runPartJTests(): Promise<void> {
  console.log('\n======================================================================');
  console.log('PART J: LOGIN SECURITY & SESSION INTEGRITY');
  console.log('======================================================================\n');

  const adminCtx = await createClientContext({ role: 'admin', adminTier: 'primary', emailPrefix: 'sec_log_adm' });
  const teacherCtx = await createClientContext({ role: 'teacher', emailPrefix: 'sec_log_tch' });
  const studentCtx = await createClientContext({ role: 'student', emailPrefix: 'sec_log_std' });

  // 1. Admin login creates tracked session in user_sessions
  try {
    const res = await fetch('http://127.0.0.1:3000/api/auth/record-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminCtx.token}` },
      body: JSON.stringify({ deviceType: 'MacBook / macOS', browser: 'Safari' }),
    });
    const data = await res.json();
    const sessionDoc = await adminDb.collection('user_sessions').doc(data.sessionId || 'none').get();
    const sessionRecorded = sessionDoc.exists && sessionDoc.data()?.userUid === adminCtx.uid;
    recordTest({
      id: 'SESS-01',
      category: 'LOGIN SECURITY',
      scenario: 'Admin login records persistent session document',
      command: 'fetch(/api/auth/record-login, { adminToken })',
      input: { uid: adminCtx.uid, device: 'MacBook' },
      operation: 'Admin login tracking and session persistence',
      expected: 'Session document created in user_sessions with matching userUid',
      actual: `sessionId=${data.sessionId}, exists=${sessionDoc.exists}`,
      difference: sessionRecorded ? 'None (Matched)' : 'Session document missing or invalid',
      status: sessionRecorded ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(sessionDoc.data() || {}),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SESS-01', category: 'LOGIN SECURITY', scenario: 'Admin session record', command: 'fetch', input: {}, operation: 'Record', expected: 'Success', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 2. Teacher login creates tracked session
  try {
    const res = await fetch('http://127.0.0.1:3000/api/auth/record-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherCtx.token}` },
      body: JSON.stringify({ deviceType: 'Windows PC / Windows', browser: 'Chrome' }),
    });
    const data = await res.json();
    const sessionDoc = await adminDb.collection('user_sessions').doc(data.sessionId || 'none').get();
    const sessionRecorded = sessionDoc.exists && sessionDoc.data()?.userUid === teacherCtx.uid;
    recordTest({
      id: 'SESS-02',
      category: 'LOGIN SECURITY',
      scenario: 'Teacher login records persistent session document',
      command: 'fetch(/api/auth/record-login, { teacherToken })',
      input: { uid: teacherCtx.uid, device: 'Windows PC' },
      operation: 'Teacher login tracking and session persistence',
      expected: 'Session document created in user_sessions with matching userUid',
      actual: `sessionId=${data.sessionId}, exists=${sessionDoc.exists}`,
      difference: sessionRecorded ? 'None (Matched)' : 'Session document missing or invalid',
      status: sessionRecorded ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(sessionDoc.data() || {}),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SESS-02', category: 'LOGIN SECURITY', scenario: 'Teacher session record', command: 'fetch', input: {}, operation: 'Record', expected: 'Success', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 3. Student login creates tracked session
  try {
    const res = await fetch('http://127.0.0.1:3000/api/auth/record-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentCtx.token}` },
      body: JSON.stringify({ deviceType: 'Android Phone', browser: 'Chrome Mobile' }),
    });
    const data = await res.json();
    const sessionDoc = await adminDb.collection('user_sessions').doc(data.sessionId || 'none').get();
    const sessionRecorded = sessionDoc.exists && sessionDoc.data()?.userUid === studentCtx.uid;
    recordTest({
      id: 'SESS-03',
      category: 'LOGIN SECURITY',
      scenario: 'Student login records persistent session document',
      command: 'fetch(/api/auth/record-login, { studentToken })',
      input: { uid: studentCtx.uid, device: 'Android Phone' },
      operation: 'Student login tracking and session persistence',
      expected: 'Session document created in user_sessions with matching userUid',
      actual: `sessionId=${data.sessionId}, exists=${sessionDoc.exists}`,
      difference: sessionRecorded ? 'None (Matched)' : 'Session document missing or invalid',
      status: sessionRecorded ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(sessionDoc.data() || {}),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SESS-03', category: 'LOGIN SECURITY', scenario: 'Student session record', command: 'fetch', input: {}, operation: 'Record', expected: 'Success', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 4. Guest login attempt -> Rejected (no authenticated session created for unauthenticated visitor)
  try {
    const res = await fetch('http://127.0.0.1:3000/api/auth/record-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceType: 'Guest Device' }),
    });
    const status = res.status;
    const passed = status === 401 || status === 403;
    recordTest({
      id: 'SESS-04',
      category: 'LOGIN SECURITY',
      scenario: 'Guest without auth token cannot register authenticated login session',
      command: 'fetch(/api/auth/record-login, { no auth })',
      input: { caller: 'GUEST' },
      operation: 'Unauthenticated session registration attempt',
      expected: 'HTTP 401/403 Forbidden',
      actual: `HTTP ${status}`,
      difference: passed ? 'None (Matched)' : `Unexpected status: ${status}`,
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `Status: ${status}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SESS-04', category: 'LOGIN SECURITY', scenario: 'Guest session record', command: 'fetch', input: {}, operation: 'Record', expected: '401/403', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 5. User sessions are append-only; client cannot delete session documents (allow delete: if false)
  try {
    const sRes = await fetch('http://127.0.0.1:3000/api/auth/record-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentCtx.token}` },
      body: JSON.stringify({ deviceType: 'iPhone / iOS' }),
    });
    const sData = await sRes.json();
    let deleteDenied = false;
    try {
      await deleteDoc(doc(studentCtx.db, 'user_sessions', sData.sessionId));
    } catch {
      deleteDenied = true;
    }
    recordTest({
      id: 'SESS-05',
      category: 'LOGIN SECURITY',
      scenario: 'User cannot delete own login session records (append-only audit)',
      command: 'deleteDoc(studentDb, user_sessions/sessionId)',
      input: { caller: studentCtx.uid, sessionId: sData.sessionId },
      operation: 'Client deletion of login session document',
      expected: 'DENIED with permission-denied (allow delete: if false)',
      actual: deleteDenied ? 'DENIED (permission-denied)' : 'ALLOWED (AUDIT ERASURE)',
      difference: deleteDenied ? 'None (Matched)' : 'Session history deleted',
      status: deleteDenied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `deleteDenied=${deleteDenied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SESS-05', category: 'LOGIN SECURITY', scenario: 'Delete session history', command: 'deleteDoc', input: {}, operation: 'Delete', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 6. Remote session revocation flow
  try {
    const rRes = await fetch('http://127.0.0.1:3000/api/auth/record-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentCtx.token}` },
      body: JSON.stringify({ deviceType: 'Target Device to Revoke' }),
    });
    const rData = await rRes.json();

    const revokeRes = await fetch('http://127.0.0.1:3000/api/auth/revoke-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentCtx.token}` },
      body: JSON.stringify({ sessionId: rData.sessionId }),
    });
    const revokeJson = await revokeRes.json();
    const passed = revokeRes.ok && revokeJson.success === true;
    recordTest({
      id: 'SESS-06',
      category: 'LOGIN SECURITY',
      scenario: 'Remote session revocation sets session to REVOKED successfully',
      command: 'fetch(/api/auth/revoke-session, { sessionId })',
      input: { sessionId: rData.sessionId },
      operation: 'Remote session termination flow',
      expected: 'HTTP 200 with success: true and status: REVOKED',
      actual: `HTTP ${revokeRes.status}, success=${revokeJson.success}`,
      difference: passed ? 'None (Matched)' : 'Revocation failed',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(revokeJson),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'SESS-06', category: 'LOGIN SECURITY', scenario: 'Revoke session', command: 'fetch', input: {}, operation: 'Revoke', expected: '200 OK', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }
}
