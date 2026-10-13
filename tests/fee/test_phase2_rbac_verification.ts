/**
 * ============================================================================
 * PHASE 2 EVIDENCE-BASED AUDIT SUITE: FIRESTORE SECURITY RULES & RBAC
 * Shikshantar Academy School ERP — Fee Management
 * ============================================================================
 * 
 * Target Environment:
 * - Project: demo-shikshantar-test (Strictly local Firebase Emulator Suite)
 * - Firestore Emulator Host: 127.0.0.1:8085
 * - Auth Emulator Host: 127.0.0.1:9098
 * 
 * Scope of Tests:
 * 1. FM-RBAC-01: Admin full authority (Read & Write across all fee collections)
 * 2. FM-RBAC-02: Teacher complete financial barrier (100% read & write denial)
 * 3. FM-RBAC-03: Student own-record access (Self-inspection of bills & payments)
 * 4. FM-RBAC-04: Student cross-student denial (IDOR protection & institutional ledger isolation)
 * 5. FM-RBAC-05: Unauthenticated access denial (Complete closed-barrier defense)
 * 6. FM-RBAC-06: Tampered client claims defense (Firestore user doc authoritative override)
 * 7. FM-RBAC-07: Direct financial write lockdown (Non-admin write block)
 * 8. FM-RBAC-08: Immutable audit trail protection (Append-only ledger logs)
 * 9. Section 29: Bill field-level mutation attacks (totalAmount, dueAmount, status, paidAmount)
 * 10. Section 30: Transaction field-level mutation attacks (amount, receiptNo, studentUid, etc.)
 * 11. Section 31: Advance & balance field-level mutation attacks (advanceBalance, student_advances)
 * ============================================================================
 */

import admin from 'firebase-admin';

// Safety Pre-flight
const REQUIRED_PROJECT = 'demo-shikshantar-test';
const activeFirestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';
const activeAuthHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9098';
const activeProject = process.env.GCLOUD_PROJECT || REQUIRED_PROJECT;

if (!activeProject.startsWith('demo-')) {
  console.error('❌ FATAL: Active project is not a demo project!');
  process.exit(1);
}

// Initialize Admin SDK for seeding and authoritative checks
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: REQUIRED_PROJECT
  });
}
const adminDb = admin.firestore();
const adminAuth = admin.auth();

interface TestCaseResult {
  suite: string;
  testId: string;
  name: string;
  role: string;
  operation: string;
  targetCollection: string;
  targetDoc: string;
  expectedStatus: number;
  actualStatus: number;
  result: 'PASS' | 'FAIL' | 'NOT-EXECUTED';
  evidence: string;
}

const testResults: TestCaseResult[] = [];

// Helper: Firestore REST payload converter
function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'boolean') return { booleanValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return fields;
}

// REST Client Helper
async function executeRest(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  token?: string | null,
  body?: Record<string, any>,
  queryParams?: string
): Promise<{ status: number; data: any; rawError?: string }> {
  const url = `http://${activeFirestoreHost}/v1/projects/${REQUIRED_PROJECT}/databases/(default)/documents/${path}${queryParams ? '?' + queryParams : ''}`;
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const reqInit: RequestInit = {
    method,
    headers
  };
  if (body && (method === 'POST' || method === 'PATCH')) {
    reqInit.body = JSON.stringify({ fields: toFirestoreFields(body) });
  }

  try {
    const res = await fetch(url, reqInit);
    let data: any = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    return { status: res.status, data };
  } catch (err: any) {
    return { status: 0, data: null, rawError: err.message };
  }
}

// Token Cache
const tokens: Record<string, string> = {};

async function setupTestUsers() {
  console.log('--- Setting up isolated Auth & User entities for Phase 2 ---');
  const userDefs = [
    { uid: 'test_admin_uid', email: 'admin_audit@shikshantar.edu.np', role: 'admin', customClaims: { role: 'admin' } },
    { uid: 'test_teacher_uid', email: 'teacher_audit@shikshantar.edu.np', role: 'teacher', customClaims: { role: 'teacher' } },
    { uid: 'test_student1_uid', email: 'student1_audit@shikshantar.edu.np', role: 'student', studentId: 'TEST-STU-001', customClaims: { role: 'student' } },
    { uid: 'test_student2_uid', email: 'student2_audit@shikshantar.edu.np', role: 'student', studentId: 'TEST-STU-002', customClaims: { role: 'student' } },
    { uid: 'test_tampered_uid', email: 'tampered_audit@shikshantar.edu.np', role: 'student', studentId: 'TEST-STU-003', customClaims: { role: 'admin' } }
  ];

  for (const u of userDefs) {
    // 1. Delete and create in Auth emulator cleanly
    try {
      await adminAuth.deleteUser(u.uid);
    } catch (e: any) {}

    await adminAuth.createUser({
      uid: u.uid,
      email: u.email,
      password: 'Password123!'
    });
    await adminAuth.setCustomUserClaims(u.uid, u.customClaims || {});

    // 2. Set authoritative Firestore user document
    await adminDb.collection('users').doc(u.uid).set({
      role: u.role,
      email: u.email,
      name: `Test ${u.role}`,
      studentId: u.studentId || null,
      status: 'ACTIVE',
      deleted: false,
      advanceBalance: 0
    });

    // 3. Acquire signed ID token from Auth emulator
    const signInRes = await fetch(`http://${activeAuthHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, password: 'Password123!', returnSecureToken: true })
    });
    const signInData = await signInRes.json();
    if (!signInData.idToken) {
      throw new Error(`Failed to sign in as ${u.email}: ${JSON.stringify(signInData)}`);
    }
    tokens[u.uid] = signInData.idToken;
  }

  console.log('✅ Auth & User entities ready with valid emulator tokens.\n');
}

async function seedTestFinancialRecords() {
  console.log('--- Seeding authoritative Phase 2 financial records ---');
  // 1. Remit Bill
  await adminDb.collection('remitBills').doc('TEST-BILL-001').set({
    billNo: 'RMT-2083-000101',
    studentId: 'TEST-STU-001',
    studentName: 'Aarav Sharma',
    academicYear: '2083',
    billingPeriod: 'Baisakh - Ashadh 2083',
    totalAmount: 9600,
    paidAmount: 0,
    dueAmount: 9600,
    status: 'pending'
  });

  // 2. Transaction
  await adminDb.collection('transactions').doc('TEST-TXN-001').set({
    receiptNo: 'RCP-2083-000101',
    studentId: 'TEST-STU-001',
    studentName: 'Aarav Sharma',
    amount: 9600,
    status: 'SUCCESS',
    method: 'Cash',
    date: '2083-01-15'
  });

  // 3. Student Fee Line Item
  await adminDb.collection('studentFees').doc('TEST-FEE-001').set({
    studentId: 'TEST-STU-001',
    studentName: 'Aarav Sharma',
    month: 'Baisakh',
    feeType: 'Tuition Fee',
    totalFee: 2000,
    paidAmount: 0,
    dueAmount: 2000,
    status: 'due'
  });

  // 4. Cash Ledger Entry
  await adminDb.collection('cash_ledger').doc('TEST-CL-001').set({
    type: 'Income',
    amount: 9600,
    category: 'Fee Collection',
    receiptNo: 'RCP-2083-000101',
    remarks: 'Authoritative Fee Collection Entry',
    date: '2083-01-15'
  });

  // 5. Student Advance Record
  await adminDb.collection('student_advances').doc('TEST-ADV-001').set({
    studentId: 'TEST-STU-001',
    studentName: 'Aarav Sharma',
    amount: 400,
    remainingCredit: 400,
    status: 'ACTIVE',
    dateBS: '2083-01-15'
  });

  // 6. Immutable Ledger Audit Log
  await adminDb.collection('ledger_audit_logs').doc('TEST-LOG-001').set({
    actionType: 'FEE_PAYMENT',
    studentId: 'TEST-STU-001',
    receipt: 'RCP-2083-000101',
    timestamp: new Date().toISOString()
  });

  console.log('✅ Authoritative financial test records seeded into emulator.\n');
}

function recordTest(
  suite: string,
  testId: string,
  name: string,
  role: string,
  operation: string,
  targetCollection: string,
  targetDoc: string,
  expectedStatus: number,
  actualStatus: number,
  evidence: string
) {
  const result: 'PASS' | 'FAIL' = (expectedStatus === actualStatus) ? 'PASS' : 'FAIL';
  testResults.push({
    suite,
    testId,
    name,
    role,
    operation,
    targetCollection,
    targetDoc,
    expectedStatus,
    actualStatus,
    result,
    evidence
  });

  const icon = (result === 'PASS') ? '✅' : '❌';
  console.log(`${icon} [${result}] ${testId}: ${name}`);
  console.log(`   Role: ${role} | Operation: ${operation} | Target: ${targetCollection}/${targetDoc}`);
  console.log(`   Expected HTTP: ${expectedStatus} | Actual HTTP: ${actualStatus}`);
  console.log(`   Evidence: ${evidence}\n`);
}

async function runPhase2SecuritySuite() {
  console.log('================================================================');
  console.log('🚀 EXECUTING PHASE 2: FIRESTORE SECURITY RULES & RBAC AUDIT');
  console.log('   Shikshantar Academy Fee Management Reality Gate');
  console.log('================================================================\n');

  await setupTestUsers();
  await seedTestFinancialRecords();

  const adminTok = tokens['test_admin_uid'];
  const teacherTok = tokens['test_teacher_uid'];
  const stu1Tok = tokens['test_student1_uid'];
  const stu2Tok = tokens['test_student2_uid'];
  const tamperedTok = tokens['test_tampered_uid'];

  // --------------------------------------------------------------------------
  // 1. FM-RBAC-01: Admin Full Authority & Access
  // --------------------------------------------------------------------------
  console.log('--- 1. FM-RBAC-01: Admin Full Authority & Access ---');
  let res = await executeRest('GET', 'remitBills/TEST-BILL-001', adminTok);
  recordTest('FM-RBAC-01', 'FM-RBAC-01.1', 'Admin Read remitBills', 'admin', 'GET', 'remitBills', 'TEST-BILL-001', 200, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'transactions/TEST-TXN-001', adminTok);
  recordTest('FM-RBAC-01', 'FM-RBAC-01.2', 'Admin Read transactions', 'admin', 'GET', 'transactions', 'TEST-TXN-001', 200, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'cash_ledger/TEST-CL-001', adminTok);
  recordTest('FM-RBAC-01', 'FM-RBAC-01.3', 'Admin Read cash_ledger', 'admin', 'GET', 'cash_ledger', 'TEST-CL-001', 200, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'student_advances/TEST-ADV-001', adminTok);
  recordTest('FM-RBAC-01', 'FM-RBAC-01.4', 'Admin Read student_advances', 'admin', 'GET', 'student_advances', 'TEST-ADV-001', 200, res.status, `Status: ${res.status}`);

  res = await executeRest('PATCH', 'remitBills/TEST-BILL-ADM', adminTok, { studentId: 'TEST-STU-001', totalAmount: 5000, status: 'pending' });
  recordTest('FM-RBAC-01', 'FM-RBAC-01.5', 'Admin Write remitBills', 'admin', 'PATCH', 'remitBills', 'TEST-BILL-ADM', 200, res.status, `Status: ${res.status}`);

  res = await executeRest('PATCH', 'transactions/TEST-TXN-ADM', adminTok, { studentId: 'TEST-STU-001', amount: 5000, status: 'SUCCESS' });
  recordTest('FM-RBAC-01', 'FM-RBAC-01.6', 'Admin Write transactions', 'admin', 'PATCH', 'transactions', 'TEST-TXN-ADM', 200, res.status, `Status: ${res.status}`);

  res = await executeRest('PATCH', 'cash_ledger/TEST-CL-ADM', adminTok, { type: 'Income', amount: 5000, category: 'Fee Collection' });
  recordTest('FM-RBAC-01', 'FM-RBAC-01.7', 'Admin Write cash_ledger', 'admin', 'PATCH', 'cash_ledger', 'TEST-CL-ADM', 200, res.status, `Status: ${res.status}`);

  // --------------------------------------------------------------------------
  // 2. FM-RBAC-02: Teacher Complete Financial Denial
  // --------------------------------------------------------------------------
  console.log('--- 2. FM-RBAC-02: Teacher Complete Financial Denial ---');
  res = await executeRest('GET', 'remitBills/TEST-BILL-001', teacherTok);
  recordTest('FM-RBAC-02', 'FM-RBAC-02.1', 'Teacher Read remitBills Blocked', 'teacher', 'GET', 'remitBills', 'TEST-BILL-001', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'transactions/TEST-TXN-001', teacherTok);
  recordTest('FM-RBAC-02', 'FM-RBAC-02.2', 'Teacher Read transactions Blocked', 'teacher', 'GET', 'transactions', 'TEST-TXN-001', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'cash_ledger/TEST-CL-001', teacherTok);
  recordTest('FM-RBAC-02', 'FM-RBAC-02.3', 'Teacher Read cash_ledger Blocked', 'teacher', 'GET', 'cash_ledger', 'TEST-CL-001', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'studentFees/TEST-FEE-001', teacherTok);
  recordTest('FM-RBAC-02', 'FM-RBAC-02.4', 'Teacher Read studentFees Blocked', 'teacher', 'GET', 'studentFees', 'TEST-FEE-001', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'student_advances/TEST-ADV-001', teacherTok);
  recordTest('FM-RBAC-02', 'FM-RBAC-02.5', 'Teacher Read student_advances Blocked', 'teacher', 'GET', 'student_advances', 'TEST-ADV-001', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('PATCH', 'transactions/TEST-TXN-TCH', teacherTok, { amount: 1000, status: 'SUCCESS' });
  recordTest('FM-RBAC-02', 'FM-RBAC-02.6', 'Teacher Write transactions Blocked', 'teacher', 'PATCH', 'transactions', 'TEST-TXN-TCH', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('PATCH', 'remitBills/TEST-BILL-TCH', teacherTok, { totalAmount: 1000, status: 'pending' });
  recordTest('FM-RBAC-02', 'FM-RBAC-02.7', 'Teacher Write remitBills Blocked', 'teacher', 'PATCH', 'remitBills', 'TEST-BILL-TCH', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('PATCH', 'cash_ledger/TEST-CL-TCH', teacherTok, { type: 'Income', amount: 1000 });
  recordTest('FM-RBAC-02', 'FM-RBAC-02.8', 'Teacher Write cash_ledger Blocked', 'teacher', 'PATCH', 'cash_ledger', 'TEST-CL-TCH', 403, res.status, `Status: ${res.status}`);

  // --------------------------------------------------------------------------
  // 3. FM-RBAC-03: Student Own-Record Access
  // --------------------------------------------------------------------------
  console.log('--- 3. FM-RBAC-03: Student Own-Record Access ---');
  res = await executeRest('GET', 'remitBills/TEST-BILL-001', stu1Tok);
  recordTest('FM-RBAC-03', 'FM-RBAC-03.1', 'Student 1 Read Own remitBills', 'student', 'GET', 'remitBills', 'TEST-BILL-001', 200, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'transactions/TEST-TXN-001', stu1Tok);
  recordTest('FM-RBAC-03', 'FM-RBAC-03.2', 'Student 1 Read Own transactions', 'student', 'GET', 'transactions', 'TEST-TXN-001', 200, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'studentFees/TEST-FEE-001', stu1Tok);
  recordTest('FM-RBAC-03', 'FM-RBAC-03.3', 'Student 1 Read Own studentFees', 'student', 'GET', 'studentFees', 'TEST-FEE-001', 200, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'student_advances/TEST-ADV-001', stu1Tok);
  recordTest('FM-RBAC-03', 'FM-RBAC-03.4', 'Student 1 Read Own student_advances', 'student', 'GET', 'student_advances', 'TEST-ADV-001', 200, res.status, `Status: ${res.status}`);

  // --------------------------------------------------------------------------
  // 4. FM-RBAC-04: Student Cross-Student Denial (IDOR & Privacy Isolation)
  // --------------------------------------------------------------------------
  console.log('--- 4. FM-RBAC-04: Student Cross-Student Denial (IDOR Defense) ---');
  res = await executeRest('GET', 'remitBills/TEST-BILL-001', stu2Tok);
  recordTest('FM-RBAC-04', 'FM-RBAC-04.1', 'Student 2 Read Student 1 remitBills Blocked', 'student', 'GET', 'remitBills', 'TEST-BILL-001', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'transactions/TEST-TXN-001', stu2Tok);
  recordTest('FM-RBAC-04', 'FM-RBAC-04.2', 'Student 2 Read Student 1 transactions Blocked', 'student', 'GET', 'transactions', 'TEST-TXN-001', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'studentFees/TEST-FEE-001', stu2Tok);
  recordTest('FM-RBAC-04', 'FM-RBAC-04.3', 'Student 2 Read Student 1 studentFees Blocked', 'student', 'GET', 'studentFees', 'TEST-FEE-001', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'student_advances/TEST-ADV-001', stu2Tok);
  recordTest('FM-RBAC-04', 'FM-RBAC-04.4', 'Student 2 Read Student 1 student_advances Blocked', 'student', 'GET', 'student_advances', 'TEST-ADV-001', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'cash_ledger/TEST-CL-001', stu1Tok);
  recordTest('FM-RBAC-04', 'FM-RBAC-04.5', 'Student 1 Read Institutional cash_ledger Blocked', 'student', 'GET', 'cash_ledger', 'TEST-CL-001', 403, res.status, `Status: ${res.status}`);

  // --------------------------------------------------------------------------
  // 5. FM-RBAC-05: Unauthenticated Access Denial
  // --------------------------------------------------------------------------
  console.log('--- 5. FM-RBAC-05: Unauthenticated Access Denial ---');
  res = await executeRest('GET', 'remitBills/TEST-BILL-001', null);
  recordTest('FM-RBAC-05', 'FM-RBAC-05.1', 'Unauth Read remitBills Blocked', 'unauthenticated', 'GET', 'remitBills', 'TEST-BILL-001', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'transactions/TEST-TXN-001', null);
  recordTest('FM-RBAC-05', 'FM-RBAC-05.2', 'Unauth Read transactions Blocked', 'unauthenticated', 'GET', 'transactions', 'TEST-TXN-001', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'cash_ledger/TEST-CL-001', null);
  recordTest('FM-RBAC-05', 'FM-RBAC-05.3', 'Unauth Read cash_ledger Blocked', 'unauthenticated', 'GET', 'cash_ledger', 'TEST-CL-001', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'student_advances/TEST-ADV-001', null);
  recordTest('FM-RBAC-05', 'FM-RBAC-05.4', 'Unauth Read student_advances Blocked', 'unauthenticated', 'GET', 'student_advances', 'TEST-ADV-001', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('PATCH', 'transactions/TEST-TXN-UNAUTH', null, { amount: 1000 });
  recordTest('FM-RBAC-05', 'FM-RBAC-05.5', 'Unauth Write transactions Blocked', 'unauthenticated', 'PATCH', 'transactions', 'TEST-TXN-UNAUTH', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('PATCH', 'remitBills/TEST-BILL-UNAUTH', null, { totalAmount: 1000 });
  recordTest('FM-RBAC-05', 'FM-RBAC-05.6', 'Unauth Write remitBills Blocked', 'unauthenticated', 'PATCH', 'remitBills', 'TEST-BILL-UNAUTH', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('PATCH', 'cash_ledger/TEST-CL-UNAUTH', null, { amount: 1000 });
  recordTest('FM-RBAC-05', 'FM-RBAC-05.7', 'Unauth Write cash_ledger Blocked', 'unauthenticated', 'PATCH', 'cash_ledger', 'TEST-CL-UNAUTH', 403, res.status, `Status: ${res.status}`);

  // --------------------------------------------------------------------------
  // 6. FM-RBAC-06: Tampered Client Claims Defense
  // --------------------------------------------------------------------------
  console.log('--- 6. FM-RBAC-06: Tampered Client Claims Defense ---');
  res = await executeRest('PATCH', 'transactions/TEST-TXN-TAMPER', tamperedTok, { amount: 999999 });
  recordTest('FM-RBAC-06', 'FM-RBAC-06.1', 'Tampered Token Write transactions Blocked', 'tampered', 'PATCH', 'transactions', 'TEST-TXN-TAMPER', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('GET', 'cash_ledger/TEST-CL-001', tamperedTok);
  recordTest('FM-RBAC-06', 'FM-RBAC-06.2', 'Tampered Token Read cash_ledger Blocked', 'tampered', 'GET', 'cash_ledger', 'TEST-CL-001', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('PATCH', 'remitBills/TEST-BILL-TAMPER', tamperedTok, { totalAmount: 0 });
  recordTest('FM-RBAC-06', 'FM-RBAC-06.3', 'Tampered Token Write remitBills Blocked', 'tampered', 'PATCH', 'remitBills', 'TEST-BILL-TAMPER', 403, res.status, `Status: ${res.status}`);

  // --------------------------------------------------------------------------
  // 7. FM-RBAC-07: Direct Financial Write Blocking
  // --------------------------------------------------------------------------
  console.log('--- 7. FM-RBAC-07: Direct Financial Write Blocking ---');
  res = await executeRest('PATCH', 'transactions/TEST-TXN-STU', stu1Tok, { amount: 1000, status: 'SUCCESS' });
  recordTest('FM-RBAC-07', 'FM-RBAC-07.1', 'Student Direct Write transactions Blocked', 'student', 'PATCH', 'transactions', 'TEST-TXN-STU', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('PATCH', 'remitBills/TEST-BILL-STU', stu1Tok, { totalAmount: 1000 });
  recordTest('FM-RBAC-07', 'FM-RBAC-07.2', 'Student Direct Write remitBills Blocked', 'student', 'PATCH', 'remitBills', 'TEST-BILL-STU', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('PATCH', 'cash_ledger/TEST-CL-STU', stu1Tok, { amount: 1000 });
  recordTest('FM-RBAC-07', 'FM-RBAC-07.3', 'Student Direct Write cash_ledger Blocked', 'student', 'PATCH', 'cash_ledger', 'TEST-CL-STU', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('PATCH', 'student_advances/TEST-ADV-STU', stu1Tok, { amount: 1000 });
  recordTest('FM-RBAC-07', 'FM-RBAC-07.4', 'Student Direct Write student_advances Blocked', 'student', 'PATCH', 'student_advances', 'TEST-ADV-STU', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('PATCH', 'student_advances/TEST-ADV-TCH', teacherTok, { amount: 1000 });
  recordTest('FM-RBAC-07', 'FM-RBAC-07.5', 'Teacher Direct Write student_advances Blocked', 'teacher', 'PATCH', 'student_advances', 'TEST-ADV-TCH', 403, res.status, `Status: ${res.status}`);

  // --------------------------------------------------------------------------
  // 8. FM-RBAC-08: Immutable Audit Trail Protection
  // --------------------------------------------------------------------------
  console.log('--- 8. FM-RBAC-08: Immutable Audit Trail Protection ---');
  res = await executeRest('PATCH', 'ledger_audit_logs/TEST-LOG-001', adminTok, { actionType: 'TAMPERED_ACTION' });
  recordTest('FM-RBAC-08', 'FM-RBAC-08.1', 'Admin Update ledger_audit_logs Blocked (Immutable)', 'admin', 'PATCH', 'ledger_audit_logs', 'TEST-LOG-001', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('DELETE', 'ledger_audit_logs/TEST-LOG-001', adminTok);
  recordTest('FM-RBAC-08', 'FM-RBAC-08.2', 'Admin Delete ledger_audit_logs Blocked (Immutable)', 'admin', 'DELETE', 'ledger_audit_logs', 'TEST-LOG-001', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('PATCH', 'ledger_audit_logs/TEST-LOG-STU', stu1Tok, { actionType: 'FAKE_AUDIT' });
  recordTest('FM-RBAC-08', 'FM-RBAC-08.3', 'Student Create ledger_audit_logs Blocked', 'student', 'PATCH', 'ledger_audit_logs', 'TEST-LOG-STU', 403, res.status, `Status: ${res.status}`);

  res = await executeRest('PATCH', 'ledger_audit_logs/TEST-LOG-TCH', teacherTok, { actionType: 'FAKE_AUDIT' });
  recordTest('FM-RBAC-08', 'FM-RBAC-08.4', 'Teacher Create ledger_audit_logs Blocked', 'teacher', 'PATCH', 'ledger_audit_logs', 'TEST-LOG-TCH', 403, res.status, `Status: ${res.status}`);

  // --------------------------------------------------------------------------
  // 9. Sections 29–31: Field-Level Mutation & Financial Tamper Resistance
  // --------------------------------------------------------------------------
  console.log('--- 9. Section 29: Bill Mutation Attacks ---');
  // Attempt to mutate totalAmount to 0
  res = await executeRest('PATCH', 'remitBills/TEST-BILL-001', stu1Tok, { totalAmount: 0 }, 'updateMask.fieldPaths=totalAmount');
  recordTest('Section-29', 'SEC29-MUT-01', 'Direct Mutation of bill totalAmount Blocked', 'student', 'PATCH', 'remitBills', 'TEST-BILL-001', 403, res.status, `Status: ${res.status}`);

  // Attempt to wipe out dueAmount to 0
  res = await executeRest('PATCH', 'remitBills/TEST-BILL-001', stu1Tok, { dueAmount: 0 }, 'updateMask.fieldPaths=dueAmount');
  recordTest('Section-29', 'SEC29-MUT-02', 'Direct Mutation of bill dueAmount Blocked', 'student', 'PATCH', 'remitBills', 'TEST-BILL-001', 403, res.status, `Status: ${res.status}`);

  // Attempt to set status from 'pending' to 'paid'
  res = await executeRest('PATCH', 'remitBills/TEST-BILL-001', stu1Tok, { status: 'paid' }, 'updateMask.fieldPaths=status');
  recordTest('Section-29', 'SEC29-MUT-03', 'Direct Mutation of bill status Blocked', 'student', 'PATCH', 'remitBills', 'TEST-BILL-001', 403, res.status, `Status: ${res.status}`);

  // Attempt to set paidAmount to 9600
  res = await executeRest('PATCH', 'remitBills/TEST-BILL-001', stu1Tok, { paidAmount: 9600 }, 'updateMask.fieldPaths=paidAmount');
  recordTest('Section-29', 'SEC29-MUT-04', 'Direct Mutation of bill paidAmount Blocked', 'student', 'PATCH', 'remitBills', 'TEST-BILL-001', 403, res.status, `Status: ${res.status}`);

  console.log('--- 10. Section 30: Transaction Mutation Attacks ---');
  // Attempt to mutate amount
  res = await executeRest('PATCH', 'transactions/TEST-TXN-001', stu1Tok, { amount: 1 }, 'updateMask.fieldPaths=amount');
  recordTest('Section-30', 'SEC30-MUT-01', 'Direct Mutation of transaction amount Blocked', 'student', 'PATCH', 'transactions', 'TEST-TXN-001', 403, res.status, `Status: ${res.status}`);

  // Attempt to mutate receiptNo
  res = await executeRest('PATCH', 'transactions/TEST-TXN-001', stu1Tok, { receiptNo: 'RCP-FAKE' }, 'updateMask.fieldPaths=receiptNo');
  recordTest('Section-30', 'SEC30-MUT-02', 'Direct Mutation of transaction receiptNo Blocked', 'student', 'PATCH', 'transactions', 'TEST-TXN-001', 403, res.status, `Status: ${res.status}`);

  // Attempt to mutate studentUid / studentId
  res = await executeRest('PATCH', 'transactions/TEST-TXN-001', stu1Tok, { studentId: 'TEST-STU-002' }, 'updateMask.fieldPaths=studentId');
  recordTest('Section-30', 'SEC30-MUT-03', 'Direct Mutation of transaction studentId Blocked', 'student', 'PATCH', 'transactions', 'TEST-TXN-001', 403, res.status, `Status: ${res.status}`);

  // Attempt to mutate paymentGroup
  res = await executeRest('PATCH', 'transactions/TEST-TXN-001', stu1Tok, { paymentGroupId: 'FAKE_GRP' }, 'updateMask.fieldPaths=paymentGroupId');
  recordTest('Section-30', 'SEC30-MUT-04', 'Direct Mutation of transaction paymentGroupId Blocked', 'student', 'PATCH', 'transactions', 'TEST-TXN-001', 403, res.status, `Status: ${res.status}`);

  // Attempt to mutate source
  res = await executeRest('PATCH', 'transactions/TEST-TXN-001', stu1Tok, { method: 'Cheque' }, 'updateMask.fieldPaths=method');
  recordTest('Section-30', 'SEC30-MUT-05', 'Direct Mutation of transaction method Blocked', 'student', 'PATCH', 'transactions', 'TEST-TXN-001', 403, res.status, `Status: ${res.status}`);

  // Attempt to mutate status
  res = await executeRest('PATCH', 'transactions/TEST-TXN-001', stu1Tok, { status: 'CANCELLED' }, 'updateMask.fieldPaths=status');
  recordTest('Section-30', 'SEC30-MUT-06', 'Direct Mutation of transaction status Blocked', 'student', 'PATCH', 'transactions', 'TEST-TXN-001', 403, res.status, `Status: ${res.status}`);

  // Attempt to mutate test flags / remarks
  res = await executeRest('PATCH', 'transactions/TEST-TXN-001', stu1Tok, { remarks: 'HACKED' }, 'updateMask.fieldPaths=remarks');
  recordTest('Section-30', 'SEC30-MUT-07', 'Direct Mutation of transaction remarks Blocked', 'student', 'PATCH', 'transactions', 'TEST-TXN-001', 403, res.status, `Status: ${res.status}`);

  console.log('--- 11. Section 31: Advance & Balance Mutation Attacks ---');
  // Attempt to mutate user advanceBalance on users doc (TESTED VULNERABILITY CHECK)
  res = await executeRest('PATCH', 'users/test_student1_uid', stu1Tok, { advanceBalance: 999999 }, 'updateMask.fieldPaths=advanceBalance');
  recordTest('Section-31', 'SEC31-MUT-01', 'Direct Mutation of User doc advanceBalance Blocked', 'student', 'PATCH', 'users', 'test_student1_uid', 403, res.status, `Status: ${res.status}`);

  // Attempt to mutate student_advances amount
  res = await executeRest('PATCH', 'student_advances/TEST-ADV-001', stu1Tok, { amount: 50000 }, 'updateMask.fieldPaths=amount');
  recordTest('Section-31', 'SEC31-MUT-02', 'Direct Mutation of student_advances amount Blocked', 'student', 'PATCH', 'student_advances', 'TEST-ADV-001', 403, res.status, `Status: ${res.status}`);

  // Attempt to mutate student_advances remainingCredit
  res = await executeRest('PATCH', 'student_advances/TEST-ADV-001', stu1Tok, { remainingCredit: 50000 }, 'updateMask.fieldPaths=remainingCredit');
  recordTest('Section-31', 'SEC31-MUT-03', 'Direct Mutation of student_advances remainingCredit Blocked', 'student', 'PATCH', 'student_advances', 'TEST-ADV-001', 403, res.status, `Status: ${res.status}`);

  // Attempt to mutate student_advances status
  res = await executeRest('PATCH', 'student_advances/TEST-ADV-001', stu1Tok, { status: 'CANCELLED' }, 'updateMask.fieldPaths=status');
  recordTest('Section-31', 'SEC31-MUT-04', 'Direct Mutation of student_advances status Blocked', 'student', 'PATCH', 'student_advances', 'TEST-ADV-001', 403, res.status, `Status: ${res.status}`);

  // --------------------------------------------------------------------------
  // Summary Report
  // --------------------------------------------------------------------------
  console.log('================================================================');
  console.log('📊 PHASE 2 EXECUTION SUMMARY REPORT');
  console.log('================================================================');
  const passCount = testResults.filter(t => t.result === 'PASS').length;
  const failCount = testResults.filter(t => t.result === 'FAIL').length;
  const notExecCount = testResults.filter(t => t.result === 'NOT-EXECUTED').length;

  console.log(`Total Checks Executed : ${testResults.length}`);
  console.log(`PASS-RUNTIME          : ${passCount}`);
  console.log(`FAIL                  : ${failCount}`);
  console.log(`NOT-EXECUTED          : ${notExecCount}`);
  console.log('================================================================\n');

  if (failCount > 0) {
    console.log('⚠️ CONFIRMED DEFECTS FOUND IN RUNTIME EXECUTION:');
    testResults.filter(t => t.result === 'FAIL').forEach(f => {
      console.log(` - [${f.testId}] ${f.name} (Role: ${f.role}, Target: ${f.targetCollection}/${f.targetDoc})`);
      console.log(`   Expected: HTTP ${f.expectedStatus}, Got: HTTP ${f.actualStatus}`);
    });
    console.log('');
  }
}

runPhase2SecuritySuite();
