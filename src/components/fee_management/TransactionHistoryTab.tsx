import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatBSDate } from '../../lib/nepaliDate';
import { Search, Printer, Edit2, CornerUpLeft, Download, Calendar, Filter, ChevronRight, ChevronDown, Receipt, FileDown, X, Undo2, Plus, Trash2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import QRCode from 'react-qr-code';
import { db } from '../../firebase';
import { collection, doc, writeBatch, query, where, getDocs, deleteField, addDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { NepaliDatePicker } from 'nepali-datepicker-reactjs';
import 'nepali-datepicker-reactjs/dist/index.css';
import NepaliDate from 'nepali-date-converter';
import { exportToPDF } from '../../lib/pdfExport';
import { exportToExcel, exportMultiSheetExcel } from '../../lib/excelExport';
import logoImage from '../../assets/logo.png';

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

  // Modals & Popups States
  const [receipt, setReceipt] = useState<any>(null);
  const [editModalTx, setEditModalTx] = useState<any>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [refundModalTx, setRefundModalTx] = useState<any>(null);
  const [refundPassword, setRefundPassword] = useState('');
  const [undoModalTx, setUndoModalTx] = useState<any>(null);
  const [undoing, setUndoing] = useState(false);

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
      await addDoc(collection(db, 'cash_ledger'), {
        type: cashType,
        date: cashDate,
        amount: Number(cashAmount),
        category: cashCategory,
        remarks: cashRemarks,
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

  const handleDeleteCashEntry = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this cash register entry?")) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'cash_ledger', id));
      await batch.commit();
    } catch (err) {
      console.error("Failed to delete cash entry", err);
      alert("Failed to delete entry");
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

  const generatePDFReport = async () => {
      const columns = ['Date (B.S.)', 'Receipt No', 'Particulars', 'Class', 'Amount', 'Method', 'Status'];
      const body = sortedHistory.map(tx => [
          tx.date || '',
          tx.receipt || tx.id || '',
          tx.isSystem ? tx.studentName : `${tx.category} - ${tx.remarks}`,
          tx.class || '-',
          `NRs. ${tx.amount}`,
          tx.method || 'Cash',
          tx.status || 'SUCCESS'
      ]);

      await exportToPDF('Combined Cash Ledger & Transaction Report', columns, body, `Transaction_Report_${formatBSDate(new Date())}`, false);
  };

  // Merge transactions Data and custom Cash Ledger Entries
  const enrichedTransactions = transactionsData.map(tx => {
     const student = studentsData?.find(s => s.id === tx.studentId || (s.studentId && s.studentId === tx.studentId));
     return {
         ...tx,
         studentName: tx.studentName || student?.name || 'Unknown Student',
         class: tx.class || student?.class || '',
         isSystem: true,
         type: 'Income',
         category: 'Fee Collection',
         particulars: tx.studentName || student?.name || 'Unknown Student'
     };
  });

  const processedCashEntries = cashEntries
    .filter(e => e.category !== 'Fee Collection')
    .map(e => ({
       ...e,
       id: e.id,
       isSystem: false,
       studentName: '',
       class: '',
       particulars: `${e.category} - ${e.remarks}`,
       status: 'SUCCESS', // Custom cash entries are successful
       method: 'Cash', // Default to cash for office ledger
       collectedBy: 'Admin'
    }));

  // Select dataset based on viewMode
  let combinedList: any[] = [];
  if (viewMode === 'combined') {
     combinedList = [...enrichedTransactions, ...processedCashEntries];
  } else if (viewMode === 'fees_only') {
     combinedList = enrichedTransactions;
  } else {
     combinedList = processedCashEntries;
  }

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
  const totalFilteredAmount = sortedHistory.filter(tx => tx.status === 'SUCCESS' && tx.type === 'Income').reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const totalRefunded = sortedHistory.filter(tx => tx.status === 'REFUNDED' || tx.status === 'CANCELLED').reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const totalExpenses = sortedHistory.filter(tx => tx.type === 'Expense').reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const closingBalance = totalFilteredAmount - totalExpenses;
  
  const methodsBreakdown = sortedHistory.filter(tx => tx.status === 'SUCCESS' && tx.type === 'Income').reduce((acc: any, tx) => {
      const m = tx.method || 'Cash';
      acc[m] = (acc[m] || 0) + (Number(tx.amount) || 0);
      return acc;
  }, {});

  const exportExcel = async () => {
    const columns = [
       { header: 'Date (B.S.)', key: 'dateBs', width: 15 },
       { header: 'Date (A.D.)', key: 'dateAd', width: 25 },
       { header: 'Type', key: 'type', width: 12 },
       { header: 'Receipt / Ref No', key: 'receiptNo', width: 15 },
       { header: 'Particulars', key: 'particulars', width: 30 },
       { header: 'Class', key: 'studentClass', width: 15 },
       { header: 'Amount', key: 'amount', width: 15 },
       { header: 'Method', key: 'method', width: 15 },
       { header: 'Collected By', key: 'collectedBy', width: 20 },
       { header: 'Status', key: 'status', width: 15 }
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
           particulars: tx.isSystem ? tx.studentName : `${tx.category} (${tx.remarks})`,
           studentClass: tx.class || '-',
           amount: tx.amount || 0,
           method: tx.method || 'Cash',
           collectedBy: tx.collectedBy || 'Admin',
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
          
          if (editModalTx.isSystem) {
              const txRef = doc(db, 'transactions', editModalTx.id);
              batch.update(txRef, {
                  amount: Number(editAmount),
                  remarks: (editModalTx.remarks ? editModalTx.remarks + '\n' : '') + `Edited: ${editRemarks}`
              });
          } else {
              const txRef = doc(db, 'cash_ledger', editModalTx.id);
              batch.update(txRef, {
                  amount: Number(editAmount),
                  remarks: (editModalTx.remarks ? editModalTx.remarks + '\n' : '') + `Edited: ${editRemarks}`
              });
          }
          
          await batch.commit();
          setEditModalTx(null);
          onRefresh();
     } catch (err) {
          console.error(err);
          alert("Failed to edit transaction");
     }
  };

  const handleRefundSubmit = async () => {
       if (refundPassword !== 'admin123') {
          alert("Incorrect authentication password.");
          return;
       }
       if (!refundModalTx) return;
       try {
          const batch = writeBatch(db);
          const txRef = doc(db, 'transactions', refundModalTx.id);
          batch.update(txRef, { status: 'REFUNDED' });

          const feeQuery = query(collection(db, 'studentFees'), where('transactionId', '==', refundModalTx.id));
          const feeSnap = await getDocs(feeQuery);
          
          if (!feeSnap.empty) {
              feeSnap.forEach(d => {
                  batch.update(d.ref, {
                      status: 'due',
                      paidAmount: 0,
                      paidAt: deleteField(),
                      receiptNo: deleteField(),
                      transactionId: deleteField(),
                      paymentMethod: deleteField(),
                      collectorId: deleteField(),
                      collectorName: deleteField()
                  });
              });
          } else if (refundModalTx.months && Array.isArray(refundModalTx.months)) {
              refundModalTx.months.forEach((m: string) => {
                  const feeRef = doc(db, 'studentFees', `${refundModalTx.studentId}_${m}`);
                  batch.update(feeRef, {
                      status: 'due',
                      paidAmount: 0,
                      paidAt: deleteField(),
                      receiptNo: deleteField(),
                      transactionId: deleteField(),
                      paymentMethod: deleteField(),
                      collectorId: deleteField(),
                      collectorName: deleteField()
                  });
              });
          }

          // Revert associated remit bills if any
          const receiptId = refundModalTx.receipt || refundModalTx.id;
          if (receiptId) {
              const remitQuery = query(collection(db, 'remitBills'), where('transactionId', '==', receiptId));
              const remitSnap = await getDocs(remitQuery);
              remitSnap.forEach(d => {
                  batch.update(d.ref, {
                      status: 'pending',
                      paidAmount: deleteField(),
                      paidAt: deleteField(),
                      transactionId: deleteField()
                  });
              });
          }

          // Delete associated cash_ledger entry to keep ledger clean and prevent duplicates
          const cashQuery = query(collection(db, 'cash_ledger'));
          const cashSnap = await getDocs(cashQuery);
          cashSnap.forEach(d => {
              const data = d.data();
              if (data.remarks && (data.remarks.includes(refundModalTx.receipt) || data.remarks.includes(refundModalTx.id))) {
                  batch.delete(d.ref);
              }
          });

          await batch.commit();
          setRefundModalTx(null);
          setRefundPassword('');
          onRefresh();
       } catch(err) {
          console.error("Refund failed", err);
          alert("Failed to refund payment");
       }
  };

  const isUndoable = (tx: any) => {
     if (!tx.isSystem) return false; // Only student payments are undoable in the 3h window
     if (!tx.timestamp) return false;
     const txTime = tx.timestamp.seconds ? tx.timestamp.seconds * 1000 : new Date(tx.timestamp).getTime();
     const diffHours = (Date.now() - txTime) / (1000 * 60 * 60);
     return diffHours <= 3; // Within 3 hours limit
  };

  const handleUndoSubmit = async () => {
     if (!undoModalTx) return;
     setUndoing(true);
     try {
        const batch = writeBatch(db);
        const txRef = doc(db, 'transactions', undoModalTx.id);
        
        batch.update(txRef, { 
            status: 'CANCELLED',
            remarks: (undoModalTx.remarks ? undoModalTx.remarks + '\n' : '') + `Cancelled via Instant Undo (within 3h window) on ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`
        });

        const feeQuery = query(collection(db, 'studentFees'), where('transactionId', '==', undoModalTx.id));
        const feeSnap = await getDocs(feeQuery);
        
        if (!feeSnap.empty) {
            feeSnap.forEach(d => {
                batch.update(d.ref, {
                    status: 'due',
                    paidAmount: 0,
                    paidAt: deleteField(),
                    receiptNo: deleteField(),
                    transactionId: deleteField(),
                    paymentMethod: deleteField(),
                    collectorId: deleteField(),
                    collectorName: deleteField()
                });
            });
        } else if (undoModalTx.months && Array.isArray(undoModalTx.months)) {
            undoModalTx.months.forEach((m: string) => {
                const feeRef = doc(db, 'studentFees', `${undoModalTx.studentId}_${m}`);
                batch.update(feeRef, {
                    status: 'due',
                    paidAmount: 0,
                    paidAt: deleteField(),
                    receiptNo: deleteField(),
                    transactionId: deleteField(),
                    paymentMethod: deleteField(),
                    collectorId: deleteField(),
                    collectorName: deleteField()
                });
            });
        }

        // Revert associated remit bills if any
        const receiptId = undoModalTx.receipt || undoModalTx.id;
        if (receiptId) {
            const remitQuery = query(collection(db, 'remitBills'), where('transactionId', '==', receiptId));
            const remitSnap = await getDocs(remitQuery);
            remitSnap.forEach(d => {
                batch.update(d.ref, {
                    status: 'pending',
                    paidAmount: deleteField(),
                    paidAt: deleteField(),
                    transactionId: deleteField()
                });
            });
        }

        // Delete associated cash_ledger entry to keep ledger clean and prevent duplicates
        const cashQuery = query(collection(db, 'cash_ledger'));
        const cashSnap = await getDocs(cashQuery);
        cashSnap.forEach(d => {
            const data = d.data();
            if (data.remarks && (data.remarks.includes(undoModalTx.receipt) || data.remarks.includes(undoModalTx.id))) {
                batch.delete(d.ref);
            }
        });

        await batch.commit();
        setUndoModalTx(null);
        onRefresh();
     } catch(err) {
        console.error("Undo failed", err);
        alert("Failed to undo payment");
     } finally {
        setUndoing(false);
     }
  };

  const handleDeleteSystemTransaction = async (tx: any) => {
     if (!window.confirm(`Are you sure you want to completely delete transaction ${tx.receipt || tx.id}? This will remove it from all records and mark the associated fee months as due.`)) return;
     try {
        const batch = writeBatch(db);
        
        // 1. Delete from transactions
        batch.delete(doc(db, 'transactions', tx.id));

        // 2. Query and delete from cash_ledger
        const cashQuery = query(collection(db, 'cash_ledger'));
        const cashSnap = await getDocs(cashQuery);
        cashSnap.forEach(d => {
           const data = d.data();
           if (data.remarks && (data.remarks.includes(tx.receipt) || data.remarks.includes(tx.id))) {
              batch.delete(d.ref);
           }
        });

        // 3. Mark studentFees back to due
        const feeQuery = query(collection(db, 'studentFees'), where('transactionId', '==', tx.id));
        const feeSnap = await getDocs(feeQuery);
        if (!feeSnap.empty) {
           feeSnap.forEach(d => {
              batch.update(d.ref, {
                 status: 'due',
                 paidAmount: 0,
                 paidAt: deleteField(),
                 receiptNo: deleteField(),
                 transactionId: deleteField(),
                 paymentMethod: deleteField(),
                 collectorId: deleteField(),
                 collectorName: deleteField()
              });
           });
        } else if (tx.months && Array.isArray(tx.months)) {
           tx.months.forEach((m: string) => {
              const feeRef = doc(db, 'studentFees', `${tx.studentId}_${m}`);
              batch.update(feeRef, {
                 status: 'due',
                 paidAmount: 0,
                 paidAt: deleteField(),
                 receiptNo: deleteField(),
                 transactionId: deleteField(),
                 paymentMethod: deleteField(),
                 collectorId: deleteField(),
                 collectorName: deleteField()
              });
           });
        }

        // 4. Update associated remit bill status back to pending and clear transactionId/paidAt if any
        if (tx.receipt) {
           const remitQuery = query(collection(db, 'remitBills'), where('transactionId', '==', tx.receipt));
           const remitSnap = await getDocs(remitQuery);
           remitSnap.forEach(d => {
              batch.update(d.ref, {
                 status: 'pending',
                 paidAmount: deleteField(),
                 paidAt: deleteField(),
                 transactionId: deleteField()
              });
           });
        }

        await batch.commit();
        alert("Transaction completely deleted and student dues successfully restored.");
        onRefresh();
     } catch(err) {
        console.error("Delete transaction failed", err);
        alert("Failed to delete transaction");
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
                 <option value="All">All Methods</option>
                 <option value="Cash">Cash</option>
                 <option value="eSewa">eSewa</option>
                 <option value="Bank Transfer">Bank Transfer</option>
                 <option value="QR Code">QR Code</option>
               </select>

               <select 
                 value={filterCollectedBy}
                 onChange={e => setFilterCollectedBy(e.target.value)}
                 className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-bold text-gray-600 focus:outline-none shrink-0"
               >
                  <option value="All">Collected By: All</option>
                  <option value="Admin">Admin</option>
                  <option value="Principal">Principal</option>
                  <option value="Custom">Custom</option>
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
         <table className="w-full text-left whitespace-nowrap min-w-[800px]">
            <thead className="text-primary border-b border-gray-100 bg-gray-50/50">
               <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <th className="p-4 px-6">Date (B.S.)</th>
                  <th className="p-4">Voucher/Receipt No</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Particulars / Source</th>
                  <th className="p-4">Class</th>
                  <th className="p-4 text-right">Inflow (Dr)</th>
                  <th className="p-4 text-right">Outflow (Cr)</th>
                  <th className="p-4 text-right px-6">Actions</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
               {sortedHistory.map(tx => {
                  const isSuccess = tx.status === 'SUCCESS' || !tx.status;
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
                           <div className="flex flex-col">
                               {tx.isSystem ? (
                                  <span className="font-bold text-gray-800 text-sm">
                                     {tx.studentName}
                                  </span>
                               ) : (
                                  <div className="flex flex-col">
                                     <span className="font-bold text-gray-800 text-sm">
                                        {tx.category}
                                     </span>
                                     {tx.remarks && (
                                        <span className="text-xs text-gray-500 font-medium mt-0.5 whitespace-normal max-w-[250px] break-words">
                                           {tx.remarks}
                                        </span>
                                     )}
                                  </div>
                               )}
                              {tx.isSystem && (
                                 <span className="text-[10px] font-medium text-blue-600 bg-blue-50/50 border border-blue-100 px-1.5 py-0.5 rounded w-fit mt-1">
                                    Fee Payment ({tx.method})
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
                                    <button onClick={() => handleDeleteSystemTransaction(tx)} className="p-2 bg-transparent text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200" title="Delete Transaction"><Trash2 className="w-4 h-4"/></button>
                                 </>
                              ) : (
                                 <button onClick={() => handleDeleteCashEntry(tx.id)} className="p-2 bg-transparent text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200" title="Delete Ledger Entry"><Trash2 className="w-4 h-4"/></button>
                              )}
                           </div>
                        </td>
                     </tr>
                  );
               })}
               {sortedHistory.length === 0 && (
                  <tr>
                     <td colSpan={8} className="p-10 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">No transactions or ledger entries found</td>
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
                     <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">New Amount (NRs.)</label>
                     <input type="number" min="0" step="any" onKeyDown={(e) => { if (e.key === '-' || e.key === 'e') e.preventDefault(); }} value={editAmount} onChange={e => setEditAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold" />
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

       {/* Refund Modal */}        {refundModalTx && createPortal(
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white max-w-sm w-full rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
               <h3 className="text-lg font-black text-red-600 mb-2 uppercase tracking-widest flex items-center gap-2"><CornerUpLeft className="w-5 h-5"/> Process Refund</h3>
               <p className="text-xs text-gray-500 mb-4 font-medium leading-relaxed">This will revert the payment and mark associated months as due. This action requires administrative authentication.</p>
               
               <div className="bg-red-50 border border-red-100 p-3 rounded-xl mb-4 text-sm">
                  <p className="font-bold text-red-800">Student: {refundModalTx.studentName}</p>
                  <p className="font-black text-red-900 text-lg">Amount: NRs. {refundModalTx.amount}</p>
               </div>

               <div className="mb-6">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Admin Password</label>
                  <input type="password" value={refundPassword} onChange={e => setRefundPassword(e.target.value)} placeholder="Enter password to confirm" className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 outline-none text-sm" />
               </div>

               <div className="flex gap-3">
                  <button onClick={() => { setRefundModalTx(null); setRefundPassword(''); }} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-600 font-bold rounded-xl text-sm">Cancel</button>
                  <button onClick={handleRefundSubmit} className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-xl text-sm hover:bg-red-700 transition-colors">Confirm Refund</button>
               </div>
            </div>
         </div>,
         document.body
       )}

       {/* Undo Modal (Fixed root level layout position) */}        {undoModalTx && createPortal(
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
             <div className="bg-white max-w-sm w-full rounded-2xl p-6 shadow-2xl animate-in zoom-in duration-150">
                <h3 className="text-lg font-black text-amber-600 mb-2 uppercase tracking-widest flex items-center gap-2"><Undo2 className="w-5 h-5"/> Undo Cash Payment</h3>
                <p className="text-xs text-gray-500 mb-4 font-medium leading-relaxed">
                    This transaction was recorded within the last 3 hours. Since cash has not actually been received or was recorded by mistake, you can instantly undo it. This will cancel the receipt and mark associated months as due.
                </p>
                
                <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl mb-5 text-sm">
                   <p className="font-bold text-amber-800">Student: {undoModalTx.studentName}</p>
                   <p className="font-black text-amber-900 text-lg text-left">Amount: NRs. {undoModalTx.amount}</p>
                   <p className="text-[10px] text-amber-600 font-bold uppercase mt-1 text-left font-mono">Receipt: {undoModalTx.receipt || undoModalTx.id}</p>
                </div>                 <div className="flex gap-3">
                   <button type="button" onClick={() => setUndoModalTx(null)} className="flex-1 px-4 py-2 bg-gray-100 text-gray-600 font-bold rounded-xl text-sm">Cancel</button>
                   <button type="button" onClick={handleUndoSubmit} disabled={undoing} className="flex-1 px-4 py-2 bg-amber-500 text-slate-950 font-black rounded-xl text-sm hover:bg-amber-600 transition-colors uppercase tracking-wider text-center">
                      {undoing ? 'Reverting...' : 'Instant Undo'}
                   </button>
                 </div>
              </div>
           </div>,
           document.body
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
