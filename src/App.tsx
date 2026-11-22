import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { NoticeProvider } from "./contexts/NoticeContext";
import Layout from "./components/Layout";
import SessionTimeoutHandler from "./components/SessionTimeoutHandler";
import DeviceVerificationGate from "./components/DeviceVerificationGate";
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
import { Component, ReactNode, useState, useEffect } from "react";
import { db } from "./firebase";
import {
  doc,
  onSnapshot,
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

function AppContent() {
  const {
    isAuthenticated,
    userRole,
    loading,
    verifyingDeviceSession,
    deviceVerificationRequired,
    deviceVerificationError,
    retryDeviceVerification,
    logout,
  } = useAuth();
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

  if (loading || (isAuthenticated && verifyingDeviceSession)) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-6">
        <div className="w-full max-w-xs flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex items-center justify-center p-2 mb-4">
            <img
              src="/logo.png"
              alt="Shikshantar Academy"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <h1 className="font-display text-lg font-bold text-[#0A2540] tracking-tight">
            Shikshantar Academy
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Karjanha Municipality, Bastipur-05, Siraha
          </p>
          <div className="w-44 h-1 bg-slate-200 rounded-full overflow-hidden mt-6">
            <div className="h-full w-1/3 bg-[#0A2540] rounded-full animate-indeterminate-progress" />
          </div>
          <p className="text-xs font-medium text-slate-500 mt-3">
            {isAuthenticated && verifyingDeviceSession
              ? 'Checking trusted device...'
              : 'Loading portal...'}
          </p>
        </div>
      </div>
    );
  }

  if (isAuthenticated && deviceVerificationRequired) {
    return <DeviceVerificationGate />;
  }

  if (isAuthenticated && deviceVerificationError) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[440px] bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="h-1 bg-[#0A2540]" />
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-3.5 pb-5 border-b border-slate-100">
              <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200/80 p-1.5 flex items-center justify-center shrink-0">
                <img
                  src="/logo.png"
                  alt="Shikshantar Academy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-base font-bold text-[#0A2540] leading-tight">
                  Shikshantar Academy
                </h1>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  Karjanha Municipality, Bastipur-05, Siraha
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-red-700">
                Security Check Unavailable
              </p>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Sign-in paused for account protection
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                We could not complete device verification with the security server. Portal access remains paused until the check succeeds.
              </p>
              <div className="p-3 rounded-lg bg-red-50 border border-red-200/80 text-xs font-medium text-red-800 leading-relaxed">
                {deviceVerificationError}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                type="button"
                onClick={retryDeviceVerification}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#0A2540] hover:bg-[#06182C] text-white font-semibold text-sm transition-colors cursor-pointer"
              >
                Retry Security Check
              </button>
              <button
                type="button"
                onClick={() => logout('device_verification_error')}
                className="py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm transition-colors cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
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
              <Login />
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

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Unhandled portal render error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              Something went wrong while loading this view
            </h2>
            <p className="text-sm text-slate-600">
              Please reload the page to restore your session cleanly.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-[#0A3D62] text-white text-sm font-semibold hover:opacity-95 transition-opacity"
            >
              Reload Portal
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
