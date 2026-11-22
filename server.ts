import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import nodemailer from 'nodemailer';
import admin from 'firebase-admin';
import { getApps, getApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import {
  BOOTSTRAP_OWNER_EMAIL,
  isUserProfileInactive,
  createSignedChallenge,
  verifyChallengeResponse,
  issueSignedVerificationToken,
  consumeVerificationToken,
  verifyTurnstileToken,
  getEffectiveNowMs,
  getSmtpTransportConfig,
  isSmtpAuthError,
  resolveResultNotificationRecipientEmail,
  getFirebaseAdminCredential,
  isFirestoreCredentialUnavailableError,
  hasValidFirebaseIdTokenFormat
} from './api/_lib/auth.js';
import {
  hybridGetDoc,
  hybridSetDoc,
  hybridQueryEq,
  hashOtpKeyed,
  issueSessionSeal,
  verifySessionSeal,
  issueSignedTrustToken,
  verifySignedTrustToken,
  issueSignedOtpChallengeToken,
  verifySignedOtpChallengeToken,
  resolveTrustedDeviceDocId,
  isAdminCredentialError,
  shouldSkipAdminFirestore,
  markAdminCredentialsUnavailable
} from './api/_lib/firestoreRest.js';

function parseCookieHeader(req: Request): Record<string, string> {
  const rawCookieHeader = String(req.headers.cookie || '');
  const parsed: Record<string, string> = {};
  if (!rawCookieHeader) return parsed;
  rawCookieHeader.split(';').forEach((part) => {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      const k = part.slice(0, eqIdx).trim();
      const v = part.slice(eqIdx + 1).trim();
      if (k) {
        try {
          parsed[k] = decodeURIComponent(v);
        } catch {
          parsed[k] = v;
        }
      }
    }
  });
  return parsed;
}

const statelessOtpAttempts = new Map<string, { attempts: number; locked: boolean; expiresAtMs: number }>();

async function syncUserSessionState(
  db: FirebaseFirestore.Firestore,
  idToken: string,
  uid: string,
  opts: {
    addSessionId?: string;
    removeSessionId?: string;
    replaceActiveSessions?: string[];
    enforceDeviceVerification?: boolean;
  }
): Promise<void> {
  if (shouldSkipAdminFirestore()) {
    if (opts.enforceDeviceVerification) {
      try {
        await hybridSetDoc(db, idToken, 'users', uid, { deviceVerificationEnforced: true }, { merge: true });
      } catch (restErr: any) {
        console.warn('[SECURITY] Could not persist deviceVerificationEnforced via REST:', restErr?.message || restErr);
      }
    }
    return;
  }

  const adminPayload: Record<string, any> = {};
  if (opts.replaceActiveSessions) {
    adminPayload.activeSessions = opts.replaceActiveSessions;
  } else if (opts.addSessionId) {
    adminPayload.activeSessions = FieldValue.arrayUnion(opts.addSessionId);
  } else if (opts.removeSessionId) {
    adminPayload.activeSessions = FieldValue.arrayRemove(opts.removeSessionId);
  }
  if (opts.enforceDeviceVerification) {
    adminPayload.deviceVerificationEnforced = true;
  }
  if (Object.keys(adminPayload).length === 0) return;

  try {
    await db.collection('users').doc(uid).set(adminPayload, { merge: true });
  } catch (err: any) {
    if (!isAdminCredentialError(err)) throw err;
    markAdminCredentialsUnavailable();
    // In Firestore REST mode, only persist deviceVerificationEnforced (activeSessions is tracked in user_sessions)
    if (opts.enforceDeviceVerification) {
      try {
        await hybridSetDoc(db, idToken, 'users', uid, { deviceVerificationEnforced: true }, { merge: true });
      } catch (restErr: any) {
        console.warn('[SECURITY] Could not persist deviceVerificationEnforced via REST:', restErr?.message || restErr);
      }
    }
  }
}

function loadServerFirebaseConfig(): { projectId: string; firestoreDatabaseId: string } {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {
    // Fallback to environment variables
  }
  return {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'project-4b410c97-a152-49e7-940',
    firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || 'ai-studio-2507c181-4e37-4730-b71a-25b639c27e22'
  };
}

const firebaseConfig = loadServerFirebaseConfig();

export function getAdminApp() {
  if (getApps().length > 0) return getApp();
  const credential = getFirebaseAdminCredential();
  return initializeApp(
    credential
      ? { credential, projectId: firebaseConfig.projectId }
      : { projectId: firebaseConfig.projectId }
  );
}

export function getAdminDb() {
  const app = getAdminApp();
  const isEmulator = process.env.USE_FIREBASE_EMULATOR === 'true' || Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const databaseId = isEmulator ? '(default)' : (firebaseConfig.firestoreDatabaseId || '(default)');
  return databaseId && databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);
}

import crypto from 'crypto';
import {
  normalizeTerminalExamType,
  buildCanonicalExamId,
  getCanonicalSection,
  validateSubjectConfigItem,
  parseAndValidateAcademicYear,
  CANONICAL_TERMINAL_EXAMS,
  getTerminalAvailability,
  computeSubjectWorkflowStatus,
  filterEligibleStudentsFromRaw
} from './src/lib/resultPreparationEngine.js';
import {
  calculateSubjectResult,
  calculateAggregateResult,
  validateMarkValue
} from './src/lib/nepalGradingEngine.js';
import { normalizeClass, getClassConfiguredSubjects, resolveSubjectTeachersForClass, generateAssignmentKey } from './src/lib/teacherAssignmentEngine.js';

try {
  if (process.env.USE_FIREBASE_EMULATOR === 'true') {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
    }
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9098';
    }
  } else {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  }
  delete process.env.GOOGLE_CLOUD_QUOTA_PROJECT;
  if (!admin.apps.length) {
    const credential = getFirebaseAdminCredential();
    admin.initializeApp(
      credential
        ? { credential, projectId: firebaseConfig.projectId }
        : { projectId: firebaseConfig.projectId }
    );
  }
  console.log('Firebase Admin initialized successfully.');
} catch (error) {
  console.error('Failed to initialize Firebase Admin:', error);
}

/**
 * Canonical Academic Year Identifier Resolver (Gap 1 Hardened)
 * - Identifies canonical academicYearId in Exams, Secure Results, and Enrollment records.
 * - Enforces exact canonical matching: studentYear === examYear.
 * - Legacy compatibility uses explicit, tested normalization (extracts valid 4-digit BS year, e.g. 2083 from "2083 BS" or "2083–2084 B.S.").
 * - Missing, ambiguous, or invalid identifiers fail closed (returns null).
 */
export function resolveCanonicalAcademicYearId(data: any): string | null {
  if (!data || typeof data !== 'object') return null;

  // 1. Direct canonical academicYearId field
  const rawId = data.academicYearId ?? data.targetAcademicYearId;
  if (typeof rawId === 'string' && rawId.trim()) {
    const clean = rawId.trim();
    const match = clean.match(/^(\d{4})/);
    return match ? match[1] : clean;
  }

  // 2. Numeric bsYear from student_enrollments
  if (typeof data.bsYear === 'number' && data.bsYear >= 2000 && data.bsYear <= 2200) {
    return String(data.bsYear);
  }

  // 3. Explicit legacy normalization rule for academicYear or session
  const legacyVal = data.academicYear ?? data.classAssignedYear ?? data.session;
  if (typeof legacyVal === 'string' && legacyVal.trim()) {
    const clean = legacyVal.trim();
    const match = clean.match(/^(20\d{2})/);
    if (match) return match[1];
  }

  // Fail closed if ambiguous or unresolvable
  return null;
}

export interface ServerCaller {
  uid: string;
  email: string;
  emailVerified: boolean;
  role: 'admin' | 'teacher' | 'student' | 'guest';
  adminTier: 'primary' | 'secondary' | '';
  userData: Record<string, any>;
  rawToken: string;
}

function isStrictClassTeacherAuthorized(
  userData: Record<string, any>,
  targetClass: string,
  targetSection: string,
  targetAcademicYear: string
): boolean {
  const pctClass = userData.primaryClassTeacher ? normalizeClass(String(userData.primaryClassTeacher)).trim().toLowerCase() : '';
  const pctSec = String(userData.primaryClassTeacherSection || '').trim();
  const pctYearRaw = String(userData.primaryClassTeacherYear || '').trim();
  if (!pctClass || !pctSec || !pctYearRaw) {
    return false;
  }

  const normTargetClass = normalizeClass(String(targetClass || '')).trim().toLowerCase();
  if (!normTargetClass || pctClass !== normTargetClass) {
    return false;
  }

  const parsedTeacherYear = parseAndValidateAcademicYear(pctYearRaw) || pctYearRaw;
  const parsedTargetYear = parseAndValidateAcademicYear(targetAcademicYear) || String(targetAcademicYear || '').trim();
  if (!parsedTargetYear || parsedTeacherYear !== parsedTargetYear) {
    return false;
  }

  const pctSecLower = pctSec.toLowerCase();
  const targetSecLower = String(targetSection || 'A').trim().toLowerCase();
  return pctSecLower === 'all' || pctSecLower === targetSecLower;
}

function isStrictSubjectTeacherAuthorized(
  userData: Record<string, any>,
  targetClass: string,
  targetSection: string,
  targetAcademicYear: string,
  subjectKeyOrName?: string
): boolean {
  const normTargetClass = normalizeClass(String(targetClass || '')).trim();
  const compactTargetClass = normTargetClass.replace(/\s+/g, '');
  const cleanSection = String(targetSection || 'A').trim() || 'A';
  const parsedYear = parseAndValidateAcademicYear(targetAcademicYear) || String(targetAcademicYear || '').trim();
  if (!normTargetClass || !parsedYear) return false;

  const assignments = Array.isArray(userData.teachingAssignments) ? userData.teachingAssignments : [];
  const assignmentMatch = assignments.some((a: any) => {
    const aCls = normalizeClass(String(a?.class || a?.className || '')).trim().toLowerCase();
    const aSec = String(a?.section || '').trim().toLowerCase();
    const aYear = parseAndValidateAcademicYear(String(a?.academicYear || '')) || String(a?.academicYear || '').trim();
    if (!aCls || !aSec || !aYear) return false;
    if (aCls !== normTargetClass.toLowerCase()) return false;
    if (aYear !== parsedYear) return false;
    if (aSec !== 'all' && aSec !== cleanSection.toLowerCase()) return false;
    if (subjectKeyOrName) {
      const targetSubj = String(subjectKeyOrName).trim().toLowerCase();
      const targetSubjCompact = targetSubj.replace(/[^a-z0-9_.-]/g, '');
      const aSubj = String(a?.subject || a?.subjectKey || '').trim().toLowerCase();
      const aSubjCompact = aSubj.replace(/[^a-z0-9_.-]/g, '');
      return aSubj === targetSubj || aSubjCompact === targetSubjCompact;
    }
    return true;
  });

  if (assignmentMatch) return true;

  const assignmentKeys: string[] = Array.isArray(userData.assignmentKeys) ? userData.assignmentKeys : [];
  if (assignmentKeys.length === 0) return false;

  if (subjectKeyOrName) {
    const cleanKey = String(subjectKeyOrName).replace(/[^a-zA-Z0-9_.-]/g, '');
    const candidateKeys = [
      `${normTargetClass}_${cleanKey}_${cleanSection}_${parsedYear}`.toLowerCase(),
      `${normTargetClass}_${cleanKey}_All_${parsedYear}`.toLowerCase(),
      `${compactTargetClass}_${cleanKey}_${cleanSection}_${parsedYear}`.toLowerCase(),
      `${compactTargetClass}_${cleanKey}_All_${parsedYear}`.toLowerCase(),
      generateAssignmentKey(normTargetClass, cleanKey, cleanSection, parsedYear).toLowerCase(),
      generateAssignmentKey(normTargetClass, cleanKey, 'All', parsedYear).toLowerCase()
    ];
    return assignmentKeys.some(k => candidateKeys.includes(String(k).toLowerCase()));
  }

  return assignmentKeys.some(k => {
    const parts = String(k).split('_');
    if (parts.length < 4) return false;
    const kYear = parts[parts.length - 1];
    const kSec = parts[parts.length - 2].toLowerCase();
    const kCls = parts[0].toLowerCase();
    return (kCls === normTargetClass.toLowerCase() || kCls === compactTargetClass.toLowerCase()) &&
      (kSec === 'all' || kSec === cleanSection.toLowerCase()) &&
      kYear === parsedYear;
  });
}

function isLegacyOrStrictClassTeacherAuthorized(
  userData: Record<string, any>,
  targetClass: string,
  targetSection: string,
  targetAcademicYear: string
): boolean {
  if (isStrictClassTeacherAuthorized(userData, targetClass, targetSection, targetAcademicYear)) {
    return true;
  }
  const normTargetClass = normalizeClass(String(targetClass || '')).trim().toLowerCase();
  const parsedTargetYear = parseAndValidateAcademicYear(targetAcademicYear) || String(targetAcademicYear || '').trim();
  const targetSecLower = String(targetSection || 'A').trim().toLowerCase();
  if (!normTargetClass) return false;

  if (userData.isClassTeacher === true) {
    const legClass = normalizeClass(String(userData.classTeacherClass || userData.class || '')).trim().toLowerCase();
    if (!legClass || legClass !== normTargetClass) return false;
    const legYearRaw = String(userData.classTeacherYear || userData.primaryClassTeacherYear || '').trim();
    if (legYearRaw) {
      const parsedLegYear = parseAndValidateAcademicYear(legYearRaw) || legYearRaw;
      if (parsedTargetYear && parsedLegYear !== parsedTargetYear) return false;
    }
    const legSec = String(userData.classTeacherSection || userData.section || '').trim().toLowerCase();
    if (legSec && legSec !== 'all' && legSec !== targetSecLower) return false;
    return true;
  }
  return false;
}

function resolveTeacherMatchedAssignmentsForExam(
  userData: Record<string, any>,
  normClass: string,
  normSec: string,
  normYear: string
): { matched: boolean; isClassTeacher: boolean; subjects: string[] } {
  const isClassTeacher = isLegacyOrStrictClassTeacherAuthorized(userData, normClass, normSec, normYear);
  const normTargetClassLower = normalizeClass(normClass).trim().toLowerCase();
  const compactTargetClassLower = normTargetClassLower.replace(/\s+/g, '');
  const cleanSectionLower = String(normSec || 'A').trim().toLowerCase();
  const parsedTargetYear = parseAndValidateAcademicYear(normYear) || String(normYear || '').trim();

  const subjectSet = new Set<string>();

  const teachingAssignments = Array.isArray(userData.teachingAssignments) ? userData.teachingAssignments : [];
  for (const a of teachingAssignments) {
    const aCls = normalizeClass(String(a?.class || a?.className || '')).trim().toLowerCase();
    const aSec = String(a?.section || '').trim().toLowerCase();
    const aYear = parseAndValidateAcademicYear(String(a?.academicYear || '')) || String(a?.academicYear || '').trim();
    if (aCls === normTargetClassLower && aYear === parsedTargetYear && (aSec === 'all' || aSec === cleanSectionLower)) {
      const subjName = String(a?.subject || a?.subjectName || a?.subjectKey || '').trim();
      if (subjName) subjectSet.add(subjName);
    }
  }

  const subjectAssignments = Array.isArray(userData.subjectAssignments) ? userData.subjectAssignments : [];
  for (const a of subjectAssignments) {
    const aCls = normalizeClass(String(a?.class || a?.className || '')).trim().toLowerCase();
    const aSec = String(a?.section || 'All').trim().toLowerCase();
    const aYearRaw = String(a?.academicYear || '').trim();
    const aYear = aYearRaw ? (parseAndValidateAcademicYear(aYearRaw) || aYearRaw) : '';
    if (
      aCls === normTargetClassLower &&
      (!aYear || aYear === parsedTargetYear) &&
      (aSec === 'all' || aSec === cleanSectionLower)
    ) {
      const subjName = String(a?.subject || a?.subjectName || a?.subjectKey || '').trim();
      if (subjName) subjectSet.add(subjName);
    }
  }

  const assignmentKeys: string[] = Array.isArray(userData.assignmentKeys) ? userData.assignmentKeys : [];
  for (const k of assignmentKeys) {
    const parts = String(k).split('_');
    if (parts.length < 4) continue;
    const kYear = parts[parts.length - 1];
    const kSec = parts[parts.length - 2].toLowerCase();
    const kCls = parts[0].toLowerCase();
    const kSubj = parts.slice(1, parts.length - 2).join(' ').trim();
    if (
      (kCls === normTargetClassLower || kCls === compactTargetClassLower) &&
      (kSec === 'all' || kSec === cleanSectionLower) &&
      kYear === parsedTargetYear
    ) {
      if (kSubj) subjectSet.add(kSubj);
    }
  }

  // Fallback legacy check only if no modern teachingAssignments/assignmentKeys exist
  if (
    teachingAssignments.length === 0 &&
    assignmentKeys.length === 0 &&
    Array.isArray(userData.assignedClasses) &&
    userData.assignedClasses.some((c: any) => normalizeClass(String(c || '')).trim().toLowerCase() === normTargetClassLower)
  ) {
    const legacySubjects = Array.isArray(userData.assignedSubjects) ? userData.assignedSubjects : [];
    legacySubjects.forEach((s: any) => {
      const cleanS = String(s || '').trim();
      if (cleanS) subjectSet.add(cleanS);
    });
    if (subjectSet.size === 0 && !isClassTeacher) {
      subjectSet.add('Assigned Class Subject');
    }
  }

  const hasSubjectMatch =
    subjectSet.size > 0 ||
    isStrictSubjectTeacherAuthorized(userData, normClass, normSec, normYear);

  return {
    matched: isClassTeacher || hasSubjectMatch,
    isClassTeacher,
    subjects: Array.from(subjectSet)
  };
}

async function notifyTeachersOfExamInitialization(
  db: FirebaseFirestore.Firestore,
  params: {
    examId: string;
    examTitle: string;
    normClass: string;
    normSec: string;
    normYear: string;
    initiatorUid: string;
    initiatorName: string;
    initiatorRole: string;
  }
): Promise<{ notifiedCount: number; teacherUids: string[] }> {
  const {
    examId,
    examTitle,
    normClass,
    normSec,
    normYear,
    initiatorUid,
    initiatorName,
    initiatorRole
  } = params;

  const teachersSnap = await db
    .collection('users')
    .where('role', 'in', ['teacher', 'class_teacher'])
    .get();

  const notifiedUids: string[] = [];
  const nowIso = new Date().toISOString();
  const sectionLabel = normSec && normSec.toLowerCase() !== 'all' ? ` (Section ${normSec})` : '';
  const initiatorLabel = initiatorRole === 'admin' ? `Admin (${initiatorName})` : `Class Teacher (${initiatorName})`;

  // Teacher emails are disabled by default to avoid irritating email spam; in-portal bell + app/PWA notifications deliver immediately.
  const sendOptionalTeacherInitEmail = process.env.ENABLE_TEACHER_INIT_EMAIL === 'true';
  const smtpConfig = sendOptionalTeacherInitEmail
    ? getSmtpTransportConfig()
    : { configured: false, user: '', fromResults: '', fromSecurity: '', fromGeneral: '', transportOptions: null };
  const transporter = smtpConfig.configured && smtpConfig.transportOptions
    ? nodemailer.createTransport(smtpConfig.transportOptions as any)
    : null;

  for (const tDoc of teachersSnap.docs) {
    const tData = tDoc.data() || {};
    if (tDoc.id === initiatorUid) continue;
    if (tData.isDeleted === true || isUserProfileInactive(tData)) continue;

    const assignment = resolveTeacherMatchedAssignmentsForExam(tData, normClass, normSec, normYear);
    if (!assignment.matched) continue;

    const notificationId = crypto
      .createHash('sha256')
      .update(JSON.stringify(['EXAM_INITIALIZED', examId, tDoc.id]))
      .digest('hex');

    const notifRef = db.collection('notifications').doc(notificationId);
    const existingNotifSnap = await notifRef.get();
    if (existingNotifSnap.exists) {
      notifiedUids.push(tDoc.id);
      continue;
    }

    const roleDetailParts: string[] = [];
    if (assignment.subjects.length > 0) {
      roleDetailParts.push(`Subjects: ${assignment.subjects.join(', ')}`);
    } else if (assignment.isClassTeacher) {
      roleDetailParts.push('Role: Class Teacher');
    }

    const detailSuffix = roleDetailParts.length > 0 ? ` [${roleDetailParts.join(' | ')}]` : '';
    const title = `Marks Entry Opened — ${examTitle} (Class ${normClass}${normSec && normSec.toLowerCase() !== 'all' ? `-${normSec}` : ''})`;
    const message = `${initiatorLabel} initialized ${examTitle} for Class ${normClass}${sectionLabel} (${normYear}). Please prepare and enter marks for your assigned subjects.${detailSuffix}`;

    let emailStatus = 'DEFERRED_BY_POLICY';
    if (sendOptionalTeacherInitEmail && transporter) {
      const teacherEmail = String(tData.email || '').trim();
      if (teacherEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(teacherEmail)) {
        try {
          await transporter.sendMail({
            from: `"Shikshantar Academy Portal" <${smtpConfig.fromGeneral}>`,
            replyTo: smtpConfig.fromGeneral,
            to: teacherEmail,
            subject: title,
            text: message
          });
          emailStatus = 'SENT';
        } catch {
          emailStatus = 'FAILED';
        }
      }
    }

    await notifRef.set({
      notificationId,
      recipientUid: tDoc.id,
      recipientRole: 'teacher',
      type: 'MARKS_SUBMISSION_OPEN',
      eventType: 'EXAM_INITIALIZED',
      eventId: examId,
      examId,
      title,
      message,
      link: '/admin?tab=prep',
      classId: normClass,
      sectionId: normSec || 'A',
      academicYearId: normYear,
      academicYear: normYear,
      metadata: {
        examTitle,
        subjects: assignment.subjects,
        isClassTeacher: assignment.isClassTeacher,
        initiatedByUid: initiatorUid,
        initiatedByName: initiatorName,
        initiatedByRole: initiatorRole
      },
      read: false,
      readAt: null,
      emailStatus,
      createdAt: nowIso,
      updatedAt: nowIso
    });

    notifiedUids.push(tDoc.id);
  }

  return {
    notifiedCount: notifiedUids.length,
    teacherUids: notifiedUids
  };
}

interface AcademicYearPolicyResult {
  currentAcademicYear: string;
  currentAcademicYearTitle: string;
  currentBsYear: number;
  requestedYear: string;
  requestedBsYear: number;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  isCurrent: boolean;
  isFuture: boolean;
  isArchived: boolean;
  isInactive: boolean;
  canMutate: boolean;
  blockReason: string | null;
}

async function resolveAcademicYearPolicy(
  db: FirebaseFirestore.Firestore,
  requestedYearRaw: string
): Promise<AcademicYearPolicyResult> {
  const normRequested = parseAndValidateAcademicYear(requestedYearRaw) || String(requestedYearRaw || '').trim();
  let currentAcademicYear = '2083';
  let currentAcademicYearTitle = '2083 BS';
  let currentBsYear = 2083;
  let matchedDoc: Record<string, any> | null = null;

  try {
    const yearsSnap = await db.collection('academic_years').get();
    if (!yearsSnap.empty) {
      const docs: Array<Record<string, any>> = yearsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      const currentDoc =
        docs.find(d => d.isCurrent === true) ||
        docs.filter(d => String(d.status || '').toUpperCase() === 'ACTIVE').sort((a, b) => Number(b.bsYear || b.id) - Number(a.bsYear || a.id))[0];
      if (currentDoc) {
        const parsedCur = parseAndValidateAcademicYear(String(currentDoc.academicYearId || currentDoc.id || currentDoc.bsYear || '2083')) || '2083';
        currentAcademicYear = parsedCur;
        currentBsYear = Number(currentDoc.bsYear) || parseInt(parsedCur, 10) || 2083;
        currentAcademicYearTitle = String(currentDoc.displayTitle || `${parsedCur} BS`);
      }
      matchedDoc = docs.find(d => {
        const dYear = parseAndValidateAcademicYear(String(d.academicYearId || d.id || d.bsYear || ''));
        return dYear === normRequested;
      }) || null;
    }
  } catch (err) {
    console.warn('[ACADEMIC_YEAR] Could not read academic_years collection, defaulting current year to 2083 BS:', err);
  }

  const requestedBsYear = parseInt(normRequested, 10) || currentBsYear;
  const isCurrent = normRequested === currentAcademicYear;
  const isFuture = requestedBsYear > currentBsYear;
  const rawStatus = String(matchedDoc?.status || '').toUpperCase();
  const status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' =
    rawStatus === 'ARCHIVED'
      ? 'ARCHIVED'
      : rawStatus === 'INACTIVE' || isFuture
      ? 'INACTIVE'
      : rawStatus === 'ACTIVE'
      ? 'ACTIVE'
      : isCurrent
      ? 'ACTIVE'
      : 'ARCHIVED';

  const isArchived = status === 'ARCHIVED';
  const isInactive = status === 'INACTIVE';
  const canMutate = status === 'ACTIVE' && !isFuture;

  let blockReason: string | null = null;
  if (isFuture || isInactive) {
    blockReason = `Academic Year ${normRequested} BS is not active yet. The current academic year is ${currentAcademicYearTitle}. Please select ${currentAcademicYearTitle} to enter or manage results.`;
  } else if (isArchived) {
    blockReason = `Academic Year ${normRequested} BS is archived (read-only). Please select the current academic year (${currentAcademicYearTitle}) to modify results.`;
  }

  return {
    currentAcademicYear,
    currentAcademicYearTitle,
    currentBsYear,
    requestedYear: normRequested,
    requestedBsYear,
    status,
    isCurrent,
    isFuture,
    isArchived,
    isInactive,
    canMutate,
    blockReason
  };
}

export async function createApp(options?: { skipVite?: boolean; skipOutboxWorker?: boolean }) {
  const app = express();

  app.disable('x-powered-by');

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin) {
      const isAllowed =
        origin.startsWith('http://localhost:') ||
        origin.startsWith('https://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.endsWith('.run.app') ||
        origin.endsWith('.vercel.app') ||
        origin.includes('shikshantaracademy.edu.np');
      if (isAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Operation-ID');
      }
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

  function rateLimiter(limit: number, windowMs: number) {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const key = `${req.path}_${ip}`;
      const now = Date.now();
      const entry = rateLimitMap.get(key);

      if (!entry || now > entry.resetTime) {
        rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
        return next();
      }

      if (entry.count >= limit) {
        return res.status(429).json({
          error: 'Too many requests. Rate limit exceeded. Please try again later.',
          retryAfterMs: entry.resetTime - now,
        });
      }

      entry.count++;
      next();
    };
  }

  async function verifyUserAuth(
    req: Request,
    res: Response,
    options?: { allowPendingDeviceVerification?: boolean }
  ): Promise<ServerCaller | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: "Unauthorized: Missing or malformed Authorization header. Expected 'Bearer <token>'." });
      return null;
    }

    const token = authHeader.split('Bearer ')[1]?.trim();
    if (!token || !hasValidFirebaseIdTokenFormat(token)) {
      res.status(401).json({ error: 'Unauthorized: Invalid, expired, or malformed authentication token.' });
      return null;
    }

    let decoded: admin.auth.DecodedIdToken;
    if (shouldSkipAdminFirestore()) {
      try {
        decoded = await admin.auth().verifyIdToken(token, false);
      } catch {
        res.status(401).json({
          error: 'Unauthorized: Invalid, expired, or malformed authentication token.'
        });
        return null;
      }
    } else {
      try {
        decoded = await admin.auth().verifyIdToken(token, true);
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        const isHostProjectIamLookupError =
          isFirestoreCredentialUnavailableError(err) ||
          isAdminCredentialError(err) ||
          msg.includes('USER_PROJECT_DENIED') ||
          msg.includes('SERVICE_DISABLED') ||
          msg.includes('accessNotConfigured') ||
          msg.includes('serviceusage.services.use') ||
          msg.includes('identitytoolkit.googleapis.com');

        if (isHostProjectIamLookupError) {
          if (isFirestoreCredentialUnavailableError(err) || isAdminCredentialError(err)) {
            markAdminCredentialsUnavailable();
          }
          try {
            decoded = await admin.auth().verifyIdToken(token, false);
          } catch {
            res.status(401).json({
              error: 'Unauthorized: Invalid, expired, or malformed authentication token.'
            });
            return null;
          }
        } else {
          const isRevoked = err?.code === 'auth/id-token-revoked';
          res.status(401).json({
            error: isRevoked
              ? 'Unauthorized: Session token has been revoked. Please sign in again.'
              : 'Unauthorized: Invalid, expired, or malformed authentication token.'
          });
          return null;
        }
      }
    }

    const db = getAdminDb();
    const userDoc = await hybridGetDoc(db, token, 'users', decoded.uid);
    const emailLower = (decoded.email || '').trim().toLowerCase();
    const isVerifiedBootstrapOwner = emailLower === BOOTSTRAP_OWNER_EMAIL && decoded.email_verified === true;

    if (!userDoc.exists) {
      if (isVerifiedBootstrapOwner) {
        return {
          uid: decoded.uid,
          email: decoded.email || BOOTSTRAP_OWNER_EMAIL,
          emailVerified: true,
          role: 'admin',
          adminTier: 'primary',
          userData: {
            email: decoded.email || BOOTSTRAP_OWNER_EMAIL,
            role: 'admin',
            adminTier: 'primary',
            active: true,
            status: 'approved'
          },
          rawToken: token
        };
      }
      res.status(403).json({ error: 'Forbidden: Authoritative user profile does not exist.' });
      return null;
    }

    const userData = userDoc.data || {};
    if (isUserProfileInactive(userData)) {
      res.status(403).json({ error: 'Forbidden: User account is inactive, pending, or deleted.' });
      return null;
    }

    const rawRole = String(userData.role || '').trim().toLowerCase();
    let role: ServerCaller['role'] | '' = '';
    if (rawRole === 'admin') role = 'admin';
    else if (rawRole === 'teacher' || rawRole === 'class_teacher') role = 'teacher';
    else if (rawRole === 'student') role = 'student';
    else if (rawRole === 'guest') role = 'guest';

    if (!role && isVerifiedBootstrapOwner) {
      role = 'admin';
    }

    if (!role) {
      res.status(403).json({ error: 'Forbidden: User account lacks a valid authoritative role.' });
      return null;
    }

    let adminTier: ServerCaller['adminTier'] = '';
    if (role === 'admin') {
      const rawTier = String(userData.adminTier || '').trim().toLowerCase();
      if (rawTier === 'primary' || isVerifiedBootstrapOwner) {
        adminTier = 'primary';
      } else {
        adminTier = 'secondary';
      }
    }

    if (!options?.allowPendingDeviceVerification && (role === 'admin' || role === 'teacher' || role === 'student')) {
      const parsedCookies = parseCookieHeader(req);
      const reqSessionId = String(req.headers['x-shikshantar-session-id'] || parsedCookies.shikshantar_sid || '').trim();
      const reqDeviceToken = String(req.headers['x-shikshantar-device-token'] || parsedCookies.shikshantar_dt || '').trim();
      const nowMs = Date.now();
      let sessionVerified = false;

      if (reqSessionId) {
        const sDoc = await hybridGetDoc(db, token, 'user_sessions', reqSessionId);
        if (sDoc.exists) {
          const sData = sDoc.data || {};
          if (sData.userUid === decoded.uid) {
            if (sData.status === 'PENDING_VERIFICATION') {
              res.status(403).json({
                error: 'Device verification required. Please enter the 6-digit security code sent to your email.',
                code: 'DEVICE_VERIFICATION_REQUIRED'
              });
              return null;
            }
            if (sData.status === 'REVOKED' || sData.status === 'LOGGED_OUT') {
              res.status(401).json({
                error: 'Your session has been ended or revoked. Please sign in again.',
                code: 'SESSION_REVOKED',
                revoked: true
              });
              return null;
            }
            if (sData.status === 'ACTIVE') {
              const sealValid = verifySessionSeal(decoded.uid, reqSessionId, sData.sessionSeal);
              // In REST mode (no Admin SDK) when device verification is enforced, require unforgeable server sessionSeal
              if (sealValid || !userData.deviceVerificationEnforced || (!sDoc.viaRest && !sData.sessionSeal)) {
                sessionVerified = true;
              }
            }
          }
        }
      }

      if (!sessionVerified && userData.deviceVerificationEnforced === true) {
        let trustedTokenValid = false;
        if (reqDeviceToken) {
          const signedPayload = verifySignedTrustToken(reqDeviceToken, decoded.uid, nowMs);
          if (signedPayload) {
            const trustDoc = await hybridGetDoc(db, token, 'trusted_devices', signedPayload.did);
            if (trustDoc.exists) {
              const tData = trustDoc.data || {};
              if (
                tData.userUid === decoded.uid &&
                tData.revoked !== true &&
                Number(tData.expiresAtMs || 0) > nowMs
              ) {
                trustedTokenValid = true;
              }
            } else {
              // Signed token is cryptographically valid and has not been revoked in Firestore
              trustedTokenValid = true;
            }
          } else {
            const trustDocId = resolveTrustedDeviceDocId(decoded.uid, reqDeviceToken);
            const trustDoc = await hybridGetDoc(db, token, 'trusted_devices', trustDocId);
            if (trustDoc.exists && !trustDoc.viaRest) {
              const tData = trustDoc.data || {};
              if (
                tData.userUid === decoded.uid &&
                tData.revoked !== true &&
                tData.signedTrust !== true &&
                Number(tData.expiresAtMs || 0) > nowMs
              ) {
                trustedTokenValid = true;
              }
            }
          }
        }

        if (!trustedTokenValid) {
          res.status(403).json({
            error: 'Device verification required. Please complete the 6-digit email verification code.',
            code: 'DEVICE_VERIFICATION_REQUIRED'
          });
          return null;
        }
      }
    }

    return {
      uid: decoded.uid,
      email: decoded.email || userData.email || '',
      emailVerified: decoded.email_verified === true,
      role,
      adminTier,
      userData,
      rawToken: token
    };
  }

  async function requireAdminAuth(req: Request, res: Response): Promise<ServerCaller | null> {
    const caller = await verifyUserAuth(req, res);
    if (!caller) return null;
    if (caller.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden: Administrative privileges required.' });
      return null;
    }
    return caller;
  }

  async function recordServerAuditLog(entry: {
    actorUid: string;
    actorEmail?: string;
    actorName?: string;
    actorRole: string;
    adminTier?: string;
    targetUid?: string;
    targetId?: string;
    targetType?: string;
    targetName?: string;
    studentUid?: string;
    studentId?: string;
    studentName?: string;
    studentClass?: string;
    academicYear?: string;
    enrollmentId?: string;
    previousValue?: string;
    newValue?: string;
    beforeState?: any;
    afterState?: any;
    action: string;
    result: string;
    reason?: string;
    category?: string;
    includeLedger?: boolean;
  }) {
    const now = new Date();
    const timestamp = now.toISOString();
    console.log(
      `[SECURITY AUDIT] ${timestamp} | Actor: ${entry.actorUid} (${entry.actorEmail || 'no-email'}) [${entry.actorRole}] | Action: ${entry.action} | Target: ${entry.targetName || entry.targetUid || entry.targetId || 'system'} | Result: ${entry.result} | Reason: ${entry.reason || 'N/A'}`
    );

    if (shouldSkipAdminFirestore()) {
      return;
    }

    try {
      const db = getAdminDb();
      const resolvedTargetName = entry.targetName || entry.studentName || '';
      const logPayload: Record<string, any> = {
        actionType: entry.action,
        action: entry.action,
        category: entry.category || 'security',
        actorUid: entry.actorUid,
        adminUid: entry.actorUid,
        actorEmail: entry.actorEmail || '',
        adminEmail: entry.actorEmail || '',
        actorName: entry.actorName || entry.actorEmail || 'Administrator',
        adminName: entry.actorName || entry.actorEmail || 'Administrator',
        actorRole: entry.actorRole,
        adminTier: entry.adminTier || '',
        targetType: entry.targetType || '',
        targetUid: entry.targetUid || '',
        targetId: entry.targetId || entry.targetUid || '',
        targetName: resolvedTargetName,
        studentUid: entry.studentUid || entry.targetUid || '',
        studentId: entry.studentId || '',
        studentName: resolvedTargetName || 'System Target',
        studentClass: entry.studentClass || '-',
        academicYear: entry.academicYear || '',
        enrollmentId: entry.enrollmentId || '',
        previousValue: entry.previousValue !== undefined ? String(entry.previousValue) : 'N/A',
        newValue: entry.newValue !== undefined ? String(entry.newValue) : 'N/A',
        beforeState: entry.beforeState !== undefined ? entry.beforeState : null,
        afterState: entry.afterState !== undefined ? entry.afterState : null,
        result: entry.result,
        reason: entry.reason || '',
        timestamp: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        timestampStr: timestamp,
        date: timestamp.split('T')[0],
      };
      await db.collection('audit_logs').add(logPayload);
      if (entry.includeLedger) {
        await db.collection('ledger_audit_logs').add(logPayload);
      }
    } catch {
      // Suppress audit log write error in background
    }
  }

  // Public non-secret client config (provides runtime Turnstile Site Key even if Vite static build omitted it)
  app.get('/api/auth/public-config', rateLimiter(120, 60000), (_req: Request, res: Response) => {
    const publicSiteKey = String(process.env.VITE_TURNSTILE_SITE_KEY || process.env.TURNSTILE_SITE_KEY || '')
      .trim()
      .replace(/^["']|["']$/g, '')
      .trim();
    return res.status(200).json({
      turnstileSiteKey: publicSiteKey
    });
  });

  // Server-Side Signed CAPTCHA Challenge & Verification Endpoint
  app.get('/api/auth/verify-captcha', rateLimiter(60, 60000), async (_req: Request, res: Response) => {
    try {
      const challenge = createSignedChallenge();
      return res.status(200).json({ success: true, ...challenge });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Unable to generate security challenge.' });
    }
  });

  app.post(['/api/auth/verify-captcha', '/api/auth/verify-turnstile'], rateLimiter(45, 60000), async (req: Request, res: Response) => {
    try {
      const { turnstileToken, action, challengeToken, answer } = req.body || {};
      const db = getAdminDb();
      const nowMs = getEffectiveNowMs(req);
      const forwarded = req.headers['x-forwarded-for'];
      const remoteIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.ip || req.socket.remoteAddress || '127.0.0.1');

      if (turnstileToken) {
        const tsRes = await verifyTurnstileToken(db, String(turnstileToken), remoteIp, action ? String(action) : undefined, nowMs);
        if (!tsRes.valid || !tsRes.verificationToken) {
          return res.status(tsRes.statusCode || 400).json({
            success: false,
            error: tsRes.error || 'Cloudflare Turnstile verification rejected. Please try again.'
          });
        }
        return res.json({
          success: true,
          verificationToken: tsRes.verificationToken,
          verifiedAt: new Date(nowMs).toISOString()
        });
      }

      if (!challengeToken || typeof challengeToken !== 'string') {
        return res.status(400).json({ success: false, error: 'Missing Turnstile token or CAPTCHA challenge token. Please request a fresh challenge.' });
      }

      const check = verifyChallengeResponse(challengeToken, answer);
      if (!check.valid || !check.challengeId) {
        return res.status(400).json({ success: false, error: check.error || 'CAPTCHA verification failed.' });
      }

      const challengeRef = db.collection('used_captcha_challenges').doc(`chal_${check.challengeId}`);
      const claimed = await db.runTransaction(async (txn) => {
        const snap = await txn.get(challengeRef);
        if (snap.exists) return false;
        txn.set(challengeRef, { kind: 'challenge', usedAtMs: nowMs, usedAt: new Date(nowMs).toISOString() });
        return true;
      });

      if (!claimed) {
        return res.status(409).json({ success: false, error: 'Security challenge already consumed. Please solve a fresh challenge.' });
      }

      return res.json({
        success: true,
        verificationToken: issueSignedVerificationToken(check.challengeId, 'challenge', nowMs),
        verifiedAt: new Date(nowMs).toISOString()
      });
    } catch (error) {
      console.error('[SECURITY] Error during server captcha verification:', error);
      return res.status(500).json({
        success: false,
        error: 'Security verification error. Please try again.'
      });
    }
  });

  // Durable Server-Side Login Brute-Force Cooldown & Precheck (4 failed attempts -> 5m -> 15m -> 30m -> 60m progressive cooldown)
  const LOGIN_MAX_FAILED_ATTEMPTS = 4;
  const LOGIN_IP_LOCK_THRESHOLD = 40; // Higher IP threshold avoids blocking shared school Wi-Fi
  const LOGIN_COOLDOWN_TIERS_MS = [
    5 * 60 * 1000,   // Tier 1: 5 minutes after 4 consecutive failures
    15 * 60 * 1000,  // Tier 2: 15 minutes
    30 * 60 * 1000,  // Tier 3: 30 minutes
    60 * 60 * 1000   // Tier 4+: max 60 minutes (never permanent lockout)
  ];

  const memoryLoginLimits = new Map<string, Record<string, any>>();

  app.post('/api/auth/login-precheck', rateLimiter(60, 60000), async (req: Request, res: Response) => {
    try {
      const { identifier, verificationToken, turnstileToken, action } = req.body || {};
      const normIdentifier = String(identifier || '').trim().toLowerCase();
      if (!normIdentifier) {
        return res.status(400).json({ allowed: false, error: 'Account identifier is required.' });
      }

      const db = getAdminDb();
      const nowMs = getEffectiveNowMs(req);
      const forwarded = req.headers['x-forwarded-for'];
      const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.ip || req.socket.remoteAddress || '127.0.0.1');

      const acctKey = `login_acct_${crypto.createHash('sha256').update(normIdentifier).digest('hex').slice(0, 32)}`;
      const ipKey = `login_ip_${crypto.createHash('sha256').update(clientIp).digest('hex').slice(0, 32)}`;

      let acctData: Record<string, any> = {};
      let ipData: Record<string, any> = {};
      try {
        const [acctSnap, ipSnap] = await Promise.all([
          db.collection('security_rate_limits').doc(acctKey).get(),
          db.collection('security_rate_limits').doc(ipKey).get()
        ]);
        acctData = acctSnap.exists ? (acctSnap.data() || {}) : {};
        ipData = ipSnap.exists ? (ipSnap.data() || {}) : {};
      } catch (dbErr) {
        if (isFirestoreCredentialUnavailableError(dbErr)) {
          acctData = memoryLoginLimits.get(acctKey) || {};
          ipData = memoryLoginLimits.get(ipKey) || {};
        } else {
          throw dbErr;
        }
      }

      const acctLockedUntil = Number(acctData.lockedUntilMs || 0);
      const ipLockedUntil = Number(ipData.lockedUntilMs || 0);
      const activeLockUntil = Math.max(acctLockedUntil, ipLockedUntil);

      if (activeLockUntil > nowMs) {
        const retryAfterSeconds = Math.ceil((activeLockUntil - nowMs) / 1000);
        return res.status(429).json({
          allowed: false,
          locked: true,
          retryAfterSeconds,
          lockedUntil: new Date(activeLockUntil).toISOString(),
          consecutiveFailures: Number(acctData.consecutiveFailures || LOGIN_MAX_FAILED_ATTEMPTS),
          maxAttempts: LOGIN_MAX_FAILED_ATTEMPTS,
          error: `Account temporarily locked after ${LOGIN_MAX_FAILED_ATTEMPTS} failed sign-in attempts. Please wait ${Math.ceil(retryAfterSeconds / 60)} minute(s) (${retryAfterSeconds}s) before trying again.`
        });
      }

      // Fail-closed: Cloudflare Turnstile / verification token is strictly required on every login attempt
      const tokenToConsume = turnstileToken || verificationToken;
      if (!tokenToConsume || !String(tokenToConsume).trim()) {
        return res.status(400).json({
          allowed: false,
          error: 'Cloudflare Turnstile security verification is required before signing in.'
        });
      }

      const expectedAction = typeof action === 'string' && action.trim() ? action.trim() : 'login';
      const check = await consumeVerificationToken(db, String(tokenToConsume), nowMs, clientIp, expectedAction);
      if (!check.valid) {
        return res.status(check.statusCode || 400).json({
          allowed: false,
          error: check.error || 'Cloudflare Turnstile verification failed. Please verify again.'
        });
      }

      return res.json({
        allowed: true,
        locked: false,
        consecutiveFailures: Number(acctData.consecutiveFailures || 0),
        remainingAttemptsBeforeCooldown: Math.max(0, LOGIN_MAX_FAILED_ATTEMPTS - Number(acctData.consecutiveFailures || 0)),
        maxAttempts: LOGIN_MAX_FAILED_ATTEMPTS
      });
    } catch (err: any) {
      console.error('[SECURITY] Error in /api/auth/login-precheck:', err);
      return res.status(500).json({ allowed: false, error: 'Unable to complete login security check.' });
    }
  });

  app.post('/api/auth/login-attempt', rateLimiter(60, 60000), async (req: Request, res: Response) => {
    try {
      const { identifier, outcome, success } = req.body || {};
      const normIdentifier = String(identifier || '').trim().toLowerCase();
      const normOutcome = outcome
        ? String(outcome).trim().toUpperCase()
        : (typeof success === 'boolean' ? (success ? 'SUCCESS' : 'FAILURE') : '');
      if (!normIdentifier || (normOutcome !== 'FAILURE' && normOutcome !== 'SUCCESS')) {
        return res.status(400).json({ error: 'Missing required identifier or valid outcome (FAILURE | SUCCESS).' });
      }

      const db = getAdminDb();
      const nowMs = getEffectiveNowMs(req);
      const forwarded = req.headers['x-forwarded-for'];
      const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.ip || req.socket.remoteAddress || '127.0.0.1');

      const acctKey = `login_acct_${crypto.createHash('sha256').update(normIdentifier).digest('hex').slice(0, 32)}`;
      const ipKey = `login_ip_${crypto.createHash('sha256').update(clientIp).digest('hex').slice(0, 32)}`;
      const acctRef = db.collection('security_rate_limits').doc(acctKey);
      const ipRef = db.collection('security_rate_limits').doc(ipKey);

      if (normOutcome === 'SUCCESS') {
        // Security requirement: ONLY reset consecutive failure counter when caller presents a valid Firebase ID token
        const caller = await verifyUserAuth(req, res, { allowPendingDeviceVerification: true });
        if (!caller) return;

        let lockResult = { locked: false, lockedUntilMs: 0 };
        try {
          lockResult = await db.runTransaction(async (txn) => {
            const acctSnap = await txn.get(acctRef);
            const acctData = acctSnap.exists ? (acctSnap.data() || {}) : {};
            const curAcctLocked = Number(acctData.lockedUntilMs || 0);
            if (curAcctLocked > nowMs) {
              return {
                locked: true,
                lockedUntilMs: curAcctLocked
              };
            }

            txn.set(acctRef, {
              identifierHash: acctKey,
              consecutiveFailures: 0,
              cooldownTier: 0,
              lockedUntilMs: 0,
              lastSuccessAtMs: nowMs,
              updatedAt: new Date(nowMs).toISOString()
            }, { merge: true });
            return { locked: false, lockedUntilMs: 0 };
          });
        } catch (dbErr) {
          if (isFirestoreCredentialUnavailableError(dbErr)) {
            const acctData = memoryLoginLimits.get(acctKey) || {};
            const curAcctLocked = Number(acctData.lockedUntilMs || 0);
            if (curAcctLocked > nowMs) {
              lockResult = { locked: true, lockedUntilMs: curAcctLocked };
            } else {
              memoryLoginLimits.set(acctKey, {
                identifierHash: acctKey,
                consecutiveFailures: 0,
                cooldownTier: 0,
                lockedUntilMs: 0,
                lastSuccessAtMs: nowMs
              });
              lockResult = { locked: false, lockedUntilMs: 0 };
            }
          } else {
            throw dbErr;
          }
        }

        if (lockResult.locked) {
          const retryAfterSeconds = Math.ceil((lockResult.lockedUntilMs - nowMs) / 1000);
          return res.status(423).json({
            success: false,
            locked: true,
            retryAfterSeconds,
            lockedUntil: new Date(lockResult.lockedUntilMs).toISOString(),
            error: `Account is temporarily locked for ${Math.ceil(retryAfterSeconds / 60)} minute(s). Please wait until the cooldown ends.`
          });
        }

        return res.json({
          success: true,
          locked: false,
          consecutiveFailures: 0,
          remainingAttemptsBeforeCooldown: LOGIN_MAX_FAILED_ATTEMPTS,
          maxAttempts: LOGIN_MAX_FAILED_ATTEMPTS
        });
      }

      // Record failed password attempt atomically
      const computeNextLock = (acctData: Record<string, any>, ipData: Record<string, any>) => {
        const curAcctLocked = Number(acctData.lockedUntilMs || 0);
        if (curAcctLocked > nowMs) {
          return {
            alreadyLocked: true,
            locked: true,
            justLocked: false,
            cooldownTier: Number(acctData.cooldownTier || 1),
            consecutiveFailures: Number(acctData.consecutiveFailures || LOGIN_MAX_FAILED_ATTEMPTS),
            lockedUntilMs: curAcctLocked,
            ipFailures: Number(ipData.consecutiveFailures || 0),
            ipLockedUntilMs: Number(ipData.lockedUntilMs || 0)
          };
        }

        const prevFailures = curAcctLocked > 0 && curAcctLocked <= nowMs
          ? Math.max(LOGIN_MAX_FAILED_ATTEMPTS - 1, Number(acctData.consecutiveFailures || 0))
          : Number(acctData.consecutiveFailures || 0);
        const nextFailures = prevFailures + 1;
        let nextTier = Number(acctData.cooldownTier || 0);
        let lockedUntilMs = 0;
        let justLocked = false;

        if (nextFailures >= LOGIN_MAX_FAILED_ATTEMPTS) {
          const tierIdx = Math.min(nextTier, LOGIN_COOLDOWN_TIERS_MS.length - 1);
          const cooldownDurationMs = LOGIN_COOLDOWN_TIERS_MS[tierIdx];
          lockedUntilMs = nowMs + cooldownDurationMs;
          nextTier = nextTier + 1;
          justLocked = true;
        }

        const prevIpLocked = Number(ipData.lockedUntilMs || 0);
        const ipFailures = prevIpLocked > 0 && prevIpLocked <= nowMs ? 1 : Number(ipData.consecutiveFailures || 0) + 1;
        const ipLockedUntilMs = ipFailures >= LOGIN_IP_LOCK_THRESHOLD
          ? nowMs + LOGIN_COOLDOWN_TIERS_MS[0]
          : (prevIpLocked > nowMs ? prevIpLocked : 0);

        return {
          alreadyLocked: false,
          locked: lockedUntilMs > nowMs,
          justLocked,
          cooldownTier: nextTier,
          consecutiveFailures: nextFailures,
          lockedUntilMs,
          ipFailures,
          ipLockedUntilMs
        };
      };

      let lockStatus: { locked: boolean; justLocked: boolean; cooldownTier: number; consecutiveFailures: number; lockedUntilMs: number };
      try {
        lockStatus = await db.runTransaction(async (txn) => {
          const [acctSnap, ipSnap] = await Promise.all([txn.get(acctRef), txn.get(ipRef)]);
          const acctData = acctSnap.exists ? (acctSnap.data() || {}) : {};
          const ipData = ipSnap.exists ? (ipSnap.data() || {}) : {};
          const calc = computeNextLock(acctData, ipData);
          if (calc.alreadyLocked) return calc;

          txn.set(acctRef, {
            identifierHash: acctKey,
            consecutiveFailures: calc.consecutiveFailures,
            cooldownTier: calc.cooldownTier,
            lockedUntilMs: calc.lockedUntilMs,
            lastFailureAtMs: nowMs,
            updatedAt: new Date(nowMs).toISOString()
          }, { merge: true });

          txn.set(ipRef, {
            ipHash: ipKey,
            consecutiveFailures: calc.ipFailures,
            lockedUntilMs: calc.ipLockedUntilMs,
            lastFailureAtMs: nowMs,
            updatedAt: new Date(nowMs).toISOString()
          }, { merge: true });

          return calc;
        });
      } catch (dbErr) {
        if (isFirestoreCredentialUnavailableError(dbErr)) {
          const acctData = memoryLoginLimits.get(acctKey) || {};
          const ipData = memoryLoginLimits.get(ipKey) || {};
          const calc = computeNextLock(acctData, ipData);
          if (!calc.alreadyLocked) {
            memoryLoginLimits.set(acctKey, {
              identifierHash: acctKey,
              consecutiveFailures: calc.consecutiveFailures,
              cooldownTier: calc.cooldownTier,
              lockedUntilMs: calc.lockedUntilMs,
              lastFailureAtMs: nowMs
            });
            memoryLoginLimits.set(ipKey, {
              ipHash: ipKey,
              consecutiveFailures: calc.ipFailures,
              lockedUntilMs: calc.ipLockedUntilMs,
              lastFailureAtMs: nowMs
            });
          }
          lockStatus = calc;
        } else {
          throw dbErr;
        }
      }

      if (lockStatus.locked) {
        const retryAfterSeconds = Math.ceil((lockStatus.lockedUntilMs - nowMs) / 1000);
        const cooldownMinutes = Math.ceil(retryAfterSeconds / 60);
        if (lockStatus.justLocked) {
          recordServerAuditLog({
            actorUid: 'anonymous',
            actorEmail: normIdentifier,
            actorName: normIdentifier,
            actorRole: 'anonymous',
            targetId: acctKey,
            action: 'LOGIN_ACCOUNT_LOCKED',
            result: 'LOCKED',
            reason: `Account temporarily locked for ${cooldownMinutes} minute(s) (tier ${lockStatus.cooldownTier}) after ${lockStatus.consecutiveFailures} failed attempts from IP ${clientIp}`
          }).catch(() => {});
        }
        return res.status(429).json({
          success: true,
          locked: true,
          consecutiveFailures: lockStatus.consecutiveFailures,
          remainingAttemptsBeforeCooldown: 0,
          maxAttempts: LOGIN_MAX_FAILED_ATTEMPTS,
          cooldownTier: lockStatus.cooldownTier,
          retryAfterSeconds,
          lockedUntil: new Date(lockStatus.lockedUntilMs).toISOString(),
          error: `Account temporarily locked for ${cooldownMinutes} minute(s) due to ${LOGIN_MAX_FAILED_ATTEMPTS} consecutive failed password attempts.`
        });
      }

      return res.json({
        success: true,
        locked: false,
        consecutiveFailures: lockStatus.consecutiveFailures,
        remainingAttemptsBeforeCooldown: Math.max(0, LOGIN_MAX_FAILED_ATTEMPTS - lockStatus.consecutiveFailures),
        maxAttempts: LOGIN_MAX_FAILED_ATTEMPTS
      });
    } catch (err: any) {
      console.error('[SECURITY] Error in /api/auth/login-attempt:', err);
      return res.status(500).json({ error: 'Failed to record login attempt.' });
    }
  });

  // Server-Side Password Reset / Forgot Password Endpoint (Max 2 requests per account in any rolling 5-minute window)
  const PASSWORD_RESET_WINDOW_MS = 5 * 60 * 1000;
  const PASSWORD_RESET_MAX_PER_ACCOUNT = 2;
  const PASSWORD_RESET_MAX_PER_IP = 10;

  app.post('/api/auth/password-reset', rateLimiter(30, 60000), async (req: Request, res: Response) => {
    try {
      const { email, identifier, verificationToken, turnstileToken } = req.body || {};
      const rawTarget = String(email || identifier || '').trim().toLowerCase();
      if (!rawTarget) {
        return res.status(400).json({ error: 'Please provide your registered email or account ID.' });
      }

      const db = getAdminDb();
      const nowMs = getEffectiveNowMs(req);
      const forwarded = req.headers['x-forwarded-for'];
      const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.ip || req.socket.remoteAddress || '127.0.0.1');

      const tokenToConsume = turnstileToken || verificationToken;
      if (!tokenToConsume || !String(tokenToConsume).trim()) {
        return res.status(400).json({ error: 'Security verification (Cloudflare Turnstile) is required to request a password reset.' });
      }

      const captchaCheck = await consumeVerificationToken(db, String(tokenToConsume), nowMs, clientIp, 'password_reset');
      if (!captchaCheck.valid) {
        return res.status(captchaCheck.statusCode || 400).json({ error: captchaCheck.error || 'Security verification failed.' });
      }

      const acctKey = `pwdreset_acct_${crypto.createHash('sha256').update(rawTarget).digest('hex').slice(0, 32)}`;
      const ipKey = `pwdreset_ip_${crypto.createHash('sha256').update(clientIp).digest('hex').slice(0, 32)}`;
      const acctRef = db.collection('security_rate_limits').doc(acctKey);
      const ipRef = db.collection('security_rate_limits').doc(ipKey);

      const rateCheck = await db.runTransaction(async (txn) => {
        const [acctSnap, ipSnap] = await Promise.all([txn.get(acctRef), txn.get(ipRef)]);
        const acctData = acctSnap.exists ? (acctSnap.data() || {}) : {};
        const ipData = ipSnap.exists ? (ipSnap.data() || {}) : {};

        const windowStartMs = nowMs - PASSWORD_RESET_WINDOW_MS;
        const acctTimestamps: number[] = Array.isArray(acctData.timestamps)
          ? acctData.timestamps.map(Number).filter((ts: number) => ts > windowStartMs)
          : [];
        const ipTimestamps: number[] = Array.isArray(ipData.timestamps)
          ? ipData.timestamps.map(Number).filter((ts: number) => ts > windowStartMs)
          : [];

        if (acctTimestamps.length >= PASSWORD_RESET_MAX_PER_ACCOUNT) {
          const oldestInWindow = Math.min(...acctTimestamps);
          const retryAfterMs = Math.max(1000, (oldestInWindow + PASSWORD_RESET_WINDOW_MS) - nowMs);
          return {
            allowed: false,
            retryAfterSeconds: Math.ceil(retryAfterMs / 1000)
          };
        }

        if (ipTimestamps.length >= PASSWORD_RESET_MAX_PER_IP) {
          const oldestIpInWindow = Math.min(...ipTimestamps);
          const retryAfterMs = Math.max(1000, (oldestIpInWindow + PASSWORD_RESET_WINDOW_MS) - nowMs);
          return {
            allowed: false,
            retryAfterSeconds: Math.ceil(retryAfterMs / 1000)
          };
        }

        const updatedAcctTimestamps = [...acctTimestamps, nowMs];
        const updatedIpTimestamps = [...ipTimestamps, nowMs];

        txn.set(acctRef, {
          key: acctKey,
          type: 'password_reset_account',
          timestamps: updatedAcctTimestamps,
          updatedAt: new Date(nowMs).toISOString()
        }, { merge: true });

        txn.set(ipRef, {
          key: ipKey,
          type: 'password_reset_ip',
          timestamps: updatedIpTimestamps,
          updatedAt: new Date(nowMs).toISOString()
        }, { merge: true });

        return {
          allowed: true,
          requestsInWindow: updatedAcctTimestamps.length
        };
      });

      if (!rateCheck.allowed) {
        return res.status(429).json({
          success: false,
          retryAfterSeconds: rateCheck.retryAfterSeconds,
          error: `Password reset limit reached (maximum 2 requests per 5 minutes). Please wait ${rateCheck.retryAfterSeconds} seconds before trying again.`
        });
      }

      // Trigger password reset link dispatch asynchronously / safely without leaking whether the account exists
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawTarget)) {
        try {
          const resetLink = await admin.auth().generatePasswordResetLink(rawTarget);
          const smtpConfig = getSmtpTransportConfig();
          if (smtpConfig.configured && smtpConfig.transportOptions && resetLink) {
            const transporter = nodemailer.createTransport(smtpConfig.transportOptions as any);
            await transporter.sendMail({
              from: `"Shikshantar Academy Security" <${smtpConfig.fromSecurity}>`,
              replyTo: smtpConfig.fromSecurity,
              to: rawTarget,
              subject: 'Password Reset Request — Shikshantar Academy Portal',
              html: `<div style="font-family:sans-serif;padding:20px;max-width:560px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;"><h2>Password Reset Request</h2><p>A password reset was requested for your Shikshantar Academy account.</p><p><a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Reset Password</a></p><p style="font-size:12px;color:#64748b;">If you did not request this, you can safely ignore this email.</p></div>`
            }).catch(() => {});
          }
        } catch {
          // Intentionally swallow user-not-found or Firebase errors so response is identical
        }
      }

      return res.json({
        success: true,
        message: 'If an account is registered with those details, password reset instructions have been sent.'
      });
    } catch (err: any) {
      console.error('[SECURITY] Error in /api/auth/password-reset:', err);
      return res.status(500).json({ error: 'Unable to process password reset request at this time.' });
    }
  });

  // Server-Side Delegated Email Notification Route (eliminates client VITE_EMAILJS_* / VITE_SMTP_* secrets)
  app.post('/api/public/dispatch-email', rateLimiter(20, 60000), async (req: Request, res: Response) => {
    try {
      const { templateParams, toEmail } = req.body || {};
      if (!templateParams || typeof templateParams !== 'object') {
        return res.status(400).json({ success: false, error: 'Missing email notification payload.' });
      }

      const recipient = String(toEmail || templateParams.to_email || process.env.ADMIN_NOTIFICATION_EMAIL || 'academyshikshantar@gmail.com').trim();
      const smtpConfig = getSmtpTransportConfig();

      if (smtpConfig.configured && smtpConfig.transportOptions && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
        try {
          const transporter = nodemailer.createTransport(smtpConfig.transportOptions as any);
          await transporter.sendMail({
            from: `"Shikshantar Academy" <${smtpConfig.fromGeneral}>`,
            replyTo: smtpConfig.fromGeneral,
            to: recipient,
            subject: String(templateParams.subject || 'Notification from Shikshantar Academy').slice(0, 200),
            text: String(templateParams.message || '').slice(0, 5000)
          });
          return res.json({ success: true, isConfigured: true, message: 'Notification email sent via server SMTP.' });
        } catch (err: any) {
          return res.json({ success: false, isConfigured: true, message: 'Server SMTP dispatch failed safely.' });
        }
      }

      return res.json({
        success: true,
        isConfigured: false,
        message: 'Notification recorded on server (external SMTP not configured).'
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: 'Failed to process email dispatch.' });
    }
  });

  // Birthday Wishes Route (Admin-only, no fake SMTP/success)
  app.post('/api/birthday/send-wishes', rateLimiter(60, 60000), async (req: Request, res: Response) => {
    try {
      const adminUser = await requireAdminAuth(req, res);
      if (!adminUser) return;

      const { email, role, name } = req.body || {};
      if (!email || !role || !name) {
        return res.status(400).json({ error: 'Missing user details to send birthday wishes.' });
      }

      const cleanEmail = String(email).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Invalid recipient email address.' });
      }

      const smtpConfig = getSmtpTransportConfig();
      if (!smtpConfig.configured || !smtpConfig.transportOptions) {
        return res.status(503).json({
          success: false,
          error: 'Email delivery service (SMTP) is not configured on the server.',
          code: 'SMTP_NOT_CONFIGURED'
        });
      }

      const transporter = nodemailer.createTransport(smtpConfig.transportOptions as any);

      let subject = '';
      let htmlBody = '';
      const safeName = String(name).replace(/[<>]/g, '');

      if (role === 'student') {
        subject = `Happy Birthday, ${safeName}! - Shikshantar Academy`;
        htmlBody = `<div style="font-family: sans-serif; padding: 20px; color: #333;"><h2 style="color: #4f46e5;">Happy Birthday, ${safeName}!</h2><p>We hope your special day brings you happiness and success.</p><p>From,<br><strong>Shikshantar Academy | Siraha</strong></p></div>`;
      } else if (role === 'teacher') {
        subject = `Wishing You a Happy Birthday, ${safeName}! - Shikshantar Academy`;
        htmlBody = `<div style="font-family: sans-serif; padding: 20px; color: #333;"><h2 style="color: #4f46e5;">Warmest Birthday Wishes, ${safeName}!</h2><p>Thank you for your dedication and hard work in shaping the future.</p><p>Warm regards,<br><strong>Shikshantar Academy Administration</strong></p></div>`;
      } else {
        subject = `Happy Birthday, ${safeName}! - Shikshantar Academy`;
        htmlBody = `<div style="font-family: sans-serif; padding: 20px; color: #333;"><h2 style="color: #4f46e5;">Happy Birthday, ${safeName}!</h2><p>Wishing you health and a wonderful year ahead.</p><p><strong>- Shikshantar Academy Administration</strong></p></div>`;
      }

      await transporter.sendMail({
        from: `"Shikshantar Academy" <${smtpConfig.fromGeneral}>`,
        replyTo: smtpConfig.fromGeneral,
        to: cleanEmail,
        subject,
        html: htmlBody
      });

      return res.json({ success: true, message: 'Birthday wish sent successfully!' });
    } catch (error) {
      console.error('Birthday Error:', error);
      return res.status(500).json({ error: 'Failed to send birthday wishes.' });
    }
  });

  // Idempotency cache for published emails
  const sentResultPublicationEmails = new Set<string>();

  // Result Publication Email Notification Route (Admin-only, Published exam required, Guardian Email ONLY)
  app.post('/api/results/send-publication-emails', rateLimiter(30, 60000), async (req: Request, res: Response) => {
    try {
      const adminUser = await requireAdminAuth(req, res);
      if (!adminUser) return;

      const { examId, examType, className, academicYear, students } = req.body || {};
      if (!examId || !examType || !className || !Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ error: 'Missing required parameters (examId, examType, className, students array).' });
      }

      const db = getAdminDb();
      const examSnap = await db.collection('exams').doc(String(examId)).get();
      if (!examSnap.exists) {
        return res.status(404).json({ error: 'Examination record not found.' });
      }
      const examData = examSnap.data() || {};
      if (examData.published !== true && examData.status !== 'PUBLISHED') {
        return res.status(400).json({ error: 'Publication notifications can only be sent after the examination is officially published.' });
      }

      const smtpConfig = getSmtpTransportConfig();

      if (!smtpConfig.configured || !smtpConfig.transportOptions) {
        return res.status(503).json({
          success: false,
          error: 'Email delivery service (SMTP) is not configured on the server.',
          code: 'SMTP_NOT_CONFIGURED'
        });
      }

      const transporter = nodemailer.createTransport(smtpConfig.transportOptions as any);

      let sentCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      const resultsSummary: any[] = [];

      for (const std of students) {
        const studentName = String(std?.name || std?.studentName || 'Student').trim();
        const guardianName = String(std?.guardianName || 'Parent / Guardian').trim();
        const studentUid = String(std?.studentUid || '').trim();
        const studentIdentifier = String(std?.studentId || studentUid || '').trim();

        let mergedEmailLookup: Record<string, any> = {
          guardianEmail: std?.guardianEmail || '',
          parentEmail: std?.parentEmail || '',
          fatherEmail: std?.fatherEmail || '',
          motherEmail: std?.motherEmail || '',
          registeredEmail: std?.registeredEmail || '',
          email: std?.email || ''
        };

        let resolved = resolveResultNotificationRecipientEmail(mergedEmailLookup);
        if (!resolved.email && studentUid) {
          try {
            const userSnap = await db.collection('users').doc(studentUid).get();
            if (userSnap.exists) {
              mergedEmailLookup = { ...(userSnap.data() || {}), ...mergedEmailLookup };
              resolved = resolveResultNotificationRecipientEmail(mergedEmailLookup);
            }
          } catch (_) {}
        }

        const targetEmail = resolved.email;
        const recipientSource = resolved.source;

        if (!targetEmail) {
          skippedCount++;
          resultsSummary.push({ studentId: studentIdentifier, email: '', status: 'SKIPPED_NO_RECIPIENT_EMAIL' });
          continue;
        }

        const idempotencyKey = `${examId}_${studentIdentifier || targetEmail}_${targetEmail}`;
        const cleanKey = idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_');
        const uidKey = studentUid ? `${examId}_${studentUid}_${targetEmail}`.replace(/[^a-zA-Z0-9_-]/g, '_') : '';

        if (sentResultPublicationEmails.has(idempotencyKey) || (uidKey && sentResultPublicationEmails.has(uidKey))) {
          skippedCount++;
          resultsSummary.push({ studentId: studentIdentifier, email: targetEmail, source: recipientSource, status: 'SKIPPED_ALREADY_SENT' });
          continue;
        }

        try {
          const dispatchDoc = await db.collection('publication_email_dispatches').doc(cleanKey).get();
          const uidDispatchDoc = (uidKey && uidKey !== cleanKey)
            ? await db.collection('publication_email_dispatches').doc(uidKey).get()
            : null;
          if (dispatchDoc.exists || uidDispatchDoc?.exists) {
            sentResultPublicationEmails.add(idempotencyKey);
            if (uidKey) sentResultPublicationEmails.add(uidKey);
            skippedCount++;
            resultsSummary.push({ studentId: studentIdentifier, email: targetEmail, source: recipientSource, status: 'SKIPPED_ALREADY_SENT' });
            continue;
          }
        } catch (_) {}

        const portalLink = `${process.env.APP_URL || 'https://shikshantaracademy.edu.np'}/result`;
        const greetingName = recipientSource === 'student' ? studentName : guardianName;
        const subject = `Academic Result Published: ${studentName} — Shikshantar Academy`;
        const textBody = `Dear ${greetingName},\n\nThe official ${examType} results for ${studentName} (Class ${className}) have been published by Shikshantar Academy for Academic Session ${academicYear || 'Current Session'}.\n\nPortal Link: ${portalLink}\n\nBest regards,\nExamination Committee\nShikshantar Academy, Bastipur, Siraha, Nepal`;
        const htmlBody = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;"><div style="text-align:center;border-bottom:2px solid #3b82f6;padding-bottom:16px;margin-bottom:20px;"><h2 style="color:#1e3a8a;margin:0;font-size:22px;font-weight:800;">SHIKSHANTAR ACADEMY</h2><p style="color:#64748b;font-size:13px;margin:4px 0 0 0;">Bastipur, Karjanha-05, Siraha, Nepal</p></div><p style="font-size:15px;color:#1e293b;">Dear <strong>${greetingName}</strong>,</p><p style="font-size:14px;color:#334155;">The official <strong>${examType}</strong> academic results for <strong>${studentName}</strong> (Class ${className}) have been officially published.</p><p style="font-size:14px;color:#334155;">To protect student privacy, marks are not sent in plain email. Please sign in to view the official grade sheet.</p><div style="margin:28px 0;text-align:center;"><a href="${portalLink}" style="background:#1e40af;color:#ffffff;padding:12px 28px;font-weight:700;font-size:14px;text-decoration:none;border-radius:8px;display:inline-block;">View Official Result</a></div></div>`;

        try {
          await transporter.sendMail({
            from: `"Shikshantar Academy Results" <${smtpConfig.fromResults}>`,
            replyTo: smtpConfig.fromResults,
            to: targetEmail,
            subject,
            text: textBody,
            html: htmlBody
          });
          sentResultPublicationEmails.add(idempotencyKey);
          if (uidKey) sentResultPublicationEmails.add(uidKey);
          sentCount++;
          resultsSummary.push({ studentId: studentIdentifier, email: targetEmail, source: recipientSource, status: 'DELIVERED' });

          const dispatchPayload = {
            examId,
            studentUid: studentUid || '',
            studentIdentifier,
            recipientEmail: targetEmail,
            recipientSource,
            guardianEmail: recipientSource === 'guardian' ? targetEmail : (mergedEmailLookup.guardianEmail || ''),
            guardianName,
            studentName,
            className,
            academicYear: academicYear || '',
            dispatchedByUid: adminUser.uid,
            sentAt: new Date().toISOString()
          };
          await db.collection('publication_email_dispatches').doc(cleanKey).set(dispatchPayload);
          if (uidKey && uidKey !== cleanKey) {
            await db.collection('publication_email_dispatches').doc(uidKey).set(dispatchPayload);
          }
        } catch (mailErr: any) {
          console.warn(`[RESULT EMAIL ERROR] Failed for ${targetEmail}:`, mailErr.message);
          failedCount++;
          resultsSummary.push({ studentId: studentIdentifier, email: targetEmail, status: 'FAILED', error: mailErr.message });
        }
      }

      return res.json({
        success: true,
        examId,
        totalSent: sentCount,
        skippedCount,
        failedCount,
        results: resultsSummary
      });
    } catch (err: any) {
      console.error('[SECURITY] Error in /api/results/send-publication-emails:', err);
      return res.status(500).json({ error: 'Internal server error while processing publication emails: ' + err.message });
    }
  });

  // Trusted Endpoint 1: Initialize or Resume Examination Setup
  app.post('/api/exams/initialize-or-resume', rateLimiter(60, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;

      const {
        category,
        terminalExamType,
        testDisplayName,
        canonicalClassId,
        canonicalSectionId,
        canonicalAcademicYearId,
        subjectConfigs,
        examId: requestedExamId
      } = req.body;

      const headerOpId = (req.headers['x-operation-id'] as string || '').trim();
      const bodyOpId = (req.body?.operationId || '').trim();

      if (headerOpId && bodyOpId && headerOpId !== bodyOpId) {
        return res.status(400).json({ error: 'Mismatched X-Operation-ID header and operationId in body.' });
      }

      const operationId = headerOpId || bodyOpId;
      if (!operationId) {
        return res.status(400).json({ error: 'Missing required operationId parameter for idempotency.' });
      }

      const normCategory = String(category || '').trim().toUpperCase();
      if (normCategory !== 'TERMINAL' && normCategory !== 'TEST') {
        return res.status(400).json({ error: 'Invalid category. Must be TERMINAL or TEST.' });
      }

      let normTerminalType: string | null = null;
      if (normCategory === 'TERMINAL') {
        normTerminalType = normalizeTerminalExamType(terminalExamType);
        if (!normTerminalType) {
          return res.status(400).json({ error: 'Invalid or missing terminalExamType. Permitted values: FIRST_TERMINAL, SECOND_TERMINAL, THIRD_TERMINAL, FINAL_TERMINAL.' });
        }
      }

      let normTestName: string | null = null;
      if (normCategory === 'TEST') {
        normTestName = String(testDisplayName || '').trim();
        if (!normTestName) {
          return res.status(400).json({ error: 'Missing required testDisplayName for TEST category.' });
        }
      }

      if (!canonicalClassId) {
        return res.status(400).json({ error: 'Missing required canonicalClassId.' });
      }

      const normClass = normalizeClass(String(canonicalClassId));
      const normSec = (canonicalSectionId && String(canonicalSectionId).trim().toLowerCase() !== 'all')
        ? String(canonicalSectionId).trim().toUpperCase()
        : 'A';

      const parsedYear = parseAndValidateAcademicYear(canonicalAcademicYearId);
      const normYear = parsedYear || String(canonicalAcademicYearId || '2083').trim();

      const dbForPolicy = getAdminDb();
      const yearPolicy = await resolveAcademicYearPolicy(dbForPolicy, normYear);
      if (!yearPolicy.canMutate) {
        return res.status(403).json({
          error: yearPolicy.blockReason || `Academic Year ${normYear} BS is not active.`,
          code: 'ACADEMIC_YEAR_NOT_ACTIVE',
          currentAcademicYear: yearPolicy.currentAcademicYear,
          currentAcademicYearTitle: yearPolicy.currentAcademicYearTitle
        });
      }

      // Validate subjectConfigs if provided
      const validatedConfigs: any[] = [];
      if (Array.isArray(subjectConfigs)) {
        for (const item of subjectConfigs) {
          const valResult = validateSubjectConfigItem(item);
          if (!valResult.isValid) {
            return res.status(400).json({ error: valResult.error || 'Invalid subject configuration.' });
          }
          validatedConfigs.push(item);
        }
      }

      // Authoritative Role & 4D Class Teacher Check
      const isAdmin = authUser.role === 'admin';
      let isAuthorized = isAdmin;
      if (!isAdmin && authUser.role === 'teacher') {
        isAuthorized = isStrictClassTeacherAuthorized(authUser.userData, normClass, normSec, normYear);
      }

      if (!isAuthorized) {
        return res.status(403).json({ error: 'Forbidden: You are not authorized as Admin or exact 4D Class Teacher for this class, section, and academic year.' });
      }

      // Calculate Payload Fingerprint for Idempotency
      const canonicalConfigs = Array.isArray(subjectConfigs)
        ? subjectConfigs.map(item => ({
            subjectKey: String(item.subjectKey || item.subjectName || '').trim().toLowerCase(),
            subjectName: String(item.subjectName || item.subjectKey || '').trim(),
            enabled: item.enabled !== false,
            hasTh: item.hasTh === true,
            hasPr: item.hasPr === true,
            thFullMarks: item.hasTh === true ? Number(item.thFullMarks ?? item.theoryFullMarks ?? 0) : 0,
            thPassMarks: item.hasTh === true ? Number(item.thPassMarks ?? item.theoryPassMarks ?? 0) : 0,
            prFullMarks: item.hasPr === true ? Number(item.prFullMarks ?? item.practicalFullMarks ?? 0) : 0,
            prPassMarks: item.hasPr === true ? Number(item.prPassMarks ?? item.practicalPassMarks ?? 0) : 0,
            customSubjectId: item.customSubjectId ? String(item.customSubjectId).trim() : null
          })).sort((a, b) => a.subjectKey.localeCompare(b.subjectKey))
        : [];

      const fingerprintPayload = {
        category: normCategory,
        terminalExamType: normTerminalType,
        testDisplayName: normTestName,
        canonicalClassId: normClass,
        canonicalSectionId: normSec,
        canonicalAcademicYearId: normYear,
        subjectConfigs: canonicalConfigs
      };
      const payloadFingerprint = crypto.createHash('sha256').update(JSON.stringify(fingerprintPayload)).digest('hex');

      const db = getAdminDb();

      const txnResult: any = await db.runTransaction(async (transaction) => {
        // Read 1: Idempotency Key Document
        const idempotencyRef = db.collection('exam_idempotency_keys').doc(operationId);
        const idempotencySnap = await transaction.get(idempotencyRef);

        if (idempotencySnap.exists) {
          const keyData = idempotencySnap.data() || {};
          if (keyData.createdBy && keyData.createdBy !== authUser.uid) {
            return {
              statusCode: 403,
              error: 'Forbidden: Operation ID is owned by another authenticated actor.'
            };
          }
          if (keyData.fingerprint !== payloadFingerprint) {
            return {
              statusCode: 400,
              error: `Conflict: operationId "${operationId}" was already processed with a different payload.`
            };
          }
          if (keyData.examId) {
            const existingExamDoc = await transaction.get(db.collection('exams').doc(keyData.examId));
            if (existingExamDoc.exists) {
              return {
                statusCode: 200,
                exam: existingExamDoc.data(),
                resumed: true,
                isRetry: true
              };
            }
          }
        }

        // Determine displayTitle first for consistent audit and conflict messages
        let displayTitle = '';
        if (normCategory === 'TERMINAL') {
          switch (normTerminalType) {
            case 'FIRST_TERMINAL': displayTitle = 'First Terminal Examination'; break;
            case 'SECOND_TERMINAL': displayTitle = 'Second Terminal Examination'; break;
            case 'THIRD_TERMINAL': displayTitle = 'Third Terminal Examination'; break;
            case 'FINAL_TERMINAL': displayTitle = 'Final Terminal Examination'; break;
            default: displayTitle = normTerminalType || 'Terminal Examination';
          }
        } else {
          displayTitle = normTestName!;
        }

        // Determine target examId & enforce Category / Terminal publication policies
        let targetExamId = '';
        if (normCategory === 'TERMINAL') {
          targetExamId = buildCanonicalExamId(normTerminalType!, normClass, normSec, normYear, { category: 'TERMINAL' });
          const examRef = db.collection('exams').doc(targetExamId);
          let examSnap = await transaction.get(examRef);

          // Legacy FINAL compatibility check:
          // If targetExamId (FINAL_TERMINAL_...) does not exist, check if legacy FINAL_... exists!
          let resolvedExamDocId = targetExamId;
          if (!examSnap.exists && normTerminalType === 'FINAL_TERMINAL') {
            const legacyFinalId = `FINAL_${normClass}_${normSec}_${normYear}`;
            const legacySnap = await transaction.get(db.collection('exams').doc(legacyFinalId));
            if (legacySnap.exists) {
              examSnap = legacySnap;
              resolvedExamDocId = legacyFinalId;
            }
          }

          if (examSnap.exists) {
            const existingData = examSnap.data() || {};
            const isPublished = Boolean(existingData.published === true || existingData.status === 'PUBLISHED');
            if (isPublished) {
              return {
                statusCode: 409,
                error: `Terminal examination "${displayTitle}" for Class ${normClass} Section ${normSec} in Academic Year ${normYear} has already been published and is permanently locked. Re-initialization or duplicate creation is prohibited.`
              };
            }
            if (existingData.workflowMode === 'STANDALONE') {
              return {
                statusCode: 409,
                error: `Workflow Mode Conflict: "${displayTitle}" for Class ${normClass} Section ${normSec} (${normYear}) already exists as a STANDALONE Direct Manual Entry draft. Connected and Standalone workflows cannot be silently merged.`
              };
            }
            // Existing DRAFT or READY_FOR_REVIEW exam found -> Resume cleanly without creating a second exam
            transaction.set(idempotencyRef, {
              examId: resolvedExamDocId,
              fingerprint: payloadFingerprint,
              createdAt: new Date().toISOString(),
              createdBy: authUser.uid
            });
            return {
              statusCode: 200,
              exam: existingData,
              resumed: true,
              isRetry: false
            };
          }

          // Check if all four terminals are already published for this year + class + section
          let publishedTerminalsCount = 0;
          for (const t of CANONICAL_TERMINAL_EXAMS) {
            const tId = buildCanonicalExamId(t.id, normClass, normSec, normYear, { category: 'TERMINAL' });
            let tDocSnap = await transaction.get(db.collection('exams').doc(tId));
            if (!tDocSnap.exists && t.id === 'FINAL_TERMINAL') {
              const legacyTId = `FINAL_${normClass}_${normSec}_${normYear}`;
              const legSnap = await transaction.get(db.collection('exams').doc(legacyTId));
              if (legSnap.exists) {
                tDocSnap = legSnap;
              }
            }
            if (tDocSnap.exists) {
              const td = tDocSnap.data() || {};
              if (td.published === true || td.status === 'PUBLISHED') {
                publishedTerminalsCount++;
              }
            }
          }
          if (publishedTerminalsCount >= 4) {
            return {
              statusCode: 409,
              error: `All four Terminal examinations have already been published for Class ${normClass} Section ${normSec} in Academic Year ${normYear}. No additional Terminal examinations can be initialized.`
            };
          }
        } else if (requestedExamId) {
          targetExamId = String(requestedExamId).trim();
          const examRef = db.collection('exams').doc(targetExamId);
          const examSnap = await transaction.get(examRef);
          if (examSnap.exists) {
            const existingData = examSnap.data() || {};
            transaction.set(idempotencyRef, {
              examId: targetExamId,
              fingerprint: payloadFingerprint,
              createdAt: new Date().toISOString(),
              createdBy: authUser.uid
            });
            return {
              statusCode: 200,
              exam: existingData,
              resumed: true,
              isRetry: false
            };
          }
        } else {
          // TEST category: generate unique instanceId with atomic collision detection
          const sanitizedSlug = normTestName!.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
          let uniqueFound = false;
          for (let attempt = 0; attempt < 5; attempt++) {
            const instanceId = crypto.randomBytes(4).toString('hex');
            const candidateId = `TEST_${sanitizedSlug}_${normClass}_${normSec}_${normYear}_${instanceId}`;
            const checkSnap = await transaction.get(db.collection('exams').doc(candidateId));
            if (!checkSnap.exists) {
              targetExamId = candidateId;
              uniqueFound = true;
              break;
            }
          }
          if (!uniqueFound) {
            targetExamId = `TEST_${sanitizedSlug}_${normClass}_${normSec}_${normYear}_${Date.now()}`;
          }
        }

        const examRef = db.collection('exams').doc(targetExamId);

        const newExamRecord = {
          id: targetExamId,
          examId: targetExamId,
          workflowMode: 'CONNECTED',
          category: normCategory,
          terminalExamType: normTerminalType,
          testDisplayName: normTestName,
          name: displayTitle,
          canonicalClassId: normClass,
          canonicalSectionId: normSec,
          canonicalAcademicYearId: normYear,
          class: normClass,
          section: normSec,
          academicYear: normYear,
          selectedClass: normClass,
          selectedSection: normSec,
          selectedAcademicYear: normYear,
          published: false,
          status: 'DRAFT',
          configVersion: 1,
          subjectConfigs: validatedConfigs,
          subjectStatus: {},
          createdAt: new Date().toISOString(),
          createdBy: authUser.uid,
          createdByUid: authUser.uid,
          updatedAt: new Date().toISOString(),
          updatedBy: authUser.uid
        };

        transaction.set(examRef, newExamRecord);
        transaction.set(idempotencyRef, {
          examId: targetExamId,
          fingerprint: payloadFingerprint,
          createdAt: new Date().toISOString(),
          createdBy: authUser.uid
        });

        const auditRef = db.collection('exam_audit_logs').doc();
        transaction.set(auditRef, {
          examId: targetExamId,
          action: normCategory === 'TERMINAL' ? 'INITIALIZE_TERMINAL' : 'INITIALIZE_TEST',
          performedBy: authUser.uid,
          performedAt: new Date().toISOString(),
          details: { category: normCategory, terminalExamType: normTerminalType, class: normClass, section: normSec, year: normYear }
        });

        return {
          statusCode: 200,
          exam: newExamRecord,
          resumed: false,
          isRetry: false
        };
      });

      if (txnResult.error) {
        return res.status(txnResult.statusCode || 400).json({ error: txnResult.error });
      }

      let teacherNotificationsSent = 0;
      if (!txnResult.resumed && txnResult.exam?.id) {
        try {
          const notifResult = await notifyTeachersOfExamInitialization(db, {
            examId: String(txnResult.exam.id),
            examTitle: String(txnResult.exam.name || 'Examination'),
            normClass,
            normSec,
            normYear,
            initiatorUid: authUser.uid,
            initiatorName: String(authUser.userData?.fullName || authUser.userData?.name || authUser.email || 'Coordinator'),
            initiatorRole: authUser.role
          });
          teacherNotificationsSent = notifResult.notifiedCount;
        } catch (notifErr: any) {
          console.warn('[TEACHER INIT NOTIF] Failed during initialize-or-resume:', notifErr?.message || notifErr);
        }
      }

      return res.status(200).json({
        ...txnResult,
        teacherNotificationsSent
      });
    } catch (err: any) {
      console.error('[SECURITY] Error in /api/exams/initialize-or-resume:', err);
      return res.status(500).json({ error: 'Internal server error while initializing or resuming examination: ' + err.message });
    }
  });

  // Trusted Endpoint 1B: Dispatch In-Portal Bell + App/PWA Notifications to Assigned Teachers When Exam Is Initialized
  app.post('/api/exams/notify-teachers-initialized', rateLimiter(60, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;

      const { examId } = req.body || {};
      const cleanExamId = String(examId || '').trim();
      if (!cleanExamId) {
        return res.status(400).json({ error: 'Missing required examId parameter.' });
      }

      const db = getAdminDb();
      const examSnap = await db.collection('exams').doc(cleanExamId).get();
      if (!examSnap.exists) {
        return res.status(404).json({ error: 'Examination record not found.' });
      }

      const examData = examSnap.data() || {};
      const normClass = normalizeClass(String(examData.canonicalClassId || examData.class || req.body?.className || ''));
      const normSec = String(examData.canonicalSectionId || examData.section || req.body?.section || 'A').trim() || 'A';
      const rawYear = String(examData.canonicalAcademicYearId || examData.academicYear || req.body?.academicYear || '').trim();
      const normYear = parseAndValidateAcademicYear(rawYear) || rawYear;
      const examTitle = String(examData.name || examData.type || examData.examType || 'Examination').trim();

      if (!normClass || !normYear) {
        return res.status(400).json({ error: 'Examination metadata incomplete (missing class or academicYear).' });
      }

      const isAdmin = authUser.role === 'admin';
      const isAuthorizedClassTeacher =
        authUser.role === 'teacher' &&
        isLegacyOrStrictClassTeacherAuthorized(authUser.userData, normClass, normSec, normYear);

      if (!isAdmin && !isAuthorizedClassTeacher) {
        return res.status(403).json({
          error: 'Forbidden: Only Administrators or the authorized Class Teacher for this class, section, and academic year can notify subject teachers.'
        });
      }

      const notifResult = await notifyTeachersOfExamInitialization(db, {
        examId: cleanExamId,
        examTitle,
        normClass,
        normSec,
        normYear,
        initiatorUid: authUser.uid,
        initiatorName: String(authUser.userData?.fullName || authUser.userData?.name || authUser.email || 'Coordinator'),
        initiatorRole: isAdmin ? 'admin' : 'teacher'
      });

      return res.json({
        success: true,
        examId: cleanExamId,
        notifiedCount: notifResult.notifiedCount,
        teacherUids: notifResult.teacherUids
      });
    } catch (err: any) {
      console.error('[TEACHER INIT NOTIF] Error in /api/exams/notify-teachers-initialized:', err);
      return res.status(500).json({ error: 'Internal server error notifying teachers: ' + err.message });
    }
  });

  // Trusted Endpoint 2: Update Subject Configuration Concurrency-Safe
  app.post('/api/exams/update-subject-config', rateLimiter(60, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;

      const {
        operationId,
        examId,
        expectedVersion,
        subjectConfigs,
        confirmImpact,
        impactToken
      } = req.body;

      if (!operationId || typeof operationId !== 'string' || !operationId.trim()) {
        return res.status(400).json({ error: 'Missing required operationId parameter for idempotency.' });
      }
      if (!examId || typeof examId !== 'string') {
        return res.status(400).json({ error: 'Missing required examId.' });
      }
      if (expectedVersion === undefined || expectedVersion === null || isNaN(Number(expectedVersion))) {
        return res.status(400).json({ error: 'Missing or invalid expectedVersion for optimistic concurrency control.' });
      }
      if (!Array.isArray(subjectConfigs)) {
        return res.status(400).json({ error: 'Missing or invalid subjectConfigs array.' });
      }

      // Validate each subject config item
      for (const item of subjectConfigs) {
        const valRes = validateSubjectConfigItem(item);
        if (!valRes.isValid) {
          return res.status(400).json({ error: valRes.error || 'Invalid subject configuration item.' });
        }
      }

      const db = getAdminDb();

      const isAdmin = authUser.role === 'admin';

      // Read parent exam doc outside txn first for authorization verification
      const examRef = db.collection('exams').doc(examId);
      const preExamSnap = await examRef.get();
      if (!preExamSnap.exists) {
        return res.status(404).json({ error: 'Parent examination document not found.' });
      }
      const preExamData = preExamSnap.data() || {};
      if (preExamData.status === 'PUBLISHED' || preExamData.published === true) {
        return res.status(400).json({ error: 'REJECTED: Cannot update subject configuration for a PUBLISHED examination. Published exams are read-only.' });
      }

      if (!isAdmin) {
        const targetClass = preExamData.canonicalClassId || preExamData.class || preExamData.selectedClass || '';
        const targetSec = preExamData.canonicalSectionId || preExamData.section || preExamData.selectedSection || 'A';
        const targetYear = resolveCanonicalAcademicYearId(preExamData) || '';
        if (authUser.role !== 'teacher' || !isStrictClassTeacherAuthorized(authUser.userData, targetClass, targetSec, targetYear)) {
          return res.status(403).json({ error: 'Forbidden: Only Administrators or exact 4D Class Teachers can update subject configurations.' });
        }
      }

      // Compute canonical configuration fingerprint
      const canonicalConfigs = subjectConfigs.map(item => ({
        subjectKey: String(item.subjectKey || item.subjectName || '').trim().toLowerCase(),
        subjectName: String(item.subjectName || item.subjectKey || '').trim(),
        enabled: item.enabled !== false,
        hasTh: item.hasTh === true,
        hasPr: item.hasPr === true,
        thFullMarks: item.hasTh === true ? Number(item.thFullMarks ?? item.theoryFullMarks ?? 0) : 0,
        thPassMarks: item.hasTh === true ? Number(item.thPassMarks ?? item.theoryPassMarks ?? 0) : 0,
        prFullMarks: item.hasPr === true ? Number(item.prFullMarks ?? item.practicalFullMarks ?? 0) : 0,
        prPassMarks: item.hasPr === true ? Number(item.prPassMarks ?? item.practicalPassMarks ?? 0) : 0,
        customSubjectId: item.customSubjectId ? String(item.customSubjectId).trim() : null
      })).sort((a, b) => a.subjectKey.localeCompare(b.subjectKey));

      const configFingerprint = crypto.createHash('sha256').update(JSON.stringify(canonicalConfigs)).digest('hex');

      // Check existing marks impact
      const existingRecordsSnap = await db.collectionGroup('records').where('examId', '==', examId).limit(500).get();
      const affectedSubjectsSet = new Set<string>();
      const affectedStudentsSet = new Set<string>();

      if (!existingRecordsSnap.empty) {
        // Map new configs by subjectKey or subjectName
        const newConfigMap = new Map<string, any>();
        for (const cfg of subjectConfigs) {
          if (cfg.subjectKey) newConfigMap.set(cfg.subjectKey.toLowerCase(), cfg);
          if (cfg.subjectName) newConfigMap.set(cfg.subjectName.toLowerCase(), cfg);
        }

        for (const recordDoc of existingRecordsSnap.docs) {
          const rec = recordDoc.data() || {};
          const subjKey = (rec.subjectKey || rec.subjectName || '').toLowerCase();
          const studentUid = rec.studentUid || rec.studentId || recordDoc.id;

          const newCfg = newConfigMap.get(subjKey);
          if (!newCfg || newCfg.enabled === false) {
            affectedSubjectsSet.add(rec.subjectName || rec.subjectKey || subjKey);
            affectedStudentsSet.add(studentUid);
          } else {
            const hasThMarks = rec.thMarks !== undefined && rec.thMarks !== null && rec.thMarks !== '';
            const hasPrMarks = rec.prMarks !== undefined && rec.prMarks !== null && rec.prMarks !== '';

            if (hasThMarks && newCfg.hasTh === false) {
              affectedSubjectsSet.add(rec.subjectName || rec.subjectKey || subjKey);
              affectedStudentsSet.add(studentUid);
            }
            if (hasPrMarks && newCfg.hasPr === false) {
              affectedSubjectsSet.add(rec.subjectName || rec.subjectKey || subjKey);
              affectedStudentsSet.add(studentUid);
            }
            if (hasThMarks && typeof rec.thMarks === 'number' && newCfg.thFullMarks && rec.thMarks > newCfg.thFullMarks) {
              affectedSubjectsSet.add(rec.subjectName || rec.subjectKey || subjKey);
              affectedStudentsSet.add(studentUid);
            }
            if (hasPrMarks && typeof rec.prMarks === 'number' && newCfg.prFullMarks && rec.prMarks > newCfg.prFullMarks) {
              affectedSubjectsSet.add(rec.subjectName || rec.subjectKey || subjKey);
              affectedStudentsSet.add(studentUid);
            }
          }
        }
      }

      const affectedSubjects = Array.from(affectedSubjectsSet).sort();
      const hasImpact = affectedSubjects.length > 0;

      const isProdEnv = process.env.NODE_ENV === 'production';
      let IMPACT_SECRET = (process.env.IMPACT_TOKEN_SECRET || '').trim();
      if (!IMPACT_SECRET) {
        if (isProdEnv) {
          return res.status(500).json({ error: 'Server configuration error: IMPACT_TOKEN_SECRET environment variable is missing in production.' });
        }
        IMPACT_SECRET = 'dev_impact_secret_shikshantar_2083_key_for_testing_only';
      }

      let parsedToken: any = null;

      if (hasImpact) {
        const issuedAt = Date.now();
        const expiresAt = issuedAt + 15 * 60 * 1000; // 15-minute TTL

        const rawMessage = `${authUser.uid}:${examId}:${expectedVersion}:${configFingerprint}:${affectedSubjects.join(',')}:${issuedAt}:${expiresAt}`;
        const tokenSignature = crypto.createHmac('sha256', IMPACT_SECRET).update(rawMessage).digest('hex');

        const generatedImpactToken = Buffer.from(JSON.stringify({
          actorUid: authUser.uid,
          examId,
          expectedVersion: Number(expectedVersion),
          configFingerprint,
          affectedSubjects: affectedSubjects.join(','),
          issuedAt,
          expiresAt,
          signature: tokenSignature
        })).toString('base64url');

        if (!confirmImpact) {
          return res.status(422).json({
            requiresConfirmation: true,
            impactToken: generatedImpactToken,
            affectedSubjects,
            affectedStudentsCount: affectedStudentsSet.size,
            message: 'Updating subject configuration affects existing student marks. Confirmation required.'
          });
        }

        if (!impactToken || typeof impactToken !== 'string') {
          return res.status(409).json({ error: 'Missing or invalid impact confirmation token. Please re-confirm impact.' });
        }

        try {
          const decoded = Buffer.from(impactToken, 'base64url').toString('utf8');
          parsedToken = JSON.parse(decoded);
        } catch (_) {
          return res.status(409).json({ error: 'Malformed impact confirmation token format.' });
        }

        if (!parsedToken || typeof parsedToken !== 'object') {
          return res.status(409).json({ error: 'Invalid impact confirmation token structure.' });
        }

        // Verify cryptographic signature
        const expectedRaw = `${parsedToken.actorUid}:${parsedToken.examId}:${parsedToken.expectedVersion}:${parsedToken.configFingerprint}:${parsedToken.affectedSubjects}:${parsedToken.issuedAt}:${parsedToken.expiresAt}`;
        const recomputedSig = crypto.createHmac('sha256', IMPACT_SECRET).update(expectedRaw).digest('hex');
        if (parsedToken.signature !== recomputedSig) {
          return res.status(409).json({ error: 'Invalid impact confirmation token signature.' });
        }

        // Verify cryptographic bindings
        if (parsedToken.actorUid !== authUser.uid) {
          return res.status(409).json({ error: 'Conflict: Impact token was issued for a different user UID.' });
        }
        if (parsedToken.examId !== examId) {
          return res.status(409).json({ error: 'Conflict: Impact token was issued for a different exam ID.' });
        }
        if (Number(parsedToken.expectedVersion) !== Number(expectedVersion)) {
          return res.status(409).json({ error: 'Conflict: Impact token is stale due to configuration version change.' });
        }
        if (parsedToken.configFingerprint !== configFingerprint) {
          return res.status(409).json({ error: 'Conflict: Impact token is invalid because proposed subject configuration payload changed.' });
        }
        if (parsedToken.affectedSubjects !== affectedSubjects.join(',')) {
          return res.status(409).json({ error: 'Conflict: Impact token affected subjects mismatch.' });
        }
        if (Date.now() > parsedToken.expiresAt) {
          return res.status(409).json({ error: 'Conflict: Impact confirmation token has expired. Please re-confirm impact.' });
        }
      }

      // Execute update inside transaction
      const txnResult: any = await db.runTransaction(async (transaction) => {
        // Idempotency check
        const opRef = db.collection('exam_idempotency_keys').doc(operationId);
        const opSnap = await transaction.get(opRef);
        if (opSnap.exists) {
          const opData = opSnap.data() || {};
          if (opData.createdBy && opData.createdBy !== authUser.uid) {
            return { statusCode: 403, error: 'Forbidden: Operation ID is owned by another authenticated actor.' };
          }
          return {
            statusCode: 200,
            success: true,
            examId: opData.examId || examId,
            configVersion: opData.configVersion || expectedVersion + 1,
            subjectConfigs: opData.subjectConfigs || subjectConfigs,
            idempotentReplay: true
          };
        }

        // Token Replay Prevention Check
        let usedTokenRef: any = null;
        if (hasImpact && parsedToken && parsedToken.signature) {
          usedTokenRef = db.collection('used_impact_tokens').doc(parsedToken.signature);
          const usedTokenSnap: any = await transaction.get(usedTokenRef);
          if (usedTokenSnap.exists) {
            return { statusCode: 409, error: 'Conflict: Impact confirmation token has already been used and cannot be replayed.' };
          }
        }

        const examSnapTxn = await transaction.get(examRef);
        if (!examSnapTxn.exists) {
          return { statusCode: 404, error: 'Parent examination document not found.' };
        }
        const examData = examSnapTxn.data() || {};

        if (examData.status === 'PUBLISHED') {
          return { statusCode: 400, error: 'REJECTED: Cannot update subject configuration for a PUBLISHED examination. Published exams are read-only.' };
        }

        const currentVersion = Number(examData.configVersion || 1);
        if (Number(expectedVersion) !== currentVersion) {
          return {
            statusCode: 409,
            error: `CONFLICT: Configuration version mismatch. Expected version ${expectedVersion}, but current database version is ${currentVersion}. Please reload latest configuration.`
          };
        }

        const newVersion = currentVersion + 1;
        if (usedTokenRef) {
          transaction.set(usedTokenRef, {
            usedBy: authUser.uid,
            examId,
            usedAt: new Date().toISOString()
          });
        }

        transaction.update(examRef, {
          subjectConfigs,
          configVersion: newVersion,
          updatedAt: new Date().toISOString(),
          updatedBy: authUser.uid
        });

        transaction.set(opRef, {
          examId,
          configVersion: newVersion,
          subjectConfigs,
          createdAt: new Date().toISOString(),
          createdBy: authUser.uid
        });

        const auditRef = db.collection('exam_audit_logs').doc();
        transaction.set(auditRef, {
          examId,
          action: 'UPDATE_SUBJECT_CONFIG',
          performedBy: authUser.uid,
          performedAt: new Date().toISOString(),
          details: { previousVersion: currentVersion, newVersion, impactConfirmed: hasImpact }
        });

        return {
          statusCode: 200,
          success: true,
          examId,
          configVersion: newVersion,
          subjectConfigs
        };
      });

      if (txnResult.error) {
        return res.status(txnResult.statusCode || 400).json({ error: txnResult.error });
      }

      return res.status(200).json(txnResult);
    } catch (err: any) {
      console.error('[SECURITY] Error in /api/exams/update-subject-config:', err);
      return res.status(500).json({ error: 'Internal server error while updating subject configuration: ' + err.message });
    }
  });

  // Trusted Endpoint: Terminal Availability & Four-Terminal Lock Status (Authenticated Admin/Teacher)
  app.get('/api/exams/terminal-availability', rateLimiter(60, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;
      if (authUser.role !== 'admin' && authUser.role !== 'teacher') {
        return res.status(403).json({ error: 'Forbidden: Terminal availability is restricted to Administrators and Teachers.' });
      }

      const rawClassQuery = (req.query.className || req.query.class) as string;
      const { academicYear, section } = req.query;
      if (!academicYear || !rawClassQuery) {
        return res.status(400).json({ error: 'Missing required query parameters (academicYear, className).' });
      }

      const parsedYear = parseAndValidateAcademicYear(academicYear as string);
      const normYear = parsedYear || String(academicYear).trim();
      const normClass = normalizeClass(rawClassQuery).trim();
      const rawSec = String(section || '').replace(/^Section\s+/i, '').trim();
      const normSec = (rawSec && rawSec.toLowerCase() !== 'all') ? rawSec.toUpperCase() : 'A';

      if (authUser.role === 'teacher') {
        const canAccess =
          isStrictClassTeacherAuthorized(authUser.userData, normClass, normSec, normYear) ||
          isStrictSubjectTeacherAuthorized(authUser.userData, normClass, normSec, normYear);
        if (!canAccess) {
          return res.status(403).json({ error: 'Forbidden: You are not assigned to this class, section, and academic year.' });
        }
      }

      const db = getAdminDb();
      const terminalIds = CANONICAL_TERMINAL_EXAMS.map(t =>
        buildCanonicalExamId(t.id, normClass, normSec, normYear, { category: 'TERMINAL' })
      );

      const docs = await Promise.all(terminalIds.map(id => db.collection('exams').doc(id).get()));
      const existingExams = docs.filter(d => d.exists).map(d => ({ id: d.id, ...d.data() }));

      // Also check legacy FINAL doc if FINAL_TERMINAL was not found
      const finalTerminalId = buildCanonicalExamId('FINAL_TERMINAL', normClass, normSec, normYear, { category: 'TERMINAL' });
      const hasFinalTerminal = existingExams.some(e => e.id === finalTerminalId);
      if (!hasFinalTerminal) {
        const legacyFinalId = `FINAL_${normClass}_${normSec}_${normYear}`;
        const legacyDoc = await db.collection('exams').doc(legacyFinalId).get();
        if (legacyDoc.exists) {
          existingExams.push({ id: legacyDoc.id, ...legacyDoc.data() });
        }
      }

      const availability = getTerminalAvailability({
        academicYear: normYear,
        className: normClass,
        section: normSec,
        existingExams
      });

      return res.json({ success: true, ...availability });
    } catch (err: any) {
      console.error('[SECURITY] Error in /api/exams/terminal-availability:', err);
      return res.status(500).json({ error: 'Internal server error while checking terminal availability: ' + err.message });
    }
  });

  // Trusted Endpoint: Authorized Eligible Student Roster (Admin or 4D Class/Subject Teacher)
  app.get('/api/exams/authorized-roster', rateLimiter(60, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;
      if (authUser.role !== 'admin' && authUser.role !== 'teacher') {
        return res.status(403).json({ error: 'Forbidden: Student roster access is restricted to Administrators and Teachers.' });
      }

      const rawClassQuery = (req.query.className || req.query.class || '') as string;
      const rawYearQuery = (req.query.academicYear || '') as string;
      const rawSectionQuery = (req.query.section || 'All') as string;
      const subjectQuery = (req.query.subject || '') as string;

      if (!rawClassQuery || !rawYearQuery) {
        return res.status(400).json({ error: 'Missing required query parameters (academicYear, className).' });
      }

      const normYear = parseAndValidateAcademicYear(rawYearQuery) || String(rawYearQuery).trim();
      const normClass = normalizeClass(rawClassQuery).trim();
      const cleanSection = String(rawSectionQuery || 'All').replace(/^Section\s+/i, '').trim() || 'All';

      if (authUser.role === 'teacher') {
        const isClassTeacher = isStrictClassTeacherAuthorized(authUser.userData, normClass, cleanSection, normYear);
        const isSubjectTeacher = isStrictSubjectTeacherAuthorized(authUser.userData, normClass, cleanSection, normYear, subjectQuery || undefined);
        if (!isClassTeacher && !isSubjectTeacher) {
          return res.status(403).json({ error: 'Forbidden: You are not authorized to access the roster for this class, section, and academic year.' });
        }
      }

      const db = getAdminDb();
      const yearPolicy = await resolveAcademicYearPolicy(db, normYear);

      if (yearPolicy.isFuture || yearPolicy.isInactive) {
        return res.json({
          success: true,
          students: [],
          excludedCount: 0,
          academicYearPolicy: yearPolicy
        });
      }

      const [enrollSnap, usersSnap] = await Promise.all([
        db.collection('student_enrollments').get(),
        db.collection('users').where('role', '==', 'student').get()
      ]);

      const rawEnrollments = enrollSnap.docs.map(d => ({ id: d.id, data: d.data() }));
      const rawUsers = usersSnap.docs.map(d => ({ id: d.id, data: d.data() }));

      const eligible = filterEligibleStudentsFromRaw({
        academicYear: normYear,
        currentAcademicYear: yearPolicy.currentAcademicYear,
        className: normClass,
        section: cleanSection,
        enrollmentDocs: rawEnrollments,
        userDocs: rawUsers
      });

      const isAdmin = authUser.role === 'admin';
      const sanitizedStudents = eligible.students.map((s: any) => ({
        studentUid: s.studentUid,
        studentId: s.permanentStudentId || s.studentId || s.studentUid,
        permanentStudentId: s.permanentStudentId || s.studentId || s.studentUid,
        studentEmis: s.studentEmis || '',
        studentName: s.studentName || 'Student',
        rollNo: s.rollNo || '',
        class: normClass,
        section: s.section || cleanSection,
        academicYear: normYear,
        hasComputer: s.hasComputer,
        computer: s.computer,
        active: s.active !== false,
        status: s.status || 'approved',
        ...(isAdmin ? {
          email: s.email || '',
          guardianEmail: s.guardianEmail || '',
          guardianName: s.guardianName || ''
        } : {})
      }));

      return res.json({
        success: true,
        students: sanitizedStudents,
        excludedCount: eligible.excludedStudents?.length || 0,
        academicYearPolicy: yearPolicy
      });
    } catch (err: any) {
      console.error('[SECURITY] Error in /api/exams/authorized-roster:', err);
      return res.status(500).json({ error: 'Internal server error while fetching authorized student roster: ' + err.message });
    }
  });

  // Trusted Endpoint: Examination Progress Monitoring
  app.get('/api/exams/progress-monitoring', rateLimiter(60, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;

      const db = getAdminDb();
      const callerData = authUser.userData;
      const isAdmin = authUser.role === 'admin';
      const isTeacher = authUser.role === 'teacher';

      if (!isAdmin && !isTeacher) {
        return res.status(403).json({ error: 'Forbidden: Progress monitoring is restricted to Administrators and Teachers.' });
      }

      const { academicYear, className, section, category, status } = req.query;

      // 1. Fetch all teachers for subject teacher resolution
      const teachersSnap = await db.collection('users').where('role', '==', 'teacher').get();
      const allTeachers = teachersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 2. Fetch all custom subjects for accurate subject lists
      const customSubjSnap = await db.collection('custom_subjects').get();
      const customSubjectsList: any[] = customSubjSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 3. Query exams
      const examsSnap = await db.collection('exams').get();
      let allExams: any[] = examsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Apply query filters
      if (academicYear) {
        const targetYear = parseAndValidateAcademicYear(academicYear as string) || String(academicYear).trim();
        allExams = allExams.filter((ex: any) => {
          const exYear = parseAndValidateAcademicYear(ex.canonicalAcademicYearId || ex.academicYear || ex.selectedAcademicYear || '');
          return exYear === targetYear;
        });
      }

      if (className) {
        const targetClass = normalizeClass(className as string).trim().toLowerCase();
        allExams = allExams.filter((ex: any) => {
          const exCls = normalizeClass(ex.canonicalClassId || ex.class || ex.selectedClass || '').trim().toLowerCase();
          return exCls === targetClass;
        });
      }

      if (section && String(section).trim().toLowerCase() !== 'all') {
        const targetSec = String(section).trim().toUpperCase();
        allExams = allExams.filter((ex: any) => {
          const exSec = String(ex.canonicalSectionId || ex.section || ex.selectedSection || 'A').trim().toUpperCase();
          return exSec === targetSec;
        });
      }

      if (category) {
        const targetCat = String(category).trim().toUpperCase();
        allExams = allExams.filter((ex: any) => String(ex.category || 'TERMINAL').toUpperCase() === targetCat);
      }

      if (status) {
        const targetStatus = String(status).trim().toUpperCase();
        allExams = allExams.filter((ex: any) => {
          const isPub = Boolean(ex.published === true || ex.status === 'PUBLISHED');
          const st = isPub ? 'PUBLISHED' : String(ex.status || 'DRAFT').toUpperCase();
          return st === targetStatus;
        });
      }

      // If Teacher (not Admin), restrict exams strictly to 4D Class Teacher or 4D Subject Teacher
      if (!isAdmin) {
        allExams = allExams.filter((ex: any) => {
          const exCls = normalizeClass(ex.canonicalClassId || ex.class || ex.selectedClass || '').trim();
          const exSec = String(ex.canonicalSectionId || ex.section || ex.selectedSection || 'A').trim();
          const exYear = parseAndValidateAcademicYear(ex.canonicalAcademicYearId || ex.academicYear || ex.selectedAcademicYear || '') || '';
          if (!exYear) return false;
          return isStrictClassTeacherAuthorized(callerData, exCls, exSec, exYear) ||
            isStrictSubjectTeacherAuthorized(callerData, exCls, exSec, exYear);
        });
      }

      // 4. Cache roster students per year_class_section
      const rosterCache: Record<string, any[]> = {};
      const enrollmentsSnap = await db.collection('student_enrollments').get();
      const rawEnrollments = enrollmentsSnap.docs.map(d => ({ id: d.id, data: d.data() }));

      const usersSnap = await db.collection('users').where('role', '==', 'student').get();
      const rawUsers = usersSnap.docs.map(d => ({ id: d.id, data: d.data() }));

      // 5. Build detailed monitoring records for each examination
      const monitoredExams: any[] = [];

      for (const ex of allExams) {
        const exId = ex.id || ex.examId;
        const exCls = normalizeClass(ex.canonicalClassId || ex.class || ex.selectedClass || '').trim();
        const exSec = String(ex.canonicalSectionId || ex.section || ex.selectedSection || 'A').trim().toUpperCase();
        const exYear = parseAndValidateAcademicYear(ex.canonicalAcademicYearId || ex.academicYear || ex.selectedAcademicYear || '') || '2083';

        // Load roster
        const cacheKey = `${exYear}_${exCls}_${exSec}`;
        if (!rosterCache[cacheKey]) {
          const rosterRes = filterEligibleStudentsFromRaw({
            academicYear: exYear,
            className: exCls,
            section: exSec,
            enrollmentDocs: rawEnrollments,
            userDocs: rawUsers
          });
          rosterCache[cacheKey] = rosterRes.students;
        }
        const enrolledRoster = rosterCache[cacheKey] || [];
        const eligibleCount = enrolledRoster.length;

        // Determine configured subjects
        let subjectsToInspect: string[] = [];
        const subjectConfigsMap: Record<string, any> = {};

        if (Array.isArray(ex.subjectConfigs) && ex.subjectConfigs.length > 0) {
          ex.subjectConfigs.forEach((sc: any) => {
            const sName = sc.subjectName || sc.subjectKey;
            if (sc.enabled !== false && sName) {
              subjectsToInspect.push(sName);
              subjectConfigsMap[sName] = sc;
            }
          });
        }

        if (subjectsToInspect.length === 0) {
          subjectsToInspect = getClassConfiguredSubjects(exCls, customSubjectsList);
          subjectsToInspect.forEach(sName => {
            subjectConfigsMap[sName] = { hasTh: true, hasPr: true, thFullMarks: 75, prFullMarks: 25 };
          });
        }

        // Resolve teachers
        const teacherResolutions = resolveSubjectTeachersForClass(
          exCls,
          subjectsToInspect,
          allTeachers,
          exSec,
          exYear
        );

        // Fetch persisted marks from results collection for this exam
        const examResultsSnap = await db.collection('results').where('examId', '==', exId).get();
        const resultsBySubject: Record<string, Set<string>> = {};
        const lastSavedBySubject: Record<string, string> = {};

        examResultsSnap.forEach(d => {
          const r = d.data();
          const subj = r.subject;
          if (!subj) return;

          // Check if valid entered mark: numeric or 'AB'
          const hasTh = r.thMarks !== null && r.thMarks !== undefined && (typeof r.thMarks === 'number' || r.thMarks === 'AB');
          const hasPr = r.prMarks !== null && r.prMarks !== undefined && (typeof r.prMarks === 'number' || r.prMarks === 'AB');
          const hasTotal = r.marks !== null && r.marks !== undefined && (typeof r.marks === 'number' || r.marks === 'AB');

          if (hasTh || hasPr || hasTotal) {
            const sUid = r.studentUid || r.studentId;
            if (sUid) {
              if (!resultsBySubject[subj]) resultsBySubject[subj] = new Set();
              resultsBySubject[subj].add(sUid);
            }
          }

          if (r.updatedAt || r.createdAt) {
            const curSaved = lastSavedBySubject[subj];
            const recTime = r.updatedAt || r.createdAt;
            if (!curSaved || recTime > curSaved) {
              lastSavedBySubject[subj] = recTime;
            }
          }
        });

        // Compute subject progress and summary metrics
        let unassignedCount = 0;
        let notStartedCount = 0;
        let partiallyFilledCount = 0;
        let marksCompleteCount = 0;
        let submittedCount = 0;
        let correctionRequestedCount = 0;
        let approvedCount = 0;

        const subjectProgressItems: any[] = [];

        let totalEnteredMarks = 0;
        for (const subj of subjectsToInspect) {
          const resolution = teacherResolutions[subj];
          const isUnassigned = resolution?.status === 'UNASSIGNED';
          if (isUnassigned) unassignedCount++;

          const enteredUids = resultsBySubject[subj] || new Set();
          const enteredCount = enteredUids.size;
          totalEnteredMarks += enteredCount;
          const progressPercent = eligibleCount > 0 ? Math.min(100, Math.round((enteredCount / eligibleCount) * 100)) : 0;
          const lastSaved = ex.subjectStatus?.[subj]?.lastSavedAt || lastSavedBySubject[subj] || null;

          // Derive workflow status
          let subjStatus: string = 'NOT_STARTED';
          const correction = ex.correctionsRequested?.[subj];
          const explicitStatus = ex.subjectStatus?.[subj]?.status;

          if (isUnassigned) {
            subjStatus = 'UNASSIGNED';
          } else if (correction && !correction.resolved) {
            subjStatus = 'CORRECTION_REQUESTED';
            correctionRequestedCount++;
          } else if (explicitStatus === 'APPROVED') {
            subjStatus = 'APPROVED';
            approvedCount++;
          } else if (explicitStatus === 'SUBMITTED') {
            subjStatus = 'SUBMITTED';
            submittedCount++;
          } else if (eligibleCount > 0 && enteredCount >= eligibleCount) {
            subjStatus = 'MARKS_COMPLETE';
            marksCompleteCount++;
          } else if (enteredCount > 0) {
            subjStatus = 'PARTIALLY_FILLED';
            partiallyFilledCount++;
          } else {
            subjStatus = 'NOT_STARTED';
            notStartedCount++;
          }

          const assignedTeacherName = resolution?.status === 'ASSIGNED' ? resolution.teacherName : 'Unassigned';

          subjectProgressItems.push({
            subject: subj,
            subjectKey: subj,
            subjectName: subj,
            assignedTeacher: resolution?.status === 'ASSIGNED' ? resolution.teacherName : 'UNASSIGNED',
            assignedTeacherName,
            isUnassigned,
            eligibleStudentsCount: eligibleCount,
            enteredStudentsCount: enteredCount,
            progressPercentage: progressPercent,
            completionPercent: progressPercent,
            status: subjStatus,
            workflowStatus: subjStatus,
            lastSavedAt: lastSaved
          });
        }

        const totalSlots = eligibleCount * subjectsToInspect.length;
        const overallPercent = totalSlots > 0 ? Math.min(100, Math.round((totalEnteredMarks / totalSlots) * 100)) : 0;
        const isPub = Boolean(ex.published === true || ex.status === 'PUBLISHED');
        const parentStatus = isPub ? 'PUBLISHED' : (ex.status || 'DRAFT');
        const resolvedExamName = String(ex.name || ex.type || ex.terminalExamType || ex.testDisplayName || exId).trim();

        monitoredExams.push({
          id: exId,
          examId: exId,
          name: resolvedExamName,
          examName: resolvedExamName,
          examType: String(ex.type || resolvedExamName).trim(),
          academicYear: exYear,
          category: ex.category || 'TERMINAL',
          terminalExamType: ex.terminalExamType || null,
          testDisplayName: ex.testDisplayName || null,
          class: exCls,
          section: exSec,
          status: parentStatus,
          published: isPub,
          publishedAt: ex.publishedAt || null,
          createdAt: ex.createdAt || null,
          updatedAt: ex.updatedAt || null,
          subjectCount: subjectsToInspect.length,
          eligibleStudentsCount: eligibleCount,
          totalEligibleStudents: eligibleCount,
          totalEnteredMarks,
          totalSlots,
          overallPercent,
          progressSummary: {
            totalConfiguredSubjects: subjectsToInspect.length,
            unassignedSubjectsCount: unassignedCount,
            notStartedCount,
            partiallyFilledCount,
            marksCompleteCount,
            submittedCount,
            correctionRequestedCount,
            approvedCount
          },
          subjectProgress: subjectProgressItems,
          subjects: subjectProgressItems
        });
      }

      // Sort exams descending by createdAt / id
      monitoredExams.sort((a, b) => {
        const tA = a.createdAt || '';
        const tB = b.createdAt || '';
        if (tA && tB) return tB.localeCompare(tA);
        return b.id.localeCompare(a.id);
      });

      return res.json({
        success: true,
        totalExaminations: monitoredExams.length,
        examinations: monitoredExams
      });
    } catch (err: any) {
      if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED') || err?.message?.includes('Missing or insufficient permissions')) {
        console.warn(`[SECURITY] Progress monitoring denied by Firestore IAM for project ${firebaseConfig.projectId}. Service account requires Cloud Datastore User role.`);
        return res.status(403).json({ error: 'Permission denied accessing Firestore database. Service account IAM role grant required.' });
      }
      console.error('[SECURITY] Error in /api/exams/progress-monitoring:', err);
      return res.status(500).json({ error: 'Internal server error while retrieving progress monitoring: ' + err.message });
    }
  });

  // Delete Draft / Unpublished Initialized Examination (Primary Admin ONLY; Published Exams Blocked)
  app.post('/api/exams/delete-draft', rateLimiter(20, 60000), async (req: Request, res: Response) => {
    try {
      const adminUser = await requireAdminAuth(req, res);
      if (!adminUser) return;

      if (adminUser.adminTier !== 'primary') {
        return res.status(403).json({
          error: 'Forbidden: Only Primary Admin (1° Admin) can delete initialized draft examinations.'
        });
      }

      const { examId, reason } = req.body || {};
      const cleanExamId = String(examId || '').trim();
      if (!cleanExamId) {
        return res.status(400).json({ error: 'Missing required parameter: examId.' });
      }

      const db = getAdminDb();
      const examRef = db.collection('exams').doc(cleanExamId);
      const examSnap = await examRef.get();
      if (!examSnap.exists) {
        return res.status(404).json({ error: 'Examination draft not found.' });
      }

      const examData = examSnap.data() || {};
      if (examData.published === true || String(examData.status || '').toUpperCase() === 'PUBLISHED') {
        return res.status(409).json({
          error: 'Published examinations cannot be deleted as drafts. Unpublish first or use Manage Results.'
        });
      }

      // Collect unpublished draft result rows and concurrency version docs tied to this examId
      const [resultsSnap, versionsSnap] = await Promise.all([
        db.collection('results').where('examId', '==', cleanExamId).get(),
        db.collection('student_subject_versions').where('examId', '==', cleanExamId).get()
      ]);

      const refsToDelete: FirebaseFirestore.DocumentReference[] = [];
      let publishedResultConflict = false;
      resultsSnap.forEach((docSnap) => {
        const rd = docSnap.data() || {};
        if (rd.published === true) {
          publishedResultConflict = true;
          return;
        }
        refsToDelete.push(docSnap.ref);
      });

      if (publishedResultConflict) {
        return res.status(409).json({
          error: 'Cannot delete draft: one or more result records for this exam are already marked published.'
        });
      }

      versionsSnap.forEach((docSnap) => {
        refsToDelete.push(docSnap.ref);
      });
      refsToDelete.push(examRef);

      const BATCH_LIMIT = 400;
      for (let i = 0; i < refsToDelete.length; i += BATCH_LIMIT) {
        const batch = db.batch();
        const chunk = refsToDelete.slice(i, i + BATCH_LIMIT);
        chunk.forEach((ref) => batch.delete(ref));
        await batch.commit();
      }

      const cleanReason = String(reason || '').trim() || 'Primary Admin cleaned up unpublished draft examination.';
      await recordServerAuditLog({
        actorUid: adminUser.uid,
        actorEmail: adminUser.email,
        actorName: adminUser.userData?.fullName || adminUser.userData?.name || 'Primary Admin',
        actorRole: 'admin',
        adminTier: adminUser.adminTier,
        targetUid: cleanExamId,
        action: 'EXAM_DRAFT_DELETED',
        result: 'SUCCESS',
        reason: `${cleanReason} (Exam: ${examData.name || cleanExamId}, Class ${examData.class || '-'}-${examData.section || 'A'}, Year ${examData.academicYear || '-'}, removed ${resultsSnap.size} draft mark rows)`
      });

      return res.json({
        success: true,
        examId: cleanExamId,
        deletedDraftResultRows: resultsSnap.size,
        deletedVersionRows: versionsSnap.size,
        message: `Draft examination "${examData.name || cleanExamId}" deleted cleanly.`
      });
    } catch (err: any) {
      console.error('[SECURITY] Error in /api/exams/delete-draft:', err);
      return res.status(500).json({ error: 'Failed to delete draft examination: ' + err.message });
    }
  });

  // Trusted Result Save Endpoint
  app.post('/api/results/save-marks', rateLimiter(60, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;

      const {
        operationId,
        examId,
        selectedClass,
        selectedSection,
        selectedAcademicYear,
        subjectToSave,
        subjectKey,
        customSubjectId,
        correctionReason,
        students,
        expectedVersion,
        forceOverwrite,
        forceOverwriteConfirmed,
        workflowMode: rawWorkflowMode,
        totalEligibleCount
      } = req.body;

      if (!operationId || typeof operationId !== 'string' || !operationId.trim()) {
        return res.status(400).json({ error: 'Missing required operationId parameter for idempotency.' });
      }
      if (!examId || !selectedClass || !subjectToSave || !Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ error: 'Missing required parameters (examId, selectedClass, subjectToSave, students array).' });
      }
      if (students.length > 100) {
        return res.status(400).json({ error: 'Payload exceeds maximum allowed limit of 100 students per transaction.' });
      }

      const requestedWorkflowMode: 'STANDALONE' | 'CONNECTED' | null =
        rawWorkflowMode === 'STANDALONE' || rawWorkflowMode === 'CONNECTED' ? rawWorkflowMode : null;

      // Enforce Owner Policy #4: Force Overwrite requires explicit confirmation + audit reason
      if (forceOverwrite === true) {
        const cleanOverwriteReason = String(correctionReason || '').trim();
        if (forceOverwriteConfirmed !== true || cleanOverwriteReason.length < 5) {
          return res.status(400).json({
            error: 'Force overwrite requires explicit confirmation (forceOverwriteConfirmed: true) and a clear audit reason (minimum 5 characters).'
          });
        }
      }

      // Check duplicate student UIDs
      const studentUids = students.map((s: any) => s.studentUid || s.uid).filter(Boolean);
      if (studentUids.length !== students.length || new Set(studentUids).size !== studentUids.length) {
        return res.status(400).json({ error: 'Duplicate or missing student UIDs in save request payload.' });
      }

      // Calculate SHA-256 fingerprint for idempotency validation
      const normClass = String(selectedClass).replace(/^Class\s+/i, '').trim().toLowerCase();
      const normSec = String(selectedSection || 'All').trim().toLowerCase();
      const normYr = String(selectedAcademicYear || '').trim();
      const normSubj = String(subjectToSave).trim().toLowerCase();
      const normKey = String(subjectKey || subjectToSave.replace(/[^a-zA-Z0-9_.-]/g, '')).toLowerCase();

      const normalizedStudents = students.map((s: any) => {
        const uid = s.studentUid || s.uid;
        const th = s.subjectMarksTH?.[subjectToSave];
        const pr = s.subjectMarksPR?.[subjectToSave];
        const isThAbs = Boolean(s.subjectAbsentsTH?.[subjectToSave]);
        const isPrAbs = Boolean(s.subjectAbsentsPR?.[subjectToSave]);
        return {
          uid,
          th: th !== undefined && th !== '' && th !== null ? String(th).trim() : null,
          pr: pr !== undefined && pr !== '' && pr !== null ? String(pr).trim() : null,
          isThAbs,
          isPrAbs
        };
      }).sort((a: any, b: any) => a.uid.localeCompare(b.uid));

      const canonicalPayload = {
        actorUid: authUser.uid,
        examId,
        workflowMode: requestedWorkflowMode,
        class: normClass,
        section: normSec,
        academicYear: normYr,
        subjectToSave: normSubj,
        subjectKey: normKey,
        customSubjectId: customSubjectId || null,
        reason: String(correctionReason || '').trim(),
        students: normalizedStudents
      };

      // Authoritative Role & 4D Class/Subject Teacher Authorization Check (MUST run before any DB/version reads!)
      const callerData = authUser.userData;
      const callerRole = authUser.role;

      if (callerRole !== 'admin' && callerRole !== 'teacher') {
        return res.status(403).json({ error: 'Forbidden: Only Administrators and authorized Teachers can save marks.' });
      }

      const rawNormClass = normalizeClass(String(selectedClass)).trim();
      const rawNormSection = (selectedSection || 'All').trim();
      const cleanCanonicalSection = getCanonicalSection(selectedSection);
      const rawNormYear = parseAndValidateAcademicYear(selectedAcademicYear || '') || String(selectedAcademicYear || '').trim();

      if (rawNormYear) {
        const yearPolicy = await resolveAcademicYearPolicy(getAdminDb(), rawNormYear);
        if (!yearPolicy.canMutate) {
          return res.status(403).json({
            error: yearPolicy.blockReason || `Academic Year ${rawNormYear} BS is not active.`,
            code: 'ACADEMIC_YEAR_NOT_ACTIVE',
            currentAcademicYear: yearPolicy.currentAcademicYear,
            currentAcademicYearTitle: yearPolicy.currentAcademicYearTitle
          });
        }
      }

      if (callerRole !== 'admin') {
        const isClassTeacher = isStrictClassTeacherAuthorized(callerData, rawNormClass, cleanCanonicalSection, rawNormYear);
        const isSubjectTeacher =
          isStrictSubjectTeacherAuthorized(callerData, rawNormClass, cleanCanonicalSection, rawNormYear, subjectToSave) ||
          isStrictSubjectTeacherAuthorized(callerData, rawNormClass, cleanCanonicalSection, rawNormYear, subjectKey || normKey);

        if (!isClassTeacher && !isSubjectTeacher) {
          return res.status(403).json({ error: 'Forbidden: You are not authorized to save marks for this class, section, academic year, and subject.' });
        }
      }

      const currentFingerprint = crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');

      const db = getAdminDb();

      const txnResult: any = await db.runTransaction(async (transaction) => {
        // ============================================================
        // READ PHASE — ALL transaction.get() CALLS MUST OCCUR HERE
        // ============================================================

        // Read 1: Idempotency Record
        const opRef = db.collection('processed_operations').doc(operationId);
        const opSnap = await transaction.get(opRef);

        if (opSnap.exists) {
          const opData = opSnap.data() || {};
          if (opData.actorUid !== authUser.uid) {
            return { statusCode: 403, error: 'Forbidden: Operation ID is owned by another authenticated actor.' };
          }
          if (opData.requestFingerprint !== currentFingerprint) {
            return { statusCode: 409, error: 'Conflict: Operation ID was previously committed with a different request payload.' };
          }
          return {
            statusCode: 200,
            data: {
              success: true,
              savedCount: opData.savedCount,
              examStatus: opData.examStatus,
              subjectWorkflowStatus: opData.subjectWorkflowStatus || 'PARTIALLY_FILLED',
              updatedVersions: opData.updatedVersions || {},
              idempotentReplay: true
            }
          };
        }

        // Read 1.5: Record-Level Student-Subject Versions for Optimistic Concurrency Control
        const recordConflicts: any[] = [];
        const recordVersionMap = new Map<string, { ref: FirebaseFirestore.DocumentReference; currentVersion: number }>();

        for (const std of students) {
          const studentUid = std.studentUid || std.uid;
          const canonicalTuple = JSON.stringify([examId, studentUid, normKey]);
          const versionDocKey = crypto.createHash('sha256').update(canonicalTuple).digest('hex');
          const verRef = db.collection('student_subject_versions').doc(versionDocKey);
          const verSnap = await transaction.get(verRef);

          let currentVersion = 0;
          if (verSnap.exists) {
            currentVersion = verSnap.data()?.version || 0;
          } else {
            const subDocId = `${examId}_${studentUid}_${subjectKey || normKey}`;
            const secureRef = db.collection('results_secure').doc(studentUid).collection('records').doc(subDocId);
            const secureSnap = await transaction.get(secureRef);
            const hasExistingMarks = secureSnap.exists && (secureSnap.data()?.marks !== undefined || secureSnap.data()?.thMarks !== undefined);
            currentVersion = hasExistingMarks ? 1 : 0;
          }

          recordVersionMap.set(studentUid, { ref: verRef, currentVersion });

          const clientExpectedVersion = std.expectedVersion !== undefined ? Number(std.expectedVersion) : (expectedVersion !== undefined ? Number(expectedVersion) : currentVersion);
          const isInitialVersionBootstrap = !verSnap.exists && (clientExpectedVersion === 0 || clientExpectedVersion === 1);

          if (!forceOverwrite && !isInitialVersionBootstrap && clientExpectedVersion !== currentVersion && currentVersion > 0) {
            recordConflicts.push({
              studentUid,
              serverVersion: currentVersion,
              clientVersion: clientExpectedVersion
            });
          }
        }

        if (recordConflicts.length > 0) {
          return {
            statusCode: 409,
            error: `Conflict: Marks for one or more students in ${subjectToSave} have been modified by another user.`,
            conflicts: recordConflicts
          };
        }

        // Read 3: Parent Exam (Auto-create deferred to WRITE phase — NEVER write during read phase!)
        let examRef = db.collection('exams').doc(examId);
        let examSnap = await transaction.get(examRef);

        if (!examSnap.exists && examId.startsWith('FINAL_TERMINAL_')) {
          const legacyFinalId = examId.replace(/^FINAL_TERMINAL_/, 'FINAL_');
          const legacySnap = await transaction.get(db.collection('exams').doc(legacyFinalId));
          if (legacySnap.exists) {
            examRef = db.collection('exams').doc(legacyFinalId);
            examSnap = legacySnap;
          }
        }

        let currentExamStatus = 'DRAFT';
        let examData: any = examSnap.exists ? (examSnap.data() || {}) : null;
        let autoExamDataToCreate: any = null;

        if (!examSnap.exists) {
          // Connected workflow requires explicit initialization via SharedExamSetup; Standalone may auto-create its draft
          if (requestedWorkflowMode === 'CONNECTED') {
            return {
              statusCode: 404,
              error: 'Connected examination has not been initialized yet. Please initialize it through Examination Management (SharedExamSetup) first.'
            };
          }

          // Check four-terminal publication lock before auto-initialization
          let publishedTerminalsCount = 0;
          for (const t of CANONICAL_TERMINAL_EXAMS) {
            const tId = buildCanonicalExamId(t.id, rawNormClass, cleanCanonicalSection, rawNormYear, { category: 'TERMINAL' });
            let tDocSnap = await transaction.get(db.collection('exams').doc(tId));
            if (!tDocSnap.exists && t.id === 'FINAL_TERMINAL') {
              const legacyTId = `FINAL_${rawNormClass}_${cleanCanonicalSection}_${rawNormYear}`;
              const legSnap = await transaction.get(db.collection('exams').doc(legacyTId));
              if (legSnap.exists) tDocSnap = legSnap;
            }
            if (tDocSnap.exists) {
              const td = tDocSnap.data() || {};
              if (td.published === true || td.status === 'PUBLISHED') {
                publishedTerminalsCount++;
              }
            }
          }
          if (publishedTerminalsCount >= 4) {
            return {
              statusCode: 409,
              error: `All four Terminal examinations have already been published for Class ${rawNormClass} Section ${cleanCanonicalSection} in Academic Year ${rawNormYear}. Cannot create or update examination.`
            };
          }

          const isTestExam = examId.toUpperCase().startsWith('TEST_');
          const normTermType = isTestExam ? null : (normalizeTerminalExamType(examId) || 'FIRST_TERMINAL');
          const displayTitle = isTestExam
            ? examId.replace(/^TEST_/i, '').replace(/_/g, ' ')
            : (CANONICAL_TERMINAL_EXAMS.find(t => t.id === normTermType)?.name || 'Terminal Examination');

          autoExamDataToCreate = {
            id: examId,
            examId,
            workflowMode: requestedWorkflowMode || 'STANDALONE',
            name: displayTitle,
            type: normTermType || 'TEST',
            terminalExamType: normTermType,
            category: isTestExam ? 'TEST' : 'TERMINAL',
            class: rawNormClass,
            canonicalClassId: rawNormClass,
            section: cleanCanonicalSection,
            canonicalSectionId: cleanCanonicalSection,
            academicYear: rawNormYear,
            canonicalAcademicYearId: rawNormYear,
            published: false,
            status: 'DRAFT',
            createdAt: new Date().toISOString(),
            createdByUid: authUser.uid,
            subjectStatus: {}
          };
          currentExamStatus = 'DRAFT';
        } else {
          examData = examSnap.data() || {};
          if (examData.published === true || examData.status === 'PUBLISHED') {
            return { statusCode: 400, error: 'Cannot update published exam. Published results are immutable.' };
          }
          if (examData.status === 'APPROVED' && callerRole !== 'admin') {
            return { statusCode: 403, error: 'Cannot modify marks after examination has been approved by Admin.' };
          }
          // Enforce strict workflow mode isolation (Standalone vs Connected cannot be silently mixed)
          if (examData.workflowMode && requestedWorkflowMode && examData.workflowMode !== requestedWorkflowMode) {
            return {
              statusCode: 409,
              error: `Workflow Mode Conflict: This examination is configured for ${examData.workflowMode} mode and cannot be overwritten from ${requestedWorkflowMode} mode.`
            };
          }
          const existingSubjStatus = examData?.subjectStatus?.[subjectToSave]?.status;
          if (existingSubjStatus === 'APPROVED' && callerRole !== 'admin') {
            return {
              statusCode: 403,
              error: `Subject "${subjectToSave}" has already been approved by Admin. Request Admin correction before editing.`
            };
          }
          currentExamStatus = examData.status || 'DRAFT';
        }

        // Read 4: Custom Subject & Configuration Authority
        let customSubDoc: any = null;
        if (customSubjectId) {
          const csubRef = db.collection('custom_subjects').doc(customSubjectId);
          const csubSnap = await transaction.get(csubRef);
          if (!csubSnap.exists || csubSnap.data()?.status !== 'ACTIVE') {
            return { statusCode: 400, error: 'Custom subject is invalid, not found, or inactive.' };
          }
          customSubDoc = csubSnap.data() || {};
        }

        // Read 5: Existing Student Result Documents
        const existingDocMap = new Map<string, any>();
        for (const std of students) {
          const studentUid = std.studentUid || std.uid;
          const subDocId = `${examId}_${studentUid}_${subjectKey || subjectToSave.replace(/\s+/g, '')}`;
          const secureRef = db.collection('results_secure').doc(studentUid).collection('records').doc(subDocId);
          const secureSnap = await transaction.get(secureRef);
          if (secureSnap.exists) {
            existingDocMap.set(studentUid, secureSnap.data());
          }
        }

        // ============================================================
        // IN-MEMORY RESOLUTION & CANONICAL NEPAL CDC VALIDATION PHASE
        // ============================================================
        let configuredSubjectItem: any = null;
        if (examData && Array.isArray(examData.subjectConfigs)) {
          configuredSubjectItem = examData.subjectConfigs.find((sc: any) => {
            const scName = String(sc?.subjectName || '').trim().toLowerCase();
            const scKey = String(sc?.subjectKey || '').trim().toLowerCase();
            return scName === normSubj || scKey === normKey || scKey === normSubj;
          });
        }

        let historicalSnapshot: { thFull: number; prFull: number; thPass: number; prPass: number; hasTh: boolean; hasPr: boolean } | null = null;
        for (const existingDoc of existingDocMap.values()) {
          if (existingDoc && typeof existingDoc.thFull === 'number' && typeof existingDoc.prFull === 'number') {
            historicalSnapshot = {
              thFull: existingDoc.thFull,
              prFull: existingDoc.prFull,
              hasTh: existingDoc.thFull > 0,
              hasPr: existingDoc.prFull > 0,
              thPass: typeof existingDoc.thPass === 'number' ? existingDoc.thPass : Math.ceil(existingDoc.thFull * 0.35),
              prPass: typeof existingDoc.prPass === 'number' ? existingDoc.prPass : Math.ceil(existingDoc.prFull * 0.35)
            };
            break;
          }
        }

        let thFull = 75;
        let prFull = 25;
        let thPass = 27;
        let prPass = 9;
        let hasTh = true;
        let hasPr = true;

        if (configuredSubjectItem) {
          hasTh = configuredSubjectItem.hasTh !== false && Number(configuredSubjectItem.thFullMarks ?? configuredSubjectItem.theoryFullMarks ?? 75) > 0;
          hasPr = configuredSubjectItem.hasPr === true && Number(configuredSubjectItem.prFullMarks ?? configuredSubjectItem.practicalFullMarks ?? 0) > 0;
          thFull = hasTh ? Number(configuredSubjectItem.thFullMarks ?? configuredSubjectItem.theoryFullMarks ?? 75) : 0;
          prFull = hasPr ? Number(configuredSubjectItem.prFullMarks ?? configuredSubjectItem.practicalFullMarks ?? 25) : 0;
          thPass = hasTh ? Number(configuredSubjectItem.thPassMarks ?? configuredSubjectItem.theoryPassMarks ?? Math.ceil(thFull * 0.35)) : 0;
          prPass = hasPr ? Number(configuredSubjectItem.prPassMarks ?? configuredSubjectItem.practicalPassMarks ?? Math.ceil(prFull * 0.35)) : 0;
        } else if (historicalSnapshot) {
          hasTh = historicalSnapshot.hasTh;
          hasPr = historicalSnapshot.hasPr;
          thFull = historicalSnapshot.thFull;
          prFull = historicalSnapshot.prFull;
          thPass = historicalSnapshot.thPass;
          prPass = historicalSnapshot.prPass;
        } else if (customSubDoc) {
          const customNameNorm = String(customSubDoc.name || '').trim().toLowerCase();
          const customNormName = String(customSubDoc.normalizedName || '').trim().toLowerCase();
          if (customNameNorm !== normSubj && customNormName !== normSubj && customSubDoc.id !== customSubjectId) {
            return { statusCode: 400, error: 'Subject identity mismatch: Given subject does not match custom subject definition.' };
          }
          const targetClassNorm = String(customSubDoc.targetClass || 'All').replace(/^Class\s+/i, '').trim().toLowerCase();
          if (targetClassNorm !== 'all' && targetClassNorm !== rawNormClass.toLowerCase()) {
            return { statusCode: 400, error: `Custom subject "${customSubDoc.name}" is not applicable to Class ${rawNormClass}.` };
          }
          hasTh = customSubDoc.hasTh !== false && (typeof customSubDoc.thFullMarks === 'number' ? customSubDoc.thFullMarks > 0 : true);
          hasPr = customSubDoc.hasPr === true && typeof customSubDoc.prFullMarks === 'number' && customSubDoc.prFullMarks > 0;
          thFull = hasTh ? (typeof customSubDoc.thFullMarks === 'number' ? customSubDoc.thFullMarks : 75) : 0;
          prFull = hasPr ? (typeof customSubDoc.prFullMarks === 'number' ? customSubDoc.prFullMarks : 25) : 0;
          thPass = hasTh ? (typeof customSubDoc.thPassMarks === 'number' ? customSubDoc.thPassMarks : Math.ceil(thFull * 0.35)) : 0;
          prPass = hasPr ? (typeof customSubDoc.prPassMarks === 'number' ? customSubDoc.prPassMarks : Math.ceil(prFull * 0.35)) : 0;
        } else {
          // Standard Curriculum Subject Verification (Play Group – Grade 10 only)
          const CLASS_CURRICULUM: Record<string, string[]> = {
            'play group': ['English', 'Nepali', 'Mathematics', 'Drawing', 'Rhymes'],
            'pg': ['English', 'Nepali', 'Mathematics', 'Drawing', 'Rhymes'],
            'nursery': ['English', 'Nepali', 'Mathematics', 'Drawing', 'Rhymes'],
            'lkg': ['English', 'Nepali', 'Mathematics', 'Drawing', 'Rhymes'],
            'ukg': ['English', 'Nepali', 'Mathematics', 'Drawing', 'Rhymes'],
            '1': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK'],
            '2': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK'],
            '3': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK'],
            '4': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK', 'Moral Science'],
            '5': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK', 'Moral Science'],
            '6': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK', 'Moral Science', 'Opt. Math'],
            '7': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK', 'Moral Science', 'Opt. Math'],
            '8': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Computer', 'GK', 'Moral Science', 'Opt. Math', 'HPE'],
            '9': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Opt. Math', 'Computer', 'HPE'],
            '10': ['English', 'Nepali', 'Mathematics', 'Science', 'Social Studies', 'Opt. Math', 'Computer', 'HPE']
          };

          const CANONICAL_KEYS: Record<string, string> = {
            'mathematics': 'Mathematics',
            'math': 'Mathematics',
            'science': 'Science',
            'english': 'English',
            'nepali': 'Nepali',
            'social studies': 'SocialStudies',
            'social': 'SocialStudies',
            'computer': 'Computer',
            'hpe': 'HPE',
            'opt. math': 'Opt.Math',
            'opt math': 'Opt.Math',
            'opt.math': 'Opt.Math',
            'opt ii': 'Computer',
            'moral science': 'MoralScience',
            'gk': 'GK',
            'general knowledge': 'GK',
            'drawing': 'Drawing',
            'rhymes': 'Rhymes'
          };

          const validSubjects = CLASS_CURRICULUM[rawNormClass.toLowerCase()];
          if (!validSubjects) {
            return { statusCode: 400, error: `Unresolved or invalid curriculum configuration for class "${rawNormClass}". Only Play Group through Grade 10 are permitted.` };
          }
          const canonKey = CANONICAL_KEYS[normSubj];
          const isMatch = validSubjects.some(s =>
            s.toLowerCase() === normSubj || (canonKey && CANONICAL_KEYS[s.toLowerCase()] === canonKey)
          );
          if (!isMatch) {
            return { statusCode: 400, error: `Subject "${subjectToSave}" is not in the authoritative curriculum for Class ${rawNormClass}.` };
          }
          // Default 75/25 with 35% Nepal CDC pass marks (27 & 9)
          hasTh = true;
          hasPr = true;
          thFull = 75;
          prFull = 25;
          thPass = 27;
          prPass = 9;
        }

        let requiresCorrectionReason = false;
        const studentWritePayloads: any[] = [];
        const auditLogPayloads: any[] = [];
        let savedCount = 0;
        let completeStudentsInBatch = 0;

        for (const std of students) {
          const studentUid = std.studentUid || std.uid;
          const thMark = std.subjectMarksTH?.[subjectToSave];
          const prMark = std.subjectMarksPR?.[subjectToSave];
          const isThAbs = Boolean(std.subjectAbsentsTH?.[subjectToSave]);
          const isPrAbs = Boolean(std.subjectAbsentsPR?.[subjectToSave]);

          // Canonical 5-state validation shared identically with Frontend
          const thVal = validateMarkValue(thMark, thFull, isThAbs, hasTh);
          if (!thVal.valid) {
            return { statusCode: 400, error: `Student ${studentUid} (${subjectToSave} Theory): ${thVal.error}` };
          }
          const prVal = validateMarkValue(prMark, prFull, isPrAbs, hasPr);
          if (!prVal.valid) {
            return { statusCode: 400, error: `Student ${studentUid} (${subjectToSave} Practical): ${prVal.error}` };
          }

          const subDocId = `${examId}_${studentUid}_${subjectKey || subjectToSave.replace(/\s+/g, '')}`;
          const existingRecord = existingDocMap.get(studentUid);
          const hasExistingRecord = Boolean(existingRecord && (existingRecord.marks !== undefined || existingRecord.thMarks !== undefined));

          const thEntered = !hasTh || thVal.kind === 'NUMBER' || thVal.kind === 'AB';
          const prEntered = !hasPr || prVal.kind === 'NUMBER' || prVal.kind === 'AB';
          if (thEntered && prEntered) {
            completeStudentsInBatch++;
          }

          // Preserve missing marks distinct from zero: if both are missing and no existing record, skip write
          if (thVal.kind === 'MISSING' && (prVal.kind === 'MISSING' || prVal.kind === 'NOT_APPLICABLE') && !hasExistingRecord) {
            continue;
          }

          const numTh: number | 'AB' | null = thVal.value;
          const numPr: number | 'AB' | null = hasPr ? prVal.value : null;

          // Authoritative Nepal CDC subject grade calculation
          const graded = calculateSubjectResult(
            subjectKey || subjectToSave.replace(/\s+/g, ''),
            subjectToSave,
            {
              theoryMarks: numTh,
              practicalMarks: numPr,
              isAbsentTheory: numTh === 'AB',
              isAbsentPractical: numPr === 'AB'
            },
            {
              hasTh,
              hasPr,
              thFullMarks: thFull,
              thPassMarks: thPass,
              prFullMarks: prFull,
              prPassMarks: prPass
            }
          );

          const obtainedTotal: number | 'AB' | null =
            graded.isIncomplete
              ? null
              : (numTh === 'AB' && (!hasPr || numPr === 'AB') ? 'AB' : graded.totalObtainedMarks);

          let isCorrection = false;
          if (hasExistingRecord) {
            const prevTh = existingRecord.thMarks ?? null;
            const prevPr = existingRecord.prMarks ?? null;
            const prevTotal = existingRecord.marks ?? null;

            if (prevTh !== numTh || prevPr !== numPr || prevTotal !== obtainedTotal) {
              isCorrection = true;
              requiresCorrectionReason = true;
            }
          }

          const resultPayload = {
            studentUid,
            studentId: std.studentId || std.permanentStudentId || '',
            permanentStudentId: std.permanentStudentId || std.studentId || '',
            studentEmis: std.studentEmis || '',
            examId,
            workflowMode: examData?.workflowMode || requestedWorkflowMode || 'STANDALONE',
            subject: subjectToSave,
            subjectKey: subjectKey || subjectToSave.replace(/\s+/g, ''),
            customSubjectId: customSubjectId || null,
            marks: obtainedTotal,
            fullMarks: thFull + prFull,
            thMarks: numTh,
            prMarks: numPr,
            hasTh,
            hasPr,
            thFull,
            prFull,
            thPass,
            prPass,
            theoryGrade: graded.theoryGrade,
            practicalGrade: graded.practicalGrade,
            subjectGrade: graded.subjectGrade,
            subjectGradePoint: graded.subjectGradePoint,
            isNg: graded.isNg,
            isIncomplete: graded.isIncomplete,
            failureReasons: graded.failureReasons,
            class: rawNormClass,
            section: cleanCanonicalSection,
            academicYear: rawNormYear,
            rollNo: std.rollNo || '',
            published: false,
            updatedAt: new Date().toISOString()
          };

          studentWritePayloads.push({
            studentUid,
            subDocId,
            resultPayload,
            studentName: std.studentName || ''
          });

          const actionType = forceOverwrite ? 'FORCE_OVERWRITE' : (isCorrection ? 'MARK_CORRECTION' : 'MARK_ENTRY');
          const now = new Date();
          const auditDocId = `AUDIT_${operationId}_${studentUid}_${subjectKey || subjectToSave.replace(/\s+/g, '')}`;

          const prevThStr = existingRecord ? (existingRecord.thMarks !== undefined && existingRecord.thMarks !== null ? String(existingRecord.thMarks) : 'MISSING') : 'N/A';
          const prevPrStr = existingRecord ? (existingRecord.prMarks !== undefined && existingRecord.prMarks !== null ? String(existingRecord.prMarks) : (hasPr ? 'MISSING' : 'N/A')) : 'N/A';
          const prevTotStr = existingRecord ? (existingRecord.marks !== undefined && existingRecord.marks !== null ? String(existingRecord.marks) : 'MISSING') : 'N/A';
          const prevSummary = existingRecord ? `TH: ${prevThStr}, PR: ${prevPrStr} (Total: ${prevTotStr})` : 'N/A';
          const newSummary = `TH: ${numTh ?? 'MISSING'}, PR: ${hasPr ? (numPr ?? 'MISSING') : 'N/A'} (Total: ${obtainedTotal ?? 'MISSING'}, Grade: ${graded.subjectGrade})`;

          const actorName = callerData.fullName || callerData.name || authUser.email || 'Teacher';

          const auditPayload = {
            id: auditDocId,
            auditLogId: auditDocId,
            operationId,
            actionType,
            action: actionType,
            category: 'academic',
            targetType: 'result',
            targetId: subDocId,
            studentUid,
            studentId: std.studentId || std.permanentStudentId || '',
            studentName: std.studentName || 'Student',
            studentClass: rawNormClass,
            examId,
            subject: subjectToSave,
            subjectKey: subjectKey || subjectToSave.replace(/\s+/g, ''),
            class: rawNormClass,
            section: cleanCanonicalSection,
            academicYear: rawNormYear,
            beforeState: existingRecord ? { thMarks: existingRecord.thMarks ?? null, prMarks: existingRecord.prMarks ?? null, total: existingRecord.marks ?? null } : null,
            afterState: { thMarks: numTh, prMarks: numPr, total: obtainedTotal, subjectGrade: graded.subjectGrade },
            previousValue: prevSummary,
            newValue: newSummary,
            previousAbsentStatus: { th: existingRecord?.thMarks === 'AB', pr: existingRecord?.prMarks === 'AB' },
            newAbsentStatus: { th: numTh === 'AB', pr: numPr === 'AB' },
            reason: (correctionReason || (isCorrection ? '' : 'Initial Mark Entry')).trim(),
            actorUid: authUser.uid,
            adminUid: authUser.uid,
            actorName,
            adminName: actorName,
            actorRole: callerRole,
            adminEmail: authUser.email || '',
            timestamp: FieldValue.serverTimestamp(),
            timestampStr: now.toISOString(),
            date: now.toISOString().split('T')[0]
          };

          auditLogPayloads.push({ auditDocId, auditPayload });
          savedCount++;
        }

        const isAdmin = String(callerRole) === 'admin' || String(callerRole) === 'super_admin' || String(callerRole) === 'superadmin' || callerData.admin === true || (authUser as any).admin === true;
        let effectiveReason = (correctionReason || '').trim();
        if (requiresCorrectionReason && (!effectiveReason || effectiveReason.length < 5)) {
          effectiveReason = isAdmin ? 'Administrative mark entry update' : 'Mark entry update';
        } else if (effectiveReason && effectiveReason.length > 500) {
          effectiveReason = effectiveReason.slice(0, 500);
        }

        for (const item of auditLogPayloads) {
          if (item.auditPayload.actionType === 'MARK_CORRECTION' || item.auditPayload.actionType === 'FORCE_OVERWRITE') {
            item.auditPayload.reason = effectiveReason;
          }
        }

        // Compute canonical subject workflow state on Save (NEVER auto-submits!)
        const currentSubjData = examData?.subjectStatus?.[subjectToSave] || {};
        const prevSubjWorkflowStatus = currentSubjData.status || 'NOT_STARTED';
        const expectedTotal = typeof totalEligibleCount === 'number' && totalEligibleCount > 0 ? totalEligibleCount : students.length;
        let nextSubjectWorkflowStatus = prevSubjWorkflowStatus;
        if (prevSubjWorkflowStatus === 'CORRECTION_REQUESTED') {
          nextSubjectWorkflowStatus = 'CORRECTION_REQUESTED'; // Must be explicitly resubmitted
        } else if (completeStudentsInBatch === 0 && savedCount === 0) {
          nextSubjectWorkflowStatus = 'NOT_STARTED';
        } else if (completeStudentsInBatch >= expectedTotal && students.length >= expectedTotal) {
          nextSubjectWorkflowStatus = 'MARKS_COMPLETE';
        } else {
          nextSubjectWorkflowStatus = 'PARTIALLY_FILLED';
        }

        // ============================================================
        // WRITE PHASE — ALL WRITES EXECUTE STRICTLY AFTER ALL READS
        // ============================================================
        const updatedVersions: Record<string, number> = {};

        for (const item of studentWritePayloads) {
          const resultDocRef = db.collection('results').doc(item.subDocId);
          const secureDocRef = db.collection('results_secure').doc(item.studentUid).collection('records').doc(item.subDocId);
          const rootSecureRef = db.collection('results_secure').doc(item.studentUid);

          transaction.set(resultDocRef, item.resultPayload, { merge: true });
          transaction.set(secureDocRef, item.resultPayload, { merge: true });
          transaction.set(rootSecureRef, {
            studentUid: item.studentUid,
            studentId: item.resultPayload.studentId,
            permanentStudentId: item.resultPayload.permanentStudentId,
            studentName: item.studentName,
            class: rawNormClass,
            section: cleanCanonicalSection,
            updatedAt: new Date().toISOString()
          }, { merge: true });

          const canonicalTuple = JSON.stringify([examId, item.studentUid, normKey]);
          const versionDocKey = crypto.createHash('sha256').update(canonicalTuple).digest('hex');
          const verRef = db.collection('student_subject_versions').doc(versionDocKey);
          const recInfo = recordVersionMap.get(item.studentUid);
          const curVer = recInfo ? recInfo.currentVersion : 0;
          const newVer = curVer + 1;
          updatedVersions[item.studentUid] = newVer;
          transaction.set(verRef, {
            examId,
            studentUid: item.studentUid,
            subjectKey: normKey,
            version: newVer,
            updatedAt: new Date().toISOString(),
            updatedBy: authUser.email
          }, { merge: true });
        }

        for (const auditItem of auditLogPayloads) {
          const auditRef = db.collection('audit_logs').doc(auditItem.auditDocId);
          const finalAudit = {
            ...auditItem.auditPayload,
            reason: auditItem.auditPayload.reason || effectiveReason || 'Mark Entry'
          };
          transaction.set(auditRef, finalAudit, { merge: true });
        }

        const newStatus = currentExamStatus === 'NOT STARTED' || currentExamStatus === 'IN PROGRESS' ? 'DRAFT' : currentExamStatus;
        const subjectStatusUpdate: any = {
          ...currentSubjData,
          status: nextSubjectWorkflowStatus,
          enteredCount: completeStudentsInBatch,
          totalCount: expectedTotal,
          lastSavedAt: new Date().toISOString(),
          lastSavedBy: authUser.email,
          lastSavedByUid: authUser.uid
        };

        if (autoExamDataToCreate) {
          // Single atomic create+subjectStatus write in WRITE phase (fixes Firestore read-after-write error!)
          transaction.set(examRef, {
            ...autoExamDataToCreate,
            status: newStatus,
            published: false,
            subjectStatus: {
              [subjectToSave]: subjectStatusUpdate
            },
            updatedAt: new Date().toISOString(),
            updatedBy: authUser.email,
            updatedByUid: authUser.uid
          }, { merge: true });
        } else {
          transaction.update(examRef, {
            [`subjectStatus.${subjectToSave}`]: subjectStatusUpdate,
            status: newStatus,
            published: false,
            updatedAt: new Date().toISOString(),
            updatedBy: authUser.email,
            updatedByUid: authUser.uid
          });
        }

        // Record Operation Idempotency
        transaction.set(opRef, {
          operationId,
          actorUid: authUser.uid,
          requestFingerprint: currentFingerprint,
          savedCount,
          examStatus: newStatus,
          subjectWorkflowStatus: nextSubjectWorkflowStatus,
          updatedVersions,
          committedAt: new Date().toISOString()
        });

        return {
          statusCode: 200,
          data: {
            success: true,
            savedCount,
            examStatus: newStatus,
            subjectWorkflowStatus: nextSubjectWorkflowStatus,
            updatedVersions
          }
        };
      });

      if (txnResult.error) {
        return res.status(txnResult.statusCode || 400).json({ error: txnResult.error, ...(txnResult.conflicts ? { conflicts: txnResult.conflicts } : {}) });
      }
      return res.status(txnResult.statusCode || 200).json(txnResult.data);
    } catch (err: any) {
      if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED') || err?.message?.includes('Missing or insufficient permissions')) {
        console.warn(`[SECURITY] Save marks denied by Firestore IAM for project ${firebaseConfig.projectId}.`);
        return res.status(403).json({
          error: 'Permission denied accessing Firestore database. Ensure the backend service account has the Cloud Datastore User IAM role on your Firebase project.'
        });
      }
      console.error('[SECURITY] Error in /api/results/save-marks:', err);
      return res.status(500).json({ error: 'Internal error saving marks: ' + err.message });
    }
  });

  // Trusted Explicit Subject Submission Endpoint (Separate from Save Draft!)
  app.post('/api/results/submit-subject', rateLimiter(60, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;

      const { examId, subject, subjectKey, selectedClass, selectedSection, selectedAcademicYear, eligibleStudentUids, expectedSubjects } = req.body || {};
      if (!examId || !subject || !selectedClass) {
        return res.status(400).json({ error: 'Missing required parameters (examId, subject, selectedClass).' });
      }

      const rawNormClass = normalizeClass(String(selectedClass)).trim();
      const cleanCanonicalSection = getCanonicalSection(selectedSection);
      const rawNormYear = parseAndValidateAcademicYear(selectedAcademicYear || '') || String(selectedAcademicYear || '').trim();
      const normSubjKey = String(subjectKey || subject.replace(/\s+/g, '')).trim();

      if (authUser.role !== 'admin') {
        if (authUser.role !== 'teacher') {
          return res.status(403).json({ error: 'Forbidden: Only Administrators and authorized Teachers can submit subject marks.' });
        }
        const isClassTeacher = isStrictClassTeacherAuthorized(authUser.userData, rawNormClass, cleanCanonicalSection, rawNormYear);
        const isSubjectTeacher =
          isStrictSubjectTeacherAuthorized(authUser.userData, rawNormClass, cleanCanonicalSection, rawNormYear, subject) ||
          isStrictSubjectTeacherAuthorized(authUser.userData, rawNormClass, cleanCanonicalSection, rawNormYear, normSubjKey);
        if (!isClassTeacher && !isSubjectTeacher) {
          return res.status(403).json({ error: 'Forbidden: You are not authorized to submit marks for this class and subject.' });
        }
      }

      const db = getAdminDb();
      if (rawNormYear) {
        const yearPolicy = await resolveAcademicYearPolicy(db, rawNormYear);
        if (!yearPolicy.canMutate) {
          return res.status(403).json({
            error: yearPolicy.blockReason || `Academic Year ${rawNormYear} BS is not active.`,
            code: 'ACADEMIC_YEAR_NOT_ACTIVE',
            currentAcademicYear: yearPolicy.currentAcademicYear,
            currentAcademicYearTitle: yearPolicy.currentAcademicYearTitle
          });
        }
      }
      const examRef = db.collection('exams').doc(examId);

      // Verify persisted marks completeness BEFORE transaction
      const studentUidList: string[] = Array.isArray(eligibleStudentUids) ? eligibleStudentUids.filter(Boolean) : [];
      if (studentUidList.length === 0) {
        return res.status(400).json({ error: 'Cannot submit subject: No eligible students provided.' });
      }

      const missingStudents: string[] = [];
      for (const sUid of studentUidList) {
        const subDocId = `${examId}_${sUid}_${normSubjKey}`;
        const recSnap = await db.collection('results_secure').doc(sUid).collection('records').doc(subDocId).get();
        if (!recSnap.exists) {
          missingStudents.push(sUid);
          continue;
        }
        const rd = recSnap.data() || {};
        const hasTh = rd.hasTh !== false && (rd.thFull === undefined || rd.thFull > 0);
        const hasPr = rd.hasPr === true && Number(rd.prFull || 0) > 0;
        const thOk = !hasTh || (rd.thMarks !== null && rd.thMarks !== undefined && rd.thMarks !== '');
        const prOk = !hasPr || (rd.prMarks !== null && rd.prMarks !== undefined && rd.prMarks !== '');
        if (!thOk || !prOk || rd.isIncomplete === true) {
          missingStudents.push(sUid);
        }
      }

      if (missingStudents.length > 0) {
        return res.status(400).json({
          error: `Cannot submit ${subject}: ${missingStudents.length} eligible student(s) still have missing marks. Please enter numeric marks (including 0) or mark AB, save draft, and then submit.`,
          missingStudentUids: missingStudents
        });
      }

      const txnResult: any = await db.runTransaction(async (transaction) => {
        const examSnap = await transaction.get(examRef);
        if (!examSnap.exists) {
          return { statusCode: 404, error: 'Examination document not found. Please save draft marks first.' };
        }
        const examData = examSnap.data() || {};
        if (examData.published === true || examData.status === 'PUBLISHED') {
          return { statusCode: 400, error: 'Cannot submit marks for a published examination.' };
        }
        if (examData.status === 'APPROVED') {
          return { statusCode: 400, error: 'Examination is already approved.' };
        }

        const existingSubj = examData.subjectStatus?.[subject] || {};
        const prevState = existingSubj.status || 'MARKS_COMPLETE';
        const nextSubjState = prevState === 'CORRECTION_REQUESTED' ? 'RESUBMITTED' : 'SUBMITTED';
        const nowIso = new Date().toISOString();

        const updatedSubjectStatusMap = {
          ...(examData.subjectStatus || {}),
          [subject]: {
            ...existingSubj,
            status: nextSubjState,
            enteredCount: studentUidList.length,
            totalCount: studentUidList.length,
            submittedAt: nowIso,
            submittedBy: authUser.email,
            submittedByUid: authUser.uid
          }
        };

        // Determine configured subject list to check if entire exam is READY_FOR_REVIEW
        const configuredSubjectNames: string[] = Array.isArray(examData.subjectConfigs) && examData.subjectConfigs.length > 0
          ? examData.subjectConfigs.filter((sc: any) => sc.enabled !== false).map((sc: any) => sc.subjectName || sc.subjectKey)
          : (Array.isArray(expectedSubjects) && expectedSubjects.length > 0 ? expectedSubjects : Object.keys(updatedSubjectStatusMap));

        const allReady = configuredSubjectNames.length > 0 && configuredSubjectNames.every((sName) => {
          const st = updatedSubjectStatusMap[sName]?.status;
          return st === 'SUBMITTED' || st === 'RESUBMITTED' || st === 'APPROVED';
        });

        const nextExamStatus = allReady ? 'READY_FOR_REVIEW' : 'DRAFT';
        const updates: Record<string, any> = {
          [`subjectStatus.${subject}`]: updatedSubjectStatusMap[subject],
          status: nextExamStatus,
          updatedAt: nowIso,
          updatedBy: authUser.email,
          updatedByUid: authUser.uid
        };

        if (prevState === 'CORRECTION_REQUESTED' && examData.correctionsRequested?.[subject]) {
          updates[`correctionsRequested.${subject}.resolved`] = true;
          updates[`correctionsRequested.${subject}.resolvedAt`] = nowIso;
          updates[`correctionsRequested.${subject}.resolvedByUid`] = authUser.uid;
        }

        transaction.update(examRef, updates);
        return {
          statusCode: 200,
          data: {
            success: true,
            subject,
            subjectStatus: nextSubjState,
            examStatus: nextExamStatus,
            submittedAt: nowIso
          }
        };
      });

      if (txnResult.error) {
        return res.status(txnResult.statusCode || 400).json({ error: txnResult.error });
      }

      await recordServerAuditLog({
        actorUid: authUser.uid,
        actorEmail: authUser.email,
        actorName: authUser.userData?.fullName || authUser.email,
        actorRole: authUser.role,
        targetId: `${examId}_${normSubjKey}`,
        action: txnResult.data.subjectStatus === 'RESUBMITTED' ? 'SUBJECT_RESUBMITTED' : 'SUBJECT_SUBMITTED',
        category: 'academic',
        result: 'SUCCESS',
        reason: `${txnResult.data.subjectStatus} marks for ${subject} (${studentUidList.length} students) in exam ${examId}`
      });

      return res.json(txnResult.data);
    } catch (err: any) {
      console.error('[SECURITY] Error in /api/results/submit-subject:', err);
      return res.status(500).json({ error: 'Internal server error submitting subject marks: ' + err.message });
    }
  });

  // Trusted Admin Subject Review Endpoint (Approve Subject or Request Correction)
  app.post('/api/results/review-subject', rateLimiter(60, 60000), async (req: Request, res: Response) => {
    try {
      const adminUser = await requireAdminAuth(req, res);
      if (!adminUser) return;

      const { examId, subject, action, note, expectedSubjects } = req.body || {};
      const normAction = String(action || '').trim().toUpperCase();
      if (!examId || !subject || (normAction !== 'APPROVE' && normAction !== 'REQUEST_CORRECTION')) {
        return res.status(400).json({ error: 'Missing required parameters: examId, subject, and action (APPROVE | REQUEST_CORRECTION).' });
      }

      const cleanNote = String(note || '').trim();
      if (normAction === 'REQUEST_CORRECTION' && cleanNote.length < 5) {
        return res.status(400).json({ error: 'A clear correction note (minimum 5 characters) is required when requesting correction.' });
      }

      const db = getAdminDb();
      const examRef = db.collection('exams').doc(examId);

      const txnResult: any = await db.runTransaction(async (transaction) => {
        const examSnap = await transaction.get(examRef);
        if (!examSnap.exists) {
          return { statusCode: 404, error: 'Examination document not found.' };
        }
        const examData = examSnap.data() || {};
        if (examData.published === true || examData.status === 'PUBLISHED') {
          return { statusCode: 400, error: 'Cannot review subjects of a published examination.' };
        }

        const existingSubj = examData.subjectStatus?.[subject] || {};
        const nowIso = new Date().toISOString();

        if (normAction === 'APPROVE') {
          if (existingSubj.status !== 'SUBMITTED' && existingSubj.status !== 'RESUBMITTED' && existingSubj.status !== 'MARKS_COMPLETE' && existingSubj.status !== 'APPROVED') {
            return {
              statusCode: 400,
              error: `Subject "${subject}" must be SUBMITTED or RESUBMITTED before approval (current status: ${existingSubj.status || 'NOT_STARTED'}).`
            };
          }
          const updatedSubj = {
            ...existingSubj,
            status: 'APPROVED',
            approvedAt: nowIso,
            approvedBy: adminUser.email,
            approvedByUid: adminUser.uid
          };
          const updatedMap = { ...(examData.subjectStatus || {}), [subject]: updatedSubj };
          const configuredSubjectNames: string[] = Array.isArray(examData.subjectConfigs) && examData.subjectConfigs.length > 0
            ? examData.subjectConfigs.filter((sc: any) => sc.enabled !== false).map((sc: any) => sc.subjectName || sc.subjectKey)
            : (Array.isArray(expectedSubjects) && expectedSubjects.length > 0 ? expectedSubjects : Object.keys(updatedMap));

          const allReadyOrApproved = configuredSubjectNames.length > 0 && configuredSubjectNames.every((sName) => {
            const st = updatedMap[sName]?.status;
            return st === 'SUBMITTED' || st === 'RESUBMITTED' || st === 'APPROVED';
          });
          const nextExamStatus = allReadyOrApproved ? 'READY_FOR_REVIEW' : (examData.status || 'DRAFT');

          transaction.update(examRef, {
            [`subjectStatus.${subject}`]: updatedSubj,
            status: nextExamStatus,
            updatedAt: nowIso,
            updatedBy: adminUser.email,
            updatedByUid: adminUser.uid
          });

          return {
            statusCode: 200,
            data: { success: true, subject, subjectStatus: 'APPROVED', examStatus: nextExamStatus }
          };
        } else {
          // REQUEST_CORRECTION
          const updatedSubj = {
            ...existingSubj,
            status: 'CORRECTION_REQUESTED',
            correctionRequestedAt: nowIso,
            correctionRequestedBy: adminUser.email,
            correctionNote: cleanNote
          };
          transaction.update(examRef, {
            [`subjectStatus.${subject}`]: updatedSubj,
            [`correctionsRequested.${subject}`]: {
              requestedBy: adminUser.userData?.fullName || adminUser.email,
              requestedByUid: adminUser.uid,
              note: cleanNote,
              requestedAt: nowIso,
              resolved: false
            },
            status: 'DRAFT',
            updatedAt: nowIso,
            updatedBy: adminUser.email,
            updatedByUid: adminUser.uid
          });

          return {
            statusCode: 200,
            data: { success: true, subject, subjectStatus: 'CORRECTION_REQUESTED', examStatus: 'DRAFT' }
          };
        }
      });

      if (txnResult.error) {
        return res.status(txnResult.statusCode || 400).json({ error: txnResult.error });
      }

      await recordServerAuditLog({
        actorUid: adminUser.uid,
        actorEmail: adminUser.email,
        actorName: adminUser.userData?.fullName || adminUser.email,
        actorRole: adminUser.role,
        adminTier: adminUser.adminTier,
        targetId: `${examId}_${subject}`,
        action: normAction === 'APPROVE' ? 'SUBJECT_APPROVED' : 'CORRECTION_REQUESTED',
        category: 'academic',
        result: 'SUCCESS',
        reason: normAction === 'APPROVE'
          ? `Approved subject ${subject} for exam ${examId}`
          : `Requested correction for ${subject} in exam ${examId}: ${cleanNote}`
      });

      return res.json(txnResult.data);
    } catch (err: any) {
      console.error('[SECURITY] Error in /api/results/review-subject:', err);
      return res.status(500).json({ error: 'Internal server error reviewing subject: ' + err.message });
    }
  });

  // Trusted Admin Examination Approval Endpoint (Separate from Publication!)
  app.post('/api/results/approve-exam', rateLimiter(30, 60000), async (req: Request, res: Response) => {
    try {
      const adminUser = await requireAdminAuth(req, res);
      if (!adminUser) return;

      const { examId, expectedSubjects } = req.body || {};
      if (!examId) {
        return res.status(400).json({ error: 'Missing required examId.' });
      }

      const db = getAdminDb();
      const examRef = db.collection('exams').doc(examId);

      const txnResult: any = await db.runTransaction(async (transaction) => {
        const examSnap = await transaction.get(examRef);
        if (!examSnap.exists) {
          return { statusCode: 404, error: 'Examination document not found.' };
        }
        const examData = examSnap.data() || {};
        if (examData.published === true || examData.status === 'PUBLISHED') {
          return { statusCode: 409, error: 'Examination is already published.' };
        }
        if (examData.status !== 'READY_FOR_REVIEW' && examData.status !== 'READY FOR REVIEW') {
          return {
            statusCode: 400,
            error: `Examination must be in READY_FOR_REVIEW status before approval (current status: ${examData.status || 'DRAFT'}). Ensure all subjects are submitted.`
          };
        }

        const subjectStatusMap = examData.subjectStatus || {};
        const configuredSubjectNames: string[] = Array.isArray(examData.subjectConfigs) && examData.subjectConfigs.length > 0
          ? examData.subjectConfigs.filter((sc: any) => sc.enabled !== false).map((sc: any) => sc.subjectName || sc.subjectKey)
          : (Array.isArray(expectedSubjects) && expectedSubjects.length > 0 ? expectedSubjects : Object.keys(subjectStatusMap));

        const unapprovedSubjects = configuredSubjectNames.filter((sName) => {
          const st = subjectStatusMap[sName]?.status;
          // In CONNECTED mode every subject must be explicitly APPROVED; in STANDALONE mode SUBMITTED/APPROVED is accepted
          if (examData.workflowMode === 'CONNECTED') {
            return st !== 'APPROVED';
          }
          return st !== 'APPROVED' && st !== 'SUBMITTED' && st !== 'RESUBMITTED';
        });

        if (unapprovedSubjects.length > 0) {
          return {
            statusCode: 400,
            error: `Cannot approve examination: The following subjects are not yet approved: ${unapprovedSubjects.join(', ')}.`
          };
        }

        const nowIso = new Date().toISOString();
        transaction.update(examRef, {
          status: 'APPROVED',
          published: false, // Approval MUST NOT automatically publish!
          approvedAt: nowIso,
          approvedBy: adminUser.email,
          approvedByUid: adminUser.uid,
          updatedAt: nowIso,
          updatedBy: adminUser.email,
          updatedByUid: adminUser.uid
        });

        return { statusCode: 200, data: { success: true, examId, status: 'APPROVED', approvedAt: nowIso } };
      });

      if (txnResult.error) {
        return res.status(txnResult.statusCode || 400).json({ error: txnResult.error });
      }

      await recordServerAuditLog({
        actorUid: adminUser.uid,
        actorEmail: adminUser.email,
        actorName: adminUser.userData?.fullName || adminUser.email,
        actorRole: adminUser.role,
        adminTier: adminUser.adminTier,
        targetId: examId,
        action: 'EXAM_APPROVED',
        category: 'academic',
        result: 'SUCCESS',
        reason: `Explicitly approved examination ${examId} (awaiting separate Admin publication)`
      });

      return res.json(txnResult.data);
    } catch (err: any) {
      console.error('[SECURITY] Error in /api/results/approve-exam:', err);
      return res.status(500).json({ error: 'Internal server error approving examination: ' + err.message });
    }
  });

  // Trusted Result Publish Endpoint (Admin-only, Server-Authoritative Nepal CDC Recalculation, No New Ranks)
  app.post('/api/results/publish', rateLimiter(30, 60000), async (req: Request, res: Response) => {
    try {
      const adminUser = await requireAdminAuth(req, res);
      if (!adminUser) return;

      const { examId, targetClass, targetSection, targetAcademicYear, summaryRecords } = req.body || {};
      if (!examId || !targetClass || !Array.isArray(summaryRecords) || summaryRecords.length === 0) {
        return res.status(400).json({ error: 'Missing required parameters (examId, targetClass, summaryRecords).' });
      }

      const normClass = normalizeClass(String(targetClass)).trim();
      const cleanSection = getCanonicalSection(targetSection);
      const db = getAdminDb();
      const examRef = db.collection('exams').doc(examId);
      const examSnap = await examRef.get();
      if (!examSnap.exists) {
        return res.status(404).json({ error: 'Parent exam document not found.' });
      }
      const examData = examSnap.data() || {};
      const publishYear = parseAndValidateAcademicYear(
        String(examData.canonicalAcademicYearId || examData.academicYear || targetAcademicYear || '')
      );
      if (publishYear) {
        const yearPolicy = await resolveAcademicYearPolicy(db, publishYear);
        if (!yearPolicy.canMutate) {
          return res.status(403).json({
            error: yearPolicy.blockReason || `Academic Year ${publishYear} BS is not active.`,
            code: 'ACADEMIC_YEAR_NOT_ACTIVE',
            currentAcademicYear: yearPolicy.currentAcademicYear,
            currentAcademicYearTitle: yearPolicy.currentAcademicYearTitle
          });
        }
      }
      if (examData.published === true || examData.status === 'PUBLISHED') {
        return res.status(409).json({ error: 'Examination has already been published. Duplicate publication is prohibited.' });
      }
      if (examData.status !== 'APPROVED') {
        return res.status(400).json({
          error: `Exam must be explicitly APPROVED by Admin before publication (current status: ${examData.status || 'DRAFT'}). Approval and Publication are separate actions.`
        });
      }

      // Fetch active template snapshot to preserve immutable historical rendering
      let templateSnapshot: any = null;
      try {
        const tplSnap = await db.collection('settings').doc('result_template').get();
        if (tplSnap.exists) {
          templateSnapshot = tplSnap.data();
        }
      } catch (_) {}

      // Server-Authoritative Recalculation from Persisted Firestore Records (NEVER trust client grades/GPA/totals!)
      const resultsSnap = await db.collection('results').where('examId', '==', examId).get();
      const studentRecordsMap = new Map<string, any[]>();
      for (const docSnap of resultsSnap.docs) {
        const rd = docSnap.data();
        const sUid = rd.studentUid;
        if (!sUid) continue;
        if (!studentRecordsMap.has(sUid)) studentRecordsMap.set(sUid, []);
        studentRecordsMap.get(sUid)!.push(rd);
      }

      const authoritativeSummaries: any[] = [];
      const incompleteErrors: string[] = [];

      for (const clientSummary of summaryRecords) {
        const studentUid = clientSummary.studentUid || clientSummary.studentId;
        if (!studentUid) continue;

        const persistedDocs = studentRecordsMap.get(studentUid) || [];
        if (persistedDocs.length === 0) {
          incompleteErrors.push(`Student ${clientSummary.studentName || studentUid} has no persisted subject mark records.`);
          continue;
        }

        const subjectOutputs = persistedDocs.map((rd) =>
          calculateSubjectResult(
            rd.subjectKey || rd.subject,
            rd.subject || rd.subjectKey,
            {
              theoryMarks: rd.thMarks ?? null,
              practicalMarks: rd.prMarks ?? null,
              isAbsentTheory: rd.thMarks === 'AB',
              isAbsentPractical: rd.prMarks === 'AB'
            },
            {
              hasTh: rd.hasTh !== false && (rd.thFull === undefined || rd.thFull > 0),
              hasPr: rd.hasPr === true && Number(rd.prFull || 0) > 0,
              thFullMarks: Number(rd.thFull ?? 75),
              thPassMarks: Number(rd.thPass ?? Math.ceil((rd.thFull ?? 75) * 0.35)),
              prFullMarks: Number(rd.prFull ?? 0),
              prPassMarks: Number(rd.prPass ?? Math.ceil((rd.prFull ?? 0) * 0.35))
            }
          )
        );

        const aggregate = calculateAggregateResult(normClass, subjectOutputs);
        if (aggregate.isIncomplete) {
          incompleteErrors.push(
            `Student ${clientSummary.studentName || studentUid} has missing marks in: ${aggregate.incompleteSubjects.join(', ')}.`
          );
          continue;
        }

        const subjectsSnapshot: Record<string, any> = {};
        for (const so of subjectOutputs) {
          subjectsSnapshot[so.subjectName] = {
            thMarks: so.theoryMarks,
            prMarks: so.practicalMarks,
            thFull: so.thFullMarks,
            prFull: so.prFullMarks,
            fullMarks: so.totalFullMarks,
            obtained: so.totalObtainedMarks,
            theoryGrade: so.theoryGrade,
            practicalGrade: so.practicalGrade,
            subjectGrade: so.subjectGrade,
            subjectGradePoint: so.subjectGradePoint,
            isNg: so.isNg,
            failureReasons: so.failureReasons
          };
        }

        authoritativeSummaries.push({
          studentUid,
          studentId: clientSummary.studentId || clientSummary.permanentStudentId || '',
          permanentStudentId: clientSummary.permanentStudentId || clientSummary.studentId || '',
          studentEmis: clientSummary.studentEmis || '',
          studentName: clientSummary.studentName || '',
          rollNo: clientSummary.rollNo || clientSummary.rollNumberSnapshot || '',
          rollNumberSnapshot: clientSummary.rollNo || clientSummary.rollNumberSnapshot || '',
          totalMarks: aggregate.totalObtainedMarks,
          total: aggregate.totalObtainedMarks,
          fullTotal: aggregate.totalFullMarks,
          percentage: aggregate.aggregatePercentage,
          gpa: aggregate.overallGpa, // Strictly null when ANY subject is NG
          gpaDisplayText: aggregate.gpaDisplayText, // '-' when NG
          grade: aggregate.overallGrade,
          resultStatus: aggregate.overallStatus,
          isNg: aggregate.isNg,
          failedSubjects: aggregate.failedSubjects,
          // Ranking Policy: NEVER compute or fabricate new ranks
          rank: null,
          isHistoricalSnapshot: false,
          attendance: clientSummary.attendance || 0,
          remarks: typeof clientSummary.remarks === 'string' ? clientSummary.remarks.trim() : '',
          classTeacherRemark: typeof clientSummary.classTeacherRemark === 'string' ? clientSummary.classTeacherRemark.trim() : '',
          subjects: subjectsSnapshot,
          templateSnapshot
        });
      }

      if (incompleteErrors.length > 0) {
        return res.status(400).json({
          error: `Publication blocked due to incomplete marks (${incompleteErrors.length} issue(s)): ${incompleteErrors.slice(0, 3).join(' | ')}`
        });
      }

      const publishedAtIso = new Date().toISOString();

      // Atomic status check and update to prevent concurrent duplicate publication
      const txnResult: any = await db.runTransaction(async (transaction) => {
        const examSnapTxn = await transaction.get(examRef);
        const currentExamData = examSnapTxn.data() || {};

        if (currentExamData.status === 'PUBLISHED' || currentExamData.published === true) {
          return { statusCode: 409, error: 'Examination has already been published. Duplicate publication is prohibited.' };
        }
        if (currentExamData.status !== 'APPROVED') {
          return { statusCode: 400, error: 'Examination must remain in APPROVED state during publication.' };
        }

        transaction.update(examRef, {
          status: 'PUBLISHED',
          published: true,
          publishedAt: publishedAtIso,
          publishedBy: adminUser.email,
          publishedByUid: adminUser.uid,
          templateSnapshot
        });

        return { statusCode: 200, data: currentExamData };
      });

      if (txnResult.error) {
        return res.status(txnResult.statusCode).json({ error: txnResult.error });
      }

      const publishedExamData = txnResult.data;

      // Phase 1: Stage child resultSummary, results, AND results_secure records to published: true
      let batch = db.batch();
      let opCount = 0;

      const commitIfFull = async () => {
        if (opCount >= 400) {
          await batch.commit();
          batch = db.batch();
          opCount = 0;
        }
      };

      for (const summary of authoritativeSummaries) {
        const summaryDocId = `${examId}_${summary.studentUid}`;
        const summaryRef = db.collection('resultSummary').doc(summaryDocId);

        batch.set(summaryRef, {
          examId,
          examType: publishedExamData.name || publishedExamData.examType || publishedExamData.terminalExamType || 'Examination',
          workflowMode: publishedExamData.workflowMode || 'CONNECTED',
          ...summary,
          class: normClass,
          section: cleanSection,
          academicYear: targetAcademicYear || publishedExamData.academicYear || '',
          published: true,
          publishedAt: publishedAtIso
        }, { merge: true });
        opCount++;
        await commitIfFull();
      }

      for (const docSnap of resultsSnap.docs) {
        const rd = docSnap.data();
        batch.update(docSnap.ref, { published: true, publishedAt: publishedAtIso });
        opCount++;
        await commitIfFull();

        // CRITICAL FIX: Also publish student's results_secure/{studentUid}/records/{docId} so Student Dashboard sees published marks!
        if (rd.studentUid) {
          const secureDocRef = db.collection('results_secure').doc(rd.studentUid).collection('records').doc(docSnap.id);
          batch.set(secureDocRef, { published: true, publishedAt: publishedAtIso }, { merge: true });
          opCount++;
          await commitIfFull();
        }
      }

      // Phase 2: Create durable outbox notification event
      const outboxEventId = `pub_${examId}_${normClass}_${cleanSection}`;
      const outboxRef = db.collection('notification_outbox').doc(outboxEventId);
      const canonicalExamYearId = resolveCanonicalAcademicYearId(publishedExamData) || resolveCanonicalAcademicYearId({ academicYear: targetAcademicYear }) || targetAcademicYear || '';

      batch.set(outboxRef, {
        eventId: outboxEventId,
        eventType: 'RESULT_PUBLISHED',
        payload: {
          examId,
          examType: publishedExamData.name || publishedExamData.examType || 'Examination',
          className: normClass,
          section: cleanSection,
          academicYearId: canonicalExamYearId,
          academicYear: canonicalExamYearId
        },
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 5,
        nextRetryAt: publishedAtIso,
        createdAt: publishedAtIso,
        updatedAt: publishedAtIso,
        lastError: null
      });
      opCount++;

      if (opCount > 0) {
        await batch.commit();
      }

      await recordServerAuditLog({
        actorUid: adminUser.uid,
        actorEmail: adminUser.email,
        actorName: adminUser.userData?.fullName || adminUser.email,
        actorRole: adminUser.role,
        adminTier: adminUser.adminTier,
        targetId: examId,
        action: 'EXAM_PUBLISHED',
        category: 'academic',
        result: 'SUCCESS',
        reason: `Officially published results for Class ${normClass} (${examId}) by Admin (${authoritativeSummaries.length} students, server-verified Nepal CDC grades)`
      });

      // Trigger immediate outbox processing non-blockingly so student bell notifications & guardian/student emails dispatch right away
      void processNotificationOutbox().catch((outboxErr: any) => {
        console.warn('[OUTBOX] Non-blocking publish trigger warning:', outboxErr?.message || outboxErr);
      });

      return res.json({
        success: true,
        publishedCount: authoritativeSummaries.length,
        publishedAt: publishedAtIso,
        message: 'Class results published successfully.'
      });
    } catch (err: any) {
      console.error('[SECURITY] Error in /api/results/publish:', err);
      return res.status(500).json({ error: 'Internal server error publishing results: ' + err.message });
    }
  });

  // Trusted Admin-Only Unpublish / Reopen Endpoint (Owner Policy #5: Mandatory Audit Reason)
  app.post('/api/results/unpublish', rateLimiter(20, 60000), async (req: Request, res: Response) => {
    try {
      const adminUser = await requireAdminAuth(req, res);
      if (!adminUser) return;

      const { examId, reason } = req.body || {};
      const cleanReason = String(reason || '').trim();
      if (!examId || cleanReason.length < 10) {
        return res.status(400).json({
          error: 'Unpublishing a published examination requires examId and a detailed audit reason (minimum 10 characters).'
        });
      }

      const db = getAdminDb();
      const examRef = db.collection('exams').doc(examId);
      const nowIso = new Date().toISOString();

      const txnResult: any = await db.runTransaction(async (transaction) => {
        const examSnap = await transaction.get(examRef);
        if (!examSnap.exists) {
          return { statusCode: 404, error: 'Examination document not found.' };
        }
        const examData = examSnap.data() || {};
        if (examData.published !== true && examData.status !== 'PUBLISHED') {
          return { statusCode: 400, error: 'Examination is not currently published.' };
        }

        transaction.update(examRef, {
          status: 'DRAFT',
          published: false,
          unpublishedAt: nowIso,
          unpublishedBy: adminUser.email,
          unpublishedByUid: adminUser.uid,
          unpublishReason: cleanReason,
          updatedAt: nowIso,
          updatedBy: adminUser.email,
          updatedByUid: adminUser.uid
        });
        return { statusCode: 200, data: examData };
      });

      if (txnResult.error) {
        return res.status(txnResult.statusCode || 400).json({ error: txnResult.error });
      }

      const examMeta = txnResult.data || {};
      const examLabel = String(examMeta.name || examMeta.type || examMeta.examType || examId);
      const examClass = String(examMeta.class || '');
      const examSection = String(examMeta.section || 'A');
      const examYear = String(examMeta.academicYear || '');
      const prevExamStatus = String(examMeta.status || (examMeta.published ? 'PUBLISHED' : 'UNKNOWN'));

      // Revert published flag and status on resultSummary, results, and results_secure immediately
      let batch = db.batch();
      let opCount = 0;
      const updatedSummaryIds = new Set<string>();
      const commitIfFull = async () => {
        if (opCount >= 400) {
          await batch.commit();
          batch = db.batch();
          opCount = 0;
        }
      };

      const summariesSnap = await db.collection('resultSummary').where('examId', '==', examId).get();
      for (const sDoc of summariesSnap.docs) {
        updatedSummaryIds.add(sDoc.id);
        batch.update(sDoc.ref, { published: false, status: 'DRAFT', unpublishedAt: nowIso });
        opCount++;
        await commitIfFull();
      }

      // Sweep any legacy resultSummary docs that share the exact same class + examType + academicYear
      if (examClass && examLabel) {
        try {
          const fallbackSummaries = await db
            .collection('resultSummary')
            .where('class', '==', examClass)
            .where('published', '==', true)
            .get();
          for (const sDoc of fallbackSummaries.docs) {
            if (updatedSummaryIds.has(sDoc.id)) continue;
            const sd = sDoc.data() || {};
            const sameExam =
              String(sd.examId || '') === examId ||
              (String(sd.examType || '').toLowerCase() === examLabel.toLowerCase() &&
                (!examYear || !sd.academicYear || String(sd.academicYear) === examYear) &&
                (!sd.section || String(sd.section).toUpperCase() === examSection.toUpperCase()));
            if (sameExam) {
              updatedSummaryIds.add(sDoc.id);
              batch.update(sDoc.ref, { published: false, status: 'DRAFT', unpublishedAt: nowIso });
              opCount++;
              await commitIfFull();
            }
          }
        } catch (sweepErr) {
          console.warn('[UNPUBLISH] Fallback summary sweep skipped:', sweepErr);
        }
      }

      const resultsSnap = await db.collection('results').where('examId', '==', examId).get();
      for (const rDoc of resultsSnap.docs) {
        const rd = rDoc.data();
        batch.update(rDoc.ref, { published: false, status: 'DRAFT', unpublishedAt: nowIso });
        opCount++;
        await commitIfFull();

        if (rd.studentUid) {
          const secureRef = db.collection('results_secure').doc(rd.studentUid).collection('records').doc(rDoc.id);
          batch.set(secureRef, { published: false, status: 'DRAFT', unpublishedAt: nowIso }, { merge: true });
          opCount++;
          await commitIfFull();
        }
      }

      if (opCount > 0) {
        await batch.commit();
      }

      const targetDisplayName = `${examLabel}${examClass ? ` — Class ${examClass} (${examSection})` : ''}${examYear ? ` • ${examYear} BS` : ''}`;

      await recordServerAuditLog({
        actorUid: adminUser.uid,
        actorEmail: adminUser.email,
        actorName: adminUser.userData?.fullName || adminUser.email,
        actorRole: adminUser.role,
        adminTier: adminUser.adminTier,
        targetType: 'examination',
        targetId: examId,
        targetName: targetDisplayName,
        studentName: targetDisplayName,
        studentClass: examClass || '-',
        academicYear: examYear,
        previousValue: `${prevExamStatus} (Locked & Visible to Students)`,
        newValue: 'DRAFT (Unpublished & Reopened for Corrections)',
        beforeState: {
          examId,
          status: prevExamStatus,
          published: true,
          publishedAt: examMeta.publishedAt || null,
        },
        afterState: {
          examId,
          status: 'DRAFT',
          published: false,
          unpublishedAt: nowIso,
          unpublishReason: cleanReason,
          revertedSummaries: updatedSummaryIds.size,
          revertedResults: resultsSnap.size,
        },
        action: 'EXAM_UNPUBLISHED',
        category: 'academic',
        result: 'SUCCESS',
        reason: `Unpublished & reopened ${targetDisplayName} by Admin. Audit reason: ${cleanReason}`
      });

      return res.json({
        success: true,
        examId,
        status: 'DRAFT',
        published: false,
        revertedSummaries: updatedSummaryIds.size,
        revertedResults: resultsSnap.size,
        unpublishedAt: nowIso,
        message: 'Examination has been unpublished and reopened for editing.'
      });
    } catch (err: any) {
      console.error('[SECURITY] Error in /api/results/unpublish:', err);
      return res.status(500).json({ error: 'Internal server error unpublishing examination: ' + err.message });
    }
  });

  // Trusted Admin-Only Academic Promotion Execution Endpoint
  // Atomically records year-specific enrollments, preserves source-year snapshots, updates active student profiles, and logs full audit diffs
  app.post('/api/academic/execute-promotion', rateLimiter(30, 60000), async (req: Request, res: Response) => {
    try {
      const adminUser = await requireAdminAuth(req, res);
      if (!adminUser) return;

      const { sourceAcademicYear, targetAcademicYear, candidates } = req.body || {};
      const parseBsYearNum = (val: unknown): number => {
        const match = String(val || '').match(/\b(20[4-9][0-9])\b/);
        return match ? parseInt(match[1], 10) : 0;
      };

      const sourceBsYear = parseBsYearNum(sourceAcademicYear);
      const targetBsYear = parseBsYearNum(targetAcademicYear);

      if (!sourceBsYear || !targetBsYear) {
        return res.status(400).json({
          error: 'Valid Bikram Sambat (B.S.) source and target academic years are required (e.g., 2083 and 2084).'
        });
      }
      if (sourceBsYear === targetBsYear) {
        return res.status(400).json({
          error: `Source year (${sourceBsYear} BS) and Target year (${targetBsYear} BS) cannot be the same.`
        });
      }
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return res.status(400).json({ error: 'At least one student candidate is required for promotion.' });
      }
      if (candidates.length > 250) {
        return res.status(400).json({ error: 'Maximum 250 students per promotion batch.' });
      }

      const db = getAdminDb();
      const nowIso = new Date().toISOString();
      const canonicalSourceYear = String(sourceBsYear);
      const canonicalTargetYear = String(targetBsYear);
      const actorName = adminUser.userData?.fullName || adminUser.email || 'Administrator';

      // Ensure target academic year exists in academic_years collection (as INACTIVE if newly provisioned, never flipping current active year)
      const targetYearRef = db.collection('academic_years').doc(canonicalTargetYear);
      const targetYearSnap = await targetYearRef.get();
      if (!targetYearSnap.exists) {
        await targetYearRef.set({
          academicYearId: canonicalTargetYear,
          bsYear: targetBsYear,
          displayTitle: `${targetBsYear} BS`,
          isCurrent: false,
          status: 'INACTIVE',
          createdAt: nowIso,
          createdBy: adminUser.email || adminUser.uid,
          updatedAt: nowIso,
        });
      }

      // Pre-validate roll conflicts within this batch for active outcomes
      const batchRollMap = new Map<string, string>();
      for (const c of candidates) {
        const outcome = String(c.proposedOutcome || 'PROMOTED').toUpperCase();
        if (outcome === 'TRANSFERRED' || outcome === 'GRADUATED' || outcome === 'INACTIVE') continue;
        const cleanRoll = String(c.targetRoll || '').trim();
        if (!cleanRoll) continue;
        const tClass = outcome === 'RETAINED' ? String(c.currentClass || '').trim() : String(c.targetClass || '').trim();
        const tSec = String(c.targetSection || 'A').trim().toUpperCase() || 'A';
        const key = `${tClass.replace(/^Class\s+/i, '').toLowerCase()}_${tSec}_${cleanRoll}`;
        if (batchRollMap.has(key)) {
          return res.status(400).json({
            error: `Duplicate target Roll No. "${cleanRoll}" in Class ${tClass} (Sec ${tSec}) assigned to both "${batchRollMap.get(key)}" and "${c.studentName || c.studentUid}".`
          });
        }
        batchRollMap.set(key, String(c.studentName || c.studentUid));
      }

      const result = {
        totalSelected: candidates.length,
        promotedCount: 0,
        retainedCount: 0,
        transferredCount: 0,
        graduatedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        errors: [] as { studentUid: string; studentName: string; error: string }[],
        details: [] as {
          studentUid: string;
          studentName: string;
          outcome: string;
          enrollmentId?: string;
          status: 'SUCCESS' | 'SKIPPED' | 'FAILED';
          message: string;
        }[],
      };

      const validOutcomes = new Set(['PROMOTED', 'RETAINED', 'TRANSFERRED', 'GRADUATED', 'INACTIVE']);

      // Fetch existing target-year and source-year enrollments once for O(1) idempotency lookup
      const [existingTargetEnrSnap, existingSourceEnrSnap] = await Promise.all([
        db.collection('student_enrollments').where('bsYear', '==', targetBsYear).get(),
        db.collection('student_enrollments').where('bsYear', '==', sourceBsYear).get(),
      ]);

      const existingTargetByUid = new Map<string, { id: string; data: any }>();
      existingTargetEnrSnap.forEach((docSnap) => {
        const d = docSnap.data() || {};
        if (d.studentUid) existingTargetByUid.set(String(d.studentUid), { id: docSnap.id, data: d });
      });

      const existingSourceByUid = new Map<string, { id: string; data: any }>();
      existingSourceEnrSnap.forEach((docSnap) => {
        const d = docSnap.data() || {};
        if (d.studentUid) existingSourceByUid.set(String(d.studentUid), { id: docSnap.id, data: d });
      });

      const seqRef = db.collection('document_sequences').doc(`SEQ_ENR_${targetBsYear}`);
      const sourceSeqRef = db.collection('document_sequences').doc(`SEQ_ENR_${sourceBsYear}`);

      for (const candidate of candidates) {
        const studentUid = String(candidate.studentUid || '').trim();
        const fallbackName = String(candidate.studentName || studentUid || 'Student');
        const outcome = validOutcomes.has(String(candidate.proposedOutcome || '').toUpperCase())
          ? String(candidate.proposedOutcome).toUpperCase()
          : 'PROMOTED';

        if (!studentUid) {
          result.failedCount++;
          result.errors.push({ studentUid: '', studentName: fallbackName, error: 'Missing studentUid.' });
          result.details.push({ studentUid: '', studentName: fallbackName, outcome, status: 'FAILED', message: 'Missing studentUid.' });
          continue;
        }

        try {
          const userRef = db.collection('users').doc(studentUid);
          const existingTarget = existingTargetByUid.get(studentUid);
          const existingSource = existingSourceByUid.get(studentUid);

          const txnOut = await db.runTransaction(async (tx) => {
            const userSnap = await tx.get(userRef);
            if (!userSnap.exists) {
              throw new Error(`Student record ${studentUid} not found.`);
            }
            const userData = userSnap.data() || {};
            if (userData.deleted === true || String(userData.status || '').toUpperCase() === 'DELETED') {
              throw new Error(`Cannot promote deleted student account (${fallbackName}).`);
            }

            const studentName = String(userData.fullName || userData.name || fallbackName);
            const permanentStudentId = String(userData.permanentStudentId || userData.studentId || candidate.studentId || studentUid);
            const emisNumber = String(userData.emisNumber || userData.studentEmis || candidate.emisNumber || '');
            const prevClass = String(userData.class || candidate.currentClass || '').replace(/^Class\s+/i, '').trim();
            const prevSection = String(userData.section || candidate.currentSection || 'A').trim().toUpperCase() || 'A';
            const prevRoll = String(userData.rollNumber || userData.rollNo || candidate.currentRoll || '').trim();

            let enrStatus = 'promoted';
            let targetClass = String(candidate.targetClass || '').replace(/^Class\s+/i, '').trim();
            const targetSection = String(candidate.targetSection || prevSection || 'A').trim().toUpperCase() || 'A';
            let targetRoll = String(candidate.targetRoll ?? '').trim();

            if (outcome === 'RETAINED') {
              enrStatus = 'retained';
              targetClass = prevClass;
            } else if (outcome === 'TRANSFERRED') {
              enrStatus = 'transferred';
              targetClass = targetClass || prevClass;
              targetRoll = '';
            } else if (outcome === 'GRADUATED') {
              enrStatus = 'graduated';
              targetClass = 'Graduated';
              targetRoll = '';
            } else if (outcome === 'INACTIVE') {
              enrStatus = 'inactive';
              targetClass = targetClass || prevClass;
              targetRoll = '';
            } else {
              enrStatus = 'promoted';
              if (!targetClass) {
                throw new Error(`Target class is required to promote ${studentName}.`);
              }
            }

            // Read sequence docs before any writes inside transaction
            let enrollmentId = existingTarget?.id || '';
            let nextSeqNum = 0;
            if (!enrollmentId) {
              const seqSnap = await tx.get(seqRef);
              nextSeqNum = Number(seqSnap.exists ? seqSnap.data()?.lastIssuedSequence || 0 : existingTargetEnrSnap.size) + 1;
              enrollmentId = `ENR-${targetBsYear}-${String(nextSeqNum).padStart(6, '0')}`;
            }

            let sourceSnapshotId = existingSource?.id || '';
            let nextSourceSeq = 0;
            if (!sourceSnapshotId) {
              const sSeqSnap = await tx.get(sourceSeqRef);
              nextSourceSeq = Number(sSeqSnap.exists ? sSeqSnap.data()?.lastIssuedSequence || 0 : existingSourceEnrSnap.size) + 1;
              sourceSnapshotId = `ENR-${sourceBsYear}-${String(nextSourceSeq).padStart(6, '0')}`;
            }

            // 1. Preserve immutable source-year enrollment snapshot if missing (or mark outcome on existing source enrollment)
            if (!existingSource) {
              tx.set(db.collection('student_enrollments').doc(sourceSnapshotId), {
                id: sourceSnapshotId,
                enrollmentId: sourceSnapshotId,
                studentUid,
                studentId: permanentStudentId,
                permanentStudentId,
                emisNumber,
                studentName,
                academicYear: canonicalSourceYear,
                academicYearLabel: `${sourceBsYear} BS`,
                bsYear: sourceBsYear,
                class: prevClass,
                section: prevSection,
                roll: prevRoll,
                rollNumber: prevRoll,
                status: enrStatus,
                promotionOutcome: outcome,
                enrolledAt: FieldValue.serverTimestamp(),
                createdAt: nowIso,
                createdBy: adminUser.uid,
                createdByName: actorName,
                updatedAt: nowIso,
                updatedBy: adminUser.uid,
              });
              tx.set(sourceSeqRef, {
                prefix: 'ENR',
                bsYear: sourceBsYear,
                lastIssuedSequence: nextSourceSeq,
                lastIssuedId: sourceSnapshotId,
                updatedAt: FieldValue.serverTimestamp(),
              }, { merge: true });
            } else {
              tx.set(db.collection('student_enrollments').doc(existingSource.id), {
                status: enrStatus,
                promotionOutcome: outcome,
                updatedAt: nowIso,
                updatedBy: adminUser.uid,
              }, { merge: true });
            }

            // 2. Write or update target-year enrollment record
            const targetEnrRef = db.collection('student_enrollments').doc(enrollmentId);
            tx.set(targetEnrRef, {
              id: enrollmentId,
              enrollmentId,
              studentUid,
              studentId: permanentStudentId,
              permanentStudentId,
              emisNumber,
              studentName,
              academicYear: canonicalTargetYear,
              academicYearLabel: `${targetBsYear} BS`,
              bsYear: targetBsYear,
              class: targetClass,
              section: targetSection,
              roll: targetRoll,
              rollNumber: targetRoll,
              status: outcome === 'PROMOTED' || outcome === 'RETAINED' ? 'active' : enrStatus,
              promotionOutcome: outcome,
              sourceEnrollmentId: sourceSnapshotId,
              sourceAcademicYear: canonicalSourceYear,
              sourceClass: prevClass,
              sourceSection: prevSection,
              sourceRoll: prevRoll,
              enrolledAt: FieldValue.serverTimestamp(),
              createdAt: existingTarget?.data?.createdAt || nowIso,
              createdBy: existingTarget?.data?.createdBy || adminUser.uid,
              createdByName: actorName,
              updatedAt: nowIso,
              updatedBy: adminUser.uid,
            }, { merge: true });

            if (!existingTarget && nextSeqNum > 0) {
              tx.set(seqRef, {
                prefix: 'ENR',
                bsYear: targetBsYear,
                lastIssuedSequence: nextSeqNum,
                lastIssuedId: enrollmentId,
                updatedAt: FieldValue.serverTimestamp(),
              }, { merge: true });
            }

            // 3. Update active user profile while preserving permanent STU-ID & EMIS
            const userUpdates: Record<string, any> = {
              academicYear: canonicalTargetYear,
              academicYearId: canonicalTargetYear,
              classAssignedYear: canonicalTargetYear,
              lastPromotedAt: nowIso,
              lastPromotedBy: adminUser.email || adminUser.uid,
              lastPromotionOutcome: outcome,
              lastPromotionFromClass: prevClass,
              lastPromotionFromYear: canonicalSourceYear,
              updatedAt: nowIso,
              updatedBy: adminUser.uid,
            };

            if (outcome === 'PROMOTED' || outcome === 'RETAINED') {
              userUpdates.class = targetClass;
              userUpdates.section = targetSection;
              userUpdates.rollNumber = targetRoll;
              userUpdates.rollNo = targetRoll;
              userUpdates.academicStatus = 'ACTIVE';
            } else if (outcome === 'TRANSFERRED') {
              userUpdates.academicStatus = 'TRANSFERRED';
            } else if (outcome === 'GRADUATED') {
              userUpdates.class = 'Graduated';
              userUpdates.academicStatus = 'GRADUATED';
              userUpdates.isAlumni = true;
            } else if (outcome === 'INACTIVE') {
              userUpdates.academicStatus = 'INACTIVE';
            }

            tx.update(userRef, userUpdates);

            return {
              studentName,
              permanentStudentId,
              enrollmentId,
              prevClass,
              prevSection,
              prevRoll,
              targetClass,
              targetSection,
              targetRoll,
            };
          });

          // Track in-memory map for subsequent items in same batch
          existingTargetByUid.set(studentUid, { id: txnOut.enrollmentId, data: { createdAt: nowIso, createdBy: adminUser.uid } });

          if (outcome === 'PROMOTED') result.promotedCount++;
          else if (outcome === 'RETAINED') result.retainedCount++;
          else if (outcome === 'TRANSFERRED') result.transferredCount++;
          else if (outcome === 'GRADUATED') result.graduatedCount++;
          else result.skippedCount++;

          const summaryMsg = `${txnOut.studentName} -> ${outcome} (${txnOut.targetClass}${txnOut.targetRoll ? `, Sec ${txnOut.targetSection}, Roll ${txnOut.targetRoll}` : ''})`;
          result.details.push({
            studentUid,
            studentName: txnOut.studentName,
            outcome,
            enrollmentId: txnOut.enrollmentId,
            status: 'SUCCESS',
            message: summaryMsg,
          });

          const actionTypeMap: Record<string, string> = {
            PROMOTED: 'STUDENT_PROMOTED',
            RETAINED: 'STUDENT_RETAINED',
            TRANSFERRED: 'STUDENT_TRANSFERRED',
            GRADUATED: 'STUDENT_GRADUATED',
            INACTIVE: 'STUDENT_MARKED_INACTIVE',
          };

          await recordServerAuditLog({
            actorUid: adminUser.uid,
            actorEmail: adminUser.email,
            actorName,
            actorRole: adminUser.role,
            adminTier: adminUser.adminTier,
            targetType: 'student_enrollment',
            targetUid: studentUid,
            targetId: txnOut.enrollmentId,
            targetName: txnOut.studentName,
            studentUid,
            studentId: txnOut.permanentStudentId,
            studentName: txnOut.studentName,
            studentClass: txnOut.targetClass,
            academicYear: canonicalTargetYear,
            enrollmentId: txnOut.enrollmentId,
            previousValue: `${sourceBsYear} BS: Class ${txnOut.prevClass} (Sec ${txnOut.prevSection}) Roll ${txnOut.prevRoll || '-'}`,
            newValue: `${targetBsYear} BS: ${outcome} -> Class ${txnOut.targetClass} (Sec ${txnOut.targetSection}) Roll ${txnOut.targetRoll || '-'}`,
            beforeState: {
              academicYear: canonicalSourceYear,
              class: txnOut.prevClass,
              section: txnOut.prevSection,
              roll: txnOut.prevRoll,
            },
            afterState: {
              academicYear: canonicalTargetYear,
              class: txnOut.targetClass,
              section: txnOut.targetSection,
              roll: txnOut.targetRoll,
              outcome,
              enrollmentId: txnOut.enrollmentId,
            },
            action: actionTypeMap[outcome] || 'STUDENT_PROMOTED',
            category: 'academic',
            result: 'SUCCESS',
            reason: `Admin executed ${outcome} for ${txnOut.studentName} (${txnOut.permanentStudentId}) from ${sourceBsYear} BS to ${targetBsYear} BS.`,
          });
        } catch (studentErr: any) {
          console.error(`[PROMOTION] Error processing ${studentUid}:`, studentErr);
          result.failedCount++;
          const msg = studentErr?.message || 'Promotion failed for student.';
          result.errors.push({ studentUid, studentName: fallbackName, error: msg });
          result.details.push({ studentUid, studentName: fallbackName, outcome, status: 'FAILED', message: msg });
        }
      }

      return res.json({
        success: result.failedCount < result.totalSelected,
        ...result,
      });
    } catch (err: any) {
      console.error('[PROMOTION] Error in /api/academic/execute-promotion:', err);
      return res.status(500).json({ error: 'Internal server error executing academic promotion: ' + err.message });
    }
  });

  // Disabled payment gateways (cash-only)
  app.all(['/api/payment/esewa', '/api/payment/esewa/*', '/api/payment/khalti', '/api/payment/khalti/*'], (_req: Request, res: Response) => {
    res.status(501).json({
      error: 'Online payment gateways are disabled. Shikshantar Academy is currently cash-only.',
      code: 'CASH_ONLY_INSTITUTION',
      status: 501,
    });
  });

  // Trusted Audit Log Endpoint (Authenticated Admin/Teacher; derives actor identity authoritatively)
  app.post('/api/audit/log', rateLimiter(120, 60000), async (req: Request, res: Response) => {
    try {
      const caller = await verifyUserAuth(req, res);
      if (!caller) return;
      if (caller.role !== 'admin' && caller.role !== 'teacher') {
        return res.status(403).json({ error: 'Forbidden: Audit log creation is restricted to Administrators and Teachers.' });
      }

      const body = req.body || {};
      const actionType = String(body.actionType || body.action || '').trim();
      const reason = String(body.reason || '').trim();
      if (!actionType || !reason) {
        return res.status(400).json({ error: 'Missing required actionType or reason for audit log.' });
      }

      const db = getAdminDb();
      const now = new Date();
      const timestampIso = now.toISOString();
      const opId = String(body.operationId || body.correlationId || `OP_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`).replace(/[^a-zA-Z0-9_.-]/g, '_');

      const actorName = caller.userData?.fullName || caller.userData?.name || caller.email.split('@')[0] || 'User';
      const entry = {
        id: opId,
        auditLogId: opId,
        timestamp: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        timestampStr: `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
        date: timestampIso.split('T')[0],
        dateBS: String(body.dateBS || ''),
        category: String(body.category || 'system'),
        action: String(body.action || actionType),
        actionType,
        targetType: String(body.targetType || 'system'),
        targetId: String(body.targetId || ''),
        transactionId: String(body.transactionId || ''),
        receipt: String(body.receipt || 'N/A'),
        receiptNo: String(body.receiptNo || body.receipt || 'N/A'),
        paymentGroupId: String(body.paymentGroupId || ''),
        studentId: String(body.studentId || ''),
        studentUid: String(body.studentUid || ''),
        studentEmis: String(body.studentEmis || ''),
        studentName: String(body.studentName || ''),
        studentClass: String(body.studentClass || '-'),
        academicYear: String(body.academicYear || ''),
        enrollmentId: String(body.enrollmentId || ''),
        beforeState: body.beforeState ?? null,
        afterState: body.afterState ?? null,
        previousValue: String(body.previousValue || 'N/A'),
        newValue: String(body.newValue || 'N/A'),
        reason,
        result: String(body.result || 'SUCCESS'),
        operationId: opId,
        correlationId: String(body.correlationId || opId),
        // Authoritative server-verified actor fields (cannot be spoofed by client)
        actorUid: caller.uid,
        adminUid: caller.uid,
        actorName,
        adminName: actorName,
        actorEmail: caller.email,
        adminEmail: caller.email,
        actorRole: caller.role,
        adminTier: caller.adminTier,
        meta: typeof body.meta === 'object' && body.meta ? body.meta : {}
      };

      await db.collection('audit_logs').doc(opId).set(entry, { merge: true });
      if (body.includeLedger === true && caller.role === 'admin') {
        await db.collection('ledger_audit_logs').doc(opId).set(entry, { merge: true });
      }

      return res.json({ success: true, auditLogId: opId });
    } catch (err: any) {
      console.error('[SECURITY] Error writing authoritative audit log:', err);
      return res.status(500).json({ error: 'Failed to record authoritative audit log.' });
    }
  });

  // Trusted Admin User Creation Route (replaces secondaryApp/secondaryAuth client hack)
  app.post('/api/users/create', rateLimiter(20, 60000), async (req: Request, res: Response) => {
    try {
      const adminUser = await requireAdminAuth(req, res);
      if (!adminUser) return;

      const body = req.body || {};
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const fullName = String(body.fullName || '').trim();
      const role = String(body.role || '').trim().toLowerCase();
      const requestedTier = String(body.adminTier || 'secondary').trim().toLowerCase();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Please provide a valid email address.' });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      }
      if (!fullName) {
        return res.status(400).json({ error: 'Full name is required.' });
      }
      if (!['student', 'teacher', 'admin', 'guest'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role specified.' });
      }
      if (role === 'admin' && adminUser.adminTier !== 'primary') {
        return res.status(403).json({ error: 'Forbidden: Only Primary Administrators can create Administrator accounts.' });
      }

      const db = getAdminDb();

      // Reject duplicate email cleanly (no +reg subaddressing bypass)
      const existingUsers = await db.collection('users').where('email', '==', email).limit(1).get();
      if (!existingUsers.empty) {
        return res.status(409).json({ error: 'An account with this email already exists in the user registry.' });
      }

      try {
        await admin.auth().getUserByEmail(email);
        return res.status(409).json({ error: 'This email address is already registered in Firebase Authentication.' });
      } catch (lookupErr: any) {
        if (lookupErr?.code !== 'auth/user-not-found') {
          throw lookupErr;
        }
      }

      // Check EMIS uniqueness for students if provided
      const cleanEmis = String(body.emisNumber || '').trim();
      if (role === 'student' && cleanEmis) {
        const [e1, e2] = await Promise.all([
          db.collection('users').where('emisNumber', '==', cleanEmis).limit(1).get(),
          db.collection('users').where('studentEmis', '==', cleanEmis).limit(1).get()
        ]);
        if (!e1.empty || !e2.empty) {
          return res.status(409).json({ error: `EMIS number "${cleanEmis}" is already assigned to another student.` });
        }
      }

      // Generate authoritative sequential ID if not already provided
      let permanentId = String(body.permanentId || '').trim();
      if (!permanentId && (role === 'student' || role === 'teacher' || role === 'admin')) {
        const seqType = role === 'student' ? 'student_id' : role === 'teacher' ? 'teacher_id' : 'admin_id';
        const prefix = role === 'student' ? 'SA' : role === 'teacher' ? 'SAT' : 'SAA';
        permanentId = await db.runTransaction(async (txn) => {
          const seqRef = db.collection('document_sequences').doc(seqType);
          const seqSnap = await txn.get(seqRef);
          const nextNum = (seqSnap.exists ? Number(seqSnap.data()?.lastNumber || 0) : 0) + 1;
          txn.set(seqRef, { lastNumber: nextNum, updatedAt: new Date().toISOString() }, { merge: true });
          return `${prefix}${String(nextNum).padStart(4, '0')}`;
        });
      }

      const authRecord = await admin.auth().createUser({
        email,
        password,
        displayName: fullName,
        emailVerified: true
      });

      const uid = authRecord.uid;
      const nowIso = new Date().toISOString();
      const profilePayload: Record<string, any> = {
        uid,
        email,
        authEmail: email,
        fullName,
        role,
        active: true,
        status: 'approved',
        deleted: false,
        createdAt: nowIso,
        createdByUid: adminUser.uid
      };

      if (body.dob) profilePayload.dob = String(body.dob);
      if (body.dobBs) profilePayload.dobBs = String(body.dobBs);
      if (body.phone) profilePayload.phone = String(body.phone);
      if (body.address) profilePayload.address = String(body.address);

      if (role === 'admin') {
        profilePayload.adminTier = requestedTier === 'primary' && adminUser.adminTier === 'primary' ? 'primary' : 'secondary';
        profilePayload.adminId = permanentId;
        profilePayload.permanentAdminId = permanentId;
        profilePayload.staffId = permanentId;
      } else if (role === 'student') {
        profilePayload.permanentStudentId = permanentId;
        profilePayload.studentId = permanentId;
        profilePayload.emisNumber = cleanEmis;
        profilePayload.studentEmis = cleanEmis;
        profilePayload.class = String(body.class || '');
        profilePayload.section = String(body.section || 'A');
        profilePayload.rollNumber = String(body.rollNumber || '');
        profilePayload.rollNo = String(body.rollNumber || '');
        profilePayload.classAssignedYear = String(body.academicYear || '2083');
        profilePayload.linkedTeacherId = String(body.linkedTeacherId || '');
        profilePayload.guardianName = String(body.guardianName || '');
        if (body.guardianEmail) profilePayload.guardianEmail = String(body.guardianEmail).trim().toLowerCase();
        if (body.fatherName) profilePayload.fatherName = String(body.fatherName);
        if (body.motherName) profilePayload.motherName = String(body.motherName);
        if (body.caste) profilePayload.caste = String(body.caste);
        if (body.disability) profilePayload.disability = String(body.disability);
        if (body.gender) profilePayload.gender = String(body.gender);
        profilePayload.hasTransportation = String(body.hasTransportation || 'No');
        profilePayload.transportRoute = String(body.transportRoute || '');
        profilePayload.transportFee = profilePayload.hasTransportation === 'Yes' ? Number(body.transportFee || 0) : 0;
        profilePayload.hasComputer = String(body.hasComputer || 'No');
        profilePayload.computerFee = profilePayload.hasComputer === 'Yes' ? Number(body.computerFee || 0) : 0;
        profilePayload.scholarshipStatus = String(body.scholarshipStatus || 'Not Provided');
        profilePayload.scholarshipAmount = profilePayload.scholarshipStatus === 'Provided' ? Number(body.scholarshipAmount || 0) : 0;
      } else if (role === 'teacher') {
        profilePayload.permanentTeacherId = permanentId;
        profilePayload.teacherId = permanentId;
        profilePayload.staffId = permanentId;
        profilePayload.primaryClassTeacher = String(body.primaryClassTeacher || body.class || '');
        profilePayload.primaryClassTeacherSection = String(body.primaryClassTeacherSection || '');
        profilePayload.primaryClassTeacherYear = String(body.primaryClassTeacherYear || '');
        profilePayload.class = profilePayload.primaryClassTeacher;
        profilePayload.mainSubject = String(body.mainSubject || '');
        profilePayload.specialization = profilePayload.mainSubject;
        profilePayload.qualification = String(body.qualification || '');
        profilePayload.designation = String(body.designation || 'Teacher / Faculty');
        profilePayload.department = String(body.department || 'Academics');
        profilePayload.teachingAssignments = Array.isArray(body.teachingAssignments) ? body.teachingAssignments : [];
        profilePayload.assignmentKeys = Array.isArray(body.assignmentKeys) ? body.assignmentKeys : [];
        profilePayload.assignedClasses = Array.isArray(body.assignedClasses) ? body.assignedClasses : [];
        profilePayload.assignedSubjects = Array.isArray(body.assignedSubjects) ? body.assignedSubjects : [];
      }

      try {
        await db.collection('users').doc(uid).set(profilePayload);
      } catch (fsErr) {
        await admin.auth().deleteUser(uid).catch(() => {});
        throw fsErr;
      }

      await recordServerAuditLog({
        actorUid: adminUser.uid,
        actorEmail: adminUser.email,
        actorName: adminUser.userData?.fullName || adminUser.email,
        actorRole: adminUser.role,
        adminTier: adminUser.adminTier,
        targetUid: uid,
        targetId: permanentId || uid,
        action: 'USER_CREATED',
        category: 'security',
        result: 'SUCCESS',
        reason: `Admin created ${role} account (${email})`
      });

      return res.status(201).json({
        success: true,
        uid,
        permanentId,
        user: profilePayload
      });
    } catch (err: any) {
      console.error('[SECURITY] Error in /api/users/create:', err);
      return res.status(500).json({ error: err?.message || 'Failed to create user account.' });
    }
  });

  // Public Form Submissions (Server-side CAPTCHA Verification & Sanitization)
  app.post('/api/public/submit-admission', rateLimiter(10, 60000), async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const { verificationToken, formData: submittedForm } = body;
      const db = getAdminDb();

      const captchaCheck = await consumeVerificationToken(db, verificationToken);
      if (!captchaCheck.valid) {
        return res.status(400).json({ error: captchaCheck.error || 'CAPTCHA verification required.' });
      }

      const payloadSource = (submittedForm && typeof submittedForm === 'object') ? submittedForm : body;
      const sanitized: Record<string, any> = {};
      for (const [k, v] of Object.entries(payloadSource)) {
        if (['verificationToken', 'status', 'submittedAt', 'approved', 'reviewedBy', 'trackingId'].includes(k)) continue;
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          sanitized[k] = typeof v === 'string' ? v.trim().slice(0, 1000) : v;
        }
      }

      if (!sanitized.studentName && !sanitized.fullName) {
        return res.status(400).json({ error: 'Student name is required.' });
      }

      const currentBSYear = new Date().getFullYear() + 57;
      const trackingId = `SA-${currentBSYear}-${Date.now().toString().slice(-6)}`;

      const docRef = await db.collection('admissions').add({
        ...sanitized,
        trackingId,
        status: 'Pending',
        submittedAt: FieldValue.serverTimestamp(),
        submittedAtIso: new Date().toISOString()
      });

      return res.status(201).json({ success: true, id: docRef.id, trackingId });
    } catch (err: any) {
      console.error('[PUBLIC SUBMIT] Error submitting admission:', err);
      return res.status(500).json({ error: 'Failed to submit admission application.' });
    }
  });

  app.post('/api/public/submit-enquiry', rateLimiter(10, 60000), async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const { verificationToken } = body;
      const db = getAdminDb();

      const captchaCheck = await consumeVerificationToken(db, verificationToken);
      if (!captchaCheck.valid) {
        return res.status(400).json({ error: captchaCheck.error || 'CAPTCHA verification required.' });
      }

      const name = String(body.name || '').trim().slice(0, 200);
      const phone = String(body.phone || '').trim().slice(0, 40);
      const email = String(body.email || '').trim().slice(0, 200);
      const grade = String(body.grade || 'General Enquiry').trim().slice(0, 100);
      const message = String(body.message || '').trim().slice(0, 2000);
      const studentName = String(body.studentName || '').trim().slice(0, 200);

      if (!name || !phone || (!message && !studentName)) {
        return res.status(400).json({ error: 'Name, phone, and enquiry details are required.' });
      }

      const refId = `ENQ-${Date.now().toString().slice(-6)}`;
      const docRef = await db.collection('contact_enquiries').add({
        name,
        studentName,
        phone,
        email: email || 'N/A',
        grade,
        message,
        rawMessage: String(body.rawMessage || message).trim().slice(0, 2000),
        refId,
        status: 'unread',
        createdAt: new Date().toISOString(),
        submittedAt: FieldValue.serverTimestamp()
      });

      return res.status(201).json({ success: true, id: docRef.id, refId });
    } catch (err: any) {
      console.error('[PUBLIC SUBMIT] Error submitting enquiry:', err);
      return res.status(500).json({ error: 'Failed to submit contact enquiry.' });
    }
  });

  app.post('/api/public/submit-alumni', rateLimiter(10, 60000), async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const { verificationToken } = body;
      const db = getAdminDb();

      const captchaCheck = await consumeVerificationToken(db, verificationToken);
      if (!captchaCheck.valid) {
        return res.status(400).json({ error: captchaCheck.error || 'CAPTCHA verification required.' });
      }

      const name = String(body.name || '').trim().slice(0, 200);
      const batch = String(body.batch || 'SEE Batch 2082').trim().slice(0, 100);
      const currentStatus = String(body.currentStatus || '').trim().slice(0, 200);
      const organization = String(body.organization || '').trim().slice(0, 200);

      if (!name || !currentStatus || !organization) {
        return res.status(400).json({ error: 'Name, current status, and organization are required.' });
      }

      const docRef = await db.collection('alumni_submissions').add({
        name,
        graduationYear: `${batch} Alumni`,
        batch,
        class: 'Class 10',
        seeBand: String(body.seeBand || '3.80 GPA').trim().slice(0, 50),
        currentStatus,
        organization,
        degree: String(body.degree || '').trim().slice(0, 200),
        location: String(body.location || '').trim().slice(0, 200),
        quote: String(body.quote || '').trim().slice(0, 1500),
        achievement: String(body.achievement || '').trim().slice(0, 300),
        category: String(body.category || 'Technology').trim().slice(0, 80),
        photo: null,
        featured: false,
        isGuestRecommended: true,
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      return res.status(201).json({ success: true, id: docRef.id });
    } catch (err: any) {
      console.error('[PUBLIC SUBMIT] Error submitting alumni story:', err);
      return res.status(500).json({ error: 'Failed to submit alumni story.' });
    }
  });

  async function isTargetUserAdmin(targetUid: string): Promise<boolean> {
    const db = getAdminDb();
    try {
      const targetSnap = await db.collection('users').doc(targetUid).get();
      if (targetSnap.exists && String(targetSnap.data()?.role || '').trim().toLowerCase() === 'admin') {
        return true;
      }
    } catch (_) {}
    try {
      const targetAuthUser = await admin.auth().getUser(targetUid);
      const customClaims = targetAuthUser.customClaims || {};
      if (customClaims.role === 'admin' || customClaims.admin === true || (targetAuthUser.email || '').toLowerCase() === BOOTSTRAP_OWNER_EMAIL) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  // Delete single user auth
  app.post('/api/users/delete-auth', rateLimiter(30, 60000), async (req: Request, res: Response) => {
    try {
      const adminUser = await requireAdminAuth(req, res);
      if (!adminUser) return;

      const { uid } = req.body || {};
      if (!uid || typeof uid !== 'string' || !uid.trim()) {
        return res.status(400).json({ error: 'Missing or invalid target uid.' });
      }

      const targetUid = uid.trim();
      if (targetUid === adminUser.uid) {
        await recordServerAuditLog({
          actorUid: adminUser.uid,
          actorEmail: adminUser.email,
          actorRole: adminUser.role,
          adminTier: adminUser.adminTier,
          targetUid,
          action: 'USER_AUTH_DELETE_SELF_ATTEMPT',
          result: 'REJECTED',
          reason: 'Self-deletion prohibited',
          includeLedger: true
        });
        return res.status(400).json({ error: 'Administrators cannot delete their own authentication account.' });
      }

      // Check BOTH Firestore users/{uid}.role AND Auth customClaims for Secondary Admin protection
      if (adminUser.adminTier === 'secondary' && await isTargetUserAdmin(targetUid)) {
        return res.status(403).json({ error: 'Secondary administrators cannot delete other administrators.' });
      }

      try {
        await admin.auth().deleteUser(targetUid);
        await recordServerAuditLog({
          actorUid: adminUser.uid,
          actorEmail: adminUser.email,
          actorRole: adminUser.role,
          adminTier: adminUser.adminTier,
          targetUid,
          action: 'USER_AUTH_DELETED',
          result: 'SUCCESS',
          reason: 'Admin deleted user authentication account',
          includeLedger: true
        });
        return res.json({ success: true, message: 'User authentication record deleted successfully.' });
      } catch (authError: any) {
        if (authError.code === 'auth/user-not-found') {
          await recordServerAuditLog({
            actorUid: adminUser.uid,
            actorEmail: adminUser.email,
            actorRole: adminUser.role,
            adminTier: adminUser.adminTier,
            targetUid,
            action: 'USER_AUTH_DELETE_ATTEMPT',
            result: 'NOT_FOUND',
            reason: 'User auth account already deleted or does not exist',
            includeLedger: true
          });
          return res.json({ success: true, message: 'User authentication record already deleted.' });
        }
        await recordServerAuditLog({
          actorUid: adminUser.uid,
          actorEmail: adminUser.email,
          actorRole: adminUser.role,
          adminTier: adminUser.adminTier,
          targetUid,
          action: 'USER_AUTH_DELETE_FAILED',
          result: 'FAILED',
          reason: authError?.message || 'Firebase Auth deleteUser failure',
          includeLedger: true
        });
        return res.status(500).json({
          error: `Failed to delete Firebase Authentication record: ${authError?.message || 'Authentication service error'}`,
          code: authError?.code || 'AUTH_DELETION_FAILED'
        });
      }
    } catch (error) {
      console.error('[SECURITY] Unexpected error in /api/users/delete-auth:', error);
      return res.status(500).json({ error: 'Internal server error during account deletion.' });
    }
  });

  // Bulk delete user auth
  app.post('/api/users/delete-auth-bulk', rateLimiter(10, 60000), async (req: Request, res: Response) => {
    try {
      const adminUser = await requireAdminAuth(req, res);
      if (!adminUser) return;

      const { uids } = req.body || {};
      if (!uids || !Array.isArray(uids) || uids.length === 0 || uids.some((u: any) => typeof u !== 'string' || !u.trim())) {
        return res.status(400).json({ error: 'Missing or invalid uids array. Must be a non-empty array of strings.' });
      }

      const targetUids = uids.map((u: string) => u.trim()).filter((u: string) => u !== adminUser.uid);

      const results = await Promise.all(
        targetUids.map(async (uid: string) => {
          if (adminUser.adminTier === 'secondary' && await isTargetUserAdmin(uid)) {
            await recordServerAuditLog({
              actorUid: adminUser.uid,
              actorEmail: adminUser.email,
              actorRole: adminUser.role,
              adminTier: adminUser.adminTier,
              targetUid: uid,
              action: 'BULK_USER_AUTH_DELETE_FORBIDDEN',
              result: 'REJECTED',
              reason: 'Secondary admin attempted to delete administrator in bulk',
              includeLedger: true
            });
            return { uid, status: 'forbidden', error: 'Secondary administrators cannot delete administrators.' };
          }
          try {
            await admin.auth().deleteUser(uid);
            await recordServerAuditLog({
              actorUid: adminUser.uid,
              actorEmail: adminUser.email,
              actorRole: adminUser.role,
              adminTier: adminUser.adminTier,
              targetUid: uid,
              action: 'BULK_USER_AUTH_DELETED',
              result: 'SUCCESS',
              reason: 'Admin bulk deleted user auth account',
              includeLedger: true
            });
            return { uid, status: 'deleted' };
          } catch (authError: any) {
            if (authError.code === 'auth/user-not-found') {
              await recordServerAuditLog({
                actorUid: adminUser.uid,
                actorEmail: adminUser.email,
                actorRole: adminUser.role,
                adminTier: adminUser.adminTier,
                targetUid: uid,
                action: 'BULK_USER_AUTH_DELETE_ATTEMPT',
                result: 'NOT_FOUND',
                reason: 'User auth account already deleted or does not exist',
                includeLedger: true
              });
              return { uid, status: 'already_deleted' };
            }
            await recordServerAuditLog({
              actorUid: adminUser.uid,
              actorEmail: adminUser.email,
              actorRole: adminUser.role,
              adminTier: adminUser.adminTier,
              targetUid: uid,
              action: 'BULK_USER_AUTH_DELETE_FAILED',
              result: 'FAILED',
              reason: authError?.message || 'Firebase Auth bulk delete failure',
              includeLedger: true
            });
            return { uid, status: 'failed', error: authError?.message || 'Authentication service error' };
          }
        })
      );

      return res.json({ success: results.every(r => r.status === 'deleted' || r.status === 'already_deleted'), results });
    } catch (error) {
      console.error('[SECURITY] Unexpected error in /api/users/delete-auth-bulk:', error);
      return res.status(500).json({ error: 'Internal server error during bulk account deletion.' });
    }
  });

  // ==========================================
  // LOGIN SECURITY & SESSION MANAGEMENT
  // ==========================================

  function toFirestoreValue(val: any): any {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'string') return { stringValue: val };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') {
      return Number.isInteger(val) ? { integerValue: val.toString() } : { doubleValue: val };
    }
    if (Array.isArray(val)) {
      return { arrayValue: { values: val.map(toFirestoreValue) } };
    }
    if (typeof val === 'object') {
      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        fields[k] = toFirestoreValue(v);
      }
      return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
  }

  function fromFirestoreValue(val: any): any {
    if (!val) return null;
    if ('stringValue' in val) return val.stringValue;
    if ('booleanValue' in val) return val.booleanValue;
    if ('integerValue' in val) return parseInt(val.integerValue, 10);
    if ('doubleValue' in val) return val.doubleValue;
    if ('timestampValue' in val) return val.timestampValue;
    if ('nullValue' in val) return null;
    if ('arrayValue' in val) return (val.arrayValue.values || []).map(fromFirestoreValue);
    if ('mapValue' in val) {
      const obj: Record<string, any> = {};
      for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
        obj[k] = fromFirestoreValue(v);
      }
      return obj;
    }
    return null;
  }

  function fromFirestoreDoc(doc: any): any {
    if (!doc || !doc.fields) return null;
    const data: Record<string, any> = {};
    for (const [k, v] of Object.entries(doc.fields)) {
      data[k] = fromFirestoreValue(v);
    }
    return data;
  }

  function toFirestoreFields(data: Record<string, any>): Record<string, any> {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      fields[k] = toFirestoreValue(v);
    }
    return fields;
  }

  function isDeliverableRealEmail(email: string): boolean {
    const clean = String(email || '').trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return false;
    // Exclude synthetic student username aliases (e.g. std101@shikshantar.edu.np) that have no real mailbox
    if (clean.endsWith('@shikshantar.edu.np')) return false;
    return true;
  }

  function parseDeviceDetails(userAgent: string, clientBrowser?: unknown) {
    const ua = userAgent || '';
    let browser = 'Browser';
    let os = 'Unknown OS';
    let deviceType = 'Unknown Device';
    let deviceName = 'Unknown Device';

    const allowedClientBrowsers = new Set([
      'Brave',
      'Chrome',
      'Safari',
      'Firefox',
      'Edge',
      'Microsoft Edge',
      'Opera',
      'Vivaldi',
      'Samsung Internet',
      'Arc'
    ]);
    const cleanClientBrowser = typeof clientBrowser === 'string' ? clientBrowser.trim() : '';

    if (cleanClientBrowser && allowedClientBrowsers.has(cleanClientBrowser)) {
      browser = cleanClientBrowser === 'Microsoft Edge' ? 'Edge' : cleanClientBrowser;
    } else if (ua.includes('Edg/')) browser = 'Edge';
    else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera';
    else if (ua.includes('Vivaldi/')) browser = 'Vivaldi';
    else if (ua.includes('SamsungBrowser/')) browser = 'Samsung Internet';
    else if (ua.includes('Chrome/')) browser = 'Chrome';
    else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
    else if (ua.includes('Firefox/')) browser = 'Firefox';
    else if (ua.includes('MSIE') || ua.includes('Trident/')) browser = 'Internet Explorer';

    if (ua.includes('Windows') || ua.includes('Win32') || ua.includes('Win64')) os = 'Windows';
    else if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod')) os = 'iOS';
    else if (ua.includes('Macintosh') || ua.includes('Mac OS X')) os = 'macOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('Linux')) os = 'Linux';

    if (ua.includes('iPhone')) {
      deviceType = 'iPhone';
      deviceName = 'iPhone / iOS';
    } else if (ua.includes('iPad')) {
      deviceType = 'iPad';
      deviceName = 'iPad / iOS';
    } else if (ua.includes('Android')) {
      deviceType = ua.includes('Mobile') ? 'Android Phone' : 'Android Device';
      deviceName = `${deviceType} / Android`;
    } else if (os === 'macOS') {
      deviceType = 'MacBook';
      deviceName = 'MacBook / macOS';
    } else if (os === 'Windows') {
      deviceType = 'Windows PC';
      deviceName = 'Windows PC / Windows';
    } else if (os === 'Linux') {
      deviceType = 'Desktop';
      deviceName = 'Linux PC / Linux';
    } else {
      deviceType = 'Desktop';
      deviceName = 'Desktop Device';
    }

    return { browser, os, deviceType, deviceName, compositeName: `${browser} on ${os}` };
  }

  async function resolveApproximateLocation(ip: string, req?: Request): Promise<string> {
    // 0ms instant geolocation on Vercel Edge / Proxy headers
    if (req?.headers) {
      const rawCity = String(req.headers['x-vercel-ip-city'] || '').trim();
      const rawRegion = String(req.headers['x-vercel-ip-country-region'] || '').trim();
      const rawCountry = String(req.headers['x-vercel-ip-country'] || '').trim();
      if (rawCity || rawCountry) {
        const safeDecode = (s: string) => {
          try {
            return decodeURIComponent(s);
          } catch {
            return s;
          }
        };
        const parts = [safeDecode(rawCity), safeDecode(rawRegion), safeDecode(rawCountry)].filter(Boolean);
        if (parts.length > 0) {
          return parts.join(', ');
        }
      }
    }

    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.16.') || ip === 'localhost') {
      return 'Location unavailable';
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 900);
      const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          const parts = [data.city, data.regionName, data.country].filter(Boolean);
          if (parts.length > 0) {
            return parts.join(', ');
          }
        }
      }
    } catch {}

    return 'Location unavailable';
  }

  async function sendLoginAlertEmail(details: {
    toEmail: string;
    userName: string;
    deviceName: string;
    browser: string;
    operatingSystem: string;
    approximateLocation: string;
    ipAddress: string;
    dateTimeStr: string;
  }) {
    const subject = 'New Login to Your Shikshantar Academy Account';

    const textBody = `New login detected.

Account:
${details.userName}

Device:
${details.deviceName}

Browser:
${details.browser}

Operating System:
${details.operatingSystem}

Approximate Location:
${details.approximateLocation}

IP Address:
${details.ipAddress}

Date & Time:
${details.dateTimeStr}

If this was not you, open Login Activity in your profile and revoke the unfamiliar session.

OPEN SHIKSHANTAR ACADEMY WEBSITE:
https://www.shikshantaracademy.edu.np/`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
        <div style="margin-bottom: 20px;">
          <span style="display: inline-block; padding: 4px 10px; background-color: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 700; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Security Alert</span>
          <h2 style="margin: 8px 0 0 0; font-size: 20px; font-weight: 800; color: #0f172a;">New login detected.</h2>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px; font-size: 13px; line-height: 1.6;">
          <div style="margin-bottom: 10px;">
            <strong style="color: #64748b; font-size: 11px; text-transform: uppercase;">Account:</strong><br>
            <span style="font-weight: 700; color: #0f172a; font-size: 14px;">${details.userName}</span>
          </div>
          <div style="margin-bottom: 10px;">
            <strong style="color: #64748b; font-size: 11px; text-transform: uppercase;">Device:</strong><br>
            <span style="font-weight: 600; color: #334155;">${details.deviceName}</span>
          </div>
          <div style="margin-bottom: 10px;">
            <strong style="color: #64748b; font-size: 11px; text-transform: uppercase;">Browser:</strong><br>
            <span style="font-weight: 600; color: #334155;">${details.browser}</span>
          </div>
          <div style="margin-bottom: 10px;">
            <strong style="color: #64748b; font-size: 11px; text-transform: uppercase;">Operating System:</strong><br>
            <span style="font-weight: 600; color: #334155;">${details.operatingSystem}</span>
          </div>
          <div style="margin-bottom: 10px;">
            <strong style="color: #64748b; font-size: 11px; text-transform: uppercase;">Approximate Location:</strong><br>
            <span style="font-weight: 600; color: #334155;">${details.approximateLocation}</span>
          </div>
          <div style="margin-bottom: 10px;">
            <strong style="color: #64748b; font-size: 11px; text-transform: uppercase;">IP Address:</strong><br>
            <span style="font-family: monospace; font-weight: 600; color: #334155;">${details.ipAddress}</span>
          </div>
          <div>
            <strong style="color: #64748b; font-size: 11px; text-transform: uppercase;">Date & Time:</strong><br>
            <span style="font-weight: 600; color: #334155;">${details.dateTimeStr}</span>
          </div>
        </div>

        <p style="font-size: 13px; color: #475569; margin: 0 0 16px 0; line-height: 1.5;">
          If this was not you, open Login Activity in your profile and revoke the unfamiliar session.
        </p>

        <div style="margin: 20px 0; text-align: center;">
          <a href="https://www.shikshantaracademy.edu.np/" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #1e40af; color: #ffffff; padding: 12px 24px; font-size: 13px; font-weight: 700; text-decoration: none; border-radius: 8px; letter-spacing: 0.3px;">
            OPEN SHIKSHANTAR ACADEMY WEBSITE
          </a>
        </div>

        <div style="padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; text-align: center;">
          Shikshantar Academy • Security & Account Protection
        </div>
      </div>
    `;

    const smtpConfig = getSmtpTransportConfig();

    try {
      if (smtpConfig.configured && smtpConfig.transportOptions) {
        if ((sendLoginAlertEmail as any)._authCooldownUntilMs > Date.now()) {
          return {
            success: false,
            simulated: false,
            authFailed: true,
            error: 'SMTP authentication temporarily paused after provider credential rejection (verify Gmail App Password).'
          };
        }
        const transporter = nodemailer.createTransport(smtpConfig.transportOptions as any);
        await transporter.sendMail({
          from: `"Shikshantar Academy Security" <${smtpConfig.fromSecurity}>`,
          replyTo: smtpConfig.fromSecurity,
          to: details.toEmail,
          subject,
          text: textBody,
          html: htmlBody,
        });
        (sendLoginAlertEmail as any)._authCooldownUntilMs = 0;
        console.log(`[LOGIN SECURITY] Alert email sent successfully to ${details.toEmail}`);
        return { success: true };
      } else {
        console.log(`[LOGIN SECURITY SIMULATED] Alert email dispatched:\nTo: ${details.toEmail}\nSubject: ${subject}\nBody:\n${textBody}`);
        return { success: true, simulated: true };
      }
    } catch (err: any) {
      if (isSmtpAuthError(err)) {
        (sendLoginAlertEmail as any)._authCooldownUntilMs = Date.now() + 10 * 60 * 1000;
        console.info('[LOGIN SECURITY] Alert email delivery skipped: SMTP username/password not accepted by Gmail (requires 16-char Google App Password in SMTP_PASSWORD). Login flow continued normally.');
        return { success: false, authFailed: true, error: 'SMTP credentials rejected by mail provider.' };
      }
      console.info(`[LOGIN SECURITY] Alert email skipped due to transient SMTP error (${err?.code || 'SMTP_ERROR'}), continuing login flow.`);
      return { success: false, error: err?.message };
    }
  }

  function maskEmailAddress(email: string): string {
    const clean = String(email || '').trim();
    const parts = clean.split('@');
    if (parts.length !== 2) return clean;
    const [local, domain] = parts;
    if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
    return `${local.slice(0, 2)}${'*'.repeat(Math.min(6, Math.max(2, local.length - 3)))}${local.slice(-1)}@${domain}`;
  }

  function normalizeLocationKey(location: string): string {
    const norm = String(location || '').trim().toLowerCase();
    if (!norm || norm === 'unknown location' || norm === 'local network' || norm === 'localhost' || norm === 'unknown') {
      return '';
    }
    return norm.replace(/\s+/g, ' ');
  }

  function buildTrustedDeviceDocId(uid: string, rawToken: string): string {
    return resolveTrustedDeviceDocId(uid, rawToken);
  }

  function hashDeviceOtp(otp: string, salt: string): string {
    return crypto.createHash('sha256').update(`${salt}:${otp}`).digest('hex');
  }

  function escapeHtml(val: unknown): string {
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function dispatchSecurityEmail(params: {
    toEmail: string;
    subject: string;
    textBody: string;
    htmlBody: string;
    bypassCooldown?: boolean;
    logPrefix: string;
  }): Promise<{
    success: boolean;
    simulated?: boolean;
    authFailed?: boolean;
    senderEmail: string;
    errorCode?: string;
    errorHint?: string;
    error?: string;
  }> {
    const smtpConfig = getSmtpTransportConfig();

    // 1. Prefer Resend HTTPS API when RESEND_API_KEY is configured (sends authentically from securityalerts@shikshantaracademy.edu.np in ~150ms)
    if (smtpConfig.resendApiKey) {
      const officialFrom = smtpConfig.fromSecurity || 'securityalerts@shikshantaracademy.edu.np';
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 8000);
        const rRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${smtpConfig.resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: `Shikshantar Academy Security <${officialFrom}>`,
            reply_to: officialFrom,
            to: [params.toEmail],
            subject: params.subject,
            text: params.textBody,
            html: params.htmlBody
          }),
          signal: controller.signal
        });
        clearTimeout(tid);
        if (rRes.ok) {
          console.log(`[${params.logPrefix}] Sent via Resend (${officialFrom}) to ${maskEmailAddress(params.toEmail)}`);
          return { success: true, senderEmail: officialFrom };
        }
        const errBody = await rRes.text().catch(() => '');
        console.error(`[${params.logPrefix}] Resend API rejected (${rRes.status}):`, errBody.slice(0, 240));
        // Fall through to SMTP if SMTP is also configured
        if (!smtpConfig.transportOptions) {
          return {
            success: false,
            senderEmail: officialFrom,
            errorCode: `RESEND_${rRes.status}`,
            errorHint: 'Email provider rejected the sender domain or API key. Verify RESEND_API_KEY and domain DNS records.'
          };
        }
      } catch (resendErr: any) {
        console.error(`[${params.logPrefix}] Resend request error:`, resendErr?.message || resendErr);
        if (!smtpConfig.transportOptions) {
          return {
            success: false,
            senderEmail: officialFrom,
            errorCode: 'RESEND_NETWORK',
            errorHint: 'Could not reach the email delivery service. Please click Resend Code.'
          };
        }
      }
    }

    // 2. Nodemailer SMTP transport (with automatic Gmail port 465 <-> 587 TLS retry)
    const smtpSender = smtpConfig.fromSecurity || smtpConfig.user || 'securityalerts@shikshantaracademy.edu.np';
    if (!smtpConfig.configured || !smtpConfig.transportOptions) {
      console.log(`[${params.logPrefix} SIMULATED] Mail for ${maskEmailAddress(params.toEmail)} from ${smtpSender}`);
      return { success: true, simulated: true, senderEmail: smtpSender };
    }

    if (!params.bypassCooldown && (sendLoginAlertEmail as any)._authCooldownUntilMs > Date.now()) {
      return {
        success: false,
        simulated: false,
        authFailed: true,
        senderEmail: smtpSender,
        errorCode: 'SMTP_AUTH_FAILED',
        errorHint: 'Mail server rejected SMTP_USER / SMTP_PASSWORD. Verify your 16-character Google App Password in Vercel Environment Variables.'
      };
    }

    const sendWithOptions = async (opts: Record<string, any>, fromAddr: string) => {
      const transporter = nodemailer.createTransport(opts as any);
      await transporter.sendMail({
        from: `"Shikshantar Academy Security" <${fromAddr}>`,
        replyTo: smtpSender,
        to: params.toEmail,
        subject: params.subject,
        text: params.textBody,
        html: params.htmlBody
      });
    };

    try {
      await sendWithOptions(smtpConfig.transportOptions, smtpSender);
      (sendLoginAlertEmail as any)._authCooldownUntilMs = 0;
      console.log(`[${params.logPrefix}] Sent via SMTP (${smtpSender}) to ${maskEmailAddress(params.toEmail)}`);
      return { success: true, senderEmail: smtpSender };
    } catch (firstErr: any) {
      const errMsg = String(firstErr?.message || '');
      const isAuth = isSmtpAuthError(firstErr);

      // If Gmail/SMTP failed on TLS/port (not auth), immediately retry on alternate TLS port (465 <-> 587)
      if (!isAuth && smtpConfig.host.toLowerCase().includes('gmail')) {
        const altPort = smtpConfig.port === 465 ? 587 : 465;
        const altSecure = altPort === 465;
        const altOpts = {
          ...smtpConfig.transportOptions,
          port: altPort,
          secure: altSecure,
          ...(altPort === 587 ? { requireTLS: true } : { requireTLS: undefined })
        };
        try {
          await sendWithOptions(altOpts, smtpConfig.user || smtpSender);
          (sendLoginAlertEmail as any)._authCooldownUntilMs = 0;
          console.log(`[${params.logPrefix}] Sent via SMTP fallback port ${altPort} to ${maskEmailAddress(params.toEmail)}`);
          return { success: true, senderEmail: smtpConfig.user || smtpSender };
        } catch (retryErr: any) {
          console.error(`[${params.logPrefix}] SMTP fallback port ${altPort} failed:`, retryErr?.code || retryErr?.message);
          firstErr = retryErr;
        }
      }

      if (isSmtpAuthError(firstErr)) {
        (sendLoginAlertEmail as any)._authCooldownUntilMs = Date.now() + 2 * 60 * 1000;
        console.error(`[${params.logPrefix}] SMTP auth rejected by mail provider (${firstErr?.code || 'EAUTH'}).`);
        return {
          success: false,
          authFailed: true,
          senderEmail: smtpSender,
          errorCode: 'SMTP_AUTH_FAILED',
          errorHint: 'Gmail rejected SMTP login credentials. Generate a fresh 16-character Google App Password for SMTP_PASSWORD in Vercel and redeploy.',
          error: 'SMTP credentials rejected by mail provider.'
        };
      }

      const code = String(firstErr?.code || 'SMTP_ERROR');
      console.error(`[${params.logPrefix}] SMTP delivery failed (${code}):`, errMsg);
      return {
        success: false,
        senderEmail: smtpSender,
        errorCode: code,
        errorHint: `Email server could not deliver the code (${code}). Please click Resend Code or check SMTP settings.`,
        error: errMsg || 'Failed to dispatch verification email.'
      };
    }
  }

  async function sendDeviceVerificationOtpEmail(details: {
    toEmail: string;
    userName: string;
    otpCode: string;
    reasonLabel: string;
    deviceName: string;
    browser: string;
    operatingSystem: string;
    approximateLocation: string;
    ipAddress: string;
    dateTimeStr: string;
    expiresMinutes: number;
    bypassCooldown?: boolean;
  }): Promise<{
    success: boolean;
    simulated?: boolean;
    authFailed?: boolean;
    senderEmail: string;
    errorCode?: string;
    errorHint?: string;
    error?: any;
  }> {
    const subject = `Security Verification Code (${details.otpCode}) – Shikshantar Academy`;
    const textBody = [
      `SHIKSHANTAR ACADEMY`,
      `Karjanha Municipality, Bastipur-05, Siraha, Nepal`,
      '',
      `Dear ${details.userName},`,
      '',
      `A sign-in attempt to your Shikshantar Academy Portal account was detected from a ${details.reasonLabel}.`,
      `Use the 6-digit verification code below to confirm this device:`,
      '',
      `Verification Code: ${details.otpCode}`,
      `Expires in: ${details.expiresMinutes} minutes`,
      '',
      `Device: ${details.deviceName}`,
      `Browser: ${details.browser}`,
      `Operating System: ${details.operatingSystem}`,
      `Approximate Location: ${details.approximateLocation}`,
      `IP Address: ${details.ipAddress}`,
      `Date & Time: ${details.dateTimeStr}`,
      '',
      `If you did NOT attempt this sign-in, DO NOT share this code with anyone and change your password immediately.`,
      '',
      `Regards,`,
      `Shikshantar Academy Security Team`
    ].join('\n');

    const safeName = escapeHtml(details.userName);
    const safeReason = escapeHtml(details.reasonLabel);
    const safeDevice = escapeHtml(details.deviceName);
    const safeBrowser = escapeHtml(details.browser);
    const safeOs = escapeHtml(details.operatingSystem);
    const safeLocation = escapeHtml(details.approximateLocation);
    const safeIp = escapeHtml(details.ipAddress);
    const safeTime = escapeHtml(details.dateTimeStr);
    const spacedOtp = escapeHtml(details.otpCode).split('').join(' ');

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
        <div style="background: #0a2540; padding: 20px 24px; border-bottom: 3px solid #f1c40f;">
          <div style="font-size: 16px; font-weight: 800; color: #ffffff; letter-spacing: 0.4px;">SHIKSHANTAR ACADEMY</div>
          <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">Karjanha Municipality, Bastipur-05, Siraha &bull; Account Security</div>
        </div>

        <div style="padding: 24px;">
          <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #0f172a;">Confirm your sign-in, ${safeName}</h2>
          <p style="font-size: 14px; color: #475569; margin: 0 0 18px 0; line-height: 1.55;">
            We detected a sign-in attempt to your Shikshantar Academy account from a <strong>${safeReason}</strong>. Enter the 6-digit security code below to continue:
          </p>

          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 18px; text-align: center; margin-bottom: 18px;">
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">One-Time Security Code</div>
            <div style="font-size: 32px; font-weight: 800; color: #0a2540; letter-spacing: 6px; font-family: 'SFMono-Regular', Consolas, monospace;">${spacedOtp}</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 6px;">Valid for ${details.expiresMinutes} minutes &bull; Single use only</div>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 18px; font-size: 13px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 4px 0; color: #64748b; width: 42%;">Device</td><td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${safeDevice}</td></tr>
              <tr><td style="padding: 4px 0; color: #64748b;">Browser &amp; OS</td><td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${safeBrowser} &bull; ${safeOs}</td></tr>
              <tr><td style="padding: 4px 0; color: #64748b;">Approx. Location</td><td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${safeLocation}</td></tr>
              <tr><td style="padding: 4px 0; color: #64748b;">IP Address</td><td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${safeIp}</td></tr>
              <tr><td style="padding: 4px 0; color: #64748b;">Date &amp; Time</td><td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${safeTime}</td></tr>
            </table>
          </div>

          <p style="font-size: 12px; color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 12px; margin: 0 0 16px 0; line-height: 1.5;">
            <strong>Didn't try to sign in?</strong> Ignore this email — the sign-in is blocked without this code. Never share this code with anyone and update your password immediately.
          </p>

          <div style="padding-top: 14px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; text-align: center;">
            Shikshantar Academy &bull; Karjanha Municipality, Bastipur-05, Siraha, Nepal
          </div>
        </div>
      </div>
    `;

    return dispatchSecurityEmail({
      toEmail: details.toEmail,
      subject,
      textBody,
      htmlBody,
      bypassCooldown: details.bypassCooldown,
      logPrefix: 'DEVICE OTP'
    });
  }

  // 1. Record Login Event with Risk-Based Device Trust & New Browser/Location OTP Gate
  app.post('/api/auth/record-login', rateLimiter(30, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res, { allowPendingDeviceVerification: true });
      if (!authUser) return;

      const { sessionId, loginEventId, deviceTrustToken, clientBrowser } = req.body || {};
      if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
        return res.status(400).json({ error: 'Missing or invalid sessionId.' });
      }

      const parsedCookies = parseCookieHeader(req);
      const cleanSessionId = sessionId.trim();
      const cleanLoginEventId = (typeof loginEventId === 'string' && loginEventId.trim())
        ? loginEventId.trim()
        : `login_${authUser.uid}_${Date.now()}`;
      const incomingTrustToken = (
        typeof deviceTrustToken === 'string' && deviceTrustToken.trim()
          ? deviceTrustToken.trim()
          : String(req.headers['x-shikshantar-device-token'] || parsedCookies.shikshantar_dt || '').trim()
      );

      const db = getAdminDb();
      const nowMs = getEffectiveNowMs(req);
      const normEmail = String(authUser.email || '').trim().toLowerCase();
      if (normEmail && !shouldSkipAdminFirestore()) {
        try {
          const acctKey = `login_acct_${crypto.createHash('sha256').update(normEmail).digest('hex').slice(0, 32)}`;
          const acctSnap = await db.collection('security_rate_limits').doc(acctKey).get();
          const lockedUntilMs = Number(acctSnap.data()?.lockedUntilMs || 0);
          if (lockedUntilMs > nowMs) {
            const retryAfterSeconds = Math.ceil((lockedUntilMs - nowMs) / 1000);
            return res.status(423).json({
              error: `Account is temporarily locked for ${Math.ceil(retryAfterSeconds / 60)} minute(s). Please wait before signing in.`,
              locked: true,
              retryAfterSeconds,
              lockedUntil: new Date(lockedUntilMs).toISOString()
            });
          }
        } catch (lockErr: any) {
          if (!isAdminCredentialError(lockErr)) throw lockErr;
          markAdminCredentialsUnavailable();
        }
      }

      const userData = authUser.userData || {};
      const userName = userData.fullName || userData.name || authUser.email.split('@')[0];
      const userRole = authUser.role;
      const activeSessions: string[] = Array.isArray(userData.activeSessions) ? [...userData.activeSessions] : [];
      // Enforce 6-digit email OTP on unrecognized devices for ALL accounts with a real deliverable email
      const requiresDeviceOtp =
        (userRole === 'admin' || userRole === 'teacher' || userRole === 'student') &&
        isDeliverableRealEmail(authUser.email);

      const sessionDoc = await hybridGetDoc(db, authUser.rawToken, 'user_sessions', cleanSessionId);
      const existingSession: any = sessionDoc.exists ? sessionDoc.data : null;

      if (existingSession && existingSession.userUid && existingSession.userUid !== authUser.uid) {
        return res.status(403).json({ error: 'Forbidden: Session identifier belongs to another user.' });
      }
      if (existingSession && existingSession.status === 'REVOKED') {
        return res.status(401).json({ error: 'Session has been revoked. Please sign in again.', revoked: true });
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const ua = req.headers['user-agent'] || '';
      const device = parseDeviceDetails(ua, clientBrowser);
      const forwarded = req.headers['x-forwarded-for'];
      const ip = typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : (req.socket.remoteAddress || req.ip || '127.0.0.1');
      const location = await resolveApproximateLocation(ip, req);
      const dateTimeFormatted = now.toLocaleDateString('en-US', {
        timeZone: 'Asia/Kathmandu',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }) + ', ' + now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kathmandu',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }) + ' NPT';
      const smtpConfig = getSmtpTransportConfig();
      const isSecureReq = req.secure || req.headers['x-forwarded-proto'] === 'https';
      const cookieOpts = {
        httpOnly: true,
        path: '/api',
        sameSite: (isSecureReq ? 'none' : 'lax') as 'none' | 'lax',
        secure: isSecureReq,
        maxAge: 30 * 24 * 60 * 60 * 1000
      };
      const currentSessionSeal = issueSessionSeal(authUser.uid, cleanSessionId);

      // A. Existing ACTIVE session refresh -> touch lastActiveAt only (ZERO duplicate emails!)
      const existingSessionSealValid = existingSession && (
        verifySessionSeal(authUser.uid, cleanSessionId, existingSession.sessionSeal) ||
        !requiresDeviceOtp ||
        (!sessionDoc.viaRest && !existingSession.sessionSeal)
      );
      if (existingSession && existingSession.status === 'ACTIVE' && existingSessionSealValid) {
        if (!activeSessions.includes(cleanSessionId)) {
          await syncUserSessionState(db, authUser.rawToken, authUser.uid, {
            addSessionId: cleanSessionId
          });
        }
        await hybridSetDoc(
          db,
          authUser.rawToken,
          'user_sessions',
          cleanSessionId,
          {
            userUid: authUser.uid,
            status: 'ACTIVE',
            sessionSeal: existingSession.sessionSeal || currentSessionSeal,
            lastActiveAt: nowIso,
            updatedAt: nowIso
          },
          { merge: true }
        );
        res.cookie('shikshantar_sid', cleanSessionId, cookieOpts);
        return res.json({
          success: true,
          alreadyProcessed: true,
          requiresDeviceVerification: false,
          sessionId: cleanSessionId,
          session: { ...existingSession, lastActiveAt: nowIso, updatedAt: nowIso }
        });
      }

      // B. Existing PENDING_VERIFICATION session refresh -> reuse active challenge without spamming new OTPs
      if (existingSession && existingSession.status === 'PENDING_VERIFICATION' && requiresDeviceOtp) {
        let activeChallenge: any = null;
        let reusedChallengeToken = '';
        if (!shouldSkipAdminFirestore()) {
          try {
            const challengeSnap = await db.collection('device_verification_challenges').doc(cleanSessionId).get();
            const ch = challengeSnap.exists ? challengeSnap.data() : null;
            if (ch && ch.status === 'PENDING' && Number(ch.expiresAtMs || 0) > nowMs) {
              activeChallenge = ch;
              reusedChallengeToken = issueSignedOtpChallengeToken({
                uid: authUser.uid,
                sid: cleanSessionId,
                h: String(ch.otpHash || ''),
                s: String(ch.otpSalt || ''),
                r: String(ch.reason || existingSession.verificationReason || 'NEW_BROWSER_OR_DEVICE'),
                b: String(ch.browser || existingSession.browser || device.browser),
                o: String(ch.os || existingSession.operatingSystem || device.os),
                d: String(ch.deviceName || existingSession.deviceName || device.deviceName),
                loc: String(ch.location || existingSession.approximateLocation || location),
                ip: String(ch.ipAddress || existingSession.ipAddress || ip),
                rc: Number(ch.resendCount || 0),
                ls: Number(ch.lastSentAtMs || nowMs),
                exp: Number(ch.expiresAtMs || nowMs + 600000),
                ed: ch.emailDispatched === true,
                sn: ch.smtpNotConfigured === true
              });
            }
          } catch (chErr: any) {
            if (!isAdminCredentialError(chErr)) throw chErr;
            markAdminCredentialsUnavailable();
          }
        }

        if (!activeChallenge && parsedCookies.shikshantar_otp_ch) {
          const parsedSignedCh = verifySignedOtpChallengeToken(
            parsedCookies.shikshantar_otp_ch,
            authUser.uid,
            cleanSessionId
          );
          if (parsedSignedCh && Number(parsedSignedCh.exp || 0) > nowMs) {
            const attemptKey = `${authUser.uid}:${cleanSessionId}:${parsedSignedCh.s}`;
            const attemptState = statelessOtpAttempts.get(attemptKey);
            if (!attemptState?.locked) {
              activeChallenge = {
                reason: parsedSignedCh.r,
                expiresAtMs: parsedSignedCh.exp,
                lastSentAtMs: parsedSignedCh.ls,
                emailDispatched: parsedSignedCh.ed,
                smtpNotConfigured: parsedSignedCh.sn
              };
              reusedChallengeToken = parsedCookies.shikshantar_otp_ch;
            }
          }
        }

        if (activeChallenge) {
          const remainingSec = Math.max(1, Math.ceil((Number(activeChallenge.expiresAtMs) - nowMs) / 1000));
          const cooldownLeft = Math.max(0, Math.ceil(((Number(activeChallenge.lastSentAtMs || 0) + 60000) - nowMs) / 1000));
          return res.json({
            success: true,
            requiresDeviceVerification: true,
            sessionId: cleanSessionId,
            verification: {
              sessionId: cleanSessionId,
              maskedEmail: maskEmailAddress(authUser.email),
              senderEmail: smtpConfig.fromSecurity || 'securityalerts@shikshantaracademy.edu.np',
              reason: activeChallenge.reason || existingSession.verificationReason || 'NEW_BROWSER_OR_DEVICE',
              browser: existingSession.browser || device.browser,
              os: existingSession.operatingSystem || device.os,
              deviceName: existingSession.deviceName || device.deviceName,
              location: existingSession.approximateLocation || location,
              ipAddress: existingSession.ipAddress || ip,
              expiresInSeconds: remainingSec,
              resendCooldownSeconds: cooldownLeft,
              emailDispatched: activeChallenge.emailDispatched === true,
              smtpNotConfigured: activeChallenge.smtpNotConfigured === true,
              challengeToken: reusedChallengeToken || undefined
            }
          });
        }
      }

      // C. Evaluate Trusted Devices for this user
      const TRUST_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
      const trustedQuery = await hybridQueryEq(
        db,
        authUser.rawToken,
        'trusted_devices',
        'userUid',
        authUser.uid
      );
      const activeTrustedDocs = trustedQuery.docs.filter((d) => {
        const data = d.data || {};
        return data.revoked !== true && Number(data.expiresAtMs || 0) > nowMs;
      });
      // Once a user has EVER been enrolled (even if all trusted devices were later revoked or expired),
      // NEVER auto-trust a new device without passing 6-digit OTP verification!
      const hasPriorEnrollment =
        userData.deviceVerificationEnforced === true ||
        trustedQuery.docs.length > 0;

      const currentLocKey = normalizeLocationKey(location);
      let matchedTrustDocId: string | null = null;
      let upgradedTrustToken: string | null = null;
      let verificationReason: 'NEW_BROWSER_OR_DEVICE' | 'NEW_LOCATION' | 'DEVICE_MISMATCH' | null = null;

      if (activeTrustedDocs.length === 0 && !hasPriorEnrollment) {
        // First trusted device ever -> register automatically as Trusted Device #1
        const issuedFirst = issueSignedTrustToken({
          uid: authUser.uid,
          browser: device.browser,
          os: device.os,
          locationKey: currentLocKey,
          nowMs,
          ttlMs: TRUST_TTL_MS
        });
        const firstTrustToken = issuedFirst.token;
        const firstTrustDocId = issuedFirst.deviceId;
        await hybridSetDoc(db, authUser.rawToken, 'trusted_devices', firstTrustDocId, {
          userUid: authUser.uid,
          email: authUser.email,
          role: userRole,
          browser: device.browser,
          os: device.os,
          deviceName: device.deviceName,
          lastLocation: location,
          lastIp: ip,
          revoked: false,
          signedTrust: true,
          createdAt: nowIso,
          lastUsedAt: nowIso,
          expiresAtMs: nowMs + TRUST_TTL_MS
        });

        await syncUserSessionState(db, authUser.rawToken, authUser.uid, {
          addSessionId: cleanSessionId,
          enforceDeviceVerification: requiresDeviceOtp
        });

        let emailResult: { success: boolean; simulated?: boolean; error?: any } = { success: false, error: 'Email skipped' };
        if (authUser.email) {
          emailResult = await sendLoginAlertEmail({
            toEmail: authUser.email,
            userName,
            deviceName: device.deviceName,
            browser: device.browser,
            operatingSystem: device.os,
            approximateLocation: location,
            ipAddress: ip,
            dateTimeStr: dateTimeFormatted
          });
        }

        const realEmailSent = emailResult.success === true && emailResult.simulated !== true;
        const sessionData = {
          sessionId: cleanSessionId,
          userUid: authUser.uid,
          loginEventId: cleanLoginEventId,
          email: authUser.email,
          userName,
          role: userRole,
          loginAt: existingSession?.loginAt || nowIso,
          lastActiveAt: nowIso,
          revokedAt: null,
          logoutAt: null,
          status: 'ACTIVE',
          sessionSeal: currentSessionSeal,
          ipAddress: ip,
          approximateLocation: location,
          userAgent: ua,
          deviceType: device.deviceType,
          deviceName: device.deviceName,
          browser: device.browser,
          operatingSystem: (device as any).operatingSystem || device.os,
          compositeName: device.compositeName,
          trustedDeviceRegistered: true,
          emailSent: realEmailSent,
          emailSentAt: realEmailSent ? nowIso : null,
          createdAt: existingSession?.createdAt || nowIso,
          updatedAt: nowIso
        };
        await hybridSetDoc(db, authUser.rawToken, 'user_sessions', cleanSessionId, sessionData, { merge: true });

        await recordServerAuditLog({
          actorUid: authUser.uid,
          actorEmail: authUser.email,
          actorName: userName,
          actorRole: userRole,
          adminTier: authUser.adminTier,
          targetUid: authUser.uid,
          action: 'TRUSTED_DEVICE_REGISTERED',
          result: 'SUCCESS',
          reason: `First trusted device registered: ${device.compositeName} (${location}, IP: ${ip})`
        });

        res.cookie('shikshantar_sid', cleanSessionId, cookieOpts);
        res.cookie('shikshantar_dt', firstTrustToken, cookieOpts);

        return res.json({
          success: true,
          requiresDeviceVerification: false,
          trustedDeviceRegistered: true,
          deviceTrustToken: firstTrustToken,
          sessionId: cleanSessionId,
          session: sessionData
        });
      }

      // Check if incoming token cryptographically matches an active trusted device
      if (incomingTrustToken) {
        const signedTrust = verifySignedTrustToken(incomingTrustToken, authUser.uid, nowMs);
        if (signedTrust) {
          const candidateDoc = activeTrustedDocs.find((d) => d.id === signedTrust.did);
          if (candidateDoc) {
            const tData = candidateDoc.data || {};
            const browserOsMatch =
              String(tData.browser || signedTrust.b || '') === String(device.browser || '') &&
              String(tData.os || signedTrust.o || '') === String(device.os || '');
            const savedLocKey = normalizeLocationKey(String(tData.lastLocation || signedTrust.l || ''));
            const locationChanged = Boolean(savedLocKey && currentLocKey && savedLocKey !== currentLocKey);

            if (!browserOsMatch) {
              verificationReason = 'DEVICE_MISMATCH';
            } else if (locationChanged) {
              verificationReason = 'NEW_LOCATION';
            } else {
              matchedTrustDocId = candidateDoc.id;
            }
          } else {
            verificationReason = 'NEW_BROWSER_OR_DEVICE';
          }
        } else if (!trustedQuery.viaRest) {
          // Legacy unsigned token only honored when verified by Admin SDK (never forged via REST)
          const legacyDocId = buildTrustedDeviceDocId(authUser.uid, incomingTrustToken);
          const candidateDoc = activeTrustedDocs.find((d) => d.id === legacyDocId);
          if (candidateDoc && candidateDoc.data?.signedTrust !== true) {
            const tData = candidateDoc.data || {};
            const browserOsMatch =
              String(tData.browser || '') === String(device.browser || '') &&
              String(tData.os || '') === String(device.os || '');
            const savedLocKey = normalizeLocationKey(String(tData.lastLocation || ''));
            const locationChanged = Boolean(savedLocKey && currentLocKey && savedLocKey !== currentLocKey);

            if (!browserOsMatch) {
              verificationReason = 'DEVICE_MISMATCH';
            } else if (locationChanged) {
              verificationReason = 'NEW_LOCATION';
            } else {
              matchedTrustDocId = candidateDoc.id;
              upgradedTrustToken = issueSignedTrustToken({
                uid: authUser.uid,
                deviceId: candidateDoc.id,
                browser: device.browser,
                os: device.os,
                locationKey: currentLocKey,
                nowMs,
                ttlMs: TRUST_TTL_MS
              }).token;
            }
          } else {
            verificationReason = 'NEW_BROWSER_OR_DEVICE';
          }
        } else {
          verificationReason = 'NEW_BROWSER_OR_DEVICE';
        }
      } else {
        verificationReason = 'NEW_BROWSER_OR_DEVICE';
      }

      // D. Known trusted browser + matching location -> instant sign-in, ZERO email spam
      if (matchedTrustDocId) {
        await hybridSetDoc(
          db,
          authUser.rawToken,
          'trusted_devices',
          matchedTrustDocId,
          {
            userUid: authUser.uid,
            lastUsedAt: nowIso,
            lastIp: ip,
            signedTrust: true,
            ...(currentLocKey ? { lastLocation: location } : {}),
            expiresAtMs: nowMs + TRUST_TTL_MS
          },
          { merge: true }
        );

        await syncUserSessionState(db, authUser.rawToken, authUser.uid, {
          addSessionId: cleanSessionId,
          enforceDeviceVerification: requiresDeviceOtp
        });

        const sessionData = {
          sessionId: cleanSessionId,
          userUid: authUser.uid,
          loginEventId: cleanLoginEventId,
          email: authUser.email,
          userName,
          role: userRole,
          loginAt: existingSession?.loginAt || nowIso,
          lastActiveAt: nowIso,
          revokedAt: null,
          logoutAt: null,
          status: 'ACTIVE',
          sessionSeal: currentSessionSeal,
          ipAddress: ip,
          approximateLocation: location,
          userAgent: ua,
          deviceType: device.deviceType,
          deviceName: device.deviceName,
          browser: device.browser,
          operatingSystem: (device as any).operatingSystem || device.os,
          compositeName: device.compositeName,
          trustedDeviceMatched: true,
          emailSent: false,
          emailSentAt: null,
          createdAt: existingSession?.createdAt || nowIso,
          updatedAt: nowIso
        };
        await hybridSetDoc(db, authUser.rawToken, 'user_sessions', cleanSessionId, sessionData, { merge: true });

        await recordServerAuditLog({
          actorUid: authUser.uid,
          actorEmail: authUser.email,
          actorName: userName,
          actorRole: userRole,
          adminTier: authUser.adminTier,
          targetUid: authUser.uid,
          action: 'USER_LOGIN',
          result: 'SUCCESS',
          reason: `Trusted device sign-in from ${device.compositeName} (${location}, IP: ${ip})`
        });

        const finalTrustToken = upgradedTrustToken || incomingTrustToken;
        res.cookie('shikshantar_sid', cleanSessionId, cookieOpts);
        if (finalTrustToken) {
          res.cookie('shikshantar_dt', finalTrustToken, cookieOpts);
        }

        return res.json({
          success: true,
          requiresDeviceVerification: false,
          trustedDeviceMatched: true,
          ...(upgradedTrustToken ? { deviceTrustToken: upgradedTrustToken } : {}),
          sessionId: cleanSessionId,
          session: sessionData
        });
      }

      // E. Unrecognized Browser/Device or New Location
      const finalReason = verificationReason || 'NEW_BROWSER_OR_DEVICE';
      if (requiresDeviceOtp && authUser.email) {
        const otpCode = crypto.randomInt(100000, 1000000).toString();
        const otpSalt = crypto.randomBytes(16).toString('hex');
        const otpHash = hashOtpKeyed(otpCode, otpSalt);
        const expiresMinutes = 10;
        const expiresAtMs = nowMs + expiresMinutes * 60 * 1000;
        const reasonLabel =
          finalReason === 'NEW_LOCATION'
            ? `new location (${location})`
            : finalReason === 'DEVICE_MISMATCH'
              ? 'different browser or device profile'
              : 'new browser or unrecognized device';

        // Run PENDING_VERIFICATION session save and OTP email dispatch in parallel for sub-second speed
        const [, otpEmailResult] = await Promise.all([
          hybridSetDoc(
            db,
            authUser.rawToken,
            'user_sessions',
            cleanSessionId,
            {
              sessionId: cleanSessionId,
              userUid: authUser.uid,
              loginEventId: cleanLoginEventId,
              email: authUser.email,
              userName,
              role: userRole,
              loginAt: existingSession?.loginAt || nowIso,
              lastActiveAt: nowIso,
              revokedAt: null,
              logoutAt: null,
              status: 'PENDING_VERIFICATION',
              sessionSeal: null,
              verificationReason: finalReason,
              ipAddress: ip,
              approximateLocation: location,
              userAgent: ua,
              deviceType: device.deviceType,
              deviceName: device.deviceName,
              browser: device.browser,
              operatingSystem: (device as any).operatingSystem || device.os,
              compositeName: device.compositeName,
              emailSent: false,
              createdAt: existingSession?.createdAt || nowIso,
              updatedAt: nowIso
            },
            { merge: true }
          ),
          sendDeviceVerificationOtpEmail({
            toEmail: authUser.email,
            userName,
            otpCode,
            reasonLabel,
            deviceName: device.deviceName,
            browser: device.browser,
            operatingSystem: device.os,
            approximateLocation: location,
            ipAddress: ip,
            dateTimeStr: dateTimeFormatted,
            expiresMinutes
          })
        ]);

        const realOtpDispatched = otpEmailResult.success === true && otpEmailResult.simulated !== true;
        const smtpNotConfigured = otpEmailResult.simulated === true;

        const signedChallengeToken = issueSignedOtpChallengeToken({
          uid: authUser.uid,
          sid: cleanSessionId,
          h: otpHash,
          s: otpSalt,
          r: finalReason,
          b: device.browser,
          o: device.os,
          d: device.deviceName,
          loc: location,
          ip,
          rc: 0,
          ls: nowMs,
          exp: expiresAtMs,
          ed: realOtpDispatched,
          sn: smtpNotConfigured
        });

        if (!shouldSkipAdminFirestore()) {
          try {
            await db.collection('device_verification_challenges').doc(cleanSessionId).set({
              sessionId: cleanSessionId,
              userUid: authUser.uid,
              email: authUser.email,
              role: userRole,
              reason: finalReason,
              otpHash,
              otpSalt,
              hashVersion: 'hmac_v1',
              attempts: 0,
              maxAttempts: 5,
              resendCount: 0,
              maxResends: 5,
              status: 'PENDING',
              browser: device.browser,
              os: device.os,
              deviceName: device.deviceName,
              location,
              ipAddress: ip,
              emailDispatched: realOtpDispatched,
              smtpNotConfigured,
              lastSentAtMs: nowMs,
              expiresAtMs,
              createdAt: nowIso,
              updatedAt: nowIso
            });
          } catch (chWriteErr: any) {
            if (!isAdminCredentialError(chWriteErr)) throw chWriteErr;
            markAdminCredentialsUnavailable();
          }
        }

        res.cookie('shikshantar_otp_ch', signedChallengeToken, {
          httpOnly: true,
          path: '/api',
          sameSite: isSecureReq ? 'none' : 'lax',
          secure: isSecureReq,
          maxAge: expiresMinutes * 60 * 1000
        });

        await recordServerAuditLog({
          actorUid: authUser.uid,
          actorEmail: authUser.email,
          actorName: userName,
          actorRole: userRole,
          adminTier: authUser.adminTier,
          targetUid: authUser.uid,
          action: 'SUSPICIOUS_LOGIN_OTP_SENT',
          result: realOtpDispatched ? 'SUCCESS' : 'FAILED',
          reason: `New-device OTP required (${finalReason}) for ${device.compositeName} (${location}, IP: ${ip})${smtpNotConfigured ? ' [SMTP not configured in this environment]' : otpEmailResult.errorCode ? ` [${otpEmailResult.errorCode}]` : ''}`
        });

        return res.json({
          success: true,
          requiresDeviceVerification: true,
          sessionId: cleanSessionId,
          verification: {
            sessionId: cleanSessionId,
            maskedEmail: maskEmailAddress(authUser.email),
            senderEmail: otpEmailResult.senderEmail || smtpConfig.fromSecurity || 'securityalerts@shikshantaracademy.edu.np',
            reason: finalReason,
            browser: device.browser,
            os: device.os,
            deviceName: device.deviceName,
            location,
            ipAddress: ip,
            expiresInSeconds: expiresMinutes * 60,
            resendCooldownSeconds: 60,
            emailDispatched: realOtpDispatched,
            smtpNotConfigured,
            emailAuthFailed: otpEmailResult.authFailed === true,
            emailErrorHint: realOtpDispatched || smtpNotConfigured ? undefined : otpEmailResult.errorHint,
            challengeToken: signedChallengeToken
          }
        });
      }

      // F. Student without deliverable email / Guest on a new device -> register device & send alert if applicable
      const issuedFallback = issueSignedTrustToken({
        uid: authUser.uid,
        browser: device.browser,
        os: device.os,
        locationKey: currentLocKey,
        nowMs,
        ttlMs: TRUST_TTL_MS
      });
      const newDeviceToken = issuedFallback.token;
      const newTrustDocId = issuedFallback.deviceId;
      await hybridSetDoc(db, authUser.rawToken, 'trusted_devices', newTrustDocId, {
        userUid: authUser.uid,
        email: authUser.email,
        role: userRole,
        browser: device.browser,
        os: device.os,
        deviceName: device.deviceName,
        lastLocation: location,
        lastIp: ip,
        revoked: false,
        signedTrust: true,
        createdAt: nowIso,
        lastUsedAt: nowIso,
        expiresAtMs: nowMs + TRUST_TTL_MS
      });

      await syncUserSessionState(db, authUser.rawToken, authUser.uid, {
        addSessionId: cleanSessionId
      });

      let emailResult: { success: boolean; simulated?: boolean; error?: any } = { success: false, error: 'Email skipped' };
      if (authUser.email) {
        emailResult = await sendLoginAlertEmail({
          toEmail: authUser.email,
          userName,
          deviceName: device.deviceName,
          browser: device.browser,
          operatingSystem: device.os,
          approximateLocation: location,
          ipAddress: ip,
          dateTimeStr: dateTimeFormatted
        });
      }

      const realEmailSent = emailResult.success === true && emailResult.simulated !== true;
      const sessionData = {
        sessionId: cleanSessionId,
        userUid: authUser.uid,
        loginEventId: cleanLoginEventId,
        email: authUser.email,
        userName,
        role: userRole,
        loginAt: existingSession?.loginAt || nowIso,
        lastActiveAt: nowIso,
        revokedAt: null,
        logoutAt: null,
        status: 'ACTIVE',
        sessionSeal: currentSessionSeal,
        ipAddress: ip,
        approximateLocation: location,
        userAgent: ua,
        deviceType: device.deviceType,
        deviceName: device.deviceName,
        browser: device.browser,
        operatingSystem: (device as any).operatingSystem || device.os,
        compositeName: device.compositeName,
        emailSent: realEmailSent,
        emailSentAt: realEmailSent ? nowIso : null,
        createdAt: existingSession?.createdAt || nowIso,
        updatedAt: nowIso
      };

      await hybridSetDoc(db, authUser.rawToken, 'user_sessions', cleanSessionId, sessionData, { merge: true });

      await recordServerAuditLog({
        actorUid: authUser.uid,
        actorEmail: authUser.email,
        actorName: userName,
        actorRole: userRole,
        adminTier: authUser.adminTier,
        targetUid: authUser.uid,
        action: 'USER_LOGIN',
        result: 'SUCCESS',
        reason: `New-device sign-in alert sent for ${device.compositeName} (${location}, IP: ${ip})`
      });

      res.cookie('shikshantar_sid', cleanSessionId, cookieOpts);
      res.cookie('shikshantar_dt', newDeviceToken, cookieOpts);

      return res.json({
        success: true,
        requiresDeviceVerification: false,
        deviceTrustToken: newDeviceToken,
        sessionId: cleanSessionId,
        session: sessionData
      });
    } catch (err: any) {
      console.error('[SECURITY] Error recording login event:', err);
      return res.status(500).json({ error: 'Failed to record login event.' });
    }
  });

  // 1b. Verify 6-Digit New Browser / New Location Email OTP (All Roles)
  app.post('/api/auth/verify-device-otp', rateLimiter(20, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res, { allowPendingDeviceVerification: true });
      if (!authUser) return;

      const parsedCookies = parseCookieHeader(req);
      const { sessionId, code, trustDevice = true, challengeToken } = req.body || {};
      const cleanSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
      const cleanCode = String(code || '').replace(/\s+/g, '').trim();
      const rawChallengeToken = String(
        (typeof challengeToken === 'string' && challengeToken.trim()) ||
        parsedCookies.shikshantar_otp_ch ||
        ''
      ).trim();

      if (!cleanSessionId) {
        return res.status(400).json({ error: 'Missing sessionId.' });
      }
      if (!/^\d{6}$/.test(cleanCode)) {
        return res.status(400).json({ error: 'Please enter the exact 6-digit verification code.' });
      }

      const db = getAdminDb();
      const nowMs = getEffectiveNowMs(req);
      const nowIso = new Date().toISOString();

      let adminChallengeRef: FirebaseFirestore.DocumentReference | null = null;
      let ch: Record<string, any> | null = null;
      let usingStatelessChallenge = false;

      if (!shouldSkipAdminFirestore()) {
        try {
          const challengeRef = db.collection('device_verification_challenges').doc(cleanSessionId);
          const challengeSnap = await challengeRef.get();
          if (challengeSnap.exists) {
            adminChallengeRef = challengeRef;
            ch = challengeSnap.data() || {};
          }
        } catch (chErr: any) {
          if (!isAdminCredentialError(chErr)) throw chErr;
          markAdminCredentialsUnavailable();
        }
      }

      if (!ch && rawChallengeToken) {
        const signedCh = verifySignedOtpChallengeToken(rawChallengeToken, authUser.uid, cleanSessionId);
        if (signedCh) {
          usingStatelessChallenge = true;
          ch = {
            userUid: signedCh.uid,
            sessionId: signedCh.sid,
            otpHash: signedCh.h,
            otpSalt: signedCh.s,
            hashVersion: 'hmac_v1',
            reason: signedCh.r,
            browser: signedCh.b,
            os: signedCh.o,
            deviceName: signedCh.d,
            location: signedCh.loc,
            ipAddress: signedCh.ip,
            expiresAtMs: signedCh.exp,
            maxAttempts: 5,
            status: 'PENDING'
          };
        }
      }

      if (!ch) {
        return res.status(404).json({ error: 'Verification challenge not found. Please sign in again.' });
      }

      if (ch.userUid !== authUser.uid) {
        return res.status(403).json({ error: 'Forbidden: Verification challenge belongs to another account.' });
      }

      const attemptKey = `${authUser.uid}:${cleanSessionId}:${String(ch.otpSalt || '')}`;
      const statelessState = statelessOtpAttempts.get(attemptKey);
      if (ch.status === 'LOCKED' || statelessState?.locked) {
        return res.status(429).json({
          error: 'Too many invalid code attempts. This sign-in challenge is locked. Please request a new code or sign in again.',
          locked: true
        });
      }
      if (ch.status === 'VERIFIED') {
        return res.json({ success: true, verified: true, alreadyVerified: true });
      }
      if (Number(ch.expiresAtMs || 0) <= nowMs) {
        if (adminChallengeRef) {
          await adminChallengeRef.set({ status: 'EXPIRED', updatedAt: nowIso }, { merge: true }).catch(() => {});
        }
        return res.status(410).json({
          error: 'Verification code has expired. Click "Resend Code" to receive a fresh 6-digit code.',
          expired: true
        });
      }

      const expectedHash = String(ch.otpHash || '');
      const salt = String(ch.otpSalt || '');
      const candidateKeyed = hashOtpKeyed(cleanCode, salt);
      const candidateLegacy = hashDeviceOtp(cleanCode, salt);

      const safeHexEq = (a: string, b: string) => {
        const bufA = Buffer.from(a, 'hex');
        const bufB = Buffer.from(b, 'hex');
        return bufA.length > 0 && bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
      };
      const matched =
        safeHexEq(expectedHash, candidateKeyed) ||
        (!usingStatelessChallenge && ch.hashVersion !== 'hmac_v1' && safeHexEq(expectedHash, candidateLegacy));

      if (!matched) {
        const currentAttempts = Math.max(Number(ch.attempts || 0), Number(statelessState?.attempts || 0));
        const nextAttempts = currentAttempts + 1;
        const maxAttempts = Number(ch.maxAttempts || 5);
        const remainingAttempts = Math.max(0, maxAttempts - nextAttempts);

        statelessOtpAttempts.set(attemptKey, {
          attempts: nextAttempts,
          locked: nextAttempts >= maxAttempts,
          expiresAtMs: Number(ch.expiresAtMs || nowMs + 600000)
        });

        if (nextAttempts >= maxAttempts) {
          if (adminChallengeRef) {
            await adminChallengeRef.set({
              attempts: nextAttempts,
              status: 'LOCKED',
              updatedAt: nowIso
            }, { merge: true }).catch(() => {});
          }

          await recordServerAuditLog({
            actorUid: authUser.uid,
            actorEmail: authUser.email,
            actorRole: authUser.role,
            adminTier: authUser.adminTier,
            targetUid: authUser.uid,
            action: 'SUSPICIOUS_LOGIN_OTP_LOCKED',
            result: 'BLOCKED',
            reason: `Device OTP locked after ${nextAttempts} failed attempts from ${ch.deviceName || 'device'} (${ch.location || 'Unknown'}, IP: ${ch.ipAddress || 'unknown'})`
          });

          return res.status(429).json({
            error: 'Maximum verification attempts exceeded. Please request a new code or sign out.',
            locked: true,
            remainingAttempts: 0
          });
        }

        if (adminChallengeRef) {
          await adminChallengeRef.set({ attempts: nextAttempts, updatedAt: nowIso }, { merge: true }).catch(() => {});
        }
        return res.status(400).json({
          error: `Incorrect verification code. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.`,
          remainingAttempts
        });
      }

      // OTP Verified -> activate session with server-signed sessionSeal and optionally issue 30-day signed trust token
      statelessOtpAttempts.delete(attemptKey);
      if (adminChallengeRef) {
        await adminChallengeRef.set({
          status: 'VERIFIED',
          verifiedAt: nowIso,
          updatedAt: nowIso
        }, { merge: true }).catch(() => {});
      }

      const verifiedSeal = issueSessionSeal(authUser.uid, cleanSessionId);
      await hybridSetDoc(
        db,
        authUser.rawToken,
        'user_sessions',
        cleanSessionId,
        {
          sessionId: cleanSessionId,
          userUid: authUser.uid,
          status: 'ACTIVE',
          sessionSeal: verifiedSeal,
          verifiedAt: nowIso,
          lastActiveAt: nowIso,
          updatedAt: nowIso
        },
        { merge: true }
      );

      await syncUserSessionState(db, authUser.rawToken, authUser.uid, {
        addSessionId: cleanSessionId,
        enforceDeviceVerification: true
      });

      let issuedTrustToken: string | null = null;
      if (trustDevice !== false) {
        const TRUST_TTL_MS = 30 * 24 * 60 * 60 * 1000;
        const issued = issueSignedTrustToken({
          uid: authUser.uid,
          browser: String(ch.browser || 'Unknown Browser'),
          os: String(ch.os || 'Unknown OS'),
          locationKey: normalizeLocationKey(String(ch.location || '')),
          nowMs,
          ttlMs: TRUST_TTL_MS
        });
        issuedTrustToken = issued.token;
        await hybridSetDoc(db, authUser.rawToken, 'trusted_devices', issued.deviceId, {
          userUid: authUser.uid,
          email: authUser.email,
          role: authUser.role,
          browser: ch.browser || 'Unknown Browser',
          os: ch.os || 'Unknown OS',
          deviceName: ch.deviceName || 'Device',
          lastLocation: ch.location || 'Unknown Location',
          lastIp: ch.ipAddress || '',
          revoked: false,
          signedTrust: true,
          createdAt: nowIso,
          lastUsedAt: nowIso,
          expiresAtMs: nowMs + TRUST_TTL_MS
        });
      }

      await recordServerAuditLog({
        actorUid: authUser.uid,
        actorEmail: authUser.email,
        actorRole: authUser.role,
        adminTier: authUser.adminTier,
        targetUid: authUser.uid,
        action: 'NEW_DEVICE_LOGIN_VERIFIED',
        result: 'SUCCESS',
        reason: `Verified new device via 6-digit email OTP (${ch.deviceName || 'device'}, ${ch.location || 'Unknown'}, trusted30d=${Boolean(issuedTrustToken)})`
      });

      const isSecureReq = req.secure || req.headers['x-forwarded-proto'] === 'https';
      const cookieOpts = {
        httpOnly: true,
        path: '/api',
        sameSite: (isSecureReq ? 'none' : 'lax') as 'none' | 'lax',
        secure: isSecureReq,
        maxAge: 30 * 24 * 60 * 60 * 1000
      };
      res.clearCookie('shikshantar_otp_ch', {
        httpOnly: true,
        path: '/api',
        sameSite: isSecureReq ? 'none' : 'lax',
        secure: isSecureReq
      });
      res.cookie('shikshantar_sid', cleanSessionId, cookieOpts);
      if (issuedTrustToken) {
        res.cookie('shikshantar_dt', issuedTrustToken, cookieOpts);
      }

      return res.json({
        success: true,
        verified: true,
        deviceTrustToken: issuedTrustToken
      });
    } catch (err: any) {
      console.error('[SECURITY] Error verifying device OTP:', err);
      return res.status(500).json({ error: 'Failed to verify security code. Please try again.' });
    }
  });

  // 1c. Resend 6-Digit New Browser / New Location Email OTP (60s Cooldown, Max 5 Resends)
  app.post('/api/auth/resend-device-otp', rateLimiter(10, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res, { allowPendingDeviceVerification: true });
      if (!authUser) return;

      const parsedCookies = parseCookieHeader(req);
      const { sessionId, challengeToken } = req.body || {};
      const cleanSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
      const rawChallengeToken = String(
        (typeof challengeToken === 'string' && challengeToken.trim()) ||
        parsedCookies.shikshantar_otp_ch ||
        ''
      ).trim();

      if (!cleanSessionId) {
        return res.status(400).json({ error: 'Missing sessionId.' });
      }

      const db = getAdminDb();
      const nowMs = getEffectiveNowMs(req);
      const nowIso = new Date().toISOString();

      let adminChallengeRef: FirebaseFirestore.DocumentReference | null = null;
      let ch: Record<string, any> | null = null;

      if (!shouldSkipAdminFirestore()) {
        try {
          const challengeRef = db.collection('device_verification_challenges').doc(cleanSessionId);
          const challengeSnap = await challengeRef.get();
          if (challengeSnap.exists) {
            adminChallengeRef = challengeRef;
            ch = challengeSnap.data() || {};
          }
        } catch (chErr: any) {
          if (!isAdminCredentialError(chErr)) throw chErr;
          markAdminCredentialsUnavailable();
        }
      }

      if (!ch && rawChallengeToken) {
        const signedCh = verifySignedOtpChallengeToken(rawChallengeToken, authUser.uid, cleanSessionId);
        if (signedCh) {
          ch = {
            userUid: signedCh.uid,
            sessionId: signedCh.sid,
            reason: signedCh.r,
            browser: signedCh.b,
            os: signedCh.o,
            deviceName: signedCh.d,
            location: signedCh.loc,
            ipAddress: signedCh.ip,
            resendCount: signedCh.rc,
            maxResends: 5,
            lastSentAtMs: signedCh.ls,
            status: 'PENDING'
          };
        }
      }

      if (!ch) {
        const sessDoc = await hybridGetDoc(db, authUser.rawToken, 'user_sessions', cleanSessionId);
        if (sessDoc.exists && sessDoc.data?.userUid === authUser.uid && sessDoc.data?.status === 'PENDING_VERIFICATION') {
          const s = sessDoc.data;
          ch = {
            userUid: authUser.uid,
            sessionId: cleanSessionId,
            reason: s.verificationReason || 'NEW_BROWSER_OR_DEVICE',
            browser: s.browser || 'Browser',
            os: s.operatingSystem || 'OS',
            deviceName: s.deviceName || 'Device',
            location: s.approximateLocation || 'Unknown Location',
            ipAddress: s.ipAddress || '',
            resendCount: 0,
            maxResends: 5,
            lastSentAtMs: 0,
            status: 'PENDING'
          };
        }
      }

      if (!ch) {
        return res.status(404).json({ error: 'Verification session not found. Please sign in again.' });
      }
      if (ch.userUid !== authUser.uid) {
        return res.status(403).json({ error: 'Forbidden: Challenge does not belong to your account.' });
      }
      if (ch.status === 'VERIFIED') {
        return res.json({ success: true, alreadyVerified: true });
      }

      const lastSentAtMs = Number(ch.lastSentAtMs || 0);
      const cooldownLeftMs = (lastSentAtMs + 60000) - nowMs;
      if (cooldownLeftMs > 0) {
        const retryAfterSeconds = Math.ceil(cooldownLeftMs / 1000);
        return res.status(429).json({
          error: `Please wait ${retryAfterSeconds} seconds before requesting another code.`,
          retryAfterSeconds
        });
      }

      const resendCount = Number(ch.resendCount || 0);
      const maxResends = Number(ch.maxResends || 5);
      if (resendCount >= maxResends) {
        return res.status(429).json({
          error: 'Maximum resend limit reached for this session. Please sign out and sign in again.'
        });
      }

      const otpCode = crypto.randomInt(100000, 1000000).toString();
      const otpSalt = crypto.randomBytes(16).toString('hex');
      const otpHash = hashOtpKeyed(otpCode, otpSalt);
      const expiresMinutes = 10;
      const expiresAtMs = nowMs + expiresMinutes * 60 * 1000;
      const userData = authUser.userData || {};
      const userName = userData.fullName || userData.name || authUser.email.split('@')[0];
      const now = new Date();
      const dateTimeFormatted = now.toLocaleDateString('en-US', {
        timeZone: 'Asia/Kathmandu',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }) + ', ' + now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kathmandu',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }) + ' NPT';
      const reasonLabel =
        ch.reason === 'NEW_LOCATION'
          ? `new location (${ch.location || 'Unknown Location'})`
          : ch.reason === 'DEVICE_MISMATCH'
            ? 'different browser or device profile'
            : 'new browser or unrecognized device';

      const emailResult = await sendDeviceVerificationOtpEmail({
        toEmail: authUser.email,
        userName,
        otpCode,
        reasonLabel,
        deviceName: ch.deviceName || 'Device',
        browser: ch.browser || 'Browser',
        operatingSystem: ch.os || 'OS',
        approximateLocation: ch.location || 'Unknown Location',
        ipAddress: ch.ipAddress || '',
        dateTimeStr: dateTimeFormatted,
        expiresMinutes,
        bypassCooldown: true
      });

      const realOtpDispatched = emailResult.success === true && emailResult.simulated !== true;
      const smtpNotConfigured = emailResult.simulated === true;
      const nextResendCount = resendCount + 1;

      const nextChallengeToken = issueSignedOtpChallengeToken({
        uid: authUser.uid,
        sid: cleanSessionId,
        h: otpHash,
        s: otpSalt,
        r: String(ch.reason || 'NEW_BROWSER_OR_DEVICE'),
        b: String(ch.browser || 'Browser'),
        o: String(ch.os || 'OS'),
        d: String(ch.deviceName || 'Device'),
        loc: String(ch.location || 'Unknown Location'),
        ip: String(ch.ipAddress || ''),
        rc: nextResendCount,
        ls: nowMs,
        exp: expiresAtMs,
        ed: realOtpDispatched,
        sn: smtpNotConfigured
      });

      if (adminChallengeRef) {
        await adminChallengeRef.set({
          otpHash,
          otpSalt,
          hashVersion: 'hmac_v1',
          attempts: 0,
          status: 'PENDING',
          resendCount: nextResendCount,
          lastSentAtMs: nowMs,
          expiresAtMs,
          emailDispatched: realOtpDispatched,
          smtpNotConfigured,
          updatedAt: nowIso
        }, { merge: true }).catch(() => {});
      }

      const isSecureReq = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.cookie('shikshantar_otp_ch', nextChallengeToken, {
        httpOnly: true,
        path: '/api',
        sameSite: isSecureReq ? 'none' : 'lax',
        secure: isSecureReq,
        maxAge: expiresMinutes * 60 * 1000
      });

      return res.json({
        success: true,
        emailDispatched: realOtpDispatched,
        smtpNotConfigured,
        emailAuthFailed: emailResult.authFailed === true,
        emailErrorHint: realOtpDispatched || smtpNotConfigured ? undefined : emailResult.errorHint,
        senderEmail: emailResult.senderEmail,
        expiresInSeconds: expiresMinutes * 60,
        resendCooldownSeconds: 60,
        challengeToken: nextChallengeToken
      });
    } catch (err: any) {
      console.error('[SECURITY] Error resending device OTP:', err);
      return res.status(500).json({ error: 'Failed to resend security code.' });
    }
  });

  // 1d. List Active Sessions, Login History & Trusted Devices (Self or Admin for Target User)
  app.get('/api/auth/sessions', rateLimiter(60, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;

      const requestedUid = typeof req.query.uid === 'string' ? req.query.uid.trim() : '';
      const targetUid = requestedUid && authUser.role === 'admin' ? requestedUid : authUser.uid;
      if (requestedUid && requestedUid !== authUser.uid && authUser.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: You can only view your own login sessions.' });
      }

      const db = getAdminDb();
      const nowMs = Date.now();
      const parsedCookies = parseCookieHeader(req);
      const currentSessionId = String(req.headers['x-shikshantar-session-id'] || parsedCookies.shikshantar_sid || '').trim();
      const currentDeviceToken = String(req.headers['x-shikshantar-device-token'] || parsedCookies.shikshantar_dt || '').trim();
      const currentTrustDocId = currentDeviceToken && targetUid === authUser.uid
        ? buildTrustedDeviceDocId(authUser.uid, currentDeviceToken)
        : '';

      const [sessionsResult, trustedResult, targetUserDoc] = await Promise.all([
        hybridQueryEq(db, authUser.rawToken, 'user_sessions', 'userUid', targetUid),
        hybridQueryEq(db, authUser.rawToken, 'trusted_devices', 'userUid', targetUid),
        targetUid === authUser.uid
          ? Promise.resolve(null)
          : hybridGetDoc(db, authUser.rawToken, 'users', targetUid)
      ]);

      const toSortableMs = (v: any): number => {
        if (!v) return 0;
        if (typeof v === 'string') {
          const parsed = Date.parse(v);
          return Number.isNaN(parsed) ? 0 : parsed;
        }
        if (typeof v === 'number') return v;
        if (typeof v?.toMillis === 'function') return v.toMillis();
        if (typeof v?.seconds === 'number') return v.seconds * 1000;
        return 0;
      };

      const allSessions = sessionsResult.docs.map((docSnap) => {
        const d = docSnap.data || {};
        return {
          sessionId: d.sessionId || docSnap.id,
          userUid: d.userUid || targetUid,
          email: d.email || '',
          userName: d.userName || '',
          role: d.role || '',
          status: String(d.status || 'UNKNOWN').toUpperCase(),
          browser: d.browser || 'Unknown Browser',
          operatingSystem: d.operatingSystem || d.os || 'Unknown OS',
          deviceType: d.deviceType || 'Device',
          deviceName: d.deviceName || 'Unknown Device',
          compositeName: d.compositeName || `${d.browser || 'Browser'} on ${d.operatingSystem || d.os || 'Device'}`,
          approximateLocation: d.approximateLocation || 'Location unavailable',
          ipAddress: d.ipAddress || '',
          loginAt: d.loginAt || d.createdAt || d.updatedAt || null,
          lastActiveAt: d.lastActiveAt || d.updatedAt || d.loginAt || null,
          logoutAt: d.logoutAt || null,
          revokedAt: d.revokedAt || null,
          verifiedAt: d.verifiedAt || null,
          trustedDeviceMatched: Boolean(d.trustedDeviceMatched),
          isCurrent: Boolean(currentSessionId && (d.sessionId === currentSessionId || docSnap.id === currentSessionId))
        };
      });

      const activeSessions = allSessions
        .filter((s) => s.status === 'ACTIVE' || s.status === 'PENDING_VERIFICATION')
        .sort((a, b) => {
          if (a.isCurrent && !b.isCurrent) return -1;
          if (!a.isCurrent && b.isCurrent) return 1;
          return toSortableMs(b.lastActiveAt || b.loginAt) - toSortableMs(a.lastActiveAt || a.loginAt);
        });

      const loginHistory = allSessions
        .filter((s) => s.status !== 'ACTIVE' && s.status !== 'PENDING_VERIFICATION' && Boolean(s.loginAt || s.browser !== 'Unknown Browser'))
        .sort((a, b) => toSortableMs(b.loginAt || b.lastActiveAt || b.revokedAt) - toSortableMs(a.loginAt || a.lastActiveAt || a.revokedAt))
        .slice(0, 30);

      const trustedDevices = trustedResult.docs
        .map((docSnap) => {
          const d = docSnap.data || {};
          return {
            deviceId: docSnap.id,
            browser: d.browser || 'Unknown Browser',
            os: d.os || 'Unknown OS',
            deviceName: d.deviceName || 'Device',
            lastLocation: d.lastLocation || 'Location unavailable',
            lastIp: d.lastIp || '',
            revoked: d.revoked === true,
            createdAt: d.createdAt || null,
            lastUsedAt: d.lastUsedAt || d.createdAt || null,
            expiresAtMs: Number(d.expiresAtMs || 0),
            isCurrentDevice: Boolean(currentTrustDocId && docSnap.id === currentTrustDocId)
          };
        })
        .filter((t) => !t.revoked && t.expiresAtMs > nowMs)
        .sort((a, b) => {
          if (a.isCurrentDevice && !b.isCurrentDevice) return -1;
          if (!a.isCurrentDevice && b.isCurrentDevice) return 1;
          return toSortableMs(b.lastUsedAt) - toSortableMs(a.lastUsedAt);
        });

      const targetUserData = targetUid === authUser.uid
        ? (authUser.userData || {})
        : (targetUserDoc?.exists ? (targetUserDoc.data || {}) : {});

      const latestSession = [...activeSessions, ...loginHistory]
        .sort((a, b) => toSortableMs(b.loginAt) - toSortableMs(a.loginAt))[0] || null;

      return res.json({
        success: true,
        activeSessions,
        loginHistory,
        trustedDevices,
        securitySummary: {
          deviceVerificationEnforced: targetUserData.deviceVerificationEnforced === true || trustedResult.docs.length > 0,
          otpProtectionEligible: isDeliverableRealEmail(targetUid === authUser.uid ? authUser.email : String(targetUserData.email || '')),
          totalActiveSessions: activeSessions.length,
          totalTrustedDevices: trustedDevices.length,
          lastLoginAt: latestSession?.loginAt || null,
          lastLoginDevice: latestSession?.compositeName || null,
          lastLoginLocation: latestSession?.approximateLocation || null
        }
      });
    } catch (err: any) {
      console.error('[SECURITY] Error loading user sessions:', err);
      return res.status(500).json({ error: 'Unable to load login sessions.' });
    }
  });

  // 1e. Revoke One or All Trusted Devices (forces 6-digit OTP on next login from revoked browser)
  app.post('/api/auth/revoke-trusted-device', rateLimiter(20, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;

      const { deviceId, revokeAll } = req.body || {};
      const db = getAdminDb();
      const nowIso = new Date().toISOString();
      const parsedCookies = parseCookieHeader(req);
      const currentDeviceToken = String(req.headers['x-shikshantar-device-token'] || parsedCookies.shikshantar_dt || '').trim();
      const currentTrustDocId = currentDeviceToken ? buildTrustedDeviceDocId(authUser.uid, currentDeviceToken) : '';

      let clearedCurrentDeviceTrust = false;
      let revokedCount = 0;

      if (revokeAll === true) {
        const snap = await hybridQueryEq(db, authUser.rawToken, 'trusted_devices', 'userUid', authUser.uid);
        for (const docSnap of snap.docs) {
          const d = docSnap.data || {};
          if (d.revoked !== true) {
            await hybridSetDoc(
              db,
              authUser.rawToken,
              'trusted_devices',
              docSnap.id,
              { userUid: authUser.uid, revoked: true, revokedAt: nowIso, updatedAt: nowIso },
              { merge: true }
            );
            revokedCount++;
            if (currentTrustDocId && docSnap.id === currentTrustDocId) {
              clearedCurrentDeviceTrust = true;
            }
          }
        }
        clearedCurrentDeviceTrust = true;
      } else {
        const cleanDeviceId = typeof deviceId === 'string' ? deviceId.trim() : '';
        if (!cleanDeviceId) {
          return res.status(400).json({ error: 'Missing deviceId or revokeAll flag.' });
        }
        const devDoc = await hybridGetDoc(db, authUser.rawToken, 'trusted_devices', cleanDeviceId);
        if (!devDoc.exists) {
          return res.status(404).json({ error: 'Trusted device record not found.' });
        }
        const d = devDoc.data || {};
        if (d.userUid !== authUser.uid) {
          return res.status(403).json({ error: 'Forbidden: You can only revoke your own trusted devices.' });
        }
        await hybridSetDoc(
          db,
          authUser.rawToken,
          'trusted_devices',
          cleanDeviceId,
          { userUid: authUser.uid, revoked: true, revokedAt: nowIso, updatedAt: nowIso },
          { merge: true }
        );
        revokedCount = 1;
        if (currentTrustDocId && cleanDeviceId === currentTrustDocId) {
          clearedCurrentDeviceTrust = true;
        }
      }

      // Ensure deviceVerificationEnforced stays true so next login ALWAYS requires 6-digit OTP
      await syncUserSessionState(db, authUser.rawToken, authUser.uid, {
        enforceDeviceVerification: true
      });

      if (clearedCurrentDeviceTrust) {
        const isSecureReq = req.secure || req.headers['x-forwarded-proto'] === 'https';
        res.clearCookie('shikshantar_dt', {
          httpOnly: true,
          path: '/api',
          sameSite: isSecureReq ? 'none' : 'lax',
          secure: isSecureReq
        });
      }

      await recordServerAuditLog({
        actorUid: authUser.uid,
        actorEmail: authUser.email,
        actorRole: authUser.role,
        adminTier: authUser.adminTier,
        targetUid: authUser.uid,
        action: 'TRUSTED_DEVICE_REVOKED',
        result: 'SUCCESS',
        reason: revokeAll === true
          ? `Revoked all trusted devices (${revokedCount}). Next sign-in requires 6-digit OTP.`
          : `Revoked trusted device ${String(deviceId || '')}. Next sign-in from that browser requires 6-digit OTP.`
      });

      return res.json({
        success: true,
        revokedCount,
        clearedCurrentDeviceTrust,
        message: revokeAll === true
          ? 'All trusted browsers removed. Your next login will require a 6-digit verification code.'
          : 'Trusted browser removed. Next sign-in from that browser will require a 6-digit verification code.'
      });
    } catch (err: any) {
      console.error('[SECURITY] Error revoking trusted device:', err);
      return res.status(500).json({ error: 'Failed to revoke trusted device.' });
    }
  });

  // 2. Revoke a Single Session
  app.post('/api/auth/revoke-session', rateLimiter(30, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;

      const { sessionId, currentSessionId } = req.body || {};
      if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
        return res.status(400).json({ error: 'Missing target sessionId.' });
      }

      const cleanSessionId = sessionId.trim();
      const cleanCurrentSessionId = typeof currentSessionId === 'string' ? currentSessionId.trim() : '';

      if (cleanCurrentSessionId && cleanSessionId === cleanCurrentSessionId) {
        return res.status(400).json({ error: 'Cannot revoke current active session on this device.' });
      }

      const db = getAdminDb();
      const sDoc = await hybridGetDoc(db, authUser.rawToken, 'user_sessions', cleanSessionId);
      if (!sDoc.exists) {
        return res.status(404).json({ error: 'Session not found.' });
      }

      const sessionData = sDoc.data || {};
      if (sessionData.userUid !== authUser.uid) {
        return res.status(403).json({ error: 'Forbidden: You can only revoke your own active sessions.' });
      }

      const nowIso = new Date().toISOString();
      await hybridSetDoc(
        db,
        authUser.rawToken,
        'user_sessions',
        cleanSessionId,
        {
          userUid: authUser.uid,
          status: 'REVOKED',
          sessionSeal: null,
          revokedAt: nowIso,
          updatedAt: nowIso
        },
        { merge: true }
      );

      await syncUserSessionState(db, authUser.rawToken, authUser.uid, {
        removeSessionId: cleanSessionId
      });

      await recordServerAuditLog({
        actorUid: authUser.uid,
        actorEmail: authUser.email,
        actorRole: authUser.role,
        targetUid: authUser.uid,
        action: 'SESSION_REVOKED',
        result: 'SUCCESS',
        reason: `Revoked session ${cleanSessionId} (${sessionData.deviceName || 'device'})`
      });

      return res.json({ success: true, message: 'Session revoked successfully.' });
    } catch (err: any) {
      console.error('[SECURITY] Error revoking session:', err);
      return res.status(500).json({ error: 'Unable to revoke this session. Please try again.' });
    }
  });

  // 3. Logout All Other Devices
  app.post('/api/auth/logout-other-sessions', rateLimiter(20, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;

      const { currentSessionId, sessionId } = req.body || {};
      const resolvedCurrentSessionId = typeof currentSessionId === 'string' && currentSessionId.trim()
        ? currentSessionId.trim()
        : (typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : '');
      if (!resolvedCurrentSessionId) {
        return res.status(400).json({ error: 'Missing currentSessionId.' });
      }

      const cleanCurrentSessionId = resolvedCurrentSessionId;
      const db = getAdminDb();
      const nowIso = new Date().toISOString();

      const activeSessionsRes = await hybridQueryEq(
        db,
        authUser.rawToken,
        'user_sessions',
        'userUid',
        authUser.uid
      );

      for (const docSnap of activeSessionsRes.docs) {
        const sData = docSnap.data || {};
        if (docSnap.id !== cleanCurrentSessionId && (sData.status === 'ACTIVE' || sData.status === 'PENDING_VERIFICATION')) {
          await hybridSetDoc(
            db,
            authUser.rawToken,
            'user_sessions',
            docSnap.id,
            {
              userUid: authUser.uid,
              status: 'REVOKED',
              sessionSeal: null,
              revokedAt: nowIso,
              updatedAt: nowIso
            },
            { merge: true }
          );
        }
      }

      await syncUserSessionState(db, authUser.rawToken, authUser.uid, {
        replaceActiveSessions: [cleanCurrentSessionId]
      });

      await recordServerAuditLog({
        actorUid: authUser.uid,
        actorEmail: authUser.email,
        actorRole: authUser.role,
        targetUid: authUser.uid,
        action: 'ALL_OTHER_SESSIONS_REVOKED',
        result: 'SUCCESS',
        reason: `Logged out all other sessions; kept current device (${cleanCurrentSessionId}) active`
      });

      return res.json({ success: true, message: 'All other sessions revoked successfully.' });
    } catch (err: any) {
      console.error('[SECURITY] Error logging out other sessions:', err);
      return res.status(500).json({ error: 'Failed to logout other devices. Please try again.' });
    }
  });

  // 4. Logout Current Session Cleanly
  app.post('/api/auth/logout', rateLimiter(60, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res, { allowPendingDeviceVerification: true });
      if (!authUser) return;

      const { sessionId } = req.body || {};
      const db = getAdminDb();
      const nowIso = new Date().toISOString();

      if (sessionId && typeof sessionId === 'string' && sessionId.trim()) {
        const cleanSessionId = sessionId.trim();
        const sDoc = await hybridGetDoc(db, authUser.rawToken, 'user_sessions', cleanSessionId);
        if (sDoc.exists && sDoc.data?.userUid === authUser.uid) {
          await hybridSetDoc(
            db,
            authUser.rawToken,
            'user_sessions',
            cleanSessionId,
            {
              userUid: authUser.uid,
              status: 'LOGGED_OUT',
              sessionSeal: null,
              logoutAt: nowIso,
              updatedAt: nowIso
            },
            { merge: true }
          );
        }
        await syncUserSessionState(db, authUser.rawToken, authUser.uid, {
          removeSessionId: cleanSessionId
        });
      }

      const isSecureReq = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.clearCookie('shikshantar_sid', {
        httpOnly: true,
        path: '/api',
        sameSite: isSecureReq ? 'none' : 'lax',
        secure: isSecureReq
      });
      res.clearCookie('shikshantar_otp_ch', {
        httpOnly: true,
        path: '/api',
        sameSite: isSecureReq ? 'none' : 'lax',
        secure: isSecureReq
      });

      return res.json({ success: true });
    } catch (err: any) {
      console.error('[SECURITY] Error in /api/auth/logout:', err);
      return res.status(500).json({ error: 'Failed to record logout.' });
    }
  });

  // 5. Authenticated Heartbeat to maintain lastActiveAt and detect remote revocation
  app.post('/api/auth/heartbeat', rateLimiter(60, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;

      const { sessionId } = req.body || {};
      if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
        return res.status(400).json({ error: 'Missing sessionId.' });
      }

      const cleanSessionId = sessionId.trim();
      const db = getAdminDb();
      const nowIso = new Date().toISOString();
      const sDoc = await hybridGetDoc(db, authUser.rawToken, 'user_sessions', cleanSessionId);

      if (sDoc.exists) {
        const sData = sDoc.data || {};
        if (sData.userUid !== authUser.uid || sData.status === 'REVOKED' || sData.status === 'LOGGED_OUT') {
          return res.json({ success: false, revoked: true });
        }
        await hybridSetDoc(
          db,
          authUser.rawToken,
          'user_sessions',
          cleanSessionId,
          {
            userUid: authUser.uid,
            lastActiveAt: nowIso,
            updatedAt: nowIso
          },
          { merge: true }
        );
      } else {
        const activeSessions: string[] = Array.isArray(authUser.userData?.activeSessions) ? authUser.userData.activeSessions : [];
        if (activeSessions.length > 0 && !activeSessions.includes(cleanSessionId)) {
          return res.json({ success: false, revoked: true });
        }
      }

      return res.json({ success: true, active: true });
    } catch {
      return res.status(500).json({ success: false });
    }
  });

  // --- STEP 4.2 DURABLE TRANSACTIONAL OUTBOX BACKGROUND WORKER (GAP 1 & GAP 2 HARDENED) ---
  async function processNotificationOutbox() {
    const db = getAdminDb();
    const workerId = crypto.randomUUID();
    const nowMs = Date.now();
    const nowIso = new Date().toISOString();

    try {
      // 1. Independent Bounded Query for Expired PROCESSING Events (Recovery Queue)
      let expiredProcessingDocs: any[] = [];
      try {
        const procSnap = await db.collection('notification_outbox')
          .where('status', '==', 'PROCESSING')
          .where('lockedUntil', '<=', nowIso)
          .orderBy('lockedUntil', 'asc')
          .limit(20)
          .get();
        expiredProcessingDocs = procSnap.docs;
      } catch (err: any) {
        // Fallback in-memory filter if composite index is pending
        try {
          const procSnap = await db.collection('notification_outbox')
            .where('status', '==', 'PROCESSING')
            .limit(50)
            .get();
          expiredProcessingDocs = procSnap.docs.filter(d => {
            const lu = d.data().lockedUntil;
            return lu && new Date(lu).getTime() <= nowMs;
          }).slice(0, 20);
        } catch (fErr: any) {
          if (fErr?.code !== 5 && fErr?.code !== 7 && !fErr?.message?.includes('NOT_FOUND') && !fErr?.message?.includes('PERMISSION_DENIED') && !fErr?.message?.includes('Missing or insufficient permissions') && !fErr?.message?.includes('ECONNREFUSED') && fErr?.code !== 14 && !fErr?.message?.includes('No connection established')) {
            console.error('[OUTBOX WORKER] Error querying PROCESSING events:', fErr);
          }
        }
      }

      // 2. Independent Bounded Query for Due PENDING Events (Pending Queue)
      let duePendingDocs: any[] = [];
      try {
        const pSnap = await db.collection('notification_outbox')
          .where('status', '==', 'PENDING')
          .where('nextRetryAt', '<=', nowIso)
          .orderBy('nextRetryAt', 'asc')
          .limit(20)
          .get();
        duePendingDocs = pSnap.docs;
      } catch (err: any) {
        try {
          const pSnap = await db.collection('notification_outbox')
            .where('status', '==', 'PENDING')
            .limit(50)
            .get();
          duePendingDocs = pSnap.docs.filter(d => {
            const nr = d.data().nextRetryAt;
            return !nr || new Date(nr).getTime() <= nowMs;
          }).slice(0, 20);
        } catch (fErr: any) {
          if (fErr?.code !== 5 && fErr?.code !== 7 && !fErr?.message?.includes('NOT_FOUND') && !fErr?.message?.includes('PERMISSION_DENIED') && !fErr?.message?.includes('Missing or insufficient permissions') && !fErr?.message?.includes('ECONNREFUSED') && fErr?.code !== 14 && !fErr?.message?.includes('No connection established')) {
            console.error('[OUTBOX WORKER] Error querying PENDING events:', fErr);
          }
        }
      }

      // 3. Fair Bounded Composition: Process both queues independently without starvation
      const dueDocs = [...expiredProcessingDocs, ...duePendingDocs];
      if (dueDocs.length === 0) return;

      for (const docSnap of dueDocs) {
        const eventId = docSnap.id;
        const eventData = docSnap.data();

        // Transactional Claim with Lease Ownership and Status Revalidation
        const claimed = await db.runTransaction(async (txn) => {
          const freshSnap: any = await txn.get(docSnap.ref);
          if (!freshSnap.exists) return false;
          const freshData = freshSnap.data() || {};
          const currentStatus = freshData.status;
          const lockedUntil = freshData.lockedUntil ? new Date(freshData.lockedUntil).getTime() : 0;

          if (currentStatus === 'COMPLETED' || currentStatus === 'FAILED') return false;
          if (currentStatus === 'PROCESSING' && lockedUntil > nowMs && freshData.lockedBy && freshData.lockedBy !== workerId) {
            return false;
          }
          if (currentStatus === 'PENDING') {
            const freshRetry = freshData.nextRetryAt ? new Date(freshData.nextRetryAt).getTime() : 0;
            if (freshRetry > nowMs) return false;
          }

          txn.update(docSnap.ref, {
            status: 'PROCESSING',
            lockedBy: workerId,
            lockedUntil: new Date(Date.now() + 120000).toISOString(),
            updatedAt: new Date().toISOString()
          });
          return true;
        });

        if (!claimed) continue;

        try {
          const { eventType, payload } = eventData;
          if (eventType === 'RESULT_PUBLISHED') {
            const { examId, examType, className, section } = payload;
            
            // Fetch authoritative parent exam metadata for strict canonical validation
            const examSnap = await db.collection('exams').doc(examId).get();
            if (!examSnap.exists) {
              throw new Error(`Fail-closed: Authoritative parent exam ${examId} not found.`);
            }
            const examData = examSnap.data() || {};
            const canonicalExamYear = resolveCanonicalAcademicYearId(examData) || resolveCanonicalAcademicYearId(payload);
            const canonicalExamClass = String(examData.class || examData.targetClass || className || '').replace(/^Class\s+/i, '').trim().toLowerCase();
            const rawExamSection = String(examData.section || examData.targetSection || section || 'All').trim();
            const isAllSectionExam = rawExamSection.toLowerCase() === 'all';
            const canonicalExamSection = rawExamSection.toLowerCase();

            if (!canonicalExamYear || !canonicalExamClass) {
              throw new Error(`Fail-closed: Authoritative parent exam metadata incomplete (missing canonical academicYearId or class).`);
            }

            const eligibleStudents: any[] = [];
            const usersSnap = await db.collection('users').where('role', '==', 'student').get();

            for (const uDoc of usersSnap.docs) {
              const uData = uDoc.data();
              if (uData.deleted === true || ['DELETED', 'INACTIVE', 'SUSPENDED', 'DELETION_PENDING', 'AUTH_DELETED_PENDING_FINALIZATION'].includes(uData.status)) {
                continue;
              }

              const studentUid = uDoc.id;

              // Validate secure records against authoritative parent exam metadata with strict canonical equality
              const studentRecordsRef = db.collection('results_secure').doc(studentUid).collection('records');
              const recordsSnap = await studentRecordsRef.where('examId', '==', examId).get();

              let isEnrollmentValid = false;
              if (!recordsSnap.empty) {
                for (const rDoc of recordsSnap.docs) {
                  const rData = rDoc.data();
                  if (rData.examId !== examId) continue;
                  const rYear = resolveCanonicalAcademicYearId(rData);
                  const rClass = String(rData.class || '').replace(/^Class\s+/i, '').trim().toLowerCase();
                  const rSec = String(rData.section || '').trim().toLowerCase();

                  if (rYear === canonicalExamYear && rClass === canonicalExamClass) {
                    if (isAllSectionExam) {
                      if (rSec) {
                        isEnrollmentValid = true;
                        break;
                      }
                    } else {
                      // Specific-section exam: require exact section equality.
                      // A secure record with section All must NOT automatically qualify for a specific-section exam!
                      if (rSec !== 'all' && rSec === canonicalExamSection) {
                        isEnrollmentValid = true;
                        break;
                      }
                    }
                  }
                }
              }

              // Check student_enrollments collection for authoritative academic year enrollment
              if (!isEnrollmentValid) {
                const enrSnap = await db.collection('student_enrollments')
                  .where('studentUid', '==', studentUid)
                  .get();

                for (const eDoc of enrSnap.docs) {
                  const eData = eDoc.data();
                  if (eData.status === 'inactive' || eData.status === 'transferred') continue;
                  const eYear = resolveCanonicalAcademicYearId(eData);
                  const eClass = String(eData.class || '').replace(/^Class\s+/i, '').trim().toLowerCase();
                  const eSec = String(eData.section || '').trim().toLowerCase();

                  if (eYear === canonicalExamYear && eClass === canonicalExamClass) {
                    if (isAllSectionExam) {
                      if (eSec) {
                        isEnrollmentValid = true;
                        break;
                      }
                    } else {
                      if (eSec !== 'all' && eSec === canonicalExamSection) {
                        isEnrollmentValid = true;
                        break;
                      }
                    }
                  }
                }
              }

              // Fallback to student profile on users collection with strict canonical validation
              if (!isEnrollmentValid) {
                const uClass = String(uData.class || uData.currentClass || '').replace(/^Class\s+/i, '').trim().toLowerCase();
                const uYear = resolveCanonicalAcademicYearId(uData);
                const uSec = String(uData.section || uData.currentSection || '').trim().toLowerCase();

                if (uClass === canonicalExamClass && uYear === canonicalExamYear) {
                  if (isAllSectionExam) {
                    if (uSec) {
                      isEnrollmentValid = true;
                    }
                  } else {
                    if (uSec !== 'all' && uSec === canonicalExamSection) {
                      isEnrollmentValid = true;
                    }
                  }
                }
              }

              if (!isEnrollmentValid) {
                continue; // Fail closed for uncertain historical enrollment
              }

              // Resolve guardian email first, falling back to student's registered email if valid
              const resolvedEmail = resolveResultNotificationRecipientEmail(uData);
              eligibleStudents.push({
                uid: studentUid,
                studentIdentifier: String(uData.permanentStudentId || uData.studentId || studentUid).trim(),
                recipientEmail: resolvedEmail.email,
                recipientSource: resolvedEmail.source,
                guardianName: String(uData.guardianName || uData.fatherName || uData.motherName || 'Parent / Guardian').trim(),
                name: uData.fullName || uData.name || 'Student'
              });
            }

            const smtpConfig = getSmtpTransportConfig();
            const hasRealSmtp = Boolean(smtpConfig.configured && smtpConfig.transportOptions);
            let transporter: any = null;
            if (hasRealSmtp) {
              transporter = nodemailer.createTransport(smtpConfig.transportOptions as any);
            }

            for (const student of eligibleStudents) {
              const canonicalKey = JSON.stringify([eventType, eventId, student.uid]);
              const notificationId = crypto.createHash('sha256').update(canonicalKey).digest('hex');

              const title = `Result Published — ${examType || 'Examination'}`;
              const message = `Dear ${student.name}, your result for ${examType || 'Examination'} (Class ${className}) has been officially published by Shikshantar Academy.`;

              const notifRef = db.collection('notifications').doc(notificationId);
              const notifSnap = await notifRef.get();
              const existingNotif = notifSnap.exists ? notifSnap.data() || {} : {};

              let emailStatus = existingNotif.emailStatus || 'NO_RECIPIENT_EMAIL';
              let emailError: string | null = existingNotif.emailError || null;

              if (!student.recipientEmail) {
                emailStatus = 'NO_RECIPIENT_EMAIL';
              } else {
                const uidDispatchKey = `${examId}_${student.uid}_${student.recipientEmail}`.replace(/[^a-zA-Z0-9_-]/g, '_');
                const idDispatchKey = `${examId}_${student.studentIdentifier || student.uid}_${student.recipientEmail}`.replace(/[^a-zA-Z0-9_-]/g, '_');
                const uidDispatchSnap = await db.collection('publication_email_dispatches').doc(uidDispatchKey).get();
                const idDispatchSnap = (idDispatchKey !== uidDispatchKey)
                  ? await db.collection('publication_email_dispatches').doc(idDispatchKey).get()
                  : null;

                if (uidDispatchSnap.exists || idDispatchSnap?.exists || existingNotif.emailStatus === 'SENT') {
                  emailStatus = 'SENT';
                  emailError = null;
                } else if (hasRealSmtp && transporter) {
                  try {
                    const portalLink = `${process.env.APP_URL || 'https://shikshantaracademy.edu.np'}/result`;
                    const greeting = student.recipientSource === 'student' ? student.name : student.guardianName;
                    await transporter.sendMail({
                      from: `"Shikshantar Academy Results" <${smtpConfig.fromResults}>`,
                      replyTo: smtpConfig.fromResults,
                      to: student.recipientEmail,
                      subject: `Academic Result Published: ${student.name} — Shikshantar Academy`,
                      text: `Dear ${greeting},\n\nThe official ${examType || 'Examination'} results for ${student.name} (Class ${className}) have been officially published by Shikshantar Academy.\n\nView Result: ${portalLink}\n\nRegards,\nShikshantar Academy`,
                      html: `<div style="font-family:sans-serif;padding:20px;"><h2>${title}</h2><p>Dear <strong>${greeting}</strong>,</p><p>${message}</p><p><a href="${portalLink}" style="display:inline-block;padding:10px 20px;background:#1e40af;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">View Official Result</a></p><p>Regards,<br><strong>Shikshantar Academy</strong></p></div>`
                    });
                    emailStatus = 'SENT';
                    emailError = null;
                    const dispatchPayload = {
                      examId,
                      studentUid: student.uid,
                      studentIdentifier: student.studentIdentifier,
                      recipientEmail: student.recipientEmail,
                      recipientSource: student.recipientSource,
                      guardianEmail: student.recipientSource === 'guardian' ? student.recipientEmail : '',
                      guardianName: student.guardianName,
                      studentName: student.name,
                      className,
                      academicYear: canonicalExamYear,
                      dispatchedByUid: 'outbox_worker',
                      sentAt: new Date().toISOString()
                    };
                    await db.collection('publication_email_dispatches').doc(uidDispatchKey).set(dispatchPayload);
                    if (idDispatchKey !== uidDispatchKey) {
                      await db.collection('publication_email_dispatches').doc(idDispatchKey).set(dispatchPayload);
                    }
                  } catch (mailErr: any) {
                    emailStatus = 'FAILED';
                    emailError = mailErr.message || 'SMTP dispatch error';
                  }
                } else {
                  emailStatus = 'UNCONFIGURED';
                  emailError = 'SMTP service not configured on server';
                }
              }

              await notifRef.set({
                notificationId,
                recipientUid: student.uid,
                recipientRole: 'student',
                type: eventType,
                eventType,
                eventId,
                title,
                message,
                link: '/result',
                class: className,
                section: section || 'All',
                academicYearId: canonicalExamYear,
                academicYear: canonicalExamYear,
                recipientEmailSource: student.recipientSource || null,
                read: existingNotif.read === true ? true : false,
                readAt: existingNotif.readAt || null,
                emailStatus,
                emailError,
                createdAt: existingNotif.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }, { merge: true });
            }
          }

          // Step 5: Verify lease ownership before completing event
          const completed = await db.runTransaction(async (txn) => {
            const freshSnap: any = await txn.get(docSnap.ref);
            if (!freshSnap.exists) return false;
            const freshData = freshSnap.data() || {};
            if (freshData.lockedBy !== workerId) return false;

            txn.update(docSnap.ref, {
              status: 'COMPLETED',
              lockedBy: null,
              lockedUntil: null,
              updatedAt: new Date().toISOString(),
              lastError: null
            });
            return true;
          });

          if (!completed) {
            console.warn(`[OUTBOX WORKER] Worker ${workerId} lost lease ownership for event ${eventId} before completion.`);
          }
        } catch (workerErr: any) {
          console.error(`[OUTBOX WORKER] Error processing event ${eventId}:`, workerErr);
          const currentAttempts = (eventData.attempts || 0) + 1;
          const maxAttempts = eventData.maxAttempts || 5;
          
          if (currentAttempts >= maxAttempts) {
            await db.runTransaction(async (txn) => {
              const freshSnap: any = await txn.get(docSnap.ref);
              if (!freshSnap.exists) return;
              if (freshSnap.data()?.lockedBy !== workerId) return;
              txn.update(docSnap.ref, {
                status: 'FAILED',
                attempts: currentAttempts,
                lockedBy: null,
                lockedUntil: null,
                lastError: workerErr.message || 'Unknown error',
                updatedAt: new Date().toISOString()
              });
            });
          } else {
            const backoffMs = Math.pow(2, currentAttempts) * 10000;
            const nextRetry = new Date(Date.now() + backoffMs).toISOString();
            await db.runTransaction(async (txn) => {
              const freshSnap: any = await txn.get(docSnap.ref);
              if (!freshSnap.exists) return;
              if (freshSnap.data()?.lockedBy !== workerId) return;
              txn.update(docSnap.ref, {
                status: 'PENDING',
                attempts: currentAttempts,
                nextRetryAt: nextRetry,
                lockedBy: null,
                lockedUntil: null,
                lastError: workerErr.message || 'Unknown error',
                updatedAt: new Date().toISOString()
              });
            });
          }
        }
      }
    } catch (err: any) {
      if (err?.message?.includes('ECONNREFUSED') || err?.code === 14 || err?.code === 7 || err?.message?.includes('PERMISSION_DENIED') || err?.message?.includes('Missing or insufficient permissions') || err?.message?.includes('No connection established')) {
        // Suppress noisy connection/permission errors when local Firestore emulator or IAM credentials are missing
        return;
      }
      console.error('[OUTBOX WORKER] Error in polling loop:', err);
    }
  }

  if (!options?.skipOutboxWorker) {
    setInterval(processNotificationOutbox, 30000);
  }

  if (!options?.skipVite && !process.env.VERCEL) {
    const isProduction = process.env.NODE_ENV === 'production';
    const distPath = path.join(process.cwd(), 'dist');
    const distIndexHtml = path.join(distPath, 'index.html');

    if (isProduction && fs.existsSync(distIndexHtml)) {
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(distIndexHtml);
      });
    } else {
      const viteModuleName = 'vite';
      const { createServer: createViteServer } = await import(viteModuleName);
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: false,
          ws: false,
          watch: {
            ignored: [
              '**/.browsers/**',
              '**/jdk-21/**',
              '**/_GOLDEN_*/**',
              '**/_checkpoint_*/**',
              '**/_backup_*/**',
              '**/_phase2_*/**',
              '**/result_workspace/**',
              '**/tests/**',
              '**/test_*.ts',
              '**/dist/**',
              '**/live_index.*'
            ]
          }
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }
  }

  return app;
}

async function startServer() {
  const PORT = 3000;
  const app = await createApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test' && !process.env.SKIP_SERVER_START && process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'))) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
