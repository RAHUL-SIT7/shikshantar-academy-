import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { Helmet } from 'react-helmet-async';
import { HelpCircle, Search, Edit2, Trash2, Plus, ArrowUp, ArrowDown, ChevronDown, ChevronUp, MapPin, Mail, Phone } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';

const initialFAQs = [
  // ADMISSIONS
  {
    id: 1, category: "Admissions",
    question: "Why choose Shikshantar Academy?",
    answer: "Shikshantar Academy offers a holistic educational environment that balances academic rigor with moral development, ensuring students are well-prepared for both board examinations and real-world challenges. Our institution fosters a nurturing culture where every child is encouraged to explore their potential through modern, interactive, and value-based learning methodologies.",
    published: true, order: 0
  },
  {
    id: 101, category: "Academics",
    question: "How does Shikshantar Academy cover curriculum and student development details?",
    answer: "We provide comprehensive coverage of our curriculum by integrating traditional academic subjects with practical life skills, ensuring a well-rounded educational experience from Playgroup to Grade 10. Our approach involves continuous assessment, personalized mentorship, and regular communication with parents to track student progress and address individual learning needs effectively.",
    published: true, order: 0
  },
  {
    id: 2, category: "Admissions",
    question: "What is the admission process for new students?",
    answer: "Parents can fill the online admission form on our website or visit the school office in person. Required documents include: birth certificate, previous school marksheet (if applicable), passport-size photo, and guardian's citizenship copy. After form submission, the admin team will contact you within 2-3 working days.",
    published: true, order: 2
  },
  {
    id: 3, category: "Admissions",
    question: "What is the age requirement for Play Group admission?",
    answer: "Children must be at least 3.5 years old (by Shrawan 1 of the academic year) to be eligible for Play Group admission. For Class 1, children must be at least 5 years old.",
    published: true, order: 3
  },
  {
    id: 4, category: "Admissions",
    question: "Is there an entrance exam for admission?",
    answer: "For Play Group to Class 5, there is no entrance exam. For Class 6 and above, a basic assessment in Nepali, English, and Mathematics is conducted. This is not a competitive exam but helps us understand the student's current level.",
    published: true, order: 4
  },
  // FEES
  {
    id: 5, category: "Fee & Payment",
    question: "What is the monthly fee structure?",
    answer: "Fee structure for academic year 2083 B.S.: Play Group to Class 9 fees vary. Please check with administration. Annual exam fee is charged separately once per year.",
    published: true, order: 1
  },
  {
    id: 6, category: "Fee & Payment",
    question: "What payment methods are accepted?",
    answer: "We only accept Cash payments at the school fee office.",
    published: true, order: 2
  },
  {
    id: 7, category: "Fee & Payment",
    question: "What happens if fee is not paid on time?",
    answer: "Fees are due by the 15th of each month (B.S.). After 30 days of non-payment, the account is marked as defaulter. Parents will be contacted via phone. Students will not be allowed to sit for terminal exams if 3 or more months of fees are unpaid.",
    published: true, order: 3
  },
  {
    id: 8, category: "Fee & Payment",
    question: "Is there any scholarship or fee concession available?",
    answer: "Yes, Shikshantar Academy offers merit scholarships for students scoring above 90% in the Final Exam. Need-based concessions are also available for families facing financial hardship. Contact the school office with supporting documents to apply.",
    published: true, order: 4
  },
  // ACADEMICS
  {
    id: 9, category: "Academics",
    question: "What medium of instruction is used?",
    answer: "Shikshantar Academy follows English medium instruction for most subjects. Nepali language and Social Studies are taught in Nepali. We follow the national curriculum prescribed by CDC, Nepal.",
    published: true, order: 1
  },
  {
    id: 10, category: "Academics",
    question: "How many exams are held per year?",
    answer: "We conduct 4 examinations per academic year: First Terminal Examination, Second Terminal Examination, Third Terminal Examination, and Final Examination. Results are published on the student portal after each exam.",
    published: true, order: 2
  },
  {
    id: 11, category: "Academics",
    question: "How can students check their exam results?",
    answer: "Students can log into the Shikshantar Academy portal using their student ID and password. Results are published by the admin after each examination. A downloadable report card is also available once results are published.",
    published: true, order: 3
  },
  {
    id: 12, category: "Academics",
    question: "What is the grading system used?",
    answer: "We follow the Nepal government grading system: A+ (90-100%), A (80-89%), B+ (70-79%), B (60-69%), C+ (50-59%), C (40-49%), D (30-39%), NG/Fail (below 30%). Minimum pass marks is 35 out of 100.",
    published: true, order: 4
  },
  // SCHOOL LIFE
  {
    id: 13, category: "School Life",
    question: "What are the school timings?",
    answer: "School hours: Monday to Friday, 9:30 AM to 4:00 PM (local time). Saturday and Sunday are holidays. During winter months (Poush-Magh), school may open at 10:00 AM. Parents will be notified of any timing changes via the Notice Board on the portal.",
    published: true, order: 1
  },
  {
    id: 14, category: "School Life",
    question: "What facilities does the school provide?",
    answer: "Shikshantar Academy provides: well-equipped classrooms, a computer lab, a library, a science lab (for Class 8+), a playground, clean drinking water, and separate washroom facilities for boys and girls.",
    published: true, order: 2
  },
  {
    id: 15, category: "School Life",
    question: "How are parents informed about school notices?",
    answer: "All important notices are posted on the school portal's Notice Board. Parents can view notices by logging in with their child's account or by visiting the school. For urgent notices, WhatsApp messages are sent to guardian phone numbers on record.",
    published: true, order: 3
  },
  // TECHNICAL/PORTAL
  {
    id: 16, category: "Portal & Technical",
    question: "How do I get my student login credentials?",
    answer: "Student login credentials (Student ID and default password) are provided by the school admin at the time of admission or at the start of the academic year. Contact the school office if you have not received your login details.",
    published: true, order: 1
  },
  {
    id: 17, category: "Portal & Technical",
    question: "I forgot my password. What should I do?",
    answer: "If you have forgotten your password, please contact the school admin directly. The admin can reset your password from the Administrative User Management section. You will be given a new temporary password to log in and change it.",
    published: true, order: 2
  },
  {
    id: 18, category: "Portal & Technical",
    question: "Can parents access the student portal?",
    answer: "Currently, parents can access the portal using their child's student credentials. A dedicated parent login feature is planned for the next academic year. Parents can view their child's results, fee status, and school notices this way.",
    published: true, order: 3
  }
];

export default function FAQ() {
  const [faqs, setFaqs] = useState(initialFAQs);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [openIds, setOpenIds] = useState<number[]>([]);
  
  const userRole = auth.currentUser ? (localStorage.getItem('userRole') || 'student') : 'guest';
  const trueAdmin = auth.currentUser ? userRole === 'admin' : false;
  const [previewAsStudent, setPreviewAsStudent] = useState(false);
  const isAdmin = trueAdmin && !previewAsStudent;
  
  // Admin Filter States
  const [adminStatusFilter, setAdminStatusFilter] = useState("All");
  
  // Modal Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editingFaq, setEditingFaq] = useState<any>(null);
  const [toast, setToast] = useState('');

  const categories = ["All", "Admissions", "Fee & Payment", "Academics", "School Life", "Portal & Technical"];
  
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const toggleAccordion = (id: number) => {
    if (openIds.includes(id)) {
      setOpenIds(openIds.filter(i => i !== id));
    } else {
      setOpenIds([...openIds, id]);
    }
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingFaq.id) {
      setFaqs(faqs.map(f => f.id === editingFaq.id ? editingFaq : f));
      showToast("✓ FAQ saved successfully");
    } else {
      const newFaq = {
        ...editingFaq,
        id: Date.now(),
        order: faqs.filter(f => f.category === editingFaq.category).length + 1
      };
      setFaqs([...faqs, newFaq]);
      showToast("✓ FAQ added successfully");
    }
    setIsEditing(false);
    setEditingFaq(null);
  };

  const handleDelete = (id: number) => {
    if (window.confirm("Delete this question? Students will no longer see it.")) {
      setFaqs(faqs.filter(f => f.id !== id));
    }
  };

  const handleToggleStatus = (id: number) => {
    setFaqs(faqs.map(f => f.id === id ? { ...f, published: !f.published } : f));
  };

  const moveFaq = (id: number, direction: 'up' | 'down') => {
    const f = faqs.find(x => x.id === id);
    if (!f) return;
    const catFaqs = faqs.filter(x => x.category === f.category).sort((a,b) => a.order - b.order);
    const index = catFaqs.findIndex(x => x.id === id);
    if (direction === 'up' && index > 0) {
      const tempOrder = catFaqs[index].order;
      catFaqs[index].order = catFaqs[index - 1].order;
      catFaqs[index - 1].order = tempOrder;
    } else if (direction === 'down' && index < catFaqs.length - 1) {
      const tempOrder = catFaqs[index].order;
      catFaqs[index].order = catFaqs[index + 1].order;
      catFaqs[index + 1].order = tempOrder;
    }
    
    // Merge back
    const updated = faqs.map(x => {
      const match = catFaqs.find(c => c.id === x.id);
      return match ? match : x;
    });
    setFaqs(updated);
  };

  const filteredFAQs = faqs.filter(faq => {
    const matchesSearch = 
      faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = 
      selectedCategory === "All" || 
      faq.category === selectedCategory;
    const matchesStatus = 
      !isAdmin ? faq.published === true : 
      (adminStatusFilter === "All" ? true :
       adminStatusFilter === "Published" ? faq.published : !faq.published);
    return matchesSearch && matchesCategory && matchesStatus;
  }).sort((a,b) => a.order - b.order);

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Admissions': return 'bg-blue-100 text-blue-700';
      case 'Fee & Payment': return 'bg-green-100 text-green-700';
      case 'Academics': return 'bg-indigo-100 text-indigo-700';
      case 'School Life': return 'bg-orange-100 text-orange-700';
      case 'Portal & Technical': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  // Group by category for display
  const groupedFAQs: { [key: string]: typeof filteredFAQs } = {};
  filteredFAQs.forEach(f => {
    if (!groupedFAQs[f.category]) groupedFAQs[f.category] = [];
    groupedFAQs[f.category].push(f);
  });

  return (
    <div className="min-h-screen bg-[#F5F6FA] pb-12 pt-6">
      <Helmet>
        <title>FAQ & Help | Shikshantar Academy</title>
        <meta name="description" content="Find answers to frequently asked questions about Shikshantar Academy." />
        <link rel="canonical" href="https://www.shikshantaracademy.edu.np/faq" />
      </Helmet>
      
      <div className="max-w-[1000px] mx-auto px-4">
        
        {toast && (
          <div className="fixed top-4 right-4 z-50 bg-green-50 text-green-700 px-4 py-3 rounded shadow border border-green-200">
            {toast}
          </div>
        )}

        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
               <HelpCircle className="w-8 h-8 text-blue-600" />
               Frequently Asked Questions
            </h1>
            <p className="text-gray-500 mt-1 md:text-base text-sm">Find answers to common questions about Shikshantar Academy</p>
          </div>
          {trueAdmin && (
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => setPreviewAsStudent(!previewAsStudent)} 
                className={`text-sm font-bold px-3 py-1.5 rounded border transition-colors ${previewAsStudent ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-white text-gray-700 border-gray-300'}`}
              >
                {previewAsStudent ? 'Exit Preview' : 'Preview as Student'}
              </button>
              {!previewAsStudent && (
                <button 
                  onClick={() => { setEditingFaq({ category: 'Admissions', question: '', answer: '', published: true }); setIsEditing(true); }}
                  className="bg-primary text-white text-sm font-bold px-3 py-1.5 rounded flex items-center gap-1 hover:bg-primary-dark"
                >
                  <Plus className="w-4 h-4" /> Add New Question
                </button>
              )}
            </div>
          )}
        </div>

        {/* SEARCH & FILTERS */}
        {!isAdmin && (
          <div className="mb-8">
            <div className="relative mb-4">
              <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search questions..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-lg border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            {searchTerm && filteredFAQs.length === 0 && (
              <p className="text-gray-500 p-4 text-center">No questions found for '{searchTerm}'. Contact us at +977 9709867048, +977 9807790805</p>
            )}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide relative z-10">
              {categories.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`relative shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-300 ${selectedCategory === cat ? 'text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                >
                  {selectedCategory === cat && (
                    <motion.div 
                      layoutId="activeCategoryBg"
                      className="absolute inset-0 bg-[var(--primary)] rounded-full -z-10"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">
                    {cat} {cat !== 'All' && `(${faqs.filter(f => f.category === cat && (isAdmin || f.published)).length})`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ADMIN TOOLBAR */}
        {isAdmin && (
          <div className="bg-white p-4 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] mb-6 flex flex-col md:flex-row gap-4 justify-between items-end">
             <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
               <div className="flex flex-col">
                 <label className="text-xs font-bold text-gray-500 uppercase mb-1">Filter Category</label>
                 <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="border border-gray-200 rounded p-2 text-sm border-primary text-primary min-w-[150px]">
                   {categories.map(c => <option key={c} value={c}>{c}</option>)}
                 </select>
               </div>
               <div className="flex flex-col">
                 <label className="text-xs font-bold text-gray-500 uppercase mb-1">Status</label>
                 <select value={adminStatusFilter} onChange={e => setAdminStatusFilter(e.target.value)} className="border border-gray-200 rounded p-2 text-sm border-primary text-primary min-w-[120px]">
                   <option value="All">All</option>
                   <option value="Published">Published</option>
                   <option value="Draft">Draft</option>
                 </select>
               </div>
               <div className="flex flex-col w-full md:w-[250px]">
                 <label className="text-xs font-bold text-gray-500 uppercase mb-1">Search</label>
                 <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                    <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="border border-gray-200 rounded p-2 pl-8 text-sm w-full border-primary text-primary" />
                 </div>
               </div>
             </div>
             <button className="whitespace-nowrap px-4 py-2 border border-gray-200 text-gray-700 bg-white rounded font-semibold text-sm hover:text-primary w-full md:w-auto">
               Export FAQ as PDF
             </button>
          </div>
        )}

        {/* FAQ LIST */}
        <div className="space-y-8">
          {Object.keys(groupedFAQs).map(catName => (
            <div key={catName}>
               {!isAdmin && <h2 className="text-sm font-bold text-primary uppercase tracking-widest mb-3 flex items-center gap-2">
                 📝 {catName.toUpperCase()} ({groupedFAQs[catName].length})
               </h2>}
                <LayoutGroup id={catName}>
                  <div className="space-y-3">
                 {groupedFAQs[catName].map(faq => (
                   isAdmin ? (
                     // ADMIN CARD
                     <div key={faq.id} className="relative rounded-xl group transition-all duration-300">
                       {/* Outer Glow Bloom aura */}
                       <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-30 blur-2xl transition-all duration-500 rounded-xl -z-10 group-hover:scale-102 pointer-events-none" />

                       {/* Boundary box with rotating gradient for lightning border effect */}
                       <div className="relative w-full h-full rounded-xl overflow-hidden p-[2px] bg-gray-150 dark:bg-slate-800 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-sm">
                         {/* Spinning lightning border */}
                         <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_4s_linear_infinite] opacity-25 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

                         {/* Inner masked content card */}
                         <div className="relative w-full h-full bg-white dark:bg-slate-900 rounded-[10px] p-4 flex flex-col md:flex-row gap-4 z-10 overflow-hidden flex-1">
                           <div className="flex-1">
                              <div className="flex justify-between items-start mb-2">
                                 <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${getCategoryColor(faq.category)}`}>
                                   {faq.category}
                                 </span>
                                 <div className="flex gap-2 text-gray-400">
                                   <button onClick={() => { setEditingFaq(faq); setIsEditing(true); }} className="hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                                   <button onClick={() => handleDelete(faq.id)} className="hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                                 </div>
                              </div>
                              <h3 className="font-bold text-gray-900 dark:text-white mb-1">Q: {faq.question}</h3>
                              <p className="text-sm text-gray-600 dark:text-slate-300 mb-4 line-clamp-2">A: {faq.answer}</p>
                              
                              <div className="flex items-center gap-6 pt-3 border-t border-gray-100 dark:border-slate-800">
                                 <button onClick={() => handleToggleStatus(faq.id)} className="flex items-center gap-1.5 text-xs font-bold">
                                   <div className={`w-2.5 h-2.5 rounded-full ${faq.published ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                   <span className={faq.published ? 'text-gray-700 dark:text-slate-300' : 'text-gray-400'}>{faq.published ? 'Published' : 'Draft'}</span>
                                 </button>
                                 <span className="text-xs font-bold text-gray-400 border-l pl-6 dark:border-slate-800">Order: {faq.order}</span>
                                 <div className="flex gap-2 ml-auto">
                                   <button onClick={() => moveFaq(faq.id, 'up')} className="text-xs font-bold text-gray-500 hover:text-primary flex items-center gap-1"><ArrowUp className="w-3.5 h-3.5"/> Move Up</button>
                                   <button onClick={() => moveFaq(faq.id, 'down')} className="text-xs font-bold text-gray-500 hover:text-primary flex items-center gap-1"><ArrowDown className="w-3.5 h-3.5"/> Move Down</button>
                                 </div>
                              </div>
                           </div>
                         </div>
                       </div>
                     </div>
                   ) : (
                     // STUDENT ACCORDION
                     <motion.div 
                       layout
                       initial={{ opacity: 0, y: 12 }}
                       animate={{ opacity: 1, y: 0 }}
                       exit={{ opacity: 0, scale: 0.95 }}
                       transition={{ duration: 0.3, ease: "easeOut" }}
                       key={faq.id} 
                       className="relative rounded-xl group transition-all duration-300"
                     >
                       {/* Outer Glow Bloom aura */}
                       <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-35 blur-2xl transition-all duration-500 rounded-xl -z-10 group-hover:scale-102 pointer-events-none" />

                       {/* Boundary box with rotating gradient for lightning border effect */}
                       <div className="relative w-full h-full rounded-xl overflow-hidden p-[2px] bg-gray-150 dark:bg-slate-800 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-sm">
                         {/* Spinning lightning border */}
                         <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_4s_linear_infinite] opacity-25 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

                         {/* Inner masked content card */}
                         <div className="relative w-full h-full bg-white dark:bg-slate-900 rounded-[10px] flex flex-col z-10 overflow-hidden flex-1">
                           <button 
                             onClick={() => toggleAccordion(faq.id)} 
                             className={`w-full p-4 flex gap-4 items-start text-left transition-all ${openIds.includes(faq.id) ? 'border-l-4 border-blue-500 bg-blue-50/10' : 'border-l-4 border-transparent hover:bg-gray-50/50'}`}
                           >
                             <span className="text-lg">❓</span>
                             <span className={`flex-1 text-[15px] font-semibold mt-0.5 transition-colors ${openIds.includes(faq.id) ? 'text-blue-600 font-bold dark:text-blue-400' : 'text-gray-800 dark:text-slate-100'}`}>
                               {faq.question}
                             </span>
                             <motion.span 
                               animate={{ rotate: openIds.includes(faq.id) ? 180 : 0 }}
                               transition={{ duration: 0.25, ease: "easeInOut" }}
                               className="text-gray-400 shrink-0 mt-0.5"
                             >
                               <ChevronDown className="w-5 h-5" />
                             </motion.span>
                           </button>
                           <AnimatePresence initial={false}>
                             {openIds.includes(faq.id) && (
                               <motion.div 
                                 key={`content-${faq.id}`}
                                 initial={{ height: 0, opacity: 0 }} 
                                 animate={{ 
                                   height: 'auto', 
                                   opacity: 1,
                                   transition: {
                                     height: { duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] },
                                     opacity: { duration: 0.2, delay: 0.05 }
                                   }
                                 }} 
                                 exit={{ 
                                   height: 0, 
                                   opacity: 0,
                                   transition: {
                                     height: { duration: 0.2, ease: [0.04, 0.62, 0.23, 0.98] },
                                     opacity: { duration: 0.1 }
                                   }
                                 }} 
                                 className="overflow-hidden"
                               >
                                 <div className="p-4 pt-0 pl-12 pr-6 border-t border-transparent text-[#555] dark:text-slate-300 text-sm leading-[1.7] whitespace-pre-wrap">
                                   {faq.answer}
                                   
                                   <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-2">
                                      <span className="text-xs text-gray-400">💬 Still have questions?</span>
                                      <a 
                                        href={typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? "mailto:academyshikshantar@gmail.com" : "https://mail.google.com/mail/?view=cm&fs=1&to=academyshikshantar@gmail.com"}
                                        target={typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? undefined : "_blank"}
                                        rel={typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? undefined : "noopener noreferrer"}
                                        className="text-xs font-bold text-blue-600 border border-blue-200 bg-blue-50 px-3 py-1 rounded w-max hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                                      >
                                        Contact School Office
                                      </a>
                                   </div>
                                 </div>
                               </motion.div>
                             )}
                           </AnimatePresence>
                         </div>
                       </div>
                     </motion.div>
                   )
                 ))}
                  </div>
                </LayoutGroup>
            </div>
          ))}
        </div>

        {/* CONTACT CARD */}
        {!isAdmin && (
          <div className="mt-12 relative rounded-2xl group transition-all duration-300">
            {/* Outer Glow Bloom aura */}
            <div className="absolute inset-2 bg-gradient-to-r from-[#0a3d62] via-[#0284c7] to-[#F0A500] opacity-0 group-hover:opacity-35 blur-2xl transition-all duration-500 rounded-2xl -z-10 group-hover:scale-102 pointer-events-none" />

            {/* Boundary box with rotating gradient for lightning border effect */}
            <div className="relative w-full h-full rounded-2xl overflow-hidden p-[2.5px] bg-gray-150 dark:bg-slate-800 transition-colors duration-300 group-hover:bg-transparent flex flex-col shadow-xl">
              {/* Spinning lightning border */}
              <div className="absolute inset-[-180%] bg-[conic-gradient(from_0deg,#0a3d62,#0284c7,#F0A500,#fbbf24,#0ea5e9,#0a3d62)] animate-[spin_5s_linear_infinite] opacity-35 group-hover:opacity-100 transition-opacity duration-300 z-0 pointer-events-none" />

              {/* Inner masked content card */}
              <div className="relative w-full h-full bg-primary text-white rounded-[14px] p-6 md:p-8 text-center z-10 overflow-hidden flex-1">
                 <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />
                 <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-black/10 rounded-full blur-2xl pointer-events-none" />
                 <h2 className="text-xl md:text-2xl font-black text-white mb-2 relative z-10 flex items-center justify-center gap-2">
                   Still have questions? We're here to help!
                 </h2>
                 <p className="text-white/80 text-sm mb-6 max-w-lg mx-auto relative z-10">
                   If you couldn't find the answer to your question, please don't hesitate to reach out to our school administration.
                 </p>
                 <div className="flex flex-col md:flex-row justify-center gap-4 relative z-10">
                    <a href="tel:+9779709867048" className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg border border-white/20 text-white font-bold bg-white/5 hover:bg-white/15 transition-all text-sm shadow-sm hover:scale-102">
                      <Phone className="w-4 h-4 text-emerald-300" /> Call: +977 9709867048, +977 9807790805
                    </a>
                    <a 
                      href={typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? "mailto:academyshikshantar@gmail.com" : "https://mail.google.com/mail/?view=cm&fs=1&to=academyshikshantar@gmail.com"}
                      target={typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? undefined : "_blank"}
                      rel={typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? undefined : "noopener noreferrer"}
                      className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg border border-white/20 text-white font-bold bg-white/5 hover:bg-white/15 transition-all text-sm shadow-sm hover:scale-102"
                    >
                      <Mail className="w-4 h-4 text-cyan-300" /> Email School
                    </a>
                    <a href="https://maps.app.goo.gl/Ykri7uu78Y22NVjd6" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg border border-white/20 text-white font-bold bg-white/5 hover:bg-white/15 transition-all text-sm shadow-sm hover:scale-102">
                      <MapPin className="w-4 h-4 text-amber-300 animate-bounce" /> Karjanhana Municipality, Bastipur-5, Siraha, Nepal
                    </a>
                 </div>
              </div>
            </div>
          </div>
        )}

        {/* ADMIN EDIT MODAL */}
        {isEditing && (
          <div className="fixed inset-0 z-50 bg-black/50 flex flex-col items-center justify-center p-4">
             <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col h-auto max-h-screen">
                <div className="p-5 border-b border-gray-100 flex justify-between items-center text-primary">
                  <h3 className="font-bold text-gray-900">{editingFaq.id ? 'Edit Question' : 'Add New Question'}</h3>
                  <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-gray-900"><Trash2 className="hidden"/><span className="text-xl leading-none">&times;</span></button>
                </div>
                <div className="p-6 overflow-y-auto">
                    <form id="faq-form" onSubmit={handleSaveModal} className="space-y-5">
                       <div>
                         <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Category</label>
                         <select 
                           value={editingFaq.category} 
                           onChange={e => setEditingFaq({...editingFaq, category: e.target.value})}
                           className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-blue-500 font-semibold text-gray-700 bg-white"
                         >
                           {categories.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                         </select>
                       </div>
                       <div>
                         <label className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                           <span>Question</span>
                           <span className={editingFaq.question.length > 200 ? 'text-red-500' : 'text-gray-400'}>{editingFaq.question.length}/200</span>
                         </label>
                         <input 
                           type="text" 
                           required 
                           value={editingFaq.question} 
                           onChange={e => setEditingFaq({...editingFaq, question: e.target.value})}
                           className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-blue-500 font-semibold text-gray-900 bg-white"
                         />
                       </div>
                       <div>
                         <label className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                           <span>Answer</span>
                           <span className={editingFaq.answer.length > 1000 ? 'text-red-500' : 'text-gray-400'}>{editingFaq.answer.length}/1000</span>
                         </label>
                         <div className="border border-gray-200 rounded-lg overflow-hidden focus-within:border-blue-500">
                           <div className="text-primary border-b border-gray-200 p-1 flex gap-1">
                             <button type="button" className="p-1.5 text-gray-500 hover:bg-gray-200 rounded font-serif font-bold px-3">B</button>
                             <button type="button" className="p-1.5 text-gray-500 hover:bg-gray-200 rounded">● List</button>
                           </div>
                           <textarea 
                             required 
                             rows={5}
                             value={editingFaq.answer} 
                             onChange={e => setEditingFaq({...editingFaq, answer: e.target.value})}
                             className="w-full p-3 outline-none text-gray-800 text-sm leading-relaxed block bg-white resize-none"
                           ></textarea>
                         </div>
                       </div>
                       <div>
                         <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Status</label>
                         <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" checked={editingFaq.published} onChange={() => setEditingFaq({...editingFaq, published: true})} className="w-4 h-4 text-primary" />
                              <span className="font-semibold text-gray-700 text-sm">Published ◉</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" checked={!editingFaq.published} onChange={() => setEditingFaq({...editingFaq, published: false})} className="w-4 h-4 text-primary" />
                              <span className="font-semibold text-gray-700 text-sm">Draft ○</span>
                            </label>
                         </div>
                       </div>
                    </form>
                </div>
                <div className="p-5 border-t border-gray-100 flex justify-end gap-3 text-primary">
                   <button type="button" onClick={() => setIsEditing(false)} className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-bold hover:bg-white transition-colors">Cancel</button>
                   <button type="submit" form="faq-form" className="px-5 py-2.5 rounded-lg bg-primary text-white font-bold hover:bg-primary-dark transition-colors">Save Question</button>
                </div>
             </div>
          </div>
        )}

      </div>
    </div>
  );
}

