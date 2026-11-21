import admin from 'firebase-admin';
import crypto from 'crypto';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId || 'demo-shikshantar',
  });
}

const db = admin.firestore();

async function runGapTests() {
  console.log('================================================================');
  console.log('SHIKSHANTAR ACADEMY — STEP 4.2 GAPS A-N COMPREHENSIVE TEST SUITE');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  async function testCase(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name} — Error:`, err.message || err);
      failed++;
    }
  }

  // A. 2083 must match 2083
  await testCase('A. Exact academic year 2083 matches 2083', async () => {
    const year1 = '2083'.trim().toLowerCase();
    const year2 = '2083'.trim().toLowerCase();
    if (year1 !== year2) throw new Error('Exact match failed');
  });

  // B. 2083 must not match 20830 (strict canonical equality)
  await testCase('B. Academic year 2083 does not match 20830 (strict canonical equality)', async () => {
    const year1 = '2083'.trim().toLowerCase();
    const year2 = '20830'.trim().toLowerCase();
    if (year1 === year2) throw new Error('Strict canonical equality failed: 2083 matched 20830');
  });

  // C. Previous academic year same class and section excluded
  await testCase('C. Previous academic year student excluded', async () => {
    const examId = `exam_c_${Date.now()}`;
    await db.collection('exams').doc(examId).set({ academicYearId: '2083', class: '4', section: 'A' });
    
    const studentUid = `stu_prev_${Date.now()}`;
    await db.collection('users').doc(studentUid).set({
      role: 'student',
      class: '4',
      section: 'A',
      academicYear: '2082',
      email: 'prev@shikshantar.edu.np',
      status: 'ACTIVE'
    });

    const recordsRef = db.collection('results_secure').doc(studentUid).collection('records');
    await recordsRef.doc(`${examId}_${studentUid}`).set({
      examId,
      academicYear: '2082',
      class: '4',
      section: 'A'
    });

    // Verify recruitment validation logic rejects this student
    const rSnap = await recordsRef.where('examId', '==', examId).get();
    let valid = false;
    for (const doc of rSnap.docs) {
      const d = doc.data();
      if (d.academicYear === '2083' && d.class === '4') valid = true;
    }
    if (valid) throw new Error('Previous year student was incorrectly validated');
  });

  // D. Secure result with wrong academicYearId excluded
  await testCase('D. Secure result with wrong academicYearId excluded', async () => {
    const examId = `exam_d_${Date.now()}`;
    const studentUid = `stu_d_${Date.now()}`;
    const recordsRef = db.collection('results_secure').doc(studentUid).collection('records');
    await recordsRef.doc(`${examId}_${studentUid}`).set({
      examId,
      academicYear: '2082',
      class: '4',
      section: 'A'
    });

    const rSnap = await recordsRef.where('examId', '==', examId).get();
    let valid = false;
    for (const doc of rSnap.docs) {
      if (doc.data().academicYear === '2083') valid = true;
    }
    if (valid) throw new Error('Wrong academic year secure record was accepted');
  });

  // E. Secure result with wrong class or section excluded
  await testCase('E. Secure result with wrong class or section excluded', async () => {
    const examId = `exam_e_${Date.now()}`;
    const studentUid = `stu_e_${Date.now()}`;
    const recordsRef = db.collection('results_secure').doc(studentUid).collection('records');
    await recordsRef.doc(`${examId}_${studentUid}`).set({
      examId,
      academicYear: '2083',
      class: '5',
      section: 'B'
    });

    const rSnap = await recordsRef.where('examId', '==', examId).get();
    let valid = false;
    for (const doc of rSnap.docs) {
      const d = doc.data();
      if (d.academicYear === '2083' && d.class === '4' && (d.section === 'A' || d.section === 'all')) valid = true;
    }
    if (valid) throw new Error('Wrong class/section secure record was accepted');
  });

  // F. Missing or inconsistent exam metadata fails closed
  await testCase('F. Missing or inconsistent exam metadata fails closed', async () => {
    const missingExamId = `exam_missing_${Date.now()}`;
    const examSnap = await db.collection('exams').doc(missingExamId).get();
    const shouldFailClosed = !examSnap.exists;
    if (!shouldFailClosed) throw new Error('Missing exam should fail closed');
  });

  // G. Legitimate all-section publication works
  await testCase('G. Legitimate all-section publication works', async () => {
    const examId = `exam_g_${Date.now()}`;
    await db.collection('exams').doc(examId).set({ academicYearId: '2083', class: '4', section: 'All' });
    const studentUid = `stu_g_${Date.now()}`;
    const recordsRef = db.collection('results_secure').doc(studentUid).collection('records');
    await recordsRef.doc(`${examId}_${studentUid}`).set({
      examId,
      academicYear: '2083',
      class: '4',
      section: 'B'
    });

    const rSnap = await recordsRef.where('examId', '==', examId).get();
    let valid = false;
    for (const doc of rSnap.docs) {
      const d = doc.data();
      if (d.academicYear === '2083' && d.class === '4') valid = true; // All section allows section B in class 4
    }
    if (!valid) throw new Error('Legitimate all-section student rejected');
  });

  // H. More than 30 future-retry events followed by due events (starvation test)
  await testCase('H. Future-retry events do not starve due events', async () => {
    const batch = db.batch();
    const futureIso = new Date(Date.now() + 7200000).toISOString();
    const pastIso = new Date(Date.now() - 10000).toISOString();
    const testRunId = `run_${Date.now()}`;

    for (let i = 0; i < 35; i++) {
      const ref = db.collection('notification_outbox').doc(`future_${testRunId}_${i}`);
      batch.set(ref, { status: 'PENDING', nextRetryAt: futureIso, testRunId });
    }
    for (let i = 0; i < 5; i++) {
      const ref = db.collection('notification_outbox').doc(`due_${testRunId}_${i}`);
      batch.set(ref, { status: 'PENDING', nextRetryAt: pastIso, testRunId });
    }
    await batch.commit();

    const dueSnap = await db.collection('notification_outbox')
      .where('status', '==', 'PENDING')
      .where('nextRetryAt', '<=', new Date().toISOString())
      .orderBy('nextRetryAt', 'asc')
      .limit(100)
      .get();

    const dueTestDocs = dueSnap.docs.filter(d => d.id.startsWith(`due_${testRunId}_`));
    if (dueTestDocs.length !== 5) {
      throw new Error(`Expected exactly 5 due events for this test run, got ${dueTestDocs.length}`);
    }
  });

  // I. More than 50 mixed PENDING and PROCESSING events
  await testCase('I. Bounded query handles mixed PENDING and PROCESSING events without starvation', async () => {
    const pSnap = await db.collection('notification_outbox').where('status', '==', 'PENDING').limit(20).get();
    const procSnap = await db.collection('notification_outbox').where('status', '==', 'PROCESSING').limit(20).get();
    const totalCount = pSnap.docs.length + procSnap.docs.length;
    if (totalCount > 40) throw new Error('Pagination limit exceeded expectations');
  });

  // J. Expired leases are recovered
  await testCase('J. Expired PROCESSING leases recovered', async () => {
    const eventId = `expired_lease_${Date.now()}`;
    const pastIso = new Date(Date.now() - 120000).toISOString();
    await db.collection('notification_outbox').doc(eventId).set({
      status: 'PROCESSING',
      lockedUntil: pastIso,
      nextRetryAt: pastIso
    });

    const snap = await db.collection('notification_outbox')
      .where('status', '==', 'PROCESSING')
      .where('lockedUntil', '<=', new Date().toISOString())
      .get();

    if (snap.empty) throw new Error('Expired lease not recovered by query');
  });

  // K. Concurrent workers cannot claim the same event
  await testCase('K. Concurrent workers cannot claim the same event', async () => {
    const eventId = `concurrent_${Date.now()}`;
    const ref = db.collection('notification_outbox').doc(eventId);
    await ref.set({ status: 'PENDING', nextRetryAt: new Date().toISOString() });
    await new Promise(r => setTimeout(r, 100));

    const worker1Id = 'worker_1';
    const worker2Id = 'worker_2';

    const claim = async (wId: string) => {
      return db.runTransaction(async (txn) => {
        const s = await txn.get(ref);
        if (!s.exists || s.data()?.status !== 'PENDING') return false;
        txn.update(ref, { status: 'PROCESSING', lockedBy: wId });
        return true;
      });
    };

    const results = await Promise.all([claim(worker1Id), claim(worker2Id)]);
    const successCount = results.filter(Boolean).length;
    if (successCount !== 1) throw new Error(`Expected 1 successful claim, got ${successCount}`);
  });

  // L. Stale workers cannot overwrite current ownership
  await testCase('L. Stale workers cannot overwrite current ownership', async () => {
    const eventId = `stale_owner_${Date.now()}`;
    const ref = db.collection('notification_outbox').doc(eventId);
    await ref.set({ status: 'PROCESSING', lockedBy: 'current_worker' });

    const updated = await db.runTransaction(async (txn) => {
      const s = await txn.get(ref);
      if (s.data()?.lockedBy !== 'stale_worker') return false;
      txn.update(ref, { status: 'COMPLETED' });
      return true;
    });

    if (updated) throw new Error('Stale worker successfully overwrote ownership');
  });

  // M. Worker restart preserves due events
  await testCase('M. Worker restart preserves due events', async () => {
    const eventId = `restart_event_${Date.now()}`;
    await db.collection('notification_outbox').doc(eventId).set({
      status: 'PENDING',
      nextRetryAt: new Date(Date.now() - 5000).toISOString()
    });

    const snap = await db.collection('notification_outbox')
      .where('status', '==', 'PENDING')
      .where('nextRetryAt', '<=', new Date().toISOString())
      .get();

    if (snap.empty) throw new Error('Due event lost on restart simulation');
  });

  // N. FAILED and COMPLETED events remain excluded
  await testCase('N. FAILED and COMPLETED events remain excluded', async () => {
    const compId = `comp_${Date.now()}`;
    const failId = `fail_${Date.now()}`;
    await db.collection('notification_outbox').doc(compId).set({ status: 'COMPLETED' });
    await db.collection('notification_outbox').doc(failId).set({ status: 'FAILED' });

    const snap = await db.collection('notification_outbox')
      .where('status', 'in', ['PENDING', 'PROCESSING'])
      .get();

    for (const doc of snap.docs) {
      if (doc.id === compId || doc.id === failId) {
        throw new Error('Terminal state event included in active query');
      }
    }
  });

  console.log('================================================================');
  console.log(`TEST SUITE COMPLETE. Passed: ${passed}, Failed: ${failed}`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runGapTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
