import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';

import NepaliDate from 'nepali-date-converter';

export interface Notice {
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
  timestamp?: any;
}

interface NoticeContextType {
  notices: Notice[];
  unreadNoticesCount: number;
  latestUnreadNotice: Notice | null;
  showNoticePopup: boolean;
  setShowNoticePopup: (show: boolean) => void;
  triggerNoticePopup: (notice: Notice) => void;
  popupTimer: number;
  setPopupTimer: React.Dispatch<React.SetStateAction<number>>;
  mainContentBlocked: boolean;
  dismissNotice: (noticeId: string) => Promise<void>;
  loading: boolean;
  role: string;
  studentClass: string;
}

const NoticeContext = createContext<NoticeContextType | undefined>(undefined);

const isWithinOneWeek = (notice: Notice): boolean => {
  let createdDate: Date | null = null;
  
  if (notice.timestamp) {
    if (typeof notice.timestamp === 'string') {
      createdDate = new Date(notice.timestamp);
    } else if (typeof notice.timestamp.toDate === 'function') {
      createdDate = notice.timestamp.toDate();
    } else if (notice.timestamp.seconds !== undefined) {
      createdDate = new Date(notice.timestamp.seconds * 1000);
    }
  }
  
  if (!createdDate && notice.date) {
    try {
      const dStr = notice.date.split('T')[0];
      const year = parseInt(dStr.substring(0, 4), 10);
      if (year > 2040) {
        // Bikram Sambat format e.g. 2081-11-15 or 2082/05/12
        const parts = dStr.split(/[-/]/).map(Number);
        if (parts.length === 3) {
          const nd = new NepaliDate(parts[0], parts[1] - 1, parts[2]);
          createdDate = nd.toJsDate();
        }
      } else {
        createdDate = new Date(notice.date);
      }
    } catch {
      createdDate = new Date(notice.date);
    }
  }
  
  // If date calculation is unknown or invalid, treat notice as active
  if (!createdDate || isNaN(createdDate.getTime())) {
    return true; 
  }
  
  const now = new Date();
  const diffTime = now.getTime() - createdDate.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  
  // Notice is within 7 days (or published for today/recent)
  return diffDays <= 7.0;
};

export function NoticeProvider({ children }: { children: React.ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [role, setRole] = useState<string>(() => localStorage.getItem('userRole') || 'student');
  const [studentClass, setStudentClass] = useState<string>(() => localStorage.getItem('studentClass') || '');
  const [loading, setLoading] = useState(true);

  // Popup states
  const [showNoticePopup, setShowNoticePopup] = useState(false);
  const [latestUnreadNotice, setLatestUnreadNotice] = useState<Notice | null>(null);
  const [popupTimer, setPopupTimer] = useState(0);
  const [mainContentBlocked, setMainContentBlocked] = useState(false);

  // Local read receipts from localStorage
  const [localReads, setLocalReads] = useState<string[]>([]);

  const triggerNoticePopup = (notice: Notice) => {
    setLatestUnreadNotice(notice);
    setShowNoticePopup(true);
    setPopupTimer(notice.priority === 'Urgent' ? 2 : 0);
  };

  useEffect(() => {
    const handleStorageOrCustom = () => {
      try {
        const reads = JSON.parse(localStorage.getItem('localReadNotices') || '[]');
        setLocalReads(reads);
      } catch (e) {
        console.error(e);
      }
    };
    handleStorageOrCustom();
    window.addEventListener('localReadsChanged', handleStorageOrCustom);
    window.addEventListener('storage', handleStorageOrCustom);
    return () => {
      window.removeEventListener('localReadsChanged', handleStorageOrCustom);
      window.removeEventListener('storage', handleStorageOrCustom);
    };
  }, []);

  // Listen to Auth State changes to load role & class
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Fetch role and class from Firestore
        getDoc(doc(db, 'users', user.uid))
          .then((userDoc) => {
            if (userDoc.exists()) {
              const data = userDoc.data();
              const fetchedRole = data.role || 'student';
              const fetchedClass = data.class || data.studentClass || (data.children?.[0]?.studentClass) || '';
              
              setRole(fetchedRole);
              setStudentClass(fetchedClass);
              localStorage.setItem('userRole', fetchedRole);
              if (fetchedClass) {
                localStorage.setItem('studentClass', fetchedClass);
              }
            }
          })
          .catch((e) => console.warn('NoticeContext: error loading user profile', e));
      } else {
        setRole('student');
        setStudentClass('');
      }
    });

    return () => unsubAuth();
  }, []);

  // Real-time listener for notices
  useEffect(() => {
    let q = query(collection(db, 'notices'), orderBy('date', 'desc'));

    const unsubNotices = onSnapshot(
      q,
      (snap) => {
        let fetched = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Notice[];

        // Filter only Published notices
        fetched = fetched.filter((n) => n.status === 'Published');

        // Apply role and targets filtering (admin sees all)
        const currentUserId = auth.currentUser?.uid;
        if (role !== 'admin') {
          if (role === 'teacher') {
            fetched = fetched.filter(
              (n) => Array.isArray(n.targets) && (n.targets.includes('All') || n.targets.includes('Teachers Only'))
            );
          } else if (role === 'student' && currentUserId) {
            fetched = fetched.filter(
              (n) =>
                Array.isArray(n.targets) &&
                (n.targets.includes('All') ||
                  n.targets.includes('Students Only') ||
                  (studentClass && n.targets.includes(`Class ${studentClass}`)))
            );
          } else {
            // Guest or logged out
            fetched = fetched.filter(
              (n) => Array.isArray(n.targets) && (n.targets.includes('All') || n.targets.includes('Guest User'))
            );
          }
        }

        setNotices(fetched);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'notices');
        setLoading(false);
      }
    );

    return () => unsubNotices();
  }, [role, studentClass]);

  // Determine unread status and trigger popup immediately on load for recently added notices to all (including admin)
  useEffect(() => {
    if (loading || notices.length === 0) {
      setShowNoticePopup(false);
      setLatestUnreadNotice(null);
      return;
    }

    const currentUserId = auth.currentUser?.uid || 'guest';

    // Find the latest unread notice published within the last 7 days
    const unreadRecentNotices = notices.filter((notice) => {
      // 1. Must be published within 7 days
      if (!isWithinOneWeek(notice)) return false;

      // 2. Must not be dismissed in current session
      const sessionDismissed = sessionStorage.getItem(`dismissed_notice_popup_${notice.id}_${currentUserId}`);
      if (sessionDismissed === 'true') return false;

      // 3. Must not be in local read history
      if (localReads.includes(notice.id)) return false;

      // 4. Must not be marked as read in Firestore for logged-in users
      if (auth.currentUser && Array.isArray(notice.readBy) && notice.readBy.includes(auth.currentUser.uid)) {
        return false;
      }

      return true;
    });

    if (unreadRecentNotices.length > 0) {
      const topNotice = unreadRecentNotices[0]; // Most recent due to descending date order
      setLatestUnreadNotice(topNotice);
      setShowNoticePopup(true);
      // 2-second acknowledgment timer for Urgent notices, immediate close for regular notices
      setPopupTimer(topNotice.priority === 'Urgent' ? 2 : 0);
    } else {
      setLatestUnreadNotice(null);
      setShowNoticePopup(false);
    }
  }, [notices, loading, localReads, role]);

  // Popup Timer countdown
  useEffect(() => {
    if (showNoticePopup && popupTimer > 0) {
      const interval = setInterval(() => {
        setPopupTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setMainContentBlocked(false); // Main content can now be shown after 2 seconds
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [showNoticePopup, popupTimer]);

  const dismissNotice = async (noticeId: string) => {
    const currentUserId = auth.currentUser?.uid || 'guest';
    
    // Mark as read locally in session storage
    sessionStorage.setItem(`dismissed_notice_popup_${noticeId}_${currentUserId}`, 'true');

    // Mark as read in localStorage
    try {
      const reads = JSON.parse(localStorage.getItem('localReadNotices') || '[]');
      if (!reads.includes(noticeId)) {
        const newReads = [...reads, noticeId];
        localStorage.setItem('localReadNotices', JSON.stringify(newReads));
        window.dispatchEvent(new Event('localReadsChanged'));
      }
    } catch (e) {
      console.error(e);
    }

    // Mark as read in Firestore if logged in
    if (auth.currentUser) {
      try {
        await updateDoc(doc(db, 'notices', noticeId), {
          readBy: arrayUnion(auth.currentUser.uid)
        });
      } catch (e) {
        console.warn('NoticeContext: failed to mark notice as read in Firestore', e);
      }
    }

    setShowNoticePopup(false);
    setMainContentBlocked(false);
  };

  const unreadNoticesCount = notices.filter(
    (n) => (!n.readBy || !n.readBy.includes(auth.currentUser?.uid || 'guest')) && !localReads.includes(n.id)
  ).length;

  return (
    <NoticeContext.Provider
      value={{
        notices,
        unreadNoticesCount,
        latestUnreadNotice,
        showNoticePopup,
        setShowNoticePopup,
        triggerNoticePopup,
        popupTimer,
        setPopupTimer,
        mainContentBlocked,
        dismissNotice,
        loading,
        role,
        studentClass,
      }}
    >
      {children}
    </NoticeContext.Provider>
  );
}

export function useNotices() {
  const context = useContext(NoticeContext);
  if (context === undefined) {
    throw new Error('useNotices must be used within a NoticeProvider');
  }
  return context;
}
