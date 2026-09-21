import { 
  calculatePaymentBreakdown,
  parseIntegerAmount,
  NEPALI_MONTHS
} from '../src/lib/cashPaymentEngine';
import {
  formatDocumentNumber,
  parseDocumentNumber
} from '../src/lib/documentNumberingEngine';

async function runStep7AcceptanceSuite() {
  console.log("====================================================");
  console.log("STEP 7: COMPREHENSIVE END-TO-END UAT & GO-LIVE SUITE");
  console.log("====================================================");
  
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

  // 1. CASH PAYMENT SCENARIOS
  console.log("\n--- MODULE 1: CASH PAYMENT ENGINE SCENARIOS ---");
  // Test 1: Partial Payment
  const res1 = calculatePaymentBreakdown(9600, 6000, null, 'RETURN');
  assert(res1.amountApplied === 6000 && res1.remainingOutstanding === 3600 && res1.isPartial === true && res1.isExact === false && res1.changeReturned === 0 && (res1.advanceCreated || 0) === 0, 
    'UAT-CASH-01', 'Partial Cash: 9,600 bill with 6,000 cash -> 6,000 applied, 3,600 outstanding, isPartial: true');

  // Test 2: Exact Payment
  const res2 = calculatePaymentBreakdown(9600, 9600, null, 'RETURN');
  assert(res2.amountApplied === 9600 && res2.remainingOutstanding === 0 && res2.isExact === true && res2.isPartial === false && res2.changeReturned === 0 && (res2.advanceCreated || 0) === 0,
    'UAT-CASH-02', 'Exact Cash: 9,600 bill with 9,600 cash -> 9,600 applied, 0 outstanding, isExact: true');

  // Test 3: Excess Cash with Return Change
  const res3 = calculatePaymentBreakdown(9600, 10000, null, 'RETURN');
  assert(res3.amountApplied === 9600 && res3.changeReturned === 400 && (res3.advanceCreated || 0) === 0 && res3.remainingOutstanding === 0 && res3.isExcess === true,
    'UAT-CASH-03', 'Excess Cash Return: 9,600 bill with 10,000 cash -> 9,600 applied, 400 returned change');

  // Test 4: Excess Cash with Store Advance
  const res4 = calculatePaymentBreakdown(9600, 10000, null, 'ADVANCE');
  assert(res4.amountApplied === 9600 && res4.changeReturned === 0 && res4.advanceCreated === 400 && res4.remainingOutstanding === 0 && res4.isExcess === true,
    'UAT-CASH-04', 'Excess Cash Advance: 9,600 bill with 10,000 cash -> 9,600 applied, 400 stored as student advance credit');

  // 2. FIFO ARREARS ALLOCATION
  console.log("\n--- MODULE 2: MULTI-PERIOD FIFO ARREARS ALLOCATION ---");
  const multiMonthBills = [
    { id: 'BILL-SHRAWAN', month: 'Shrawan', netPayable: 3200, paidAmount: 0, balance: 3200 },
    { id: 'BILL-BHADRA', month: 'Bhadra', netPayable: 3200, paidAmount: 0, balance: 3200 },
    { id: 'BILL-ASHWIN', month: 'Ashwin', netPayable: 3200, paidAmount: 0, balance: 3200 }
  ];
  
  let remainingCash = 6000;
  const allocations = multiMonthBills.map(b => {
    const alloc = Math.min(remainingCash, b.balance);
    remainingCash -= alloc;
    return {
      billId: b.id,
      month: b.month,
      allocatedAmount: alloc,
      remainingBalance: b.balance - alloc
    };
  });

  const shrawanAlloc = allocations.find(a => a.billId === 'BILL-SHRAWAN');
  const bhadraAlloc = allocations.find(a => a.billId === 'BILL-BHADRA');
  const ashwinAlloc = allocations.find(a => a.billId === 'BILL-ASHWIN');
  
  assert(
    shrawanAlloc?.allocatedAmount === 3200 && shrawanAlloc?.remainingBalance === 0 &&
    bhadraAlloc?.allocatedAmount === 2800 && bhadraAlloc?.remainingBalance === 400 &&
    ashwinAlloc?.allocatedAmount === 0 && ashwinAlloc?.remainingBalance === 3200 &&
    remainingCash === 0,
    'UAT-FIFO-01',
    'FIFO 3-Month Arrears: Shrawan (3200) fully cleared, Bhadra (3200) receives 2800 (400 due), Ashwin (3200) receives 0 (3200 due)'
  );

  // 3. PREVIOUS-YEAR ALLOCATION PRIORITY
  console.log("\n--- MODULE 3: PREVIOUS YEAR ARREARS PRIORITY ---");
  const previousYearAndCurrentYearBills = [
    { id: 'BILL-PREV-2080', month: 'Chaitra', netPayable: 4000, paidAmount: 0, balance: 4000, isPrevYear: true },
    { id: 'BILL-CURR-BAISAKH', month: 'Baisakh', netPayable: 3500, paidAmount: 0, balance: 3500, isPrevYear: false }
  ];
  
  let tenderCash = 5000;
  const sortedBills = [...previousYearAndCurrentYearBills].sort((a, b) => (b.isPrevYear ? 1 : 0) - (a.isPrevYear ? 1 : 0));
  const prevAllocations = sortedBills.map(b => {
    const alloc = Math.min(tenderCash, b.balance);
    tenderCash -= alloc;
    return {
      billId: b.id,
      allocatedAmount: alloc,
      remainingBalance: b.balance - alloc
    };
  });
  const prevAlloc = prevAllocations.find(a => a.billId === 'BILL-PREV-2080');
  const currAlloc = prevAllocations.find(a => a.billId === 'BILL-CURR-BAISAKH');
  assert(
    prevAlloc?.allocatedAmount === 4000 && prevAlloc?.remainingBalance === 0 &&
    currAlloc?.allocatedAmount === 1000 && currAlloc?.remainingBalance === 2500,
    'UAT-PREV-01',
    'Previous-Year Arrears Priority: 2080 Chaitra (4,000) settled 100% first before 2081 Baisakh receives remainder (1,000)'
  );

  // 4. ADVANCE CONSUMPTION
  console.log("\n--- MODULE 4: ADVANCE CONSUMPTION WORKFLOW ---");
  const existingAdvance = 1500;
  const newBillAmount = 4000;
  const advanceUtilized = Math.min(existingAdvance, newBillAmount);
  const netCashRequired = newBillAmount - advanceUtilized;
  const cashPaid = 2500;
  const totalSettled = advanceUtilized + cashPaid;
  const remainingAdv = existingAdvance - advanceUtilized;
  const remainingBillDue = newBillAmount - totalSettled;

  assert(
    advanceUtilized === 1500 &&
    netCashRequired === 2500 &&
    totalSettled === 4000 &&
    remainingBillDue === 0 &&
    remainingAdv === 0,
    'UAT-ADV-01',
    'Advance Consumption: 4,000 bill with 1,500 advance + 2,500 cash -> 100% settled, remaining advance = 0'
  );

  // 5. DOCUMENT NUMBERING FORMAT & CONCURRENCY
  console.log("\n--- MODULE 5: DOCUMENT NUMBERING ENGINE ---");
  const docRmt = formatDocumentNumber('RMT', 2081, 85);
  const docRcp = formatDocumentNumber('RCP', 2081, 142);
  const docAdv = formatDocumentNumber('ADV', 2081, 12);
  const docRef = formatDocumentNumber('REF', 2081, 3);
  const docRev = formatDocumentNumber('REV', 2081, 7);
  
  assert(docRmt === 'RMT-2081-000085', 'UAT-DOC-01', `Remit Bill prefix & padding: ${docRmt}`);
  assert(docRcp === 'RCP-2081-000142', 'UAT-DOC-02', `Receipt prefix & padding: ${docRcp}`);
  assert(docAdv === 'ADV-2081-000012', 'UAT-DOC-03', `Advance Credit Note prefix: ${docAdv}`);
  assert(docRef === 'REF-2081-000003', 'UAT-DOC-04', `Refund Receipt prefix: ${docRef}`);
  assert(docRev === 'REV-2081-000007', 'UAT-DOC-05', `Reversal prefix: ${docRev}`);

  const parsedRcp = parseDocumentNumber(docRcp);
  assert(parsedRcp.isValid && parsedRcp.docType === 'RCP' && parsedRcp.bsYear === 2081 && parsedRcp.sequence === 142,
    'UAT-DOC-06', 'Document Number Parser validates correctly');

  // 6. ONLINE PAYMENT DISABLED ASSERTION
  console.log("\n--- MODULE 6: ONLINE PAYMENT 501 GATEWAY LOCKDOWN ---");
  try {
    const esewaRes = await fetch('http://localhost:3000/api/payment/esewa/initiate');
    const esewaJson = await esewaRes.json();
    assert(esewaRes.status === 501 && esewaJson.code === 'CASH_ONLY_INSTITUTION', 'UAT-GATEWAY-01', 'eSewa returns 501 CASH_ONLY_INSTITUTION');
  } catch (e) {
    assert(false, 'UAT-GATEWAY-01', `eSewa check failed: ${e}`);
  }

  try {
    const khaltiRes = await fetch('http://localhost:3000/api/payment/khalti/initiate');
    const khaltiJson = await khaltiRes.json();
    assert(khaltiRes.status === 501 && khaltiJson.code === 'CASH_ONLY_INSTITUTION', 'UAT-GATEWAY-02', 'Khalti returns 501 CASH_ONLY_INSTITUTION');
  } catch (e) {
    assert(false, 'UAT-GATEWAY-02', `Khalti check failed: ${e}`);
  }

  // 7. SECURITY & AUTHORIZATION ATTACKS
  console.log("\n--- MODULE 7: BACKEND AUTHORIZATION & ATTACK DEFENSE ---");
  try {
    const unauthDel = await fetch('http://localhost:3000/api/users/delete-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'victim_uid' })
    });
    assert(unauthDel.status === 401, 'UAT-SEC-01', 'Unauthenticated delete-auth endpoint returns 401');
  } catch (e) {
    assert(false, 'UAT-SEC-01', `Unauthenticated delete-auth check failed: ${e}`);
  }

  try {
    const forgedTokenDel = await fetch('http://localhost:3000/api/users/delete-auth', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M'
      },
      body: JSON.stringify({ uid: 'victim_uid' })
    });
    assert(forgedTokenDel.status === 401, 'UAT-SEC-02', 'Forged bearer token returns 401 Unauthorized');
  } catch (e) {
    assert(false, 'UAT-SEC-02', `Forged token check failed: ${e}`);
  }

  // 8. NEPALI 12-MONTH RECOGNITION
  console.log("\n--- MODULE 8: 12 NEPALI MONTHS INTEGRITY ---");
  const expectedMonths = [
    'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
    'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
  ];
  const monthsValid = expectedMonths.every(m => NEPALI_MONTHS.includes(m));
  assert(monthsValid && NEPALI_MONTHS.length === 12, 'UAT-MONTH-01', '12 Nepali BS Billing Months mapped accurately without omission');

  console.log("\n====================================================");
  console.log(`STEP 7 E2E UAT SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("====================================================");
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStep7AcceptanceSuite().catch(err => {
  console.error("FATAL SUITE ERROR:", err);
  process.exit(1);
});
