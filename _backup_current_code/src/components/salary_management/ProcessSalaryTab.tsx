import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import NepaliDate from 'nepali-date-converter';

const NEPALI_MONTHS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];

export default function ProcessSalaryTab({ teachers, structures, records }: { teachers: any[], structures: any[], records: any[] }) {
    const todayBS = new NepaliDate();
    const currYear = todayBS.getYear();
    const [selectedMonth, setSelectedMonth] = useState(NEPALI_MONTHS[todayBS.getMonth()]);
    const [selectedYear, setSelectedYear] = useState(currYear.toString());
    
    const [selectedTeacher, setSelectedTeacher] = useState<string>('');
    const [tax, setTax] = useState('');
    const [absentDeduction, setAbsentDeduction] = useState('');
    const [loanRecovery, setLoanRecovery] = useState('');

    const currentStructure = structures.find(s => s.id === selectedTeacher);
    const grossPay = currentStructure ? (
        (currentStructure.basicPay||0) + 
        (currentStructure.dearness||0) + 
        (currentStructure.transport||0) + 
        (currentStructure.houseRent||0) + 
        (currentStructure.other||0) + 
        ((currentStructure.incentiveUnits||0) * (currentStructure.unitRate||1500))
    ) : 0;
    
    useEffect(() => {
        if (selectedTeacher && currentStructure) {
            // Private school rule in Nepal: 1% standard social security tax on gross pay by default
            const calculatedTax = Math.round(grossPay * 0.01);
            setTax(calculatedTax.toString());
        } else {
            setTax('');
        }
        setAbsentDeduction('');
        setLoanRecovery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTeacher]);

    const totDeductions = Math.max(0, Number(tax)||0) + Math.max(0, Number(absentDeduction)||0) + Math.max(0, Number(loanRecovery)||0);
    const netPay = Math.max(0, grossPay - totDeductions);

    const handleToggleStatus = async (recordId: string, currentStatus: string) => {
        const nextStatus = currentStatus === 'Paid' ? 'Unpaid' : 'Paid';
        try {
            const existingLocals = JSON.parse(localStorage.getItem('local_salary_records') || '[]');
            const idx = existingLocals.findIndex((r: any) => r.id === recordId);
            if (idx !== -1) {
                existingLocals[idx].status = nextStatus;
                localStorage.setItem('local_salary_records', JSON.stringify(existingLocals));
            }
        } catch (e) {}

        try {
            await updateDoc(doc(db, 'salary_records', recordId), {
                status: nextStatus
            });
        } catch(err: any) {
            const isPreviewMode = !!new URLSearchParams(window.location.search).get('previewRole');
            if (!isPreviewMode) {
                alert("Action failed: " + err.message);
            }
        }
    };

    const handlePay = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!selectedTeacher) return;
        
        const recId = `${selectedTeacher}_${selectedYear}_${selectedMonth}`;
        const existing = records.find(r => r.id === recId);
        if(existing) {
           if(!window.confirm("Salary already processed for this month. Overwrite?")) return;
        }

        const recordData = {
            teacherId: selectedTeacher,
            month: selectedMonth,
            year: selectedYear,
            date: new NepaliDate().format('YYYY-MM-DD'),
            grossPay,
            tax: Math.max(0, Number(tax||0)),
            absentDeduction: Math.max(0, Number(absentDeduction||0)),
            loanRecovery: Math.max(0, Number(loanRecovery||0)),
            totalDeductions: totDeductions,
            netPay,
            status: 'Paid',
            structureSnapshot: currentStructure
        };

        // Dual write: Save to localStorage for instant preview sync across roles
        try {
            const existingLocals = JSON.parse(localStorage.getItem('local_salary_records') || '[]');
            const filteredLocals = existingLocals.filter((r: any) => !(r.teacherId === selectedTeacher && r.year === selectedYear && r.month === selectedMonth));
            filteredLocals.push({ id: recId, ...recordData });
            localStorage.setItem('local_salary_records', JSON.stringify(filteredLocals));
        } catch (e) {
            console.error("Local storage error:", e);
        }

        try {
            await setDoc(doc(db, 'salary_records', recId), recordData);
            alert('Salary processed successfully!');
            setTax(''); setAbsentDeduction(''); setLoanRecovery('');
            setSelectedTeacher('');
        } catch (error: any) {
             console.error("Error saving salary record:", error);
             const isPreviewMode = !!new URLSearchParams(window.location.search).get('previewRole');
             if (isPreviewMode) {
                 alert('Salary processed successfully! (Simulated locally for preview mode)');
                 setTax(''); setAbsentDeduction(''); setLoanRecovery('');
                 setSelectedTeacher('');
             } else {
                 if (error.code === 'permission-denied' || String(error.message).includes('permissions')) {
                     alert("Failed to save: You do not have true admin permissions in the database.");
                 } else {
                     alert("Failed to save: " + error.message);
                 }
             }
        }
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
           <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold mb-4 text-primary">Process Salary</h2>
              
              <div className="flex gap-4 mb-6">
                 <div className="flex-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Year</label>
                    <select value={selectedYear} onChange={e=>setSelectedYear(e.target.value)} className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2 focus:ring-1 outline-none">
                       {[currYear-1, currYear, currYear+1].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                 </div>
                 <div className="flex-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Month</label>
                    <select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2 focus:ring-1 outline-none">
                       {NEPALI_MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                 </div>
              </div>

              <form onSubmit={handlePay} className="space-y-4">
                  <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">Select Teacher</label>
                   <select value={selectedTeacher} onChange={e=>setSelectedTeacher(e.target.value)} className="w-full mt-1 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary">
                       <option value="">-- Select Teacher --</option>
                       {teachers.map(t => <option key={t.id} value={t.id}>{t.fullName || t.name}</option>)}
                   </select>
                 </div>
                 {selectedTeacher && !currentStructure && (
                    <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm text-center">No salary structure found! Please set structure first.</div>
                 )}
                 {selectedTeacher && currentStructure && (
                     <>
                        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 mb-4">
                           <div className="flex justify-between text-sm mb-1"><span className="text-emerald-700">Gross Pay</span><span className="font-bold text-emerald-900">NRs. {(grossPay || 0).toLocaleString()}</span></div>
                        </div>

                        <div className="space-y-3">
                           <h3 className="text-xs font-black uppercase tracking-widest text-primary pt-2 border-t border-gray-100">Deductions</h3>
                           <div className="grid grid-cols-2 gap-4">
                              <div>
                                 <label className="text-xs font-bold text-gray-500">Tax</label>
                                 <input type="number" min="0" value={tax} onChange={e=>setTax(e.target.value)} className="w-full p-2 mt-1 border rounded-lg" />
                              </div>
                              <div>
                                 <label className="text-xs font-bold text-gray-500">Absent</label>
                                 <input type="number" min="0" value={absentDeduction} onChange={e=>setAbsentDeduction(e.target.value)} className="w-full p-2 mt-1 border rounded-lg" />
                              </div>
                              <div>
                                 <label className="text-xs font-bold text-gray-500">Loan Recovery</label>
                                 <input type="number" min="0" value={loanRecovery} onChange={e=>setLoanRecovery(e.target.value)} className="w-full p-2 mt-1 border rounded-lg" />
                              </div>
                           </div>
                        </div>

                        <div className="bg-primary text-white rounded-xl p-5 mt-4 flex items-center justify-between">
                            <span className="font-bold text-sm uppercase tracking-widest">Net Payable</span>
                            <span className="text-2xl font-black">NRs. {(netPay || 0).toLocaleString()}</span>
                        </div>

                        <button type="submit" className="w-full bg-[#1e293b] text-white p-4 rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-black transition-colors mt-2">
                            Mark as Paid
                        </button>
                     </>
                 )}
              </form>
           </div>
           
           <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-h-[600px] overflow-y-auto custom-scrollbar">
              <h2 className="text-md font-black text-gray-800 uppercase tracking-widest mb-4">Processed This Month</h2>
              <div className="space-y-3">
                 {(() => {
                     const monthlyRecords = records.filter(r => r.year === selectedYear && r.month === selectedMonth);
                     if(monthlyRecords.length === 0) return <p className="text-xs text-gray-400">No records found for {selectedMonth} {selectedYear}.</p>;
                     
                     return monthlyRecords.map(r => {
                        const t = teachers.find(tx => tx.id === r.teacherId);
                        return (
                           <div key={r.id} className="p-3 border border-gray-100 rounded-lg flex flex-col gap-3 text-sm">
                              <div className="flex justify-between items-center">
                                 <div>
                                    <p className="font-bold text-gray-800">{t?.fullName || t?.name || r.teacherName || 'Deleted Teacher'}</p>
                                    <p className="text-xs text-gray-400">{r.date}</p>
                                 </div>
                                 <div className="text-right">
                                    <p className="font-black flex flex-col items-end">
                                       <span className="text-emerald-600">NRs. {(r.netPay ?? 0).toLocaleString()}</span>
                                       <span className={`text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full mt-1 ${r.status === 'Unpaid' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>{r.status || 'Paid'}</span>
                                    </p>
                                 </div>
                              </div>
                              <div className="flex gap-2">
                                 <button onClick={() => handleToggleStatus(r.id, r.status || 'Paid')} className="w-full text-xs font-bold text-gray-500 hover:text-gray-900 border border-gray-200 rounded py-1.5 hover:bg-gray-50 transition-colors">
                                     MARK AS {r.status === 'Unpaid' ? 'PAID' : 'UNPAID'}
                                 </button>
                                 <button onClick={async () => { 
                                      if(window.confirm('Are you sure you want to delete this salary record?')) { 
                                          try {
                                              const existingLocals = JSON.parse(localStorage.getItem('local_salary_records') || '[]');
                                              const filtered = existingLocals.filter((item: any) => item.id !== r.id);
                                              localStorage.setItem('local_salary_records', JSON.stringify(filtered));
                                          } catch(e){}
                                          try { 
                                              const mod = await import('firebase/firestore'); 
                                              await mod.deleteDoc(mod.doc(db, 'salary_records', r.id)); 
                                          } catch(e){} 
                                      } 
                                  }} className="text-xs font-bold text-red-500 hover:text-red-700 border border-red-200 rounded px-3 py-1.5 hover:bg-red-50 transition-colors">
                                    DELETE
                                 </button>
                              </div>
                           </div>
                        );
                     });
                 })()}
              </div>
           </div>
        </div>
    )
}
