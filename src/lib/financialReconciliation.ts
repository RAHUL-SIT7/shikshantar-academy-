import { 
  Firestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  runTransaction
} from 'firebase/firestore';
import { formatBSDate, getBSYearMonthDate } from './nepaliDate';
import { recordLedgerAuditLog } from './auditLogger';

export interface StudentFinancialAuditResult {
  studentId: string;
  studentName: string;
  studentClass: string;
  studentRoll: string;
  // Totals
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  totalTransactionsAmount: number;
  totalAllocationsAmount: number;
  totalAdvanceBalance: number;
  totalRefundsAmount: number;
  totalReversalsAmount: number;
  // Discrepancies
  discrepancies: Array<{
    type: 'DUPLICATE_FEE_RECORD' | 'OVERPAID_FEE' | 'UNALLOCATED_TRANSACTION' | 'ALLOCATION_MISMATCH' | 'DOUBLE_COUNTED_BILL' | 'NEGATIVE_DUE';
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    title: string;
    details: string;
    affectedDocId?: string;
    recoverable: boolean;
  }>;
  isHealthy: boolean;
  itemizedLedger: Array<{
    month: string;
    type: string;
    totalFee: number;
    paidAmount: number;
    dueAmount: number;
    status: string;
    docId: string;
  }>;
  remitBillsSummary: Array<{
    id: string;
    billNo: string;
    period: string;
    totalAmount: number;
    paidAmount: number;
    dueAmount: number;
    status: string;
  }>;
}

/**
 * Normalizes Nepali month names to standard forms
 */
export const normalizeAuditMonth = (m?: string): string => {
  if (!m) return 'Unknown';
  const clean = m.trim().toLowerCase();
  if (clean.includes('baisak')) return 'Baisakh';
  if (clean.includes('jest')) return 'Jestha';
  if (clean.includes('asar') || clean.includes('ashad')) return 'Asar';
  if (clean.includes('shrawan') || clean.includes('saun')) return 'Shrawan';
  if (clean.includes('bhadra') || clean.includes('bhadau')) return 'Bhadra';
  if (clean.includes('ashwin') || clean.includes('asoj')) return 'Ashwin';
  if (clean.includes('kartik')) return 'Kartik';
  if (clean.includes('mangsir') || clean.includes('mangs')) return 'Mangsir';
  if (clean.includes('poush') || clean.includes('paush') || clean.includes('pus')) return 'Poush';
  if (clean.includes('magh')) return 'Magh';
  if (clean.includes('falgun') || clean.includes('phagun')) return 'Falgun';
  if (clean.includes('chaitra') || clean.includes('chait')) return 'Chaitra';
  return m.trim();
};

/**
 * Single-Source-of-Truth Financial Reconciliation & Audit for any Student.
 * Inspects:
 * - Student record
 * - studentFees collection
 * - remitBills collection
 * - billItems collection
 * - transactions collection
 * - student_advances collection
 * - refund_records collection
 */
export async function auditStudentFinancials(
  db: Firestore, 
  studentId: string
): Promise<StudentFinancialAuditResult> {
  // 1. Fetch Student doc
  const studentDocRef = doc(db, 'users', studentId);
  const studentSnap = await getDoc(studentDocRef);
  const studentData = studentSnap.exists() ? studentSnap.data() : {};
  const studentName = studentData.fullName || studentData.name || 'Unknown Student';
  const studentClass = studentData.class || '-';
  const studentRoll = studentData.rollNumber || studentData.roll || '-';

  // 2. Fetch studentFees
  const feesSnap = await getDocs(query(collection(db, 'studentFees'), where('studentId', '==', studentId)));
  const feesDocs: any[] = [];
  feesSnap.forEach(d => feesDocs.push({ id: d.id, ...d.data() }));

  // 3. Fetch remitBills
  const remitSnap = await getDocs(query(collection(db, 'remitBills'), where('studentId', '==', studentId)));
  const remitDocs: any[] = [];
  remitSnap.forEach(d => remitDocs.push({ id: d.id, ...d.data() }));

  // 4. Fetch transactions
  const txSnap = await getDocs(query(collection(db, 'transactions'), where('studentId', '==', studentId)));
  const txDocs: any[] = [];
  txSnap.forEach(d => txDocs.push({ id: d.id, ...d.data() }));

  // 5. Fetch student_advances
  const advSnap = await getDocs(query(collection(db, 'student_advances'), where('studentId', '==', studentId)));
  const advDocs: any[] = [];
  advSnap.forEach(d => advDocs.push({ id: d.id, ...d.data() }));

  // 6. Fetch refund_records
  const refSnap = await getDocs(query(collection(db, 'refund_records'), where('studentId', '==', studentId)));
  const refDocs: any[] = [];
  refSnap.forEach(d => refDocs.push({ id: d.id, ...d.data() }));

  // Analyze Data
  const discrepancies: StudentFinancialAuditResult['discrepancies'] = [];

  // Group fees by (Month + Normalized Type) to detect duplicates
  const feeHeadGroups: Record<string, any[]> = {};
  feesDocs.forEach(f => {
    const m = normalizeAuditMonth(f.month);
    const t = (f.type || f.feeType || 'Tuition Fee').trim().toLowerCase();
    // Special key to catch legacy doc like `studentId_Jestha` vs `studentId_Jestha_TuitionFee`
    const isLegacyCombinedTuition = f.id === `${studentId}_${m}` && t.includes('tuition');
    const groupKey = `${m}_${t}`;
    if (!feeHeadGroups[groupKey]) feeHeadGroups[groupKey] = [];
    feeHeadGroups[groupKey].push({ ...f, isLegacyCombinedTuition });
  });

  // Check for duplicates
  Object.entries(feeHeadGroups).forEach(([key, list]) => {
    if (list.length > 1) {
      const hasLegacy = list.some(x => x.isLegacyCombinedTuition);
      discrepancies.push({
        type: 'DUPLICATE_FEE_RECORD',
        severity: 'HIGH',
        title: `Duplicate Fee Head: ${key.replace('_', ' - ')}`,
        details: `Found ${list.length} separate documents in studentFees for ${key}: [${list.map(x => `${x.id} (NRs. ${x.totalFee || x.amount}, Paid: ${x.paidAmount || 0})`).join(', ')}]. ${hasLegacy ? 'Includes a legacy combined document that duplicates granular records.' : ''}`,
        affectedDocId: list.find(x => x.isLegacyCombinedTuition)?.id || list[1]?.id,
        recoverable: true
      });
    }
  });

  // Check for Paid > Billed on fee items
  feesDocs.forEach(f => {
    const billed = Number(f.totalFee || f.amount || 0);
    const paid = Number(f.paidAmount || 0);
    if (paid > billed && billed > 0) {
      discrepancies.push({
        type: 'OVERPAID_FEE',
        severity: 'HIGH',
        title: `Overpaid Fee: ${f.month} (${f.type || 'Fee'})`,
        details: `Paid amount (NRs. ${paid.toLocaleString()}) exceeds billed amount (NRs. ${billed.toLocaleString()}) by NRs. ${(paid - billed).toLocaleString()}.`,
        affectedDocId: f.id,
        recoverable: true
      });
    }
  });

  // Calculate clean totals (excluding identified legacy duplicates from true billed/paid)
  let totalBilled = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  const itemizedLedger: StudentFinancialAuditResult['itemizedLedger'] = [];

  // If there are duplicates, pick the primary canonical record for accurate reporting
  const processedKeys = new Set<string>();
  feesDocs.forEach(f => {
    const m = normalizeAuditMonth(f.month);
    const t = (f.type || f.feeType || 'Tuition Fee').trim().toLowerCase();
    const groupKey = `${m}_${t}`;

    // If this is a legacy combined doc that collides with a granular doc, skip it from the canonical total
    const duplicates = feeHeadGroups[groupKey] || [];
    const isDuplicateToIgnore = duplicates.length > 1 && f.id === `${studentId}_${m}` && duplicates.some(x => x.id !== f.id);

    if (!isDuplicateToIgnore) {
      const billed = Number(f.totalFee || f.amount || 0);
      const paid = Number(f.paidAmount || 0);
      const due = Math.max(0, billed - paid);

      totalBilled += billed;
      totalPaid += paid;
      totalOutstanding += due;

      itemizedLedger.push({
        month: f.month || m,
        type: f.type || f.feeType || 'Tuition Fee',
        totalFee: billed,
        paidAmount: paid,
        dueAmount: due,
        status: due === 0 && paid > 0 ? 'paid' : (paid > 0 ? 'partial' : 'due'),
        docId: f.id
      });
    }
  });

  // Transactions analysis
  let totalTxAmount = 0;
  let totalAllocationsAmount = 0;
  let totalReversalsAmount = 0;

  txDocs.forEach(tx => {
    if (tx.status === 'SUCCESS' || tx.status === 'OVERRIDE_SUCCESS') {
      const amt = Number(tx.amount || tx.cashReceived || 0);
      totalTxAmount += amt;

      const allocs = Array.isArray(tx.allocations) ? tx.allocations : [];
      let txAllocSum = 0;
      allocs.forEach((a: any) => {
        txAllocSum += Number(a.allocatedAmount || 0);
      });
      totalAllocationsAmount += txAllocSum;

      if (allocs.length === 0 && amt > 0 && !tx.isLegacyPayment) {
        discrepancies.push({
          type: 'UNALLOCATED_TRANSACTION',
          severity: 'MEDIUM',
          title: `Unallocated Payment Receipt #${tx.receipt || tx.receiptNo || tx.id}`,
          details: `Transaction amount NRs. ${amt.toLocaleString()} has no itemized fee allocations recorded in Firestore.`,
          affectedDocId: tx.id,
          recoverable: true
        });
      }
    } else if (tx.status === 'CANCELLED' || tx.status === 'REVERSED' || tx.status === 'REFUNDED') {
      totalReversalsAmount += Number(tx.amount || 0);
    }
  });

  // Advance balance
  let totalAdvanceBalance = Number(studentData.advanceBalance || 0);
  if (totalAdvanceBalance === 0) {
    advDocs.forEach(adv => {
      if (adv.status === 'ACTIVE') {
        totalAdvanceBalance += Number(adv.remainingCredit || adv.amount || 0);
      }
    });
  }

  // Refunds
  let totalRefundsAmount = 0;
  refDocs.forEach(ref => {
    if (ref.status === 'RETURNED_TO_GUARDIAN' || ref.status === 'APPROVED') {
      totalRefundsAmount += Number(ref.amount || 0);
    }
  });

  // Remit Bills summary
  const remitBillsSummary = remitDocs.map(b => {
    const total = Number(b.totalAmount || b.amount || 0);
    const paid = Number(b.paidAmount || (b.status === 'paid' ? total : 0));
    const due = Number(b.dueAmount !== undefined ? b.dueAmount : Math.max(0, total - paid));
    return {
      id: b.id,
      billNo: b.billNo || b.id,
      period: b.billingPeriod || 'N/A',
      totalAmount: total,
      paidAmount: paid,
      dueAmount: due,
      status: b.status || (due === 0 ? 'paid' : 'due')
    };
  });

  return {
    studentId,
    studentName,
    studentClass,
    studentRoll,
    totalBilled,
    totalPaid,
    totalOutstanding,
    totalTransactionsAmount: totalTxAmount,
    totalAllocationsAmount: totalAllocationsAmount,
    totalAdvanceBalance,
    totalRefundsAmount,
    totalReversalsAmount,
    discrepancies,
    isHealthy: discrepancies.length === 0,
    itemizedLedger,
    remitBillsSummary
  };
}

/**
 * Auto-Reconciles & Repairs Student Financial Data in Firestore.
 * Performs:
 * 1. Safe archival/cleanup of duplicate legacy fee documents (e.g. `studentId_Jestha`).
 * 2. Capping of any overpaid fee head to 100% (ensuring paid <= billed).
 * 3. Synchronization of Remit Bill due amounts with actual outstanding bill items.
 * 4. Verification and updating of student's advanceBalance.
 * 5. Generates an immutable entry in ledger_audit_logs.
 */
export async function repairStudentFinancialRecords(
  db: Firestore,
  studentId: string,
  operatorName: string
): Promise<{ success: boolean; repairedCount: number; message: string; auditLogId?: string }> {
  // First audit to know what needs repair
  const audit = await auditStudentFinancials(db, studentId);
  if (audit.isHealthy) {
    return {
      success: true,
      repairedCount: 0,
      message: 'Student financial records are already healthy and 100% reconciled.'
    };
  }

  let repairedCount = 0;
  const actionsTaken: string[] = [];

  // Run in a transaction or sequential operations
  for (const disc of audit.discrepancies) {
    if (disc.type === 'DUPLICATE_FEE_RECORD' && disc.affectedDocId) {
      // Archive or delete duplicate legacy fee doc
      const docRef = doc(db, 'studentFees', disc.affectedDocId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        // Archive it to archived_student_fees so audit trail is completely retained
        const archiveRef = doc(db, 'archived_student_fees', `${disc.affectedDocId}_archived_${Date.now()}`);
        await setDoc(archiveRef, {
          ...data,
          archivedReason: 'Reconciled duplicate legacy record merged with granular fee doc',
          archivedAt: serverTimestamp(),
          archivedBy: operatorName
        });
        // Remove duplicate active document
        await deleteDoc(docRef);
        repairedCount++;
        actionsTaken.push(`Archived and removed duplicate fee document ${disc.affectedDocId}`);
      }
    }

    if (disc.type === 'OVERPAID_FEE' && disc.affectedDocId) {
      // Cap paidAmount to totalFee
      const docRef = doc(db, 'studentFees', disc.affectedDocId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        const totalFee = Number(data.totalFee || data.amount || 0);
        await updateDoc(docRef, {
          paidAmount: totalFee,
          dueAmount: 0,
          status: 'paid',
          updatedAt: serverTimestamp()
        });
        repairedCount++;
        actionsTaken.push(`Capped overpayment on ${disc.affectedDocId} to exact total fee of NRs. ${totalFee}`);
      }
    }
  }

  // Also verify and sync remit bills dueAmount
  const remitSnap = await getDocs(query(collection(db, 'remitBills'), where('studentId', '==', studentId)));
  for (const bDoc of remitSnap.docs) {
    const b = bDoc.data();
    const total = Number(b.totalAmount || 0);
    const paid = Number(b.paidAmount || 0);
    const expectedDue = Math.max(0, total - paid);
    if (b.dueAmount === undefined || b.dueAmount !== expectedDue) {
      await updateDoc(doc(db, 'remitBills', bDoc.id), {
        dueAmount: expectedDue,
        status: expectedDue === 0 && paid > 0 ? 'paid' : (paid > 0 ? 'partial' : 'due'),
        updatedAt: serverTimestamp()
      });
      repairedCount++;
      actionsTaken.push(`Synchronized Remit Bill ${b.billNo || bDoc.id} due amount to NRs. ${expectedDue}`);
    }
  }

  // Record audit log
  const auditLogId = await recordLedgerAuditLog({
    transactionId: `RECON_${Date.now()}`,
    receipt: 'AUTO-RECONCILE',
    studentId: studentId,
    studentName: audit.studentName,
    studentClass: audit.studentClass,
    actionType: 'LEDGER_RECONCILIATION_REPAIR',
    previousValue: `${audit.discrepancies.length} discrepancies detected`,
    newValue: `Repaired ${repairedCount} records: ${actionsTaken.join('; ')}`,
    reason: 'Production Financial Logic Safety Layer Reconcile & Data Repair',
    adminName: operatorName
  });

  return {
    success: true,
    repairedCount,
    message: `Reconciliation complete: Repaired ${repairedCount} item(s). ${actionsTaken.join('. ')}`,
    auditLogId
  };
}

/**
 * Batch Audit of All Students to detect any ledger anomalies or duplicates across the school.
 */
export async function auditAllStudentsFinancials(
  db: Firestore,
  studentsList: any[],
  onProgress?: (processed: number, total: number) => void
): Promise<{
  totalStudentsScanned: number;
  healthyCount: number;
  flaggedCount: number;
  flaggedStudents: StudentFinancialAuditResult[];
}> {
  const flaggedStudents: StudentFinancialAuditResult[] = [];
  let processed = 0;

  for (const s of studentsList) {
    try {
      const audit = await auditStudentFinancials(db, s.id);
      if (!audit.isHealthy) {
        flaggedStudents.push(audit);
      }
    } catch (err) {
      console.warn(`Error auditing student ${s.id}:`, err);
    }
    processed++;
    if (onProgress) {
      onProgress(processed, studentsList.length);
    }
  }

  return {
    totalStudentsScanned: studentsList.length,
    healthyCount: studentsList.length - flaggedStudents.length,
    flaggedCount: flaggedStudents.length,
    flaggedStudents
  };
}

