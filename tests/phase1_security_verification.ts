/**
 * Phase 1 Critical Security Hardening — End-to-End Verification Suite
 * Executes against live Firebase Auth Emulator (127.0.0.1:9098),
 * live Firestore Emulator (127.0.0.1:8085), real firestore.rules,
 * and Express server routes (server.ts createApp).
 */
process.env.USE_FIREBASE_EMULATOR = 'true';
process.env.NODE_ENV = 'test';
process.env.SKIP_SERVER_START = 'true';
if (!process.env.FIRESTORE_EMULATOR_HOST) process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9098';

import http from 'http';
import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { initializeTestEnvironment, assertSucceeds, assertFails, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { createApp, getAdminDb } from '../server';

const PROJECT_ID = 'project-4b410c97-a152-49e7-940';
const AUTH_EMU_URL = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(category: string, name: string, passed: boolean, details = '') {
  results.push({ category, name, passed, details });
  const prefix = passed ? '[PASS]' : '[FAIL]';
  console.log(`${prefix} [${category}] ${name}${details ? ' — ' + details : ''}`);
}

async function signInWithPasswordEmu(email: string, password: string): Promise<{ idToken: string; localId: string }> {
  const resp = await fetch(`${AUTH_EMU_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data: any = await resp.json();
  if (!resp.ok || !data.idToken) {
    throw new Error(`Emulator sign-in failed for ${email}: ${JSON.stringify(data)}`);
  }
  return { idToken: data.idToken, localId: data.localId };
}

async function createEmuAuthUser(uid: string, email: string, password: string, emailVerified = true) {
  try {
    await admin.auth().deleteUser(uid);
  } catch {
    // ignore if missing
  }
  return admin.auth().createUser({
    uid,
    email,
    password,
    emailVerified,
    displayName: uid
  });
}

async function apiReq(baseUrl: string, method: string, route: string, token?: string, body?: any) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let json: any = null;
  try {
    json = await resp.json();
  } catch {
    json = null;
  }
  return { status: resp.status, json };
}

async function main() {
  let server: http.Server | null = null;
  let testEnv: RulesTestEnvironment | null = null;

  try {
    const app = await createApp({ skipVite: true, skipOutboxWorker: true });
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address() as any;
    const baseUrl = `http://127.0.0.1:${addr.port}`;
    console.log(`Test Express server started at ${baseUrl}`);

    const adminDb = getAdminDb();

    // Load real firestore.rules into emulator rules engine
    const rules = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');
    const [fsHost, fsPortStr] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules,
        host: fsHost || '127.0.0.1',
        port: parseInt(fsPortStr || '8085', 10)
      }
    });
    await testEnv.clearFirestore();

    // Create Auth emulator users
    await createEmuAuthUser('uid_bootstrap_owner', 'rahulsah4534@gmail.com', 'Pass1234!', false);
    const bootstrapUnverifiedSignIn = await signInWithPasswordEmu('rahulsah4534@gmail.com', 'Pass1234!');
    await admin.auth().updateUser('uid_bootstrap_owner', { emailVerified: true });
    const bootstrapVerifiedSignIn = await signInWithPasswordEmu('rahulsah4534@gmail.com', 'Pass1234!');

    await createEmuAuthUser('uid_primary_admin', 'primary.admin@shikshantar.edu.np', 'Pass1234!', true);
    await createEmuAuthUser('uid_secondary_admin', 'secondary.admin@shikshantar.edu.np', 'Pass1234!', true);
    await createEmuAuthUser('uid_class_teacher', 'ct.5a@shikshantar.edu.np', 'Pass1234!', true);
    await createEmuAuthUser('uid_subj_teacher', 'st.math5a@shikshantar.edu.np', 'Pass1234!', true);
    await createEmuAuthUser('uid_student_a', 'student.a@shikshantar.edu.np', 'Pass1234!', true);
    await createEmuAuthUser('uid_student_b', 'student.b@shikshantar.edu.np', 'Pass1234!', true);
    await createEmuAuthUser('uid_missing_profile', 'noprofile@shikshantar.edu.np', 'Pass1234!', true);
    await createEmuAuthUser('uid_pending_user', 'pending@shikshantar.edu.np', 'Pass1234!', true);
    await createEmuAuthUser('uid_inactive_user', 'inactive@shikshantar.edu.np', 'Pass1234!', true);
    await createEmuAuthUser('uid_deleted_user', 'deleted@shikshantar.edu.np', 'Pass1234!', true);

    const primaryToken = (await signInWithPasswordEmu('primary.admin@shikshantar.edu.np', 'Pass1234!')).idToken;
    const secondaryToken = (await signInWithPasswordEmu('secondary.admin@shikshantar.edu.np', 'Pass1234!')).idToken;
    const ctToken = (await signInWithPasswordEmu('ct.5a@shikshantar.edu.np', 'Pass1234!')).idToken;
    const stToken = (await signInWithPasswordEmu('st.math5a@shikshantar.edu.np', 'Pass1234!')).idToken;
    const studentAToken = (await signInWithPasswordEmu('student.a@shikshantar.edu.np', 'Pass1234!')).idToken;
    const missingProfileToken = (await signInWithPasswordEmu('noprofile@shikshantar.edu.np', 'Pass1234!')).idToken;
    const pendingToken = (await signInWithPasswordEmu('pending@shikshantar.edu.np', 'Pass1234!')).idToken;
    const inactiveToken = (await signInWithPasswordEmu('inactive@shikshantar.edu.np', 'Pass1234!')).idToken;
    const deletedToken = (await signInWithPasswordEmu('deleted@shikshantar.edu.np', 'Pass1234!')).idToken;

    // Seed authoritative Firestore profiles & academic fixtures
    await adminDb.collection('users').doc('uid_primary_admin').set({
      uid: 'uid_primary_admin',
      email: 'primary.admin@shikshantar.edu.np',
      fullName: 'Primary Admin',
      role: 'admin',
      adminTier: 'primary',
      active: true,
      status: 'approved',
      deleted: false
    });
    await adminDb.collection('users').doc('uid_secondary_admin').set({
      uid: 'uid_secondary_admin',
      email: 'secondary.admin@shikshantar.edu.np',
      fullName: 'Secondary Admin',
      role: 'admin',
      adminTier: 'secondary',
      active: true,
      status: 'approved',
      deleted: false
    });
    await adminDb.collection('users').doc('uid_class_teacher').set({
      uid: 'uid_class_teacher',
      email: 'ct.5a@shikshantar.edu.np',
      fullName: 'Class Teacher 5A',
      role: 'teacher',
      active: true,
      status: 'approved',
      deleted: false,
      primaryClassTeacher: '5',
      primaryClassTeacherSection: 'A',
      primaryClassTeacherYear: '2083',
      assignmentKeys: ['5_Science_A_2083']
    });
    await adminDb.collection('users').doc('uid_subj_teacher').set({
      uid: 'uid_subj_teacher',
      email: 'st.math5a@shikshantar.edu.np',
      fullName: 'Math Subject Teacher 5A',
      role: 'teacher',
      active: true,
      status: 'approved',
      deleted: false,
      assignmentKeys: ['5_Mathematics_A_2083'],
      teachingAssignments: [{ class: '5', section: 'A', academicYear: '2083', subject: 'Mathematics' }]
    });
    await adminDb.collection('users').doc('uid_student_a').set({
      uid: 'uid_student_a',
      studentUid: 'uid_student_a',
      permanentStudentId: 'SA0001',
      studentId: 'SA0001',
      email: 'student.a@shikshantar.edu.np',
      guardianEmail: 'guardian.a@example.com',
      guardianName: 'Guardian A',
      fullName: 'Student A',
      role: 'student',
      class: '5',
      section: 'A',
      classAssignedYear: '2083',
      rollNumber: '1',
      active: true,
      status: 'approved',
      deleted: false
    });
    await adminDb.collection('users').doc('uid_student_b').set({
      uid: 'uid_student_b',
      studentUid: 'uid_student_b',
      permanentStudentId: 'SA0002',
      studentId: 'SA0002',
      email: 'student.b@shikshantar.edu.np',
      fullName: 'Student B',
      role: 'student',
      class: '5',
      section: 'A',
      classAssignedYear: '2083',
      rollNumber: '2',
      active: true,
      status: 'approved',
      deleted: false
    });
    await adminDb.collection('student_enrollments').doc('ENR_2083_SA0001').set({
      studentUid: 'uid_student_a',
      studentId: 'SA0001',
      permanentStudentId: 'SA0001',
      studentName: 'Student A',
      class: '5',
      section: 'A',
      academicYear: '2083',
      academicYearId: '2083',
      bsYear: 2083,
      rollNumber: '1',
      status: 'ACTIVE'
    });
    await adminDb.collection('student_enrollments').doc('ENR_2083_SA0002').set({
      studentUid: 'uid_student_b',
      studentId: 'SA0002',
      permanentStudentId: 'SA0002',
      studentName: 'Student B',
      class: '5',
      section: 'A',
      academicYear: '2083',
      academicYearId: '2083',
      bsYear: 2083,
      rollNumber: '2',
      status: 'ACTIVE'
    });

    await adminDb.collection('users').doc('uid_pending_user').set({
      uid: 'uid_pending_user',
      email: 'pending@shikshantar.edu.np',
      role: 'teacher',
      status: 'pending',
      active: false,
      deleted: false
    });
    await adminDb.collection('users').doc('uid_inactive_user').set({
      uid: 'uid_inactive_user',
      email: 'inactive@shikshantar.edu.np',
      role: 'teacher',
      status: 'approved',
      active: false,
      deleted: false
    });
    await adminDb.collection('users').doc('uid_deleted_user').set({
      uid: 'uid_deleted_user',
      email: 'deleted@shikshantar.edu.np',
      role: 'admin',
      adminTier: 'secondary',
      status: 'DELETED',
      active: false,
      deleted: true
    });

    // Seed protected settings, audit, alumni, and exam fixtures
    await adminDb.collection('settings').doc('emailjs').set({
      serviceId: 'secret_service',
      templateId: 'secret_tpl',
      publicKey: 'secret_pub',
      toEmail: 'admin@shikshantar.edu.np'
    });
    await adminDb.collection('settings').doc('home_content').set({
      schoolName: 'Shikshantar Academy'
    });
    await adminDb.collection('alumni_submissions').doc('alum_pending').set({
      name: 'Pending Alum',
      status: 'pending'
    });
    await adminDb.collection('alumni_submissions').doc('alum_approved').set({
      name: 'Approved Alum',
      status: 'approved'
    });
    await adminDb.collection('audit_logs').doc('audit_seed_1').set({
      id: 'audit_seed_1',
      actionType: 'SEED',
      actorUid: 'uid_primary_admin'
    });

    // Draft & Ready exam for 5A 2083, plus Published exam for Student isolation check
    const draftExamId = 'FIRST_TERMINAL_5_A_2083';
    await adminDb.collection('exams').doc(draftExamId).set({
      id: draftExamId,
      examId: draftExamId,
      examType: 'First Terminal',
      category: 'TERMINAL',
      terminalExamType: 'FIRST_TERMINAL',
      class: '5',
      canonicalClassId: '5',
      section: 'A',
      canonicalSectionId: 'A',
      academicYear: '2083',
      canonicalAcademicYearId: '2083',
      status: 'READY FOR REVIEW',
      published: false,
      subjectStatus: {}
    });

    const pubExamId = 'SECOND_TERMINAL_5_A_2083';
    await adminDb.collection('exams').doc(pubExamId).set({
      id: pubExamId,
      examId: pubExamId,
      examType: 'Second Terminal',
      category: 'TERMINAL',
      terminalExamType: 'SECOND_TERMINAL',
      class: '5',
      canonicalClassId: '5',
      section: 'A',
      canonicalSectionId: 'A',
      academicYear: '2083',
      canonicalAcademicYearId: '2083',
      status: 'PUBLISHED',
      published: true,
      subjectStatus: {}
    });

    // Seed published and unpublished results for Student A & Student B
    await adminDb.collection('resultSummary').doc(`${pubExamId}_uid_student_a`).set({
      examId: pubExamId,
      studentUid: 'uid_student_a',
      studentId: 'SA0001',
      class: '5',
      section: 'A',
      academicYear: '2083',
      totalMarks: 80,
      percentage: 80,
      gpa: 3.6,
      published: true
    });
    await adminDb.collection('resultSummary').doc(`${pubExamId}_uid_student_b`).set({
      examId: pubExamId,
      studentUid: 'uid_student_b',
      studentId: 'SA0002',
      class: '5',
      section: 'A',
      academicYear: '2083',
      totalMarks: 85,
      percentage: 85,
      gpa: 3.8,
      published: true
    });
    await adminDb.collection('resultSummary').doc(`${draftExamId}_uid_student_a`).set({
      examId: draftExamId,
      studentUid: 'uid_student_a',
      studentId: 'SA0001',
      class: '5',
      section: 'A',
      academicYear: '2083',
      totalMarks: 70,
      percentage: 70,
      gpa: 3.2,
      published: false
    });
    await adminDb.collection('results').doc(`${pubExamId}_uid_student_a_Mathematics`).set({
      examId: pubExamId,
      studentUid: 'uid_student_a',
      subject: 'Mathematics',
      subjectKey: 'Mathematics',
      class: '5',
      section: 'A',
      academicYear: '2083',
      thFull: 75,
      prFull: 25,
      thPass: 30,
      prPass: 10,
      fullMarks: 100,
      thMarks: 60,
      prMarks: 20,
      marks: 80,
      published: true
    });
    await adminDb.collection('results').doc(`${draftExamId}_uid_student_a_Mathematics`).set({
      examId: draftExamId,
      studentUid: 'uid_student_a',
      subject: 'Mathematics',
      subjectKey: 'Mathematics',
      class: '5',
      section: 'A',
      academicYear: '2083',
      thFull: 75,
      prFull: 25,
      thPass: 30,
      prPass: 10,
      fullMarks: 100,
      thMarks: 50,
      prMarks: 20,
      marks: 70,
      published: false
    });
    await adminDb.collection('remitBills').doc('bill_student_a').set({
      studentId: 'uid_student_a',
      amount: 1500
    });
    await adminDb.collection('remitBills').doc('bill_student_b').set({
      studentId: 'uid_student_b',
      amount: 2000
    });

    // =========================================================================
    // ACCEPTANCE 1: Token Verification & Revocation
    // =========================================================================
    const rMissing = await apiReq(baseUrl, 'GET', '/api/exams/terminal-availability?academicYear=2083&className=5&section=A');
    record('1. Auth Tokens', 'Rejects missing Authorization token', rMissing.status === 401, `status=${rMissing.status}`);

    const rMock = await apiReq(baseUrl, 'GET', '/api/exams/terminal-availability?academicYear=2083&className=5&section=A', 'mock_token_uid_primary_admin');
    record('1. Auth Tokens', 'Rejects mock_token_* backdoor', rMock.status === 401, `status=${rMock.status}`);

    const rMalformed = await apiReq(baseUrl, 'GET', '/api/exams/terminal-availability?academicYear=2083&className=5&section=A', 'not-a-jwt-token');
    record('1. Auth Tokens', 'Rejects malformed JWT', rMalformed.status === 401, `status=${rMalformed.status}`);

    // Test token revocation using a dedicated user
    await createEmuAuthUser('uid_revoke_user', 'revoke.user@shikshantar.edu.np', 'Pass1234!', true);
    await adminDb.collection('users').doc('uid_revoke_user').set({
      uid: 'uid_revoke_user',
      email: 'revoke.user@shikshantar.edu.np',
      role: 'admin',
      adminTier: 'secondary',
      active: true,
      status: 'approved',
      deleted: false
    });
    const revokeSignIn = await signInWithPasswordEmu('revoke.user@shikshantar.edu.np', 'Pass1234!');
    const beforeRevoke = await apiReq(baseUrl, 'GET', '/api/exams/terminal-availability?academicYear=2083&className=5&section=A', revokeSignIn.idToken);
    await admin.auth().revokeRefreshTokens('uid_revoke_user');
    // Ensure auth_time < revokedAt check passes (Emulator seconds granularity)
    await new Promise(r => setTimeout(r, 1100));
    // Re-test same old token with verifyIdToken(..., true); wait if Auth Emulator evaluates validSince >= auth_time in seconds, fetch another token if needed? No, testing the BEFORE-revocation token after wait guarantees auth_time <= tokensValidAfterTime!
    await admin.auth().revokeRefreshTokens('uid_revoke_user');
    const afterRevoke = await apiReq(baseUrl, 'GET', '/api/exams/terminal-availability?academicYear=2083&className=5&section=A', revokeSignIn.idToken);
    record('1. Auth Tokens', 'Accepts valid token before revocation & rejects revoked token (401)', beforeRevoke.status === 200 && afterRevoke.status === 401, `before=${beforeRevoke.status}, after=${afterRevoke.status}`);

    // =========================================================================
    // ACCEPTANCE 2: Fail-Closed Account Status & Bootstrap Owner Email Verification
    // =========================================================================
    const rNoProfile = await apiReq(baseUrl, 'GET', '/api/exams/authorized-roster?academicYear=2083&className=5&section=A', missingProfileToken);
    record('2. Fail-Closed Accounts', 'Rejects missing users/{uid} profile', rNoProfile.status === 403, `status=${rNoProfile.status}`);

    const rPending = await apiReq(baseUrl, 'GET', '/api/exams/authorized-roster?academicYear=2083&className=5&section=A', pendingToken);
    record('2. Fail-Closed Accounts', 'Rejects pending user', rPending.status === 403, `status=${rPending.status}`);

    const rInactive = await apiReq(baseUrl, 'GET', '/api/exams/authorized-roster?academicYear=2083&className=5&section=A', inactiveToken);
    record('2. Fail-Closed Accounts', 'Rejects inactive user', rInactive.status === 403, `status=${rInactive.status}`);

    const rDeleted = await apiReq(baseUrl, 'GET', '/api/exams/authorized-roster?academicYear=2083&className=5&section=A', deletedToken);
    record('2. Fail-Closed Accounts', 'Rejects deleted user', rDeleted.status === 403, `status=${rDeleted.status}`);

    const rBootUnverified = await apiReq(baseUrl, 'GET', '/api/exams/authorized-roster?academicYear=2083&className=5&section=A', bootstrapUnverifiedSignIn.idToken);
    record('2. Fail-Closed Accounts', 'Rejects unverified bootstrap owner email', rBootUnverified.status === 403, `status=${rBootUnverified.status}`);

    const rBootVerified = await apiReq(baseUrl, 'GET', '/api/exams/authorized-roster?academicYear=2083&className=5&section=A', bootstrapVerifiedSignIn.idToken);
    record('2. Fail-Closed Accounts', 'Allows verified bootstrap owner email', rBootVerified.status === 200, `status=${rBootVerified.status}`);

    // =========================================================================
    // ACCEPTANCE 3: Primary Admin vs Secondary Admin & Self-Escalation Boundaries
    // =========================================================================
    const rSecCreateAdmin = await apiReq(baseUrl, 'POST', '/api/users/create', secondaryToken, {
      email: 'new.admin@shikshantar.edu.np',
      password: 'Password123!',
      fullName: 'Unauthorized Admin',
      role: 'admin',
      adminTier: 'primary'
    });
    record('3. Admin Boundaries', 'Secondary Admin blocked from creating Admin (403)', rSecCreateAdmin.status === 403, `status=${rSecCreateAdmin.status}`);

    const rSecDeleteAdmin = await apiReq(baseUrl, 'POST', '/api/users/delete-auth', secondaryToken, {
      uid: 'uid_primary_admin'
    });
    record('3. Admin Boundaries', 'Secondary Admin blocked from deleting Admin Auth (403)', rSecDeleteAdmin.status === 403, `status=${rSecDeleteAdmin.status}`);

    const rSecBulkDeleteAdmin = await apiReq(baseUrl, 'POST', '/api/users/delete-auth-bulk', secondaryToken, {
      uids: ['uid_primary_admin']
    });
    record(
      '3. Admin Boundaries',
      'Secondary Admin bulk delete refuses Admin target',
      rSecBulkDeleteAdmin.status === 200 && rSecBulkDeleteAdmin.json?.results?.[0]?.status === 'forbidden',
      `result=${JSON.stringify(rSecBulkDeleteAdmin.json?.results)}`
    );

    const rPrimCreateTeacher = await apiReq(baseUrl, 'POST', '/api/users/create', primaryToken, {
      email: 'new.teacher@shikshantar.edu.np',
      password: 'Password123!',
      fullName: 'Created Teacher',
      role: 'teacher',
      primaryClassTeacher: '6',
      primaryClassTeacherSection: 'A',
      primaryClassTeacherYear: '2083'
    });
    record('3. Admin Boundaries', 'Primary Admin creates Teacher via /api/users/create (201)', rPrimCreateTeacher.status === 201, `status=${rPrimCreateTeacher.status}`);

    // Firestore self-escalation tests
    const studentCtx = testEnv.authenticatedContext('uid_student_a', { email: 'student.a@shikshantar.edu.np', email_verified: true });
    let selfEscRoleDenied = false;
    try {
      await assertFails(studentCtx.firestore().collection('users').doc('uid_student_a').update({ role: 'admin', adminTier: 'primary' }));
      selfEscRoleDenied = true;
    } catch {}
    record('3. Admin Boundaries', 'Student cannot self-escalate role/adminTier in Firestore', selfEscRoleDenied);

    let selfEscFeeDenied = false;
    try {
      await assertFails(studentCtx.firestore().collection('users').doc('uid_student_a').update({ advanceBalance: 99999, activeSessions: ['spoof'] }));
      selfEscFeeDenied = true;
    } catch {}
    record('3. Admin Boundaries', 'User cannot mutate advanceBalance or activeSessions in Firestore', selfEscFeeDenied);

    const secAdminCtx = testEnv.authenticatedContext('uid_secondary_admin', { email: 'secondary.admin@shikshantar.edu.np', email_verified: true });
    let secTierEscDenied = false;
    try {
      await assertFails(secAdminCtx.firestore().collection('users').doc('uid_secondary_admin').update({ adminTier: 'primary' }));
      secTierEscDenied = true;
    } catch {}
    record('3. Admin Boundaries', 'Secondary Admin cannot promote self to primary adminTier in Firestore', secTierEscDenied);

    // =========================================================================
    // ACCEPTANCE 4: Teacher 4D Isolation & Roster/Users Restrictions
    // =========================================================================
    const rCtRosterAllowed = await apiReq(baseUrl, 'GET', '/api/exams/authorized-roster?academicYear=2083&className=5&section=A', ctToken);
    record('4. Teacher 4D Isolation', 'Class Teacher 5A (2083) allowed own roster (200) without email/guardian PII', rCtRosterAllowed.status === 200 && rCtRosterAllowed.json?.students?.[0]?.guardianEmail === undefined, `status=${rCtRosterAllowed.status}, count=${rCtRosterAllowed.json?.students?.length}`);

    const rCtWrongYear = await apiReq(baseUrl, 'GET', '/api/exams/authorized-roster?academicYear=2082&className=5&section=A', ctToken);
    record('4. Teacher 4D Isolation', 'Class Teacher blocked on wrong academic year (403)', rCtWrongYear.status === 403, `status=${rCtWrongYear.status}`);

    const rCtWrongSection = await apiReq(baseUrl, 'GET', '/api/exams/authorized-roster?academicYear=2083&className=5&section=B', ctToken);
    record('4. Teacher 4D Isolation', 'Class Teacher blocked on wrong section (403)', rCtWrongSection.status === 403, `status=${rCtWrongSection.status}`);

    const rCtWrongClass = await apiReq(baseUrl, 'GET', '/api/exams/authorized-roster?academicYear=2083&className=6&section=A', ctToken);
    record('4. Teacher 4D Isolation', 'Class Teacher blocked on wrong class (403)', rCtWrongClass.status === 403, `status=${rCtWrongClass.status}`);

    const rStAllowedMath = await apiReq(baseUrl, 'POST', '/api/results/save-marks', stToken, {
      operationId: `op_math_ok_${Date.now()}`,
      examId: draftExamId,
      selectedClass: '5',
      selectedSection: 'A',
      selectedAcademicYear: '2083',
      subjectToSave: 'Mathematics',
      subjectKey: 'Mathematics',
      students: [{
        studentUid: 'uid_student_a',
        studentId: 'SA0001',
        permanentStudentId: 'SA0001',
        studentName: 'Student A',
        subjectMarksTH: { Mathematics: 62 },
        subjectMarksPR: { Mathematics: 21 }
      }]
    });
    record('4. Teacher 4D Isolation', 'Subject Teacher allowed assigned 4D subject save-marks (200)', rStAllowedMath.status === 200, `status=${rStAllowedMath.status}`);

    const rStDeniedScience = await apiReq(baseUrl, 'POST', '/api/results/save-marks', stToken, {
      operationId: `op_sci_deny_${Date.now()}`,
      examId: draftExamId,
      selectedClass: '5',
      selectedSection: 'A',
      selectedAcademicYear: '2083',
      subjectToSave: 'Science',
      subjectKey: 'Science',
      students: [{
        studentUid: 'uid_student_a',
        studentId: 'SA0001',
        permanentStudentId: 'SA0001',
        studentName: 'Student A',
        subjectMarksTH: { Science: 60 },
        subjectMarksPR: { Science: 20 }
      }]
    });
    record('4. Teacher 4D Isolation', 'Subject Teacher blocked on unassigned subject Science (403)', rStDeniedScience.status === 403, `status=${rStDeniedScience.status}`);

    const ctCtx = testEnv.authenticatedContext('uid_class_teacher', { email: 'ct.5a@shikshantar.edu.np', email_verified: true });
    let teacherReadOtherUserDenied = false;
    try {
      await assertFails(ctCtx.firestore().collection('users').doc('uid_student_a').get());
      teacherReadOtherUserDenied = true;
    } catch {}
    record('4. Teacher 4D Isolation', 'Teacher blocked from reading student user docs directly in Firestore', teacherReadOtherUserDenied);

    // =========================================================================
    // ACCEPTANCE 5: Student Cross-Tenant & Unpublished Isolation
    // =========================================================================
    let studentOwnPubAllowed = false;
    let studentOtherPubDenied = false;
    let studentOwnUnpubDenied = false;
    let studentOtherFeeDenied = false;
    try {
      await assertSucceeds(studentCtx.firestore().collection('resultSummary').doc(`${pubExamId}_uid_student_a`).get());
      studentOwnPubAllowed = true;
    } catch {}
    try {
      await assertFails(studentCtx.firestore().collection('resultSummary').doc(`${pubExamId}_uid_student_b`).get());
      studentOtherPubDenied = true;
    } catch {}
    try {
      await assertFails(studentCtx.firestore().collection('resultSummary').doc(`${draftExamId}_uid_student_a`).get());
      studentOwnUnpubDenied = true;
    } catch {}
    try {
      await assertFails(studentCtx.firestore().collection('remitBills').doc('bill_student_b').get());
      studentOtherFeeDenied = true;
    } catch {}
    record(
      '5. Student Isolation',
      'Student reads own published summary, blocked from peer/unpublished results and peer fee bills',
      studentOwnPubAllowed && studentOtherPubDenied && studentOwnUnpubDenied && studentOtherFeeDenied,
      `ownPub=${studentOwnPubAllowed}, peerDenied=${studentOtherPubDenied}, unpubDenied=${studentOwnUnpubDenied}, feeDenied=${studentOtherFeeDenied}`
    );

    // =========================================================================
    // ACCEPTANCE 6: Admin-Only Result Publication Lock
    // =========================================================================
    let ctDirectPublishDenied = false;
    try {
      await assertFails(ctCtx.firestore().collection('exams').doc(draftExamId).update({ status: 'PUBLISHED', published: true }));
      ctDirectPublishDenied = true;
    } catch {}
    record('6. Admin-Only Publish', 'Class Teacher blocked from direct Firestore exam publish', ctDirectPublishDenied);

    const rCtPublish = await apiReq(baseUrl, 'POST', '/api/results/publish', ctToken, {
      examId: draftExamId,
      targetClass: '5',
      targetSection: 'A',
      targetAcademicYear: '2083',
      summaryRecords: []
    });
    record('6. Admin-Only Publish', 'Class Teacher blocked from POST /api/results/publish (403)', rCtPublish.status === 403, `status=${rCtPublish.status}`);

    const rAdminPublish = await apiReq(baseUrl, 'POST', '/api/results/publish', primaryToken, {
      examId: draftExamId,
      targetClass: '5',
      targetSection: 'A',
      targetAcademicYear: '2083',
      summaryRecords: [{
        studentUid: 'uid_student_a',
        studentId: 'SA0001',
        totalMarks: 80,
        percentage: 80,
        gpa: 3.6,
        grade: 'A'
      }]
    });
    record('6. Admin-Only Publish', 'Admin succeeds publishing READY FOR REVIEW exam (200)', rAdminPublish.status === 200, `status=${rAdminPublish.status}`);

    const rDuplicatePublish = await apiReq(baseUrl, 'POST', '/api/results/publish', primaryToken, {
      examId: draftExamId,
      targetClass: '5',
      targetSection: 'A',
      targetAcademicYear: '2083',
      summaryRecords: []
    });
    record('6. Admin-Only Publish', 'Duplicate publication blocked (409)', rDuplicatePublish.status === 409, `status=${rDuplicatePublish.status}`);

    // =========================================================================
    // ACCEPTANCE 7: Public Submission CAPTCHA & Anti-Replay + Firestore Lock
    // =========================================================================
    const unauthCtx = testEnv.unauthenticatedContext();
    let directPublicWritesDenied = false;
    try {
      await assertFails(unauthCtx.firestore().collection('admissions').add({ studentName: 'Bypass' }));
      await assertFails(unauthCtx.firestore().collection('contact_enquiries').add({ name: 'Bypass' }));
      await assertFails(unauthCtx.firestore().collection('alumni_submissions').add({ name: 'Bypass' }));
      directPublicWritesDenied = true;
    } catch {}
    record('7. Public CAPTCHA & Locks', 'Direct unauthenticated Firestore creates on admissions/enquiries/alumni denied', directPublicWritesDenied);

    let pendingAlumDenied = false;
    let approvedAlumAllowed = false;
    try {
      await assertFails(unauthCtx.firestore().collection('alumni_submissions').doc('alum_pending').get());
      pendingAlumDenied = true;
    } catch {}
    try {
      await assertSucceeds(unauthCtx.firestore().collection('alumni_submissions').doc('alum_approved').get());
      approvedAlumAllowed = true;
    } catch {}
    record('7. Public CAPTCHA & Locks', 'Unapproved alumni read denied & approved alumni read allowed to public', pendingAlumDenied && approvedAlumAllowed);

    const chResp = await apiReq(baseUrl, 'GET', '/api/auth/verify-captcha');
    const qMatch = String(chResp.json?.question || '').match(/What is (\d+) \+ (\d+)\?/);
    const correctAns = qMatch ? Number(qMatch[1]) + Number(qMatch[2]) : -1;
    const rBadCaptcha = await apiReq(baseUrl, 'POST', '/api/auth/verify-captcha', undefined, {
      challengeToken: chResp.json?.challengeToken,
      answer: correctAns + 99
    });
    const rGoodCaptcha = await apiReq(baseUrl, 'POST', '/api/auth/verify-captcha', undefined, {
      challengeToken: chResp.json?.challengeToken,
      answer: correctAns
    });
    const verTok = rGoodCaptcha.json?.verificationToken;
    const rSubmitEnq1 = await apiReq(baseUrl, 'POST', '/api/public/submit-enquiry', undefined, {
      name: 'Guardian Test',
      phone: '9800000000',
      message: 'Admission enquiry for Class 5',
      verificationToken: verTok
    });
    const rSubmitEnqReplay = await apiReq(baseUrl, 'POST', '/api/public/submit-enquiry', undefined, {
      name: 'Replay Attacker',
      phone: '9800000000',
      message: 'Replayed token',
      verificationToken: verTok
    });
    record(
      '7. Public CAPTCHA & Locks',
      'Wrong CAPTCHA rejected (400), single-use submit accepted (201), replay rejected (400)',
      rBadCaptcha.status === 400 && rSubmitEnq1.status === 201 && rSubmitEnqReplay.status === 400,
      `bad=${rBadCaptcha.status}, submit1=${rSubmitEnq1.status}, replay=${rSubmitEnqReplay.status}`
    );

    // =========================================================================
    // ACCEPTANCE 8: Secret Settings & Audit Log Isolation
    // =========================================================================
    let emailJsDeniedToNonAdmin = false;
    try {
      await assertFails(unauthCtx.firestore().collection('settings').doc('emailjs').get());
      await assertFails(studentCtx.firestore().collection('settings').doc('emailjs').get());
      await assertFails(ctCtx.firestore().collection('settings').doc('emailjs').get());
      emailJsDeniedToNonAdmin = true;
    } catch {}
    record('8. Secrets & Audit Logs', 'settings/emailjs denied to unauth, student, and teacher', emailJsDeniedToNonAdmin);

    let auditDirectWriteDenied = false;
    let auditStudentReadDenied = false;
    try {
      await assertFails(ctCtx.firestore().collection('audit_logs').doc('forged_audit').set({ actorUid: 'uid_primary_admin', actionType: 'FORGED' }));
      await assertFails(studentCtx.firestore().collection('audit_logs').doc('audit_seed_1').get());
      auditDirectWriteDenied = true;
      auditStudentReadDenied = true;
    } catch {}
    record('8. Secrets & Audit Logs', 'Direct audit_logs write denied to teacher & read denied to student', auditDirectWriteDenied && auditStudentReadDenied);

    const rAuditSpoof = await apiReq(baseUrl, 'POST', '/api/audit/log', ctToken, {
      actionType: 'TEACHER_TEST_LOG',
      reason: 'Verifying server authoritative actor stamping',
      actorUid: 'uid_primary_admin',
      actorRole: 'admin'
    });
    let actorStampedCorrectly = false;
    if (rAuditSpoof.status === 200 && rAuditSpoof.json?.auditLogId) {
      const logDoc = await adminDb.collection('audit_logs').doc(rAuditSpoof.json.auditLogId).get();
      const d = logDoc.data() || {};
      actorStampedCorrectly = d.actorUid === 'uid_class_teacher' && d.actorRole === 'teacher';
    }
    const rStudentAudit = await apiReq(baseUrl, 'POST', '/api/audit/log', studentAToken, {
      actionType: 'STUDENT_LOG',
      reason: 'Should fail'
    });
    record('8. Secrets & Audit Logs', 'POST /api/audit/log stamps server actorUid/actorRole & blocks students (403)', actorStampedCorrectly && rStudentAudit.status === 403, `stamped=${actorStampedCorrectly}, studentStatus=${rStudentAudit.status}`);

    // Verify legitimate non-privileged user profile update succeeds under hardened rules
    let ownSafeUpdateAllowed = false;
    try {
      await assertSucceeds(studentCtx.firestore().collection('users').doc('uid_student_a').update({ fullName: 'Student A Updated' }));
      ownSafeUpdateAllowed = true;
    } catch {}
    record('3. Admin Boundaries', 'User can update own non-privileged fullName field in Firestore', ownSafeUpdateAllowed);

    // =========================================================================
    // ACCEPTANCE 9: Email Routes (No Simulated Success; Admin + Published + Guardian Email Policy)
    // =========================================================================
    const rBirthdayTeacher = await apiReq(baseUrl, 'POST', '/api/birthday/send-wishes', ctToken, {
      email: 'student@example.com',
      role: 'student',
      name: 'Student A'
    });
    const rBirthdayNoSmtp = await apiReq(baseUrl, 'POST', '/api/birthday/send-wishes', primaryToken, {
      email: 'student@example.com',
      role: 'student',
      name: 'Student A'
    });
    const rPubEmailUnpub = await apiReq(baseUrl, 'POST', '/api/results/send-publication-emails', primaryToken, {
      examId: 'NON_EXISTENT_OR_UNPUBLISHED_EXAM',
      examType: 'First Terminal',
      className: '5',
      students: [{ name: 'Student A', guardianEmail: 'guardian.a@example.com' }]
    });
    const rPubEmailNoSmtp = await apiReq(baseUrl, 'POST', '/api/results/send-publication-emails', primaryToken, {
      examId: pubExamId,
      examType: 'Second Terminal',
      className: '5',
      students: [{ name: 'Student A', guardianEmail: 'guardian.a@example.com' }]
    });
    record(
      '9. Email Service Integrity',
      'Email routes require Admin, reject missing SMTP honestly (503 SMTP_NOT_CONFIGURED), never simulate success',
      rBirthdayTeacher.status === 403 &&
        rBirthdayNoSmtp.status === 503 &&
        rBirthdayNoSmtp.json?.code === 'SMTP_NOT_CONFIGURED' &&
        rPubEmailUnpub.status === 404 &&
        rPubEmailNoSmtp.status === 503 &&
        rPubEmailNoSmtp.json?.code === 'SMTP_NOT_CONFIGURED',
      `bdayTeacher=${rBirthdayTeacher.status}, bdayNoSmtp=${rBirthdayNoSmtp.status}, pubMissing=${rPubEmailUnpub.status}, pubNoSmtp=${rPubEmailNoSmtp.status}`
    );

    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.length - passedCount;
    console.log('\n====================================================');
    console.log(`PHASE 1 SECURITY SUMMARY: ${passedCount}/${results.length} PASSED, ${failedCount} FAILED`);
    console.log('====================================================');
    if (failedCount > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (testEnv) await testEnv.cleanup().catch(() => {});
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
  }
}

main().catch((err) => {
  console.error('Fatal error in Phase 1 Security Verification:', err);
  process.exit(1);
});
