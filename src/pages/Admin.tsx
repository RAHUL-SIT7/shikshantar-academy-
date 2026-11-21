import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { auth, db, handleFirestoreError, OperationType } from "../firebase";
import {
  collection,
  query,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import {
  BookOpen,
  User,
  Users,
  Folder,
  AlertCircle,
  FileSpreadsheet,
  Edit2,
  Search,
  Settings,
  Loader2,
  CheckCircle,
  TrendingUp,
  DollarSign,
  Inbox,
  ShieldCheck,
  GraduationCap,
  BookMarked,
  Layout,
  ArrowRight,
  Sparkles,
  Calendar,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import { ManualEntryTab } from "../components/admin/ManualEntryTab";
import { ViewManageTab } from "../components/admin/ViewManageTab";
import { IndividualStudentResultTab } from "../components/admin/IndividualStudentResultTab";
import { ResultPreparationTab } from "../components/admin/ResultPreparationTab";
import { EnquiriesTab } from "../components/admin/EnquiriesTab";
import { AuditLogsTab } from "../components/admin/AuditLogsTab";
import { CustomSubjectsTab } from "../components/admin/CustomSubjectsTab";
import { AcademicPromotionTab } from "../components/admin/AcademicPromotionTab";
import { ResultTemplateDesigner } from "../components/admin/ResultTemplateDesigner";
import { AcademicYearManagementTab } from "../components/admin/AcademicYearManagementTab";

import { StudentResult } from "../data/resultsState";
import { SharedExamSetup, SharedExamSetupContext } from "../components/admin/SharedExamSetup";
import { WorkflowExitConfirmModal } from "../components/admin/WorkflowExitConfirmModal";

const EXAM_TYPES = [
  "First Terminal Examination",
  "Second Terminal Examination",
  "Third Terminal Examination",
  "Final Terminal Examination",
];
const DEFAULT_CLASSES = [
  "Play Group",
  "Nursery",
  "LKG",
  "UKG",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
];
const SUBJECTS = [
  "Mathematics",
  "Science",
  "English",
  "Nepali",
  "Social Studies",
  "Computer",
  "HPE",
  "Opt. Math",
];

export default function Admin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get("tab");
    return (t && t !== "upload") ? t : "hub";
  });

  // Listen to search params changes
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam) {
      setActiveTab(tabParam === "upload" ? "hub" : tabParam);
    }
  }, [searchParams]);

  const [data, setData] = useState<StudentResult[]>([]);
  const [status, setStatus] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Role & Teacher restrictions from authoritative AuthContext
  const { user, userRole, userProfile, isAuthenticated, loading: authLoading } = useAuth();
  const [teacherProfile, setTeacherProfile] = useState<any>(null);
  const [isTeacherSetupDone, setIsTeacherSetupDone] = useState(false);
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);
  const [assignedSubjects, setAssignedSubjects] = useState<string[]>([]);
  const [sharedExamContext, setSharedExamContext] = useState<any>(null);
  const [showSharedSetup, setShowSharedSetup] = useState(false);
  const [sharedSetupDirty, setSharedSetupDirty] = useState(false);
  const [manualEntryMode, setManualEntryMode] = useState<string | null>(null);

  // Unified Result Workflow Exit Protection State
  const [workflowGuard, setWorkflowGuard] = useState<{
    isActive: boolean;
    isDirty: boolean;
    workflowName: string;
    contextSummary?: string;
    canSaveDraft?: boolean;
    saveDraft?: () => Promise<boolean>;
  } | null>(null);
  const [pendingExitNav, setPendingExitNav] = useState<{
    targetDestination: string;
    workflowName: string;
    contextSummary?: string;
    hasUnsavedChanges: boolean;
    canSaveDraft: boolean;
    saveDraft?: () => Promise<boolean>;
    execute: () => void;
  } | null>(null);
  const [isSavingBeforeExit, setIsSavingBeforeExit] = useState(false);

  const handleWorkflowGuardChange = useCallback((guard: typeof workflowGuard) => {
    setWorkflowGuard(guard);
  }, []);

  const isInsideResultWorkflow = activeTab === "prep" || activeTab === "manual";

  const evaluateWorkflowExitState = useCallback(() => {
    if (!isInsideResultWorkflow) return null;
    if (activeTab === "manual") {
      return {
        shouldConfirm: true,
        workflowName: workflowGuard?.workflowName || "Standalone Direct Manual Entry",
        contextSummary: workflowGuard?.contextSummary,
        hasUnsavedChanges: Boolean(workflowGuard?.isDirty),
        canSaveDraft: Boolean(workflowGuard?.canSaveDraft && workflowGuard?.saveDraft),
        saveDraft: workflowGuard?.saveDraft,
      };
    }
    // activeTab === "prep" (Connected Examination Management)
    const hasUnsaved = Boolean(workflowGuard?.isDirty || (showSharedSetup && sharedSetupDirty));
    const contextParts: string[] = [];
    if (showSharedSetup) contextParts.push("New Examination Setup Wizard");
    if (workflowGuard?.contextSummary) contextParts.push(workflowGuard.contextSummary);
    return {
      shouldConfirm: true,
      workflowName: workflowGuard?.workflowName || "Connected Examination Management",
      contextSummary: contextParts.join(" • ") || "Examination Preparation Workspace",
      hasUnsavedChanges: hasUnsaved,
      canSaveDraft: false,
      saveDraft: undefined,
    };
  }, [isInsideResultWorkflow, activeTab, workflowGuard, showSharedSetup, sharedSetupDirty]);

  const requestGuardedAction = useCallback(
    (targetDestination: string, execute: () => void) => {
      const state = evaluateWorkflowExitState();
      if (state?.shouldConfirm) {
        setPendingExitNav({
          targetDestination,
          workflowName: state.workflowName,
          contextSummary: state.contextSummary,
          hasUnsavedChanges: state.hasUnsavedChanges,
          canSaveDraft: state.canSaveDraft,
          saveDraft: state.saveDraft,
          execute,
        });
      } else {
        execute();
      }
    },
    [evaluateWorkflowExitState]
  );

  const handleRequestTabSwitch = useCallback(
    (nextTab: string, tabLabel: string) => {
      if (nextTab === activeTab) return;
      requestGuardedAction(tabLabel, () => {
        if (nextTab !== "prep") {
          setShowSharedSetup(false);
          setSharedSetupDirty(false);
        }
        setWorkflowGuard(null);
        setActiveTab(nextTab);
      });
    },
    [activeTab, requestGuardedAction]
  );

  // Register global portal sidebar guard while inside an active Result Workflow
  const requestGuardedActionRef = useRef(requestGuardedAction);
  useEffect(() => {
    requestGuardedActionRef.current = requestGuardedAction;
  }, [requestGuardedAction]);

  useEffect(() => {
    if (!isInsideResultWorkflow) {
      if ((window as any).__shikshantarNavigationGuard) {
        delete (window as any).__shikshantarNavigationGuard;
      }
      return;
    }
    const guardFn = (targetHref: string, targetLabel?: string) => {
      requestGuardedActionRef.current(targetLabel || targetHref, () => {
        delete (window as any).__shikshantarNavigationGuard;
        setShowSharedSetup(false);
        setSharedSetupDirty(false);
        setWorkflowGuard(null);
        navigate(targetHref);
      });
      return false;
    };
    (window as any).__shikshantarNavigationGuard = guardFn;
    return () => {
      if ((window as any).__shikshantarNavigationGuard === guardFn) {
        delete (window as any).__shikshantarNavigationGuard;
      }
    };
  }, [isInsideResultWorkflow, navigate]);

  const dynamicExamTypes = useMemo(() => {
    const types = new Set(EXAM_TYPES);
    data.forEach((d) => types.add(d.examType));
    return Array.from(types);
  }, [data]);

  useEffect(() => {
    let unsubExams: any;
    let unsubSummary: any;
    let unsubResults: any;

    const subscribeToResults = () => {
      setLoading(true);
      let examsMap: Record<string, any> = {};
      let summaryList: any[] = [];
      let resultsList: any[] = [];

      const updateState = () => {
        const resultsBySummaryId: Record<string, any> = {};
        resultsList.forEach((sub) => {
          const subjectData = {
            fullMarks: sub.fullMarks,
            obtained: sub.marks,
            thMarks: sub.thMarks,
            prMarks: sub.prMarks,
            thFull: sub.thFull,
            prFull: sub.prFull,
            thPass: sub.thPass,
            prPass: sub.prPass,
          };

          const addMapping = (id?: string) => {
            if (!id) return;
            const mapId = `${sub.examId}_${id}`;
            if (!resultsBySummaryId[mapId]) resultsBySummaryId[mapId] = {};
            resultsBySummaryId[mapId][sub.subject] = subjectData;
          };

          addMapping(sub.studentId);
          addMapping(sub.studentUid);
          addMapping(sub.permanentStudentId);
        });

        const parsedData: StudentResult[] = summaryList.map((sum) => {
          const exm = examsMap[sum.examId];
          const matchedSubjects =
            resultsBySummaryId[`${sum.examId}_${sum.studentId}`] ||
            (sum.permanentStudentId ? resultsBySummaryId[`${sum.examId}_${sum.permanentStudentId}`] : undefined) ||
            (sum.studentUid ? resultsBySummaryId[`${sum.examId}_${sum.studentUid}`] : undefined) ||
            {};
          return {
            studentUid: sum.studentUid || sum.studentId,
            studentId: sum.studentId,
            permanentStudentId: sum.permanentStudentId || sum.studentId,
            studentEmis: sum.studentEmis || sum.emisNumber || "",
            studentName: sum.studentName,
            academicYear: sum.academicYear || "",
            class: sum.class,
            section: sum.section || "A",
            rollNo: sum.rollNo || "",
            examType: sum.examType,
            examId: sum.examId,
            subjects: matchedSubjects,
            total: sum.total,
            fullTotal: sum.fullTotal,
            percentage: sum.percentage,
            grade: sum.grade,
            gpa: sum.gpa || 0,
            rank: sum.rank || 0,
            published: exm ? exm.published : false,
            classTeacherRemark: sum.classTeacherRemark || "",
          };
        });
        setData(parsedData);
        setLoading(false);
      };

      try {
        unsubExams = onSnapshot(
          collection(db, "exams"),
          (snap) => {
            examsMap = {};
            snap.forEach((doc) => (examsMap[doc.id] = doc.data()));
            updateState();
          },
          (e) => {
            console.warn("Snapshot error (exams):", e);
            setLoading(false);
            handleFirestoreError(e, OperationType.LIST, "exams");
          },
        );

        unsubSummary = onSnapshot(
          collection(db, "resultSummary"),
          (snap) => {
            summaryList = [];
            snap.forEach((doc) =>
              summaryList.push({ id: doc.id, ...doc.data() }),
            );
            updateState();
          },
          (e) => {
            console.warn("Snapshot error (resultSummary):", e);
            setLoading(false);
            handleFirestoreError(e, OperationType.LIST, "resultSummary");
          },
        );

        unsubResults = onSnapshot(
          collection(db, "results"),
          (snap) => {
            resultsList = [];
            snap.forEach((doc) =>
              resultsList.push({ id: doc.id, ...doc.data() }),
            );
            updateState();
          },
          (e) => {
            console.warn("Snapshot error (results):", e);
            setLoading(false);
            handleFirestoreError(e, OperationType.LIST, "results");
          },
        );
      } catch (err: any) {
        setLoading(false);
      }
    };

    if (authLoading) return;

    if (!isAuthenticated || !user || (userRole !== "admin" && userRole !== "teacher")) {
      setData([]);
      setTeacherProfile(null);
      setAssignedClasses([]);
      setAssignedSubjects([]);
      setIsTeacherSetupDone(false);
      setLoading(false);
      return;
    }

    if (userRole === "teacher") {
      if (userProfile) {
        setTeacherProfile(userProfile);
        const classes =
          userProfile.assignedClasses && Array.isArray(userProfile.assignedClasses) && userProfile.assignedClasses.length > 0
            ? userProfile.assignedClasses
            : (userProfile.class ? [userProfile.class] : []);
        setAssignedClasses(classes);

        const subjects =
          userProfile.assignedSubjects && Array.isArray(userProfile.assignedSubjects) && userProfile.assignedSubjects.length > 0
            ? userProfile.assignedSubjects
            : [];
        setAssignedSubjects(subjects);
      }
      setIsTeacherSetupDone(true);
    } else {
      setIsTeacherSetupDone(true);
    }

    subscribeToResults();

    return () => {
      if (unsubExams) unsubExams();
      if (unsubSummary) unsubSummary();
      if (unsubResults) unsubResults();
    };
  }, [user, userRole, userProfile, isAuthenticated, authLoading]);

  useEffect(() => {
    if (status) {
      // Data is auto-updated via onSnapshot, so we don't need a manual fetch command
      const timer = setTimeout(() => setStatus(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const allowedClasses =
    userRole === "admin" ? DEFAULT_CLASSES : assignedClasses;

  // Derive Summary Card Stats
  const stats = useMemo(() => {
    const studentIds = new Set(data.map((r) => r.studentId));
    const exams = new Set(data.map((r) => r.examType));
    const activeClasses = new Set(data.map((r) => String(r.class)));

    const pendingClasses = DEFAULT_CLASSES.length - activeClasses.size;

    return {
      totalStudents: studentIds.size,
      examsUploaded: exams.size,
      classesWithResults: activeClasses.size,
      pendingClasses: pendingClasses > 0 ? pendingClasses : 0,
    };
  }, [data]);

  return (
    <div className="flex flex-col gap-6">
      {status && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-sm font-bold shadow-sm ${status.type === "success" ? "bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]" : "bg-red-50 text-red-700 border border-red-200"}`}
        >
          <div className="flex items-center gap-2">
            {status.type === "success" ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            {status.message}
          </div>
        </div>
      )}

      {/* Top Summary Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-2">
            <Users className="w-5 h-5" />
          </div>
          <p className="text-gray-500 font-bold text-xs uppercase tracking-widest">
            Total Students
          </p>
          <h3 className="text-3xl font-black text-gray-800">
            {stats.totalStudents}
          </h3>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 mb-2">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <p className="text-gray-500 font-bold text-xs uppercase tracking-widest">
            Exams Uploaded
          </p>
          <h3 className="text-3xl font-black text-gray-800">
            {stats.examsUploaded}
          </h3>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mb-2">
            <Folder className="w-5 h-5" />
          </div>
          <p className="text-gray-500 font-bold text-xs uppercase tracking-widest">
            Classes Configured
          </p>
          <h3 className="text-3xl font-black text-gray-800">
            {stats.classesWithResults}
          </h3>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-600 mb-2">
            <AlertCircle className="w-5 h-5" />
          </div>
          <p className="text-gray-500 font-bold text-xs uppercase tracking-widest">
            Pending Classes
          </p>
          <h3 className="text-3xl font-black text-gray-800">
            {stats.pendingClasses}
          </h3>
        </div>
      </div>



      {/* Clean Non-Redundant Navigation Bar */}
      <div className="flex overflow-x-auto bg-white rounded-xl border border-gray-200 p-2 gap-2 shadow-sm font-bold scrollbar-hide">
        <button
          onClick={() => handleRequestTabSwitch("hub", "Result Workflows")}
          className={`flex-shrink-0 px-5 py-2.5 rounded-lg flex items-center gap-2 text-sm transition-colors ${activeTab === "hub" || activeTab === "prep" || activeTab === "manual" ? "bg-[var(--primary)] text-white shadow-sm" : "bg-transparent text-gray-600 hover:bg-gray-100"}`}
        >
          <GraduationCap className="w-4 h-4" /> Result Workflows
        </button>
        <button
          onClick={() => handleRequestTabSwitch("history", "Published Results & Reports")}
          className={`flex-shrink-0 px-5 py-2.5 rounded-lg flex items-center gap-2 text-sm transition-colors ${activeTab === "history" ? "bg-[var(--primary)] text-white shadow-sm" : "bg-transparent text-gray-600 hover:bg-gray-100"}`}
        >
          <BookOpen className="w-4 h-4" /> Published Results &amp; Reports
        </button>
        <button
          onClick={() => handleRequestTabSwitch("student_result", "Individual Student Result")}
          className={`flex-shrink-0 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${activeTab === "student_result" ? "bg-[var(--primary)] text-white shadow-md" : "bg-transparent text-gray-600 hover:opacity-90"}`}
        >
          <User className="w-4 h-4" /> Individual Student Result
        </button>
        {userRole === "admin" && (
          <button
            onClick={() => handleRequestTabSwitch("enquiries", "Web Enquiries")}
            className={`flex-shrink-0 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${activeTab === "enquiries" ? "bg-[var(--primary)] text-white shadow-md" : "bg-transparent text-gray-600 hover:opacity-90"}`}
          >
            <Inbox className="w-4 h-4" /> Web Enquiries
          </button>
        )}
        {userRole === "admin" && (
          <button
            onClick={() => handleRequestTabSwitch("audit_logs", "Audit Logs")}
            className={`flex-shrink-0 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${activeTab === "audit_logs" ? "bg-[var(--primary)] text-white shadow-md" : "bg-transparent text-gray-600 hover:opacity-90"}`}
          >
            <ShieldCheck className="w-4 h-4" /> Audit Logs
          </button>
        )}
        {userRole === "admin" && (
          <button
            onClick={() => handleRequestTabSwitch("custom_subjects", "Custom Subjects")}
            className={`flex-shrink-0 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${activeTab === "custom_subjects" ? "bg-[var(--primary)] text-white shadow-md" : "bg-transparent text-gray-600 hover:opacity-90"}`}
          >
            <BookMarked className="w-4 h-4" /> Custom Subjects
          </button>
        )}
        {userRole === "admin" && (
          <button
            onClick={() => handleRequestTabSwitch("promotion", "Academic Promotion")}
            className={`flex-shrink-0 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${activeTab === "promotion" ? "bg-[var(--primary)] text-white shadow-md" : "bg-transparent text-gray-600 hover:opacity-90"}`}
          >
            <GraduationCap className="w-4 h-4" /> Academic Promotion
          </button>
        )}
        {userRole === "admin" && (
          <button
            onClick={() => handleRequestTabSwitch("template_designer", "Template Designer")}
            className={`flex-shrink-0 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${activeTab === "template_designer" ? "bg-[var(--primary)] text-white shadow-md" : "bg-transparent text-gray-600 hover:opacity-90"}`}
          >
            <Layout className="w-4 h-4" /> Template Designer
          </button>
        )}
        {userRole === "admin" && (
          <button
            onClick={() => handleRequestTabSwitch("academic_years", "Academic Years")}
            className={`flex-shrink-0 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${activeTab === "academic_years" ? "bg-[var(--primary)] text-white shadow-md" : "bg-transparent text-gray-600 hover:opacity-90"}`}
          >
            <Calendar className="w-4 h-4" /> Academic Years
          </button>
        )}
      </div>

      {/* Tab Contents */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-h-[500px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 text-gray-400">
            <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary" />
            <p className="font-bold">Loading Academic Data...</p>
          </div>
        ) : (
          <>
            {activeTab === "hub" && (
              <div className="max-w-4xl mx-auto py-6 space-y-6">
                <div className="text-center space-y-1.5">
                  <h2 className="text-2xl font-black text-slate-900">
                    Choose Result Management Workflow
                  </h2>
                  <p className="text-sm text-slate-600">
                    Select one of two strictly separated workflows for Shikshantar Academy (Play Group – Grade 10, Nepal CDC / NEB 35% Standard).
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <button
                    type="button"
                    onClick={() => setActiveTab("prep")}
                    className="text-left group rounded-2xl p-6 border-2 border-slate-200 hover:border-indigo-600 bg-white hover:bg-indigo-50/30 transition-all shadow-xs flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-100 text-indigo-800">
                          Connected Workflow
                        </span>
                        <GraduationCap className="w-6 h-6 text-indigo-600" />
                      </div>
                      <h3 className="text-lg font-black text-slate-900">
                        Examination Management
                      </h3>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Guided 4-step exam setup, independent TH/PR configuration, Subject Teacher scoped entry &amp; submission, Admin subject review / correction requests, explicit exam approval, and official publication.
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 group-hover:translate-x-0.5 transition-transform">
                      Open Connected Examination Management <ArrowRight className="w-4 h-4" />
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("manual")}
                    className="text-left group rounded-2xl p-6 border-2 border-slate-200 hover:border-emerald-600 bg-white hover:bg-emerald-50/30 transition-all shadow-xs flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800">
                          Standalone Workflow
                        </span>
                        <Edit2 className="w-6 h-6 text-emerald-600" />
                      </div>
                      <h3 className="text-lg font-black text-slate-900">
                        Direct Manual Entry
                      </h3>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Independent direct spreadsheet for Admin or Class Teacher. Auto-loads base &amp; approved custom subjects without Shared Setup, supports Save Draft, Submit, Admin Approve, and Publish.
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 group-hover:translate-x-0.5 transition-transform">
                      Open Standalone Direct Manual Entry <ArrowRight className="w-4 h-4" />
                    </span>
                  </button>
                </div>
              </div>
            )}
            {activeTab === "prep" && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <button
                    type="button"
                    onClick={() =>
                      requestGuardedAction("Result Workflows", () => {
                        setShowSharedSetup(false);
                        setSharedSetupDirty(false);
                        setWorkflowGuard(null);
                        setActiveTab("hub");
                      })
                    }
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 border border-slate-200 transition-colors"
                  >
                    &larr; Back to Workflows
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-500 hidden sm:inline">
                      Connected Examination Management
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (showSharedSetup && sharedSetupDirty) {
                          setPendingExitNav({
                            targetDestination: "Examinations & Progress Monitoring",
                            workflowName: "New Examination Setup Wizard",
                            contextSummary: "Unsaved 4-step examination setup configuration",
                            hasUnsavedChanges: true,
                            canSaveDraft: false,
                            execute: () => {
                              setShowSharedSetup(false);
                              setSharedSetupDirty(false);
                            },
                          });
                        } else {
                          setShowSharedSetup((prev) => !prev);
                        }
                      }}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                        showSharedSetup
                          ? "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200"
                          : "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 shadow-xs"
                      }`}
                    >
                      {showSharedSetup ? "Close New Exam Setup" : "+ Initialize New Exam"}
                    </button>
                  </div>
                </div>
                {showSharedSetup && (
                  <SharedExamSetup
                    allClasses={DEFAULT_CLASSES}
                    userRole={userRole as "admin" | "teacher" | "student"}
                    initialContext={sharedExamContext}
                    onContextChange={(ctx: SharedExamSetupContext) => setSharedExamContext(ctx)}
                    onDirtyChange={setSharedSetupDirty}
                  />
                )}
                <ResultPreparationTab
                  EXAM_TYPES={EXAM_TYPES}
                  allClasses={DEFAULT_CLASSES}
                  data={data}
                  setStatus={setStatus}
                  userRole={userRole as "admin" | "teacher" | "student"}
                  assignedClasses={assignedClasses}
                  assignedSubjects={assignedSubjects}
                  teacherProfile={teacherProfile}
                  initialContext={sharedExamContext}
                  onOpenNewSetup={() => setShowSharedSetup(true)}
                  onExamOpened={() => {
                    setShowSharedSetup(false);
                    setSharedSetupDirty(false);
                  }}
                  onWorkflowGuardChange={handleWorkflowGuardChange}
                />
              </div>
            )}
            {activeTab === "manual" && (
              <div className="space-y-6">
                <ManualEntryTab
                  EXAM_TYPES={EXAM_TYPES}
                  allClasses={DEFAULT_CLASSES}
                  allSubjects={SUBJECTS}
                  data={data}
                  setStatus={setStatus}
                  userRole={userRole}
                  assignedClasses={assignedClasses}
                  assignedSubjects={assignedSubjects}
                  teacherProfile={teacherProfile}
                  onBackToPrep={() => {
                    setWorkflowGuard(null);
                    setActiveTab("hub");
                  }}
                  onWorkflowGuardChange={handleWorkflowGuardChange}
                />
              </div>
            )}
            {activeTab === "history" && (
              <ViewManageTab
                EXAM_TYPES={dynamicExamTypes}
                allClasses={DEFAULT_CLASSES}
                data={data}
                setStatus={setStatus}
                userRole={userRole}
                assignedClasses={assignedClasses}
                teacherProfile={teacherProfile}
              />
            )}
            {activeTab === "student_result" && (
              <IndividualStudentResultTab
                data={data}
                allClasses={DEFAULT_CLASSES}
                dynamicExamTypes={dynamicExamTypes}
                userRole={userRole}
                assignedClasses={assignedClasses}
                teacherProfile={teacherProfile}
              />
            )}
            {activeTab === "enquiries" && userRole === "admin" && <EnquiriesTab />}
            {activeTab === "audit_logs" && userRole === "admin" && <AuditLogsTab />}
            {activeTab === "custom_subjects" && userRole === "admin" && (
              <CustomSubjectsTab
                allClasses={DEFAULT_CLASSES}
                setStatus={setStatus}
                userRole={userRole}
              />
            )}
            {activeTab === "promotion" && userRole === "admin" && (
              <AcademicPromotionTab
                allClasses={DEFAULT_CLASSES}
                setStatus={setStatus}
                userRole={userRole}
              />
            )}
            {activeTab === "template_designer" && userRole === "admin" && (
              <ResultTemplateDesigner
                setStatus={setStatus}
                userRole={userRole}
              />
            )}
            {activeTab === "academic_years" && userRole === "admin" && (
              <AcademicYearManagementTab
                setStatus={setStatus}
                userRole={userRole}
              />
            )}
          </>
        )}
      </div>
      {/* Result Workflow Exit Confirmation Modal */}
      <WorkflowExitConfirmModal
        isOpen={Boolean(pendingExitNav)}
        workflowName={pendingExitNav?.workflowName || "Result Management Workflow"}
        contextSummary={pendingExitNav?.contextSummary}
        targetDestination={pendingExitNav?.targetDestination}
        hasUnsavedChanges={Boolean(pendingExitNav?.hasUnsavedChanges)}
        canSaveDraft={Boolean(pendingExitNav?.canSaveDraft && pendingExitNav?.saveDraft)}
        isSavingDraft={isSavingBeforeExit}
        onStay={() => setPendingExitNav(null)}
        onSaveAndLeave={async () => {
          const pending = pendingExitNav;
          if (!pending?.saveDraft) return;
          setIsSavingBeforeExit(true);
          try {
            const ok = await pending.saveDraft();
            if (ok) {
              setPendingExitNav(null);
              pending.execute();
            }
          } finally {
            setIsSavingBeforeExit(false);
          }
        }}
        onConfirmExit={() => {
          const pending = pendingExitNav;
          setPendingExitNav(null);
          pending?.execute();
        }}
      />
    </div>
  );
}
