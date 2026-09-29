import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  MapPin, 
  Phone, 
  Mail, 
  Clock, 
  ExternalLink, 
  GraduationCap, 
  Award, 
  BookOpen, 
  ShieldCheck, 
  ChevronRight, 
  Calendar,
  Sparkles,
  LogIn,
  Heart,
  FileCheck
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import logoImg from '../assets/logo.png';

interface FooterProps {
  isAuthenticated?: boolean;
  userRole?: string;
}

export default function Footer({ isAuthenticated = false, userRole = 'guest' }: FooterProps) {
  const [socialData, setSocialData] = useState({
    email: 'academyshikshantar@gmail.com',
    phone: '+977 9709867048, +977 9807790805',
    address: 'Karjanhana Municipality, Bastipur-5, Siraha, Nepal',
    facebookUrl: '',
    websiteUrl: '',
    instagramUrl: '',
    tiktokUrl: '',
    youtubeUrl: '',
    whatsappNumber: '+977 9713688926',
    googleMapsUrl: 'https://maps.app.goo.gl/Ykri7uu78Y22NVjd6'
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'contact_us'), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        setSocialData(prev => ({
          ...prev,
          email: d.email || prev.email,
          phone: d.phone || prev.phone,
          address: d.address || prev.address,
          facebookUrl: d.facebookUrl || prev.facebookUrl,
          websiteUrl: d.websiteUrl || prev.websiteUrl,
          instagramUrl: d.instagramUrl || prev.instagramUrl,
          tiktokUrl: d.tiktokUrl || prev.tiktokUrl,
          youtubeUrl: d.youtubeUrl || prev.youtubeUrl,
          whatsappNumber: d.whatsappNumber || prev.whatsappNumber,
          googleMapsUrl: d.googleMapsUrl || prev.googleMapsUrl,
        }));
      }
    }, (err) => {
      console.warn("Footer contact settings sync note:", err);
    });

    return () => unsub();
  }, []);

  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full bg-[#0A2540] dark:bg-[#071322] text-slate-200 mt-auto border-t border-[#1a385c] dark:border-slate-800/80 transition-colors print:hidden relative z-20">
      {/* Top Admissions & Quick Callout Banner */}
      <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 py-3.5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-900 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-950"></span>
            </span>
            <span className="text-xs sm:text-sm font-black tracking-tight uppercase">
              🎓 Admissions Open for Academic Session 2081/2082 B.S.
            </span>
            <span className="hidden md:inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-950/15 text-slate-900">
              Playgroup to Grade 10
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/admission"
              className="px-4 py-1.5 bg-slate-950 hover:bg-slate-900 text-white hover:text-amber-300 rounded-lg text-xs font-extrabold tracking-wider uppercase transition-all shadow-sm active:scale-95"
            >
              Apply Online Now
            </Link>
            <Link
              to="/fee-structure"
              className="px-3 py-1.5 bg-white/30 hover:bg-white/40 text-slate-950 rounded-lg text-xs font-bold transition-all"
            >
              Fee Structure
            </Link>
          </div>
        </div>
      </div>

      {/* Main Footer Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-10">
          
          {/* Column 1: School Identity & Brand (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white p-1 shadow-md border border-white/20 flex items-center justify-center shrink-0">
                <img 
                  src={logoImg} 
                  alt="Shikshantar Academy Logo" 
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    e.currentTarget.src = '/logo.png';
                  }}
                />
              </div>
              <div>
                <h3 className="text-lg font-black text-white tracking-tight leading-none uppercase">
                  SHIKSHANTAR ACADEMY
                </h3>
                <p className="text-xs text-amber-400 font-bold uppercase tracking-wider mt-1">
                  Bastipur, Karjanha-05, Siraha
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
              Dedicated to delivering holistic English-medium education, moral values, and academic excellence in Siraha, Nepal. Nurturing future leaders from early childhood through secondary graduation.
            </p>

            {/* Government Recognition & Affiliation Badge */}
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300">
                <span className="font-bold text-white block">Recognized Institution</span>
                Ministry of Education, Science and Technology & Karjanha Municipality Education Division.
              </div>
            </div>

            {/* Social Media Link Badges */}
            <div className="pt-2">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2.5">
                Connect With Us
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {socialData.facebookUrl && (
                  <a
                    href={socialData.facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Facebook"
                    className="w-9 h-9 rounded-lg bg-[#1877F2]/20 hover:bg-[#1877F2] text-[#4d97f8] hover:text-white flex items-center justify-center border border-[#1877F2]/30 transition-all shadow-sm"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </a>
                )}

                {socialData.whatsappNumber && (
                  <a
                    href={`https://wa.me/${socialData.whatsappNumber.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="WhatsApp"
                    className="w-9 h-9 rounded-lg bg-[#25D366]/20 hover:bg-[#25D366] text-[#25D366] hover:text-white flex items-center justify-center border border-[#25D366]/30 transition-all shadow-sm"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 448 512">
                      <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L3 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
                    </svg>
                  </a>
                )}

                {socialData.youtubeUrl && (
                  <a
                    href={socialData.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="YouTube"
                    className="w-9 h-9 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white flex items-center justify-center border border-red-600/30 transition-all shadow-sm"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.108C19.524 3.545 12 3.545 12 3.545s-7.525 0-9.388.51a3.003 3.003 0 0 0-2.11 2.108C0 8.025 0 12 0 12s0 3.975.502 5.837a3.003 3.003 0 0 0 2.11 2.108c1.863.51 9.388.51 9.388.51s7.525 0 9.388-.51a3.002 3.002 0 0 0 2.11-2.108c.502-1.862.502-5.837.502-5.837s0-3.975-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                  </a>
                )}

                {socialData.instagramUrl && (
                  <a
                    href={socialData.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram"
                    className="w-9 h-9 rounded-lg bg-[#E1306C]/20 hover:bg-[#E1306C] text-[#E1306C] hover:text-white flex items-center justify-center border border-[#E1306C]/30 transition-all shadow-sm"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                    </svg>
                  </a>
                )}

                {socialData.tiktokUrl && (
                  <a
                    href={socialData.tiktokUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="TikTok"
                    className="w-9 h-9 rounded-lg bg-slate-700/40 hover:bg-black text-slate-300 hover:text-white flex items-center justify-center border border-white/10 transition-all shadow-sm"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.92-1.88 2.63-5.31 3.49-8.15 2.23-2.33-1.01-3.87-3.41-3.85-5.93.01-2.58 1.66-4.98 4.13-5.75 1.14-.37 2.37-.3 3.53.11v4.07c-.72-.37-1.57-.45-2.33-.22-1.01.27-1.72 1.2-1.74 2.24-.03 1.34 1.15 2.45 2.48 2.42 1.15-.01 2.11-.88 2.22-2.02.03-.51.01-1.02.01-1.53V0z"/>
                    </svg>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Column 2: Quick Links (2.5 cols) */}
          <div className="lg:col-span-2 space-y-3">
            <h4 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-3.5 bg-amber-400 rounded-sm"></span>
              Explore
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm font-medium">
              <li>
                <Link to="/" className="text-slate-300 hover:text-amber-400 flex items-center gap-1.5 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  <span>Home</span>
                </Link>
              </li>
              <li>
                <Link to="/about" className="text-slate-300 hover:text-amber-400 flex items-center gap-1.5 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  <span>About Academy</span>
                </Link>
              </li>
              <li>
                <Link to="/facilities" className="text-slate-300 hover:text-amber-400 flex items-center gap-1.5 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  <span>Campus Facilities</span>
                </Link>
              </li>
              <li>
                <Link to="/gallery" className="text-slate-300 hover:text-amber-400 flex items-center gap-1.5 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  <span>Photo Gallery</span>
                </Link>
              </li>
              <li>
                <Link to="/calendar" className="text-slate-300 hover:text-amber-400 flex items-center gap-1.5 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  <span>Academic Calendar</span>
                </Link>
              </li>
              <li>
                <Link to="/events" className="text-slate-300 hover:text-amber-400 flex items-center gap-1.5 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  <span>School Events</span>
                </Link>
              </li>
              <li>
                <Link to="/notices" className="text-slate-300 hover:text-amber-400 flex items-center gap-1.5 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  <span>Notice Board</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Academics & Admissions (2.5 cols) */}
          <div className="lg:col-span-2 space-y-3">
            <h4 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-3.5 bg-amber-400 rounded-sm"></span>
              Academics
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm font-medium">
              <li>
                <Link to="/admission" className="text-slate-300 hover:text-amber-400 flex items-center gap-1.5 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-bold text-amber-300">Admission Online</span>
                </Link>
              </li>
              <li>
                <Link to="/fee-structure" className="text-slate-300 hover:text-amber-400 flex items-center gap-1.5 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  <span>Fee Structure</span>
                </Link>
              </li>
              <li>
                <Link to="/result" className="text-slate-300 hover:text-amber-400 flex items-center gap-1.5 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  <span>Exam Results</span>
                </Link>
              </li>
              <li>
                <Link to="/alumni" className="text-slate-300 hover:text-amber-400 flex items-center gap-1.5 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  <span>Alumni Community</span>
                </Link>
              </li>
              <li>
                <Link to="/faq" className="text-slate-300 hover:text-amber-400 flex items-center gap-1.5 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  <span>FAQs & Help</span>
                </Link>
              </li>
              <li>
                <Link to="/login" className="text-slate-300 hover:text-amber-400 flex items-center gap-1.5 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  <span className="flex items-center gap-1">
                    Portal Login <LogIn className="w-3 h-3 text-amber-400" />
                  </span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Official Contact & Desk (3.5 cols) */}
          <div className="lg:col-span-4 space-y-4">
            <h4 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-3.5 bg-amber-400 rounded-sm"></span>
              School Contact Desk
            </h4>

            <div className="space-y-3 text-xs sm:text-sm text-slate-300">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white block">Campus Location</span>
                  <span>{socialData.address}</span>
                  {socialData.googleMapsUrl && (
                    <a
                      href={socialData.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:text-amber-300 text-xs font-bold inline-flex items-center gap-1 mt-1 block"
                    >
                      <span>View on Google Maps</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Phone className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white block">Admissions & Office</span>
                  <div className="flex flex-wrap gap-x-2">
                    <a href="tel:+9779709867048" className="hover:text-amber-400 font-mono transition-colors">
                      +977 9709867048
                    </a>
                    <span>/</span>
                    <a href="tel:+9779807790805" className="hover:text-amber-400 font-mono transition-colors">
                      +977 9807790805
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Mail className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white block">Email Enquiry</span>
                  <a href={`mailto:${socialData.email}`} className="hover:text-amber-400 transition-colors">
                    {socialData.email}
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white block">Office Hours</span>
                  <span>Sunday – Friday: 9:00 AM – 4:30 PM (Saturday Closed)</span>
                </div>
              </div>
            </div>

            {/* Quick Contact Us Page Link */}
            <div className="pt-1">
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all border border-white/10"
              >
                <span>Send Direct Web Message</span>
                <ChevronRight className="w-3.5 h-3.5 text-amber-400" />
              </Link>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Legal / Copyright Strip */}
      <div className="border-t border-white/10 bg-[#071a2e] dark:bg-[#040c16] py-5 px-4 sm:px-6 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
          <div>
            <p className="font-medium">
              © {currentYear} <span className="font-bold text-slate-200">Shikshantar Academy</span>. All Rights Reserved.
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Bastipur, Karjanha-05, Siraha, Madhesh Pradesh, Nepal
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium">
            <Link to="/about" className="hover:text-amber-400 transition-colors">
              About Us
            </Link>
            <span className="text-slate-600">•</span>
            <Link to="/admission" className="hover:text-amber-400 transition-colors">
              Admissions
            </Link>
            <span className="text-slate-600">•</span>
            <Link to="/fee-structure" className="hover:text-amber-400 transition-colors">
              Fee Policy
            </Link>
            <span className="text-slate-600">•</span>
            <Link to="/contact" className="hover:text-amber-400 transition-colors">
              Contact Desk
            </Link>
            <span className="text-slate-600">•</span>
            <Link to="/login" className="text-amber-400 hover:text-amber-300 font-bold transition-colors">
              Staff & Student Portal
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
