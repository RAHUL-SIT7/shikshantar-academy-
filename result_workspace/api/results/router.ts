import { Request, Response, Router } from 'express';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import { 
  calculateSubjectResult, 
  calculateAggregateResult, 
  getNepalGradePoint, 
  getAcademicTier,
  SubjectConfig,
  SubjectInputMarks,
  SubjectGradeOutput
} from '../../src/lib/nepalGradingEngine';
import { 
  calculateClassRanks, 
  normalizeSubject,
  isPrimaryClassTeacher,
  canTeacherAccessClass,
  canTeacherAccessSubject
} from '../../src/lib/resultPreparationEngine';
import { normalizeClass } from '../../src/lib/teacherAssignmentEngine';

export const resultLifecycleRouter = Router();

// =========================================================================
// SECURITY & AUTHORIZATION CONTEXT
// =========================================================================

export interface AuthContext {
  uid: string;
  email: string;
  role: 'admin' | 'teacher' | 'student' | 'parent';
  adminTier?: string;
  fullName?: string;
  classAssigned?: string;
  primaryClassTeacher?: string;
  primaryClassTeacherYear?: string;
  linkedStudentIds?: string[];
  studentId?: string;
  permanentStudentId?: string;
  studentClass?: string;
}

export async function authenticateUser(req: Request, res: Response): Promise<AuthContext | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or malformed Authorization header.' });
    return null;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Empty Bearer token.' });
    return null;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const userDoc = await admin.firestore().collection('users').doc(decoded.uid).get();
    const userData = userDoc.data() || {};
    const role = (userData.role || 'student').toLowerCase() as any;

    return {
      uid: decoded.uid,
      email: decoded.email || userData.email || '',
      role: ['admin', 'teacher', 'student', 'parent'].includes(role) ? role : 'student',
      adminTier: userData.adminTier,
      fullName: userData.fullName || userData.displayName || '',
      classAssigned: userData.classAssigned || userData.class,
      primaryClassTeacher: userData.primaryClassTeacher || userData.class,
      primaryClassTeacherYear: userData.primaryClassTeacherYear || userData.classAssignedYear,
      linkedStudentIds: Array.isArray(userData.linkedStudentIds) ? userData.linkedStudentIds : (userData.studentId ? [userData.studentId] : []),
      studentId: userData.studentId,
      permanentStudentId: userData.permanentStudentId,
      studentClass: userData.class
    };
  } catch (err: any) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
    return null;
  }
}

export async function verifyTeacherSubjectAccess(
  auth: AuthContext,
  targetClass: string,
  targetSubject: string,
  academicYear?: string
): Promise<{ authorized: boolean; reason?: string }> {
  if (auth.role === 'admin') return { authorized: true };
  if (auth.role !== 'teacher') return { authorized: false, reason: 'Forbidden: Caller is not a teacher.' };

  const normTargetClass = normalizeClass(targetClass);
  const normTargetSubject = normalizeSubject(targetSubject);

  // 1. Primary class teacher has broad access for their assigned class
  const primaryClass = normalizeClass(auth.primaryClassTeacher || auth.classAssigned || '');
  if (primaryClass === normTargetClass) {
    return { authorized: true };
  }

  // 2. Query teacherAssignments in Firestore for specific subject assignment
  try {
    const assignmentsSnap = await admin.firestore()
      .collection('teacherAssignments')
      .where('teacherId', '==', auth.uid)
      .get();

    for (const doc of assignmentsSnap.docs) {
      const data = doc.data();
      const aClass = normalizeClass(data.class || data.className || '');
      const aSub = normalizeSubject(data.subject || data.subjectName || '');
      if (aClass === normTargetClass && aSub === normTargetSubject) {
        return { authorized: true };
      }
    }
  } catch (err) {
    console.warn('[SCOPE] Error checking teacherAssignments:', err);
  }

  return { authorized: false, reason: `Forbidden: Teacher is not assigned to ${targetSubject} in ${targetClass}.` };
}

export async function verifyClassTeacherAccess(
  auth: AuthContext,
  targetClass: string,
  academicYear?: string
): Promise<{ authorized: boolean; reason?: string }> {
  if (auth.role === 'admin') return { authorized: true };
  if (auth.role !== 'teacher') return { authorized: false, reason: 'Forbidden: Caller is not a teacher.' };

  const normTargetClass = normalizeClass(targetClass);
  const primaryClass = normalizeClass(auth.primaryClassTeacher || auth.classAssigned || '');

  if (primaryClass !== normTargetClass) {
    return { 
      authorized: false, 
      reason: `Forbidden: Only administrators or the assigned Class Teacher can manage results for ${targetClass}.` 
    };
  }

  if (academicYear && auth.primaryClassTeacherYear) {
    const tYear = auth.primaryClassTeacherYear.replace(/[^0-9]/g, '');
    const aYear = academicYear.replace(/[^0-9]/g, '');
    if (tYear && aYear && !aYear.includes(tYear) && !tYear.includes(aYear)) {
      return { authorized: false, reason: 'Forbidden: Teacher assignment year does not match academic session.' };
    }
  }

  return { authorized: true };
}

async function recordAudit(entry: {
  actionType: string;
  category?: string;
  targetId?: string;
  targetType?: string;
  studentClass?: string;
  academicYear?: string;
  reason: string;
  previousValue?: string;
  newValue?: string;
  actor: AuthContext;
}) {
  try {
    const ref = admin.firestore().collection('auditLogs').doc();
    await ref.set({
      auditLogId: ref.id,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      timestampStr: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      category: entry.category || 'academic',
      actionType: entry.actionType,
      targetId: entry.targetId || '',
      targetType: entry.targetType || 'results',
      studentClass: entry.studentClass || '',
      academicYear: entry.academicYear || '',
      reason: entry.reason,
      previousValue: entry.previousValue || '',
      newValue: entry.newValue || '',
      actorUid: entry.actor.uid,
      actorRole: entry.actor.role,
      actorEmail: entry.actor.email,
      actorName: entry.actor.fullName,
      result: 'SUCCESS'
    });
  } catch (err) {
    console.warn('[AUDIT] Failed to record audit log:', err);
  }
}

// =========================================================================
// 1. POST /api/results/draft-save
// =========================================================================
resultLifecycleRouter.post('/draft-save', async (req: Request, res: Response) => {
  try {
    const auth = await authenticateUser(req, res);
    if (!auth) return;

    const { examId, examType, className, section, academicYear, subject, subjectConfig, entries } = req.body;
    if (!examId || !className || !subject || !Array.isArray(entries)) {
      return res.status(400).json({ error: 'Missing required parameters: examId, className, subject, entries.' });
    }

    const access = await verifyTeacherSubjectAccess(auth, className, subject, academicYear);
    if (!access.authorized) {
      return res.status(403).json({ error: access.reason });
    }

    const cfg: SubjectConfig = {
      thFullMarks: Number(subjectConfig?.thFullMarks || 100),
      thPassMarks: subjectConfig?.thPassMarks !== undefined ? Number(subjectConfig.thPassMarks) : undefined,
      prFullMarks: Number(subjectConfig?.prFullMarks || 0),
      prPassMarks: subjectConfig?.prPassMarks !== undefined ? Number(subjectConfig.prPassMarks) : undefined,
      hasTh: subjectConfig?.hasTh !== undefined ? Boolean(subjectConfig.hasTh) : true,
      hasPr: subjectConfig?.hasPr !== undefined ? Boolean(subjectConfig.hasPr) : false
    };

    const normSubj = subject.replace(/\s+/g, '');
    const db = admin.firestore();
    const batch = db.batch();
    let savedCount = 0;

    for (const entry of entries) {
      const studentUid = entry.studentUid || entry.studentId;
      if (!studentUid) continue;

      const inputMarks: SubjectInputMarks = {
        theoryMarks: entry.theoryMarks !== undefined && entry.theoryMarks !== null ? entry.theoryMarks : null,
        practicalMarks: entry.practicalMarks !== undefined && entry.practicalMarks !== null ? entry.practicalMarks : null,
        isAbsentTheory: Boolean(entry.isAbsentTheory || entry.theoryMarks === 'AB'),
        isAbsentPractical: Boolean(entry.isAbsentPractical || entry.practicalMarks === 'AB')
      };

      const gradeOutput = calculateSubjectResult(normSubj, subject, inputMarks, cfg);

      const docId = `${examId}_${studentUid}_${normSubj}`;
      const resultDocRef = db.collection('results').doc(docId);
      const secureDocRef = db.collection('results_secure').doc(studentUid).collection('records').doc(docId);

      const recordData = {
        examId,
        examType: examType || '',
        studentUid,
        studentId: entry.studentId || studentUid,
        permanentStudentId: entry.permanentStudentId || entry.studentId || studentUid,
        studentName: entry.studentName || '',
        rollNo: entry.rollNo || null,
        class: className,
        section: section || 'A',
        academicYear: academicYear || '',
        subject,
        subjectId: normSubj,
        theoryMarks: gradeOutput.theoryMarks,
        practicalMarks: gradeOutput.practicalMarks,
        theoryGrade: gradeOutput.theoryGrade,
        practicalGrade: gradeOutput.practicalGrade,
        subjectGrade: gradeOutput.subjectGrade,
        subjectGradePoint: gradeOutput.subjectGradePoint,
        totalMarks: gradeOutput.totalObtainedMarks,
        isNg: gradeOutput.isNg,
        failureReasons: gradeOutput.failureReasons,
        savedByUid: auth.uid,
        savedByName: auth.fullName,
        savedAt: new Date().toISOString()
      };

      batch.set(resultDocRef, recordData, { merge: true });
      batch.set(secureDocRef, recordData, { merge: true });
      savedCount++;
    }

    await batch.commit();

    await recordAudit({
      actionType: 'RESULTS_DRAFT_SAVED',
      targetId: `${examId}_${normSubj}`,
      studentClass: className,
      academicYear,
      reason: `Saved marks draft for ${subject} in Class ${className} (${savedCount} students)`,
      actor: auth
    });

    return res.status(200).json({ success: true, savedCount });
  } catch (err: any) {
    console.error('[API] /api/results/draft-save error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// =========================================================================
// 2. POST /api/results/submit-subject
// =========================================================================
resultLifecycleRouter.post('/submit-subject', async (req: Request, res: Response) => {
  try {
    const auth = await authenticateUser(req, res);
    if (!auth) return;

    const { examId, className, subject, academicYear } = req.body;
    if (!examId || !className || !subject) {
      return res.status(400).json({ error: 'Missing required parameters: examId, className, subject.' });
    }

    const access = await verifyTeacherSubjectAccess(auth, className, subject, academicYear);
    if (!access.authorized) {
      return res.status(403).json({ error: access.reason });
    }

    const statusDocId = `${examId}_${subject.replace(/\s+/g, '')}`;
    const statusRef = admin.firestore().collection('exam_subject_status').doc(statusDocId);

    await statusRef.set({
      examId,
      className,
      subject,
      academicYear: academicYear || '',
      status: 'SUBMITTED',
      submittedByUid: auth.uid,
      submittedByName: auth.fullName,
      submittedAt: new Date().toISOString()
    }, { merge: true });

    await recordAudit({
      actionType: 'SUBJECT_SUBMITTED',
      targetId: statusDocId,
      studentClass: className,
      academicYear,
      reason: `Subject teacher submitted marks for ${subject} (Class ${className})`,
      actor: auth
    });

    return res.status(200).json({ success: true, status: 'SUBMITTED' });
  } catch (err: any) {
    console.error('[API] /api/results/submit-subject error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// =========================================================================
// 3. POST /api/results/request-correction
// =========================================================================
resultLifecycleRouter.post('/request-correction', async (req: Request, res: Response) => {
  try {
    const auth = await authenticateUser(req, res);
    if (!auth) return;

    const { examId, className, subject, feedback, academicYear } = req.body;
    if (!examId || !className || !subject || !feedback) {
      return res.status(400).json({ error: 'Missing required parameters: examId, className, subject, feedback.' });
    }

    const access = await verifyClassTeacherAccess(auth, className, academicYear);
    if (!access.authorized) {
      return res.status(403).json({ error: access.reason });
    }

    const statusDocId = `${examId}_${subject.replace(/\s+/g, '')}`;
    const statusRef = admin.firestore().collection('exam_subject_status').doc(statusDocId);

    await statusRef.set({
      examId,
      className,
      subject,
      status: 'CORRECTION_REQUESTED',
      feedback,
      correctionRequestedByUid: auth.uid,
      correctionRequestedByName: auth.fullName,
      correctionRequestedAt: new Date().toISOString()
    }, { merge: true });

    await recordAudit({
      actionType: 'CORRECTION_REQUESTED',
      targetId: statusDocId,
      studentClass: className,
      academicYear,
      reason: `Correction requested for ${subject} in Class ${className}: ${feedback}`,
      actor: auth
    });

    return res.status(200).json({ success: true, status: 'CORRECTION_REQUESTED' });
  } catch (err: any) {
    console.error('[API] /api/results/request-correction error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// =========================================================================
// 4. POST /api/results/class-review
// =========================================================================
resultLifecycleRouter.post('/class-review', async (req: Request, res: Response) => {
  try {
    const auth = await authenticateUser(req, res);
    if (!auth) return;

    const { examId, className, academicYear, reviewNotes } = req.body;
    if (!examId || !className) {
      return res.status(400).json({ error: 'Missing required parameters: examId, className.' });
    }

    const access = await verifyClassTeacherAccess(auth, className, academicYear);
    if (!access.authorized) {
      return res.status(403).json({ error: access.reason });
    }

    const reviewRef = admin.firestore().collection('class_reviews').doc(`${examId}_${normalizeClass(className)}`);
    await reviewRef.set({
      examId,
      className,
      academicYear: academicYear || '',
      status: 'REVIEWED',
      reviewNotes: reviewNotes || '',
      reviewedByUid: auth.uid,
      reviewedByName: auth.fullName,
      reviewedAt: new Date().toISOString()
    }, { merge: true });

    await recordAudit({
      actionType: 'CLASS_REVIEWED',
      targetId: `${examId}_${className}`,
      studentClass: className,
      academicYear,
      reason: `Class Teacher completed review for Class ${className}`,
      actor: auth
    });

    return res.status(200).json({ success: true, status: 'REVIEWED' });
  } catch (err: any) {
    console.error('[API] /api/results/class-review error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// =========================================================================
// 5. POST /api/results/compile
// =========================================================================
resultLifecycleRouter.post('/compile', async (req: Request, res: Response) => {
  try {
    const auth = await authenticateUser(req, res);
    if (!auth) return;

    const { examId, className, academicYear } = req.body;
    if (!examId || !className) {
      return res.status(400).json({ error: 'Missing required parameters: examId, className.' });
    }

    const access = await verifyClassTeacherAccess(auth, className, academicYear);
    if (!access.authorized) {
      return res.status(403).json({ error: access.reason });
    }

    const db = admin.firestore();

    const studentsSnap = await db.collection('users')
      .where('role', '==', 'student')
      .where('class', '==', className)
      .get();

    const resultsSnap = await db.collection('results')
      .where('examId', '==', examId)
      .get();

    const resultsByStudent = new Map<string, SubjectGradeOutput[]>();
    for (const d of resultsSnap.docs) {
      const data = d.data();
      const sUid = data.studentUid || data.studentId;
      if (!sUid) continue;

      if (!resultsByStudent.has(sUid)) {
        resultsByStudent.set(sUid, []);
      }
      resultsByStudent.get(sUid)!.push({
        subjectId: data.subjectId || data.subject,
        subjectName: data.subject || data.subjectName || '',
        theoryMarks: data.theoryMarks,
        practicalMarks: data.practicalMarks,
        thFullMarks: Number(data.thFullMarks || 0),
        prFullMarks: Number(data.prFullMarks || 0),
        totalFullMarks: Number(data.totalFullMarks || (Number(data.thFullMarks || 0) + Number(data.prFullMarks || 0))),
        totalObtainedMarks: data.totalMarks !== undefined ? Number(data.totalMarks) : null,
        theoryGrade: data.theoryGrade || '-',
        practicalGrade: data.practicalGrade || '-',
        subjectGrade: data.subjectGrade || 'NG',
        subjectGradePoint: Number(data.subjectGradePoint || 0),
        isNg: Boolean(data.isNg || data.subjectGrade === 'NG'),
        failureReasons: data.failureReasons || []
      });
    }

    const studentSummaries: any[] = [];
    for (const sDoc of studentsSnap.docs) {
      const sData = sDoc.data();
      const sUid = sDoc.id;
      const subOutputs = resultsByStudent.get(sUid) || [];
      const agg = calculateAggregateResult(className, subOutputs);

      studentSummaries.push({
        studentUid: sUid,
        studentId: sData.studentId || sUid,
        permanentStudentId: sData.permanentStudentId || sData.studentId || sUid,
        studentName: sData.fullName || sData.displayName || 'Student',
        rollNo: sData.rollNo || null,
        class: className,
        section: sData.section || 'A',
        academicYear: academicYear || '',
        examId,
        totalFullMarks: agg.totalFullMarks,
        totalObtainedMarks: agg.totalObtainedMarks,
        total: agg.totalObtainedMarks,
        aggregatePercentage: agg.aggregatePercentage,
        percentage: agg.aggregatePercentage,
        overallGrade: agg.overallGrade,
        grade: agg.overallGrade,
        overallGpa: agg.overallGpa,
        gpa: agg.overallGpa,
        gpaDisplayText: agg.gpaDisplayText,
        overallStatus: agg.overallStatus,
        status: agg.overallStatus,
        failedSubjects: agg.failedSubjects,
        isNg: agg.isNg,
        academicTier: agg.academicTier,
        compiledAt: new Date().toISOString()
      });
    }

    const rankedSummaries = calculateClassRanks(studentSummaries);

    const batch = db.batch();
    for (const sum of rankedSummaries) {
      const sumDocRef = db.collection('resultSummary').doc(`${examId}_${sum.studentUid}`);
      batch.set(sumDocRef, sum, { merge: true });
    }

    const examRef = db.collection('exams').doc(examId);
    batch.update(examRef, {
      status: 'COMPILED',
      compiledAt: new Date().toISOString(),
      compiledByUid: auth.uid,
      compiledByName: auth.fullName
    });

    await batch.commit();

    await recordAudit({
      actionType: 'RESULTS_COMPILED',
      targetId: examId,
      studentClass: className,
      academicYear,
      reason: `Compiled results for Class ${className} (${rankedSummaries.length} students)`,
      actor: auth
    });

    return res.status(200).json({ 
      success: true, 
      compiledCount: rankedSummaries.length, 
      summaries: rankedSummaries 
    });
  } catch (err: any) {
    console.error('[API] /api/results/compile error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// =========================================================================
// 6. POST /api/results/publish
// =========================================================================
resultLifecycleRouter.post('/publish', async (req: Request, res: Response) => {
  try {
    const auth = await authenticateUser(req, res);
    if (!auth) return;

    const { examId, className, academicYear } = req.body;
    if (!examId || !className) {
      return res.status(400).json({ error: 'Missing required parameters: examId, className.' });
    }

    const access = await verifyClassTeacherAccess(auth, className, academicYear);
    if (!access.authorized) {
      return res.status(403).json({ error: access.reason });
    }

    const db = admin.firestore();
    const batch = db.batch();
    const publishedAt = new Date().toISOString();

    const examRef = db.collection('exams').doc(examId);
    batch.update(examRef, {
      published: true,
      status: 'PUBLISHED',
      publishedAt,
      publishedByUid: auth.uid,
      publishedByName: auth.fullName
    });

    const summariesSnap = await db.collection('resultSummary')
      .where('examId', '==', examId)
      .get();

    const affectedStudentUids: string[] = [];
    for (const doc of summariesSnap.docs) {
      batch.update(doc.ref, {
        published: true,
        publishedAt
      });
      const data = doc.data();
      if (data.studentUid) affectedStudentUids.push(data.studentUid);
    }

    const manifestRef = db.collection('publicationManifests').doc(examId);
    batch.set(manifestRef, {
      examId,
      className,
      academicYear: academicYear || '',
      status: 'COMMITTED',
      publicationVersion: 1,
      fencingToken: `fence_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      publishedAt,
      publishedByUid: auth.uid,
      publishedByName: auth.fullName,
      totalStudents: summariesSnap.size
    }, { merge: true });

    const noticeId = `notice_result_${examId}`;
    const noticeRef = db.collection('notices').doc(noticeId);
    batch.set(noticeRef, {
      title: `RESULT PUBLISHED: Class ${className}`,
      message: `Results for Class ${className} (${academicYear || 'Current Session'}) have been published. Log in to view your grades.`,
      date: publishedAt.split('T')[0],
      priority: 'Urgent',
      targets: ['Student', `Class ${className}`],
      targetClass: className,
      recipientUids: affectedStudentUids,
      examId,
      status: 'Published',
      isPinned: true,
      timestamp: publishedAt
    }, { merge: true });

    await batch.commit();

    await recordAudit({
      actionType: 'EXAM_PUBLISHED',
      targetId: examId,
      studentClass: className,
      academicYear,
      reason: `Officially published results for Class ${className}`,
      actor: auth
    });

    return res.status(200).json({ 
      success: true, 
      status: 'PUBLISHED', 
      publishedAt, 
      publishedCount: summariesSnap.size 
    });
  } catch (err: any) {
    console.error('[API] /api/results/publish error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// =========================================================================
// 7. POST /api/results/unpublish
// =========================================================================
resultLifecycleRouter.post('/unpublish', async (req: Request, res: Response) => {
  try {
    const auth = await authenticateUser(req, res);
    if (!auth) return;

    const { examId, reason } = req.body;
    if (!examId) {
      return res.status(400).json({ error: 'Missing required parameter: examId.' });
    }

    const db = admin.firestore();
    const examDoc = await db.collection('exams').doc(examId).get();
    if (!examDoc.exists) {
      return res.status(404).json({ error: 'Exam not found.' });
    }

    const examData = examDoc.data() || {};
    const access = await verifyClassTeacherAccess(auth, examData.class || examData.className || '');
    if (!access.authorized) {
      return res.status(403).json({ error: access.reason });
    }

    const batch = db.batch();
    batch.update(examDoc.ref, {
      published: false,
      status: 'DRAFT',
      unpublishedAt: new Date().toISOString(),
      unpublishedByUid: auth.uid,
      unpublishReason: reason || 'Class Teacher/Admin unpublish'
    });

    const summariesSnap = await db.collection('resultSummary').where('examId', '==', examId).get();
    for (const d of summariesSnap.docs) {
      batch.update(d.ref, { published: false });
    }

    const manifestRef = db.collection('publicationManifests').doc(examId);
    batch.set(manifestRef, {
      status: 'REVOKED',
      revokedAt: new Date().toISOString(),
      revokedByUid: auth.uid,
      revocationReason: reason || 'Unpublished'
    }, { merge: true });

    await batch.commit();

    await recordAudit({
      actionType: 'EXAM_UNPUBLISHED',
      targetId: examId,
      studentClass: examData.class || examData.className,
      reason: `Unpublished results for exam ${examId}: ${reason || 'Manual unpublish'}`,
      actor: auth
    });

    return res.status(200).json({ success: true, status: 'UNPUBLISHED' });
  } catch (err: any) {
    console.error('[API] /api/results/unpublish error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// =========================================================================
// 8. POST /api/results/reopen-session
// =========================================================================
resultLifecycleRouter.post('/reopen-session', async (req: Request, res: Response) => {
  try {
    const auth = await authenticateUser(req, res);
    if (!auth) return;

    if (auth.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only administrators can reopen closed academic sessions.' });
    }

    const { examId, reason } = req.body;
    if (!examId || !reason) {
      return res.status(400).json({ error: 'Missing required parameters: examId, reason.' });
    }

    const db = admin.firestore();
    const examRef = db.collection('exams').doc(examId);
    const examSnap = await examRef.get();
    if (!examSnap.exists) {
      return res.status(404).json({ error: 'Exam not found.' });
    }

    await examRef.update({
      status: 'REOPENED_FOR_EDIT',
      published: false,
      reopenedAt: new Date().toISOString(),
      reopenedByUid: auth.uid,
      reopenReason: reason
    });

    await recordAudit({
      actionType: 'SESSION_REOPENED',
      targetId: examId,
      reason: `Administrator reopened exam ${examId} for corrections: ${reason}`,
      actor: auth
    });

    return res.status(200).json({ success: true, status: 'REOPENED_FOR_EDIT' });
  } catch (err: any) {
    console.error('[API] /api/results/reopen-session error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// =========================================================================
// 9. POST /api/results/import-excel
// =========================================================================
resultLifecycleRouter.post('/import-excel', async (req: Request, res: Response) => {
  try {
    const auth = await authenticateUser(req, res);
    if (!auth) return;

    const { examId, examType, className, subject, academicYear, subjectConfig, rows } = req.body;
    if (!examId || !className || !subject || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Missing required parameters: examId, className, subject, rows array.' });
    }

    const access = await verifyTeacherSubjectAccess(auth, className, subject, academicYear);
    if (!access.authorized) {
      return res.status(403).json({ error: access.reason });
    }

    const db = admin.firestore();
    const normSubj = subject.replace(/\s+/g, '');
    const cfg: SubjectConfig = {
      thFullMarks: Number(subjectConfig?.thFullMarks || 100),
      thPassMarks: subjectConfig?.thPassMarks !== undefined ? Number(subjectConfig.thPassMarks) : undefined,
      prFullMarks: Number(subjectConfig?.prFullMarks || 0),
      prPassMarks: subjectConfig?.prPassMarks !== undefined ? Number(subjectConfig.prPassMarks) : undefined,
      hasTh: subjectConfig?.hasTh !== undefined ? Boolean(subjectConfig.hasTh) : true,
      hasPr: subjectConfig?.hasPr !== undefined ? Boolean(subjectConfig.hasPr) : false
    };

    let processedCount = 0;
    const errors: string[] = [];
    const seenStudentIds = new Set<string>();
    const batch = db.batch();

    for (const r of rows) {
      const studentId = String(r.studentId || r.permanentStudentId || r.studentUid || '').trim();
      if (!studentId) {
        errors.push(`Row without student identifier skipped`);
        continue;
      }

      if (seenStudentIds.has(studentId)) {
        errors.push(`Duplicate row for student ${studentId} rejected`);
        continue;
      }
      seenStudentIds.add(studentId);

      const inputMarks: SubjectInputMarks = {
        theoryMarks: r.theoryMarks !== undefined && r.theoryMarks !== null && r.theoryMarks !== '' ? (r.theoryMarks === 'AB' ? 'AB' : Number(r.theoryMarks)) : null,
        practicalMarks: r.practicalMarks !== undefined && r.practicalMarks !== null && r.practicalMarks !== '' ? (r.practicalMarks === 'AB' ? 'AB' : Number(r.practicalMarks)) : null,
        isAbsentTheory: r.isAbsentTheory || r.theoryMarks === 'AB',
        isAbsentPractical: r.isAbsentPractical || r.practicalMarks === 'AB'
      };

      const gradeOutput = calculateSubjectResult(normSubj, subject, inputMarks, cfg);
      const docId = `${examId}_${studentId}_${normSubj}`;
      const docRef = db.collection('results').doc(docId);

      batch.set(docRef, {
        examId,
        examType: examType || '',
        studentUid: r.studentUid || studentId,
        studentId,
        permanentStudentId: r.permanentStudentId || studentId,
        studentName: r.studentName || '',
        rollNo: r.rollNo || null,
        class: className,
        subject,
        subjectId: normSubj,
        theoryMarks: gradeOutput.theoryMarks,
        practicalMarks: gradeOutput.practicalMarks,
        theoryGrade: gradeOutput.theoryGrade,
        practicalGrade: gradeOutput.practicalGrade,
        subjectGrade: gradeOutput.subjectGrade,
        subjectGradePoint: gradeOutput.subjectGradePoint,
        totalMarks: gradeOutput.totalObtainedMarks,
        isNg: gradeOutput.isNg,
        failureReasons: gradeOutput.failureReasons,
        importedVia: 'EXCEL',
        importedByUid: auth.uid,
        importedAt: new Date().toISOString()
      }, { merge: true });

      processedCount++;
    }

    if (processedCount > 0) {
      await batch.commit();
    }

    await recordAudit({
      actionType: 'EXCEL_MARKS_IMPORTED',
      targetId: `${examId}_${normSubj}`,
      studentClass: className,
      academicYear,
      reason: `Excel imported marks for ${subject} in Class ${className} (${processedCount} processed, ${errors.length} errors)`,
      actor: auth
    });

    return res.status(200).json({ 
      success: true, 
      processedCount, 
      errorCount: errors.length, 
      errors 
    });
  } catch (err: any) {
    console.error('[API] /api/results/import-excel error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// =========================================================================
// 10. GET /api/results/my-results
// =========================================================================
resultLifecycleRouter.get('/my-results', async (req: Request, res: Response) => {
  try {
    const auth = await authenticateUser(req, res);
    if (!auth) return;

    const db = admin.firestore();
    const reqExamId = req.query.examId as string | undefined;

    let authorizedStudentIds: string[] = [];

    if (auth.role === 'student') {
      authorizedStudentIds = [auth.uid];
      if (auth.studentId) authorizedStudentIds.push(auth.studentId);
      if (auth.permanentStudentId) authorizedStudentIds.push(auth.permanentStudentId);
    } else if (auth.role === 'parent') {
      authorizedStudentIds = auth.linkedStudentIds || [];
      if (authorizedStudentIds.length === 0) {
        return res.status(200).json({ success: true, results: [] });
      }
    } else if (auth.role === 'teacher' || auth.role === 'admin') {
      const queryStudentId = req.query.studentId as string | undefined;
      if (queryStudentId) {
        authorizedStudentIds = [queryStudentId];
      }
    }

    if (authorizedStudentIds.length === 0) {
      return res.status(403).json({ error: 'Forbidden: No authorized student scope found.' });
    }

    // 1. Fetch published exams
    const examsSnap = await db.collection('exams')
      .where('published', '==', true)
      .get();

    const publishedExamIds = new Set<string>();
    for (const d of examsSnap.docs) {
      publishedExamIds.add(d.id);
    }

    // 2. Fetch active manifests
    const manifestsSnap = await db.collection('publicationManifests')
      .where('status', '==', 'COMMITTED')
      .get();

    const activeManifestExamIds = new Set<string>();
    for (const d of manifestsSnap.docs) {
      activeManifestExamIds.add(d.id);
    }

    // Exam is valid only if published AND manifest is COMMITTED (or legacy published)
    const validExamIds = new Set(
      [...publishedExamIds].filter(id => activeManifestExamIds.has(id) || publishedExamIds.has(id))
    );

    if (validExamIds.size === 0) {
      return res.status(200).json({ success: true, results: [] });
    }

    // 3. Query /resultSummary for authorized student IDs
    const idChunks = authorizedStudentIds.slice(0, 10);
    const summaryPromises = [
      db.collection('resultSummary').where('studentUid', 'in', idChunks).get(),
      db.collection('resultSummary').where('studentId', 'in', idChunks).get()
    ];

    const [snap1, snap2] = await Promise.all(summaryPromises);
    const summaryDocs = [...snap1.docs, ...snap2.docs];

    const deduplicatedSummaries = new Map<string, any>();
    for (const d of summaryDocs) {
      const data = d.data();
      const examId = data.examId;
      if (!validExamIds.has(examId)) continue;
      if (reqExamId && examId !== reqExamId) continue;
      if (data.published === false) continue;

      deduplicatedSummaries.set(d.id, { id: d.id, ...data });
    }

    // 4. Query subject details from /results for each summary
    const finalResults: any[] = [];
    for (const [_, summary] of deduplicatedSummaries) {
      const subSnap = await db.collection('results')
        .where('examId', '==', summary.examId)
        .where('studentUid', '==', summary.studentUid)
        .get();

      const subjects = subSnap.docs.map(s => s.data());
      finalResults.push({
        ...summary,
        subjects
      });
    }

    return res.status(200).json({
      success: true,
      callerRole: auth.role,
      results: finalResults
    });
  } catch (err: any) {
    console.error('[API] /api/results/my-results error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});
