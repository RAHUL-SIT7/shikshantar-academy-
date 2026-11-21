import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ID = 'demo-shikshantar-step41';
const EMULATOR_PORT = 8085;

let testEnv: RulesTestEnvironment;

async function runStep41NotificationSecurityTests() {
  const rulesPath = path.join(__dirname, '../firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: EMULATOR_PORT,
      rules: rulesContent,
    },
  });

  const adminDb = () => testEnv.authenticatedContext('admin_uid', { email: 'admin@shikshantar.edu.np', role: 'admin' }).firestore();
  const student1Db = () => testEnv.authenticatedContext('student_1', { email: 'st1@shikshantar.edu.np', role: 'student' }).firestore();
  const student2Db = () => testEnv.authenticatedContext('student_2', { email: 'st2@shikshantar.edu.np', role: 'student' }).firestore();
  const teacher1Db = () => testEnv.authenticatedContext('teacher_1', { email: 't1@shikshantar.edu.np', role: 'teacher' }).firestore();

  const notifId = 'notif_abc123';
  const notifData = {
    notificationId: notifId,
    recipientUid: 'student_1',
    recipientRole: 'student',
    type: 'RESULT_PUBLISHED',
    title: 'Your Result Has Been Published!',
    message: 'Dear Student, your First Terminal Examination result is available.',
    link: '/results',
    read: false,
    createdAt: new Date().toISOString(),
    academicYearId: '2083',
    examId: 'term1_cls4_a_2083',
    classId: '4',
    sectionId: 'A',
    eventId: 'pub_term1_cls4_a_2083_student_1',
    metadata: { term: 'First Terminal' }
  };

  // Seed notification via security rules disabled context (simulating backend Admin SDK)
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(`notifications/${notifId}`).set(notifData);
  });

  let passed = 0;
  let failed = 0;

  async function testCase(num: number, desc: string, action: () => Promise<any>, expected: 'ALLOW' | 'DENY') {
    let success = false;
    try {
      await action();
      success = true;
    } catch (e) {
      success = false;
    }

    const matched = (expected === 'ALLOW' && success) || (expected === 'DENY' && !success);
    if (matched) {
      console.log(`[PASS] Test ${num}: ${desc} (${expected})`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${num}: ${desc} - Expected ${expected}, got ${success ? 'ALLOW' : 'DENY'}`);
      failed++;
    }
  }

  // 1. Student reads own notification — allowed
  await testCase(1, 'Student reads own notification', () => student1Db().doc(`notifications/${notifId}`).get(), 'ALLOW');

  // 2. Student reads another student's notification — denied
  await testCase(2, 'Student reads another student notification', () => student2Db().doc(`notifications/${notifId}`).get(), 'DENY');

  // 3. Student creates notification directly — denied
  await testCase(3, 'Student creates notification directly', () => student1Db().doc('notifications/notif_unauthorized').set(notifData), 'DENY');

  // 3b. Admin creates notification directly from client — denied (must use backend Admin SDK)
  await testCase(3.5, 'Admin creates notification directly from client', () => adminDb().doc('notifications/notif_admin_client').set(notifData), 'DENY');

  // 4. Student changes title/message/link — denied
  await testCase(4, 'Student modifies title/message', () => student1Db().doc(`notifications/${notifId}`).update({ title: 'Hacked Title' }), 'DENY');

  // 5. Student changes recipientUid — denied
  await testCase(5, 'Student modifies recipientUid', () => student1Db().doc(`notifications/${notifId}`).update({ recipientUid: 'student_2' }), 'DENY');

  // 6. Student marks own notification read — allowed
  await testCase(6, 'Student marks own notification read', () => student1Db().doc(`notifications/${notifId}`).update({ read: true, readAt: new Date().toISOString() }), 'ALLOW');

  // 7. Student modifies protected fields while marking read — denied
  await testCase(7, 'Student modifies protected fields during mark read', () => student1Db().doc(`notifications/${notifId}`).update({ read: true, title: 'Malicious Edit' }), 'DENY');

  // 7.5. Student provides invalid readAt type (number instead of string) — denied
  await testCase(7.5, 'Student provides invalid readAt type', () => student1Db().doc(`notifications/${notifId}`).update({ read: true, readAt: 123456 }), 'DENY');

  // 8. Teacher accesses another user's private notification — denied
  await testCase(8, 'Teacher accesses student notification', () => teacher1Db().doc(`notifications/${notifId}`).get(), 'DENY');

  // 9. Student deletes notification — denied
  await testCase(9, 'Student deletes notification', () => student1Db().doc(`notifications/${notifId}`).delete(), 'DENY');

  // 10. Admin deletes notification from client — denied (must use backend Admin SDK)
  await testCase(10, 'Admin deletes notification from client', () => adminDb().doc(`notifications/${notifId}`).delete(), 'DENY');

  // 11. Admin reads notification — allowed
  await testCase(11, 'Admin reads notification', () => adminDb().doc(`notifications/${notifId}`).get(), 'ALLOW');

  await testEnv.cleanup();
  console.log(`\nTest Suite Complete. Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

runStep41NotificationSecurityTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
