import React, { useState, useEffect, useRef } from 'react';
import { 
  History, 
  Wallet, 
  CreditCard, 
  AlertCircle, 
  FileDown, 
  Receipt, 
  FileText, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  Coins, 
  ArrowUpRight, 
  BookOpen, 
  Award, 
  GraduationCap, 
  Calendar,
  Layers,
  X
} from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, query, where, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import CashReceiptModal, { CashReceiptData } from '../components/fee_management/CashReceiptModal';
import { getSchoolLogoBase64 } from '../lib/logoHelper';

// Standard 12 Nepali Academic Months in Canonical Order
const NEPALI_ACADEMIC_MONTHS = [
  'Baisakh',
  'Jestha',
  'Ashadh',
  'Shrawan',
  'Bhadra',
  'Ashwin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra'
];

// Helper to normalize month names (e.g. Asar -> Ashadh)
const normalizeMonthName = (m: string): string => {
  const clean = (m || '').trim().toLowerCase();
  if (clean.includes('baisak')) return 'Baisakh';
  if (clean.includes('jest')) return 'Jestha';
  if (clean.includes('asar') || clean.includes('ashad')) return 'Ashadh';
  if (clean.includes('shrawan') || clean.includes('srawan')) return 'Shrawan';
  if (clean.includes('bhadra') || clean.includes('bhadau')) return 'Bhadra';
  if (clean.includes('ashwin') || clean.includes('asoj') || clean.includes('aswin')) return 'Ashwin';
  if (clean.includes('kartik')) return 'Kartik';
  if (clean.includes('mangsir') || clean.includes('mangs')) return 'Mangsir';
  if (clean.includes('poush') || clean.includes('paush') || clean.includes('pus')) return 'Poush';
  if (clean.includes('magh')) return 'Magh';
  if (clean.includes('falgun') || clean.includes('fagun')) return 'Falgun';
  if (clean.includes('chaitra') || clean.includes('chait')) return 'Chaitra';
  return m;
};

function getMonthsCovered(billingPeriod: string): string[] {
  if (!billingPeriod) return [];
  
  const foundMonths: { month: string; index: number }[] = [];
  NEPALI_ACADEMIC_MONTHS.forEach(m => {
    // Check both standard name and normalized aliases
    let idx = billingPeriod.indexOf(m);
    if (idx === -1 && m === 'Ashadh') {
      idx = billingPeriod.indexOf('Asar');
    }
    if (idx !== -1) {
      foundMonths.push({ month: m, index: idx });
    }
  });
  
  foundMonths.sort((a, b) => a.index - b.index);

  if (foundMonths.length === 1) {
    return [foundMonths[0].month];
  } else if (foundMonths.length >= 2) {
    const startM = foundMonths[0].month;
    const endM = foundMonths[foundMonths.length - 1].month;
    const startIdx = NEPALI_ACADEMIC_MONTHS.indexOf(startM);
    const endIdx = NEPALI_ACADEMIC_MONTHS.indexOf(endM);
    if (startIdx !== -1 && endIdx !== -1) {
      if (startIdx <= endIdx) {
        return NEPALI_ACADEMIC_MONTHS.slice(startIdx, endIdx + 1);
      } else {
        return [...NEPALI_ACADEMIC_MONTHS.slice(startIdx), ...NEPALI_ACADEMIC_MONTHS.slice(0, endIdx + 1)];
      }
    }
  }
  
  const covered: string[] = [];
  NEPALI_ACADEMIC_MONTHS.forEach(m => {
    if (billingPeriod.includes(m) || (m === 'Ashadh' && billingPeriod.includes('Asar'))) {
      covered.push(m);
    }
  });
  return covered;
}

export default function Account() {
  const [studentRecord, setStudentRecord] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [remitBills, setRemitBills] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [feeStructure, setFeeStructure] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Expandable UI States
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [selectedReceipt, setSelectedReceipt] = useState<CashReceiptData | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [selectedBillForDetail, setSelectedBillForDetail] = useState<any | null>(null);
  const [selectedPaymentForDetail, setSelectedPaymentForDetail] = useState<any | null>(null);

  const toggleMonthExpand = (month: string) => {
    setExpandedMonths(prev => ({ ...prev, [month]: !prev[month] }));
  };

  useEffect(() => {
    let unsubAuth = () => {};
    let unsubSettings = () => {};
    let unsubUser = () => {};
    let unsubFees1 = () => {};
    let unsubFees2 = () => {};
    let unsubTx1 = () => {};
    let unsubTx2 = () => {};
    let unsubBills1 = () => {};
    let unsubBills2 = () => {};
    let unsubAdv1 = () => {};
    let unsubAdv2 = () => {};

    unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setStudentRecord(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const studentId = user.uid;

      try {
        const userDocRef = doc(db, 'users', studentId);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
          setStudentRecord(null);
          setLoading(false);
          return;
        }

        const initialUserData = userDoc.data();
        if (initialUserData.role !== 'student') {
          setStudentRecord(null);
          setLoading(false);
          return;
        }

        if (initialUserData.status === 'pending') {
          setStudentRecord({ isPending: true });
          setLoading(false);
          return;
        }

        const customId = initialUserData.studentId;

        // 1. Listen to user profile real-time updates (e.g. advance balance, scholarship changes)
        unsubUser = onSnapshot(userDocRef, (snap) => {
          if (snap.exists()) {
            const freshData = snap.data();
            setStudentRecord((prev: any) => ({
              ...(prev || {}),
              ...freshData,
              id: studentId,
              name: freshData.fullName || freshData.name
            }));
          }
        });

        // 2. Listen to settings/fee_structure
        unsubSettings = onSnapshot(doc(db, 'settings', 'fee_structure'), (settingsSnap) => {
          if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            const structs = data.academic || [];

            const normalize = (name: string) =>
              (name || '').toLowerCase().replace(/^class\s+/, '').replace(/\s+/g, '').trim();
            const targetClass = normalize(initialUserData.class);
            const structure = structs.find((s: any) => normalize(s.className) === targetClass) || { tuition: '1000', annual: '12000' };

            let tuitionFeeNum = Number(String(structure.tuition || '1000').replace(/[^0-9.]/g, ''));
            if (initialUserData.scholarshipStatus === 'Provided' && initialUserData.scholarshipAmount) {
              const deduction = Number(initialUserData.scholarshipAmount);
              tuitionFeeNum = Math.max(0, tuitionFeeNum - deduction);
            }
            structure.tuitionFee = tuitionFeeNum;
            structure.annualFee = Number(String(structure.annual || '12000').replace(/[^0-9.]/g, ''));
            structure.admissionFee = Number(String(structure.admission || '0').replace(/[^0-9.]/g, ''));
            structure.examFee = Number(String(structure.exam || '0').replace(/[^0-9.]/g, ''));
            structure.computerFee = Number(String(structure.computer || '0').replace(/[^0-9.]/g, ''));
            setFeeStructure(structure);
          }
        });

        // 3. Setup real-time queries for fees, transactions, remitBills, student_advances
        const qFees1 = query(collection(db, 'studentFees'), where('studentId', '==', studentId));
        const qFees2 = customId && customId !== studentId ? query(collection(db, 'studentFees'), where('studentId', '==', customId)) : null;

        const qTx1 = query(collection(db, 'transactions'), where('studentId', '==', studentId));
        const qTx2 = customId && customId !== studentId ? query(collection(db, 'transactions'), where('studentId', '==', customId)) : null;

        const qBills1 = query(collection(db, 'remitBills'), where('studentId', '==', studentId));
        const qBills2 = customId && customId !== studentId ? query(collection(db, 'remitBills'), where('studentId', '==', customId)) : null;

        const qAdv1 = query(collection(db, 'student_advances'), where('studentId', '==', studentId));
        const qAdv2 = customId && customId !== studentId ? query(collection(db, 'student_advances'), where('studentId', '==', customId)) : null;

        let feesList1: any[] = [];
        let feesList2: any[] = [];
        let txList1: any[] = [];
        let txList2: any[] = [];
        let billsList1: any[] = [];
        let billsList2: any[] = [];
        let advList1: any[] = [];
        let advList2: any[] = [];

        const updateState = () => {
          const combinedFees = Array.from(new Map([...feesList1, ...feesList2].map(item => [item.id || item.month, item])).values());
          const combinedTx = Array.from(new Map([...txList1, ...txList2].map(item => [item.id, item])).values());
          const combinedBills = Array.from(new Map([...billsList1, ...billsList2].map(item => [item.id, item])).values());
          const combinedAdv = Array.from(new Map([...advList1, ...advList2].map(item => [item.id, item])).values());

          setStudentRecord((prev: any) => ({
            ...(prev || initialUserData),
            id: studentId,
            name: (prev?.fullName || prev?.name) || initialUserData.fullName || initialUserData.name,
            fees: combinedFees,
            remitBills: combinedBills
          }));
          setTransactions(combinedTx);
          setRemitBills(combinedBills);
          setAdvances(combinedAdv);
          setLoading(false);
        };

        unsubFees1 = onSnapshot(qFees1, (snap) => {
          feesList1 = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          updateState();
        });

        if (qFees2) {
          unsubFees2 = onSnapshot(qFees2, (snap) => {
            feesList2 = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            updateState();
          });
        }

        // MIGRATION-SAFE STATUS FILTER:
        // Current transactions MUST have status 'SUCCESS' or 'OVERRIDE_SUCCESS'.
        // For unmigrated historical records where status is undefined, verify it has a positive amount
        // and is not marked cancelled/refunded, voided, or drafted.
        const isRecognizedActiveRevenue = (t: any): boolean => {
          if (t.status === 'SUCCESS' || t.status === 'OVERRIDE_SUCCESS') return true;
          if (!t.status) {
            return Boolean(Number(t.amount || 0) > 0 && !t.cancelledAt && !t.refundedAt && !t.isDraft && t.status !== 'CANCELLED' && t.status !== 'REFUNDED' && t.status !== 'VOID');
          }
          return false;
        };

        unsubTx1 = onSnapshot(qTx1, (snap) => {
          txList1 = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(isRecognizedActiveRevenue);
          updateState();
        });

        if (qTx2) {
          unsubTx2 = onSnapshot(qTx2, (snap) => {
            txList2 = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(isRecognizedActiveRevenue);
            updateState();
          });
        }

        unsubBills1 = onSnapshot(qBills1, (snap) => {
          billsList1 = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          updateState();
        });

        if (qBills2) {
          unsubBills2 = onSnapshot(qBills2, (snap) => {
            billsList2 = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            updateState();
          });
        }

        unsubAdv1 = onSnapshot(qAdv1, (snap) => {
          advList1 = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          updateState();
        });

        if (qAdv2) {
          unsubAdv2 = onSnapshot(qAdv2, (snap) => {
            advList2 = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            updateState();
          });
        }

      } catch (err: any) {
        console.error('Account real-time init error:', err);
        setError('Failed to setup ledger stream');
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      unsubUser();
      unsubSettings();
      unsubFees1();
      unsubFees2();
      unsubTx1();
      unsubTx2();
      unsubBills1();
      unsubBills2();
      unsubAdv1();
      unsubAdv2();
    };
  }, []);

  // 12-Month Canonical Detailed Academic Ledger
  const detailedLedger = React.useMemo(() => {
    if (!studentRecord) return [];

    const tuitionFee = Number(studentRecord.monthlyFee || feeStructure?.tuitionFee || 1000);
    const examFee = Number(studentRecord.examFee || 0);
    const otherFee = Number(studentRecord.otherFee || 0);

    const isTransportIncluded = studentRecord.hasTransportation === 'Yes' || (studentRecord.transportRoute && studentRecord.transportRoute !== '') || Number(studentRecord.transportFee) > 0;
    const resolvedTransportFee = isTransportIncluded ? Number(studentRecord.transportFee || 400) : 0;

    const realFees = studentRecord.fees || [];
    const studentRemitBills = studentRecord.remitBills || [];

    const hasPaidComputerFeeInAnyMonth = realFees.some((f: any) => {
      const cVal = f.breakdown?.computer !== undefined ? Number(f.breakdown.computer) : 0;
      return cVal > 0 && f.status === 'paid';
    }) || studentRemitBills.some((b: any) => {
      const hasComp = b.itemizedCharges?.some((item: any) => item.name.toLowerCase().includes('computer'));
      return hasComp && b.status === 'paid';
    });

    const monthlyComputerFee = hasPaidComputerFeeInAnyMonth ? Number(studentRecord.computerFee || feeStructure?.computerFee || 500) : 0;
    const hasScholarship = studentRecord.scholarshipStatus === 'Provided';
    const scholarshipAmount = hasScholarship ? Number(studentRecord.scholarshipAmount || 0) : 0;

    return NEPALI_ACADEMIC_MONTHS.map((monthName, idx) => {
      // 1. Find official generated remitBill covering this month
      const matchingBill = studentRemitBills.find((b: any) => {
        if (b.status === 'void') return false; // Ignore void bills from active calculation
        const covered = getMonthsCovered(b.billingPeriod);
        return covered.some((m: string) => normalizeMonthName(m) === monthName);
      });

      // 2. Find standard legacy fee record if any
      const realData = realFees.find((f: any) => {
        const mName = normalizeMonthName(f.month || '');
        return mName === monthName;
      });

      let items: any[] = [];
      let totalBilled = 0;
      let totalPaid = 0;
      let totalDue = 0;
      let isBilled = false;
      let ledgerPageNo = '';
      let isFullyPaid = false;
      let isPartial = false;

      if (matchingBill) {
        isBilled = true;
        ledgerPageNo = matchingBill.billNo || 'RMT-LEDGER';
        const billTotal = Number(matchingBill.totalAmount || 0);
        const billPaid = Number(matchingBill.paidAmount || 0);
        isFullyPaid = matchingBill.status === 'paid' || (billPaid >= billTotal && billTotal > 0);
        isPartial = matchingBill.status === 'partial' || (billPaid > 0 && billPaid < billTotal);

        const covered = getMonthsCovered(matchingBill.billingPeriod);
        const numMonths = covered.length > 0 ? covered.length : 1;
        
        if (Array.isArray(matchingBill.itemizedCharges) && matchingBill.itemizedCharges.length > 0) {
          matchingBill.itemizedCharges.forEach((charge: any) => {
            const chargeTotal = Number(charge.total || 0);
            const proRatedAmt = charge.months && charge.months > 0 ? (charge.rate || (chargeTotal / charge.months)) : (chargeTotal / numMonths);
            if (proRatedAmt !== 0) {
              items.push({
                name: charge.name,
                amount: proRatedAmt,
                rate: charge.rate,
                isCredit: proRatedAmt < 0
              });
            }
          });
        }

        totalBilled = billTotal / numMonths;
        totalPaid = billPaid / numMonths;
        totalDue = Math.max(0, totalBilled - totalPaid);

      } else if (realData) {
        isBilled = true;
        ledgerPageNo = realData.ledgerPageNo || '';
        const breakdown = realData.breakdown || {};
        
        const tVal = breakdown.tuition !== undefined ? Number(breakdown.tuition) : tuitionFee;
        const eVal = breakdown.exam !== undefined ? Number(breakdown.exam) : examFee;
        const cVal = breakdown.computer !== undefined ? Number(breakdown.computer) : 0;
        const trVal = breakdown.transport !== undefined ? Number(breakdown.transport) : resolvedTransportFee;
        const oVal = breakdown.other !== undefined ? Number(breakdown.other) : otherFee;
        const sVal = breakdown.scholarship !== undefined ? Number(breakdown.scholarship) : scholarshipAmount;

        if (tVal > 0) items.push({ name: 'Tuition Fee', amount: tVal });
        if (eVal > 0) items.push({ name: 'Exam Fee', amount: eVal });
        if (cVal > 0) items.push({ name: 'Computer Fee', amount: cVal });
        if (trVal > 0) items.push({ name: 'Transport Fee', amount: trVal });
        if (oVal > 0) items.push({ name: 'Other Fee', amount: oVal });

        Object.entries(breakdown).forEach(([key, val]) => {
          const kLower = key.toLowerCase();
          if (!['tuition', 'exam', 'computer', 'transport', 'other', 'scholarship'].includes(kLower)) {
            const numVal = Number(val);
            if (numVal > 0) {
              items.push({ name: key, amount: numVal });
            }
          }
        });

        if (sVal > 0) {
          items.push({ name: 'Scholarship Grant', amount: -sVal, isCredit: true });
        }

        totalBilled = Number(realData.totalFee || realData.totalAmount || 0);
        totalPaid = Number(realData.paidAmount || (realData.status === 'paid' ? totalBilled : 0) || 0);
        totalDue = Number(realData.dueAmount !== undefined ? realData.dueAmount : (realData.status === 'paid' ? 0 : Math.max(0, totalBilled - totalPaid)));
        isFullyPaid = realData.status === 'paid' || (totalPaid >= totalBilled && totalBilled > 0);
        isPartial = realData.status === 'partial' || (totalPaid > 0 && totalPaid < totalBilled);

      } else {
        // Unbilled / upcoming month: No active bill or ledger charges exist in Firestore.
        // Billed and Due amounts must be 0 (no synthetic estimation).
        isBilled = false;
        items = [];
        totalBilled = 0;
        totalPaid = 0;
        totalDue = 0;
        isFullyPaid = false;
        isPartial = false;
      }

      return {
        month: monthName,
        monthIndex: idx,
        isBilled,
        isFullyPaid,
        isPartial,
        totalBilled,
        totalPaid,
        totalDue,
        items,
        ledgerPageNo,
        remarks: realData?.remarks || matchingBill?.remarks || ''
      };
    });
  }, [studentRecord, feeStructure]);

  // Verified Payment Transactions (From canonical `transactions` collection)
  const studentTransactions = React.useMemo(() => {
    if (!studentRecord) return [];
    const list: any[] = [];
    const seen = new Set<string>();

    const sId = (studentRecord.id || studentRecord.studentId || '').trim();
    const sName = (studentRecord.name || '').trim().toLowerCase();
    const sRoll = String(studentRecord.rollNumber || studentRecord.roll || '').trim();
    const sClass = String(studentRecord.class || '').trim().toLowerCase();

    transactions.forEach((tx: any) => {
      const matchId = tx.studentId && String(tx.studentId).trim() === sId;
      const matchName = tx.studentName && String(tx.studentName).trim().toLowerCase() === sName;
      const matchRoll = sRoll && tx.rollNo && String(tx.rollNo).trim() === sRoll && (!tx.className || String(tx.className).trim().toLowerCase() === sClass);

      if (matchId || matchName || matchRoll) {
        const key = tx.receipt || tx.receiptNo || tx.id;
        if (!seen.has(key)) {
          seen.add(key);
          const cashReceived = Number(tx.cashReceived !== undefined ? tx.cashReceived : (tx.cashTendered !== undefined ? tx.cashTendered : (tx.amount || 0)));
          const feeAmountApplied = Number(tx.netPayable !== undefined ? Math.min(tx.netPayable, tx.amountApplied || tx.amount || 0) : (tx.amountApplied || tx.amount || 0));
          const advanceCreated = Number(tx.advanceCreated || (tx.excessAmount && tx.excessDecision === 'ADVANCE' ? tx.excessAmount : 0));
          const cashReturned = Number(tx.changeReturned || tx.excessReturned || 0);
          const due = tx.remainingDue !== undefined ? Number(tx.remainingDue) : (tx.remainingOutstanding !== undefined ? Number(tx.remainingOutstanding) : 0);
          const isPartial = tx.isPartial !== undefined ? Boolean(tx.isPartial) : (due > 0);

          list.push({
            id: tx.id || key,
            receipt: tx.receipt || tx.receiptNo || key,
            date: tx.date || tx.dateBS || '-',
            cashReceived,
            feeAmountApplied,
            advanceCreated,
            changeReturned: cashReturned,
            remainingDue: due,
            isPartial,
            particulars: tx.particulars || tx.remarks || tx.billingPeriod || 'Official Cash Receipt',
            method: tx.method || 'Cash',
            status: tx.status || 'SUCCESS',
            remitBillId: tx.remitBillId || tx.billNo || '-',
            billingPeriod: tx.billingPeriod || tx.remarks || '-',
            raw: tx
          });
        }
      }
    });

    return list.sort((a, b) => (b.date > a.date ? 1 : -1));
  }, [studentRecord, transactions]);

  // Financial Totals Computed Directly From Canonical Sources
  const totalBilledSum = React.useMemo(() => {
    return detailedLedger.reduce((sum, r) => sum + (Number(r.totalBilled) || 0), 0);
  }, [detailedLedger]);

  const totalPaidSum = React.useMemo(() => {
    return detailedLedger.reduce((sum, r) => sum + (Number(r.totalPaid) || 0), 0);
  }, [detailedLedger]);

  const totalDue = React.useMemo(() => {
    let due = 0;
    detailedLedger.forEach((row: any) => {
      if (row.isBilled && !row.isFullyPaid) {
        due += row.totalDue;
      }
    });
    return due;
  }, [detailedLedger]);

  // Advance Credit Balance
  const availableAdvance = React.useMemo(() => {
    if (studentRecord?.advanceBalance !== undefined) {
      return Number(studentRecord.advanceBalance || 0);
    }
    return advances
      .filter((a: any) => a.status === 'ACTIVE' || !a.status)
      .reduce((sum: number, a: any) => sum + (Number(a.remainingCredit !== undefined ? a.remainingCredit : a.amount) || 0), 0);
  }, [studentRecord, advances]);

  // Scholarship & Concession Details
  const scholarshipInfo = React.useMemo(() => {
    const isProvided = studentRecord?.scholarshipStatus === 'Provided';
    const amount = isProvided ? Number(studentRecord.scholarshipAmount || 0) : 0;
    const annualConcession = amount * 12;
    const reason = studentRecord?.scholarshipReason || studentRecord?.scholarshipRemarks || 'Merit / Special Financial Assistance';
    return {
      isProvided,
      monthlyDeduction: amount,
      annualConcession,
      reason
    };
  }, [studentRecord]);

  // Previous Academic Year Outstanding (Back Dues)
  const previousYearOutstanding = React.useMemo(() => {
    return Number(studentRecord?.previousDue || studentRecord?.previousYearBalance || studentRecord?.backDues || 0);
  }, [studentRecord]);

  // Open Receipt Handler for CashReceiptModal
  const handleOpenReceipt = (txRaw: any) => {
    const linkedBill = remitBills.find(b => b.id === txRaw.remitBillId || b.billNo === txRaw.remitBillId || b.billNo === txRaw.billNo);
    
    const additionalCharges: { purpose: string; amount: number }[] = [];
    const discounts: { purpose: string; amount: number }[] = [];
    let baseTuition = 0;
    
    if (Array.isArray(txRaw.allocations) && txRaw.allocations.length > 0) {
      txRaw.allocations.forEach((alloc: any) => {
        const name = alloc.feeHead || alloc.feeName || alloc.name || 'Fee Charge';
        const amt = Number(alloc.allocatedAmount || alloc.amount || 0);
        if (name.toLowerCase().includes('tuition')) {
          baseTuition += amt;
        } else if (amt > 0) {
          additionalCharges.push({ purpose: name, amount: amt });
        }
      });
    } else if (linkedBill && Array.isArray(linkedBill.itemizedCharges)) {
      linkedBill.itemizedCharges.forEach((item: any) => {
        const name = item.name || 'Charge';
        const amt = Number(item.total || 0);
        if (name.toLowerCase().includes('tuition')) {
          baseTuition += amt;
        } else if (amt > 0) {
          additionalCharges.push({ purpose: name, amount: amt });
        }
      });
    } else {
      baseTuition = Number(txRaw.netPayable || txRaw.amountApplied || txRaw.amount || 0);
    }

    const receiptModalData: CashReceiptData = {
      receiptNo: txRaw.receiptNo || txRaw.receipt || txRaw.id,
      date: txRaw.date || txRaw.dateBS || 'Current Date',
      englishDate: txRaw.englishDate,
      academicYear: txRaw.academicYear || linkedBill?.academicYear || '2083-2084 BS',
      studentName: txRaw.studentName || studentRecord?.name || 'Student',
      studentId: txRaw.studentId || studentRecord?.studentId || studentRecord?.id,
      className: txRaw.class || txRaw.className || studentRecord?.class || 'N/A',
      rollNo: txRaw.rollNo || studentRecord?.rollNumber || studentRecord?.roll || '',
      guardianName: studentRecord?.fatherName || studentRecord?.guardianName || studentRecord?.parentName,
      billingPeriod: txRaw.billingPeriod || linkedBill?.billingPeriod || 'Official Fee Payment',
      baseTuition: baseTuition,
      coveredMonths: txRaw.coveredMonths || (linkedBill ? getMonthsCovered(linkedBill.billingPeriod) : []),
      additionalCharges: additionalCharges,
      discounts: discounts,
      totalPayable: Number(txRaw.netPayable !== undefined ? txRaw.netPayable : (txRaw.totalPayable || txRaw.amount || 0)),
      netPayable: Number(txRaw.netPayable !== undefined ? txRaw.netPayable : (txRaw.totalPayable || txRaw.amount || 0)),
      cashReceived: Number(txRaw.cashReceived !== undefined ? txRaw.cashReceived : (txRaw.cashTendered !== undefined ? txRaw.cashTendered : (txRaw.amount || 0))),
      amountApplied: Number(txRaw.amountApplied !== undefined ? txRaw.amountApplied : (txRaw.amount || 0)),
      remainingOutstanding: Number(txRaw.remainingOutstanding !== undefined ? txRaw.remainingOutstanding : (txRaw.remainingDue || 0)),
      excessAmount: Number(txRaw.excessAmount || 0),
      advanceCreated: Number(txRaw.advanceCreated || 0),
      excessReturned: Number(txRaw.excessReturned || txRaw.changeReturned || 0),
      changeReturned: Number(txRaw.changeReturned || 0),
      cashierName: txRaw.cashierName || txRaw.collectedBy || 'School Accountant',
      remarks: txRaw.remarks || txRaw.particulars || 'Fee Payment Settlement',
      handwrittenLedgerNo: txRaw.handwrittenLedgerNo || txRaw.ledgerPageNo || ''
    };

    setSelectedReceipt(receiptModalData);
    setIsReceiptModalOpen(true);
  };

  // Printable Audited Statement (Universal Standard Compliant)
  const printFullStatement = () => {
    if (!studentRecord) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let ledgerRowsHtml = '';
    detailedLedger.forEach((r: any) => {
      const statusLabel = r.isBilled
        ? (r.isFullyPaid ? 'FULLY PAID' : (r.isPartial ? `PARTIAL (${Math.round((r.totalPaid / (r.totalBilled || 1)) * 100)}%)` : 'UNPAID DUE'))
        : 'UPCOMING / UNBILLED';
      const statusBg = r.isBilled
        ? (r.isFullyPaid ? '#dcfce7; color: #15803d;' : (r.isPartial ? '#fef3c7; color: #b45309;' : '#fee2e2; color: #b91c1c;'))
        : '#f1f5f9; color: #475569;';

      ledgerRowsHtml += `
        <tr>
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: bold;">${r.month}</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px; text-align: right; font-family: monospace;">NRs. ${Math.round(r.totalBilled).toLocaleString()}</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px; text-align: right; font-family: monospace; color: #16a34a; font-weight: bold;">NRs. ${Math.round(r.totalPaid).toLocaleString()}</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px; text-align: right; font-family: monospace; color: ${r.totalDue > 0 ? '#dc2626' : '#64748b'}; font-weight: bold;">NRs. ${Math.round(r.totalDue).toLocaleString()}</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px; text-align: center;">
            <span style="font-weight: 800; font-size: 10px; padding: 2px 8px; border-radius: 9999px; background: ${statusBg}">${statusLabel}</span>
          </td>
          <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-size: 11px; color: #64748b;">${r.ledgerPageNo || '-'}</td>
        </tr>
      `;
    });

    let txRowsHtml = '';
    if (studentTransactions.length === 0) {
      txRowsHtml = `<tr><td colspan="7" style="border: 1px solid #e2e8f0; padding: 12px; text-align: center; color: #94a3b8; font-style: italic;">No payment transactions recorded yet.</td></tr>`;
    } else {
      studentTransactions.forEach((tx: any) => {
        txRowsHtml += `
          <tr>
            <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-family: monospace;">${tx.date}</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px 12px; font-weight: bold; font-family: monospace;">${tx.receipt}</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px 12px; text-align: right; font-family: monospace;">NRs. ${Number(tx.cashReceived || 0).toLocaleString()}</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px 12px; text-align: right; font-weight: bold; color: #16a34a; font-family: monospace;">NRs. ${Number(tx.feeAmountApplied || 0).toLocaleString()}</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px 12px; text-align: right; color: #0284c7; font-family: monospace;">${tx.advanceCreated > 0 ? `NRs. ${Number(tx.advanceCreated).toLocaleString()}` : '-'}</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px 12px; text-align: right; color: #64748b; font-family: monospace;">${tx.changeReturned > 0 ? `NRs. ${Number(tx.changeReturned).toLocaleString()}` : '-'}</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px 12px; text-align: center;"><span style="background: #dcfce7; color: #15803d; font-weight: 800; font-size: 10px; padding: 2px 8px; border-radius: 9999px;">SUCCESS</span></td>
          </tr>
        `;
      });
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Student Fee Statement - ${studentRecord.name}</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; padding: 30px; color: #1e293b; }
          .container { max-width: 800px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; }
          .title { font-size: 20px; font-weight: 900; text-transform: uppercase; margin: 0; color: #0f172a; }
          .sub { font-size: 11px; color: #64748b; margin: 4px 0 0 0; }
          .badge { display: inline-block; background: #0f172a; color: #fff; font-size: 10px; font-weight: 800; padding: 4px 12px; border-radius: 9999px; margin-top: 8px; text-transform: uppercase; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; font-size: 12px; background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0; }
          .summary-ribbon { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 24px; text-align: center; }
          .sum-card { border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; background: #fff; }
          .sum-card.due { background: #fef2f2; border-color: #fecaca; }
          .sum-card.paid { background: #f0fdf4; border-color: #bbf7d0; }
          .sum-card.advance { background: #f0f9ff; border-color: #bae6fd; }
          .sum-label { font-size: 10px; text-transform: uppercase; font-weight: 800; color: #64748b; display: block; }
          .sum-val { font-size: 16px; font-weight: 900; font-family: monospace; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; }
          th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 12px; font-size: 10px; text-transform: uppercase; font-weight: 800; color: #475569; }
          .section-title { font-size: 12px; font-weight: 900; text-transform: uppercase; color: #0f172a; margin-bottom: 8px; letter-spacing: 0.05em; }
          .footer { text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 16px; margin-top: 32px; }
        </style>
      </head>
      <body onload="window.print()">
        <div class="container">
          <div class="header">
            <h1 class="title">SHIKSHANTAR ACADEMY</h1>
            <p class="sub">Bastipur, Karjanha-05, Siraha, Nepal &bull; Regd: 1482/071 &bull; Phone: +977 9709867048</p>
            <div class="badge">OFFICIAL STUDENT FINANCIAL LEDGER STATEMENT &bull; SESSION 2083-2084 BS</div>
          </div>

          <div class="meta-grid">
            <div>
              <strong>Student Name:</strong> ${studentRecord.name}<br/>
              <strong>Class &amp; Roll:</strong> Class ${studentRecord.class} ${studentRecord.rollNumber ? `| Roll #${studentRecord.rollNumber}` : ''}<br/>
              <strong>Student ID:</strong> ${studentRecord.studentId || studentRecord.id}
            </div>
            <div style="text-align: right;">
              <strong>Guardian:</strong> ${studentRecord.fatherName || studentRecord.guardianName || studentRecord.parentName || '-'}<br/>
              <strong>Contact:</strong> ${studentRecord.mobileNumber || studentRecord.phone || '-'}<br/>
              <strong>Statement Date:</strong> ${new Date().toLocaleDateString('en-GB')}
            </div>
          </div>

          <div class="summary-ribbon">
            <div class="sum-card">
              <span class="sum-label">Active Billed Charges</span>
              <div class="sum-val" style="color: #0f172a;">NRs. ${Math.round(totalBilledSum).toLocaleString()}</div>
            </div>
            <div class="sum-card paid">
              <span class="sum-label" style="color: #15803d;">Fees Paid / Allocated</span>
              <div class="sum-val" style="color: #15803d;">NRs. ${Math.round(totalPaidSum).toLocaleString()}</div>
            </div>
            <div class="sum-card due">
              <span class="sum-label" style="color: #b91c1c;">Current Outstanding</span>
              <div class="sum-val" style="color: #b91c1c;">NRs. ${Math.round(totalDue).toLocaleString()}</div>
            </div>
            <div class="sum-card advance">
              <span class="sum-label" style="color: #0284c7;">Advance Credit</span>
              <div class="sum-val" style="color: #0284c7;">NRs. ${Math.round(availableAdvance).toLocaleString()}</div>
            </div>
          </div>

          <div class="section-title">1. Itemized Monthly Fee Account (12 Academic Months)</div>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Month</th>
                <th style="text-align: right;">Billed Amount</th>
                <th style="text-align: right;">Fees Paid</th>
                <th style="text-align: right;">Outstanding Due</th>
                <th style="text-align: center;">Status</th>
                <th style="text-align: left;">Ledger Ref</th>
              </tr>
            </thead>
            <tbody>
              ${ledgerRowsHtml}
            </tbody>
          </table>

          <div class="section-title">2. Payment History (Cash Received vs Fees Applied)</div>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Date</th>
                <th style="text-align: left;">Receipt #</th>
                <th style="text-align: right;">Cash Received</th>
                <th style="text-align: right;">Fees Applied</th>
                <th style="text-align: right;">Advance Created</th>
                <th style="text-align: right;">Cash Returned</th>
                <th style="text-align: center;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${txRowsHtml}
            </tbody>
          </table>

          <div class="footer">
            Official Computer-Generated Fee Audit &bull; Shikshantar Academy Accounting Office<br/>
            Inquiries: +977 9807790805 &bull; Bastipur-5, Siraha &bull; academyshikshantar@gmail.com
          </div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] p-12 text-center">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
        <p className="font-bold text-gray-500 uppercase tracking-widest text-xs">Accessing Secure Student Fee Portal...</p>
      </div>
    );
  }

  if (studentRecord?.isPending) {
    return (
      <div className="bg-white rounded-3xl p-8 md:p-12 text-center shadow-sm border border-gray-100 max-w-2xl mx-auto mt-8">
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-100">
          <AlertCircle className="w-10 h-10 text-amber-500" />
        </div>
        <h3 className="text-2xl font-black text-gray-900 mb-3 tracking-tight">Account Pending Approval</h3>
        <p className="text-gray-500 mb-8 max-w-md mx-auto leading-relaxed text-sm">
          Your account is currently pending administrative verification. Once approved by the school office, your official fee statements and payment history will appear here.
        </p>
        <button onClick={() => window.history.back()} className="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 transition-all text-xs uppercase tracking-widest">
          &larr; Return to Dashboard
        </button>
      </div>
    );
  }

  if (error || !studentRecord) {
    return (
      <div className="bg-white rounded-3xl p-8 md:p-12 text-center shadow-sm border border-gray-100 max-w-2xl mx-auto mt-8">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-100">
          <Wallet className="w-10 h-10 text-red-500" />
        </div>
        <h3 className="text-2xl font-black text-gray-900 mb-3 tracking-tight">Financial Account Not Found</h3>
        <p className="text-gray-500 mb-8 max-w-md mx-auto leading-relaxed text-sm">
          Could not load the financial profile. Please ensure your student ID is paired with an active student enrollment record.
        </p>
        <button onClick={() => window.history.back()} className="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 transition-all text-xs uppercase tracking-widest">
          &larr; Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 max-w-6xl mx-auto mb-20 px-3 sm:px-4">
      
      {/* 1. TOP DUE ALERT / ZERO-DEBT STATUS & CASH-ONLY SCHOOL POLICY BANNER */}
      <div className="flex flex-col gap-3">
        {totalDue > 0 ? (
          <div className="w-full bg-red-50/90 border border-red-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-red-950 uppercase tracking-wide">
                    Current Outstanding Due: NRs. {totalDue.toLocaleString()}
                  </h3>
                  <span className="bg-red-200 text-red-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                    Action Required
                  </span>
                </div>
                <p className="text-xs text-red-700 font-medium mt-0.5">
                  Officially billed and issued unpaid dues. Please visit the school accounting office to settle in cash.
                </p>
              </div>
            </div>
            <button 
              onClick={printFullStatement} 
              className="shrink-0 bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold uppercase tracking-wider px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <FileDown className="w-3.5 h-3.5" /> Download Statement
            </button>
          </div>
        ) : (
          <div className="w-full bg-emerald-50/90 border border-emerald-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-emerald-950 uppercase tracking-wide">
                    All Officially Billed Dues Cleared ✓
                  </h3>
                  <span className="bg-emerald-200 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                    Zero Debt
                  </span>
                </div>
                <p className="text-xs text-emerald-700 font-medium mt-0.5">
                  All issued fee obligations are settled. Thank you for maintaining an up-to-date account.
                </p>
              </div>
            </div>
            <button 
              onClick={printFullStatement} 
              className="shrink-0 bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold uppercase tracking-wider px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <FileDown className="w-3.5 h-3.5" /> Audited Statement
            </button>
          </div>
        )}

        {/* Cash-Only School Accounting Policy Notice */}
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-amber-900">
          <div className="flex items-center gap-2 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
            <span>
              <strong>Cash-Only School Policy:</strong> Fee payments are accepted in <strong>Cash</strong> at the school accounting counter. Online or electronic payments are not supported.
            </span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 shrink-0 hidden md:inline-block">
            Official Policy
          </span>
        </div>
      </div>

      {/* 2. STUDENT PROFILE & ACADEMIC SESSION HEADER */}
      <div className="bg-[#0A3D62] text-white rounded-3xl p-6 md:p-8 shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-white/15 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-blue-200 border border-white/10">
                Academic Session 2083-2084 BS
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                Active Student
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{studentRecord.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-white/80 mt-2">
              <span className="bg-white/10 px-2.5 py-0.5 rounded-md">Class: {studentRecord.class}</span>
              {studentRecord.rollNumber && <span className="bg-white/10 px-2.5 py-0.5 rounded-md">Roll No: {studentRecord.rollNumber}</span>}
              <span className="bg-white/10 px-2.5 py-0.5 rounded-md">ID: {studentRecord.studentId || studentRecord.id}</span>
              {studentRecord.fatherName && <span className="bg-white/10 px-2.5 py-0.5 rounded-md">Guardian: {studentRecord.fatherName}</span>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={printFullStatement}
              className="bg-white/15 hover:bg-white/25 text-white border border-white/20 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 backdrop-blur-sm"
            >
              <FileText className="w-4 h-4" /> Print Ledger Statement
            </button>
          </div>
        </div>
      </div>

      {/* 3. PHASE 1 — STUDENT ACCOUNT OVERVIEW (8 KEY FINANCIAL INDICATORS) */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-900 flex items-center gap-2">
            <Coins className="w-4 h-4 text-[#0A3D62]" /> Financial Overview &amp; Account Matrix
          </h2>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            Canonical Firestore Ledger
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          
          {/* 1. Academic Year */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <span className="text-gray-400 font-bold block text-[10px] uppercase tracking-wider mb-1">1. Academic Year</span>
            <span className="text-gray-900 font-black text-sm sm:text-base">2083-2084 BS</span>
          </div>

          {/* 2. Total Active Charges */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <span className="text-gray-400 font-bold block text-[10px] uppercase tracking-wider mb-1">2. Active Billed Charges</span>
            <span className="text-gray-900 font-black text-sm sm:text-base">NRs. {totalBilledSum.toLocaleString()}</span>
          </div>

          {/* 3. Scholarship / Concession */}
          <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
            <span className="text-emerald-700 font-bold block text-[10px] uppercase tracking-wider mb-1">3. Concession / Grant</span>
            <span className="text-emerald-700 font-black text-sm sm:text-base">
              {scholarshipInfo.isProvided ? `NRs. ${scholarshipInfo.annualConcession.toLocaleString()}` : 'None'}
            </span>
          </div>

          {/* 4. Net Charges */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <span className="text-gray-400 font-bold block text-[10px] uppercase tracking-wider mb-1">4. Net Billed Payable</span>
            <span className="text-gray-900 font-black text-sm sm:text-base">NRs. {totalBilledSum.toLocaleString()}</span>
          </div>

          {/* 5. Total Fees Paid / Allocated */}
          <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200">
            <span className="text-emerald-700 font-bold block text-[10px] uppercase tracking-wider mb-1">5. Fees Paid / Allocated</span>
            <span className="text-emerald-800 font-black text-sm sm:text-base">NRs. {totalPaidSum.toLocaleString()}</span>
          </div>

          {/* 6. Current Outstanding (Active Dues) */}
          <div className={`p-4 rounded-2xl border ${totalDue > 0 ? 'bg-red-50 border-red-200 text-red-900' : 'bg-slate-50 border-slate-100 text-gray-900'}`}>
            <span className={`font-bold block text-[10px] uppercase tracking-wider mb-1 ${totalDue > 0 ? 'text-red-600' : 'text-gray-400'}`}>
              6. Current Outstanding
            </span>
            <span className={`font-black text-sm sm:text-base ${totalDue > 0 ? 'text-red-700' : 'text-gray-900'}`}>
              NRs. {totalDue.toLocaleString()}
            </span>
          </div>

          {/* 7. Advance Credit */}
          <div className="bg-sky-50 p-4 rounded-2xl border border-sky-200">
            <span className="text-sky-700 font-bold block text-[10px] uppercase tracking-wider mb-1">7. Available Advance Credit</span>
            <span className="text-sky-800 font-black text-sm sm:text-base">
              NRs. {availableAdvance.toLocaleString()}
            </span>
          </div>

          {/* 8. Previous Academic Year Outstanding */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <span className="text-gray-400 font-bold block text-[10px] uppercase tracking-wider mb-1">8. Previous Year Dues</span>
            <span className="text-gray-700 font-black text-sm sm:text-base">
              {previousYearOutstanding > 0 ? `NRs. ${previousYearOutstanding.toLocaleString()}` : 'Cleared (NRs. 0)'}
            </span>
          </div>

        </div>
      </div>

      {/* 4. PHASE 1 — MONTHLY FEE ACCOUNT (12 NEPALI MONTHS IN CANONICAL ORDER) */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#0A3D62]" /> 12-Month Academic Fee Account
            </h2>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Itemized charges per month. Click any month card to view the breakdown of fee heads.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> PAID
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> PARTIAL
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-lg border border-red-200">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> DUE
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> UNBILLED
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {detailedLedger.map((monthData: any) => {
            const { month, isBilled, isFullyPaid, isPartial, totalBilled, totalPaid, totalDue: mDue, items, ledgerPageNo } = monthData;
            const isExpanded = Boolean(expandedMonths[month]);

            return (
              <div 
                key={month}
                className={`rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden ${
                  isBilled
                    ? isFullyPaid 
                      ? 'bg-emerald-50/30 border-emerald-200 hover:border-emerald-300' 
                      : isPartial 
                        ? 'bg-amber-50/40 border-amber-300 hover:border-amber-400' 
                        : 'bg-red-50/30 border-red-200 hover:border-red-300'
                    : 'bg-slate-50/40 border-slate-200'
                }`}
              >
                {/* Header Row */}
                <div 
                  onClick={() => toggleMonthExpand(month)}
                  className="p-4 cursor-pointer hover:bg-white/40 transition-colors flex items-center justify-between border-b border-gray-100/70"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm text-gray-900">{month}</span>
                    {ledgerPageNo && (
                      <span className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                        Ref: #{ledgerPageNo}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isBilled ? (
                      isFullyPaid ? (
                        <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                          PAID ✓
                        </span>
                      ) : isPartial ? (
                        <span className="text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-300">
                          PARTIAL
                        </span>
                      ) : (
                        <span className="text-[9px] font-black uppercase tracking-wider bg-red-100 text-red-800 px-2 py-0.5 rounded-full border border-red-200">
                          DUE: NRs. {mDue.toLocaleString()}
                        </span>
                      )
                    ) : (
                      <span className="text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        UPCOMING
                      </span>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>

                {/* Card Body Matrix */}
                <div className="p-4 space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-center text-xs pb-2 border-b border-gray-100/60">
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold block">Billed</span>
                      <span className="font-black text-gray-900 font-mono">NRs. {Math.round(totalBilled).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-emerald-600 font-bold block">Paid</span>
                      <span className="font-black text-emerald-700 font-mono">NRs. {Math.round(totalPaid).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-red-500 font-bold block">Outstanding</span>
                      <span className={`font-black font-mono ${mDue > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        NRs. {Math.round(mDue).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Expandable Itemized Fee Heads */}
                  {isExpanded && (
                    <div className="pt-2 space-y-1.5 animate-in fade-in duration-200">
                      <p className="text-[9px] font-black uppercase tracking-wider text-gray-400 mb-1">Applicable Fee Heads:</p>
                      {items.length > 0 ? (
                        items.map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-xs py-0.5">
                            <span className="text-gray-600 font-medium">{item.name}</span>
                            <span className={`font-mono font-bold ${item.isCredit ? 'text-emerald-600' : 'text-gray-800'}`}>
                              {item.isCredit ? '-' : ''}NRs. {Math.abs(Math.round(item.amount)).toLocaleString()}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-gray-400 italic">No charges issued yet for this upcoming month.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer Status Bar */}
                <div className="px-4 py-2 bg-black/[0.02] border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-500 font-medium">
                  <span>{isBilled ? `Status: ${isFullyPaid ? 'Settled in full' : (isPartial ? 'Partially settled' : 'Payment pending')}` : 'Status: Unbilled month'}</span>
                  <button 
                    onClick={() => toggleMonthExpand(month)}
                    className="text-[#0A3D62] hover:underline font-bold"
                  >
                    {isExpanded ? 'Collapse' : 'Details'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. OFFICIAL ISSUED BILLS (REMIT BILLS) */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-900 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[#0A3D62]" /> Official Issued Remit Bills
            </h2>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Authorized invoice bills generated by the administration office.
            </p>
          </div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {remitBills.filter(b => b.status !== 'void').length} Active Bill{remitBills.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-gray-400 uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3">Bill Number</th>
                <th className="py-3 px-3">Academic Session</th>
                <th className="py-3 px-3">Billing Period</th>
                <th className="py-3 px-3">Issue Date</th>
                <th className="py-3 px-3 text-right">Total Amount</th>
                <th className="py-3 px-3 text-right">Fees Paid</th>
                <th className="py-3 px-3 text-right">Outstanding</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {remitBills.filter(b => b.status !== 'void').map((bill: any) => {
                const total = Number(bill.totalAmount || 0);
                const paid = Number(bill.paidAmount || 0);
                const due = Math.max(0, total - paid);
                const isPaid = bill.status === 'paid' || (paid >= total && total > 0);
                const isPartial = bill.status === 'partial' || (paid > 0 && paid < total);

                return (
                  <tr key={bill.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-gray-900">{bill.billNo || bill.id}</td>
                    <td className="py-3 px-3 text-gray-600">{bill.academicYear || '2083-2084 BS'}</td>
                    <td className="py-3 px-3 text-gray-800 font-semibold">{bill.billingPeriod || 'Academic Billing'}</td>
                    <td className="py-3 px-3 text-gray-500">{bill.issueDate || bill.dateBS || bill.date || '-'}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-gray-900">NRs. {total.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600">NRs. {paid.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-red-600">{due > 0 ? `NRs. ${due.toLocaleString()}` : '0'}</td>
                    <td className="py-3 px-3 text-center">
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isPaid ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : (isPartial ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-red-100 text-red-800 border border-red-200')
                      }`}>
                        {isPaid ? 'PAID ✓' : (isPartial ? 'PARTIAL' : 'DUE')}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button 
                        onClick={() => setSelectedBillForDetail(bill)}
                        className="text-[#0A3D62] hover:bg-blue-50 px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors border border-blue-100"
                      >
                        View Items
                      </button>
                    </td>
                  </tr>
                );
              })}
              {remitBills.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-400 font-semibold italic">
                    No official remit bills generated for this student yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. PAYMENT HISTORY & OFFICIAL CASH RECEIPTS */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-900 flex items-center gap-2">
              <History className="w-4 h-4 text-[#0A3D62]" /> Payment History &amp; Official Receipts
            </h2>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Verified transactions showing Cash Received, Fees Applied, and Advance Created.
            </p>
          </div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {studentTransactions.length} Payment{studentTransactions.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-gray-400 uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3">Receipt No</th>
                <th className="py-3 px-3">Date (BS)</th>
                <th className="py-3 px-3 text-right">Cash Received</th>
                <th className="py-3 px-3 text-right text-emerald-700">Fees Applied</th>
                <th className="py-3 px-3 text-right text-sky-700">Advance Created</th>
                <th className="py-3 px-3 text-right text-gray-500">Cash Returned</th>
                <th className="py-3 px-3">Method</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {studentTransactions.map((tx: any) => (
                <tr key={tx.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="py-3 px-3 font-mono font-bold text-gray-900">{tx.receipt}</td>
                  <td className="py-3 px-3 text-gray-600">{tx.date}</td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-gray-900">NRs. {tx.cashReceived.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700">NRs. {tx.feeAmountApplied.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right font-mono text-sky-700 font-bold">
                    {tx.advanceCreated > 0 ? `NRs. ${tx.advanceCreated.toLocaleString()}` : '-'}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-gray-500">
                    {tx.changeReturned > 0 ? `NRs. ${tx.changeReturned.toLocaleString()}` : '-'}
                  </td>
                  <td className="py-3 px-3 text-gray-600">{tx.method}</td>
                  <td className="py-3 px-3 text-center">
                    <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-emerald-200">
                      CLEARED ✓
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button 
                        onClick={() => setSelectedPaymentForDetail(tx)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-colors"
                        title="View Settlement Accounting Breakdown"
                      >
                        Breakdown
                      </button>
                      <button 
                        onClick={() => handleOpenReceipt(tx.raw || tx)}
                        className="bg-[#0A3D62] hover:bg-[#082e4a] text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-xs"
                        title="View & Download Official Receipt"
                      >
                        <FileDown className="w-3 h-3" /> Receipt
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {studentTransactions.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-400 font-semibold italic">
                    No payment transactions recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. DEDICATED ADVANCE CREDIT, SCHOLARSHIP & PREVIOUS ACADEMIC YEAR CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Advance Credit Ledger Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-sky-950 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-600" /> Advance Credit
              </h3>
              <span className="text-xs font-black text-sky-800 bg-sky-50 px-2.5 py-1 rounded-full border border-sky-200">
                NRs. {availableAdvance.toLocaleString()}
              </span>
            </div>

            <p className="text-xs text-gray-500 mb-4 font-medium leading-relaxed">
              Advance Credit is money held by the school for future fee adjustment. It is automatically deducted when new bills are issued.
            </p>

            <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1">
              {advances.map((adv: any) => (
                <div key={adv.id} className="p-3 bg-sky-50/50 rounded-xl border border-sky-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-bold text-sky-950 block">{adv.receiptNo || 'Advance Credit'}</span>
                    <span className="text-[10px] text-gray-500 font-medium">{adv.dateBS || 'Session 2083-2084'} &bull; Status: {adv.status || 'ACTIVE'}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-black text-sky-800 block">NRs. {Number(adv.remainingCredit !== undefined ? adv.remainingCredit : adv.amount).toLocaleString()}</span>
                    <span className="text-[9px] text-gray-400 uppercase">Available</span>
                  </div>
                </div>
              ))}
              {advances.length === 0 && (
                <div className="p-4 text-center text-gray-400 text-xs italic bg-slate-50 rounded-xl">
                  No active advance balance on file.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scholarship & Concessions Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-emerald-950 flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-600" /> Scholarship &amp; Concessions
              </h3>
              <span className={`text-xs font-black px-2.5 py-1 rounded-full border ${
                scholarshipInfo.isProvided 
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}>
                {scholarshipInfo.isProvided ? 'Active ✓' : 'Standard'}
              </span>
            </div>

            <p className="text-xs text-gray-500 mb-4 font-medium leading-relaxed">
              Approved concessions reduce net tuition payable without erasing the official standard base rate.
            </p>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500 font-medium">Monthly Concession:</span>
                <span className="font-black text-emerald-700 font-mono">
                  {scholarshipInfo.isProvided ? `NRs. ${scholarshipInfo.monthlyDeduction.toLocaleString()}` : 'NRs. 0'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500 font-medium">Annualized Concession:</span>
                <span className="font-black text-emerald-700 font-mono">
                  {scholarshipInfo.isProvided ? `NRs. ${scholarshipInfo.annualConcession.toLocaleString()}` : 'NRs. 0'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500 font-medium">Category / Reason:</span>
                <span className="font-semibold text-gray-800">{scholarshipInfo.reason}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-gray-500 font-medium">Class Standard Base:</span>
                <span className="font-bold text-gray-800 font-mono">NRs. {Number(feeStructure?.tuition || 2800).toLocaleString()} / mo</span>
              </div>
            </div>
          </div>
        </div>

        {/* Previous Academic Year Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-gray-900 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-[#0A3D62]" /> Previous Academic Year
              </h3>
              <span className={`text-xs font-black px-2.5 py-1 rounded-full border ${
                previousYearOutstanding > 0 
                  ? 'bg-red-50 text-red-800 border-red-200' 
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}>
                {previousYearOutstanding > 0 ? 'Dues Pending' : 'Cleared ✓'}
              </span>
            </div>

            <p className="text-xs text-gray-500 mb-4 font-medium leading-relaxed">
              Historical ledger obligations for previous sessions (2082-2083 BS) tracked separately from the current year.
            </p>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500 font-medium">Previous Session:</span>
                <span className="font-bold text-gray-800">2082-2083 BS</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500 font-medium">Previous Back-Dues:</span>
                <span className={`font-mono font-black ${previousYearOutstanding > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {previousYearOutstanding > 0 ? `NRs. ${previousYearOutstanding.toLocaleString()}` : 'NRs. 0 (Cleared)'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500 font-medium">Ledger Audit Status:</span>
                <span className="font-semibold text-gray-700">Archived &amp; Verified</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-gray-500 font-medium">Session Balance:</span>
                <span className="font-bold text-gray-800">Zero Debt</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* 8. MODAL FOR SETTLEMENT ACCOUNTING BREAKDOWN */}
      {selectedPaymentForDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-black text-gray-900">Payment Settlement Breakdown</h3>
                <p className="text-[11px] text-gray-500 font-mono mt-0.5">Receipt #{selectedPaymentForDetail.receipt}</p>
              </div>
              <button 
                onClick={() => setSelectedPaymentForDetail(null)}
                className="w-8 h-8 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl space-y-1">
                <div className="flex justify-between text-blue-950 font-semibold">
                  <span>Transaction Date:</span>
                  <span>{selectedPaymentForDetail.date}</span>
                </div>
                <div className="flex justify-between text-blue-950 font-semibold">
                  <span>Payment Mode:</span>
                  <span>{selectedPaymentForDetail.method} (Accounting Counter)</span>
                </div>
              </div>

              <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 font-medium">
                <div className="p-3 flex justify-between items-center">
                  <span className="text-gray-600">Total Cash Tendered / Received:</span>
                  <span className="font-mono font-bold text-gray-900 text-sm">NRs. {selectedPaymentForDetail.cashReceived.toLocaleString()}</span>
                </div>
                <div className="p-3 flex justify-between items-center bg-emerald-50/40">
                  <span className="text-emerald-900">Amount Applied to Billed Fees:</span>
                  <span className="font-mono font-bold text-emerald-800 text-sm">NRs. {selectedPaymentForDetail.feeAmountApplied.toLocaleString()}</span>
                </div>
                <div className="p-3 flex justify-between items-center bg-sky-50/40">
                  <span className="text-sky-900">Advance Credit Created (Excess):</span>
                  <span className="font-mono font-bold text-sky-800 text-sm">NRs. {Number(selectedPaymentForDetail.advanceCreated || 0).toLocaleString()}</span>
                </div>
                <div className="p-3 flex justify-between items-center">
                  <span className="text-gray-600">Cash Change Returned:</span>
                  <span className="font-mono font-bold text-gray-700">NRs. {Number(selectedPaymentForDetail.changeReturned || 0).toLocaleString()}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-gray-600 space-y-1">
                <p>
                  <strong>Mathematical Verification:</strong>
                </p>
                <p className="font-mono text-[10px] text-gray-800">
                  Cash Received ({selectedPaymentForDetail.cashReceived.toLocaleString()}) = Fees Applied ({selectedPaymentForDetail.feeAmountApplied.toLocaleString()}) + Advance ({Number(selectedPaymentForDetail.advanceCreated || 0).toLocaleString()}) + Change ({Number(selectedPaymentForDetail.changeReturned || 0).toLocaleString()})
                </p>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <button 
                onClick={() => {
                  const raw = selectedPaymentForDetail.raw || selectedPaymentForDetail;
                  setSelectedPaymentForDetail(null);
                  handleOpenReceipt(raw);
                }}
                className="bg-[#0A3D62] hover:bg-[#082e4a] text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5"
              >
                <FileDown className="w-3.5 h-3.5" /> View Official Receipt
              </button>
              <button 
                onClick={() => setSelectedPaymentForDetail(null)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold px-4 py-2 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL FOR ITEMIZED BILL DETAIL */}
      {selectedBillForDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-black text-gray-900">Itemized Charges Breakdown</h3>
                <p className="text-[11px] text-gray-500 font-mono mt-0.5">Bill #{selectedBillForDetail.billNo || selectedBillForDetail.id}</p>
              </div>
              <button 
                onClick={() => setSelectedBillForDetail(null)}
                className="w-8 h-8 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="p-3 bg-blue-50 rounded-xl text-xs space-y-1">
                <div className="flex justify-between font-medium text-blue-900">
                  <span>Billing Period:</span>
                  <span className="font-bold">{selectedBillForDetail.billingPeriod}</span>
                </div>
                <div className="flex justify-between font-medium text-blue-900">
                  <span>Issue Date:</span>
                  <span>{selectedBillForDetail.issueDate || selectedBillForDetail.dateBS || '-'}</span>
                </div>
              </div>

              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 border-b border-gray-100 text-[10px] text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Fee Head</th>
                      <th className="py-2.5 px-3 text-center">Months</th>
                      <th className="py-2.5 px-3 text-right">Rate</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {Array.isArray(selectedBillForDetail.itemizedCharges) && selectedBillForDetail.itemizedCharges.map((item: any, idx: number) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-3 font-semibold text-gray-800">{item.name}</td>
                        <td className="py-2.5 px-3 text-center text-gray-500">{item.months || '-'}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-gray-600">{item.rate ? `NRs. ${item.rate.toLocaleString()}` : '-'}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900">NRs. {Number(item.total || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-between items-center text-xs font-black">
                <span className="text-gray-600 uppercase tracking-wide text-[10px]">Net Payable Amount:</span>
                <span className="text-base text-gray-900 font-mono">NRs. {Number(selectedBillForDetail.totalAmount || 0).toLocaleString()}</span>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 text-right">
              <button 
                onClick={() => setSelectedBillForDetail(null)}
                className="bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. UNIVERSAL STANDARD CASH RECEIPT MODAL */}
      <CashReceiptModal 
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        receipt={selectedReceipt}
      />

    </div>
  );
}
