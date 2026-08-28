import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { doc, onSnapshot, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { Edit2, Save, X, Phone, Mail, MapPin, Globe, Facebook, Send, CheckCircle2, MessageSquare, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { sendEnquiryEmail } from '../lib/emailService';

export default function ContactUs() {
  const [isEditing, setIsEditing] = useState(false);
  const [data, setData] = useState({
    email: 'academyshikshantar@gmail.com',
    phone: '+977 9709867048, +977 9807790805',
    address: 'Karjanhana Municipality, Bastipur-5, Siraha, Nepal',
    mapEmbedUrl: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3568.043743360216!2d86.1814415!3d26.8611814!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39ec1c0cf1e37b71%3A0xccf0f22f2bf31dc2!2sShikshantar%20Academy!5e0!3m2!1sen!2snp!4v1718445582931!5m2!1sen!2snp',
    googleMapsUrl: 'https://maps.app.goo.gl/Ykri7uu78Y22NVjd6',
    facebookUrl: '',
    websiteUrl: '',
    instagramUrl: '',
    tiktokUrl: '',
    whatsappNumber: '+977 9713688926'
  });
  const [tempData, setTempData] = useState(data);
  const [saving, setSaving] = useState(false);

  // Quick Web Enquiry Form state
  const [enquiryForm, setEnquiryForm] = useState({
    name: '',
    phone: '',
    email: '',
    grade: '',
    message: '',
  });
  const [isSubmittingEnquiry, setIsSubmittingEnquiry] = useState(false);
  const [enquiryStatus, setEnquiryStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const userRole = auth.currentUser ? (localStorage.getItem('userRole') || 'student') : 'guest';
  const isAdmin = auth.currentUser ? userRole === 'admin' : false;

  const handleEnquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enquiryForm.name.trim() || !enquiryForm.phone.trim() || !enquiryForm.message.trim()) {
      setEnquiryStatus({ type: 'error', message: 'Please fill in your name, contact phone, and message.' });
      return;
    }

    setIsSubmittingEnquiry(true);
    setEnquiryStatus(null);

    try {
      // 1. Save enquiry to Firestore for Admin portal view
      await addDoc(collection(db, 'contact_enquiries'), {
        name: enquiryForm.name,
        phone: enquiryForm.phone,
        email: enquiryForm.email || 'N/A',
        grade: enquiryForm.grade || 'General Enquiry',
        message: enquiryForm.message,
        status: 'unread',
        submittedAt: serverTimestamp(),
      });

      // 2. Auto-dispatch EmailJS notification to Admin/Principal email
      sendEnquiryEmail({
        name: enquiryForm.name,
        phone: enquiryForm.phone,
        email: enquiryForm.email,
        grade: enquiryForm.grade,
        message: enquiryForm.message,
      }).catch(err => {
        console.warn('EmailJS dispatch warning:', err);
      });

      setEnquiryStatus({
        type: 'success',
        message: 'Your enquiry has been sent successfully! The administration will contact you shortly.',
      });

      // Reset form
      setEnquiryForm({
        name: '',
        phone: '',
        email: '',
        grade: '',
        message: '',
      });
    } catch (err: any) {
      console.error('Enquiry submission error:', err);
      setEnquiryStatus({
        type: 'error',
        message: 'Failed to send enquiry. Please try again or contact us via WhatsApp.',
      });
    } finally {
      setIsSubmittingEnquiry(false);
    }
  };


  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'contact_us'), (docSnap) => {
      if (docSnap.exists()) {
        const dbData = docSnap.data();
        let needsUpdate = false;
        const updates: any = {};

        // Automatically sanitize and enforce the exact coordinates of Shikshantar Academy
        if (!dbData.googleMapsUrl || !dbData.googleMapsUrl.includes('Ykri7uu78Y22NVjd6')) {
          dbData.googleMapsUrl = 'https://maps.app.goo.gl/Ykri7uu78Y22NVjd6';
          dbData.mapEmbedUrl = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3568.043743360216!2d86.1814415!3d26.8611814!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39ec1c0cf1e37b71%3A0xccf0f22f2bf31dc2!2sShikshantar%20Academy!5e0!3m2!1sen!2snp!4v1718445582931!5m2!1sen!2snp';
          updates.googleMapsUrl = dbData.googleMapsUrl;
          updates.mapEmbedUrl = dbData.mapEmbedUrl;
          needsUpdate = true;
        }
        if (dbData.email === 'info@shikshantar.edu.np' || dbData.email === 'shikshantar.academy@gmail.com') {
          dbData.email = 'academyshikshantar@gmail.com';
          updates.email = 'academyshikshantar@gmail.com';
          needsUpdate = true;
        }
        if (!dbData.whatsappNumber || dbData.whatsappNumber === '') {
          dbData.whatsappNumber = '+977 9713688926';
          updates.whatsappNumber = '+977 9713688926';
          needsUpdate = true;
        }
        if (dbData.websiteUrl !== '') {
          dbData.websiteUrl = '';
          updates.websiteUrl = '';
          needsUpdate = true;
        }

        if (needsUpdate && isAdmin) {
          setDoc(doc(db, 'settings', 'contact_us'), updates, { merge: true }).catch(err => console.error(err));
        }

        // Always enforce values in local UI regardless of database write success:
        if (!dbData.whatsappNumber || dbData.whatsappNumber === '') {
          dbData.whatsappNumber = '+977 9713688926';
        }
        dbData.websiteUrl = '';

        setData(prev => ({ ...prev, ...dbData }));
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/contact_us'));

    return () => unsub();
  }, [isAdmin]);

  const handleEdit = () => {
    setTempData(data);
    setIsEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    // Explicitly ensure websiteUrl remains empty and whatsappNumber matches
    const finalData = {
      ...tempData,
      websiteUrl: '',
      whatsappNumber: tempData.whatsappNumber || '+977 9713688926'
    };
    try {
      await setDoc(doc(db, 'settings', 'contact_us'), finalData);
      setIsEditing(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/contact_us');
    } finally {
      setSaving(false);
    }
  };

  // Client-safe email compose routing logic (opens native client on mobile, Gmail web compose on desktop inside sandboxed iframes)
  const emailLink = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    ? `mailto:${data.email || 'academyshikshantar@gmail.com'}`
    : `https://mail.google.com/mail/?view=cm&fs=1&to=${data.email || 'academyshikshantar@gmail.com'}`;

  const emailTarget = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    ? undefined
    : "_blank";

  const emailRel = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    ? undefined
    : "noopener noreferrer";

  const whatsappCleanNumber = (data.whatsappNumber || '+977 9713688926').replace(/[^0-9]/g, '');

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Helmet>
        <title>Contact Us | Shikshantar Academy</title>
        <meta name="description" content="Get in touch with Shikshantar Academy. Find our location, phone number, and email address." />
        <link rel="canonical" href="https://www.shikshantaracademy.edu.np/contact" />
      </Helmet>
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight">Contact Us</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">We're here to help. Reach out through any of the channels below.</p>
        </div>
        {isAdmin && !isEditing && (
          <button onClick={handleEdit} className="w-full sm:w-auto bg-blue-600 text-white px-5 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition font-medium shadow-md hover:shadow-lg active:scale-98">
            <Edit2 className="w-4 h-4" /> Edit Details
          </button>
        )}
      </div>

      <div className="relative rounded-2xl group transition-all duration-300">
        {/* Outer Glow Bloom aura */}
        <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-30 blur-2xl transition-all duration-500 rounded-2xl -z-10 group-hover:scale-102 pointer-events-none" />

        {/* Boundary box with rotating gradient for lightning border effect */}
        <div className="relative w-full h-full rounded-2xl overflow-hidden p-[2.5px] bg-gray-150 dark:bg-slate-800 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-xl">
          {/* Spinning lightning border */}
          <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_4s_linear_infinite] opacity-25 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

          {/* Inner masked content card */}
          <div className="relative w-full h-full bg-white dark:bg-slate-900 rounded-[14px] p-4 xs:p-6 md:p-8 z-10 overflow-hidden flex flex-col">
            {isEditing ? (
              <div className="space-y-5 text-gray-800 dark:text-slate-200">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Email</label>
                  <input type="email" value={tempData.email} onChange={e => setTempData({...tempData, email: e.target.value})} className="w-full py-3 px-4 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 text-base" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Phone</label>
                  <input type="text" value={tempData.phone} onChange={e => setTempData({...tempData, phone: e.target.value})} className="w-full py-3 px-4 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 text-base" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Address</label>
                  <textarea value={tempData.address} onChange={e => setTempData({...tempData, address: e.target.value})} className="w-full py-3 px-4 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 text-base" rows={3}></textarea>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Google Maps URL (Link)</label>
                  <input type="url" value={tempData.googleMapsUrl || ''} onChange={e => setTempData({...tempData, googleMapsUrl: e.target.value})} className="w-full py-3 px-4 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 text-base" placeholder="https://maps.app.goo.gl/..." />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Map Embed URL (iframe src)</label>
                  <input type="url" value={tempData.mapEmbedUrl} onChange={e => setTempData({...tempData, mapEmbedUrl: e.target.value})} className="w-full py-3 px-4 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 text-base" placeholder="https://www.google.com/maps/embed?pb=..." />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Facebook Page URL</label>
                  <input type="url" value={tempData.facebookUrl || ''} onChange={e => setTempData({...tempData, facebookUrl: e.target.value})} className="w-full py-3 px-4 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 text-base" placeholder="https://facebook.com/..." />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Instagram Profile URL</label>
                  <input type="url" value={tempData.instagramUrl || ''} onChange={e => setTempData({...tempData, instagramUrl: e.target.value})} className="w-full py-3 px-4 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 text-base" placeholder="https://instagram.com/..." />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">TikTok Profile URL</label>
                  <input type="url" value={tempData.tiktokUrl || ''} onChange={e => setTempData({...tempData, tiktokUrl: e.target.value})} className="w-full py-3 px-4 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 text-base" placeholder="https://tiktok.com/@..." />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">WhatsApp Number</label>
                  <input type="text" value={tempData.whatsappNumber || ''} onChange={e => setTempData({...tempData, whatsappNumber: e.target.value})} className="w-full py-3 px-4 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 text-base" placeholder="9779800000000" />
                </div>
                
                <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6 pt-6 border-t border-gray-100 dark:border-slate-800">
                  <button onClick={() => setIsEditing(false)} className="w-full sm:w-auto px-5 py-3 border border-gray-200 dark:border-slate-700 rounded-xl hover:text-primary dark:text-slate-300 dark:hover:text-white flex items-center justify-center gap-2 font-medium">
                    <X className="w-4 h-4" /> Cancel
                  </button>
                  <button disabled={saving} onClick={handleSave} className="w-full sm:w-auto bg-green-600 text-white px-5 py-3 rounded-xl hover:bg-green-700 flex items-center justify-center gap-2 disabled:opacity-50 font-medium">
                    <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid lg:grid-cols-12 gap-6 lg:gap-8">
                <div className="lg:col-span-5 space-y-5 lg:space-y-6">
                  {/* Visit Us Card */}
                  <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-4 p-4 sm:p-5 rounded-2xl bg-blue-50/50 dark:bg-slate-800/40 border border-blue-100 dark:border-slate-750 hover:bg-blue-50/70 dark:hover:bg-slate-800/60 transition-colors duration-200">
                    <div className="bg-blue-600 p-3 rounded-xl text-white shrink-0 shadow-md">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-extrabold text-gray-900 dark:text-white text-lg">Visit Us</h3>
                      <p className="text-gray-600 dark:text-slate-300 mt-1.5 text-sm sm:text-base whitespace-pre-wrap break-words leading-relaxed">{data.address}</p>
                      {data.googleMapsUrl && (
                        <a href={data.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-bold mt-2.5 inline-flex items-center gap-1 group/btn min-h-[44px] sm:min-h-0">
                          <span>Get Directions</span>
                          <span className="transition-transform group-hover/btn:translate-x-1">&rarr;</span>
                        </a>
                      )}
                    </div>
                  </motion.div>

                  {/* Call Us Card */}
                  <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 sm:p-5 rounded-2xl bg-green-50/50 dark:bg-slate-800/40 border border-green-100 dark:border-slate-750 hover:bg-green-50/70 dark:hover:bg-slate-800/60 transition-colors duration-200">
                    <div className="flex items-start gap-4 w-full sm:w-auto flex-1 min-w-0">
                      <div className="bg-green-600 p-3 rounded-xl text-white shrink-0 shadow-md">
                        <Phone className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-extrabold text-gray-900 dark:text-white text-lg">Call Us</h3>
                        <a href={`tel:${data.phone.includes(',') ? data.phone.split(',')[0].trim() : data.phone}`} className="text-gray-600 dark:text-slate-300 mt-1.5 text-sm sm:text-base hover:text-green-600 dark:hover:text-green-400 transition-colors block break-words font-medium leading-relaxed">{data.phone}</a>
                      </div>
                    </div>
                    <a href={`tel:${data.phone.includes(',') ? data.phone.split(',')[0].trim() : data.phone}`} className="shrink-0 w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-5 py-3.5 sm:py-2.5 rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all text-center flex items-center justify-center gap-2">
                      <Phone className="w-4 h-4" /> Call Now
                    </a>
                  </motion.div>

                  {/* WhatsApp Us Card */}
                  <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 sm:p-5 rounded-2xl bg-emerald-50/50 dark:bg-slate-800/40 border border-emerald-100 dark:border-slate-750 hover:bg-emerald-50/70 dark:hover:bg-slate-800/60 transition-colors duration-200">
                    <div className="flex items-start gap-4 w-full sm:w-auto flex-1 min-w-0">
                      <div className="bg-[#25D366] p-3 rounded-xl text-white shrink-0 shadow-md">
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.262 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.5-5.729-1.448L0 24zm6.59-4.017c1.52.902 3.022 1.378 4.819 1.379 5.51.001 9.985-4.475 9.988-9.986.002-2.67-1.035-5.18-2.915-7.06C16.651 2.436 14.145 1.399 11.48 1.4 5.973 1.4 1.498 5.875 1.495 11.387c-.001 1.902.5 3.752 1.448 5.333L1.93 21.93l5.064-1.329zM16.92 14.34c-.297-.15-1.758-.868-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-extrabold text-gray-900 dark:text-white text-lg">WhatsApp Us</h3>
                        <a href={`https://wa.me/${whatsappCleanNumber}`} target="_blank" rel="noopener noreferrer" className="text-gray-600 dark:text-slate-300 mt-1.5 text-sm sm:text-base hover:text-green-600 dark:hover:text-green-400 transition-colors block break-words font-medium leading-relaxed font-semibold">
                          {data.whatsappNumber || '+977 9713688926'}
                        </a>
                      </div>
                    </div>
                    <a href={`https://wa.me/${whatsappCleanNumber}`} target="_blank" rel="noopener noreferrer" className="shrink-0 w-full sm:w-auto bg-[#25D366] hover:bg-[#1fbc57] text-white px-5 py-3.5 sm:py-2.5 rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all text-center flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.262 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.5-5.729-1.448L0 24zm6.59-4.017c1.52.902 3.022 1.378 4.819 1.379 5.51.001 9.985-4.475 9.988-9.986.002-2.67-1.035-5.18-2.915-7.06C16.651 2.436 14.145 1.399 11.48 1.4 5.973 1.4 1.498 5.875 1.495 11.387c-.001 1.902.5 3.752 1.448 5.333L1.93 21.93l5.064-1.329zM16.92 14.34c-.297-.15-1.758-.868-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      </svg>
                      <span>WhatsApp Now</span>
                    </a>
                  </motion.div>

                  {/* Email Us Card */}
                  <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 sm:p-5 rounded-2xl bg-purple-50/50 dark:bg-slate-800/40 border border-purple-100 dark:border-slate-750 hover:bg-purple-50/70 dark:hover:bg-slate-800/60 transition-colors duration-200">
                    <div className="flex items-start gap-4 w-full sm:w-auto flex-1 min-w-0">
                      <div className="bg-purple-600 p-3 rounded-xl text-white shrink-0 shadow-md">
                        <Mail className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-extrabold text-gray-900 dark:text-white text-lg">Email Us</h3>
                        <a 
                          href={emailLink} 
                          target={emailTarget}
                          rel={emailRel}
                          className="text-gray-600 dark:text-slate-300 mt-1.5 text-sm sm:text-base hover:text-purple-600 dark:hover:text-purple-400 transition-colors block break-words font-medium leading-relaxed"
                        >
                          {data.email || 'academyshikshantar@gmail.com'}
                        </a>
                      </div>
                    </div>
                    <a 
                      href={emailLink} 
                      target={emailTarget}
                      rel={emailRel}
                      className="shrink-0 w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white px-5 py-3.5 sm:py-2.5 rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all text-center flex items-center justify-center gap-2"
                    >
                      <Mail className="w-4 h-4" /> Email Now
                    </a>
                  </motion.div>

                  {/* Send Quick Web Enquiry Form */}
                  <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50/40 dark:from-slate-800/80 dark:to-slate-900 border border-blue-100 dark:border-slate-700 shadow-md">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-sm">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-black text-gray-900 dark:text-white text-lg flex items-center gap-2">
                          Send Quick Web Enquiry
                          <span className="text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Email Admin</span>
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          Direct inquiry notification will be emailed to principal/administration.
                        </p>
                      </div>
                    </div>

                    {enquiryStatus && (
                      <div className={`p-4 rounded-xl mb-4 text-xs font-semibold flex items-center gap-2 ${enquiryStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                        {enquiryStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <X className="w-4 h-4 text-rose-600 shrink-0" />}
                        <span>{enquiryStatus.message}</span>
                      </div>
                    )}

                    <form onSubmit={handleEnquirySubmit} className="space-y-3.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Your Full Name *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Ramesh Sharma"
                            value={enquiryForm.name}
                            onChange={(e) => setEnquiryForm({ ...enquiryForm, name: e.target.value })}
                            className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Contact Phone *</label>
                          <input
                            type="tel"
                            required
                            placeholder="+977 9800000000"
                            value={enquiryForm.phone}
                            onChange={(e) => setEnquiryForm({ ...enquiryForm, phone: e.target.value })}
                            className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Email Address (Optional)</label>
                          <input
                            type="email"
                            placeholder="yourname@gmail.com"
                            value={enquiryForm.email}
                            onChange={(e) => setEnquiryForm({ ...enquiryForm, email: e.target.value })}
                            className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Grade / Class Interested</label>
                          <select
                            value={enquiryForm.grade}
                            onChange={(e) => setEnquiryForm({ ...enquiryForm, grade: e.target.value })}
                            className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">General Enquiry</option>
                            <option value="Play Group">Play Group</option>
                            <option value="Nursery">Nursery</option>
                            <option value="LKG">LKG</option>
                            <option value="UKG">UKG</option>
                            <option value="Class 1">Class 1</option>
                            <option value="Class 2">Class 2</option>
                            <option value="Class 3">Class 3</option>
                            <option value="Class 4">Class 4</option>
                            <option value="Class 5">Class 5</option>
                            <option value="Class 6">Class 6</option>
                            <option value="Class 7">Class 7</option>
                            <option value="Class 8">Class 8</option>
                            <option value="Class 9">Class 9</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Message / Question *</label>
                        <textarea
                          required
                          rows={3}
                          placeholder="Write your enquiry message or question here..."
                          value={enquiryForm.message}
                          onChange={(e) => setEnquiryForm({ ...enquiryForm, message: e.target.value })}
                          className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                        ></textarea>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmittingEnquiry}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-5 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                      >
                        <Send className="w-4 h-4" />
                        {isSubmittingEnquiry ? 'Sending Enquiry & Email...' : 'Submit Quick Enquiry'}
                      </button>
                    </form>
                  </motion.div>

                  
                  {/* Social Buttons Circle List at bottom */}
                  <div className="flex flex-wrap gap-4 pt-4 justify-center sm:justify-start">
                    {data.facebookUrl && (
                      <a href={data.facebookUrl} target="_blank" rel="noopener noreferrer" className="p-3.5 bg-[#1877F2] text-white rounded-full hover:scale-105 active:scale-95 shadow-md hover:shadow-lg transition-all duration-200" title="Facebook">
                        <Facebook className="w-5 h-5" />
                      </a>
                    )}
                    {data.instagramUrl && (
                      <a href={data.instagramUrl} target="_blank" rel="noopener noreferrer" className="p-3.5 bg-[#E1306C] text-white rounded-full hover:scale-105 active:scale-95 shadow-md hover:shadow-lg transition-all duration-200" title="Instagram">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                        </svg>
                      </a>
                    )}
                    {data.tiktokUrl && (
                      <a href={data.tiktokUrl} target="_blank" rel="noopener noreferrer" className="p-3.5 bg-black text-white rounded-full hover:scale-105 active:scale-95 shadow-md hover:shadow-lg transition-all duration-200" title="TikTok">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.92-1.88 2.63-5.31 3.49-8.15 2.23-2.33-1.01-3.87-3.41-3.85-5.93.01-2.58 1.66-4.98 4.13-5.75 1.14-.37 2.37-.3 3.53.11v4.07c-.72-.37-1.57-.45-2.33-.22-1.01.27-1.72 1.2-1.74 2.24-.03 1.34 1.15 2.45 2.48 2.42 1.15-.01 2.11-.88 2.22-2.02.03-.51.01-1.02.01-1.53V0z"/>
                        </svg>
                      </a>
                    )}
                    {data.whatsappNumber && (
                      <a href={`https://wa.me/${whatsappCleanNumber}`} target="_blank" rel="noopener noreferrer" className="p-3.5 bg-[#25D366] text-white rounded-full hover:scale-105 active:scale-95 shadow-md hover:shadow-lg transition-all duration-200" title="WhatsApp">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.262 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.5-5.729-1.448L0 24zm6.59-4.017c1.52.902 3.022 1.378 4.819 1.379 5.51.001 9.985-4.475 9.988-9.986.002-2.67-1.035-5.18-2.915-7.06C16.651 2.436 14.145 1.399 11.48 1.4 5.973 1.4 1.498 5.875 1.495 11.387c-.001 1.902.5 3.752 1.448 5.333L1.93 21.93l5.064-1.329zM16.92 14.34c-.297-.15-1.758-.868-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                        </svg>
                      </a>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-7 h-96 lg:h-auto rounded-2xl overflow-hidden bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 relative shadow-inner">
                  {data.mapEmbedUrl ? (
                    <iframe 
                      src={data.mapEmbedUrl} 
                      className="absolute inset-0 w-full h-full border-0" 
                      allowFullScreen 
                      loading="lazy" 
                      referrerPolicy="no-referrer-when-downgrade"
                    ></iframe>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900 group overflow-hidden">
                      <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-105">
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10 z-10"></div>
                        <img src="https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=1470&auto=format&fit=crop" className="w-full h-full object-cover opacity-80" alt="School map unavailable" />
                      </div>
                      <div className="relative z-20 flex flex-col items-center p-6 text-center">
                        <div className="p-4 bg-white/20 backdrop-blur-md rounded-full text-white mb-4 shadow-[0_0_15px_rgba(255,255,255,0.3)] animate-bounce font-black">
                          <MapPin className="w-10 h-10" /> 
                        </div>
                        <span className="font-black text-white text-2xl drop-shadow-md">No Map Embed Available</span>
                        <p className="text-sm text-gray-200 mt-2 max-w-sm drop-shadow-sm font-medium">Get directions by clicking the button below, or add an embed URL in settings.</p>
                        {data.googleMapsUrl && (
                          <a href={data.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-500 transition-colors font-bold shadow-[0_0_20px_rgba(37,99,235,0.5)] flex items-center gap-2">
                            <Globe className="w-4 h-4" /> Open in Google Maps
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
