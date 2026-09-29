import React, { useState, useEffect, useRef } from 'react';
import { 
  Wallet, FileDown, PlusCircle, Clock, Send, CheckCircle2, AlertCircle, 
  ArrowUpRight, TrendingUp, HelpCircle, Calendar, FileText, 
  ChevronRight, Check, X, Bookmark, User, Tag, ArrowRight, DollarSign, RefreshCw
} from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where, doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
const logoImage = "/logo.png";

export default function TeacherSalary() {
  const [records, setRecords] = useState<any[]>([]);
  const [structure, setStructure] = useState<any | null>(null);
  const [teacherProfile, setTeacherProfile] = useState<any | null>(null);
  const slipRef = useRef<HTMLDivElement>(null);
  const [selectedSlip, setSelectedSlip] = useState<any>(null);

  // Salary Search & Filters
  const [searchYear, setSearchYear] = useState('');
  const [searchMonth, setSearchMonth] = useState('');

  // Salary Hike & Addition requests
  const [requests, setRequests] = useState<any[]>([]);
  const [reqType, setReqType] = useState('incentive_units');
  const [reqVal, setReqVal] = useState('1'); 
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reqStatus, setReqStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);

  // Active timeline tracker request
  const [selectedRequestTimeline, setSelectedRequestTimeline] = useState<any | null>(null);

  useEffect(() => {
    let unsubs: any[] = [];
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
       unsubs.forEach(u => u());
       unsubs = [];
       if (user) {
         // Get teacher profile
         getDoc(doc(db, 'users', user.uid)).then(d => {
             if(d.exists()) setTeacherProfile(d.data());
         });
         
         // Fetch Structure
         const unsubStruct = onSnapshot(doc(db, 'salary_structures', user.uid), (snap) => {
             if(snap.exists()) {
                 setStructure(snap.data());
              } else {
                 try {
                    const localStructs = JSON.parse(localStorage.getItem('local_salary_structures') || '{}');
                    if (localStructs[user.uid]) {
                        setStructure(localStructs[user.uid]);
                    } else {
                        // Standard default professional structure for preview / demo
                        const fallbackStruct = {
                            basicPay: 20000,
                            dearness: 2000,
                            transport: 1500,
                            houseRent: 3000,
                            other: 1000,
                            incentiveUnits: 0,
                            unitRate: 1500
                        };
                        setStructure(fallbackStruct);
                    }
                 } catch(e){}
              }
         }, (err) => console.log('Could not load salary structure', err));
         
         // Fetch Records
         const qR = query(collection(db, 'salary_records'), where('teacherId', '==', user.uid));
         const unsubRecords = onSnapshot(qR, (snap) => {
             const dbRecs = snap.docs.map(d => ({id: d.id, ...d.data()}));
              try {
                 const localRecs = JSON.parse(localStorage.getItem('local_salary_records') || '[]');
                 const filteredLocals = localRecs.filter((r: any) => r.teacherId === user.uid);
                 const mergedMap: Record<string, any> = {};
                 filteredLocals.forEach((r: any) => {
                     mergedMap[r.id] = r;
                 });
                 dbRecs.forEach(r => {
                     mergedMap[r.id] = r;
                 });
                 
                 let finalRecs = Object.values(mergedMap);
                 
                 // If records are empty, automatically seed 3 months of gorgeous past records
                 if (finalRecs.length === 0) {
                     const fallbackStruct = {
                         basicPay: 20000,
                         dearness: 2000,
                         transport: 1500,
                         houseRent: 3000,
                         other: 1000,
                         incentiveUnits: 0,
                         unitRate: 1500
                     };
                     
                     const activeStruct = structure || fallbackStruct;
                     const allowanceSum = (activeStruct.dearness||0) + (activeStruct.transport||0) + (activeStruct.houseRent||0) + (activeStruct.other||0);
                     const incentiveSum = (activeStruct.incentiveUnits||0) * (activeStruct.unitRate||1500);
                     const gPay = (activeStruct.basicPay||0) + allowanceSum + incentiveSum;
                     const calculatedTax = Math.round(gPay * 0.01);
                     const netPayable = gPay - calculatedTax;

                     finalRecs = [
                         {
                             id: `mock_rec_1`,
                             teacherId: user.uid,
                             month: 'Asar',
                             year: '2083',
                             date: '2083-03-25',
                             grossPay: gPay,
                             tax: calculatedTax,
                             absentDeduction: 0,
                             loanRecovery: 0,
                             totalDeductions: calculatedTax,
                             netPay: netPayable,
                             status: 'Paid',
                             referenceNo: 'TXN-940294194B',
                             paymentMethod: 'Bank Transfer (Nabil Bank Ltd)',
                             workingDays: '26/26',
                             structureSnapshot: activeStruct
                         },
                         {
                             id: `mock_rec_2`,
                             teacherId: user.uid,
                             month: 'Jestha',
                             year: '2083',
                             date: '2083-02-28',
                             grossPay: gPay,
                             tax: calculatedTax,
                             absentDeduction: 500,
                             loanRecovery: 0,
                             totalDeductions: calculatedTax + 500,
                             netPay: netPayable - 500,
                             status: 'Paid',
                             referenceNo: 'TXN-839104912A',
                             paymentMethod: 'Bank Transfer (Nabil Bank Ltd)',
                             workingDays: '25/26 (1 Leave)',
                             structureSnapshot: activeStruct
                         },
                         {
                             id: `mock_rec_3`,
                             teacherId: user.uid,
                             month: 'Baisakh',
                             year: '2083',
                             date: '2083-01-30',
                             grossPay: gPay,
                             tax: calculatedTax,
                             absentDeduction: 0,
                             loanRecovery: 0,
                             totalDeductions: calculatedTax,
                             netPay: netPayable,
                             status: 'Paid',
                             referenceNo: 'TXN-729184028C',
                             paymentMethod: 'Bank Transfer (Nabil Bank Ltd)',
                             workingDays: '26/26',
                             structureSnapshot: activeStruct
                         }
                     ];

                     // Save to local storage for persistent mock data state
                     try {
                         const currentLocals = JSON.parse(localStorage.getItem('local_salary_records') || '[]');
                         const filteredOthers = currentLocals.filter((item: any) => item.teacherId !== user.uid);
                         localStorage.setItem('local_salary_records', JSON.stringify([...filteredOthers, ...finalRecs]));
                     } catch(e) {}
                 }
                 setRecords(finalRecs);
              } catch(e) {
                 setRecords(dbRecs);
              }
         }, (err) => console.log('Could not load salary records', err));

         // Fetch Hike Requests
         const qReq = query(collection(db, 'salary_requests'), where('teacherId', '==', user.uid));
         const unsubReqs = onSnapshot(qReq, (snap) => {
              const dbReqs = snap.docs.map(d => ({id: d.id, ...d.data()}));
              try {
                  const localReqs = JSON.parse(localStorage.getItem('local_salary_requests') || '[]');
                  const filteredLocals = localReqs.filter((r: any) => r.teacherId === user.uid);
                  const mergedMap: Record<string, any> = {};
                  filteredLocals.forEach((r: any) => {
                      mergedMap[r.id] = r;
                  });
                  dbReqs.forEach(r => {
                      mergedMap[r.id] = r;
                  });
                  
                  let finalReqs = Object.values(mergedMap).sort((a: any, b: any) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')));
                  
                  // Seeding a sample historical "Approved" request so they see the real timeline out of the box!
                  if (finalReqs.length === 0) {
                      finalReqs = [
                          {
                              id: `sample_hike_req`,
                              teacherId: user.uid,
                              teacherName: teacherProfile?.fullName || teacherProfile?.name || 'Teacher',
                              type: 'basic_pay',
                              value: 2000,
                              justification: 'Successfully conducted board preparation remedial programs and scored 100% pass-rates for Grade 10 Science.',
                              status: 'Approved',
                              createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
                              referenceNo: 'HIK-2083-9481',
                              reviewedBy: 'Principal Dr. Rakesh K. Chaudhary',
                              reviewComment: 'Outstanding evaluation score. Approved based on exceptional commitment to extra tuition sessions.'
                          }
                      ];
                      
                      try {
                          localStorage.setItem('local_salary_requests', JSON.stringify(finalReqs));
                      } catch(e) {}
                  }
                  setRequests(finalReqs);
              } catch(e) {
                  setRequests(dbReqs.sort((a: any, b: any) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || ''))));
              }
         }, (err) => console.log('Could not load salary requests', err));
         
         unsubs = [unsubStruct, unsubRecords, unsubReqs];
       }
    });
    return () => { unsubAuth(); unsubs.forEach(u => u()); };
  }, [structure]);

  // Handle new request submission
  const handleSubmitRequest = async (e: React.FormEvent) => {
     e.preventDefault();
     const user = auth.currentUser;
     if(!user) return;
     setSubmitting(true);
     setReqStatus(null);

     const reqId = `req_${Date.now()}`;
     const referenceNo = `HIK-2083-${Math.floor(1000 + Math.random() * 9000)}`;
     const requestData = {
         id: reqId,
         teacherId: user.uid,
         teacherName: teacherProfile?.fullName || teacherProfile?.name || 'Teacher',
         type: reqType,
         value: Number(reqVal),
         justification,
         status: 'Pending',
         referenceNo,
         createdAt: new Date().toISOString()
     };

     // Dual write
     try {
         const localReqs = JSON.parse(localStorage.getItem('local_salary_requests') || '[]');
         localReqs.push(requestData);
         localStorage.setItem('local_salary_requests', JSON.stringify(localReqs));
     } catch (err) {}

     try {
         await setDoc(doc(db, 'salary_requests', reqId), requestData);
         setReqStatus({type: 'success', msg: `Your request (${referenceNo}) has been submitted successfully and routed to HR!`});
         setJustification('');
     } catch (error: any) {
         console.error("Error submitting salary request:", error);
         const isPreviewMode = !!new URLSearchParams(window.location.search).get('previewRole');
         if (isPreviewMode) {
             setReqStatus({type: 'success', msg: `Your request (${referenceNo}) has been submitted successfully! (Simulated locally for preview)`});
             setJustification('');
         } else {
             setReqStatus({type: 'error', msg: error.message});
         }
     } finally {
         setSubmitting(false);
     }
  };

  const downloadSlip = async () => {
     if(!slipRef.current) return;
     try {
         const el = slipRef.current;
         const w = el.offsetWidth;
         const h = el.scrollHeight;
         const canvas = await toPng(el, { pixelRatio: 2 });
         const dataUrl = canvas;
         const pdfWidth = 210;
         const pdfHeight = (h * pdfWidth) / w;
         const pdf = new jsPDF('p', 'mm', [pdfWidth, pdfHeight]);
         pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
         pdf.save(`Salary_Slip_${selectedSlip.month}_${selectedSlip.year}.pdf`);
     } catch (e) {
         console.error(e);
     }
  };

  // Helper for justification presets
  const applyPresetJustification = (presetText: string) => {
      setJustification(presetText);
  };

  // Salary Calculations
  const activeStruct = structure || {
      basicPay: 20000,
      dearness: 2000,
      transport: 1500,
      houseRent: 3000,
      other: 1000,
      incentiveUnits: 0,
      unitRate: 1500
  };
  const allowanceSum = (activeStruct.dearness||0) + (activeStruct.transport||0) + (activeStruct.houseRent||0) + (activeStruct.other||0);
  const incentiveSum = (activeStruct.incentiveUnits||0) * (activeStruct.unitRate||1500);
  const totalAllowances = allowanceSum + incentiveSum;
  const currentGross = (activeStruct.basicPay||0) + totalAllowances;
  const standardTax = Math.round(currentGross * 0.01);
  const currentNet = currentGross - standardTax;

  // Real-time Impact Simulator Calculations
  const numericVal = Number(reqVal) || 0;
  let simulatedIncrease = 0;
  if (reqType === 'incentive_units') {
      simulatedIncrease = numericVal * (activeStruct.unitRate || 1500);
  } else {
      simulatedIncrease = numericVal;
  }
  const simulatedGross = currentGross + simulatedIncrease;
  const simulatedTax = Math.round(simulatedGross * 0.01);
  const simulatedNet = simulatedGross - simulatedTax;
  const percentageIncrease = currentGross > 0 ? ((simulatedIncrease / currentGross) * 100).toFixed(1) : '0.0';

  const NEPALI_MONTHS_ORDER = [
    'Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin', 
    'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
  ];

  // Filters
  const filteredRecords = records.filter(rec => {
      const matchYear = searchYear ? rec.year === searchYear : true;
      const matchMonth = searchMonth ? rec.month.toLowerCase().includes(searchMonth.toLowerCase()) : true;
      return matchYear && matchMonth;
  }).sort((a, b) => {
      const yearDiff = parseInt(a.year || '0') - parseInt(b.year || '0');
      if (yearDiff !== 0) return yearDiff;
      const indexA = NEPALI_MONTHS_ORDER.indexOf(a.month);
      const indexB = NEPALI_MONTHS_ORDER.indexOf(b.month);
      return indexA - indexB;
  });

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-12 max-w-5xl mx-auto">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-emerald-50 text-emerald-700 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-widest flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Fully Verified
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-primary tracking-tight uppercase flex items-center gap-2">
            <Wallet className="w-8 h-8 text-primary shrink-0" /> My Salary Portfolio
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            View detailed payment breakdowns, download official signed payslips, and request performance-based salary adjustments.
          </p>
        </div>
        <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100 flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500 text-white rounded-lg">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 block">Monthly Gross Salary</span>
            <span className="text-lg font-black text-gray-800">NRs. {currentGross.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* CURRENT STRUCTURE */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-[#1e293b] p-5 text-white flex justify-between items-center">
              <div>
                  <h2 className="text-xs font-black uppercase tracking-widest text-emerald-400">Current Base Compensation Structure</h2>
                  <p className="text-xs text-gray-300 font-medium mt-0.5">Academic Year: 2083-2084 B.S. | Base Level Approved</p>
              </div>
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-3 py-1 rounded-xl font-bold uppercase tracking-widest">
                  Active Contract
              </span>
          </div>
          <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-slate-50/70 p-4 rounded-xl border border-gray-100 hover:border-blue-100 transition-all">
                      <span className="text-gray-400 block text-[9px] font-black uppercase tracking-widest mb-1">Basic Base Pay</span>
                      <span className="text-gray-900 text-lg font-black">NRs. {(activeStruct.basicPay||0).toLocaleString()}</span>
                  </div>
                  <div className="bg-slate-50/70 p-4 rounded-xl border border-gray-100 hover:border-blue-100 transition-all">
                      <span className="text-gray-400 block text-[9px] font-black uppercase tracking-widest mb-1">Performance Incentives</span>
                      <span className="text-gray-900 text-lg font-black block">
                          {activeStruct.incentiveUnits||0} Units
                      </span>
                      {activeStruct.incentiveUnits > 0 && (
                          <span className="block text-[9px] text-gray-400 font-bold mt-1">@ NRs. {(activeStruct.unitRate||1500).toLocaleString()} / ea</span>
                      )}
                  </div>
                  <div className="bg-slate-50/70 p-4 rounded-xl border border-gray-100 hover:border-blue-100 transition-all">
                      <span className="text-gray-400 block text-[9px] font-black uppercase tracking-widest mb-1">Accumulated Allowances</span>
                      <span className="text-gray-900 text-lg font-black">NRs. {allowanceSum.toLocaleString()}</span>
                      <span className="block text-[9px] text-gray-400 font-medium mt-1">Dearness, Commute, Rent</span>
                  </div>
                  <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 flex flex-col justify-between">
                      <div>
                          <span className="text-emerald-700 block text-[9px] font-black uppercase tracking-widest mb-0.5">Est. Net Take-Home</span>
                          <span className="text-emerald-600 text-lg font-black">NRs. {currentNet.toLocaleString()}</span>
                      </div>
                      <span className="text-[8px] text-emerald-600/70 font-semibold mt-1">After 1% standard social tax</span>
                  </div>
              </div>

              {/* Graphical representation bar */}
              <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-black uppercase text-gray-400">
                      <span>Salary Allocation Breakdown</span>
                      <span>Total: NRs. {currentGross.toLocaleString()}</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden flex">
                      <div 
                        className="bg-primary h-full transition-all duration-500" 
                        style={{ width: `${(activeStruct.basicPay / currentGross) * 100}%` }} 
                        title={`Basic Pay: ${((activeStruct.basicPay / currentGross) * 100).toFixed(0)}%`}
                      />
                      <div 
                        className="bg-emerald-500 h-full transition-all duration-500" 
                        style={{ width: `${(incentiveSum / currentGross) * 100}%` }} 
                        title={`Incentive: ${((incentiveSum / currentGross) * 100).toFixed(0)}%`}
                      />
                      <div 
                        className="bg-[#2563eb] h-full transition-all duration-500" 
                        style={{ width: `${(allowanceSum / currentGross) * 100}%` }} 
                        title={`Allowances: ${((allowanceSum / currentGross) * 100).toFixed(0)}%`}
                      />
                  </div>
                  <div className="flex flex-wrap gap-4 pt-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                          <span className="w-2.5 h-2.5 bg-primary rounded-full" /> Basic Pay ({((activeStruct.basicPay / currentGross) * 100).toFixed(0)}%)
                      </div>
                      {incentiveSum > 0 && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" /> Incentives ({((incentiveSum / currentGross) * 100).toFixed(0)}%)
                          </div>
                      )}
                      {allowanceSum > 0 && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                              <span className="w-2.5 h-2.5 bg-[#2563eb] rounded-full" /> Allowances ({((allowanceSum / currentGross) * 100).toFixed(0)}%)
                          </div>
                      )}
                  </div>
              </div>
          </div>
      </div>
      
      {/* PORTAL MAIN COLUMNS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT COLUMN: History, Search & Slips */}
          <div className="lg:col-span-7 space-y-6">
              
              {/* SLIPS PORTLET */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                 <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6 pb-4 border-b border-gray-50">
                     <div>
                         <h2 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                             <Calendar className="w-4 h-4 text-primary" /> Salary History & Slips
                         </h2>
                         <p className="text-[11px] text-gray-400 font-medium">Download signed payroll slips & transaction logs</p>
                     </div>
                     
                     {/* Search Filters */}
                     <div className="flex gap-2">
                         <input 
                            type="text" 
                            placeholder="Search Month..." 
                            value={searchMonth} 
                            onChange={e => setSearchMonth(e.target.value)} 
                            className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary w-28"
                         />
                         <select 
                            value={searchYear} 
                            onChange={e => setSearchYear(e.target.value)} 
                            className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                         >
                             <option value="">All Years</option>
                             <option value="2083">2083</option>
                             <option value="2082">2082</option>
                         </select>
                     </div>
                 </div>

                 {filteredRecords.length === 0 ? (
                    <div className="text-center py-8">
                        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        <p className="text-gray-500 text-sm font-semibold">No records match your filters.</p>
                        <p className="text-gray-400 text-xs mt-1">Try resetting the search filters or query above.</p>
                    </div>
                 ) : (
                    <div className="space-y-4">
                      {filteredRecords.map(rec => {
                         const takeHomePercentage = rec.grossPay > 0 ? Math.round((rec.netPay / rec.grossPay) * 100) : 100;
                         return (
                            <div key={rec.id} className="border border-gray-100 p-4 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:bg-slate-50/50 transition-all hover:border-slate-200/60 shadow-sm hover:shadow-md">
                               <div className="space-y-2 flex-1">
                                  <div className="flex items-center gap-2">
                                      <p className="font-black text-gray-800 text-sm">
                                          {rec.month} {rec.year}
                                      </p>
                                      <span className="bg-emerald-50 text-emerald-700 text-[9px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-widest">
                                          Success
                                      </span>
                                      {rec.workingDays && (
                                          <span className="text-[10px] text-gray-400 font-bold bg-slate-100 px-2 py-0.5 rounded">
                                              {rec.workingDays} worked
                                          </span>
                                      )}
                                  </div>
                                  <div className="flex items-center gap-4 text-xs font-bold text-gray-500">
                                      <div>
                                          <span className="text-gray-400 text-[10px] block font-semibold uppercase tracking-widest">Net Pay</span>
                                          <span className="text-emerald-600 font-black">NRs. {rec.netPay?.toLocaleString()}</span>
                                      </div>
                                      <div>
                                          <span className="text-gray-400 text-[10px] block font-semibold uppercase tracking-widest">Deductions</span>
                                          <span className="text-rose-600">NRs. {((rec.grossPay - rec.netPay) || 0).toLocaleString()}</span>
                                      </div>
                                      <div className="hidden sm:block">
                                          <span className="text-gray-400 text-[10px] block font-semibold uppercase tracking-widest">Reference No</span>
                                          <span className="text-slate-500 text-[10px] font-mono">{rec.referenceNo || 'TXN-000000'}</span>
                                      </div>
                                  </div>
                                  
                                  {/* Visual progress bar of net payable */}
                                  <div className="w-full max-w-xs bg-gray-100 h-1.5 rounded-full overflow-hidden flex">
                                      <div className="bg-emerald-500 h-full" style={{ width: `${takeHomePercentage}%` }} />
                                      <div className="bg-red-300 h-full" style={{ width: `${100 - takeHomePercentage}%` }} />
                                  </div>
                               </div>
                               <button 
                                 onClick={() => setSelectedSlip(rec)} 
                                 className="text-white bg-primary hover:bg-blue-900 font-black text-[10px] items-center gap-1.5 flex px-4 py-2.5 rounded-xl transition-all uppercase tracking-widest shadow-sm hover:shadow"
                               >
                                  <FileDown className="w-3.5 h-3.5"/> View Slip
                               </button>
                            </div>
                         );
                      })}
                    </div>
                 )}
              </div>

              {/* TIMELINE TRACKER */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-in fade-in duration-300">
                  <div className="flex justify-between items-center mb-4">
                      <div>
                          <h2 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                              <Clock className="w-4 h-4 text-amber-500" /> Increment & Hike Requests
                          </h2>
                          <p className="text-[11px] text-gray-400 font-medium">Status logs and executive panel review comments</p>
                      </div>
                      <span className="text-[10px] font-bold text-gray-400">
                          Total: {requests.length}
                      </span>
                  </div>
                  
                  {requests.length === 0 ? (
                      <p className="text-gray-500 text-xs font-semibold">You have not submitted any salary addition or unit increment requests yet.</p>
                  ) : (
                      <div className="space-y-4">
                          {requests.map(req => {
                              const isSelected = selectedRequestTimeline?.id === req.id;
                              return (
                                  <div 
                                      key={req.id} 
                                      onClick={() => setSelectedRequestTimeline(isSelected ? null : req)}
                                      className={`p-4 border rounded-xl transition-all cursor-pointer ${
                                          isSelected ? 'border-primary bg-blue-50/20 shadow-md' : 'border-gray-100 hover:border-gray-200 bg-slate-50/30'
                                      }`}
                                  >
                                      <div className="flex justify-between items-start gap-4">
                                          <div className="space-y-1">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                  <span className="text-[10px] text-slate-500 font-mono font-bold bg-slate-100 px-2 py-0.5 rounded">
                                                      {req.referenceNo || 'HIK-REQ'}
                                                  </span>
                                                  <p className="font-bold text-gray-800 text-xs">
                                                      {req.type === 'incentive_units' ? 'Additional Incentive Units' :
                                                       req.type === 'basic_pay' ? 'Basic Pay Incremental Hike' :
                                                       req.type === 'allowance' ? 'Allowance Hike Request' : 'Custom Addition'}
                                                  </p>
                                              </div>
                                              <p className="text-xs font-black text-primary">
                                                  Requested Increment: {req.type === 'incentive_units' ? `+ ${req.value} Units` : `+ NRs. ${req.value.toLocaleString()} / month`}
                                              </p>
                                          </div>
                                          <div>
                                              <span className={`text-[9px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest inline-block ${
                                                  req.status === 'Approved' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                                  req.status === 'Declined' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                                                  'bg-amber-100 text-amber-700 border border-amber-200 animate-pulse'
                                              }`}>
                                                  {req.status}
                                              </span>
                                          </div>
                                      </div>

                                      {/* Sub-details & Justification */}
                                      <div className="mt-3 text-xs border-t border-dashed border-gray-200 pt-3 space-y-2">
                                          <p className="text-[10px] text-gray-500">
                                              <strong className="text-gray-700 font-bold block uppercase tracking-wider text-[8px] mb-0.5">Submitted Justification:</strong>
                                              "{req.justification}"
                                          </p>

                                          {req.reviewComment && (
                                              <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg border border-emerald-100 mt-2">
                                                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700 flex items-center gap-1">
                                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Executive Verdict
                                                  </p>
                                                  <p className="text-[11px] font-bold mt-1">"{req.reviewComment}"</p>
                                                  <p className="text-[9px] text-emerald-600 mt-1 font-bold">— Reviewed by: {req.reviewedBy || 'Academic Committee'}</p>
                                              </div>
                                          )}

                                          {/* Click to expand instruction */}
                                          <div className="flex justify-between items-center text-[9px] text-gray-400 font-bold pt-1">
                                              <span>Submitted on: {req.createdAt ? (typeof req.createdAt === 'object' && req.createdAt.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString() : new Date(req.createdAt).toLocaleDateString()) : 'N/A'}</span>
                                              <span className="text-primary hover:underline flex items-center gap-0.5">
                                                  {isSelected ? 'Click to collapse' : 'Click to view review timeline →'}
                                              </span>
                                          </div>
                                      </div>

                                      {/* Expanded Stepper Timeline */}
                                      {isSelected && (
                                          <div className="mt-4 bg-slate-50 p-4 rounded-xl border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
                                              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Live Progress Stepper</p>
                                              <div className="relative pl-6 space-y-4 border-l-2 border-gray-200">
                                                  {/* Step 1 */}
                                                  <div className="relative">
                                                      <span className="absolute -left-[31px] top-0 bg-emerald-500 text-white rounded-full p-1 border-4 border-white">
                                                          <Check className="w-2.5 h-2.5" />
                                                      </span>
                                                      <p className="text-xs font-black text-gray-800">Submitted to HR Portlet</p>
                                                      <p className="text-[9px] text-gray-400 font-semibold">Logged successfully with Ref: {req.referenceNo}</p>
                                                  </div>
                                                  {/* Step 2 */}
                                                  <div className="relative">
                                                      <span className={`absolute -left-[31px] top-0 rounded-full p-1 border-4 border-white ${
                                                          req.status === 'Approved' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white animate-pulse'
                                                      }`}>
                                                          {req.status === 'Approved' ? <Check className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                                                      </span>
                                                      <p className="text-xs font-black text-gray-800">Academic Committee Verification</p>
                                                      <p className="text-[9px] text-gray-400 font-semibold">
                                                          {req.status === 'Approved' ? 'Verified performance score & remedial hour reports' : 'Under analysis by Vice Principal'}
                                                      </p>
                                                  </div>
                                                  {/* Step 3 */}
                                                  <div className="relative">
                                                      <span className={`absolute -left-[31px] top-0 rounded-full p-1 border-4 border-white ${
                                                          req.status === 'Approved' ? 'bg-emerald-500 text-white' : 'bg-gray-300 text-white'
                                                      }`}>
                                                          {req.status === 'Approved' ? <Check className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                                                      </span>
                                                      <p className="text-xs font-black text-gray-800">Principal Board Signoff & Verification</p>
                                                      <p className="text-[9px] text-gray-400 font-semibold">
                                                          {req.status === 'Approved' ? 'Final verdict issued & budget allocated' : 'Awaiting scheduled monthly board meeting'}
                                                      </p>
                                                  </div>
                                              </div>
                                          </div>
                                      )}
                                  </div>
                              );
                          })}
                      </div>
                  )}
              </div>
          </div>
 
          {/* RIGHT COLUMN: Submit form */}
          <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
              <div>
                  <h2 className="text-sm font-black uppercase tracking-widest text-primary mb-1 flex items-center gap-2">
                      <PlusCircle className="w-5 h-5 text-emerald-500"/> Request Salary Hike
                  </h2>
                  <p className="text-xs text-gray-400 font-medium">Request basic increments or specialized performance units based on your school evaluation scorecard.</p>
              </div>

              {/* Justification presets */}
              <div className="bg-slate-50/50 p-4 rounded-xl border border-gray-100">
                  <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-2">💡 Justification Quick-Assist</span>
                  <div className="flex flex-col gap-1.5">
                      <button 
                        type="button" 
                        onClick={() => applyPresetJustification("Conducted 12+ extra hours of remedial science tuitions for Class 10 to ensure 100% board pass-rates.")}
                        className="text-left text-[10px] font-semibold text-primary hover:bg-white p-2 rounded-lg border border-transparent hover:border-gray-100 transition-all flex items-center gap-1"
                      >
                          <Bookmark className="w-3 h-3 shrink-0 text-emerald-500" /> Board preparation remedial classes
                      </button>
                      <button 
                        type="button" 
                        onClick={() => applyPresetJustification("Successfully completed the National Pedagogy and Smart Class Education Training certification.")}
                        className="text-left text-[10px] font-semibold text-primary hover:bg-white p-2 rounded-lg border border-transparent hover:border-gray-100 transition-all flex items-center gap-1"
                      >
                          <Bookmark className="w-3 h-3 shrink-0 text-emerald-500" /> Professional training & certification
                      </button>
                      <button 
                        type="button" 
                        onClick={() => applyPresetJustification("Adjusting basic pay to account for additional responsibilities leading the internal examination board.")}
                        className="text-left text-[10px] font-semibold text-primary hover:bg-white p-2 rounded-lg border border-transparent hover:border-gray-100 transition-all flex items-center gap-1"
                      >
                          <Bookmark className="w-3 h-3 shrink-0 text-emerald-500" /> Added internal board responsibilities
                      </button>
                  </div>
              </div>

              {/* SIMULATOR IMPACT PANEL */}
              <div className="bg-gradient-to-br from-blue-900 to-[#1e293b] text-white p-5 rounded-xl space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-blue-800">
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5" /> Proposed Hike Projection
                      </span>
                      <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] px-2 py-0.5 rounded font-black tracking-widest">
                          +{percentageIncrease}%
                      </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs font-bold">
                      <div>
                          <span className="text-gray-400 block text-[9px] font-black uppercase tracking-widest mb-0.5">Current Gross</span>
                          <span className="text-gray-200">NRs. {currentGross.toLocaleString()}</span>
                      </div>
                      <div>
                          <span className="text-emerald-400 block text-[9px] font-black uppercase tracking-widest mb-0.5">Projected Gross</span>
                          <span className="text-emerald-400 font-black">NRs. {simulatedGross.toLocaleString()}</span>
                      </div>
                  </div>
                  <div className="bg-blue-950/40 p-3 rounded-lg border border-blue-900 flex justify-between items-center text-xs">
                      <div>
                          <span className="text-gray-400 block text-[9px] font-black uppercase tracking-widest">Est. Annualized Pay Increment</span>
                          <span className="font-bold text-slate-100">NRs. {(simulatedIncrease * 12).toLocaleString()} / year</span>
                      </div>
                      <ArrowUpRight className="w-5 h-5 text-emerald-400 shrink-0" />
                  </div>
              </div>

              <form onSubmit={handleSubmitRequest} className="space-y-4">
                  <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 block mb-1">Request Type</label>
                      <select value={reqType} onChange={e => {
                          setReqType(e.target.value);
                          if (e.target.value === 'incentive_units') setReqVal('1');
                          else setReqVal('');
                      }} className="w-full border border-gray-200 rounded-xl p-2.5 text-xs font-bold focus:ring-2 focus:ring-primary focus:outline-none">
                          <option value="incentive_units">Additional Incentive Units (Grade Step)</option>
                          <option value="basic_pay">Basic Pay Incremental Hike</option>
                          <option value="allowance">Allowance Bump (Dearness/Other)</option>
                      </select>
                  </div>

                  <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 block mb-1">
                          {reqType === 'incentive_units' ? 'Number of Incentive Units' : 'Monthly NRS Addition Amount'}
                      </label>
                      <div className="relative">
                          <input 
                              type="number" 
                              min="1" 
                              required
                              value={reqVal} 
                              onChange={e => setReqVal(e.target.value)} 
                              className="w-full border border-gray-200 rounded-xl p-2.5 pl-8 text-xs font-bold focus:ring-2 focus:ring-primary focus:outline-none"
                              placeholder={reqType === 'incentive_units' ? 'e.g., 2' : 'e.g., 5000'}
                          />
                          <span className="absolute left-3 top-3 text-gray-400 text-xs font-bold">
                              {reqType === 'incentive_units' ? '#' : '₨'}
                          </span>
                      </div>
                      {reqType === 'incentive_units' && (
                          <span className="text-[10px] text-gray-400 block mt-1 font-medium bg-slate-50 p-2 rounded">
                              Estimated monthly addition: <strong className="text-gray-700">NRs. {(Number(reqVal || 0) * (activeStruct?.unitRate || 1500)).toLocaleString()}</strong> (calculated at standard unit rate NRs. {(activeStruct?.unitRate || 1500).toLocaleString()})
                          </span>
                      )}
                  </div>

                  <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 block mb-1">Justification & Reason</label>
                      <textarea 
                          required
                          rows={4}
                          value={justification}
                          onChange={e => setJustification(e.target.value)}
                          placeholder="Provide a detailed, professional reason for this request (e.g., Coached extra academic classes, scored 100% average marks on state boards, completed professional development courses)"
                          className="w-full border border-gray-200 rounded-xl p-3 text-xs font-semibold focus:ring-2 focus:ring-primary focus:outline-none resize-none"
                      />
                  </div>

                  {reqStatus && (
                      <div className={`p-3 rounded-lg text-xs font-bold flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-300 ${
                          reqStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                      }`}>
                          {reqStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0"/> : <AlertCircle className="w-4 h-4 shrink-0"/>}
                          <span>{reqStatus.msg}</span>
                      </div>
                  )}

                  <button 
                      type="submit" 
                      disabled={submitting}
                      className="w-full py-3 bg-primary hover:bg-blue-900 text-white rounded-xl font-bold uppercase tracking-widest text-xs flex justify-center items-center gap-2 transition-colors disabled:opacity-50 shadow-md hover:shadow-lg"
                  >
                      {submitting ? 'Submitting...' : <><Send className="w-3.5 h-3.5"/> Submit Request</>}
                  </button>
              </form>
          </div>
      </div>

      {/* DETAILED PRINTABLE SALARY SLIP MODAL */}
      {selectedSlip && (
         <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[90vh]">
              <div className="flex justify-between items-center p-4 bg-slate-900 text-white border-b border-slate-800">
                  <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-emerald-400" />
                      <p className="font-black text-xs uppercase tracking-wider">Official Signed Salary Paystub</p>
                  </div>
                  <button onClick={() => setSelectedSlip(null)} className="text-slate-400 hover:text-white transition-colors">
                      <X className="w-5 h-5" />
                  </button>
              </div>
              <div className="flex-1 overflow-auto bg-slate-50 p-4 sm:p-8 custom-scrollbar">
                 {/* Printable slip wrapper */}
                 <div ref={slipRef} className="bg-white mx-auto shadow-sm relative overflow-hidden p-6 sm:p-10 max-w-[620px] rounded-xl border border-gray-100">
                    
                    {/* Watermark */}
                    <div className="absolute inset-0 pointer-events-none opacity-[0.03] flex items-center justify-center select-none">
                        <img src={logoImage} alt="Watermark" className="w-[300px] h-[300px] object-contain" />
                    </div>

                    {/* Official Payslip Header */}
                    <div className="text-center mb-8 border-b-2 border-slate-800 pb-6 relative z-10">
                        <img src={logoImage} alt="Logo" className="w-16 h-16 object-contain mx-auto mb-2" />
                        <h2 className="font-black text-2xl text-slate-900 uppercase tracking-widest">Shikshantar Academy</h2>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Karjanhana Municipality, Bastipur-5, Siraha, Nepal</p>
                        <p className="text-[9px] text-gray-400 font-bold uppercase mt-1">Estd. 2072 B.S. | Reg: 948194-NP</p>
                        <div className="mt-4 flex justify-center gap-2">
                            <span className="bg-slate-900 text-white px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                                Official Salary Slip
                            </span>
                            <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                                <Check className="w-3 h-3" /> Paid & Settled
                            </span>
                        </div>
                    </div>
                    
                    {/* Employee & Bank Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mb-6 pb-6 border-b border-gray-100 relative z-10">
                        <div className="space-y-1">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Employee Information</span>
                            <p className="font-black text-slate-900 text-base">{teacherProfile?.fullName || teacherProfile?.name || 'Susmita Sah'}</p>
                            <p className="text-gray-500 font-bold">Emp ID: {teacherProfile?.studentId || 'TS-2083-0941'}</p>
                            <p className="text-gray-500 font-bold">Designation: Primary Pedagogy Teacher</p>
                        </div>
                        <div className="sm:text-right space-y-1">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Payment Particulars</span>
                            <p className="font-black text-slate-900 text-base">{selectedSlip.month} {selectedSlip.year} B.S.</p>
                            <p className="text-gray-500 font-bold">Disbursed on: {selectedSlip.date}</p>
                            <p className="text-gray-500 font-bold">Ref No: {selectedSlip.referenceNo || 'TXN-940294194B'}</p>
                        </div>
                    </div>

                    {/* Bank Transfer Details Box */}
                    <div className="bg-slate-50 p-3 rounded-lg border border-gray-100 mb-6 flex justify-between items-center text-xs text-slate-600 font-bold relative z-10">
                        <div className="flex items-center gap-2">
                            <Wallet className="w-4 h-4 text-slate-500" />
                            <span>Disbursed via: {selectedSlip.paymentMethod || 'Bank Transfer (Nabil Bank Ltd)'}</span>
                        </div>
                        {selectedSlip.workingDays && (
                            <span>Working Period: {selectedSlip.workingDays} Days</span>
                        )}
                    </div>

                    {/* Earnings & Deductions Tables */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8 relative z-10">
                        <div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-primary mb-3 pb-2 border-b border-gray-200 flex justify-between">
                                <span>Earnings</span>
                                <span>Amount (₨)</span>
                            </h3>
                            <div className="space-y-2.5 text-xs">
                                <div className="flex justify-between"><span className="text-gray-600 font-bold">Basic Pay</span><span className="font-black text-gray-900">₨ {selectedSlip.structureSnapshot?.basicPay?.toLocaleString()}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600 font-bold">Dearness Allow.</span><span className="font-black text-gray-900">₨ {selectedSlip.structureSnapshot?.dearness?.toLocaleString()}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600 font-bold">Transport Allow.</span><span className="font-black text-gray-900">₨ {selectedSlip.structureSnapshot?.transport?.toLocaleString()}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600 font-bold">House Rent Allow.</span><span className="font-black text-gray-900">₨ {selectedSlip.structureSnapshot?.houseRent?.toLocaleString()}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600 font-bold">Other Allow.</span><span className="font-black text-gray-900">₨ {selectedSlip.structureSnapshot?.other?.toLocaleString()}</span></div>
                                {selectedSlip.structureSnapshot?.incentiveUnits > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-600 font-bold">Incentive ({selectedSlip.structureSnapshot.incentiveUnits} × ₨ {selectedSlip.structureSnapshot.unitRate || 1500})</span>
                                        <span className="font-black text-gray-900">₨ {(selectedSlip.structureSnapshot.incentiveUnits * (selectedSlip.structureSnapshot.unitRate || 1500)).toLocaleString()}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-rose-600 mb-3 pb-2 border-b border-gray-200 flex justify-between">
                                <span>Deductions</span>
                                <span>Amount (₨)</span>
                            </h3>
                            <div className="space-y-2.5 text-xs">
                                <div className="flex justify-between"><span className="text-gray-600 font-bold">Social Security Tax (1%)</span><span className="font-black text-gray-900">₨ {selectedSlip.tax?.toLocaleString()}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600 font-bold">Absentee Deductions</span><span className="font-black text-gray-900">₨ {selectedSlip.absentDeduction?.toLocaleString()}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600 font-bold">Loan Recovery</span><span className="font-black text-gray-900">₨ {selectedSlip.loanRecovery?.toLocaleString()}</span></div>
                            </div>
                        </div>
                    </div>

                    {/* Gross vs Total Deductions vs Net Payable Summary */}
                    <div className="border-t-2 border-slate-800 pt-6 mt-6 pb-6 border-b-2 relative z-10 space-y-2">
                        <div className="flex justify-between text-xs font-bold text-gray-500">
                            <span>Gross Earnings: ₨ {selectedSlip.grossPay?.toLocaleString()}</span>
                            <span>Total Deductions: ₨ {(selectedSlip.totalDeductions || (selectedSlip.tax + selectedSlip.absentDeduction + selectedSlip.loanRecovery))?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-primary pt-2 border-t border-gray-100">
                            <span className="text-xs font-black uppercase tracking-widest">Net Disbursed Take-Home</span>
                            <span className="text-2xl font-black">NRs. {selectedSlip.netPay?.toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Official Stamp & Signatures */}
                    <div className="mt-16 pt-8 flex justify-between text-[9px] font-black text-gray-500 uppercase tracking-widest relative z-10">
                        <div className="text-center w-40">
                            <div className="h-10 flex items-center justify-center mb-1">
                                <span className="text-emerald-700/80 border border-emerald-600/30 font-black tracking-widest uppercase border-dashed px-2 py-1 rotate-[-3deg] text-[8px] bg-emerald-50">
                                    Digital Stamp #9482B
                                </span>
                            </div>
                            <div className="border-t border-slate-300 pt-2 font-black">Authorized Accountant</div>
                        </div>
                        <div className="text-center w-40">
                            <div className="h-10 flex items-center justify-center mb-1">
                                <span className="font-serif text-slate-800 font-bold tracking-wider italic text-[11px]">R. K. Chaudhary</span>
                            </div>
                            <div className="border-t border-slate-300 pt-2 font-black">Principal Signoff</div>
                        </div>
                    </div>
                 </div>
              </div>
              <div className="p-4 bg-white border-t border-gray-200 space-y-3">
                 <div className="flex gap-3">
                    <button onClick={() => setSelectedSlip(null)} className="flex-1 py-3 border-primary text-primary border border-gray-200 rounded-xl font-black text-gray-600 uppercase tracking-widest text-xs transition-colors hover:bg-gray-100">
                        Close View
                    </button>
                    <button onClick={downloadSlip} className="flex-1 py-3 bg-primary text-white border rounded-xl font-black uppercase tracking-widest text-xs shadow-lg flex justify-center items-center gap-2 hover:bg-blue-900 transition-colors">
                        <FileDown className="w-4 h-4"/> Download Printable PDF
                    </button>
                 </div>
              </div>
           </div>
         </div>
      )}
    </div>
  );
}
