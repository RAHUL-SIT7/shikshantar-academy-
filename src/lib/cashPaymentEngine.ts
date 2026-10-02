import React from 'react';
import { db, auth } from '../firebase';
import { 
  collection, 
  doc, 
  runTransaction, 
  serverTimestamp, 
  getDocs, 
  query, 
  where, 
  orderBy,
  addDoc,
  updateDoc
} from 'firebase/firestore';
import { formatBSDate, getBSYearMonthDate } from './nepaliDate';
import { recordLedgerAuditLog, getAuthoritativeActor } from './auditLogger';

export const NEPALI_MONTHS = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

export const normalizeNepaliMonth = (m?: string): string => {
  if (!m) return 'Baisakh';
  const clean = m.trim().toLowerCase();
  if (clean.includes('baisak')) return 'Baisakh';
  if (clean.includes('jest')) return 'Jestha';
  if (clean.includes('asar') || clean.includes('ashad')) return 'Asar';
  if (clean.includes('shrawan') || clean.includes('saun')) return 'Shrawan';
  if (clean.includes('bhadra') || clean.includes('bhadau')) return 'Bhadra';
  if (clean.includes('ashwin') || clean.includes('asoj')) return 'Ashwin';
  if (clean.includes('kartik')) return 'Kartik';
  if (clean.includes('mangsir') || clean.includes('mangs')) return 'Mangsir';
  if (clean.includes('poush') || clean.includes('paush') || clean.includes('pus')) return 'Poush';
  if (clean.includes('magh')) return 'Magh';
  if (clean.includes('falgun') || clean.includes('phagun')) return 'Falgun';
  if (clean.includes('chaitra') || clean.includes('chait')) return 'Chaitra';
  return m;
};

export const normalizeFeeType = (t?: string): string => {
  if (!t) return 'Other Fee';
  const clean = t.toLowerCase();
  if (clean.includes('tuition')) return 'Tuition Fee';
  if (clean.includes('transport')) return 'Transportation Fee';
  if (clean.includes('computer')) return 'Computer Fee';
  if (clean.includes('academy') || clean.includes('sport')) return 'Academy Fee';
  if (clean.includes('exam')) return 'Terminal Exam Fee';
  if (clean.includes('annual')) return 'Annual Fee';
  if (clean.includes('admission')) return 'Admission Fee';
  if (clean.includes('arrear') || clean.includes('back due') || clean.includes('outstanding')) return 'Back Dues';
  return t.trim();
};

export const parseMonthsFromBillingPeriod = (period?: string): string[] => {
  if (!period) return [];
  const STANDARD_MONTHS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
  const pLower = period.toLowerCase();
  
  // Find all standard months mentioned
  const indices: number[] = [];
  STANDARD_MONTHS.forEach((m, idx) => {
    const norm = m.toLowerCase();
    if (pLower.includes(norm) || (norm === 'asar' && pLower.includes('ashad'))) {
      indices.push(idx);
    }
  });

  if (indices.length >= 2) {
    const minIdx = Math.min(...indices);
    const maxIdx = Math.max(...indices);
    return STANDARD_MONTHS.slice(minIdx, maxIdx + 1);
  } else if (indices.length === 1) {
    return [STANDARD_MONTHS[indices[0]]];
  }
  return [];
};

/**
 * Strict Digits-Only input helper for keyboard events.
 * Blocks all letters, symbols, punctuation, spaces, emojis, and decimal points.
 */
export const handleDigitsOnlyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (
    ['Backspace', 'Tab', 'Enter', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(e.key) ||
    (e.ctrlKey || e.metaKey)
  ) {
    return;
  }
  if (!/^[0-9]$/.test(e.key)) {
    e.preventDefault();
  }
};

/**
 * Strips all non-digit characters from a string.
 */
export const sanitizeDigitsOnly = (val: string | number | undefined | null): string => {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[^0-9]/g, '');
};

/**
 * Parses a value into a safe non-negative integer (NPR).
 */
export const parseIntegerAmount = (val: any): number => {
  if (typeof val === 'number') {
    return Math.max(0, Math.floor(isNaN(val) ? 0 : val));
  }
  const digits = sanitizeDigitsOnly(val);
  const parsed = parseInt(digits, 10);
  return isNaN(parsed) ? 0 : Math.max(0, parsed);
};

export interface FeeAllocationItem {
  feeId: string;
  month: string;
  type: string;
  allocatedAmount: number;
  previousDue: number;
  remainingDue: number;
  status: 'paid' | 'partial' | 'due';
}

export interface PaymentBreakdownResult {
  netPayable: number;
  cashTendered: number;
  cashCollection?: number; // alias for backwards compatibility
  amountApplied: number;
  remainingOutstanding: number;
  excessAmount: number;
  changeReturned: number;
  advanceCreated?: number;
  excessDecision?: 'ADVANCE' | 'RETURN' | null;
  isExcess: boolean;
  isExact: boolean;
  isPartial: boolean;
  isZero: boolean;
}

/**
 * Pure calculation logic clearly enforcing the mathematical relationship between:
 * - Net Payable Total (computed read-only)
 * - Cash Tendered by Guardian (primary physical cash input)
 * - Amount Applied to Ledger (default = MIN(tendered, netPayable), editable for partial payments)
 * - Change to Return to Parent (MAX(0, cashTendered - amountApplied))
 * - Excess cash overpayment decision (Option A: Return as Change vs Option B: Credit as Advance)
 */
export const calculatePaymentBreakdown = (
  netPayableInput: number | string,
  cashTenderedInput: number | string,
  customAmountAppliedOrExcessDecision?: number | string | 'ADVANCE' | 'RETURN' | null,
  excessDecisionParam?: 'ADVANCE' | 'RETURN' | null
): PaymentBreakdownResult => {
  let customAmountAppliedInput: number | string | null | undefined = undefined;
  let excessDecision: 'ADVANCE' | 'RETURN' | null = excessDecisionParam || null;

  if (customAmountAppliedOrExcessDecision === 'ADVANCE' || customAmountAppliedOrExcessDecision === 'RETURN') {
    excessDecision = customAmountAppliedOrExcessDecision;
  } else {
    customAmountAppliedInput = customAmountAppliedOrExcessDecision;
  }

  const netPayable = parseIntegerAmount(netPayableInput);
  const cashTendered = parseIntegerAmount(cashTenderedInput);

  const excessAmount = Math.max(0, cashTendered - netPayable);
  const isExcess = cashTendered > netPayable;
  const isExact = cashTendered === netPayable && netPayable > 0;
  const isPartial = cashTendered > 0 && cashTendered < netPayable;
  const isZero = cashTendered === 0;

  let amountApplied: number;
  let changeReturned: number;

  if (isExcess) {
    // Crucial Accounting Rule: Amount applied to existing dues CANNOT exceed Net Payable.
    // Dues are settled 100% (netPayable), while excess is credited as advance or returned as change.
    amountApplied = netPayable;
    if (excessDecision === 'ADVANCE') {
      // Option B: Full physical cash kept in register; excess is held as advance credit
      changeReturned = 0;
    } else {
      // Option A (Return) or Default: Excess is returned as physical change to parent
      changeReturned = excessAmount;
    }
  } else {
    // When tendered <= netPayable:
    // If cashier explicitly entered a partial amount applied <= cashTendered and <= netPayable
    if (customAmountAppliedInput !== undefined && customAmountAppliedInput !== null && customAmountAppliedInput !== '') {
      const customApplied = parseIntegerAmount(customAmountAppliedInput);
      amountApplied = Math.min(customApplied, cashTendered, netPayable);
    } else {
      amountApplied = Math.min(cashTendered, netPayable);
    }
    changeReturned = Math.max(0, cashTendered - amountApplied);
  }

  const duesSettled = Math.min(amountApplied, netPayable);
  const remainingOutstanding = Math.max(0, netPayable - duesSettled);

  return {
    netPayable,
    cashTendered,
    cashCollection: cashTendered,
    amountApplied,
    remainingOutstanding,
    excessAmount,
    changeReturned,
    advanceCreated: isExcess && excessDecision === 'ADVANCE' ? excessAmount : 0,
    excessDecision,
    isExcess,
    isExact,
    isPartial,
    isZero
  };
};

export interface CashPaymentExecutionParams {
  idempotencyKey?: string;
  receiptNo: string;
  student: {
    id: string;
    studentId?: string;
    fullName?: string;
    name: string;
    class: string;
    rollNumber?: string;
    roll?: string;
    fatherName?: string;
    guardianName?: string;
    guardianPhone?: string;
    monthlyFee?: number;
    transportFee?: number;
    computerFee?: number;
    academyFee?: number;
    fees?: any[];
    [key: string]: any;
  };
  cashTendered?: number;
  cashCollection?: number; // alias
  amountApplied?: number;
  changeReturned?: number;
  netPayable: number;
  baseAmount: number;
  additionalCharges: Array<{ id?: string; purpose: string; amount: number | string }>;
  discounts: Array<{ id?: string; purpose: string; amount: number | string }>;
  paymentCategory: string;
  customNumberOfMonths?: number | string;
  selectedMonth?: string;
  remarks?: string;
  operatorName: string;
  operatorUid: string;
  handwrittenLedgerNo?: string;
  isHandwrittenMode?: boolean;
  handwrittenReceiptSerial?: string;
  handwrittenSignVerified?: boolean;
  prefilledBillData?: {
    id: string;
    billId: string;
    amount: number;
    totalAmount?: number;
    paidAmount?: number;
    dueAmount?: number;
    billingPeriod?: string;
    coveredMonths?: string[];
    itemizedCharges?: any[];
  } | null;
  excessDecision?: 'ADVANCE' | 'RETURN' | null;
  accountantRemarks?: string;
  accountantName?: string;
  accountantUid?: string;
  customDb?: any;
}

/**
 * Atomic Firestore Transaction for Physical Cash Fee Payment.
 * Enforces:
 * - Digits-only integer arithmetic.
 * - Idempotency protection.
 * - Concurrency checks.
 * - Real-time waterfall fee allocation (Priorities: Oldest Arrears -> Oldest Month -> Fee Types).
 * - Advance or Return disposition when cash collection exceeds net payable.
 * - Cash ledger and audit log generation.
 */
export async function executeCashFeePayment(params: CashPaymentExecutionParams) {
  const cashTendered = parseIntegerAmount(params.cashTendered || params.cashCollection);
  const netPayable = parseIntegerAmount(params.netPayable);

  if (cashTendered <= 0) {
    throw new Error('Cash Tendered must be a positive number greater than 0.');
  }

  const breakdown = calculatePaymentBreakdown(
    netPayable,
    cashTendered,
    params.amountApplied,
    params.excessDecision
  );

  if (breakdown.isExcess && !params.excessDecision) {
    throw new Error('Cash tendered exceeds Net Payable. Please select an overpayment decision (Return as Change or Credit as Advance) before confirming payment.');
  }

  const now = new Date();
  const bsDate = formatBSDate(now);
  const bsYear = getBSYearMonthDate(now).year;
  const operatorName = params.operatorName || 'Cashier Desk';
  const operatorUid = params.operatorUid || auth.currentUser?.uid || 'system';

  const txId = `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const paymentGroupId = `PAY_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const firestoreDb = params.customDb || db;
  const txDocRef = doc(firestoreDb, 'transactions', txId);
  const cashLedgerDocRef = doc(collection(firestoreDb, 'cash_ledger'));

  // Security & Authority: Fail closed if authoritative actor cannot be resolved from Firestore
  const authoritativeActor = await getAuthoritativeActor();

  // Run atomic transaction
  return await runTransaction(firestoreDb, async (transaction) => {
    // 1. Idempotency Check
    const existingTxSnap = await transaction.get(txDocRef);
    if (existingTxSnap.exists()) {
      throw new Error(`Duplicate transaction detected for Receipt ${params.receiptNo}. Operation cancelled.`);
    }

    // 2. Fetch existing fees and remit bill to allocate against (ALL READS FIRST)
    const studentId = params.student.id;
    const studentDocRef = doc(firestoreDb, 'users', studentId);
    const studentSnap = await transaction.get(studentDocRef);
    const studentData = studentSnap.exists() ? studentSnap.data() : {};

    const billDocRef = (params.prefilledBillData && params.prefilledBillData.id) ? doc(firestoreDb, 'remitBills', params.prefilledBillData.id) : null;
    const billDocSnap = billDocRef ? await transaction.get(billDocRef) : null;
    const liveBillData = billDocSnap && billDocSnap.exists() ? billDocSnap.data() : null;

    // 3. Waterfall allocation
    let remainingToApply = Math.min(breakdown.amountApplied, netPayable);
    const allocations: FeeAllocationItem[] = [];

    // Use student's existing fees or construct monthly fees
    const rawFees = Array.isArray(studentData.fees) ? studentData.fees : (params.student.fees || []);
    
    // Sort raw fees by oldest month index
    const sortedFees = [...rawFees].sort((a: any, b: any) => {
      const idxA = NEPALI_MONTHS.indexOf(a.month);
      const idxB = NEPALI_MONTHS.indexOf(b.month);
      if (idxA === -1) return -1;
      if (idxB === -1) return 1;
      return idxA - idxB;
    });

    let dueFeesToAllocate: any[] = [];

    if (params.prefilledBillData && params.prefilledBillData.itemizedCharges?.length) {
      // Prioritize Remit Bill charges
      let billMonths: string[] = params.prefilledBillData.coveredMonths || [];
      if (!billMonths.length && params.prefilledBillData.billingPeriod) {
        billMonths = parseMonthsFromBillingPeriod(params.prefilledBillData.billingPeriod);
      }
      if (!billMonths.length) {
        billMonths = ['Baisakh', 'Jestha', 'Asar'];
      }

      params.prefilledBillData.itemizedCharges.forEach((item: any) => {
        const itemName = item.name || item.title || item.itemName || 'Fee';
        const isBackDues = itemName.includes('Arrears') || itemName.includes('Outstanding') || itemName.includes('Back Dues');
        const fType = normalizeFeeType(itemName);
        const itemAmount = item.amount ?? item.total ?? item.rate ?? 0;
        const monthlyRate = item.rate || (billMonths.length ? Math.round(Number(itemAmount) / billMonths.length) : Number(itemAmount));

        if (isBackDues) {
          const olderFees = rawFees.filter((f: any) => (f.status === 'due' || f.status === 'partial') && !billMonths.includes(f.month));
          if (olderFees.length > 0) {
            dueFeesToAllocate.push(...olderFees);
          } else {
            dueFeesToAllocate.push({
              id: `${studentId}_BackDues_${Date.now()}`,
              month: 'Previous Dues',
              type: 'Previous Arrears / Back Dues',
              totalFee: Number(item.total),
              dueAmount: Number(item.total),
              paidAmount: 0,
              status: 'due'
            });
          }
        } else {
          billMonths.forEach((mName) => {
            const existing = rawFees.find((f: any) => 
              normalizeNepaliMonth(f.month) === normalizeNepaliMonth(mName) && 
              normalizeFeeType(f.type) === fType
            );
            if (existing) {
              dueFeesToAllocate.push(existing);
            } else {
              dueFeesToAllocate.push({
                id: `${studentId}_${mName.replace(/\s+/g, '')}_${fType.replace(/\s+/g, '')}`,
                month: mName,
                type: fType,
                totalFee: monthlyRate,
                dueAmount: monthlyRate,
                paidAmount: 0,
                status: 'due',
                remitBillId: params.prefilledBillData?.id
              });
            }
          });
        }
      });
    } else {
      dueFeesToAllocate = sortedFees.filter((f: any) => f.status === 'due' || f.status === 'partial');
      
      // Fallback: If no existing due fee objects exist, generate them dynamically for the selected month(s)
      if (dueFeesToAllocate.length === 0) {
        const tuitionRate = Number(params.student.monthlyFee || params.baseAmount || 1000);
        const transportRate = Number(params.student.transportFee || 0);
        const targetMonths = params.selectedMonth ? [params.selectedMonth] : ['Baisakh'];
        
        targetMonths.forEach(mName => {
          dueFeesToAllocate.push({
            id: `${studentId}_${mName.replace(/\s+/g, '')}_TuitionFee`,
            month: mName,
            type: 'Tuition Fee',
            totalFee: tuitionRate,
            dueAmount: tuitionRate,
            paidAmount: 0,
            status: 'due'
          });
          if (transportRate > 0) {
            dueFeesToAllocate.push({
              id: `${studentId}_${mName.replace(/\s+/g, '')}_TransportationFee`,
              month: mName,
              type: 'Transportation Fee',
              totalFee: transportRate,
              dueAmount: transportRate,
              paidAmount: 0,
              status: 'due'
            });
          }
        });
      }
    }

    for (const fee of dueFeesToAllocate) {
      if (remainingToApply <= 0) break;
      const feeDue = parseIntegerAmount(fee.dueAmount !== undefined ? fee.dueAmount : fee.totalFee);
      if (feeDue <= 0) continue;

      const allocated = Math.min(feeDue, remainingToApply);
      remainingToApply -= allocated;

      const feeDocId = fee.id || `${studentId}_${(fee.month || 'Current').replace(/\s+/g, '')}_${(fee.type || 'TuitionFee').replace(/\s+/g, '')}`;
      const feeRef = doc(firestoreDb, 'studentFees', feeDocId);

      const newPaid = parseIntegerAmount(fee.paidAmount || 0) + allocated;
      const newDue = Math.max(0, feeDue - allocated);
      const newStatus = newDue === 0 ? 'paid' : 'partial';

      allocations.push({
        feeId: feeDocId,
        month: fee.month || 'Current',
        type: fee.type || 'Tuition Fee',
        allocatedAmount: allocated,
        previousDue: feeDue,
        remainingDue: newDue,
        status: newStatus
      });

      transaction.set(feeRef, {
        studentId: studentId,
        studentName: params.student.fullName || params.student.name,
        month: fee.month || 'Current',
        type: fee.type || 'Tuition Fee',
        totalFee: parseIntegerAmount(fee.totalFee || feeDue),
        paidAmount: newPaid,
        dueAmount: newDue,
        status: newStatus,
        transactionId: txId,
        receiptNo: params.receiptNo,
        remitBillId: params.prefilledBillData?.id || fee.remitBillId || null,
        ledgerPageNo: params.handwrittenLedgerNo || 'MAIN-LEDGER',
        isHandwrittenMode: !!params.isHandwrittenMode,
        handwrittenReceiptSerial: params.handwrittenReceiptSerial || '',
        handwrittenSignVerified: !!params.handwrittenSignVerified,
        paidAt: now.toISOString(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // If prefilled remit bill exists, update its status
    if (billDocRef && liveBillData) {
      const totalBillAmount = parseIntegerAmount(liveBillData.totalAmount || liveBillData.amount || params.prefilledBillData?.totalAmount || params.prefilledBillData?.amount);
      const previousPaid = parseIntegerAmount(liveBillData.paidAmount || 0);
      const newBillPaid = Math.min(totalBillAmount, previousPaid + breakdown.amountApplied);
      const newBillDue = Math.max(0, totalBillAmount - newBillPaid);
      const isFullyPaid = newBillDue === 0;

      transaction.update(billDocRef, {
        status: isFullyPaid ? 'paid' : (newBillPaid > 0 ? 'partial' : 'pending'),
        paidAmount: newBillPaid,
        dueAmount: newBillDue,
        transactionId: txId,
        paidAt: bsDate,
        updatedAt: serverTimestamp()
      });
    }

    // 4. Handle Advance or Excess Return
    let advanceDocId: string | null = null;
    let refundDocId: string | null = null;

    if (breakdown.isExcess) {
      if (params.excessDecision === 'ADVANCE') {
        const advRef = doc(collection(firestoreDb, 'student_advances'));
        advanceDocId = advRef.id;
        const currentAdv = parseIntegerAmount(studentData.advanceBalance || 0);

        transaction.set(advRef, {
          studentId: studentId,
          studentName: params.student.fullName || params.student.name,
          class: params.student.class,
          rollNumber: params.student.rollNumber || params.student.roll || '-',
          amount: breakdown.excessAmount,
          remainingCredit: breakdown.excessAmount,
          sourceTransactionId: txId,
          paymentGroupId: paymentGroupId,
          receiptNo: params.receiptNo,
          status: 'ACTIVE',
          accountantName: params.accountantName || operatorName,
          accountantRemarks: params.accountantRemarks || 'Excess cash payment credited to advance ledger',
          dateBS: bsDate,
          createdAt: serverTimestamp()
        });

        // Update student doc advance balance safely (set with merge to prevent failure if doc doesn't exist)
        transaction.set(studentDocRef, {
          advanceBalance: currentAdv + breakdown.excessAmount,
          updatedAt: serverTimestamp()
        }, { merge: true });

      } else if (params.excessDecision === 'RETURN') {
        const refDoc = doc(collection(firestoreDb, 'refund_records'));
        refundDocId = refDoc.id;

        transaction.set(refDoc, {
          studentId: studentId,
          studentName: params.student.fullName || params.student.name,
          class: params.student.class,
          amount: breakdown.excessAmount,
          sourceTransactionId: txId,
          receiptNo: params.receiptNo,
          type: 'EXCESS_CASH_RETURN',
          status: 'RETURNED_TO_GUARDIAN',
          approvedBy: params.accountantName || operatorName,
          reason: params.accountantRemarks || 'Excess cash returned to guardian at counter',
          dateBS: bsDate,
          timestamp: serverTimestamp()
        });

        // Add expense entry in cash_ledger for physical cash returned
        const refundLedgerRef = doc(collection(firestoreDb, 'cash_ledger'));
        transaction.set(refundLedgerRef, {
          type: 'Expense',
          date: bsDate,
          amount: breakdown.excessAmount,
          category: 'Excess Return to Guardian',
          remarks: `Excess Cash Refund for Receipt #${params.receiptNo} (${params.student.fullName || params.student.name}) | Approved by: ${params.accountantName || operatorName}`,
          recordedBy: operatorName,
          operatorUid: operatorUid,
          transactionId: txId,
          timestamp: serverTimestamp()
        });
      }
    }

    // 5. Create immutable Transaction Record
    const baseRemarks = params.remarks?.trim() || `Cash Fee Settlement for ${params.student.name}`;
    const fullRemarks = baseRemarks.includes('Collected by:')
      ? baseRemarks
      : `${baseRemarks} | Collected by: ${operatorName}`;

    transaction.set(txDocRef, {
      id: txId,
      paymentGroupId: paymentGroupId,
      sourceTransactionId: txId,
      transactionType: 'FEE_PAYMENT',
      date: bsDate,
      receipt: params.receiptNo,
      receiptNo: params.receiptNo,
      studentId: studentId,
      studentName: params.student.fullName || params.student.name,
      class: params.student.class,
      rollNo: params.student.rollNumber || params.student.roll || '-',
      // Physical Cash Tendered and Amount Applied
      amount: breakdown.amountApplied,
      cashTendered: cashTendered,
      cashReceived: cashTendered,
      changeReturned: breakdown.changeReturned,
      // Clear breakdown metrics
      netPayable: netPayable,
      amountApplied: breakdown.amountApplied,
      remainingOutstanding: breakdown.remainingOutstanding,
      excessAmount: breakdown.excessAmount,
      excessDecision: params.excessDecision || null,
      advanceCreated: params.excessDecision === 'ADVANCE' ? breakdown.excessAmount : 0,
      excessReturned: params.excessDecision === 'RETURN' ? breakdown.excessAmount : 0,
      advanceDocId: advanceDocId,
      refundDocId: refundDocId,
      // Metadata & items
      paymentCategory: params.paymentCategory,
      customNumberOfMonths: params.paymentCategory === 'custom' ? parseIntegerAmount(params.customNumberOfMonths || 1) : null,
      selectedMonth: params.selectedMonth || null,
      baseTuition: parseIntegerAmount(params.baseAmount),
      additionalCharges: params.additionalCharges.map(ch => ({ purpose: ch.purpose, amount: parseIntegerAmount(ch.amount) })),
      discounts: params.discounts.map(dc => ({ purpose: dc.purpose, amount: parseIntegerAmount(dc.amount) })),
      method: 'Cash',
      collectedBy: operatorName,
      createdBy: operatorName,
      creatorUid: operatorUid,
      status: 'SUCCESS',
      allocations: allocations,
      remarks: fullRemarks,
      ledgerPageNo: params.handwrittenLedgerNo || '',
      isHandwrittenMode: !!params.isHandwrittenMode,
      handwrittenReceiptSerial: params.handwrittenReceiptSerial || '',
      handwrittenSignVerified: !!params.handwrittenSignVerified,
      remitBillId: params.prefilledBillData?.id || null,
      timestamp: serverTimestamp()
    });

    // 6. Record Cash Inflow in Cash Ledger
    // Inflow into school drawer: Gross physical cash received at counter (cashTendered).
    const netCashInflow = cashTendered;
    transaction.set(cashLedgerDocRef, {
      type: 'Income',
      date: bsDate,
      amount: netCashInflow,
      category: 'Fee Collection',
      transactionId: txId,
      sourceTransactionId: txId,
      paymentGroupId: paymentGroupId,
      relatedTransactionId: params.receiptNo,
      receiptNo: params.receiptNo,
      remarks: `Receipt #${params.receiptNo} for ${params.student.fullName || params.student.name} (Class ${params.student.class}) • Tendered: NRs. ${cashTendered.toLocaleString()} • Applied: NRs. ${breakdown.amountApplied.toLocaleString()}${params.excessDecision === 'ADVANCE' ? ` (includes Advance Credit: NRs. ${breakdown.excessAmount.toLocaleString()})` : (params.excessDecision === 'RETURN' ? ` (Change/Excess Returned: NRs. ${breakdown.excessAmount.toLocaleString()})` : '')}`,
      collectedBy: operatorName,
      recordedBy: operatorName,
      operatorUid: operatorUid,
      timestamp: serverTimestamp()
    });

    // 7. Atomic Audit Log Creation (recorded inside the same transaction)
    const opId = params.paymentGroupId || `OP_PAY_${txId}`;
    const auditLogRef = doc(firestoreDb, 'ledger_audit_logs', opId);
    const systemAuditLogRef = doc(firestoreDb, 'audit_logs', opId);
    const auditLogId = opId;

    const beforeState = {
      studentId: studentId,
      studentName: params.student.fullName || params.student.name,
      class: params.student.class,
      advanceBalance: parseIntegerAmount(studentData.advanceBalance || 0),
      netPayable: netPayable
    };

    const afterState = {
      transactionId: txId,
      receiptNo: params.receiptNo,
      amountApplied: breakdown.amountApplied,
      cashTendered: cashTendered,
      changeReturned: breakdown.changeReturned,
      excessAmount: breakdown.excessAmount,
      advanceCreated: params.excessDecision === 'ADVANCE' ? breakdown.excessAmount : 0,
      excessReturned: params.excessDecision === 'RETURN' ? breakdown.excessAmount : 0,
      remainingOutstanding: breakdown.remainingOutstanding,
      allocationsCount: allocations.length,
      status: 'SUCCESS'
    };

    const auditPayload = {
      id: auditLogId,
      auditLogId: auditLogId,
      operationId: opId,
      correlationId: paymentGroupId,
      category: 'financial',
      action: 'FEE_PAYMENT',
      actionType: 'PAYMENT_ENTRY',
      targetType: 'transaction',
      targetId: txId,
      transactionId: txId,
      receipt: params.receiptNo,
      receiptNo: params.receiptNo,
      paymentGroupId: paymentGroupId,
      studentId: studentId,
      studentUid: studentId,
      studentName: params.student.fullName || params.student.name,
      studentClass: params.student.class,
      academicYear: `${getBSYearMonthDate().year} BS`,
      beforeState: beforeState,
      afterState: afterState,
      previousValue: `Net Payable: NRs. ${netPayable.toLocaleString()} | Advance Balance: NRs. ${beforeState.advanceBalance.toLocaleString()}`,
      newValue: `Cash Tendered: NRs. ${cashTendered.toLocaleString()} | Applied: NRs. ${breakdown.amountApplied.toLocaleString()} | Change Returned: NRs. ${breakdown.changeReturned.toLocaleString()}${breakdown.isExcess ? ` | Excess (${params.excessDecision}): NRs. ${breakdown.excessAmount.toLocaleString()}` : ''}`,
      reason: fullRemarks,
      result: 'SUCCESS',
      actorUid: authoritativeActor.actorUid || operatorUid,
      adminUid: authoritativeActor.adminUid || operatorUid,
      actorName: authoritativeActor.actorName || operatorName,
      adminName: authoritativeActor.adminName || operatorName,
      actorRole: authoritativeActor.actorRole || 'admin',
      adminTier: authoritativeActor.adminTier || 'primary',
      date: bsDate,
      dateBS: bsDate,
      timestampStr: `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp()
    };

    transaction.set(auditLogRef, auditPayload);
    transaction.set(systemAuditLogRef, auditPayload);

    return {
      transactionId: txId,
      receiptNo: params.receiptNo,
      breakdown,
      allocations,
      advanceDocId,
      refundDocId,
      auditLogId
    };
  });
}

/**
 * Creates an Excess Payment Request when cash collection > net payable and accountant decision is pending.
 */
export async function createExcessPaymentRequest(params: CashPaymentExecutionParams) {
  const cashCollection = parseIntegerAmount(params.cashCollection);
  const netPayable = parseIntegerAmount(params.netPayable);
  const excessAmount = Math.max(0, cashCollection - netPayable);

  const reqDocRef = await addDoc(collection(db, 'excess_payment_requests'), {
    receiptNoDraft: params.receiptNo,
    studentId: params.student.id,
    studentName: params.student.fullName || params.student.name,
    class: params.student.class,
    rollNumber: params.student.rollNumber || params.student.roll || '-',
    academicYear: `${getBSYearMonthDate().year} BS`,
    netPayable: netPayable,
    cashCollection: cashCollection,
    excessAmount: excessAmount,
    cashierId: params.operatorUid || 'cashier',
    cashierName: params.operatorName || 'Cashier',
    paymentParams: JSON.parse(JSON.stringify(params)),
    status: 'PENDING_ACCOUNTANT_DECISION',
    createdAt: new Date().toISOString(),
    createdAtBS: formatBSDate(new Date()),
    timestamp: serverTimestamp()
  });

  return reqDocRef.id;
}

/**
 * Processes an approved accountant decision on an excess payment request.
 */
export async function processAccountantExcessDecision(
  requestId: string,
  decision: 'ADVANCE' | 'RETURN',
  accountantName: string,
  accountantUid: string,
  remarks: string,
  cachedPaymentParams: CashPaymentExecutionParams
) {
  const finalParams: CashPaymentExecutionParams = {
    ...cachedPaymentParams,
    excessDecision: decision,
    accountantName,
    accountantUid,
    accountantRemarks: remarks
  };

  const result = await executeCashFeePayment(finalParams);

  // Update request doc
  const reqRef = doc(db, 'excess_payment_requests', requestId);
  await updateDoc(reqRef, {
    status: decision === 'ADVANCE' ? 'APPROVED_AS_ADVANCE' : 'APPROVED_FOR_RETURN',
    decisionBy: accountantName,
    decisionUid: accountantUid,
    decisionRemarks: remarks,
    decisionAt: new Date().toISOString(),
    completedTransactionId: result.transactionId
  });

  await recordLedgerAuditLog({
    transactionId: result.transactionId,
    receipt: result.receiptNo,
    studentId: finalParams.student.id,
    studentName: finalParams.student.name,
    studentClass: finalParams.student.class,
    actionType: decision === 'ADVANCE' ? 'EXCESS_APPROVED_ADVANCE' : 'EXCESS_APPROVED_RETURN',
    previousValue: `Pending Excess Decision: NRs. ${result.breakdown.excessAmount.toLocaleString()}`,
    newValue: `Processed as ${decision === 'ADVANCE' ? 'Student Advance Credit' : 'Returned Cash to Guardian'} | Decision by ${accountantName}`,
    reason: remarks || 'Accountant decision executed',
    adminName: accountantName
  });

  return result;
}
