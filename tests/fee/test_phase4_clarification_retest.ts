/**
 * ============================================================================
 * PHASE 4 FINANCIAL CLARIFICATION & DEFECT FIX VERIFICATION SUITE
 * Shikshantar Academy School ERP — Cash Payment Engine
 * ============================================================================
 * 
 * Scope:
 * 1. Decimal & Malformed Integer-Only Input Validation on Real Payment Entry Point:
 *    - "5000.75"
 *    - "5000,75"
 *    - "5000 75"
 *    - "5,000"
 *    - "5000abc"
 *    - "abc5000"
 *    - "-5000"
 *    - "+5000"
 *    - "5e3"
 *    - "5E3"
 *    - "0.5"
 *    - "5000\n"
 *    - "5000\t"
 *    - "NaN"
 *    - ""
 *    - " "
 *    - null
 *    - undefined
 *    - 5000.75 (numeric float)
 *    - -5000 (numeric negative)
 *    - Infinity
 *    - -Infinity
 *    - NaN
 *    Expected: Strict REJECTION before financial mutation; DB state 100% unchanged.
 * 
 * 2. Valid Input Regressions:
 *    - 5000 (exact)
 *    - 3500 (partial)
 *    - 9600 (exact)
 *    - Bill = 9600, Cash = 10000, Decision = RETURN (Allocation = 9600, Change = 400, Advance = 0)
 *    - Bill = 9600, Cash = 10000, Decision = ADVANCE (Allocation = 9600, Change = 0, Advance = 400)
 * 
 * 3. FM-CASH-09 Over-Allocation Conservation:
 *    - Bill Total = 6000, Already Paid = 4000, Payment Attempt = 3500, Decision = ADVANCE
 *    - Expected: New Bill Allocation = 2000, Unallocated/Advance = 1500, Final Paid = 6000, Due = 0
 *    - Conservation Equality: 3500 = 2000 + 1500 + 0
 * 
 * 4. Persisted Firestore Database State Verification & Financial Scans.
 * ============================================================================
 */

import admin from 'firebase-admin';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../../src/firebase';
import { executeCashFeePayment } from '../../src/lib/cashPaymentEngine';

const REQUIRED_PROJECT_ID = 'demo-shikshantar-test';
const PROD_PROJECT_ID = 'project-4b410c97-a152-49e7-940';
const PROD_DB_ID = 'ai-studio-2507c181-4e37-4730-b71a-25b639c27e22';

const activeFirestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const activeAuthHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const activeProject = process.env.GCLOUD_PROJECT || REQUIRED_PROJECT_ID;

console.log('================================================================');
console.log('🔒 CRITICAL PRODUCTION SAFETY LOCK PRE-FLIGHT CHECK');
console.log('================================================================');
console.log(`Active Target Project      : ${activeProject}`);
console.log(`FIRESTORE_EMULATOR_HOST    : ${activeFirestoreHost || 'NOT SET'}`);
console.log(`FIREBASE_AUTH_EMULATOR_HOST: ${activeAuthHost || 'NOT SET'}`);

if (!activeFirestoreHost) {
  console.error('❌ FATAL SAFETY VIOLATION: FIRESTORE_EMULATOR_HOST is not set!');
  process.exit(1);
}

if (activeProject === PROD_PROJECT_ID || activeProject.includes(PROD_DB_ID)) {
  console.error('❌ FATAL SAFETY VIOLATION: Production Project ID detected!');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: activeProject,
  });
}
const db = admin.firestore();

interface TestReport {
  section: string;
  testId: string;
  payload: any;
  expected: string;
  actual: string;
  difference: string;
  status: 'PASS-RUNTIME' | 'FAIL' | 'BLOCKED' | 'NOT-EXECUTED';
  rawEvidence: any;
}

const reports: TestReport[] = [];

function recordTest(report: TestReport) {
  reports.push(report);
  const icon = report.status === 'PASS-RUNTIME' ? '✅' : '❌';
  console.log(`[${icon} ${report.status}] ${report.testId}: Payload: ${JSON.stringify(report.payload)}`);
  console.log(`   Expected:   ${report.expected}`);
  console.log(`   Actual:     ${report.actual}`);
  console.log(`   Difference: ${report.difference}`);
  console.log(`   Evidence:   ${JSON.stringify(report.rawEvidence).slice(0, 160)}...`);
  console.log('----------------------------------------------------------------');
}

async function runClarificationRetest() {
  console.log('\n================================================================');
  console.log('🚀 EXECUTING PHASE 4 FINANCIAL CLARIFICATION & DEFECT FIX RETEST');
  console.log('================================================================\n');

  const testStudentId = 'STU_CLARIFY_001';
  const testStudentName = 'Manoj Adhikari';

  // Seed baseline student and bill in emulator
  await db.collection('users').doc(testStudentId).set({
    id: testStudentId,
    fullName: testStudentName,
    email: 'student.manoj@shikshantar.edu.np',
    role: 'student',
    status: 'approved',
    class: 'Class 9',
    rollNumber: '12',
    advanceBalance: 0,
    academicYear: '2083',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // --------------------------------------------------------------------------
  // SECTION 1: MALFORMED / DECIMAL INTEGER VALIDATION RETEST
  // --------------------------------------------------------------------------
  console.log('--- SECTION 1: DECIMAL / MALFORMED INPUT VALIDATION RETEST ---');

  const testPayloads = [
    { id: 'PAYLOAD-DEC-01', input: '5000.75', label: 'Decimal string with period' },
    { id: 'PAYLOAD-DEC-02', input: '5000,75', label: 'Decimal string with comma' },
    { id: 'PAYLOAD-DEC-03', input: '5000 75', label: 'Spaced numbers' },
    { id: 'PAYLOAD-DEC-04', input: '5,000', label: 'Formatted thousands comma' },
    { id: 'PAYLOAD-DEC-05', input: '5000abc', label: 'Alphanumeric trailing chars' },
    { id: 'PAYLOAD-DEC-06', input: 'abc5000', label: 'Alphanumeric leading chars' },
    { id: 'PAYLOAD-DEC-07', input: '-5000', label: 'Negative integer string' },
    { id: 'PAYLOAD-DEC-08', input: '+5000', label: 'Signed positive string' },
    { id: 'PAYLOAD-DEC-09', input: '5e3', label: 'Scientific exponential notation (lowercase)' },
    { id: 'PAYLOAD-DEC-10', input: '5E3', label: 'Scientific exponential notation (uppercase)' },
    { id: 'PAYLOAD-DEC-11', input: '0.5', label: 'Fractional string' },
    { id: 'PAYLOAD-DEC-12', input: '5000\n', label: 'Newline trailing character' },
    { id: 'PAYLOAD-DEC-13', input: '5000\t', label: 'Tab trailing character' },
    { id: 'PAYLOAD-DEC-14', input: 'NaN', label: 'NaN literal string' },
    { id: 'PAYLOAD-DEC-15', input: '', label: 'Empty string' },
    { id: 'PAYLOAD-DEC-16', input: ' ', label: 'Whitespace string' },
    { id: 'PAYLOAD-DEC-17', input: null, label: 'Null value' },
    { id: 'PAYLOAD-DEC-18', input: undefined, label: 'Undefined value' },
    { id: 'PAYLOAD-DEC-19', input: 5000.75, label: 'Numeric float decimal' },
    { id: 'PAYLOAD-DEC-20', input: -5000, label: 'Numeric negative integer' },
    { id: 'PAYLOAD-DEC-21', input: Infinity, label: 'Numeric Infinity' },
    { id: 'PAYLOAD-DEC-22', input: -Infinity, label: 'Numeric -Infinity' },
    { id: 'PAYLOAD-DEC-23', input: NaN, label: 'Numeric NaN' },
  ];

  for (const item of testPayloads) {
    const receiptNo = `RCT-DEC-${item.id}`;
    let rejected = false;
    let errorMessage = '';
    let dbMutated = false;

    // Snapshot DB state before attempt
    const preStudent = (await db.collection('users').doc(testStudentId).get()).data();
    const preTxSnap = await db.collection('transactions').where('receiptNo', '==', receiptNo).get();
    const preTxCount = preTxSnap.size;

    try {
      await executeCashFeePayment({
        receiptNo,
        student: {
          id: testStudentId,
          name: testStudentName,
          fullName: testStudentName,
          class: 'Class 9'
        },
        netPayable: 5000,
        baseAmount: 5000,
        cashTendered: item.input as any,
        additionalCharges: [],
        discounts: [],
        paymentCategory: 'Regular Monthly Fee',
        operatorName: 'Audit Test Operator',
        operatorUid: 'AUDIT_OP'
      });
    } catch (err: any) {
      rejected = true;
      errorMessage = err.message;
    }

    // Check DB state after attempt
    const postTxSnap = await db.collection('transactions').where('receiptNo', '==', receiptNo).get();
    const postStudent = (await db.collection('users').doc(testStudentId).get()).data();

    if (postTxSnap.size > preTxCount || postStudent?.advanceBalance !== preStudent?.advanceBalance) {
      dbMutated = true;
    }

    // A valid integer input must be strictly positive whole integer.
    // Malformed payloads (decimals, trailing letters, negative, scientific notation) must be REJECTED with NO database mutation.
    const isPassed = rejected && !dbMutated;

    recordTest({
      section: 'Decimal / Malformed Validation',
      testId: item.id,
      payload: item.input,
      expected: 'REJECTED before financial mutation, DB mutated: false',
      actual: rejected ? `REJECTED: "${errorMessage}", DB mutated: ${dbMutated}` : `ACCEPTED (SILENT ACCEPTANCE), DB mutated: ${dbMutated}`,
      difference: isPassed ? '0 (Properly Rejected)' : 'FAIL: Malformed payload accepted or DB mutated',
      status: isPassed ? 'PASS-RUNTIME' : 'FAIL',
      rawEvidence: { payload: item.input, rejected, errorMessage, dbMutated, txCreated: postTxSnap.size }
    });
  }

  // --------------------------------------------------------------------------
  // SECTION 2: VALID INPUT REGRESSIONS (5000, 3500, 9600, RETURN, ADVANCE)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: VALID PAYMENT FLOW REGRESSIONS ---');

  // Authenticate test admin/cashier user in client Auth SDK
  const accountantUid = 'ADMIN_TEST_UID';
  await db.collection('users').doc(accountantUid).set({
    uid: accountantUid,
    role: 'admin',
    adminTier: 'primary',
    status: 'approved',
    email: 'admin@shikshantar.edu.np',
    fullName: 'Audit Test Admin',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  const customToken = await admin.auth().createCustomToken(accountantUid, { role: 'admin', adminTier: 'primary', email: 'admin@shikshantar.edu.np' });
  await signInWithCustomToken(auth, customToken);

  // Test 2.1: Valid exact payment (5000 NPR)
  {
    const receiptNo = `RCT-VALID-5000`;
    const res = await executeCashFeePayment({
      receiptNo,
      student: { id: testStudentId, name: testStudentName, fullName: testStudentName, class: 'Class 9' },
      netPayable: 5000,
      baseAmount: 5000,
      cashTendered: 5000,
      additionalCharges: [],
      discounts: [],
      paymentCategory: 'Regular Monthly Fee',
      operatorName: 'Audit Operator',
      operatorUid: 'OP_1'
    });

    const pass = res.breakdown.amountApplied === 5000 && res.breakdown.cashTendered === 5000 && res.breakdown.changeReturned === 0;
    recordTest({
      section: 'Valid Payment Regressions',
      testId: 'VAL-PAY-01',
      payload: 5000,
      expected: 'Amount: 5000, CashTendered: 5000, Change: 0',
      actual: `Amount: ${res.breakdown.amountApplied}, CashTendered: ${res.breakdown.cashTendered}, Change: ${res.breakdown.changeReturned}`,
      difference: pass ? '0 (Exact)' : 'Mismatch',
      status: pass ? 'PASS-RUNTIME' : 'FAIL',
      rawEvidence: res
    });
  }

  // Test 2.2: Valid partial payment (3500 of 8000 NPR)
  {
    const receiptNo = `RCT-VALID-3500`;
    const res = await executeCashFeePayment({
      receiptNo,
      student: { id: testStudentId, name: testStudentName, fullName: testStudentName, class: 'Class 9' },
      netPayable: 8000,
      baseAmount: 8000,
      cashTendered: 3500,
      additionalCharges: [],
      discounts: [],
      paymentCategory: 'Regular Monthly Fee',
      operatorName: 'Audit Operator',
      operatorUid: 'OP_1'
    });

    const pass = res.breakdown.amountApplied === 3500 && res.breakdown.cashTendered === 3500 && res.breakdown.changeReturned === 0;
    recordTest({
      section: 'Valid Payment Regressions',
      testId: 'VAL-PAY-02',
      payload: 3500,
      expected: 'Amount: 3500, CashTendered: 3500, Change: 0',
      actual: `Amount: ${res.breakdown.amountApplied}, CashTendered: ${res.breakdown.cashTendered}, Change: ${res.breakdown.changeReturned}`,
      difference: pass ? '0 (Exact Partial)' : 'Mismatch',
      status: pass ? 'PASS-RUNTIME' : 'FAIL',
      rawEvidence: res
    });
  }

  // Test 2.3: Valid exact payment (9600 NPR)
  {
    const receiptNo = `RCT-VALID-9600`;
    const res = await executeCashFeePayment({
      receiptNo,
      student: { id: testStudentId, name: testStudentName, fullName: testStudentName, class: 'Class 9' },
      netPayable: 9600,
      baseAmount: 9600,
      cashTendered: 9600,
      additionalCharges: [],
      discounts: [],
      paymentCategory: 'Regular Monthly Fee',
      operatorName: 'Audit Operator',
      operatorUid: 'OP_1'
    });

    const pass = res.breakdown.amountApplied === 9600 && res.breakdown.cashTendered === 9600 && res.breakdown.changeReturned === 0;
    recordTest({
      section: 'Valid Payment Regressions',
      testId: 'VAL-PAY-03',
      payload: 9600,
      expected: 'Amount: 9600, CashTendered: 9600, Change: 0',
      actual: `Amount: ${res.breakdown.amountApplied}, CashTendered: ${res.breakdown.cashTendered}, Change: ${res.breakdown.changeReturned}`,
      difference: pass ? '0 (Exact)' : 'Mismatch',
      status: pass ? 'PASS-RUNTIME' : 'FAIL',
      rawEvidence: res
    });
  }

  // Test 2.4: Bill = 9600, Cash = 10000, Decision = RETURN
  {
    const receiptNo = `RCT-OVP-RETURN-9600`;
    const res = await executeCashFeePayment({
      receiptNo,
      student: { id: testStudentId, name: testStudentName, fullName: testStudentName, class: 'Class 9' },
      netPayable: 9600,
      baseAmount: 9600,
      cashTendered: 10000,
      excessDecision: 'RETURN',
      additionalCharges: [],
      discounts: [],
      paymentCategory: 'Regular Monthly Fee',
      operatorName: 'Audit Operator',
      operatorUid: 'OP_1'
    });

    const pass = res.breakdown.amountApplied === 9600 &&
      res.breakdown.cashTendered === 10000 &&
      res.breakdown.changeReturned === 400 &&
      res.breakdown.advanceCreated === 0;

    recordTest({
      section: 'Valid Payment Regressions',
      testId: 'ORACLE-OVP-01',
      payload: { netPayable: 9600, cashTendered: 10000, decision: 'RETURN' },
      expected: 'Allocation: 9600, Change: 400, Advance: 0',
      actual: `Allocation: ${res.breakdown.amountApplied}, Change: ${res.breakdown.changeReturned}, Advance: ${res.breakdown.advanceCreated}`,
      difference: pass ? '0 (Exact)' : 'Mismatch',
      status: pass ? 'PASS-RUNTIME' : 'FAIL',
      rawEvidence: res
    });
  }

  // Test 2.5: Bill = 9600, Cash = 10000, Decision = ADVANCE
  {
    const receiptNo = `RCT-OVP-ADVANCE-9600`;
    const res = await executeCashFeePayment({
      receiptNo,
      student: { id: testStudentId, name: testStudentName, fullName: testStudentName, class: 'Class 9' },
      netPayable: 9600,
      baseAmount: 9600,
      cashTendered: 10000,
      excessDecision: 'ADVANCE',
      additionalCharges: [],
      discounts: [],
      paymentCategory: 'Regular Monthly Fee',
      operatorName: 'Audit Operator',
      operatorUid: 'OP_1'
    });

    const pass = res.breakdown.amountApplied === 9600 &&
      res.breakdown.cashTendered === 10000 &&
      res.breakdown.changeReturned === 0 &&
      res.breakdown.advanceCreated === 400;

    recordTest({
      section: 'Valid Payment Regressions',
      testId: 'ORACLE-OVP-02',
      payload: { netPayable: 9600, cashTendered: 10000, decision: 'ADVANCE' },
      expected: 'Allocation: 9600, Change: 0, Advance: 400',
      actual: `Allocation: ${res.breakdown.amountApplied}, Change: ${res.breakdown.changeReturned}, Advance: ${res.breakdown.advanceCreated}`,
      difference: pass ? '0 (Exact)' : 'Mismatch',
      status: pass ? 'PASS-RUNTIME' : 'FAIL',
      rawEvidence: res
    });
  }

  // --------------------------------------------------------------------------
  // SECTION 3: FM-CASH-09 OVER-ALLOCATION CONSERVATION RETEST
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 3: FM-CASH-09 OVER-ALLOCATION CONSERVATION RETEST ---');

  const testBillId = 'BILL_OVERALLOC_6000_FIXED';
  const billRef = db.collection('remitBills').doc(testBillId);

  // Seed Bill: Total = 6000, Already Paid = 4000, Due = 2000
  await billRef.set({
    id: testBillId,
    billId: testBillId,
    billNo: 'RMT-2083-CONSERVE-FIX',
    studentId: testStudentId,
    studentName: testStudentName,
    class: 'Class 9',
    academicYear: '2083',
    status: 'partial',
    subtotal: 6000,
    totalAmount: 6000,
    paidAmount: 4000,
    dueAmount: 2000,
    coveredMonths: ['Baisakh', 'Jestha', 'Ashadh'],
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  const paymentAttempt = 3500;
  const billTotal = 6000;
  const alreadyPaid = 4000;
  const netDueBeforePayment = billTotal - alreadyPaid; // 2000 NPR

  const receiptNoConserve = 'RCT-CONSERVE-3500-FIX';
  const paymentResult = await executeCashFeePayment({
    receiptNo: receiptNoConserve,
    student: {
      id: testStudentId,
      name: testStudentName,
      fullName: testStudentName,
      class: 'Class 9'
    },
    netPayable: netDueBeforePayment, // 2000 NPR
    baseAmount: netDueBeforePayment,
    cashTendered: paymentAttempt, // 3500 NPR
    excessDecision: 'ADVANCE',
    additionalCharges: [],
    discounts: [],
    paymentCategory: 'Bill Settlement',
    operatorName: 'Audit Test Operator',
    operatorUid: 'AUDIT_OP',
    prefilledBillData: {
      id: testBillId,
      billId: testBillId,
      amount: billTotal,
      totalAmount: billTotal,
      paidAmount: alreadyPaid,
      dueAmount: netDueBeforePayment
    }
  });

  const billAfterSnap = await billRef.get();
  const billAfterData = billAfterSnap.data();

  const actualFinalBillPaid = billAfterData?.paidAmount;
  const actualFinalBillDue = billAfterData?.dueAmount;
  const actualNewBillAllocation = actualFinalBillPaid - alreadyPaid;
  const actualUnallocatedAdvance = paymentResult.breakdown.advanceCreated || 0;
  const actualChangeReturned = paymentResult.breakdown.changeReturned || 0;

  const actualConservedTotal = actualNewBillAllocation + actualUnallocatedAdvance + actualChangeReturned;
  const conservationDiff = actualConservedTotal - paymentAttempt;

  const isConservationExact = actualNewBillAllocation === 2000 &&
    actualFinalBillPaid === 6000 &&
    actualFinalBillDue === 0 &&
    actualUnallocatedAdvance === 1500 &&
    actualConservedTotal === 3500 &&
    conservationDiff === 0;

  recordTest({
    section: 'Over-Allocation Conservation',
    testId: 'FM-CASH-09',
    payload: { billTotal, alreadyPaid, paymentAttempt, excessDecision: 'ADVANCE' },
    expected: `Allocation: 2000, FinalPaid: 6000, FinalDue: 0, Advance: 1500, Sum: 3500`,
    actual: `Allocation: ${actualNewBillAllocation}, FinalPaid: ${actualFinalBillPaid}, FinalDue: ${actualFinalBillDue}, Advance: ${actualUnallocatedAdvance}, Sum: ${actualConservedTotal}`,
    difference: isConservationExact ? '0 (Perfect Conservation: 3500 = 2000 + 1500 + 0)' : `Discrepancy: ${conservationDiff} NPR`,
    status: isConservationExact ? 'PASS-RUNTIME' : 'FAIL',
    rawEvidence: {
      billBefore: { billTotal, alreadyPaid, netDueBeforePayment },
      paymentResult,
      billAfterData,
      conservation: {
        paymentAttempt,
        actualNewBillAllocation,
        actualUnallocatedAdvance,
        actualChangeReturned,
        actualConservedTotal,
        conservationDiff
      }
    }
  });

  // --------------------------------------------------------------------------
  // SUMMARY REPORT
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('📊 FINANCIAL CLARIFICATION RETEST RESULTS SUMMARY');
  console.log('================================================================');

  const total = reports.length;
  const passed = reports.filter(t => t.status === 'PASS-RUNTIME').length;
  const failed = reports.filter(t => t.status === 'FAIL').length;
  const notExecuted = reports.filter(t => t.status === 'NOT-EXECUTED').length;
  const blocked = reports.filter(t => t.status === 'BLOCKED').length;

  console.log(`TOTAL TESTS:   ${total}`);
  console.log(`PASSED:        ${passed}`);
  console.log(`FAILED:        ${failed}`);
  console.log(`NOT-EXECUTED:  ${notExecuted}`);
  console.log(`BLOCKED:       ${blocked}`);
  console.log(`PASS RATE:     ${Math.round((passed / total) * 100)}%`);
  console.log('================================================================\n');

  if (failed > 0) {
    console.error(`❌ DEFECT PERSISTS in ${failed} test(s).`);
    process.exit(1);
  } else {
    console.log('✅ ALL RETEST & REGRESSION SCENARIOS PASSED WITH 100% FIDELITY.');
    process.exit(0);
  }
}

runClarificationRetest().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
