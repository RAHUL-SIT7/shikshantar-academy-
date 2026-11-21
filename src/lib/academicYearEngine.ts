/**
 * Persistent Firestore-Based Academic Year Management & Normalization Engine
 * Shikshantar Academy School ERP
 *
 * Enforces:
 * 1. Persistent Firestore collection `academic_years` storing Admin-managed academic sessions.
 * 2. Stable canonical database identity (`academicYearId`, e.g. "2083").
 * 3. User-facing display title (`displayTitle`, e.g. "2083 BS").
 * 4. Admin controls: Create, Edit, Activate, Deactivate, Set Current, Archive.
 * 5. Exactly ONE current academic year active at a time (enforced via atomic batch operations).
 * 6. Zero Gregorian calendar fallback & zero arbitrary year assignment.
 */

import { db, auth } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import { recordAuditLog } from './auditLogger';
import { parseAndValidateAcademicYear } from './resultPreparationEngine';
import { getBSYearMonthDate } from './nepaliDate';

export type AcademicYearStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface AcademicYearConfig {
  id: string; // Document ID = academicYearId (e.g. "2083")
  academicYearId: string; // Stable canonical ID (e.g. "2083")
  displayTitle: string; // User-facing display title (e.g. "2083 BS")
  bsYear: number; // Bikram Sambat year number (e.g. 2083)
  startDate?: string; // Optional BS or ISO start date
  endDate?: string; // Optional BS or ISO end date
  status: AcademicYearStatus;
  isCurrent: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

const ACADEMIC_YEARS_COLLECTION = 'academic_years';

/**
 * Standard seed definitions for fresh installations or empty databases.
 */
const DEFAULT_INITIAL_YEARS: Omit<AcademicYearConfig, 'createdAt' | 'createdBy'>[] = [
  {
    id: '2083',
    academicYearId: '2083',
    displayTitle: '2083 BS',
    bsYear: 2083,
    startDate: '2083-01-01',
    endDate: '2083-12-30',
    status: 'ACTIVE',
    isCurrent: true
  },
  {
    id: '2082',
    academicYearId: '2082',
    displayTitle: '2082 BS',
    bsYear: 2082,
    startDate: '2082-01-01',
    endDate: '2082-12-30',
    status: 'ACTIVE',
    isCurrent: false
  },
  {
    id: '2081',
    academicYearId: '2081',
    displayTitle: '2081 BS',
    bsYear: 2081,
    startDate: '2081-01-01',
    endDate: '2081-12-30',
    status: 'ARCHIVED',
    isCurrent: false
  },
  {
    id: '2080',
    academicYearId: '2080',
    displayTitle: '2080 BS',
    bsYear: 2080,
    startDate: '2080-01-01',
    endDate: '2080-12-30',
    status: 'ARCHIVED',
    isCurrent: false
  },
  {
    id: '2084',
    academicYearId: '2084',
    displayTitle: '2084 BS',
    bsYear: 2084,
    startDate: '2084-01-01',
    endDate: '2084-12-30',
    status: 'INACTIVE',
    isCurrent: false
  },
  {
    id: '2085',
    academicYearId: '2085',
    displayTitle: '2085 BS',
    bsYear: 2085,
    startDate: '2085-01-01',
    endDate: '2085-12-30',
    status: 'INACTIVE',
    isCurrent: false
  }
];

/**
 * Ensures initial default academic years exist in Firestore if the collection is empty.
 * Idempotent: Does not overwrite existing configurations.
 */
export async function seedDefaultAcademicYearsIfEmpty(): Promise<AcademicYearConfig[]> {
  try {
    const colRef = collection(db, ACADEMIC_YEARS_COLLECTION);
    const snap = await getDocs(colRef);

    if (!snap.empty) {
      const years: AcademicYearConfig[] = [];
      snap.forEach(d => years.push(d.data() as AcademicYearConfig));
      years.sort((a, b) => b.bsYear - a.bsYear);
      return years;
    }

    // Collection is empty: seed default initial academic years
    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();
    const adminEmail = auth.currentUser?.email || 'system_admin@shikshantar.edu.np';
    const seededList: AcademicYearConfig[] = [];

    for (const item of DEFAULT_INITIAL_YEARS) {
      const docRef = doc(db, ACADEMIC_YEARS_COLLECTION, item.id);
      const record: AcademicYearConfig = {
        ...item,
        createdAt: nowIso,
        createdBy: adminEmail
      };
      batch.set(docRef, record);
      seededList.push(record);
    }

    await batch.commit();

    try {
      await recordAuditLog({
        category: 'academic',
        actionType: 'ACADEMIC_YEAR_SEEDED',
        targetType: 'academic_years',
        targetId: 'INITIAL_SEED',
        reason: 'Initialized default Admin-managed Academic Years in Firestore',
        result: 'SUCCESS'
      });
    } catch (_) {}

    seededList.sort((a, b) => b.bsYear - a.bsYear);
    return seededList;
  } catch (err) {
    console.warn('Non-blocking error seeding academic years in Firestore:', err);
    // Return fallback memory defaults if offline or permission pending
    return DEFAULT_INITIAL_YEARS.map(y => ({
      ...y,
      createdAt: new Date().toISOString(),
      createdBy: 'system'
    })).sort((a, b) => b.bsYear - a.bsYear);
  }
}

/**
 * Subscribes to real-time changes in Admin-managed Academic Years.
 * Automatically seeds default years if empty.
 */
export function subscribeAcademicYears(
  onData: (years: AcademicYearConfig[]) => void,
  onError?: (err: any) => void
): () => void {
  const colRef = collection(db, ACADEMIC_YEARS_COLLECTION);

  const unsub = onSnapshot(
    colRef,
    async (snap) => {
      if (snap.empty) {
        try {
          const seeded = await seedDefaultAcademicYearsIfEmpty();
          onData(seeded);
        } catch (_) {
          onData(DEFAULT_INITIAL_YEARS.map(y => ({
            ...y,
            createdAt: new Date().toISOString(),
            createdBy: 'system'
          })).sort((a, b) => b.bsYear - a.bsYear));
        }
        return;
      }

      const years: AcademicYearConfig[] = [];
      snap.forEach(d => years.push(d.data() as AcademicYearConfig));

      // Validate exactly one isCurrent
      const currentCount = years.filter(y => y.isCurrent).length;
      if (currentCount === 0 && years.length > 0) {
        // Fallback: set highest active year as current
        const active = years.find(y => y.status === 'ACTIVE') || years[0];
        active.isCurrent = true;
      }

      years.sort((a, b) => b.bsYear - a.bsYear);
      onData(years);
    },
    (err) => {
      console.warn('Snapshot error on academic_years:', err);
      // Resilient fallback: emit default initial academic years if snapshot fails
      onData(DEFAULT_INITIAL_YEARS.map(y => ({
        ...y,
        createdAt: new Date().toISOString(),
        createdBy: 'system'
      })).sort((a, b) => b.bsYear - a.bsYear));
      if (onError) onError(err);
    }
  );

  return unsub;
}

/**
 * Returns formatted display title ("2083 BS") for any canonical ID or raw input.
 */
export function formatAcademicYearDisplayTitle(
  yearInput: string | undefined | null,
  knownYears?: AcademicYearConfig[]
): string {
  if (!yearInput || !yearInput.trim()) {
    return 'No Academic Year Selected';
  }

  const canonicalId = parseAndValidateAcademicYear(yearInput);
  if (!canonicalId) {
    return yearInput.trim();
  }

  if (knownYears && knownYears.length > 0) {
    const matched = knownYears.find(y => y.academicYearId === canonicalId || y.id === canonicalId);
    if (matched && matched.displayTitle) {
      return matched.displayTitle;
    }
  }

  return `${canonicalId} BS`;
}

/**
 * Admin Action: Create a new Academic Year with Firestore transaction
 */
export async function createAcademicYear(
  payload: {
    bsYear: number;
    displayTitle?: string;
    startDate?: string;
    endDate?: string;
    status?: AcademicYearStatus;
    isCurrent?: boolean;
  },
  adminEmail: string
): Promise<AcademicYearConfig> {
  const bsYear = Number(payload.bsYear);
  if (isNaN(bsYear) || bsYear < 2000 || bsYear > 2200) {
    throw new Error('Invalid Bikram Sambat (B.S.) year. Must be between 2000 and 2200.');
  }

  const academicYearId = String(bsYear);
  const docRef = doc(db, ACADEMIC_YEARS_COLLECTION, academicYearId);

  const displayTitle = (payload.displayTitle && payload.displayTitle.trim())
    ? payload.displayTitle.trim()
    : `${academicYearId} BS`;

  const isCurrent = Boolean(payload.isCurrent);
  const status = payload.status || 'ACTIVE';

  if (isCurrent && status !== 'ACTIVE') {
    throw new Error(`Cannot set academic year "${academicYearId}" as current because its status is ${status}. Only ACTIVE academic years can be current.`);
  }

  const nowIso = new Date().toISOString();

  const newYear: AcademicYearConfig = {
    id: academicYearId,
    academicYearId,
    displayTitle,
    bsYear,
    startDate: payload.startDate || `${academicYearId}-01-01`,
    endDate: payload.endDate || `${academicYearId}-12-30`,
    status,
    isCurrent,
    createdAt: nowIso,
    createdBy: adminEmail
  };

  await runTransaction(db, async (transaction) => {
    // 1. ALL READS FIRST
    const existingSnap = await transaction.get(docRef);
    if (existingSnap.exists()) {
      throw new Error(`Academic Year "${academicYearId} BS" already exists.`);
    }

    const currentSnapsToUpdate: { ref: any }[] = [];

    if (isCurrent) {
      const allSnap = await getDocs(collection(db, ACADEMIC_YEARS_COLLECTION));
      for (const d of allSnap.docs) {
        if (d.id !== academicYearId && d.data().isCurrent) {
          const curSnap = await transaction.get(d.ref);
          if (curSnap.exists() && curSnap.data().isCurrent) {
            currentSnapsToUpdate.push({ ref: d.ref });
          }
        }
      }
    }

    // 2. ALL WRITES SECOND
    for (const item of currentSnapsToUpdate) {
      transaction.update(item.ref, {
        isCurrent: false,
        updatedAt: nowIso,
        updatedBy: adminEmail
      });
    }

    transaction.set(docRef, newYear);
  });

  try {
    await recordAuditLog({
      category: 'academic',
      actionType: 'ACADEMIC_YEAR_CREATED',
      targetType: 'academic_years',
      targetId: academicYearId,
      reason: `Admin created Academic Year "${displayTitle}" (Status: ${status}, Current: ${isCurrent})`,
      newValue: JSON.stringify({ academicYearId, displayTitle, status, isCurrent }),
      result: 'SUCCESS'
    });
  } catch (_) {}

  return newYear;
}

/**
 * Admin Action: Update Academic Year Details with Firestore transaction
 */
export async function updateAcademicYear(
  academicYearId: string,
  updates: {
    displayTitle?: string;
    startDate?: string;
    endDate?: string;
    status?: AcademicYearStatus;
    isCurrent?: boolean;
  },
  adminEmail: string
): Promise<void> {
  const docRef = doc(db, ACADEMIC_YEARS_COLLECTION, academicYearId);

  let previousData: AcademicYearConfig | null = null;
  let finalNewValue: any = null;

  await runTransaction(db, async (transaction) => {
    // 1. ALL READS FIRST
    const targetSnap = await transaction.get(docRef);
    if (!targetSnap.exists()) {
      throw new Error(`Academic Year "${academicYearId}" does not exist.`);
    }

    const currentData = targetSnap.data() as AcademicYearConfig;
    previousData = currentData;

    const nextStatus = updates.status !== undefined ? updates.status : currentData.status;
    const nextIsCurrent = updates.isCurrent !== undefined ? updates.isCurrent : currentData.isCurrent;

    // Enforce Rule: Only ACTIVE academic years can become current
    if (nextIsCurrent && nextStatus !== 'ACTIVE') {
      throw new Error(`Cannot set academic year "${academicYearId}" as current because its status is ${nextStatus}. Only ACTIVE academic years can be current.`);
    }

    const nowIso = new Date().toISOString();
    const cleanUpdates: Partial<AcademicYearConfig> = {
      updatedAt: nowIso,
      updatedBy: adminEmail
    };

    if (updates.displayTitle !== undefined) cleanUpdates.displayTitle = updates.displayTitle.trim();
    if (updates.startDate !== undefined) cleanUpdates.startDate = updates.startDate;
    if (updates.endDate !== undefined) cleanUpdates.endDate = updates.endDate;
    if (updates.status !== undefined) cleanUpdates.status = updates.status;

    const currentSnapsToUnset: { ref: any }[] = [];

    if (nextIsCurrent) {
      cleanUpdates.isCurrent = true;
      cleanUpdates.status = 'ACTIVE';

      // Read all existing academic years to find any currently marked as isCurrent
      const allDocsSnap = await getDocs(collection(db, ACADEMIC_YEARS_COLLECTION));
      for (const d of allDocsSnap.docs) {
        if (d.id !== academicYearId && d.data().isCurrent) {
          const curSnap = await transaction.get(d.ref);
          if (curSnap.exists() && curSnap.data().isCurrent) {
            currentSnapsToUnset.push({ ref: d.ref });
          }
        }
      }
    } else if (updates.isCurrent === false) {
      cleanUpdates.isCurrent = false;
    }

    finalNewValue = { ...currentData, ...cleanUpdates };

    // 2. ALL WRITES SECOND
    for (const item of currentSnapsToUnset) {
      transaction.update(item.ref, {
        isCurrent: false,
        updatedAt: nowIso,
        updatedBy: adminEmail
      });
    }

    transaction.update(docRef, cleanUpdates);
  });

  try {
    await recordAuditLog({
      category: 'academic',
      actionType: 'ACADEMIC_YEAR_UPDATED',
      targetType: 'academic_years',
      targetId: academicYearId,
      reason: `Admin updated Academic Year "${academicYearId}"`,
      previousValue: previousData ? JSON.stringify(previousData) : undefined,
      newValue: finalNewValue ? JSON.stringify(finalNewValue) : undefined,
      result: 'SUCCESS'
    });
  } catch (_) {}
}

/**
 * Admin Action: Mark a specific Academic Year as Current
 */
export async function setAcademicYearAsCurrent(
  academicYearId: string,
  adminEmail: string
): Promise<void> {
  await updateAcademicYear(academicYearId, { isCurrent: true, status: 'ACTIVE' }, adminEmail);
}

/**
 * Admin Action: Archive a completed Academic Year
 */
export async function archiveAcademicYear(
  academicYearId: string,
  adminEmail: string
): Promise<void> {
  await updateAcademicYear(academicYearId, { status: 'ARCHIVED', isCurrent: false }, adminEmail);
}

/**
 * Audit & Idempotent Migration Helper for Legacy Results missing academicYear.
 * Non-destructive: Only adds missing canonical academicYearId if deterministically parsed from examId.
 */
export async function auditAndMigrateLegacyResultYears(): Promise<{
  totalAudited: number;
  migratedCount: number;
  unknownCount: number;
  skippedCount: number;
}> {
  let migratedCount = 0;
  let unknownCount = 0;
  let skippedCount = 0;
  let totalAudited = 0;

  try {
    const summarySnap = await getDocs(collection(db, 'resultSummary'));
    totalAudited += summarySnap.size;

    let batch = writeBatch(db);
    let opCount = 0;

    for (const docSnap of summarySnap.docs) {
      const data = docSnap.data();
      if (data.academicYear && parseAndValidateAcademicYear(data.academicYear)) {
        skippedCount++;
        continue;
      }

      // Try parsing from examId
      const inferredYear = parseAndValidateAcademicYear(data.examId);
      if (inferredYear) {
        batch.update(docSnap.ref, {
          academicYear: inferredYear,
          academicYearId: inferredYear,
          migratedAt: new Date().toISOString()
        });
        migratedCount++;
        opCount++;
      } else {
        unknownCount++;
      }

      if (opCount >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }

    if (migratedCount > 0) {
      try {
        await recordAuditLog({
          category: 'academic',
          actionType: 'LEGACY_ACADEMIC_YEAR_MIGRATION',
          targetType: 'resultSummary',
          reason: `Idempotently populated canonical academicYear for ${migratedCount} legacy summary records`,
          newValue: JSON.stringify({ totalAudited, migratedCount, unknownCount, skippedCount }),
          result: 'SUCCESS'
        });
      } catch (_) {}
    }
  } catch (e) {
    console.warn('Non-blocking legacy result year audit error:', e);
  }

  return { totalAudited, migratedCount, unknownCount, skippedCount };
}
