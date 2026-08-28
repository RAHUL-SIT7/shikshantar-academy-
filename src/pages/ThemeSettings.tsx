import React, { useState, useEffect } from 'react';
import { THEMES } from '../App';
import { Check, Settings, Type, Palette, Clock, CalendarClock, X } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function ThemeSettings() {
  const [activeTheme, setActiveTheme] = useState(localStorage.getItem('appTheme') || "shikshantar_elite");
  const [customPrimary, setCustomPrimary] = useState('#0A2540');
  const [customAccent, setCustomAccent] = useState('#FACC15');
  const [activeFont, setActiveFont] = useState(localStorage.getItem('appFontFamily') || "'Inter', sans-serif");
  const [toast, setToast] = useState<{message: string, show: boolean}>({ message: '', show: false });
  
  const [livePreview, setLivePreview] = useState(false);
  const [scheduledThemes, setScheduledThemes] = useState<{id: string, themeKey: string, activateOn: string}[]>([]);
  const [scheduleActive, setScheduleActive] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleThemeKey, setScheduleThemeKey] = useState(Object.keys(THEMES)[0]);

  const previewThemeColors = (key: string) => {
    if (!livePreview) return;
    const t = key === 'custom' ? { primary: customPrimary, primaryDark: customPrimary, primaryLight: customPrimary, accent: customAccent, accentHover: customAccent } : THEMES[key];
    if (!t) return;
    const r = document.documentElement;
    r.style.setProperty("--primary",       t.primary);
    r.style.setProperty("--primary-dark",  t.primaryDark);
    r.style.setProperty("--primary-light", t.primaryLight);
    r.style.setProperty("--accent",        t.accent);
    r.style.setProperty("--accent-hover",  t.accentHover);
  };

  const revertThemeColors = () => {
    if (!livePreview) return;
    let t;
    if (activeTheme === 'custom') {
       t = JSON.parse(localStorage.getItem('appCustomTheme') || "{}");
    } else {
       t = THEMES[activeTheme];
    }
    if (!t) return;
    const r = document.documentElement;
    r.style.setProperty("--primary",       t.primary || t.primaryDark);
    r.style.setProperty("--primary-dark",  t.primaryDark);
    r.style.setProperty("--primary-light", t.primaryLight || t.primaryDark);
    r.style.setProperty("--accent",        t.accent);
    r.style.setProperty("--accent-hover",  t.accentHover);
  };

  const showToast = (message: string) => {
    setToast({ message, show: true });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 3000);
  };

  const fonts = [
    { name: 'System Default', value: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
    { name: 'Modern Sans (Inter)', value: "'Inter', sans-serif" },
    { name: 'Professional (Roboto)', value: "'Roboto', sans-serif" },
    { name: 'Clean Sans (Open Sans)', value: "'Open Sans', sans-serif" },
    { name: 'Classic Serif (Merriweather)', value: "'Merriweather', serif" },
    { name: 'Elegant Serif (Playfair)', value: "'Playfair Display', serif" },
    { name: 'Geometric (Poppins)', value: "'Poppins', sans-serif" },
    { name: 'Rounded (Quicksand)', value: "'Quicksand', sans-serif" },
    { name: 'Tech Mono (JetBrains)', value: "'JetBrains Mono', monospace" },
    { name: 'Minimal (Outfit)', value: "'Outfit', sans-serif" }
  ];

  const updateGlobalSettings = async (themeKey: string, customColors: any, fontFamily: string) => {
    try {
      await setDoc(doc(db, 'settings', 'global'), {
        themeKey,
        customColors,
        fontFamily,
        updatedAt: new Date()
      }, { merge: true });
    } catch (e) {
      console.warn("Could not save to global settings in Firestore", e);
    }
  };

  const applyTheme = (key: string, customColors?: any) => {
    setActiveTheme(key);
    if ((window as any).applyThemeGlobal) {
        (window as any).applyThemeGlobal(key, customColors, activeFont);
    }
    updateGlobalSettings(key, customColors || null, activeFont);
    
    if (customColors) {
        setCustomPrimary(customColors.primary);
        setCustomAccent(customColors.accent);
        showToast(`✓ Custom theme applied globally!`);
    } else if (THEMES[key]) {
        showToast(`✓ Theme changed to ${THEMES[key].name} globally!`);
    }
  };

  const handleFontChange = (fontVal: string) => {
     setActiveFont(fontVal);
     if ((window as any).applyThemeGlobal) {
        if (activeTheme === 'custom') {
           const customT = JSON.parse(localStorage.getItem('appCustomTheme') || "{}");
           (window as any).applyThemeGlobal('custom', customT, fontVal);
        } else {
           (window as any).applyThemeGlobal(activeTheme, null, fontVal);
        }
     }
     
     let currentCustom = null;
     if (activeTheme === 'custom') {
        currentCustom = JSON.parse(localStorage.getItem('appCustomTheme') || "{}");
     }
     updateGlobalSettings(activeTheme, currentCustom, fontVal);
     showToast(`✓ Font changed globally!`);
  };

  const primarySwatches = [
    '#1a2744', '#1e3a8a', '#166534', '#7f1d1d', '#4c1d95',
    '#0f766e', '#111827', '#991b1b', '#065f46', '#1e40af',
    '#c2410c', '#0369a1', '#9f1239', '#0f172a', '#4a044e'
  ];

  const accentSwatches = [
    '#ea580c', '#f59e0b', '#16a34a', '#2563eb',
    '#dc2626', '#db2777', '#06b6d4', '#7c3aed',
    '#eab308', '#14b8a6', '#fb7185', '#22c55e', '#8b5cf6'
  ];

  const handleSaveCustom = () => {
    const customObj = {
      name: "My Theme",
      primary: customPrimary,
      primaryDark: customPrimary,
      primaryLight: customPrimary,
      accent: customAccent,
      accentHover: customAccent,
      preview: [customPrimary, customAccent]
    };
    applyTheme('custom', customObj);
  };

  const handleScheduleTheme = () => {
     if (!scheduleThemeKey || !scheduleDate || !scheduleTime) return;
     const dt = new Date(`${scheduleDate}T${scheduleTime}`);
     if (dt.getTime() < Date.now()) {
        showToast('Schedule time must be in the future.');
        return;
     }

     const newSch = {
        id: `sch_${Date.now()}_${Math.floor(performance.now()).toString(36)}`,
        themeKey: scheduleThemeKey,
        activateOn: dt.toISOString()
     };
     setScheduledThemes(prev => [...prev, newSch]);
     showToast(`Theme scheduled for ${dt.toLocaleString()}!`);
  };

  const removeSchedule = (id: string) => {
     setScheduledThemes(prev => prev.filter(t => t.id !== id));
  };

  useEffect(() => {
     if (scheduledThemes.length === 0) return;
     
     const now = Date.now();
     // Find the next scheduled theme
     const nextDue = scheduledThemes.reduce((earliest, current) => {
         const earliestTime = new Date(earliest.activateOn).getTime();
         const currentTime = new Date(current.activateOn).getTime();
         return currentTime < earliestTime ? current : earliest;
     });

     const delay = Math.max(0, new Date(nextDue.activateOn).getTime() - now);

     const timer = setTimeout(() => {
         applyTheme(nextDue.themeKey);
         setScheduledThemes(prev => prev.filter(s => s.id !== nextDue.id));
     }, delay);

     return () => clearTimeout(timer);
  }, [scheduledThemes, activeFont]);

  return (
    <div className="max-w-6xl mx-auto pb-12 relative animate-in fade-in zoom-in duration-300">
       {livePreview && (
          <div className="fixed top-0 left-0 w-full bg-blue-600 text-white text-center py-2 font-bold text-sm z-[9999] shadow-md animate-in slide-in-from-top flex items-center justify-center gap-2">
             <span>👁</span> Live Preview Active — Hover themes to preview. Click to apply.
          </div>
       )}
       {toast.show && (
          <div className="fixed top-8 right-8 bg-[var(--primary)] text-white px-5 py-3 rounded-lg shadow-2xl z-[9999] font-bold text-sm flex items-center gap-2 animate-in slide-in-from-right-8 fade-in">
             {toast.message}
          </div>
       )}

       <div className="flex flex-col gap-2 mb-8 mt-4">
           <h1 className="text-3xl font-black text-[var(--primary)] flex items-center gap-3">
              <Settings className="w-8 h-8 text-[var(--primary)]" /> Global Theme Settings
           </h1>
           <p className="text-[var(--text-grey)] font-medium max-w-2xl text-sm leading-relaxed">
             Choose a color theme and font style for Shikshantar Academy Portal. Changes apply instantly across the entire portal (guests, students, and admins).
           </p>
       </div>

       {/* Typography Settings */}
       <div className="mb-12">
          <h2 className="text-2xl font-black text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-100 pb-2"><Type className="w-6 h-6 text-[var(--primary)]"/> Typography Style</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-4">
             {fonts.map(font => {
                const isActive = activeFont === font.value;
                return (
                   <button 
                      key={font.name}
                      onClick={() => handleFontChange(font.value)}
                      className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-2 text-center min-h-[100px] h-auto ${isActive ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20 bg-blue-50' : 'border-gray-200 hover:border-[var(--primary)]/50 hover:bg-gray-50'}`}
                      style={{ fontFamily: font.value.includes('|') ? font.value.split('|')[0] : font.value }}
                   >
                      <span className="text-xl opacity-50 mb-1">Aa</span>
                      <span className={`text-sm md:text-base font-bold ${isActive ? 'text-[var(--primary)]' : 'text-gray-700'}`}>{font.name}</span>
                      {isActive && <span className="text-[10px] uppercase tracking-widest text-[var(--primary)] font-black mt-1">Active</span>}
                   </button>
                )
             })}
          </div>
       </div>

       {/* Preset Themes Grid */}
       <div className="mb-12 flex items-center justify-between bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
          <div>
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">🔍 Live Theme Preview</h3>
              <p className="text-sm text-gray-500 font-medium">Hover over any theme to preview it live. Click Apply to save.</p>
          </div>
          <button 
             onClick={() => setLivePreview(!livePreview)}
             className={`w-14 h-8 rounded-full transition-colors relative shadow-inner ${livePreview ? 'bg-[var(--primary)]' : 'bg-gray-300'}`}
          >
             <div className={`w-6 h-6 bg-white rounded-full absolute top-1 transition-all shadow ${livePreview ? 'left-7' : 'left-1'}`}></div>
          </button>
       </div>

       <div className="mb-12">
         <h2 className="text-2xl font-black text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-100 pb-2"><Palette className="w-6 h-6 text-[var(--primary)]"/> Color Themes</h2>
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Object.keys(THEMES).map(key => {
               const t = THEMES[key];
               const isActive = activeTheme === key;
               const isScheduled = scheduledThemes.some(s => s.themeKey === key);
               return (
                 <div 
                    key={key} 
                    onMouseEnter={() => previewThemeColors(key)}
                    onMouseLeave={revertThemeColors}
                    className={`bg-white rounded-2xl overflow-hidden transition-all duration-200 shadow-sm border border-gray-100 flex flex-col ${isActive ? 'ring-4 ring-[var(--primary)] scale-[1.02] shadow-xl' : 'hover:-translate-y-1 hover:shadow-lg'}`}
                 >
                    <div className="h-[60px] w-full relative shrink-0" style={{ backgroundImage: `linear-gradient(to right, ${t.primary}, ${t.primaryDark})` }}>
                        <div className="absolute top-1/2 -translate-y-1/2 right-4 w-6 h-6 rounded-full shadow-sm border-2 border-white/40" style={{ backgroundColor: t.accent }}></div>
                    </div>
                    <div className="p-5 flex flex-col flex-1 gap-3 relative">
                        {isScheduled && (
                            <div className="absolute top-2 right-2 text-green-600 bg-green-50 p-1 rounded-full border border-green-200 shadow-sm" title="Scheduled to activate">
                                <Clock className="w-4 h-4" />
                            </div>
                        )}
                        <div className="flex justify-between items-start">
                           <div className="flex items-center gap-2 pr-6">
                              <span className="text-xl">{t.emoji}</span>
                              <h3 className="font-bold text-base leading-tight text-gray-900 truncate" title={t.name}>{t.name}</h3>
                           </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 rounded-md shadow-sm border border-black/5" style={{ backgroundColor: t.primary }}></div>
                           <div className="w-6 h-6 rounded-md shadow-sm border border-black/5" style={{ backgroundColor: t.primaryLight }}></div>
                           <div className="w-6 h-6 rounded-md shadow-sm border border-black/5" style={{ backgroundColor: t.accent }}></div>
                        </div>

                        <div className="mt-auto pt-4">
                           {isActive ? (
                              <div className="w-full text-center py-2.5 text-sm font-bold bg-green-50 rounded-lg border-2 border-green-500 text-green-700 shadow-sm flex justify-center items-center gap-2"><Check className="w-4 h-4"/> Active Theme</div>
                           ) : (
                              <button onClick={() => applyTheme(key)} className="w-full py-2.5 text-sm font-bold bg-gray-50 border border-gray-200 text-gray-700 rounded-lg hover:bg-[var(--primary)] hover:text-white hover:border-[var(--primary)] transition-colors active:scale-95 shadow-sm">Apply Theme →</button>
                           )}
                        </div>
                    </div>
                 </div>
               );
            })}
            
            {/* Custom Theme Card (if active) */}
            {activeTheme === 'custom' && (
                 <div className={`bg-white rounded-2xl overflow-hidden transition-all duration-200 shadow-xl ring-4 ring-[var(--primary)] scale-[1.02] flex flex-col border border-gray-100`}>
                    <div className="h-[60px] w-full relative shrink-0" style={{ backgroundColor: customPrimary }}>
                        <div className="absolute top-1/2 -translate-y-1/2 right-4 w-6 h-6 rounded-full shadow-sm border-2 border-white/40" style={{ backgroundColor: customAccent }}></div>
                    </div>
                    <div className="p-5 flex flex-col flex-1 gap-3">
                        <div className="flex items-center gap-2">
                           <span className="text-xl">⭐</span>
                           <h3 className="font-bold text-base leading-tight text-gray-900">My Custom Theme</h3>
                        </div>
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 rounded-md shadow-sm border border-black/5" style={{ backgroundColor: customPrimary }}></div>
                           <div className="w-6 h-6 rounded-md shadow-sm border border-black/5" style={{ backgroundColor: customAccent }}></div>
                        </div>
                        <div className="mt-auto pt-4">
                           <div className="w-full text-center py-2.5 text-sm font-bold bg-green-50 rounded-lg border-2 border-green-500 text-green-700 shadow-sm flex justify-center items-center gap-2"><Check className="w-4 h-4"/> Active Theme</div>
                        </div>
                    </div>
                 </div>
            )}
         </div>
       </div>

       {/* Custom Colors Section */}
       <div>
          <h2 className="text-2xl font-black text-gray-900 mb-2 border-b border-gray-100 pb-2">🎯 Mix Custom Colors</h2>
          <p className="text-sm text-gray-500 font-medium mb-6">Create your own specific color combination to apply to the portal.</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100">
             <div className="space-y-8">
                 {/* Primary Colors */}
                 <div>
                    <label className="block text-sm font-bold text-gray-700 uppercase tracking-widest mb-3">Primary Base (Sidebar, Headers)</label>
                    <div className="flex flex-wrap gap-3 sm:gap-4">
                       {primarySwatches.map(color => (
                          <div 
                             key={color} 
                             onClick={() => { setCustomPrimary(color); document.documentElement.style.setProperty("--primary", color); }}
                             className="w-[calc(20%-0.6rem)] sm:w-12 h-12 rounded-full cursor-pointer transition-all hover:scale-110 flex items-center justify-center shadow-md border border-black/10"
                             style={{ 
                               backgroundColor: color, 
                               outline: customPrimary === color ? '3px solid var(--text-dark)' : 'none',
                               outlineOffset: '3px'
                             }}
                          >
                             {customPrimary === color && <Check className="w-6 h-6 text-white drop-shadow-md" />}
                          </div>
                       ))}
                    </div>
                 </div>

                 {/* Accent Colors */}
                 <div>
                    <label className="block text-sm font-bold text-gray-700 uppercase tracking-widest mb-3">Accent (Buttons, Highlights)</label>
                    <div className="flex flex-wrap gap-3 sm:gap-4">
                       {accentSwatches.map(color => (
                          <div 
                             key={color} 
                             onClick={() => { setCustomAccent(color); document.documentElement.style.setProperty("--accent", color); }}
                             className="w-[calc(25%-0.75rem)] sm:w-12 h-12 rounded-full cursor-pointer transition-all hover:scale-110 flex items-center justify-center shadow-md border border-black/10"
                             style={{ 
                               backgroundColor: color, 
                               outline: customAccent === color ? '3px solid var(--text-dark)' : 'none',
                               outlineOffset: '3px'
                             }}
                          >
                             {customAccent === color && <Check className="w-6 h-6 text-white drop-shadow-md" />}
                          </div>
                       ))}
                    </div>
                 </div>

                 <div className="pt-4 flex flex-col sm:flex-row gap-4">
                    <button onClick={handleSaveCustom} className="flex-1 py-3 px-6 bg-[var(--primary)] text-white font-bold rounded-xl shadow-md hover:scale-[1.02] active:scale-95 transition-all text-sm w-full sm:w-auto text-center border-2 border-transparent">Save & Apply</button>
                    <button onClick={() => { applyTheme('shikshantar_elite'); setCustomPrimary('#0A3D62'); setCustomAccent('#F1C40F'); }} className="flex-1 py-3 px-6 bg-white border-2 border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 active:scale-95 transition-all text-sm w-full sm:w-auto text-center">Reset Default</button>
                 </div>
             </div>

             {/* Live Preview Panel */}
             <div className="bg-gray-50 rounded-2xl shadow-inner border border-gray-200 overflow-hidden flex flex-col h-full min-h-[300px]">
                <div className="bg-white border-b border-gray-200 px-4 py-3 font-bold text-sm text-gray-700">Live Custom UI Preview</div>
                <div className="p-0 flex flex-1 relative w-full">
                    
                    {/* Mock Sidebar */}
                    <div className="w-[100px] sm:w-[130px] shrink-0 h-full p-3 flex flex-col gap-3" style={{ backgroundColor: customPrimary }}>
                       <div className="w-full h-8 bg-white/20 rounded-md mb-2"></div>
                       <div className="flex items-center gap-2 p-2 rounded bg-white/10" style={{ borderLeft: `3px solid ${customAccent}` }}>
                           <div className="w-3 h-3 rounded-full bg-white/50"></div>
                           <div className="h-2 w-full bg-white/90 rounded"></div>
                       </div>
                       <div className="flex items-center gap-2 p-2 rounded opacity-60">
                           <div className="w-3 h-3 rounded-full bg-white/50"></div>
                           <div className="h-2 w-[80%] bg-white/80 rounded"></div>
                       </div>
                       <div className="flex items-center gap-2 p-2 rounded opacity-60">
                           <div className="w-3 h-3 rounded-full bg-white/50"></div>
                           <div className="h-2 w-[90%] bg-white/80 rounded"></div>
                       </div>
                    </div>

                    {/* Mock Main Area */}
                    <div className="flex-1 p-5 flex flex-col gap-5 overflow-hidden">
                       <div className="flex flex-wrap gap-2">
                          <div className="px-4 py-2 rounded-lg text-xs font-bold text-white shadow-sm" style={{ backgroundColor: customPrimary }}>Primary Button</div>
                          <div className="px-4 py-2 rounded-lg text-xs font-bold text-white shadow-sm" style={{ backgroundColor: customAccent }}>Accent Button</div>
                       </div>

                       <div className="bg-white rounded-xl shadow-md p-4 w-full flex gap-3" style={{ borderLeft: `4px solid ${customPrimary}` }}>
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-bold" style={{ backgroundColor: `${customPrimary}20`, color: customPrimary }}>S</div>
                          <div>
                             <div className="h-3 w-16 sm:w-20 bg-gray-200 rounded mb-2"></div>
                             <div className="text-sm sm:text-base font-black truncate" style={{ color: customPrimary }}>NRs. 14,000</div>
                          </div>
                       </div>

                       <div className="flex gap-2 mt-auto">
                          <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 border border-emerald-200">Paid</span>
                          <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700 border border-red-200">Due</span>
                       </div>
                    </div>
                </div>
             </div>
          </div>
       </div>

       {/* Schedule Theme */}
       <div className="mt-12 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button onClick={() => setScheduleActive(!scheduleActive)} className="w-full p-6 flex justify-between items-center text-left hover:bg-gray-50 transition-colors">
              <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2"><CalendarClock className="w-6 h-6 text-[var(--primary)]"/> 📅 Schedule a Theme Change</h2>
              <div className={`transform transition-transform ${scheduleActive ? 'rotate-180' : ''}`}>▼</div>
          </button>
          {scheduleActive && (
             <div className="p-6 border-t border-gray-100 bg-gray-50/50">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mb-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Select Theme to Schedule</label>
                        <select 
                           value={scheduleThemeKey}
                           onChange={e => setScheduleThemeKey(e.target.value)}
                           className="w-full border border-gray-200 rounded-lg p-3 font-medium focus:ring-2 focus:ring-[var(--primary)] outline-none"
                        >
                           {Object.keys(THEMES).map(k => (
                              <option key={k} value={k}>{THEMES[k].name}</option>
                           ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Activate on Date</label>
                        <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="w-full border border-gray-200 rounded-lg p-3 font-medium focus:ring-2 focus:ring-[var(--primary)] outline-none" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Time</label>
                        <div className="flex gap-2">
                           <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="flex-1 border border-gray-200 rounded-lg p-3 font-medium focus:ring-2 focus:ring-[var(--primary)] outline-none" />
                           <button onClick={handleScheduleTheme} className="bg-[var(--primary)] text-white px-4 rounded-lg font-bold hover:bg-[var(--primary-dark)] transition-colors text-sm">Schedule</button>
                        </div>
                    </div>
                 </div>

                 {scheduledThemes.length > 0 && (
                     <div className="space-y-3">
                         <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Upcoming Scheduled Changes</label>
                         <div className="flex gap-4 overflow-x-auto pb-4 pt-1 snap-x scrollbar-hide">
                            {scheduledThemes.map(sch => (
                               <div key={sch.id} className="min-w-[280px] snap-center flex justify-between items-center bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
                                  <div className="flex items-center gap-3">
                                      <Clock className="w-5 h-5 text-green-600 shrink-0" />
                                      <div className="min-w-0">
                                          <div className="font-bold text-gray-900 truncate">{THEMES[sch.themeKey]?.name}</div>
                                          <div className="text-xs text-gray-500 font-medium truncate">{new Date(sch.activateOn).toLocaleString()}</div>
                                      </div>
                                  </div>
                                  <button onClick={() => removeSchedule(sch.id)} className="text-red-500 hover:bg-red-50 p-2 shrink-0 rounded-lg transition-colors">
                                      <X className="w-5 h-5" />
                                  </button>
                               </div>
                            ))}
                         </div>
                     </div>
                 )}
             </div>
          )}
       </div>

    </div>
  );
}
