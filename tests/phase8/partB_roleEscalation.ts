import { 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc,
  collection,
  getDocs
} from 'firebase/firestore';
import { 
  recordTest, 
  adminDb, 
  createClientContext, 
  TestClientContext 
} from './framework';

export async function runPartBTests(): Promise<void> {
  console.log('\n======================================================================');
  console.log('PART B: ROLE ESCALATION TESTING (REAL FIRESTORE SECURITY RULES)');
  console.log('======================================================================\n');

  // Setup subjects
  const studentA = await createClientContext({ role: 'student', emailPrefix: 'std_esc_a' });
  const studentB = await createClientContext({ role: 'student', emailPrefix: 'std_esc_b' });
  const teacher = await createClientContext({ role: 'teacher', emailPrefix: 'tch_esc' });
  const secAdmin = await createClientContext({ role: 'admin', adminTier: 'secondary', emailPrefix: 'sec_adm_esc' });
  const primAdmin = await createClientContext({ role: 'admin', adminTier: 'primary', emailPrefix: 'prim_adm_esc' });

  // 1. Student attempts to write own role = ADMIN
  try {
    let denied = false;
    let errCode = '';
    try {
      await updateDoc(doc(studentA.db, 'users', studentA.uid), { role: 'admin' });
    } catch (err: any) {
      denied = true;
      errCode = err.code || err.message;
    }
    const passed = denied && errCode.includes('permission-denied');
    recordTest({
      id: 'ROLES-01',
      category: 'ROLE ESCALATION',
      scenario: 'Student attempts to write own role = ADMIN',
      command: 'updateDoc(users/studentUid, { role: "admin" })',
      input: { caller: 'student', targetField: 'role', value: 'admin' },
      operation: 'Direct Firestore client write to role field',
      expected: 'DENIED with permission-denied',
      actual: denied ? `DENIED (${errCode})` : 'ALLOWED (SECURITY VULNERABILITY)',
      difference: passed ? 'None (Matched)' : 'Privilege escalation permitted',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errCode,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'ROLES-01',
      category: 'ROLE ESCALATION',
      scenario: 'Student write own role = ADMIN',
      command: 'updateDoc',
      input: {},
      operation: 'Escalate role',
      expected: 'DENIED',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // 2. Student attempts to write own tier = PRIMARY
  try {
    let denied = false;
    let errCode = '';
    try {
      await updateDoc(doc(studentA.db, 'users', studentA.uid), { adminTier: 'primary' });
    } catch (err: any) {
      denied = true;
      errCode = err.code || err.message;
    }
    const passed = denied && errCode.includes('permission-denied');
    recordTest({
      id: 'ROLES-02',
      category: 'ROLE ESCALATION',
      scenario: 'Student attempts to write own tier = PRIMARY',
      command: 'updateDoc(users/studentUid, { adminTier: "primary" })',
      input: { caller: 'student', targetField: 'adminTier', value: 'primary' },
      operation: 'Direct Firestore client write to adminTier field',
      expected: 'DENIED with permission-denied',
      actual: denied ? `DENIED (${errCode})` : 'ALLOWED (SECURITY VULNERABILITY)',
      difference: passed ? 'None (Matched)' : 'Tier escalation permitted',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errCode,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'ROLES-02',
      category: 'ROLE ESCALATION',
      scenario: 'Student write own tier = PRIMARY',
      command: 'updateDoc',
      input: {},
      operation: 'Escalate tier',
      expected: 'DENIED',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // 3. Student attempts to write own fee fields (advanceBalance, previousYearDue)
  try {
    let advanceDenied = false;
    let dueDenied = false;
    try {
      await updateDoc(doc(studentA.db, 'users', studentA.uid), { advanceBalance: 10000 });
    } catch {
      advanceDenied = true;
    }
    try {
      await updateDoc(doc(studentA.db, 'users', studentA.uid), { previousYearDue: 0 });
    } catch {
      dueDenied = true;
    }
    const passed = advanceDenied && dueDenied;
    recordTest({
      id: 'ROLES-03',
      category: 'ROLE ESCALATION',
      scenario: 'Student attempts to write own advanceBalance & previousYearDue',
      command: 'updateDoc(users/studentUid, { advanceBalance: 10000, previousYearDue: 0 })',
      input: { advanceBalance: 10000, previousYearDue: 0 },
      operation: 'Direct Firestore client tampering with student financial balances',
      expected: 'DENIED with permission-denied',
      actual: `advanceDenied=${advanceDenied}, dueDenied=${dueDenied}`,
      difference: passed ? 'None (Matched)' : 'Financial balance write allowed',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `advanceDenied=${advanceDenied}, dueDenied=${dueDenied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'ROLES-03',
      category: 'ROLE ESCALATION',
      scenario: 'Student write own fee fields',
      command: 'updateDoc',
      input: {},
      operation: 'Tamper fees',
      expected: 'DENIED',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // 4. Student attempts to write another student's user document
  try {
    let denied = false;
    let errCode = '';
    try {
      await updateDoc(doc(studentA.db, 'users', studentB.uid), { name: 'Hacked Name' });
    } catch (err: any) {
      denied = true;
      errCode = err.code || err.message;
    }
    const passed = denied && errCode.includes('permission-denied');
    recordTest({
      id: 'ROLES-04',
      category: 'ROLE ESCALATION',
      scenario: 'Student A attempts to write Student B user document (IDOR)',
      command: 'updateDoc(users/studentB.uid, { name: "Hacked" })',
      input: { caller: studentA.uid, targetDoc: studentB.uid },
      operation: 'Cross-user profile document update',
      expected: 'DENIED with permission-denied',
      actual: denied ? `DENIED (${errCode})` : 'ALLOWED (SECURITY VULNERABILITY)',
      difference: passed ? 'None (Matched)' : 'Cross-user write permitted',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errCode,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'ROLES-04',
      category: 'ROLE ESCALATION',
      scenario: 'Student write another student doc',
      command: 'updateDoc',
      input: {},
      operation: 'Cross user write',
      expected: 'DENIED',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // 5. Student attempts to grant another user admin role
  try {
    let denied = false;
    let errCode = '';
    try {
      await updateDoc(doc(studentA.db, 'users', studentB.uid), { role: 'admin' });
    } catch (err: any) {
      denied = true;
      errCode = err.code || err.message;
    }
    const passed = denied && errCode.includes('permission-denied');
    recordTest({
      id: 'ROLES-05',
      category: 'ROLE ESCALATION',
      scenario: 'Student attempts to grant Admin role to another user',
      command: 'updateDoc(users/studentB.uid, { role: "admin" })',
      input: { caller: studentA.uid, target: studentB.uid, role: 'admin' },
      operation: 'Unauthorized role delegation',
      expected: 'DENIED with permission-denied',
      actual: denied ? `DENIED (${errCode})` : 'ALLOWED (SECURITY VULNERABILITY)',
      difference: passed ? 'None (Matched)' : 'Unauthorized role grant permitted',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errCode,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'ROLES-05',
      category: 'ROLE ESCALATION',
      scenario: 'Student grant another admin',
      command: 'updateDoc',
      input: {},
      operation: 'Grant admin',
      expected: 'DENIED',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // 6. Student attempts to access admin audit logs
  try {
    let denied = false;
    let errCode = '';
    try {
      await getDocs(collection(studentA.db, 'ledger_audit_logs'));
    } catch (err: any) {
      denied = true;
      errCode = err.code || err.message;
    }
    const passed = denied && errCode.includes('permission-denied');
    recordTest({
      id: 'ROLES-06',
      category: 'ROLE ESCALATION',
      scenario: 'Student attempts to read institutional ledger audit logs',
      command: 'getDocs(collection("ledger_audit_logs"))',
      input: { caller: 'student' },
      operation: 'Direct Firestore query of ledger_audit_logs',
      expected: 'DENIED with permission-denied',
      actual: denied ? `DENIED (${errCode})` : 'ALLOWED (SECURITY VULNERABILITY)',
      difference: passed ? 'None (Matched)' : 'Audit logs readable by student',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errCode,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'ROLES-06',
      category: 'ROLE ESCALATION',
      scenario: 'Student read audit logs',
      command: 'getDocs',
      input: {},
      operation: 'Read audit',
      expected: 'DENIED',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // 7. Student attempts to delete another user
  try {
    let denied = false;
    let errCode = '';
    try {
      await deleteDoc(doc(studentA.db, 'users', studentB.uid));
    } catch (err: any) {
      denied = true;
      errCode = err.code || err.message;
    }
    const passed = denied && errCode.includes('permission-denied');
    recordTest({
      id: 'ROLES-07',
      category: 'ROLE ESCALATION',
      scenario: 'Student attempts to delete user document',
      command: 'deleteDoc(users/studentB.uid)',
      input: { caller: studentA.uid, target: studentB.uid },
      operation: 'Direct Firestore document deletion',
      expected: 'DENIED with permission-denied',
      actual: denied ? `DENIED (${errCode})` : 'ALLOWED (SECURITY VULNERABILITY)',
      difference: passed ? 'None (Matched)' : 'User deletion permitted by student',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errCode,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'ROLES-07',
      category: 'ROLE ESCALATION',
      scenario: 'Student delete user',
      command: 'deleteDoc',
      input: {},
      operation: 'Delete user',
      expected: 'DENIED',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // 8. Teacher attempts to write own role = ADMIN
  try {
    let denied = false;
    let errCode = '';
    try {
      await updateDoc(doc(teacher.db, 'users', teacher.uid), { role: 'admin' });
    } catch (err: any) {
      denied = true;
      errCode = err.code || err.message;
    }
    const passed = denied && errCode.includes('permission-denied');
    recordTest({
      id: 'ROLES-08',
      category: 'ROLE ESCALATION',
      scenario: 'Teacher attempts to write own role = ADMIN',
      command: 'updateDoc(users/teacherUid, { role: "admin" })',
      input: { caller: 'teacher', targetField: 'role', value: 'admin' },
      operation: 'Direct Firestore self-elevation by Teacher',
      expected: 'DENIED with permission-denied',
      actual: denied ? `DENIED (${errCode})` : 'ALLOWED (SECURITY VULNERABILITY)',
      difference: passed ? 'None (Matched)' : 'Teacher escalated to Admin',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errCode,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'ROLES-08',
      category: 'ROLE ESCALATION',
      scenario: 'Teacher write own role = ADMIN',
      command: 'updateDoc',
      input: {},
      operation: 'Teacher self-escalate',
      expected: 'DENIED',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // 9. Teacher attempts to write student financial transaction
  try {
    let denied = false;
    let errCode = '';
    try {
      await setDoc(doc(teacher.db, 'transactions', `tx_tch_tamper_${Date.now()}`), {
        amount: 2500,
        studentId: studentA.uid,
        receipt: 'REC-TCH-001',
        createdAt: new Date().toISOString(),
      });
    } catch (err: any) {
      denied = true;
      errCode = err.code || err.message;
    }
    const passed = denied && errCode.includes('permission-denied');
    recordTest({
      id: 'ROLES-09',
      category: 'ROLE ESCALATION',
      scenario: 'Teacher attempts direct creation of financial transaction',
      command: 'setDoc(transactions/id, { amount: 2500 })',
      input: { caller: 'teacher', collection: 'transactions' },
      operation: 'Teacher writing financial transaction',
      expected: 'DENIED with permission-denied',
      actual: denied ? `DENIED (${errCode})` : 'ALLOWED (SECURITY VULNERABILITY)',
      difference: passed ? 'None (Matched)' : 'Financial write permitted for teacher',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errCode,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'ROLES-09',
      category: 'ROLE ESCALATION',
      scenario: 'Teacher write transaction',
      command: 'setDoc',
      input: {},
      operation: 'Teacher write financial',
      expected: 'DENIED',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // 10. Teacher attempts to read institutional cash ledger
  try {
    let denied = false;
    let errCode = '';
    try {
      await getDocs(collection(teacher.db, 'cash_ledger'));
    } catch (err: any) {
      denied = true;
      errCode = err.code || err.message;
    }
    const passed = denied && errCode.includes('permission-denied');
    recordTest({
      id: 'ROLES-10',
      category: 'ROLE ESCALATION',
      scenario: 'Teacher attempts to read physical cash ledger',
      command: 'getDocs(collection("cash_ledger"))',
      input: { caller: 'teacher', collection: 'cash_ledger' },
      operation: 'Direct query of cash_ledger collection',
      expected: 'DENIED with permission-denied',
      actual: denied ? `DENIED (${errCode})` : 'ALLOWED (SECURITY VULNERABILITY)',
      difference: passed ? 'None (Matched)' : 'Cash ledger visible to teacher',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errCode,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'ROLES-10',
      category: 'ROLE ESCALATION',
      scenario: 'Teacher read cash ledger',
      command: 'getDocs',
      input: {},
      operation: 'Read cash ledger',
      expected: 'DENIED',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // 11. 2° Admin attempts to grant self Primary Admin
  try {
    let denied = false;
    let errCode = '';
    try {
      await updateDoc(doc(secAdmin.db, 'users', secAdmin.uid), { adminTier: 'primary' });
    } catch (err: any) {
      denied = true;
      errCode = err.code || err.message;
    }
    const passed = denied && errCode.includes('permission-denied');
    recordTest({
      id: 'ROLES-11',
      category: 'ROLE ESCALATION',
      scenario: '2° Admin attempts self-promotion to Primary Admin',
      command: 'updateDoc(users/secAdminUid, { adminTier: "primary" })',
      input: { caller: 'secondary_admin', targetField: 'adminTier', value: 'primary' },
      operation: 'Self-elevation of governance tier',
      expected: 'DENIED with permission-denied',
      actual: denied ? `DENIED (${errCode})` : 'ALLOWED (GOVERNANCE BREACH)',
      difference: passed ? 'None (Matched)' : 'Self promotion to Primary Admin allowed',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errCode,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'ROLES-11',
      category: 'ROLE ESCALATION',
      scenario: '2° Admin self-promote',
      command: 'updateDoc',
      input: {},
      operation: 'Self promote tier',
      expected: 'DENIED',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // 12. 2° Admin attempts to promote Student to Admin
  try {
    let denied = false;
    let errCode = '';
    try {
      await updateDoc(doc(secAdmin.db, 'users', studentA.uid), { role: 'admin' });
    } catch (err: any) {
      denied = true;
      errCode = err.code || err.message;
    }
    const passed = denied && errCode.includes('permission-denied');
    recordTest({
      id: 'ROLES-12',
      category: 'ROLE ESCALATION',
      scenario: '2° Admin attempts to grant Admin role to user',
      command: 'updateDoc(users/studentA.uid, { role: "admin" })',
      input: { caller: 'secondary_admin', target: studentA.uid, role: 'admin' },
      operation: 'Delegating Admin role by Secondary Admin',
      expected: 'DENIED with permission-denied',
      actual: denied ? `DENIED (${errCode})` : 'ALLOWED (GOVERNANCE BREACH)',
      difference: passed ? 'None (Matched)' : 'Admin role grant permitted by 2° Admin',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errCode,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'ROLES-12',
      category: 'ROLE ESCALATION',
      scenario: '2° Admin grant Admin',
      command: 'updateDoc',
      input: {},
      operation: 'Grant admin by 2°',
      expected: 'DENIED',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // 13. 2° Admin attempts to delete another Admin
  try {
    let denied = false;
    let errCode = '';
    try {
      await deleteDoc(doc(secAdmin.db, 'users', primAdmin.uid));
    } catch (err: any) {
      denied = true;
      errCode = err.code || err.message;
    }
    const passed = denied && errCode.includes('permission-denied');
    recordTest({
      id: 'ROLES-13',
      category: 'ROLE ESCALATION',
      scenario: '2° Admin attempts to delete an Admin user document',
      command: 'deleteDoc(users/primAdminUid)',
      input: { caller: 'secondary_admin', target: primAdmin.uid },
      operation: 'Deleting Admin by Secondary Admin',
      expected: 'DENIED with permission-denied',
      actual: denied ? `DENIED (${errCode})` : 'ALLOWED (GOVERNANCE BREACH)',
      difference: passed ? 'None (Matched)' : 'Admin deletion permitted by 2° Admin',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: errCode,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'ROLES-13',
      category: 'ROLE ESCALATION',
      scenario: '2° Admin delete Admin',
      command: 'deleteDoc',
      input: {},
      operation: 'Delete admin by 2°',
      expected: 'DENIED',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // 14. 1° Admin grants Admin role to user (AUTHORIZED GOVERNANCE)
  try {
    const freshStudent = await createClientContext({ role: 'student', emailPrefix: 'std_to_adm' });
    let success = false;
    try {
      await updateDoc(doc(primAdmin.db, 'users', freshStudent.uid), { 
        role: 'admin',
        adminTier: 'secondary'
      });
      const checkDoc = await adminDb.collection('users').doc(freshStudent.uid).get();
      success = checkDoc.data()?.role === 'admin';
    } catch (err: any) {
      console.warn('1° Admin grant admin error:', err);
    }
    recordTest({
      id: 'ROLES-14',
      category: 'ROLE ESCALATION',
      scenario: '1° Admin successfully grants Admin role to user',
      command: 'updateDoc(users/studentUid, { role: "admin", adminTier: "secondary" })',
      input: { caller: 'primary_admin', target: freshStudent.uid, newRole: 'admin' },
      operation: 'Authorized role assignment by Primary Admin',
      expected: 'SUCCESS: role updated to admin',
      actual: success ? 'SUCCESS (Role updated to admin)' : 'FAILED to update',
      difference: success ? 'None (Matched)' : 'Primary admin grant failed',
      status: success ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `Success: ${success}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'ROLES-14',
      category: 'ROLE ESCALATION',
      scenario: '1° Admin grant Admin',
      command: 'updateDoc',
      input: {},
      operation: 'Primary grant admin',
      expected: 'Success',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }

  // 15. 1° Admin alters Admin tier (AUTHORIZED GOVERNANCE)
  try {
    const targetAdmin = await createClientContext({ role: 'admin', adminTier: 'secondary', emailPrefix: 'sec_to_prim' });
    let success = false;
    try {
      await updateDoc(doc(primAdmin.db, 'users', targetAdmin.uid), { 
        adminTier: 'primary'
      });
      const checkDoc = await adminDb.collection('users').doc(targetAdmin.uid).get();
      success = checkDoc.data()?.adminTier === 'primary';
    } catch (err: any) {
      console.warn('1° Admin update tier error:', err);
    }
    recordTest({
      id: 'ROLES-15',
      category: 'ROLE ESCALATION',
      scenario: '1° Admin successfully promotes Secondary Admin to Primary Admin',
      command: 'updateDoc(users/secAdminUid, { adminTier: "primary" })',
      input: { caller: 'primary_admin', target: targetAdmin.uid, newTier: 'primary' },
      operation: 'Authorized tier governance mutation by Primary Admin',
      expected: 'SUCCESS: adminTier updated to primary',
      actual: success ? 'SUCCESS (Tier promoted to primary)' : 'FAILED to promote',
      difference: success ? 'None (Matched)' : 'Primary admin tier mutation failed',
      status: success ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `Success: ${success}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({
      id: 'ROLES-15',
      category: 'ROLE ESCALATION',
      scenario: '1° Admin promote tier',
      command: 'updateDoc',
      input: {},
      operation: 'Primary alter tier',
      expected: 'Success',
      actual: err.message,
      difference: err.message,
      status: 'FAIL',
      rawOutput: err.stack,
      exitCode: 1,
    });
  }
}
