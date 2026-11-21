/**
 * Isolated Local Firebase Emulator Verification for:
 * 1. Teacher Exam-Initialization In-Portal Bell Notifications (no email spam by default)
 * 2. Result Publication Notifications & Guardian/Registered-Student Email Resolution
 *
 * Strictly runs against Firebase Auth (9098) & Firestore (8085) Emulators — NEVER production!
 */
process.env.USE_FIREBASE_EMULATOR = 'true';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9098';
process.env.SKIP_SERVER_START = 'true';

import assert from 'node:assert/strict';
import http from 'node:http';
import admin from 'firebase-admin';
import { createApp, getAdminDb } from '../server';
import { getSmtpTransportConfig, resolveResultNotificationRecipientEmail } from '../api/_lib/auth';

const PROJECT_ID = 'project-4b410c97-a152-49e7-940';
const AUTH_EMU_URL = 'http://127.0.0.1:9098';
const FIRESTORE_EMU_URL = 'http://127.0.0.1:8085';

async function testCase(group: string, name: string, fn: () => Promise<void> | void) {
  await fn();
  console.log(`  [PASS] (${group}) ${name}`);
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
    `${AUTH_EMU_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    }
  );
  const data: any = await resp.json();
  if (!data.idToken) {
    throw new Error(`Failed to exchange custom token for ${uid}: ${JSON.stringify(data)}`);
  }
  return data.idToken;
}

async function main() {
  await clearEmulators();
  const db = getAdminDb();
  const app = await createApp({ skipVite: true, skipOutboxWorker: true });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Unit tests for resolveResultNotificationRecipientEmail
    await testCase('EMAIL_POLICY', 'Prefers guardianEmail when both guardian and student email exist', () => {
      const res = resolveResultNotificationRecipientEmail({
        guardianEmail: 'parent.sharma@gmail.com',
        email: 'student.sharma@gmail.com'
      });
      assert.equal(res.email, 'parent.sharma@gmail.com');
      assert.equal(res.source, 'guardian');
    });

    await testCase('EMAIL_POLICY', 'Falls back to student registered email when guardianEmail is missing', () => {
      const res = resolveResultNotificationRecipientEmail({
        guardianEmail: '',
        email: 'registered.student@gmail.com'
      });
      assert.equal(res.email, 'registered.student@gmail.com');
      assert.equal(res.source, 'student');
    });

    await testCase('EMAIL_POLICY', 'Rejects placeholder/non-routable domains cleanly', () => {
      const res = resolveResultNotificationRecipientEmail({
        guardianEmail: 'dummy@example.com',
        email: 'student@shikshantar.local'
      });
      assert.equal(res.email, '');
      assert.equal(res.source, '');
    });

    // 2. Seed Auth & Firestore actors
    const adminUid = 'admin_1';
    const classTeacher8AUid = 'teacher_class_8a';
    const subjTeacher8AUid = 'teacher_math_8a';
    const inactiveTeacherUid = 'teacher_inactive_8a';
    const otherClassTeacherUid = 'teacher_class_7a';
    const studentGuardianUid = 'student_guardian_8a';
    const studentRegisteredUid = 'student_registered_8a';
    const studentClass7Uid = 'student_other_7a';

    const adminToken = await createAuthUserAndToken(adminUid, 'admin.emu@shikshantar.edu.np', 'Principal Admin');
    const classTeacherToken = await createAuthUserAndToken(classTeacher8AUid, 'ct8a@gmail.com', 'Sita ClassTeacher');
    const subjTeacherToken = await createAuthUserAndToken(subjTeacher8AUid, 'math8a@gmail.com', 'Hari MathTeacher');
    await createAuthUserAndToken(inactiveTeacherUid, 'inactive@gmail.com', 'Inactive Teacher');
    await createAuthUserAndToken(otherClassTeacherUid, 'ct7a@gmail.com', 'Class7 Teacher');
    await createAuthUserAndToken(studentGuardianUid, 's1.login@gmail.com', 'Aarav Shrestha');
    await createAuthUserAndToken(studentRegisteredUid, 'ramesh.student@gmail.com', 'Ramesh Thapa');
    await createAuthUserAndToken(studentClass7Uid, 's7.student@gmail.com', 'Grade7 Student');

    await db.collection('users').doc(adminUid).set({
      uid: adminUid,
      role: 'admin',
      adminTier: 'primary',
      fullName: 'Principal Admin',
      email: 'admin.emu@shikshantar.edu.np',
      active: true,
      status: 'approved'
    });

    await db.collection('users').doc(classTeacher8AUid).set({
      uid: classTeacher8AUid,
      role: 'teacher',
      fullName: 'Sita ClassTeacher',
      email: 'ct8a@gmail.com',
      primaryClassTeacher: '8',
      primaryClassTeacherSection: 'A',
      primaryClassTeacherYear: '2083',
      teachingAssignments: [
        { class: '8', section: 'A', academicYear: '2083', subject: 'Nepali' }
      ],
      assignmentKeys: ['8_Nepali_A_2083'],
      active: true,
      status: 'approved'
    });

    await db.collection('users').doc(subjTeacher8AUid).set({
      uid: subjTeacher8AUid,
      role: 'teacher',
      fullName: 'Hari MathTeacher',
      email: 'math8a@gmail.com',
      teachingAssignments: [
        { class: '8', section: 'A', academicYear: '2083', subject: 'Mathematics' },
        { class: '8', section: 'A', academicYear: '2083', subject: 'Science' }
      ],
      assignmentKeys: ['8_Mathematics_A_2083', '8_Science_A_2083'],
      active: true,
      status: 'approved'
    });

    await db.collection('users').doc(inactiveTeacherUid).set({
      uid: inactiveTeacherUid,
      role: 'teacher',
      fullName: 'Inactive Teacher',
      email: 'inactive@gmail.com',
      teachingAssignments: [
        { class: '8', section: 'A', academicYear: '2083', subject: 'English' }
      ],
      active: false,
      status: 'INACTIVE'
    });

    await db.collection('users').doc(otherClassTeacherUid).set({
      uid: otherClassTeacherUid,
      role: 'teacher',
      fullName: 'Class7 Teacher',
      email: 'ct7a@gmail.com',
      primaryClassTeacher: '7',
      primaryClassTeacherSection: 'A',
      primaryClassTeacherYear: '2083',
      teachingAssignments: [
        { class: '7', section: 'A', academicYear: '2083', subject: 'Mathematics' }
      ],
      active: true,
      status: 'approved'
    });

    await db.collection('users').doc(studentGuardianUid).set({
      uid: studentGuardianUid,
      role: 'student',
      fullName: 'Aarav Shrestha',
      class: '8',
      section: 'A',
      academicYearId: '2083',
      permanentStudentId: 'SA-2083-001',
      email: 's1.login@gmail.com',
      guardianEmail: 'aarav.parent@gmail.com',
      guardianName: 'Bikram Shrestha',
      active: true,
      status: 'approved'
    });

    await db.collection('users').doc(studentRegisteredUid).set({
      uid: studentRegisteredUid,
      role: 'student',
      fullName: 'Ramesh Thapa',
      class: '8',
      section: 'A',
      academicYearId: '2083',
      permanentStudentId: 'SA-2083-002',
      email: 'ramesh.student@gmail.com',
      guardianEmail: '',
      active: true,
      status: 'approved'
    });

    await db.collection('users').doc(studentClass7Uid).set({
      uid: studentClass7Uid,
      role: 'student',
      fullName: 'Grade7 Student',
      class: '7',
      section: 'A',
      academicYearId: '2083',
      permanentStudentId: 'SA-2083-099',
      email: 's7.student@gmail.com',
      active: true,
      status: 'approved'
    });

    // 3. Class Teacher initializes exam via /api/exams/initialize-or-resume
    await testCase('TEACHER_INIT', 'Class Teacher initialization notifies only active Class 8A subject teachers (no self-notify, no email)', async () => {
      const initRes = await fetch(`${baseUrl}/api/exams/initialize-or-resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${classTeacherToken}`
        },
        body: JSON.stringify({
          operationId: 'op_init_first_8a_2083',
          category: 'TERMINAL',
          terminalExamType: 'FIRST_TERMINAL',
          canonicalClassId: 'Class 8',
          canonicalSectionId: 'A',
          canonicalAcademicYearId: '2083',
          subjectConfigs: [
            { subjectKey: 'Mathematics', subjectName: 'Mathematics', enabled: true, hasTh: true, thFullMarks: 75, thPassMarks: 27, hasPr: true, prFullMarks: 25, prPassMarks: 9 }
          ]
        })
      });
      const initJson: any = await initRes.json();
      assert.equal(initRes.status, 200, `Unexpected status: ${JSON.stringify(initJson)}`);
      assert.equal(initJson.resumed, false);
      assert.equal(initJson.teacherNotificationsSent, 1);

      const subjNotifs = await db.collection('notifications').where('recipientUid', '==', subjTeacher8AUid).get();
      assert.equal(subjNotifs.size, 1);
      const nData = subjNotifs.docs[0].data();
      assert.equal(nData.type, 'MARKS_SUBMISSION_OPEN');
      assert.equal(nData.link, '/admin?tab=prep');
      assert.equal(nData.read, false);
      assert.equal(nData.emailStatus, 'DEFERRED_BY_POLICY');
      assert.ok(nData.message.includes('Mathematics'));

      // Initiator, inactive teacher, and Grade 7 teacher must NOT be notified
      const selfNotifs = await db.collection('notifications').where('recipientUid', '==', classTeacher8AUid).get();
      const inactiveNotifs = await db.collection('notifications').where('recipientUid', '==', inactiveTeacherUid).get();
      const otherClassNotifs = await db.collection('notifications').where('recipientUid', '==', otherClassTeacherUid).get();
      assert.equal(selfNotifs.size, 0);
      assert.equal(inactiveNotifs.size, 0);
      assert.equal(otherClassNotifs.size, 0);
    });

    // 4. Security + Idempotency on /api/exams/notify-teachers-initialized
    await testCase('TEACHER_INIT', 'Rejects non-class-teacher subject teacher with 403 and lets Admin idempotently notify all Class 8A teachers', async () => {
      const adminCreatedExamId = 'SECOND_TERMINAL_8_A_2083';
      await db.collection('exams').doc(adminCreatedExamId).set({
        id: adminCreatedExamId,
        name: 'Second Terminal Examination',
        type: 'Second Terminal Examination',
        class: '8',
        section: 'A',
        academicYear: '2083',
        published: false,
        status: 'IN PROGRESS'
      });

      const forbiddenRes = await fetch(`${baseUrl}/api/exams/notify-teachers-initialized`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${subjTeacherToken}`
        },
        body: JSON.stringify({ examId: adminCreatedExamId })
      });
      assert.equal(forbiddenRes.status, 403);

      const adminRes = await fetch(`${baseUrl}/api/exams/notify-teachers-initialized`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ examId: adminCreatedExamId })
      });
      const adminJson: any = await adminRes.json();
      assert.equal(adminRes.status, 200);
      assert.equal(adminJson.notifiedCount, 2); // Both classTeacher8AUid + subjTeacher8AUid

      // Repeat call remains strictly idempotent (does not create duplicate notification docs)
      const beforeCount = (await db.collection('notifications').where('examId', '==', adminCreatedExamId).get()).size;
      assert.equal(beforeCount, 2);
      const retryRes = await fetch(`${baseUrl}/api/exams/notify-teachers-initialized`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ examId: adminCreatedExamId })
      });
      assert.equal(retryRes.status, 200);
      const afterCount = (await db.collection('notifications').where('examId', '==', adminCreatedExamId).get()).size;
      assert.equal(afterCount, 2);
    });

    // 5. Result Publication creates student bell notifications + resolves guardian OR registered student email
    await testCase('RESULT_PUBLISH', 'Publishing triggers outbox notifications for Class 8A students with guardian->student email resolution and ignores Grade 7', async () => {
      const pubExamId = 'SECOND_TERMINAL_8_A_2083';
      await db.collection('exams').doc(pubExamId).set({
        id: pubExamId,
        name: 'Second Terminal Examination',
        type: 'Second Terminal Examination',
        class: '8',
        section: 'A',
        academicYear: '2083',
        published: false,
        status: 'APPROVED',
        subjectConfigs: [
          {
            subjectKey: 'Mathematics',
            subjectName: 'Mathematics',
            enabled: true,
            hasTh: true,
            thFullMarks: 75,
            thPassMarks: 27,
            hasPr: true,
            prFullMarks: 25,
            prPassMarks: 9
          }
        ]
      });

      // Seed valid persisted subject mark records matching Nepal CDC completeness rules
      for (const s of [
        { uid: studentGuardianUid, id: 'SA-2083-001', name: 'Aarav Shrestha', th: 60, pr: 22 },
        { uid: studentRegisteredUid, id: 'SA-2083-002', name: 'Ramesh Thapa', th: 55, pr: 20 }
      ]) {
        await db.collection('results').doc(`${pubExamId}_${s.uid}_Mathematics`).set({
          examId: pubExamId,
          studentUid: s.uid,
          studentId: s.id,
          permanentStudentId: s.id,
          studentName: s.name,
          class: '8',
          section: 'A',
          academicYear: '2083',
          subject: 'Mathematics',
          subjectKey: 'Mathematics',
          thMarks: s.th,
          prMarks: s.pr,
          thFull: 75,
          prFull: 25,
          thPass: 27,
          prPass: 9,
          marks: s.th + s.pr,
          fullMarks: 100,
          published: false
        });
      }

      const pubRes = await fetch(`${baseUrl}/api/results/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          examId: pubExamId,
          targetClass: '8',
          targetSection: 'A',
          targetAcademicYear: '2083',
          summaryRecords: [
            { studentUid: studentGuardianUid, studentId: 'SA-2083-001', studentName: 'Aarav Shrestha' },
            { studentUid: studentRegisteredUid, studentId: 'SA-2083-002', studentName: 'Ramesh Thapa' }
          ]
        })
      });
      const pubJson: any = await pubRes.json();
      assert.equal(pubRes.status, 200, `Publish failed: ${JSON.stringify(pubJson)}`);
      assert.equal(pubJson.success, true);

      // Wait briefly for non-blocking processNotificationOutbox() triggered by publish to finish writing notifications
      let s1Notifs: FirebaseFirestore.QuerySnapshot | null = null;
      let s2Notifs: FirebaseFirestore.QuerySnapshot | null = null;
      for (let i = 0; i < 30; i++) {
        s1Notifs = await db.collection('notifications').where('recipientUid', '==', studentGuardianUid).get();
        s2Notifs = await db.collection('notifications').where('recipientUid', '==', studentRegisteredUid).get();
        if (s1Notifs.size > 0 && s2Notifs.size > 0) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      assert.equal(s1Notifs!.size, 1);
      assert.equal(s2Notifs!.size, 1);
      assert.equal(s1Notifs!.docs[0].data().recipientEmailSource, 'guardian');
      assert.equal(s2Notifs!.docs[0].data().recipientEmailSource, 'student');
      assert.equal(s1Notifs!.docs[0].data().link, '/result');

      const s7Notifs = await db.collection('notifications').where('recipientUid', '==', studentClass7Uid).get();
      assert.equal(s7Notifs.size, 0);

      // Verify teacher is forbidden from /api/results/send-publication-emails
      const nonAdminEmailRes = await fetch(`${baseUrl}/api/results/send-publication-emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${classTeacherToken}`
        },
        body: JSON.stringify({
          examId: pubExamId,
          examType: 'Second Terminal Examination',
          className: '8',
          academicYear: '2083',
          students: [{ studentUid: studentRegisteredUid, email: 'ramesh.student@gmail.com', name: 'Ramesh Thapa' }]
        })
      });
      assert.equal(nonAdminEmailRes.status, 403);
    });

    // 6. Custom Domain SMTP From Alias Resolution & Safe Fallback
    await testCase('SMTP_ALIASES', 'Resolves SMTP_FROM_RESULTS, SMTP_FROM_SECURITY, SMTP_FROM_GENERAL and falls back safely to SMTP_USER', () => {
      const prevEnv = {
        SMTP_USER: process.env.SMTP_USER,
        SMTP_PASSWORD: process.env.SMTP_PASSWORD,
        SMTP_FROM: process.env.SMTP_FROM,
        SMTP_FROM_RESULTS: process.env.SMTP_FROM_RESULTS,
        SMTP_FROM_SECURITY: process.env.SMTP_FROM_SECURITY,
        SMTP_FROM_GENERAL: process.env.SMTP_FROM_GENERAL
      };
      try {
        process.env.SMTP_USER = 'security.shikshantar.edu.np@gmail.com';
        process.env.SMTP_PASSWORD = 'abcd efgh ijkl mnop';
        process.env.SMTP_FROM_RESULTS = 'results@shikshantaracademy.edu.np';
        process.env.SMTP_FROM_SECURITY = 'securityalerts@shikshantaracademy.edu.np';
        process.env.SMTP_FROM_GENERAL = 'info@shikshantaracademy.edu.np';
        delete process.env.SMTP_FROM;

        const cfg = getSmtpTransportConfig();
        assert.equal(cfg.configured, true);
        assert.equal(cfg.user, 'security.shikshantar.edu.np@gmail.com');
        assert.equal(cfg.fromResults, 'results@shikshantaracademy.edu.np');
        assert.equal(cfg.fromSecurity, 'securityalerts@shikshantaracademy.edu.np');
        assert.equal(cfg.fromGeneral, 'info@shikshantaracademy.edu.np');
        assert.equal(cfg.transportOptions?.auth?.pass, 'abcdefghijklmnop');

        // Invalid or empty alias must safely fall back to SMTP_USER
        process.env.SMTP_FROM_RESULTS = 'not-an-email';
        delete process.env.SMTP_FROM_SECURITY;
        delete process.env.SMTP_FROM_GENERAL;
        const fallbackCfg = getSmtpTransportConfig();
        assert.equal(fallbackCfg.fromResults, 'security.shikshantar.edu.np@gmail.com');
        assert.equal(fallbackCfg.fromSecurity, 'security.shikshantar.edu.np@gmail.com');
        assert.equal(fallbackCfg.fromGeneral, 'security.shikshantar.edu.np@gmail.com');
      } finally {
        for (const [k, v] of Object.entries(prevEnv)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }
    });

    // 7. Progress Monitoring normalized metrics + subjects array
    await testCase('PROGRESS_MONITORING', 'Returns normalized examName, totalEligibleStudents, totalEnteredMarks, totalSlots, overallPercent, and subjects', async () => {
      const monRes = await fetch(`${baseUrl}/api/exams/progress-monitoring?academicYear=2083`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const monJson: any = await monRes.json();
      assert.equal(monRes.status, 200, `Unexpected monitoring status: ${JSON.stringify(monJson)}`);
      assert.equal(monJson.success, true);
      assert.ok(Array.isArray(monJson.examinations) && monJson.examinations.length >= 1);

      const pubExam = monJson.examinations.find((e: any) => e.examId === 'SECOND_TERMINAL_8_A_2083');
      assert.ok(pubExam, 'Published exam should be present in 2083 monitoring list');
      assert.equal(pubExam.examName, 'Second Terminal Examination');
      assert.equal(pubExam.totalEligibleStudents, 2);
      assert.equal(pubExam.totalEnteredMarks, 2);
      assert.equal(pubExam.totalSlots, 2);
      assert.equal(pubExam.overallPercent, 100);
      assert.ok(Array.isArray(pubExam.subjects) && pubExam.subjects.length === 1);
      assert.equal(pubExam.subjects[0].subjectName, 'Mathematics');
      assert.equal(pubExam.subjects[0].completionPercent, 100);
    });

    // 8. Primary Admin Draft Exam Cleanup RBAC & Published Protection
    await testCase('DELETE_DRAFT', 'Rejects secondary admin (403) and published exams (409), allows Primary Admin to delete unpublished drafts + audit log', async () => {
      const secAdminUid = await createTestUser('secadmin@shikshantar.edu.np', 'SecAdminPass123!', {
        fullName: 'Secondary Admin',
        role: 'admin',
        adminTier: 'secondary',
        status: 'ACTIVE',
        active: true
      });
      const secAdminToken = await signInAndGetIdToken('secadmin@shikshantar.edu.np', 'SecAdminPass123!');
      assert.ok(secAdminUid);

      const draftExamId = 'DUMMY_DRAFT_8_A_2083';
      await db.collection('exams').doc(draftExamId).set({
        id: draftExamId,
        name: 'Dummy Test Exam',
        class: '8',
        section: 'A',
        academicYear: '2083',
        published: false,
        status: 'IN PROGRESS'
      });
      await db.collection('results').doc(`${draftExamId}_row1`).set({
        examId: draftExamId,
        studentUid: studentGuardianUid,
        subject: 'Mathematics',
        thMarks: 40,
        published: false
      });

      // Secondary admin forbidden
      const secRes = await fetch(`${baseUrl}/api/exams/delete-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secAdminToken}` },
        body: JSON.stringify({ examId: draftExamId })
      });
      assert.equal(secRes.status, 403);

      // Published exam blocked with 409
      const pubBlockRes = await fetch(`${baseUrl}/api/exams/delete-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ examId: 'SECOND_TERMINAL_8_A_2083' })
      });
      assert.equal(pubBlockRes.status, 409);

      // Primary admin succeeds cleanly
      const delRes = await fetch(`${baseUrl}/api/exams/delete-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ examId: draftExamId, reason: 'Cleaning dummy exam' })
      });
      const delJson: any = await delRes.json();
      assert.equal(delRes.status, 200, `Delete draft failed: ${JSON.stringify(delJson)}`);
      assert.equal(delJson.success, true);
      assert.equal(delJson.deletedDraftResultRows, 1);

      const examAfter = await db.collection('exams').doc(draftExamId).get();
      assert.equal(examAfter.exists, false);
      const rowsAfter = await db.collection('results').where('examId', '==', draftExamId).get();
      assert.equal(rowsAfter.size, 0);

      const auditSnap = await db.collection('audit_logs').where('action', '==', 'EXAM_DRAFT_DELETED').get();
      assert.ok(auditSnap.size >= 1);
    });

    console.log('\nALL TEACHER INIT, RESULT NOTIFICATION, SMTP ALIAS, MONITORING & DRAFT CLEANUP CHECKS PASSED.');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await clearEmulators();
  }
}

main().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
