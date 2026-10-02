import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  MapPin, 
  Mail, 
  Building2, 
  Megaphone, 
  Check, 
  Facebook, 
  MessageCircle,
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export default function Footer() {
  const [socialData, setSocialData] = useState({
    facebookUrl: '',
    whatsappNumber: '+9779709867048',
    googleMapsUrl: 'https://maps.app.goo.gl/Ykri7uu78Y22NVjd6'
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'contact_us'), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        setSocialData(prev => ({
          ...prev,
          facebookUrl: d.facebookUrl || prev.facebookUrl,
          whatsappNumber: d.whatsappNumber || prev.whatsappNumber,
          googleMapsUrl: d.googleMapsUrl || prev.googleMapsUrl
        }));
      }
    });
    return () => unsub();
  }, []);

  const currentYear = new Date().getFullYear();

  const quickLinks = [
    { name: 'About Us', href: '/about' },
    { name: 'Admission Form', href: '/admission' },
    { name: 'Notice Board', href: '/notices' },
    { name: 'Photo Gallery', href: '/gallery' },
    { name: 'Alumni / Success', href: '/alumni' },
    { name: 'FAQ', href: '/faq' },
    { name: 'Contact Us', href: '/contact' },
  ];

  const fbLink = socialData.facebookUrl || 'https://www.facebook.com/shikshantaracademy';
  const waLink = socialData.whatsappNumber 
    ? `https://wa.me/${socialData.whatsappNumber.replace(/[^0-9]/g, '')}`
    : 'https://wa.me/9779709867048';
  const mapsLink = socialData.googleMapsUrl || 'https://maps.app.goo.gl/Ykri7uu78Y22NVjd6';

  return (
    <footer className="w-full bg-[#0a1526] dark:bg-[#060e1a] text-slate-200 mt-auto border-t border-white/5 relative z-10 print:hidden transition-colors">
      {/* Background subtle geometric texture */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none" 
        style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, #ffffff 1px, transparent 0)`,
          backgroundSize: '20px 20px'
        }} 
      />

      <div className="w-full max-w-[1680px] mx-auto px-6 sm:px-10 lg:px-14 pt-12 pb-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-12 pb-10">
          
          {/* Column 1: School Emblem & Vision */}
          <div className="lg:col-span-4 flex flex-col items-start space-y-4">
            <div className="w-16 h-16 rounded-full bg-white p-1 shadow-md flex items-center justify-center shrink-0">
              <img 
                src="/logo.png" 
                alt="Shikshantar Academy Logo" 
                className="w-full h-full object-contain rounded-full"
                onError={(e) => {
                  e.currentTarget.src = "/logo.png";
                }}
              />
            </div>
            
            <div className="space-y-0.5">
              <h3 className="text-xl sm:text-2xl font-black tracking-wider text-white uppercase font-sans">
                SHIKSHANTAR
              </h3>
              <p className="text-[11px] font-black tracking-[0.22em] text-amber-400 uppercase">
                ACADEMY BASTIPUR
              </p>
            </div>

            <p className="text-slate-300 text-sm leading-relaxed max-w-sm pt-2 font-normal">
              Empowering the next generation through quality education, character building, and excellence in all academic endeavors.
            </p>
          </div>

          {/* Column 2: Quick Links */}
          <div className="lg:col-span-4 flex flex-col items-start lg:pl-6">
            <div className="mb-5">
              <h4 className="text-sm font-extrabold uppercase tracking-widest text-slate-100 relative pb-2 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-12 after:h-[1.5px] after:bg-slate-700">
                QUICK LINKS
              </h4>
            </div>
            
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.href}
                    className="group inline-flex items-center text-sm font-medium text-slate-300 hover:text-amber-400 transition-colors duration-150"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-2.5 shrink-0 inline-block transition-transform group-hover:scale-125" />
                    <span>{link.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Contact Us */}
          <div className="lg:col-span-4 flex flex-col items-start space-y-4">
            <div className="mb-2">
              <h4 className="text-sm font-extrabold uppercase tracking-widest text-slate-100 relative pb-2 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-12 after:h-[1.5px] after:bg-slate-700">
                CONTACT US
              </h4>
            </div>

            <div className="space-y-3.5 text-sm text-slate-300 w-full">
              {/* Location */}
              <div className="flex items-start gap-3">
                <Building2 className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <span className="leading-snug">
                  Location: Karjanha Municipality, Ward No. 05, Siraha, Madhesh Province, Nepal.
                </span>
              </div>

              {/* Postal Code */}
              <div className="flex items-center gap-3">
                <Megaphone className="w-5 h-5 text-amber-400 shrink-0" />
                <span>
                  Postal Code: 56500
                </span>
              </div>

              {/* Email */}
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-amber-400 shrink-0" />
                <a 
                  href="mailto:academyshikshantar@gmail.com" 
                  className="hover:text-amber-400 transition-colors truncate"
                >
                  academyshikshantar@gmail.com
                </a>
              </div>

              {/* Dedicated with Social Links */}
              <div className="flex items-center flex-wrap gap-2.5 pt-1">
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-amber-400 shrink-0" />
                  <span className="font-semibold text-slate-200">Dedicated to Bright Futures</span>
                </div>
                
                <div className="flex items-center gap-2 ml-1">
                  <a
                    href={fbLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-7 h-7 rounded-full bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white flex items-center justify-center transition-colors shadow-sm"
                    title="Follow on Facebook"
                    aria-label="Facebook"
                  >
                    <Facebook className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-7 h-7 rounded-full bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white flex items-center justify-center transition-colors shadow-sm"
                    title="Chat on WhatsApp"
                    aria-label="WhatsApp"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>

            {/* Find Us Button */}
            <div className="pt-2">
              <a
                href={mapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-white text-slate-900 hover:bg-amber-400 hover:text-slate-950 font-bold text-xs sm:text-sm shadow-md transition-all duration-150 active:scale-95"
              >
                <MapPin className="w-4 h-4 text-blue-900" />
                <span>Find Us</span>
              </a>
            </div>
          </div>

        </div>

        {/* Bottom Bar / Copyright */}
        <div className="border-t border-slate-800/80 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p className="text-center sm:text-left w-full">
            &copy; {currentYear} Shikshantar Academy, Siraha. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
