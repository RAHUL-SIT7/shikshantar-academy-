import crypto from 'crypto';
import admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { applyCorsAndSecurityHeaders, ensureFirebaseAdmin, getVercelAdminDb, verifyVercelCaller } from '../_lib/auth';

export default async function handler(req: any, res: any) {
  applyCorsAndSecurityHeaders(req, res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const adminUser = await verifyVercelCaller(req, res);
    if (!adminUser) return;
    if (adminUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only Administrators can perform this operation.' });
    }

    ensureFirebaseAdmin();
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
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

    const db = getVercelAdminDb();

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

    const opId = `OP_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await db.collection('audit_logs').doc(opId).set({
      id: opId,
      auditLogId: opId,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      actorUid: adminUser.uid,
      actorEmail: adminUser.email,
      actorName: adminUser.userData?.fullName || adminUser.email,
      actorRole: adminUser.role,
      adminTier: adminUser.adminTier,
      targetUid: uid,
      targetId: permanentId || uid,
      action: 'USER_CREATED',
      actionType: 'USER_CREATED',
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
    return res.status(500).json({ error: err?.message || 'Failed to create user account.' });
  }
}
