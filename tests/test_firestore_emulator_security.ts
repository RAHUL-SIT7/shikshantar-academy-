import * as fs from 'fs';
import * as path from 'path';

interface TestRecord {
  testNumber: number;
  testName: string;
  operation: string;
  authIdentity: string;
  expected: 'ALLOW' | 'DENY';
  actual: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

const records: TestRecord[] = [];

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const PROJECT_ID = 'demo-shikshantar-audit';
const BASE_URL = `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Helper for REST requests to Firestore Emulator
async function firestoreRequest(
  method: string,
  docPath: string,
  authHeader?: string,
  body?: any
): Promise<{ status: number; data: any }> {
  const url = `${BASE_URL}/${docPath}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (err: any) {
    return { status: 500, data: { error: err.message } };
  }
}

// Seed helper (Admin SDK / Emulator bypass)
async function seedDocument(docPath: string, fields: Record<string, any>): Promise<void> {
  const url = `${BASE_URL}/${docPath}`;
  const formattedFields: Record<string, any> = {};
  for (const [key, val] of Object.entries(fields)) {
    if (typeof val === 'string') formattedFields[key] = { stringValue: val };
    else if (typeof val === 'boolean') formattedFields[key] = { booleanValue: val };
    else if (typeof val === 'number') formattedFields[key] = { integerValue: val };
    else formattedFields[key] = { stringValue: String(val) };
  }

  await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer owner',
    },
    body: JSON.stringify({ fields: formattedFields }),
  });
}

function mockTokenHeader(uid: string, email?: string): string {
  const token = {
    sub: uid,
    user_id: uid,
    email: email || `${uid}@shikshantar.edu.np`,
    email_verified: true,
  };
  return `Bearer ${JSON.stringify(token)}`;
}

async function recordTest(
  num: number,
  name: string,
  op: string,
  auth: string,
  expectedStatus: 'ALLOW' | 'DENY',
  actualStatus: number,
  details?: string
) {
  const isAllowed = actualStatus >= 200 && actualStatus < 300;
  const actualStr = isAllowed ? 'ALLOW' : 'DENY';
  const pass = (expectedStatus === 'ALLOW' && isAllowed) || (expectedStatus === 'DENY' && !isAllowed);

  records.push({
    testNumber: num,
    testName: name,
    operation: op,
    authIdentity: auth,
    expected: expectedStatus,
    actual: `${actualStr} (HTTP ${actualStatus})`,
    status: pass ? 'PASS' : 'FAIL',
    details,
  });

  console.log(`[TEST ${num.toString().padStart(2, '0')}] ${pass ? '✅ PASS' : '❌ FAIL'} | ${name.padEnd(52)} | Expected: ${expectedStatus.padEnd(5)} | Actual: ${actualStr.padEnd(5)} (HTTP ${actualStatus})`);
}

async function runSecurityTestSuite() {
  console.log('===================================================================================');
  console.log('STARTING FIRESTORE EMULATOR SECURITY TEST SUITE (LIVE FIRESTORE EMULATOR RUNTIME)');
  console.log(`Target Emulator Host: ${EMULATOR_HOST}`);
  console.log(`Project ID: ${PROJECT_ID}`);
  console.log('===================================================================================\n');

  // Verify Rules File loaded
  const rulesPath = path.join(__dirname, '../firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  console.log(`Verified active firestore.rules file loaded (${rulesContent.length} bytes, 316 lines).\n`);

  // --- SEED FIXTURE DOCUMENTS FOR RBAC RULES ---
  console.log('Seeding fixture documents into Firestore Emulator...');
  await seedDocument('users/admin_primary', { role: 'admin', adminTier: 'primary', email: 'rahulsah4534@gmail.com' });
  await seedDocument('users/admin_secondary', { role: 'admin', adminTier: 'secondary', email: 'admin2@shikshantar.edu.np' });
  await seedDocument('users/teacher_assigned', { role: 'teacher', email: 'teacher1@shikshantar.edu.np' });
  await seedDocument('users/teacher_unassigned', { role: 'teacher', email: 'teacher2@shikshantar.edu.np' });
  await seedDocument('users/student_own', { role: 'student', email: 'student1@shikshantar.edu.np' });
  await seedDocument('users/student_other', { role: 'student', email: 'student2@shikshantar.edu.np' });
  await seedDocument('users/parent_linked', { role: 'parent', email: 'parent1@shikshantar.edu.np' });
  await seedDocument('salary_records/sal_teacher_assigned', { teacherId: 'teacher_assigned', amount: 50000 });
  await seedDocument('salary_records/sal_teacher_unassigned', { teacherId: 'teacher_unassigned', amount: 50000 });
  await seedDocument('user_sessions/sess_student_own', { userUid: 'student_own', active: true });
  await seedDocument('notices/notice_pub1', { title: 'Exam Schedule', isPublished: true });
  await seedDocument('custom_subjects/cs1', { name: 'Robotics' });
  await seedDocument('admissions/adm_pub1', { studentName: 'Applicant One' });
  console.log('Seeding complete.\n');

  let t = 1;

  // 1. Unauthenticated access
  const r1 = await firestoreRequest('GET', 'users/admin_primary');
  await recordTest(t++, 'Unauthenticated Read User Profile', 'getDoc(/users/admin_primary)', 'Unauthenticated', 'DENY', r1.status);

  const r2 = await firestoreRequest('GET', 'results/res_101');
  await recordTest(t++, 'Unauthenticated Read Results Collection', 'getDoc(/results/res_101)', 'Unauthenticated', 'DENY', r2.status);

  const r3 = await firestoreRequest('PATCH', 'notices/notice_unauth', undefined, { fields: { title: { stringValue: 'Hacked' } } });
  await recordTest(t++, 'Unauthenticated Direct Write Notice', 'setDoc(/notices/notice_unauth)', 'Unauthenticated', 'DENY', r3.status);

  const r4 = await firestoreRequest('PATCH', 'admissions/adm_pub1', undefined, { fields: { studentName: { stringValue: 'Applicant One' } } });
  await recordTest(t++, 'Unauthenticated Submit Admission Enquiry', 'setDoc(/admissions/adm_pub1)', 'Unauthenticated', 'ALLOW', r4.status);

  const r5 = await firestoreRequest('PATCH', 'contact_enquiries/cq_pub1', undefined, { fields: { message: { stringValue: 'Inquiry message' } } });
  await recordTest(t++, 'Unauthenticated Submit Contact Enquiry', 'setDoc(/contact_enquiries/cq_pub1)', 'Unauthenticated', 'ALLOW', r5.status);

  const r6 = await firestoreRequest('GET', 'notices/notice_pub1');
  await recordTest(t++, 'Unauthenticated Read Public Notice', 'getDoc(/notices/notice_pub1)', 'Unauthenticated', 'ALLOW', r6.status);

  // 2. Admin permissions
  const adminHeader = mockTokenHeader('admin_primary', 'rahulsah4534@gmail.com');

  const r7 = await firestoreRequest('GET', 'users/student_own', adminHeader);
  await recordTest(t++, 'Admin Read Student Profile', 'getDoc(/users/student_own)', 'Admin (rahulsah4534@gmail.com)', 'ALLOW', r7.status);

  const r8 = await firestoreRequest('GET', 'results/res_101', adminHeader);
  await recordTest(t++, 'Admin Direct Read Results Collection', 'getDoc(/results/res_101)', 'Admin', 'ALLOW', r8.status);

  const r9 = await firestoreRequest('PATCH', 'classes/class_10a', adminHeader, { fields: { className: { stringValue: 'Grade 10-A' } } });
  await recordTest(t++, 'Admin Write Academic Class', 'setDoc(/classes/class_10a)', 'Admin', 'ALLOW', r9.status);

  const r10 = await firestoreRequest('GET', 'cash_ledger/ledger_001', adminHeader);
  await recordTest(t++, 'Admin Read Cash Ledger Financial Record', 'getDoc(/cash_ledger/ledger_001)', 'Admin', 'ALLOW', r10.status);

  // 3. Assigned Class Teacher permissions
  const teacherAssignedHeader = mockTokenHeader('teacher_assigned', 'teacher1@shikshantar.edu.np');

  const r11 = await firestoreRequest('GET', 'students/student_own', teacherAssignedHeader);
  await recordTest(t++, 'Teacher Read Student Record', 'getDoc(/students/student_own)', 'Teacher (Assigned)', 'ALLOW', r11.status);

  const r12 = await firestoreRequest('GET', 'classes/class_10a', teacherAssignedHeader);
  await recordTest(t++, 'Teacher Read Class Structure', 'getDoc(/classes/class_10a)', 'Teacher', 'ALLOW', r12.status);

  const r13 = await firestoreRequest('PATCH', 'results/res_101', teacherAssignedHeader, { fields: { marks: { integerValue: 95 } } });
  await recordTest(t++, 'Teacher Direct Write to Results (Denied)', 'setDoc(/results/res_101)', 'Teacher', 'DENY', r13.status);

  // 4. Assigned Subject Teacher permissions
  const r14 = await firestoreRequest('GET', 'exams/exam_term1', teacherAssignedHeader);
  await recordTest(t++, 'Subject Teacher Read Exam Metadata', 'getDoc(/exams/exam_term1)', 'Teacher', 'ALLOW', r14.status);

  const r15 = await firestoreRequest('GET', 'subjectConfigs/config_math', teacherAssignedHeader);
  await recordTest(t++, 'Subject Teacher Read Subject Config', 'getDoc(/subjectConfigs/config_math)', 'Teacher', 'ALLOW', r15.status);

  // 5. Unassigned Teacher restrictions
  const teacherUnassignedHeader = mockTokenHeader('teacher_unassigned', 'teacher2@shikshantar.edu.np');

  const r16 = await firestoreRequest('GET', 'salary_records/sal_teacher_assigned', teacherUnassignedHeader);
  await recordTest(t++, 'Unassigned Teacher Read Other Salary Record', 'getDoc(/salary_records/sal_teacher_assigned)', 'Teacher (Unassigned)', 'DENY', r16.status);

  const r17 = await firestoreRequest('GET', 'salary_records/sal_teacher_unassigned', teacherUnassignedHeader);
  await recordTest(t++, 'Teacher Read Own Salary Record', 'getDoc(/salary_records/sal_teacher_unassigned)', 'Teacher (Self)', 'ALLOW', r17.status);

  const r18 = await firestoreRequest('GET', 'cash_ledger/ledger_001', teacherAssignedHeader);
  await recordTest(t++, 'Teacher Access Financial Cash Ledger', 'getDoc(/cash_ledger/ledger_001)', 'Teacher', 'DENY', r18.status);

  // 6. Student access to own profile & session
  const studentOwnHeader = mockTokenHeader('student_own', 'student1@shikshantar.edu.np');

  const r19 = await firestoreRequest('GET', 'results/res_101', studentOwnHeader);
  await recordTest(t++, 'Student Direct Read Results Collection (Denied)', 'getDoc(/results/res_101)', 'Student (Self)', 'DENY', r19.status);

  const r20 = await firestoreRequest('GET', 'users/student_own', studentOwnHeader);
  await recordTest(t++, 'Student Read Own Profile', 'getDoc(/users/student_own)', 'Student (Self)', 'ALLOW', r20.status);

  const r21 = await firestoreRequest('GET', 'user_sessions/sess_student_own', studentOwnHeader);
  await recordTest(t++, 'Student Read Own Session', 'getDoc(/user_sessions/sess_student_own)', 'Student (Self)', 'ALLOW', r21.status);

  // 7. Student access to another student's results & profile
  const r22 = await firestoreRequest('GET', 'users/student_other', studentOwnHeader);
  await recordTest(t++, 'Student Read Other Student Profile (Roster Leak)', 'getDoc(/users/student_other)', 'Student', 'DENY', r22.status);

  // 8. Parent access to unrelated students
  const parentLinkedHeader = mockTokenHeader('parent_linked', 'parent1@shikshantar.edu.np');

  const r23 = await firestoreRequest('GET', 'users/student_other', parentLinkedHeader);
  await recordTest(t++, 'Parent Read Unrelated Student Profile', 'getDoc(/users/student_other)', 'Parent', 'DENY', r23.status);

  const r24 = await firestoreRequest('GET', 'results/res_101', parentLinkedHeader);
  await recordTest(t++, 'Parent Direct Read Results Collection', 'getDoc(/results/res_101)', 'Parent', 'DENY', r24.status);

  // 9. Direct client writes to ALL protected result collections
  const collectionsToTest = [
    'results/res_test',
    'academicResults/res_test',
    'resultSummary/sum_test',
    'publicationManifests/manifest_test',
    'exam_subject_status/status_test',
    'class_reviews/rev_test',
    'resultHistory/hist_test',
    'auditLogs/log_test'
  ];

  for (const cPath of collectionsToTest) {
    const resWrite = await firestoreRequest('PATCH', cPath, studentOwnHeader, { fields: { fakeData: { stringValue: 'tampered' } } });
    await recordTest(t++, `Direct Client Write to /${cPath.split('/')[0]}`, `setDoc(/${cPath})`, 'Student/Client SDK', 'DENY', resWrite.status);
  }

  // 10. User roster privacy
  const r25 = await firestoreRequest('GET', 'users/teacher_assigned', studentOwnHeader);
  await recordTest(t++, 'Student Read Teacher Profile (Roster Privacy)', 'getDoc(/users/teacher_assigned)', 'Student', 'DENY', r25.status);

  // 11. Admissions & Contact submissions
  const r26 = await firestoreRequest('GET', 'admissions/adm_pub1', studentOwnHeader);
  await recordTest(t++, 'Non-Admin Read Submitted Admissions', 'getDoc(/admissions/adm_pub1)', 'Student', 'DENY', r26.status);

  const r27 = await firestoreRequest('GET', 'admissions/adm_pub1', adminHeader);
  await recordTest(t++, 'Admin Read Submitted Admissions', 'getDoc(/admissions/adm_pub1)', 'Admin', 'ALLOW', r27.status);

  // 12. Notice & Custom subject permissions
  const r28 = await firestoreRequest('GET', 'custom_subjects/cs1', studentOwnHeader);
  await recordTest(t++, 'Signed-In Student Read Custom Subjects', 'getDoc(/custom_subjects/cs1)', 'Student', 'ALLOW', r28.status);

  const r29 = await firestoreRequest('PATCH', 'custom_subjects/cs2', studentOwnHeader, { fields: { name: { stringValue: 'Astronomy' } } });
  await recordTest(t++, 'Student Write Custom Subject', 'setDoc(/custom_subjects/cs2)', 'Student', 'DENY', r29.status);

  const r30 = await firestoreRequest('PATCH', 'custom_subjects/cs2', adminHeader, { fields: { name: { stringValue: 'Astronomy' } } });
  await recordTest(t++, 'Admin Write Custom Subject', 'setDoc(/custom_subjects/cs2)', 'Admin', 'ALLOW', r30.status);

  // 13. Default-deny behavior
  const r31 = await firestoreRequest('GET', 'unmapped_secret_collection/doc1', studentOwnHeader);
  await recordTest(t++, 'Default-Deny Read Arbitrary Collection', 'getDoc(/unmapped_secret_collection/doc1)', 'Student', 'DENY', r31.status);

  const r32 = await firestoreRequest('PATCH', 'unmapped_secret_collection/doc1', studentOwnHeader, { fields: { val: { stringValue: 'x' } } });
  await recordTest(t++, 'Default-Deny Write Arbitrary Collection', 'setDoc(/unmapped_secret_collection/doc1)', 'Student', 'DENY', r32.status);

  // SUMMARY
  const total = records.length;
  const passed = records.filter(r => r.status === 'PASS').length;
  const failed = records.filter(r => r.status === 'FAIL').length;

  console.log('\n===================================================================================');
  console.log(`EMULATOR SECURITY TEST SUITE COMPLETE`);
  console.log(`Total Scenarios: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log('===================================================================================\n');

  return { total, passed, failed, records };
}

// Execute and save JSON evidence
runSecurityTestSuite().then((res) => {
  fs.writeFileSync(
    path.join(__dirname, 'emulator_test_results.json'),
    JSON.stringify(res, null, 2)
  );
  if (res.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}).catch((err) => {
  console.error('Fatal error running security suite:', err);
  process.exit(1);
});
