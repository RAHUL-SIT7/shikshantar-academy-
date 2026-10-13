/**
 * Dedicated Admin Email Bootstrap Security Verification Test
 * Tests the real Firestore security rules and client bootstrap path:
 * - Authorized configured admin email with no user doc creates primary admin profile
 * - Idempotency when profile already exists
 * - Normal student, teacher, or unrelated emails cannot bootstrap as Admin
 * - Direct client-side exploit attempts to become Admin are DENIED by Firestore rules
 */

process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9098';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';

import admin from 'firebase-admin';
import { signInWithCustomToken, signOut, connectAuthEmulator } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, connectFirestoreEmulator } from 'firebase/firestore';
import { auth as clientAuth, db as clientDb } from '../../src/firebase';

const projectId = 'demo-shikshantar-test';

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}
const adminDb = admin.firestore();
const adminAuth = admin.auth();

try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9098', { disableWarnings: true });
} catch {
  // Already connected
}

try {
  connectFirestoreEmulator(clientDb, '127.0.0.1', 8085);
} catch {
  // Already connected
}

async function runBootstrapSecurityTests() {
  console.log('======================================================================');
  console.log('PHASE 8: ADMIN EMAIL BOOTSTRAP SECURITY & AUTHORIZATION AUDIT');
  console.log('Target: Local Firebase Emulator (Firestore: 8085, Auth: 9098)');
  console.log('======================================================================\n');

  const runId = Date.now();
  let passCount = 0;
  let failCount = 0;

  function record(id: string, name: string, expected: string, actual: string, ok: boolean, evidence?: any) {
    if (ok) {
      passCount++;
      console.log(`[✅ PASS-RUNTIME] [${id}] ${name}`);
      console.log(`   Expected:   ${expected}`);
      console.log(`   Actual:     ${actual}`);
      if (evidence) console.log(`   Evidence:   ${JSON.stringify(evidence)}`);
    } else {
      failCount++;
      console.error(`[❌ FAIL-RUNTIME] [${id}] ${name}`);
      console.error(`   Expected:   ${expected}`);
      console.error(`   Actual:     ${actual}`);
      if (evidence) console.error(`   Evidence:   ${JSON.stringify(evidence)}`);
    }
    console.log('----------------------------------------------------------------------');
  }

  async function safeCreateUser(uid: string, email: string) {
    try { await adminAuth.deleteUser(uid); } catch {}
    try {
      const existing = await adminAuth.getUserByEmail(email);
      if (existing) await adminAuth.deleteUser(existing.uid);
    } catch {}
    return await adminAuth.createUser({ uid, email, emailVerified: true });
  }

  // SCENARIO A: Authorized configured admin email with NO users/{uid} document
  console.log('\n--- SCENARIO A: Authorized configured administrator email bootstrap ---');
  const adminUid = `admin_bootstrap_${runId}`;
  const authorizedEmail = 'rahulsah4534@gmail.com';

  // Ensure no prior doc exists in Firestore
  await adminDb.collection('users').doc(adminUid).delete();

  // Create real user in Auth emulator with authorized email
  await safeCreateUser(adminUid, authorizedEmail);

  // Create custom token for authorized email WITHOUT existing user doc
  const adminToken = await adminAuth.createCustomToken(adminUid);
  await signInWithCustomToken(clientAuth, adminToken);

  // Client bootstrap execution (as performed by UserApprovals self-heal / bootstrap)
  let aSucceeded = false;
  let aPersistedDoc: any = null;
  try {
    await setDoc(doc(clientDb, 'users', adminUid), {
      email: authorizedEmail,
      fullName: 'Rahul Sah',
      role: 'admin',
      adminTier: 'primary',
      status: 'approved',
      active: true,
      createdAt: new Date().toISOString()
    }, { merge: true });

    const snap = await adminDb.collection('users').doc(adminUid).get();
    aPersistedDoc = snap.data();
    aSucceeded = snap.exists && aPersistedDoc?.role === 'admin' && aPersistedDoc?.adminTier === 'primary';
  } catch (err: any) {
    console.error('Scenario A failed with error:', err.message);
  }

  record(
    'BOOTSTRAP-01',
    'Authorized configured admin email with no users/{uid} doc creates intended 1° Admin profile',
    'role = admin, adminTier = primary, doc exists',
    `exists=${!!aPersistedDoc}, role=${aPersistedDoc?.role}, adminTier=${aPersistedDoc?.adminTier}`,
    aSucceeded,
    aPersistedDoc
  );

  // SCENARIO B: Same authorized email after profile already exists (Idempotency)
  console.log('\n--- SCENARIO B: Existing authorized admin profile idempotency ---');
  let bIdempotent = false;
  let bDocAfter: any = null;
  try {
    // Attempt second write with merge
    await setDoc(doc(clientDb, 'users', adminUid), {
      fullName: 'Rahul Sah (Updated Name)',
      lastActive: new Date().toISOString()
    }, { merge: true });

    const snap = await adminDb.collection('users').doc(adminUid).get();
    bDocAfter = snap.data();
    bIdempotent = snap.exists && bDocAfter?.role === 'admin' && bDocAfter?.adminTier === 'primary';
  } catch (err: any) {
    console.error('Scenario B failed with error:', err.message);
  }

  record(
    'BOOTSTRAP-02',
    'Repeated bootstrap write preserves admin role and governance tier without reset',
    'role = admin, adminTier = primary, no privilege reset',
    `role=${bDocAfter?.role}, adminTier=${bDocAfter?.adminTier}`,
    bIdempotent,
    { email: bDocAfter?.email, role: bDocAfter?.role, adminTier: bDocAfter?.adminTier }
  );

  // SCENARIO C: Normal Student email with no user document MUST NOT become Admin
  console.log('\n--- SCENARIO C: Normal Student email with no user doc cannot bootstrap as Admin ---');
  const studentUid = `student_bootstrap_${runId}`;
  const studentEmail = 'student.normal@shikshantar.edu.np';
  await adminDb.collection('users').doc(studentUid).delete();
  await safeCreateUser(studentUid, studentEmail);

  const studentToken = await adminAuth.createCustomToken(studentUid);
  await signInWithCustomToken(clientAuth, studentToken);

  let cDenied = false;
  try {
    await setDoc(doc(clientDb, 'users', studentUid), {
      email: studentEmail,
      fullName: 'Malicious Student',
      role: 'admin',
      adminTier: 'primary'
    });
  } catch (err: any) {
    cDenied = err.code === 'permission-denied' || err.message.includes('permission-denied') || err.message.includes('PERMISSION_DENIED');
  }

  const studentSnap = await adminDb.collection('users').doc(studentUid).get();
  const cSafe = cDenied && !studentSnap.exists;

  record(
    'BOOTSTRAP-03',
    'Normal student email with no user document is DENIED from creating admin profile',
    'PERMISSION_DENIED, document does not exist',
    cDenied ? 'PERMISSION_DENIED (Rejected by Firestore Rules)' : 'Allowed (VULNERABILITY)',
    cSafe,
    { docExists: studentSnap.exists }
  );

  // SCENARIO D: Normal Teacher email with no user document MUST NOT become Admin
  console.log('\n--- SCENARIO D: Normal Teacher email with no user doc cannot bootstrap as Admin ---');
  const teacherUid = `teacher_bootstrap_${runId}`;
  const teacherEmail = 'teacher.math@shikshantar.edu.np';
  await adminDb.collection('users').doc(teacherUid).delete();
  await safeCreateUser(teacherUid, teacherEmail);

  const teacherToken = await adminAuth.createCustomToken(teacherUid);
  await signInWithCustomToken(clientAuth, teacherToken);

  let dDenied = false;
  try {
    await setDoc(doc(clientDb, 'users', teacherUid), {
      email: teacherEmail,
      fullName: 'Teacher Math',
      role: 'admin',
      adminTier: 'secondary'
    });
  } catch (err: any) {
    dDenied = err.code === 'permission-denied' || err.message.includes('permission-denied') || err.message.includes('PERMISSION_DENIED');
  }

  const teacherSnap = await adminDb.collection('users').doc(teacherUid).get();
  const dSafe = dDenied && !teacherSnap.exists;

  record(
    'BOOTSTRAP-04',
    'Normal teacher email with no user document is DENIED from creating admin profile',
    'PERMISSION_DENIED, document does not exist',
    dDenied ? 'PERMISSION_DENIED (Rejected by Firestore Rules)' : 'Allowed (VULNERABILITY)',
    dSafe,
    { docExists: teacherSnap.exists }
  );

  // SCENARIO E: Unrelated authenticated email MUST NOT become Admin
  console.log('\n--- SCENARIO E: Unrelated authenticated email cannot bootstrap as Admin ---');
  const unrelatedUid = `unrelated_user_${runId}`;
  const unrelatedEmail = 'attacker1337@gmail.com';
  await adminDb.collection('users').doc(unrelatedUid).delete();
  await safeCreateUser(unrelatedUid, unrelatedEmail);

  const unrelatedToken = await adminAuth.createCustomToken(unrelatedUid);
  await signInWithCustomToken(clientAuth, unrelatedToken);

  let eDenied = false;
  try {
    await setDoc(doc(clientDb, 'users', unrelatedUid), {
      email: unrelatedEmail,
      fullName: 'Rogue User',
      role: 'admin',
      adminTier: 'primary'
    });
  } catch (err: any) {
    eDenied = err.code === 'permission-denied' || err.message.includes('permission-denied') || err.message.includes('PERMISSION_DENIED');
  }

  const unrelatedSnap = await adminDb.collection('users').doc(unrelatedUid).get();
  const eSafe = eDenied && !unrelatedSnap.exists;

  record(
    'BOOTSTRAP-05',
    'Unrelated authenticated email is DENIED from bootstrapping as Admin',
    'PERMISSION_DENIED, document does not exist',
    eDenied ? 'PERMISSION_DENIED (Rejected by Firestore Rules)' : 'Allowed (VULNERABILITY)',
    eSafe,
    { docExists: unrelatedSnap.exists }
  );

  // SCENARIO F: Attacker attempts client-side write to make arbitrary email Admin
  console.log('\n--- SCENARIO F: Attacker attempts client-side write to make arbitrary email Admin ---');
  // Signed in as unrelated user
  let fDenied = false;
  try {
    await setDoc(doc(clientDb, 'users', `arbitrary_victim_${runId}`), {
      email: 'innocent.victim@shikshantar.edu.np',
      role: 'admin',
      adminTier: 'primary'
    });
  } catch (err: any) {
    fDenied = err.code === 'permission-denied' || err.message.includes('permission-denied') || err.message.includes('PERMISSION_DENIED');
  }

  record(
    'BOOTSTRAP-06',
    'Attacker attempting client-side write to create another user as Admin is DENIED',
    'PERMISSION_DENIED',
    fDenied ? 'PERMISSION_DENIED (Strict UID Ownership & Admin Guard)' : 'Allowed (VULNERABILITY)',
    fDenied
  );

  // SCENARIO G: Attacker attempts to exploit authorized email string in document payload
  console.log('\n--- SCENARIO G: Attacker attempts to exploit authorized email string in document payload ---');
  // Attacker signs in with attacker UID (email attacker1337@gmail.com) but sets email = 'rahulsah4534@gmail.com' in the request payload
  let gDenied = false;
  try {
    await setDoc(doc(clientDb, 'users', unrelatedUid), {
      email: 'rahulsah4534@gmail.com', // Spoofed email in document body
      role: 'admin',
      adminTier: 'primary'
    });
  } catch (err: any) {
    // Firestore rules check request.auth.token.email, NOT request.resource.data.email
    gDenied = err.code === 'permission-denied' || err.message.includes('permission-denied') || err.message.includes('PERMISSION_DENIED');
  }

  const spoofSnap = await adminDb.collection('users').doc(unrelatedUid).get();
  const gSafe = gDenied && !spoofSnap.exists;

  record(
    'BOOTSTRAP-07',
    'Attacker attempting to spoof authorized email in document body is DENIED by token.email check',
    'PERMISSION_DENIED, token.email checked authoritatively',
    gDenied ? 'PERMISSION_DENIED (Authoritative Auth Token Checked)' : 'Allowed (VULNERABILITY)',
    gSafe,
    { docCreated: spoofSnap.exists }
  );

  // Clean up
  await signOut(clientAuth);

  console.log('\n======================================================================');
  console.log('📊 ADMIN BOOTSTRAP SECURITY TEST SUMMARY');
  console.log('======================================================================');
  console.log(`TOTAL SCENARIOS EXECUTED: ${passCount + failCount}`);
  console.log(`PASS-RUNTIME:             ${passCount}`);
  console.log(`FAIL:                     ${failCount}`);
  console.log(`PASS RATE:                ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);
  console.log('======================================================================');

  if (failCount > 0) {
    console.error('❌ ADMIN BOOTSTRAP SECURITY DEFECTS DETECTED.');
    process.exit(1);
  } else {
    console.log('✅ ALL ADMIN BOOTSTRAP SECURITY SCENARIOS PASSED WITH ZERO DEFECTS.');
    process.exit(0);
  }
}

runBootstrapSecurityTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
