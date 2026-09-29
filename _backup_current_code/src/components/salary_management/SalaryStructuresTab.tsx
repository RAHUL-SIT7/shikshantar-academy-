import React, { useState } from 'react';
import { db } from '../../firebase';
import { doc, setDoc } from 'firebase/firestore';

export default function SalaryStructuresTab({ teachers, structures }: { teachers: any[], structures: any[] }) {
    const [selectedTeacher, setSelectedTeacher] = useState<string>('');
    const [basicPay, setBasicPay] = useState('');
    const [dearness, setDearness] = useState('');
    const [transport, setTransport] = useState('');
    const [houseRent, setHouseRent] = useState('');
    const [other, setOther] = useState('');
    const [incentiveUnits, setIncentiveUnits] = useState('');
    const [unitRate, setUnitRate] = useState('1500');

    const [status, setStatus] = useState<string | null>(null);

    const handleSelect = (e: any) => {
        const tid = e.target.value;
        setSelectedTeacher(tid);
        setStatus(null);
        const st = structures.find(s => s.id === tid);
        if (st) {
            setBasicPay(st.basicPay || '');
            setDearness(st.dearness || '');
            setTransport(st.transport || '');
            setHouseRent(st.houseRent || '');
            setOther(st.other || '');
            setIncentiveUnits(st.incentiveUnits !== undefined ? st.incentiveUnits : '');
            setUnitRate(st.unitRate !== undefined ? st.unitRate : '1500');
        } else {
            setBasicPay(''); setDearness(''); setTransport(''); setHouseRent(''); setOther('');
            setIncentiveUnits(''); setUnitRate('1500');
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!selectedTeacher) {
            setStatus("Please select a teacher first.");
            return;
        }
        setStatus("Saving...");
        
        const dataToSave = {
            basicPay: Math.max(0, Number(basicPay||0)),
            dearness: Math.max(0, Number(dearness||0)),
            transport: Math.max(0, Number(transport||0)),
            houseRent: Math.max(0, Number(houseRent||0)),
            other: Math.max(0, Number(other||0)),
            incentiveUnits: Math.max(0, Number(incentiveUnits||0)),
            unitRate: Math.max(0, Number(unitRate||1500)),
            updatedAt: new Date().toISOString()
        };

        // Dual write: Save to localStorage for instant preview sync across roles
        try {
            const localStructures = JSON.parse(localStorage.getItem('local_salary_structures') || '{}');
            localStructures[selectedTeacher] = { id: selectedTeacher, ...dataToSave };
            localStorage.setItem('local_salary_structures', JSON.stringify(localStructures));
        } catch (e) {
            console.error("Local storage error:", e);
        }

        try {
            await setDoc(doc(db, 'salary_structures', selectedTeacher), dataToSave);
            setStatus("Saved structure successfully!");
            setTimeout(() => setStatus(null), 3000);
        } catch (error: any) {
            console.error("Error saving salary structure:", error);
            const isPreviewMode = !!new URLSearchParams(window.location.search).get('previewRole');
            if (isPreviewMode) {
                setStatus("Saved structure successfully! (Simulated locally for preview mode)");
                setTimeout(() => setStatus(null), 3000);
            } else {
                if (error.code === 'permission-denied' || String(error.message).includes('permissions')) {
                   setStatus("Failed to save: You do not have true admin permissions in the database.");
                } else {
                   setStatus("Failed to save: " + error.message);
                }
            }
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-2xl">
            <h2 className="text-lg font-bold mb-6 text-primary">Assign Salary Structure</h2>
            <form onSubmit={handleSave} className="space-y-4">
                <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">Select Teacher</label>
                   <select value={selectedTeacher} onChange={handleSelect} className="w-full mt-1 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-primary">
                       <option value="">-- Select Teacher --</option>
                       {teachers.map(t => <option key={t.id} value={t.id}>{t.fullName || t.name}</option>)}
                   </select>
                </div>
                {selectedTeacher && (
                    <>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                           <label className="text-xs font-bold text-gray-500 uppercase">Basic Pay (NRS)</label>
                           <input type="number" min="0" value={basicPay} onChange={e=>setBasicPay(e.target.value)} className="w-full mt-1 p-3 rounded-xl border border-gray-200" required />
                        </div>
                        <div>
                           <label className="text-xs font-bold text-gray-500 uppercase">Dearness Allowance</label>
                           <input type="number" min="0" value={dearness} onChange={e=>setDearness(e.target.value)} className="w-full mt-1 p-3 rounded-xl border border-gray-200" />
                        </div>
                        <div>
                           <label className="text-xs font-bold text-gray-500 uppercase">Transport Allowance</label>
                           <input type="number" min="0" value={transport} onChange={e=>setTransport(e.target.value)} className="w-full mt-1 p-3 rounded-xl border border-gray-200" />
                        </div>
                        <div>
                           <label className="text-xs font-bold text-gray-500 uppercase">House Rent Allowance</label>
                           <input type="number" min="0" value={houseRent} onChange={e=>setHouseRent(e.target.value)} className="w-full mt-1 p-3 rounded-xl border border-gray-200" />
                        </div>
                        <div>
                           <label className="text-xs font-bold text-gray-500 uppercase">Other Allowances</label>
                           <input type="number" min="0" value={other} onChange={e=>setOther(e.target.value)} className="w-full mt-1 p-3 rounded-xl border border-gray-200" />
                        </div>
                        <div>
                           <label className="text-xs font-bold text-gray-500 uppercase">Incentive Units (Grade Steps)</label>
                           <input type="number" min="0" placeholder="e.g. 2" value={incentiveUnits} onChange={e=>setIncentiveUnits(e.target.value)} className="w-full mt-1 p-3 rounded-xl border border-gray-200" />
                        </div>
                        <div>
                           <label className="text-xs font-bold text-gray-500 uppercase">Per-Unit Rate (NRS)</label>
                           <input type="number" min="0" placeholder="1500" value={unitRate} onChange={e=>setUnitRate(e.target.value)} className="w-full mt-1 p-3 rounded-xl border border-gray-200" />
                        </div>
                    </div>
                    {status && (
                        <div className={`p-3 rounded-lg text-sm font-bold ${status.includes('Failed') ? 'bg-red-50 text-red-600' : status.includes('Please') ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {status}
                        </div>
                    )}
                    <button className="w-full bg-primary text-white p-3 rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-blue-900 transition-colors">Save Structure</button>
                    </>
                )}
            </form>
            

            <div className="mt-8 border-t border-gray-100 pt-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-4">Existing Structures</h3>
                <div className="space-y-3">
                   {structures.map(s => {
                      const t = teachers.find(tx => tx.id === s.id);
                      if(!t) return null;
                      const total = (s.basicPay||0) + (s.dearness||0) + (s.transport||0) + (s.houseRent||0) + (s.other||0) + ((s.incentiveUnits||0) * (s.unitRate||1500));
                      return (
                         <div key={s.id} className="p-4 border rounded-xl border-gray-100 text-sm flex justify-between items-center cursor-pointer hover:bg-gray-50" onClick={() => handleSelect({target:{value: s.id}})}>
                            <div>
                               <p className="font-bold text-gray-800">{t.fullName || t.name}</p>
                               {s.incentiveUnits > 0 && (
                                  <p className="text-[10px] text-gray-400 font-medium">Incentives: {s.incentiveUnits} Units × NRs. {s.unitRate || 1500}/unit</p>
                               )}
                            </div>
                            <p className="font-black text-emerald-600">Total: NRs. {(total || 0).toLocaleString()}</p>
                         </div>
                      );
                   })}
                </div>
            </div>
        </div>
    )
}
