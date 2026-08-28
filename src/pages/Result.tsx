import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CheckCircle2, Download, PieChart as PieChartIcon, Loader2, Search, User, ClipboardList } from 'lucide-react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import jsPDF from 'jspdf';
import { toCanvas } from 'html-to-image';
import * as XLSX from 'xlsx';

import { ReportCardTemplate } from '../components/admin/ReportCardTemplate';
import { StudentResult } from '../data/resultsState';

const EXAM_TYPES = ['Terminal 1', 'Unit Test 1', 'Terminal 2', 'Final Exam'];

export default function Result() {
  const [studentId, setStudentId] = useState('');
  const [results, setResults] = useState<StudentResult[]>([]);
  const [activeTab, setActiveTab] = useState<string>('Terminal 1');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchStudentId, setSearchStudentId] = useState('');
  const [userRole, setUserRole] = useState('student');
  const [childrenList, setChildrenList] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [compareExamA, setCompareExamA] = useState<string>('');
  const [compareExamB, setCompareExamB] = useState<string>('');

  const pdfRef = useRef<HTMLDivElement>(null);

  const fetchResults = async (uid: string) => {
     setLoading(true);
     try {
         // Resolve all possible student IDs and fetch published exams in parallel!
         const examsPromise = getDocs(query(collection(db, 'exams'), where('published', '==', true)));
         
         const resolveIdsPromise = (async () => {
             const possibleIds = new Set<string>();
             possibleIds.add(uid);
             try {
                 const uDoc = await getDoc(doc(db, 'users', uid));
                 if (uDoc.exists()) {
                     const uData = uDoc.data();
                     possibleIds.add(uDoc.id);
                     if (uData.studentId) possibleIds.add(String(uData.studentId));
                     if (uData.rollNumber) possibleIds.add(String(uData.rollNumber));
                     if (uData.rollNo) possibleIds.add(String(uData.rollNo));
                 } else {
                     // Try querying by studentId
                     const q1 = query(collection(db, 'users'), where('studentId', '==', uid));
                     const qSnap1 = await getDocs(q1);
                     qSnap1.forEach(docSnap => {
                         possibleIds.add(docSnap.id);
                         const uData = docSnap.data();
                         if (uData.studentId) possibleIds.add(String(uData.studentId));
                         if (uData.rollNumber) possibleIds.add(String(uData.rollNumber));
                         if (uData.rollNo) possibleIds.add(String(uData.rollNo));
                     });
                 }
             } catch (e) {
                 console.error("Error fetching matching user ids:", e);
             }
             return Array.from(possibleIds).filter(Boolean);
         })();

         const [examsSnap, idList] = await Promise.all([examsPromise, resolveIdsPromise]);

         const publishedExamIds = new Set<string>();
         const examStats: Record<string, { highestMarks?: Record<string, number>, classAverages?: Record<string, number> }> = {};
         
         examsSnap.forEach(doc => {
            publishedExamIds.add(doc.id);
            const data = doc.data();
            examStats[doc.id] = {
               highestMarks: data.highestMarks || {},
               classAverages: data.classAverages || {}
            };
         });

         if (publishedExamIds.size === 0 || idList.length === 0) {
             setResults([]);
             setLoading(false);
             return;
         }

         // Fetch summaries and result details in parallel!
         const summaryPromise = getDocs(query(collection(db, 'resultSummary'), where('studentId', 'in', idList)));
         const resultsPromise = getDocs(query(collection(db, 'results'), where('studentId', 'in', idList)));

         const [summarySnap, resultsSnap] = await Promise.all([summaryPromise, resultsPromise]);

         const summaryList: any[] = [];
         summarySnap.forEach(doc => {
             if (publishedExamIds.has(doc.data().examId)) {
                 summaryList.push({ id: doc.id, ...doc.data() });
             }
         });

         if (summaryList.length === 0) {
             setResults([]);
             setLoading(false);
             return;
         }

         const resultsByExamId: Record<string, any> = {};
         resultsSnap.forEach(doc => {
             const sub = doc.data();
             if (!resultsByExamId[sub.examId]) resultsByExamId[sub.examId] = {};
             resultsByExamId[sub.examId][sub.subject] = {
                 fullMarks: sub.fullMarks, obtained: sub.marks
             };
         });
         
         // Calculate dynamic highest marks for each exam
         const currentRole = localStorage.getItem('userRole') || 'student';
         if (currentRole !== 'student' && currentRole !== 'guest') {
             for (const sum of summaryList) {
                 const examId = sum.examId;
                 try {
                     const allRes = await getDocs(query(collection(db, 'results'), where('examId', '==', examId)));
                     const dynamicHighest: Record<string, number> = {};
                     allRes.forEach(doc => {
                         const data = doc.data();
                         const sub = data.subject;
                         const obtained = data.marks === "AB" ? 0 : Number(data.marks) || 0;
                         if (!dynamicHighest[sub] || dynamicHighest[sub] < obtained) {
                             dynamicHighest[sub] = obtained;
                         }
                     });
                     if (!examStats[examId]) examStats[examId] = {};
                     examStats[examId].highestMarks = dynamicHighest;
                 } catch (e) {
                     console.error("Failed to fetch all results for dynamic highest marks", e);
                 }
             }
         }

         const parsedData: StudentResult[] = summaryList.map(sum => ({
              studentId: sum.studentId,
              studentName: sum.studentName,
              class: sum.class,
              rollNo: sum.rollNo || '',
              examType: sum.examType,
              examId: sum.examId,
              subjects: resultsByExamId[sum.examId] || {},
              highestMarks: examStats[sum.examId]?.highestMarks || {},
              classAverages: examStats[sum.examId]?.classAverages || {},
              total: sum.total,
              fullTotal: sum.fullTotal,
              percentage: sum.percentage,
              grade: sum.grade,
              gpa: sum.gpa || 0,
              rank: sum.rank || 0,
              published: true, // We filtered by published
              classTeacherRemark: sum.classTeacherRemark || ''
         }));

         setResults(parsedData);
         if (parsedData.length > 0) {
             setActiveTab(parsedData[parsedData.length - 1].examType);
         }
     } catch (err: any) {
         console.error("Error retrieving results:", err);
     } finally {
         setLoading(false);
     }
  };

  useEffect(() => {
    let unsubAuth = onAuthStateChanged(auth, async (user) => {
       if (!user) {
           setResults([]);
           setLoading(false);
           return;
       }

       try {
           const uDoc = await getDoc(doc(db, 'users', user.uid));
           let role = localStorage.getItem('userRole') || 'student';
           let uidToUse = null;

           if (uDoc.exists()) {
               const userData = uDoc.data();
               role = userData.role || 'student';
               setUserRole(role);
               localStorage.setItem('userRole', role);

               if (role === 'student') {
                   if (userData.children && userData.children.length > 0) {
                       setChildrenList(userData.children);
                       const activeId = selectedChildId || userData.children[0].studentId;
                       if (!selectedChildId) {
                           setSelectedChildId(activeId);
                       }
                       uidToUse = activeId;
                       localStorage.setItem('studentId', activeId);
                   } else {
                       uidToUse = userData.studentId || user.uid;
                       localStorage.setItem('studentId', uidToUse);
                   }
               } else {
                   uidToUse = localStorage.getItem('adminSearchStudentId');
               }
           } else {
               setUserRole(role);
               if (role === 'student') {
                   uidToUse = localStorage.getItem('studentId') || user.uid;
               } else {
                   uidToUse = localStorage.getItem('adminSearchStudentId');
               }
           }

           setStudentId(uidToUse || '');
           if (uidToUse) {
               await fetchResults(uidToUse);
           } else {
               setLoading(false);
           }
       } catch (err) {
           console.error("Error in auth/data load check:", err);
           setLoading(false);
       }
    });

    return () => {
       unsubAuth();
    };
  }, [selectedChildId]);

  const handleChildChange = (childId: string) => {
     setSelectedChildId(childId);
     setStudentId(childId);
     localStorage.setItem('studentId', childId);
     fetchResults(childId);
  };

  const handleAdminSearch = (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchStudentId.trim()) return;
      localStorage.setItem('adminSearchStudentId', searchStudentId.trim());
      setStudentId(searchStudentId.trim());
      fetchResults(searchStudentId.trim());
  };

  // Group results into dynamically available exam types to act as navigation
  const availableExams = useMemo(() => {
     return Array.from(new Set(results.map(r => r.examType)));
  }, [results]);

  const currentResult = results.find(r => r.examType === activeTab);

  const getGradeInfo = (obtained: number | "AB", full: number) => {
     if (obtained === "AB") return { grade: "NG", gpa: 0, pass: false, text: "Absent" };
     const pct = (obtained / full) * 100;
     if (pct >= 90) return { grade: "A+", gpa: 4.0, pass: true, text: "Outstanding" };
     if (pct >= 80) return { grade: "A", gpa: 3.6, pass: true, text: "Excellent" };
     if (pct >= 70) return { grade: "B+", gpa: 3.2, pass: true, text: "Very Good" };
     if (pct >= 60) return { grade: "B", gpa: 2.8, pass: true, text: "Good" };
     if (pct >= 50) return { grade: "C+", gpa: 2.4, pass: true, text: "Satisfactory" };
     if (pct >= 40) return { grade: "C", gpa: 2.0, pass: true, text: "Acceptable" };
     if (pct >= 35) return { grade: "D", gpa: 1.6, pass: true, text: "Basic" }; 
     return { grade: "NG", gpa: 0, pass: false, text: "Not Graded" };
  };

  const chartData = useMemo(() => {
     if (!currentResult) return [];
     return Object.entries(currentResult.subjects).map(([sub, rawMarks]) => {
         const marks: any = rawMarks;
         const myMarks = marks.obtained === "AB" ? 0 : Number(marks.obtained) || 0;
         let highest = currentResult.highestMarks?.[sub];
         if (highest === undefined || highest < myMarks) {
             highest = myMarks;
         }
         let average = currentResult.classAverages?.[sub] || 0;
         return {
            subject: sub,
            myMarks: myMarks,
            highestMarks: highest,
            classAverage: Number(average) || 0
         };
     });
  }, [currentResult]);

  const comparisonStats = useMemo(() => {
     if (!currentResult) return null;
     let aboveAvgCount = 0;
     let totalSubjectsCount = 0;
     let highestMargin = -999;
     let highestMarginSubject = '';
     
     Object.entries(currentResult.subjects).forEach(([sub, rawMarks]) => {
         const marks: any = rawMarks;
         const myMarks = marks.obtained === "AB" ? 0 : Number(marks.obtained) || 0;
         const avg = Number(currentResult.classAverages?.[sub]) || 0;
         
         totalSubjectsCount++;
         if (myMarks >= avg) {
             aboveAvgCount++;
         }
         
         const margin = myMarks - avg;
         if (margin > highestMargin) {
             highestMargin = margin;
             highestMarginSubject = sub;
         }
     });

     return {
         aboveAvgCount,
         totalSubjectsCount,
         highestMargin,
         highestMarginSubject
     };
  }, [currentResult]);

  const downloadPDFReport = async () => {
      if (!pdfRef.current || !currentResult) return;
      setGeneratingPdf(true);
      
      try {
          await new Promise(r => setTimeout(r, 300));
          const canvas = await toCanvas(pdfRef.current, { pixelRatio: 2 });
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF('p', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
          pdf.save(`${currentResult.studentName}_${currentResult.examType}_ReportCard.pdf`);
      } catch (err) {
          console.error("PDF generation failed:", err);
      } finally {
          setGeneratingPdf(false);
      }
  };

   const downloadClassResultExcel = async () => {
      if (!currentResult) return;
      try {
         const summariesSnap = await getDocs(query(collection(db, 'resultSummary'), where('examId', '==', currentResult.examId)));
         const resultsSnap = await getDocs(query(collection(db, 'results'), where('examId', '==', currentResult.examId)));
         
         const resultsByStudent: Record<string, any> = {};
         resultsSnap.forEach(doc => {
            const data = doc.data();
            if (!resultsByStudent[data.studentId]) resultsByStudent[data.studentId] = {};
            resultsByStudent[data.studentId][data.subject] = data.marks;
         });

         const excelData = summariesSnap.docs.map(doc => {
             const data = doc.data();
             return {
                 "Student ID": data.studentId,
                 "Student Name": data.studentName,
                 "Class": data.class,
                 "Total Marks": data.total,
                 "Percentage": data.percentage,
                 "GPA": data.gpa,
                 "Grade": data.grade,
                 "Rank": data.rank,
                 ...resultsByStudent[data.studentId]
             };
         });
         
         excelData.sort((a, b) => (a.Rank || 999) - (b.Rank || 999));

         // Prepare columns for exportToExcel
         const columns = [
            { header: 'Student ID', key: 'Student ID', width: 15 },
            { header: 'Student Name', key: 'Student Name', width: 25 },
            { header: 'Class', key: 'Class', width: 15 },
            { header: 'Total Marks', key: 'Total Marks', width: 15 },
            { header: 'Percentage', key: 'Percentage', width: 15 },
            { header: 'GPA', key: 'GPA', width: 15 },
            { header: 'Grade', key: 'Grade', width: 15 },
            { header: 'Rank', key: 'Rank', width: 15 },
         ];

         // Add dynamic subject columns
         if (excelData.length > 0) {
            const firstStudent = excelData[0];
            const baseKeys = ['Student ID', 'Student Name', 'Class', 'Total Marks', 'Percentage', 'GPA', 'Grade', 'Rank'];
             Object.keys(firstStudent).forEach(key => {
                 if (!baseKeys.includes(key)) {
                     columns.push({ header: key, key: key, width: 20 });
                 }
             });
         }

         const { exportToExcel } = await import('../lib/excelExport');
         await exportToExcel(`Class_${currentResult.class}_${currentResult.examType}_Results`, `Class ${currentResult.class} | ${currentResult.examType} Results`, columns, excelData);
      } catch (err: any) {
         console.error("Error downloading excel", err);
         if (err.message.includes("permission")) {
             alert("Permission Denied: You must be an admin to download class results.");
         }
      }
   };

   const downloadClassResultPDF = async () => {
      if (!currentResult) return;
      try {
         const summariesSnap = await getDocs(query(collection(db, 'resultSummary'), where('examId', '==', currentResult.examId)));
         
         const pdfData = summariesSnap.docs.map(doc => doc.data());
         pdfData.sort((a, b) => (a.rank || 999) - (b.rank || 999));

         const columns = ['Rank', 'Student ID', 'Name', 'Class', 'Total', 'Pct', 'GPA', 'Grade'];
         const body = pdfData.map(s => [
             s.rank || '-',
             s.studentId || '-',
             s.studentName || '-',
             s.class || '-',
             `${s.total}/${s.fullTotal}`,
             `${s.percentage?.toFixed(1)}%`,
             s.gpa || '-',
             s.grade || '-'
         ]);

         const { exportToPDF } = await import('../lib/pdfExport');
         await exportToPDF(`Class ${currentResult.class} | ${currentResult.examType} Results`, columns, body, `Class_${currentResult.class}_${currentResult.examType}_Results`, true);
      } catch (err: any) {
         console.error("Error downloading class PDF", err);
         if (err.message.includes("permission")) {
             alert("Permission Denied: You must be an admin to download class results.");
         }
      }
   };

  return (
    <div className="flex flex-col gap-5 pb-20">
      {childrenList.length > 1 && (
         <div className="bg-white p-5 rounded-3xl border border-gray-100 flex flex-col sm:flex-row gap-4 items-center justify-between shadow-sm">
            <div>
               <h3 className="font-black text-gray-800 text-sm">Select Student Account</h3>
               <p className="text-xs text-gray-500 font-semibold mt-0.5">Toggle between your linked children's report cards.</p>
            </div>
            <select 
               value={selectedChildId} 
               onChange={(e) => handleChildChange(e.target.value)}
               className="border border-gray-200 px-4 py-2.5 rounded-xl text-sm bg-white font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto min-w-[220px] shadow-sm cursor-pointer"
            >
               {childrenList.map((c: any) => (
                  <option key={c.studentId} value={c.studentId}>{c.name} (Class {c.class})</option>
               ))}
            </select>
         </div>
      )}
      {(userRole === 'admin' || userRole === 'teacher') && (
         <div className="bg-white p-4 rounded-xl border border-blue-100 flex flex-col sm:flex-row gap-3 items-center">
            <div className="flex-1">
               <h3 className="font-bold text-gray-800 text-sm">Admin View: Search Result by Student ID</h3>
               <p className="text-xs text-gray-500">Student ID or Roll No is case-sensitive.</p>
            </div>
            <form onSubmit={handleAdminSearch} className="flex gap-2 w-full sm:w-auto">
               <input type="text" value={searchStudentId} onChange={(e) => setSearchStudentId(e.target.value)} placeholder="e.g. STU123" className="border border-gray-200 px-3 py-2 rounded-lg text-sm flex-1 outline-none focus:ring-primary" />
               <button type="submit" className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1 hover:bg-blue-800"><Search className="w-4 h-4"/> Search</button>
            </form>
         </div>
      )}
      <div className="flex flex-col gap-2 pb-2">
         {availableExams.length === 0 && !loading && (
             <span className="text-sm font-bold text-gray-400">No Exams to display</span>
         )}
         {availableExams.filter(e => e.toLowerCase().includes('terminal')).length > 0 && (
             <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
                <span className="text-xs font-bold text-gray-400 uppercase mr-2 whitespace-nowrap">Terminals:</span>
                {availableExams.filter(e => e.toLowerCase().includes('terminal')).map(exam => (
                    <button 
                      key={exam} 
                      onClick={() => setActiveTab(exam)}
                      className={`px-4 py-2 font-bold text-sm whitespace-nowrap rounded-t-lg border-b-2 transition-colors ${ activeTab === exam ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-800 hover:opacity-90' }`}
                    >
                       {exam} ✓
                    </button>
                ))}
             </div>
         )}
         {availableExams.filter(e => !e.toLowerCase().includes('terminal')).length > 0 && (
             <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
                <span className="text-xs font-bold text-gray-400 uppercase mr-2 whitespace-nowrap">Tests / Others:</span>
                {availableExams.filter(e => !e.toLowerCase().includes('terminal')).map(exam => (
                    <button 
                      key={exam} 
                      onClick={() => setActiveTab(exam)}
                      className={`px-4 py-2 font-bold text-sm whitespace-nowrap rounded-t-lg border-b-2 transition-colors ${ activeTab === exam ? 'border-purple-600 text-purple-600 bg-purple-50/50' : 'border-transparent text-gray-500 hover:text-gray-800 hover:opacity-90' }`}
                    >
                       {exam} ✓
                    </button>
                ))}
             </div>
         )}
      </div>
      
      {loading ? (
           <div className="bg-white rounded-3xl shadow-sm border border-gray-100 max-w-2xl mx-auto mt-8 flex flex-col p-8 space-y-6">
              <div className="flex gap-4 items-center">
                 <div className="w-16 h-16 bg-gray-200 rounded-2xl animate-pulse"></div>
                 <div className="space-y-2 flex-1">
                    <div className="w-1/3 h-6 bg-gray-200 rounded animate-pulse"></div>
                    <div className="w-1/4 h-4 bg-gray-100 rounded animate-pulse"></div>
                 </div>
              </div>
              <div className="space-y-3">
                 {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="w-full h-10 bg-gray-50 rounded-lg animate-pulse flex items-center px-4 justify-between">
                       <div className="w-1/3 h-4 bg-gray-200 rounded"></div>
                       <div className="w-1/4 h-4 bg-gray-200 rounded"></div>
                    </div>
                 ))}
              </div>
           </div>
      ) : !currentResult ? (
          <div className="bg-white rounded-3xl p-8 md:p-12 text-center shadow-sm border border-gray-100 max-w-2xl mx-auto mt-8">
             <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                <ClipboardList className="w-10 h-10 text-gray-400" />
             </div>
             <h3 className="text-xl font-black text-gray-900 mb-2">No results published yet.</h3>
             <p className="text-gray-500 max-w-md mx-auto">
                Check back after your exam results are announced. Admin must publish the results before they appear here.
             </p>
          </div>
      ) : (
          <>
            {/* RESULT SUMMARY CARD */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6 items-center">
               <div className="flex-1 text-center md:text-left w-full">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">{currentResult.examType} | Class {currentResult.class}</p>
                  <h2 className="text-2xl md:text-3xl font-black text-gray-900">{currentResult.studentName}</h2>
                  <p className="text-sm font-bold text-gray-500 mt-2">Rank: 🏆 {currentResult.rank} </p>
               </div>
               
               <div className="flex flex-wrap justify-center gap-4 w-full md:w-auto">
                  <div className="bg-blue-50 px-5 py-3 rounded-2xl border border-blue-100 text-center flex-1 min-w-[120px]">
                     <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Total</p>
                     <p className="text-2xl font-black text-blue-700">{currentResult.total}<span className="text-sm text-blue-400">/{currentResult.fullTotal}</span></p>
                  </div>
                  <div className="bg-purple-50 px-5 py-3 rounded-2xl border border-purple-100 text-center flex-1 min-w-[120px]">
                     <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1">Percentage</p>
                     <p className="text-2xl font-black text-purple-700">{currentResult.percentage.toFixed(1)}%</p>
                  </div>
                  <div className="bg-emerald-50 px-5 py-3 rounded-2xl border border-emerald-100 text-center flex-1 min-w-[120px]">
                     <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Grade</p>
                     <p className="text-2xl font-black text-emerald-600">{currentResult.grade}</p>
                  </div>
                  <div className="bg-amber-50 px-5 py-3 rounded-2xl border border-amber-100 text-center flex-1 min-w-[120px]">
                     <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">GPA</p>
                     <p className="text-2xl font-black text-amber-600">
                        {(() => {
                             const subjects = Object.values(currentResult.subjects) as any[];
                             if (subjects.length === 0) return '0.0';
                             const totalGpa = subjects.reduce((acc, marks) => acc + getGradeInfo(marks.obtained, marks.fullMarks).gpa, 0);
                             return (totalGpa / subjects.length).toFixed(1);
                        })()}
                     </p>
                  </div>
               </div>
            </div>

            {/* SUBJECT TABLE */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
               <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="text-primary border-b border-gray-100">
                      <tr>
                        <th className="p-4 font-black text-gray-600">Subject</th>
                        <th className="p-4 font-black text-gray-600 text-center">Full Marks</th>
                        <th className="p-4 font-black text-gray-600 text-center">Obtained</th>
                        <th className="p-4 font-black text-gray-600 text-center">Grade</th>
                        <th className="p-4 font-black text-gray-600 text-center">GPA</th>
                        <th className="p-4 font-black text-gray-600">Pass/Fail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {Object.entries(currentResult.subjects).map(([subject, rawMarks]) => {
                         const marks: any = rawMarks;
                         const { grade, pass, gpa } = getGradeInfo(marks.obtained, marks.fullMarks);
                         return (
                            <tr key={subject} className="hover:bg-blue-50/20">
                              <td className="p-4 font-bold text-gray-800">{subject}</td>
                              <td className="p-4 text-center text-gray-500 font-medium">{marks.fullMarks}</td>
                              <td className="p-4 text-center font-black text-gray-900">{marks.obtained}</td>
                              <td className="p-4 text-center">
                                 <span className={`px-2 py-1 rounded text-xs font-bold ${ grade.includes('A') ? 'bg-green-100 text-green-700' : grade.includes('B') ? 'bg-blue-100 text-blue-700' : grade.includes('C') ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700' }`}>
                                    {grade}
                                 </span>
                              </td>
                              <td className="p-4 text-center font-bold text-gray-800">{gpa.toFixed(1)}</td>
                              <td className="p-4 font-bold">
                                 {pass ? <span className="text-green-600">✅ Pass</span> : <span className="text-red-600">❌ Fail</span>}
                              </td>
                            </tr>
                         );
                      })}
                      <tr className="text-primary font-black text-gray-900 border-t-2 border-gray-200">
                         <td className="p-4 uppercase">TOTAL</td>
                         <td className="p-4 text-center">{currentResult.fullTotal}</td>
                         <td className="p-4 text-center">{currentResult.total}</td>
                         <td className="p-4 text-center">{currentResult.grade}</td>
                         <td className="p-4 text-center text-primary">{(() => {
                             const subjects = Object.values(currentResult.subjects) as any[];
                             if (subjects.length === 0) return '0.0';
                             const totalGpa = subjects.reduce((acc, marks) => acc + getGradeInfo(marks.obtained, marks.fullMarks).gpa, 0);
                             return (totalGpa / subjects.length).toFixed(1);
                         })()}</td>
                         <td className="p-4">{currentResult.percentage >= 40 ? 'PASSED ✅' : 'FAILED ❌'}</td>
                      </tr>
                    </tbody>
                  </table>
               </div>
            </div>

            {/* PERFORMANCE BAR CHART & ANALYSIS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               {/* STATS CARDS PANEL */}
               <div className="lg:col-span-1 flex flex-col gap-4">
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between flex-1">
                     <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-full blur-2xl opacity-60"></div>
                     <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Class Standing</span>
                        <h4 className="text-3xl font-black text-indigo-950 mt-2">
                           {comparisonStats?.aboveAvgCount}<span className="text-sm font-bold text-gray-400"> / {comparisonStats?.totalSubjectsCount}</span>
                        </h4>
                        <p className="text-xs text-gray-500 font-semibold mt-2 leading-relaxed">
                           Subjects where you scored equal to or higher than the Class Average score.
                        </p>
                     </div>
                     <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2">
                        <span className="text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg text-xs font-bold">
                           Above Class Avg ✓
                        </span>
                     </div>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between flex-1">
                     <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full blur-2xl opacity-60"></div>
                     <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Peak Excellence</span>
                        <h4 className="text-xl font-black text-gray-900 mt-2 truncate">
                           {comparisonStats?.highestMarginSubject || 'N/A'}
                        </h4>
                        <p className="text-xs text-gray-500 font-semibold mt-2 leading-relaxed">
                           Your highest positive deviation is in <strong className="text-gray-800">{comparisonStats?.highestMarginSubject}</strong> with a margin of:
                        </p>
                     </div>
                     <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-2xl font-black text-emerald-600">
                           {comparisonStats && comparisonStats.highestMargin > -900 ? `+${comparisonStats.highestMargin.toFixed(1)}` : 'N/A'}
                        </span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                           Points Above Avg
                        </span>
                     </div>
                  </div>
               </div>

               {/* DETAILED BAR CHART CARD */}
               <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl opacity-50 -mr-10 -mt-10"></div>
                  <h3 className="font-black text-gray-800 mb-6 flex items-center gap-2 relative z-10">
                     <PieChartIcon className="w-5 h-5 text-indigo-500" /> 
                     Academic Performance & Marks Comparison
                  </h3>
                  <div className="h-72 w-full relative z-10">
                    <ResponsiveContainer width="100%" height={288}>
                       <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 5 }} barGap={6}>
                         <defs>
                           <linearGradient id="myMarksGrad" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="0%" stopColor="#4f46e5" stopOpacity={1}/>
                             <stop offset="100%" stopColor="#818cf8" stopOpacity={0.85}/>
                           </linearGradient>
                           <linearGradient id="hiMarksGrad" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="0%" stopColor="#10b981" stopOpacity={0.95}/>
                             <stop offset="100%" stopColor="#34d399" stopOpacity={0.7}/>
                           </linearGradient>
                           <linearGradient id="avgMarksGrad" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.95}/>
                             <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.7}/>
                           </linearGradient>
                         </defs>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.4} />
                         <XAxis dataKey="subject" tick={{fontSize: 10, fill: '#64748b', fontWeight: 600}} interval={0} axisLine={false} tickLine={false} dy={10} />
                         <YAxis tick={{fontSize: 11, fill: '#64748b', fontWeight: 600}} axisLine={false} tickLine={false} dx={-10} />
                         <Tooltip cursor={{fill: '#f8fafc', opacity: 0.5}} contentStyle={{borderRadius: '16px', border: 'none', backgroundColor: '#1e293b', color: '#fff', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', padding: '12px 16px', fontWeight: 'bold'}} itemStyle={{color: '#fff'}} labelStyle={{color: '#94a3b8', marginBottom: '4px', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.05em'}} />
                         <Legend wrapperStyle={{fontSize: '11px', fontWeight: 'bold', paddingTop: '16px'}} iconType="circle" iconSize={8} />
                         <Bar dataKey="highestMarks" name="Topper Score" fill="url(#hiMarksGrad)" radius={[5,5,5,5]} maxBarSize={16} />
                         <Bar dataKey="classAverage" name="Class Average" fill="url(#avgMarksGrad)" radius={[5,5,5,5]} maxBarSize={16} />
                         <Bar dataKey="myMarks" name="My Score" fill="url(#myMarksGrad)" radius={[5,5,5,5]} maxBarSize={16} />
                       </BarChart>
                    </ResponsiveContainer>
                  </div>
               </div>
            </div>

            {/* ACADEMIC HISTORY & TREND ANALYSIS */}
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden mt-6">
               <h3 className="font-black text-gray-800 mb-2 flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black tracking-widest uppercase">Academic History</span>
                  Progress Trend & Term Comparison
               </h3>
               <p className="text-xs text-gray-500 font-semibold mb-6">
                  Select any two terms to view your GPA progression, percentage improvements, and subject-by-subject deltas.
               </p>

               {results.length < 2 ? (
                  <div className="p-6 bg-gray-50/50 border border-dashed border-gray-200 rounded-2xl text-center text-sm font-bold text-gray-400">
                     Academic comparison requires at least two published terms. Currently only {results.length} term record is available.
                  </div>
               ) : (
                  <div className="space-y-6">
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                           <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Term A</label>
                           <select 
                              value={compareExamA || results[0]?.examType || ''}
                              onChange={(e) => setCompareExamA(e.target.value)}
                              className="border border-gray-200 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm cursor-pointer"
                           >
                              {results.map(r => (
                                 <option key={r.examType} value={r.examType}>{r.examType} (Class {r.class})</option>
                              ))}
                           </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                           <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Term B (Compare Against)</label>
                           <select 
                              value={compareExamB || results[results.length - 1]?.examType || ''}
                              onChange={(e) => setCompareExamB(e.target.value)}
                              className="border border-gray-200 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm cursor-pointer"
                           >
                              {results.map(r => (
                                 <option key={r.examType} value={r.examType}>{r.examType} (Class {r.class})</option>
                              ))}
                           </select>
                        </div>
                     </div>

                     {(() => {
                        const examA = results.find(r => r.examType === (compareExamA || results[0]?.examType));
                        const examB = results.find(r => r.examType === (compareExamB || results[results.length - 1]?.examType));
                        
                        if (!examA || !examB) return null;

                        const gpaA = examA.gpa || 0;
                        const gpaB = examB.gpa || 0;
                        const gpaDiff = gpaB - gpaA;

                        const pctA = examA.percentage || 0;
                        const pctB = examB.percentage || 0;
                        const pctDiff = pctB - pctA;

                        const rankA = examA.rank || 0;
                        const rankB = examB.rank || 0;
                        const rankDiff = rankA - rankB; 

                        return (
                           <div className="space-y-5 pt-2">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                 <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 flex flex-col justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">GPA Transition</span>
                                    <div className="flex items-baseline justify-between mt-2">
                                       <span className="text-lg font-black text-gray-900">{gpaA.toFixed(2)} → {gpaB.toFixed(2)}</span>
                                       <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${gpaDiff >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                          {gpaDiff >= 0 ? `+${gpaDiff.toFixed(2)}` : gpaDiff.toFixed(2)}
                                       </span>
                                    </div>
                                 </div>
                                 <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 flex flex-col justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Percentage Shift</span>
                                    <div className="flex items-baseline justify-between mt-2">
                                       <span className="text-lg font-black text-gray-900">{pctA.toFixed(1)}% → {pctB.toFixed(1)}%</span>
                                       <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${pctDiff >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                          {pctDiff >= 0 ? `+${pctDiff.toFixed(1)}%` : `${pctDiff.toFixed(1)}%`}
                                       </span>
                                    </div>
                                 </div>
                                 <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 flex flex-col justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Class Rank Standing</span>
                                    <div className="flex items-baseline justify-between mt-2">
                                       <span className="text-lg font-black text-gray-900">Rank #{rankA || '-'} → #{rankB || '-'}</span>
                                       {rankA && rankB ? (
                                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${rankDiff >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                             {rankDiff >= 0 ? `▲ Improved by ${rankDiff}` : `▼ Dropped by ${Math.abs(rankDiff)}`}
                                          </span>
                                       ) : (
                                          <span className="text-[10px] text-gray-400 font-bold">N/A</span>
                                       )}
                                    </div>
                                 </div>
                              </div>

                              <div className="border border-gray-100 rounded-2xl overflow-hidden">
                                 <div className="bg-gray-50 border-b border-gray-100 p-4 font-black text-gray-600 uppercase tracking-wider text-[10px] grid grid-cols-4">
                                    <span className="col-span-2">Subject</span>
                                    <span className="text-center">{examA.examType}</span>
                                    <span className="text-center">{examB.examType}</span>
                                 </div>
                                 <div className="divide-y divide-gray-50 text-xs font-semibold text-gray-700">
                                    {Object.keys(examB.subjects).map(sub => {
                                       const marksA = examA.subjects[sub]?.obtained;
                                       const marksB = examB.subjects[sub]?.obtained;

                                       const numA = marksA === 'AB' ? 0 : Number(marksA) || 0;
                                       const numB = marksB === 'AB' ? 0 : Number(marksB) || 0;
                                       const delta = numB - numA;

                                       return (
                                          <div key={sub} className="p-4 grid grid-cols-4 items-center hover:bg-gray-50/30">
                                             <span className="col-span-2 font-bold text-gray-800">{sub}</span>
                                             <span className="text-center text-gray-500 font-bold">{marksA || '-'}</span>
                                             <span className="text-center text-gray-900 font-black flex items-center justify-center gap-1.5">
                                                {marksB || '-'}
                                                {marksA && marksB && (
                                                   <span className={`text-[10px] font-black ${delta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                      ({delta >= 0 ? `+${delta}` : delta})
                                                   </span>
                                                )}
                                             </span>
                                          </div>
                                       );
                                    })}
                                 </div>
                              </div>
                           </div>
                        );
                     })()}
                  </div>
               )}
            </div>

            {/* 🏆 TOPPER COMPARISON & INSIGHTS */}
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden mt-6">
               <h3 className="font-black text-gray-800 mb-2 flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black tracking-widest uppercase">Topper Comparison</span>
                  🏆 Subject Topper Performance Analysis
               </h3>
               <p className="text-xs text-gray-500 font-semibold mb-6">
                  See exactly how your score measures against the highest mark scored in each subject across the entire grade.
               </p>

               <div className="space-y-6">
                  {currentResult && Object.entries(currentResult.subjects).map(([subject, rawMarks]) => {
                     const marks: any = rawMarks;
                     const myScore = marks.obtained === "AB" ? 0 : Number(marks.obtained) || 0;
                     
                     const topperScore = (() => {
                        const matchVal = currentResult.highestMarks?.[subject];
                        if (matchVal === undefined || isNaN(matchVal) || matchVal < myScore) {
                           return myScore;
                        }
                        return Number(matchVal);
                     })();

                     const fullMarks = marks.fullMarks || 100;
                     const gap = topperScore - myScore;

                     const myPercentage = (myScore / fullMarks) * 100;
                     const topperPercentage = (topperScore / fullMarks) * 100;

                     return (
                        <div key={subject} className="p-4 rounded-2xl bg-gray-50/30 border border-gray-100 hover:border-gray-200 transition-all">
                           <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                              <div>
                                 <span className="font-black text-gray-800 text-sm">{subject}</span>
                                 <span className="text-[10px] text-gray-400 font-bold ml-2">Full Marks: {fullMarks}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                 {gap === 0 ? (
                                    <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg">
                                       🎉 Class Topper!
                                    </span>
                                 ) : (
                                    <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg">
                                       Gap to Topper: -{gap} Marks
                                    </span>
                                 )}
                              </div>
                           </div>

                           <div className="space-y-2">
                              <div className="space-y-1">
                                 <div className="flex justify-between text-[10px] font-semibold text-gray-400">
                                    <span>Class Topper Score</span>
                                    <span>{topperScore} / {fullMarks}</span>
                                 </div>
                                 <div className="w-full bg-gray-200/60 rounded-full h-1.5 overflow-hidden">
                                    <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${topperPercentage}%` }}></div>
                                 </div>
                              </div>

                              <div className="space-y-1">
                                 <div className="flex justify-between text-[10px] font-black text-gray-600">
                                    <span>My Score</span>
                                    <span>{marks.obtained} / {fullMarks}</span>
                                 </div>
                                 <div className="w-full bg-gray-200/60 rounded-full h-2 overflow-hidden">
                                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${myPercentage}%` }}></div>
                                 </div>
                              </div>
                           </div>
                        </div>
                     );
                  })}
               </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end mt-4 gap-3">
               {localStorage.getItem('userRole') !== 'student' && (
                 <div className="flex bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                   <button onClick={downloadClassResultExcel} className="text-gray-700 bg-white px-4 py-3 font-bold flex items-center justify-center gap-2 transition-all hover:bg-gray-50 border-r border-gray-200">
                     <Download className="w-4 h-4 text-green-600" />
                     Class Result (Excel)
                   </button>
                   <button onClick={downloadClassResultPDF} className="text-gray-700 bg-white px-4 py-3 font-bold flex items-center justify-center gap-2 transition-all hover:bg-gray-50">
                     <Download className="w-4 h-4 text-red-600" />
                     Class Result (PDF)
                   </button>
                 </div>
               )}
               <button onClick={downloadPDFReport} disabled={generatingPdf} className={`text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 ${generatingPdf ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
                 {generatingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                 {generatingPdf ? 'Generating...' : '📄 Download My Report Card'}
               </button>
            </div>
          </>
      )}

      {/* Hidden Print Container for PDF */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
         {currentResult && (
            <ReportCardTemplate 
               ref={pdfRef} 
               student={currentResult} 
            />
         )}
      </div>
    </div>
  );
}
