import React, { useRef, useState, useEffect } from 'react';
import { Printer, Download, X, CheckCircle2, DollarSign, ArrowRight, ShieldCheck, Wallet, Loader2 } from 'lucide-react';
import { numberToWords } from '../../lib/numberToWords';
import { generateCashReceiptPDF, CashReceiptData } from '../../lib/pdfExport';
import { getSchoolLogoBase64 } from '../../lib/logoHelper';
export type { CashReceiptData };
const logoImage = "/logo.png";

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
      const pdf = await generateCashReceiptPDF(receipt);
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
