import React, { useState, useEffect } from 'react';
import { Wallet, Search, Filter, TrendingUp, AlertTriangle, Check, X, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where, doc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import SalaryStructuresTab from '../components/salary_management/SalaryStructuresTab';
import ProcessSalaryTab from '../components/salary_management/ProcessSalaryTab';

export default function SalaryAdmin() {
  const [activeTab, setActiveTab] = useState('structures');
  const [teachers, setTeachers] = useState<any[]>([]);
  const [salaryRecords, setSalaryRecords] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  const [salaryRequests, setSalaryRequests] = useState<any[]>([]);

  useEffect(() => {
    let unsubs: any[] = [];
    const unsubAuth = onAuthStateChanged(auth, (user) => {
       unsubs.forEach(u => u());
       unsubs = [];
       if (user) {
         const qT = query(collection(db, 'users'), where('role', '==', 'teacher'));
         
         const unsubTeachers = onSnapshot(qT, (snap) => {
            setTeachers(snap.docs.map(d => ({id: d.id, ...d.data()})));
         }, (err) => console.log('Could not load teachers', err));
         
         const unsubStructures = onSnapshot(collection(db, 'salary_structures'), (snap) => {
            const dbStructs = snap.docs.map(d => ({id: d.id, ...d.data()}));
             try {
                const localStructs = JSON.parse(localStorage.getItem('local_salary_structures') || '{}');
                const mergedMap = { ...localStructs };
                dbStructs.forEach(s => {
                    mergedMap[s.id] = s;
                });
                setStructures(Object.values(mergedMap));
             } catch(e) {
                setStructures(dbStructs);
             }
         }, (err) => console.log('Could not load salary structures', err));
         
         const unsubRecords = onSnapshot(collection(db, 'salary_records'), (snap) => {
            const dbRecs = snap.docs.map(d => ({id: d.id, ...d.data()}));
             try {
                const localRecs = JSON.parse(localStorage.getItem('local_salary_records') || '[]');
                const mergedMap: Record<string, any> = {};
                localRecs.forEach((r: any) => {
                    mergedMap[r.id] = r;
                });
                dbRecs.forEach(r => {
                    mergedMap[r.id] = r;
                });
                setSalaryRecords(Object.values(mergedMap));
             } catch(e) {
                setSalaryRecords(dbRecs);
             }
         }, (err) => console.log('Could not load salary records', err));

         const unsubRequests = onSnapshot(collection(db, 'salary_requests'), (snap) => {
            const dbReqs = snap.docs.map(d => ({id: d.id, ...d.data()}));
             try {
                const localReqs = JSON.parse(localStorage.getItem('local_salary_requests') || '[]');
                const mergedMap: Record<string, any> = {};
                localReqs.forEach((r: any) => {
                    mergedMap[r.id] = r;
                });
                dbReqs.forEach(r => {
                    mergedMap[r.id] = r;
                });
                setSalaryRequests(Object.values(mergedMap).sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt)));
             } catch(e) {
                setSalaryRequests(dbReqs.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt)));
             }
         }, (err) => console.log('Could not load salary requests', err));
         
         unsubs = [unsubTeachers, unsubStructures, unsubRecords, unsubRequests];
       }
    });
    return () => { unsubAuth(); unsubs.forEach(u => u()); };
  }, []);

  const handleApproveRequest = async (req: any) => {
      try {
          const teacherId = req.teacherId;
          const currentStruct = structures.find(s => s.id === teacherId) || {
              basicPay: 0,
              dearness: 0,
              transport: 0,
              houseRent: 0,
              other: 0,
              incentiveUnits: 0,
              unitRate: 1500
          };

          const updatedStruct = { ...currentStruct };
          delete updatedStruct.id; // clear doc id

          if (req.type === 'incentive_units') {
              updatedStruct.incentiveUnits = (currentStruct.incentiveUnits || 0) + Number(req.value);
              if (updatedStruct.unitRate === undefined) {
                  updatedStruct.unitRate = 1500;
              }
          } else if (req.type === 'basic_pay') {
              updatedStruct.basicPay = (currentStruct.basicPay || 0) + Number(req.value);
          } else if (req.type === 'allowance') {
              updatedStruct.other = (currentStruct.other || 0) + Number(req.value);
          }
          updatedStruct.updatedAt = new Date().toISOString();

          // Save structure
          await setDoc(doc(db, 'salary_structures', teacherId), updatedStruct);
          
          // Save request
          await setDoc(doc(db, 'salary_requests', req.id), { ...req, status: 'Approved' });

          // Local updates
          try {
              const localStructs = JSON.parse(localStorage.getItem('local_salary_structures') || '{}');
              localStructs[teacherId] = { id: teacherId, ...updatedStruct };
              localStorage.setItem('local_salary_structures', JSON.stringify(localStructs));

              const localReqs = JSON.parse(localStorage.getItem('local_salary_requests') || '[]');
              const idx = localReqs.findIndex((r: any) => r.id === req.id);
              if (idx !== -1) {
                  localReqs[idx].status = 'Approved';
              } else {
                  localReqs.push({ ...req, status: 'Approved' });
              }
              localStorage.setItem('local_salary_requests', JSON.stringify(localReqs));
          } catch (e) {}

          alert(`Salary request approved! Teacher's salary structure has been updated.`);
      } catch (err: any) {
          console.error("Could not approve request:", err);
          alert(`Error approving request: ${err.message}`);
      }
  };

  const handleDeclineRequest = async (req: any) => {
      try {
          await setDoc(doc(db, 'salary_requests', req.id), { ...req, status: 'Declined' });

          try {
              const localReqs = JSON.parse(localStorage.getItem('local_salary_requests') || '[]');
              const idx = localReqs.findIndex((r: any) => r.id === req.id);
              if (idx !== -1) {
                  localReqs[idx].status = 'Declined';
              } else {
                  localReqs.push({ ...req, status: 'Declined' });
              }
              localStorage.setItem('local_salary_requests', JSON.stringify(localReqs));
          } catch (e) {}

          alert(`Request declined successfully.`);
      } catch (err: any) {
          console.error("Could not decline request:", err);
          alert(`Error: ${err.message}`);
      }
  };

  // Compute stats
  const totalPayout = salaryRecords.filter(r => r.status === 'Paid').reduce((acc, curr) => acc + (curr.netPay || 0), 0);
  const pendingCount = salaryRequests.filter(r => r.status === 'Pending').length;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-10">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-primary tracking-tight uppercase">Salary Management</h1>
      </div>
      
      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <p className="text-xs text-gray-500 font-medium">Total Teachers</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{teachers.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <p className="text-xs text-gray-500 font-medium">Total Salaries Paid</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-600">NRs. {totalPayout.toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <p className="text-xs text-gray-500 font-medium">Pending Hike Requests</p>
          </div>
          <div>
            <p className={`text-2xl font-bold ${pendingCount > 0 ? 'text-amber-500' : 'text-gray-400'}`}>{pendingCount}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto custom-scrollbar border-b border-gray-200">
         <div className="flex gap-6 min-w-max">
            {[
               { id: 'structures', label: 'Structures' },
               { id: 'process', label: 'Process Salary' },
               { id: 'requests', label: `Hike Requests ${pendingCount > 0 ? `(${pendingCount})` : ''}` }
            ].map(tab => (
               <button 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-4 px-2 text-sm font-black uppercase tracking-widest transition-all border-b-2 flex items-center gap-2 ${ activeTab === tab.id ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-gray-400 hover:border-gray-200' }`}
               >
                  {tab.label}
                  {tab.id === 'requests' && pendingCount > 0 && (
                      <span className="bg-amber-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold animate-pulse">
                          {pendingCount}
                      </span>
                  )}
               </button>
            ))}
         </div>
      </div>

      <div className="min-h-[500px]">
          {activeTab === 'structures' && <SalaryStructuresTab teachers={teachers} structures={structures} />}
          {activeTab === 'process' && <ProcessSalaryTab teachers={teachers} structures={structures} records={salaryRecords} />}
          {activeTab === 'requests' && (
              <div className="space-y-6 max-w-4xl">
                  <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                      <h2 className="text-lg font-bold mb-2 text-primary">Hike & Allowance Requests</h2>
                      <p className="text-xs text-gray-400 font-medium">Review, approve, or decline custom salary and unit additions submitted by the class teachers.</p>
                      
                      {salaryRequests.length === 0 ? (
                          <div className="text-center py-12 text-gray-500">
                              <p className="font-bold text-sm">All caught up!</p>
                              <p className="text-xs mt-1 text-gray-400">No teacher salary addition requests have been submitted yet.</p>
                          </div>
                      ) : (
                          <div className="space-y-4 mt-6">
                              {salaryRequests.map(req => {
                                  const t = teachers.find(tx => tx.id === req.teacherId);
                                  const currentStruct = structures.find(s => s.id === req.teacherId);
                                  
                                  return (
                                      <div key={req.id} className="p-5 border border-gray-100 rounded-xl bg-gray-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-gray-200">
                                          <div className="space-y-1 max-w-xl">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                  <span className="font-bold text-gray-800 text-sm">{req.teacherName}</span>
                                                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${
                                                      req.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                                                      req.status === 'Declined' ? 'bg-rose-100 text-rose-700' :
                                                      'bg-amber-100 text-amber-700'
                                                  }`}>
                                                      {req.status}
                                                  </span>
                                              </div>
                                              
                                              <div className="text-xs font-semibold text-primary">
                                                  Requested Addition: {req.type === 'incentive_units' ? `${req.value} Incentive Units` : `NRs. ${req.value.toLocaleString()}`} ({req.type === 'incentive_units' ? 'Grade Units' : req.type === 'basic_pay' ? 'Basic Pay' : 'Allowance'})
                                              </div>

                                              {currentStruct && (
                                                  <p className="text-[10px] text-gray-400 font-medium">
                                                      Current Pay: NRs. {currentStruct.basicPay?.toLocaleString()} | Incentives: {currentStruct.incentiveUnits || 0} Units (@ NRs. {currentStruct.unitRate || 1500})
                                                  </p>
                                              )}

                                              {req.justification && (
                                                  <p className="text-xs text-gray-600 bg-white border border-gray-100 p-3 rounded-lg italic mt-2">
                                                      "{req.justification}"
                                                  </p>
                                              )}
                                              
                                              <p className="text-[9px] text-gray-400 font-semibold">{new Date(req.createdAt).toLocaleString()}</p>
                                          </div>

                                          {req.status === 'Pending' && (
                                              <div className="flex items-center gap-2 shrink-0">
                                                  <button 
                                                      onClick={() => handleDeclineRequest(req)}
                                                      className="p-2.5 bg-white hover:bg-rose-50 border border-gray-200 text-rose-600 rounded-xl transition-colors font-bold uppercase tracking-widest text-[10px] flex items-center gap-1"
                                                  >
                                                      <X className="w-3.5 h-3.5"/> Decline
                                                  </button>
                                                  <button 
                                                      onClick={() => handleApproveRequest(req)}
                                                      className="p-2.5 bg-primary hover:bg-blue-900 text-white rounded-xl transition-colors font-bold uppercase tracking-widest text-[10px] flex items-center gap-1"
                                                  >
                                                      <Check className="w-3.5 h-3.5"/> Approve & Apply
                                                  </button>
                                              </div>
                                          )}
                                      </div>
                                  );
                              })}
                          </div>
                      )}
                  </div>
              </div>
          )}
      </div>
    </div>
  );
}
