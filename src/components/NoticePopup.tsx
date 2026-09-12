import React, { useState, useEffect } from 'react';
import { 
  X, 
  Calendar, 
  AlertTriangle, 
  Bell, 
  FileText, 
  ExternalLink, 
  Download, 
  ZoomIn, 
  Maximize2, 
  Phone, 
  Mail, 
  MapPin, 
  Printer, 
  Check, 
  Eye,
  Info,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import DOMPurify from 'isomorphic-dompurify';
import { formatBSDate } from '../lib/nepaliDate';
import logoImageSrc from '../assets/logo.png';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const fallbackLogo = logoImageSrc || "/logo.png";

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
}

interface NoticePopupProps {
  notice: Notice;
  popupTimer: number;
  onClose: () => void;
  fullScreenBlock?: boolean;
}

export default function NoticePopup({
  notice,
  popupTimer,
  onClose,
  fullScreenBlock = false
}: NoticePopupProps) {
  const isUrgent = notice.priority === 'Urgent';
  const [isPhotoZoomed, setIsPhotoZoomed] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showPdfEmbed, setShowPdfEmbed] = useState(false);

  // Dynamic school contact info state (defaults to authentic school details)
  const [schoolContact, setSchoolContact] = useState({
    nameNe: 'शिक्षान्तर एकेडेमी',
    nameEn: 'SHIKSHANTAR ACADEMY',
    address: 'Karjanhana-5, Bastipur, Siraha, Nepal',
    addressNe: 'कर्जन्हा-५, बस्तिपुर, सिरहा',
    phone: '+977 9709867048, +977 9807790805',
    whatsapp: '+977 9713688926',
    email: 'academyshikshantar@gmail.com',
    estd: 'ESTD. 2072 B.S. (2015 A.D.)',
    affiliation: 'Govt. Approved • Karjanhana, Siraha'
  });

  useEffect(() => {
    // Attempt to load any live updated school contact details from settings or contact doc
    getDoc(doc(db, 'site_content', 'contact_info'))
      .then(snap => {
        if (snap.exists()) {
          const d = snap.data();
          setSchoolContact(prev => ({
            ...prev,
            phone: d.phone || prev.phone,
            email: d.email || prev.email,
            address: d.address || prev.address,
            whatsapp: d.whatsappNumber || prev.whatsapp
          }));
        }
      })
      .catch(() => {});
  }, []);

  const isImageAttachment = notice.attachmentUrl && (
    notice.attachmentType === 'image' || 
    /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(notice.attachmentUrl) ||
    notice.attachmentUrl.startsWith('data:image/')
  );

  const isPdfAttachment = notice.attachmentUrl && (
    notice.attachmentType === 'pdf' || 
    /\.pdf$/i.test(notice.attachmentUrl) ||
    notice.attachmentUrl.startsWith('data:application/pdf')
  );

  const displayDate = notice.date ? (formatBSDate(notice.date) || notice.date) : 'हालसालै (Recent)';

  const handlePrint = () => {
    window.print();
  };

  const handleCopyNotice = () => {
    navigator.clipboard.writeText(`${notice.title}\nShikshantar Academy Notice: ${window.location.origin}/notices`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const containerMarkup = (
    <motion.div
      initial={{ scale: 0.92, y: 20, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0.92, y: 20, opacity: 0 }}
      transition={{ type: "spring", stiffness: 360, damping: 28 }}
      className="relative w-full max-w-2xl rounded-2xl md:rounded-3xl overflow-hidden bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col font-sans max-h-[90vh] text-slate-800 dark:text-slate-100"
      style={{ boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)' }}
    >
      {/* Top Red/Primary Accent Line */}
      <div className={`h-1.5 w-full ${isUrgent ? 'bg-gradient-to-r from-red-600 via-rose-500 to-red-600' : 'bg-gradient-to-r from-[#1B4F72] via-[#F0A500] to-[#1B4F72]'}`} />

      {/* Floating Close Button Top-Right */}
      <button
        onClick={onClose}
        className="absolute top-3.5 right-3.5 z-30 p-2 rounded-full bg-slate-100/90 hover:bg-red-50 dark:bg-slate-800/90 dark:hover:bg-red-950/50 text-slate-600 hover:text-red-600 dark:text-slate-300 dark:hover:text-red-400 transition-all shadow-sm border border-slate-200/60 dark:border-slate-700/60 cursor-pointer active:scale-95"
        title="Close Notice"
        aria-label="Close Notice"
      >
        <X className="w-4 h-4" />
      </button>

      {/* 1. Official Institutional Header */}
      <div className="px-6 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-b from-slate-50/70 to-white dark:from-slate-950/40 dark:to-slate-900 shrink-0">
        <div className="flex items-center justify-between gap-4">
          {/* Left: School Logo & Official Title */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white p-1 shadow-sm border border-slate-150 flex items-center justify-center shrink-0">
              <img 
                src={logoImageSrc || fallbackLogo} 
                alt="Shikshantar Academy" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = fallbackLogo;
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-extrabold text-sm sm:text-base text-[#1B4F72] dark:text-sky-400 tracking-tight leading-none">
                  {schoolContact.nameNe}
                </h1>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${isUrgent ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400' : 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'}`}>
                  {notice.priority === 'Urgent' ? 'अत्यन्त जरुरी' : notice.priority}
                </span>
              </div>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tracking-wider uppercase mt-0.5">
                {schoolContact.nameEn} • SIRAHA
              </p>
            </div>
          </div>

          {/* Right: Institutional Badge */}
          <div className="hidden sm:flex flex-col items-end text-right pr-7">
            <div className="bg-white/80 dark:bg-slate-800/90 px-3 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80 shadow-xs text-right">
              <span className="text-[11px] font-extrabold tracking-wider text-slate-800 dark:text-slate-100 block">
                ESTD. 2072 B.S. (2015 A.D.)
              </span>
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                {schoolContact.addressNe}
              </span>
            </div>
          </div>
        </div>

        {/* Prominent Official Headline */}
        <div className="mt-3.5 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 text-center">
          <h2 className={`font-black text-lg sm:text-xl md:text-2xl leading-snug tracking-tight ${isUrgent ? 'text-[#D92525] dark:text-rose-400' : 'text-[#1B4F72] dark:text-[#F0A500]'}`}>
            {notice.title}
          </h2>
          <div className="flex items-center justify-center gap-2 mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>प्रकाशन मिति: {displayDate}</span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. Scrollable Body with Support for Photo, PDF, and Memo Text */}
      <div className="p-5 md:p-6 overflow-y-auto space-y-5 flex-1 select-text scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
        
        {/* A. PHOTO NOTICE VIEW */}
        {isImageAttachment && (
          <div className="space-y-2">
            <div className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center shadow-inner">
              <img
                src={notice.attachmentUrl}
                alt={notice.attachmentName || notice.title}
                className="w-full h-auto max-h-[380px] object-contain cursor-zoom-in transition-transform duration-300 hover:scale-[1.01]"
                onClick={() => setIsPhotoZoomed(true)}
                referrerPolicy="no-referrer"
              />

              {/* Overlay Controls for Photo */}
              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/75 via-black/40 to-transparent flex items-center justify-between gap-2 opacity-95 transition-opacity">
                <span className="text-white text-xs font-semibold truncate flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  {notice.attachmentName || 'Notice Image Poster'}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setIsPhotoZoomed(true)}
                    className="px-2.5 py-1 bg-white/90 hover:bg-white text-slate-900 text-xs font-bold rounded-lg shadow-sm flex items-center gap-1 transition-transform active:scale-95 cursor-pointer"
                    title="Zoom in high resolution"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>View Full Photo</span>
                  </button>
                  <a
                    href={notice.attachmentUrl}
                    download={notice.attachmentName || 'school_notice.jpg'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 bg-white/90 hover:bg-white text-slate-900 rounded-lg shadow-sm transition-transform active:scale-95"
                    title="Download Photo"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-center text-slate-400 dark:text-slate-500 italic">
              (तस्विरलाई ठूलो बनाएर हेर्न तस्विरमा क्लिक गर्नुहोस् / Click image for full screen view)
            </p>
          </div>
        )}

        {/* B. OFFICIAL MEMO MESSAGE BODY */}
        {notice.message && (
          <div className="space-y-3">
            <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-200 leading-relaxed text-[14px] sm:text-[15px] p-4 sm:p-5 bg-slate-50/60 dark:bg-slate-950/30 rounded-xl border border-slate-200/70 dark:border-slate-800 text-left font-normal">
              <div 
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(notice.message) }} 
                className="notice-html-content space-y-2 [&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_th]:bg-[#D92525] [&_th]:text-white [&_th]:p-2 [&_th]:text-xs [&_th]:font-bold [&_td]:border [&_td]:border-slate-300 dark:[&_td]:border-slate-700 [&_td]:p-2 [&_td]:text-xs [&_tr:nth-child(even)]:bg-slate-100/50 dark:[&_tr:nth-child(even)]:bg-slate-900/40"
              />
            </div>
          </div>
        )}

        {/* C. PDF DOCUMENT ATTACHMENT & IN-LINE PREVIEW */}
        {isPdfAttachment && (
          <div className="space-y-3">
            <div className="p-4 bg-gradient-to-r from-red-50/80 via-white to-slate-50 dark:from-red-950/30 dark:via-slate-900 dark:to-slate-950 rounded-xl border border-red-200/70 dark:border-red-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-red-600 text-white rounded-xl font-bold text-xs shadow-sm shrink-0 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 tracking-wider">
                      PDF NOTICE
                    </span>
                    <span className="text-xs text-slate-500">Official Document</span>
                  </div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate mt-0.5">
                    {notice.attachmentName || "Official_Notice_Circular.pdf"}
                  </h4>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                <button
                  onClick={() => setShowPdfEmbed(!showPdfEmbed)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{showPdfEmbed ? 'Hide Preview' : 'Preview PDF'}</span>
                </button>
                <a
                  href={notice.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 bg-[#1B4F72] hover:bg-[#F0A500] text-white hover:text-slate-950 text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open / Download</span>
                </a>
              </div>
            </div>

            {/* In-Modal PDF Viewer Iframe */}
            {showPdfEmbed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 350 }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-750 shadow-inner bg-slate-100 dark:bg-slate-950"
              >
                <iframe
                  src={`${notice.attachmentUrl}#toolbar=1&navpanes=0`}
                  title="PDF Notice Document"
                  className="w-full h-full border-0"
                />
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* 3. Bottom Official Customer Care / Helpline Strip (Updated with True School Details) */}
      <div className="bg-[#D92525] dark:bg-red-950 text-white px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium border-t border-red-700/50 shrink-0">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full justify-center sm:justify-start">
          <div className="flex items-center gap-1">
            <Phone className="w-3 h-3 text-white" />
            <span className="font-bold">सम्पर्क / HELPLINE:</span>
            <span>{schoolContact.phone}</span>
          </div>
          <div className="hidden sm:flex items-center gap-1">
            <Mail className="w-3 h-3 text-white" />
            <span>{schoolContact.email}</span>
          </div>
          <div className="hidden md:flex items-center gap-1 text-white/90">
            <MapPin className="w-3 h-3 text-white" />
            <span>{schoolContact.address}</span>
          </div>
        </div>
      </div>

      {/* 4. Bottom Acknowledgment Action Control */}
      <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 shrink-0">
        <AnimatePresence mode="wait">
          {popupTimer > 0 ? (
            <motion.div
              key="timer"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs flex items-center gap-2 select-none"
            >
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              <span>Reviewing ({popupTimer}s)</span>
            </motion.div>
          ) : (
            <motion.button
              key="close-btn"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onClose}
              className="px-5 py-2.5 bg-gradient-to-r from-[#1B4F72] via-[#153e5b] to-[#0a2334] hover:from-[#F0A500] hover:to-[#d49200] text-white hover:text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all duration-200 cursor-pointer flex items-center gap-2"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Acknowledge & Close</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* High-Resolution Full-Screen Photo Zoom Lightbox Modal */}
      <AnimatePresence>
        {isPhotoZoomed && isImageAttachment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] bg-black/95 backdrop-blur-md flex flex-col p-4"
            onClick={() => setIsPhotoZoomed(false)}
          >
            {/* Top Toolbar in Zoom Mode */}
            <div className="flex items-center justify-between p-3 text-white">
              <div className="text-sm font-bold truncate">
                {notice.title} - Full Resolution
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={notice.attachmentUrl}
                  download={notice.attachmentName || 'notice.jpg'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
                <button
                  onClick={() => setIsPhotoZoomed(false)}
                  className="p-2 bg-white/20 hover:bg-red-600 rounded-full text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Centered Large Image */}
            <div className="flex-1 flex items-center justify-center p-2 overflow-auto">
              <img
                src={notice.attachmentUrl}
                alt={notice.title}
                className="max-w-full max-h-[88vh] object-contain rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                referrerPolicy="no-referrer"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  if (fullScreenBlock) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#070a13] select-none font-sans relative overflow-hidden px-4">
        <div className="fixed inset-0 z-0 bg-slate-950/80 backdrop-blur-xl" />
        <div className="relative z-50 w-full max-w-2xl flex items-center justify-center">
          {containerMarkup}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/65 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
    >
      {containerMarkup}
    </motion.div>
  );
}
