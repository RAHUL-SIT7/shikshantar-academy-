import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Clock, 
  Edit3, 
  Save, 
  Send, 
  Check, 
  ShieldCheck, 
  Eye, 
  RefreshCw, 
  UserCheck, 
  FileText, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  BarChart3,
  X, 
  BookOpen, 
  GraduationCap, 
  Lock, 
  Mail, 
  Bell, 
  Search,
  MessageSquare,
  Users,
  Calendar,
  Unlock,
  Trash2,
  ArrowLeft,
  SlidersHorizontal
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { EmptyCellsModal, EmptyCellInfo } from './EmptyCellsModal';
import { ModalPortal } from '../common/ModalPortal';
import { db, auth } from '../../firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  writeBatch,
  onSnapshot
} from 'firebase/firestore';
import { recordAuditLog } from '../../lib/auditLogger';
import { 
  normalizeClass, 
  getClassConfiguredSubjects, 
  TeachingAssignment 
} from '../../lib/teacherAssignmentEngine';
import { 
  canTeacherAccessClass, 
  canTeacherAccessSubject, 
  canPublishClassResult, 
  isPrimaryClassTeacher, 
  resolveSubjectTeachersForClass, 
  computeSubjectPreparationStatus, 
  validatePrePublication, 
  calculateClassRanks, 
  buildCanonicalExamId,
  getCanonicalSection,
  SubjectConfigItem, 
  StudentMarkEntry, 
  SubjectTeacherResolution,
  ExamPreparationStatus,
  SubjectPreparationStatus,
  filterEligibleStudentsFromRaw,
  computeSubjectWorkflowStatus,
  CANONICAL_TERMINAL_EXAMS
} from '../../lib/resultPreparationEngine';
import { SharedExamSetupContext } from './SharedExamSetup';
import { getNepalGPA, getGrade } from './ManualEntryTab';
import { ClassResultMatrix } from './ClassResultMatrix';
import { generateClassResultMatrix } from '../../lib/classResultMatrixEngine';
import { getAvailableAcademicYears } from '../../lib/academicPromotionEngine';
import {
  AcademicYearConfig,
  subscribeAcademicYears,
  createAcademicYear,
  seedDefaultAcademicYearsIfEmpty,
  formatAcademicYearDisplayTitle
} from '../../lib/academicYearEngine';

interface ResultPreparationTabProps {
  EXAM_TYPES: string[];
  allClasses: string[];
  data: any[];
  setStatus: (status: { type: 'success' | 'error' | 'info'; message: string } | null) => void;
  userRole: 'admin' | 'teacher' | 'student';
  assignedClasses?: string[];
  assignedSubjects?: string[];
  teacherProfile?: any;
  initialContext?: SharedExamSetupContext | null;
  onNavigateToManual?: (context: {
    selectedAcademicYear: string;
    selectedExam: string;
    selectedClass: string;
    selectedSection: string;
    targetSubject: string;
  }) => void;
  onOpenNewSetup?: () => void;
  onExamOpened?: () => void;
  onWorkflowGuardChange?: (guard: {
    isActive: boolean;
    isDirty: boolean;
    workflowName: string;
    contextSummary?: string;
  } | null) => void;
}

const DEFAULT_SECTIONS = ['A', 'B', 'C'];

export function ResultPreparationTab({
  EXAM_TYPES,
  allClasses,
  data,
  setStatus,
  userRole,
  assignedClasses,
  assignedSubjects,
  teacherProfile,
  initialContext,
  onNavigateToManual,
  onOpenNewSetup,
  onExamOpened,
  onWorkflowGuardChange
}: ResultPreparationTabProps) {
  const workspaceTopRef = useRef<HTMLDivElement>(null);
  const [showQuickSelector, setShowQuickSelector] = useState(false);

  const scrollWorkspaceToTop = () => {
    requestAnimationFrame(() => {
      try {
        const scrollContainer = document.querySelector('[data-portal-scroll-container="true"]') as HTMLElement | null;
        if (workspaceTopRef.current) {
          workspaceTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (scrollContainer) {
          scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } catch {}
    });
  };
  // Examination Management is Connected-Only (Option 1 Shared Setup Required)
  type ExaminationMode = 'CONNECTED' | 'INVALID_SHARED_CONFIG';

  const currentMode: ExaminationMode = useMemo(() => {
    if (initialContext?.isConfigValid) return 'CONNECTED';
    return 'INVALID_SHARED_CONFIG';
  }, [initialContext]);

  const isConnected = currentMode === 'CONNECTED';
  const isInvalidSharedConfig = currentMode === 'INVALID_SHARED_CONFIG';

  // Real-time Firestore managed academic years
  const [managedYears, setManagedYears] = useState<AcademicYearConfig[]>([]);
  const [isAddYearModalOpen, setIsAddYearModalOpen] = useState(false);
  const [newYearBsInput, setNewYearBsInput] = useState('');
  const [newYearTitleInput, setNewYearTitleInput] = useState('');
  const [isSubmittingNewYear, setIsSubmittingNewYear] = useState(false);

  useEffect(() => {
    const unsub = subscribeAcademicYears(async (years) => {
      if (years.length === 0 && userRole === 'admin') {
        try {
          const seeded = await seedDefaultAcademicYearsIfEmpty();
          setManagedYears(seeded);
        } catch (_) {
          setManagedYears(years);
        }
      } else {
        setManagedYears(years);
      }
    });
    return () => unsub();
  }, [userRole]);

  // Load configured Bikram Sambat academic years dynamically
  const availableAcademicYears = useMemo(() => getAvailableAcademicYears(managedYears), [managedYears]);
  const currentYearObj = useMemo(
    () => availableAcademicYears.find(y => y.isCurrent) || availableAcademicYears[0] || { id: '2083', name: '2083 BS', bsYear: 2083, isCurrent: true, status: 'ACTIVE' as const },
    [availableAcademicYears]
  );
  const defaultAcademicYear = currentYearObj.id || '2083';
  const currentBsYearNum = currentYearObj.bsYear || parseInt(defaultAcademicYear, 10) || 2083;
  const currentAcademicYearTitle = currentYearObj.name || `${defaultAcademicYear} BS`;

  // 1. Selector States (Default session to current active academic year)
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>(
    initialContext?.selectedAcademicYear || '2083'
  );
  useEffect(() => {
    if (!selectedAcademicYear && defaultAcademicYear) {
      setSelectedAcademicYear(defaultAcademicYear);
    }
  }, [selectedAcademicYear, defaultAcademicYear]);

  const selectedQuickYearObj = useMemo(
    () => availableAcademicYears.find(y => y.id === selectedAcademicYear),
    [availableAcademicYears, selectedAcademicYear]
  );
  const isQuickSelectFutureOrInactive = Boolean(
    selectedAcademicYear &&
    (selectedQuickYearObj?.status === 'INACTIVE' ||
      (selectedQuickYearObj?.bsYear || parseInt(selectedAcademicYear, 10) || currentBsYearNum) > currentBsYearNum)
  );

  const [selectedClass, setSelectedClass] = useState<string>(
    initialContext?.selectedClass ? normalizeClass(initialContext.selectedClass) : ''
  );
  const [selectedSection, setSelectedSection] = useState<string>(
    initialContext?.selectedSection || ''
  );
  const [selectedExam, setSelectedExam] = useState<string>(
    initialContext?.selectedExam || ''
  );

  // Synchronize when initialContext changes and is valid (Connected Mode)
  useEffect(() => {
    if (initialContext?.isConfigValid) {
      if (initialContext.selectedAcademicYear) setSelectedAcademicYear(initialContext.selectedAcademicYear);
      if (initialContext.selectedClass) setSelectedClass(normalizeClass(initialContext.selectedClass));
      if (initialContext.selectedSection) setSelectedSection(initialContext.selectedSection);
      if (initialContext.selectedExam) setSelectedExam(initialContext.selectedExam);
      if (initialContext.examId) setActiveExamId(initialContext.examId);
    }
  }, [initialContext]);

  const { adminTier } = useAuth();

  // Admin Progress Monitoring State
  const [isMonitoringOpen, setIsMonitoringOpen] = useState<boolean>(true);
  const [examMonitoringList, setExamMonitoringList] = useState<any[]>([]);
  const [loadingMonitoring, setLoadingMonitoring] = useState<boolean>(false);
  const [monitoringYearFilter, setMonitoringYearFilter] = useState<string>(
    initialContext?.selectedAcademicYear || '2083'
  );
  const monitoringYearObj = useMemo(
    () => availableAcademicYears.find(y => y.id === monitoringYearFilter),
    [availableAcademicYears, monitoringYearFilter]
  );
  const isMonitoringFutureOrInactive = Boolean(
    monitoringYearFilter &&
    monitoringYearFilter !== 'all' &&
    (monitoringYearObj?.status === 'INACTIVE' ||
      (monitoringYearObj?.bsYear || parseInt(monitoringYearFilter, 10) || currentBsYearNum) > currentBsYearNum)
  );
  const [monitoringClassFilter, setMonitoringClassFilter] = useState<string>('all');
  const [expandedExamCards, setExpandedExamCards] = useState<Record<string, boolean>>({});
  const [deleteDraftModalExam, setDeleteDraftModalExam] = useState<any | null>(null);
  const [isDeletingDraft, setIsDeletingDraft] = useState<boolean>(false);

  // Sync monitoring year filter when selectedAcademicYear changes explicitly
  useEffect(() => {
    if (selectedAcademicYear) {
      setMonitoringYearFilter(selectedAcademicYear);
    }
  }, [selectedAcademicYear]);

  const fetchProgressMonitoring = async (overrideYear?: string) => {
    setLoadingMonitoring(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const params = new URLSearchParams();
      const yearToFetch = overrideYear !== undefined ? overrideYear : monitoringYearFilter;
      if (yearToFetch && yearToFetch !== 'all') {
        params.append('academicYear', yearToFetch);
      }
      const res = await fetch(`/api/exams/progress-monitoring?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.examinations)) {
          setExamMonitoringList(json.examinations);
        }
      }
    } catch (err) {
      console.warn('Non-blocking error fetching progress monitoring:', err);
    } finally {
      setLoadingMonitoring(false);
    }
  };

  useEffect(() => {
    fetchProgressMonitoring(monitoringYearFilter);
  }, [monitoringYearFilter]);

  const handleConfirmDeleteDraft = async () => {
    if (!deleteDraftModalExam) return;
    const targetId = deleteDraftModalExam.examId || deleteDraftModalExam.id;
    setIsDeletingDraft(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/exams/delete-draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          examId: targetId,
          reason: `Cleaned up draft exam "${deleteDraftModalExam.examName || deleteDraftModalExam.name || targetId}" from Progress Monitoring.`
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setStatus({ type: 'error', message: json.error || 'Failed to delete draft examination.' });
        return;
      }
      if (activeExamId === targetId) {
        setIsPreparationActive(false);
        setActiveExamId('');
        setExamDocData(null);
        setStudents([]);
      }
      setDeleteDraftModalExam(null);
      setStatus({ type: 'success', message: json.message || 'Draft examination deleted cleanly.' });
      await fetchProgressMonitoring(monitoringYearFilter);
    } catch (err: any) {
      setStatus({ type: 'error', message: err?.message || 'Error deleting draft examination.' });
    } finally {
      setIsDeletingDraft(false);
    }
  };

  const toggleExamCard = (id: string) => {
    setExpandedExamCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // 2. Active Preparation Context
  const [activeExamId, setActiveExamId] = useState('');
  const [isPreparationActive, setIsPreparationActive] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [examDocData, setExamDocData] = useState<any>(null);
  
  // Teachers directory for subject resolution
  const [allTeachers, setAllTeachers] = useState<any[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);

  // Configured Subjects & Teacher Resolution
  const [configuredSubjects, setConfiguredSubjects] = useState<string[]>([]);
  const [customSubjectsList, setCustomSubjectsList] = useState<any[]>([]);
  const [teacherResolutions, setTeacherResolutions] = useState<Record<string, SubjectTeacherResolution>>({});

  // Students & Marks Data
  const [students, setStudents] = useState<StudentMarkEntry[]>([]);
  const [subjectConfigs, setSubjectConfigs] = useState<Record<string, SubjectConfigItem>>({});
  const [subjectVersions, setSubjectVersions] = useState<Record<string, Record<string, number>>>({});
  const inflightSavesRef = useRef<Record<string, boolean>>({});
  const pendingSavesRef = useRef<Record<string, boolean>>({});
  const [conflictInfo, setConflictInfo] = useState<{ subject: string; serverVersions: Record<string, number>; serverData: any } | null>(null);

  // 3. Mark Entry Modal State
  const [activeEntrySubject, setActiveEntrySubject] = useState<string | null>(null);
  const [isSavingSubject, setIsSavingSubject] = useState(false);
  const [editReasonInput, setEditReasonInput] = useState('');
  const [initialSavedMarks, setInitialSavedMarks] = useState<Record<string, { th: string; pr: string; absTh: boolean; absPr: boolean }>>({});
  const [markValidationErrors, setMarkValidationErrors] = useState<Record<string, string>>({});
  const [showSubjectDiscardModal, setShowSubjectDiscardModal] = useState(false);

  // Helper to determine if subject mark entry has unsaved changes
  const isSubjectEntryDirty = (subj: string | null) => {
    if (!subj) return false;
    for (const std of students) {
      const key = `${std.studentUid || std.studentId}_${subj}`;
      const init = initialSavedMarks[key];
      const curTh = std.subjectMarksTH?.[subj] ?? '';
      const curPr = std.subjectMarksPR?.[subj] ?? '';
      const curAbsTh = Boolean(std.subjectAbsentsTH?.[subj]);
      const curAbsPr = Boolean(std.subjectAbsentsPR?.[subj]);
      if (init) {
        if (curTh !== init.th || curPr !== init.pr || curAbsTh !== init.absTh || curAbsPr !== init.absPr) {
          return true;
        }
      } else {
        if (curTh !== '' || curPr !== '' || curAbsTh || curAbsPr) {
          return true;
        }
      }
    }
    return false;
  };

  const hasUnsavedSubjectMarks = isSubjectEntryDirty(activeEntrySubject);

  // Protect browser refresh/close when subject marks have unsaved edits
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedSubjectMarks) {
        e.preventDefault();
        e.returnValue = 'You have unsaved marks. Are you sure you want to leave?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedSubjectMarks]);

  // Report live workspace / dirty state up to Admin navigation guard
  useEffect(() => {
    if (!onWorkflowGuardChange) return;
    const summaryParts: string[] = [];
    if (selectedClass) summaryParts.push(`Class ${selectedClass}${selectedSection ? ` (Sec ${selectedSection})` : ''}`);
    if (selectedExam) summaryParts.push(selectedExam);
    if (activeEntrySubject) summaryParts.push(`Editing ${activeEntrySubject}`);
    else if (selectedAcademicYear) summaryParts.push(formatAcademicYearDisplayTitle(selectedAcademicYear, managedYears));

    onWorkflowGuardChange({
      isActive: isPreparationActive || Boolean(activeEntrySubject),
      isDirty: hasUnsavedSubjectMarks,
      workflowName: 'Connected Examination Management',
      contextSummary: summaryParts.length > 0 ? summaryParts.join(' • ') : 'Examination Preparation & Monitoring'
    });
  }, [
    onWorkflowGuardChange,
    isPreparationActive,
    activeEntrySubject,
    hasUnsavedSubjectMarks,
    selectedClass,
    selectedSection,
    selectedExam,
    selectedAcademicYear,
    managedYears
  ]);

  useEffect(() => {
    return () => {
      onWorkflowGuardChange?.(null);
    };
  }, [onWorkflowGuardChange]);

  // Revert active subject marks to initial saved state
  const revertSubjectMarks = (subj: string) => {
    setStudents(prev => prev.map(std => {
      const key = `${std.studentUid || std.studentId}_${subj}`;
      const init = initialSavedMarks[key];
      const newTH = { ...(std.subjectMarksTH || {}) };
      const newPR = { ...(std.subjectMarksPR || {}) };
      const newAbsTH = { ...(std.subjectAbsentsTH || {}) };
      const newAbsPR = { ...(std.subjectAbsentsPR || {}) };
      if (init) {
        newTH[subj] = init.th;
        newPR[subj] = init.pr;
        newAbsTH[subj] = init.absTh;
        newAbsPR[subj] = init.absPr;
      } else {
        delete newTH[subj];
        delete newPR[subj];
        delete newAbsTH[subj];
        delete newAbsPR[subj];
      }
      return {
        ...std,
        subjectMarksTH: newTH,
        subjectMarksPR: newPR,
        subjectAbsentsTH: newAbsTH,
        subjectAbsentsPR: newAbsPR
      };
    }));
  };

  // 4. Review Modal State
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // 5. Correction Request Modal State
  const [correctionModalSubject, setCorrectionModalSubject] = useState<string | null>(null);
  const [correctionNote, setCorrectionNote] = useState('');
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  // 6. Publication Validation & Execution State
  const [validationReport, setValidationReport] = useState<any>(null);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<any>(null);

  // 7. Connected Lifecycle, Empty-Cell Modal, Policy #4 Force Overwrite, Policy #5 Unpublish
  const [isSubmittingSubject, setIsSubmittingSubject] = useState(false);
  const [isApprovingSubject, setIsApprovingSubject] = useState<string | null>(null);
  const [isApprovingExam, setIsApprovingExam] = useState(false);
  const [forceOverwriteChecked, setForceOverwriteChecked] = useState(false);
  const [forceOverwriteReason, setForceOverwriteReason] = useState('');
  const [unpublishModalOpen, setUnpublishModalOpen] = useState(false);
  const [unpublishReason, setUnpublishReason] = useState('');
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [emptyModalState, setEmptyModalState] = useState<{
    isOpen: boolean;
    mode: 'DRAFT' | 'SUBMIT';
    subject: string;
    emptyCells: EmptyCellInfo[];
  }>({ isOpen: false, mode: 'DRAFT', subject: '', emptyCells: [] });

  // Check roles and authorization
  const isAdmin = userRole === 'admin';
  const isPrimaryAdmin = isAdmin && adminTier === 'primary';
  const isTeacher = userRole === 'teacher';
  const primaryClass = teacherProfile?.primaryClassTeacher || teacherProfile?.class || '';
  const isClassTeacher = isTeacher && isPrimaryClassTeacher(teacherProfile, selectedClass, selectedAcademicYear, selectedSection);
  // Owner Policy: Publication is strictly Admin-only
  const canPublish = isAdmin;

  // Filter allowed classes for dropdown
  const allowedClasses = useMemo(() => {
    if (isAdmin) return allClasses;
    if (isTeacher) {
      return allClasses.filter(c => canTeacherAccessClass(userRole, teacherProfile, c, selectedSection, selectedAcademicYear));
    }
    return [];
  }, [isAdmin, isTeacher, allClasses, teacherProfile, userRole, selectedSection, selectedAcademicYear]);

  // In Connected Mode, class is synced from initialContext. In Independent Mode, require user selection.
  useEffect(() => {
    if (isConnected && initialContext?.selectedClass) {
      setSelectedClass(normalizeClass(initialContext.selectedClass));
    }
  }, [isConnected, initialContext]);

  // Load all teachers once (Admin-only) to accurately resolve Subject -> Teacher assignments
  useEffect(() => {
    if (!isAdmin) {
      setAllTeachers([]);
      setLoadingTeachers(false);
      return;
    }
    const fetchTeachers = async () => {
      setLoadingTeachers(true);
      try {
        const qSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'teacher')));
        const tList: any[] = [];
        qSnap.forEach(d => tList.push({ id: d.id, ...d.data() }));
        setAllTeachers(tList);
      } catch (e) {
        console.warn('Failed to load teachers for resolution:', e);
      } finally {
        setLoadingTeachers(false);
      }
    };
    fetchTeachers();
  }, [isAdmin]);

  // Listen to custom_subjects collection
  useEffect(() => {
    let unsubCustomSubjects: any;
    try {
      unsubCustomSubjects = onSnapshot(collection(db, 'custom_subjects'), (snap) => {
        const cList: any[] = [];
        snap.forEach(d => cList.push({ id: d.id, ...d.data() }));
        setCustomSubjectsList(cList);
      }, (err) => {
        console.warn('ResultPreparationTab: custom_subjects subscription warning:', err?.message);
      });
    } catch (e) {
      console.warn('Failed to listen to custom_subjects:', e);
    }
    return () => {
      if (unsubCustomSubjects) unsubCustomSubjects();
    };
  }, []);

  // Update Configured Subjects & Teacher Resolution whenever Class changes
  useEffect(() => {
    if (!selectedClass) return;
    const subjects = getClassConfiguredSubjects(selectedClass, customSubjectsList);
    setConfiguredSubjects(subjects);

    // Default configs for subjects, preserving any custom subject marks breakdown
    const configs: Record<string, SubjectConfigItem> = {};
    subjects.forEach(s => {
      const customMatch = customSubjectsList.find(c => c.name === s && c.status === 'ACTIVE');
      configs[s] = {
        thFullMarks: customMatch?.thFullMarks ?? 75,
        thPassMarks: customMatch?.thPassMarks ?? 30,
        prFullMarks: customMatch?.prFullMarks ?? 25,
        prPassMarks: customMatch?.prPassMarks ?? 10,
        hasTh: customMatch?.hasTh ?? true,
        hasPr: customMatch?.hasPr ?? true
      };
    });
    setSubjectConfigs(configs);

    // Resolve Teachers from STEP 1 respecting section and academic year
    if (allTeachers.length > 0) {
      const resolutions = resolveSubjectTeachersForClass(
        selectedClass, 
        subjects, 
        allTeachers,
        selectedSection,
        selectedAcademicYear
      );
      setTeacherResolutions(resolutions);
    }
  }, [selectedClass, allTeachers, selectedSection, selectedAcademicYear, customSubjectsList]);

  const handleCreateNewYearFromPrep = async (e: React.FormEvent) => {
    e.preventDefault();
    const yrNum = parseInt(newYearBsInput, 10);
    if (isNaN(yrNum) || yrNum < 2000 || yrNum > 2200) {
      setStatus({ type: 'error', message: 'Please enter a valid 4-digit Bikram Sambat (B.S.) year (e.g. 2086).' });
      return;
    }

    setIsSubmittingNewYear(true);
    try {
      const created = await createAcademicYear(
        {
          bsYear: yrNum,
          displayTitle: newYearTitleInput || `${yrNum} BS`,
          status: 'ACTIVE',
          isCurrent: false
        },
        auth.currentUser?.email || 'admin@shikshantar.edu.np'
      );

      setStatus({
        type: 'success',
        message: `Academic Year "${created.displayTitle}" created and saved in Firestore.`
      });

      setSelectedAcademicYear(created.academicYearId);
      setIsAddYearModalOpen(false);
      setNewYearBsInput('');
      setNewYearTitleInput('');
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to create academic year.' });
    } finally {
      setIsSubmittingNewYear(false);
    }
  };

  // Handle [ PREPARE / OPEN RESULT ] — supports direct override from Monitoring "Open >" without stale closure state
  const handleOpenPreparation = async (override?: {
    examId?: string;
    academicYear: string;
    className: string;
    section?: string;
    examName: string;
    allowExistingWithoutSharedSetup?: boolean;
  }) => {
    const targetYear = (override?.academicYear ?? selectedAcademicYear ?? '').trim();
    const targetClass = override?.className ? normalizeClass(override.className) : normalizeClass(selectedClass);
    const targetSection = (override?.section ?? selectedSection ?? 'A').trim() || 'A';
    const targetExam = (override?.examName ?? selectedExam ?? '').trim();

    if (override) {
      setSelectedAcademicYear(targetYear);
      setSelectedClass(targetClass);
      setSelectedSection(targetSection);
      setSelectedExam(targetExam);
    }

    if (!targetYear || !targetClass || !targetExam) {
      setStatus({ type: 'error', message: 'Please select Academic Session, Class, and Examination to open Examination Management.' });
      return;
    }

    setLoadingContext(true);
    setStatus(null);
    try {
      const canonicalId = buildCanonicalExamId(targetExam, targetClass, targetSection, targetYear);
      const legacyId = `${targetExam.replace(/\s+/g, '_')}_${targetClass}`;
      const legacyFinalId = targetExam.toLowerCase().includes('final')
        ? `FINAL_${normalizeClass(targetClass)}_${targetSection || 'A'}_${targetYear}`
        : null;

      let chosenExamId = (override?.examId || '').trim() || canonicalId;
      let examRef = doc(db, 'exams', chosenExamId);
      let examSnap = await getDoc(examRef);

      if (!examSnap.exists() && chosenExamId !== canonicalId) {
        chosenExamId = canonicalId;
        examRef = doc(db, 'exams', canonicalId);
        examSnap = await getDoc(examRef);
      }

      // Backward-compatibility: if canonical doc doesn't exist, check legacy docs
      if (!examSnap.exists()) {
        if (legacyFinalId) {
          const legFinalRef = doc(db, 'exams', legacyFinalId);
          const legFinalSnap = await getDoc(legFinalRef);
          if (legFinalSnap.exists()) {
            chosenExamId = legacyFinalId;
            examRef = legFinalRef;
            examSnap = legFinalSnap;
          }
        }
        if (!examSnap.exists()) {
          const legacyRef = doc(db, 'exams', legacyId);
          const legacySnap = await getDoc(legacyRef);
          if (legacySnap.exists()) {
            const lData = legacySnap.data();
            const cleanAYear = (targetYear || '').trim().replace(/[^0-9]/g, '');
            const cleanDocYear = (lData.academicYear || '').trim().replace(/[^0-9]/g, '');
            if (!cleanDocYear || !cleanAYear || cleanDocYear === cleanAYear || cleanAYear.includes(cleanDocYear)) {
              chosenExamId = legacyId;
              examRef = legacyRef;
              examSnap = legacySnap;
            }
          }
        }
      }

      // Enforce Option 1 (Shared Setup) ONLY when creating a brand-new examination.
      // Already-initialized examinations can always be opened directly from Progress Monitoring!
      if (isInvalidSharedConfig && !examSnap.exists()) {
        setStatus({
          type: 'error',
          message: 'Shared examination setup is required to initialize a new examination. Please configure Option 1 (Shared Setup) first, or click "Open" on an already-initialized exam below.'
        });
        setLoadingContext(false);
        return;
      }

      setActiveExamId(chosenExamId);
      const examId = chosenExamId;

      // 1. Fetch or initialize Exam Context in `exams`
      let examData: any;

      if (examSnap.exists()) {
        examData = examSnap.data();
      } else {
        const cleanCanonicalSec = getCanonicalSection(targetSection);
        examData = {
          id: examId,
          name: targetExam,
          type: targetExam,
          class: normalizeClass(targetClass),
          section: cleanCanonicalSec,
          canonicalSectionId: cleanCanonicalSec,
          academicYear: targetYear,
          published: false,
          status: 'IN PROGRESS',
          createdAt: new Date().toISOString(),
          createdByUid: auth.currentUser?.uid || 'system',
          createdByName: auth.currentUser?.displayName || (isAdmin ? 'Admin' : 'Teacher'),
          subjectStatus: {}
        };
        await setDoc(examRef, examData, { merge: true });

        // Notify assigned teachers in their portal bell + app notification (no annoying email spam)
        try {
          const initToken = await auth.currentUser?.getIdToken();
          if (initToken) {
            fetch('/api/exams/notify-teachers-initialized', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${initToken}`
              },
              body: JSON.stringify({
                examId,
                className: normalizeClass(targetClass),
                section: cleanCanonicalSec,
                academicYear: targetYear
              })
            }).catch(() => {});
          }
        } catch (_) {}

        // Record Audit Log for initialization
        try {
          await recordAuditLog({
            category: 'academic',
            actionType: 'PREPARATION_INITIALIZED',
            targetType: 'class_exam_results',
            targetId: examId,
            studentClass: normalizeClass(targetClass),
            academicYear: targetYear,
            reason: `Initialized Examination Management for Class ${targetClass} - ${targetExam}`,
            previousValue: 'None',
            newValue: `Initialized context for Class ${targetClass} - ${targetExam}`,
            result: 'SUCCESS'
          });
        } catch (_) {}
      }
      setExamDocData(examData);

      // Determine authoritative configured subjects for THIS exam immediately (avoid stale React state)
      let effectiveSubjects: string[] = [];
      const customMap: Record<string, SubjectConfigItem> = {};
      const matchesSharedSetup =
        Boolean(initialContext?.isConfigValid) &&
        (!override ||
          (normalizeClass(initialContext?.selectedClass || '') === targetClass &&
            (initialContext?.selectedAcademicYear || '') === targetYear &&
            (initialContext?.selectedExam || '') === targetExam));

      if (matchesSharedSetup && initialContext?.subjectConfigs && initialContext.subjectConfigs.length > 0) {
        initialContext.subjectConfigs.forEach(sc => {
          const key = sc.subjectKey || sc.subjectName;
          customMap[key] = sc;
          effectiveSubjects.push(key);
        });
      } else if (Array.isArray(examData?.subjectConfigs) && examData.subjectConfigs.length > 0) {
        examData.subjectConfigs.forEach((sc: any) => {
          const key = sc.subjectKey || sc.subjectName || sc.name;
          if (!key) return;
          customMap[key] = {
            thFullMarks: sc.thFullMarks ?? 75,
            thPassMarks: sc.thPassMarks ?? 30,
            prFullMarks: sc.prFullMarks ?? 25,
            prPassMarks: sc.prPassMarks ?? 10,
            hasTh: sc.hasTh ?? true,
            hasPr: sc.hasPr ?? true
          };
          effectiveSubjects.push(key);
        });
      } else {
        effectiveSubjects = getClassConfiguredSubjects(targetClass, customSubjectsList);
        effectiveSubjects.forEach(s => {
          const customMatch = customSubjectsList.find(c => c.name === s && c.status === 'ACTIVE');
          customMap[s] = {
            thFullMarks: customMatch?.thFullMarks ?? 75,
            thPassMarks: customMatch?.thPassMarks ?? 30,
            prFullMarks: customMatch?.prFullMarks ?? 25,
            prPassMarks: customMatch?.prPassMarks ?? 10,
            hasTh: customMatch?.hasTh ?? true,
            hasPr: customMatch?.hasPr ?? true
          };
        });
      }

      if (effectiveSubjects.length > 0) {
        setConfiguredSubjects(effectiveSubjects);
        setSubjectConfigs(customMap);
        if (allTeachers.length > 0) {
          setTeacherResolutions(
            resolveSubjectTeachersForClass(targetClass, effectiveSubjects, allTeachers, targetSection, targetYear)
          );
        }
      }

      // 2. Authoritative Student Eligibility Resolution via trusted server roster endpoint
      const rosterToken = await auth.currentUser?.getIdToken();
      let fetchedStudents: StudentMarkEntry[] = [];
      let loadedFromServer = false;

      if (rosterToken) {
        try {
          const rosterParams = new URLSearchParams({
            academicYear: targetYear,
            className: normalizeClass(targetClass),
            section: targetSection || 'All'
          });
          const rosterRes = await fetch(`/api/exams/authorized-roster?${rosterParams.toString()}`, {
            headers: { Authorization: `Bearer ${rosterToken}` }
          });
          if (rosterRes.ok) {
            const rosterJson = await rosterRes.json();
            if (rosterJson.success && Array.isArray(rosterJson.students)) {
              loadedFromServer = true;
              fetchedStudents = rosterJson.students.map((u: any) => ({
                studentUid: u.studentUid,
                studentId: u.permanentStudentId || u.studentId || u.studentUid,
                permanentStudentId: u.permanentStudentId || u.studentId || u.studentUid,
                studentEmis: u.studentEmis || '',
                studentName: u.studentName || 'Student',
                rollNo: u.rollNo || '',
                rollNumberSnapshot: u.rollNo || '',
                class: normalizeClass(targetClass),
                section: u.section || targetSection,
                academicYear: targetYear,
                email: u.email || '',
                guardianEmail: u.guardianEmail || '',
                guardianName: u.guardianName || '',
                subjectMarksTH: {},
                subjectMarksPR: {},
                subjectAbsentsTH: {},
                subjectAbsentsPR: {}
              }));
            }
          }
        } catch (rosterErr) {
          console.warn('Could not load authorized roster from server:', rosterErr);
        }
      }

      if (!loadedFromServer && isAdmin) {
        let rawEnrollments: any[] = [];
        try {
          const enrollSnap = await getDocs(
            query(
              collection(db, 'student_enrollments'),
              where('academicYear', '==', targetYear),
              where('class', '==', normalizeClass(targetClass))
            )
          );
          rawEnrollments = enrollSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (enrollErr) {
          console.warn('Could not query student_enrollments:', enrollErr);
        }

        let rawUsers: any[] = [];
        try {
          const usersSnap = await getDocs(
            query(
              collection(db, 'users'),
              where('role', '==', 'student'),
              where('class', '==', normalizeClass(targetClass))
            )
          );
          rawUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (userErr) {
          console.warn('Could not query users:', userErr);
        }

        const eligibleRecords = filterEligibleStudentsFromRaw(
          rawEnrollments,
          rawUsers,
          normalizeClass(targetClass),
          targetSection,
          targetYear,
          defaultAcademicYear
        );

        fetchedStudents = eligibleRecords.map(u => ({
          studentUid: u.studentUid,
          studentId: u.permanentStudentId || u.studentId || u.studentUid,
          permanentStudentId: u.permanentStudentId || u.studentId || u.studentUid,
          studentEmis: u.studentEmis || '',
          studentName: u.studentName || 'Student',
          rollNo: u.rollNo || '',
          rollNumberSnapshot: u.rollNo || '',
          class: normalizeClass(targetClass),
          section: u.section || targetSection,
          academicYear: targetYear,
          email: u.email || '',
          guardianEmail: u.guardianEmail || '',
          guardianName: u.guardianName || '',
          subjectMarksTH: {},
          subjectMarksPR: {},
          subjectAbsentsTH: {},
          subjectAbsentsPR: {}
        }));
      }

      // Sort students by Roll Number / Name
      fetchedStudents.sort((a, b) => {
        const rA = parseInt(a.rollNo, 10);
        const rB = parseInt(b.rollNo, 10);
        if (!isNaN(rA) && !isNaN(rB)) return rA - rB;
        return a.studentName.localeCompare(b.studentName);
      });

      // 3. Load Existing Saved Marks from `results` collection for this exam
      const resultsSnap = await getDocs(
        query(collection(db, 'results'), where('examId', '==', examId))
      );

      const savedMarksMap: Record<string, any> = {};
      resultsSnap.forEach(d => {
        const r = d.data();
        const key = `${r.studentUid || r.studentId}_${r.subject}`;
        savedMarksMap[key] = r;
      });

      // Load subject versions for concurrency
      // Load record-level student-subject versions for concurrency
      const recordVersionsSnap = await getDocs(
        query(collection(db, 'student_subject_versions'), where('examId', '==', examId))
      );
      const recVerMap: Record<string, Record<string, number>> = {};
      recordVersionsSnap.forEach(d => {
        const vd = d.data();
        if (vd.studentUid && vd.subjectKey && typeof vd.version === 'number') {
          if (!recVerMap[vd.subjectKey]) recVerMap[vd.subjectKey] = {};
          recVerMap[vd.subjectKey][vd.studentUid] = vd.version;
        }
      });
      setSubjectVersions(recVerMap as any);
      setConflictInfo(null);

      // Populate existing marks into students
      fetchedStudents = fetchedStudents.map(std => {
        const thMarks: Record<string, any> = {};
        const prMarks: Record<string, any> = {};
        const thAbs: Record<string, boolean> = {};
        const prAbs: Record<string, boolean> = {};

        const subjectsForMarks = effectiveSubjects.length > 0 ? effectiveSubjects : configuredSubjects;
        subjectsForMarks.forEach(subj => {
          const key = `${std.studentUid}_${subj}`;
          const existing = savedMarksMap[key] || savedMarksMap[`${std.studentId}_${subj}`];
          if (existing) {
            if (existing.thMarks === 'AB') {
              thAbs[subj] = true;
            } else if (existing.thMarks !== undefined && existing.thMarks !== null) {
              thMarks[subj] = existing.thMarks;
            }

            if (existing.prMarks === 'AB') {
              prAbs[subj] = true;
            } else if (existing.prMarks !== undefined && existing.prMarks !== null) {
              prMarks[subj] = existing.prMarks;
            }
          }
        });

        return {
          ...std,
          subjectMarksTH: thMarks,
          subjectMarksPR: prMarks,
          subjectAbsentsTH: thAbs,
          subjectAbsentsPR: prAbs
        };
      });

      setStudents(fetchedStudents);
      setIsPreparationActive(true);
      onExamOpened?.();
      scrollWorkspaceToTop();
      setStatus({ type: 'success', message: `Opened Result Preparation for Class ${targetClass} (${targetSection}) — ${targetExam}.` });
    } catch (e: any) {
      console.error('Error opening result preparation:', e);
      setStatus({ type: 'error', message: 'Failed to open preparation context: ' + e.message });
    } finally {
      setLoadingContext(false);
    }
  };

  // Compute Overall Exam Status from authoritative server lifecycle
  const overallExamStatus: ExamPreparationStatus = useMemo(() => {
    if (examDocData?.published || examDocData?.status === 'PUBLISHED') return 'PUBLISHED';
    if (examDocData?.status === 'APPROVED') return 'APPROVED';
    if (examDocData?.status === 'READY_FOR_REVIEW' || examDocData?.status === 'READY FOR REVIEW') {
      return 'READY_FOR_REVIEW';
    }
    return 'DRAFT';
  }, [examDocData]);

  // Compute Class Result Matrix Data for review
  const matrixData = useMemo(() => {
    if (!isPreparationActive || students.length === 0) return null;

    const savedMarkRecords: any[] = [];
    students.forEach(std => {
      configuredSubjects.forEach(subj => {
        const th = std.subjectAbsentsTH?.[subj] ? 'AB' : (std.subjectMarksTH?.[subj] !== undefined && std.subjectMarksTH?.[subj] !== '' ? Number(std.subjectMarksTH[subj]) : null);
        const pr = std.subjectAbsentsPR?.[subj] ? 'AB' : (std.subjectMarksPR?.[subj] !== undefined && std.subjectMarksPR?.[subj] !== '' ? Number(std.subjectMarksPR[subj]) : null);

        if (th !== null || pr !== null) {
          savedMarkRecords.push({
            studentUid: std.studentUid,
            studentId: std.studentId,
            permanentStudentId: std.permanentStudentId || std.studentId,
            examId: activeExamId,
            subject: subj,
            thMarks: th,
            prMarks: pr,
            marks: th !== null && th !== 'AB' ? th + (typeof pr === 'number' ? pr : 0) : pr
          });
        }
      });
    });

    return generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects,
      subjectConfigs,
      savedMarks: savedMarkRecords,
      context: {
        academicYear: selectedAcademicYear,
        class: selectedClass,
        section: selectedSection,
        examType: selectedExam,
        examId: activeExamId,
        isPublished: Boolean(examDocData?.published || examDocData?.status === 'PUBLISHED'),
        status: examDocData?.status || 'IN PROGRESS'
      }
    });
  }, [isPreparationActive, students, configuredSubjects, subjectConfigs, selectedAcademicYear, selectedClass, selectedSection, selectedExam, activeExamId, examDocData]);

  // Handle Mark Changes in Entry Modal (Decimal marks accepted, negative numbers rejected)
  const handleMarkChange = (idx: number, type: 'TH' | 'PR', rawVal: string, subj: string) => {
    if (examDocData?.published) return; // Locked if published

    // Reject negative signs or letters directly
    if (rawVal.includes('-') || /[a-zA-Z]/.test(rawVal)) {
      setMarkValidationErrors(prev => ({
        ...prev,
        [`${idx}_${type}`]: 'Marks cannot be negative or contain letters.'
      }));
      return;
    }

    const val = rawVal.replace(/[^0-9.]/g, '');
    const num = Number(val);
    const config = subjectConfigs[subj] || { thFullMarks: 75, prFullMarks: 25, hasTh: true, hasPr: true };
    const maxMarks = type === 'TH' ? Number(config.thFullMarks) || 75 : Number(config.prFullMarks) || 25;

    if (val !== '' && !isNaN(num) && num > maxMarks) {
      setMarkValidationErrors(prev => ({
        ...prev,
        [`${idx}_${type}`]: `Maximum allowed ${type === 'TH' ? 'Theory' : 'Practical'} mark is ${maxMarks}.`
      }));
      return;
    }

    // Clear validation error on valid entry
    setMarkValidationErrors(prev => {
      const next = { ...prev };
      delete next[`${idx}_${type}`];
      return next;
    });

    setStudents(prev => {
      const target = prev[idx];
      if (!target) return prev;
      const updated = [...prev];
      if (type === 'TH') {
        updated[idx] = {
          ...target,
          subjectMarksTH: { ...(target.subjectMarksTH || {}), [subj]: val },
          subjectAbsentsTH: { ...(target.subjectAbsentsTH || {}), [subj]: false }
        };
      } else {
        updated[idx] = {
          ...target,
          subjectMarksPR: { ...(target.subjectMarksPR || {}), [subj]: val },
          subjectAbsentsPR: { ...(target.subjectAbsentsPR || {}), [subj]: false }
        };
      }
      return updated;
    });
  };

  // Handle Absent Toggles
  const handleAbsentToggle = (idx: number, type: 'TH' | 'PR', checked: boolean, subj: string) => {
    if (examDocData?.published) return; // Locked if published

    setStudents(prev => {
      const target = prev[idx];
      if (!target) return prev;
      const updated = [...prev];
      if (type === 'TH') {
        updated[idx] = {
          ...target,
          subjectAbsentsTH: { ...(target.subjectAbsentsTH || {}), [subj]: checked },
          subjectMarksTH: checked
            ? { ...(target.subjectMarksTH || {}), [subj]: '' }
            : target.subjectMarksTH
        };
      } else {
        updated[idx] = {
          ...target,
          subjectAbsentsPR: { ...(target.subjectAbsentsPR || {}), [subj]: checked },
          subjectMarksPR: checked
            ? { ...(target.subjectMarksPR || {}), [subj]: '' }
            : target.subjectMarksPR
        };
      }
      return updated;
    });
  };

  // Collect empty cells for a single Connected subject
  const collectSubjectEmptyCells = (subj: string, studentList: any[]): EmptyCellInfo[] => {
    const config = subjectConfigs[subj] || { thFullMarks: 75, prFullMarks: 25, hasTh: true, hasPr: true };
    const empty: EmptyCellInfo[] = [];
    studentList.forEach((std) => {
      if (config.hasTh && !std.subjectAbsentsTH?.[subj] && String(std.subjectMarksTH?.[subj] ?? '').trim() === '') {
        empty.push({
          studentId: std.studentUid || std.studentId,
          studentName: std.studentName || 'Unknown',
          rollNo: std.rollNo || '',
          subjectCode: subj,
          subjectName: subj,
          component: 'TH'
        });
      }
      if (config.hasPr && !std.subjectAbsentsPR?.[subj] && String(std.subjectMarksPR?.[subj] ?? '').trim() === '') {
        empty.push({
          studentId: std.studentUid || std.studentId,
          studentName: std.studentName || 'Unknown',
          rollNo: std.rollNo || '',
          subjectCode: subj,
          subjectName: subj,
          component: 'PR'
        });
      }
    });
    return empty;
  };

  const applySubjectEmptyResolution = (subj: string, fillType: 'AB' | 'ZERO') => {
    const config = subjectConfigs[subj] || { thFullMarks: 75, prFullMarks: 25, hasTh: true, hasPr: true };
    const updated = students.map((std) => {
      const nextTH = { ...(std.subjectMarksTH || {}) };
      const nextPR = { ...(std.subjectMarksPR || {}) };
      const nextAbsTH = { ...(std.subjectAbsentsTH || {}) };
      const nextAbsPR = { ...(std.subjectAbsentsPR || {}) };

      if (config.hasTh && !nextAbsTH[subj] && String(nextTH[subj] ?? '').trim() === '') {
        if (fillType === 'AB') {
          nextAbsTH[subj] = true;
          nextTH[subj] = '';
        } else {
          nextTH[subj] = '0';
        }
      }
      if (config.hasPr && !nextAbsPR[subj] && String(nextPR[subj] ?? '').trim() === '') {
        if (fillType === 'AB') {
          nextAbsPR[subj] = true;
          nextPR[subj] = '';
        } else {
          nextPR[subj] = '0';
        }
      }

      return {
        ...std,
        subjectMarksTH: nextTH,
        subjectMarksPR: nextPR,
        subjectAbsentsTH: nextAbsTH,
        subjectAbsentsPR: nextAbsPR
      };
    });
    setStudents(updated);
    return updated;
  };

  // SAVE AS DRAFT: Persists marks in Connected mode via trusted server (never auto-submits!)
  const handleSaveDraftMarks = async (
    subjectToSave: string,
    forceOverwrite = false,
    studentsOverride?: any[],
    skipEmptyPrompt = false
  ): Promise<boolean> => {
    const activeStudents = studentsOverride || students;

    if (examDocData?.published || examDocData?.status === 'PUBLISHED') {
      setStatus({ type: 'error', message: 'This examination has already been published. All marks are locked.' });
      return false;
    }

    if (!canTeacherAccessSubject(userRole, teacherProfile, selectedClass, subjectToSave, selectedSection, selectedAcademicYear)) {
      setStatus({ type: 'error', message: `Unauthorized: You do not have permission to modify marks for ${subjectToSave} in Class ${selectedClass}.` });
      return false;
    }

    if (forceOverwrite) {
      if (!forceOverwriteChecked || forceOverwriteReason.trim().length < 5) {
        setStatus({ type: 'error', message: 'Force Overwrite requires checking confirmation and providing an audit reason (min 5 chars).' });
        return false;
      }
    }

    if (!skipEmptyPrompt && !forceOverwrite) {
      const emptyCells = collectSubjectEmptyCells(subjectToSave, activeStudents);
      if (emptyCells.length > 0) {
        setEmptyModalState({ isOpen: true, mode: 'DRAFT', subject: subjectToSave, emptyCells });
        return false;
      }
    }

    let isEditingExistingMarks = false;
    activeStudents.forEach((std) => {
      const key = `${std.studentUid || std.studentId}_${subjectToSave}`;
      const init = initialSavedMarks[key];
      if (init && (init.th !== '' || init.pr !== '' || init.absTh || init.absPr)) {
        const curTh = std.subjectMarksTH?.[subjectToSave] ?? '';
        const curPr = std.subjectMarksPR?.[subjectToSave] ?? '';
        const curAbsTh = Boolean(std.subjectAbsentsTH?.[subjectToSave]);
        const curAbsPr = Boolean(std.subjectAbsentsPR?.[subjectToSave]);
        if (curTh !== init.th || curPr !== init.pr || curAbsTh !== init.absTh || curAbsPr !== init.absPr) {
          isEditingExistingMarks = true;
        }
      }
    });

    if (isEditingExistingMarks && !forceOverwrite && editReasonInput.trim().length < 5) {
      setStatus({ type: 'error', message: 'Correction reason (min 5 chars) is required when editing previously saved marks.' });
      return false;
    }

    const examId = activeExamId || buildCanonicalExamId(selectedExam, selectedClass, selectedSection, selectedAcademicYear);
    const normKey = subjectToSave.replace(/\s+/g, '');

    const studentsToSave = activeStudents.filter(std => {
      const sUid = std.studentUid || std.uid || std.studentId;
      const recordKey = JSON.stringify([examId, sUid, normKey]);
      if (inflightSavesRef.current[recordKey] && !forceOverwrite) {
        pendingSavesRef.current[recordKey] = true;
        return false;
      }
      return true;
    });

    if (studentsToSave.length === 0) return false;

    studentsToSave.forEach(std => {
      const sUid = std.studentUid || std.uid || std.studentId;
      inflightSavesRef.current[JSON.stringify([examId, sUid, normKey])] = true;
    });

    setIsSavingSubject(true);
    try {
      const customMatch = customSubjectsList.find(c => c.name === subjectToSave && c.status === 'ACTIVE');
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        setStatus({ type: 'error', message: 'Authentication required. Please sign in again.' });
        return false;
      }

      const lowerKey = subjectToSave.replace(/[^a-zA-Z0-9_.-]/g, '').toLowerCase();
      const subjVers = subjectVersions[subjectToSave] || subjectVersions[normKey] || subjectVersions[lowerKey] || {};
      const studentsWithVersion = studentsToSave.map(std => {
        const sUid = std.studentUid || std.uid || std.studentId;
        const expectedVersion = conflictInfo && conflictInfo.subject === subjectToSave
          ? (conflictInfo.serverVersions?.[sUid] || 1)
          : (subjVers[sUid] || 0);
        return { ...std, expectedVersion };
      });

      const operationId = crypto.randomUUID();
      const res = await fetch('/api/results/save-marks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          operationId,
          examId,
          workflowMode: 'CONNECTED',
          selectedClass,
          selectedSection,
          selectedAcademicYear,
          subjectToSave,
          subjectKey: normKey,
          customSubjectId: customMatch?.id || null,
          totalEligibleCount: activeStudents.length,
          students: studentsWithVersion,
          correctionReason: forceOverwrite
            ? forceOverwriteReason.trim()
            : (isEditingExistingMarks ? editReasonInput.trim() : null),
          forceOverwrite,
          forceOverwriteConfirmed: forceOverwrite ? true : false
        })
      });

      const data = await res.json();
      if (res.status === 409 && !forceOverwrite) {
        if (data.code === 'WORKFLOW_MODE_CONFLICT' || String(data.error || '').includes('Workflow Mode Conflict')) {
          setStatus({ type: 'error', message: data.error });
          return false;
        }
        const serverVersions: Record<string, number> = {};
        (data.conflicts || []).forEach((c: any) => {
          serverVersions[c.studentUid] = c.serverVersion;
        });
        setConflictInfo({
          subject: subjectToSave,
          serverVersions,
          serverData: data.serverData || {}
        });
        setForceOverwriteChecked(false);
        setForceOverwriteReason('');
        setStatus({
          type: 'error',
          message: `Conflict Detected: Marks for ${subjectToSave} were modified elsewhere. Your inputs are preserved.`
        });
        return false;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Server error while saving marks.');
      }

      if (data.updatedVersions) {
        setSubjectVersions(prev => {
          const merged = { ...(prev[subjectToSave] || prev[normKey] || prev[lowerKey] || {}), ...data.updatedVersions };
          return { ...prev, [subjectToSave]: merged, [normKey]: merged, [lowerKey]: merged };
        });
      }
      setConflictInfo(null);
      setForceOverwriteChecked(false);
      setForceOverwriteReason('');

      // Update initialSavedMarks snapshot after successful save
      const updatedInit = { ...initialSavedMarks };
      activeStudents.forEach(std => {
        const key = `${std.studentUid || std.studentId}_${subjectToSave}`;
        updatedInit[key] = {
          th: std.subjectMarksTH?.[subjectToSave] ?? '',
          pr: std.subjectMarksPR?.[subjectToSave] ?? '',
          absTh: Boolean(std.subjectAbsentsTH?.[subjectToSave]),
          absPr: Boolean(std.subjectAbsentsPR?.[subjectToSave])
        };
      });
      setInitialSavedMarks(updatedInit);

      setExamDocData((prev: any) => ({
        ...prev,
        status: data.examStatus || prev?.status || 'DRAFT',
        subjectStatus: {
          ...(prev?.subjectStatus || {}),
          [subjectToSave]: {
            ...(prev?.subjectStatus?.[subjectToSave] || {}),
            status: data.subjectWorkflowStatus || prev?.subjectStatus?.[subjectToSave]?.status || 'PARTIALLY_FILLED',
            lastSavedAt: new Date().toISOString(),
            lastSavedBy: auth.currentUser?.displayName || (isAdmin ? 'Admin' : 'Teacher')
          }
        }
      }));

      setStatus({ type: 'success', message: `Saved draft marks for ${subjectToSave} via trusted server.` });
      setEditReasonInput('');
      return true;
    } catch (err: any) {
      console.error('Failed to save subject marks:', err);
      setStatus({ type: 'error', message: 'Failed to save marks: ' + err.message + '. Your entered marks remain preserved.' });
      return false;
    } finally {
      studentsToSave.forEach(std => {
        const sUid = std.studentUid || std.uid || std.studentId;
        inflightSavesRef.current[JSON.stringify([examId, sUid, normKey])] = false;
      });
      setIsSavingSubject(false);
    }
  };

  // EXPLICIT SUBJECT SUBMISSION (Separate from Save Draft!)
  const handleSubmitSubjectMarks = async (subjectToSubmit: string, studentsOverride?: any[]) => {
    const activeStudents = studentsOverride || students;
    const emptyCells = collectSubjectEmptyCells(subjectToSubmit, activeStudents);
    if (emptyCells.length > 0) {
      setEmptyModalState({ isOpen: true, mode: 'SUBMIT', subject: subjectToSubmit, emptyCells });
      return;
    }

    setIsSubmittingSubject(true);
    try {
      const savedOk = await handleSaveDraftMarks(subjectToSubmit, false, activeStudents, true);
      if (!savedOk) return;

      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Authentication required.');
      const examId = activeExamId || buildCanonicalExamId(selectedExam, selectedClass, selectedSection, selectedAcademicYear);
      const normKey = subjectToSubmit.replace(/\s+/g, '');

      const res = await fetch('/api/results/submit-subject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          examId,
          subject: subjectToSubmit,
          subjectKey: normKey,
          selectedClass,
          selectedSection,
          selectedAcademicYear,
          eligibleStudentUids: activeStudents.map(s => s.studentUid || s.uid || s.studentId).filter(Boolean),
          expectedSubjects: configuredSubjects
        })
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to submit ${subjectToSubmit}`);
      }

      setExamDocData((prev: any) => ({
        ...prev,
        status: json.examStatus || prev?.status,
        subjectStatus: {
          ...(prev?.subjectStatus || {}),
          [subjectToSubmit]: {
            ...(prev?.subjectStatus?.[subjectToSubmit] || {}),
            status: json.subjectStatus || 'SUBMITTED',
            submittedAt: json.submittedAt || new Date().toISOString()
          }
        },
        correctionsRequested: prev?.correctionsRequested?.[subjectToSubmit]
          ? {
              ...prev.correctionsRequested,
              [subjectToSubmit]: { ...prev.correctionsRequested[subjectToSubmit], resolved: true }
            }
          : prev?.correctionsRequested
      }));

      setStatus({ type: 'success', message: `${subjectToSubmit} explicitly marked as ${json.subjectStatus}!` });
      setActiveEntrySubject(null);
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setIsSubmittingSubject(false);
    }
  };

  // Admin Review: Approve Subject via Trusted Server API
  const handleApproveSubject = async (subj: string) => {
    if (!isAdmin) return;
    setIsApprovingSubject(subj);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Authentication required.');
      const examId = activeExamId || buildCanonicalExamId(selectedExam, selectedClass, selectedSection, selectedAcademicYear);

      const res = await fetch('/api/results/review-subject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          examId,
          subject: subj,
          action: 'APPROVE',
          expectedSubjects: configuredSubjects
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to approve ${subj}`);
      }
      setExamDocData((prev: any) => ({
        ...prev,
        status: json.examStatus || prev?.status,
        subjectStatus: {
          ...(prev?.subjectStatus || {}),
          [subj]: { ...(prev?.subjectStatus?.[subj] || {}), status: 'APPROVED' }
        }
      }));
      setStatus({ type: 'success', message: `Subject "${subj}" approved by Admin.` });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setIsApprovingSubject(null);
    }
  };

  // Admin Review: Request Correction via Trusted Server API (replaces client updateDoc!)
  const handleRequestCorrection = async () => {
    if (!correctionModalSubject || correctionNote.trim().length < 5) {
      setStatus({ type: 'error', message: 'Please provide a clear correction note (min 5 characters).' });
      return;
    }
    setSubmittingCorrection(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Authentication required.');
      const examId = activeExamId || buildCanonicalExamId(selectedExam, selectedClass, selectedSection, selectedAcademicYear);

      const res = await fetch('/api/results/review-subject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          examId,
          subject: correctionModalSubject,
          action: 'REQUEST_CORRECTION',
          note: correctionNote.trim(),
          expectedSubjects: configuredSubjects
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to send correction request.');
      }

      setExamDocData((prev: any) => ({
        ...prev,
        status: 'DRAFT',
        subjectStatus: {
          ...(prev?.subjectStatus || {}),
          [correctionModalSubject]: {
            ...(prev?.subjectStatus?.[correctionModalSubject] || {}),
            status: 'CORRECTION_REQUESTED'
          }
        },
        correctionsRequested: {
          ...(prev?.correctionsRequested || {}),
          [correctionModalSubject]: {
            requestedBy: auth.currentUser?.displayName || 'Admin',
            note: correctionNote.trim(),
            requestedAt: new Date().toISOString(),
            resolved: false
          }
        }
      }));

      setStatus({ type: 'success', message: `Correction requested for ${correctionModalSubject}. Subject Teacher can now revise and resubmit.` });
      setCorrectionModalSubject(null);
      setCorrectionNote('');
    } catch (err: any) {
      setStatus({ type: 'error', message: 'Failed to submit correction request: ' + err.message });
    } finally {
      setSubmittingCorrection(false);
    }
  };

  // Admin-only Explicit Exam Approval (Separate from Publication!)
  const handleApproveExam = async () => {
    if (!isAdmin) return;
    setIsApprovingExam(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Authentication required.');
      const examId = activeExamId || buildCanonicalExamId(selectedExam, selectedClass, selectedSection, selectedAcademicYear);
      const res = await fetch('/api/results/approve-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ examId, expectedSubjects: configuredSubjects })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to approve examination.');
      }
      setExamDocData((prev: any) => ({ ...prev, status: 'APPROVED', published: false }));
      setExamMonitoringList((prev) =>
        prev.map((item) =>
          item.examId === examId ? { ...item, status: 'APPROVED', published: false } : item
        )
      );
      void fetchProgressMonitoring(monitoringYearFilter);
      setStatus({ type: 'success', message: 'Examination APPROVED. You may now proceed with separate Official Publication.' });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setIsApprovingExam(false);
    }
  };

  // Admin-only Unpublish / Reopen with Mandatory Audit Reason (Policy #5)
  const handleUnpublishExam = async () => {
    if (!isAdmin) return;
    if (unpublishReason.trim().length < 10) {
      setStatus({ type: 'error', message: 'A detailed audit reason (minimum 10 characters) is required to unpublish.' });
      return;
    }
    setIsUnpublishing(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Authentication required.');
      const examId = activeExamId || buildCanonicalExamId(selectedExam, selectedClass, selectedSection, selectedAcademicYear);
      const res = await fetch('/api/results/unpublish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ examId, reason: unpublishReason.trim() })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to unpublish examination.');
      }
      setExamDocData((prev: any) => ({
        ...prev,
        status: 'DRAFT',
        published: false,
        unpublishedAt: json.unpublishedAt || new Date().toISOString()
      }));
      // Immediately flip Progress Monitoring card status without waiting for reload
      setExamMonitoringList((prev) =>
        prev.map((item) =>
          item.examId === examId ? { ...item, status: 'DRAFT', published: false } : item
        )
      );
      setUnpublishModalOpen(false);
      setUnpublishReason('');
      setStatus({ type: 'success', message: 'Examination unpublished and reopened as DRAFT immediately. Audit log recorded.' });
      void fetchProgressMonitoring(monitoringYearFilter);
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setIsUnpublishing(false);
    }
  };

  // Trigger Pre-Publication Validation (Admin-only, requires APPROVED state)
  const handleInitiatePublish = () => {
    const report = validatePrePublication({
      userRole,
      teacherProfile,
      targetClass: selectedClass,
      examType: selectedExam,
      academicYear: selectedAcademicYear,
      targetSection: selectedSection,
      students,
      subjects: configuredSubjects,
      subjectConfigs,
      examPublished: examDocData?.published
    });

    if (overallExamStatus !== 'APPROVED') {
      report.valid = false;
      report.errors.unshift('CRITICAL: Examination must be explicitly APPROVED by Admin before publication.');
    }

    setValidationReport(report);
    setIsPublishModalOpen(true);
  };

  // Execute Final Publish Operation (Server recalculates authoritative Nepal CDC grades & GPA — NO new ranks!)
  const handleExecutePublish = async () => {
    if (!validationReport?.valid || !isAdmin) return;
    setIsPublishing(true);
    setStatus({ type: 'info', message: 'Publishing official results with server-authoritative Nepal CDC grading...' });

    try {
      const examId = activeExamId || buildCanonicalExamId(selectedExam, selectedClass, selectedSection, selectedAcademicYear);
      const studentSummaries = students.map((std) => ({
        studentUid: std.studentUid,
        studentId: std.studentId,
        permanentStudentId: std.permanentStudentId || std.studentId,
        studentEmis: std.studentEmis || '',
        studentName: std.studentName,
        rollNo: std.rollNo || '',
        rollNumberSnapshot: std.rollNo || '',
        email: std.email || '',
        guardianEmail: std.guardianEmail || '',
        guardianName: std.guardianName || ''
      }));

      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        setStatus({ type: 'error', message: 'Authentication required. Please sign in again.' });
        return;
      }

      const res = await fetch('/api/results/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          examId,
          targetClass: selectedClass,
          targetSection: selectedSection,
          targetAcademicYear: selectedAcademicYear,
          summaryRecords: studentSummaries
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Server error while publishing results.');
      }

      // Dispatch Publication Emails to Guardian Email (with fallback to Student Registered Email) + Portal Link
      let emailFeedback: { totalSent: number; failedCount: number; smtpConfigured?: boolean; error?: string } = { totalSent: 0, failedCount: 0, smtpConfigured: true };
      try {
        const emailRes = await fetch('/api/results/send-publication-emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            examId,
            examType: selectedExam,
            className: selectedClass,
            academicYear: selectedAcademicYear,
            students: studentSummaries.map(s => ({
              email: s.email || '',
              guardianEmail: s.guardianEmail || '',
              guardianName: s.guardianName || '',
              name: s.studentName,
              studentId: s.permanentStudentId || s.studentId,
              studentUid: s.studentUid
            }))
          })
        });

        if (emailRes.ok) {
          emailFeedback = await emailRes.json();
        } else if (emailRes.status === 503) {
          const errBody = await emailRes.json().catch(() => ({}));
          emailFeedback = {
            totalSent: 0,
            failedCount: 0,
            smtpConfigured: false,
            error: errBody.error || 'SMTP service is not configured.'
          };
        }
      } catch (mailErr: any) {
        console.warn('Non-blocking publication email error:', mailErr);
      }

      setExamDocData((prev: any) => ({ ...prev, published: true, status: 'PUBLISHED' }));
      setExamMonitoringList((prev) =>
        prev.map((item) =>
          item.examId === examId ? { ...item, status: 'PUBLISHED', published: true } : item
        )
      );
      void fetchProgressMonitoring(monitoringYearFilter);
      setPublishFeedback({ totalStudents: students.length, emailFeedback });
      setStatus({
        type: 'success',
        message: emailFeedback.smtpConfigured === false
          ? `Class ${selectedClass} — ${selectedExam} published! Email notifications skipped (SMTP not configured).`
          : `Class ${selectedClass} — ${selectedExam} published! ${emailFeedback.totalSent} guardian / student email notification(s) sent.`
      });
      setIsPublishModalOpen(false);
    } catch (err: any) {
      console.error('Error executing publish:', err);
      setStatus({ type: 'error', message: 'Failed to publish results: ' + err.message });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div ref={workspaceTopRef} className="space-y-5 scroll-mt-4">
      {/* Compact Connected Setup Ready Banner (when user just completed Shared Setup) */}
      {isConnected && !isPreparationActive && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="text-xs text-emerald-900">
              <div className="font-bold">Shared Examination Setup Ready</div>
              <div className="text-emerald-800 mt-0.5">
                {formatAcademicYearDisplayTitle(selectedAcademicYear, managedYears)} &middot; Class {selectedClass} ({selectedSection}) &middot; {selectedExam}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleOpenPreparation()}
            disabled={loadingContext}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
          >
            {loadingContext ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
            Initialize &amp; Open Examination
          </button>
        </div>
      )}

      {/* LIST VIEW: Shown cleanly at top when no exam is currently open */}
      {!isPreparationActive && (
        <>
          {/* Optional Collapsible Direct Selector (keeps default view simple and uncrowded) */}
          {showQuickSelector && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Quick Select Examination</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Open a specific class &amp; term directly, or use &ldquo;+ Initialize New Exam&rdquo; above to configure a new one.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuickSelector(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-600">Academic Year</label>
                    {isAdmin && !isConnected && (
                      <button
                        type="button"
                        onClick={() => setIsAddYearModalOpen(true)}
                        className="text-[11px] font-semibold text-blue-600 hover:underline"
                      >
                        + Add Year
                      </button>
                    )}
                  </div>
                  <select
                    value={selectedAcademicYear}
                    disabled={isConnected}
                    onChange={e => {
                      setSelectedAcademicYear(e.target.value);
                      setIsPreparationActive(false);
                    }}
                    className={`w-full px-3 py-2 border rounded-lg bg-white text-sm font-medium text-slate-800 disabled:bg-slate-100 ${
                      isQuickSelectFutureOrInactive ? 'border-amber-400 bg-amber-50/40' : 'border-slate-300'
                    }`}
                  >
                    <option value="">Select Session</option>
                    {availableAcademicYears.map(y => {
                      const isUpcoming = y.status === 'INACTIVE' || y.bsYear > currentBsYearNum;
                      const suffix = y.isCurrent
                        ? ' (Current)'
                        : isUpcoming
                        ? ' (Upcoming — Inactive)'
                        : y.status === 'ARCHIVED'
                        ? ' (Archived — Read-Only)'
                        : ' (Past)';
                      return (
                        <option key={y.id} value={y.id}>
                          {y.name}{suffix}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Class</label>
                  <select
                    value={selectedClass}
                    disabled={isConnected}
                    onChange={e => {
                      setSelectedClass(e.target.value);
                      setIsPreparationActive(false);
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm font-medium text-slate-800 disabled:bg-slate-100"
                  >
                    <option value="">Select Class</option>
                    {allowedClasses.map(c => <option key={c} value={c}>Class {c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Section</label>
                  <select
                    value={selectedSection}
                    disabled={isConnected}
                    onChange={e => {
                      setSelectedSection(e.target.value);
                      setIsPreparationActive(false);
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm font-medium text-slate-800 disabled:bg-slate-100"
                  >
                    <option value="">Select Section</option>
                    {DEFAULT_SECTIONS.map(s => <option key={s} value={s}>Section {s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Examination</label>
                  <select
                    value={selectedExam}
                    disabled={isConnected}
                    onChange={e => {
                      setSelectedExam(e.target.value);
                      setIsPreparationActive(false);
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm font-medium text-slate-800 disabled:bg-slate-100"
                  >
                    <option value="">Select Examination</option>
                    {EXAM_TYPES.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => handleOpenPreparation()}
                    disabled={loadingContext || !selectedClass || !selectedExam || !selectedAcademicYear || isQuickSelectFutureOrInactive}
                    className="w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {loadingContext ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                    Open Exam
                  </button>
                </div>
              </div>
              {isQuickSelectFutureOrInactive && (
                <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span>
                    <strong>Current Academic Year is {currentAcademicYearTitle}.</strong>{' '}
                    {formatAcademicYearDisplayTitle(selectedAcademicYear, managedYears)} is an upcoming/inactive session with no enrolled students yet.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAcademicYear(defaultAcademicYear);
                      setIsPreparationActive(false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 transition-colors"
                  >
                    Switch to {currentAcademicYearTitle}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Clean Examination Listing & Progress Monitoring */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Examinations &amp; Progress Monitoring
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isAdmin ? 'Admin Authority' : isClassTeacher ? `Class Teacher (Class ${selectedClass})` : 'Subject Teacher'} &middot; Select any examination below to manage subject marks, review matrix, or publish.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickSelector((prev) => !prev)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>{showQuickSelector ? 'Hide Selector' : 'Quick Select'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => fetchProgressMonitoring(monitoringYearFilter)}
                  disabled={loadingMonitoring}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
                  title="Refresh Monitoring Data"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingMonitoring ? 'animate-spin text-indigo-600' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
            {/* Filter bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
                <div className="flex items-center gap-1.5">
                  <span>Session:</span>
                  <select
                    value={monitoringYearFilter}
                    onChange={e => setMonitoringYearFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-800 text-xs"
                  >
                    <option value="all">All Sessions</option>
                    {availableAcademicYears.map(y => {
                      const isUpcoming = y.status === 'INACTIVE' || y.bsYear > currentBsYearNum;
                      const suffix = y.isCurrent
                        ? ' (Current)'
                        : isUpcoming
                        ? ' (Upcoming — Inactive)'
                        : y.status === 'ARCHIVED'
                        ? ' (Archived)'
                        : ' (Past)';
                      return (
                        <option key={y.id} value={y.id}>
                          {y.name}{suffix}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>Class:</span>
                  <select
                    value={monitoringClassFilter}
                    onChange={e => setMonitoringClassFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-800 text-xs"
                  >
                    <option value="all">All Classes</option>
                    {allClasses.map(c => <option key={c} value={normalizeClass(c)}>Class {normalizeClass(c)}</option>)}
                  </select>
                </div>
              </div>
              <div className="text-xs font-bold text-slate-500">
                Total Monitored Exams: <strong className="text-slate-900">{examMonitoringList.filter(ex => monitoringClassFilter === 'all' || normalizeClass(ex.class) === normalizeClass(monitoringClassFilter)).length}</strong>
              </div>
            </div>

            {loadingMonitoring ? (
              <div className="p-8 text-center text-slate-500 text-xs font-semibold flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                Loading examination progress metrics...
              </div>
            ) : isMonitoringFutureOrInactive ? (
              <div className="p-8 text-center bg-amber-50 rounded-xl border border-amber-200 space-y-2.5">
                <Calendar className="w-7 h-7 text-amber-600 mx-auto" />
                <p className="text-xs font-bold text-amber-950">
                  Current Academic Year is {currentAcademicYearTitle}
                </p>
                <p className="text-[11px] text-amber-800 max-w-md mx-auto">
                  {formatAcademicYearDisplayTitle(monitoringYearFilter, managedYears)} is an upcoming/inactive session with no examinations or enrolled students yet.
                </p>
                <button
                  type="button"
                  onClick={() => setMonitoringYearFilter(defaultAcademicYear)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors"
                >
                  Switch to Current Year ({currentAcademicYearTitle})
                </button>
              </div>
            ) : examMonitoringList.filter(ex => monitoringClassFilter === 'all' || normalizeClass(ex.class) === normalizeClass(monitoringClassFilter)).length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">
                  No examinations initialized yet for {monitoringYearFilter === 'all' ? 'any session' : `session ${formatAcademicYearDisplayTitle(monitoringYearFilter, managedYears)}`}.
                </p>
                <p className="text-[11px] text-slate-500 mt-1">Click &ldquo;+ Initialize New Exam&rdquo; above or switch the Session filter.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {examMonitoringList
                  .filter(ex => monitoringClassFilter === 'all' || normalizeClass(ex.class) === normalizeClass(monitoringClassFilter))
                  .map(ex => {
                    const cardExamId = ex.examId || ex.id;
                    const isExpanded = Boolean(expandedExamCards[cardExamId]);
                    const displayExamName = ex.examName || ex.name || ex.examType || cardExamId;
                    const eligibleStudents = Number(ex.totalEligibleStudents ?? ex.eligibleStudentsCount ?? 0);
                    const subjectItems = Array.isArray(ex.subjects)
                      ? ex.subjects
                      : Array.isArray(ex.subjectProgress)
                      ? ex.subjectProgress
                      : [];
                    const totalSlots = Number(
                      ex.totalSlots ?? (eligibleStudents * subjectItems.length)
                    );
                    const totalEnteredMarks = Number(
                      ex.totalEnteredMarks ??
                        subjectItems.reduce((sum: number, s: any) => sum + Number(s.enteredStudentsCount || 0), 0)
                    );
                    const overallPercent = Number(
                      ex.overallPercent ??
                        (totalSlots > 0 ? Math.min(100, Math.round((totalEnteredMarks / totalSlots) * 100)) : 0)
                    );
                    const isPublishedCard = Boolean(ex.published === true || ex.status === 'PUBLISHED');

                    return (
                      <div key={cardExamId} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm hover:border-slate-300 transition-all">
                        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              onClick={() => toggleExamCard(cardExamId)}
                              className="p-1 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors mt-0.5"
                              title={isExpanded ? 'Collapse Subject Breakdown' : 'Expand Subject Breakdown'}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-black text-slate-900">
                                  {displayExamName}
                                </h4>
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-800">
                                  Class {ex.class} ({ex.section || 'A'})
                                </span>
                                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                                  {ex.academicYear} BS
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">
                                Roster: <strong className="text-slate-800">{eligibleStudents} students</strong> &bull;{' '}
                                Marks entered: <strong className="text-slate-800">{totalEnteredMarks} / {totalSlots} slots ({overallPercent}%)</strong>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 flex-wrap">
                            {/* Progress bar */}
                            <div className="w-32 hidden sm:block">
                              <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full transition-all ${overallPercent === 100 ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                                  style={{ width: `${Math.min(100, overallPercent)}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-slate-500 block text-right mt-0.5">{overallPercent}% complete</span>
                            </div>

                            {/* Status Badge */}
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                              isPublishedCard
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : ex.status === 'READY FOR REVIEW' || ex.status === 'READY_FOR_REVIEW'
                                ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                : 'bg-amber-100 text-amber-900 border border-amber-300'
                            }`}>
                              {isPublishedCard ? 'PUBLISHED' : ex.status || 'IN PROGRESS'}
                            </span>

                            {/* Open Exam button */}
                            <button
                              type="button"
                              onClick={() => {
                                handleOpenPreparation({
                                  examId: cardExamId,
                                  academicYear: ex.academicYear || defaultAcademicYear,
                                  className: normalizeClass(ex.class),
                                  section: ex.section || 'A',
                                  examName: displayExamName,
                                  allowExistingWithoutSharedSetup: true
                                });
                              }}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1 transition-all shadow-sm"
                            >
                              Open <ChevronRight className="w-3.5 h-3.5" />
                            </button>

                            {/* Primary Admin Draft Cleanup button (unpublished drafts only) */}
                            {isPrimaryAdmin && !isPublishedCard && (
                              <button
                                type="button"
                                onClick={() => setDeleteDraftModalExam({ ...ex, examId: cardExamId, examName: displayExamName })}
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors"
                                title="Delete unpublished draft examination (Primary Admin only)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expandable Subject Breakdown */}
                        {isExpanded && (
                          <div className="p-4 border-t border-slate-200 bg-slate-50/20 overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200 bg-slate-100/70">
                                <tr>
                                  <th className="py-2 px-3">Subject</th>
                                  <th className="py-2 px-3">Assigned Teacher</th>
                                  <th className="py-2 px-3">Student Marks Progress</th>
                                  <th className="py-2 px-3">Workflow Status</th>
                                  <th className="py-2 px-3 text-right">Last Saved</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white font-medium text-slate-800">
                                {subjectItems.map((sub: any) => {
                                  const subKey = sub.subjectKey || sub.subject || sub.subjectName;
                                  const subName = sub.subjectName || sub.subject || subKey;
                                  const teacherName = sub.assignedTeacherName || sub.assignedTeacher || 'Unassigned';
                                  const completionPct = Number(sub.completionPercent ?? sub.progressPercentage ?? 0);
                                  const wf = sub.workflowStatus || sub.status || 'NOT_STARTED';
                                  const statusBadgeClass = 
                                    wf === 'APPROVED' ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                                    wf === 'SUBMITTED' ? 'bg-indigo-100 text-indigo-900 border-indigo-300' :
                                    wf === 'MARKS_COMPLETE' ? 'bg-blue-100 text-blue-900 border-blue-300' :
                                    wf === 'CORRECTION_REQUESTED' ? 'bg-rose-100 text-rose-900 border-rose-300' :
                                    wf === 'DRAFT' || wf === 'PARTIALLY_FILLED' ? 'bg-amber-100 text-amber-900 border-amber-300' :
                                    wf === 'UNASSIGNED' ? 'bg-slate-200 text-slate-700 border-slate-300' :
                                    'bg-slate-100 text-slate-700 border-slate-200';

                                  return (
                                    <tr key={subKey} className="hover:bg-slate-50/80">
                                      <td className="py-2.5 px-3 font-bold text-slate-900">{subName}</td>
                                      <td className="py-2.5 px-3 text-slate-600">{teacherName}</td>
                                      <td className="py-2.5 px-3">
                                        <div className="flex items-center gap-2">
                                          <span className="font-semibold text-slate-900">{sub.enteredStudentsCount ?? 0} / {sub.eligibleStudentsCount ?? eligibleStudents}</span>
                                          <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                            <div 
                                              className="h-full bg-indigo-600 rounded-full" 
                                              style={{ width: `${Math.min(100, completionPct)}%` }} 
                                            />
                                          </div>
                                          <span className="text-[10px] text-slate-500 font-bold">{completionPct}%</span>
                                        </div>
                                      </td>
                                      <td className="py-2.5 px-3">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${statusBadgeClass}`}>
                                          {wf}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-3 text-right text-slate-500 text-[11px] font-mono">
                                        {sub.lastSavedAt ? new Date(sub.lastSavedAt).toLocaleDateString() : '—'}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
            </div>
          </div>
        </>
      )}

      {/* 2. Active Result Preparation Workspace (Focused Detail View — auto-scrolled to top) */}
      {isPreparationActive && (
        <div className="space-y-5">
          {/* Clean Breadcrumb Bar to Return to Examinations List */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setIsPreparationActive(false);
                scrollWorkspaceToTop();
              }}
              className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 border border-slate-200 shadow-xs transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Examinations
            </button>
            <button
              type="button"
              onClick={() => handleOpenPreparation()}
              disabled={loadingContext}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 text-xs font-semibold inline-flex items-center gap-1.5 border border-slate-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingContext ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
          </div>

          {/* Header Summary Banner */}
          <div className="bg-[#0A2540] text-white p-6 rounded-xl shadow-sm border border-slate-800">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="text-xs font-semibold text-blue-200 tracking-wide">
                  {selectedAcademicYear} BS &middot; Section {selectedSection}
                </div>
                <h1 className="text-2xl font-bold mt-1">
                  Class {selectedClass} — {selectedExam}
                </h1>
                <p className="text-xs text-slate-300 mt-1.5 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" /> Enrolled Students: <strong className="text-white">{students.length}</strong> &middot; 
                  Configured Subjects: <strong className="text-white">{configuredSubjects.length}</strong>
                </p>
              </div>

              {/* Status and Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Overall Status Badge */}
                <div className="text-right mr-2">
                  <p className="text-[10px] uppercase tracking-wider text-blue-300 font-bold">Exam Lifecycle</p>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider mt-0.5 ${
                    overallExamStatus === 'PUBLISHED'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : overallExamStatus === 'APPROVED'
                        ? 'bg-indigo-400 text-indigo-950 font-black'
                        : overallExamStatus === 'READY_FOR_REVIEW'
                          ? 'bg-blue-400 text-blue-950 font-black'
                          : 'bg-amber-400 text-amber-950 font-black'
                  }`}>
                    {overallExamStatus.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Review Result Matrix (Admin & Class Teacher) */}
                {(isAdmin || isClassTeacher) && (
                  <button
                    onClick={() => setIsReviewModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-blue-300" />
                    Review Matrix
                  </button>
                )}

                {/* Admin-only Explicit Approve Exam (Separate from Publication!) */}
                {isAdmin && overallExamStatus === 'READY_FOR_REVIEW' && (
                  <button
                    onClick={handleApproveExam}
                    disabled={isApprovingExam}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs flex items-center gap-1.5 shadow-md transition-all disabled:opacity-50"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {isApprovingExam ? 'Approving...' : 'Approve Exam'}
                  </button>
                )}

                {/* Admin-only Separate Publish Result (ONLY after APPROVED!) */}
                {canPublish ? (
                  overallExamStatus === 'PUBLISHED' ? (
                    <button
                      onClick={() => setUnpublishModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center gap-1.5 shadow-md transition-all"
                    >
                      <Unlock className="w-4 h-4" />
                      Unpublish / Reopen
                    </button>
                  ) : overallExamStatus === 'APPROVED' ? (
                    <button
                      onClick={handleInitiatePublish}
                      className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs flex items-center gap-1.5 shadow-md transition-all"
                    >
                      <Send className="w-4 h-4" />
                      Publish Official Results
                    </button>
                  ) : null
                ) : (
                  <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-xs text-blue-200">
                    <Lock className="w-3.5 h-3.5 text-blue-300" />
                    <span>Approval &amp; Publication restricted to Administrators only</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Subject Preparation Cards / Grid */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                  Subject Preparation Breakdown
                </h3>
                <p className="text-xs text-gray-500 font-medium">
                  Authoritative subject status, STEP 1 assigned teachers, and mark entry checkpoints.
                </p>
              </div>
            </div>

            {/* Subject Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 font-black uppercase tracking-wider border-b border-gray-200">
                    <th className="py-3.5 px-4">Subject</th>
                    <th className="py-3.5 px-4">Assigned Teacher (STEP 1)</th>
                    <th className="py-3.5 px-4">Progress</th>
                    <th className="py-3.5 px-4">Subject Status</th>
                    <th className="py-3.5 px-4">Notes / Corrections</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {configuredSubjects.map(subj => {
                    const resolution = teacherResolutions[subj];
                    const { status: subjStatus, enteredCount, totalCount } = computeSubjectPreparationStatus(subj, students, subjectConfigs);
                    const canAccess = canTeacherAccessSubject(userRole, teacherProfile, selectedClass, subj, selectedSection, selectedAcademicYear);
                    const correction = examDocData?.correctionsRequested?.[subj];

                    return (
                      <tr key={subj} className="hover:bg-blue-50/30 transition-colors">
                        {/* Subject */}
                        <td className="py-3 px-4 font-bold text-gray-900 text-sm">
                          {subj}
                        </td>

                        {/* Assigned Teacher */}
                        <td className="py-3 px-4">
                          {resolution?.status === 'ASSIGNED' && (
                            <span className="font-bold text-gray-800 flex items-center gap-1.5">
                              <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                              {resolution.teacherName}
                            </span>
                          )}
                          {resolution?.status === 'UNASSIGNED' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                              <AlertCircle className="w-3 h-3" /> UNASSIGNED
                            </span>
                          )}
                          {resolution?.status === 'CONFLICT' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                              <AlertTriangle className="w-3 h-3" /> MULTIPLE TEACHERS ASSIGNED
                            </span>
                          )}
                        </td>

                        {/* Progress */}
                        <td className="py-3 px-4 font-mono font-bold text-gray-700">
                          <div className="flex items-center gap-2">
                            <span>{enteredCount} / {totalCount}</span>
                            <div className="w-16 bg-gray-200 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className={`h-full ${enteredCount === totalCount && totalCount > 0 ? 'bg-emerald-500' : 'bg-blue-600'}`} 
                                style={{ width: `${totalCount > 0 ? (enteredCount / totalCount) * 100 : 0}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Authoritative 7-State Subject Workflow Status */}
                        {(() => {
                          const serverSubjStatus = examDocData?.subjectStatus?.[subj]?.status || subjStatus;
                          const badgeStyle =
                            serverSubjStatus === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : serverSubjStatus === 'SUBMITTED' || serverSubjStatus === 'RESUBMITTED'
                              ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                              : serverSubjStatus === 'CORRECTION_REQUESTED'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : serverSubjStatus === 'MARKS_COMPLETE'
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : serverSubjStatus === 'PARTIALLY_FILLED'
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-gray-100 text-gray-600 border border-gray-200';
                          return (
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${badgeStyle}`}>
                                {String(serverSubjStatus).replace(/_/g, ' ')}
                              </span>
                            </td>
                          );
                        })()}

                        {/* Correction Request Note */}
                        <td className="py-3 px-4">
                          {correction && !correction.resolved ? (
                            <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 p-2 rounded-lg max-w-xs">
                              <div className="font-bold flex items-center gap-1 text-amber-800">
                                <MessageSquare className="w-3 h-3" /> Correction Requested:
                              </div>
                              <p className="line-clamp-2 mt-0.5 italic">{correction.note}</p>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-[11px]">No issues</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right space-x-1.5">
                          {/* Admin-only Approve Subject & Request Correction */}
                          {isAdmin && !examDocData?.published && (
                            <>
                              {(examDocData?.subjectStatus?.[subj]?.status === 'SUBMITTED' ||
                                examDocData?.subjectStatus?.[subj]?.status === 'RESUBMITTED' ||
                                examDocData?.subjectStatus?.[subj]?.status === 'MARKS_COMPLETE') && (
                                <button
                                  onClick={() => handleApproveSubject(subj)}
                                  disabled={isApprovingSubject === subj}
                                  className="px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 disabled:opacity-50"
                                >
                                  {isApprovingSubject === subj ? 'Approving...' : 'Approve Subject'}
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setCorrectionModalSubject(subj);
                                  setCorrectionNote(correction?.note || '');
                                }}
                                className="px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-50 rounded-lg border border-amber-200"
                              >
                                Request Correction
                              </button>
                            </>
                          )}

                          {/* Enter / Edit Marks Button */}
                          {canAccess ? (
                            <button
                              onClick={() => {
                                if (onNavigateToManual) {
                                  onNavigateToManual({
                                    selectedAcademicYear,
                                    selectedExam,
                                    selectedClass,
                                    selectedSection,
                                    targetSubject: subj
                                  });
                                } else {
                                  const initMap: Record<string, any> = {};
                                  students.forEach(std => {
                                    const key = `${std.studentUid || std.studentId}_${subj}`;
                                    initMap[key] = {
                                      th: std.subjectMarksTH?.[subj] ?? '',
                                      pr: std.subjectMarksPR?.[subj] ?? '',
                                      absTh: Boolean(std.subjectAbsentsTH?.[subj]),
                                      absPr: Boolean(std.subjectAbsentsPR?.[subj])
                                    };
                                  });
                                  setInitialSavedMarks(initMap);
                                  setEditReasonInput('');
                                  setActiveEntrySubject(subj);
                                }
                              }}
                              className="px-3 py-1.5 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
                            >
                              Enter / Edit Marks
                            </button>
                          ) : (
                            <span className="text-gray-400 text-[11px] font-semibold italic">
                              Restricted to Assigned Teacher
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
        </div>
      )}

      {/* 3. Mark Entry Drawer / Modal */}
      {activeEntrySubject && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-blue-600" />
                  Subject Mark Entry: {activeEntrySubject}
                </h3>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  Class {selectedClass} • {selectedExam} • {selectedAcademicYear} • Saving persists marks as <strong>DRAFT</strong> (unpublished).
                </p>
              </div>
              <button
                onClick={() => {
                  if (isSubjectEntryDirty(activeEntrySubject)) {
                    setShowSubjectDiscardModal(true);
                  } else {
                    setActiveEntrySubject(null);
                  }
                }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Table Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {conflictInfo && conflictInfo.subject === activeEntrySubject && (
                <div className="p-4 bg-red-50 border-2 border-red-300 text-red-900 rounded-xl text-xs space-y-2.5">
                  <div className="flex items-center gap-2 font-black text-sm">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <span>CONFLICT DETECTED: Marks for {activeEntrySubject} were modified by another session.</span>
                  </div>
                  <p className="font-medium text-red-800">
                    Your local inputs are preserved. Reload server marks or explicitly confirm Force Overwrite with an audit reason.
                  </p>
                  <div className="space-y-2 bg-white/90 p-3 rounded-lg border border-red-200">
                    <label className="flex items-center gap-2 font-bold text-red-950 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={forceOverwriteChecked}
                        onChange={(e) => setForceOverwriteChecked(e.target.checked)}
                        className="w-4 h-4 accent-red-600"
                      />
                      I confirm overwriting newer server marks for this unpublished exam (Audit Trail logged).
                    </label>
                    <input
                      type="text"
                      value={forceOverwriteReason}
                      onChange={(e) => setForceOverwriteReason(e.target.value)}
                      placeholder="Mandatory audit reason for Force Overwrite (min 5 characters)..."
                      className="w-full px-3 py-1.5 border border-red-300 rounded-lg text-xs bg-white outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={() => handleOpenPreparation()}
                      className="px-3 py-1.5 bg-white border border-red-300 rounded-lg text-red-700 font-bold hover:bg-red-100 transition-colors"
                    >
                      Reload Latest Marks
                    </button>
                    <button
                      onClick={() => handleSaveDraftMarks(activeEntrySubject, true)}
                      disabled={isSavingSubject || !forceOverwriteChecked || forceOverwriteReason.trim().length < 5}
                      className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-bold rounded-lg transition-colors shadow-sm"
                    >
                      {isSavingSubject ? 'Saving...' : 'Confirm Force Overwrite'}
                    </button>
                  </div>
                </div>
              )}

              {/* Published / Locked Warning Banner */}
              {(examDocData?.published || examDocData?.status === 'PUBLISHED') && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-bold flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-700" />
                  <span>🔒 PUBLISHED / LOCKED: This examination has already been published. All mark inputs and editing actions are locked against changes.</span>
                </div>
              )}

              {/* Unauthorized Warning Banner */}
              {!canTeacherAccessSubject(userRole, teacherProfile, selectedClass, activeEntrySubject, selectedSection, selectedAcademicYear) && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-700" />
                  <span>⚠️ You are not authorized to edit marks for this subject. Editing is restricted to the assigned subject teacher or administrator.</span>
                </div>
              )}

              {(() => {
                const config = subjectConfigs[activeEntrySubject] || { thFullMarks: 75, prFullMarks: 25, hasTh: true, hasPr: true };
                const isLocked = Boolean(examDocData?.published || examDocData?.status === 'PUBLISHED') || !canTeacherAccessSubject(userRole, teacherProfile, selectedClass, activeEntrySubject, selectedSection, selectedAcademicYear);

                return (
                  <>
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-600 font-black uppercase tracking-wider border-b border-gray-200">
                          <th className="py-2.5 px-3">Roll</th>
                          <th className="py-2.5 px-3">Student Name</th>
                          <th className="py-2.5 px-3">Student ID</th>
                          <th className="py-2.5 px-3 text-center">Theory Mark (Max {config.thFullMarks})</th>
                          <th className="py-2.5 px-3 text-center">Absent TH</th>
                          {config.hasPr && <th className="py-2.5 px-3 text-center">Practical Mark (Max {config.prFullMarks})</th>}
                          {config.hasPr && <th className="py-2.5 px-3 text-center">Absent PR</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {students.map((std, idx) => {
                          const isAbsTH = Boolean(std.subjectAbsentsTH?.[activeEntrySubject]);
                          const isAbsPR = Boolean(std.subjectAbsentsPR?.[activeEntrySubject]);
                          const thErr = markValidationErrors[`${idx}_TH`];
                          const prErr = markValidationErrors[`${idx}_PR`];

                          return (
                            <tr key={std.studentUid} className="hover:bg-blue-50/30 transition-colors">
                              <td className="py-2 px-3 font-mono font-bold text-gray-800">{std.rollNo || '—'}</td>
                              <td className="py-2 px-3 font-bold text-gray-900">{std.studentName}</td>
                              <td className="py-2 px-3 font-mono text-[11px] text-gray-500">{std.permanentStudentId || std.studentId}</td>

                              {/* Theory Input */}
                              <td className="py-2 px-3 text-center">
                                <div className="flex flex-col items-center">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    disabled={isLocked || isAbsTH}
                                    value={isAbsTH ? 'AB' : (std.subjectMarksTH?.[activeEntrySubject] ?? '')}
                                    onChange={e => handleMarkChange(idx, 'TH', e.target.value, activeEntrySubject)}
                                    placeholder={isAbsTH ? 'AB' : `0–${config.thFullMarks}`}
                                    className={`w-20 px-2 py-1 text-center font-bold font-mono text-sm border rounded-lg outline-none transition-all ${
                                      isAbsTH ? 'bg-red-50 text-red-600 border-red-200 font-black' : isLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white focus:ring-2 focus:ring-blue-500'
                                    }`}
                                  />
                                  {thErr && <span className="text-[10px] text-red-600 font-bold mt-0.5">{thErr}</span>}
                                </div>
                              </td>

                              {/* Absent TH Toggle */}
                              <td className="py-2 px-3 text-center">
                                <input
                                  type="checkbox"
                                  disabled={isLocked}
                                  checked={isAbsTH}
                                  onChange={e => handleAbsentToggle(idx, 'TH', e.target.checked, activeEntrySubject)}
                                  className="w-4 h-4 text-red-600 rounded focus:ring-red-500 disabled:opacity-50"
                                />
                              </td>

                              {/* Practical Input (Optional) */}
                              {config.hasPr ? (
                                <>
                                  <td className="py-2 px-3 text-center">
                                    <div className="flex flex-col items-center">
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        disabled={isLocked || isAbsPR}
                                        value={isAbsPR ? 'AB' : (std.subjectMarksPR?.[activeEntrySubject] ?? '')}
                                        onChange={e => handleMarkChange(idx, 'PR', e.target.value, activeEntrySubject)}
                                        placeholder={isAbsPR ? 'AB' : `0–${config.prFullMarks}`}
                                        className={`w-20 px-2 py-1 text-center font-bold font-mono text-sm border rounded-lg outline-none transition-all ${
                                          isAbsPR ? 'bg-red-50 text-red-600 border-red-200 font-black' : isLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white focus:ring-2 focus:ring-blue-500'
                                        }`}
                                      />
                                      {prErr && <span className="text-[10px] text-red-600 font-bold mt-0.5">{prErr}</span>}
                                    </div>
                                  </td>

                                  {/* Absent PR Toggle */}
                                  <td className="py-2 px-3 text-center">
                                    <input
                                      type="checkbox"
                                      disabled={isLocked}
                                      checked={isAbsPR}
                                      onChange={e => handleAbsentToggle(idx, 'PR', e.target.checked, activeEntrySubject)}
                                      className="w-4 h-4 text-red-600 rounded focus:ring-red-500 disabled:opacity-50"
                                    />
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="py-2 px-3 text-center text-gray-400 font-medium italic">N/A</td>
                                  <td className="py-2 px-3 text-center text-gray-400 font-medium italic">N/A</td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Correction Reason Field when editing existing saved marks */}
                    {Object.keys(initialSavedMarks).length > 0 && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1 mt-4">
                        <label className="block text-xs font-bold text-amber-900">
                          Correction Reason <span className="text-rose-600 font-black">*</span> (Required when editing existing saved marks):
                        </label>
                        <input
                          type="text"
                          disabled={isLocked}
                          value={editReasonInput}
                          onChange={e => setEditReasonInput(e.target.value)}
                          placeholder="e.g. Re-evaluated answer script question #3; updated practical experiment log score..."
                          className="w-full px-3 py-1.5 border rounded-lg text-xs font-medium focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                        />
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
              <span className="text-xs text-gray-500 font-medium">
                Note: Saving stores marks in draft. Students and portals will not see these until official publication.
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (isSubjectEntryDirty(activeEntrySubject)) {
                      setShowSubjectDiscardModal(true);
                    } else {
                      setActiveEntrySubject(null);
                    }
                  }}
                  className="px-4 py-2 border border-gray-200 rounded-xl font-bold text-xs text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveDraftMarks(activeEntrySubject)}
                  disabled={isSavingSubject || isSubmittingSubject || Boolean(examDocData?.published)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSavingSubject ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Draft
                </button>
                <button
                  onClick={() => handleSubmitSubjectMarks(activeEntrySubject)}
                  disabled={isSavingSubject || isSubmittingSubject || Boolean(examDocData?.published)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingSubject ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {examDocData?.subjectStatus?.[activeEntrySubject]?.status === 'CORRECTION_REQUESTED'
                    ? 'Resubmit Subject Marks'
                    : 'Submit Subject Marks'}
                </button>
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Subject Mark Entry Unsaved Discard Confirmation Modal */}
      {showSubjectDiscardModal && (
        <ModalPortal>
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="p-3 bg-amber-100 rounded-xl">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900">
                  Discard Unsaved Marks?
                </h3>
                <p className="text-xs text-gray-500 font-medium">
                  You have pending mark entries for <strong>{activeEntrySubject}</strong> that have not been saved.
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-600 bg-amber-50/80 border border-amber-200 p-3 rounded-xl font-medium">
              Closing will discard changes made in this session and restore the last saved mark values from the server.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSubjectDiscardModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeEntrySubject) {
                    revertSubjectMarks(activeEntrySubject);
                  }
                  setShowSubjectDiscardModal(false);
                  setActiveEntrySubject(null);
                  setEditReasonInput('');
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl shadow transition-colors cursor-pointer"
              >
                Discard & Close
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* 4. Complete Class Review Modal */}
      {isReviewModalOpen && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                  Class Result Review & Verification: Class {selectedClass}
                </h3>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  Inspection of student mark completeness, percentages, and Nepal GPA across all subjects.
                </p>
              </div>
              <button
                onClick={() => setIsReviewModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <ClassResultMatrix matrixData={matrixData} />
            </div>

            <div className="p-4 border-t border-gray-100 flex items-center justify-end bg-gray-50/50">
              <button
                onClick={() => setIsReviewModalOpen(false)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl"
              >
                Close Review
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* 5. Correction Request Modal */}
      {correctionModalSubject && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-amber-600" />
              Correction Request: {correctionModalSubject}
            </h3>
            <p className="text-xs text-gray-500 font-medium">
              Provide feedback or instructions for the subject teacher to revise student marks.
            </p>

            <textarea
              rows={4}
              value={correctionNote}
              onChange={e => setCorrectionNote(e.target.value)}
              placeholder="e.g. Please verify roll 5 and roll 12 practical marks; marks appear flipped."
              className="w-full p-3 border rounded-xl text-xs focus:ring-2 focus:ring-amber-500 font-medium outline-none"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setCorrectionModalSubject(null)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestCorrection}
                disabled={submittingCorrection || !correctionNote.trim()}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl flex items-center gap-2 disabled:opacity-50"
              >
                {submittingCorrection ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Correction Request
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* 6. Pre-Publication Validation & Publish Modal */}
      {isPublishModalOpen && validationReport && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                Pre-Publication Validation Checklist
              </h3>
              <button onClick={() => setIsPublishModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Validation Outcome Banner */}
            {validationReport.valid ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2">
                <div className="flex items-center gap-2 font-black text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  All 20 Pre-Publication Checks Passed!
                </div>
                <p className="text-xs text-emerald-800 leading-relaxed font-medium">
                  {validationReport.stats.totalStudents} students verified across {validationReport.stats.totalSubjects} subjects. Ranks and GPAs are verified and ready for official release.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 space-y-2">
                <div className="flex items-center gap-2 font-black text-sm">
                  <AlertCircle className="w-5 h-5 text-rose-600" />
                  Publication Blocked: {validationReport.errors.length} Critical Issue(s)
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 text-xs text-rose-800 font-medium">
                  {validationReport.errors.map((err: string, i: number) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="font-bold">•</span>
                      <span>{err}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Post-Publish Details */}
            {validationReport.valid && (
              <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl space-y-2 text-xs text-gray-600">
                <div className="font-bold text-gray-800">What happens on official publication:</div>
                <ul className="list-disc list-inside space-y-1 text-[11px]">
                  <li>Server authoritatively recalculates Nepal CDC 35% subject grades, Strict NG, and unweighted GPA (no new ranks generated).</li>
                  <li>Immutable template snapshot and published records are saved and locked for student portal viewing.</li>
                  <li>Secure email notification + portal link is sent to each student&apos;s registered guardian email.</li>
                </ul>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setIsPublishModalOpen(false)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
              >
                {validationReport.valid ? 'Cancel' : 'Dismiss'}
              </button>
              {validationReport.valid && (
                <button
                  onClick={handleExecutePublish}
                  disabled={isPublishing}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
                >
                  {isPublishing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Confirm & Publish Results
                </button>
              )}
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
      {/* Add New Academic Year Modal */}
      {isAddYearModalOpen && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xl max-w-md w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                Add New Academic Year
              </h3>
              <button onClick={() => setIsAddYearModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewYearFromPrep} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  B.S. Year (4-Digit Number) *
                </label>
                <input
                  type="number"
                  placeholder="e.g. 2086"
                  value={newYearBsInput}
                  onChange={e => {
                    setNewYearBsInput(e.target.value);
                    if (e.target.value && !newYearTitleInput) {
                      setNewYearTitleInput(`${e.target.value} BS`);
                    }
                  }}
                  required
                  min="2000"
                  max="2200"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl font-mono font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Display Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2086 BS"
                  value={newYearTitleInput}
                  onChange={e => setNewYearTitleInput(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAddYearModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNewYear || !newYearBsInput}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {isSubmittingNewYear ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
                  Create & Save to Firestore
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}
      {/* Empty Cell Validation Modal (Nepal CDC Missing vs 0 vs AB) */}
      <EmptyCellsModal
        isOpen={emptyModalState.isOpen}
        mode={emptyModalState.mode}
        emptyCells={emptyModalState.emptyCells}
        onClose={() => setEmptyModalState((prev) => ({ ...prev, isOpen: false }))}
        onMarkAllAbsent={async () => {
          const subj = emptyModalState.subject;
          const mode = emptyModalState.mode;
          const updated = applySubjectEmptyResolution(subj, 'AB');
          setEmptyModalState((prev) => ({ ...prev, isOpen: false }));
          if (mode === 'SUBMIT') {
            await handleSubmitSubjectMarks(subj, updated);
          } else {
            await handleSaveDraftMarks(subj, false, updated, true);
          }
        }}
        onFillAllZero={async () => {
          const subj = emptyModalState.subject;
          const mode = emptyModalState.mode;
          const updated = applySubjectEmptyResolution(subj, 'ZERO');
          setEmptyModalState((prev) => ({ ...prev, isOpen: false }));
          if (mode === 'SUBMIT') {
            await handleSubmitSubjectMarks(subj, updated);
          } else {
            await handleSaveDraftMarks(subj, false, updated, true);
          }
        }}
        onKeepEmptyAndSaveDraft={async () => {
          const subj = emptyModalState.subject;
          setEmptyModalState((prev) => ({ ...prev, isOpen: false }));
          await handleSaveDraftMarks(subj, false, students, true);
        }}
      />

      {/* Admin-Only Unpublish / Reopen Modal (Policy #5) */}
      {unpublishModalOpen && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xl max-w-md w-full space-y-4">
            <h3 className="text-base font-black text-gray-900">Unpublish &amp; Reopen Examination</h3>
            <p className="text-xs text-gray-600">
              Unpublishing hides results from student portals and reopens marks as DRAFT. A mandatory audit reason (minimum 10 characters) will be recorded permanently.
            </p>
            <textarea
              rows={3}
              value={unpublishReason}
              onChange={(e) => setUnpublishReason(e.target.value)}
              placeholder="Enter mandatory audit reason (min 10 characters)..."
              className="w-full p-3 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rose-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUnpublishModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUnpublishing || unpublishReason.trim().length < 10}
                onClick={handleUnpublishExam}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:bg-gray-300"
              >
                {isUnpublishing ? 'Unpublishing...' : 'Confirm Unpublish'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
      {/* Primary Admin Delete Draft Examination Modal */}
      {deleteDraftModalExam && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xl max-w-md w-full space-y-4">
            <div className="flex items-center gap-2.5 text-rose-700">
              <div className="p-2 rounded-xl bg-rose-100">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-black text-gray-900">Delete Unpublished Draft Exam</h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Permanently remove the draft initialization for{' '}
              <strong className="text-gray-900">{deleteDraftModalExam.examName || deleteDraftModalExam.name}</strong>{' '}
              (Class {deleteDraftModalExam.class} - Section {deleteDraftModalExam.section || 'A'}, {deleteDraftModalExam.academicYear} BS) and any unpublished draft mark entries? Published exams are protected and cannot be deleted here.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingDraft}
                onClick={() => setDeleteDraftModalExam(null)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingDraft}
                onClick={handleConfirmDeleteDraft}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:bg-gray-300 flex items-center gap-1.5"
              >
                {isDeletingDraft ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {isDeletingDraft ? 'Deleting...' : 'Delete Draft'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}
