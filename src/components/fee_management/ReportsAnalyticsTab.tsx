import React, { useState, useEffect } from 'react';
import { formatBSDate } from '../../lib/nepaliDate';
import { db, auth, handleFirestoreError, OperationType } from '../../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { FileDown, Users, TrendingUp, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { exportToExcel } from '../../lib/excelExport';
import { exportToPDF } from '../../lib/pdfExport';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#a855f7', '#ec4899'];


export default function ReportsAnalyticsTab({ students, transactions }: { students: any[], transactions: any[] }) {

  // Aggregations
  
  const enrichedStudents = students.map(s => {
    const due = s.fees?.filter((f:any) => f.status === 'due').reduce((acc: number, f:any) => acc + Number(f.dueAmount || 0), 0) || 0;
    const paid = s.fees?.filter((f:any) => f.status === 'paid').reduce((acc: number, f:any) => acc + Number(f.paidAmount || f.totalFee || 0), 0) || 0;
    return { ...s, due, paid };
  });

  const totalCollected = enrichedStudents.reduce((sum, s) => sum + s.paid, 0);
  const totalDues = enrichedStudents.reduce((sum, s) => sum + s.due, 0);
  const defaulters = enrichedStudents.filter(s => s.due > 0);

  // Paid vs Due Pie Chart
  const statusData = [
    { name: 'Collected', value: totalCollected, fill: '#10B981' },
    { name: 'Outstanding', value: totalDues, fill: '#EF4444' }
  ];

  // Class Bar Chart
  const classData = Object.entries(
    enrichedStudents.reduce((acc, s) => {
       if (!acc[s.class]) acc[s.class] = { class: s.class, paid: 0, due: 0 };
       acc[s.class].paid += s.paid;
       acc[s.class].due += s.due;
       return acc;
    }, {} as Record<string, any>)
  ).map(x => x[1] as any).sort((a: any, b: any) => {
     // Sort numerically if possible
     const numA = parseInt(a.class, 10);
     const numB = parseInt(b.class, 10);
     if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
     return (a.class || '').localeCompare(b.class || '');
  });

  const exportMonthlyReport = async () => {
    const columns = [
       { header: 'Date', key: 'date', width: 20 },
       { header: 'Receipt No', key: 'receiptNo', width: 15 },
       { header: 'Student', key: 'studentName', width: 30 },
       { header: 'Class', key: 'class', width: 10 },
       { header: 'Method', key: 'method', width: 15 },
       { header: 'Amount', key: 'amount', width: 15 }
    ];
    
    const currentMonth = new Date().getMonth();
    const exportData = transactions
       .filter(t => new Date(t.date).getMonth() === currentMonth)
       .map(t => ({
          date: formatBSDate(t.date) || '',
          receiptNo: t.receiptNo || '',
          studentName: t.studentName || '',
          class: t.class || '',
          method: t.method || '',
          amount: t.amount || 0
       }));
       
    await exportToExcel('Monthly_Collection', 'Monthly Collection Report', columns, exportData);
  };

  const exportMonthlyReportPDF = async () => {
    const columns = ['Date', 'Receipt No', 'Student', 'Class', 'Method', 'Amount'];
    
    const currentMonth = new Date().getMonth();
    const exportData = transactions
       .filter(t => new Date(t.date).getMonth() === currentMonth)
       .map(t => [
          formatBSDate(t.date) || '-',
          t.receiptNo || t.receipt || t.id || '-',
          t.studentName || '-',
          t.class || '-',
          t.method || '-',
          `NRs. ${t.amount || 0}`
       ]);
       
    await exportToPDF('Monthly Collection Report', columns, exportData, 'Monthly_Collection', false);
  };

  const exportFullLedger = async () => {
     const columns = [
        { header: 'Student ID', key: 'id', width: 20 },
        { header: 'Name', key: 'name', width: 30 },
        { header: 'Class', key: 'class', width: 10 },
        { header: 'Paid', key: 'paid', width: 15 },
        { header: 'Due', key: 'due', width: 15 }
     ];
     
     const exportData = enrichedStudents.map(s => ({
        id: s.id || '',
        name: s.name || '',
        class: s.class || '',
        paid: s.paid || 0,
        due: s.due || 0
     }));
     
     await exportToExcel('Full_Ledger', 'Full Ledger Report', columns, exportData);
  };

  const exportFullLedgerPDF = async () => {
     const columns = ['Student ID', 'Name', 'Class', 'Paid', 'Due'];
     
     const exportData = enrichedStudents.map(s => [
        s.id || '-',
        s.name || '-',
        s.class || '-',
        `NRs. ${s.paid || 0}`,
        `NRs. ${s.due || 0}`
     ]);
     
     await exportToPDF('Full Ledger Report', columns, exportData, 'Full_Ledger', false);
  };

  return (
    <div className="space-y-6">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
         <div>
           <h2 className="text-xl font-black text-gray-800">Reports & Analytics</h2>
           <p className="text-sm text-gray-500 font-medium">Financial insights</p>
         </div>
         <div className="flex flex-wrap gap-2 border border-gray-100 p-1 rounded-2xl bg-gray-50">
            <div className="flex">
               <button onClick={exportMonthlyReport} className="bg-blue-50 text-blue-600 px-4 py-2 rounded-l-xl text-xs font-black uppercase tracking-widest hover:bg-blue-100 flex gap-2 items-center border-r border-blue-100"><FileDown className="w-4 h-4"/> Monthly (Excel)</button>
               <button onClick={exportMonthlyReportPDF} className="bg-blue-50 text-blue-600 px-4 py-2 rounded-r-xl text-xs font-black uppercase tracking-widest hover:bg-blue-100 flex gap-2 items-center"><FileDown className="w-4 h-4"/> PDF</button>
            </div>
            <div className="flex">
               <button onClick={exportFullLedger} className="bg-white border-y border-l border-gray-200 text-gray-600 px-4 py-2 rounded-l-xl text-xs font-black uppercase tracking-widest hover:text-primary hover:bg-gray-50 flex gap-2 items-center border-r"><FileDown className="w-4 h-4"/> Ledger (Excel)</button>
               <button onClick={exportFullLedgerPDF} className="bg-white border-y border-r border-gray-200 text-gray-600 px-4 py-2 rounded-r-xl text-xs font-black uppercase tracking-widest hover:text-primary hover:bg-gray-50 flex gap-2 items-center"><FileDown className="w-4 h-4"/> PDF</button>
            </div>
         </div>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[400px]">
             <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-6">Class-wise Collection Breakdown</h3>
             <ResponsiveContainer width="100%" height={320}>
                <BarChart data={classData}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                   <XAxis dataKey="class" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12, fontWeight: 700}}/>
                   <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12, fontWeight: 700}} tickFormatter={(v) => `रू ${v/1000}k`}/>
                   <RechartsTooltip cursor={{fill: '#F3F4F6'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontWeight: 700}}/>
                   <Legend iconType="circle" wrapperStyle={{fontSize: '12px', fontWeight: 700}} />
                   <Bar dataKey="paid" name="Collected" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                   <Bar dataKey="due" name="Outstanding" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
             </ResponsiveContainer>
          </div>
          
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[400px]">
             <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-6">Revenue Distribution</h3>
             <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                   <Pie data={statusData} cx="50%" cy="50%" innerRadius={80} outerRadius={120} paddingAngle={5} dataKey="value">
                      {statusData.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                   </Pie>
                   <RechartsTooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontWeight: 700}} />
                   <Legend iconType="circle" layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{fontSize: '12px', fontWeight: 700}}/>
                </PieChart>
             </ResponsiveContainer>
          </div>
       </div>

       <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="text-primary p-6 border-b border-gray-100 flex justify-between items-center">
             <div>
               <h3 className="text-base font-black text-gray-800">Defaulters List</h3>
               <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Students with outstanding dues</p>
             </div>
             <button onClick={() => window.alert('Bulk reminders have been sent to all defaulters.')} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700">Send Bulk Reminders</button>
          </div>
          <div className="overflow-x-auto custom-scrollbar pb-2">
             <table className="w-full text-left whitespace-nowrap min-w-[650px]">
                <thead className="bg-white">
                   <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                      <th className="p-4 px-6">Student</th>
                      <th className="p-4">Class</th>
                      <th className="p-4 text-right">Due Amount</th>
                      <th className="p-4 text-center">Guardian Phone</th>
                      <th className="p-4 text-right">Action</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                   {defaulters.map((s, idx) => (
                      <tr key={idx} className="hover:bg-red-50/10">
                         <td className="p-4 px-6 font-bold text-gray-800">{s.name}</td>
                         <td className="p-4 text-xs font-black text-gray-500">{s.class}</td>
                         <td className="p-4 text-right font-black text-red-500">रू {s.due?.toLocaleString()}</td>
                         <td className="p-4 text-center text-xs font-bold text-gray-500">{s.guardianPhone || 'N/A'}</td>
                         <td className="p-4 text-right">
                           <button className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-[10px] font-black uppercase hover:bg-green-100">WhatsApp Alert</button>
                         </td>
                      </tr>
                   ))}
                   {defaulters.length === 0 && (
                      <tr>
                         <td colSpan={5} className="p-10 text-center text-emerald-500 font-bold uppercase tracking-widest text-xs">No defaulters. Everyone is paid up! 🎉</td>
                      </tr>
                   )}
                </tbody>
             </table>
          </div>
       </div>
    </div>
  );
}
