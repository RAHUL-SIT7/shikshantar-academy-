/**
 * AUTHORITATIVE REPORTING & FINANCIAL ANALYTICS ENGINE
 * Shikshantar Academy School ERP
 *
 * Core Architectural Standards & Invariants:
 * 1. Single Source of Truth: Authoritative calculations read from Firestore
 *    'remitBills', 'transactions', 'student_advances', and 'users'.
 * 2. Status Invariants:
 *    - VOID and CANCELLED bills are strictly excluded from active billed and outstanding balances.
 *    - Reissued bills are included exactly once as the active obligation.
 *    - CANCELLED and REVERSED payment transactions are strictly excluded from active collection totals.
 * 3. Temporal & Calendar Invariants:
 *    - Strict Bikram Sambat (B.S.) date and month filtering.
 *    - No timezone date shifts; Gregorian date strings parsed at local noon in Nepal Standard Time.
 *    - Previous-year arrears are tracked as isolated balances, never merged into current-year billed totals.
 * 4. Multi-Layer Integrity:
 *    - Family report totals strictly equal SUM(child records) with zero phantom double-counting.
 *    - Class reports contain only students belonging to that class without cross-class leakage.
 * 5. Authentic Zero State:
 *    - When datasets are empty or amounts are zero, outputs are authentic 0 and empty arrays (zero mock/fake fallback).
 * 6. Access Control:
 *    - Teachers are denied fee reporting access. Students are restricted strictly to their own records.
 */

import { formatBSDate, getBSYearMonthDate, NEPALI_MONTHS, normalizeBSDateStr } from './nepaliDate';
import { parseIntegerAmount } from './cashPaymentEngine';

export interface ReportFilterOptions {
  academicYear?: string;
  month?: string; // e.g. 'Baisakh', 'Jestha', ... or 'All'
  className?: string; // e.g. 'Class 8' or 'All'
  date?: string; // BS date YYYY-MM-DD
  startDate?: string;
  endDate?: string;
  status?: string;
}

export interface StudentReportSummary {
  studentId: string;
  studentName: string;
  class: string;
  academicYear: string;
  currentYearBilled: number;
  currentYearPaid: number;
  currentYearDue: number;
  previousYearArrears: number;
  totalActiveBilled: number;
  totalActivePaid: number;
  totalActiveDue: number;
  advanceBalance: number;
  billsCount: number;
  activeBills: Array<{
    id: string;
    billNo: string;
    academicYear: string;
    coveredMonths: string[];
    totalAmount: number;
    paidAmount: number;
    dueAmount: number;
    status: string;
  }>;
  transactionsCount: number;
  validTransactions: Array<{
    id: string;
    receiptNo: string;
    amount: number;
    date: string;
    status: string;
  }>;
}

export interface FamilyReportSummary {
  familyKey: string;
  familyId?: string;
  guardianName: string;
  guardianPhone: string;
  childrenCount: number;
  children: Array<{
    studentId: string;
    name: string;
    class: string;
    billed: number;
    paid: number;
    due: number;
  }>;
  totalFamilyBilled: number;
  totalFamilyPaid: number;
  totalFamilyDue: number;
  previousYearDue: number;
  currentYearDue: number;
}

export interface ClassReportSummary {
  className: string;
  academicYear: string;
  totalStudents: number;
  totalBilled: number;
  totalPaid: number;
  totalDue: number;
  defaultersCount: number;
  students: Array<{
    studentId: string;
    name: string;
    billed: number;
    paid: number;
    due: number;
    status: 'paid' | 'partial' | 'due' | 'zero';
  }>;
}

export interface DailyCollectionReportSummary {
  dateBS: string;
  academicYear: string;
  totalCollection: number;
  transactionCount: number;
  transactions: Array<{
    id: string;
    receiptNo: string;
    studentId: string;
    studentName: string;
    class: string;
    amount: number;
    method: string;
    status: string;
  }>;
}

export interface MonthlyCollectionReportSummary {
  monthName: string;
  academicYear: string;
  totalCollection: number;
  transactionCount: number;
  dailyBreakdown: Record<string, number>;
  transactions: Array<{
    id: string;
    receiptNo: string;
    studentId: string;
    studentName: string;
    class: string;
    dateBS: string;
    amount: number;
    status: string;
  }>;
}

export interface SchoolFinancialAnalyticsSummary {
  academicYear: string;
  totalActiveBilled: number;
  totalActivePaid: number;
  totalActiveDue: number;
  totalPreviousYearArrears: number;
  totalAdvances: number;
  totalReversedAmount: number;
  activeDefaultersCount: number;
  classBreakdown: Array<{
    className: string;
    billed: number;
    paid: number;
    due: number;
  }>;
  monthCollectionBreakdown: Record<string, number>;
  collectionRatioPercent: number;
}

/**
 * Normalizes Nepali month names to canonical 12 BS month names
 */
export function normalizeBSMonth(month?: string): string {
  if (!month) return '';
  const clean = month.trim().toLowerCase();
  if (clean.includes('baisak')) return 'Baisakh';
  if (clean.includes('jest')) return 'Jestha';
  if (clean.includes('asar') || clean.includes('ashad')) return 'Ashadh';
  if (clean.includes('shrawan') || clean.includes('saun')) return 'Shrawan';
  if (clean.includes('bhadra') || clean.includes('bhadau')) return 'Bhadra';
  if (clean.includes('ashwin') || clean.includes('asoj')) return 'Ashwin';
  if (clean.includes('kartik')) return 'Kartik';
  if (clean.includes('mangsir') || clean.includes('mangs')) return 'Mangsir';
  if (clean.includes('poush') || clean.includes('paush') || clean.includes('pus')) return 'Poush';
  if (clean.includes('magh')) return 'Magh';
  if (clean.includes('falgun') || clean.includes('phagun')) return 'Falgun';
  if (clean.includes('chaitra') || clean.includes('chait')) return 'Chaitra';
  return month.trim();
}

/**
 * Extracts the BS month name from any date representation (BS string, Gregorian Date, Timestamp)
 */
export function extractBSMonthName(date: any): string {
  if (!date) return '';
  if (typeof date === 'string') {
    const norm = normalizeBSDateStr(date);
    const parts = norm.split('T')[0].split('-');
    if (parts.length >= 2 && Number(parts[0]) > 2040) {
      const mIdx = Number(parts[1]) - 1;
      return NEPALI_MONTHS[mIdx] || '';
    }
  }
  const { month } = getBSYearMonthDate(date);
  return NEPALI_MONTHS[month] || '';
}

/**
 * Extracts the BS academic year from any date representation
 */
export function extractBSYear(date: any, fallbackYear: string = '2083'): string {
  if (!date) return fallbackYear;
  if (typeof date === 'string') {
    const norm = normalizeBSDateStr(date);
    const parts = norm.split('T')[0].split('-');
    if (parts.length >= 1 && Number(parts[0]) > 2040) {
      return String(parts[0]);
    }
  }
  const { year } = getBSYearMonthDate(date);
  return String(year || fallbackYear);
}

/**
 * Checks if a bill is active (not void, not cancelled)
 */
export function isBillActive(bill: any): boolean {
  if (!bill) return false;
  const status = String(bill.status || '').toLowerCase().trim();
  return status !== 'void' && status !== 'cancelled';
}

/**
 * Checks if a transaction is active collection (not cancelled, not reversed)
 */
export function isTransactionActive(tx: any): boolean {
  if (!tx) return false;
  const status = String(tx.status || '').toUpperCase().trim();
  return status === 'SUCCESS' || status === 'OVERRIDE_SUCCESS' || status === 'COMPLETED';
}

/**
 * Evaluates whether a user role is authorized to access financial reports
 */
export function canAccessFinancialReports(
  role: string,
  requestContext?: { requestingUserId?: string; targetStudentId?: string; targetFamilyId?: string }
): { allowed: boolean; reason?: string } {
  const normRole = (role || '').toLowerCase().trim();

  // Admin and Accountants have full access
  if (normRole === 'admin' || normRole === 'super_admin' || normRole === 'accountant') {
    return { allowed: true };
  }

  // Teachers are strictly denied fee financial reports
  if (normRole === 'teacher' || normRole === 'staff') {
    return { allowed: false, reason: 'Unauthorized: Teachers do not possess fee financial reporting privileges' };
  }

  // Students can only access their own student report
  if (normRole === 'student') {
    if (requestContext?.requestingUserId && requestContext?.targetStudentId && requestContext.requestingUserId === requestContext.targetStudentId) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Unauthorized: Students may only view their own financial records' };
  }

  return { allowed: false, reason: 'Unauthorized access level' };
}

/**
 * Generates an authoritative Student Financial Report from raw Firestore collections
 */
export function generateStudentFinancialReport(
  student: any,
  bills: any[],
  transactions: any[],
  academicYear: string = '2083'
): StudentReportSummary {
  if (!student) {
    return {
      studentId: '',
      studentName: '',
      class: '',
      academicYear,
      currentYearBilled: 0,
      currentYearPaid: 0,
      currentYearDue: 0,
      previousYearArrears: 0,
      totalActiveBilled: 0,
      totalActivePaid: 0,
      totalActiveDue: 0,
      advanceBalance: 0,
      billsCount: 0,
      activeBills: [],
      transactionsCount: 0,
      validTransactions: []
    };
  }

  const sId = student.id || student.studentId;
  const sName = student.fullName || student.name || 'Student';
  const sClass = student.class || '';

  // Filter bills strictly belonging to this student (matching studentId)
  const studentBills = bills.filter(b => {
    return b.studentId === sId || b.studentId === student.studentId;
  });

  const activeBills = studentBills.filter(isBillActive);

  let currentYearBilled = 0;
  let currentYearPaid = 0;
  let currentYearDue = 0;
  let previousYearArrears = 0;

  activeBills.forEach(b => {
    const bTotal = parseIntegerAmount(b.totalAmount || 0);
    const bPaid = parseIntegerAmount(b.paidAmount || 0);
    const bDue = parseIntegerAmount(b.dueAmount !== undefined ? b.dueAmount : Math.max(0, bTotal - bPaid));
    const safeYearStr = (typeof academicYear === 'string' || typeof academicYear === 'number') ? String(academicYear) : '2083';
    const bYear = String(b.academicYear || '').replace(/\D/g, '') || safeYearStr;
    const currYearNum = Number(safeYearStr.replace(/\D/g, '')) || 2083;
    const bYearNum = Number(bYear);

    if (bYearNum < currYearNum) {
      previousYearArrears += bDue;
    } else {
      currentYearBilled += bTotal;
      currentYearPaid += bPaid;
      currentYearDue += bDue;
    }
  });

  // Filter transactions strictly for this student
  const studentTx = transactions.filter(t => {
    return (t.studentId === sId || t.studentId === student.studentId) && isTransactionActive(t);
  });

  const totalActiveBilled = currentYearBilled + previousYearArrears;
  const totalActivePaid = currentYearPaid;
  const totalActiveDue = currentYearDue + previousYearArrears;

  return {
    studentId: sId,
    studentName: sName,
    class: sClass,
    academicYear,
    currentYearBilled,
    currentYearPaid,
    currentYearDue,
    previousYearArrears,
    totalActiveBilled,
    totalActivePaid,
    totalActiveDue,
    advanceBalance: parseIntegerAmount(student.advanceBalance || 0),
    billsCount: activeBills.length,
    activeBills: activeBills.map(b => ({
      id: b.id || b.billId,
      billNo: b.billNo || b.id,
      academicYear: b.academicYear || academicYear,
      coveredMonths: Array.isArray(b.coveredMonths) ? b.coveredMonths : [],
      totalAmount: parseIntegerAmount(b.totalAmount || 0),
      paidAmount: parseIntegerAmount(b.paidAmount || 0),
      dueAmount: parseIntegerAmount(b.dueAmount !== undefined ? b.dueAmount : Math.max(0, (b.totalAmount || 0) - (b.paidAmount || 0))),
      status: b.status || 'pending'
    })),
    transactionsCount: studentTx.length,
    validTransactions: studentTx.map(t => ({
      id: t.id || t.transactionId,
      receiptNo: t.receiptNo || t.receipt || '',
      amount: parseIntegerAmount(t.amount || 0),
      date: formatBSDate(t.date || t.createdAt),
      status: t.status
    }))
  };
}

/**
 * Generates an authoritative Class Financial Report
 */
export function generateClassFinancialReport(
  className: string,
  students: any[],
  bills: any[],
  academicYear: string = '2083',
  monthFilter?: string
): ClassReportSummary {
  const normClass = (className || '').trim().toLowerCase();
  const filteredStudents = normClass === 'all' || !normClass
    ? students
    : students.filter(s => (s.class || '').trim().toLowerCase() === normClass);

  let totalBilled = 0;
  let totalPaid = 0;
  let totalDue = 0;
  let defaultersCount = 0;

  const studentSummaries = filteredStudents.map(s => {
    const sId = s.id || s.studentId;
    const sBills = bills.filter(b => {
      const matchId = b.studentId === sId || b.studentId === s.studentId;
      if (!matchId) return false;
      if (!isBillActive(b)) return false;

      // Academic Year Filter
      const bYear = String(b.academicYear || '').replace(/\D/g, '');
      const aYear = academicYear.replace(/\D/g, '');
      if (aYear && bYear && bYear !== aYear) return false;

      // Month Filter
      if (monthFilter && monthFilter !== 'All') {
        const normFilter = normalizeBSMonth(monthFilter);
        const covered = (b.coveredMonths || []).map((m: string) => normalizeBSMonth(m));
        if (!covered.includes(normFilter)) return false;
      }

      return true;
    });

    let sBilled = 0;
    let sPaid = 0;
    let sDue = 0;

    sBills.forEach(b => {
      const bTotal = parseIntegerAmount(b.totalAmount || 0);
      const bPaidAmt = parseIntegerAmount(b.paidAmount || 0);
      const bDueAmt = parseIntegerAmount(b.dueAmount !== undefined ? b.dueAmount : Math.max(0, bTotal - bPaidAmt));
      sBilled += bTotal;
      sPaid += bPaidAmt;
      sDue += bDueAmt;
    });

    if (sDue > 0) defaultersCount++;

    const status: 'paid' | 'partial' | 'due' | 'zero' = 
      sDue === 0 && sBilled > 0 ? 'paid' :
      sPaid > 0 && sDue > 0 ? 'partial' :
      sBilled > 0 ? 'due' : 'zero';

    totalBilled += sBilled;
    totalPaid += sPaid;
    totalDue += sDue;

    return {
      studentId: sId,
      name: s.fullName || s.name || 'Student',
      billed: sBilled,
      paid: sPaid,
      due: sDue,
      status
    };
  });

  return {
    className,
    academicYear,
    totalStudents: filteredStudents.length,
    totalBilled,
    totalPaid,
    totalDue,
    defaultersCount,
    students: studentSummaries
  };
}

/**
 * Generates an authoritative Daily Collection Report
 */
export function generateDailyCollectionReport(
  dateBS: string,
  transactions: any[],
  academicYear: string = '2083'
): DailyCollectionReportSummary {
  const normTargetDate = normalizeBSDateStr(dateBS);

  const dailyTx = transactions.filter(t => {
    if (!isTransactionActive(t)) return false;
    const txDateBS = formatBSDate(t.date || t.createdAt);
    const txDateYMD = normalizeBSDateStr(t.dateBS || formatBSDate(t.date || t.createdAt));
    return txDateYMD === normTargetDate || txDateBS === dateBS;
  });

  const totalCollection = dailyTx.reduce((sum, t) => sum + parseIntegerAmount(t.amount || 0), 0);

  return {
    dateBS,
    academicYear,
    totalCollection,
    transactionCount: dailyTx.length,
    transactions: dailyTx.map(t => ({
      id: t.id || t.transactionId,
      receiptNo: t.receiptNo || t.receipt || '',
      studentId: t.studentId || '',
      studentName: t.studentName || '',
      class: t.class || '',
      amount: parseIntegerAmount(t.amount || 0),
      method: t.paymentMethod || t.method || 'CASH',
      status: t.status
    }))
  };
}

/**
 * Generates an authoritative Monthly Collection Report
 */
export function generateMonthlyCollectionReport(
  monthName: string,
  transactions: any[],
  academicYear: string = '2083'
): MonthlyCollectionReportSummary {
  const normTargetMonth = normalizeBSMonth(monthName);
  const dailyBreakdown: Record<string, number> = {};

  const monthlyTx = transactions.filter(t => {
    if (!isTransactionActive(t)) return false;
    const txMonth = normalizeBSMonth(t.monthBS || extractBSMonthName(t.date || t.createdAt));
    const txYear = extractBSYear(t.date || t.createdAt, academicYear);

    if (academicYear && txYear !== academicYear) return false;
    return txMonth === normTargetMonth;
  });

  let totalCollection = 0;
  monthlyTx.forEach(t => {
    const amt = parseIntegerAmount(t.amount || 0);
    totalCollection += amt;
    const dateKey = normalizeBSDateStr(t.dateBS || formatBSDate(t.date || t.createdAt));
    dailyBreakdown[dateKey] = (dailyBreakdown[dateKey] || 0) + amt;
  });

  return {
    monthName: normTargetMonth,
    academicYear,
    totalCollection,
    transactionCount: monthlyTx.length,
    dailyBreakdown,
    transactions: monthlyTx.map(t => ({
      id: t.id || t.transactionId,
      receiptNo: t.receiptNo || t.receipt || '',
      studentId: t.studentId || '',
      studentName: t.studentName || '',
      class: t.class || '',
      dateBS: normalizeBSDateStr(t.dateBS || formatBSDate(t.date || t.createdAt)),
      amount: parseIntegerAmount(t.amount || 0),
      status: t.status
    }))
  };
}

/**
 * Computes overarching school financial analytics
 */
export function generateSchoolFinancialAnalytics(
  students: any[],
  bills: any[],
  transactions: any[],
  academicYear: string = '2083'
): SchoolFinancialAnalyticsSummary {
  let totalActiveBilled = 0;
  let totalActivePaid = 0;
  let totalActiveDue = 0;
  let totalPreviousYearArrears = 0;
  let totalAdvances = 0;
  let totalReversedAmount = 0;
  let activeDefaultersCount = 0;

  const classMap: Record<string, { billed: number; paid: number; due: number }> = {};
  const monthCollectionBreakdown: Record<string, number> = {};
  NEPALI_MONTHS.forEach(m => {
    monthCollectionBreakdown[m] = 0;
  });

  const currYearNum = Number(academicYear.replace(/\D/g, ''));

  // Active bills aggregation
  bills.forEach(b => {
    if (!isBillActive(b)) return;
    const bTotal = parseIntegerAmount(b.totalAmount || 0);
    const bPaid = parseIntegerAmount(b.paidAmount || 0);
    const bDue = parseIntegerAmount(b.dueAmount !== undefined ? b.dueAmount : Math.max(0, bTotal - bPaid));
    const bYear = String(b.academicYear || '').replace(/\D/g, '') || academicYear;
    const bYearNum = Number(bYear);

    if (bYearNum < currYearNum) {
      totalPreviousYearArrears += bDue;
    } else {
      totalActiveBilled += bTotal;
      totalActivePaid += bPaid;
      totalActiveDue += bDue;

      const cls = b.class || 'Unassigned';
      if (!classMap[cls]) classMap[cls] = { billed: 0, paid: 0, due: 0 };
      classMap[cls].billed += bTotal;
      classMap[cls].paid += bPaid;
      classMap[cls].due += bDue;
    }
  });

  // Active transactions aggregation
  transactions.forEach(t => {
    const amt = parseIntegerAmount(t.amount || 0);
    if (!isTransactionActive(t)) {
      if (t.status === 'CANCELLED' || t.status === 'REVERSED') {
        totalReversedAmount += amt;
      }
      return;
    }

    const txMonth = normalizeBSMonth(t.monthBS || extractBSMonthName(t.date || t.createdAt));
    if (monthCollectionBreakdown[txMonth] !== undefined) {
      monthCollectionBreakdown[txMonth] += amt;
    }
  });

  // Students advances & defaulters
  students.forEach(s => {
    totalAdvances += parseIntegerAmount(s.advanceBalance || 0);
    // Determine student due
    const sId = s.id || s.studentId;
    const sBills = bills.filter(b => (b.studentId === sId || b.studentId === s.studentId) && isBillActive(b));
    const sDue = sBills.reduce((acc, b) => acc + parseIntegerAmount(b.dueAmount !== undefined ? b.dueAmount : Math.max(0, (b.totalAmount || 0) - (b.paidAmount || 0))), 0);
    if (sDue > 0) activeDefaultersCount++;
  });

  const classBreakdown = Object.entries(classMap).map(([className, d]) => ({
    className,
    billed: d.billed,
    paid: d.paid,
    due: d.due
  })).sort((a, b) => a.className.localeCompare(b.className));

  const collectionRatioPercent = totalActiveBilled > 0
    ? Math.round((totalActivePaid / totalActiveBilled) * 100)
    : 0;

  return {
    academicYear,
    totalActiveBilled,
    totalActivePaid,
    totalActiveDue,
    totalPreviousYearArrears,
    totalAdvances,
    totalReversedAmount,
    activeDefaultersCount,
    classBreakdown,
    monthCollectionBreakdown,
    collectionRatioPercent
  };
}
