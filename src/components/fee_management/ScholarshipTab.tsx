import React, { useState } from 'react';
import { Search, Edit2, Trash2, Plus, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

export default function ScholarshipTab({ studentsData, onRefresh }: { studentsData: any[], onRefresh?: () => void }) {
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('All');
  
  const updateLedgersForStudent = async (studentId: string, newScholarshipStatus: string, newScholarshipAmount: number) => {
     try {
         const q = query(collection(db, 'studentFees'), where('studentId', '==', studentId));
         const snaps = await getDocs(q);
         const updates = snaps.docs.map(feeDoc => {
             const data = feeDoc.data();
             if (data.status === 'due' && data.month !== 'Admission Fee') {
                 const brk = data.breakdown || {};
                 let tuition = Number(brk.tuition || 0);
                 let exam = Number(brk.exam || 0);
                 let computer = Number(brk.computer || 0);
                 let transport = Number(brk.transport || 0);
                 let other = Number(brk.other || 0);
                 let scholarship = newScholarshipStatus === 'Provided' ? newScholarshipAmount : 0;
                 let total = Math.max(0, tuition + exam + computer + transport + other - scholarship);
                 return updateDoc(feeDoc.ref, {
                     totalFee: total,
                     dueAmount: total - Number(data.paidAmount || 0),
                     breakdown: { tuition, exam, computer, transport, other, scholarship }
                 });
             }
             return Promise.resolve();
         });
         await Promise.all(updates);
     } catch (err) {
         console.warn("Failed to update ledgers:", err);
     }
  };
  
  const scrollTableById = (id: string, direction: 'left' | 'right') => {
    const el = document.getElementById(id);
    if (el) {
      const scrollAmount = 250;
      el.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };
  
  // Edit existing modal
  const [editModalStudent, setEditModalStudent] = useState<any | null>(null);
  const [editDiscount, setEditDiscount] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Add new modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addClass, setAddClass] = useState('');
  const [addSection, setAddSection] = useState('');
  const [addStudentId, setAddStudentId] = useState('');
  const [addDiscount, setAddDiscount] = useState('');
  const [addDescription, setAddDescription] = useState('');

  // Filter only scholarship students
  const scholarshipStudents = studentsData.filter(s => s.scholarshipStatus === 'Provided');
  
  const totalDiscount = scholarshipStudents.reduce((sum, s) => sum + (Number(s.scholarshipAmount) || 0), 0);

  // Group by class
  const groupedByClass = scholarshipStudents.reduce((acc, student) => {
    const className = student.class || 'Unassigned';
    if (!acc[className]) acc[className] = [];
    acc[className].push(student);
    return acc;
  }, {} as Record<string, any[]>);

  // Filter based on search (either student name or class)
  const matchesSearch = (student: any) => {
    if (filterClass !== 'All' && student.class !== filterClass) return false;
    
    if (!search) return true;
    const s = search.toLowerCase();
    return (
       (student.name && student.name.toLowerCase().includes(s)) ||
       (student.id && student.id.toLowerCase().includes(s)) ||
       (student.fullName && student.fullName.toLowerCase().includes(s))
    );
  };


  const sortedClasses = Object.keys(groupedByClass).sort((a, b) => {
    const aNum = parseInt(a);
    const bNum = parseInt(b);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    return a.localeCompare(b);
  });

  const handleUpdateScholarship = async () => {
     if (!editModalStudent) return;
     try {
        const studentRef = doc(db, 'users', editModalStudent.id);
        const amount = Number(editDiscount);
        
        let updateData: any;
        if (amount <= 0) {
           updateData = {
              scholarshipStatus: 'None',
              scholarshipAmount: 0,
              scholarshipDescription: ''
           };
        } else {
           updateData = {
              scholarshipStatus: 'Provided',
              scholarshipAmount: amount,
              scholarshipDescription: editDescription
           };
        }

        await updateDoc(studentRef, updateData);
        await updateLedgersForStudent(editModalStudent.id, updateData.scholarshipStatus, updateData.scholarshipAmount);
        
        setEditModalStudent(null);
        if (onRefresh) onRefresh();
     } catch (err) {
        console.error("Failed to update scholarship", err);
        alert("Failed to update scholarship");
     }
  };

  const handleAddScholarship = async () => {
     if (!addStudentId) return alert("Please select a student");
     try {
        const studentRef = doc(db, 'users', addStudentId);
        const amount = Number(addDiscount);
        
        let updateData: any;
        if (amount <= 0) {
           return alert("Discount amount must be greater than 0");
        } else {
           updateData = {
              scholarshipStatus: 'Provided',
              scholarshipAmount: amount,
              scholarshipDescription: addDescription
           };
        }

        await updateDoc(studentRef, updateData);
        await updateLedgersForStudent(addStudentId, updateData.scholarshipStatus, updateData.scholarshipAmount);
        
        setIsAddModalOpen(false);
        setAddClass('');
        setAddSection('');
        setAddStudentId('');
        setAddDiscount('');
        setAddDescription('');
        if (onRefresh) onRefresh();
     } catch (err) {
        console.error("Failed to add scholarship", err);
        alert("Failed to add scholarship");
     }
  };

  const handleRemoveScholarship = async (student: any) => {
     if (window.confirm(`Are you sure you want to remove the scholarship for ${student.name}?`)) {
        try {
           const studentRef = doc(db, 'users', student.id);
           await updateDoc(studentRef, {
               scholarshipStatus: 'None',
               scholarshipAmount: 0,
               scholarshipDescription: ''
           });
           await updateLedgersForStudent(student.id, 'None', 0);
           
           if (onRefresh) onRefresh();
        } catch (err) {
           console.error("Failed to remove scholarship", err);
           alert("Failed to remove scholarship");
        }
     }
  };

  // Eligible students for "Add Scholarship" modal
  const eligibleStudents = studentsData.filter(s => 
    s.role === 'student' && 
    s.scholarshipStatus !== 'Provided' && 
    (addClass ? s.class === addClass : true) &&
    (addSection ? s.section === addSection : true)
  );

  return (
    <div className="space-y-6">
       <div className="flex flex-col md:flex-row gap-4 items-stretch mb-6">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
             <div className="relative rounded-2xl group transition-all duration-300">
               {/* Outer Glow Bloom aura */}
               <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-30 blur-2xl transition-all duration-500 rounded-2xl -z-10 group-hover:scale-102 pointer-events-none" />

               {/* Boundary box with rotating gradient for lightning border effect */}
               <div className="relative w-full h-full rounded-2xl overflow-hidden p-[2.5px] bg-gray-150 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-sm">
                 {/* Spinning lightning border */}
                 <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_4s_linear_infinite] opacity-25 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

                 {/* Inner masked content card */}
                 <div className="relative w-full h-full bg-purple-50 p-5 rounded-[14px] flex flex-col justify-center overflow-hidden z-10">
                   <div className="absolute -right-4 -top-4 w-24 h-24 bg-purple-200 rounded-full opacity-50 group-hover:scale-110 transition-transform duration-500 z-0"></div>
                   <p className="text-xs font-bold text-purple-800 uppercase tracking-widest mb-1 relative z-10">Total Discount / Month</p>
                   <p className="text-3xl font-black text-purple-900 relative z-10">NRs. {totalDiscount.toLocaleString()}</p>
                 </div>
               </div>
             </div>

             <div className="relative rounded-2xl group transition-all duration-300">
               {/* Outer Glow Bloom aura */}
               <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-30 blur-2xl transition-all duration-500 rounded-2xl -z-10 group-hover:scale-102 pointer-events-none" />

               {/* Boundary box with rotating gradient for lightning border effect */}
               <div className="relative w-full h-full rounded-2xl overflow-hidden p-[2.5px] bg-gray-150 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-sm">
                 {/* Spinning lightning border */}
                 <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_4s_linear_infinite] opacity-25 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

                 {/* Inner masked content card */}
                 <div className="relative w-full h-full bg-emerald-50 p-5 rounded-[14px] flex flex-col justify-center overflow-hidden z-10">
                   <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-200 rounded-full opacity-50 group-hover:scale-110 transition-transform duration-500 z-0"></div>
                   <p className="text-xs font-bold text-emerald-800 uppercase tracking-widest mb-1 relative z-10">Total Sponsored</p>
                   <p className="text-3xl font-black text-emerald-900 relative z-10">{scholarshipStudents.length} <span className="text-sm font-bold text-emerald-700">Students</span></p>
                 </div>
               </div>
             </div>
           </div>
           
           <div className="relative rounded-2xl group transition-all duration-300 md:w-64 cursor-pointer"
                onClick={() => setIsAddModalOpen(true)}>
             {/* Outer Glow Bloom aura */}
             <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-35 blur-2xl transition-all duration-500 rounded-2xl -z-10 group-hover:scale-105 pointer-events-none" />

             {/* Boundary box with rotating gradient for lightning border effect */}
             <div className="relative w-full h-full rounded-2xl overflow-hidden p-[2.5px] bg-transparent flex flex-col shadow-md">
               {/* Spinning lightning border */}
               <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_4s_linear_infinite] opacity-35 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

               {/* Inner masked content card */}
               <div className="relative w-full h-full bg-gradient-to-br from-[#1a2b4c] to-[#2546a3] p-6 rounded-[14px] flex flex-col items-center justify-center text-white z-10 overflow-hidden flex-1">
                 <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-3">
                     <Plus className="w-6 h-6 text-white"/>
                 </div>
                 <h3 className="font-black tracking-widest uppercase text-sm">Add New</h3>
                 <p className="text-xs text-blue-100 text-center mt-1">Assign a new scholarship to a student</p>
               </div>
             </div>
           </div>
       </div>

       <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
         <div className="relative flex-1 w-full sm:max-w-sm">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by name or ID..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium text-sm"
            />
         </div>
         <select 
              value={filterClass}
              onChange={e => setFilterClass(e.target.value)}
              className="bg-white border w-full sm:w-auto border-gray-200 rounded-lg px-4 py-2 text-sm font-bold text-gray-600 focus:outline-none shrink-0 min-h-[40px]"
            >
              <option value="All">Class: All</option>
              {['Play Group', 'Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(c => (
                <option key={c} value={c}>Class {c}</option>
              ))}
         </select>
       </div>

       {scholarshipStudents.length === 0 ? (
         <div className="p-10 text-center text-gray-500 font-bold border border-dashed border-gray-300 bg-gray-50 rounded-xl">
           <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
               <Info className="w-8 h-8 text-gray-400"/>
           </div>
           No students are currently enrolled with a scholarship.
         </div>
       ) : (
         <div className="space-y-8">
           {sortedClasses.map(className => {
             const studentsInClass = groupedByClass[className].filter(matchesSearch);
             if (studentsInClass.length === 0) return null;

             return (
              <div key={className} className="relative rounded-xl group transition-all duration-300 max-w-full min-w-0">
                {/* Outer Glow Bloom aura */}
                <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-30 blur-2xl transition-all duration-500 rounded-xl -z-10 group-hover:scale-102 pointer-events-none" />

                {/* Boundary box with rotating gradient for lightning border effect */}
                <div className="relative w-full h-full rounded-xl overflow-hidden p-[2.5px] bg-gray-150 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-sm max-w-full min-w-0">
                  {/* Spinning lightning border */}
                  <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_4s_linear_infinite] opacity-25 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

                  {/* Inner masked content card */}
                  <div className="relative w-full h-full bg-white rounded-[10px] flex flex-col z-10 overflow-hidden flex-1 max-w-full min-w-0">
                 <div className="bg-purple-50 px-6 py-3 border-b border-purple-100 flex justify-between items-center">
                   <h3 className="font-black text-purple-900 uppercase tracking-wider text-sm">Class {className}</h3>
                 </div>
                 
                 {/* Mobile-only Horizontal scroll helper buttons */}
                 <div className="flex md:hidden justify-end items-center gap-2 px-6 py-2 text-purple-500 border-b border-purple-100 bg-purple-50/20">
                   <span className="text-xs font-bold tracking-wider text-purple-900">Scroll table:</span>
                   <button 
                     type="button"
                     onClick={() => scrollTableById(`scholarship-table-${className}`, 'left')}
                     className="p-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-700 active:scale-95 transition-all"
                     aria-label="Scroll table left"
                   >
                     <ChevronLeft className="w-4 h-4" />
                   </button>
                   <button 
                     type="button"
                     onClick={() => scrollTableById(`scholarship-table-${className}`, 'right')}
                     className="p-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-700 active:scale-95 transition-all"
                     aria-label="Scroll table right"
                   >
                     <ChevronRight className="w-4 h-4" />
                   </button>
                 </div>

                 <div className="relative w-full max-w-full">
                    {/* Scroll fade overlay indicator */}
                    <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-white to-transparent pointer-events-none z-10 md:hidden flex items-center justify-end pr-2 text-purple-600">
                      <ChevronRight className="w-5 h-5 animate-pulse" />
                    </div>
                    <div id={`scholarship-table-${className}`} className="overflow-x-auto custom-scrollbar pb-2 w-full max-w-full">
                   <table className="w-full text-left whitespace-nowrap min-w-[800px]">
                     <thead className="text-primary text-gray-500 text-xs uppercase tracking-widest font-black border-b border-gray-100">
                         <tr>
                         <th className="p-4 pl-6">Student ID</th>
                         <th className="p-4">Name</th>
                         <th className="p-4">Description</th>
                         <th className="p-4 text-right">Discount</th>
                         <th className="p-4 text-center">Net Fee</th>
                         <th className="p-4 text-right pr-6">Manage</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                       {studentsInClass.map(student => (
                         <tr key={student.id} className="hover:bg-purple-50/30 transition-colors group">
                           <td className="p-4 pl-6 font-mono text-xs font-bold text-gray-600">{student.id}</td>
                           <td className="p-4 font-bold text-gray-900">{student.name}</td>
                           <td className="p-4 text-gray-500 text-sm max-w-[200px] truncate" title={student.scholarshipDescription}>{student.scholarshipDescription || <span className="italic text-gray-300">No reason specified</span>}</td>
                           <td className="p-4 font-black justify-end text-purple-600 text-right">NRs. {student.scholarshipAmount ? Number(student.scholarshipAmount) : 0}</td>
                           <td className="p-4 font-black justify-center text-emerald-600 text-center bg-gray-50/50">NRs. {student.monthlyFee}</td>
                           <td className="p-4 text-right pr-6">
                               <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                   <button onClick={() => { setEditModalStudent(student); setEditDiscount(String(student.scholarshipAmount || 0)); setEditDescription(student.scholarshipDescription || ''); }} className="p-2 bg-white shadow text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors border border-gray-200 hover:border-purple-200" title="Edit Discount"><Edit2 className="w-4 h-4"/></button>
                                   <button onClick={() => handleRemoveScholarship(student)} className="p-2 bg-white shadow text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-gray-200 hover:border-red-200" title="Revoke Scholarship"><Trash2 className="w-4 h-4"/></button>
                               </div>
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
               </div>
                   </div>
                 </div>
               </div>
             );
           })}
           {sortedClasses.every(className => groupedByClass[className].filter(matchesSearch).length === 0) && search && (
              <div className="p-10 text-center text-gray-500 font-bold border border-dashed border-gray-300 bg-gray-50 rounded-xl">
                No scholarship students found matching "{search}".
              </div>
           )}
         </div>
       )}

       {/* Edit Modal */}
       {editModalStudent && (
         <div className="fixed inset-0 z-50 bg-[#1a2b4c]/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-blue-500"></div>
               <h3 className="text-xl font-black text-[#1a2b4c] mb-6 uppercase tracking-widest border-b border-gray-100 pb-4">Edit Scholarship</h3>
               <div className="space-y-5">
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                     <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Student Focus</p>
                     <p className="text-base font-bold text-[#1a2b4c]">{editModalStudent.name} <span className="mx-2 text-gray-300">|</span> <span className="font-mono text-gray-500">{editModalStudent.id}</span></p>
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Monthly Discount (NRs.)</label>
                     <input type="number" min="0" value={editDiscount} onChange={e => setEditDiscount(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-bold text-purple-800 bg-white shadow-inner" placeholder="0"/>
                     <p className="text-[10px] text-gray-500 font-bold mt-1.5 ml-1">Set to 0 to completely revoke.</p>
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Description / Reason</label>
                     <textarea rows={2} value={editDescription} onChange={e => setEditDescription(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-bold text-gray-700 bg-white" placeholder="(Optional) Academic merit, financial aid..." />
                  </div>
               </div>
               <div className="flex gap-3 mt-8">
                  <button onClick={() => setEditModalStudent(null)} className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-100 transition-colors uppercase tracking-widest">Cancel</button>
                  <button onClick={handleUpdateScholarship} className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-xl text-sm shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 uppercase tracking-widest">Save Changes</button>
               </div>
            </div>
         </div>
       )}

       {/* Add Modal */}
       {isAddModalOpen && (
         <div className="fixed inset-0 z-50 bg-[#1a2b4c]/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
               <h3 className="text-xl font-black text-[#1a2b4c] mb-6 uppercase tracking-widest border-b border-gray-100 pb-4">Provide Scholarship</h3>
               <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Target Class</label>
                        <select value={addClass} onChange={e => {setAddClass(e.target.value); setAddSection(''); setAddStudentId('');}} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-gray-700 bg-white appearance-none">
                            <option value="">All</option>
                            {['Play Group', 'Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(c => <option key={c} value={c}>Class {c}</option>)}
                        </select>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Target Section</label>
                        <select value={addSection} onChange={e => {setAddSection(e.target.value); setAddStudentId('');}} disabled={!addClass} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 outline-none font-bold text-gray-700 bg-white appearance-none">
                            <option value="">All Sections</option>
                            {['A', 'B', 'C', 'D'].map(sec => <option key={sec} value={sec}>Section {sec}</option>)}
                        </select>
                     </div>
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Select Student</label>
                     <select value={addStudentId} onChange={e => setAddStudentId(e.target.value)} disabled={!addClass} className="w-full px-4 py-3 border border-gray-200 rounded-xl disabled:bg-gray-50 disabled:text-gray-400 focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-gray-700 bg-white">
                         <option value="">{addClass ? 'Select a student...' : 'Pick a class first'}</option>
                         {eligibleStudents.map(s => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}
                     </select>
                     {addClass && eligibleStudents.length === 0 && <p className="text-xs text-red-500 font-bold mt-1">No eligible students in this class.</p>}
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Discount Amount (NRs.)</label>
                     <input type="number" min="1" value={addDiscount} onChange={e => setAddDiscount(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-emerald-800 bg-emerald-50/50 shadow-inner" placeholder="0"/>
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Description / Reason</label>
                     <textarea rows={2} value={addDescription} onChange={e => setAddDescription(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-gray-700 bg-white" placeholder="(Optional) Academic merit, financial aid..." />
                  </div>
               </div>
               <div className="flex gap-3 mt-8">
                  <button onClick={() => setIsAddModalOpen(false)} className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-100 transition-colors uppercase tracking-widest">Cancel</button>
                  <button onClick={handleAddScholarship} disabled={!addStudentId || !addDiscount || Number(addDiscount) <= 0} className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 uppercase tracking-widest disabled:hover:translate-y-0 disabled:hover:shadow-md">Confirm</button>
               </div>
            </div>
         </div>
       )}
    </div>
  );
}
