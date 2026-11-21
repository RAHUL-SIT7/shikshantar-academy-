import { initializeTestEnvironment, assertSucceeds, assertFails, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const PROJECT_ID = 'demo-shikshantar-audit';

async function runCase(
  num: number,
  name: string,
  operation: string,
  authIdentity: string,
  expected: 'ALLOW' | 'DENY',
  action: () => Promise<unknown>
) {
  let pass = false;
  let actual = '';
  let details: string | undefined;

  try {
    if (expected === 'ALLOW') {
      await assertSucceeds(action());
      pass = true;
      actual = 'ALLOW';
    } else {
      await assertFails(action());
      pass = true;
      actual = 'DENY';
    }
  } catch (err: any) {
    pass = false;
    actual = expected === 'ALLOW' ? 'DENY' : 'ALLOW';
    details = err?.message || String(err);
  }

  records.push({
    testNumber: num,
    testName: name,
    operation,
    authIdentity,
    expected,
    actual,
    status: pass ? 'PASS' : 'FAIL',
    ...(details ? { details } : {}),
  });

  console.log(
    `[TEST ${num.toString().padStart(2, '0')}] ${pass ? 'PASS' : 'FAIL'} | ${name.padEnd(56)} | Expected: ${expected.padEnd(5)} | Actual: ${actual}`
  );
  if (details) {
    console.error(`          -> ${details}`);
  }
}

async function runSecurityTestSuite() {
  const hostEnv = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';
  const [emuHost, emuPortStr] = hostEnv.split(':');
  const emuPort = emuPortStr ? parseInt(emuPortStr, 10) : 8085;

  const rulesPath = path.resolve(__dirname, '../firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  const rulesLines = rulesContent.split('\n').length;

  console.log('===================================================================================');
  console.log('STARTING FIRESTORE EMULATOR SECURITY TEST SUITE (40 SCENARIOS)');
  console.log(`Target Emulator Host: ${emuHost}:${emuPort}`);
  console.log(`Project ID: ${PROJECT_ID}`);
  console.log(`Loaded firestore.rules (${rulesContent.length} bytes, ${rulesLines} lines)`);
  console.log('===================================================================================\n');

  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: rulesContent,
      host: emuHost || '127.0.0.1',
      port: emuPort,
    },
  });

  try {
    // Seed realistic fixture documents with security rules disabled (Admin SDK equivalent)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();

      await db.collection('users').doc('admin_primary').set({
        role: 'admin',
        adminTier: 'primary',
        status: 'ACTIVE',
        active: true,
        email: 'rahulsah4534@gmail.com',
      });
      await db.collection('users').doc('teacher_assigned').set({
        role: 'teacher',
        status: 'ACTIVE',
        active: true,
        email: 'teacher1@shikshantar.edu.np',
        primaryClassTeacher: '10',
        primaryClassTeacherYear: '2082 BS',
        primaryClassTeacherSection: 'A',
        assignmentKeys: ['10_Mathematics_A_2082 BS'],
      });
      await db.collection('users').doc('teacher_unassigned').set({
        role: 'teacher',
        status: 'ACTIVE',
        active: true,
        email: 'teacher2@shikshantar.edu.np',
        primaryClassTeacher: '8',
        primaryClassTeacherYear: '2082 BS',
        primaryClassTeacherSection: 'B',
        assignmentKeys: ['8_Science_B_2082 BS'],
      });
      await db.collection('users').doc('student_own').set({
        role: 'student',
        status: 'ACTIVE',
        active: true,
        email: 'student1@shikshantar.edu.np',
        class: '10',
        section: 'A',
        academicYear: '2082 BS',
      });
      await db.collection('users').doc('student_other').set({
        role: 'student',
        status: 'ACTIVE',
        active: true,
        email: 'student2@shikshantar.edu.np',
        class: '10',
        section: 'A',
        academicYear: '2082 BS',
      });

      await db.collection('students').doc('student_own').set({
        studentUid: 'student_own',
        name: 'Aarav Sharma',
        class: '10',
        section: 'A',
        academicYear: '2082 BS',
      });

      await db.collection('notices').doc('notice_pub1').set({
        title: 'Annual Exam Schedule',
        isPublished: true,
      });
      await db.collection('academic_years').doc('2082').set({
        bsYear: 2082,
        name: '2082 BS',
        isCurrent: true,
      });
      await db.collection('admissions').doc('adm_pub1').set({
        studentName: 'Applicant One',
        status: 'pending',
      });
      await db.collection('custom_subjects').doc('cs1').set({
        name: 'Robotics',
        status: 'ACTIVE',
      });
      await db.collection('cash_ledger').doc('ledger_001').set({
        amount: 12000,
        type: 'CREDIT',
      });
      await db.collection('audit_logs').doc('log_001').set({
        actionType: 'RESULT_PUBLISH',
        actorUid: 'admin_primary',
      });
      await db.collection('salary_records').doc('sal_teacher_assigned').set({
        teacherId: 'teacher_assigned',
        amount: 50000,
      });
      await db.collection('salary_records').doc('sal_teacher_unassigned').set({
        teacherId: 'teacher_unassigned',
        amount: 45000,
      });
      await db.collection('user_sessions').doc('sess_student_own').set({
        userUid: 'student_own',
        active: true,
      });
      await db.collection('exams').doc('exam_t1').set({
        id: 'exam_t1',
        name: 'First Term 2082',
        class: '10',
        section: 'A',
        academicYear: '2082 BS',
        status: 'DRAFT',
        published: false,
      });
      await db.collection('exams').doc('exam_pub').set({
        id: 'exam_pub',
        name: 'Final Term 2082',
        class: '10',
        section: 'A',
        academicYear: '2082 BS',
        status: 'PUBLISHED',
        published: true,
      });
      await db.collection('results').doc('exam_t1_student_own_Mathematics').set({
        examId: 'exam_t1',
        studentUid: 'student_own',
        subjectKey: 'Mathematics',
        subject: 'Mathematics',
        class: '10',
        section: 'A',
        academicYear: '2082 BS',
        thMarks: 68,
        prMarks: 22,
        published: false,
      });
      await db.collection('results').doc('exam_pub_student_own_Mathematics').set({
        examId: 'exam_pub',
        studentUid: 'student_own',
        subjectKey: 'Mathematics',
        subject: 'Mathematics',
        class: '10',
        section: 'A',
        academicYear: '2082 BS',
        thMarks: 70,
        prMarks: 24,
        published: true,
      });
      await db.collection('results').doc('exam_pub_student_other_Mathematics').set({
        examId: 'exam_pub',
        studentUid: 'student_other',
        subjectKey: 'Mathematics',
        subject: 'Mathematics',
        class: '10',
        section: 'A',
        academicYear: '2082 BS',
        thMarks: 65,
        prMarks: 20,
        published: true,
      });
      await db.collection('notifications').doc('notif_student_own').set({
        recipientUid: 'student_own',
        recipientRole: 'student',
        type: 'RESULT_PUBLISHED',
        title: 'Result Published',
        message: 'Your result is live.',
        link: '/dashboard',
        eventId: 'evt_1',
        read: false,
      });
      await db.collection('notifications').doc('notif_other').set({
        recipientUid: 'student_other',
        recipientRole: 'student',
        type: 'RESULT_PUBLISHED',
        title: 'Result Published',
        message: 'Private notification.',
        link: '/dashboard',
        eventId: 'evt_2',
        read: false,
      });
      await db.collection('unmapped_secret_collection').doc('doc1').set({
        secret: 'classified',
      });
    });

    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const adminDb = testEnv
      .authenticatedContext('admin_primary', {
        email: 'rahulsah4534@gmail.com',
        email_verified: true,
      })
      .firestore();
    const teacherAssignedDb = testEnv
      .authenticatedContext('teacher_assigned', {
        email: 'teacher1@shikshantar.edu.np',
        email_verified: true,
      })
      .firestore();
    const teacherUnassignedDb = testEnv
      .authenticatedContext('teacher_unassigned', {
        email: 'teacher2@shikshantar.edu.np',
        email_verified: true,
      })
      .firestore();
    const studentOwnDb = testEnv
      .authenticatedContext('student_own', {
        email: 'student1@shikshantar.edu.np',
        email_verified: true,
      })
      .firestore();

    let t = 1;

    // 1–7: Unauthenticated Boundaries
    await runCase(t++, 'Unauthenticated Read User Profile', 'get(/users/admin_primary)', 'Unauthenticated', 'DENY', () =>
      unauthDb.collection('users').doc('admin_primary').get()
    );
    await runCase(t++, 'Unauthenticated Read Results', 'get(/results/exam_t1_student_own_Mathematics)', 'Unauthenticated', 'DENY', () =>
      unauthDb.collection('results').doc('exam_t1_student_own_Mathematics').get()
    );
    await runCase(t++, 'Unauthenticated Direct Write Notice', 'set(/notices/notice_unauth)', 'Unauthenticated', 'DENY', () =>
      unauthDb.collection('notices').doc('notice_unauth').set({ title: 'Tampered' })
    );
    await runCase(t++, 'Unauthenticated Direct Write Admission (Server-Only)', 'set(/admissions/adm_unauth)', 'Unauthenticated', 'DENY', () =>
      unauthDb.collection('admissions').doc('adm_unauth').set({ studentName: 'Bot' })
    );
    await runCase(t++, 'Unauthenticated Direct Write Contact (Server-Only)', 'set(/contact_enquiries/cq_unauth)', 'Unauthenticated', 'DENY', () =>
      unauthDb.collection('contact_enquiries').doc('cq_unauth').set({ message: 'Spam' })
    );
    await runCase(t++, 'Unauthenticated Read Public Notice', 'get(/notices/notice_pub1)', 'Unauthenticated', 'ALLOW', () =>
      unauthDb.collection('notices').doc('notice_pub1').get()
    );
    await runCase(t++, 'Unauthenticated Read Public Academic Year', 'get(/academic_years/2082)', 'Unauthenticated', 'ALLOW', () =>
      unauthDb.collection('academic_years').doc('2082').get()
    );

    // 8–16: Admin Permissions & Immutable Server-Only Logs
    await runCase(t++, 'Admin Read Student Profile', 'get(/users/student_own)', 'Admin', 'ALLOW', () =>
      adminDb.collection('users').doc('student_own').get()
    );
    await runCase(t++, 'Admin Read Results Collection', 'get(/results/exam_t1_student_own_Mathematics)', 'Admin', 'ALLOW', () =>
      adminDb.collection('results').doc('exam_t1_student_own_Mathematics').get()
    );
    await runCase(t++, 'Admin Write Public Notice', 'set(/notices/notice_admin1)', 'Admin', 'ALLOW', () =>
      adminDb.collection('notices').doc('notice_admin1').set({ title: 'Holiday Notice', isPublished: true })
    );
    await runCase(t++, 'Admin Read Cash Ledger Financial Record', 'get(/cash_ledger/ledger_001)', 'Admin', 'ALLOW', () =>
      adminDb.collection('cash_ledger').doc('ledger_001').get()
    );
    await runCase(t++, 'Admin Read Submitted Admissions', 'get(/admissions/adm_pub1)', 'Admin', 'ALLOW', () =>
      adminDb.collection('admissions').doc('adm_pub1').get()
    );
    await runCase(t++, 'Admin Write Custom Subject', 'set(/custom_subjects/cs_admin)', 'Admin', 'ALLOW', () =>
      adminDb.collection('custom_subjects').doc('cs_admin').set({ name: 'Astronomy', status: 'ACTIVE' })
    );
    await runCase(t++, 'Admin Read Audit Logs', 'get(/audit_logs/log_001)', 'Admin', 'ALLOW', () =>
      adminDb.collection('audit_logs').doc('log_001').get()
    );
    await runCase(t++, 'Admin Direct Client Write Audit Logs (Immutable)', 'set(/audit_logs/log_tamper)', 'Admin', 'DENY', () =>
      adminDb.collection('audit_logs').doc('log_tamper').set({ actionType: 'FAKE' })
    );
    await runCase(t++, 'Admin Direct Client Write Ledger Audit Logs (Immutable)', 'set(/ledger_audit_logs/log_tamper)', 'Admin', 'DENY', () =>
      adminDb.collection('ledger_audit_logs').doc('log_tamper').set({ actionType: 'FAKE' })
    );

    // 17–23: Teacher RBAC & Scope Isolation
    await runCase(t++, 'Assigned Class Teacher Read Own Class Student', 'get(/students/student_own)', 'Teacher (Assigned)', 'ALLOW', () =>
      teacherAssignedDb.collection('students').doc('student_own').get()
    );
    await runCase(t++, 'Unassigned Teacher Read Other Class Student', 'get(/students/student_own)', 'Teacher (Unassigned)', 'DENY', () =>
      teacherUnassignedDb.collection('students').doc('student_own').get()
    );
    await runCase(t++, 'Teacher Read Exam Metadata', 'get(/exams/exam_t1)', 'Teacher', 'ALLOW', () =>
      teacherAssignedDb.collection('exams').doc('exam_t1').get()
    );
    await runCase(t++, 'Teacher Direct Invalid Write to Results', 'set(/results/res_invalid)', 'Teacher', 'DENY', () =>
      teacherAssignedDb.collection('results').doc('res_invalid').set({ marks: 99, published: true })
    );
    await runCase(t++, 'Teacher Read Own Salary Record', 'get(/salary_records/sal_teacher_unassigned)', 'Teacher (Self)', 'ALLOW', () =>
      teacherUnassignedDb.collection('salary_records').doc('sal_teacher_unassigned').get()
    );
    await runCase(t++, 'Unassigned Teacher Read Other Teacher Salary', 'get(/salary_records/sal_teacher_assigned)', 'Teacher (Other)', 'DENY', () =>
      teacherUnassignedDb.collection('salary_records').doc('sal_teacher_assigned').get()
    );
    await runCase(t++, 'Teacher Access Financial Cash Ledger', 'get(/cash_ledger/ledger_001)', 'Teacher', 'DENY', () =>
      teacherAssignedDb.collection('cash_ledger').doc('ledger_001').get()
    );

    // 24–38: Student Privacy, Anti-Escalation, Results, Sessions & Notifications
    await runCase(t++, 'Student Read Own Profile', 'get(/users/student_own)', 'Student (Self)', 'ALLOW', () =>
      studentOwnDb.collection('users').doc('student_own').get()
    );
    await runCase(t++, 'Student Read Other Student Profile (Roster Privacy)', 'get(/users/student_other)', 'Student', 'DENY', () =>
      studentOwnDb.collection('users').doc('student_other').get()
    );
    await runCase(t++, 'Student Read Teacher Profile (Roster Privacy)', 'get(/users/teacher_assigned)', 'Student', 'DENY', () =>
      studentOwnDb.collection('users').doc('teacher_assigned').get()
    );
    await runCase(t++, 'Student Self-Escalate Role to Admin', 'update(/users/student_own)', 'Student', 'DENY', () =>
      studentOwnDb.collection('users').doc('student_own').update({ role: 'admin', adminTier: 'primary' })
    );
    await runCase(t++, 'Student Read Own Session', 'get(/user_sessions/sess_student_own)', 'Student (Self)', 'ALLOW', () =>
      studentOwnDb.collection('user_sessions').doc('sess_student_own').get()
    );
    await runCase(t++, 'Student Direct Tamper Own Session (Server-Only)', 'update(/user_sessions/sess_student_own)', 'Student', 'DENY', () =>
      studentOwnDb.collection('user_sessions').doc('sess_student_own').update({ active: false })
    );
    await runCase(t++, 'Student Read Unpublished Draft Result', 'get(/results/exam_t1_student_own_Mathematics)', 'Student (Self)', 'DENY', () =>
      studentOwnDb.collection('results').doc('exam_t1_student_own_Mathematics').get()
    );
    await runCase(t++, 'Student Read Own Published Result', 'get(/results/exam_pub_student_own_Mathematics)', 'Student (Self)', 'ALLOW', () =>
      studentOwnDb.collection('results').doc('exam_pub_student_own_Mathematics').get()
    );
    await runCase(t++, 'Student Read Other Student Published Result', 'get(/results/exam_pub_student_other_Mathematics)', 'Student', 'DENY', () =>
      studentOwnDb.collection('results').doc('exam_pub_student_other_Mathematics').get()
    );
    await runCase(t++, 'Student Direct Client Write to Results', 'set(/results/res_tamper)', 'Student', 'DENY', () =>
      studentOwnDb.collection('results').doc('res_tamper').set({ thMarks: 100, published: true })
    );
    await runCase(t++, 'Student Direct Client Write to ResultSummary', 'set(/resultSummary/sum_tamper)', 'Student', 'DENY', () =>
      studentOwnDb.collection('resultSummary').doc('sum_tamper').set({ percentage: 100, published: true })
    );
    await runCase(t++, 'Student Read Own Notification', 'get(/notifications/notif_student_own)', 'Student (Self)', 'ALLOW', () =>
      studentOwnDb.collection('notifications').doc('notif_student_own').get()
    );
    await runCase(t++, 'Student Read Other User Notification', 'get(/notifications/notif_other)', 'Student', 'DENY', () =>
      studentOwnDb.collection('notifications').doc('notif_other').get()
    );
    await runCase(t++, 'Signed-In Student Read Custom Subjects', 'get(/custom_subjects/cs1)', 'Student', 'ALLOW', () =>
      studentOwnDb.collection('custom_subjects').doc('cs1').get()
    );
    await runCase(t++, 'Student Write Custom Subject', 'set(/custom_subjects/cs_student)', 'Student', 'DENY', () =>
      studentOwnDb.collection('custom_subjects').doc('cs_student').set({ name: 'Hacked' })
    );

    // 39–40: Fail-Closed Default-Deny
    await runCase(t++, 'Default-Deny Read Unmapped Collection', 'get(/unmapped_secret_collection/doc1)', 'Student', 'DENY', () =>
      studentOwnDb.collection('unmapped_secret_collection').doc('doc1').get()
    );
    await runCase(t++, 'Default-Deny Write Unmapped Collection', 'set(/unmapped_secret_collection/doc1)', 'Student', 'DENY', () =>
      studentOwnDb.collection('unmapped_secret_collection').doc('doc1').set({ val: 'x' })
    );

    const total = records.length;
    const passed = records.filter((r) => r.status === 'PASS').length;
    const failed = records.filter((r) => r.status === 'FAIL').length;

    console.log('\n===================================================================================');
    console.log('EMULATOR SECURITY TEST SUITE COMPLETE');
    console.log(`Total Scenarios: ${total} | Passed: ${passed} | Failed: ${failed}`);
    console.log('===================================================================================\n');

    return { total, passed, failed, records };
  } finally {
    await testEnv.cleanup();
  }
}

runSecurityTestSuite()
  .then((res) => {
    const outputPath = path.resolve(__dirname, 'emulator_test_results.json');
    fs.writeFileSync(outputPath, JSON.stringify(res, null, 2));
    process.exit(res.failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('Fatal error running security suite:', err);
    try {
      const outputPath = path.resolve(__dirname, 'emulator_test_results.json');
      fs.writeFileSync(
        outputPath,
        JSON.stringify(
          {
            total: records.length,
            passed: records.filter((r) => r.status === 'PASS').length,
            failed: records.filter((r) => r.status === 'FAIL').length + 1,
            fatalError: err?.message || String(err),
            records,
          },
          null,
          2
        )
      );
    } catch (writeErr) {
      console.error('Failed writing fallback diagnostic JSON:', writeErr);
    }
    process.exit(1);
  });
