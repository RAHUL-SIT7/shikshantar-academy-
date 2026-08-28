import React, { useState, useEffect } from 'react';
import { History, Wallet, CreditCard, AlertCircle, FileDown, Receipt, FileText } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import { useRef } from 'react';

const logoImage = "https://i.postimg.cc/nc9G7pRB/image.png";

const MONTHS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];

function getMonthsCovered(billingPeriod: string): string[] {
  if (!billingPeriod) return [];
  
  // Find all standard month names mentioned in the text
  const foundMonths: { month: string; index: number }[] = [];
  MONTHS.forEach(m => {
    const idx = billingPeriod.indexOf(m);
    if (idx !== -1) {
      foundMonths.push({ month: m, index: idx });
    }
  });
  
  // Sort by order of occurrence in the string to identify start and end accurately
  foundMonths.sort((a, b) => a.index - b.index);

  if (foundMonths.length === 1) {
    return [foundMonths[0].month];
  } else if (foundMonths.length >= 2) {
    const startM = foundMonths[0].month;
    const endM = foundMonths[foundMonths.length - 1].month;
    const startIdx = MONTHS.indexOf(startM);
    const endIdx = MONTHS.indexOf(endM);
    if (startIdx !== -1 && endIdx !== -1) {
      if (startIdx <= endIdx) {
        return MONTHS.slice(startIdx, endIdx + 1);
      } else {
        // Wrap-around
        return [...MONTHS.slice(startIdx), ...MONTHS.slice(0, endIdx + 1)];
      }
    }
  }
  
  // Fallback
  const covered: string[] = [];
  MONTHS.forEach(m => {
    if (billingPeriod.includes(m)) {
      covered.push(m);
    }
  });
  return covered;
}

export default function Account() {
  const [studentRecord, setStudentRecord] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [feeStructure, setFeeStructure] = useState<any>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const downloadReceipt = async () => {
    if (!receiptRef.current) return;
    try {
      const el = receiptRef.current;
      const w = el.offsetWidth;
      const h = el.scrollHeight;
      const canvas = await toPng(el, { pixelRatio: 2 });
      const dataUrl = canvas;
      const pdfWidth = 210;
      const pdfHeight = (h * pdfWidth) / w;
      const pdf = new jsPDF('p', 'mm', [pdfWidth, pdfHeight]);
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Receipt_${receipt.id}.pdf`);
    } catch (err) {
      console.error('Failed to generate PDF', err);
    }
  };

  useEffect(() => {
    let unsubAuth = () => {};
    let unsubSettings = () => {};
    let unsubFees1 = () => {};
    let unsubFees2 = () => {};
    let unsubTx1 = () => {};
    let unsubTx2 = () => {};
    let unsubBills1 = () => {};
    let unsubBills2 = () => {};

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

        const userData = userDoc.data();
        if (userData.role !== 'student') {
          setStudentRecord(null);
          setLoading(false);
          return;
        }

        if (userData.status === 'pending') {
          setStudentRecord({ isPending: true });
          setLoading(false);
          return;
        }

        const customId = userData.studentId;

        // 1. Listen to settings/fee_structure
        unsubSettings = onSnapshot(doc(db, 'settings', 'fee_structure'), (settingsSnap) => {
          if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            const structs = data.academic || [];

            const normalize = (name: string) =>
              (name || '').toLowerCase().replace(/^class\s+/, '').replace(/\s+/g, '').trim();
            const targetClass = normalize(userData.class);
            const structure = structs.find((s: any) => normalize(s.className) === targetClass) || { tuition: '1000', annual: '12000' };

            let tuitionFeeNum = Number(String(structure.tuition || '1000').replace(/[^0-9.]/g, ''));
            if (userData.scholarshipStatus === 'Provided' && userData.scholarshipAmount) {
              const deduction = Number(userData.scholarshipAmount);
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

        // 2. Setup queries for fees, transactions, remitBills
        const qFees1 = query(collection(db, 'studentFees'), where('studentId', '==', studentId));
        const qFees2 = customId && customId !== studentId ? query(collection(db, 'studentFees'), where('studentId', '==', customId)) : null;

        const qTx1 = query(collection(db, 'transactions'), where('studentId', '==', studentId));
        const qTx2 = customId && customId !== studentId ? query(collection(db, 'transactions'), where('studentId', '==', customId)) : null;

        const qBills1 = query(collection(db, 'remitBills'), where('studentId', '==', studentId));
        const qBills2 = customId && customId !== studentId ? query(collection(db, 'remitBills'), where('studentId', '==', customId)) : null;

        let feesList1: any[] = [];
        let feesList2: any[] = [];
        let txList1: any[] = [];
        let txList2: any[] = [];
        let billsList1: any[] = [];
        let billsList2: any[] = [];

        const updateState = () => {
          const combinedFees = Array.from(new Map([...feesList1, ...feesList2].map(item => [item.id || item.month, item])).values());
          const combinedTx = Array.from(new Map([...txList1, ...txList2].map(item => [item.id, item])).values());
          const combinedBills = Array.from(new Map([...billsList1, ...billsList2].map(item => [item.id, item])).values());

          setStudentRecord({
            ...userData,
            id: studentId,
            name: userData.fullName || userData.name,
            fees: combinedFees,
            remitBills: combinedBills
          });
          setTransactions(combinedTx);
          setLoading(false);
        };

        unsubFees1 = onSnapshot(qFees1, (snap) => {
          feesList1 = snap.docs.map(d => d.data());
          updateState();
        });

        if (qFees2) {
          unsubFees2 = onSnapshot(qFees2, (snap) => {
            feesList2 = snap.docs.map(d => d.data());
            updateState();
          });
        }

        unsubTx1 = onSnapshot(qTx1, (snap) => {
          txList1 = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((t: any) => t.status === 'SUCCESS' || !t.status);
          updateState();
        });

        if (qTx2) {
          unsubTx2 = onSnapshot(qTx2, (snap) => {
            txList2 = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((t: any) => t.status === 'SUCCESS' || !t.status);
            updateState();
          });
        }

        unsubBills1 = onSnapshot(qBills1, (snap) => {
          billsList1 = snap.docs.map(d => d.data());
          updateState();
        });

        if (qBills2) {
          unsubBills2 = onSnapshot(qBills2, (snap) => {
            billsList2 = snap.docs.map(d => d.data());
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
      unsubSettings();
      unsubFees1();
      unsubFees2();
      unsubTx1();
      unsubTx2();
      unsubBills1();
      unsubBills2();
    };
  }, []);

  const detailedLedger = React.useMemo(() => {
    if (!studentRecord) return [];

    const tuitionFee = Number(studentRecord.monthlyFee || feeStructure?.tuitionFee || 1000);
    const examFee = Number(studentRecord.examFee || 0);
    const otherFee = Number(studentRecord.otherFee || 0);

    const isTransportIncluded = studentRecord.hasTransportation === 'Yes' || (studentRecord.transportRoute && studentRecord.transportRoute !== '') || Number(studentRecord.transportFee) > 0;
    const resolvedTransportFee = isTransportIncluded ? Number(studentRecord.transportFee || 400) : 0;

    const realFees = studentRecord.fees || [];
    const studentRemitBills = studentRecord.remitBills || [];

    // Optional Computer fee: check if they paid it in any month (via remitBills or legacy studentFees)
    const hasPaidComputerFeeInAnyMonth = realFees.some((f: any) => {
      const cVal = f.breakdown?.computer !== undefined ? Number(f.breakdown.computer) : 0;
      return cVal > 0 && f.status === 'paid';
    }) || studentRemitBills.some((b: any) => {
      const hasComp = b.itemizedCharges?.some((item: any) => item.name.toLowerCase().includes('computer'));
      return hasComp && b.status === 'paid';
    });

    const monthlyComputerFee = hasPaidComputerFeeInAnyMonth ? Number(studentRecord.computerFee || feeStructure?.computerFee || 500) : 0;

    // Check if scholarship applies
    const hasScholarship = studentRecord.scholarshipStatus === 'Provided';
    const scholarshipAmount = hasScholarship ? Number(studentRecord.scholarshipAmount || 0) : 0;

    return MONTHS.map((monthName, idx) => {
      // Find official generated remitBill covering this month
      const matchingBill = studentRemitBills.find((b: any) => {
        const covered = getMonthsCovered(b.billingPeriod);
        return covered.some((m: string) => m.trim().toLowerCase() === monthName.toLowerCase());
      });

      // Find standard legacy fee record if any
      const realData = realFees.find((f: any) => {
        const mName = f.month ? f.month.trim().toLowerCase() : '';
        return mName === monthName.toLowerCase() || 
               (monthName === 'Baisakh' && mName.includes('baisak')) ||
               (monthName === 'Jestha' && mName.includes('jest')) ||
               (monthName === 'Asar' && mName.includes('asar'));
      });

      let items: any[] = [];
      let totalBilled = 0;
      let totalPaid = 0;
      let totalDue = 0;
      let isBilled = false;
      let ledgerPageNo = '';
      let isFullyPaid = false;

      if (matchingBill) {
        isBilled = true;
        ledgerPageNo = matchingBill.billNo || 'RMT-LEDGER';
        isFullyPaid = matchingBill.status === 'paid';

        const covered = getMonthsCovered(matchingBill.billingPeriod);
        const numMonths = covered.length > 0 ? covered.length : 1;
        
        matchingBill.itemizedCharges.forEach((charge: any) => {
          const proRatedAmt = Number(charge.total || 0) / numMonths;
          if (proRatedAmt !== 0) {
            items.push({
              name: charge.name,
              amount: proRatedAmt,
              isCredit: proRatedAmt < 0
            });
          }
        });

        totalBilled = Number(matchingBill.totalAmount || 0) / numMonths;
        totalPaid = Number(matchingBill.paidAmount || 0) / numMonths;
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
        totalPaid = Number(realData.paidAmount || 0);
        totalDue = Number(realData.dueAmount !== undefined ? realData.dueAmount : (realData.status === 'paid' ? 0 : totalBilled));
        isFullyPaid = totalPaid >= totalBilled || realData.status === 'paid';

      } else {
        isBilled = false;
        
        if (tuitionFee > 0) items.push({ name: 'Tuition Fee', amount: tuitionFee });
        
        if (monthlyComputerFee > 0) {
          items.push({ name: 'Computer Fee', amount: monthlyComputerFee });
        }

        if (resolvedTransportFee > 0) {
          items.push({ name: 'Transport Fee', amount: resolvedTransportFee });
        }

        if (scholarshipAmount > 0) {
          items.push({ name: 'Scholarship Grant', amount: -scholarshipAmount, isCredit: true });
        }

        totalBilled = Math.max(0, tuitionFee + monthlyComputerFee + resolvedTransportFee - scholarshipAmount);
        totalPaid = 0;
        totalDue = totalBilled;
        isFullyPaid = false;
      }

      return {
        month: monthName,
        monthIndex: idx,
        isBilled,
        isFullyPaid,
        totalBilled,
        totalPaid,
        totalDue,
        items,
        ledgerPageNo,
        remarks: realData?.remarks || matchingBill?.remarks || ''
      };
    });
  }, [studentRecord, feeStructure]);

  const breakdownData = React.useMemo(() => {
    if (!studentRecord || !feeStructure) {
      return {
        admissionFee: 0,
        annualFee: 0,
        examFee: 0,
        tuitionFeeAnnual: 0,
        computerFeeAnnual: 0,
        transportFeeAnnual: 0,
        scholarshipAnnual: 0,
        grossTotal: 10000,
        hasComputer: false,
        hasTransport: false
      };
    }

    const admissionFee = Number(feeStructure.admissionFee || 0);
    const annualFee = Number(feeStructure.annualFee || 0);
    const examFee = Number(feeStructure.examFee || 0) * 3; // 3 Term exams in an academic year
    
    const tuitionFee = Number(studentRecord.monthlyFee || feeStructure?.tuitionFee || 1000);
    const tuitionFeeAnnual = tuitionFee * 12;

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
    const computerFeeAnnual = monthlyComputerFee * 12;

    const isTransportIncluded = studentRecord.hasTransportation === 'Yes' || (studentRecord.transportRoute && studentRecord.transportRoute !== '') || Number(studentRecord.transportFee) > 0;
    const resolvedTransportFee = isTransportIncluded ? Number(studentRecord.transportFee || 400) : 0;
    const transportFeeAnnual = resolvedTransportFee * 12;

    const hasScholarship = studentRecord.scholarshipStatus === 'Provided';
    const scholarshipAmount = hasScholarship ? Number(studentRecord.scholarshipAmount || 0) : 0;
    const scholarshipAnnual = scholarshipAmount * 12;

    const grossTotal = admissionFee + annualFee + examFee + tuitionFeeAnnual + computerFeeAnnual + transportFeeAnnual - scholarshipAnnual;

    return {
      admissionFee,
      annualFee,
      examFee,
      tuitionFeeAnnual,
      computerFeeAnnual,
      transportFeeAnnual,
      scholarshipAnnual,
      grossTotal,
      hasComputer: hasPaidComputerFeeInAnyMonth,
      hasTransport: isTransportIncluded
    };
  }, [studentRecord, feeStructure]);

  if (loading) return <div className="p-20 text-center font-bold text-gray-400 animate-pulse uppercase tracking-widest text-xs">Accessing Secure Ledger...</div>;
  if (studentRecord?.isPending) return (
    <div className="bg-white rounded-3xl p-8 md:p-12 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 max-w-2xl mx-auto mt-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-50 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none opacity-60"></div>
        <div className="relative z-10">
          <div className="w-24 h-24 bg-gradient-to-br from-orange-50 to-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-white">
             <AlertCircle className="w-12 h-12 text-orange-500 relative z-10" />
          </div>
          <h3 className="text-2xl font-black text-gray-900 mb-3 tracking-tight">Account Pending Approval</h3>
          <p className="text-gray-500 mb-8 max-w-md mx-auto leading-relaxed">
            Your account is currently pending approval by the school administration. We couldn't load your financial records yet. Please check back later.
          </p>
          <button onClick={() => window.history.back()} className="w-full bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 shadow-md shadow-gray-900/20 transition-all flex items-center justify-center gap-2 whitespace-nowrap">
              &larr; Go Back
          </button>
        </div>
    </div>
  );
  if (error || !studentRecord) return (
    <div className="bg-white rounded-3xl p-8 md:p-12 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 max-w-2xl mx-auto mt-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-50 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none opacity-60"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-orange-50 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none opacity-60"></div>

        <div className="relative z-10">
          <div className="w-24 h-24 bg-gradient-to-br from-red-50 to-orange-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-white">
             <AlertCircle className="w-12 h-12 text-red-300 opacity-50 absolute" />
             <Wallet className="w-10 h-10 text-red-500 relative z-10" />
          </div>
          
          <h3 className="text-2xl font-black text-gray-900 mb-3 tracking-tight">Account Not Linked</h3>
          <p className="text-gray-500 mb-8 max-w-md mx-auto leading-relaxed">
            We couldn't load your financial records. This usually happens if your digital account hasn't been paired with your official school ID.
          </p>
          <button onClick={() => window.history.back()} className="w-full bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 shadow-md shadow-gray-900/20 transition-all flex items-center justify-center gap-2 whitespace-nowrap">
              &larr; Go Back
          </button>
        </div>
    </div>
  );

  const printMonthDetail = (monthData: any) => {
    if (!studentRecord) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let itemsHtml = '';
    monthData.items.forEach((item: any) => {
      const isCredit = item.isCredit;
      const amtText = isCredit ? `-NRs. ${Math.abs(item.amount)}` : `NRs. ${item.amount}`;
      const statusText = monthData.isBilled ? (monthData.isFullyPaid ? 'PAID' : 'DUE') : 'UNBILLED';
      const statusBg = monthData.isBilled ? (monthData.isFullyPaid ? '#dcfce7' : '#fee2e2') : '#fef3c7';
      const statusColor = monthData.isBilled ? (monthData.isFullyPaid ? '#15803d' : '#b91c1c') : '#b45309';

      itemsHtml += `
        <tr>
          <td style="border: 1px solid #e5e7eb; padding: 12px; font-size: 13px; font-weight: bold; color: #1e293b;">${item.name}</td>
          <td style="border: 1px solid #e5e7eb; padding: 12px; font-size: 13px; text-align: right; font-weight: black; color: ${isCredit ? '#16a34a' : '#1e293b'};">${amtText}</td>
          <td style="border: 1px solid #e5e7eb; padding: 12px; font-size: 13px; text-align: center;">
            <span style="font-weight: 800; font-size: 10px; padding: 4px 10px; border-radius: 9999px; background-color: ${statusBg}; color: ${statusColor}; text-transform: uppercase;">
              ${statusText}
            </span>
          </td>
        </tr>
      `;
    });

    printWindow.document.write(`
      <html>
        <head>
          <title>Monthly Invoice - ${monthData.month}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; }
            .header { text-align: center; border-bottom: 2px dashed #e2e8f0; padding-bottom: 24px; margin-bottom: 24px; }
            .school-title { font-size: 24px; font-weight: 900; color: #1e1b4b; text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
            .school-sub { font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; margin: 4px 0 0 0; }
            .invoice-label { display: inline-block; background: #e0e7ff; color: #4338ca; padding: 6px 16px; border-radius: 9999px; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 16px; }
            .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            .meta-table td { padding: 8px 0; font-size: 13px; font-weight: bold; }
            .label { color: #64748b; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
            .val { text-align: right; color: #0f172a; font-weight: 800; }
            .invoice-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            .invoice-table th { background: #f8fafc; border: 1px solid #e5e7eb; padding: 12px; font-size: 11px; font-weight: 900; text-transform: uppercase; color: #475569; letter-spacing: 0.05em; }
            .summary-box { background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 16px; margin-top: 24px; }
            .summary-row { display: flex; justify-between: space-between; font-size: 14px; font-weight: bold; margin-bottom: 8px; }
            .summary-row:last-child { margin-bottom: 0; padding-top: 8px; border-t: 1px solid #e2e8f0; font-size: 16px; font-weight: 900; }
            .footer { text-align: center; margin-top: 48px; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
          </style>
        </head>
        <body onload="window.print();">
          <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 32px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);">
            <div class="header">
              <div style="font-size: 32px; font-weight: 900; color: #4338ca; text-align: center; margin-bottom: 8px;">🏫</div>
              <h1 class="school-title">Shikshantar Academy</h1>
              <p class="school-sub">Karjanhana Municipality, Bastipur-5, Siraha, Nepal</p>
              <div class="invoice-label">${monthData.month} Statement</div>
            </div>

            <table class="meta-table">
              <tr>
                <td class="label">Student Name</td>
                <td class="val">${studentRecord.name}</td>
              </tr>
              <tr>
                <td class="label">Class & Roll No</td>
                <td class="val">Class ${studentRecord.class} ${studentRecord.rollNumber ? `| Roll #${studentRecord.rollNumber}` : ''}</td>
              </tr>
              <tr>
                <td class="label">Student ID</td>
                <td class="val">${studentRecord.studentId || studentRecord.id}</td>
              </tr>
              <tr>
                <td class="label">Statement Type</td>
                <td class="val">${monthData.isBilled ? 'OFFICIAL INVOICE BILL' : 'PROJECTED / PRE-BILLING QUOTE'}</td>
              </tr>
              ${monthData.ledgerPageNo ? `
              <tr>
                <td class="label">Handwritten Ledger Reference</td>
                <td class="val">${monthData.ledgerPageNo}</td>
              </tr>
              ` : ''}
            </table>

            <table class="invoice-table">
              <thead>
                <tr>
                  <th style="text-align: left;">Fee Category Description</th>
                  <th style="text-align: right; width: 120px;">Amount</th>
                  <th style="text-align: center; width: 100px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div class="summary-box">
              <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; margin-bottom: 8px;">
                <span style="color: #64748b; text-transform: uppercase; font-size: 10px;">Gross Total Billed</span>
                <span style="color: #0f172a; font-weight: 800;">NRs. ${monthData.totalBilled.toLocaleString()}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; margin-bottom: 8px;">
                <span style="color: #16a34a; text-transform: uppercase; font-size: 10px;">Amount Paid</span>
                <span style="color: #16a34a; font-weight: 800;">NRs. ${monthData.totalPaid.toLocaleString()}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 900; padding-top: 8px; border-top: 1px solid #e2e8f0; margin-top: 8px;">
                <span style="color: #b91c1c; text-transform: uppercase; font-size: 11px;">Outstanding Due</span>
                <span style="color: #b91c1c;">NRs. ${monthData.totalDue.toLocaleString()}</span>
              </div>
            </div>

            <div class="footer">
              Thank you for supporting quality education.<br/>
              Shikshantar Academy Billing Registry &bull; Siraha, Nepal
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const getStudentDue = () => {
      let totalDue = 0;
      detailedLedger.forEach((row: any) => {
          if (row.isBilled && !row.isFullyPaid) {
              totalDue += row.totalDue;
          }
      });
      return totalDue;
  };

  const getStudentPaidAmount = () => {
      let totalPaid = 0;
      transactions.forEach(t => {
          totalPaid += t.amount || 0;
      });
      return totalPaid;
  };

  const totalDue = getStudentDue();
  const totalPaid = getStudentPaidAmount();
  const annualTotal = breakdownData.grossTotal;
  
  const paymentHistory = transactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const progressPercentage = annualTotal > 0 ? Math.min(Math.round((totalPaid / annualTotal) * 100), 100) : 0;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 max-w-5xl mx-auto mb-20">
      
      {/* Top Banner specific handling */}
      {totalDue > 0 ? (
        <div className="w-full bg-red-100 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between border border-red-200">
           <div className="text-center md:text-left mb-4 md:mb-0">
               <h3 className="text-lg font-black text-red-800 flex items-center justify-center md:justify-start gap-2">
                 ⚠️ Fee Due: NRs. {totalDue.toLocaleString()}
               </h3>
               <p className="text-red-600 text-sm font-medium mt-1">Please visit the school fee office to pay in Cash.</p>
           </div>
        </div>
      ) : (
        <div className="w-full bg-emerald-100 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between border border-emerald-200">
           <div className="text-center md:text-left mb-4 md:mb-0">
               <h3 className="text-lg font-black text-emerald-800 flex items-center justify-center md:justify-start gap-2">
                 ✅ All fees cleared for this month
               </h3>
               <p className="text-emerald-700 text-sm font-medium mt-1">Thank you for keeping your account up to date.</p>
           </div>
        </div>
      )}

      {/* Account Info Banner */}
      <div className="bg-[#1e293b] text-white rounded-3xl p-6 md:p-10 shadow-xl relative overflow-hidden group">
        <Wallet className="absolute -right-6 -bottom-6 w-48 h-48 text-white/5 group-hover:scale-110 transition-transform duration-700" />
        <div className="relative z-10">
          <p className="text-[10px] font-black uppercase tracking-[4px] text-blue-400 mb-2">My Fee Status</p>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h1 className="text-3xl lg:text-4xl font-black tracking-tight">{studentRecord.name}</h1>
              <p className="text-sm font-bold opacity-70 mt-3 flex flex-wrap items-center gap-2">
                <span className="bg-white/10 px-3 py-1 rounded-full border border-white/5 uppercase tracking-widest text-[10px]">Class {studentRecord.class}</span>
                <span className="bg-white/10 px-3 py-1 rounded-full border border-white/5 uppercase tracking-widest text-[10px]">ID: {studentRecord.studentId || studentRecord.id.substring(0, 8)}</span>
              </p>
            </div>
            
            {/* ANNUAL OVERVIEW CARD */}
            <div className="text-left md:text-right bg-white/10 p-5 rounded-2xl backdrop-blur-md border border-white/10 shrink-0 min-w-[200px]">
               <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-1 gap-2 md:gap-4">
                  <div className="flex-1 w-full text-left md:text-right">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">Annual Fee</p>
                      <p className="text-xs font-black text-white py-0.5">NRs. {annualTotal.toLocaleString()}</p>
                  </div>
                  <button onClick={() => window.print()} className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 shrink-0 md:ml-auto">
                      <FileDown className="w-3 h-3"/> Statement
                  </button>
               </div>
               <div className="flex justify-between items-center mb-3 mt-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Remaining Due</p>
                  <p className={`text-sm font-black ${totalDue > 0 ? 'text-red-400' : 'text-emerald-400'}`}>NRs. {totalDue.toLocaleString()}</p>
               </div>
               
               <div className="w-full bg-black/40 rounded-full h-2 mb-1 border border-white/5 overflow-hidden">
                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${progressPercentage}%` }}></div>
               </div>
               <p className="text-[10px] text-white/60 font-bold tracking-wider text-right">{progressPercentage}% Paid (NRs. {totalPaid.toLocaleString()})</p>
            </div>
          </div>
        </div>
      </div>

      {/* TRANSPARENT LEDGER SUMMARY BOARD */}
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
         <h2 className="text-sm font-black uppercase tracking-widest text-gray-800 mb-6 flex items-center gap-2">
           <Receipt className="w-5 h-5 text-indigo-500" /> Transparent Fee Ledger Summary
         </h2>
         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
           <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
             <span className="text-gray-400 font-bold block text-[10px] uppercase tracking-widest mb-1">Gross Annual Fee</span>
             <span className="text-gray-800 font-black text-base">NRs. {annualTotal.toLocaleString()}</span>
           </div>
           <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
             <span className="text-gray-400 font-bold block text-[10px] uppercase tracking-widest mb-1">Scholarship Grant</span>
             <span className="text-emerald-600 font-black text-base">
               {studentRecord.scholarshipStatus === 'Provided' ? `NRs. ${(Number(studentRecord.scholarshipAmount || 0) * 12).toLocaleString()}` : 'None'}
             </span>
           </div>
           <div className="bg-[#1e293b] p-4 rounded-2xl text-white">
             <span className="text-gray-400 font-bold block text-[10px] uppercase tracking-widest mb-1">Total Paid (Collected)</span>
             <span className="text-emerald-400 font-black text-base">NRs. {totalPaid.toLocaleString()}</span>
           </div>
           <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
             <span className="text-red-400 font-bold block text-[10px] uppercase tracking-widest mb-1">Outstanding Balance</span>
             <span className="text-red-600 font-black text-base">NRs. {totalDue.toLocaleString()}</span>
           </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Content Col */}
        <div className="lg:col-span-12 space-y-6">
           
          {/* 12-MONTH PERSONAL LEDGER SYSTEM */}
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
             <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                   <h3 className="text-lg font-black text-gray-900 tracking-tight">Personal Academic Ledger (12-Month Breakdown)</h3>
                   <p className="text-xs text-gray-500 font-semibold mt-1">
                      Official monthly bills generated by administrative office combined with upcoming pre-billing projections.
                   </p>
                </div>
                <div className="flex items-center gap-3">
                   <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span> PAID
                   </span>
                   <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded-lg">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span> DUE
                   </span>
                   <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span> PROJECTED
                   </span>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {detailedLedger.map((monthData: any) => {
                   const { month, isBilled, isFullyPaid, totalBilled, totalPaid, totalDue, items, ledgerPageNo } = monthData;
                   
                   return (
                      <div key={month} className={`rounded-2xl border p-5 transition-all hover:shadow-md flex flex-col justify-between ${
                         isBilled ? (isFullyPaid ? 'bg-emerald-50/20 border-emerald-100 hover:border-emerald-200' : 'bg-red-50/20 border-red-100 hover:border-red-200') : 'bg-amber-50/10 border-amber-100/50 hover:border-amber-200/50'
                      }`}>
                         <div>
                            {/* Card Header */}
                            <div className="flex items-center justify-between gap-2 border-b border-gray-100/80 pb-3 mb-3">
                               <div className="flex items-center gap-2">
                                  <span className="text-base font-black text-gray-950">{month}</span>
                                  {ledgerPageNo && (
                                     <span className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded" title={`Handwritten Ledger Ref: Page ${ledgerPageNo}`}>
                                        Ref: #{ledgerPageNo}
                                     </span>
                                  )}
                               </div>
                               <div>
                                  {isBilled ? (
                                     isFullyPaid ? (
                                        <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-lg">
                                           PAID ✓
                                        </span>
                                     ) : (
                                        <span className="text-[9px] font-black uppercase tracking-wider bg-red-100 text-red-800 px-2 py-0.5 rounded-lg">
                                           DUE: NRs. {totalDue}
                                        </span>
                                     )
                                  ) : (
                                     <span className="text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-lg" title="Upcoming month pre-billing projection">
                                        PROJECTED ⌛
                                     </span>
                                  )}
                               </div>
                            </div>

                            {/* Itemized Categories */}
                            <div className="space-y-1.5 my-3">
                               {items.map((item: any, idx: number) => (
                                  <div key={idx} className="flex justify-between items-center text-xs">
                                     <span className="text-gray-500 font-medium">{item.name}</span>
                                     <span className={`font-mono font-bold ${item.isCredit ? 'text-emerald-600' : 'text-gray-800'}`}>
                                        {item.isCredit ? '-' : ''}NRs. {Math.abs(item.amount).toLocaleString()}
                                     </span>
                                  </div>
                               ))}
                            </div>
                         </div>

                         {/* Card Footer Summary */}
                         <div className="pt-3 border-t border-gray-100/80 mt-2 flex items-center justify-between gap-4">
                            <div>
                               <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 font-sans">Month Summary</p>
                               <div className="flex items-baseline gap-2 mt-0.5">
                                  <span className="text-sm font-black text-gray-950">
                                     NRs. {totalBilled.toLocaleString()}
                                  </span>
                                  {totalPaid > 0 && (
                                     <span className="text-[10px] font-semibold text-emerald-600">
                                        (Paid {totalPaid.toLocaleString()})
                                     </span>
                                  )}
                               </div>
                            </div>
                            <button 
                               onClick={() => printMonthDetail(monthData)}
                               className="text-gray-500 hover:text-indigo-600 bg-white hover:bg-indigo-50/50 p-2 rounded-xl border border-gray-100 transition-all active:scale-95 flex items-center justify-center" 
                               title="Print Statement Invoice"
                            >
                               <FileText className="w-4 h-4" />
                            </button>
                         </div>
                      </div>
                   );
                })}
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             {/* Fee Breakdown */}
             <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-4">Annual Fee Breakdown</h3>
                <div className="space-y-3.5">
                   <div className="flex justify-between text-xs py-1.5 border-b border-gray-100">
                      <span className="font-bold text-gray-600">Admission Fee (Class approved)</span>
                      <span className="font-black text-gray-900">NRs. {breakdownData.admissionFee.toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between text-xs py-1.5 border-b border-gray-100">
                      <span className="font-bold text-gray-600">Annual Registration Fee</span>
                      <span className="font-black text-gray-900">NRs. {breakdownData.annualFee.toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between text-xs py-1.5 border-b border-gray-100">
                      <span className="font-bold text-gray-600">Terminal Exam Fee (3 Terms)</span>
                      <span className="font-black text-gray-900">NRs. {breakdownData.examFee.toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between text-xs py-1.5 border-b border-gray-100">
                      <span className="font-bold text-gray-600">Monthly Tuition Fee (Annualized: 12 months)</span>
                      <span className="font-black text-gray-900">NRs. {breakdownData.tuitionFeeAnnual.toLocaleString()}</span>
                   </div>
                   {breakdownData.hasComputer && (
                      <div className="flex justify-between text-xs py-1.5 border-b border-gray-100">
                         <span className="font-bold text-gray-600">Computer Facility Fee (Annualized)</span>
                         <span className="font-black text-emerald-600">NRs. {breakdownData.computerFeeAnnual.toLocaleString()}</span>
                      </div>
                   )}
                   {breakdownData.hasTransport && (
                      <div className="flex justify-between text-xs py-1.5 border-b border-gray-100">
                         <span className="font-bold text-gray-600">Transportation Charges (Annualized)</span>
                         <span className="font-black text-emerald-600">NRs. {breakdownData.transportFeeAnnual.toLocaleString()}</span>
                      </div>
                   )}
                   {breakdownData.scholarshipAnnual > 0 && (
                      <div className="flex justify-between text-xs py-1.5 border-b border-gray-100">
                         <span className="font-bold text-emerald-700">Scholarship Deduction (Annualized)</span>
                         <span className="font-black text-emerald-600">-NRs. {breakdownData.scholarshipAnnual.toLocaleString()}</span>
                      </div>
                   )}
                   <div className="flex justify-between items-center py-3 text-primary rounded-xl px-4 mt-2 bg-indigo-50/50 border border-indigo-100">
                      <span className="text-xs font-black text-indigo-950 uppercase tracking-widest">Gross Annual Total</span>
                      <span className="text-lg font-black text-indigo-950">NRs. {annualTotal.toLocaleString()}</span>
                   </div>
                </div>
             </div>

             {/* Class Approved Rates */}
             <div className="bg-gradient-to-br from-indigo-50 to-blue-50/50 rounded-3xl p-6 border border-indigo-100 shadow-sm">
                <h3 className="text-sm font-black text-indigo-950 uppercase tracking-widest mb-4 flex items-center gap-2">
                   🏫 Class {studentRecord.class} Approved Rates
                </h3>
                <div className="space-y-3.5">
                   <div className="flex justify-between text-xs py-1.5 border-b border-indigo-100/40 text-indigo-900 font-bold">
                      <span>Monthly Tuition Fee</span>
                      <span>NRs. {Number(feeStructure?.tuition || 0).toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between text-xs py-1.5 border-b border-indigo-100/40 text-indigo-900 font-bold">
                      <span>Admission Fee</span>
                      <span>NRs. {Number(feeStructure?.admission || 0).toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between text-xs py-1.5 border-b border-indigo-100/40 text-indigo-900 font-bold">
                      <span>Annual Registration Fee</span>
                      <span>NRs. {Number(feeStructure?.annual || 0).toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between text-xs py-1.5 border-b border-indigo-100/40 text-indigo-900 font-bold">
                      <span>Terminal Exam Fee</span>
                      <span>NRs. {Number(feeStructure?.exam || 0).toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between text-xs py-1.5 border-b border-indigo-100/40 text-indigo-900 font-bold">
                      <span>Computer Fee</span>
                      <span>NRs. {Number(feeStructure?.computer || 0).toLocaleString()}</span>
                   </div>
                </div>
                <p className="text-[10px] text-indigo-700/70 font-semibold mt-4 italic">
                  *These rates are officially approved by the Karjanhana Municipality Board.
                </p>
             </div>

             {/* Receipts Grid */}
             <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <History className="w-5 h-5 text-blue-600" />
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">My Payment Receipts</h3>
                </div>

                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {paymentHistory.map(txn => (
                    <div key={txn.id} className="border-primary text-primary border border-gray-100 rounded-xl p-4 flex flex-wrap gap-2 justify-between items-center hover:border-blue-200 transition-colors">
                       <div>
                          <p className="text-xs font-black text-gray-900">{txn.receipt || txn.id.substring(0, 8)}</p>
                          <p className="text-[10px] font-bold text-gray-500 uppercase mt-0.5">{txn.date} • {txn.method}</p>
                       </div>
                       <div className="text-right flex items-center gap-4">
                          <p className="text-sm font-black text-emerald-600">NRs. {txn.amount.toLocaleString()}</p>
                          <button onClick={() => setReceipt(txn)} className="text-blue-600 hover:text-blue-800 bg-blue-50 p-2 rounded-lg" title="Download Receipt Voucher">
                             <FileDown className="w-4 h-4" />
                          </button>
                       </div>
                    </div>
                  ))}
                  {paymentHistory.length === 0 && (
                    <div className="p-8 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">
                        No transactions recorded
                    </div>
                  )}
                </div>
             </div>
          </div>
          
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-2xl md:hidden z-50">
         <a 
            href={`https://wa.me/9779807790805?text=${encodeURIComponent(`Namaste, Ma ${studentRecord.name} hu, Class ${studentRecord.class}, Mero fee barema kura garna chahanchhu.`)}`}
            target="_blank" rel="noopener noreferrer"
            className="w-full bg-primary text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
            📞 Contact Fee Office — +977 9807790805
         </a>
      </div>

      {receipt && (
         <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[90vh]">
              <div className="flex-1 overflow-auto bg-gray-100 p-4 sm:p-8 custom-scrollbar">
                 <div ref={receiptRef} className="bg-white mx-auto shadow-md relative overflow-hidden" style={{ width: '600px', minHeight: '848px' }}>
                    <div className="p-8 sm:p-10 text-gray-800">
                        <div className="text-center mb-6 border-b border-gray-200 pb-6">
                            <div className="mx-auto mb-3 flex items-center justify-center">
                                <img src={logoImage} alt="Shikshantar Academy Logo" className="w-16 h-16 object-contain" />
                            </div>
                            <h2 className="font-black text-xl text-primary uppercase tracking-widest">Shikshantar Academy</h2>
                            <p className="text-[10px] font-bold text-gray-500 uppercase flex items-center justify-center gap-1 mt-1">Karjanhana Municipality, Bastipur-5, Siraha, Nepal</p>
                            <div className="mt-4 inline-block bg-emerald-50 text-emerald-700 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border border-emerald-200">
                                Payment Receipt
                            </div>
                        </div>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm text-primary p-4 rounded-xl">
                    <div>
                      <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Receipt No</span>
                      <span className="text-gray-800 font-mono font-black">{receipt.receipt || receipt.id.substring(0, 8)}</span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Date</span>
                      <span className="text-gray-800 font-bold">{receipt.date}</span>
                    </div>
                  </div>

                  <div className="p-4 border border-gray-100 rounded-xl">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-500 font-bold">Student Name</span>
                      <span className="text-gray-800 font-black">{receipt.studentName}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-500 font-bold">Class | ID</span>
                      <span className="text-gray-800 font-bold text-right">{receipt.class}</span>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
                     {(() => {
                       const linkedBill = studentRecord?.remitBills?.find((b: any) => b.id === receipt.remitBillId || b.transactionId === receipt.receipt);
                       if (linkedBill && linkedBill.itemizedCharges?.length > 0) {
                         return linkedBill.itemizedCharges.map((charge: any, idx: number) => (
                           <div key={idx} className="flex justify-between text-sm py-1 border-b border-blue-100 last:border-0 last:pb-0">
                             <span className="text-blue-800 font-bold">
                               {charge.name} {charge.months > 1 ? `(${charge.months} months)` : ''}
                             </span>
                             <span className="text-blue-900 font-black">
                               NRs. {charge.total.toLocaleString()}
                             </span>
                           </div>
                         ));
                       }

                       // Fallback standard receipt breakdown
                       return (
                         <>
                           {receipt.months?.length > 0 && receipt.months.map((m: string) => {
                             const netPerMonth = (receipt.amount - (receipt.otherFees?.reduce((a: number, c: any) => a + Number(c.amount), 0) || 0)) / receipt.months.length;
                             return (
                               <div key={m} className="space-y-1 pb-3 mb-3 border-b border-blue-100 last:border-0 last:pb-0 last:mb-0">
                                 <div className="flex justify-between text-sm">
                                   <span className="text-blue-800 font-bold">{m} Tuition Fee</span>
                                   <span className="text-blue-900 font-black">NRs. {netPerMonth.toLocaleString()}</span>
                                 </div>
                               </div>
                             );
                           })}
                           {receipt.otherFees?.length > 0 && receipt.otherFees.map((f: any, idx: number) => (
                             <div key={idx} className="space-y-1 pb-3 mb-3 border-b border-blue-100 last:border-0 last:pb-0 last:mb-0">
                               <div className="flex justify-between text-sm">
                                 <span className="text-blue-800 font-bold">{f.name}</span>
                                 <span className="text-blue-900 font-black">NRs. {Number(f.amount).toLocaleString()}</span>
                               </div>
                             </div>
                           ))}
                           {(receipt.months?.length === 0 && receipt.otherFees?.length === 0) && (
                             <div className="flex justify-between text-sm">
                               <span className="text-blue-800 font-bold">{receipt.remarks || 'Tuition Payment'}</span>
                               <span className="text-blue-900 font-black">NRs. {(receipt.amount || 0).toLocaleString()}</span>
                             </div>
                           )}
                         </>
                       );
                     })()}
                  </div>

                  <div className="mt-6 border-t border-b border-gray-200 py-4 divide-y divide-gray-100">
                    <div className="flex justify-between items-center pb-3">
                      <span className="font-black text-gray-400 uppercase tracking-widest text-xs">Total Paid</span>
                      <span className="text-2xl font-black text-gray-800">NRs. {(receipt.amount || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center pt-3 mt-1 text-sm">
                      <span className="font-bold text-gray-500">Method: <span className="text-gray-800">{receipt.method}</span></span>
                    </div>
                  </div>
                  
                  <div className="mt-8 flex justify-between items-end text-xs pt-8 border-t border-gray-100">
                    <div>
                      <span className="text-gray-400 font-bold block mb-1">Collected by: </span>
                      <span className="text-gray-800 font-black">{receipt.collectedBy}</span>
                    </div>
                    <div className="border-t-2 border-gray-800 w-32 text-center pt-2 font-bold text-gray-800">
                       
                    </div>
                  </div>
                </div>
              </div>
              </div>
              </div>

              <div className="p-4 bg-white border-t border-gray-200 space-y-3">
                <div className="flex gap-2">
                   <button onClick={() => setReceipt(null)} className="flex-1 py-3 border border-gray-200 rounded-xl font-black text-gray-600 uppercase tracking-widest text-[10px] sm:text-xs transition-colors hover:bg-gray-100">Close</button>
                   <button onClick={() => {
                     const printContent = receiptRef.current?.innerHTML;
                     if (printContent) {
                       const printWindow = window.open('', '_blank');
                       if (printWindow) {
                         printWindow.document.write(`
                           <html>
                             <head>
                               <title>Receipt_${receipt.receipt || receipt.id.substring(0,8)}</title>
                               <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
                               <style>
                                 @media print {
                                   body { padding: 20px; background: white; color: black; }
                                   .no-print { display: none; }
                                 }
                               </style>
                             </head>
                             <body onload="window.print(); window.close();">
                               <div style="width: 600px; margin: 0 auto; border: 2px dashed #000; padding: 20px; font-family: sans-serif;">
                                 ${printContent}
                               </div>
                             </body>
                           </html>
                         `);
                         printWindow.document.close();
                       }
                     }
                   }} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase tracking-widest text-[10px] sm:text-xs shadow-lg flex justify-center items-center gap-2 transition-colors">🖨️ Print Receipt</button>
                   <button onClick={downloadReceipt} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase tracking-widest text-[10px] sm:text-xs shadow-lg flex justify-center items-center gap-2 transition-colors"><FileDown className="w-4 h-4"/> Download PDF</button>
                </div>
              </div>
           </div>
         </div>
      )}

    </div>
  );
}
