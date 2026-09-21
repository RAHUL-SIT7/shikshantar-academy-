import { db, auth } from '../src/firebase.js';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { executeCashFeePayment } from '../src/lib/cashPaymentEngine.js';
import { allocateNextDocumentNumber } from '../src/lib/documentNumberingEngine.js';

async function runFinancialRegression() {
  console.log('=== STARTING PART 6: FINANCIAL NON-REGRESSION SUITE ===');

  const timestamp = Date.now();
  const email = `admin_fin_reg_${timestamp}@shikshantar.edu.np`;
  const password = 'TestPassword123!';

  // Auth & Admin user
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, 'users', cred.user.uid), {
    email,
    role: 'admin',
    name: 'Financial Auditor',
    active: true
  });

  const studentId = `STU_FIN_REG_${timestamp}`;
  const studentData = {
    id: studentId,
    studentId,
    name: 'Regression Test Student',
    fullName: 'Regression Test Student',
    class: '10',
    rollNumber: '99',
    fatherName: 'Guardian Name',
    active: true
  };
  await setDoc(doc(db, 'students', studentId), studentData);

  // 1. Generate bill
  const billId = `BILL_REG_${timestamp}`;
  const billRef = doc(db, 'remitBills', billId);
  const initialBillData = {
    billId,
    studentId,
    studentName: 'Regression Test Student',
    class: '10',
    billNumber: `BIL-2083-${timestamp}`,
    items: [
      { id: '1', title: 'Monthly Tuition Fee', amount: 5000 },
      { id: '2', title: 'Exam Fee', amount: 1000 }
    ],
    totalAmount: 6000,
    paidAmount: 0,
    dueAmount: 6000,
    status: 'UNPAID',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    academicYear: '2083 BS'
  };
  await setDoc(billRef, initialBillData);
  console.log('1. Bill Generated:', billId, 'Total: Rs. 6000, Status: UNPAID');

  // 2. Partial cash payment (Rs. 2000)
  const rcp1 = await allocateNextDocumentNumber('RCP', '2083 BS');
  const res1 = await executeCashFeePayment({
    receiptNo: rcp1,
    student: studentData,
    cashTendered: 2000,
    netPayable: 2000,
    baseAmount: 2000,
    additionalCharges: [],
    discounts: [],
    paymentCategory: 'Bill Settlement',
    remarks: 'Partial Payment Test',
    operatorName: 'Financial Auditor',
    operatorUid: cred.user.uid,
    prefilledBillData: {
      id: billId,
      billId: billId,
      amount: 6000,
      totalAmount: 6000,
      dueAmount: 6000,
      paidAmount: 0,
      itemizedCharges: initialBillData.items
    }
  });

  console.log('2. Partial Cash Payment Processed:', rcp1, 'Tx ID:', res1?.transactionId);
  const billAfterP1 = (await getDoc(billRef)).data();
  console.log('   Bill Balance After Partial Payment: Paid =', billAfterP1?.paidAmount, 'Due =', billAfterP1?.dueAmount, 'Status =', billAfterP1?.status);

  const status1Upper = (billAfterP1?.status || '').toUpperCase();
  if (billAfterP1?.paidAmount !== 2000 || billAfterP1?.dueAmount !== 4000 || status1Upper !== 'PARTIAL') {
    throw new Error(`PARTIAL PAYMENT REGRESSION DETECTED! Paid: ${billAfterP1?.paidAmount}, Due: ${billAfterP1?.dueAmount}, Status: ${billAfterP1?.status}`);
  }

  // 3. Remaining payment + 4. Advance Overpayment (Pay Rs. 5000, clears Rs. 4000 due, Rs. 1000 goes to advance)
  const rcp2 = await allocateNextDocumentNumber('RCP', '2083 BS');
  const res2 = await executeCashFeePayment({
    receiptNo: rcp2,
    student: studentData,
    cashTendered: 5000, // 1000 overpayment
    netPayable: 4000,
    baseAmount: 4000,
    additionalCharges: [],
    discounts: [],
    paymentCategory: 'Bill Settlement',
    excessDecision: 'ADVANCE',
    remarks: 'Remaining Payment + Overpayment Advance Test',
    operatorName: 'Financial Auditor',
    operatorUid: cred.user.uid,
    prefilledBillData: {
      id: billId,
      billId: billId,
      amount: 6000,
      totalAmount: 6000,
      dueAmount: 4000,
      paidAmount: 2000,
      itemizedCharges: initialBillData.items
    }
  });

  console.log('3 & 4. Remaining Payment + Advance Overpayment Processed:', rcp2, 'Tx ID:', res2?.transactionId);
  const billAfterP2 = (await getDoc(billRef)).data();
  console.log('   Bill Balance After Full Payment: Paid =', billAfterP2?.paidAmount, 'Due =', billAfterP2?.dueAmount, 'Status =', billAfterP2?.status);

  const status2Upper = (billAfterP2?.status || '').toUpperCase();
  if (billAfterP2?.paidAmount !== 6000 || billAfterP2?.dueAmount !== 0 || status2Upper !== 'PAID') {
    throw new Error(`FULL PAYMENT REGRESSION DETECTED! Paid: ${billAfterP2?.paidAmount}, Due: ${billAfterP2?.dueAmount}, Status: ${billAfterP2?.status}`);
  }

  // Verify Student Advance Account
  const advSnap = await getDocs(query(collection(db, 'student_advances'), where('studentId', '==', studentId)));
  const totalAdvance = advSnap.docs.reduce((acc, d) => acc + (d.data().amount || d.data().remainingCredit || 0), 0);
  console.log('   Student Advance Entries Count:', advSnap.docs.length, 'Total Advance Credit:', totalAdvance);

  if (totalAdvance !== 1000) {
    throw new Error(`ADVANCE OVERPAYMENT REGRESSION DETECTED! Total Advance: ${totalAdvance}`);
  }

  // 9. Receipt Generation & 10. Ledger Reconciliation
  const tx1Snap = await getDocs(query(collection(db, 'transactions'), where('receipt', '==', rcp1)));
  const tx2Snap = await getDocs(query(collection(db, 'transactions'), where('receipt', '==', rcp2)));
  const ledger1Snap = await getDocs(query(collection(db, 'cash_ledger'), where('receiptNo', '==', rcp1)));
  const ledger2Snap = await getDocs(query(collection(db, 'cash_ledger'), where('receiptNo', '==', rcp2)));

  console.log('9 & 10. Ledger & Transaction Reconciliation Verified:');
  console.log('   Tx 1 Count:', tx1Snap.docs.length, 'Ledger 1 Count:', ledger1Snap.docs.length);
  console.log('   Tx 2 Count:', tx2Snap.docs.length, 'Ledger 2 Count:', ledger2Snap.docs.length);

  if (tx1Snap.docs.length !== 1 || tx2Snap.docs.length !== 1 || ledger1Snap.docs.length !== 1 || ledger2Snap.docs.length !== 1) {
    throw new Error('TRANSACTION/LEDGER RECONCILIATION REGRESSION DETECTED!');
  }

  console.log('\nPASSED: ALL FINANCIAL REGRESSION TESTS EXECUTED 100% CLEANLY!');
  process.exit(0);
}

runFinancialRegression().catch(err => {
  console.error('FINANCIAL REGRESSION FAILURE:', err);
  process.exit(1);
});
