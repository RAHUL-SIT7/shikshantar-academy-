import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Shield, Search, CheckCircle2, AlertCircle, User, Mail, Smartphone, BadgeCheck, MoreHorizontal, Trash2, Edit3, X, Filter, UserPlus, Users, UserCheck, ShieldCheck, Lock, Eye, EyeOff, ChevronDown, Calendar, KeyRound, Copy, Check, AlertTriangle } from 'lucide-react';
import { db, auth, firebaseConfig } from '../firebase';
import { doc, onSnapshot, collection, updateDoc, deleteDoc, setDoc, getDoc, getDocs, query, where, runTransaction } from 'firebase/firestore';
import { onAuthStateChanged, getAuth } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, createUserWithEmailAndPassword, inMemoryPersistence } from 'firebase/auth';
import NepaliADDatePicker from '../components/NepaliADDatePicker';
import { checkDuplicateStudentRoll, checkDuplicateStudentRollInFirestore, extractStudentRoll } from '../lib/studentValidation';
import { recordAuditLog, buildAuthoritativeAuditPayload, getAuthoritativeActor } from '../lib/auditLogger';
import { generateNextStudentId, generateNextTeacherId, generateNextAdminId, assertEmisIsUnique, recordStudentEnrollment, getCurrentBSAcademicYear, ensurePermanentIdentitiesForExistingUsers } from '../lib/permanentIdentityEngine';

// Initialize a secondary Firebase app to create users without signing out the admin
const secondaryApp = getApps().find(app => app.name === "SecondaryApp") || initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = (() => {
  try {
    return getAuth(secondaryApp);
  } catch (e) {
    return initializeAuth(secondaryApp, {
      persistence: inMemoryPersistence
    });
  }
})();

const TEACHER_CLASSES = [
  'Play Group',
  'Nursery',
  'LKG',
  'UKG',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10'
];

const STANDARD_SUBJECTS = [
  "Mathematics",
  "Science",
  "English",
  "Nepali",
  "Social Studies",
  "Computer",
  "HPE",
  "Opt. Math"
];

interface UserProfile {
  id: string;
  email?: string;
  role?: 'student' | 'teacher' | 'admin';
  adminTier?: 'primary' | 'secondary';
  fullName?: string;
  name?: string;
  dob?: string;
  dobBs?: string;
  phone?: string;
  studentId?: string;
  permanentStudentId?: string;
  legacyStudentId?: string;
  teacherId?: string;
  permanentTeacherId?: string;
  adminId?: string;
  permanentAdminId?: string;
  staffId?: string;
  emisNumber?: string;
  studentEmis?: string;
  class?: string;
  section?: string;
  rollNumber?: string;
  rollNo?: string;
  active?: boolean;
  status?: string;
  deleted?: boolean;
  fatherName?: string;
  motherName?: string;
  guardianName?: string;
  caste?: string;
  disability?: string;
  gender?: string;
  address?: string;
  scholarshipStatus?: string;
  scholarshipAmount?: number;
  hasTransportation?: string;
  transportRoute?: string;
  transportFee?: number;
  hasComputer?: string;
  computerFee?: number;
  assignedClasses?: string[];
  assignedSubjects?: string[];
  classAssignedYear?: string;
  createdAt?: string;
}

export default function UserApprovals() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [viewingUser, setViewingUser] = useState<UserProfile | null>(null);
  const [userToDelete, setUserToDelete] = useState<{ id: string, name: string, role?: string, adminTier?: string } | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [bulkActionOpen, setBulkActionOpen] = useState(false);
  const [academicYear, setAcademicYear] = useState<string>('2083');

  const currentUserData = auth.currentUser ? usersList.find(u => u.id === auth.currentUser?.uid) : null;
  const isPrimaryAdmin = currentUserData?.adminTier !== 'secondary'; // Default to primary if not set

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'fee_structure'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.academicYear) {
          setAcademicYear(data.academicYear);
        }
      }
    });
    return () => unsub();
  }, []);

  const getStudentCurrentClass = (user: UserProfile, currentYearStr?: string) => {
    if (user.role !== 'student' || !user.class) return user.class || '';
    return user.class;
  };

  useEffect(() => {
    let unsubUsers = () => {};
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubUsers();
      
      if (user) {
        unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
          const uList: UserProfile[] = [];
          snapshot.forEach((docSnap) => {
            uList.push({ id: docSnap.id, ...docSnap.data() } as UserProfile);
          });
          setUsersList(uList);
          setIsUsersLoading(false);
        }, (error) => {
          console.error("Firebase read users error:", error);
          setStatus({ type: 'error', message: 'Failed to fetch users database.' });
          setIsUsersLoading(false);
        });
      } else {
        setUsersList([]);
        setIsUsersLoading(false);
      }
    });

    return () => { unsubUsers(); unsubAuth(); };
  }, []);

  // Self-healing effect for super admin profile if missing
  useEffect(() => {
    const runSelfHeal = async () => {
      if (!auth.currentUser || isUsersLoading) return;
      
      const currentUserRole = localStorage.getItem('userRole');
      if (currentUserRole !== 'admin') return;

      // 1. Check if the logged-in admin has a document in the users collection
      const adminInList = usersList.find(u => u.id === auth.currentUser?.uid);
      if (!adminInList && auth.currentUser) {
        console.log("Admin document missing from users collection. Creating it...");
        try {
          await setDoc(doc(db, 'users', auth.currentUser.uid), {
            email: auth.currentUser.email || 'admin@shikshantar.edu.np',
            fullName: auth.currentUser.displayName || 'Administrator',
            role: 'admin',
            adminTier: 'primary',
            status: 'approved',
            active: true,
            createdAt: new Date().toISOString()
          }, { merge: true });
        } catch (err) {
          console.error("Failed to self-heal admin document:", err);
        }
      }
    };

    runSelfHeal();
  }, [auth.currentUser, isUsersLoading, usersList]);

  // Safe idempotent migration effect: Ensures all existing active users have permanent IDs without overwriting existing IDs or inventing EMIS
  const migrationRanRef = React.useRef(false);
  useEffect(() => {
    if (!auth.currentUser || isUsersLoading || !isPrimaryAdmin || migrationRanRef.current) return;
    migrationRanRef.current = true;
    ensurePermanentIdentitiesForExistingUsers().then(res => {
      if (res.migratedCount > 0) {
        console.log(`[Identity Engine] Migrated ${res.migratedCount} existing user records with permanent identities.`);
      }
    }).catch(err => {
      console.warn("[Identity Engine] Backfill check error:", err);
    });
  }, [auth.currentUser, isUsersLoading, isPrimaryAdmin]);

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    // Validate that names do not contain numbers
    if (editingUser.fullName && /\d/.test(editingUser.fullName)) {
      setStatus({ type: 'error', message: 'Full Legal Name cannot contain numbers.' });
      setTimeout(() => setStatus({ type: null, message: '' }), 3000);
      return;
    }
    if (editingUser.role === 'student') {
      if (editingUser.fatherName && /\d/.test(editingUser.fatherName)) {
        setStatus({ type: 'error', message: "Father's Name cannot contain numbers." });
        setTimeout(() => setStatus({ type: null, message: '' }), 3000);
        return;
      }
      if (editingUser.motherName && /\d/.test(editingUser.motherName)) {
        setStatus({ type: 'error', message: "Mother's Name cannot contain numbers." });
        setTimeout(() => setStatus({ type: null, message: '' }), 3000);
        return;
      }
      if (editingUser.guardianName && /\d/.test(editingUser.guardianName)) {
        setStatus({ type: 'error', message: "Guardian's Name cannot contain numbers." });
        setTimeout(() => setStatus({ type: null, message: '' }), 3000);
        return;
      }
    }

    const originalUser = usersList.find(u => u.id === editingUser.id);

    // Edit Protection: Permanent identities are authoritative and immutable
    if (editingUser.role === 'student') {
      const permId = originalUser?.permanentStudentId || originalUser?.studentId || editingUser.permanentStudentId || editingUser.studentId || '';
      editingUser.permanentStudentId = permId;
      editingUser.studentId = permId;

      const cleanEmis = (editingUser.emisNumber || '').trim();
      if (cleanEmis) {
        try {
          await assertEmisIsUnique(cleanEmis, editingUser.id);
          editingUser.emisNumber = cleanEmis;
          editingUser.studentEmis = cleanEmis;
        } catch (emisErr: any) {
          setStatus({ type: 'error', message: emisErr.message || 'Duplicate EMIS Number detected.' });
          setTimeout(() => setStatus({ type: null, message: '' }), 5000);
          return;
        }
      }

      if (!editingUser.address?.trim()) {
        setStatus({ type: 'error', message: 'Address is a permanent field and is mandatory for students.' });
        setTimeout(() => setStatus({ type: null, message: '' }), 3000);
        return;
      }
    } else if (editingUser.role === 'teacher') {
      const permTchId = originalUser?.teacherId || originalUser?.permanentTeacherId || editingUser.teacherId || editingUser.permanentTeacherId || '';
      editingUser.teacherId = permTchId;
      editingUser.permanentTeacherId = permTchId;
      editingUser.staffId = permTchId;
    } else if (editingUser.role === 'admin') {
      const permAdmId = originalUser?.adminId || originalUser?.permanentAdminId || editingUser.adminId || editingUser.permanentAdminId || '';
      editingUser.adminId = permAdmId;
      editingUser.permanentAdminId = permAdmId;
      editingUser.staffId = permAdmId;
    }

    try {
      const { id, ...rawUpdateData } = editingUser;
      
      // Keep track of class assignment year for automatic promotion baseline
      if (editingUser.role === 'student') {
        if (originalUser && originalUser.class !== editingUser.class) {
          rawUpdateData.classAssignedYear = academicYear;
        } else if (!editingUser.classAssignedYear) {
          rawUpdateData.classAssignedYear = academicYear;
        }
        rawUpdateData.permanentStudentId = editingUser.permanentStudentId;
        rawUpdateData.studentId = editingUser.permanentStudentId;
        if (editingUser.emisNumber) {
          rawUpdateData.emisNumber = editingUser.emisNumber.trim();
          rawUpdateData.studentEmis = editingUser.emisNumber.trim();
        }
        if (editingUser.rollNumber !== undefined) {
          rawUpdateData.rollNumber = editingUser.rollNumber;
          rawUpdateData.rollNo = editingUser.rollNumber;
        }
      } else if (editingUser.role === 'teacher') {
        rawUpdateData.permanentTeacherId = editingUser.permanentTeacherId;
        rawUpdateData.teacherId = editingUser.teacherId;
        rawUpdateData.staffId = editingUser.teacherId;
      } else if (editingUser.role === 'admin') {
        rawUpdateData.permanentAdminId = editingUser.permanentAdminId;
        rawUpdateData.adminId = editingUser.adminId;
        rawUpdateData.staffId = editingUser.adminId;
      }

      if (rawUpdateData.role === 'admin') {
        if (!rawUpdateData.adminTier) rawUpdateData.adminTier = 'secondary';
        if (!isPrimaryAdmin && rawUpdateData.adminTier === 'primary' && id !== auth.currentUser?.uid) {
           rawUpdateData.adminTier = 'secondary'; // Prevent privilege escalation hack
        }
      } else {
        rawUpdateData.adminTier = null as any;
      }

      // Deep clean of any undefined values to prevent Firestore database exceptions
      const updateData: any = {};
      Object.entries(rawUpdateData).forEach(([key, val]) => {
        if (val !== undefined) {
          updateData[key] = val;
        }
      });

      // Fail-closed authorization check
      const authoritativeActor = await getAuthoritativeActor();
      if (authoritativeActor.actorRole !== 'admin') {
        setStatus({ type: 'error', message: 'Unauthorized: Only administrators can update user profiles.' });
        return;
      }

      const stableRequestId = Math.random().toString(36).slice(2, 9);
      const opId = `OP_USER_EDIT_${id}_${stableRequestId}`;
      const userRef = doc(db, 'users', id);

      await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) {
          throw new Error('User profile record not found.');
        }
        const currentData = userSnap.data();
        const beforeState = {
          fullName: currentData.fullName || '',
          email: currentData.email || '',
          class: currentData.class || '',
          rollNumber: currentData.rollNumber || '',
          role: currentData.role || ''
        };
        const afterState = {
          fullName: updateData.fullName !== undefined ? updateData.fullName : beforeState.fullName,
          email: updateData.email !== undefined ? updateData.email : beforeState.email,
          class: updateData.class !== undefined ? updateData.class : beforeState.class,
          rollNumber: updateData.rollNumber !== undefined ? updateData.rollNumber : beforeState.rollNumber,
          role: updateData.role !== undefined ? updateData.role : beforeState.role
        };

        // Idempotency: If state is unchanged, do not perform redundant write
        const isIdentical = Object.keys(afterState).every(
          (k) => (beforeState as any)[k] === (afterState as any)[k]
        );
        if (isIdentical) {
          return;
        }

        tx.update(userRef, updateData);

        const auditPayload = await buildAuthoritativeAuditPayload({
          category: 'security',
          actionType: 'USER_PROFILE_UPDATED',
          action: 'USER_PROFILE_UPDATED',
          targetType: 'user',
          targetId: id,
          studentId: id,
          studentName: editingUser.fullName || editingUser.email || 'User',
          beforeState,
          afterState,
          previousValue: `Class: ${beforeState.class || '-'}, Roll: ${beforeState.rollNumber || '-'}, Name: ${beforeState.fullName}`,
          newValue: `Class: ${afterState.class || '-'}, Roll: ${afterState.rollNumber || '-'}, Name: ${afterState.fullName}`,
          reason: 'Administrator updated user profile information',
          operationId: opId
        }, opId);

        tx.set(doc(db, 'audit_logs', opId), auditPayload);
      });

      setStatus({ type: 'success', message: `User ${editingUser.fullName || editingUser.email} updated successfully.` });
      setEditingUser(null);
    } catch (error: any) {
      console.error("Failed to update user profile info:", error);
      setStatus({ type: 'error', message: `Failed to update user details. ${error.message || ''}` });
    }
    setTimeout(() => setStatus({ type: null, message: '' }), 3000);
  };

  const setRole = async (userId: string, newRole: 'admin' | 'teacher' | 'student') => {
    try {
      // Fail-closed authorization check
      const authoritativeActor = await getAuthoritativeActor();
      if (authoritativeActor.actorRole !== 'admin') {
        setStatus({ type: 'error', message: 'Unauthorized: Administrator privileges required.' });
        return;
      }

      if (newRole === 'admin' && authoritativeActor.adminTier !== 'primary') {
        setStatus({ type: 'error', message: 'Only Primary Administrators can assign admin roles.' });
        setTimeout(() => setStatus({ type: null, message: '' }), 3000);
        return;
      }

      const target = usersList.find(u => u.id === userId);
      const stableRequestId = Math.random().toString(36).slice(2, 9);
      const opId = `OP_ROLE_CHANGE_${userId}_${stableRequestId}`;
      const userRef = doc(db, 'users', userId);

      await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) {
          throw new Error('User record not found.');
        }
        const currentData = userSnap.data();
        const currentRole = currentData.role || 'user';
        const currentTier = currentData.adminTier || null;
        const newTier = newRole === 'admin' ? 'secondary' : null;

        // Idempotency check: If user already has the requested role and tier, do not perform mutation
        if (currentRole === newRole && currentTier === newTier) {
          return;
        }

        if (newRole === 'admin') {
          tx.update(userRef, { role: newRole, adminTier: 'secondary' });
        } else {
          tx.update(userRef, { role: newRole, adminTier: null });
        }

        const auditPayload = await buildAuthoritativeAuditPayload({
          category: 'security',
          actionType: 'ROLE_CHANGED',
          action: 'ROLE_CHANGED',
          targetType: 'user',
          targetId: userId,
          studentId: userId,
          studentName: currentData.fullName || currentData.email || 'User',
          beforeState: { role: currentRole, adminTier: currentTier },
          afterState: { role: newRole, adminTier: newTier },
          previousValue: `Role: ${currentRole}`,
          newValue: `Role: ${newRole} (Tier: ${newRole === 'admin' ? 'secondary' : 'none'})`,
          reason: `Administrator updated role to ${newRole}`,
          operationId: opId,
          meta: { userId, previousRole: currentRole, newRole }
        }, opId);

        tx.set(doc(db, 'audit_logs', opId), auditPayload);
      });

      setStatus({ type: 'success', message: `Role changed to ${newRole}.` });
    } catch (error: any) {
      console.error("Failed to update role:", error);
      setStatus({ type: 'error', message: `Update failed: ${error?.message || error}` });
    }
    setTimeout(() => setStatus({ type: null, message: '' }), 3000);
  };

  const setAdminTier = async (userId: string, tier: 'primary' | 'secondary') => {
    try {
      // Fail-closed authorization check
      const authoritativeActor = await getAuthoritativeActor();
      if (authoritativeActor.actorRole !== 'admin' || authoritativeActor.adminTier !== 'primary') {
        setStatus({ type: 'error', message: 'Unauthorized: Only Primary (1°) Administrators can change admin tiers.' });
        return;
      }

      const target = usersList.find(u => u.id === userId);
      const stableRequestId = Math.random().toString(36).slice(2, 9);
      const opId = `OP_TIER_CHANGE_${userId}_${stableRequestId}`;
      const userRef = doc(db, 'users', userId);

      await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) {
          throw new Error('User record not found.');
        }
        const currentData = userSnap.data();
        const currentTier = currentData.adminTier || 'primary';

        // Idempotency check: If user already has the requested tier, return cleanly
        if (currentTier === tier) {
          return;
        }

        tx.update(userRef, { adminTier: tier });

        const auditPayload = await buildAuthoritativeAuditPayload({
          category: 'security',
          actionType: 'ADMIN_TIER_CHANGED',
          action: 'ADMIN_TIER_CHANGED',
          targetType: 'user',
          targetId: userId,
          studentId: userId,
          studentName: currentData.fullName || currentData.email || 'Administrator',
          beforeState: { adminTier: currentTier },
          afterState: { adminTier: tier },
          previousValue: `Admin Tier: ${currentTier} (${currentTier === 'primary' ? '1° Admin' : '2° Admin'})`,
          newValue: `Admin Tier: ${tier} (${tier === 'primary' ? '1° Admin' : '2° Admin'})`,
          reason: `Primary Administrator changed governance tier to ${tier === 'primary' ? '1° Admin (Primary)' : '2° Admin (Secondary)'}`,
          operationId: opId,
          meta: { userId, previousTier: currentTier, newTier: tier }
        }, opId);

        tx.set(doc(db, 'audit_logs', opId), auditPayload);
      });

      setStatus({ type: 'success', message: `Admin tier updated to ${tier}.` });
    } catch (error: any) {
      console.error("Failed to update admin tier:", error);
      setStatus({ type: 'error', message: `Update failed: ${error?.message || error}` });
    }
    setTimeout(() => setStatus({ type: null, message: '' }), 3000);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    
    // Check if user is trying to delete self
    if (auth.currentUser && userToDelete.id === auth.currentUser.uid) {
      setStatus({ type: 'error', message: 'You cannot delete your own account.' });
      return;
    }

    if (deleteConfirmationText !== 'DELETE') {
      setStatus({ type: 'error', message: 'Please type DELETE to confirm.' });
      setTimeout(() => setStatus({ type: null, message: '' }), 3000);
      return;
    }

    try {
      // Step 1: Resolve authoritative actor and verify admin permissions fail-closed
      const authoritativeActor = await getAuthoritativeActor();
      if (authoritativeActor.actorRole !== 'admin') {
        setStatus({ type: 'error', message: 'Unauthorized: Only administrators can delete users.' });
        return;
      }

      // Secondary admin cannot delete another admin
      if (authoritativeActor.adminTier !== 'primary' && userToDelete.role === 'admin') {
        setStatus({ type: 'error', message: 'Secondary administrators cannot delete other administrators.' });
        return;
      }

      const stableRequestId = Math.random().toString(36).slice(2, 9);
      const opId = `OP_USER_DEL_${userToDelete.id}_${stableRequestId}`;
      const userRef = doc(db, 'users', userToDelete.id);

      // Snapshot authoritative pre-delete user data
      const preSnap = await getDoc(userRef);
      if (!preSnap.exists() || preSnap.data().status === 'DELETED' || preSnap.data().deleted === true) {
        setStatus({ type: 'success', message: 'User record is already deleted.' });
        setUserToDelete(null);
        setDeleteConfirmationText('');
        return;
      }
      const preData = preSnap.data();

      // PHASE 1: Mark user status as DELETION_PENDING and record initial audit event
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists()) return;
        const currentData = snap.data();
        if (currentData.status === 'DELETED' || currentData.deleted === true) return;

        tx.update(userRef, {
          status: 'DELETION_PENDING',
          deletionOperationId: opId,
          deletionRequestedBy: authoritativeActor.actorUid,
          deletionRequestedAt: serverTimestamp(),
          lastAttemptAt: serverTimestamp()
        });

        const reqAuditPayload = await buildAuthoritativeAuditPayload({
          category: 'security',
          actionType: 'USER_DELETION_REQUESTED',
          action: 'USER_DELETION_REQUESTED',
          targetType: 'user',
          targetId: userToDelete.id,
          studentId: userToDelete.id,
          studentName: preData.fullName || preData.email || 'User',
          beforeState: {
            id: userToDelete.id,
            email: preData.email || '',
            fullName: preData.fullName || '',
            role: preData.role || '',
            adminTier: preData.adminTier || null,
            status: preData.status || 'active'
          },
          afterState: {
            status: 'DELETION_PENDING',
            deletionOperationId: opId
          },
          previousValue: `Status: ${preData.status || 'active'} | User: ${preData.fullName || preData.email}`,
          newValue: 'Status: DELETION_PENDING (Phase 1 initiated)',
          reason: 'Administrator requested user account deletion',
          operationId: `${opId}_REQ`
        }, `${opId}_REQ`);

        tx.set(doc(db, 'audit_logs', `${opId}_REQ`), reqAuditPayload);
      });

      // PHASE 2: Delete Firebase Authentication account via backend API
      const idToken = await auth.currentUser?.getIdToken();
      let resData: any = {};
      let response: Response | null = null;
      let authErrorMsg: string | null = null;

      try {
        response = await fetch('/api/users/delete-auth', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
          },
          body: JSON.stringify({ uid: userToDelete.id })
        });
        const responseText = await response.text();
        try {
          resData = JSON.parse(responseText);
        } catch {
          resData = { error: responseText.slice(0, 150) || `HTTP ${response?.status}` };
        }
      } catch (fetchErr: any) {
        authErrorMsg = fetchErr.message || 'Auth endpoint unreachable';
      }

      // PHASE 3A: Firebase Auth Deletion FAILED
      if (authErrorMsg || !response || !response.ok || resData.error) {
        const finalErrorMsg = authErrorMsg || resData.error || `HTTP ${response?.status || 500}`;
        console.error("Auth deletion failed:", finalErrorMsg);

        // Transition user document to DELETION_FAILED
        try {
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(userRef);
            if (!snap.exists()) return;
            tx.update(userRef, {
              status: 'DELETION_FAILED',
              deletionError: finalErrorMsg,
              lastAttemptAt: serverTimestamp()
            });

            const failAuditPayload = await buildAuthoritativeAuditPayload({
              category: 'security',
              actionType: 'USER_AUTH_DELETE_FAILED',
              action: 'USER_AUTH_DELETE_FAILED',
              targetType: 'user',
              targetId: userToDelete.id,
              studentId: userToDelete.id,
              studentName: preData.fullName || preData.email || 'User',
              beforeState: { status: 'DELETION_PENDING' },
              afterState: { status: 'DELETION_FAILED', error: finalErrorMsg },
              previousValue: 'Status: DELETION_PENDING',
              newValue: `Status: DELETION_FAILED (${finalErrorMsg})`,
              reason: `Firebase Auth deletion failed: ${finalErrorMsg}`,
              operationId: `${opId}_FAIL`
            }, `${opId}_FAIL`);

            tx.set(doc(db, 'audit_logs', `${opId}_FAIL`), failAuditPayload);
          });
        } catch (dbErr) {
          console.warn("Could not record DELETION_FAILED state in Firestore:", dbErr);
        }

        setStatus({ 
          type: 'error', 
          message: `Deletion could not be completed. The account remains protected and is marked for retry (${finalErrorMsg}).` 
        });
        setUserToDelete(null);
        setDeleteConfirmationText('');
        return;
      }

      // PHASE 3B: Firebase Auth Deletion SUCCEEDED -> Finalize Soft-Deleted Tombstone
      await runTransaction(db, async (tx) => {
        const freshSnap = await tx.get(userRef);
        if (!freshSnap.exists()) return;

        // Controlled soft-deleted tombstone retaining minimal historical metadata
        tx.set(userRef, {
          id: userToDelete.id,
          fullName: preData.fullName || preData.name || 'Deleted User',
          email: preData.email || '',
          role: preData.role || '',
          class: preData.class || '',
          studentId: preData.studentId || preData.admissionNumber || '',
          status: 'DELETED',
          deleted: true,
          authDeleted: true,
          deletedAt: serverTimestamp(),
          deletedBy: authoritativeActor.actorUid,
          deletedByName: authoritativeActor.actorName,
          deletionOperationId: opId,
          reconciliationRequired: false,
          updatedAt: serverTimestamp()
        }, { merge: false });

        const auditPayload = await buildAuthoritativeAuditPayload({
          category: 'security',
          actionType: 'USER_DELETED',
          action: 'USER_DELETED',
          targetType: 'user',
          targetId: userToDelete.id,
          studentId: userToDelete.id,
          studentName: preData.fullName || preData.email || 'User',
          beforeState: {
            id: userToDelete.id,
            email: preData.email || '',
            fullName: preData.fullName || '',
            role: preData.role || '',
            adminTier: preData.adminTier || null,
            status: preData.status || 'active'
          },
          afterState: { 
            status: 'DELETED', 
            deleted: true, 
            authDeleted: true,
            deletionOperationId: opId 
          },
          previousValue: `User: ${preData.fullName || preData.email} | Role: ${preData.role} | Tier: ${preData.adminTier || 'none'}`,
          newValue: 'Account deleted from Firebase Auth and tombstoned in Firestore',
          reason: 'Administrator confirmed deletion of user account and profile',
          operationId: opId
        }, opId);

        tx.set(doc(db, 'audit_logs', opId), auditPayload);
      });

      setStatus({ type: 'success', message: 'User account and profile deleted successfully.' });
    } catch (error: any) {
      console.error("Failed to execute deletion state machine:", error);
      setStatus({ type: 'error', message: `Deletion failed: ${error.message || error}` });
    }
    setUserToDelete(null);
    setDeleteConfirmationText('');
    setTimeout(() => setStatus({ type: null, message: '' }), 6000);
  };

  const getFilteredUsers = () => {
    return usersList.filter(u => {
      // Exclude soft-deleted/tombstone users from the active roster
      if (u.status === 'DELETED' || u.deleted === true || u.status === 'AUTH_DELETED_PENDING_FINALIZATION') {
        return false;
      }

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        String(u.email || '').toLowerCase().includes(q) ||
        String(u.fullName || u.name || '').toLowerCase().includes(q) ||
        String(u.studentId || '').toLowerCase().includes(q) ||
        String(u.permanentStudentId || '').toLowerCase().includes(q) ||
        String(u.emisNumber || u.studentEmis || '').toLowerCase().includes(q) ||
        String(u.teacherId || '').toLowerCase().includes(q) ||
        String(u.adminId || '').toLowerCase().includes(q) ||
        String(u.staffId || '').toLowerCase().includes(q) ||
        String(u.phone || '').toLowerCase().includes(q) ||
        String(u.class || '').toLowerCase().includes(q) ||
        String(u.section || '').toLowerCase().includes(q) ||
        String(u.rollNo || u.rollNumber || '').toLowerCase().includes(q);
      
      const isPending = u.status === 'pending';
      let matchesRole = false;
      if (roleFilter === 'all') matchesRole = (u.role === 'teacher' || u.role === 'admin' || u.role === 'student') && !isPending;
      else if (roleFilter === 'pending') matchesRole = isPending;
      else matchesRole = u.role === roleFilter && !isPending;
      
      let matchesClass = true;
      if (roleFilter === 'student' && classFilter !== 'all') {
        matchesClass = u.class === classFilter;
      }
      
      return matchesSearch && matchesRole && matchesClass;
    });
  };

  const availableClasses = Array.from(new Set(usersList.filter(u => u.role === 'student' && u.class).map(u => u.class))).sort((a, b) => {
    const numA = parseInt(a as string);
    const numB = parseInt(b as string);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return String(a).localeCompare(String(b));
  });

  const toggleSelectAll = () => {
    const filteredIds = getFilteredUsers().map(u => u.id);
    if (selectedUsers.length === filteredIds.length && filteredIds.length > 0) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredIds);
    }
  };

  const toggleSelectUser = (id: string) => {
    setSelectedUsers(prev => 
      prev.includes(id) ? prev.filter(uid => uid !== id) : [...prev, id]
    );
  };
  
  const handleBulkApprove = async () => {
    if (!selectedUsers.length) return;
    try {
      const filteredSelected = usersList.filter(u => selectedUsers.includes(u.id));
      await Promise.all(filteredSelected.map(async (u) => {
        if (u.status === 'pending') {
          const updateFields: any = { status: 'active' };
          await updateDoc(doc(db, 'users', u.id), updateFields);
          if(u.role === 'student' && u.class) {
            await generateInitialFee(u.id, u.class, u.scholarshipStatus || 'Not Provided', Number(u.scholarshipAmount) || 0);
          }
        }
      }));
      setStatus({ type: 'success', message: 'Selected users approved.' });
      setSelectedUsers([]);
      setBulkActionOpen(false);
    } catch(err) {
      setStatus({ type: 'error', message: 'Failed to approve selected users.' });
    }
    setTimeout(() => setStatus({ type: null, message: '' }), 3000);
  };

  const handleBulkDelete = async () => {
    if (!selectedUsers.length) return;
    
    // Validate if secondary admin is trying to delete an admin, or trying to delete self
    const usersToDelete = usersList.filter(u => selectedUsers.includes(u.id));
    const isDeletingSelf = usersToDelete.some(u => u.id === auth.currentUser?.uid);
    if (isDeletingSelf) {
      setStatus({ type: 'error', message: 'You cannot delete your own account in bulk actions.' });
      setTimeout(() => setStatus({ type: null, message: '' }), 3000);
      return;
    }
    
    // Fail-closed admin check
    const authoritativeActor = await getAuthoritativeActor();
    if (authoritativeActor.actorRole !== 'admin') {
      setStatus({ type: 'error', message: 'Unauthorized: Only administrators can bulk delete users.' });
      return;
    }

    if (authoritativeActor.adminTier !== 'primary') {
      const isDeletingAdmin = usersToDelete.some(u => u.role === 'admin');
      if (isDeletingAdmin) {
        setStatus({ type: 'error', message: 'Secondary administrators cannot delete other administrators.' });
        setTimeout(() => setStatus({ type: null, message: '' }), 3000);
        return;
      }
    }

    if (!window.confirm(`Are you sure you want to delete ${selectedUsers.length} users?`)) return;
    try {
      // 1. Call backend to delete Firebase Authentication accounts in bulk first
      const idToken = await auth.currentUser?.getIdToken();
      let resData: any = {};
      let response: Response;
      try {
        response = await fetch('/api/users/delete-auth-bulk', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
          },
          body: JSON.stringify({ uids: selectedUsers })
        });
        const responseText = await response.text();
        try {
          resData = JSON.parse(responseText);
        } catch {
          resData = { error: responseText.slice(0, 150) || `HTTP ${response.status} ${response.statusText}` };
        }
      } catch (authErr: any) {
        setStatus({ type: 'error', message: `Bulk authentication deletion failed: Service unreachable (${authErr.message || authErr}). Deletion aborted.` });
        return;
      }

      if (!response.ok || resData.error) {
        setStatus({ type: 'error', message: `Bulk auth deletion failed: ${resData.error || `HTTP ${response.status}`}. Deletion aborted.` });
        return;
      }

      // 2. Controlled soft-deletion / tombstone of Firestore profiles for all selected users
      await Promise.all(selectedUsers.map(async (id) => {
        const target = usersList.find(u => u.id === id);
        return setDoc(doc(db, 'users', id), {
          id,
          fullName: target?.fullName || 'Deleted User',
          email: target?.email || '',
          role: target?.role || '',
          class: target?.class || '',
          studentId: target?.studentId || '',
          status: 'DELETED',
          deleted: true,
          authDeleted: true,
          deletedAt: serverTimestamp(),
          deletedBy: authoritativeActor.actorUid,
          deletedByName: authoritativeActor.actorName,
          updatedAt: serverTimestamp()
        }, { merge: false });
      }));

      setStatus({ type: 'success', message: `All ${selectedUsers.length} users and their login accounts deleted successfully.` });
      setSelectedUsers([]);
      setBulkActionOpen(false);
    } catch(err: any) {
      console.error("Bulk delete failed:", err);
      setStatus({ type: 'error', message: `Failed to complete bulk delete operation: ${err.message || err}` });
    }
    setTimeout(() => setStatus({ type: null, message: '' }), 5000);
  };

  const handleBulkSetRole = async (role: 'admin' | 'teacher' | 'student') => {
    if (!selectedUsers.length) return;
    
    if (role === 'admin' && !isPrimaryAdmin) {
      setStatus({ type: 'error', message: 'Only Primary Administrators can assign admin roles.' });
      setTimeout(() => setStatus({ type: null, message: '' }), 3000);
      return;
    }

    try {
      await Promise.all(selectedUsers.map(id => {
        if (role === 'admin') {
          return updateDoc(doc(db, 'users', id), { role, adminTier: 'secondary' });
        }
        return updateDoc(doc(db, 'users', id), { role, adminTier: null });
      }));
      setStatus({ type: 'success', message: `Selected users role changed to ${role}.` });
      setSelectedUsers([]);
      setBulkActionOpen(false);
    } catch(err) {
      setStatus({ type: 'error', message: 'Failed to update roles.' });
    }
    setTimeout(() => setStatus({ type: null, message: '' }), 3000);
  };

  const CLASS_ORDER = [
    'Play Group',
    'Nursery',
    'LKG',
    'UKG',
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
    'Passed Out'
  ];

  const handlePromoteStudent = async (userId: string, currentClass?: string) => {
    if (!currentClass) {
      setStatus({ type: 'error', message: 'Cannot promote: Student has no current class set.' });
      setTimeout(() => setStatus({ type: null, message: '' }), 3000);
      return;
    }
    
    const normalized = currentClass.trim();
    const idx = CLASS_ORDER.findIndex(c => c.toLowerCase() === normalized.toLowerCase());
    if (idx === -1) {
      setStatus({ type: 'error', message: `Unknown current class "${currentClass}"` });
      setTimeout(() => setStatus({ type: null, message: '' }), 3000);
      return;
    }

    if (idx === CLASS_ORDER.length - 1) {
      setStatus({ type: 'error', message: 'Student is already in the highest level (Passed Out).' });
      setTimeout(() => setStatus({ type: null, message: '' }), 3000);
      return;
    }

    const nextClass = CLASS_ORDER[idx + 1];
    const targetUser = usersList.find(u => u.id === userId);
    const currentBSYear = getCurrentBSAcademicYear(academicYear);
    const nextBSYear = currentBSYear + 1;
    const nextAcademicYearStr = `${nextBSYear}-${nextBSYear + 1} B.S.`;

    try {
      await updateDoc(doc(db, 'users', userId), { 
        class: nextClass,
        classAssignedYear: nextAcademicYearStr 
      });

      // Record immutable academic enrollment record for the new academic year
      await recordStudentEnrollment({
        studentUid: userId,
        studentId: targetUser?.permanentStudentId || targetUser?.studentId || `STU-${userId.substring(0, 6)}`,
        emisNumber: targetUser?.emisNumber || targetUser?.studentEmis || '',
        bsYear: nextBSYear,
        className: nextClass,
        sectionName: targetUser?.section || 'A',
        rollNumber: targetUser?.rollNumber || targetUser?.rollNo || '',
        status: 'promoted'
      });

      setStatus({ type: 'success', message: `Promoted student to Class ${nextClass} successfully!` });
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', message: `Failed to promote student. ${err.message}` });
    }
    setTimeout(() => setStatus({ type: null, message: '' }), 3000);
  };

  const handleBulkPromote = async () => {
    if (!selectedUsers.length) return;
    
    const selectedStudentsList = usersList.filter(u => selectedUsers.includes(u.id) && u.role === 'student');
    
    if (selectedStudentsList.length === 0) {
      setStatus({ type: 'error', message: 'Bulk Promotion only applies to student accounts.' });
      setTimeout(() => setStatus({ type: null, message: '' }), 3000);
      return;
    }

    let promotedCount = 0;
    let failedCount = 0;
    const currentBSYear = getCurrentBSAcademicYear(academicYear);
    const nextBSYear = currentBSYear + 1;
    const nextAcademicYearStr = `${nextBSYear}-${nextBSYear + 1} B.S.`;

    try {
      await Promise.all(selectedStudentsList.map(async (std) => {
        const currentClass = getStudentCurrentClass(std, academicYear);
        if (!currentClass) {
          failedCount++;
          return;
        }
        const normalized = currentClass.trim();
        const idx = CLASS_ORDER.findIndex(c => c.toLowerCase() === normalized.toLowerCase());
        if (idx !== -1 && idx < CLASS_ORDER.length - 1) {
          const nextClass = CLASS_ORDER[idx + 1];
          await updateDoc(doc(db, 'users', std.id), { 
            class: nextClass,
            classAssignedYear: nextAcademicYearStr 
          });

          await recordStudentEnrollment({
            studentUid: std.id,
            studentId: std.permanentStudentId || std.studentId || `STU-${std.id.substring(0, 6)}`,
            emisNumber: std.emisNumber || std.studentEmis || '',
            bsYear: nextBSYear,
            className: nextClass,
            sectionName: std.section || 'A',
            rollNumber: std.rollNumber || std.rollNo || '',
            status: 'promoted'
          });

          promotedCount++;
        } else {
          failedCount++;
        }
      }));

      setStatus({ 
        type: 'success', 
        message: `Bulk promotion completed. Promoted: ${promotedCount} students. Skipped/Failed: ${failedCount}.` 
      });
      setSelectedUsers([]);
      setBulkActionOpen(false);
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', message: 'Some student promotions failed.' });
    }
    setTimeout(() => setStatus({ type: null, message: '' }), 3000);
  };

  const stats = {
    total: usersList.filter(u => u.status !== 'pending').length,
    teachers: usersList.filter(u => u.role === 'teacher' && u.status !== 'pending').length,
    admins: usersList.filter(u => u.role === 'admin' && u.status !== 'pending').length,
    students: usersList.filter(u => u.role === 'student' && u.status !== 'pending').length,
    pending: usersList.filter(u => u.status === 'pending').length,
  };

  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [showTempPassword, setShowTempPassword] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    fullName: '',
    dob: '',
    dobBs: '',
    role: 'teacher' as const,
    phone: '',
    class: '',
    studentId: '',
    rollNumber: '',
    guardianName: '',
    address: '',
    section: '',
    scholarshipStatus: 'Not Provided',
    scholarshipAmount: 0,
    assignedClasses: [] as string[],
    assignedSubjects: [] as string[],
    emisNumber: '',
    fatherName: '',
    motherName: '',
    caste: '',
    disability: '',
    gender: '',
    hasTransportation: 'No',
    transportRoute: '',
    transportFee: 0,
    hasComputer: 'No',
    computerFee: 0
  });
  const [isCreating, setIsCreating] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Helper to auto-generate a strong password satisfying all criteria
  const generateStrongPassword = () => {
    const uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lowers = "abcdefghijkmnopqrstuvwxyz";
    const numbers = "23456789";
    const specials = "@#$%&*!";
    const allChars = uppers + lowers + numbers + specials;

    // Guaranteed required character types (2 of each for entropy)
    const pwdChars = [
      uppers[Math.floor(Math.random() * uppers.length)],
      uppers[Math.floor(Math.random() * uppers.length)],
      lowers[Math.floor(Math.random() * lowers.length)],
      lowers[Math.floor(Math.random() * lowers.length)],
      numbers[Math.floor(Math.random() * numbers.length)],
      numbers[Math.floor(Math.random() * numbers.length)],
      specials[Math.floor(Math.random() * specials.length)],
      specials[Math.floor(Math.random() * specials.length)],
      allChars[Math.floor(Math.random() * allChars.length)],
      allChars[Math.floor(Math.random() * allChars.length)],
      allChars[Math.floor(Math.random() * allChars.length)],
      allChars[Math.floor(Math.random() * allChars.length)],
    ];

    // Shuffle characters using Fisher-Yates
    for (let i = pwdChars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pwdChars[i], pwdChars[j]] = [pwdChars[j], pwdChars[i]];
    }

    return pwdChars.join('');
  };

  const handleAutoGeneratePassword = () => {
    const generated = generateStrongPassword();
    setNewUser(prev => ({ ...prev, password: generated }));
    setShowTempPassword(true);
  };

  const handleCopyPassword = async () => {
    if (!newUser.password) return;
    try {
      await navigator.clipboard.writeText(newUser.password);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    } catch (err) {
      console.error('Failed to copy password:', err);
    }
  };

  useEffect(() => {
    if (location.state && location.state.prefillAdmission) {
      const adm = location.state.prefillAdmission;
      let rawPhone = adm.contactNumber || '';
      rawPhone = rawPhone.replace(/^\+977\s?/, '').replace(/^\+977-/, '').trim();
      
      let mappedClass = adm.gradeAppliedFor || adm.grade || '';
      if (mappedClass.toLowerCase().startsWith('class ')) {
        mappedClass = mappedClass.substring(6).trim();
      }

      setNewUser({
        email: adm.email || '',
        password: '',
        fullName: adm.studentName || `${adm.studentFirstName || ''} ${adm.studentLastName || ''}`.trim(),
        dob: '',
        dobBs: adm.dateOfBirth || '',
        role: 'student' as const,
        phone: rawPhone,
        class: mappedClass,
        studentId: '',
        guardianName: adm.parentName || `${adm.parentFirstName || ''} ${adm.parentLastName || ''}`.trim(),
        address: adm.address || '',
        section: '',
        scholarshipStatus: adm.scholarshipStatus || 'Not Provided',
        scholarshipAmount: 0,
        assignedClasses: [],
        assignedSubjects: [] as string[],
        emisNumber: adm.emisNumber || '',
        fatherName: adm.fatherName || '',
        motherName: adm.motherName || '',
        caste: adm.caste || '',
        disability: adm.disability || '',
        gender: adm.gender || '',
        hasTransportation: 'No',
        transportRoute: '',
        transportFee: 0,
        hasComputer: 'No',
        computerFee: 0
      });
      setIsCreatingUser(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  const generateInitialFee = async (userId: string, studentClass: string, scholarshipStatus: string, scholarshipAmount: number) => {
    try {
      const settingsDoc = await getDoc(doc(db, 'settings', 'fee_structure'));
      if (!settingsDoc.exists()) return;
      const data = settingsDoc.data();
      const feeStruct = data.academic?.find((s: any) => s.className === studentClass);
      
      if (feeStruct) {
        let tuitionFee = feeStruct.tuition ? Number(feeStruct.tuition.replace(/[^0-9.]/g, '')) : 1000;
        let admissionFee = feeStruct.admission ? Number(feeStruct.admission.replace(/[^0-9.]/g, '')) : 0;
        
        if (scholarshipStatus === 'Provided' && scholarshipAmount) {
           tuitionFee = Math.max(0, tuitionFee - Number(scholarshipAmount));
        }

        // Generate Admission Fee
        if (admissionFee > 0) {
           await setDoc(doc(db, 'studentFees', `${userId}_Admission`), {
               studentId: userId,
               month: 'Admission Fee',
               totalFee: admissionFee,
               paidAmount: 0,
               dueAmount: admissionFee,
               status: 'due',
               createdAt: new Date().toISOString()
           });
        }
        
        // Generate current month's tuition fee (e.g. Baisakh as generic initial month, or current month mapping)
        // Taking a simplistic approach: We'll create exactly one "Initial Month" tuition fee OR Baisakh
        await setDoc(doc(db, 'studentFees', `${userId}_Baisakh`), {
            studentId: userId,
            month: 'Baisakh',
            totalFee: tuitionFee,
            paidAmount: 0,
            dueAmount: tuitionFee,
            status: 'due',
            createdAt: new Date().toISOString()
        });
      }
    } catch (e) {
      console.error("Failed to generate initial fee:", e);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.email)) {
      setStatus({ type: 'error', message: 'A valid Email is mandatory.' });
      return;
    }

    if (!newUser.password || newUser.password.length < 8 || !/[A-Z]/.test(newUser.password) || !/[a-z]/.test(newUser.password) || !/[0-9]/.test(newUser.password) || !/[!@#$%^&*(),.?":{}|<>]/.test(newUser.password)) {
       setStatus({ type: 'error', message: 'Password must be at least 8 characters long, and contain an uppercase letter, lowercase letter, a number, and a special character (such as @, !, #, or $).' });
       return;
    }

    if (!newUser.fullName) {
      setStatus({ type: 'error', message: 'Full Legal Name is mandatory.' });
      return;
    }

    // Validate that names do not contain numbers
    if (/\d/.test(newUser.fullName)) {
      setStatus({ type: 'error', message: 'Full Legal Name cannot contain numbers.' });
      return;
    }
    if (newUser.role === 'student') {
      if (newUser.fatherName && /\d/.test(newUser.fatherName)) {
        setStatus({ type: 'error', message: "Father's Name cannot contain numbers." });
        return;
      }
      if (newUser.motherName && /\d/.test(newUser.motherName)) {
        setStatus({ type: 'error', message: "Mother's Name cannot contain numbers." });
        return;
      }
      if (newUser.guardianName && /\d/.test(newUser.guardianName)) {
        setStatus({ type: 'error', message: "Guardian Name cannot contain numbers." });
        return;
      }
    }

    const rawPhone = newUser.phone?.trim() || '';
    if (!rawPhone || rawPhone.length !== 10 || !/^9\d{9}$/.test(rawPhone)) {
      setStatus({ type: 'error', message: 'Phone number is mandatory and must be a valid 10-digit Nepali mobile number starting with 9 (e.g. 98********, 97********).' });
      return;
    }

    if (newUser.role === 'student') {
      if (!newUser.class) {
        setStatus({ type: 'error', message: 'Assigned Class is mandatory for students.' });
        return;
      }
      if (!newUser.address?.trim()) {
        setStatus({ type: 'error', message: 'Address is a permanent field and is mandatory for students.' });
        return;
      }
      if (!newUser.guardianName?.trim()) {
        setStatus({ type: 'error', message: "Guardian / Parent's Name is mandatory." });
        return;
      }
      const cleanEmis = (newUser.emisNumber || '').trim();
      if (!cleanEmis) {
        setStatus({ type: 'error', message: 'EMIS Number is mandatory for new student registration.' });
        return;
      }
      // Assert EMIS uniqueness at authoritative database layer
      try {
        await assertEmisIsUnique(cleanEmis);
      } catch (emisErr: any) {
        setStatus({ type: 'error', message: emisErr.message || 'Duplicate EMIS Number detected.' });
        return;
      }
    }

    setIsCreating(true);
    try {
      // Concurrency-safe atomic generation of permanent identities
      let generatedStudentId = '';
      let generatedTeacherId = '';
      let generatedAdminId = '';

      if (newUser.role === 'student') {
        generatedStudentId = await generateNextStudentId();
      } else if (newUser.role === 'teacher') {
        generatedTeacherId = await generateNextTeacherId();
      } else if (newUser.role === 'admin') {
        generatedAdminId = await generateNextAdminId();
      }

      let emailToRegister = newUser.email;
      let userCredential;

      // Create user auth account without signing current admin out
      try {
        userCredential = await createUserWithEmailAndPassword(secondaryAuth, emailToRegister, newUser.password);
      } catch (authError: any) {
        if (authError.code === 'auth/email-already-in-use' || String(authError.message).includes('auth/email-already-in-use')) {
          // Check if there is an active profile document in the users database.
          const docSnap = await getDocs(query(collection(db, 'users'), where('email', '==', newUser.email)));
          if (docSnap.empty) {
            // Firestore profile does NOT exist! It's an orphan auth account! Let's register using sub-addressing.
            const parts = newUser.email.split('@');
            emailToRegister = `${parts[0]}+reg${Math.floor(Date.now() / 1000)}@${parts[1]}`;
            userCredential = await createUserWithEmailAndPassword(secondaryAuth, emailToRegister, newUser.password);
          } else {
            throw authError;
          }
        } else {
          throw authError;
        }
      }
      
      const docId = userCredential.user.uid;
      
      // Store in users collection
      const userProfilePayload: any = {
        email: newUser.email,
        authEmail: emailToRegister,
        fullName: newUser.fullName,
        role: newUser.role,
        active: true,
        createdAt: new Date().toISOString()
      };
      if (newUser.role === 'admin') {
        userProfilePayload.adminTier = 'secondary';
        userProfilePayload.adminId = generatedAdminId;
        userProfilePayload.permanentAdminId = generatedAdminId;
        userProfilePayload.staffId = generatedAdminId;
      }
      if (newUser.dob) userProfilePayload.dob = newUser.dob;
      if (newUser.dobBs) userProfilePayload.dobBs = newUser.dobBs;
      if (rawPhone) userProfilePayload.phone = `+977-${rawPhone}`;
      if (newUser.address) userProfilePayload.address = newUser.address;

      if (newUser.role === 'student') {
        const cleanEmis = (newUser.emisNumber || '').trim();
        userProfilePayload.permanentStudentId = generatedStudentId;
        userProfilePayload.studentId = generatedStudentId;
        userProfilePayload.emisNumber = cleanEmis;
        userProfilePayload.studentEmis = cleanEmis;
        userProfilePayload.class = newUser.class;
        userProfilePayload.section = newUser.section || 'A';
        userProfilePayload.rollNumber = newUser.rollNumber || '';
        userProfilePayload.rollNo = newUser.rollNumber || '';
        userProfilePayload.classAssignedYear = academicYear;
        userProfilePayload.linkedTeacherId = newUser.linkedTeacherId || '';
        userProfilePayload.guardianName = newUser.guardianName;
        if (newUser.fatherName) userProfilePayload.fatherName = newUser.fatherName;
        if (newUser.motherName) userProfilePayload.motherName = newUser.motherName;
        userProfilePayload.caste = newUser.caste;
        userProfilePayload.disability = newUser.disability;
        userProfilePayload.gender = newUser.gender;
        userProfilePayload.hasTransportation = newUser.hasTransportation || 'No';
        userProfilePayload.transportRoute = newUser.transportRoute || '';
        userProfilePayload.transportFee = newUser.hasTransportation === 'Yes' ? Number(newUser.transportFee || 0) : 0;
        userProfilePayload.hasComputer = newUser.hasComputer || 'No';
        userProfilePayload.computerFee = newUser.hasComputer === 'Yes' ? Number(newUser.computerFee || 0) : 0;
        userProfilePayload.scholarshipStatus = newUser.scholarshipStatus;
        if (newUser.scholarshipStatus === 'Provided') {
          userProfilePayload.scholarshipAmount = Number(newUser.scholarshipAmount) || 0;
        } else {
          userProfilePayload.scholarshipAmount = 0;
        }
      } else if (newUser.role === 'teacher') {
        userProfilePayload.permanentTeacherId = generatedTeacherId;
        userProfilePayload.teacherId = generatedTeacherId;
        userProfilePayload.staffId = generatedTeacherId;
        userProfilePayload.class = newUser.class;
        userProfilePayload.assignedClasses = newUser.assignedClasses || [];
        userProfilePayload.assignedSubjects = newUser.assignedSubjects || [];
      }

      // Use getFirestore with secondaryApp so the write is executed under the newly created user's own session
      const { getFirestore: getFirestoreSecondary } = await import('firebase/firestore');
      const secondaryDb = getFirestoreSecondary(secondaryApp, firebaseConfig.firestoreDatabaseId);
      await setDoc(doc(secondaryDb, 'users', docId), userProfilePayload);
      
      if (newUser.role === 'student') {
        // Concurrency-safe automatic Academic Enrollment record creation
        await recordStudentEnrollment({
          studentUid: docId,
          studentId: generatedStudentId,
          emisNumber: (newUser.emisNumber || '').trim(),
          bsYear: getCurrentBSAcademicYear(academicYear),
          className: newUser.class,
          sectionName: newUser.section || 'A',
          rollNumber: newUser.rollNumber || '',
          status: 'active'
        });

        if (newUser.class) {
          await generateInitialFee(docId, newUser.class, newUser.scholarshipStatus, Number(newUser.scholarshipAmount) || 0);
        }
      }
      
      // Immediately sign out the secondary auth so it can be used again cleanly
      await secondaryAuth.signOut();

      setStatus({ 
        type: 'success', 
        message: `${newUser.role.toUpperCase()} account created successfully with ID: ${generatedStudentId || generatedTeacherId || generatedAdminId}. They can now log in.` 
      });
      setIsCreatingUser(false);
      setNewUser({ 
        email: '', password: '', fullName: '', dob: '', dobBs: '', role: 'teacher', 
        phone: '', class: '', studentId: '', rollNumber: '', guardianName: '', address: '', 
        section: '', scholarshipStatus: 'Not Provided', scholarshipAmount: 0, 
        assignedClasses: [], assignedSubjects: [], emisNumber: '', fatherName: '', 
        motherName: '', caste: '', disability: '', gender: '', hasTransportation: 'No', 
        transportRoute: '', transportFee: 0, hasComputer: 'No', computerFee: 0 
      });
    } catch (error: any) {
      let errMsg = error.message || 'Failed to create user account.';
      if (error.code === 'auth/email-already-in-use' || String(error.message).includes('auth/email-already-in-use')) {
         errMsg = 'An account with this email address already exists. Please use a different email.';
         console.warn("Attempted to register an email that is already taken:", newUser.email);
      } else {
         console.error("User creation error:", error);
      }
      setStatus({ type: 'error', message: errMsg });
    } finally {
      setIsCreating(false);
    }
    setTimeout(() => setStatus({ type: null, message: '' }), 4000);
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto min-w-0">
      {/* Header & Stats */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-5 w-full min-w-0">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-black text-primary flex items-center gap-2.5 flex-wrap">
            <Shield className="w-8 h-8 text-orange-500 shrink-0" />
            <span>Administrative User Management</span>
          </h1>
          <p className="text-gray-500 font-medium text-sm sm:text-base mt-1">Control system access, roles, and administrative privileges.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3 w-full xl:w-auto shrink-0">
          <div className="bg-white px-3 py-2.5 sm:px-4 sm:py-3 rounded-2xl border border-gray-100 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] flex flex-col items-center justify-center cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all min-h-[76px]" onClick={() => { setRoleFilter('all'); setClassFilter('all'); }}>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-50 flex items-center justify-center mb-1">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
            </div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total</p>
            <p className="text-xl sm:text-2xl font-black text-gray-800 leading-none mt-1">{stats.total}</p>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-orange-50 px-3 py-2.5 sm:px-4 sm:py-3 rounded-2xl border border-red-100/50 shadow-sm flex flex-col items-center justify-center cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all min-h-[76px]" onClick={() => setRoleFilter('pending')}>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-red-100 flex items-center justify-center mb-1">
              <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />
            </div>
            <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Pending</p>
            <p className="text-xl sm:text-2xl font-black text-red-600 leading-none mt-1">{stats.pending}</p>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 px-3 py-2.5 sm:px-4 sm:py-3 rounded-2xl border border-blue-100/50 shadow-sm flex flex-col items-center justify-center cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all min-h-[76px]" onClick={() => setRoleFilter('teacher')}>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-100 flex items-center justify-center mb-1">
              <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" />
            </div>
            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Teachers</p>
            <p className="text-xl sm:text-2xl font-black text-blue-600 leading-none mt-1">{stats.teachers}</p>
          </div>
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 px-3 py-2.5 sm:px-4 sm:py-3 rounded-2xl border border-orange-100/50 shadow-sm flex flex-col items-center justify-center cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all min-h-[76px]" onClick={() => setRoleFilter('admin')}>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-orange-100 flex items-center justify-center mb-1">
              <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-500" />
            </div>
            <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Admins</p>
            <p className="text-xl sm:text-2xl font-black text-orange-600 leading-none mt-1">{stats.admins}</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 px-3 py-2.5 sm:px-4 sm:py-3 rounded-2xl border border-emerald-100/50 shadow-sm flex flex-col items-center justify-center cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all col-span-2 sm:col-span-1 min-h-[76px]" onClick={() => { setRoleFilter('student'); setClassFilter('all'); }}>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-100 flex items-center justify-center mb-1">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />
            </div>
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Students</p>
            <p className="text-xl sm:text-2xl font-black text-emerald-700 leading-none mt-1">{stats.students}</p>
          </div>
        </div>
      </div>

      {status.type && (
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[200] p-4 min-w-[300px] max-w-[90vw] rounded-xl flex items-center justify-between text-sm font-bold shadow-2xl animate-in slide-in-from-top duration-300 ${ status.type === 'success' ? 'bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]' : 'bg-red-50 text-red-700 border border-red-200' }`}>
          <div className="flex items-center gap-2">
            {status.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span className="break-words">{status.message}</span>
          </div>
          <button type="button" onClick={() => setStatus({type: null, message: ''})} className="ml-4 p-1 hover:bg-black/5 rounded shrink-0"><X className="w-4 h-4"/></button>
        </div>
      )}

      {/* Main Container */}
      <section className="bg-white rounded-2xl sm:rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/80 overflow-hidden w-full min-w-0">
        {/* Filters Bar */}
        <div className="p-4 sm:p-5 text-primary border-b border-gray-100 flex flex-col lg:flex-row gap-3.5 justify-between items-stretch lg:items-center bg-gray-50/50 w-full min-w-0">
          <div className="relative w-full lg:w-96 min-w-0">
            <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search by name, email, ID or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 sm:py-3 bg-white border border-gray-200/80 rounded-xl sm:rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm text-gray-700 font-medium placeholder:text-gray-400"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto relative z-10">
            {selectedUsers.length > 0 && (
              <div className="relative">
                <button 
                  onClick={() => setBulkActionOpen(!bulkActionOpen)}
                  className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm hover:bg-indigo-100 transition-all shadow-sm h-full"
                >
                  <span>Bulk Actions ({selectedUsers.length})</span>
                  <ChevronDown className="w-4 h-4" />
                </button>
                {bulkActionOpen && (
                  <div className="absolute right-0 sm:left-0 sm:right-auto mt-2 w-48 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-30">
                    <button onClick={handleBulkApprove} className="w-full text-left px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                       <CheckCircle2 className="w-4 h-4 text-green-500"/> Approve Selected
                    </button>
                    <div className="bg-gray-50 px-4 text-[10px] font-black uppercase text-gray-400 py-2 border-y border-gray-100">Change Role To</div>
                    <button onClick={() => handleBulkSetRole('admin')} className="w-full text-left px-4 py-2 text-sm font-bold text-orange-600 hover:bg-orange-50 border-b border-gray-50">Admin</button>
                    <button onClick={() => handleBulkSetRole('teacher')} className="w-full text-left px-4 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50 border-b border-gray-50">Teacher</button>
                    <button onClick={() => handleBulkSetRole('student')} className="w-full text-left px-4 py-2 text-sm font-bold text-emerald-600 hover:bg-emerald-50">Student</button>
                    <div className="w-full h-px bg-gray-100"></div>
                    <div className="bg-gray-50 px-4 text-[10px] font-black uppercase text-gray-400 py-2 border-y border-gray-100">Academic</div>
                    <button onClick={() => { if (confirm("Are you sure you want to promote all selected students?")) handleBulkPromote(); }} className="w-full text-left px-4 py-3 text-sm font-bold text-teal-600 hover:bg-teal-50 flex items-center gap-2 border-b border-gray-100">
                       <BadgeCheck className="w-4 h-4 text-teal-500" /> Promote Selected
                    </button>
                    <button onClick={handleBulkDelete} className="w-full text-left px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 flex items-center gap-2">
                       <Trash2 className="w-4 h-4" /> Delete Selected
                    </button>
                  </div>
                )}
              </div>
            )}
            <button 
              onClick={() => setIsCreatingUser(true)}
              className="flex items-center gap-2 bg-primary text-white px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm hover:bg-primary-dark transition-all shadow-md shadow-primary/20 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add New User</span>
            </button>
            <div className="flex items-center gap-2 bg-white px-3.5 py-2.5 sm:py-3 border border-gray-200/80 shadow-sm rounded-xl sm:rounded-2xl focus-within:ring-2 focus-within:ring-blue-500/20">
              <Filter className="w-4 h-4 text-gray-400 shrink-0" />
              <select 
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  if (e.target.value !== 'student') setClassFilter('all');
                }}
                className="text-xs sm:text-sm font-bold text-gray-700 focus:outline-none bg-transparent appearance-none pr-3 cursor-pointer"
              >
                <option value="all">All Roles</option>
                <option value="pending">Pending Approvals</option>
                <option value="admin">Administrators</option>
                <option value="teacher">Teachers</option>
                <option value="student">Students</option>
              </select>
            </div>
            {roleFilter === 'student' && (
              <div className="flex items-center gap-2 bg-white px-3.5 py-2.5 sm:py-3 border border-emerald-200 shadow-sm rounded-xl sm:rounded-2xl focus-within:ring-2 focus-within:ring-emerald-500/20 animate-in fade-in slide-in-from-right-4">
                <select 
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="text-xs sm:text-sm font-bold text-emerald-700 focus:outline-none bg-transparent appearance-none pr-3 cursor-pointer"
                >
                  <option value="all">All Classes</option>
                  {['Play Group', 'Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(cls => {
                    const count = usersList.filter(u => u.role === 'student' && u.class === cls && u.status !== 'pending').length;
                    return (
                      <option key={cls} value={cls}>Class {cls} ({count})</option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Student & Class Statistics Banner */}
        {roleFilter === 'student' && (
          <div className="mx-6 my-4 bg-emerald-50/60 rounded-2xl p-4 border border-emerald-100/80 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div>
                <h3 className="text-xs font-black text-emerald-950 uppercase tracking-widest flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-emerald-600" />
                  Class-wise Student Enrollment
                </h3>
                <p className="text-[10px] font-bold text-emerald-700/90 uppercase tracking-wider mt-0.5">
                  Total Students in School: <span className="font-black text-emerald-950">{stats.students}</span>
                </p>
              </div>
              <div>
                <span className="bg-emerald-600 text-white font-black text-[10px] uppercase tracking-wider px-3 py-1 rounded-xl shadow-sm">
                  {classFilter === 'all' 
                    ? `Showing: All Classes (${stats.students} students)` 
                    : `Showing: Class ${classFilter} (${usersList.filter(u => u.role === 'student' && u.class === classFilter && u.status !== 'pending').length} students)`}
                </span>
              </div>
            </div>
            
            {/* Interactive Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 gap-1.5">
              {['Play Group', 'Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(cls => {
                const count = usersList.filter(u => u.role === 'student' && u.class === cls && u.status !== 'pending').length;
                const isSelected = classFilter === cls;
                return (
                  <button
                    type="button"
                    key={cls}
                    onClick={() => setClassFilter(cls)}
                    className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-100' 
                        : 'bg-white hover:bg-emerald-50 border-slate-200/65 text-slate-800'
                    }`}
                  >
                    <span className="text-[9px] font-bold uppercase tracking-wider block opacity-75">Class {cls}</span>
                    <span className={`text-sm font-black ${isSelected ? 'text-white' : 'text-slate-900'}`}>{count}</span>
                  </button>
                );
              })}
              
              <button
                type="button"
                onClick={() => setClassFilter('all')}
                className={`col-span-3 sm:col-span-2 md:col-span-2 flex flex-col items-center justify-center py-1.5 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                  classFilter === 'all'
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-100'
                    : 'bg-white hover:bg-emerald-50 border-slate-200/65 text-slate-800'
                }`}
              >
                <span className="text-[9px] font-bold uppercase tracking-wider block opacity-75">All Classes</span>
                <span className="text-sm font-black">{stats.students}</span>
              </button>
            </div>
          </div>
        )}

        {/* Table / Cards Area */}
        <div className="w-full min-w-0">
          {isUsersLoading ? (
            <div className="w-full p-6">
               <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                 <div className="border-b border-gray-100 bg-gray-50 px-6 py-4 flex gap-4">
                    <div className="w-1/4 h-4 bg-gray-200 rounded animate-pulse"></div>
                    <div className="w-1/4 h-4 bg-gray-200 rounded animate-pulse"></div>
                    <div className="w-1/4 h-4 bg-gray-200 rounded animate-pulse"></div>
                 </div>
                 <div className="divide-y divide-gray-100">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="px-6 py-4 flex gap-4 items-center animate-pulse">
                         <div className="w-10 h-10 rounded-full bg-gray-200"></div>
                         <div className="flex-1 space-y-2">
                           <div className="w-1/3 h-4 bg-gray-200 rounded"></div>
                           <div className="w-1/4 h-3 bg-gray-100 rounded"></div>
                         </div>
                         <div className="w-24 h-6 bg-gray-200 rounded-full"></div>
                         <div className="w-20 h-8 bg-gray-200 rounded-lg"></div>
                      </div>
                    ))}
                 </div>
               </div>
            </div>
          ) : (
            <>
              {/* Mobile View: Clean Card Layout (<sm) */}
              <div className="block sm:hidden divide-y divide-gray-100 w-full">
                {getFilteredUsers().length === 0 ? (
                  <div className="p-8 text-center text-gray-400">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="font-bold text-sm">No users found matching your filters</p>
                  </div>
                ) : (
                  getFilteredUsers().map(user => (
                    <div key={user.id} className={`p-4 space-y-3 transition-colors ${selectedUsers.includes(user.id) ? 'bg-indigo-50/25' : 'bg-white'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer mt-0.5 shrink-0"
                            checked={selectedUsers.includes(user.id)}
                            onChange={() => toggleSelectUser(user.id)}
                          />
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm shadow-sm shrink-0 ${ user.role === 'admin' ? 'bg-orange-500' : user.role === 'teacher' ? 'bg-blue-500' : 'bg-emerald-500' }`}>
                            {user.fullName ? user.fullName.charAt(0) : user.email?.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-800 text-sm truncate flex items-center gap-1">
                              {user.fullName || 'New User'}
                              {user.role === 'admin' && <ShieldCheck className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
                            </p>
                            <p className="text-xs text-gray-400 truncate flex items-center gap-1"><Mail className="w-3 h-3 shrink-0" /> {user.email}</p>
                          </div>
                        </div>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider shrink-0 border ${ user.status === 'pending' ? 'bg-red-50 text-red-700 border-red-200' : user.role === 'admin' ? 'bg-orange-50 text-orange-700 border-orange-200' : user.role === 'teacher' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200' }`}>
                          {user.status === 'pending' ? 'PENDING' : user.role}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between text-xs text-gray-600 gap-2 bg-gray-50/80 p-2.5 rounded-xl">
                        <div>
                          <span className="text-gray-400 font-medium">
                            {user.role === 'student' ? 'Student ID' : user.role === 'admin' ? 'Admin ID' : 'Teacher ID'}:
                          </span>{' '}
                          <span className="text-blue-600 font-mono font-bold uppercase">
                            {user.role === 'student' 
                              ? (user.permanentStudentId || user.studentId || 'N/A')
                              : user.role === 'admin'
                              ? (user.permanentAdminId || user.adminId || user.staffId || 'N/A')
                              : (user.permanentTeacherId || user.teacherId || user.staffId || 'N/A')}
                          </span>
                          {user.role === 'student' && (user.emisNumber || user.studentEmis) && (
                            <span className="ml-2 text-[11px] text-gray-500 font-mono">
                              (EMIS: {user.emisNumber || user.studentEmis})
                            </span>
                          )}
                          {user.role === 'admin' && (
                            <span className="ml-2 text-[10px] font-black text-orange-600 uppercase">
                              [{user.adminTier === 'primary' ? '1° Admin' : '2° Admin'}]
                            </span>
                          )}
                        </div>
                        {user.phone && (
                          <div className="flex items-center gap-1 text-gray-500">
                            <Smartphone className="w-3 h-3" /> {user.phone}
                          </div>
                        )}
                        {user.class && (
                          <div className="text-emerald-700 font-bold">
                            Class {user.role === 'teacher' ? `${user.class} (Teacher)` : getStudentCurrentClass(user, academicYear)}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1">
                        <button 
                          onClick={() => setViewingUser(user)}
                          className="p-1.5 bg-gray-100 hover:bg-emerald-100 text-gray-600 hover:text-emerald-700 rounded-lg transition-all text-xs font-bold flex items-center gap-1 px-2.5"
                          title="View Profile"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </button>
                        <button 
                          onClick={() => setEditingUser(user)}
                          className="p-1.5 bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-700 rounded-lg transition-all text-xs font-bold flex items-center gap-1 px-2.5"
                          title="Edit Details"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Edit
                        </button>
                        {user.role === 'student' && user.status === 'active' && (
                          <button 
                            onClick={() => {
                              const activeClass = getStudentCurrentClass(user, academicYear);
                              if (confirm(`Are you sure you want to promote ${user.fullName || 'this student'} to the next class?`)) {
                                handlePromoteStudent(user.id, activeClass);
                              }
                            }}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-500 text-emerald-600 hover:text-white rounded-lg transition-all text-xs font-bold flex items-center gap-1 px-2.5 shadow-sm"
                          >
                            <BadgeCheck className="w-3.5 h-3.5" /> Promote
                          </button>
                        )}
                        {user.status === 'pending' ? (
                          <button
                            onClick={async () => {
                              try {
                                if (user.role === 'student') {
                                  const dupCheck = checkDuplicateStudentRoll(
                                    usersList.filter(u => u.id !== user.id && u.status === 'active'),
                                    user.class || '',
                                    user.studentId || user.rollNumber || user.rollNo || ''
                                  );
                                  if (dupCheck.isDuplicate) {
                                    setStatus({ type: 'error', message: `Cannot approve: ${dupCheck.message}` });
                                    setTimeout(() => setStatus({ type: null, message: '' }), 6000);
                                    return;
                                  }
                                }
                                await updateDoc(doc(db, 'users', user.id), { status: 'active' });
                                if (user.role === 'student' && user.class) {
                                  await generateInitialFee(user.id, user.class, user.scholarshipStatus || 'Not Provided', Number(user.scholarshipAmount) || 0);
                                }
                                setStatus({ type: 'success', message: 'User approved securely.' });
                              } catch (e) {
                                setStatus({ type: 'error', message: 'Failed to approve.' });
                              }
                            }}
                            className="px-3 py-1.5 bg-green-600 text-white font-bold text-xs rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                          >
                            Approve
                          </button>
                        ) : null}
                        { (user.role !== 'admin' || (isPrimaryAdmin && user.id !== auth.currentUser?.uid)) && (
                          <button 
                            onClick={() => setUserToDelete({ id: user.id, name: user.fullName || user.email || '', role: user.role, adminTier: user.adminTier })}
                            className="p-1.5 bg-red-50 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition-all shadow-sm"
                            title={user.role === 'student' ? "Delete Student Account" : "Delete Account"}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop / Tablet View: Table (hidden <sm, block sm+) */}
              <div className="hidden sm:block overflow-x-auto custom-scrollbar w-full">
                <table className="w-full text-left whitespace-nowrap min-w-[680px]">
                  <thead>
                  <tr className="text-primary text-[11px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 bg-gray-50/30">
                    <th className="p-4 px-6 w-12 text-center">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                        checked={selectedUsers.length > 0 && selectedUsers.length === getFilteredUsers().length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="p-4 px-6 uppercase tracking-wider">User Information</th>
                    <th className="p-4 px-6 uppercase tracking-wider">Contact & ID</th>
                    <th className="p-4 px-6 uppercase tracking-wider">System Role</th>
                    <th className="p-4 px-6 text-right uppercase tracking-wider">Management</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {getFilteredUsers().length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-20 text-center text-gray-400">
                         <Users className="w-12 h-12 mx-auto mb-4 opacity-10" />
                         <p className="font-bold">No users found matching your filters</p>
                      </td>
                    </tr>
                  ) : getFilteredUsers().map(user => (
                    <tr key={user.id} className={`hover:bg-blue-50/30 transition-colors group ${selectedUsers.includes(user.id) ? 'bg-indigo-50/20' : ''}`}>
                      <td className="p-4 px-6 w-12 text-center">
                         <input 
                           type="checkbox" 
                           className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                           checked={selectedUsers.includes(user.id)}
                           onChange={() => toggleSelectUser(user.id)}
                         />
                      </td>
                      <td className="p-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm shrink-0 ${ user.role === 'admin' ? 'bg-orange-500' : user.role === 'teacher' ? 'bg-blue-500' : 'bg-emerald-500' }`}>
                            {user.fullName ? user.fullName.charAt(0) : user.email?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-gray-800 text-[0.9rem] flex items-center gap-1">
                              {user.fullName || 'New User'}
                              {user.role === 'admin' && <ShieldCheck className="w-3 h-3 text-orange-500" />}
                            </p>
                            <p className="text-xs text-gray-400 flex items-center gap-1"><Mail className="w-3 h-3" /> {user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 px-6">
                        <div className="text-xs space-y-1">
                          <p className="font-bold text-gray-600 flex items-center gap-1"><Smartphone className="w-3 h-3 text-gray-400" /> {user.phone || '--'}</p>
                          <p className="text-gray-400">
                            {user.role === 'student' ? 'Student ID' : user.role === 'admin' ? 'Admin ID' : 'Teacher ID'}:{' '}
                            <span className="text-blue-600 font-mono font-bold uppercase">
                              {user.role === 'student' 
                                ? (user.permanentStudentId || user.studentId || 'N/A')
                                : user.role === 'admin'
                                ? (user.permanentAdminId || user.adminId || user.staffId || 'N/A')
                                : (user.permanentTeacherId || user.teacherId || user.staffId || 'N/A')}
                            </span>
                          </p>
                          {user.role === 'student' && (user.emisNumber || user.studentEmis) && (
                            <p className="text-[11px] text-gray-500 font-mono">
                              EMIS: <span className="font-bold text-gray-700">{user.emisNumber || user.studentEmis}</span>
                            </p>
                          )}
                          {user.role === 'admin' && (
                            <p className="text-[10px] font-black uppercase text-orange-600">
                              {user.adminTier === 'primary' ? '1° Primary Admin' : '2° Secondary Admin'}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="p-4 px-6">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider w-fit border ${ user.status === 'pending' ? 'bg-red-50 text-red-700 border-red-200' : user.role === 'admin' ? 'bg-orange-50 text-orange-700 border-orange-200' : user.role === 'teacher' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200' }`}>
                            {user.status === 'pending' ? 'PENDING APPROVAL' : user.role}
                          </span>
                          {user.class && (
                            <span className="text-[10px] text-gray-400 font-bold ml-1">
                              {user.role === 'teacher' 
                                ? `Class ${user.class} (Class Teacher)` 
                                : `Class ${getStudentCurrentClass(user, academicYear)}`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 px-6 text-right">
                         <div className="flex justify-end items-center gap-1.5 opacity-100 transition-opacity">
                            <button 
                              onClick={() => setViewingUser(user)}
                              className="p-1.5 bg-gray-100 hover:bg-emerald-100 text-gray-500 hover:text-emerald-700 rounded-lg transition-all"
                              title="View Profile"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            
                            <button 
                              onClick={() => setEditingUser(user)}
                              className="p-1.5 bg-gray-100 hover:bg-blue-100 text-gray-500 hover:text-blue-700 rounded-lg transition-all"
                              title="Edit Details"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            
                            {user.role === 'student' && user.status === 'active' && (
                              <button 
                                onClick={() => {
                                  const activeClass = getStudentCurrentClass(user, academicYear);
                                  if (confirm(`Are you sure you want to promote ${user.fullName || 'this student'} to the next class?`)) {
                                    handlePromoteStudent(user.id, activeClass);
                                  }
                                }}
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-500 text-emerald-600 hover:text-white rounded-lg transition-all ml-1 shadow-sm flex items-center gap-1 text-[10px] font-black uppercase tracking-wider"
                                title={`Promote to Next Class (Current: ${getStudentCurrentClass(user, academicYear)})`}
                              >
                                <BadgeCheck className="w-3.5 h-3.5 text-emerald-500" /> Promote
                              </button>
                            )}
                            
                            <div className="w-px h-4 bg-gray-200 mx-1"></div>
                            
                            {user.status === 'pending' ? (
                              <button
                                onClick={async () => {
                                  try {
                                    if (user.role === 'student') {
                                      const dupCheck = checkDuplicateStudentRoll(
                                        usersList.filter(u => u.id !== user.id && u.status === 'active'),
                                        user.class || '',
                                        user.studentId || user.rollNumber || user.rollNo || ''
                                      );
                                      if (dupCheck.isDuplicate) {
                                        setStatus({
                                          type: 'error',
                                          message: `Cannot approve: ${dupCheck.message}`
                                        });
                                        setTimeout(() => setStatus({ type: null, message: '' }), 6000);
                                        return;
                                      }
                                    }
                                    const updateFields: any = { status: 'active' };
                                    await updateDoc(doc(db, 'users', user.id), updateFields);
                                    if (user.role === 'student' && user.class) {
                                       await generateInitialFee(user.id, user.class, user.scholarshipStatus || 'Not Provided', Number(user.scholarshipAmount) || 0);
                                    }
                                    setStatus({ type: 'success', message: 'User approved securely.' });
                                  } catch (e) {
                                    setStatus({ type: 'error', message: 'Failed to approve.' });
                                  }
                                }}
                                className="px-3 py-1 bg-green-500 text-white font-bold text-xs rounded-lg hover:bg-green-600 transition-colors"
                              >
                                Approve
                              </button>
                            ) : user.role === 'admin' ? (
                               <div className="flex gap-1 items-center">
                                {isPrimaryAdmin && user.id !== auth.currentUser?.uid ? (
                                   <select 
                                     value={user.adminTier || 'primary'}
                                     onChange={(e) => setAdminTier(user.id, e.target.value as 'primary' | 'secondary')}
                                     className="px-2 py-1 bg-orange-50 text-orange-700 font-bold text-[10px] uppercase rounded-lg border border-orange-200 outline-none cursor-pointer"
                                   >
                                     <option value="primary">1° Admin</option>
                                     <option value="secondary">2° Admin</option>
                                   </select>
                                ) : (
                                   <div className="px-3 py-1 bg-orange-50 text-orange-600 font-bold text-[10px] uppercase tracking-wider rounded-lg border border-orange-100">
                                     {(user.adminTier || 'primary') === 'primary' ? '1° Admin' : '2° Admin'}
                                   </div>
                                )}
                              </div>
                            ) : null}

                            { (user.role !== 'admin' || (isPrimaryAdmin && user.id !== auth.currentUser?.uid)) && (
                              <button 
                                onClick={() => setUserToDelete({ id: user.id, name: user.fullName || user.email || '', role: user.role, adminTier: user.adminTier })}
                                className="p-1.5 bg-red-50 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition-all ml-1 shadow-sm"
                                title={user.role === 'student' ? "Delete Student Account" : "Delete Account"}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      </section>

      {/* View User Modal */}
      {viewingUser && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className={`p-6 relative text-white ${
              viewingUser.role === 'admin' 
                ? 'bg-gradient-to-r from-orange-600 to-amber-600' 
                : viewingUser.role === 'teacher' 
                ? 'bg-gradient-to-r from-blue-700 to-indigo-700' 
                : 'bg-gradient-to-r from-emerald-600 to-teal-600'
            }`}>
              <h2 className="text-xl font-black flex items-center gap-2">
                <User className="w-6 h-6" /> {viewingUser.role === 'student' ? 'Student Profile' : viewingUser.role === 'teacher' ? 'Teacher Profile' : 'Admin Profile'}
              </h2>
              <p className="text-white/80 text-xs font-medium mt-1">Detailed institutional identity record</p>
              <button 
                onClick={() => setViewingUser(null)} 
                className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5"/>
              </button>
            </div>

            <div className="p-6 md:p-8 space-y-6 overflow-y-auto max-h-[calc(90vh-160px)] custom-scrollbar">
              <div className="flex items-center gap-4 border-b border-gray-100 pb-6">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-sm shrink-0 ${ viewingUser.role === 'admin' ? 'bg-orange-500' : viewingUser.role === 'teacher' ? 'bg-blue-600' : 'bg-emerald-600' }`}>
                  {viewingUser.fullName ? viewingUser.fullName.charAt(0) : viewingUser.email?.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-bold text-gray-900 truncate">{viewingUser.fullName || 'No Name Provided'}</h3>
                  <div className="flex flex-wrap gap-2 items-center mt-1">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider border ${ viewingUser.role === 'admin' ? 'bg-orange-50 text-orange-700 border-orange-200' : viewingUser.role === 'teacher' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200' }`}>
                      {viewingUser.role}
                    </span>
                    {viewingUser.role === 'student' && viewingUser.class && (
                      <span className="text-[10px] bg-gray-100 text-gray-700 border border-gray-200 px-2.5 py-0.5 rounded-full font-bold">
                        Class {viewingUser.class} {viewingUser.section ? `• Sec ${viewingUser.section}` : ''} {viewingUser.rollNumber || viewingUser.rollNo ? `• Roll ${viewingUser.rollNumber || viewingUser.rollNo}` : ''}
                      </span>
                    )}
                    {viewingUser.role === 'teacher' && viewingUser.class && (
                      <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full font-bold">Class {viewingUser.class} (Class Teacher)</span>
                    )}
                    {viewingUser.role === 'admin' && (
                      <span className="text-[10px] bg-orange-100 text-orange-800 border border-orange-300 px-2.5 py-0.5 rounded-full font-bold uppercase">
                        {viewingUser.adminTier === 'primary' ? '1° Primary Admin' : '2° Secondary Admin'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Identity & Basic Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Email Address</p>
                  <p className="font-medium text-gray-800 flex items-center gap-2 text-sm truncate"><Mail className="w-4 h-4 text-gray-400 shrink-0"/> {viewingUser.email}</p>
                </div>
                
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Permanent Identifier</p>
                  <p className="font-mono font-bold text-blue-700 flex items-center gap-2 text-sm">
                    <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0"/> 
                    {viewingUser.role === 'student' 
                      ? (viewingUser.permanentStudentId || viewingUser.studentId || 'N/A')
                      : viewingUser.role === 'admin'
                      ? (viewingUser.permanentAdminId || viewingUser.adminId || viewingUser.staffId || 'ADM-000001')
                      : (viewingUser.permanentTeacherId || viewingUser.teacherId || viewingUser.staffId || 'N/A')}
                  </p>
                  {viewingUser.role === 'student' && (viewingUser.emisNumber || viewingUser.studentEmis) && (
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">
                      EMIS: <span className="font-bold text-gray-800">{viewingUser.emisNumber || viewingUser.studentEmis}</span>
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Contact Phone</p>
                  <p className="font-medium text-gray-800 flex items-center gap-2 text-sm"><Smartphone className="w-4 h-4 text-gray-400 shrink-0"/> {viewingUser.phone || 'N/A'}</p>
                </div>

                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Date of Birth</p>
                  <p className="font-medium text-gray-800 flex flex-col gap-0.5 text-xs">
                     <span className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0"/> {viewingUser.dob || 'Not Provided'} (A.D.)</span>
                     {viewingUser.dobBs && <span className="flex items-center gap-2 text-gray-600"><Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0"/> {viewingUser.dobBs} (B.S.)</span>}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Permanent Address</p>
                  <p className="font-medium text-gray-800 text-sm">{viewingUser.address || 'Not Provided'}</p>
                </div>

                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Gender</p>
                  <p className="font-medium text-gray-800 text-sm">{viewingUser.gender || 'Not Specified'}</p>
                </div>
              </div>

              {/* Student-Specific Section */}
              {viewingUser.role === 'student' && (
                <div className="pt-4 border-t border-gray-100 space-y-4">
                  <p className="text-xs font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                    🎓 Academic & Guardian Details
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-emerald-50/40 p-4 rounded-2xl border border-emerald-100/60">
                    <div>
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-0.5">Father's Name</p>
                      <p className="font-bold text-gray-800 text-xs">{viewingUser.fatherName || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-0.5">Mother / Guardian</p>
                      <p className="font-bold text-gray-800 text-xs">{viewingUser.motherName || viewingUser.guardianName || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-0.5">Guardian Phone</p>
                      <p className="font-bold text-gray-800 text-xs">{viewingUser.phone || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-0.5">Scholarship Status</p>
                      <p className="font-bold text-gray-800 text-xs">{viewingUser.scholarshipStatus === 'Provided' ? `Provided (NRs. ${viewingUser.scholarshipAmount || 0})` : 'None'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Teacher-Specific Section */}
              {viewingUser.role === 'teacher' && (
                <div className="pt-4 border-t border-gray-100 space-y-4">
                  <p className="text-xs font-black text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                    👨‍🏫 Faculty & Teaching Assignments
                  </p>
                  <div className="space-y-3 bg-blue-50/40 p-4 rounded-2xl border border-blue-100/60">
                    <div>
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Primary Class Teacher Of</p>
                      <p className="font-bold text-gray-800 text-xs">{viewingUser.class ? `Class ${viewingUser.class}` : 'None Assigned'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Assigned Classes</p>
                      <div className="flex flex-wrap gap-1">
                        {viewingUser.assignedClasses && viewingUser.assignedClasses.length > 0 ? (
                          viewingUser.assignedClasses.map((c, i) => (
                            <span key={i} className="bg-white border border-blue-200 text-blue-900 text-[10px] font-bold px-2 py-0.5 rounded-md">
                              {c.startsWith('Class') ? c : `Class ${c}`}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-500 font-medium">None assigned</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Assigned Subjects</p>
                      <div className="flex flex-wrap gap-1">
                        {viewingUser.assignedSubjects && viewingUser.assignedSubjects.length > 0 ? (
                          viewingUser.assignedSubjects.map((s, i) => (
                            <span key={i} className="bg-white border border-blue-200 text-blue-900 text-[10px] font-bold px-2 py-0.5 rounded-md">
                              {s}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-500 font-medium">None assigned</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Admin-Specific Section */}
              {viewingUser.role === 'admin' && (
                <div className="pt-4 border-t border-gray-100 space-y-3">
                  <p className="text-xs font-black text-orange-800 uppercase tracking-wider flex items-center gap-1.5">
                    🛡️ System Governance & Permissions
                  </p>
                  <div className="bg-orange-50/50 p-4 rounded-2xl border border-orange-100 space-y-2">
                    <p className="text-xs font-bold text-orange-900">
                      Tier: <span className="font-black uppercase">{viewingUser.adminTier === 'primary' ? '1° Primary Admin (Full Governance)' : '2° Secondary Admin (Operational)'}</span>
                    </p>
                    <p className="text-[11px] text-gray-600 leading-relaxed">
                      {viewingUser.adminTier === 'primary' 
                        ? 'Authorized for user approvals, governance role assignments, fee management, and system security controls.' 
                        : 'Authorized for routine administrative duties, user reviews, and academic records.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Action Buttons Toolbar */}
              <div className="pt-4 border-t border-gray-100 flex flex-wrap gap-2.5 items-center justify-end">
                {viewingUser.role === 'student' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = viewingUser.permanentStudentId || viewingUser.studentId || viewingUser.id;
                        setViewingUser(null);
                        navigate(`/result?studentId=${encodeURIComponent(targetId)}`);
                      }}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      📊 Result
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setViewingUser(null);
                        navigate(`/account-admin?tab=student_laser&studentId=${encodeURIComponent(viewingUser.id)}`);
                      }}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      💳 Fee Status
                    </button>
                  </>
                )}

                <button 
                  type="button"
                  onClick={() => {
                    const u = viewingUser;
                    setViewingUser(null);
                    setEditingUser(u);
                  }}
                  className="px-4 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-black text-xs rounded-xl border border-indigo-200 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit Profile
                </button>

                {(viewingUser.role !== 'admin' || (isPrimaryAdmin && viewingUser.id !== auth.currentUser?.uid)) && (
                  <button 
                    type="button"
                    onClick={() => {
                      const toDel = { id: viewingUser.id, name: viewingUser.fullName || viewingUser.email || '', role: viewingUser.role, adminTier: viewingUser.adminTier };
                      setViewingUser(null);
                      setUserToDelete(toDel);
                    }}
                    className="px-4 py-2.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white font-black text-xs rounded-xl border border-red-200 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Account
                  </button>
                )}

                <button 
                  type="button"
                  onClick={() => setViewingUser(null)} 
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-all ml-auto cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit User Modal */}
      {editingUser && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="bg-primary text-white p-6 relative shrink-0">
              <h2 className="text-xl font-black">Edit User Profile</h2>
              <p className="text-blue-200 text-xs font-medium">Updating identity of {editingUser.email}</p>
              <button 
                onClick={() => setEditingUser(null)} 
                className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5"/>
              </button>
            </div>

            {status.type && (
              <div className="px-8 pt-4 shrink-0">
                <div className={`p-4 rounded-xl flex items-start justify-between text-sm font-bold border animate-in slide-in-from-top-4 duration-200 ${ status.type === 'success' ? 'bg-[#ecfdf5] text-[#065f46] border-[#a7f3d0]' : 'bg-red-50 text-red-700 border-red-200' }`}>
                  <div className="flex items-start gap-2">
                    {status.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                    <span className="leading-tight">{status.message}</span>
                  </div>
                  <button type="button" onClick={() => setStatus({type: null, message: ''})} className="ml-4 p-1 hover:bg-black/5 rounded shrink-0"><X className="w-4 h-4"/></button>
                </div>
              </div>
            )}
            
            <form onSubmit={handleUpdateUser} className="flex-1 min-h-0 p-8 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Full Name</label>
                  <input 
                    type="text" 
                    value={editingUser.fullName || ''}
                    onChange={e => setEditingUser({...editingUser, fullName: e.target.value.replace(/\d/g, '')})}
                    className="w-full text-primary border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-bold text-gray-700 bg-white shadow-sm" 
                    placeholder="Enter full name"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block mb-1">Date of Birth</label>
                  <NepaliADDatePicker
                    dob={editingUser.dob || ''}
                    dobBs={editingUser.dobBs || ''}
                    onChange={(dates) => setEditingUser({ ...editingUser, dob: dates.dob, dobBs: dates.dobBs })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Phone Number</label>
                  <input 
                    type="text" 
                    value={editingUser.phone || ''}
                    onChange={e => setEditingUser({...editingUser, phone: e.target.value})}
                    className="w-full text-primary border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-bold text-gray-700 bg-white shadow-sm" 
                    placeholder="+977-..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">
                    Address {editingUser.role === 'student' ? '(Required)' : '(Optional)'}
                  </label>
                  <input 
                    type="text" 
                    required={editingUser.role === 'student'}
                    value={editingUser.address || ''}
                    onChange={e => setEditingUser({...editingUser, address: e.target.value})}
                    className="w-full text-primary border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-bold text-gray-700 bg-white shadow-sm" 
                    placeholder="Enter permanent address"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">System Role</label>
                  <select 
                    value={editingUser.role}
                    onChange={e => setEditingUser({...editingUser, role: e.target.value as any})}
                    className="w-full text-primary border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-bold text-gray-700 appearance-none bg-white shadow-sm disabled:opacity-75"
                    disabled={!isPrimaryAdmin && editingUser.role === 'admin'}
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin" disabled={!isPrimaryAdmin && editingUser.role !== 'admin'}>Administrator</option>
                  </select>
                  {(!isPrimaryAdmin && editingUser.role !== 'admin') && <p className="text-[9px] text-red-500 font-bold px-1 mt-1">Requires 1° Admin</p>}
                </div>
                {editingUser.role === 'admin' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1 flex items-center justify-between">
                      <span>Admin Tier</span>
                      <span className="text-orange-500">Security</span>
                    </label>
                    <select 
                      value={editingUser.adminTier || 'primary'}
                      onChange={e => setEditingUser({...editingUser, adminTier: e.target.value as any})}
                      disabled={!isPrimaryAdmin || editingUser.id === auth.currentUser?.uid}
                      className="w-full text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-orange-500 font-bold disabled:opacity-70 disabled:cursor-not-allowed appearance-none"
                    >
                      <option value="primary">Primary (1° Admin)</option>
                      <option value="secondary">Secondary (2° Admin)</option>
                    </select>
                  </div>
                )}
                {editingUser.role === 'teacher' && (
                  <div className="space-y-4 bg-blue-50/40 border border-blue-100/50 p-4 rounded-xl col-span-2">
                    <p className="text-xs font-black text-blue-800 uppercase tracking-wider flex items-center gap-1">
                      👨‍🏫 Teacher Assignment Settings
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Class Teacher of Single Class */}
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">Primary Class Teacher Of</label>
                        <select
                          value={editingUser.class || ''}
                          onChange={e => {
                            const val = e.target.value;
                            let updatedAssigned = [...(editingUser.assignedClasses || [])];
                            if (val && !updatedAssigned.includes(val)) {
                              updatedAssigned.push(val);
                            }
                            setEditingUser({ ...editingUser, class: val, assignedClasses: updatedAssigned });
                          }}
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-bold text-gray-700 bg-white shadow-sm"
                        >
                          <option value="">-- No Primary Class --</option>
                          {TEACHER_CLASSES.map(cls => (
                            <option key={cls} value={cls}>{cls === 'Play Group' || cls === 'Nursery' || cls === 'LKG' || cls === 'UKG' ? cls : `Class ${cls}`}</option>
                          ))}
                        </select>
                      </div>

                      {/* Assigned Classes Checkboxes */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">Assigned Classes</label>
                        <div className="grid grid-cols-2 gap-2 bg-white border border-gray-100 p-3 rounded-xl max-h-[160px] overflow-y-auto">
                          {TEACHER_CLASSES.map(cls => {
                            const isChecked = (editingUser.assignedClasses || []).includes(cls);
                            return (
                              <label key={cls} className="flex items-center gap-2 text-[11px] font-bold text-gray-700 cursor-pointer hover:text-blue-600">
                                <input 
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    let current = [...(editingUser.assignedClasses || [])];
                                    if (isChecked) {
                                      current = current.filter(c => c !== cls);
                                    } else {
                                      current.push(cls);
                                    }
                                    setEditingUser({ ...editingUser, assignedClasses: current });
                                  }}
                                  className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                                />
                                <span>{cls === 'Play Group' || cls === 'Nursery' || cls === 'LKG' || cls === 'UKG' ? cls : `Class ${cls}`}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Assigned Subjects Checkboxes */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">Assigned Subjects</label>
                        <div className="grid grid-cols-2 gap-2 bg-white border border-gray-100 p-3 rounded-xl max-h-[160px] overflow-y-auto">
                          {Array.from(new Set([...STANDARD_SUBJECTS, ...(editingUser.assignedSubjects || [])])).map(subj => {
                            const isChecked = (editingUser.assignedSubjects || []).includes(subj);
                            return (
                              <label key={subj} className="flex items-center gap-2 text-[11px] font-bold text-gray-700 cursor-pointer hover:text-blue-600">
                                <input 
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    let current = [...(editingUser.assignedSubjects || [])];
                                    if (isChecked) {
                                      current = current.filter(s => s !== subj);
                                    } else {
                                      current.push(subj);
                                    }
                                    setEditingUser({ ...editingUser, assignedSubjects: current });
                                  }}
                                  className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                                />
                                <span>{subj}</span>
                              </label>
                            );
                          })}
                        </div>
                        {/* Custom Subject Input */}
                        <div className="flex gap-2 mt-2">
                          <input 
                            type="text"
                            placeholder="Add Custom Subject"
                            id="edit-custom-subject-input"
                            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 font-bold"
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const val = (e.target as HTMLInputElement).value.trim();
                                if (val) {
                                  let current = [...(editingUser.assignedSubjects || [])];
                                  if (!current.includes(val)) {
                                    current.push(val);
                                  }
                                  setEditingUser({ ...editingUser, assignedSubjects: current });
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const inputEl = document.getElementById('edit-custom-subject-input') as HTMLInputElement;
                              const val = inputEl?.value.trim();
                              if (val) {
                                let current = [...(editingUser.assignedSubjects || [])];
                                if (!current.includes(val)) {
                                  current.push(val);
                                }
                                setEditingUser({ ...editingUser, assignedSubjects: current });
                                inputEl.value = '';
                              }
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-extrabold px-3 py-1.5 rounded-lg uppercase"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {editingUser.role === 'student' && (
                  <>

                    <div className="space-y-1 col-span-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">
                        Designated Class
                      </label>
                      <input 
                        type="text" 
                        value={editingUser.class || ''}
                        onChange={e => setEditingUser({...editingUser, class: e.target.value})}
                        className="w-full text-primary border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-bold text-gray-700 bg-white shadow-sm" 
                        placeholder="e.g. 10"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">
                  {editingUser.role === 'student' ? 'Permanent Student ID (Immutable)' : editingUser.role === 'admin' ? 'Permanent Admin ID (Immutable)' : 'Permanent Teacher ID (Immutable)'}
                </label>
                <input 
                  disabled
                  readOnly
                  type="text" 
                  value={editingUser.role === 'student' ? (editingUser.permanentStudentId || editingUser.studentId || '') : editingUser.role === 'admin' ? (editingUser.permanentAdminId || editingUser.adminId || editingUser.staffId || '') : (editingUser.permanentTeacherId || editingUser.teacherId || editingUser.staffId || '')}
                  className="w-full text-primary border border-gray-200 rounded-xl px-4 py-3 font-mono font-bold text-gray-500 bg-gray-100 cursor-not-allowed shadow-inner" 
                />
                <p className="text-[10px] font-bold text-gray-400 ml-1 mt-0.5">
                  System-generated permanent institutional identity. Cannot be altered or tampered with.
                </p>
              </div>

              {editingUser.role === 'student' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">
                    Class Roll Number
                  </label>
                  <input 
                    type="text" 
                    value={editingUser.rollNumber || editingUser.rollNo || ''}
                    onChange={e => setEditingUser({...editingUser, rollNumber: e.target.value, rollNo: e.target.value})}
                    className="w-full text-primary border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-mono font-bold text-blue-600 bg-white shadow-sm" 
                    placeholder="e.g. 1, 2, 24"
                  />
                  <p className="text-[10px] font-bold text-gray-400 ml-1 mt-0.5">
                    Class-specific roll number for this student.
                  </p>
                </div>
              )}

              {editingUser.role === 'student' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Transportation Facility</label>
                      <select 
                        value={editingUser.hasTransportation || 'No'}
                        onChange={e => {
                          const val = e.target.value;
                          setEditingUser({
                            ...editingUser, 
                            hasTransportation: val,
                            transportRoute: val === 'No' ? '' : (editingUser.transportRoute || 'Karjanha/Bastipur'),
                            transportFee: val === 'No' ? 0 : (editingUser.transportFee || 400)
                          });
                        }}
                        className="w-full text-primary border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-bold text-gray-700 appearance-none bg-white border-gray-200"
                      >
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </div>

                    {editingUser.hasTransportation === 'Yes' && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Transport Destination</label>
                        <select 
                          value={editingUser.transportRoute || 'Karjanha/Bastipur'}
                          onChange={e => {
                            const routeName = e.target.value;
                            let f = 400;
                            if (routeName === 'Betaha') f = 500;
                            else if (['Thalha', 'Simara/Mareba (South)', 'Simara/Mareba (North)', 'Manharwa'].includes(routeName)) f = 600;
                            setEditingUser({
                              ...editingUser,
                              transportRoute: routeName,
                              transportFee: f
                            });
                          }}
                          className="w-full text-primary border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-bold text-gray-700 appearance-none bg-white border-gray-200"
                        >
                          <option value="Karjanha/Bastipur">Karjanha/Bastipur (NRs. 400)</option>
                          <option value="Badahara Mirchaiya">Badahara Mirchaiya (NRs. 400)</option>
                          <option value="Bagaha/Bhulkiya">Bagaha/Bhulkiya (NRs. 400)</option>
                          <option value="Betaha">Betaha (NRs. 500)</option>
                          <option value="Thalha">Thalha (NRs. 600)</option>
                          <option value="Simara/Mareba (South)">Simara/Mareba (South) (NRs. 600)</option>
                          <option value="Simara/Mareba (North)">Simara/Mareba (North) (NRs. 600)</option>
                          <option value="Manharwa">Manharwa (NRs. 600)</option>
                        </select>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Section</label>
                      <input 
                        type="text" 
                        value={editingUser.section || ''}
                        onChange={e => setEditingUser({...editingUser, section: e.target.value})}
                        className="w-full text-primary border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-bold text-gray-700 border-gray-200" 
                        placeholder="e.g. A"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">
                        EMIS Number (Institutional Record)
                      </label>
                      <input 
                        type="text" 
                        value={editingUser.emisNumber || ''}
                        onChange={e => setEditingUser({...editingUser, emisNumber: e.target.value, studentEmis: e.target.value})}
                        className="w-full text-primary border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-mono font-bold text-gray-700 border-gray-200" 
                        placeholder="Enter EMIS number"
                      />
                      <p className="text-[10px] font-bold text-gray-400 ml-1 mt-0.5">
                        Correction of EMIS is verified for uniqueness. Duplicate EMIS numbers are strictly blocked.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Father's Name</label>
                      <input 
                        type="text" 
                        value={editingUser.fatherName || ''}
                        onChange={e => setEditingUser({...editingUser, fatherName: e.target.value.replace(/\d/g, '')})}
                        className="w-full text-primary border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-bold text-gray-700 border-gray-200" 
                        placeholder="Father's name"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Mother's Name</label>
                      <input 
                        type="text" 
                        value={editingUser.motherName || ''}
                        onChange={e => setEditingUser({...editingUser, motherName: e.target.value.replace(/\d/g, '')})}
                        className="w-full text-primary border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-bold text-gray-700 border-gray-200" 
                        placeholder="Mother's name"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Guardian Name</label>
                      <input 
                        type="text" 
                        value={editingUser.guardianName || ''}
                        onChange={e => setEditingUser({...editingUser, guardianName: e.target.value.replace(/\d/g, '')})}
                        className="w-full text-primary border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-bold text-gray-700 border-gray-200" 
                        placeholder="Guardian / Parent's name"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Gender</label>
                      <select 
                        value={editingUser.gender || ''}
                        onChange={e => setEditingUser({...editingUser, gender: e.target.value})}
                        className="w-full text-primary border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-bold text-gray-700 appearance-none bg-white border-gray-200"
                      >
                        <option value="">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>



                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Disability Status</label>
                      <select 
                        value={editingUser.disability || ''}
                        onChange={e => setEditingUser({...editingUser, disability: e.target.value})}
                        className="w-full text-primary border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-bold text-gray-700 appearance-none bg-white border-gray-200"
                      >
                        <option value="">Select Status</option>
                        <option value="No">No</option>
                        <option value="Visual">Visual</option>
                        <option value="Hearing">Hearing</option>
                        <option value="Physical">Physical</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Scholarship Status</label>
                      <select 
                        value={editingUser.scholarshipStatus || 'Not Provided'}
                        onChange={e => {
                          const statusVal = e.target.value;
                          setEditingUser({
                            ...editingUser,
                            scholarshipStatus: statusVal,
                            scholarshipAmount: statusVal === 'Not Provided' ? 0 : (editingUser.scholarshipAmount || 0)
                          });
                        }}
                        className="w-full text-primary border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-bold text-gray-700 appearance-none bg-white border-gray-200"
                      >
                        <option value="Not Provided">Not Provided</option>
                        <option value="Provided">Provided</option>
                      </select>
                    </div>

                    {editingUser.scholarshipStatus === 'Provided' && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Scholarship Amount (Monthly NRs.)</label>
                        <input 
                          type="number" 
                          value={editingUser.scholarshipAmount || 0}
                          onChange={e => setEditingUser({...editingUser, scholarshipAmount: Number(e.target.value)})}
                          className="w-full text-primary border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 font-bold text-gray-700 border-gray-200" 
                          placeholder="Amount in NRs."
                        />
                      </div>
                    )}


                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setEditingUser(null)} 
                  className="flex-1 py-4 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-2xl transition-colors"
                >
                  Discard Changes
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-4 text-sm font-black bg-primary text-white rounded-2xl shadow-lg hover:bg-primary-dark transition-transform active:scale-95"
                >
                  Save Profile Info
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Create User Modal */}
      {isCreatingUser && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl h-full md:max-h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="bg-primary text-white p-6 relative shrink-0">
              <button 
                onClick={() => setIsCreatingUser(false)} 
                className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/30 rounded-full transition-colors z-10"
              >
                <X className="w-5 h-5"/>
              </button>
              <h3 className="text-xl font-black pr-10">Register New System Profile</h3>
              <p className="text-white/70 text-xs font-bold uppercase tracking-widest mt-1">Initialize account for student or staff</p>
            </div>

            {status.type && (
              <div className="px-8 pt-4 shrink-0">
                <div className={`p-4 rounded-xl flex items-start justify-between text-sm font-bold border animate-in slide-in-from-top-4 duration-200 ${ status.type === 'success' ? 'bg-[#ecfdf5] text-[#065f46] border-[#a7f3d0]' : 'bg-red-50 text-red-700 border-red-200' }`}>
                  <div className="flex items-start gap-2">
                    {status.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                    <span className="leading-tight">{status.message}</span>
                  </div>
                  <button type="button" onClick={() => setStatus({type: null, message: ''})} className="ml-4 p-1 hover:bg-black/5 rounded shrink-0"><X className="w-4 h-4"/></button>
                </div>
              </div>
            )}
            
            <form onSubmit={handleCreateUser} className="flex-1 min-h-0 p-8 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Assigned Email (Required)</label>
                  <input 
                    required
                    type="email" 
                    value={newUser.email}
                    onChange={e => setNewUser({...newUser, email: e.target.value})}
                    placeholder="official@school.com"
                    className="w-full border-primary text-primary border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 transition-all border outline-none"
                  />
                </div>
                <div className="space-y-1 relative">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-[#0a3d62]" /> Temporary Password (Required)
                    </label>
                    <button
                      type="button"
                      onClick={handleAutoGeneratePassword}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-[11px] font-black tracking-wide transition-all border border-amber-300 shadow-xs cursor-pointer active:scale-95"
                      title="Click to automatically create a strong password meeting all criteria"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                      <span>Auto-Generate</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input 
                      required
                      type={showTempPassword ? "text" : "password"}
                      value={newUser.password}
                      onChange={e => setNewUser({...newUser, password: e.target.value})}
                      placeholder="Set initial password or click Auto-Generate"
                      className="w-full border-primary text-primary border-gray-100 rounded-2xl px-5 py-4 pr-24 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 transition-all border outline-none font-mono"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center gap-1.5">
                      {newUser.password && (
                        <button
                          type="button"
                          onClick={handleCopyPassword}
                          className="p-1.5 text-slate-400 hover:text-[#0a3d62] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Copy password to clipboard"
                        >
                          {copiedPassword ? (
                            <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                              <Check className="w-3.5 h-3.5" /> Copied
                            </span>
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      <button 
                        type="button" 
                        onClick={() => setShowTempPassword(!showTempPassword)} 
                        className="p-1.5 text-gray-400 hover:text-blue-600 focus:outline-none rounded-lg cursor-pointer"
                        title={showTempPassword ? "Hide password" : "Show password"}
                      >
                        {showTempPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                      </button>
                    </div>
                  </div>
                  
                  {/* Empty state hint */}
                  {!newUser.password && (
                    <div className="flex items-center justify-between bg-blue-50/70 border border-blue-100 rounded-xl p-2.5 mt-2 text-[11px] text-blue-800">
                      <div className="flex items-center gap-2 font-medium">
                        <KeyRound className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>Save time by clicking <strong>Auto-Generate</strong> above.</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAutoGeneratePassword}
                        className="text-xs font-bold text-blue-700 underline hover:text-blue-900 cursor-pointer"
                      >
                        Generate Now
                      </button>
                    </div>
                  )}
                  
                  {/* Real-time Dynamic Password Strength Checklist */}
                  {newUser.password && (
                    <div className="bg-slate-50 border border-slate-100/65 rounded-xl p-3.5 mt-2 space-y-2 text-[11px] font-sans">
                      <div className="flex items-center justify-between">
                        <p className="font-extrabold text-slate-500 text-[9px] uppercase tracking-wider">Required Password Strength Checklist:</p>
                        {newUser.password.length >= 8 &&
                          /[A-Z]/.test(newUser.password) &&
                          /[a-z]/.test(newUser.password) &&
                          /[0-9]/.test(newUser.password) &&
                          /[!@#$%^&*(),.?":{}|<>]/.test(newUser.password) && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" /> All Criteria Met
                            </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-1.5">
                        <div className="flex items-center gap-1.5">
                          {newUser.password.length >= 8 ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          )}
                          <span className={newUser.password.length >= 8 ? "text-emerald-700 font-bold" : "text-slate-400 font-medium"}>
                            At least 8 characters long
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {/[A-Z]/.test(newUser.password) ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          )}
                          <span className={/[A-Z]/.test(newUser.password) ? "text-emerald-700 font-bold" : "text-slate-400 font-medium"}>
                            At least one uppercase letter (A-Z)
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {/[a-z]/.test(newUser.password) ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          )}
                          <span className={/[a-z]/.test(newUser.password) ? "text-emerald-700 font-bold" : "text-slate-400 font-medium"}>
                            At least one lowercase letter (a-z)
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {/[0-9]/.test(newUser.password) ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          )}
                          <span className={/[0-9]/.test(newUser.password) ? "text-emerald-700 font-bold" : "text-slate-400 font-medium"}>
                            At least one digit (0-9)
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {/[!@#$%^&*(),.?":{}|<>]/.test(newUser.password) ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          )}
                          <span className={/[!@#$%^&*(),.?":{}|<>]/.test(newUser.password) ? "text-emerald-700 font-bold" : "text-slate-400 font-medium"}>
                            At least one special character (e.g. @, #, $, !, %)
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">System Role</label>
                  <select 
                    value={newUser.role}
                    onChange={e => setNewUser({...newUser, role: e.target.value as any})}
                    className="w-full border-primary text-primary border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 transition-all border outline-none disabled:opacity-75"
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin" disabled={!isPrimaryAdmin}>Administrator</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Legal Name (Required)</label>
                  <input 
                    required
                    type="text" 
                    value={newUser.fullName}
                    onChange={e => setNewUser({...newUser, fullName: e.target.value.replace(/\d/g, '')})}
                    placeholder="Enter full name"
                    className="w-full border-primary text-primary border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 transition-all border outline-none"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block mb-1">Date of Birth (B.S. Recommended)</label>
                  <NepaliADDatePicker
                    dob={newUser.dob || ''}
                    dobBs={newUser.dobBs || ''}
                    required={true}
                    onChange={(dates) => setNewUser({ ...newUser, dob: dates.dob, dobBs: dates.dobBs })}
                  />
                </div>
                {newUser.role === 'student' ? (
                  <div className="space-y-3">
                    <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-black text-blue-900 uppercase tracking-wider block">Permanent School ID</span>
                        <p className="text-xs font-mono font-bold text-blue-700">Auto-generated upon registration (STU-XXXXXX format)</p>
                      </div>
                      <BadgeCheck className="w-5 h-5 text-blue-600 shrink-0" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Class Roll Number (Optional)
                      </label>
                      <input 
                        type="text" 
                        value={newUser.rollNumber || ''}
                        onChange={e => setNewUser({ ...newUser, rollNumber: e.target.value, rollNo: e.target.value })}
                        placeholder="e.g. 1, 2, 24"
                        className="w-full border-primary text-primary border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 transition-all border outline-none font-mono"
                      />
                      <p className="text-[10px] font-bold text-gray-400 ml-1 mt-0.5">
                        Class-specific roll number for this student. Permanent Student ID will be automatically generated as STU-XXXXXX.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black text-blue-900 uppercase tracking-wider block">
                        {newUser.role === 'admin' ? 'Permanent Admin ID' : 'Permanent Teacher ID'}
                      </span>
                      <p className="text-xs font-mono font-bold text-blue-700">
                        {newUser.role === 'admin' ? 'Auto-generated upon registration (ADM-XXXXXX format)' : 'Auto-generated upon registration (TCH-XXXXXX format)'}
                      </p>
                    </div>
                    <BadgeCheck className="w-5 h-5 text-blue-600 shrink-0" />
                  </div>
                )}
                {newUser.role === 'student' && (
                  <>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Assigned Class (Required for Students)</label>
                      <input 
                        type="text" 
                        value={newUser.class}
                        onChange={e => setNewUser({...newUser, class: e.target.value})}
                        placeholder="e.g. 10"
                        className="w-full border-primary text-primary border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 transition-all border outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Section (Optional)</label>
                      <input 
                        type="text" 
                        value={newUser.section}
                        onChange={e => setNewUser({...newUser, section: e.target.value})}
                        placeholder="e.g. A"
                        className="w-full border-primary text-primary border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 transition-all border outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        EMIS Number (Required for Students) *
                      </label>
                      <input 
                        required
                        type="text" 
                        value={newUser.emisNumber}
                        onChange={e => setNewUser({...newUser, emisNumber: e.target.value})}
                        placeholder="Enter Government EMIS number"
                        className="w-full border-primary text-primary border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 transition-all border outline-none font-mono"
                      />
                      <p className="text-[10px] font-bold text-gray-400 ml-1 mt-0.5">
                        Mandatory government EMIS code. Must be strictly unique across all students.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Father's Name (Required)</label>
                      <input 
                        required
                        type="text" 
                        value={newUser.fatherName}
                        onChange={e => setNewUser({...newUser, fatherName: e.target.value.replace(/\d/g, '')})}
                        placeholder="Enter father's name"
                        className="w-full border-primary text-primary border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 transition-all border outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Mother's Name (Required)</label>
                      <input 
                        required
                        type="text" 
                        value={newUser.motherName}
                        onChange={e => setNewUser({...newUser, motherName: e.target.value.replace(/\d/g, '')})}
                        placeholder="Enter mother's name"
                        className="w-full border-primary text-primary border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 transition-all border outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Guardian / Parent's Name (Required)</label>
                      <input 
                        required
                        type="text" 
                        value={newUser.guardianName}
                        onChange={e => setNewUser({...newUser, guardianName: e.target.value.replace(/\d/g, '')})}
                        placeholder="Enter parent's name"
                        className="w-full border-primary text-primary border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 transition-all border outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-2">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Gender</label>
                            <select 
                            value={newUser.gender}
                            onChange={e => setNewUser({...newUser, gender: e.target.value})}
                            className="w-full border-primary text-primary border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 transition-all border outline-none"
                            >
                            <option value="">Select Gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Disability Status</label>
                            <select 
                            value={newUser.disability}
                            onChange={e => setNewUser({...newUser, disability: e.target.value})}
                            className="w-full border-primary text-primary border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 transition-all border outline-none"
                            >
                            <option value="">Select Status</option>
                            <option value="No">No</option>
                            <option value="Visual">Visual</option>
                            <option value="Hearing">Hearing</option>
                            <option value="Physical">Physical</option>
                            <option value="Other">Other</option>
                            </select>
                        </div>
                    </div>
                  </>
                )}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Address {newUser.role === 'student' ? '(Required)' : '(Optional)'}
                  </label>
                  <input 
                    type="text" 
                    required={newUser.role === 'student'}
                    value={newUser.address}
                    onChange={e => setNewUser({...newUser, address: e.target.value})}
                    placeholder="Enter permanent address"
                    className="w-full border-primary text-primary border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 transition-all border outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Contact Phone (Required)</label>
                  <div className="flex border-primary text-primary border-gray-100 border rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                    <div className="px-4 py-4 bg-gray-100 text-gray-500 font-bold text-sm border-r border-gray-200">
                      +977
                    </div>
                    <input 
                      required
                      type="text" 
                      value={newUser.phone}
                      onChange={e => setNewUser({...newUser, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                      placeholder="98********"
                      className="w-full bg-transparent px-5 py-4 text-sm font-bold text-gray-800 outline-none"
                    />
                  </div>
                </div>
              </div>

              {newUser.role === 'teacher' && (
                <div className="space-y-6 bg-blue-50/40 border border-blue-100/50 p-5 rounded-2xl md:col-span-2">
                  <p className="text-xs font-black text-blue-800 uppercase tracking-wider flex items-center gap-1">
                    👨‍🏫 Teacher Assignment Settings
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Class Teacher of Single Class */}
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">Primary Class Teacher Of</label>
                      <p className="text-[11px] text-gray-400 mb-2 pl-1">
                        Primary class teacher for report card formulation.
                      </p>
                      <select
                        value={newUser.class || ''}
                        onChange={e => {
                          const val = e.target.value;
                          let updatedAssigned = [...(newUser.assignedClasses || [])];
                          if (val && !updatedAssigned.includes(val)) {
                            updatedAssigned.push(val);
                          }
                          setNewUser({ ...newUser, class: val, assignedClasses: updatedAssigned });
                        }}
                        className="w-full border-primary text-primary border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 transition-all border outline-none appearance-none bg-white"
                      >
                        <option value="">-- No Primary Class --</option>
                        {TEACHER_CLASSES.map(cls => (
                          <option key={cls} value={cls}>{cls === 'Play Group' || cls === 'Nursery' || cls === 'LKG' || cls === 'UKG' ? cls : `Class ${cls}`}</option>
                        ))}
                      </select>
                    </div>

                    {/* Assigned Classes Multi-Select Checkboxes */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1 block">Assigned Classes</label>
                      <p className="text-[11px] text-gray-400 mb-2 pl-1">
                        Classes this teacher is authorized to grade/manage.
                      </p>
                      <div className="grid grid-cols-2 gap-2 bg-white border border-gray-100 p-4 rounded-2xl max-h-[200px] overflow-y-auto">
                        {TEACHER_CLASSES.map(cls => {
                          const isChecked = (newUser.assignedClasses || []).includes(cls);
                          return (
                            <label key={cls} className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer hover:text-blue-600">
                              <input 
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  let current = [...(newUser.assignedClasses || [])];
                                  if (isChecked) {
                                    current = current.filter(c => c !== cls);
                                  } else {
                                    current.push(cls);
                                  }
                                  setNewUser({ ...newUser, assignedClasses: current });
                                }}
                                className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                              />
                              <span>{cls === 'Play Group' || cls === 'Nursery' || cls === 'LKG' || cls === 'UKG' ? cls : `Class ${cls}`}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Assigned Subjects Multi-Select Checkboxes */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1 block">Assigned Subjects</label>
                      <p className="text-[11px] text-gray-400 mb-2 pl-1">
                        Subjects this teacher is authorized to grade.
                      </p>
                      <div className="grid grid-cols-2 gap-2 bg-white border border-gray-100 p-4 rounded-2xl max-h-[200px] overflow-y-auto">
                        {Array.from(new Set([...STANDARD_SUBJECTS, ...(newUser.assignedSubjects || [])])).map(subj => {
                          const isChecked = (newUser.assignedSubjects || []).includes(subj);
                          return (
                            <label key={subj} className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer hover:text-blue-600">
                              <input 
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  let current = [...(newUser.assignedSubjects || [])];
                                  if (isChecked) {
                                    current = current.filter(s => s !== subj);
                                  } else {
                                    current.push(subj);
                                  }
                                  setNewUser({ ...newUser, assignedSubjects: current });
                                }}
                                className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                              />
                              <span>{subj}</span>
                            </label>
                          );
                        })}
                      </div>
                      {/* Custom Subject Input */}
                      <div className="flex gap-2 mt-2">
                        <input 
                          type="text"
                          placeholder="Add Custom Subject"
                          id="create-custom-subject-input"
                          className="flex-1 text-xs border border-gray-100 rounded-2xl px-4 py-3 font-bold border-primary text-primary outline-none"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const val = (e.target as HTMLInputElement).value.trim();
                              if (val) {
                                let current = [...(newUser.assignedSubjects || [])];
                                if (!current.includes(val)) {
                                  current.push(val);
                                }
                                setNewUser({ ...newUser, assignedSubjects: current });
                                (e.target as HTMLInputElement).value = '';
                              }
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const inputEl = document.getElementById('create-custom-subject-input') as HTMLInputElement;
                            const val = inputEl?.value.trim();
                            if (val) {
                              let current = [...(newUser.assignedSubjects || [])];
                              if (!current.includes(val)) {
                                current.push(val);
                              }
                              setNewUser({ ...newUser, assignedSubjects: current });
                              inputEl.value = '';
                            }
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-extrabold px-4 py-3 rounded-2xl uppercase"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {newUser.role === 'student' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Transportation Facility</label>
                      <select 
                        value={newUser.hasTransportation || 'No'}
                        onChange={e => {
                          const val = e.target.value;
                          setNewUser({
                            ...newUser, 
                            hasTransportation: val,
                            transportRoute: val === 'No' ? '' : (newUser.transportRoute || 'Karjanha/Bastipur'),
                            transportFee: val === 'No' ? 0 : (newUser.transportFee || 400)
                          });
                        }}
                        className="w-full border-primary text-primary border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 transition-all border outline-none appearance-none"
                      >
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </div>

                    {newUser.hasTransportation === 'Yes' && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Transport Destination</label>
                        <select 
                          value={newUser.transportRoute || 'Karjanha/Bastipur'}
                          onChange={e => {
                            const routeName = e.target.value;
                            let f = 400;
                            if (routeName === 'Betaha') f = 500;
                            else if (['Thalha', 'Simara/Mareba (South)', 'Simara/Mareba (North)', 'Manharwa'].includes(routeName)) f = 600;
                            setNewUser({
                              ...newUser,
                              transportRoute: routeName,
                              transportFee: f
                            });
                          }}
                          className="w-full border-primary text-primary border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 transition-all border outline-none appearance-none"
                        >
                          <option value="Karjanha/Bastipur">Karjanha/Bastipur (NRs. 400)</option>
                          <option value="Badahara Mirchaiya">Badahara Mirchaiya (NRs. 400)</option>
                          <option value="Bagaha/Bhulkiya">Bagaha/Bhulkiya (NRs. 400)</option>
                          <option value="Betaha">Betaha (NRs. 500)</option>
                          <option value="Thalha">Thalha (NRs. 600)</option>
                          <option value="Simara/Mareba (South)">Simara/Mareba (South) (NRs. 600)</option>
                          <option value="Simara/Mareba (North)">Simara/Mareba (North) (NRs. 600)</option>
                          <option value="Manharwa">Manharwa (NRs. 600)</option>
                        </select>
                      </div>
                    )}


                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsCreatingUser(false)} 
                  className="flex-1 py-4 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-2xl transition-colors disabled:opacity-50"
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 py-4 text-sm font-black bg-primary text-white rounded-2xl shadow-lg hover:bg-primary-dark transition-transform active:scale-95 disabled:opacity-70"
                >
                  {isCreating ? 'Creating...' : 'Initialize User Account'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {/* Delete Confirmation Modal */}
      {userToDelete && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="bg-red-50 p-6 flex flex-col items-center border-b border-red-100">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-gray-900 text-center">Delete User Account</h3>
              <p className="text-sm font-medium text-gray-600 text-center mt-2">
                Are you sure you want to permanently delete the profile for <strong>{userToDelete.name}</strong>?
              </p>
            </div>
            <div className="p-6 space-y-4">
              {userToDelete.role === 'student' && (
                <div className="bg-amber-50 p-4 rounded-xl text-xs font-bold text-amber-800 border border-amber-100/70">
                  ⚠️ Note: Deleting a student user will remove their login and system access profile. Active ledger records (such as remit bills or results) will remain in place to maintain academic & audit trail consistency.
                </div>
              )}
              <div className="bg-red-50/50 p-4 rounded-xl text-xs font-bold text-red-800 text-center border border-red-100 relative">
                 <Lock className="w-4 h-4 text-red-400 absolute top-4 left-4" />
                 <span className="ml-4">To confirm deletion, type <strong>DELETE</strong> below.</span>
              </div>
              <input
                type="text"
                placeholder="Type DELETE here"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-center font-black tracking-widest text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/20 uppercase placeholder:text-gray-300 placeholder:font-normal placeholder:tracking-normal placeholder:text-sm"
              />
            </div>
            <div className="p-6 pt-0 flex flex-col sm:flex-row gap-3">
              <button 
                onClick={() => {
                  setUserToDelete(null);
                  setDeleteConfirmationText('');
                }}
                className="flex-1 py-3 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteUser}
                disabled={deleteConfirmationText !== 'DELETE'}
                className="flex-1 py-3 text-sm font-black text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors shadow-sm shadow-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete Profile
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
