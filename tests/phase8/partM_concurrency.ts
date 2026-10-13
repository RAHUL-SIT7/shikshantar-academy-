import { 
  recordTest, 
  adminDb, 
  createClientContext, 
  TestClientContext 
} from './framework';
import { db, auth } from '../../src/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { generateSingleStudentBillTransactionally } from '../../src/lib/atomicBillingTransactionEngine';
import { executeCashFeePayment } from '../../src/lib/cashPaymentEngine';
import { cancelPaymentTransaction } from '../../src/lib/paymentCancellationEngine';

export async function runPartMTests(): Promise<void> {
  console.log('\n======================================================================');
  console.log('PART M & N: CONCURRENCY ATTACK & NETWORK RETRY IDEMPOTENCY');
  console.log('======================================================================\n');

  const adminCtx = await createClientContext({ role: 'admin', adminTier: 'primary', emailPrefix: 'conc_adm' });
  await signInWithEmailAndPassword(auth, adminCtx.email, 'TestPassword123!');

  const student = await createClientContext({ role: 'student', emailPrefix: 'conc_std' });
  const academicYear = '2082';

  // 1. 20 concurrent identical bill-generation requests
  try {
    const studentData = {
      id: student.uid,
      name: 'Concurrency Test Student',
      studentId: `STU-CONC-${Date.now()}`,
      class: '10',
      rollNumber: 1,
    };

    const billPromises: Promise<any>[] = [];
    for (let i = 0; i < 20; i++) {
      billPromises.push(
        generateSingleStudentBillTransactionally(
          {
            db,
            academicYear,
            creatorName: 'Concurrency Attacker',
          },
          {
            student: studentData,
            unbilledForStudent: ['Jestha'],
            mappedNepaliMonthIds: [{ monthName: 'Jestha', monthId: '02', fullKey: '2082_02' }],
            itemizedCharges: [{ name: 'Tuition Fee', rate: 2000, total: 2000, month: 'Jestha' }],
            totalAmount: 2000,
          }
        ).catch(err => ({ error: err.message }))
      );
    }

    const billResults = await Promise.all(billPromises);
    const successCount = billResults.filter(r => r.success === true).length;
    const skippedOrFailedCount = billResults.filter(r => r.skipped === true || r.error).length;

    const billsInDb = await adminDb.collection('remitBills')
      .where('studentId', '==', student.uid)
      .where('academicYear', '==', academicYear)
      .where('month', '==', 'Jestha')
      .get();

    const passed = billsInDb.docs.length === 1 && successCount === 1;
    recordTest({
      id: 'CONC-01',
      category: 'CONCURRENCY DEFENSE',
      scenario: '20 concurrent identical bill-generation requests produce exactly 1 bill',
      command: 'Promise.all(20 x generateSingleStudentBillTransactionally)',
      input: { concurrencyCount: 20, month: 'Jestha', studentId: student.uid },
      operation: 'High-concurrency race condition attack on billing locks',
      expected: 'Exactly 1 bill created in Firestore; 19 rejected/skipped by month lock',
      actual: `Bills in Firestore: ${billsInDb.docs.length}, Successful promises: ${successCount}, Skipped: ${skippedOrFailedCount}`,
      difference: passed ? 'None (Matched)' : 'Duplicate bills created (RACE CONDITION DEFECT)',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `BillsCount: ${billsInDb.docs.length}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'CONC-01', category: 'CONCURRENCY DEFENSE', scenario: '20x bill generation', command: 'Promise.all', input: {}, operation: 'Attack', expected: '1 bill', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 2. 20 concurrent identical payment requests with same receipt lock
  try {
    const targetBillId = `bill_race_target_${Date.now()}`;
    await adminDb.collection('remitBills').doc(targetBillId).set({
      billId: targetBillId,
      studentId: student.uid,
      totalAmount: 3000,
      paidAmount: 0,
      dueAmount: 3000,
      status: 'unpaid',
      academicYear,
      month: 'Ashadh',
    });

    const paymentReceiptNo = `REC-CONC-${Date.now()}`;
    const paymentPromises: Promise<any>[] = [];

    for (let i = 0; i < 20; i++) {
      paymentPromises.push(
        executeCashFeePayment({
          receiptNo: paymentReceiptNo,
          student: { id: student.uid, name: 'Concurrency Test Student', class: '10' },
          cashTendered: 3000,
          netPayable: 3000,
          baseAmount: 3000,
          amountApplied: 3000,
          changeReturned: 0,
          additionalCharges: [],
          discounts: [],
          paymentCategory: 'TUITION',
          operatorName: 'Concurrency Attacker',
          operatorUid: adminCtx.uid,
          prefilledBillData: {
            id: targetBillId,
            billId: targetBillId,
            amount: 3000,
            totalAmount: 3000,
            dueAmount: 3000,
            paidAmount: 0,
          },
          excessDecision: null,
          customDb: db,
        }).catch(err => ({ error: err.message }))
      );
    }

    const payResults = await Promise.all(paymentPromises);
    const successfulPayments = payResults.filter(r => r.transactionId).length;

    const txInDb = await adminDb.collection('transactions').where('receipt', '==', paymentReceiptNo).get();
    const passed = txInDb.docs.length === 1 && successfulPayments === 1;

    recordTest({
      id: 'CONC-02',
      category: 'CONCURRENCY DEFENSE',
      scenario: '20 concurrent identical payment requests produce exactly 1 transaction',
      command: 'Promise.all(20 x executeCashFeePayment with shared receipt)',
      input: { concurrencyCount: 20, receipt: paymentReceiptNo },
      operation: 'High-concurrency race condition attack on payment receipt lock',
      expected: 'Exactly 1 transaction committed; 19 rejected by receipt uniqueness lock',
      actual: `Transactions in Firestore: ${txInDb.docs.length}, Successful payments: ${successfulPayments}`,
      difference: passed ? 'None (Matched)' : 'Duplicate payments committed (DOUBLE SPEND DEFECT)',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `TxCount: ${txInDb.docs.length}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'CONC-02', category: 'CONCURRENCY DEFENSE', scenario: '20x payment race', command: 'Promise.all', input: {}, operation: 'Attack', expected: '1 transaction', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 3. 20 concurrent reversal requests on the same transaction
  try {
    const targetTxToReverse = `tx_race_rev_${Date.now()}`;
    const linkedBillId = `bill_race_rev_${Date.now()}`;
    await adminDb.collection('remitBills').doc(linkedBillId).set({
      billId: linkedBillId,
      studentId: student.uid,
      totalAmount: 1000,
      paidAmount: 1000,
      dueAmount: 0,
      status: 'paid',
    });
    await adminDb.collection('transactions').doc(targetTxToReverse).set({
      transactionId: targetTxToReverse,
      studentId: student.uid,
      amount: 1000,
      receipt: `REC-REV-${Date.now()}`,
      status: 'SUCCESS',
      allocations: [{ billId: linkedBillId, amount: 1000 }],
    });

    const revPromises: Promise<any>[] = [];
    for (let i = 0; i < 20; i++) {
      revPromises.push(
        cancelPaymentTransaction({
          transactionId: targetTxToReverse,
          adminName: 'Concurrency Attacker',
          adminEmail: adminCtx.email,
          reason: 'Race Condition Reversal Attack',
          customDb: db,
        }).catch(err => ({ error: err.message }))
      );
    }

    const revResults = await Promise.all(revPromises);
    const successfulReversals = revResults.filter(r => r.success === true).length;
    const billDoc = await adminDb.collection('remitBills').doc(linkedBillId).get();
    const finalDue = billDoc.data()?.dueAmount;
    const passed = successfulReversals === 1 && finalDue === 1000;

    recordTest({
      id: 'CONC-03',
      category: 'CONCURRENCY DEFENSE',
      scenario: '20 concurrent reversal requests execute reversal exactly once (no multi-reversal debt explosion)',
      command: 'Promise.all(20 x cancelPaymentTransaction on same tx)',
      input: { concurrencyCount: 20, targetTx: targetTxToReverse },
      operation: 'High-concurrency race condition attack on payment cancellation',
      expected: 'Exactly 1 cancellation succeeds; restored dueAmount == 1000 (never multiplied)',
      actual: `Successful reversals: ${successfulReversals}, Final dueAmount: ${finalDue}`,
      difference: passed ? 'None (Matched)' : 'Double reversal debt inflation',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `DueAmount: ${finalDue}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'CONC-03', category: 'CONCURRENCY DEFENSE', scenario: '20x reversal race', command: 'Promise.all', input: {}, operation: 'Attack', expected: '1 reversal', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 4. Network Retry / Idempotency simulation: Immediate retry of successful payment
  try {
    const retryBillId = `bill_retry_${Date.now()}`;
    await adminDb.collection('remitBills').doc(retryBillId).set({
      billId: retryBillId,
      studentId: student.uid,
      totalAmount: 1200,
      paidAmount: 0,
      dueAmount: 1200,
      status: 'unpaid',
    });

    const staticReceipt = `REC-IDEMP-${Date.now()}`;
    const call1 = await executeCashFeePayment({
      receiptNo: staticReceipt,
      student: { id: student.uid, name: 'Student', class: '10' },
      cashTendered: 1200,
      netPayable: 1200,
      baseAmount: 1200,
      amountApplied: 1200,
      changeReturned: 0,
      additionalCharges: [],
      discounts: [],
      paymentCategory: 'TUITION',
      operatorName: 'Admin',
      operatorUid: adminCtx.uid,
      prefilledBillData: {
        id: retryBillId,
        billId: retryBillId,
        amount: 1200,
        totalAmount: 1200,
        dueAmount: 1200,
        paidAmount: 0,
      },
      excessDecision: null,
      customDb: db,
    });

    let retryBlocked = false;
    try {
      await executeCashFeePayment({
        receiptNo: staticReceipt,
        student: { id: student.uid, name: 'Student', class: '10' },
        cashTendered: 1200,
        netPayable: 1200,
        baseAmount: 1200,
        amountApplied: 1200,
        changeReturned: 0,
        additionalCharges: [],
        discounts: [],
        paymentCategory: 'TUITION',
        operatorName: 'Admin',
        operatorUid: adminCtx.uid,
        prefilledBillData: {
          id: retryBillId,
          billId: retryBillId,
          amount: 1200,
          totalAmount: 1200,
          dueAmount: 1200,
          paidAmount: 0,
        },
        excessDecision: null,
        customDb: db,
      });
    } catch {
      retryBlocked = true;
    }

    const txDocs = await adminDb.collection('transactions').where('receipt', '==', staticReceipt).get();
    const passed = Boolean(call1.transactionId) && (retryBlocked || txDocs.docs.length === 1);

    recordTest({
      id: 'IDEMP-01',
      category: 'NETWORK RETRY IDEMPOTENCY',
      scenario: 'Client network retry with identical receipt lock prevents duplicate deduction',
      command: 'executeCashFeePayment -> retry identical payload',
      input: { receipt: staticReceipt },
      operation: 'Simulated client retry after timeout',
      expected: 'Only 1 transaction persists in database; duplicate attempt safely blocked',
      actual: `Initial txId: ${call1.transactionId}, Retry blocked: ${retryBlocked}, Tx count: ${txDocs.docs.length}`,
      difference: passed ? 'None (Matched)' : 'Duplicate transaction created on retry',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `Tx count: ${txDocs.docs.length}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'IDEMP-01', category: 'NETWORK RETRY IDEMPOTENCY', scenario: 'Payment idempotency', command: 'retry', input: {}, operation: 'Retry', expected: 'Single tx', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }
}
