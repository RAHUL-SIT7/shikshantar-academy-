import React, { forwardRef } from 'react';
import { formatBSDate } from '../../lib/nepaliDate';
import signatureImg from '../../assets/signature.svg';

const logoImage = "https://i.postimg.cc/nc9G7pRB/image.png";

interface ReportCardProps {
  student: any;
}

export const ReportCardTemplate = forwardRef<HTMLDivElement, ReportCardProps>(
  ({ student }, ref) => {
    
    const percentage = student.percentage || 0;
    
    let behaviorGrade = "B";
    let autoRemark = "";

    if (percentage >= 90) {
       behaviorGrade = "A+";
       autoRemark = "Outstanding performance. Keep it up!";
    } else if (percentage >= 80) {
       behaviorGrade = "A";
       autoRemark = "Excellent effort. Keep up the good work.";
    } else if (percentage >= 70) {
       behaviorGrade = "B+";
       autoRemark = "Very good. You are capable of achieving even more.";
    } else if (percentage >= 60) {
       behaviorGrade = "B";
       autoRemark = "Good. Try to focus more and improve your grades.";
    } else if (percentage >= 50) {
       behaviorGrade = "C+";
       autoRemark = "Above satisfactory, but needs more focus and hard work.";
    } else if (percentage >= 40) {
       behaviorGrade = "C";
       autoRemark = "Acceptable. Need significant improvement in studies. Try your best.";
    } else {
       behaviorGrade = "D";
       autoRemark = "Poor performance. Requires special attention and hard work. Do well.";
    }

    const behaviorTraits = [
       { name: 'i. CONDUCT', grade: behaviorGrade },
       { name: 'ii. DISCIPLINE & MANNERISM', grade: behaviorGrade },
       { name: 'iii. NEATNESS', grade: behaviorGrade },
       { name: 'iv. APPLICATION IN STUDIES', grade: percentage >= 70 ? 'A' : (percentage >= 50 ? 'B' : 'C') },
       { name: 'v. GAMES & SPORTS', grade: 'B+' },
       { name: 'vi. HAND WRITING', grade: percentage >= 60 ? 'A' : 'B' },
       { name: 'vii. SPEAKING', grade: behaviorGrade },
    ];

    return (
      <div ref={ref} className="bg-white p-4 w-[210mm] h-[297mm] mx-auto text-gray-900 font-sans relative flex flex-col shadow-lg print:shadow-none box-border">
         {/* Decorative Border Layer */}
         <div className="border-[3px] text-primary border-[#1a2b4c] rounded-sm flex-1 flex flex-col p-1 relative z-0 h-[calc(297mm-2rem)] box-border">
            <div className="border border-[#1a2b4c] text-primary rounded-sm flex-1 flex flex-col relative z-0 overflow-hidden box-border">
               
               {/* Background Watermark Logo */}
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                  <img src={logoImage} alt="Watermark" className="w-[450px] h-[450px] object-contain opacity-[0.08]" />
               </div>

               <div className="relative z-10 flex flex-col h-full p-6 flex-1 box-border">
            
            {/* Header */}
            <div className="flex flex-row justify-between items-center mb-4 pb-4 border-b-2 border-[#1a2b4c] text-primary">
                <img src={logoImage} alt="Shikshantar Academy Logo" className="w-24 h-24 object-contain" />
                <div className="text-center flex-1 pr-10">
                   <h1 className="text-4xl font-black text-[#1a2b4c] uppercase tracking-wider mb-1">
                     Shikshantar Academy
                   </h1>
                   <h2 className="text-sm font-bold text-gray-600 tracking-widest uppercase mb-1">
                     Karjanhana Municipality, Bastipur-5, Siraha, Nepal
                   </h2>
                   <div className="inline-block mt-2 bg-[#1a2b4c] text-white px-6 py-1.5 rounded-full shadow-sm">
                      <span className="text-xs uppercase tracking-[0.2em] font-bold">
                        Academic Progress Report
                      </span>
                   </div>
                </div>
            </div>

            <div className="text-center font-black text-xl mb-4 text-[#1a2b4c] uppercase tracking-widest py-2 border border-blue-100 rounded">
               {student.examType} - 2082
            </div>

            {/* Student Info Card */}
            <div className="border-[#1a2b4c] text-primary border rounded-lg p-3 mb-4 grid grid-cols-2 gap-y-2 text-sm font-bold uppercase tracking-wide flex-none">
                <div className="col-span-2 md:col-span-1 border-r border-[#1a2b4c]/10">Name: <span className="font-bold text-[#1a2b4c] ml-2 text-base normal-case">{student.studentName}</span></div>
                <div className="col-span-2 md:col-span-1 pl-4">Class: <span className="font-bold text-[#1a2b4c] ml-2">{student.class}</span></div>
                <div className="col-span-2 md:col-span-1 border-r border-[#1a2b4c]/10 pt-2 border-t border-[#1a2b4c]/10">Regd No: <span className="font-bold text-[#1a2b4c] ml-2">{student.studentId || student.rollNo}</span></div>
                <div className="col-span-2 md:col-span-1 pl-4 pt-2 border-t border-[#1a2b4c]/10">Roll No: <span className="font-bold text-[#1a2b4c] ml-2">{student.rollNo || '-'}</span></div>
            </div>

            {/* Marks Table */}
            <div className="rounded-none border border-[#1a2b4c] mb-4 flex-none box-border">
               <table className="w-full border-collapse text-[11px] text-[#1a2b4c]">
                  <thead className="bg-[#f0a4c2] text-[#1a2b4c]">
                     <tr>
                        <th className="border border-[#1a2b4c] p-2 w-10 text-center" rowSpan={2}>S.N.</th>
                        <th className="border border-[#1a2b4c] p-2 text-left" rowSpan={2}>Subject</th>
                        <th className="border border-[#1a2b4c] p-2 w-16 text-center" rowSpan={2}>Full Mark</th>
                        <th className="border border-[#1a2b4c] p-2 w-16 text-center" rowSpan={2}>Pass Mark</th>
                        <th className="border border-[#1a2b4c] p-2 text-center" colSpan={2}>Marked Obtained</th>
                     </tr>
                     <tr>
                        <th className="border border-[#1a2b4c] p-1 w-20 text-center font-normal">Theory</th>
                        <th className="border border-[#1a2b4c] p-1 w-20 text-center font-normal">Practical</th>
                     </tr>
                  </thead>
                     <tbody className="bg-transparent bg-pink-50/20">
                     {Object.entries(student.subjects).map(([sub, rawMarks], i) => {
                         const marks: any = rawMarks;
                         const fm = marks.fullMarks;
                         const pm = marks.thPass !== undefined ? (marks.thPass + (marks.prPass || 0)) : Math.round(fm * 0.4);
                         
                         const displayTh = marks.thMarks !== undefined ? marks.thMarks : marks.obtained;
                         const displayPr = marks.prMarks !== undefined ? marks.prMarks : '-';

                         return (
                            <tr key={sub}>
                               <td className="border border-[#1a2b4c]/50 p-2 text-center">{i+1}.</td>
                               <td className="border border-[#1a2b4c]/50 p-2 font-bold">{sub}</td>
                               <td className="border border-[#1a2b4c]/50 p-2 text-center text-[10px]">
                                   {fm}
                               </td>
                               <td className="border border-[#1a2b4c]/50 p-2 text-center text-[10px]">
                                   {pm}
                               </td>
                               <td className="border border-[#1a2b4c]/50 p-2 text-center font-bold">{displayTh}</td>
                               <td className="border border-[#1a2b4c]/50 p-2 text-center font-bold text-gray-600">{displayPr}</td>
                            </tr>
                         );
                     })}
                  </tbody>
               </table>
            </div>

            {/* Performance Stats Cards */}
            <div className="grid grid-cols-4 gap-3 mb-4 flex-none box-border">
                <div className="border border-[#1a2b4c] rounded-lg p-2 text-center shadow-sm">
                   <p className="text-[#a0aabf] text-[9px] font-black uppercase tracking-widest mb-1">Total Marks</p>
                   <p className="text-lg font-black text-[#1a2b4c]">{student.total}</p>
                </div>
                <div className="border border-[#1a2b4c] rounded-lg p-2 text-center shadow-sm">
                   <p className="text-[#a0aabf] text-[9px] font-black uppercase tracking-widest mb-1">Percentage</p>
                   <p className="text-lg font-black text-[#1a2b4c]">{student.percentage?.toFixed(2)}%</p>
                </div>
                <div className="border border-[#1a2b4c] rounded-lg p-2 text-center shadow-sm">
                   <p className="text-[#a0aabf] text-[9px] font-black uppercase tracking-widest mb-1">Rank</p>
                   <p className="text-lg font-black text-[#1a2b4c]">{student.rank || '-'}</p>
                </div>
                <div className="border border-[#1a2b4c] rounded-lg p-2 text-center shadow-sm">
                   <p className="text-[#a0aabf] text-[9px] font-black uppercase tracking-widest mb-1">Final Grade</p>
                   <p className="text-lg font-black text-[#1a2b4c]">{student.grade}</p>
                </div>
            </div>

            {/* Traits and Performance Table */}
            <div className="flex gap-4 flex-none box-border min-h-0">
               {/* left: Traits */}
               <div className="border border-gray-300 rounded-lg overflow-hidden flex-[0.45] flex flex-col">
                  <div className="px-4 py-2 bg-white border-b border-gray-200 shrink-0">
                     <h3 className="text-xs font-black text-[#6b7280] uppercase tracking-widest">Traits & Behavioral</h3>
                  </div>
                  <div className="flex flex-col flex-1 bg-white p-3 justify-between">
                     <div className="flex flex-col space-y-2.5">
                         {behaviorTraits.map((trait, idx) => (
                             <div key={idx} className="flex justify-between items-center border-b border-gray-100 pb-1 last:border-0 last:pb-0">
                                <span className="text-[10px] font-bold text-[#1a2b4c]">{trait.name}</span>
                                <span className="text-[10px] font-black text-[#1a2b4c]">{trait.grade}</span>
                             </div>
                         ))}
                     </div>
                     <div className="pt-3 mt-auto">
                         <span className="font-bold italic text-[#1a2b4c] text-[11px]">Remarks: {student.classTeacherRemark || autoRemark}</span>
                     </div>
                  </div>
               </div>

               {/* Right: Performance Grade mapping */}
               <div className="border border-[#1a2b4c] rounded-lg overflow-hidden flex-[0.55] flex flex-col">
                   <table className="w-full text-left bg-white text-[10px] border-collapse h-full">
                      <thead className="bg-[#1a2b4c] text-white">
                         <tr>
                            <th className="px-3 py-2 font-bold uppercase tracking-widest">Performance</th>
                            <th className="px-3 py-2 font-bold uppercase tracking-widest text-center">Grade</th>
                            <th className="px-3 py-2 font-bold uppercase tracking-widest text-center">Percentage</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-bold text-[#1a2b4c]">
                         {[
                           ['Outstanding', 'A+', '90% & above'],
                           ['Excellent', 'A', '80% to 89%'],
                           ['Very good', 'B+', '70% to 79%'],
                           ['Good', 'B', '60% to 69%'],
                           ['Satisfactory', 'C+', '50% to 59%'],
                           ['Acceptable', 'C', '40% to 49%'],
                           ['Partially acceptable', 'D+', '30% to 39%'],
                           ['Insufficient', 'D', '20% to 29%'],
                           ['Very insufficient', 'E', '19% and below'],
                         ].map((row, i) => (
                           <tr key={i}>
                             <td className="px-3 py-1.5">{row[0]}</td>
                             <td className="px-3 py-1.5 text-center">{row[1]}</td>
                             <td className="px-3 py-1.5 text-center text-gray-500">{row[2]}</td>
                           </tr>
                         ))}
                      </tbody>
                   </table>
               </div>
            </div>

            {/* Spacer to push signature to bottom */}
            <div className="flex-1 min-h-[20px]"></div>

            {/* Footer with Signatures */}
            <div className="flex justify-between items-end px-2 pt-6 shrink-0 box-border border-t border-gray-100 mt-4">
               <div className="flex flex-col items-center">
                  <div className="font-bold italic text-[#1a2b4c] text-[12px] mb-2">{formatBSDate(new Date())}</div>
                  <div className="w-32 border-b-2 border-[#1a2b4c]"></div>
                  <div className="mt-1 font-bold text-[#1a2b4c] text-[10px] uppercase">Date</div>
               </div>
               
               <div className="flex flex-col items-center">
                  <div className="w-32 border-b-2 border-[#1a2b4c] mt-8"></div>
                  <div className="mt-1 font-bold text-[#1a2b4c] text-[10px] uppercase">Class Teacher</div>
               </div>

               <div className="flex flex-col items-center">
                  <div className="w-32 border-b-2 border-[#1a2b4c] mt-8"></div>
                  <div className="mt-1 font-bold text-[#1a2b4c] text-[10px] uppercase">Principal</div>
               </div>
            </div>

         </div>
         </div>
         </div>
      </div>
    );
  }
);

