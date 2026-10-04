import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { auth, db, handleFirestoreError, OperationType } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  getDocs,
  onSnapshot,
  getDoc,
  doc,
} from "firebase/firestore";
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
  Upload,
  CheckCircle,
  TrendingUp,
  DollarSign,
  Inbox,
  ShieldCheck,
  GraduationCap,
  BookMarked,
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

import { UploadTab } from "../components/admin/UploadTab";
import { ManualEntryTab } from "../components/admin/ManualEntryTab";
import { ViewManageTab } from "../components/admin/ViewManageTab";
import { IndividualStudentResultTab } from "../components/admin/IndividualStudentResultTab";
import { ResultPreparationTab } from "../components/admin/ResultPreparationTab";
import { EnquiriesTab } from "../components/admin/EnquiriesTab";
import { AuditLogsTab } from "../components/admin/AuditLogsTab";
import { CustomSubjectsTab } from "../components/admin/CustomSubjectsTab";
import { AcademicPromotionTab } from "../components/admin/AcademicPromotionTab";

import { StudentResult } from "../data/resultsState";

const EXAM_TYPES = [
  "First Terminal Examination",
  "Second Terminal Examination",
  "Third Terminal Examination",
  "Final Examination",
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
  const [activeTab, setActiveTab] = useState(() => {
    return searchParams.get("tab") || "manual";
  });

  // Listen to search params changes
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const [data, setData] = useState<StudentResult[]>([]);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Role & Teacher restrictions
  const [userRole, setUserRole] = useState<"admin" | "teacher" | "student">(
    "admin",
  );
  const [teacherProfile, setTeacherProfile] = useState<any>(null);
  const [isTeacherSetupDone, setIsTeacherSetupDone] = useState(false);
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);
  const [assignedSubjects, setAssignedSubjects] = useState<string[]>([]);

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

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubExams) unsubExams();
      if (unsubSummary) unsubSummary();
      if (unsubResults) unsubResults();

      if (user) {
        const storedRole = localStorage.getItem("userRole") || "admin";
        setUserRole(storedRole as any);

        if (storedRole === "teacher") {
          // Fetch assigned classes & subjects from Firestore
          try {
            const uDoc = await getDoc(doc(db, "users", user.uid));
            if (uDoc.exists()) {
              const uData = uDoc.data();
              setTeacherProfile(uData);
              
              // Load assigned classes (fallback to .class if assignedClasses array is empty)
              const classes = uData.assignedClasses && Array.isArray(uData.assignedClasses) && uData.assignedClasses.length > 0
                ? uData.assignedClasses 
                : (uData.class ? [uData.class] : []);
              setAssignedClasses(classes);
              
              // Load assigned subjects (fallback to teacherSubjects from localStorage if empty)
              const subjects = uData.assignedSubjects && Array.isArray(uData.assignedSubjects) && uData.assignedSubjects.length > 0
                ? uData.assignedSubjects 
                : JSON.parse(localStorage.getItem("teacherSubjects") || "[]");
              setAssignedSubjects(subjects);
              
              setIsTeacherSetupDone(true);
            } else {
              setIsTeacherSetupDone(true);
            }
          } catch (e) {
            console.error("Failed to fetch teacher profile:", e);
            setIsTeacherSetupDone(true);
          }
        } else {
          setIsTeacherSetupDone(true);
        }

        subscribeToResults();
      } else {
        if (unsubExams) unsubExams();
        if (unsubSummary) unsubSummary();
        if (unsubResults) unsubResults();
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubExams) unsubExams();
      if (unsubSummary) unsubSummary();
      if (unsubResults) unsubResults();
    };
  }, []);

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



      {/* Tabs Header */}
      <div className="flex overflow-x-auto bg-white rounded-xl border border-gray-200 p-2 gap-2 shadow-sm font-bold scrollbar-hide">
        <button
          onClick={() => setActiveTab("prep")}
          className={`flex-shrink-0 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${activeTab === "prep" ? "bg-[var(--primary)] text-white shadow-md" : "bg-transparent text-gray-600 hover:opacity-90"}`}
        >
          <GraduationCap className="w-4 h-4" /> Result Preparation
        </button>
        <button
          onClick={() => setActiveTab("manual")}
          className={`flex-shrink-0 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${activeTab === "manual" ? "bg-[var(--primary)] text-white shadow-md" : "bg-transparent text-gray-600 hover:opacity-90"}`}
        >
          <Edit2 className="w-4 h-4" /> Manual Entry
        </button>
        <button
          onClick={() => setActiveTab("upload")}
          className={`flex-shrink-0 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${activeTab === "upload" ? "bg-[var(--primary)] text-white shadow-md" : "bg-transparent text-gray-600 hover:opacity-90"}`}
        >
          <Upload className="w-4 h-4" /> Excel Upload
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-shrink-0 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${activeTab === "history" ? "bg-[var(--primary)] text-white shadow-md" : "bg-transparent text-gray-600 hover:opacity-90"}`}
        >
          <BookOpen className="w-4 h-4" /> Published Results & Reports
        </button>
        <button
          onClick={() => setActiveTab("student_result")}
          className={`flex-shrink-0 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${activeTab === "student_result" ? "bg-[var(--primary)] text-white shadow-md" : "bg-transparent text-gray-600 hover:opacity-90"}`}
        >
          <User className="w-4 h-4" /> Individual Student Result
        </button>
        {userRole === "admin" && (
          <button
            onClick={() => setActiveTab("enquiries")}
            className={`flex-shrink-0 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${activeTab === "enquiries" ? "bg-[var(--primary)] text-white shadow-md" : "bg-transparent text-gray-600 hover:opacity-90"}`}
          >
            <Inbox className="w-4 h-4" /> Web Enquiries
          </button>
        )}
        {userRole === "admin" && (
          <button
            onClick={() => setActiveTab("audit_logs")}
            className={`flex-shrink-0 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${activeTab === "audit_logs" ? "bg-[var(--primary)] text-white shadow-md" : "bg-transparent text-gray-600 hover:opacity-90"}`}
          >
            <ShieldCheck className="w-4 h-4" /> Audit Logs
          </button>
        )}
        {userRole === "admin" && (
          <button
            onClick={() => setActiveTab("custom_subjects")}
            className={`flex-shrink-0 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${activeTab === "custom_subjects" ? "bg-[var(--primary)] text-white shadow-md" : "bg-transparent text-gray-600 hover:opacity-90"}`}
          >
            <BookMarked className="w-4 h-4" /> Custom Subjects
          </button>
        )}
        {userRole === "admin" && (
          <button
            onClick={() => setActiveTab("promotion")}
            className={`flex-shrink-0 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${activeTab === "promotion" ? "bg-[var(--primary)] text-white shadow-md" : "bg-transparent text-gray-600 hover:opacity-90"}`}
          >
            <GraduationCap className="w-4 h-4" /> Academic Promotion
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
            {activeTab === "prep" && (
              <ResultPreparationTab
                EXAM_TYPES={EXAM_TYPES}
                allClasses={DEFAULT_CLASSES}
                data={data}
                setStatus={setStatus}
                userRole={userRole}
                assignedClasses={assignedClasses}
                assignedSubjects={assignedSubjects}
                teacherProfile={teacherProfile}
              />
            )}
            {activeTab === "upload" && (
              <UploadTab
                EXAM_TYPES={EXAM_TYPES}
                allClasses={DEFAULT_CLASSES}
                data={data}
                setStatus={setStatus}
                userRole={userRole}
                assignedClasses={assignedClasses}
                assignedSubjects={assignedSubjects}
                teacherProfile={teacherProfile}
              />
            )}
            {activeTab === "manual" && (
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
              />
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
          </>
        )}
      </div>
    </div>
  );
}
