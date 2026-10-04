import React, { useState, useEffect, useMemo } from 'react';
import {
  GraduationCap,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Users,
  Search,
  RefreshCw,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Loader2,
  ChevronRight,
  CheckSquare,
  Square,
  RotateCcw,
  Sliders,
  AlertTriangle,
  UserCheck,
  FileCheck2,
  X
} from 'lucide-react';
import {
  PromotionCandidate,
  PromotionOutcome,
  PromotionBatchResult,
  CANONICAL_CLASS_ORDER,
  getAvailableAcademicYears,
  getNextAcademicClass,
  getPromotionCandidates,
  validateTargetRollAssignments,
  executePromotionBatch
} from '../../lib/academicPromotionEngine';
import { auth } from '../../firebase';

interface AcademicPromotionTabProps {
  allClasses: string[];
  setStatus?: (status: { type: 'success' | 'error'; message: string } | null) => void;
  userRole?: string;
}

export function AcademicPromotionTab({
  allClasses,
  setStatus,
  userRole
}: AcademicPromotionTabProps) {
  const availableYears = useMemo(() => getAvailableAcademicYears(), []);
  const currentYearObj = availableYears.find(y => y.isCurrent) || availableYears[0];
  const nextYearObj = availableYears.find(y => y.bsYear === currentYearObj.bsYear + 1) || availableYears[availableYears.length - 1];

  // 1. Selector States
  const [sourceYear, setSourceYear] = useState<string>(currentYearObj?.id || '2082-2083 B.S.');
  const [sourceClass, setSourceClass] = useState<string>('5');
  const [sourceSection, setSourceSection] = useState<string>('All');

  const [targetYear, setTargetYear] = useState<string>(nextYearObj?.id || '2083-2084 B.S.');
  const [targetClass, setTargetClass] = useState<string>('6');
  const [targetSection, setTargetSection] = useState<string>('A');

  // 2. Candidate Data States
  const [candidates, setCandidates] = useState<PromotionCandidate[]>([]);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 3. Execution & Modal States
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [batchResult, setBatchResult] = useState<PromotionBatchResult | null>(null);

  // Sync target class automatically when source class changes
  useEffect(() => {
    const next = getNextAcademicClass(sourceClass);
    setTargetClass(next.isGraduated ? 'Graduated' : next.nextClass);
  }, [sourceClass]);

  // Load candidate students
  const handleLoadCandidates = async () => {
    setLoadingCandidates(true);
    setBatchResult(null);
    try {
      const data = await getPromotionCandidates(
        sourceYear,
        sourceClass,
        targetYear,
        targetClass,
        sourceSection
      );
      setCandidates(data);
      // Default select all candidates that are not already enrolled
      setSelectedUids(data.filter(c => !c.alreadyEnrolledInTargetYear).map(c => c.studentUid));
      if (data.length === 0) {
        setStatus?.({ type: 'error', message: `No active students found in Class ${sourceClass} for ${sourceYear}.` });
      }
    } catch (err: any) {
      console.error('Failed to load promotion candidates:', err);
      setStatus?.({ type: 'error', message: `Failed to load candidate students: ${err.message}` });
    } finally {
      setLoadingCandidates(false);
    }
  };

  // Filter candidates by search query
  const filteredCandidates = useMemo(() => {
    if (!searchQuery.trim()) return candidates;
    const q = searchQuery.toLowerCase().trim();
    return candidates.filter(
      c =>
        c.studentName.toLowerCase().includes(q) ||
        c.studentId.toLowerCase().includes(q) ||
        (c.emisNumber && c.emisNumber.toLowerCase().includes(q)) ||
        c.currentRoll === q
    );
  }, [candidates, searchQuery]);

  // Outcome counters
  const summaryCounts = useMemo(() => {
    const selected = candidates.filter(c => selectedUids.includes(c.studentUid));
    return {
      total: selected.length,
      promoted: selected.filter(c => c.proposedOutcome === 'PROMOTED').length,
      retained: selected.filter(c => c.proposedOutcome === 'RETAINED').length,
      transferred: selected.filter(c => c.proposedOutcome === 'TRANSFERRED').length,
      graduated: selected.filter(c => c.proposedOutcome === 'GRADUATED').length,
      alreadyEnrolled: candidates.filter(c => c.alreadyEnrolledInTargetYear).length
    };
  }, [candidates, selectedUids]);

  // Roll conflicts check
  const rollValidation = useMemo(() => {
    const selected = candidates.filter(c => selectedUids.includes(c.studentUid));
    return validateTargetRollAssignments(selected);
  }, [candidates, selectedUids]);

  // Update candidate item
  const updateCandidate = (studentUid: string, updates: Partial<PromotionCandidate>) => {
    setCandidates(prev =>
      prev.map(c => (c.studentUid === studentUid ? { ...c, ...updates } : c))
    );
  };

  // Bulk Outcome Setters
  const setAllOutcomes = (outcome: PromotionOutcome) => {
    setCandidates(prev =>
      prev.map(c => {
        if (!selectedUids.includes(c.studentUid)) return c;
        let tClass = c.targetClass;
        if (outcome === 'RETAINED') tClass = c.currentClass;
        else if (outcome === 'GRADUATED') tClass = 'Graduated';
        else if (outcome === 'PROMOTED') tClass = targetClass;
        return { ...c, proposedOutcome: outcome, targetClass: tClass };
      })
    );
  };

  // Auto-sequence target rolls
  const handleAutoSequenceRolls = () => {
    let rollSeq = 1;
    setCandidates(prev =>
      prev.map(c => {
        if (!selectedUids.includes(c.studentUid)) return c;
        if (c.proposedOutcome === 'TRANSFERRED' || c.proposedOutcome === 'GRADUATED') {
          return { ...c, targetRoll: '' };
        }
        const assigned = String(rollSeq++);
        return { ...c, targetRoll: assigned };
      })
    );
    setStatus?.({ type: 'success', message: 'Target roll numbers sequenced numerically (1, 2, 3...).' });
  };

  // Select all / deselect all
  const toggleSelectAll = () => {
    if (selectedUids.length === filteredCandidates.length) {
      setSelectedUids([]);
    } else {
      setSelectedUids(filteredCandidates.map(c => c.studentUid));
    }
  };

  // Execute Batch Promotion
  const handleExecutePromotion = async () => {
    const selectedCandidates = candidates.filter(c => selectedUids.includes(c.studentUid));
    if (selectedCandidates.length === 0) {
      setStatus?.({ type: 'error', message: 'Please select at least one student to promote.' });
      return;
    }

    if (!rollValidation.valid) {
      setStatus?.({ type: 'error', message: rollValidation.conflicts[0].reason });
      return;
    }

    setIsExecuting(true);
    try {
      const currentUser = auth.currentUser;
      const res = await executePromotionBatch(
        selectedCandidates,
        sourceYear,
        targetYear,
        currentUser?.uid || 'admin',
        userRole || 'admin',
        currentUser?.displayName || 'System Administrator'
      );

      setBatchResult(res);
      setShowReviewModal(false);
      setStatus?.({
        type: 'success',
        message: `Promotion executed successfully! Promoted: ${res.promotedCount}, Retained: ${res.retainedCount}, Transferred: ${res.transferredCount}, Graduated: ${res.graduatedCount}.`
      });

      // Reload candidates to reflect updated enrollment status
      await handleLoadCandidates();
    } catch (err: any) {
      console.error('Promotion execution failed:', err);
      setStatus?.({ type: 'error', message: `Promotion failed: ${err.message}` });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-400 text-slate-950">
                ACADEMIC YEAR PROGRESSION
              </span>
              <span className="text-xs text-blue-200 font-semibold">Bikram Sambat (B.S.) Curriculum</span>
            </div>
            <h2 className="text-2xl font-black mt-1 flex items-center gap-2">
              <GraduationCap className="w-6 h-6 text-emerald-400" /> Academic Enrollment & Student Promotion
            </h2>
            <p className="text-blue-100/80 text-xs sm:text-sm mt-1 max-w-3xl">
              Advance students across academic years with immutable historical snapshots. Permanent student identities (STU-ID, EMIS) remain stable while creating governed, year-specific enrollments.
            </p>
          </div>
        </div>
      </div>

      {/* Selector & Context Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <Sliders className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
            Promotion Scope & Class Mapping Configuration
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Source Academic Context */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                1. Source Academic Context (Origin)
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                  Academic Year
                </label>
                <select
                  value={sourceYear}
                  onChange={e => setSourceYear(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100"
                >
                  {availableYears.map(y => (
                    <option key={y.id} value={y.id}>
                      {y.name} {y.isCurrent ? '• (Current)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                  Source Class
                </label>
                <select
                  value={sourceClass}
                  onChange={e => setSourceClass(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100"
                >
                  {CANONICAL_CLASS_ORDER.map(cls => (
                    <option key={cls} value={cls}>
                      Class {cls}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                  Section
                </label>
                <select
                  value={sourceSection}
                  onChange={e => setSourceSection(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100"
                >
                  <option value="All">All Sections</option>
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                </select>
              </div>
            </div>
          </div>

          {/* Target Academic Context */}
          <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/50 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                2. Target Academic Context (Destination)
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block mb-1">
                  Target Academic Year
                </label>
                <select
                  value={targetYear}
                  onChange={e => setTargetYear(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100"
                >
                  {availableYears.map(y => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block mb-1">
                  Target Class
                </label>
                <select
                  value={targetClass}
                  onChange={e => setTargetClass(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100"
                >
                  {CANONICAL_CLASS_ORDER.map(cls => (
                    <option key={cls} value={cls}>
                      Class {cls}
                    </option>
                  ))}
                  <option value="Graduated">Graduated / Alumni</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block mb-1">
                  Target Section
                </label>
                <select
                  value={targetSection}
                  onChange={e => setTargetSection(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100"
                >
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Identity verification active: STU-IDs and historical marksheets remain protected.</span>
          </div>

          <button
            type="button"
            onClick={handleLoadCandidates}
            disabled={loadingCandidates}
            className="px-5 py-2.5 bg-primary text-white font-black text-xs rounded-xl shadow-sm hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loadingCandidates ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>Load Promotion Candidates</span>
          </button>
        </div>
      </div>

      {/* Roll Conflict Banner if Any */}
      {!rollValidation.valid && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl flex items-start gap-3 animate-in fade-in duration-200">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <h4 className="font-bold text-amber-900 dark:text-amber-200">Target Roll Number Conflict Detected</h4>
            <p className="text-amber-800 dark:text-amber-300">
              {rollValidation.conflicts[0].reason}
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Please adjust individual roll numbers or click "Auto-Sequence Rolls" below before confirming promotion.
            </p>
          </div>
        </div>
      )}

      {/* Candidate Students Table Area */}
      {candidates.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs space-y-4">
          {/* Top Bar Summary & Bulk Helpers */}
          <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/40">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                Eligible Students ({candidates.length}) • {summaryCounts.total} Selected
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Review and customize outcomes per student. Click "Confirm & Execute Promotion" when verified.
              </p>
            </div>

            {/* Quick Bulk Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAllOutcomes('PROMOTED')}
                className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-all"
              >
                Set All Promoted
              </button>
              <button
                type="button"
                onClick={() => setAllOutcomes('RETAINED')}
                className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-all"
              >
                Set All Retained
              </button>
              <button
                type="button"
                onClick={handleAutoSequenceRolls}
                className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Auto-Sequence Rolls
              </button>
              <button
                type="button"
                onClick={() => setShowReviewModal(true)}
                disabled={summaryCounts.total === 0 || !rollValidation.valid}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" /> Review & Confirm ({summaryCounts.total})
              </button>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="px-4 sm:px-6 flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by Name, STU-ID, EMIS or Roll..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium"
              />
            </div>
          </div>

          {/* Students Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-black tracking-wider border-y border-slate-200 dark:border-slate-700">
                  <th className="py-3 px-4 w-10 text-center">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="cursor-pointer text-slate-600 dark:text-slate-300"
                    >
                      {selectedUids.length === filteredCandidates.length ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">Permanent Student Identity</th>
                  <th className="py-3 px-4">Current Context ({sourceYear})</th>
                  <th className="py-3 px-4">Governed Outcome</th>
                  <th className="py-3 px-4">Target Class & Section</th>
                  <th className="py-3 px-4 w-28">Target Roll</th>
                  <th className="py-3 px-4">Enrollment Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCandidates.map(c => {
                  const isSelected = selectedUids.includes(c.studentUid);
                  return (
                    <tr
                      key={c.studentUid}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        c.alreadyEnrolledInTargetYear ? 'opacity-70 bg-slate-50/40 dark:bg-slate-900/40' : ''
                      }`}
                    >
                      {/* Select Checkbox */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUids(prev =>
                              prev.includes(c.studentUid)
                                ? prev.filter(id => id !== c.studentUid)
                                : [...prev, c.studentUid]
                            );
                          }}
                          className="cursor-pointer text-slate-600 dark:text-slate-300"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Permanent Identity */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white text-sm">
                          {c.studentName}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                          ID: <span className="font-bold text-indigo-600 dark:text-indigo-400">{c.studentId}</span>
                          {c.emisNumber && <span> • EMIS: {c.emisNumber}</span>}
                        </div>
                      </td>

                      {/* Current Academic Context */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-700 dark:text-slate-200">
                          Class {c.currentClass} (Sec {c.currentSection})
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Roll No: {c.currentRoll || 'None'}
                        </div>
                      </td>

                      {/* Governed Outcome Selector */}
                      <td className="py-3 px-4">
                        <select
                          value={c.proposedOutcome}
                          onChange={e => {
                            const newOutcome = e.target.value as PromotionOutcome;
                            let newTClass = c.targetClass;
                            if (newOutcome === 'RETAINED') newTClass = c.currentClass;
                            else if (newOutcome === 'GRADUATED') newTClass = 'Graduated';
                            else if (newOutcome === 'PROMOTED') newTClass = targetClass;
                            updateCandidate(c.studentUid, {
                              proposedOutcome: newOutcome,
                              targetClass: newTClass
                            });
                          }}
                          className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-100"
                        >
                          <option value="PROMOTED">PROMOTED (Next Class)</option>
                          <option value="RETAINED">RETAINED (Same Class)</option>
                          <option value="TRANSFERRED">TRANSFERRED (Leaving)</option>
                          <option value="GRADUATED">GRADUATED (Passed Out)</option>
                          <option value="INACTIVE">INACTIVE / LEFT</option>
                        </select>
                      </td>

                      {/* Target Class & Section */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={c.targetClass}
                            onChange={e => updateCandidate(c.studentUid, { targetClass: e.target.value })}
                            className="w-20 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold"
                          />
                          <input
                            type="text"
                            value={c.targetSection}
                            onChange={e => updateCandidate(c.studentUid, { targetSection: e.target.value })}
                            className="w-12 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold uppercase text-center"
                          />
                        </div>
                      </td>

                      {/* Target Roll Number */}
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={c.targetRoll}
                          onChange={e => updateCandidate(c.studentUid, { targetRoll: e.target.value })}
                          placeholder="Roll #"
                          className="w-20 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-center"
                        />
                      </td>

                      {/* Status / Conflicts */}
                      <td className="py-3 px-4">
                        {c.alreadyEnrolledInTargetYear ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200">
                            <FileCheck2 className="w-3 h-3" /> Enrolled in {targetYear}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" /> Ready
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review & Confirmation Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                  Confirm Academic Promotion & Enrollment Batch
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-blue-50 dark:bg-blue-950/40 p-3 rounded-xl border border-blue-200 dark:border-blue-800 text-center">
                  <span className="text-[10px] font-black text-blue-600 dark:text-blue-300 uppercase tracking-wider block">
                    Promoted
                  </span>
                  <span className="text-2xl font-black text-blue-900 dark:text-blue-100">
                    {summaryCounts.promoted}
                  </span>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-800 text-center">
                  <span className="text-[10px] font-black text-amber-600 dark:text-amber-300 uppercase tracking-wider block">
                    Retained
                  </span>
                  <span className="text-2xl font-black text-amber-900 dark:text-amber-100">
                    {summaryCounts.retained}
                  </span>
                </div>
                <div className="bg-purple-50 dark:bg-purple-950/40 p-3 rounded-xl border border-purple-200 dark:border-purple-800 text-center">
                  <span className="text-[10px] font-black text-purple-600 dark:text-purple-300 uppercase tracking-wider block">
                    Transferred
                  </span>
                  <span className="text-2xl font-black text-purple-900 dark:text-purple-100">
                    {summaryCounts.transferred}
                  </span>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 text-center">
                  <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-300 uppercase tracking-wider block">
                    Graduated
                  </span>
                  <span className="text-2xl font-black text-emerald-900 dark:text-emerald-100">
                    {summaryCounts.graduated}
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 text-xs space-y-2">
                <div className="font-bold text-slate-800 dark:text-slate-100">
                  Progression Summary:
                </div>
                <div className="text-slate-600 dark:text-slate-300 space-y-1">
                  <div>• Source Context: <span className="font-bold">{sourceYear} • Class {sourceClass} ({sourceSection})</span></div>
                  <div>• Target Context: <span className="font-bold text-emerald-600 dark:text-emerald-400">{targetYear} • Class {targetClass} ({targetSection})</span></div>
                  <div>• Total Selected Students: <span className="font-bold">{summaryCounts.total}</span></div>
                  <div>• Historical marksheets, results, and fee bills: <span className="font-bold text-slate-800 dark:text-slate-200">Preserved 100% Immutably</span></div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 bg-slate-50 dark:bg-slate-800/80">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                disabled={isExecuting}
                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecutePromotion}
                disabled={isExecuting}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Execute & Record Enrollments</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
