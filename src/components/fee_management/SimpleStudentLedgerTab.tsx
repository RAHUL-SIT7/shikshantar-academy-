import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db, auth, handleFirestoreError, OperationType } from '../../firebase';
import { collection, doc, writeBatch, serverTimestamp, query, where, getDocs, setDoc } from 'firebase/firestore';
import { Search, Loader2, Download, Printer, Plus, X, Receipt, Zap, BookOpen, Banknote, Bell, FileText, Table } from 'lucide-react';
import { formatBSDate, getBSYearMonthDate } from '../../lib/nepaliDate';

const MONTHS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];

const normalizeMonth = (m: string): string => {
    if (!m) return '';
    const clean = m.trim().toLowerCase();
    
    if (clean.includes('baisak') || clean.includes('baishak') || clean.includes('baishakh')) return 'Baisakh';
    if (clean.includes('jest') || clean.includes('jeth')) return 'Jestha';
    if (clean.includes('asar') || clean.includes('ashad') || clean.includes('asadh')) return 'Asar';
    if (clean.includes('shrawan') || clean.includes('sawan') || clean.includes('shravan')) return 'Shrawan';
    if (clean.includes('bhadra') || clean.includes('bhadau')) return 'Bhadra';
    if (clean.includes('ashwin') || clean.includes('ashoj') || clean.includes('asoj')) return 'Ashwin';
    if (clean.includes('kartik') || clean.includes('kartick')) return 'Kartik';
    if (clean.includes('mangsir') || clean.includes('marg') || clean.includes('mangsari')) return 'Mangsir';
    if (clean.includes('poush') || clean.includes('pus') || clean.includes('paush')) return 'Poush';
    if (clean.includes('magh') || clean.includes('mag')) return 'Magh';
    if (clean.includes('falgun') || clean.includes('fagun')) return 'Falgun';
    if (clean.includes('chaitra') || clean.includes('chait')) return 'Chaitra';
    
    return m.charAt(0).toUpperCase() + m.slice(1);
};

function getMonthsCovered(billingPeriod: string): string[] {
  if (!billingPeriod) return [];
  const MONTHS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
  const foundMonths: { month: string; index: number }[] = [];
  MONTHS.forEach(m => {
    const idx = billingPeriod.indexOf(m);
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
    const startIdx = MONTHS.indexOf(startM);
    const endIdx = MONTHS.indexOf(endM);
    if (startIdx !== -1 && endIdx !== -1) {
      if (startIdx <= endIdx) {
        return MONTHS.slice(startIdx, endIdx + 1);
      } else {
        return [...MONTHS.slice(startIdx), ...MONTHS.slice(0, endIdx + 1)];
      }
    }
  }
  const covered: string[] = [];
  MONTHS.forEach(m => {
    if (billingPeriod.includes(m)) {
      covered.push(m);
    }
  });
  return covered;
}

export default function SimpleStudentLedgerTab({ 
    students, 
    transactions, 
    onRefresh,
    prefillPayment,
    onPrefillClear
}: { 
    students: any[]; 
    transactions?: any[]; 
    onRefresh: () => void;
    prefillPayment?: any;
    onPrefillClear?: () => void;
}) {
    const [viewMode, setViewMode] = useState<'quick'|'advanced'|'cash'>('quick');
    const [selectedClass, setSelectedClass] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Payment Modal State
    const paymentFormRef = useRef<HTMLDivElement>(null);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
    const [paymentCategory, setPaymentCategory] = useState<'full_due' | '1_month' | '3_months' | '6_months' | 'full_year' | 'custom'>('full_due');
    const [selectedMonth, setSelectedMonth] = useState<string>(MONTHS[getBSYearMonthDate().month] || MONTHS[0]);
    const [cashReceived, setCashReceived] = useState<string>('');
    const [additionalCharge, setAdditionalCharge] = useState<string>('');
    const [discount, setDiscount] = useState<string>('');
    const [remarks, setRemarks] = useState<string>('');
    const [handwrittenLedgerNo, setHandwrittenLedgerNo] = useState<string>('');
    const [isHandwrittenMode, setIsHandwrittenMode] = useState(false);
    const [handwrittenReceiptSerial, setHandwrittenReceiptSerial] = useState('');
    const [handwrittenSignVerified, setHandwrittenSignVerified] = useState(false);
    const [customBaseAmount, setCustomBaseAmount] = useState<string>('0');

    // Dynamic Extra Payments & Receipt Customization States
    const [receiptTitle, setReceiptTitle] = useState<string>('Cash Receipt');
    const [additionalChargesList, setAdditionalChargesList] = useState<Array<{ id: string, purpose: string, amount: string }>>([]);
    const [discountsList, setDiscountsList] = useState<Array<{ id: string, purpose: string, amount: string }>>([]);
    const [handwrittenRegisteredAmt, setHandwrittenRegisteredAmt] = useState<string>('');

    // Ledger override states
    const [editingLedgerRow, setEditingLedgerRow] = useState<any | null>(null);
    const [overrideStatus, setOverrideStatus] = useState<'paid' | 'due' | 'waived'>('paid');
    const [overridePaidAmount, setOverridePaidAmount] = useState<string>('');
    const [overrideDueAmount, setOverrideDueAmount] = useState<string>('');
    const [overrideLedgerPageNo, setOverrideLedgerPageNo] = useState<string>('');
    const [overrideReason, setOverrideReason] = useState<string>('');
    const [overrideSaving, setOverrideSaving] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [prefilledBillData, setPrefilledBillData] = useState<{ id: string; billId: string; amount: number; billingPeriod?: string; itemizedCharges?: any[] } | null>(null);

    const todayBS = formatBSDate(new Date());
    const todayCollections = (transactions || []).filter(tx => tx.date === todayBS && (tx.status === 'SUCCESS' || tx.status === 'OVERRIDE_SUCCESS'));
    const todayTotal = todayCollections.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    // Close modal on Escape key press
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && selectedStudent) {
                setSelectedStudent(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedStudent]);

    // Handle programmatic prefilled payment redirection from Remit Bill Generator tab
    useEffect(() => {
        if (prefillPayment && students.length > 0) {
            const student = students.find(s => s.id === prefillPayment.studentId || s.studentId === prefillPayment.studentId);
            if (student) {
                setSelectedStudent(student);
                setSelectedClass(student.class || '');
                setSearchTerm(student.fullName || student.name || '');
                setPaymentCategory('custom');
                setReceiptTitle(`Remit Bill Clear (${prefillPayment.billId})`);

                // Map itemized charges from remit bills into our editable additionalChargesList
                const prefCharges: any[] = [];
                const addedItemNames = new Set<string>();

                if (prefillPayment.itemizedCharges && prefillPayment.itemizedCharges.length > 0) {
                    prefillPayment.itemizedCharges.forEach((item: any, idx: number) => {
                        prefCharges.push({
                            id: `pref_${idx}_${Date.now()}_${Math.floor(performance.now()).toString(36)}`,
                            purpose: `${item.name}${item.months > 1 ? ` (${item.months} M)` : ''}`,
                            amount: String(item.total)
                        });
                        addedItemNames.add(item.name);
                    });
                } else {
                    prefCharges.push({
                        id: `pref_base_${Date.now()}`,
                        purpose: `Remit Bill ${prefillPayment.billId} Dues`,
                        amount: String(prefillPayment.amount)
                    });
                    addedItemNames.add(`Remit Bill ${prefillPayment.billId} Dues`);
                }

                // STRICTLY DO NOT AUTOMATICALLY APPEND EXTRA OUTSTANDING BACK DUES FROM THE LEDGER!
                // This keeps the total bill due matching exactly the generated remit bill.
                let addedBackDuesSum = 0;

                setAdditionalChargesList(prefCharges);

                // Preserve local prefill metadata reference so we can update remitBills on save
                setPrefilledBillData({
                    id: prefillPayment.id,
                    billId: prefillPayment.billId,
                    amount: Number(prefillPayment.amount),
                    billingPeriod: prefillPayment.billingPeriod,
                    itemizedCharges: prefillPayment.itemizedCharges
                });

                setDiscountsList([]); // Clear any stale discounts
                const finalTotalAmt = Number(prefillPayment.amount);
                setCashReceived(String(finalTotalAmt));
                setRemarks(`Clearance of Remit Bill ${prefillPayment.billId} (${prefillPayment.billingPeriod || 'Current'})`);
                setViewMode('quick');
                
                // Do not expand the student's ledger inline in the list row!
                setExpandedStudent(null);

                if (onPrefillClear) {
                    onPrefillClear();
                }
                
                setSuccessMessage(`Pre-loaded remittance payment info for ${student.fullName || student.name} (Total Amt: NRs. ${finalTotalAmt})! Click Save Collection below.`);
                setTimeout(() => {
                    setSuccessMessage('');
                }, 8000);

                // Scroll the payment form modal/panel smoothly into direct view
                setTimeout(() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    paymentFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 150);
            }
        }
    }, [prefillPayment, students, onPrefillClear]);

    // We don't need getMaxMonths / getAutoMonths / toggleMonth anymore, but we can remove them later.

    const getRealisticLedgerRows = (s: any) => {
        const baseFee = Number(s?.monthlyFee || 0);
        const feesList = s?.fees || [];
        const currentMonthIdx = getBSYearMonthDate().month;

        // Map to keep track of consolidated rows by standard month and type
        const consolidatedMap: Record<string, any> = {};

        // 1. Process explicit records
        feesList.forEach((f: any) => {
            if (!f || (f.status !== 'paid' && f.status !== 'due' && f.status !== 'waived')) return;

            const normM = normalizeMonth(f.month);
            const feeType = f.type || 'Tuition Fee';
            const key = `${normM}_${feeType}`;

            const paidAmt = isNaN(Number(f.paidAmount)) ? (f.status === 'paid' ? Number(f.totalFee || 0) : 0) : Number(f.paidAmount);
            const totalFeeVal = isNaN(Number(f.totalFee)) ? (paidAmt + Number(f.dueAmount || 0)) : Number(f.totalFee);
            const rawDue = f.dueAmount !== undefined ? f.dueAmount : Math.max(0, totalFeeVal - paidAmt);
            const dueAmt = isNaN(Number(rawDue)) ? 0 : Number(rawDue);

            // Skip dummy/zero paid entries that clutter the ledger
            if (paidAmt === 0 && dueAmt === 0 && f.status !== 'waived' && (!f.receiptNo || f.receiptNo === '-' || f.receiptNo === '*Auto-Calculated*')) {
                return;
            }

            if (!consolidatedMap[key]) {
                consolidatedMap[key] = {
                    ...f,
                    month: normM,
                    type: feeType,
                    paidAmount: paidAmt,
                    dueAmount: dueAmt,
                    totalFee: isNaN(Number(f.totalFee)) ? (paidAmt + dueAmt) : Number(f.totalFee),
                    isImplicit: false
                };
            } else {
                // Merge duplicate explicit entries
                const existing = consolidatedMap[key];
                existing.paidAmount = (isNaN(Number(existing.paidAmount)) ? 0 : Number(existing.paidAmount)) + paidAmt;
                const existingTotalFee = isNaN(Number(existing.totalFee)) ? 0 : Number(existing.totalFee);
                const fTotalFee = isNaN(Number(f.totalFee)) ? 0 : Number(f.totalFee);
                existing.totalFee = Math.max(existingTotalFee, fTotalFee);
                existing.dueAmount = Math.max(0, existing.totalFee - existing.paidAmount);
                existing.status = existing.dueAmount <= 0 ? (f.status === 'waived' || existing.status === 'waived' ? 'waived' : 'paid') : 'due';
                if (f.receiptNo && f.receiptNo !== '*Auto-Calculated*') {
                    existing.receiptNo = existing.receiptNo === '*Auto-Calculated*' || existing.receiptNo === '-' ? f.receiptNo : `${existing.receiptNo}, ${f.receiptNo}`;
                }
                if (f.isManualOverride) {
                    existing.isManualOverride = true;
                    existing.overrideReason = f.overrideReason;
                }
            }
        });

        // Return sorted rows strictly from actual database records
        const rows = Object.values(consolidatedMap);
        return rows.sort((a: any, b: any) => {
            const aIdx = MONTHS.indexOf(a.month);
            const bIdx = MONTHS.indexOf(b.month);
            if (aIdx !== -1 && bIdx !== -1) {
                if (aIdx === bIdx) return 0;
                return aIdx - bIdx;
            }
            return 0;
        });
    };

    const getStudentDue = (s: any) => {
        if (!s) return 0;
        const rows = getRealisticLedgerRows(s);
        const total = rows.reduce((sum, row) => {
            if (row.status !== 'due') return sum;
            const amt = Number(row.dueAmount !== undefined ? row.dueAmount : (row.totalFee !== undefined ? row.totalFee : 0));
            return sum + (isNaN(amt) ? 0 : amt);
        }, 0);
        return isNaN(total) ? 0 : total;
    };

    const getRecentReceipts = (s: any) => {
        const fees = s?.fees || [];
        const receipts: Record<string, { date: string, total: number, types: string[] }> = {};
        fees.forEach((f: any) => {
             if (f.receiptNo && f.receiptNo !== '*Auto-Calculated*' && f.status === 'paid') {
                 if (!receipts[f.receiptNo]) {
                     receipts[f.receiptNo] = { date: f.paidAt ? new Date(f.paidAt).toLocaleDateString() : 'Recent', total: 0, types: [] };
                 }
                 receipts[f.receiptNo].total += Number(f.paidAmount || 0);
                 if (!receipts[f.receiptNo].types.includes(f.type || 'Fee')) {
                     receipts[f.receiptNo].types.push(f.type || 'Fee');
                 }
             }
        });
        const arr = Object.entries(receipts).map(([no, data]) => ({ no, ...data }));
        arr.reverse(); // Simplified sort, Assuming natural chronological insertion or sequential receipt numbers
        return arr.slice(0, 3);
    };
    
    // Deduplicate students to prevent any repeating listings
    const uniqueStudentsMap: Record<string, any> = {};
    students.forEach((s: any) => {
        if (!s || !s.id) return;
        const key = s.studentId || s.id;
        // Keep the record that has non-empty fees if possible, or just the first one
        if (!uniqueStudentsMap[key] || (Array.isArray(s.fees) && s.fees.length > (uniqueStudentsMap[key].fees?.length || 0))) {
            uniqueStudentsMap[key] = s;
        }
    });
    const uniqueStudents = Object.values(uniqueStudentsMap);
    
    // Filtered students
    const filteredStudents = uniqueStudents.filter(s => {
        const matchClass = selectedClass ? s.class === selectedClass : true;
        const matchSearch = searchTerm ? String(s.name).toLowerCase().includes(searchTerm.toLowerCase()) || String(s.rollNumber || '').includes(searchTerm) : true;
        return matchClass && matchSearch;
    }).sort((a, b) => Number(a.rollNumber || 0) - Number(b.rollNumber || 0));

    const handlePayClick = (student: any) => {
        setErrorMessage('');
        setSuccessMessage('');
        setSelectedStudent(student);
        const due = getStudentDue(student);
        const defaultMonthly = Number(student.monthlyFee || 1000);
        setCashReceived(due > 0 ? due.toString() : defaultMonthly.toString());
        setCustomBaseAmount(due > 0 ? due.toString() : defaultMonthly.toString());
        setPaymentCategory('full_due');
        setSelectedMonth(MONTHS[getBSYearMonthDate().month] || MONTHS[0]);
        setAdditionalCharge('');
        setDiscount('');
        setRemarks('');
        setHandwrittenLedgerNo('');
        setIsHandwrittenMode(false);
        setHandwrittenReceiptSerial('');
        setHandwrittenSignVerified(false);

        // Reset dynamic custom items
        setReceiptTitle('Cash Receipt');
        setAdditionalChargesList([]);
        setDiscountsList([]);
        setHandwrittenRegisteredAmt('');

        setTimeout(() => {
            paymentFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    };

    const getBaseAmount = () => {
        const defaultMonthly = Number(selectedStudent?.monthlyFee || 1000);
        const due = getStudentDue(selectedStudent);
        switch(paymentCategory) {
            case 'full_due': return due > 0 ? due : defaultMonthly;
            case '1_month': return defaultMonthly;
            case '3_months': return defaultMonthly * 3;
            case '6_months': return defaultMonthly * 6;
            case 'full_year': return defaultMonthly * 12;
            case 'custom': return Number(customBaseAmount || due || defaultMonthly || 0);
            default: return due > 0 ? due : defaultMonthly;
        }
    };
    const baseAmount = selectedStudent ? getBaseAmount() : 0;
    const totalPayable = baseAmount + Number(additionalCharge || 0) - Number(discount || 0);

    // Keep additionalCharge and discount synchronized with dynamic lists
    useEffect(() => {
        const sumAdd = additionalChargesList.reduce((acc, item) => acc + Number(item.amount || 0), 0);
        setAdditionalCharge(sumAdd.toString());
    }, [additionalChargesList]);

    useEffect(() => {
        const sumDisc = discountsList.reduce((acc, item) => acc + Number(item.amount || 0), 0);
        setDiscount(sumDisc.toString());
    }, [discountsList]);

    // Auto-fill cash received when dues, charges or total payable change
    useEffect(() => {
        if (selectedStudent) {
            setCashReceived(totalPayable.toString());
        }
    }, [paymentCategory, additionalCharge, discount, selectedStudent, totalPayable]);

    const printReceipt = (student: any, receiptNo: string, date: string, total: number, breakdown: any, ledgerPageNo: string) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const baseAmount = Number(breakdown.tuition || 0);
        const additionalCharge = Number(breakdown.additionalCharge || 0);
        const discount = Number(breakdown.discount || 0);
        const totalPayable = baseAmount + additionalCharge - discount;
        const cashPaid = Number(total || 0);
        const changeToReturn = Math.max(0, cashPaid - totalPayable);
        const balanceDue = Math.max(0, totalPayable - cashPaid);

        const customReceiptTitle = breakdown.receiptTitle || 'Cash Receipt';

        // Prepare additional charges rows
        let additionalRows = '';
        if (breakdown.additionalChargesList && breakdown.additionalChargesList.length > 0) {
            breakdown.additionalChargesList.forEach((item: any) => {
                const amt = Number(item.amount || 0);
                if (amt > 0) {
                    additionalRows += `
                        <tr>
                            <td>
                                <strong>${item.purpose || 'Other'}</strong>
                            </td>
                            <td class="text-right font-mono">NRs. ${amt.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        </tr>
                    `;
                }
            });
        } else if (additionalCharge > 0) {
            additionalRows = `
                <tr>
                    <td>
                        <strong>Additional Charges</strong>
                    </td>
                    <td class="text-right font-mono">NRs. ${additionalCharge.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                </tr>
            `;
        }

        // Prepare discounts rows
        let discountRows = '';
        if (breakdown.discountsList && breakdown.discountsList.length > 0) {
            breakdown.discountsList.forEach((item: any) => {
                const amt = Number(item.amount || 0);
                if (amt > 0) {
                    discountRows += `
                        <tr>
                            <td>
                                <strong>${item.purpose || 'Scholarship'}</strong>
                            </td>
                            <td class="text-right font-mono" style="color: #b91c1c;">- NRs. ${amt.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        </tr>
                    `;
                }
            });
        } else if (discount > 0) {
            discountRows = `
                <tr>
                    <td>
                        <strong>Scholarship / Discount Applied</strong>
                    </td>
                    <td class="text-right font-mono" style="color: #b91c1c;">- NRs. ${discount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                </tr>
            `;
        }

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Receipt - ${receiptNo}</title>
                <style>
                    @media print {
                        @page {
                            size: auto;
                            margin: 0.25in 0.35in;
                        }
                        body {
                            padding: 0 !important;
                            margin: 0 !important;
                            background-color: #fff;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                        .receipt-container {
                            border: none !important;
                            box-shadow: none !important;
                            padding: 5px !important;
                            margin: 0 !important;
                            max-width: 100% !important;
                        }
                    }
                    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.4; padding: 15px; background-color: #fff; }
                    .receipt-container { max-width: 650px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 22px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); position: relative; overflow: hidden; }
                    .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 300px; height: 300px; background-image: url('/logo.png'); background-size: contain; background-repeat: no-repeat; background-position: center; opacity: 0.05; pointer-events: none; z-index: 0; }
                    .header, .receipt-title-bar, .info-grid, table, .summary-box, .notes-box, .footer { position: relative; z-index: 10; }
                    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #10b981; padding-bottom: 8px; margin-bottom: 12px; }
                    .header-left { display: flex; align-items: center; gap: 12px; }
                    .school-logo { width: 60px; height: 60px; object-fit: contain; }
                    .school-name { font-size: 19px; font-weight: 800; margin: 0; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.5px; }
                    .school-info { font-size: 10px; color: #4b5563; margin: 2px 0 0; }
                    .receipt-badge { background-color: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 1px; }
                    .receipt-title-bar { text-align: center; margin: 8px 0; }
                    .receipt-title { font-size: 15px; font-weight: 800; color: #111827; text-transform: uppercase; letter-spacing: 1.2px; display: inline-block; border-bottom: 3px solid #10b981; padding-bottom: 2px; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; margin-bottom: 12px; font-size: 12px; color: #374151; background-color: #f9fafb; padding: 10px; border-radius: 8px; border: 1px solid #f3f4f6; }
                    .info-item span { font-weight: 600; color: #6b7280; text-transform: uppercase; font-size: 9px; display: block; margin-bottom: 1px; }
                    .info-item strong { font-size: 12px; color: #111827; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 12px; }
                    th { background-color: #f3f4f6; font-weight: 700; text-transform: uppercase; font-size: 9px; color: #4b5563; padding: 6px 10px; text-align: left; border-bottom: 2px solid #e5e7eb; }
                    td { padding: 6px 10px; border-bottom: 1px solid #f3f4f6; color: #1f2937; }
                    .text-right { text-align: right; }
                    .font-mono { font-family: monospace; }
                    .summary-box { margin-top: 10px; border-top: 1px dashed #d1d5db; padding-top: 8px; }
                    .summary-row { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; }
                    .summary-row.grand-total { font-size: 13px; font-weight: 700; color: #111827; margin-top: 2px; }
                    .summary-row.net-payable { font-size: 14px; font-weight: 800; color: #15803d; background-color: #f0fdf4; padding: 6px; border-radius: 6px; border: 1px solid #bbf7d0; margin-top: 4px; }
                    .summary-row.balance-due { font-weight: 800; color: #b91c1c; background-color: #fef2f2; padding: 4px; border-radius: 6px; border: 1px solid #fecaca; margin-top: 4px; }
                    .notes-box { margin-top: 12px; padding: 8px 12px; background-color: #fcfcfc; border: 1px dashed #e5e7eb; border-radius: 6px; font-size: 10px; color: #6b7280; }
                    .footer { margin-top: 25px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; }
                    .signature-area { text-align: center; width: 150px; }
                    .signature-line { border-top: 1px solid #9ca3af; margin-bottom: 4px; width: 100%; }
                    .signature-title { color: #4b5563; font-weight: 600; font-size: 10px; }
                </style>
            </head>
            <body onload="window.print();">
                <div class="receipt-container">
                    <div class="watermark"></div>
                    <!-- Header -->
                    <div class="header">
                        <div class="header-left">
                            <img class="school-logo" src="/logo.png" onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=S+A&background=10b981&color=fff&size=100&bold=true';" alt="School Logo" />
                            <div>
                                <h1 class="school-name">SHIKSHANTAR ACADEMY</h1>
                                <p class="school-info">Karjanhana Municipality, Bastipur-5, Siraha, Nepal</p>
                                <p class="school-info">Phone: +977 9709867048, +977 9807790805 | Email: academyshikshantar@gmail.com</p>
                            </div>
                        </div>
                        <div>
                            <span class="receipt-badge">OFFICIAL</span>
                        </div>
                    </div>

                    <div class="receipt-title-bar">
                        <div class="receipt-title">${customReceiptTitle}</div>
                    </div>

                    <!-- Student & Bill Info -->
                    <div class="info-grid">
                        <div class="info-item">
                            <span>Receipt / Bill No</span>
                            <strong class="font-mono" style="color: #1e3a8a;">${receiptNo}</strong>
                        </div>
                        <div class="info-item" style="text-align: right;">
                            <span>Date (B.S.)</span>
                            <strong>${date}</strong>
                        </div>
                        <div class="info-item">
                            <span>Student Name / Roll</span>
                            <strong>${student.name} (Roll: ${student.rollNumber || '-'})</strong>
                        </div>
                        <div class="info-item" style="text-align: right;">
                            <span>Class</span>
                            <strong>Class ${student.class}</strong>
                        </div>
                        <div class="info-item">
                            <span>Payment Mode</span>
                            <strong>${breakdown.mode || 'Direct Cash'}</strong>
                        </div>
                        <div class="info-item" style="text-align: right;">
                            <span>Monthly Tuition Fee</span>
                            <strong>NRs. ${(Number(student.monthlyFee || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}</strong>
                        </div>
                    </div>

                    ${breakdown.isHandwrittenMode ? `
                    <div style="background-color: #fffbeb; border: 1px dashed #d97706; padding: 8px 12px; border-radius: 8px; font-size: 11px; color: #b45309; margin-bottom: 12px;">
                        <strong style="display: block; font-size: 10px; margin-bottom: 4px;">📄 PHYSICALLY LOGGED IN HANDWRITTEN REGISTER</strong>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                            <div>
                                <span style="display: block; font-size: 8px; font-weight: bold; color: #d97706; text-transform: uppercase;">Register Book & Page</span>
                                <strong style="color: #111827;">${ledgerPageNo || 'N/A'}</strong>
                            </div>
                            <div>
                                <span style="display: block; font-size: 8px; font-weight: bold; color: #d97706; text-transform: uppercase;">Registered Amount</span>
                                <strong style="color: #111827;">NRs. ${(Number(breakdown.handwrittenRegisteredAmt || total)).toLocaleString(undefined, {minimumFractionDigits: 2})}</strong>
                            </div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; border-top: 1px dashed #fbd38d; padding-top: 4px;">
                            <div>
                                <span style="display: block; font-size: 8px; font-weight: bold; color: #d97706; text-transform: uppercase;">Slip Serial</span>
                                <strong style="color: #111827;">${breakdown.handwrittenReceiptSerial || 'N/A'}</strong>
                            </div>
                            <div style="text-align: right;">
                                <span style="font-size: 9px; font-weight: bold; color: #16a34a;">
                                    ${breakdown.handwrittenSignVerified ? '✓ Physical Signature Verified' : '✓ Unsigned Physical Record'}
                                </span>
                            </div>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Detailed Description Table -->
                    <table>
                        <thead>
                            <tr>
                                <th>Line Item Description</th>
                                <th class="text-right" style="width: 150px;">Amount (NRs.)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>
                                    <strong>Base Fee / Tuition dues</strong><br/>
                                    <span style="font-size: 11px; color: #6b7280;">Covering tuition duration: ${breakdown.mode || 'Selected duration'}</span>
                                </td>
                                <td class="text-right font-mono">NRs. ${baseAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                            </tr>
                            ${additionalRows}
                            ${discountRows}
                        </tbody>
                    </table>

                    <!-- Calculations & Totals -->
                    <div class="summary-box">
                        <div class="summary-row">
                            <span>Total Base / Monthly Fee:</span>
                            <span class="font-mono">NRs. ${baseAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                        ${additionalCharge > 0 ? `
                        <div class="summary-row">
                            <span>Additional Fee:</span>
                            <span class="font-mono">NRs. ${additionalCharge.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                        ` : ''}
                        <div class="summary-row grand-total">
                            <span>Total:</span>
                            <span class="font-mono">NRs. ${(baseAmount + additionalCharge).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                        ${discount > 0 ? `
                        <div class="summary-row" style="color: #b91c1c;">
                            <span>Discount:</span>
                            <span class="font-mono">- NRs. ${discount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                        ` : ''}
                        <div class="summary-row net-payable">
                            <span>Net Payable:</span>
                            <span class="font-mono font-black">NRs. ${totalPayable.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                        <div class="summary-row">
                            <span>Cash Paid:</span>
                            <span class="font-mono" style="font-weight: bold;">NRs. ${cashPaid.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                        ${changeToReturn > 0 ? `
                        <div class="summary-row" style="color: #2563eb;">
                            <span>Change Returned:</span>
                            <span class="font-mono">NRs. ${changeToReturn.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                        ` : ''}
                        <div class="summary-row balance-due" style="color: ${balanceDue > 0 ? '#b91c1c' : '#166534'}; background-color: ${balanceDue > 0 ? '#fef2f2' : '#f0fdf4'}; border-color: ${balanceDue > 0 ? '#fecaca' : '#bbf7d0'};">
                            <span>Balance Remaining:</span>
                            <span class="font-mono">NRs. ${balanceDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                    </div>

                    <!-- Remarks -->
                    ${breakdown.remarks ? `
                    <div class="notes-box">
                        <strong>Notes / Remarks:</strong> ${breakdown.remarks}
                    </div>
                    ` : ''}

                    <!-- Footer -->
                    <div class="footer">
                        <div>
                            <p style="margin: 0; font-size: 10px; color: #9ca3af; font-family: monospace;">SYSTEM GEN ID: ${receiptNo}</p>
                            <p style="margin: 2px 0 0; font-size: 10px; color: #9ca3af; font-family: monospace;">Thank you for your payment!</p>
                        </div>
                        <div class="signature-area">
                            <div class="signature-line"></div>
                            <div class="signature-title">Authorized Signature Area</div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 300);

        // Auto download the receipt HTML file as NRs. transaction copy
        try {
            const blob = new Blob([`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Receipt - ${receiptNo}</title>
                    <style>
                        body { font-family: sans-serif; padding: 40px; color: #333; line-height: 1.6; }
                        .container { max-width: 600px; margin: 0 auto; border: 1px solid #ccc; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
                        h1 { color: #059669; margin-bottom: 5px; }
                        .header-sub { color: #6b7280; font-size: 14px; margin-top: 0; margin-bottom: 20px; }
                        .flex-row { display: flex; justify-content: space-between; margin: 8px 0; }
                        hr { border: none; border-top: 1px solid #eee; margin: 15px 0; }
                        .badge { background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                             <div>
                                 <h1>Shikshantar Academy</h1>
                                 <p class="header-sub">Bastipur, Karjanha-05, Siraha, Nepal</p>
                             </div>
                             <div>
                                 <span class="badge">OFFICIAL RECEIPT</span>
                             </div>
                        </div>
                        <p><strong>Receipt Number:</strong> ${receiptNo}</p>
                        <p><strong>Date:</strong> ${date} (BS)</p>
                        <hr/>
                        <p><strong>Student Name:</strong> ${student.fullName || student.name} (Class ${student.class || 'N/A'})</p>
                        <p><strong>Payment Category:</strong> ${breakdown.mode}</p>
                        ${breakdown.remarks ? `<p><strong>Remarks:</strong> ${breakdown.remarks}</p>` : ''}
                        <hr/>
                        <div class="flex-row"><span>Base/Monthly Fee Total:</span><span>NRs. ${baseAmount.toLocaleString()}</span></div>
                        ${additionalCharge > 0 ? `<div class="flex-row"><span>Additional Charges:</span><span>NRs. ${additionalCharge.toLocaleString()}</span></div>` : ''}
                        ${discount > 0 ? `<div class="flex-row" style="color: #dc2626;"><span>Discount Concessions:</span><span>- NRs. ${discount.toLocaleString()}</span></div>` : ''}
                        <div class="flex-row" style="font-size: 18px; font-weight: bold;"><strong>Net Cash Paid:</strong><strong>NRs. ${cashPaid.toLocaleString()}</strong></div>
                        <div class="flex-row" style="color: ${balanceDue > 0 ? '#dc2626' : '#059669'}; font-weight: bold;"><span>Outstanding Balance:</span><span>NRs. ${balanceDue.toLocaleString()}</span></div>
                        <hr/>
                        <p style="font-size: 12px; color: #6b7280; text-align: center; margin-top: 25px;">Thank you for your payment!</p>
                    </div>
                </body>
                </html>
            `], { type: 'text/html' });
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `Receipt_${receiptNo}.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);
        } catch (downloadErr) {
            console.error("Auto download receipt failed:", downloadErr);
        }
    };

    const handleProcessPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage('');
        setSuccessMessage('');
        
        const totalDue = getStudentDue(selectedStudent);
        const cash = Number(cashReceived || 0);

        // If the cash received is more than the total payable, the excess is given back to the parent as "change".
        // The school only records what was actually owed, unless payment category is 'custom' where they explicitly want to pay an arbitrary amount.
        const amountPaidToSchool = (paymentCategory === 'custom') ? cash : Math.min(cash, totalPayable);

        if (!selectedStudent) {
            setErrorMessage(`Please select a student.`);
            return;
        }
        if (amountPaidToSchool <= 0 && Number(discount || 0) <= 0) {
            setErrorMessage("Payment amount or discount must be greater than 0");
            return;
        }
        setProcessing(true);

        try {
            const batch = writeBatch(db);
            const receiptNo = `RCP-${getBSYearMonthDate().year}-${Date.now().toString().slice(-4)}`;
            const bsDate = formatBSDate(new Date());

            // Pre-calculate which months are paid in this transaction
            const paidMonthsList: string[] = [];
            let waterfallRemainingForMonths = amountPaidToSchool + Number(discount || 0) - Number(additionalCharge || 0);
            const rowsForCalc = getRealisticLedgerRows(selectedStudent);
            const dueRowsForCalc = rowsForCalc.filter((r: any) => r.status === 'due');

            for (const row of dueRowsForCalc) {
                if (waterfallRemainingForMonths <= 0) break;
                const rowDue = Number(row.dueAmount !== undefined ? row.dueAmount : (row.totalFee || 0));
                if (rowDue <= 0) continue;
                
                const amountToApply = Math.min(rowDue, waterfallRemainingForMonths);
                waterfallRemainingForMonths -= amountToApply;
                
                if (!paidMonthsList.includes(row.month)) {
                    paidMonthsList.push(row.month);
                }
            }

            if (prefilledBillData && prefilledBillData.itemizedCharges) {
                prefilledBillData.itemizedCharges.forEach((item: any) => {
                    for (const m of MONTHS) {
                        if (item.name.toLowerCase().includes(m.toLowerCase())) {
                            if (!paidMonthsList.includes(m)) {
                                paidMonthsList.push(m);
                            }
                            break;
                        }
                    }
                });
            }

            const breakdown = {
                mode: paymentCategory === '1_month' ? `1 Month (${selectedMonth})` : (paymentCategory.replace('_', ' ') || 'Payment'),
                discount: Number(discount || 0),
                additionalCharge: Number(additionalCharge || 0),
                remarks: remarks,
                months: paidMonthsList,
                tuition: baseAmount,
                additional: [],
                isHandwrittenMode: isHandwrittenMode,
                handwrittenReceiptSerial: handwrittenReceiptSerial,
                handwrittenSignVerified: handwrittenSignVerified,
                receiptTitle: receiptTitle || 'Cash Receipt',
                additionalChargesList: additionalChargesList,
                discountsList: discountsList,
                handwrittenRegisteredAmt: handwrittenRegisteredAmt || cashReceived
            };

            const defaultRemarks = remarks || `Fee payment for ${paidMonthsList.length > 0 ? paidMonthsList.join(', ') : 'current month'} (${paymentCategory})`;

            // 1. Transaction
            const currentAuthUser = auth.currentUser;
            const operatorName = currentAuthUser?.email || currentAuthUser?.displayName || 'Admin Accountant';
            const operatorUid = currentAuthUser?.uid || 'system';

            const txRef = doc(collection(db, 'transactions'));
            batch.set(txRef, {
                date: bsDate,
                receipt: receiptNo,
                studentId: selectedStudent.id,
                studentName: selectedStudent.name,
                class: selectedStudent.class,
                amount: amountPaidToSchool,
                method: 'Cash',
                collectedBy: operatorName,
                createdBy: operatorName,
                creatorUid: operatorUid,
                status: 'SUCCESS',
                months: paidMonthsList,
                breakdown: breakdown,
                discount: Number(discount || 0),
                additionalCharge: Number(additionalCharge || 0),
                remarks: defaultRemarks,
                ledgerPageNo: handwrittenLedgerNo,
                isHandwrittenMode: isHandwrittenMode,
                handwrittenReceiptSerial: handwrittenReceiptSerial,
                handwrittenSignVerified: handwrittenSignVerified,
                timestamp: serverTimestamp()
            });

            // 2. Resolve Student Fees (Waterfall)
            let remainingCash = amountPaidToSchool + Number(discount || 0) - Number(additionalCharge || 0);
            const rows = getRealisticLedgerRows(selectedStudent);
            const dueRows = rows.filter((r: any) => r.status === 'due');

            for (const row of dueRows) {
                if (remainingCash <= 0) break;
                const rowDue = Number(row.dueAmount !== undefined ? row.dueAmount : (row.totalFee || 0));
                if (rowDue <= 0) continue;

                const amountToApply = Math.min(rowDue, remainingCash);
                remainingCash -= amountToApply;

                const feeIdStr = row.isImplicit 
                    ? `${selectedStudent.id}_${row.month.replace(/\s+/g,'')}_TuitionFee` 
                    : (row.id || `${selectedStudent.id}_${row.month.replace(/\s+/g,'')}_${(row.type || 'TuitionFee').replace(/\s+/g,'')}`);
                const feeRef = doc(db, 'studentFees', feeIdStr);
                
                batch.set(feeRef, {
                    studentId: selectedStudent.id,
                    month: row.month,
                    type: row.type || 'Tuition Fee',
                    totalFee: row.totalFee || rowDue,
                    paidAmount: (row.paidAmount || 0) + amountToApply,
                    dueAmount: rowDue - amountToApply,
                    status: (rowDue - amountToApply) <= 0 ? 'paid' : (((row.paidAmount || 0) + amountToApply) > 0 ? 'partial' : 'due'),
                    transactionId: txRef.id,
                    receiptNo: receiptNo,
                    ledgerPageNo: handwrittenLedgerNo,
                    isHandwrittenMode: isHandwrittenMode,
                    handwrittenReceiptSerial: handwrittenReceiptSerial,
                    handwrittenSignVerified: handwrittenSignVerified,
                    paidAt: new Date().toISOString()
                }, { merge: true });
            }

            // 3. Overpay/Advance if remaining cash > 0
            if (remainingCash > 0) {
                 const feeIdStr = `${selectedStudent.id}_advance_${Date.now()}`;
                 const feeRef = doc(db, 'studentFees', feeIdStr);
                 batch.set(feeRef, {
                    studentId: selectedStudent.id,
                    month: MONTHS[getBSYearMonthDate().month],
                    type: 'Advance Payment',
                    totalFee: 0,
                    paidAmount: remainingCash,
                    dueAmount: -remainingCash,
                    status: 'paid',
                    transactionId: txRef.id,
                    receiptNo: receiptNo,
                    ledgerPageNo: handwrittenLedgerNo,
                    isHandwrittenMode: isHandwrittenMode,
                    handwrittenReceiptSerial: handwrittenReceiptSerial,
                    handwrittenSignVerified: handwrittenSignVerified,
                    paidAt: new Date().toISOString()
                 }, { merge: true });
            }

            // 4. Mark associated Remit Bill as paid / partial & write its itemized charges to studentFees
            if (prefilledBillData && prefilledBillData.id) {
                const billRef = doc(db, 'remitBills', prefilledBillData.id);
                const isFullyPaid = amountPaidToSchool >= Number(prefilledBillData.totalAmount || 0);
                const currentPaid = Number(prefilledBillData.paidAmount || 0);
                batch.update(billRef, {
                    status: isFullyPaid ? 'paid' : 'partial',
                    paidAmount: currentPaid + amountPaidToSchool,
                    transactionId: txRef.id,
                    paidAt: bsDate
                });

                // Write each itemized charge from this prefilled bill to studentFees as PAID records in the database
                const coveredMonths = getMonthsCovered(prefilledBillData.billingPeriod || '');
                const startMonthName = coveredMonths[0] || MONTHS[getBSYearMonthDate().month] || 'Jestha';
                const startIdx = MONTHS.indexOf(startMonthName) !== -1 ? MONTHS.indexOf(startMonthName) : 1;

                if (prefilledBillData.itemizedCharges && prefilledBillData.itemizedCharges.length > 0) {
                    prefilledBillData.itemizedCharges.forEach((item: any) => {
                        if (item.name.includes('Arrears') || item.name.includes('Outstanding')) {
                            // Extract month if specified
                            let itemMonth = '';
                            for (const m of MONTHS) {
                                if (item.name.toLowerCase().includes(m.toLowerCase())) {
                                    itemMonth = m;
                                    break;
                                }
                            }
                            // Extract fee type
                            let itemType = '';
                            if (item.name.includes('Tuition Fee')) itemType = 'Tuition Fee';
                            else if (item.name.includes('Computer Fee')) itemType = 'Computer Fee';
                            else if (item.name.includes('Transportation Fee')) itemType = 'Transportation Fee';
                            else if (item.name.includes('Academy Fee')) itemType = 'Academy Fee';
                            else if (item.name.includes('Annual Fee')) itemType = 'Annual Fee';
                            else if (item.name.includes('Admission Fee')) itemType = 'Admission Fee';
                            else if (item.name.includes('Terminal Exam Fee')) itemType = 'Terminal Exam Fee';

                            if (itemMonth && itemType) {
                                const feeIdStr = `${selectedStudent.id}_${itemMonth.replace(/\s+/g,'')}_${itemType.replace(/\s+/g,'')}`;
                                const feeRef = doc(db, 'studentFees', feeIdStr);
                                batch.set(feeRef, {
                                    studentId: selectedStudent.id,
                                    month: itemMonth,
                                    type: itemType,
                                    paidAmount: item.total,
                                    dueAmount: 0,
                                    status: 'paid',
                                    transactionId: txRef.id,
                                    receiptNo: receiptNo,
                                    ledgerPageNo: handwrittenLedgerNo || 'RMT-LEDGER',
                                    isHandwrittenMode: isHandwrittenMode,
                                    handwrittenReceiptSerial: handwrittenReceiptSerial,
                                    handwrittenSignVerified: handwrittenSignVerified,
                                    paidAt: new Date().toISOString()
                                }, { merge: true });
                            } else {
                                // Fallback sequential waterfall for arrears
                                if (selectedStudent && Array.isArray(selectedStudent.fees)) {
                                    const dueRecords = selectedStudent.fees
                                        .filter((f: any) => f.status === 'due')
                                        .sort((a: any, b: any) => MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month));

                                    let remainingArrearsToSettle = item.total;
                                    dueRecords.forEach((f: any) => {
                                        if (remainingArrearsToSettle <= 0) return;
                                        const dueAmt = f.dueAmount !== undefined ? f.dueAmount : (f.totalFee || 0);
                                        const amountToPay = Math.min(dueAmt, remainingArrearsToSettle);
                                        remainingArrearsToSettle -= amountToPay;

                                        const feeId = `${selectedStudent.id}_${f.month.replace(/\s+/g,'')}_${f.type.replace(/\s+/g,'')}`;
                                        const feeRef = doc(db, 'studentFees', feeId);
                                        batch.set(feeRef, {
                                            paidAmount: (f.paidAmount || 0) + amountToPay,
                                            dueAmount: Math.max(0, dueAmt - amountToPay),
                                            status: (dueAmt - amountToPay) <= 0 ? 'paid' : 'due',
                                            transactionId: txRef.id,
                                            receiptNo: receiptNo,
                                            ledgerPageNo: handwrittenLedgerNo || 'RMT-LEDGER',
                                            isHandwrittenMode: isHandwrittenMode,
                                            handwrittenReceiptSerial: handwrittenReceiptSerial,
                                            handwrittenSignVerified: handwrittenSignVerified,
                                            paidAt: new Date().toISOString()
                                        }, { merge: true });
                                    });
                                }
                            }
                            return; // Skip the general monthly loop for arrears
                        }

                        let fType = 'Other Fee';
                        if (item.name.includes('Tuition')) fType = 'Tuition Fee';
                        else if (item.name.includes('Computer')) fType = 'Computer Fee';
                        else if (item.name.includes('Transport')) fType = 'Transportation Fee';
                        else if (item.name.includes('Academy') || item.name.includes('Sports')) fType = 'Academy Fee';
                        else fType = item.name;

                        const mult = item.months || 1;
                        for (let i = 0; i < mult; i++) {
                            const monthName = MONTHS[(startIdx + i) % 12];
                            const feeIdStr = `${selectedStudent.id}_${monthName.replace(/\s+/g,'')}_${fType.replace(/\s+/g,'')}`;
                            const feeRef = doc(db, 'studentFees', feeIdStr);

                            batch.set(feeRef, {
                                studentId: selectedStudent.id,
                                month: monthName,
                                type: fType,
                                totalFee: item.rate || (item.total / mult),
                                paidAmount: item.rate || (item.total / mult),
                                dueAmount: 0,
                                status: 'paid',
                                transactionId: txRef.id,
                                receiptNo: receiptNo,
                                ledgerPageNo: handwrittenLedgerNo || 'RMT-LEDGER',
                                isHandwrittenMode: isHandwrittenMode,
                                handwrittenReceiptSerial: handwrittenReceiptSerial,
                                handwrittenSignVerified: handwrittenSignVerified,
                                paidAt: new Date().toISOString()
                            }, { merge: true });
                        }
                    });
                }
            }

            // 5. Create Cash Ledger Income entry to update office accounts and daily registers
            const cashLedgerRef = doc(collection(db, 'cash_ledger'));
            batch.set(cashLedgerRef, {
                type: 'Income',
                date: bsDate,
                amount: amountPaidToSchool,
                category: 'Fee Collection',
                remarks: `Receipt ${receiptNo} for ${selectedStudent.fullName} (Class ${selectedStudent.class}) - ${remarks || `Fee payment (${paymentCategory})`}${prefilledBillData ? ` [Remit Bill Clear ${prefilledBillData.billId}]` : ''}`,
                timestamp: serverTimestamp()
            });

            await batch.commit();

            setSuccessMessage('Fee updated successfully in ledger and transaction history!');
            printReceipt(selectedStudent, receiptNo, bsDate, amountPaidToSchool, breakdown, handwrittenLedgerNo);
            
            setTimeout(() => {
                setSelectedStudent(null);
                setPrefilledBillData(null);
                if (onRefresh) onRefresh();
            }, 1500);

        } catch (err: any) {
            console.error('Payment Error:', err);
            setErrorMessage('Failed to process payment');
        }
        setProcessing(false);
    };

    const printStatement = (s: any) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const allRows = getRealisticLedgerRows(s);
        let tableRows = '';
        let totalPaid = 0;
        let totalDue = 0;

        allRows.forEach((f: any, idx: number) => {
            const paidAmt = Number(f.paidAmount || (f.status === 'paid' ? f.totalFee : 0) || 0);
            const dueAmt = Number(f.dueAmount !== undefined ? f.dueAmount : (f.status === 'due' ? f.totalFee : 0));
            totalPaid += paidAmt;
            totalDue += dueAmt;

            tableRows += `
                <tr>
                    <td style="border: 1px solid #000; padding: 6px;">${idx + 1}</td>
                    <td style="border: 1px solid #000; padding: 6px;">${f.month} ${f.type && f.type !== 'Tuition Fee' ? `(${f.type})` : ''}</td>
                    <td style="border: 1px solid #000; padding: 6px;">${paidAmt}</td>
                    <td style="border: 1px solid #000; padding: 6px;">${dueAmt}</td>
                    <td style="border: 1px solid #000; padding: 6px;">${f.status}</td>
                    <td style="border: 1px solid #000; padding: 6px;">${f.receiptNo || '-'}</td>
                </tr>
            `;
        });

        printWindow.document.write(`
            <html>
            <head><title>Statement - ${s.name}</title></head>
            <body onload="window.print();window.close();" style="font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="text-align: center;">Fee Statement</h2>
                <p><strong>Name:</strong> ${s.name} &nbsp;&nbsp; <strong>Class:</strong> ${s.class} &nbsp;&nbsp; <strong>Roll:</strong> ${s.rollNumber || '-'}</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr style="background-color: #f3f4f6;">
                            <th style="border: 1px solid #000; padding: 6px;">SN</th>
                            <th style="border: 1px solid #000; padding: 6px;">Month</th>
                            <th style="border: 1px solid #000; padding: 6px;">Paid</th>
                            <th style="border: 1px solid #000; padding: 6px;">Due</th>
                            <th style="border: 1px solid #000; padding: 6px;">Status</th>
                            <th style="border: 1px solid #000; padding: 6px;">Receipt</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows || '<tr><td colspan="6" style="text-align:center;">No Records</td></tr>'}</tbody>
                </table>
                <p style="text-align: right; margin-top: 20px;"><strong>Total Paid:</strong> NRs. ${totalPaid}</p>
                <p style="text-align: right;"><strong>Total Due:</strong> NRs. ${totalDue}</p>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    const handleSaveOverride = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingLedgerRow) return;
        setOverrideSaving(true);
        try {
            const batch = writeBatch(db);
            const feeIdStr = editingLedgerRow.id || (editingLedgerRow.isImplicit 
                ? `${editingLedgerRow.studentId}_${editingLedgerRow.month.replace(/\s+/g,'')}_TuitionFee` 
                : `${editingLedgerRow.studentId}_${editingLedgerRow.month.replace(/\s+/g,'')}_${(editingLedgerRow.type || 'TuitionFee').replace(/\s+/g,'')}`);
            
            const feeRef = doc(db, 'studentFees', feeIdStr);
            const bsDate = formatBSDate(new Date());

            const overpaidDiff = Number(overridePaidAmount || 0) - Number(editingLedgerRow.paidAmount || 0);

            batch.set(feeRef, {
                studentId: editingLedgerRow.studentId,
                month: editingLedgerRow.month,
                type: editingLedgerRow.type || 'Tuition Fee',
                totalFee: Number(editingLedgerRow.totalFee || 0),
                paidAmount: Number(overridePaidAmount || 0),
                dueAmount: Number(overrideDueAmount || 0),
                status: overrideStatus,
                ledgerPageNo: overrideLedgerPageNo,
                isManualOverride: true,
                overrideReason: overrideReason || 'Manual adjustment',
                overrideUpdatedAt: new Date().toISOString(),
                receiptNo: editingLedgerRow.receiptNo && editingLedgerRow.receiptNo !== '*Auto-Calculated*' ? editingLedgerRow.receiptNo : 'MANUAL-OVERRIDE'
            }, { merge: true });

            // Create tracking audit transaction
            const currentAuthUser = auth.currentUser;
            const operatorName = currentAuthUser?.email || currentAuthUser?.displayName || 'Admin Accountant';
            const operatorUid = currentAuthUser?.uid || 'system';

            const txRef = doc(collection(db, 'transactions'));
            batch.set(txRef, {
                date: bsDate,
                receipt: `OVR-${getBSYearMonthDate().year}-${Date.now().toString().slice(-4)}`,
                studentId: editingLedgerRow.studentId,
                studentName: editingLedgerRow.studentName,
                class: editingLedgerRow.studentClass,
                amount: overpaidDiff,
                method: 'Manual Override',
                collectedBy: operatorName,
                createdBy: operatorName,
                creatorUid: operatorUid,
                status: 'OVERRIDE_SUCCESS',
                months: [editingLedgerRow.month],
                remarks: `Status manually forced to '${overrideStatus}' for ${editingLedgerRow.month} (${editingLedgerRow.type}). Reason: ${overrideReason || 'Correction'}`,
                ledgerPageNo: overrideLedgerPageNo,
                timestamp: serverTimestamp()
            });

            await batch.commit();

            onRefresh();
            setEditingLedgerRow(null);
            setSuccessMessage(`Successfully forced ledger status for ${editingLedgerRow.studentName} (${editingLedgerRow.month})!`);
        } catch (err: any) {
            console.error('Failed to save manual override', err);
            handleFirestoreError(err, OperationType.WRITE, 'cash_ledger');
            setErrorMessage(err.message || 'Failed to save manual override');
        } finally {
            setOverrideSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Real-time cash collection indicator card */}
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-3xl p-6 text-white shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-in fade-in duration-300">
                <div>
                    <span className="bg-white/20 text-white/95 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/20">
                        LIVE CASHIER REGISTER
                    </span>
                    <h2 className="text-xl md:text-2xl font-black tracking-tight mt-2 flex items-center gap-2">
                        <Banknote className="w-6 h-6 text-emerald-100" /> Today's Cash Collection: NRs. {todayTotal.toLocaleString()}
                    </h2>
                    <p className="text-xs text-emerald-100/80 font-medium mt-1">
                        Active Date: {todayBS} &bull; Total processed payments today: {todayCollections.length} payments
                    </p>
                </div>
                {todayCollections.length > 0 && (
                    <div className="bg-white/10 backdrop-blur-sm p-3.5 rounded-2xl border border-white/15 max-w-sm text-xs font-bold font-mono">
                        <span className="block text-[9px] text-emerald-200 uppercase font-black tracking-wider mb-1">Recent Cash logs</span>
                        <div className="space-y-1 max-h-[60px] overflow-y-auto pr-1">
                            {todayCollections.slice(0, 3).map((lh, idx) => (
                                <div key={idx} className="flex justify-between gap-4 text-emerald-50">
                                    <span>{lh.studentName?.slice(0, 15)}...</span>
                                    <span className="text-white">NRs. {lh.amount}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* LEFT PANEL : Class Selection & Student List */}
                <div className="lg:col-span-3 space-y-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4 items-center">
                        <select 
                            value={selectedClass} 
                            onChange={e => {
                                setSelectedClass(e.target.value);
                                setSelectedStudent(null);
                                setExpandedStudent(null);
                            }}
                            className="w-full sm:w-auto bg-blue-50 text-blue-800 font-bold border border-blue-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                                <option value="">-- Choose Class --</option>
                                {['Play Group', 'Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(c => (
                                    <option key={c} value={c}>Class {c}</option>
                                ))}
                        </select>
                    </div>
                    <div className="relative flex-1 w-full bg-white p-2 rounded-2xl shadow-sm border border-gray-100 flex items-center mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Search student by name or roll..."
                            value={searchTerm}
                            onChange={e => {
                                setSearchTerm(e.target.value);
                                setSelectedStudent(null);
                                setExpandedStudent(null);
                            }}
                            className="w-full pl-9 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                {/* </div> REMOVED to include table inside lg:col-span-2 */}

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto custom-scrollbar pb-2">
                    <table className="w-full text-left min-w-[500px]">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr className="text-xs uppercase tracking-widest text-gray-500 font-bold">
                                <th className="p-4 px-6">Roll No</th>
                                <th className="p-4">Actual Name</th>
                                <th className="p-4">Class</th>
                                <th className="p-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredStudents.length > 0 ? filteredStudents.map(student => (
                                <React.Fragment key={student.id}>
                                <tr className="hover:bg-blue-50/30 transition-colors">
                                    <td className="p-4 px-6 font-bold text-gray-700">{student.rollNumber || '-'}</td>
                                    <td className="p-4 font-bold text-gray-900">{student.name}</td>
                                    <td className="p-4 font-bold text-gray-600">Class {student.class}</td>
                                     <td className="p-4 text-center">
                                        <div className="flex justify-center gap-2 items-center">
                                            <button 
                                                onClick={() => handlePayClick(student)}
                                                className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 min-w-[80px] justify-center"
                                                title="Quick Pay Fee"
                                            >
                                                <Zap className="w-3.5 h-3.5 hidden xl:block" /> Pay Fee
                                            </button>
                                            <button 
                                                onClick={() => setExpandedStudent(expandedStudent === student.id ? null : student.id)}
                                                className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 min-w-[80px] justify-center"
                                                title="View Ledger Statement"
                                            >
                                                <FileText className="w-3.5 h-3.5 hidden xl:block" /> {expandedStudent === student.id ? 'Close' : 'Ledger'}
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); 
                                                const rows = getRealisticLedgerRows(student);
                                                const unpaidMonths = rows.filter((r: any) => r.status === 'due').map((r: any) => r.month);
                                                window.open(`https://wa.me/977${student.guardianPhone}?text=${encodeURIComponent(`Namaste ${student.guardianName} ji, SHIKSHANTAR ACADEMY Siraha bata suchit garinchhau ki ${student.name} (Class ${student.class}) ko ${unpaidMonths.length > 0 ? unpaidMonths.join(', ') + ' mahina ko ' : ''}fee NRs. ${getStudentDue(student)} baki chha. Kripaya school aaera tirna anurodh chha. Dhanyabad.`)}`, '_blank');
                                            }} className="bg-white text-gray-700 hover:text-primary border border-gray-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm min-w-[80px] justify-center" title="Send WhatsApp Reminder">
                                              <Bell className="w-3.5 h-3.5 hidden xl:block" /> Remind
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                {expandedStudent === student.id && (
                                    <tr className="bg-gray-50/50">
                                        <td colSpan={4} className="p-6 border-b border-gray-100">
                                            <div className="mb-4 flex justify-between items-center">
                                                <h4 className="font-bold text-gray-800 flex items-center gap-2"><BookOpen className="w-4 h-4 text-emerald-600"/> Ledger Statement</h4>
                                                <button onClick={() => printStatement(student)} className="text-xs bg-white border border-gray-200 px-3 py-1.5 rounded shadow-sm flex items-center gap-2 font-bold text-gray-700 hover:text-blue-600 transition-colors">
                                                    <Printer className="w-3.5 h-3.5" /> Print
                                                </button>
                                            </div>
                                            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto custom-scrollbar pb-2 text-sm max-w-4xl mx-auto shadow-sm">
                                                <table className="w-full text-left min-w-[550px]">
                                                    <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                                                        <tr>
                                                            <th className="p-3 pl-4">Month/Fee Type</th>
                                                            <th className="p-3">Status</th>
                                                            <th className="p-3 text-right">Paid</th>
                                                            <th className="p-3 text-right">Due</th>
                                                            <th className="p-3 pl-4 font-normal">Receipt</th>
                                                            <th className="p-3 text-center text-xs font-bold uppercase tracking-wider text-blue-600">Action</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {(() => {
                                                            const allRows = getRealisticLedgerRows(student);
                                                            if (allRows.length === 0) return <tr><td colSpan={6} className="p-6 text-center text-gray-400 font-bold">No records found.</td></tr>;
                                                            return allRows.map((f: any, idx: number) => {
                                                                const isDue = f.status === 'due';
                                                                return (
                                                                    <tr key={idx} className={isDue ? 'bg-red-50/30' : (f.isImplicit ? 'bg-orange-50/20' : '')}>
                                                                        <td className="p-3 pl-4 font-bold text-gray-800 flex items-center gap-2">
                                                                            {f.month} {f.type !== 'Tuition Fee' && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{f.type}</span>}
                                                                            {f.isManualOverride && <span className="text-[9px] bg-purple-100 text-purple-700 px-1 py-0.5 rounded font-black uppercase tracking-widest">Override</span>}
                                                                        </td>
                                                                        <td className="p-3">
                                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${isDue ? 'bg-red-100 text-red-700' : (f.status === 'waived' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700')}`}>
                                                                                {f.status === 'due' ? 'NOT DONE' : f.status}
                                                                            </span>
                                                                        </td>
                                                                        <td className="p-3 text-right font-bold text-emerald-700">NRs. {f.paidAmount || (f.status === 'paid' ? f.totalFee : 0) || 0}</td>
                                                                        <td className="p-3 text-right font-bold text-red-600">NRs. {f.dueAmount !== undefined ? f.dueAmount : (isDue ? f.totalFee : 0)}</td>
                                                                        <td className="p-3 pl-4 text-xs text-gray-500 font-mono italic">
                                                                            {f.receiptNo || '-'}
                                                                            {f.remarks && <p className="text-[9px] text-gray-400 font-sans not-italic mt-0.5">{f.remarks}</p>}
                                                                        </td>
                                                                        <td className="p-3 text-center">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setEditingLedgerRow({
                                                                                        studentId: student.id,
                                                                                        studentName: student.name,
                                                                                        studentClass: student.class,
                                                                                        month: f.month,
                                                                                        type: f.type || 'Tuition Fee',
                                                                                        totalFee: f.totalFee || (Number(f.paidAmount || 0) + Number(f.dueAmount || 0)) || Number(student.monthlyFee || 0),
                                                                                        paidAmount: f.paidAmount || 0,
                                                                                        dueAmount: f.dueAmount !== undefined ? f.dueAmount : (isDue ? f.totalFee : 0),
                                                                                        status: f.status,
                                                                                        isImplicit: !!f.isImplicit,
                                                                                        id: f.id,
                                                                                        ledgerPageNo: f.ledgerPageNo || ''
                                                                                    });
                                                                                    setOverrideStatus(f.status === 'paid' ? 'paid' : (f.status === 'waived' ? 'waived' : 'due'));
                                                                                    setOverridePaidAmount(String(f.paidAmount || (f.status === 'paid' ? f.totalFee : 0) || 0));
                                                                                    setOverrideDueAmount(String(f.dueAmount !== undefined ? f.dueAmount : (isDue ? f.totalFee : 0)));
                                                                                    setOverrideLedgerPageNo(f.ledgerPageNo || '');
                                                                                    setOverrideReason('');
                                                                                }}
                                                                                className="px-2.5 py-1 text-[11px] bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-black transition-all border border-blue-200 active:scale-95"
                                                                            >
                                                                                Override
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            });
                                                        })()}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                </React.Fragment>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-gray-400 font-bold text-sm">
                                        {selectedClass ? 'No students found in this class' : 'Please select a class to view students'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                </div> {/* Added to close lg:col-span-2 */}
            {/* </div> REMOVED grid close */}

                        </div> {/* Close outer grid grid-cols-1 lg:grid-cols-3 */}

            {/* RIGHT PANEL : Beautiful Wide Center Overlay Modal */}
            {selectedStudent && createPortal(
                <div className="fixed inset-0 bg-gray-950/65 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-7xl h-[92vh] max-h-[95vh] shadow-2xl border border-gray-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" ref={paymentFormRef}>
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-6 py-5 flex justify-between items-center shrink-0 shadow-md">
                            <div>
                                <span className="bg-white/20 text-white font-black text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/25">
                                    FEE CASHIER DESK
                                </span>
                                <h3 className="text-xl font-black mt-1 flex items-center gap-2">
                                    <Banknote className="w-5 h-5 text-emerald-200" /> Record Fee Collection
                                </h3>
                            </div>
                            <button 
                                type="button" 
                                onClick={() => setSelectedStudent(null)} 
                                className="text-white hover:bg-white/10 p-2.5 rounded-full transition-all hover:scale-105 active:scale-95" 
                                title="Close Panel"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Modal Body: Split into 2 Columns with flex/grid, scrollable */}
                        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-gray-50/50">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                                
                                {/* LEFT COLUMN: Student Ledger Statement (Appears on the side) */}
                                <div className="lg:col-span-5 space-y-6">
                                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                                        <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
                                            <h4 className="font-black text-gray-800 text-sm flex items-center gap-2 uppercase tracking-wide">
                                                <BookOpen className="w-4 h-4 text-emerald-600"/> Student Ledger History
                                            </h4>
                                            <button 
                                                type="button"
                                                onClick={() => printStatement(selectedStudent)} 
                                                className="text-xs bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 font-bold text-gray-700 hover:bg-gray-100 transition-colors"
                                            >
                                                <Printer className="w-3.5 h-3.5" /> Print Statement
                                            </button>
                                        </div>

                                        {/* Ledger Table */}
                                        <div className="overflow-x-auto max-h-[55vh] overflow-y-auto custom-scrollbar rounded-xl border border-gray-150 pb-2">
                                            <table className="w-full text-left text-xs min-w-[450px]">
                                                <thead className="bg-gray-50 border-b border-gray-250 text-gray-500 font-bold uppercase tracking-wider sticky top-0">
                                                    <tr>
                                                        <th className="p-3 pl-4">Month/Type</th>
                                                        <th className="p-3">Status</th>
                                                        <th className="p-3 text-right">Paid</th>
                                                        <th className="p-3 text-right">Due</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {(() => {
                                                        const allRows = getRealisticLedgerRows(selectedStudent);
                                                        if (allRows.length === 0) {
                                                            return <tr><td colSpan={4} className="p-6 text-center text-gray-400 font-bold">No ledger records found.</td></tr>;
                                                        }
                                                        return allRows.map((f: any, idx: number) => {
                                                            const isDue = f.status === 'due';
                                                            return (
                                                                <tr key={idx} className={`${isDue ? 'bg-red-50/20' : (f.isImplicit ? 'bg-orange-50/10' : 'bg-emerald-50/10')} hover:bg-gray-50 transition-all`}>
                                                                    <td className="p-3 pl-4 font-bold text-gray-800">
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <span>{f.month}</span>
                                                                            <span className="text-[9px] text-gray-400 font-normal">{f.type}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-3">
                                                                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${isDue ? 'bg-red-105 text-red-700' : (f.status === 'waived' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700')}`}>
                                                                            {f.status === 'due' ? 'DUE' : f.status}
                                                                        </span>
                                                                    </td>
                                                                    <td className="p-3 text-right font-bold text-emerald-700">NRs. {f.paidAmount || (f.status === 'paid' ? f.totalFee : 0) || 0}</td>
                                                                    <td className="p-3 text-right font-bold text-red-600">NRs. {f.dueAmount !== undefined ? f.dueAmount : (isDue ? f.totalFee : 0)}</td>
                                                                </tr>
                                                            );
                                                        });
                                                    })()}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Recent Transactions Widget */}
                                    {getRecentReceipts(selectedStudent).length > 0 && (
                                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                                            <h4 className="text-xs uppercase font-black text-gray-500 tracking-wider mb-3 flex items-center gap-1.5">
                                                <span>Recent Transactions</span>
                                            </h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {getRecentReceipts(selectedStudent).map((rec, idx) => (
                                                    <div key={idx} className="bg-gray-50 border text-xs border-gray-100 p-3 rounded-xl flex justify-between items-center shadow-sm">
                                                        <div>
                                                            <p className="font-bold text-gray-800">{rec.no}</p>
                                                            <p className="text-[10px] text-gray-500 font-medium">{rec.date} &bull; {rec.types.join(', ')}</p>
                                                        </div>
                                                        <p className="font-black text-emerald-600 shrink-0 ml-2">NRs. {rec.total.toLocaleString()}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* RIGHT COLUMN: Record Payments Form */}
                                <div className="lg:col-span-7 bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
                                    <div className="bg-emerald-50/70 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                        <div>
                                            <p className="text-xs uppercase font-black text-emerald-600 mb-0.5">Paying For</p>
                                            <h4 className="font-black text-xl text-gray-900">{selectedStudent.name}</h4>
                                            <p className="text-xs font-bold text-gray-500 mt-0.5">Class {selectedStudent.class} | Roll: {selectedStudent.rollNumber || '-'}</p>
                                        </div>
                                        <div className="text-left sm:text-right sm:border-l border-emerald-200 sm:pl-6">
                                            <p className="text-[10px] uppercase font-black text-emerald-600 mb-0.5">Total Dues</p>
                                            <p className="font-black text-red-600 text-2xl">NRs. {getStudentDue(selectedStudent).toLocaleString()}</p>
                                        </div>
                                    </div>

                                    <form onSubmit={handleProcessPayment} className="space-y-6">
                                        {errorMessage && (
                                            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm font-bold flex items-start gap-2">
                                                <span className="shrink-0 mt-0.5">⚠️</span>
                                                <span>{errorMessage}</span>
                                            </div>
                                        )}
                                        {successMessage && (
                                            <div className="bg-emerald-50 border border-emerald-200 text-emerald-600 px-4 py-3 rounded-xl text-sm font-bold flex items-start gap-2">
                                                <span className="shrink-0 mt-0.5">✅</span>
                                                <span>{successMessage}</span>
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-3">Payment Category Selection</label>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                                                {[
                                                    { id: 'full_due', label: 'Full Dues' },
                                                    { id: '1_month', label: '1 Month' },
                                                    { id: '3_months', label: '3 Months' },
                                                    { id: '6_months', label: '6 Months' },
                                                    { id: 'full_year', label: 'Full Year' },
                                                    { id: 'custom', label: 'Custom / Partial' }
                                                ].map(cat => (
                                                    <button 
                                                        key={cat.id}
                                                        type="button" 
                                                        onClick={() => {
                                                            setPaymentCategory(cat.id);
                                                            if (cat.id === 'custom') setCashReceived('');
                                                        }}
                                                        className={`py-3 px-4 rounded-xl border-2 transition-all text-xs font-black ${paymentCategory === cat.id ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm scale-[1.02]' : 'border-gray-200 text-gray-600 hover:bg-gray-50 active:scale-95'}`}
                                                    >
                                                        {cat.label}
                                                    </button>
                                                ))}
                                            </div>
                                            {paymentCategory === '1_month' && (
                                                <div className="mt-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Select Specific Month</label>
                                                    <select 
                                                        value={selectedMonth} 
                                                        onChange={e => setSelectedMonth(e.target.value)} 
                                                        className="w-full border-2 border-gray-200 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm font-bold bg-white text-gray-700 focus:ring-1 focus:ring-emerald-500 outline-none"
                                                    >
                                                        {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                                                    </select>
                                                </div>
                                            )}
                                        </div>

                                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-150 space-y-3.5">
                                            <div className="flex justify-between items-center text-sm font-bold text-gray-700">
                                                <span>Base Tuition Fee Due:</span>
                                                {paymentCategory === 'custom' ? (
                                                    <div className="relative w-36">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">NRs</span>
                                                        <input 
                                                            type="number"
                                                            min="0"
                                                            step="any"
                                                            value={customBaseAmount}
                                                            onChange={e => setCustomBaseAmount(e.target.value)}
                                                            className="w-full border-2 border-emerald-300 focus:border-emerald-500 rounded-lg pl-8 pr-2 py-1 text-xs font-black text-emerald-950 font-mono bg-white text-right outline-none"
                                                        />
                                                    </div>
                                                ) : (
                                                    <span className="font-mono">NRs. {baseAmount.toLocaleString()}</span>
                                                )}
                                            </div>

                                            {/* Additional Charges Block */}
                                            <div className="border-t border-gray-200 pt-3 space-y-2.5">
                                                <div className="flex justify-between items-center">
                                                    <label className="text-xs font-black text-blue-800 uppercase tracking-wider">Additional Charges Detail</label>
                                                    <button
                                                        type="button"
                                                        onClick={() => setAdditionalChargesList([...additionalChargesList, { id: Date.now().toString(), purpose: 'Additional Charge ' + (additionalChargesList.length + 1), amount: '0' }])}
                                                        className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white font-black px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 active:scale-95 shadow-sm"
                                                    >
                                                        <Plus className="w-3 h-3" /> Add Charge Line
                                                    </button>
                                                </div>
                                                {additionalChargesList.length === 0 ? (
                                                    <p className="text-[10px] text-gray-500 italic">No additional charges added for this collection.</p>
                                                ) : (
                                                    <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                                                        {additionalChargesList.map((item, idx) => (
                                                            <div key={item.id} className="flex gap-2 items-center bg-white p-2 rounded-xl border border-blue-100 shadow-sm">
                                                                <input
                                                                    type="text"
                                                                    required
                                                                    placeholder="Charge type (e.g. Uniform)"
                                                                    value={item.purpose}
                                                                    onChange={e => {
                                                                        const newList = [...additionalChargesList];
                                                                        newList[idx].purpose = e.target.value;
                                                                        setAdditionalChargesList(newList);
                                                                    }}
                                                                    className="flex-1 min-w-[100px] border border-gray-200 focus:border-blue-400 rounded-lg px-2.5 py-1.5 text-xs font-bold text-gray-800 bg-white outline-none"
                                                                />
                                                                <div className="relative w-28">
                                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] font-bold">NRs</span>
                                                                    <input
                                                                        type="number"
                                                                        required
                                                                        min="0"
                                                                        step="any"
                                                                        value={item.amount}
                                                                        onChange={e => {
                                                                            const newList = [...additionalChargesList];
                                                                            newList[idx].amount = e.target.value;
                                                                            setAdditionalChargesList(newList);
                                                                        }}
                                                                        className="w-full border border-gray-200 focus:border-blue-400 rounded-lg pl-8 pr-2 py-1.5 text-xs font-black text-blue-600 bg-white text-right outline-none"
                                                                    />
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setAdditionalChargesList(additionalChargesList.filter(x => x.id !== item.id))}
                                                                    className="text-gray-400 hover:text-red-500 p-1 hover:bg-red-50 rounded-lg transition-colors"
                                                                    title="Remove Line"
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Concession/Discounts Block */}
                                            <div className="border-t border-gray-200 pt-3 space-y-2.5">
                                                <div className="flex justify-between items-center">
                                                    <label className="text-xs font-black text-red-800 uppercase tracking-wider">Discounts & Deductions</label>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDiscountsList([...discountsList, { id: Date.now().toString(), purpose: 'Discount ' + (discountsList.length + 1), amount: '0' }])}
                                                        className="text-[10px] bg-red-600 hover:bg-red-700 text-white font-black px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 active:scale-95 shadow-sm"
                                                    >
                                                        <Plus className="w-3 h-3" /> Add Discount Line
                                                    </button>
                                                </div>
                                                {discountsList.length === 0 ? (
                                                    <p className="text-[10px] text-gray-500 italic">No custom discounts or concessions applied.</p>
                                                ) : (
                                                    <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                                                        {discountsList.map((item, idx) => (
                                                            <div key={item.id} className="flex gap-2 items-center bg-white p-2 rounded-xl border border-red-100 shadow-sm">
                                                                <input
                                                                    type="text"
                                                                    required
                                                                    placeholder="Deduction reason"
                                                                    value={item.purpose}
                                                                    onChange={e => {
                                                                        const newList = [...discountsList];
                                                                        newList[idx].purpose = e.target.value;
                                                                        setDiscountsList(newList);
                                                                    }}
                                                                    className="flex-1 min-w-[100px] border border-gray-200 focus:border-red-400 rounded-lg px-2.5 py-1.5 text-xs font-bold text-gray-800 bg-white outline-none"
                                                                />
                                                                <div className="relative w-28">
                                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] font-bold">NRs</span>
                                                                    <input
                                                                        type="number"
                                                                        required
                                                                        min="0"
                                                                        step="any"
                                                                        value={item.amount}
                                                                        onChange={e => {
                                                                            const newList = [...discountsList];
                                                                            newList[idx].amount = e.target.value;
                                                                            setDiscountsList(newList);
                                                                        }}
                                                                        className="w-full border border-gray-200 focus:border-red-400 rounded-lg pl-8 pr-2 py-1.5 text-xs font-black text-red-600 bg-white text-right outline-none"
                                                                    />
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setDiscountsList(discountsList.filter(x => x.id !== item.id))}
                                                                    className="text-gray-400 hover:text-red-500 p-1 hover:bg-red-50 rounded-lg transition-colors"
                                                                    title="Remove Line"
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Detailed Collection Breakdown Panel */}
                                        <div className="bg-slate-50 rounded-2xl border border-gray-200 p-5 space-y-4 shadow-sm">
                                            <div className="flex items-center gap-2 border-b border-gray-200 pb-2.5">
                                                <FileText className="w-4 h-4 text-slate-600" />
                                                <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider">Detailed Collection Breakdown</h5>
                                            </div>
                                            
                                            <div className="space-y-3.5 text-xs font-medium text-gray-700">
                                                {/* 1. Base Tuition */}
                                                <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-150">
                                                    <div>
                                                        <span className="font-bold text-gray-900 block">Base Tuition Charge</span>
                                                        <span className="text-[10px] text-gray-500 font-medium">
                                                            {paymentCategory === 'full_due' && "All unpaid outstanding dues"}
                                                            {paymentCategory === '1_month' && "1 Month standard tuition fee"}
                                                            {paymentCategory === '3_months' && "3 Months standard tuition fee"}
                                                            {paymentCategory === '6_months' && "6 Months standard tuition fee"}
                                                            {paymentCategory === 'full_year' && "12 Months standard tuition fee"}
                                                            {paymentCategory === 'custom' && "Custom / partial category (Base set to 0)"}
                                                        </span>
                                                    </div>
                                                    <span className="font-black font-mono text-gray-900">NRs. {baseAmount.toLocaleString()}</span>
                                                </div>

                                                {/* 2. Additional Charges list */}
                                                <div className="bg-white p-3 rounded-xl border border-blue-100 space-y-2">
                                                    <div className="flex justify-between items-center text-blue-900 font-bold border-b border-blue-50 pb-1.5">
                                                        <span>Additional Charges ({additionalChargesList.length})</span>
                                                        <span className="font-mono font-black text-blue-700">
                                                            + NRs. {additionalChargesList.reduce((acc, x) => acc + Number(x.amount || 0), 0).toLocaleString()}
                                                        </span>
                                                    </div>
                                                    {additionalChargesList.length === 0 ? (
                                                        <p className="text-[10px] text-gray-400 italic">No additional charges applied.</p>
                                                    ) : (
                                                        <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                                                            {additionalChargesList.map((item) => (
                                                                <div key={item.id} className="flex justify-between text-[11px] text-gray-600 pl-2 border-l-2 border-blue-200">
                                                                    <span className="font-bold truncate max-w-[200px]" title={item.purpose}>{item.purpose || "Unnamed Charge"}</span>
                                                                    <span className="font-semibold font-mono text-blue-600">NRs. {Number(item.amount || 0).toLocaleString()}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* 3. Discounts list */}
                                                <div className="bg-white p-3 rounded-xl border border-red-100 space-y-2">
                                                    <div className="flex justify-between items-center text-red-900 font-bold border-b border-red-50 pb-1.5">
                                                        <span>Discounts & Concessions ({discountsList.length})</span>
                                                        <span className="font-mono font-black text-red-700">
                                                            - NRs. {discountsList.reduce((acc, x) => acc + Number(x.amount || 0), 0).toLocaleString()}
                                                        </span>
                                                    </div>
                                                    {discountsList.length === 0 ? (
                                                        <p className="text-[10px] text-gray-400 italic">No discounts or concessions applied.</p>
                                                    ) : (
                                                        <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                                                            {discountsList.map((item) => (
                                                                <div key={item.id} className="flex justify-between text-[11px] text-gray-600 pl-2 border-l-2 border-red-200">
                                                                    <span className="font-bold truncate max-w-[200px]" title={item.purpose}>{item.purpose || "Unnamed Concession"}</span>
                                                                    <span className="font-semibold font-mono text-red-600">NRs. {Number(item.amount || 0).toLocaleString()}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Explicit Calculation Display */}
                                            <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-xs font-bold text-emerald-900 font-sans mb-2">
                                                <span>Calculation: Monthly Tuition Fee = NRs. {Number(selectedStudent?.monthlyFee || 1000).toLocaleString()} × {paymentCategory === '1_month' ? 1 : paymentCategory === '3_months' ? 3 : paymentCategory === '6_months' ? 6 : paymentCategory === 'full_year' ? 12 : paymentCategory === 'full_due' ? 'Outstanding Dues' : 'Custom'} = NRs. {baseAmount.toLocaleString()}</span>
                                            </div>

                                            {/* Formula Calculation Row */}
                                            <div className="bg-slate-100 p-3 rounded-xl border border-gray-200 text-center text-xs font-black text-gray-600 font-mono tracking-tight flex flex-wrap justify-center gap-2 items-center">
                                                <span>Base {baseAmount.toLocaleString()}</span>
                                                <span className="text-blue-500 font-extrabold">+</span>
                                                <span className="text-blue-600">Charges {additionalChargesList.reduce((acc, x) => acc + Number(x.amount || 0), 0).toLocaleString()}</span>
                                                <span className="text-red-500 font-extrabold">-</span>
                                                <span className="text-red-600">Discounts {discountsList.reduce((acc, x) => acc + Number(x.amount || 0), 0).toLocaleString()}</span>
                                                <span className="text-gray-500 font-extrabold">=</span>
                                                <span className="text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg text-sm">Payable NRs. {totalPayable.toLocaleString()}</span>
                                            </div>
                                        </div>

                                        {/* Financial Calculation summary */}
                                        <div className="border-t border-gray-150 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 flex flex-col justify-center">
                                                <span className="text-[10px] uppercase font-black text-emerald-600 tracking-wider">Net Payable Total</span>
                                                <span className="text-2xl font-black text-emerald-800 font-mono mt-1">NRs. {totalPayable.toLocaleString()}</span>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-1.5">Cash Received Amount (NRs) *</label>
                                                <input 
                                                    type="number"
                                                    required
                                                    min="1"
                                                    placeholder="Enter amount collected"
                                                    value={cashReceived}
                                                    onChange={e => setCashReceived(e.target.value)}
                                                    className="w-full border-2 border-emerald-300 focus:border-emerald-500 rounded-xl px-4 py-3 text-lg font-black text-emerald-950 font-mono focus:ring-1 focus:ring-emerald-500 outline-none shadow-sm"
                                                />
                                            </div>
                                        </div>

                                        {/* Paper Log / Handwritten registers reconciliation */}
                                        <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 space-y-3">
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="checkbox"
                                                    id="handwritten_mode_modal"
                                                    checked={isHandwrittenMode}
                                                    onChange={e => setIsHandwrittenMode(e.target.checked)}
                                                    className="w-4 h-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500 bg-white"
                                                />
                                                <label htmlFor="handwritten_mode_modal" className="text-xs font-black text-amber-800 cursor-pointer select-none uppercase tracking-wider">
                                                    Associate with Offline Paper Ledger Book entry
                                                </label>
                                            </div>
                                            {isHandwrittenMode && (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 animate-in slide-in-from-top-1 duration-150">
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1">Handwritten Ledger Volume & Page No</label>
                                                        <input 
                                                            type="text" 
                                                            required
                                                            placeholder="e.g. Ledger Vol 2, Page 43"
                                                            value={handwrittenLedgerNo} 
                                                            onChange={e => setHandwrittenLedgerNo(e.target.value)}
                                                            className="w-full border-2 border-amber-200 focus:border-amber-500 rounded-xl px-3 py-2 bg-white text-xs font-bold text-gray-800"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1">Receipt Book Serial No (Optional)</label>
                                                        <input 
                                                            type="text" 
                                                            placeholder="Paper Serial #541"
                                                            value={handwrittenReceiptSerial} 
                                                            onChange={e => setHandwrittenReceiptSerial(e.target.value)}
                                                            className="w-full border-2 border-amber-200 focus:border-amber-500 rounded-xl px-3 py-2 bg-white text-xs font-bold text-gray-800"
                                                        />
                                                    </div>
                                                    <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                                                        <input
                                                            type="checkbox"
                                                            id="physical_sign_checkbox_modal"
                                                            checked={handwrittenSignVerified}
                                                            onChange={e => setHandwrittenSignVerified(e.target.checked)}
                                                            className="w-4 h-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500 bg-white"
                                                        />
                                                        <label htmlFor="physical_sign_checkbox_modal" className="text-xs font-bold text-amber-900 cursor-pointer select-none">
                                                            Physical Signature Reconciled & OK
                                                        </label>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-2">
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Remarks</label>
                                            <input 
                                                type="text" 
                                                placeholder="Any extra payment notes"
                                                value={remarks} 
                                                onChange={e => setRemarks(e.target.value)}
                                                className="w-full border-2 border-gray-200 focus:border-emerald-500 rounded-xl px-4 py-3 outline-none font-bold text-gray-700 bg-white text-sm focus:ring-1 focus:ring-emerald-500"
                                            />
                                        </div>

                                        <div className="flex gap-4 pt-4">
                                            <button 
                                                type="button"
                                                onClick={() => setSelectedStudent(null)}
                                                className="flex-1 border-2 border-gray-200 text-gray-600 font-bold uppercase tracking-widest py-3 rounded-xl hover:bg-gray-50 transition active:scale-95 text-xs"
                                            >
                                                Cancel
                                            </button>
                                            <button 
                                                type="submit" 
                                                disabled={processing}
                                                className="flex-1 bg-emerald-600 text-white font-black uppercase tracking-widest py-3.5 rounded-xl hover:bg-emerald-700 transition flex justify-center items-center gap-2 shadow-lg shadow-emerald-500/30 disabled:opacity-50 active:scale-95 text-xs"
                                            >
                                                {processing ? <Loader2 className="w-5 h-5 animate-spin"/> : 'Confirm & Print Receipt'}
                                            </button>
                                        </div>
                                        <p className="text-center text-[10px] text-gray-400 font-medium">Ledger and outstanding dues will automatically update by waterfall method</p>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Secure Override Portal Modal */}
            {editingLedgerRow && createPortal(
                <div className="fixed inset-0 bg-gray-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200 text-left">
                        <div className="bg-gradient-to-r from-blue-700 to-blue-800 p-6 text-white flex justify-between items-center">
                            <div>
                                <span className="text-[10px] bg-blue-500 text-white font-black px-2 py-0.5 rounded uppercase tracking-wider">SECURE DIGITAL OVERRIDE MODE</span>
                                <h3 className="text-lg font-black mt-1">Manual Ledger Update</h3>
                            </div>
                            <button 
                                type="button"
                                onClick={() => setEditingLedgerRow(null)}
                                className="text-white hover:bg-white/10 p-2 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSaveOverride} className="p-6 space-y-4">
                            <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-xs space-y-1">
                                <p className="font-bold text-blue-900">Student: <span className="font-black text-blue-950">{editingLedgerRow.studentName}</span></p>
                                <p className="text-blue-800">Month / Fee: <strong className="font-black text-blue-900">{editingLedgerRow.month} ({editingLedgerRow.type})</strong></p>
                                <p className="text-blue-800">System Calculated Total: <span className="font-mono font-bold">NRs. {Number(editingLedgerRow.totalFee).toLocaleString()}</span></p>
                            </div>

                            <div>
                                <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-1.5">Forced Fee Status</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['paid', 'due', 'waived'] as const).map(st => (
                                        <button
                                            key={st}
                                            type="button"
                                            onClick={() => {
                                                setOverrideStatus(st);
                                                if (st === 'paid') {
                                                    setOverridePaidAmount(String(editingLedgerRow.totalFee));
                                                    setOverrideDueAmount('0');
                                                } else if (st === 'due') {
                                                    setOverridePaidAmount('0');
                                                    setOverrideDueAmount(String(editingLedgerRow.totalFee));
                                                } else { // waived
                                                    setOverridePaidAmount('0');
                                                    setOverrideDueAmount('0');
                                                }
                                            }}
                                            className={`py-2 px-3 rounded-xl border text-xs font-black transition-all capitalize ${overrideStatus === st ? 'bg-blue-650 border-blue-650 text-white shadow-md' : 'bg-gray-50 border-gray-200 text-gray-750 hover:bg-gray-100'}`}
                                        >
                                            {st}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-1.5">Amount Paid (NRs)</label>
                                    <input 
                                        type="number"
                                        required
                                        min="0"
                                        value={overridePaidAmount}
                                        onChange={e => {
                                            setOverridePaidAmount(e.target.value);
                                            const paid = Number(e.target.value || 0);
                                            const total = Number(editingLedgerRow.totalFee || 0);
                                            if (overrideStatus === 'due') {
                                                setOverrideDueAmount(String(Math.max(0, total - paid)));
                                            } else if (overrideStatus === 'paid') {
                                                setOverrideDueAmount('0');
                                            }
                                        }}
                                        className="w-full border-2 border-gray-200 focus:border-blue-500 rounded-xl px-3 py-2 bg-white text-sm font-bold text-gray-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-1.5">Amount Due (NRs)</label>
                                    <input 
                                        type="number"
                                        required
                                        min="0"
                                        value={overrideStatus === 'paid' ? '0' : (overrideStatus === 'waived' ? '0' : overrideDueAmount)}
                                        disabled={overrideStatus !== 'due'}
                                        onChange={e => setOverrideDueAmount(e.target.value)}
                                        className="w-full border-2 border-gray-200 focus:border-blue-500 rounded-xl px-3 py-2 bg-gray-50 text-sm font-bold text-gray-800 disabled:opacity-75"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-700 uppercase tracking-widest mb-1.5">Associated Handwritten Ledger No (Optional)</label>
                                    <input 
                                        type="text"
                                        placeholder="e.g. Ledger Vol 2, Page 43"
                                        value={overrideLedgerPageNo}
                                        onChange={e => setOverrideLedgerPageNo(e.target.value)}
                                        className="w-full border border-gray-300 focus:border-blue-500 rounded-xl px-3 py-2 bg-white text-sm font-bold text-gray-800"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-700 uppercase tracking-widest mb-1.5">Reason for Correction override <span className="text-red-500">*</span></label>
                                <textarea
                                    required
                                    rows={2}
                                    placeholder="Explain why this status is manually overridden (e.g. corrected typo in paper register, sibling package allowance, offline bank transfer)"
                                    value={overrideReason}
                                    onChange={e => setOverrideReason(e.target.value)}
                                    className="w-full border border-gray-300 focus:border-blue-500 rounded-xl px-3 py-2 bg-white text-xs font-bold text-gray-850"
                                />
                            </div>                             <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingLedgerRow(null)}
                                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={overrideSaving}
                                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
                                >
                                    {overrideSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply Override'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
