import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Send, UserCheck, CreditCard } from 'lucide-react';
const logoImage = "/logo.png";

interface Department {
  name: string;
  nameNepali: string;
  phone: string;
  presetMessage: string;
  description: string;
  icon: React.ComponentType<any>;
}

export default function WhatsAppWidget() {
  const [isOpen, setIsOpen] = useState(false);

  // Listen for global open events from mobile menu / header buttons
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    const handleClose = () => setIsOpen(false);
    const handleToggle = () => setIsOpen(prev => !prev);
    
    window.addEventListener('openWhatsAppDesk', handleOpen);
    window.addEventListener('closeWhatsAppDesk', handleClose);
    window.addEventListener('toggleWhatsAppDesk', handleToggle);
    return () => {
      window.removeEventListener('openWhatsAppDesk', handleOpen);
      window.removeEventListener('closeWhatsAppDesk', handleClose);
      window.removeEventListener('toggleWhatsAppDesk', handleToggle);
    };
  }, []);

  // Default contact numbers
  const admissionsPhone = '9713688926';
  const accountsPhone = '9779807790805';

  const departments: Department[] = [
    {
      name: 'Admissions Department',
      nameNepali: 'भर्ना शाखा (Official WhatsApp)',
      phone: admissionsPhone,
      description: 'Official real number for admission chat & inquiries',
      presetMessage: 'नमस्कार शिक्षान्तर एकेडेमी, म मेरो बच्चाको नयाँ शैक्षिक सत्रमा भर्ना सम्बन्धी जानकारी लिन चाहन्छु।',
      icon: UserCheck,
    },
    {
      name: 'Accounts & Administration',
      nameNepali: 'लेखा तथा प्रशासन',
      phone: accountsPhone,
      description: 'शुल्क भुक्तानी तथा बिलिङ सहायता (Fees & Billing Assistance)',
      presetMessage: 'नमस्कार शिक्षान्तर एकेडेमी, म विद्यालय शुल्क भुक्तानी तथा बैंक विवरण सम्बन्धी सहायता चाहन्छु।',
      icon: CreditCard,
    },
  ];

  const handleOpenChat = (dept: Department) => {
    // Sanitize phone (leave only numbers)
    const cleanPhone = dept.phone.replace(/[^0-9]/g, '');
    const encodedText = encodeURIComponent(dept.presetMessage);
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedText}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    setIsOpen(false);
  };

  return (
    <>
      {/* WhatsApp Support Desk Modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Mobile Backdrop Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[105] lg:hidden"
            />

            <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 lg:inset-auto lg:top-auto lg:translate-y-0 lg:bottom-6 lg:left-[265px] z-[110] font-sans print:hidden flex justify-center">
              <motion.div
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 15, scale: 0.95 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full sm:w-84 md:w-96 max-w-[400px] rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-white/40 dark:border-slate-700/50 shadow-2xl overflow-hidden"
              >
                {/* Header */}
                <div className="bg-emerald-600 dark:bg-emerald-700 p-3.5 sm:p-4 text-white relative">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-emerald-700/60 transition-colors"
                    aria-label="Close chat"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/95 p-1 flex items-center justify-center shadow-sm overflow-hidden shrink-0">
                      <img
                        src={logoImage || "/logo.png"}
                        alt="Shikshantar Academy Logo"
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (target.src !== '/logo.png') {
                            target.src = '/logo.png';
                            return;
                          }
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const fallbackText = document.createElement('span');
                            fallbackText.className = 'text-emerald-600 font-bold text-base';
                            fallbackText.innerText = 'SA';
                            parent.appendChild(fallbackText);
                          }
                        }}
                      />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm sm:text-base leading-tight">शिक्षान्तर एकेडेमी</h4>
                      <p className="text-[11px] sm:text-xs text-emerald-100 font-medium">Official WhatsApp Desk</p>
                    </div>
                  </div>
                  <div className="mt-2.5 bg-emerald-500/30 dark:bg-emerald-800/30 rounded-lg p-2 text-xs leading-relaxed text-emerald-50 font-medium">
                    नमस्ते! Connect directly with school officers on WhatsApp. Select your department:
                  </div>
                </div>

                {/* List of Departments */}
                <div className="p-3 sm:p-4 bg-gray-50/50 dark:bg-slate-900/50 space-y-2.5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                  {departments.map((dept, idx) => {
                    const IconComponent = dept.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleOpenChat(dept)}
                        className="w-full text-left p-3 bg-white dark:bg-slate-800 hover:bg-emerald-50/80 dark:hover:bg-emerald-950/30 border border-gray-200/80 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-800 rounded-xl transition-all shadow-sm hover:shadow group flex items-start gap-3 active:scale-[0.99] cursor-pointer"
                      >
                        <div className="bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 p-2 rounded-lg shrink-0 group-hover:bg-emerald-200 group-hover:text-emerald-800 transition-colors">
                          <IconComponent className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-gray-900 dark:text-slate-100 text-xs sm:text-sm truncate">{dept.nameNepali}</span>
                            <span className="text-[9px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold px-1.5 py-0.5 rounded shrink-0">
                              Active
                            </span>
                          </div>
                          <span className="text-[11px] text-gray-600 dark:text-slate-400 font-semibold block mt-0.5">{dept.name}</span>
                          <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-slate-500 mt-0.5 line-clamp-1 leading-snug">{dept.description}</p>
                        </div>
                        <Send className="w-4 h-4 text-gray-300 group-hover:text-emerald-600 transition-colors shrink-0 self-center" />
                      </button>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="px-4 py-2.5 bg-gray-100/90 dark:bg-slate-950/90 text-[10px] text-center text-gray-500 dark:text-slate-400 border-t border-gray-200/60 dark:border-slate-800 font-medium">
                  School Hours: Sun – Fri (7:00 AM – 4:30 PM NPT)
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Floating Trigger Button: Strictly visible on desktop (hidden on mobile to prevent overlapping hero & controls) */}
      <div className="hidden lg:block fixed bottom-6 left-[265px] z-50 font-sans print:hidden">
        <motion.button
          id="whatsapp_floating_widget"
          onClick={() => setIsOpen(!isOpen)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/35 hover:bg-black/50 text-white font-bold text-xs transition-all border border-white/25 hover:border-white/40 shadow-[0_8px_20px_rgba(0,0,0,0.3)] select-none cursor-pointer backdrop-blur-md"
          aria-label="Chat with school on WhatsApp"
        >
          <div className="w-4.5 h-4.5 rounded-full bg-[#25D366] flex items-center justify-center text-white shrink-0 shadow-sm">
            <svg
              className="w-3 h-3 fill-current"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 448 512"
            >
              <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L3 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
            </svg>
          </div>
          <span className="tracking-wide text-white drop-shadow-sm font-poppins">Chat with Us</span>
        </motion.button>
      </div>
    </>
  );
}
