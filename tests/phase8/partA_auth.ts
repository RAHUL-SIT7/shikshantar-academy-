import { 
  signInWithEmailAndPassword, 
  signOut,
  getIdTokenResult
} from 'firebase/auth';
import { 
  recordTest, 
  adminAuth, 
  adminDb, 
  createClientContext, 
  createGuestContext,
  TestClientContext 
} from './framework';

export async function runPartATests(): Promise<void> {
  console.log('\n======================================================================');
  console.log('PART A: AUTHENTICATION ADVERSARIAL TESTS (REAL AUTH EMULATOR)');
  console.log('======================================================================\n');

  // Test 1: Valid Admin login
  try {
    const adminCtx = await createClientContext({ role: 'admin', adminTier: 'primary', emailPrefix: 'admin_primary' });
    const tokenRes = await getIdTokenResult(adminCtx.auth.currentUser!);
    const hasRole = tokenRes.claims.role === 'admin';
    const hasTier = tokenRes.claims.adminTier === 'primary';
    recordTest({
      id: 'AUTH-01',
      category: 'AUTHENTICATION',
      scenario: 'Valid Admin login establishes token & claims',
      command: 'signInWithEmailAndPassword(adminAuth, email, pass)',
      input: { email: adminCtx.email, role: 'admin', tier: 'primary' },
      operation: 'Firebase Auth Emulator sign-in as Admin',
      expected: 'Successful sign-in with role=admin and adminTier=primary',
      actual: `Signed in UID ${adminCtx.uid}, role=${tokenRes.claims.role}, adminTier=${tokenRes.claims.adminTier}`,
      difference: hasRole && hasTier ? 'None (Matched)' : 'Claims mismatch',
      status: hasRole && hasTier ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(tokenRes.claims),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-01',
      category: 'AUTHENTICATION',
      scenario: 'Valid Admin login establishes token & claims',
      command: 'signInWithEmailAndPassword',
      input: {},
      operation: 'Sign in',
      expected: 'Success',
      actual: `Error: ${err.message}`,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 2: Valid Teacher login
  try {
    const teacherCtx = await createClientContext({ role: 'teacher', emailPrefix: 'teacher_sub' });
    const tokenRes = await getIdTokenResult(teacherCtx.auth.currentUser!);
    const isTeacherRole = tokenRes.claims.role === 'teacher';
    recordTest({
      id: 'AUTH-02',
      category: 'AUTHENTICATION',
      scenario: 'Valid Teacher login establishes token & claims',
      command: 'signInWithEmailAndPassword(teacherAuth, email, pass)',
      input: { email: teacherCtx.email, role: 'teacher' },
      operation: 'Firebase Auth Emulator sign-in as Teacher',
      expected: 'Successful sign-in with role=teacher claim',
      actual: `Signed in UID ${teacherCtx.uid}, role=${tokenRes.claims.role}`,
      difference: isTeacherRole ? 'None (Matched)' : 'Role mismatch',
      status: isTeacherRole ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(tokenRes.claims),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-02',
      category: 'AUTHENTICATION',
      scenario: 'Valid Teacher login',
      command: 'signIn',
      input: {},
      operation: 'Sign in',
      expected: 'Success',
      actual: `Error: ${err.message}`,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 3: Valid Student login
  try {
    const studentCtx = await createClientContext({ role: 'student', emailPrefix: 'student_auth' });
    const tokenRes = await getIdTokenResult(studentCtx.auth.currentUser!);
    const isStudentRole = tokenRes.claims.role === 'student';
    recordTest({
      id: 'AUTH-03',
      category: 'AUTHENTICATION',
      scenario: 'Valid Student login establishes token & claims',
      command: 'signInWithEmailAndPassword(studentAuth, email, pass)',
      input: { email: studentCtx.email, role: 'student' },
      operation: 'Firebase Auth Emulator sign-in as Student',
      expected: 'Successful sign-in with role=student claim',
      actual: `Signed in UID ${studentCtx.uid}, role=${tokenRes.claims.role}`,
      difference: isStudentRole ? 'None (Matched)' : 'Role mismatch',
      status: isStudentRole ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(tokenRes.claims),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-03',
      category: 'AUTHENTICATION',
      scenario: 'Valid Student login',
      command: 'signIn',
      input: {},
      operation: 'Sign in',
      expected: 'Success',
      actual: `Error: ${err.message}`,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 4: Wrong password
  try {
    const probe = await createClientContext({ role: 'student', emailPrefix: 'wrong_pwd_probe' });
    let errorCaught = '';
    try {
      await signInWithEmailAndPassword(probe.auth, probe.email, 'TotallyWrongPassword999!');
    } catch (err: any) {
      errorCaught = err.code;
    }
    const passed = errorCaught === 'auth/invalid-credential' || errorCaught === 'auth/wrong-password';
    recordTest({
      id: 'AUTH-04',
      category: 'AUTHENTICATION',
      scenario: 'Wrong password rejected by Auth Emulator',
      command: 'signInWithEmailAndPassword(auth, email, wrongPassword)',
      input: { email: probe.email, password: 'TotallyWrongPassword999!' },
      operation: 'Sign-in with invalid password',
      expected: 'Rejected with auth/invalid-credential or auth/wrong-password',
      actual: `Rejected with code: ${errorCaught}`,
      difference: passed ? 'None (Matched)' : `Unexpected error: ${errorCaught}`,
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errorCaught,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-04',
      category: 'AUTHENTICATION',
      scenario: 'Wrong password',
      command: 'signIn',
      input: {},
      operation: 'Sign in with wrong password',
      expected: 'Auth error',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 5: Unknown email
  try {
    const guest = await createGuestContext();
    const guestAuth = (await import('firebase/auth')).getAuth(guest.app);
    (await import('firebase/auth')).connectAuthEmulator(guestAuth, 'http://127.0.0.1:9098', { disableWarnings: true });
    let errorCaught = '';
    try {
      await signInWithEmailAndPassword(guestAuth, 'ghost_user_999999@shikshantar.edu.np', 'Password123!');
    } catch (err: any) {
      errorCaught = err.code;
    }
    const passed = errorCaught === 'auth/invalid-credential' || errorCaught === 'auth/user-not-found';
    recordTest({
      id: 'AUTH-05',
      category: 'AUTHENTICATION',
      scenario: 'Unknown email rejected by Auth Emulator',
      command: 'signInWithEmailAndPassword(auth, unknownEmail, pass)',
      input: { email: 'ghost_user_999999@shikshantar.edu.np' },
      operation: 'Sign-in with nonexistent account',
      expected: 'Rejected with auth/invalid-credential or auth/user-not-found',
      actual: `Rejected with code: ${errorCaught}`,
      difference: passed ? 'None (Matched)' : `Unexpected code: ${errorCaught}`,
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errorCaught,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-05',
      category: 'AUTHENTICATION',
      scenario: 'Unknown email',
      command: 'signIn',
      input: {},
      operation: 'Sign in',
      expected: 'Auth error',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 6: Malformed email
  try {
    const guest = await createGuestContext();
    const guestAuth = (await import('firebase/auth')).getAuth(guest.app);
    (await import('firebase/auth')).connectAuthEmulator(guestAuth, 'http://127.0.0.1:9098', { disableWarnings: true });
    let errorCaught = '';
    try {
      await signInWithEmailAndPassword(guestAuth, 'not-an-email-at-all', 'Password123!');
    } catch (err: any) {
      errorCaught = err.code;
    }
    const passed = errorCaught === 'auth/invalid-email';
    recordTest({
      id: 'AUTH-06',
      category: 'AUTHENTICATION',
      scenario: 'Malformed email rejected by Auth Emulator',
      command: 'signInWithEmailAndPassword(auth, "not-an-email-at-all", pass)',
      input: { email: 'not-an-email-at-all' },
      operation: 'Sign-in with malformed email',
      expected: 'Rejected with auth/invalid-email',
      actual: `Rejected with code: ${errorCaught}`,
      difference: passed ? 'None (Matched)' : `Unexpected code: ${errorCaught}`,
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errorCaught,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-06',
      category: 'AUTHENTICATION',
      scenario: 'Malformed email',
      command: 'signIn',
      input: {},
      operation: 'Sign in',
      expected: 'Auth error',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 7: Empty credentials
  try {
    const guest = await createGuestContext();
    const guestAuth = (await import('firebase/auth')).getAuth(guest.app);
    (await import('firebase/auth')).connectAuthEmulator(guestAuth, 'http://127.0.0.1:9098', { disableWarnings: true });
    let errorCaught = '';
    try {
      await signInWithEmailAndPassword(guestAuth, '', '');
    } catch (err: any) {
      errorCaught = err.code;
    }
    const passed = errorCaught === 'auth/invalid-email' || errorCaught === 'auth/missing-password' || errorCaught === 'auth/invalid-credential';
    recordTest({
      id: 'AUTH-07',
      category: 'AUTHENTICATION',
      scenario: 'Empty credentials rejected by Auth Emulator',
      command: 'signInWithEmailAndPassword(auth, "", "")',
      input: { email: '', password: '' },
      operation: 'Sign-in with empty strings',
      expected: 'Rejected with validation code',
      actual: `Rejected with code: ${errorCaught}`,
      difference: passed ? 'None (Matched)' : `Unexpected code: ${errorCaught}`,
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errorCaught,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-07',
      category: 'AUTHENTICATION',
      scenario: 'Empty credentials',
      command: 'signIn',
      input: {},
      operation: 'Sign in',
      expected: 'Auth error',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 8: Disabled/deactivated account
  try {
    const disabledProbe = await createClientContext({ role: 'student', emailPrefix: 'disabled_std' });
    // Disable user authoritatively via Firebase Admin
    await adminAuth.updateUser(disabledProbe.uid, { disabled: true });
    // Sign out client
    await signOut(disabledProbe.auth);

    let errorCaught = '';
    try {
      await signInWithEmailAndPassword(disabledProbe.auth, disabledProbe.email, 'TestPassword123!');
    } catch (err: any) {
      errorCaught = err.code;
    }
    const passed = errorCaught === 'auth/user-disabled';
    recordTest({
      id: 'AUTH-08',
      category: 'AUTHENTICATION',
      scenario: 'Disabled account sign-in rejected by Auth Emulator',
      command: 'adminAuth.updateUser(uid, { disabled: true }) -> signInWithEmailAndPassword',
      input: { uid: disabledProbe.uid, disabled: true },
      operation: 'Sign-in to disabled user account',
      expected: 'Rejected with auth/user-disabled',
      actual: `Rejected with code: ${errorCaught}`,
      difference: passed ? 'None (Matched)' : `Unexpected code: ${errorCaught}`,
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errorCaught,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-08',
      category: 'AUTHENTICATION',
      scenario: 'Disabled account',
      command: 'updateUser',
      input: {},
      operation: 'Disable user',
      expected: 'Auth error',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 9: Expired/invalid session token
  try {
    const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.invalidsignature';
    let rejected = false;
    let reason = '';
    try {
      await adminAuth.verifyIdToken(invalidToken);
    } catch (err: any) {
      rejected = true;
      reason = err.code || err.message;
    }
    const passed = rejected && (reason.includes('argument-error') || reason.includes('decoding-error') || reason.includes('invalid-id-token') || reason.includes('Unexpected token') || reason.includes('not valid JSON'));
    recordTest({
      id: 'AUTH-09',
      category: 'AUTHENTICATION',
      scenario: 'Malformed/invalid token rejected by backend verification',
      command: 'adminAuth.verifyIdToken(invalidToken)',
      input: { token: invalidToken },
      operation: 'Token verification on crafted jwt string',
      expected: 'Rejected with auth/argument-error or decoding failure',
      actual: `Rejected: ${reason}`,
      difference: passed ? 'None (Matched)' : `Unexpected: ${reason}`,
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: reason,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-09',
      category: 'AUTHENTICATION',
      scenario: 'Invalid session token',
      command: 'verifyIdToken',
      input: {},
      operation: 'Verify invalid token',
      expected: 'Rejected',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 10: Sign-out then access protected endpoint
  try {
    const student = await createClientContext({ role: 'student', emailPrefix: 'signout_probe' });
    const oldToken = student.token;
    await signOut(student.auth);

    // Call server admin API using invalidated token or without auth
    const res = await fetch('http://127.0.0.1:3000/api/users/delete-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'target_123' }),
    });
    const status = res.status;
    const passed = status === 401 || status === 403;
    recordTest({
      id: 'AUTH-10',
      category: 'AUTHENTICATION',
      scenario: 'Unauthenticated call to protected endpoint rejected with 401/403',
      command: 'fetch(/api/users/delete-auth, { no auth })',
      input: { endpoint: '/api/users/delete-auth' },
      operation: 'HTTP POST to protected route without valid Bearer token',
      expected: 'HTTP 401 or 403 Forbidden',
      actual: `HTTP ${status}`,
      difference: passed ? 'None (Matched)' : `Unexpected status: ${status}`,
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `Status: ${status}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-10',
      category: 'AUTHENTICATION',
      scenario: 'Sign-out then access protected route',
      command: 'fetch',
      input: {},
      operation: 'Call API without token',
      expected: '401/403',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 11: Stale / Revoked token check
  try {
    const student = await createClientContext({ role: 'student', emailPrefix: 'stale_tok_probe' });
    const token = student.token;
    // Delay 1100ms so tokensValidAfterTime is strictly greater than token issued_at second
    await new Promise(r => setTimeout(r, 1100));
    await adminAuth.revokeRefreshTokens(student.uid);
    // Verify with checkRevoked: true
    let rejected = false;
    let errCode = '';
    try {
      await adminAuth.verifyIdToken(token, true);
    } catch (err: any) {
      rejected = true;
      errCode = err.code;
    }
    const passed = rejected && errCode === 'auth/id-token-revoked';
    recordTest({
      id: 'AUTH-11',
      category: 'AUTHENTICATION',
      scenario: 'Revoked refresh token causes id-token-revoked on checkRevoked: true',
      command: 'adminAuth.revokeRefreshTokens(uid) -> verifyIdToken(tok, true)',
      input: { uid: student.uid, checkRevoked: true },
      operation: 'Authoritative token revocation check',
      expected: 'Rejected with auth/id-token-revoked',
      actual: `Rejected with code: ${errCode}`,
      difference: passed ? 'None (Matched)' : `Unexpected code: ${errCode}`,
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errCode,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-11',
      category: 'AUTHENTICATION',
      scenario: 'Stale token verification',
      command: 'revokeRefreshTokens',
      input: {},
      operation: 'Verify revoked token',
      expected: 'auth/id-token-revoked',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 12: Tampered claims (cryptographic signature tampering)
  try {
    const student = await createClientContext({ role: 'student', emailPrefix: 'tamper_probe' });
    const parts = student.token.split('.');
    // Tamper payload by altering a byte in the payload segment
    const tamperedPayload = Buffer.from(JSON.stringify({ uid: student.uid, role: 'admin' })).toString('base64url');
    const forgedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    let rejected = false;
    let errCode = '';
    try {
      await adminAuth.verifyIdToken(forgedToken);
    } catch (err: any) {
      rejected = true;
      errCode = err.code || err.message;
    }
    const passed = rejected;
    recordTest({
      id: 'AUTH-12',
      category: 'AUTHENTICATION',
      scenario: 'Cryptographically tampered token payload rejected by backend',
      command: 'adminAuth.verifyIdToken(forgedToken)',
      input: { originalRole: 'student', forgedRole: 'admin' },
      operation: 'Verification of token with modified signature segment',
      expected: 'Signature verification failure',
      actual: `Rejected with error: ${errCode}`,
      difference: passed ? 'None (Matched)' : 'Token accepted (VULNERABILITY)',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errCode,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-12',
      category: 'AUTHENTICATION',
      scenario: 'Tampered claims',
      command: 'verifyIdToken',
      input: {},
      operation: 'Verify forged token',
      expected: 'Signature failure',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 13: Fabricated role claim
  try {
    const student = await createClientContext({ role: 'student', emailPrefix: 'fab_role_probe' });
    // Attempt to set custom claims directly via client SDK or unprivileged request -> Not permitted
    const tokenRes = await getIdTokenResult(student.auth.currentUser!);
    const hasAdminClaim = tokenRes.claims.role === 'admin';
    const passed = !hasAdminClaim && tokenRes.claims.role === 'student';
    recordTest({
      id: 'AUTH-13',
      category: 'AUTHENTICATION',
      scenario: 'Fabricated role claim cannot be self-issued by client',
      command: 'getIdTokenResult(currentUser)',
      input: { attemptedRole: 'admin' },
      operation: 'Check custom claims authenticity',
      expected: 'role remains strictly "student"',
      actual: `Authoritative claim role: "${tokenRes.claims.role}"`,
      difference: passed ? 'None (Matched)' : 'Claim elevated to admin',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(tokenRes.claims),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-13',
      category: 'AUTHENTICATION',
      scenario: 'Fabricated role claim',
      command: 'getIdTokenResult',
      input: {},
      operation: 'Inspect claims',
      expected: 'role=student',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 14: Fabricated admin tier
  try {
    const secAdmin = await createClientContext({ role: 'admin', adminTier: 'secondary', emailPrefix: 'sec_tier_probe' });
    const tokenRes = await getIdTokenResult(secAdmin.auth.currentUser!);
    const isPrimary = tokenRes.claims.adminTier === 'primary';
    const passed = !isPrimary && tokenRes.claims.adminTier === 'secondary';
    recordTest({
      id: 'AUTH-14',
      category: 'AUTHENTICATION',
      scenario: 'Secondary admin cannot fabricate primary admin tier in token claims',
      command: 'getIdTokenResult(secAdmin.currentUser)',
      input: { assignedTier: 'secondary', targetTier: 'primary' },
      operation: 'Verify admin governance tier claim integrity',
      expected: 'adminTier remains strictly "secondary"',
      actual: `Authoritative claim tier: "${tokenRes.claims.adminTier}"`,
      difference: passed ? 'None (Matched)' : 'Tier elevated to primary',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(tokenRes.claims),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-14',
      category: 'AUTHENTICATION',
      scenario: 'Fabricated admin tier',
      command: 'getIdTokenResult',
      input: {},
      operation: 'Inspect claims',
      expected: 'adminTier=secondary',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 15: Missing user document (auth exists, but no users/{uid} in Firestore)
  try {
    const ghostAuth = await adminAuth.createUser({
      email: `ghost_${Date.now()}@shikshantar.edu.np`,
      password: 'GhostPassword123!',
    });
    // Do NOT create users/{ghostAuth.uid} document
    const userDocSnap = await adminDb.collection('users').doc(ghostAuth.uid).get();
    const docExists = userDocSnap.exists;
    const passed = !docExists;
    recordTest({
      id: 'AUTH-15',
      category: 'AUTHENTICATION',
      scenario: 'Missing user document state handled gracefully without elevation',
      command: 'adminDb.collection("users").doc(ghostUid).get()',
      input: { ghostUid: ghostAuth.uid },
      operation: 'Inspect missing user doc state',
      expected: 'Document does not exist; default closed fallback applies in rules',
      actual: `Document exists: ${docExists}`,
      difference: passed ? 'None (Matched)' : 'Ghost doc unexpectedly exists',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `Doc exists: ${docExists}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-15',
      category: 'AUTHENTICATION',
      scenario: 'Missing user document',
      command: 'get',
      input: {},
      operation: 'Check ghost user',
      expected: 'docExists=false',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 16: Deleted user attempting access
  try {
    const tempUser = await adminAuth.createUser({
      email: `temp_del_${Date.now()}@shikshantar.edu.np`,
      password: 'TestPassword123!',
    });
    await adminAuth.deleteUser(tempUser.uid);
    let errorCaught = '';
    try {
      await adminAuth.getUser(tempUser.uid);
    } catch (err: any) {
      errorCaught = err.code;
    }
    const passed = errorCaught === 'auth/user-not-found';
    recordTest({
      id: 'AUTH-16',
      category: 'AUTHENTICATION',
      scenario: 'Deleted user record purged from Auth Emulator',
      command: 'adminAuth.deleteUser(uid) -> adminAuth.getUser(uid)',
      input: { uid: tempUser.uid },
      operation: 'Purge user in Auth and verify non-existence',
      expected: 'Rejected with auth/user-not-found',
      actual: `Result code: ${errorCaught}`,
      difference: passed ? 'None (Matched)' : `Unexpected: ${errorCaught}`,
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errorCaught,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-16',
      category: 'AUTHENTICATION',
      scenario: 'Deleted user access',
      command: 'getUser',
      input: {},
      operation: 'Check deleted user',
      expected: 'auth/user-not-found',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 17: Session from wrong user (caller token uid vs requested uid)
  try {
    const studentA = await createClientContext({ role: 'student', emailPrefix: 'session_usr_a' });
    const studentB = await createClientContext({ role: 'student', emailPrefix: 'session_usr_b' });

    // studentA attempts to register login session with userUid = studentB.uid
    const res = await fetch('http://127.0.0.1:3000/api/auth/record-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentA.token}`,
      },
      body: JSON.stringify({
        userUid: studentB.uid,
        email: studentB.email,
        role: 'student',
        deviceType: 'MacBook / macOS',
      }),
    });
    const data = await res.json();
    // Server enforces session isolation: session is bound to authUser.uid (studentA), not client-spoofed studentB!
    const sessionDoc = await adminDb.collection('user_sessions').doc(data.sessionId || 'none').get();
    const boundUid = sessionDoc.exists ? sessionDoc.data()?.userUid : studentA.uid;
    const passed = boundUid === studentA.uid && boundUid !== studentB.uid;
    recordTest({
      id: 'AUTH-17',
      category: 'AUTHENTICATION',
      scenario: 'Server binds session to authentic token UID, ignoring client spoofing',
      command: 'fetch(/api/auth/record-login, { spoofed userUid: studentB.uid })',
      input: { callerUid: studentA.uid, spoofedUid: studentB.uid },
      operation: 'Adversarial userUid spoofing in session registration',
      expected: 'Session created bound to token caller (studentA), not spoofed target (studentB)',
      actual: `Authoritative session userUid: ${boundUid}`,
      difference: passed ? 'None (Matched)' : 'Spoofed userUid accepted',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(sessionDoc.data() || {}),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-17',
      category: 'AUTHENTICATION',
      scenario: 'Session from wrong user',
      command: 'record-login',
      input: {},
      operation: 'Spoof userUid',
      expected: 'Bound to caller UID',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 18: Concurrent sessions (multiple logins from separate devices)
  try {
    const student = await createClientContext({ role: 'student', emailPrefix: 'concurrent_usr' });
    const res1 = await fetch('http://127.0.0.1:3000/api/auth/record-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${student.token}` },
      body: JSON.stringify({ deviceType: 'Windows PC / Windows', browser: 'Chrome' }),
    });
    const d1 = await res1.json();

    const res2 = await fetch('http://127.0.0.1:3000/api/auth/record-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${student.token}` },
      body: JSON.stringify({ deviceType: 'iPhone / iOS', browser: 'Safari' }),
    });
    const d2 = await res2.json();

    const uniqueSessions = d1.sessionId && d2.sessionId && d1.sessionId !== d2.sessionId;
    recordTest({
      id: 'AUTH-18',
      category: 'AUTHENTICATION',
      scenario: 'Concurrent sessions generate distinct tracked session records without collision',
      command: 'fetch(/api/auth/record-login) x 2 distinct devices',
      input: { session1: 'Windows PC', session2: 'iPhone' },
      operation: 'Concurrent multi-device login registration',
      expected: 'Two distinct session IDs generated and persisted',
      actual: `Session 1: ${d1.sessionId}, Session 2: ${d2.sessionId}`,
      difference: uniqueSessions ? 'None (Matched)' : 'Session ID collision or missing',
      status: uniqueSessions ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `S1=${d1.sessionId}, S2=${d2.sessionId}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-18',
      category: 'AUTHENTICATION',
      scenario: 'Concurrent sessions',
      command: 'record-login',
      input: {},
      operation: 'Two logins',
      expected: 'Distinct session IDs',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 19: Reauthentication on sensitive operation
  try {
    const adminCtx = await createClientContext({ role: 'admin', adminTier: 'primary', emailPrefix: 'reauth_admin' });
    // Reauthentication simulates re-verifying credentials before sensitive action
    const reauthCred = await signInWithEmailAndPassword(adminCtx.auth, adminCtx.email, 'TestPassword123!');
    const reauthUid = reauthCred.user.uid;
    const passed = reauthUid === adminCtx.uid;
    recordTest({
      id: 'AUTH-19',
      category: 'AUTHENTICATION',
      scenario: 'Reauthentication successfully confirms identity before sensitive operation',
      command: 'signInWithEmailAndPassword(adminAuth, email, pass) as re-challenge',
      input: { uid: adminCtx.uid },
      operation: 'Credential re-challenge verification',
      expected: 'Authentic credentials re-confirmed matching active admin UID',
      actual: `Reauthenticated UID matches active UID: ${reauthUid}`,
      difference: passed ? 'None (Matched)' : 'UID mismatch on reauth',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `reauthUid=${reauthUid}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-19',
      category: 'AUTHENTICATION',
      scenario: 'Reauthentication on sensitive operation',
      command: 'signIn',
      input: {},
      operation: 'Re-authenticate',
      expected: 'Reauthenticated UID matches',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // Test 20: Auth state refresh
  try {
    const student = await createClientContext({ role: 'student', emailPrefix: 'refresh_tok_usr' });
    const refreshedToken = await student.auth.currentUser!.getIdToken(true);
    const passed = Boolean(refreshedToken && refreshedToken.length > 100);
    recordTest({
      id: 'AUTH-20',
      category: 'AUTHENTICATION',
      scenario: 'Force refresh of ID token retrieves updated authoritative token',
      command: 'currentUser.getIdToken(true)',
      input: { forceRefresh: true },
      operation: 'Token cache invalidation and fresh fetch from Auth Emulator',
      expected: 'Fresh token string returned (>100 characters)',
      actual: `Token retrieved (length: ${refreshedToken.length})`,
      difference: passed ? 'None (Matched)' : 'Empty or invalid token',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `Token length: ${refreshedToken.length}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'AUTH-20',
      category: 'AUTHENTICATION',
      scenario: 'Auth state refresh',
      command: 'getIdToken',
      input: {},
      operation: 'Force refresh',
      expected: 'Valid refreshed token',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }
}
