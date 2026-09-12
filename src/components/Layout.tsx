import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { formatBSDate, getBSYearMonthDate } from '../lib/nepaliDate';
import { Menu, X, Home, Building, Image, Calendar, User, FileText, LogOut, LogIn, Info, Settings, Upload, CreditCard, Shield, Bell, Megaphone, Check, Users, MapPin, Phone, HelpCircle, GraduationCap, Award, Wallet, Sun, Moon, ChevronUp, Facebook, Globe, Mail, SmilePlus } from 'lucide-react';
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
import logoImageSrc from '../assets/logo.png';

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
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = React.useRef<HTMLDivElement>(null);
  
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
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
    if (window.innerWidth < 1024) {
      window.scrollTo({ top: 0, behavior: 'instant' as any });
    }
    setScrollProgress(0);
    setShowScrollTop(false);
    setIsHeaderScrolled(false);
  }, [location.pathname]);

  // Handle global page-level scroll for mobile and tablet devices
  useEffect(() => {
    const handleGlobalScroll = () => {
      if (window.innerWidth < 1024) {
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
      }
    };

    window.addEventListener('scroll', handleGlobalScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleGlobalScroll);
  }, []);

  // Prevent background body scroll when navigation menu, notification bell, or profile menu is open
  useEffect(() => {
    if (isMenuOpen || isBellOpen || isProfileOpen) {
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
  }, [isMenuOpen, isBellOpen, isProfileOpen]);

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
  const combinedBellItems = [
    ...pendingAdmissions.map(a => ({
      id: a.id,
      title: `Admission Request: ${a.studentName || 'Student'}`,
      priority: 'Urgent',
      date: a.submittedAt?.toDate?.()?.toISOString() || a.submittedAt || new Date().toISOString(),
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
      date: e.createdAt || new Date().toISOString(),
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
      date: al.createdAt || new Date().toISOString(),
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
      date: n.timestamp?.toDate?.()?.toISOString() || new Date().toISOString()
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
    } else if (role === 'bill_generator') {
      nav.push({ name: 'Fee Management', href: '/account-admin', icon: CreditCard, group: 'Administration', originalIndex: nav.length });
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
       window.dispatchEvent(new Event('localReadsChanged'));
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
    window.dispatchEvent(new Event('localReadsChanged'));
    setIsBellOpen(false); // Always close the dropdown immediately

    if (updates.length > 0) {
      Promise.all(updates).catch(err => {
        console.warn("Error marking all as read:", err);
      });
    }
  };

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
    <div className={`min-h-screen lg:h-screen lg:h-[100dvh] lg:max-h-screen lg:max-h-[100dvh] w-full flex lg:flex-row flex-col bg-[#f3f4f6] dark:bg-[#0b0f19] text-[#1f2937] dark:text-[#f8fafc] font-sans print:h-auto print:bg-white print:relative print:inset-auto lg:overflow-hidden ${(isMenuOpen || isBellOpen || isProfileOpen) ? 'h-screen max-h-screen overflow-hidden' : 'overflow-visible'}`}>
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
        className={`flex-1 flex flex-col min-w-0 min-h-0 h-auto lg:h-full lg:max-h-full print:h-auto print:overflow-visible relative ${(isMenuOpen || isBellOpen || isProfileOpen) ? 'overflow-hidden lg:overflow-hidden' : 'overflow-visible lg:overflow-y-auto lg:overflow-x-hidden custom-scrollbar'}`}
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
             {/* Mobile Right Date/Time */}
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
             <button onClick={() => setIsBellOpen(!isBellOpen)} className="relative p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0">
                <Bell className="w-5 h-5" />
                {unreadUrgentCount > 0 && (
                   <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 rounded-full text-[9px] font-bold flex items-center justify-center border border-primary text-white">
                      {unreadUrgentCount}
                   </span>
                )}
             </button>
             
             <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="w-7.5 h-7.5 rounded-full bg-white/20 flex items-center justify-center border border-white/30 overflow-hidden hover:ring-2 hover:ring-white/50 transition-all shadow-sm shrink-0">
                {avatarUrl ? (
                   <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                   <User className="w-3.5 h-3.5 text-white" />
                )}
             </button>
             
             {isProfileOpen && (
               <div className="fixed top-[52px] right-2 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-100 dark:border-slate-800 z-[60] overflow-hidden flex flex-col py-1 text-gray-800 dark:text-gray-200 lg:hidden animate-in fade-in duration-150">
                   {isAuthenticated ? (
                     <>
                       <Link 
                         to="/profile" 
                         onClick={() => setIsProfileOpen(false)} 
                         className="px-4 py-2.5 text-sm font-bold hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center gap-3 transition-colors text-gray-800 dark:text-gray-200"
                       >
                           <User className="w-4 h-4 text-gray-400" />
                           My Profile
                       </Link>
                       <button 
                         onClick={() => { setShowLogoutConfirm(true); setIsProfileOpen(false); }} 
                         className="px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-3 text-left w-full transition-colors border-t border-gray-100 dark:border-slate-800"
                       >
                           <LogOut className="w-4 h-4" />
                           Logout
                       </button>
                     </>
                   ) : (
                     <button 
                       onClick={() => { navigate('/login'); setIsProfileOpen(false); }} 
                       className="px-4 py-2.5 text-sm font-bold text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 flex items-center gap-3 text-left w-full transition-colors"
                     >
                         <LogIn className="w-4 h-4" />
                         Login
                     </button>
                   )}
               </div>
             )}

             <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0">
               {isMenuOpen ? <X className="w-5 h-5"/> : <Menu className="w-5 h-5"/>}
             </button>
          </div>
        </div>

     {isBellOpen && (
       <div className="fixed top-[52px] right-2 w-72 sm:w-80 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-800 z-[60] lg:hidden overflow-hidden flex flex-col animate-in fade-in duration-150 max-h-[calc(100dvh-70px)]">
         <div className="p-3 bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
            <span className="font-bold text-[0.8rem] text-gray-700 dark:text-gray-200 uppercase tracking-wide">Notifications</span>
            {unreadUrgentCount > 0 && (
               <button 
                 type="button"
                 onClick={(e) => { e.preventDefault(); e.stopPropagation(); markAllAsRead(); }}
                 className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 uppercase tracking-tighter bg-blue-50 dark:bg-blue-950/40 px-2 py-1 rounded-md"
               >
                  Mark all read
               </button>
            )}
         </div>
         <div className="max-h-80 overflow-y-auto pt-4 pb-2 px-1 custom-scrollbar">
             {combinedBellItems.length > 0 ? combinedBellItems.map(n => (
               <div key={n.id} onClick={(e) => { 
                  setIsBellOpen(false); 
                  const notificationType = n.isAdmission ? 'admission' : n.isEnquiry ? 'enquiry' : n.isAlumni ? 'alumni' : 'notice';
                  navigate(n.href || '/notices'); 
                  markAsRead(n.id, notificationType, e, false); 
               }} className="block p-3 border-b border-gray-50 hover:text-primary cursor-pointer group relative">
                  <div className="flex justify-between items-center mb-1.5 pr-8">
                     <span className={`text-[9px] leading-tight font-bold px-1.5 py-0.5 rounded uppercase flex items-center h-4 border border-current/10 ${n.priority === 'Urgent' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{n.isAdmission ? 'Admission' : n.priority}</span>
                     {(!n.readBy || !n.readBy.includes(auth.currentUser?.uid || studentId || 'guest')) && !localReads.includes(n.id) && <span className="w-2.5 h-2.5 bg-blue-500 rounded-full shadow-sm ring-2 ring-white"></span>}
                  </div>
                  <p className="font-bold text-[0.8rem] text-gray-800 dark:text-gray-200 line-clamp-2 pr-10 leading-snug">{n.title}</p>
                  
                  {(!n.readBy || !n.readBy.includes(auth.currentUser?.uid || studentId || 'guest')) && !localReads.includes(n.id) && (
                      <button 
                         type="button"
                         onClick={(e) => {
                             const notificationType = n.isAdmission ? 'admission' : n.isEnquiry ? 'enquiry' : n.isAlumni ? 'alumni' : 'notice';
                             markAsRead(n.id, notificationType, e);
                          }}
                         className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white hover:bg-blue-600 text-blue-500 hover:text-white rounded-full transition-all z-10 border border-blue-100 shadow-sm"
                         title="Mark as read"
                      >
                         <Check className="w-4 h-4" />
                      </button>
                  )}
               </div>
            )) : <div className="p-8 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
                   <Bell className="w-8 h-8 opacity-20" />
                   No notifications
                 </div>}
         </div>
         <div className="p-2 text-primary text-center border-t border-gray-100">
            <Link to="/notices" onClick={() => setIsBellOpen(false)} className="text-sm font-bold text-blue-600 hover:text-blue-800 w-full text-center block outline-none">Open Notice Board</Link>
         </div>
      </div>
    )}

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="lg:hidden bg-[var(--primary)] dark:bg-slate-950 text-white fixed top-[56px] bottom-0 left-0 right-0 md:left-auto md:right-0 md:w-[350px] h-[calc(100dvh-56px)] z-[100] border-t md:border-t-0 md:border-l border-white/10 shadow-2xl overflow-y-auto overscroll-y-contain pb-32 md:pb-40 custom-scrollbar">
            {/* Mobile WhatsApp Quick Action Card */}
            <div className="px-5 pt-4 pb-2">
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  window.dispatchEvent(new Event('openWhatsAppDesk'));
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white shadow-lg transition-all active:scale-[0.98] border border-emerald-400/30"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white text-emerald-600 flex items-center justify-center shrink-0 shadow-sm">
                    <svg className="w-4.5 h-4.5 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512">
                      <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L3 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold leading-tight">Chat with Us on WhatsApp</div>
                    <div className="text-[10px] text-emerald-100 font-medium">Admissions & Accounts Desk</div>
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full font-bold">
                  Open
                </span>
              </button>
            </div>

            <ul className="list-none p-0 m-0 mt-2">
              {navigation.map((item, index) => {
                const Icon = item.icon;
                const showGroupHeader = index === 0 || navigation[index - 1].group !== item.group;
                return (
                   <React.Fragment key={item.name}>
                    {showGroupHeader && (
                      <li className={`px-6 py-2 text-[0.7rem] font-bold uppercase tracking-[1px] text-white/50 bg-[var(--primary)] dark:bg-slate-950 sticky top-0 z-10 ${index !== 0 ? 'mt-2 border-t border-white/10 pt-4' : ''}`}>
                        {item.group as string}
                      </li>
                    )}
                    <li>
                      <Link
                        to={item.href}
                        onClick={() => setIsMenuOpen(false)}
                        className={`flex items-center gap-3 px-6 py-3.5 text-[0.95rem] transition-all border-l-4 ${ 
                          location.pathname === item.href 
                            ? 'bg-amber-500 text-slate-950 font-bold border-amber-600' 
                            : 'border-transparent active:bg-white/5' 
                        }`}
                      >
                        <Icon className="w-5 h-5 opacity-80" />
                        {item.name}
                      </Link>
                    </li>
                  </React.Fragment>
                );
              })}
               {isAuthenticated ? (
                  <li className="mt-4 border-t border-white/10 pt-2">
                    <button onClick={() => { setShowLogoutConfirm(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 text-left px-6 py-3.5 text-[0.95rem] text-[#fca5a5] border-l-4 border-transparent active:bg-white/5">
                      <LogOut className="w-5 h-5 opacity-80" />
                      Logout
                    </button>
                  </li>
              ) : (
                <li className="mt-4 border-t border-white/10 pt-2">
                  <Link to="/login" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-6 py-3.5 text-[0.95rem] border-l-4 border-transparent active:bg-white/5">
                    <LogIn className="w-5 h-5 opacity-80" />
                    Login to Portal
                  </Link>
                </li>
              )}
              {/* Extra spacing block specifically to guarantee scrolling capacity on tablets/mobiles */}
              <li className="h-20 md:h-28 shrink-0" aria-hidden="true" />
            </ul>
          </div>
        )}

        {/* Header */}
        <header className={`bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-5 flex justify-between items-center shrink-0 z-30 hidden lg:flex print:hidden sticky top-0 transition-all duration-300 ${isHeaderScrolled ? 'shadow-md border-b border-orange-500/30' : 'shadow-[0_1px_3px_rgba(0,0,0,0.05)] border-b dark:border-slate-800'}`}>
          {role === 'admin' && location.pathname === '/' ? (
             <div className="flex items-center gap-3">
               <img src={logoUrl} alt="Logo" className="w-10 h-10 object-contain rounded-full border border-gray-200 shadow-sm" fetchPriority="high" />
               <div className="flex flex-col justify-center">
                  <h1 className="text-base font-bold text-primary dark:text-white leading-none mb-1">Shikshantar Academy | Siraha</h1>
                  <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest leading-none">Admin Control Panel</p>
               </div>
             </div>
          ) : (
            <div className="text-[1.2rem] font-bold text-[#1f2937] dark:text-white">
              {navigation.find(n => n.href === location.pathname)?.name || 'Portal'}
            </div>
          )}
          <div className="flex items-center gap-2 md:gap-4 lg:gap-6">
            <button 
              onClick={toggleThemeMode} 
              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors flex items-center justify-center text-gray-700 dark:text-gray-200"
              title={themeMode === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
               {themeMode === 'dark' ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-gray-600" />}
            </button>
            <div className="relative">
               <button onClick={() => setIsBellOpen(!isBellOpen)} className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors relative">
                  <Bell className="w-5 h-5 text-gray-700 dark:text-gray-200" />
                  {unreadUrgentCount > 0 && (
                     <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-slate-900 text-white">
                        {unreadUrgentCount}
                     </span>
                  )}
               </button>
               {isBellOpen && (
                 <div className="absolute top-12 right-0 w-80 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-800 z-50 overflow-hidden flex flex-col">
                    <div className="p-3 bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
                       <span className="font-bold text-[0.8rem] text-gray-700 dark:text-gray-200 uppercase tracking-wide">Notifications</span>
                       {unreadUrgentCount > 0 && (
                          <button 
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); markAllAsRead(); }}
                            className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 uppercase tracking-wider bg-blue-50 dark:bg-blue-950/40 px-2 py-1 rounded-md"
                          >
                             Mark all read
                          </button>
                       )}
                    </div>
                    <div className="max-h-80 overflow-y-auto pt-4 pb-2 px-1 custom-scrollbar">
                       {combinedBellItems.length > 0 ? combinedBellItems.map(n => (
                          <div key={n.id} onClick={(e) => { setIsBellOpen(false); navigate(n.href || '/notices'); const notificationType = n.isAdmission ? 'admission' : n.isEnquiry ? 'enquiry' : n.isAlumni ? 'alumni' : 'notice'; markAsRead(n.id, notificationType, e, false); }} className="block p-3 border-b border-gray-50 dark:border-slate-800 hover:text-primary dark:hover:text-blue-400 cursor-pointer group relative animate-in fade-in duration-150">
                             <div className="flex justify-between items-center mb-2 pr-10">
                                <span className={`text-[9px] leading-none font-bold px-1.5 py-0.5 rounded uppercase flex items-center h-4 border border-current/10 ${
                                  n.priority === 'Urgent' ? 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400' : 
                                  n.priority === 'Enquiry' ? 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400' :
                                  n.priority === 'Alumni' ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400' : 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
                               }`}>{n.priority}</span>
                                {(!n.readBy || !n.readBy.includes(auth.currentUser?.uid || studentId || 'guest')) && !localReads.includes(n.id) && <span className="w-2.5 h-2.5 bg-blue-500 rounded-full shadow-sm ring-2 ring-white dark:ring-slate-900"></span>}
                             </div>
                             <p className="font-bold text-[0.8rem] text-gray-800 dark:text-gray-200 line-clamp-2 pr-10 leading-snug">{n.title}</p>

                             {(!n.readBy || !n.readBy.includes(auth.currentUser?.uid || studentId || 'guest')) && !localReads.includes(n.id) && (
                                <button 
                                   type="button"
                                   onClick={(e) => {
                             const notificationType = n.isAdmission ? 'admission' : n.isEnquiry ? 'enquiry' : n.isAlumni ? 'alumni' : 'notice';
                             markAsRead(n.id, notificationType, e);
                          }}
                                   className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-white dark:bg-slate-800 hover:bg-blue-600 text-blue-500 hover:text-white rounded-full transition-all scale-90 hover:scale-100 z-10 border border-blue-100 dark:border-slate-700 shadow-sm"
                                   title="Mark as read"
                                >
                                   <Check className="w-4 h-4" />
                                </button>
                             )}
                          </div>
                       )) : <div className="p-8 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
                              <Bell className="w-8 h-8 opacity-20" />
                              No recent notifications
                            </div>}
                    </div>
                    <div className="p-3 text-primary text-center border-t border-gray-100 dark:border-slate-800">
                       <Link to="/notices" onClick={() => setIsBellOpen(false)} className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 w-full text-center block outline-none">Open Notice Board</Link>
                    </div>
                 </div>
               )}
            </div>
            
            <div className="text-right">
              <div className="text-[0.8rem] font-bold flex items-center justify-end gap-2 text-[#1f2937] dark:text-gray-100">
                {isAuthenticated ? (
                   <span className="px-2.5 py-0.5 rounded-full bg-primary text-white text-[10px] uppercase font-black tracking-widest shadow-sm">
                      {role.toUpperCase()}
                   </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-gray-500 text-white text-[10px] uppercase font-black tracking-widest shadow-sm">
                     GUEST USER
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[#6b7280] dark:text-gray-400 font-mono mt-1 font-semibold flex flex-col items-end">
                <span className="text-[14px] text-gray-800 dark:text-gray-200 tracking-wider mb-0.5">{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit', second:'2-digit' })}</span>
                <span>{formatBSDate(currentTime)}<span className="hidden lg:inline"> | {academicYearString}</span></span>
              </div>
            </div>
            <div className="relative border-l border-gray-200 dark:border-slate-800 pl-3 md:pl-4 lg:pl-6 ml-1 md:ml-2">
              <button 
                onClick={() => setIsProfileOpen(!isProfileOpen)} 
                className="w-10 h-10 rounded-full bg-[#f3f4f6] dark:bg-slate-800 flex items-center justify-center border border-[#e5e7eb] dark:border-slate-700 overflow-hidden shadow-sm hover:ring-2 hover:ring-primary/20 transition-all font-bold"
              >
                {avatarUrl ? (
                   <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                   <User className="w-5 h-5 text-[#6b7280] dark:text-gray-300" />
                )}
              </button>

              {isProfileOpen && (
                <div className="absolute top-12 right-0 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-100 dark:border-slate-800 z-50 overflow-hidden flex flex-col py-1 animate-in slide-in-from-top-2 duration-150">
                    {isAuthenticated ? (
                      <>
                        <Link 
                          to="/profile" 
                          onClick={() => setIsProfileOpen(false)} 
                          className="px-4 py-2.5 text-sm font-bold text-gray-750 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center gap-3 transition-colors"
                        >
                            <User className="w-4 h-4 text-gray-400" />
                            My Profile
                        </Link>
                        <button 
                          onClick={() => { setShowLogoutConfirm(true); setIsProfileOpen(false); }} 
                          className="px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 flex items-center gap-3 text-left w-full transition-colors border-t border-gray-100 dark:border-slate-800"
                        >
                            <LogOut className="w-4 h-4" />
                            Logout
                        </button>
                      </>
                    ) : (
                      <button 
                        onClick={() => { navigate('/login'); setIsProfileOpen(false); }} 
                        className="px-4 py-2.5 text-sm font-bold text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20 flex items-center gap-3 text-left w-full transition-colors"
                      >
                          <LogIn className="w-4 h-4" />
                          Login
                      </button>
                    )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 flex flex-col min-h-0 overflow-visible print:overflow-visible print:p-0 relative bg-[#F8FAFC] dark:bg-[#0b0f19]">
          {/* Sticky Scroll Progress Bar */}
          <div className="sticky top-0 left-0 right-0 h-[3px] bg-slate-100/10 dark:bg-slate-800/10 z-50 print:hidden w-full">
            <motion.div 
              className="h-full bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-400"
              style={{ width: `${scrollProgress}%` }}
              transition={{ type: "spring", stiffness: 150, damping: 25 }}
            />
          </div>

          <div className={`px-0 pb-24 sm:pb-5 w-full max-w-full min-w-0 flex-1 shrink-0 flex flex-col ${location.pathname === '/' ? 'pt-0' : 'pt-3'}`}>
            <Breadcrumbs userRole={userRole} />
            <div className="max-w-6xl mx-auto w-full flex-1">
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

          {/* Professional Footer */}
          <footer className="bg-[#0f172a] text-white pt-10 pb-24 md:pb-12 lg:pb-10 shrink-0 print:hidden mt-auto border-t-[4px] border-primary relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 Mix-blend-overlay pointer-events-none"></div>

            <div className="max-w-6xl mx-auto px-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
              {/* Branding Section */}
              <div className="flex flex-col gap-4 md:col-span-2 lg:col-span-1">
                <div className="flex flex-col items-start gap-3">
                  <div className="w-16 h-16 bg-white rounded-full p-1.5 shadow-md shrink-0 flex items-center justify-center">
                    <img 
                      src={logoUrl} 
                      alt="Shikshantar Academy Logo" 
                      className="w-full h-full object-contain rounded-full" 
                      fetchPriority="high" 
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (target.src !== logoFallback) {
                          target.src = logoFallback;
                        }
                      }}
                    />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg tracking-wide leading-tight">SHIKSHANTAR</h3>
                    <p className="text-xs uppercase opacity-80 tracking-widest font-semibold">Academy | Siraha</p>
                  </div>
                </div>
                <p className="text-sm opacity-80 leading-relaxed max-w-sm mt-2">
                  Empowering the next generation through quality education, character building, and excellence in all academic endeavors.
                </p>
              </div>

              {/* Quick Links */}
              <div>
                <h4 className="font-bold text-sm uppercase tracking-widest opacity-80 mb-4 border-b border-white/20 pb-2 inline-block">Quick Links</h4>
                <ul className="space-y-2 text-sm opacity-90 font-medium">
                  <li><Link to="/about" className="hover:bg-white hover:text-[#1a2744] px-3 py-1.5 rounded-lg -ml-3 transition-colors flex items-center gap-2 w-fit"><span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full inline-block"></span> About Us</Link></li>
                  <li><Link to="/admission" className="hover:bg-white hover:text-[#1a2744] px-3 py-1.5 rounded-lg -ml-3 transition-colors flex items-center gap-2 w-fit"><span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full inline-block"></span> Admission Form</Link></li>
                  <li><Link to="/notices" className="hover:bg-white hover:text-[#1a2744] px-3 py-1.5 rounded-lg -ml-3 transition-colors flex items-center gap-2 w-fit"><span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full inline-block"></span> Notice Board</Link></li>
                  <li><Link to="/gallery" className="hover:bg-white hover:text-[#1a2744] px-3 py-1.5 rounded-lg -ml-3 transition-colors flex items-center gap-2 w-fit"><span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full inline-block"></span> Photo Gallery</Link></li>
                  <li><Link to="/alumni" className="hover:bg-white hover:text-[#1a2744] px-3 py-1.5 rounded-lg -ml-3 transition-colors flex items-center gap-2 w-fit"><span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full inline-block"></span> Alumni / Success</Link></li>
                  <li><Link to="/faq" className="hover:bg-white hover:text-[#1a2744] px-3 py-1.5 rounded-lg -ml-3 transition-colors flex items-center gap-2 w-fit"><span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full inline-block"></span> FAQ</Link></li>
                  <li><Link to="/contact" className="hover:bg-white hover:text-[#1a2744] px-3 py-1.5 rounded-lg -ml-3 transition-colors flex items-center gap-2 w-fit"><span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full inline-block"></span> Contact Us</Link></li>

                </ul>
              </div>

              {/* Contact Info */}
              <div>
                <h4 className="font-bold text-sm uppercase tracking-widest opacity-60 mb-4 border-b border-white/20 pb-2 inline-block">Contact Us</h4>
                <ul className="space-y-3 justify-center text-sm opacity-90 mb-6">
                  <li className="flex items-start gap-3">
                    <Building className="w-5 h-5 text-[var(--accent)] shrink-0" />
                    <span>Location: Karjanha Municipality, Ward No. 05, Siraha, Madhesh Province, Nepal.</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Megaphone className="w-5 h-5 text-[var(--accent)] shrink-0" />
                    <span>Postal Code: 56500</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-[var(--accent)] shrink-0" />
                    <a 
                      href={typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? "mailto:academyshikshantar@gmail.com" : "https://mail.google.com/mail/?view=cm&fs=1&to=academyshikshantar@gmail.com"}
                      target={typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? undefined : "_blank"}
                      rel={typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? undefined : "noopener noreferrer"}
                      className="hover:underline hover:text-[var(--accent)] transition-colors break-all"
                    >
                      academyshikshantar@gmail.com
                    </a>
                  </li>
                  <li className="flex items-center gap-3 flex-wrap">
                    <Check className="w-5 h-5 text-[var(--accent)] shrink-0" />
                    <span>Dedicated to Bright Futures</span>
                    <div className="flex items-center gap-2 ml-1">
                      {socialData.facebookUrl && (
                        <a 
                          href={socialData.facebookUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="p-1.5 bg-white/10 hover:bg-[#1877F2] text-white rounded-full transition-all inline-flex items-center justify-center hover:scale-105" 
                          title="Facebook"
                          id="footer-facebook-btn"
                        >
                          <Facebook className="w-4 h-4" />
                        </a>
                      )}
                      {socialData.websiteUrl && (
                        <a 
                          href={socialData.websiteUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="p-1.5 bg-white/10 hover:bg-gray-800 text-white rounded-full transition-all inline-flex items-center justify-center hover:scale-105" 
                          title="Website"
                          id="footer-website-btn"
                        >
                          <Globe className="w-4 h-4" />
                        </a>
                      )}

                    </div>
                  </li>
                </ul>
                <a 
                  href="https://maps.app.goo.gl/Ykri7uu78Y22NVjd6" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="inline-flex items-center gap-2 bg-white text-[var(--primary)] px-5 py-2.5 rounded-lg text-sm font-bold shadow-md hover:bg-gray-100 transition-colors active:scale-95"
                >
                  <MapPin className="w-4 h-4" />
                  Find Us
                </a>
              </div>
            </div>

            <div className="max-w-6xl mx-auto px-5 mt-10 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
              <p className="text-xs opacity-60 font-medium">
                &copy; {new Date().getFullYear()} Shikshantar Academy, Siraha. All rights reserved.
              </p>

              {/* Brand Social Icons at Bottom */}
              <div className="flex flex-wrap items-center gap-3">
                {socialData.instagramUrl && (
                  <a href={socialData.instagramUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-white/10 hover:bg-[#E1306C] text-white rounded-full transition-all" title="Instagram">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                    </svg>
                  </a>
                )}
                {socialData.tiktokUrl && (
                  <a href={socialData.tiktokUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-white/10 hover:bg-black text-white rounded-full transition-all" title="TikTok">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.92-1.88 2.63-5.31 3.49-8.15 2.23-2.33-1.01-3.87-3.41-3.85-5.93.01-2.58 1.66-4.98 4.13-5.75 1.14-.37 2.37-.3 3.53.11v4.07c-.72-.37-1.57-.45-2.33-.22-1.01.27-1.72 1.2-1.74 2.24-.03 1.34 1.15 2.45 2.48 2.42 1.15-.01 2.11-.88 2.22-2.02.03-.51.01-1.02.01-1.53V0z"/>
                    </svg>
                  </a>
                )}
                {socialData.whatsappNumber && (
                  <a href={`https://wa.me/${socialData.whatsappNumber.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="p-2 bg-white/10 hover:bg-[#25D366] text-white rounded-full transition-all" title="WhatsApp">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.262 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.5-5.729-1.448L0 24zm6.59-4.017c1.52.902 3.022 1.378 4.819 1.379 5.51.001 9.985-4.475 9.988-9.986.002-2.67-1.035-5.18-2.915-7.06C16.651 2.436 14.145 1.399 11.48 1.4 5.973 1.4 1.498 5.875 1.495 11.387c-.001 1.902.5 3.752 1.448 5.333L1.93 21.93l5.064-1.329zM16.92 14.34c-.297-.15-1.758-.868-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    </svg>
                  </a>
                )}
              </div>
            </div>
          </footer>
        </main>
      </div>
      
      {/* Click outside logic for bell dropdown (Simplified) */}
      {isBellOpen && (
         <div className="fixed inset-0 z-10" onClick={() => setIsBellOpen(false)}></div>
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
