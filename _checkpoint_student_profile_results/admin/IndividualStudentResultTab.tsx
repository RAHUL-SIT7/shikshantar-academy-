import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Search, 
  User, 
  Award, 
  Download, 
  Eye, 
  Printer, 
  FileText, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  X, 
  BadgeCheck,
  ChevronRight,
  TrendingUp,
  Percent,
  BookOpen
} from 'lucide-react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import jsPDF from 'jspdf';
import { toCanvas } from 'html-to-image';
import { saveAs } from 'file-saver';
import { StudentResult } from '../../data/resultsState';
import { ReportCardTemplate } from './ReportCardTemplate';

interface IndividualStudentResultTabProps {
  data: StudentResult[];
  allClasses: string[];
  dynamicExamTypes: string[];
  userRole: string;
  assignedClasses?: string[];
  teacherProfile?: any;
}

interface StudentDirectoryItem {
  id: string; // doc ID / UID
  permanentStudentId?: string;
  studentId?: string;
  fullName: string;
  emisNumber?: string;
  studentEmis?: string;
  class: string;
  section?: string;
  rollNumber?: string;
  rollNo?: string;
  classAssignedYear?: string;
  academicYear?: string;
}

export function IndividualStudentResultTab({
  data,
  allClasses,
  dynamicExamTypes,
  userRole,
  assignedClasses,
  teacherProfile
}: IndividualStudentResultTabProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStudentId = searchParams.get('studentId') || searchParams.get('id') || searchParams.get('uid') || '';

  const [studentDirectory, setStudentDirectory] = useState<StudentDirectoryItem[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterExam, setFilterExam] = useState('');

  // Selected Student
  const [selectedStudent, setSelectedStudent] = useState<StudentDirectoryItem | null>(null);

  // PDF Preview & Generation State
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [printPreviewRecord, setPrintPreviewRecord] = useState<StudentResult | null>(null);
  const [printModalRecord, setPrintModalRecord] = useState<StudentResult | null>(null);
  const hiddenPdfRef = useRef<HTMLDivElement>(null);

  // Role permissions
  const roleLower = String(userRole || '').toLowerCase();
  const isAdmin = roleLower === 'admin';
  const isTeacher = roleLower === 'teacher';

  const teacherClass = isTeacher && teacherProfile && teacherProfile.class
    ? String(teacherProfile.class).replace(/^Class\s+/i, '')
    : '';

  const permittedClasses = isTeacher
    ? Array.from(new Set([
        ...(teacherClass ? [teacherClass] : []),
        ...(Array.isArray(assignedClasses) ? assignedClasses : [])
      ])).filter(Boolean)
    : (isAdmin ? allClasses : assignedClasses || allClasses);

  // 1. Fetch Students Directory from Firestore users collection
  useEffect(() => {
    let unsubUsers: any;
    try {
      setDirectoryLoading(true);
      const q = query(collection(db, 'users'), where('role', '==', 'student'));
      unsubUsers = onSnapshot(q, (snap) => {
        const list: StudentDirectoryItem[] = [];
        snap.forEach(docSnap => {
          const d = docSnap.data();
          if (d.status !== 'DELETED' && d.deleted !== true) {
            list.push({
              id: docSnap.id,
              permanentStudentId: d.permanentStudentId || d.studentId || `STU-${docSnap.id.substring(0, 6)}`,
              studentId: d.studentId || d.permanentStudentId || `STU-${docSnap.id.substring(0, 6)}`,
              fullName: d.fullName || d.name || 'Unnamed Student',
              emisNumber: d.emisNumber || d.studentEmis || '',
              studentEmis: d.studentEmis || d.emisNumber || '',
              class: d.class || '',
              section: d.section || 'A',
              rollNumber: d.rollNumber || d.rollNo || '',
              rollNo: d.rollNo || d.rollNumber || '',
              classAssignedYear: d.classAssignedYear || d.academicYear || '',
              academicYear: d.academicYear || d.classAssignedYear || ''
            });
          }
        });

        // Also cross-reference any students present in published results who might not be in users table
        data.forEach(r => {
          if (r.studentId && !list.some(s => s.permanentStudentId === r.studentId || s.id === r.studentUid)) {
            list.push({
              id: r.studentUid || r.studentId,
              permanentStudentId: r.permanentStudentId || r.studentId,
              studentId: r.studentId,
              fullName: r.studentName || 'Student',
              emisNumber: r.studentEmis || '',
              studentEmis: r.studentEmis || '',
              class: r.class || '',
              section: r.section || 'A',
              rollNumber: r.rollNo || '',
              rollNo: r.rollNo || '',
              classAssignedYear: r.academicYear || '',
              academicYear: r.academicYear || ''
            });
          }
        });

        setStudentDirectory(list);
        setDirectoryLoading(false);
      }, (err) => {
        console.warn('Student directory snapshot error:', err);
        setDirectoryLoading(false);
      });
    } catch (e) {
      console.error('Error fetching students for results tab:', e);
      setDirectoryLoading(false);
    }

    return () => {
      if (unsubUsers) unsubUsers();
    };
  }, [data]);

  // 2. Automatically select student when URL contains studentId (e.g. from User Management -> Result button)
  useEffect(() => {
    if (urlStudentId && studentDirectory.length > 0) {
      const cleanTarget = decodeURIComponent(urlStudentId).trim().toLowerCase();
      const matched = studentDirectory.find(s => 
        s.id.toLowerCase() === cleanTarget ||
        (s.permanentStudentId && s.permanentStudentId.toLowerCase() === cleanTarget) ||
        (s.studentId && s.studentId.toLowerCase() === cleanTarget) ||
        (s.emisNumber && s.emisNumber.toLowerCase() === cleanTarget)
      );

      if (matched) {
        setSelectedStudent(matched);
      } else {
        // Fallback: create temporary student stub from ID and data
        const resMatch = data.find(r => 
          (r.studentId && r.studentId.toLowerCase() === cleanTarget) ||
          (r.permanentStudentId && r.permanentStudentId.toLowerCase() === cleanTarget) ||
          (r.studentUid && r.studentUid.toLowerCase() === cleanTarget)
        );
        if (resMatch) {
          setSelectedStudent({
            id: resMatch.studentUid || resMatch.studentId,
            permanentStudentId: resMatch.permanentStudentId || resMatch.studentId,
            studentId: resMatch.studentId,
            fullName: resMatch.studentName,
            emisNumber: resMatch.studentEmis || '',
            studentEmis: resMatch.studentEmis || '',
            class: resMatch.class,
            section: resMatch.section || 'A',
            rollNumber: resMatch.rollNo || '',
            rollNo: resMatch.rollNo || '',
            academicYear: resMatch.academicYear || ''
          });
        }
      }
    }
  }, [urlStudentId, studentDirectory, data]);

  // 3. Filter student suggestions based on user search query + class + section + year
  const filteredStudents = useMemo(() => {
    return studentDirectory.filter(std => {
      // Role class filter
      if (isTeacher && permittedClasses.length > 0 && !permittedClasses.includes(std.class)) {
        return false;
      }

      // Class filter
      if (filterClass && std.class !== filterClass) return false;

      // Section filter
      if (filterSection && std.section && std.section.toLowerCase() !== filterSection.toLowerCase()) return false;

      // Academic Year filter
      if (filterYear) {
        const yr = std.classAssignedYear || std.academicYear || '';
        if (!yr.toLowerCase().includes(filterYear.toLowerCase())) return false;
      }

      // Search Query (Name, ID, EMIS, Roll No)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = std.fullName.toLowerCase().includes(q);
        const idMatch = (std.permanentStudentId || '').toLowerCase().includes(q) || (std.studentId || '').toLowerCase().includes(q);
        const emisMatch = (std.emisNumber || '').toLowerCase().includes(q);
        const rollMatch = (std.rollNumber || std.rollNo || '').toLowerCase() === q;
        if (!nameMatch && !idMatch && !emisMatch && !rollMatch) return false;
      }

      return true;
    });
  }, [studentDirectory, searchQuery, filterClass, filterSection, filterYear, isTeacher, permittedClasses]);

  // 4. Retrieve ALL published results for the selected student
  const studentPublishedResults = useMemo(() => {
    if (!selectedStudent) return [];

    const pId = (selectedStudent.permanentStudentId || selectedStudent.studentId || '').toLowerCase().trim();
    const uId = (selectedStudent.id || '').toLowerCase().trim();
    const emis = (selectedStudent.emisNumber || selectedStudent.studentEmis || '').toLowerCase().trim();

    // Filter strictly for published results belonging to this student
    const matched = data.filter(r => {
      if (!r.published) return false;

      const rId = (r.studentId || '').toLowerCase().trim();
      const rPerm = (r.permanentStudentId || '').toLowerCase().trim();
      const rUid = (r.studentUid || '').toLowerCase().trim();
      const rEmis = (r.studentEmis || '').toLowerCase().trim();

      const isMatch = (pId && (rId === pId || rPerm === pId)) ||
                      (uId && rUid === uId) ||
                      (emis && rEmis === emis);

      if (!isMatch) return false;

      // Apply Exam Type filter if selected
      if (filterExam && r.examType && !r.examType.toLowerCase().includes(filterExam.toLowerCase())) {
        return false;
      }

      return true;
    });

    // Sort chronologically or by term order
    const termOrder = ['first', 'second', 'third', 'final'];
    return matched.sort((a, b) => {
      const aTerm = (a.examType || '').toLowerCase();
      const bTerm = (b.examType || '').toLowerCase();
      let aIdx = termOrder.findIndex(t => aTerm.includes(t));
      let bIdx = termOrder.findIndex(t => bTerm.includes(t));
      if (aIdx === -1) aIdx = 99;
      if (bIdx === -1) bIdx = 99;
      return aIdx - bIdx;
    });
  }, [selectedStudent, data, filterExam]);

  // 5. Generate and Download PDF Marksheet for a single terminal result
  const generatePDFBlob = async (element: HTMLElement): Promise<Blob> => {
    const canvas = await toCanvas(element, { pixelRatio: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    return pdf.output('blob');
  };

  const handleDownloadSinglePdf = async (record: StudentResult) => {
    setPrintPreviewRecord(record);
    setGeneratingPdf(true);

    setTimeout(async () => {
      if (hiddenPdfRef.current) {
        try {
          const blob = await generatePDFBlob(hiddenPdfRef.current);
          const safeName = (record.studentName || 'Student').replace(/\s+/g, '_');
          const safeExam = (record.examType || 'Exam').replace(/\s+/g, '_');
          saveAs(blob, `${safeName}_Class${record.class}_${safeExam}_ReportCard.pdf`);
        } catch (e) {
          console.error('Failed to generate marksheet PDF:', e);
        }
      }
      setGeneratingPdf(false);
      setPrintPreviewRecord(null);
    }, 800);
  };

  // Helper for grade point and letter grade
  const getSubjectGradeInfo = (obtained: number | 'AB', fullMarks: number) => {
    if (obtained === 'AB') return { gp: 0.0, grade: 'NG' };
    const pct = fullMarks > 0 ? (Number(obtained) / fullMarks) * 100 : 0;
    if (pct >= 90) return { gp: 4.0, grade: 'A+' };
    if (pct >= 80) return { gp: 3.6, grade: 'A' };
    if (pct >= 70) return { gp: 3.2, grade: 'B+' };
    if (pct >= 60) return { gp: 2.8, grade: 'B' };
    if (pct >= 50) return { gp: 2.4, grade: 'C+' };
    if (pct >= 40) return { gp: 2.0, grade: 'C' };
    if (pct >= 35) return { gp: 1.6, grade: 'D' };
    return { gp: 0.0, grade: 'NG' };
  };

  return (
    <div className="space-y-6">
      {/* Tab Header & Description */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950">
                INDIVIDUAL LOOKUP
              </span>
              <span className="text-xs text-blue-200 font-semibold">Official Published Examinations</span>
            </div>
            <h2 className="text-2xl font-black mt-1">Individual Student Result Ledger</h2>
            <p className="text-blue-100/80 text-xs sm:text-sm mt-1 max-w-2xl">
              Inspect the comprehensive terminal examination history, subject breakdowns, theory/practical marks, and printable marksheets for any enrolled student.
            </p>
          </div>

          {selectedStudent && (
            <button
              onClick={() => {
                setSelectedStudent(null);
                setSearchQuery('');
                setSearchParams(prev => {
                  prev.delete('studentId');
                  prev.delete('id');
                  return prev;
                });
              }}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-all w-fit cursor-pointer flex items-center gap-1.5"
            >
              <X className="w-4 h-4" /> Change / Clear Student
            </button>
          )}
        </div>
      </div>

      {/* Multi-Criteria Search & Filter Panel */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Universal Search Query */}
          <div className="lg:col-span-2 relative">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 block pl-1">
              Search Student (Name / ID / EMIS / Roll No)
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. Ram Sah, STU-000001, EMIS..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Class Filter */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 block pl-1">
              Class
            </label>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="">All Classes</option>
              {permittedClasses.map((cls) => (
                <option key={cls} value={cls}>Class {cls}</option>
              ))}
            </select>
          </div>

          {/* Section Filter */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 block pl-1">
              Section
            </label>
            <select
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="">All Sections</option>
              <option value="A">Section A</option>
              <option value="B">Section B</option>
              <option value="C">Section C</option>
            </select>
          </div>

          {/* Exam Type Filter */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 block pl-1">
              Exam Terminal
            </label>
            <select
              value={filterExam}
              onChange={(e) => setFilterExam(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="">All Published Exams</option>
              {dynamicExamTypes.map((ex) => (
                <option key={ex} value={ex}>{ex}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Student Match Selector dropdown when searching */}
        {!selectedStudent && searchQuery.trim() && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[11px] font-bold text-slate-500 mb-2">
              Found {filteredStudents.length} student{filteredStudents.length === 1 ? '' : 's'} matching search:
            </p>
            {filteredStudents.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                {filteredStudents.slice(0, 12).map((std) => (
                  <button
                    key={std.id}
                    onClick={() => {
                      setSelectedStudent(std);
                      setSearchQuery('');
                    }}
                    className="p-3 text-left rounded-xl bg-slate-50 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-primary">
                        {std.fullName}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        ID: {std.permanentStudentId || std.studentId} • Class {std.class}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-primary shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold p-2">
                No student matched "{searchQuery}". Try searching by another name or roll number.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Selected Student Banner & Identity Card */}
      {selectedStudent ? (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-xl flex items-center justify-center shadow-md shrink-0">
                  {selectedStudent.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                    {selectedStudent.fullName}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md border border-blue-100 dark:border-blue-900">
                      ID: {selectedStudent.permanentStudentId || selectedStudent.studentId}
                    </span>
                    {(selectedStudent.emisNumber || selectedStudent.studentEmis) && (
                      <span className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                        EMIS: {selectedStudent.emisNumber || selectedStudent.studentEmis}
                      </span>
                    )}
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      Class {selectedStudent.class} {selectedStudent.section ? `• Sec ${selectedStudent.section}` : ''} {selectedStudent.rollNumber || selectedStudent.rollNo ? `• Roll ${selectedStudent.rollNumber || selectedStudent.rollNo}` : ''}
                    </span>
                    <span className="text-slate-400">
                      Session: {selectedStudent.classAssignedYear || selectedStudent.academicYear || '2083-2084 B.S.'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick stats counter */}
              <div className="flex items-center gap-3">
                <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Published Exams</span>
                  <span className="text-lg font-black text-primary">{studentPublishedResults.length} Terminals</span>
                </div>
              </div>
            </div>

            {/* List of All Published Results for this Student */}
            <div className="pt-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" /> Published Examination Results
                </h4>
                <span className="text-xs text-slate-400 font-medium">
                  Showing {studentPublishedResults.length} recorded terminal results
                </span>
              </div>

              {studentPublishedResults.length > 0 ? (
                <div className="space-y-6">
                  {studentPublishedResults.map((examResult, index) => {
                    const subjects = examResult.subjects || {};
                    const subjectNames = Object.keys(subjects);

                    return (
                      <div 
                        key={examResult.examId || index}
                        className="bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/80 p-5 shadow-xs transition-all hover:border-blue-300 dark:hover:border-blue-700 space-y-4"
                      >
                        {/* Terminal Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                {examResult.examType}
                              </span>
                              <span className="text-xs font-bold text-slate-500">
                                Class {examResult.class} {examResult.section ? `• Sec ${examResult.section}` : ''}
                              </span>
                            </div>
                            <h5 className="text-base font-black text-slate-900 dark:text-white mt-1">
                              {examResult.examType} - Marksheet
                            </h5>
                          </div>

                          {/* Action Buttons for this Terminal */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPrintModalRecord(examResult)}
                              className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                              title="Preview official printable report card"
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-600" /> View Marksheet
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDownloadSinglePdf(examResult)}
                              disabled={generatingPdf}
                              className="px-3.5 py-1.5 bg-primary hover:opacity-90 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                              title="Download official PDF report card"
                            >
                              {generatingPdf && printPreviewRecord?.examId === examResult.examId ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                              Download PDF
                            </button>
                          </div>
                        </div>

                        {/* Subject Marks Breakdown Table */}
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                              <tr>
                                <th className="p-3">Subject Name</th>
                                <th className="p-3 text-center">Theory (Obt / Full)</th>
                                <th className="p-3 text-center">Practical (Obt / Full)</th>
                                <th className="p-3 text-center">Total Marks</th>
                                <th className="p-3 text-center">Grade Point</th>
                                <th className="p-3 text-center">Letter Grade</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                              {subjectNames.map((subName) => {
                                const subInfo = subjects[subName];
                                const hasPractical = subInfo.prFull !== undefined && subInfo.prFull > 0;
                                const gradeInfo = getSubjectGradeInfo(subInfo.obtained, subInfo.fullMarks || 100);

                                return (
                                  <tr key={subName} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                    <td className="p-3 font-bold text-slate-800 dark:text-slate-100">
                                      {subName}
                                    </td>
                                    <td className="p-3 text-center">
                                      {subInfo.thMarks !== undefined ? (
                                        <span className="font-mono">
                                          {subInfo.thMarks} <span className="text-slate-400">/ {subInfo.thFull || 75}</span>
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">-</span>
                                      )}
                                    </td>
                                    <td className="p-3 text-center">
                                      {hasPractical ? (
                                        <span className="font-mono text-emerald-700 dark:text-emerald-400 font-bold">
                                          {subInfo.prMarks} <span className="text-slate-400">/ {subInfo.prFull}</span>
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 text-[10px]">N/A</span>
                                      )}
                                    </td>
                                    <td className="p-3 text-center font-mono font-bold text-slate-900 dark:text-white">
                                      {subInfo.obtained} <span className="text-slate-400 font-normal">/ {subInfo.fullMarks}</span>
                                    </td>
                                    <td className="p-3 text-center font-mono font-bold text-blue-600 dark:text-blue-400">
                                      {gradeInfo.gp.toFixed(2)}
                                    </td>
                                    <td className="p-3 text-center font-black">
                                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                                        gradeInfo.grade === 'NG' 
                                          ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                      }`}>
                                        {gradeInfo.grade}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Summary Metric Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
                          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Marks</span>
                            <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-100">
                              {examResult.total} <span className="text-slate-400 text-xs">/ {examResult.fullTotal}</span>
                            </span>
                          </div>

                          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Percentage</span>
                            <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-100">
                              {examResult.percentage ? Number(examResult.percentage).toFixed(2) : 0}%
                            </span>
                          </div>

                          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Terminal GPA</span>
                            <span className="text-base font-black font-mono text-blue-600 dark:text-blue-400">
                              {examResult.gpa ? Number(examResult.gpa).toFixed(2) : '0.00'}
                            </span>
                          </div>

                          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Class Rank</span>
                            <span className="text-base font-black font-mono text-amber-600 dark:text-amber-400">
                              {examResult.rank ? `#${examResult.rank}` : '-'}
                            </span>
                          </div>

                          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center col-span-2 sm:col-span-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Final Grade</span>
                            <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                              {examResult.grade || 'PASS'}
                            </span>
                          </div>
                        </div>

                        {examResult.classTeacherRemark && (
                          <div className="p-2.5 px-3 bg-amber-50/60 dark:bg-amber-950/30 rounded-xl border border-amber-200/80 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200">
                            <strong>Teacher Remark:</strong> {examResult.classTeacherRemark}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8">
                  <BookOpen className="w-10 h-10 text-slate-400 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    No Published Examination Results Found
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    There are no published terminal marks for {selectedStudent.fullName} matching the active filters. Results must be published in the "Published Results & Reports" tab to appear here.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Empty State / Student Directory Grid */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-4">
          <div className="w-14 h-14 bg-blue-50 dark:bg-blue-950/40 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
            <User className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">Select a Student to View Results</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Use the search bar above or choose from the student roster below to inspect complete published examination results.
            </p>
          </div>

          {directoryLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-xs font-bold">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading enrolled students...
            </div>
          ) : (
            <div className="pt-4 max-w-4xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-left">
                {filteredStudents.slice(0, 15).map((std) => (
                  <button
                    key={std.id}
                    onClick={() => setSelectedStudent(std)}
                    className="p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-primary">
                        {std.fullName}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {std.permanentStudentId || std.studentId} • Class {std.class}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-primary shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Official Marksheet Preview Modal */}
      {printModalRecord && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                  Official Grade Sheet Preview • {printModalRecord.examType}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadSinglePdf(printModalRecord)}
                  disabled={generatingPdf}
                  className="px-3.5 py-1.5 bg-primary text-white rounded-xl text-xs font-bold flex items-center gap-1.5 hover:opacity-90 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => setPrintModalRecord(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content - Official Printable Template */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-slate-100 dark:bg-slate-950 flex justify-center">
              <div className="w-full max-w-[794px] bg-white text-slate-900 shadow-xl rounded-xl p-4 sm:p-8">
                <ReportCardTemplate student={printModalRecord} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Off-screen Container for PDF Blob Generation */}
      {printPreviewRecord && (
        <div style={{ position: 'absolute', top: -9999, left: -9999, width: '794px' }}>
          <div ref={hiddenPdfRef} style={{ background: '#ffffff', color: '#000000', width: '794px' }}>
            <ReportCardTemplate student={printPreviewRecord} />
          </div>
        </div>
      )}
    </div>
  );
}
