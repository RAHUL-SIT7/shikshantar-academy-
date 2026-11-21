import React, { useState, useEffect, useMemo } from 'react';
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
  X, 
  BookOpen, 
  GraduationCap, 
  Lock, 
  Mail, 
  Bell, 
  Search,
  MessageSquare,
  Users
} from 'lucide-react';
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
  SubjectConfigItem, 
  StudentMarkEntry, 
  SubjectTeacherResolution,
  ExamPreparationStatus,
  SubjectPreparationStatus
} from '../../lib/resultPreparationEngine';
import { getNepalGPA, getGrade } from './ManualEntryTab';

interface ResultPreparationTabProps {
  EXAM_TYPES: string[];
  allClasses: string[];
  data: any[];
  setStatus: (status: { type: 'success' | 'error' | 'info'; message: string } | null) => void;
  userRole: 'admin' | 'teacher' | 'student';
  assignedClasses?: string[];
  assignedSubjects?: string[];
  teacherProfile?: any;
}

const DEFAULT_ACADEMIC_YEARS = ['2083–2084 B.S.', '2082–2083 B.S.', '2081–2082 B.S.'];
const DEFAULT_SECTIONS = ['A', 'B', 'C'];

export function ResultPreparationTab({
  EXAM_TYPES,
  allClasses,
  data,
  setStatus,
  userRole,
  assignedClasses,
  assignedSubjects,
  teacherProfile
}: ResultPreparationTabProps) {
  // 1. Selector States
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('2083–2084 B.S.');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('A');
  const [selectedExam, setSelectedExam] = useState('');

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

  // 3. Mark Entry Modal State
  const [activeEntrySubject, setActiveEntrySubject] = useState<string | null>(null);
  const [isSavingSubject, setIsSavingSubject] = useState(false);

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

  // Check roles and authorization
  const isAdmin = userRole === 'admin';
  const isTeacher = userRole === 'teacher';
  const primaryClass = teacherProfile?.primaryClassTeacher || teacherProfile?.class || '';
  const isClassTeacher = isTeacher && isPrimaryClassTeacher(teacherProfile, selectedClass, selectedAcademicYear);
  const canPublish = canPublishClassResult(userRole, teacherProfile, selectedClass, selectedAcademicYear);

  // Filter allowed classes for dropdown
  const allowedClasses = useMemo(() => {
    if (isAdmin) return allClasses;
    if (isTeacher) {
      return allClasses.filter(c => canTeacherAccessClass(userRole, teacherProfile, c, selectedSection, selectedAcademicYear));
    }
    return [];
  }, [isAdmin, isTeacher, allClasses, teacherProfile, userRole, selectedSection, selectedAcademicYear]);

  // Auto-select initial class
  useEffect(() => {
    if (!selectedClass && allowedClasses.length > 0) {
      if (primaryClass && allowedClasses.some(c => normalizeClass(c) === normalizeClass(primaryClass))) {
        setSelectedClass(normalizeClass(primaryClass));
      } else {
        setSelectedClass(allowedClasses[0]);
      }
    }
  }, [allowedClasses, selectedClass, primaryClass]);

  // Load all teachers once to accurately resolve Subject -> Teacher assignments
  useEffect(() => {
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
  }, []);

  // Listen to custom_subjects collection
  useEffect(() => {
    let unsubCustomSubjects: any;
    try {
      unsubCustomSubjects = onSnapshot(collection(db, 'custom_subjects'), (snap) => {
        const cList: any[] = [];
        snap.forEach(d => cList.push({ id: d.id, ...d.data() }));
        setCustomSubjectsList(cList);
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

  // Handle [ PREPARE / OPEN RESULT ]
  const handleOpenPreparation = async () => {
    if (!selectedClass || !selectedExam) {
      setStatus({ type: 'error', message: 'Please select both a Class and an Examination to open Result Preparation.' });
      return;
    }

    setLoadingContext(true);
    setStatus(null);
    try {
      const canonicalId = buildCanonicalExamId(selectedExam, selectedClass, selectedSection, selectedAcademicYear);
      const legacyId = `${selectedExam.replace(/\s+/g, '_')}_${selectedClass}`;

      let chosenExamId = canonicalId;
      let examRef = doc(db, 'exams', canonicalId);
      let examSnap = await getDoc(examRef);

      // Backward-compatibility: if canonical doc doesn't exist, check if legacy doc exists
      if (!examSnap.exists()) {
        const legacyRef = doc(db, 'exams', legacyId);
        const legacySnap = await getDoc(legacyRef);
        if (legacySnap.exists()) {
          const lData = legacySnap.data();
          const cleanAYear = (selectedAcademicYear || '').trim().replace(/[^0-9]/g, '');
          const cleanDocYear = (lData.academicYear || '').trim().replace(/[^0-9]/g, '');
          if (!cleanDocYear || !cleanAYear || cleanDocYear === cleanAYear || cleanAYear.includes(cleanDocYear)) {
            chosenExamId = legacyId;
            examRef = legacyRef;
            examSnap = legacySnap;
          }
        }
      }

      setActiveExamId(chosenExamId);
      const examId = chosenExamId;

      // 1. Fetch or initialize Exam Context in `exams`
      let examData: any;

      if (examSnap.exists()) {
        examData = examSnap.data();
      } else {
        // Initialize new preparation record
        examData = {
          id: examId,
          name: selectedExam,
          type: selectedExam,
          class: selectedClass,
          section: selectedSection,
          academicYear: selectedAcademicYear,
          published: false,
          status: 'IN PROGRESS',
          createdAt: new Date().toISOString(),
          createdByUid: auth.currentUser?.uid || 'system',
          createdByName: auth.currentUser?.displayName || (isAdmin ? 'Admin' : 'Teacher'),
          subjectStatus: {}
        };
        await setDoc(examRef, examData, { merge: true });

        // Record Audit Log for initialization
        try {
          await recordAuditLog({
            category: 'academic',
            actionType: 'PREPARATION_INITIALIZED',
            targetType: 'class_exam_results',
            targetId: examId,
            studentClass: selectedClass,
            academicYear: selectedAcademicYear,
            reason: `Initialized Result Preparation for Class ${selectedClass} - ${selectedExam}`,
            previousValue: 'None',
            newValue: `Initialized context for Class ${selectedClass} - ${selectedExam}`,
            result: 'SUCCESS'
          });
        } catch (_) {}
      }
      setExamDocData(examData);

      // 2. Fetch Enrolled Students for this Class from users collection
      const usersSnap = await getDocs(
        query(collection(db, 'users'), where('role', '==', 'student'), where('class', '==', selectedClass))
      );

      let fetchedStudents: StudentMarkEntry[] = usersSnap.docs.map(d => {
        const u = d.data();
        const primaryUid = d.id;
        const permId = u.permanentStudentId || u.studentId || primaryUid;
        const roll = u.rollNo || u.rollNumber || '';

        return {
          studentUid: primaryUid,
          studentId: permId,
          permanentStudentId: permId,
          studentEmis: u.studentEmis || u.emisNumber || '',
          studentName: u.fullName || u.displayName || u.name || 'Student',
          rollNo: roll,
          rollNumberSnapshot: roll,
          class: selectedClass,
          section: u.section || selectedSection,
          academicYear: selectedAcademicYear,
          email: u.email || '',
          subjectMarksTH: {},
          subjectMarksPR: {},
          subjectAbsentsTH: {},
          subjectAbsentsPR: {}
        };
      });

      // Filter by section if students have section defined and section is not 'All'
      const hasSectionDefined = fetchedStudents.some(s => Boolean(s.section && s.section.trim()));
      if (hasSectionDefined && selectedSection && selectedSection.trim().toLowerCase() !== 'all') {
        const targetSec = selectedSection.trim().toLowerCase();
        const sectionMatched = fetchedStudents.filter(s => (s.section || '').trim().toLowerCase() === targetSec);
        if (sectionMatched.length > 0) {
          fetchedStudents = sectionMatched;
        }
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

      // Populate existing marks into students
      fetchedStudents = fetchedStudents.map(std => {
        const thMarks: Record<string, any> = {};
        const prMarks: Record<string, any> = {};
        const thAbs: Record<string, boolean> = {};
        const prAbs: Record<string, boolean> = {};

        configuredSubjects.forEach(subj => {
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
      setStatus({ type: 'success', message: `Opened Result Preparation for Class ${selectedClass} — ${selectedExam}.` });
    } catch (e: any) {
      console.error('Error opening result preparation:', e);
      setStatus({ type: 'error', message: 'Failed to open preparation context: ' + e.message });
    } finally {
      setLoadingContext(false);
    }
  };

  // Compute Overall Exam Status
  const overallExamStatus: ExamPreparationStatus = useMemo(() => {
    if (examDocData?.published) return 'PUBLISHED';
    if (students.length === 0 || configuredSubjects.length === 0) return 'IN PROGRESS';

    // Check if every subject is complete
    let allSubjectsReady = true;
    for (const s of configuredSubjects) {
      const { status } = computeSubjectPreparationStatus(s, students, subjectConfigs);
      if (status !== 'READY FOR REVIEW') {
        allSubjectsReady = false;
        break;
      }
    }
    return allSubjectsReady ? 'READY FOR REVIEW' : 'IN PROGRESS';
  }, [examDocData, students, configuredSubjects, subjectConfigs]);

  // Handle Mark Changes in Entry Modal
  const handleMarkChange = (idx: number, type: 'TH' | 'PR', rawVal: string, subj: string) => {
    const val = rawVal.replace(/[^0-9.]/g, '');
    const num = Number(val);
    const config = subjectConfigs[subj] || { thFullMarks: 75, prFullMarks: 25 };
    const maxMarks = type === 'TH' ? config.thFullMarks : config.prFullMarks;

    if (val !== '' && (num > maxMarks || num < 0)) return;

    setStudents(prev => {
      const updated = [...prev];
      if (type === 'TH') {
        updated[idx].subjectMarksTH[subj] = val;
      } else {
        updated[idx].subjectMarksPR[subj] = val;
      }
      return updated;
    });
  };

  // Handle Absent Toggles
  const handleAbsentToggle = (idx: number, type: 'TH' | 'PR', checked: boolean, subj: string) => {
    setStudents(prev => {
      const updated = [...prev];
      if (type === 'TH') {
        updated[idx].subjectAbsentsTH[subj] = checked;
        if (checked) updated[idx].subjectMarksTH[subj] = '';
      } else {
        updated[idx].subjectAbsentsPR[subj] = checked;
        if (checked) updated[idx].subjectMarksPR[subj] = '';
      }
      return updated;
    });
  };

  // SAVE AS DRAFT: Persists marks without publishing
  const handleSaveDraftMarks = async (subjectToSave: string) => {
    // Verify Teacher access before persisting draft marks
    if (!canTeacherAccessSubject(userRole, teacherProfile, selectedClass, subjectToSave, selectedSection, selectedAcademicYear)) {
      setStatus({ type: 'error', message: `Unauthorized: You do not have permission to modify marks for ${subjectToSave} in Class ${selectedClass}.` });
      return;
    }

    setIsSavingSubject(true);
    try {
      const examId = activeExamId || buildCanonicalExamId(selectedExam, selectedClass, selectedSection, selectedAcademicYear);
      const batch = writeBatch(db);
      let opCount = 0;

      const config = subjectConfigs[subjectToSave] || {
        thFullMarks: 75,
        thPassMarks: 30,
        prFullMarks: 25,
        prPassMarks: 10,
        hasTh: true,
        hasPr: true
      };

      for (const std of students) {
        const thMark = std.subjectAbsentsTH?.[subjectToSave] ? 'AB' : (std.subjectMarksTH?.[subjectToSave] === '' || std.subjectMarksTH?.[subjectToSave] === undefined ? null : Number(std.subjectMarksTH[subjectToSave]));
        const prMark = std.subjectAbsentsPR?.[subjectToSave] ? 'AB' : (std.subjectMarksPR?.[subjectToSave] === '' || std.subjectMarksPR?.[subjectToSave] === undefined ? null : Number(std.subjectMarksPR[subjectToSave]));

        if (thMark === null && prMark === null) continue;

        const obtainedTH = thMark !== null ? thMark : 0;
        const obtainedPR = prMark !== null ? prMark : 0;
        const isCompleteAB = thMark === 'AB' && prMark === 'AB';
        const sumObtained = (thMark === 'AB' ? 0 : obtainedTH) + (prMark === 'AB' ? 0 : obtainedPR);
        const obtainedTotal = isCompleteAB ? 'AB' : sumObtained;

        const tFM = config.hasTh ? config.thFullMarks : 0;
        const pFM = config.hasPr ? config.prFullMarks : 0;

        const subjectDocId = `${examId}_${std.studentUid}_${subjectToSave.replace(/\s+/g, '')}`;
        const resultDocRef = doc(db, 'results', subjectDocId);

        batch.set(resultDocRef, {
          studentUid: std.studentUid,
          studentId: std.studentId,
          permanentStudentId: std.permanentStudentId || std.studentId,
          studentEmis: std.studentEmis || '',
          examId: examId,
          subject: subjectToSave,
          marks: obtainedTotal,
          fullMarks: tFM + pFM,
          thMarks: thMark !== null ? thMark : 0,
          prMarks: prMark !== null ? prMark : 0,
          thFull: tFM,
          prFull: pFM,
          thPass: config.thPassMarks,
          prPass: config.prPassMarks,
          class: selectedClass,
          section: selectedSection,
          academicYear: selectedAcademicYear,
          rollNo: std.rollNo,
          rollNumberSnapshot: std.rollNo,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        // Mirror in results_secure
        const secureDocRef = doc(db, 'results_secure', std.studentUid, 'records', subjectDocId);
        batch.set(secureDocRef, {
          studentUid: std.studentUid,
          studentId: std.studentId,
          permanentStudentId: std.permanentStudentId || std.studentId,
          studentEmis: std.studentEmis || '',
          examId: examId,
          subject: subjectToSave,
          marks: obtainedTotal,
          fullMarks: tFM + pFM,
          thMarks: thMark !== null ? thMark : 0,
          prMarks: prMark !== null ? prMark : 0,
          thFull: tFM,
          prFull: pFM,
          class: selectedClass,
          section: selectedSection,
          academicYear: selectedAcademicYear,
          rollNo: std.rollNo
        }, { merge: true });

        opCount += 2;
      }

      // Update Subject Status in `exams`
      const { status: newSubjStatus, enteredCount, totalCount } = computeSubjectPreparationStatus(subjectToSave, students, subjectConfigs);
      const examRef = doc(db, 'exams', examId);

      batch.update(examRef, {
        [`subjectStatus.${subjectToSave}`]: {
          status: newSubjStatus,
          enteredCount,
          totalCount,
          lastSavedAt: new Date().toISOString(),
          lastSavedBy: auth.currentUser?.displayName || (isAdmin ? 'Admin' : 'Teacher'),
          lastSavedByUid: auth.currentUser?.uid || ''
        },
        status: 'IN PROGRESS',
        published: false
      });

      await batch.commit();

      // Audit Log for Saving Draft Marks
      try {
        await recordAuditLog({
          category: 'academic',
          actionType: 'MARK_ENTRY',
          targetType: 'class_exam_results',
          targetId: examId,
          studentClass: selectedClass,
          academicYear: selectedAcademicYear,
          reason: `Saved DRAFT marks for ${subjectToSave} in Class ${selectedClass} (${enteredCount}/${totalCount} students)`,
          previousValue: 'Previous Draft',
          newValue: `Subject ${subjectToSave} updated to ${newSubjStatus}`,
          result: 'SUCCESS'
        });
      } catch (_) {}

      // Update local examDocData
      setExamDocData((prev: any) => ({
        ...prev,
        subjectStatus: {
          ...(prev?.subjectStatus || {}),
          [subjectToSave]: {
            status: newSubjStatus,
            enteredCount,
            totalCount,
            lastSavedAt: new Date().toISOString()
          }
        }
      }));

      setStatus({ type: 'success', message: `Saved draft marks for ${subjectToSave}. Marks remain unpublished.` });
      setActiveEntrySubject(null);
    } catch (err: any) {
      console.error('Failed to save draft marks:', err);
      setStatus({ type: 'error', message: 'Failed to save marks: ' + err.message });
    } finally {
      setIsSavingSubject(false);
    }
  };

  // Submit Correction Request (Class Teacher -> Subject Teacher)
  const handleRequestCorrection = async () => {
    if (!correctionModalSubject || !correctionNote.trim()) return;
    setSubmittingCorrection(true);
    try {
      const examId = activeExamId || buildCanonicalExamId(selectedExam, selectedClass, selectedSection, selectedAcademicYear);
      const examRef = doc(db, 'exams', examId);

      await updateDoc(examRef, {
        [`correctionsRequested.${correctionModalSubject}`]: {
          requestedBy: auth.currentUser?.displayName || (isAdmin ? 'Admin' : 'Class Teacher'),
          requestedByUid: auth.currentUser?.uid,
          note: correctionNote.trim(),
          requestedAt: new Date().toISOString(),
          resolved: false
        }
      });

      // Audit Log
      try {
        await recordAuditLog({
          category: 'academic',
          actionType: 'CORRECTION_REQUESTED',
          targetType: 'class_exam_results',
          targetId: examId,
          studentClass: selectedClass,
          academicYear: selectedAcademicYear,
          reason: `Requested mark correction for ${correctionModalSubject}: "${correctionNote.trim()}"`,
          previousValue: 'Draft',
          newValue: 'Correction Requested',
          result: 'SUCCESS'
        });
      } catch (_) {}

      setExamDocData((prev: any) => ({
        ...prev,
        correctionsRequested: {
          ...(prev?.correctionsRequested || {}),
          [correctionModalSubject]: {
            requestedBy: auth.currentUser?.displayName || (isAdmin ? 'Admin' : 'Class Teacher'),
            note: correctionNote.trim(),
            requestedAt: new Date().toISOString(),
            resolved: false
          }
        }
      }));

      setStatus({ type: 'success', message: `Correction request sent for ${correctionModalSubject}.` });
      setCorrectionModalSubject(null);
      setCorrectionNote('');
    } catch (err: any) {
      setStatus({ type: 'error', message: 'Failed to submit correction request: ' + err.message });
    } finally {
      setSubmittingCorrection(false);
    }
  };

  // Trigger Pre-Publication Validation
  const handleInitiatePublish = () => {
    const report = validatePrePublication({
      userRole,
      teacherProfile,
      targetClass: selectedClass,
      examType: selectedExam,
      academicYear: selectedAcademicYear,
      students,
      subjects: configuredSubjects,
      subjectConfigs,
      examPublished: examDocData?.published
    });

    setValidationReport(report);
    setIsPublishModalOpen(true);
  };

  // Execute Final Publish Operation
  const handleExecutePublish = async () => {
    if (!validationReport?.valid) return;
    setIsPublishing(true);
    setStatus({ type: 'info', message: 'Calculating final ranks, publishing results and dispatching notifications...' });

    try {
      const examId = activeExamId || buildCanonicalExamId(selectedExam, selectedClass, selectedSection, selectedAcademicYear);
      let batch = writeBatch(db);
      let opCount = 0;

      // 1. Calculate Totals & Summaries for every student
      const studentSummaries: any[] = [];

      for (const std of students) {
        let totalObtained = 0;
        let totalFull = 0;

        configuredSubjects.forEach(subj => {
          const config = subjectConfigs[subj] || { thFullMarks: 75, prFullMarks: 25, hasTh: true, hasPr: true };
          const th = std.subjectAbsentsTH?.[subj] ? 'AB' : (std.subjectMarksTH?.[subj] !== undefined && std.subjectMarksTH?.[subj] !== '' ? Number(std.subjectMarksTH[subj]) : 0);
          const pr = std.subjectAbsentsPR?.[subj] ? 'AB' : (std.subjectMarksPR?.[subj] !== undefined && std.subjectMarksPR?.[subj] !== '' ? Number(std.subjectMarksPR[subj]) : 0);

          if (th !== 'AB') totalObtained += th;
          if (pr !== 'AB') totalObtained += pr;
          totalFull += (config.hasTh ? config.thFullMarks : 0) + (config.hasPr ? config.prFullMarks : 0);
        });

        const pct = totalFull > 0 ? (totalObtained / totalFull) * 100 : 0;
        const gpa = getNepalGPA(pct);
        const grade = getGrade(totalObtained, totalFull);

        studentSummaries.push({
          studentUid: std.studentUid,
          studentId: std.studentId,
          permanentStudentId: std.permanentStudentId || std.studentId,
          studentEmis: std.studentEmis || '',
          studentName: std.studentName,
          rollNo: std.rollNo || '00',
          rollNumberSnapshot: std.rollNo || '00',
          class: selectedClass,
          section: selectedSection,
          academicYear: selectedAcademicYear,
          examId: examId,
          examType: selectedExam,
          total: totalObtained,
          fullTotal: totalFull,
          percentage: pct,
          grade: grade,
          gpa: gpa,
          published: true,
          email: std.email || ''
        });
      }

      // 2. Calculate Standard Tie-Ranks (1, 2, 2, 4...)
      const rankedSummaries = calculateClassRanks(studentSummaries);

      // 3. Batch commit summaries to `resultSummary`
      for (const std of rankedSummaries) {
        const summaryDocId = `${examId}_${std.studentUid}`;
        batch.set(doc(db, 'resultSummary', summaryDocId), {
          ...std,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        opCount++;
      }

      // 4. Update `exams` doc to published
      batch.update(doc(db, 'exams', examId), {
        published: true,
        status: 'PUBLISHED',
        publishedAt: new Date().toISOString(),
        publishedByUid: auth.currentUser?.uid || 'system',
        publishedByName: auth.currentUser?.displayName || (isAdmin ? 'Admin' : 'Class Teacher')
      });
      opCount++;

      // 5. Deterministic Bell Notification in `notices` specifically targeted to affected students
      const noticeId = `notice_result_${examId}`;
      const affectedStudentUids = rankedSummaries.map(s => s.studentUid).filter(Boolean);

      batch.set(doc(db, 'notices', noticeId), {
        title: `RESULT PUBLISHED: ${selectedExam} — Class ${selectedClass}`,
        message: `Your ${selectedExam} result for Class ${selectedClass} (${selectedAcademicYear}) has been published by Shikshantar Academy. Log in to view your complete breakdown and download your report card.`,
        date: new Date().toISOString().split('T')[0],
        priority: 'Urgent',
        targets: ['Student', 'Students Only', `Class ${selectedClass}`],
        targetClass: selectedClass,
        recipientUids: affectedStudentUids, // Strictly targeted to affected students only!
        examId: examId,
        examType: selectedExam,
        academicYear: selectedAcademicYear,
        isPinned: true,
        status: 'Published',
        timestamp: new Date().toISOString()
      }, { merge: true });
      opCount++;

      await batch.commit();

      // 6. Record Audit Log for publication
      try {
        await recordAuditLog({
          category: 'academic',
          actionType: 'EXAM_PUBLISHED',
          targetType: 'class_exam_results',
          targetId: examId,
          studentClass: selectedClass,
          academicYear: selectedAcademicYear,
          reason: `Calculated ranks and officially published results for Class ${selectedClass} - ${selectedExam} (${students.length} students)`,
          previousValue: 'DRAFT',
          newValue: 'PUBLISHED',
          result: 'SUCCESS'
        });
      } catch (_) {}

      // 7. Dispatch Publication Emails to Registered Emails via Server API
      let emailFeedback = { totalSent: 0, failedCount: 0, simulated: true };
      try {
        const token = await auth.currentUser?.getIdToken();
        const emailRes = await fetch('/api/results/send-publication-emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            examId,
            examType: selectedExam,
            className: selectedClass,
            academicYear: selectedAcademicYear,
            students: rankedSummaries.map(s => ({
              email: s.email,
              name: s.studentName,
              studentId: s.permanentStudentId || s.studentId,
              studentUid: s.studentUid
            }))
          })
        });

        if (emailRes.ok) {
          emailFeedback = await emailRes.json();
        } else {
          console.warn('Publication email endpoint returned non-200 status');
        }
      } catch (mailErr: any) {
        console.warn('Non-blocking publication email error:', mailErr);
        // Do NOT rollback publication on email failure!
      }

      setExamDocData((prev: any) => ({
        ...prev,
        published: true,
        status: 'PUBLISHED'
      }));

      setPublishFeedback({
        totalStudents: students.length,
        emailFeedback
      });

      setStatus({ 
        type: 'success', 
        message: `Class ${selectedClass} — ${selectedExam} successfully published! Bell notice dispatched. ${emailFeedback.totalSent} student emails processed.` 
      });
    } catch (err: any) {
      console.error('Publication failed:', err);
      setStatus({ type: 'error', message: 'Failed to publish results: ' + err.message });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Selector Bar */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <GraduationCap className="w-6 h-6 text-blue-600" />
              Result Preparation & Academic Workflow
            </h2>
            <p className="text-xs text-gray-500 font-medium mt-1">
              Exact Teacher-to-Subject preparation, Save as Draft, human review, and authoritative publication.
            </p>
          </div>

          {/* Role Badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Active Workspace:</span>
            <span className={`px-3 py-1 text-xs font-black rounded-lg uppercase tracking-wider ${
              isAdmin 
                ? 'bg-purple-100 text-purple-800 border border-purple-200' 
                : isClassTeacher 
                  ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
            }`}>
              {isAdmin ? 'Admin (Full Authority)' : isClassTeacher ? `Class Teacher (Class ${selectedClass})` : 'Subject Teacher'}
            </span>
          </div>
        </div>

        {/* Form Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-4">
          {/* Academic Year */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Academic Year</label>
            <select
              value={selectedAcademicYear}
              onChange={e => {
                setSelectedAcademicYear(e.target.value);
                setIsPreparationActive(false);
              }}
              className="w-full px-3 py-2 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-bold text-sm text-gray-800"
            >
              {DEFAULT_ACADEMIC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Class */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Class</label>
            <select
              value={selectedClass}
              onChange={e => {
                setSelectedClass(e.target.value);
                setIsPreparationActive(false);
              }}
              className="w-full px-3 py-2 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-bold text-sm text-gray-800"
            >
              <option value="">-- Select Class --</option>
              {allowedClasses.map(c => <option key={c} value={c}>Class {c}</option>)}
            </select>
          </div>

          {/* Section */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Section</label>
            <select
              value={selectedSection}
              onChange={e => {
                setSelectedSection(e.target.value);
                setIsPreparationActive(false);
              }}
              className="w-full px-3 py-2 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-bold text-sm text-gray-800"
            >
              {DEFAULT_SECTIONS.map(s => <option key={s} value={s}>Section {s}</option>)}
            </select>
          </div>

          {/* Examination */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Examination / Terminal</label>
            <select
              value={selectedExam}
              onChange={e => {
                setSelectedExam(e.target.value);
                setIsPreparationActive(false);
              }}
              className="w-full px-3 py-2 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-bold text-sm text-gray-800"
            >
              <option value="">-- Select Terminal --</option>
              {EXAM_TYPES.map(ex => <option key={ex} value={ex}>{ex}</option>)}
            </select>
          </div>

          {/* Action Button */}
          <div className="flex items-end">
            <button
              onClick={handleOpenPreparation}
              disabled={loadingContext || !selectedClass || !selectedExam}
              className="w-full px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
            >
              {loadingContext ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              {isPreparationActive ? 'Reload Preparation' : 'Prepare / Open Result'}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Active Result Preparation Dashboard */}
      {isPreparationActive && (
        <div className="space-y-6">
          {/* Header Summary Banner */}
          <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-6 rounded-2xl shadow-md">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-xs uppercase tracking-widest bg-blue-800/80 px-2.5 py-0.5 rounded text-blue-200 font-black">
                    {selectedAcademicYear}
                  </span>
                  <span className="text-xs uppercase tracking-widest bg-blue-800/80 px-2.5 py-0.5 rounded text-blue-200 font-black">
                    Section {selectedSection}
                  </span>
                </div>
                <h1 className="text-2xl font-black mt-2">
                  Class {selectedClass} — {selectedExam}
                </h1>
                <p className="text-xs text-blue-200 mt-1 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" /> Enrolled Students: <strong>{students.length}</strong> | 
                  Configured Subjects: <strong>{configuredSubjects.length}</strong>
                </p>
              </div>

              {/* Status and Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Overall Status Badge */}
                <div className="text-right mr-2">
                  <p className="text-[10px] uppercase tracking-wider text-blue-300 font-bold">Overall Status</p>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider mt-0.5 ${
                    overallExamStatus === 'PUBLISHED'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : overallExamStatus === 'READY FOR REVIEW'
                        ? 'bg-blue-400 text-blue-950 font-black'
                        : 'bg-amber-400 text-amber-950 font-black'
                  }`}>
                    {overallExamStatus === 'PUBLISHED' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {overallExamStatus === 'READY FOR REVIEW' && <Clock className="w-3.5 h-3.5" />}
                    {overallExamStatus === 'IN PROGRESS' && <Edit3 className="w-3.5 h-3.5" />}
                    {overallExamStatus}
                  </span>
                </div>

                {/* Review Result Button (Class Teacher & Admin) */}
                {(isAdmin || isClassTeacher) && (
                  <button
                    onClick={() => setIsReviewModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-blue-300" />
                    Review Result
                  </button>
                )}

                {/* Publish Result Button (Class Teacher & Admin ONLY) */}
                {canPublish ? (
                  <button
                    onClick={handleInitiatePublish}
                    className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs flex items-center gap-1.5 shadow-md transition-all"
                  >
                    <Send className="w-4 h-4" />
                    {overallExamStatus === 'PUBLISHED' ? 'Republish Result' : 'Publish Result'}
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl text-xs text-blue-200">
                    <Lock className="w-3.5 h-3.5 text-blue-300" />
                    <span>Publish restricted to Class Teacher / Admin</span>
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

                        {/* Status */}
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            subjStatus === 'READY FOR REVIEW'
                              ? 'bg-blue-100 text-blue-800'
                              : subjStatus === 'DRAFT'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-gray-100 text-gray-600'
                          }`}>
                            {subjStatus}
                          </span>
                        </td>

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
                        <td className="py-3 px-4 text-right space-x-2">
                          {/* Request Correction Button (Class Teacher/Admin) */}
                          {(isAdmin || isClassTeacher) && (
                            <button
                              onClick={() => {
                                setCorrectionModalSubject(subj);
                                setCorrectionNote(correction?.note || '');
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold text-gray-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors border border-gray-200"
                            >
                              Correction Note
                            </button>
                          )}

                          {/* Enter / Edit Marks Button */}
                          {canAccess ? (
                            <button
                              onClick={() => setActiveEntrySubject(subj)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fadeIn">
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
                onClick={() => setActiveEntrySubject(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Table Body */}
            <div className="p-6 overflow-y-auto flex-1">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 font-black uppercase tracking-wider border-b border-gray-200">
                    <th className="py-2.5 px-3">Roll</th>
                    <th className="py-2.5 px-3">Student Name</th>
                    <th className="py-2.5 px-3">Student ID</th>
                    <th className="py-2.5 px-3 text-center">Theory Mark (Max 75)</th>
                    <th className="py-2.5 px-3 text-center">Absent TH</th>
                    <th className="py-2.5 px-3 text-center">Practical Mark (Max 25)</th>
                    <th className="py-2.5 px-3 text-center">Absent PR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.map((std, idx) => {
                    const isAbsTH = Boolean(std.subjectAbsentsTH?.[activeEntrySubject]);
                    const isAbsPR = Boolean(std.subjectAbsentsPR?.[activeEntrySubject]);

                    return (
                      <tr key={std.studentUid} className="hover:bg-blue-50/30 transition-colors">
                        <td className="py-2 px-3 font-mono font-bold text-gray-800">{std.rollNo || '—'}</td>
                        <td className="py-2 px-3 font-bold text-gray-900">{std.studentName}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-gray-500">{std.permanentStudentId || std.studentId}</td>

                        {/* Theory Input */}
                        <td className="py-2 px-3 text-center">
                          <input
                            type="text"
                            disabled={isAbsTH}
                            value={isAbsTH ? 'AB' : (std.subjectMarksTH?.[activeEntrySubject] ?? '')}
                            onChange={e => handleMarkChange(idx, 'TH', e.target.value, activeEntrySubject)}
                            placeholder={isAbsTH ? 'AB' : '0–75'}
                            className={`w-20 px-2 py-1 text-center font-bold font-mono text-sm border rounded-lg outline-none transition-all ${
                              isAbsTH ? 'bg-red-50 text-red-600 border-red-200 font-black' : 'bg-white focus:ring-2 focus:ring-blue-500'
                            }`}
                          />
                        </td>

                        {/* Absent TH Toggle */}
                        <td className="py-2 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isAbsTH}
                            onChange={e => handleAbsentToggle(idx, 'TH', e.target.checked, activeEntrySubject)}
                            className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                          />
                        </td>

                        {/* Practical Input */}
                        <td className="py-2 px-3 text-center">
                          <input
                            type="text"
                            disabled={isAbsPR}
                            value={isAbsPR ? 'AB' : (std.subjectMarksPR?.[activeEntrySubject] ?? '')}
                            onChange={e => handleMarkChange(idx, 'PR', e.target.value, activeEntrySubject)}
                            placeholder={isAbsPR ? 'AB' : '0–25'}
                            className={`w-20 px-2 py-1 text-center font-bold font-mono text-sm border rounded-lg outline-none transition-all ${
                              isAbsPR ? 'bg-red-50 text-red-600 border-red-200 font-black' : 'bg-white focus:ring-2 focus:ring-blue-500'
                            }`}
                          />
                        </td>

                        {/* Absent PR Toggle */}
                        <td className="py-2 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isAbsPR}
                            onChange={e => handleAbsentToggle(idx, 'PR', e.target.checked, activeEntrySubject)}
                            className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
              <span className="text-xs text-gray-500 font-medium">
                Note: Saving stores marks in draft. Students and portals will not see these until official publication.
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveEntrySubject(null)}
                  className="px-4 py-2 border border-gray-200 rounded-xl font-bold text-xs text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveDraftMarks(activeEntrySubject)}
                  disabled={isSavingSubject}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
                >
                  {isSavingSubject ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save as Draft
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Complete Class Review Modal */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fadeIn">
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
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 font-black uppercase tracking-wider border-b border-gray-200">
                    <th className="py-2.5 px-2">Roll</th>
                    <th className="py-2.5 px-3">Student Name</th>
                    {configuredSubjects.map(s => (
                      <th key={s} className="py-2.5 px-2 text-center">{s}</th>
                    ))}
                    <th className="py-2.5 px-2 text-center">Total</th>
                    <th className="py-2.5 px-2 text-center">Pct (%)</th>
                    <th className="py-2.5 px-2 text-center">GPA</th>
                    <th className="py-2.5 px-2 text-center">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-mono">
                  {students.map(std => {
                    let totalObt = 0;
                    let totalFull = 0;

                    return (
                      <tr key={std.studentUid} className="hover:bg-blue-50/30">
                        <td className="py-2 px-2 font-bold text-gray-800">{std.rollNo || '—'}</td>
                        <td className="py-2 px-3 font-sans font-bold text-gray-900">{std.studentName}</td>
                        {configuredSubjects.map(subj => {
                          const config = subjectConfigs[subj] || { thFullMarks: 75, prFullMarks: 25 };
                          const th = std.subjectAbsentsTH?.[subj] ? 'AB' : (std.subjectMarksTH?.[subj] !== undefined && std.subjectMarksTH?.[subj] !== '' ? Number(std.subjectMarksTH[subj]) : null);
                          const pr = std.subjectAbsentsPR?.[subj] ? 'AB' : (std.subjectMarksPR?.[subj] !== undefined && std.subjectMarksPR?.[subj] !== '' ? Number(std.subjectMarksPR[subj]) : null);

                          const hasMark = th !== null || pr !== null;
                          if (th !== null && th !== 'AB') totalObt += th;
                          if (pr !== null && pr !== 'AB') totalObt += pr;
                          totalFull += config.thFullMarks + config.prFullMarks;

                          return (
                            <td key={subj} className="py-2 px-2 text-center">
                              {hasMark ? (
                                <span className="font-bold text-gray-800">
                                  {th === 'AB' ? 'AB' : (th ?? 0)} + {pr === 'AB' ? 'AB' : (pr ?? 0)}
                                </span>
                              ) : (
                                <span className="text-rose-500 font-bold bg-rose-50 px-1 py-0.5 rounded text-[10px]">
                                  MISSING
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2 px-2 text-center font-bold text-blue-700">{totalObt}</td>
                        <td className="py-2 px-2 text-center font-bold text-gray-700">
                          {totalFull > 0 ? ((totalObt / totalFull) * 100).toFixed(1) : '0.0'}%
                        </td>
                        <td className="py-2 px-2 text-center font-bold text-emerald-700">
                          {getNepalGPA(totalFull > 0 ? (totalObt / totalFull) * 100 : 0).toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-center font-bold text-gray-800 font-sans">
                          {getGrade(totalObt, totalFull)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
      )}

      {/* 5. Correction Request Modal */}
      {correctionModalSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fadeIn">
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
      )}

      {/* 6. Pre-Publication Validation & Publish Modal */}
      {isPublishModalOpen && validationReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fadeIn">
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
                <div className="font-bold text-gray-800">What happens on publication:</div>
                <ul className="list-disc list-inside space-y-1 text-[11px]">
                  <li>Result summaries and terminal ranks will be saved and marked <strong>PUBLISHED</strong>.</li>
                  <li>A bell notice will be broadcasted to students and guardians.</li>
                  <li>Official result emails will be dispatched to students' registered emails.</li>
                  <li>Report cards & PDF downloads will become accessible to students.</li>
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
      )}
    </div>
  );
}
