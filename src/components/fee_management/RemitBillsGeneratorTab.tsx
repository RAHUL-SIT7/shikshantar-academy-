import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { auth, db, handleFirestoreError, OperationType } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, writeBatch, serverTimestamp, onSnapshot, query, where, getDoc, setDoc, getDocs, deleteField } from 'firebase/firestore';
import { Search, Loader2, Plus, X, FileText, CheckCircle2, AlertCircle, Trash2, Printer, Clock, Banknote, Check } from 'lucide-react';
import { formatBSDate, getBSYearMonthDate } from '../../lib/nepaliDate';
import logoImage from '../../assets/logo.png';

const MONTHS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];

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
  itemizedCharges: StudentChargeItem[];
  totalAmount: number;
  status: 'pending' | 'paid';
  createdAt: string;
  createdBy: string;
  paidAmount?: number;
  transactionId?: string;
  paidAt?: string;
  guardianName?: string;
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

export default function RemitBillsGeneratorTab({ 
  students, 
  onRefresh, 
  onCollectGuardianCash 
}: { 
  students: any[]; 
  onRefresh: () => void; 
  onCollectGuardianCash?: (prefill: any) => void;
}) {
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'generate'>('list');
  const [remitBills, setRemitBills] = useState<RemitBill[]>([]);
  const [loading, setLoading] = useState(true);

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
  const [billToDelete, setBillToDelete] = useState<RemitBill | null>(null);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [settleMode, setSettleMode] = useState<'current' | 'all'>('current');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [paymentRemarks, setPaymentRemarks] = useState('');
  const [isSignVerified, setIsSignVerified] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [generating, setGenerating] = useState(false);

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

      // Proactively create/re-sync admin document if it is the special administrator email
      if (user.email === 'rahulsah4534@gmail.com') {
        try {
          const adminDocRef = doc(db, 'users', user.uid);
          const snap = await getDoc(adminDocRef);
          if (!snap.exists() || snap.data().role !== 'admin' || snap.data().status !== 'active') {
            await setDoc(adminDocRef, {
              role: 'admin',
              email: 'rahulsah4534@gmail.com',
              fullName: 'Rahul Sah',
              status: 'active'
            }, { merge: true });
            console.log('Successfully initialized Firestore admin document.');
          }
        } catch (e) {
          console.warn('Could not proactively initialize or verify admin user document:', e);
        }
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

      const isAuthorized = user.email === 'rahulsah4534@gmail.com' || role === 'admin' || role === 'bill_generator' || role === 'teacher';

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
        list.sort((a,b) => b.billNo.localeCompare(a.billNo));
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

  // Update billing period description based on selections
  useEffect(() => {
    if (startMonth && endMonth) {
      setPeriodText(`${startMonth} to ${endMonth} (${periodMonths} Month${periodMonths > 1 ? 's' : ''})`);
    } else {
      setPeriodText('');
    }
  }, [startMonth, endMonth, periodMonths]);

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
    if (!startMonth) return;
    const startIdx = MONTHS.indexOf(startMonth);
    if (startIdx !== -1) {
      const endIdx = (startIdx + months - 1) % 12;
      setEndMonth(MONTHS[endIdx]);
    }
  };

  const handleStartMonthChange = (m: string) => {
    setStartMonth(m);
    if (!m) {
      setEndMonth('');
      return;
    }
    const startIdx = MONTHS.indexOf(m);
    if (startIdx !== -1) {
      const endIdx = (startIdx + periodMonths - 1) % 12;
      setEndMonth(MONTHS[endIdx]);
    }
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
  const computeStudentCharges = (student: any): StudentChargeItem[] => {
    const items: StudentChargeItem[] = [];
    const classFees = getClassFees(student.class || selectedClass);
    
    if (includeTuition) {
      // Use standard tuition rate from fee structure settings
      const rate = classFees.tuition;
      items.push({
        name: 'Monthly Tuition Fee',
        rate,
        months: periodMonths,
        total: rate * periodMonths
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
            months: transportMultiplier,
            total: rate * transportMultiplier
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
          months: computerMultiplier,
          total: rate * computerMultiplier
        });
      }
    }

    if (includeAcademy && Number(academyFeeRate || 0) > 0) {
      const rate = Number(academyFeeRate || 0);
      items.push({
        name: 'Academy / Sports Activities Fee',
        rate,
        months: periodMonths,
        total: rate * periodMonths
      });
    }

    if (student.scholarshipStatus === 'Provided' && Number(student.scholarshipAmount || 0) > 0) {
      const rate = Number(student.scholarshipAmount);
      items.push({
        name: `Scholarship Deduction (${student.scholarshipDescription || 'General'})`,
        rate: -rate,
        months: periodMonths,
        total: -rate * periodMonths
      });
    }

    if (includeAnnual && classFees.annual > 0) {
      const currentYear = feeStructure?.academicYear || getBSYearMonthDate().year.toString() || '2083';

      // 1. Check if the student has already been charged an Annual Fee in any previously generated remit bills for this year
      const hasBeenChargedInRemit = remitBills.some(b => {
        if (b.studentId !== student.id) return false;
        const billYear = b.createdAt ? b.createdAt.split('-')[0] : currentYear;
        if (billYear !== currentYear) return false;
        return b.itemizedCharges.some(item => item.name === 'Annual Fee' || item.name.includes('Annual Fee'));
      });

      // 2. Check if they have a paid or due record for 'Annual Fee' in their standard fees list for this year
      const hasBeenPaidInFees = student.fees && Array.isArray(student.fees) && student.fees.some((f: any) => {
        if (f.type !== 'Annual Fee') return false;
        const feeYear = getFeeBSYear(f);
        if (feeYear !== currentYear) return false;
        return f.status === 'paid' || f.status === 'due' || Number(f.paidAmount || 0) > 0;
      });

      // Only add the Annual Fee charge if they have not already been charged or paid it for this year
      if (!hasBeenChargedInRemit && !hasBeenPaidInFees) {
        items.push({
          name: 'Annual Fee',
          rate: classFees.annual,
          months: 12,
          total: classFees.annual
        });
      }
    }

    if (includeAdmission && classFees.admission > 0) {
      const currentYear = feeStructure?.academicYear || getBSYearMonthDate().year.toString() || '2083';

      // 1. Check if the student has already been charged an Admission Fee in any previously generated remit bills for this year
      const hasBeenChargedInRemit = remitBills.some(b => {
        if (b.studentId !== student.id) return false;
        const billYear = b.createdAt ? b.createdAt.split('-')[0] : currentYear;
        if (billYear !== currentYear) return false;
        return b.itemizedCharges.some(item => item.name === 'Admission Fee' || item.name.includes('Admission Fee'));
      });

      // 2. Check if they have a paid or due record for 'Admission Fee' in their standard fees list for this year
      const hasBeenPaidInFees = student.fees && Array.isArray(student.fees) && student.fees.some((f: any) => {
        if (f.type !== 'Admission Fee') return false;
        const feeYear = getFeeBSYear(f);
        if (feeYear !== currentYear) return false;
        return f.status === 'paid' || f.status === 'due' || Number(f.paidAmount || 0) > 0;
      });

      // Only add the Admission Fee charge if they have not already been charged or paid it for this year
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
      const monthsMultiplier = c.isMonthly ? periodMonths : 1;
      items.push({
        name: c.name,
        rate,
        months: monthsMultiplier,
        total: rate * monthsMultiplier
      });
    });

    // Automatically retrieve and include any outstanding arrears (back dues), listing each month/year separately
    if (student.fees && Array.isArray(student.fees)) {
      const currentBilledMonths = getMonthsCovered(periodText);
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
              const feeYear = getFeeBSYear(f);
              items.push({
                name: `Previous Outstanding Arrears (Back Dues - ${f.type}) - ${f.month} ${feeYear}`,
                rate: amt,
                months: 1,
                total: amt
              });
            }
          }
        }
      });
    }

    return items;
  };

  const calculateTotal = (items: StudentChargeItem[]) => {
    return items.reduce((sum, item) => sum + item.total, 0);
  };

  // Generate Remit Bill(s)
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
      selectedStudents = targetClassStudents;
    }

    if (selectedStudents.length === 0) {
      setErrorMsg('No students found for generation.');
      setGenerating(false);
      return;
    }

    try {
      const batch = writeBatch(db);
      const currentBS = formatBSDate(new Date());
      const sysEmail = localStorage.getItem('userEmail') || 'System';
      
      let createdCount = 0;
      let startSerial = Date.now().toString().slice(-4);
      let lastGeneratedBillPayload: any = null;

      selectedStudents.forEach((student, index) => {
        const itemizedCharges = computeStudentCharges(student);
        const totalAmount = calculateTotal(itemizedCharges);

        if (totalAmount <= 0) return; // Skip zero billings

        const billRef = doc(collection(db, 'remitBills'));
        const docSerial = `RMT-${getBSYearMonthDate().year}-${startSerial}${index}`;

        const billPayload: RemitBill = {
          id: billRef.id,
          billNo: docSerial,
          studentId: student.id,
          studentName: student.name || student.fullName,
          studentRoll: student.rollNumber || student.studentId || '',
          class: student.class,
          billingPeriod: periodText,
          periodMonths: periodMonths,
          itemizedCharges,
          totalAmount,
          status: 'pending',
          createdAt: currentBS,
          createdBy: sysEmail,
          guardianName: student.guardianName
        };

         batch.set(billRef, billPayload);
        createdCount++;

        // Automatically update individual student's standard ledger in `studentFees` with the generated bill amounts
        let billStartMonth = startMonth || 'Baisakh';
        const startIdx = MONTHS.indexOf(billStartMonth) !== -1 ? MONTHS.indexOf(billStartMonth) : 0;

        itemizedCharges.forEach((item) => {
          if (item.name.includes('Arrears') || item.name.includes('Outstanding')) {
            return; // Skip arrears since they are already in studentFees
          }

          let fType = 'Other Fee';
          if (item.name.includes('Tuition')) fType = 'Tuition Fee';
          else if (item.name.includes('Computer')) fType = 'Computer Fee';
          else if (item.name.includes('Transport')) fType = 'Transportation Fee';
          else if (item.name.includes('Academy') || item.name.includes('Sports')) fType = 'Academy Fee';
          else fType = item.name;

          const mult = item.months || 1;
          for (let i = 0; i < mult; i++) {
            const monthName = MONTHS[(startIdx + i) % 12];
            const feeId = `${student.id}_${monthName.replace(/\s+/g,'')}_${fType.replace(/\s+/g,'')}`;
            const feeRef = doc(db, 'studentFees', feeId);

            batch.set(feeRef, {
              studentId: student.id,
              month: monthName,
              type: fType,
              totalFee: item.rate || (item.total / mult),
              paidAmount: 0,
              dueAmount: item.rate || (item.total / mult),
              status: 'due',
              remitBillId: billRef.id,
              createdAt: new Date().toISOString()
            }, { merge: true });
          }
        });

        lastGeneratedBillPayload = {
          id: billRef.id,
          studentId: student.id,
          amount: totalAmount,
          billId: docSerial,
          billingPeriod: periodText,
          itemizedCharges
        };
      });

      if (createdCount > 0) {
        await batch.commit();
        setSuccessMsg(`Successfully generated ${createdCount} Remit Bill(s) for Class ${selectedClass}!`);
        // Reset custom lists & subtab
        setCustomChargesList([]);
        setFilterClass(selectedClass);
        setActiveSubTab('list');
        onRefresh();
      } else {
        setErrorMsg('No bills were created. Check if charges compile to positive values.');
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, 'remitBills');
      setErrorMsg(`Generation failed: ${err.message || err}`);
    } finally {
      setGenerating(false);
    }
  };

  // Process receipt / pay guardian bill cash deposit
  const handlePayRemitBill = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!payingBill) return;

    setProcessingPayment(true);
    setErrorMsg('');
    setSuccessMsg('');

    // Precalculate what bills are being settled
    const otherUnpaidRemits = remitBills.filter(
      b => b.studentId === payingBill.studentId && b.id !== payingBill.id && b.status === 'pending'
    );
    const totalBackDue = otherUnpaidRemits.reduce((sum, b) => sum + b.totalAmount, 0);
    const grandTotal = settleMode === 'all' ? (payingBill.totalAmount + totalBackDue) : payingBill.totalAmount;

    const paidCash = Number(cashReceived || 0);
    if (paidCash < grandTotal) {
      setErrorMsg(`Guardian payment must cover the entire remit bill amount (NRs. ${grandTotal.toLocaleString()}).`);
      setProcessingPayment(false);
      return;
    }

    try {
      const batch = writeBatch(db);
      const currentBS = formatBSDate(new Date());
      const sysEmail = localStorage.getItem('userEmail') || 'Cash Counter';

      const billsToSettle = settleMode === 'all' ? [payingBill, ...otherUnpaidRemits] : [payingBill];
      const receiptNoBase = `RCP-${getBSYearMonthDate().year}-${Date.now().toString().slice(-4)}`;

      let index = 0;
      for (const bill of billsToSettle) {
        const receiptNo = `${receiptNoBase}-${index + 1}`;
        index++;

        // 1. Update the Remit Bill document to PAID
        const remitDocRef = doc(db, 'remitBills', bill.id);
        batch.update(remitDocRef, {
          status: 'paid',
          paidAmount: bill.totalAmount,
          transactionId: receiptNo,
          paidAt: currentBS
        });

        // 2. Create standard transaction receipt in collection('transactions') to decrease cash outstanding & update ledger counter
        const txnRef = doc(collection(db, 'transactions'));
        batch.set(txnRef, {
          id: txnRef.id,
          date: currentBS,
          receipt: receiptNo,
          studentId: bill.studentId,
          studentName: bill.studentName,
          class: bill.class,
          amount: bill.totalAmount,
          method: 'Cash',
          collectedBy: sysEmail,
          status: 'SUCCESS',
          remarks: `${bill.id === payingBill.id ? 'Current' : 'Back Due'} Remit Bill Clear - ${bill.billNo} (${bill.billingPeriod}) - ${paymentRemarks || 'Direct Counter Clearance'}`,
          discount: 0,
          additionalCharge: 0,
          ledgerPageNo: 'RMT-LEDGER',
          isHandwrittenMode: false,
          timestamp: serverTimestamp(),
          remitBillId: bill.id
        });

         // 3. Register paid student fee records class-wise in `studentFees` to clear standard ledger dues
         // Stagger months under this period to flag them as paid in the general system
         let billStartMonth = 'Jestha';
         for (const m of MONTHS) {
           if (bill.billingPeriod.includes(m)) {
             billStartMonth = m;
             break;
           }
         }

         const startIdx = MONTHS.indexOf(billStartMonth) !== -1 ? MONTHS.indexOf(billStartMonth) : 1;
         bill.itemizedCharges.forEach((item) => {
           if (item.name.includes('Arrears') || item.name.includes('Outstanding')) {
             // Find the student's actual due records from the ledger
             const targetStudent = students.find(s => s.id === bill.studentId);
             if (targetStudent && Array.isArray(targetStudent.fees)) {
               const dueRecords = targetStudent.fees
                 .filter((f: any) => f.status === 'due')
                 .sort((a: any, b: any) => {
                   const monthsOrder = MONTHS;
                   return monthsOrder.indexOf(a.month) - monthsOrder.indexOf(b.month);
                 });

               let remainingArrearsToSettle = item.total;
               dueRecords.forEach((f: any) => {
                 if (remainingArrearsToSettle <= 0) return;
                 
                 const dueAmt = f.dueAmount !== undefined ? f.dueAmount : (f.totalFee || 0);
                 const amountToPay = Math.min(dueAmt, remainingArrearsToSettle);
                 remainingArrearsToSettle -= amountToPay;

                 // Build the same fee id
                 const feeId = `${bill.studentId}_${f.month.replace(/\s+/g,'')}_${f.type.replace(/\s+/g,'')}`;
                 const feeRef = doc(db, 'studentFees', feeId);
                 batch.set(feeRef, {
                   paidAmount: (f.paidAmount || 0) + amountToPay,
                   dueAmount: Math.max(0, dueAmt - amountToPay),
                   status: (dueAmt - amountToPay) <= 0 ? 'paid' : 'due',
                   transactionId: txnRef.id,
                   receiptNo: receiptNo,
                   paidAt: new Date().toISOString()
                 }, { merge: true });
               });
             }
             return; // Skip the general monthly loop for arrears
           }

           let fType = 'Other Fee';
           if (item.name.includes('Tuition')) fType = 'Tuition Fee';
           else if (item.name.includes('Computer')) fType = 'Computer Fee';
           else if (item.name.includes('Transport')) fType = 'Transportation Fee';
           else if (item.name.includes('Academy') || item.name.includes('Sports')) fType = 'Academy Fee';
           else fType = item.name;

           const mult = item.months || 1;
           for (let i = 0; i < mult; i++) {
             const monthName = MONTHS[(startIdx + i) % 12];
             const feeId = `${bill.studentId}_${monthName.replace(/\s+/g,'')}_${fType.replace(/\s+/g,'')}`;
             const feeRef = doc(db, 'studentFees', feeId);

             batch.set(feeRef, {
               studentId: bill.studentId,
               month: monthName,
               type: fType,
               totalFee: item.rate || (item.total / mult),
               paidAmount: item.rate || (item.total / mult),
               dueAmount: 0,
               status: 'paid',
               transactionId: txnRef.id,
               receiptNo: receiptNo,
               paidAt: new Date().toISOString()
             }, { merge: true });
           }
         });
      }

      // 5. Create Cash Ledger Income entry to update office accounts and daily registers
      const cashLedgerRef = doc(collection(db, 'cash_ledger'));
      batch.set(cashLedgerRef, {
        type: 'Income',
        date: currentBS,
        amount: grandTotal,
        category: 'Fee Collection',
        remarks: `Receipt ${receiptNoBase} for ${payingBill.studentName} (Class ${payingBill.class}) - Remit Bill Clear for ${billsToSettle.length} bill(s) (${paymentRemarks || 'Direct Counter Clearance'})`,
        timestamp: serverTimestamp()
      });

      await batch.commit();
      setSuccessMsg(`Guardian payment of NRs. ${grandTotal.toLocaleString()} received successfully for ${billsToSettle.length} Bill(s). Ledger updated.`);
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
      const batch = writeBatch(db);
      batch.delete(doc(db, 'remitBills', billToDelete.id));

      if (billToDelete.transactionId) {
        // 1. Query and delete associated transactions in transactions collection
        const txQuery = query(collection(db, 'transactions'), where('receipt', '==', billToDelete.transactionId));
        const txSnap = await getDocs(txQuery);
        txSnap.forEach(d => {
          batch.delete(d.ref);
        });

        // 2. Query and delete associated cash ledger entries
        const cashQuery = query(collection(db, 'cash_ledger'));
        const cashSnap = await getDocs(cashQuery);
        cashSnap.forEach(d => {
          const data = d.data();
          if (data.remarks && data.remarks.includes(billToDelete.transactionId)) {
            batch.delete(d.ref);
          }
        });

        // 3. Revert studentFees status back to due
        const feeQuery = query(collection(db, 'studentFees'), where('transactionId', '==', billToDelete.transactionId));
        const feeSnap = await getDocs(feeQuery);
        feeSnap.forEach(d => {
          const fData = d.data();
          batch.update(d.ref, {
            status: 'due',
            paidAmount: 0,
            dueAmount: fData.totalFee || 0,
            paidAt: deleteField(),
            receiptNo: deleteField(),
            transactionId: deleteField(),
            paymentMethod: deleteField(),
            collectorId: deleteField(),
            collectorName: deleteField()
          });
        });
      } else {
        // Pending bill! Clean up associated studentFees records
        const feeQuery = query(collection(db, 'studentFees'), where('remitBillId', '==', billToDelete.id));
        const feeSnap = await getDocs(feeQuery);
        feeSnap.forEach(d => {
          batch.delete(d.ref);
        });
      }

      await batch.commit();
      setSuccessMsg('Remit Bill deleted successfully, and associated transaction history cleared.');
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
      const batch = writeBatch(db);
      const billsToDeleteObj = remitBills.filter(b => selectedBillIds.includes(b.id));

      for (const bill of billsToDeleteObj) {
        batch.delete(doc(db, 'remitBills', bill.id));

        if (bill.transactionId) {
          // 1. Query and delete associated transactions in transactions collection
          const txQuery = query(collection(db, 'transactions'), where('receipt', '==', bill.transactionId));
          const txSnap = await getDocs(txQuery);
          txSnap.forEach(d => {
            batch.delete(d.ref);
          });

          // 2. Query and delete associated cash ledger entries
          const cashQuery = query(collection(db, 'cash_ledger'));
          const cashSnap = await getDocs(cashQuery);
          cashSnap.forEach(d => {
            const data = d.data();
            if (data.remarks && data.remarks.includes(bill.transactionId)) {
              batch.delete(d.ref);
            }
          });

          // 3. Revert studentFees status back to due
          const feeQuery = query(collection(db, 'studentFees'), where('transactionId', '==', bill.transactionId));
          const feeSnap = await getDocs(feeQuery);
          feeSnap.forEach(d => {
            const fData = d.data();
            batch.update(d.ref, {
              status: 'due',
              paidAmount: 0,
              dueAmount: fData.totalFee || 0,
              paidAt: deleteField(),
              receiptNo: deleteField(),
              transactionId: deleteField(),
              paymentMethod: deleteField(),
              collectorId: deleteField(),
              collectorName: deleteField()
            });
          });
        } else {
          // Pending bill! Clean up associated studentFees records
          const feeQuery = query(collection(db, 'studentFees'), where('remitBillId', '==', bill.id));
          const feeSnap = await getDocs(feeQuery);
          feeSnap.forEach(d => {
            batch.delete(d.ref);
          });
        }
      }

      await batch.commit();
      setSuccessMsg(`Successfully deleted ${billsToDeleteObj.length} Remit Bill(s) and cleared associated transaction histories.`);
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
        // @ts-ignore
        if (typeof pdf.GState === 'function') {
          // @ts-ignore
          const gState = new pdf.GState({ opacity: 0.04 });
          pdf.setGState(gState);
          pdf.addImage(logoBase64, 'PNG', pageWidth / 2 - 40, pageHeight / 2 - 40, 80, 80);
        }
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
    const tableRows = bill.itemizedCharges.map((item, idx) => [
      String(idx + 1),
      item.name,
      `NRs. ${item.rate.toLocaleString()}`,
      `${item.months} Month${item.months > 1 ? 's' : ''}`,
      `NRs. ${item.total.toLocaleString()}`
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
    pdf.text(`Issued by: ${bill.createdBy || 'Counter Desk'}`, 15, footerY + 12);
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
        // @ts-ignore
        if (typeof pdf.GState === 'function') {
          // @ts-ignore
          const gState = new pdf.GState({ opacity: 0.04 });
          pdf.setGState(gState);
          pdf.addImage(logoBase64, 'PNG', pageWidth / 2 - 22.5, offsetY + 74.25 - 22.5, 45, 45);
        }
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
    const tableRows = bill.itemizedCharges.map((item, idx) => [
      String(idx + 1),
      item.name,
      `NRs. ${item.rate.toLocaleString()}`,
      `${item.months} M`,
      `NRs. ${item.total.toLocaleString()}`
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
    pdf.text(`Issued by: ${bill.createdBy || 'Counter Desk'}`, 15, footerY + 10.5);
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
    bill.itemizedCharges.forEach(item => {
      itemRows += `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #f3f4f6; color: #1f2937; font-weight: bold;">${item.name}</td>
          <td class="text-right font-mono" style="padding: 10px; border-bottom: 1px solid #f3f4f6; color: #4b5563;">NRs. ${item.rate.toLocaleString()}</td>
          <td class="text-center" style="padding: 10px; border-bottom: 1px solid #f3f4f6; color: #1f2937; font-weight: bold;">${item.months}</td>
          <td class="text-right font-mono" style="padding: 10px; border-bottom: 1px solid #f3f4f6; color: #1f2937; font-weight: bold;">NRs. ${item.total.toLocaleString()}</td>
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
            <span class="font-mono" style="font-size: 16px; font-weight: 900;">NRs. ${bill.totalAmount.toLocaleString()}</span>
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
              <div style="font-size: 10px; color: #4b5563; font-weight: bold; margin-bottom: 3px;">Issued by: ${bill.createdBy}</div>
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
      const matchName = b.studentName.toLowerCase().includes(s);
      const matchNo = b.billNo.toLowerCase().includes(s);
      return matchName || matchNo;
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
            <h3 className="text-2xl font-black text-slate-800 tracking-tight mt-1">NRs. {statsTotalGenerated.toLocaleString()}</h3>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5">{remitBills.length} Bills Distributed</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-100/50 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Draft Outstanding (Guardians)</span>
            <h3 className="text-2xl font-black text-amber-700 tracking-tight mt-1">NRs. {statsPending.toLocaleString()}</h3>
            <p className="text-[10px] text-amber-600/80 font-medium mt-0.5">{remitBills.filter(b => b.status === 'pending').length} Dues Distributed</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-amber-100/70 flex items-center justify-center text-amber-500">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-100/50 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Cash counter Settled (Recieved)</span>
            <h3 className="text-2xl font-black text-emerald-700 tracking-tight mt-1">NRs. {statsPaid.toLocaleString()}</h3>
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
      <div className="flex border-b border-slate-200">
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
          onClick={() => {
            setActiveSubTab('generate');
          }}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-all cursor-pointer ${
            activeSubTab === 'generate'
              ? 'border-[#1B4F72] text-[#1B4F72]'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          + Generate Remit Bills Class-wise
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
                  <option value="pending">Pending (Dues)</option>
                  <option value="paid">Deposited (Cleared)</option>
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
                          <span className="font-mono font-black text-[#1B4F72] block">{bill.billNo}</span>
                          <span className="text-[10px] text-slate-400">{bill.createdAt} (BS)</span>
                        </td>
                        <td className="py-4 px-6">
                          <h4 className="font-bold text-slate-800 text-xs uppercase">{bill.studentName}</h4>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Class {bill.class} • Roll {bill.studentRoll || 'N/A'}</p>
                        </td>
                        <td className="py-4 px-6">
                          <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">{bill.billingPeriod}</span>
                        </td>
                        <td className="py-4 px-6 text-right font-black text-slate-900 text-xs">
                          NRs. {bill.totalAmount.toLocaleString()}
                        </td>
                        <td className="py-4 px-6 text-center">
                          {bill.status === 'paid' ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                              <Check className="w-2.5 h-2.5" /> Deposited
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Config form card */}
          <div className="lg:col-span-7 bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-6">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">Configure Charges Breakdown</h3>
            
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
              <label className="text-[10px] font-black text-[#1B4F72] uppercase tracking-widest block">Standard Billing Duration</label>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[1, 2, 3, 6, 12].map(m => (
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
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Ending Month (Computer Calculated)</span>
                  <input
                    type="text"
                    disabled
                    readOnly
                    value={endMonth || '-- Select Month First --'}
                    className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-400 cursor-not-allowed"
                  />
                </div>
              </div>

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
                    <p className="text-[10px] text-slate-400 font-medium">Loads standard monthly rate (multiplied by {periodMonths} months)</p>
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
                      <p className="text-[10px] text-slate-400 font-medium">Included only for students with transport assigned</p>
                    </div>
                  </label>
                  {includeTransport && (
                    <div className="flex items-center gap-2 pl-7 pt-1 animate-in slide-in-from-top-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Multiplier (Months):</span>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        value={transportMultiplier}
                        onChange={e => setTransportMultiplier(Number(e.target.value) || 1)}
                        className="w-16 px-2 py-1 text-xs border border-slate-200 rounded bg-white outline-none font-bold text-center"
                      />
                      <span className="text-[10px] text-slate-400 font-medium">Default is {periodMonths} (Change manually if needed)</span>
                    </div>
                  )}
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
                      <p className="text-[10px] text-slate-400 font-medium">Applied class-wise or custom-pupil rate</p>
                    </div>
                  </label>
                  {includeComputer && (
                    <div className="flex items-center gap-2 pl-7 pt-1 animate-in slide-in-from-top-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Multiplier (Months):</span>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        value={computerMultiplier}
                        onChange={e => setComputerMultiplier(Number(e.target.value) || 1)}
                        className="w-16 px-2 py-1 text-xs border border-slate-200 rounded bg-white outline-none font-bold text-center"
                      />
                      <span className="text-[10px] text-slate-400 font-medium">Default is {periodMonths} (Change manually if needed)</span>
                    </div>
                  )}
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
                    type="number"
                    value={newCustomChargeAmount}
                    onChange={e => setNewCustomChargeAmount(e.target.value)}
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

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                disabled={generating || (generationMode === 'student' && !selectedStudentId)}
                onClick={handleGenerateBills}
                className="px-6 py-3 rounded-xl bg-[#1B4F72] hover:bg-[#133c57] text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 active:scale-[0.98] cursor-pointer inline-flex items-center gap-1.5 shadow-md shadow-slate-200"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {generating ? 'Issuing Drafts...' : `Generate & Distribute Remit Bills (${generationMode === 'student' ? '1 Student' : `${classStudents.length} Students`})`}
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
                  <h4 className="text-xs font-black uppercase text-emerald-400 tracking-widest leading-none">Standard Sandbox Pre-Calculated Draft</h4>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">Live simulation for Class {selectedClass} rate</p>
                </div>
                <span className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-black uppercase tracking-wider">REMIT PREVIEW</span>
              </div>

              {/* Sample Calculation Sheet representation */}
              <div className="space-y-4 pt-2">
                <div className="flex justify-between items-center bg-slate-800/40 p-3 rounded-2xl border border-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Example student rate</span>
                    <span className="text-xs font-bold text-slate-200 uppercase">{generationMode === 'student' && selectedStudentId ? classStudents.find(s => s.id === selectedStudentId)?.fullName || 'Selected Student' : 'Standard Pupil of Class ' + selectedClass}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Months Block</span>
                    <span className="text-xs font-black text-amber-400 tracking-wider font-mono">{periodMonths} Months</span>
                  </div>
                </div>

                {/* Items Breakdown list */}
                <div className="space-y-2">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Charges Breakdown list</span>
                  <div className="divide-y divide-slate-800 text-xs">
                    {/* Tuition row */}
                    {includeTuition && (
                      <div className="py-2 flex justify-between">
                        <span className="text-slate-300">Monthly Tuition Fee ({periodMonths}x)</span>
                        <span className="font-mono text-slate-200">NRs. {(preview.tuition * periodMonths).toLocaleString()}</span>
                      </div>
                    )}
                    {/* Transport row */}
                    {includeTransport && preview.transport > 0 && (
                      <div className="py-2 flex justify-between text-slate-400">
                        <span>Transport Cost ({transportMultiplier}x)</span>
                        <span className="font-mono text-slate-300">NRs. {(preview.transport * transportMultiplier).toLocaleString()}</span>
                      </div>
                    )}
                    {/* Computer Labs */}
                    {includeComputer && preview.computer > 0 && (
                      <div className="py-2 flex justify-between text-slate-400">
                        <span>Computer Lab Charges ({computerMultiplier}x)</span>
                        <span className="font-mono text-slate-300">NRs. {(preview.computer * computerMultiplier).toLocaleString()}</span>
                      </div>
                    )}
                    {/* Academy development */}
                    {includeAcademy && (
                      <div className="py-2 flex justify-between text-slate-400">
                        <span>Academy & Sports Activities ({periodMonths}x)</span>
                        <span className="font-mono text-slate-300">NRs. {(Number(academyFeeRate || 0) * periodMonths).toLocaleString()}</span>
                      </div>
                    )}
                    {/* Annual Fee row */}
                    {includeAnnual && preview.annual > 0 && (
                      <div className="py-2 flex justify-between text-slate-400">
                        <span>Annual Fee</span>
                        <span className="font-mono text-slate-300">NRs. {preview.annual.toLocaleString()}</span>
                      </div>
                    )}
                    {/* Admission Fee row */}
                    {includeAdmission && preview.admission > 0 && (
                      <div className="py-2 flex justify-between text-slate-400">
                        <span>Admission Fee</span>
                        <span className="font-mono text-slate-300">NRs. {preview.admission.toLocaleString()}</span>
                      </div>
                    )}
                    {/* Exam Fee row */}
                    {includeExam && preview.exam > 0 && (
                      <div className="py-2 flex justify-between text-slate-400">
                        <span>Terminal Exam Fee</span>
                        <span className="font-mono text-slate-300">NRs. {preview.exam.toLocaleString()}</span>
                      </div>
                    )}
                    {/* Scholarship Row */}
                    {preview.scholarship > 0 && (
                      <div className="py-2 flex justify-between text-purple-300">
                        <span>Scholarship Deduction ({preview.scholarshipDesc || 'General'}) ({periodMonths}x)</span>
                        <span className="font-mono">NRs. -{(preview.scholarship * periodMonths).toLocaleString()}</span>
                      </div>
                    )}
                    {/* Miscellenaous */}
                    {customChargesList.map(c => (
                       <div key={c.id} className="py-2 flex justify-between text-slate-400">
                         <span>{c.name} {c.isMonthly ? `(${periodMonths}x)` : '(Flat)'}</span>
                         <span className="font-mono text-slate-300">NRs. {(Number(c.amount || 0) * (c.isMonthly ? periodMonths : 1)).toLocaleString()}</span>
                       </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Simulated Bill Footer Summary */}
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-800 space-y-2 mt-6 relative z-10">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Total cost shown to Guardian</span>
                <span className="text-xl font-mono font-black text-emerald-400">
                  NRs. {(
                    (includeTuition ? preview.tuition * periodMonths : 0) +
                    (includeTransport && preview.transport > 0 ? preview.transport * transportMultiplier : 0) +
                    (includeComputer && preview.computer > 0 ? preview.computer * computerMultiplier : 0) +
                    (includeAcademy ? Number(academyFeeRate || 0) * periodMonths : 0) +
                    (includeAnnual ? preview.annual : 0) +
                    (includeAdmission ? preview.admission : 0) +
                    (includeExam ? preview.exam : 0) +
                    customChargesList.reduce((acc, c) => acc + (Number(c.amount || 0) * (c.isMonthly ? periodMonths : 1)), 0) -
                    (preview.scholarship * periodMonths)
                  ).toLocaleString()}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal">
                This is a realistic bill structure matching parent requests. Guardians must clear this block before classes recommence. Upon receiving money at the cash collection counter, outstanding is updated automatically.
              </p>
            </div>
          </div>
        </div>
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
                  <p className="text-[10px] text-slate-400 mt-1">Issue Date: {printingBill.createdAt} (BS)</p>
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
                    {printingBill.itemizedCharges.map((item, index) => (
                      <tr key={index}>
                        <td className="py-2.5 font-bold text-slate-700">{item.name}</td>
                        <td className="py-2.5 text-right font-mono text-slate-500">NRs. {item.rate.toLocaleString()}</td>
                        <td className="py-2.5 text-center font-bold text-slate-600">{item.months}</td>
                        <td className="py-2.5 text-right font-mono font-bold text-slate-800 pr-2">NRs. {item.total.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="font-black bg-slate-50/50 border-t border-slate-200">
                      <td colSpan={3} className="py-3 px-3 uppercase tracking-wider text-[10px] text-slate-500">Gross Total Outstanding Payable</td>
                      <td className="py-3 text-right font-mono text-[#1B4F72] text-sm pr-2">NRs. {printingBill.totalAmount.toLocaleString()}</td>
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
                    <span className="font-mono text-[9px] text-[#1B4F72] block pb-0.5 font-bold">Issued by: {printingBill.createdBy}</span>
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
          <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto backdrop-blur-xs font-sans">
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
                      {payingBill.itemizedCharges.map((c, i) => (
                        <div key={i} className="flex justify-between text-xs text-slate-600 font-medium">
                          <span className="text-slate-500">{c.name} ({c.months}M):</span>
                          <span className="font-bold text-slate-700">NRs. {c.total.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-indigo-100 pt-2 flex justify-between items-center text-xs font-black">
                      <span className="text-indigo-600 uppercase tracking-wider">Current Amount:</span>
                      <span className="text-indigo-800 text-sm font-mono">NRs. {currentAmount.toLocaleString()}</span>
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
                              <span className="font-mono text-slate-850 font-black">NRs. {b.totalAmount.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between items-center pt-1 text-xs font-black">
                          <span className="text-amber-700 uppercase tracking-wider">Total Back Due:</span>
                          <span className="text-amber-800 font-mono">NRs. {totalBackDue.toLocaleString()}</span>
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
                        <span className="font-mono text-slate-850">NRs. {currentAmount.toLocaleString()}</span>
                      </div>

                      {totalBackDue > 0 && (
                        <div className="flex justify-between text-amber-700">
                          <span>Historical Back Due:</span>
                          <span className="font-mono">
                            {settleMode === 'all' ? `+ NRs. ${totalBackDue.toLocaleString()}` : `NRs. ${totalBackDue.toLocaleString()} (Skipped)`}
                          </span>
                        </div>
                      )}

                      <div className="border-t border-slate-200 pt-2.5 flex justify-between items-center font-black text-sm">
                        <span className="text-[#1B4F72] uppercase tracking-wide">TOTAL DUE:</span>
                        <span className="font-mono text-[#1B4F72] text-base">NRs. {grandTotal.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Cash received collection input */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 block">Cash Received from Guardian (NRs.)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-xs text-slate-400 font-mono">NRs.</span>
                        <input
                          type="number"
                          required
                          placeholder="Enter physical cash"
                          value={cashReceived}
                          onChange={e => setCashReceived(e.target.value)}
                          className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-xl outline-none focus:ring-4 focus:ring-emerald-500/15 focus:border-[#1B4F72] text-[#1B4F72] font-black text-center text-[15px]"
                        />
                      </div>
                      {Number(cashReceived || 0) < grandTotal ? (
                        <p className="text-[10px] text-red-500 font-bold pl-1 mt-1 animate-pulse">
                          ⚠️ Received is less than NRs. {grandTotal.toLocaleString()}
                        </p>
                      ) : (
                        <div className="flex justify-between items-center text-[11px] font-semibold text-emerald-700 bg-emerald-50 p-2 border border-emerald-100 rounded-lg mt-1.5 animate-in fade-in">
                          <span>Change / Refund back:</span>
                          <span className="font-mono font-black">NRs. {Math.max(0, Number(cashReceived || 0) - grandTotal).toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    {/* Remarks */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 block">Payment Remarks</label>
                      <input
                        type="text"
                        value={paymentRemarks}
                        onChange={e => setPaymentRemarks(e.target.value)}
                        placeholder="e.g. Paid by father with cash"
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
                      disabled={processingPayment || !isSignVerified || Number(cashReceived || 0) < grandTotal}
                      className="px-5 py-2.5 bg-[#1B4F72] hover:bg-[#143d59] text-white disabled:bg-slate-300 disabled:text-slate-500 rounded-xl font-bold inline-flex items-center gap-1.5 shadow-md cursor-pointer text-xs uppercase tracking-wide transition-all"
                    >
                      {processingPayment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Settle Receipt
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
    </div>
  );
}
