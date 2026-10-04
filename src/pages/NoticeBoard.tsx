import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { formatBSDate, formatBSDateYMD, compareBSDates, isBsDateExpired } from '../lib/nepaliDate';
import { compressImage } from '../lib/imageOptimizer';
import { db, auth, storage } from '../firebase';
import { collection, doc, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, Timestamp, arrayUnion, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { Megaphone, Pin, AlertCircle, FileText, Calendar, Clock, Eye, Edit2, Trash2, Copy, Archive, Plus, X, Search, Filter, Image as ImageIcon, Bold, Italic, List, Underline, ChevronRight, XCircle, CheckCircle, Upload, Paperclip, Activity, BookOpen, UserCheck, Flame, Bell, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import DOMPurify from 'isomorphic-dompurify';
import { NepaliDatePicker } from 'nepali-datepicker-reactjs';
import 'nepali-datepicker-reactjs/dist/index.css';
import { useNotices } from '../contexts/NoticeContext';
import { safeDispatchEvent } from '../lib/safeEvents';

const CLASSES = ['Play Group', 'Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(c => `Class ${c}`);
const TARGET_OPTIONS = ['All', 'Admin Only', 'Students Only', 'Teachers Only', 'Guest User', ...CLASSES];

export default function NoticeBoard() {
  const { triggerNoticePopup } = useNotices();
  const role = auth.currentUser ? (localStorage.getItem('userRole') || 'student') : 'guest';
  const studentClass = localStorage.getItem('studentClass') || '';
  const currentUserId = auth.currentUser?.uid || 'guest';

  const [allNotices, setAllNotices] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState('All');
  const [filterAudience, setFilterAudience] = useState('All');
  const [filterStatus, setFilterStatus] = useState(role === 'admin' ? 'Published' : 'All');
  
  const [loading, setLoading] = useState(true);

  // Create/Edit Panel State
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    date: formatBSDateYMD(new Date()),
    validUntil: '',
    priority: 'Normal',
    targets: ['Admin Only'],
    isPinned: false,
    status: 'Published',
    attachmentUrl: '',
    attachmentType: '',
    attachmentName: '',
    displayDurationDays: 7
  });
  
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  const [expandedNoticeId, setExpandedNoticeId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [localReads, setLocalReads] = useState<string[]>([]);

  useEffect(() => {
     try {
         const reads = JSON.parse(localStorage.getItem('localReadNotices') || '[]');
         setLocalReads(reads);
     } catch(e) {}
  }, []);

  useEffect(() => {
    let unsub = () => {};

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsub();
      // For non-admins/teachers, we MUST filter by status=='Published' to satisfy security rules query check
      const isPrivileged = user && (role === 'admin' || role === 'teacher');
      
      let q = query(collection(db, 'notices'), orderBy('date', 'desc'));
      
      unsub = onSnapshot(q, (snap) => {
        let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!isPrivileged) {
           docs = docs.filter((d: any) => d.status === 'Published');
        }
        setAllNotices(docs);
        setLoading(false);
      }, (err: any) => {
        if (isPrivileged && err?.message?.includes('Missing or insufficient permissions')) {
          localStorage.removeItem('userRole');
          // window.location.reload();
          setLoading(false);
        } else {
          console.warn("NoticeBoard fetch error:", err.message);
          setLoading(false);
        }
      });
    });

    return () => { unsub(); unsubAuth(); };
  }, [role]);

  // Filter & Sort logic
  let visibleNotices = allNotices;

  // Role based filtering
  if (role !== 'admin') {
     visibleNotices = visibleNotices.filter(n => {
        if (n.status !== 'Published') return false;
        // Check Expiry using authentic Nepali BS date comparison
        if (n.validUntil && isBsDateExpired(n.validUntil)) return false;

        // If notice has explicit recipient UIDs, user MUST be an included recipient
        if (n.recipientUids && Array.isArray(n.recipientUids) && n.recipientUids.length > 0) {
          if (!currentUserId || currentUserId === 'guest' || !n.recipientUids.includes(currentUserId)) return false;
        }
        
        if (n.targets?.includes('All')) return true;

        if (role === 'teacher' || role === 'Teacher') {
           return n.targets?.includes('Teachers Only');
        } else if (role === 'student') {
           return n.targets?.includes('Students Only') || n.targets?.includes('Student') || (studentClass ? (n.targets?.includes(`Class ${studentClass}`) || n.targets?.includes(studentClass)) : false);
        } else {
           // guest or parent
           return n.targets?.includes('Guest User');
        }
     });
  }

  // Active User Filters
  if (searchQuery) {
     visibleNotices = visibleNotices.filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }
  if (filterPriority !== 'All') {
     if (filterPriority === 'Unread') {
        visibleNotices = visibleNotices.filter(n => !n.readBy?.includes(currentUserId));
     } else {
        visibleNotices = visibleNotices.filter(n => n.priority === filterPriority);
     }
  }
  if (filterAudience !== 'All' && role === 'admin') {
     visibleNotices = visibleNotices.filter(n => n.targets?.includes(filterAudience));
  }
  if (role === 'admin' && filterStatus !== 'All') {
     visibleNotices = visibleNotices.filter(n => n.status === filterStatus);
  }

  // Sorting
  visibleNotices.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.priority === 'Urgent' && b.priority !== 'Urgent') return -1;
      if (b.priority === 'Urgent' && a.priority !== 'Urgent') return 1;
      return 0; // fallback to original firebase datestamp order
  });

  const isInvalidDateRange = Boolean(
    formData.date && 
    formData.validUntil && 
    compareBSDates(formData.validUntil, formData.date) < 0
  );

  const handleSaveNotice = async (statusOverride?: string) => {
      const finalStatus = statusOverride || formData.status;
      const hasMessageBody = formData.message && formData.message.replace(/<[^>]*>?/gm, '').trim() !== '';
      if (!formData.title || (!hasMessageBody && !formData.attachmentUrl) || formData.targets.length === 0) {
          alert('Title, targets, and either a message or an attachment are required.');
          return;
      }

      if (!formData.date) {
          alert('Please specify a Notice Date (B.S.).');
          return;
      }

      if (isInvalidDateRange) {
          alert(`Invalid Date Selection:\n"Valid Until" date (${formData.validUntil}) cannot be earlier than "Notice Date" (${formData.date}).\n\nPlease select a valid expiry date on or after the notice publication date.`);
          return;
      }
      
      const payload = {
          ...formData,
          status: finalStatus,
          timestamp: Timestamp.now(),
          authorId: currentUserId,
          readBy: [] // reset reads if drastically edited? No, keep it as is if editing
      };

      try {
          if (editingId) {
             const existing = allNotices.find(n => n.id === editingId);
             await updateDoc(doc(db, 'notices', editingId), { 
                 ...payload, 
                 readBy: existing?.readBy || [] 
             });
          } else {
             await addDoc(collection(db, 'notices'), payload);
          }
          setIsPanelOpen(false);
          setEditingId(null);
          alert(`Notice ${finalStatus.toLowerCase()} successfully!`);
      } catch (err) {
          console.error(err);
          alert('Error saving notice');
      }
  };

  const handleDuplicate = async (notice: any) => {
      try {
        const { id, readBy, views, timestamp, ...rest } = notice;
        await addDoc(collection(db, 'notices'), {
            ...rest,
            title: `${rest.title} (Copy)`,
            status: 'Draft',
            timestamp: Timestamp.now(),
            readBy: []
        });
      } catch (err) {
         console.error(err);
      }
  };

  const handleDelete = (notice: any) => {
      setDeleteConfirm(notice);
  };

  const confirmDelete = async () => {
      if (!deleteConfirm) return;
      try {
          await deleteDoc(doc(db, 'notices', deleteConfirm.id));
          setDeleteConfirm(null);
      } catch (error: any) {
          console.error("Delete error:", error);
          alert("Delete failed: " + (error.message || 'Unknown error'));
      }
  };

  const markAsRead = async (id: string, currentReadBy: string[]) => {
      const newReads = [...localReads, id];
      if (!localReads.includes(id)) {
          setLocalReads(newReads);
          localStorage.setItem('localReadNotices', JSON.stringify(newReads));
          safeDispatchEvent('localReadsChanged');
      }

      if (!currentReadBy?.includes(currentUserId) && role !== 'admin') {
         if (currentUserId !== 'guest') {
             try {
                 await updateDoc(doc(db, 'notices', id), {
                     readBy: arrayUnion(currentUserId)
                 });
             } catch (err) {
                 console.warn("Could not mark as read remotely, updating locally only.");
             }
         }
      }
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 15 * 1024 * 1024) {
          alert('File size must be less than 15MB');
          return;
      }

      setUploadingAttachment(true);
      setUploadStatus('Processing file...');
      try {
          const type = file.type.startsWith('image/') ? 'image' : (file.type === 'application/pdf' ? 'pdf' : '');
          if (!type) {
              alert('Only PDF and image files (JPG, PNG, WebP) are allowed.');
              setUploadingAttachment(false);
              setUploadStatus('');
              return;
          }

          let uploadPayload: Blob = file;
          let fallbackDataUrl = '';

          // High-speed in-browser compression for photos
          if (type === 'image') {
              setUploadStatus('Optimizing image...');
              try {
                  const compressed = await compressImage(file, 1600, 1600, 0.85);
                  uploadPayload = compressed.blob;
                  fallbackDataUrl = compressed.dataUrl;
              } catch (compErr) {
                  console.warn('Image compression fallback to original file', compErr);
              }
          }

          setUploadStatus('Uploading...');
          let finalUrl = '';

          try {
              const fileRef = ref(storage, `notice_attachments/${Date.now()}_${file.name.replace(/\s+/g, '_')}`);
              
              // Upload with a 10s promise timeout race to prevent hanging
              const uploadPromise = uploadBytes(fileRef, uploadPayload).then(snap => getDownloadURL(snap.ref));
              const timeoutPromise = new Promise<string>((_, reject) => 
                  setTimeout(() => reject(new Error('Upload timeout')), 10000)
              );

              finalUrl = await Promise.race([uploadPromise, timeoutPromise]);
          } catch (storageErr) {
              console.warn('Storage upload error or timeout, applying direct optimized source', storageErr);
              // If image and we have optimized dataUrl, use it directly so user is never blocked
              if (type === 'image' && fallbackDataUrl) {
                  finalUrl = fallbackDataUrl;
              } else if (type === 'pdf') {
                  // If PDF and storage failed, read as DataURL fallback
                  finalUrl = await new Promise<string>((resolve) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result as string);
                      reader.readAsDataURL(file);
                  });
              }
          }

          if (finalUrl) {
              setFormData(prev => ({
                  ...prev,
                  attachmentUrl: finalUrl,
                  attachmentType: type,
                  attachmentName: file.name
              }));
          } else {
              alert('Failed to upload file. Please try again.');
          }
      } catch (err) {
          console.error("Upload failed", err);
          alert('Failed to upload file. Please try again.');
      } finally {
          setUploadingAttachment(false);
          setUploadStatus('');
      }
  };

  const openNoticePanel = (notice?: any) => {
      if (notice) {
          setEditingId(notice.id);
          setFormData({
              title: notice.title, message: notice.message, date: notice.date,
              validUntil: notice.validUntil || '', priority: notice.priority,
              targets: notice.targets || ['All'], isPinned: notice.isPinned || false,
              status: notice.status,
              attachmentUrl: notice.attachmentUrl || '',
              attachmentType: notice.attachmentType || '',
              attachmentName: notice.attachmentName || '',
              displayDurationDays: notice.displayDurationDays !== undefined ? notice.displayDurationDays : 7
          });
      } else {
          setEditingId(null);
          setFormData({
              title: '', message: '', date: formatBSDateYMD(new Date()),
              validUntil: '', priority: 'Normal', targets: ['All'], isPinned: false, status: 'Published',
              attachmentUrl: '', attachmentType: '', attachmentName: '',
              displayDurationDays: 7
          });
      }
      setIsPanelOpen(true);
  };

  // Stats for Admin
  const totalPublished = allNotices.filter(n => n.status === 'Published').length;
  const urgentActive = allNotices.filter(n => n.priority === 'Urgent' && n.status === 'Published').length;
  const currentMonthCount = allNotices.filter(n => n.date.startsWith(new Date().toISOString().slice(0,7))).length;
  // A rough unread estimate for admin (assuming total students = 100 for now as an example, since we can't easily count total targeted users accurately without a huge query)
  // We'll just sum all missing reads based on a rough 50 student baseline for UI sake
  const unreadRoughCount = allNotices.reduce((acc, curr) => acc + (curr.status === 'Published' && curr.readBy?.length === 0 ? 1 : 0), 0);

  return (
    <div className="relative h-full flex flex-col pb-20 md:pb-8">
      <Helmet>
        <title>Notice Board | Shikshantar Academy</title>
        <meta name="description" content="Stay updated with the latest notices, announcements, and news from Shikshantar Academy." />
        <link rel="canonical" href="https://www.shikshantaracademy.edu.np/notices" />
      </Helmet>
      
      {/* HEADER SECTION */}
      {role === 'admin' ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
             {[
               { title: "Total Published", value: totalPublished, icon: Megaphone, color: "text-blue-500", bg: "bg-blue-50" },
               { title: "Urgent Active", value: urgentActive, icon: AlertCircle, color: "text-red-500", bg: "bg-red-50" },
               { title: "This Month", value: currentMonthCount, icon: Calendar, color: "text-green-500", bg: "bg-green-50" },
               { title: "Zero Reads", value: unreadRoughCount, icon: Eye, color: "text-orange-500", bg: "bg-orange-50" }
             ].map((stat, idx) => (
                <motion.div 
                  key={stat.title}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05, duration: 0.4 }}
                  whileHover={{ y: -3, boxShadow: "0 8px 20px -6px rgba(0,0,0,0.06)" }}
                  className="bg-white p-5 rounded-2xl shadow-sm border border-gray-150 flex items-center justify-between"
                >
                   <div>
                      <span className="text-xs font-bold text-gray-500 tracking-wider uppercase block mb-1">{stat.title}</span>
                      <span className="text-3xl font-black text-gray-900">{stat.value}</span>
                   </div>
                   <div className={`${stat.bg} p-3 rounded-2xl`}>
                      <stat.icon className={`w-6 h-6 ${stat.color}`} />
                   </div>
                </motion.div>
             ))}
          </div>
      ) : (
          <div className="mb-8 relative rounded-2xl group transition-all duration-300">
            {/* Outer Glow Bloom aura */}
            <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-35 blur-2xl transition-all duration-500 rounded-2xl -z-10 group-hover:scale-102 pointer-events-none" />

            {/* Boundary box with rotating gradient for lightning border effect */}
            <div className="relative w-full h-full rounded-2xl overflow-hidden p-[2.5px] bg-gray-150 dark:bg-slate-800 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-md">
              {/* Spinning lightning border */}
              <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_5s_linear_infinite] opacity-35 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

              {/* Inner masked content card */}
              <div className="relative w-full h-full bg-gradient-to-r from-blue-900 to-indigo-950 p-6 rounded-[14px] text-white z-10 overflow-hidden flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                 <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />
                 <div className="relative z-10">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 mb-2.5 rounded-full bg-white/10 text-xs text-amber-300 font-bold uppercase tracking-wider">
                       <Bell className="w-3.5 h-3.5 text-amber-300 animate-bounce" /> Announcement Hub
                    </span>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight">Notice Board {role === 'student' && studentClass ? `— ${studentClass}` : ''}</h1>
                    <p className="text-blue-100/80 text-sm mt-1 max-w-xl">Stay updated with official scholarly directives, events, and school notices.</p>
                 </div>
                 
                 {/* New notices count block */}
                 <motion.div 
                   whileHover={{ scale: 1.05 }}
                   className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-5 py-3 rounded-2xl font-bold flex items-center gap-3 relative shrink-0 z-10"
                 >
                    <div className="inline-flex rounded-full h-3 w-3 bg-amber-400"></div>
                    <div>
                       <div className="text-xs text-blue-200/90 font-bold uppercase tracking-wider">Unread Announcements</div>
                       <div className="text-lg font-black text-amber-300">
                         {allNotices.filter(n => !n.readBy?.includes(currentUserId) && n.status === 'Published' && !localReads.includes(n.id)).length} Notices
                       </div>
                    </div>
                 </motion.div>
              </div>
            </div>
          </div>
      )}

      {/* DASHBOARD GRID SPAN */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
         {/* LEFT COLUMN: FILTER AND CUSTOM LIST (SPAN 8) */}
         <div className="col-span-1 lg:col-span-8 flex flex-col gap-6">

            {/* INLINE CREATE/EDIT NOTICE PANEL (Under Notice Board) */}
            {isPanelOpen && role === 'admin' && (
               <motion.div 
                  initial={{ opacity: 0, y: -15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl shadow-xl border border-blue-200 overflow-hidden flex flex-col mb-6"
               >
                  {/* Header */}
                  <div className="flex justify-between items-center px-6 py-4 bg-blue-50 border-b border-blue-100 shrink-0">
                     <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Megaphone className="w-5 h-5 text-blue-600" />
                        {editingId ? 'Edit Notice' : 'Create New Notice'}
                     </h2>
                     <button onClick={() => setIsPanelOpen(false)} className="p-2 hover:bg-blue-200 rounded-full transition-colors text-gray-600 cursor-pointer">
                        <X className="w-5 h-5" />
                     </button>
                  </div>

                  {/* Form Body */}
                  <div className="p-6 flex flex-col gap-5 bg-white">
                     <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Notice Title <span className="text-red-500">*</span></label>
                        <input 
                           type="text" 
                           maxLength={100}
                           value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})}
                           placeholder="e.g., Annual Sports Day 2081 Announcement"
                           className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                        />
                        <div className="text-right text-xs text-gray-400 mt-1">{formData.title.length}/100</div>
                     </div>

                     <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 relative">
                           <label className="block text-sm font-bold text-gray-700 mb-1">Notice Date (B.S.)</label>
                           <NepaliDatePicker
                             value={formData.date || ''}
                             onChange={(value) => setFormData({...formData, date: value})}
                             className="w-full block"
                             inputClassName="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm bg-transparent relative z-10"
                             options={{ calenderLocale: 'en', valueLocale: 'en' }}
                           />
                           {!formData.date && (
                             <div className="absolute left-4 top-[35px] pointer-events-none text-gray-400 font-bold text-sm tracking-widest z-0 opacity-70">
                               YYYY - MM - DD
                             </div>
                           )}
                           <Calendar className="w-4 h-4 text-gray-400 absolute right-4 top-[35px] pointer-events-none z-[11]" />
                        </div>
                        <div className="flex-1 relative">
                           <label className="block text-sm font-bold text-gray-700 mb-1">Valid Until (B.S. Optional)</label>
                           <NepaliDatePicker
                             value={formData.validUntil || ''}
                             onChange={(value) => setFormData({...formData, validUntil: value})}
                             className="w-full block"
                             inputClassName="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm bg-transparent relative z-10"
                             options={{ calenderLocale: 'en', valueLocale: 'en' }}
                           />
                           {!formData.validUntil && (
                             <div className="absolute left-4 top-[35px] pointer-events-none text-gray-400 font-bold text-sm tracking-widest z-0 opacity-70">
                               YYYY - MM - DD
                             </div>
                           )}
                           <Calendar className="w-4 h-4 text-gray-400 absolute right-4 top-[35px] pointer-events-none z-[11]" />
                        </div>
                     </div>

                     {/* Popup & Notification Validity Days */}
                     <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Popup & Notification Validity (Days)</label>
                        <input 
                           type="number" 
                           min="1" 
                           max="365"
                           value={formData.displayDurationDays} 
                           onChange={e => setFormData({...formData, displayDurationDays: Number(e.target.value) || 7})} 
                           className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                        <p className="text-xs text-gray-500 mt-1">Number of days this notice remains active in popups & notification count (Default is 7 days).</p>
                     </div>

                     {/* Priority & Pins row */}
                     <div className="flex flex-wrap gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <div className="flex-1 min-w-[150px]">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Priority Level</label>
                            <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <button type="button" onClick={() => setFormData({...formData, priority: 'Normal'})} className={`flex-1 py-1.5 text-sm font-bold ${formData.priority === 'Normal' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:opacity-90'}`}>Normal</button>
                                <button type="button" onClick={() => setFormData({...formData, priority: 'Urgent'})} className={`flex-1 py-1.5 text-sm font-bold ${formData.priority === 'Urgent' ? 'bg-red-100 text-red-700' : 'text-gray-500 hover:opacity-90'}`}>Urgent</button>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto sm:ml-auto">
                           <input type="checkbox" id="pinnedStatus" checked={formData.isPinned} onChange={e => setFormData({...formData, isPinned: e.target.checked})} className="w-5 h-5 rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
                           <label htmlFor="pinnedStatus" className="text-sm font-bold text-gray-700 flex items-center gap-1 cursor-pointer select-none"><Pin className="w-4 h-4 text-orange-500"/> Pin Notice to Top</label>
                        </div>
                     </div>

                     {/* Target Audience */}
                     <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Target Audience <span className="text-red-500">*</span></label>
                        <div className="flex flex-wrap gap-2">
                           {TARGET_OPTIONS.map(opt => (
                              <button 
                                key={opt}
                                type="button"
                                onClick={() => {
                                    let newTargets = [...formData.targets];
                                    if (opt === 'All') { 
                                       newTargets = newTargets.filter(t => t === 'Guest User'); 
                                       newTargets.push('All'); 
                                    }
                                    else if (opt === 'Guest User') {
                                       if (newTargets.includes('Guest User')) {
                                          newTargets = newTargets.filter(t => t !== 'Guest User');
                                       } else {
                                          newTargets.push('Guest User');
                                       }
                                    }
                                    else {
                                       newTargets = newTargets.filter(t => t !== 'All'); 
                                       if (newTargets.includes(opt)) newTargets = newTargets.filter(t => t !== opt);
                                       else newTargets.push(opt);
                                    }
                                    if (newTargets.length === 0) newTargets = ['Admin Only'];
                                    setFormData({...formData, targets: newTargets});
                                }}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${formData.targets.includes(opt) ? 'bg-gray-800 text-white border-gray-800 scale-105' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                              >
                                 {opt}
                              </button>
                           ))}
                        </div>
                     </div>

                     {/* Rich Text Area */}
                     <div className="flex flex-col min-h-[250px]">
                        <label className="block text-sm font-bold text-gray-700 mb-1">Message Body</label>
                        <div className="border border-gray-200 rounded-xl overflow-hidden flex flex-col bg-white">
                           <ReactQuill
                              theme="snow"
                              value={formData.message}
                              onChange={(content) => setFormData({...formData, message: content})}
                              className="w-full h-[220px] mb-12"
                              modules={{
                                 toolbar: [
                                   ['bold', 'italic', 'underline'],
                                   [{'list': 'ordered'}, {'list': 'bullet'}, { 'align': [] }],
                                 ]
                              }}
                           />
                        </div>
                     </div>

                     {/* Attachment Upload */}
                     <div className="flex flex-col mt-4">
                        <label className="block text-sm font-bold text-gray-700 mb-1">
                           Attachment (Notice Circular Photo / PDF) 
                           <span className="text-xs text-emerald-600 font-semibold ml-2">⚡ Auto-compressed for instant loading</span>
                        </label>
                        {formData.attachmentUrl ? (
                            <div className="flex items-center justify-between p-3 border border-blue-200 bg-blue-50/80 text-blue-900 rounded-xl text-sm font-medium">
                               <div className="flex items-center gap-3 truncate">
                                  {formData.attachmentType === 'image' ? (
                                     <div className="w-10 h-10 rounded-lg overflow-hidden border border-blue-200 bg-white shrink-0">
                                        <img src={formData.attachmentUrl} alt="Preview" className="w-full h-full object-cover" />
                                     </div>
                                  ) : (
                                     <div className="p-2.5 bg-red-600 text-white rounded-lg shrink-0">
                                        <FileText className="w-4 h-4" />
                                     </div>
                                  )}
                                  <div className="truncate">
                                     <span className="font-bold text-slate-800 truncate block">{formData.attachmentName || 'Attached File'}</span>
                                     <span className="text-[11px] text-emerald-600 font-bold uppercase">Ready for Pop-up & Notice Board</span>
                                  </div>
                               </div>
                               <button 
                                  type="button"
                                  onClick={() => setFormData({...formData, attachmentUrl: '', attachmentType: '', attachmentName: ''})} 
                                  className="text-slate-400 hover:text-red-600 p-2 bg-white hover:bg-red-50 rounded-lg border border-slate-200 transition-colors cursor-pointer" 
                                  title="Remove Attachment"
                               >
                                  <Trash2 className="w-4 h-4" />
                               </button>
                            </div>
                        ) : (
                            <div className="flex items-center">
                               <label className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-blue-50/50 hover:border-blue-300 transition-all ${uploadingAttachment ? 'border-blue-400 bg-blue-50/40 pointer-events-none' : 'border-slate-300'}`}>
                                  <div className="flex flex-col items-center justify-center py-4 text-slate-600">
                                     {uploadingAttachment ? (
                                         <div className="flex flex-col items-center gap-2 font-bold text-sm text-blue-600">
                                             <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                             <span>{uploadStatus || 'Optimizing & Uploading...'}</span>
                                             <span className="text-[11px] font-normal text-slate-500">Auto-downscaling high resolution photo</span>
                                         </div>
                                     ) : (
                                         <>
                                             <Upload className="w-7 h-7 mb-1 text-blue-600" />
                                             <p className="text-sm font-bold text-slate-700">Click to upload notice photo or PDF</p>
                                             <p className="text-[11px] text-slate-400 mt-0.5">Supports high-res JPG, PNG, WebP, PDF (instant compression)</p>
                                         </>
                                     )}
                                  </div>
                                  <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleAttachmentUpload} disabled={uploadingAttachment} />
                               </label>
                            </div>
                        )}
                     </div>

                     {/* Footer Buttons */}
                     <div className="border-t border-gray-100 pt-4 mt-2 flex justify-end gap-3">
                        {formData.status === 'Draft' || !editingId ? (
                            <button type="button" onClick={() => handleSaveNotice('Draft')} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-sm transition-colors cursor-pointer">
                               Save Draft
                            </button>
                        ) : null}
                        <button type="button" onClick={() => handleSaveNotice('Published')} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm shadow-md transition-colors flex items-center gap-2 cursor-pointer">
                           Publish Notice
                        </button>
                     </div>
                  </div>
               </motion.div>
            )}
            
            {/* FILTER BAR SECTION */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-3.5 rounded-2xl shadow-sm border border-gray-150 flex flex-col lg:flex-row gap-4 items-center justify-between"
            >
               <div className="relative w-full lg:w-72 bg-transparent">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold" />
                  <input 
                    type="text" 
                    placeholder="Search announcements..." 
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 hover:bg-gray-100/50 focus:bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/25 transition-all"
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  />
               </div>
               <div className="flex overflow-x-auto gap-2 w-full lg:w-auto pb-1 lg:pb-0 scrollbar-hide">
                  {['All', 'Urgent', 'Normal', 'Unread'].map(f => (
                     <button 
                        key={f} 
                        onClick={() => setFilterPriority(f)}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all tracking-wide ${filterPriority === f ? 'bg-primary text-white shadow-sm scale-102' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer'}`}
                     >
                       {f} {f === 'Unread' && `(${allNotices.filter(n => !n.readBy?.includes(currentUserId) && n.status === 'Published' && !localReads.includes(n.id)).length})`}
                     </button>
                  ))}
                  {role === 'admin' && (
                     <div className="relative">
                        <select 
                           className="px-4 py-1.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border-none outline-none appearance-none cursor-pointer pr-6 hover:bg-gray-200"
                           value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                        >
                           <option value="All">All Status</option>
                           <option value="Published">Published</option>
                           <option value="Draft">Draft</option>
                           <option value="Archived">Archived</option>
                        </select>
                        <ChevronRight className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 rotate-90 pointer-events-none" />
                     </div>
                  )}
               </div>
            </motion.div>

            {/* NOTICES STREAM LIST */}
            <div className="flex flex-col gap-4">
               {loading ? (
                   <div className="space-y-4">
                     {[1, 2, 3].map((i) => (
                       <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex gap-4 animate-pulse">
                         <div className="flex-1 space-y-3">
                           <div className="w-24 h-5 bg-gray-200 rounded-full"></div>
                           <div className="w-3/4 h-6 bg-gray-200 rounded"></div>
                           <div className="w-full h-4 bg-gray-200 rounded"></div>
                           <div className="w-2/3 h-4 bg-gray-200 rounded"></div>
                         </div>
                       </div>
                     ))}
                   </div>
               ) : visibleNotices.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white rounded-2xl p-12 flex flex-col items-center justify-center text-center shadow-sm border border-gray-200"
                  >
                     <div className="bg-gray-50 p-4 rounded-3xl mb-4">
                        <FileText className="w-12 h-12 text-gray-300" />
                     </div>
                     <h3 className="text-lg font-bold text-gray-900 mb-1">No Announcements Found</h3>
                     <p className="text-gray-500 max-w-md text-sm">There are no notices matching your chosen filter criteria right now. Check back later!</p>
                  </motion.div>
               ) : (
                  <div className="space-y-4">
                    <AnimatePresence mode="popLayout">
                       {visibleNotices.map((notice, idx) => {
                          const isExpanded = expandedNoticeId === notice.id;
                          const isUrgent = notice.priority === 'Urgent';
                          const isUnread = !notice.readBy?.includes(currentUserId) && role !== 'admin' && !localReads.includes(notice.id);
                          const isDraft = notice.status === 'Draft';
                          const displayDateString = formatBSDate(notice.date);

                          return (
                            <motion.div 
                               layout
                               initial={{ opacity: 0, y: 20 }}
                               animate={{ opacity: 1, y: 0 }}
                               exit={{ opacity: 0, scale: 0.95 }}
                               transition={{ type: "spring", stiffness: 350, damping: 28, delay: Math.min(idx * 0.04, 0.2) }}
                               key={notice.id} 
                               id={`notice-${notice.id}`}
                               className="relative rounded-2xl group transition-all duration-300 cursor-pointer"
                               onClick={() => {
                                   if (!isExpanded) {
                                      setExpandedNoticeId(notice.id);
                                   } else {
                                      setExpandedNoticeId(null);
                                   }
                               }}
                            >
                               {/* Outer Glow Bloom aura */}
                               <div className={`absolute inset-2 ${isUrgent ? 'bg-gradient-to-r from-red-600 via-amber-500 to-rose-600' : 'bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500]'} opacity-0 group-hover:opacity-30 blur-2xl transition-all duration-500 rounded-2xl -z-10 group-hover:scale-102 pointer-events-none`} />

                               {/* Boundary box with rotating gradient for lightning border effect */}
                               <div className={`relative w-full h-full rounded-2xl overflow-hidden p-[2.5px] transition-all duration-300 ${isUrgent ? 'bg-red-200 dark:bg-red-900/45' : isExpanded ? 'bg-indigo-400 dark:bg-indigo-900/60' : 'bg-gray-150 dark:bg-slate-800'} group-hover:bg-transparent flex flex-col shadow-sm`}>
                                 {/* Spinning lightning border */}
                                 <div className={`absolute inset-[-180%] ${isUrgent ? 'bg-[conic-gradient(from_0deg,#b91c1c,#f97316,#F0A500,#e11d48,#fb923c,#b91c1c)]' : 'bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)]'} animate-[spin_5s_linear_infinite] opacity-35 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none`} />

                                 {/* Inner masked content card */}
                                 <div className="relative w-full h-full bg-white dark:bg-slate-900 rounded-[14px] flex flex-col overflow-hidden z-10">
                                   {/* Left Border Accent Stripe */}
                                   <div className={`absolute left-0 top-0 bottom-0 w-2 ${isUrgent ? 'bg-red-500' : isDraft ? 'bg-gray-400' : 'bg-primary'}`}></div>
                               
                               {/* Corner Pins & Status Markers */}
                               <div className="absolute right-4 top-4 flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                                  {role === 'admin' && (
                                      <button 
                                         onClick={() => handleDelete(notice)} 
                                         className="text-gray-300 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"
                                         title="Permanently Delete Notification"
                                      >
                                         <Trash2 className="w-[18px] h-[18px]" />
                                      </button>
                                  )}
                                  {isUnread && (
                                     <span className="inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                                  )}
                               </div>

                               <div className="p-6 pl-8">
                                  <div className="flex flex-wrap items-center gap-2 mb-2.5 pr-8">
                                     {notice.isPinned && (
                                        <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded flex items-center gap-1">
                                           <Pin className="w-3 h-3 text-amber-600 fill-amber-500" /> Pinned
                                        </span>
                                     )}
                                     {isUrgent && <span className="bg-red-100 text-red-700 text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider">Urgent</span>}
                                     {isDraft && <span className="bg-gray-100 text-gray-600 text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider">Draft</span>}
                                     {role === 'admin' && notice.targets?.slice(0, 2).map((t: string) => (
                                        <span key={t} className="bg-gray-100 text-gray-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">{t}</span>
                                     ))}
                                     {role === 'admin' && notice.targets?.length > 2 && <span className="text-xs text-gray-500">+{notice.targets.length - 2} more</span>}
                                  </div>

                                  <h3 className={`text-lg font-extrabold mb-1.5 pr-8 tracking-tight ${isUrgent ? 'text-red-950' : 'text-gray-900 group-hover:text-primary transition-colors'}`}>{notice.title}</h3>
                                  
                                  <div className="flex items-center justify-between text-xs font-semibold text-gray-500 gap-2 flex-wrap">
                                     <div className="flex items-center gap-4">
                                        <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-gray-400" />Posted: {displayDateString}</span>
                                        {notice.validUntil && <span className="flex items-center gap-1.5 hidden sm:flex"><Clock className="w-4 h-4 text-gray-400" />Valid: {formatBSDate(notice.validUntil)}</span>}
                                     </div>
                                     {isUnread && (
                                        <button
                                          onClick={(e) => {
                                             e.stopPropagation();
                                             markAsRead(notice.id, notice.readBy || []);
                                          }}
                                          className="px-3.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-full font-bold transition-all shrink-0 flex items-center gap-1.5 hover:scale-103 active:scale-97 cursor-pointer"
                                        >
                                           <CheckCircle className="w-3.5 h-3.5" /> Mark as Read
                                        </button>
                                     )}
                                  </div>

                                  {/* Expanding Contents with Smooth Framer Motion */}
                                  <AnimatePresence initial={false}>
                                     {isExpanded ? (
                                        <motion.div 
                                           initial={{ height: 0, opacity: 0 }}
                                           animate={{ height: "auto", opacity: 1 }}
                                           exit={{ height: 0, opacity: 0 }}
                                           transition={{ type: "spring", stiffness: 300, damping: 26 }}
                                           className="overflow-hidden"
                                        >
                                           <div className="mt-4 pt-4 border-t border-gray-150 animate-in fade-in-20 duration-300">
                                              <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed text-[15px]" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(notice.message) }}></div>
                                              
                                              {/* Attachment Block */}
                                              {notice.attachmentUrl && (
                                                 <div className="mt-6 p-4 bg-gray-50 hover:bg-gray-100/50 rounded-2xl border border-gray-150 transition-colors">
                                                    <div className="font-bold text-sm text-gray-800 mb-3 flex items-center gap-2">
                                                       <Paperclip className="w-4 h-4 text-indigo-500" /> Attached Document
                                                    </div>
                                                    {notice.attachmentType === 'image' ? (
                                                        <img src={notice.attachmentUrl} alt={notice.attachmentName || 'Notice Attachment'} className="max-w-full h-auto max-h-96 rounded-xl shadow-sm border border-gray-200" />
                                                    ) : notice.attachmentType === 'pdf' ? (
                                                        <a href={notice.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 shadow-sm py-2.5 bg-white text-indigo-700 hover:text-indigo-800 hover:bg-indigo-50 font-bold rounded-xl transition-all border border-indigo-150 text-sm hover:scale-102">
                                                           <FileText className="w-4 h-4 text-indigo-500"/> View PDF Attachment
                                                        </a>
                                                    ) : (
                                                        <a href={notice.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 shadow-sm py-2.5 bg-white text-gray-700 hover:bg-gray-105 font-bold rounded-xl transition-all border border-gray-200 text-sm hover:scale-102">
                                                           <FileText className="w-4 h-4 text-gray-400"/> View File Attachment
                                                        </a>
                                                    )}
                                                 </div>
                                              )}

                                              {/* Notice & Admin Actions */}
                                              <div className="flex flex-wrap items-center gap-2 mt-6 pt-4 border-t border-gray-150" onClick={(e) => e.stopPropagation()}>
                                                 <button 
                                                    onClick={() => triggerNoticePopup(notice)} 
                                                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-50 text-amber-900 hover:bg-amber-100 rounded-lg text-sm font-bold transition-all cursor-pointer"
                                                    title="View notice in full pop-up modal"
                                                 >
                                                    <Eye className="w-4 h-4 text-amber-600"/> Pop-up View
                                                 </button>
                                                 {role === 'admin' && (
                                                    <>
                                                       <button onClick={() => openNoticePanel(notice)} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-sm font-bold transition-all"><Edit2 className="w-4 h-4"/> Edit</button>
                                                       <button onClick={() => handleDuplicate(notice)} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gray-50 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-bold transition-all"><Copy className="w-4 h-4"/> Duplicate</button>
                                                       <button onClick={() => handleDelete(notice)} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-50 text-red-650 hover:bg-red-100 rounded-lg text-sm font-bold transition-all ml-auto"><Trash2 className="w-4 h-4"/> Delete</button>
                                                    </>
                                                 )}
                                              </div>
                                           </div>
                                        </motion.div>
                                     ) : (
                                        <div className="text-sm text-gray-650 line-clamp-2 mt-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(notice.message) }}></div>
                                     )}
                                  </AnimatePresence>
                               </div>
                             </div>
                           </div>
                        </motion.div>
                          );
                       })}
                    </AnimatePresence>
                  </div>
               )}
            </div>
         </div>

         {/* RIGHT COLUMN: SIDEBAR WIDGETS (SPAN 4) */}
         <div className="col-span-1 lg:col-span-4 flex flex-col gap-6">
            
            {/* 1. VISUAL NEPALI CALENDAR TEAR-OFF WIDGET */}
            <motion.div 
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               transition={{ delay: 0.1, duration: 0.5 }}
               className="relative rounded-2xl group transition-all duration-300"
            >
               {/* Outer Glow Bloom aura */}
               <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-30 blur-2xl transition-all duration-500 rounded-2xl -z-10 group-hover:scale-102 pointer-events-none" />

               {/* Boundary box with rotating gradient for lightning border effect */}
               <div className="relative w-full h-full rounded-2xl overflow-hidden p-[2.5px] bg-gray-150 dark:bg-slate-800 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-sm">
                 {/* Spinning lightning border */}
                 <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_5s_linear_infinite] opacity-35 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

                 {/* Inner masked content card */}
                 <div className="relative w-full h-full bg-white dark:bg-slate-900 rounded-[14px] flex flex-col overflow-hidden z-10">
                    {/* Binder rings illustration */}
                    <div className="bg-gradient-to-r from-red-600 to-rose-700 px-5 py-3 text-white font-extrabold text-xs uppercase tracking-wider text-center relative">
                       <div className="absolute -bottom-1.5 inset-x-0 flex justify-around px-8">
                          {[1, 2, 3, 4, 5, 6].map(i => (
                             <div key={i} className="w-2.5 h-6 bg-gray-300 border border-gray-400 rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] shrink-0 z-10" />
                          ))}
                       </div>
                       📅 Nepali BS Calendar
                    </div>
                    
                    <div className="p-6 pt-8 flex flex-col items-center bg-gradient-to-b from-gray-50 to-white dark:from-slate-850 dark:to-slate-900 text-center">
                       <div className="w-full max-w-[180px] bg-white dark:bg-slate-800 rounded-2xl border-2 border-gray-100 dark:border-slate-700 shadow-md p-4 relative flex flex-col items-center mt-2.5">
                          <span className="text-sm font-black text-red-600 uppercase tracking-widest font-mono">
                            {formatBSDate(formatBSDateYMD(new Date())).split(' ')[0]} {/* Grab Nepali Month Name, e.g. Asar */}
                          </span>
                          <span className="text-6xl font-black text-gray-900 dark:text-white my-2 font-sans tracking-tighter">
                            {formatBSDate(formatBSDateYMD(new Date())).split(' ')[1]?.replace(',', '') || '01'}
                          </span>
                          <span className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest font-mono">
                            {formatBSDate(formatBSDateYMD(new Date())).split(' ')[2] || '2083 B.S.'}
                          </span>
                       </div>
                       
                       {/* Informative scholar slogan */}
                       <div className="mt-5 text-xs text-gray-500 dark:text-slate-350 italic px-4 leading-relaxed relative">
                          <span className="text-2xl text-gray-300 dark:text-slate-700 font-serif absolute -top-3.5 left-0">“</span>
                          <p className="relative z-10 text-center text-gray-650 dark:text-slate-300 font-medium">"An investment in knowledge pays the best interest."</p>
                          <span className="text-2xl text-gray-300 dark:text-slate-700 font-serif absolute -bottom-6 right-0">”</span>
                       </div>
                    </div>
                 </div>
               </div>
            </motion.div>

            {/* 2. PRIORITY ALERTS COMPACT FEED */}
            {visibleNotices.filter(n => n.priority === 'Urgent' || n.isPinned).length > 0 && (
               <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15, duration: 0.5 }}
                  className="relative rounded-2xl group transition-all duration-300"
               >
                  {/* Outer Glow Bloom aura */}
                  <div className="absolute inset-2 bg-gradient-to-r from-red-600 via-amber-500 to-rose-600 opacity-0 group-hover:opacity-30 blur-2xl transition-all duration-500 rounded-2xl -z-10 group-hover:scale-102 pointer-events-none" />

                  {/* Boundary box with rotating gradient for lightning border effect */}
                  <div className="relative w-full h-full rounded-2xl overflow-hidden p-[2.5px] bg-gray-150 dark:bg-slate-800 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-sm">
                    {/* Spinning lightning border */}
                    <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#b91c1c,#f97316,#F0A500,#e11d48,#fb923c,#b91c1c)] animate-[spin_5s_linear_infinite] opacity-35 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

                    {/* Inner masked content card */}
                    <div className="relative w-full h-full bg-white dark:bg-slate-900 rounded-[14px] p-5 z-10 overflow-hidden flex flex-col">
                       <h4 className="text-sm font-extrabold text-gray-900 dark:text-white border-b border-gray-100 dark:border-slate-800 pb-3 mb-3 flex items-center gap-2">
                          <Flame className="w-4 h-4 text-red-500 animate-pulse fill-red-100" /> Critical Bulletins
                       </h4>
                       <div className="flex flex-col gap-3 max-h-[250px] overflow-y-auto custom-scrollbar">
                          {visibleNotices.filter(n => n.priority === 'Urgent' || n.isPinned).map(notice => (
                             <div 
                                key={notice.id}
                                onClick={() => {
                                   setExpandedNoticeId(notice.id);
                                   const el = document.getElementById(`notice-${notice.id}`);
                                   el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }}
                                className="p-3 bg-red-50/50 dark:bg-red-950/20 hover:bg-orange-50/80 dark:hover:bg-orange-950/25 rounded-xl border border-red-100/60 dark:border-red-900/40 cursor-pointer transition-all flex items-start gap-2.5 group/bulletin"
                             >
                                {notice.priority === 'Urgent' ? (
                                   <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                ) : (
                                   <Pin className="w-4 h-4 text-orange-500 shrink-0 mt-0.5 fill-orange-400" />
                                )}
                                <div className="flex-1 overflow-hidden">
                                   <p className="text-xs font-extrabold text-gray-800 dark:text-slate-200 truncate group-hover/bulletin:text-primary transition-colors leading-tight">{notice.title}</p>
                                   <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5 font-bold">{formatBSDate(notice.date)}</p>
                                </div>
                             </div>
                          ))}
                       </div>
                    </div>
                  </div>
               </motion.div>
            )}

            {/* 3. READING METRIC CLOUD */}
            {role !== 'admin' && (
               <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="relative rounded-2xl group transition-all duration-300"
               >
                  {/* Outer Glow Bloom aura */}
                  <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-30 blur-2xl transition-all duration-500 rounded-2xl -z-10 group-hover:scale-102 pointer-events-none" />

                  {/* Boundary box with rotating gradient for lightning border effect */}
                  <div className="relative w-full h-full rounded-2xl overflow-hidden p-[2.5px] bg-gray-150 dark:bg-slate-800 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-sm">
                    {/* Spinning lightning border */}
                    <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_5s_linear_infinite] opacity-35 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

                    {/* Inner masked content card */}
                    <div className="relative w-full h-full bg-white dark:bg-slate-900 rounded-[14px] p-5 text-center z-10 overflow-hidden flex flex-col">
                       <h4 className="text-sm font-extrabold text-gray-900 dark:text-white border-b border-gray-100 dark:border-slate-800 pb-3 mb-4 flex items-center justify-center gap-2">
                          <UserCheck className="w-4 h-4 text-green-500" /> Announcement Progress
                       </h4>
                       {(() => {
                          const totalPub = allNotices.filter(n => n.status === 'Published').length;
                          const readDocsCount = allNotices.filter(n => n.status === 'Published' && (n.readBy?.includes(currentUserId) || localReads.includes(n.id))).length;
                          const percent = totalPub > 0 ? Math.round((readDocsCount / totalPub) * 100) : 100;
                          return (
                             <div className="flex flex-col items-center">
                                {/* Outer Gauge Bar */}
                                <div className="w-full h-3 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden relative mb-3">
                                   <motion.div 
                                      initial={{ width: 0 }}
                                      animate={{ width: `${percent}%` }}
                                      transition={{ delay: 0.5, duration: 0.8, ease: "easeOut" }}
                                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"
                                   />
                                </div>
                                <div className="flex justify-between items-center w-full text-xs font-bold text-gray-600 dark:text-slate-350">
                                   <span>{readDocsCount} of {totalPub} Read</span>
                                   <span className="text-indigo-600 dark:text-indigo-400">{percent}% Completion</span>
                                </div>
                             </div>
                          );
                       })()}
                    </div>
                  </div>
               </motion.div>
            )}
         </div>
      </div>

      {/* ADMIN FLOATING CREATE BUTTON */}
      {role === 'admin' && (
         <button 
            onClick={() => openNoticePanel()}
            className="fixed bottom-6 right-6 md:bottom-10 md:right-10 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-[0_8px_30px_rgba(37,99,235,0.4)] flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-40 cursor-pointer"
         >
            <Plus className="w-6 h-6" />
         </button>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200">
              <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2 text-red-600">
                 <Trash2 className="w-5 h-5"/> Delete Notice
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                 Are you sure you want to permanently delete this notice?
                 <br/><br/>
                 It will be erased permanently from the database and removed from the view of: <span className="font-bold">{Array.isArray(deleteConfirm.targets) && deleteConfirm.targets.length > 0 ? deleteConfirm.targets.join(', ') : (deleteConfirm.targets || 'all users')}</span>.
              </p>
              
              <div className="flex justify-end gap-3 mt-6">
                 <button 
                    onClick={() => setDeleteConfirm(null)}
                    className="px-4 py-2 font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                 >
                    Cancel
                 </button>
                 <button 
                    onClick={confirmDelete}
                    className="px-4 py-2 font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm transition-colors"
                 >
                    Delete Permanently
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
