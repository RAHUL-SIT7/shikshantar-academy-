/**
 * Isolated Local Firebase Emulator E2E, Unit, Security & Firestore Rules Verification Suite
 * Runs ONLY against local Firebase Auth (9098) & Firestore (8085) Emulators.
 * NEVER touches production Firebase!
 */
process.env.USE_FIREBASE_EMULATOR = 'true';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9098';
process.env.SKIP_SERVER_START = 'true';

import assert from 'node:assert/strict';
import http from 'node:http';
import admin from 'firebase-admin';
import {
  validateMarkValue,
  calculateSubjectResult,
  calculateAggregateResult,
  getNepalGradePoint,
  getNepalGradeFromGpa
} from '../src/lib/nepalGradingEngine';
import { createApp, getAdminDb } from '../server';

const PROJECT_ID = 'project-4b410c97-a152-49e7-940';
const AUTH_EMU_URL = 'http://127.0.0.1:9098';
const FIRESTORE_EMU_URL = 'http://127.0.0.1:8085';

interface TestResult {
  group: string;
  name: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];

async function testCase(group: string, name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ group, name, passed: true });
    console.log(`  [PASS] (${group}) ${name}`);
  } catch (err: any) {
    results.push({ group, name, passed: false, detail: err?.message || String(err) });
    console.error(`  [FAIL] (${group}) ${name} -> ${err?.message || err}`);
  }
}

async function clearEmulators() {
  await fetch(`${FIRESTORE_EMU_URL}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: 'DELETE'
  });
  await fetch(`${AUTH_EMU_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE'
  });
}

async function createAuthUserAndToken(uid: string, email: string, displayName: string): Promise<string> {
  await admin.auth().createUser({
    uid,
    email,
    emailVerified: true,
    password: 'TestPassword123!',
    displayName
  });
  const customToken = await admin.auth().createCustomToken(uid);
  const resp = await fetch(
    `${AUTH_EMU_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-emulator-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    }
  );
  const data: any = await resp.json();
  if (!resp.ok || !data.idToken) {
    throw new Error(`Failed to mint Emulator ID token for ${uid}: ${JSON.stringify(data)}`);
  }
  return data.idToken;
}

async function apiCall(baseUrl: string, path: string, token: string | null, body: any) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const text = await resp.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: resp.status, ok: resp.ok, body: json };
}

async function firestoreRestGet(docPath: string, idToken: string) {
  const url = `${FIRESTORE_EMU_URL}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${idToken}` }
  });
  return resp.status;
}

async function firestoreRestPatch(docPath: string, idToken: string, fields: Record<string, any>) {
  const url = `${FIRESTORE_EMU_URL}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });
  return resp.status;
}

async function main() {
  console.log('\n==============================================================');
  console.log('SHIKSHANTAR ACADEMY RESULT SYSTEM — LOCAL EMULATOR VERIFICATION');
  console.log('==============================================================\n');

  // Verify emulators are reachable
  const emuCheck = await fetch(`${FIRESTORE_EMU_URL}/`).catch(() => null);
  if (!emuCheck) {
    throw new Error('Local Firestore Emulator (127.0.0.1:8085) is not running!');
  }

  // =========================================================================
  // PART A: CANONICAL NEPAL CDC / NEB GRADING ENGINE UNIT MATRIX
  // =========================================================================
  console.log('--- PART A: Canonical Nepal CDC / NEB Grading Engine ---');

  await testCase('GRADING', 'Distinguishes valid 0, valid numeric, AB, missing (null/""), NOT_APPLICABLE, negative, >full, invalid string', () => {
    assert.equal(validateMarkValue(0, 75).kind, 'NUMBER');
    assert.equal(validateMarkValue(0, 75).value, 0);
    assert.equal(validateMarkValue(75, 75).kind, 'NUMBER');
    assert.equal(validateMarkValue('AB', 75).kind, 'AB');
    assert.equal(validateMarkValue('ab', 75).kind, 'AB');
    assert.equal(validateMarkValue('', 75).kind, 'MISSING');
    assert.equal(validateMarkValue(null, 75).kind, 'MISSING');
    assert.equal(validateMarkValue(undefined, 75).kind, 'MISSING');
    assert.equal(validateMarkValue(null, 0).kind, 'NOT_APPLICABLE');
    assert.equal(validateMarkValue(-1, 75).kind, 'INVALID');
    assert.equal(validateMarkValue(76, 75).kind, 'INVALID');
    assert.equal(validateMarkValue('xyz', 75).kind, 'INVALID');
  });

  await testCase('GRADING', 'Enforces 35% independent component pass on Theory (75) and Practical (25)', () => {
    const cfg = { hasTh: true, hasPr: true, thFullMarks: 75, prFullMarks: 25 };
    // Exact 35% boundary: 26.25 / 75 (35%) and 8.75 / 25 (35%) -> PASS (D / 1.6)
    const passBoundary = calculateSubjectResult(
      'Math',
      'Mathematics',
      { theoryMarks: 26.25, practicalMarks: 8.75 },
      { ...cfg, thPassMarks: 26.25, prPassMarks: 8.75 }
    );
    assert.equal(passBoundary.isNg, false);
    assert.equal(passBoundary.subjectGrade, 'D');
    assert.equal(passBoundary.subjectGradePoint, 1.6);

    // Theory fails (<35% -> 26/75 = 34.67%) even with full PR (25/25) -> NG!
    const thFail = calculateSubjectResult('Math', 'Mathematics', { theoryMarks: 26, practicalMarks: 25 }, cfg);
    assert.equal(thFail.isNg, true);
    assert.equal(thFail.subjectGrade, 'NG');
    assert.equal(thFail.subjectGradePoint, 0);

    // Practical fails (<35% -> 8/25 = 32%) even with full TH (75/75) -> NG!
    const prFail = calculateSubjectResult('Math', 'Mathematics', { theoryMarks: 75, practicalMarks: 8 }, cfg);
    assert.equal(prFail.isNg, true);
    assert.equal(prFail.subjectGrade, 'NG');
    assert.equal(prFail.subjectGradePoint, 0);
  });

  await testCase('GRADING', 'Treats numeric 0 as valid score (NG, not missing) and AB as Absent (NG, not missing)', () => {
    const cfg = { hasTh: true, hasPr: true, thFullMarks: 75, prFullMarks: 25 };
    const zeroRes = calculateSubjectResult('Math', 'Mathematics', { theoryMarks: 0, practicalMarks: 20 }, cfg);
    assert.equal(zeroRes.isIncomplete, false);
    assert.equal(zeroRes.isNg, true);
    assert.equal(zeroRes.subjectGrade, 'NG');

    const abRes = calculateSubjectResult('Math', 'Mathematics', { theoryMarks: 'AB', practicalMarks: 20, isAbsentTheory: true }, cfg);
    assert.equal(abRes.isIncomplete, false);
    assert.equal(abRes.isNg, true);
    assert.equal(abRes.subjectGrade, 'NG');
  });

  await testCase('GRADING', 'Treats missing marks as INCOMPLETE (never silently 0)', () => {
    const cfg = { hasTh: true, hasPr: true, thFullMarks: 75, prFullMarks: 25 };
    const inc = calculateSubjectResult('Math', 'Mathematics', { theoryMarks: null, practicalMarks: 20 }, cfg);
    assert.equal(inc.isIncomplete, true);
    assert.equal(inc.subjectGrade, 'INC');
  });

  await testCase('GRADING', 'Unconfigured PR (hasPr: false, prFullMarks: 0) grades purely on Theory', () => {
    const cfg = { hasTh: true, hasPr: false, thFullMarks: 100, prFullMarks: 0 };
    const res = calculateSubjectResult('Nepali', 'Nepali', { theoryMarks: 92, practicalMarks: null }, cfg);
    assert.equal(res.isIncomplete, false);
    assert.equal(res.isNg, false);
    assert.equal(res.subjectGrade, 'A+');
    assert.equal(res.subjectGradePoint, 4.0);
  });

  await testCase('GRADING', 'Aggregate enforces Strict NG (overallGpa: null, display "-", grade "NG") & unweighted passing GPA', () => {
    const cfg = { hasTh: true, hasPr: true, thFullMarks: 75, prFullMarks: 25 };
    const s1 = calculateSubjectResult('Math', 'Mathematics', { theoryMarks: 70, practicalMarks: 24 }, cfg); // 94% -> A+ (4.0)
    const s2 = calculateSubjectResult('Sci', 'Science', { theoryMarks: 60, practicalMarks: 22 }, cfg); // 82% -> A (3.6)
    const aggPass = calculateAggregateResult('10', [s1, s2]);
    assert.equal(aggPass.overallStatus, 'PASSED');
    assert.equal(aggPass.overallGpa, 3.8);
    assert.equal(aggPass.gpaDisplayText, '3.80');
    assert.equal(aggPass.overallGrade, 'A+');

    const s3Ab = calculateSubjectResult('Eng', 'English', { theoryMarks: 'AB', practicalMarks: 20, isAbsentTheory: true }, cfg);
    const aggNg = calculateAggregateResult('10', [s1, s2, s3Ab]);
    assert.equal(aggNg.overallStatus, 'NG');
    assert.equal(aggNg.overallGpa, null);
    assert.equal(aggNg.gpaDisplayText, '-');
    assert.equal(aggNg.overallGrade, 'NG');

    assert.equal(getNepalGradePoint(34.9).gradePoint, 0.0);
    assert.equal(getNepalGradePoint(35.0).gradePoint, 1.6);
    assert.equal(getNepalGradeFromGpa(3.61), 'A+');
  });

  // =========================================================================
  // SETUP REAL SERVER + LOCAL EMULATORS
  // =========================================================================
  await clearEmulators();
  const db = getAdminDb();

  const app = await createApp({ skipVite: true, skipOutboxWorker: true });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address: any = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  // Create real Auth Emulator users & mint real JWT ID tokens
  const adminToken = await createAuthUserAndToken('uid_admin', 'admin@shikshantar.edu.np', 'Principal Admin');
  const classTeacherToken = await createAuthUserAndToken('uid_ct', 'ct@shikshantar.edu.np', 'Class Teacher 10A');
  const subjTeacherToken = await createAuthUserAndToken('uid_st', 'st@shikshantar.edu.np', 'Math Teacher');
  const student1Token = await createAuthUserAndToken('uid_stu1', 'student1@shikshantar.edu.np', 'Aarav Sharma');
  const student2Token = await createAuthUserAndToken('uid_stu2', 'student2@shikshantar.edu.np', 'Sita Yadav');

  // Seed Firestore Emulator user docs, enrollments, and template settings
  await db.collection('users').doc('uid_admin').set({
    uid: 'uid_admin', email: 'admin@shikshantar.edu.np', name: 'Principal Admin', fullName: 'Principal Admin',
    role: 'admin', adminTier: 'primary', active: true, status: 'active'
  });
  await db.collection('users').doc('uid_ct').set({
    uid: 'uid_ct', email: 'ct@shikshantar.edu.np', name: 'Class Teacher 10A', fullName: 'Class Teacher 10A',
    role: 'teacher', active: true, status: 'active',
    primaryClassTeacher: '10', primaryClassTeacherSection: 'A', primaryClassTeacherYear: '2083',
    assignmentKeys: []
  });
  await db.collection('users').doc('uid_st').set({
    uid: 'uid_st', email: 'st@shikshantar.edu.np', name: 'Math Teacher', fullName: 'Math Teacher',
    role: 'teacher', active: true, status: 'active',
    assignmentKeys: ['10_Mathematics_A_2083']
  });
  await db.collection('users').doc('uid_stu1').set({
    uid: 'uid_stu1', email: 'student1@shikshantar.edu.np', name: 'Aarav Sharma', fullName: 'Aarav Sharma',
    role: 'student', active: true, status: 'active', class: '10', section: 'A', academicYear: '2083', rollNo: 1
  });
  await db.collection('users').doc('uid_stu2').set({
    uid: 'uid_stu2', email: 'student2@shikshantar.edu.np', name: 'Sita Yadav', fullName: 'Sita Yadav',
    role: 'student', active: true, status: 'active', class: '10', section: 'A', academicYear: '2083', rollNo: 2
  });

  await db.collection('students').doc('uid_stu1').set({
    id: 'uid_stu1', uid: 'uid_stu1', name: 'Aarav Sharma', class: '10', section: 'A',
    academicYear: '2083', academicYearId: '2083', rollNo: 1, status: 'active', active: true,
    guardianEmail: 'parent1@example.com'
  });
  await db.collection('students').doc('uid_stu2').set({
    id: 'uid_stu2', uid: 'uid_stu2', name: 'Sita Yadav', class: '10', section: 'A',
    academicYear: '2083', academicYearId: '2083', rollNo: 2, status: 'active', active: true,
    guardianEmail: 'parent2@example.com'
  });

  await db.collection('student_enrollments').doc('2083_uid_stu1').set({
    studentId: 'uid_stu1', studentUid: 'uid_stu1', studentName: 'Aarav Sharma',
    class: '10', section: 'A', academicYear: '2083', academicYearId: '2083', bsYear: 2083,
    rollNo: 1, status: 'ACTIVE'
  });
  await db.collection('student_enrollments').doc('2083_uid_stu2').set({
    studentId: 'uid_stu2', studentUid: 'uid_stu2', studentName: 'Sita Yadav',
    class: '10', section: 'A', academicYear: '2083', academicYearId: '2083', bsYear: 2083,
    rollNo: 2, status: 'ACTIVE'
  });

  await db.collection('settings').doc('result_template').set({
    schoolName: 'SHIKSHANTAR ACADEMY',
    schoolMotto: 'A School for Inspiring Minds',
    schoolAddress: 'Bastipur, Karjanha-05, Siraha, Madhesh, Nepal'
  });

  // Helper to build save-marks student row in server's exact schema
  const makeRow = (
    uid: string,
    name: string,
    rollNo: number,
    subj: string,
    th: number | 'AB' | null,
    pr: number | 'AB' | null,
    expectedVersion: number
  ) => ({
    studentUid: uid,
    studentId: uid,
    studentName: name,
    rollNo: String(rollNo),
    expectedVersion,
    subjectMarksTH: { [subj]: th === 'AB' ? '' : (th === null ? '' : String(th)) },
    subjectMarksPR: { [subj]: pr === 'AB' ? '' : (pr === null ? '' : String(pr)) },
    subjectAbsentsTH: { [subj]: th === 'AB' },
    subjectAbsentsPR: { [subj]: pr === 'AB' }
  });

  // =========================================================================
  // PART B: WORKFLOW A — STANDALONE DIRECT MANUAL ENTRY E2E
  // =========================================================================
  console.log('\n--- PART B: Workflow A (Standalone Direct Manual Entry E2E) ---');

  const standaloneExamId = 'FIRST_TERMINAL_10_A_2083';
  let stu1Version = 0;
  let stu2Version = 0;

  await testCase('WORKFLOW_A', 'First-time Standalone draft save auto-creates exam (read-before-write transaction fix) & persists null missing cell', async () => {
    const res = await apiCall(baseUrl, '/api/results/save-marks', classTeacherToken, {
      operationId: 'op_sa_1',
      examId: standaloneExamId,
      selectedAcademicYear: '2083',
      selectedClass: '10',
      selectedSection: 'A',
      subjectToSave: 'Mathematics',
      subjectKey: 'Mathematics',
      workflowMode: 'STANDALONE',
      totalEligibleCount: 2,
      students: [
        makeRow('uid_stu1', 'Aarav Sharma', 1, 'Mathematics', 65, 22, 0),
        makeRow('uid_stu2', 'Sita Yadav', 2, 'Mathematics', null, 20, 0)
      ]
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.subjectWorkflowStatus, 'PARTIALLY_FILLED');
    stu1Version = res.body.updatedVersions['uid_stu1'];
    stu2Version = res.body.updatedVersions['uid_stu2'];
    assert.equal(stu1Version, 1);
    assert.equal(stu2Version, 1);

    const examSnap = await db.collection('exams').doc(standaloneExamId).get();
    assert.equal(examSnap.exists, true);
    assert.equal(examSnap.data()?.workflowMode, 'STANDALONE');
    assert.equal(examSnap.data()?.published, false);

    const r2Snap = await db.collection('results').doc(`${standaloneExamId}_uid_stu2_Mathematics`).get();
    assert.equal(r2Snap.exists, true);
    assert.equal(r2Snap.data()?.thMarks, null, 'Missing cell MUST remain null, never auto-converted to 0');
    assert.equal(r2Snap.data()?.subjectGrade, 'INC');
  });

  await testCase('WORKFLOW_A', 'Submit subject blocked when any eligible student has missing marks', async () => {
    const res = await apiCall(baseUrl, '/api/results/submit-subject', classTeacherToken, {
      examId: standaloneExamId,
      subject: 'Mathematics',
      subjectKey: 'Mathematics',
      selectedClass: '10',
      selectedSection: 'A',
      selectedAcademicYear: '2083',
      eligibleStudentUids: ['uid_stu1', 'uid_stu2']
    });
    assert.equal(res.status, 400, `Expected 400 for incomplete marks, got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  await testCase('WORKFLOW_A', 'Sequential save succeeds without false 409 conflict & updates Sita to AB', async () => {
    const res = await apiCall(baseUrl, '/api/results/save-marks', classTeacherToken, {
      operationId: 'op_sa_2',
      examId: standaloneExamId,
      selectedAcademicYear: '2083',
      selectedClass: '10',
      selectedSection: 'A',
      subjectToSave: 'Mathematics',
      subjectKey: 'Mathematics',
      workflowMode: 'STANDALONE',
      totalEligibleCount: 2,
      correctionReason: 'Updated Aarav and marked Sita AB in Theory',
      students: [
        makeRow('uid_stu1', 'Aarav Sharma', 1, 'Mathematics', 68, 22, stu1Version),
        makeRow('uid_stu2', 'Sita Yadav', 2, 'Mathematics', 'AB', 20, stu2Version)
      ]
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.subjectWorkflowStatus, 'MARKS_COMPLETE');
    stu1Version = res.body.updatedVersions['uid_stu1'];
    stu2Version = res.body.updatedVersions['uid_stu2'];
    assert.equal(stu1Version, 2);
  });

  await testCase('WORKFLOW_A', 'Genuine 409 conflict rejected; Force Overwrite requires confirmation + reason >= 5 chars + audit log', async () => {
    const conflictRes = await apiCall(baseUrl, '/api/results/save-marks', classTeacherToken, {
      operationId: 'op_sa_conflict',
      examId: standaloneExamId,
      selectedAcademicYear: '2083',
      selectedClass: '10',
      selectedSection: 'A',
      subjectToSave: 'Mathematics',
      subjectKey: 'Mathematics',
      workflowMode: 'STANDALONE',
      totalEligibleCount: 2,
      correctionReason: 'Stale write attempt',
      students: [makeRow('uid_stu1', 'Aarav Sharma', 1, 'Mathematics', 70, 22, 0)]
    });
    assert.equal(conflictRes.status, 409);

    const badForceRes = await apiCall(baseUrl, '/api/results/save-marks', classTeacherToken, {
      operationId: 'op_sa_bad_force',
      examId: standaloneExamId,
      selectedAcademicYear: '2083',
      selectedClass: '10',
      selectedSection: 'A',
      subjectToSave: 'Mathematics',
      subjectKey: 'Mathematics',
      workflowMode: 'STANDALONE',
      totalEligibleCount: 2,
      forceOverwrite: true,
      forceOverwriteConfirmed: false,
      correctionReason: 'ok',
      students: [makeRow('uid_stu1', 'Aarav Sharma', 1, 'Mathematics', 70, 22, 0)]
    });
    assert.equal(badForceRes.status, 400);

    const goodForceRes = await apiCall(baseUrl, '/api/results/save-marks', classTeacherToken, {
      operationId: 'op_sa_good_force',
      examId: standaloneExamId,
      selectedAcademicYear: '2083',
      selectedClass: '10',
      selectedSection: 'A',
      subjectToSave: 'Mathematics',
      subjectKey: 'Mathematics',
      workflowMode: 'STANDALONE',
      totalEligibleCount: 2,
      forceOverwrite: true,
      forceOverwriteConfirmed: true,
      correctionReason: 'Re-checked answer sheet mark total',
      students: [makeRow('uid_stu1', 'Aarav Sharma', 1, 'Mathematics', 70, 22, 0)]
    });
    assert.equal(goodForceRes.status, 200, `Expected 200, got ${goodForceRes.status}: ${JSON.stringify(goodForceRes.body)}`);
    stu1Version = goodForceRes.body.updatedVersions['uid_stu1'];

    const auditSnap = await db.collection('audit_logs').where('actionType', '==', 'FORCE_OVERWRITE').get();
    assert.ok(auditSnap.size >= 1, 'Expected FORCE_OVERWRITE audit log');
  });

  await testCase('WORKFLOW_A', 'Explicit Submit -> Exam becomes READY_FOR_REVIEW; Publish blocked before Admin Approval', async () => {
    const subRes = await apiCall(baseUrl, '/api/results/submit-subject', classTeacherToken, {
      examId: standaloneExamId,
      subject: 'Mathematics',
      subjectKey: 'Mathematics',
      selectedClass: '10',
      selectedSection: 'A',
      selectedAcademicYear: '2083',
      eligibleStudentUids: ['uid_stu1', 'uid_stu2'],
      expectedSubjects: ['Mathematics']
    });
    assert.equal(subRes.status, 200, `Expected 200, got ${subRes.status}: ${JSON.stringify(subRes.body)}`);
    assert.equal(subRes.body.examStatus, 'READY_FOR_REVIEW');

    const earlyPub = await apiCall(baseUrl, '/api/results/publish', adminToken, {
      examId: standaloneExamId,
      targetClass: '10',
      targetSection: 'A',
      targetAcademicYear: '2083',
      summaryRecords: [{ studentUid: 'uid_stu1', studentName: 'Aarav Sharma', rollNo: 1 }]
    });
    assert.equal(earlyPub.status, 400, `Expected 400 before approval, got ${earlyPub.status}`);
  });

  await testCase('WORKFLOW_A', 'Admin Approve Exam -> APPROVED (still unpublished); Class Teacher blocked from Approve & Publish', async () => {
    const ctApprove = await apiCall(baseUrl, '/api/results/approve-exam', classTeacherToken, { examId: standaloneExamId });
    assert.equal(ctApprove.status, 403);

    const adminApprove = await apiCall(baseUrl, '/api/results/approve-exam', adminToken, {
      examId: standaloneExamId,
      expectedSubjects: ['Mathematics']
    });
    assert.equal(adminApprove.status, 200, `Expected 200, got ${adminApprove.status}: ${JSON.stringify(adminApprove.body)}`);
    assert.equal(adminApprove.body.status, 'APPROVED');

    const examSnap = await db.collection('exams').doc(standaloneExamId).get();
    assert.equal(examSnap.data()?.published, false, 'Approving MUST NOT publish');

    const ctPublish = await apiCall(baseUrl, '/api/results/publish', classTeacherToken, {
      examId: standaloneExamId,
      targetClass: '10',
      targetSection: 'A',
      targetAcademicYear: '2083',
      summaryRecords: [{ studentUid: 'uid_stu1', studentName: 'Aarav Sharma', rollNo: 1 }]
    });
    assert.equal(ctPublish.status, 403, 'Publication MUST be Admin-only');
  });

  await testCase('WORKFLOW_A', 'Admin Publish recalculates Nepal CDC grades on server (ignoring tampered client payload), sets rank:null & publishes results_secure', async () => {
    const pubRes = await apiCall(baseUrl, '/api/results/publish', adminToken, {
      examId: standaloneExamId,
      targetClass: '10',
      targetSection: 'A',
      targetAcademicYear: '2083',
      summaryRecords: [
        { studentUid: 'uid_stu1', studentName: 'Aarav Sharma', rollNo: 1, gpa: 0.0, rank: 99, grade: 'NG' },
        { studentUid: 'uid_stu2', studentName: 'Sita Yadav', rollNo: 2, gpa: 4.0, rank: 1, grade: 'A+' }
      ]
    });
    assert.equal(pubRes.status, 200, `Expected 200, got ${pubRes.status}: ${JSON.stringify(pubRes.body)}`);

    const stu1Sum = (await db.collection('resultSummary').doc(`${standaloneExamId}_uid_stu1`).get()).data()!;
    assert.equal(stu1Sum.published, true);
    assert.equal(stu1Sum.grade, 'A+', 'Server must recalculate Aarav (70+22=92%) -> A+');
    assert.equal(stu1Sum.gpa, 4.0);
    assert.equal(stu1Sum.rank, null, 'No new ranks generated');
    assert.equal(stu1Sum.isHistoricalSnapshot, false);
    assert.equal(stu1Sum.templateSnapshot?.schoolMotto, 'A School for Inspiring Minds');

    const stu2Sum = (await db.collection('resultSummary').doc(`${standaloneExamId}_uid_stu2`).get()).data()!;
    assert.equal(stu2Sum.published, true);
    assert.equal(stu2Sum.grade, 'NG', 'Server must enforce Strict NG for AB student despite client tampering');
    assert.equal(stu2Sum.gpa, null);
    assert.equal(stu2Sum.gpaDisplayText, '-');
    assert.equal(stu2Sum.rank, null);

    const secRec1 = (await db.collection('results_secure').doc('uid_stu1').collection('records').doc(`${standaloneExamId}_uid_stu1_Mathematics`).get()).data()!;
    assert.equal(secRec1.published, true, 'results_secure record MUST be marked published: true');

    const dupPub = await apiCall(baseUrl, '/api/results/publish', adminToken, {
      examId: standaloneExamId,
      targetClass: '10',
      targetSection: 'A',
      targetAcademicYear: '2083',
      summaryRecords: [{ studentUid: 'uid_stu1', studentName: 'Aarav Sharma', rollNo: 1 }]
    });
    assert.equal(dupPub.status, 409);
  });

  // =========================================================================
  // PART D1: REAL FIRESTORE SECURITY RULES CHECK ON PUBLISHED DATA
  // =========================================================================
  console.log('\n--- PART D1: Firestore Security Rules (Published State) ---');

  await testCase('RULES', 'Student 1 CAN read own published resultSummary & results_secure; DENIED Student 2 records', async () => {
    const ownSummaryStatus = await firestoreRestGet(`resultSummary/${standaloneExamId}_uid_stu1`, student1Token);
    assert.equal(ownSummaryStatus, 200, `Student 1 should read own published summary (got ${ownSummaryStatus})`);

    const ownSecureStatus = await firestoreRestGet(
      `results_secure/uid_stu1/records/${standaloneExamId}_uid_stu1_Mathematics`,
      student1Token
    );
    assert.equal(ownSecureStatus, 200, `Student 1 should read own published results_secure (got ${ownSecureStatus})`);

    const peerSummaryStatus = await firestoreRestGet(`resultSummary/${standaloneExamId}_uid_stu2`, student1Token);
    assert.equal(peerSummaryStatus, 403, `Student 1 MUST be denied Student 2 summary (got ${peerSummaryStatus})`);

    const peerSecureStatus = await firestoreRestGet(
      `results_secure/uid_stu2/records/${standaloneExamId}_uid_stu2_Mathematics`,
      student1Token
    );
    assert.equal(peerSecureStatus, 403, `Student 1 MUST be denied Student 2 results_secure (got ${peerSecureStatus})`);
  });

  await testCase('RULES', 'Published records are immutable to teachers & students via direct Firestore client writes', async () => {
    const stuWrite = await firestoreRestPatch(`resultSummary/${standaloneExamId}_uid_stu1`, student1Token, {
      gpa: { doubleValue: 4.0 }
    });
    assert.equal(stuWrite, 403);

    const teacherMutate = await firestoreRestPatch(`results/${standaloneExamId}_uid_stu1_Mathematics`, classTeacherToken, {
      thMarks: { integerValue: '75' }
    });
    assert.equal(teacherMutate, 403);
  });

  // Now test Admin Unpublish!
  await testCase('WORKFLOW_A', 'Admin Unpublish requires reason >= 10 chars, reverts published:false everywhere & hides records from Student 1', async () => {
    const ctUnpub = await apiCall(baseUrl, '/api/results/unpublish', classTeacherToken, {
      examId: standaloneExamId,
      reason: 'Teacher trying to unpublish'
    });
    assert.equal(ctUnpub.status, 403);

    const shortReason = await apiCall(baseUrl, '/api/results/unpublish', adminToken, {
      examId: standaloneExamId,
      reason: 'short'
    });
    assert.equal(shortReason.status, 400);

    const unpubRes = await apiCall(baseUrl, '/api/results/unpublish', adminToken, {
      examId: standaloneExamId,
      reason: 'Re-totalling requested by exam committee'
    });
    assert.equal(unpubRes.status, 200, `Expected 200, got ${unpubRes.status}: ${JSON.stringify(unpubRes.body)}`);

    const examSnap = (await db.collection('exams').doc(standaloneExamId).get()).data()!;
    assert.equal(examSnap.published, false);
    assert.equal(examSnap.status, 'DRAFT');

    const secRec1 = (await db.collection('results_secure').doc('uid_stu1').collection('records').doc(`${standaloneExamId}_uid_stu1_Mathematics`).get()).data()!;
    assert.equal(secRec1.published, false);

    const stu1HiddenSum = await firestoreRestGet(`resultSummary/${standaloneExamId}_uid_stu1`, student1Token);
    assert.equal(stu1HiddenSum, 403, `Unpublished summary must be hidden from student (got ${stu1HiddenSum})`);

    const stu1HiddenSec = await firestoreRestGet(
      `results_secure/uid_stu1/records/${standaloneExamId}_uid_stu1_Mathematics`,
      student1Token
    );
    assert.equal(stu1HiddenSec, 403, `Unpublished results_secure must be hidden from student (got ${stu1HiddenSec})`);

    const unpubAudit = await db.collection('audit_logs').where('action', '==', 'EXAM_UNPUBLISHED').get();
    assert.ok(unpubAudit.size >= 1);
  });

  // =========================================================================
  // PART C: WORKFLOW B — CONNECTED EXAMINATION MANAGEMENT E2E
  // =========================================================================
  console.log('\n--- PART C: Workflow B (Connected Examination Management E2E) ---');

  await testCase('WORKFLOW_B', 'Cross-mode collision blocked: Connected init on existing Standalone exam returns 409', async () => {
    const res = await apiCall(baseUrl, '/api/exams/initialize-or-resume', adminToken, {
      operationId: 'op_init_cross_1',
      category: 'TERMINAL',
      terminalExamType: 'FIRST_TERMINAL',
      canonicalAcademicYearId: '2083',
      canonicalClassId: '10',
      canonicalSectionId: 'A',
      subjectConfigs: [
        { subjectKey: 'Mathematics', subjectName: 'Mathematics', enabled: true, hasTh: true, hasPr: true, thFullMarks: 75, prFullMarks: 25, thPassMarks: 27, prPassMarks: 9 }
      ]
    });
    assert.equal(res.status, 409, `Expected 409 cross-mode collision, got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  const connectedExamId = 'SECOND_TERMINAL_10_A_2083';

  await testCase('WORKFLOW_B', 'Admin initializes Connected exam; Standalone save against Connected exam returns 409', async () => {
    const initRes = await apiCall(baseUrl, '/api/exams/initialize-or-resume', adminToken, {
      operationId: 'op_init_conn_1',
      category: 'TERMINAL',
      terminalExamType: 'SECOND_TERMINAL',
      canonicalAcademicYearId: '2083',
      canonicalClassId: '10',
      canonicalSectionId: 'A',
      subjectConfigs: [
        { subjectKey: 'Mathematics', subjectName: 'Mathematics', enabled: true, hasTh: true, hasPr: true, thFullMarks: 75, prFullMarks: 25, thPassMarks: 27, prPassMarks: 9 }
      ]
    });
    assert.equal(initRes.status, 200, `Expected 200, got ${initRes.status}: ${JSON.stringify(initRes.body)}`);
    assert.equal(initRes.body.exam.workflowMode, 'CONNECTED');
    assert.equal(initRes.body.exam.id, connectedExamId);

    const crossSave = await apiCall(baseUrl, '/api/results/save-marks', adminToken, {
      operationId: 'op_cross_save_2',
      examId: connectedExamId,
      selectedAcademicYear: '2083',
      selectedClass: '10',
      selectedSection: 'A',
      subjectToSave: 'Mathematics',
      subjectKey: 'Mathematics',
      workflowMode: 'STANDALONE',
      students: [makeRow('uid_stu1', 'Aarav Sharma', 1, 'Mathematics', 50, 20, 0)]
    });
    assert.equal(crossSave.status, 409, `Expected 409 for Standalone write on Connected exam, got ${crossSave.status}`);
  });

  await testCase('WORKFLOW_B', 'Subject Teacher scoped save (Mathematics allowed, Science denied), explicit Submit -> Correction Request -> Resubmit -> Admin Approve Subject -> Admin Approve Exam -> Admin Publish', async () => {
    const badSubj = await apiCall(baseUrl, '/api/results/save-marks', subjTeacherToken, {
      operationId: 'op_st_bad_subj',
      examId: connectedExamId,
      selectedAcademicYear: '2083',
      selectedClass: '10',
      selectedSection: 'A',
      subjectToSave: 'Science',
      subjectKey: 'Science',
      workflowMode: 'CONNECTED',
      totalEligibleCount: 2,
      students: [makeRow('uid_stu1', 'Aarav Sharma', 1, 'Science', 50, 20, 0)]
    });
    assert.equal(badSubj.status, 403, `Subject teacher must not write unassigned subject (got ${badSubj.status})`);

    const stSave = await apiCall(baseUrl, '/api/results/save-marks', subjTeacherToken, {
      operationId: 'op_st_save_1',
      examId: connectedExamId,
      selectedAcademicYear: '2083',
      selectedClass: '10',
      selectedSection: 'A',
      subjectToSave: 'Mathematics',
      subjectKey: 'Mathematics',
      workflowMode: 'CONNECTED',
      totalEligibleCount: 2,
      students: [
        makeRow('uid_stu1', 'Aarav Sharma', 1, 'Mathematics', 60, 20, 0),
        makeRow('uid_stu2', 'Sita Yadav', 2, 'Mathematics', 0, 15, 0)
      ]
    });
    assert.equal(stSave.status, 200, `Expected 200, got ${stSave.status}: ${JSON.stringify(stSave.body)}`);
    assert.equal(stSave.body.subjectWorkflowStatus, 'MARKS_COMPLETE');
    const v1 = stSave.body.updatedVersions['uid_stu1'];
    const v2 = stSave.body.updatedVersions['uid_stu2'];

    const stSub = await apiCall(baseUrl, '/api/results/submit-subject', subjTeacherToken, {
      examId: connectedExamId,
      subject: 'Mathematics',
      subjectKey: 'Mathematics',
      selectedClass: '10',
      selectedSection: 'A',
      selectedAcademicYear: '2083',
      eligibleStudentUids: ['uid_stu1', 'uid_stu2']
    });
    assert.equal(stSub.status, 200, `Expected 200, got ${stSub.status}: ${JSON.stringify(stSub.body)}`);
    assert.equal(stSub.body.subjectStatus, 'SUBMITTED');
    assert.equal(stSub.body.examStatus, 'READY_FOR_REVIEW');

    const corrReq = await apiCall(baseUrl, '/api/results/review-subject', adminToken, {
      examId: connectedExamId,
      subject: 'Mathematics',
      action: 'REQUEST_CORRECTION',
      note: 'Verify Sita theory score zero'
    });
    assert.equal(corrReq.status, 200, `Expected 200, got ${corrReq.status}: ${JSON.stringify(corrReq.body)}`);
    assert.equal(corrReq.body.subjectStatus, 'CORRECTION_REQUESTED');
    assert.equal(corrReq.body.examStatus, 'DRAFT');

    const stEdit = await apiCall(baseUrl, '/api/results/save-marks', subjTeacherToken, {
      operationId: 'op_st_edit_2',
      examId: connectedExamId,
      selectedAcademicYear: '2083',
      selectedClass: '10',
      selectedSection: 'A',
      subjectToSave: 'Mathematics',
      subjectKey: 'Mathematics',
      workflowMode: 'CONNECTED',
      totalEligibleCount: 2,
      correctionReason: 'Re-verified Sita answer paper',
      students: [
        makeRow('uid_stu1', 'Aarav Sharma', 1, 'Mathematics', 62, 21, v1),
        makeRow('uid_stu2', 'Sita Yadav', 2, 'Mathematics', 40, 18, v2)
      ]
    });
    assert.equal(stEdit.status, 200, `Expected 200, got ${stEdit.status}: ${JSON.stringify(stEdit.body)}`);

    const stResub = await apiCall(baseUrl, '/api/results/submit-subject', subjTeacherToken, {
      examId: connectedExamId,
      subject: 'Mathematics',
      subjectKey: 'Mathematics',
      selectedClass: '10',
      selectedSection: 'A',
      selectedAcademicYear: '2083',
      eligibleStudentUids: ['uid_stu1', 'uid_stu2']
    });
    assert.equal(stResub.status, 200);
    assert.equal(stResub.body.subjectStatus, 'RESUBMITTED');
    assert.equal(stResub.body.examStatus, 'READY_FOR_REVIEW');

    const apprSubj = await apiCall(baseUrl, '/api/results/review-subject', adminToken, {
      examId: connectedExamId,
      subject: 'Mathematics',
      action: 'APPROVE'
    });
    assert.equal(apprSubj.status, 200);
    assert.equal(apprSubj.body.subjectStatus, 'APPROVED');

    const apprExam = await apiCall(baseUrl, '/api/results/approve-exam', adminToken, { examId: connectedExamId });
    assert.equal(apprExam.status, 200);
    assert.equal(apprExam.body.status, 'APPROVED');

    const pubExam = await apiCall(baseUrl, '/api/results/publish', adminToken, {
      examId: connectedExamId,
      targetClass: '10',
      targetSection: 'A',
      targetAcademicYear: '2083',
      summaryRecords: [
        { studentUid: 'uid_stu1', studentName: 'Aarav Sharma', rollNo: 1 },
        { studentUid: 'uid_stu2', studentName: 'Sita Yadav', rollNo: 2 }
      ]
    });
    assert.equal(pubExam.status, 200, `Expected 200, got ${pubExam.status}: ${JSON.stringify(pubExam.body)}`);

    const stu2Sum = (await db.collection('resultSummary').doc(`${connectedExamId}_uid_stu2`).get()).data()!;
    assert.equal(stu2Sum.published, true);
    assert.equal(stu2Sum.resultStatus, 'PASSED');
    assert.equal(stu2Sum.grade, 'C+'); // 58% -> C+ (2.4)
  });

  // =========================================================================
  // PART D2: SECURITY PENETRATION TESTS
  // =========================================================================
  console.log('\n--- PART D2: Security Penetration Tests ---');

  await testCase('SECURITY', 'Rejects mock_token_admin, forged JWT, missing token, and Student API writes', async () => {
    const mockRes = await apiCall(baseUrl, '/api/results/approve-exam', 'mock_token_admin', { examId: connectedExamId });
    assert.equal(mockRes.status, 401);

    const forgedRes = await apiCall(baseUrl, '/api/results/approve-exam', 'eyJhbGciOiJub25lIn0.eyJ1aWQiOiJ1aWRfYWRtaW4ifQ.', { examId: connectedExamId });
    assert.equal(forgedRes.status, 401);

    const noAuth = await apiCall(baseUrl, '/api/results/approve-exam', null, { examId: connectedExamId });
    assert.equal(noAuth.status, 401);

    const stuWriteApi = await apiCall(baseUrl, '/api/results/save-marks', student1Token, {
      operationId: 'op_stu_attack',
      examId: standaloneExamId,
      selectedAcademicYear: '2083',
      selectedClass: '10',
      selectedSection: 'A',
      subjectToSave: 'Mathematics',
      subjectKey: 'Mathematics',
      workflowMode: 'STANDALONE',
      students: [makeRow('uid_stu1', 'Aarav Sharma', 1, 'Mathematics', 75, 25, 0)]
    });
    assert.equal(stuWriteApi.status, 403);
  });

  await testCase('RULES', 'Class Teacher DENIED direct Firestore publish (published: true) on unpublished exam', async () => {
    const directPubStatus = await firestoreRestPatch(`exams/${standaloneExamId}`, classTeacherToken, {
      published: { booleanValue: true },
      status: { stringValue: 'PUBLISHED' }
    });
    assert.equal(directPubStatus, 403, `Teacher direct publish must be denied (got ${directPubStatus})`);
  });

  server.close();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log('\n==============================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED (Total ${results.length})`);
  console.log('==============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
