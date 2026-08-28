import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Search, MapPin, Award, Briefcase, GraduationCap, Edit2, Trash2, Star, Plus, Mail, X, CheckCircle2, BarChart2, PieChart, ChevronDown, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { sendAlumniEmail } from '../lib/emailService';

const initialAlumni = [
  {
    id: 1,
    name: "Rajesh Kumar Sah",
    graduationYear: "2075 B.S. (2018 A.D.)",
    batch: "SEE Batch 2075",
    class: "Class 10",
    seeBand: "3.85 GPA",
    currentStatus: "Engineer",
    organization: "Nepal Electricity Authority, Kathmandu",
    degree: "B.E. Civil Engineering — Pulchowk Campus, IOE",
    location: "Kathmandu, Nepal",
    quote: "Shikshantar Academy gave me the strong foundation in Mathematics and Science that helped me crack the IOE entrance exam. I am forever grateful to my teachers.",
    achievement: "District Topper in SEE 2075",
    photo: null,
    category: "Engineering",
    featured: true
  },
  {
    id: 2,
    name: "Sunita Thapa Magar",
    graduationYear: "2076 B.S. (2019 A.D.)",
    batch: "SEE Batch 2076",
    class: "Class 10",
    seeBand: "3.70 GPA",
    currentStatus: "Medical Student",
    organization: "BP Koirala Institute of Health Sciences, Dharan",
    degree: "MBBS — 4th Year",
    location: "Dharan, Sunsari, Nepal",
    quote: "The science labs and dedicated teachers at Shikshantar helped me build my interest in Biology. Today I am living my dream of becoming a doctor.",
    achievement: "Selected in MBBS entrance from Province 2",
    photo: null,
    category: "Medical",
    featured: true
  },
  {
    id: 3,
    name: "Amit Yadav",
    graduationYear: "2077 B.S. (2020 A.D.)",
    batch: "SEE Batch 2077",
    class: "Class 10",
    seeBand: "3.55 GPA",
    currentStatus: "Software Developer",
    organization: "F1Soft International, Kathmandu",
    degree: "B.Sc. CSIT — Tribhuvan University",
    location: "Kathmandu, Nepal",
    quote: "The computer classes at Shikshantar sparked my interest in technology. Now I work at one of Nepal's leading fintech companies.",
    achievement: "Developed eSewa payment module feature",
    photo: null,
    category: "Technology",
    featured: true
  },
  {
    id: 4,
    name: "Priya Rai",
    graduationYear: "2078 B.S. (2021 A.D.)",
    batch: "SEE Batch 2078",
    class: "Class 10",
    seeBand: "3.80 GPA",
    currentStatus: "Teacher",
    organization: "Shree Janata Secondary School, Siraha",
    degree: "B.Ed. — Tribhuvan University",
    location: "Siraha, Nepal",
    quote: "I always wanted to give back to my community. Shikshantar Academy inspired me to become a teacher and now I teach the next generation right here in Siraha.",
    achievement: "Best Student Award 2078 — District Level",
    photo: null,
    category: "Education",
    featured: false
  },
  {
    id: 5,
    name: "Bikash Mandal",
    graduationYear: "2079 B.S. (2022 A.D.)",
    batch: "SEE Batch 2079",
    class: "Class 10",
    seeBand: "3.45 GPA",
    currentStatus: "Bank Officer",
    organization: "Nepal Bank Limited, Siraha Branch",
    degree: "BBS — Tribhuvan University",
    location: "Siraha, Nepal",
    quote: "The discipline and values I learned at Shikshantar Academy helped me succeed in my banking career. This school shapes character, not just academics.",
    achievement: "Passed Nepal Bank Officer Exam 2081",
    photo: null,
    category: "Finance",
    featured: false
  },
  {
    id: 6,
    name: "Anita Kumari Shah",
    graduationYear: "2080 B.S. (2023 A.D.)",
    batch: "SEE Batch 2080",
    class: "Class 10",
    seeBand: "3.90 GPA",
    currentStatus: "+2 Science Student",
    organization: "Janakpur Multiple Campus, Janakpur",
    degree: "+2 Science (NEB) — Currently Studying",
    location: "Janakpur, Dhanusha, Nepal",
    quote: "Getting A+ in Science and Mathematics in SEE was possible because of the extra classes and support our teachers gave us at Shikshantar.",
    achievement: "School Topper SEE 2080 — 3.90 GPA",
    photo: null,
    category: "Science",
    featured: true
  },
  {
    id: 7,
    name: "Suresh Paswan",
    graduationYear: "2074 B.S. (2017 A.D.)",
    batch: "SEE Batch 2074",
    class: "Class 10",
    seeBand: "3.20 GPA",
    currentStatus: "Entrepreneur",
    organization: "Siraha Digital Printing & Services",
    degree: "BIM — Tribhuvan University",
    location: "Siraha, Nepal",
    quote: "Shikshantar taught me to work hard and never give up. I started my own business in Siraha and now employ 5 people from our community.",
    achievement: "Founded local business employing 5+ people",
    photo: null,
    category: "Business",
    featured: false
  },
  {
    id: 8,
    name: "Kavita Chaudhary",
    graduationYear: "2081 B.S. (2024 A.D.)",
    batch: "SEE Batch 2081",
    class: "Class 10",
    seeBand: "3.75 GPA",
    currentStatus: "+2 Management Student",
    organization: "Birgunj Campus, Birgunj",
    degree: "+2 Management (NEB) — Currently Studying",
    location: "Birgunj, Parsa, Nepal",
    quote: "The teachers here genuinely care about each student. They pushed me to work harder and believe in myself. I am proud to be a Shikshantar alumnus.",
    achievement: "District Level Essay Competition Winner 2081",
    photo: null,
    category: "Management",
    featured: false
  }
];

const getInitials = (name: string) => {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return 'A';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getCategoryBadgeStyles = (category: string) => {
  const colors: Record<string, string> = {
    Engineering: 'bg-blue-100 text-blue-700',
    Medical: 'bg-red-100 text-red-700',
    Technology: 'bg-purple-100 text-purple-700',
    Education: 'bg-green-100 text-green-700',
    Finance: 'bg-teal-100 text-teal-700',
    Business: 'bg-orange-100 text-orange-700',
    Science: 'bg-indigo-100 text-indigo-700',
    Management: 'bg-pink-100 text-pink-700',
    Other: 'bg-gray-100 text-gray-700'
  };
  return colors[category] || colors.Other;
};

const getCategoryBorderStyles = (category: string) => {
  const colors: Record<string, string> = {
    Engineering: 'border-l-blue-500',
    Medical: 'border-l-red-500',
    Technology: 'border-l-purple-500',
    Education: 'border-l-green-500',
    Finance: 'border-l-teal-500',
    Business: 'border-l-orange-500',
    Science: 'border-l-indigo-500',
    Management: 'border-l-pink-500',
    Other: 'border-l-gray-500'
  };
  return colors[category] || colors.Other;
};

function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const duration = 1200; // ms
    const increment = target / (duration / 16); // 16ms frames
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target]);
  return <span className="tabular-nums">{count}{suffix}</span>;
}

export default function Alumni() {
  const userRole = auth.currentUser ? (localStorage.getItem('userRole') || 'student') : 'guest';
  const actualAdmin = auth.currentUser ? userRole === 'admin' : false;
  const [previewAsStudent, setPreviewAsStudent] = useState(false);
  const isAdmin = actualAdmin && !previewAsStudent;

  const [alumni, setAlumni] = useState(initialAlumni);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedYear, setSelectedYear] = useState("All");

  const [showStoryForm, setShowStoryForm] = useState(false);
  const [storyForm, setStoryForm] = useState({
    name: '', batch: 'SEE Batch 2082', seeBand: '3.80 GPA', currentStatus: '',
    organization: '', degree: '', location: '', quote: '', achievement: '',
    category: 'Technology'
  });
  const [recommendationSent, setRecommendationSent] = useState(false);
  const [pendingStories, setPendingStories] = useState<any[]>([]);

  // Load submissions and approved stories from Firestore in real-time
  useEffect(() => {
    // 1. Pending submissions for admin
    let unsubPending = () => {};
    if (isAdmin) {
      const qPending = query(collection(db, 'alumni_submissions'), where('status', '==', 'pending'));
      unsubPending = onSnapshot(qPending, (snapshot) => {
        const pending = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        setPendingStories(pending);
      }, (err) => console.warn("Error fetching pending alumni stories:", err));
    } else {
      setPendingStories([]);
    }

    // 2. Approved submissions for public
    const qApproved = query(collection(db, 'alumni_submissions'), where('status', '==', 'approved'));
    const unsubApproved = onSnapshot(qApproved, (snapshot) => {
      const approvedList = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      // Merge with initial static alumni
      setAlumni([...initialAlumni, ...approvedList]);
    }, (err) => console.warn("Error fetching approved alumni:", err));

    return () => {
      unsubPending();
      unsubApproved();
    };
  }, [isAdmin]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAlumnus, setEditingAlumnus] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '', graduationYear: '', batch: '', seeBand: '', currentStatus: '',
    organization: '', degree: '', location: '', quote: '', achievement: '',
    category: 'Other', featured: false, photo: '', photoSource: 'url'
  });
  const [toastMessage, setToastMessage] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [expandedQuotes, setExpandedQuotes] = useState<Record<number, boolean>>({});

  const categories = ["All", "Engineering", "Medical", "Technology", "Education", "Finance", "Business", "Science", "Management", "Other"];
  const years = ["All", "SEE 2074", "2075", "2076", "2077", "2078", "2079", "2080", "2081", "2082", "2083"];

  const filteredAlumni = useMemo(() => {
    return alumni.filter(a => {
      const searchLower = search.toLowerCase();
      const matchSearch = 
        a.name.toLowerCase().includes(searchLower) ||
        a.organization.toLowerCase().includes(searchLower) ||
        a.currentStatus.toLowerCase().includes(searchLower) ||
        a.batch.toLowerCase().includes(searchLower);
      const matchCategory = 
        selectedCategory === "All" || 
        a.category === selectedCategory;
      const matchYear = 
        selectedYear === "All" || 
        a.graduationYear.includes(selectedYear) ||
        a.batch.includes(selectedYear);
      return matchSearch && matchCategory && matchYear;
    });
  }, [alumni, search, selectedCategory, selectedYear]);

  const featuredAlumni = filteredAlumni.filter(a => a.featured);

  const toggleQuote = (id: number) => {
    setExpandedQuotes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleOpenModal = (alumnus = null) => {
    if (alumnus) {
      setEditingAlumnus(alumnus);
      setFormData({ ...alumnus });
    } else {
      setEditingAlumnus(null);
      setFormData({
        name: '', graduationYear: '', batch: '', seeBand: '', currentStatus: '',
        organization: '', degree: '', location: '', quote: '', achievement: '',
        category: 'Other', featured: false, photo: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (editingAlumnus) {
      setAlumni(alumni.map(a => a.id === editingAlumnus.id ? { ...formData, id: editingAlumnus.id } : a));
    } else {
      setAlumni([...alumni, { ...formData, id: Date.now() }]);
    }
    setIsModalOpen(false);
    showToast('✓ Alumni record saved!');
  };

  const handleDelete = () => {
    if (deleteId) {
      setAlumni(alumni.filter(a => a.id !== deleteId));
      setDeleteId(null);
      showToast('✓ Alumni record removed!');
    }
  };

  const toggleFeatured = (id: number) => {
    setAlumni(alumni.map(a => a.id === id ? { ...a, featured: !a.featured } : a));
  };

  // Stats for Admin
  const stats = useMemo(() => {
    const total = alumni.length;
    const featured = alumni.filter(a => a.featured).length;
    const uniqueCats = new Set(alumni.map(a => a.category)).size;
    const uniqueYears = new Set(alumni.map(a => a.year)).size;
    
    const catCounts: Record<string, number> = {};
    alumni.forEach(a => {
      catCounts[a.category] = (catCounts[a.category] || 0) + 1;
    });
    
    return { total, featured, uniqueCats, uniqueYears, catCounts };
  }, [alumni]);

  return (
    <div className="bg-[#F5F6FA] min-h-screen pb-12 relative animate-in fade-in duration-500">
      <Helmet>
        <title>Alumni Network | Shikshantar Academy</title>
        <meta name="description" content="Connect with the alumni network of Shikshantar Academy. See where our former students are today." />
        <link rel="canonical" href="https://shikshantaracademy.edu.np/alumni" />
      </Helmet>
      
      
      {/* Admin Toolbar */}
      {actualAdmin && (
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-4 text-sm font-bold text-gray-600">
            <span>Total: {stats.total} Alumni</span>
            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span>
            <span>Featured: {stats.featured}</span>
            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span>
            <span>Categories: {stats.uniqueCats}</span>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <label className="flex items-center gap-2 cursor-pointer bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg text-sm font-bold text-gray-700 transition">
              <input type="checkbox" checked={previewAsStudent} onChange={() => setPreviewAsStudent(!previewAsStudent)} className="w-4 h-4 accent-indigo-600" />
              Preview as Student
            </label>
            <button 
              onClick={() => handleOpenModal()} 
              className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ml-auto"
            >
              <Plus className="w-4 h-4" /> Add New Alumni
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 font-bold animate-in slide-in-from-top-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          {toastMessage}
        </div>
      )}

      {/* HERO SECTION */}
      <div className="bg-gradient-to-r bg-primary text-white py-12 md:py-16 px-4 mb-8 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-96 h-96 bg-black/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="max-w-7xl mx-auto relative">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center md:text-left mb-10"
          >
            <span className="inline-flex items-center px-3 py-1 mb-3 rounded-full bg-white/10 border border-white/15 text-[11px] text-amber-300 font-extrabold tracking-widest uppercase font-mono shadow-sm">
              Inspiring Generations
            </span>
            <h1 className="text-3xl md:text-5xl font-black mb-4 tracking-tight flex items-center justify-center md:justify-start gap-3">
              <GraduationCap className="w-10 h-10 md:w-12 md:h-12 text-white animate-bounce" /> 
              Alumni & Student Success
            </h1>
            <p className="text-blue-100 text-base md:text-lg max-w-3xl leading-relaxed">
              Celebrating the achievements of our outstanding former students who continue to make us proud across Nepal and beyond.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 border-t border-white/20 pt-8 mt-8">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-center md:border-r md:border-white/20 px-2"
            >
              <div className="text-3xl md:text-4xl font-black mb-1 text-amber-300">
                <AnimatedCounter target={stats.uniqueYears > 8 ? stats.uniqueYears : 8} suffix="+" />
              </div>
              <div className="text-xs font-bold text-blue-200 tracking-wider uppercase">Batches Completed</div>
            </motion.div>
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-center md:border-r md:border-white/20 px-2"
            >
              <div className="text-3xl md:text-4xl font-black mb-1 text-amber-300">
                <AnimatedCounter target={stats.total > 200 ? stats.total : 200} suffix="+" />
              </div>
              <div className="text-xs font-bold text-blue-200 tracking-wider uppercase">Alumni Worldwide</div>
            </motion.div>

            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="text-center md:border-r md:border-white/20 px-2"
            >
              <div className="text-3xl md:text-4xl font-black mb-1 text-amber-300">
                <AnimatedCounter target={stats.featured > 15 ? stats.featured : 15} suffix="+" />
              </div>
              <div className="text-xs font-bold text-blue-200 tracking-wider uppercase">District Toppers</div>
            </motion.div>

            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="text-center px-2"
            >
              <div className="text-3xl md:text-4xl font-black mb-1">📍</div>
              <div className="text-xs font-bold text-blue-200 tracking-wider uppercase">Serving Nepal & Beyond</div>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4">
        
        {/* SEARCH & FILTERS */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10 space-y-4 bg-gray-50/50 dark:bg-slate-900/40 p-5 rounded-2xl border border-gray-100 dark:border-slate-800/60 shadow-sm"
        >
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search alumni by name, batch, or profession..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm text-gray-800 dark:text-gray-150 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>
          
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto scrollbar-hide flex-nowrap">
              {categories.map((cat, idx) => (
                <button 
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all border transform hover:scale-102 cursor-pointer ${selectedCategory === cat ? 'bg-[var(--primary)] text-white shadow-md border-transparent' : 'bg-white dark:bg-slate-950 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-900'}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="md:ml-auto select-none">
              <select 
                value={selectedYear} 
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 text-gray-700 dark:text-gray-300 text-sm font-bold rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {years.map(y => <option key={y} value={y}>{y === "All" ? "All Years" : y}</option>)}
              </select>
            </div>
          </div>
        </motion.div>

        {/* FEATURED ALUMNI */}
        {featuredAlumni.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-black text-primary mb-6 flex items-center gap-2">
              <Star className="w-6 h-6 text-primary text-primary" /> Featured Alumni
            </h2>
            <div className="flex overflow-x-auto gap-6 pb-4 snap-x snap-mandatory scrollbar-none touch-pan-x">
              {featuredAlumni.map((a, idx) => (
                <motion.div 
                  key={a.id} 
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: idx * 0.08, duration: 0.45, ease: "easeOut" }}
                  whileHover={{ y: -6, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)" }}
                  className={`snap-center shrink-0 w-[280px] sm:w-[320px] md:w-[400px] bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] border-l-4 ${getCategoryBorderStyles(a.category)} relative overflow-hidden flex flex-col group`}
                >
                   
                   {/* Admin Controls */}
                   {isAdmin && (
                     <div className="absolute top-2 right-2 flex gap-1 z-10 bg-white/80 backdrop-blur-sm p-1 rounded-lg">
                       <button onClick={() => toggleFeatured(a.id)} className="p-1.5 hover:bg-yellow-50 rounded" title="Unfeature">
                         <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                       </button>
                       <button onClick={() => handleOpenModal(a)} className="p-1.5 hover:bg-blue-50 rounded" title="Edit">
                         <Edit2 className="w-4 h-4 text-blue-500" />
                       </button>
                       <button onClick={() => setDeleteId(a.id)} className="p-1.5 hover:bg-red-50 rounded" title="Delete">
                         <Trash2 className="w-4 h-4 text-red-500" />
                       </button>
                     </div>
                   )}

                   <div className="p-6 flex-1 flex flex-col">
                      <div className="flex items-center gap-4 mb-4">
                        {a.photo ? (
                          <img src={a.photo} alt={a.name} className="w-14 h-14 rounded-full object-cover border border-gray-200" />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center font-bold text-xl shrink-0">
                            {getInitials(a.name)}
                          </div>
                        )}
                        <div>
                          <h3 className="font-bold text-lg text-gray-900 leading-tight">{a.name}</h3>
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold mt-1 ${getCategoryBadgeStyles(a.category)}`}>
                            {a.category}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-sm text-gray-600 mb-4 border-primary text-primary p-3 rounded-lg border border-gray-100">
                        <p className="flex items-start gap-2 max-w-full overflow-hidden">
                          <GraduationCap className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" /> 
                          <span className="truncate" title={`${a.batch} | GPA: ${a.seeBand}`}>
                            {a.batch} | GPA: {a.seeBand}
                          </span>
                        </p>
                        <p className="flex items-start gap-2 max-w-full overflow-hidden">
                          <Briefcase className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" /> 
                          <span className="truncate" title={`${a.currentStatus} \n ${a.organization}`}>
                            <span className="font-semibold text-gray-800">{a.currentStatus}</span><br/>
                            {a.organization}
                          </span>
                        </p>
                        <p className="flex items-start gap-2 max-w-full overflow-hidden">
                          <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" /> 
                          <span className="truncate" title={a.location}>{a.location}</span>
                        </p>
                      </div>

                      {a.achievement && (
                        <div className="bg-orange-50 border border-orange-100 text-orange-800 text-xs font-bold px-3 py-2 rounded-lg mb-4 flex items-center gap-2">
                          <Award className="w-4 h-4 text-orange-500 shrink-0" />
                          <span>{a.achievement}</span>
                        </div>
                      )}

                      <div className="mt-auto relative text-primary p-4 rounded-xl text-sm italic text-gray-600 mt-2">
                         <div className="text-4xl text-gray-300 font-serif leading-none absolute -top-2 -left-1">"</div>
                         <p className="relative z-10 pl-2 leading-relaxed limit-lines line-clamp-3">{a.quote}</p>
                         <p className="text-right font-semibold text-gray-800 mt-2 text-xs">— {a.name.split(' ')[0]}</p>
                      </div>
                   </div>
                </motion.div>
              ))}
            </div>
            {/* Visual swipe suggestion indicators for mobile/touch users */}
            <div className="flex md:hidden justify-center items-center gap-1 mt-2 text-[11px] font-bold text-gray-400">
              <span className="animate-pulse">Swipe right/left to read more success stories</span>
              <span className="inline-block animate-bounce font-sans">👉</span>
            </div>
          </div>
        )}

        {/* ALL ALUMNI GRID */}
        <div className="mb-16">
          <h2 className="text-2xl font-black text-primary mb-6">👥 All Alumni</h2>
          
          {filteredAlumni.length === 0 ? (
             <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-gray-200">
               <GraduationCap className="w-16 h-16 mx-auto text-gray-300 mb-4" />
               <p className="text-lg font-bold text-gray-500">No alumni records match your search.</p>
               <button onClick={() => {setSearch(''); setSelectedCategory('All'); setSelectedYear('All')}} className="mt-4 text-blue-600 font-bold hover:underline">Clear Filters</button>
             </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAlumni.map((a, idx) => (
                <motion.div 
                  key={a.id} 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.05, 0.3), duration: 0.4 }}
                  whileHover={{ y: -6, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08)" }}
                  className={`bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] border-l-4 ${getCategoryBorderStyles(a.category)} flex flex-col relative`}
                >
                   
                   {/* Admin Controls */}
                   {isAdmin && (
                     <div className="absolute top-2 right-2 flex gap-1 z-10 bg-white/80 backdrop-blur-sm p-1 rounded-lg">
                       <button onClick={() => toggleFeatured(a.id)} className="p-1.5 hover:bg-yellow-50 rounded" title={a.featured ? "Unfeature" : "Feature"}>
                         <Star className={`w-4 h-4 ${a.featured ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'}`} />
                       </button>
                       <button onClick={() => handleOpenModal(a)} className="p-1.5 hover:bg-blue-50 rounded" title="Edit">
                         <Edit2 className="w-4 h-4 text-blue-500" />
                       </button>
                       <button onClick={() => setDeleteId(a.id)} className="p-1.5 hover:bg-red-50 rounded" title="Delete">
                         <Trash2 className="w-4 h-4 text-red-500" />
                       </button>
                     </div>
                   )}

                   <div className="p-5 flex-1 flex flex-col border-b border-gray-100">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          {a.photo ? (
                            <img src={a.photo} alt={a.name} className="w-12 h-12 rounded-full object-cover border border-gray-200" />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center font-bold text-lg">
                              {getInitials(a.name)}
                            </div>
                          )}
                          <div>
                            <h3 className="font-bold text-gray-900 leading-tight pr-6">{a.name}</h3>
                            <p className="text-xs text-gray-500 font-medium">{a.batch}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mb-3 flex items-center gap-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getCategoryBadgeStyles(a.category)}`}>
                          {a.category}
                        </span>
                        {a.isGuestRecommended && (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[9px] font-extrabold uppercase animate-pulse">
                            <Sparkles className="w-2.5 h-2.5 text-amber-500 shrink-0" /> Recommended Success
                          </span>
                        )}
                      </div>

                      <div className="space-y-2 text-sm text-gray-600 mb-4">
                        <div className="flex items-start gap-2">
                          <Briefcase className="w-4 h-4 mt-0.5 shrink-0 text-indigo-400" />
                          <div>
                            <p className="font-bold text-gray-800">{a.currentStatus}</p>
                            <p className="text-xs">{a.organization}</p>
                          </div>
                        </div>
                        {a.degree && (
                          <div className="flex items-start gap-2">
                            <GraduationCap className="w-4 h-4 mt-0.5 shrink-0 text-indigo-400" />
                            <p className="text-xs">{a.degree}</p>
                          </div>
                        )}
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-indigo-400" />
                          <p className="text-xs">{a.location}</p>
                        </div>
                      </div>

                      {a.achievement && (
                        <div className="bg-orange-50/50 border border-orange-100 p-2.5 rounded-lg flex items-start gap-2 mt-auto">
                          <Award className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                          <p className="text-xs font-bold text-orange-800 leading-tight">{a.achievement}</p>
                        </div>
                      )}
                   </div>
                   
                   {a.quote && (
                     <div className="text-primary px-5 py-3 rounded-b-xl">
                       <button 
                         onClick={() => toggleQuote(a.id)}
                         className="flex items-center justify-between w-full text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                       >
                         Read Quote <ChevronDown className={`w-4 h-4 transition-transform ${expandedQuotes[a.id] ? 'rotate-180' : ''}`} />
                       </button>
                       {expandedQuotes[a.id] && (
                         <div className="mt-3 text-sm italic text-gray-600 border-l-2 border-indigo-200 pl-3 py-1">
                           "{a.quote}"
                         </div>
                       )}
                     </div>
                   )}

                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* INTERACTIVE ALUMNI ENGAGEMENT & SUCCESS SHOWCASE FOR GUEST USERS */}
        <div className="space-y-12 mb-16">
          {/* Section 1: Real-time Alumni Industry Sector Distribution */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-3xl p-6 md:p-10 shadow-sm border border-gray-100 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50/50 rounded-full blur-3xl pointer-events-none" />
            
            <div className="text-center max-w-2xl mx-auto mb-10 relative z-10">
              <span className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase mb-3 inline-block">
                Directory Analytics
              </span>
              <h2 className="text-2xl md:text-3xl font-black mb-3 text-gray-900">Alumni Fields of Influence</h2>
              <p className="text-gray-500 text-sm md:text-base leading-relaxed">
                A real-time distribution of our alumni's professional and academic sectors computed dynamically from our verified school records.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
              {(() => {
                const sectorCounts: Record<string, number> = {};
                alumni.forEach(a => {
                  sectorCounts[a.category] = (sectorCounts[a.category] || 0) + 1;
                });
                const totalAlumni = alumni.length || 1;
                return Object.entries(sectorCounts)
                  .map(([name, count]) => {
                    const percentage = Math.round((count / totalAlumni) * 100);
                    return { name, count, percentage };
                  })
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 6)
                  .map((sector, index) => (
                    <motion.div
                      key={sector.name}
                      initial={{ opacity: 0, y: 15 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.05, duration: 0.4 }}
                      whileHover={{ scale: 1.02 }}
                      className="bg-gray-50/70 border border-gray-150 p-5 rounded-2xl flex flex-col justify-between transition-shadow hover:shadow-md"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${getCategoryBadgeStyles(sector.name)}`}>
                            {sector.name}
                          </span>
                          <span className="text-xs font-bold text-gray-400">
                            {sector.count} {sector.count === 1 ? 'Alumnus' : 'Alumni'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 font-bold mb-4">
                          Representing {sector.percentage}% of our registered alumni community path.
                        </p>
                      </div>
                      <div className="w-full bg-gray-200/60 rounded-full h-1.5 overflow-hidden">
                        <motion.div 
                          className="h-1.5 rounded-full bg-blue-600"
                          initial={{ width: 0 }}
                          whileInView={{ width: `${sector.percentage}%` }}
                          viewport={{ once: true }}
                          transition={{ delay: index * 0.05 + 0.2, duration: 0.8, ease: "easeOut" }}
                        />
                      </div>
                    </motion.div>
                  ));
              })()}
            </div>
          </motion.div>

          {/* Section 3: Interactive Submit Success Recommendation Form */}
          <motion.div 
            id="alumni-story-submission"
            className="bg-white rounded-2xl border border-gray-100 shadow-[0_10px_35px_-8px_rgba(30,41,59,0.06)] overflow-hidden max-w-4xl mx-auto w-full"
          >
              <div className="w-full">
                <div className="p-6 md:p-10 border-b border-gray-100 bg-gradient-to-br from-slate-50 to-blue-50/30">
                  <span className="bg-blue-100 text-blue-800 border border-blue-200 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-widest uppercase inline-block mb-3 animate-pulse">
                    Join The Legacy
                  </span>
                  <h3 className="text-2xl font-black text-gray-900">Are you a Shikshantar Alumnus?</h3>
                  <p className="text-gray-500 text-sm mt-1 leading-relaxed">
                    Submit your academic or career milestone! Help guide current school candidates with your real experiences.
                  </p>
                  <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-4">
                    <span className="text-xs text-gray-500 uppercase font-black tracking-widest">Or submit via email:</span>
                    <a 
                      href="mailto:academyshikshantar@gmail.com?subject=Alumni Success Entry Submission" 
                      className="inline-flex items-center gap-1.5 font-bold text-blue-600 hover:text-blue-800 hover:underline text-sm"
                    >
                      <Mail className="w-4 h-4 text-blue-500" /> academyshikshantar@gmail.com
                    </a>
                  </div>
                </div>

                <div className="p-6 md:p-10">
                  {recommendationSent ? (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }} 
                      animate={{ opacity: 1, scale: 1 }} 
                      className="text-center py-8 space-y-4"
                    >
                      <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto text-3xl shadow-sm animate-bounce">
                        🎉
                      </div>
                      <h4 className="text-lg font-black text-gray-900">Submission Under Review!</h4>
                      <p className="text-gray-600 text-sm max-w-md mx-auto">
                        Thank you for sharing your journey! Your record is now in our verification queue. It will appear on the public directory stream as soon as an administrator verifies your details.
                      </p>
                      <button 
                        type="button"
                        onClick={() => {
                          setRecommendationSent(false);
                          setStoryForm({ name: '', batch: 'SEE Batch 2082', seeBand: '3.80 GPA', currentStatus: '', organization: '', degree: '', location: '', quote: '', achievement: '', category: 'Technology' });
                        }}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md transition-transform active:scale-97 cursor-pointer"
                      >
                        Submit Another Record
                      </button>
                    </motion.div>
                  ) : (
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      if (!storyForm.name.trim() || !storyForm.currentStatus.trim() || !storyForm.organization.trim()) {
                        showToast("❌ Please fill out all required fields.");
                        return;
                      }
                      const newStory = {
                        name: storyForm.name,
                        graduationYear: `${storyForm.batch} Alumni`,
                        batch: storyForm.batch,
                        class: 'Class 10',
                        seeBand: storyForm.seeBand,
                        currentStatus: storyForm.currentStatus,
                        organization: storyForm.organization,
                        degree: storyForm.degree || 'B.E. — Pulchowk Campus, IOE',
                        location: storyForm.location || 'Kathmandu, Nepal',
                        quote: storyForm.quote || 'Strong academic foundation sparked my interest to reach new professional milestones.',
                        achievement: storyForm.achievement || 'Excellent SEE Results & Placement',
                        photo: null,
                        category: storyForm.category,
                        featured: false,
                        isGuestRecommended: true,
                        status: 'pending',
                        createdAt: new Date().toISOString()
                      };
                      try {
                        await addDoc(collection(db, 'alumni_submissions'), newStory);
                        
                        // Also notify Principal/Management via EmailJS
                        sendAlumniEmail({
                          name: storyForm.name,
                          batch: storyForm.batch,
                          currentStatus: storyForm.currentStatus,
                          organization: storyForm.organization,
                          degree: storyForm.degree,
                          category: storyForm.category,
                          quote: storyForm.quote,
                        }).catch(err => console.warn("Email notification failed for alumni submission:", err));

                        setRecommendationSent(true);
                        showToast("🎉 Thank you! Your story has been submitted for administrator review.");
                      } catch (err) {
                        console.error("Error submitting story:", err);
                        showToast("❌ Error submitting your story. Please try again.");
                      }
                    }} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-black text-gray-500 uppercase mb-1">Your Full Name <span className="text-red-500">*</span></label>
                          <input 
                            type="text" 
                            required 
                            placeholder="e.g. Binod Prasad Yadav"
                            value={storyForm.name}
                            onChange={e => setStoryForm({...storyForm, name: e.target.value})}
                            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-sm text-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-black text-gray-500 uppercase mb-1">Batch Year <span className="text-red-500">*</span></label>
                          <select 
                            value={storyForm.batch} 
                            onChange={e => setStoryForm({...storyForm, batch: e.target.value})}
                            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-sm text-primary"
                          >
                            <option value="SEE Batch 2082">SEE Batch 2082 B.S.</option>
                            <option value="SEE Batch 2081">SEE Batch 2081 B.S.</option>
                            <option value="SEE Batch 2080">SEE Batch 2080 B.S.</option>
                            <option value="SEE Batch 2079">SEE Batch 2079 B.S.</option>
                            <option value="SEE Batch 2078">SEE Batch 2078 B.S.</option>
                            <option value="SEE Batch 2077">SEE Batch 2077 B.S.</option>
                            <option value="SEE Batch 2076">SEE Batch 2076 B.S.</option>
                            <option value="SEE Batch 2075">SEE Batch 2075 B.S.</option>
                            <option value="SEE Batch 2074">SEE Batch 2074 B.S.</option>
                            <option value="SEE Batch 2073">SEE Batch 2073 B.S.</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-black text-gray-500 uppercase mb-1">Current Job / Role <span className="text-red-500">*</span></label>
                          <input 
                            type="text" 
                            required 
                            placeholder="e.g. Software Engineer, Medical Officer"
                            value={storyForm.currentStatus}
                            onChange={e => setStoryForm({...storyForm, currentStatus: e.target.value})}
                            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-sm text-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-black text-gray-500 uppercase mb-1">Affiliation / Organization <span className="text-red-500">*</span></label>
                          <input 
                            type="text" 
                            required 
                            placeholder="e.g. Tribhuvan University, IOE, Ncell"
                            value={storyForm.organization}
                            onChange={e => setStoryForm({...storyForm, organization: e.target.value})}
                            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-sm text-primary"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-black text-gray-500 uppercase mb-1">Degree / College Stream</label>
                          <input 
                            type="text" 
                            placeholder="e.g. Bachelor in Computer Application"
                            value={storyForm.degree}
                            onChange={e => setStoryForm({...storyForm, degree: e.target.value})}
                            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-sm text-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-black text-gray-500 uppercase mb-1">Sector Classification</label>
                          <select 
                            value={storyForm.category} 
                            onChange={e => setStoryForm({...storyForm, category: e.target.value})}
                            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-sm text-primary"
                          >
                            <option value="Technology">Technology</option>
                            <option value="Engineering">Engineering</option>
                            <option value="Medical">Medical</option>
                            <option value="Finance">Finance</option>
                            <option value="Education">Education</option>
                            <option value="Science">Science</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1">Inspirational Quote for Junior Candidates</label>
                        <textarea 
                          rows={2}
                          placeholder="Share a golden memory or tip that guided your success at school..."
                          value={storyForm.quote}
                          onChange={e => setStoryForm({...storyForm, quote: e.target.value})}
                          className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-sm text-primary resize-none"
                        />
                      </div>

                      <div className="flex justify-end pt-2">
                        <button 
                          type="submit" 
                          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer animate-in fade-in duration-300"
                        >
                          Submit Success Story
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </motion.div>
        </div>

        {/* PENDING SUBMISSIONS FOR ADMIN REVIEW */}
        {isAdmin && pendingStories.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-6 md:p-10 shadow-sm border border-amber-100 relative overflow-hidden mb-12 max-w-7xl mx-auto"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-50/50 rounded-full blur-3xl pointer-events-none" />
            
            <div className="mb-8 relative z-10">
              <span className="bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase mb-3 inline-block">
                Moderation Queue
              </span>
              <h2 className="text-2xl md:text-3xl font-black mb-3 text-gray-900">Pending Alumni Submissions</h2>
              <p className="text-gray-500 text-sm">
                The following profiles were submitted by guest users. Review and approve them to add them to the public directory.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
              <AnimatePresence mode="popLayout">
                {pendingStories.map((a, idx) => (
                  <motion.div
                    key={a.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="bg-amber-50/30 border border-amber-200/60 p-5 rounded-2xl flex flex-col justify-between hover:shadow-md transition-shadow relative"
                  >
                    <div className="absolute top-3 right-3 bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[9px] font-extrabold uppercase">
                      New Request
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-lg">
                          {getInitials(a.name)}
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 leading-tight pr-14">{a.name}</h3>
                          <p className="text-xs text-gray-500 font-medium">{a.batch}</p>
                        </div>
                      </div>

                      <div className="space-y-2 text-sm text-gray-600 mb-4">
                        <div className="flex items-start gap-2">
                          <Briefcase className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                          <div>
                            <p className="font-bold text-gray-800 text-xs">{a.currentStatus}</p>
                            <p className="text-xs">{a.organization}</p>
                          </div>
                        </div>
                        {a.degree && (
                          <div className="flex items-start gap-2">
                            <GraduationCap className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                            <p className="text-xs">{a.degree}</p>
                          </div>
                        )}
                        <p className="text-xs text-indigo-600 font-bold">Category: {a.category}</p>
                      </div>

                      {a.quote && (
                        <div className="text-xs italic text-gray-500 border-l-2 border-amber-200 pl-3 py-1 mb-4">
                          "{a.quote}"
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-gray-150">
                      <button
                        onClick={async () => {
                          // Approve
                          try {
                            const ref = doc(db, 'alumni_submissions', a.id);
                            await updateDoc(ref, { status: 'approved' });
                            showToast(`✅ Approved success story of ${a.name}!`);
                          } catch (e) {
                            console.error("Failed to approve:", e);
                            showToast("❌ Failed to approve. Check permissions.");
                          }
                        }}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors shadow-sm"
                      >
                        Approve
                      </button>
                      <button
                        onClick={async () => {
                          // Reject
                          try {
                            const ref = doc(db, 'alumni_submissions', a.id);
                            await deleteDoc(ref);
                            showToast(`❌ Discarded submission of ${a.name}.`);
                          } catch (e) {
                            console.error("Failed to discard:", e);
                            showToast("❌ Failed to discard.");
                          }
                        }}
                        className="py-2 px-3 bg-gray-150 hover:bg-red-50 hover:text-red-700 text-gray-650 font-bold rounded-xl text-xs uppercase transition-colors"
                      >
                        Discard
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* ADMIN STATISTICS (Only visible to admin) */}
        {isAdmin && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8 mb-12">
            <h2 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-indigo-600" /> Alumni Statistics
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
               <div className="p-4 border-primary text-primary rounded-xl border border-gray-100">
                 <p className="text-sm font-bold text-gray-500 uppercase">Total Alumni</p>
                 <p className="text-3xl font-black text-gray-900 mt-1">{stats.total}</p>
               </div>
               <div className="p-4 border-primary text-primary rounded-xl border border-gray-100">
                 <p className="text-sm font-bold text-gray-500 uppercase">Featured Profiles</p>
                 <p className="text-3xl font-black text-yellow-600 mt-1">{stats.featured}</p>
               </div>
               <div className="p-4 border-primary text-primary rounded-xl border border-gray-100 lg:col-span-2">
                 <p className="text-sm font-bold text-gray-500 uppercase mb-3">Categories Breakdown</p>
                 <div className="flex flex-wrap gap-2">
                   {Object.entries(stats.catCounts).map(([cat, count]) => (
                     <span key={cat} className={`px-2.5 py-1 rounded-md text-xs font-bold ${getCategoryBadgeStyles(cat)}`}>
                       {cat}: {count}
                     </span>
                   ))}
                 </div>
               </div>
            </div>
          </div>
        )}

      </div>

      {/* ADD / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center text-primary">
              <h2 className="text-xl font-black text-gray-900">{editingAlumnus ? 'Edit Alumni' : 'Add New Alumni'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400 hover:bg-gray-200 rounded-full transition"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name *</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 border-primary text-primary border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Category *</label>
                  <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-4 py-2 border-primary text-primary border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none">
                    {categories.filter(c => c !== "All").map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Batch / Graduation Year *</label>
                  <input type="text" placeholder="e.g. SEE Batch 2075" value={formData.batch} onChange={e => setFormData({...formData, batch: e.target.value})} className="w-full px-4 py-2 border-primary text-primary border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">SEE GPA / Percentage</label>
                  <input type="text" placeholder="e.g. 3.85 GPA" value={formData.seeBand} onChange={e => setFormData({...formData, seeBand: e.target.value})} className="w-full px-4 py-2 border-primary text-primary border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Current Status / Role *</label>
                  <input type="text" placeholder="e.g. Engineer, Student" value={formData.currentStatus} onChange={e => setFormData({...formData, currentStatus: e.target.value})} className="w-full px-4 py-2 border-primary text-primary border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Organization / College *</label>
                  <input type="text" placeholder="e.g. Nepal Electricity Authority" value={formData.organization} onChange={e => setFormData({...formData, organization: e.target.value})} className="w-full px-4 py-2 border-primary text-primary border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Degree (Optional)</label>
                  <input type="text" placeholder="e.g. B.E. Civil Engineering" value={formData.degree} onChange={e => setFormData({...formData, degree: e.target.value})} className="w-full px-4 py-2 border-primary text-primary border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Location</label>
                  <input type="text" placeholder="e.g. Kathmandu, Nepal" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="w-full px-4 py-2 border-primary text-primary border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>

                <div className="md:col-span-2 space-y-3 p-4 border-primary text-primary border border-gray-200 rounded-lg">
                   <label className="block text-xs font-bold text-gray-500 uppercase">Alumni Photo</label>
                   <div className="flex gap-4 mb-2">
                     <button type="button" onClick={() => setFormData({...formData, photoSource: 'url'})} className={`text-xs font-bold px-3 py-1.5 rounded-full ${formData.photoSource !== 'device' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600'}`}>Image URL</button>
                     <button type="button" onClick={() => setFormData({...formData, photoSource: 'device'})} className={`text-xs font-bold px-3 py-1.5 rounded-full ${formData.photoSource === 'device' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600'}`}>Upload from Device</button>
                   </div>
                   {formData.photoSource === 'device' ? (
                     <input type="file" accept="image/*" onChange={(e) => {
                       const file = e.target.files?.[0];
                       if (file) {
                         const reader = new FileReader();
                         reader.onloadend = () => {
                           setFormData({...formData, photo: reader.result as string});
                         };
                         reader.readAsDataURL(file);
                       }
                     }} className="w-full text-sm font-semibold file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                   ) : (
                     <input type="text" placeholder="https://example.com/photo.jpg" value={formData.photo || ''} onChange={e => setFormData({...formData, photo: e.target.value})} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none" />
                   )}
                   {formData.photo && (
                     <div className="mt-2 h-20 w-20 rounded-full overflow-hidden border border-gray-200">
                       <img src={formData.photo} alt="Preview" className="w-full h-full object-cover" />
                     </div>
                   )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Achievement (Highlight)</label>
                  <input type="text" placeholder="e.g. District Topper in SEE 2075" value={formData.achievement} onChange={e => setFormData({...formData, achievement: e.target.value})} className="w-full px-4 py-2 border-primary text-primary border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Quote to current students</label>
                  <textarea rows={3} value={formData.quote} onChange={e => setFormData({...formData, quote: e.target.value})} className="w-full px-4 py-2 border-primary text-primary border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none resize-none"></textarea>
                </div>
                
                <div className="md:col-span-2 flex items-center justify-between p-4 border-primary text-primary border border-gray-200 rounded-lg">
                   <div>
                     <p className="text-sm font-bold text-gray-900">Featured Alumni</p>
                     <p className="text-xs text-gray-500">Show this profile prominently at the top of the page</p>
                   </div>
                   <label className="relative inline-flex items-center cursor-pointer">
                     <input type="checkbox" checked={formData.featured} onChange={e => setFormData({...formData, featured: e.target.checked})} className="sr-only peer" />
                     <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                   </label>
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 text-primary">
              <button onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 rounded-xl text-sm font-bold text-gray-700 bg-white border border-gray-300 hover:text-primary transition">
                Cancel
              </button>
              <button onClick={handleSave} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-dark transition shadow-md">
                Save Alumni
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2">Remove Alumni?</h3>
            <p className="text-sm font-medium text-gray-600 mb-6">
              Are you sure you want to completely remove this alumni record? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteId(null)}
                className="flex-1 py-3 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
              >
                Cancel
              </button>
              <button 
                onClick={handleDelete}
                className="flex-1 py-3 text-sm font-black text-white bg-red-500 hover:bg-red-600 rounded-xl transition shadow-md"
              >
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
