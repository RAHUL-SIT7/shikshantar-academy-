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
import { processPaymentRefund } from '../../src/lib/paymentRefundEngine';
import { calculateFamilyPaymentAllocation } from '../../src/lib/familyBillingEngine';

export async function runPartLTests(): Promise<void> {
  console.log('\n======================================================================');
  console.log('PART L: COMPLETE FINANCIAL END-TO-END REGRESSION LIFECYCLE');
  console.log('======================================================================\n');

  const adminCtx = await createClientContext({ role: 'admin', adminTier: 'primary', emailPrefix: 'fin_e2e_adm' });
  await signInWithEmailAndPassword(auth, adminCtx.email, 'TestPassword123!');

  const permStudentId = `STU-FIN-${Date.now()}`;
  const student = await createClientContext({ 
    role: 'student', 
    emailPrefix: 'fin_e2e_std',
    permanentStudentId: permStudentId,
    admissionNo: `ADM-FIN-${Date.now()}`,
    class: '10'
  });

  const academicYear = '2082';

  // Step 1: Student Enrollment & Fee Structure
  let enrollmentSuccess = false;
  try {
    const enrId = `ENR-${academicYear}-${Date.now()}`;
    await adminDb.collection('student_enrollments').doc(enrId).set({
      enrollmentId: enrId,
      studentId: student.uid,
      permanentStudentId: permStudentId,
      academicYear,
      class: '10',
      rollNumber: 10,
      status: 'ACTIVE',
      enrolledAt: new Date().toISOString(),
    });

    await adminDb.collection('studentFees').doc(`${student.uid}_${academicYear}_TuitionFee`).set({
      studentId: student.uid,
      academicYear,
      month: 'Baisakh',
      type: 'Tuition Fee',
      totalFee: 2500,
      paidAmount: 0,
      dueAmount: 2500,
      status: 'due',
    });
    enrollmentSuccess = true;
    recordTest({
      id: 'FIN-01',
      category: 'FINANCIAL LIFECYCLE',
      scenario: '1. Student enrollment and fee structure setup',
      command: 'Set student_enrollments and studentFees documents',
      input: { studentUid: student.uid, permanentStudentId: permStudentId, fee: 2500 },
      operation: 'Initial enrollment and fee structure establishment',
      expected: 'Enrollment document active, tuition fee structure persisted',
      actual: 'Enrollment created and fee structure recorded',
      difference: 'None (Matched)',
      status: 'PASS-RUNTIME',
      rawOutput: `enrId=${enrId}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'FIN-01', category: 'FINANCIAL LIFECYCLE', scenario: 'Enrollment', command: 'set', input: {}, operation: 'Enroll', expected: 'Success', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // Step 2: Atomic Bill Generation
  let generatedBillId = '';
  try {
    const billRes = await generateSingleStudentBillTransactionally(
      {
        db,
        academicYear,
        creatorName: 'Admin Auditor',
      },
      {
        student: {
          id: student.uid,
          name: 'Financial Student',
          studentId: permStudentId,
          class: '10',
          rollNumber: 10,
        },
        unbilledForStudent: ['Baisakh'],
        mappedNepaliMonthIds: [{ monthName: 'Baisakh', monthId: '01', fullKey: '2082_01' }],
        itemizedCharges: [
          { name: 'Tuition Fee', rate: 2500, total: 2500, month: 'Baisakh' }
        ],
        totalAmount: 2500,
      }
    );

    generatedBillId = billRes.billId || '';
    const billDoc = await adminDb.collection('remitBills').doc(generatedBillId).get();
    const billOk = billDoc.exists && billDoc.data()?.totalAmount === 2500 && billDoc.data()?.status === 'unpaid';

    recordTest({
      id: 'FIN-02',
      category: 'FINANCIAL LIFECYCLE',
      scenario: '2. Atomic bill generation with month locks and deterministic bill items',
      command: 'generateSingleStudentBillTransactionally(...)',
      input: { studentId: student.uid, totalAmount: 2500, month: 'Baisakh' },
      operation: 'Transactional remit bill creation',
      expected: 'Bill created with status=unpaid, dueAmount=2500, totalAmount=2500',
      actual: `billId=${generatedBillId}, status=${billDoc.data()?.status}, totalAmount=${billDoc.data()?.totalAmount}`,
      difference: billOk ? 'None (Matched)' : 'Bill generation anomaly',
      status: billOk ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(billDoc.data() || {}),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'FIN-02', category: 'FINANCIAL LIFECYCLE', scenario: 'Bill generation', command: 'generateSingleStudentBillTransactionally', input: {}, operation: 'Generate', expected: 'Success', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // Step 3: Partial Cash Payment (NPR 1,000 paid towards NPR 2,500 bill)
  let partialTxId = '';
  try {
    const payRes = await executeCashFeePayment({
      receiptNo: `REC-PART-${Date.now()}`,
      student: { id: student.uid, name: 'Financial Student', class: '10' },
      cashTendered: 1000,
      netPayable: 2500,
      baseAmount: 2500,
      amountApplied: 1000,
      changeReturned: 0,
      additionalCharges: [],
      discounts: [],
      paymentCategory: 'TUITION',
      operatorName: 'Admin Auditor',
      operatorUid: adminCtx.uid,
      prefilledBillData: {
        id: generatedBillId,
        billId: generatedBillId,
        amount: 2500,
        totalAmount: 2500,
        dueAmount: 2500,
        paidAmount: 0,
      },
      excessDecision: null,
      customDb: db,
    });

    partialTxId = payRes.transactionId;
    const billAfterPartial = await adminDb.collection('remitBills').doc(generatedBillId).get();
    const bData = billAfterPartial.data();
    const partialOk = bData?.paidAmount === 1000 && bData?.dueAmount === 1500 && bData?.status === 'partial';

    recordTest({
      id: 'FIN-03',
      category: 'FINANCIAL LIFECYCLE',
      scenario: '3. Partial payment correctly updates bill (paid=1000, due=1500, status=partial)',
      command: 'executeCashFeePayment({ cashTendered: 1000, netPayable: 2500 })',
      input: { paymentAmount: 1000, billDue: 2500 },
      operation: 'Partial settlement transaction',
      expected: 'paidAmount=1000, dueAmount=1500, status=partial',
      actual: `paidAmount=${bData?.paidAmount}, dueAmount=${bData?.dueAmount}, status=${bData?.status}`,
      difference: partialOk ? 'None (Matched)' : 'Partial payment arithmetic error',
      status: partialOk ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(bData || {}),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'FIN-03', category: 'FINANCIAL LIFECYCLE', scenario: 'Partial payment', command: 'executeCashFeePayment', input: {}, operation: 'Pay', expected: 'Success', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // Step 4: Full Settlement (Remaining NPR 1,500 paid)
  let settlementTxId = '';
  try {
    const payRes = await executeCashFeePayment({
      receiptNo: `REC-SETTLE-${Date.now()}`,
      student: { id: student.uid, name: 'Financial Student', class: '10' },
      cashTendered: 1500,
      netPayable: 1500,
      baseAmount: 1500,
      amountApplied: 1500,
      changeReturned: 0,
      additionalCharges: [],
      discounts: [],
      paymentCategory: 'TUITION',
      operatorName: 'Admin Auditor',
      operatorUid: adminCtx.uid,
      prefilledBillData: {
        id: generatedBillId,
        billId: generatedBillId,
        amount: 2500,
        totalAmount: 2500,
        dueAmount: 1500,
        paidAmount: 1000,
      },
      excessDecision: null,
      customDb: db,
    });

    settlementTxId = payRes.transactionId;
    const billAfterFull = await adminDb.collection('remitBills').doc(generatedBillId).get();
    const bData = billAfterFull.data();
    const fullOk = bData?.paidAmount === 2500 && bData?.dueAmount === 0 && bData?.status === 'paid';

    recordTest({
      id: 'FIN-04',
      category: 'FINANCIAL LIFECYCLE',
      scenario: '4. Full settlement zeroes due amount and marks bill as paid',
      command: 'executeCashFeePayment({ cashTendered: 1500, netPayable: 1500 })',
      input: { paymentAmount: 1500, billDue: 1500 },
      operation: 'Remaining settlement transaction',
      expected: 'paidAmount=2500, dueAmount=0, status=paid',
      actual: `paidAmount=${bData?.paidAmount}, dueAmount=${bData?.dueAmount}, status=${bData?.status}`,
      difference: fullOk ? 'None (Matched)' : 'Settlement arithmetic error',
      status: fullOk ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(bData || {}),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'FIN-04', category: 'FINANCIAL LIFECYCLE', scenario: 'Full settlement', command: 'executeCashFeePayment', input: {}, operation: 'Pay', expected: 'Success', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // Step 5: Overpayment ADVANCE (Paying NPR 500 when due is 0 -> creates NPR 500 advance)
  let overpayTxId = '';
  try {
    const payRes = await executeCashFeePayment({
      receiptNo: `REC-ADV-${Date.now()}`,
      student: { id: student.uid, name: 'Financial Student', class: '10' },
      cashTendered: 500,
      netPayable: 0,
      baseAmount: 0,
      amountApplied: 0,
      changeReturned: 0,
      additionalCharges: [],
      discounts: [],
      paymentCategory: 'TUITION',
      operatorName: 'Admin Auditor',
      operatorUid: adminCtx.uid,
      excessDecision: 'ADVANCE',
      customDb: db,
    });

    overpayTxId = payRes.transactionId;
    const studentUserDoc = await adminDb.collection('users').doc(student.uid).get();
    const advBalance = studentUserDoc.data()?.advanceBalance;
    const advOk = advBalance === 500;

    recordTest({
      id: 'FIN-05',
      category: 'FINANCIAL LIFECYCLE',
      scenario: '5. Overpayment with excessDecision="ADVANCE" creates NPR 500 advance credit',
      command: 'executeCashFeePayment({ cashTendered: 500, netPayable: 0, excessDecision: "ADVANCE" })',
      input: { paymentAmount: 500, excessDecision: 'ADVANCE' },
      operation: 'Advance credit creation',
      expected: 'Student advanceBalance updated to 500',
      actual: `advanceBalance=${advBalance}`,
      difference: advOk ? 'None (Matched)' : 'Advance balance mismatch',
      status: advOk ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `advanceBalance=${advBalance}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'FIN-05', category: 'FINANCIAL LIFECYCLE', scenario: 'Overpayment advance', command: 'executeCashFeePayment', input: {}, operation: 'Advance', expected: 'Success', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // Step 6: Payment Cancellation / Reversal
  try {
    const cancelRes = await cancelPaymentTransaction({
      transactionId: settlementTxId,
      adminName: 'Admin Auditor',
      adminEmail: adminCtx.email,
      reason: 'Audited Cancellation Test',
      customDb: db,
    });

    const billAfterCancel = await adminDb.collection('remitBills').doc(generatedBillId).get();
    const bData = billAfterCancel.data();
    const cancelOk = cancelRes.success && bData?.paidAmount === 1000 && bData?.dueAmount === 1500;

    recordTest({
      id: 'FIN-06',
      category: 'FINANCIAL LIFECYCLE',
      scenario: '6. Payment cancellation reverses transaction and restores bill debt accurately',
      command: 'cancelPaymentTransaction({ transactionId })',
      input: { transactionId: settlementTxId, reversedAmount: 1500 },
      operation: 'Transactional payment reversal',
      expected: 'Bill debt restored: paidAmount=1000, dueAmount=1500',
      actual: `paidAmount=${bData?.paidAmount}, dueAmount=${bData?.dueAmount}, success=${cancelRes.success}`,
      difference: cancelOk ? 'None (Matched)' : 'Reversal restoration error',
      status: cancelOk ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(bData || {}),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'FIN-06', category: 'FINANCIAL LIFECYCLE', scenario: 'Payment cancellation', command: 'cancelPaymentTransaction', input: {}, operation: 'Cancel', expected: 'Success', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // Step 7: Payment Refund
  try {
    const refundRes = await processPaymentRefund({
      transactionId: partialTxId,
      adminName: 'Admin Auditor',
      adminEmail: adminCtx.email,
      reason: 'Audited Refund Test',
      customDb: db,
    });

    const refundDoc = await adminDb.collection('refund_records').doc(refundRes.refundRecordId).get();
    const refundOk = refundRes.success && refundDoc.exists && refundDoc.data()?.amount === 1000;

    recordTest({
      id: 'FIN-07',
      category: 'FINANCIAL LIFECYCLE',
      scenario: '7. Payment refund creates official refund_record and reverses transaction',
      command: 'processPaymentRefund({ transactionId })',
      input: { transactionId: partialTxId, refundAmount: 1000 },
      operation: 'Transactional payment refund and expense ledger record',
      expected: 'refund_record created with amount=1000, status=REFUNDED',
      actual: `refundRecordId=${refundRes.refundRecordId}, amount=${refundDoc.data()?.amount}`,
      difference: refundOk ? 'None (Matched)' : 'Refund recording failure',
      status: refundOk ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(refundDoc.data() || {}),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'FIN-07', category: 'FINANCIAL LIFECYCLE', scenario: 'Payment refund', command: 'processRefundTransaction', input: {}, operation: 'Refund', expected: 'Success', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // Step 8: Physical Cash Ledger Conservation
  try {
    const ledgerSnaps = await adminDb.collection('cash_ledger').where('studentId', '==', student.uid).get();
    let totalInflow = 0;
    let totalOutflow = 0;
    ledgerSnaps.docs.forEach(d => {
      const entry = d.data();
      if (entry.type === 'INCOME') totalInflow += Number(entry.amount || 0);
      if (entry.type === 'EXPENSE') totalOutflow += Number(entry.amount || 0);
    });
    const netCash = totalInflow - totalOutflow;
    const conservationOk = netCash === 500;

    recordTest({
      id: 'FIN-08',
      category: 'FINANCIAL LIFECYCLE',
      scenario: '8. Cash conservation holds: Net physical cash strictly equals net student advance',
      command: 'Audit cash_ledger sums for student',
      input: { studentId: student.uid },
      operation: 'Physical cash conservation audit',
      expected: 'Net cash (Inflows - Outflows) == Net student advance (500)',
      actual: `Inflow=${totalInflow}, Outflow=${totalOutflow}, Net=${netCash}`,
      difference: conservationOk ? 'None (Matched)' : 'Cash conservation imbalance',
      status: conservationOk ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `Net cash: ${netCash}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'FIN-08', category: 'FINANCIAL LIFECYCLE', scenario: 'Cash conservation', command: 'sum', input: {}, operation: 'Audit', expected: '500', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // Step 9: Family Payment Allocation Calculation
  try {
    const familySummary = [
      { studentId: 'child_1', studentName: 'Child One', totalDue: 3000, oldestUnpaidMonth: 'Baisakh' },
      { studentId: 'child_2', studentName: 'Child Two', totalDue: 2000, oldestUnpaidMonth: 'Baisakh' },
    ];
    const allocation = calculateFamilyPaymentAllocation(3500, familySummary as any);
    const c1Alloc = allocation.allocations.find(a => a.studentId === 'child_1')?.amount || 0;
    const c2Alloc = allocation.allocations.find(a => a.studentId === 'child_2')?.amount || 0;
    const familyOk = c1Alloc === 3000 && c2Alloc === 500 && allocation.totalAllocated === 3500;

    recordTest({
      id: 'FIN-09',
      category: 'FINANCIAL LIFECYCLE',
      scenario: '9. Family payment waterfall correctly allocates lump sum across siblings',
      command: 'calculateFamilyPaymentAllocation(3500, [child1: 3000, child2: 2000])',
      input: { payment: 3500, child1Due: 3000, child2Due: 2000 },
      operation: 'Multi-child family payment waterfall allocation',
      expected: 'Child 1 allocated 3000, Child 2 allocated 500',
      actual: `Child 1: ${c1Alloc}, Child 2: ${c2Alloc}, Total: ${allocation.totalAllocated}`,
      difference: familyOk ? 'None (Matched)' : 'Waterfall allocation error',
      status: familyOk ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(allocation),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'FIN-09', category: 'FINANCIAL LIFECYCLE', scenario: 'Family allocation', command: 'calculate', input: {}, operation: 'Allocate', expected: '3000 and 500', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }
}
