import { Activity, Edit2, Save, X, Plus, Trash2, Upload, Image as ImageIcon, Leaf } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'motion/react';
import SpotlightCard from '../components/SpotlightCard';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebase';

interface Facility {
  id: string;
  title: string;
  description: string;
  image: string;
}

const DEFAULT_FACILITIES: Facility[] = [
  {
    id: 'classroom',
    title: 'Classes',
    description: 'Spacious, well-ventilated, and equipped with modern teaching aids. Our classrooms provide a vibrant atmosphere for modern learning.',
    image: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: 'computer-lab',
    title: 'Computer Lab',
    description: 'State-of-art computer lab for practical work and digital skills. Equipped with latest generation PCs and high-speed internet.',
    image: 'https://images.unsplash.com/photo-1562774053-701939374585?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: 'playground',
    title: 'Sports & Playground',
    description: 'A large playground for various sports and physical activities. Promoting health, teamwork, and sportsmanship among students.',
    image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: 'science-lab',
    title: 'Science Lab',
    description: 'Fully equipped physics, chemistry, and biology laboratories providing practical exposure and hands-on learning experiences.',
    image: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: 'library',
    title: 'Library',
    description: 'A well-stocked library with a vast collection of academic books, reference texts, and periodicals to encourage reading habits.',
    image: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: 'transport',
    title: 'Safe School Transport',
    description: 'A fleet of dedicated school buses ensuring a safe, comfortable, and reliable daily commute for students across designated routes.',
    image: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?q=80&w=1000&auto=format&fit=crop',
  },
];

const getFacilityIcon = (id: string) => {
  switch (id) {
    case 'classroom': return '🏫';
    case 'computer-lab': return '💻';
    case 'playground': return '🏀';
    case 'science-lab': return '🔬';
    case 'library': return '📚';
    case 'transport': return '🚌';
    default: return '🏫';
  }
};

export default function Facilities() {
  const [facilitiesText, setFacilitiesText] = useState('Our modern infrastructure is designed to provide students with the best possible environment for learning, growth, and extracurricular development.');
  const [facilitiesList, setFacilitiesList] = useState<Facility[]>([]);
  
  const [isEditing, setIsEditing] = useState(false);
  const [tempText, setTempText] = useState('');
  const [tempFacilities, setTempFacilities] = useState<Facility[]>([]);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const userRole = auth.currentUser ? (localStorage.getItem('userRole') || 'student') : 'guest';
  const isAdmin = auth.currentUser ? userRole === 'admin' : false;

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'school_data', 'facilities_v3'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setFacilitiesText(data.description || 'Our modern infrastructure is designed to provide students with the best possible environment for learning, growth, and extracurricular development.');
        setFacilitiesList(data.items && data.items.length > 0 ? data.items : DEFAULT_FACILITIES);
      } else {
        setFacilitiesText('Our modern infrastructure is designed to provide students with the best possible environment for learning, growth, and extracurricular development.');
        setFacilitiesList(DEFAULT_FACILITIES);
      }
    }, (error) => {
        console.warn("Could not load facilities", error);
    });
    return () => unsub();
  }, []);

  const handleEditClick = () => {
    setTempText(facilitiesText);
    setTempFacilities(JSON.parse(JSON.stringify(facilitiesList))); // Deep copy
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      await setDoc(doc(db, 'school_data', 'facilities_v3'), {
        description: tempText,
        items: tempFacilities
      }, { merge: true });
      setIsEditing(false);
    } catch (e) {
      console.error("Save failed", e);
      alert("Failed to save changes.");
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleFacilityChange = (id: string, field: keyof Facility, value: string) => {
    setTempFacilities(tempFacilities.map(f => f.id === id ? { ...f, [field]: value } : f));
  };

  const handleAddFacility = () => {
    const newFac: Facility = {
      id: `fac_${Date.now()}`,
      title: 'New Facility',
      description: 'Describe the short details about this new facility here.',
      image: 'https://via.placeholder.com/800x600.png?text=New+Facility'
    };
    setTempFacilities([newFac, ...tempFacilities]);
  };

  const handleDeleteFacility = (id: string) => {
    setTempFacilities(tempFacilities.filter(f => f.id !== id));
  };

  const handleImageUpload = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingId(id);
    try {
      const storageRef = ref(storage, `facilities/${id}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      handleFacilityChange(id, 'image', url);
    } catch (err) {
      console.error("Upload error", err);
      alert("Failed to upload image. Please try again.");
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-2 md:p-6 text-primary min-h-screen">
      <Helmet>
        <title>Facilities | Shikshantar Academy</title>
        <meta name="description" content="Explore the modern facilities, science labs, computer labs, and library at Shikshantar Academy." />
        <link rel="canonical" href="https://www.shikshantaracademy.edu.np/facilities" />
      </Helmet>
      
      {/* Header section with Edit controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-xl border shadow-sm">
        <div>
           <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" /> Infrastructure & Facilities
           </h1>
           <p className="text-sm text-gray-500 mt-1 font-medium">Explore the comprehensive amenities at Shikshantar Academy</p>
        </div>

        {isAdmin && (
          <div>
            {isEditing ? (
              <div className="flex gap-2">
                <button onClick={handleSave} className="bg-[#10b981] text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-[#059669] shadow-sm transition-all focus:ring-2 focus:ring-[#10b981]/50">
                  <Save className="w-4 h-4"/> Save Changes
                </button>
                <button onClick={handleCancel} className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:text-primary shadow-sm transition-all">
                  <X className="w-4 h-4"/> Cancel
                </button>
              </div>
            ) : (
               <button onClick={handleEditClick} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-primary-dark shadow-sm transition-all focus:ring-2 focus:ring-primary">
                  <Edit2 className="w-4 h-4"/> Edit Page Content
               </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl p-6 md:p-8 shadow-sm border border-[#e5e7eb]">
        {/* Main Description */}
        <div className="mb-10">
          <h2 className="text-xl font-black text-gray-900 mb-4 border-b border-gray-100 pb-3 uppercase tracking-wider text-primary">Overview</h2>
          {isEditing ? (
            <textarea 
              className="w-full text-base text-[#1f2937] leading-relaxed p-4 border-2 border-blue-100 bg-blue-50/30 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-inner"
              rows={4}
              value={tempText}
              onChange={(e) => setTempText(e.target.value)}
              placeholder="Enter the main overview describing the school's facilities..."
            />
          ) : (
            <p className="text-base md:text-lg text-gray-600 leading-relaxed max-w-5xl text-justify md:text-left font-medium">
              {facilitiesText}
            </p>
          )}
        </div>

        {/* Facilities Header with Add Controls (Only for editing mode) */}
        <div className="mb-10 flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-100 pb-5">
          <div>
            <h2 className="text-xl font-black text-gray-900 uppercase tracking-wider text-primary">Featured Facilities</h2>
            <p className="text-xs text-slate-400 mt-1 font-medium">Staggered interactive overview of our educational spaces</p>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            {isEditing && (
              <button onClick={handleAddFacility} className="text-blue-600 hover:text-blue-800 font-bold text-sm flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-md transition-colors hover:bg-blue-100 cursor-pointer">
                <Plus className="w-4 h-4" /> Add Facility
              </button>
            )}
          </div>
        </div>

        {/* Cinematic Showcase Layout */}
        {!isEditing && (
          <div className="relative flex flex-col gap-12 md:gap-20 my-6">
            {/* Elegant vertical timeline bar down the middle for desktop */}
            <div className="absolute left-[20px] md:left-1/2 top-10 bottom-10 w-[2px] bg-gradient-to-b from-slate-200 via-indigo-150 to-slate-200 pointer-events-none -translate-x-1/2 hidden md:block" />

            {facilitiesList.map((facility, idx) => {
              const isEven = idx % 2 === 0;
              
              return (
                <div 
                  key={facility.id} 
                  className={`relative flex flex-col ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'} items-center gap-8 md:gap-14 w-full`}
                >
                  {/* Timeline center dot */}
                  <div className="absolute left-[20px] md:left-1/2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-4 border-blue-600 shadow-md -translate-x-1/2 z-20 hidden md:block" />

                  {/* Image side with Spotlight Card */}
                  <motion.div 
                    className="w-full md:w-1/2"
                    initial={{ opacity: 0, x: isEven ? -40 : 40, y: 20 }}
                    whileInView={{ opacity: 1, x: 0, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.4 }}
                  >
                    <SpotlightCard
                      roundedClass="rounded-2xl"
                      spotlightColor="rgba(59, 130, 246, 0.2)"
                      borderGlowColor="rgba(59, 130, 246, 0.9)"
                      glowAuraColor="rgba(59, 130, 246, 0.35)"
                      className="cursor-pointer shadow-md hover:shadow-2xl transition-all duration-300"
                      innerClassName="bg-slate-50 rounded-[14px] overflow-hidden p-0 border-0"
                      onClick={() => setExpandedImage(facility.image)}
                    >
                      <div className="relative aspect-video md:aspect-[4/3] w-full overflow-hidden group">
                        {/* Parallax Hover Image */}
                        <img
                          src={facility.image}
                          alt={facility.title}
                          className="w-full h-full object-cover group-hover/spotlight:scale-105 transition-transform duration-500 ease-out"
                          referrerPolicy="no-referrer"
                        />
                        
                        {/* Modern Overlay Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-transparent opacity-0 group-hover/spotlight:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        
                        {/* Centered Hover Zoom Icon */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/spotlight:opacity-100 transition-all scale-95 group-hover/spotlight:scale-100 duration-300">
                          <div className="bg-white/95 backdrop-blur-md px-4 py-2 rounded-full shadow-lg text-slate-900 font-bold text-xs flex items-center gap-2 border border-slate-200">
                            <ImageIcon className="w-4 h-4 text-blue-600" />
                            Click to Expand Photo
                          </div>
                        </div>

                        {/* Left top floating tag */}
                        <div className="absolute top-4 left-4 px-3 py-1 bg-white/95 backdrop-blur-xs text-slate-800 text-[10px] font-black uppercase tracking-wider rounded-lg shadow-sm border border-slate-200/60 flex items-center gap-1.5">
                          {getFacilityIcon(facility.id)} <span>{facility.title.toUpperCase()}</span>
                        </div>
                      </div>
                    </SpotlightCard>
                  </motion.div>

                  {/* Text side with Spotlight Card container */}
                  <motion.div 
                    className="w-full md:w-1/2"
                    initial={{ opacity: 0, x: isEven ? 40 : -40, y: 20 }}
                    whileInView={{ opacity: 1, x: 0, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                  >
                    <SpotlightCard
                      roundedClass="rounded-2xl"
                      spotlightColor="rgba(240, 165, 0, 0.18)"
                      borderGlowColor="rgba(240, 165, 0, 0.9)"
                      glowAuraColor="rgba(240, 165, 0, 0.3)"
                      className="shadow-sm hover:shadow-xl transition-all duration-300"
                      innerClassName="bg-white p-6 md:p-8 rounded-[14px] border-0"
                    >
                      <div className="flex flex-col gap-3 relative">
                        {/* Background Serial Number */}
                        <div className="absolute -top-6 right-0 text-6xl md:text-7xl font-black text-slate-100 dark:text-slate-800/40 select-none font-mono tracking-tighter pointer-events-none -z-10">
                          {String(idx + 1).padStart(2, '0')}
                        </div>

                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-black font-mono bg-blue-50 text-blue-700 border border-blue-200/80 px-2.5 py-1 rounded-md select-none shrink-0">
                            FACILITY {String(idx + 1).padStart(2, '0')}
                          </span>
                        </div>

                        <h3 className="text-xl md:text-2xl font-bold font-display text-slate-900 tracking-tight leading-tight group-hover/spotlight:text-blue-600 transition-colors">
                          {facility.title}
                        </h3>

                        <p className="text-sm md:text-base text-gray-600 leading-relaxed font-medium">
                          {facility.description}
                        </p>
                      </div>
                    </SpotlightCard>
                  </motion.div>
                </div>
              );
            })}
          </div>
        )}

        {/* Edit Mode Grid Layout */}
        {isEditing && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-8">
            {tempFacilities.map((facility) => {
                return (
                  <motion.div 
                    key={facility.id} 
                    className="h-full"
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.4 }}
                  >
                    <SpotlightCard
                      roundedClass="rounded-2xl"
                      spotlightColor="rgba(27, 79, 114, 0.15)"
                      borderGlowColor="rgba(59, 130, 246, 0.6)"
                      className="h-full shadow-md"
                      innerClassName="bg-white rounded-[15px] overflow-hidden flex flex-col p-0 border-0"
                    >
                      {/* Image Section */}
                      <div className="relative h-56 md:h-64 bg-gray-100 shrink-0 w-full overflow-hidden">
                        <img
                          src={facility.image}
                          alt={facility.title}
                          className="w-full h-full object-cover group-hover/spotlight:scale-105 transition-transform duration-500 ease-in-out cursor-pointer"
                          referrerPolicy="no-referrer"
                        />
                        
                        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 hover:opacity-100 transition-opacity backdrop-blur-xs">
                           <label className="bg-white text-gray-900 border border-gray-300 text-sm font-bold px-5 py-2.5 rounded-lg cursor-pointer hover:text-primary shadow-lg flex items-center gap-2 transform transition-transform hover:scale-105">
                               {uploadingId === facility.id ? (
                                  <Activity className="w-5 h-5 animate-spin text-blue-600" />
                               ) : (
                                  <Upload className="w-5 h-5 text-blue-600" />
                               )}
                               {uploadingId === facility.id ? 'Uploading Image...' : 'Upload New Image'}
                               <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(facility.id, e)} />
                           </label>
                        </div>
                      </div>

                      {/* Content Section */}
                      <div className="p-6 flex-1 flex flex-col relative bg-white">
                        <div className="flex flex-col gap-4 h-full">
                            <input 
                                type="text" 
                                value={facility.title} 
                                onChange={(e) => handleFacilityChange(facility.id, 'title', e.target.value)}
                                className="text-xl font-black text-gray-900 border-b-2 border-blue-200 focus:border-blue-600 outline-hidden pb-2 bg-transparent transition-colors placeholder:text-gray-300"
                                placeholder="Facility Title"
                            />
                            <textarea 
                                value={facility.description}
                                onChange={(e) => handleFacilityChange(facility.id, 'description', e.target.value)}
                                className="text-base text-gray-600 flex-1 border border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-hidden resize-none min-h-[100px] transition-all"
                                placeholder="Describe this facility in detail..."
                            />
                            <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100 -mx-6 -mb-6 p-4 rounded-b-lg">
                               <span className="text-xs text-gray-400 font-mono bg-white px-2 py-1 rounded shadow-xs border border-gray-100">ID: {facility.id.substring(0, 12)}...</span>
                               <button onClick={() => handleDeleteFacility(facility.id)} className="text-red-600 hover:text-white bg-red-50 hover:bg-red-600 px-3 py-1.5 rounded-md transition-colors text-sm font-bold flex items-center gap-1 shadow-xs cursor-pointer" title="Delete Facility">
                                   <Trash2 className="w-4 h-4" /> Remove
                               </button>
                            </div>
                        </div>
                      </div>
                    </SpotlightCard>
                  </motion.div>
                );
            })}
          </div>
        )}

        {!isEditing && facilitiesList.length === 0 && (
           <div className="py-20 text-center text-gray-400 border-primary text-primary rounded-xl border border-dashed border-gray-300 mt-8">
               <Leaf className="w-16 h-16 mx-auto mb-4 opacity-20 text-blue-500" />
               <p className="text-lg font-medium text-gray-500">No facilities have been set up yet.</p>
               {isAdmin && (
                   <button onClick={handleEditClick} className="mt-4 text-blue-600 font-bold hover:underline">
                      Click here to start adding facilities
                   </button>
               )}
           </div>
        )}
      </div>

      {/* Fullscreen Lightbox Modal */}
      <AnimatePresence>
        {expandedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setExpandedImage(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="relative max-w-[95vw] max-h-[90vh] flex items-center justify-center select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={expandedImage} 
                alt="Expanded Facility View" 
                className="max-w-[92vw] max-h-[85vh] object-contain rounded-2xl shadow-2xl shadow-black ring-4 ring-white/10 cursor-pointer transition-all duration-300 hover:brightness-105"
                onClick={() => setExpandedImage(null)} 
                referrerPolicy="no-referrer"
              />
              
              {/* Close Button: Absolute positioned on the top-right edge inside the photo container */}
              <button 
                className="absolute top-4 right-4 z-50 text-white bg-black/50 hover:bg-red-600 rounded-full p-2.5 transition-all backdrop-blur-md border border-white/20 shadow-lg hover:scale-110 active:scale-95 cursor-pointer flex items-center justify-center"
                onClick={(e) => { e.stopPropagation(); setExpandedImage(null); }}
                title="Exit View"
              >
                <X className="w-5 h-5 stroke-[2.5]" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
