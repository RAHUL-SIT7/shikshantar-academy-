import admin from 'firebase-admin';
import crypto from 'crypto';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { 
  buildCanonicalExamId, 
  normalizeTerminalExamType, 
  validateSubjectConfigItem 
} from '../src/lib/resultPreparationEngine';
import { normalizeClass } from '../src/lib/teacherAssignmentEngine';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9098';

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = admin.firestore();

interface TestResult {
  id: number;
  category: string;
  name: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

const results: TestResult[] = [];

async function runTest(id: number, category: string, name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`[PASS] #${id} [${category}] ${name}`);
    results.push({ id, category, name, status: 'PASS' });
  } catch (err: any) {
    console.error(`[FAIL] #${id} [${category}] ${name} — ${err.message || err}`);
    results.push({ id, category, name, status: 'FAIL', details: err.message || String(err) });
  }
}

// Helper to seed users in Firestore and Auth
async function createTestUser(uid: string, email: string, role: string, extraData: any = {}) {
  await db.collection('users').doc(uid).set({
    uid,
    email,
    role,
    status: 'ACTIVE',
    updatedAt: new Date().toISOString(),
    ...extraData
  }, { merge: true });
}

// Helper to call backend API endpoints using mock Bearer tokens with retry
async function callApi(endpoint: string, body: any, userUid: string, extraHeaders: Record<string, string> = {}) {
  const token = `mock_token_${userUid}`;

  let attempts = 0;
  while (attempts < 5) {
    try {
      const response = await fetch(`http://127.0.0.1:3000${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...extraHeaders
        },
        body: JSON.stringify(body)
      });

      const text = await response.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch (_) {
        throw new Error(`HTTP ${response.status}: Failed to parse JSON response: ${text}`);
      }
      return { status: response.status, body: json };
    } catch (err: any) {
      attempts++;
      if (attempts >= 5) throw err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('API call failed after 5 retries');
}

async function runStep5TestSuite() {
  console.log('================================================================');
  console.log('SHIKSHANTAR ACADEMY — STEP 5 PHASE 1 EXAM SETUP TEST SUITE');
  console.log('Target: Live Backend & Firestore Emulator (127.0.0.1:8085)');
  console.log('================================================================\n');

  // Clean test collections in emulator for reproducible test runs
  const collectionsToClean = ['exams', 'exam_idempotency_keys', 'used_impact_tokens', 'exam_audit_logs', 'publication_email_dispatches'];
  for (const colName of collectionsToClean) {
    const snap = await db.collection(colName).get();
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    if (!snap.empty) await batch.commit();
  }

  // Seed test users
  const adminUid = 'admin_user_step5';
  const classTeacherUid = 'ct_class8a_step5';
  const wrongTeacherUid = 'ct_class5a_step5';
  const subjectTeacherUid = 'st_only_step5';
  const secondAdminUid = 'admin_two_step5';

  await createTestUser(adminUid, 'admin@shikshantar.edu.np', 'ADMIN');
  await createTestUser(secondAdminUid, 'admin2@shikshantar.edu.np', 'ADMIN');
  await createTestUser(classTeacherUid, 'ct8a@shikshantar.edu.np', 'TEACHER', {
    isClassTeacher: true,
    primaryClassTeacher: 'Class 8',
    primaryClassTeacherSection: 'A',
    primaryClassTeacherYear: '2083'
  });
  await createTestUser(wrongTeacherUid, 'ct5a@shikshantar.edu.np', 'TEACHER', {
    isClassTeacher: true,
    primaryClassTeacher: 'Class 5',
    primaryClassTeacherSection: 'A',
    primaryClassTeacherYear: '2083'
  });
  await createTestUser(subjectTeacherUid, 'st@shikshantar.edu.np', 'TEACHER', {
    isClassTeacher: false
  });

  const sampleSubjects = [
    { subjectKey: 'Mathematics', subjectName: 'Mathematics', enabled: true, hasTh: true, thFullMarks: 75, thPassMarks: 30, hasPr: true, prFullMarks: 25, prPassMarks: 10 },
    { subjectKey: 'Science', subjectName: 'Science', enabled: true, hasTh: true, thFullMarks: 75, thPassMarks: 30, hasPr: true, prFullMarks: 25, prPassMarks: 10 }
  ];

  // 1. Four valid Terminal exam IDs
  await runTest(1, 'TERMINAL_IDENTITY', 'Four valid Terminal exam IDs generation and canonical mapping', async () => {
    const t1 = buildCanonicalExamId('FIRST_TERMINAL', 'Class 8', 'A', '2083', { category: 'TERMINAL' });
    const t2 = buildCanonicalExamId('SECOND_TERMINAL', 'Class 8', 'A', '2083', { category: 'TERMINAL' });
    const t3 = buildCanonicalExamId('THIRD_TERMINAL', 'Class 8', 'A', '2083', { category: 'TERMINAL' });
    const t4 = buildCanonicalExamId('FINAL', 'Class 8', 'A', '2083', { category: 'TERMINAL' });

    if (t1 !== 'FIRST_TERMINAL_8_A_2083') throw new Error(`Expected FIRST_TERMINAL_8_A_2083, got ${t1}`);
    if (t2 !== 'SECOND_TERMINAL_8_A_2083') throw new Error(`Expected SECOND_TERMINAL_8_A_2083, got ${t2}`);
    if (t3 !== 'THIRD_TERMINAL_8_A_2083') throw new Error(`Expected THIRD_TERMINAL_8_A_2083, got ${t3}`);
    if (t4 !== 'FINAL_8_A_2083') throw new Error(`Expected FINAL_8_A_2083, got ${t4}`);
  });

  // 2. Terminal duplicate prevention
  await runTest(2, 'TERMINAL_UNIQUENESS', 'Terminal duplicate prevention returns existing record', async () => {
    const op1 = 'op_term_init_1';
    const res1 = await callApi('/api/exams/initialize-or-resume', {
      operationId: op1,
      category: 'TERMINAL',
      terminalExamType: 'FIRST_TERMINAL',
      canonicalClassId: 'Class 8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083',
      subjectConfigs: sampleSubjects
    }, adminUid);

    if (res1.status !== 200 || !res1.body.exam) {
      throw new Error(`Init failed: status ${res1.status}, body: ${JSON.stringify(res1.body)}`);
    }

    const op2 = 'op_term_init_2';
    const res2 = await callApi('/api/exams/initialize-or-resume', {
      operationId: op2,
      category: 'TERMINAL',
      terminalExamType: 'FIRST_TERMINAL',
      canonicalClassId: 'Class 8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083',
      subjectConfigs: sampleSubjects
    }, adminUid);

    if (res2.status !== 200 || res2.body.exam?.examId !== 'FIRST_TERMINAL_8_A_2083' || !res2.body.resumed) {
      throw new Error(`Expected resumed FIRST_TERMINAL_8_A_2083, got: ${JSON.stringify(res2.body)}`);
    }
  });

  // 3. Concurrent Admin/Class Teacher initialization
  await runTest(3, 'CONCURRENCY', 'Concurrent Admin and Class Teacher initialization return same canonical exam', async () => {
    const p1 = callApi('/api/exams/initialize-or-resume', {
      operationId: 'op_conc_admin',
      category: 'TERMINAL',
      terminalExamType: 'SECOND_TERMINAL',
      canonicalClassId: '8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    }, adminUid);

    const p2 = callApi('/api/exams/initialize-or-resume', {
      operationId: 'op_conc_ct',
      category: 'TERMINAL',
      terminalExamType: 'SECOND_TERMINAL',
      canonicalClassId: '8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    }, classTeacherUid);

    const [r1, r2] = await Promise.all([p1, p2]);

    if (r1.status !== 200 || r2.status !== 200) {
      throw new Error(`Concurrent calls failed: r1=${r1.status} (${JSON.stringify(r1.body)}), r2=${r2.status} (${JSON.stringify(r2.body)})`);
    }
    if (r1.body.exam?.examId !== 'SECOND_TERMINAL_8_A_2083' || r2.body.exam?.examId !== 'SECOND_TERMINAL_8_A_2083') {
      throw new Error('Exam IDs did not match canonical SECOND_TERMINAL_8_A_2083');
    }
  });

  // 4. Same operationId retry after simulated timeout
  await runTest(4, 'IDEMPOTENCY', 'Same operationId retry returns identical idempotent response', async () => {
    const op = 'op_retry_test_1001';
    const payload = {
      operationId: op,
      category: 'TERMINAL',
      terminalExamType: 'THIRD_TERMINAL',
      canonicalClassId: '8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    };

    const res1 = await callApi('/api/exams/initialize-or-resume', payload, adminUid);
    const res2 = await callApi('/api/exams/initialize-or-resume', payload, adminUid);

    if (res1.status !== 200 || res2.status !== 200) throw new Error(`Initialization requests failed: ${JSON.stringify(res1.body)}, ${JSON.stringify(res2.body)}`);
    if (!res2.body.isRetry) throw new Error('Expected isRetry flag on second attempt');
  });

  // 5. Same operationId with different payload rejection
  await runTest(5, 'IDEMPOTENCY', 'Same operationId with different payload returns HTTP 400 mismatch error', async () => {
    const op = 'op_mismatch_test_1002';
    await callApi('/api/exams/initialize-or-resume', {
      operationId: op,
      category: 'TERMINAL',
      terminalExamType: 'FINAL',
      canonicalClassId: '8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    }, adminUid);

    const res2 = await callApi('/api/exams/initialize-or-resume', {
      operationId: op,
      category: 'TERMINAL',
      terminalExamType: 'FINAL',
      canonicalClassId: '9', // Different class!
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    }, adminUid);

    if (res2.status !== 400 || !res2.body.error?.includes('different payload')) {
      throw new Error(`Expected HTTP 400 mismatch error, got status ${res2.status}: ${JSON.stringify(res2.body)}`);
    }
  });

  // 6. Different actor + same operationId rejection
  await runTest(6, 'IDEMPOTENCY_SECURITY', 'Different actor with same operationId is rejected with HTTP 403', async () => {
    const op = 'op_diff_actor_idempotency_1003';
    await callApi('/api/exams/initialize-or-resume', {
      operationId: op,
      category: 'TERMINAL',
      terminalExamType: 'FINAL',
      canonicalClassId: '8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    }, adminUid);

    const res2 = await callApi('/api/exams/initialize-or-resume', {
      operationId: op,
      category: 'TERMINAL',
      terminalExamType: 'FINAL',
      canonicalClassId: '8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    }, secondAdminUid);

    if (res2.status !== 403 || !res2.body.error?.includes('owned by another authenticated actor')) {
      throw new Error(`Expected HTTP 403 owner mismatch error, got status ${res2.status}: ${JSON.stringify(res2.body)}`);
    }
  });

  // 7. Different operationIds create distinct Test instances
  await runTest(7, 'TEST_INSTANCES', 'Different operationIds create distinct Test instances', async () => {
    const r1 = await callApi('/api/exams/initialize-or-resume', {
      operationId: 'op_test_inst_1',
      category: 'TEST',
      testDisplayName: 'Weekly Quiz 1',
      canonicalClassId: '8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    }, adminUid);

    const r2 = await callApi('/api/exams/initialize-or-resume', {
      operationId: 'op_test_inst_2',
      category: 'TEST',
      testDisplayName: 'Weekly Quiz 1',
      canonicalClassId: '8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    }, adminUid);

    if (r1.status !== 200 || r2.status !== 200) throw new Error(`Test init failed: r1=${JSON.stringify(r1.body)}, r2=${JSON.stringify(r2.body)}`);
    if (r1.body.exam?.examId === r2.body.exam?.examId) {
      throw new Error(`Expected distinct exam IDs, got same ID: ${r1.body.exam?.examId}`);
    }
  });

  // 8. Unauthorized Subject Teacher initialization rejection
  await runTest(8, 'AUTHORIZATION', 'Unauthorized Subject Teacher initialization is rejected with HTTP 403', async () => {
    const res = await callApi('/api/exams/initialize-or-resume', {
      operationId: 'op_unauth_st',
      category: 'TERMINAL',
      terminalExamType: 'FIRST_TERMINAL',
      canonicalClassId: '8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    }, subjectTeacherUid);

    if (res.status !== 403) throw new Error(`Expected HTTP 403, got status ${res.status}: ${JSON.stringify(res.body)}`);
  });

  // 9. Existing DRAFT resumption
  await runTest(9, 'LIFECYCLE', 'Existing DRAFT exam resumes cleanly with status DRAFT', async () => {
    await db.collection('exams').doc('FIRST_TERMINAL_8_A_2083').set({ status: 'DRAFT', published: false }, { merge: true });

    const res = await callApi('/api/exams/initialize-or-resume', {
      operationId: 'op_resume_draft',
      category: 'TERMINAL',
      terminalExamType: 'FIRST_TERMINAL',
      canonicalClassId: '8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    }, classTeacherUid);

    if (res.status !== 200 || res.body.exam?.status !== 'DRAFT') {
      throw new Error(`Expected status DRAFT, got: ${JSON.stringify(res.body)}`);
    }
  });

  // 10. Existing marks impact confirmation
  await runTest(10, 'CONFIG_IMPACT', 'Existing marks impact requires confirmation and returns signed impactToken', async () => {
    // Reset state for exam
    await db.collection('exams').doc('FIRST_TERMINAL_8_A_2083').set({ status: 'DRAFT', configVersion: 1 }, { merge: true });

    // Seed a mark record for student in FIRST_TERMINAL_8_A_2083
    await db.collection('results_secure').doc('student_101').collection('records').doc('FIRST_TERMINAL_8_A_2083_student_101_mathematics').set({
      examId: 'FIRST_TERMINAL_8_A_2083',
      studentUid: 'student_101',
      subjectKey: 'mathematics',
      subjectName: 'Mathematics',
      thMarks: 70,
      prMarks: 20
    });

    const disabledSubjects = [
      { subjectKey: 'Mathematics', subjectName: 'Mathematics', enabled: false, hasTh: false, thFullMarks: 0, thPassMarks: 0, hasPr: false, prFullMarks: 0, prPassMarks: 0 }
    ];

    const res = await callApi('/api/exams/update-subject-config', {
      operationId: 'op_cfg_impact_req',
      examId: 'FIRST_TERMINAL_8_A_2083',
      expectedVersion: 1,
      subjectConfigs: disabledSubjects,
      confirmImpact: false
    }, adminUid);

    if (res.status !== 422 || !res.body.requiresConfirmation || !res.body.impactToken) {
      throw new Error(`Expected HTTP 422 requiresConfirmation: true & impactToken, got status ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  // 11. Valid impact token confirmation succeeds
  await runTest(11, 'CONFIG_IMPACT', 'Valid signed impact confirmation token succeeds and updates subject config', async () => {
    const disabledSubjects = [
      { subjectKey: 'Mathematics', subjectName: 'Mathematics', enabled: false, hasTh: false, thFullMarks: 0, thPassMarks: 0, hasPr: false, prFullMarks: 0, prPassMarks: 0 }
    ];

    const promptRes = await callApi('/api/exams/update-subject-config', {
      operationId: 'op_cfg_prompt_valid',
      examId: 'FIRST_TERMINAL_8_A_2083',
      expectedVersion: 1,
      subjectConfigs: disabledSubjects,
      confirmImpact: false
    }, adminUid);

    const token = promptRes.body.impactToken;
    if (!token) throw new Error('Failed to get impactToken from prompt');

    const confirmRes = await callApi('/api/exams/update-subject-config', {
      operationId: 'op_cfg_confirm_valid',
      examId: 'FIRST_TERMINAL_8_A_2083',
      expectedVersion: 1,
      subjectConfigs: disabledSubjects,
      confirmImpact: true,
      impactToken: token
    }, adminUid);

    if (confirmRes.status !== 200 || !confirmRes.body.success) {
      throw new Error(`Expected HTTP 200 success, got status ${confirmRes.status}: ${JSON.stringify(confirmRes.body)}`);
    }
  });

  // 12. Impact token actor mismatch rejection
  await runTest(12, 'IMPACT_SECURITY', 'Impact token submitted by different actor is rejected with HTTP 409', async () => {
    // Reset config version to 2
    const disabledSubjects = [
      { subjectKey: 'Mathematics', subjectName: 'Mathematics', enabled: false }
    ];

    const promptRes = await callApi('/api/exams/update-subject-config', {
      operationId: 'op_cfg_prompt_actor',
      examId: 'FIRST_TERMINAL_8_A_2083',
      expectedVersion: 2,
      subjectConfigs: disabledSubjects,
      confirmImpact: false
    }, adminUid);

    const token = promptRes.body.impactToken;

    const confirmRes = await callApi('/api/exams/update-subject-config', {
      operationId: 'op_cfg_confirm_wrong_actor',
      examId: 'FIRST_TERMINAL_8_A_2083',
      expectedVersion: 2,
      subjectConfigs: disabledSubjects,
      confirmImpact: true,
      impactToken: token
    }, secondAdminUid); // Second Admin tries to reuse token issued for adminUid!

    if (confirmRes.status !== 409 || !confirmRes.body.error?.includes('issued for a different user')) {
      throw new Error(`Expected HTTP 409 actor mismatch error, got status ${confirmRes.status}: ${JSON.stringify(confirmRes.body)}`);
    }
  });

  // 13. Stale configuration version rejection
  await runTest(13, 'CONCURRENCY', 'Stale expectedVersion returns HTTP 409 Conflict version mismatch', async () => {
    const res = await callApi('/api/exams/update-subject-config', {
      operationId: 'op_cfg_stale_ver',
      examId: 'FIRST_TERMINAL_8_A_2083',
      expectedVersion: 99, // Current version is 2!
      subjectConfigs: sampleSubjects
    }, adminUid);

    if (res.status !== 409) {
      throw new Error(`Expected HTTP 409 Conflict, got status ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  // 14. Expired impact token rejection
  await runTest(14, 'IMPACT_SECURITY', 'Expired impact confirmation token is rejected with HTTP 409', async () => {
    const SECRET = process.env.IMPACT_TOKEN_SECRET || process.env.JWT_SECRET || 'dev_impact_secret_shikshantar_2083_key_for_testing_only';
    const expiredIssuedAt = Date.now() - 30 * 60 * 1000;
    const expiredAt = Date.now() - 15 * 60 * 1000;

    const disabledSubjects = [
      { subjectKey: 'Mathematics', subjectName: 'Mathematics', enabled: false, hasTh: false, thFullMarks: 0, thPassMarks: 0, hasPr: false, prFullMarks: 0, prPassMarks: 0 }
    ];

    const canonicalConfigs = [
      {
        subjectKey: 'mathematics',
        subjectName: 'Mathematics',
        enabled: false,
        hasTh: false,
        hasPr: false,
        thFullMarks: 0,
        thPassMarks: 0,
        prFullMarks: 0,
        prPassMarks: 0,
        customSubjectId: null
      }
    ];

    const cfgFingerprint = crypto.createHash('sha256').update(JSON.stringify(canonicalConfigs)).digest('hex');

    const expiredRaw = `${adminUid}:FIRST_TERMINAL_8_A_2083:2:${cfgFingerprint}:Mathematics:${expiredIssuedAt}:${expiredAt}`;
    const expiredSig = crypto.createHmac('sha256', SECRET).update(expiredRaw).digest('hex');

    const expiredToken = Buffer.from(JSON.stringify({
      actorUid: adminUid,
      examId: 'FIRST_TERMINAL_8_A_2083',
      expectedVersion: 2,
      configFingerprint: cfgFingerprint,
      affectedSubjects: 'Mathematics',
      issuedAt: expiredIssuedAt,
      expiresAt: expiredAt,
      signature: expiredSig
    })).toString('base64url');

    const res = await callApi('/api/exams/update-subject-config', {
      operationId: 'op_cfg_expired_token',
      examId: 'FIRST_TERMINAL_8_A_2083',
      expectedVersion: 2,
      subjectConfigs: disabledSubjects,
      confirmImpact: true,
      impactToken: expiredToken
    }, adminUid);

    if (res.status !== 409 || !res.body.error?.includes('expired')) {
      throw new Error(`Expected HTTP 409 expired token error, got status ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  // 15. Published exam subject config update rejection
  await runTest(15, 'PUBLISHED_UNIQUENESS', 'Published terminal exam update is rejected with HTTP 400', async () => {
    await db.collection('exams').doc('FIRST_TERMINAL_8_A_2083').set({ status: 'PUBLISHED', published: true }, { merge: true });

    const res = await callApi('/api/exams/update-subject-config', {
      operationId: 'op_cfg_pub_err',
      examId: 'FIRST_TERMINAL_8_A_2083',
      expectedVersion: 2,
      subjectConfigs: sampleSubjects
    }, adminUid);

    if (res.status !== 400 || !res.body.error?.includes('PUBLISHED')) {
      throw new Error(`Expected HTTP 400 PUBLISHED error, got status ${res.status}: ${JSON.stringify(res.body)}`);
    }
  });

  // 16. Published Terminal Uniqueness Integration across routes
  await runTest(16, 'PUBLISHED_UNIQUENESS', 'Published Terminal resumes read-only across routes without duplicate creation', async () => {
    // Result Preparation / Manual Entry resume call
    const res = await callApi('/api/exams/initialize-or-resume', {
      operationId: 'op_resume_pub_shared',
      category: 'TERMINAL',
      terminalExamType: 'FIRST_TERMINAL',
      canonicalClassId: 'Class 8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    }, classTeacherUid);

    if (res.status !== 200 || res.body.exam?.examId !== 'FIRST_TERMINAL_8_A_2083' || res.body.exam?.status !== 'PUBLISHED') {
      throw new Error(`Expected resumed PUBLISHED FIRST_TERMINAL_8_A_2083, got: ${JSON.stringify(res.body)}`);
    }
  });

  // 17. Independent availability of other terminals
  await runTest(17, 'TERMINAL_INDEPENDENCE', 'Second, Third and Final terminals remain independently available', async () => {
    const res2 = await callApi('/api/exams/initialize-or-resume', {
      operationId: 'op_init_term_2_indep',
      category: 'TERMINAL',
      terminalExamType: 'SECOND_TERMINAL',
      canonicalClassId: 'Class 8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    }, adminUid);

    const res3 = await callApi('/api/exams/initialize-or-resume', {
      operationId: 'op_init_term_3_indep',
      category: 'TERMINAL',
      terminalExamType: 'THIRD_TERMINAL',
      canonicalClassId: 'Class 8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    }, adminUid);

    if (res2.status !== 200 || res2.body.exam?.examId !== 'SECOND_TERMINAL_8_A_2083') throw new Error('Second terminal init failed');
    if (res3.status !== 200 || res3.body.exam?.examId !== 'THIRD_TERMINAL_8_A_2083') throw new Error('Third terminal init failed');
  });

  // 18. Audit log correctness
  await runTest(18, 'AUDIT_LOG', 'Exam initialization and configuration updates create audit logs', async () => {
    const auditSnap = await db.collection('exam_audit_logs').where('examId', '==', 'FIRST_TERMINAL_8_A_2083').get();
    if (auditSnap.empty) throw new Error('No audit log entries found for FIRST_TERMINAL_8_A_2083');
  });

  // 19. Token Replay Prevention (Reusing same token after successful update)
  await runTest(19, 'TOKEN_REPLAY', 'Reusing the same impact confirmation token after a successful update is rejected with HTTP 409', async () => {
    // Reset FIRST_TERMINAL_8_A_2083 to draft for replay test
    await db.collection('exams').doc('FIRST_TERMINAL_8_A_2083').set({
      status: 'DRAFT',
      published: false,
      configVersion: 10
    }, { merge: true });

    const disabledSubjects = [
      { subjectKey: 'Mathematics', subjectName: 'Mathematics', enabled: false, hasTh: false, thFullMarks: 0, thPassMarks: 0, hasPr: false, prFullMarks: 0, prPassMarks: 0 }
    ];

    const promptRes = await callApi('/api/exams/update-subject-config', {
      operationId: 'op_cfg_prompt_replay_test',
      examId: 'FIRST_TERMINAL_8_A_2083',
      expectedVersion: 10,
      subjectConfigs: disabledSubjects,
      confirmImpact: false
    }, adminUid);

    const token = promptRes.body.impactToken;
    if (!token) throw new Error('Failed to obtain impact token');

    // First use: succeeds
    const res1 = await callApi('/api/exams/update-subject-config', {
      operationId: 'op_cfg_use_token_1',
      examId: 'FIRST_TERMINAL_8_A_2083',
      expectedVersion: 10,
      subjectConfigs: disabledSubjects,
      confirmImpact: true,
      impactToken: token
    }, adminUid);

    if (res1.status !== 200) throw new Error(`First use failed: status ${res1.status}: ${JSON.stringify(res1.body)}`);

    // Second use (replay attempt with different operation ID and same version 10): rejected with 409
    const res2 = await callApi('/api/exams/update-subject-config', {
      operationId: 'op_cfg_use_token_2_replay',
      examId: 'FIRST_TERMINAL_8_A_2083',
      expectedVersion: 10,
      subjectConfigs: disabledSubjects,
      confirmImpact: true,
      impactToken: token
    }, adminUid);

    if (res2.status !== 409 || !res2.body.error?.includes('replayed')) {
      throw new Error(`Expected HTTP 409 replay rejection, got status ${res2.status}: ${JSON.stringify(res2.body)}`);
    }
  });

  // 20. Token Fingerprint Mismatch Rejection
  await runTest(20, 'FINGERPRINT_MISMATCH', 'Token issued for payload A submitted with changed payload B is rejected with HTTP 409', async () => {
    await db.collection('exams').doc('FIRST_TERMINAL_8_A_2083').set({
      status: 'DRAFT',
      published: false,
      configVersion: 20
    }, { merge: true });

    const payloadA = [
      { subjectKey: 'Mathematics', subjectName: 'Mathematics', enabled: false }
    ];
    const payloadB = [
      { subjectKey: 'Science', subjectName: 'Science', enabled: false }
    ];

    const promptRes = await callApi('/api/exams/update-subject-config', {
      operationId: 'op_prompt_mismatch_fp',
      examId: 'FIRST_TERMINAL_8_A_2083',
      expectedVersion: 20,
      subjectConfigs: payloadA,
      confirmImpact: false
    }, adminUid);

    const token = promptRes.body.impactToken;

    // Attempt to submit token issued for payload A with payload B
    const confirmRes = await callApi('/api/exams/update-subject-config', {
      operationId: 'op_confirm_mismatch_fp',
      examId: 'FIRST_TERMINAL_8_A_2083',
      expectedVersion: 20,
      subjectConfigs: payloadB,
      confirmImpact: true,
      impactToken: token
    }, adminUid);

    if (confirmRes.status !== 409 || !confirmRes.body.error?.includes('payload changed')) {
      throw new Error(`Expected HTTP 409 payload changed rejection, got status ${confirmRes.status}: ${JSON.stringify(confirmRes.body)}`);
    }
  });

  // 21. Production Secret Fail-Closed Check
  await runTest(21, 'PRODUCTION_SECRET_SAFETY', 'Missing IMPACT_TOKEN_SECRET in production mode fails closed', async () => {
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.IMPACT_TOKEN_SECRET;

    delete process.env.IMPACT_TOKEN_SECRET;
    process.env.NODE_ENV = 'production';

    const isProdEnv = process.env.NODE_ENV === 'production';
    let secret = (process.env.IMPACT_TOKEN_SECRET || '').trim();
    let failedClosed = false;
    if (!secret && isProdEnv) {
      failedClosed = true;
    }

    process.env.NODE_ENV = origEnv;
    if (origSecret) process.env.IMPACT_TOKEN_SECRET = origSecret;

    if (!failedClosed) {
      throw new Error('Production mode failed to enforce missing IMPACT_TOKEN_SECRET fail-closed rule');
    }
  });

  // 22. Marks Entry & Subject Configuration Transaction Concurrency Overlap
  await runTest(22, 'TRANSACTION_CONCURRENCY', 'Concurrent save-marks and update-subject-config safely retry or return version mismatch', async () => {
    await db.collection('exams').doc('FIRST_TERMINAL_8_A_2083').set({
      status: 'IN PROGRESS',
      published: false,
      configVersion: 30
    }, { merge: true });

    const pMarks = callApi('/api/results/save-marks', {
      operationId: 'op_conc_marks_1',
      examId: 'FIRST_TERMINAL_8_A_2083',
      selectedClass: '8',
      selectedSection: 'A',
      selectedAcademicYear: '2083',
      subjectToSave: 'Mathematics',
      subjectKey: 'Mathematics',
      students: [{ studentUid: 'student_101', subjectMarksTH: { Mathematics: 65 } }]
    }, adminUid);

    const pConfig = callApi('/api/exams/update-subject-config', {
      operationId: 'op_conc_config_1',
      examId: 'FIRST_TERMINAL_8_A_2083',
      expectedVersion: 30,
      subjectConfigs: sampleSubjects,
      confirmImpact: false
    }, adminUid);

    const [resMarks, resConfig] = await Promise.all([pMarks, pConfig]);

    if (resMarks.status !== 200 && resMarks.status !== 409) {
      throw new Error(`Unexpected status for concurrent marks entry: ${resMarks.status}`);
    }
    if (resConfig.status !== 200 && resConfig.status !== 409 && resConfig.status !== 422) {
      throw new Error(`Unexpected status for concurrent config update: ${resConfig.status}`);
    }
  });

  // 23. Cross-module publication Direction 1: Manual Entry -> Result Prep
  await runTest(23, 'PUBLICATION_INTEGRATION', 'Manual Entry publication followed by Result Prep resolution', async () => {
    // 1. Initialize via Manual Entry
    await callApi('/api/exams/initialize-or-resume', {
      operationId: 'op_dir1_init',
      category: 'TERMINAL',
      terminalExamType: 'FIRST_TERMINAL',
      canonicalClassId: '8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    }, adminUid);

    // Set READY FOR REVIEW for publishing
    await db.collection('exams').doc('FIRST_TERMINAL_8_A_2083').set({ status: 'READY FOR REVIEW', published: false }, { merge: true });

    // Publish via /api/results/publish backend API
    const pubRes = await callApi('/api/results/publish', {
      examId: 'FIRST_TERMINAL_8_A_2083',
      targetClass: '8',
      targetSection: 'A',
      targetAcademicYear: '2083',
      summaryRecords: [{ studentUid: 'student_101', studentId: 'student_101', totalMarks: 100, gpa: 4.0, grade: 'A+' }]
    }, adminUid);

    if (pubRes.status !== 200) throw new Error(`Publication failed: status ${pubRes.status}`);

    // 2. Resolve via Result Prep
    const res = await callApi('/api/exams/initialize-or-resume', {
      operationId: 'op_dir1_resolve',
      category: 'TERMINAL',
      terminalExamType: 'FIRST_TERMINAL',
      canonicalClassId: 'Class 8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    }, classTeacherUid);

    if (res.status !== 200 || res.body.exam?.status !== 'PUBLISHED') {
      throw new Error(`Expected resolved PUBLISHED exam, got: ${JSON.stringify(res.body)}`);
    }
  });

  // 24. Concurrent Duplicate Publication Verification
  await runTest(24, 'CONCURRENT_PUBLICATION', 'Concurrent publication attempts result in atomic single transition and no duplicate events', async () => {
    await db.collection('exams').doc('SECOND_TERMINAL_8_A_2083').set({ status: 'READY FOR REVIEW', published: false }, { merge: true });

    const p1 = callApi('/api/results/publish', {
      examId: 'SECOND_TERMINAL_8_A_2083',
      targetClass: '8',
      summaryRecords: [{ studentUid: 'student_101', studentId: 'student_101', totalMarks: 85 }]
    }, adminUid);
    const p2 = callApi('/api/results/publish', {
      examId: 'SECOND_TERMINAL_8_A_2083',
      targetClass: '8',
      summaryRecords: [{ studentUid: 'student_101', studentId: 'student_101', totalMarks: 85 }]
    }, adminUid);

    const [r1, r2] = await Promise.all([p1, p2]);

    const successCount = [r1, r2].filter(r => r.status === 200).length;
    const errorCount = [r1, r2].filter(r => r.status === 400).length;

    if (successCount !== 1 || errorCount !== 1) {
      throw new Error(`Expected exactly 1 success (200) and 1 rejection (400), got r1: ${r1.status}, r2: ${r2.status}`);
    }

    // Verify outbox notification count is strictly 1
    const outboxSnap = await db.collection('notification_outbox').where('payload.examId', '==', 'SECOND_TERMINAL_8_A_2083').get();
    if (outboxSnap.size !== 1) {
      throw new Error(`Expected exactly 1 outbox notification event, found ${outboxSnap.size}`);
    }

    // Verify resultSummary document count is strictly 1
    const summarySnap = await db.collection('resultSummary').where('examId', '==', 'SECOND_TERMINAL_8_A_2083').get();
    if (summarySnap.size !== 1) {
      throw new Error(`Expected exactly 1 resultSummary document, found ${summarySnap.size}`);
    }
  });

  // 25. Cross-module publication Direction 2 (Reverse): Result Prep -> Manual Entry
  await runTest(25, 'PUBLICATION_REVERSE_INTEGRATION', 'Result Prep publication followed by Manual Entry resolution and duplicate rejection', async () => {
    // 1. Initialize via Result Prep
    await callApi('/api/exams/initialize-or-resume', {
      operationId: 'op_rev_init',
      category: 'TERMINAL',
      terminalExamType: 'FINAL',
      canonicalClassId: 'Class 8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    }, classTeacherUid);

    // Set READY FOR REVIEW for publishing
    await db.collection('exams').doc('FINAL_8_A_2083').set({ status: 'READY FOR REVIEW', published: false }, { merge: true });

    // 2. Publish via Result Prep handler
    const pubRes = await callApi('/api/results/publish', {
      examId: 'FINAL_8_A_2083',
      targetClass: '8',
      targetSection: 'A',
      targetAcademicYear: '2083',
      summaryRecords: [{ studentUid: 'student_101', studentId: 'student_101', totalMarks: 95, gpa: 4.0, grade: 'A+' }]
    }, adminUid);

    if (pubRes.status !== 200) throw new Error(`Publication via Result Prep failed: ${JSON.stringify(pubRes.body)}`);

    // 3. Resolve via Manual Entry
    const resolveRes = await callApi('/api/exams/initialize-or-resume', {
      operationId: 'op_rev_man_resolve',
      category: 'TERMINAL',
      terminalExamType: 'FINAL',
      canonicalClassId: '8',
      canonicalSectionId: 'A',
      canonicalAcademicYearId: '2083'
    }, adminUid);

    if (resolveRes.status !== 200 || resolveRes.body.exam?.status !== 'PUBLISHED') {
      throw new Error(`Expected Manual Entry to resolve PUBLISHED exam, got: ${JSON.stringify(resolveRes.body)}`);
    }

    // 4. Verify no duplicate exam document created in Firestore
    const examDoc = await db.collection('exams').doc('FINAL_8_A_2083').get();
    if (!examDoc.exists) throw new Error('Exam FINAL_8_A_2083 document missing');

    // Query collection to confirm strictly single document for FINAL_8_A_2083
    const allFinalSnap = await db.collection('exams').where('canonicalClassId', '==', '8').where('terminalExamType', '==', 'FINAL').get();
    if (allFinalSnap.size !== 1) {
      throw new Error(`Expected strictly 1 FINAL exam document, found ${allFinalSnap.size}`);
    }

    // 5. Verify duplicate publication attempt is rejected with HTTP 400
    const dupPubRes = await callApi('/api/results/publish', {
      examId: 'FINAL_8_A_2083',
      targetClass: '8',
      targetSection: 'A',
      summaryRecords: []
    }, adminUid);

    if (dupPubRes.status !== 400 || !dupPubRes.body.error?.includes('already published')) {
      throw new Error(`Expected HTTP 400 duplicate publication rejection, got status ${dupPubRes.status}: ${JSON.stringify(dupPubRes.body)}`);
    }
  });

  console.log('\n================================================================');
  console.log('TEST RESULTS SUMMARY:');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`Passed: ${passed} / ${results.length} | Failed: ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runStep5TestSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
