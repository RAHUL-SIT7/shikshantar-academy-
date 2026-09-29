import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { NoticeProvider } from "./contexts/NoticeContext";
import Layout from "./components/Layout";
import SessionTimeoutHandler from "./components/SessionTimeoutHandler";
import Home from "./pages/Home";
import About from "./pages/About";
import Facilities from "./pages/Facilities";
import Gallery from "./pages/Gallery";
import AcademicCalendar from "./pages/AcademicCalendar";
import Events from "./pages/Events";
import NoticeBoard from "./pages/NoticeBoard";
import ContactUs from "./pages/ContactUs";
import FAQ from "./pages/FAQ";
import Alumni from "./pages/Alumni";
import Account from "./pages/Account";
import AccountAdmin from "./pages/AccountAdmin";
import Result from "./pages/Result";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import Admission from "./pages/Admission";
import AdminAdmissions from "./pages/AdminAdmissions";
import UserApprovals from "./pages/UserApprovals";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import TeacherSalary from "./pages/TeacherSalary";
import SalaryAdmin from "./pages/SalaryAdmin";
import IemisExport from "./pages/Iemis";
import { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  arrayUnion,
} from "firebase/firestore";

import FeeStructure from "./pages/FeeStructure";

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Let Layout handle its own scroll container, this is for window level which might not be needed anymore
    // but keeping it safe.
    try { window.scrollTo(0, 0); } catch(e){}
  }, [pathname]);

  return null;
}

const localSessionId =
  localStorage.getItem("localSessionId") ||
  `sess_${Date.now().toString(36)}_${Math.floor(performance.now()).toString(36)}`;
localStorage.setItem("localSessionId", localSessionId);

export const THEMES: Record<string, any> = {
  shikshantar_elite: {
    name: "Shikshantar Elite",
    emoji: "🎓",
    primary: "#0A3D62",
    primaryDark: "#041C2E",
    primaryLight: "#1265A1",
    accent: "#F1C40F",
    accentHover: "#D4AC0D",
    preview: ["#0A3D62", "#F1C40F"],
  },
  classic: {
    name: "Shikshantar Classic",
    emoji: "🎓",
    primary: "#0A3D62",
    primaryDark: "#041C2E",
    primaryLight: "#1265A1",
    accent: "#F1C40F",
    accentHover: "#D4AC0D",
    preview: ["#0A3D62", "#F1C40F"],
  },
  oxford_gold: {
    name: "Oxford Blue",
    emoji: "🏛️",
    primary: "#0A2540",
    primaryDark: "#06182C",
    primaryLight: "#14375A",
    accent: "#FACC15",
    accentHover: "#EAB308",
    preview: ["#0A2540", "#FACC15"],
  },
  midnight_slate: {
    name: "Midnight Slate",
    emoji: "💻",
    primary: "#0F172A",
    primaryDark: "#020617",
    primaryLight: "#1E293B",
    accent: "#38BDF8",
    accentHover: "#0EA5E9",
    preview: ["#0F172A", "#38BDF8"],
  },
  corporate_indigo: {
    name: "Corporate Indigo",
    emoji: "🏢",
    primary: "#312E81",
    primaryDark: "#1E1B4B",
    primaryLight: "#4338CA",
    accent: "#10B981",
    accentHover: "#059669",
    preview: ["#312E81", "#10B981"],
  },
  classic_forest: {
    name: "Classic Forest",
    emoji: "🌲",
    primary: "#064E3B",
    primaryDark: "#022C22",
    primaryLight: "#065F46",
    accent: "#F59E0B",
    accentHover: "#D97706",
    preview: ["#064E3B", "#F59E0B"],
  },
  graphite_crimson: {
    name: "Graphite Crimson",
    emoji: "🔴",
    primary: "#1C1917",
    primaryDark: "#0C0A09",
    primaryLight: "#292524",
    accent: "#E11D48",
    accentHover: "#BE123C",
    preview: ["#1C1917", "#E11D48"],
  },
  sapphire_clean: {
    name: "Sapphire Clean",
    emoji: "💎",
    primary: "#0C4A6E",
    primaryDark: "#082F49",
    primaryLight: "#0369A1",
    accent: "#00F5D4",
    accentHover: "#00D2B4",
    preview: ["#0C4A6E", "#00F5D4"],
  },
  monochrome: {
    name: "Monochrome Minimal",
    emoji: "🎹",
    primary: "#171717",
    primaryDark: "#0A0A0A",
    primaryLight: "#262626",
    accent: "#9CA3AF",
    accentHover: "#6B7280",
    preview: ["#171717", "#9CA3AF"],
  },
  royal_amethyst: {
    name: "Royal Amethyst",
    emoji: "🔮",
    primary: "#4C1D95",
    primaryDark: "#2E1065",
    primaryLight: "#5B21B6",
    accent: "#F472B6",
    accentHover: "#DB2777",
    preview: ["#4C1D95", "#F472B6"],
  },
  terracotta_sunset: {
    name: "Terracotta Sunset",
    emoji: "🏺",
    primary: "#7C2D12",
    primaryDark: "#431407",
    primaryLight: "#9A3412",
    accent: "#FF8A50",
    accentHover: "#E05D26",
    preview: ["#7C2D12", "#FF8A50"],
  },
  ocean_breeze: {
    name: "Ocean Breeze",
    emoji: "🌊",
    primary: "#1E3A8A",
    primaryDark: "#172554",
    primaryLight: "#2563EB",
    accent: "#14B8A6",
    accentHover: "#0D9488",
    preview: ["#1E3A8A", "#14B8A6"],
  },
  aurora_nordic: {
    name: "Aurora Nordic",
    emoji: "🌌",
    primary: "#134E5E",
    primaryDark: "#0A252E",
    primaryLight: "#1F7B94",
    accent: "#71F79F",
    accentHover: "#4EDB7B",
    preview: ["#134E5E", "#71F79F"],
  }
};

export default function App() {
  // Reset any previous simulator overrides to ensure absolute security
  useEffect(() => {
    localStorage.removeItem("userRoleOverride");
  }, []);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<string>(() => {
    return localStorage.getItem("userRole") || "student";
  });
  const [loading, setLoading] = useState(true);
  const [activeTheme, setActiveTheme] = useState(
    localStorage.getItem("appTheme") || "shikshantar_elite",
  );

  const applyTheme = (key: string, customColors?: any, fontFamily?: string) => {
    const t = customColors ? customColors : THEMES[key];
    if (!t) return;
    const r = document.documentElement;
    r.style.setProperty("--primary", t.primary);
    r.style.setProperty("--primary-dark", t.primaryDark);
    r.style.setProperty("--primary-light", t.primaryLight);
    r.style.setProperty("--accent", t.accent);
    r.style.setProperty("--accent-hover", t.accentHover);
    if (fontFamily) {
      let bodyFont = fontFamily;
      let headingFont = fontFamily;
      let tracking = "normal";

      if (fontFamily.includes("|")) {
        [bodyFont, headingFont] = fontFamily.split("|");
      }

      if (fontFamily.includes("Cormorant Garamond")) {
        tracking = "0.02em";
      } else if (fontFamily.includes("Outfit")) {
        tracking = "-0.015em";
      }

      r.style.setProperty("--font-family", bodyFont);
      r.style.setProperty("--font-heading", headingFont);
      r.style.setProperty("--tracking-base", tracking);

      // Handle text color for light themes
      if (
        t.primary.toUpperCase() === "#F8FAFC" ||
        t.primary.toUpperCase() === "#FFFFFF"
      ) {
        r.style.setProperty("--sidebar-text", "#0F172A");
      } else {
        r.style.setProperty("--sidebar-text", "#ffffff");
      }

      localStorage.setItem("appFontFamily", fontFamily);
    }
    setActiveTheme(key);
    if (!customColors) {
      localStorage.setItem("appTheme", key);
      localStorage.removeItem("appCustomTheme");
    } else {
      localStorage.setItem("appTheme", "custom");
      localStorage.setItem("appCustomTheme", JSON.stringify(t));
    }
  };

  useEffect(() => {
    const applyLocal = () => {
      const savedTheme = localStorage.getItem("appTheme") || "classic";
      const savedFont =
        localStorage.getItem("appFontFamily") ||
        "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
      if (savedTheme === "custom") {
        try {
          const customT = JSON.parse(
            localStorage.getItem("appCustomTheme") || "{}",
          );
          applyTheme("custom", customT, savedFont);
        } catch (e) {
          applyTheme("classic", null, savedFont);
        }
      } else {
        applyTheme(savedTheme, null, savedFont);
      }
    };

    // Initial load
    applyLocal();

    // Listen for global settings changes
    const unsub = onSnapshot(
      doc(db, "settings", "global"),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data) {
            const font =
              data.fontFamily ||
              "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
            applyTheme(
              data.themeKey || "classic",
              data.customColors || null,
              font,
            );
          }
        }
      },
      (err) => {
        console.warn(
          "Could not load global settings (might need auth first).",
          err,
        );
      },
    );

    return () => {
      unsub();
    };
  }, []);

  // Make applyTheme accessible globally so ThemeSettings can call it without props plumbing
  useEffect(() => {
    (window as any).applyThemeGlobal = applyTheme;
  }, []);

  useEffect(() => {
    let unSubDoc: (() => void) | null = null;
    let isCancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Multi-user safety check: If a different user has signed in, clear all previous cached keys
        const lastUid = localStorage.getItem("lastUserUid");
        if (lastUid && lastUid !== user.uid) {
          localStorage.removeItem("userRole");
          localStorage.removeItem("studentId");
          localStorage.removeItem("studentClass");
          localStorage.removeItem("adminSearchStudentId");
          localStorage.removeItem("isGuest");
          localStorage.removeItem("teacherSubjects");
        }
        localStorage.setItem("lastUserUid", user.uid);

        // Authoritative validation from Firestore
        try {
          const userDoc = await Promise.race([
            getDoc(doc(db, "users", user.uid)),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Firestore timeout")), 8000),
            ),
          ]);
          
          if (isCancelled) return;

          if (userDoc && userDoc.exists()) {
            const uData = userDoc.data();
            if (uData.status === 'blocked' || uData.status === 'rejected' || uData.active === false || uData.status === 'pending') {
              await signOut(auth);
              setIsAuthenticated(false);
              setUserRole('guest');
              localStorage.removeItem("userRole");
              setLoading(false);
              return;
            }
            const authoritativeRole = (uData.role || "student").toLowerCase();
            setUserRole(authoritativeRole);
            localStorage.setItem("userRole", authoritativeRole);
            
            setDoc(
              doc(db, "users", user.uid),
              { activeSessions: arrayUnion(localSessionId) },
              { merge: true },
            ).catch((e) => console.warn("Failed to set active session:", e));
          } else {
            // Unregistered / arbitrary account not in database -> Deny access
            await signOut(auth);
            setIsAuthenticated(false);
            setUserRole('guest');
            localStorage.removeItem("userRole");
            setLoading(false);
            return;
          }

          setIsAuthenticated(true);
          setLoading(false);

          let docExisted = userDoc ? userDoc.exists() : false;

          // Setup real-time listener for cross-device logout, role change, and status revocation
          if (unSubDoc) unSubDoc();
          unSubDoc = onSnapshot(
            doc(db, "users", user.uid),
            (docSnap) => {
              if (docSnap.exists()) {
                docExisted = true;
                const data = docSnap.data();
                if (data.status === 'blocked' || data.status === 'rejected' || data.active === false || data.status === 'pending') {
                  signOut(auth);
                  setIsAuthenticated(false);
                  setUserRole('guest');
                  localStorage.removeItem("userRole");
                  return;
                }
                if (data.role && data.role.toLowerCase() !== userRole) {
                  setUserRole(data.role.toLowerCase());
                  localStorage.setItem("userRole", data.role.toLowerCase());
                }
                if (data.activeSessions && Array.isArray(data.activeSessions)) {
                  if (!data.activeSessions.includes(localSessionId)) {
                    // Session was revoked
                    signOut(auth);
                  }
                }
              } else {
                if (docExisted) {
                  // Profile deleted while actively using the app!
                  signOut(auth);
                  window.location.reload();
                }
              }
            },
            (err) => {
              console.warn("Could not load user active sessions:", err.message);
            },
          );
        } catch (err) {
          console.error("Error fetching authoritative role:", err);
          // If network timeout, fall back safely without privilege escalation
          const localRole = localStorage.getItem("userRole");
          if (localRole && ['admin', 'teacher', 'student'].includes(localRole)) {
            setUserRole(localRole);
          } else {
            setUserRole("student");
          }
        }
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        setUserRole("guest");
        localStorage.removeItem("userRole");
        localStorage.removeItem("studentId");
        localStorage.removeItem("studentClass");
        localStorage.removeItem("adminSearchStudentId");
        localStorage.removeItem("isGuest");
        localStorage.removeItem("teacherSubjects");
        localStorage.removeItem("lastUserUid");
        localStorage.removeItem("localSessionId");
        localStorage.removeItem("shikshantar_last_activity");
        if (unSubDoc) {
          unSubDoc();
          unSubDoc = null;
        }
      }
      setLoading(false);
    });

    return () => {
      isCancelled = true;
      unsubscribe();
      if (unSubDoc) unSubDoc();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f3f4f6]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-primary rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <NoticeProvider>
      <Router>
        <ScrollToTop />
        <SessionTimeoutHandler isAuthenticated={isAuthenticated} />
        <Routes>
        <Route
          path="/login"
          element={
            !isAuthenticated ? (
              <Login setIsAuthenticated={setIsAuthenticated} />
            ) : (
              <Navigate to="/" />
            )
          }
        />
        <Route
          path="/"
          element={
            <Layout
              isAuthenticated={isAuthenticated}
              setIsAuthenticated={setIsAuthenticated}
              userRole={userRole}
            />
          }
        >
          <Route index element={<Home />} />
          <Route path="about" element={<About />} />
          <Route path="facilities" element={<Facilities />} />
          <Route path="gallery" element={<Gallery />} />
          <Route path="calendar" element={<AcademicCalendar />} />
          <Route path="events" element={<Events />} />
          <Route path="admission" element={<Admission />} />
          <Route path="fee-structure" element={<FeeStructure isGlobalView={true} />} />
          <Route
            path="scholarship"
            element={<Navigate to="/fee-structure" replace />}
          />
          <Route path="notices" element={<NoticeBoard />} />
          <Route path="contact" element={<ContactUs />} />
          <Route path="faq" element={<FAQ />} />
          <Route path="alumni" element={<Alumni />} />
          <Route
            path="result"
            element={isAuthenticated ? <Result /> : <Navigate to="/login" />}
          />
          <Route
            path="account"
            element={
              isAuthenticated && userRole === "student" ? (
                <Account />
              ) : (
                <Navigate to="/" />
              )
            }
          />
          <Route
            path="account-admin"
            element={
              isAuthenticated && userRole === "admin" ? (
                <AccountAdmin />
              ) : (
                <Navigate to="/" />
              )
            }
          />
          <Route
            path="teacher-salary"
            element={
              isAuthenticated && userRole === "teacher" ? (
                <TeacherSalary />
              ) : (
                <Navigate to="/" />
              )
            }
          />
          <Route
            path="salary-admin"
            element={
              isAuthenticated && userRole === "admin" ? (
                <SalaryAdmin />
              ) : (
                <Navigate to="/" />
              )
            }
          />
          <Route
            path="admin"
            element={
              isAuthenticated &&
              (userRole === "admin" || userRole === "teacher") ? (
                <Admin />
              ) : (
                <Navigate to="/" />
              )
            }
          />
          <Route
            path="admin-admissions"
            element={
              isAuthenticated && userRole === "admin" ? (
                <AdminAdmissions />
              ) : (
                <Navigate to="/" />
              )
            }
          />
          <Route
            path="user-approvals"
            element={
              isAuthenticated && userRole === "admin" ? (
                <UserApprovals />
              ) : (
                <Navigate to="/" />
              )
            }
          />
          <Route
            path="profile"
            element={isAuthenticated ? <Profile /> : <Navigate to="/login" />}
          />
          <Route
            path="iemis"
            element={
              isAuthenticated && userRole === "admin" ? (
                <IemisExport userRole={userRole} />
              ) : (
                <Navigate to="/" />
              )
            }
          />
          <Route
            path="settings"
            element={
              isAuthenticated && userRole === "admin" ? (
                <Settings />
              ) : (
                <Navigate to="/" />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      </Routes>
    </Router>
   </NoticeProvider>
  );
}
