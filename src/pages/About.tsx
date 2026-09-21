import { Helmet } from 'react-helmet-async';
import { 
  Info, Target, Eye, Heart, History as HistoryIcon, Edit2, Save, X, 
  MapPin, Quote, Award, School, BookOpen, ShieldCheck,
  Compass, Lightbulb, Users, Calendar
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { motion } from 'motion/react';
import principalImg from '../assets/images/regenerated_image_1780334392921.jpg';
const logoImageSrc = "/logo.png";

const logoImage = logoImageSrc || "/logo.png";
const logoFallback = "/logo.png";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 25 },
  show: { 
    opacity: 1, 
    y: 0, 
    transition: { 
      type: "spring", 
      stiffness: 140, 
      damping: 18 
    } 
  }
};

const cardHoverProps = {
  whileHover: { 
    y: -6, 
    scale: 1.01,
    boxShadow: "0 20px 40px rgba(0, 0, 0, 0.04), 0 8px 16px rgba(0, 0, 0, 0.03)"
  },
  whileTap: { scale: 0.995 },
  transition: { type: "spring", stiffness: 300, damping: 20 }
};

export default function About() {
  const defaultContent = {
    aboutUs: 'Established in the heart of Karjanha Municipality, Ward No. 05, Siraha, Shikshantar Academy is a distinguished educational institution committed to academic excellence and character development. From Playgroup through Class Ten, we cultivate an enriching environment that transforms students into confident, capable, and compassionate individuals.',
    mission: 'To deliver a transformative educational experience in a safe, progressive, and nurturing environment, empowering students to maximize their academic potential, embrace critical thinking, and emerge as responsible global citizens.',
    vision: 'To serve as a center of educational excellence across Madhesh Province and beyond, inspiring a lifelong passion for learning, unyielding creativity, and principled leadership in every student.',
    history: 'Founded with a profound vision to elevate the educational landscape of Siraha, Shikshantar Academy has steadily evolved into a prestigious institution of learning. Through our unwavering dedication to pedagogical excellence, we have consistently nurtured top-tier talent and secured our standing as a trusted partner for parents investing in their children\'s future.',
    principalMessage: 'At Shikshantar Academy, we believe in nurturing not just academic excellence, but character, creativity, and critical thinking. Our peaceful environment and modern facilities provide the perfect setting for your child to grow and thrive. We are dedicated to cultivating a community of lifelong learners, encouraging critical inquiry, and equipping each young mind with the principles of integrity, empathy, and resilience necessary to succeed in a globalized society.',
    principalName: 'Pappu Kumar Jha',
    principalTitle: 'Principal & Academic Director'
  };

  const [content, setContent] = useState(defaultContent);
  const [isEditing, setIsEditing] = useState(false);
  const [tempContent, setTempContent] = useState(defaultContent);

  const userRole = auth.currentUser ? (localStorage.getItem('userRole') || 'student') : 'guest';
  const isAdmin = auth.currentUser ? userRole === 'admin' : false;

  useEffect(() => {
    const loadData = () => {
      const rawData = localStorage.getItem('school_about_v3');
      if (rawData) {
        try {
          const parsed = JSON.parse(rawData);
          const merged = { ...defaultContent, ...parsed };
          setContent(merged);
          setTempContent(merged);
        } catch (e) {
          console.error("Failed to parse about page content:", e);
        }
      } else {
        setContent(defaultContent);
        setTempContent(defaultContent);
      }
    };
    
    loadData();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'school_about_v3') {
        loadData();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleSave = () => {
    setContent(tempContent);
    localStorage.setItem('school_about_v3', JSON.stringify(tempContent));
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempContent(content);
    setIsEditing(false);
  };

  return (
    <motion.div 
      initial="hidden"
      animate="show"
      variants={containerVariants}
      className="flex flex-col max-w-7xl mx-auto pb-20 px-4 sm:px-6 lg:px-8 space-y-12"
    >
      <Helmet>
        <title>About Us | Shikshantar Academy</title>
        <meta name="description" content="Learn about the history, mission, and vision of Shikshantar Academy, providing excellence in education in Siraha." />
        <link rel="canonical" href="https://www.shikshantaracademy.edu.np/about" />
      </Helmet>
      
      {/* Admin Action Bar */}
      {isAdmin && (
        <motion.div variants={itemVariants} className="flex justify-end w-full">
          {isEditing ? (
            <div className="flex gap-3 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200/80 dark:border-slate-800 backdrop-blur-md shadow-lg">
              <button 
                onClick={handleSave} 
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md transition-all active:scale-95"
              >
                <Save className="w-4 h-4"/> Save Changes
              </button>
              <button 
                onClick={handleCancel} 
                className="bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 border border-rose-200/60 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95"
              >
                <X className="w-4 h-4"/> Cancel
              </button>
            </div>
          ) : (
             <button 
                onClick={() => setIsEditing(true)} 
                className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-850 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all hover:shadow-xl active:scale-95"
             >
                <Edit2 className="w-4 h-4 text-amber-400"/> Edit Page Content
              </button>
          )}
        </motion.div>
      )}

      {/* Hero Header Section */}
      <motion.section 
        variants={itemVariants}
        className="bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-950 rounded-[2.5rem] p-8 md:p-12 lg:p-16 shadow-xl border border-slate-100 dark:border-slate-800/80 relative overflow-hidden group"
      >
        {/* Abstract Ambient Glow Blobs */}
        <div className="absolute top-0 right-0 w-[550px] h-[550px] bg-indigo-50/50 dark:bg-indigo-950/20 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 opacity-80 pointer-events-none transition-all duration-1000 group-hover:bg-indigo-100/40" />
        <div className="absolute -bottom-20 -left-20 w-[450px] h-[450px] bg-blue-50/30 dark:bg-blue-950/10 rounded-full blur-[100px] opacity-70 pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          
          {/* Main Hero Typography */}
          <div className="lg:col-span-7 space-y-6">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-none text-slate-900 dark:text-white tracking-tight">
              Shikshantar <br />
              <span className="bg-gradient-to-r from-indigo-600 via-primary to-blue-600 bg-clip-text text-transparent">Academy</span>
            </h1>
            
            <p className="text-lg md:text-xl font-extrabold text-blue-600 dark:text-blue-400 tracking-tight flex items-center gap-2">
              <span className="w-6 h-0.5 bg-blue-500 rounded-full shrink-0" />
              Empowering Minds, Shaping Futures
            </p>
            
            {isEditing ? (
              <textarea 
                className="w-full text-base text-gray-700 dark:text-slate-200 leading-relaxed p-4 border-2 border-indigo-300 dark:border-indigo-700 rounded-2xl focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-950/50 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition-all resize-y min-h-[160px] font-medium"
                value={tempContent.aboutUs}
                onChange={(e) => setTempContent({...tempContent, aboutUs: e.target.value})}
              />
            ) : (
              <p className="text-base md:text-lg text-slate-600 dark:text-slate-350 leading-relaxed font-medium">
                {content.aboutUs}
              </p>
            )}
            
            <div className="pt-4 flex flex-wrap gap-4 items-center">
              <a
                href="https://maps.app.goo.gl/Ykri7uu78Y22NVjd6"
                target="_blank"
                rel="noopener noreferrer"
                className="group/btn inline-flex items-center gap-2.5 px-6 py-3.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg hover:bg-slate-800 dark:hover:bg-white hover:shadow-xl transition-all active:scale-95"
              >
                <MapPin className="h-4 w-4 text-amber-500 group-hover/btn:scale-110 transition-transform" />
                Find Us on Map
              </a>
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs font-black tracking-wider uppercase text-slate-500 dark:text-slate-400">Siraha, Nepal</span>
              </div>
            </div>
          </div>

          {/* School Emblem Centerpiece */}
          <div className="lg:col-span-5 flex justify-center">
            <div 
              className="relative w-72 h-72 sm:w-80 sm:h-80 md:w-88 md:h-88 lg:w-96 lg:h-96 rounded-[2.5rem] sm:rounded-[3rem] bg-gradient-to-br from-indigo-50/60 via-white to-blue-50/50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 border-2 border-indigo-100/80 dark:border-slate-800 shadow-xl flex items-center justify-center p-3 sm:p-4 md:p-5 overflow-hidden"
            >
              <div className="absolute inset-2.5 sm:inset-3 rounded-[2rem] sm:rounded-[2.4rem] border border-indigo-200/60 dark:border-indigo-800/40 pointer-events-none" />
              
              <img 
                src={logoImage} 
                alt="Shikshantar Academy Emblem" 
                className="relative z-10 w-full h-full object-contain filter drop-shadow-md select-none pointer-events-none"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src !== logoFallback) {
                    target.src = logoFallback;
                  }
                }}
              />
            </div>
          </div>

        </div>
      </motion.section>

      {/* Words from the Leadership / Principal's Message Section */}
      <motion.section 
        variants={itemVariants}
        className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 md:p-12 lg:p-14 shadow-xl border border-slate-100 dark:border-slate-800/80 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 dark:bg-amber-500/2 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/5 dark:bg-blue-500/2 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          
          {/* Principal Picture Block */}
          <div className="lg:col-span-4 flex flex-col items-center">
            <motion.div 
              whileHover={{ scale: 1.02 }}
              className="relative rounded-[2rem] p-1 bg-gradient-to-tr from-amber-500 via-indigo-600 to-blue-500 shadow-2xl"
            >
              <div className="w-64 h-76 sm:w-72 sm:h-84 overflow-hidden rounded-[1.8rem] bg-slate-100 dark:bg-slate-800 border-4 border-white dark:border-slate-900 relative">
                <img 
                  src={principalImg} 
                  alt="Principal Pappu Kumar Jha" 
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-[center_86%] transition-transform duration-700 hover:scale-110" 
                />
              </div>
            </motion.div>
            
            <div className="text-center mt-6">
              {isEditing ? (
                <div className="space-y-2">
                  <input 
                    type="text"
                    className="text-lg font-black text-slate-800 dark:text-white px-3 py-1.5 border-2 border-indigo-300 dark:border-indigo-700 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 text-center font-bold"
                    value={tempContent.principalName}
                    onChange={(e) => setTempContent({...tempContent, principalName: e.target.value})}
                  />
                  <input 
                    type="text"
                    className="text-xs font-black text-indigo-600 dark:text-indigo-400 px-3 py-1 border-2 border-indigo-300 dark:border-indigo-700 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 text-center uppercase tracking-widest"
                    value={tempContent.principalTitle}
                    onChange={(e) => setTempContent({...tempContent, principalTitle: e.target.value})}
                  />
                </div>
              ) : (
                <>
                  <h3 className="text-xl font-black text-slate-850 dark:text-white tracking-tight">{content.principalName}</h3>
                  <p className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mt-1">{content.principalTitle}</p>
                </>
              )}
            </div>
          </div>

          {/* Principal's Message Text */}
          <div className="lg:col-span-8 flex flex-col justify-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-lg w-max">
              <Award className="w-3.5 h-3.5" />
              Leadership Message
            </div>
            
            <div className="relative">
              <Quote className="absolute -top-6 -left-6 w-12 h-12 text-slate-200 dark:text-slate-800 -z-10" />
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                Welcome to Shikshantar Academy
              </h2>
            </div>

            {isEditing ? (
              <textarea 
                className="w-full text-base text-gray-700 dark:text-slate-300 leading-relaxed p-4 border-2 border-indigo-300 dark:border-indigo-700 rounded-2xl focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-950/50 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition-all resize-y min-h-[160px] font-medium"
                value={tempContent.principalMessage}
                onChange={(e) => setTempContent({...tempContent, principalMessage: e.target.value})}
              />
            ) : (
              <p className="text-base text-slate-650 dark:text-slate-300 leading-relaxed font-semibold italic">
                "{content.principalMessage}"
              </p>
            )}

            <div className="border-t border-slate-100 dark:border-slate-800 pt-6 flex flex-wrap gap-6 text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                  <School className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Accredited By</p>
                  <p className="text-xs font-black text-slate-800 dark:text-white">CDC Department, Gov. of Nepal</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </motion.section>

      {/* Mission & Vision Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
        
        {/* Mission Card */}
        <motion.section 
          variants={itemVariants}
          {...cardHoverProps}
          className="group relative bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 shadow-lg border border-slate-100 dark:border-slate-800/80 flex flex-col relative overflow-hidden border-t-4 border-t-amber-500 cursor-default"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-bl-full pointer-events-none transition-all duration-300 group-hover:scale-110" />
          
          <div className="w-12 h-12 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-amber-500 group-hover:text-white dark:group-hover:text-slate-950 transition-all duration-300 shadow-inner border border-amber-100/50 dark:border-amber-900/30">
             <Target className="w-6 h-6 animate-pulse" />
          </div>
          
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-4 flex items-center gap-2">
            Our Mission
          </h2>
          
          {isEditing ? (
            <textarea 
              className="w-full text-sm text-gray-700 dark:text-slate-200 leading-relaxed p-3.5 border-2 border-amber-200 dark:border-amber-800 rounded-xl focus:ring-4 focus:ring-amber-100 dark:focus:ring-amber-950 focus:bg-white dark:focus:bg-slate-950 outline-none transition-all resize-y min-h-[140px] font-medium"
              value={tempContent.mission}
              onChange={(e) => setTempContent({...tempContent, mission: e.target.value})}
            />
          ) : (
            <p className="text-sm md:text-base text-slate-600 dark:text-slate-350 leading-relaxed font-semibold">
              {content.mission}
            </p>
          )}
        </motion.section>

        {/* Vision Card */}
        <motion.section 
          variants={itemVariants}
          {...cardHoverProps}
          className="group relative bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 shadow-lg border border-slate-100 dark:border-slate-800/80 flex flex-col relative overflow-hidden border-t-4 border-t-indigo-500 cursor-default"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-full pointer-events-none transition-all duration-300 group-hover:scale-110" />

          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-inner border border-indigo-100/50 dark:border-indigo-900/30">
             <Eye className="w-6 h-6" />
          </div>
          
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-4 flex items-center gap-2">
            Our Vision
          </h2>
          
          {isEditing ? (
            <textarea 
              className="w-full text-sm text-gray-700 dark:text-slate-200 leading-relaxed p-3.5 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-950 focus:bg-white dark:focus:bg-slate-950 outline-none transition-all resize-y min-h-[140px] font-medium"
              value={tempContent.vision}
              onChange={(e) => setTempContent({...tempContent, vision: e.target.value})}
            />
          ) : (
            <p className="text-sm md:text-base text-slate-600 dark:text-slate-350 leading-relaxed font-semibold">
              {content.vision}
            </p>
          )}
        </motion.section>
      </div>

      {/* History and Legacy Timeline Layout */}
      <motion.section 
        variants={itemVariants}
        className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 sm:p-12 shadow-lg border border-slate-100 dark:border-slate-800/80 cursor-default relative overflow-hidden"
      >
        <div className="absolute bottom-0 right-0 w-56 h-56 bg-indigo-500/5 rounded-tl-full pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center shadow-inner border border-indigo-100/50 dark:border-indigo-900/30">
               <HistoryIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Our Heritage</p>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Our Legendary Journey</h2>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950 border border-indigo-100/60 dark:border-indigo-900 text-indigo-700 dark:text-indigo-450 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider w-max">
            <Award className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> Founded 2072 B.S.
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-8">
            {isEditing ? (
              <textarea 
                className="w-full text-sm text-gray-700 dark:text-slate-200 leading-relaxed p-4 border-2 border-indigo-200 dark:border-indigo-800 rounded-2xl focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-950 focus:bg-white dark:focus:bg-slate-950 outline-none transition-all resize-y min-h-[160px] font-medium"
                value={tempContent.history}
                onChange={(e) => setTempContent({...tempContent, history: e.target.value})}
              />
            ) : (
              <p className="text-sm md:text-base text-slate-650 dark:text-slate-350 leading-relaxed font-semibold whitespace-pre-wrap">
                {content.history}
              </p>
            )}
          </div>
          
          <div className="lg:col-span-4 bg-slate-50 dark:bg-slate-950/60 border border-slate-150 dark:border-slate-800 rounded-3xl p-6 space-y-4">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Quick Milestones</h4>
            
            <div className="space-y-3">
              <div className="flex gap-3">
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">2072 BS</span>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-bold">Established with basic facilities and dedicated local academic mentors.</p>
              </div>
              <div className="flex gap-3">
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">2078 BS</span>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-bold">Upgraded classrooms with digital study resources and specialized laboratories.</p>
              </div>
              <div className="flex gap-3">
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">2083 BS</span>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-bold">Inaugurated full digital ERP system and English medium pre-primary wings.</p>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Core Values & Management Pillars */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        
        {/* Core Values */}
        <div className="lg:col-span-7 flex flex-col">
          <motion.section 
            variants={itemVariants}
            className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 sm:p-10 shadow-lg border border-slate-100 dark:border-slate-800/80 flex-1 flex flex-col relative overflow-hidden group"
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center shadow-inner border border-rose-100/50 dark:border-rose-900/30 group-hover:scale-105 transition-transform">
                 <Heart className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">Our Core Values</h2>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
              <motion.div 
                whileHover={{ scale: 1.025, y: -2 }} 
                className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-white dark:hover:bg-slate-900 hover:border-amber-200 dark:hover:border-amber-800/60 hover:shadow-md transition-all duration-300"
              >
                <h4 className="font-black text-slate-800 dark:text-white text-xs sm:text-sm mb-1 uppercase tracking-wider text-amber-600 dark:text-amber-500">Excellence</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold leading-relaxed">Maintaining the highest academic and extracurricular benchmarks in Madhesh province.</p>
              </motion.div>
              
              <motion.div 
                whileHover={{ scale: 1.025, y: -2 }} 
                className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-white dark:hover:bg-slate-900 hover:border-indigo-200 dark:hover:border-indigo-800/60 hover:shadow-md transition-all duration-300"
              >
                <h4 className="font-black text-slate-800 dark:text-white text-xs sm:text-sm mb-1 uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Integrity</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold leading-relaxed">Inspiring moral clarity, unyielding honesty, and ethical leadership in every pupil.</p>
              </motion.div>
              
              <motion.div 
                whileHover={{ scale: 1.025, y: -2 }} 
                className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-white dark:hover:bg-slate-900 hover:border-emerald-200 dark:hover:border-emerald-800/60 hover:shadow-md transition-all duration-300"
              >
                <h4 className="font-black text-slate-800 dark:text-white text-xs sm:text-sm mb-1 uppercase tracking-wider text-emerald-600 dark:text-emerald-500">Respect</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold leading-relaxed">Fostering deep mutual respect, appreciating cultural diversity, and celebrating equality.</p>
              </motion.div>
              
              <motion.div 
                whileHover={{ scale: 1.025, y: -2 }} 
                className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-white dark:hover:bg-slate-900 hover:border-blue-200 dark:hover:border-blue-800/60 hover:shadow-md transition-all duration-300"
              >
                <h4 className="font-black text-slate-800 dark:text-white text-xs sm:text-sm mb-1 uppercase tracking-wider text-blue-600 dark:text-blue-400">Innovation</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold leading-relaxed">Embracing progressive learning with modern computer labs, BALA visual aids, and smart tools.</p>
              </motion.div>
            </div>
          </motion.section>
        </div>

        {/* Management & Accolades Card */}
        <div className="lg:col-span-5 flex flex-col">
          <motion.section 
            variants={itemVariants}
            whileHover={{ 
              y: -6, 
              scale: 1.01,
              boxShadow: "0 20px 40px rgba(99, 102, 241, 0.08)"
            }}
            className="bg-slate-900 border border-slate-850 dark:border-slate-800/80 text-white rounded-[2.5rem] p-8 shadow-lg flex flex-col justify-between relative overflow-hidden group cursor-default flex-1"
          >
            {/* Glowing Mesh Circles */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full blur-[90px] -translate-y-1/2 translate-x-1/3 opacity-25 pointer-events-none transition-opacity duration-700 group-hover:opacity-35" />
            <div className="absolute -bottom-8 -right-8 opacity-5 transform rotate-[-20deg] scale-150 transition-transform duration-700 group-hover:scale-[1.6]">
              <img src={logoImage} alt="" className="w-48 h-48 object-contain grayscale" />
            </div>
            
            <div className="relative z-10 flex flex-col h-full justify-between gap-8">
              <div>
                <Quote className="w-10 h-10 text-indigo-400 opacity-60 mb-3 animate-pulse" />
                <blockquote className="text-lg sm:text-xl font-bold italic leading-relaxed text-slate-150">
                  "At Shikshantar Academy, our administrative and educational pillars unite to ensure no child is left behind. We provide every facility to make study productive, inspiring, and rewarding."
                </blockquote>
              </div>
              
              <div>
                <div className="h-1.5 w-12 bg-gradient-to-r from-amber-400 to-amber-500 rounded-full mb-3" />
                <p className="font-black text-white text-xs sm:text-sm tracking-widest uppercase">Shikshantar Academic Board</p>
                <p className="text-xs text-indigo-300 font-semibold mt-0.5">Shikshantar Academy Admin Body</p>
              </div>
            </div>
          </motion.section>
        </div>

      </div>

    </motion.div>
  );
}

