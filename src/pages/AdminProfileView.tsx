import React, { useState, useEffect, useRef } from 'react';
import { Camera, Edit2, Lock, MonitorSmartphone, Shield, CheckCircle2, ChevronRight, CircleUserRound, Check, X, Activity, GraduationCap, LogOut, AlertCircle, Eye, EyeOff, FileText, Banknote, Settings } from 'lucide-react';
import { auth, db } from '../firebase';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, query, orderBy, limit, getDocs, where, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigate } from 'react-router-dom';

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

export default function AdminProfileView() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successToast, setSuccessToast] = useState('');
  
  // User data state
  const [avatarUrl, setAvatarUrl] = useState('');
  const [fullName, setFullName] = useState('Rahul Sah');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [gender, setGender] = useState('Male');
  const [adminId, setAdminId] = useState('');
  const [adminTier, setAdminTier] = useState('primary');
  
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);

  // Security state
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLastChanged, setPasswordLastChanged] = useState('30 days ago');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState('Current Device');

  // Real Sessions State
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [confirmingRevokeSession, setConfirmingRevokeSession] = useState<string | null>(null);
  const [confirmingLogoutAll, setConfirmingLogoutAll] = useState(false);
  const [logoutAllLoading, setLogoutAllLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const currentSessionId = localStorage.getItem('localSessionId') || '';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Parse user agent
    const ua = navigator.userAgent;
    let browser = 'Unknown Browser';
    let os = 'Unknown OS';

    if (ua.includes('Chrome') && !ua.includes('Edg/')) browser = 'Chrome';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Edg/')) browser = 'Edge';
    else if (ua.includes('Trident/')) browser = 'Internet Explorer';

    if (ua.includes('Win')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'MacOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('like Mac OS X')) os = 'iOS';

    setDeviceInfo(`${browser} on ${os}`);

    let unsubSessions = () => {};

    const fetchAdminData = async () => {
      if (auth.currentUser) {
        try {
          setEmail(auth.currentUser.email || '');
          const docRef = doc(db, 'users', auth.currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setFullName(data.fullName || data.name || 'Rahul Sah');
            setPhone(data.phone || '');
            setDob(data.dob || '');
            setAddress(data.address || '');
            setGender(data.gender || 'Male');
            setAvatarUrl(data.avatarUrl || '');
            setAdminId(data.permanentAdminId || data.adminId || data.staffId || 'ADM-000001');
            setAdminTier(data.adminTier || (auth.currentUser?.email === 'rahulsah4534@gmail.com' ? 'primary' : 'secondary'));
            if (data.passwordUpdatedAt) {
              const d = new Date(data.passwordUpdatedAt);
              const diff = Math.floor((new Date().getTime() - d.getTime()) / (1000 * 3600 * 24));
              setPasswordLastChanged(diff === 0 ? 'Today' : `${diff} days ago`);
            } else {
              setPasswordLastChanged('Unknown');
            }
          }
        } catch (e) {
          console.error("Error fetching admin profile", e);
        }

        try {
          // Subscribe to user's real session security records
          const qSessions = query(
            collection(db, 'user_sessions'),
            where('userUid', '==', auth.currentUser.uid)
          );
          unsubSessions = onSnapshot(qSessions, (snap) => {
            const sList: any[] = [];
            snap.forEach(docSnap => {
              sList.push({ id: docSnap.id, ...docSnap.data() });
            });
            sList.sort((a, b) => new Date(b.loginAt || 0).getTime() - new Date(a.loginAt || 0).getTime());
            setSessions(sList);
            setSessionsLoading(false);

            // Populate recent activity from real login records
            const loginActs = sList.map(s => ({
              id: s.id,
              action: 'LOGIN',
              device: s.compositeName || `${s.browser || 'Browser'} on ${s.operatingSystem || 'OS'}`,
              location: s.approximateLocation || 'Location unavailable',
              ip: s.ipAddress || 'Unknown',
              dateStr: formatActivityDate(s.loginAt),
              rawDate: s.loginAt,
              status: s.status
            }));
            setActivities(loginActs);
          }, (err) => {
            console.warn("Could not load user sessions:", err);
            setSessionsLoading(false);
          });
        } catch (err) {
          console.warn("Error setting up sessions listener:", err);
          setSessionsLoading(false);
        }
      }
      setLoading(false);
    };

    fetchAdminData();
    return () => {
      unsubSessions();
    };
  }, []);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
    
    // Quick preview
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
      // fallback to original or show error?
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

  const handleSavePersonal = async () => {
    if (!auth.currentUser) return;
    setSaving(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, {
        fullName,
        phone,
        dob,
        address,
        gender
      });
      setIsEditingPersonal(false);
      showToast('Personal information updated successfully');
    } catch (err: any) {
      console.error("Error saving profile", err);
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
      if (!/[A-Z]/.test(newPassword)) throw new Error('New password must contain at least one uppercase letter');
      if (!/[a-z]/.test(newPassword)) throw new Error('New password must contain at least one lowercase letter');
      if (!/[0-9]/.test(newPassword)) throw new Error('New password must contain at least one number');

      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      try {
        await reauthenticateWithCredential(user, credential);
      } catch (authErr) {
        throw new Error('Current password does not match.');
      }

      await updatePassword(user, newPassword);
      
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { passwordUpdatedAt: new Date().toISOString() });
      setPasswordLastChanged('Today');
      
      showToast('Password updated successfully');
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

  const handleLogoutAllOtherDevices = async () => {
    setConfirmingLogoutAll(false);
    setSessionError('');
    if (!auth.currentUser) {
      setSessionError('Authentication required.');
      return;
    }

    setLogoutAllLoading(true);
    try {
      const localSessionId = localStorage.getItem('localSessionId') || '';
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/auth/logout-other-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentSessionId: localSessionId })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Successfully logged out from all other active sessions.');
        // Optimistically prune remote sessions immediately
        setSessions(prev => prev.map(s => 
          (s.sessionId === localSessionId || s.id === localSessionId)
            ? s
            : { ...s, status: 'REVOKED', revokedAt: new Date().toISOString() }
        ));
      } else {
        setSessionError(data.error || 'Failed to logout other devices. Please try again.');
      }
    } catch (e: any) {
      console.error('[SECURITY] Error logging out other devices:', e);
      setSessionError('Failed to logout other devices. Please try again.');
    } finally {
      setLogoutAllLoading(false);
    }
  };

  const handleRevokeSession = async (targetSessionId: string) => {
    setConfirmingRevokeSession(null);
    setSessionError('');
    if (!targetSessionId) return;

    if (currentSessionId && (targetSessionId === currentSessionId)) {
      setSessionError('Cannot revoke current active session on this device.');
      return;
    }

    if (!auth.currentUser) {
      setSessionError('Authentication required.');
      return;
    }

    setRevokingSessionId(targetSessionId);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/auth/revoke-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          sessionId: targetSessionId,
          currentSessionId
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Session revoked successfully.');
        // Optimistically update sessions state immediately
        setSessions(prev => prev.map(s => 
          (s.sessionId === targetSessionId || s.id === targetSessionId)
            ? { ...s, status: 'REVOKED', revokedAt: new Date().toISOString() }
            : s
        ));
      } else {
        setSessionError(data.error || 'Unable to revoke this session. Please try again.');
      }
    } catch (err: any) {
      console.error('[SECURITY] Error revoking session:', err);
      setSessionError('Unable to revoke this session. Please try again.');
    } finally {
      setRevokingSessionId(null);
    }
  };

  const getInitials = (nameStr: string) => {
    const parts = nameStr.split(' ').filter(Boolean);
    if (parts.length === 0) return 'A';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const evalPasswordStrength = (pwd: string) => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) score++; // user requirement: special character is now required
    if (pwd.length > 12) score++;

    if (score <= 1) return { label: 'Weak 🔴', color: 'text-red-500' };
    if (score === 2) return { label: 'Fair 🟡', color: 'text-orange-500' };
    if (score === 3) return { label: 'Strong 🟢', color: 'text-emerald-500' };
    return { label: 'Very Strong 💪', color: 'text-emerald-600' };
  };

  const strength = evalPasswordStrength(newPassword);

  if (loading) {
    return <div className="p-8 text-center text-gray-500 font-bold animate-pulse">Loading Profile...</div>;
  }

  return (
    <div className="max-w-[1200px] mx-auto pb-12 animate-in fade-in duration-500 relative">
      
      {/* Toast */}
      {successToast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 font-bold animate-in slide-in-from-top-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          {successToast}
        </div>
      )}

      {/* SECTION 1 - HERO CARD */}
      <div className="bg-primary bg-gradient-to-br from-primary to-[#1e243b] text-white rounded-2xl p-6 md:p-8 shadow-lg flex flex-col md:flex-row items-start md:items-center gap-6 relative overflow-hidden mb-6">
         {/* Background decoration */}
         <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
         <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-[#4f46e5]/20 rounded-full blur-3xl mb-[-100px] pointer-events-none"></div>

         {/* Avatar & Upload */}
         <div className="flex flex-col items-center gap-3 relative z-10 shrink-0">
           <div className="w-[100px] h-[100px] rounded-full border-4 border-white/20 bg-primary shadow-xl overflow-hidden flex items-center justify-center relative group">
              {avatarUrl ? (
                <img src={avatarUrl} alt={fullName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-black text-white">{getInitials(fullName)}</span>
              )}
           </div>
           
           <input type="file" ref={fileInputRef} className="hidden" accept=".jpg,.png,.webp" onChange={handlePhotoUpload} />
           <div className="flex gap-2 items-center justify-center">
               <button onClick={() => fileInputRef.current?.click()} className="bg-white text-primary text-xs font-bold px-3 py-1.5 rounded-full shadow-md border border-gray-100 hover:bg-gray-50 transition-colors flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" />
                  {avatarUrl ? 'Change' : 'Upload Photo'}
               </button>
               {avatarUrl && (
                  <button onClick={handlePhotoDelete} className="bg-white text-red-500 text-xs font-bold w-7 h-7 flex justify-center items-center rounded-full shadow-md border border-gray-100 hover:bg-red-50 transition-colors" title="Remove Photo">
                      <X className="w-3 h-3" />
                  </button>
               )}
           </div>
         </div>

         {/* Basic Info */}
         <div className="flex-1 relative z-10">
            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-1">
               <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">{fullName}</h1>
               <div className="flex items-center gap-2 flex-wrap">
                 <span className="bg-white border-primary text-primary text-[10px] uppercase font-black tracking-widest px-2.5 py-1 rounded-full border border-gray-200 shadow-sm w-max">
                   ADMIN
                 </span>
                 {adminId && (
                   <span className="bg-white/20 text-white text-xs font-mono font-bold px-3 py-1 rounded-full border border-white/30 backdrop-blur-sm">
                     Admin ID: {adminId}
                   </span>
                 )}
                 <span className="bg-orange-600/80 text-white text-xs font-bold px-3 py-1 rounded-full border border-orange-400/40">
                   {adminTier === 'primary' ? '1° Primary Admin' : '2° Secondary Admin'}
                 </span>
               </div>
            </div>
            <p className="text-gray-300 font-medium text-sm mb-4">School Administrator • Shikshantar Academy | Siraha</p>

            {/* Status row */}
            <div className="flex flex-wrap gap-4 text-xs font-bold text-gray-300 items-center">
               <div className="flex items-center gap-1.5 bg-black/20 px-3 py-1.5 rounded-full border border-white/10">
                 <div className="w-2 h-2 rounded-full bg-emerald-400"></div> Active Session
               </div>
               <button 
                 type="button"
                 onClick={() => {
                   if (typeof (window as any).triggerSessionTimeoutWarning === 'function') {
                     (window as any).triggerSessionTimeoutWarning();
                   }
                 }}
                 className="bg-white/10 hover:bg-white/20 text-white text-[10px] font-black px-3 py-1.5 rounded-full border border-white/10 transition-all flex items-center gap-1 cursor-pointer"
                 title="Manually simulate and preview the session timeout warning modal (30-second countdown)"
               >
                 <span>⚡ Test Timeout Warning</span>
               </button>
               <div className="flex items-center gap-1.5 bg-black/20 px-3 py-1.5 rounded-full border border-white/10">
                 <MonitorSmartphone className="w-3.5 h-3.5 text-blue-300" /> Last Login: Today, 3:17 PM
               </div>
               <div className="flex items-center gap-1.5 bg-black/20 px-3 py-1.5 rounded-full border border-white/10">
                 <Shield className="w-3.5 h-3.5 text-orange-300" /> Password updated {passwordLastChanged}
               </div>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* SECTION 2 LEFT: Personal Info */}
        <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between text-primary">
             <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
                <CircleUserRound className="w-5 h-5 text-primary" /> Personal Information
             </h2>
             {!isEditingPersonal && (
               <button 
                 onClick={() => setIsEditingPersonal(true)}
                 className="text-xs font-bold border-primary text-primary hover:text-blue-700 flex items-center gap-1 bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
               >
                 <Edit2 className="w-3.5 h-3.5" /> Edit
               </button>
             )}
          </div>
          <div className="p-6 flex-1">
             {isEditingPersonal ? (
               <div className="space-y-4">
                  <div className="space-y-1.5">
                     <label className="text-xs font-bold text-gray-500 uppercase">Full Name</label>
                     <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:ring-primary focus:ring-1 focus:ring-primary" />
                  </div>
                  <div className="space-y-1.5">
                     <label className="text-xs font-bold text-gray-500 uppercase">Email</label>
                     <input type="email" value={email} readOnly className="w-full px-3 py-2 border-primary text-primary border border-gray-200 rounded-lg text-sm font-semibold text-gray-500 outline-none cursor-not-allowed" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase">Phone</label>
                        <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:ring-primary focus:ring-1 focus:ring-primary" />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase">Date of Birth</label>
                        <input type="date" value={dob} onChange={e => setDob(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:ring-primary focus:ring-1 focus:ring-primary" />
                     </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase">Gender</label>
                        <select value={gender} onChange={e => setGender(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:ring-primary focus:ring-1 focus:ring-primary">
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase">Address</label>
                        <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:ring-primary focus:ring-1 focus:ring-primary" />
                     </div>
                  </div>
                  
                  <div className="pt-4 flex gap-3">
                     <button onClick={handleSavePersonal} disabled={saving} className="bg-primary text-white text-sm font-bold px-5 py-2.5 rounded-lg shadow-sm hover:bg-primary-dark transition-colors disabled:opacity-50">
                        {saving ? 'Saving...' : 'Save Changes'}
                     </button>
                     <button onClick={() => setIsEditingPersonal(false)} className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-5 py-2.5 rounded-lg hover:text-primary transition-colors">
                        Cancel
                     </button>
                  </div>
               </div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-4">
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Full Name</p>
                    <p className="text-sm font-bold text-gray-900">{fullName}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Email</p>
                    <p className="text-sm font-bold text-gray-900">{email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Phone</p>
                    <p className="text-sm font-bold text-gray-900">{phone || '-'}</p>
                  </div>
                  <div>
                     <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Date of Birth</p>
                     <p className="text-sm font-bold text-gray-900">{dob || '-'}</p>
                  </div>
                  <div>
                     <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Gender</p>
                     <p className="text-sm font-bold text-gray-900">{gender}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Address</p>
                    <p className="text-sm font-bold text-gray-900">{address || '-'}</p>
                  </div>
               </div>
             )}
          </div>
        </div>

        {/* SECTION 2 RIGHT: School Info */}
        <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between text-primary">
             <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-primary" /> School Information
             </h2>
          </div>
          <div className="p-6 flex-1 flex flex-col h-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-4 mb-auto">
               <div>
                 <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Role</p>
                 <span className="text-xs font-bold border-primary text-primary bg-blue-50 border border-blue-100 px-2 py-0.5 rounded uppercase">Admin</span>
               </div>
               <div>
                 <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Admin ID</p>
                 <p className="text-sm font-mono font-bold text-gray-900">{adminId || 'ADM-000001'}</p>
               </div>
               <div>
                 <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Governance Tier</p>
                 <p className="text-sm font-bold text-orange-600">{adminTier === 'primary' ? '1° Primary Admin' : '2° Secondary Admin'}</p>
               </div>
               <div>
                 <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Position</p>
                 <p className="text-sm font-bold text-gray-900">School Administrator</p>
               </div>
               <div>
                 <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Department</p>
                 <p className="text-sm font-bold text-gray-900">Administration</p>
               </div>
               <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Joining Date</p>
                  <p className="text-sm font-bold text-gray-900">1 Shrawan 2080 B.S.</p>
               </div>
               <div>
                 <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Academic Year</p>
                 <p className="text-sm font-bold text-gray-900">2082-2083 B.S.</p>
               </div>
               <div className="col-span-full">
                 <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Reporting To</p>
                 <p className="text-sm font-bold text-gray-900">Principal</p>
               </div>
            </div>
            
            <div className="mt-8 bg-blue-50/50 rounded-lg p-3 border border-blue-100 flex items-start gap-2">
               <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
               <p className="text-xs text-blue-800 font-medium leading-relaxed">
                 School information can only be updated by the Super Admin via the system console.
               </p>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: SECURITY SETTINGS */}
      <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] overflow-hidden mb-6">
        <div className="p-5 border-b border-gray-100 text-primary">
           <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" /> Security & Password
           </h2>
        </div>
        <div className="p-6">
           <div className="flex flex-col md:flex-row gap-8">
              {/* Left Side: Passwords */}
              <div className="flex-1">
                 <div className="mb-4">
                   <h3 className="text-sm font-bold text-gray-900 mb-1">Account Password</h3>
                   <div className="flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                     <p className="text-xs font-bold text-gray-500">Last changed: {passwordLastChanged}</p>
                   </div>
                 </div>

                 {!showPasswordSection ? (
                   <button 
                     onClick={() => setShowPasswordSection(true)} 
                     className="bg-white border border-gray-300 text-gray-700 text-sm font-bold px-4 py-2 rounded-lg shadow-sm hover:text-primary transition-colors flex items-center gap-2"
                   >
                      <Lock className="w-4 h-4" /> Change Password
                   </button>
                 ) : (
                   <form onSubmit={handleUpdatePassword} className="border-primary text-primary border border-gray-100 p-5 rounded-xl space-y-4 animate-in slide-in-from-top-2">
                      {pwdError && (
                        <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-200">
                          {pwdError}
                        </div>
                      )}
                      <div className="space-y-1.5 relative">
                         <label className="text-[11px] font-bold text-gray-500 uppercase">Current Password</label>
                         <div className="relative">
                           <input type={showCurrentPassword ? "text" : "password"} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required className="w-full px-3 py-2 pr-10 bg-white border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:ring-primary focus:ring-1 focus:ring-primary" />
                           <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none">
                             {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                           </button>
                         </div>
                      </div>
                      <div className="space-y-1.5 relative">
                         <label className="text-[11px] font-bold text-gray-500 uppercase">New Password</label>
                         <div className="relative">
                           <input type={showNewPassword ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)} required className="w-full px-3 py-2 pr-10 bg-white border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:ring-primary focus:ring-1 focus:ring-primary" />
                           <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none">
                             {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                           </button>
                         </div>
                         {newPassword && (
                           <div className="flex items-center justify-between pt-1">
                             <div className="flex gap-1">
                               <div className={`w-10 h-1.5 rounded-full ${newPassword.length >= 8 ? 'bg-emerald-500' : 'bg-gray-200'}`}></div>
                               <div className={`w-10 h-1.5 rounded-full ${/[A-Z]/.test(newPassword) ? 'bg-emerald-500' : 'bg-gray-200'}`}></div>
                               <div className={`w-10 h-1.5 rounded-full ${/[0-9]/.test(newPassword) ? 'bg-emerald-500' : 'bg-gray-200'}`}></div>
                               <div className={`w-10 h-1.5 rounded-full ${/[!@#$]/.test(newPassword) ? 'bg-red-500' : 'bg-gray-200'}`}></div>
                             </div>
                             <span className={`text-xs font-bold ${strength.color}`}>{strength.label}</span>
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
                      <div className="space-y-1.5 relative mb-4">
                         <label className="text-[11px] font-bold text-gray-500 uppercase">Confirm New Password</label>
                         <div className="relative">
                           <input type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="w-full px-3 py-2 pr-10 bg-white border border-gray-200 rounded-lg text-sm font-semibold outline-none focus:ring-primary focus:ring-1 focus:ring-primary" />
                           <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none">
                             {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                           </button>
                         </div>
                         {confirmPassword && newPassword === confirmPassword && (
                           <p className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 mt-1"><CheckCircle2 className="w-3.5 h-3.5"/> Passwords match</p>
                         )}
                      </div>
                      
                      <div className="pt-2 flex gap-3">
                         <button type="submit" disabled={pwdLoading || !newPassword || newPassword !== confirmPassword || newPassword.length < 8 || !/[0-9]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)} className="bg-primary text-white text-sm font-bold px-5 py-2.5 rounded-lg shadow-sm hover:bg-primary-dark transition-colors w-full disabled:opacity-50 flex items-center justify-center gap-2">
                            {pwdLoading ? 'Updating...' : 'Update Password'}
                         </button>
                         <button type="button" onClick={() => setShowPasswordSection(false)} className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-5 py-2.5 rounded-lg hover:text-primary transition-colors">
                            Cancel
                         </button>
                      </div>
                   </form>
                 )}
              </div>
              
              {/* Spacer on Desktop */}
              <div className="hidden md:block w-px bg-gray-100"></div>

              {/* Right Side: Sessions */}
              <div className="flex-1 md:pt-0 pt-6 md:border-t-0 border-t border-gray-100">
                 <div className="flex items-center justify-between mb-4">
                   <h3 className="text-sm font-bold text-gray-900">Active Sessions</h3>
                   <span className="text-[11px] font-bold text-gray-500">
                     {sessions.filter(s => s.status === 'ACTIVE').length || 1} active
                   </span>
                 </div>

                 {sessionError && (
                   <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-200 flex justify-between items-center mb-3">
                     <span>{sessionError}</span>
                     <button type="button" onClick={() => setSessionError('')} className="text-red-500 hover:text-red-800 text-sm font-black cursor-pointer">×</button>
                   </div>
                 )}

                 <div className="space-y-3">
                   {sessions.filter(s => s.status === 'ACTIVE').map((s) => {
                     const isThisDevice = s.sessionId === currentSessionId || s.id === currentSessionId;
                     return (
                       <div key={s.id || s.sessionId} className={`border rounded-xl p-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-all ${isThisDevice ? 'bg-blue-50/50 border-blue-200' : 'bg-white border-gray-200'}`}>
                         <div className="flex gap-3 items-start">
                           <MonitorSmartphone className={`w-5 h-5 mt-0.5 shrink-0 ${isThisDevice ? 'text-primary' : 'text-gray-400'}`} />
                           <div className="space-y-0.5">
                             <p className="text-sm font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                               {s.browser || 'Browser'} on {s.operatingSystem || 'OS'}
                               {isThisDevice && (
                                 <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">THIS DEVICE</span>
                               )}
                             </p>
                             <p className="text-xs text-gray-500 font-medium">
                               {isThisDevice ? 'Active now' : `Active ${formatTimeAgo(s.lastActiveAt || s.loginAt)}`}
                             </p>
                             <p className="text-[11px] text-gray-600">
                               Approximate location: <strong className="font-semibold text-gray-800">{s.approximateLocation || 'Location unavailable'}</strong>
                             </p>
                             <p className="text-[11px] text-gray-400 font-mono">
                               IP: {s.ipAddress || 'Unknown'} • Last active: {formatTimeAgo(s.lastActiveAt || s.loginAt)}
                             </p>
                           </div>
                         </div>
                         {!isThisDevice && (
                           <button
                             type="button"
                             onClick={() => setConfirmingRevokeSession(s.sessionId || s.id)}
                             disabled={revokingSessionId === (s.sessionId || s.id)}
                             className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                           >
                             {revokingSessionId === (s.sessionId || s.id) ? 'Revoking...' : 'REVOKE'}
                           </button>
                         )}
                       </div>
                     );
                   })}

                   {sessions.filter(s => s.status === 'ACTIVE').length === 0 && (
                     <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 flex gap-3 items-start">
                       <MonitorSmartphone className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                       <div>
                         <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                           {deviceInfo}
                           <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">THIS DEVICE</span>
                         </p>
                         <p className="text-xs text-gray-500 font-medium">Active now</p>
                       </div>
                     </div>
                   )}
                 </div>

                 <button 
                   type="button"
                   onClick={() => setConfirmingLogoutAll(true)} 
                   disabled={logoutAllLoading}
                   className="mt-5 w-full bg-white border border-red-200 text-red-600 hover:bg-red-50 text-sm font-bold px-4 py-2.5 rounded-lg flex justify-center items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                 >
                   <LogOut className="w-4 h-4" /> {logoutAllLoading ? 'Logging out other devices...' : 'Logout All Other Devices'}
                 </button>
              </div>
           </div>
        </div>
      </div>

      {/* SECTION 4: RECENT ACTIVITY */}
      <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] overflow-hidden mb-6">
        <div className="p-5 border-b border-gray-100 text-primary flex items-center justify-between">
           <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" /> Recent Activity
           </h2>
           <span className="text-xs font-bold text-gray-400">Login & Session Events</span>
        </div>
        <div className="p-2 md:p-4">
           {/* Timeline */}
           <div className="relative pl-4 pr-4 py-2">
              <div className="absolute left-6 top-6 bottom-6 w-px bg-gray-200"></div>
              
              {activities.slice(0, 5).map((act, i) => (
                <div className={`relative flex gap-4 items-start ${i < activities.slice(0, 5).length - 1 ? 'mb-6' : ''}`} key={act.id}>
                   <div className="w-4 h-4 rounded-full border-2 border-white bg-blue-600 shadow-sm shrink-0 mt-1 relative z-10"></div>
                   <div>
                     <div className="flex items-center gap-2">
                       <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                         {act.action}
                       </span>
                       <span className="text-sm font-bold text-gray-900">{act.device}</span>
                     </div>
                     <p className="text-xs text-gray-600 mt-1">
                       Approximate Location: <strong className="font-semibold text-gray-800">{act.location}</strong>
                     </p>
                     <p className="text-xs text-gray-500 font-mono mt-0.5">
                       IP: {act.ip}
                     </p>
                     <p className="text-[11px] font-bold text-gray-400 mt-1">
                       {act.dateStr}
                     </p>
                   </div>
                </div>
              ))}
              {activities.length === 0 && (
                <p className="text-gray-500 font-bold text-sm text-center italic py-4">No recent activity found.</p>
              )}
           </div>
        </div>
        <div className="border-t border-gray-100 p-4">
           <button 
             type="button"
             onClick={() => setIsActivityLogOpen(true)} 
             className="text-sm font-bold text-primary hover:text-blue-700 flex items-center gap-1 mx-auto cursor-pointer"
           >
             View Full Activity Log <ChevronRight className="w-4 h-4" />
           </button>
        </div>
      </div>

      {/* SECTION 5: QUICK STATS */}
      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest pl-1 mb-3">Today's Quick Stats</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
         <div className="bg-white p-4 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Fees Recorded</p>
            <p className="text-xl md:text-2xl font-black text-gray-900">NRs. 3,600</p>
         </div>
         <div className="bg-white p-4 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Notices Posted</p>
            <p className="text-xl md:text-2xl font-black text-gray-900">4 <span className="text-xs text-gray-400 font-bold ml-1">/ month</span></p>
         </div>
         <div className="bg-white p-4 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Admissions Appr.</p>
            <p className="text-xl md:text-2xl font-black text-gray-900">3</p>
         </div>
         <div className="bg-white p-4 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Results Published</p>
            <p className="text-xl md:text-2xl font-black text-gray-900">2 <span className="text-xs text-gray-400 font-bold ml-1">exams</span></p>
         </div>
      </div>

      {isActivityLogOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center text-primary shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900">Activity Log</h3>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-0.5">Your recent system login & session actions</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsActivityLogOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
             <div className="p-6 overflow-y-auto space-y-6">
               <div className="relative border-l-2 border-gray-100 pl-6 ml-3 space-y-8">
                 {activities.length > 0 ? activities.map(act => (
                   <div className="relative" key={act.id}>
                      <div className="absolute -left-[31px] top-1 rounded-full border-4 border-white bg-blue-600 p-1.5 shadow-sm">
                        <MonitorSmartphone className="w-3 h-3 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                            {act.action}
                          </span>
                          <span className="text-sm font-bold text-gray-900">{act.device}</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          Approximate Location: <strong className="font-semibold text-gray-800">{act.location}</strong>
                        </p>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">
                          IP: {act.ip}
                        </p>
                        <p className="text-[11px] font-bold text-gray-400 mt-1">
                          {act.dateStr}
                        </p>
                      </div>
                   </div>
                 )) : (
                   <p className="text-gray-500 font-bold text-sm text-center italic py-4">No recent activity found.</p>
                 )}
               </div>
             </div>
            <div className="px-6 py-4 text-primary border-t border-gray-100 flex justify-end shrink-0">
               <button 
                 type="button"
                 onClick={() => setIsActivityLogOpen(false)}
                 className="px-5 py-2.5 bg-gray-200 text-gray-700 font-bold rounded-xl text-sm hover:bg-gray-300 transition-colors cursor-pointer"
               >
                 Close
               </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Modal: Confirm Revoke Session */}
      {confirmingRevokeSession && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-1">Revoke Session</h3>
            <p className="text-xs text-gray-500 text-center mb-6 leading-relaxed">
              Are you sure you want to revoke this session? That device will immediately lose application access.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmingRevokeSession(null)}
                className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRevokeSession(confirmingRevokeSession)}
                disabled={revokingSessionId === confirmingRevokeSession}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-sm shadow-red-200 disabled:opacity-50"
              >
                {revokingSessionId === confirmingRevokeSession ? 'Revoking...' : 'Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Modal: Confirm Logout All Other Devices */}
      {confirmingLogoutAll && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <LogOut className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-1">Logout All Other Devices</h3>
            <p className="text-xs text-gray-500 text-center mb-6 leading-relaxed">
              Are you sure you want to log out from all other devices? You will remain logged in on this device.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmingLogoutAll(false)}
                className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogoutAllOtherDevices}
                disabled={logoutAllLoading}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-sm shadow-red-200 disabled:opacity-50"
              >
                {logoutAllLoading ? 'Logging out...' : 'Logout All'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
