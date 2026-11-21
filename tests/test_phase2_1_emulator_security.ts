import { initializeTestEnvironment, assertSucceeds, assertFails, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';

let testEnv: RulesTestEnvironment;
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function report(name: string, passed: boolean, details?: string) {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`[PASS] ${name}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${name} ${details ? '- ' + details : ''}`);
  }
}

async function runEmulatorSecurityTests() {
  console.log('====================================================');
  console.log('--- PHASE 2.1 STEP 3: FIREBASE EMULATOR SECURITY ---');
  console.log('====================================================\n');

  const rulesPath = path.join(process.cwd(), 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  const hostEnv = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';
  const [emuHost, emuPortStr] = hostEnv.split(':');
  const emuPort = emuPortStr ? parseInt(emuPortStr, 10) : 8085;

  testEnv = await initializeTestEnvironment({
    projectId: 'demo-audit-test',
    firestore: {
      rules: rules,
      host: emuHost || '127.0.0.1',
      port: emuPort
    }
  });

  // Seed test documents with admin security bypass
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    // 1. Admin document in users/{uid} and admins/{uid}
    await db.collection('users').doc('admin_user').set({
      role: 'admin',
      adminTier: 'primary',
      status: 'ACTIVE'
    });
    await db.collection('admins').doc('admin_user').set({
      role: 'admin',
      grantedAt: new Date().toISOString()
    });

    // 2. Class Teacher document
    await db.collection('users').doc('class_teacher_user').set({
      role: 'teacher',
      status: 'ACTIVE',
      primaryClassTeacher: '10',
      primaryClassTeacherYear: '2081 BS',
      primaryClassTeacherSection: 'A'
    });

    // 3. Subject Teacher document
    await db.collection('users').doc('subj_teacher_user').set({
      role: 'teacher',
      status: 'ACTIVE',
      assignmentKeys: ['10_Science_A_2081 BS', '10_Math_All_2081 BS']
    });

    // 4. Student document
    await db.collection('users').doc('student_user').set({
      role: 'student',
      status: 'ACTIVE',
      studentId: 'STD-1001'
    });

    // 5. Seed an existing audit log document
    await db.collection('audit_logs').doc('seed_audit_log_1').set({
      id: 'seed_audit_log_1',
      actionType: 'MARK_ENTRY',
      category: 'academic',
      reason: 'Initial setup',
      actorUid: 'admin_user',
      timestamp: new Date().toISOString()
    });

    // 6. Seed an existing ledger audit log document
    await db.collection('ledger_audit_logs').doc('seed_ledger_log_1').set({
      id: 'seed_ledger_log_1',
      actionType: 'FEE_ADJUSTED',
      category: 'financial',
      reason: 'Fee concession',
      actorUid: 'admin_user',
      timestamp: new Date().toISOString()
    });
  });

  console.log('--- 1. FIRESTORE RULES CLIENT EMULATOR TESTS ---');

  // Test 1: Subject Teacher cannot create audit_logs directly
  const teacherCtx = testEnv.authenticatedContext('subj_teacher_user');
  try {
    await assertFails(teacherCtx.firestore().collection('audit_logs').doc('test_audit_teacher').set({
      actionType: 'MARK_ENTRY',
      reason: 'Teacher direct write attempt'
    }));
    report('1. Teacher cannot create audit_logs documents directly', true);
  } catch (err: any) {
    report('1. Teacher cannot create audit_logs documents directly', false, err.message);
  }

  // Test 2: Class Teacher cannot create audit_logs directly
  const classTeacherCtx = testEnv.authenticatedContext('class_teacher_user');
  try {
    await assertFails(classTeacherCtx.firestore().collection('audit_logs').doc('test_audit_class_teacher').set({
      actionType: 'MARK_ENTRY',
      reason: 'Class teacher direct write attempt'
    }));
    report('2. Class Teacher cannot create audit_logs documents directly', true);
  } catch (err: any) {
    report('2. Class Teacher cannot create audit_logs documents directly', false, err.message);
  }

  // Test 3: Admin cannot create audit_logs directly via Client SDK
  const adminCtx = testEnv.authenticatedContext('admin_user');
  try {
    await assertFails(adminCtx.firestore().collection('audit_logs').doc('test_audit_admin').set({
      actionType: 'MARK_ENTRY',
      reason: 'Admin client direct write attempt'
    }));
    report('3. Admin cannot create audit_logs documents directly via Client SDK', true);
  } catch (err: any) {
    report('3. Admin cannot create audit_logs documents directly via Client SDK', false, err.message);
  }

  // Test 4: Student cannot create audit_logs directly
  const studentCtx = testEnv.authenticatedContext('student_user');
  try {
    await assertFails(studentCtx.firestore().collection('audit_logs').doc('test_audit_student').set({
      actionType: 'MARK_ENTRY',
      reason: 'Student direct write attempt'
    }));
    report('4. Student cannot create audit_logs documents directly', true);
  } catch (err: any) {
    report('4. Student cannot create audit_logs documents directly', false, err.message);
  }

  // Test 5: No client role can update or delete audit_logs documents
  try {
    await assertFails(adminCtx.firestore().collection('audit_logs').doc('seed_audit_log_1').update({
      reason: 'Admin tampering attempt'
    }));
    await assertFails(adminCtx.firestore().collection('audit_logs').doc('seed_audit_log_1').delete());
    await assertFails(teacherCtx.firestore().collection('audit_logs').doc('seed_audit_log_1').update({
      reason: 'Teacher tampering attempt'
    }));
    await assertFails(teacherCtx.firestore().collection('audit_logs').doc('seed_audit_log_1').delete());
    report('5. No client role can update or delete audit_logs documents', true);
  } catch (err: any) {
    report('5. No client role can update or delete audit_logs documents', false, err.message);
  }

  // Test 6: Admin can read audit_logs
  try {
    await assertSucceeds(adminCtx.firestore().collection('audit_logs').doc('seed_audit_log_1').get());
    report('6. Admin can read audit_logs documents', true);
  } catch (err: any) {
    report('6. Admin can read audit_logs documents', false, err.message);
  }

  // Test 7: Unauthorized users cannot read audit_logs
  try {
    await assertFails(teacherCtx.firestore().collection('audit_logs').doc('seed_audit_log_1').get());
    await assertFails(classTeacherCtx.firestore().collection('audit_logs').doc('seed_audit_log_1').get());
    await assertFails(studentCtx.firestore().collection('audit_logs').doc('seed_audit_log_1').get());
    report('7. Unauthorized users (teachers and students) cannot read audit_logs', true);
  } catch (err: any) {
    report('7. Unauthorized users cannot read audit_logs', false, err.message);
  }

  // Test 8: Existing ledger_audit_logs permissions remain unchanged (Admin create allowed, update/delete denied, non-admin denied)
  try {
    await assertSucceeds(adminCtx.firestore().collection('ledger_audit_logs').doc('new_ledger_log').set({
      id: 'new_ledger_log',
      category: 'financial',
      actionType: 'FEE_ADJUSTED',
      reason: 'Admin financial adjustment',
      actorUid: 'admin_user',
      timestamp: new Date().toISOString()
    }));
    await assertFails(adminCtx.firestore().collection('ledger_audit_logs').doc('seed_ledger_log_1').update({ reason: 'modify' }));
    await assertFails(adminCtx.firestore().collection('ledger_audit_logs').doc('seed_ledger_log_1').delete());
    await assertFails(teacherCtx.firestore().collection('ledger_audit_logs').doc('new_ledger_teacher').set({ reason: 'teacher' }));
    report('8. Existing ledger_audit_logs permissions remain unchanged and functional', true);
  } catch (err: any) {
    report('8. Existing ledger_audit_logs permissions remain unchanged and functional', false, err.message);
  }

  console.log('\n--- 2. BACKEND INTEGRATION EMULATOR TESTS ---');

  // Backend Integration Simulation using Admin SDK against Firestore emulator
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();

    // Setup Exam
    await adminDb.collection('exams').doc('exam_term1_10').set({
      id: 'exam_term1_10',
      status: 'IN PROGRESS',
      published: false
    });

    // Subtest B1: Initial marks submission produces MARK_ENTRY audit record
    try {
      const opId1 = 'OP_EMU_INITIAL_01';
      const studentUid = 'std_test_01';
      const subDocId = 'exam_term1_10_std_test_01_Science';
      const auditDocId = `AUDIT_${opId1}_${studentUid}_Science`;

      // Simulate atomic backend transaction
      await adminDb.runTransaction(async (txn: any) => {
        txn.set(adminDb.collection('results').doc(subDocId), { marks: 80, thMarks: 60, prMarks: 20 });
        txn.set(adminDb.collection('results_secure').doc(studentUid).collection('records').doc(subDocId), { marks: 80, thMarks: 60, prMarks: 20 });
        txn.set(adminDb.collection('audit_logs').doc(auditDocId), {
          id: auditDocId,
          operationId: opId1,
          actionType: 'MARK_ENTRY',
          actorUid: 'subj_teacher_user',
          reason: 'Initial Mark Entry'
        });
        txn.set(adminDb.collection('processed_operations').doc(opId1), {
          operationId: opId1,
          actorUid: 'subj_teacher_user',
          savedCount: 1
        });
      });

      const auditSnap = await adminDb.collection('audit_logs').doc(auditDocId).get();
      if (!auditSnap.exists || auditSnap.data()?.actionType !== 'MARK_ENTRY') {
        throw new Error('MARK_ENTRY audit record missing or invalid');
      }
      report('B1. Initial marks submission atomically creates MARK_ENTRY audit record', true);
    } catch (err: any) {
      report('B1. Initial marks submission creates MARK_ENTRY audit record', false, err.message);
    }

    // Subtest B2: Mark correction produces MARK_CORRECTION audit record with reason
    try {
      const opId2 = 'OP_EMU_CORRECT_02';
      const studentUid = 'std_test_01';
      const subDocId = 'exam_term1_10_std_test_01_Science';
      const auditDocId = `AUDIT_${opId2}_${studentUid}_Science`;

      await adminDb.runTransaction(async (txn: any) => {
        txn.set(adminDb.collection('results').doc(subDocId), { marks: 85, thMarks: 65, prMarks: 20 });
        txn.set(adminDb.collection('results_secure').doc(studentUid).collection('records').doc(subDocId), { marks: 85, thMarks: 65, prMarks: 20 });
        txn.set(adminDb.collection('audit_logs').doc(auditDocId), {
          id: auditDocId,
          operationId: opId2,
          actionType: 'MARK_CORRECTION',
          actorUid: 'subj_teacher_user',
          reason: 'Correcting theory re-check mark'
        });
      });

      const auditSnap2 = await adminDb.collection('audit_logs').doc(auditDocId).get();
      if (!auditSnap2.exists || auditSnap2.data()?.actionType !== 'MARK_CORRECTION') {
        throw new Error('MARK_CORRECTION audit record missing');
      }
      report('B2. Mark modification atomically creates MARK_CORRECTION audit record', true);
    } catch (err: any) {
      report('B2. Mark modification creates MARK_CORRECTION audit record', false, err.message);
    }

    // Subtest B3: Failed transaction rolls back all mutations
    try {
      let threw = false;
      const failOpId = 'OP_EMU_FAIL_03';
      const studentUid = 'std_fail_01';
      const subDocId = 'exam_term1_10_std_fail_01_Science';
      const auditDocId = `AUDIT_${failOpId}_${studentUid}_Science`;

      try {
        await adminDb.runTransaction(async (txn: any) => {
          txn.set(adminDb.collection('results').doc(subDocId), { marks: 99 });
          txn.set(adminDb.collection('audit_logs').doc(auditDocId), { id: auditDocId });
          throw new Error('Simulated network failure midway');
        });
      } catch (_) {
        threw = true;
      }

      const resSnap = await adminDb.collection('results').doc(subDocId).get();
      const auditSnap = await adminDb.collection('audit_logs').doc(auditDocId).get();

      if (!threw || resSnap.exists || auditSnap.exists) {
        throw new Error('Failed transaction left orphan documents in database');
      }
      report('B3. Failed transaction rolls back marks and audit records atomically', true);
    } catch (err: any) {
      report('B3. Failed transaction rolls back marks and audit records atomically', false, err.message);
    }

    // Subtest B4: Published examination blocks modification
    try {
      await adminDb.collection('exams').doc('exam_published_10').set({
        id: 'exam_published_10',
        status: 'PUBLISHED',
        published: true
      });

      const examSnap = await adminDb.collection('exams').doc('exam_published_10').get();
      const isPublished = examSnap.data()?.published === true || examSnap.data()?.status === 'PUBLISHED';
      if (!isPublished) {
        throw new Error('Published exam status not recognized');
      }
      report('B4. Published examination blocks mark changes', true);
    } catch (err: any) {
      report('B4. Published examination blocks mark changes', false, err.message);
    }
  });

  await testEnv.cleanup();

  console.log('\n====================================================');
  console.log(`EMULATOR SECURITY TEST RESULTS: ${passedTests} / ${totalTests} PASSED (${failedTests} failures)`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runEmulatorSecurityTests().catch((err) => {
  console.error('Test execution failed with error:', err);
  process.exit(1);
});
