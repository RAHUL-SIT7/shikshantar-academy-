import React, { useState, useMemo, useEffect } from 'react';
import { 
    Search, Printer, Calendar, FileText, CheckCircle2, AlertCircle, 
    ShoppingBag, Landmark, ArrowRight, UserCheck, RefreshCw, Badge, 
    ClipboardList, History, DollarSign, Wallet, ArrowUpRight, Filter, ChevronRight,
    Layers, ShieldCheck, Receipt
} from 'lucide-react';
import { getBSYearMonthDate, formatBSDate } from '../../lib/nepaliDate';
import CashReceiptModal, { CashReceiptData } from './CashReceiptModal';
import BillingCoverageReconciliationModal from './BillingCoverageReconciliationModal';
import { getStudentBillingCoverage } from '../../lib/nepaliBillingCoverage';

const MONTHS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];

export default function StudentLedgerDetailTab({ 
    students, 
    transactions = [], 
    remitBills = [],
    academicYear = '2083',
    onRefresh,
    initialStudentId,
    onSelectStudent
}: { 
    students: any[]; 
    transactions?: any[]; 
    remitBills?: any[];
    academicYear?: string;
    onRefresh?: () => void;
    initialStudentId?: string;
    onSelectStudent?: (studentId: string) => void;
}) {
    const [selectedClass, setSelectedClass] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(initialStudentId || null);
    const [historyFilter, setHistoryFilter] = useState<'all' | 'partial' | 'full'>('all');
    const [showReconciliationModal, setShowReconciliationModal] = useState<boolean>(false);

    useEffect(() => {
        if (initialStudentId) {
            setSelectedStudentId(initialStudentId);
            const targetStudent = students.find(s => s.id === initialStudentId);
            if (targetStudent && targetStudent.class) {
                setSelectedClass((prev) => (prev && prev !== targetStudent.class ? '' : prev));
                setSearchTerm('');
            }
        }
    }, [initialStudentId, students]);
    
    // Receipt Modal State
    const [selectedReceiptData, setSelectedReceiptData] = useState<CashReceiptData | null>(null);
    const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);

    // List of student classes
    const classes = ['Play Group', 'Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

    // Filter students
    const filteredStudents = useMemo(() => {
        return students.filter(s => {
            const matchClass = selectedClass ? s.class === selectedClass : true;
            const matchSearch = searchTerm ? 
                s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                String(s.rollNumber || '').includes(searchTerm) ||
                String(s.studentId || '').toLowerCase().includes(searchTerm.toLowerCase())
                : true;
            return matchClass && matchSearch;
        }).sort((a, b) => Number(a.rollNumber || 0) - Number(b.rollNumber || 0));
    }, [students, selectedClass, searchTerm]);

    // Active selected student object
    const selectedStudent = useMemo(() => {
        if (!selectedStudentId) {
            return filteredStudents.length > 0 ? filteredStudents[0] : null;
        }
        return students.find(s => s.id === selectedStudentId) || (filteredStudents.length > 0 ? filteredStudents[0] : null);
    }, [students, selectedStudentId, filteredStudents]);

    // Extract complete transaction and partial payment history for selected student
    const studentTransactions = useMemo(() => {
        if (!selectedStudent) return [];
        const sid = String(selectedStudent.id || '').trim();
        const officialId = String(selectedStudent.studentId || '').trim();
        const sName = String(selectedStudent.fullName || selectedStudent.name || '').trim().toLowerCase();
        const sRoll = String(selectedStudent.rollNumber || selectedStudent.roll || '').trim();
        const sClass = String(selectedStudent.class || '').trim();

        // 1. Matched transactions from main transactions list
        const matched = (transactions || []).filter((tx: any) => {
            const isActive = tx.status === 'SUCCESS' || tx.status === 'OVERRIDE_SUCCESS';
            const isIncome = !tx.type || tx.type === 'Income';
            if (!isActive || !isIncome) return false;
            const txSid = String(tx.studentId || tx.userId || '').trim();
            const txOfficialId = String(tx.officialStudentId || '').trim();
            const txName = String(tx.studentName || '').trim().toLowerCase();
            const txRoll = String(tx.rollNo || tx.rollNumber || '').trim();
            const txClass = String(tx.className || tx.class || '').trim();

            if (sid && txSid === sid) return true;
            if (officialId && (txSid === officialId || txOfficialId === officialId)) return true;
            if (sName && txName === sName && (!sClass || txClass === sClass)) return true;
            if (sRoll && txRoll === sRoll && (!sClass || txClass === sClass)) return true;
            return false;
        });

        // 2. Harvest receipts documented inside student.fees
        const feeReceipts: any[] = [];
        const seenReceipts = new Set(matched.map(t => String(t.receipt || t.receiptNo || t.id)));

        (selectedStudent.fees || []).forEach((f: any) => {
            const paid = Number(f.paidAmount || (f.status === 'paid' ? f.totalFee : 0) || 0);
            const rNo = f.receiptNo;
            if (paid > 0 && rNo && rNo !== '*Auto-Calculated*' && rNo !== '-' && !seenReceipts.has(String(rNo))) {
                seenReceipts.add(String(rNo));
                const totalF = Number(f.totalFee || (paid + Number(f.dueAmount || 0)));
                const dueRem = Number(f.dueAmount !== undefined ? f.dueAmount : Math.max(0, totalF - paid));
                feeReceipts.push({
                    id: `fee_${rNo}_${f.month}`,
                    receipt: rNo,
                    receiptNo: rNo,
                    date: f.paidAt ? (f.paidAt.includes('T') ? formatBSDate(new Date(f.paidAt)) : f.paidAt) : 'Logged',
                    amount: paid,
                    method: f.paymentMethod || 'Cash Desk',
                    particulars: `${f.month} (${f.type || 'Tuition Fee'})`,
                    remarks: f.remarks || 'Cash Receipt Voucher',
                    collectedBy: f.collectedBy || 'Administration Counter',
                    isPartial: dueRem > 0,
                    remainingDue: dueRem,
                    totalDue: totalF,
                    ledgerPageNo: f.ledgerPageNo || ''
                });
            }
        });

        const list = [...matched.map(t => {
            const isPartial = t.isPartial !== undefined ? t.isPartial : ((t.remainingDue !== undefined && Number(t.remainingDue) > 0) || (t.totalDue !== undefined && Number(t.totalDue) > Number(t.amount)));
            return {
                ...t,
                receipt: t.receipt || t.receiptNo || (t.id ? t.id.substring(0, 8) : 'RCP-TX'),
                receiptNo: t.receipt || t.receiptNo || (t.id ? t.id.substring(0, 8) : 'RCP-TX'),
                date: t.date || (t.createdAt ? (t.createdAt.toDate ? formatBSDate(t.createdAt.toDate()) : formatBSDate(new Date(t.createdAt))) : 'Earlier'),
                amount: Number(t.amount || 0),
                method: t.method || t.paymentMethod || 'Cash Desk',
                particulars: t.particulars || t.remarks || (t.months?.length ? `Months: ${t.months.join(', ')}` : (t.feeType || 'Fee Collection')),
                collectedBy: t.collectedBy || 'Principal / Cash Counter',
                isPartial: isPartial,
                remainingDue: t.remainingDue !== undefined ? Number(t.remainingDue) : undefined,
                totalDue: t.totalDue !== undefined ? Number(t.totalDue) : undefined
            };
        }), ...feeReceipts];

        // Sort descending by date
        return list.sort((a, b) => {
            const dateA = a.date || '';
            const dateB = b.date || '';
            return dateB.localeCompare(dateA);
        });
    }, [selectedStudent, transactions]);

    // Filtered transaction list based on user selection (All, Partial Only, Full Only)
    const filteredTransactions = useMemo(() => {
        if (historyFilter === 'partial') {
            return studentTransactions.filter(t => t.isPartial);
        }
        if (historyFilter === 'full') {
            return studentTransactions.filter(t => !t.isPartial);
        }
        return studentTransactions;
    }, [studentTransactions, historyFilter]);

    // Helper to normalize month names
    const normalizeMonth = (m?: string) => {
        if (!m) return '';
        const s = m.trim().toLowerCase();
        if (s.includes('baisak')) return 'Baisakh';
        if (s.includes('jest')) return 'Jestha';
        if (s.includes('asar') || s.includes('ashad')) return 'Asar';
        if (s.includes('shrawan') || s.includes('saun')) return 'Shrawan';
        if (s.includes('bhadra') || s.includes('bhadau')) return 'Bhadra';
        if (s.includes('ashwin') || s.includes('asoj')) return 'Ashwin';
        if (s.includes('kartik')) return 'Kartik';
        if (s.includes('mangsir') || s.includes('mangs')) return 'Mangsir';
        if (s.includes('poush') || s.includes('paush') || s.includes('pus')) return 'Poush';
        if (s.includes('magh')) return 'Magh';
        if (s.includes('falgun') || s.includes('phagun')) return 'Falgun';
        if (s.includes('chaitra') || s.includes('chait')) return 'Chaitra';
        return s;
    };

    // Helper to normalize fee types for robust ledger matching
    const normalizeFeeTypeKey = (t?: string) => {
        if (!t) return 'other';
        const s = t.trim().toLowerCase();
        if (s.includes('tuition')) return 'tuition';
        if (s.includes('transport')) return 'transport';
        if (s.includes('computer')) return 'computer';
        if (s.includes('acad') || s.includes('sport')) return 'academy';
        if (s.includes('exam')) return 'exam';
        if (s.includes('annual')) return 'annual';
        if (s.includes('admis')) return 'admission';
        return s;
    };

    // Construct the 12 months ledger showing every fee item
    const detailedLedger = useMemo(() => {
        if (!selectedStudent) return [];

        const tuitionFee = Number(selectedStudent.monthlyFee || 0);
        const examFee = Number(selectedStudent.examFee || 0);
        const computerFee = Number(selectedStudent.computerFee || (selectedStudent.hasComputer === 'Yes' ? 400 : 0));
        const transportFee = Number(selectedStudent.transportFee || (selectedStudent.hasTransportation === 'Yes' ? 400 : 0));
        const academyFee = Number(selectedStudent.academyFee || (selectedStudent.hasAcademy === 'Yes' ? 300 : 0));
        const otherFee = Number(selectedStudent.otherFee || 0);

        const realFees = selectedStudent.fees || [];

        // Build list for 12 months
        return MONTHS.map((monthName, idx) => {
            const normM = normalizeMonth(monthName);
            const monthRealFees = realFees.filter((f: any) => normalizeMonth(f.month) === normM);

            const standardCategories = [
                { key: 'tuition', name: 'Tuition Fee', base: tuitionFee },
                { key: 'transport', name: 'Transportation Fee', base: transportFee },
                { key: 'computer', name: 'Computer Fee', base: computerFee },
                { key: 'academy', name: 'Academy Fee', base: academyFee },
                { key: 'exam', name: 'Exam Fee', base: examFee },
                { key: 'other', name: 'Other Fee', base: otherFee }
            ];

            const matchedFeeIndices = new Set<number>();
            const itemsWithStatus: any[] = [];

            standardCategories.forEach(cat => {
                // Find all fees in this month matching this category
                const matchingFees: { fee: any; index: number }[] = [];
                monthRealFees.forEach((f: any, fIdx: number) => {
                    if (normalizeFeeTypeKey(f.type) === cat.key) {
                        matchingFees.push({ fee: f, index: fIdx });
                        matchedFeeIndices.add(fIdx);
                    }
                });

                if (matchingFees.length > 0) {
                    // Aggregate across all matching entries for this category
                    const rate = Math.max(cat.base, ...matchingFees.map(m => Number(m.fee.totalFee || 0))) || cat.base;
                    const seenReceiptKeys = new Set<string>();
                    let rawPaid = 0;
                    matchingFees.forEach(m => {
                        const pf = m.fee;
                        const key = pf.receiptNo || pf.transactionId || pf.id;
                        if (!key || !seenReceiptKeys.has(key)) {
                            if (key) seenReceiptKeys.add(key);
                            const p = Number(pf.paidAmount !== undefined ? pf.paidAmount : (pf.status === 'paid' ? (pf.totalFee || rate) : 0));
                            rawPaid += p;
                        }
                    });
                    const paid = Math.min(rate, rawPaid);
                    const due = Math.max(0, rate - paid);
                    const status = paid >= rate ? 'paid' : (paid > 0 ? 'partial' : 'due');
                    const receipts = matchingFees
                        .map(m => m.fee.receiptNo)
                        .filter(Boolean)
                        .filter((v, i, a) => a.indexOf(v) === i);
                    const receiptNo = receipts.length > 0 ? receipts.join(', ') : (status === 'paid' ? 'PAID' : '-');
                    const remarks = matchingFees
                        .map(m => m.fee.remarks)
                        .filter(Boolean)
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .join('; ');

                    itemsWithStatus.push({
                        id: matchingFees[0].fee.id || `${normM}_${cat.key}`,
                        name: matchingFees[0].fee.type || cat.name,
                        amount: rate,
                        paidAmount: paid,
                        dueAmount: due,
                        status: status,
                        receiptNo: receiptNo,
                        isDummy: false,
                        remarks: remarks || ''
                    });
                } else if (cat.base > 0) {
                    itemsWithStatus.push({
                        id: `${normM}_${cat.key}_base`,
                        name: cat.name,
                        amount: cat.base,
                        paidAmount: 0,
                        dueAmount: cat.base,
                        status: 'due',
                        receiptNo: '-',
                        isDummy: false,
                        remarks: ''
                    });
                }
            });

            // Include any additional real fees for this month (e.g. Annual, Admission, etc.) that were not in standard categories
            monthRealFees.forEach((f: any, fIdx: number) => {
                if (matchedFeeIndices.has(fIdx)) return;
                // Avoid adding duplicate if it maps to one of the standard categories already processed
                const normKey = normalizeFeeTypeKey(f.type);
                if (standardCategories.some(cat => cat.key === normKey)) return;

                const rate = Number(f.totalFee || 0);
                if (rate <= 0) return;
                const paid = Number(f.paidAmount !== undefined ? f.paidAmount : (f.status === 'paid' ? rate : 0));
                const due = Number(f.dueAmount !== undefined ? f.dueAmount : Math.max(0, rate - paid));
                const status = f.status || (paid >= rate ? 'paid' : (paid > 0 ? 'partial' : 'due'));
                itemsWithStatus.push({
                    id: f.id || `${normM}_extra_${fIdx}_${normKey}`,
                    name: f.type || 'Additional Fee',
                    amount: rate,
                    paidAmount: paid,
                    dueAmount: due,
                    status: status,
                    receiptNo: f.receiptNo || (status === 'paid' ? 'PAID' : '-'),
                    isDummy: false,
                    remarks: f.remarks || ''
                });
            });

            const activeItems = itemsWithStatus.filter(it => it.amount > 0);
            const totalBilled = activeItems.reduce((acc, it) => acc + it.amount, 0);
            const totalPaid = activeItems.reduce((acc, it) => acc + it.paidAmount, 0);
            const totalDue = Math.max(0, totalBilled - totalPaid);

            // Strict Status Logic: ALL active items must be paid with 0 due to be FULLY PAID
            const allPaid = activeItems.length > 0 && activeItems.every(it => it.status === 'paid' || it.dueAmount === 0);
            const anyPaid = activeItems.some(it => it.paidAmount > 0 || it.status === 'paid' || it.status === 'partial');

            const isFullyPaid = allPaid;
            const isPartial = !allPaid && anyPaid;

            return {
                month: monthName,
                monthIndex: idx,
                totalBilled,
                totalPaid,
                totalDue,
                isFullyPaid,
                isPartial,
                items: itemsWithStatus
            };
        });
    }, [selectedStudent]);

    // Compute key summary totals for selected student
    const summaryMetrics = useMemo(() => {
        if (!selectedStudent) {
            return {
                totalAmountDue: 0,
                totalAmountPaid: 0,
                remainingOutstandingBalance: 0,
                percentPaid: 0,
                totalTransactionsCount: 0,
                partialTransactionsCount: 0,
                fullTransactionsCount: 0
            };
        }

        // Total Billed calculation from 12-month curriculum + any special fees
        const totalBilled = detailedLedger.reduce((sum, r) => sum + r.totalBilled, 0);
        
        // Total payments collected to date across all receipts
        const totalPaidFromLedger = detailedLedger.reduce((sum, r) => sum + r.totalPaid, 0);
        const totalPaidFromTx = studentTransactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const totalPaid = Math.max(totalPaidFromLedger, totalPaidFromTx);

        // Remaining balance
        const remainingDue = Math.max(0, totalBilled - totalPaid);
        const percentPaid = totalBilled > 0 ? Math.min(100, Math.round((totalPaid / totalBilled) * 100)) : 0;

        const partialCount = studentTransactions.filter(t => t.isPartial).length;
        const fullCount = studentTransactions.filter(t => !t.isPartial).length;

        return {
            totalAmountDue: totalBilled,
            totalAmountPaid: totalPaid,
            remainingOutstandingBalance: remainingDue,
            percentPaid,
            totalTransactionsCount: studentTransactions.length,
            partialTransactionsCount: partialCount,
            fullTransactionsCount: fullCount
        };
    }, [selectedStudent, detailedLedger, studentTransactions]);

    // Handle opening cash receipt modal
    const handleViewReceipt = (tx: any) => {
        if (!selectedStudent) return;
        const currentNepaliYear = getBSYearMonthDate().year || 2081;
        const receiptData: CashReceiptData = {
            receiptNo: tx.receiptNo || tx.receipt || (tx.id ? `RCP-TXN-${tx.id.substring(0, 8)}` : 'RCP-RECORD'),
            date: tx.date || formatBSDate(new Date()),
            englishDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
            academicYear: `${currentNepaliYear}-${currentNepaliYear + 1} BS`,
            studentName: selectedStudent.fullName || selectedStudent.name,
            studentId: selectedStudent.studentId || selectedStudent.id || '-',
            className: selectedStudent.class || '-',
            rollNo: selectedStudent.rollNumber || '-',
            guardianName: selectedStudent.guardianName || selectedStudent.fatherName || '-',
            billingPeriod: tx.particulars || 'Fee Payment',
            baseTuition: Number(tx.amount || 0),
            additionalCharges: [],
            discounts: [],
            totalPayable: Number(tx.totalDue || tx.amount || 0),
            cashReceived: Number(tx.amount || 0),
            changeReturned: 0,
            cashierName: tx.collectedBy || 'Cash Counter',
            remarks: tx.remarks || (tx.isPartial ? `Partial Payment Installment | Collected by: ${tx.collectedBy || 'Cash Desk'}` : `Full Settlement | Collected by: ${tx.collectedBy || 'Cash Desk'}`),
            handwrittenLedgerNo: tx.ledgerPageNo || undefined
        };
        setSelectedReceiptData(receiptData);
        setShowReceiptModal(true);
    };

    // Handle printing single month invoice detail
    const printMonthDetail = (monthData: any) => {
        if (!selectedStudent) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        let itemsHtml = '';
        monthData.items.forEach((item: any) => {
            if (item.amount > 0) {
                itemsHtml += `
                    <tr>
                        <td style="border: 1px solid #e5e7eb; padding: 10px; font-size: 13px;">${item.name}</td>
                        <td style="border: 1px solid #e5e7eb; padding: 10px; font-size: 13px; text-align: right; font-weight: bold;">NRs. ${item.amount.toLocaleString()}</td>
                        <td style="border: 1px solid #e5e7eb; padding: 10px; font-size: 13px; text-align: center;">
                            <span style="font-weight: bold; font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: ${item.status === 'paid' ? '#dcfce7; color: #15803d;' : '#fee2e2; color: #b91c1c;'}">
                                ${item.status === 'paid' ? 'PAID' : (item.status === 'partial' ? 'PARTIAL' : 'NOT DONE')}
                            </span>
                        </td>
                        <td style="border: 1px solid #e5e7eb; padding: 10px; font-size: 13px; text-align: right; font-family: monospace;">${item.receiptNo}</td>
                    </tr>
                `;
            }
        });

        printWindow.document.write(`
            <html>
            <head><title>Ledger - ${selectedStudent.name} (${monthData.month})</title></head>
            <body onload="window.print();" style="font-family: Arial, sans-serif; padding: 30px; color: #1f2937;">
                <div style="max-width: 650px; margin: 0 auto; border: 2px solid #e5e7eb; padding: 25px; border-radius: 12px;">
                    <div style="text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 20px;">
                        <img src="/logo.png" style="width: 55px; height: 55px; object-fit: contain; margin-bottom: 4px;" onerror="this.style.display='none'" />
                        <h2 style="margin: 0; color: #1e3a8a; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">SHIKSHANTAR ACADEMY</h2>
                        <p style="margin: 3px 0; font-size: 11px; color: #4b5563; font-weight: 500;">Bastipur, Karjanha-05, Siraha, Nepal &bull; Regd: 1482/071</p>
                        <p style="margin: 2px 0; font-size: 10px; color: #6b7280;">Phone: +977 9709867048, +977 9807790805 &bull; Email: academyshikshantar@gmail.com</p>
                        <p style="margin: 6px 0 0 0; font-size: 12px; font-weight: 800; color: #10b981; text-transform: uppercase;">OFFICIAL MONTHLY FEE STATEMENT: ${monthData.month.toUpperCase()}</p>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 13px;">
                        <div>
                            <strong>Student:</strong> ${selectedStudent.name}<br/>
                            <strong>Student ID:</strong> ${selectedStudent.studentId || '-'}<br/>
                            <strong>Class:</strong> ${selectedStudent.class} | <strong>Roll:</strong> ${selectedStudent.rollNumber || '-'}
                        </div>
                        <div style="text-align: right;">
                            <strong>Guardian:</strong> ${selectedStudent.guardianName || '-'}<br/>
                            <strong>Phone:</strong> ${selectedStudent.guardianPhone || '-'}<br/>
                            <strong>Generated Date:</strong> ${new Date().toLocaleDateString()}
                        </div>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                        <thead>
                            <tr style="background-color: #f3f4f6;">
                                <th style="border: 1px solid #e5e7eb; padding: 10px; text-align: left; font-size: 11px; text-transform: uppercase;">Particular Fee Item</th>
                                <th style="border: 1px solid #e5e7eb; padding: 10px; text-align: right; font-size: 11px; text-transform: uppercase;">Amount</th>
                                <th style="border: 1px solid #e5e7eb; padding: 10px; text-align: center; font-size: 11px; text-transform: uppercase;">Status</th>
                                <th style="border: 1px solid #e5e7eb; padding: 10px; text-align: right; font-size: 11px; text-transform: uppercase;">Receipt No</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>

                    <div style="border-top: 1px dashed #cccccc; padding-top: 15px; display: flex; justify-content: space-between; align-items: center; font-weight: bold;">
                        <span style="font-size: 13px; color: #4b5563;">TOTAL MONTHLY PAID:</span>
                        <span style="font-size: 16px; color: #10b981;">NRs. ${monthData.totalPaid.toLocaleString()}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; margin-top: 8px;">
                        <span style="font-size: 13px; color: #b91c1c;">OUTSTANDING DUE:</span>
                        <span style="font-size: 16px; color: #b91c1c;">NRs. ${(monthData.totalBilled - monthData.totalPaid).toLocaleString()}</span>
                    </div>

                    <div style="margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; font-style: italic;">
                        <div>Official Verified Record &bull; Shikshantar Academy</div>
                        <div>Authorized Signature</div>
                    </div>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    // Print full comprehensive audited ledger
    const printFullLedger = () => {
        if (!selectedStudent) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        let html = `
            <html>
            <head>
                <title>Audited Ledger - ${selectedStudent.name}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; color: #1f2937; margin: 0; }
                    .header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 18px; }
                    .header h2 { margin: 0; color: #1e3a8a; font-size: 20px; text-transform: uppercase; }
                    .header p { margin: 3px 0; font-size: 11px; color: #4b5563; }
                    .summary-grid { display: flex; gap: 15px; margin-bottom: 20px; }
                    .summary-card { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f9fafb; }
                    .summary-card.highlight { background: #ecfdf5; border-color: #a7f3d0; }
                    .summary-card.due { background: #fef2f2; border-color: #fecaca; }
                    .summary-label { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #6b7280; }
                    .summary-val { font-size: 16px; font-weight: bold; margin-top: 4px; font-family: monospace; }
                    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
                    th, td { border: 1px solid #e5e7eb; padding: 8px 10px; }
                    th { background: #f3f4f6; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
                    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; }
                    .badge-paid { background: #d1fae5; color: #065f46; }
                    .badge-partial { background: #fef3c7; color: #92400e; }
                    .badge-due { background: #fee2e2; color: #991b1b; }
                </style>
            </head>
            <body onload="window.print();">
                <div class="header">
                    <img src="/logo.png" style="width: 55px; height: 55px; object-fit: contain; margin-bottom: 4px;" onerror="this.style.display='none'" />
                    <h2>SHIKSHANTAR ACADEMY</h2>
                    <p style="margin: 3px 0; font-size: 11px; color: #4b5563; font-weight: 500;">Bastipur, Karjanha-05, Siraha, Nepal &bull; Regd: 1482/071</p>
                    <p style="margin: 2px 0; font-size: 10px; color: #6b7280;">Phone: +977 9709867048, +977 9807790805 &bull; Email: academyshikshantar@gmail.com</p>
                    <p style="font-weight: 800; color: #1e3a8a; font-size: 12px; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.5px;">OFFICIAL AUDITED STUDENT LEDGER &amp; FINANCIAL STATEMENT</p>
                </div>

                <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 12px; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <div>
                        <strong>Student Name:</strong> ${selectedStudent.name} (ID: ${selectedStudent.studentId || selectedStudent.id})<br/>
                        <strong>Class:</strong> ${selectedStudent.class} &bull; <strong>Roll No:</strong> ${selectedStudent.rollNumber || '-'}
                    </div>
                    <div style="text-align: right;">
                        <strong>Guardian:</strong> ${selectedStudent.guardianName || '-'}<br/>
                        <strong>Statement Date:</strong> ${formatBSDate(new Date())} (${new Date().toLocaleDateString()})
                    </div>
                </div>

                <!-- Summary Section -->
                <div class="summary-grid">
                    <div class="summary-card">
                        <div class="summary-label">Total Amount Due (Gross Billed)</div>
                        <div class="summary-val" style="color: #111827;">NRs. ${summaryMetrics.totalAmountDue.toLocaleString()}</div>
                    </div>
                    <div class="summary-card highlight">
                        <div class="summary-label" style="color: #065f46;">Total Amount Paid to Date</div>
                        <div class="summary-val" style="color: #065f46;">NRs. ${summaryMetrics.totalAmountPaid.toLocaleString()}</div>
                    </div>
                    <div class="summary-card ${summaryMetrics.remainingOutstandingBalance > 0 ? 'due' : 'highlight'}">
                        <div class="summary-label" style="color: ${summaryMetrics.remainingOutstandingBalance > 0 ? '#991b1b' : '#065f46'};">Remaining Outstanding Balance</div>
                        <div class="summary-val" style="color: ${summaryMetrics.remainingOutstandingBalance > 0 ? '#991b1b' : '#065f46'};">NRs. ${summaryMetrics.remainingOutstandingBalance.toLocaleString()}</div>
                    </div>
                </div>

                <h4 style="margin: 18px 0 6px 0; font-size: 12px; text-transform: uppercase; color: #374151;">1. History of Individual Payment Transactions &amp; Partial Installments (${studentTransactions.length})</h4>
                <table>
                    <thead>
                        <tr>
                            <th>Date (B.S.)</th>
                            <th>Receipt / Voucher #</th>
                            <th>Particulars / Description</th>
                            <th>Collected By</th>
                            <th>Payment Type</th>
                            <th style="text-align: right;">Amount Paid</th>
                            <th style="text-align: right;">Remaining Due</th>
                            <th>Method</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${studentTransactions.length === 0 ? '<tr><td colspan="8" style="text-align:center; color:#9ca3af; padding: 15px;">No transactions recorded.</td></tr>' : studentTransactions.map(t => `
                            <tr>
                                <td style="font-family: monospace;">${t.date || '-'}</td>
                                <td style="font-family: monospace; font-weight: bold;">${t.receiptNo || t.receipt || '-'}</td>
                                <td>${t.particulars || 'Fee Collection'}</td>
                                <td>${t.collectedBy || 'Administration Counter'}</td>
                                <td>
                                    <span class="badge ${t.isPartial ? 'badge-partial' : 'badge-paid'}">
                                        ${t.isPartial ? 'PARTIAL PAYMENT' : 'FULL SETTLEMENT'}
                                    </span>
                                </td>
                                <td style="text-align: right; font-weight: bold; font-family: monospace; color: #065f46;">NRs. ${Number(t.amount || 0).toLocaleString()}</td>
                                <td style="text-align: right; font-family: monospace; color: #991b1b;">${t.remainingDue !== undefined ? `NRs. ${Number(t.remainingDue).toLocaleString()}` : '-'}</td>
                                <td>${t.method || 'Cash'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <h4 style="margin: 20px 0 6px 0; font-size: 12px; text-transform: uppercase; color: #374151;">2. 12-Month Academic Fee Ledger Schedule</h4>
                <table>
                    <thead>
                        <tr>
                            <th>Month</th>
                            <th style="text-align: right;">Billed Amount</th>
                            <th style="text-align: right;">Paid Amount</th>
                            <th style="text-align: right;">Outstanding Due</th>
                            <th style="text-align: center;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${detailedLedger.map(r => `
                            <tr>
                                <td><strong>${r.month}</strong></td>
                                <td style="text-align: right; font-family: monospace;">NRs. ${r.totalBilled.toLocaleString()}</td>
                                <td style="text-align: right; font-family: monospace; color: #065f46; font-weight: bold;">NRs. ${r.totalPaid.toLocaleString()}</td>
                                <td style="text-align: right; font-family: monospace; color: ${r.totalDue > 0 ? '#991b1b' : '#6b7280'};">NRs. ${r.totalDue.toLocaleString()}</td>
                                <td style="text-align: center;">
                                    <span class="badge ${r.isFullyPaid ? 'badge-paid' : (r.isPartial ? 'badge-partial' : 'badge-due')}">
                                        ${r.isFullyPaid ? 'FULLY PAID' : (r.isPartial ? 'PARTIAL PAYMENT' : 'DUE / UNPAID')}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div style="margin-top: 40px; display: flex; justify-content: space-between; font-size: 11px; font-style: italic; color: #6b7280;">
                    <div>System Generated Statement &bull; Shikshantar Academy Finance System</div>
                    <div>Accountant / Administrator Signature</div>
                </div>
            </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    return (
        <div className="space-y-6">
            {/* Header Title Bar */}
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-indigo-600" /> Student Detailed Ledger &amp; Transaction History
                    </h2>
                    <p className="text-xs text-gray-400 font-medium">
                        Complete student billing summary, outstanding balances, and audited partial payment transaction log
                    </p>
                </div>
                {selectedStudent && (
                    <div className="flex items-center gap-2 flex-wrap">
                        {onRefresh && (
                            <button
                                onClick={onRefresh}
                                className="bg-slate-50 hover:bg-slate-100 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 border border-slate-200"
                                title="Refresh data"
                            >
                                <RefreshCw className="w-3.5 h-3.5" /> Refresh
                            </button>
                        )}
                        <button 
                            onClick={() => setShowReconciliationModal(true)}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                            title="Open Billing Coverage Matrix & Audit"
                        >
                            <Layers className="w-4 h-4 text-indigo-600" /> Coverage Matrix &amp; Audit
                        </button>
                        <button 
                            onClick={printFullLedger}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm hover:shadow active:scale-95"
                        >
                            <Printer className="w-4 h-4" /> Print Complete Statement
                        </button>
                    </div>
                )}
            </div>

            {/* Quick Search & Filter Panel with Compact Student Selector */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Filter By Class Level</label>
                        <select 
                            value={selectedClass}
                            onChange={(e) => {
                                setSelectedClass(e.target.value);
                                setSelectedStudentId(null);
                            }}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                        >
                            <option value="">All Classes ({students.length} Students)</option>
                            {classes.map(c => <option key={c} value={c}>Class {c}</option>)}
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Search Student by Name, ID, or Roll Number</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                            <input 
                                type="text"
                                placeholder="Type student name, roll number, or student ID..."
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setSelectedStudentId(null);
                                }}
                                className="pl-10 pr-4 py-2.5 w-full bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                            />
                        </div>
                    </div>
                </div>

                {/* Compact Student Selector Bar */}
                <div className="pt-3.5 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-indigo-600" />
                            <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">Student Directory / Selector</span>
                        </div>
                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                            {filteredStudents.length} {filteredStudents.length === 1 ? 'student found' : 'students found'}
                        </span>
                    </div>

                    {filteredStudents.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-[165px] overflow-y-auto custom-scrollbar p-0.5">
                            {filteredStudents.map(student => {
                                const isSelected = selectedStudent?.id === student.id;
                                const studentFees = student.fees || [];
                                const hasDue = studentFees.some((f: any) => f.status === 'due' || f.status === 'partial');

                                return (
                                    <button
                                        key={student.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedStudentId(student.id);
                                            if (onSelectStudent) onSelectStudent(student.id);
                                        }}
                                        className={`p-3 rounded-xl text-left transition-all flex items-center justify-between border cursor-pointer ${
                                            isSelected 
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-600/30' 
                                                : 'bg-slate-50 hover:bg-slate-100/90 text-slate-800 border-slate-200/80 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1 pr-2">
                                            <div className="flex items-center gap-1.5">
                                                <h4 className={`font-bold text-xs truncate ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                                                    {student.name}
                                                </h4>
                                                {hasDue && (
                                                    <span className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-amber-300' : 'bg-amber-500'}`} title="Has pending dues"></span>
                                                )}
                                            </div>
                                            <p className={`text-[10px] font-medium mt-0.5 truncate ${isSelected ? 'text-indigo-100' : 'text-gray-500'}`}>
                                                Class <span className="font-bold">{student.class}</span> &bull; Roll: <span className="font-mono font-bold">{student.rollNumber || '-'}</span> &bull; ID: <span className="font-mono">{student.studentId || student.id.slice(0, 6)}</span>
                                            </p>
                                        </div>
                                        <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isSelected ? 'text-white translate-x-0.5' : 'text-gray-300'}`} />
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-4 text-center text-gray-400 font-bold text-xs italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            No matching students found. Adjust search or class filter.
                        </div>
                    )}
                </div>
            </div>

            {/* Comprehensive Student Ledger Full-Width Workspace */}
            <div className="w-full space-y-6">
                {selectedStudent ? (
                    <div className="space-y-6">
                        {/* Profile Spotlight Banner */}
                        <div className="bg-gradient-to-br from-[#111827] via-[#1e293b] to-[#0f172a] rounded-3xl p-6 text-white shadow-md relative overflow-hidden">
                            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <div className="bg-indigo-500/20 text-indigo-200 border border-indigo-400/20 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full inline-block mb-2">
                                        ACTIVE STUDENT ACCOUNT
                                    </div>
                                    <h3 className="text-xl md:text-2xl font-black tracking-tight">{selectedStudent.name}</h3>
                                    <div className="text-indigo-200/90 text-xs font-semibold mt-1.5 flex flex-wrap items-center gap-2">
                                        <span>Roll: <strong className="text-white font-mono bg-indigo-950/70 px-1.5 py-0.5 rounded">{selectedStudent.rollNumber || '-'}</strong></span>
                                        <span>&bull;</span>
                                        <span>Student ID: <strong className="text-white font-mono bg-indigo-950/70 px-1.5 py-0.5 rounded">{selectedStudent.studentId || selectedStudent.id}</strong></span>
                                        <span>&bull;</span>
                                        <span>Class: <strong className="text-white bg-indigo-950/70 px-1.5 py-0.5 rounded">Class {selectedStudent.class}</strong></span>
                                        {selectedStudent.guardianName && (
                                            <>
                                                <span>&bull;</span>
                                                <span>Guardian: <strong className="text-white">{selectedStudent.guardianName}</strong></span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10 space-y-1 min-w-[170px] text-right font-sans">
                                    <span className="block text-[9px] font-black text-indigo-200 uppercase tracking-wider">MONTHLY BASE FEE</span>
                                    <strong className="text-xl font-black text-emerald-400 font-mono">
                                        NRs. {(Number(selectedStudent.monthlyFee || 0)).toLocaleString()}
                                    </strong>
                                    <span className="block text-[10px] text-indigo-200/80">Per Month Standard</span>
                                </div>
                            </div>
                            <div className="absolute top-0 right-0 p-8 opacity-5">
                                <UserCheck className="w-48 h-48" />
                            </div>
                        </div>

                        {/* Key Financial Summary Section: Total Due, Total Paid to Date, Remaining Outstanding Balance */}
                            <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm space-y-4">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-gray-100">
                                    <div>
                                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-wide flex items-center gap-2">
                                            <Wallet className="w-4 h-4 text-indigo-600" />
                                            Financial Account Summary
                                        </h4>
                                        <p className="text-xs text-gray-500 font-medium mt-0.5">
                                            Consolidated breakdown of billed dues, receipts collected, and current net balance
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                            summaryMetrics.remainingOutstandingBalance === 0 
                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                                : (summaryMetrics.totalAmountPaid > 0 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-rose-50 text-rose-800 border-rose-200')
                                        }`}>
                                            {summaryMetrics.remainingOutstandingBalance === 0 
                                                ? 'Account Fully Cleared ✓' 
                                                : (summaryMetrics.totalAmountPaid > 0 ? 'Partial Balance Pending' : 'No Payments Made')}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    {/* 1. Total Amount Due */}
                                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4.5 shadow-xs">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Total Amount Due</span>
                                            <span className="p-1.5 bg-slate-200/60 rounded-lg text-slate-700">
                                                <DollarSign className="w-3.5 h-3.5" />
                                            </span>
                                        </div>
                                        <p className="text-2xl font-black text-slate-900 mt-2 font-mono">
                                            NRs. {summaryMetrics.totalAmountDue.toLocaleString()}
                                        </p>
                                        <p className="text-[11px] text-slate-500 font-medium mt-1">
                                            Gross charges across all 12 academic months
                                        </p>
                                    </div>

                                    {/* 2. Total Amount Paid to Date */}
                                    <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4.5 shadow-xs">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Total Amount Paid to Date</span>
                                            <span className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700">
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                            </span>
                                        </div>
                                        <p className="text-2xl font-black text-emerald-700 mt-2 font-mono">
                                            NRs. {summaryMetrics.totalAmountPaid.toLocaleString()}
                                        </p>
                                        <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                                            {summaryMetrics.totalTransactionsCount} receipts logged ({summaryMetrics.partialTransactionsCount} partial installment{summaryMetrics.partialTransactionsCount === 1 ? '' : 's'})
                                        </p>
                                    </div>

                                    {/* 3. Remaining Outstanding Balance */}
                                    <div className={`border rounded-2xl p-4.5 shadow-xs ${
                                        summaryMetrics.remainingOutstandingBalance > 0 
                                            ? 'bg-rose-50/70 border-rose-200/80' 
                                            : 'bg-emerald-50/40 border-emerald-200/50'
                                    }`}>
                                        <div className="flex items-center justify-between">
                                            <span className={`text-[10px] font-black uppercase tracking-wider ${
                                                summaryMetrics.remainingOutstandingBalance > 0 ? 'text-rose-700' : 'text-emerald-700'
                                            }`}>
                                                Remaining Outstanding Balance
                                            </span>
                                            <span className={`p-1.5 rounded-lg ${
                                                summaryMetrics.remainingOutstandingBalance > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                                            }`}>
                                                <AlertCircle className="w-3.5 h-3.5" />
                                            </span>
                                        </div>
                                        <p className={`text-2xl font-black mt-2 font-mono ${
                                            summaryMetrics.remainingOutstandingBalance > 0 ? 'text-rose-700' : 'text-emerald-700'
                                        }`}>
                                            NRs. {summaryMetrics.remainingOutstandingBalance.toLocaleString()}
                                        </p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <div className="flex-1 bg-gray-200 h-2 rounded-full overflow-hidden">
                                                <div 
                                                    className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                                                    style={{ width: `${summaryMetrics.percentPaid}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-[11px] font-black text-gray-700 font-mono">
                                                {summaryMetrics.percentPaid}% Cleared
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Unified 12-Month Academic Coverage Matrix Ribbon */}
                            {(() => {
                                const studentRemitList = (selectedStudent?.remitBills && selectedStudent.remitBills.length > 0)
                                    ? selectedStudent.remitBills
                                    : (remitBills || []).filter((b: any) => b.studentId === selectedStudent.id || (b.studentName === (selectedStudent.fullName || selectedStudent.name) && b.class === selectedStudent.class));
                                const coverage = getStudentBillingCoverage(selectedStudent, academicYear, studentRemitList);

                                return (
                                    <div className="bg-slate-900 text-white rounded-2xl p-4.5 shadow-md border border-slate-800 space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                                            <div className="flex items-center gap-2">
                                                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                                                <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                                                    Academic Year {academicYear} BS Monthly Coverage Matrix
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-300">
                                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400"></span> Fully Paid ({coverage.paidMonthCount})</span>
                                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"></span> Partial ({coverage.partialMonthCount})</span>
                                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400"></span> Billed Due ({coverage.generatedMonthCount - coverage.paidMonthCount - coverage.partialMonthCount})</span>
                                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500"></span> Unbilled ({coverage.missingMonthCount})</span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-1.5 pt-1">
                                            {coverage.months.map((m) => {
                                                const isPaid = m.isPaid || m.monthStatus === 'PAID';
                                                const isPartial = m.isPartial || m.monthStatus === 'PARTIAL';
                                                const isDue = m.isDue || m.monthStatus === 'GENERATED_DUE';

                                                return (
                                                    <button
                                                        key={m.monthName}
                                                        type="button"
                                                        onClick={() => setShowReconciliationModal(true)}
                                                        className={`p-2 rounded-xl text-center transition-all cursor-pointer border text-left flex flex-col justify-between ${
                                                            isPaid 
                                                                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200 hover:bg-emerald-900/60' 
                                                                : isPartial 
                                                                ? 'bg-amber-950/60 border-amber-500/40 text-amber-200 hover:bg-amber-900/60'
                                                                : isDue 
                                                                ? 'bg-red-950/60 border-red-500/40 text-red-200 hover:bg-red-900/60'
                                                                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                                        }`}
                                                        title={`${m.monthName}: ${m.monthStatus} (Due: NRs. ${m.totalDue}) - Click to audit`}
                                                    >
                                                        <div className="text-[11px] font-black">{m.monthName.slice(0, 4)}</div>
                                                        <div className="text-[9px] font-mono mt-1">
                                                            {isPaid ? 'PAID' : isPartial ? `NRs. ${m.totalDue}` : isDue ? `NRs. ${m.totalDue}` : 'Unbilled'}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Remit Bills list */}
                                        {studentRemitList.length > 0 && (
                                            <div className="mt-3 pt-3 border-t border-slate-800/80">
                                                <div className="text-[11px] font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                                                    <Receipt className="w-3.5 h-3.5 text-blue-400" />
                                                    <span>Issued Remittance &amp; Terminal Bills:</span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                                    {studentRemitList.map((b: any, bIdx: number) => {
                                                        const billDue = Number(b.dueAmount !== undefined ? b.dueAmount : (Number(b.totalAmount || b.amount || 0) - Number(b.paidAmount || 0)));
                                                        const isBillPaid = billDue <= 0 || b.status === 'paid';
                                                        return (
                                                            <div key={b.id || bIdx} className="bg-slate-800/90 border border-slate-700 rounded-xl p-2.5 flex items-center justify-between gap-2">
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-white truncate">{b.title || `Bill #${b.billNo || b.id}`}</p>
                                                                    <p className="text-[10px] text-slate-400 truncate">
                                                                        {b.billingPeriod || 'Terminal'} &bull; Due: <span className={`font-mono font-bold ${isBillPaid ? 'text-emerald-400' : 'text-amber-400'}`}>NRs. {billDue.toLocaleString()}</span>
                                                                    </p>
                                                                </div>
                                                                {isBillPaid && (
                                                                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full shrink-0">
                                                                        Settled ✓
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Section 1: History List of Each Individual Partial Payment Transaction */}
                            <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm space-y-4">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                    <div>
                                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-wide flex items-center gap-2">
                                            <History className="w-4 h-4 text-blue-600" />
                                            Payment Receipts &amp; Partial Installment History ({studentTransactions.length})
                                        </h4>
                                        <p className="text-xs text-gray-500 font-medium mt-0.5">
                                            Detailed audit trail of all counter receipts, partial payment vouchers, and collector names
                                        </p>
                                    </div>

                                    {/* History Filter Tabs */}
                                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0 text-xs font-bold">
                                        <button
                                            type="button"
                                            onClick={() => setHistoryFilter('all')}
                                            className={`px-3 py-1.5 rounded-lg transition-all ${historyFilter === 'all' ? 'bg-white text-indigo-700 shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'}`}
                                        >
                                            All ({studentTransactions.length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setHistoryFilter('partial')}
                                            className={`px-3 py-1.5 rounded-lg transition-all ${historyFilter === 'partial' ? 'bg-amber-500 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'}`}
                                        >
                                            Partial Only ({summaryMetrics.partialTransactionsCount})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setHistoryFilter('full')}
                                            className={`px-3 py-1.5 rounded-lg transition-all ${historyFilter === 'full' ? 'bg-emerald-600 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'}`}
                                        >
                                            Full ({summaryMetrics.fullTransactionsCount})
                                        </button>
                                    </div>
                                </div>

                                {/* Transactions Table */}
                                <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto custom-scrollbar pb-1 text-sm">
                                    <table className="w-full text-left min-w-[780px]">
                                        <thead className="bg-gray-50/90 border-b border-gray-200 text-[10px] text-gray-500 uppercase tracking-wider font-black">
                                            <tr>
                                                <th className="p-3 pl-4">Date (B.S.)</th>
                                                <th className="p-3">Receipt / Voucher #</th>
                                                <th className="p-3">Particulars &amp; Remarks</th>
                                                <th className="p-3">Collected By</th>
                                                <th className="p-3 text-center">Payment Classification</th>
                                                <th className="p-3 text-right">Amount Paid (Dr)</th>
                                                <th className="p-3 text-right">Remaining Balance</th>
                                                <th className="p-3 text-center">Method</th>
                                                <th className="p-3 text-center">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 text-xs">
                                            {filteredTransactions.length === 0 ? (
                                                <tr>
                                                    <td colSpan={9} className="p-8 text-center text-gray-400 font-bold">
                                                        {historyFilter === 'partial' 
                                                            ? 'No partial installment payments found for this student.' 
                                                            : 'No payment transaction vouchers logged yet.'}
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredTransactions.map((tx: any, tIdx: number) => {
                                                    const isPartial = tx.isPartial;
                                                    const collector = tx.collectedBy || 'Administration Counter';

                                                    return (
                                                        <tr key={tx.id || tx.receiptNo || `${tx.date}_${tIdx}`} className={`hover:bg-gray-50/80 transition-colors ${isPartial ? 'bg-amber-50/20' : ''}`}>
                                                            <td className="p-3 pl-4 font-mono font-bold text-gray-700">
                                                                {tx.date || '-'}
                                                            </td>
                                                            <td className="p-3 font-mono font-black text-gray-900">
                                                                {tx.receiptNo || tx.receipt || '-'}
                                                            </td>
                                                            <td className="p-3 text-gray-700 font-medium">
                                                                <div className="font-bold text-gray-900">{tx.particulars || 'Fee Collection'}</div>
                                                                {tx.remarks && tx.remarks !== tx.particulars && (
                                                                    <div className="text-[10px] text-gray-500 font-medium mt-0.5">{tx.remarks}</div>
                                                                )}
                                                            </td>
                                                            <td className="p-3">
                                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                                    {collector}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 text-center">
                                                                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                                                    isPartial 
                                                                        ? 'bg-amber-50 text-amber-800 border-amber-300' 
                                                                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                                }`}>
                                                                    {isPartial ? 'PARTIAL PAYMENT' : 'FULL SETTLEMENT'}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 text-right font-mono font-black text-emerald-700">
                                                                NRs. {Number(tx.amount || 0).toLocaleString()}
                                                            </td>
                                                            <td className="p-3 text-right font-mono font-bold text-rose-600">
                                                                {tx.remainingDue !== undefined ? `NRs. ${Number(tx.remainingDue).toLocaleString()}` : '-'}
                                                            </td>
                                                            <td className="p-3 text-center text-[11px] font-semibold text-gray-600">
                                                                {tx.method || 'Cash'}
                                                            </td>
                                                            <td className="p-3 text-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleViewReceipt(tx)}
                                                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-black transition-all border border-indigo-200 active:scale-95"
                                                                    title="View and Print Receipt Voucher"
                                                                >
                                                                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                                                                    <span>Voucher</span>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Section 2: 12-Month Academic Schedule & Itemized Fee Breakdown */}
                            <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm space-y-4">
                                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                                    <div>
                                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-wide flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-emerald-600" />
                                            12-Month Academic Curriculum &amp; Fee Status
                                        </h4>
                                        <p className="text-xs text-gray-500 font-medium mt-0.5">
                                            Month-by-month status of tuition, exam, computer, and transport fees
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {detailedLedger.map((row) => (
                                        <div 
                                            key={row.month} 
                                            className={`bg-white rounded-2xl border p-4.5 space-y-3.5 hover:shadow-xs transition-all flex flex-col justify-between ${
                                                row.isFullyPaid 
                                                    ? 'border-emerald-200 bg-emerald-50/10' 
                                                    : (row.isPartial ? 'border-amber-300 bg-amber-50/10' : 'border-gray-200')
                                            }`}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h4 className="font-black text-slate-800 text-sm tracking-wide">{row.month}</h4>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Academic Month</p>
                                                </div>
                                                {row.isFullyPaid ? (
                                                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                        FULLY PAID ✓
                                                    </span>
                                                ) : row.isPartial ? (
                                                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                                                        PARTIAL PAYMENT
                                                    </span>
                                                ) : (
                                                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200/50">
                                                        UNPAID DUE
                                                    </span>
                                                )}
                                            </div>

                                            {/* List of Fee Items for this Month */}
                                            <div className="bg-slate-50 rounded-xl p-3 divide-y divide-gray-100 text-xs font-bold text-gray-700">
                                                {row.items.filter(item => item.amount > 0).map((item, itemIdx) => (
                                                    <div key={item.id || `${row.month}_${item.name}_${itemIdx}`} className="py-2 flex justify-between items-center first:pt-0 last:pb-0">
                                                        <div>
                                                            <span className="block text-[11px] text-gray-800 leading-none">{item.name}</span>
                                                            <span className="text-[9px] text-gray-400 font-mono font-normal">RCP: {item.receiptNo}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-slate-700 font-bold font-mono">NRs. {item.amount.toLocaleString()}</span>
                                                            <span className={`w-2 h-2 rounded-full ${item.status === 'paid' ? 'bg-emerald-500' : (item.status === 'partial' ? 'bg-amber-500' : 'bg-red-500')}`} title={item.status}></span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="pt-2 border-t border-dashed border-gray-200 flex justify-between items-center">
                                                <div className="text-xs">
                                                    <div className="flex items-center gap-3">
                                                        <div>
                                                            <span className="text-slate-400 text-[10px] font-medium block">Paid</span>
                                                            <span className="text-emerald-700 font-black font-mono">NRs. {row.totalPaid.toLocaleString()}</span>
                                                        </div>
                                                        {row.totalDue > 0 && (
                                                            <div>
                                                                <span className="text-rose-400 text-[10px] font-medium block">Due</span>
                                                                <span className="text-rose-600 font-black font-mono">NRs. {row.totalDue.toLocaleString()}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => printMonthDetail(row)}
                                                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-1 shrink-0 active:scale-95"
                                                >
                                                    <Printer className="w-3.5 h-3.5" /> Details
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white border border-dashed border-gray-300 rounded-[2rem] p-12 text-center text-gray-400 space-y-4 shadow-sm flex flex-col justify-center items-center py-20">
                            <FileText className="w-16 h-16 text-slate-300" />
                            <div>
                                <h3 className="font-extrabold text-slate-700 text-base uppercase tracking-tight">No student selected</h3>
                                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                                    Please search or select a student from the directory above to review their full financial summary, outstanding balances, and payment receipt history.
                                </p>
                            </div>
                        </div>
                    )}
            </div>

            {/* Cash Receipt Modal for viewing vouchers */}
            <CashReceiptModal 
                isOpen={showReceiptModal}
                onClose={() => setShowReceiptModal(false)}
                receipt={selectedReceiptData}
            />

            {/* Billing Coverage Reconciliation & Audit Modal */}
            {showReconciliationModal && selectedStudent && (
                <BillingCoverageReconciliationModal
                    isOpen={showReconciliationModal}
                    onClose={() => setShowReconciliationModal(false)}
                    students={students}
                    currentAcademicYear={academicYear}
                    remitBills={remitBills}
                    initialStudentId={selectedStudent.id}
                />
            )}
        </div>
    );
}
