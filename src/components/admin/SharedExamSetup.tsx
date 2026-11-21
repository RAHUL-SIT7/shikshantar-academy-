import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  BookOpen,
  FileText,
  Layers,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  ShieldCheck,
  Lock,
  Users,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import {
  AcademicYearConfig,
  subscribeAcademicYears,
  formatAcademicYearDisplayTitle,
} from '../../lib/academicYearEngine';
import {
  normalizeClass,
  getClassConfiguredSubjects,
} from '../../lib/teacherAssignmentEngine';
import {
  SubjectConfigItem,
  validateSubjectConfigItem,
  buildCanonicalExamId,
} from '../../lib/resultPreparationEngine';
import { auth, db } from '../../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

export interface SharedExamSetupContext {
  selectedAcademicYear: string;
  selectedCategory: 'TERMINAL' | 'TEST';
  selectedExam: string;
  testDisplayName?: string;
  instanceId?: string;
  selectedClass: string;
  selectedSection: string;
  examId?: string;
  subjectConfigs: SubjectConfigItem[];
  isConfigValid: boolean;
  validationErrors: string[];
}

interface SharedExamSetupProps {
  allClasses: string[];
  userRole: 'admin' | 'teacher' | 'student';
  initialContext?: SharedExamSetupContext | null;
  onContextChange: (ctx: SharedExamSetupContext) => void;
  onDirtyChange?: (hasProgress: boolean) => void;
}

export const TERMINAL_EXAM_TYPES = [
  { id: 'FIRST_TERMINAL', name: 'First Terminal Examination' },
  { id: 'SECOND_TERMINAL', name: 'Second Terminal Examination' },
  { id: 'THIRD_TERMINAL', name: 'Third Terminal Examination' },
  { id: 'FINAL_TERMINAL', name: 'Final Terminal Examination' },
];

export const DEFAULT_SECTIONS = ['A', 'B', 'C'];

const WIZARD_STEPS = [
  { id: 1, title: 'Exam Details', subtitle: 'Year, Term, Class & Section' },
  { id: 2, title: 'Subjects & Marks', subtitle: 'Independent TH/PR (35% CDC)' },
  { id: 3, title: 'Teacher Coverage', subtitle: 'Verify Assigned Teachers' },
  { id: 4, title: 'Review & Confirm', subtitle: 'Lock Connected Setup' },
];

export function SharedExamSetup({
  allClasses,
  initialContext,
  onContextChange,
  onDirtyChange,
}: SharedExamSetupProps) {
  const [step, setStep] = useState<number>(initialContext?.isConfigValid ? 4 : 1);
  const [managedYears, setManagedYears] = useState<AcademicYearConfig[]>([]);

  useEffect(() => {
    const unsub = subscribeAcademicYears((years) => setManagedYears(years));
    return () => unsub();
  }, []);

  // Step 1 States
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>(
    initialContext?.selectedAcademicYear || ''
  );
  const [category, setCategory] = useState<'TERMINAL' | 'TEST'>(
    initialContext?.selectedCategory || 'TERMINAL'
  );
  const [selectedTerminal, setSelectedTerminal] = useState<string>(() => {
    if (!initialContext?.selectedExam) return '';
    const match = TERMINAL_EXAM_TYPES.find(
      (t) => t.id === initialContext.selectedExam || t.name === initialContext.selectedExam
    );
    return match ? match.id : initialContext.selectedExam;
  });
  const [testDisplayName, setTestDisplayName] = useState<string>(
    initialContext?.testDisplayName || ''
  );
  const [selectedClass, setSelectedClass] = useState<string>(
    initialContext?.selectedClass ? normalizeClass(initialContext.selectedClass) : ''
  );
  const [selectedSection, setSelectedSection] = useState<string>(
    initialContext?.selectedSection || 'A'
  );

  // Enforce PG through Grade 10 strictly
  const validSchoolClasses = useMemo(
    () =>
      (allClasses || []).filter((c) => {
        const norm = normalizeClass(c);
        return !['11', '12'].includes(norm);
      }),
    [allClasses]
  );

  // Terminal Publication Availability
  const [terminalAvailability, setTerminalAvailability] = useState<{
    terminals: Record<string, { examId: string; status: string; isLocked: boolean }>;
    publishedCount: number;
    allFourPublished: boolean;
  } | null>(null);

  useEffect(() => {
    let isCancelled = false;
    const fetchAvailability = async () => {
      if (!selectedAcademicYear || !selectedClass || !selectedSection) {
        setTerminalAvailability(null);
        return;
      }
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;
        const params = new URLSearchParams({
          academicYear: selectedAcademicYear,
          class: normalizeClass(selectedClass),
          section: selectedSection,
        });
        const res = await fetch(`/api/exams/terminal-availability?${params.toString()}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && data.success) {
            setTerminalAvailability({
              terminals: data.terminals || {},
              publishedCount: data.publishedCount || 0,
              allFourPublished: Boolean(data.allFourPublished),
            });
          }
        }
      } catch (_) {}
    };
    fetchAvailability();
    return () => {
      isCancelled = true;
    };
  }, [selectedAcademicYear, selectedClass, selectedSection]);

  const currentYearObj = useMemo(
    () => managedYears.find((y) => y.isCurrent) || managedYears.find((y) => y.status === 'ACTIVE') || managedYears[0],
    [managedYears]
  );
  const currentYearId = currentYearObj?.academicYearId || currentYearObj?.id || '2083';
  const currentYearBsNum = Number(currentYearObj?.bsYear) || parseInt(currentYearId, 10) || 2083;
  const currentYearTitle = currentYearObj?.displayTitle || `${currentYearId} BS`;

  // Auto-select current active academic year once loaded if none chosen yet
  useEffect(() => {
    if (!selectedAcademicYear && currentYearId) {
      setSelectedAcademicYear(currentYearId);
    }
  }, [selectedAcademicYear, currentYearId]);

  const selectedYearObj = useMemo(
    () =>
      managedYears.find(
        (y) => y.id === selectedAcademicYear || y.academicYearId === selectedAcademicYear
      ),
    [managedYears, selectedAcademicYear]
  );
  const selectedYearBsNum = Number(selectedYearObj?.bsYear) || parseInt(String(selectedAcademicYear || currentYearBsNum), 10) || currentYearBsNum;
  const isArchivedYear = selectedYearObj?.status === 'ARCHIVED';
  const isFutureOrInactiveYear = Boolean(
    selectedAcademicYear && (selectedYearObj?.status === 'INACTIVE' || selectedYearBsNum > currentYearBsNum)
  );

  // Notify parent when wizard has unsaved setup progress
  useEffect(() => {
    if (!onDirtyChange) return;
    const hasProgress =
      step > 1 ||
      Boolean(selectedTerminal || testDisplayName.trim() || selectedClass);
    onDirtyChange(hasProgress);
  }, [onDirtyChange, step, selectedTerminal, testDisplayName, selectedClass]);

  useEffect(() => {
    return () => {
      onDirtyChange?.(false);
    };
  }, [onDirtyChange]);

  // Step 2: Subject Configurations (auto-load base + active approved custom_subjects with CDC 35% defaults)
  const [subjectConfigs, setSubjectConfigs] = useState<SubjectConfigItem[]>(
    initialContext?.subjectConfigs || []
  );
  const [isValidatedSuccessfully, setIsValidatedSuccessfully] = useState<boolean>(
    Boolean(initialContext?.isConfigValid)
  );
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadClassSubjects = async () => {
      if (!selectedClass || subjectConfigs.length > 0) return;
      const normClass = normalizeClass(selectedClass);
      const baseNames = getClassConfiguredSubjects(normClass);
      const configs: SubjectConfigItem[] = baseNames.map((sName) => ({
        subjectKey: sName,
        subjectName: sName,
        enabled: true,
        hasTh: true,
        thFullMarks: 75,
        thPassMarks: 27, // Nepal CDC 35% of 75 = 26.25 -> 27
        hasPr: true,
        prFullMarks: 25,
        prPassMarks: 9, // Nepal CDC 35% of 25 = 8.75 -> 9
      }));

      try {
        const csSnap = await getDocs(collection(db, 'custom_subjects'));
        csSnap.forEach((docSnap) => {
          const cs = docSnap.data();
          if (cs.isActive === false || cs.status === 'ARCHIVED') return;
          const appliesToAll =
            cs.applyToAllClasses === true || !Array.isArray(cs.classes) || cs.classes.length === 0;
          const matches =
            appliesToAll ||
            (Array.isArray(cs.classes) &&
              cs.classes.some((c: string) => normalizeClass(c) === normClass));
          if (matches && cs.name) {
            const name = String(cs.name).trim();
            if (!configs.some((c) => c.subjectName.toLowerCase() === name.toLowerCase())) {
              const thFm = Number(cs.thFullMarks ?? cs.fullMarks ?? 75);
              const prFm = Number(cs.prFullMarks ?? 0);
              const hasTh = cs.hasTh !== undefined ? Boolean(cs.hasTh) : thFm > 0;
              const hasPr = cs.hasPr !== undefined ? Boolean(cs.hasPr) && prFm > 0 : prFm > 0;
              configs.push({
                subjectKey: name,
                subjectName: name,
                enabled: true,
                hasTh,
                thFullMarks: hasTh ? thFm : 0,
                thPassMarks: hasTh ? Number(cs.thPassMarks ?? Math.ceil(thFm * 0.35)) : 0,
                hasPr,
                prFullMarks: hasPr ? prFm : 0,
                prPassMarks: hasPr ? Number(cs.prPassMarks ?? Math.ceil(prFm * 0.35)) : 0,
              });
            }
          }
        });
      } catch (_) {}

      if (!cancelled) {
        setSubjectConfigs(configs);
        setIsValidatedSuccessfully(false);
      }
    };
    loadClassSubjects();
    return () => {
      cancelled = true;
    };
  }, [selectedClass, subjectConfigs.length]);

  // Step 3: Load teachers to verify Subject Teacher & Class Teacher coverage
  const [teachersList, setTeachersList] = useState<any[]>([]);
  useEffect(() => {
    if (step !== 3 && step !== 4) return;
    let cancelled = false;
    const loadTeachers = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'teacher')));
        if (!cancelled) {
          setTeachersList(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
        }
      } catch (_) {}
    };
    loadTeachers();
    return () => {
      cancelled = true;
    };
  }, [step]);

  const getAssignedTeachersForSubject = (subjectName: string) => {
    const normCls = normalizeClass(selectedClass);
    const normSub = subjectName.trim().toLowerCase();
    return teachersList.filter((t) => {
      if (t.isDeleted || t.status === 'INACTIVE') return false;
      // Check assignedSubjects or subjectAssignments or classTeacher match
      const isClassTeacher =
        t.isClassTeacher &&
        normalizeClass(String(t.classTeacherClass || t.class || '')) === normCls &&
        (!t.section || t.section === selectedSection);
      const hasAssignment = Array.isArray(t.subjectAssignments)
        ? t.subjectAssignments.some(
            (a: any) =>
              normalizeClass(String(a.class || a.className || '')) === normCls &&
              String(a.subject || a.subjectName || '').trim().toLowerCase() === normSub
          )
        : false;
      const legacyMatch =
        Array.isArray(t.assignedClasses) &&
        t.assignedClasses.some((c: string) => normalizeClass(c) === normCls) &&
        Array.isArray(t.assignedSubjects) &&
        t.assignedSubjects.some((s: string) => String(s).trim().toLowerCase() === normSub);
      return isClassTeacher || hasAssignment || legacyMatch;
    });
  };

  const handleConfigChange = (index: number, field: keyof SubjectConfigItem, value: any) => {
    const updated = [...subjectConfigs];
    const next = { ...updated[index], [field]: value };
    // Auto-calculate 35% Nepal CDC pass mark when full marks changes
    if (field === 'thFullMarks' && Number(value) > 0) {
      next.thPassMarks = Math.ceil(Number(value) * 0.35);
    }
    if (field === 'prFullMarks' && Number(value) > 0) {
      next.prPassMarks = Math.ceil(Number(value) * 0.35);
    }
    if (field === 'hasPr' && !value) {
      next.prFullMarks = 0;
      next.prPassMarks = 0;
    } else if (field === 'hasPr' && value && (!next.prFullMarks || next.prFullMarks <= 0)) {
      next.prFullMarks = 25;
      next.prPassMarks = 9;
    }
    if (field === 'hasTh' && !value) {
      next.thFullMarks = 0;
      next.thPassMarks = 0;
    } else if (field === 'hasTh' && value && (!next.thFullMarks || next.thFullMarks <= 0)) {
      next.thFullMarks = 75;
      next.thPassMarks = 27;
    }
    updated[index] = next;
    setSubjectConfigs(updated);
    setIsValidatedSuccessfully(false);
  };

  const handleAddCustomSubject = () => {
    const name = `Custom Subject ${subjectConfigs.length + 1}`;
    setSubjectConfigs([
      ...subjectConfigs,
      {
        subjectKey: name,
        subjectName: name,
        enabled: true,
        hasTh: true,
        thFullMarks: 75,
        thPassMarks: 27,
        hasPr: false,
        prFullMarks: 0,
        prPassMarks: 0,
      },
    ]);
    setIsValidatedSuccessfully(false);
  };

  const handleRemoveSubject = (index: number) => {
    setSubjectConfigs(subjectConfigs.filter((_, i) => i !== index));
    setIsValidatedSuccessfully(false);
  };

  const validateStep1 = (): string[] => {
    const errs: string[] = [];
    if (!selectedAcademicYear) errs.push('Select an Academic Session.');
    else if (isFutureOrInactiveYear) {
      errs.push(`Current academic year is ${currentYearTitle}. ${formatAcademicYearDisplayTitle(selectedAcademicYear, managedYears)} is an upcoming/inactive session — please select ${currentYearTitle}.`);
    } else if (isArchivedYear) {
      errs.push(`Selected Academic Session is ARCHIVED and read-only. Please select ${currentYearTitle}.`);
    }
    if (category === 'TERMINAL') {
      if (!selectedTerminal) errs.push('Select a Terminal Examination.');
      else if (terminalAvailability?.terminals[selectedTerminal]?.isLocked) {
        errs.push('Selected Terminal Examination is already PUBLISHED and locked.');
      }
    } else if (!testDisplayName.trim()) {
      errs.push('Enter a Test Display Name.');
    }
    if (!selectedClass) errs.push('Select a Class (PG–Grade 10).');
    if (!selectedSection) errs.push('Select a Section.');
    return errs;
  };

  const validateStep2 = (): string[] => {
    const errs: string[] = [];
    const enabled = subjectConfigs.filter((s) => s.enabled !== false);
    if (enabled.length === 0) {
      errs.push('At least one subject must be enabled.');
    }
    const seen = new Set<string>();
    enabled.forEach((item, idx) => {
      const name = (item.subjectName || '').trim();
      if (!name) errs.push(`Subject #${idx + 1}: Name cannot be empty.`);
      const key = name.toLowerCase().replace(/\s+/g, '');
      if (seen.has(key)) errs.push(`Duplicate subject "${name}" detected.`);
      else seen.add(key);
      const res = validateSubjectConfigItem(item);
      if (!res.isValid) errs.push(`${name || `Subject #${idx + 1}`}: ${res.error}`);
    });
    return errs;
  };

  const handleNextStep = () => {
    if (step === 1) {
      const errs = validateStep1();
      setValidationErrors(errs);
      if (errs.length === 0) setStep(2);
    } else if (step === 2) {
      const errs = validateStep2();
      setValidationErrors(errs);
      if (errs.length === 0) setStep(3);
    } else if (step === 3) {
      setValidationErrors([]);
      setStep(4);
    }
  };

  const handleConfirmSetup = () => {
    const errs = [...validateStep1(), ...validateStep2()];
    setValidationErrors(errs);
    if (errs.length > 0) {
      setIsValidatedSuccessfully(false);
      return;
    }

    const enabledSubjects = subjectConfigs.filter((s) => s.enabled !== false);
    const activeExamName =
      category === 'TERMINAL'
        ? TERMINAL_EXAM_TYPES.find((t) => t.id === selectedTerminal)?.name || selectedTerminal
        : testDisplayName.trim();

    const computedExamId =
      category === 'TERMINAL'
        ? buildCanonicalExamId(selectedTerminal, selectedClass, selectedSection, selectedAcademicYear)
        : undefined;

    setIsValidatedSuccessfully(true);
    onContextChange({
      selectedAcademicYear,
      selectedCategory: category,
      selectedExam: activeExamName,
      testDisplayName: category === 'TEST' ? testDisplayName.trim() : undefined,
      selectedClass: normalizeClass(selectedClass),
      selectedSection,
      examId: computedExamId,
      subjectConfigs: enabledSubjects,
      isConfigValid: true,
      validationErrors: [],
    });
  };

  const enabledSubjects = subjectConfigs.filter((s) => s.enabled !== false);
  const activeExamDisplay =
    category === 'TERMINAL'
      ? TERMINAL_EXAM_TYPES.find((t) => t.id === selectedTerminal)?.name || selectedTerminal || '-'
      : testDisplayName.trim() || '-';

  return (
    <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 sm:p-6 mb-6">
      {/* Guided 4-Step Progress Stepper */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 mb-5">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
            Connected Examination Setup
          </span>
          <h2 className="text-lg font-bold text-slate-900">
            Step {step} of 4: {WIZARD_STEPS[step - 1].title}
          </h2>
        </div>

        {isValidatedSuccessfully && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Setup Confirmed — Ready to Initialize Below
          </span>
        )}
      </div>

      {/* Stepper Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        {WIZARD_STEPS.map((s) => {
          const isActive = step === s.id;
          const isCompleted = step > s.id || isValidatedSuccessfully;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (s.id < step || isValidatedSuccessfully) {
                  setValidationErrors([]);
                  setStep(s.id);
                }
              }}
              className={`text-left p-2.5 rounded-xl border transition-all ${
                isActive
                  ? 'bg-indigo-50 border-indigo-400 text-indigo-950'
                  : isCompleted
                  ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 hover:bg-emerald-50'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : isCompleted
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-300 text-slate-700'
                  }`}
                >
                  {s.id}
                </span>
                <span className="text-xs font-bold truncate">{s.title}</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 truncate">{s.subtitle}</p>
            </button>
          );
        })}
      </div>

      {/* STEP 1: Examination Details */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" /> Academic Session
              </label>
              <select
                value={selectedAcademicYear}
                onChange={(e) => {
                  setSelectedAcademicYear(e.target.value);
                  setIsValidatedSuccessfully(false);
                }}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm font-semibold"
              >
                <option value="">-- Select Session --</option>
                {managedYears.map((y) => {
                  const isUpcoming = y.status === 'INACTIVE' || Number(y.bsYear) > currentYearBsNum;
                  return (
                    <option key={y.id} value={y.id}>
                      {formatAcademicYearDisplayTitle(y.id, managedYears)}{' '}
                      {y.isCurrent
                        ? '(Current)'
                        : isUpcoming
                        ? '(Upcoming — Inactive)'
                        : y.status === 'ARCHIVED'
                        ? '(Archived — Read-Only)'
                        : '(Past)'}
                    </option>
                  );
                })}
              </select>
              {isFutureOrInactiveYear && (
                <div className="mt-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 space-y-1">
                  <p className="flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    Current academic year is {currentYearTitle}.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAcademicYear(currentYearId);
                      setIsValidatedSuccessfully(false);
                    }}
                    className="text-[11px] font-bold text-indigo-700 hover:underline"
                  >
                    Switch to {currentYearTitle} &rarr;
                  </button>
                </div>
              )}
              {isArchivedYear && !isFutureOrInactiveYear && (
                <p className="mt-1 text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Archived session (Read-Only)
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-600" /> Exam Category
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCategory('TERMINAL');
                    setIsValidatedSuccessfully(false);
                  }}
                  className={`py-2 px-3 rounded-lg font-bold text-xs border ${
                    category === 'TERMINAL'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  Terminal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCategory('TEST');
                    setIsValidatedSuccessfully(false);
                  }}
                  className={`py-2 px-3 rounded-lg font-bold text-xs border ${
                    category === 'TEST'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  Test
                </button>
              </div>
            </div>

            <div>
              {category === 'TERMINAL' ? (
                <>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-600" /> Terminal Exam
                  </label>
                  <select
                    value={selectedTerminal}
                    onChange={(e) => {
                      setSelectedTerminal(e.target.value);
                      setIsValidatedSuccessfully(false);
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm font-semibold"
                  >
                    <option value="">-- Select Terminal --</option>
                    {TERMINAL_EXAM_TYPES.map((t) => {
                      const isLocked = terminalAvailability?.terminals[t.id]?.isLocked;
                      return (
                        <option key={t.id} value={t.id} disabled={isLocked}>
                          {t.name} {isLocked ? '(Published - Locked)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </>
              ) : (
                <>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" /> Test Name
                  </label>
                  <input
                    type="text"
                    value={testDisplayName}
                    onChange={(e) => {
                      setTestDisplayName(e.target.value);
                      setIsValidatedSuccessfully(false);
                    }}
                    placeholder="e.g. Unit Test 1"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm font-semibold"
                  />
                </>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> Class (PG–10) &amp; Section
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={selectedClass}
                  onChange={(e) => {
                    setSelectedClass(e.target.value);
                    setSubjectConfigs([]);
                    setIsValidatedSuccessfully(false);
                  }}
                  className="w-full px-2.5 py-2 rounded-lg bg-white border border-slate-300 text-sm font-semibold"
                >
                  <option value="">Class</option>
                  {validSchoolClasses.map((c) => (
                    <option key={c} value={normalizeClass(c)}>
                      Class {normalizeClass(c)}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedSection}
                  onChange={(e) => {
                    setSelectedSection(e.target.value);
                    setIsValidatedSuccessfully(false);
                  }}
                  className="w-full px-2.5 py-2 rounded-lg bg-white border border-slate-300 text-sm font-semibold"
                >
                  {DEFAULT_SECTIONS.map((sec) => (
                    <option key={sec} value={sec}>
                      Sec {sec}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {terminalAvailability?.allFourPublished && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                All 4 Terminal Examinations for Class {normalizeClass(selectedClass)} ({selectedSection}) are already published.
              </span>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Subject Configuration */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-600">
              Configure independent Theory (TH) and Practical (PR) marks for Class{' '}
              <strong>{normalizeClass(selectedClass)}</strong>. Pass marks auto-default to Nepal CDC 35%.
            </p>
            <button
              type="button"
              onClick={handleAddCustomSubject}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs inline-flex items-center gap-1.5 border border-slate-300"
            >
              <Plus className="w-3.5 h-3.5" /> Add Subject
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 w-12 text-center">Use</th>
                  <th className="py-2.5 px-3">Subject Name</th>
                  <th className="py-2.5 px-3 text-center">Theory (FM / PM)</th>
                  <th className="py-2.5 px-3 text-center">Practical (FM / PM)</th>
                  <th className="py-2.5 px-3 w-12 text-center">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {subjectConfigs.map((item, idx) => (
                  <tr key={idx} className={item.enabled !== false ? '' : 'bg-slate-50 opacity-60'}>
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={item.enabled !== false}
                        onChange={(e) => handleConfigChange(idx, 'enabled', e.target.checked)}
                        className="w-4 h-4 accent-indigo-600"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={item.subjectName || ''}
                        onChange={(e) => handleConfigChange(idx, 'subjectName', e.target.value)}
                        disabled={item.enabled === false}
                        className="w-full px-2.5 py-1 rounded border border-slate-300 font-semibold text-slate-900 disabled:bg-slate-100"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-center gap-2">
                        <label className="flex items-center gap-1 font-bold text-slate-700">
                          <input
                            type="checkbox"
                            checked={item.hasTh === true}
                            onChange={(e) => handleConfigChange(idx, 'hasTh', e.target.checked)}
                            disabled={item.enabled === false}
                          />
                          TH
                        </label>
                        {item.hasTh && item.enabled !== false && (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              value={item.thFullMarks ?? 75}
                              onChange={(e) => handleConfigChange(idx, 'thFullMarks', Number(e.target.value))}
                              className="w-14 px-1.5 py-1 rounded border border-slate-300 font-mono text-center font-bold"
                            />
                            <span className="text-slate-400">/</span>
                            <input
                              type="number"
                              min={1}
                              value={item.thPassMarks ?? 27}
                              onChange={(e) => handleConfigChange(idx, 'thPassMarks', Number(e.target.value))}
                              className="w-14 px-1.5 py-1 rounded border border-slate-300 font-mono text-center font-bold"
                            />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-center gap-2">
                        <label className="flex items-center gap-1 font-bold text-slate-700">
                          <input
                            type="checkbox"
                            checked={item.hasPr === true}
                            onChange={(e) => handleConfigChange(idx, 'hasPr', e.target.checked)}
                            disabled={item.enabled === false}
                          />
                          PR
                        </label>
                        {item.hasPr && item.enabled !== false && (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              value={item.prFullMarks ?? 25}
                              onChange={(e) => handleConfigChange(idx, 'prFullMarks', Number(e.target.value))}
                              className="w-14 px-1.5 py-1 rounded border border-slate-300 font-mono text-center font-bold"
                            />
                            <span className="text-slate-400">/</span>
                            <input
                              type="number"
                              min={1}
                              value={item.prPassMarks ?? 9}
                              onChange={(e) => handleConfigChange(idx, 'prPassMarks', Number(e.target.value))}
                              className="w-14 px-1.5 py-1 rounded border border-slate-300 font-mono text-center font-bold"
                            />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveSubject(idx)}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                        aria-label="Remove subject"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STEP 3: Teacher Assignment Verification */}
      {step === 3 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Users className="w-4 h-4 text-indigo-600" />
            <span>
              Verify Subject Teacher assignments for Class <strong>{normalizeClass(selectedClass)}</strong> (Sec{' '}
              <strong>{selectedSection}</strong>). Administrators can also enter or review any subject directly.
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {enabledSubjects.map((sub) => {
              const assigned = getAssignedTeachersForSubject(sub.subjectName);
              return (
                <div
                  key={sub.subjectName}
                  className={`p-3 rounded-xl border text-xs ${
                    assigned.length > 0
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : 'bg-amber-50/50 border-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{sub.subjectName}</span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {sub.hasTh ? `TH:${sub.thFullMarks}` : ''}
                      {sub.hasTh && sub.hasPr ? ' ' : ''}
                      {sub.hasPr ? `PR:${sub.prFullMarks}` : ''}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    {assigned.length > 0 ? (
                      <p className="text-emerald-800 font-semibold">
                        Assigned: {assigned.map((t) => t.fullName || t.name || t.email).join(', ')}
                      </p>
                    ) : (
                      <p className="text-amber-800 font-medium">
                        No dedicated Subject Teacher mapped (Admin can assign under User Management or enter marks directly).
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 4: Review & Confirm */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <p className="text-slate-500 uppercase text-[10px] font-bold">Academic Session</p>
              <p className="font-bold text-slate-900 mt-0.5">
                {formatAcademicYearDisplayTitle(selectedAcademicYear, managedYears)}
              </p>
            </div>
            <div>
              <p className="text-slate-500 uppercase text-[10px] font-bold">Examination</p>
              <p className="font-bold text-slate-900 mt-0.5">{activeExamDisplay}</p>
            </div>
            <div>
              <p className="text-slate-500 uppercase text-[10px] font-bold">Class &amp; Section</p>
              <p className="font-bold text-slate-900 mt-0.5">
                Class {normalizeClass(selectedClass)} (Section {selectedSection})
              </p>
            </div>
            <div>
              <p className="text-slate-500 uppercase text-[10px] font-bold">Enabled Subjects</p>
              <p className="font-bold text-indigo-700 mt-0.5">{enabledSubjects.length} Subjects</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {enabledSubjects.map((sub) => (
              <span
                key={sub.subjectName}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800"
              >
                {sub.subjectName}{' '}
                <span className="text-slate-500 font-normal">
                  ({sub.hasTh ? `TH ${sub.thFullMarks}/${sub.thPassMarks}` : ''}
                  {sub.hasTh && sub.hasPr ? ' + ' : ''}
                  {sub.hasPr ? `PR ${sub.prFullMarks}/${sub.prPassMarks}` : ''})
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs">
          <p className="font-bold mb-1">Please fix the following before continuing:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Step Navigation Footer */}
      <div className="flex items-center justify-between pt-4 mt-5 border-t border-slate-100">
        <button
          type="button"
          disabled={step === 1}
          onClick={() => {
            setValidationErrors([]);
            setStep((s) => Math.max(1, s - 1));
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>

        {step < 4 ? (
          <button
            type="button"
            disabled={isArchivedYear}
            onClick={handleNextStep}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-300"
          >
            Next Step <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={isArchivedYear}
            onClick={handleConfirmSetup}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-slate-300"
          >
            <CheckCircle2 className="w-4 h-4" />
            {isValidatedSuccessfully ? 'Setup Confirmed' : 'Confirm Setup & Proceed'}
          </button>
        )}
      </div>
    </div>
  );
}
