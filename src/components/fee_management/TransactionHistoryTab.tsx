import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { formatBSDate } from '../../lib/nepaliDate';
import { Search, Printer, Edit2, CornerUpLeft, Download, Calendar, Filter, ChevronRight, ChevronDown, Receipt, FileDown, X, Undo2, Plus, Trash2, ArrowUpRight, ArrowDownRight, UserCheck, Lock } from 'lucide-react';
import QRCode from 'react-qr-code';
import { db, auth } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, writeBatch, query, where, getDocs, deleteField, addDoc, serverTimestamp, onSnapshot, getDoc, increment } from 'firebase/firestore';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { NepaliDatePicker } from 'nepali-datepicker-reactjs';
import 'nepali-datepicker-reactjs/dist/index.css';
import NepaliDate from 'nepali-date-converter';
import { exportToPDF } from '../../lib/pdfExport';
import { exportToExcel, exportMultiSheetExcel } from '../../lib/excelExport';
import { recordLedgerAuditLog } from '../../lib/auditLogger';
import { cancelPaymentTransaction } from '../../lib/paymentCancellationEngine';
import { processPaymentRefund, deleteSystemTransactionSafe } from '../../lib/paymentRefundEngine';
import SecurityPasswordConfirmModal from './SecurityPasswordConfirmModal';
const logoImage = "/logo.png";

export default function TransactionHistoryTab({ transactionsData, studentsData = [], onRefresh, initialSearchTerm = '', onSearchTermChange }: { transactionsData: any[], studentsData?: any[], onRefresh: () => void, initialSearchTerm?: string, onSearchTermChange?: (val: string) => void }) {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);

  useEffect(() => {
     setSearchTerm(initialSearchTerm);
  }, [initialSearchTerm]);

  const handleSearchChange = (val: string) => {
     setSearchTerm(val);
     if (onSearchTermChange) onSearchTermChange(val);
  };

  // View States
  const [viewMode, setViewMode] = useState<'combined' | 'fees_only' | 'cash_only'>('combined');
  const [filterClass, setFilterClass] = useState('All');
  const [filterMethod, setFilterMethod] = useState('All');
  const [filterCollectedBy, setFilterCollectedBy] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Sort States
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'name' | 'receipt'>('date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Cash Ledger Entries State
  const [cashEntries, setCashEntries] = useState<any[]>([]);
  const [loadingCash, setLoadingCash] = useState(true);

  // New Cash Entry Modal State
  const [showAddCashModal, setShowAddCashModal] = useState(false);
  const [cashType, setCashType] = useState('Expense');
  const [cashDate, setCashDate] = useState(formatBSDate(new Date()) || '');
  const [cashAmount, setCashAmount] = useState('');
  const [cashCategory, setCashCategory] = useState('');
  const [cashRemarks, setCashRemarks] = useState('');
  const [cashSource, setCashSource] = useState('A/C');
  const [savingCash, setSavingCash] = useState(false);
  const [activeAdminName, setActiveAdminName] = useState<string>('Rahul Sah');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setActiveAdminName('Administrator');
        return;
      }
      if (user.displayName && user.displayName.trim()) {
        setActiveAdminName(user.displayName.trim());
        return;
      }
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
        console.warn('Could not load user profile for operator name:', e);
      }
      setActiveAdminName(user.displayName || user.email?.split('@')[0] || 'Administrator');
    });
    return () => unsub();
  }, []);

  // Modals & Popups States
  const [receipt, setReceipt] = useState<any>(null);
  const [editModalTx, setEditModalTx] = useState<any>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [refundModalTx, setRefundModalTx] = useState<any>(null);
  const [undoModalTx, setUndoModalTx] = useState<any>(null);
  const [deleteCashModalTarget, setDeleteCashModalTarget] = useState<any | null>(null);
  const [deleteTxModalTarget, setDeleteTxModalTarget] = useState<any | null>(null);

  const receiptRef = useRef<HTMLDivElement>(null);

  // Real-time listener for manual cash ledger entries
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'cash_ledger'), (snap) => {
      const entries = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCashEntries(entries);
      setLoadingCash(false);
    }, (err) => {
      console.warn("Failed to load cash ledger", err);
      setLoadingCash(false);
    });
    return () => unsub();
  }, []);

  const handleSaveCashEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashAmount || !cashCategory || !cashDate) return;
    setSavingCash(true);
    try {
      const collector = activeAdminName || 'Rahul Sah';
      const cleanRemarks = cashRemarks.trim();
      const finalRemarks = cleanRemarks 
        ? (cleanRemarks.toLowerCase().includes('collected by:') ? cleanRemarks : `${cleanRemarks} | Collected by: ${collector}`)
        : `Recorded by: ${collector}`;

      await addDoc(collection(db, 'cash_ledger'), {
        type: cashType,
        date: cashDate,
        amount: Number(cashAmount),
        category: cashCategory,
        remarks: finalRemarks,
        collectedBy: collector,
        createdBy: collector,
        expenseSource: cashType === 'Expense' ? cashSource : null,
        timestamp: serverTimestamp()
      });
      setShowAddCashModal(false);
      setCashAmount('');
      setCashCategory('');
      setCashRemarks('');
      setCashType('Expense');
      setCashSource('A/C');
    } catch (err) {
      console.error("Failed to add cash entry", err);
      alert("Failed to add ledger entry");
    }
    setSavingCash(false);
  };

  const handleDeleteCashEntry = (id: string) => {
    const targetEntry = cashEntries.find(c => c.id === id);
    if (targetEntry) {
      setDeleteCashModalTarget(targetEntry);
    } else {
      setDeleteCashModalTarget({ id, category: 'Cash Entry', amount: 0 });
    }
  };

  const handleExecuteDeleteCashEntry = async ({ adminName, adminEmail, reason }: { adminName: string; adminEmail: string; reason: string }) => {
    if (!deleteCashModalTarget) return;
    const targetEntry = deleteCashModalTarget;
    try {
      if (targetEntry.category === 'Fee Collection' || targetEntry.transactionId || targetEntry.sourceTransactionId || targetEntry.relatedTransactionId) {
        alert("Financial Integrity Protection: This cash ledger entry is linked to an institutional fee transaction. It cannot be deleted directly. Please use the official Refund or Payment Cancellation workflow.");
        setDeleteCashModalTarget(null);
        return;
      }

      const batch = writeBatch(db);
      batch.delete(doc(db, 'cash_ledger', targetEntry.id));
      await batch.commit();

      await recordLedgerAuditLog({
        transactionId: targetEntry.id,
        receipt: targetEntry.receipt || targetEntry.id,
        studentName: targetEntry.category || 'Cash Register Entry',
        studentClass: '-',
        actionType: 'TRANSACTION_DELETED',
        previousValue: targetEntry ? `Type: ${targetEntry.type || 'Expense'} | Category: ${targetEntry.category} | Amount: NRs. ${Number(targetEntry.amount || 0).toLocaleString()} | Remarks: ${targetEntry.remarks || 'None'}` : `Cash Entry ID: ${targetEntry.id}`,
        newValue: 'CASH REGISTER ENTRY PERMANENTLY REMOVED',
        reason: reason || 'Cash register entry deleted with password verification',
        adminName,
        adminEmail
      });

      setDeleteCashModalTarget(null);
    } catch (err) {
      console.error("Failed to delete cash entry", err);
      throw err;
    }
  };

  const downloadReceipt = async () => {
    if (!receiptRef.current || !receipt) return;
    try {
      const el = receiptRef.current;
      const w = el.offsetWidth;
      const h = el.scrollHeight;
      const dataUrl = await toPng(el, { 
        cacheBust: true, 
        pixelRatio: 2,
        width: w,
        height: h,
        style: { width: `${w}px`, height: `${h}px`, transform: 'scale(1)', transformOrigin: 'top left' }
      });
      const pdfWidth = 210;
      const pdfHeight = (h * pdfWidth) / w;
      const pdf = new jsPDF('p', 'mm', [pdfWidth, pdfHeight]);
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Receipt_${receipt.receipt || receipt.receiptNo || receipt.id}.pdf`);
    } catch (err) {
      console.error('Failed to generate PDF', err);
    }
  };

  const handleBrowserPrint = () => {
     if (!receipt) return;

     const receiptNo = receipt.receipt || receipt.receiptNo || receipt.id || '-';
     const date = receipt.date || formatBSDate(new Date());

     let htmlContent = '';

     if (receipt.isSystem) {
         const studentName = receipt.studentName || '';
         const rollNo = receipt.rollNo || receipt.rollNumber || '-';
         const className = receipt.class || '';
         const method = receipt.method || 'Cash';
         const amount = receipt.amount || 0;

         const baseAmount = Number(receipt.breakdown?.tuition || (receipt.amount + (receipt.discount || 0) - (receipt.additionalCharge || 0)));
         const additionalCharge = Number(receipt.additionalCharge || receipt.breakdown?.additionalCharge || 0);
         const discount = Number(receipt.discount || receipt.breakdown?.discount || 0);
         const totalPayable = baseAmount + additionalCharge - discount;
         const cashPaid = Number(amount || 0);
         const changeToReturn = Math.max(0, cashPaid - totalPayable);
         const balanceDue = Math.max(0, totalPayable - cashPaid);

         const ledgerPageNo = receipt.ledgerPageNo || receipt.breakdown?.ledgerPageNo || '';
         const remarks = receipt.remarks || receipt.breakdown?.remarks || '';
         
         const isRemitBill = !!receipt.remitBillId || (receipt.remarks && (receipt.remarks.includes('Remit Bill') || receipt.remarks.includes('Remit')));
         const titlePurpose = isRemitBill ? 'REMIT BILL RECEIPT' : (receipt.breakdown?.mode ? `${receipt.breakdown.mode.toUpperCase()} PAYMENT` : 'FEE PAYMENT');

         let lineItemDesc = 'Base Fee / Tuition dues';
         let lineItemSub = `Covering fee for: ${receipt.breakdown?.mode || 'Outstanding dues'}`;
         
         if (isRemitBill) {
             lineItemDesc = 'Remit Bill Clearance';
             lineItemSub = receipt.remarks || 'Clearance of distributed remit bill';
         }

         if (receipt.months && Array.isArray(receipt.months) && receipt.months.length > 0) {
             lineItemSub += ` | Months: ${receipt.months.join(', ')}`;
         }

         htmlContent = `
             <!DOCTYPE html>
             <html>
             <head>
                 <title>Receipt - ${receiptNo}</title>
                 <style>
                     @media print {
                         @page {
                             size: auto;
                             margin: 0.15in 0.25in;
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
                             padding: 4px !important;
                             margin: 0 !important;
                             max-width: 100% !important;
                         }
                     }
                     body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.35; padding: 10px; background-color: #fff; }
                     .receipt-container { max-width: 650px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 15px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); position: relative; overflow: hidden; }
                     .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 280px; height: 280px; background-image: url('/logo.png'); background-size: contain; background-repeat: no-repeat; background-position: center; opacity: 0.04; pointer-events: none; z-index: 0; }
                     .header, .receipt-title-bar, .info-grid, table, .summary-box, .notes-box, .footer { position: relative; z-index: 10; }
                     .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #10b981; padding-bottom: 6px; margin-bottom: 10px; }
                     .header-left { display: flex; align-items: center; gap: 10px; }
                     .school-logo { width: 55px; height: 55px; object-fit: contain; }
                     .school-name { font-size: 18px; font-weight: 800; margin: 0; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.5px; }
                     .school-info { font-size: 10px; color: #4b5563; margin: 2px 0 0; line-height: 1.2; }
                     .receipt-badge { background-color: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; font-size: 9px; font-weight: 800; padding: 2px 7px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 1px; }
                     .receipt-title-bar { text-align: center; margin: 6px 0; }
                     .receipt-title { font-size: 14px; font-weight: 800; color: #111827; text-transform: uppercase; letter-spacing: 1px; display: inline-block; border-bottom: 3px solid #10b981; padding-bottom: 2px; }
                     .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; margin-bottom: 10px; font-size: 11px; color: #374151; background-color: #f9fafb; padding: 8px; border-radius: 8px; border: 1px solid #f3f4f6; }
                     .info-item span { font-weight: 600; color: #6b7280; text-transform: uppercase; font-size: 8px; display: block; margin-bottom: 1px; }
                     .info-item strong { font-size: 11px; color: #111827; }
                     table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 11px; }
                     th { background-color: #f3f4f6; font-weight: 700; text-transform: uppercase; font-size: 8px; color: #4b5563; padding: 4px 8px; text-align: left; border-bottom: 2px solid #e5e7eb; }
                     td { padding: 4px 8px; border-bottom: 1px solid #f3f4f6; color: #1f2937; }
                     .text-right { text-align: right; }
                     .font-mono { font-family: monospace; }
                     .summary-box { margin-top: 6px; border-top: 1px dashed #d1d5db; padding-top: 6px; }
                     .summary-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
                     .summary-row.grand-total { font-size: 12px; font-weight: 700; color: #111827; margin-top: 2px; }
                     .summary-row.net-payable { font-size: 13px; font-weight: 800; color: #15803d; background-color: #f0fdf4; padding: 4px 6px; border-radius: 6px; border: 1px solid #bbf7d0; margin-top: 3px; }
                     .summary-row.balance-due { font-weight: 800; color: #b91c1c; background-color: #fef2f2; padding: 4px 6px; border-radius: 6px; border: 1px solid #fecaca; margin-top: 3px; }
                     .notes-box { margin-top: 8px; padding: 6px 10px; background-color: #fcfcfc; border: 1px dashed #e5e7eb; border-radius: 6px; font-size: 10px; color: #6b7280; }
                     .footer { margin-top: 15px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 10px; }
                     .signature-area { text-align: center; width: 140px; }
                     .signature-line { border-top: 1px solid #9ca3af; margin-bottom: 3px; width: 100%; }
                     .signature-title { color: #4b5563; font-weight: 600; font-size: 9px; }
                 </style>
             </head>
             <body>
                 <div class="receipt-container">
                     <div class="watermark"></div>
                     <!-- Header -->
                     <div class="header">
                         <div class="header-left">
                             <img class="school-logo" src="/logo.png" onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=S+A&background=10b981&color=fff&size=100&bold=true';" alt="Logo" />
                             <div>
                                 <h1 class="school-name">SHIKSHANTAR ACADEMY</h1>
                                 <p class="school-info">Karjanhana Municipality, Bastipur-5, Siraha, Nepal</p>
                                 <p class="school-info">Phone: +977 9709867048, +977 9807790805 | Email: academyshikshantar@gmail.com</p>
                             </div>
                         </div>
                         <div>
                             <span class="receipt-badge">OFFICIAL REPRINT</span>
                         </div>
                     </div>

                     <div class="receipt-title-bar">
                         <div class="receipt-title">${titlePurpose}</div>
                     </div>

                     <!-- Student & Bill Info -->
                     <div class="info-grid">
                         <div class="info-item">
                             <span>Receipt No</span>
                             <strong class="font-mono" style="color: #1e3a8a;">${receiptNo}</strong>
                         </div>
                         <div class="info-item" style="text-align: right;">
                             <span>Date (B.S.)</span>
                             <strong>${date}</strong>
                         </div>
                         <div class="info-item">
                             <span>Student Name</span>
                             <strong>${studentName}</strong>
                         </div>
                         <div class="info-item" style="text-align: right;">
                             <span>Class</span>
                             <strong>Class ${className} | Roll: ${rollNo}</strong>
                         </div>
                         <div class="info-item">
                             <span>Payment Mode</span>
                             <strong>${method || 'Cash'}</strong>
                         </div>
                         <div class="info-item" style="text-align: right;">
                             <span>Handwritten Ledger Ref</span>
                             <strong style="color: #2563eb;">${ledgerPageNo || '-'}</strong>
                         </div>
                     </div>

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
                                     <strong>${lineItemDesc}</strong><br/>
                                     <span style="font-size: 10px; color: #6b7280; line-height: 1.2; display: block;">${lineItemSub}</span>
                                 </td>
                                 <td class="text-right font-mono">NRs. ${baseAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                             </tr>
                             ${additionalCharge > 0 ? `
                             <tr>
                                 <td>
                                     <strong>Additional Charges</strong><br/>
                                     <span style="font-size: 10px; color: #6b7280; line-height: 1.2; display: block;">Other activities, transport, stationary or miscellaneous services</span>
                                 </td>
                                 <td class="text-right font-mono">NRs. ${additionalCharge.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                             </tr>
                             ` : ''}
                             ${discount > 0 ? `
                             <tr>
                                 <td>
                                     <strong>Scholarship / Discount Applied</strong><br/>
                                     <span style="font-size: 10px; color: #6b7280; line-height: 1.2; display: block;">Approved sibling or waiver programs</span>
                                 </td>
                                 <td class="text-right font-mono" style="color: #b91c1c;">- NRs. ${discount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                             </tr>
                             ` : ''}
                         </tbody>
                     </table>

                     <!-- Calculations & Totals -->
                     <div class="summary-box">
                         <div class="summary-row">
                             <span>Total Charges (Base + Addl):</span>
                             <span class="font-mono">NRs. ${(baseAmount + additionalCharge).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                         </div>
                         ${discount > 0 ? `
                         <div class="summary-row" style="color: #b91c1c;">
                             <span>Scholarship / Discount Applied:</span>
                             <span class="font-mono">- NRs. ${discount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                         </div>
                         ` : ''}
                         <div class="summary-row net-payable">
                             <span>Net Payable Amount:</span>
                             <span class="font-mono">NRs. ${totalPayable.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                         </div>
                         <div class="summary-row">
                             <span>Cash Paid / Received:</span>
                             <span class="font-mono" style="font-weight: bold;">NRs. ${cashPaid.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                         </div>
                         ${changeToReturn > 0 ? `
                         <div class="summary-row" style="color: #2563eb;">
                             <span>Change Returned to Patron:</span>
                             <span class="font-mono">NRs. ${changeToReturn.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                         </div>
                         ` : ''}
                         <div class="summary-row balance-due" style="color: ${balanceDue > 0 ? '#b91c1c' : '#166534'}; background-color: ${balanceDue > 0 ? '#fef2f2' : '#f0fdf4'}; border-color: ${balanceDue > 0 ? '#fecaca' : '#bbf7d0'};">
                             <span>Balance Due / Outstanding:</span>
                             <span class="font-mono">NRs. ${balanceDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                         </div>
                     </div>

                     <!-- Remarks -->
                     ${remarks ? `
                     <div class="notes-box">
                         <strong>Notes / Remarks:</strong> ${remarks}
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
                             <div class="signature-title">Authorized Cashier</div>
                         </div>
                     </div>
                 </div>
             </body>
             </html>
         `;
     } else {
         const baseAmount = Number(receipt.amount || 0);
         const remarks = receipt.remarks || '';
         
         const titlePurpose = `${receipt.type?.toUpperCase() || 'CASH'} VOUCHER`;
         const isExpense = receipt.type?.toUpperCase() === 'EXPENSE';
         const badgeText = isExpense ? 'EXPENSE RECORD' : 'OFFICE RECORD';
         const badgeBg = isExpense ? '#fef2f2' : '#f0fdf4';
         const badgeBorder = isExpense ? '#fecaca' : '#bbf7d0';
         const badgeColor = isExpense ? '#b91c1c' : '#166534';

         htmlContent = `
             <!DOCTYPE html>
             <html>
             <head>
                 <title>Receipt - ${receiptNo}</title>
                 <style>
                     @media print {
                         @page {
                             size: auto;
                             margin: 0.15in 0.25in;
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
                             padding: 4px !important;
                             margin: 0 !important;
                             max-width: 100% !important;
                         }
                     }
                     body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.35; padding: 10px; background-color: #fff; }
                     .receipt-container { max-width: 650px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 15px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); position: relative; overflow: hidden; }
                     .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 280px; height: 280px; background-image: url('/logo.png'); background-size: contain; background-repeat: no-repeat; background-position: center; opacity: 0.04; pointer-events: none; z-index: 0; }
                     .header, .receipt-title-bar, .info-grid, table, .summary-box, .notes-box, .footer { position: relative; z-index: 10; }
                     .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #10b981; padding-bottom: 6px; margin-bottom: 10px; }
                     .header-left { display: flex; align-items: center; gap: 10px; }
                     .school-logo { width: 55px; height: 55px; object-fit: contain; }
                     .school-name { font-size: 18px; font-weight: 800; margin: 0; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.5px; }
                     .school-info { font-size: 10px; color: #4b5563; margin: 2px 0 0; line-height: 1.2; }
                     .receipt-badge { background-color: ${badgeBg}; border: 1px solid ${badgeBorder}; color: ${badgeColor}; font-size: 9px; font-weight: 800; padding: 2px 7px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 1px; }
                     .receipt-title-bar { text-align: center; margin: 6px 0; }
                     .receipt-title { font-size: 14px; font-weight: 800; color: #111827; text-transform: uppercase; letter-spacing: 1px; display: inline-block; border-bottom: 3px solid #10b981; padding-bottom: 2px; }
                     .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; margin-bottom: 10px; font-size: 11px; color: #374151; background-color: #f9fafb; padding: 8px; border-radius: 8px; border: 1px solid #f3f4f6; }
                     .info-item span { font-weight: 600; color: #6b7280; text-transform: uppercase; font-size: 8px; display: block; margin-bottom: 1px; }
                     .info-item strong { font-size: 11px; color: #111827; }
                     table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 11px; }
                     th { background-color: #f3f4f6; font-weight: 700; text-transform: uppercase; font-size: 8px; color: #4b5563; padding: 4px 8px; text-align: left; border-bottom: 2px solid #e5e7eb; }
                     td { padding: 4px 8px; border-bottom: 1px solid #f3f4f6; color: #1f2937; }
                     .text-right { text-align: right; }
                     .font-mono { font-family: monospace; }
                     .summary-box { margin-top: 6px; border-top: 1px dashed #d1d5db; padding-top: 6px; }
                     .summary-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
                     .summary-row.grand-total { font-size: 12px; font-weight: 700; color: #111827; margin-top: 2px; }
                     .notes-box { margin-top: 8px; padding: 6px 10px; background-color: #fcfcfc; border: 1px dashed #e5e7eb; border-radius: 6px; font-size: 10px; color: #6b7280; }
                     .footer { margin-top: 15px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 10px; }
                     .signature-area { text-align: center; width: 140px; }
                     .signature-line { border-top: 1px solid #9ca3af; margin-bottom: 3px; width: 100%; }
                     .signature-title { color: #4b5563; font-weight: 600; font-size: 9px; }
                 </style>
             </head>
             <body>
                 <div class="receipt-container">
                     <div class="watermark"></div>
                     <!-- Header -->
                     <div class="header">
                         <div class="header-left">
                             <img class="school-logo" src="/logo.png" onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=S+A&background=10b981&color=fff&size=100&bold=true';" alt="Logo" />
                             <div>
                                 <h1 class="school-name">SHIKSHANTAR ACADEMY</h1>
                                 <p class="school-info">Karjanhana Municipality, Bastipur-5, Siraha, Nepal</p>
                                 <p class="school-info">Phone: +977 9709867048, +977 9807790805 | Email: academyshikshantar@gmail.com</p>
                             </div>
                         </div>
                         <div>
                             <span class="receipt-badge">${badgeText}</span>
                         </div>
                     </div>

                     <div class="receipt-title-bar">
                         <div class="receipt-title">${titlePurpose}</div>
                     </div>

                     <!-- Student & Bill Info -->
                     <div class="info-grid">
                         <div class="info-item">
                             <span>Voucher Reference No</span>
                             <strong class="font-mono" style="color: #1e3a8a;">${receiptNo}</strong>
                         </div>
                         <div class="info-item" style="text-align: right;">
                             <span>Date (B.S.)</span>
                             <strong>${date}</strong>
                         </div>
                         <div class="info-item">
                             <span>Category</span>
                             <strong>${receipt.category || '-'}</strong>
                         </div>
                         <div class="info-item" style="text-align: right;">
                             <span>Ledger Source</span>
                             <strong>${receipt.expenseSource || 'General Ledger'}</strong>
                         </div>
                     </div>

                     <!-- Detailed Description Table -->
                     <table>
                         <thead>
                             <tr>
                                 <th>Description</th>
                                 <th class="text-right" style="width: 150px;">Amount (NRs.)</th>
                             </tr>
                         </thead>
                         <tbody>
                             <tr>
                                 <td>
                                     <strong>${receipt.category || '-'} Voucher</strong><br/>
                                     <span style="font-size: 10px; color: #6b7280; line-height: 1.2; display: block;">Remarks: ${remarks || '-'}</span>
                                 </td>
                                 <td class="text-right font-mono">NRs. ${baseAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                              </tr>
                         </tbody>
                      </table>

                      <!-- Calculations & Totals -->
                      <div class="summary-box">
                          <div class="summary-row grand-total">
                              <span>Total Amount Paid / Received:</span>
                              <span class="font-mono" style="color: #10b981; font-weight: 800;">NRs. ${baseAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                          </div>
                      </div>

                      <!-- Footer -->
                      <div class="footer">
                          <div>
                              <p style="margin: 0; font-size: 10px; color: #9ca3af; font-family: monospace;">SYSTEM GEN ID: ${receiptNo}</p>
                          </div>
                          <div class="signature-area">
                              <div class="signature-line"></div>
                              <div class="signature-title">Authorized Cashier</div>
                          </div>
                      </div>
                  </div>
              </body>
              </html>
          `;
      }

      // Print via a sandboxed-safe dynamic iframe instead of window.open()
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      
      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.write(htmlContent);
        doc.close();
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          document.body.removeChild(iframe);
        }, 500);
      }
   };

  // Helper to resolve the professional collector / administrator name
  const resolveCollectorName = (tx: any): string => {
    if (tx.collectedBy && tx.collectedBy !== 'Admin' && tx.collectedBy !== 'Administrator') {
      return String(tx.collectedBy).trim();
    }
    if (tx.createdBy && tx.createdBy !== 'Admin' && tx.createdBy !== 'Administrator') {
      return String(tx.createdBy).trim();
    }
    if (tx.cashierName && tx.cashierName !== 'Administrator') {
      return String(tx.cashierName).trim();
    }
    if (tx.recordedBy) {
      return String(tx.recordedBy).trim();
    }
    if (tx.remarks && typeof tx.remarks === 'string') {
      const match = tx.remarks.match(/Collected by:\s*([^|,\n]+)/i) || tx.remarks.match(/Recorded by:\s*([^|,\n]+)/i) || tx.remarks.match(/Handled by:\s*([^|,\n]+)/i);
      if (match && match[1] && match[1].trim()) {
        return match[1].trim();
      }
    }
    return activeAdminName || 'Rahul Sah';
  };

  // Helper to resolve professional particular name
  const resolveParticularName = (tx: any): string => {
    if (!tx.isSystem) {
      return tx.category ? `${tx.category} Expense/Voucher` : 'General Ledger Voucher';
    }
    const studentPart = tx.studentName || 'Student';
    const classPart = tx.class ? ` (Class ${tx.class})` : '';
    if (tx.remitBillId || (tx.remarks && tx.remarks.includes('Remit Bill'))) {
      return `Remit Bill Fee Clearance - ${studentPart}${classPart}`;
    }
    if (tx.months && Array.isArray(tx.months) && tx.months.length > 0) {
      return `Monthly Tuition Fee Clearance (${tx.months.join(', ')}) - ${studentPart}${classPart}`;
    }
    if (tx.breakdown?.mode) {
      return `Fee Payment (${tx.breakdown.mode}) - ${studentPart}${classPart}`;
    }
    return `Student Fee Collection - ${studentPart}${classPart}`;
  };

  // Helper to ensure remarks always contain professional description and "Collected by: [Name]"
  const resolveFormattedRemarks = (tx: any): string => {
    const collector = resolveCollectorName(tx);
    let originalRemarks = tx.remarks ? String(tx.remarks).trim() : '';
    if (!originalRemarks) {
      originalRemarks = tx.isSystem ? 'School Fee Payment Clearance' : (tx.category || 'Office Cash Entry');
    }
    if (!originalRemarks.toLowerCase().includes('collected by:') && !originalRemarks.toLowerCase().includes('recorded by:')) {
      return `${originalRemarks} | Collected by: ${collector}`;
    }
    return originalRemarks;
  };

  // Merge transactions Data and custom Cash Ledger Entries
  const enrichedTransactions = useMemo(() => {
    return transactionsData.map(tx => {
      const student = studentsData?.find(s => s.id === tx.studentId || (s.studentId && s.studentId === tx.studentId));
      const studentName = tx.studentName || student?.name || 'Unknown Student';
      const studentClass = tx.class || student?.class || '';
      const collector = resolveCollectorName(tx);
      const tempTx = { ...tx, studentName, class: studentClass, collectedBy: collector, isSystem: true };
      const particulars = resolveParticularName(tempTx);
      const remarks = resolveFormattedRemarks(tempTx);
      return {
        ...tx,
        studentName,
        class: studentClass,
        isSystem: true,
        type: 'Income',
        category: 'Fee Collection',
        particulars,
        remarks,
        collectedBy: collector
      };
    });
  }, [transactionsData, studentsData, activeAdminName]);

  const processedCashEntries = useMemo(() => {
    return cashEntries
      .filter(e => e.category !== 'Fee Collection')
      .map(e => {
        const collector = resolveCollectorName(e);
        const tempTx = { ...e, isSystem: false, collectedBy: collector };
        const particulars = resolveParticularName(tempTx);
        const remarks = resolveFormattedRemarks(tempTx);
        return {
          ...e,
          id: e.id,
          isSystem: false,
          studentName: '',
          class: '',
          particulars,
          remarks,
          status: 'SUCCESS',
          method: 'Cash',
          collectedBy: collector
        };
      });
  }, [cashEntries, activeAdminName]);

  // Select dataset based on viewMode
  const combinedList = useMemo(() => {
    if (viewMode === 'combined') {
      return [...enrichedTransactions, ...processedCashEntries];
    } else if (viewMode === 'fees_only') {
      return enrichedTransactions;
    } else {
      return processedCashEntries;
    }
  }, [viewMode, enrichedTransactions, processedCashEntries]);

  // Extract all unique collectors for dynamic filter dropdown
  const uniqueCollectors = useMemo(() => {
    const set = new Set<string>();
    combinedList.forEach(tx => {
      if (tx.collectedBy) set.add(tx.collectedBy);
    });
    if (activeAdminName) set.add(activeAdminName);
    return Array.from(set).sort();
  }, [combinedList, activeAdminName]);

  const generatePDFReport = async () => {
    const columns = ['Date (B.S.)', 'Receipt No', 'Particulars & Payee', 'Remarks & Notes', 'Collected By', 'Class', 'Amount', 'Method', 'Status'];
    const body = sortedHistory.map(tx => [
      tx.date || '',
      tx.receipt || tx.id || '',
      tx.particulars || (tx.isSystem ? tx.studentName : tx.category),
      tx.remarks || '-',
      tx.collectedBy || 'Admin',
      tx.class || '-',
      `NRs. ${Number(tx.amount || 0).toLocaleString()}`,
      tx.method || 'Cash',
      tx.status || 'SUCCESS'
    ]);

    await exportToPDF('Combined Cash Ledger & Transaction Report', columns, body, `Transaction_Report_${formatBSDate(new Date())}`, false);
  };

  // Filter List
  const filteredHistory = combinedList.filter(tx => {
     const st = (searchTerm || '').toLowerCase();
     
     const studentNameMatch = tx.studentName ? String(tx.studentName).toLowerCase().includes(st) : false;
     const idMatch = tx.id ? String(tx.id).toLowerCase().includes(st) : false;
     const particularsMatch = tx.particulars ? String(tx.particulars).toLowerCase().includes(st) : false;
     const receiptMatch = tx.receipt ? String(tx.receipt).toLowerCase().includes(st) : false;
     const classMatchStr = tx.class ? String(tx.class).toLowerCase().includes(st) : false;
     const categoryMatch = tx.category ? String(tx.category).toLowerCase().includes(st) : false;

     const matchSearch = studentNameMatch || idMatch || particularsMatch || receiptMatch || classMatchStr || categoryMatch;

     const matchClass = tx.isSystem ? (filterClass === 'All' || tx.class === filterClass) : (filterClass === 'All');
     const matchMethod = filterMethod === 'All' || tx.method === filterMethod;
     
     let txDateStr = tx.date || '';
     if (!txDateStr && tx.timestamp) {
         try {
             const d = new Date(tx.timestamp.seconds ? tx.timestamp.seconds * 1000 : tx.timestamp);
             const nd = new NepaliDate(d);
             txDateStr = nd.format("YYYY-MM-DD");
         } catch(e) {}
     }
     
     const matchFromDate = !fromDate || (txDateStr && txDateStr >= fromDate);
     const matchToDate = !toDate || (txDateStr && txDateStr <= toDate);
     const matchCollectedBy = filterCollectedBy === 'All' || tx.collectedBy === filterCollectedBy;

     return matchSearch && matchClass && matchMethod && matchFromDate && matchToDate && matchCollectedBy;
  });

  // Sort List based on user choices for date, amount, particulars/student, receipt no
  const sortedHistory = [...filteredHistory].sort((a, b) => {
     let valA: any = '';
     let valB: any = '';

     if (sortBy === 'date') {
        const dateA = a.date || '';
        const dateB = b.date || '';
        if (dateA !== dateB) {
           return sortOrder === 'desc' 
              ? (dateB > dateA ? 1 : -1) 
              : (dateA > dateB ? 1 : -1);
        }
        const timeA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : new Date(a.timestamp || 0).getTime();
        const timeB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : new Date(b.timestamp || 0).getTime();
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
     } else if (sortBy === 'amount') {
        valA = Number(a.amount || 0);
        valB = Number(b.amount || 0);
     } else if (sortBy === 'name') {
        valA = String(a.isSystem ? a.studentName : a.particulars).toLowerCase();
        valB = String(b.isSystem ? b.studentName : b.particulars).toLowerCase();
     } else if (sortBy === 'receipt') {
        valA = String(a.receipt || a.id || '').toLowerCase();
        valB = String(b.receipt || b.id || '').toLowerCase();
     }

     if (valA < valB) return sortOrder === 'desc' ? 1 : -1;
     if (valA > valB) return sortOrder === 'desc' ? -1 : 1;
     return 0;
  });

  // Calculation Stats
  const totalFilteredAmount = sortedHistory.filter(tx => (tx.status === 'SUCCESS' || tx.status === 'OVERRIDE_SUCCESS') && tx.type === 'Income').reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const totalRefunded = sortedHistory.filter(tx => tx.status === 'REFUNDED' || tx.status === 'CANCELLED').reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const totalExpenses = sortedHistory.filter(tx => tx.type === 'Expense').reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const closingBalance = totalFilteredAmount - totalExpenses;
  
  const methodsBreakdown = sortedHistory.filter(tx => (tx.status === 'SUCCESS' || tx.status === 'OVERRIDE_SUCCESS') && tx.type === 'Income').reduce((acc: any, tx) => {
      const m = tx.method || 'Cash';
      acc[m] = (acc[m] || 0) + (Number(tx.amount) || 0);
      return acc;
  }, {});

  const exportExcel = async () => {
    const columns = [
       { header: 'Date (B.S.)', key: 'dateBs', width: 15 },
       { header: 'Date (A.D.)', key: 'dateAd', width: 22 },
       { header: 'Type', key: 'type', width: 12 },
       { header: 'Receipt / Ref No', key: 'receiptNo', width: 18 },
       { header: 'Particulars & Payee', key: 'particulars', width: 35 },
       { header: 'Remarks (with Collector)', key: 'remarks', width: 35 },
       { header: 'Collected By', key: 'collectedBy', width: 20 },
       { header: 'Class', key: 'studentClass', width: 12 },
       { header: 'Amount (NRs.)', key: 'amount', width: 15 },
       { header: 'Method', key: 'method', width: 12 },
       { header: 'Status', key: 'status', width: 12 }
    ];

    const formatTx = (tx: any) => {
       let adDate = '';
       if (tx.timestamp) {
           adDate = new Date(tx.timestamp.seconds ? tx.timestamp.seconds * 1000 : tx.timestamp).toLocaleString();
       }
       return {
           dateBs: tx.date || '',
           dateAd: adDate,
           type: tx.type || 'Income',
           receiptNo: tx.receipt || tx.id || '-',
           particulars: tx.particulars || (tx.isSystem ? tx.studentName : tx.category),
           remarks: tx.remarks || '-',
           collectedBy: tx.collectedBy || 'Admin',
           studentClass: tx.class || '-',
           amount: Number(tx.amount || 0),
           method: tx.method || 'Cash',
           status: tx.status || 'SUCCESS'
       };
    };

    const sheetsConfigs: any[] = [];

    sheetsConfigs.push({
      sheetName: 'All Transactions',
      title: 'Daily Cash Register & Transaction Report',
      columns: columns,
      data: sortedHistory.map(formatTx)
    });

    const uniqueClasses = Array.from(new Set(sortedHistory.filter(tx => tx.isSystem).map(tx => tx.class || 'Unknown_Class'))).sort();
    uniqueClasses.forEach(cls => {
      const classTx = sortedHistory.filter(tx => tx.isSystem && (tx.class || 'Unknown_Class') === cls);
      if (classTx.length > 0) {
        sheetsConfigs.push({
          sheetName: `Class ${cls}`,
          title: `Transaction History Report - Class ${cls}`,
          columns: columns,
          data: classTx.map(formatTx)
         });
      }
    });

    await exportMultiSheetExcel('Combined_Cash_Book', sheetsConfigs);
  };

   const handleEditSubmit = async () => {
     if (!editAmount || !editModalTx) return;
     try {
          const batch = writeBatch(db);
          const oldAmount = editModalTx.amount || 0;
          const newAmt = Number(editAmount);
          const oldRemarks = editModalTx.remarks || '';
          const isLinkedOrSystem = Boolean(editModalTx.isSystem || editModalTx.category === 'Fee Collection' || editModalTx.transactionId || editModalTx.sourceTransactionId);
          
          if (isLinkedOrSystem) {
              // System transaction amounts and fee-linked collections are strictly immutable!
              if (editModalTx.isSystem) {
                  const txRef = doc(db, 'transactions', editModalTx.id);
                  batch.update(txRef, {
                      remarks: (oldRemarks ? oldRemarks + '\n' : '') + `Admin Note: ${editRemarks}`
                  });
              } else {
                  const txRef = doc(db, 'cash_ledger', editModalTx.id);
                  batch.update(txRef, {
                      remarks: (oldRemarks ? oldRemarks + '\n' : '') + `Admin Note: ${editRemarks}`
                  });
              }
          } else {
              const txRef = doc(db, 'cash_ledger', editModalTx.id);
              batch.update(txRef, {
                  amount: newAmt,
                  remarks: (oldRemarks ? oldRemarks + '\n' : '') + `Edited: ${editRemarks}`
              });
          }
          
          await batch.commit();

          await recordLedgerAuditLog({
              transactionId: editModalTx.id,
              receipt: editModalTx.receipt || editModalTx.id,
              studentId: editModalTx.studentId || '',
              studentName: editModalTx.studentName || editModalTx.category || 'General Ledger',
              studentClass: editModalTx.class || '-',
              actionType: isLinkedOrSystem ? 'REMARKS_MODIFIED' : 'AMOUNT_MODIFIED',
              previousValue: `Amount: NRs. ${Number(oldAmount).toLocaleString()} | Particulars: ${editModalTx.isSystem ? (editModalTx.studentName + ' (' + (editModalTx.class || '-') + ')') : editModalTx.category} | Remarks: ${oldRemarks || 'None'}`,
              newValue: isLinkedOrSystem 
                ? `Amount: NRs. ${Number(oldAmount).toLocaleString()} (Protected Immutable) | Remarks: ${editRemarks || 'Modified by Admin'}`
                : `Amount: NRs. ${newAmt.toLocaleString()} | Updated Remarks: ${editRemarks || 'Modified by Admin'}`,
              reason: editRemarks.trim() || 'Particulars/remarks modified by administrator',
              adminName: activeAdminName
          });

          setEditModalTx(null);
          onRefresh();
     } catch (err) {
          console.error(err);
          alert("Failed to edit transaction");
     }
  };

  const handleExecuteRefund = async ({ adminName, adminEmail, reason }: { adminName: string; adminEmail: string; reason: string }) => {
       if (!refundModalTx) return;
       const tx = refundModalTx;
       try {
          await processPaymentRefund({
              transactionId: tx.id,
              paymentGroupId: tx.paymentGroupId,
              adminName,
              adminEmail,
              reason: reason || 'Administrative refund & fee balance reversal'
          });

          setRefundModalTx(null);
          onRefresh();
       } catch(err: any) {
          console.error("Refund failed", err);
          alert(`Refund failed: ${err.message || 'An error occurred during refund processing.'}`);
          throw err;
       }
  };

  const isUndoable = (tx: any) => {
     if (!tx.isSystem) return false; // Only student payments are undoable in the 3h window
     if (!tx.timestamp) return false;
     const txTime = tx.timestamp.seconds ? tx.timestamp.seconds * 1000 : new Date(tx.timestamp).getTime();
     const diffHours = (Date.now() - txTime) / (1000 * 60 * 60);
     return diffHours <= 3; // Within 3 hours limit
  };

  const handleExecuteUndo = async ({ adminName, adminEmail, reason }: { adminName: string; adminEmail: string; reason: string }) => {
     if (!undoModalTx) return;
     const tx = undoModalTx;
     try {
        await cancelPaymentTransaction({
            transactionId: tx.id,
            paymentGroupId: tx.paymentGroupId,
            adminName,
            adminEmail,
            reason: reason || 'Instant payment undo within 3-hour operator window with password verification'
        });

        setUndoModalTx(null);
        onRefresh();
     } catch(err) {
        console.error("Undo failed", err);
        throw err;
     }
  };

  const handleDeleteSystemTransaction = (tx: any) => {
     setDeleteTxModalTarget(tx);
  };

  const handleExecuteDeleteSystemTransaction = async ({ adminName, adminEmail, reason }: { adminName: string; adminEmail: string; reason: string }) => {
     if (!deleteTxModalTarget) return;
     const tx = deleteTxModalTarget;
     try {
        await deleteSystemTransactionSafe({
            transactionId: tx.id,
            adminName,
            adminEmail,
            reason: reason || 'Sandbox test transaction cleanup'
        });

        setDeleteTxModalTarget(null);
        onRefresh();
     } catch(err: any) {
        console.error("Delete transaction failed", err);
        alert(`Action Blocked: ${err.message || 'Physical deletion of institutional financial vouchers is strictly prohibited.'}`);
        setDeleteTxModalTarget(null);
     }
  };

  return (
    <div className="space-y-6 pb-24">
       {/* Combined Concept Tabs and Add Custom Ledger Button */}
       <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex bg-gray-100 p-1 rounded-xl w-full sm:w-auto max-w-lg">
             <button 
                onClick={() => setViewMode('combined')} 
                className={`flex-1 sm:flex-initial text-center px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${viewMode === 'combined' ? 'bg-primary text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
             >
                Unified Day Book
             </button>
             <button 
                onClick={() => setViewMode('fees_only')} 
                className={`flex-1 sm:flex-initial text-center px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${viewMode === 'fees_only' ? 'bg-primary text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
             >
                Student Fees Only
             </button>
             <button 
                onClick={() => setViewMode('cash_only')} 
                className={`flex-1 sm:flex-initial text-center px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${viewMode === 'cash_only' ? 'bg-primary text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
             >
                Office Ledger
             </button>
          </div>
          <button 
             onClick={() => setShowAddCashModal(true)} 
             className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 shrink-0"
          >
             <Plus className="w-4 h-4" /> Add Cash Register Entry
          </button>
       </div>

       {/* Filters */}
       <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4">
         <div className="flex flex-col lg:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search description, receipt no, particular or category..."
                value={searchTerm}
                onChange={e => handleSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border-primary text-primary border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary focus:bg-white transition-all outline-none"
              />
            </div>

            <div className="flex gap-2 w-full lg:w-auto overflow-visible flex-wrap">
               <div className="relative shrink-0 flex items-center gap-2">
                  <div className="relative z-50 nepali-datepicker-container">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
                    <NepaliDatePicker
                      value={fromDate}
                      onChange={value => setFromDate(value)}
                      inputClassName="w-36 pl-9 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 outline-none focus:ring-2 focus:-"
                      className=""
                      options={{ calenderLocale: 'ne', valueLocale: 'en' }}
                    />
                    {fromDate && (
                       <button onClick={() => setFromDate('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10">
                           <X className="w-4 h-4" />
                       </button>
                    )}
                  </div>
                  <span className="text-gray-400 font-bold text-xs">-</span>
                  <div className="relative z-50 nepali-datepicker-container">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
                    <NepaliDatePicker
                      value={toDate}
                      onChange={value => setToDate(value)}
                      inputClassName="w-36 pl-9 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 outline-none focus:ring-2 focus:-"
                      className=""
                      options={{ calenderLocale: 'ne', valueLocale: 'en' }}
                    />
                    {toDate && (
                       <button onClick={() => setToDate('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10">
                           <X className="w-4 h-4" />
                       </button>
                    )}
                  </div>
               </div>

               {viewMode !== 'cash_only' && (
                 <select 
                   value={filterClass}
                   onChange={e => setFilterClass(e.target.value)}
                   className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-600 focus:outline-none shrink-0"
                 >
                   <option value="All">All Classes</option>
                   {['Play Group', 'Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(c => (
                     <option key={c} value={c}>Class {c}</option>
                   ))}
                 </select>
               )}
               
               <select 
                 value={filterMethod}
                 onChange={e => setFilterMethod(e.target.value)}
                 className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-600 focus:outline-none shrink-0"
               >
                 <option value="All">All Collections (Cash Only)</option>
                 <option value="Cash">Physical Cash (Counter)</option>
               </select>

               <select 
                 value={filterCollectedBy}
                 onChange={e => setFilterCollectedBy(e.target.value)}
                 className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-600 focus:outline-none shrink-0"
               >
                  <option value="All">All Collectors ({uniqueCollectors.length})</option>
                  {uniqueCollectors.map(collector => (
                    <option key={collector} value={collector}>Collected By: {collector}</option>
                  ))}
               </select>

               <div className="flex bg-blue-50/50 rounded-xl p-1 shrink-0 border border-blue-100">
                  <button onClick={exportExcel} className="border-r border-blue-200 text-blue-700 font-bold px-3 text-xs hover:text-blue-900 flex gap-1.5 items-center uppercase tracking-widest"><Download className="w-3.5 h-3.5"/> Excel</button>
                  <button onClick={generatePDFReport} className="text-blue-700 font-bold px-3 text-xs hover:text-blue-900 flex gap-1.5 items-center uppercase tracking-widest"><Printer className="w-3.5 h-3.5"/> PDF</button>
               </div>
            </div>
         </div>

         {/* Sorting & Order Subpanel */}
         <div className="border-t border-gray-100 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50 p-3 rounded-xl">
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sort Items By:</span>
               <div className="flex gap-1.5 flex-wrap">
                  {[
                     { id: 'date', label: 'Date' },
                     { id: 'amount', label: 'Amount' },
                     { id: 'name', label: 'Particulars / Student' },
                     { id: 'receipt', label: 'Receipt No' }
                  ].map(opt => (
                     <button
                        key={opt.id}
                        onClick={() => setSortBy(opt.id as any)}
                        className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${sortBy === opt.id ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-white hover:bg-gray-100 text-gray-600 border border-gray-200'}`}
                     >
                        {opt.label}
                     </button>
                  ))}
               </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Order:</span>
               <div className="flex bg-gray-200/60 p-0.5 rounded-lg border border-gray-200">
                  <button 
                     onClick={() => setSortOrder('desc')} 
                     className={`px-2.5 py-1 text-[11px] font-extrabold rounded-md transition-all ${sortOrder === 'desc' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                     Newest Top (Desc)
                  </button>
                  <button 
                     onClick={() => setSortOrder('asc')} 
                     className={`px-2.5 py-1 text-[11px] font-extrabold rounded-md transition-all ${sortOrder === 'asc' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                     Oldest Top (Asc)
                  </button>
               </div>
            </div>
         </div>
       </div>

       {/* Summary Bar */}
       <div className="bg-primary text-white p-5 rounded-2xl shadow-md grid grid-cols-2 md:grid-cols-4 gap-4 items-center animate-in fade-in">
            <div>
               <p className="text-xs font-bold uppercase tracking-widest text-[#93c5fd]">Results found</p>
               <p className="text-xl font-black">{sortedHistory.length} ledger items</p>
            </div>
            <div>
               <p className="text-xs font-bold uppercase tracking-widest text-[#93c5fd]">Total Income</p>
               <p className="text-2xl font-black text-emerald-400">NRs. {totalFilteredAmount.toLocaleString()}</p>
            </div>
            <div>
               <p className="text-xs font-bold uppercase tracking-widest text-[#93c5fd]">Total Expenses</p>
               <p className="text-2xl font-black text-rose-400">NRs. {totalExpenses.toLocaleString()}</p>
            </div>
            <div>
               <p className="text-xs font-bold uppercase tracking-widest text-[#93c5fd]">Closing Cash Balance</p>
               <p className={`text-2xl font-black ${closingBalance >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>NRs. {closingBalance.toLocaleString()}</p>
            </div>
       </div>

       {/* Main Register List */}
       <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto custom-scrollbar pb-2 w-full">
         <table className="w-full text-left whitespace-nowrap min-w-[950px]">
            <thead className="text-primary border-b border-gray-100 bg-gray-50/50">
               <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <th className="p-4 px-6">Date (B.S.)</th>
                  <th className="p-4">Voucher/Receipt No</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Particulars & Payee</th>
                  <th className="p-4">Remarks & Collected By</th>
                  <th className="p-4">Class</th>
                  <th className="p-4 text-right">Inflow (Dr)</th>
                  <th className="p-4 text-right">Outflow (Cr)</th>
                  <th className="p-4 text-right px-6">Actions</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
               {sortedHistory.map(tx => {
                  const isSuccess = tx.status === 'SUCCESS' || tx.status === 'OVERRIDE_SUCCESS' || !tx.status;
                  const isCancelled = tx.status === 'CANCELLED' || tx.status === 'REFUNDED';
                  const isExpense = tx.type === 'Expense';

                  return (
                     <tr key={tx.id} className={`hover:bg-blue-50/20 transition-colors group ${isCancelled ? 'opacity-50 line-through font-medium' : ''}`}>
                        <td className="p-4 px-6">
                           <div className="flex flex-col">
                              <span className="text-xs font-bold text-gray-700">{tx.date}</span>
                              {tx.timestamp && (
                                 <span className="text-[10px] text-gray-400 font-medium mt-0.5" title="A.D. Date and Time">
                                   {new Date(tx.timestamp.seconds ? tx.timestamp.seconds * 1000 : tx.timestamp).toLocaleDateString()} {new Date(tx.timestamp.seconds ? tx.timestamp.seconds * 1000 : tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                 </span>
                              )}
                           </div>
                        </td>
                        <td className="p-4 text-xs font-mono font-bold text-primary">
                           <span className="bg-blue-50/60 rounded-md px-2 py-1 border border-blue-100">
                              {(tx.receipt || tx.id || '').slice(-8).toUpperCase()}
                           </span>
                        </td>
                        <td className="p-4">
                           {isExpense ? (
                              <span className="text-[10px] font-black tracking-wider uppercase bg-rose-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded-md flex items-center gap-1 w-fit"><ArrowDownRight className="w-3 h-3"/> EXPENSE</span>
                           ) : (
                              <span className="text-[10px] font-black tracking-wider uppercase bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-md flex items-center gap-1 w-fit"><ArrowUpRight className="w-3 h-3"/> INCOME</span>
                           )}
                        </td>
                        <td className="p-4">
                           <div className="flex flex-col max-w-[280px]">
                               {tx.isSystem ? (
                                  <>
                                     <span className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                                        {tx.studentName}
                                     </span>
                                     <span className="text-[11px] text-blue-700 font-semibold mt-0.5">
                                        {tx.particulars || 'Student Fee Collection'}
                                     </span>
                                  </>
                               ) : (
                                  <>
                                     <span className="font-bold text-gray-900 text-sm">
                                        {tx.category || 'Office Ledger Entry'}
                                     </span>
                                     <span className="text-[11px] text-gray-500 font-medium mt-0.5">
                                        {tx.particulars || 'Voucher Disbursement'}
                                     </span>
                                  </>
                               )}
                              {tx.isSystem && (
                                 <span className="text-[10px] font-medium text-blue-600 bg-blue-50/50 border border-blue-100 px-1.5 py-0.5 rounded w-fit mt-1">
                                    Method: {tx.method || 'Cash'}
                                 </span>
                              )}
                              {!tx.isSystem && tx.expenseSource && (
                                 <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded w-fit mt-1">
                                    Source: {tx.expenseSource}
                                 </span>
                              )}
                              {tx.status === 'REFUNDED' && <span className="text-[10px] text-red-500 font-bold mt-1 uppercase">REFUNDED</span>}
                              {tx.status === 'CANCELLED' && <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 w-fit mt-1 uppercase">UNDONE</span>}
                           </div>
                        </td>
                        <td className="p-4">
                           <div className="flex flex-col gap-1.5 max-w-[280px]">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                 <span className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md shadow-xs">
                                    <UserCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span>Collected by: {tx.collectedBy || resolveCollectorName(tx)}</span>
                                 </span>
                              </div>
                              {tx.remarks && (
                                 <span className="text-xs text-gray-600 font-medium leading-relaxed whitespace-normal break-words">
                                    {tx.remarks}
                                 </span>
                              )}
                           </div>
                        </td>
                        <td className="p-4 text-xs font-black text-gray-500">{tx.class || '-'}</td>
                        <td className="p-4 text-right font-black text-emerald-700 text-sm">
                           {!isExpense ? `रू ${(tx.amount||0).toLocaleString()}` : '-'}
                        </td>
                        <td className="p-4 text-right font-black text-rose-600 text-sm">
                           {isExpense ? `रू ${(tx.amount||0).toLocaleString()}` : '-'}
                        </td>
                        <td className="p-4 text-right px-6">
                           <div className="flex justify-end gap-1">
                              <button onClick={() => setReceipt(tx)} className="p-2 bg-transparent text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-200" title="Reprint Receipt"><Printer className="w-4 h-4"/></button>
                              
                              {tx.isSystem ? (
                                 <>
                                    {tx.status !== 'REFUNDED' && tx.status !== 'CANCELLED' && (
                                       <>
                                          <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Namaste, we have received a payment of NRs. ${tx.amount} for ${tx.studentName}. Receipt No: ${tx.receipt || tx.id}. Thank you.`)}`, '_blank')} className="p-2 bg-transparent text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-transparent hover:border-green-200" title="Send WhatsApp">📱</button>
                                          <button onClick={() => { setEditModalTx(tx); setEditAmount(String(tx.amount)); setEditRemarks(''); }} className="p-2 bg-transparent text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors border border-transparent hover:border-orange-200" title="Edit"><Edit2 className="w-4 h-4"/></button>
                                          {isUndoable(tx) ? (
                                             <button onClick={() => setUndoModalTx(tx)} className="p-2 bg-transparent text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors border border-transparent hover:border-amber-200" title="Undo Cash Payment (Recorded within 3 hrs)"><Undo2 className="w-4 h-4"/></button>
                                          ) : (
                                             <button onClick={() => setRefundModalTx(tx)} className="p-2 bg-transparent text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200" title="Refund/Cancel"><CornerUpLeft className="w-4 h-4"/></button>
                                          )}
                                       </>
                                    )}
                                    {Boolean(tx.isTest || tx.isSandbox || tx.environment === 'test' || tx.id?.startsWith('TEST_')) ? (
                                       <button onClick={() => handleDeleteSystemTransaction(tx)} className="p-2 bg-transparent text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200" title="Purge Sandbox Test Record"><Trash2 className="w-4 h-4"/></button>
                                    ) : (
                                       <span className="p-2 text-gray-300 cursor-not-allowed inline-flex items-center" title="Permanent Record: Institutional vouchers cannot be deleted. Use Refund or Undo."><Lock className="w-4 h-4 opacity-40"/></span>
                                    )}
                                 </>
                              ) : (
                                 (tx.category === 'Fee Collection' || tx.transactionId || tx.sourceTransactionId || tx.relatedTransactionId) ? (
                                    <span className="p-2 text-gray-300 cursor-not-allowed inline-flex items-center" title="Permanent Ledger Entry: Linked to fee transaction. Cannot delete directly."><Lock className="w-4 h-4 opacity-40"/></span>
                                 ) : (
                                    <button onClick={() => handleDeleteCashEntry(tx.id)} className="p-2 bg-transparent text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200" title="Delete Ledger Entry"><Trash2 className="w-4 h-4"/></button>
                                 )
                              )}
                           </div>
                        </td>
                     </tr>
                  );
               })}
               {sortedHistory.length === 0 && (
                  <tr>
                     <td colSpan={9} className="p-10 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">No transactions or ledger entries found</td>
                  </tr>
               )}
            </tbody>
         </table>
       </div>

       {/* Receipt Modal (With Mobile Screen Close Button Fixes) */}        {receipt && createPortal(
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[95vh] sm:h-[90vh]">
               {/* Mobile Friendly Sticky Title Bar with Close Option */}
               <div className="px-5 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-2">
                     <Receipt className="w-5 h-5 text-primary" />
                     <h3 className="font-black text-gray-900 text-xs sm:text-sm uppercase tracking-widest">Receipt Reprint Preview</h3>
                  </div>
                  <button onClick={() => setReceipt(null)} className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-2 rounded-xl transition-all border border-transparent hover:border-gray-200" title="Close Preview">
                     <X className="w-5 h-5" />
                  </button>
               </div>

               {/* Scroll Container */}
               <div className="flex-1 overflow-auto bg-gray-100 p-2 sm:p-6 custom-scrollbar flex flex-col items-center">
                  {/* Table Wrapper to allow horizontal swiping on small screens */}
                  <div className="overflow-x-auto w-full flex justify-start md:justify-center p-1 sm:p-4">
                     <div ref={receiptRef} className="bg-white mx-auto shadow-lg relative overflow-hidden shrink-0 border border-gray-200 rounded-sm" style={{ width: '600px', minHeight: '848px' }}>
                        <div className="p-8 sm:p-10 text-gray-800">
                           
                           {/* Header metadata */}
                           <div className="flex justify-between items-start text-[10px] text-gray-500 font-mono mb-8">
                               <span>{receipt.timestamp ? new Date(receipt.timestamp.seconds ? receipt.timestamp.seconds * 1000 : receipt.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                               <span>OFFICIAL REPRINT</span>
                           </div>

                           <div className="text-center mb-8">
                             <div className="mx-auto flex justify-center mb-4">
                               <img 
                                  src="/logo.png" 
                                  onError={(e) => {
                                    e.currentTarget.onerror = null;
                                    e.currentTarget.src = 'https://ui-avatars.com/api/?name=S+A&background=10b981&color=fff&size=100&bold=true';
                                  }} 
                                  alt="Logo" 
                                  className="h-16 w-auto object-contain" 
                                />
                             </div>
                             <h1 className="text-2xl font-black uppercase text-primary tracking-widest mb-1.5" style={{ letterSpacing: '0.1em' }}>SHIKSHANTAR ACADEMY</h1>
                             <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Karjanhana Municipality, Bastipur-5, Siraha, Nepal</p>
                             <p className="text-[9px] font-medium text-gray-400">Phone: +977 9709867048, +977 9807790805 | Email: academyshikshantar@gmail.com</p>
                             
                             <div className="mt-5 inline-block border text-emerald-700 border-emerald-300 bg-emerald-50 px-5 py-1.5 rounded-full text-xs font-black uppercase tracking-widest">
                                {receipt.isSystem ? 'Fee Receipt' : `${receipt.type} Voucher`}
                             </div>
                           </div>
                           
                           <hr className="mb-6 border-gray-200" />

                           {receipt.isSystem ? (
                              <>
                                 {/* Receipt Details Grid */}
                                 <div className="grid grid-cols-2 gap-4 mb-6">
                                     <div>
                                         <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">Receipt No</span>
                                         <span className="text-base font-mono border-b border-gray-100 pb-0.5 inline-block font-black text-gray-900 uppercase">{(receipt.receipt || receipt.receiptNo || receipt.id || '').toUpperCase()}</span>
                                     </div>
                                     <div className="text-right">
                                         <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">Date</span>
                                         <span className="text-base font-black text-gray-900">{receipt.date} <span className="text-xs font-normal text-gray-400 border-l pl-2 ml-1">B.S.</span></span>
                                     </div>
                                 </div>

                                 {/* Student Bubble */}
                                 <div className="border border-gray-200 rounded-xl p-4 mb-6 flex justify-between items-center bg-gray-50/50">
                                     <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Student Name</span>
                                     <span className="text-lg font-black text-gray-900 text-right">{receipt.studentName}</span>
                                 </div>

                                 <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50/50 border border-gray-200 rounded-xl">
                                    <div>
                                      <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">Class</span>
                                      <span className="font-bold text-gray-900 text-sm">Class {receipt.class || '-'}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">Payment Method</span>
                                      <span className="font-bold text-gray-900 text-sm">{receipt.method}</span>
                                    </div>
                                 </div>

                                 {/* Items */}
                                 <div className="mb-8">
                                     <table className="w-full text-sm">
                                         <thead>
                                            <tr className="border-b-2 border-gray-800 text-left text-[10px] font-black uppercase text-gray-500 tracking-widest">
                                               <th className="py-2">Item Description</th>
                                               <th className="py-2 text-right">Amount (NRs.)</th>
                                            </tr>
                                         </thead>
                                         <tbody>
                                            {(() => {
                                                const baseAmount = Number(receipt.breakdown?.tuition || (receipt.amount + (receipt.discount || 0) - (receipt.additionalCharge || 0)));
                                                const additionalCharge = Number(receipt.additionalCharge || receipt.breakdown?.additionalCharge || 0);

                                                return (
                                                  <>
                                                      <tr className="border-b border-gray-100 last:border-0">
                                                        <td className="py-2 text-gray-600 font-medium">Monthly Fee / Tuition Dues <span className="text-[10px] text-gray-400 block">Covering: {receipt.breakdown?.mode || 'Outstanding months'}</span></td>
                                                        <td className="py-2 font-black text-gray-900 text-right text-base">NRs. {baseAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                                      </tr>
                                                      {additionalCharge > 0 && (
                                                        <tr className="border-b border-gray-100 last:border-0">
                                                          <td className="py-2 text-gray-600 font-medium">Additional Charges</td>
                                                          <td className="py-2 font-black text-gray-900 text-right text-base">NRs. {additionalCharge.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                                        </tr>
                                                      )}
                                                      {receipt.discount > 0 && (
                                                        <tr className="border-b border-gray-100 last:border-0">
                                                          <td className="py-2 text-rose-600 font-medium">Scholarship / Discount Applied</td>
                                                          <td className="py-2 font-black text-rose-600 text-right text-base">- NRs. {Number(receipt.discount).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                                        </tr>
                                                      )}
                                                  </>
                                                );
                                            })()}
                                         </tbody>
                                     </table>
                                     
                                     <div className="mt-6 flex justify-between items-center border-t border-gray-900 pt-4">
                                        <span className="font-black text-xs uppercase tracking-widest text-gray-500">Total Net Received</span>
                                        <span className="text-2xl font-black text-emerald-600">NRs. {(receipt.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                     </div>
                                     
                                     {(receipt.ledgerPageNo || receipt.breakdown?.ledgerPageNo) && (
                                        <div className="mt-4 p-3 bg-blue-50 text-blue-800 rounded-xl text-xs font-bold border border-blue-100 flex justify-between items-center">
                                           <span>Handwritten Ledger Key Reference:</span>
                                           <span className="font-mono text-sm uppercase">{receipt.ledgerPageNo || receipt.breakdown?.ledgerPageNo}</span>
                                        </div>
                                     )}
                                 </div>
                              </>
                           ) : (
                              <>
                                 {/* Custom Ledger Details Grid */}
                                 <div className="grid grid-cols-2 gap-4 mb-6">
                                     <div>
                                         <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">Voucher ID</span>
                                         <span className="text-base font-mono border-b border-gray-100 pb-0.5 inline-block font-black text-gray-900 uppercase">{(receipt.receipt || receipt.receiptNo || receipt.id || '').toUpperCase()}</span>
                                     </div>
                                     <div className="text-right">
                                         <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">Date</span>
                                         <span className="text-base font-black text-gray-900">{receipt.date} <span className="text-xs font-normal text-gray-400 border-l pl-2 ml-1">B.S.</span></span>
                                     </div>
                                 </div>

                                 <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50/50 border border-gray-200 rounded-xl">
                                    <div>
                                      <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">Ledger Category</span>
                                      <span className="font-bold text-gray-900 text-sm">{receipt.category || '-'}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">Voucher Type</span>
                                      <span className="font-black text-rose-600 text-sm uppercase">{receipt.type}</span>
                                    </div>
                                 </div>

                                 {/* Item description */}
                                 <div className="mb-8 border border-gray-200 rounded-xl p-5 bg-white space-y-4">
                                     <div className="flex justify-between border-b pb-2">
                                        <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Line Item Particulars</span>
                                        <span className="text-xs text-gray-500 font-bold uppercase tracking-wider text-right">Amount</span>
                                     </div>
                                     <div className="flex justify-between items-center py-2 text-sm text-gray-700">
                                        <span>{receipt.remarks || 'Cash register ledger entry'}</span>
                                        <span className="font-black text-gray-900">NRs. {Number(receipt.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                     </div>
                                     <div className="flex justify-between items-center border-t border-gray-900 pt-4">
                                        <span className="font-black text-xs uppercase tracking-widest text-gray-500">Total Voucher Amount</span>
                                        <span className="text-2xl font-black text-rose-600">NRs. {(receipt.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                     </div>
                                 </div>
                              </>
                           )}

                           {/* Remarks / Notes */}
                           {receipt.remarks && receipt.isSystem && (
                              <div className="mt-4 p-4 bg-gray-50 border rounded-xl text-xs text-gray-600 leading-relaxed font-medium">
                                 <strong>Notes:</strong> {receipt.remarks}
                              </div>
                           )}

                           {/* Signatures */}
                           <div className="mt-16 flex justify-between items-end border-t border-gray-200 pt-8 pb-10">
                               <div className="bg-white p-2 border border-gray-200 shadow-sm rounded-xl">
                                    <QRCode value={`Voucher: ${receipt.receipt || receipt.receiptNo || receipt.id}\nParticulars: ${receipt.isSystem ? receipt.studentName : receipt.category}\nAmount: NRs.${receipt.amount}\nDate: ${receipt.date}`} size={64} />
                               </div>
                               <div className="text-center">
                                  <p className="font-bold text-[10px] uppercase tracking-widest text-gray-400 mb-2">Collected By</p>
                                  <p className="font-black text-gray-900 text-xs">{receipt.collectedBy || 'Admin'}</p>
                               </div>
                               <div className="text-center opacity-20 relative px-4 text-gray-300 font-bold border-t border-gray-300 pt-2 min-w-[120px]">
                                  Signature
                               </div>
                            </div>
                            
                            <div className="absolute top-1/4 right-0 h-1/2 w-2 bg-gray-400/80 rounded-l-full shadow-inner"></div>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Footer Action Bar */}
               <div className="p-4 bg-white border-t border-gray-200 space-y-3 shrink-0">
                 <div className="flex gap-3">
                    <button onClick={() => setReceipt(null)} className="flex-1 py-3 border-transparent text-gray-500 hover:text-gray-900 bg-gray-100 rounded-xl font-black text-xs transition-colors hover:bg-gray-200">Close Preview</button>
                    <button onClick={downloadReceipt} className="flex-1 py-3 border-blue-600 text-blue-600 border rounded-xl font-black text-xs hover:bg-blue-50 transition-colors flex items-center justify-center gap-1"><FileDown className="w-4 h-4"/> PDF</button>
                 </div>
                 <div className="flex gap-3">
                     <button onClick={handleBrowserPrint} className="w-full py-4 bg-primary text-white rounded-xl font-black shadow-lg flex justify-center items-center gap-2 hover:bg-blue-800 transition-colors text-[14px]">
                        <Printer className="w-5 h-5"/> Print Receipt Document
                     </button>                     {receipt.isSystem && (
                          <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Namaste, we have received a payment of NRs. ${receipt.amount} for ${receipt.studentName}. Receipt No: ${receipt.receipt || receipt.id}. Thank you.`)}`, '_blank')} className="w-auto px-5 py-4 bg-[#25D366] text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-md flex justify-center items-center gap-2 hover:bg-[#128C7E] transition-colors" title="Send WhatsApp">
                             📱 
                          </button>
                      )}
                  </div>
                </div>
             </div>
          </div>,
          document.body
        )}

       {/* Edit Modal (Displays Student and Identity correctly when editing) */}        {editModalTx && createPortal(
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white max-w-sm w-full rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
               <h3 className="text-lg font-black text-gray-800 mb-4 uppercase tracking-widest border-b pb-2">Edit Transaction</h3>
               <div className="space-y-4">
                  {/* Identity detail fix: show the student entry/particular details clearly! */}
                  <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl text-sm">
                     <p className="font-bold text-blue-800">Particulars: <span className="font-black text-blue-950">{editModalTx.isSystem ? editModalTx.studentName : editModalTx.category}</span></p>
                     {editModalTx.isSystem && (
                        <p className="text-blue-700 font-bold text-xs mt-0.5">Class: <span className="font-black">Class {editModalTx.class || '-'}</span></p>
                     )}
                     <p className="text-blue-600 text-xs mt-0.5 font-mono">Receipt No: {editModalTx.receipt || editModalTx.id}</p>
                  </div>

                  <div>
                     <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
                        {Boolean(editModalTx.isSystem || editModalTx.category === 'Fee Collection' || editModalTx.transactionId || editModalTx.sourceTransactionId)
                          ? 'Transaction Amount (Immutable)'
                          : 'New Amount (NRs.)'}
                     </label>
                     <input 
                        type="number" 
                        min="0" 
                        step="any" 
                        disabled={Boolean(editModalTx.isSystem || editModalTx.category === 'Fee Collection' || editModalTx.transactionId || editModalTx.sourceTransactionId)}
                        onKeyDown={(e) => { if (e.key === '-' || e.key === 'e') e.preventDefault(); }} 
                        value={editAmount} 
                        onChange={e => setEditAmount(e.target.value)} 
                        className={`w-full px-3 py-2 border border-gray-300 rounded-lg outline-none font-bold ${Boolean(editModalTx.isSystem || editModalTx.category === 'Fee Collection' || editModalTx.transactionId || editModalTx.sourceTransactionId) ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500'}`} 
                     />
                     {Boolean(editModalTx.isSystem || editModalTx.category === 'Fee Collection' || editModalTx.transactionId || editModalTx.sourceTransactionId) && (
                        <p className="text-[11px] text-amber-600 font-medium mt-1">Institutional transaction amounts are immutable. To correct monetary values, please use the Refund or Payment Cancellation workflow.</p>
                     )}
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Reason for edit</label>
                     <textarea value={editRemarks} onChange={e => setEditRemarks(e.target.value)} placeholder="E.g., Amount was entered incorrectly" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none" rows={3}></textarea>
                  </div>
               </div>
               <div className="flex gap-3 mt-6">
                  <button onClick={() => setEditModalTx(null)} className="flex-1 px-4 py-2 bg-gray-100 text-gray-600 font-bold rounded-xl text-sm">Cancel</button>
                  <button onClick={handleEditSubmit} className="flex-1 px-4 py-2 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-700">Save Changes</button>
               </div>
            </div>
         </div>,
         document.body
       )}

       {/* Security Confirmation Modal for System Transaction Deletion */}
       {deleteTxModalTarget && (
          <SecurityPasswordConfirmModal 
             isOpen={!!deleteTxModalTarget}
             onClose={() => setDeleteTxModalTarget(null)}
             onConfirm={handleExecuteDeleteSystemTransaction}
             title="Authorize Sandbox Test Record Deletion"
             confirmButtonText="Delete Sandbox Record"
             confirmButtonVariant="danger"
             defaultReason="Sandbox test fixture cleanup"
             reasonLabel="Reason for Deletion"
             actionDescription="Notice: Physical deletion is strictly restricted to sandbox and test records. Real institutional financial transactions are permanent legal records and cannot be destroyed. Attempting to delete an institutional record will be prohibited."
             targetDetails={{
                receiptOrId: deleteTxModalTarget.receipt || deleteTxModalTarget.id,
                particulars: `${deleteTxModalTarget.studentName || 'Student'} (Class ${deleteTxModalTarget.class || '-'})`,
                amount: deleteTxModalTarget.amount,
                date: deleteTxModalTarget.date,
                additionalInfo: `Months: ${(deleteTxModalTarget.months || []).join(', ') || 'N/A'} | Payment Method: ${deleteTxModalTarget.method || 'Cash'}`
             }}
          />
       )}

       {/* Security Confirmation Modal for Cash Ledger Register Entry Deletion */}
       {deleteCashModalTarget && (
          <SecurityPasswordConfirmModal 
             isOpen={!!deleteCashModalTarget}
             onClose={() => setDeleteCashModalTarget(null)}
             onConfirm={handleExecuteDeleteCashEntry}
             title="Authorize Daily Register Entry Deletion"
             confirmButtonText="Delete Register Entry"
             confirmButtonVariant="danger"
             defaultReason="Daily register adjustment & voucher correction"
             reasonLabel="Reason for Deleting Entry"
             actionDescription="Warning: This action will permanently delete this cash ledger record from the Daily Register. This will affect closing cash and ledger totals."
             targetDetails={{
                receiptOrId: deleteCashModalTarget.receipt || deleteCashModalTarget.id,
                particulars: `${deleteCashModalTarget.type || 'Entry'}: ${deleteCashModalTarget.category || 'Office Ledger'}`,
                amount: deleteCashModalTarget.amount,
                date: deleteCashModalTarget.date,
                additionalInfo: `Remarks: ${deleteCashModalTarget.remarks || 'None'} | Source: ${deleteCashModalTarget.expenseSource || 'General'}`
             }}
          />
       )}

       {/* Security Confirmation Modal for Administrative Refund */}
       {refundModalTx && (
          <SecurityPasswordConfirmModal 
             isOpen={!!refundModalTx}
             onClose={() => setRefundModalTx(null)}
             onConfirm={handleExecuteRefund}
             title="Authorize Payment Refund / Cancellation"
             confirmButtonText="Confirm & Process Refund"
             confirmButtonVariant="warning"
             defaultReason="Administrative refund & fee balance reversal"
             reasonLabel="Reason for Refund"
             actionDescription="This will mark the payment status as REFUNDED, revert the student's associated fee months back to DUE, and remove duplicate entries from the cash register."
             targetDetails={{
                receiptOrId: refundModalTx.receipt || refundModalTx.id,
                particulars: `${refundModalTx.studentName || 'Student'} (Class ${refundModalTx.class || '-'})`,
                amount: refundModalTx.amount,
                date: refundModalTx.date,
                additionalInfo: `Associated Months: ${(refundModalTx.months || []).join(', ') || 'N/A'}`
             }}
          />
       )}

       {/* Security Confirmation Modal for 3h Instant Undo */}
       {undoModalTx && (
          <SecurityPasswordConfirmModal 
             isOpen={!!undoModalTx}
             onClose={() => setUndoModalTx(null)}
             onConfirm={handleExecuteUndo}
             title="Authorize Instant Payment Undo (3h Window)"
             confirmButtonText="Authorize Instant Undo"
             confirmButtonVariant="warning"
             defaultReason="Payment cancellation within 3h operator window"
             reasonLabel="Reason for Instant Undo"
             actionDescription="This transaction was recorded recently. Confirm your administrator password to reverse this transaction, restore student dues, and update audit logs."
             targetDetails={{
                receiptOrId: undoModalTx.receipt || undoModalTx.id,
                particulars: `${undoModalTx.studentName || 'Student'} (Class ${undoModalTx.class || '-'})`,
                amount: undoModalTx.amount,
                date: undoModalTx.date,
                additionalInfo: `Receipt: ${undoModalTx.receipt || undoModalTx.id}`
             }}
          />
       )}

       {/* Add Cash Ledger Entry Modal (Combined Concept) */}        {showAddCashModal && createPortal(
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
             <form onSubmit={handleSaveCashEntry} className="bg-white max-w-md w-full rounded-2xl p-6 shadow-2xl animate-in zoom-in duration-150 space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                   <h3 className="text-lg font-black text-gray-800 uppercase tracking-widest">New Cash Register Entry</h3>
                   <button type="button" onClick={() => setShowAddCashModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>

                <div className="grid grid-cols-2 gap-3 bg-gray-100 p-1 rounded-xl">
                   <button 
                      type="button" 
                      onClick={() => setCashType('Expense')} 
                      className={`py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${cashType === 'Expense' ? 'bg-rose-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                   >
                      Expense
                   </button>
                   <button 
                      type="button" 
                      onClick={() => setCashType('Income')} 
                      className={`py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${cashType === 'Income' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                   >
                      Income
                   </button>
                </div>

                <div className="space-y-3">
                   <div className="relative z-50 nepali-datepicker-container">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Date (B.S.)</label>
                      <NepaliDatePicker
                         value={cashDate}
                         onChange={value => setCashDate(value)}
                         inputClassName="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-primary"
                         options={{ calenderLocale: 'ne', valueLocale: 'en' }}
                      />
                   </div>

                   <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Amount (NRs.)</label>
                      <input 
                         type="number" 
                         required 
                         min="1" 
                         value={cashAmount} 
                         onChange={e => setCashAmount(e.target.value)} 
                         placeholder="Enter amount" 
                         className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary outline-none font-bold" 
                      />
                   </div>

                   <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Category / Ledger head</label>
                      <input 
                         type="text" 
                         required 
                         value={cashCategory} 
                         onChange={e => setCashCategory(e.target.value)} 
                         placeholder="E.g., Stationary, Electricity, Other Inflow" 
                         className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary outline-none font-bold" 
                      />
                   </div>

                   {cashType === 'Expense' && (
                      <div>
                         <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Source Account</label>
                         <select 
                            value={cashSource} 
                            onChange={e => setCashSource(e.target.value)} 
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary outline-none font-bold bg-white"
                         >
                            <option value="A/C">A/C (School Bank Account)</option>
                            <option value="Other Sources">Other Sources</option>
                         </select>
                      </div>
                   )}

                   <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Voucher Description / Remarks</label>
                      <textarea 
                         value={cashRemarks} 
                         onChange={e => setCashRemarks(e.target.value)} 
                         placeholder="Enter brief description of entry" 
                         className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm resize-none h-20"
                      />
                   </div>
                </div>                 <div className="flex gap-3 pt-3">
                   <button type="button" onClick={() => setShowAddCashModal(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl text-sm">Cancel</button>
                   <button type="submit" disabled={savingCash} className="flex-1 px-4 py-3 bg-emerald-600 text-white font-bold rounded-xl text-sm hover:bg-emerald-700 transition-colors">
                      {savingCash ? 'Saving...' : 'Save Entry'}
                   </button>
                 </div>
              </form>
           </div>,
           document.body
        )}
    </div>
  );
}
