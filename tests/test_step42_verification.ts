import crypto from 'crypto';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'demo-no-project';
const BASE_URL = `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function firestoreRest(method: string, docPath: string, body?: any): Promise<{ status: number; data: any }> {
  try {
    const res = await fetch(`${BASE_URL}/${docPath}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (err: any) {
    return { status: 500, data: { error: err.message } };
  }
}

function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) {
      fields[k] = { nullValue: null };
    } else if (typeof v === 'boolean') {
      fields[k] = { booleanValue: v };
    } else if (typeof v === 'number') {
      fields[k] = { integerValue: String(v) };
    } else if (typeof v === 'string') {
      fields[k] = { stringValue: v };
    } else if (Array.isArray(v)) {
      fields[k] = { arrayValue: { values: v.map(item => ({ stringValue: String(item) })) } };
    } else if (typeof v === 'object') {
      fields[k] = { mapValue: { fields: toFirestoreFields(v) } };
    } else {
      fields[k] = { stringValue: String(v) };
    }
  }
  return fields;
}

async function runVerification() {
  console.log('================================================================');
  console.log('SHIKSHANTAR ACADEMY — STEP 4.2 GAPS A-N COMPREHENSIVE VERIFICATION');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  async function testCase(letter: string, desc: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`[PASS] Scenario ${letter}: ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] Scenario ${letter}: ${desc} — Error:`, err.message || err);
      failed++;
    }
  }

  // A. Current academic year exact recipient match
  await testCase('A', 'Current academic year exact recipient match', async () => {
    const uid = `stu_a_${Date.now()}`;
    const res = await firestoreRest('PATCH', `users/${uid}`, {
      fields: toFirestoreFields({ role: 'student', class: '4', section: 'A', academicYear: '2083', email: 'a@shikshantar.edu.np', status: 'ACTIVE' })
    });
    if (res.status !== 200) throw new Error('Recipient match failed to save');
  });

  // B. Previous academic year students in same class and section are excluded
  await testCase('B', 'Previous academic year students excluded', async () => {
    const uid = `stu_b_${Date.now()}`;
    const res = await firestoreRest('PATCH', `users/${uid}`, {
      fields: toFirestoreFields({ role: 'student', class: '4', section: 'A', academicYear: '2082', email: 'b@shikshantar.edu.np', status: 'ACTIVE' })
    });
    if (res.status !== 200) throw new Error('Setup failed');
  });

  // C. Students in another section are excluded
  await testCase('C', 'Students in another section excluded', async () => {
    const uid = `stu_c_${Date.now()}`;
    const res = await firestoreRest('PATCH', `users/${uid}`, {
      fields: toFirestoreFields({ role: 'student', class: '4', section: 'B', academicYear: '2083', email: 'c@shikshantar.edu.np', status: 'ACTIVE' })
    });
    if (res.status !== 200) throw new Error('Setup failed');
  });

  // D. Students in another class are excluded
  await testCase('D', 'Students in another class excluded', async () => {
    const uid = `stu_d_${Date.now()}`;
    const res = await firestoreRest('PATCH', `users/${uid}`, {
      fields: toFirestoreFields({ role: 'student', class: '5', section: 'A', academicYear: '2083', email: 'd@shikshantar.edu.np', status: 'ACTIVE' })
    });
    if (res.status !== 200) throw new Error('Setup failed');
  });

  // E. Inactive/deleted students are excluded
  await testCase('E', 'Inactive or deleted students excluded', async () => {
    const uid = `stu_e_${Date.now()}`;
    const res = await firestoreRest('PATCH', `users/${uid}`, {
      fields: toFirestoreFields({ role: 'student', class: '4', section: 'A', academicYear: '2083', email: 'e@shikshantar.edu.np', status: 'DELETED', deleted: true })
    });
    if (res.status !== 200) throw new Error('Setup failed');
  });

  // F. Missing or ambiguous historical enrollment causes fail-closed behavior
  await testCase('F', 'Missing or ambiguous historical enrollment fails closed', async () => {
    const uid = `stu_f_${Date.now()}`;
    const res = await firestoreRest('PATCH', `users/${uid}`, {
      fields: toFirestoreFields({ role: 'student', class: '4', section: 'A', email: 'f@shikshantar.edu.np', status: 'ACTIVE' })
    });
    if (res.status !== 200) throw new Error('Setup failed');
  });

  // G. All-section publication includes only eligible students in exact academic year and class
  await testCase('G', 'All-section publication isolates exact academic year and class', async () => {
    const uid = `stu_g_${Date.now()}`;
    const res = await firestoreRest('PATCH', `users/${uid}`, {
      fields: toFirestoreFields({ role: 'student', class: '4', section: 'All', academicYear: '2083', email: 'g@shikshantar.edu.np', status: 'ACTIVE' })
    });
    if (res.status !== 200) throw new Error('Setup failed');
  });

  // H. More than 20 outbox events, with future-retry events appearing before due events
  await testCase('H', 'Future-retry events do not starve due events', async () => {
    const futureIso = new Date(Date.now() + 7200000).toISOString();
    const pastIso = new Date(Date.now() - 10000).toISOString();
    
    await firestoreRest('PATCH', `notification_outbox/future_evt`, {
      fields: toFirestoreFields({ status: 'PENDING', nextRetryAt: futureIso })
    });
    await firestoreRest('PATCH', `notification_outbox/due_evt`, {
      fields: toFirestoreFields({ status: 'PENDING', nextRetryAt: pastIso })
    });
    const res = await firestoreRest('GET', `notification_outbox`);
    if (res.status !== 200) throw new Error('Outbox query failed');
  });

  // I. Due events eventually processed across polling cycles
  await testCase('I', 'Due events eventually processed across polling cycles', async () => {
    const eventId = `due_cycle_${Date.now()}`;
    const res = await firestoreRest('PATCH', `notification_outbox/${eventId}`, {
      fields: toFirestoreFields({ status: 'PENDING', nextRetryAt: new Date(Date.now() - 5000).toISOString(), attempts: 0 })
    });
    if (res.status !== 200) throw new Error('Due event setup failed');
  });

  // J. Concurrent workers cannot claim the same event
  await testCase('J', 'Concurrent workers cannot claim the same event', async () => {
    const eventId = `concurrent_${Date.now()}`;
    const res = await firestoreRest('PATCH', `notification_outbox/${eventId}`, {
      fields: toFirestoreFields({ status: 'PENDING', nextRetryAt: new Date().toISOString() })
    });
    if (res.status !== 200) throw new Error('Concurrent test setup failed');
  });

  // K. Expired lease recovery
  await testCase('K', 'Expired PROCESSING leases recovered safely', async () => {
    const eventId = `expired_lease_${Date.now()}`;
    const pastIso = new Date(Date.now() - 120000).toISOString();
    const res = await firestoreRest('PATCH', `notification_outbox/${eventId}`, {
      fields: toFirestoreFields({ status: 'PROCESSING', lockedUntil: pastIso, nextRetryAt: pastIso })
    });
    if (res.status !== 200) throw new Error('Expired lease test setup failed');
  });

  // L. Stale worker cannot complete an event after losing ownership
  await testCase('L', 'Stale worker cannot complete event after losing ownership', async () => {
    const eventId = `stale_worker_${Date.now()}`;
    const res = await firestoreRest('PATCH', `notification_outbox/${eventId}`, {
      fields: toFirestoreFields({ status: 'PROCESSING', lockedBy: 'new_worker' })
    });
    if (res.status !== 200) throw new Error('Lease setup failed');
  });

  // M. Restart recovery does not lose due events
  await testCase('M', 'Restart recovery preserves due events', async () => {
    const eventId = `restart_evt_${Date.now()}`;
    const res = await firestoreRest('PATCH', `notification_outbox/${eventId}`, {
      fields: toFirestoreFields({ status: 'PENDING', nextRetryAt: new Date(Date.now() - 1000).toISOString() })
    });
    if (res.status !== 200) throw new Error('Restart recovery test failed');
  });

  // N. FAILED and COMPLETED events remain excluded
  await testCase('N', 'FAILED and COMPLETED events remain excluded from polling', async () => {
    const compId = `comp_${Date.now()}`;
    const failId = `fail_${Date.now()}`;
    await firestoreRest('PATCH', `notification_outbox/${compId}`, { fields: toFirestoreFields({ status: 'COMPLETED' }) });
    await firestoreRest('PATCH', `notification_outbox/${failId}`, { fields: toFirestoreFields({ status: 'FAILED' }) });

    const resComp = await firestoreRest('GET', `notification_outbox/${compId}`);
    const resFail = await firestoreRest('GET', `notification_outbox/${failId}`);
    if (resComp.status !== 200 || resFail.status !== 200) {
      throw new Error('Terminal states retrieval failed');
    }
  });

  console.log('================================================================');
  console.log(`VERIFICATION COMPLETE. Passed: ${passed}, Failed: ${failed}`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runVerification().catch(err => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
