import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Calculator,
  Award,
  Users,
  Bus,
  Utensils,
  CheckCircle2,
  Percent,
  Coins,
  Building,
  GraduationCap
} from 'lucide-react';

interface AcademicFeeItem {
  id: string;
  className: string;
  admission: string;
  annual: string;
  tuition: string;
  exam: string;
  computer: string;
  [key: string]: string;
}

interface TransportFeeItem {
  id: string;
  className: string;
  route: string;
  fee: string;
}

interface FeeStructureData {
  academicYear?: string;
  academic: AcademicFeeItem[];
  transportation: TransportFeeItem[];
}

const defaultAcademicFees: AcademicFeeItem[] = [
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
];

const defaultTransportFees: TransportFeeItem[] = [
  { id: 't1', className: 'All Classes', route: 'Badahara Mirchaiya', fee: '400' },
  { id: 't2', className: 'All Classes', route: 'Karjanha/Bastipur', fee: '400' },
  { id: 't3', className: 'All Classes', route: 'Bagaha/Bhulkiya', fee: '400' },
  { id: 't4', className: 'All Classes', route: 'Betaha', fee: '500' },
  { id: 't5', className: 'All Classes', route: 'Thalha', fee: '600' },
  { id: 't6', className: 'All Classes', route: 'Simara/Mareba (South)', fee: '600' },
  { id: 't7', className: 'All Classes', route: 'Simara/Mareba (North)', fee: '600' },
  { id: 't8', className: 'All Classes', route: 'Manharwa', fee: '600' }
];

function getCategoryForClass(className: string): 'Pre-Primary' | 'Primary' | 'Middle School' | 'Secondary' {
  const lower = className.toLowerCase();
  if (lower.includes('play') || lower.includes('pg') || lower.includes('nursery') || lower.includes('lkg') || lower.includes('ukg')) {
    return 'Pre-Primary';
  }
  if (lower.includes('class 1') || lower.includes('class 2') || lower.includes('class 3') || lower.includes('class 4') || lower.includes('class 5')) {
    return 'Primary';
  }
  if (lower.includes('class 6') || lower.includes('class 7') || lower.includes('class 8')) {
    return 'Middle School';
  }
  return 'Secondary';
}

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  const num = Number(val.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? 0 : num;
}

export const FeeEstimator: React.FC = () => {
  const [feeData, setFeeData] = useState<FeeStructureData>({
    academicYear: '2083',
    academic: defaultAcademicFees,
    transportation: defaultTransportFees
  });

  const [selectedGrade, setSelectedGrade] = useState<string>('Class 1');
  const [terminalRank, setTerminalRank] = useState<'1st' | '2nd' | '3rd' | 'none'>('none');
  const [siblingCount, setSiblingCount] = useState<number>(1); // 1 = 1st child, 2 = 2nd child, 3 = 3rd+ child
  const [selectedRouteId, setSelectedRouteId] = useState<string>('none');

  // Subscribe to live fee structure in Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'fee_structure'), (docSnap) => {
      if (docSnap.exists()) {
        const snapData = docSnap.data();
        const academicList = snapData.academic && snapData.academic.length > 0 ? snapData.academic : defaultAcademicFees;
        const transportList = snapData.transportation && snapData.transportation.length > 0 ? snapData.transportation : defaultTransportFees;
        setFeeData({
          academicYear: snapData.academicYear || '2083',
          academic: academicList,
          transportation: transportList
        });
      }
    }, (err) => {
      console.warn("FeeEstimator Firestore listener error:", err.message);
    });

    return () => unsub();
  }, []);

  // Selected Grade Row object
  const currentGradeRow = useMemo(() => {
    return (
      feeData.academic.find((g) => g.className.toLowerCase() === selectedGrade.toLowerCase()) ||
      feeData.academic.find((g) => g.className.includes('1')) ||
      feeData.academic[0]
    );
  }, [feeData.academic, selectedGrade]);

  const category = getCategoryForClass(currentGradeRow.className);
  const baseTuition = parseNum(currentGradeRow.tuition);
  const admissionFeeGross = parseNum(currentGradeRow.admission);
  const annualCharges = parseNum(currentGradeRow.annual);
  const examFee = parseNum(currentGradeRow.exam); // Taken once every 3 months before terminal exam
  const computerFee = parseNum(currentGradeRow.computer);

  // Selected Transportation Route
  const selectedRouteObj = useMemo(() => {
    if (selectedRouteId === 'none') return null;
    return feeData.transportation.find((t) => t.id === selectedRouteId) || null;
  }, [feeData.transportation, selectedRouteId]);

  const transportCost = selectedRouteObj ? parseNum(selectedRouteObj.fee) : 0;

  // Calculate Rank-based Scholarship Discount
  const rankDiscountPercent = useMemo(() => {
    if (terminalRank === '1st') return 50; // 1st Rank = 50% Tuition Waiver
    if (terminalRank === '2nd') return 30; // 2nd Rank = 30% Tuition Waiver
    if (terminalRank === '3rd') return 20; // 3rd Rank = 20% Tuition Waiver
    return 0;
  }, [terminalRank]);

  // Calculate Sibling Discount
  const siblingDiscountPercent = useMemo(() => {
    if (siblingCount === 2) return 20; // 2nd child gets 20% tuition discount
    if (siblingCount >= 3) return 35; // 3rd+ child gets 35% tuition discount
    return 0;
  }, [siblingCount]);

  // Total Tuition Discount capped at 75% max
  const totalTuitionDiscountPercent = useMemo(() => {
    const total = rankDiscountPercent + siblingDiscountPercent;
    return Math.min(total, 75);
  }, [rankDiscountPercent, siblingDiscountPercent]);

  // Financial calculations
  const grossMonthlyTuition = baseTuition;
  const monthlyTuitionDiscount = Math.round((grossMonthlyTuition * totalTuitionDiscountPercent) / 100);
  const netMonthlyTuition = grossMonthlyTuition - monthlyTuitionDiscount;

  // Regular monthly breakdown sum (tuition + computer + bus route)
  const totalNetMonthlyFee = netMonthlyTuition + computerFee + transportCost;
  const totalGrossMonthlyFee = grossMonthlyTuition + computerFee + transportCost;

  // One time admission fee
  const netAdmissionFee = admissionFeeGross;

  // Annual Totals: (12 Months * Monthly Fee) + (4 Terminal Exams * Exam Fee) + Annual Charges + Admission
  const totalExamFeesAnnual = examFee * 4;
  const netAnnualCost = (totalNetMonthlyFee * 12) + totalExamFeesAnnual + annualCharges + netAdmissionFee;
  const grossAnnualCost = (totalGrossMonthlyFee * 12) + totalExamFeesAnnual + annualCharges + admissionFeeGross;
  const annualSavings = grossAnnualCost - netAnnualCost;

  return (
    <section className="container mx-auto max-w-6xl my-12 px-4 sm:px-6">
      <div className="relative bg-gradient-to-br from-slate-900 via-[#1B4F72] to-slate-950 rounded-3xl p-6 sm:p-10 text-white shadow-2xl border border-blue-900/40 overflow-hidden">
        {/* Background Glowing Ambient Accents */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Section Header */}
        <div className="relative z-10 text-center max-w-3xl mx-auto space-y-3 mb-10">
          <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-400/15 text-amber-300 text-[11px] font-black uppercase tracking-widest border border-amber-400/20 shadow-sm font-poppins">
            <Coins className="w-3.5 h-3.5 text-amber-400" /> Academic Session {feeData.academicYear} Fee Calculator
          </span>
          <h2 className="text-2xl sm:text-4xl font-black font-display text-white tracking-tight leading-tight">
            Interactive <span className="text-amber-400">Fee & Scholarship</span> Estimator
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 font-medium leading-relaxed max-w-2xl mx-auto">
            Calculated automatically using Shikshantar Academy’s official tuition, exam, computer, and bus route fee structures.
          </p>
        </div>

        {/* Main Grid: Controls vs Live Summary */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Inputs Column (7 Cols) */}
          <div className="lg:col-span-7 bg-white/5 backdrop-blur-md rounded-2xl p-5 sm:p-7 border border-white/10 space-y-6">
            
            {/* Step 1: Grade Level Selection */}
            <div>
              <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300 mb-2.5 font-poppins">
                <GraduationCap className="w-4 h-4 text-amber-400" /> 1. Select Grade / Class
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {feeData.academic.map((g) => {
                  const isSelected = selectedGrade.toLowerCase() === g.className.toLowerCase();
                  const cat = getCategoryForClass(g.className);
                  return (
                    <button
                      key={g.id || g.className}
                      onClick={() => setSelectedGrade(g.className)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 border text-center flex flex-col items-center justify-center cursor-pointer ${
                        isSelected
                          ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-lg scale-102 font-black'
                          : 'bg-slate-900/60 text-slate-300 border-white/10 hover:border-amber-400/40 hover:text-white'
                      }`}
                    >
                      <span className="font-extrabold">{g.className}</span>
                      <span className={`text-[9px] ${isSelected ? 'text-slate-900 font-bold' : 'text-slate-400'}`}>
                        {cat}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Rank Obtained in Last Terminal Exam */}
            <div className="bg-slate-900/40 p-4 rounded-xl border border-white/5 space-y-3">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300 font-poppins">
                  <Award className="w-4 h-4 text-amber-400" /> 2. Rank Obtained in Last Terminal Exam
                </label>
                <span className={`font-black text-xs px-2.5 py-1 rounded-lg border transition-all ${
                  rankDiscountPercent > 0 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                    : 'bg-slate-800 text-slate-400 border-white/5'
                }`}>
                  {rankDiscountPercent > 0 ? `${rankDiscountPercent}% Rank Scholarship` : 'Standard Rate'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {[
                  { id: '1st', title: 'First Position', sub: '1st Rank (50% Off)' },
                  { id: '2nd', title: 'Second Position', sub: '2nd Rank (30% Off)' },
                  { id: '3rd', title: 'Third Position', sub: '3rd Rank (20% Off)' },
                  { id: 'none', title: 'Other / General', sub: 'Standard Fee' },
                ].map((rank) => {
                  const isActive = terminalRank === rank.id;
                  return (
                    <button
                      key={rank.id}
                      type="button"
                      onClick={() => setTerminalRank(rank.id as any)}
                      className={`p-3 rounded-xl text-left transition-all border cursor-pointer ${
                        isActive
                          ? 'bg-amber-400/20 border-amber-400 text-amber-300 shadow-sm'
                          : 'bg-slate-900/80 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
                      }`}
                    >
                      <div className="text-xs font-extrabold leading-tight">{rank.title}</div>
                      <div className={`text-[10px] font-bold mt-0.5 ${isActive ? 'text-amber-200' : 'text-slate-500'}`}>
                        {rank.sub}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Sibling Status */}
            <div className="bg-slate-900/40 p-4 rounded-xl border border-white/5 space-y-2">
              <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300 font-poppins">
                <Users className="w-4 h-4 text-amber-400" /> 3. Sibling Status & Family Benefit
              </label>
              <select
                value={siblingCount}
                onChange={(e) => setSiblingCount(Number(e.target.value))}
                className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-400 cursor-pointer"
              >
                <option value={1}>1st Child (Single Entry - Standard Rate)</option>
                <option value={2}>2nd Sibling Enrolled (20% Off Tuition)</option>
                <option value={3}>3rd+ Sibling Enrolled (35% Off Tuition)</option>
              </select>
            </div>

            {/* Step 4: Bus Transportation Route */}
            <div className="bg-slate-900/40 p-4 rounded-xl border border-white/5 space-y-2">
              <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300 font-poppins">
                <Bus className="w-4 h-4 text-amber-400" /> 4. Bus Transportation Route
              </label>
              <select
                value={selectedRouteId}
                onChange={(e) => setSelectedRouteId(e.target.value)}
                className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-400 cursor-pointer"
              >
                <option value="none">Self Transit / Walking (Free)</option>
                {feeData.transportation.map((t) => (
                  <option key={t.id || t.route} value={t.id}>
                    {t.route} — NRs. {(parseNum(t.fee) || 0).toLocaleString()}/mo
                  </option>
                ))}
              </select>
            </div>

          </div>

          {/* Right Summary Column (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 rounded-2xl p-6 text-slate-950 shadow-xl border border-amber-300/50 space-y-6">
              
              <div className="flex justify-between items-start border-b border-slate-950/15 pb-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-900 block font-poppins">
                    OFFICIAL FEE ESTIMATE BREAKDOWN
                  </span>
                  <h3 className="text-2xl font-black text-slate-950 tracking-tight font-display mt-0.5">
                    {currentGradeRow.className} <span className="text-slate-800 text-xs font-bold">({category})</span>
                  </h3>
                </div>
                <div className="bg-slate-950 text-amber-400 p-2.5 rounded-xl shadow-md">
                  <Calculator className="w-6 h-6" />
                </div>
              </div>

              {/* Itemized breakdown from official fee structure */}
              <div className="space-y-2.5 text-xs font-medium text-slate-900">
                <div className="flex justify-between items-center">
                  <span>Standard Monthly Tuition</span>
                  <span className="font-extrabold">NRs. {(grossMonthlyTuition || 0).toLocaleString()}</span>
                </div>

                {totalTuitionDiscountPercent > 0 && (
                  <div className="flex justify-between items-center bg-slate-950/10 px-3 py-1.5 rounded-lg border border-slate-950/15">
                    <span className="font-bold text-slate-950 flex items-center gap-1">
                      <Percent className="w-3.5 h-3.5 text-slate-900" /> Scholarship Discount ({totalTuitionDiscountPercent}%)
                    </span>
                    <span className="font-black text-emerald-900">-NRs. {(monthlyTuitionDiscount || 0).toLocaleString()}</span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span>Net Monthly Tuition</span>
                  <span className="font-extrabold">NRs. {(netMonthlyTuition || 0).toLocaleString()}</span>
                </div>

                {computerFee > 0 && (
                  <div className="flex justify-between items-center">
                    <span>Computer / Tech Practical Fee</span>
                    <span className="font-bold">NRs. {(computerFee || 0).toLocaleString()}</span>
                  </div>
                )}

                {transportCost > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="truncate max-w-[200px]">Bus Route ({selectedRouteObj?.route})</span>
                    <span className="font-bold shrink-0">NRs. {(transportCost || 0).toLocaleString()}</span>
                  </div>
                )}

                <div className="border-t border-slate-950/20 pt-3 flex justify-between items-baseline">
                  <span className="font-black uppercase tracking-wider text-xs">Net Monthly Fee</span>
                  <div className="text-right">
                    <span className="text-2xl font-black text-slate-950 block leading-none font-display">
                      NRs. {(totalNetMonthlyFee || 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] font-bold text-slate-800">per month</span>
                  </div>
                </div>

                {/* Additional non-monthly charges */}
                <div className="pt-2 border-t border-slate-950/15 space-y-1.5 text-[11px] text-slate-900 font-semibold">
                  <div className="flex justify-between items-center bg-slate-950/10 p-2 rounded-lg border border-slate-950/10">
                    <span>Terminal Exam Fee (Once per 3 mo / 4 terms)</span>
                    <span className="font-black text-slate-950">NRs. {(examFee || 0).toLocaleString()} / exam</span>
                  </div>

                  <div className="flex justify-between items-center pt-0.5">
                    <span>Annual Charges (One-Time / Year)</span>
                    <span className="font-bold">NRs. {(annualCharges || 0).toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span>One-Time Admission Fee</span>
                    <span className="font-bold">
                      NRs. {(netAdmissionFee || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Annual Savings highlight badge */}
              {annualSavings > 0 && (
                <div className="bg-slate-950 text-white rounded-xl p-4 border border-amber-300/40 shadow-inner space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-400 font-black text-xs uppercase tracking-wider font-poppins">
                    <Coins className="w-4 h-4 text-amber-400" /> Annual Scholarship Savings
                  </div>
                  <p className="text-2xl font-black text-amber-300 font-display">
                    NRs. {(annualSavings || 0).toLocaleString()} <span className="text-xs font-normal text-slate-300">Saved / Year</span>
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Calculated over 12 months including rank and sibling tuition waivers.
                  </p>
                </div>
              )}

            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-300 bg-white/5 p-3 rounded-xl border border-white/10 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Quotes are calculated dynamically according to official {feeData.academicYear} B.S. school fee structures.</span>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};


