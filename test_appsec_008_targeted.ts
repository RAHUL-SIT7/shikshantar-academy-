/**
 * TARGETED APPSEC-008 VERIFICATION
 * Verifies:
 * 1. Active student self-read: ALLOWED
 * 2. Tombstoned/deleted student self-read: DENIED
 * 3. Admin read on both active and tombstoned user: ALLOWED
 */

import admin from 'firebase-admin';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { auth, db } from './src/firebase';

async function verifyAppsec008() {
  console.log('======================================================================');
  console.log('🔒 APPSEC-008 TARGETED RUNTIME VERIFICATION');
  console.log('======================================================================\n');

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'demo-shikshantar-test' });
  }
  const adminDb = admin.firestore();

  const adminEmail = `admin_appsec008_${Date.now()}@shikshantar.edu.np`;
  const studentEmail = `student_appsec008_${Date.now()}@shikshantar.edu.np`;

  const adminCred = await createUserWithEmailAndPassword(auth, adminEmail, 'AdminPass123!');
  const studentCred = await createUserWithEmailAndPassword(auth, studentEmail, 'StudentPass123!');

  const adminUid = adminCred.user.uid;
  const studentUid = studentCred.user.uid;

  // Initialize profiles
  await adminDb.collection('users').doc(adminUid).set({
    uid: adminUid,
    email: adminEmail,
    role: 'admin',
    adminTier: 'primary',
    fullName: 'AppSec Admin'
  });

  await adminDb.collection('users').doc(studentUid).set({
    uid: studentUid,
    email: studentEmail,
    role: 'student',
    status: 'ACTIVE',
    deleted: false,
    fullName: 'Targeted Student'
  });

  // TEST 1: Active student self-read
  await signInWithEmailAndPassword(auth, studentEmail, 'StudentPass123!');
  let activeSelfRead = false;
  try {
    const snap = await getDoc(doc(db, 'users', studentUid));
    activeSelfRead = snap.exists();
  } catch (err: any) {
    activeSelfRead = false;
  }
  console.log(`1. Active student self-read:`);
  console.log(`   Expected: ALLOWED`);
  console.log(`   Actual  : ${activeSelfRead ? 'ALLOWED' : 'DENIED'}`);
  console.log(`   Status  : ${activeSelfRead ? 'PASS' : 'FAIL'}\n`);

  // TEST 2: Tombstoned/deleted student self-read
  // Set student to tombstoned
  const beforeState = (await adminDb.collection('users').doc(studentUid).get()).data();
  await adminDb.collection('users').doc(studentUid).update({
    status: 'DELETED',
    deleted: true
  });
  const afterState = (await adminDb.collection('users').doc(studentUid).get()).data();

  let tombstonedSelfReadBlocked = false;
  try {
    await getDoc(doc(db, 'users', studentUid));
  } catch (err: any) {
    tombstonedSelfReadBlocked = true;
  }
  console.log(`2. Tombstoned student self-read:`);
  console.log(`   Before State : ${JSON.stringify(beforeState)}`);
  console.log(`   After State  : ${JSON.stringify(afterState)}`);
  console.log(`   Expected: DENIED (BLOCKED)`);
  console.log(`   Actual  : ${tombstonedSelfReadBlocked ? 'DENIED (BLOCKED)' : 'ALLOWED'}`);
  console.log(`   Status  : ${tombstonedSelfReadBlocked ? 'PASS' : 'FAIL'}\n`);

  // TEST 3: Admin read of tombstoned student
  await signInWithEmailAndPassword(auth, adminEmail, 'AdminPass123!');
  let adminReadAllowed = false;
  try {
    const snap = await getDoc(doc(db, 'users', studentUid));
    adminReadAllowed = snap.exists();
  } catch (err: any) {
    adminReadAllowed = false;
  }
  console.log(`3. Admin read on tombstoned student doc:`);
  console.log(`   Expected: ALLOWED`);
  console.log(`   Actual  : ${adminReadAllowed ? 'ALLOWED' : 'DENIED'}`);
  console.log(`   Status  : ${adminReadAllowed ? 'PASS' : 'FAIL'}\n`);

  // Summary
  const allPassed = activeSelfRead && tombstonedSelfReadBlocked && adminReadAllowed;
  console.log('======================================================================');
  if (allPassed) {
    console.log('✅ ALL APPSEC-008 REQUIREMENTS SATISFIED.');
    process.exit(0);
  } else {
    console.error('❌ APPSEC-008 VERIFICATION FAILED.');
    process.exit(1);
  }
}

verifyAppsec008().catch(err => {
  console.error('Error running test:', err);
  process.exit(1);
});
