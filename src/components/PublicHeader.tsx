import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Menu, 
  X, 
  ChevronDown, 
  Sun, 
  Moon, 
  Bell, 
  LogIn, 
  User, 
  LogOut, 
  Phone, 
  Mail, 
  MapPin, 
  GraduationCap, 
  Building, 
  Calendar, 
  CreditCard, 
  Image, 
  Megaphone, 
  HelpCircle, 
  FileText, 
  Award,
  Sparkles,
  LayoutDashboard
} from 'lucide-react';
import { formatBSDate } from '../lib/nepaliDate';
import { auth, db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface PublicHeaderProps {
  isAuthenticated: boolean;
  userRole: string;
  userName: string | null;
  avatarUrl: string | null;
  unreadCount: number;
  onOpenBell: () => void;
  onLogoutClick: () => void;
  themeMode: string;
  onToggleTheme: () => void;
}

export default function PublicHeader({
  isAuthenticated,
  userRole,
  userName,
  avatarUrl,
  unreadCount,
  onOpenBell,
  onLogoutClick,
  themeMode,
  onToggleTheme
}: PublicHeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [mobileExpandedGroup, setMobileExpandedGroup] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const location = useLocation();
  const navigate = useNavigate();
  const headerRef = useRef<HTMLElement>(null);
  const dropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Time & Nepal BS date ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Scroll detection for sticky header shadow
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setActiveDropdown(null);
  }, [location.pathname]);

  // Lock scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const handleMouseEnter = (name: string) => {
    if (dropdownTimeoutRef.current) clearTimeout(dropdownTimeoutRef.current);
    setActiveDropdown(name);
  };

  const handleMouseLeave = () => {
    dropdownTimeoutRef.current = setTimeout(() => {
      setActiveDropdown(null);
    }, 150);
  };

  const navGroups = [
    {
      label: 'About',
      id: 'about',
      items: [
        { name: 'About Us', href: '/about', desc: 'Our vision, leadership & history', icon: Building },
        { name: 'Facilities & Campus', href: '/facilities', desc: 'Modern classrooms, lab & library', icon: Building },
        { name: 'Alumni & Success Stories', href: '/alumni', desc: 'Graduates & notable achievements', icon: GraduationCap }
      ]
    },
    {
      label: 'Academics',
      id: 'academics',
      items: [
        { name: 'Academic Calendar', href: '/calendar', desc: 'Events, holidays & term dates', icon: Calendar },
        { name: 'Fees & Scholarships', href: '/fee-structure', desc: 'Transparent fees & merit aid', icon: CreditCard },
        { name: 'Events & Activities', href: '/events', desc: 'Sports, exhibitions & cultural fests', icon: Award }
      ]
    },
    {
      label: 'Explore',
      id: 'explore',
      items: [
        { name: 'Photo Gallery', href: '/gallery', desc: 'Campus moments & student life', icon: Image },
        { name: 'Notice Board', href: '/notices', desc: 'Latest announcements & circulars', icon: Megaphone },
        { name: 'FAQ', href: '/faq', desc: 'Frequently asked questions', icon: HelpCircle }
      ]
    }
  ];

  const getPortalRoute = () => {
    if (userRole === 'admin') return '/';
    if (userRole === 'teacher') return '/teacher-salary';
    return '/account';
  };

  return (
    <header 
      ref={headerRef} 
      className="w-full bg-white dark:bg-slate-950 sticky top-0 z-50 transition-all duration-200 border-b border-slate-200/80 dark:border-slate-800"
    >
      {/* 1. Slim Institutional Top Strip */}
      <div className="bg-[#0A2540] text-slate-200 text-xs py-1.5 px-4 sm:px-6 lg:px-8 border-b border-white/10 hidden sm:block">
        <div className="max-w-7xl mx-auto flex justify-between items-center text-[11px] tracking-wide">
          <div className="flex items-center gap-4 text-slate-300">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              Bastipur, Karjanha-05, Siraha, Nepal
            </span>
            <span className="hidden md:inline text-white/30">•</span>
            <span className="hidden md:inline font-mono text-amber-300/90 font-medium">
              Regd: 1482/071
            </span>
            <span className="hidden lg:inline text-white/30">•</span>
            <span className="hidden lg:flex items-center gap-1.5">
              <Phone className="w-3 h-3 text-amber-400" />
              +977 9709867048, 9807790805
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="font-mono text-slate-300 hidden md:inline">
              {formatBSDate(currentTime)}
            </span>
            <div className="flex items-center gap-2 border-l border-white/20 pl-3">
              <button 
                onClick={onToggleTheme} 
                className="p-1 rounded text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                title={themeMode === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
                aria-label="Toggle theme"
              >
                {themeMode === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Public Navbar */}
      <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 transition-all duration-200 ${isScrolled ? 'py-2.5' : 'py-3.5'}`}>
        <div className="flex items-center justify-between gap-4">
          
          {/* School Brand Identity */}
          <Link to="/" className="flex items-center gap-3 group shrink-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white p-1 border border-slate-200 shadow-sm flex items-center justify-center group-hover:scale-105 transition-transform">
              <img 
                src="/logo.png" 
                alt="Shikshantar Academy Logo" 
                className="w-full h-full object-contain rounded-full"
                onError={(e) => {
                  e.currentTarget.src = "/logo.png";
                }}
              />
            </div>
            <div>
              <div className="font-serif font-black text-base sm:text-lg lg:text-xl text-[#0A2540] dark:text-white tracking-tight leading-none group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                SHIKSHANTAR ACADEMY
              </div>
              <div className="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-slate-400 tracking-wider uppercase mt-0.5">
                Bastipur, Karjanha-05, Siraha
              </div>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1 font-medium text-sm text-slate-700 dark:text-slate-200">
            <Link 
              to="/" 
              className={`px-3 py-2 rounded-lg transition-colors hover:text-[#0A2540] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 ${
                location.pathname === '/' ? 'text-[#0A2540] dark:text-white font-bold bg-slate-100/80 dark:bg-slate-900' : ''
              }`}
            >
              Home
            </Link>

            {/* Grouped Dropdowns */}
            {navGroups.map((group) => {
              const isGroupActive = group.items.some(item => location.pathname === item.href);
              const isOpen = activeDropdown === group.id;

              return (
                <div 
                  key={group.id}
                  className="relative"
                  onMouseEnter={() => handleMouseEnter(group.id)}
                  onMouseLeave={handleMouseLeave}
                >
                  <button 
                    type="button"
                    className={`px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors hover:text-[#0A2540] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 ${
                      isGroupActive ? 'text-[#0A2540] dark:text-white font-bold bg-slate-100/80 dark:bg-slate-900' : ''
                    }`}
                    onClick={() => setActiveDropdown(isOpen ? null : group.id)}
                    aria-expanded={isOpen}
                  >
                    <span>{group.label}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-amber-600' : 'text-slate-400'}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {isOpen && (
                    <div className="absolute top-full left-0 w-72 pt-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200/80 dark:border-slate-800 p-2 overflow-hidden">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          const isActive = location.pathname === item.href;
                          return (
                            <Link
                              key={item.href}
                              to={item.href}
                              className={`flex items-start gap-3 p-2.5 rounded-lg transition-colors ${
                                isActive 
                                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-semibold' 
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              <div className={`p-1.5 rounded-md mt-0.5 shrink-0 ${
                                isActive ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                              }`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="text-xs font-bold leading-snug">{item.name}</div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">{item.desc}</div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <Link 
              to="/admission" 
              className={`px-3 py-2 rounded-lg transition-colors hover:text-[#0A2540] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 ${
                location.pathname === '/admission' ? 'text-[#0A2540] dark:text-white font-bold bg-slate-100/80 dark:bg-slate-900' : ''
              }`}
            >
              Admissions
            </Link>

            <Link 
              to="/contact" 
              className={`px-3 py-2 rounded-lg transition-colors hover:text-[#0A2540] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 ${
                location.pathname === '/contact' ? 'text-[#0A2540] dark:text-white font-bold bg-slate-100/80 dark:bg-slate-900' : ''
              }`}
            >
              Contact
            </Link>
          </nav>

          {/* Right Action Bar */}
          <div className="flex items-center gap-2.5">
            {/* Notification Bell Button */}
            <button 
              onClick={onOpenBell}
              className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
              title="Notices & Announcements"
              aria-label="View notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white dark:ring-slate-950 animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Login or Portal CTA */}
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <Link
                  to={getPortalRoute()}
                  className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0A2540] hover:bg-[#06182C] text-white text-xs font-bold transition-all shadow-sm active:scale-95 border border-white/10"
                >
                  <LayoutDashboard className="w-4 h-4 text-amber-400" />
                  <span>Open {userRole === 'admin' ? 'Admin Panel' : userRole === 'teacher' ? 'Teacher Portal' : 'Student Portal'}</span>
                </Link>
                <button
                  onClick={onLogoutClick}
                  className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  title="Logout"
                  aria-label="Log out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0A2540] hover:bg-[#041C2E] text-white text-xs font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95 border border-white/10"
              >
                <LogIn className="w-3.5 h-3.5 text-amber-400" />
                <span>Portal Login</span>
              </Link>
            )}

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden transition-colors"
              aria-label="Toggle mobile menu"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* 3. Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-x-0 top-[60px] bottom-0 bg-white/98 dark:bg-slate-950/98 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 z-50 flex flex-col overflow-y-auto custom-scrollbar animate-in slide-in-from-top-3 duration-200">
          <div className="p-4 flex-1 flex flex-col gap-2 pb-24">
            
            {/* Direct Home Link */}
            <Link
              to="/"
              className={`flex items-center justify-between p-3 rounded-xl text-sm font-bold ${
                location.pathname === '/' 
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200' 
                  : 'text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900'
              }`}
            >
              <span>Home</span>
            </Link>

            {/* Direct Admissions Link */}
            <Link
              to="/admission"
              className={`flex items-center justify-between p-3 rounded-xl text-sm font-bold ${
                location.pathname === '/admission' 
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200' 
                  : 'text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900'
              }`}
            >
              <span>Online Admission Form</span>
              <span className="text-[10px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full font-black uppercase">Apply</span>
            </Link>

            {/* Accordion Navigation Groups */}
            {navGroups.map((group) => {
              const isExpanded = mobileExpandedGroup === group.id;
              const hasActiveChild = group.items.some(i => location.pathname === i.href);

              return (
                <div key={group.id} className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setMobileExpandedGroup(isExpanded ? null : group.id)}
                    className={`w-full flex items-center justify-between p-3 text-sm font-bold text-left transition-colors ${
                      hasActiveChild ? 'bg-slate-50 dark:bg-slate-900 text-[#0A2540] dark:text-white' : 'text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    <span>{group.label}</span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {isExpanded && (
                    <div className="bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 p-2 flex flex-col gap-1">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const isChildActive = location.pathname === item.href;
                        return (
                          <Link
                            key={item.href}
                            to={item.href}
                            className={`flex items-center gap-3 p-2.5 rounded-lg text-xs font-semibold transition-colors ${
                              isChildActive
                                ? 'bg-amber-500 text-slate-950 font-bold'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <Icon className="w-4 h-4 shrink-0 opacity-80" />
                            <span>{item.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Contact Link */}
            <Link
              to="/contact"
              className={`flex items-center justify-between p-3 rounded-xl text-sm font-bold ${
                location.pathname === '/contact' 
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200' 
                  : 'text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900'
              }`}
            >
              <span>Contact Us & Map</span>
            </Link>

            {/* Mobile Institutional Footer within Drawer */}
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Bastipur, Karjanha-05, Siraha</span>
                <button
                  onClick={onToggleTheme}
                  className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  {themeMode === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
                  <span>{themeMode === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                </button>
              </div>

              {isAuthenticated ? (
                <div className="flex flex-col gap-2 pt-2">
                  <Link
                    to={getPortalRoute()}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0A2540] text-white text-xs font-bold shadow-md"
                  >
                    <LayoutDashboard className="w-4 h-4 text-amber-400" />
                    <span>Go to {userRole.toUpperCase()} Portal</span>
                  </Link>
                  <Link
                    to="/profile"
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    <span>My Profile</span>
                  </Link>
                  <button
                    onClick={onLogoutClick}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0A2540] text-white text-xs font-bold uppercase tracking-wider shadow-md"
                >
                  <LogIn className="w-4 h-4 text-amber-400" />
                  <span>Portal Login</span>
                </Link>
              )}
            </div>

          </div>
        </div>
      )}
    </header>
  );
}
