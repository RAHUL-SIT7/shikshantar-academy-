import React, { useState, useMemo } from 'react';
import { Search, Printer, Calendar, FileText, CheckCircle2, AlertCircle, ShoppingBag, Landmark, ArrowRight, UserCheck, RefreshCw, Badge, ClipboardList } from 'lucide-react';
import { getBSYearMonthDate } from '../../lib/nepaliDate';

const MONTHS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];

export default function StudentLedgerDetailTab({ students, transactions, onRefresh }: { students: any[], transactions?: any[], onRefresh?: () => void }) {
    const [selectedClass, setSelectedClass] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

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
        if (!selectedStudentId) return null;
        return students.find(s => s.id === selectedStudentId) || null;
    }, [students, selectedStudentId]);

    // Construct the 12 months ledger showing every fee item
    const currentYearMonth = getBSYearMonthDate();
    
    const detailedLedger = useMemo(() => {
        if (!selectedStudent) return [];

        const tuitionFee = Number(selectedStudent.monthlyFee || 0);
        const examFee = Number(selectedStudent.examFee || 0);
        const computerFee = Number(selectedStudent.computerFee || 0);
        const transportFee = Number(selectedStudent.transportFee || 0);
        const otherFee = Number(selectedStudent.otherFee || 0);

        const realFees = selectedStudent.fees || [];

        // Build list for 12 months
        return MONTHS.map((monthName, idx) => {
            // Helper to find real firebase entry
            const findRealFee = (type: string) => {
                return realFees.find((f: any) => {
                    const mName = f.month ? f.month.trim().toLowerCase() : '';
                    const matchM = mName.includes(monthName.toLowerCase()) || 
                                  (monthName === 'Baisakh' && mName.includes('baisak')) ||
                                  (monthName === 'Jestha' && mName.includes('jest')) ||
                                  (monthName === 'Asar' && mName.includes('asar'));
                    const matchType = (f.type || '').trim().toLowerCase() === type.trim().toLowerCase();
                    return matchM && matchType;
                });
            };

            // Fee items
            const feeItems = [
                { type: 'Tuition Fee', base: tuitionFee },
                { type: 'Exam Fee', base: examFee },
                { type: 'Computer Fee', base: computerFee },
                { type: 'Transport Fee', base: transportFee },
                { type: 'Other Fee', base: otherFee }
            ];

            let totalBilled = 0;
            let totalPaid = 0;

            const itemsWithStatus = feeItems.map((item, itemIdx) => {
                const realData = findRealFee(item.type);
                totalBilled += item.base;

                if (realData) {
                    // Respect actual database state
                    const paid = Number(realData.paidAmount || (realData.status === 'paid' ? realData.totalFee : 0) || 0);
                    const due = Number(realData.dueAmount !== undefined ? realData.dueAmount : (realData.status === 'due' ? realData.totalFee : 0));
                    totalPaid += paid;
                    return {
                        name: item.type,
                        amount: item.base,
                        paidAmount: paid,
                        dueAmount: due,
                        status: realData.status || (paid >= item.base ? 'paid' : 'due'),
                        receiptNo: realData.receiptNo || 'SA-AUTO-' + (1000 + idx) + '-' + itemIdx,
                        isDummy: false,
                        remarks: realData.remarks || 'Standard Payment'
                    };
                } else {
                    // Default to due (unpaid / 'not done') if there is no database entry for this month
                    const isPaidMonth = false; 
                    if (isPaidMonth && item.base > 0) {
                        const paid = item.base;
                        totalPaid += paid;
                        return {
                            name: item.type,
                            amount: item.base,
                            paidAmount: paid,
                            dueAmount: 0,
                            status: 'paid',
                            receiptNo: `SA-REC-2083-${(100 + idx)}-${itemIdx}`,
                            isDummy: true,
                            remarks: 'Simulated Pre-paid Month'
                        };
                    } else {
                        return {
                            name: item.type,
                            amount: item.base,
                            paidAmount: 0,
                            dueAmount: item.base,
                            status: 'due', // will render as 'not done'
                            receiptNo: '-',
                            isDummy: false,
                            remarks: ''
                        };
                    }
                }
            });

            const isFullyPaid = totalPaid >= totalBilled && totalBilled > 0;

            return {
                month: monthName,
                monthIndex: idx,
                totalBilled,
                totalPaid,
                isFullyPaid,
                items: itemsWithStatus
            };
        });
    }, [selectedStudent]);

    // Handle print single month invoice detail
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
                        <td style="border: 1px solid #e5e7eb; padding: 10px; font-size: 13px; text-align: right; font-weight: bold;">NRs. ${item.amount}</td>
                        <td style="border: 1px solid #e5e7eb; padding: 10px; font-size: 13px; text-align: center;">
                            <span style="font-weight: bold; font-size: 11px; padding: 2px 8px; border-radius: 9999px; background-color: ${item.status === 'paid' ? '#dcfce7; color: #15803d;' : '#fee2e2; color: #b91c1c;'}">
                                ${item.status === 'paid' ? 'PAID' : 'NOT DONE'}
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
                    <div style="text-align: center; border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: #1e3a8a;">SHIKSHANTAR ACADEMY</h2>
                        <p style="margin: 4px 0; font-size: 12px; color: #4b5563;">Karjanhana Municipality, Bastipur-5, Siraha, Nepal</p>
                        <p style="margin: 4px 0; font-size: 12px; font-weight: bold; color: #10b981;">MONTHLY DETAILED STATEMENT: ${monthData.month.toUpperCase()}</p>
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
                        <span style="font-size: 16px; color: #10b981;">NRs. ${monthData.totalPaid}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; margin-top: 8px;">
                        <span style="font-size: 13px; color: #b91c1c;">OUTSTANDING DUE:</span>
                        <span style="font-size: 16px; color: #b91c1c;">NRs. ${monthData.totalBilled - monthData.totalPaid}</span>
                    </div>

                    <div style="margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; font-style: italic;">
                        <div>System Logged. Verification key: AI-STAFF-SYS</div>
                        <div>Authorized Signature</div>
                    </div>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <div className="space-y-6">
            {/* Header Title bar */}
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-indigo-600" /> Student Detailed Ledger (Laser)
                    </h2>
                    <p className="text-xs text-gray-400 font-medium">12-Month itemized status overview, pre-filled with beautiful fallback dummy records</p>
                </div>
                {selectedStudent && (
                    <button 
                        onClick={() => {
                            const printWindow = window.open('', '_blank');
                            if (!printWindow) return;
                            let html = `<html><head><title>Full Year Ledger - ${selectedStudent.name}</title></head>`;
                            html += `<body onload="window.print();" style="font-family: Arial, sans-serif; padding: 30px;">`;
                            html += `<div style="text-align:center; margin-bottom:20px;">`;
                            html += `<h2 style="margin:0;">SHIKSHANTAR ACADEMY</h2>`;
                            html += `<p>Karjanhana, Siraha, Nepal | Complete 12-Month Financial Ledger</p></div>`;
                            html += `<p><strong>Student Name:</strong> ${selectedStudent.name} (ID: ${selectedStudent.studentId || '-'}) &nbsp;&nbsp; <strong>Class:</strong> ${selectedStudent.class} &nbsp;&nbsp; <strong>Roll:</strong> ${selectedStudent.rollNumber || '-'}</p>`;
                            html += `<table style="width:100%; border-collapse:collapse; margin-top:15px;">`;
                            html += `<thead style="background:#f3f4f6;"><tr><th style="border:1px solid #ccc; padding:8px; text-align:left;">Month</th><th style="border:1px solid #ccc; padding:8px; text-align:right;">Billed Amount</th><th style="border:1px solid #ccc; padding:8px; text-align:right;">Paid Amount</th><th style="border:1px solid #ccc; padding:8px; text-align:right;">Outstanding Due</th><th style="border:1px solid #ccc; padding:8px; text-align:center;">Status</th></tr></thead><tbody>`;
                            detailedLedger.forEach(row => {
                                html += `<tr><td style="border:1px solid #ccc; padding:8px;"><strong>${row.month}</strong></td><td style="border:1px solid #ccc; padding:8px; text-align:right;">NRs. ${row.totalBilled}</td><td style="border:1px solid #ccc; padding:8px; text-align:right;">NRs. ${row.totalPaid}</td><td style="border:1px solid #ccc; padding:8px; text-align:right; color:#b91c1c;">NRs. ${row.totalBilled - row.totalPaid}</td><td style="border:1px solid #ccc; padding:8px; text-align:center; font-weight:bold; color:${row.isFullyPaid ? '#15803d' : '#b91c1c'};">${row.isFullyPaid ? 'FULLY PAID' : 'PARTIAL / NOT DONE'}</td></tr>`;
                            });
                            html += `</tbody></table></body></html>`;
                            printWindow.document.write(html);
                            printWindow.document.close();
                        }}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-1.5"
                    >
                        <Printer className="w-4 h-4" /> Print Full Ledger
                    </button>
                )}
            </div>

            {/* Quick search and filter panel */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Class Level</label>
                    <select 
                        value={selectedClass}
                        onChange={(e) => {
                            setSelectedClass(e.target.value);
                            setSelectedStudentId(null);
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                    >
                        <option value="">All Classes</option>
                        {classes.map(c => <option key={c} value={c}>Class {c}</option>)}
                    </select>
                </div>
                <div className="md:col-span-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Student Name, ID, or Roll Number</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input 
                            type="text"
                            placeholder="Enter keyword to search..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setSelectedStudentId(null);
                            }}
                            className="pl-10 pr-4 py-3 w-full bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                        />
                    </div>
                </div>
            </div>

            {/* Main view container: list on left, detailed view on right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* LIST OF STUDENTS */}
                <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-[450px] flex flex-col">
                    <div className="bg-slate-50 px-5 py-3.5 border-b border-gray-100">
                        <h3 className="font-black text-xs uppercase tracking-wider text-slate-600 flex items-center justify-between">
                            <span>Students Matches</span>
                            <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-bold">{filteredStudents.length}</span>
                        </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                        {filteredStudents.length > 0 ? filteredStudents.map(student => (
                            <button
                                key={student.id}
                                onClick={() => setSelectedStudentId(student.id)}
                                className={`w-full text-left p-4 hover:bg-slate-50/50 transition-all flex items-center justify-between ${selectedStudentId === student.id ? 'bg-indigo-50/60 border-l-4 border-indigo-600' : ''}`}
                            >
                                <div>
                                    <h4 className="font-bold text-gray-900 text-sm">{student.name}</h4>
                                    <p className="text-[11px] text-gray-400 font-mono mt-0.5 uppercase">Class {student.class} &bull; Roll: {student.rollNumber || '-'}</p>
                                </div>
                                <ArrowRight className={`w-4 h-4 text-gray-300 transition-transform ${selectedStudentId === student.id ? 'translate-x-1 text-indigo-600' : ''}`} />
                            </button>
                        )) : (
                            <div className="p-8 text-center text-gray-400 font-bold text-xs italic">
                                No matching students. Change selection or type search parameter.
                            </div>
                        )}
                    </div>
                </div>

                {/* HISTORICAL DETAILED 12 MONTH LEDGER DISPLAY */}
                <div className="lg:col-span-8 space-y-6">
                    {selectedStudent ? (
                        <div className="space-y-6">
                            {/* Profile spotlight card */}
                            <div className="bg-gradient-to-br from-[#121c33] to-[#253966] rounded-3xl p-6 text-white shadow-md relative overflow-hidden">
                                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                    <div>
                                        <div className="bg-indigo-500/20 text-indigo-200 border border-indigo-400/20 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full inline-block mb-2">
                                            ACTIVE ENROLLED PROFILE
                                        </div>
                                        <h3 className="text-xl md:text-2xl font-black tracking-tight">{selectedStudent.name}</h3>
                                        <p className="text-indigo-200/80 text-xs font-semibold mt-1 flex items-center gap-1.5 uppercase tracking-wide">
                                            Roll number: <span className="font-mono text-white bg-indigo-900/60 px-1.5 py-0.5 rounded">{selectedStudent.rollNumber || '-'}</span>
                                            &bull; ID: <span className="font-mono text-white bg-indigo-900/60 px-1.5 py-0.5 rounded">{selectedStudent.studentId || '-'}</span>
                                            &bull; Class: <span className="font-bold text-white bg-indigo-900/60 px-1.5 py-0.5 rounded">Class {selectedStudent.class}</span>
                                        </p>
                                    </div>
                                    <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10 space-y-1 min-w-[150px] text-right font-sans">
                                        <span className="block text-[9px] font-black text-indigo-200 uppercase tracking-wider">MONTHLY BASE TUITION</span>
                                        <strong className="text-xl font-black text-indigo-300">NRs. {(Number(selectedStudent.monthlyFee || 0)).toLocaleString()}</strong>
                                    </div>
                                </div>
                                <div className="absolute top-0 right-0 p-8 opacity-5">
                                    <UserCheck className="w-40 h-40" />
                                </div>
                            </div>

                            {/* 12-Month Interactive Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {detailedLedger.map((row) => (
                                    <div key={row.month} className="bg-white rounded-2xl border border-gray-150 p-5 space-y-4 hover:shadow-sm transition-all relative overflow-hidden flex flex-col justify-between">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="font-black text-slate-800 text-sm tracking-wide">{row.month}</h4>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Month of Calendar Year</p>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${row.isFullyPaid ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200/50'}`}>
                                                {row.isFullyPaid ? 'FULLY PAID' : 'NOT DONE'}
                                            </span>
                                        </div>

                                        {/* List of fee items for this Month */}
                                        <div className="bg-slate-50 rounded-xl p-3 divide-y divide-gray-100 text-xs font-bold text-gray-700">
                                            {row.items.filter(item => item.amount > 0).map((item) => (
                                                <div key={item.name} className="py-2 flex justify-between items-center first:pt-0 last:pb-0">
                                                    <div>
                                                        <span className="block text-[11px] text-gray-800 leading-none">{item.name}</span>
                                                        <span className="text-[9px] text-gray-400 font-mono font-normal">RCP: {item.receiptNo}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-slate-600 font-bold font-mono">NRs.{item.amount}</span>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'paid' ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} title={item.status === 'paid' ? 'Paid' : 'Unpaid'}></span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="pt-2 border-t border-dashed border-gray-200 flex justify-between items-center">
                                            <div className="text-xs">
                                                <span className="text-slate-400 font-medium block">Total Paid in Month</span>
                                                <span className="text-emerald-700 font-black font-mono">NRs. {row.totalPaid}</span>
                                            </div>
                                            <button
                                                onClick={() => printMonthDetail(row)}
                                                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-1 shrink-0"
                                            >
                                                <Printer className="w-3.5 h-3.5" /> Details
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white border border-dashed border-gray-300 rounded-[2rem] p-12 text-center text-gray-400 space-y-4 shadow-sm flex flex-col justify-center items-center py-20">
                            <FileText className="w-16 h-16 text-slate-350" />
                            <div>
                                <h3 className="font-extrabold text-slate-700 text-base uppercase tracking-tight">No student selected yet</h3>
                                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Please search and choose a student from the sidebar list to inspect their premium 12-month transaction &amp; billing ledger details.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
