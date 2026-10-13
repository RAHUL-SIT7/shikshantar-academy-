import { 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { 
  recordTest, 
  adminDb, 
  createClientContext, 
  TestClientContext 
} from './framework';

export async function runPartETests(): Promise<void> {
  console.log('\n======================================================================');
  console.log('PART E: AUDIT LOG IMMUTABILITY & AUTHENTICITY');
  console.log('======================================================================\n');

  const student = await createClientContext({ role: 'student', emailPrefix: 'aud_std' });
  const teacher = await createClientContext({ role: 'teacher', emailPrefix: 'aud_tch' });
  const secAdmin = await createClientContext({ role: 'admin', adminTier: 'secondary', emailPrefix: 'aud_sec_adm' });
  const primAdmin = await createClientContext({ role: 'admin', adminTier: 'primary', emailPrefix: 'aud_prim_adm' });

  // 1. Student attempts direct audit log create
  try {
    let denied = false;
    try {
      await setDoc(doc(student.db, 'ledger_audit_logs', `fake_log_${Date.now()}`), {
        actionType: 'PAYMENT_ENTRY',
        adminUid: student.uid,
        amount: 1000,
      });
    } catch {
      denied = true;
    }
    recordTest({
      id: 'AUDIT-01',
      category: 'AUDIT LOG IMMUTABILITY',
      scenario: 'Student attempts direct creation of audit log',
      command: 'setDoc(ledger_audit_logs/id, { ... })',
      input: { caller: 'student' },
      operation: 'Direct audit log creation by student',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (LOG FABRICATION)',
      difference: denied ? 'None (Matched)' : 'Student created audit log',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'AUDIT-01', category: 'AUDIT LOG IMMUTABILITY', scenario: 'Student create audit', command: 'setDoc', input: {}, operation: 'Create', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 2. Direct audit log update rejected even for Admin (allow update: if false)
  try {
    const existingLogId = 'log_existing_audit_test';
    await adminDb.collection('ledger_audit_logs').doc(existingLogId).set({
      actionType: 'MANUAL_OVERRIDE',
      adminUid: primAdmin.uid,
      actorRole: 'admin',
      adminTier: 'primary',
      targetId: 'target_001',
      date: '2026-10-11',
    });

    let denied = false;
    try {
      await updateDoc(doc(primAdmin.db, 'ledger_audit_logs', existingLogId), {
        actionType: 'TAMPERED_ACTION',
      });
    } catch {
      denied = true;
    }
    recordTest({
      id: 'AUDIT-02',
      category: 'AUDIT LOG IMMUTABILITY',
      scenario: 'Direct audit log update rejected even for Primary Admin',
      command: 'updateDoc(ledger_audit_logs/existingId, { actionType: "TAMPERED" })',
      input: { caller: 'primary_admin', target: existingLogId },
      operation: 'Audit log mutation attempt',
      expected: 'DENIED with permission-denied (allow update: if false)',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (AUDIT TAMPERING)',
      difference: denied ? 'None (Matched)' : 'Audit log mutated',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'AUDIT-02', category: 'AUDIT LOG IMMUTABILITY', scenario: 'Admin update audit', command: 'updateDoc', input: {}, operation: 'Update', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 3. Direct audit log delete rejected even for Admin (allow delete: if false)
  try {
    const existingLogId = 'log_existing_audit_test_del';
    await adminDb.collection('ledger_audit_logs').doc(existingLogId).set({
      actionType: 'MANUAL_OVERRIDE',
      adminUid: primAdmin.uid,
      actorRole: 'admin',
      adminTier: 'primary',
      targetId: 'target_002',
      date: '2026-10-11',
    });

    let denied = false;
    try {
      await deleteDoc(doc(primAdmin.db, 'ledger_audit_logs', existingLogId));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'AUDIT-03',
      category: 'AUDIT LOG IMMUTABILITY',
      scenario: 'Direct audit log deletion rejected even for Primary Admin',
      command: 'deleteDoc(ledger_audit_logs/existingId)',
      input: { caller: 'primary_admin', target: existingLogId },
      operation: 'Audit log deletion attempt',
      expected: 'DENIED with permission-denied (allow delete: if false)',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (AUDIT ERASURE)',
      difference: denied ? 'None (Matched)' : 'Audit log deleted',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'AUDIT-03', category: 'AUDIT LOG IMMUTABILITY', scenario: 'Admin delete audit', command: 'deleteDoc', input: {}, operation: 'Delete', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 4. Fake actor UID rejected by isValidAuditActor() rule
  try {
    let denied = false;
    try {
      await setDoc(doc(secAdmin.db, 'ledger_audit_logs', `fake_actor_${Date.now()}`), {
        actionType: 'MANUAL_OVERRIDE',
        adminUid: 'spoofed_super_admin_uid', // Malicious: caller is secAdmin.uid, but claims someone else
        actorRole: 'admin',
        adminTier: 'secondary',
        targetId: 'target_003',
      });
    } catch {
      denied = true;
    }
    recordTest({
      id: 'AUDIT-04',
      category: 'AUDIT LOG IMMUTABILITY',
      scenario: 'Audit record with fake spoofed actorUid rejected by rules',
      command: 'setDoc(ledger_audit_logs/id, { adminUid: "spoofed_uid" })',
      input: { caller: secAdmin.uid, spoofedAdminUid: 'spoofed_super_admin_uid' },
      operation: 'Actor identity spoofing in audit trail',
      expected: 'DENIED with permission-denied (isValidAuditActor constraint)',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (SPOOFING SUCCESS)',
      difference: denied ? 'None (Matched)' : 'Fake actor UID accepted in audit log',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'AUDIT-04', category: 'AUDIT LOG IMMUTABILITY', scenario: 'Spoof actor UID', command: 'setDoc', input: {}, operation: 'Spoof', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 5. Fake admin tier rejected by isValidAuditActor() rule
  try {
    let denied = false;
    try {
      await setDoc(doc(secAdmin.db, 'ledger_audit_logs', `fake_tier_${Date.now()}`), {
        actionType: 'MANUAL_OVERRIDE',
        adminUid: secAdmin.uid,
        actorRole: 'admin',
        adminTier: 'primary', // Malicious: secAdmin is secondary, claims primary
        targetId: 'target_004',
      });
    } catch {
      denied = true;
    }
    recordTest({
      id: 'AUDIT-05',
      category: 'AUDIT LOG IMMUTABILITY',
      scenario: 'Secondary Admin fabricating primary adminTier in audit log rejected',
      command: 'setDoc(ledger_audit_logs/id, { adminTier: "primary" })',
      input: { caller: secAdmin.uid, callerTier: 'secondary', spoofedTier: 'primary' },
      operation: 'Governance tier spoofing in audit log',
      expected: 'DENIED with permission-denied (isValidAuditActor constraint)',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (TIER SPOOFING)',
      difference: denied ? 'None (Matched)' : 'Fabricated tier accepted in audit log',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'AUDIT-05', category: 'AUDIT LOG IMMUTABILITY', scenario: 'Spoof admin tier in audit', command: 'setDoc', input: {}, operation: 'Spoof', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 6. Fake target / uncommitted financial operation rejected by isValidAuditTarget()
  try {
    let denied = false;
    try {
      await setDoc(doc(primAdmin.db, 'ledger_audit_logs', `fake_target_${Date.now()}`), {
        actionType: 'BILL_GENERATED',
        adminUid: primAdmin.uid,
        actorRole: 'admin',
        adminTier: 'primary',
        targetId: 'nonexistent_bill_999999', // Bill does not exist!
      });
    } catch {
      denied = true;
    }
    recordTest({
      id: 'AUDIT-06',
      category: 'AUDIT LOG IMMUTABILITY',
      scenario: 'Fabricated audit log without real target state transition rejected',
      command: 'setDoc(ledger_audit_logs/id, { actionType: "BILL_GENERATED", targetId: "nonexistent" })',
      input: { actionType: 'BILL_GENERATED', targetId: 'nonexistent_bill' },
      operation: 'Ghost audit log creation without corresponding document transition',
      expected: 'DENIED with permission-denied (isValidAuditTarget constraint)',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (PHANTOM AUDIT)',
      difference: denied ? 'None (Matched)' : 'Phantom audit log accepted',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'AUDIT-06', category: 'AUDIT LOG IMMUTABILITY', scenario: 'Phantom audit log', command: 'setDoc', input: {}, operation: 'Create', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }
}
