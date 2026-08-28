import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Helmet } from 'react-helmet-async';
import { Upload, Link as LinkIcon, Image as ImageIcon, Trash2, CheckCircle, Circle, X, Sparkles, Eye, Video, Layers, Calendar, Users, Camera, Play, Grid, Coffee, Heart, RotateCw, StickyNote, Pin, Palette, Check, Plus, Volume2, VolumeX, Sun, Moon, Wind, Trees } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const faderVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 300, damping: 25 } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};
import { db, auth, storage } from '../firebase';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
const teachersGroupImg = "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=1470&auto=format&fit=crop";
const tiharEventImg = "https://images.unsplash.com/photo-1605151523425-46fdad6ff468?q=80&w=1548&auto=format&fit=crop";

const mapDummyImage = (url: string): string => {
  if (!url) return '';
  if (url.includes('picsum.photos')) {
    if (url.includes('/seed/t1/')) return 'https://images.unsplash.com/photo-1544717305-2782549b5136?q=80&w=400&h=500&auto=format&fit=crop';
    if (url.includes('/seed/t2/')) return 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=400&h=500&auto=format&fit=crop';
    if (url.includes('/seed/t3/')) return 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=400&h=500&auto=format&fit=crop';
    if (url.includes('/seed/t4/')) return 'https://images.unsplash.com/photo-1580894732444-8fecef2271ff?q=80&w=400&h=500&auto=format&fit=crop';
    if (url.includes('/seed/b82/')) return 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?q=80&w=800&h=600&auto=format&fit=crop';
    if (url.includes('/seed/b81/')) return 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=800&h=600&auto=format&fit=crop';
    if (url.includes('/seed/e1/')) return 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?q=80&w=800&h=600&auto=format&fit=crop';
    if (url.includes('/seed/e2/')) return 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?q=80&w=800&h=600&auto=format&fit=crop';
    return 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=800&h=600&auto=format&fit=crop';
  }
  return url;
};

const getTornClipPath = (idx: number, isMobile: boolean = false) => {
  const points: string[] = [];
  points.push("0% 0%");
  points.push("100% 0%");
  
  // On mobile, keep it extremely close to the edges to preserve photo display area
  const bottomClipAt = isMobile ? 98 : 95;
  const maxVar = isMobile ? 1.0 : 3.5;
  const bOffset = isMobile ? 1.2 : 4;
  
  // Right side - slightly jagged to simulate organic hand tear
  if (idx % 2 === 1) {
    for (let y = 10; y <= 90; y += 15) {
      const offset = (isMobile ? 0.15 : 0.5) + Math.abs(Math.sin(y * idx * 0.5)) * (isMobile ? 0.4 : 1.5);
      points.push(`${100 - offset}% ${y}%`);
    }
  }
  points.push(`100% ${bottomClipAt}%`);
  
  // Bottom side - highly texturized torn jagged edge
  for (let x = 95; x >= 5; x -= 5) {
    const variation = Math.abs(Math.sin(x * (idx + 1) * 0.4)) * maxVar;
    const baseOffset = bOffset + (idx % 2 === 0 ? 0.3 : 1.2);
    points.push(`${x}% ${100 - (baseOffset + variation)}%`);
  }
  points.push(`0% ${bottomClipAt}%`);
  
  // Left side - slightly jagged
  if (idx % 2 === 0) {
    for (let y = 90; y >= 10; y -= 15) {
      const offset = (isMobile ? 0.15 : 0.5) + Math.abs(Math.cos(y * idx * 0.5)) * (isMobile ? 0.4 : 1.5);
      points.push(`${offset}% ${y}%`);
    }
  }
  points.push("0% 0%");
  
  return `polygon(${points.join(', ')})`;
};

interface CardPosition {
  x: number;
  y: number;
  rotate: number;
  zIndex: number;
}

function NatureBoard({ 
  items, 
  activeTab, 
  isMobile, 
  setExpandedImage 
}: { 
  items: any[], 
  activeTab: string, 
  isMobile: boolean, 
  setExpandedImage: (url: string) => void 
}) {
  const [deskTheme, setDeskTheme] = useState<'cabin' | 'tree' | 'hills' | 'lake'>('tree');
  const [lightingMode, setLightingMode] = useState<'sunlight' | 'study-lamp' | 'aurora'>('sunlight');

  const deskRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<CardPosition[]>([]);
  const [highestZ, setHighestZ] = useState(30);

  // Card interaction states (Flipped cards, Custom back notes, Likes dictionary)
  const [flippedIndexes, setFlippedIndexes] = useState<Set<number>>(new Set());
  const [cardNotes, setCardNotes] = useState<Record<string, string>>({});
  const [cardLikes, setCardLikes] = useState<Record<string, number>>({});
  
  // Back card text-editing state
  const [editingCardNoteKey, setEditingCardNoteKey] = useState<string | null>(null);
  const [tempCardNoteText, setTempCardNoteText] = useState('');



  // Helper to calculate non-overlapping, well-spaced positions for any layout theme
  const getCalculatedPositions = (theme: 'cabin' | 'tree' | 'hills' | 'lake', itemsList: any[]) => {
    if (!itemsList || itemsList.length === 0) return [];
    
    return itemsList.map((_, i) => {
      let x = 50;
      let y = 45;
      let rotate = (Math.random() - 0.5) * 12;
      
      if (theme === 'hills') {
        const totalRows = itemsList.length > 15 ? 4 : itemsList.length > 8 ? 3 : 2;
        const itemsPerRow = Math.ceil(itemsList.length / totalRows);
        const rowIndex = Math.floor(i / itemsPerRow);
        const colIndex = i % itemsPerRow;
        
        if (totalRows === 2) {
          y = rowIndex === 0 ? 33 : 68;
        } else if (totalRows === 3) {
          y = rowIndex === 0 ? 25 : rowIndex === 1 ? 50 : 75;
        } else {
          y = rowIndex === 0 ? 22 : rowIndex === 1 ? 41 : rowIndex === 2 ? 60 : 79;
        }
        
        if (itemsPerRow > 1) {
          x = 18 + (colIndex / (itemsPerRow - 1)) * 64;
        } else {
          x = 50;
        }
        y += (colIndex % 2 === 0 ? -2.5 : 2.5);
        rotate = (Math.random() - 0.5) * 14;
      } else if (theme === 'tree') {
        let columns = 3;
        if (itemsList.length > 12) {
          columns = 4;
        }
        if (itemsList.length > 20) {
          columns = 5;
        }
        const rows = Math.ceil(itemsList.length / columns);
        const colIndex = i % columns;
        const rowIndex = Math.floor(i / columns);
        
        if (columns > 1) {
          x = 18 + (colIndex / (columns - 1)) * 64;
        } else {
          x = 50;
        }
        
        if (rows > 1) {
          y = 22 + (rowIndex / (rows - 1)) * 56;
        } else {
          y = 50;
        }
        y += (colIndex % 2 === 0 ? -3 : 3);
        rotate = (Math.random() - 0.5) * 16;
      } else if (theme === 'lake') {
        if (itemsList.length <= 8) {
          const angle = (i / itemsList.length) * Math.PI * 2;
          x = 50 + Math.cos(angle) * 26;
          y = 48 + Math.sin(angle) * 18;
        } else {
          const innerCount = Math.floor(itemsList.length * 0.4);
          const outerCount = itemsList.length - innerCount;
          if (i < innerCount) {
            const angle = (i / innerCount) * Math.PI * 2;
            x = 50 + Math.cos(angle) * 15;
            y = 48 + Math.sin(angle) * 11;
          } else {
            const angle = ((i - innerCount) / outerCount) * Math.PI * 2;
            x = 50 + Math.cos(angle) * 31;
            y = 48 + Math.sin(angle) * 23;
          }
        }
        rotate = (Math.random() - 0.5) * 10;
      } else {
        let columns = 3;
        if (itemsList.length > 12) {
          columns = 4;
        }
        if (itemsList.length > 20) {
          columns = 5;
        }
        const rows = Math.ceil(itemsList.length / columns);
        const colIndex = i % columns;
        const rowIndex = Math.floor(i / columns);
        
        if (columns > 1) {
          x = 20 + (colIndex / (columns - 1)) * 60;
        } else {
          x = 50;
        }
        
        if (rows > 1) {
          y = 22 + (rowIndex / (rows - 1)) * 56;
        } else {
          y = 50;
        }
        rotate = (Math.random() - 0.5) * 8;
      }
      
      return {
        x: Math.min(Math.max(x, 10), 90),
        y: Math.min(Math.max(y, 12), 85),
        rotate,
        zIndex: i + 1
      };
    });
  };

  const tidyBoard = () => {
    if (!items || items.length === 0) return;
    const sortedPositions = getCalculatedPositions(deskTheme, items);
    setPositions(sortedPositions);
    setHighestZ(items.length + 5);
  };

  // Initialize positions on load or tab change or deskTheme change
  useEffect(() => {
    if (!items || items.length === 0) return;
    
    // Clear flipped states on tab change to avoid stale flips
    setFlippedIndexes(new Set());
    
    const initialPositions = getCalculatedPositions(deskTheme, items);
    setPositions(initialPositions);
    setHighestZ(items.length + 5);
  }, [items, activeTab, isMobile, deskTheme]);

  const bringToFront = (index: number) => {
    const nextZ = highestZ + 1;
    setHighestZ(nextZ);
    setPositions(prev => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], zIndex: nextZ };
      }
      return next;
    });
  };

  // Flip card handler
  const toggleFlip = (index: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFlippedIndexes(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
    bringToFront(index);
  };



  // Dynamically calculate card scale factors based on item counts to prevent extreme cluttering
  const getScaleFactor = () => {
    const count = items?.length || 0;
    if (count <= 4) return 1.0;
    if (count <= 8) return 0.92;
    if (count <= 15) return 0.82;
    return 0.72; // compact size for heavy collections
  };

  const scaleFactor = getScaleFactor();
  const cardWidth = isMobile ? `${Math.round(135 * scaleFactor)}px` : `${Math.round(210 * scaleFactor)}px`;
  const cardHeight = isMobile ? `${Math.round(165 * scaleFactor)}px` : `${Math.round(240 * scaleFactor)}px`;

  // Style and theme configs
  const frameClasses = {
    white: {
      container: "bg-white p-2.5 sm:p-4 rounded-lg shadow-[0_4px_22px_rgba(0,0,0,0.07)] border border-stone-200",
      text: "text-stone-800",
      caption: "text-stone-400",
      borderTheme: "border-stone-100"
    },
    parchment: {
      container: "bg-[#FAF3E0] p-2.5 sm:p-4 rounded-lg shadow-[0_4px_24px_rgba(74,59,44,0.1)] border-2 border-[#EAD6B3]",
      text: "text-[#5C4033] font-serif",
      caption: "text-[#8B5A2B] font-mono",
      borderTheme: "border-[#E8D1A7]"
    },
    cyber: {
      container: "bg-slate-950 p-2.5 sm:p-4 rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.15)] border-2 border-cyan-500/70",
      text: "text-cyan-400 font-mono",
      caption: "text-indigo-400 font-mono",
      borderTheme: "border-cyan-950"
    },
    vaporwave: {
      container: "bg-pink-50/90 p-2.5 sm:p-4 rounded-lg shadow-[0_4px_20px_rgba(236,72,153,0.12)] border-2 border-pink-300",
      text: "text-pink-600 font-bold",
      caption: "text-fuchsia-400 font-serif",
      borderTheme: "border-pink-200"
    }
  };

  // Helper stamps depending on category
  const getStamp = (title: string) => {
    let text = "MEMORIES";
    let color = "border-rose-500 text-rose-500 bg-rose-50/20";
    
    if (activeTab === 'teachers') {
      text = "FACULTY APP";
      color = "border-emerald-500 text-emerald-500 bg-emerald-50/20";
    } else if (activeTab === 'batches') {
      text = `CLASS ARCHIVE`;
      color = "border-indigo-500 text-indigo-500 bg-indigo-50/20";
    } else {
      text = "SPECIAL EVENT";
      color = "border-amber-600 text-amber-600 bg-amber-50/20";
    }
    
    return (
      <div className={`inline-block border-2 border-dashed px-2 py-0.5 rounded text-[9px] font-mono font-black uppercase tracking-widest rotate-[-12deg] ${color} opacity-80 shadow-3xs`}>
        {text}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 mb-12">
      {/* 🌳 Magnificent Atmospheric Control Panel */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black uppercase text-slate-700 tracking-wider">
                Nature Board Exhibition
              </h3>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Experience school photographs embedded in living aesthetic landscape backdrops.
            </p>
          </div>
        </div>

        {/* Setting options Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Column 1: Scenic Backdrops */}
          <div className="flex flex-col gap-2 bg-slate-50/50 p-3 rounded-xl border border-slate-100/60">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">🪵 Natural Backdrops</span>
              <span className="text-[9px] text-slate-400">Shift outdoor photographic environments</span>
            </div>
            
            <div className="grid grid-cols-2 gap-1.5">
              {([
                { key: 'cabin', label: '🍂 Autumn Cabin', desc: 'Rustic fireplace oak' },
                { key: 'tree', label: '🪵 Redwood Trunk', desc: 'Ancient sequoia bark' },
                { key: 'hills', label: '⛰️ Sunset Peaks', desc: 'Hanging twine rope' },
                { key: 'lake', label: '🌅 Serene Mist', desc: 'Foggy water lagoon' },
              ] as const).map((themeOpt) => (
                <button
                  key={themeOpt.key}
                  type="button"
                  onClick={() => setDeskTheme(themeOpt.key)}
                  className={`px-2 py-1 text-[10px] font-bold rounded-lg border cursor-pointer transition-all flex flex-col items-center justify-center text-center ${
                    deskTheme === themeOpt.key 
                      ? 'bg-slate-900 border-slate-900 text-white shadow-xs' 
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="font-bold text-[9px] sm:text-[10px]">{themeOpt.label}</span>
                  <span className={`text-[8px] mt-0.5 ${deskTheme === themeOpt.key ? 'text-slate-300' : 'text-slate-400'}`}>
                    {themeOpt.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Column 2: Atmospheric Lighting overlay options */}
          <div className="flex flex-col gap-2 bg-slate-50/50 p-3 rounded-xl border border-slate-100/60">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">💡 Atmosphere Lighting</span>
              <span className="text-[9px] text-slate-400">Cast warm sunlight, study lamp, or aurora glow</span>
            </div>
            
            <div className="grid grid-cols-3 gap-1.5 h-full">
              {([
                { key: 'sunlight', label: '☀️ Sun Light', desc: 'Warm overlay' },
                { key: 'study-lamp', label: '💡 Lamp Shade', desc: 'Focus shadow' },
                { key: 'aurora', label: '🌌 Glow', desc: 'Ethereal lights' }
              ] as const).map((lm) => (
                <button
                  key={lm.key}
                  type="button"
                  onClick={() => setLightingMode(lm.key)}
                  className={`px-1.5 py-1 text-[9px] font-bold rounded-lg border cursor-pointer transition-all flex flex-col items-center justify-center text-center ${
                    lightingMode === lm.key 
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs' 
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="font-black text-[9px]">{lm.label}</span>
                  <span className={`text-[7px] ${lightingMode === lm.key ? 'text-emerald-100' : 'text-slate-400'}`}>{lm.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Column 3: Board Maintenance & Arranger */}
          <div className="flex flex-col gap-2 bg-slate-50/50 p-3 rounded-xl border border-slate-100/60 col-span-1 md:col-span-1">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">🗂️ Board Organizer</span>
              <span className="text-[9px] text-slate-400">Auto-space cards to completely solve overlap</span>
            </div>
            
            <div className="grid grid-cols-2 gap-1.5 h-full">
              <button
                type="button"
                onClick={tidyBoard}
                className="px-2 py-1 text-[10px] font-bold rounded-lg border cursor-pointer transition-all flex flex-col items-center justify-center text-center bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
              >
                <span className="font-bold text-[9px] sm:text-[10px]">🧹 Tidy Board</span>
                <span className="text-[8px] text-slate-400 mt-0.5">Perfect grid layout</span>
              </button>
              
              <button
                type="button"
                onClick={() => {
                  if (!items || items.length === 0) return;
                  setPositions(prev => prev.map((p, idx) => {
                    const angle = (idx / items.length) * Math.PI * 2;
                    // Loose scatter distributes across different radii to avoid overlapping coordinates
                    const radiusX = 20 + Math.random() * 15;
                    const radiusY = 15 + Math.random() * 12;
                    return {
                      ...p,
                      x: Math.min(Math.max(50 + Math.cos(angle) * radiusX + (Math.random() - 0.5) * 6, 12), 88),
                      y: Math.min(Math.max(48 + Math.sin(angle) * radiusY + (Math.random() - 0.5) * 6, 15), 82),
                      rotate: (Math.random() - 0.5) * 32
                    };
                  }));
                }}
                className="px-2 py-1 text-[10px] font-bold rounded-lg border cursor-pointer transition-all flex flex-col items-center justify-center text-center bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
              >
                <span className="font-bold text-[9px] sm:text-[10px]">🔀 Loose Scatter</span>
                <span className="text-[8px] text-slate-400 mt-0.5">Artistic spread</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* The Physical Desk Canvas */}
      <div 
        ref={deskRef}
        className={`relative w-full h-[520px] sm:h-[620px] lg:h-[700px] rounded-[2.5rem] border-4 border-slate-200 overflow-hidden shadow-inner flex items-center justify-center select-none transition-all duration-500 ${
          deskTheme === 'cabin' ? 'bg-[#3E2723]' : ''
        }`}
      >
        {/* CABIN ENVIRONMENT DECORATIONS */}
        {deskTheme === 'cabin' && (
          <div className="absolute inset-0 pointer-events-none z-0">
            {/* Rich rustic oak planks background */}
            <div className="absolute inset-0 bg-[#3E2723] bg-[linear-gradient(90deg,rgba(0,0,0,0.15)_0%,rgba(255,255,255,0.03)_25%,rgba(0,0,0,0.1)_50%,rgba(255,255,255,0.03)_75%,rgba(0,0,0,0.15)_100%)]" />
            {/* Wood plank vertical joints */}
            <div className="absolute inset-0 opacity-20 bg-[repeating-linear-gradient(90deg,transparent,transparent_80px,#1a0c02_82px,transparent_84px)]" />
            {/* Warm fireplace ambient light glow and leaf shapes */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,rgba(249,115,22,0.15)_0%,transparent_60%),radial-gradient(circle_at_80%_20%,rgba(234,179,8,0.1)_0%,transparent_50%)]" />
            {/* Warm maple leaves styling */}
            <div className="absolute top-[20%] right-[10%] w-5 h-5 bg-orange-700/20 blur-3xs rotate-45 rounded-sm" />
            <div className="absolute bottom-[15%] left-[10%] w-4 h-4 bg-amber-600/15 blur-3xs rotate-12 rounded-sm" />
          </div>
        )}

        {/* FOREST ENVIRONMENT DECORATIONS */}
        {deskTheme === 'tree' && (
          <div className="absolute inset-0 pointer-events-none z-0">
            {/* Tree bark base */}
            <div className="absolute inset-0 bg-[#2D1A0F] bg-[linear-gradient(90deg,rgba(0,0,0,0.22)_0%,rgba(255,255,255,0.02)_15%,rgba(0,0,0,0.13)_30%,rgba(0,0,0,0.28)_50%,rgba(255,255,255,0.01)_70%,rgba(0,0,0,0.18)_85%,rgba(0,0,0,0.28)_100%)]" />
            {/* Tree bark vertical ridges */}
            <div className="absolute inset-0 opacity-12 bg-[repeating-linear-gradient(90deg,transparent,transparent_45px,rgba(0,0,0,0.7)_47px,transparent_50px)]" />
            {/* Dappled sunlight leaf shadow layers */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.14)_0%,transparent_65%),radial-gradient(circle_at_15%_90%,rgba(5,150,105,0.1)_0%,transparent_55%)]" />
            {/* Subtle soft forest particles */}
            <div className="absolute top-[15%] left-[25%] w-2 h-2 rounded-full bg-emerald-400/20 blur-xs" />
            <div className="absolute top-[70%] left-[75%] w-3 h-1 rounded-full bg-emerald-500/15 rotate-45 blur-xs" />
          </div>
        )}

        {/* HILLS ENVIRONMENT DECORATIONS */}
        {deskTheme === 'hills' && (
          <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden bg-gradient-to-b from-[#0F172A] via-[#2E1065] via-[#5B21B6] to-[#701A75]">
            {/* Twilight warm horizon glow */}
            <div className="absolute bottom-0 inset-x-0 h-44 bg-gradient-to-t from-pink-500/15 to-transparent blur-md" />
            
            {/* Mountains background silhouettes */}
            <div className="absolute bottom-0 left-0 right-0 h-28 opacity-20 mix-blend-multiply bg-violet-950"
                 style={{ clipPath: 'polygon(0% 100%, 0% 45%, 18% 32%, 35% 58%, 50% 28%, 68% 52%, 82% 18%, 92% 42%, 100% 24%, 100% 100%)' }} />
            <div className="absolute bottom-[-10px] left-0 right-0 h-20 opacity-25 mix-blend-multiply bg-fuchsia-950"
                 style={{ clipPath: 'polygon(0% 100%, 0% 65%, 28% 48%, 55% 68%, 78% 38%, 100% 62%, 100% 100%)' }} />

            {/* Twine Rope clothesline paths running horizontally */}
            <div className="absolute top-[28%] inset-x-0 h-[2.5px] bg-gradient-to-r from-amber-900/5 via-amber-800/35 to-amber-900/5 border-t border-amber-900/10 shadow-xs">
              <div className="absolute left-8 top-[-3px] w-2 h-2 rounded-full bg-amber-800/50" />
              <div className="absolute right-8 top-[-3px] w-2 h-2 rounded-full bg-amber-800/50" />
            </div>
            <div className="absolute top-[62%] inset-x-0 h-[2.5px] bg-gradient-to-r from-amber-900/5 via-amber-800/35 to-amber-900/5 border-t border-amber-900/10 shadow-xs">
              <div className="absolute left-8 top-[-3px] w-2 h-2 rounded-full bg-amber-800/50" />
              <div className="absolute right-8 top-[-3px] w-2 h-2 rounded-full bg-amber-800/50" />
            </div>
          </div>
        )}

        {/* SERENE MIST LAKE ENVIRONMENT DECORATIONS */}
        {deskTheme === 'lake' && (
          <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden bg-gradient-to-b from-[#090D16] via-[#0D2E33] to-[#1F2937]">
            {/* Misty foggy ripples overlay */}
            <div className="absolute inset-0 opacity-12 bg-[radial-gradient(circle_at_50%_120%,transparent_35%,rgba(45,212,191,0.18)_42%,transparent_52%)]" />
            {/* Horizon water glow */}
            <div className="absolute bottom-0 inset-x-0 h-36 bg-gradient-to-t from-teal-500/8 to-transparent blur-xl" />
            {/* Soft glowing ambient fireflies */}
            <div className="absolute top-[30%] left-[15%] w-1.5 h-1.5 rounded-full bg-teal-300/35 blur-3xs" />
            <div className="absolute top-[60%] left-[80%] w-1.5 h-1.5 rounded-full bg-cyan-300/40 blur-3xs" />
          </div>
        )}

        {/* Ambient shadow gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/10 pointer-events-none z-0" />
        
        {/* Lighting Mode Overlays */}
        {lightingMode === 'sunlight' && (
          <div className="absolute inset-0 pointer-events-none z-10 bg-gradient-to-tr from-amber-500/0 via-amber-300/5 to-amber-200/12 mix-blend-screen" />
        )}
        {lightingMode === 'study-lamp' && (
          <div 
            className="absolute inset-0 pointer-events-none z-10 transition-all duration-700" 
            style={{
              background: 'radial-gradient(circle 320px at 50% 45%, rgba(253, 224, 71, 0.12) 0%, rgba(15, 23, 42, 0.55) 70%, rgba(15, 23, 42, 0.85) 100%)',
              mixBlendMode: 'multiply'
            }}
          />
        )}
        {lightingMode === 'aurora' && (
          <div 
            className="absolute inset-0 pointer-events-none z-10 transition-all duration-700 bg-gradient-to-br from-indigo-950/20 via-purple-950/25 to-blue-950/30 mix-blend-color-dodge animate-pulse"
            style={{
              backgroundImage: 'radial-gradient(circle at 30% 20%, rgba(16, 185, 129, 0.08) 0%, transparent 60%), radial-gradient(circle at 80% 70%, rgba(6, 182, 212, 0.08) 0%, transparent 60%)'
            }}
          />
        )}

        {/* Desk watermark instruction */}
        <div className="absolute inset-x-4 top-5 text-center pointer-events-none z-10 select-none opacity-85">
          <p className="text-[10px] sm:text-xs font-bold text-slate-600 bg-white/90 backdrop-blur-xs px-4 py-1.5 rounded-full w-fit mx-auto shadow-sm border border-slate-200/50">
            👋 Photos can overlap initially. Feel free to drag and arrange them to organize your board!
          </p>
        </div>

        {/* 3D Polaroid Cards Layer */}
        {positions.length > 0 && items.map((item, index) => {
          const pos = positions[index];
          if (!pos) return null;

          const titleText = item.name || item.year || item.title || 'Archive';
          const subtitleText = item.role || (item.year ? 'SEE Class' : 'School Event');
          
          const isFlipped = flippedIndexes.has(index);
          const itemKey = `${activeTab}-${index}`;
          const currentLikes = cardLikes[itemKey] || 0;
          const userNote = cardNotes[itemKey] || '';
          const theme = frameClasses.white;

          const isCardNoteEditing = editingCardNoteKey === itemKey;

          return (
            <motion.div
              key={index}
              drag
              dragConstraints={deskRef}
              dragElastic={0.15}
              onDragStart={() => {
                bringToFront(index);
              }}
              onDragEnd={() => {}}
              onTap={() => bringToFront(index)}
              animate={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                rotate: isFlipped ? pos.rotate + 180 : pos.rotate,
                zIndex: pos.zIndex,
              }}
              whileDrag={{ 
                scale: 1.14, 
                rotate: isFlipped ? 180 : 0,
                boxShadow: "0 35px 65px -15px rgba(0, 0, 0, 0.35)",
                cursor: "grabbing" 
              }}
              transition={{ type: "spring", stiffness: 130, damping: 15 }}
              className="absolute origin-center transition-shadow duration-300 cursor-grab active:cursor-grabbing"
              style={{ 
                width: cardWidth,
                height: cardHeight,
                transform: 'translate(-50%, -50%)',
                perspective: '1000px',
              }}
            >
              {/* Pinned Nature Board physical wire/string hanging lines */}
              {deskTheme === 'hills' && (
                <div className="absolute bottom-[98%] left-1/2 -translate-x-1/2 w-[1.5px] h-[350px] bg-gradient-to-t from-amber-800/85 via-amber-700/25 to-transparent pointer-events-none z-0 origin-bottom" />
              )}
              {deskTheme === 'lake' && (
                <div className="absolute bottom-[98%] left-1/2 -translate-x-1/2 w-[1px] h-[350px] bg-gradient-to-t from-teal-400/80 via-cyan-400/20 to-transparent pointer-events-none z-0 shadow-[0_0_8px_rgba(45,212,191,0.4)] origin-bottom" />
              )}
              {deskTheme === 'tree' && (
                <div className="absolute bottom-[98%] left-1/2 -translate-x-1/2 w-[2px] h-[50px] bg-gradient-to-t from-emerald-600/70 to-transparent pointer-events-none z-0 origin-bottom" />
              )}

              {/* Inner container to hold 3D faces */}
              <div
                className="relative w-full h-full select-none"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                {/* FRONT FACE */}
                <div 
                  className={`absolute inset-0 w-full h-full [backface-visibility:hidden] flex flex-col justify-between ${theme.container}`}
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  {/* Photo Frame Container */}
                  <div className={`flex-1 w-full min-h-0 rounded overflow-hidden bg-stone-50 border ${theme.borderTheme} relative pointer-events-none mb-1 sm:mb-2`}>
                    {item.type === 'video' || item.image?.match(/\.(mp4|webm|mov)(\?|$)/i) ? (
                      <div className="w-full h-full relative">
                        <video src={item.image} className="w-full h-full object-cover" muted />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                          <div className="w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center">
                            <Play className="w-4 h-4 text-primary fill-primary ml-0.5" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <img 
                        src={item.image} 
                        alt={titleText} 
                        className="w-full h-full object-cover select-none pointer-events-none" 
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </div>

                  {/* Caption & Controls Area */}
                  <div className="text-center pointer-events-none select-none relative shrink-0">
                    <h4 className={`italic text-[10px] sm:text-xs tracking-tight leading-tight truncate px-1 ${theme.text}`}>
                      {titleText}
                    </h4>
                    <p className={`text-[7px] sm:text-[9px] tracking-wider uppercase mt-0.5 truncate ${theme.caption}`}>
                      {subtitleText}
                    </p>
                  </div>

                  {/* Small absolute interactive buttons (outside parent pointer-events-none) */}
                  <div className="absolute bottom-1 right-1 z-10 flex gap-1">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setExpandedImage(item.image); }}
                      title="Enlarge photo"
                      className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center border border-slate-200/80 shadow-3xs cursor-pointer hover:scale-105 transition-all text-slate-500 hover:text-slate-800"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Decorative Pin, Tape or Peg Clothespin (Placed at bottom to render on top of photo without high z-index) */}
                  {deskTheme === 'cabin' ? (
                    /* Vintage amber tape strip */
                    <div 
                      className="absolute -top-3 left-1/2 -translate-x-1/2 w-14 h-4 sm:w-16 sm:h-5 pointer-events-none opacity-80 bg-gradient-to-r from-amber-200/60 via-yellow-100/70 to-amber-200/60 border border-amber-300/20 shadow-3xs rotate-[-3deg]"
                      style={{ mixBlendMode: 'multiply' }} 
                    />
                  ) : deskTheme === 'hills' ? (
                    /* Wooden clothespin peg clip */
                    <div className="absolute -top-5.5 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center">
                      <div className="w-3 sm:w-3.5 h-6 sm:h-7 bg-gradient-to-b from-amber-100 to-amber-300 border border-amber-700/20 rounded-xs shadow-md flex flex-col items-center justify-between py-0.5 relative">
                        {/* Metal spring band of clothespin */}
                        <div className="absolute top-1/2 -translate-y-1/2 w-4 h-[3px] bg-stone-500 border border-stone-600 rounded-sm" />
                        <div className="w-1 h-0.5 bg-amber-800/15" />
                        <div className="w-1 h-0.5 bg-amber-800/15" />
                      </div>
                      {/* Peg shadow cast onto polaroid */}
                      <div className="absolute top-1.5 left-2 w-2.5 h-6 bg-black/15 blur-3xs rounded-sm rotate-12 origin-top-left" />
                    </div>
                  ) : (
                    /* 3D Shiny Pushpin Tack */
                    <div className="absolute -top-4.5 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center">
                      <div className={`w-3 sm:w-3.5 h-3 sm:h-3.5 rounded-full shadow-md border relative ${
                        deskTheme === 'tree' 
                          ? 'bg-gradient-to-tr from-red-600 via-rose-500 to-red-400 border-red-800/50' 
                          : 'bg-gradient-to-tr from-cyan-600 via-teal-500 to-cyan-300 border-teal-800/50'
                      }`}>
                        {/* Glossy light reflection dot */}
                        <div className="absolute top-0.5 left-0.5 w-[3px] h-[3px] rounded-full bg-white/80" />
                      </div>
                      {/* Metal shaft wire */}
                      <div className="w-[1.5px] h-3 bg-stone-400/90 shadow-xs origin-top rotate-[-12deg]" />
                      {/* Pin head shadow */}
                      <div className="absolute top-1 left-2.5 w-2.5 h-2.5 rounded-full bg-black/20 blur-3xs" />
                    </div>
                  )}
                </div>

                {/* BACK FACE */}
                <div 
                  className="absolute inset-0 w-full h-full [backface-visibility:hidden] flex flex-col justify-between p-3 sm:p-4 rounded-lg bg-[#FAF9F5] border-2 border-stone-200 text-stone-800 shadow-md bg-[linear-gradient(#e5e7eb_1px,transparent_1px)] bg-[size:100%_20px]"
                  style={{ 
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)' 
                  }}
                >
                  {/* Top stamp and title */}
                  <div className="flex justify-between items-start">
                    <div className="text-[10px] font-mono font-bold text-stone-400 select-none uppercase tracking-wide">
                      MEMORANDUM
                    </div>
                    {getStamp(titleText)}
                  </div>

                  {/* Scribble message notes */}
                  <div className="flex-1 mt-3 sm:mt-5 overflow-hidden flex flex-col justify-center">
                    {isCardNoteEditing ? (
                      <div className="flex flex-col gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                        <textarea
                          value={tempCardNoteText}
                          onChange={(e) => setTempCardNoteText(e.target.value)}
                          maxLength={80}
                          placeholder="Scribble a memory... (max 80 chars)"
                          className="w-full text-[10px] p-1.5 border border-stone-300 rounded bg-white text-stone-800 outline-none focus:ring-1 h-14 resize-none font-serif italic"
                          autoFocus
                        />
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCardNotes(prev => ({ ...prev, [itemKey]: tempCardNoteText }));
                              setEditingCardNoteKey(null);
                            }}
                            className="px-1.5 py-0.5 bg-emerald-600 text-white text-[8px] font-bold rounded"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCardNoteKey(null);
                            }}
                            className="px-1.5 py-0.5 bg-stone-300 text-stone-700 text-[8px] font-bold rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div 
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                           setEditingCardNoteKey(itemKey);
                          setTempCardNoteText(userNote);
                        }}
                        className="text-center italic font-serif text-stone-700 text-xs sm:text-sm tracking-tight cursor-pointer py-1.5 hover:bg-stone-100/50 rounded"
                        title="Double click to scribble a note"
                      >
                        {userNote ? `"${userNote}"` : '✍️ Double-tap to scribble a handwritten note here...'}
                      </div>
                    )}
                  </div>

                  {/* Heart likes & Flip-Back action controls */}
                  <div className="flex items-center justify-between pt-1 border-t border-dashed border-stone-200">
                    {/* Floating Heart likes */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCardLikes(prev => ({ ...prev, [itemKey]: (prev[itemKey] || 0) + 1 }));
                      }}
                      className="flex items-center gap-1.5 px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 border border-rose-150 transition-all text-rose-600 cursor-pointer text-[10px] font-bold active:scale-95 shadow-3xs"
                    >
                      <Heart className={`w-3.5 h-3.5 ${currentLikes > 0 ? 'fill-rose-500 text-rose-500 animate-pulse' : 'text-rose-500'}`} />
                      <span>{currentLikes}</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => toggleFlip(index, e)}
                      className="px-2 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300/60 shadow-3xs flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCw className="w-3 h-3 text-slate-500" /> Flip Card
                    </button>
                  </div>

                  {/* Decorative Pin, Tape or Peg Clothespin (Placed at bottom of back face to render on top without high z-index) */}
                  {deskTheme === 'cabin' ? (
                    /* Vintage amber tape strip */
                    <div 
                      className="absolute -top-3 left-1/2 -translate-x-1/2 w-14 h-4 sm:w-16 sm:h-5 pointer-events-none opacity-80 bg-gradient-to-r from-amber-200/60 via-yellow-100/70 to-amber-200/60 border border-amber-300/20 shadow-3xs rotate-[-3deg]"
                      style={{ mixBlendMode: 'multiply' }} 
                    />
                  ) : deskTheme === 'hills' ? (
                    /* Wooden clothespin peg clip */
                    <div className="absolute -top-5.5 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center">
                      <div className="w-3 sm:w-3.5 h-6 sm:h-7 bg-gradient-to-b from-amber-100 to-amber-300 border border-amber-700/20 rounded-xs shadow-md flex flex-col items-center justify-between py-0.5 relative">
                        {/* Metal spring band of clothespin */}
                        <div className="absolute top-1/2 -translate-y-1/2 w-4 h-[3px] bg-stone-500 border border-stone-600 rounded-sm" />
                        <div className="w-1 h-0.5 bg-amber-800/15" />
                        <div className="w-1 h-0.5 bg-amber-800/15" />
                      </div>
                      {/* Peg shadow cast onto polaroid */}
                      <div className="absolute top-1.5 left-2 w-2.5 h-6 bg-black/15 blur-3xs rounded-sm rotate-12 origin-top-left" />
                    </div>
                  ) : (
                    /* 3D Shiny Pushpin Tack */
                    <div className="absolute -top-4.5 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center">
                      <div className={`w-3 sm:w-3.5 h-3 sm:h-3.5 rounded-full shadow-md border relative ${
                        deskTheme === 'tree' 
                          ? 'bg-gradient-to-tr from-red-600 via-rose-500 to-red-400 border-red-800/50' 
                          : 'bg-gradient-to-tr from-cyan-600 via-teal-500 to-cyan-300 border-teal-800/50'
                      }`}>
                        {/* Glossy light reflection dot */}
                        <div className="absolute top-0.5 left-0.5 w-[3px] h-[3px] rounded-full bg-white/80" />
                      </div>
                      {/* Metal shaft wire */}
                      <div className="w-[1.5px] h-3 bg-stone-400/90 shadow-xs origin-top rotate-[-12deg]" />
                      {/* Pin head shadow */}
                      <div className="absolute top-1 left-2.5 w-2.5 h-2.5 rounded-full bg-black/20 blur-3xs" />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}

        {/* Empty Category Message */}
        {positions.length === 0 && (
          <div className="text-center p-8 max-w-sm pointer-events-none">
            <ImageIcon className="w-12 h-12 text-stone-300 mx-auto mb-3 animate-pulse" />
            <h4 className="text-sm font-black text-stone-600">Empty Nature Board</h4>
            <p className="text-xs text-stone-400 mt-1">Select another category tab above to arrange photos on the board.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Gallery() {
  const [activeTab, setActiveTab] = useState<'teachers' | 'batches' | 'events'>('batches');
  const [viewMode, setViewMode] = useState<'grid' | 'nature'>('grid');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [teachers, setTeachers] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [newImage, setNewImage] = useState({ url: '', caption: '', role: '', type: 'image' });
  const [uploadMode, setUploadMode] = useState<'url' | 'file' | 'camera'>('url');
  const [galleryStatus, setGalleryStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
  const userRole = auth.currentUser ? (localStorage.getItem('userRole') || 'student') : 'guest';
  const isAdmin = auth.currentUser ? userRole === 'admin' : false;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTaskRef = useRef<any>(null);

  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const handleCancelUpload = () => {
    if (uploadTaskRef.current) {
      uploadTaskRef.current.cancel();
      setIsUploading(false);
      setGalleryStatus('Upload cancelled.');
      uploadTaskRef.current = null;
    }
  };

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'school_data', 'gallery'), (docSnap) => {
      const defaultTeachers = [
        { id: 1, name: 'Teaching Faculty', role: 'Principal & Staff', image: teachersGroupImg, type: 'image' },
        { id: 2, name: 'Mr. Pappu Kumar Jha', role: 'Principal', image: 'https://images.unsplash.com/photo-1544717305-2782549b5136?q=80&w=400&h=500&auto=format&fit=crop', type: 'image' },
        { id: 3, name: 'Mrs. Sharma', role: 'Science Teacher', image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=400&h=500&auto=format&fit=crop', type: 'image' },
        { id: 4, name: 'Mr. Koirala', role: 'Math Teacher', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=400&h=500&auto=format&fit=crop', type: 'image' },
        { id: 5, name: 'Ms. Thapa', role: 'English Teacher', image: 'https://images.unsplash.com/photo-1580894732444-8fecef2271ff?q=80&w=400&h=500&auto=format&fit=crop', type: 'image' },
      ];
      const defaultBatches = [
        { year: '2082 B.S', image: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?q=80&w=800&h=600&auto=format&fit=crop', type: 'image' },
        { year: '2081 B.S', image: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=800&h=600&auto=format&fit=crop', type: 'image' },
      ];
      const defaultEvents = [
        { title: 'Celebrating Tihar', image: tiharEventImg, type: 'image' },
        { title: 'Annual Sports Day', image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?q=80&w=800&h=600&auto=format&fit=crop', type: 'image' },
        { title: 'Science Exhibition', image: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?q=80&w=800&h=600&auto=format&fit=crop', type: 'image' },
      ];

      if (docSnap.exists()) {
        const data = docSnap.data();
        const currentTeachers = (data.teachers !== undefined) 
          ? data.teachers.map((t: any) => ({ ...t, image: mapDummyImage(t.image) }))
          : defaultTeachers;
        const currentBatches = (data.batches !== undefined) 
          ? data.batches.map((b: any) => ({ ...b, image: mapDummyImage(b.image) }))
          : defaultBatches;
        const currentEvents = (data.events !== undefined) 
          ? data.events.map((e: any) => ({ ...e, image: mapDummyImage(e.image) }))
          : defaultEvents;

        setTeachers(currentTeachers);
        setBatches(currentBatches);
        setEvents(currentEvents);
      } else {
        setTeachers(defaultTeachers);
        setBatches(defaultBatches);
        setEvents(defaultEvents);
      }
      setIsLoading(false);
    }, (err) => {
      console.warn("Gallery listener error:", err.message);
      setIsLoading(false);
    });

    return () => unsub();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const isVideo = file.type.startsWith('video/');
      
      // Use createObjectURL for preview to avoid browser memory crash on large videos
      const previewUrl = URL.createObjectURL(file);
      setNewImage({ ...newImage, url: previewUrl, type: isVideo ? 'video' : 'image' });
    }
  };

  const handleAddMedia = async () => {
    if ((!newImage.url && !selectedFile) || !newImage.caption) {
      setGalleryStatus('Please provide both Media URL/File and Caption.');
      return;
    }

    setIsUploading(true);
    setGalleryStatus('Uploading... Please wait (this could take a while for videos).');
    
    let finalImageUrl = newImage.url;

    if ((uploadMode === 'file' || uploadMode === 'camera') && selectedFile) {
      try {
        const isVideo = selectedFile.type.startsWith('video/');
        
        // If image is very small, we can safely bypass Storage and save as Base64 in Firestore
        if (!isVideo && selectedFile.size < 800 * 1024) {
          const base64Url = await new Promise<string>((resolve) => {
             const reader = new FileReader();
             reader.onloadend = () => resolve(reader.result as string);
             reader.readAsDataURL(selectedFile);
          });
          finalImageUrl = base64Url;
        } else {
          // For videos or large images, we MUST use Firebase Storage
          const extension = selectedFile.name.split('.').pop() || 'tmp';
          const storageRef = ref(storage, `media/${Date.now()}_${Math.floor(performance.now()).toString(36)}.${extension}`);
          
          await new Promise((resolve, reject) => {
            const uploadTask = uploadBytesResumable(storageRef, selectedFile);
            uploadTaskRef.current = uploadTask;
            
            // If it hangs at 0% for 20 seconds, the Firebase Storage bucket is likely not initialized
            const timeoutId = setTimeout(() => {
              if (uploadTask.snapshot.bytesTransferred === 0) {
                 uploadTask.cancel();
                 reject(new Error("UPLOAD_TIMEOUT"));
              }
            }, 20000);

            uploadTask.on('state_changed', 
              (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setGalleryStatus(`Uploading... ${Math.round(progress)}%`);
              }, 
              (error) => {
                clearTimeout(timeoutId);
                reject(error);
              }, 
              () => {
                clearTimeout(timeoutId);
                uploadTaskRef.current = null;
                resolve(true);
              }
            );
          });
          
          finalImageUrl = await getDownloadURL(storageRef);
        }
      } catch (e: any) {
        uploadTaskRef.current = null;
        console.error("Storage upload failed: ", e);
        if (e.message === "UPLOAD_TIMEOUT") {
          setGalleryStatus('Upload timed out! Please ensure Firebase Storage is enabled in your Firebase Console, or check your internet connection.');
        } else if (e.code === 'storage/canceled') {
          // Already handled in handleCancelUpload
          return;
        } else {
          setGalleryStatus('Upload failed. Using URL mode is recommended if Firebase Storage is restricted.');
        }
        setIsUploading(false);
        return;
      }
    } else if (newImage.url && uploadMode === 'url') {
      const isUrlVideo = newImage.url.match(/\.(mp4|webm|mov|ogg)(\?|$)/i) ? 'video' : 'image';
      newImage.type = isUrlVideo;
    }
    
    const updatedGallery = { teachers, batches, events };
    
    if (activeTab === 'teachers') {
      const updated = [...teachers, { id: Date.now(), name: newImage.caption, role: newImage.role || 'Staff', image: finalImageUrl, type: newImage.type }];
      updatedGallery.teachers = updated;
    } else if (activeTab === 'batches') {
      const updated = [...batches, { year: newImage.caption, image: finalImageUrl, type: newImage.type }];
      updatedGallery.batches = updated;
    } else if (activeTab === 'events') {
      const updated = [...events, { title: newImage.caption, image: finalImageUrl, type: newImage.type }];
      updatedGallery.events = updated;
    }

    try {
      await setDoc(doc(db, 'school_data', 'gallery'), updatedGallery, { merge: true });
      setNewImage({ url: '', caption: '', role: '', type: 'image' });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setGalleryStatus('Media successfully added to gallery!');
    } catch (e: any) {
      console.error(e);
      setGalleryStatus('Failed to save to database. You must be an authorized admin to upload.');
    }
    
    setIsUploading(false);
    setTimeout(() => setGalleryStatus(''), 4000);
  };

  const handleClearGalleryCategory = async () => {
    try {
      setGalleryStatus('Clearing category...');
      const updatedGallery = { teachers, batches, events };
      updatedGallery[activeTab] = [];
      await setDoc(doc(db, 'school_data', 'gallery'), updatedGallery, { merge: true });
      setSelectedIndexes([]);
      setIsDeleteMode(false);
      setGalleryStatus('Category cleared!');
      setTimeout(() => setGalleryStatus(''), 3000);
    } catch (e: any) {
      console.error(e);
      setGalleryStatus('Error clearing category: ' + (e?.message || 'Unknown error.'));
    }
  };

  const isSelected = (index: number) => {
    return selectedIndexes.includes(index);
  };

  const toggleSelection = (index: number) => {
    if (isSelected(index)) {
      setSelectedIndexes(selectedIndexes.filter(i => i !== index));
    } else {
      setSelectedIndexes([...selectedIndexes, index]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIndexes.length === 0) return;
    setShowConfirmModal(true);
  };

  const confirmBulkDelete = async () => {
    setShowConfirmModal(false);
    setGalleryStatus('Deleting selected...');
    let updatedArray: any[] = [];
    if (activeTab === 'teachers') {
      updatedArray = teachers.filter((_, idx) => !isSelected(idx));
    } else if (activeTab === 'batches') {
      updatedArray = batches.filter((_, idx) => !isSelected(idx));
    } else if (activeTab === 'events') {
      updatedArray = events.filter((_, idx) => !isSelected(idx));
    }

    try {
      const updatedGallery = { teachers, batches, events };
      updatedGallery[activeTab] = updatedArray;
      
      await setDoc(doc(db, 'school_data', 'gallery'), updatedGallery, { merge: true });
      setSelectedIndexes([]);
      setIsDeleteMode(false);
      setGalleryStatus('Items deleted!');
      setTimeout(() => setGalleryStatus(''), 3000);
    } catch (e: any) {
      console.error(e);
      setGalleryStatus('Error deleting items: ' + (e?.message || 'Unknown error.'));
    }
  };

  const switchTab = (tab: 'teachers' | 'batches' | 'events') => {
    setActiveTab(tab);
    setIsDeleteMode(false);
    setSelectedIndexes([]);
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-7xl mx-auto bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-[0_2px_18px_rgba(0,0,0,0.02)] border border-slate-100 dark:border-slate-800 min-h-screen">
        {/* Hero Header Skeleton */}
        <div className="w-full h-52 sm:h-60 bg-slate-900/90 dark:bg-slate-800 animate-pulse rounded-3xl p-6 sm:p-10 flex flex-col justify-between mb-10 shadow-lg">
          <div className="space-y-3">
            <div className="w-32 h-5 bg-slate-800 dark:bg-slate-700 rounded-full"></div>
            <div className="w-2/3 h-9 bg-slate-800 dark:bg-slate-700 rounded-lg"></div>
            <div className="w-1/2 h-4 bg-slate-800 dark:bg-slate-700 rounded-md"></div>
          </div>
          <div className="flex gap-4 pt-2">
            <div className="w-20 h-10 bg-slate-800 dark:bg-slate-700 rounded-xl"></div>
            <div className="w-20 h-10 bg-slate-800 dark:bg-slate-700 rounded-xl"></div>
            <div className="w-20 h-10 bg-slate-800 dark:bg-slate-700 rounded-xl"></div>
          </div>
        </div>

        {/* Filters & Control Strip Skeleton */}
        <div className="w-full h-16 bg-slate-50 dark:bg-slate-800/80 animate-pulse rounded-2xl mb-8 flex items-center justify-between px-5 border border-slate-100 dark:border-slate-700">
          <div className="w-48 h-6 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
          <div className="w-64 h-9 bg-slate-200 dark:bg-slate-700 rounded-xl"></div>
        </div>

        {/* Photo Gallery Grid Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-72 sm:h-80 bg-white dark:bg-slate-800/90 border border-slate-100 dark:border-slate-700/60 animate-pulse rounded-2xl p-3 flex flex-col justify-between shadow-xs"
            >
              <div className="w-full h-52 sm:h-60 bg-slate-200 dark:bg-slate-700 rounded-xl"></div>
              <div className="flex justify-between items-center px-2 py-2">
                <div className="w-36 h-4 bg-slate-200 dark:bg-slate-700 rounded-md"></div>
                <div className="w-14 h-3 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto bg-white rounded-3xl p-6 md:p-8 shadow-[0_2px_18px_rgba(0,0,0,0.02)] border border-slate-100">
      <Helmet>
        <title>Gallery | Shikshantar Academy</title>
        <meta name="description" content="View photos of events, classroom activities, and school life at Shikshantar Academy." />
        <link rel="canonical" href="https://shikshantaracademy.edu.np/gallery" />
      </Helmet>
      
      {/* Visual Chronicles Hero Block */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 sm:p-10 text-white mb-10 shadow-2xl border border-white/5">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-4 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/20 text-blue-300 border border-blue-550/30 rounded-full text-[10px] font-black uppercase tracking-widest">
              <Layers className="w-3.5 h-3.5 text-blue-400" /> Digital Archives
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-none bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
              Visual Chronicles
            </h1>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed font-medium">
              Explore our vibrant tapestry of learning, celebrations, and academic triumphs. Capturing the spirit, history, and physical heritage of Shikshantar Academy.
            </p>
          </div>
          
          {/* Real-time Interactive Archive Stats strip */}
          <div className="grid grid-cols-3 gap-3 sm:gap-6 bg-slate-900/60 p-4 sm:p-5 rounded-2xl border border-white/10 backdrop-blur-md self-start lg:self-center shrink-0">
            <div className="text-center px-2">
              <span className="block text-3xl font-black text-amber-400 tabular-nums">{teachers.length}</span>
              <span className="text-[9px] uppercase tracking-widest font-black text-slate-400">Faculty</span>
            </div>
            <div className="text-center px-2 border-x border-white/10">
              <span className="block text-3xl font-black text-blue-400 tabular-nums">{batches.length}</span>
              <span className="text-[9px] uppercase tracking-widest font-black text-slate-400">Batches</span>
            </div>
            <div className="text-center px-2">
              <span className="block text-3xl font-black text-purple-400 tabular-nums">{events.length}</span>
              <span className="text-[9px] uppercase tracking-widest font-black text-slate-400">Events</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Strip (Filters + Mode Actions) */}
      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 text-blue-650 rounded-xl">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <span className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Classification filter</span>
            <span className="text-xs font-bold text-slate-700">Displaying categories archive</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between md:justify-end gap-3.5 w-full md:w-auto">
          {/* View Mode Switcher */}
          <div className="flex bg-slate-200/60 p-1 rounded-xl border border-slate-200 self-center shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3.5 py-2 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer outline-none relative ${
                viewMode === 'grid' ? 'text-white' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {viewMode === 'grid' && (
                <motion.div
                  layoutId="activeViewMode"
                  className="absolute inset-0 bg-primary rounded-lg"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Grid className="w-3.5 h-3.5" /> Grid View
              </span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('nature')}
              className={`px-3.5 py-2 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer outline-none relative ${
                viewMode === 'nature' ? 'text-white' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {viewMode === 'nature' && (
                <motion.div
                  layoutId="activeViewMode"
                  className="absolute inset-0 bg-primary rounded-lg"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Trees className="w-3.5 h-3.5 text-amber-400" /> Nature Board
              </span>
            </button>
          </div>

          {/* Glassmorphic tab selection switcher */}
          <div className="flex bg-slate-200/60 p-1 rounded-xl self-center border border-slate-200">
            {(['teachers', 'batches', 'events'] as const).map((tab) => {
              const isActive = activeTab === tab;
              const labels = { teachers: 'Faculty & Team', batches: 'Batches', events: 'Events' };
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => switchTab(tab)}
                  className={`relative px-4 py-2 text-xs font-black rounded-lg transition-all cursor-pointer z-10 outline-none ${
                    isActive ? 'text-white shadow-[0_2px_12px_rgba(30,41,59,0.08)]' : 'text-slate-500 hover:text-slate-855'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTabUnder"
                      className="absolute inset-0 bg-primary rounded-lg"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{labels[tab]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Admin Operations Box */}
      {isAdmin && (
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-indigo-50/40 border border-indigo-100 rounded-2xl p-6 mb-8 shadow-2xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5 pb-4 border-b border-indigo-100/55">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                Add New Media — {activeTab === 'teachers' ? 'Faculty & Team' : activeTab === 'batches' ? 'Batches' : 'Events'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">Upload high-resolution photographs or short event videos to our remote secure archive.</p>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {!isDeleteMode ? (
                <button 
                  type="button"
                  onClick={() => { setIsDeleteMode(true); setSelectedIndexes([]); }} 
                  className="text-xs font-bold text-red-650 border border-red-200 bg-red-50/60 px-3.5 py-2 rounded-xl hover:bg-white hover:text-red-700 transition-all flex items-center gap-1 cursor-pointer active:scale-97"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Selection Deletion Mode
                </button>
              ) : (
                <>
                  {selectedIndexes.length > 0 && (
                    <button 
                      type="button"
                      onClick={handleBulkDelete} 
                      className="text-xs font-black px-4 py-2 rounded-xl shadow-sm transition-all flex items-center gap-1.5 bg-red-600 text-white hover:bg-red-750 active:scale-97 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selectedIndexes.length})
                    </button>
                  )}
                  <button 
                    type="button"
                    onClick={() => { setIsDeleteMode(false); setSelectedIndexes([]); }} 
                    className="text-xs font-bold text-slate-600 border border-slate-200 bg-white px-3.5 py-2 rounded-xl hover:bg-slate-50 transition-all shadow-sm cursor-pointer active:scale-97"
                  >
                    Cancel Selection
                  </button>
                </>
              )}
            </div>
          </div>
          
          <div className="flex gap-2 mb-4">
            <button 
              type="button"
              onClick={() => setUploadMode('url')} 
              className={`px-3.5 py-2 text-xs font-black rounded-xl flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer ${uploadMode === 'url' ? 'bg-primary text-white scale-102' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <LinkIcon className="w-3.5 h-3.5"/> Link URL
            </button>
            <button 
              type="button"
              onClick={() => setUploadMode('file')} 
              className={`px-3.5 py-2 text-xs font-black rounded-xl flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer ${uploadMode === 'file' ? 'bg-primary text-white scale-102' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <Upload className="w-3.5 h-3.5"/> Device Upload
            </button>
            <button 
              type="button"
              onClick={() => setUploadMode('camera')} 
              className={`px-3.5 py-2 text-xs font-black rounded-xl flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer ${uploadMode === 'camera' ? 'bg-primary text-white scale-102' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <Camera className="w-3.5 h-3.5"/> Live Capture
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {uploadMode === 'url' ? (
              <div className="space-y-1">
                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">Media Target URL</label>
                <input 
                  type="text" 
                  placeholder="https://images.unsplash.com/... or imgur" 
                  value={newImage.url} 
                  onChange={(e) => setNewImage({...newImage, url: e.target.value})} 
                  className="px-3.5 py-2.5 bg-white border border-slate-250 rounded-xl text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary text-slate-800 font-semibold" 
                />
              </div>
            ) : uploadMode === 'camera' ? (
              <div className="space-y-1">
                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">Device Camera Stream</label>
                <input 
                  ref={fileInputRef} 
                  type="file" 
                  accept="image/*,video/*" 
                  capture="environment" 
                  onChange={handleFileChange} 
                  className="px-3 py-1.5 border border-slate-200 rounded-xl text-sm w-full bg-white file:mr-4 file:py-1.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:opacity-90 cursor-pointer" 
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">Device File Picker</label>
                <input 
                  ref={fileInputRef} 
                  type="file" 
                  accept="image/*,video/*" 
                  onChange={handleFileChange} 
                  className="px-3 py-1.5 border border-slate-200 rounded-xl text-sm w-full bg-white file:mr-4 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:opacity-90 cursor-pointer" 
                />
              </div>
            )}
            
            <div className="space-y-1">
              <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">
                {activeTab === 'teachers' ? 'Teacher / Staff Name' : activeTab === 'batches' ? 'S.E.E. Batch Year (e.g. 2082 B.S.)' : 'Event Header Tagline'}
              </label>
              <input 
                type="text" 
                placeholder={activeTab === 'teachers' ? 'e.g. Mr. Pappu Kumar Jha' : activeTab === 'batches' ? 'e.g. 2080 B.S. (Class 10 SEE)' : 'e.g. Celebrating Tihar'} 
                value={newImage.caption} 
                onChange={(e) => setNewImage({...newImage, caption: e.target.value})} 
                className="px-3.5 py-2.5 bg-white border border-slate-250 rounded-xl text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary text-slate-800 font-semibold" 
              />
            </div>
            
            {activeTab === 'teachers' && (
              <div className="space-y-1 md:col-span-2">
                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">Subject Taught / Administrative Position</label>
                <input 
                  type="text" 
                  placeholder="e.g. Chemistry Instructor, Principal, Secondary Block Co-ordinator" 
                  value={newImage.role} 
                  onChange={(e) => setNewImage({...newImage, role: e.target.value})} 
                  className="px-3.5 py-2.5 bg-white border border-slate-250 rounded-xl text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary text-slate-800 font-semibold" 
                />
              </div>
            )}
          </div>
          
          {newImage.url && (uploadMode === 'file' || uploadMode === 'camera') && (
            <div className="mb-4 flex gap-3 items-center bg-white border border-indigo-100 p-2 rounded-xl self-start">
              <span className="text-xs text-slate-500 shrink-0 font-bold ml-1">Media Preview:</span>
              <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-100 shrink-0 bg-slate-50">
                {newImage.type === 'video' ? (
                  <video src={newImage.url} className="w-full h-full object-cover" muted />
                ) : (
                  <img src={newImage.url} alt="Preview" className="w-full h-full object-cover" />
                )}
              </div>
              <span className="text-[10px] text-slate-600 bg-slate-100 border px-2 py-0.5 rounded font-black uppercase tracking-wider">{newImage.type} Loaded</span>
            </div>
          )}

          <div className="flex flex-wrap gap-3 items-center">
            <button 
              type="button"
              disabled={isUploading} 
              onClick={handleAddMedia} 
              className={`px-5 py-2.5 rounded-xl text-xs font-black tracking-wider uppercase transition-all shadow-md cursor-pointer active:scale-97 ${isUploading ? 'bg-slate-200 border border-slate-300 text-slate-500 cursor-not-allowed' : 'bg-primary text-white hover:opacity-95'}`}
            >
              {isUploading ? 'Transferring File...' : 'Post Media Entry'}
            </button>
            {isUploading && uploadMode === 'file' && (
              <button 
                type="button"
                onClick={handleCancelUpload}
                className="px-4 py-2.5 bg-red-100 text-red-700 hover:bg-red-200 hover:text-red-850 rounded-xl text-xs font-black tracking-wider uppercase transition-all shadow-sm cursor-pointer"
              >
                Abort Upload
              </button>
            )}
            {galleryStatus && (
              <span className={`text-xs font-extrabold px-3 py-1 bg-white border rounded-lg shadow-2xs ${galleryStatus.includes('Failed') || galleryStatus.includes('Error') || galleryStatus.includes('cancelled') || galleryStatus.includes('timed') ? 'text-red-655 border-red-200 bg-red-50/10' : 'text-emerald-700 border-emerald-100 bg-emerald-50/10'}`}>
                {galleryStatus}
              </span>
            )}
          </div>
        </motion.div>
      )}

      {/* Main Grid Render Loop */}
      <AnimatePresence mode="wait">
        {viewMode === 'nature' ? (
          <motion.div
            key="nature-view"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            className="w-full"
          >
            <NatureBoard 
              items={activeTab === 'teachers' ? teachers : activeTab === 'batches' ? batches : events} 
              activeTab={activeTab} 
              isMobile={isMobile} 
              setExpandedImage={setExpandedImage} 
            />
          </motion.div>
        ) : (
          <motion.div
            key="grid-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            {activeTab === 'teachers' && (
          <motion.div 
            key="teachers"
            initial="hidden"
            animate="show"
            exit="exit"
            variants={staggerContainer}
            className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            {teachers.map((teacher, idx) => {
              // Custom bento patterns based on index
              const isWideFeature = idx % 5 === 0;
              const colSpanClass = isWideFeature 
                ? 'col-span-2 sm:col-span-2 lg:col-span-2 xl:col-span-2' 
                : 'col-span-1';
              const aspectClass = isWideFeature
                ? 'aspect-[16/10] sm:aspect-[16/9]'
                : (idx % 3 === 1 ? 'aspect-[3/4]' : 'aspect-[1/1]');
              const borderTheme = isWideFeature
                ? 'border-indigo-100 hover:border-indigo-300 ring-2 ring-indigo-50/40'
                : 'border-slate-100 hover:border-blue-150';

              return (
                <motion.div 
                  key={teacher.id || idx} 
                  variants={faderVariants}
                  whileHover={{ 
                    y: -8, 
                    rotate: idx % 2 === 0 ? 1 : -1, 
                    scale: 1.03, 
                    transition: { type: "spring", stiffness: 350, damping: 15 } 
                  }}
                  onClick={() => isDeleteMode ? toggleSelection(idx) : setExpandedImage(teacher.image)}
                  className={`group relative bg-white p-3.5 rounded-[2rem] border transition-all ${
                    isDeleteMode 
                      ? 'cursor-pointer hover:bg-red-50/45 border-red-200' 
                      : `cursor-pointer hover:shadow-2xl ${borderTheme}`
                  } ${
                    isSelected(idx) 
                      ? 'border-red-500 ring-4 ring-red-500/15 bg-red-50/20' 
                      : 'shadow-[0_6px_26px_rgba(0,0,0,0.02)]'
                  } ${colSpanClass}`}
                >
                  {isAdmin && isDeleteMode && (
                    <div className="absolute top-4 right-4 z-20 bg-white rounded-full flex items-center justify-center w-7 h-7 shadow-lg pointer-events-none border border-slate-150">
                      {isSelected(idx) ? <CheckCircle className="w-5 h-5 text-red-550 fill-red-50" /> : <Circle className="w-5 h-5 text-slate-300" />}
                    </div>
                  )}
                  <div className={`rounded-3xl overflow-hidden mb-3 border border-slate-50 relative bg-slate-50 transition-all ${isDeleteMode ? 'pointer-events-none' : ''} ${aspectClass}`}>
                    {teacher.type === 'video' || teacher.image?.match(/\.(mp4|webm|mov)(\?|$)/i) ? (
                      <>
                        <video src={teacher.image} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-106" muted />
                        <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[9px] font-black uppercase text-white tracking-widest flex items-center gap-1">
                          <Video className="w-3 h-3 text-red-400" /> Video
                        </div>
                      </>
                    ) : (
                      <img
                        src={teacher.image}
                        alt={teacher.name}
                        className="w-full h-full object-cover transition-transform duration-550 group-hover:scale-106"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    
                    {/* Hover glass light reflection shimmer */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                    
                    {/* Action prompt on Card Hover */}
                    {!isDeleteMode && (
                      <>
                        <div className="absolute inset-0 bg-slate-950/15 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-5" />
                        <div className="absolute bottom-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-1.5 group-hover:translate-y-0 pointer-events-none">
                          <div className="w-12 h-12 rounded-full bg-white text-indigo-600 flex items-center justify-center shadow-xl border border-slate-100/80 transition-all duration-300 group-hover:scale-110">
                            <Eye className="w-6 h-6" />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="px-1 text-center py-1">
                    <h3 className="text-sm font-black text-slate-800 group-hover:text-primary transition-colors truncate" title={teacher.name}>{teacher.name}</h3>
                    <div className="flex items-center justify-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <p className="text-[11px] text-slate-500 font-bold tracking-tight truncate max-w-[90%]" title={teacher.role}>{teacher.role}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {teachers.length === 0 && <p className="text-sm text-slate-400 font-bold col-span-full text-center py-12">No other staff photos uploaded yet.</p>}
          </motion.div>
        )}        {activeTab === 'batches' && (
          <motion.div 
            key="batches"
            initial="hidden"
            animate="show"
            exit="exit"
            variants={staggerContainer}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8"
          >
            {batches.map((batch, idx) => {
              // Creating a mathematical alternating small & large rectangular arrangement
              // idx 0, 3, 4, 7... are Large; idx 1, 2, 5, 6... are Small
              const isLarge = idx % 4 === 0 || idx % 4 === 3;
              const gridSpan = isLarge ? 'col-span-1 sm:col-span-2' : 'col-span-1';
              const aspectStyle = isMobile
                ? 'aspect-[4/3]'
                : (isLarge 
                  ? 'aspect-[4/3] sm:aspect-[16/10] md:aspect-[16/9]' 
                  : 'aspect-[1/1] sm:aspect-[4/5]');
              
              const borderAccent = isLarge 
                ? 'shadow-[0_12px_45px_rgba(245,158,11,0.05)]' 
                : '';

              return (
                <motion.div 
                  key={batch.year || idx} 
                  variants={faderVariants}
                  whileHover={isMobile ? { scale: 1.01, y: -2 } : { 
                    y: -10, 
                    rotate: idx % 2 === 0 ? -3.5 : 3.5, 
                    scale: 1.05, 
                    transition: { type: "spring", stiffness: 350, damping: 15 } 
                  }}
                  onClick={() => isDeleteMode ? toggleSelection(idx) : setExpandedImage(batch.image)}
                  className={`group relative p-1.5 sm:p-2 transition-all ${
                    isDeleteMode 
                       ? 'cursor-pointer hover:opacity-90' 
                       : `cursor-pointer ${borderAccent}`
                  } ${
                    isSelected(idx) 
                      ? 'ring-4 ring-red-500/30 rounded-xl' 
                      : ''
                  } ${gridSpan}`}
                >
                  {isAdmin && isDeleteMode && (
                    <div className="absolute top-5 right-5 z-40 bg-white rounded-full flex items-center justify-center w-7 h-7 shadow-lg pointer-events-none border border-slate-100 animate-pulse">
                      {isSelected(idx) ? <CheckCircle className="w-5 h-5 text-red-555 fill-red-50" /> : <Circle className="w-5 h-5 text-slate-400" />}
                    </div>
                  )}

                  {/* 3D projection shadow with identical hand-torn edge */}
                  <div 
                    className="absolute inset-[3px] bg-slate-950/15 pointer-events-none transition-transform duration-500 group-hover:translate-y-1.5 filter blur-[2px] z-0"
                    style={{ clipPath: getTornClipPath(idx, isMobile) }}
                  />

                  {/* White fibrous backing paper layer */}
                  <div 
                    className="absolute inset-[0px] bg-white pointer-events-none transition-all duration-300 group-hover:bg-amber-50/10 z-0 border border-slate-100/50"
                    style={{ clipPath: getTornClipPath(idx, isMobile) }}
                  />

                  {/* Main card box with torn page edge */}
                  <div 
                    className={`relative overflow-hidden bg-slate-50 transition-all duration-500 z-10 ${isDeleteMode ? 'pointer-events-none' : ''} ${aspectStyle}`}
                    style={{ clipPath: getTornClipPath(idx, isMobile) }}
                  >
                    {/* Retro scrapbook scotch tape strip overlay */}
                    <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-14 h-4 sm:w-16 sm:h-5 bg-white/20 backdrop-blur-[1px] border border-white/10 rotate-[-4deg] shadow-sm z-30 pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity" style={{ mixBlendMode: 'overlay' }} />

                    {batch.type === 'video' || batch.image?.match(/\.(mp4|webm|mov)(\?|$)/i) ? (
                      <>
                        <video src={batch.image} className="w-full h-full object-cover transition-transform duration-550 group-hover:scale-106" muted />
                        <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[8px] sm:text-[9px] font-black uppercase text-white tracking-widest flex items-center gap-1 z-20">
                          <Video className="w-3 h-3 text-amber-400" /> Video Memo
                        </div>
                      </>
                    ) : (
                      <img
                        src={batch.image}
                        alt={`S.E.E. Batch ${batch.year}`}
                        className="w-full h-full object-cover transition-transform duration-550 group-hover:scale-106"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    
                    {/* Interactive center Eye overlay on hover */}
                    {!isDeleteMode && (
                      <div className="absolute inset-0 bg-slate-950/25 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-20">
                        <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-white/95 backdrop-blur-sm shadow-xl flex items-center justify-center text-slate-900 transform scale-75 group-hover:scale-100 transition-transform duration-300 ease-out border border-white/40">
                          <Eye className="w-5 h-5 sm:w-6 sm:h-6 text-slate-800" />
                        </div>
                      </div>
                    )}

                    {/* Elegant overlay gradient shim */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/0 via-amber-400/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10" />

                    {/* Dynamic text and badge overlay */}
                    <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 via-transparent to-transparent p-3 sm:p-4 pointer-events-none z-20 flex items-end justify-between gap-2 ${isMobile ? 'pb-4' : 'pb-10 sm:pb-14'}`}>
                      <div className="space-y-0.5 sm:space-y-1.5 max-w-full" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.95)' }}>
                        <div className="inline-flex items-center gap-1 bg-amber-500/40 border border-amber-400/40 backdrop-blur-[2px] px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md sm:rounded-lg text-[6px] sm:text-[8px] font-black uppercase text-white tracking-wider shadow-sm">
                          🎓 SEE Candidates
                        </div>
                        <h3 className="text-xs sm:text-lg font-black text-white tracking-tight">{batch.year}</h3>
                        <p className="hidden sm:block text-[10px] sm:text-[11px] text-zinc-100 font-bold leading-normal opacity-95">
                          Academic achievers of the Secondary Education Examination.
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {batches.length === 0 && <p className="text-sm text-slate-400 font-bold col-span-full text-center py-12">No batch photos uploaded yet.</p>}
          </motion.div>
        )}
        {activeTab === 'events' && (
          <motion.div 
            key="events"
            initial="hidden"
            animate="show"
            exit="exit"
            variants={staggerContainer}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8"
          >
            {events.map((event, idx) => {
              // Creating a premium asymmetrical magazine collage
              // idx 0, 3, 4, 7... are Large; idx 1, 2, 5, 6... are Small
              const isEventLarge = idx % 4 === 0 || idx % 4 === 3;
              const gridSpanClass = isEventLarge ? 'col-span-1 sm:col-span-2' : 'col-span-1';
              const eventAspect = isMobile
                ? 'aspect-[4/3]'
                : (isEventLarge 
                  ? 'aspect-[4/3] sm:aspect-[16/10] md:aspect-[16/9]' 
                  : 'aspect-[1/1] sm:aspect-[4/5]');
              
              const borderAccentStyle = isEventLarge
                ? 'shadow-[0_12px_40px_rgba(79,70,229,0.04)]'
                : '';

              return (
                <motion.div 
                  key={event.title || idx} 
                  variants={faderVariants}
                  whileHover={isMobile ? { scale: 1.01, y: -2 } : { 
                    y: -10, 
                    rotate: idx % 2 === 0 ? 3.5 : -3.5, 
                    scale: 1.05, 
                    transition: { type: "spring", stiffness: 350, damping: 15 } 
                  }}
                  onClick={() => isDeleteMode ? toggleSelection(idx) : setExpandedImage(event.image)}
                  className={`group relative p-1.5 sm:p-2 transition-all ${
                    isDeleteMode 
                      ? 'cursor-pointer hover:opacity-90' 
                      : `cursor-pointer ${borderAccentStyle}`
                  } ${
                    isSelected(idx) 
                      ? 'ring-4 ring-red-500/30 rounded-xl' 
                      : ''
                  } ${gridSpanClass}`}
                >
                  {isAdmin && isDeleteMode && (
                    <div className="absolute top-5 right-5 z-40 bg-white rounded-full flex items-center justify-center w-7 h-7 shadow-lg pointer-events-none border border-slate-100 animate-pulse">
                      {isSelected(idx) ? <CheckCircle className="w-5 h-5 text-red-550 fill-red-50" /> : <Circle className="w-5 h-5 text-slate-300" />}
                    </div>
                  )}

                  {/* 3D projection shadow with identical hand-torn edge */}
                  <div 
                    className="absolute inset-[3px] bg-slate-950/15 pointer-events-none transition-transform duration-500 group-hover:translate-y-1.5 filter blur-[2px] z-0"
                    style={{ clipPath: getTornClipPath(idx, isMobile) }}
                  />

                  {/* White fibrous backing paper layer */}
                  <div 
                    className="absolute inset-[0px] bg-white pointer-events-none transition-all duration-300 group-hover:bg-indigo-50/10 z-0 border border-slate-100/50"
                    style={{ clipPath: getTornClipPath(idx, isMobile) }}
                  />

                  {/* Main card box with torn page edge */}
                  <div 
                    className={`relative overflow-hidden bg-slate-50 transition-all duration-500 z-10 ${isDeleteMode ? 'pointer-events-none' : ''} ${eventAspect}`}
                    style={{ clipPath: getTornClipPath(idx, isMobile) }}
                  >
                    {/* Retro scrapbook scotch tape strip overlay */}
                    <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-14 h-4 sm:w-16 sm:h-5 bg-white/20 backdrop-blur-[1px] border border-white/10 rotate-[3deg] shadow-sm z-30 pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity" style={{ mixBlendMode: 'overlay' }} />

                    {event.type === 'video' || event.image?.match(/\.(mp4|webm|mov)(\?|$)/i) ? (
                      <>
                        <video src={event.image} className="w-full h-full object-cover transition-transform duration-550 group-hover:scale-106" muted />
                        <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[8px] sm:text-[9px] font-black uppercase text-white tracking-widest flex items-center gap-1 z-20">
                          <Video className="w-3 h-3 text-indigo-400" /> Video Reel
                        </div>
                      </>
                    ) : (
                      <img
                        src={event.image}
                        alt={event.title}
                        className="w-full h-full object-cover transition-transform duration-550 group-hover:scale-106"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    
                    {/* Interactive center Eye overlay on hover */}
                    {!isDeleteMode && (
                      <div className="absolute inset-0 bg-slate-950/25 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-20">
                        <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-white/95 backdrop-blur-sm shadow-xl flex items-center justify-center text-slate-900 transform scale-75 group-hover:scale-100 transition-transform duration-300 ease-out border border-white/40">
                          <Eye className="w-5 h-5 sm:w-6 sm:h-6 text-slate-800" />
                        </div>
                      </div>
                    )}

                    {/* Elegant overlay gradient shim */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/0 via-indigo-500/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10" />

                    {/* Event Text layout details overlay */}
                    <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 via-transparent to-transparent p-3 sm:p-4 pointer-events-none z-20 flex items-end justify-between gap-2 ${isMobile ? 'pb-4' : 'pb-10 sm:pb-14'}`}>
                      <div className="space-y-0.5 sm:space-y-1.5 max-w-full" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.95)' }}>
                        <span className="inline-flex items-center gap-1 bg-indigo-600/40 border border-indigo-400/40 backdrop-blur-[2px] px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg text-[6px] sm:text-[8px] font-black uppercase text-white tracking-wider shadow-sm">
                          🎉 School Event
                        </span>
                        <h3 className="text-xs sm:text-lg font-black text-white tracking-tight">{event.title}</h3>
                        <p className="hidden sm:block text-[10px] sm:text-[11px] text-zinc-100 font-bold leading-normal opacity-95">
                          School community celebration & memorable heritage highlights.
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {events.length === 0 && <p className="text-sm text-slate-400 font-bold col-span-full text-center py-12">No event photos uploaded yet.</p>}
          </motion.div>
        )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox Modal Portal rendering support */}
      {expandedImage && createPortal(
        <div 
          className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200"
          onClick={() => setExpandedImage(null)}
        >
          <button 
            type="button"
            className="absolute top-6 right-6 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2.5 transition-all z-[100] cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setExpandedImage(null); }}
            title="Close Lightbox"
          >
            <X className="w-7 h-7 font-bold" />
          </button>
          
          <div className="relative w-full h-[90vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {expandedImage.match(/\.(mp4|webm|mov)(\?|$)/i) ? (
              <video 
                src={expandedImage} 
                controls
                autoPlay
                className="max-w-[95vw] max-h-[85vh] object-contain rounded-2xl drop-shadow-2xl border border-white/5"
              />
            ) : (
              <TransformWrapper
                initialScale={1}
                minScale={1}
                maxScale={8}
                centerOnInit={true}
                wheel={{ step: 0.15 }}
              >
                <TransformComponent wrapperClass="!w-[100vw] !h-[90vh] flex items-center justify-center cursor-move" contentClass="!w-full !h-full flex items-center justify-center">
                  <img 
                    src={expandedImage} 
                    srcSet={`${expandedImage} 400w, ${expandedImage} 800w, ${expandedImage} 1200w`}
                    sizes="(max-width: 600px) 100vw, (max-width: 1200px) 80vw, 100vw"
                    alt="Expanded Archive Photo" 
                    className="max-w-[92vw] max-h-[85vh] object-contain rounded-2xl drop-shadow-2xl pointer-events-auto block mx-auto border border-white/5"
                    referrerPolicy="referrer"
                    onClick={() => setExpandedImage(null)}
                  />
                </TransformComponent>
              </TransformWrapper>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal Overlay */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[200] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden text-center border border-slate-100">
            <div className="p-6 bg-red-50/50 border-b border-red-50">
              <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-3 animate-bounce" />
              <h3 className="text-lg font-black text-red-900">Confirm Deletion</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-6 font-semibold text-sm leading-relaxed">Are you absolutely sure? The database will permanently clear {selectedIndexes.length} selected item(s) from this category.</p>
              <div className="flex justify-center gap-3">
                <button 
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-5 py-2.5 text-slate-700 font-extrabold bg-slate-100 hover:bg-slate-200 rounded-xl transition-transform active:scale-97 w-full cursor-pointer"
                >
                  Keep Media
                </button>
                <button 
                  type="button"
                  onClick={confirmBulkDelete}
                  className="px-5 py-2.5 text-white font-extrabold bg-red-600 hover:bg-red-750 shadow-md rounded-xl transition-transform active:scale-97 w-full cursor-pointer"
                >
                  Yes, Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
