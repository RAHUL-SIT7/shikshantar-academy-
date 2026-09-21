import React, { useRef, useState, useEffect } from 'react';
import { Printer, Download, X, CheckCircle2, DollarSign, ArrowRight, ShieldCheck, Wallet, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import { numberToWords } from '../../lib/numberToWords';
import { getSchoolLogoBase64 } from '../../lib/logoHelper';
const logoImage = "/logo.png";

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

interface CashReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: CashReceiptData | null;
}

export default function CashReceiptModal({ isOpen, onClose, receipt }: CashReceiptModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Preload official school logo into memory so PDF generation is instantaneous
  useEffect(() => {
    getSchoolLogoBase64();
  }, []);

  if (!isOpen || !receipt) return null;

  const totalPayable = receipt.netPayable !== undefined ? receipt.netPayable : receipt.totalPayable;
  const cashReceived = receipt.cashReceived;
  const amountApplied = receipt.amountApplied !== undefined ? receipt.amountApplied : Math.min(cashReceived, totalPayable);
  const remainingOutstanding = receipt.remainingOutstanding !== undefined ? receipt.remainingOutstanding : Math.max(0, totalPayable - amountApplied);
  const advanceCreated = receipt.advanceCreated || 0;
  const excessReturned = receipt.excessReturned || 0;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      const logoBase64 = await getSchoolLogoBase64();
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();

      // Helper to render one copy of receipt in PDF
      const renderReceiptCopy = (startY: number, copyTitle: string) => {
        // Outer border box
        pdf.setDrawColor(10, 61, 98);
        pdf.setLineWidth(0.4);
        pdf.rect(10, startY, pageWidth - 20, 126);

        // Centered watermark background
        if (logoBase64) {
          try {
            pdf.saveGraphicsState();
            const GStateClass = (jsPDF as any).GState || (pdf as any).GState;
            if (GStateClass) {
              try {
                const gState = new GStateClass({ opacity: 0.045 });
                if (typeof pdf.setGState === 'function') {
                  pdf.setGState(gState);
                }
              } catch {
                // Ignore if GState instantiation is non-constructible
              }
            }
            pdf.addImage(logoBase64, 'PNG', pageWidth / 2 - 25, startY + 63 - 25, 50, 50);
            pdf.restoreGraphicsState();
          } catch (err) {
            console.warn('Could not render watermark in PDF:', err);
          }
        }

        // Header Banner
        pdf.setFillColor(10, 61, 98);
        pdf.rect(10, startY, pageWidth - 20, 13.5, 'F');

        // School Logo Badges in Header Banner (Left & Right symmetry)
        if (logoBase64) {
          try {
            // Left crest with crisp circular white backing
            pdf.setFillColor(255, 255, 255);
            pdf.circle(18.5, startY + 6.75, 5.25, 'F');
            pdf.addImage(logoBase64, 'PNG', 13.5, startY + 1.75, 10, 10);

            // Right crest for balanced official institutional finish
            pdf.setFillColor(255, 255, 255);
            pdf.circle(pageWidth - 18.5, startY + 6.75, 5.25, 'F');
            pdf.addImage(logoBase64, 'PNG', pageWidth - 23.5, startY + 1.75, 10, 10);
          } catch (err) {
            console.warn('Could not draw school logo in PDF header:', err);
          }
        }

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(13);
        pdf.setTextColor(255, 255, 255);
        pdf.text('SHIKSHANTAR ACADEMY', pageWidth / 2, startY + 6.8, { align: 'center' });

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.text('Bastipur, Karjanha-05, Siraha, Nepal • Regd: 1482/071 • Ph: +977 9709867048', pageWidth / 2, startY + 10.8, { align: 'center' });

        // Receipt Title & Copy Badge
        pdf.setFillColor(241, 245, 249);
        pdf.rect(10.5, startY + 13.5, pageWidth - 21, 6, 'F');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(10, 61, 98);
        pdf.text('OFFICIAL PHYSICAL CASH RECEIPT', 15, startY + 17.5);
        
        pdf.setTextColor(180, 83, 9); // Amber
        pdf.text(`[ ${copyTitle.toUpperCase()} ]`, pageWidth / 2, startY + 17.5, { align: 'center' });

        pdf.setTextColor(15, 23, 42);
        pdf.text(`PHYSICAL CASH ONLY`, pageWidth - 15, startY + 17.5, { align: 'right' });

        // Metadata Row
        pdf.setFontSize(7.5);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(30, 41, 59);
        pdf.text(`Receipt No: ${receipt.receiptNo}`, 15, startY + 23.5);
        pdf.text(`Date: ${receipt.date} (${receipt.englishDate || new Date().toISOString().split('T')[0]})`, pageWidth - 15, startY + 23.5, { align: 'right' });

        // Student info box
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

      // Breakdown Table
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

      // Tuition
      if (receipt.baseTuition > 0) {
        pdf.text(`Monthly Tuition (${receipt.coveredMonths?.join(', ') || receipt.billingPeriod || 'Current Dues'})`, 16, tableY);
        pdf.text(`NRs. ${receipt.baseTuition.toLocaleString()}`, pageWidth - 16, tableY, { align: 'right' });
        tableY += 4.5;
      }

      // Additional charges
      receipt.additionalCharges.forEach(ch => {
        pdf.text(`+ ${ch.purpose}`, 16, tableY);
        pdf.text(`NRs. ${Number(ch.amount).toLocaleString()}`, pageWidth - 16, tableY, { align: 'right' });
        tableY += 4.5;
      });

      // Discounts
      receipt.discounts.forEach(dc => {
        pdf.setTextColor(185, 28, 28);
        pdf.text(`- Concession / Discount: ${dc.purpose}`, 16, tableY);
        pdf.text(`- NRs. ${Number(dc.amount).toLocaleString()}`, pageWidth - 16, tableY, { align: 'right' });
        tableY += 4.5;
        pdf.setTextColor(15, 23, 42);
      });

      // Total Line
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

      // In words
      const words = numberToWords(cashReceived);
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(6.5);
      pdf.setTextColor(71, 85, 105);
      pdf.text(`Physical Cash Collected (in Words): ${words}`, 16, tableY + 2);

      // Signatures
      const sigLineY = startY + 116;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.5);
      pdf.setTextColor(30, 41, 59);

      pdf.text(`Cashier: ${receipt.cashierName || '____________________'}`, 16, sigLineY);
      pdf.text(`Authorized School Seal`, pageWidth / 2, sigLineY, { align: 'center' });
      if (logoBase64) {
        try {
          pdf.saveGraphicsState();
          const GStateClass = (jsPDF as any).GState || (pdf as any).GState;
          if (GStateClass) {
            try {
              const sealState = new GStateClass({ opacity: 0.28 });
              if (typeof pdf.setGState === 'function') {
                pdf.setGState(sealState);
              }
            } catch {
              // Ignore if GState is non-constructible
            }
          }
          pdf.addImage(logoBase64, 'PNG', pageWidth / 2 - 4, sigLineY - 9.5, 8, 8);
          pdf.restoreGraphicsState();
        } catch {}
      }
      pdf.text(`Guardian Signature: ____________________`, pageWidth - 16, sigLineY, { align: 'right' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(5.5);
      pdf.setTextColor(148, 163, 184);
      pdf.text(`Official Physical Cash Receipt • Shikshantar Academy Bastipur Cash Counter`, 16, startY + 123);
    };

    // Render Student Copy (Top)
    renderReceiptCopy(10, 'Student / Parent Copy');

    // Cutting Line
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(10, 142, pageWidth - 10, 142);
    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(100, 116, 139);
    pdf.text('- - - - - - - - - - - - - - - - - - - - - ✂ FOLD OR CUT HERE - - - - - - - - - - - - - - - - - - - - -', pageWidth / 2, 144, { align: 'center' });

    // Render Office Copy (Bottom)
    pdf.setLineDashPattern([], 0);
    renderReceiptCopy(148, 'School / Accounts Office Copy');

    pdf.save(`CashReceipt_${receipt.receiptNo}_${receipt.studentName.replace(/\s+/g, '_')}.pdf`);
  } catch (err) {
    console.error('Failed to generate cash receipt PDF:', err);
  } finally {
    setIsDownloadingPdf(false);
  }
  };

  const words = numberToWords(cashReceived);

  // Reusable Single Slip Component for On-Screen & Physical Print
  const ReceiptSlip = ({ copyTitle }: { copyTitle: string }) => (
    <div className="border-2 border-[#0A3D62] rounded-2xl p-4 sm:p-5 bg-white text-slate-900 shadow-xs print:border-black print:rounded-none print:p-3">
      {/* Top Banner */}
      <div className="flex justify-between items-start border-b-2 border-slate-200 pb-3 print:border-black">
        <div className="flex items-center gap-3">
          <img 
            src={logoImage || "/logo.png"} 
            alt="School Logo" 
            className="w-12 h-12 object-contain rounded-full border border-slate-300 p-0.5 print:border-black bg-white shadow-xs"
            onError={(e) => { 
              const target = e.target as HTMLImageElement;
              if (target.src !== '/logo.png') {
                target.src = '/logo.png';
              }
            }}
          />
          <div>
            <h3 className="text-base sm:text-lg font-black text-[#0A3D62] tracking-tight uppercase print:text-black">
              SHIKSHANTAR ACADEMY
            </h3>
            <p className="text-[10px] sm:text-xs font-semibold text-slate-600 print:text-black">
              Bastipur, Karjanha-05, Siraha, Nepal &bull; Regd: 1482/071 &bull; Ph: +977 9709867048
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="inline-block bg-amber-100 text-amber-900 text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider border border-amber-300 print:border-black print:bg-slate-100 print:text-black">
            {copyTitle}
          </span>
          <p className="text-[10px] font-black text-emerald-800 uppercase mt-1 print:text-black">
            PHYSICAL CASH COUNTER
          </p>
        </div>
      </div>

      {/* Receipt Info Subheader */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs py-2.5 border-b border-slate-200 print:border-black">
        <div>
          <span className="text-[10px] font-bold text-slate-400 block uppercase">Receipt No</span>
          <span className="font-mono font-black text-[#0A3D62] text-sm print:text-black">{receipt.receiptNo}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-400 block uppercase">Receipt Date</span>
          <span className="font-bold text-slate-800 print:text-black">{receipt.date}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-400 block uppercase">Student Name</span>
          <span className="font-black text-slate-900 print:text-black">{receipt.studentName}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-400 block uppercase">Class & Roll</span>
          <span className="font-black text-slate-900 print:text-black">{receipt.className} {receipt.rollNo ? `(#${receipt.rollNo})` : ''}</span>
        </div>
      </div>

      {/* Financial Breakdown Table */}
      <div className="mt-2.5 overflow-hidden rounded-xl border border-slate-200 print:border-black">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-700 print:bg-gray-200 print:text-black font-black uppercase text-[10px]">
              <th className="p-2 pl-3">Description / Covered Period</th>
              <th className="p-2 pr-3 text-right">Amount (NRs.)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 print:divide-black">
            {receipt.baseTuition > 0 && (
              <tr>
                <td className="p-2 pl-3 font-semibold text-slate-800 print:text-black">
                  Monthly Tuition {receipt.coveredMonths && receipt.coveredMonths.length > 0 ? `(${receipt.coveredMonths.join(', ')})` : `(${receipt.billingPeriod || 'Current Dues'})`}
                </td>
                <td className="p-2 pr-3 text-right font-mono font-bold text-slate-900 print:text-black">
                  NRs. {receipt.baseTuition.toLocaleString()}
                </td>
              </tr>
            )}

            {receipt.additionalCharges.map((ch, idx) => (
              <tr key={idx} className="bg-blue-50/40 print:bg-white">
                <td className="p-2 pl-3 text-blue-900 font-medium print:text-black">
                  + {ch.purpose}
                </td>
                <td className="p-2 pr-3 text-right font-mono font-bold text-blue-800 print:text-black">
                  + NRs. {Number(ch.amount).toLocaleString()}
                </td>
              </tr>
            ))}

            {receipt.discounts.map((dc, idx) => (
              <tr key={idx} className="bg-red-50/40 print:bg-white">
                <td className="p-2 pl-3 text-red-900 font-medium print:text-black">
                  - Concession / Discount ({dc.purpose})
                </td>
                <td className="p-2 pr-3 text-right font-mono font-bold text-red-700 print:text-black">
                  - NRs. {Number(dc.amount).toLocaleString()}
                </td>
              </tr>
            ))}

            {/* Total Row */}
            <tr className="bg-slate-50 font-black border-t-2 border-slate-300 print:border-black print:bg-gray-100">
              <td className="p-2 pl-3 text-slate-900 print:text-black">Net Payable Total:</td>
              <td className="p-2 pr-3 text-right font-mono text-slate-900 print:text-black">
                NRs. {totalPayable.toLocaleString()}
              </td>
            </tr>
            <tr className="bg-emerald-50/80 font-black print:bg-white">
              <td className="p-2 pl-3 text-emerald-950 uppercase print:text-black flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-700 print:hidden" />
                <span>Physical Cash Collected:</span>
              </td>
              <td className="p-2 pr-3 text-right font-mono text-emerald-900 text-sm print:text-black">
                NRs. {cashReceived.toLocaleString()}
              </td>
            </tr>
            <tr className="bg-white font-bold text-slate-700 print:text-black">
              <td className="p-2 pl-3">Amount Applied to Dues:</td>
              <td className="p-2 pr-3 text-right font-mono text-slate-900 print:text-black">
                NRs. {amountApplied.toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Dynamic Status / Excess / Remaining Badges */}
      <div className="mt-2 text-xs space-y-1">
        {remainingOutstanding > 0 && (
          <div className="flex justify-between items-center text-[11px] bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 print:border-black print:bg-white">
            <span className="font-bold text-red-800 print:text-black">Remaining Balance Due:</span>
            <span className="font-black font-mono text-red-700 print:text-black">NRs. {remainingOutstanding.toLocaleString()}</span>
          </div>
        )}

        {advanceCreated > 0 && (
          <div className="flex justify-between items-center text-[11px] bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-200 print:border-black print:bg-white">
            <span className="font-bold text-sky-800 print:text-black flex items-center gap-1">
              <Wallet className="w-3 h-3 text-sky-600 print:hidden" />
              Excess Credited to Student Advance Account:
            </span>
            <span className="font-black font-mono text-sky-700 print:text-black">NRs. {advanceCreated.toLocaleString()}</span>
          </div>
        )}

        {excessReturned > 0 && (
          <div className="flex justify-between items-center text-[11px] bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 print:border-black print:bg-white">
            <span className="font-bold text-amber-900 print:text-black">Excess Physical Cash Returned to Guardian:</span>
            <span className="font-black font-mono text-amber-900 print:text-black">NRs. {excessReturned.toLocaleString()}</span>
          </div>
        )}

        <div className="text-[11px] font-bold italic text-slate-600 print:text-black pt-1">
          Amount in Words: <span className="font-semibold not-italic text-slate-800 print:text-black">{words}</span>
        </div>
        {receipt.remarks && (
          <div className="text-[10px] text-slate-500 font-medium print:text-gray-700">
            Note: {receipt.remarks}
          </div>
        )}
      </div>

      {/* Signatures */}
      <div className="mt-5 pt-4 border-t border-slate-200 print:border-black grid grid-cols-3 gap-3 text-center text-xs">
        <div>
          <div className="h-6"></div>
          <p className="border-t border-slate-300 print:border-black pt-1 font-bold text-slate-700 print:text-black text-[10px]">
            Cashier / Bursar ({receipt.cashierName || 'Counter'})
          </p>
        </div>
        <div className="flex flex-col items-center justify-center">
          <div className="w-10 h-10 rounded-full border border-dashed border-[#0A3D62] text-[7px] font-bold text-[#0A3D62] flex items-center justify-center print:border-black print:text-black">
            SEAL
          </div>
          <p className="text-[9px] text-slate-400 mt-0.5 print:text-gray-600">School Stamp</p>
        </div>
        <div>
          <div className="h-6"></div>
          <p className="border-t border-slate-300 print:border-black pt-1 font-bold text-slate-700 print:text-black text-[10px]">
            Parent / Guardian Signature
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex justify-center items-start p-2 sm:p-4 print:p-0 print:bg-white print:static print:overflow-visible">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-4 print:border-none print:shadow-none print:rounded-none print:m-0 print:max-w-none animate-in zoom-in-95 duration-150">
        
        {/* Top Control Bar (Hidden on physical print) */}
        <div className="bg-slate-900 text-white px-6 py-4 flex flex-wrap justify-between items-center gap-3 print:hidden border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-400/30">
                PAYMENT RECORDED • PHYSICAL CASH
              </span>
              <h3 className="text-base font-black mt-0.5">
                Cash Receipt #{receipt.receiptNo}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Print Receipt (Dual Copy)
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-70 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              {isDownloadingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating PDF...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" /> Download PDF
                </>
              )}
            </button>
            <button
              onClick={onClose}
              type="button"
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Area containing Dual Copy */}
        <div ref={printRef} className="p-4 sm:p-6 space-y-6 print:p-4 print:space-y-4">
          
          {/* Copy 1: Student / Guardian Copy */}
          <ReceiptSlip copyTitle="Student / Guardian Copy" />

          {/* Dotted Scissors Line */}
          <div className="relative py-2 flex items-center justify-center text-slate-400 text-[10px] font-mono select-none">
            <div className="border-t-2 border-dashed border-slate-300 print:border-black w-full absolute"></div>
            <span className="bg-white px-4 relative z-10 text-slate-500 font-bold print:text-black">
              ✂ CUT OR TEAR ALONG DOTTED LINE ✂
            </span>
          </div>

          {/* Copy 2: School / Accounts Office Copy */}
          <ReceiptSlip copyTitle="School / Accounts Office Copy" />

        </div>

        {/* Modal Bottom Actions */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-wrap justify-between items-center gap-3 print:hidden">
          <p className="text-xs text-slate-500 font-medium">
            ✅ Payment logged to cash ledger. Hand over the top copy to the parent and file the office copy.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Print Receipt
            </button>
            <button
              onClick={onClose}
              type="button"
              className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold text-xs cursor-pointer"
            >
              Close & Next Student
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
