import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db, auth, handleFirestoreError, OperationType } from '../../firebase';
import { collection, doc, writeBatch, serverTimestamp, query, where, getDocs, setDoc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Search, Loader2, Download, Printer, Plus, X, Receipt, Zap, BookOpen, Banknote, Bell, FileText, Table, AlertCircle, Layers, ShieldCheck, CheckCircle2, ChevronDown, ChevronRight, ChevronsUpDown, Info } from 'lucide-react';
import { formatBSDate, getBSYearMonthDate } from '../../lib/nepaliDate';
import CashReceiptModal, { CashReceiptData } from './CashReceiptModal';
import BillingCoverageReconciliationModal from './BillingCoverageReconciliationModal';
import { FinancialAuditRepairModal } from './FinancialAuditRepairModal';
import { getStudentBillingCoverage, getStudentYearCoverage } from '../../lib/nepaliBillingCoverage';
import { recordLedgerAuditLog, buildAuthoritativeAuditPayload } from '../../lib/auditLogger';
import { NumericInput } from '../common/NumericInput';
import {
    executeCashFeePayment,
    createExcessPaymentRequest,
    calculatePaymentBreakdown,
    parseIntegerAmount,
    handleDigitsOnlyKeyDown,
    sanitizeDigitsOnly
} from '../../lib/cashPaymentEngine';
import { allocateNextDocumentNumber } from '../../lib/documentNumberingEngine';

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
    remitBills = [],
    academicYear = '2083',
    onRefresh,
    prefillPayment,
    onPrefillClear,
    onViewStudentLedger
}: { 
    students: any[]; 
    transactions?: any[]; 
    remitBills?: any[];
    academicYear?: string;
    onRefresh: () => void;
    prefillPayment?: any;
    onPrefillClear?: () => void;
    onViewStudentLedger?: (studentId: string) => void;
}) {
    const [viewMode, setViewMode] = useState<'quick'|'advanced'|'cash'>('quick');
    const [selectedClass, setSelectedClass] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [reconciliationStudent, setReconciliationStudent] = useState<any | null>(null);
    const [auditRepairStudent, setAuditRepairStudent] = useState<any | null>(null);
    const [showBatchAuditModal, setShowBatchAuditModal] = useState<boolean>(false);
    
    // Payment Modal State
    const paymentFormRef = useRef<HTMLDivElement>(null);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
    const [paymentCategory, setPaymentCategory] = useState<'full_due' | '1_month' | '3_months' | '6_months' | 'full_year' | 'custom'>('full_due');
    const [selectedMonth, setSelectedMonth] = useState<string>(MONTHS[getBSYearMonthDate().month] || MONTHS[0]);
    const [cashReceived, setCashReceived] = useState<string>('');
    const [cashReceiptData, setCashReceiptData] = useState<CashReceiptData | null>(null);
    const [excessDecision, setExcessDecision] = useState<'ADVANCE' | 'RETURN' | null>(null);
    const [accountantRemarks, setAccountantRemarks] = useState<string>('');
    const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
    const [additionalCharge, setAdditionalCharge] = useState<string>('');
    const [discount, setDiscount] = useState<string>('');
    const [remarks, setRemarks] = useState<string>('');
    const [handwrittenLedgerNo, setHandwrittenLedgerNo] = useState<string>('');
    const [isHandwrittenMode, setIsHandwrittenMode] = useState(false);
    const [handwrittenReceiptSerial, setHandwrittenReceiptSerial] = useState('');
    const [handwrittenSignVerified, setHandwrittenSignVerified] = useState(false);
    const [customBaseAmount, setCustomBaseAmount] = useState<string>('0');
    const [customNumberOfMonths, setCustomNumberOfMonths] = useState<string>('1');

    const handleCustomMonthsChange = (val: string) => {
        setCustomNumberOfMonths(val);
        const m = parseIntegerAmount(val);
        const defaultMonthly = Math.floor(Number(selectedStudent?.monthlyFee || 1000));
        if (m > 0) {
            setCustomBaseAmount((defaultMonthly * m).toString());
        } else if (val === '') {
            setCustomBaseAmount('0');
        }
    };

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
    const [errorModalMessage, setErrorModalMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState('');

    // Expandable monthly ledger rows state
    const [expandedLedgerMonths, setExpandedLedgerMonths] = useState<Record<string, boolean>>({});

    const toggleMonthExpand = (key: string) => {
        setExpandedLedgerMonths(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const toggleAllMonthsExpand = (monthlyRows: any[], prefix = 'cashier_') => {
        const allOpen = monthlyRows.length > 0 && monthlyRows.every(r => expandedLedgerMonths[`${prefix}${r.month}`]);
        const newState: Record<string, boolean> = { ...expandedLedgerMonths };
        monthlyRows.forEach(r => {
            newState[`${prefix}${r.month}`] = !allOpen;
        });
        setExpandedLedgerMonths(newState);
    };

    const [prefilledBillData, setPrefilledBillData] = useState<{ id: string; billId: string; amount: number; billingPeriod?: string; itemizedCharges?: any[] } | null>(null);

    // Operator & Cashier Dynamic Identity
    const [activeAdminName, setActiveAdminName] = useState<string>('Administrator');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                setActiveAdminName('Administrator');
                return;
            }

            // Priority 1: Direct display name from Google / Firebase Auth
            if (user.displayName && user.displayName.trim()) {
                setActiveAdminName(user.displayName.trim());
                return;
            }

            // Priority 2: Firestore users collection record
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    const uData = userDoc.data();
                    if (uData.fullName && uData.fullName.trim() && uData.fullName !== 'User') {
                        setActiveAdminName(uData.fullName.trim());
                        return;
                    }
                }
            } catch (e) {
                console.warn('Could not read user profile for operator name:', e);
            }

            // Priority 3: Formatted username / email
            if (user.email) {
                const username = user.email.split('@')[0];
                const cleaned = username
                    .replace(/[0-9._-]+/g, ' ')
                    .trim()
                    .split(' ')
                    .filter(Boolean)
                    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
                    .join(' ');
                setActiveAdminName(cleaned || user.email);
            } else {
                setActiveAdminName('Administrator');
            }
        });

        return () => unsubscribe();
    }, []);

    const getOperatorName = () => {
        if (activeAdminName && activeAdminName !== 'Administrator') {
            return activeAdminName;
        }
        const user = auth.currentUser;
        if (user?.displayName && user.displayName.trim()) {
            return user.displayName.trim();
        }
        if (user?.email) {
            const username = user.email.split('@')[0];
            const cleaned = username
                .replace(/[0-9._-]+/g, ' ')
                .trim()
                .split(' ')
                .filter(Boolean)
                .map(s => s.charAt(0).toUpperCase() + s.slice(1))
                .join(' ');
            return cleaned || user.email;
        }
        return activeAdminName || 'Administrator';
    };

    const todayBS = formatBSDate(new Date());
    const todayCollections = (transactions || []).filter(tx => tx.date === todayBS && (tx.status === 'SUCCESS' || tx.status === 'OVERRIDE_SUCCESS'));
    const todayTotal = todayCollections.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    // Close error modal or panels on Escape key press
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (errorModalMessage) {
                    setErrorModalMessage(null);
                } else if (editingLedgerRow) {
                    setEditingLedgerRow(null);
                } else if (showReceiptModal) {
                    setShowReceiptModal(false);
                } else if (selectedStudent) {
                    setSelectedStudent(null);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [errorModalMessage, editingLedgerRow, showReceiptModal, selectedStudent]);

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

                // Map itemized charges from remit bills into base tuition and additionalChargesList
                const prefCharges: any[] = [];
                let tuitionAmount = 0;
                let tuitionMonths = 1;

                if (prefillPayment.itemizedCharges && prefillPayment.itemizedCharges.length > 0) {
                    // Check if there is a Tuition item in the bill
                    const tuitionItem = prefillPayment.itemizedCharges.find((it: any) => 
                        it.name && it.name.toLowerCase().includes('tuition')
                    );
                    if (tuitionItem) {
                        tuitionAmount = Number(tuitionItem.total || 0);
                        tuitionMonths = Number(tuitionItem.months || 1);
                    }

                    prefillPayment.itemizedCharges.forEach((item: any, idx: number) => {
                        // Avoid duplicating tuition in additional charges
                        if (tuitionItem && item === tuitionItem) {
                            return;
                        }
                        prefCharges.push({
                            id: `pref_${idx}_${Date.now()}_${Math.floor(performance.now()).toString(36)}`,
                            purpose: `${item.name}${item.months > 1 ? ` (${item.months} M)` : ''}`,
                            amount: String(item.total)
                        });
                    });
                } else {
                    prefCharges.push({
                        id: `pref_base_${Date.now()}`,
                        purpose: `Remit Bill ${prefillPayment.billId} Dues`,
                        amount: String(prefillPayment.amount)
                    });
                }

                setCustomBaseAmount(String(tuitionAmount));
                setCustomNumberOfMonths(String(tuitionMonths));
                setAdditionalChargesList(prefCharges);

                // Preserve local prefill metadata reference so we can update remitBills on save
                setPrefilledBillData({
                    id: prefillPayment.id,
                    billId: prefillPayment.billId,
                    amount: Number(prefillPayment.amount),
                    billingPeriod: prefillPayment.billingPeriod,
                    coveredMonths: prefillPayment.coveredMonths,
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

    const handlePayRemitBill = (student: any, bill: any) => {
        if (!student || !bill) return;
        setSelectedStudent(student);
        setSelectedClass(student.class || '');
        setSearchTerm(student.fullName || student.name || '');
        setPaymentCategory('custom');
        const billIdentifier = bill.billNo || bill.id || 'Remittance';
        setReceiptTitle(`Remit Bill Clear (${billIdentifier})`);

        const prefCharges: any[] = [];
        let tuitionAmount = 0;
        let tuitionMonths = 1;

        if (bill.itemizedCharges && bill.itemizedCharges.length > 0) {
            const tuitionItem = bill.itemizedCharges.find((it: any) => 
                it.name && it.name.toLowerCase().includes('tuition')
            );
            if (tuitionItem) {
                tuitionAmount = Number(tuitionItem.total || 0);
                tuitionMonths = Number(tuitionItem.months || 1);
            }

            bill.itemizedCharges.forEach((item: any, idx: number) => {
                if (tuitionItem && item === tuitionItem) return;
                prefCharges.push({
                    id: `pref_${idx}_${Date.now()}_${Math.floor(performance.now()).toString(36)}`,
                    purpose: `${item.name}${item.months > 1 ? ` (${item.months} M)` : ''}`,
                    amount: String(item.total)
                });
            });
        } else {
            prefCharges.push({
                id: `pref_base_${Date.now()}`,
                purpose: `Remit Bill ${billIdentifier} Dues`,
                amount: String(bill.dueAmount !== undefined ? bill.dueAmount : (bill.totalAmount || bill.amount || 0))
            });
        }

        setCustomBaseAmount(String(tuitionAmount));
        setCustomNumberOfMonths(String(tuitionMonths));
        setAdditionalChargesList(prefCharges);

        const billTotalDue = Number(bill.dueAmount !== undefined ? bill.dueAmount : (bill.totalAmount || bill.amount || 0));

        setPrefilledBillData({
            id: bill.id,
            billId: billIdentifier,
            amount: billTotalDue,
            billingPeriod: bill.billingPeriod,
            coveredMonths: bill.coveredMonths,
            itemizedCharges: bill.itemizedCharges
        });

        setDiscountsList([]);
        setCashReceived(String(billTotalDue));
        setRemarks(`Clearance of Remit Bill ${billIdentifier} (${bill.billingPeriod || 'Current'})`);
        setViewMode('quick');
        setExpandedStudent(null);

        setSuccessMessage(`Pre-loaded remittance payment info for ${student.fullName || student.name} (Total Due: NRs. ${billTotalDue.toLocaleString()})! Click Save Collection below.`);
        setTimeout(() => {
            setSuccessMessage('');
        }, 8000);

        setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            paymentFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
    };

    // We don't need getMaxMonths / getAutoMonths / toggleMonth anymore, but we can remove them later.

    const getRealisticLedgerRows = (s: any) => {
        const baseFee = Number(s?.monthlyFee || 0);
        const feesList = s?.fees || [];
        const currentMonthIdx = getBSYearMonthDate().month;

        // Map to keep track of consolidated rows by standard month and type
        const consolidatedMap: Record<string, any> = {};

        // Identify months that have granular records (e.g., studentId_Jestha_TuitionFee)
        // so legacy combined documents (e.g., studentId_Jestha) can be safely excluded
        const hasGranularForMonth: Record<string, boolean> = {};
        feesList.forEach((f: any) => {
            if (!f) return;
            const normM = normalizeMonth(f.month);
            if (f.id && f.id.startsWith(`${s.id}_${normM}_`)) {
                hasGranularForMonth[normM] = true;
            }
        });

        // 1. Process explicit records
        feesList.forEach((f: any) => {
            if (!f || (f.status !== 'paid' && f.status !== 'due' && f.status !== 'waived' && f.status !== 'partial')) return;

            const normM = normalizeMonth(f.month);
            const feeType = f.type || 'Tuition Fee';

            // Filter out legacy combined document if granular documents exist for this month
            if (hasGranularForMonth[normM] && f.id === `${s.id}_${normM}`) {
                return;
            }

            const key = `${normM}_${feeType}`;

            const rawPaid = isNaN(Number(f.paidAmount)) ? (f.status === 'paid' ? Number(f.totalFee || 0) : 0) : Number(f.paidAmount);
            const totalFeeVal = isNaN(Number(f.totalFee)) ? (rawPaid + Number(f.dueAmount || 0)) : Number(f.totalFee);
            
            // Mathematical safety cap: paid amount cannot exceed total billed fee
            const paidAmt = totalFeeVal > 0 ? Math.min(totalFeeVal, rawPaid) : rawPaid;
            const rawDue = f.dueAmount !== undefined ? f.dueAmount : Math.max(0, totalFeeVal - paidAmt);
            const dueAmt = isNaN(Number(rawDue)) ? 0 : Math.min(totalFeeVal, Math.max(0, Number(rawDue)));

            // Skip dummy/zero paid entries that clutter the ledger
            if (paidAmt === 0 && dueAmt === 0 && f.status !== 'waived' && (!f.receiptNo || f.receiptNo === '-' || f.receiptNo === '*Auto-Calculated*')) {
                return;
            }

            const calcStatus = f.status === 'waived' 
                ? 'waived' 
                : (dueAmt <= 0 && paidAmt > 0 ? 'paid' : (paidAmt > 0 ? 'partial' : 'due'));

            if (!consolidatedMap[key]) {
                consolidatedMap[key] = {
                    ...f,
                    month: normM,
                    type: feeType,
                    paidAmount: paidAmt,
                    dueAmount: dueAmt,
                    totalFee: totalFeeVal,
                    status: calcStatus,
                    isImplicit: false
                };
            } else {
                // Merge duplicate explicit entries
                const existing = consolidatedMap[key];
                const existingTotalFee = isNaN(Number(existing.totalFee)) ? 0 : Number(existing.totalFee);
                const fTotalFee = isNaN(Number(f.totalFee)) ? 0 : Number(f.totalFee);
                existing.totalFee = Math.max(existingTotalFee, fTotalFee);
                
                // Capped sum of paid amounts (never exceeds totalFee)
                const combinedPaid = (isNaN(Number(existing.paidAmount)) ? 0 : Number(existing.paidAmount)) + paidAmt;
                existing.paidAmount = existing.totalFee > 0 ? Math.min(existing.totalFee, combinedPaid) : combinedPaid;
                existing.dueAmount = Math.max(0, existing.totalFee - existing.paidAmount);
                existing.status = existing.dueAmount <= 0 
                    ? (f.status === 'waived' || existing.status === 'waived' ? 'waived' : 'paid') 
                    : (existing.paidAmount > 0 ? 'partial' : 'due');

                if (f.receiptNo && f.receiptNo !== '*Auto-Calculated*') {
                    existing.receiptNo = existing.receiptNo === '*Auto-Calculated*' || existing.receiptNo === '-' ? f.receiptNo : `${existing.receiptNo}, ${f.receiptNo}`;
                }
                if (f.isManualOverride) {
                    existing.isManualOverride = true;
                    existing.overrideReason = f.overrideReason;
                }
            }
        });

        // 2. Process remit bills:
        // Production Financial Safety Layer - Rule 6: No Double Counting!
        // A remit bill and its underlying monthly fee heads must never be summed together twice.
        // If a remit bill covers months already present in consolidatedMap, annotate those months with bill metadata.
        const studentRemitBills = (s?.remitBills && s.remitBills.length > 0) 
            ? s.remitBills 
            : (remitBills || []).filter((b: any) => b.studentId === s.id || (b.studentName === (s.fullName || s.name) && b.class === s.class));
            
        studentRemitBills.forEach((b: any) => {
            if (!b || (b.status !== 'unpaid' && b.status !== 'partial' && b.status !== 'paid')) return;
            const bTotal = Number(b.totalAmount || b.amount || 0);
            const bPaid = Number(b.paidAmount || (b.status === 'paid' ? bTotal : 0));
            const bDue = Math.max(0, bTotal - bPaid);
            const bPeriod = b.billingPeriod || b.billNo || 'Terminal Remit Bill';

            // Check if covered months are already present in consolidatedMap
            const coveredMonths: string[] = b.coveredMonths || (b.billingPeriod ? getMonthsCovered(b.billingPeriod) : []);
            const hasOverlappingMonths = coveredMonths.some((bm: string) => {
                const normBm = normalizeMonth(bm);
                return Object.keys(consolidatedMap).some(k => k.startsWith(`${normBm}_`));
            });

            if (hasOverlappingMonths) {
                // Charges are already reflected as individual monthly fee heads in the ledger.
                // Annotate the constituent fee heads with the remit bill reference without adding a duplicate bill row.
                coveredMonths.forEach((bm: string) => {
                    const normBm = normalizeMonth(bm);
                    Object.keys(consolidatedMap).forEach(k => {
                        if (k.startsWith(`${normBm}_`)) {
                            consolidatedMap[k].remitBillId = b.id;
                            consolidatedMap[k].remitBillNo = b.billNo || b.id;
                        }
                    });
                });
                return;
            }

            // Standalone remit bill with no constituent monthly fee heads in studentFees
            const key = `Bill_${b.id || b.billNo || bPeriod}`;
            if (!consolidatedMap[key] && bTotal > 0) {
                consolidatedMap[key] = {
                    id: b.id,
                    month: bPeriod,
                    type: b.title || 'Terminal Bill',
                    paidAmount: bPaid,
                    dueAmount: bDue,
                    totalFee: bTotal,
                    status: bDue <= 0 ? 'paid' : (bPaid > 0 ? 'partial' : 'due'),
                    receiptNo: b.billNo || b.receiptNo || '-',
                    remarks: `Bill Ref: ${b.billNo || b.id || ''}`,
                    isRemitBill: true,
                    rawBill: b
                };
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

    // Monthly Presentation Aggregator for Cashier Desk (1 Month = 1 Ledger Row)
    // Preserves 100% itemized accounting in Firestore while grouping fee heads into a clean monthly ledger
    const getMonthlyConsolidatedLedger = (s: any) => {
        if (!s) return { monthlyRows: [], nonMonthlyRows: [] };
        const allRows = getRealisticLedgerRows(s);

        const monthlyGroups: Record<string, {
            month: string;
            totalBilled: number;
            totalPaid: number;
            totalDue: number;
            feeHeads: any[];
            receipts: string[];
        }> = {};

        const nonMonthlyRows: any[] = [];

        allRows.forEach((row: any) => {
            const normM = normalizeMonth(row.month);
            const isStandardMonth = MONTHS.includes(normM);

            if (isStandardMonth && !row.isRemitBill) {
                if (!monthlyGroups[normM]) {
                    monthlyGroups[normM] = {
                        month: normM,
                        totalBilled: 0,
                        totalPaid: 0,
                        totalDue: 0,
                        feeHeads: [],
                        receipts: []
                    };
                }
                const g = monthlyGroups[normM];
                const itemBilled = Number(row.totalFee || (Number(row.paidAmount || 0) + Number(row.dueAmount || 0)) || 0);
                const itemPaid = Number(row.paidAmount || (row.status === 'paid' ? row.totalFee : 0) || 0);
                const itemDue = Number(row.dueAmount !== undefined ? row.dueAmount : Math.max(0, itemBilled - itemPaid));

                g.totalBilled += itemBilled;
                g.totalPaid += itemPaid;
                g.totalDue += itemDue;

                g.feeHeads.push({
                    ...row,
                    itemBilled,
                    itemPaid,
                    itemDue,
                });

                if (row.receiptNo && row.receiptNo !== '-' && row.receiptNo !== '*Auto-Calculated*') {
                    if (!g.receipts.includes(row.receiptNo)) {
                        g.receipts.push(row.receiptNo);
                    }
                }
            } else {
                nonMonthlyRows.push(row);
            }
        });

        const monthlyRows = Object.values(monthlyGroups).map((g) => {
            const allWaived = g.feeHeads.length > 0 && g.feeHeads.every((h: any) => h.status === 'waived');
            let status: 'waived' | 'no_charge' | 'paid' | 'partial' | 'due' = 'due';

            if (allWaived) {
                status = 'waived';
            } else if (g.totalBilled === 0) {
                status = 'no_charge';
            } else if (g.totalDue <= 0 && g.totalPaid > 0) {
                status = 'paid';
            } else if (g.totalPaid > 0 && g.totalPaid < g.totalBilled) {
                status = 'partial';
            } else {
                status = 'due';
            }

            return {
                month: g.month,
                totalBilled: g.totalBilled,
                totalPaid: g.totalPaid,
                totalDue: g.totalDue,
                status,
                feeHeads: g.feeHeads,
                receipts: g.receipts
            };
        });

        // 12-Month strict Nepali Academic Sequence
        monthlyRows.sort((a, b) => {
            const aIdx = MONTHS.indexOf(a.month);
            const bIdx = MONTHS.indexOf(b.month);
            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            return 0;
        });

        return { monthlyRows, nonMonthlyRows };
    };

    const getStudentDue = (s: any) => {
        if (!s) return 0;
        const rows = getRealisticLedgerRows(s);
        const total = rows.reduce((sum, row) => {
            if (row.status !== 'due' && row.status !== 'partial') return sum;
            const amt = Number(row.dueAmount !== undefined ? row.dueAmount : (row.totalFee !== undefined ? row.totalFee : 0));
            return sum + (isNaN(amt) ? 0 : amt);
        }, 0);
        return isNaN(total) ? 0 : total;
    };

    const getStudentPaid = (s: any) => {
        if (!s) return 0;
        const rows = getRealisticLedgerRows(s);
        const total = rows.reduce((sum, row) => {
            const amt = Number(row.paidAmount || (row.status === 'paid' ? row.totalFee : 0) || 0);
            return sum + (isNaN(amt) ? 0 : amt);
        }, 0);
        return isNaN(total) ? 0 : total;
    };

    const getStudentTotalBilled = (s: any) => {
        if (!s) return 0;
        const rows = getRealisticLedgerRows(s);
        const total = rows.reduce((sum, row) => {
            const amt = Number(row.totalFee || (Number(row.paidAmount || 0) + Number(row.dueAmount || 0)) || 0);
            return sum + (isNaN(amt) ? 0 : amt);
        }, 0);
        return isNaN(total) ? 0 : total;
    };

    // Full transaction & partial payment history for transparency
    const getStudentTransactions = (s: any) => {
        if (!s) return [];
        const sid = String(s.id || '').trim();
        const officialId = String(s.studentId || '').trim();
        const sName = String(s.fullName || s.name || '').trim().toLowerCase();
        const sRoll = String(s.rollNumber || s.roll || '').trim();
        const sClass = String(s.class || '').trim();

        // 1. Transactions from global transactions prop
        const matched = (transactions || []).filter((tx: any) => {
            // Strict active-status allowlist: only active successful income receipts are included
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

        // 2. Also harvest receipts documented inside s.fees
        const feeReceipts: any[] = [];
        const seenReceipts = new Set(matched.map(t => String(t.receipt || t.receiptNo || t.id)));

        (s.fees || []).forEach((f: any) => {
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
                    remarks: f.remarks || 'Receipt Voucher',
                    isPartial: dueRem > 0,
                    remainingDue: dueRem,
                    totalDue: totalF,
                    ledgerPageNo: f.ledgerPageNo || ''
                });
            }
        });

        const list = [...matched.map(t => ({
            ...t,
            receipt: t.receipt || t.receiptNo || (t.id ? t.id.substring(0, 8) : 'RCP-TX'),
            receiptNo: t.receipt || t.receiptNo || (t.id ? t.id.substring(0, 8) : 'RCP-TX'),
            date: t.date || (t.createdAt ? (t.createdAt.toDate ? formatBSDate(t.createdAt.toDate()) : formatBSDate(new Date(t.createdAt))) : 'Earlier'),
            amount: Number(t.amount || 0),
            method: t.method || t.paymentMethod || 'Cash Desk',
            particulars: t.remarks || (t.months?.length ? `Months: ${t.months.join(', ')}` : (t.feeType || 'Fee Collection')),
            isPartial: t.isPartial !== undefined ? t.isPartial : ((t.remainingDue !== undefined && Number(t.remainingDue) > 0) || (t.totalDue !== undefined && Number(t.totalDue) > Number(t.amount))),
            remainingDue: t.remainingDue !== undefined ? Number(t.remainingDue) : undefined,
            totalDue: t.totalDue !== undefined ? Number(t.totalDue) : undefined
        })), ...feeReceipts];

        // Sort descending by date
        return list.sort((a, b) => {
            const dateA = a.date || '';
            const dateB = b.date || '';
            return dateB.localeCompare(dateA);
        });
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
        const q = searchTerm.toLowerCase();
        const matchSearch = searchTerm ? (
            String(s.name || '').toLowerCase().includes(q) ||
            String(s.rollNumber || '').toLowerCase().includes(q) ||
            String(s.studentId || '').toLowerCase().includes(q) ||
            String(s.permanentStudentId || '').toLowerCase().includes(q) ||
            String(s.emisNumber || s.studentEmis || '').toLowerCase().includes(q)
        ) : true;
        return matchClass && matchSearch;
    }).sort((a, b) => Number(a.rollNumber || 0) - Number(b.rollNumber || 0));

    const handlePayClick = (student: any) => {
        setErrorMessage('');
        setSuccessMessage('');
        setSelectedStudent(student);
        setPrefilledBillData(null);
        const due = getStudentDue(student);
        const defaultMonthly = Number(student.monthlyFee || 1000);
        const initialAmt = (due > 0 ? due : defaultMonthly).toString();
        setCashReceived(''); // Leave empty so cashier enters the exact physical cash received
        setCustomBaseAmount(initialAmt);
        setCustomNumberOfMonths('1');
        setPaymentCategory('full_due');
        setSelectedMonth(MONTHS[getBSYearMonthDate().month] || MONTHS[0]);
        setAdditionalCharge('');
        setDiscount('');
        setRemarks('');
        setHandwrittenLedgerNo('');
        setIsHandwrittenMode(false);
        setHandwrittenReceiptSerial('');
        setHandwrittenSignVerified(false);
        setExcessDecision(null);
        setAccountantRemarks('');

        // Reset dynamic custom items
        setReceiptTitle('Cash Receipt');
        setAdditionalChargesList([]);
        setDiscountsList([]);
        setHandwrittenRegisteredAmt('');

        setTimeout(() => {
            paymentFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    };

    // Helper to calculate payment category scope based on actual outstanding ledger items
    const getScopeAmountForStudent = (student: any, category: string): number => {
        if (!student) return 0;
        const due = Math.floor(getStudentDue(student));
        const packageMonthly = (
            Number(student.monthlyFee || 0) + 
            Number(student.transportFee || 0) + 
            Number(student.computerFee || 0) + 
            Number(student.academyFee || 0)
        ) || Number(student.monthlyFee || 1000);

        if (category === 'full_due') {
            return due > 0 ? due : packageMonthly;
        }

        const { monthlyRows } = getMonthlyConsolidatedLedger(student);
        const dueRows = monthlyRows.filter(r => r.totalDue > 0);

        if (category === '1_month') {
            if (selectedMonth) {
                const specificMonthRow = monthlyRows.find(r => r.month === selectedMonth);
                if (specificMonthRow && specificMonthRow.totalDue > 0) {
                    return Math.floor(specificMonthRow.totalDue);
                }
            }
            if (dueRows.length > 0) {
                return Math.floor(dueRows[0].totalDue);
            }
            return Math.floor(packageMonthly);
        }

        if (category === '3_months' || category === '6_months' || category === 'full_year') {
            const targetCount = category === '3_months' ? 3 : (category === '6_months' ? 6 : 12);
            if (dueRows.length >= targetCount) {
                return Math.floor(dueRows.slice(0, targetCount).reduce((sum, r) => sum + r.totalDue, 0));
            } else if (dueRows.length > 0) {
                const existingDue = dueRows.reduce((sum, r) => sum + r.totalDue, 0);
                const remainingMonths = targetCount - dueRows.length;
                return Math.floor(existingDue + (remainingMonths * packageMonthly));
            } else {
                return Math.floor(packageMonthly * targetCount);
            }
        }

        return due > 0 ? due : packageMonthly;
    };

    const getBaseAmount = () => {
        if (prefilledBillData) {
            // When clearing a Remit Bill, customBaseAmount explicitly holds the bill's Tuition component,
            // or 0 if all items are itemized. It MUST NEVER fall back to total outstanding due!
            return parseIntegerAmount(customBaseAmount || 0);
        }
        if (!selectedStudent) return 0;
        switch(paymentCategory) {
            case 'full_due':
            case '1_month':
            case '3_months':
            case '6_months':
            case 'full_year':
                return getScopeAmountForStudent(selectedStudent, paymentCategory);
            case 'custom': {
                if (customBaseAmount !== '') {
                    return parseIntegerAmount(customBaseAmount);
                }
                const monthsNum = parseIntegerAmount(customNumberOfMonths);
                const defaultMonthly = (
                    Number(selectedStudent.monthlyFee || 0) + 
                    Number(selectedStudent.transportFee || 0) + 
                    Number(selectedStudent.computerFee || 0) + 
                    Number(selectedStudent.academyFee || 0)
                ) || Number(selectedStudent.monthlyFee || 1000);

                if (monthsNum > 0) {
                    return defaultMonthly * monthsNum;
                }
                const due = Math.floor(getStudentDue(selectedStudent));
                return due > 0 ? due : defaultMonthly;
            }
            default:
                return getScopeAmountForStudent(selectedStudent, 'full_due');
        }
    };
    const baseAmount = selectedStudent ? getBaseAmount() : 0;
    const totalPayable = Math.max(0, baseAmount + parseIntegerAmount(additionalCharge) - parseIntegerAmount(discount));

    // Keep additionalCharge and discount synchronized with dynamic lists
    useEffect(() => {
        const sumAdd = additionalChargesList.reduce((acc, item) => acc + parseIntegerAmount(item.amount), 0);
        setAdditionalCharge(sumAdd.toString());
    }, [additionalChargesList]);

    useEffect(() => {
        const sumDisc = discountsList.reduce((acc, item) => acc + parseIntegerAmount(item.amount), 0);
        setDiscount(sumDisc.toString());
    }, [discountsList]);

    const printReceipt = (student: any, receiptNo: string, date: string, total: number, breakdown: any, ledgerPageNo: string) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const baseAmount = Number(breakdown.tuition || 0);
        const additionalCharge = Number(breakdown.additionalCharge || 0);
        const discount = Number(breakdown.discount || 0);
        const totalPayable = Math.max(0, baseAmount + additionalCharge - discount);
        const cashPaid = Number(total || 0);
        const amountApplied = Math.min(cashPaid, totalPayable);
        const excessCash = Math.max(0, cashPaid - totalPayable);
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
                            <img class="school-logo" src="${window.location.origin}/logo.png" onerror="this.onerror=null; this.src='/logo.png';" alt="School Logo" />
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
                            <span>Net Payable Total:</span>
                            <span class="font-mono font-black">NRs. ${totalPayable.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                        <div class="summary-row">
                            <span>Physical Cash Collected:</span>
                            <span class="font-mono" style="font-weight: bold;">NRs. ${cashPaid.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                        <div class="summary-row">
                            <span>Amount Applied to Dues:</span>
                            <span class="font-mono">NRs. ${amountApplied.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                        ${excessCash > 0 ? `
                        <div class="summary-row" style="color: #047857; background-color: #ecfdf5; font-weight: bold;">
                            <span>${breakdown.excessDecision === 'RETURN' ? 'Excess Returned to Guardian:' : 'Excess Advance Credited:'}</span>
                            <span class="font-mono">NRs. ${excessCash.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                        ` : ''}
                        <div class="summary-row balance-due" style="color: ${balanceDue > 0 ? '#b91c1c' : '#166534'}; background-color: ${balanceDue > 0 ? '#fef2f2' : '#f0fdf4'}; border-color: ${balanceDue > 0 ? '#fecaca' : '#bbf7d0'};">
                            <span>Remaining Balance Due:</span>
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
        setErrorModalMessage(null);
        setSuccessMessage('');
        
        if (!selectedStudent) {
            const err = `Please select a student.`;
            setErrorMessage(err);
            setErrorModalMessage(err);
            return;
        }

        const cashNum = parseIntegerAmount(cashReceived);
        if (cashNum <= 0 && parseIntegerAmount(discount) <= 0) {
            const err = "Please enter a valid Cash Collection Amount greater than 0.";
            setErrorMessage(err);
            setErrorModalMessage(err);
            return;
        }

        const breakdown = calculatePaymentBreakdown(totalPayable, cashNum);
        if (breakdown.isExcess && !excessDecision) {
            const err = "Cash collection exceeds Net Payable. Please select an Accountant Decision (Apply Excess as Advance or Return Excess to Guardian) before finalizing payment.";
            setErrorMessage(err);
            setErrorModalMessage(err);
            return;
        }

        setProcessing(true);

        try {
            const operatorName = getOperatorName();
            const operatorUid = auth.currentUser?.uid || 'system';
            const receiptNo = await allocateNextDocumentNumber('RCP', academicYear || '2083');
            const bsDate = formatBSDate(new Date());

            const executionResult = await executeCashFeePayment({
                receiptNo,
                student: selectedStudent,
                cashTendered: cashNum,
                cashCollection: cashNum,
                netPayable: totalPayable,
                baseAmount: baseAmount,
                additionalCharges: additionalChargesList.filter(x => Number(x.amount) > 0).map(x => ({ purpose: x.purpose || 'Additional Charge', amount: parseIntegerAmount(x.amount) })),
                discounts: discountsList.filter(x => Number(x.amount) > 0).map(x => ({ purpose: x.purpose || 'Concession', amount: parseIntegerAmount(x.amount) })),
                paymentCategory,
                customNumberOfMonths: paymentCategory === 'custom' ? customNumberOfMonths : undefined,
                selectedMonth,
                remarks,
                operatorName,
                operatorUid,
                handwrittenLedgerNo: isHandwrittenMode ? handwrittenLedgerNo : '',
                isHandwrittenMode,
                handwrittenReceiptSerial,
                handwrittenSignVerified,
                prefilledBillData,
                excessDecision: breakdown.isExcess ? excessDecision : null,
                accountantRemarks: accountantRemarks || '',
                accountantName: operatorName,
                accountantUid: operatorUid
            });

            setSuccessMessage(`Fee collected successfully in Cash and recorded in ledger! Receipt #${receiptNo}`);
            
            // Populate Cash Receipt Modal
            const currentNepaliYear = getBSYearMonthDate().year || 2081;
            const customMonthsNum = parseIntegerAmount(customNumberOfMonths);
            const billingPeriodDisplay = prefilledBillData?.billingPeriod || (paymentCategory === '1_month'
                ? selectedMonth 
                : (paymentCategory === 'custom' 
                    ? `Custom (${customMonthsNum || 1} Month${(customMonthsNum || 1) > 1 ? 's' : ''})` 
                    : paymentCategory.replace(/_/g, ' ')));

            const structuredReceiptData: CashReceiptData = {
                receiptNo: receiptNo,
                date: bsDate,
                englishDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                academicYear: `${currentNepaliYear}-${currentNepaliYear + 1} BS`,
                studentName: selectedStudent.fullName || selectedStudent.name,
                studentId: selectedStudent.id || selectedStudent.studentId || receiptNo,
                className: selectedStudent.class || selectedStudent.studentClass || '-',
                rollNo: selectedStudent.rollNumber || selectedStudent.roll || '-',
                guardianName: selectedStudent.fatherName || selectedStudent.parentName || '-',
                billingPeriod: billingPeriodDisplay,
                coveredMonths: prefilledBillData?.coveredMonths || (paymentCategory === '1_month' ? [selectedMonth] : undefined),
                baseTuition: baseAmount,
                additionalCharges: additionalChargesList
                    .filter(x => Number(x.amount) > 0)
                    .map(x => ({ purpose: x.purpose || 'Additional Charge', amount: parseIntegerAmount(x.amount) })),
                discounts: discountsList
                    .filter(x => Number(x.amount) > 0)
                    .map(x => ({ purpose: x.purpose || 'Concession', amount: parseIntegerAmount(x.amount) })),
                totalPayable: totalPayable,
                netPayable: totalPayable,
                cashReceived: cashNum,
                amountApplied: executionResult.breakdown.amountApplied,
                remainingOutstanding: executionResult.breakdown.remainingOutstanding,
                excessAmount: executionResult.breakdown.excessAmount,
                advanceCreated: executionResult.breakdown.excessAmount && excessDecision === 'ADVANCE' ? executionResult.breakdown.excessAmount : 0,
                excessReturned: executionResult.breakdown.excessAmount && excessDecision === 'RETURN' ? executionResult.breakdown.excessAmount : 0,
                cashierName: operatorName,
                remarks: remarks ? `${remarks} | Collected by: ${operatorName}` : `Collected by: ${operatorName}`,
                handwrittenLedgerNo: isHandwrittenMode ? handwrittenLedgerNo : undefined
            };
            setCashReceiptData(structuredReceiptData);
            setShowReceiptModal(true);

            setSelectedStudent(null);
            setPrefilledBillData(null);
            setExcessDecision(null);
            setAccountantRemarks('');
            if (onRefresh) onRefresh();

        } catch (err: any) {
            console.error('Payment Error:', err);
            handleFirestoreError(err, OperationType.WRITE, 'transactions');
            let errMsg = err.message || 'Failed to process payment. Please try again.';
            if (errMsg.includes('Missing or insufficient permissions') || errMsg.includes('PERMISSION_DENIED')) {
                errMsg = 'Permission Alert: Missing or insufficient permissions to record payment transactions in Firestore. Please ensure your account has staff/accountant/admin role or refresh your session.';
            }
            setErrorMessage(errMsg);
            setErrorModalMessage(errMsg);
        } finally {
            setProcessing(false);
        }
    };

    const handleSubmitExcessForReview = async () => {
        if (!selectedStudent) return;
        const cashNum = parseIntegerAmount(cashReceived);
        if (cashNum <= totalPayable) return;

        setProcessing(true);
        try {
            const operatorName = getOperatorName();
            const operatorUid = auth.currentUser?.uid || 'system';
            const receiptNo = await allocateNextDocumentNumber('RCP', academicYear || '2083');

            await createExcessPaymentRequest({
                receiptNo,
                student: selectedStudent,
                cashTendered: cashNum,
                cashCollection: cashNum,
                netPayable: totalPayable,
                baseAmount: baseAmount,
                additionalCharges: additionalChargesList.filter(x => Number(x.amount) > 0).map(x => ({ purpose: x.purpose || 'Additional Charge', amount: parseIntegerAmount(x.amount) })),
                discounts: discountsList.filter(x => Number(x.amount) > 0).map(x => ({ purpose: x.purpose || 'Concession', amount: parseIntegerAmount(x.amount) })),
                paymentCategory,
                selectedMonth,
                remarks,
                operatorName,
                operatorUid,
                handwrittenLedgerNo: isHandwrittenMode ? handwrittenLedgerNo : '',
                isHandwrittenMode,
                handwrittenReceiptSerial,
                handwrittenSignVerified,
                prefilledBillData
            });

            setSuccessMessage(`Excess cash collection (NRs. ${cashNum.toLocaleString()}) submitted for Accountant Review! Status: PENDING_ACCOUNTANT_DECISION`);
            setSelectedStudent(null);
            setPrefilledBillData(null);
            setExcessDecision(null);
            setAccountantRemarks('');
        } catch (err: any) {
            console.error('Error submitting excess payment request:', err);
            const errMsg = err.message || 'Failed to submit excess payment request.';
            setErrorMessage(errMsg);
            setErrorModalMessage(errMsg);
        } finally {
            setProcessing(false);
        }
    };

    const printStatement = (s: any) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const { monthlyRows, nonMonthlyRows } = getMonthlyConsolidatedLedger(s);
        const txHistory = getStudentTransactions(s);

        let tableRows = '';
        let totalBilled = 0;
        let totalPaid = 0;
        let totalDue = 0;
        let rowCounter = 0;

        monthlyRows.forEach((mRow: any) => {
            rowCounter++;
            totalBilled += mRow.totalBilled;
            totalPaid += mRow.totalPaid;
            totalDue += mRow.totalDue;

            const isWaived = mRow.status === 'waived';
            const statusLabel = isWaived
                ? 'WAIVED'
                : (mRow.totalDue <= 0 && mRow.totalPaid > 0 ? 'FULLY PAID' : (mRow.totalPaid > 0 ? `PARTIAL (${Math.round((mRow.totalPaid / (mRow.totalBilled || 1)) * 100)}%)` : 'UNPAID DUE'));

            const statusColor = isWaived ? '#6b21a8' : (mRow.totalDue <= 0 ? '#15803d' : (mRow.totalPaid > 0 ? '#b45309' : '#b91c1c'));
            const particulars = mRow.feeHeads.map((h: any) => `${h.type} (NRs. ${h.itemBilled.toLocaleString()})`).join(', ');

            tableRows += `
                <tr>
                    <td style="border: 1px solid #d1d5db; padding: 7px 10px; font-weight: bold; text-align: center;">${rowCounter}</td>
                    <td style="border: 1px solid #d1d5db; padding: 7px 10px;">
                        <strong>${mRow.month}</strong>
                        <div style="font-size: 10px; color: #4b5563; margin-top: 2px;">${particulars}</div>
                    </td>
                    <td style="border: 1px solid #d1d5db; padding: 7px 10px; text-align: right; font-family: monospace;">NRs. ${mRow.totalBilled.toLocaleString()}</td>
                    <td style="border: 1px solid #d1d5db; padding: 7px 10px; text-align: right; font-family: monospace; color: #15803d; font-weight: bold;">NRs. ${mRow.totalPaid.toLocaleString()}</td>
                    <td style="border: 1px solid #d1d5db; padding: 7px 10px; text-align: right; font-family: monospace; color: ${mRow.totalDue > 0 ? '#b91c1c' : '#4b5563'}; font-weight: bold;">NRs. ${mRow.totalDue.toLocaleString()}</td>
                    <td style="border: 1px solid #d1d5db; padding: 7px 10px; text-align: center; font-size: 10px; font-weight: bold; color: ${statusColor};">${statusLabel}</td>
                    <td style="border: 1px solid #d1d5db; padding: 7px 10px; font-size: 11px; font-family: monospace; color: #374151;">${mRow.receipts.length > 0 ? mRow.receipts.join(', ') : '-'}</td>
                </tr>
            `;
        });

        nonMonthlyRows.forEach((f: any) => {
            rowCounter++;
            const rowTotal = Number(f.totalFee || (Number(f.paidAmount || 0) + Number(f.dueAmount || 0)) || 0);
            const paidAmt = Number(f.paidAmount || (f.status === 'paid' ? f.totalFee : 0) || 0);
            const dueAmt = Number(f.dueAmount !== undefined ? f.dueAmount : (f.status === 'due' ? f.totalFee : 0));
            totalBilled += rowTotal;
            totalPaid += paidAmt;
            if (f.status === 'due' || f.status === 'partial') {
                totalDue += dueAmt;
            }

            const statusLabel = f.status === 'waived' ? 'WAIVED' : (dueAmt <= 0 && paidAmt > 0 ? 'FULLY PAID' : (paidAmt > 0 ? 'PARTIAL' : 'UNPAID DUE'));
            const statusColor = f.status === 'waived' ? '#6b21a8' : (dueAmt <= 0 ? '#15803d' : (paidAmt > 0 ? '#b45309' : '#b91c1c'));

            tableRows += `
                <tr>
                    <td style="border: 1px solid #d1d5db; padding: 7px 10px; font-weight: bold; text-align: center;">${rowCounter}</td>
                    <td style="border: 1px solid #d1d5db; padding: 7px 10px;">
                        <strong>${f.month}</strong> <span style="font-size: 10px; color: #4b5563;">(${f.type || 'Charge'})</span>
                    </td>
                    <td style="border: 1px solid #d1d5db; padding: 7px 10px; text-align: right; font-family: monospace;">NRs. ${rowTotal.toLocaleString()}</td>
                    <td style="border: 1px solid #d1d5db; padding: 7px 10px; text-align: right; font-family: monospace; color: #15803d; font-weight: bold;">NRs. ${paidAmt.toLocaleString()}</td>
                    <td style="border: 1px solid #d1d5db; padding: 7px 10px; text-align: right; font-family: monospace; color: ${dueAmt > 0 ? '#b91c1c' : '#4b5563'}; font-weight: bold;">NRs. ${dueAmt.toLocaleString()}</td>
                    <td style="border: 1px solid #d1d5db; padding: 7px 10px; text-align: center; font-size: 10px; font-weight: bold; color: ${statusColor};">${statusLabel}</td>
                    <td style="border: 1px solid #d1d5db; padding: 7px 10px; font-size: 11px; font-family: monospace; color: #374151;">${f.receiptNo || '-'}</td>
                </tr>
            `;
        });

        // Generate Partial Payments & Receipts table rows
        let paymentRows = '';
        txHistory.forEach((tx: any, pIdx: number) => {
            const isPartial = tx.isPartial;
            paymentRows += `
                <tr>
                    <td style="border: 1px solid #d1d5db; padding: 6px 10px; text-align: center;">${pIdx + 1}</td>
                    <td style="border: 1px solid #d1d5db; padding: 6px 10px; font-family: monospace;">${tx.date || '-'}</td>
                    <td style="border: 1px solid #d1d5db; padding: 6px 10px; font-family: monospace; font-weight: bold;">${tx.receiptNo || tx.receipt || '-'}</td>
                    <td style="border: 1px solid #d1d5db; padding: 6px 10px;">
                        <div>${tx.particulars || 'Fee Collection'}</div>
                        ${tx.remarks ? `<div style="font-size: 10px; color: #64748b; margin-top: 2px;">${tx.remarks}</div>` : ''}
                    </td>
                    <td style="border: 1px solid #d1d5db; padding: 6px 10px; text-align: center; font-size: 10px; font-weight: bold; color: #1e3a8a;">${tx.collectedBy || getOperatorName()}</td>
                    <td style="border: 1px solid #d1d5db; padding: 6px 10px; text-align: center;">
                        <span style="font-size: 9px; font-weight: bold; padding: 2px 6px; border-radius: 4px; background: ${isPartial ? '#fef3c7' : '#dcfce7'}; color: ${isPartial ? '#92400e' : '#166534'};">
                            ${isPartial ? 'PARTIAL PAYMENT' : 'FULL CLEARANCE'}
                        </span>
                    </td>
                    <td style="border: 1px solid #d1d5db; padding: 6px 10px; text-align: right; font-family: monospace; font-weight: bold; color: #15803d;">NRs. ${Number(tx.amount || 0).toLocaleString()}</td>
                    <td style="border: 1px solid #d1d5db; padding: 6px 10px; text-align: right; font-family: monospace; color: #b91c1c;">${tx.remainingDue !== undefined ? `NRs. ${Number(tx.remainingDue).toLocaleString()}` : '-'}</td>
                    <td style="border: 1px solid #d1d5db; padding: 6px 10px; text-align: center; font-size: 10px; color: #4b5563;">${tx.method || 'Cash'}</td>
                </tr>
            `;
        });

        printWindow.document.write(`
            <html>
            <head>
                <title>Audited Fee Statement - ${s.name}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; color: #1f2937; line-height: 1.4; }
                    .header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 16px; }
                    .header h2 { margin: 0; color: #1e3a8a; font-size: 22px; text-transform: uppercase; letter-spacing: 0.5px; }
                    .header p { margin: 3px 0; font-size: 11px; color: #4b5563; }
                    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 15px 0 20px 0; }
                    .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
                    .summary-label { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
                    .summary-val { font-size: 17px; font-weight: 900; margin-top: 4px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
                    th { background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
                    .section-title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #1e293b; margin: 24px 0 6px 0; display: flex; align-items: center; justify-content: space-between; }
                </style>
            </head>
            <body onload="window.print();window.close();">
                <div class="header">
                    <img src="${window.location.origin}/logo.png" style="width: 50px; height: 50px; object-fit: contain; margin-bottom: 4px;" onerror="this.onerror=null; this.src='/logo.png';" alt="School Logo" />
                    <h2>SHIKSHANTAR ACADEMY</h2>
                    <p>Bastipur, Karjanha-05, Siraha, Madhesh Province, Nepal • Regd: 1482/071</p>
                    <p style="font-weight: bold; color: #1e3a8a; margin-top: 4px;">OFFICIAL STUDENT FEE LEDGER &amp; PARTIAL PAYMENT AUDIT STATEMENT</p>
                </div>

                <div style="background: #fdfdfd; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; font-size: 12px;">
                    <table style="width: 100%; border: none; margin: 0;">
                        <tr style="background: transparent;">
                            <td style="border: none; padding: 3px 0;"><strong>Student Name:</strong> ${s.name}</td>
                            <td style="border: none; padding: 3px 0;"><strong>Student ID:</strong> ${s.studentId || s.id || '-'}</td>
                            <td style="border: none; padding: 3px 0;"><strong>Class &amp; Roll:</strong> Class ${s.class} (Roll: ${s.rollNumber || '-'})</td>
                        </tr>
                        <tr style="background: transparent;">
                            <td style="border: none; padding: 3px 0;"><strong>Guardian Name:</strong> ${s.guardianName || s.fatherName || '-'}</td>
                            <td style="border: none; padding: 3px 0;"><strong>Contact:</strong> ${s.guardianPhone || '-'}</td>
                            <td style="border: none; padding: 3px 0;"><strong>Monthly Base Tuition:</strong> NRs. ${(Number(s.monthlyFee || 0)).toLocaleString()}</td>
                        </tr>
                    </table>
                </div>

                <div class="summary-grid">
                    <div class="summary-card">
                        <div class="summary-label">Total Fees Billed</div>
                        <div class="summary-val" style="color: #1e293b;">NRs. ${totalBilled.toLocaleString()}</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-label">Total Payments Received</div>
                        <div class="summary-val" style="color: #15803d;">NRs. ${totalPaid.toLocaleString()}</div>
                    </div>
                    <div class="summary-card" style="border-color: ${totalDue > 0 ? '#fecaca' : '#bbf7d0'}; background: ${totalDue > 0 ? '#fff5f5' : '#f0fdf4'};">
                        <div class="summary-label" style="color: ${totalDue > 0 ? '#b91c1c' : '#15803d'};">Current Outstanding Balance</div>
                        <div class="summary-val" style="color: ${totalDue > 0 ? '#b91c1c' : '#15803d'};">NRs. ${totalDue.toLocaleString()}</div>
                    </div>
                </div>

                <div class="section-title">
                    <span>1. Itemized Billing &amp; Monthly Dues Ledger</span>
                    <span style="font-size: 10px; font-weight: normal; color: #64748b;">FIFO Accounting Applied</span>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 35px;">SN</th>
                            <th>Month / Fee Item</th>
                            <th style="text-align: right;">Total Billed</th>
                            <th style="text-align: right;">Amount Paid</th>
                            <th style="text-align: right;">Outstanding Due</th>
                            <th style="text-align: center;">Status</th>
                            <th>Receipt / Ref</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows || '<tr><td colspan="7" style="text-align:center; padding: 15px;">No Billed Records Found</td></tr>'}</tbody>
                </table>

                <div class="section-title" style="margin-top: 20px;">
                    <span>2. History of Partial Payments &amp; Official Vouchers</span>
                    <span style="font-size: 10px; font-weight: normal; color: #64748b;">${txHistory.length} Vouchers Recorded</span>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 35px;">SN</th>
                            <th>Date (BS)</th>
                            <th>Receipt No</th>
                            <th>Particulars / Description</th>
                            <th style="text-align: center;">Handled By</th>
                            <th style="text-align: center;">Payment Type</th>
                            <th style="text-align: right;">Amount Paid</th>
                            <th style="text-align: right;">Balance After</th>
                            <th style="text-align: center;">Mode</th>
                        </tr>
                    </thead>
                    <tbody>${paymentRows || '<tr><td colspan="9" style="text-align:center; padding: 15px; color: #6b7280;">No payment vouchers recorded yet.</td></tr>'}</tbody>
                </table>

                <div style="margin-top: 40px; padding-top: 15px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; font-size: 11px;">
                    <div>
                        <p style="margin: 0; font-weight: bold;">Accountant Verification:</p>
                        <p style="margin: 2px 0 0 0; color: #6b7280;">System Authenticated • Shikshantar AC-SYS</p>
                    </div>
                    <div style="text-align: right;">
                        <div style="width: 160px; border-bottom: 1px solid #1f2937; margin-bottom: 4px; display: inline-block;"></div>
                        <p style="margin: 0; font-weight: bold;">Authorized Signature &amp; School Seal</p>
                    </div>
                </div>
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
            const operatorName = getOperatorName();
            const operatorUid = auth.currentUser?.uid || 'system';

            const overrideReceiptNo = await allocateNextDocumentNumber('REV', getBSYearMonthDate().year.toString()).catch(() => `REV-${getBSYearMonthDate().year}-000001`);

            const txRef = doc(collection(db, 'transactions'));
            batch.set(txRef, {
                date: bsDate,
                receipt: overrideReceiptNo,
                receiptNo: overrideReceiptNo,
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
                remarks: `Status manually forced to '${overrideStatus}' for ${editingLedgerRow.month} (${editingLedgerRow.type}). Reason: ${overrideReason || 'Correction'} | Handled by: ${operatorName}`,
                ledgerPageNo: overrideLedgerPageNo,
                timestamp: serverTimestamp()
            });

            const prevSummary = `Status: ${editingLedgerRow.status || 'due'} | Paid: NRs. ${Number(editingLedgerRow.paidAmount || 0).toLocaleString()} | Due: NRs. ${Number(editingLedgerRow.dueAmount || 0).toLocaleString()} | Month: ${editingLedgerRow.month} (${editingLedgerRow.type || 'Tuition Fee'})`;
            const newSummary = `Status: ${overrideStatus} | Paid: NRs. ${Number(overridePaidAmount || 0).toLocaleString()} | Due: NRs. ${Number(overrideDueAmount || 0).toLocaleString()} | Page No: ${overrideLedgerPageNo || 'None'}`;

            const opId = `OP_OVERRIDE_${editingLedgerRow.feeDocId || editingLedgerRow.id}_${Date.now()}`;
            const auditPayload = await buildAuthoritativeAuditPayload({
                operationId: opId,
                category: 'financial',
                targetType: 'studentFees',
                targetId: editingLedgerRow.feeDocId || editingLedgerRow.id,
                studentId: editingLedgerRow.studentId,
                studentName: editingLedgerRow.studentName,
                studentClass: editingLedgerRow.studentClass,
                actionType: 'MANUAL_OVERRIDE',
                action: 'MANUAL_OVERRIDE',
                beforeState: {
                    status: editingLedgerRow.status || 'due',
                    paidAmount: Number(editingLedgerRow.paidAmount || 0),
                    dueAmount: Number(editingLedgerRow.dueAmount || 0),
                    month: editingLedgerRow.month,
                    type: editingLedgerRow.type
                },
                afterState: {
                    status: overrideStatus,
                    paidAmount: Number(overridePaidAmount || 0),
                    dueAmount: Number(overrideDueAmount || 0),
                    ledgerPageNo: overrideLedgerPageNo
                },
                previousValue: prevSummary,
                newValue: newSummary,
                reason: overrideReason?.trim() || 'Manual ledger row override'
            }, opId);

            batch.set(doc(db, 'ledger_audit_logs', opId), auditPayload);
            batch.set(doc(db, 'audit_logs', opId), auditPayload);

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
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setShowBatchAuditModal(true)}
                        className="bg-white/20 hover:bg-white/30 border border-white/30 text-white px-3.5 py-2 rounded-2xl text-xs font-black tracking-wide transition-all flex items-center gap-2 shadow-xs cursor-pointer active:scale-95 shrink-0"
                        title="Scan and audit database consistency across all students"
                    >
                        <ShieldCheck className="w-4 h-4 text-emerald-200" />
                        <span>Financial Integrity Audit</span>
                    </button>
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
            </div>

            {/* Class Selection, Search & Student Table */}
            <div className="space-y-6 w-full">
                <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-200/80 flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="w-full sm:w-64 shrink-0">
                        <select 
                            value={selectedClass} 
                            onChange={e => {
                                setSelectedClass(e.target.value);
                                setSelectedStudent(null);
                                setExpandedStudent(null);
                            }}
                            className="w-full bg-blue-50/80 hover:bg-blue-50 text-blue-900 font-black border border-blue-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs text-sm"
                        >
                            <option value="">-- Choose Class --</option>
                            {['Play Group', 'Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(c => (
                                <option key={c} value={c}>Class {c}</option>
                            ))}
                        </select>
                    </div>

                    <div className="relative flex-1 w-full flex items-center">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Search student by name or roll number..."
                            value={searchTerm}
                            onChange={e => {
                                setSearchTerm(e.target.value);
                                setSelectedStudent(null);
                                setExpandedStudent(null);
                            }}
                            className="w-full pl-10 pr-4 py-3 bg-gray-50/60 hover:bg-white focus:bg-white border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        />
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-x-auto custom-scrollbar pb-2">
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
                                    <td 
                                        className="p-4 font-bold text-gray-900 cursor-pointer hover:text-indigo-600 transition-colors"
                                        onClick={() => {
                                            if (onViewStudentLedger) {
                                                onViewStudentLedger(student.id);
                                            }
                                        }}
                                        title="Click to open Student Ledger Details"
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <span>{student.name}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 font-bold text-gray-600">Class {student.class}</td>
                                     <td className="p-4 text-center">
                                        <div className="flex justify-center gap-1.5 items-center flex-wrap">
                                            <button 
                                                onClick={() => handlePayClick(student)}
                                                className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 min-w-[75px] justify-center cursor-pointer"
                                                title="Quick Pay Fee"
                                            >
                                                <Zap className="w-3.5 h-3.5 hidden xl:block" /> Pay Fee
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    if (onViewStudentLedger) {
                                                        onViewStudentLedger(student.id);
                                                    } else {
                                                        setExpandedStudent(expandedStudent === student.id ? null : student.id);
                                                    }
                                                }}
                                                className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/80 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 min-w-[75px] justify-center cursor-pointer shadow-xs active:scale-95"
                                                title="Open in Student Ledger Details"
                                            >
                                                <FileText className="w-3.5 h-3.5 hidden xl:block text-indigo-600" /> Ledger
                                            </button>
                                            <button 
                                                onClick={() => setReconciliationStudent(student)}
                                                className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/70 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 min-w-[75px] justify-center cursor-pointer"
                                                title="Coverage & Reconciliation Matrix"
                                            >
                                                <Layers className="w-3.5 h-3.5 hidden xl:block text-indigo-600" /> Coverage
                                            </button>
                                            <button 
                                                onClick={() => setAuditRepairStudent(student)}
                                                className="bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200/70 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 min-w-[75px] justify-center cursor-pointer"
                                                title="Audit & Auto-Reconcile Student Financials"
                                            >
                                                <ShieldCheck className="w-3.5 h-3.5 hidden xl:block text-purple-600" /> Audit
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); 
                                                const rows = getRealisticLedgerRows(student);
                                                const unpaidMonths = rows.filter((r: any) => r.status === 'due').map((r: any) => r.month);
                                                window.open(`https://wa.me/977${student.guardianPhone}?text=${encodeURIComponent(`Namaste ${student.guardianName} ji, SHIKSHANTAR ACADEMY Siraha bata suchit garinchhau ki ${student.name} (Class ${student.class}) ko ${unpaidMonths.length > 0 ? unpaidMonths.join(', ') + ' mahina ko ' : ''}fee NRs. ${getStudentDue(student)} baki chha. Kripaya school aaera tirna anurodh chha. Dhanyabad.`)}`, '_blank');
                                            }} className="bg-white text-gray-700 hover:text-primary border border-gray-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm min-w-[75px] justify-center" title="Send WhatsApp Reminder">
                                              <Bell className="w-3.5 h-3.5 hidden xl:block" /> Remind
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                {expandedStudent === student.id && (
                                    <tr className="bg-gray-50/50">
                                        <td colSpan={4} className="p-4 sm:p-6 border-b border-gray-100">
                                            {(() => {
                                                const allRows = getRealisticLedgerRows(student);
                                                const txHistory = getStudentTransactions(student);
                                                const totalBilledVal = allRows.reduce((sum: number, r: any) => sum + Number(r.totalFee || (Number(r.paidAmount || 0) + Number(r.dueAmount || 0)) || 0), 0);
                                                const totalPaidVal = allRows.reduce((sum: number, r: any) => sum + Number(r.paidAmount || (r.status === 'paid' ? r.totalFee : 0) || 0), 0);
                                                const outstandingDueVal = allRows.reduce((sum: number, r: any) => {
                                                    if (r.status !== 'due' && r.status !== 'partial') return sum;
                                                    const amt = Number(r.dueAmount !== undefined ? r.dueAmount : (r.status === 'due' ? r.totalFee : 0));
                                                    return sum + (isNaN(amt) ? 0 : amt);
                                                }, 0);
                                                const partialPaymentsCount = txHistory.filter((t: any) => t.isPartial).length;
                                                const percentPaid = totalBilledVal > 0 ? Math.min(100, Math.round((totalPaidVal / totalBilledVal) * 100)) : 0;

                                                return (
                                                    <div className="space-y-6">
                                                        {/* Header & Actions */}
                                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-gray-200">
                                                            <div>
                                                                <h4 className="font-black text-gray-900 text-base flex items-center gap-2">
                                                                    <BookOpen className="w-5 h-5 text-emerald-600"/>
                                                                    Audited Student Ledger: {student.name}
                                                                </h4>
                                                                <p className="text-xs text-gray-500 font-medium mt-0.5">
                                                                    Class: <span className="font-bold text-gray-700">{student.class}</span> &bull; Roll: <span className="font-bold text-gray-700">{student.rollNumber || '-'}</span> &bull; Student ID: <span className="font-mono text-gray-700 font-bold">{student.studentId || student.id}</span>
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                {onViewStudentLedger && (
                                                                    <button 
                                                                        onClick={() => onViewStudentLedger(student.id)} 
                                                                        className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl shadow-xs flex items-center gap-2 font-black transition-all active:scale-95 cursor-pointer"
                                                                        title="Open in full Student Ledger Details tab"
                                                                    >
                                                                        <FileText className="w-4 h-4 text-white" /> Open Full Ledger Details Tab ➔
                                                                    </button>
                                                                )}
                                                                <button 
                                                                    onClick={() => setAuditRepairStudent(student)} 
                                                                    className="text-xs bg-purple-50 border border-purple-200/80 px-3.5 py-2 rounded-xl shadow-xs flex items-center gap-2 font-black text-purple-700 hover:bg-purple-100 transition-all active:scale-95 cursor-pointer"
                                                                    title="Audit student financial data and auto-reconcile"
                                                                >
                                                                    <ShieldCheck className="w-4 h-4 text-purple-600" /> Audit Ledger &amp; Fix
                                                                </button>
                                                                <button 
                                                                    onClick={() => setReconciliationStudent(student)} 
                                                                    className="text-xs bg-indigo-50 border border-indigo-200/80 px-3.5 py-2 rounded-xl shadow-sm flex items-center gap-2 font-black text-indigo-700 hover:bg-indigo-100 transition-all active:scale-95"
                                                                    title="Open Comprehensive Coverage & Reconciliation Matrix"
                                                                >
                                                                    <Layers className="w-4 h-4 text-indigo-600" /> Coverage Matrix &amp; Reconciliation
                                                                </button>
                                                                <button 
                                                                    onClick={() => printStatement(student)} 
                                                                    className="text-xs bg-white border border-gray-200 px-3.5 py-2 rounded-xl shadow-sm flex items-center gap-2 font-black text-gray-700 hover:text-blue-600 hover:border-blue-300 transition-all active:scale-95"
                                                                >
                                                                    <Printer className="w-4 h-4 text-gray-500" /> Print Audited Statement
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Transparent Financial Overview Ribbon */}
                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm">
                                                                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 block">Total Amount Due</span>
                                                                <p className="text-xl font-black text-gray-900 mt-1 font-mono">NRs. {totalBilledVal.toLocaleString()}</p>
                                                                <p className="text-[11px] text-gray-500 mt-0.5">Gross fees across all 12 academic months</p>
                                                            </div>
                                                            <div className="bg-emerald-50/50 border border-emerald-200/60 rounded-2xl p-4 shadow-sm">
                                                                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 block">Total Amount Paid to Date</span>
                                                                <p className="text-xl font-black text-emerald-700 mt-1 font-mono">NRs. {totalPaidVal.toLocaleString()}</p>
                                                                <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                                                                    {txHistory.length} receipts logged ({partialPaymentsCount} partial installment{partialPaymentsCount === 1 ? '' : 's'})
                                                                </p>
                                                            </div>
                                                            <div className={`border rounded-2xl p-4 shadow-sm ${outstandingDueVal > 0 ? 'bg-red-50/50 border-red-200/70' : 'bg-emerald-50/30 border-emerald-200/50'}`}>
                                                                <span className={`text-[10px] font-black uppercase tracking-wider block ${outstandingDueVal > 0 ? 'text-red-700' : 'text-emerald-700'}`}>Remaining Outstanding Balance</span>
                                                                <p className={`text-xl font-black mt-1 font-mono ${outstandingDueVal > 0 ? 'text-red-700' : 'text-emerald-700'}`}>NRs. {outstandingDueVal.toLocaleString()}</p>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <div className="flex-1 bg-gray-200 h-1.5 rounded-full overflow-hidden">
                                                                        <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${percentPaid}%` }}></div>
                                                                    </div>
                                                                    <span className="text-[10px] font-black text-gray-600 font-mono">{percentPaid}% Cleared</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Unified 12-Month Academic Coverage Matrix Ribbon */}
                                                        {(() => {
                                                            const studentRemitList = (student?.remitBills && student.remitBills.length > 0)
                                                                ? student.remitBills
                                                                : (remitBills || []).filter((b: any) => b.studentId === student.id || (b.studentName === (student.fullName || student.name) && b.class === student.class));
                                                            const coverage = getStudentBillingCoverage(student, academicYear, studentRemitList);

                                                            return (
                                                                <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-md border border-slate-800 space-y-3">
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
                                                                                    onClick={() => setReconciliationStudent(student)}
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

                                                                    {/* Active Remittance Bills for this student */}
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
                                                                                            {!isBillPaid && (
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => handlePayRemitBill(student, b)}
                                                                                                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0 transition-all active:scale-95 shadow-sm cursor-pointer"
                                                                                                    title="Load bill into cash collection counter"
                                                                                                >
                                                                                                    Collect Cash
                                                                                                </button>
                                                                                            )}
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

                                                        {/* Consolidated Monthly Billing Table */}
                                                        <div>
                                                            <div className="flex justify-between items-center mb-2">
                                                                <span className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                                                                    <span>1. Monthly &amp; Terminal Fee Ledger</span>
                                                                </span>
                                                                <span className="text-[11px] text-gray-400 font-semibold">Consolidated by Nepali Month &bull; Click row to expand fee heads</span>
                                                            </div>
                                                            <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto custom-scrollbar pb-2 text-sm shadow-sm">
                                                                <table className="w-full text-left min-w-[700px]">
                                                                    <thead className="bg-gray-50/80 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wider font-black">
                                                                        <tr>
                                                                            <th className="p-3 pl-4">Month / Particulars</th>
                                                                            <th className="p-3 text-right">Total Billed</th>
                                                                            <th className="p-3 text-right">Amount Paid</th>
                                                                            <th className="p-3 text-right">Outstanding Due</th>
                                                                            <th className="p-3 text-center">Status</th>
                                                                            <th className="p-3 pl-4 font-normal">Receipt / Voucher</th>
                                                                            <th className="p-3 text-center text-xs font-bold uppercase tracking-wider text-blue-600">Action</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-gray-100 text-xs">
                                                                        {(() => {
                                                                            const { monthlyRows: studentMonthlyRows, nonMonthlyRows: studentNonMonthlyRows } = getMonthlyConsolidatedLedger(student);

                                                                            if (studentMonthlyRows.length === 0 && studentNonMonthlyRows.length === 0) {
                                                                                return <tr><td colSpan={7} className="p-8 text-center text-gray-400 font-bold">No ledger records found.</td></tr>;
                                                                            }

                                                                            return (
                                                                                <>
                                                                                    {studentMonthlyRows.map((mRow: any, mIdx: number) => {
                                                                                        const rowKey = `table_${student.id}_${mRow.month}`;
                                                                                        const isExpanded = !!expandedLedgerMonths[rowKey];
                                                                                        const isDue = mRow.status === 'due';
                                                                                        const isPartial = mRow.status === 'partial';
                                                                                        const isPaid = mRow.status === 'paid';
                                                                                        const isWaived = mRow.status === 'waived';
                                                                                        const hasMultipleHeads = mRow.feeHeads.length > 1;

                                                                                        return (
                                                                                            <React.Fragment key={rowKey}>
                                                                                                <tr 
                                                                                                    onClick={() => toggleMonthExpand(rowKey)}
                                                                                                    className={`cursor-pointer transition-colors ${
                                                                                                        isExpanded 
                                                                                                            ? 'bg-emerald-50/40 border-l-4 border-l-emerald-600' 
                                                                                                            : (isDue ? 'bg-red-50/20 hover:bg-red-50/40' : (isPartial ? 'bg-amber-50/30 hover:bg-amber-50/50' : 'hover:bg-gray-50/80'))
                                                                                                    }`}
                                                                                                >
                                                                                                    <td className="p-3 pl-4 font-bold text-gray-900">
                                                                                                        <div className="flex items-center gap-2">
                                                                                                            <span className="p-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 shrink-0">
                                                                                                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-emerald-700" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                                                                                            </span>
                                                                                                            <div>
                                                                                                                <span className="text-gray-900 font-black text-sm block">{mRow.month}</span>
                                                                                                                <span className="text-[10px] text-gray-500 font-medium block">
                                                                                                                    {mRow.feeHeads.length === 1 
                                                                                                                        ? mRow.feeHeads[0].type 
                                                                                                                        : `${mRow.feeHeads.length} Fee Heads (${mRow.feeHeads.map((h: any) => h.type.replace(' Fee', '')).join(', ')})`}
                                                                                                                </span>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    </td>
                                                                                                    <td className="p-3 text-right font-mono font-bold text-gray-700">NRs. {mRow.totalBilled.toLocaleString()}</td>
                                                                                                    <td className="p-3 text-right font-mono font-bold text-emerald-700">NRs. {mRow.totalPaid.toLocaleString()}</td>
                                                                                                    <td className={`p-3 text-right font-mono font-bold ${mRow.totalDue > 0 ? 'text-red-600' : 'text-gray-400'}`}>NRs. {mRow.totalDue.toLocaleString()}</td>
                                                                                                    <td className="p-3 text-center">
                                                                                                        {isWaived ? (
                                                                                                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">
                                                                                                                WAIVED
                                                                                                            </span>
                                                                                                        ) : isPartial ? (
                                                                                                            <div className="inline-flex flex-col items-center">
                                                                                                                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                                                                                                                    PARTIAL PAYMENT
                                                                                                                </span>
                                                                                                                <span className="text-[9px] text-amber-700 font-bold font-mono mt-0.5">
                                                                                                                    Paid {Math.round((mRow.totalPaid / (mRow.totalBilled || 1)) * 100)}%
                                                                                                                </span>
                                                                                                            </div>
                                                                                                        ) : isDue ? (
                                                                                                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-700 border border-red-200">
                                                                                                                UNPAID DUE
                                                                                                            </span>
                                                                                                        ) : (
                                                                                                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200">
                                                                                                                FULLY PAID ✓
                                                                                                            </span>
                                                                                                        )}
                                                                                                    </td>
                                                                                                    <td className="p-3 pl-4 text-xs text-gray-500 font-mono">
                                                                                                        {mRow.receipts.length > 0 ? (
                                                                                                            <span className="font-bold text-gray-700">{mRow.receipts.join(', ')}</span>
                                                                                                        ) : (
                                                                                                            <span className="text-gray-400 italic">-</span>
                                                                                                        )}
                                                                                                    </td>
                                                                                                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                                                                        {!hasMultipleHeads ? (
                                                                                                            <button
                                                                                                                type="button"
                                                                                                                onClick={() => {
                                                                                                                    const f = mRow.feeHeads[0];
                                                                                                                    setEditingLedgerRow({
                                                                                                                        studentId: student.id,
                                                                                                                        studentName: student.name,
                                                                                                                        studentClass: student.class,
                                                                                                                        month: f.month,
                                                                                                                        type: f.type || 'Tuition Fee',
                                                                                                                        totalFee: f.itemBilled,
                                                                                                                        paidAmount: f.itemPaid,
                                                                                                                        dueAmount: f.itemDue,
                                                                                                                        status: f.status,
                                                                                                                        isImplicit: !!f.isImplicit,
                                                                                                                        id: f.id,
                                                                                                                        ledgerPageNo: f.ledgerPageNo || ''
                                                                                                                    });
                                                                                                                    setOverrideStatus(f.status === 'paid' ? 'paid' : (f.status === 'waived' ? 'waived' : 'due'));
                                                                                                                    setOverridePaidAmount(String(f.itemPaid));
                                                                                                                    setOverrideDueAmount(String(f.itemDue));
                                                                                                                    setOverrideLedgerPageNo(f.ledgerPageNo || '');
                                                                                                                    setOverrideReason('');
                                                                                                                }}
                                                                                                                className="px-2.5 py-1 text-[11px] bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-black transition-all border border-blue-200 active:scale-95"
                                                                                                            >
                                                                                                                Override
                                                                                                            </button>
                                                                                                        ) : (
                                                                                                            <button
                                                                                                                type="button"
                                                                                                                onClick={() => toggleMonthExpand(rowKey)}
                                                                                                                className="px-2 py-1 text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition-all border border-gray-200"
                                                                                                            >
                                                                                                                {isExpanded ? 'Hide Items' : `View ${mRow.feeHeads.length} Items`}
                                                                                                            </button>
                                                                                                        )}
                                                                                                    </td>
                                                                                                </tr>

                                                                                                {/* Itemized Fee Breakdown Accordion */}
                                                                                                {isExpanded && (
                                                                                                    <tr className="bg-slate-50/80 border-b border-gray-200">
                                                                                                        <td colSpan={7} className="p-3 pl-8 pr-4">
                                                                                                            <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
                                                                                                                <div className="bg-gradient-to-r from-gray-100 to-gray-50 px-3 py-2 border-b border-gray-200 flex justify-between items-center text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                                                                                                                    <span>{mRow.month} Itemized Fee Breakdown ({mRow.feeHeads.length} heads)</span>
                                                                                                                    <span className="text-gray-500 font-medium lowercase">Individual fee-head overrides</span>
                                                                                                                </div>
                                                                                                                <table className="w-full text-left text-xs">
                                                                                                                    <thead className="bg-gray-50/70 border-b border-gray-200 text-gray-500 font-bold uppercase text-[10px]">
                                                                                                                        <tr>
                                                                                                                            <th className="p-2.5 pl-3.5">Fee Head</th>
                                                                                                                            <th className="p-2.5 text-right">Billed</th>
                                                                                                                            <th className="p-2.5 text-right">Paid</th>
                                                                                                                            <th className="p-2.5 text-right">Due</th>
                                                                                                                            <th className="p-2.5 text-center">Status</th>
                                                                                                                            <th className="p-2.5 pl-3 font-normal">Receipt</th>
                                                                                                                            <th className="p-2.5 text-center">Action</th>
                                                                                                                        </tr>
                                                                                                                    </thead>
                                                                                                                    <tbody className="divide-y divide-gray-100">
                                                                                                                        {mRow.feeHeads.map((head: any, hIdx: number) => {
                                                                                                                            const headDue = Number(head.itemDue !== undefined ? head.itemDue : (head.status === 'due' ? head.itemBilled : 0));
                                                                                                                            return (
                                                                                                                                <tr key={`head_${hIdx}`} className="hover:bg-gray-50/70">
                                                                                                                                    <td className="p-2 pl-3.5 font-semibold text-gray-800">
                                                                                                                                        <div className="flex items-center gap-1.5">
                                                                                                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                                                                                                                            <span>{head.type}</span>
                                                                                                                                            {head.isManualOverride && (
                                                                                                                                                <span className="text-[8px] bg-purple-100 text-purple-700 px-1 py-0.5 rounded font-black uppercase">Override</span>
                                                                                                                                            )}
                                                                                                                                        </div>
                                                                                                                                    </td>
                                                                                                                                    <td className="p-2 text-right font-mono text-gray-700">NRs. {head.itemBilled.toLocaleString()}</td>
                                                                                                                                    <td className="p-2 text-right font-mono text-emerald-700 font-semibold">NRs. {head.itemPaid.toLocaleString()}</td>
                                                                                                                                    <td className={`p-2 text-right font-mono font-bold ${headDue > 0 ? 'text-red-600' : 'text-gray-400'}`}>NRs. {headDue.toLocaleString()}</td>
                                                                                                                                    <td className="p-2 text-center">
                                                                                                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                                                                                                                                            head.status === 'waived' ? 'bg-purple-100 text-purple-700' :
                                                                                                                                            head.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                                                                                                                                            head.status === 'partial' ? 'bg-amber-100 text-amber-800' :
                                                                                                                                            'bg-red-100 text-red-700'
                                                                                                                                        }`}>
                                                                                                                                            {head.status}
                                                                                                                                        </span>
                                                                                                                                    </td>
                                                                                                                                    <td className="p-2 pl-3 text-gray-500 font-mono text-[11px]">{head.receiptNo || '-'}</td>
                                                                                                                                    <td className="p-2 text-center">
                                                                                                                                        <button
                                                                                                                                            type="button"
                                                                                                                                            onClick={() => {
                                                                                                                                                setEditingLedgerRow({
                                                                                                                                                    studentId: student.id,
                                                                                                                                                    studentName: student.name,
                                                                                                                                                    studentClass: student.class,
                                                                                                                                                    month: head.month,
                                                                                                                                                    type: head.type || 'Tuition Fee',
                                                                                                                                                    totalFee: head.itemBilled,
                                                                                                                                                    paidAmount: head.itemPaid,
                                                                                                                                                    dueAmount: headDue,
                                                                                                                                                    status: head.status,
                                                                                                                                                    isImplicit: !!head.isImplicit,
                                                                                                                                                    id: head.id,
                                                                                                                                                    ledgerPageNo: head.ledgerPageNo || ''
                                                                                                                                                });
                                                                                                                                                setOverrideStatus(head.status === 'paid' ? 'paid' : (head.status === 'waived' ? 'waived' : 'due'));
                                                                                                                                                setOverridePaidAmount(String(head.itemPaid));
                                                                                                                                                setOverrideDueAmount(String(headDue));
                                                                                                                                                setOverrideLedgerPageNo(head.ledgerPageNo || '');
                                                                                                                                                setOverrideReason('');
                                                                                                                                            }}
                                                                                                                                            className="px-2 py-0.5 text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-700 rounded font-black border border-blue-200"
                                                                                                                                        >
                                                                                                                                            Override
                                                                                                                                        </button>
                                                                                                                                    </td>
                                                                                                                                </tr>
                                                                                                                            );
                                                                                                                        })}
                                                                                                                    </tbody>
                                                                                                                </table>
                                                                                                            </div>
                                                                                                        </td>
                                                                                                    </tr>
                                                                                                )}
                                                                                            </React.Fragment>
                                                                                        );
                                                                                    })}

                                                                                    {studentNonMonthlyRows.length > 0 && (
                                                                                        <>
                                                                                            <tr className="bg-gray-100/90 border-t-2 border-gray-200">
                                                                                                <td colSpan={7} className="p-2.5 pl-4 font-black text-gray-700 text-[11px] uppercase tracking-wider">
                                                                                                    <span>One-Time / Non-Monthly Charges ({studentNonMonthlyRows.length})</span>
                                                                                                </td>
                                                                                            </tr>
                                                                                            {studentNonMonthlyRows.map((f: any, nIdx: number) => {
                                                                                                const isDue = f.status === 'due';
                                                                                                const isPartial = f.status === 'partial' || (Number(f.paidAmount || 0) > 0 && Number(f.dueAmount || 0) > 0);
                                                                                                const rowTotal = Number(f.totalFee || (Number(f.paidAmount || 0) + Number(f.dueAmount || 0)) || 0);
                                                                                                const rowPaid = Number(f.paidAmount || (f.status === 'paid' ? f.totalFee : 0) || 0);
                                                                                                const rowDue = Number(f.dueAmount !== undefined ? f.dueAmount : (isDue ? f.totalFee : 0));

                                                                                                return (
                                                                                                    <tr key={`non_monthly_${nIdx}`} className={`${isDue ? 'bg-red-50/20' : (isPartial ? 'bg-amber-50/30' : '')} hover:bg-gray-50/80`}>
                                                                                                        <td className="p-3 pl-4 font-bold text-gray-900">
                                                                                                            <div className="flex items-center gap-2">
                                                                                                                <span>{f.month}</span>
                                                                                                                <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold border border-blue-100">{f.type || 'Charge'}</span>
                                                                                                            </div>
                                                                                                        </td>
                                                                                                        <td className="p-3 text-right font-mono font-bold text-gray-700">NRs. {rowTotal.toLocaleString()}</td>
                                                                                                        <td className="p-3 text-right font-mono font-bold text-emerald-700">NRs. {rowPaid.toLocaleString()}</td>
                                                                                                        <td className={`p-3 text-right font-mono font-bold ${rowDue > 0 ? 'text-red-600' : 'text-gray-400'}`}>NRs. {rowDue.toLocaleString()}</td>
                                                                                                        <td className="p-3 text-center">
                                                                                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                                                                                f.status === 'waived' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                                                                                                                f.status === 'paid' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                                                                                                isPartial ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                                                                                                                'bg-red-100 text-red-700 border border-red-200'
                                                                                                            }`}>
                                                                                                                {f.status}
                                                                                                            </span>
                                                                                                        </td>
                                                                                                        <td className="p-3 pl-4 text-xs text-gray-500 font-mono">{f.receiptNo || '-'}</td>
                                                                                                        <td className="p-3 text-center">
                                                                                                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                                                                                                {f.isRemitBill && f.rawBill && f.status !== 'paid' && (
                                                                                                                    <button
                                                                                                                        type="button"
                                                                                                                        onClick={() => handlePayRemitBill(student, f.rawBill)}
                                                                                                                        className="px-2.5 py-1 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black shadow-xs flex items-center gap-1 active:scale-95 cursor-pointer"
                                                                                                                        title="Pay this Remit Bill at Cashier Desk"
                                                                                                                    >
                                                                                                                        <Zap className="w-3 h-3" /> Pay Bill
                                                                                                                    </button>
                                                                                                                )}
                                                                                                                <button
                                                                                                                    type="button"
                                                                                                                    onClick={() => {
                                                                                                                        setEditingLedgerRow({
                                                                                                                            studentId: student.id,
                                                                                                                            studentName: student.name,
                                                                                                                            studentClass: student.class,
                                                                                                                            month: f.month,
                                                                                                                            type: f.type || 'Charge',
                                                                                                                            totalFee: rowTotal,
                                                                                                                            paidAmount: rowPaid,
                                                                                                                            dueAmount: rowDue,
                                                                                                                            status: f.status,
                                                                                                                            isImplicit: !!f.isImplicit,
                                                                                                                            id: f.id,
                                                                                                                            ledgerPageNo: f.ledgerPageNo || ''
                                                                                                                        });
                                                                                                                        setOverrideStatus(f.status === 'paid' ? 'paid' : (f.status === 'waived' ? 'waived' : 'due'));
                                                                                                                        setOverridePaidAmount(String(rowPaid));
                                                                                                                        setOverrideDueAmount(String(rowDue));
                                                                                                                        setOverrideLedgerPageNo(f.ledgerPageNo || '');
                                                                                                                        setOverrideReason('');
                                                                                                                    }}
                                                                                                                    className="px-2.5 py-1 text-[11px] bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-black border border-blue-200"
                                                                                                                >
                                                                                                                    Override
                                                                                                                </button>
                                                                                                            </div>
                                                                                                        </td>
                                                                                                    </tr>
                                                                                                );
                                                                                            })}
                                                                                        </>
                                                                                    )}
                                                                                </>
                                                                            );
                                                                        })()}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>

                                                        {/* Dedicated History of Partial Payments & Receipts Table */}
                                                        <div>
                                                            <div className="flex justify-between items-center mb-2">
                                                                <span className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                                                                    <History className="w-4 h-4 text-blue-600" />
                                                                    <span>2. History of Partial Payments &amp; Receipts ({txHistory.length})</span>
                                                                </span>
                                                                <span className="text-[11px] text-gray-400 font-semibold">All Official Vouchers &amp; Installments</span>
                                                            </div>

                                                            <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto custom-scrollbar pb-2 text-sm shadow-sm">
                                                                <table className="w-full text-left min-w-[700px]">
                                                                    <thead className="bg-gray-50/80 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wider font-black">
                                                                        <tr>
                                                                            <th className="p-3 pl-4">Date (BS)</th>
                                                                            <th className="p-3">Receipt / Voucher #</th>
                                                                            <th className="p-3">Particulars &amp; Remarks</th>
                                                                            <th className="p-3 text-center">Collected By</th>
                                                                            <th className="p-3 text-center">Payment Type</th>
                                                                            <th className="p-3 text-right">Amount Paid</th>
                                                                            <th className="p-3 text-right">Remaining Due</th>
                                                                            <th className="p-3 text-center">Method</th>
                                                                            <th className="p-3 text-center">Voucher Action</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-gray-100 text-xs">
                                                                        {txHistory.length === 0 ? (
                                                                            <tr>
                                                                                <td colSpan={9} className="p-6 text-center text-gray-400 font-bold">
                                                                                    No payment receipts or partial installments logged yet.
                                                                                </td>
                                                                            </tr>
                                                                        ) : (
                                                                            txHistory.map((tx: any, tIdx: number) => {
                                                                                const isPartial = tx.isPartial;
                                                                                const collector = tx.collectedBy || getOperatorName();
                                                                                return (
                                                                                    <tr key={tIdx} className="hover:bg-gray-50/70 transition-colors">
                                                                                        <td className="p-3 pl-4 font-mono font-bold text-gray-700">{tx.date || '-'}</td>
                                                                                        <td className="p-3 font-mono font-black text-gray-900">{tx.receiptNo || tx.receipt || '-'}</td>
                                                                                        <td className="p-3 text-gray-700 font-medium">
                                                                                            <div className="font-bold text-gray-900">{tx.particulars || 'Fee Collection'}</div>
                                                                                            {tx.remarks && tx.remarks !== tx.particulars && (
                                                                                                <div className="text-[10px] text-gray-500 font-medium mt-0.5">{tx.remarks}</div>
                                                                                            )}
                                                                                        </td>
                                                                                        <td className="p-3 text-center">
                                                                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-800 border border-indigo-200">
                                                                                                {collector}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="p-3 text-center">
                                                                                            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${isPartial ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
                                                                                                {isPartial ? 'PARTIAL PAYMENT' : 'FULL SETTLEMENT'}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="p-3 text-right font-mono font-black text-emerald-700">NRs. {Number(tx.amount || 0).toLocaleString()}</td>
                                                                                        <td className="p-3 text-right font-mono font-bold text-red-600">
                                                                                            {tx.remainingDue !== undefined ? `NRs. ${Number(tx.remainingDue).toLocaleString()}` : '-'}
                                                                                        </td>
                                                                                        <td className="p-3 text-center text-[11px] font-semibold text-gray-600">{tx.method || 'Cash'}</td>
                                                                                        <td className="p-3 text-center">
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => {
                                                                                                    const currentNepaliYear = getBSYearMonthDate().year || 2081;
                                                                                                    const structuredReceiptData: CashReceiptData = {
                                                                                                        receiptNo: tx.receiptNo || tx.receipt || (tx.id ? `RCP-TXN-${tx.id.substring(0, 8)}` : 'RCP-RECORD'),
                                                                                                        date: tx.date || todayBS,
                                                                                                        englishDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                                                                                                        academicYear: `${currentNepaliYear}-${currentNepaliYear + 1} BS`,
                                                                                                        studentName: student.fullName || student.name,
                                                                                                        studentId: student.id || student.studentId || '-',
                                                                                                        className: student.class || student.studentClass || '-',
                                                                                                        rollNo: student.rollNumber || student.roll || '-',
                                                                                                        guardianName: student.fatherName || student.guardianName || student.parentName || '-',
                                                                                                        billingPeriod: tx.particulars || 'Fee Payment',
                                                                                                        baseTuition: Number(tx.amount || 0),
                                                                                                        additionalCharges: [],
                                                                                                        discounts: [],
                                                                                                        totalPayable: Number(tx.totalDue || tx.amount || 0),
                                                                                                        cashReceived: Number(tx.amount || 0),
                                                                                                        changeReturned: 0,
                                                                                                        cashierName: collector,
                                                                                                        remarks: tx.remarks || (isPartial ? `Partial Payment Installment | Collected by: ${collector}` : `Fee Clearance | Collected by: ${collector}`),
                                                                                                        handwrittenLedgerNo: tx.ledgerPageNo || undefined
                                                                                                    };
                                                                                                    setCashReceiptData(structuredReceiptData);
                                                                                                    setShowReceiptModal(true);
                                                                                                }}
                                                                                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg font-black transition-all border border-emerald-200 active:scale-95"
                                                                                                title="View and Print Cash Voucher"
                                                                                            >
                                                                                                <FileText className="w-3 h-3 text-emerald-600" />
                                                                                                <span>View Voucher</span>
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
                                                    </div>
                                                );
                                            })()}
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
            </div>

            {/* INLINE FEE COLLECTION DESK (Replaced popup modal) */}
            {selectedStudent && (
                <div className="bg-white rounded-3xl shadow-xl border-2 border-emerald-500 overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-300 -mx-1 sm:-mx-3 lg:-mx-4 xl:-mx-6" ref={paymentFormRef}>
                    {/* Header */}
                    <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-6 py-5 flex justify-between items-center shrink-0 shadow-md">
                        <div>
                            <span className="bg-white/20 text-white font-black text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/25">
                                FEE CASHIER DESK (INLINE VIEW)
                            </span>
                            <h3 className="text-xl font-black mt-1 flex items-center gap-2">
                                <Banknote className="w-5 h-5 text-emerald-200" /> Record Fee Collection for {selectedStudent.name}
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

                    {/* Body: Split into 2 Balanced Columns with flex/grid */}
                    <div className="p-4 sm:p-6 lg:p-8 bg-gray-50/50">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
                                
                                {/* LEFT COLUMN: Student Ledger Statement (Monthly Consolidated View ~50%) */}
                                <div className="lg:col-span-6 xl:col-span-6 2xl:col-span-6 space-y-6">
                                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 lg:p-6">
                                        {(() => {
                                            const { monthlyRows, nonMonthlyRows } = getMonthlyConsolidatedLedger(selectedStudent);
                                            const allRows = getRealisticLedgerRows(selectedStudent);
                                            const totalBilledVal = allRows.reduce((sum: number, r: any) => sum + Number(r.totalFee || (Number(r.paidAmount || 0) + Number(r.dueAmount || 0)) || 0), 0);
                                            const totalPaidVal = allRows.reduce((sum: number, r: any) => sum + Number(r.paidAmount || (r.status === 'paid' ? r.totalFee : 0) || 0), 0);
                                            const outstandingDueVal = allRows.reduce((sum: number, r: any) => {
                                                if (r.status !== 'due' && r.status !== 'partial') return sum;
                                                const amt = Number(r.dueAmount !== undefined ? r.dueAmount : (r.status === 'due' ? r.totalFee : 0));
                                                return sum + (isNaN(amt) ? 0 : amt);
                                            }, 0);
                                            const isAllExpanded = monthlyRows.length > 0 && monthlyRows.every(r => expandedLedgerMonths[`cashier_${r.month}`]);

                                            return (
                                                <>
                                                    <div className="flex flex-wrap justify-between items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                                                        <div>
                                                            <h4 className="font-black text-gray-900 text-sm sm:text-base flex items-center gap-2 uppercase tracking-wide">
                                                                <BookOpen className="w-4 h-4 text-emerald-600 shrink-0"/> Student Ledger History
                                                            </h4>
                                                            <span className="text-[10px] text-gray-500 font-semibold block mt-0.5">1 Nepali Month = 1 Ledger Row &bull; Click to expand fee breakdown</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            {monthlyRows.length > 0 && (
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => toggleAllMonthsExpand(monthlyRows, 'cashier_')}
                                                                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2.5 py-1.5 rounded-xl font-bold transition-colors flex items-center gap-1 shadow-2xs"
                                                                    title={isAllExpanded ? "Collapse All Months" : "Expand All Months"}
                                                                >
                                                                    <ChevronsUpDown className="w-3.5 h-3.5" />
                                                                    <span className="hidden sm:inline">{isAllExpanded ? 'Collapse' : 'Expand'}</span>
                                                                </button>
                                                            )}
                                                            <button 
                                                                type="button"
                                                                onClick={() => printStatement(selectedStudent)} 
                                                                className="text-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-250 text-emerald-800 px-3 py-1.5 rounded-xl shadow-xs flex items-center gap-1.5 font-bold transition-colors"
                                                            >
                                                                <Printer className="w-3.5 h-3.5" /> Print Statement
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Financial Summary Box */}
                                                    <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 text-center">
                                                        <div className="bg-gray-50/90 border border-gray-200 rounded-xl p-2.5">
                                                            <span className="text-[10px] uppercase font-bold text-gray-500 block">Total Billed</span>
                                                            <span className="text-xs sm:text-sm font-black text-gray-900 font-mono block mt-0.5">NRs. {totalBilledVal.toLocaleString()}</span>
                                                        </div>
                                                        <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl p-2.5">
                                                            <span className="text-[10px] uppercase font-bold text-emerald-800 block">Collected</span>
                                                            <span className="text-xs sm:text-sm font-black text-emerald-700 font-mono block mt-0.5">NRs. {totalPaidVal.toLocaleString()}</span>
                                                        </div>
                                                        <div className={`border rounded-xl p-2.5 ${outstandingDueVal > 0 ? 'bg-red-50/90 border-red-200 text-red-700' : 'bg-emerald-50/40 border-emerald-200 text-emerald-700'}`}>
                                                            <span className="text-[10px] uppercase font-bold block">Remaining Due</span>
                                                            <span className="text-xs sm:text-sm font-black font-mono block mt-0.5">NRs. {outstandingDueVal.toLocaleString()}</span>
                                                        </div>
                                                    </div>

                                                    {/* Monthly Consolidated Ledger Table */}
                                                    <div className="overflow-x-auto max-h-[58vh] overflow-y-auto custom-scrollbar rounded-xl border border-gray-200 bg-white">
                                                        <table className="w-full text-left text-xs">
                                                            <thead className="bg-gray-50/95 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider sticky top-0 z-10 backdrop-blur-xs">
                                                                <tr>
                                                                    <th className="p-3 pl-3.5">Month / Period</th>
                                                                    <th className="p-3 text-right">Billed</th>
                                                                    <th className="p-3 text-right">Paid</th>
                                                                    <th className="p-3 text-right">Due</th>
                                                                    <th className="p-3 text-center pr-3.5">Status</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {monthlyRows.length === 0 && nonMonthlyRows.length === 0 ? (
                                                                    <tr><td colSpan={5} className="p-8 text-center text-gray-400 font-bold">No ledger records found for this student.</td></tr>
                                                                ) : (
                                                                    monthlyRows.map((mRow: any, idx: number) => {
                                                                        const rowKey = `cashier_${mRow.month}`;
                                                                        const isExpanded = !!expandedLedgerMonths[rowKey];
                                                                        const isDue = mRow.status === 'due';
                                                                        const isPartial = mRow.status === 'partial';
                                                                        const isPaid = mRow.status === 'paid';
                                                                        const isWaived = mRow.status === 'waived';

                                                                        return (
                                                                            <React.Fragment key={`month_${mRow.month}_${idx}`}>
                                                                                <tr 
                                                                                    onClick={() => toggleMonthExpand(rowKey)}
                                                                                    className={`cursor-pointer transition-colors ${
                                                                                        isExpanded 
                                                                                            ? 'bg-emerald-50/40 border-l-4 border-l-emerald-600' 
                                                                                            : (isDue ? 'hover:bg-red-50/30' : (isPartial ? 'hover:bg-amber-50/30' : 'hover:bg-emerald-50/20'))
                                                                                    }`}
                                                                                >
                                                                                    <td className="p-2.5 pl-3 font-bold text-gray-800">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <span className="p-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 shrink-0">
                                                                                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-emerald-700" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                                                                            </span>
                                                                                            <div>
                                                                                                <span className="text-gray-900 font-black text-xs sm:text-sm block">{mRow.month}</span>
                                                                                                <span className="text-[10px] text-gray-500 font-medium block">
                                                                                                    {mRow.feeHeads.length === 1 
                                                                                                        ? mRow.feeHeads[0].type 
                                                                                                        : `${mRow.feeHeads.length} Fee Heads (${mRow.feeHeads.map((h: any) => h.type.replace(' Fee', '')).slice(0, 2).join(', ')}${mRow.feeHeads.length > 2 ? ' +' + (mRow.feeHeads.length - 2) : ''})`}
                                                                                                </span>
                                                                                            </div>
                                                                                        </div>
                                                                                    </td>
                                                                                    <td className="p-2.5 text-right font-mono font-bold text-gray-800 whitespace-nowrap">NRs. {mRow.totalBilled.toLocaleString()}</td>
                                                                                    <td className="p-2.5 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">NRs. {mRow.totalPaid.toLocaleString()}</td>
                                                                                    <td className={`p-2.5 text-right font-mono font-black whitespace-nowrap ${mRow.totalDue > 0 ? 'text-red-600' : 'text-gray-400'}`}>NRs. {mRow.totalDue.toLocaleString()}</td>
                                                                                    <td className="p-2.5 text-center pr-3.5 whitespace-nowrap">
                                                                                        {isWaived ? (
                                                                                            <span className="px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">WAIVED</span>
                                                                                        ) : isPartial ? (
                                                                                            <span className="px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">PARTIAL</span>
                                                                                        ) : isDue ? (
                                                                                            <span className="px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-red-100 text-red-700 border border-red-200">DUE</span>
                                                                                        ) : isPaid ? (
                                                                                            <span className="px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200">PAID</span>
                                                                                        ) : (
                                                                                            <span className="px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-gray-100 text-gray-600 border border-gray-200">NO CHARGE</span>
                                                                                        )}
                                                                                    </td>
                                                                                </tr>

                                                                                {/* Expandable Itemized Fee Heads Accordion */}
                                                                                {isExpanded && (
                                                                                    <tr className="bg-slate-50/90 border-b border-gray-200 animate-in fade-in duration-200">
                                                                                        <td colSpan={5} className="p-3 pl-6 pr-4">
                                                                                            <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
                                                                                                <div className="bg-gradient-to-r from-gray-100 to-gray-50 px-3 py-1.5 border-b border-gray-200 flex justify-between items-center text-[10px] font-bold text-gray-600 uppercase tracking-wider">
                                                                                                    <span>{mRow.month} Itemized Breakdown</span>
                                                                                                    <span>{mRow.feeHeads.length} Fee Items</span>
                                                                                                </div>
                                                                                                <table className="w-full text-left text-[11px]">
                                                                                                    <thead className="bg-gray-50/70 border-b border-gray-150 text-gray-500 font-bold uppercase text-[9px]">
                                                                                                        <tr>
                                                                                                            <th className="p-2 pl-3">Fee Head / Charge</th>
                                                                                                            <th className="p-2 text-right">Billed</th>
                                                                                                            <th className="p-2 text-right">Paid</th>
                                                                                                            <th className="p-2 text-right">Due</th>
                                                                                                            <th className="p-2 text-center pr-3">Status / Receipt</th>
                                                                                                        </tr>
                                                                                                    </thead>
                                                                                                    <tbody className="divide-y divide-gray-100">
                                                                                                        {mRow.feeHeads.map((head: any, hIdx: number) => {
                                                                                                            const headDue = Number(head.itemDue !== undefined ? head.itemDue : (head.status === 'due' ? head.itemBilled : 0));
                                                                                                            return (
                                                                                                                <tr key={`head_${hIdx}`} className="hover:bg-gray-50/80">
                                                                                                                    <td className="p-2 pl-3 font-semibold text-gray-800">
                                                                                                                        <div className="flex items-center gap-1.5">
                                                                                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                                                                                                            <span>{head.type}</span>
                                                                                                                        </div>
                                                                                                                    </td>
                                                                                                                    <td className="p-2 text-right font-mono text-gray-700">NRs. {head.itemBilled.toLocaleString()}</td>
                                                                                                                    <td className="p-2 text-right font-mono text-emerald-700 font-semibold">NRs. {head.itemPaid.toLocaleString()}</td>
                                                                                                                    <td className={`p-2 text-right font-mono font-bold ${headDue > 0 ? 'text-red-600' : 'text-gray-400'}`}>NRs. {headDue.toLocaleString()}</td>
                                                                                                                    <td className="p-2 text-center pr-3">
                                                                                                                        <div className="flex flex-col items-center gap-0.5">
                                                                                                                            <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                                                                                                                                head.status === 'waived' ? 'bg-purple-100 text-purple-700' :
                                                                                                                                head.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                                                                                                                                head.status === 'partial' ? 'bg-amber-100 text-amber-800' :
                                                                                                                                'bg-red-100 text-red-700'
                                                                                                                            }`}>
                                                                                                                                {head.status}
                                                                                                                            </span>
                                                                                                                            {head.receiptNo && head.receiptNo !== '-' && head.receiptNo !== '*Auto-Calculated*' && (
                                                                                                                                <span className="text-[8px] text-gray-400 font-mono">RCP: {head.receiptNo}</span>
                                                                                                                            )}
                                                                                                                        </div>
                                                                                                                    </td>
                                                                                                                </tr>
                                                                                                            );
                                                                                                        })}
                                                                                                    </tbody>
                                                                                                </table>
                                                                                            </div>
                                                                                        </td>
                                                                                    </tr>
                                                                                )}
                                                                            </React.Fragment>
                                                                        );
                                                                    })
                                                                )}

                                                                {/* Optional Non-Monthly / Remit Bills Section */}
                                                                {nonMonthlyRows.length > 0 && (
                                                                    <>
                                                                        <tr className="bg-gray-100/90 border-t-2 border-gray-200">
                                                                            <td colSpan={5} className="p-2 pl-3 font-black text-gray-700 text-[10px] uppercase tracking-wider">
                                                                                <span>One-Time / Non-Monthly Charges ({nonMonthlyRows.length})</span>
                                                                            </td>
                                                                        </tr>
                                                                        {nonMonthlyRows.map((nm: any, nmIdx: number) => {
                                                                            const nmTotal = Number(nm.totalFee || (Number(nm.paidAmount || 0) + Number(nm.dueAmount || 0)) || 0);
                                                                            const nmPaid = Number(nm.paidAmount || (nm.status === 'paid' ? nm.totalFee : 0) || 0);
                                                                            const nmDue = Number(nm.dueAmount !== undefined ? nm.dueAmount : Math.max(0, nmTotal - nmPaid));

                                                                            return (
                                                                                <tr key={`nm_${nmIdx}`} className="bg-gray-50/50 hover:bg-gray-100/60 transition-colors">
                                                                                    <td className="p-2.5 pl-3 font-bold text-gray-800">
                                                                                        <div>
                                                                                            <span className="text-gray-900 font-bold text-xs">{nm.month}</span>
                                                                                            <span className="text-[10px] text-gray-500 block">{nm.type}</span>
                                                                                        </div>
                                                                                    </td>
                                                                                    <td className="p-2.5 text-right font-mono font-bold text-gray-800 whitespace-nowrap">NRs. {nmTotal.toLocaleString()}</td>
                                                                                    <td className="p-2.5 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">NRs. {nmPaid.toLocaleString()}</td>
                                                                                    <td className={`p-2.5 text-right font-mono font-black whitespace-nowrap ${nmDue > 0 ? 'text-red-600' : 'text-gray-400'}`}>NRs. {nmDue.toLocaleString()}</td>
                                                                                    <td className="p-2.5 text-center pr-3.5 whitespace-nowrap">
                                                                                        <div className="flex items-center justify-center gap-1.5">
                                                                                            <span className={`px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                                                                                                nm.status === 'paid' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                                                                                nm.status === 'partial' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                                                                                'bg-red-100 text-red-700 border border-red-200'
                                                                                            }`}>
                                                                                                {nm.status}
                                                                                            </span>
                                                                                            {nm.isRemitBill && nm.rawBill && nm.status !== 'paid' && (
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => handlePayRemitBill(selectedStudent, nm.rawBill)}
                                                                                                    className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[9px] font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95"
                                                                                                    title="Load this remit bill into payment register"
                                                                                                >
                                                                                                    Load
                                                                                                </button>
                                                                                            )}
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </>
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>

                                    {/* Recent Transactions Widget */}
                                    {getRecentReceipts(selectedStudent).length > 0 && (
                                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
                                            <h4 className="text-xs uppercase font-black text-gray-500 tracking-wider mb-3 flex items-center gap-1.5">
                                                <span>Recent Transactions</span>
                                            </h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                                {getRecentReceipts(selectedStudent).map((rec, idx) => (
                                                    <div key={idx} className="bg-gray-50 border text-xs border-gray-100 p-2.5 rounded-xl flex justify-between items-center shadow-2xs">
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

                                {/* RIGHT COLUMN: Record Payments Form (~50%) */}
                                <div className="lg:col-span-6 xl:col-span-6 2xl:col-span-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6 lg:p-7 space-y-6">
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

                                    {Number(selectedStudent.advanceBalance || 0) > 0 && (
                                        <div className="bg-indigo-50 border border-indigo-200/80 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
                                            <div className="flex items-center gap-2.5">
                                                <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700 text-sm">💎</span>
                                                <div>
                                                    <span className="text-xs font-black text-indigo-900 uppercase tracking-wide">Advance Credit Available</span>
                                                    <p className="text-[11px] text-indigo-700 font-medium">This student holds NRs. {Number(selectedStudent.advanceBalance).toLocaleString()} pre-paid credit from previous surplus cash.</p>
                                                </div>
                                            </div>
                                            <span className="font-mono font-black text-indigo-950 text-sm shrink-0 pl-3">NRs. {Number(selectedStudent.advanceBalance).toLocaleString()}</span>
                                        </div>
                                    )}

                                    {prefilledBillData && (
                                        <div className="bg-blue-50 border border-blue-200/80 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-2xs">
                                            <div>
                                                <span className="font-black text-blue-900 uppercase tracking-wide">Settling Remit Bill: {prefilledBillData.billId || prefilledBillData.id}</span>
                                                <p className="text-[11px] text-blue-700 font-medium mt-0.5">Billing Period: {prefilledBillData.billingPeriod || 'Current Session'} &bull; Bill Amount: NRs. {Number(prefilledBillData.amount).toLocaleString()}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setPrefilledBillData(null);
                                                    setReceiptTitle('Cash Receipt');
                                                    setAdditionalChargesList([]);
                                                    setDiscountsList([]);
                                                    setPaymentCategory('full_due');
                                                }}
                                                className="text-[10px] font-bold bg-white text-blue-700 hover:bg-blue-100 border border-blue-300 px-2.5 py-1.5 rounded-lg transition shrink-0 cursor-pointer shadow-2xs"
                                            >
                                                Switch to Standard Cash
                                            </button>
                                        </div>
                                    )}

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
                                                            if (cat.id === 'custom') {
                                                                setCustomNumberOfMonths('1');
                                                                const defaultMonthly = Math.floor(Number(selectedStudent?.monthlyFee || 1000));
                                                                setCustomBaseAmount(defaultMonthly.toString());
                                                                setCashReceived('');
                                                            }
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

                                            {paymentCategory === 'custom' && (
                                                <div className="mt-4 bg-emerald-50/80 p-3.5 rounded-xl border-2 border-emerald-200 space-y-2.5">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                        <div>
                                                            <label className="block text-xs font-black text-emerald-950 uppercase tracking-wider">
                                                                Number of Months (Duration) *
                                                            </label>
                                                            <p className="text-[11px] text-emerald-700 font-medium">
                                                                Enter the number of fee months to calculate tuition (digits only).
                                                            </p>
                                                        </div>
                                                        <div className="relative w-full sm:w-32">
                                                            <NumericInput 
                                                                value={customNumberOfMonths}
                                                                onChange={e => handleCustomMonthsChange(e.target.value)}
                                                                placeholder="e.g. 2"
                                                                className="w-full border-2 border-emerald-400 focus:border-emerald-600 rounded-lg px-3 py-1.5 text-sm font-black text-emerald-950 font-mono bg-white text-center outline-none shadow-sm focus:ring-2 focus:ring-emerald-200"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Quick selector chips */}
                                                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-emerald-100">
                                                        <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wide mr-1">Quick Select:</span>
                                                        {[2, 4, 5, 7, 8, 9, 10, 11].map(m => (
                                                            <button
                                                                key={m}
                                                                type="button"
                                                                onClick={() => handleCustomMonthsChange(m.toString())}
                                                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition cursor-pointer ${customNumberOfMonths === m.toString() ? 'bg-emerald-600 text-white border-emerald-700 font-black shadow-xs' : 'bg-white hover:bg-emerald-100 text-emerald-800 border-emerald-200'}`}
                                                            >
                                                                {m} Months
                                                            </button>
                                                        ))}
                                                    </div>

                                                    {/* Informative multiplier summary */}
                                                    {(() => {
                                                        const mCount = parseIntegerAmount(customNumberOfMonths);
                                                        const monthlyFee = Math.floor(Number(selectedStudent?.monthlyFee || 1000));
                                                        if (mCount > 0) {
                                                            return (
                                                                <div className="text-[11px] text-emerald-900 bg-white/90 p-2 rounded-lg border border-emerald-200/90 font-mono flex items-center justify-between">
                                                                    <span className="font-sans font-bold text-emerald-800">Calculation:</span>
                                                                    <span className="font-black">NRs. {monthlyFee.toLocaleString()} × {mCount} month{mCount > 1 ? 's' : ''} = NRs. {(monthlyFee * mCount).toLocaleString()}</span>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                            )}
                                        </div>

                                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-150 space-y-3.5">
                                            <div className="flex justify-between items-center text-sm font-bold text-gray-700">
                                                <div className="flex flex-col">
                                                    <span>Base Tuition Fee Due:</span>
                                                    {paymentCategory === 'custom' && (
                                                        <span className="text-[10px] text-gray-500 font-normal">
                                                            Auto-calculated from {parseIntegerAmount(customNumberOfMonths) || 1} month(s) (editable for partial payment)
                                                        </span>
                                                    )}
                                                </div>
                                                {paymentCategory === 'custom' ? (
                                                    <div className="relative w-36">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">NRs</span>
                                                        <NumericInput 
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
                                                        className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white font-black px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 active:scale-95 shadow-sm cursor-pointer"
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
                                                                    <NumericInput
                                                                        required
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
                                                                    className="text-gray-400 hover:text-red-500 p-1 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
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
                                                        className="text-[10px] bg-red-600 hover:bg-red-700 text-white font-black px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 active:scale-95 shadow-sm cursor-pointer"
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
                                                                    <NumericInput
                                                                        required
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
                                                                    className="text-gray-400 hover:text-red-500 p-1 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
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

                                        {/* Strict Cash Counter Notice */}
                                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-300 px-3.5 py-2 rounded-xl text-emerald-900 text-xs font-bold shadow-xs">
                                            <Banknote className="w-4 h-4 text-emerald-700 shrink-0" />
                                            <span>Physical Cash Counter Settlement • Strictly Cash Only (No online / digital payments accepted)</span>
                                        </div>

                                        {/* Financial Calculation summary & Cash Breakdown */}
                                        {(() => {
                                            const cashNum = parseIntegerAmount(cashReceived);
                                            const breakdown = calculatePaymentBreakdown(totalPayable, cashNum);
                                            const changeToReturn = excessDecision === 'ADVANCE' ? 0 : breakdown.changeReturned;
                                            const advanceCredited = excessDecision === 'ADVANCE' ? breakdown.excessAmount : 0;
                                            
                                            return (
                                                <div className="space-y-4">
                                                    {/* Row: Net Payable & Cash Tendered Input */}
                                                    <div className="border-t border-gray-150 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 flex flex-col justify-center">
                                                            <span className="text-[10px] uppercase font-black text-emerald-700 tracking-wider">Net Payable Total</span>
                                                            <span className="text-2xl font-black text-emerald-900 font-mono mt-1">NRs. {totalPayable.toLocaleString()}</span>
                                                            <span className="text-[10px] text-emerald-600 mt-1 font-semibold">Tuition + Addl Charges - Discounts</span>
                                                        </div>
                                                        <div>
                                                            <div className="flex justify-between items-center mb-1.5">
                                                                <label className="block text-xs font-black text-gray-700 uppercase tracking-widest">
                                                                    Cash Tendered by Guardian (NRs) *
                                                                </label>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setCashReceived(totalPayable.toString())}
                                                                    className="text-[10px] font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded-lg transition"
                                                                >
                                                                    Exact Match (NRs. {totalPayable.toLocaleString()})
                                                                </button>
                                                            </div>
                                                            <NumericInput 
                                                                required
                                                                placeholder="Physical cash handed by parent"
                                                                value={cashReceived}
                                                                onChange={e => setCashReceived(e.target.value)}
                                                                className="w-full border-2 border-emerald-300 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-lg font-black text-emerald-950 font-mono focus:ring-1 focus:ring-emerald-500 outline-none shadow-sm"
                                                            />
                                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                                {[500, 1000, 2000, 5000, 10000, 20000, 50000].map(denom => (
                                                                    <button
                                                                        key={denom}
                                                                        type="button"
                                                                        onClick={() => setCashReceived(denom.toString())}
                                                                        className="text-[10px] font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-0.5 rounded-md border border-gray-200 transition active:scale-95"
                                                                    >
                                                                        NRs. {denom.toLocaleString()}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Live Allocation Breakdown Box */}
                                                    {cashNum > 0 && (
                                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-3">
                                                            <div className="flex justify-between items-center text-slate-700 font-bold border-b border-slate-200 pb-2">
                                                                <span className="uppercase text-[10px] tracking-wider text-slate-500">Live Cash Allocation Breakdown</span>
                                                                <span className="font-mono text-slate-800">Cash Tendered: NRs. {cashNum.toLocaleString()}</span>
                                                            </div>
                                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono">
                                                                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                                                                    <div className="text-[10px] text-gray-500 font-sans font-bold">Applied to Dues</div>
                                                                    <div className="font-black text-emerald-700 text-sm">NRs. {breakdown.amountApplied.toLocaleString()}</div>
                                                                    <div className="text-[9px] text-slate-400 font-sans">Hard-capped at Net Payable</div>
                                                                </div>

                                                                <div className={`p-2.5 rounded-lg border ${changeToReturn > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
                                                                    <div className={`text-[10px] font-sans font-bold ${changeToReturn > 0 ? 'text-amber-800' : 'text-gray-500'}`}>Change to Return</div>
                                                                    <div className={`font-black text-sm ${changeToReturn > 0 ? 'text-amber-900' : 'text-slate-700'}`}>
                                                                        NRs. {changeToReturn.toLocaleString()}
                                                                    </div>
                                                                    <div className="text-[9px] text-slate-400 font-sans">Handed back to parent</div>
                                                                </div>

                                                                <div className={`p-2.5 rounded-lg border ${advanceCredited > 0 ? 'bg-sky-50 border-sky-200' : 'bg-white border-slate-200'}`}>
                                                                    <div className={`text-[10px] font-sans font-bold ${advanceCredited > 0 ? 'text-sky-800' : 'text-gray-500'}`}>Advance Credited</div>
                                                                    <div className={`font-black text-sm ${advanceCredited > 0 ? 'text-sky-900' : 'text-slate-700'}`}>
                                                                        NRs. {advanceCredited.toLocaleString()}
                                                                    </div>
                                                                    <div className="text-[9px] text-slate-400 font-sans">Credited for future fees</div>
                                                                </div>

                                                                <div className={`p-2.5 rounded-lg border ${breakdown.remainingOutstanding > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                                                                    <div className={`text-[10px] font-sans font-bold ${breakdown.remainingOutstanding > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                                        {breakdown.remainingOutstanding > 0 ? 'Remaining Due' : 'Status'}
                                                                    </div>
                                                                    <div className={`font-black text-sm ${breakdown.remainingOutstanding > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                                        {breakdown.remainingOutstanding > 0 ? `NRs. ${breakdown.remainingOutstanding.toLocaleString()}` : 'Fully Settled'}
                                                                    </div>
                                                                    <div className="text-[9px] text-slate-400 font-sans">
                                                                        {breakdown.remainingOutstanding > 0 ? 'Partial payment' : 'No balance remaining'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Excess Cash Accountant Decision Workflow Banner */}
                                                    {breakdown.isExcess && (
                                                        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 space-y-3 animate-in fade-in duration-200">
                                                            <div className="flex items-start gap-2.5">
                                                                <Bell className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                                                <div>
                                                                    <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">
                                                                        Excess Cash Decision Required
                                                                    </h4>
                                                                    <p className="text-[11px] text-amber-800 font-medium mt-0.5">
                                                                        Guardian handed <span className="font-bold font-mono">NRs. {cashNum.toLocaleString()}</span>, which is <span className="font-bold text-amber-950 font-mono">NRs. {breakdown.excessAmount.toLocaleString()}</span> more than the Net Payable Total (<span className="font-bold font-mono">NRs. {totalPayable.toLocaleString()}</span>). Please select how the excess cash should be handled:
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setExcessDecision('RETURN')}
                                                                    className={`p-3 rounded-xl border-2 text-left transition-all ${excessDecision === 'RETURN' ? 'border-amber-600 bg-amber-100/70 text-amber-950 shadow-sm' : 'border-amber-200 bg-white hover:bg-amber-50/60 text-slate-700'}`}
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <input 
                                                                            type="radio" 
                                                                            checked={excessDecision === 'RETURN'} 
                                                                            onChange={() => setExcessDecision('RETURN')}
                                                                            className="text-amber-600 focus:ring-amber-500" 
                                                                        />
                                                                        <span className="font-black text-xs">Option A — Return as Change to Guardian</span>
                                                                    </div>
                                                                    <p className="text-[10px] text-slate-600 mt-1 pl-5">
                                                                        Amount Applied: <strong className="font-mono">NRs. {breakdown.amountApplied.toLocaleString()}</strong> &bull; Return <strong className="font-mono text-amber-900">NRs. {breakdown.excessAmount.toLocaleString()}</strong> physical cash change at counter.
                                                                    </p>
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => setExcessDecision('ADVANCE')}
                                                                    className={`p-3 rounded-xl border-2 text-left transition-all ${excessDecision === 'ADVANCE' ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-sm' : 'border-amber-200 bg-white hover:bg-amber-50/60 text-slate-700'}`}
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <input 
                                                                            type="radio" 
                                                                            checked={excessDecision === 'ADVANCE'} 
                                                                            onChange={() => setExcessDecision('ADVANCE')}
                                                                            className="text-emerald-600 focus:ring-emerald-500" 
                                                                        />
                                                                        <span className="font-black text-xs">Option B — Credit Excess as Student Advance</span>
                                                                    </div>
                                                                    <p className="text-[10px] text-slate-600 mt-1 pl-5">
                                                                        Amount Applied: <strong className="font-mono">NRs. {breakdown.amountApplied.toLocaleString()}</strong> &bull; Credit <strong className="font-mono text-emerald-900">NRs. {breakdown.excessAmount.toLocaleString()}</strong> to student account for upcoming months.
                                                                    </p>
                                                                </button>
                                                            </div>

                                                            <div className="pt-1">
                                                                <label className="block text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-1">
                                                                    Accountant / Cashier Notes on Excess Decision (Optional)
                                                                </label>
                                                                <input
                                                                    type="text"
                                                                    placeholder="e.g. Guardian requested change return / advance credit"
                                                                    value={accountantRemarks}
                                                                    onChange={e => setAccountantRemarks(e.target.value)}
                                                                    className="w-full border border-amber-300 rounded-xl px-3 py-1.5 text-xs bg-white text-gray-800 outline-none focus:border-amber-500"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}

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
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Remarks</label>
                                                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                                    Collected by: <span className="underline">{getOperatorName()}</span>
                                                </span>
                                            </div>
                                            <input 
                                                type="text" 
                                                placeholder={`Any extra payment notes (Auto-appends: Collected by: ${getOperatorName()})`}
                                                value={remarks} 
                                                onChange={e => setRemarks(e.target.value)}
                                                className="w-full border-2 border-gray-200 focus:border-emerald-500 rounded-xl px-4 py-3 outline-none font-bold text-gray-700 bg-white text-sm focus:ring-1 focus:ring-emerald-500"
                                            />
                                        </div>

                                        <div className="space-y-3 pt-4">
                                            {errorMessage && (
                                                <div className="bg-red-50 border-2 border-red-300 text-red-700 p-3.5 rounded-xl text-xs font-bold flex items-start gap-2.5 shadow-sm animate-in fade-in">
                                                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                                                    <div className="flex-1">
                                                        <span className="block font-black text-red-800">Action Encountered an Error:</span>
                                                        <span className="font-semibold">{errorMessage}</span>
                                                    </div>
                                                </div>
                                            )}
                                            {parseIntegerAmount(cashReceived) > totalPayable && !excessDecision && (
                                                <button
                                                    type="button"
                                                    disabled={processing}
                                                    onClick={handleSubmitExcessForReview}
                                                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black uppercase tracking-wider py-3 rounded-xl transition flex justify-center items-center gap-2 shadow-md shadow-amber-500/20 text-xs disabled:opacity-50 active:scale-95"
                                                >
                                                    {processing ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Submit for Supervisor / Accountant Review (Pending Decision)'}
                                                </button>
                                            )}
                                            <div className="flex gap-4">
                                                <button 
                                                    type="button"
                                                    onClick={() => setSelectedStudent(null)}
                                                    className="flex-1 border-2 border-gray-200 text-gray-600 font-bold uppercase tracking-widest py-3.5 rounded-xl hover:bg-gray-50 transition active:scale-95 text-xs"
                                                >
                                                    Cancel
                                                </button>
                                                <button 
                                                    type="submit" 
                                                    disabled={processing || (parseIntegerAmount(cashReceived) > totalPayable && !excessDecision)}
                                                    className="flex-1 bg-emerald-600 text-white font-black uppercase tracking-widest py-3.5 rounded-xl hover:bg-emerald-700 transition flex justify-center items-center gap-2 shadow-lg shadow-emerald-500/30 disabled:opacity-50 active:scale-95 text-xs"
                                                >
                                                    {processing ? <Loader2 className="w-5 h-5 animate-spin"/> : (parseIntegerAmount(cashReceived) > totalPayable ? 'Confirm & Apply Decision' : 'Confirm & Print Receipt')}
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-center text-[10px] text-gray-400 font-medium">Ledger and outstanding dues will automatically update by atomic waterfall transaction</p>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
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
                                                                                         className={`py-2 px-3 rounded-xl border text-xs font-black transition-all capitalize ${overrideStatus === st ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                                        >
                                            {st}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-1.5">Amount Paid (NRs)</label>
                                    <NumericInput 
                                        required
                                        value={overridePaidAmount}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setOverridePaidAmount(val);
                                            const paid = Number(val || 0);
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
                                    <NumericInput 
                                        required
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
                                    placeholder="Explain why this status is manually overridden (e.g. corrected typo in paper register, sibling package concession, ledger recalculation)"
                                    value={overrideReason}
                                    onChange={e => setOverrideReason(e.target.value)}
                                    className="w-full border border-gray-300 focus:border-blue-500 rounded-xl px-3 py-2 bg-white text-xs font-bold text-gray-850"
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
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

            {/* Comprehensive Billing Coverage & Reconciliation Modal */}
            {reconciliationStudent && (
                <BillingCoverageReconciliationModal
                    isOpen={!!reconciliationStudent}
                    onClose={() => setReconciliationStudent(null)}
                    students={students}
                    currentAcademicYear={academicYear}
                    remitBills={remitBills}
                    initialStudentId={reconciliationStudent.id}
                />
            )}

            {/* Instant Cash Receipt Preview, Print & PDF Download Modal */}
            {cashReceiptData && (
                <CashReceiptModal
                    isOpen={showReceiptModal}
                    onClose={() => {
                        setShowReceiptModal(false);
                        setCashReceiptData(null);
                    }}
                    receipt={cashReceiptData}
                />
            )}

            {/* Financial Integrity Audit & Reconciliation Modal */}
            {(auditRepairStudent || showBatchAuditModal) && (
                <FinancialAuditRepairModal
                    isOpen={!!auditRepairStudent || showBatchAuditModal}
                    onClose={() => {
                        setAuditRepairStudent(null);
                        setShowBatchAuditModal(false);
                    }}
                    student={auditRepairStudent}
                    allStudents={students}
                    onReconciliationComplete={() => {
                        onRefresh();
                    }}
                />
            )}

            {/* Immediate Floating Error Modal (Pops up directly without scrolling) */}
            {errorModalMessage && createPortal(
                <div 
                    className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150"
                    onClick={() => setErrorModalMessage(null)}
                >
                    <div 
                        className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border-2 border-red-200 space-y-5 animate-in zoom-in-95 duration-200 text-left"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3 text-red-600">
                                <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center shrink-0 shadow-inner">
                                    <AlertCircle className="w-7 h-7 text-red-600 animate-pulse" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-900">Payment Action Alert</h3>
                                    <p className="text-xs text-slate-500 font-medium">Issue encountered during fee confirmation</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setErrorModalMessage(null)}
                                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1.5 rounded-full transition cursor-pointer"
                                title="Close alert"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="bg-red-50/90 border border-red-200 text-red-800 p-4 sm:p-5 rounded-2xl text-xs sm:text-sm font-semibold leading-relaxed break-words space-y-2">
                            <div className="flex items-start gap-2">
                                <span className="text-base shrink-0 mt-0.5">⚠️</span>
                                <div className="space-y-1">
                                    <p className="font-bold text-red-950">{errorModalMessage}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setErrorModalMessage(null);
                                    paymentFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                }}
                                className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer shadow-lg shadow-red-500/20 active:scale-95 text-center"
                            >
                                Dismiss Alert & Review Form
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
