import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ModalPortal } from '../common/ModalPortal';
import {
  CheckCircle2,
  Save,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  Clock,
  Calendar,
  Send,
  ShieldCheck,
  Unlock,
  Lock,
  Loader2,
} from 'lucide-react';
import { StudentResult } from '../../data/resultsState';
import { query, collection, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import {
  canTeacherAccessSubject,
  buildCanonicalExamId,
  parseAndValidateAcademicYear,
} from '../../lib/resultPreparationEngine';
import {
  getNepalGPA,
  getGrade,
  calculateSubjectResult,
} from '../../lib/nepalGradingEngine';
import { getAvailableAcademicYears } from '../../lib/academicPromotionEngine';
import {
  AcademicYearConfig,
  subscribeAcademicYears,
  seedDefaultAcademicYearsIfEmpty,
  formatAcademicYearDisplayTitle,
} from '../../lib/academicYearEngine';
import { EmptyCellsModal, EmptyCellInfo } from './EmptyCellsModal';
import { WorkflowExitConfirmModal } from './WorkflowExitConfirmModal';

export { getNepalGPA, getGrade };

const CLASS_SUBJECTS: Record<string, string[]> = {
  PG: ['English', 'Nepali', 'Mathematics', 'Drawing', 'Rhymes'],
  Nursery: ['English', 'Nepali', 'Mathematics', 'Drawing', 'Rhymes'],
  LKG: ['English', 'Nepali', 'Mathematics', 'Drawing', 'Rhymes'],
  UKG: ['English', 'Nepali', 'Mathematics', 'Drawing', 'Rhymes'],
  '1': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK'],
  '2': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK'],
  '3': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK'],
  '4': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK', 'Moral Science'],
  '5': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK', 'Moral Science'],
  '6': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK', 'Moral Science', 'Opt. Math'],
  '7': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK', 'Moral Science', 'Opt. Math'],
  '8': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK', 'Moral Science', 'Opt. Math'],
  '9': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Opt. Math', 'Computer', 'HPE'],
  '10': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Opt. Math', 'Computer', 'HPE'],
};

interface SubjectConfig {
  thFullMarks: number;
  thPassMarks: number;
  prFullMarks: number;
  prPassMarks: number;
  hasTh: boolean;
  hasPr: boolean;
}

export function ManualEntryTab({
  EXAM_TYPES,
  allClasses,
  allSubjects,
  data,
  setStatus,
  userRole,
  assignedClasses,
  assignedSubjects,
  teacherProfile,
  initialContext,
  onBackToPrep,
  onExit,
  onWorkflowGuardChange,
}: any) {
  const [managedYears, setManagedYears] = useState<AcademicYearConfig[]>([]);
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

  const availableAcademicYears = useMemo(() => getAvailableAcademicYears(managedYears), [managedYears]);
  const currentYearObj = useMemo(
    () => availableAcademicYears.find((y: any) => y.isCurrent) || availableAcademicYears[0] || { id: '2083', name: '2083 BS', bsYear: 2083, isCurrent: true, status: 'ACTIVE' },
    [availableAcademicYears]
  );
  const defaultAcademicYear = currentYearObj?.id || '2083';
  const currentAcademicYearTitle = currentYearObj?.name || `${defaultAcademicYear} BS`;

  const [examCategory, setExamCategory] = useState<'Test' | 'Terminal'>('Terminal');
  const [examType, setExamType] = useState(initialContext?.selectedExam || '');
  const [selectedClass, setSelectedClass] = useState(initialContext?.selectedClass || '');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState(
    initialContext?.selectedAcademicYear || '2083'
  );
  const [selectedSection, setSelectedSection] = useState(initialContext?.selectedSection || 'A');

  useEffect(() => {
    if (defaultAcademicYear && (!selectedAcademicYear || selectedAcademicYear === '2083–2084 B.S.')) {
      setSelectedAcademicYear(defaultAcademicYear);
    }
  }, [defaultAcademicYear, selectedAcademicYear]);

  const selectedYearObj = useMemo(
    () => availableAcademicYears.find((y: any) => y.id === selectedAcademicYear),
    [availableAcademicYears, selectedAcademicYear]
  );
  const selectedBsYearNum = selectedYearObj?.bsYear || parseInt(String(selectedAcademicYear || '2083'), 10) || 2083;
  const currentBsYearNum = currentYearObj?.bsYear || parseInt(String(defaultAcademicYear || '2083'), 10) || 2083;
  const isFutureOrInactiveYear = Boolean(
    selectedAcademicYear &&
    (selectedYearObj?.status === 'INACTIVE' || selectedBsYearNum > currentBsYearNum)
  );
  const isArchivedYear = Boolean(selectedYearObj?.status === 'ARCHIVED');
  const isNonMutatableYear = isFutureOrInactiveYear || isArchivedYear;

  const [activeSubjects, setActiveSubjects] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [subjectConfigs, setSubjectConfigs] = useState<Record<string, SubjectConfig>>({});
  const [subjectVersions, setSubjectVersions] = useState<Record<string, Record<string, number>>>({});
  const [students, setStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Server exam lifecycle state
  const [examStatus, setExamStatus] = useState<'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'PUBLISHED'>('DRAFT');
  const [examWorkflowMode, setExamWorkflowMode] = useState<'STANDALONE' | 'CONNECTED' | null>(null);
  const [subjectStatuses, setSubjectStatuses] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [publishSuccessMessage, setPublishSuccessMessage] = useState<string | null>(null);

  // Save status & concurrency conflict state
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'unsaved'>('idle');
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const correctionReasonRef = useRef('');
  useEffect(() => {
    correctionReasonRef.current = correctionReason;
  }, [correctionReason]);

  // Force overwrite explicit confirmation state (Policy #4)
  const [conflictModalData, setConflictModalData] = useState<{ subject: string; conflicts: any[] } | null>(null);
  const [forceOverwriteChecked, setForceOverwriteChecked] = useState(false);
  const [forceOverwriteReason, setForceOverwriteReason] = useState('');

  // Empty cells modal state (User explicit validation requirement)
  const [emptyModalState, setEmptyModalState] = useState<{
    isOpen: boolean;
    mode: 'DRAFT' | 'SUBMIT';
    emptyCells: EmptyCellInfo[];
  }>({ isOpen: false, mode: 'DRAFT', emptyCells: [] });

  // Unpublish modal state (Admin-only Policy #5)
  const [unpublishModalOpen, setUnpublishModalOpen] = useState(false);
  const [unpublishReason, setUnpublishReason] = useState('');

  // Unsaved changes / active workflow exit & selector-change confirmation
  const [pendingLocalExit, setPendingLocalExit] = useState<{
    targetDestination: string;
    execute: () => void;
  } | null>(null);
  const [isSavingBeforeExit, setIsSavingBeforeExit] = useState(false);

  const initialSavedMarksRef = useRef<Record<string, { th: string; pr: string; absTh: boolean; absPr: boolean }>>({});
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (autoSaveStatus === 'unsaved' || autoSaveStatus === 'saving') {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [autoSaveStatus]);

  const isTeacher = userRole === 'teacher';
  const teacherClass =
    isTeacher && teacherProfile && teacherProfile.class
      ? String(teacherProfile.class).replace(/^Class\s+/i, '')
      : '';

  const allowedClasses = useMemo(() => {
    const base = isTeacher
      ? Array.from(
          new Set([
            ...(teacherClass ? [teacherClass] : []),
            ...(Array.isArray(assignedClasses) ? assignedClasses : []),
          ])
        ).filter(Boolean)
      : userRole === 'admin'
      ? allClasses
      : assignedClasses;
    // Enforce PG through Grade 10 strictly
    return (base || []).filter((c: string) => {
      const n = String(c).replace(/^Class\s+/i, '').trim();
      return !['11', '12'].includes(n);
    });
  }, [isTeacher, teacherClass, assignedClasses, userRole, allClasses]);

  useEffect(() => {
    if (isTeacher && teacherClass && !selectedClass) {
      setSelectedClass(teacherClass);
    } else if (allowedClasses.length === 1 && !selectedClass) {
      setSelectedClass(allowedClasses[0]);
    }
  }, [isTeacher, teacherClass, allowedClasses, selectedClass]);

  // Auto-load base subjects + approved active custom_subjects for selectedClass
  const [customSubjectConfigs, setCustomSubjectConfigs] = useState<Record<string, SubjectConfig>>({});

  useEffect(() => {
    let cancelled = false;
    const loadClassSubjects = async () => {
      if (!selectedClass) {
        setActiveSubjects([]);
        setSelectedSubjects([]);
        setCustomSubjectConfigs({});
        return;
      }

      const normClass = String(selectedClass).replace(/^Class\s+/i, '').trim();
      const baseList: string[] = [...(CLASS_SUBJECTS[normClass] || CLASS_SUBJECTS[selectedClass] || allSubjects || [])];
      const customMap: Record<string, SubjectConfig> = {};

      try {
        const csSnap = await getDocs(collection(db, 'custom_subjects'));
        csSnap.forEach((docSnap) => {
          const cs = docSnap.data();
          if (cs.isActive === false || cs.status === 'ARCHIVED') return;
          const appliesToAll = cs.applyToAllClasses === true || !Array.isArray(cs.classes) || cs.classes.length === 0;
          const classMatches =
            appliesToAll ||
            (Array.isArray(cs.classes) &&
              cs.classes.some((c: string) => String(c).replace(/^Class\s+/i, '').trim() === normClass));
          if (classMatches && cs.name) {
            const sName = String(cs.name).trim();
            if (sName && !baseList.some((b) => b.toLowerCase() === sName.toLowerCase())) {
              baseList.push(sName);
            }
            const thFm = Number(cs.thFullMarks ?? cs.fullMarks ?? 75);
            const prFm = Number(cs.prFullMarks ?? 0);
            const hasTh = cs.hasTh !== undefined ? Boolean(cs.hasTh) : thFm > 0;
            const hasPr = cs.hasPr !== undefined ? Boolean(cs.hasPr) && prFm > 0 : prFm > 0;
            customMap[sName] = {
              hasTh,
              thFullMarks: hasTh ? thFm : 0,
              thPassMarks: hasTh ? Number(cs.thPassMarks ?? Math.ceil(thFm * 0.35)) : 0,
              hasPr,
              prFullMarks: hasPr ? prFm : 0,
              prPassMarks: hasPr ? Number(cs.prPassMarks ?? Math.ceil(prFm * 0.35)) : 0,
            };
          }
        });
      } catch (err) {
        console.warn('Could not load custom_subjects:', err);
      }

      if (cancelled) return;

      let filtered = baseList;
      if (userRole === 'teacher') {
        filtered = baseList.filter((subj: string) =>
          canTeacherAccessSubject(userRole, teacherProfile, selectedClass, subj)
        );
      }
      setCustomSubjectConfigs(customMap);
      setActiveSubjects(filtered);
      setSelectedSubjects(filtered);
    };

    loadClassSubjects();
    return () => {
      cancelled = true;
    };
  }, [selectedClass, allSubjects, userRole, assignedSubjects, teacherProfile]);

  // Load exam metadata, roster, existing marks, and version tracking
  const loadRosterAndMarks = async () => {
    if (!selectedClass || !examType || !selectedAcademicYear) return;
    if (isFutureOrInactiveYear) {
      setStudents([]);
      setExamStatus('DRAFT');
      setExamWorkflowMode(null);
      setSubjectStatuses({});
      setAutoSaveStatus('idle');
      setAutoSaveError(null);
      setLoadingStudents(false);
      return;
    }
    setLoadingStudents(true);
    setPublishSuccessMessage(null);
    setAutoSaveError(null);
    try {
      const canonicalYear = selectedAcademicYear;
      const examId = buildCanonicalExamId(examType, selectedClass, selectedSection || 'A', canonicalYear);

      // 1. Check existing exam doc in Firestore
      let examDocData: any = null;
      try {
        const examSnap = await getDoc(doc(db, 'exams', examId));
        if (examSnap.exists()) {
          examDocData = examSnap.data();
          setExamStatus(examDocData.published ? 'PUBLISHED' : examDocData.status || 'DRAFT');
          setExamWorkflowMode(examDocData.workflowMode || null);
          setSubjectStatuses(examDocData.subjectStatus || {});
        } else {
          setExamStatus('DRAFT');
          setExamWorkflowMode(null);
          setSubjectStatuses({});
        }
      } catch (_) {
        setExamStatus('DRAFT');
        setExamWorkflowMode(null);
        setSubjectStatuses({});
      }

      // 2. Fetch authorized active roster (Server is the single authoritative source)
      let classStudents: any[] = [];
      let loadedFromServer = false;
      const idToken = await auth.currentUser?.getIdToken();
      if (idToken) {
        try {
          const params = new URLSearchParams({
            academicYear: String(canonicalYear),
            className: String(selectedClass),
            section: String(selectedSection || 'A'),
          });
          const rosterRes = await fetch(`/api/exams/authorized-roster?${params.toString()}`, {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          if (rosterRes.ok) {
            const rosterJson = await rosterRes.json();
            if (rosterJson.success && Array.isArray(rosterJson.students)) {
              loadedFromServer = true;
              classStudents = rosterJson.students.map((s: any) => ({
                studentUid: s.studentUid,
                studentId: s.permanentStudentId || s.studentId || s.studentUid,
                permanentStudentId: s.permanentStudentId || s.studentId || s.studentUid,
                studentEmis: s.studentEmis || '',
                schoolId: s.rollNo || s.permanentStudentId || s.studentId || '',
                rollNumberSnapshot: s.rollNo || '',
                rollNo: s.rollNo || '',
                section: s.section || selectedSection || 'A',
                studentName: s.studentName || 'Unknown',
              }));
            }
          }
        } catch (rosterErr) {
          console.warn('Authorized roster fetch fallback:', rosterErr);
        }
      }

      // Network fallback ONLY when server could not respond AND strictly scoped to current academic year
      if (!loadedFromServer && userRole === 'admin' && String(canonicalYear) === String(defaultAcademicYear)) {
        const usersSnap = await getDocs(
          query(collection(db, 'users'), where('role', '==', 'student'), where('class', '==', selectedClass))
        );
        classStudents = usersSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as any))
          .filter((usr) => usr.isDeleted !== true && usr.status !== 'INACTIVE' && usr.status !== 'ARCHIVED')
          .filter((usr) => !selectedSection || selectedSection === 'All' || (usr.section || 'A') === selectedSection)
          .filter((usr) => {
            const uYear = parseAndValidateAcademicYear(usr.academicYear || usr.classAssignedYear || usr.session || '');
            return !uYear || uYear === parseAndValidateAcademicYear(canonicalYear);
          })
          .map((usr) => {
            const permId = usr.permanentStudentId || usr.studentId || usr.id;
            const rollSnap = usr.rollNumber || usr.rollNo || '';
            return {
              studentUid: usr.id,
              studentId: permId,
              permanentStudentId: permId,
              studentEmis: usr.emisNumber || usr.studentEmis || '',
              schoolId: rollSnap || permId,
              rollNumberSnapshot: rollSnap,
              rollNo: rollSnap,
              section: usr.section || selectedSection || 'A',
              studentName:
                usr.fullName ||
                (usr.firstName && usr.lastName ? `${usr.firstName} ${usr.lastName}` : usr.email || 'Unknown'),
            };
          });
      }

      const targetCanonicalYear = parseAndValidateAcademicYear(selectedAcademicYear);
      const isYearMatching = (recYear?: string) => {
        const recCanonical = parseAndValidateAcademicYear(recYear);
        if (recCanonical && targetCanonicalYear) return recCanonical === targetCanonicalYear;
        if (!recYear && targetCanonicalYear === '2083') return true;
        return recYear === selectedAcademicYear;
      };

      const classResults = ((dataRef.current || []) as StudentResult[]).filter(
        (r) => String(r.class) === String(selectedClass) && isYearMatching(r.academicYear)
      );

      // Also fetch directly from results collection for this examId so reload always reflects persisted Firestore records
      const directResultsMap: Record<string, any> = {};
      try {
        const directSnap = await getDocs(query(collection(db, 'results'), where('examId', '==', examId)));
        directSnap.forEach((d) => {
          const rd = d.data();
          const key = rd.studentUid || rd.studentId;
          if (key) directResultsMap[key] = rd;
        });
      } catch (_) {}

      const subjectsToLoad = activeSubjects.length > 0 ? activeSubjects : CLASS_SUBJECTS[selectedClass] || [];

      // Build subject configs using Nepal CDC 35% defaults + exam/custom_subject configs
      const loadedConfigs: Record<string, SubjectConfig> = {};
      const examRec =
        Object.values(directResultsMap)[0] || classResults.find((r) => r.examType === examType);

      subjectsToLoad.forEach((subj: string) => {
        const examSubjConf = Array.isArray(examDocData?.subjects)
          ? examDocData.subjects.find(
              (s: any) =>
                (s.subjectName || s.name || '').toLowerCase() === subj.toLowerCase()
            )
          : null;

        if (examSubjConf) {
          const thFm = Number(examSubjConf.thFullMarks ?? 75);
          const prFm = Number(examSubjConf.prFullMarks ?? 0);
          const hasTh = examSubjConf.hasTh !== undefined ? Boolean(examSubjConf.hasTh) : thFm > 0;
          const hasPr = examSubjConf.hasPr !== undefined ? Boolean(examSubjConf.hasPr) && prFm > 0 : prFm > 0;
          loadedConfigs[subj] = {
            hasTh,
            thFullMarks: hasTh ? thFm : 0,
            thPassMarks: hasTh ? Number(examSubjConf.thPassMarks ?? Math.ceil(thFm * 0.35)) : 0,
            hasPr,
            prFullMarks: hasPr ? prFm : 0,
            prPassMarks: hasPr ? Number(examSubjConf.prPassMarks ?? Math.ceil(prFm * 0.35)) : 0,
          };
        } else if (customSubjectConfigs[subj]) {
          loadedConfigs[subj] = customSubjectConfigs[subj];
        } else if (examRec?.subjects?.[subj]) {
          const sData = examRec.subjects[subj];
          const thFm = Number(sData.thFull ?? sData.thFullMarks ?? 75);
          const prFm = Number(sData.prFull ?? sData.prFullMarks ?? 25);
          const hasTh = sData.hasTh !== undefined ? Boolean(sData.hasTh) : thFm > 0;
          const hasPr = sData.hasPr !== undefined ? Boolean(sData.hasPr) && prFm > 0 : prFm > 0;
          loadedConfigs[subj] = {
            hasTh,
            thFullMarks: hasTh ? thFm : 0,
            thPassMarks: hasTh ? Number(sData.thPass ?? sData.thPassMarks ?? Math.ceil(thFm * 0.35)) : 0,
            hasPr,
            prFullMarks: hasPr ? prFm : 0,
            prPassMarks: hasPr ? Number(sData.prPass ?? sData.prPassMarks ?? Math.ceil(prFm * 0.35)) : 0,
          };
        } else {
          // Standard Nepal CDC 35% default (75/27 TH + 25/9 PR)
          loadedConfigs[subj] = {
            hasTh: true,
            thFullMarks: 75,
            thPassMarks: 27,
            hasPr: true,
            prFullMarks: 25,
            prPassMarks: 9,
          };
        }
      });
      setSubjectConfigs(loadedConfigs);

      const mapped = classStudents.map((s) => {
        const existingRec =
          directResultsMap[s.studentUid] ||
          directResultsMap[s.studentId] ||
          classResults.find((r) => (r.studentUid === s.studentUid || r.studentId === s.studentId) && r.examType === examType);

        const subjectMarksTH: Record<string, string> = {};
        const subjectMarksPR: Record<string, string> = {};
        const subjectAbsentsTH: Record<string, boolean> = {};
        const subjectAbsentsPR: Record<string, boolean> = {};

        subjectsToLoad.forEach((subj: string) => {
          const sData = existingRec?.subjects?.[subj];
          const thM = sData?.thMarks;
          const prM = sData?.prMarks;

          if (thM !== undefined && thM !== null && thM !== '') {
            if (thM === 'AB') {
              subjectAbsentsTH[subj] = true;
              subjectMarksTH[subj] = '';
            } else {
              subjectMarksTH[subj] = String(thM);
              subjectAbsentsTH[subj] = false;
            }
          } else {
            subjectMarksTH[subj] = '';
            subjectAbsentsTH[subj] = false;
          }

          if (prM !== undefined && prM !== null && prM !== '') {
            if (prM === 'AB') {
              subjectAbsentsPR[subj] = true;
              subjectMarksPR[subj] = '';
            } else {
              subjectMarksPR[subj] = String(prM);
              subjectAbsentsPR[subj] = false;
            }
          } else {
            subjectMarksPR[subj] = '';
            subjectAbsentsPR[subj] = false;
          }
        });

        return {
          ...s,
          Class: selectedClass,
          subjectMarksTH,
          subjectMarksPR,
          subjectAbsentsTH,
          subjectAbsentsPR,
        };
      });

      setStudents(mapped);

      const initMap: Record<string, { th: string; pr: string; absTh: boolean; absPr: boolean }> = {};
      mapped.forEach((std: any) => {
        const sUid = std.studentUid || std.studentId;
        subjectsToLoad.forEach((subj: string) => {
          initMap[`${sUid}_${subj}`] = {
            th: std.subjectMarksTH?.[subj] ?? '',
            pr: std.subjectMarksPR?.[subj] ?? '',
            absTh: Boolean(std.subjectAbsentsTH?.[subj]),
            absPr: Boolean(std.subjectAbsentsPR?.[subj]),
          };
        });
      });
      initialSavedMarksRef.current = initMap;

      // Load student_subject_versions for concurrency safety
      const recVerMap: Record<string, Record<string, number>> = {};
      try {
        const recordVersionsSnap = await getDocs(
          query(collection(db, 'student_subject_versions'), where('examId', '==', examId))
        );
        recordVersionsSnap.forEach((d) => {
          const vd = d.data();
          if (vd.studentUid && vd.subjectKey && typeof vd.version === 'number') {
            if (!recVerMap[vd.subjectKey]) recVerMap[vd.subjectKey] = {};
            recVerMap[vd.subjectKey][vd.studentUid] = vd.version;
          }
        });
      } catch (_) {}

      mapped.forEach((std: any) => {
        const sUid = std.studentUid || std.studentId;
        subjectsToLoad.forEach((subj: string) => {
          const normK = subj.replace(/[^a-zA-Z0-9_.-]/g, '').toLowerCase();
          const key = `${sUid}_${subj}`;
          if (!recVerMap[normK]) recVerMap[normK] = {};
          if (recVerMap[normK][sUid] === undefined) {
            const hasExisting =
              initMap[key] && (initMap[key].th !== '' || initMap[key].pr !== '' || initMap[key].absTh || initMap[key].absPr);
            recVerMap[normK][sUid] = hasExisting ? 1 : 0;
          }
        });
      });
      setSubjectVersions(recVerMap);
      setAutoSaveStatus('idle');
    } catch (err) {
      console.error('Error loading standalone marks sheet:', err);
    } finally {
      setLoadingStudents(false);
    }
  };

  useEffect(() => {
    loadRosterAndMarks();
  }, [selectedClass, selectedSection, examType, selectedAcademicYear, activeSubjects, isFutureOrInactiveYear]);

  const isLockedPublished = examStatus === 'PUBLISHED';
  const isCrossModeBlocked = examWorkflowMode === 'CONNECTED';
  const isSheetReadOnly = isLockedPublished || isCrossModeBlocked || isNonMutatableYear;

  const hasModificationsToExistingMarks = (studentsToCheck: any[]) =>
    studentsToCheck.some((std: any) => {
      const sUid = std.studentUid || std.studentId;
      return selectedSubjects.some((subj: string) => {
        const init = initialSavedMarksRef.current[`${sUid}_${subj}`];
        if (!init) return false;
        if (init.th === '' && init.pr === '' && !init.absTh && !init.absPr) return false;
        return (
          (std.subjectMarksTH?.[subj] ?? '') !== init.th ||
          (std.subjectMarksPR?.[subj] ?? '') !== init.pr ||
          Boolean(std.subjectAbsentsTH?.[subj]) !== init.absTh ||
          Boolean(std.subjectAbsentsPR?.[subj]) !== init.absPr
        );
      });
    });

  const handleMarkChange = (idx: number, rawVal: string, type: 'TH' | 'PR', subj: string) => {
    if (isSheetReadOnly) return;
    if (rawVal.includes('-') || /[a-zA-Z]/.test(rawVal)) return;

    let val = rawVal.replace(/[^0-9.]/g, '');
    val = val.replace(/^0+(?=\d)/, '');

    const cnf = subjectConfigs[subj] || {
      thFullMarks: 75,
      thPassMarks: 27,
      prFullMarks: 25,
      prPassMarks: 9,
      hasTh: true,
      hasPr: true,
    };
    const maxMarks = type === 'TH' ? cnf.thFullMarks : cnf.prFullMarks;
    const num = Number(val);
    if (val !== '' && (isNaN(num) || num > maxMarks || num < 0)) return;

    const newS = [...students];
    if (type === 'TH') {
      newS[idx] = {
        ...newS[idx],
        subjectMarksTH: { ...newS[idx].subjectMarksTH, [subj]: val },
        subjectAbsentsTH: { ...newS[idx].subjectAbsentsTH, [subj]: false },
      };
    } else {
      newS[idx] = {
        ...newS[idx],
        subjectMarksPR: { ...newS[idx].subjectMarksPR, [subj]: val },
        subjectAbsentsPR: { ...newS[idx].subjectAbsentsPR, [subj]: false },
      };
    }
    setStudents(newS);
    setAutoSaveStatus('unsaved');
  };

  const handleAbsentChange = (idx: number, type: 'TH' | 'PR', checked: boolean, subj: string) => {
    if (isSheetReadOnly) return;
    const newS = [...students];
    if (type === 'TH') {
      newS[idx] = {
        ...newS[idx],
        subjectAbsentsTH: { ...newS[idx].subjectAbsentsTH, [subj]: checked },
        subjectMarksTH: checked ? { ...newS[idx].subjectMarksTH, [subj]: '' } : newS[idx].subjectMarksTH,
      };
    } else {
      newS[idx] = {
        ...newS[idx],
        subjectAbsentsPR: { ...newS[idx].subjectAbsentsPR, [subj]: checked },
        subjectMarksPR: checked ? { ...newS[idx].subjectMarksPR, [subj]: '' } : newS[idx].subjectMarksPR,
      };
    }
    setStudents(newS);
    setAutoSaveStatus('unsaved');
  };

  // Keyboard navigation across mark inputs (ArrowUp / ArrowDown / ArrowLeft / ArrowRight / Enter)
  const orderedCols = useMemo(() => {
    const cols: Array<{ subj: string; type: 'TH' | 'PR' }> = [];
    selectedSubjects.forEach((subj) => {
      const cnf = subjectConfigs[subj] || { hasTh: true, hasPr: true };
      if (cnf.hasTh) cols.push({ subj, type: 'TH' });
      if (cnf.hasPr) cols.push({ subj, type: 'PR' });
    });
    return cols;
  }, [selectedSubjects, subjectConfigs]);

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    let nextRow = rowIdx;
    let nextCol = colIdx;
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      nextRow = Math.min(students.length - 1, rowIdx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nextRow = Math.max(0, rowIdx - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextCol = Math.min(orderedCols.length - 1, colIdx + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextCol = Math.max(0, colIdx - 1);
    } else {
      return;
    }
    const target = cellRefs.current[`${nextRow}_${nextCol}`];
    if (target) {
      target.focus();
      target.select();
    }
  };

  // Collect all empty cells across eligible students & selected subjects
  const collectEmptyCells = (studentList: any[]): EmptyCellInfo[] => {
    const empty: EmptyCellInfo[] = [];
    studentList.forEach((std) => {
      selectedSubjects.forEach((subj) => {
        const cnf = subjectConfigs[subj] || { hasTh: true, hasPr: true };
        if (cnf.hasTh && !std.subjectAbsentsTH?.[subj] && String(std.subjectMarksTH?.[subj] ?? '').trim() === '') {
          empty.push({
            studentId: std.studentUid || std.studentId,
            studentName: std.studentName || 'Unknown',
            rollNo: std.rollNo || std.schoolId || '',
            subjectCode: subj,
            subjectName: subj,
            component: 'TH',
          });
        }
        if (cnf.hasPr && !std.subjectAbsentsPR?.[subj] && String(std.subjectMarksPR?.[subj] ?? '').trim() === '') {
          empty.push({
            studentId: std.studentUid || std.studentId,
            studentName: std.studentName || 'Unknown',
            rollNo: std.rollNo || std.schoolId || '',
            subjectCode: subj,
            subjectName: subj,
            component: 'PR',
          });
        }
      });
    });
    return empty;
  };

  const applyEmptyCellResolution = (fillType: 'AB' | 'ZERO') => {
    const updated = students.map((std) => {
      const nextTH = { ...std.subjectMarksTH };
      const nextPR = { ...std.subjectMarksPR };
      const nextAbsTH = { ...std.subjectAbsentsTH };
      const nextAbsPR = { ...std.subjectAbsentsPR };

      selectedSubjects.forEach((subj) => {
        const cnf = subjectConfigs[subj] || { hasTh: true, hasPr: true };
        if (cnf.hasTh && !nextAbsTH[subj] && String(nextTH[subj] ?? '').trim() === '') {
          if (fillType === 'AB') {
            nextAbsTH[subj] = true;
            nextTH[subj] = '';
          } else {
            nextTH[subj] = '0';
          }
        }
        if (cnf.hasPr && !nextAbsPR[subj] && String(nextPR[subj] ?? '').trim() === '') {
          if (fillType === 'AB') {
            nextAbsPR[subj] = true;
            nextPR[subj] = '';
          } else {
            nextPR[subj] = '0';
          }
        }
      });

      return {
        ...std,
        subjectMarksTH: nextTH,
        subjectMarksPR: nextPR,
        subjectAbsentsTH: nextAbsTH,
        subjectAbsentsPR: nextAbsPR,
      };
    });
    setStudents(updated);
    return updated;
  };

  // Trusted Server Save Draft
  const saveMarksInternal = async (
    currentStudents: any[],
    forceOverwrite = false,
    overrideReason?: string
  ): Promise<boolean> => {
    if (!selectedAcademicYear || !selectedClass || !examType) {
      setAutoSaveStatus('error');
      setAutoSaveError('Select Academic Year, Examination, and Class first.');
      return false;
    }

    if (forceOverwrite) {
      const reasonCheck = (overrideReason ?? forceOverwriteReason).trim();
      if (!forceOverwriteChecked || reasonCheck.length < 5) {
        setAutoSaveError('Force Overwrite requires checking confirmation and entering an audit reason (min 5 chars).');
        return false;
      }
    }

    const canonicalYear = selectedAcademicYear;
    const examId = buildCanonicalExamId(examType, selectedClass, selectedSection || 'A', canonicalYear);
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      setAutoSaveStatus('error');
      setAutoSaveError('Authentication required. Please sign in again.');
      return false;
    }

    setAutoSaveStatus('saving');
    setAutoSaveError(null);
    let allSucceeded = true;

    for (const subj of selectedSubjects) {
      const normKey = subj.replace(/\s+/g, '');
      const lowerKey = subj.replace(/[^a-zA-Z0-9_.-]/g, '').toLowerCase();
      const cnf = subjectConfigs[subj] || {
        hasTh: true,
        thFullMarks: 75,
        thPassMarks: 27,
        hasPr: true,
        prFullMarks: 25,
        prPassMarks: 9,
      };

      const studentsToSave = currentStudents.filter((std) => {
        const thVal = String(std.subjectMarksTH?.[subj] ?? '').trim();
        const prVal = String(std.subjectMarksPR?.[subj] ?? '').trim();
        const absTh = Boolean(std.subjectAbsentsTH?.[subj]);
        const absPr = Boolean(std.subjectAbsentsPR?.[subj]);
        return thVal !== '' || prVal !== '' || absTh || absPr;
      });

      if (studentsToSave.length === 0) continue;

      try {
        const operationId = crypto.randomUUID();
        const subjVers = subjectVersions[subj] || subjectVersions[normKey] || subjectVersions[lowerKey] || {};
        const studentsWithVersion = studentsToSave.map((std) => {
          const sUid = std.studentUid || std.uid || std.studentId;
          const expectedVersion =
            conflictModalData && conflictModalData.subject === subj
              ? conflictModalData.conflicts.find((c: any) => c.studentUid === sUid)?.serverVersion ?? 1
              : subjVers[sUid] ?? 0;
          return {
            ...std,
            expectedVersion,
          };
        });

        const reasonToSend = forceOverwrite
          ? (overrideReason ?? forceOverwriteReason).trim()
          : (correctionReasonRef.current || '').trim().length >= 5
          ? correctionReasonRef.current.trim()
          : userRole === 'admin'
          ? 'Standalone administrative mark entry'
          : 'Standalone class teacher mark entry';

        const res = await fetch('/api/results/save-marks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            operationId,
            examId,
            examType,
            workflowMode: 'STANDALONE',
            selectedClass,
            selectedSection: selectedSection || 'A',
            selectedAcademicYear: canonicalYear,
            subjectToSave: subj,
            subjectKey: normKey,
            subjectConfig: cnf,
            totalEligibleCount: currentStudents.length,
            correctionReason: reasonToSend,
            students: studentsWithVersion,
            forceOverwrite,
            forceOverwriteConfirmed: forceOverwrite ? true : false,
          }),
        });

        const resData = await res.json().catch(() => ({}));

        if (res.status === 409 && resData.code === 'WORKFLOW_MODE_CONFLICT') {
          setAutoSaveStatus('error');
          setAutoSaveError(resData.error);
          setExamWorkflowMode('CONNECTED');
          return false;
        }

        if (res.status === 409 && !forceOverwrite) {
          setConflictModalData({
            subject: subj,
            conflicts: resData.conflicts || [],
          });
          setForceOverwriteChecked(false);
          setForceOverwriteReason('');
          setAutoSaveStatus('error');
          setAutoSaveError(`Version conflict detected for ${subj}. Review or confirm Force Overwrite with reason.`);
          return false;
        }

        if (!res.ok || !resData.success) {
          setAutoSaveStatus('error');
          setAutoSaveError(resData.error || `Failed to save marks for ${subj}.`);
          return false;
        }

        // Sync authoritative versions from server response
        const newVerMap = {
          ...(subjectVersions[subj] || subjectVersions[normKey] || subjectVersions[lowerKey] || {}),
          ...(resData.updatedVersions || {}),
        };
        studentsToSave.forEach((std) => {
          const sUid = std.studentUid || std.uid || std.studentId;
          initialSavedMarksRef.current[`${sUid}_${subj}`] = {
            th: std.subjectMarksTH?.[subj] ?? '',
            pr: std.subjectMarksPR?.[subj] ?? '',
            absTh: Boolean(std.subjectAbsentsTH?.[subj]),
            absPr: Boolean(std.subjectAbsentsPR?.[subj]),
          };
        });
        setSubjectVersions((prev) => ({
          ...prev,
          [subj]: newVerMap,
          [normKey]: newVerMap,
          [lowerKey]: newVerMap,
        }));
        if (resData.subjectWorkflowStatus) {
          setSubjectStatuses((prev) => ({ ...prev, [subj]: resData.subjectWorkflowStatus }));
        }
        setExamWorkflowMode('STANDALONE');
      } catch (e: any) {
        allSucceeded = false;
        setAutoSaveStatus('error');
        setAutoSaveError(e.message || 'Network error while saving marks.');
        return false;
      }
    }

    if (allSucceeded) {
      setConflictModalData(null);
      setForceOverwriteChecked(false);
      setForceOverwriteReason('');
      setAutoSaveError(null);
      setAutoSaveStatus('saved');
      setStatus?.({ type: 'success', message: `Draft marks saved securely for Class ${selectedClass} (${examType}).` });
    }
    return allSucceeded;
  };

  const handleSaveDraftClick = async () => {
    const emptyCells = collectEmptyCells(students);
    if (emptyCells.length > 0) {
      setEmptyModalState({ isOpen: true, mode: 'DRAFT', emptyCells });
      return;
    }
    await saveMarksInternal(students);
  };

  // Explicit Submit for Review (saves first, then calls POST /api/results/submit-subject)
  const submitAllSubjectsInternal = async (studentList: any[]) => {
    setActionLoading('SUBMIT');
    try {
      const savedOk = await saveMarksInternal(studentList);
      if (!savedOk) return;

      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Authentication required.');
      const examId = buildCanonicalExamId(examType, selectedClass, selectedSection || 'A', selectedAcademicYear);

      const eligibleUids = studentList.map((s) => s.studentUid || s.uid || s.studentId).filter(Boolean);
      let latestExamStatus = examStatus;
      for (const subj of selectedSubjects) {
        const res = await fetch('/api/results/submit-subject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({
            examId,
            subject: subj,
            subjectKey: subj.replace(/\s+/g, ''),
            selectedClass,
            selectedSection: selectedSection || 'A',
            selectedAcademicYear,
            eligibleStudentUids: eligibleUids,
            expectedSubjects: selectedSubjects,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          throw new Error(json.error || `Failed to submit ${subj}`);
        }
        if (json.subjectStatus) {
          setSubjectStatuses((prev) => ({ ...prev, [subj]: json.subjectStatus }));
        }
        if (json.examStatus) {
          latestExamStatus = json.examStatus;
        }
      }
      setExamStatus(latestExamStatus);
      setStatus?.({
        type: 'success',
        message: 'All subjects explicitly submitted for Administrator Review.',
      });
    } catch (err: any) {
      setAutoSaveError(err.message);
      setStatus?.({ type: 'error', message: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSubmitForReviewClick = async () => {
    const emptyCells = collectEmptyCells(students);
    if (emptyCells.length > 0) {
      setEmptyModalState({ isOpen: true, mode: 'SUBMIT', emptyCells });
      return;
    }
    await submitAllSubjectsInternal(students);
  };

  // Admin-only Approve Exam
  const handleApproveExam = async () => {
    if (userRole !== 'admin') return;
    setActionLoading('APPROVE');
    setAutoSaveError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Authentication required.');
      const examId = buildCanonicalExamId(examType, selectedClass, selectedSection || 'A', selectedAcademicYear);
      const res = await fetch('/api/results/approve-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ examId, expectedSubjects: selectedSubjects }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to approve examination.');
      }
      setExamStatus('APPROVED');
      setStatus?.({
        type: 'success',
        message: 'Examination APPROVED. Ready for separate Publication.',
      });
    } catch (err: any) {
      setAutoSaveError(err.message);
      setStatus?.({ type: 'error', message: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  // Admin-only Publish Results (server recalculates Nepal CDC grades/GPA authoritatively — no client rank!)
  const handlePublishResults = async () => {
    if (userRole !== 'admin') {
      setStatus?.({ type: 'error', message: 'Publication is restricted to Administrators only.' });
      return;
    }
    setActionLoading('PUBLISH');
    setAutoSaveError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Authentication required.');
      const examId = buildCanonicalExamId(examType, selectedClass, selectedSection || 'A', selectedAcademicYear);
      const summaryRecords = students.map((std) => ({
        studentUid: std.studentUid || std.uid || std.studentId,
        studentId: std.permanentStudentId || std.studentId,
        permanentStudentId: std.permanentStudentId || std.studentId,
        studentEmis: std.studentEmis || '',
        studentName: std.studentName || '',
        rollNo: std.rollNo || std.rollNumberSnapshot || '',
        rollNumberSnapshot: std.rollNo || std.rollNumberSnapshot || '',
      }));
      const res = await fetch('/api/results/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          examId,
          targetClass: selectedClass,
          targetSection: selectedSection || 'A',
          targetAcademicYear: selectedAcademicYear,
          summaryRecords,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Server error while publishing results.');
      }
      setExamStatus('PUBLISHED');
      setPublishSuccessMessage(
        `Results published for Class ${selectedClass} (${selectedSection}) — ${json.publishedCount || students.length} students.`
      );
      setStatus?.({
        type: 'success',
        message: `Class ${selectedClass} - ${examType} published successfully!`,
      });
    } catch (err: any) {
      setAutoSaveError(err.message);
      setStatus?.({ type: 'error', message: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  // Admin-only Unpublish / Reopen with mandatory audit reason
  const handleUnpublishExam = async () => {
    if (userRole !== 'admin') return;
    if (unpublishReason.trim().length < 10) {
      setAutoSaveError('Please enter an audit reason of at least 10 characters to unpublish.');
      return;
    }
    setActionLoading('UNPUBLISH');
    setAutoSaveError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Authentication required.');
      const examId = buildCanonicalExamId(examType, selectedClass, selectedSection || 'A', selectedAcademicYear);
      const res = await fetch('/api/results/unpublish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ examId, reason: unpublishReason.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to unpublish examination.');
      }
      setExamStatus('DRAFT');
      setUnpublishModalOpen(false);
      setUnpublishReason('');
      setPublishSuccessMessage(null);
      setStatus?.({
        type: 'success',
        message: 'Examination unpublished and reopened for corrections. Audit log recorded.',
      });
    } catch (err: any) {
      setAutoSaveError(err.message);
      setStatus?.({ type: 'error', message: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const saveMarksLatestRef = useRef(saveMarksInternal);
  useEffect(() => {
    saveMarksLatestRef.current = saveMarksInternal;
  });
  const studentsLatestRef = useRef(students);
  useEffect(() => {
    studentsLatestRef.current = students;
  }, [students]);

  const contextSummaryText = useMemo(() => {
    const parts: string[] = [];
    if (selectedClass) parts.push(`Class ${selectedClass} (Sec ${selectedSection || 'A'})`);
    if (examType) parts.push(examType);
    if (selectedAcademicYear) parts.push(formatAcademicYearDisplayTitle(selectedAcademicYear, managedYears));
    return parts.join(' • ');
  }, [selectedClass, selectedSection, examType, selectedAcademicYear, managedYears]);

  // Report live active/dirty state up to Admin navigation guard
  useEffect(() => {
    if (!onWorkflowGuardChange) return;
    const hasUnsaved = autoSaveStatus === 'unsaved';
    const isActiveSheet = Boolean(selectedClass && examType) || hasUnsaved;
    onWorkflowGuardChange({
      isActive: true,
      isDirty: hasUnsaved,
      workflowName: 'Standalone Direct Manual Entry',
      contextSummary: contextSummaryText || 'Direct Marks Entry Workspace',
      canSaveDraft: hasUnsaved && !isSheetReadOnly && students.length > 0 && isActiveSheet,
      saveDraft: async () => saveMarksLatestRef.current(studentsLatestRef.current),
    });
  }, [
    onWorkflowGuardChange,
    autoSaveStatus,
    selectedClass,
    examType,
    contextSummaryText,
    isSheetReadOnly,
    students.length,
  ]);

  useEffect(() => {
    return () => {
      onWorkflowGuardChange?.(null);
    };
  }, [onWorkflowGuardChange]);

  const runWithUnsavedGuard = (targetDestination: string, action: () => void, alwaysConfirmWhenSheetOpen = false) => {
    const hasUnsaved = autoSaveStatus === 'unsaved';
    const hasOpenTask = Boolean(selectedClass && examType && students.length > 0);
    if (hasUnsaved || (alwaysConfirmWhenSheetOpen && hasOpenTask)) {
      setPendingLocalExit({ targetDestination, execute: action });
    } else {
      action();
    }
  };

  const statusBadgeColor =
    examStatus === 'PUBLISHED'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
      : examStatus === 'APPROVED'
      ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
      : examStatus === 'READY_FOR_REVIEW'
      ? 'bg-amber-100 text-amber-800 border-amber-300'
      : 'bg-slate-100 text-slate-700 border-slate-300';

  return (
    <div className="space-y-5">
      {/* Clean Single Standalone Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Standalone Direct Manual Entry
              </span>
              <span className={`px-2 py-0.5 rounded border text-[11px] font-bold ${statusBadgeColor}`}>
                {examStatus.replace(/_/g, ' ')}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              Academic Session:{' '}
              <span className={isFutureOrInactiveYear ? 'text-amber-700' : 'text-emerald-700'}>
                {selectedAcademicYear
                  ? formatAcademicYearDisplayTitle(selectedAcademicYear, managedYears)
                  : 'Select Session'}
              </span>
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {autoSaveStatus === 'saving' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving...
            </span>
          )}
          {autoSaveStatus === 'saved' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved to Server
            </span>
          )}
          {autoSaveStatus === 'unsaved' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              <Clock className="w-3.5 h-3.5" /> Unsaved Changes
            </span>
          )}

          {(onBackToPrep || onExit) && (
            <button
              type="button"
              onClick={() => {
                const navFn = onBackToPrep || onExit;
                runWithUnsavedGuard('Result Workflows', () => navFn?.(), true);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs inline-flex items-center gap-1.5 border border-slate-300 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Workflows
            </button>
          )}
        </div>
      </div>

      {/* Cross-Mode Isolation Warning */}
      {isCrossModeBlocked && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-rose-950">Connected Examination Detected (Workflow Isolation Active)</p>
            <p className="mt-0.5">
              This examination is managed under <strong>Connected Examination Management</strong>. Please open it from the Connected workflow to prevent cross-mode conflicts.
            </p>
          </div>
        </div>
      )}

      {/* Published Lock Notice */}
      {isLockedPublished && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs">
            <Lock className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Published &amp; Locked</p>
              <p className="text-emerald-800">
                Marks are immutable after publication.{' '}
                {userRole === 'admin'
                  ? 'As Admin, you may Unpublish with a mandatory audit reason to reopen corrections.'
                  : 'Contact an Administrator if a correction is needed.'}
              </p>
            </div>
          </div>
          {userRole === 'admin' && (
            <button
              type="button"
              onClick={() => setUnpublishModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-white text-rose-700 border border-rose-300 hover:bg-rose-50 shrink-0"
            >
              <Unlock className="w-3.5 h-3.5" /> Unpublish / Reopen
            </button>
          )}
        </div>
      )}

      {/* Concurrency Conflict Banner with Mandatory Policy #4 Force Overwrite Confirmation */}
      {conflictModalData && (
        <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold">Version Conflict Detected for {conflictModalData.subject}</p>
              <p className="text-amber-900 mt-0.5">
                {conflictModalData.conflicts.length} student record(s) were updated by another session. Your entered marks are safely preserved below.
              </p>
            </div>
          </div>

          <div className="space-y-2 bg-white/80 p-3 rounded-lg border border-amber-200">
            <label className="flex items-center gap-2 text-xs font-semibold text-amber-950 cursor-pointer">
              <input
                type="checkbox"
                checked={forceOverwriteChecked}
                onChange={(e) => setForceOverwriteChecked(e.target.checked)}
                className="w-4 h-4 accent-amber-600"
              />
              I confirm I want to overwrite newer server marks for this unpublished examination (logged in Audit Trail).
            </label>
            <input
              type="text"
              value={forceOverwriteReason}
              onChange={(e) => setForceOverwriteReason(e.target.value)}
              placeholder="Mandatory audit reason for Force Overwrite (min 5 characters)..."
              className="w-full px-3 py-1.5 text-xs border border-amber-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setConflictModalData(null);
                loadRosterAndMarks();
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-amber-300 text-amber-900 hover:bg-amber-100"
            >
              Reload Server Marks
            </button>
            <button
              type="button"
              disabled={!forceOverwriteChecked || forceOverwriteReason.trim().length < 5}
              onClick={() => saveMarksInternal(students, true, forceOverwriteReason)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:bg-slate-300 disabled:text-slate-500"
            >
              Confirm Force Overwrite
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {autoSaveError && !conflictModalData && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">{autoSaveError}</p>
              <p className="text-rose-700 mt-0.5">Your entered marks remain preserved in the form.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveDraftClick}
            className="px-3 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Archived Session Read-Only Notice */}
      {isArchivedYear && !isFutureOrInactiveYear && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs">
            <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Archived Academic Year ({formatAcademicYearDisplayTitle(selectedAcademicYear, managedYears)}) — Read-Only</p>
              <p className="text-amber-800 mt-0.5">
                Historical archived sessions cannot be modified. The current active academic year is <strong>{currentAcademicYearTitle}</strong>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedAcademicYear(defaultAcademicYear)}
            className="px-3.5 py-2 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shrink-0 transition-colors"
          >
            Switch to Current Year ({currentAcademicYearTitle})
          </button>
        </div>
      )}

      {/* Selector Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Category</label>
          <div className="flex gap-3 items-center h-[38px]">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold">
              <input
                type="radio"
                checked={examCategory === 'Terminal'}
                onChange={() => {
                  runWithUnsavedGuard('Terminal Examination', () => {
                    setExamCategory('Terminal');
                    setExamType('');
                    setAutoSaveStatus('idle');
                  });
                }}
              />
              Terminal
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold">
              <input
                type="radio"
                checked={examCategory === 'Test'}
                onChange={() => {
                  runWithUnsavedGuard('Test Examination', () => {
                    setExamCategory('Test');
                    setExamType('');
                    setAutoSaveStatus('idle');
                  });
                }}
              />
              Test
            </label>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Academic Year</label>
          <select
            value={selectedAcademicYear}
            onChange={(e) => {
              const nextYr = e.target.value;
              runWithUnsavedGuard(`Academic Session ${nextYr} BS`, () => {
                setSelectedAcademicYear(nextYr);
                setAutoSaveStatus('idle');
              });
            }}
            className={`w-full px-3 py-2 border rounded-lg bg-white text-xs font-semibold h-[38px] ${
              isFutureOrInactiveYear ? 'border-amber-400 bg-amber-50/40 text-amber-900' : 'border-slate-300'
            }`}
          >
            {availableAcademicYears.map((y: any) => {
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
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Examination</label>
          {examCategory === 'Terminal' ? (
            <select
              value={examType}
              onChange={(e) => {
                const nextExam = e.target.value;
                runWithUnsavedGuard(nextExam || 'another examination', () => {
                  setExamType(nextExam);
                  setAutoSaveStatus('idle');
                });
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs font-semibold h-[38px]"
            >
              <option value="">-- Select Terminal --</option>
              {EXAM_TYPES.map((ex: string) => (
                <option key={ex} value={ex}>
                  {ex}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={examType}
              onChange={(e) => setExamType(e.target.value)}
              placeholder="e.g. Unit Test 1"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs font-semibold h-[38px]"
            />
          )}
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Class (PG–10)</label>
          {isTeacher && teacherClass ? (
            <div className="w-full px-3 py-2 border border-emerald-200 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold h-[38px] flex items-center">
              Class {teacherClass}
            </div>
          ) : (
            <select
              value={selectedClass}
              onChange={(e) => {
                const nextCls = e.target.value;
                runWithUnsavedGuard(nextCls ? `Class ${nextCls}` : 'another class', () => {
                  setSelectedClass(nextCls);
                  setAutoSaveStatus('idle');
                });
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs font-semibold h-[38px]"
            >
              <option value="">-- Select Class --</option>
              {allowedClasses.map((c: string) => (
                <option key={c} value={c}>
                  Class {c}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Section</label>
          <select
            value={selectedSection}
            onChange={(e) => {
              const nextSec = e.target.value;
              runWithUnsavedGuard(`Section ${nextSec}`, () => {
                setSelectedSection(nextSec);
                setAutoSaveStatus('idle');
              });
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs font-semibold h-[38px]"
          >
            <option value="A">Section A</option>
            <option value="B">Section B</option>
            <option value="C">Section C</option>
          </select>
        </div>
      </div>

      {/* Main Sheet Area */}
      {isFutureOrInactiveYear ? (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-8 text-center space-y-3">
          <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 border border-amber-200 flex items-center justify-center mx-auto">
            <Calendar className="w-5 h-5" />
          </div>
          <div className="space-y-1 max-w-lg mx-auto">
            <h3 className="text-base font-bold text-amber-950">
              Current Academic Year is {currentAcademicYearTitle}
            </h3>
            <p className="text-xs text-amber-900 leading-relaxed">
              You selected <strong>{formatAcademicYearDisplayTitle(selectedAcademicYear, managedYears)}</strong>, which is an upcoming/inactive session with no enrolled students yet. Active students are currently enrolled in <strong>{currentAcademicYearTitle}</strong>. Please select the current academic year to enter or manage examination marks.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedAcademicYear(defaultAcademicYear);
              setAutoSaveStatus('idle');
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors"
          >
            <Calendar className="w-4 h-4" />
            Switch to Current Year ({currentAcademicYearTitle})
          </button>
        </div>
      ) : !(selectedClass && examType) ? (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-10 text-center">
          <h3 className="text-base font-bold text-slate-800">Select Examination &amp; Class to Begin</h3>
          <p className="text-xs text-slate-500 mt-1">
            Base curriculum subjects (PG–Grade 10) and active approved custom subjects load automatically with Nepal CDC 35% standards.
          </p>
        </div>
      ) : loadingStudents ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          <p className="text-xs font-semibold text-slate-600">Loading eligible student roster and saved marks...</p>
        </div>
      ) : students.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center space-y-3">
          <p className="text-sm font-bold text-amber-900">
            No active students enrolled in Class {selectedClass} (Section {selectedSection}) for{' '}
            {formatAcademicYearDisplayTitle(selectedAcademicYear, managedYears)}.
          </p>
          <p className="text-xs text-amber-800">
            {String(selectedAcademicYear) !== String(defaultAcademicYear)
              ? `Currently active students are enrolled in ${currentAcademicYearTitle}. Switch to the current academic year to manage active results.`
              : 'Enroll students under Student Management before entering examination marks.'}
          </p>
          {String(selectedAcademicYear) !== String(defaultAcademicYear) && (
            <button
              type="button"
              onClick={() => {
                setSelectedAcademicYear(defaultAcademicYear);
                setAutoSaveStatus('idle');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors"
            >
              Switch to Current Year ({currentAcademicYearTitle})
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Correction Reason Bar when editing previously saved marks */}
          {!isSheetReadOnly && hasModificationsToExistingMarks(students) && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-amber-950">
                  Audit Correction Note (recorded when modifying saved marks):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {['Re-evaluated answer script', 'Practical score update', 'Entry typo fix'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCorrectionReason(preset)}
                      className="text-[11px] px-2 py-0.5 rounded bg-white border border-amber-300 text-amber-900 hover:bg-amber-100"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="Reason for updating previously saved marks..."
                className="w-full px-3 py-1.5 border border-amber-300 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}

          {/* Desktop Spreadsheet Table */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>
                <strong>{students.length}</strong> Eligible Students &bull;{' '}
                <strong>{selectedSubjects.length}</strong> Subjects (Nepal CDC 35% Independent Component Pass)
              </span>
              <span className="text-[11px] text-slate-500">
                Use Arrow keys or Enter to navigate &bull; Empty = Missing (not 0)
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-3 font-bold uppercase w-20 sticky left-0 bg-slate-100 z-10">Roll</th>
                    <th className="p-3 font-bold uppercase min-w-[160px] sticky left-20 bg-slate-100 z-10 border-r border-slate-200">
                      Student Name
                    </th>
                    {selectedSubjects.map((subj) => {
                      const cnf = subjectConfigs[subj] || {
                        hasTh: true,
                        thFullMarks: 75,
                        thPassMarks: 27,
                        hasPr: true,
                        prFullMarks: 25,
                        prPassMarks: 9,
                      };
                      const subjStatus = subjectStatuses[subj];
                      return (
                        <th key={subj} className="p-2.5 text-center border-l border-slate-200 min-w-[140px]">
                          <div className="font-bold text-slate-900">{subj}</div>
                          <div className="text-[10px] font-medium text-slate-500 mt-0.5">
                            {cnf.hasTh ? `TH ${cnf.thFullMarks}/${cnf.thPassMarks}` : ''}
                            {cnf.hasTh && cnf.hasPr ? ' • ' : ''}
                            {cnf.hasPr ? `PR ${cnf.prFullMarks}/${cnf.prPassMarks}` : ''}
                          </div>
                          {subjStatus && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[9px] font-bold">
                              {subjStatus.replace(/_/g, ' ')}
                            </span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((std, rIdx) => {
                    let runningColIdx = 0;
                    return (
                      <tr key={std.studentUid || std.studentId || rIdx} className="hover:bg-slate-50/70">
                        <td className="p-2.5 font-mono font-semibold text-slate-600 sticky left-0 bg-white">
                          {std.rollNo || std.schoolId || '-'}
                        </td>
                        <td className="p-2.5 font-semibold text-slate-900 sticky left-20 bg-white border-r border-slate-200">
                          {std.studentName}
                        </td>
                        {selectedSubjects.map((subj) => {
                          const cnf = subjectConfigs[subj] || {
                            hasTh: true,
                            thFullMarks: 75,
                            thPassMarks: 27,
                            hasPr: true,
                            prFullMarks: 25,
                            prPassMarks: 9,
                          };
                          const thCol = cnf.hasTh ? runningColIdx++ : -1;
                          const prCol = cnf.hasPr ? runningColIdx++ : -1;

                          const rawTh = std.subjectAbsentsTH?.[subj] ? 'AB' : std.subjectMarksTH?.[subj] ?? '';
                          const rawPr = cnf.hasPr
                            ? std.subjectAbsentsPR?.[subj]
                              ? 'AB'
                              : std.subjectMarksPR?.[subj] ?? ''
                            : null;
                          const preview = calculateSubjectResult(
                            subj.replace(/\s+/g, ''),
                            subj,
                            {
                              theoryMarks: rawTh === '' ? null : rawTh === 'AB' ? 'AB' : Number(rawTh),
                              practicalMarks: !cnf.hasPr ? null : rawPr === '' || rawPr === null ? null : rawPr === 'AB' ? 'AB' : Number(rawPr),
                              isAbsentTheory: Boolean(std.subjectAbsentsTH?.[subj]),
                              isAbsentPractical: Boolean(std.subjectAbsentsPR?.[subj]),
                            },
                            {
                              hasTh: cnf.hasTh,
                              thFullMarks: cnf.thFullMarks,
                              thPassMarks: cnf.thPassMarks,
                              hasPr: cnf.hasPr,
                              prFullMarks: cnf.prFullMarks,
                              prPassMarks: cnf.prPassMarks,
                            }
                          );

                          return (
                            <td key={subj} className="p-2 border-l border-slate-100 text-center">
                              <div className="flex items-start justify-center gap-1.5">
                                {cnf.hasTh && (
                                  <div className="flex flex-col items-center">
                                    <input
                                      ref={(el) => {
                                        cellRefs.current[`${rIdx}_${thCol}`] = el;
                                      }}
                                      type="text"
                                      inputMode="decimal"
                                      value={std.subjectAbsentsTH?.[subj] ? 'AB' : std.subjectMarksTH?.[subj] ?? ''}
                                      onChange={(e) => handleMarkChange(rIdx, e.target.value, 'TH', subj)}
                                      onKeyDown={(e) => handleCellKeyDown(e, rIdx, thCol)}
                                      disabled={isSheetReadOnly || std.subjectAbsentsTH?.[subj]}
                                      placeholder="TH"
                                      className="w-12 text-center py-1 border border-slate-300 rounded font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100 disabled:text-rose-700"
                                    />
                                    <label className="text-[10px] mt-0.5 text-slate-500 flex items-center gap-0.5 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(std.subjectAbsentsTH?.[subj])}
                                        disabled={isSheetReadOnly}
                                        onChange={(e) => handleAbsentChange(rIdx, 'TH', e.target.checked, subj)}
                                        className="w-3 h-3 accent-rose-600"
                                      />
                                      AB
                                    </label>
                                  </div>
                                )}
                                {cnf.hasPr && (
                                  <div className="flex flex-col items-center">
                                    <input
                                      ref={(el) => {
                                        cellRefs.current[`${rIdx}_${prCol}`] = el;
                                      }}
                                      type="text"
                                      inputMode="decimal"
                                      value={std.subjectAbsentsPR?.[subj] ? 'AB' : std.subjectMarksPR?.[subj] ?? ''}
                                      onChange={(e) => handleMarkChange(rIdx, e.target.value, 'PR', subj)}
                                      onKeyDown={(e) => handleCellKeyDown(e, rIdx, prCol)}
                                      disabled={isSheetReadOnly || std.subjectAbsentsPR?.[subj]}
                                      placeholder="PR"
                                      className="w-12 text-center py-1 border border-slate-300 rounded font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100 disabled:text-rose-700"
                                    />
                                    <label className="text-[10px] mt-0.5 text-slate-500 flex items-center gap-0.5 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(std.subjectAbsentsPR?.[subj])}
                                        disabled={isSheetReadOnly}
                                        onChange={(e) => handleAbsentChange(rIdx, 'PR', e.target.checked, subj)}
                                        className="w-3 h-3 accent-rose-600"
                                      />
                                      AB
                                    </label>
                                  </div>
                                )}
                              </div>
                              <div className="mt-1 text-[10px] font-bold">
                                {preview.isIncomplete ? (
                                  <span className="text-slate-400">Missing</span>
                                ) : preview.isNg ? (
                                  <span className="text-rose-600">NG</span>
                                ) : (
                                  <span className="text-emerald-700">
                                    {preview.subjectGrade} ({preview.totalObtainedMarks})
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Touch Card View */}
          <div className="md:hidden space-y-3">
            {students.map((std, rIdx) => (
              <div key={std.studentUid || std.studentId || rIdx} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{std.studentName}</p>
                    <p className="text-xs text-slate-500 font-mono">Roll: {std.rollNo || std.schoolId || '-'}</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {selectedSubjects.map((subj) => {
                    const cnf = subjectConfigs[subj] || {
                      hasTh: true,
                      thFullMarks: 75,
                      thPassMarks: 27,
                      hasPr: true,
                      prFullMarks: 25,
                      prPassMarks: 9,
                    };
                    return (
                      <div key={subj} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <p className="text-xs font-bold text-slate-800 mb-2">{subj}</p>
                        <div className="grid grid-cols-2 gap-2.5">
                          {cnf.hasTh && (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={std.subjectAbsentsTH?.[subj] ? 'AB' : std.subjectMarksTH?.[subj] ?? ''}
                                onChange={(e) => handleMarkChange(rIdx, e.target.value, 'TH', subj)}
                                disabled={isSheetReadOnly || std.subjectAbsentsTH?.[subj]}
                                placeholder={`TH (${cnf.thFullMarks})`}
                                className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs font-bold text-center bg-white disabled:bg-slate-100"
                              />
                              <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1 shrink-0">
                                <input
                                  type="checkbox"
                                  checked={Boolean(std.subjectAbsentsTH?.[subj])}
                                  disabled={isSheetReadOnly}
                                  onChange={(e) => handleAbsentChange(rIdx, 'TH', e.target.checked, subj)}
                                  className="w-3.5 h-3.5 accent-rose-600"
                                />
                                AB
                              </label>
                            </div>
                          )}
                          {cnf.hasPr && (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={std.subjectAbsentsPR?.[subj] ? 'AB' : std.subjectMarksPR?.[subj] ?? ''}
                                onChange={(e) => handleMarkChange(rIdx, e.target.value, 'PR', subj)}
                                disabled={isSheetReadOnly || std.subjectAbsentsPR?.[subj]}
                                placeholder={`PR (${cnf.prFullMarks})`}
                                className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs font-bold text-center bg-white disabled:bg-slate-100"
                              />
                              <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1 shrink-0">
                                <input
                                  type="checkbox"
                                  checked={Boolean(std.subjectAbsentsPR?.[subj])}
                                  disabled={isSheetReadOnly}
                                  onChange={(e) => handleAbsentChange(rIdx, 'PR', e.target.checked, subj)}
                                  className="w-3.5 h-3.5 accent-rose-600"
                                />
                                AB
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Workflow Action Footer (Explicit Separate Steps: Save Draft -> Submit -> Approve -> Publish) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              Workflow: <strong>Save Draft</strong> &rarr; <strong>Submit for Review</strong> &rarr;{' '}
              <strong>Admin Approve</strong> &rarr; <strong>Admin Publish</strong>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5">
              {!isSheetReadOnly && (
                <>
                  <button
                    type="button"
                    disabled={actionLoading !== null}
                    onClick={handleSaveDraftClick}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" /> Save Draft
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading !== null}
                    onClick={handleSubmitForReviewClick}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    {actionLoading === 'SUBMIT' ? 'Submitting...' : 'Submit for Review'}
                  </button>
                </>
              )}

              {userRole === 'admin' && !isSheetReadOnly && examStatus === 'READY_FOR_REVIEW' && (
                <button
                  type="button"
                  disabled={actionLoading !== null}
                  onClick={handleApproveExam}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {actionLoading === 'APPROVE' ? 'Approving...' : 'Approve Examination'}
                </button>
              )}

              {userRole === 'admin' && !isSheetReadOnly && examStatus === 'APPROVED' && (
                <button
                  type="button"
                  disabled={actionLoading !== null}
                  onClick={handlePublishResults}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {actionLoading === 'PUBLISH' ? 'Publishing...' : 'Publish Official Results'}
                </button>
              )}
            </div>
          </div>

          {publishSuccessMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{publishSuccessMessage}</span>
            </div>
          )}
        </>
      )}

      {/* Empty Cell Validation Modal */}
      <EmptyCellsModal
        isOpen={emptyModalState.isOpen}
        mode={emptyModalState.mode}
        emptyCells={emptyModalState.emptyCells}
        onClose={() => setEmptyModalState((prev) => ({ ...prev, isOpen: false }))}
        onMarkAllAbsent={async () => {
          const updated = applyEmptyCellResolution('AB');
          const mode = emptyModalState.mode;
          setEmptyModalState((prev) => ({ ...prev, isOpen: false }));
          if (mode === 'SUBMIT') {
            await submitAllSubjectsInternal(updated);
          } else {
            await saveMarksInternal(updated);
          }
        }}
        onFillAllZero={async () => {
          const updated = applyEmptyCellResolution('ZERO');
          const mode = emptyModalState.mode;
          setEmptyModalState((prev) => ({ ...prev, isOpen: false }));
          if (mode === 'SUBMIT') {
            await submitAllSubjectsInternal(updated);
          } else {
            await saveMarksInternal(updated);
          }
        }}
        onKeepEmptyAndSaveDraft={async () => {
          setEmptyModalState((prev) => ({ ...prev, isOpen: false }));
          await saveMarksInternal(students);
        }}
      />

      {/* Admin Unpublish / Reopen Modal */}
      {unpublishModalOpen && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Unpublish &amp; Reopen Examination</h3>
            <p className="text-xs text-slate-600">
              This will hide published results from student portals and reopen the examination as DRAFT. An official audit entry is mandatory.
            </p>
            <textarea
              rows={3}
              value={unpublishReason}
              onChange={(e) => setUnpublishReason(e.target.value)}
              placeholder="Enter mandatory audit reason (min 10 characters)..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-rose-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUnpublishModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={unpublishReason.trim().length < 10 || actionLoading === 'UNPUBLISH'}
                onClick={handleUnpublishExam}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 disabled:bg-slate-300"
              >
                {actionLoading === 'UNPUBLISH' ? 'Unpublishing...' : 'Confirm Unpublish'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Workflow Exit / Unsaved Changes Confirmation Modal */}
      <WorkflowExitConfirmModal
        isOpen={Boolean(pendingLocalExit)}
        workflowName="Standalone Direct Manual Entry"
        contextSummary={contextSummaryText || undefined}
        targetDestination={pendingLocalExit?.targetDestination}
        hasUnsavedChanges={autoSaveStatus === 'unsaved'}
        canSaveDraft={autoSaveStatus === 'unsaved' && !isSheetReadOnly && students.length > 0}
        isSavingDraft={isSavingBeforeExit}
        onStay={() => setPendingLocalExit(null)}
        onSaveAndLeave={async () => {
          const pending = pendingLocalExit;
          if (!pending) return;
          setIsSavingBeforeExit(true);
          try {
            const ok = await saveMarksInternal(students);
            if (ok) {
              setPendingLocalExit(null);
              pending.execute();
            }
          } finally {
            setIsSavingBeforeExit(false);
          }
        }}
        onConfirmExit={() => {
          const pending = pendingLocalExit;
          setPendingLocalExit(null);
          setAutoSaveStatus('idle');
          pending?.execute();
        }}
      />
    </div>
  );
}
