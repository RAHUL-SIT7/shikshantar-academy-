import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { auth, db, handleFirestoreError, OperationType } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, writeBatch, serverTimestamp, onSnapshot, query, where, getDoc, setDoc, getDocs, deleteField } from 'firebase/firestore';
import { 
  Search, 
  Loader2, 
  Plus, 
  X, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Printer, 
  Clock, 
  Banknote, 
  Check, 
  RotateCcw, 
  Calendar, 
  ShieldAlert, 
  ShieldCheck, 
  RefreshCw, 
  AlertTriangle, 
  Ban,
  CalendarRange,
  Users,
  XCircle,
  ArrowRight,
  Wallet
} from 'lucide-react';
import { formatBSDate, getBSYearMonthDate } from '../../lib/nepaliDate';
import { formatRemitBillItems } from '../../lib/remitBillUtils';
const logoImage = "/logo.png";
import {
  NEPALI_MONTH_SEQUENCE,
  normalizeNepaliMonth,
  getNepaliMonthIndex,
  calculateNepaliBillingPeriod,
  extractCoveredMonthsFromBill,
  getStudentYearCoverage,
  analyzePeriodCoverage,
  getBillingCoverage,
  BillingCoverageResult,
  calculateBillingGenerationPlan,
  BillingGenerationPlan,
  SingleChargeItemPlan,
  StudentBillingPlan,
  hasAnnualFeeBeenBilled,
  NepaliMonthIdMapping,
  mapDurationToNepaliMonthIds
} from '../../lib/nepaliBillingCoverage';
import {
  verifyRequestedMonthsInFirestore,
  attachBillItemsToBatch,
  FirestoreBillingVerificationResult,
  BillItem
} from '../../lib/firestoreBillVerification';
import { generateSingleStudentBillTransactionally, releaseBillUniquenessLocks } from '../../lib/atomicBillingTransactionEngine';
import { executeCashFeePayment, parseMonthsFromBillingPeriod } from '../../lib/cashPaymentEngine';
import { sanitizeForFirestore, validateRemitBillPayload } from '../../lib/firestoreSanitize';
import { allocateBatchDocumentNumbers, allocateNextDocumentNumber } from '../../lib/documentNumberingEngine';
import AcademicYearBillingMatrix from './AcademicYearBillingMatrix';
import BillingCoveragePreview from './BillingCoveragePreview';
import VoidRemitBillModal from './VoidRemitBillModal';
import AuthorizedOverrideModal from './AuthorizedOverrideModal';
import { BillingCoverageReconciliationModal } from './BillingCoverageReconciliationModal';

const MONTHS = ['Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];

interface StudentChargeItem {
  name: string;
  rate: number;
  months: number;
  total: number;
}

interface RemitBill {
  id: string;
  billNo: string;
  studentId: string;
  studentName: string;
  studentRoll?: string;
  class: string;
  billingPeriod: string;
  periodMonths: number;
  coveredMonths?: string[];
  academicYear?: string;
  itemizedCharges: StudentChargeItem[];
  billItems?: BillItem[];
  totalAmount: number;
  status: 'pending' | 'paid' | 'partial' | 'void' | 'cancelled';
  createdAt: string;
  createdBy: string;
  paidAmount?: number;
  transactionId?: string;
  paidAt?: string;
  guardianName?: string;
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: string;
  reissuedFromBillNo?: string;
  reissuedToBillNo?: string;
}

function getMonthsCovered(billingPeriod: string): string[] {
  if (!billingPeriod) return [];
  const MONTHS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
  
  // Find all standard month names mentioned in the text
  const foundMonths: { month: string; index: number }[] = [];
  MONTHS.forEach(m => {
    const idx = billingPeriod.indexOf(m);
    if (idx !== -1) {
      foundMonths.push({ month: m, index: idx });
    }
  });
  
  // Sort by order of occurrence in the string to identify start and end accurately
  foundMonths.sort((a, b) => a.index - b.index);

  if (foundMonths.length === 1) {
    return [foundMonths[0].month];
  } else if (foundMonths.length >= 2) {
    const startM = foundMonths[0].month;
    const endM = foundMonths[foundMonths.length - 1].month;
    const startIdx = MONTHS.indexOf(startM);
    const endIdx = MONTHS.indexOf(endM);
    if (startIdx !== -1 && endIdx !== -1) {
      if (startIdx <= endIdx) {
        return MONTHS.slice(startIdx, endIdx + 1);
      } else {
        // Wrap-around
        return [...MONTHS.slice(startIdx), ...MONTHS.slice(0, endIdx + 1)];
      }
    }
  }
  
  // Fallback
  const covered: string[] = [];
  MONTHS.forEach(m => {
    if (billingPeriod.includes(m)) {
      covered.push(m);
    }
  });
  return covered;
}

function matchesMonthFilter(billingPeriod: string, startF: string, endF: string): boolean {
  if (startF === 'all' && endF === 'all') return true;
  
  const covered = getMonthsCovered(billingPeriod);
  if (covered.length === 0) return true; // Fallback so we don't block un-parseable periods

  const billStart = covered[0];
  const billEnd = covered[covered.length - 1];

  if (startF !== 'all' && endF === 'all') {
    return billStart === startF;
  }
  if (startF === 'all' && endF !== 'all') {
    return billEnd === endF;
  }

  // Both are set - both must be exact
  return billStart === startF && billEnd === endF;
}

// Strict digit-only keyboard interception helper
const handleDigitsOnlyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  // Allow control keys: Backspace, Tab, Enter, Escape, ArrowLeft, ArrowRight, Delete, Home, End
  const allowedKeys = ['Backspace', 'Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'Delete', 'Home', 'End'];
  if (allowedKeys.includes(e.key)) return;
  
  // Allow keyboard shortcuts (Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, Cmd+A, etc.)
  if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x', 'z'].includes(e.key.toLowerCase())) return;
  
  // Only allow digits 0-9 (prevent 'e', 'E', '+', '-', '.', and any letter/symbol)
  if (!/^[0-9]$/.test(e.key)) {
    e.preventDefault();
  }
};

const sanitizeDigitsOnly = (val: string): string => {
  return val.replace(/\D/g, '');
};

export default function RemitBillsGeneratorTab({ 
  students, 
  onRefresh, 
  onCollectGuardianCash 
}: { 
  students: any[]; 
  onRefresh: () => void; 
  onCollectGuardianCash?: (prefill: any) => void;
}) {
  const [activeSubTab, setActiveSubTab] = useState<'generate' | 'list' | 'matrix'>('generate');
  const [remitBills, setRemitBills] = useState<RemitBill[]>([]);
  const [loading, setLoading] = useState(true);

  // Void and Reissue state
  const [voidingBill, setVoidingBill] = useState<RemitBill | null>(null);
  const [reissueContext, setReissueContext] = useState<{ fromBillNo: string; studentName: string } | null>(null);
  const [boundaryWarning, setBoundaryWarning] = useState<string | null>(null);
  const [showReconciliationModal, setShowReconciliationModal] = useState(false);
  const [reconcileStudentId, setReconcileStudentId] = useState<string>('');

  // Generator form states
  const [selectedClass, setSelectedClass] = useState('');
  const [generationMode, setGenerationMode] = useState<'class' | 'student'>('class');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [periodMonths, setPeriodMonths] = useState<number>(3); // Default 3 Months
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [periodText, setPeriodText] = useState('');
  
  // Scholarship editing inside Remit Generator
  const [editingScholarshipStatus, setEditingScholarshipStatus] = useState<'Provided' | 'Not Provided'>('Not Provided');
  const [editingScholarshipAmount, setEditingScholarshipAmount] = useState<string>('0');
  const [editingScholarshipDesc, setEditingScholarshipDesc] = useState<string>('');
  const [savingScholarship, setSavingScholarship] = useState(false);

  // Sync scholarship states with selected student
  useEffect(() => {
    if (selectedStudentId) {
      const found = students.find(s => s.id === selectedStudentId);
      if (found) {
        setEditingScholarshipStatus(found.scholarshipStatus === 'Provided' ? 'Provided' : 'Not Provided');
        setEditingScholarshipAmount(String(found.scholarshipAmount || 0));
        setEditingScholarshipDesc(found.scholarshipDescription || found.scholarshipStatus === 'Provided' ? (found.scholarshipDescription || 'General') : '');
      }
    } else {
      setEditingScholarshipStatus('Not Provided');
      setEditingScholarshipAmount('0');
      setEditingScholarshipDesc('');
    }
  }, [selectedStudentId, selectedClass, students]);

  // Dynamic logged-in Administrator / Accountant identity
  const [adminName, setAdminName] = useState<string>('Rahul Sah (Accountant)');

  const formatIssuedBy = (name?: string): string => {
    if (!name || name.trim() === '' || name.toLowerCase() === 'counter desk' || name.toLowerCase() === 'administrator') {
      return adminName || 'Rahul Sah (Accountant)';
    }
    const trimmed = name.trim();
    // If it already contains a parenthesized title like "(Accountant)" or "(Admin)", keep it
    if (/\([A-Za-z\s]+\)$/.test(trimmed)) {
      return trimmed;
    }
    // Clean up casing and append (Accountant) as standard desk designation
    if (trimmed.toLowerCase() === 'rahul sah' || trimmed.toLowerCase() === 'rahul') {
      return 'Rahul Sah (Accountant)';
    }
    const capitalized = trimmed
      .split(' ')
      .map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
      .join(' ');
    return `${capitalized} (Accountant)`;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAdminName('Rahul Sah (Accountant)');
        return;
      }
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const uData = userDoc.data();
          const rawName = uData.fullName || uData.name || user.displayName || '';
          const designation = uData.designation || uData.position || (uData.role === 'admin' ? 'Accountant' : (uData.role ? uData.role.charAt(0).toUpperCase() + uData.role.slice(1) : 'Accountant'));
          
          if (rawName && rawName.trim() && rawName !== 'User') {
            const cleanName = rawName
              .trim()
              .split(' ')
              .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
              .join(' ');
            setAdminName(`${cleanName} (${designation})`);
            return;
          }
        }
      } catch (e) {
        console.warn('Could not fetch user doc for adminName:', e);
      }
      
      let baseName = '';
      if (user.displayName && user.displayName.trim()) {
        baseName = user.displayName.trim();
      } else if (user.email) {
        const username = user.email.split('@')[0];
        baseName = username
          .replace(/[0-9._-]+/g, ' ')
          .trim()
          .split(' ')
          .filter(Boolean)
          .map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
          .join(' ');
      }
      if (!baseName) baseName = 'Rahul Sah';
      setAdminName(`${baseName} (Accountant)`);
    });
    return () => unsubscribe();
  }, []);

  const handleSaveStudentScholarship = async () => {
    if (!selectedStudentId) return;
    setSavingScholarship(true);
    try {
      const studentRef = doc(db, 'users', selectedStudentId);
      await setDoc(studentRef, {
        scholarshipStatus: editingScholarshipStatus,
        scholarshipAmount: Number(editingScholarshipAmount) || 0,
        scholarshipDescription: editingScholarshipDesc
      }, { merge: true });
      
      if (onRefresh) {
        onRefresh();
      }
      alert('Student scholarship configuration saved successfully!');
    } catch (error: any) {
      console.error("Failed to update scholarship:", error);
      alert('Failed to save scholarship: ' + (error.message || error));
    } finally {
      setSavingScholarship(false);
    }
  };
  
  // Fee toggles & custom charges
  const [includeTuition, setIncludeTuition] = useState(true);
  const [includeTransport, setIncludeTransport] = useState(true);
  const [includeComputer, setIncludeComputer] = useState(true);
  const [includeAcademy, setIncludeAcademy] = useState(true);
  const [includeAnnual, setIncludeAnnual] = useState(false);
  const [includeAdmission, setIncludeAdmission] = useState(false);
  const [includeExam, setIncludeExam] = useState(false);
  const [academyFeeRate, setAcademyFeeRate] = useState('300'); // Default per month or flat
  const [transportMultiplier, setTransportMultiplier] = useState<number>(3);
  const [computerMultiplier, setComputerMultiplier] = useState<number>(3);

  // Sync multipliers with periodMonths on change
  useEffect(() => {
    setTransportMultiplier(periodMonths);
    setComputerMultiplier(periodMonths);
  }, [periodMonths]);

  const [customChargesList, setCustomChargesList] = useState<Array<{ id: string, name: string, amount: string, isMonthly: boolean }>>([]);
  const [newCustomChargeName, setNewCustomChargeName] = useState('');
  const [newCustomChargeAmount, setNewCustomChargeAmount] = useState('');
  const [newCustomChargeIsMonthly, setNewCustomChargeIsMonthly] = useState(false);

  // Filter states
  const [filterClass, setFilterClass] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStartMonth, setFilterStartMonth] = useState('all');
  const [filterEndMonth, setFilterEndMonth] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [bundleLayout, setBundleLayout] = useState<'one_per_page' | 'two_per_page'>('one_per_page');

  // Action modals states
  const [printingBill, setPrintingBill] = useState<RemitBill | null>(null);
  const [payingBill, setPayingBill] = useState<RemitBill | null>(null);

  // Close payingBill modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && payingBill) {
        setPayingBill(null);
        setCashReceived('');
        setPaymentRemarks('');
        setIsSignVerified(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [payingBill]);
  const [billToDelete, setBillToDelete] = useState<RemitBill | null>(null);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [settleMode, setSettleMode] = useState<'current' | 'all'>('current');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [paymentRemarks, setPaymentRemarks] = useState('');
  const [isSignVerified, setIsSignVerified] = useState(false);
  const [paymentPreset, setPaymentPreset] = useState<'full' | 'one_month' | 'custom'>('full');
  const [excessDecision, setExcessDecision] = useState<'ADVANCE' | 'RETURN'>('ADVANCE');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [generating, setGenerating] = useState(false);
  const [forceGenerate, setForceGenerate] = useState(false);

  // Exception and student exclusion management for bulk bill generation
  const [excludedStudentIds, setExcludedStudentIds] = useState<string[]>([]);
  const [showExceptionManager, setShowExceptionManager] = useState(false);

  // Reset student exclusions whenever selected class changes
  useEffect(() => {
    setExcludedStudentIds([]);
  }, [selectedClass]);

  const [feeStructure, setFeeStructure] = useState<any>(null);

  // Subscribe to standard fee structure settings
  useEffect(() => {
    const unsubFee = onSnapshot(doc(db, 'settings', 'fee_structure'), (docSnap) => {
      if (docSnap.exists()) {
        setFeeStructure(docSnap.data());
      }
    });
    return () => unsubFee();
  }, []);

  const getClassFees = (cls: string) => {
    const normalize = (name: string) => 
      (name || '').toLowerCase().replace(/^class\s+/, '').replace(/\s+/g, '').trim();
    const target = normalize(cls || selectedClass);

    // 1. Try to fetch from Firestore settings/fee_structure
    if (feeStructure && feeStructure.academic) {
      const row = feeStructure.academic.find((r: any) => normalize(r.className) === target);
      if (row) {
        return {
          tuition: Number(row.tuition || 0),
          computer: Number(row.computer || 0),
          admission: Number(row.admission || 0),
          annual: Number(row.annual || 0),
          exam: Number(row.exam || 0)
        };
      }
    }

    // 2. Fallback to standard official rates, completely removing any generic dummy "1000" fallback
    const DEFAULT_ACADEMIC_RATES: Record<string, { tuition: number; computer: number; admission: number; annual: number; exam: number }> = {
      'playgroup': { tuition: 1500, computer: 0, admission: 2000, annual: 3000, exam: 300 },
      'nursery': { tuition: 1600, computer: 0, admission: 3000, annual: 3000, exam: 300 },
      'lkg': { tuition: 1700, computer: 0, admission: 3000, annual: 3000, exam: 300 },
      'ukg': { tuition: 1800, computer: 0, admission: 3000, annual: 3000, exam: 400 },
      '1': { tuition: 2000, computer: 250, admission: 3500, annual: 3500, exam: 400 },
      '2': { tuition: 2200, computer: 300, admission: 3500, annual: 3500, exam: 450 },
      '3': { tuition: 2400, computer: 300, admission: 3500, annual: 3500, exam: 450 },
      '4': { tuition: 2600, computer: 400, admission: 4000, annual: 3800, exam: 500 },
      '5': { tuition: 2800, computer: 400, admission: 4000, annual: 3800, exam: 500 },
      '6': { tuition: 3000, computer: 450, admission: 4000, annual: 4000, exam: 500 },
      '7': { tuition: 3300, computer: 450, admission: 4000, annual: 4000, exam: 600 },
      '8': { tuition: 3600, computer: 500, admission: 4500, annual: 5000, exam: 600 },
      '9': { tuition: 4000, computer: 500, admission: 4500, annual: 5000, exam: 700 },
      '10': { tuition: 4500, computer: 500, admission: 4500, annual: 5000, exam: 700 },
      'college': { tuition: 4500, computer: 500, admission: 4500, annual: 5000, exam: 700 },
      '11': { tuition: 4500, computer: 500, admission: 4500, annual: 5000, exam: 700 },
      '12': { tuition: 4500, computer: 500, admission: 4500, annual: 5000, exam: 700 }
    };

    const fallback = DEFAULT_ACADEMIC_RATES[target];
    if (fallback) {
      return fallback;
    }

    return { tuition: 1500, computer: 0, admission: 2000, annual: 3000, exam: 300 };
  };

  const getStudentTransportFee = (student: any) => {
    if (student.transportFee !== undefined && Number(student.transportFee) > 0) {
      return Number(student.transportFee);
    }
    if (student.transportRoute) {
      const routeKey = student.transportRoute.toLowerCase().trim();
      if (feeStructure?.transportation) {
        const route = feeStructure.transportation.find(
          (r: any) => r.route?.toLowerCase().trim() === routeKey
        );
        if (route) return Number(route.fee || 0);
      }
      const DEFAULT_TRANSPORT_RATES: Record<string, number> = {
        'badahara mirchaiya': 400,
        'karjanha/bastipur': 400,
        'bagaha/bhulkiya': 400,
        'betaha': 500,
        'thalha': 600,
        'simara/mareba (south)': 600,
        'simara/mareba (north)': 600,
        'manharwa': 600
      };
      const routeFallback = DEFAULT_TRANSPORT_RATES[routeKey];
      if (routeFallback !== undefined) {
        return routeFallback;
      }
    }
    return 0;
  };

  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  // Pre-load school logo as base64 for PDF generation
  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const response = await fetch(logoImage || "/logo.png");
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        setLogoBase64(base64);
      } catch (err) {
        console.error("Error loading logo for PDF", err);
      }
    };
    fetchLogo();
  }, []);

  const classes = ['Play Group', 'Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

  // Load Remit Bills from Firestore
  useEffect(() => {
    let unsubSnapshot: (() => void) | null = null;
    setLoading(true);

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      // Clean up previous snapshot subscription
      if (unsubSnapshot) {
        unsubSnapshot();
        unsubSnapshot = null;
      }

      if (!user) {
        setRemitBills([]);
        setLoading(false);
        return;
      }

      // Read role from state or local storage if authenticated
      let role = user ? localStorage.getItem('userRole') : 'guest';
      
      // Fallback: fetch from users collection
      if (!role) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            role = userDoc.data().role;
          }
        } catch (e) {
          console.warn('Could not read user role from Firestore', e);
        }
      }

      const isAuthorized = role === 'admin';

      if (!isAuthorized) {
        setRemitBills([]);
        setLoading(false);
        return;
      }

      // Only subscribe to snapshot if user is authorized, preventing forbidden errors for students/guests
      unsubSnapshot = onSnapshot(collection(db, 'remitBills'), (snap) => {
        const list: RemitBill[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as RemitBill);
        });
        // Sort by creation or serial descending
        list.sort((a,b) => String(b?.billNo || '').localeCompare(String(a?.billNo || '')));
        setRemitBills(list);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'remitBills');
        setLoading(false);
      });
    });

    return () => {
      unsubAuth();
      if (unsubSnapshot) unsubSnapshot();
    };
  }, []);

  // Current Nepali academic year
  const currentAcademicYear = feeStructure?.academicYear || getBSYearMonthDate().year.toString() || '2083';

  // Automatically clear error notices whenever generator parameters are modified
  useEffect(() => {
    setErrorMsg('');
  }, [
    selectedClass,
    selectedStudentId,
    generationMode,
    startMonth,
    periodMonths,
    currentAcademicYear,
    includeTuition,
    includeTransport,
    includeComputer,
    includeAcademy,
    includeAnnual,
    includeAdmission,
    includeExam,
    academyFeeRate,
    customChargesList,
    excludedStudentIds
  ]);

  // Target period calculation adhering strictly to Nepali calendar sequence & boundaries
  const periodCalc = useMemo(() => {
    return calculateNepaliBillingPeriod(startMonth, periodMonths);
  }, [startMonth, periodMonths]);

  // Target students for generation
  const targetStudentsForGen = useMemo(() => {
    if (!selectedClass) return [];
    const classSts = students.filter(s => (s.class || '').toLowerCase() === selectedClass.toLowerCase());
    if (generationMode === 'student' && selectedStudentId) {
      const one = classSts.find(s => s.id === selectedStudentId);
      return one ? [one] : [];
    }
    return classSts;
  }, [selectedClass, generationMode, selectedStudentId, students]);

  // AUTHORITATIVE SINGLE BILLING GENERATION PLAN ENGINE
  const billingPlan = useMemo<BillingGenerationPlan>(() => {
    return calculateBillingGenerationPlan({
      students,
      academicYearId: currentAcademicYear,
      targetClass: selectedClass,
      generationMode,
      selectedStudentId,
      startMonth,
      durationMonths: periodMonths,
      remitBills,
      studentFees: [], // Only verified active bills/billItems block duplicate charges
      excludedStudentIds,
      feeSettings: feeStructure,
      selectedFeeCategories: {
        includeTuition,
        includeTransport,
        includeComputer,
        includeAcademy,
        includeAnnual,
        includeAdmission,
        includeExam,
        academyFeeRate,
        customCharges: customChargesList
      }
    });
  }, [
    students,
    currentAcademicYear,
    selectedClass,
    generationMode,
    selectedStudentId,
    startMonth,
    periodMonths,
    remitBills,
    excludedStudentIds,
    feeStructure,
    includeTuition,
    includeTransport,
    includeComputer,
    includeAcademy,
    includeAnnual,
    includeAdmission,
    includeExam,
    academyFeeRate,
    customChargesList
  ]);

  // Backward compatible references mapped to single authoritative engine
  const pupilCoverageList = billingPlan.studentPlans;
  const coverageStats = {
    total: billingPlan.totalSelectedStudents,
    readyFull: billingPlan.completelyUnbilledStudentsCount,
    wisePartial: billingPlan.partiallyCoveredStudentsCount,
    alreadyBilled: billingPlan.fullyCoveredStudentsCount,
    manuallyExcluded: billingPlan.manuallyExcludedStudentsCount,
    billableStudentsCount: billingPlan.billableStudentsCount,
    allAlreadyBilled: billingPlan.totalSelectedStudents > 0 && billingPlan.fullyCoveredStudentsCount === billingPlan.totalSelectedStudents
  };
  const universalCoverage = {
    overallStatus: billingPlan.overallStatus,
    summaryMessage: billingPlan.summaryMessage,
    unbilledStudentsCount: billingPlan.completelyUnbilledStudentsCount,
    partiallyCoveredStudentsCount: billingPlan.partiallyCoveredStudentsCount,
    fullyCoveredStudentsCount: billingPlan.fullyCoveredStudentsCount,
    eligibleChargesCount: billingPlan.totalNewChargeItemsCount
  };
  const coverageAnalysis = {
    totalTargetStudents: billingPlan.totalSelectedStudents,
    monthBreakdown: billingPlan.monthBreakdown
  };

  // State for Authorized Administrative Override
  const [showAuthorizedOverrideModal, setShowAuthorizedOverrideModal] = useState(false);
  const [authorizedOverrideInfo, setAuthorizedOverrideInfo] = useState<{ reason: string; passcode: string } | null>(null);

  // Step 1 of Multi-Step Verification: Map the requested duration (e.g. 3 months starting Baisakh) to specific Nepali month IDs
  const mappedNepaliMonthIds = useMemo(() => {
    if (!startMonth) return [];
    return mapDurationToNepaliMonthIds(startMonth, periodMonths, currentAcademicYear);
  }, [startMonth, periodMonths, currentAcademicYear]);

  // Step 2 of Multi-Step Verification: Firestore 'billItems' verification state
  const [firestoreVerification, setFirestoreVerification] = useState<FirestoreBillingVerificationResult | null>(null);
  const [verifyingFirestore, setVerifyingFirestore] = useState(false);
  const [showConflictDetails, setShowConflictDetails] = useState(false);

  // Trigger manual on-demand re-verification in Firestore
  const triggerFirestoreVerification = async () => {
    if (!startMonth || targetStudentsForGen.length === 0) {
      setFirestoreVerification(null);
      return;
    }
    setVerifyingFirestore(true);
    try {
      const result = await verifyRequestedMonthsInFirestore(
        db,
        targetStudentsForGen,
        startMonth,
        periodMonths,
        currentAcademicYear
      );
      setFirestoreVerification(result);
    } catch (err) {
      console.warn('Manual Firestore billing verification error:', err);
    } finally {
      setVerifyingFirestore(false);
    }
  };

  // Automated background query of Firestore to check for existing 'billItems'
  useEffect(() => {
    if (!startMonth || targetStudentsForGen.length === 0) {
      setFirestoreVerification(null);
      return;
    }

    let isCancelled = false;
    const timer = setTimeout(async () => {
      setVerifyingFirestore(true);
      try {
        const result = await verifyRequestedMonthsInFirestore(
          db,
          targetStudentsForGen,
          startMonth,
          periodMonths,
          currentAcademicYear
        );
        if (!isCancelled) {
          setFirestoreVerification(result);
        }
      } catch (err) {
        console.warn('Background Firestore billing verification error:', err);
      } finally {
        if (!isCancelled) {
          setVerifyingFirestore(false);
        }
      }
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [startMonth, periodMonths, targetStudentsForGen, currentAcademicYear, remitBills]);

  // Update billing period description and boundary warnings when inputs or billingPlan changes
  useEffect(() => {
    if (startMonth) {
      setEndMonth(periodCalc.endMonth);
      setBoundaryWarning(periodCalc.validationMessage || null);
      // Synchronize periodText directly from BillingGenerationPlan's canonical billable heading
      setPeriodText(billingPlan.effectiveBillHeadingPeriodTag || periodCalc.periodText);
    } else {
      setEndMonth('');
      setPeriodText('');
      setBoundaryWarning(null);
    }
  }, [startMonth, periodMonths, billingPlan.effectiveBillHeadingPeriodTag, periodCalc.endMonth, periodCalc.validationMessage, periodCalc.periodText]);

  // Reset selected bill IDs on any filter or sub-tab change to keep state synchronized
  useEffect(() => {
    setSelectedBillIds([]);
  }, [activeSubTab, filterClass, filterStatus, filterStartMonth, filterEndMonth, searchTerm]);

  // Auto-scroll to alert messages when they appear
  useEffect(() => {
    if (errorMsg || successMsg) {
      const container = document.getElementById('remit-bills-alert-container');
      if (container) {
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [errorMsg, successMsg]);

  // Auto-dismiss success message after 15 seconds
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => {
        setSuccessMsg('');
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // Handle month period changes to change default end month helper
  const handlePeriodMonthsChange = (months: number) => {
    setPeriodMonths(months);
  };

  const handleStartMonthChange = (m: string) => {
    setStartMonth(m);
    if (!m) {
      setEndMonth('');
      setPeriodText('');
      setBoundaryWarning(null);
    }
  };

  const handleAutoAdjustUnbilledMonths = (unbilledMonths: string[]) => {
    if (!unbilledMonths || unbilledMonths.length === 0) return;
    const first = unbilledMonths[0];
    setStartMonth(first);
    handlePeriodMonthsChange(unbilledMonths.length);
  };

  const addCustomCharge = () => {
    if (!newCustomChargeName.trim() || !newCustomChargeAmount || isNaN(Number(newCustomChargeAmount))) {
      return;
    }
    setCustomChargesList([
      ...customChargesList,
      {
        id: Date.now().toString(),
        name: newCustomChargeName.trim(),
        amount: newCustomChargeAmount,
        isMonthly: newCustomChargeIsMonthly
      }
    ]);
    setNewCustomChargeName('');
    setNewCustomChargeAmount('');
    setNewCustomChargeIsMonthly(false);
  };

  const removeCustomCharge = (id: string) => {
    setCustomChargesList(customChargesList.filter(c => c.id !== id));
  };

  const getFeeBSYear = (f: any) => {
    if (f.academicYear) return f.academicYear;
    if (f.year) return f.year;
    if (f.createdAt) {
      try {
        const dateVal = new Date(f.createdAt);
        if (!isNaN(dateVal.getTime())) {
          return getBSYearMonthDate(dateVal).year;
        }
      } catch (e) {}
    }
    return feeStructure?.academicYear || '2083';
  };

  // Calculate accumulated arrears / unpaid balances for standard fees and historic remit bills
  const getStudentBackDues = (student: any): number => {
    if (!student) return 0;
    
    // Get the list of months covered by the current bill to prevent double charging of currently-billed months
    const currentBilledMonths = getMonthsCovered(periodText);

    let standardDues = 0;
    if (student.fees && Array.isArray(student.fees)) {
      student.fees.forEach((f: any) => {
        if (f.status === 'due') {
          // Identify if this fee matches a type and month that we are billing in the current bill
          const isTuitionBeingBilled = includeTuition && f.type === 'Tuition Fee' && currentBilledMonths.includes(f.month);
          const isTransportBeingBilled = includeTransport && f.type === 'Transportation Fee' && currentBilledMonths.includes(f.month);
          const isComputerBeingBilled = includeComputer && f.type === 'Computer Fee' && currentBilledMonths.includes(f.month);
          const isAcademyBeingBilled = includeAcademy && f.type === 'Academy Fee' && currentBilledMonths.includes(f.month);
          const isAnnualBeingBilled = includeAnnual && f.type === 'Annual Fee';
          const isAdmissionBeingBilled = includeAdmission && f.type === 'Admission Fee';
          const isExamBeingBilled = includeExam && f.type === 'Terminal Exam Fee';

          const isCurrentlyBilled = isTuitionBeingBilled || isTransportBeingBilled || isComputerBeingBilled || isAcademyBeingBilled || isAnnualBeingBilled || isAdmissionBeingBilled || isExamBeingBilled;

          if (!isCurrentlyBilled) {
            standardDues += Number(f.dueAmount !== undefined ? f.dueAmount : (f.totalFee || 0));
          }
        }
      });
    }

    return standardDues;
  };

  // Preview / Calculate dynamic items for a single student profile
  const computeStudentCharges = (student: any, unbilledMonthsOverride?: string[]): StudentChargeItem[] => {
    const items: StudentChargeItem[] = [];
    const classFees = getClassFees(student.class || selectedClass);
    
    // Determine effective billing months
    const effectiveMonths = unbilledMonthsOverride && unbilledMonthsOverride.length > 0
      ? unbilledMonthsOverride
      : (periodCalc.targetMonths.length > 0 ? periodCalc.targetMonths : [startMonth || 'Baisakh']);
    
    const effectiveCount = effectiveMonths.length;
    
    if (includeTuition) {
      // Use standard tuition rate from fee structure settings
      const rate = classFees.tuition;
      items.push({
        name: 'Monthly Tuition Fee',
        rate,
        months: effectiveCount,
        total: rate * effectiveCount
      });
    }

    if (includeTransport) {
      const hasTransport = student.hasTransportation === 'Yes' || (student.transportRoute && student.transportRoute !== '') || Number(student.transportFee) > 0;
      if (hasTransport) {
        const rate = getStudentTransportFee(student);
        if (rate > 0) {
          items.push({
            name: 'Transportation Charges',
            rate,
            months: effectiveCount,
            total: rate * effectiveCount
          });
        }
      }
    }

    if (includeComputer) {
      // Always use standard computer facility fee from the fee structure
      const rate = classFees.computer || 0;
      if (rate > 0) {
        items.push({
          name: 'Computer Facility Fee',
          rate,
          months: effectiveCount,
          total: rate * effectiveCount
        });
      }
    }

    if (includeAcademy && Number(academyFeeRate || 0) > 0) {
      const rate = Number(academyFeeRate || 0);
      items.push({
        name: 'Academy / Sports Activities Fee',
        rate,
        months: effectiveCount,
        total: rate * effectiveCount
      });
    }

    if (student.scholarshipStatus === 'Provided' && Number(student.scholarshipAmount || 0) > 0) {
      const rate = Number(student.scholarshipAmount);
      items.push({
        name: `Scholarship Deduction (${student.scholarshipDescription || 'General'})`,
        rate: -rate,
        months: effectiveCount,
        total: -rate * effectiveCount
      });
    }

    if (includeAnnual && classFees.annual > 0) {
      // Check if student has already been charged an Annual Fee in this academic year
      const annualCheck = hasAnnualFeeBeenBilled(student.id, currentAcademicYear, remitBills, student.fees);
      if (!annualCheck.billed) {
        items.push({
          name: 'Annual Fee',
          rate: classFees.annual,
          months: 1,
          total: classFees.annual
        });
      }
    }

    if (includeAdmission && classFees.admission > 0) {
      const currentYear = feeStructure?.academicYear || getBSYearMonthDate().year.toString() || '2083';

      // Check if the student has already been charged an Admission Fee in any non-void remit bills for this year
      const hasBeenChargedInRemit = remitBills.some(b => {
        if (b.studentId !== student.id || b.status === 'void' || b.status === 'cancelled') return false;
        const billYear = b.academicYear || (b.createdAt ? b.createdAt.split('-')[0] : currentYear);
        if (billYear !== currentYear) return false;
        return b.itemizedCharges.some(item => item.name === 'Admission Fee' || item.name.includes('Admission Fee'));
      });

      const hasBeenPaidInFees = student.fees && Array.isArray(student.fees) && student.fees.some((f: any) => {
        if (f.type !== 'Admission Fee') return false;
        const feeYear = getFeeBSYear(f);
        if (feeYear !== currentYear) return false;
        return f.status === 'paid' || f.status === 'due' || Number(f.paidAmount || 0) > 0;
      });

      if (!hasBeenChargedInRemit && !hasBeenPaidInFees) {
        items.push({
          name: 'Admission Fee',
          rate: classFees.admission,
          months: 1,
          total: classFees.admission
        });
      }
    }

    if (includeExam && classFees.exam > 0) {
      items.push({
        name: 'Terminal Exam Fee',
        rate: classFees.exam,
        months: 1,
        total: classFees.exam
      });
    }

    customChargesList.forEach(c => {
      const rate = Number(c.amount || 0);
      const monthsMultiplier = c.isMonthly ? effectiveCount : 1;
      items.push({
        name: c.name,
        rate,
        months: monthsMultiplier,
        total: rate * monthsMultiplier
      });
    });

    // Automatically retrieve and include any outstanding arrears (back dues) as a single consolidated "Back Dues" entry
    if (student.fees && Array.isArray(student.fees)) {
      const currentBilledMonths = effectiveMonths;
      let totalBackDues = 0;

      student.fees.forEach((f: any) => {
        if (f.status === 'due') {
          const isTuitionBeingBilled = includeTuition && f.type === 'Tuition Fee' && currentBilledMonths.includes(f.month);
          const isTransportBeingBilled = includeTransport && f.type === 'Transportation Fee' && currentBilledMonths.includes(f.month);
          const isComputerBeingBilled = includeComputer && f.type === 'Computer Fee' && currentBilledMonths.includes(f.month);
          const isAcademyBeingBilled = includeAcademy && f.type === 'Academy Fee' && currentBilledMonths.includes(f.month);
          const isAnnualBeingBilled = includeAnnual && f.type === 'Annual Fee';
          const isAdmissionBeingBilled = includeAdmission && f.type === 'Admission Fee';
          const isExamBeingBilled = includeExam && f.type === 'Terminal Exam Fee';

          const isCurrentlyBilled = isTuitionBeingBilled || isTransportBeingBilled || isComputerBeingBilled || isAcademyBeingBilled || isAnnualBeingBilled || isAdmissionBeingBilled || isExamBeingBilled;

          if (!isCurrentlyBilled) {
            const amt = Number(f.dueAmount !== undefined ? f.dueAmount : (f.totalFee || 0));
            if (amt > 0) {
              totalBackDues += amt;
            }
          }
        }
      });

      if (totalBackDues > 0) {
        items.push({
          name: 'Back Dues',
          rate: 0,
          months: 0,
          total: totalBackDues
        });
      }
    }

    return items;
  };

  const calculateTotal = (items: StudentChargeItem[]) => {
    return items.reduce((sum, item) => sum + item.total, 0);
  };

  // Generate Remit Bill(s) with Month Coverage Integrity & Duplicate Prevention
  const handleGenerateBills = async () => {
    setGenerating(true);
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedClass) {
      setErrorMsg('Please select a target class before generating remit bills.');
      setGenerating(false);
      return;
    }

    if (!startMonth) {
      setErrorMsg('Please select the initial/starting month before generating remit bills.');
      setGenerating(false);
      return;
    }

    const targetClassStudents = students.filter(s => s.class === selectedClass);
    let selectedStudents: any[] = [];

    if (generationMode === 'student') {
      const found = students.find(s => s.id === selectedStudentId);
      if (found) selectedStudents = [found];
    } else {
      // Exclude students manually unselected/excluded by the accountant
      selectedStudents = targetClassStudents.filter(s => !excludedStudentIds.includes(s.id));
    }

    if (selectedStudents.length === 0) {
      setErrorMsg('No students selected for generation. Please verify class selection or student exclusions.');
      setGenerating(false);
      return;
    }

    // MULTI-STEP VERIFICATION PROCESS:
    // Step 1: Map the requested duration (e.g. 3 months starting Baisakh) to specific Nepali month IDs
    const mappedNepaliMonthIds = mapDurationToNepaliMonthIds(startMonth, periodMonths, currentAcademicYear);

    // Step 2: Query Firestore directly to check for existing 'billItems' for each student for these specific months
    setVerifyingFirestore(true);
    let firestoreCheck: FirestoreBillingVerificationResult | null = null;
    try {
      firestoreCheck = await verifyRequestedMonthsInFirestore(
        db,
        selectedStudents,
        startMonth,
        periodMonths,
        currentAcademicYear
      );
      setFirestoreVerification(firestoreCheck);
    } catch (checkErr: any) {
      console.warn('Firestore billItems verification warning:', checkErr);
      // Non-blocking warning: proceed with exception-based resolution
    } finally {
      setVerifyingFirestore(false);
    }

    // Single student check: if single student selected and 100% already billed, inform user clearly unless forceGenerate
    if (generationMode === 'student' && !forceGenerate) {
      const singleStudent = selectedStudents[0];
      const cov = getStudentYearCoverage(singleStudent.id, currentAcademicYear, remitBills, singleStudent.fees);
      const unbilled = periodCalc.targetMonths.filter(m => {
        const st = cov[m]?.status;
        return st === 'NOT_GENERATED' || st === 'VOID' || st === 'CANCELLED';
      });
      if (unbilled.length === 0) {
        setErrorMsg(
          `All requested months (${periodCalc.targetMonths.join(', ')}) have already been billed for ${singleStudent.fullName || singleStudent.name}. Unpaid bills remain active dues in the ledger. To reissue or fix errors, use "Void & Reissue" from the bill list or check "Force / Allow Supplementary Bill Generation" below.`
        );
        setGenerating(false);
        return;
      }
    }

    try {
      const batch = writeBatch(db);
      const currentBS = formatBSDate(new Date());
      const creatorName = formatIssuedBy(adminName);
      
      let createdCount = 0;
      let skippedCount = 0;
      let partialExceptedCount = 0;
      let lastGeneratedBillPayload: any = null;

      // 1. Pre-calculate all eligible billing plans to determine exact batch size for sequential atomic number allocation
      interface ValidPreparedPlan {
        studentPlan: StudentBillingPlan;
        student: any;
        unbilledForStudent: string[];
        itemizedCharges: StudentChargeItem[];
        totalAmount: number;
      }

      const validPreparedPlans: ValidPreparedPlan[] = [];

      billingPlan.studentPlans.forEach((studentPlan) => {
        const student = studentPlan.student;
        if (studentPlan.isExcluded) return;

        let unbilledForStudent = studentPlan.billableMonths;
        let itemizedCharges: StudentChargeItem[] = [];
        let totalAmount = 0;

        if (forceGenerate) {
          unbilledForStudent = periodCalc.targetMonths;
          itemizedCharges = computeStudentCharges(student, unbilledForStudent);
          totalAmount = calculateTotal(itemizedCharges);
        } else {
          if (!studentPlan.isBillable || studentPlan.newChargeItems.length === 0 || studentPlan.totalNewAmount <= 0) {
            skippedCount++;
            return;
          }

          if (studentPlan.billableMonthsCount < periodCalc.targetMonths.length) {
            partialExceptedCount++;
          }

          const monthlyGroups = new Map<string, { rate: number; count: number; name: string }>();

          studentPlan.newChargeItems.forEach(ci => {
            if (ci.frequency === 'MONTHLY') {
              const key = ci.feeHeadName;
              if (!monthlyGroups.has(key)) {
                monthlyGroups.set(key, { rate: ci.rate, count: 0, name: ci.feeHeadName });
              }
              monthlyGroups.get(key)!.count += 1;
            } else {
              itemizedCharges.push({
                name: ci.feeHeadName,
                rate: ci.rate,
                months: 1,
                total: ci.finalAmount
              });
            }
          });

          monthlyGroups.forEach(grp => {
            itemizedCharges.push({
              name: grp.name,
              rate: grp.rate,
              months: grp.count,
              total: grp.rate * grp.count
            });
          });

          if (student.scholarshipStatus === 'Provided' && Number(student.scholarshipAmount || 0) > 0 && studentPlan.billableMonthsCount > 0) {
            const schRate = Number(student.scholarshipAmount);
            const schTot = -schRate * studentPlan.billableMonthsCount;
            itemizedCharges.push({
              name: `Scholarship Deduction (${student.scholarshipDescription || student.scholarshipCategory || 'General'})`,
              rate: -schRate,
              months: studentPlan.billableMonthsCount,
              total: schTot
            });
          }

          totalAmount = calculateTotal(itemizedCharges);
        }

        if (totalAmount <= 0 || unbilledForStudent.length === 0) {
          skippedCount++;
          return;
        }

        validPreparedPlans.push({
          studentPlan,
          student,
          unbilledForStudent,
          itemizedCharges,
          totalAmount
        });
      });

      if (validPreparedPlans.length === 0) {
        setErrorMsg('No eligible unbilled charges found for the selected student(s) and period.');
        setGenerating(false);
        return;
      }

      // Execute atomic transactional bill generation for each prepared student plan
      const billingOptions = {
        db,
        academicYear: currentAcademicYear,
        creatorName,
        reissueContext: reissueContext || undefined
      };

      for (const plan of validPreparedPlans) {
        const { student, unbilledForStudent, itemizedCharges, totalAmount } = plan;
        
        try {
          const result = await generateSingleStudentBillTransactionally(billingOptions, {
            student,
            unbilledForStudent,
            mappedNepaliMonthIds,
            itemizedCharges,
            totalAmount
          });

          if (result.success && !result.skipped && result.billId) {
            createdCount++;
            lastGeneratedBillPayload = {
              id: result.billId,
              studentId: result.studentId,
              amount: result.totalAmount,
              billId: result.billNo || result.billId,
              billingPeriod: result.coveredMonths.length === 1
                ? `${result.coveredMonths[0]} (1 Month)`
                : `${result.coveredMonths[0]} to ${result.coveredMonths[result.coveredMonths.length - 1]} (${result.coveredMonths.length} Months)`,
              itemizedCharges: result.itemizedCharges
            };
          } else if (result.skipped) {
            skippedCount++;
          }
        } catch (studentTxErr: any) {
          console.error(`Error in atomic billing transaction for student ${student.name || student.fullName}:`, studentTxErr);
          throw studentTxErr;
        }
      }

      if (createdCount > 0) {
        let notice = `Successfully generated ${createdCount} Remit Bill(s) for Class ${selectedClass}!`;
        if (partialExceptedCount > 0) {
          notice += ` Wisely excepted previously billed months for ${partialExceptedCount} student(s).`;
        }
        if (skippedCount > 0) {
          notice += ` Auto-skipped ${skippedCount} student(s) who were already 100% billed for this duration.`;
        }
        setSuccessMsg(notice);
        // Reset custom lists, reissueContext & subtab
        setCustomChargesList([]);
        setReissueContext(null);
        setExcludedStudentIds([]);
        setFilterClass(selectedClass);
        setActiveSubTab('list');
        onRefresh();
      } else {
        if (skippedCount > 0) {
          setErrorMsg(
            `No new bills generated: All ${skippedCount} student(s) already have active bills covering ${periodCalc.targetMonths.join(', ')}. Unpaid bills are active dues. To generate duplicate supplementary bills, check "Force / Allow Supplementary Bill Generation".`
          );
        } else {
          setErrorMsg('No bills were created. Please verify student fee rates.');
        }
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, 'remitBills');
      setErrorMsg(`Generation failed: ${err.message || err}`);
    } finally {
      setGenerating(false);
    }
  };

  // Process receipt / pay guardian bill cash deposit with canonical atomic payment engine
  const handlePayRemitBill = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!payingBill) return;

    setProcessingPayment(true);
    setErrorMsg('');
    setSuccessMsg('');

    const paidCash = Number(cashReceived || 0);
    if (paidCash <= 0) {
      setErrorMsg('Please enter a valid cash received amount greater than 0.');
      setProcessingPayment(false);
      return;
    }

    try {
      const targetStudent = students.find(s => s.id === payingBill.studentId) || {
        id: payingBill.studentId,
        studentId: payingBill.studentId,
        name: payingBill.studentName,
        fullName: payingBill.studentName,
        class: payingBill.class,
        rollNumber: payingBill.studentRoll || '-'
      };

      const billTotal = Number(payingBill.totalAmount || 0);
      const alreadyPaid = Number(payingBill.paidAmount || 0);
      const netPayable = Math.max(0, billTotal - alreadyPaid);
      const operatorName = formatIssuedBy(adminName);
      const operatorUid = auth.currentUser?.uid || 'system';
      const allocatedReceiptNo = await allocateNextDocumentNumber('RCP', payingBill?.academicYear || currentAcademicYear);

      const executionResult = await executeCashFeePayment({
        receiptNo: allocatedReceiptNo,
        student: targetStudent,
        cashTendered: paidCash,
        cashCollection: paidCash,
        netPayable: netPayable,
        baseAmount: netPayable,
        additionalCharges: [],
        discounts: [],
        paymentCategory: 'remit_bill_settlement',
        remarks: paymentRemarks || `Remit Bill Clearance - ${payingBill.billNo} (${payingBill.billingPeriod})`,
        operatorName,
        operatorUid,
        prefilledBillData: {
          id: payingBill.id,
          billId: payingBill.billNo || payingBill.id,
          amount: netPayable,
          totalAmount: billTotal,
          paidAmount: alreadyPaid,
          dueAmount: netPayable,
          billingPeriod: payingBill.billingPeriod,
          coveredMonths: payingBill.coveredMonths || (payingBill.billingPeriod ? parseMonthsFromBillingPeriod(payingBill.billingPeriod) : undefined),
          itemizedCharges: payingBill.itemizedCharges
        },
        excessDecision: paidCash > netPayable ? excessDecision : null,
        accountantRemarks: paymentRemarks || 'Direct Counter Remit Bill Clearance',
        accountantName: operatorName,
        accountantUid: operatorUid
      });

      const applied = executionResult.breakdown.amountApplied;
      const excessAdv = executionResult.breakdown.advanceCreated || 0;
      const changeRet = executionResult.breakdown.changeReturned || 0;
      let advanceNote = '';
      if (excessAdv > 0) advanceNote = ` Excess NRs. ${excessAdv.toLocaleString()} credited to student advance balance.`;
      if (changeRet > 0) advanceNote = ` Excess change of NRs. ${changeRet.toLocaleString()} returned to guardian.`;

      setSuccessMsg(`Guardian cash of NRs. ${paidCash.toLocaleString()} recorded successfully! (Applied NRs. ${applied.toLocaleString()}).${advanceNote} Receipt #${executionResult.receiptNo}. Ledger updated.`);
      setPayingBill(null);
      setCashReceived('');
      setPaymentRemarks('');
      setIsSignVerified(false);
      onRefresh();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, 'remitBills');
      setErrorMsg(`Payment processing failed: ${err.message || err}`);
    } finally {
      setProcessingPayment(false);
    }
  };

  const confirmDeleteBill = async () => {
    if (!billToDelete) return;
    try {
      if (billToDelete.transactionId || (billToDelete.paidAmount && billToDelete.paidAmount > 0) || billToDelete.status === 'paid' || billToDelete.status === 'partial') {
        setErrorMsg('Financial Integrity Protection: Cannot physically delete a Remit Bill that has recorded payments or transactions. Please use the official Refund or Void Bill workflow to maintain complete institutional accounting compliance.');
        setBillToDelete(null);
        return;
      }

      // 1. Release all uniqueness locks for this exact bill so months and fees can be re-billed
      try {
        await releaseBillUniquenessLocks(db, billToDelete);
      } catch (lockErr) {
        console.warn('Could not release uniqueness locks upon draft bill deletion:', lockErr);
      }

      const batch = writeBatch(db);
      batch.delete(doc(db, 'remitBills', billToDelete.id));

      // Pending/unpaid draft bill: clean up associated generated studentFees records
      const feeQuery = query(collection(db, 'studentFees'), where('remitBillId', '==', billToDelete.id));
      const feeSnap = await getDocs(feeQuery);
      feeSnap.forEach(d => {
        batch.delete(d.ref);
      });

      // Also clean up any unbilled billItems draft records
      try {
        const itemQuery = query(collection(db, 'billItems'), where('remitBillId', '==', billToDelete.id));
        const itemSnap = await getDocs(itemQuery);
        itemSnap.forEach(d => {
          batch.delete(d.ref);
        });
      } catch (err) {
        // ignore if billItems not present
      }

      await batch.commit();
      setSuccessMsg('Draft/Pending Remit Bill deleted and uniqueness locks released successfully.');
      onRefresh();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'remitBills');
      setErrorMsg('Failed to delete remit bill.');
    } finally {
      setBillToDelete(null);
    }
  };

  const confirmBulkDeleteBills = async () => {
    if (selectedBillIds.length === 0) return;
    setBulkDeleting(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const billsToDeleteObj = remitBills.filter(b => selectedBillIds.includes(b.id));

      // Check if any selected bill has payments/transactions
      const paidBills = billsToDeleteObj.filter(b => b.transactionId || (b.paidAmount && b.paidAmount > 0) || b.status === 'paid' || b.status === 'partial');
      if (paidBills.length > 0) {
        setErrorMsg(`Financial Integrity Protection: ${paidBills.length} selected bill(s) have recorded payments or transactions and cannot be deleted. Please use the Refund or Void workflow.`);
        setBulkDeleting(false);
        setShowBulkDeleteConfirm(false);
        return;
      }

      const batch = writeBatch(db);
      for (const bill of billsToDeleteObj) {
        // Release uniqueness locks for each eligible bill being deleted
        try {
          await releaseBillUniquenessLocks(db, bill);
        } catch (lockErr) {
          console.warn(`Could not release uniqueness locks for bill ${bill.id}:`, lockErr);
        }

        batch.delete(doc(db, 'remitBills', bill.id));

        const feeQuery = query(collection(db, 'studentFees'), where('remitBillId', '==', bill.id));
        const feeSnap = await getDocs(feeQuery);
        feeSnap.forEach(d => {
          batch.delete(d.ref);
        });

        try {
          const itemQuery = query(collection(db, 'billItems'), where('remitBillId', '==', bill.id));
          const itemSnap = await getDocs(itemQuery);
          itemSnap.forEach(d => {
            batch.delete(d.ref);
          });
        } catch (err) {
          // ignore
        }
      }

      await batch.commit();
      setSuccessMsg(`Successfully deleted ${billsToDeleteObj.length} Draft/Pending Remit Bill(s) and released locks.`);
      setSelectedBillIds([]);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Failed to delete selected bills: ${err.message || err}`);
    } finally {
      setBulkDeleting(false);
      setShowBulkDeleteConfirm(false);
    }
  };

  const drawFullPageBill = (pdf: any, bill: RemitBill) => {
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // --- HEADER ---
    const titleX = logoBase64 ? 35 : pageWidth / 2;

    if (logoBase64) {
      try {
        pdf.addImage(logoBase64, 'PNG', 15, 10, 16, 16);
        // Draw centered watermark background
        pdf.saveGraphicsState();
        const GStateClass = (jsPDF as any).GState || (pdf as any).GState;
        if (GStateClass) {
          try {
            const gState = new GStateClass({ opacity: 0.04 });
            if (typeof pdf.setGState === 'function') {
              pdf.setGState(gState);
            }
          } catch {
            // Ignore if GState is non-constructible
          }
        }
        pdf.addImage(logoBase64, 'PNG', pageWidth / 2 - 40, pageHeight / 2 - 40, 80, 80);
        pdf.restoreGraphicsState();
      } catch (err) {
        console.error("Error drawing logo/watermark in PDF:", err);
      }
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(27, 79, 114); // #1B4F72 (Slate Blue)
    pdf.text('Shikshantar Academy', titleX, 15, logoBase64 ? {} : { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139); // Slate-500
    pdf.text('Bastipur, Karjanha-05, Siraha, Nepal • Ph: +977 9709867048, +977 9807790805', titleX, 20, logoBase64 ? {} : { align: 'center' });

    pdf.setFillColor(238, 242, 255); // Custom light indigo bg
    if (logoBase64) {
      pdf.roundedRect(35, 23, 46, 5, 0.8, 0.8, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(67, 56, 202); // Indigo-700
      pdf.text('PRE-PAYMENT REMIT BILL', 37.5, 26.5);
    } else {
      pdf.roundedRect(pageWidth / 2 - 30, 24, 60, 6, 1, 1, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(67, 56, 202); // Indigo-700
      pdf.text('PRE-PAYMENT REMIT BILL', pageWidth / 2, 28, { align: 'center' });
    }

    // Right aligned metadata block
    pdf.setFontSize(14);
    pdf.setTextColor(27, 79, 114);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${bill.billNo}`, pageWidth - 15, 15, { align: 'right' });

    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139); // Slate-500
    pdf.text(`Issue Date: ${bill.createdAt || ''} (BS)`, pageWidth - 15, 20, { align: 'right' });
    pdf.text(`Due Date: Within 15 Days`, pageWidth - 15, 24.5, { align: 'right' });

    pdf.setDrawColor(226, 232, 240); // Slate-200
    pdf.setLineWidth(0.5);
    pdf.line(15, 32, pageWidth - 15, 32);

    // --- BILL INFO BLOCK ---
    pdf.setFontSize(8);
    pdf.setTextColor(148, 163, 184); // Slate-400
    pdf.setFont('helvetica', 'bold');
    pdf.text('CHARGED TO PUPIL', 15, 39);

    pdf.setFontSize(10);
    pdf.setTextColor(30, 41, 59); // Slate-800
    pdf.setFont('helvetica', 'bold');
    pdf.text(bill.studentName.toUpperCase(), 15, 44);

    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139); // Slate-500
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Roll / ID: ${bill.studentRoll || 'N/A'}`, 15, 49);

    // Right-aligned Class & Period details
    pdf.setFontSize(8);
    pdf.setTextColor(148, 163, 184);
    pdf.setFont('helvetica', 'bold');
    pdf.text('CLASS & PERIOD DETAILS', pageWidth - 15, 39, { align: 'right' });

    pdf.setFontSize(9.5);
    pdf.setTextColor(30, 41, 59);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Grade: Class ${bill.class}`, pageWidth - 15, 44, { align: 'right' });

    pdf.setFontSize(9);
    pdf.setTextColor(79, 70, 229); // Indigo-600
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Period: ${bill.billingPeriod}`, pageWidth - 15, 49, { align: 'right' });

    const studentObj = students?.find(s => s.id === bill.studentId);
    const resolvedGuardian = (bill.guardianName && bill.guardianName.trim() !== '' && bill.guardianName.toLowerCase() !== 'unknown') 
      ? bill.guardianName 
      : ((studentObj?.guardianName && studentObj.guardianName.trim() !== '' && studentObj.guardianName.toLowerCase() !== 'unknown')
        ? studentObj.guardianName
        : (studentObj?.fatherName && studentObj.fatherName.trim() !== ''
          ? studentObj.fatherName
          : (studentObj?.motherName && studentObj.motherName.trim() !== '' ? studentObj.motherName : 'Unknown')));

    let tableStartY = 60;
    if (resolvedGuardian) {
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);
      pdf.setFont('helvetica', 'bold');
      pdf.text('GUARDIAN INFO (DUES DEPOSITOR)', 15, 57);
      pdf.setFontSize(9);
      pdf.setTextColor(71, 85, 105);
      pdf.setFont('helvetica', 'bold');
      pdf.text(resolvedGuardian, 15, 61.5);
      tableStartY = 69;
    }

    // --- ITEMS TABLE ---
    const formattedCharges = formatRemitBillItems(bill.itemizedCharges);
    const tableRows = formattedCharges.map((item) => [
      String(item.sn),
      item.name,
      item.rateStr,
      item.durationStr,
      item.totalStr
    ]);

    autoTable(pdf, {
      startY: tableStartY,
      head: [[
        { content: 'S.N.', styles: { halign: 'center' } },
        { content: 'Charge Description Item', styles: { halign: 'left' } },
        { content: 'Rate', styles: { halign: 'right' } },
        { content: 'Duration', styles: { halign: 'center' } },
        { content: 'Total Amount', styles: { halign: 'right' } }
      ]],
      body: tableRows,
      margin: { left: 15, right: 15 },
      theme: 'striped',
      rowPageBreak: 'avoid',
      styles: {
        fontSize: 8.5,
        font: 'helvetica',
        textColor: [51, 65, 85]
      },
      headStyles: {
        fillColor: [27, 79, 114],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 'auto', halign: 'left' },
        2: { cellWidth: 35, halign: 'right' },
        3: { cellWidth: 25, halign: 'center' },
        4: { cellWidth: 35, halign: 'right' }
      },
      didParseCell: (data) => {
        if (data.column.index === 0) data.cell.styles.halign = 'center';
        if (data.column.index === 1) data.cell.styles.halign = 'left';
        if (data.column.index === 2) data.cell.styles.halign = 'right';
        if (data.column.index === 3) data.cell.styles.halign = 'center';
        if (data.column.index === 4) data.cell.styles.halign = 'right';
      }
    });

    // @ts-ignore
    let finalY = pdf.lastAutoTable.finalY + 10;

    if (finalY > pageHeight - 50) {
      pdf.addPage();
      finalY = 20;
    }

    // --- TOTALS BAR ---
    pdf.setFillColor(240, 253, 244);
    pdf.setDrawColor(220, 252, 231);
    pdf.roundedRect(pageWidth - 95, finalY, 80, 10, 2, 2, 'FD');

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(6, 95, 70);
    pdf.text('TOTAL AMOUNT:', pageWidth - 90, finalY + 6.5);
    
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(6, 95, 70);
    pdf.text(`NRs. ${bill.totalAmount.toLocaleString()}`, pageWidth - 20, finalY + 6.5, { align: 'right' });

    // --- BADGE STAMPS ---
    if (bill.status === 'paid') {
      pdf.setDrawColor(16, 185, 129);
      pdf.setLineWidth(1);
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(20, finalY, 45, 10, 1.5, 1.5, 'D');
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(16, 185, 129);
      pdf.text('PAID / CLEARED', 42.5, finalY + 6.5, { align: 'center' });
    } else {
      pdf.setDrawColor(245, 158, 11);
      pdf.setLineWidth(1);
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(20, finalY, 45, 10, 1.5, 1.5, 'D');
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(245, 158, 11);
      pdf.text('DUES OUTSTANDING', 42.5, finalY + 6.5, { align: 'center' });
    }

    // --- FOOTERS ---
    const footerY = pageHeight - 35;
    pdf.setDrawColor(241, 245, 249);
    pdf.setLineWidth(0.5);
    pdf.line(15, footerY - 5, pageWidth - 15, footerY - 5);

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    
    const instructions = [
      "1. Secure Draft: This pre-payment Remit Bill keeps the bill secure, preventing manual ledger discrepancies or unauthorized ledger errors.",
      "2. Cashier Clearance: Payment within 15 days is mandatory. Settle early at the counter to secure up to a 10% early settlement discount.",
      "3. Account Audit: No manual adjustments are authorized. Keep this bill and your subsequent computer receipt as proof of dues clearance."
    ];
    pdf.text(instructions[0], 15, footerY);
    pdf.text(instructions[1], 15, footerY + 3.2);
    pdf.text(instructions[2], 15, footerY + 6.4);

    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(71, 85, 105);
    pdf.text(`Issued by: ${formatIssuedBy(bill.createdBy)}`, 15, footerY + 12);
    pdf.text('Authorized Signature: _______________________', pageWidth - 15, footerY + 12, { align: 'right' });
  };

  const drawHalfPageBill = (pdf: any, bill: RemitBill, offsetY: number) => {
    const pageWidth = pdf.internal.pageSize.getWidth();

    // --- HEADER ---
    const titleX = logoBase64 ? 26 : pageWidth / 2;

    if (logoBase64) {
      try {
        pdf.addImage(logoBase64, 'PNG', 15, offsetY + 4, 9, 9);
        // Draw centered watermark background in half-page layout
        pdf.saveGraphicsState();
        const GStateClass = (jsPDF as any).GState || (pdf as any).GState;
        if (GStateClass) {
          try {
            const gState = new GStateClass({ opacity: 0.04 });
            if (typeof pdf.setGState === 'function') {
              pdf.setGState(gState);
            }
          } catch {
            // Ignore if GState is non-constructible
          }
        }
        pdf.addImage(logoBase64, 'PNG', pageWidth / 2 - 22.5, offsetY + 74.25 - 22.5, 45, 45);
        pdf.restoreGraphicsState();
      } catch (err) {
        console.error("Error drawing logo/watermark in half-page PDF:", err);
      }
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(27, 79, 114); // #1B4F72 (Slate Blue)
    pdf.text('Shikshantar Academy', titleX, offsetY + 8, logoBase64 ? {} : { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139); // Slate-500
    pdf.text('Bastipur, Karjanha-05, Siraha, Nepal • Ph: +977 9709867048, +977 9807790805', titleX, offsetY + 11.2, logoBase64 ? {} : { align: 'center' });

    pdf.setFillColor(238, 242, 255); // Custom light indigo bg
    if (logoBase64) {
      pdf.roundedRect(26, offsetY + 13, 34, 3.2, 0.5, 0.5, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(5.5);
      pdf.setTextColor(67, 56, 202); // Indigo-700
      pdf.text('PRE-PAYMENT REMIT BILL', 27.5, offsetY + 15.3);
    } else {
      pdf.roundedRect(pageWidth / 2 - 22, offsetY + 13, 44, 3.5, 0.5, 0.5, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.5);
      pdf.setTextColor(67, 56, 202); // Indigo-700
      pdf.text('PRE-PAYMENT REMIT BILL', pageWidth / 2, offsetY + 15.5, { align: 'center' });
    }

    // Right-aligned metadata block
    pdf.setFontSize(9);
    pdf.setTextColor(27, 79, 114);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${bill.billNo}`, pageWidth - 15, offsetY + 7.5, { align: 'right' });

    pdf.setFontSize(6.5);
    pdf.setTextColor(100, 116, 139); // Slate-500
    pdf.text(`Issue Date: ${bill.createdAt || ''} (BS)`, pageWidth - 15, offsetY + 10.7, { align: 'right' });
    pdf.text(`Due Date: Within 15 Days`, pageWidth - 15, offsetY + 13.5, { align: 'right' });

    pdf.setDrawColor(226, 232, 240); // Slate-200
    pdf.setLineWidth(0.3);
    pdf.line(15, offsetY + 18, pageWidth - 15, offsetY + 18);

    // --- BILL INFO BLOCK ---
    pdf.setFontSize(6.5);
    pdf.setTextColor(148, 163, 184); // Slate-400
    pdf.setFont('helvetica', 'bold');
    pdf.text('CHARGED TO PUPIL', 15, offsetY + 22);

    pdf.setFontSize(8);
    pdf.setTextColor(30, 41, 59); // Slate-800
    pdf.setFont('helvetica', 'bold');
    pdf.text(bill.studentName.toUpperCase(), 15, offsetY + 25.2);

    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139); // Slate-500
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Roll / ID: ${bill.studentRoll || 'N/A'}`, 15, offsetY + 28.2);

    // Right-aligned Class & Period details
    pdf.setFontSize(6.5);
    pdf.setTextColor(148, 163, 184);
    pdf.setFont('helvetica', 'bold');
    pdf.text('CLASS & PERIOD DETAILS', pageWidth - 15, offsetY + 22, { align: 'right' });

    pdf.setFontSize(7.5);
    pdf.setTextColor(30, 41, 59);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Grade: Class ${bill.class}`, pageWidth - 15, offsetY + 25.2, { align: 'right' });

    pdf.setFontSize(7);
    pdf.setTextColor(79, 70, 229); // Indigo-600
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Period: ${bill.billingPeriod}`, pageWidth - 15, offsetY + 28.2, { align: 'right' });

    const studentObj = students?.find(s => s.id === bill.studentId);
    const resolvedGuardian = (bill.guardianName && bill.guardianName.trim() !== '' && bill.guardianName.toLowerCase() !== 'unknown') 
      ? bill.guardianName 
      : ((studentObj?.guardianName && studentObj.guardianName.trim() !== '' && studentObj.guardianName.toLowerCase() !== 'unknown')
        ? studentObj.guardianName
        : (studentObj?.fatherName && studentObj.fatherName.trim() !== ''
          ? studentObj.fatherName
          : (studentObj?.motherName && studentObj.motherName.trim() !== '' ? studentObj.motherName : 'Unknown')));

    pdf.setFontSize(6.5);
    pdf.setTextColor(148, 163, 184);
    pdf.setFont('helvetica', 'bold');
    pdf.text('GUARDIAN INFO (DUES DEPOSITOR)', 15, offsetY + 32.5);
    pdf.setFontSize(7.5);
    pdf.setTextColor(71, 85, 105);
    pdf.setFont('helvetica', 'bold');
    pdf.text(resolvedGuardian, 15, offsetY + 35.5);
    const tableStartY = offsetY + 38;

    // --- ITEMS TABLE ---
    const formattedCharges = formatRemitBillItems(bill.itemizedCharges);
    const tableRows = formattedCharges.map((item) => [
      String(item.sn),
      item.name,
      item.rateStr,
      item.durationShortStr,
      item.totalStr
    ]);

    autoTable(pdf, {
      startY: tableStartY,
      head: [[
        { content: 'S.N.', styles: { halign: 'center' } },
        { content: 'Charge Item Description', styles: { halign: 'left' } },
        { content: 'Rate', styles: { halign: 'right' } },
        { content: 'Dur.', styles: { halign: 'center' } },
        { content: 'Total', styles: { halign: 'right' } }
      ]],
      body: tableRows,
      margin: { left: 15, right: 15, bottom: 5, top: 5 },
      theme: 'striped',
      rowPageBreak: 'avoid',
      styles: {
        fontSize: 7.2,
        font: 'helvetica',
        textColor: [51, 65, 85],
        cellPadding: 1.2
      },
      headStyles: {
        fillColor: [27, 79, 114],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        cellPadding: 1.2
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 'auto', halign: 'left' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 28, halign: 'right' }
      },
      didParseCell: (data) => {
        if (data.column.index === 0) data.cell.styles.halign = 'center';
        if (data.column.index === 1) data.cell.styles.halign = 'left';
        if (data.column.index === 2) data.cell.styles.halign = 'right';
        if (data.column.index === 3) data.cell.styles.halign = 'center';
        if (data.column.index === 4) data.cell.styles.halign = 'right';
      }
    });

    // @ts-ignore
    let finalY = pdf.lastAutoTable.finalY + 3;

    // --- TOTALS BAR ---
    pdf.setFillColor(240, 253, 244);
    pdf.setDrawColor(220, 252, 231);
    pdf.roundedRect(pageWidth - 75, finalY, 60, 6, 1, 1, 'FD');

    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(6, 95, 70);
    pdf.text('TOTAL AMOUNT:', pageWidth - 71, finalY + 4.2);
    
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(6, 95, 70);
    pdf.text(`NRs. ${bill.totalAmount.toLocaleString()}`, pageWidth - 18, finalY + 4.2, { align: 'right' });

    // --- BADGE STAMPS ---
    if (bill.status === 'paid') {
      pdf.setDrawColor(16, 185, 129);
      pdf.setLineWidth(0.6);
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(20, finalY, 32, 6, 0.8, 0.8, 'D');
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(16, 185, 129);
      pdf.text('PAID / CLEARED', 36, finalY + 4.2, { align: 'center' });
    } else {
      pdf.setDrawColor(245, 158, 11);
      pdf.setLineWidth(0.6);
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(20, finalY, 32, 6, 0.8, 0.8, 'D');
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(245, 158, 11);
      pdf.text('DUES OUTSTANDING', 36, finalY + 4.2, { align: 'center' });
    }

    // --- FOOTERS ---
    const footerY = offsetY + 107;
    pdf.setDrawColor(241, 245, 249);
    pdf.setLineWidth(0.3);
    pdf.line(15, footerY, pageWidth - 15, footerY);

    pdf.setFontSize(5.8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    
    const instructions = [
      "1. Secure Draft: This pre-payment Remit Bill keeps the bill secure, preventing manual ledger discrepancies.",
      "2. Cashier Clearance: Settle within 15 days of issue. Early settlement entitles up to 10% discount on tuition.",
      "3. Account Audit: Check computer receipts upon counter clearance. No manual adjustments are authorized."
    ];
    pdf.text(instructions[0], 15, footerY + 2.2);
    pdf.text(instructions[1], 15, footerY + 4.5);
    pdf.text(instructions[2], 15, footerY + 6.8);

    pdf.setFontSize(6.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(71, 85, 105);
    pdf.text(`Issued by: ${formatIssuedBy(bill.createdBy)}`, 15, footerY + 10.5);
    pdf.text('Authorized Signature: _______________________', pageWidth - 15, footerY + 10.5, { align: 'right' });
  };

  const downloadSingleBillPdf = (bill: RemitBill) => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    drawFullPageBill(pdf, bill);
    pdf.save(`Remit_Bill_${bill.studentName.replace(/\s+/g, '_')}_${bill.billNo}.pdf`);
  };

  const printSingleBillRemit = (bill: RemitBill) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const studentObj = students?.find(s => s.id === bill.studentId);
    const resolvedG = (bill.guardianName && bill.guardianName.trim() !== '' && bill.guardianName.toLowerCase() !== 'unknown')
      ? bill.guardianName
      : ((studentObj?.guardianName && studentObj.guardianName.trim() !== '' && studentObj.guardianName.toLowerCase() !== 'unknown')
        ? studentObj.guardianName
        : (studentObj?.fatherName && studentObj.fatherName.trim() !== ''
          ? studentObj.fatherName
          : (studentObj?.motherName && studentObj.motherName.trim() !== '' ? studentObj.motherName : 'Unknown')));

    let itemRows = '';
    const formattedCharges = formatRemitBillItems(bill.itemizedCharges);
    formattedCharges.forEach(item => {
      itemRows += `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #f3f4f6; color: #1f2937; font-weight: bold;">${item.name}</td>
          <td class="text-right font-mono" style="padding: 10px; border-bottom: 1px solid #f3f4f6; color: #4b5563;">${item.rateStr}</td>
          <td class="text-center" style="padding: 10px; border-bottom: 1px solid #f3f4f6; color: #1f2937; font-weight: bold;">${item.durationStr}</td>
          <td class="text-right font-mono" style="padding: 10px; border-bottom: 1px solid #f3f4f6; color: #1f2937; font-weight: bold;">${item.totalStr}</td>
        </tr>
      `;
    });

    const isPaid = bill.status === 'paid';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Remit Bill - ${bill.billNo}</title>
        <style>
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
          }
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.5; padding: 20px; background-color: #fff; }
          .bill-container { max-width: 750px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; padding: 30px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); position: relative; overflow: hidden; }
          .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 340px; height: 340px; background-image: url('${logoImage || "/logo.png"}'); background-size: contain; background-repeat: no-repeat; background-position: center; opacity: 0.05; pointer-events: none; z-index: 0; }
          .header, .bill-info-grid, table, .notes-box, .footer { position: relative; z-index: 10; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1B4F72; padding-bottom: 15px; margin-bottom: 20px; }
          .header-left { display: flex; align-items: center; gap: 15px; }
          .school-logo { width: 70px; height: 70px; object-fit: contain; }
          .school-name { font-size: 22px; font-weight: 800; margin: 0; color: #1B4F72; text-transform: uppercase; letter-spacing: 0.5px; }
          .school-info { font-size: 11px; color: #4b5563; margin: 2px 0 0; }
          .bill-badge { background-color: #f5f3ff; border: 1px solid #ddd6fe; color: #5b21b6; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 1px; display: inline-block; margin-top: 5px; }
          .bill-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 25px; font-size: 13px; color: #374151; background-color: #f9fafb; padding: 15px; border-radius: 8px; border: 1px solid #f3f4f6; }
          .info-item span { font-weight: 600; color: #6b7280; text-transform: uppercase; font-size: 10px; display: block; margin-bottom: 2px; }
          .info-item strong { font-size: 13px; color: #111827; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
          th { background-color: #f3f4f6; font-weight: 700; text-transform: uppercase; font-size: 10px; color: #4b5563; padding: 10px; text-align: left; border-bottom: 2px solid #e5e7eb; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .font-mono { font-family: monospace; }
          .grand-total { font-size: 15px; font-weight: 800; color: #1B4F72; background-color: #f0fdf4; padding: 10px; border-radius: 6px; border: 1px solid #bbf7d0; margin-top: 5px; display: flex; justify-content: space-between; align-items: center; }
          .paid-stamp { position: absolute; right: 30px; top: 120px; border: 6px double #10b981; color: #10b981; font-size: 20px; font-weight: 900; letter-spacing: 2px; padding: 10px 18px; border-radius: 12px; transform: rotate(-12deg); opacity: 0.8; z-index: 50; }
          .notes-box { margin-top: 25px; padding: 12px; background-color: #fbfbfb; border: 1px dashed #d1d5db; border-radius: 8px; font-size: 11px; color: #4b5563; }
          .footer-signs { margin-top: 45px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; }
          .signature-area { text-align: center; width: 180px; }
          .signature-line { border-top: 1px dashed #9ca3af; margin-bottom: 5px; width: 100%; }
          .signature-title { color: #6b7280; font-weight: 600; font-size: 11px; text-transform: uppercase; }
        </style>
      </head>
      <body onload="window.print();window.close();">
        <div class="bill-container">
          <div class="watermark"></div>
          
          ${isPaid ? '<div class="paid-stamp">CASH COLLECTED</div>' : ''}

          <!-- Header -->
          <div class="header">
            <div class="header-left">
              <img class="school-logo" src="${logoImage || "/logo.png"}" alt="School Logo" />
              <div>
                <h1 class="school-name">SHIKSHANTAR ACADEMY</h1>
                <p class="school-info">Karjanhana Municipality, Bastipur-5, Siraha, Nepal</p>
                <p class="school-info">Phone: +977 9709867048, +977 9807790805 | Email: academyshikshantar@gmail.com</p>
                <div class="bill-badge">Pre-Payment Remit Bill</div>
              </div>
            </div>
            <div class="text-right">
              <h3 style="font-family: monospace; font-size: 16px; font-weight: 800; color: #1B4F72; margin: 0 0 5px 0;">${bill.billNo}</h3>
              <p style="font-size: 11px; color: #6b7280; margin: 2px 0;">Issue Date: ${bill.createdAt} (BS)</p>
              <p style="font-size: 11px; color: #6b7280; margin: 2px 0;">Due Date: Within 15 Days</p>
              <p style="font-size: 11px; color: #6b7280; margin: 2px 0;">Status: <span style="font-weight: 800; color: ${isPaid ? '#10b981' : '#f59e0b'}; text-transform: uppercase;">${bill.status}</span></p>
            </div>
          </div>

          <!-- Bill Info Grid -->
          <div class="bill-info-grid">
            <div class="info-item">
              <span>Charged to Pupil</span>
              <strong>${bill.studentName}</strong>
              <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">ID / Roll No: ${bill.studentRoll || 'N/A'}</div>
            </div>
            <div class="info-item">
              <span>Class & Period Details</span>
              <strong>Grade: Class ${bill.class}</strong>
              <div style="font-size: 11px; color: #5b21b6; font-weight: bold; margin-top: 2px;">Billing Period: ${bill.billingPeriod}</div>
            </div>
            <div class="info-item" style="grid-column: span 2; border-top: 1px solid #e5e7eb; padding-top: 8px; margin-top: 4px;">
              <span>Guardian Info (Dues Depositor)</span>
              <strong>${resolvedG}</strong>
            </div>
          </div>

          <!-- Table of items -->
          <table>
            <thead>
              <tr>
                <th style="border-top-left-radius: 6px; border-bottom-left-radius: 6px;">Description of Dues</th>
                <th class="text-right">Rate</th>
                <th class="text-center">Months</th>
                <th class="text-right" style="border-top-right-radius: 6px; border-bottom-right-radius: 6px;">Line Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
          </table>

          <!-- Grand Total display -->
          <div class="grand-total">
            <span style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: #374151;">Gross Total Outstanding Payable</span>
            <span class="font-mono" style="font-size: 16px; font-weight: 900;">NRs. ${(bill?.totalAmount || 0).toLocaleString()}</span>
          </div>

          <!-- Instructions -->
          <div class="notes-box">
            <strong style="display: block; font-size: 11px; text-transform: uppercase; margin-bottom: 4px; color: #374151;">Filing Notes & Instructions</strong>
            <div style="line-height: 1.4; font-size: 10.5px;">
              1. Secure Draft: This pre-payment Remit Bill keeps the bill secure, preventing manual ledger discrepancies or unauthorized ledger errors.<br />
              2. Cashier Clearance: Payments must be settled in full at the Accounts Cash Counter Desk within 15 days of bill issuance. Early payment entitles the pupil to up to a 10% discount on key tuition fee components.<br />
              3. Account Audit: Keep this copy of the pre-payment remit draft and subsequent computer receipt for record verification audits and sibling discounts. No manual ledger modifications are authorized.
            </div>
          </div>

          <!-- Footer signatures -->
          <div class="footer-signs">
            <div class="signature-area">
              <div class="signature-line"></div>
              <div class="signature-title">Parent / Depositor</div>
            </div>
            <div class="signature-area">
              <div style="font-size: 10px; color: #4b5563; font-weight: bold; margin-bottom: 3px;">Issued by: ${formatIssuedBy(bill.createdBy)}</div>
              <div class="signature-line"></div>
              <div class="signature-title">Cashier / Bill Generator</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const downloadClassPdfBundle = (targetClass: string, useAllFromRemit = true) => {
    const dataSource = useAllFromRemit ? remitBills : filteredBills;
    const classBills = targetClass === 'all' ? dataSource : dataSource.filter(b => b.class === targetClass);
    if (classBills.length === 0) {
      setErrorMsg(`No generated Remit Bills found${targetClass === 'all' ? '' : ` for Class ${targetClass}`}.`);
      return;
    }

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();

    if (bundleLayout === 'two_per_page') {
      // 2 students per page
      for (let i = 0; i < classBills.length; i += 2) {
        if (i > 0) {
          pdf.addPage();
        }

        // Draw student 1 in top half
        drawHalfPageBill(pdf, classBills[i], 0);

        // Draw student 2 in bottom half
        if (i + 1 < classBills.length) {
          pdf.setDrawColor(180, 180, 180);
          pdf.setLineDashPattern([2, 2], 0);
          pdf.line(10, 148.5, pageWidth - 10, 148.5);
          pdf.setLineDashPattern([], 0); // reset

          drawHalfPageBill(pdf, classBills[i + 1], 148.5);
        }
      }
    } else {
      // 1 student per page
      classBills.forEach((bill, index) => {
        if (index > 0) {
          pdf.addPage();
        }
        drawFullPageBill(pdf, bill);
      });
    }

    const fileName = targetClass === 'all' ? 'Remit_Bills_All_Classes_Bundle.pdf' : `Remit_Bills_Class_${targetClass.replace(/\s+/g, '_')}_Bundle.pdf`;
    pdf.save(fileName);
    setSuccessMsg(`Successfully prepared and downloaded the single PDF bundle containing ${classBills.length} student remit bills${targetClass === 'all' ? ' across all classes' : ` for Class ${targetClass}`}!`);
  };

  // Filters bills list
  const filteredBills = remitBills.filter(b => {
    if (filterClass !== 'all' && b.class !== filterClass) return false;
    if (filterStatus !== 'all' && b.status !== filterStatus) return false;
    if (!matchesMonthFilter(b.billingPeriod, filterStartMonth, filterEndMonth)) return false;
    if (searchTerm.trim() !== '') {
      const s = searchTerm.toLowerCase();
      const matchName = (b.studentName || '').toLowerCase().includes(s);
      const matchNo = (b.billNo || '').toLowerCase().includes(s);
      const matchRoll = (b.studentRoll || '').toLowerCase().includes(s);
      const matchId = (b.studentId || '').toLowerCase().includes(s);
      const matchTx = (b.transactionId || '').toLowerCase().includes(s);
      return matchName || matchNo || matchRoll || matchId || matchTx;
    }
    return true;
  });

  const classStudents = students.filter(s => s.class === selectedClass);

  const getPreviewValues = () => {
    const student = generationMode === 'student' && selectedStudentId 
      ? classStudents.find(s => s.id === selectedStudentId) 
      : null;
    
    const classFees = getClassFees(student ? student.class : selectedClass);
    
    // Fallback simulated student if none selected
    const mockStudent = student || {
      class: selectedClass,
      monthlyFee: classFees.tuition,
      hasTransportation: includeTransport ? 'Yes' : 'No',
      transportFee: feeStructure?.transportation?.[0]?.fee ? Number(feeStructure.transportation[0].fee) : 400,
      hasComputer: includeComputer ? 'Yes' : 'No',
      computerFee: classFees.computer || 0,
      scholarshipStatus: 'None',
      scholarshipAmount: 0
    };

    const charges = computeStudentCharges(mockStudent);
    
    const tuitionItem = charges.find(c => c.name.includes('Tuition'));
    const transportItem = charges.find(c => c.name.includes('Transportation'));
    const computerItem = charges.find(c => c.name.includes('Computer'));
    const scholarshipItem = charges.find(c => c.name.includes('Scholarship'));
    const annualItem = charges.find(c => c.name.includes('Annual Fee'));
    const admissionItem = charges.find(c => c.name.includes('Admission Fee'));
    const examItem = charges.find(c => c.name.includes('Exam Fee'));
    const scholarshipDesc = student && student.scholarshipStatus === 'Provided' ? student.scholarshipDescription : '';

    return {
      tuition: tuitionItem ? tuitionItem.rate : classFees.tuition,
      transport: transportItem ? transportItem.rate : 0,
      computer: computerItem ? computerItem.rate : 0,
      annual: annualItem ? annualItem.rate : (classFees.annual || 0),
      admission: admissionItem ? admissionItem.rate : (classFees.admission || 0),
      exam: examItem ? examItem.rate : (classFees.exam || 0),
      scholarship: scholarshipItem ? Math.abs(scholarshipItem.rate) : 0,
      scholarshipDesc
    };
  };

  const preview = getPreviewValues();

  const statsTotalGenerated = remitBills.reduce((acc, b) => acc + b.totalAmount, 0);
  const statsPending = remitBills.filter(b => b.status === 'pending').reduce((acc, b) => acc + b.totalAmount, 0);
  const statsPaid = remitBills.filter(b => b.status === 'paid').reduce((acc, b) => acc + b.totalAmount, 0);

  return (
    <div className="space-y-6 font-sans">
      {/* Top statistics banners */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Remitted Bills</span>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight mt-1">NRs. {(statsTotalGenerated || 0).toLocaleString()}</h3>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5">{remitBills.length} Bills Distributed</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-100/50 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Draft Outstanding (Guardians)</span>
            <h3 className="text-2xl font-black text-amber-700 tracking-tight mt-1">NRs. {(statsPending || 0).toLocaleString()}</h3>
            <p className="text-[10px] text-amber-600/80 font-medium mt-0.5">{remitBills.filter(b => b.status === 'pending').length} Dues Distributed</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-amber-100/70 flex items-center justify-center text-amber-500">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-100/50 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Cash counter Settled (Recieved)</span>
            <h3 className="text-2xl font-black text-emerald-700 tracking-tight mt-1">NRs. {(statsPaid || 0).toLocaleString()}</h3>
            <p className="text-[10px] text-emerald-600/80 font-medium mt-0.5">{remitBills.filter(b => b.status === 'paid').length} Bills Cleared</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-100/70 flex items-center justify-center text-emerald-500">
            <Banknote className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Alert Messaging */}
      <div id="remit-bills-alert-container" className="space-y-3">
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-4 rounded-2xl text-xs font-bold flex items-center gap-2.5 shadow-sm animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg('')} className="ml-auto hover:opacity-75"><X className="w-4 h-4" /></button>
          </div>
        )}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-5 py-4 rounded-2xl text-xs font-bold flex items-center gap-2.5 shadow-sm animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg('')} className="ml-auto hover:opacity-75"><X className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      {/* Section Navigation tabs */}
      <div className="flex flex-wrap border-b border-slate-200">
        <button
          onClick={() => {
            setActiveSubTab('generate');
          }}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-all cursor-pointer ${
            activeSubTab === 'generate'
              ? 'border-[#1B4F72] text-[#1B4F72]'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          + Generate Remit Bills
        </button>
        <button
          onClick={() => setActiveSubTab('list')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-all cursor-pointer ${
            activeSubTab === 'list'
              ? 'border-[#1B4F72] text-[#1B4F72]'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Manage Distributed Bills ({filteredBills.length})
        </button>
        <button
          onClick={() => setActiveSubTab('matrix')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'matrix'
              ? 'border-[#1B4F72] text-[#1B4F72]'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <CalendarRange className="w-4 h-4 text-blue-600" />
          <span>12-Month Academic Matrix</span>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-black">
            {currentAcademicYear} BS
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            const sid = selectedStudentId || (students[0]?.id || '');
            setReconcileStudentId(sid);
            setShowReconciliationModal(true);
          }}
          className="ml-auto my-auto px-3.5 py-1.5 text-xs font-bold rounded-xl text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition flex items-center gap-1.5 cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5 text-indigo-600" />
          <span>Reconciliation Diagnostics</span>
        </button>
      </div>

      {/* Subtab 1: List Bills */}
      {activeSubTab === 'list' && (
        <div className="space-y-4">
          {/* Class-wise Single PDF Bulk Printing Hub */}
          <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100/70 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-15 rounded-xl bg-teal-100 flex items-center justify-center text-teal-700 shrink-0 mt-0.5">
                  <FileText className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 bg-emerald-500 rounded-full"></span>
                    Class-wise Combined PDF Printing Desk
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium mt-1 leading-relaxed">
                    Download the entire class's remit bills inside <strong>one single PDF file</strong> (one student per page or two per page configuration), facilitating quick institutional bulk printing.
                  </p>
                </div>
              </div>

              {/* Layout Toggle Pill */}
              <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 self-start sm:self-center shadow-2xs">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider px-2">Print Layout:</span>
                <button
                  type="button"
                  onClick={() => setBundleLayout('one_per_page')}
                  className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                    bundleLayout === 'one_per_page'
                      ? 'bg-[#1B4F72] text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  1 per page
                </button>
                <button
                  type="button"
                  onClick={() => setBundleLayout('two_per_page')}
                  className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                    bundleLayout === 'two_per_page'
                      ? 'bg-[#1B4F72] text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  2 per page
                </button>
              </div>
            </div>

            {/* Quick buttons per class */}
            <div className="flex items-center gap-2 flex-wrap border-t border-teal-100/40 pt-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wide mr-1 select-none">Quick Combined Download:</span>
              {classes.map(c => {
                const count = remitBills.filter(b => b.class === c).length;
                if (count === 0) return null;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => downloadClassPdfBundle(c, true)}
                    className="px-3.5 py-2 text-xs bg-white hover:bg-[#1B4F72] hover:text-white border border-slate-200 hover:border-[#1B4F72] rounded-xl font-bold transition-all cursor-pointer flex items-center gap-2 shadow-2xs group"
                    title={`Download all of Class ${c} Remit Bills compiled in one single PDF`}
                  >
                    <span className="bg-slate-100 text-[#1B4F72] text-[10px] font-extrabold px-1.5 py-0.5 rounded-md group-hover:bg-white/20 group-hover:text-white transition-colors">Class {c}</span>
                    <span className="text-slate-600 font-bold group-hover:text-white/90">{count} Bill{count !== 1 ? 's' : ''}</span>
                    <FileText className="w-3.5 h-3.5 text-slate-400 group-hover:text-white" />
                  </button>
                );
              })}
              {remitBills.filter(b => b.class).length === 0 && (
                <span className="text-[10px] text-slate-400 font-bold italic">No distributed remit bills available yet. Open the 'Generate' sub-tab to distribute bills.</span>
              )}
            </div>
          </div>

          {/* Filtering bar panel */}
          <div className="bg-slate-100 border border-slate-200/80 rounded-2xl p-4 space-y-3 shadow-xs">
            <div className="flex flex-col lg:flex-row items-center gap-4">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by student name or Bill RMT- serial..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#1B4F72]/15 focus:border-[#1B4F72] outline-none transition-all font-bold text-slate-800"
                />
              </div>

              <div className="flex items-center gap-3 w-full lg:w-auto flex-wrap">
                <select
                  value={filterClass}
                  onChange={e => setFilterClass(e.target.value)}
                  className="px-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl outline-none text-slate-700 font-bold focus:border-[#1B4F72] shadow-2xs"
                >
                  <option value="all">All Classes</option>
                  {classes.map(c => (
                    <option key={c} value={c}>Class {c}</option>
                  ))}
                </select>

                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="px-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl outline-none text-slate-700 font-bold focus:border-[#1B4F72] shadow-2xs"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Distributed (Dues)</option>
                  <option value="paid">Deposited (Cleared)</option>
                  <option value="partial">Partially Paid</option>
                  <option value="void">VOID (Released)</option>
                </select>

                {selectedBillIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowBulkDeleteConfirm(true)}
                    className="px-4 py-2.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-xs active:scale-95 animate-in fade-in duration-200"
                    title="Delete all selected bills and reverse transaction histories"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedBillIds.length})</span>
                  </button>
                )}

                {filteredBills.length > 0 && (
                  <button
                    type="button"
                    onClick={() => downloadClassPdfBundle(filterClass, false)}
                    className="px-4 py-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-xs active:scale-95"
                    title="Download all of the filtered generated remit bills as a single multi-page PDF"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Download PDF Bundle ({filteredBills.length} Bill{filteredBills.length !== 1 ? 's' : ''})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: Month duration filters for easy downloads per specific calendar month */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-slate-200/80">
              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Month Duration Basis:</span>
                
                <select
                  value={filterStartMonth}
                  onChange={e => setFilterStartMonth(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none text-slate-700 font-bold focus:border-[#1B4F72] shadow-2xs"
                >
                  <option value="all">From Month (All)</option>
                  {MONTHS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>

                <span className="text-xs text-slate-400 font-bold">to</span>

                <select
                  value={filterEndMonth}
                  onChange={e => setFilterEndMonth(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none text-slate-700 font-bold focus:border-[#1B4F72] shadow-2xs"
                >
                  <option value="all">To Month (All)</option>
                  {MONTHS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>

                {(filterStartMonth !== 'all' || filterEndMonth !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterStartMonth('all');
                      setFilterEndMonth('all');
                    }}
                    className="text-[10px] text-red-650 hover:text-red-750 font-black hover:underline cursor-pointer transition-colors"
                  >
                    Reset Range
                  </button>
                )}
              </div>

              <div className="text-[10px] text-slate-500 italic font-bold">
                * PDF Bundle only compiles bills covering this selected Nepali month range.
              </div>
            </div>
          </div>

          {/* Bills Grid / Table list */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-[#1B4F72] animate-spin" />
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-3">Loading Remitted registry...</p>
            </div>
          ) : filteredBills.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center">
              <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700 uppercase">No Remit Bills Found</p>
              <p className="text-xs text-slate-400 mt-1">Configure your rates and generate bills for classwise students distributed first.</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto custom-scrollbar pb-2">
                <table className="min-w-[850px] md:min-w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      <th className="py-4 px-4 text-center w-12">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-[#1B4F72] focus:ring-[#1B4F72] w-4 h-4 cursor-pointer"
                          checked={filteredBills.length > 0 && selectedBillIds.length === filteredBills.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBillIds(filteredBills.map(b => b.id));
                            } else {
                              setSelectedBillIds([]);
                            }
                          }}
                        />
                      </th>
                      <th className="py-4 px-6 col-span-1">Bill Serial No & Date</th>
                      <th className="py-4 px-6">Student & Class Details</th>
                      <th className="py-4 px-6">Billing Period</th>
                      <th className="py-4 px-6 text-right">Requested Total</th>
                      <th className="py-4 px-6 text-center">Receipt Status</th>
                      <th className="py-4 px-6 text-right">Actions Panel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {filteredBills.map((bill) => (
                      <tr key={bill.id} className={`hover:bg-slate-50/50 transition-colors ${selectedBillIds.includes(bill.id) ? 'bg-[#f8fafc]' : ''}`}>
                        <td className="py-4 px-4 text-center w-12">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-[#1B4F72] focus:ring-[#1B4F72] w-4 h-4 cursor-pointer"
                            checked={selectedBillIds.includes(bill.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedBillIds([...selectedBillIds, bill.id]);
                              } else {
                                setSelectedBillIds(selectedBillIds.filter(id => id !== bill.id));
                              }
                            }}
                          />
                        </td>
                        <td className="py-4 px-6">
                          <span className={`font-mono font-black ${bill.status === 'void' ? 'line-through text-slate-400' : 'text-[#1B4F72]'} block`}>{bill.billNo}</span>
                          <span className="text-[10px] text-slate-400">{typeof bill.createdAt === 'object' && bill.createdAt !== null ? (bill.createdAt.seconds ? formatBSDate(new Date(bill.createdAt.seconds * 1000)) : 'N/A') : String(bill.createdAt || 'N/A')} (BS)</span>
                          {bill.reissuedFromBillNo && (
                            <span className="text-[9px] text-blue-600 font-bold block mt-0.5">Reissued from #{bill.reissuedFromBillNo}</span>
                          )}
                          {bill.reissuedToBillNo && (
                            <span className="text-[9px] text-purple-600 font-bold block mt-0.5">Reissued as #{bill.reissuedToBillNo}</span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <h4 className="font-bold text-slate-800 text-xs uppercase">{bill.studentName}</h4>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Class {bill.class} • Roll {bill.studentRoll || 'N/A'}</p>
                        </td>
                        <td className="py-4 px-6">
                          <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">{bill.billingPeriod}</span>
                        </td>
                        <td className="py-4 px-6 text-right font-black text-slate-900 text-xs">
                          NRs. {(bill?.totalAmount || 0).toLocaleString()}
                        </td>
                        <td className="py-4 px-6 text-center">
                          {bill.status === 'paid' ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                              <Check className="w-2.5 h-2.5" /> Deposited
                            </span>
                          ) : bill.status === 'partial' ? (
                            <span className="bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                              Partially Paid
                            </span>
                          ) : bill.status === 'void' || bill.status === 'cancelled' ? (
                            <span 
                              className="bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider line-through cursor-help"
                              title={`VOIDED: ${bill.voidReason || 'Clerical correction'} (${bill.voidedAt || ''})`}
                            >
                              VOID
                            </span>
                          ) : (
                            <span className="bg-amber-50 text-amber-700 border border-amber-100 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                              Distributed
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => setPrintingBill(bill)}
                            className="p-2 text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer"
                            title="Print official Remit Bill copy"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span className="text-[9px] font-bold uppercase pr-1">Print Bill</span>
                          </button>
                          
                          {bill.status === 'pending' && (
                            <button
                              onClick={() => {
                                if (onCollectGuardianCash) {
                                  onCollectGuardianCash({
                                    id: bill.id,
                                    studentId: bill.studentId,
                                    amount: bill.totalAmount,
                                    billId: bill.billNo,
                                    billingPeriod: bill.billingPeriod,
                                    itemizedCharges: bill.itemizedCharges
                                  });
                                }
                              }}
                              className="px-3 py-1.5 bg-[#1B4F72] hover:bg-[#153e5b] text-white rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer font-bold text-[10px] uppercase shadow-sm"
                              title="Redirect to the active selection Cash Counter"
                            >
                              <Banknote className="w-3.5 h-3.5" />
                              Collect Guardian Cash
                            </button>
                          )}

                          {bill.status !== 'void' && bill.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => setVoidingBill(bill)}
                              className="px-2.5 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer font-bold text-[10px] uppercase shadow-2xs"
                              title="Void or Reissue this bill (releases covered months for re-billing)"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              Void / Reissue
                            </button>
                          )}

                          <button
                            onClick={() => setBillToDelete(bill)}
                            className="p-2 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-lg transition-all cursor-pointer"
                            title="Delete / cancel issued note"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subtab 2: Config and Generate Classwise */}
      {activeSubTab === 'generate' && (
        <div className="space-y-6">
          {/* Billing Coverage Preview: 12 Nepali Months Matrix for selected class */}
          <BillingCoveragePreview
            selectedClass={selectedClass}
            classes={classes}
            onSelectClass={cls => {
              setSelectedClass(cls);
              setSelectedStudentId('');
            }}
            academicYear={currentAcademicYear}
            students={students}
            remitBills={remitBills}
            selectedStudentId={generationMode === 'student' ? selectedStudentId : undefined}
            generationMode={generationMode}
            currentSelectedMonths={periodCalc.targetMonths}
            onSelectMonth={m => handleStartMonthChange(m)}
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Config form card */}
            <div className="lg:col-span-7 bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-6">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">Configure Charges Breakdown</h3>
            
            {reissueContext && (
              <div className="bg-blue-50 border border-blue-200 text-blue-900 p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-blue-600" />
                  <span>Reissuing replacement for voided bill #{reissueContext.fromBillNo} ({reissueContext.studentName})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReissueContext(null)}
                  className="text-blue-600 hover:text-blue-800 text-[10px] uppercase font-black cursor-pointer hover:underline"
                >
                  Cancel Reissue
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Target Class</label>
                <select
                  value={selectedClass}
                  onChange={e => {
                    setSelectedClass(e.target.value);
                    setSelectedStudentId('');
                  }}
                  className="w-full px-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-700"
                >
                  <option value="">Select Class</option>
                  {classes.map(c => (
                    <option key={c} value={c}>Class {c}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Generation Mode</label>
                <div className="flex border border-slate-200 rounded-xl overflow-hidden bg-slate-50 text-xs font-bold mt-0.5">
                  <button
                    type="button"
                    onClick={() => setGenerationMode('class')}
                    className={`flex-1 py-2 text-center transition-all ${generationMode === 'class' ? 'bg-[#1B4F72] text-white' : 'text-slate-600'}`}
                  >
                    All Class {selectedClass} Students
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenerationMode('student')}
                    className={`flex-1 py-2 text-center transition-all ${generationMode === 'student' ? 'bg-[#1B4F72] text-white' : 'text-slate-600'}`}
                  >
                    Single Student
                  </button>
                </div>
              </div>
            </div>

            {generationMode === 'student' && (
              <div className="space-y-4 animate-in fade-in">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Student</label>
                  <select
                    value={selectedStudentId}
                    onChange={e => setSelectedStudentId(e.target.value)}
                    className="w-full px-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-700"
                  >
                    <option value="">-- Choose Student --</option>
                    {classStudents.map(s => (
                      <option key={s.id} value={s.id}>{s.fullName || s.name} (Roll: {s.rollNumber || s.studentId})</option>
                    ))}
                  </select>
                  {selectedClass && classStudents.length === 0 && (
                    <p className="text-[10px] text-red-500 font-bold">No students registered in Class {selectedClass}.</p>
                  )}
                </div>

                {selectedStudentId && (
                  <div className="bg-amber-50/70 border border-amber-200/60 p-4 rounded-2xl space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-1.5">
                        🎓 Student Scholarship / Discount
                      </span>
                      {students.find(s => s.id === selectedStudentId)?.scholarshipStatus === 'Provided' ? (
                        <span className="text-[9px] bg-emerald-600 text-white font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Active Waiver
                        </span>
                      ) : (
                        <span className="text-[9px] bg-slate-200 text-slate-600 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                          No Waiver
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Status</label>
                        <select
                          value={editingScholarshipStatus}
                          onChange={e => setEditingScholarshipStatus(e.target.value as 'Provided' | 'Not Provided')}
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none font-bold text-slate-700 focus:ring-1 focus:ring-amber-500"
                        >
                          <option value="Not Provided">Not Provided (No Discount)</option>
                          <option value="Provided">Provided (Apply Discount)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Discount Rate (Rs/Month)</label>
                        <input
                          type="number"
                          min="0"
                          disabled={editingScholarshipStatus === 'Not Provided'}
                          value={editingScholarshipAmount}
                          onChange={e => setEditingScholarshipAmount(e.target.value)}
                          placeholder="e.g. 500"
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none font-bold text-slate-700 disabled:opacity-50 focus:ring-1 focus:ring-amber-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Description / Reason</label>
                        <input
                          type="text"
                          disabled={editingScholarshipStatus === 'Not Provided'}
                          value={editingScholarshipDesc}
                          onChange={e => setEditingScholarshipDesc(e.target.value)}
                          placeholder="e.g. Merit, Sibling"
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none font-bold text-slate-700 disabled:opacity-50 focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleSaveStudentScholarship}
                        disabled={savingScholarship}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {savingScholarship ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" /> Save & Apply
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Time period options */}
            <div className="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-[#1B4F72] uppercase tracking-widest block">Standard Billing Duration</label>
                <span className="text-[10px] font-mono font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                  Nepali Academic Year: {currentAcademicYear} BS
                </span>
              </div>

              {boundaryWarning && (
                <div className="bg-amber-50 border border-amber-300 text-amber-900 p-3 rounded-xl text-xs font-semibold flex items-start gap-2 shadow-2xs animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Academic Year Boundary:</span>
                    <span className="text-[11px] text-amber-800">{boundaryWarning}</span>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[1, 3, 6, 12].map(m => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => handlePeriodMonthsChange(m)}
                    className={`py-2 px-3 border rounded-xl text-center text-xs font-black transition-all cursor-pointer ${
                      periodMonths === m
                        ? 'border-[#1B4F72] bg-[#1B4F72]/5 text-[#1B4F72]'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {m} Month{m > 1 ? 's' : ''} {m === 3 ? '(Remit Standard)' : ''}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Starting Month</span>
                  <select
                    value={startMonth}
                    onChange={e => handleStartMonthChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none text-slate-700 font-bold cursor-pointer"
                  >
                    <option value="">-- Select Month --</option>
                    {MONTHS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Ending Month</span>
                  <input
                    type="text"
                    disabled
                    readOnly
                    value={endMonth || '-- Select Month First --'}
                    className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-400 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Requested Period vs Actual Billable Period breakdown */}
              {startMonth && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-0.5">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Requested Period</span>
                    <span className="text-xs font-bold text-slate-700 block">
                      {billingPlan.requestedPeriodArrowText || `${startMonth} → ${endMonth} (${periodMonths} Months)`}
                    </span>
                  </div>
                  <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-2.5 space-y-0.5">
                    <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest block">Actual Billable Period</span>
                    <span className="text-xs font-black text-amber-900 block">
                      {billingPlan.actualBillablePeriodArrowText || billingPlan.effectiveBillHeadingPeriodTag}
                    </span>
                  </div>
                </div>
              )}

              <div className="pt-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Bill Heading Period Tag</span>
                <input
                  type="text"
                  value={periodText}
                  onChange={e => setPeriodText(e.target.value)}
                  placeholder="Select starting month above..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-700 mt-1 outline-none focus:border-[#1B4F72]"
                />
              </div>

              {/* Real-time Month-Level Billing Coverage Preview */}
              {startMonth && periodCalc.targetMonths.length > 0 && (
                <div className="mt-3 bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider">
                      Requested Period Coverage ({periodCalc.targetMonths.length} Months)
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500">
                      Target: {generationMode === 'student' ? '1 Student' : `${classStudents.length} Students`}
                    </span>
                  </div>

                  {/* Period breakdown: Requested, Already Billed, New Billable */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-bold">Requested:</span>
                      <span className="font-extrabold text-slate-800">
                        {billingPlan.requestedPeriodArrowText || `${startMonth} → ${endMonth} (${periodCalc.targetMonths.length} Months)`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-bold">Already Billed:</span>
                      <span className={`font-extrabold ${billingPlan.alreadyBilledMonths.length > 0 ? 'text-rose-700' : 'text-slate-600'}`}>
                        {billingPlan.alreadyBilledMonths.length > 0 ? billingPlan.alreadyBilledMonths.join(', ') : 'None'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-bold">New Billable:</span>
                      <span className={`font-extrabold ${billingPlan.billableMonths.length > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {billingPlan.billableMonths.length > 0
                          ? `${billingPlan.billableMonths.join(', ')} (${billingPlan.billableMonths.length} Month${billingPlan.billableMonths.length > 1 ? 's' : ''})`
                          : 'No New Billable Months'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {coverageAnalysis.monthBreakdown.map(mb => {
                      const isAllBilled = mb.status === 'ALL_BILLED';
                      const isSomeBilled = mb.status === 'SOME_BILLED';
                      return (
                        <div
                          key={mb.monthId || mb.monthName}
                          className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-2 ${
                            isAllBilled
                              ? 'bg-rose-50 border-rose-200 text-rose-800 font-bold'
                              : isSomeBilled
                              ? 'bg-amber-50 border-amber-200 text-amber-800 font-bold'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-800 font-bold'
                          }`}
                        >
                          <span className="font-black">{mb.monthName}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/80 border border-current/20 font-semibold">
                            {isAllBilled
                              ? `Billed (${mb.billedCount}/${coverageAnalysis.totalTargetStudents})`
                              : isSomeBilled
                              ? `Partial (${mb.billedCount}/${coverageAnalysis.totalTargetStudents})`
                              : `Unbilled (0/${coverageAnalysis.totalTargetStudents})`}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Authoritative Universal Billing Engine Banner */}
                  <div className={`p-4 rounded-2xl border text-xs space-y-3 animate-in fade-in ${
                    universalCoverage.overallStatus === 'NOTHING_NEW_TO_GENERATE'
                      ? 'bg-rose-50/80 border-rose-200 text-rose-950'
                      : universalCoverage.overallStatus === 'READY_TO_GENERATE_MISSING'
                      ? 'bg-blue-50/80 border-blue-200 text-blue-950'
                      : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                  }`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        {universalCoverage.overallStatus === 'NOTHING_NEW_TO_GENERATE' ? (
                          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                        ) : (
                          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black block text-xs uppercase tracking-wide">
                              {universalCoverage.overallStatus === 'NOTHING_NEW_TO_GENERATE'
                                ? '🔴 Nothing New to Generate'
                                : universalCoverage.overallStatus === 'READY_TO_GENERATE_MISSING'
                                ? '🟢 Ready to Generate Missing Charges'
                                : '🟢 Ready to Generate Standard Remit Bills'}
                            </span>
                            <span className="bg-white/90 border border-current/20 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                              Duplicate-Safe Billing Engine
                            </span>
                          </div>
                          <p className="text-[11px] font-medium leading-relaxed mt-1 opacity-90">
                            {universalCoverage.summaryMessage}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowExceptionManager(!showExceptionManager)}
                        className="px-3 py-1.5 bg-white border border-current/30 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer shrink-0 shadow-2xs hover:bg-white/80"
                      >
                        {showExceptionManager ? 'Hide Pupil List' : `Review Pupils (${coverageStats.billableStudentsCount} Billable)`}
                      </button>
                    </div>

                    {/* Coverage statistics pills */}
                    <div className="flex flex-wrap gap-2 pt-1 border-t border-current/10 text-[10px] font-bold">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-100/90 text-emerald-900 border border-emerald-300">
                        ✓ {universalCoverage.unbilledStudentsCount} Fully Unbilled
                      </span>
                      {universalCoverage.partiallyCoveredStudentsCount > 0 && (
                        <span className="px-2.5 py-1 rounded-lg bg-blue-100/90 text-blue-900 border border-blue-300">
                          ⚡ {universalCoverage.partiallyCoveredStudentsCount} Partial (Smart Missing Charges)
                        </span>
                      )}
                      {universalCoverage.fullyCoveredStudentsCount > 0 && (
                        <span className="px-2.5 py-1 rounded-lg bg-rose-100/90 text-rose-900 border border-rose-300">
                          ⏸ {universalCoverage.fullyCoveredStudentsCount} Already 100% Covered (Zero Duplicate)
                        </span>
                      )}
                      {excludedStudentIds.length > 0 && (
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-300">
                          ✕ {excludedStudentIds.length} Manually Excluded
                        </span>
                      )}
                    </div>

                    {/* Pupil-by-Pupil Review Drawer */}
                    {showExceptionManager && (
                      <div className="mt-3 bg-white rounded-xl border border-slate-200 p-3 space-y-2 max-h-60 overflow-y-auto divide-y divide-slate-100 shadow-inner">
                        <div className="flex items-center justify-between pb-1.5 text-[10px] font-black uppercase text-slate-500">
                          <span>Pupil Name & Roll</span>
                          <span>Coverage Status & Action</span>
                        </div>
                        {pupilCoverageList.map((pupil, idx) => {
                          const isExcluded = excludedStudentIds.includes(pupil.studentId);
                          return (
                            <div key={pupil.studentId || `pupil-${idx}`} className="pt-2 pb-1.5 flex items-center justify-between text-xs">
                              <div>
                                <span className="font-black text-slate-800 block text-xs">{pupil.studentName}</span>
                                <span className="text-[10px] text-slate-400 font-semibold">Roll: {pupil.studentRoll || 'N/A'} • Class {pupil.class}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-right">
                                  {pupil.isCompletelyUnbilled ? (
                                    <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                                      Will bill all {pupil.unbilledMonths?.length || 0}M (NRs. {(pupil.totalNewAmount ?? 0).toLocaleString()})
                                    </span>
                                  ) : pupil.isPartiallyCovered ? (
                                    <span className="text-[9px] font-black text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                                      Bills missing {pupil.unbilledMonths?.join(', ') || ''} (NRs. {(pupil.totalNewAmount ?? 0).toLocaleString()})
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                      Already 100% billed
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExcludedStudentIds(prev => 
                                      isExcluded ? prev.filter(id => id !== pupil.studentId) : [...prev, pupil.studentId]
                                    );
                                  }}
                                  className={`text-[9px] font-black px-2 py-1 rounded-md border transition cursor-pointer ${
                                    isExcluded
                                      ? 'bg-rose-600 text-white border-rose-700'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                                  }`}
                                >
                                  {isExcluded ? 'Excluded' : 'Exclude'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Advanced Billing Actions Box */}
                    {universalCoverage.overallStatus === 'NOTHING_NEW_TO_GENERATE' && (
                      <div className="mt-3 bg-white/95 rounded-xl border border-rose-200 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider">
                            Advanced Billing Actions
                          </span>
                          <span className="text-[10px] font-bold text-rose-600">
                            Safe Accounting Workflows
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setFilterClass(selectedClass);
                              setActiveSubTab('list');
                            }}
                            className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-center text-xs font-bold text-slate-800 transition cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 mx-auto mb-1 text-slate-600" />
                            View Existing Bills
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => {
                              // Find bill for selected pupil or class
                              const candidateBill = remitBills.find(b => 
                                (generationMode === 'student' ? b.studentId === selectedStudentId : (b.class || '').toLowerCase() === selectedClass.toLowerCase()) &&
                                (b.status === 'pending' || b.status === 'partial')
                              );
                              if (candidateBill) {
                                setVoidingBill(candidateBill);
                              } else {
                                setActiveSubTab('list');
                              }
                            }}
                            className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-center text-xs font-bold text-amber-800 transition cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5 mx-auto mb-1 text-amber-600" />
                            Void & Reissue
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              // Focus miscellaneous charge section
                              const input = document.querySelector('input[placeholder*="Terminal Exam Fee"]') as HTMLInputElement;
                              if (input) input.focus();
                            }}
                            className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-center text-xs font-bold text-blue-800 transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 mx-auto mb-1 text-blue-600" />
                            Add Supplementary Fee
                          </button>

                          <button
                            type="button"
                            onClick={() => setShowAuthorizedOverrideModal(true)}
                            className="p-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl text-center text-xs font-bold text-rose-800 transition cursor-pointer"
                          >
                            <ShieldAlert className="w-3.5 h-3.5 mx-auto mb-1 text-rose-600" />
                            Authorized Override
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 1 & 2 Verification Details */}
              {startMonth && (
                <div className="mt-3 bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#1B4F72]" />
                      <span className="text-xs font-black uppercase text-slate-800 tracking-wider">
                        Multi-Step Duplicate Prevention Verification
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => triggerFirestoreVerification()}
                      disabled={verifyingFirestore || targetStudentsForGen.length === 0}
                      className="text-[10px] font-bold text-[#1B4F72] hover:text-[#133c57] flex items-center gap-1 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
                    >
                      {verifyingFirestore ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      {verifyingFirestore ? 'Querying Firestore...' : 'Re-verify in Firestore'}
                    </button>
                  </div>

                  {/* Step 1: Mapping to Nepali Month IDs */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-[9px] font-black">1</span>
                        Mapped Nepali Month IDs ({mappedNepaliMonthIds.length} Months)
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400">
                        Session {currentAcademicYear} BS
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {mappedNepaliMonthIds.map(m => (
                        <div
                          key={m.monthId}
                          className="px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs flex items-center gap-2 text-xs font-bold text-slate-700"
                        >
                          <span className="w-5 h-5 rounded-lg bg-blue-100 text-blue-800 text-[10px] font-black flex items-center justify-center">
                            {m.code}
                          </span>
                          <span className="text-slate-900 font-extrabold">{m.monthName}</span>
                          <span className="text-[10px] font-mono text-slate-500 font-normal">
                            ({m.monthId})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Step 2: Firestore Verification Status */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-[#1B4F72] text-white flex items-center justify-center text-[9px] font-black">2</span>
                        Firestore Record Cross-Check
                      </span>
                      {verifyingFirestore && (
                        <span className="text-[10px] text-blue-600 font-bold flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Checking Firestore...
                        </span>
                      )}
                    </div>

                    {universalCoverage.overallStatus === 'NOTHING_NEW_TO_GENERATE' ? (
                      <div className="bg-rose-50 border border-rose-300 rounded-xl p-3 space-y-2 text-xs text-rose-900 animate-in fade-in">
                        <div className="flex items-start gap-2">
                          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <span className="font-black text-rose-950 block">
                              Active Billing Records Detected in Firestore ({universalCoverage.fullyCoveredStudentsCount} student{universalCoverage.fullyCoveredStudentsCount > 1 ? 's' : ''})
                            </span>
                            <p className="text-[11px] text-rose-800 leading-relaxed font-medium">
                              All requested months ({billingPlan.requestedMonths.join(', ')}) already have active remit bills. Duplicate generation is locked.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : universalCoverage.overallStatus === 'READY_TO_GENERATE_MISSING' ? (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 flex items-center justify-between text-xs text-blue-950 animate-in fade-in">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                          <span className="font-bold text-[11px]">
                            Missing charge items identified. System will generate bills only for unbilled months.
                          </span>
                        </div>
                        <span className="text-[10px] bg-blue-600 text-white font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Ready for Missing
                        </span>
                      </div>
                    ) : (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center justify-between text-xs text-emerald-900 animate-in fade-in">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="font-bold text-[11px]">
                            Firestore Verified: No existing bills found for requested period ({billingPlan.requestedMonths.join(', ')}).
                          </span>
                        </div>
                        <span className="text-[10px] bg-emerald-600 text-white font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Safe to Generate
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Invariant calculations selections */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Standard Fee Categories to Load</label>
              
              <div className="space-y-2">
                <label className="flex items-center gap-3 bg-slate-50 border border-slate-100 p-3 rounded-xl cursor-pointer hover:bg-slate-100/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={includeTuition}
                    onChange={e => setIncludeTuition(e.target.checked)}
                    className="w-4 h-4 text-[#1B4F72] border-slate-300 rounded focus:ring-[#1B4F72]"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-700">Monthly Tuition Cost</span>
                    <p className="text-[10px] text-slate-400 font-medium">Loads standard monthly rate (multiplied by {billingPlan.sandboxPreview.actualBillableMonthsCount} unbilled month{billingPlan.sandboxPreview.actualBillableMonthsCount > 1 ? 's' : ''})</p>
                  </div>
                </label>

                <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeTransport}
                      onChange={e => setIncludeTransport(e.target.checked)}
                      className="w-4 h-4 text-[#1B4F72] border-slate-300 rounded focus:ring-[#1B4F72]"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-700">Transportation Costs</span>
                      <p className="text-[10px] text-slate-400 font-medium">Auto-calculated per unbilled month ({billingPlan.sandboxPreview.actualBillableMonthsCount}x) for enrolled pupils</p>
                    </div>
                  </label>
                </div>

                <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeComputer}
                      onChange={e => setIncludeComputer(e.target.checked)}
                      className="w-4 h-4 text-[#1B4F72] border-slate-300 rounded focus:ring-[#1B4F72]"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-700">Computer Labs Cost</span>
                      <p className="text-[10px] text-slate-400 font-medium">Auto-calculated per unbilled month ({billingPlan.sandboxPreview.actualBillableMonthsCount}x) for applicable classes</p>
                    </div>
                  </label>
                </div>

                <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeAcademy}
                      onChange={e => setIncludeAcademy(e.target.checked)}
                      className="w-4 h-4 text-[#1B4F72] border-slate-300 rounded focus:ring-[#1B4F72]"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-700">Academy & Sports Facilities Fee</span>
                      <p className="text-[10px] text-slate-400 font-medium">Flat expense for extra-curricular development</p>
                    </div>
                  </label>
                  {includeAcademy && (
                    <div className="flex items-center gap-3 pl-7 pt-1 animate-in slide-in-from-top-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Amount NRs.</span>
                      <input
                        type="number"
                        value={academyFeeRate}
                        onChange={e => setAcademyFeeRate(e.target.value)}
                        className="w-24 px-2 py-1 text-xs border border-slate-200 rounded bg-white outline-none font-bold"
                      />
                      <span className="text-[10px] text-slate-400 font-medium">Per Month flat</span>
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeAnnual}
                      onChange={e => setIncludeAnnual(e.target.checked)}
                      className="w-4 h-4 text-[#1B4F72] border-slate-300 rounded focus:ring-[#1B4F72]"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-700">Annual Fee</span>
                      <p className="text-[10px] text-slate-400 font-medium">Applied once per bill as defined in Class Fee structure</p>
                    </div>
                  </label>
                </div>

                <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeAdmission}
                      onChange={e => setIncludeAdmission(e.target.checked)}
                      className="w-4 h-4 text-[#1B4F72] border-slate-300 rounded focus:ring-[#1B4F72]"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-700">Admission Fee</span>
                      <p className="text-[10px] text-slate-400 font-medium">Applied once per bill as defined in Class Fee structure</p>
                    </div>
                  </label>
                </div>

                <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeExam}
                      onChange={e => setIncludeExam(e.target.checked)}
                      className="w-4 h-4 text-[#1B4F72] border-slate-300 rounded focus:ring-[#1B4F72]"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-700">Terminal Exam Fee</span>
                      <p className="text-[10px] text-slate-400 font-medium">Applied once per bill as defined in Class Fee structure</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Custom/Extra custom items list */}
            <div className="space-y-3 bg-slate-50/20 p-4 rounded-2xl border border-dashed border-slate-200">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Extra Miscellaneous Items (Uniform, Exams, Books)</label>
              
              {customChargesList.length > 0 && (
                <div className="space-y-1.5 pb-2">
                  {customChargesList.map(c => (
                    <div key={c.id} className="flex items-center justify-between text-xs bg-white border border-slate-100 px-3 py-1.5 rounded-lg">
                      <span className="font-bold text-slate-700">{c.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-400 font-bold">{c.isMonthly ? `NRs. ${c.amount}/month` : `NRs. ${c.amount} (Flat)`}</span>
                        <button onClick={() => removeCustomCharge(c.id)} className="text-red-500 hover:text-red-700"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-end gap-3 pt-1 border-t border-slate-100">
                <div className="flex-1 w-full space-y-1">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Purpose</span>
                  <input
                    type="text"
                    value={newCustomChargeName}
                    onChange={e => setNewCustomChargeName(e.target.value)}
                    placeholder="e.g. Terminal Exam Fee"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none font-medium"
                  />
                </div>
                <div className="w-32 space-y-1">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Amount NRs.</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={newCustomChargeAmount}
                    onKeyDown={handleDigitsOnlyKeyDown}
                    onChange={e => setNewCustomChargeAmount(sanitizeDigitsOnly(e.target.value))}
                    placeholder="500"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none font-medium"
                  />
                </div>
                <label className="flex items-center gap-1.5 pb-2 cursor-pointer self-start sm:self-center">
                  <input
                    type="checkbox"
                    checked={newCustomChargeIsMonthly}
                    onChange={e => setNewCustomChargeIsMonthly(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300"
                  />
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">Monthly</span>
                </label>
                <button
                  type="button"
                  onClick={addCustomCharge}
                  className="px-3 py-1.5 bg-slate-800 hover:text-white hover:bg-slate-900 border border-slate-800 text-white rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer"
                >
                  Add Item
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              {authorizedOverrideInfo && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-900 rounded-xl text-xs font-bold border border-amber-300">
                  <ShieldAlert className="w-4 h-4 text-amber-700" />
                  <span>Override Active: {authorizedOverrideInfo.reason}</span>
                  <button
                    type="button"
                    onClick={() => setAuthorizedOverrideInfo(null)}
                    className="ml-1 text-amber-700 hover:text-amber-950 font-black cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              )}
              <button
                type="button"
                disabled={
                  generating || 
                  verifyingFirestore ||
                  (generationMode === 'student' && !selectedStudentId) || 
                  (!authorizedOverrideInfo && !billingPlan.isGenerationAllowed)
                }
                onClick={handleGenerateBills}
                className="px-6 py-3 rounded-xl bg-[#1B4F72] hover:bg-[#133c57] text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 active:scale-[0.98] cursor-pointer inline-flex items-center gap-1.5 shadow-md shadow-slate-200"
              >
                {generating || verifyingFirestore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {generating
                  ? 'Issuing Drafts...'
                  : verifyingFirestore
                  ? 'Verifying in Firestore...'
                  : authorizedOverrideInfo
                  ? `Authorized Override: Issue Bills (${targetStudentsForGen.length} Students)`
                  : billingPlan.buttonLabel}
              </button>
            </div>
          </div>

          {/* Large Sandbox Preview Card */}
          <div className="lg:col-span-5 bg-slate-900 text-slate-100 rounded-3xl p-6 shadow-xl space-y-6 flex flex-col justify-between self-stretch relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Printer className="w-64 h-64" />
            </div>

            <div className="relative z-10 space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase text-emerald-400 tracking-widest leading-none">PREVIEW ONLY — NO FINANCIAL RECORD CREATED</h4>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">Live simulation for Class {selectedClass} rate</p>
                </div>
                <span className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-black uppercase tracking-wider">SANDBOX SIMULATION</span>
              </div>

              {/* Sample Calculation Sheet representation */}
              <div className="space-y-4 pt-2">
                <div className="flex justify-between items-center bg-slate-800/40 p-3 rounded-2xl border border-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Example student rate</span>
                    <span className="text-xs font-bold text-slate-200 uppercase">{billingPlan.sandboxPreview.studentName}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Billable Period</span>
                    <span className="text-xs font-black text-amber-400 tracking-wider font-mono">
                      {billingPlan.sandboxPreview.actualBillablePeriodText}
                    </span>
                  </div>
                </div>

                {/* Items Breakdown list */}
                <div className="space-y-2">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Charges Breakdown list</span>
                  <div className="divide-y divide-slate-800 text-xs">
                    {billingPlan.sandboxPreview.items.length === 0 ? (
                      <div className="py-4 text-center text-slate-500 text-xs italic">
                        No charges to apply for this period.
                      </div>
                    ) : (
                      billingPlan.sandboxPreview.items.map((item, idx) => (
                        <div key={idx} className={`py-2 flex justify-between ${item.isDeduction ? 'text-purple-300' : 'text-slate-300'}`}>
                          <span>{item.name}</span>
                          <span className="font-mono">{item.isDeduction ? '-' : ''}NRs. {(item.total ?? item.amount ?? 0).toLocaleString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Simulated Bill Footer Summary */}
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-800 space-y-2 mt-6 relative z-10">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Total cost shown to Guardian</span>
                <span className="text-xl font-mono font-black text-emerald-400">
                  NRs. {(billingPlan.sandboxPreview?.totalAmount ?? 0).toLocaleString()}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal">
                This is a realistic bill structure matching parent requests. Guardians must clear this block before classes recommence. Upon receiving money at the cash collection counter, outstanding is updated automatically.
              </p>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Subtab 3: 12-Month Academic Matrix */}
      {activeSubTab === 'matrix' && (
        <AcademicYearBillingMatrix
          students={students}
          remitBills={remitBills}
          classes={classes}
          selectedClass={selectedClass || classes[0] || '1'}
          onSelectClass={cls => setSelectedClass(cls)}
          academicYear={currentAcademicYear}
          onQuickGenerateMonth={(cls, month) => {
            setSelectedClass(cls);
            setGenerationMode('class');
            setSelectedStudentId('');
            setStartMonth(month);
            handlePeriodMonthsChange(1);
            setActiveSubTab('generate');
          }}
          onViewBillDetails={bill => setPrintingBill(bill)}
          onOpenVoidModal={bill => setVoidingBill(bill)}
        />
      )}

      {/* MODAL 1: Realistic Print-Friendly Bill view */}
      {printingBill && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4 backdrop-blur-xs font-sans">
          <div className="bg-white text-slate-900 rounded-3xl w-full max-w-3xl max-h-[calc(100vh-2rem)] flex flex-col border border-slate-200 overflow-hidden shadow-2xl relative">
            {/* Top print trigger controls bar */}
            <div className="bg-slate-50 border-b border-slate-100 p-3 sm:p-4 flex items-center justify-between no-print shrink-0">
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide truncate pr-2">Pre-Payment Bill Preview</span>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => downloadSingleBillPdf(printingBill)}
                  className="px-2.5 py-1.5 sm:px-4 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] sm:text-xs font-bold transition-all cursor-pointer flex items-center gap-1 sm:gap-1.5 shadow-xs shrink-0"
                  title="Download dynamic billing document as pristine-quality PDF"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => printSingleBillRemit(printingBill)}
                  className="px-2.5 py-1.5 sm:px-4 sm:py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[10px] sm:text-xs font-bold transition-all cursor-pointer flex items-center gap-1 sm:gap-1.5 shrink-0"
                  title="Trigger browser page print view"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintingBill(null)}
                  className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 rounded-lg shrink-0"
                  aria-label="Close"
                >
                  <X className="w-4 sm:w-5 h-4 sm:h-5" />
                </button>
              </div>
            </div>

            {/* actual bill copy container */}
            <div className="p-4 sm:p-8 space-y-6 text-slate-800 overflow-y-auto flex-1 print:p-0 relative" id="remit-bill-printable">
              
              {/* Logo Watermark in background */}
              <div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 sm:w-96 sm:h-96 bg-contain bg-no-repeat bg-center opacity-[0.06] pointer-events-none select-none z-0"
                style={{ backgroundImage: `url('${logoImage || "/logo.png"}')` }}
              />

              {/* Header block */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-6 relative z-10">
                <div className="flex items-start gap-4">
                  <img src={logoImage || "/logo.png"} alt="Shikshantar Academy Logo" className="w-16 h-16 object-contain shrink-0" referrerPolicy="no-referrer" />
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none uppercase">Shikshantar Academy</h2>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1.5 leading-tight">Bastipur, Karjanha-05, Siraha, Nepal • Ph: +977 9709867048, +977 9807790805</p>
                    <div className="mt-2 inline-flex">
                      <span className="text-[10px] text-indigo-755 font-bold uppercase tracking-wider bg-indigo-50/80 border border-indigo-100/50 rounded-full px-2.5 py-0.5 whitespace-nowrap shadow-sm">
                        PRE-PAYMENT REMIT BILL
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <h3 className="text-base font-mono font-black text-[#1B4F72] leading-none uppercase">{printingBill.billNo}</h3>
                  <p className="text-[10px] text-slate-400 mt-1">Issue Date: {typeof printingBill.createdAt === 'object' && printingBill.createdAt !== null ? (printingBill.createdAt.seconds ? formatBSDate(new Date(printingBill.createdAt.seconds * 1000)) : 'N/A') : String(printingBill.createdAt || 'N/A')} (BS)</p>
                  <p className="text-[10px] text-slate-400">Due Date: Within 15 Days</p>
                </div>
              </div>

              {/* Student info box */}
              <div className="bg-slate-50/80 border border-slate-100 rounded-2xl p-4 grid grid-cols-2 gap-4 text-xs relative z-10">
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Charged to Pupil</span>
                  <span className="font-black text-slate-800 uppercase block mt-0.5">{printingBill.studentName}</span>
                  <span className="text-[10px] text-slate-500">ID / Roll No: {printingBill.studentRoll || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Class & Period Details</span>
                  <span className="font-bold text-slate-700 block mt-0.5">Grade: Class {printingBill.class}</span>
                  <span className="text-[10px] text-indigo-700 font-black uppercase tracking-wide">Period: {printingBill.billingPeriod}</span>
                </div>
                {(() => {
                  const studentObj = students?.find(s => s.id === printingBill.studentId);
                  const resolvedG = (printingBill.guardianName && printingBill.guardianName.trim() !== '' && printingBill.guardianName.toLowerCase() !== 'unknown')
                    ? printingBill.guardianName
                    : ((studentObj?.guardianName && studentObj.guardianName.trim() !== '' && studentObj.guardianName.toLowerCase() !== 'unknown')
                      ? studentObj.guardianName
                      : (studentObj?.fatherName && studentObj.fatherName.trim() !== ''
                        ? studentObj.fatherName
                        : (studentObj?.motherName && studentObj.motherName.trim() !== '' ? studentObj.motherName : 'Unknown')));
                  
                  return (
                    <div className="col-span-2 border-t border-slate-100 pt-2 mt-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Guardian Info (Dues Depositor)</span>
                      <span className="font-bold text-slate-600 block">{resolvedG}</span>
                    </div>
                  );
                })()}
              </div>

              {/* Itemized charges table */}
              <div className="space-y-2 relative z-10">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">Line Items Cost breakdown</h4>
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                      <th className="py-2">Description of Dues</th>
                      <th className="py-2 text-right">Standard Rate (Monthly)</th>
                      <th className="py-2 text-center">Months Covered</th>
                      <th className="py-2 text-right pr-2">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-medium">
                    {formatRemitBillItems(printingBill.itemizedCharges).map((item, index) => (
                      <tr key={index}>
                        <td className="py-2.5 font-bold text-slate-700">{item.name}</td>
                        <td className="py-2.5 text-right font-mono text-slate-500">{item.rateStr}</td>
                        <td className="py-2.5 text-center font-bold text-slate-600">{item.durationStr}</td>
                        <td className="py-2.5 text-right font-mono font-bold text-slate-800 pr-2">{item.totalStr}</td>
                      </tr>
                    ))}
                    <tr className="font-black bg-slate-50/50 border-t border-slate-200">
                      <td colSpan={3} className="py-3 px-3 uppercase tracking-wider text-[10px] text-slate-500">Gross Total Outstanding Payable</td>
                      <td className="py-3 text-right font-mono text-[#1B4F72] text-sm pr-2">NRs. {(printingBill?.totalAmount || 0).toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Payment instructions footer */}
              <div className="text-xs pt-4 border-t border-slate-100 space-y-3 relative z-10">
                {printingBill.status === 'paid' && (
                  <div className="absolute right-4 top-4 border-8 border-emerald-500/30 text-emerald-600/70 text-lg font-black uppercase tracking-widest rounded-xl p-3 select-none -rotate-12 transform">
                    CASH COLLECTED
                  </div>
                )}
                
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Filing Notes & Instructions</span>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-semibold space-y-1">
                    1. Secure Draft: This pre-payment Remit Bill keeps the bill secure, preventing manual ledger discrepancies or unauthorized ledger errors.<br />
                    2. Cashier Clearance: Payments must be settled in full at the Accounts Cash Counter Desk within 15 days of bill issuance. Early payment entitles the pupil to up to a 10% discount on key tuition fee components.<br />
                    3. Account Audit: Keep this copy of the pre-payment remit draft and subsequent computer receipt for record verification audits and sibling discounts. No manual ledger modifications are authorized.
                  </p>
                </div>

                <div className="flex justify-between items-end pt-8">
                  <div>
                    <div className="w-36 border-b border-dashed border-slate-400 mt-6 pb-1"></div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-2">Parent / Depositer signature</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-[9px] text-[#1B4F72] block pb-0.5 font-bold">Issued by: {formatIssuedBy(printingBill.createdBy)}</span>
                    <div className="w-36 border-b border-dashed border-slate-400 mt-6 pb-1 ml-auto"></div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pr-2">Cashier / Bill Generator</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 2: Record guardian payment receipt cash */}
      {payingBill && (() => {
        const studentObj = students?.find(s => s.id === payingBill.studentId);
        const resolvedGuardian = (payingBill.guardianName && payingBill.guardianName.trim() !== '' && payingBill.guardianName.toLowerCase() !== 'unknown')
          ? payingBill.guardianName
          : ((studentObj?.guardianName && studentObj.guardianName.trim() !== '' && studentObj.guardianName.toLowerCase() !== 'unknown')
            ? studentObj.guardianName
            : (studentObj?.fatherName && studentObj.fatherName.trim() !== ''
              ? studentObj.fatherName
              : (studentObj?.motherName && studentObj.motherName.trim() !== '' ? studentObj.motherName : 'Unknown')));

        const backDues = remitBills.filter(
          b => b.studentId === payingBill.studentId && b.id !== payingBill.id && b.status === "pending"
        );
        const totalBackDue = backDues.reduce((sum, b) => sum + b.totalAmount, 0);
        const currentAmount = payingBill.totalAmount;
        const grandTotal = settleMode === 'all' ? (currentAmount + totalBackDue) : currentAmount;

        return createPortal(
          <div 
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setPayingBill(null);
                setCashReceived('');
                setPaymentRemarks('');
                setIsSignVerified(false);
              }
            }}
            className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto backdrop-blur-xs font-sans"
          >
            <div className="bg-white rounded-3xl w-full max-w-3xl border border-slate-200 overflow-hidden shadow-2xl relative block animate-in zoom-in-95 my-8">
              {/* Header */}
              <div className="bg-gradient-to-r from-[#1B4F72] to-[#2471A3] px-6 py-5 text-white flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-black uppercase text-blue-100 tracking-widest bg-blue-900/30 px-2.5 py-1 rounded-md">Live Cashier Terminal</span>
                  <h3 className="text-base font-black uppercase tracking-wider mt-1.5 flex items-center gap-1.5">
                    <Banknote className="w-5 h-5 text-emerald-300 animate-pulse" />
                    Record Guardian Cash Deposit
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setPayingBill(null);
                    setCashReceived('');
                    setPaymentRemarks('');
                    setIsSignVerified(false);
                  }}
                  className="p-2 hover:bg-white/10 rounded-xl text-white/80 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 max-h-[80vh] overflow-y-auto">
                {/* Left Side: Ledger Details Breakdown */}
                <div className="md:col-span-7 space-y-5">
                  {/* Pupil Profile Card */}
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl space-y-3 font-medium text-xs text-slate-650">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block pl-0.5">Depositor & Pupil Identification</span>
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-extrabold text-slate-800 text-sm uppercase">{payingBill.studentName}</h4>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Class {payingBill.class} • Roll: {payingBill.studentRoll || 'N/A'}</p>
                      </div>
                      <span className="px-2 py-0.5 bg-[#1B4F72]/10 text-[#1B4F72] text-[9px] font-black rounded-md uppercase">Pupil Verified</span>
                    </div>

                    <div className="border-t border-slate-200/50 pt-2.5 flex items-center justify-between">
                      <div>
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Guardian Info (Depositer)</span>
                        <span className="text-xs font-black text-slate-700">{resolvedGuardian}</span>
                      </div>
                      <span className="text-[8px] font-bold text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded italic">Database Match</span>
                    </div>
                  </div>

                  {/* Current Remittance Billing Segment */}
                  <div className="border border-indigo-100 bg-indigo-50/25 p-4 rounded-2xl space-y-2.5">
                    <div className="flex justify-between items-center border-b border-indigo-100/50 pb-1.5">
                      <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block">1. Recent Remittance Bill</span>
                      <span className="font-mono text-[9px] text-white bg-indigo-600 font-black px-2 py-0.5 rounded">{payingBill.billNo}</span>
                    </div>

                    <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                      <span>Covering Billing Period:</span>
                      <span className="text-slate-800 font-extrabold">{payingBill.billingPeriod}</span>
                    </div>

                    {/* Cost Breakdown Lines */}
                    <div className="space-y-1.5 pt-1.5">
                      {formatRemitBillItems(payingBill.itemizedCharges).map((c, i) => (
                        <div key={i} className="flex justify-between text-xs text-slate-600 font-medium">
                          <span className="text-slate-500">{c.name}{c.months > 0 ? ` (${c.months}M)` : ''}:</span>
                          <span className="font-bold text-slate-700">{c.totalStr}</span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-indigo-100 pt-2 flex justify-between items-center text-xs font-black">
                      <span className="text-indigo-600 uppercase tracking-wider">Current Amount:</span>
                      <span className="text-indigo-800 text-sm font-mono">NRs. {(currentAmount || 0).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Arrears / Back Due Segment */}
                  <div className={`border rounded-2xl p-4 space-y-2.5 ${totalBackDue > 0 ? 'border-amber-200 bg-amber-50/20' : 'border-slate-100 bg-slate-50/50'}`}>
                    <div className="flex justify-between items-center">
                      <span className={`text-[9px] font-black uppercase tracking-widest block ${totalBackDue > 0 ? 'text-amber-600' : 'text-slate-400'}`}>2. Arrears / Back Due Pending</span>
                      {totalBackDue > 0 ? (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[9px] font-black px-2 py-0.5 rounded uppercase animate-pulse">
                          Dues Found
                        </span>
                      ) : (
                        <span className="text-[9px] text-emerald-600 font-semibold bg-emerald-100 px-2 py-0.5 rounded uppercase font-mono">No Back Dues</span>
                      )}
                    </div>

                    {totalBackDue > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed font-sans">
                          The system detected previous uncompleted bills reflecting back dues for this pupil:
                        </p>
                        <div className="divide-y divide-amber-200/40 bg-white border border-amber-100 rounded-xl overflow-hidden shadow-2xs">
                          {backDues.map((b) => (
                            <div key={b.id} className="p-2.5 flex items-center justify-between text-[11px] font-semibold text-slate-600">
                              <div>
                                <span className="font-mono text-amber-700 font-black block text-[10px]">{b.billNo}</span>
                                <span className="text-[9px] text-slate-400">{b.billingPeriod} ({b.periodMonths} M)</span>
                              </div>
                              <span className="font-mono text-slate-850 font-black">NRs. {(b?.totalAmount || 0).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between items-center pt-1 text-xs font-black">
                          <span className="text-amber-700 uppercase tracking-wider">Total Back Due:</span>
                          <span className="text-amber-800 font-mono">NRs. {(totalBackDue || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 font-semibold italic">There are no other historical outstanding remit bills recorded in the registry ledger for this student.</p>
                    )}
                  </div>
                </div>

                {/* Right Side: Collection controls & calculations */}
                <form onSubmit={handlePayRemitBill} className="md:col-span-5 bg-slate-50 p-5 rounded-3xl border border-slate-100 flex flex-col justify-between space-y-4 font-medium text-xs text-slate-600">
                  <div className="space-y-4 w-full">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block pl-0.5">3. Ledger Settlement Action</span>

                    {/* Settle Mode Pill Options */}
                    {totalBackDue > 0 && (
                      <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-2xs grid grid-cols-2 text-center text-[10px] font-black uppercase">
                        <button
                          type="button"
                          onClick={() => {
                            setSettleMode('current');
                            setCashReceived(String(currentAmount));
                          }}
                          className={`py-1.5 rounded-lg transition-all cursor-pointer ${settleMode === 'current' ? 'bg-[#1B4F72] text-white shadow-xs' : 'text-slate-500'}`}
                        >
                          Current Only
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSettleMode('all');
                            setCashReceived(String(currentAmount + totalBackDue));
                          }}
                          className={`py-1.5 rounded-lg transition-all cursor-pointer ${settleMode === 'all' ? 'bg-[#1B4F72] text-white shadow-xs' : 'text-slate-500'}`}
                        >
                          Clear All Dues
                        </button>
                      </div>
                    )}

                    {/* Calculation summary block */}
                    <div className="bg-white p-4 border border-slate-205 rounded-xl space-y-2 shadow-2xs font-bold text-xs text-slate-650">
                      <div className="flex justify-between">
                        <span>Current Remittance Fee:</span>
                        <span className="font-mono text-slate-850">NRs. {(currentAmount || 0).toLocaleString()}</span>
                      </div>

                      {totalBackDue > 0 && (
                        <div className="flex justify-between text-amber-700">
                          <span>Historical Back Due:</span>
                          <span className="font-mono">
                            {settleMode === 'all' ? `+ NRs. ${(totalBackDue || 0).toLocaleString()}` : `NRs. ${(totalBackDue || 0).toLocaleString()} (Skipped)`}
                          </span>
                        </div>
                      )}

                      <div className="border-t border-slate-200 pt-2.5 flex justify-between items-center font-black text-sm">
                        <span className="text-[#1B4F72] uppercase tracking-wide">TOTAL DUE:</span>
                        <span className="font-mono text-[#1B4F72] text-base">NRs. {(grandTotal || 0).toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Quick Payment Presets */}
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1 block">Quick Pay Amount</span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCashReceived(String(grandTotal))}
                          className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-black uppercase transition cursor-pointer"
                        >
                          Full: NRs. {(grandTotal || 0).toLocaleString()}
                        </button>
                        {(payingBill.periodMonths || 1) > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const oneMonthAmt = Math.round(currentAmount / (payingBill.periodMonths || 1));
                              setCashReceived(String(oneMonthAmt));
                            }}
                            className="px-2.5 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-800 text-[10px] font-black uppercase transition cursor-pointer"
                          >
                            1 Month: NRs. {Math.round(currentAmount / (payingBill.periodMonths || 1)).toLocaleString()}
                          </button>
                        )}
                        {totalBackDue > 0 && (
                          <button
                            type="button"
                            onClick={() => setCashReceived(String(currentAmount))}
                            className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-black uppercase transition cursor-pointer"
                          >
                            Current Only: NRs. {(currentAmount || 0).toLocaleString()}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Cash received collection input */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 block">Cash Received from Guardian (NRs.)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-xs text-slate-400 font-mono">NRs.</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          required
                          placeholder="Enter physical cash"
                          value={cashReceived}
                          onKeyDown={handleDigitsOnlyKeyDown}
                          onChange={e => setCashReceived(sanitizeDigitsOnly(e.target.value))}
                          className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-xl outline-none focus:ring-4 focus:ring-emerald-500/15 focus:border-[#1B4F72] text-[#1B4F72] font-black text-center text-[15px]"
                        />
                      </div>

                      {/* Live Allocation & Month Clearance Preview */}
                      {Number(cashReceived || 0) > 0 && (() => {
                        const paidNum = Number(cashReceived || 0);
                        const isPartial = paidNum < grandTotal;
                        const isOverpaid = paidNum > grandTotal;
                        const excess = paidNum - grandTotal;
                        const coveredMonths = payingBill.coveredMonths || extractCoveredMonthsFromBill(payingBill);
                        const monthCount = Math.max(1, coveredMonths.length);
                        const approxPerMonth = currentAmount / monthCount;

                        let runningCash = paidNum;
                        // Deduct back due if all mode
                        if (settleMode === 'all' && totalBackDue > 0) {
                          runningCash = Math.max(0, runningCash - totalBackDue);
                        }

                        return (
                          <div className="space-y-2 mt-2 p-3 bg-slate-100/70 border border-slate-200 rounded-xl text-xs">
                            <div className="flex items-center justify-between font-black text-[10px] uppercase">
                              <span className="text-slate-600">Month-Wise Clearance Preview</span>
                              <span className={isPartial ? 'text-amber-700' : 'text-emerald-700'}>
                                {isPartial ? 'Partial Clearance' : 'Full Clearance'}
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {coveredMonths.map((m, idx) => {
                                const monthNeeded = approxPerMonth;
                                const monthPaid = Math.min(monthNeeded, Math.max(0, runningCash));
                                runningCash -= monthPaid;
                                const isFull = monthPaid >= monthNeeded;
                                const isPart = monthPaid > 0 && monthPaid < monthNeeded;

                                return (
                                  <div
                                    key={m}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 ${
                                      isFull
                                        ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                        : isPart
                                        ? 'bg-blue-100 border-blue-300 text-blue-800'
                                        : 'bg-amber-50 border-amber-200 text-amber-700'
                                    }`}
                                  >
                                    <span>{m}</span>
                                    <span>
                                      {isFull ? '✓ Full' : isPart ? `NRs. ${Math.round(monthPaid)}` : 'Due'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            {isPartial && (
                              <p className="text-[10px] text-amber-800 font-semibold mt-1">
                                Remaining Due Balance: <strong>NRs. {((grandTotal - paidNum) || 0).toLocaleString()}</strong>
                              </p>
                            )}

                            {isOverpaid && (
                              <div className="space-y-2 pt-1 border-t border-slate-200 mt-1">
                                <div className="flex justify-between items-center text-[10px] font-bold text-emerald-800">
                                  <span>Excess Tendered:</span>
                                  <span className="font-mono font-black text-xs">+ NRs. {(excess || 0).toLocaleString()}</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Handle Excess Cash:</span>
                                  <div className="grid grid-cols-2 gap-1 text-[10px] font-black uppercase">
                                    <button
                                      type="button"
                                      onClick={() => setExcessDecision('ADVANCE')}
                                      className={`py-1 px-2 rounded-md border text-center transition cursor-pointer ${
                                        excessDecision === 'ADVANCE'
                                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                      }`}
                                    >
                                      Save as Advance
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setExcessDecision('RETURN')}
                                      className={`py-1 px-2 rounded-md border text-center transition cursor-pointer ${
                                        excessDecision === 'RETURN'
                                          ? 'bg-slate-800 text-white border-slate-900 shadow-2xs'
                                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                      }`}
                                    >
                                      Return Change
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Remarks */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 block">Payment Remarks</label>
                      <input
                        type="text"
                        value={paymentRemarks}
                        onChange={e => setPaymentRemarks(e.target.value)}
                        placeholder="e.g. Paid by father with physical cash"
                        className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-[#1B4F72]"
                      />
                    </div>

                    {/* Signature Checkbox verification */}
                    <label className="flex items-start gap-2.5 bg-slate-100/50 p-3 rounded-2xl border border-slate-100 cursor-pointer hover:bg-slate-100/85 transition-colors">
                      <input
                        type="checkbox"
                        required
                        checked={isSignVerified}
                        onChange={e => setIsSignVerified(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 border-slate-300 pointer-events-auto cursor-pointer shrink-0 mt-0.5"
                      />
                      <span className="text-[9.5px] text-slate-550 font-black uppercase tracking-wide leading-relaxed">
                        I confirm physical receipt of NRs. {Number(cashReceived || 0).toLocaleString()} in cash from the guardian.
                      </span>
                    </label>
                  </div>

                  {/* Submit controls */}
                  <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200 w-full">
                    <button
                      type="button"
                      onClick={() => {
                        setPayingBill(null);
                        setCashReceived('');
                        setPaymentRemarks('');
                        setIsSignVerified(false);
                      }}
                      className="px-4 py-2.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-bold cursor-pointer text-xs uppercase"
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      disabled={processingPayment || !isSignVerified || Number(cashReceived || 0) <= 0}
                      className="px-5 py-2.5 bg-[#1B4F72] hover:bg-[#143d59] text-white disabled:bg-slate-300 disabled:text-slate-500 rounded-xl font-bold inline-flex items-center gap-1.5 shadow-md cursor-pointer text-xs uppercase tracking-wide transition-all"
                    >
                      {processingPayment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      {Number(cashReceived || 0) >= grandTotal
                        ? 'Settle Receipt & Clear Bill'
                        : `Record Partial Payment (NRs. ${Number(cashReceived || 0).toLocaleString()})`}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        , document.body);
      })()}

      {billToDelete && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-xs font-sans animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md border border-slate-200 overflow-hidden shadow-2xl relative block animate-in zoom-in-95 duration-200">
            <div className="bg-red-50 p-6 flex flex-col items-center border-b border-red-100">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-gray-900 text-center">Delete Remit Bill</h3>
              <p className="text-sm font-medium text-gray-600 text-center mt-2">
                Are you sure you want to permanently cancel and delete Remit Bill <strong>{billToDelete.billNo}</strong> for <strong>{billToDelete.studentName}</strong>?
              </p>
              <p className="text-[11px] font-bold text-red-550 bg-red-100/50 px-3 py-1.5 rounded-lg border border-red-100 mt-3 text-center uppercase tracking-wide">
                This action is irreversible.
              </p>
            </div>
            <div className="p-6 flex gap-3 bg-slate-50">
              <button 
                type="button"
                onClick={() => setBillToDelete(null)}
                className="flex-1 py-3 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer uppercase tracking-wider"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={confirmDeleteBill}
                className="flex-1 py-3 text-xs font-black text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-md shadow-red-200 cursor-pointer uppercase tracking-wider"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showBulkDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-xs font-sans animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md border border-slate-200 overflow-hidden shadow-2xl relative block animate-in zoom-in-95 duration-200">
            <div className="bg-red-50 p-6 flex flex-col items-center border-b border-red-100">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-gray-900 text-center">Bulk Delete Remit Bills</h3>
              <p className="text-sm font-medium text-gray-600 text-center mt-2">
                Are you sure you want to permanently cancel and delete the <strong>{selectedBillIds.length}</strong> selected Remit Bill(s)?
              </p>
              <p className="text-[11px] font-bold text-red-550 bg-red-100/50 px-3 py-1.5 rounded-lg border border-red-100 mt-3 text-center uppercase tracking-wide">
                This action is irreversible and will restore student outstanding balances back to "due" status.
              </p>
            </div>
            <div className="p-6 flex gap-3 bg-slate-50">
              <button 
                type="button"
                disabled={bulkDeleting}
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="flex-1 py-3 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer uppercase tracking-wider disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={bulkDeleting}
                onClick={confirmBulkDeleteBills}
                className="flex-1 py-3 text-xs font-black text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-md shadow-red-200 cursor-pointer uppercase tracking-wider inline-flex justify-center items-center gap-1.5 disabled:opacity-50"
              >
                {bulkDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {bulkDeleting ? 'Deleting...' : 'Yes, Delete All'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Void and Reissue Modal */}
      {voidingBill && (
        <VoidRemitBillModal
          bill={voidingBill}
          operatorName={formatIssuedBy(adminName)}
          onClose={() => setVoidingBill(null)}
          onSuccess={(voidedBillId, shouldReissue) => {
            const b = voidingBill;
            setVoidingBill(null);
            if (shouldReissue && b) {
              setSelectedClass(b.class);
              setGenerationMode('student');
              setSelectedStudentId(b.studentId);
              const months = extractCoveredMonthsFromBill(b);
              const firstM = months[0] || 'Baisakh';
              setStartMonth(firstM);
              handlePeriodMonthsChange(months.length || 1);
              setReissueContext({
                fromBillNo: b.billNo,
                studentName: b.studentName
              });
              setActiveSubTab('generate');
              setSuccessMsg(`Bill #${b.billNo} marked as VOID. Ready to reissue replacement bill for ${b.studentName}.`);
            } else {
              setSuccessMsg(`Bill #${voidedBillId} marked as VOID. Covered months are released for re-billing.`);
            }
            onRefresh();
          }}
        />
      )}
      {/* Authorized Override Modal */}
      {showAuthorizedOverrideModal && (
        <AuthorizedOverrideModal
          isOpen={showAuthorizedOverrideModal}
          onClose={() => setShowAuthorizedOverrideModal(false)}
          onConfirm={(reason, passcode) => {
            setAuthorizedOverrideInfo({ reason, passcode });
            setSuccessMsg(`Administrative override confirmed: "${reason}". You may now issue the authorized supplementary bill.`);
          }}
          studentCount={targetStudentsForGen.length}
          monthsText={periodCalc.targetMonths.join(', ')}
        />
      )}

      {/* Authoritative Billing Coverage Reconciliation Modal */}
      {showReconciliationModal && (
        <BillingCoverageReconciliationModal
          isOpen={showReconciliationModal}
          onClose={() => setShowReconciliationModal(false)}
          students={students}
          currentAcademicYear={currentAcademicYear}
          remitBills={remitBills}
          initialStudentId={reconcileStudentId}
          onViewBillDetails={(bill) => {
            setPrintingBill(bill);
            setShowReconciliationModal(false);
          }}
          onOpenVoidModal={(bill) => {
            setVoidingBill(bill);
            setShowReconciliationModal(false);
          }}
        />
      )}
    </div>
  );
}
