import jsPDFImport from 'jspdf';
const jsPDF: any = (jsPDFImport as any)?.jsPDF || (jsPDFImport as any)?.default?.jsPDF || jsPDFImport;
import autoTable from 'jspdf-autotable';
import { formatBSDate } from './nepaliDate';
import { getSchoolLogoBase64 } from './logoHelper';
import { numberToWords } from './numberToWords';

export interface CashReceiptData {
  receiptNo: string;
  date: string;
  englishDate?: string;
  academicYear: string;
  studentName: string;
  studentId: string;
  className: string;
  rollNo?: string;
  guardianName?: string;
  billingPeriod?: string;
  baseTuition: number;
  coveredMonths?: string[];
  additionalCharges: { purpose: string; amount: number }[];
  discounts: { purpose: string; amount: number }[];
  totalPayable: number;
  netPayable?: number;
  cashReceived: number;
  amountApplied?: number;
  remainingOutstanding?: number;
  excessAmount?: number;
  advanceCreated?: number;
  excessReturned?: number;
  changeReturned?: number;
  cashierName?: string;
  remarks?: string;
  handwrittenLedgerNo?: string;
}

export interface StudentStatementPDFData {
  studentName: string;
  studentId: string;
  className: string;
  academicYear: string;
  bills: Array<{
    period: string;
    billed: number;
    paid: number;
    due: number;
    status: string;
  }>;
  totalBilled: number;
  totalPaid: number;
  totalDue: number;
  generatedDateBS?: string;
}

export const createPDFDocument = async (
    title: string, 
    columns: string[],
    data: any[][],
    landscape: boolean = false
) => {
    const orientation = landscape ? 'l' : 'p';
    const pdf = new jsPDF(orientation, 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    
    try {
        const logoBase64 = await getSchoolLogoBase64();
        if (logoBase64) {
            pdf.addImage(logoBase64, 'PNG', 14, 10, 20, 20);
        }
    } catch (err) {
        // Logo load error safe fallback
    }
    
    pdf.setFontSize(22);
    // @ts-ignore
    pdf.setTextColor(220, 38, 38); // Red-600
    pdf.setFont('helvetica', 'bold');
    pdf.text('SHIKSHANTAR ACADEMY', pageWidth / 2, 18, { align: 'center' });
    
    pdf.setFontSize(10);
    // @ts-ignore
    pdf.setTextColor(37, 99, 235); // Blue-600
    pdf.setFont('helvetica', 'bold');
    pdf.text('Bastipur, Karjanha-05, Siraha, Nepal | shikshantaracademy@gmail.com | +977 9709867048, +977 9807790805', pageWidth / 2, 24, { align: 'center' });

    pdf.setFontSize(14);
    // @ts-ignore
    pdf.setTextColor(0, 0, 0); // Black
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, pageWidth / 2, 34, { align: 'center' });
    
    pdf.setFontSize(9);
    // @ts-ignore
    pdf.setTextColor(100);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Generated on: ${formatBSDate(new Date())}`, 14, 42);

    autoTable(pdf, {
        startY: 46,
        head: [columns],
        body: data,
        theme: 'striped',
        styles: { fontSize: 9, halign: 'center', valign: 'middle' },
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [249, 250, 251] }
    });

    return pdf;
};

export const exportToPDF = async (
    title: string, 
    columns: string[],
    data: any[][],
    filename: string,
    landscape: boolean = false
) => {
    const pdf = await createPDFDocument(title, columns, data, landscape);
    if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
        pdf.save(`${filename}.pdf`);
    }
    return pdf;
};

/**
 * Authoritative dual-copy physical cash receipt PDF generator.
 */
export const generateCashReceiptPDF = async (receipt: CashReceiptData): Promise<any> => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    let logoBase64: string | null = null;
    try {
        logoBase64 = await getSchoolLogoBase64();
    } catch {
        // Safe fallback in headless/test environment
    }

    const totalPayable = receipt.netPayable !== undefined ? receipt.netPayable : receipt.totalPayable;
    const cashReceived = receipt.cashReceived;
    const amountApplied = receipt.amountApplied !== undefined ? receipt.amountApplied : Math.min(cashReceived, totalPayable);
    const remainingOutstanding = receipt.remainingOutstanding !== undefined ? receipt.remainingOutstanding : Math.max(0, totalPayable - amountApplied);
    const advanceCreated = receipt.advanceCreated || 0;
    const excessReturned = receipt.excessReturned || 0;

    const renderReceiptCopy = (startY: number, copyTitle: string) => {
        pdf.setDrawColor(10, 61, 98);
        pdf.setLineWidth(0.4);
        pdf.rect(10, startY, pageWidth - 20, 126);

        if (logoBase64) {
            try {
                pdf.addImage(logoBase64, 'PNG', pageWidth / 2 - 25, startY + 63 - 25, 50, 50);
            } catch {}
        }

        pdf.setFillColor(10, 61, 98);
        pdf.rect(10, startY, pageWidth - 20, 13.5, 'F');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(13);
        pdf.setTextColor(255, 255, 255);
        pdf.text('SHIKSHANTAR ACADEMY', pageWidth / 2, startY + 6.8, { align: 'center' });

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.text('Bastipur, Karjanha-05, Siraha, Nepal • Regd: 1482/071 • Ph: +977 9709867048', pageWidth / 2, startY + 10.8, { align: 'center' });

        pdf.setFillColor(241, 245, 249);
        pdf.rect(10.5, startY + 13.5, pageWidth - 21, 6, 'F');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(10, 61, 98);
        pdf.text('OFFICIAL PHYSICAL CASH RECEIPT', 15, startY + 17.5);
        
        pdf.setTextColor(180, 83, 9);
        pdf.text(`[ ${copyTitle.toUpperCase()} ]`, pageWidth / 2, startY + 17.5, { align: 'center' });

        pdf.setTextColor(15, 23, 42);
        pdf.text(`PHYSICAL CASH ONLY`, pageWidth - 15, startY + 17.5, { align: 'right' });

        pdf.setFontSize(7.5);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(30, 41, 59);
        pdf.text(`Receipt No: ${receipt.receiptNo}`, 15, startY + 23.5);
        pdf.text(`Date: ${receipt.date} (${receipt.englishDate || new Date().toISOString().split('T')[0]})`, pageWidth - 15, startY + 23.5, { align: 'right' });

        pdf.setFillColor(248, 250, 252);
        pdf.rect(14, startY + 26.5, pageWidth - 28, 14, 'F');
        pdf.setDrawColor(226, 232, 240);
        pdf.rect(14, startY + 26.5, pageWidth - 28, 14);

        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Student Name:`, 16, startY + 31.5);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${receipt.studentName}`, 38, startY + 31.5);

        pdf.setFont('helvetica', 'normal');
        pdf.text(`Class & Roll:`, 110, startY + 31.5);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${receipt.className} ${receipt.rollNo ? `(Roll #${receipt.rollNo})` : ''}`, 130, startY + 31.5);

        pdf.setFont('helvetica', 'normal');
        pdf.text(`Student ID / Dues Ref:`, 16, startY + 37.5);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${receipt.studentId}`, 48, startY + 37.5);

        pdf.setFont('helvetica', 'normal');
        pdf.text(`Billing Session:`, 110, startY + 37.5);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${receipt.billingPeriod || receipt.academicYear}`, 132, startY + 37.5);

        let tableY = startY + 44;
        pdf.setFillColor(226, 232, 240);
        pdf.rect(14, tableY, pageWidth - 28, 5, 'F');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.setTextColor(15, 23, 42);
        pdf.text('Fee Description / Covered Period', 16, tableY + 3.5);
        pdf.text('Amount (NRs.)', pageWidth - 16, tableY + 3.5, { align: 'right' });

        tableY += 8;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);

        if (receipt.baseTuition > 0) {
            pdf.text(`Monthly Tuition (${receipt.coveredMonths?.join(', ') || receipt.billingPeriod || 'Current Dues'})`, 16, tableY);
            pdf.text(`NRs. ${receipt.baseTuition.toLocaleString()}`, pageWidth - 16, tableY, { align: 'right' });
            tableY += 4.5;
        }

        if (receipt.additionalCharges && Array.isArray(receipt.additionalCharges)) {
            receipt.additionalCharges.forEach(ch => {
                pdf.text(`+ ${ch.purpose}`, 16, tableY);
                pdf.text(`NRs. ${Number(ch.amount).toLocaleString()}`, pageWidth - 16, tableY, { align: 'right' });
                tableY += 4.5;
            });
        }

        if (receipt.discounts && Array.isArray(receipt.discounts)) {
            receipt.discounts.forEach(dc => {
                pdf.setTextColor(185, 28, 28);
                pdf.text(`- Concession / Discount: ${dc.purpose}`, 16, tableY);
                pdf.text(`- NRs. ${Number(dc.amount).toLocaleString()}`, pageWidth - 16, tableY, { align: 'right' });
                tableY += 4.5;
                pdf.setTextColor(15, 23, 42);
            });
        }

        pdf.setDrawColor(15, 23, 42);
        pdf.setLineWidth(0.2);
        pdf.line(14, tableY + 1, pageWidth - 14, tableY + 1);
        tableY += 5;

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        pdf.text('Net Payable Total:', 16, tableY);
        pdf.text(`NRs. ${totalPayable.toLocaleString()}`, 65, tableY);

        pdf.text('Cash Collected:', 95, tableY);
        pdf.setTextColor(5, 150, 105);
        pdf.text(`NRs. ${cashReceived.toLocaleString()}`, 130, tableY);
        pdf.setTextColor(15, 23, 42);

        pdf.text('Applied to Dues:', 145, tableY);
        pdf.text(`NRs. ${amountApplied.toLocaleString()}`, pageWidth - 16, tableY, { align: 'right' });

        tableY += 5;

        if (remainingOutstanding > 0) {
            pdf.setFontSize(7);
            pdf.setTextColor(185, 28, 28);
            pdf.text(`Remaining Balance Due: NRs. ${remainingOutstanding.toLocaleString()}`, pageWidth - 16, tableY, { align: 'right' });
            pdf.setTextColor(15, 23, 42);
            tableY += 4;
        }

        if (advanceCreated > 0) {
            pdf.setFontSize(7);
            pdf.setTextColor(2, 132, 199);
            pdf.text(`Excess Credited to Advance: NRs. ${advanceCreated.toLocaleString()}`, pageWidth - 16, tableY, { align: 'right' });
            pdf.setTextColor(15, 23, 42);
            tableY += 4;
        }

        if (excessReturned > 0) {
            pdf.setFontSize(7);
            pdf.setTextColor(180, 83, 9);
            pdf.text(`Excess Returned to Guardian: NRs. ${excessReturned.toLocaleString()}`, pageWidth - 16, tableY, { align: 'right' });
            pdf.setTextColor(15, 23, 42);
            tableY += 4;
        }

        const words = numberToWords(cashReceived);
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(6.5);
        pdf.setTextColor(71, 85, 105);
        pdf.text(`Physical Cash Collected (in Words): ${words}`, 16, tableY + 2);

        const sigLineY = startY + 116;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.5);
        pdf.setTextColor(30, 41, 59);

        pdf.text(`Cashier: ${receipt.cashierName || 'Cashier Counter'}`, 16, sigLineY);
        pdf.text(`Authorized School Seal`, pageWidth / 2, sigLineY, { align: 'center' });
        pdf.text(`Guardian Signature: ____________________`, pageWidth - 16, sigLineY, { align: 'right' });

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(5.5);
        pdf.setTextColor(148, 163, 184);
        pdf.text(`Official Physical Cash Receipt • Shikshantar Academy Bastipur Cash Counter`, 16, startY + 123);
    };

    renderReceiptCopy(10, 'Student / Parent Copy');
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(10, 142, pageWidth - 10, 142);
    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(100, 116, 139);
    pdf.text('- - - - - - - - - - - - - - - - - - - - - ✂ FOLD OR CUT HERE - - - - - - - - - - - - - - - - - - - - -', pageWidth / 2, 144, { align: 'center' });

    pdf.setLineDashPattern([], 0);
    renderReceiptCopy(148, 'School / Accounts Office Copy');

    return pdf;
};

/**
 * Authoritative Student Statement & Financial Ledger PDF generator.
 */
export const generateStudentStatementPDF = async (data: StudentStatementPDFData): Promise<any> => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();

    pdf.setFontSize(20);
    // @ts-ignore
    pdf.setTextColor(220, 38, 38);
    pdf.setFont('helvetica', 'bold');
    pdf.text('SHIKSHANTAR ACADEMY', pageWidth / 2, 16, { align: 'center' });

    pdf.setFontSize(9);
    // @ts-ignore
    pdf.setTextColor(37, 99, 235);
    pdf.text('Bastipur, Karjanha-05, Siraha, Nepal | +977 9709867048', pageWidth / 2, 22, { align: 'center' });

    pdf.setFontSize(13);
    // @ts-ignore
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.text('STUDENT FINANCIAL STATEMENT & LEDGER', pageWidth / 2, 30, { align: 'center' });

    // Student identity card header
    pdf.setFillColor(248, 250, 252);
    pdf.rect(14, 34, pageWidth - 28, 18, 'F');
    pdf.setDrawColor(226, 232, 240);
    pdf.rect(14, 34, pageWidth - 28, 18);

    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'normal');
    // @ts-ignore
    pdf.setTextColor(50);
    pdf.text('Student Name:', 18, 40);
    pdf.setFont('helvetica', 'bold');
    // @ts-ignore
    pdf.setTextColor(0);
    pdf.text(data.studentName || 'Student', 42, 40);

    pdf.setFont('helvetica', 'normal');
    // @ts-ignore
    pdf.setTextColor(50);
    pdf.text('Student ID:', 110, 40);
    pdf.setFont('helvetica', 'bold');
    // @ts-ignore
    pdf.setTextColor(0);
    pdf.text(data.studentId || '-', 130, 40);

    pdf.setFont('helvetica', 'normal');
    // @ts-ignore
    pdf.setTextColor(50);
    pdf.text('Class:', 18, 47);
    pdf.setFont('helvetica', 'bold');
    // @ts-ignore
    pdf.setTextColor(0);
    pdf.text(data.className || '-', 42, 47);

    pdf.setFont('helvetica', 'normal');
    // @ts-ignore
    pdf.setTextColor(50);
    pdf.text('Academic Year:', 110, 47);
    pdf.setFont('helvetica', 'bold');
    // @ts-ignore
    pdf.setTextColor(0);
    pdf.text(data.academicYear || '2083', 135, 47);

    const tableColumns = ['Period / Description', 'Billed (NRs.)', 'Paid (NRs.)', 'Due (NRs.)', 'Status'];
    const tableRows = data.bills.map(b => [
        b.period,
        b.billed.toLocaleString(),
        b.paid.toLocaleString(),
        b.due.toLocaleString(),
        b.status.toUpperCase()
    ]);

    // Summary totals row
    tableRows.push([
        'TOTAL FINANCIAL OBLIGATION',
        data.totalBilled.toLocaleString(),
        data.totalPaid.toLocaleString(),
        data.totalDue.toLocaleString(),
        data.totalDue === 0 ? 'SETTLED' : 'OUTSTANDING'
    ]);

    autoTable(pdf, {
        startY: 56,
        head: [tableColumns],
        body: tableRows,
        theme: 'striped',
        styles: { fontSize: 8.5, halign: 'center', valign: 'middle' },
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [249, 250, 251] }
    });

    return pdf;
};

/**
 * Extracts raw textual tokens and stream strings from a generated PDF.
 */
export const extractTextFromPDF = (pdfDocOrBuffer: any): string => {
    let raw = '';
    if (typeof pdfDocOrBuffer === 'string') {
        raw = pdfDocOrBuffer;
    } else if (pdfDocOrBuffer && typeof pdfDocOrBuffer.output === 'function') {
        raw = pdfDocOrBuffer.output();
    } else if (Buffer.isBuffer(pdfDocOrBuffer)) {
        raw = pdfDocOrBuffer.toString('binary');
    } else if (pdfDocOrBuffer instanceof ArrayBuffer) {
        raw = Buffer.from(pdfDocOrBuffer).toString('binary');
    }

    const matches: string[] = [];
    const regex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
    let m;
    while ((m = regex.exec(raw)) !== null) {
        matches.push(m[1]);
    }
    const tjRegex = /\[(.*?)\]\s*TJ/g;
    while ((m = tjRegex.exec(raw)) !== null) {
        const inner = m[1];
        const subRegex = /\(([^)]+)\)/g;
        let subM;
        while ((subM = subRegex.exec(inner)) !== null) {
            matches.push(subM[1]);
        }
    }

    return raw + '\n--- EXTRACTED TOKENS ---\n' + matches.join(' ');
};
