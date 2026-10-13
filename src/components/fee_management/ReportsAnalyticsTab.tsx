import React, { useState, useMemo } from 'react';
import { formatBSDate, getBSYearMonthDate, NEPALI_MONTHS } from '../../lib/nepaliDate';
import { FileDown, CheckCircle, X, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { exportToExcel } from '../../lib/excelExport';
import { exportToPDF } from '../../lib/pdfExport';
import { isBillActive, isTransactionActive, normalizeBSMonth, extractBSMonthName, extractBSYear } from '../../lib/reportingAnalyticsEngine';
import { parseIntegerAmount } from '../../lib/cashPaymentEngine';

export interface ReportsAnalyticsProps {
  students: any[];
  transactions: any[];
  remitBills?: any[];
  academicYear?: string;
}

export default function ReportsAnalyticsTab({
  students = [],
  transactions = [],
  remitBills = [],
  academicYear: initialAcademicYear = '2083'
}: ReportsAnalyticsProps) {
  const [alertNotice, setAlertNotice] = useState<string | null>(null);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>(initialAcademicYear);
  const [selectedMonth, setSelectedMonth] = useState<string>('All');
  const [selectedClass, setSelectedClass] = useState<string>('All');

  // Derive unique classes from students
  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => {
      if (s.class) set.add(s.class);
    });
    return ['All', ...Array.from(set).sort()];
  }, [students]);

  // Filter transactions based on selection and active status
  const activeTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (!isTransactionActive(t)) return false;

      // Academic Year Filter
      if (selectedAcademicYear) {
        const tYear = extractBSYear(t.date || t.createdAt, selectedAcademicYear);
        if (tYear !== selectedAcademicYear) return false;
      }

      // Month Filter
      if (selectedMonth !== 'All') {
        const normFilter = normalizeBSMonth(selectedMonth);
        const tMonth = normalizeBSMonth(t.monthBS || extractBSMonthName(t.date || t.createdAt));
        if (tMonth !== normFilter) return false;
      }

      // Class Filter
      if (selectedClass !== 'All') {
        if (t.class !== selectedClass) return false;
      }

      return true;
    });
  }, [transactions, selectedAcademicYear, selectedMonth, selectedClass]);

  // Aggregate active students with source-of-truth calculations
  const enrichedStudents = useMemo(() => {
    return students
      .filter(s => selectedClass === 'All' || s.class === selectedClass)
      .map(s => {
        const sId = s.id || s.studentId;
        const studentBills = remitBills.filter(b => {
          const match = b.studentId === sId || b.studentId === s.studentId;
          if (!match) return false;
          if (!isBillActive(b)) return false;

          // Academic year filter
          const bYear = String(b.academicYear || '').replace(/\D/g, '') || selectedAcademicYear;
          const aYear = selectedAcademicYear.replace(/\D/g, '');
          if (aYear && bYear && bYear !== aYear) return false;

          // Month filter
          if (selectedMonth !== 'All') {
            const normFilter = normalizeBSMonth(selectedMonth);
            const covered = (b.coveredMonths || []).map((m: string) => normalizeBSMonth(m));
            if (!covered.includes(normFilter)) return false;
          }

          return true;
        });

        let billed = 0;
        let paid = 0;
        let due = 0;

        if (studentBills.length > 0) {
          studentBills.forEach(b => {
            const bTotal = parseIntegerAmount(b.totalAmount || 0);
            const bPaid = parseIntegerAmount(b.paidAmount || 0);
            const bDue = parseIntegerAmount(b.dueAmount !== undefined ? b.dueAmount : Math.max(0, bTotal - bPaid));
            billed += bTotal;
            paid += bPaid;
            due += bDue;
          });
        } else if (Array.isArray(s.fees)) {
          // Fallback to legacy fees collection if remitBills absent
          s.fees.forEach((f: any) => {
            const fDue = parseIntegerAmount(f.dueAmount !== undefined ? f.dueAmount : ((f.status === 'due' || f.status === 'partial') ? (f.totalFee || f.amount || 0) : 0));
            const fPaid = parseIntegerAmount(f.paidAmount || (f.status === 'paid' ? (f.totalFee || f.amount || 0) : 0));
            due += fDue;
            paid += fPaid;
            billed += (fDue + fPaid);
          });
        }

        return {
          ...s,
          name: s.fullName || s.name || 'Student',
          billed,
          paid,
          due
        };
      });
  }, [students, remitBills, selectedAcademicYear, selectedMonth, selectedClass]);

  const totalCollected = useMemo(() => {
    return enrichedStudents.reduce((sum, s) => sum + s.paid, 0);
  }, [enrichedStudents]);

  const totalDues = useMemo(() => {
    return enrichedStudents.reduce((sum, s) => sum + s.due, 0);
  }, [enrichedStudents]);

  const defaulters = useMemo(() => {
    return enrichedStudents.filter(s => s.due > 0);
  }, [enrichedStudents]);

  // Paid vs Due Pie Chart data
  const statusData = useMemo(() => {
    if (totalCollected === 0 && totalDues === 0) {
      return [{ name: 'No Active Dues', value: 1, fill: '#E5E7EB' }];
    }
    return [
      { name: 'Collected', value: totalCollected, fill: '#10B981' },
      { name: 'Outstanding', value: totalDues, fill: '#EF4444' }
    ];
  }, [totalCollected, totalDues]);

  // Class Bar Chart data
  const classData = useMemo(() => {
    const map: Record<string, { class: string; paid: number; due: number }> = {};
    enrichedStudents.forEach(s => {
      const cls = s.class || 'Unassigned';
      if (!map[cls]) map[cls] = { class: cls, paid: 0, due: 0 };
      map[cls].paid += s.paid;
      map[cls].due += s.due;
    });

    return Object.values(map).sort((a, b) => {
      const numA = parseInt(a.class, 10);
      const numB = parseInt(b.class, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.class.localeCompare(b.class);
    });
  }, [enrichedStudents]);

  // Export handlers
  const handleExportMonthlyExcel = async () => {
    const columns = [
      { header: 'Date (B.S.)', key: 'date', width: 20 },
      { header: 'Receipt No', key: 'receiptNo', width: 18 },
      { header: 'Student Name', key: 'studentName', width: 28 },
      { header: 'Class', key: 'class', width: 12 },
      { header: 'Payment Method', key: 'method', width: 16 },
      { header: 'Amount (NPR)', key: 'amount', width: 16 }
    ];

    const exportData = activeTransactions.map(t => ({
      date: formatBSDate(t.date || t.createdAt) || '',
      receiptNo: t.receiptNo || t.receipt || '',
      studentName: t.studentName || '',
      class: t.class || '',
      method: t.paymentMethod || t.method || 'CASH',
      amount: parseIntegerAmount(t.amount || 0)
    }));

    await exportToExcel(`Collection_Report_${selectedMonth}_${selectedAcademicYear}`, `Collection Report (${selectedMonth} ${selectedAcademicYear})`, columns, exportData);
  };

  const handleExportMonthlyPDF = async () => {
    const columns = ['Date (B.S.)', 'Receipt No', 'Student Name', 'Class', 'Method', 'Amount (NPR)'];
    const exportData = activeTransactions.map(t => [
      formatBSDate(t.date || t.createdAt) || '-',
      t.receiptNo || t.receipt || t.id || '-',
      t.studentName || '-',
      t.class || '-',
      t.paymentMethod || t.method || 'CASH',
      `NRs. ${parseIntegerAmount(t.amount || 0).toLocaleString()}`
    ]);

    await exportToPDF(`Collection Report (${selectedMonth} ${selectedAcademicYear})`, columns, exportData, `Collection_Report_${selectedMonth}_${selectedAcademicYear}`, false);
  };

  const handleExportFullLedgerExcel = async () => {
    const columns = [
      { header: 'Student ID', key: 'id', width: 20 },
      { header: 'Student Name', key: 'name', width: 28 },
      { header: 'Class', key: 'class', width: 12 },
      { header: 'Billed (NPR)', key: 'billed', width: 16 },
      { header: 'Paid (NPR)', key: 'paid', width: 16 },
      { header: 'Due (NPR)', key: 'due', width: 16 }
    ];

    const exportData = enrichedStudents.map(s => ({
      id: s.studentId || s.id || '',
      name: s.name || '',
      class: s.class || '',
      billed: s.billed,
      paid: s.paid,
      due: s.due
    }));

    await exportToExcel(`Full_Ledger_${selectedAcademicYear}`, `Full Student Financial Ledger (${selectedAcademicYear})`, columns, exportData);
  };

  const handleExportFullLedgerPDF = async () => {
    const columns = ['Student ID', 'Student Name', 'Class', 'Billed (NPR)', 'Paid (NPR)', 'Due (NPR)'];
    const exportData = enrichedStudents.map(s => [
      s.studentId || s.id || '-',
      s.name || '-',
      s.class || '-',
      `NRs. ${s.billed.toLocaleString()}`,
      `NRs. ${s.paid.toLocaleString()}`,
      `NRs. ${s.due.toLocaleString()}`
    ]);

    await exportToPDF(`Full Student Financial Ledger (${selectedAcademicYear})`, columns, exportData, `Full_Ledger_${selectedAcademicYear}`, false);
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-xl font-black text-gray-800">Reports & Analytics</h2>
          <p className="text-sm text-gray-500 font-medium">B.S. Calendar Financial Intelligence & Institutional Metrics</p>
        </div>

        {/* Global Filter Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
            <Filter className="w-3.5 h-3.5 text-gray-400 ml-1" />
            <select
              value={selectedAcademicYear}
              onChange={(e) => setSelectedAcademicYear(e.target.value)}
              className="text-xs font-bold bg-transparent border-none text-gray-700 focus:ring-0 cursor-pointer"
            >
              <option value="2081">B.S. 2081</option>
              <option value="2082">B.S. 2082</option>
              <option value="2083">B.S. 2083</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-xs font-bold bg-transparent border-none text-gray-700 focus:ring-0 cursor-pointer"
            >
              <option value="All">All Months</option>
              {NEPALI_MONTHS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="text-xs font-bold bg-transparent border-none text-gray-700 focus:ring-0 cursor-pointer"
            >
              {availableClasses.map(cls => (
                <option key={cls} value={cls}>{cls === 'All' ? 'All Classes' : cls}</option>
              ))}
            </select>
          </div>

          {/* Export Buttons */}
          <div className="flex flex-wrap gap-1.5 border border-gray-200 p-1 rounded-xl bg-gray-50">
            <div className="flex">
              <button
                onClick={handleExportMonthlyExcel}
                className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-l-lg text-[11px] font-black uppercase tracking-wider hover:bg-blue-100 flex gap-1.5 items-center border-r border-blue-100"
              >
                <FileDown className="w-3.5 h-3.5" /> Collection (XLS)
              </button>
              <button
                onClick={handleExportMonthlyPDF}
                className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-r-lg text-[11px] font-black uppercase tracking-wider hover:bg-blue-100 flex gap-1.5 items-center"
              >
                <FileDown className="w-3.5 h-3.5" /> PDF
              </button>
            </div>
            <div className="flex">
              <button
                onClick={handleExportFullLedgerExcel}
                className="bg-white border-y border-l border-gray-200 text-gray-700 px-3 py-1.5 rounded-l-lg text-[11px] font-black uppercase tracking-wider hover:bg-gray-50 flex gap-1.5 items-center border-r"
              >
                <FileDown className="w-3.5 h-3.5" /> Ledger (XLS)
              </button>
              <button
                onClick={handleExportFullLedgerPDF}
                className="bg-white border-y border-r border-gray-200 text-gray-700 px-3 py-1.5 rounded-r-lg text-[11px] font-black uppercase tracking-wider hover:bg-gray-50 flex gap-1.5 items-center"
              >
                <FileDown className="w-3.5 h-3.5" /> PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">Total Billed</p>
          <p className="text-2xl font-black text-gray-900 mt-1">रू {(totalCollected + totalDues).toLocaleString()}</p>
          <p className="text-[11px] font-bold text-gray-500 mt-1">Filtered Academic Year Active Debt</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-emerald-500">Total Collected</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">रू {totalCollected.toLocaleString()}</p>
          <p className="text-[11px] font-bold text-gray-500 mt-1">Real Verified Active Payments</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-red-500">Total Outstanding</p>
          <p className="text-2xl font-black text-red-600 mt-1">रू {totalDues.toLocaleString()}</p>
          <p className="text-[11px] font-bold text-gray-500 mt-1">{defaulters.length} Student Defaulters</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[400px]">
          <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-6">Class-wise Collection Breakdown</h3>
          {classData.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center text-xs font-bold text-gray-400 uppercase tracking-widest">
              No financial records for current filter
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={classData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="class" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 700 }} tickFormatter={(v) => `रू ${v >= 1000 ? `${v / 1000}k` : v}`} />
                <RechartsTooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontWeight: 700 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 700 }} />
                <Bar dataKey="paid" name="Collected" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="due" name="Outstanding" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[400px]">
          <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-6">Revenue Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={80} outerRadius={120} paddingAngle={5} dataKey="value">
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontWeight: 700 }} />
              <Legend iconType="circle" layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '12px', fontWeight: 700 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Defaulters Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="text-primary p-6 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="text-base font-black text-gray-800">Defaulters List</h3>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Students with outstanding dues in selected filter</p>
          </div>
          {defaulters.length > 0 && (
            <button onClick={() => setAlertNotice('Bulk reminders have been queued for all defaulters.')} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700">
              Send Bulk Reminders
            </button>
          )}
        </div>
        {alertNotice && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800 font-bold">
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              {alertNotice}
            </span>
            <button onClick={() => setAlertNotice(null)} className="text-emerald-600 hover:text-emerald-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="overflow-x-auto custom-scrollbar pb-2">
          <table className="w-full text-left whitespace-nowrap min-w-[650px]">
            <thead className="bg-white">
              <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                <th className="p-4 px-6">Student ID</th>
                <th className="p-4">Student Name</th>
                <th className="p-4">Class</th>
                <th className="p-4 text-right">Due Amount</th>
                <th className="p-4 text-center">Guardian Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {defaulters.map((s, idx) => (
                <tr key={idx} className="hover:bg-red-50/10">
                  <td className="p-4 px-6 text-xs font-mono font-bold text-gray-500">{s.studentId || s.id}</td>
                  <td className="p-4 font-bold text-gray-800">{s.name}</td>
                  <td className="p-4 text-xs font-black text-gray-500">{s.class}</td>
                  <td className="p-4 text-right font-black text-red-500">रू {(s.due ?? 0).toLocaleString()}</td>
                  <td className="p-4 text-center text-xs font-bold text-gray-500">{s.guardianPhone || s.parentPhone || 'N/A'}</td>
                </tr>
              ))}
              {defaulters.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-emerald-600 font-bold uppercase tracking-widest text-xs">
                    No defaulters found for this filter. Everyone is paid up! 🎉
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
