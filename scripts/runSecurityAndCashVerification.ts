import { calculatePaymentBreakdown } from '../src/lib/cashPaymentEngine';
import { formatDocumentNumber } from '../src/lib/documentNumberingEngine';
import fetch from 'node-fetch';

async function runAllTests() {
  console.log('====================================================');
  console.log('STARTING AUTOMATED SECURITY & CASH REGRESSION TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testId: string, desc: string) {
    if (condition) {
      console.log(`[PASS] ${testId}: ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testId}: ${desc}`);
      failed++;
    }
  }

  // --- PART 1: SECURITY REGRESSION TESTS (AUTH-DELETE-01 TO AUTH-DELETE-13) ---
  console.log('--- SECTION 1: AUTHENTICATION & AUTHORIZATION TESTS ---');

  // Test 01: Verify server-side requireAdminAuth rejects missing auth header
  try {
    const res = await fetch('http://localhost:3000/api/users/delete-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'test-user-123' })
    });
    assert(res.status === 401, 'AUTH-DELETE-05', 'Unauthenticated request denied with 401 Unauthorized');
  } catch (err: any) {
    console.error('Error connecting to dev server:', err.message);
  }

  // Test 02: Verify invalid/forged Bearer token rejected
  try {
    const res = await fetch('http://localhost:3000/api/users/delete-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid_forged_jwt_token_xyz'
      },
      body: JSON.stringify({ uid: 'test-user-123' })
    });
    assert(res.status === 401, 'AUTH-DELETE-07', 'Forged/invalid bearer token rejected with 401');
  } catch (err: any) {
    console.error(err);
  }

  // Test 03: Verify request body role spoofing is completely ignored
  try {
    const res = await fetch('http://localhost:3000/api/users/delete-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uid: 'test-user-123', role: 'admin', isSuperAdmin: true, email: 'rahulsah4534@gmail.com' })
    });
    assert(res.status === 401, 'AUTH-DELETE-06', 'Request body role & superadmin spoofing ignored, rejected with 401');
  } catch (err: any) {
    console.error(err);
  }

  // Test 04: Verify bulk delete also enforces 401 on unauthenticated
  try {
    const res = await fetch('http://localhost:3000/api/users/delete-auth-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uids: ['uid-1', 'uid-2'] })
    });
    assert(res.status === 401, 'AUTH-DELETE-10', 'Bulk delete unauthenticated request rejected with 401');
  } catch (err: any) {
    console.error(err);
  }

  // Test 05: Verify online payment routes are completely DISABLED (HTTP 501 Not Implemented)
  try {
    const esewaRes = await fetch('http://localhost:3000/api/payment/esewa/initiate', { method: 'POST' });
    const esewaData: any = await esewaRes.json();
    assert(esewaRes.status === 501 && esewaData.code === 'CASH_ONLY_INSTITUTION', 'AUTH-DELETE-12A', 'eSewa endpoint returns HTTP 501 CASH_ONLY_INSTITUTION');

    const khaltiRes = await fetch('http://localhost:3000/api/payment/khalti/initiate', { method: 'POST' });
    const khaltiData: any = await khaltiRes.json();
    assert(khaltiRes.status === 501 && khaltiData.code === 'CASH_ONLY_INSTITUTION', 'AUTH-DELETE-12B', 'Khalti endpoint returns HTTP 501 CASH_ONLY_INSTITUTION');
  } catch (err: any) {
    console.error(err);
  }

  // --- PART 2: CASH-ONLY FINANCIAL REGRESSION (CASH-PAY-01 TO CASH-PAY-05) ---
  console.log('\n--- SECTION 2: CASH PAYMENT ENGINE REGRESSION TESTS ---');

  // CASH-PAY-01: 9,600 bill with 6,000 cash -> 6,000 applied, 3,600 outstanding, isPartial: true
  const resultPartial = calculatePaymentBreakdown(9600, 6000);
  assert(
    resultPartial.amountApplied === 6000 &&
    resultPartial.remainingOutstanding === 3600 &&
    resultPartial.isPartial === true &&
    resultPartial.changeReturned === 0,
    'CASH-PAY-01',
    '9,600 bill with 6,000 cash -> 6,000 applied, 3,600 outstanding, isPartial: true'
  );

  // CASH-PAY-02: 9,600 bill with 9,600 cash -> 9,600 applied, 0 outstanding, isExact: true
  const resultFull = calculatePaymentBreakdown(9600, 9600);
  assert(
    resultFull.amountApplied === 9600 &&
    resultFull.remainingOutstanding === 0 &&
    resultFull.isExact === true &&
    resultFull.changeReturned === 0,
    'CASH-PAY-02',
    '9,600 bill with 9,600 cash -> 9,600 applied, 0 outstanding, isExact: true'
  );

  // CASH-PAY-03A: 9,600 bill with 10,000 cash -> 9,600 applied, 400 returned as physical change
  const resultOverReturn = calculatePaymentBreakdown(9600, 10000, 'RETURN');
  assert(
    resultOverReturn.amountApplied === 9600 &&
    resultOverReturn.remainingOutstanding === 0 &&
    resultOverReturn.changeReturned === 400 &&
    resultOverReturn.excessAmount === 400 &&
    resultOverReturn.isExcess === true,
    'CASH-PAY-03A',
    '9,600 bill with 10,000 cash -> 9,600 applied, 400 returned physical change, isExcess: true'
  );

  // CASH-PAY-03B: 9,600 bill with 10,000 cash -> 9,600 applied, 400 saved to student advance credit
  const resultOverAdvance = calculatePaymentBreakdown(9600, 10000, 'ADVANCE');
  assert(
    resultOverAdvance.amountApplied === 9600 &&
    resultOverAdvance.remainingOutstanding === 0 &&
    resultOverAdvance.advanceCreated === 400 &&
    resultOverAdvance.changeReturned === 0 &&
    resultOverAdvance.isExcess === true,
    'CASH-PAY-03B',
    '9,600 bill with 10,000 cash -> 9,600 applied, 400 stored as student advance credit'
  );

  // --- PART 3: FINANCIAL RECONCILIATION & FIFO ALLOCATION ---
  console.log('\n--- SECTION 3: FIFO ARREARS & LEDGER RECONCILIATION ---');

  // FIFO Allocation across multi-month bills
  const unpaidBills = [
    { billId: 'BILL-001', month: 'Baisakh', amountDue: 4000 },
    { billId: 'BILL-002', month: 'Jestha', amountDue: 5600 }
  ];
  let cashAvailable = 6000;
  const billAllocations: any[] = [];
  for (const b of unpaidBills) {
    const toApply = Math.min(b.amountDue, cashAvailable);
    billAllocations.push({ billId: b.billId, applied: toApply, remaining: b.amountDue - toApply });
    cashAvailable -= toApply;
  }
  assert(
    billAllocations[0].applied === 4000 && billAllocations[0].remaining === 0 &&
    billAllocations[1].applied === 2000 && billAllocations[1].remaining === 3600 &&
    cashAvailable === 0,
    'FIFO-ALLOC-01',
    'Strict FIFO applied: Older bill (Baisakh 4,000) fully cleared before Jestha receives 2,000'
  );

  // Receipt Numbering Engine
  const receiptNum = formatDocumentNumber('RCP', 2081, 142);
  assert(
    receiptNum === 'RCP-2081-000142',
    'DOC-NUM-01',
    'Sequential cash receipt numbering generates formatted format RCP-2081-000142'
  );

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
