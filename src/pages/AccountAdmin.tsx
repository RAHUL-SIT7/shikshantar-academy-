import React, { useState, useEffect } from 'react';
import { CreditCard, Wallet, TrendingUp, AlertTriangle, Users, BookOpen, Clock, LogOut, GraduationCap, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { formatBSDate, formatBSDateYMD } from '../lib/nepaliDate';

import SimpleStudentLedgerTab from '../components/fee_management/SimpleStudentLedgerTab';
import FeeStructure from './FeeStructure';
import ReportsAnalyticsTab from '../components/fee_management/ReportsAnalyticsTab';
import StudentLedgerDetailTab from '../components/fee_management/StudentLedgerDetailTab';
import RemitBillsGeneratorTab from '../components/fee_management/RemitBillsGeneratorTab';
import TransactionHistoryTab from '../components/fee_management/TransactionHistoryTab';

export default function AccountAdmin() {
  const [activeTab, setActiveTab] = useState(() => {
    const role = localStorage.getItem('userRole') || 'teacher';
    return role === 'bill_generator' ? 'remit_bills_generator' : (role === 'admin' ? 'fee_structure' : 'simple_ledger');
  });
  const [ledgerFilterStatus, setLedgerFilterStatus] = useState('All');
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [userRole, setUserRole] = useState('teacher'); // Default restrictive
  const [targetStudentId, setTargetStudentId] = useState<string | undefined>(undefined);
  const [prefillPayment, setPrefillPayment] = useState<any>(null);

  
  const [loading, setLoading] = useState(true);
  const [studentsData, setStudentsData] = useState<any[]>([]);
  const [transactionsData, setTransactionsData] = useState<any[]>([]);
  const [cashEntriesData, setCashEntriesData] = useState<any[]>([]);
  const [feeStructures, setFeeStructures] = useState<any[]>([]);

  const [stats, setStats] = useState({
     collectedThisMonth: 0,
     totalOutstanding: 0,
     defaultersCount: 0,
     collectedThisYear: 0,
     collectionRate: 85,
     expectedThisMonth: 0,
     todayIncome: 0,
     todayExpense: 0,
     todayNetCash: 0,
     todayDateBS: formatBSDate(new Date()),
  });

  const fetchFeeData = () => { /* No-op, updates automatically */ };

  useEffect(() => {
     const role = localStorage.getItem('userRole') || 'teacher';
     setUserRole(role);

     let unsubSettings: any;
     let unsubStudents: any;
     let unsubTx: any;
     let unsubFees: any;
     let unsubCash: any;

     const unsubAuth = onAuthStateChanged(auth, (user) => {
         if (unsubSettings) unsubSettings();
         if (unsubStudents) unsubStudents();
         if (unsubTx) unsubTx();
         if (unsubFees) unsubFees();
         if (unsubCash) unsubCash();
         if (user) {
             setLoading(true);
             
             let currentStructs: any[] = [];
             let currentSettings: any = { academicYear: '2083' };
             let currentStudents: any[] = [];
             let currentTx: any[] = [];
             let currentFees: any[] = [];
             let currentCashEntries: any[] = [];

             const updateData = () => {
                 setFeeStructures(currentStructs);
                 setTransactionsData(currentTx);
                 setCashEntriesData(currentCashEntries);

                 const mergedStudents = currentStudents.map(s => {
                     const studentFees = currentFees.filter(f => f.studentId === s.id);
                     const struct = currentStructs.find((st: any) => st.className === s.class);
                     let baseFee = (s.monthlyFee !== undefined && s.monthlyFee !== null && s.monthlyFee !== "") ? Number(s.monthlyFee) : (struct?.tuition ? Number(String(struct.tuition).replace(/[^0-9.]/g, '')) : 1000);
                     const originalTuition = baseFee;
                     
                     if (s.scholarshipStatus === 'Provided' && s.scholarshipAmount) {
                         baseFee = Math.max(0, baseFee - Number(s.scholarshipAmount));
                     }

                     let extractedRoll = s.rollNumber || s.rollNo || '';
                     if (!extractedRoll && s.studentId) {
                         const match = s.studentId.match(/^SA\d+([A-Z]*\d*)*$/i);
                         if (match) {
                             const numPart = s.studentId.replace(/^SA/i, '');
                             let clsStr = s.class || '';
                             if (numPart.startsWith(clsStr)) {
                                 extractedRoll = numPart.substring(clsStr.length);
                             } else if (numPart.startsWith('0' + clsStr)) {
                                 extractedRoll = numPart.substring(clsStr.length + 1);
                             } else {
                                 extractedRoll = numPart;
                             }
                         } else {
                             extractedRoll = s.studentId;
                         }
                     }

                     return {
                         id: s.id,
                         studentId: s.studentId,
                         rollNumber: extractedRoll,
                         name: s.fullName || s.name,
                         class: s.class,
                         monthlyFee: baseFee,
                         originalTuition: originalTuition,
                         scholarshipStatus: s.scholarshipStatus,
                         scholarshipAmount: s.scholarshipAmount,
                         examFee: (s.examFee !== undefined && s.examFee !== null && s.examFee !== "") ? Number(s.examFee) : (struct?.exam ? Number(String(struct.exam).replace(/[^0-9.]/g, '')) : 0),
                         computerFee: (s.computerFee !== undefined && s.computerFee !== null && s.computerFee !== "") ? Number(s.computerFee) : (struct?.computer ? Number(String(struct.computer).replace(/[^0-9.]/g, '')) : 0),
                         hasTransportation: s.hasTransportation || 'No',
                         transportRoute: s.transportRoute || '',
                         hasComputer: s.hasComputer || 'No',
                         transportFee: Number(s.transportFee || 0),
                         otherFee: Number(s.otherFee || 0),
                         guardianName: s.guardianName || 'Unknown',
                         guardianPhone: s.parentPhone || s.phone || '',
                         createdAt: s.createdAt || null,
                         fees: studentFees // all fee records
                     };
                 });

                 setStudentsData(mergedStudents);

                 // Calculate stats
                 let outstanding = 0;
                 let collectedYear = 0;
                 
                 currentTx.forEach((tx: any) => {
                     if (tx.status === 'SUCCESS') collectedYear += Number(tx.amount || 0);
                 });

                 currentFees.forEach(f => {
                     if (f.status === 'due') outstanding += Number(f.dueAmount || 0);
                 });
                 
                 const defaulterIds = new Set(currentFees.filter(f => f.status === 'due').map(f => f.studentId));
                 const defaulters = defaulterIds.size;

                 const expectedTotal = collectedYear + outstanding;
                 const rate = expectedTotal > 0 ? Math.round((collectedYear / expectedTotal) * 100) : 0;

                 // Calculate Today's Inflow, Outflow, and Net Cash
                 const todayBS = formatBSDateYMD(new Date());
                 let todayFeeIncome = 0;
                 currentTx.forEach((tx: any) => {
                     let txDate = tx.date || '';
                     if (!txDate && tx.createdAt) {
                         try {
                             txDate = formatBSDateYMD(tx.createdAt.seconds ? tx.createdAt.seconds * 1000 : tx.createdAt);
                         } catch(e) {}
                     }
                     if (tx.status === 'SUCCESS' && (txDate === todayBS || txDate.startsWith(todayBS))) {
                         todayFeeIncome += Number(tx.amount || 0);
                     }
                 });

                 let todayManualIncome = 0;
                 let todayExpense = 0;
                 currentCashEntries.forEach((entry: any) => {
                     let eDate = entry.date || '';
                     if (!eDate && entry.timestamp) {
                         try {
                             eDate = formatBSDateYMD(entry.timestamp.seconds ? entry.timestamp.seconds * 1000 : entry.timestamp);
                         } catch(e) {}
                     }
                     if (eDate === todayBS || eDate.startsWith(todayBS)) {
                         if (entry.type === 'Income' && entry.category !== 'Fee Collection') {
                             todayManualIncome += Number(entry.amount || 0);
                         } else if (entry.type === 'Expense') {
                             todayExpense += Number(entry.amount || 0);
                         }
                     }
                 });

                 const todayTotalIncome = todayFeeIncome + todayManualIncome;
                 const todayNetCash = todayTotalIncome - todayExpense;

                 let lastCollectionDate = 'N/A';
                 const sortedTx = [...currentTx].sort((a: any, b: any) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
                 if (sortedTx.length > 0) {
                     lastCollectionDate = (sortedTx[0] as any).date || 'N/A';
                 }

                 setStats(prev => ({
                     ...prev,
                     academicYear: currentSettings.academicYear,
                     collectedThisMonth: 0,
                     totalOutstanding: outstanding,
                     defaultersCount: defaulters,
                     collectedThisYear: collectedYear,
                     collectionRate: Math.min(rate, 100),
                     expectedThisMonth: 0,
                     lastCollectionDate,
                     todayIncome: todayTotalIncome,
                     todayExpense: todayExpense,
                     todayNetCash: todayNetCash,
                     todayDateBS: formatBSDate(new Date())
                 }));

                 setLoading(false);
             };
             
             unsubSettings = onSnapshot(doc(db, 'settings', 'fee_structure'), (docSnap) => {
                 currentStructs = docSnap.exists() ? (docSnap.data().academic || []) : [];
                 currentSettings.academicYear = docSnap.exists() ? (docSnap.data().academicYear || '2083') : '2083';
                 updateData();
             }, (err) => { console.error('Error fetching settings:', err); });

             unsubStudents = onSnapshot(query(collection(db, 'users'), where('role', '==', 'student')), (snap) => {
                 currentStudents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                 updateData();
             }, (err) => { console.error('Error fetching students:', err); });

             unsubTx = onSnapshot(collection(db, 'transactions'), (snap) => {
                 currentTx = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                 updateData();
             }, (err) => { console.error('Error fetching transactions:', err); });

             unsubFees = onSnapshot(collection(db, 'studentFees'), (snap) => {
                 currentFees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                 updateData();
             }, (err) => { console.error('Error fetching fees:', err); });

             unsubCash = onSnapshot(collection(db, 'cash_ledger'), (snap) => {
                 currentCashEntries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                 updateData();
             }, (err) => { console.error('Error fetching cash ledger:', err); });
         } else {
             setLoading(false);
             if (unsubSettings) unsubSettings();
             if (unsubStudents) unsubStudents();
             if (unsubTx) unsubTx();
             if (unsubFees) unsubFees();
             if (unsubCash) unsubCash();
         }
     });

     return () => {
         unsubAuth();
         if (unsubSettings) unsubSettings();
         if (unsubStudents) unsubStudents();
         if (unsubTx) unsubTx();
         if (unsubFees) unsubFees();
         if (unsubCash) unsubCash();
     };
  }, []);

  const ALL_TABS = [
     { id: 'fee_structure', label: 'Fee Structure & Scholarships', roles: ['admin'] },
     { id: 'remit_bills_generator', label: 'Remit Bills Generator', roles: ['admin', 'bill_generator'] },
     { id: 'simple_ledger', label: 'Cash Collection Counter', roles: ['admin'] },
     { id: 'student_laser', label: 'Student Ledger Details', roles: ['admin'] },
     { id: 'transaction_history', label: 'Daily Register & Undo Log', roles: ['admin'] },
     { id: 'reports', label: 'Collection Summary', roles: ['admin'] },
  ];

  const TABS = ALL_TABS.filter(t => t.roles.includes(userRole));

  const scholarshipCount = studentsData.filter(s => s.scholarshipStatus === 'Provided').length;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
          <div>
             <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight uppercase">Fee Management</h1>
             <p className="text-sm font-medium text-gray-500 mt-1 uppercase tracking-widest">Financial Overview • Academic Year {(stats as any).academicYear || '2083'}</p>
          </div>
          <div className="bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 px-4 py-2 rounded-xl shadow-xs border border-emerald-200/80 dark:border-emerald-800/50 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></div>
              <span className="text-xs font-bold uppercase tracking-wide">Auto-Invoice Active</span>
          </div>
      </div>


      
      {/* Modern Bento Grid Summary */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 animate-in fade-in zoom-in-95 duration-700 mb-8">
        {/* Main large collection card - Daily Net Cash Collection */}
        <div className="md:col-span-8 lg:col-span-5 bg-gradient-to-br from-[#1a2b4c] to-[#111d33] rounded-[2rem] p-7 text-white relative overflow-hidden flex flex-col justify-between shadow-xl shadow-blue-900/10 min-h-[260px]">
           <div className="absolute top-0 right-0 p-6 opacity-15 pointer-events-none">
               <TrendingUp className="w-32 h-32" />
           </div>
           
           <div className="relative z-10">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-blue-200 uppercase tracking-widest">Today's Net Collection</span>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-white/10 text-emerald-300">
                    Daily Net
                  </span>
                </div>
                <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
              </div>

              <div className="text-4xl md:text-5xl font-black tracking-tight text-white mt-1">
                NRs. {stats.todayNetCash.toLocaleString()}
              </div>

              {/* Inflow vs Outflow side-by-side */}
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/10 text-xs">
                <div className="flex items-center gap-1.5">
                  <ArrowDownRight className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <span className="text-blue-300 text-[10px] font-bold block uppercase">Today's Inflow</span>
                    <span className="font-black text-emerald-300">NRs. {stats.todayIncome.toLocaleString()}</span>
                  </div>
                </div>
                <div className="h-6 w-px bg-white/15"></div>
                <div className="flex items-center gap-1.5">
                  <ArrowUpRight className="w-4 h-4 text-rose-400 shrink-0" />
                  <div>
                    <span className="text-blue-300 text-[10px] font-bold block uppercase">Today's Expense</span>
                    <span className="font-black text-rose-300">NRs. {stats.todayExpense.toLocaleString()}</span>
                  </div>
                </div>
              </div>
           </div>
           
           <div className="relative z-10 mt-5 flex flex-col gap-2 pt-2 border-t border-white/10">
              <div className="flex justify-between items-center text-xs font-semibold text-blue-200">
                <span>Yearly Collected: <strong className="text-white font-black">NRs. {stats.collectedThisYear.toLocaleString()}</strong></span>
                <span className="text-[11px] font-black px-2 py-0.5 rounded bg-blue-500/20 text-blue-200">
                  Rate: {stats.collectionRate}%
                </span>
              </div>
              <div className="w-full bg-blue-950/80 rounded-full h-2 overflow-hidden">
                 <div className="bg-gradient-to-r from-blue-400 to-emerald-400 h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${stats.collectionRate}%` }}></div>
              </div>
              <p className="text-[10px] text-blue-300/90 font-medium">Date: {stats.todayDateBS}</p>
           </div>
        </div>

        {/* Middle Stack cards */}
        <div className="md:col-span-4 lg:col-span-3 flex flex-col gap-5">
            <div className="bg-red-50 rounded-[2rem] p-7 flex-1 flex flex-col justify-center border border-red-100 relative overflow-hidden group hover:bg-red-100/80 transition-colors shadow-sm">
                 <div className="absolute -right-4 -top-4 w-28 h-28 bg-red-200/50 rounded-full group-hover:scale-110 transition-transform duration-500"></div>
                 <AlertTriangle className="w-8 h-8 text-red-500 mb-4 inline-block relative z-10" />
                 <p className="text-xs font-bold text-red-600 uppercase tracking-widest relative z-10">Total Outstanding</p>
                 <p className="text-3xl font-black text-gray-900 mt-1 relative z-10 tracking-tight">NRs. {stats.totalOutstanding.toLocaleString()}</p>
            </div>
            
            <div 
               className="bg-orange-50 rounded-[2rem] p-7 flex-1 flex items-center justify-between border border-orange-100 cursor-pointer hover:bg-orange-100/80 transition-colors shadow-sm relative overflow-hidden group"
               onClick={() => setActiveTab('simple_ledger')}
            >
               <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-orange-200/50 rounded-full group-hover:scale-110 transition-transform duration-500"></div>
               <div className="relative z-10">
                  <p className="text-xs font-bold text-orange-600 uppercase tracking-widest">Defaulters</p>
                  <p className="text-3xl font-black text-gray-900 mt-1 tracking-tight">{stats.defaultersCount}</p>
               </div>
               <Users className="w-10 h-10 text-orange-400 relative z-10" />
            </div>
        </div>

        {/* Right side scholarship cards */}
        <div className="md:col-span-12 lg:col-span-4 grid grid-cols-2 lg:flex lg:flex-col gap-5">
            <div className="bg-white rounded-[2rem] p-7 flex-1 flex flex-col justify-center border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                 <div className="absolute bottom-0 right-0 w-32 h-32 bg-purple-50 rounded-tl-full opacity-50 group-hover:scale-110 transition-transform duration-500"></div>
                 <GraduationCap className="w-8 h-8 text-purple-500 mb-4 relative z-10" />
                 <p className="text-xs font-bold text-gray-400 uppercase tracking-widest relative z-10">Scholarships Active</p>
                 <p className="text-2xl md:text-3xl font-black text-gray-900 mt-1 relative z-10">{scholarshipCount} <span className="text-lg text-gray-400 font-bold">Students</span></p>
            </div>
            
            <div className="bg-white rounded-[2rem] p-7 flex-1 flex flex-col justify-center border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                 <div className="absolute bottom-0 right-0 w-32 h-32 bg-blue-50 rounded-tl-full opacity-50 group-hover:scale-110 transition-transform duration-500"></div>
                 <Wallet className="w-8 h-8 text-blue-500 mb-4 relative z-10" />
                 <p className="text-xs font-bold text-gray-400 uppercase tracking-widest relative z-10">Monthly Waiver Total</p>
                 <p className="text-2xl md:text-3xl font-black text-gray-900 mt-1 relative z-10">NRs. {studentsData.reduce((acc, s) => acc + (s.scholarshipStatus === 'Provided' ? Number(s.scholarshipAmount||0) : 0), 0).toLocaleString()}</p>
            </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="overflow-x-auto custom-scrollbar mb-8 pb-2">
         <div className="flex gap-2 min-w-max bg-gray-100/60 p-2 rounded-2xl border border-gray-200">
            {TABS.map(tab => (
               <button 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 py-4 text-xs md:text-sm font-black uppercase tracking-widest transition-all rounded-xl focus:outline-none flex-1 text-center whitespace-nowrap shrink-0 ${ 
                      activeTab === tab.id 
                        ? 'bg-white text-[var(--primary)] shadow-sm border-b-2 border-[var(--primary)]' 
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50' 
                  }`}
               >
                  {tab.label}
               </button>
            ))}
         </div>
      </div>

      {/* Active Tab Content */}
      <div className="min-h-[500px]">
         {loading ? (
             <div className="space-y-4">
               <div className="w-full h-12 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center px-4">
                 <div className="w-1/4 h-6 bg-gray-200 rounded animate-pulse"></div>
               </div>
               <div className="w-full bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-100">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="p-4 flex gap-4 items-center">
                       <div className="w-12 h-12 bg-gray-200 rounded-lg animate-pulse"></div>
                       <div className="flex-1 space-y-2">
                          <div className="w-1/4 h-4 bg-gray-200 rounded animate-pulse"></div>
                          <div className="w-1/3 h-3 bg-gray-100 rounded animate-pulse"></div>
                       </div>
                       <div className="w-32 h-8 bg-gray-200 rounded-full animate-pulse"></div>
                    </div>
                  ))}
               </div>
             </div>
         ) : (
             <>
                 <div className={activeTab === 'simple_ledger' ? 'block' : 'hidden'}>
                   <SimpleStudentLedgerTab 
                      students={studentsData} 
                      transactions={transactionsData} 
                      onRefresh={fetchFeeData} 
                      prefillPayment={prefillPayment}
                      onPrefillClear={() => setPrefillPayment(null)}
                    />
                 </div>

                 {activeTab === 'student_laser' && (
                     <div className="mt-4">
                        <StudentLedgerDetailTab students={studentsData} transactions={transactionsData} onRefresh={fetchFeeData} />
                     </div>
                 )}

                 {activeTab === 'fee_structure' && (
                     <div className="-mt-8">
                       <FeeStructure />
                     </div>
                 )}


                  {activeTab === 'transaction_history' && (
                      <div className="mt-4">
                         <TransactionHistoryTab 
                            transactionsData={transactionsData} 
                            studentsData={studentsData} 
                            onRefresh={fetchFeeData} 
                         />
                      </div>
                  )}
                 
                 {activeTab === 'reports' && <ReportsAnalyticsTab students={studentsData} transactions={transactionsData} />}

                 {activeTab === 'remit_bills_generator' && (
                     <RemitBillsGeneratorTab 
                        students={studentsData} 
                        onRefresh={fetchFeeData} 
                        onCollectGuardianCash={(prefill) => {
                          setPrefillPayment(prefill);
                          setActiveTab('simple_ledger');
                        }}
                      />
                 )}
             </>
         )}
      </div>

    </div>
  );
}
