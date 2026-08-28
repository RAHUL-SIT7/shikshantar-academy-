import React, { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Home, ArrowLeft } from 'lucide-react';

interface BreadcrumbRouteMap {
  [key: string]: {
    title: string;
    parent?: string;
  };
}

const ROUTE_CONFIG: BreadcrumbRouteMap = {
  'about': { title: 'About Us' },
  'facilities': { title: 'Facilities' },
  'gallery': { title: 'Photo Gallery' },
  'calendar': { title: 'Academic Calendar' },
  'events': { title: 'Events & Functions' },
  'admission': { title: 'Online Admission' },
  'fee-structure': { title: 'Fee Structure & Scholarships' },
  'notices': { title: 'Notice Board' },
  'contact': { title: 'Contact Us' },
  'faq': { title: 'Help & FAQ' },
  'alumni': { title: 'Alumni & Achievements' },
  'result': { title: 'Examination Results' },
  'account': { title: 'Student Fee Ledger' },
  'account-admin': { title: 'Fee & Billing Management' },
  'teacher-salary': { title: 'Teacher Salary Portal' },
  'salary-admin': { title: 'Staff Payroll Administration' },
  'admin': { title: 'School Administration' },
  'admin-admissions': { title: 'Admission Approvals', parent: 'admin' },
  'user-approvals': { title: 'User Verification', parent: 'admin' },
  'iemis': { title: 'Government IEMIS Export', parent: 'admin' },
  'profile': { title: 'My Profile' },
  'settings': { title: 'System & Theme Settings', parent: 'admin' },
  'login': { title: 'Portal Login' },
};

interface BreadcrumbsProps {
  className?: string;
  userRole?: string;
}

export default function Breadcrumbs({ className = '', userRole = 'student' }: BreadcrumbsProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const isHome = location.pathname === '/' || location.pathname === '';

  // Parse path segments and search query parameters (e.g. active tab or student search)
  const breadcrumbItems = useMemo(() => {
    if (isHome) return [];

    const pathSegments = location.pathname.split('/').filter(Boolean);
    const searchParams = new URLSearchParams(location.search);
    const activeTab = searchParams.get('tab');
    const searchStudent = searchParams.get('studentId') || searchParams.get('id');

    const items: Array<{ title: string; path: string; isLast: boolean }> = [];

    let accumulatedPath = '';

    pathSegments.forEach((segment, index) => {
      accumulatedPath += `/${segment}`;
      const config = ROUTE_CONFIG[segment] || {
        title: segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ')
      };

      // Check if this segment has a configured parent that wasn't already in URL path
      if (index === 0 && config.parent && !pathSegments.includes(config.parent)) {
        const parentConfig = ROUTE_CONFIG[config.parent];
        if (parentConfig) {
          items.push({
            title: parentConfig.title,
            path: `/${config.parent}`,
            isLast: false
          });
        }
      }

      const isSegmentLast = index === pathSegments.length - 1 && !activeTab && !searchStudent;
      items.push({
        title: config.title,
        path: accumulatedPath,
        isLast: isSegmentLast
      });
    });

    // If query parameters define sub-tabs or search context, display as the final active leaf
    if (activeTab) {
      const formattedTab = activeTab
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      items.push({
        title: `${formattedTab} Tab`,
        path: `${location.pathname}?tab=${activeTab}`,
        isLast: !searchStudent
      });
    }

    if (searchStudent) {
      items.push({
        title: `Student #${searchStudent}`,
        path: `${location.pathname}${location.search}`,
        isLast: true
      });
    }

    return items;
  }, [location.pathname, location.search, isHome]);

  if (isHome || breadcrumbItems.length === 0) {
    return null;
  }

  const handleBack = () => {
    // If window.history is available and has history, navigate back; otherwise fallback to Home
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <div 
      className={`w-full max-w-6xl mx-auto px-4 sm:px-6 mb-4 print:hidden transition-all duration-200 ${className}`}
      aria-label="Breadcrumb Navigation"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5 py-2 px-3.5 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md rounded-xl border border-gray-200/70 dark:border-slate-800/80 shadow-xs text-xs">
        {/* Left Side: Back Button + Trail */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-gray-600 dark:text-gray-300 min-w-0">
          {/* Back Button */}
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-slate-800 hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/20 dark:hover:text-amber-400 text-gray-700 dark:text-gray-200 font-semibold transition-all duration-150 cursor-pointer mr-1 shrink-0 border border-gray-200/50 dark:border-slate-700/50 active:scale-95"
            title="Go back to previous page"
            aria-label="Go back to previous page"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="font-bold text-[11px] sm:text-xs">Back</span>
          </button>

          {/* Root: Home Icon */}
          <Link
            to="/"
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-amber-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            title="Go to Home"
          >
            <Home className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-medium">Home</span>
          </Link>

          {/* Breadcrumb Items */}
          {breadcrumbItems.map((item, idx) => (
            <React.Fragment key={`${item.path}-${idx}`}>
              <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600 shrink-0" />
              {item.isLast ? (
                <span 
                  className="font-bold text-primary dark:text-amber-400 truncate max-w-[140px] sm:max-w-[240px] md:max-w-none bg-primary/5 dark:bg-amber-400/10 px-2 py-0.5 rounded-md"
                  aria-current="page"
                >
                  {item.title}
                </span>
              ) : (
                <Link
                  to={item.path}
                  className="font-medium text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-amber-400 hover:underline underline-offset-2 transition-colors truncate max-w-[120px] sm:max-w-[180px]"
                >
                  {item.title}
                </Link>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Right Side: Quick Portal Badge / Indicator */}
        <div className="hidden md:flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500 font-medium select-none shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Shikshantar Portal</span>
        </div>
      </div>
    </div>
  );
}
