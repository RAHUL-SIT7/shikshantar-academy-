import React, { useState, useEffect, useRef } from 'react';
import { Camera, Edit2, Lock, FileText, CheckCircle2, User, GraduationCap, Calendar, CreditCard, LayoutDashboard, Flag, AlertCircle, FileDown, Check, X, Bell, Eye, EyeOff, BookOpen, Briefcase, Award, MonitorSmartphone, Activity, LogOut, ChevronRight } from 'lucide-react';
import { auth, db } from '../firebase';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigate, Link } from 'react-router-dom';
import { formatRemitBillItems } from '../lib/remitBillUtils';
import AdminProfileView from './AdminProfileView';

function formatTimeAgo(isoString?: string): string {
  if (!isoString) return 'Just now';
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} min${diffMin > 1 ? 's' : ''} ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } catch {
    return 'Recently';
  }
}

function formatActivityDate(isoString?: string): string {
  if (!isoString) return 'Recent';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }) + ', ' + d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return isoString;
  }
}

export default function Profile() {
  const [userRole, setUserRole] = useState<string>(localStorage.getItem('userRole') || 'student');
  
  if (userRole === 'admin') {
    return <AdminProfileView />;
  }

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successToast, setSuccessToast] = useState('');
  
  // User data state
  const [avatarUrl, setAvatarUrl] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [gender, setGender] = useState('Male');
  
  // Academic Data (Student-specific)
  const [studentId, setStudentId] = useState('');
  const [emisNumber, setEmisNumber] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [section, setSection] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');

  // Teaching / Professional Data (Teacher-specific)
  const [teacherId, setTeacherId] = useState('');
  const [designation, setDesignation] = useState('Teacher');
  const [department, setDepartment] = useState('Academics');
  const [qualification, setQualification] = useState('');
  const [primaryClassTeacher, setPrimaryClassTeacher] = useState('');
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);
  const [assignedSubjects, setAssignedSubjects] = useState<string[]>([]);
  const [joiningDate, setJoiningDate] = useState('');

  const [isEditingPersonal, setIsEditingPersonal] = useState(false);

  // Security state
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [passwordLastChanged, setPasswordLastChanged] = useState('Active');
  const [studentBills, setStudentBills] = useState<any[]>([]);

  useEffect(() => {
    const fetchStudentBills = async () => {
      if (studentId && userRole === 'student') {
        try {
          const q = query(collection(db, 'remitBills'), where('studentId', '==', studentId));
          const snap = await getDocs(q);
          const bills = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setStudentBills(bills);
        } catch (e) {
          console.warn("Could not fetch student bills:", e);
        }
      }
    };
    if (studentId && userRole === 'student') {
      fetchStudentBills();
    }
  }, [studentId, userRole]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserData = async () => {
      if (auth.currentUser) {
        try {
          setEmail(auth.currentUser.email || '');
          const docRef = doc(db, 'users', auth.currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            const childData = data.children?.[0] || {};
            
            const resolvedRole = data.role || localStorage.getItem('userRole') || 'student';
            setUserRole(resolvedRole);

            setFullName(data.fullName || data.name || childData.name || auth.currentUser.displayName || (resolvedRole === 'teacher' ? 'Faculty Member' : 'Student'));
            setPhone(data.phone || childData.phone || '');
            setDob(data.dob || childData.dob || '');
            setAddress(data.address || childData.address || '');
            setGender(data.gender || childData.gender || 'Male');
            setAvatarUrl(data.avatarUrl || '');
            
            if (resolvedRole === 'teacher') {
              // Teacher specific mapping
              setTeacherId(data.permanentTeacherId || data.teacherId || data.staffId || data.employeeId || data.id || `T-${auth.currentUser.uid.slice(0, 5).toUpperCase()}`);
              setDesignation(data.designation || 'Teacher / Faculty');
              setDepartment(data.department || 'Academics');
              setQualification(data.qualification || data.degree || '');
              
              // Class Teacher assignment mapping
              const primaryClass = data.primaryClassTeacher || data.classTeacherOf || data.classTeacherFor || (data.class ? `Class ${data.class}` : '');
              setPrimaryClassTeacher(primaryClass);

              const classes = data.assignedClasses || data.teacherClasses || (data.class ? [`Class ${data.class}`] : []);
              setAssignedClasses(Array.isArray(classes) ? classes : [classes]);
              
              const subjects = data.assignedSubjects || data.teacherSubjects || data.subjects || ['General Subjects'];
              setAssignedSubjects(Array.isArray(subjects) ? subjects : [subjects]);
              
              setJoiningDate(data.joiningDate || data.admissionDate || (data.createdAt ? new Date(data.createdAt).toLocaleDateString() : '1 Shrawan 2080 B.S.'));
            } else {
              // Student specific mapping
              setStudentId(data.permanentStudentId || data.studentId || childData.studentId || data.admissionNumber || '');
              setEmisNumber(data.emisNumber || data.studentEmis || childData.emisNumber || '');
              setStudentClass(data.class || childData.studentClass || data.studentClass || '');
              setSection(data.section || childData.section || 'A');
              setRollNo(data.rollNo || data.rollNumber || childData.rollNumber || childData.rollNo || '');
              setGuardianName(data.guardianName || childData.fatherName || data.fatherName || '');
              setGuardianPhone(data.guardianPhone || childData.phone || data.parentPhone || '');
              setJoiningDate(data.admissionDate || (data.createdAt ? new Date(data.createdAt).toLocaleDateString() : '1 Shrawan 2080 B.S.'));
            }

            if (data.passwordUpdatedAt) {
              const d = new Date(data.passwordUpdatedAt);
              const diff = Math.floor((new Date().getTime() - d.getTime()) / (1000 * 3600 * 24));
              setPasswordLastChanged(diff === 0 ? 'Today' : `${diff} days ago`);
            } else {
              setPasswordLastChanged('Active');
            }
          }
        } catch (e) {
          console.warn("Could not fetch profile details:", e);
        }
      }
      setLoading(false);
    };
    fetchUserData();
  }, []);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
    
    const objectUrl = URL.createObjectURL(file);
    setAvatarUrl(objectUrl);

    try {
      const storage = getStorage();
      const storageRef = ref(storage, `avatars/${auth.currentUser.uid}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      setAvatarUrl(downloadURL);
      
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, { avatarUrl: downloadURL });
      showToast('Profile photo updated successfully');
    } catch (err: any) {
      console.error("Error uploading photo", err);
      showToast('Error uploading photo');
    }
  };

  const handlePhotoDelete = async () => {
    if (!auth.currentUser) return;
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, { avatarUrl: null });
      setAvatarUrl('');
      showToast('Profile photo removed successfully');
    } catch (err: any) {
      console.error("Error removing photo", err);
      showToast('Error removing photo');
    }
  };

  const handleSavePhone = async () => {
    if (!auth.currentUser) return;
    setSaving(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, { phone });
      setIsEditingPersonal(false);
      showToast('Phone number updated successfully');
    } catch (err: any) {
      console.error("Error saving phone", err);
      if (err.message?.includes('permissions')) {
         showToast('Error: Missing or insufficient permissions.');
      }
    } finally {
      setSaving(false);
    }
  };

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(''), 3000);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('No authenticated user found');
      if (!user.email) throw new Error('User email not found');
      if (!currentPassword) throw new Error('Current password is required');
      if (!newPassword) throw new Error('New password cannot be empty');
      if (newPassword !== confirmPassword) throw new Error('New passwords do not match');
      
      if (newPassword.length < 8) throw new Error('New password must be at least 8 characters');
      if (!/[0-9]/.test(newPassword)) throw new Error('New password must contain at least one number');
      if (!/[A-Z]/.test(newPassword)) throw new Error('New password must contain at least one uppercase letter');
      if (!/[a-z]/.test(newPassword)) throw new Error('New password must contain at least one lowercase letter');

      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      try {
        await reauthenticateWithCredential(user, credential);
      } catch {
        throw new Error('Current password does not match.');
      }

      await updatePassword(user, newPassword);
      
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { passwordUpdatedAt: new Date().toISOString() });
      setPasswordLastChanged('Today');
      
      showToast('✓ Password changed successfully!');
      setShowPasswordSection(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
    } catch (err: any) {
      setPwdError(err.message || 'Failed to update password.');
    } finally {
      setPwdLoading(false);
    }
  };

  const getInitials = (nameStr: string) => {
    if (!nameStr) return 'U';
    const parts = nameStr.split(' ').filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const evalPasswordStrength = (pwd: string) => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) score++;
    
    if (score <= 1) return { label: 'Weak', color: 'text-orange-500' };
    if (score === 2) return { label: 'Fair', color: 'text-blue-500' };
    return { label: 'Strong', color: 'text-emerald-500' };
  };

  const strength = evalPasswordStrength(newPassword);

  if (loading) {
    return <div className="p-8 text-center text-gray-500 font-bold animate-pulse">Loading Profile...</div>;
  }

  const isTeacher = userRole === 'teacher';

  return (
    <div className="max-w-[1200px] mx-auto pb-12 animate-in fade-in duration-500 relative bg-[#FAFAFA]">
      
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 font-bold animate-in slide-in-from-top-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          {successToast}
        </div>
      )}

      {/* HERO BANNER CARD */}
      <div className={`bg-gradient-to-r ${isTeacher ? 'from-slate-800 via-indigo-900 to-blue-900' : 'from-indigo-600 to-blue-600'} rounded-2xl p-6 md:p-8 shadow-lg flex flex-col md:flex-row items-center md:items-start gap-6 relative overflow-hidden mb-6 text-center md:text-left text-white`}>
         {/* Background decoration */}
         <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
         <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-indigo-300/20 rounded-full blur-3xl mb-[-100px] pointer-events-none"></div>

         {/* Avatar & Upload */}
         <div className="flex flex-col items-center gap-3 relative z-10 shrink-0">
           <div className="w-[100px] h-[100px] rounded-full border-4 border-white bg-indigo-700 shadow-xl overflow-hidden flex items-center justify-center relative group">
              {avatarUrl ? (
                <img src={avatarUrl} alt={fullName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-black text-white">{getInitials(fullName)}</span>
              )}
           </div>
           <input type="file" ref={fileInputRef} className="hidden" accept=".jpg,.png,.webp" onChange={handlePhotoUpload} />
           <div className="flex gap-2 items-center justify-center">
               <button onClick={() => fileInputRef.current?.click()} className="bg-white text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full shadow-md border border-gray-100 hover:bg-gray-50 transition-colors flex items-center gap-1.5 cursor-pointer">
                  <Camera className="w-3.5 h-3.5" />
                  {avatarUrl ? 'Change' : 'Upload Photo'}
               </button>
               {avatarUrl && (
                  <button onClick={handlePhotoDelete} className="bg-white text-red-500 text-xs font-bold w-7 h-7 flex justify-center items-center rounded-full shadow-md border border-gray-100 hover:bg-red-50 transition-colors cursor-pointer" title="Remove Photo">
                      <X className="w-3 h-3" />
                  </button>
               )}
           </div>
         </div>

         {/* Hero Info */}
         <div className="flex-1 relative z-10 w-full">
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-2">{fullName}</h1>
            
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-4">
              {isTeacher ? (
                <>
                  <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full border border-white/30 backdrop-blur-sm flex items-center gap-1">
                    <GraduationCap className="w-3.5 h-3.5" /> Faculty / Teacher
                  </span>
                  {teacherId && (
                    <span className="bg-indigo-700/60 text-indigo-100 text-xs font-bold px-3 py-1 rounded-full">
                      Staff ID: {teacherId}
                    </span>
                  )}
                  {primaryClassTeacher && (
                    <span className="bg-emerald-600/60 text-emerald-100 text-xs font-bold px-3 py-1 rounded-full border border-emerald-400/30">
                      Class Teacher: {primaryClassTeacher}
                    </span>
                  )}
                  <span className="bg-indigo-700/60 text-indigo-100 text-xs font-bold px-3 py-1 rounded-full hidden sm:inline-flex">
                    Academic Year: 2083-2084 B.S.
                  </span>
                </>
              ) : (
                <>
                  {studentClass && (
                    <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full border border-white/30 backdrop-blur-sm">
                      Class {studentClass} {rollNo ? `| Roll No: ${rollNo}` : ''}
                    </span>
                  )}
                  {studentId && (
                    <span className="bg-indigo-700/50 text-indigo-100 text-xs font-bold px-3 py-1 rounded-full font-mono">
                      Student ID: {studentId}
                    </span>
                  )}
                  {emisNumber && (
                    <span className="bg-blue-800/60 text-blue-100 text-xs font-bold px-3 py-1 rounded-full font-mono">
                      EMIS: {emisNumber}
                    </span>
                  )}
                  <span className="bg-indigo-700/50 text-indigo-100 text-xs font-bold px-3 py-1 rounded-full hidden sm:inline-flex">
                    Academic Year: 2083-2084 B.S.
                  </span>
                </>
              )}
            </div>

            {/* Status row */}
            <div className="flex flex-wrap justify-center md:justify-start gap-4 items-center text-xs font-bold text-white/90">
               <div className="flex items-center gap-1.5">
                 <span className="w-2 h-2 rounded-full bg-emerald-400 border border-emerald-200"></span> Active Session
               </div>
               <div className="flex items-center gap-1.5">
                 <Calendar className="w-3.5 h-3.5 opacity-70" /> Member since: {joiningDate || '1 Shrawan 2080 B.S.'}
               </div>
            </div>
         </div>
      </div>

      {/* TWO COLUMN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        
        {/* LEFT COLUMN - Personal Information Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
             <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
                👤 My Information
             </h2>
             {!isEditingPersonal && (
               <button 
                 onClick={() => setIsEditingPersonal(true)}
                 className="text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50 p-1.5 rounded cursor-pointer"
                 title="Edit Phone Number"
               >
                 <Edit2 className="w-4 h-4" />
               </button>
             )}
          </div>
          <div className="p-6 flex-1">
             {isEditingPersonal ? (
               <div className="space-y-4">
                  <div className="space-y-1.5">
                     <label className="text-xs font-bold text-gray-500 uppercase">Phone Number</label>
                     <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  
                  {/* Read Only Context during edit */}
                  <div className="pt-4 mt-2 border-t border-gray-100 opacity-60 pointer-events-none">
                    <p className="text-[11px] text-gray-500 font-bold mb-2">LOCKED FIELDS</p>
                    <div className="space-y-3">
                       <div><p className="text-xs font-bold text-gray-400 uppercase">Full Name</p><p className="text-sm font-bold text-gray-800">{fullName}</p></div>
                       <div><p className="text-xs font-bold text-gray-400 uppercase">Date of Birth</p><p className="text-sm font-bold text-gray-800">{dob || '-'}</p></div>
                    </div>
                  </div>
                  
                  <div className="pt-4 flex gap-3">
                     <button onClick={handleSavePhone} disabled={saving} className="bg-indigo-600 text-white text-sm font-bold px-5 py-2 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 cursor-pointer">
                        {saving ? 'Saving...' : 'Save Changes'}
                     </button>
                     <button onClick={() => setIsEditingPersonal(false)} className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-5 py-2 rounded-lg hover:text-primary transition-colors cursor-pointer">
                        Cancel
                     </button>
                  </div>
               </div>
             ) : (
               <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-4">
                    <div className="bg-[#F8F8F8] p-3 rounded-lg border border-gray-100 flex items-start gap-2 cursor-not-allowed">
                      <Lock className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase">Full Name</p>
                        <p className="text-sm font-bold text-gray-800">{fullName}</p>
                      </div>
                    </div>
                    <div className="bg-[#F8F8F8] p-3 rounded-lg border border-gray-100 flex items-start gap-2 cursor-not-allowed">
                      <Lock className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase">Email</p>
                        <p className="text-sm font-bold text-gray-800 truncate">{email || '-'}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-gray-400 uppercase mb-0.5">Phone Number</p>
                      <p className="text-sm font-bold text-gray-900">{phone || '-'}</p>
                    </div>
                    <div className="bg-[#F8F8F8] p-3 rounded-lg border border-gray-100 flex items-start gap-2 cursor-not-allowed">
                      <Lock className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase">Date of Birth</p>
                        <p className="text-sm font-bold text-gray-800">{dob || '-'}</p>
                      </div>
                    </div>
                    <div className="bg-[#F8F8F8] p-3 rounded-lg border border-gray-100 flex items-start gap-2 cursor-not-allowed">
                      <Lock className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase">Gender</p>
                        <p className="text-sm font-bold text-gray-800">{gender}</p>
                      </div>
                    </div>
                    <div className="bg-[#F8F8F8] p-3 rounded-lg border border-gray-100 flex items-start gap-2 cursor-not-allowed">
                      <Lock className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase">Address</p>
                        <p className="text-sm font-bold text-gray-800">{address || '-'}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-100 flex items-start gap-2 mt-2">
                    <span className="text-blue-500 font-bold shrink-0 mt-0.5">ⓘ</span>
                    <p className="text-xs text-blue-800 font-medium leading-relaxed">
                      To update institutional records such as Full Name or DOB, please contact the school administration.
                    </p>
                  </div>
               </div>
             )}
          </div>
        </div>

        {/* RIGHT COLUMN - Teaching / Professional Details (TEACHER) vs Academic Details (STUDENT) */}
        {isTeacher ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
               <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-indigo-600" /> Teaching & Professional Details
               </h2>
               <span className="text-xs font-bold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full">
                  Academic Faculty
               </span>
            </div>
            <div className="p-6 flex-1 flex flex-col h-full bg-[#F8F8F8]/50 space-y-5">
              <div className="grid grid-cols-2 gap-y-4 gap-x-4">
                 <div>
                   <p className="text-[11px] font-bold text-gray-400 uppercase mb-0.5 flex items-center gap-1"><Lock className="w-3 h-3"/> Teacher / Staff ID</p>
                   <p className="text-sm font-bold text-gray-800 bg-white border border-gray-200 px-2.5 py-1 rounded inline-block">{teacherId || 'N/A'}</p>
                 </div>
                 <div>
                   <p className="text-[11px] font-bold text-gray-400 uppercase mb-0.5 flex items-center gap-1"><Lock className="w-3 h-3"/> Designation</p>
                   <p className="text-sm font-bold text-gray-800">{designation}</p>
                 </div>
                 <div>
                   <p className="text-[11px] font-bold text-gray-400 uppercase mb-0.5 flex items-center gap-1"><Lock className="w-3 h-3"/> Primary Class Teacher</p>
                   <p className="text-sm font-bold text-gray-800">{primaryClassTeacher ? primaryClassTeacher : 'Not Assigned'}</p>
                 </div>
                 <div>
                   <p className="text-[11px] font-bold text-gray-400 uppercase mb-0.5 flex items-center gap-1"><Lock className="w-3 h-3"/> Department</p>
                   <p className="text-sm font-bold text-gray-800">{department}</p>
                 </div>
                 {qualification && (
                   <div className="col-span-2">
                     <p className="text-[11px] font-bold text-gray-400 uppercase mb-0.5 flex items-center gap-1"><Lock className="w-3 h-3"/> Qualification</p>
                     <p className="text-sm font-bold text-gray-800">{qualification}</p>
                   </div>
                 )}
              </div>

              {/* Assigned Classes */}
              <div className="pt-2 border-t border-gray-200">
                <p className="text-[11px] font-bold text-gray-400 uppercase mb-2 flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-500" /> Assigned Classes
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {assignedClasses.length > 0 ? (
                    assignedClasses.map((cls, idx) => (
                      <span key={idx} className="bg-white border border-gray-200 text-gray-800 text-xs font-bold px-2.5 py-1 rounded-md shadow-xs">
                        {cls}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-gray-400 font-medium">All General Classes</span>
                  )}
                </div>
              </div>

              {/* Assigned Subjects */}
              <div className="pt-2 border-t border-gray-200">
                <p className="text-[11px] font-bold text-gray-400 uppercase mb-2 flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-indigo-500" /> Assigned Subjects
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {assignedSubjects.length > 0 ? (
                    assignedSubjects.map((sub, idx) => (
                      <span key={idx} className="bg-indigo-50 text-indigo-800 border border-indigo-100 text-xs font-bold px-2.5 py-1 rounded-md">
                        {sub}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-gray-400 font-medium">Assigned by Administration</span>
                  )}
                </div>
              </div>

              {/* Quick Navigation Shortcuts */}
              <div className="pt-3 border-t border-gray-200 flex gap-2">
                <Link to="/salary" className="flex-1 bg-white border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 p-2.5 rounded-lg text-center transition-colors">
                  <p className="text-xs font-black text-gray-800">💼 My Salary</p>
                  <p className="text-[10px] text-gray-500 font-medium">View pay slips</p>
                </Link>
                <Link to="/admin" className="flex-1 bg-white border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 p-2.5 rounded-lg text-center transition-colors">
                  <p className="text-xs font-black text-gray-800">📊 Manage Results</p>
                  <p className="text-[10px] text-gray-500 font-medium">Enter student marks</p>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
               <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
                  🎓 Academic Details
               </h2>
            </div>
            <div className="p-6 flex-1 flex flex-col h-full bg-[#F8F8F8]/50">
              <div className="grid grid-cols-2 gap-y-5 gap-x-4 mb-auto">
                 <div>
                   <p className="text-[11px] font-bold text-gray-400 uppercase mb-0.5 flex items-center gap-1"><Lock className="w-3 h-3"/> Student ID</p>
                   <p className="text-sm font-bold text-gray-800 bg-white border border-gray-200 px-2.5 py-1.5 rounded inline-block font-mono">{studentId || '-'}</p>
                 </div>
                 <div>
                   <p className="text-[11px] font-bold text-gray-400 uppercase mb-0.5 flex items-center gap-1"><Lock className="w-3 h-3"/> EMIS Number</p>
                   <p className="text-sm font-bold text-gray-800 bg-white border border-gray-200 px-2.5 py-1.5 rounded inline-block font-mono">{emisNumber || 'Not Registered'}</p>
                 </div>
                 <div>
                   <p className="text-[11px] font-bold text-gray-400 uppercase mb-0.5 flex items-center gap-1"><Lock className="w-3 h-3"/> Class</p>
                   <p className="text-sm font-bold text-gray-800">{studentClass || '-'}</p>
                 </div>
                 <div>
                   <p className="text-[11px] font-bold text-gray-400 uppercase mb-0.5 flex items-center gap-1"><Lock className="w-3 h-3"/> Section</p>
                   <p className="text-sm font-bold text-gray-800">{section || 'A'}</p>
                 </div>
                 <div>
                   <p className="text-[11px] font-bold text-gray-400 uppercase mb-0.5 flex items-center gap-1"><Lock className="w-3 h-3"/> Roll Number</p>
                   <p className="text-sm font-bold text-gray-800">{rollNo || '-'}</p>
                 </div>
                 <div>
                     <p className="text-[11px] font-bold text-gray-400 uppercase mb-0.5 flex items-center gap-1"><Lock className="w-3 h-3"/> Admission Date</p>
                     <p className="text-sm font-bold text-gray-800">1 Shrawan 2080 B.S.</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 uppercase mb-0.5 flex items-center gap-1"><Lock className="w-3 h-3"/> Board</p>
                    <p className="text-sm font-bold text-gray-800">SEE (National)</p>
                  </div>
              </div>

              <div className="mt-6 pt-5 border-t border-gray-200">
                 <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Guardian Information</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] font-bold text-gray-400 uppercase mb-0.5 flex items-center gap-1"><Lock className="w-3 h-3"/> Guardian Name</p>
                      <p className="text-sm font-bold text-gray-800">{guardianName || '-'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-gray-400 uppercase mb-0.5 flex items-center gap-1"><Lock className="w-3 h-3"/> Relation</p>
                      <p className="text-sm font-bold text-gray-800">Parent / Guardian</p>
                    </div>
                    <div className="col-span-full">
                      <p className="text-[11px] font-bold text-gray-400 uppercase mb-0.5 flex items-center gap-1"><Lock className="w-3 h-3"/> Guardian Phone</p>
                      <p className="text-sm font-bold text-gray-800">{guardianPhone || '-'}</p>
                    </div>
                 </div>
              </div>
              
              {/* Student Quick Navigation Shortcuts */}
              <div className="mt-6 pt-4 border-t border-gray-200 flex gap-2">
                <Link to={`/result?studentId=${encodeURIComponent(studentId || auth.currentUser?.uid || '')}`} className="flex-1 bg-white border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 p-2.5 rounded-lg text-center transition-colors">
                  <p className="text-xs font-black text-gray-800">📊 View Result</p>
                  <p className="text-[10px] text-gray-500 font-medium">Academic marksheets</p>
                </Link>
                <Link to="/account" className="flex-1 bg-white border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 p-2.5 rounded-lg text-center transition-colors">
                  <p className="text-xs font-black text-gray-800">💳 Fee Status</p>
                  <p className="text-[10px] text-gray-500 font-medium">Ledger & invoices</p>
                </Link>
              </div>

              <div className="mt-4 text-center">
                 <p className="text-xs text-gray-400 font-medium">
                   ⓘ Academic information is managed by school administration
                 </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* STUDENT-ONLY: FEE & BILL STATEMENT */}
      {!isTeacher && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
             <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
                📜 Fee & Bill Statement
             </h2>
             <span className={`text-xs font-black px-3 py-1 rounded-full uppercase ${studentBills.length > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
               {studentBills.length > 0 ? 'Bill is Generated' : 'No Bills Generated Yet'}
             </span>
          </div>
          <div className="p-6">
             {studentBills.length === 0 ? (
               <div className="text-center py-6 text-gray-400">
                 <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                 <p className="text-xs font-bold uppercase">No fee bills generated by administration yet.</p>
               </div>
             ) : (
               <div className="space-y-6">
                 {studentBills.map((bill) => {
                   const isPaid = bill.status === 'paid';
                   const paidAmt = Number(bill.paidAmount || (isPaid ? bill.totalAmount : 0));
                   const dueAmt = Math.max(0, Number(bill.totalAmount || 0) - paidAmt);
                   return (
                     <div key={bill.id} className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200 pb-3">
                         <div>
                           <span className="text-xs font-bold text-indigo-600 uppercase">Bill No: {bill.billNo || bill.id.slice(-6)}</span>
                           <h4 className="text-sm font-black text-slate-800">Billing Period: {bill.billingPeriod}</h4>
                         </div>
                         <div className="flex items-center gap-2">
                           <span className={`text-xs font-black px-3 py-1 rounded-full uppercase ${isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                             {isPaid ? 'PAID / CLEARED' : 'DUES OUTSTANDING'}
                           </span>
                         </div>
                       </div>

                       {/* Itemized breakdown */}
                       <div className="space-y-2">
                         <p className="text-[11px] font-black text-slate-500 uppercase">Itemized Fee Charges:</p>
                          <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
                            {formatRemitBillItems(bill.itemizedCharges || []).map((item: any, idx: number) => (
                              <div key={idx} className="flex justify-between items-center px-4 py-2.5 text-xs">
                                <span className="font-bold text-slate-700">{item.name}</span>
                                <span className="font-mono font-bold text-slate-900">{item.totalStr}</span>
                              </div>
                            ))}
                          </div>
                       </div>

                       {/* Summary financials */}
                       <div className="grid grid-cols-3 gap-3 pt-2">
                         <div className="bg-white p-3 rounded-lg border border-slate-200 text-center">
                           <p className="text-[10px] font-bold text-slate-400 uppercase">Total Billed</p>
                           <p className="text-sm font-black text-slate-900 font-mono">NRs. {Number(bill.totalAmount || 0).toLocaleString()}</p>
                         </div>
                         <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-center">
                           <p className="text-[10px] font-bold text-emerald-600 uppercase">Amount Paid</p>
                           <p className="text-sm font-black text-emerald-800 font-mono">NRs. {paidAmt.toLocaleString()}</p>
                         </div>
                         <div className="bg-red-50 p-3 rounded-lg border border-red-200 text-center">
                           <p className="text-[10px] font-bold text-red-600 uppercase">Remaining Due</p>
                           <p className="text-sm font-black text-red-800 font-mono">NRs. {dueAmt.toLocaleString()}</p>
                         </div>
                       </div>

                       {/* Payment Instruction */}
                       <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-xl flex items-start gap-3">
                         <span className="text-blue-600 text-base font-black">ⓘ</span>
                         <div>
                           <p className="text-xs font-black text-blue-900 uppercase">Payment Instructions</p>
                           <p className="text-xs text-blue-800 font-medium mt-0.5">
                             To pay your fees, please <strong className="underline">Go to school</strong> and <strong className="underline">Contact in account section</strong>.
                           </p>
                         </div>
                       </div>
                     </div>
                   );
                 })}
               </div>
             )}
          </div>
        </div>
      )}

      {/* SECURITY CARD */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="p-5 border-b border-gray-100 flex items-center gap-2">
           <span className="text-lg">🔐</span>
           <h2 className="text-[15px] font-bold text-gray-900">Password & Security</h2>
        </div>
        <div className="p-6">
           {!showPasswordSection ? (
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
               <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1">Account Password</h3>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <p className="text-xs font-bold text-gray-500">Last changed: {passwordLastChanged}</p>
                  </div>
               </div>
               <button 
                 onClick={() => setShowPasswordSection(true)} 
                 className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-sm font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 w-full md:w-auto justify-center cursor-pointer"
               >
                  🔑 Change Password
               </button>
             </div>
           ) : (
             <form onSubmit={handleUpdatePassword} className="border-primary text-primary border border-gray-100 p-5 rounded-xl space-y-4 max-w-lg">
                {pwdError && (
                  <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-200">
                    {pwdError}
                  </div>
                )}
                <div className="space-y-1.5 relative">
                   <label className="text-[11px] font-bold text-gray-500 uppercase">Current Password</label>
                   <div className="relative">
                     <input type={showCurrentPassword ? "text" : "password"} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required className="w-full px-3 py-2 pr-10 bg-white border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                     <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer">
                       {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                     </button>
                   </div>
                </div>
                <div className="space-y-1.5 relative">
                   <label className="text-[11px] font-bold text-gray-500 uppercase">New Password</label>
                   <div className="relative">
                     <input type={showNewPassword ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)} required className="w-full px-3 py-2 pr-10 bg-white border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                     <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer">
                       {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                     </button>
                   </div>
                   
                   {newPassword && (
                     <div className="flex items-center justify-between pt-1 mb-2">
                       <div className="flex gap-1">
                         <div className={`w-10 h-1.5 rounded-full ${newPassword.length >= 8 ? 'bg-emerald-500' : 'bg-gray-200'}`}></div>
                         <div className={`w-10 h-1.5 rounded-full ${/[A-Z]/.test(newPassword) ? 'bg-emerald-500' : 'bg-gray-200'}`}></div>
                         <div className={`w-10 h-1.5 rounded-full ${/[0-9]/.test(newPassword) ? 'bg-emerald-500' : 'bg-gray-200'}`}></div>
                         <div className={`w-10 h-1.5 rounded-full ${/[!@#$]/.test(newPassword) ? 'bg-red-500' : 'bg-gray-200'}`}></div>
                       </div>
                       <span className={`text-[10px] font-black uppercase ${strength.color}`}>{strength.label}</span>
                     </div>
                   )}
                   
                   <div className="bg-white p-3 rounded border border-gray-100 mt-2">
                     <ul className="text-[10px] space-y-1.5 font-bold text-gray-500">
                       <li className="flex gap-1.5"><Check className={`w-3.5 h-3.5 ${newPassword.length >= 8 ? 'text-emerald-500' : 'text-gray-300'}`}/> At least 8 characters</li>
                       <li className="flex gap-1.5"><Check className={`w-3.5 h-3.5 ${/[A-Z]/.test(newPassword) ? 'text-emerald-500' : 'text-gray-300'}`}/> Contains uppercase letter</li>
                       <li className="flex gap-1.5"><Check className={`w-3.5 h-3.5 ${/[0-9]/.test(newPassword) ? 'text-emerald-500' : 'text-gray-300'}`}/> Contains number</li>
                       <li className="flex gap-1.5"><Check className={`w-3.5 h-3.5 ${/[!@#$%^&*(),.?":{}|<>]/.test(newPassword) ? 'text-emerald-500' : 'text-gray-300'}`} /> Contains special character</li>
                     </ul>
                   </div>
                </div>
                <div className="space-y-1.5 mb-4 relative">
                   <label className="text-[11px] font-bold text-gray-500 uppercase">Confirm Password</label>
                   <div className="relative">
                     <input type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="w-full px-3 py-2 pr-10 bg-white border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                     <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer">
                       {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                     </button>
                   </div>
                </div>
                
                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                   <button type="submit" disabled={pwdLoading || !newPassword || newPassword !== confirmPassword || newPassword.length < 8 || !/[0-9]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)} className="bg-indigo-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors w-full sm:w-auto disabled:opacity-50 cursor-pointer">
                      {pwdLoading ? 'Updating...' : 'Update Password'}
                   </button>
                   <button type="button" onClick={() => setShowPasswordSection(false)} className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-5 py-2.5 rounded-lg hover:text-primary transition-colors w-full sm:w-auto text-center cursor-pointer">
                      Cancel
                   </button>
                </div>
             </form>
           )}
        </div>
      </div>

    </div>
  );
}

