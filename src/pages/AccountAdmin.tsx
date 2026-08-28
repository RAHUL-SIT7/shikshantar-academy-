import React, { useState, useEffect } from 'react';
import { CreditCard, Wallet, TrendingUp, AlertTriangle, Users, BookOpen, Clock, LogOut, GraduationCap } from 'lucide-react';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';

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
  const [feeStructures, setFeeStructures] = useState<any[]>([]);

  const [stats, setStats] = useState({
     collectedThisMonth: 0,
     totalOutstanding: 0,
     defaultersCount: 0,
     collectedThisYear: 0,
     collectionRate: 85,
     expectedThisMonth: 0,
  });

  const fetchFeeData = () => { /* No-op, updates automatically */ };

  useEffect(() => {
     const role = localStorage.getItem('userRole') || 'teacher';
     setUserRole(role);

     let unsubSettings: any;
     let unsubStudents: any;
     let unsubTx: any;
     let unsubFees: any;

     const unsubAuth = onAuthStateChanged(auth, (user) => {
         if (unsubSettings) unsubSettings();
         if (unsubStudents) unsubStudents();
         if (unsubTx) unsubTx();
         if (unsubFees) unsubFees();
         if (user) {
             setLoading(true);
             
             let currentStructs: any[] = [];
             let currentSettings: any = { academicYear: '2083' };
             let currentStudents: any[] = [];
             let currentTx: any[] = [];
             let currentFees: any[] = [];

             const updateData = () => {
                 setFeeStructures(currentStructs);
                 setTransactionsData(currentTx);

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
                     if (tx.status === 'SUCCESS') collectedYear += tx.amount;
                 });

                 currentFees.forEach(f => {
                     if (f.status === 'due') outstanding += Number(f.dueAmount || 0);
                 });
                 
                 const defaulterIds = new Set(currentFees.filter(f => f.status === 'due').map(f => f.studentId));
                 const defaulters = defaulterIds.size;

                 const expectedTotal = collectedYear + outstanding;
                 const rate = expectedTotal > 0 ? Math.round((collectedYear / expectedTotal) * 100) : 0;

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
                     lastCollectionDate
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
         } else {
             setLoading(false);
             if (unsubSettings) unsubSettings();
             if (unsubStudents) unsubStudents();
             if (unsubTx) unsubTx();
             if (unsubFees) unsubFees();
         }
     });

     return () => {
         unsubAuth();
         if (unsubSettings) unsubSettings();
         if (unsubStudents) unsubStudents();
         if (unsubTx) unsubTx();
         if (unsubFees) unsubFees();
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
          <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full shadow-sm border border-emerald-100 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs font-black uppercase tracking-widest">Auto-Invoice Active</span>
          </div>
      </div>


      
      {/* Modern Bento Grid Summary */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 animate-in fade-in zoom-in-95 duration-700 mb-8">
        {/* Main large collection card */}
        <div className="md:col-span-8 lg:col-span-5 bg-gradient-to-br from-[#1a2b4c] to-[#111d33] rounded-[2rem] p-8 text-white relative overflow-hidden flex flex-col justify-between shadow-xl shadow-blue-900/10">
           <div className="absolute top-0 right-0 p-6 opacity-20">
               <TrendingUp className="w-32 h-32" />
           </div>
           <div className="relative z-10">
              <p className="text-sm font-bold text-blue-200 uppercase tracking-widest mb-2">Collected This Year</p>
              <div className="text-4xl md:text-5xl font-black tracking-tight mb-2">NRs. {stats.collectedThisYear.toLocaleString()}</div>
              <p className="text-xs font-medium text-blue-300">Updated {(stats as any).lastCollectionDate || 'N/A'}</p>
           </div>
           
           <div className="relative z-10 mt-10 flex flex-col gap-3">
              <div className="flex justify-between items-end">
                <span className="text-sm text-blue-100 font-bold uppercase tracking-wider">Collection Rate</span>
                <span className="text-3xl font-black">{stats.collectionRate}%</span>
              </div>
              <div className="w-full bg-blue-900/60 rounded-full h-2.5 overflow-hidden">
                 <div className="bg-blue-400 h-full rounded-full relative transition-all duration-1000 ease-out" style={{ width: `${stats.collectionRate}%` }}>
                    <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-r from-transparent to-white/30 rounded-full"></div>
                 </div>
              </div>
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
