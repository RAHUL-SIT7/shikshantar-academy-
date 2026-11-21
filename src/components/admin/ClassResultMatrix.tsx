import React, { useState, useMemo } from 'react';
import {
  Search,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  XCircle,
  HelpCircle,
  RotateCcw,
  GraduationCap,
  Award,
  BookOpen,
  Filter,
  Info,
  ShieldCheck,
  Check
} from 'lucide-react';
import {
  ClassResultMatrixOutput,
  MatrixStudentRow,
  MatrixSubjectCell,
  MatrixComponentStatus
} from '../../lib/classResultMatrixEngine';

export interface ClassResultMatrixProps {
  matrixData: ClassResultMatrixOutput | null;
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  className?: string;
}

type StatusFilterType = 'all' | 'incomplete' | 'ng' | 'absent' | 'conflicts';

export function ClassResultMatrix({
  matrixData,
  isLoading = false,
  error = null,
  onRefresh,
  className = ''
}: ClassResultMatrixProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all');

  // Filter students based on search term and status filter
  const filteredStudents = useMemo(() => {
    if (!matrixData || !matrixData.students) return [];

    return matrixData.students.filter(student => {
      // 1. Search filter (Name, Roll, Student ID)
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchesName = (student.studentName || '').toLowerCase().includes(query);
        const matchesRoll = (student.rollNo || '').toLowerCase().includes(query);
        const matchesId = (student.studentId || '').toLowerCase().includes(query);
        const matchesPermId = (student.permanentStudentId || '').toLowerCase().includes(query);
        const matchesEmis = (student.studentEmis || '').toLowerCase().includes(query);

        if (!matchesName && !matchesRoll && !matchesId && !matchesPermId && !matchesEmis) {
          return false;
        }
      }

      // 2. Status filter
      if (statusFilter === 'incomplete') {
        return !student.isComplete;
      }
      if (statusFilter === 'ng') {
        return student.overallStatus === 'NG';
      }
      if (statusFilter === 'absent') {
        return student.absentSubjectCount > 0;
      }
      if (statusFilter === 'conflicts') {
        return student.hasConflict;
      }

      return true;
    });
  }, [matrixData, searchTerm, statusFilter]);

  // Handle loading state
  if (isLoading) {
    return (
      <div className={`bg-white rounded-2xl border border-gray-200/80 p-12 text-center shadow-sm ${className}`}>
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <h3 className="text-base font-bold text-gray-800">Generating Class Result Matrix...</h3>
          <p className="text-xs text-gray-500 font-medium max-w-sm">
            Aggregating enrolled students, verifying configured subject breakdowns, and evaluating official Nepal CDC letter grading.
          </p>
        </div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className={`bg-white rounded-2xl border border-red-200 p-8 text-center shadow-sm ${className}`}>
        <div className="flex flex-col items-center justify-center space-y-3">
          <AlertCircle className="w-10 h-10 text-red-500" />
          <h3 className="text-base font-bold text-gray-900">Failed to Load Result Matrix</h3>
          <p className="text-xs text-red-600 font-medium max-w-md">{error}</p>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="mt-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-xl transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  // Handle empty state
  if (!matrixData || matrixData.students.length === 0) {
    return (
      <div className={`bg-white rounded-2xl border border-gray-200/80 p-12 text-center shadow-sm ${className}`}>
        <div className="flex flex-col items-center justify-center space-y-3">
          <BookOpen className="w-10 h-10 text-gray-400" />
          <h3 className="text-base font-bold text-gray-800">No Student Records Found</h3>
          <p className="text-xs text-gray-500 font-medium max-w-sm">
            There are no enrolled students or marks available for the selected class context.
          </p>
        </div>
      </div>
    );
  }

  const { context, stats, configuredSubjects, subjectConfigs, conflicts } = matrixData;
  const isExamPublished = Boolean(context.isPublished === true || context.status === 'PUBLISHED');

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 1. Matrix Header & Context Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white p-6 rounded-2xl shadow-md border border-slate-800">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2.5 py-0.5 rounded-lg">
                {context.academicYear || 'Academic Year'}
              </span>
              <span className="text-[11px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2.5 py-0.5 rounded-lg">
                Section {context.section || 'All'}
              </span>
              <span className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-lg border ${
                isExamPublished
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-400/30'
              }`}>
                {isExamPublished ? 'OFFICIALLY PUBLISHED' : 'PRE-PUBLICATION DRAFT'}
              </span>
            </div>

            <h2 className="text-2xl font-black mt-2 tracking-tight">
              Class {context.class} — {context.examType || context.examId || 'Examination'} Matrix
            </h2>
            <p className="text-xs text-slate-300 font-medium mt-1 flex flex-wrap items-center gap-3">
              <span>Enrolled Students: <strong className="text-white">{stats.totalStudents}</strong></span>
              <span>•</span>
              <span>Configured Subjects: <strong className="text-white">{configuredSubjects.length}</strong></span>
              <span>•</span>
              <span>
                Ranking Mode:{' '}
                <strong className={isExamPublished ? 'text-emerald-300' : 'text-amber-300'}>
                  {isExamPublished ? 'Official Published Ranks' : 'Provisional (Draft Estimates)'}
                </strong>
              </span>
            </p>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Refresh Matrix
            </button>
          )}
        </div>
      </div>

      {/* 2. Conflict Warning Alert (Visible when conflicting duplicates exist) */}
      {conflicts.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-red-900 font-black text-sm">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span>Mark Conflict Alert: {conflicts.length} Unresolved Duplicate Subject Entry Conflicts Detected</span>
          </div>
          <p className="text-xs text-red-800 font-medium leading-relaxed">
            Multiple conflicting mark entries were detected for the students below. The engine has failed-closed and marked these cells as <span className="font-bold underline">CONFLICT</span> rather than silently selecting one. Please inspect the entries and re-save the authoritative mark:
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2">
            {conflicts.map((c, idx) => (
              <div key={idx} className="bg-white p-2.5 rounded-xl border border-red-200 text-xs text-red-900 flex items-start justify-between gap-2">
                <div>
                  <span className="font-black text-red-950">
                    {c.studentName ? `${c.studentName} (${c.studentIdentifier})` : c.studentIdentifier}
                  </span>
                  {' — Subject: '}
                  <span className="font-bold text-blue-900">{c.subject}</span>
                  <p className="text-[11px] text-red-700 mt-0.5">{c.details}</p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-800 px-2 py-0.5 rounded">
                  Action Required
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Authoritative Summary KPI Cards (Derived strictly from engine stats) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {/* Total Students */}
        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 block">Total Enrolled</span>
          <div className="text-2xl font-black text-gray-900 mt-1">{stats.totalStudents}</div>
          <span className="text-[10px] font-bold text-gray-400 mt-0.5 block">100% Cohort</span>
        </div>

        {/* Complete Students */}
        <div className="bg-white p-4 rounded-xl border border-emerald-200/80 shadow-sm bg-emerald-50/20">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">Complete</span>
          <div className="text-2xl font-black text-emerald-700 mt-1">{stats.completeStudents}</div>
          <span className="text-[10px] font-bold text-emerald-600 mt-0.5 block">
            {stats.totalStudents > 0 ? Math.round((stats.completeStudents / stats.totalStudents) * 100) : 0}% Ready
          </span>
        </div>

        {/* Incomplete Students */}
        <div className="bg-white p-4 rounded-xl border border-amber-200/80 shadow-sm bg-amber-50/20">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block">Incomplete</span>
          <div className="text-2xl font-black text-amber-700 mt-1">{stats.incompleteStudents}</div>
          <span className="text-[10px] font-bold text-amber-600 mt-0.5 block">Pending Marks</span>
        </div>

        {/* Absent Entries */}
        <div className="bg-white p-4 rounded-xl border border-purple-200/80 shadow-sm bg-purple-50/20">
          <span className="text-[10px] font-black uppercase tracking-wider text-purple-800 block">With Absent</span>
          <div className="text-2xl font-black text-purple-700 mt-1">{stats.absentStudentsCount}</div>
          <span className="text-[10px] font-bold text-purple-600 mt-0.5 block">Recorded AB</span>
        </div>

        {/* Passed Students */}
        <div className="bg-white p-4 rounded-xl border border-blue-200/80 shadow-sm bg-blue-50/20">
          <span className="text-[10px] font-black uppercase tracking-wider text-blue-800 block">Passed</span>
          <div className="text-2xl font-black text-blue-700 mt-1">{stats.passedStudentsCount}</div>
          <span className="text-[10px] font-bold text-blue-600 mt-0.5 block">All Pass Marks Met</span>
        </div>

        {/* Non-Graded (NG) */}
        <div className="bg-white p-4 rounded-xl border border-rose-200/80 shadow-sm bg-rose-50/20">
          <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 block">Non-Graded (NG)</span>
          <div className="text-2xl font-black text-rose-700 mt-1">{stats.ngStudentsCount}</div>
          <span className="text-[10px] font-bold text-rose-600 mt-0.5 block">Strict NG Option A</span>
        </div>

        {/* Conflicts */}
        <div className={`bg-white p-4 rounded-xl border shadow-sm ${
          stats.conflictedStudentsCount > 0 ? 'border-red-300 bg-red-50/30' : 'border-gray-200/80'
        }`}>
          <span className={`text-[10px] font-black uppercase tracking-wider block ${
            stats.conflictedStudentsCount > 0 ? 'text-red-800' : 'text-gray-500'
          }`}>
            Conflicts
          </span>
          <div className={`text-2xl font-black mt-1 ${
            stats.conflictedStudentsCount > 0 ? 'text-red-700' : 'text-gray-900'
          }`}>
            {stats.conflictedStudentsCount}
          </div>
          <span className={`text-[10px] font-bold mt-0.5 block ${
            stats.conflictedStudentsCount > 0 ? 'text-red-600' : 'text-gray-400'
          }`}>
            Duplicate Collisions
          </span>
        </div>
      </div>

      {/* 4. Search and Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by student name, roll number, or student ID..."
            className="w-full pl-9 pr-8 py-2 border rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50/60 focus:bg-white text-gray-900"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1 hidden sm:inline">
            Filter:
          </span>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({stats.totalStudents})
          </button>
          <button
            onClick={() => setStatusFilter('incomplete')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === 'incomplete'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            Incomplete ({stats.incompleteStudents})
          </button>
          <button
            onClick={() => setStatusFilter('ng')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === 'ng'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
            }`}
          >
            NG ({stats.ngStudentsCount})
          </button>
          <button
            onClick={() => setStatusFilter('absent')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === 'absent'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
            }`}
          >
            Absent ({stats.absentStudentsCount})
          </button>
          {stats.conflictedStudentsCount > 0 && (
            <button
              onClick={() => setStatusFilter('conflicts')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statusFilter === 'conflicts'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-red-100 text-red-900 hover:bg-red-200'
              }`}
            >
              Conflicts ({stats.conflictedStudentsCount})
            </button>
          )}

          {(searchTerm || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors ml-1"
              title="Reset Filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Showing count indicator */}
      <div className="flex items-center justify-between text-xs text-gray-500 font-medium px-1">
        <span>
          Showing <strong className="text-gray-900">{filteredStudents.length}</strong> of{' '}
          <strong className="text-gray-900">{stats.totalStudents}</strong> students
        </span>
        <span className="text-[11px] text-gray-400 italic">
          * Scroll horizontally to review all configured subjects and components
        </span>
      </div>

      {/* 5. Matrix Table Container */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
        {filteredStudents.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Filter className="w-8 h-8 text-gray-300 mx-auto" />
            <h4 className="text-sm font-bold text-gray-800">No Matching Students Found</h4>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              No students match the current query &ldquo;{searchTerm}&rdquo; with status &ldquo;{statusFilter}&rdquo;.
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
              }}
              className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs rounded-xl transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[72vh] relative">
            <table className="w-full text-left text-xs border-collapse">
              {/* Table Header: Dual-Level Header */}
              <thead className="bg-slate-900 text-white sticky top-0 z-30 shadow-sm select-none">
                {/* Level 1: Subject Groups and Aggregate Group */}
                <tr className="border-b border-slate-800 text-[11px] font-black uppercase tracking-wider">
                  {/* Sticky Student Details Header */}
                  <th
                    colSpan={2}
                    className="py-3 px-3 sticky left-0 z-40 bg-slate-900 border-r border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)] text-center"
                  >
                    Student Information
                  </th>

                  {/* Configured Subjects Groups */}
                  {configuredSubjects.map(subj => {
                    const cfg = subjectConfigs[subj] || {};
                    const hasPr = cfg.hasPr !== false;
                    const colSpan = hasPr ? 3 : 2; // TH, PR, SubTotal OR TH, SubTotal

                    return (
                      <th
                        key={subj}
                        colSpan={colSpan}
                        className="py-2.5 px-3 border-r border-slate-800 text-center bg-slate-800/80"
                      >
                        <div className="flex flex-col items-center justify-center">
                          <span className="text-white font-black truncate max-w-[160px]">{subj}</span>
                          <span className="text-[10px] text-blue-300 font-bold font-mono">
                            {cfg.hasTh ? `${cfg.thFullMarks} TH` : ''}
                            {cfg.hasTh && cfg.hasPr ? ' + ' : ''}
                            {cfg.hasPr ? `${cfg.prFullMarks} PR` : ''}
                            {' = '}
                            {(cfg.thFullMarks || 0) + (cfg.prFullMarks || 0)}
                          </span>
                        </div>
                      </th>
                    );
                  })}

                  {/* Performance Aggregate Header Group */}
                  <th
                    colSpan={6}
                    className="py-3 px-4 text-center bg-indigo-950 border-l border-indigo-900 text-indigo-200"
                  >
                    Academic Performance & Result
                  </th>
                </tr>

                {/* Level 2: Component Columns */}
                <tr className="border-b border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-300 bg-slate-950">
                  {/* Roll No */}
                  <th className="py-2 px-2.5 sticky left-0 z-40 bg-slate-950 text-center w-14">
                    Roll
                  </th>
                  {/* Student Name & ID */}
                  <th className="py-2 px-3 sticky left-14 z-40 bg-slate-950 border-r border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)] min-w-[160px]">
                    Student Name / ID
                  </th>

                  {/* Per Subject Sub-columns */}
                  {configuredSubjects.map(subj => {
                    const cfg = subjectConfigs[subj] || {};
                    const hasPr = cfg.hasPr !== false;

                    return (
                      <React.Fragment key={subj}>
                        <th className="py-2 px-2 text-center w-16 bg-slate-900/90 text-blue-300">
                          TH ({cfg.thFullMarks ?? 75})
                        </th>
                        {hasPr && (
                          <th className="py-2 px-2 text-center w-16 bg-slate-900/90 text-emerald-300">
                            PR ({cfg.prFullMarks ?? 25})
                          </th>
                        )}
                        <th className="py-2 px-2 text-center w-16 border-r border-slate-800 bg-slate-900/90 text-slate-200">
                          Total
                        </th>
                      </React.Fragment>
                    );
                  })}

                  {/* Aggregate Sub-columns */}
                  <th className="py-2 px-2 text-center w-20 bg-indigo-950 text-indigo-300">Total</th>
                  <th className="py-2 px-2 text-center w-16 bg-indigo-950 text-indigo-300">Pct (%)</th>
                  <th className="py-2 px-2 text-center w-16 bg-indigo-950 text-indigo-300">GPA</th>
                  <th className="py-2 px-2 text-center w-16 bg-indigo-950 text-indigo-300">Grade</th>
                  <th className="py-2 px-2.5 text-center w-24 bg-indigo-950 text-indigo-300">Status</th>
                  <th className="py-2 px-3 text-center w-28 bg-indigo-950 text-indigo-300">
                    {isExamPublished ? 'Official Rank' : 'Provisional Rank'}
                  </th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-gray-100 font-mono">
                {filteredStudents.map((row, idx) => {
                  const isEven = idx % 2 === 0;
                  const rowBg = isEven ? 'bg-white' : 'bg-slate-50/40';

                  return (
                    <tr
                      key={row.studentUid}
                      className={`${rowBg} hover:bg-blue-50/40 transition-colors ${
                        !row.isComplete ? 'border-l-4 border-l-amber-500' : ''
                      }`}
                    >
                      {/* Sticky Roll Number */}
                      <td className={`py-2 px-2.5 text-center font-bold text-gray-900 sticky left-0 z-20 ${rowBg}`}>
                        {row.rollNo || '—'}
                      </td>

                      {/* Sticky Student Name & ID */}
                      <td
                        className={`py-2 px-3 sticky left-14 z-20 border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] font-sans ${rowBg}`}
                      >
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-900 leading-tight">
                            {row.studentName}
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono mt-0.5">
                            {row.permanentStudentId || row.studentId}
                          </span>
                        </div>
                      </td>

                      {/* Per-Subject Component Cells */}
                      {configuredSubjects.map(subj => {
                        const cell = row.cells[subj];
                        const cfg = subjectConfigs[subj] || {};
                        const hasPr = cfg.hasPr !== false;

                        if (!cell) {
                          return (
                            <React.Fragment key={subj}>
                              <td className="py-2 px-2 text-center text-gray-400 font-medium italic">N/A</td>
                              {hasPr && <td className="py-2 px-2 text-center text-gray-400 font-medium italic">N/A</td>}
                              <td className="py-2 px-2 text-center border-r border-gray-100 text-gray-400">—</td>
                            </React.Fragment>
                          );
                        }

                        // Conflicting duplicate cell
                        if (cell.hasConflict) {
                          return (
                            <React.Fragment key={subj}>
                              <td
                                colSpan={hasPr ? 3 : 2}
                                className="py-2 px-2 text-center border-r border-red-200 bg-red-100/60 font-sans"
                                title={cell.conflictDetails || 'Conflicting duplicate marks'}
                              >
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-red-600 text-white shadow-sm">
                                  <AlertTriangle className="w-3 h-3" />
                                  CONFLICT
                                </span>
                              </td>
                            </React.Fragment>
                          );
                        }

                        return (
                          <React.Fragment key={subj}>
                            {/* Theory Cell */}
                            <td className="py-2 px-2 text-center">
                              {renderComponentCell(cell.thStatus, cell.thMarks, 'TH')}
                            </td>

                            {/* Practical Cell (if applicable) */}
                            {hasPr && (
                              <td className="py-2 px-2 text-center">
                                {renderComponentCell(cell.prStatus, cell.prMarks, 'PR')}
                              </td>
                            )}

                            {/* Subject Sub-Total & Grade Cell */}
                            <td className="py-2 px-2 text-center border-r border-gray-200 font-bold">
                              {cell.isMissing ? (
                                <span className="text-rose-500 font-black text-[10px] bg-rose-50 px-1 py-0.5 rounded">
                                  MISSING
                                </span>
                              ) : (
                                <div className="flex flex-col items-center justify-center leading-tight">
                                  <span className={`text-xs ${cell.isNg ? 'text-rose-700' : 'text-gray-900'}`}>
                                    {cell.totalObtainedMarks ?? 0}
                                  </span>
                                  <span
                                    className={`text-[9px] font-black uppercase px-1 rounded mt-0.5 ${
                                      cell.isNg
                                        ? 'bg-rose-100 text-rose-800'
                                        : 'bg-emerald-50 text-emerald-800'
                                    }`}
                                  >
                                    {cell.subjectGrade}
                                  </span>
                                </div>
                              )}
                            </td>
                          </React.Fragment>
                        );
                      })}

                      {/* Overall Aggregate: Total Obtained / Full Marks */}
                      <td className="py-2 px-2 text-center font-bold text-gray-900 bg-indigo-50/20">
                        {row.isComplete ? `${row.totalObtainedMarks}/${row.totalFullMarks}` : '—'}
                      </td>

                      {/* Aggregate Percentage */}
                      <td className="py-2 px-2 text-center font-bold text-gray-800 bg-indigo-50/20">
                        {row.isComplete ? `${row.aggregatePercentage.toFixed(1)}%` : '—'}
                      </td>

                      {/* Nepal GPA */}
                      <td className="py-2 px-2 text-center font-bold bg-indigo-50/20">
                        {row.isComplete && row.overallGpa !== null ? (
                          <span className="text-emerald-700">{row.gpaDisplayText}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* Overall Grade */}
                      <td className="py-2 px-2 text-center font-black bg-indigo-50/20">
                        {row.isComplete ? (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[11px] font-black ${
                              row.overallGrade === 'NG'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-blue-100 text-blue-900'
                            }`}
                          >
                            {row.overallGrade}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* Overall Status Badge */}
                      <td className="py-2 px-2.5 text-center font-sans bg-indigo-50/20">
                        {renderStatusBadge(row.overallStatus)}
                      </td>

                      {/* Rank Display (Respects provisional vs official ranking) */}
                      <td className="py-2 px-3 text-center font-sans bg-indigo-50/20">
                        {renderRankBadge(row, isExamPublished)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. Matrix Legend & Guidelines */}
      <div className="bg-gray-50 border border-gray-200/80 rounded-2xl p-4 text-xs font-medium text-gray-600 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-bold text-gray-900 uppercase tracking-wider text-[10px]">Matrix Legend:</span>
          <span className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 text-[10px] font-black uppercase rounded bg-rose-100 text-rose-800">MISSING</span>
            <span>Unentered Component</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-bold font-mono text-gray-900">0</span>
            <span>Valid Numeric Zero</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 text-[10px] font-black uppercase rounded bg-purple-100 text-purple-800">AB</span>
            <span>Absent Examination</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-gray-400 italic">N/A</span>
            <span>Theory-Only Subject</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 text-[10px] font-black uppercase rounded bg-red-600 text-white">CONFLICT</span>
            <span>Conflicting Duplicate Entries</span>
          </span>
        </div>

        <div className="text-[11px] text-gray-500 font-sans">
          Evaluation Engine: <strong className="text-gray-800">Nepal CDC Letter Grading (Strict NG Option A)</strong>
        </div>
      </div>
    </div>
  );
}

/**
 * Helper to render individual component cells (Theory / Practical)
 */
function renderComponentCell(
  status: MatrixComponentStatus,
  mark: number | 'AB' | null,
  component: 'TH' | 'PR'
): React.ReactNode {
  switch (status) {
    case 'NOT_APPLICABLE':
      return <span className="text-gray-400 italic font-medium text-[11px]">N/A</span>;
    case 'MISSING':
      return (
        <span
          className="inline-block px-1.5 py-0.5 text-[10px] font-black uppercase rounded bg-rose-50 text-rose-600 border border-rose-200"
          title={`${component} mark is missing`}
        >
          MISSING
        </span>
      );
    case 'ABSENT':
      return (
        <span
          className="inline-block px-1.5 py-0.5 text-[10px] font-black uppercase rounded bg-purple-100 text-purple-800"
          title={`Absent in ${component}`}
        >
          AB
        </span>
      );
    case 'ZERO':
      return <span className="font-bold text-gray-900 font-mono">0</span>;
    case 'ENTERED':
      return <span className="font-bold text-gray-900 font-mono">{mark}</span>;
    default:
      return <span className="text-gray-400">—</span>;
  }
}

/**
 * Helper to render the student row overall status badge
 */
function renderStatusBadge(
  status: 'PASSED' | 'NG' | 'QUALITATIVE' | 'CAS' | 'INCOMPLETE'
): React.ReactNode {
  switch (status) {
    case 'PASSED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          PASSED
        </span>
      );
    case 'NG':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800">
          <XCircle className="w-3 h-3 text-rose-600" />
          NG
        </span>
      );
    case 'INCOMPLETE':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800">
          <Clock className="w-3 h-3 text-amber-600" />
          INCOMPLETE
        </span>
      );
    case 'CAS':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-100 text-sky-800">
          <HelpCircle className="w-3 h-3 text-sky-600" />
          CAS
        </span>
      );
    case 'QUALITATIVE':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
          <Info className="w-3 h-3 text-indigo-600" />
          QUALITATIVE
        </span>
      );
  }
}

/**
 * Helper to render the rank badge distinguishing official from provisional ranking
 */
function renderRankBadge(row: MatrixStudentRow, isExamPublished: boolean): React.ReactNode {
  if (!row.isComplete) {
    return <span className="text-gray-400 font-medium">—</span>;
  }

  if (isExamPublished && row.rank !== null) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-black bg-blue-100 text-blue-900 border border-blue-200"
        title="Official Published Class Rank"
      >
        <Award className="w-3.5 h-3.5 text-blue-600" />
        Rank #{row.rank}
      </span>
    );
  }

  if (row.isProvisionalRank && row.provisionalRank !== null) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200/80"
        title="Provisional Rank: Estimated draft standing prior to official publication"
      >
        <span className="font-black text-amber-900">#{row.provisionalRank}</span>
        <span className="text-[9px] uppercase font-bold text-amber-700 tracking-tight">
          (Provisional)
        </span>
      </span>
    );
  }

  return <span className="text-gray-400 font-medium">—</span>;
}
