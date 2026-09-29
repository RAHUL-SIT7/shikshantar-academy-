import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { formatBSDate, getBSYearMonthDate } from '../lib/nepaliDate';
import { Menu, X, Home, Building, Image, Calendar, User, FileText, LogOut, LogIn, Info, Settings, Upload, CreditCard, Shield, Bell, Megaphone, Check, Users, MapPin, Phone, HelpCircle, GraduationCap, Award, Wallet, Sun, Moon, ChevronUp, Facebook, Globe, Mail, SmilePlus, LayoutDashboard } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { useNotices } from '../contexts/NoticeContext';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy, where, updateDoc, doc, getDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import WhatsAppWidget from './WhatsAppWidget';
import CalculatorWidget from './CalculatorWidget';
import DOMPurify from 'isomorphic-dompurify';
import NoticePopup from './NoticePopup';
import Breadcrumbs from './Breadcrumbs';
import PublicHeader from './PublicHeader';
import Footer from './Footer';
import { safeDispatchEvent } from '../lib/safeEvents';
const logoImageSrc = "/logo.png";

const logoImage = logoImageSrc || "/logo.png";
const logoFallback = "/logo.png";

interface Notice {
  id: string;
  title: string;
  priority: string;
  status: string;
  targets: string[];
  date: string;
  message?: string;
  attachmentUrl?: string;
  attachmentType?: string;
  attachmentName?: string;
  readBy?: string[];
  isAdmission?: boolean;
}

export default function Layout({ 
  isAuthenticated, 
  setIsAuthenticated, 
  userRole 
}: { 
  isAuthenticated: boolean, 
  setIsAuthenticated: (val: boolean) => void,
  userRole: string
}) {
  const [themeMode, setThemeMode] = useState<string>(() => localStorage.getItem('themeMode') || 'light');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isBellOpen, setIsBellOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const {
    notices: recentNotices,
    unreadNoticesCount: contextUnreadCount,
    latestUnreadNotice: popupNotice,
    showNoticePopup,
    popupTimer,
    mainContentBlocked,
    dismissNotice,
  } = useNotices();

  const [pendingAdmissions, setPendingAdmissions] = useState<any[]>([]);
  const [pendingEnquiries, setPendingEnquiries] = useState<any[]>([]);
  const [pendingAlumniSubmissions, setPendingAlumniSubmissions] = useState<any[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [studentClassState, setStudentClassState] = useState<string>(() => localStorage.getItem('studentClass') || '');

  const [userName, setUserName] = useState<string | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = React.useRef<HTMLDivElement>(null);

  // Determine if current route is an internal portal/ERP page vs public guest page
  const portalRoutes = [
    '/admin',
    '/user-approvals',
    '/admin-admissions',
    '/account-admin',
    '/salary-admin',
    '/iemis',
    '/settings',
    '/profile',
    '/teacher-salary',
    '/account',
    '/result'
  ];

  const isPortalRoute = isAuthenticated && portalRoutes.some(route => 
    location.pathname === route || location.pathname.startsWith(route + '/')
  );

  // Contact Us / Social Links State
  const [socialData, setSocialData] = useState({
    facebookUrl: '',
    instagramUrl: '',
    tiktokUrl: '',
    whatsappNumber: '',
    websiteUrl: ''
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'contact_us'), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        setSocialData({
          facebookUrl: d.facebookUrl || '',
          instagramUrl: d.instagramUrl || '',
          tiktokUrl: d.tiktokUrl || '',
          whatsappNumber: d.whatsappNumber || '',
          websiteUrl: d.websiteUrl || ''
        });
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (themeMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('themeMode', themeMode);
  }, [themeMode]);

  const toggleThemeMode = () => {
    setThemeMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Calculate current NPT (Nepal Standard Time) date
  // Using Intl.DateTimeFormat for accurate timezone calculation
  const getNPTDate = () => {
    const now = new Date();
    try {
        const nepalTimeString = new Intl.DateTimeFormat('en-US', {
           timeZone: 'Asia/Kathmandu',
           year: 'numeric', month: 'numeric', day: 'numeric',
           hour: 'numeric', minute: 'numeric', second: 'numeric',
           hour12: false
        }).format(now);
        return new Date(nepalTimeString);
    } catch (e) {
        // Fallback if Intl is not supported
        const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
        return new Date(utcTime + (345 * 60000));
    }
  };

  const [currentTime, setCurrentTime] = useState(getNPTDate());
  
  const role = userRole || 'student';
  const studentId = localStorage.getItem('studentId') || '';
  
  const logoUrl = logoImage;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const totalHeight = target.scrollHeight - target.clientHeight;
    if (totalHeight > 0) {
      setScrollProgress((target.scrollTop / totalHeight) * 100);
    } else {
      setScrollProgress(0);
    }
    
    if (target.scrollTop > 200) {
      setShowScrollTop(true);
    } else {
      setShowScrollTop(false);
    }

    if (target.scrollTop > 10) {
      setIsHeaderScrolled(true);
    } else {
      setIsHeaderScrolled(false);
    }
  };

  React.useEffect(() => {
    setIsBellOpen(false);
    setIsProfileOpen(false);
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: 'instant' as any });
    setScrollProgress(0);
    setShowScrollTop(false);
    setIsHeaderScrolled(false);
  }, [location.pathname]);

  // Handle global page-level scroll for all screen sizes
  useEffect(() => {
    const handleGlobalScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      
      if (scrollHeight > 0) {
        setScrollProgress((scrollTop / scrollHeight) * 100);
      } else {
        setScrollProgress(0);
      }
      
      if (scrollTop > 200) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }

      if (scrollTop > 10) {
        setIsHeaderScrolled(true);
      } else {
        setIsHeaderScrolled(false);
      }
    };

    window.addEventListener('scroll', handleGlobalScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleGlobalScroll);
  }, []);

  // Prevent background body scroll only when full-screen mobile sliding drawer menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100%';
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.height = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
    };
  }, [isMenuOpen]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getNPTDate()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let unsubAdmissions = () => {};
    let unsubEnquiries = () => {};
    let unsubAlumni = () => {};

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubAdmissions();
      unsubEnquiries();
      unsubAlumni();
      
      if (user) {
         try {
           getDoc(doc(db, 'users', user.uid)).then(userDoc => {
             if (userDoc.exists()) {
                const data = userDoc.data();
                setAvatarUrl(data.avatarUrl || null);
                setUserName(data.name || data.fullName || null);
                
                // Backfill/sync studentClass in localStorage and state dynamically on login
                const cls = data.class || data.studentClass || (data.children?.[0]?.studentClass) || '' ? ((data.role || role) === 'student' ? (data.class || data.studentClass || (data.children?.[0]?.studentClass) || '') : (localStorage.removeItem('studentClass'), setStudentClassState(''), '')) : '';
                if (cls) {
                   localStorage.setItem('studentClass', cls);
                   setStudentClassState(cls);
                }
             }
           }).catch(e => console.warn(e));
         } catch (e) { console.warn(e); }
      } else {
         setAvatarUrl(null);
         setUserName(null);
         setStudentClassState('');
         localStorage.removeItem('studentClass');
      }

      const isAdmin = user && role === 'admin';

      if (isAdmin) {
        // Subscribe to Pending Admissions (Admin Only)
        const qAdmissions = query(collection(db, 'admissions'), where('status', '==', 'Pending'));
        unsubAdmissions = onSnapshot(qAdmissions, (snap) => {
          setPendingAdmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (error: any) => {
          console.warn("Admissions fetch warning:", error);
        });

        // Subscribe to Unread Web Enquiries (Admin Only)
        const qEnquiries = query(collection(db, 'contact_enquiries'), where('status', '==', 'unread'));
        unsubEnquiries = onSnapshot(qEnquiries, (snap) => {
          setPendingEnquiries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (error: any) => {
          console.warn("Web enquiries fetch warning:", error);
        });

        // Subscribe to Pending Alumni Submissions (Admin Only)
        const qAlumni = query(collection(db, 'alumni_submissions'), where('status', '==', 'pending'));
        unsubAlumni = onSnapshot(qAlumni, (snap) => {
          setPendingAlumniSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (error: any) => {
          console.warn("Alumni submissions fetch warning:", error);
        });
      } else {
        setPendingAdmissions([]);
        setPendingEnquiries([]);
        setPendingAlumniSubmissions([]);
      }
    });

    return () => { 
      unsubAdmissions(); 
      unsubEnquiries();
      unsubAlumni();
      unsubAuth(); 
    };
  }, [role, studentClassState]);



  // Local Read Receipts for visual immediate update and guest users
  const [localReads, setLocalReads] = useState<string[]>([]);
  useEffect(() => {
     const handleStorageOrCustom = () => {
         try {
             const reads = JSON.parse(localStorage.getItem('localReadNotices') || '[]');
             setLocalReads(reads);
         } catch(e) {}
     };
     
     handleStorageOrCustom(); // Initial read
     window.addEventListener('localReadsChanged', handleStorageOrCustom);
     return () => window.removeEventListener('localReadsChanged', handleStorageOrCustom);
  }, []);

  // Merge notices, admissions, web enquiries, and alumni submissions for the bell
  // Only include items that the current user has NOT read.
  const currentUidForFilter = auth.currentUser?.uid || studentId || 'guest';
  const safeToIsoString = (val: any) => {
    if (!val) return new Date().toISOString();
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return new Date(val).toISOString();
    if (typeof val === 'object' && val !== null) {
      if (typeof val.toDate === 'function') return val.toDate().toISOString();
      if (typeof val.seconds === 'number') return new Date(val.seconds * 1000).toISOString();
    }
    return new Date().toISOString();
  };

  const combinedBellItems = [
    ...pendingAdmissions.map(a => ({
      id: a.id,
      title: `Admission Request: ${a.studentName || 'Student'}`,
      priority: 'Urgent',
      date: safeToIsoString(a.submittedAt),
      isAdmission: true,
      isEnquiry: false,
      isAlumni: false,
      href: '/admin-admissions',
      readBy: a.readBy || []
    })),
    ...pendingEnquiries.map(e => ({
      id: e.id,
      title: `Web Enquiry: ${e.fullName || e.name || 'Anonymous'}`,
      priority: 'Enquiry',
      date: safeToIsoString(e.createdAt),
      isAdmission: false,
      isEnquiry: true,
      isAlumni: false,
      href: '/admin?tab=enquiries',
      readBy: e.readBy || []
    })),
    ...pendingAlumniSubmissions.map(al => ({
      id: al.id,
      title: `Alumni Story: ${al.name}`,
      priority: 'Alumni',
      date: safeToIsoString(al.createdAt),
      isAdmission: false,
      isEnquiry: false,
      isAlumni: true,
      href: '/alumni',
      readBy: al.readBy || []
    })),
    ...recentNotices.map(n => ({
      ...n,
      isAdmission: false,
      isEnquiry: false,
      isAlumni: false,
      href: '/notices',
      date: safeToIsoString(n.timestamp || n.date)
    }))
  ].sort((a, b) => {
    const dateA = typeof a.date === 'string' ? a.date : new Date().toISOString();
    const dateB = typeof b.date === 'string' ? b.date : new Date().toISOString();
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  }).slice(0, 15); // Show up to 15 items

  // Calculate Academic Year based on current NPT Year and Month
  // Nepali New Year (Bysakh 1) typically falls in mid-April. 
  // For simplicity: If Gregorian month >= 4 (April), BS year = Gregorian + 57. Else + 56.
  const currentGregorianYear = currentTime.getFullYear();
  const currentGregorianMonth = currentTime.getMonth() + 1; // 1-12
  const currentGregorianDate = currentTime.getDate();

  let currentBSYear = currentGregorianYear + 56;
  try {
     currentBSYear = getBSYearMonthDate(new Date()).year;
  } catch(e){}
  const academicYearString = `${currentBSYear}-${currentBSYear + 1} B.S.`;

  const handleLogout = async () => {
    try {
      if (auth.currentUser) {
        const localSessionId = localStorage.getItem('localSessionId');
        if (localSessionId) {
          // Remove this device's active session token from Firestore
          await updateDoc(doc(db, 'users', auth.currentUser.uid), {
            activeSessions: arrayRemove(localSessionId)
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn("Logout session cleanup error:", e);
    }

    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign out error:", err);
    }

    setIsAuthenticated(false);
    localStorage.removeItem('userRole');
    localStorage.removeItem('studentId');
    localStorage.removeItem('studentClass');
    localStorage.removeItem('adminSearchStudentId');
    localStorage.removeItem('isGuest');
    localStorage.removeItem('teacherSubjects');
    localStorage.removeItem('lastUserUid');
    localStorage.removeItem('localSessionId');
    localStorage.removeItem('shikshantar_last_activity');
    sessionStorage.clear();
    
    navigate('/login?reason=manual');
  };

  // Base navigation for all roles
  const baseNavigation = [
    { name: 'Home', href: '/', icon: Home, group: 'Menu' },
    { name: 'Facilities', href: '/facilities', icon: Building, group: 'Menu' },
    { name: 'Photo Gallery', href: '/gallery', icon: Image, group: 'Menu' },
    { name: 'Fees & Scholarships', href: '/fee-structure', icon: CreditCard, group: 'Menu' },
    { name: 'Admission Form', href: '/admission', icon: FileText, group: 'Menu' },
    { name: 'Academic Calendar', href: '/calendar', icon: Calendar, group: 'Menu' },
    { name: 'Alumni / Success', href: '/alumni', icon: GraduationCap, group: 'Menu' },
    { name: 'Notice Board', href: '/notices', icon: Megaphone, group: 'Menu' },
    { name: 'About Us', href: '/about', icon: Info, group: 'Menu' },
    { name: 'FAQ', href: '/faq', icon: HelpCircle, group: 'Menu' },
    { name: 'Contact Us', href: '/contact', icon: Phone, group: 'Menu' },
  ];

  // Role specific navigation
  const getRoleNavigation = () => {
    // Add an index to preserve the original order within the same group
    let nav = [...baseNavigation].map((item, index) => ({ ...item, originalIndex: index }));
    
    if (!isAuthenticated) {
      return nav;
    }

    if (role === 'student') {
      nav.push({ name: 'My Results', href: '/result', icon: FileText, group: 'My Portal', originalIndex: nav.length });
      nav.push({ name: 'My Fee Status', href: '/account', icon: CreditCard, group: 'My Portal', originalIndex: nav.length });
    } else if (role === 'teacher') {
      nav.push({ name: 'My Salary', href: '/teacher-salary', icon: Wallet, group: 'My Portal', originalIndex: nav.length });
      nav.push({ name: 'Manage Results', href: '/admin', icon: Upload, group: 'Administration', originalIndex: nav.length });
    } else if (role === 'admin') {
      nav = nav.filter(item => item.name !== 'Fees & Scholarships');
      nav.push({ name: 'Manage Admissions', href: '/admin-admissions', icon: User, group: 'Administration', originalIndex: nav.length });
      nav.push({ name: 'Fee Management', href: '/account-admin', icon: CreditCard, group: 'Administration', originalIndex: nav.length });
      nav.push({ name: 'Salary Management', href: '/salary-admin', icon: Wallet, group: 'Administration', originalIndex: nav.length });
      nav.push({ name: 'Manage Results', href: '/admin', icon: Upload, group: 'Administration', originalIndex: nav.length });
      nav.push({ name: 'User Management', href: '/user-approvals', icon: Shield, group: 'Administration', originalIndex: nav.length });
      nav.push({ name: 'IEMIS Export', href: '/iemis', icon: FileText, group: 'Administration', originalIndex: nav.length });
      nav.push({ name: 'Settings', href: '/settings', icon: Settings, group: 'Administration', originalIndex: nav.length });
    }
    
    const groupOrder = ['Menu', 'My Portal', 'Administration'];
    return nav.sort((a, b) => {
      const groupDiff = groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group);
      if (groupDiff !== 0) return groupDiff;
      return a.originalIndex - b.originalIndex;
    });
  };

  const navigation = getRoleNavigation();

  // Combine Unread counts
  const currentUid = auth.currentUser?.uid || studentId || 'guest';
  const unreadNoticesCount = recentNotices.filter(n => (!n.readBy || !n.readBy.includes(currentUid)) && !localReads.includes(n.id)).length;
  const unreadAdmissionsCount = pendingAdmissions.filter(a => (!a.readBy || !a.readBy.includes(currentUid)) && !localReads.includes(a.id)).length;
  const unreadEnquiriesCount = pendingEnquiries.filter(e => (!e.readBy || !e.readBy.includes(currentUid)) && !localReads.includes(e.id)).length;
  const unreadAlumniCount = pendingAlumniSubmissions.filter(al => (!al.readBy || !al.readBy.includes(currentUid)) && !localReads.includes(al.id)).length;

  const unreadUrgentCount = (role === 'admin') 
    ? unreadNoticesCount + unreadAdmissionsCount + unreadEnquiriesCount + unreadAlumniCount 
    : unreadNoticesCount;

  const markAsRead = async (
    noticeId: string, 
    type: 'admission' | 'enquiry' | 'alumni' | 'notice', 
    e: React.MouseEvent, 
    preventDefault = true
  ) => {
    if (preventDefault) {
      e.preventDefault();
      e.stopPropagation(); // prevent navigation
    }
    
    // Save locally
    if (!localReads.includes(noticeId)) {
       const newReads = [...localReads, noticeId];
       setLocalReads(newReads);
       localStorage.setItem('localReadNotices', JSON.stringify(newReads));
       safeDispatchEvent('localReadsChanged');
    }

    const uid = auth.currentUser?.uid || studentId || 'guest';
    const collectionName = 
      type === 'admission' ? 'admissions' :
      type === 'enquiry' ? 'contact_enquiries' :
      type === 'alumni' ? 'alumni_submissions' : 'notices';

    try {
        if (uid !== 'guest') {
            await updateDoc(doc(db, collectionName, noticeId), {
                readBy: arrayUnion(uid)
            });
        }
    } catch(err) {
        console.warn(`Could not mark ${collectionName} as read`, err);
    }
  };

  const markAllAsRead = () => {
    const uid = auth.currentUser?.uid || studentId || 'guest';
    const updates: any[] = [];
    const newReads = [...localReads];
    
    recentNotices.forEach(n => {
      if (!n.readBy || !n.readBy.includes(uid)) {
        if (!newReads.includes(n.id)) newReads.push(n.id);
        if (uid !== 'guest') {
            updates.push(
              updateDoc(doc(db, 'notices', n.id), {
                readBy: arrayUnion(uid)
              }).catch(err => {
                console.warn("Failed to mark notice read (expected for students):", err);
              })
            );
        }
      }
    });

    const isAdmin = role === 'admin';

    if (isAdmin) {
      pendingAdmissions.forEach(a => {
        if (!a.readBy || !a.readBy.includes(uid)) {
          if (!newReads.includes(a.id)) newReads.push(a.id);
          if (uid !== 'guest') {
              updates.push(
                updateDoc(doc(db, 'admissions', a.id), {
                  readBy: arrayUnion(uid)
                }).catch(err => {
                  console.warn("Failed to mark admission read:", err);
                })
              );
          }
        }
      });

      pendingEnquiries.forEach(e => {
        if (!e.readBy || !e.readBy.includes(uid)) {
          if (!newReads.includes(e.id)) newReads.push(e.id);
          if (uid !== 'guest') {
              updates.push(
                updateDoc(doc(db, 'contact_enquiries', e.id), {
                  readBy: arrayUnion(uid)
                }).catch(err => {
                  console.warn("Failed to mark enquiry read:", err);
                })
              );
          }
        }
      });

      pendingAlumniSubmissions.forEach(al => {
        if (!al.readBy || !al.readBy.includes(uid)) {
          if (!newReads.includes(al.id)) newReads.push(al.id);
          if (uid !== 'guest') {
              updates.push(
                updateDoc(doc(db, 'alumni_submissions', al.id), {
                  readBy: arrayUnion(uid)
                }).catch(err => {
                  console.warn("Failed to mark alumni submission read:", err);
                })
              );
          }
        }
      });
    }

    setLocalReads([...newReads]);
    localStorage.setItem('localReadNotices', JSON.stringify(newReads));
    safeDispatchEvent('localReadsChanged');
    setIsBellOpen(false); // Always close the dropdown immediately

    if (updates.length > 0) {
      Promise.all(updates).catch(err => {
        console.warn("Error marking all as read:", err);
      });
    }
  };

  const renderNotificationDropdown = () => (
    <div 
      className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-slate-100 overflow-hidden flex flex-col z-50 animate-in fade-in slide-in-from-top-2 duration-150"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/90">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-black tracking-wider uppercase text-slate-700 dark:text-slate-200">
            NOTIFICATIONS
          </span>
          {unreadUrgentCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-red-500 text-white">
              {unreadUrgentCount}
            </span>
          )}
        </div>
        {unreadUrgentCount > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              markAllAsRead();
            }}
            className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Notice Items List */}
      <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 custom-scrollbar">
        {recentNotices.length > 0 ? (
          recentNotices.map((notice) => {
            const isRead = (notice.readBy && notice.readBy.includes(currentUid)) || localReads.includes(notice.id);
            const isUrgent = (notice.priority || '').toUpperCase() === 'URGENT';
            const isHigh = (notice.priority || '').toUpperCase() === 'HIGH';

            return (
              <div
                key={notice.id}
                onClick={(e) => {
                  markAsRead(notice.id, 'notice', e, false);
                  setIsBellOpen(false);
                  navigate('/notices');
                }}
                className={`p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer group text-left ${
                  !isRead ? 'bg-amber-50/30 dark:bg-amber-950/20' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                    isUrgent 
                      ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' 
                      : isHigh
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                  }`}>
                    {notice.priority ? notice.priority.toUpperCase() : 'NORMAL'}
                  </span>
                  {!isRead && (
                    <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                  )}
                </div>
                <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {notice.title}
                </div>
                {notice.date && (
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-1">
                    {notice.date.split('T')[0]}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-slate-400 dark:text-slate-500">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-xs font-semibold">No notifications right now</p>
          </div>
        )}

        {/* Admin Pending Items */}
        {role === 'admin' && pendingAdmissions.map((adm) => (
          <div
            key={adm.id}
            onClick={(e) => {
              markAsRead(adm.id, 'admission', e, false);
              setIsBellOpen(false);
              navigate('/admin-admissions');
            }}
            className="p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer group bg-emerald-50/30 dark:bg-emerald-950/20 text-left"
          >
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 mb-1">
              ADMISSION
            </span>
            <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug group-hover:text-emerald-600 transition-colors">
              New Admission: {adm.studentName || `${adm.studentFirstName || ''} ${adm.studentLastName || ''}`.trim() || 'Student Application'}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Link */}
      <button
        onClick={() => {
          setIsBellOpen(false);
          navigate('/notices');
        }}
        className="py-3 px-4 text-center font-bold text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors border-t border-slate-100 dark:border-slate-800 block w-full cursor-pointer"
      >
        Open Notice Board
      </button>
    </div>
  );

  const renderProfileDropdown = () => (
    <div 
      className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-slate-100 overflow-hidden flex flex-col py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
      onClick={(e) => e.stopPropagation()}
    >
      {!isAuthenticated ? (
        <>
          {/* Guest Header */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 text-left">
            <div className="text-xs font-black text-slate-800 dark:text-slate-100">
              Guest User
            </div>
            <div className="text-[10px] text-amber-500 font-extrabold uppercase tracking-wider mt-0.5">
              Guest Portal
            </div>
          </div>

          <div className="p-1.5">
            <Link
              to="/login"
              onClick={() => setIsProfileOpen(false)}
              className="px-3.5 py-2.5 rounded-xl text-sm font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-slate-800 flex items-center gap-3 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <LogIn className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <div className="leading-tight font-black">Portal Login</div>
                <div className="text-[10px] text-slate-400 font-normal">Admin, Teacher, Student</div>
              </div>
            </Link>
          </div>
        </>
      ) : (
        <>
          {/* Authenticated User Header */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 text-left">
            <div className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
              {userName || `Logged in as ${role}`}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-primary text-white">
                {role.toUpperCase()}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">Portal</span>
            </div>
          </div>

          <div className="p-1.5 space-y-0.5 text-left">
            <Link
              to="/profile"
              onClick={() => setIsProfileOpen(false)}
              className="px-3.5 py-2.5 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-3 transition-colors"
            >
              <User className="w-4 h-4 text-slate-400" />
              <span>My Profile</span>
            </Link>

            <Link
              to={role === 'admin' ? '/admin' : role === 'teacher' ? '/teacher-salary' : '/account'}
              onClick={() => setIsProfileOpen(false)}
              className="px-3.5 py-2.5 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-3 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4 text-amber-500" />
              <span>Portal Dashboard</span>
            </Link>

            <button
              onClick={() => {
                setIsProfileOpen(false);
                setShowLogoutConfirm(true);
              }}
              className="w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/25 flex items-center gap-3 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-800 mt-1"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </>
      )}
    </div>
  );

  if (mainContentBlocked && popupNotice && showNoticePopup) {
    return (
      <NoticePopup
        notice={popupNotice}
        popupTimer={popupTimer}
        onClose={() => dismissNotice(popupNotice.id)}
        fullScreenBlock={true}
      />
    );
  }

  return (
    <div className={`min-h-screen lg:h-screen lg:h-[100dvh] lg:max-h-screen lg:max-h-[100dvh] w-full flex lg:flex-row flex-col bg-[#f3f4f6] dark:bg-[#0b0f19] text-[#1f2937] dark:text-[#f8fafc] font-sans print:h-auto print:bg-white print:relative print:inset-auto lg:overflow-hidden ${isMenuOpen ? 'h-screen max-h-screen overflow-hidden' : 'overflow-visible'}`}>
      {/* Sidebar Navigation */}
      <aside className="w-[245px] bg-[var(--primary)] dark:bg-slate-950 border-r border-white/5 text-white flex-col py-5 hidden lg:flex shrink-0 print:hidden h-full max-h-full overflow-hidden">
        {/* School Logo & Title Block */}
        <div className="px-5 pb-2 flex flex-col items-center text-center shrink-0">
          <div className="w-16 h-16 rounded-full bg-white p-1 mb-3.5 shadow-lg flex items-center justify-center">
            <img 
              src={logoUrl} 
              alt="Shikshantar Academy Logo" 
              referrerPolicy="no-referrer" 
              className="w-full h-full object-contain rounded-full" 
              fetchPriority="high"
              onError={(e) => {
                const target = e.currentTarget;
                if (target.src !== logoFallback) {
                  target.src = logoFallback;
                }
              }}
            />
          </div>
          <h1 className="text-[1.15rem] tracking-[0.5px] font-extrabold text-white leading-tight">SHIKSHANTAR</h1>
          <span className="text-[0.75rem] opacity-90 block uppercase font-black tracking-wider text-amber-400 mt-0.5">Academy Siraha</span>
        </div>
        
        {/* Bold line below the logo & school name */}
        <div className="border-b-2 border-white/25 mx-5 my-4 shrink-0" />
        
        {/* User Profile Info */}
        <div className="px-5 flex items-center gap-3 py-1 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0 border border-white/25 overflow-hidden shadow-inner">
            {avatarUrl ? (
               <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
               <User className="w-5 h-5 text-white/90" />
            )}
          </div>
          <div className="overflow-hidden">
            <div className="text-[0.82rem] font-extrabold truncate text-white">
               {isAuthenticated ? (userName || `Logged in as ${role}`) : 'Guest User'}
            </div>
            <div className="text-[0.68rem] opacity-75 font-medium truncate capitalize text-slate-300">
               {isAuthenticated ? role : 'Guest Portal'}
            </div>
          </div>
        </div>

        {/* Bold line above the menu, indicating this section */}
        <div className="border-b-2 border-white/25 mx-5 my-4 shrink-0" />

        {/* Highlighted Menu Section with a different background color */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-950/65 dark:bg-slate-950/80 rounded-2xl mx-3.5 mb-4 p-1.5 border border-white/10 shadow-inner">
          <nav className="flex-1 overflow-y-auto custom-scrollbar overflow-x-hidden">
            <ul className="list-none p-0 m-0 pb-4">
              {navigation.map((item, index) => {
                const Icon = item.icon;
                const showGroupHeader = index === 0 || navigation[index - 1].group !== item.group;
                return (
                  <React.Fragment key={item.name}>
                    {showGroupHeader && (
                      <li className={`px-4 py-2 text-[0.65rem] font-extrabold uppercase tracking-[1px] text-white/50 sticky top-0 z-10 bg-[var(--primary)]/95 backdrop-blur-sm ${index !== 0 ? 'mt-3 border-t border-white/5 pt-3' : ''}`}>
                        {item.group as string}
                      </li>
                    )}
                    <li>
                      <Link
                        to={item.href}
                        className={`px-4 py-2.5 text-[0.82rem] font-semibold cursor-pointer flex items-center gap-3 transition-all rounded-xl mx-1 my-0.5 ${ 
                          location.pathname === item.href 
                            ? 'bg-amber-500 text-slate-950 font-black shadow-md' 
                            : 'text-white/80 hover:bg-white/10 hover:text-white' 
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="whitespace-nowrap">{item.name}</span>
                      </Link>
                    </li>
                  </React.Fragment>
                );
              })}
            </ul>
          </nav>
        </div>
        
        <div className="shrink-0 px-5 py-3 border-t border-white/10 mt-auto bg-slate-950/20">
          <div className="text-[0.65rem] text-white/60 uppercase tracking-wider font-bold">Academic Year</div>
          <div className="text-[0.85rem] font-bold text-white shadow-sm mt-0.5">{academicYearString}</div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div 
        ref={mainRef}
        onScroll={handleScroll}
        className={`flex-1 flex flex-col min-w-0 min-h-0 h-auto lg:h-full lg:max-h-full print:h-auto print:overflow-visible relative ${isMenuOpen ? 'overflow-hidden lg:overflow-hidden' : 'overflow-visible lg:overflow-y-auto lg:overflow-x-hidden custom-scrollbar'}`}
      >
        {/* Spacer for Fixed Mobile Header */}
        <div className="h-[56px] lg:hidden shrink-0 w-full" />

        {/* Mobile Header */}
        <div className="lg:hidden bg-primary text-white px-2.5 py-2 flex justify-between items-center shrink-0 print:hidden shadow-md fixed top-0 left-0 right-0 z-50 h-[56px] w-full">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-white p-0.5 flex items-center justify-center shrink-0">
              <img 
                src={logoUrl} 
                alt="Logo" 
                className="w-full h-full object-contain rounded-full" 
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src !== logoFallback) {
                    target.src = logoFallback;
                  }
                }}
              />
            </div>
            <div className="min-w-0">
              <div className="font-extrabold tracking-tight text-xs sm:text-sm whitespace-nowrap">SHIKSHANTAR</div>
              <div className="text-[0.55rem] sm:text-[0.6rem] opacity-85 leading-none mb-0.5 whitespace-nowrap text-white/90 font-semibold">
                Academy | Siraha
              </div>
              <div className="text-[0.55rem] sm:text-[0.6rem] text-amber-300 font-extrabold uppercase tracking-wide leading-none whitespace-nowrap">
                {isAuthenticated ? `${role === 'admin' ? 'Admin' : role === 'teacher' ? 'Teacher' : 'Student'} Portal` : 'Guest Portal'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 relative shrink-0">
             <div className="flex flex-col text-right mr-0.5 sm:mr-1 shrink-0 justify-center leading-none border-r border-white/20 pr-1.5">
                <span className="text-[0.6rem] sm:text-[0.65rem] font-bold text-white leading-none mb-0.5">
                   {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit' })}
                </span>
                <span className="text-[0.5rem] sm:text-[0.55rem] text-white/80 font-mono tracking-tight leading-none">
                   {formatBSDate(currentTime)}
                </span>
             </div>
             <button 
                onClick={toggleThemeMode} 
                className="p-1 rounded-lg hover:bg-white/10 transition-colors flex items-center justify-center pointer-events-auto shrink-0"
                title={themeMode === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
             >
                {themeMode === 'dark' ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-gray-200" />}
             </button>

             {/* Bell Button (Mobile & Tablet) */}
             <div className="relative">
               <button 
                 onClick={() => {
                   setIsBellOpen(!isBellOpen);
                   setIsProfileOpen(false);
                 }} 
                 className="relative p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
                 aria-label="Notifications"
                 title="Notifications"
               >
                  <Bell className="w-5 h-5" />
                  {unreadUrgentCount > 0 && (
                     <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 rounded-full text-[9px] font-bold flex items-center justify-center border border-primary text-white">
                        {unreadUrgentCount}
                     </span>
                  )}
               </button>
               {isBellOpen && (
                 <div className="fixed sm:absolute top-[52px] right-2 sm:right-0 w-[calc(100vw-16px)] max-w-[360px] z-50">
                   {renderNotificationDropdown()}
                 </div>
               )}
             </div>
             
             {/* Profile Avatar Button (Mobile & Tablet) */}
             <div className="relative">
               <button 
                 onClick={() => {
                   setIsProfileOpen(!isProfileOpen);
                   setIsBellOpen(false);
                 }} 
                 className="w-7.5 h-7.5 rounded-full bg-white/20 flex items-center justify-center border border-white/30 overflow-hidden hover:ring-2 hover:ring-white/50 transition-all shadow-sm shrink-0"
                 aria-label="User Profile"
                 title="User Profile"
               >
                  {avatarUrl ? (
                     <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                     <User className="w-3.5 h-3.5 text-white" />
                  )}
               </button>
               {isProfileOpen && (
                 <div className="fixed sm:absolute top-[52px] right-2 sm:right-0 w-60 z-50">
                   {renderProfileDropdown()}
                 </div>
               )}
             </div>
             
             <button 
               onClick={() => {
                 setIsMenuOpen(!isMenuOpen);
                 setIsBellOpen(false);
                 setIsProfileOpen(false);
               }} 
               className="p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
               aria-label="Menu"
             >
               {isMenuOpen ? <X className="w-5 h-5"/> : <Menu className="w-5 h-5"/>}
             </button>
          </div>
        </div>

        {/* Header */}
        <header className={`bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-5 flex justify-between items-center shrink-0 z-30 hidden lg:flex print:hidden sticky top-0 transition-all duration-300 ${isHeaderScrolled ? 'shadow-md border-b border-orange-500/30' : 'shadow-[0_1px_3px_rgba(0,0,0,0.05)] border-b dark:border-slate-800'}`}>
          <div className="flex items-center gap-3">
             <div className="text-[1.1rem] font-bold text-[#1f2937] dark:text-white flex items-center gap-2">
               <LayoutDashboard className="w-5 h-5 text-primary" />
               <span>{navigation.find(n => n.href === location.pathname)?.name || (location.pathname === '/' ? 'Home' : 'Portal')}</span>
             </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4 lg:gap-6">
            <button 
              onClick={toggleThemeMode} 
              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors flex items-center justify-center text-gray-700 dark:text-gray-200"
              title={themeMode === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
               {themeMode === 'dark' ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-gray-600" />}
            </button>
            <div className="relative">
               <button 
                 onClick={() => {
                   setIsBellOpen(!isBellOpen);
                   setIsProfileOpen(false);
                 }} 
                 className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors relative"
                 aria-label="Notifications"
                 title="Notifications"
               >
                  <Bell className="w-5 h-5 text-gray-700 dark:text-gray-200" />
                  {unreadUrgentCount > 0 && (
                     <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-slate-900 text-white">
                        {unreadUrgentCount}
                     </span>
                  )}
               </button>
               {isBellOpen && (
                 <div className="absolute top-12 right-0 w-88 max-w-[380px] z-50">
                   {renderNotificationDropdown()}
                 </div>
               )}
            </div>
            
            <div className="text-right">
              <div className="text-[0.8rem] font-bold flex items-center justify-end gap-2 text-[#1f2937] dark:text-gray-100">
                <span className="px-2.5 py-0.5 rounded-full bg-primary text-white text-[10px] uppercase font-black tracking-widest shadow-sm">
                   {isAuthenticated ? role.toUpperCase() : 'GUEST'}
                </span>
              </div>
              <div className="text-[11px] text-[#6b7280] dark:text-gray-400 font-mono mt-1 font-semibold flex flex-col items-end">
                <span className="text-[14px] text-gray-800 dark:text-gray-200 tracking-wider mb-0.5">{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit', second:'2-digit' })}</span>
                <span>{formatBSDate(currentTime)}<span className="hidden lg:inline"> | {academicYearString}</span></span>
              </div>
            </div>
            <div className="relative border-l border-gray-200 dark:border-slate-800 pl-3 md:pl-4 lg:pl-6 ml-1 md:ml-2">
              <button 
                onClick={() => {
                  setIsProfileOpen(!isProfileOpen);
                  setIsBellOpen(false);
                }} 
                className="w-10 h-10 rounded-full bg-[#f3f4f6] dark:bg-slate-800 flex items-center justify-center border border-[#e5e7eb] dark:border-slate-700 overflow-hidden shadow-sm hover:ring-2 hover:ring-primary/20 transition-all font-bold"
                aria-label="User Profile"
                title="User Profile"
              >
                {avatarUrl ? (
                   <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                   <User className="w-5 h-5 text-[#6b7280] dark:text-gray-300" />
                )}
              </button>

              {isProfileOpen && (
                <div className="absolute top-12 right-0 w-60 z-50">
                  {renderProfileDropdown()}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 flex flex-col min-h-0 overflow-visible print:overflow-visible print:p-0 relative bg-[#F8FAFC] dark:bg-[#0b0f19]">
          <div className="sticky top-0 left-0 right-0 h-[3px] bg-slate-100/10 dark:bg-slate-800/10 z-50 print:hidden w-full">
            <motion.div 
              className="h-full bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-400"
              style={{ width: `${scrollProgress}%` }}
              transition={{ type: "spring", stiffness: 150, damping: 25 }}
            />
          </div>

          <div className="px-0 pb-24 sm:pb-5 w-full max-w-full min-w-0 flex-1 shrink-0 flex flex-col pt-3">
            <Breadcrumbs userRole={userRole} />
            <div className="w-full max-w-[1680px] mx-auto flex-1 px-3 sm:px-6 lg:px-8">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 15, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="w-full min-h-full flex flex-col flex-1"
              >
                <Outlet />
              </motion.div>
            </div>
          </div>

          {/* Institutional School Footer */}
          <Footer isAuthenticated={isAuthenticated} userRole={userRole} />
        </main>
      </div>

      {/* Mobile Sliding Drawer Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 bottom-0 left-0 w-[280px] bg-[var(--primary)] dark:bg-slate-950 text-white flex flex-col z-10 shadow-2xl overflow-hidden"
            >
              {/* Mobile Drawer Header */}
              <div className="p-4 flex items-center justify-between border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-white p-0.5 shadow flex items-center justify-center">
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-contain rounded-full" onError={(e) => { e.currentTarget.src = logoFallback; }} />
                  </div>
                  <div>
                    <div className="font-extrabold text-sm text-white">SHIKSHANTAR</div>
                    <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Academy Siraha</div>
                  </div>
                </div>
                <button onClick={() => setIsMenuOpen(false)} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* User Info */}
              <div className="px-4 py-3 bg-white/5 flex items-center gap-3 border-b border-white/10 shrink-0">
                <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center border border-white/20 overflow-hidden">
                  {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-white" />}
                </div>
                <div>
                  <div className="text-xs font-bold text-white">{isAuthenticated ? (userName || `Logged in as ${role}`) : 'Guest User'}</div>
                  <div className="text-[10px] text-slate-300 capitalize">{isAuthenticated ? role : 'Guest Portal'}</div>
                </div>
              </div>

              {/* Navigation Links */}
              <nav className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                {navigation.map((item, index) => {
                  const Icon = item.icon;
                  const showGroupHeader = index === 0 || navigation[index - 1].group !== item.group;
                  return (
                    <React.Fragment key={item.name}>
                      {showGroupHeader && (
                        <div className={`px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-white/50 ${index !== 0 ? 'mt-2 pt-2 border-t border-white/10' : ''}`}>
                          {item.group as string}
                        </div>
                      )}
                      <Link
                        to={item.href}
                        onClick={() => setIsMenuOpen(false)}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-3 transition-colors ${
                          location.pathname === item.href
                            ? 'bg-amber-500 text-slate-950 font-bold shadow'
                            : 'text-white/80 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.name}</span>
                      </Link>
                    </React.Fragment>
                  );
                })}
              </nav>

              {/* Academic Year Footer */}
              <div className="p-3 border-t border-white/10 bg-slate-950/40 text-center shrink-0">
                <div className="text-[10px] text-white/60 uppercase font-bold">Academic Year</div>
                <div className="text-xs font-bold text-amber-300">{academicYearString}</div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Click outside backdrop for notification and profile dropdowns */}
      {(isBellOpen || isProfileOpen) && (
        <div 
          className="fixed inset-0 z-40 bg-black/5 dark:bg-black/20" 
          onClick={() => {
            setIsBellOpen(false);
            setIsProfileOpen(false);
          }} 
        />
      )}



      {/* Scroll to Top with Circular Progress */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              if (mainRef.current) {
                mainRef.current.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            className="fixed bottom-24 right-6 z-50 p-2.5 rounded-full bg-white dark:bg-slate-800 text-orange-500 hover:text-orange-600 shadow-xl border border-gray-100 dark:border-slate-800 flex items-center justify-center cursor-pointer group transition-colors print:hidden"
            title="Scroll to top"
          >
            <div className="relative w-7 h-7 flex items-center justify-center">
              <svg className="absolute transform -rotate-90 w-full h-full">
                <circle
                  cx="14"
                  cy="14"
                  r="12"
                  className="stroke-gray-100 dark:stroke-slate-700/60 fill-none"
                  strokeWidth="2.5"
                />
                <circle
                  cx="14"
                  cy="14"
                  r="12"
                  className="stroke-orange-500 fill-none transition-all duration-100"
                  strokeWidth="2.5"
                  strokeDasharray={`${2 * Math.PI * 12}`}
                  strokeDashoffset={`${2 * Math.PI * 12 * (1 - scrollProgress / 100)}`}
                />
              </svg>
              <ChevronUp className="w-4 h-4 text-orange-500 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </motion.button>
        )}
      </AnimatePresence>
      


      {/* Floating interactive WhatsApp Support Widget */}
      <WhatsAppWidget />
      
      {/* Floating global Calculator Widget - Admin Only */}
      {isAuthenticated && role === 'admin' && (
        <CalculatorWidget />
      )}

      {/* Nepalese Government-style Official Notice Popup Overlay */}
      <AnimatePresence>
        {showNoticePopup && popupNotice && (
          <NoticePopup
            notice={popupNotice}
            popupTimer={popupTimer}
            onClose={() => dismissNotice(popupNotice.id)}
            fullScreenBlock={false}
          />
        )}
      </AnimatePresence>

      {/* Custom Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLogoutConfirm(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            
            {/* Modal Card */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-800 p-6 overflow-hidden z-10"
            >
              {/* Decorative Accent Bar */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" />
              
              <div className="flex flex-col items-center text-center mt-2">
                {/* Logout Warning Circle */}
                <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center text-red-500 dark:text-red-400 mb-4">
                  <LogOut className="w-6 h-6" />
                </div>
                
                <h3 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-2">
                  Confirm Logout
                </h3>
                
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium leading-relaxed max-w-xs mb-6">
                  Are you sure you want to log out of your <span className="font-bold text-gray-700 dark:text-gray-200">Shikshantar Academy</span> portal session? Any unsaved changes will be lost.
                </p>
                
                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 w-full">
                  <button
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer text-center"
                  >
                    No, Cancel
                  </button>
                  <button
                    onClick={() => {
                      setShowLogoutConfirm(false);
                      handleLogout();
                    }}
                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-red-500/10 cursor-pointer text-center"
                  >
                    Yes, Log Out
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
