/**
 * REAL CONCURRENT PAYMENT VS REFUND STRESS & RACE VERIFICATION SUITE
 * 
 * Category: TRUE CONCURRENCY TEST (7) & REAL APPLICATION HANDLER TEST (6) on REAL FIRESTORE (5)
 * 
 * Invokes the actual production engines:
 * - executeCashFeePayment (from src/lib/cashPaymentEngine)
 * - processPaymentRefund (from src/lib/paymentRefundEngine)
 * 
 * Runs 20 repeated iterations of concurrent payment vs refund races against real Firestore.
 */

import fs from 'fs';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { executeCashFeePayment } from '../src/lib/cashPaymentEngine';
import { processPaymentRefund } from '../src/lib/paymentRefundEngine';

interface IterationReport {
  iteration: number;
  payment2Outcome: 'FULFILLED' | 'REJECTED';
  refundOutcome: 'FULFILLED' | 'REJECTED';
  finalBillPaid: number;
  finalBillDue: number;
  finalBillStatus: string;
  tx1Status: string;
  tx2Status?: string;
  cashReconciled: boolean;
  allocationIntegrityPassed: boolean;
  invariantsPassed: boolean;
  errors: string[];
}

async function runConcurrentPaymentVsRefundSuite() {
  console.log('==============================================================================');
  console.log('STARTING REAL CONCURRENT PAYMENT VS REFUND RACE SUITE (20 ITERATIONS)');
  console.log('Category: TRUE CONCURRENCY TEST on REAL FIRESTORE using REAL PRODUCTION ENGINES');
  console.log('==============================================================================\n');

  const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
  const dbName = cfg.firestoreDatabaseId;
  const app = getApps().length === 0 ? initializeApp(cfg) : getApp();
  const auth = getAuth(app);
  const db = dbName ? getFirestore(app, dbName) : getFirestore(app);

  await signInWithEmailAndPassword(auth, 'admin_test_integration@shikshantar.edu.np', 'AdminTest@12345');
  console.log('Authenticated as Admin for Real Concurrency Engine Tests.\n');

  const TOTAL_ITERATIONS = 20;
  const reports: IterationReport[] = [];

  for (let i = 1; i <= TOTAL_ITERATIONS; i++) {
    const nonce = `${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;
    const studentId = `CONC_STU_${nonce}`;
    const billId = `CONC_BILL_${nonce}`;
    const billTotal = 5000;
    const payment1Amount = 2500;
    const payment2Amount = 2500;
    const receipt1 = `REC_P1_${nonce}`;
    const receipt2 = `REC_P2_${nonce}`;

    const studentUserRef = doc(db, 'users', studentId);
    const billRef = doc(db, 'remitBills', billId);

    // 1. Establish initial Student and Bill in Firestore
    await setDoc(studentUserRef, {
      id: studentId,
      fullName: `Concurrent Test Student ${i}`,
      name: `Concurrent Test Student ${i}`,
      class: 'Class 8',
      rollNumber: `${i}`,
      roll: `${i}`,
      advanceBalance: 0,
      monthlyFee: 2500,
      transportFee: 0,
      isTest: true
    });

    await setDoc(billRef, {
      id: billId,
      billNo: `BIL_CONC_${nonce}`,
      studentId: studentId,
      studentName: `Concurrent Test Student ${i}`,
      class: 'Class 8',
      totalAmount: billTotal,
      amount: billTotal,
      paidAmount: 0,
      dueAmount: billTotal,
      status: 'pending',
      itemizedCharges: [
        { name: 'Tuition Fee - Baisakh', rate: 2500, total: 2500 },
        { name: 'Tuition Fee - Jestha', rate: 2500, total: 2500 }
      ],
      createdAt: '2081-01-01',
      createdBy: 'Admin Cashier',
      isTest: true
    });

    const studentData = {
      id: studentId,
      name: `Concurrent Test Student ${i}`,
      fullName: `Concurrent Test Student ${i}`,
      class: 'Class 8',
      rollNumber: `${i}`,
      roll: `${i}`,
      monthlyFee: 2500,
      transportFee: 0
    };

    // 2. Execute First Payment P1 (NRs. 2,500) sequentially to establish initial paid state
    const billSnapPre = await getDoc(billRef);
    const prefilledBill1 = billSnapPre.data() as any;

    const p1Result = await executeCashFeePayment({
      student: studentData,
      netPayable: 2500,
      cashTendered: 2500,
      amountApplied: 2500,
      receiptNo: receipt1,
      paymentCategory: 'regular',
      baseAmount: 2500,
      additionalCharges: [],
      discounts: [],
      prefilledBillData: prefilledBill1,
      operatorName: 'Cashier Concurrent Suite',
      operatorUid: auth.currentUser?.uid || 'admin'
    });

    const tx1Id = p1Result.transactionId;
    const tx1Ref = doc(db, 'transactions', tx1Id);

    // 3. Prepare Concurrent Race: Payment P2 vs Refund of P1 targeting the SAME student and SAME bill
    const billSnapMid = await getDoc(billRef);
    const prefilledBill2 = billSnapMid.data() as any;

    const payment2Promise = executeCashFeePayment({
      student: studentData,
      netPayable: 2500,
      cashTendered: 2500,
      amountApplied: 2500,
      receiptNo: receipt2,
      paymentCategory: 'regular',
      baseAmount: 2500,
      additionalCharges: [],
      discounts: [],
      prefilledBillData: prefilledBill2,
      operatorName: 'Cashier Concurrent Suite',
      operatorUid: auth.currentUser?.uid || 'admin'
    });

    const refund1Promise = processPaymentRefund({
      transactionId: tx1Id,
      adminName: 'Audit Admin',
      adminEmail: 'admin@shikshantar.edu.np',
      reason: `Concurrent Race Stress Test Iteration ${i}`,
      customDb: db
    });

    // 4. Fire CONCURRENT RACE simultaneously
    const [p2Settled, refundSettled] = await Promise.allSettled([payment2Promise, refund1Promise]);

    // 5. Audit Final State on Firestore
    const errors: string[] = [];
    const billSnapPost = await getDoc(billRef);
    const finalBillData = billSnapPost.data() as any;
    const tx1SnapPost = await getDoc(tx1Ref);
    const tx1Data = tx1SnapPost.data() as any;

    let tx2Id: string | null = null;
    let tx2Data: any = null;
    if (p2Settled.status === 'fulfilled') {
      tx2Id = p2Settled.value.transactionId;
      const tx2SnapPost = await getDoc(doc(db, 'transactions', tx2Id));
      tx2Data = tx2SnapPost.data();
    }

    const finalPaid = Number(finalBillData.paidAmount || 0);
    const finalDue = Number(finalBillData.dueAmount || 0);
    const finalStatus = finalBillData.status;

    // Check Invariants
    // Invariant 1: Non-negative balances
    if (finalPaid < 0) errors.push(`Negative paidAmount: ${finalPaid}`);
    if (finalDue < 0) errors.push(`Negative dueAmount: ${finalDue}`);

    // Invariant 2: Paid does not exceed total
    if (finalPaid > billTotal) errors.push(`paidAmount (${finalPaid}) exceeds billTotal (${billTotal})`);

    // Invariant 3: Math balance consistency
    if (finalPaid + finalDue !== billTotal) {
      errors.push(`Math imbalance: paid (${finalPaid}) + due (${finalDue}) !== total (${billTotal})`);
    }

    // Invariant 4: Status consistency
    if (finalPaid === 0 && !['pending', 'draft'].includes(finalStatus)) {
      errors.push(`Status mismatch: paid is 0 but status is ${finalStatus}`);
    }
    if (finalPaid > 0 && finalPaid < billTotal && finalStatus !== 'partial') {
      errors.push(`Status mismatch: paid is ${finalPaid} (< ${billTotal}) but status is ${finalStatus}`);
    }
    if (finalPaid === billTotal && finalStatus !== 'paid') {
      errors.push(`Status mismatch: paid is ${finalPaid} (== ${billTotal}) but status is ${finalStatus}`);
    }

    // Invariant 5: Transaction status consistency
    if (refundSettled.status === 'fulfilled') {
      if (tx1Data.status !== 'REFUNDED') {
        errors.push(`TX1 expected REFUNDED but found ${tx1Data.status}`);
      }
    }
    if (p2Settled.status === 'fulfilled') {
      if (tx2Data.status !== 'SUCCESS') {
        errors.push(`TX2 expected SUCCESS but found ${tx2Data.status}`);
      }
    }

    // Invariant 6: Allocation survival check (P2 allocation must NOT be wiped out if P2 succeeded)
    let allocationIntegrityPassed = true;
    if (p2Settled.status === 'fulfilled' && refundSettled.status === 'fulfilled') {
      // Both P2 succeeded and P1 was refunded.
      // Net paid should be exactly 2500 (P2's contribution), NOT 0!
      if (finalPaid !== 2500) {
        errors.push(`Allocation wipe defect: P2 succeeded and P1 was refunded, expected net paid 2500 but got ${finalPaid}`);
        allocationIntegrityPassed = false;
      }
    }

    // Invariant 7: Cash Ledger reconciliation
    const cashInQ = query(collection(db, 'cash_ledger'), where('transactionId', 'in', [tx1Id, ...(tx2Id ? [tx2Id] : [])]));
    const cashInSnap = await getDocs(cashInQ);
    let totalCashIn = 0;
    let totalCashOut = 0;
    cashInSnap.forEach(d => {
      const cData = d.data();
      if (cData.type === 'Income') totalCashIn += Number(cData.amount || 0);
      if (cData.type === 'Expense') totalCashOut += Number(cData.amount || 0);
    });

    const netCashInDrawer = totalCashIn - totalCashOut;
    let expectedNetCash = 0;
    if (refundSettled.status === 'fulfilled') expectedNetCash -= 2500; // P1 refunded
    expectedNetCash += 2500; // P1 initial
    if (p2Settled.status === 'fulfilled') expectedNetCash += 2500; // P2 paid

    const cashReconciled = (netCashInDrawer === expectedNetCash);
    if (!cashReconciled) {
      errors.push(`Cash ledger mismatch: drawer net ${netCashInDrawer} !== expected ${expectedNetCash}`);
    }

    // Invariant 8: Student advance consistency
    const stuPostSnap = await getDoc(studentUserRef);
    const stuPostData = stuPostSnap.data() as any;
    if (Number(stuPostData.advanceBalance || 0) < 0) {
      errors.push(`Negative student advanceBalance: ${stuPostData.advanceBalance}`);
    }

    const report: IterationReport = {
      iteration: i,
      payment2Outcome: p2Settled.status === 'fulfilled' ? 'FULFILLED' : 'REJECTED',
      refundOutcome: refundSettled.status === 'fulfilled' ? 'FULFILLED' : 'REJECTED',
      finalBillPaid: finalPaid,
      finalBillDue: finalDue,
      finalBillStatus: finalStatus,
      tx1Status: tx1Data.status,
      tx2Status: tx2Data?.status,
      cashReconciled,
      allocationIntegrityPassed,
      invariantsPassed: errors.length === 0,
      errors
    };

    reports.push(report);
    console.log(`[ITERATION ${i.toString().padStart(2, '0')}/20] ${report.invariantsPassed ? '✅ PASS' : '❌ FAIL'} | P2: ${report.payment2Outcome} | Refund: ${report.refundOutcome} | Bill: paid=NRs.${finalPaid}, due=NRs.${finalDue} (${finalStatus}) | Cash: ${cashReconciled ? 'RECONCILED' : 'DISCREPANCY'}`);
    if (errors.length > 0) {
      console.error(`              Errors: ${errors.join('; ')}`);
    }
  }

  const allPassed = reports.every(r => r.invariantsPassed);
  console.log('\n==============================================================================');
  console.log(`CONCURRENT PAYMENT VS REFUND RACE SUITE: ${allPassed ? 'ALL 20 PASS' : 'FAILURES DETECTED'} (${reports.filter(r => r.invariantsPassed).length}/${TOTAL_ITERATIONS})`);
  console.log('==============================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
  process.exit(0);
}

runConcurrentPaymentVsRefundSuite().catch(err => {
  console.error('Fatal suite runner error:', err);
  process.exit(1);
});
