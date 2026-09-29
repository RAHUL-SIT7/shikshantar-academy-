import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs, updateDoc, writeBatch } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { Edit2, Save, X, Plus, Trash2, Search, Award, User as UserIcon, Users, CreditCard, FileText, Printer, Tv, PlusCircle, CheckCircle2, AlertCircle, Database, Calendar, ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react';
import FeeStructureWallChartModal from '../components/fee_management/FeeStructureWallChartModal';
import ScholarshipTab from '../components/fee_management/ScholarshipTab';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import DOMPurify from 'isomorphic-dompurify';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getSchoolLogoBase64 } from '../lib/logoHelper';

interface ColumnConfig {
  key: string;
  label: string;
  isNumeric: boolean;
}

interface AcademicFee {
  id: string;
  className: string;
  [key: string]: string;
}

interface TransportFee {
  id: string;
  className: string;
  route: string;
  fee: string;
}

interface LabFee {
  id: string;
  className: string;
  subject: string;
  fee: string;
}

interface CustomTableColumn {
  key: string;
  label: string;
}

interface CustomTableRow {
  id: string;
  [key: string]: string;
}

interface CustomTable {
  id: string;
  title: string;
  columns: CustomTableColumn[];
  rows: CustomTableRow[];
}

interface FeeStructureData {
  academicYear?: string;
  headingTitle?: string;
  headingSubtitle?: string;
  academicTitle?: string;
  academicSubtitle?: string;
  transportTitle?: string;
  transportSubtitle?: string;
  academic: AcademicFee[];
  transportation: TransportFee[];
  lab: LabFee[];
  scholarshipPolicy?: string;
  academicColumns?: ColumnConfig[];
  customTables?: CustomTable[];
}

interface OfficialDoc {
  id: string;
  code: string;
  title: string;
  date: string;
  signatory: string;
  members: number;
  notes: string;
}

const defaultColumns: ColumnConfig[] = [
  { key: 'className', label: 'Class', isNumeric: false },
  { key: 'admission', label: 'Admission Fee', isNumeric: true },
  { key: 'annual', label: 'Annual Charges', isNumeric: true },
  { key: 'tuition', label: 'Monthly Tuition', isNumeric: true },
  { key: 'exam', label: 'Exam Fee', isNumeric: true },
  { key: 'computer', label: 'Computer Fee', isNumeric: true }
];

const defaultCustomTables: CustomTable[] = [
  {
    id: 'coaching_fees',
    title: 'Coaching & Special Class Structures',
    columns: [
      { key: 'programName', label: 'Coaching Program / Subject' },
      { key: 'applicableClasses', label: 'Target Classes' },
      { key: 'timing', label: 'Session Timing' },
      { key: 'monthlyRate', label: 'Monthly Fees (NRs.)' }
    ],
    rows: [
      { id: 'c1', programName: 'Morning Board Preparation Coaching (Math & Science)', applicableClasses: 'Class 9 & Class 10', timing: '6:30 AM - 8:35 AM', monthlyRate: '1500' },
      { id: 'c2', programName: 'Evening Bridge Course / Special Remedial Class', applicableClasses: 'Class 6 to Class 8', timing: '4:30 PM - 5:45 PM', monthlyRate: '1000' }
    ]
  }
];

const defaultData: FeeStructureData = {
  academicYear: '2083',
  headingTitle: 'Fees & Scholarships',
  headingSubtitle: 'Transparent fee schedules and scholarship policies for Playgroup to Class 10',
  academicTitle: 'Academic Fee Schedule',
  academicSubtitle: 'Standard tuition and annual fee breakdown by grade',
  transportTitle: 'Transportation Fees',
  transportSubtitle: 'Monthly bus rates categorized by route',
  academic: [
    { id: '0', className: 'Play Group', admission: '2000', annual: '3000', tuition: '1500', exam: '300', computer: '0' },
    { id: '1', className: 'Nursery', admission: '3000', annual: '3000', tuition: '1600', exam: '300', computer: '0' },
    { id: '2', className: 'LKG', admission: '3000', annual: '3000', tuition: '1700', exam: '300', computer: '0' },
    { id: '3', className: 'UKG', admission: '3000', annual: '3000', tuition: '1800', exam: '400', computer: '0' },
    { id: '4', className: 'Class 1', admission: '3500', annual: '3500', tuition: '2000', exam: '400', computer: '250' },
    { id: '5', className: 'Class 2', admission: '3500', annual: '3500', tuition: '2200', exam: '450', computer: '300' },
    { id: '6', className: 'Class 3', admission: '3500', annual: '3500', tuition: '2400', exam: '450', computer: '300' },
    { id: '7', className: 'Class 4', admission: '4000', annual: '3800', tuition: '2600', exam: '500', computer: '400' },
    { id: '8', className: 'Class 5', admission: '4000', annual: '3800', tuition: '2800', exam: '500', computer: '400' },
    { id: '9', className: 'Class 6', admission: '4000', annual: '4000', tuition: '3000', exam: '500', computer: '450' },
    { id: '10', className: 'Class 7', admission: '4000', annual: '4000', tuition: '3300', exam: '600', computer: '450' },
    { id: '11', className: 'Class 8', admission: '4500', annual: '5000', tuition: '3600', exam: '600', computer: '500' },
    { id: '12', className: 'Class 9', admission: '4500', annual: '5000', tuition: '4000', exam: '700', computer: '500' },
    { id: '13', className: 'Class 10', admission: '4500', annual: '5000', tuition: '4300', exam: '700', computer: '500' }
  ],
  transportation: [
    { id: 't1', className: 'All Classes', route: 'Badahara Mirchaiya', fee: '400' },
    { id: 't2', className: 'All Classes', route: 'Karjanha/Bastipur', fee: '400' },
    { id: 't3', className: 'All Classes', route: 'Bagaha/Bhulkiya', fee: '400' },
    { id: 't4', className: 'All Classes', route: 'Betaha', fee: '500' },
    { id: 't5', className: 'All Classes', route: 'Thalha', fee: '600' },
    { id: 't6', className: 'All Classes', route: 'Simara/Mareba (South)', fee: '600' },
    { id: 't7', className: 'All Classes', route: 'Simara/Mareba (North)', fee: '600' },
    { id: 't8', className: 'All Classes', route: 'Manharwa', fee: '600' }
  ],
  lab: [
    { id: 'l1', className: 'Class 9 to 10', subject: 'Science Program', fee: '600' }
  ],
  scholarshipPolicy: `<p>Shikshantar Academy provides academic scholarships and need-based fee support for deserving students.</p><ul><li><strong>1st Position:</strong> Students securing 1st position with high distinction in terminal examinations receive tuition fee concessions.</li><li><strong>2nd &amp; 3rd Position:</strong> Students securing top ranks receive merit-based fee discounts.</li><li><strong>Need-Based Support:</strong> Concessions are available for eligible families upon written application to the school office.</li></ul><p>Approved scholarships are applied to terminal fee statements by the school administration.</p>`,
  academicColumns: defaultColumns,
  customTables: defaultCustomTables
};

const FeeStructure = ({ isGlobalView = false }: { isGlobalView?: boolean }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'scholarships' ? 'scholarships' : 'fees';
  const [data, setData] = useState<FeeStructureData>(defaultData);
  const [editMode, setEditMode] = useState(false);
  const [editedData, setEditedData] = useState<FeeStructureData>(defaultData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'fees' | 'scholarships'>(initialTab);
  const [studentsData, setStudentsData] = useState<any[]>([]);
  const [systemUsers, setSystemUsers] = useState<any[]>([]);

  // NEW SUB-TABS STATE: Official Docs Documents
  const [officialDocs, setOfficialDocs] = useState<OfficialDoc[]>([]);
  const [docCode, setDocCode] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docDate, setDocDate] = useState('2083-01-10');
  const [docSignatory, setDocSignatory] = useState('Principal N. Sharma');
  const [docMembers, setDocMembers] = useState(7);
  const [docNotes, setDocNotes] = useState('');
  const [showDocModal, setShowDocModal] = useState(false);

  // NEW SUB-TABS STATE: Live Lobby TV Display
  const [liveTvSlide, setLiveTvSlide] = useState(0);
  const [isTvRunning, setIsTvRunning] = useState(true);
  const [tvTickerText, setTvTickerText] = useState('WELCOME TO SHIKSHANTAR ACADEMY LOBBY. admissions open for 2083. clearing dues early provides up to 10% discount.');
  const [currentTvTime, setCurrentTvTime] = useState('');

  // NEW SUB-TABS STATE: Levy / Special Charge Addition
  const [levyLabel, setLevyLabel] = useState('');
  const [levyAmount, setLevyAmount] = useState('300');
  const [levyClass, setLevyClass] = useState('All');
  const [levyMonth, setLevyMonth] = useState('Baisakh');
  const [applyingLevy, setApplyingLevy] = useState(false);
  const [levyMessage, setLevyMessage] = useState({ type: '', text: '' });

  // Scholarship/Discount State
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [discountType, setDiscountType] = useState('Merit');
  const [valueType, setValueType] = useState('Percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [discountMessage, setDiscountMessage] = useState({ type: '', text: '' });

  const [policyEditMode, setPolicyEditMode] = useState(false);
  const [tempPolicy, setTempPolicy] = useState('');
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [generatingFees, setGeneratingFees] = useState(false);
  const [toastMessage, setToastMessage] = useState({ type: '', text: '' });
  const [showWallChartModal, setShowWallChartModal] = useState(false);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const isAdmin = !isGlobalView && Boolean(auth.currentUser) && localStorage.getItem('userRole') === 'admin';

  const mobileScrollContainerRef = React.useRef<HTMLDivElement>(null);
  const isScrollingProgrammatically = React.useRef(false);

  const applyStructureToStudents = async () => {
      setGeneratingFees(true);
      try {
          const usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')));
          const students = usersSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

          const structMap = new Map();
          data.academic.forEach(s => structMap.set(s.className, s));

          let batch = writeBatch(db);
          let count = 0;

          for (const s of students) {
              const rawClass = s.class || s.studentClass || '';
              const formattedClass = ['PG', 'Play Group', 'Nursery', 'LKG', 'UKG'].includes(rawClass) ? rawClass : `Class ${rawClass}`;
              const feeStruct = structMap.get(formattedClass) || structMap.get(rawClass);

              if (feeStruct && feeStruct.tuition) {
                  const tuitionFee = Number(feeStruct.tuition.replace(/[^0-9.]/g, ''));
                  batch.update(doc(db, 'users', s.id), {
                      monthlyFee: tuitionFee
                  });
                  count++;
                  if (count === 400) {
                      await batch.commit();
                      batch = writeBatch(db);
                      count = 0;
                  }
              }
          }
          if (count > 0) {
              await batch.commit();
          }

          setToastMessage({ type: 'success', text: `Successfully updated monthly fee for ${students.length} students!` });
          setTimeout(() => setToastMessage({ type: '', text: '' }), 5000);
      } catch (err) {
          console.error("Failed to apply structure:", err);
          setToastMessage({ type: 'error', text: "Failed to apply fee structure." });
      } finally {
          setGeneratingFees(false);
      }
  };

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'fee_structure'), (docSnap) => {
      if (docSnap.exists()) {
        const mergedData = { ...defaultData, ...docSnap.data() } as FeeStructureData;
        mergedData.academic = mergedData.academic || defaultData.academic;
        
        // Auto-correct Class 10 tuition to 4300 if it is 4500 (aligning with 2083 print chart)
        // Also remove "College" division row to match the print chart exactly.
        mergedData.academic = mergedData.academic
          .filter((item: any) => item.className !== 'College')
          .map((item: any) => {
            if (item.className === 'Class 10' && item.tuition === '4500') {
              return { ...item, tuition: '4300' };
            }
            return item;
          });
        mergedData.transportation = mergedData.transportation || defaultData.transportation;
        mergedData.lab = mergedData.lab || defaultData.lab;
        mergedData.scholarshipPolicy = mergedData.scholarshipPolicy || defaultData.scholarshipPolicy;
        
        // Ensure academicColumns is defined
        mergedData.academicColumns = mergedData.academicColumns || defaultColumns;
        mergedData.customTables = mergedData.customTables || defaultCustomTables;

        // Auto-check for Play Group or Playgroup in loaded academic listing
        const hasPlayGroup = mergedData.academic.some((r: any) =>
          r.className && (r.className.toLowerCase().replace(/\s+/g, '') === 'playgroup' || r.className.toLowerCase().replace(/\s+/g, '') === 'pg')
        );
        if (!hasPlayGroup) {
          const pgRow: any = { id: '0_inserted_pg', className: 'Play Group' };
          mergedData.academicColumns.forEach((col: any) => {
            if (col.key === 'className') return;
            if (col.key === 'admission') pgRow['admission'] = '2000';
            else if (col.key === 'tuition') pgRow['tuition'] = '1500';
            else if (col.key === 'annual') pgRow['annual'] = '3000';
            else if (col.key === 'exam') pgRow['exam'] = '300';
            else pgRow[col.key] = '0';
          });
          mergedData.academic = [pgRow, ...mergedData.academic];
        }

        setData(mergedData);
        if (!editMode) {
          setEditedData(mergedData);
        }
      } else {
        setData(defaultData);
        if (!editMode) {
          setEditedData(defaultData);
        }
      }
      setLoading(false);
    }, (error) => {
      console.warn("Could not fetch fee structure:", error);
      setData(defaultData);
      if (!editMode) setEditedData(defaultData);
      setLoading(false);
    });
    return () => unsub();
  }, [editMode]);

  useEffect(() => {
    let unsubscribe: any = null;
    if (isAdmin && data.academic) {
      const q = query(collection(db, 'users'), where('role', '==', 'student'));
      unsubscribe = onSnapshot(q, (snapshot) => {
        const loaded = snapshot.docs.map(doc => {
          const d = doc.data();
          let baseFee = 0;
          if (d.class) {
            const formattedClass = ['PG', 'Play Group', 'Nursery', 'LKG', 'UKG'].includes(d.class) ? d.class : `Class ${d.class}`;
            const struct = data.academic.find((s: any) => s.className === formattedClass || s.className === d.class);
            if (struct) baseFee = Number(struct.tuition?.replace(/[^0-9.]/g, '') || 0);
          }
          if (d.scholarshipStatus === 'Provided' && d.scholarshipAmount) {
            baseFee = Math.max(0, baseFee - Number(d.scholarshipAmount));
          }
          return {
            id: doc.id,
            ...d,
            name: d.fullName || d.name || `${d.firstName || ''} ${d.lastName || ''}`.trim(),
            monthlyFee: baseFee
          };
        });
        setStudentsData(loaded);
        setAllStudents(loaded);
      }, (error) => {
        console.warn("Failed to listen to students:", error);
      });
    }
    return () => { if (unsubscribe) unsubscribe(); };
  }, [isAdmin, data.academic]);

  useEffect(() => {
    let unsubscribe: any = null;
    if (isAdmin) {
      const q = collection(db, 'users');
      unsubscribe = onSnapshot(q, (snapshot) => {
        const loaded = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          fullName: doc.data().fullName || `${doc.data().firstName || ''} ${doc.data().lastName || ''}`.trim() || doc.data().email
        }));
        setSystemUsers(loaded);
      }, (error) => {
        console.warn("Failed to listen to users:", error);
      });
    }
    return () => { if (unsubscribe) unsubscribe(); };
  }, [isAdmin]);

  useEffect(() => {
    if (searchTerm.trim().length > 1) {
      setSearching(true);
      const delayFn = setTimeout(() => {
         const results = allStudents.filter((user: any) => 
            (user.firstName && user.firstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (user.lastName && user.lastName.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()))
         );
         setSearchResults(results);
         if (results.length === 0) {
            setDiscountMessage({ type: 'error', text: 'No students found matching your search.' });
         } else {
            setDiscountMessage({ type: '', text: '' });
         }
         setSearching(false);
      }, 300);
      return () => clearTimeout(delayFn);
    } else {
      setSearchResults([]);
      setDiscountMessage({ type: '', text: '' });
    }
  }, [searchTerm, allStudents]);

  // Synchronize Live Lobby TV elements and fetch registered documents
  useEffect(() => {
    // 1. Fetch Registered Official Documents
    const unsubDocs = onSnapshot(doc(db, 'settings', 'official_registered_docs'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().documents) {
        setOfficialDocs(docSnap.data().documents);
      } else {
        const defaultDocs = [
          {
            id: 'doc_1',
            code: 'DEC-2083-04',
            title: 'Approval of Standard Tuitions & Computer Surcharge Matrix for Grade PG-10',
            date: '2083-01-05',
            signatory: 'Chairman of Trust Dr. K. Adhikari',
            members: 9,
            notes: 'Officially resolved to maintain modern computer courseware charges at NRs. 250-500 level. Settle early within 15 days of Baisakh for custom sibling discounts.'
          },
          {
            id: 'doc_2',
            code: 'DEC-2083-11',
            title: 'Establishment of Science Program Lab charges & Village Transport rates',
            date: '2083-01-12',
            signatory: 'Principal N. Sharma',
            members: 7,
            notes: 'Fixed scientific laboratory rates to NRs. 600 monthly. Approved micro-bus village route rates from Bastipur, Mirchaiya, Betaha, and Thalha.'
          }
        ];
        setOfficialDocs(defaultDocs);
        // Save initial default listed codes to DB so it persists
        setDoc(doc(db, 'settings', 'official_registered_docs'), { documents: defaultDocs }).catch(console.warn);
      }
    });

    // 2. Ticking Real time Clock for TV Display
    const clockTimer = setInterval(() => {
      const now = new Date();
      setCurrentTvTime(now.toLocaleTimeString());
    }, 1000);

    return () => {
      unsubDocs();
      clearInterval(clockTimer);
    };
  }, []);

  // 3. Sliding Timer for Lobby Display Kiosk
  useEffect(() => {
    if (!isTvRunning) return;
    const tvTimer = setInterval(() => {
      setLiveTvSlide(prev => (prev + 1) % 4);
    }, 5000);
    return () => clearInterval(tvTimer);
  }, [isTvRunning]);

  // 4. Sync tab with URL search parameter
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'scholarships' && activeTab !== 'scholarships') {
      setActiveTab('scholarships');
    } else if (tabParam === 'fees' && activeTab !== 'fees') {
      setActiveTab('fees');
    }
  }, [searchParams]);

  // Handle registering standard admin documents
  const handleRegisterOfficialDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docCode.trim() || !docTitle.trim() || !docNotes.trim()) {
      alert('Please fill out all document resolution details.');
      return;
    }
    const newDoc: OfficialDoc = {
      id: 'doc_' + Date.now(),
      code: docCode,
      title: docTitle,
      date: docDate,
      signatory: docSignatory,
      members: Number(docMembers),
      notes: docNotes
    };
    const updated = [newDoc, ...officialDocs];
    setOfficialDocs(updated);
    try {
      await setDoc(doc(db, 'settings', 'official_registered_docs'), { documents: updated });
      setDocCode('');
      setDocTitle('');
      setDocNotes('');
      setShowDocModal(false);
      setToastMessage({ type: 'success', text: 'Official administrative decision Registered!' });
      setTimeout(() => setToastMessage({ type: '', text: '' }), 5000);
    } catch (err) {
      console.error(err);
      alert('Could not persist registration.');
    }
  };

  const handleDeleteOfficialDoc = async (docId: string) => {
    if (!window.confirm('Are you sure you want to delete this official document registry?')) return;
    const filtered = officialDocs.filter(d => d.id !== docId);
    setOfficialDocs(filtered);
    try {
      await setDoc(doc(db, 'settings', 'official_registered_docs'), { documents: filtered });
      setToastMessage({ type: 'success', text: 'Document registration removed.' });
      setTimeout(() => setToastMessage({ type: '', text: '' }), 5000);
    } catch (err) {
      console.error(err);
    }
  };

  // Real Database integration: Apply Levy to Student Fee Ledgers
  const handleApplyLevySurcharge = async () => {
    if (!levyLabel.trim() || !levyAmount || Number(levyAmount) <= 0) {
      setLevyMessage({ type: 'error', text: 'Please specify a valid Levy label and numeric amount.' });
      return;
    }
    setApplyingLevy(true);
    setLevyMessage({ type: '', text: '' });
    try {
      // 1. Query target student users in the chosen class or all classes
      let qTarget;
      if (levyClass === 'All') {
        qTarget = query(collection(db, 'users'), where('role', '==', 'student'));
      } else {
        qTarget = query(collection(db, 'users'), where('role', '==', 'student'), where('class', '==', levyClass));
      }
      const snap = await getDocs(qTarget);
      const targetStudents = snap.docs.map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as any) })) as any[];
      
      if (targetStudents.length === 0) {
        setLevyMessage({ type: 'error', text: `No students found in the selected Class category "${levyClass}".` });
        setApplyingLevy(false);
        return;
      }

      // 2. Load fee structures configuration map
      const structMap = new Map();
      data.academic.forEach(s => structMap.set(s.className, s));

      let count = 0;
      let batch = writeBatch(db);
      const amountToApply = Number(levyAmount);

      for (const student of targetStudents) {
        // Find if they already have a bill generated for this month
        const fRef = doc(db, 'studentFees', `${student.id}_${levyMonth}`);
        const fSnap = await getDoc(fRef);

        let finalBreakdown: any = {};
        let finalTotalFee = amountToApply;
        let finalPaid = 0;
        let finalDue = amountToApply;

        if (fSnap.exists()) {
          const detail = fSnap.data();
          const currentBreakdown = detail.breakdown || {};
          
          // Add/set levy item
          finalBreakdown = { ...currentBreakdown };
          finalBreakdown[levyLabel] = amountToApply;
          
          // Calculate new total
          let tuitionVal = finalBreakdown.tuition || 0;
          let otherSum = Object.keys(finalBreakdown)
            .filter(key => key !== 'tuition' && key !== 'scholarship')
            .reduce((sum, key) => sum + Number(finalBreakdown[key] || 0), 0);
          
          let subtotal = tuitionVal + otherSum;
          if (finalBreakdown.scholarship) {
            subtotal = Math.max(0, subtotal - Number(finalBreakdown.scholarship));
          }
          finalTotalFee = subtotal;
          finalPaid = Number(detail.paidAmount || 0);
          finalDue = Math.max(0, finalTotalFee - finalPaid);
        } else {
          // If no bill exists yet, compute base tuition + this new levy
          const rawClass = student.class || '';
          const formattedClass = ['PG', 'Play Group', 'Nursery', 'LKG', 'UKG'].includes(rawClass) ? rawClass : `Class ${rawClass}`;
          const feeStruct = structMap.get(formattedClass) || structMap.get(rawClass);
          let tuitionFee = feeStruct && feeStruct.tuition ? Number(feeStruct.tuition.replace(/[^0-9.]/g, '')) : 1000;
          
          finalBreakdown = { tuition: tuitionFee };
          if (student.examFee) finalBreakdown.exam = Number(student.examFee);
          if (student.computerFee) finalBreakdown.computer = Number(student.computerFee);
          if (student.transportFee) finalBreakdown.transport = Number(student.transportFee);
          if (student.otherFee) finalBreakdown.other = Number(student.otherFee);
          
          // Register the levy
          finalBreakdown[levyLabel] = amountToApply;

          let otherSum = Object.keys(finalBreakdown)
            .filter(key => key !== 'tuition' && key !== 'scholarship')
            .reduce((sum, key) => sum + Number(finalBreakdown[key] || 0), 0);
          
          let totalOverall = tuitionFee + otherSum;
          if (student.scholarshipStatus === 'Provided' && student.scholarshipAmount) {
            finalBreakdown.scholarship = Number(student.scholarshipAmount);
            totalOverall = Math.max(0, totalOverall - Number(student.scholarshipAmount));
          }
          finalTotalFee = totalOverall;
          finalDue = totalOverall;
        }

        const isPaidStatus = finalDue <= 0 ? 'paid' : 'due';

        batch.set(fRef, {
          studentId: student.id,
          month: levyMonth,
          totalFee: finalTotalFee,
          breakdown: finalBreakdown,
          paidAmount: finalPaid,
          dueAmount: finalDue,
          status: isPaidStatus,
          createdAt: new Date().toISOString()
        }, { merge: true });

        count++;
        if (count === 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
      }

      setLevyMessage({
        type: 'success',
        text: `Successfully posted "${levyLabel}" of NRs ${levyAmount} to ${targetStudents.length} student records for month ${levyMonth}!`
      });
      setLevyLabel('');
    } catch (err: any) {
      console.error(err);
      setLevyMessage({ type: 'error', text: `Failed to post levy surcharge: ${err.message || err}` });
    } finally {
      setApplyingLevy(false);
    }
  };

  // High quality Official Printed catalog matching exact system specifications
  const generatePrintChartPdf = async () => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 14;
    const sessionYear = (editMode ? editedData.academicYear : data.academicYear) || '2083';

    // Top Header Banner
    pdf.setFillColor(10, 61, 98); // #0A3D62
    pdf.rect(0, 0, pageWidth, 5, 'F');

    // School Logo
    try {
      const logoBase64 = await getSchoolLogoBase64();
      if (logoBase64) {
        pdf.addImage(logoBase64, 'PNG', 14, 7, 20, 20);
      }
    } catch (err) {
      console.warn('Could not add logo to PDF:', err);
    }

    // School Title & Header
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(10, 61, 98);
    pdf.text('SHIKSHANTAR ACADEMY SECONDARY SCHOOL', pageWidth / 2, 14, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(71, 85, 105);
    pdf.text('Bastipur, Karjanha-05, Siraha, Madhesh Province, Nepal', pageWidth / 2, 19, { align: 'center' });
    pdf.text('Estd: 2072 B.S. • Affiliated to NEB & Ministry of Education, Nepal', pageWidth / 2, 23, { align: 'center' });
    pdf.text('Ph: +977 9807790805, +977 9709867048 | Email: shikshantaracademy@gmail.com', pageWidth / 2, 27, { align: 'center' });

    // Official Notice Box
    pdf.setFillColor(241, 245, 249);
    pdf.setDrawColor(10, 61, 98);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(margin, 30, pageWidth - (margin * 2), 8, 1.5, 1.5, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(10, 61, 98);
    pdf.text(`OFFICIAL FEE STRUCTURE — SESSION ${sessionYear}`, pageWidth / 2, 35.5, { align: 'center' });

    // Section 1: Standard Class Fee Schedule
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(15, 23, 42);
    pdf.text('1. CLASS-WISE REGULAR ACADEMIC FEE SCHEDULE (MONTHLY & ANNUAL)', margin, 45);

    const cols = (data.academicColumns || defaultColumns);
    const headRow = cols.map(col => col.label);
    const bodyRows = data.academic.map((row: any) => {
      return cols.map(col => {
        if (col.key === 'className') return row.className;
        return row[col.key] ? `NRs. ${row[col.key]}` : '-';
      });
    });

    autoTable(pdf, {
      startY: 48,
      head: [headRow],
      body: bodyRows,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [10, 61, 98], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { fontStyle: 'bold', textColor: [15, 23, 42] } },
      margin: { left: margin, right: margin }
    });

    let nextY = (pdf as any).lastAutoTable.finalY + 6;

    if (nextY > 210) {
      pdf.addPage();
      nextY = 16;
    }

    // Section 2: Transportation route rates
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(15, 23, 42);
    pdf.text('2. SCHOOL BUS & TRANSPORTATION TARIFF (MONTHLY PER VILLAGE)', margin, nextY);

    const transportRows = data.transportation.map(t => [t.route, t.className || 'All Classes', `NRs. ${t.fee}`]);
    autoTable(pdf, {
      startY: nextY + 2,
      head: [['Route Coverage Area / Pickup Stop', 'Applicable Grades', 'Monthly Bus Fare']],
      body: transportRows,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold' },
      margin: { left: margin, right: margin }
    });

    nextY = (pdf as any).lastAutoTable.finalY + 6;

    if (nextY > 220) {
      pdf.addPage();
      nextY = 16;
    }

    // Section 3: Special Coaching
    const customTbl = data.customTables?.[0];
    if (customTbl && customTbl.rows && customTbl.rows.length > 0) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(15, 23, 42);
      pdf.text(`3. ${customTbl.title.toUpperCase()}`, margin, nextY);

      const customHead = customTbl.columns.map((c: any) => c.label);
      const customRows = customTbl.rows.map((r: any) => {
        return customTbl.columns.map((c: any) => r[c.key] ? (c.key.toLowerCase().includes('rate') || c.key.toLowerCase().includes('fee') ? `NRs. ${r[c.key]}` : r[c.key]) : '-');
      });

      autoTable(pdf, {
        startY: nextY + 2,
        head: [customHead],
        body: customRows,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
        margin: { left: margin, right: margin }
      });
      nextY = (pdf as any).lastAutoTable.finalY + 6;
    }

    nextY += 10;

    if (nextY > 260) {
      pdf.addPage();
      nextY = 20;
    }

    // Signatures
    pdf.setDrawColor(203, 213, 225);
    pdf.line(margin, nextY, pageWidth - margin, nextY);

    const sigY = nextY + 12;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(30, 41, 59);

    pdf.text('Prepared By: _____________________', margin, sigY);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text('Accountant / Bursar Desk', margin, sigY + 4);

    pdf.setDrawColor(10, 61, 98);
    pdf.circle(pageWidth / 2, sigY - 2, 7);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(5);
    pdf.setTextColor(10, 61, 98);
    pdf.text('OFFICIAL SEAL', pageWidth / 2, sigY - 3, { align: 'center' });
    pdf.text('SHIKSHANTAR', pageWidth / 2, sigY, { align: 'center' });

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(30, 41, 59);
    pdf.text('Approved By: _____________________', pageWidth - margin, sigY, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text('Principal / Academic Director', pageWidth - margin, sigY + 4, { align: 'right' });

    pdf.save(`Shikshantar_Academy_Fee_Structure_${sessionYear}.pdf`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'fee_structure'), editedData);
      setEditMode(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditedData(data);
    setEditMode(false);
  };

  const resetToDefault = () => {
    setEditedData(defaultData);
  };

  const generateId = () => `id_${Date.now().toString(36)}_${Math.floor(performance.now()).toString(36)}`;
  
  const handleSavePolicy = async () => {
    setSavingPolicy(true);
    try {
      const updatedData = { ...data, scholarshipPolicy: tempPolicy };
      await setDoc(doc(db, 'settings', 'fee_structure'), updatedData, { merge: true });
      setPolicyEditMode(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings');
    } finally {
      setSavingPolicy(false);
    }
  };

  const addAcademicColumn = () => {
    const currentCols = editedData.academicColumns || defaultColumns;
    const nextNum = currentCols.filter(c => c.label.startsWith("New Column")).length + 1;
    const colKey = `col_${generateId()}`;
    const newCols = [...currentCols, { key: colKey, label: `New Column ${nextNum}`, isNumeric: true }];
    
    // Also initialize this column key as empty string in all academic rows so editing inputs can bind to it
    const newAcademic = editedData.academic.map(row => ({
      ...row,
      [colKey]: ''
    }));

    setEditedData({
      ...editedData,
      academicColumns: newCols,
      academic: newAcademic
    });
  };

  const addAcademicRow = () => {
    const activeCols = editedData.academicColumns || defaultColumns;
    const newRow: any = { id: generateId() };
    activeCols.forEach(col => {
      newRow[col.key] = '';
    });
    setEditedData({
      ...editedData,
      academic: [...editedData.academic, newRow]
    });
  };

  const calculateExpectedRevenue = () => {
     let total = 0;
     const structMap = new Map();
     data.academic.forEach(s => structMap.set(s.className, s));

     for (const s of allStudents) {
         if (s.role !== 'student') continue;
         const rawClass = s.class || s.studentClass || '';
         const formattedClass = ['PG', 'Play Group', 'Nursery', 'LKG', 'UKG'].includes(rawClass) ? rawClass : `Class ${rawClass}`;
         const feeStruct = structMap.get(formattedClass) || structMap.get(rawClass);

         if (feeStruct) {
            const tuition = Number(feeStruct.tuition.replace(/[^0-9.]/g, '')) || 0;
            const annual = Number(feeStruct.annual.replace(/[^0-9.]/g, '')) || 0;
            const scholarship = s.scholarshipStatus === 'Provided' ? Number(s.scholarshipAmount||0) : 0;
            
            total += (Math.max(0, tuition - scholarship) * 12) + annual;
         }
     }
     return total;
  };

  const addTransportRow = () => {
    setEditedData({
      ...editedData,
      transportation: [...editedData.transportation, { id: generateId(), className: '', route: '', fee: '' }]
    });
  };

  const addLabRow = () => {
    setEditedData({
      ...editedData,
      lab: [...editedData.lab, { id: generateId(), className: '', subject: '', fee: '' }]
    });
  };

  const addCustomTable = () => {
    const currentTables = editedData.customTables || [];
    const tableId = `table_${generateId()}`;
    const nextNum = currentTables.length + 1;
    const newTable: CustomTable = {
      id: tableId,
      title: `Custom Fee Table ${nextNum}`,
      columns: [
        { key: 'item', label: 'Item/Particulars' },
        { key: 'classes', label: 'Target Audience' },
        { key: 'rate', label: 'Rate/Fees (NRs.)' }
      ],
      rows: [
        { id: generateId(), item: '', classes: '', rate: '' }
      ]
    };
    setEditedData({
      ...editedData,
      customTables: [...currentTables, newTable]
    });
  };

  const deleteCustomTable = (tableId: string) => {
    const currentTables = editedData.customTables || [];
    setEditedData({
      ...editedData,
      customTables: currentTables.filter(t => t.id !== tableId)
    });
  };

  const updateCustomTableTitle = (tableId: string, newTitle: string) => {
    const currentTables = editedData.customTables || [];
    setEditedData({
      ...editedData,
      customTables: currentTables.map(t => t.id === tableId ? { ...t, title: newTitle } : t)
    });
  };

  const addCustomTableColumn = (tableId: string) => {
    const currentTables = editedData.customTables || [];
    setEditedData({
      ...editedData,
      customTables: currentTables.map(t => {
        if (t.id !== tableId) return t;
        const nextColNum = t.columns.length + 1;
        const colKey = `col_${generateId()}`;
        const updatedColumns = [...t.columns, { key: colKey, label: `Column ${nextColNum}` }];
        const updatedRows = t.rows.map(row => ({
          ...row,
          [colKey]: ''
        }));
        return {
          ...t,
          columns: updatedColumns,
          rows: updatedRows
        };
      })
    });
  };

  const updateCustomTableColumnLabel = (tableId: string, colKey: string, newLabel: string) => {
    const currentTables = editedData.customTables || [];
    setEditedData({
      ...editedData,
      customTables: currentTables.map(t => {
        if (t.id !== tableId) return t;
        const updatedColumns = t.columns.map(col => col.key === colKey ? { ...col, label: newLabel } : col);
        return {
          ...t,
          columns: updatedColumns
        };
      })
    });
  };

  const deleteCustomTableColumn = (tableId: string, colKey: string) => {
    const currentTables = editedData.customTables || [];
    setEditedData({
      ...editedData,
      customTables: currentTables.map(t => {
        if (t.id !== tableId) return t;
        const updatedColumns = t.columns.filter(col => col.key !== colKey);
        const updatedRows = t.rows.map(row => {
          const newRow = { ...row };
          delete newRow[colKey];
          return newRow;
        });
        return {
          ...t,
          columns: updatedColumns,
          rows: updatedRows
        };
      })
    });
  };

  const addCustomTableRow = (tableId: string) => {
    const currentTables = editedData.customTables || [];
    setEditedData({
      ...editedData,
      customTables: currentTables.map(t => {
        if (t.id !== tableId) return t;
        const newRow: any = { id: generateId() };
        t.columns.forEach(col => {
          newRow[col.key] = '';
        });
        return {
          ...t,
          rows: [...t.rows, newRow]
        };
      })
    });
  };

  const deleteCustomTableRow = (tableId: string, rowId: string) => {
    const currentTables = editedData.customTables || [];
    setEditedData({
      ...editedData,
      customTables: currentTables.map(t => {
        if (t.id !== tableId) return t;
        return {
          ...t,
          rows: t.rows.filter(r => r.id !== rowId)
        };
      })
    });
  };

  const updateCustomTableCell = (tableId: string, rowId: string, colKey: string, value: string) => {
    const currentTables = editedData.customTables || [];
    setEditedData({
      ...editedData,
      customTables: currentTables.map(t => {
        if (t.id !== tableId) return t;
        const updatedRows = t.rows.map(row => {
          if (row.id !== rowId) return row;
          return {
            ...row,
            [colKey]: value
          };
        });
        return {
          ...t,
          rows: updatedRows
        };
      })
    });
  };

  const handleSearchStudents = () => {
     // Triggered manually if needed, but handled by effect now
  };

  const handleApplyDiscount = async () => {
    if (!selectedStudent || !discountValue) return;
    setApplyingDiscount(true);
    setDiscountMessage({ type: '', text: '' });
    
    try {
      await updateDoc(doc(db, 'users', selectedStudent.id), {
        discount: {
          type: discountType,
          valueType: valueType,
          value: Number(discountValue),
          updatedAt: new Date().toISOString()
        }
      });
      setDiscountMessage({ type: 'success', text: `Successfully applied ${discountType} discount to ${selectedStudent.firstName} ${selectedStudent.lastName || ''}` });
      setSelectedStudent(null);
      setDiscountValue('');
      setSearchTerm('');
      setSearchResults([]);
    } catch (error) {
      console.error("Error applying discount", error);
      setDiscountMessage({ type: 'error', text: 'Error applying discount. Please try again.' });
    } finally {
      setApplyingDiscount(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">
      <Helmet>
        <title>Fee Structure | Shikshantar Academy</title>
        <meta name="description" content="View the detailed fee structure for different classes at Shikshantar Academy." />
        <link rel="canonical" href="https://www.shikshantaracademy.edu.np/fee-structure" />
      </Helmet>
      Loading fee structure...</div>;
  }

  const handleTabChange = (tab: 'fees' | 'scholarships') => {
    setActiveTab(tab);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', tab);
    setSearchParams(newParams, { replace: true });
  };

  const scrollTableById = (id: string, direction: 'left' | 'right') => {
    const el = document.getElementById(id);
    if (el) {
      const scrollAmount = 250;
      el.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const currentData = editMode ? editedData : data;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-8 w-full min-w-0 max-w-full overflow-x-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-[#e2e8f0]">
        <div className="w-full sm:w-auto">
          {editMode ? (
            <div className="space-y-2 w-full max-w-xl">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider w-28 shrink-0">Page Title:</label>
                <input 
                  type="text" 
                  value={editedData.headingTitle ?? (data.headingTitle || 'Fees & Scholarships')} 
                  onChange={e => setEditedData({ ...editedData, headingTitle: e.target.value })}
                  className="text-lg font-bold text-primary px-3 py-1.5 rounded-lg border border-gray-300 w-full outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder="Page Title (e.g. Fees & Scholarships)"
                />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider w-28 shrink-0">Subtitle:</label>
                <input 
                  type="text" 
                  value={editedData.headingSubtitle ?? (data.headingSubtitle || 'Comprehensive fee schedules, policies, development offsets, and active scholarships')} 
                  onChange={e => setEditedData({ ...editedData, headingSubtitle: e.target.value })}
                  className="text-xs text-slate-700 px-3 py-1.5 rounded-lg border border-gray-300 w-full outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder="Subtitle description"
                />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider w-28 shrink-0">Session Year:</label>
                <input 
                  type="text" 
                  value={editedData.academicYear || ''} 
                  onChange={e => setEditedData({ ...editedData, academicYear: e.target.value })}
                  className="text-xs font-semibold bg-white text-gray-800 px-3 py-1 rounded-lg border border-gray-300 w-36 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 2083"
                />
              </div>
            </div>
          ) : (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <h2 className="text-2xl sm:text-3xl font-bold text-primary">
                  {currentData.headingTitle || 'Fees & Scholarships'}
                </h2>
                <span className="text-sm font-medium bg-gray-100 text-gray-600 px-3 py-1 rounded-full whitespace-nowrap border border-gray-200 self-start sm:self-auto">
                  Academic Year {currentData.academicYear || '2083'}
                </span>
              </div>
              <p className="text-sm text-slate-600 mt-2">
                {currentData.headingSubtitle || 'Comprehensive fee schedules, policies, development offsets, and active scholarships'}
              </p>
            </div>
          )}
        </div>
        
        {isAdmin && (
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            {toastMessage.text && (
              <div className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center ${toastMessage.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                {toastMessage.text}
              </div>
            )}

            {!editMode ? (
              <div className="flex items-center flex-wrap gap-2 sm:gap-3">
                <button
                  onClick={generatePrintChartPdf}
                  title="Print official fee structure document (Downloads print-ready official PDF with school logo)"
                  className="flex justify-center items-center gap-2 bg-[#0A3D62] hover:bg-[#06263e] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95"
                >
                  <Printer className="w-4 h-4" />
                  Print Fee Structure
                </button>

                <button
                  onClick={applyStructureToStudents}
                  title="Update all students' default monthly base tuition in their individual profiles to match this fee structure."
                  className="flex justify-center items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                  disabled={generatingFees}
                >
                  <Users className="w-4 h-4" />
                  {generatingFees ? 'Syncing...' : 'Sync Base Fees'}
                </button>

                <button
                  onClick={() => setEditMode(true)}
                  className="flex justify-center items-center gap-2 bg-primary hover:bg-primary-dark text-white px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit Fee Structure
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={resetToDefault}
                  className="flex items-center justify-center gap-2 bg-amber-100 hover:bg-amber-200 text-amber-800 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                  disabled={saving}
                >
                  Reset Defaults
                </button>
                <button
                  onClick={cancelEdit}
                  className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                  disabled={saving}
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                  disabled={saving}
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Tabs to keep Fees & Scholarships together in every mode */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto self-start bg-white p-1 rounded-xl shadow-sm border border-[#e2e8f0] w-full">
        <button
          onClick={() => handleTabChange('fees')}
          className={`py-2 px-4 font-bold text-xs sm:text-sm rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap active:scale-95 ${
            activeTab === 'fees'
              ? 'bg-primary text-white shadow'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <CreditCard className="w-4 h-4" /> Standard Fee Catalog
        </button>

        <button
          onClick={() => handleTabChange('scholarships')}
          className={`py-2 px-4 font-bold text-xs sm:text-sm rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap active:scale-95 ${
            activeTab === 'scholarships'
              ? 'bg-primary text-white shadow'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Award className="w-4 h-4" /> Scholarship & Policies
        </button>
      </div>

      <div className="w-full max-w-full">
        <div>
          {/* Section 1: Fees */}
          <div className={`w-full px-1 md:px-0 space-y-8 ${activeTab === 'fees' ? 'block' : 'hidden'}`}>
          {isAdmin && (
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl p-6 shadow-md mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-lg font-bold">Official 2083 Print Chart Available!</h3>
                <p className="text-sm opacity-95 mt-1 max-w-3xl">
                  We have loaded the updated 2083 standard fee schedule (including Admission Fee, Annual Charges, Monthly Tuition, Exam, Computer Fees, and exact Bus transport fares per village) from your printed document. Click below to write this official catalog configuration directly into your active database.
                </p>
              </div>
              <button
                onClick={async () => {
                  setSaving(true);
                  try {
                    await setDoc(doc(db, 'settings', 'fee_structure'), defaultData);
                    setToastMessage({ type: 'success', text: 'Live Database successfully updated with the 2083 print chart!' });
                    setTimeout(() => setToastMessage({ type: '', text: '' }), 5000);
                  } catch (err) {
                    console.error(err);
                    setToastMessage({ type: 'error', text: 'Could not sync print chart to database.' });
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="bg-white text-indigo-700 hover:bg-slate-50 font-black px-5 py-2.5 rounded-xl text-sm transition-all shadow shrink-0 active:scale-95 disabled:opacity-50"
              >
                Overwrite Live DB with Print Chart
              </button>
            </div>
          )}
          {/* Academic Fees */}
          <div className="relative rounded-2xl group transition-all duration-300 max-w-full min-w-0">
            {/* Outer Glow Bloom aura */}
            <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-30 blur-2xl transition-all duration-500 rounded-2xl -z-10 group-hover:scale-102 pointer-events-none" />

            {/* Boundary box with rotating gradient for lightning border effect */}
            <div className="relative w-full h-full rounded-2xl overflow-hidden p-[2.5px] bg-gray-150 dark:bg-slate-800 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-sm max-w-full min-w-0">
              {/* Spinning lightning border */}
              <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_4s_linear_infinite] opacity-25 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

              {/* Inner masked content card */}
              <div className="relative w-full h-full bg-white rounded-[14px] flex flex-col z-10 overflow-hidden flex-1 max-w-full min-w-0">
                <div className="p-6 border-b border-[#e2e8f0] bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                    {editMode ? (
                      <div className="space-y-1.5 w-full max-w-md">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded shrink-0 border border-indigo-200">Table Heading:</span>
                          <input
                            type="text"
                            value={editedData.academicTitle ?? (data.academicTitle || 'Academic Fees')}
                            onChange={e => setEditedData({ ...editedData, academicTitle: e.target.value })}
                            className="w-full border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none px-2.5 py-1 rounded text-sm font-bold text-primary bg-white"
                            placeholder="e.g. Academic Fees"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-150 px-2 py-0.5 rounded shrink-0 border border-slate-200">Subtitle:</span>
                          <input
                            type="text"
                            value={editedData.academicSubtitle ?? (data.academicSubtitle || 'Playgroup to Class 10 tuition and standard admission schedules')}
                            onChange={e => setEditedData({ ...editedData, academicSubtitle: e.target.value })}
                            className="w-full border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none px-2.5 py-0.5 rounded text-xs text-slate-600 bg-white"
                            placeholder="Subtitle description"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h3 className="text-xl font-bold text-primary">{currentData.academicTitle || 'Academic Fees'}</h3>
                        <p className="text-xs text-slate-500 mt-1">{currentData.academicSubtitle || 'Playgroup to Class 10 tuition and standard admission schedules'}</p>
                      </div>
                    )}
                  </div>
                  {editMode && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={addAcademicColumn}
                className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-150 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-indigo-100 transition-colors"
                title="Add a custom dynamic column (e.g., Computer Monthly, Security Deposit)"
              >
                <Plus className="w-3.5 h-3.5" /> Add Column
              </button>
              <button
                type="button"
                onClick={addAcademicRow}
                className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-150 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-blue-100 transition-colors"
                title="Add a new class or tier row"
              >
                <Plus className="w-3.5 h-3.5" /> Add Row
              </button>
            </div>
          )}
        </div>
        
        {/* Mobile-only Horizontal scroll helper buttons */}
        <div className="flex lg:hidden justify-end items-center gap-2 px-6 py-2 text-slate-500 border-b border-[#e2e8f0] bg-slate-50/50">
          <span className="text-xs font-bold tracking-wider text-slate-600">Scroll table:</span>
          <button 
            type="button"
            onClick={() => scrollTableById('academic-fees-table', 'left')}
            className="p-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 active:scale-95 transition-all"
            aria-label="Scroll table left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button 
            type="button"
            onClick={() => scrollTableById('academic-fees-table', 'right')}
            className="p-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 active:scale-95 transition-all"
            aria-label="Scroll table right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="relative w-full max-w-full">
          {/* Scroll fade overlay indicator */}
          <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-white dark:from-slate-900 to-transparent pointer-events-none z-10 lg:hidden flex items-center justify-end pr-2 text-orange-500">
            <ChevronRight className="w-5 h-5 animate-pulse" />
          </div>
          <div id="academic-fees-table" className="p-4 sm:p-6 overflow-x-auto custom-scrollbar pb-2 w-full max-w-full">
            <table className="w-full text-left whitespace-nowrap min-w-[900px]">
            <thead>
              <tr className="border-b border-[#e2e8f0]">
                {(currentData.academicColumns || defaultColumns).map((col) => (
                  <th key={col.key} className="pb-4 font-semibold text-slate-700">
                    {editMode ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={col.label}
                          onChange={(e) => {
                            const newCols = [...(editedData.academicColumns || defaultColumns)];
                            const idx = newCols.findIndex(c => c.key === col.key);
                            if (idx !== -1) {
                              newCols[idx].label = e.target.value;
                              setEditedData({ ...editedData, academicColumns: newCols });
                            }
                          }}
                          className="border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none px-2 py-1.5 rounded-lg font-bold text-xs w-28 text-slate-800 bg-white"
                          title="Click to rename this column header"
                        />
                        {col.key !== 'className' && (
                          <button
                            type="button"
                            onClick={() => {
                              const newCols = (editedData.academicColumns || defaultColumns).filter(c => c.key !== col.key);
                              // Clean values from rows
                              const newAcademic = editedData.academic.map(row => {
                                const newRow = { ...row };
                                delete newRow[col.key];
                                return newRow;
                              });
                              setEditedData({
                                ...editedData,
                                academicColumns: newCols,
                                academic: newAcademic
                              });
                            }}
                            className="text-red-500 hover:bg-red-50 p-1 rounded-md transition-all"
                            title="Delete this Column"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
                {editMode && <th className="pb-4 font-semibold text-slate-700 w-10"></th>}
              </tr>
            </thead>
            <tbody className="text-sm">
              {(currentData.academic || []).map((row, index) => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  {(currentData.academicColumns || defaultColumns).map((col) => (
                    <td key={col.key} className="py-3 pr-4">
                      {editMode ? (
                        <input
                          className="w-full border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none p-2 rounded-lg text-sm font-medium"
                          value={row[col.key] || ''}
                          onChange={(e) => {
                            const newAcademic = [...(editedData.academic || [])];
                            newAcademic[index] = { ...newAcademic[index], [col.key]: e.target.value };
                            setEditedData({ ...editedData, academic: newAcademic });
                          }}
                        />
                      ) : (
                        <span className={col.key === 'className' ? "font-bold text-slate-900" : "text-slate-600"}>
                          {col.key === 'className' ? row.className : (row[col.key] ? `NRs. ${row[col.key]}` : '-')}
                        </span>
                      )}
                    </td>
                  ))}
                  {editMode && (
                    <td className="py-3 text-right">
                      <button
                        onClick={() => {
                          const newAcademic = (editedData.academic || []).filter((_, i) => i !== index);
                          setEditedData({ ...editedData, academic: newAcademic });
                        }}
                        className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                        title="Delete Row"
                      >
                        <Trash2 className="w-4 h-4"/>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {(!currentData.academic || currentData.academic.length === 0) && (
                <tr>
                  <td colSpan={(currentData.academicColumns || defaultColumns).length + (editMode ? 1 : 0)} className="py-4 text-center text-gray-500">
                    No academic fees data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
              </div>
            </div>
          </div>

      {isAdmin && (
        <div className="relative rounded-2xl group transition-all duration-300">
          {/* Outer Glow Bloom aura */}
          <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-30 blur-2xl transition-all duration-500 rounded-2xl -z-10 group-hover:scale-102 pointer-events-none" />

          {/* Boundary box with rotating gradient for lightning border effect */}
          <div className="relative w-full h-full rounded-2xl overflow-hidden p-[2.5px] bg-gray-150 dark:bg-slate-800 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-sm">
            {/* Spinning lightning border */}
            <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_4s_linear_infinite] opacity-25 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

            {/* Inner masked content card */}
            <div className="relative w-full h-full bg-gradient-to-r from-blue-50 to-white rounded-[14px] p-6 flex flex-col sm:flex-row justify-between items-center z-10 overflow-hidden flex-1">
              <div>
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Expected Annual Revenue</h3>
                  <p className="text-3xl font-black text-primary tracking-tight">NRs. {calculateExpectedRevenue().toLocaleString()}</p>
              </div>
              <div className="text-right mt-4 sm:mt-0 text-sm font-medium text-gray-500">
                 Based on current active students, applying structure and existing scholarships.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8">
        {/* Transportation Fees */}
        <div className="relative rounded-2xl group transition-all duration-300 max-w-full min-w-0">
          {/* Outer Glow Bloom aura */}
          <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-30 blur-2xl transition-all duration-500 rounded-2xl -z-10 group-hover:scale-102 pointer-events-none" />

          {/* Boundary box with rotating gradient for lightning border effect */}
          <div className="relative w-full h-full rounded-2xl overflow-hidden p-[2.5px] bg-gray-150 dark:bg-slate-800 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-sm max-w-full min-w-0">
            {/* Spinning lightning border */}
            <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_4s_linear_infinite] opacity-25 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

            {/* Inner masked content card */}
            <div className="relative w-full h-full bg-white rounded-[14px] flex flex-col z-10 overflow-hidden flex-1 max-w-full min-w-0">
              <div className="p-6 border-b border-[#e2e8f0] bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                  {editMode ? (
                    <div className="space-y-1.5 w-full max-w-md">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded shrink-0 border border-indigo-200">Table Heading:</span>
                        <input
                          type="text"
                          value={editedData.transportTitle ?? (data.transportTitle || 'Transportation Fees')}
                          onChange={e => setEditedData({ ...editedData, transportTitle: e.target.value })}
                          className="w-full border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none px-2.5 py-1 rounded text-sm font-bold text-primary bg-white"
                          placeholder="e.g. Transportation Fees"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-150 px-2 py-0.5 rounded shrink-0 border border-slate-200">Subtitle:</span>
                        <input
                          type="text"
                          value={editedData.transportSubtitle ?? (data.transportSubtitle || 'Area-wise monthly transportation subscription fees')}
                          onChange={e => setEditedData({ ...editedData, transportSubtitle: e.target.value })}
                          className="w-full border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none px-2.5 py-0.5 rounded text-xs text-slate-600 bg-white"
                          placeholder="Subtitle description"
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-xl font-bold text-primary">{currentData.transportTitle || 'Transportation Fees'}</h3>
                      <p className="text-xs text-slate-500 mt-1">{currentData.transportSubtitle || 'Area-wise monthly transportation subscription fees'}</p>
                    </div>
                  )}
                </div>
                {editMode && (
                  <button onClick={addTransportRow} className="text-sm font-semibold text-blue-600 flex items-center gap-1 hover:text-blue-800 shrink-0">
                    <Plus className="w-4 h-4" /> Add Row
                  </button>
                )}
              </div>
          
          {/* Mobile-only Horizontal scroll helper buttons */}
          <div className="flex lg:hidden justify-end items-center gap-2 px-6 py-2 text-slate-500 border-b border-[#e2e8f0] bg-slate-50/50">
            <span className="text-xs font-bold tracking-wider text-slate-600">Scroll table:</span>
            <button 
              type="button"
              onClick={() => scrollTableById('transport-fees-table', 'left')}
              className="p-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 active:scale-95 transition-all"
              aria-label="Scroll table left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              type="button"
              onClick={() => scrollTableById('transport-fees-table', 'right')}
              className="p-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 active:scale-95 transition-all"
              aria-label="Scroll table right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="relative w-full max-w-full">
            {/* Scroll fade overlay indicator */}
            <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-white dark:from-slate-900 to-transparent pointer-events-none z-10 lg:hidden flex items-center justify-end pr-2 text-orange-500">
              <ChevronRight className="w-5 h-5 animate-pulse" />
            </div>
            <div id="transport-fees-table" className="p-4 sm:p-6 overflow-x-auto custom-scrollbar pb-2 w-full max-w-full">
              <table className="w-full text-left whitespace-nowrap min-w-[750px]">
              <thead>
                <tr className="border-b border-[#e2e8f0]">
                  <th className="pb-4 font-semibold text-slate-700 w-1/3">Class</th>
                  <th className="pb-4 font-semibold text-slate-700 w-1/3">Route</th>
                  <th className={`pb-4 font-semibold text-slate-700 w-1/3 text-right ${editMode ? '' : 'pr-14'}`}>Monthly Fee</th>
                  {editMode && <th className="pb-4 font-semibold text-slate-700 w-10 pr-14"></th>}
                </tr>
              </thead>
              <tbody className="text-sm">
                {(currentData.transportation || []).map((row, index) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-3">
                      {editMode ? (
                        <input className="w-full border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none p-2 rounded" value={row.className || ''} onChange={(e) => {
                          const newTransport = [...(editedData.transportation || [])];
                          newTransport[index].className = e.target.value;
                          setEditedData({ ...editedData, transportation: newTransport });
                        }} />
                      ) : <span className="font-medium text-slate-800">{row.className}</span>}
                    </td>
                    <td className="py-3">
                      {editMode ? (
                        <input className="w-full border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none p-2 rounded" value={row.route || ''} onChange={(e) => {
                          const newTransport = [...(editedData.transportation || [])];
                          newTransport[index].route = e.target.value;
                          setEditedData({ ...editedData, transportation: newTransport });
                        }} />
                      ) : <span className="text-slate-600">{row.route}</span>}
                    </td>
                    <td className={`py-3 text-right ${editMode ? '' : 'pr-14'}`}>
                      {editMode ? (
                        <input className="w-full border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none p-2 rounded text-right" value={row.fee || ''} onChange={(e) => {
                          const newTransport = [...(editedData.transportation || [])];
                          newTransport[index].fee = e.target.value;
                          setEditedData({ ...editedData, transportation: newTransport });
                        }} />
                      ) : <span className="text-slate-600">NRs. {row.fee}</span>}
                    </td>
                    {editMode && (
                      <td className="py-3 text-right pr-14">
                        <button onClick={() => {
                          const newTransport = (editedData.transportation || []).filter((_, i) => i !== index);
                          setEditedData({ ...editedData, transportation: newTransport });
                        }} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 className="w-4 h-4"/></button>
                      </td>
                    )}
                  </tr>
                ))}
                {(!currentData.transportation || currentData.transportation.length === 0) && (
                  <tr><td colSpan={4} className="py-4 text-center text-gray-500">No transportation fees data.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
            </div>
          </div>
        </div>

        {/* Lab Fees */}
        <div className="relative rounded-2xl group transition-all duration-300 max-w-full min-w-0">
          {/* Outer Glow Bloom aura */}
          <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-30 blur-2xl transition-all duration-500 rounded-2xl -z-10 group-hover:scale-102 pointer-events-none" />

          {/* Boundary box with rotating gradient for lightning border effect */}
          <div className="relative w-full h-full rounded-2xl overflow-hidden p-[2.5px] bg-gray-150 dark:bg-slate-800 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-sm max-w-full min-w-0">
            {/* Spinning lightning border */}
            <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_4s_linear_infinite] opacity-25 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

            {/* Inner masked content card */}
            <div className="relative w-full h-full bg-white rounded-[14px] flex flex-col z-10 overflow-hidden flex-1 max-w-full min-w-0">
              <div className="p-6 border-b border-[#e2e8f0] bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-primary">Lab Fees</h3>
                    <p className="text-xs text-slate-500 mt-1">Science and Computer practical laboratory equipment fees</p>
                  </div>
                </div>
                {editMode && (
                  <button onClick={addLabRow} className="text-sm font-semibold text-blue-600 flex items-center gap-1 hover:text-blue-800 shrink-0">
                    <Plus className="w-4 h-4" /> Add Row
                  </button>
                )}
              </div>
          
          {/* Mobile-only Horizontal scroll helper buttons */}
          <div className="flex lg:hidden justify-end items-center gap-2 px-6 py-2 text-slate-500 border-b border-[#e2e8f0] bg-slate-50/50">
            <span className="text-xs font-bold tracking-wider text-slate-600">Scroll table:</span>
            <button 
              type="button"
              onClick={() => scrollTableById('lab-fees-table', 'left')}
              className="p-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 active:scale-95 transition-all"
              aria-label="Scroll table left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              type="button"
              onClick={() => scrollTableById('lab-fees-table', 'right')}
              className="p-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 active:scale-95 transition-all"
              aria-label="Scroll table right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="relative w-full max-w-full">
            {/* Scroll fade overlay indicator */}
            <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-white dark:from-slate-900 to-transparent pointer-events-none z-10 lg:hidden flex items-center justify-end pr-2 text-orange-500">
              <ChevronRight className="w-5 h-5 animate-pulse" />
            </div>
            <div id="lab-fees-table" className="p-4 sm:p-6 overflow-x-auto custom-scrollbar pb-2 w-full max-w-full">
              <table className="w-full text-left whitespace-nowrap min-w-[750px]">
              <thead>
                <tr className="border-b border-[#e2e8f0]">
                  <th className="pb-4 font-semibold text-slate-700 w-1/3">Class</th>
                  <th className="pb-4 font-semibold text-slate-700 w-1/3">Subject</th>
                  <th className={`pb-4 font-semibold text-slate-700 w-1/3 text-right ${editMode ? '' : 'pr-14'}`}>Monthly/Annual Fee</th>
                  {editMode && <th className="pb-4 font-semibold text-slate-700 w-10 pr-14"></th>}
                </tr>
              </thead>
              <tbody className="text-sm">
                {(currentData.lab || []).map((row, index) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-3">
                      {editMode ? (
                        <input className="w-full border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none p-2 rounded" value={row.className || ''} onChange={(e) => {
                          const newLab = [...(editedData.lab || [])];
                          newLab[index].className = e.target.value;
                          setEditedData({ ...editedData, lab: newLab });
                        }} />
                      ) : <span className="font-medium text-slate-800">{row.className}</span>}
                    </td>
                    <td className="py-3">
                      {editMode ? (
                        <input className="w-full border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none p-2 rounded" value={row.subject || ''} onChange={(e) => {
                          const newLab = [...(editedData.lab || [])];
                          newLab[index].subject = e.target.value;
                          setEditedData({ ...editedData, lab: newLab });
                        }} />
                      ) : <span className="text-slate-600">{row.subject}</span>}
                    </td>
                    <td className={`py-3 text-right ${editMode ? '' : 'pr-14'}`}>
                      {editMode ? (
                        <input className="w-full border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none p-2 rounded text-right" value={row.fee || ''} onChange={(e) => {
                          const newLab = [...(editedData.lab || [])];
                          newLab[index].fee = e.target.value;
                          setEditedData({ ...editedData, lab: newLab });
                        }} />
                      ) : <span className="text-slate-600">NRs. {row.fee}</span>}
                    </td>
                    {editMode && (
                      <td className="py-3 text-right pr-14">
                        <button onClick={() => {
                          const newLab = (editedData.lab || []).filter((_, i) => i !== index);
                          setEditedData({ ...editedData, lab: newLab });
                        }} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 className="w-4 h-4"/></button>
                      </td>
                    )}
                  </tr>
                ))}
                {(!currentData.lab || currentData.lab.length === 0) && (
                  <tr><td colSpan={4} className="py-4 text-center text-gray-500">No lab fees data.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
            </div>
          </div>
        </div>

        {/* Dynamic Custom Tables Section */}
        {isAdmin && (
          <div className="bg-slate-50 rounded-2xl shadow-sm border border-[#e2e8f0] overflow-hidden p-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-xl font-bold text-primary flex items-center gap-2">
                  📂 Custom Fee Structures & Special Services
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Dynamic custom schedules defined by school administration (such as Extra Coaching, Hostel, Boarding, or Sports Programs).
                </p>
              </div>
              {editMode && (
                <button
                  type="button"
                  onClick={addCustomTable}
                  className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
                  title="Create a completely custom dynamic table with custom columns & rows"
                >
                  <Plus className="w-4 h-4" /> Add Custom Table
                </button>
              )}
            </div>

            {(currentData.customTables || []).length === 0 && (
              <div className="text-center py-8 text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">
                No custom fee tables created yet. Click "Add Custom Table" above while in Edit Mode to create one.
              </div>
            )}

            {(currentData.customTables || []).map((table, tblIndex) => (
              <div key={table.id} className="relative rounded-xl group transition-all duration-300 max-w-full min-w-0">
                {/* Outer Glow Bloom aura */}
                <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-30 blur-2xl transition-all duration-500 rounded-xl -z-10 group-hover:scale-102 pointer-events-none" />

                {/* Boundary box with rotating gradient for lightning border effect */}
                <div className="relative w-full h-full rounded-xl overflow-hidden p-[2.5px] bg-gray-150 dark:bg-slate-800 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-sm max-w-full min-w-0">
                  {/* Spinning lightning border */}
                  <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_4s_linear_infinite] opacity-25 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

                  {/* Inner masked content card */}
                  <div className="relative w-full h-full bg-white rounded-[10px] flex flex-col z-10 overflow-hidden flex-1 max-w-full min-w-0">
                <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="flex-1 w-full">
                    {editMode ? (
                      <div className="flex items-center gap-2 w-full max-w-sm">
                        <span className="text-[10px] uppercase font-extrabold tracking-wider text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Title:</span>
                        <input
                          type="text"
                          value={table.title || ''}
                          onChange={(e) => updateCustomTableTitle(table.id, e.target.value)}
                          className="w-full border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none p-1.5 rounded-lg text-sm font-bold text-primary bg-white"
                          placeholder="Table Title (e.g. Coaching Program)"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <h4 className="text-base font-bold text-primary flex items-center gap-2">
                          {table.title}
                        </h4>
                      </div>
                    )}
                  </div>

                  {editMode && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => addCustomTableColumn(table.id)}
                        className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1 hover:bg-blue-100 transition-colors"
                        title="Add a custom dynamic column header"
                      >
                        <Plus className="w-3.5 h-3.5" /> Column
                      </button>
                      <button
                        type="button"
                        onClick={() => addCustomTableRow(table.id)}
                        className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1 hover:bg-emerald-100 transition-colors"
                        title="Add a new row of data"
                      >
                        <Plus className="w-3.5 h-3.5" /> Row
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCustomTable(table.id)}
                        className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1 hover:bg-red-100 transition-colors"
                        title="Delete this entire table schedule"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Table
                      </button>
                    </div>
                  )}
                </div>

                {/* Mobile-only Horizontal scroll helper buttons */}
                <div className="flex lg:hidden justify-end items-center gap-2 px-4 py-2 text-slate-500 border-b border-slate-100 bg-slate-50/20">
                  <span className="text-xs font-bold tracking-wider text-slate-600">Scroll table:</span>
                  <button 
                    type="button"
                    onClick={() => scrollTableById(`custom-table-${table.id}`, 'left')}
                    className="p-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 active:scale-95 transition-all"
                    aria-label="Scroll table left"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button 
                    type="button"
                    onClick={() => scrollTableById(`custom-table-${table.id}`, 'right')}
                    className="p-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 active:scale-95 transition-all"
                    aria-label="Scroll table right"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="relative w-full max-w-full">
                  {/* Scroll fade overlay indicator */}
                  <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-white dark:from-slate-900 to-transparent pointer-events-none z-10 lg:hidden flex items-center justify-end pr-2 text-orange-500">
                    <ChevronRight className="w-5 h-5 animate-pulse" />
                  </div>
                  <div id={`custom-table-${table.id}`} className="p-4 overflow-x-auto custom-scrollbar pb-2 w-full max-w-full">
                    <table className="w-full text-left whitespace-nowrap min-w-[750px]">
                    <thead>
                      <tr className="border-b border-[#e2e8f0]">
                        {table.columns.map((col) => (
                          <th key={col.key} className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            {editMode ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={col.label || ''}
                                  onChange={(e) => updateCustomTableColumnLabel(table.id, col.key, e.target.value)}
                                  className="border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none px-2 py-1 rounded-lg font-bold text-xs w-28 text-slate-800 bg-white"
                                  title="Click to rename this column header"
                                />
                                {table.columns.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => deleteCustomTableColumn(table.id, col.key)}
                                    className="text-red-500 hover:bg-red-50 p-1 rounded-md transition-all"
                                    title="Delete this Column"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              col.label
                            )}
                          </th>
                        ))}
                        {editMode && <th className="pb-3 text-xs font-bold text-slate-500 uppercase w-10"></th>}
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {table.rows.map((row, rIdx) => (
                        <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                          {table.columns.map((col) => (
                            <td key={col.key} className="py-2.5 pr-4">
                              {editMode ? (
                                <input
                                  className="w-full border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none p-1.5 rounded-lg text-sm font-medium"
                                  value={row[col.key] || ''}
                                  onChange={(e) => updateCustomTableCell(table.id, row.id, col.key, e.target.value)}
                                />
                              ) : (
                                <span className="text-slate-700 font-medium whitespace-normal break-words">
                                  {row[col.key] || '-'}
                                </span>
                              )}
                            </td>
                          ))}
                          {editMode && (
                            <td className="py-2 text-right">
                              <button
                                type="button"
                                onClick={() => deleteCustomTableRow(table.id, row.id)}
                                className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                                title="Delete Row"
                              >
                                <Trash2 className="w-3.5 h-3.5"/>
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                      {table.rows.length === 0 && (
                        <tr>
                          <td colSpan={table.columns.length + (editMode ? 1 : 0)} className="py-4 text-center text-gray-400">
                            No data rows present. Click "+ Row" to add one.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
          </div>

          {/* Section 2: Scholarships */}
          <div className={`w-full px-1 md:px-0 ${activeTab === 'scholarships' ? 'block' : 'hidden'}`}>
            <div className="space-y-8 animate-fade-in pb-4">
          {/* Scholarship Registry (Group-wise class lists & edits) for Admin and Leadership */}
          {isAdmin && (
            <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] overflow-hidden">
              <div className="p-6 border-b border-[#e2e8f0] bg-slate-50 flex items-center gap-2">
                <Award className="w-6 h-6 text-emerald-600" />
                <h3 className="text-xl font-bold text-primary">Active Scholarships Registry</h3>
              </div>
              <div className="p-6">
                <ScholarshipTab studentsData={studentsData} />
              </div>
            </div>
          )}

          {/* Scholarship Policies Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl shadow-sm overflow-hidden mt-8">
        <div className="p-6 border-b border-blue-200 bg-blue-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-6 h-6 text-primary" />
            <h3 className="text-xl font-bold text-primary">Scholarship & Discount Policy</h3>
          </div>
          {isAdmin && !editMode && (
             <div>
                {policyEditMode ? (
                   <div className="flex gap-2">
                      <button onClick={handleSavePolicy} disabled={savingPolicy} className="bg-primary text-white px-3 py-1.5 rounded text-sm font-bold flex items-center gap-1 hover:bg-primary-dark">
                         {savingPolicy ? 'Saving...' : <><Save className="w-4 h-4"/> Save</>}
                      </button>
                      <button onClick={() => setPolicyEditMode(false)} className="bg-white text-gray-700 px-3 py-1.5 rounded text-sm font-bold flex items-center gap-1 hover:text-primary border border-gray-300">
                         <X className="w-4 h-4"/> Cancel
                      </button>
                   </div>
                ) : (
                   <button onClick={() => { setTempPolicy(data.scholarshipPolicy || defaultData.scholarshipPolicy || ''); setPolicyEditMode(true); }} className="border-primary text-primary bg-blue-50 px-3 py-1.5 rounded border border-primary text-primary shadow-sm text-sm font-bold flex items-center gap-1 hover:bg-blue-200 transition-colors">
                      <Edit2 className="w-4 h-4"/> Edit Policy
                   </button>
                )}
             </div>
          )}
        </div>
        <div className="p-6 text-slate-800 text-sm">
          {editMode || policyEditMode ? (
            <div className="bg-white rounded border border-gray-300 overflow-hidden">
               <style>{`.ql-editor { min-height: 150px; font-family: inherit; font-size: inherit; }`}</style>
               <ReactQuill 
                  theme="snow" 
                  value={policyEditMode ? tempPolicy : editedData.scholarshipPolicy} 
                  onChange={(val) => {
                     if (policyEditMode) setTempPolicy(val);
                     else setEditedData({ ...editedData, scholarshipPolicy: val });
                  }} 
                  modules={{
                     toolbar: [
                       ['bold', 'italic', 'underline'],
                       [{'list': 'ordered'}, {'list': 'bullet'}, { 'align': [] }],
                     ]
                  }}
               />
            </div>
          ) : (
             <div className="prose prose-sm max-w-none text-slate-800 overflow-x-auto overflow-y-hidden custom-scrollbar pb-2" 
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.scholarshipPolicy || defaultData.scholarshipPolicy || '') }} />
          )}
        </div>
      </div>

      {/* Scholarship & Discounts Section (Admin Only) */}
      {isAdmin && (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] overflow-hidden mt-8">
          <div className="p-6 border-b border-[#e2e8f0] bg-slate-50 flex items-center gap-2">
            <Award className="w-6 h-6 text-primary" />
            <h3 className="text-xl font-bold text-primary">Scholarships & Discounts Allocation</h3>
          </div>
          
          <div className="p-6">
            <p className="text-sm text-slate-600 mb-6">Search for a student to assign or update their fee scholarships and discounts.</p>
            
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search by student name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchStudents()}
                  className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
                {searchResults.length > 0 && !selectedStudent && (
                  <div className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                    {searchResults.map((student) => (
                      <div
                        key={student.id}
                        onClick={() => setSelectedStudent(student)}
                        className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-slate-100 text-slate-900"
                      >
                        <div className="flex items-center">
                          <span className="font-medium block truncate">
                            {student.firstName} {student.lastName}
                          </span>
                          <span className="ml-2 text-slate-500 text-xs block truncate">
                            ({student.email})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handleSearchStudents}
                disabled={searching || !searchTerm.trim()}
                className="bg-primary text-white px-6 py-2 rounded-lg font-semibold hover:bg-primary-dark disabled:opacity-50 transition-colors"
              >
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>

            {discountMessage.text && (
              <div className={`p-4 rounded-lg mb-6 text-sm ${discountMessage.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {discountMessage.text}
              </div>
            )}

 

            {selectedStudent && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="text-lg font-semibold text-blue-900">Configure Discount for {selectedStudent.firstName} {selectedStudent.lastName}</h4>
                    <p className="text-sm text-blue-700">{selectedStudent.email}</p>
                    {selectedStudent.discount && (
                      <p className="text-xs font-medium text-amber-600 mt-2">
                        Current Active: {selectedStudent.discount.type} ({selectedStudent.discount.value}{selectedStudent.discount.valueType === 'Percentage' ? '%' : ' Rs.'})
                      </p>
                    )}
                  </div>
                  <button onClick={() => setSelectedStudent(null)} className="text-slate-500 hover:text-slate-700">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Scholarship / Discount Type</label>
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value)}
                      className="block w-full border border-slate-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="Merit">Merit Scholarship</option>
                      <option value="Merit - 1st Position (>90%)">Merit - 1st Position (&gt;90%)</option>
                      <option value="Merit - 2nd/3rd Position (>85%)">Merit - 2nd/3rd Position (&gt;85%)</option>
                      <option value="Need-based">Need-based Assistance</option>
                      <option value="Sibling">Sibling Discount</option>
                      <option value="Employee Child">Employee Child</option>
                      <option value="Custom">Custom Override</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Value Type</label>
                    <select
                      value={valueType}
                      onChange={(e) => setValueType(e.target.value)}
                      className="block w-full border border-slate-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="Percentage">Percentage (%)</option>
                      <option value="Fixed">Fixed Amount (Rs.)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Value</label>
                    <input
                      type="number" min="0" step="any" onKeyDown={(e) => { if (e.key === '-' || e.key === 'e') e.preventDefault(); }}
                      max={valueType === 'Percentage' ? 100 : undefined}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={valueType === 'Percentage' ? 'e.g. 50' : 'e.g. 1000'}
                      className="block w-full border border-slate-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setSelectedStudent(null)}
                    className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApplyDiscount}
                    disabled={!discountValue || applyingDiscount}
                    className="px-6 py-2 bg-primary border border-transparent rounded-lg text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    {applyingDiscount ? 'Applying...' : 'Apply to Account'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
            </div>
          </div>
        </div>
      </div>

      {/* Wall Poster Print / Download Modal */}
      <FeeStructureWallChartModal
        isOpen={showWallChartModal}
        onClose={() => setShowWallChartModal(false)}
        data={currentData}
      />

    </div>
  );
};

export default FeeStructure;

