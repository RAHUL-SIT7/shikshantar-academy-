import React, { useRef } from 'react';
import { Printer, Download, X, Building2, Phone, Mail, MapPin, Award, AlertTriangle, ShieldCheck } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getSchoolLogoBase64 } from '../../lib/logoHelper';

interface FeeStructureWallChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: {
    academicYear?: string;
    academic: any[];
    transportation: any[];
    lab: any[];
    customTables?: any[];
    academicColumns?: any[];
  };
}

export default function FeeStructureWallChartModal({
  isOpen,
  onClose,
  data
}: FeeStructureWallChartModalProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const academicYear = data.academicYear || '2083';

  // Direct Browser Print & PDF Download handler
  const handlePrint = async () => {
    // Generate official PDF download which works reliably in all browsers/iframes
    await handleDownloadPdf();
    try {
      window.print();
    } catch (e) {
      console.log('window.print suppressed in iframe:', e);
    }
  };

  // Official PDF Generation using jsPDF and autoTable
  const handleDownloadPdf = async () => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 14;

    // Header Top Banner
    pdf.setFillColor(10, 61, 98); // #0A3D62 (Deep Navy / Royal Blue)
    pdf.rect(0, 0, pageWidth, 5, 'F');

    // School Logo
    try {
      const logoBase64 = await getSchoolLogoBase64();
      if (logoBase64) {
        pdf.addImage(logoBase64, 'PNG', 14, 7, 20, 20);
      }
    } catch (err) {
      console.warn('Could not add logo to PDF:', err);
    }

    // School Title & Crest Header
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(10, 61, 98);
    pdf.text('SHIKSHANTAR ACADEMY SECONDARY SCHOOL', pageWidth / 2, 14, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(71, 85, 105); // Slate 600
    pdf.text('Bastipur, Karjanha-05, Siraha, Madhesh Province, Nepal', pageWidth / 2, 19, { align: 'center' });
    pdf.text('Estd: 2072 B.S. • Affiliated to NEB & Ministry of Education, Nepal', pageWidth / 2, 23, { align: 'center' });
    pdf.text('Ph: +977 9807790805, +977 9709867048 | Email: shikshantaracademy@gmail.com', pageWidth / 2, 27, { align: 'center' });

    // Official Header Banner
    pdf.setFillColor(241, 245, 249);
    pdf.setDrawColor(10, 61, 98);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(margin, 30, pageWidth - (margin * 2), 8, 1.5, 1.5, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(10, 61, 98);
    pdf.text(`OFFICIAL FEE STRUCTURE — SESSION ${academicYear}`, pageWidth / 2, 35.5, { align: 'center' });

    // Section 1: Standard Class-wise Academic Fees Table
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(15, 23, 42);
    pdf.text('1. CLASS-WISE REGULAR ACADEMIC FEE SCHEDULE (MONTHLY & ANNUAL)', margin, 45);

    const cols = data.academicColumns || [
      { key: 'className', label: 'Class' },
      { key: 'admission', label: 'Admission Fee' },
      { key: 'annual', label: 'Annual Charges' },
      { key: 'tuition', label: 'Monthly Tuition' },
      { key: 'exam', label: 'Exam Fee' },
      { key: 'computer', label: 'Computer/Lab' }
    ];

    const headRow = cols.map(c => c.label);
    const bodyRows = data.academic.map((row: any) => {
      return cols.map(col => {
        if (col.key === 'className') return row.className;
        const val = row[col.key];
        return val ? `NRs. ${val}` : '-';
      });
    });

    autoTable(pdf, {
      startY: 48,
      head: [headRow],
      body: bodyRows,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5, font: 'helvetica' },
      headStyles: { 
        fillColor: [10, 61, 98], 
        textColor: [255, 255, 255], 
        fontStyle: 'bold',
        halign: 'center'
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: [15, 23, 42] }
      },
      margin: { left: margin, right: margin }
    });

    let currentY = (pdf as any).lastAutoTable.finalY + 6;

    // Check page height
    if (currentY > 210) {
      pdf.addPage();
      currentY = 16;
    }

    // Section 2: Transportation Route Fares
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(15, 23, 42);
    pdf.text('2. SCHOOL BUS & TRANSPORTATION TARIFF (MONTHLY PER VILLAGE)', margin, currentY);

    const transportRows = (data.transportation || []).map(t => [
      t.route,
      t.className || 'All Classes',
      `NRs. ${t.fee}`
    ]);

    autoTable(pdf, {
      startY: currentY + 2,
      head: [['Route Coverage Area / Pickup Point', 'Applicable Grades', 'Monthly Bus Fare']],
      body: transportRows,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold' },
      margin: { left: margin, right: margin }
    });

    currentY = (pdf as any).lastAutoTable.finalY + 6;

    // Section 3: Coaching / Special Programs (if available)
    if (data.customTables && data.customTables.length > 0 && currentY < 220) {
      const customTbl = data.customTables[0];
      if (customTbl && customTbl.rows && customTbl.rows.length > 0) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(15, 23, 42);
        pdf.text(`3. ${customTbl.title.toUpperCase()}`, margin, currentY);

        const customHead = customTbl.columns.map((c: any) => c.label);
        const customRows = customTbl.rows.map((r: any) => {
          return customTbl.columns.map((c: any) => r[c.key] ? (c.key.toLowerCase().includes('rate') || c.key.toLowerCase().includes('fee') ? `NRs. ${r[c.key]}` : r[c.key]) : '-');
        });

        autoTable(pdf, {
          startY: currentY + 2,
          head: [customHead],
          body: customRows,
          theme: 'grid',
          styles: { fontSize: 7, cellPadding: 1.5 },
          headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
          margin: { left: margin, right: margin }
        });

        currentY = (pdf as any).lastAutoTable.finalY + 6;
      }
    }

    currentY += 10;

    if (currentY > 260) {
      pdf.addPage();
      currentY = 20;
    }

    // Authorized Signatories & Seal
    pdf.setDrawColor(203, 213, 225);
    pdf.line(margin, currentY, pageWidth - margin, currentY);

    const sigY = currentY + 12;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(30, 41, 59);

    // Accountant
    pdf.text('Prepared By: _____________________', margin, sigY);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text('Accountant / Cashier Desk', margin, sigY + 4);

    // Official Seal (Center)
    pdf.setDrawColor(10, 61, 98);
    pdf.circle(pageWidth / 2, sigY - 2, 7);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(5);
    pdf.setTextColor(10, 61, 98);
    pdf.text('OFFICIAL SEAL', pageWidth / 2, sigY - 3, { align: 'center' });
    pdf.text('SHIKSHANTAR', pageWidth / 2, sigY, { align: 'center' });

    // Principal
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(30, 41, 59);
    pdf.text('Approved By: _____________________', pageWidth - margin, sigY, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text('Principal / Academic Director', pageWidth - margin, sigY + 4, { align: 'right' });

    // Bottom System ID
    pdf.setFontSize(6);
    pdf.setTextColor(148, 163, 184);
    pdf.text(`Shikshantar Academic Management System • Official Fee Structure: Session ${academicYear}`, margin, 290);

    pdf.save(`Shikshantar_Academy_Fee_Structure_${academicYear}.pdf`);
  };

  const columns = data.academicColumns || [
    { key: 'className', label: 'Class' },
    { key: 'admission', label: 'Admission Fee' },
    { key: 'annual', label: 'Annual Charges' },
    { key: 'tuition', label: 'Monthly Tuition' },
    { key: 'exam', label: 'Exam Fee' },
    { key: 'computer', label: 'Computer/Lab' }
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex justify-center items-start p-2 sm:p-4 md:p-6 print:p-0 print:bg-white print:static print:overflow-visible">
      {/* Container Dialog */}
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden animate-in zoom-in-95 duration-200 print:border-none print:shadow-none print:rounded-none print:max-w-none">
        
        {/* Top Control Bar (Hidden during Print) */}
        <div className="bg-slate-900 text-white px-6 py-4 flex flex-wrap justify-between items-center gap-3 print:hidden border-b border-slate-800">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-full border border-blue-400/30">
              OFFICIAL DOCUMENT
            </span>
            <h2 className="text-lg font-black tracking-tight mt-1 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-400" /> Official Fee Structure ({academicYear})
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handlePrint}
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
              title="Print official fee structure document"
            >
              <Printer className="w-4 h-4" /> Print Fee Structure
            </button>

            <button
              onClick={handleDownloadPdf}
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
              title="Download official formatted PDF"
            >
              <Download className="w-4 h-4" /> Download Official PDF
            </button>

            <button
              onClick={onClose}
              type="button"
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors"
              title="Close Preview"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Printable Poster Canvas */}
        <div 
          id="official-fee-wall-chart" 
          ref={chartRef}
          className="p-6 sm:p-10 bg-white text-slate-900 font-sans print:p-6 print:m-0"
        >
          {/* Outer Border for Official Document */}
          <div className="border-4 border-[#0A3D62] p-5 sm:p-8 rounded-2xl relative shadow-xs print:border-4 print:border-black print:p-4">
            
            {/* Corner Decorative Accents */}
            <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-[#0A3D62] print:border-black" />
            <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-[#0A3D62] print:border-black" />
            <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-[#0A3D62] print:border-black" />
            <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-[#0A3D62] print:border-black" />

            {/* School Crest & Official Header */}
            <div className="text-center pb-5 border-b-2 border-slate-200 print:border-black">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-2">
                <img 
                  src="/logo.png" 
                  alt="Shikshantar Academy Logo" 
                  className="w-20 h-20 object-contain rounded-full border-2 border-[#0A3D62]/20 p-1 print:border-black"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0A3D62] uppercase print:text-black">
                    SHIKSHANTAR ACADEMY SECONDARY SCHOOL
                  </h1>
                  <p className="text-xs sm:text-sm font-semibold text-slate-700 tracking-wide mt-0.5 print:text-black">
                    Bastipur, Karjanha-05, Siraha, Madhesh Province, Nepal
                  </p>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5 print:text-gray-700">
                    Estd: 2072 B.S. • Affiliated to NEB & Ministry of Education, Nepal
                  </p>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5 print:text-gray-700">
                    Ph: +977 9807790805, +977 9709867048 | Email: shikshantaracademy@gmail.com
                  </p>
                </div>
              </div>

              {/* Title Badge */}
              <div className="mt-4 inline-block bg-[#0A3D62] text-white px-6 py-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-widest print:bg-black print:text-white">
                OFFICIAL FEE STRUCTURE — SESSION {academicYear}
              </div>
            </div>

            {/* Table 1: Standard Class-wise Fees Schedule */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs sm:text-sm font-black text-[#0A3D62] uppercase tracking-wider print:text-black flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#0A3D62] print:bg-black"></span>
                  1. Standard Class-Wise Fee Schedule (Academic Session {academicYear})
                </h3>
                <span className="text-[10px] font-bold text-slate-500 print:text-black uppercase">
                  Currency: Nepali Rupees (NRs.)
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-300 print:border-black">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#0A3D62] text-white print:bg-slate-200 print:text-black">
                      {columns.map((col, idx) => (
                        <th 
                          key={col.key}
                          className={`p-2.5 font-bold uppercase tracking-wider text-[11px] border border-slate-400 print:border-black ${idx === 0 ? 'text-left pl-4' : 'text-right'}`}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 print:divide-black">
                    {data.academic.map((row: any, rIdx: number) => (
                      <tr 
                        key={row.id || rIdx} 
                        className={`hover:bg-slate-50 ${rIdx % 2 === 1 ? 'bg-slate-50/70 print:bg-gray-100' : 'bg-white'}`}
                      >
                        {columns.map((col, cIdx) => (
                          <td 
                            key={col.key}
                            className={`p-2 border border-slate-200 print:border-black ${cIdx === 0 ? 'font-black text-[#0A3D62] pl-4 print:text-black' : 'text-right font-mono font-bold text-slate-800 print:text-black'}`}
                          >
                            {cIdx === 0 ? row.className : (row[col.key] ? `NRs. ${Number(row[col.key]).toLocaleString()}` : '-')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 2: Transportation Route Fares */}
            {data.transportation && data.transportation.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs sm:text-sm font-black text-[#0A3D62] uppercase tracking-wider mb-2 print:text-black flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 print:bg-black"></span>
                  2. School Bus & Transportation Tariff (Monthly per Village / Pickup Stop)
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-300 print:border-black">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-emerald-700 text-white print:bg-slate-200 print:text-black">
                        <th className="p-2 border border-slate-400 print:border-black font-bold uppercase pl-4">Route / Pickup Point</th>
                        <th className="p-2 border border-slate-400 print:border-black font-bold uppercase text-center">Eligibility</th>
                        <th className="p-2 border border-slate-400 print:border-black font-bold uppercase text-right pr-4">Monthly Fare</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 print:divide-black">
                      {data.transportation.map((t, idx) => (
                        <tr key={t.id || idx} className={idx % 2 === 1 ? 'bg-slate-50 print:bg-gray-100' : 'bg-white'}>
                          <td className="p-2 pl-4 border border-slate-200 print:border-black font-bold text-slate-800 print:text-black">{t.route}</td>
                          <td className="p-2 border border-slate-200 print:border-black text-center text-slate-600 print:text-black">{t.className || 'All Classes'}</td>
                          <td className="p-2 pr-4 border border-slate-200 print:border-black text-right font-mono font-bold text-emerald-700 print:text-black">NRs. {Number(t.fee).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Special Coaching & Lab Programs (if present) */}
            {data.customTables && data.customTables.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs sm:text-sm font-black text-[#0A3D62] uppercase tracking-wider mb-2 print:text-black flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 print:bg-black"></span>
                  3. Special Coaching & Remedial Sessions Tariff
                </h3>
                {data.customTables.map((ct) => (
                  <div key={ct.id} className="overflow-x-auto rounded-xl border border-slate-300 print:border-black">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-indigo-800 text-white print:bg-slate-200 print:text-black">
                          {ct.columns.map((c: any) => (
                            <th key={c.key} className="p-2 border border-slate-400 print:border-black font-bold uppercase text-[11px]">{c.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 print:divide-black">
                        {ct.rows.map((r: any, rIdx: number) => (
                          <tr key={r.id || rIdx} className={rIdx % 2 === 1 ? 'bg-slate-50 print:bg-gray-100' : 'bg-white'}>
                            {ct.columns.map((c: any) => (
                              <td key={c.key} className="p-2 border border-slate-200 print:border-black font-semibold text-slate-800 print:text-black">
                                {r[c.key] || '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            {/* Official Signatures & Seal Section */}
            <div className="mt-8 pt-6 border-t-2 border-slate-300 print:border-black">
              <div className="grid grid-cols-3 gap-4 items-end text-center">
                {/* Prepared By / Cashier */}
                <div>
                  <div className="h-10"></div>
                  <div className="border-t border-slate-400 print:border-black pt-1.5">
                    <p className="text-xs font-black text-slate-800 print:text-black">Prepared By</p>
                    <p className="text-[10px] text-slate-500 print:text-gray-700">Accountant / Bursar Desk</p>
                  </div>
                </div>

                {/* Official School Seal */}
                <div className="flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-full border-2 border-dashed border-[#0A3D62] flex flex-col items-center justify-center p-1 text-[8px] font-bold text-[#0A3D62] uppercase print:border-black print:text-black">
                    <span>SCHOOL SEAL</span>
                    <span className="text-[7px]">ACADEMY STAMP</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 print:text-gray-700">Official Seal</p>
                </div>

                {/* Approved By / Principal */}
                <div>
                  <div className="h-10"></div>
                  <div className="border-t border-slate-400 print:border-black pt-1.5">
                    <p className="text-xs font-black text-slate-800 print:text-black">Approved By</p>
                    <p className="text-[10px] text-slate-500 print:text-gray-700">Principal / Academic Director</p>
                  </div>
                </div>
              </div>

              {/* Bottom Copyright & Print Info */}
              <div className="mt-6 pt-3 border-t border-slate-200 flex justify-between items-center text-[9px] text-slate-400 print:text-gray-600 font-mono">
                <span>Shikshantar Academic Management System</span>
                <span>Publication Date: Baisakh {academicYear} &bull; Official Fee Schedule</span>
              </div>
            </div>

          </div>
        </div>

        {/* Footer Actions (Hidden during Print) */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3 print:hidden">
          <p className="text-xs text-slate-500 font-medium">
            💡 <strong>Official Document:</strong> Click <em>Print Fee Structure</em> to print, or <em>Download Official PDF</em> to save the formatted fee schedule.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all"
            >
              <Printer className="w-4 h-4" /> Print Fee Structure
            </button>
            <button
              onClick={onClose}
              type="button"
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-xl font-bold text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
