import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, GraduationCap, BookOpen, Star, RefreshCw } from "lucide-react";

interface AdmissionIntroProps {
  onComplete: () => void;
}

const timeStyles = {
  morning: {
    sky: "from-[#bae6fd] via-[#cbd5e1] to-[#93c5fd]",
    textTitle: "text-slate-900",
    textSubtitle: "text-slate-700/85",
    badge: "bg-slate-900/5 hover:bg-slate-900/10 text-amber-700 border-slate-900/10",
    shadow: "shadow-sky-200/50",
    lampCone: "opacity-0",
    lampGlow: "bg-slate-400 shadow-none",
    starOpacity: "opacity-0",
    cloudsOpacity: "opacity-80",
    hillColor: "text-emerald-800/20",
    curbColor: "from-[#64748b] to-[#475569] border-[#334155]",
    roadColor: "from-[#475569] to-[#334155] border-slate-400/25",
    statusText: "text-slate-700 font-bold",
    glowSphere1: "bg-amber-400/20",
    glowSphere2: "bg-sky-400/20",
  },
  afternoon: {
    sky: "from-[#38bdf8] via-[#e0f2fe] to-[#bae6fd]",
    textTitle: "text-slate-900",
    textSubtitle: "text-slate-700/85",
    badge: "bg-slate-900/5 hover:bg-slate-900/10 text-sky-850 border-slate-900/10",
    shadow: "shadow-sky-300/40",
    lampCone: "opacity-0",
    lampGlow: "bg-slate-400 shadow-none",
    starOpacity: "opacity-0",
    cloudsOpacity: "opacity-90",
    hillColor: "text-emerald-800/15",
    curbColor: "from-[#64748b] to-[#475569] border-[#334155]",
    roadColor: "from-[#3b4252] to-[#2e3440] border-slate-400/20",
    statusText: "text-slate-700 font-bold",
    glowSphere1: "bg-sky-400/30",
    glowSphere2: "bg-amber-300/10",
  },
  sunset: {
    sky: "from-[#fdba74] via-[#f97316] to-[#7c2d12]",
    textTitle: "text-white",
    textSubtitle: "text-orange-100/80",
    badge: "bg-white/5 hover:bg-white/10 text-[#ffd369] border-white/10",
    shadow: "shadow-orange-950/40",
    lampCone: "opacity-30",
    lampGlow: "bg-amber-300 shadow-[0_0_8px_#f59e0b]",
    starOpacity: "opacity-25",
    cloudsOpacity: "opacity-50",
    hillColor: "text-amber-950/40",
    curbColor: "from-[#3f3f46] to-[#27272a] border-[#18181b]",
    roadColor: "from-[#1c1917] to-[#0c0a09] border-stone-800/30",
    statusText: "text-orange-200/95 font-bold",
    glowSphere1: "bg-rose-500/10",
    glowSphere2: "bg-amber-500/10",
  },
  night: {
    sky: "from-[#020617] via-[#0f172a] to-[#1e293b]",
    textTitle: "text-white",
    textSubtitle: "text-sky-100/70",
    badge: "bg-white/5 hover:bg-white/10 text-[#F0A500] border-white/10",
    shadow: "shadow-black/70",
    lampCone: "opacity-65 animate-pulse",
    lampGlow: "bg-yellow-200 shadow-[0_0_12px_#eab308]",
    starOpacity: "opacity-50",
    cloudsOpacity: "opacity-15",
    hillColor: "text-slate-800/20",
    curbColor: "from-[#404c5e] to-[#2c3542] border-[#1b212a]",
    roadColor: "from-[#1b1f26] to-[#0f1115] border-slate-700/30",
    statusText: "text-sky-200/90 font-bold",
    glowSphere1: "bg-sky-400/5",
    glowSphere2: "bg-[#F0A500]/5",
  }
};

export default function AdmissionIntro({ onComplete }: AdmissionIntroProps) {
  // Determine starting time of day based on current local hour
  const getInitialTimeOfDay = (): "morning" | "afternoon" | "sunset" | "night" => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 20) return "sunset";
    return "night";
  };

  const [timeOfDay, setTimeOfDay] = useState<"morning" | "afternoon" | "sunset" | "night">("morning");
  const [animationStep, setAnimationStep] = useState<"walking" | "waiting" | "bus-arriving" | "climbing" | "bus-departing" | "completed">("walking");
  const [triggerReplay, setTriggerReplay] = useState(0);
  const [blink, setBlink] = useState(false);

  // Auto blinking mechanism for the realistic animated child
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 140);
    }, 3200);
    return () => clearInterval(blinkInterval);
  }, []);

  // Track state sequences for the bus-stop scene
  useEffect(() => {
    setAnimationStep("walking");

    // 1. Walk from left to bus stop for 3.0s (from x: -220px to x: -65px)
    const waitingTimer = setTimeout(() => {
      setAnimationStep("waiting");
    }, 3000);

    // 2. Wait at the bus stop for 2.5s (stands looking right, tapping foot, waiting)
    const busArrivingTimer = setTimeout(() => {
      setAnimationStep("bus-arriving");
    }, 5500);

    // 3. School Bus arrives and stops at x: 20px (takes 2.5s)
    const climbingTimer = setTimeout(() => {
      setAnimationStep("climbing");
    }, 8000);

    // 4. Child walks to the bus door at x: 10px and boards (takes 1.5s, opacity/scale -> 0)
    const busDepartingTimer = setTimeout(() => {
      setAnimationStep("bus-departing");
    }, 9500);

    // 5. School Bus drives off to the left (takes 2.5s)
    const completedTimer = setTimeout(() => {
      setAnimationStep("completed");
      // Auto transition to the online admission form
      onComplete();
    }, 12000);

    return () => {
      clearTimeout(waitingTimer);
      clearTimeout(busArrivingTimer);
      clearTimeout(climbingTimer);
      clearTimeout(busDepartingTimer);
      clearTimeout(completedTimer);
    };
  }, [triggerReplay, onComplete]);

  // Restart the animation
  const handleReplay = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTriggerReplay(prev => prev + 1);
  };

  // Get real-time informative status text
  const getStatusText = () => {
    switch (animationStep) {
      case "walking":
        return "Student walking toward the school bus stop";
      case "waiting":
        return "Waiting at the shelter under the street lamp";
      case "bus-arriving":
        return "School bus arriving at the stop";
      case "climbing":
        return "Boarding the school bus";
      case "bus-departing":
        return "Departing to school, loading admission form";
      case "completed":
        return "Welcome to Shikshantar Academy";
      default:
        return "Starting school journey";
    }
  };

  // Humanized smooth walk cycle animations
  const legSwingLeft = {
    animate: {
      rotate: [-20, 20, -20],
      transition: {
        repeat: Infinity,
        duration: 0.48,
        ease: "easeInOut"
      }
    }
  };

  const legSwingRight = {
    animate: {
      rotate: [20, -20, 20],
      transition: {
        repeat: Infinity,
        duration: 0.48,
        ease: "easeInOut"
      }
    }
  };

  const armSwingLeft = {
    animate: {
      rotate: [14, -14, 14],
      transition: {
        repeat: Infinity,
        duration: 0.48,
        ease: "easeInOut"
      }
    }
  };

  const armSwingRight = {
    animate: {
      rotate: [-14, 14, -14],
      transition: {
        repeat: Infinity,
        duration: 0.48,
        ease: "easeInOut"
      }
    }
  };

  // Smooth welcoming wave
  const armWave = {
    animate: {
      rotate: [90, 125, 90],
      transition: {
        repeat: Infinity,
        duration: 0.55,
        ease: "easeInOut"
      }
    }
  };

  const legClimbLeft = {
    animate: {
      rotate: [0, 18, -18, 18, -28, 0],
      y: [0, -1.5, 0, -1.5, -10, 0],
      transition: {
        duration: 1.5,
        times: [0, 0.2, 0.4, 0.7, 0.85, 1.0],
        ease: "easeInOut"
      }
    }
  };

  const legClimbRight = {
    animate: {
      rotate: [0, -18, 18, -18, 0, -15, 0],
      y: [0, -1.5, 0, -1.5, 0, -6, 0],
      transition: {
        duration: 1.5,
        times: [0, 0.2, 0.4, 0.7, 0.8, 0.9, 1.0],
        ease: "easeInOut"
      }
    }
  };

  const armClimbLeft = {
    animate: {
      rotate: [0, -14, 14, -14, -50, 0],
      transition: {
        duration: 1.5,
        times: [0, 0.2, 0.4, 0.7, 0.85, 1.0],
        ease: "easeInOut"
      }
    }
  };

  const armClimbRight = {
    animate: {
      rotate: [0, 14, -14, 14, -35, 0],
      transition: {
        duration: 1.5,
        times: [0, 0.2, 0.4, 0.7, 0.85, 1.0],
        ease: "easeInOut"
      }
    }
  };

  const legTapRight = {
    animate: {
      rotate: [0, 8, 0, 8, 0],
      transition: {
        repeat: Infinity,
        duration: 1.4,
        ease: "easeInOut"
      }
    }
  };

  const windowStudentWave1 = {
    animate: {
      rotate: [-5, -35, 5, -35, 5, -5],
      transition: {
        repeat: Infinity,
        duration: 1.2,
        ease: "easeInOut"
      }
    }
  };

  const windowStudentWave2 = {
    animate: {
      rotate: [5, 35, -5, 35, -5, 5],
      transition: {
        repeat: Infinity,
        duration: 1.4,
        ease: "easeInOut"
      }
    }
  };

  // Smooth breathing idle animation when waiting
  const bodyBreath = {
    animate: {
      scaleY: [1, 1.015, 1],
      y: [0, -1, 0],
      transition: {
        repeat: Infinity,
        duration: 2.2,
        ease: "easeInOut"
      }
    }
  };

  // Body bobbing up and down when walking
  const bodyBob = {
    animate: {
      y: [0, -3, 0],
      rotate: [-0.5, 0.5, -0.5],
      transition: {
        repeat: Infinity,
        duration: 0.24,
        ease: "easeInOut"
      }
    }
  };

  // Wheels rotation during driving
  const wheelRotation = {
    animate: {
      rotate: animationStep === "bus-arriving" || animationStep === "bus-departing" ? [-360, 0] : 0,
      transition: {
        repeat: Infinity,
        duration: 0.4,
        ease: "linear"
      }
    }
  };

  // Determine clouds bg accent based on time of day
  const cloudColor = timeOfDay === "sunset" 
    ? "bg-rose-200/20" 
    : timeOfDay === "night" 
    ? "bg-slate-300/5" 
    : "bg-white/30";

  return (
    <div 
      id="admission-intro-container" 
      className={`relative w-full min-h-[540px] md:min-h-[590px] rounded-3xl bg-gradient-to-br ${timeStyles[timeOfDay].sky} ${timeStyles[timeOfDay].textTitle} transition-all duration-1000 overflow-hidden flex flex-col items-center justify-between p-6 sm:p-8 shadow-2xl border border-white/10 select-none`}
    >
      
      {/* ---------------- DECORATIVE BACKGROUND ENVIRONMENT ---------------- */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        
        {/* Soft atmospheric gradients */}
        <div className={`absolute top-[-40px] left-[15%] w-80 h-80 rounded-full blur-3xl animate-pulse transition-all duration-1000 ${timeStyles[timeOfDay].glowSphere1}`} />
        <div className={`absolute bottom-[-40px] right-[15%] w-96 h-96 rounded-full blur-3xl transition-all duration-1000 ${timeStyles[timeOfDay].glowSphere2}`} />
        
        {/* Sky Stars Twinkling */}
        <div className={`absolute inset-0 transition-opacity duration-1000 ${timeStyles[timeOfDay].starOpacity}`}>
          {[...Array(18)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute bg-white rounded-full"
              style={{
                width: i % 4 === 0 ? "2.5px" : "1.5px",
                height: i % 4 === 0 ? "2.5px" : "1.5px",
                top: `${(i * 23) % 75}%`,
                left: `${(i * 31) % 96}%`,
              }}
              animate={{
                opacity: [0.2, 0.9, 0.2],
                scale: [0.8, 1.3, 0.8],
              }}
              transition={{
                duration: 2.5 + (i % 3),
                repeat: Infinity,
                delay: i * 0.15,
                ease: "easeInOut"
              }}
            />
          ))}
        </div>

        {/* 1. Celestial Bodies based on Time of Day */}
        {timeOfDay === "morning" && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="absolute top-10 right-[18%] w-16 h-16 z-5 pointer-events-none flex items-center justify-center"
          >
            {/* Soft warm morning ray flare animation */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
              className="absolute inset-0 bg-yellow-300/10 rounded-full border border-dashed border-yellow-300/20"
            />
            <div className="absolute inset-2 bg-amber-400/20 rounded-full blur-md" />
            {/* Golden soft sun */}
            <div className="w-10 h-10 bg-gradient-to-br from-white to-amber-300 rounded-full shadow-[0_0_15px_#fef08a]" />
          </motion.div>
        )}

        {timeOfDay === "afternoon" && (
          <motion.div
            initial={{ y: -30, x: 20, opacity: 0 }}
            animate={{ y: 0, x: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="absolute top-8 right-[25%] w-14 h-14 z-5 pointer-events-none flex items-center justify-center"
          >
            {/* Strong sun rays */}
            <motion.div
              animate={{ scale: [0.95, 1.05, 0.95] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
              className="absolute inset-0 bg-amber-400/15 rounded-full blur-lg"
            />
            <div className="w-10 h-10 bg-white rounded-full shadow-[0_0_25px_#ffffff,0_0_10px_#fef08a]" />
          </motion.div>
        )}

        {timeOfDay === "sunset" && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 1.0, ease: "easeOut" }}
            className="absolute bottom-[100px] right-[20%] w-24 h-24 z-4 pointer-events-none flex items-center justify-center"
          >
            {/* Sun glow halo */}
            <div className="absolute inset-0 bg-orange-500/30 rounded-full blur-xl" />
            {/* Giant setting orange-red sun */}
            <div className="w-16 h-16 bg-gradient-to-t from-red-600 via-orange-500 to-amber-400 rounded-full shadow-[0_-5px_15px_#f59e0b]" />
          </motion.div>
        )}

        {timeOfDay === "night" && (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="absolute top-10 right-[15%] w-12 h-12 z-5 pointer-events-none flex items-center justify-center"
          >
            {/* Slender crescent moon using pure transparent box-shadow trick */}
            <div className="w-8 h-8 rounded-full bg-transparent shadow-[6px_6px_0_0_#fef08a] filter drop-shadow-[0_0_8px_rgba(254,240,138,0.7)]" />
          </motion.div>
        )}

        {/* 2. Distant Mountain/Hill Silhouettes for parallax depth */}
        <div className={`absolute bottom-[48px] left-0 right-0 h-28 opacity-25 overflow-hidden flex items-end transition-colors duration-1000 ${timeStyles[timeOfDay].hillColor}`}>
          <svg className="w-full h-full fill-current" viewBox="0 0 1000 100" preserveAspectRatio="none">
            <path d="M0,80 Q120,40 250,70 T500,50 T750,75 T1000,45 L1000,100 L0,100 Z" />
            <path d="M0,90 Q180,60 380,80 T700,70 T1000,85 L1000,100 L0,100 Z" className="opacity-70" />
          </svg>
        </div>

        {/* 3. Parallax Drifting Clouds */}
        <div className={`transition-opacity duration-1000 ${timeStyles[timeOfDay].cloudsOpacity}`}>
          <motion.div 
            animate={{ x: [-150, 420] }}
            transition={{ repeat: Infinity, duration: 42, ease: "linear" }}
            className={`absolute top-[35px] left-[-50px] w-32 h-7 rounded-full blur-md ${cloudColor}`}
          />
          <motion.div 
            animate={{ x: [420, -150] }}
            transition={{ repeat: Infinity, duration: 52, ease: "linear" }}
            className={`absolute top-[75px] right-[-50px] w-44 h-9 rounded-full blur-md ${cloudColor}`}
          />
          <motion.div 
            animate={{ x: [-80, 450] }}
            transition={{ repeat: Infinity, duration: 34, ease: "linear" }}
            className={`absolute top-[120px] left-[10%] w-24 h-6 rounded-full blur-md ${cloudColor}`}
          />
        </div>

        {/* Distant school outline and trees */}
        <div className="absolute bottom-[48px] left-[45%] w-20 h-16 opacity-20 border-b border-white/5 flex flex-col justify-end">
          {/* Simple classic school building silhouette */}
          <div className="w-14 h-10 bg-slate-700/80 rounded-t-sm relative mx-auto">
            <div className="absolute top-[-6px] left-[17px] w-6 h-6 bg-slate-600/90 rotate-45 border-l border-t border-slate-500" />
            <div className="absolute top-1 left-2 w-2 h-2 bg-yellow-400/30 rounded-xs" />
            <div className="absolute top-1 right-2 w-2 h-2 bg-yellow-400/30 rounded-xs" />
          </div>
          <div className="absolute bottom-0 left-[68px] w-6 h-8 bg-slate-800/90 rounded-full" />
          <div className="absolute bottom-0 left-[18px] w-5 h-6 bg-slate-800/90 rounded-full" />
        </div>
      </div>

      {/* Top Banner Controls */}
      <div className="z-10 w-full flex items-center justify-between gap-2 flex-wrap">
        <motion.div
          initial={{ opacity: 0, x: -15 }}
          animate={{ opacity: 1, x: 0 }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 transition-colors rounded-full text-[10px] font-black uppercase tracking-widest border ${timeStyles[timeOfDay].badge}`}
        >
          <GraduationCap className="w-3.5 h-3.5" /> Admission Journey
        </motion.div>

        {/* Dynamic Weather switcher */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-1 bg-black/15 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-inner"
        >
          {(["morning", "afternoon", "sunset", "night"] as const).map((t) => {
            const emojis = {
              morning: "🌅",
              afternoon: "☀️",
              sunset: "🌇",
              night: "🌌"
            };
            const labels = {
              morning: "Morning",
              afternoon: "Noon",
              sunset: "Sunset",
              night: "Night"
            };
            const isActive = timeOfDay === t;
            return (
              <button
                key={t}
                onClick={(e) => {
                  e.stopPropagation();
                  setTimeOfDay(t);
                }}
                title={`Switch to ${labels[t]}`}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold tracking-tight transition-all cursor-pointer select-none ${
                  isActive
                    ? "bg-white/20 text-white shadow-xs border border-white/10 scale-105"
                    : "text-white/65 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
              >
                <span>{emojis[t]}</span>
                <span className="hidden md:inline text-[8px] uppercase font-black">{labels[t]}</span>
              </button>
            );
          })}
        </motion.div>

        {/* Replay Button */}
        <motion.button
          initial={{ opacity: 0, x: 15 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ scale: 1.1, rotate: 180 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleReplay}
          title="Replay Animation"
          className={`p-2.5 rounded-full cursor-pointer transition-all shadow-md flex items-center justify-center border ${timeStyles[timeOfDay].badge}`}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </motion.button>
      </div>

      {/* Main Announcement Header */}
      <div className="z-10 text-center space-y-1.5 max-w-lg mt-1">
        <motion.h2
          key={`header-${triggerReplay}`}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className={`text-2xl sm:text-3xl font-extrabold uppercase tracking-tight leading-tight font-sans transition-colors duration-1000 ${timeStyles[timeOfDay].textTitle}`}
        >
          Shikshantar Academy
        </motion.h2>
        
        <motion.p
          key={`text-${triggerReplay}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.9 }}
          transition={{ duration: 0.55, delay: 0.15 }}
          className={`text-xs leading-relaxed max-w-md mx-auto transition-colors duration-1000 ${timeStyles[timeOfDay].textSubtitle}`}
        >
          Watch our digital student board the school bus to start her joyful learning adventure!
        </motion.p>
      </div>

      {/* ---------------- STAGE ENVIRONMENT AREA ---------------- */}
      <div className="relative z-10 w-full flex-1 flex flex-col items-center justify-center min-h-[240px] overflow-visible">
        
        {/* A. Sidewalk & Curb */}
        <div className={`absolute bottom-[34px] left-0 right-0 h-4 bg-gradient-to-b ${timeStyles[timeOfDay].curbColor} z-6 flex items-center overflow-hidden transition-all duration-1000`}>
          {/* Concrete joint divisions */}
          <div className="w-full h-full flex justify-between px-4 opacity-15">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="w-[1.5px] bg-black h-full" />
            ))}
          </div>
          {/* Yellow Tactile / Safety Paving tiles along the curb */}
          <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-[#eab308]/60 flex justify-between">
            {[...Array(60)].map((_, i) => (
              <div key={i} className="w-[1px] bg-[#854d0e] h-full" />
            ))}
          </div>
        </div>

        {/* B. Asphalt Road */}
        <div className={`absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-b ${timeStyles[timeOfDay].roadColor} rounded-b-xl z-5 overflow-hidden transition-all duration-1000`}>
          {/* Yellow Dashed Center Divider Line */}
          <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-0.5 border-t border-dashed border-yellow-500/30" />
          
          {/* Realistic Zebra Crossing / Crosswalk stripes at the bus stop */}
          <div className="absolute right-8 top-0 bottom-0 w-20 flex justify-between z-6 opacity-35">
            <div className="w-2.5 h-full bg-white skew-x-[-15deg]" />
            <div className="w-2.5 h-full bg-white skew-x-[-15deg]" />
            <div className="w-2.5 h-full bg-white skew-x-[-15deg]" />
            <div className="w-2.5 h-full bg-white skew-x-[-15deg]" />
          </div>
        </div>

        {/* Animated reflection puddle with expanding ripple rings near the shelter */}
        <div className="absolute bottom-[6px] left-[110px] w-12 h-2.5 bg-sky-400/10 rounded-full border border-sky-300/15 z-6 filter blur-[0.4px] overflow-hidden flex items-center justify-center">
          <motion.div
            animate={{ scale: [0.2, 1], opacity: [0.8, 0] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: "easeOut" }}
            className="w-8 h-2 border border-sky-300/25 rounded-full"
          />
          <motion.div
            animate={{ scale: [0.2, 1], opacity: [0.8, 0] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: "easeOut", delay: 1.1 }}
            className="w-8 h-2 border border-sky-300/25 rounded-full"
          />
        </div>

        {/* C. Modern Bus Stop Shelter with Wooden Bench (Background environment) */}
        <div className="absolute bottom-[38px] left-[70px] z-10 w-48 h-32 flex flex-col items-center justify-end">
          {/* Steel support pillars */}
          <div className="absolute left-2 bottom-0 w-1.5 h-[80px] bg-gradient-to-r from-slate-400 to-slate-500 shadow-xs border-r border-slate-600" />
          <div className="absolute right-2 bottom-0 w-1.5 h-[80px] bg-gradient-to-r from-slate-400 to-slate-500 shadow-xs border-r border-slate-600" />
          
          {/* Glass back-panel panels */}
          <div className="absolute bottom-1 w-[160px] h-[74px] bg-white/5 backdrop-blur-[1px] rounded-sm border border-white/10 overflow-hidden flex items-center justify-center">
            {/* Diagonal glossy glass sheen */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-60" />
            {/* Soft glowing bus route billboard poster */}
            <div className="w-8 h-12 bg-sky-500/10 border border-sky-400/25 rounded-xs p-1 flex flex-col justify-between items-center text-[4px] font-bold text-sky-300">
              <span className="leading-none tracking-widest text-[#F0A500]">ROUTE</span>
              <div className="w-full bg-sky-300/20 h-[1px] my-[1px]" />
              <div className="w-full space-y-[2px]">
                <div className="w-full h-[2px] bg-sky-200/45 rounded-2xs" />
                <div className="w-3/4 h-[2px] bg-sky-200/45 rounded-2xs" />
                <div className="w-4/5 h-[2px] bg-sky-200/45 rounded-2xs" />
              </div>
              <div className="w-1.5 h-1.5 bg-[#e11d48] rounded-full shadow-[0_0_3px_#e11d48]" />
            </div>
          </div>

          {/* Wooden Bench planks for child to sit/wait by */}
          <div className="absolute bottom-1 left-6 right-6 h-5 flex flex-col justify-between z-11">
            {/* Seat board */}
            <div className="w-full h-1.5 bg-gradient-to-b from-amber-700 to-amber-900 rounded-sm border-b border-amber-950 shadow-md" />
            {/* Support legs */}
            <div className="w-full flex justify-around px-2">
              <div className="w-1.5 h-3 bg-slate-600 rounded-b-xs" />
              <div className="w-1.5 h-3 bg-slate-600 rounded-b-xs" />
            </div>
          </div>

          {/* Curved steel shelter roof canopy */}
          <div className="absolute bottom-[80px] w-[180px] h-3 bg-gradient-to-b from-slate-300 via-slate-400 to-slate-500 rounded-t-lg shadow-md border-b border-slate-600 flex items-center justify-between px-4">
            <div className="w-1 h-1 bg-amber-400/80 rounded-full" />
            <div className="w-1 h-1 bg-amber-400/80 rounded-full" />
          </div>
        </div>

        {/* D. Vintage Street Lamp with warm projection glow cone */}
        <div className="absolute bottom-[38px] left-[45px] z-11 w-12 h-[124px] flex flex-col items-center justify-end pointer-events-none">
          {/* Post base */}
          <div className="w-4 h-3.5 bg-gradient-to-r from-slate-700 to-slate-800 rounded-t-md border border-slate-600" />
          {/* Pole */}
          <div className="w-1 h-[106px] bg-gradient-to-r from-slate-400 via-slate-500 to-slate-600 shadow-inner" />
          {/* Curved lamp arm and head */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-4">
            <div className="w-6 h-1 bg-slate-500 absolute top-1 left-1.5 rounded-full" />
            {/* Lamp fixture head */}
            <div className="w-5 h-3.5 bg-gradient-to-b from-slate-300 to-slate-500 rounded-full absolute top-1.5 left-2 border border-slate-400" />
            {/* Glowing amber bulb */}
            <div className={`w-3.5 h-1.5 rounded-full absolute top-[4px] left-[11px] transition-all duration-1000 ${timeStyles[timeOfDay].lampGlow}`} />
          </div>

          {/* Projected Light Cone overlay on stage */}
          <div 
            className={`absolute top-[14px] left-[-4px] w-18 h-[92px] bg-gradient-to-b from-yellow-300/35 via-yellow-300/10 to-transparent z-7 transition-all duration-1000 ${timeStyles[timeOfDay].lampCone}`}
            style={{
              clipPath: "polygon(38% 0%, 62% 0%, 100% 100%, 0% 100%)"
            }}
          />

          {/* Floating glowing light particles / dust motes under the street lamp */}
          {(timeOfDay === "night" || timeOfDay === "sunset") && (
            <div className="absolute inset-0 z-8">
              {[...Array(4)].map((_, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 80, x: 10 + idx * 6 }}
                  animate={{
                    opacity: [0, 0.7, 0.7, 0],
                    y: [80, 20],
                    x: [10 + idx * 6, 5 + idx * 6 + (idx % 2 === 0 ? 4 : -4)]
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 3 + idx,
                    delay: idx * 0.7,
                    ease: "easeInOut"
                  }}
                  className="absolute w-[2px] h-[2px] bg-yellow-200 rounded-full shadow-[0_0_4px_#fef08a]"
                />
              ))}
            </div>
          )}
        </div>

        {/* Layered Animated Street Tree sways gently in the wind */}
        <div className="absolute bottom-[38px] left-[12px] z-10 w-20 h-36 flex flex-col items-center justify-end pointer-events-none">
          {/* Trunk */}
          <div className="w-2.5 h-16 bg-gradient-to-r from-stone-700 to-stone-800 rounded-t-full shadow-inner" />
          
          {/* Swaying Foliage Layers with slight parallax offsets */}
          <motion.div
            animate={{ rotate: [-2, 3, -2], y: [0, -1, 0] }}
            transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }}
            className="absolute bottom-12 w-14 h-14 bg-gradient-to-br from-emerald-600 via-emerald-700 to-green-800 rounded-full shadow-md opacity-90"
          >
            {/* Highlights */}
            <div className="absolute top-1.5 left-2 w-8 h-8 bg-emerald-500/25 rounded-full" />
          </motion.div>
          <motion.div
            animate={{ rotate: [3, -2, 3], y: [0, 1, 0] }}
            transition={{ repeat: Infinity, duration: 5.2, ease: "easeInOut", delay: 0.5 }}
            className="absolute bottom-16 w-11 h-11 bg-gradient-to-br from-emerald-500 via-green-600 to-green-700 rounded-full shadow-md opacity-95"
          />
          <motion.div
            animate={{ rotate: [-1, 2, -1] }}
            transition={{ repeat: Infinity, duration: 3.8, ease: "easeInOut", delay: 1.0 }}
            className="absolute bottom-20 w-8 h-8 bg-gradient-to-br from-teal-400 via-emerald-500 to-emerald-600 rounded-full shadow-md"
          />
        </div>

        {/* E. Classic round Bus Stop Signpost */}
        <div className="absolute bottom-[38px] left-[190px] z-12 flex flex-col items-center">
          {/* Circular Sign */}
          <div className="w-8 h-8 bg-[#e11d48] border-2 border-white rounded-full flex flex-col items-center justify-center text-white shadow-lg">
            <span className="text-[5.5px] font-black leading-none tracking-tight">BUS</span>
            <span className="text-[5.5px] font-black leading-none mt-0.5 tracking-tight">STOP</span>
          </div>
          {/* Signpost Pole */}
          <div className="w-1 h-20 bg-gradient-to-r from-slate-400 to-slate-600 shadow-inner" />
          {/* Stone Base */}
          <div className="w-4 h-1.5 bg-slate-700 rounded-t-full border border-slate-600" />
        </div>

        {/* F. Grass and botanical details around shelter base */}
        <div className="absolute bottom-[38px] left-[25px] z-12 flex gap-1 items-end pointer-events-none opacity-80">
          <div className="w-2 h-4 bg-emerald-800/80 rounded-t-full rotate-[-12deg] origin-bottom" />
          <div className="w-1.5 h-3 bg-emerald-700/80 rounded-t-full rotate-[8deg] origin-bottom" />
        </div>
        <div className="absolute bottom-[38px] left-[150px] z-12 flex gap-1 items-end pointer-events-none opacity-80">
          <div className="w-2.5 h-3 bg-emerald-800/80 rounded-t-full rotate-[15deg] origin-bottom" />
          <div className="w-2 h-4.5 bg-emerald-700/80 rounded-t-full rotate-[-8deg] origin-bottom" />
          {/* Tiny red blossom */}
          <div className="w-1 h-1 bg-red-400 rounded-full mb-3 ml-[-5px]" />
        </div>


        {/* ---------------- 1. DETAILED ANIMATED CHILD CHARACTER ---------------- */}
        <motion.div
          key={`character-${triggerReplay}`}
          className="absolute bottom-[34px] flex flex-col items-center w-32 h-[146px]"
          style={{ transformOrigin: "bottom center" }}
          initial={{ x: "-220px", opacity: 1, scale: 0.48, y: 0, rotate: 0, zIndex: 20 }}
          animate={
            animationStep === "walking" 
              ? { x: "-65px", opacity: 1, scale: 0.48, y: 0, rotate: 0, zIndex: 20 } 
              : animationStep === "waiting" || animationStep === "bus-arriving"
              ? { x: "-65px", opacity: 1, scale: 0.48, y: 0, rotate: 0, zIndex: 20 }
              : animationStep === "climbing"
              ? {
                  x: ["-65px", "-65px", "84px", "86px", "88px"], // Waits for doors to fully slide open first, then walks and steps in
                  y: [0, 0, -6, -22, -36], // Steps off curb (-6px) and climbs up the high bus stairs (-22px, -36px)
                  scale: [0.48, 0.48, 0.48, 0.3, 0.18], // Recedes into the interior (perspective)
                  opacity: [1, 1, 1, 0.8, 0], // Fades out as she enters behind the side panels
                  rotate: [0, 0, 5, 8, 0], // Leans forward naturally as she climbs up
                  zIndex: [20, 20, 20, 15, 15], // Steps behind the bus panels as she enters
                }
              : { x: "88px", opacity: 0, scale: 0.18, y: -36, rotate: 0, zIndex: 15 }
          }
          transition={
            animationStep === "walking"
              ? { duration: 3.0, ease: "linear" }
              : animationStep === "climbing"
              ? { 
                  duration: 1.5, 
                  times: [0, 0.25, 0.75, 0.9, 1.0], // precise timing for waiting -> walk to door -> step -> board
                  ease: "easeInOut" 
                }
              : { duration: 0.2 }
          }
        >
          {/* Dynamic Ground Shadow below child */}
          <motion.div
            animate={
              animationStep === "walking"
                ? { scale: [0.93, 1.07, 0.93], opacity: [0.55, 0.4, 0.55] }
                : animationStep === "climbing"
                ? { scale: [1, 0.7, 0.3, 0], opacity: [0.5, 0.35, 0.1, 0] }
                : { scale: 1, opacity: 0.5 }
            }
            transition={
              animationStep === "climbing"
                ? { duration: 1.5, times: [0, 0.7, 0.85, 1.0], ease: "easeInOut" }
                : { repeat: Infinity, duration: 0.22, ease: "easeInOut" }
            }
            className="absolute bottom-[-4px] w-10 h-2 bg-black/50 rounded-full filter blur-[1px] z-5 pointer-events-none"
          />

          {/* Bobbing / Breathing Character Body Wrapper */}
          <motion.div
            variants={animationStep === "walking" ? bodyBob : bodyBreath}
            animate="animate"
            className="relative flex flex-col items-center h-[146px] w-12 mx-auto"
          >
            {/* A. Rich Neat Black/Dark-Brown Braided Hair */}
            {/* Back hair bowl base */}
            <div className="absolute top-[-7px] w-14 h-12 bg-gradient-to-b from-[#241c18] via-[#1a1310] to-[#0c0806] rounded-full z-10 shadow-sm left-[-4px]" />
            <div className="absolute top-[-4px] left-[-2.5px] w-5.5 h-6 bg-[#241c18] rounded-full z-10 rotate-12" />
            <div className="absolute top-[-4px] right-[-2.5px] w-5.5 h-6 bg-[#241c18] rounded-full z-10 -rotate-12" />
            
            {/* Realistic swinging braided twin pigtails low on the sides */}
            <motion.div
              animate={animationStep === "walking" ? { rotate: [-12, 12, -12] } : { rotate: [-3, 3, -3] }}
              transition={{ repeat: Infinity, duration: 0.8, ease: "easeInOut" }}
              style={{ transformOrigin: "top right" }}
              className="absolute left-[-16px] top-[22px] w-[24px] h-[34px] z-8 flex flex-col items-end"
            >
              {/* Braid links */}
              <div className="w-5 h-4 bg-[#1a1310] rounded-full -mb-1 rotate-12" />
              <div className="w-4 h-4 bg-[#0c0806] rounded-full -mb-1 -rotate-12 mr-1" />
              <div className="w-3.5 h-3.5 bg-[#050302] rounded-full mr-2" />
              {/* Sweet Red Ribbon Bow */}
              <div className="absolute right-[5px] bottom-[2px] w-4 h-2.5 flex items-center justify-center relative">
                <div className="w-2 h-2 bg-red-600 rounded-full rotate-45 absolute left-[2px]" />
                <div className="w-2 h-2 bg-red-600 rounded-full -rotate-45 absolute right-[2px]" />
                <div className="w-1.2 h-1.2 bg-red-700 rounded-full z-10" />
              </div>
            </motion.div>

            <motion.div
              animate={animationStep === "walking" ? { rotate: [12, -12, 12] } : { rotate: [3, -3, 3] }}
              transition={{ repeat: Infinity, duration: 0.8, ease: "easeInOut" }}
              style={{ transformOrigin: "top left" }}
              className="absolute right-[-16px] top-[22px] w-[24px] h-[34px] z-8 flex flex-col items-start"
            >
              {/* Braid links */}
              <div className="w-5 h-4 bg-[#1a1310] rounded-full -mb-1 -rotate-12" />
              <div className="w-4 h-4 bg-[#0c0806] rounded-full -mb-1 rotate-12 ml-1" />
              <div className="w-3.5 h-3.5 bg-[#050302] rounded-full ml-2" />
              {/* Sweet Red Ribbon Bow */}
              <div className="absolute left-[5px] bottom-[2px] w-4 h-2.5 flex items-center justify-center relative">
                <div className="w-2 h-2 bg-red-600 rounded-full rotate-45 absolute left-[2px]" />
                <div className="w-2 h-2 bg-red-600 rounded-full -rotate-45 absolute right-[2px]" />
                <div className="w-1.2 h-1.2 bg-red-700 rounded-full z-10" />
              </div>
            </motion.div>

            {/* Fringe bangs */}
            <div className="absolute top-[1px] left-[5px] right-[5px] h-[14px] flex z-23">
              <div className="w-4 h-4 bg-[#1a1310] rounded-[0_0_100%_0] rotate-12 -ml-1" />
              <div className="w-5 h-4 bg-[#1a1310] rounded-[0_0_100%_100%] mx-auto" />
              <div className="w-4 h-4 bg-[#1a1310] rounded-[0_0_0_100%] -rotate-12 -mr-1" />
            </div>

            {/* Glossy 3D crown light highlight streak - multi layered */}
            <div className="absolute top-[-5px] w-10 h-3 bg-white/15 rounded-full z-12 blur-[0.4px]" />
            <div className="absolute top-[-3.5px] w-6 h-1.5 bg-white/25 rounded-full z-12 blur-[0.3px]" />

            {/* B. Fully Realistic Human-Shaped Cute Cartoon Face (Contoured cheeks, soft skin tones) */}
            <div className="w-[50px] h-[58px] bg-gradient-to-b from-[#fef4e8] via-[#fcdbb2] to-[#fbc38d] rounded-[24px_24px_21px_21px] relative z-20 border border-amber-900/20 flex items-center justify-center shadow-md">
              
              {/* 3D-shaped fleshy ears with inner helix contours */}
              <div className="absolute left-[-4px] top-[21px] w-1.8 h-3.5 bg-gradient-to-l from-[#fcdcb2] to-[#e4a86e] rounded-full border-l border-amber-900/15 rotate-12 z-19 flex items-center justify-start pl-[0.5px]">
                <div className="w-[1px] h-1.5 bg-[#d4a373] rounded-full" /> {/* Inner tragus fold */}
              </div>
              <div className="absolute right-[-4px] top-[21px] w-1.8 h-3.5 bg-gradient-to-r from-[#fcdcb2] to-[#e4a86e] rounded-full border-r border-amber-900/15 -rotate-12 z-19 flex items-center justify-end pr-[0.5px]">
                <div className="w-[1px] h-1.5 bg-[#d4a373] rounded-full" />
              </div>

              {/* Cute stray middle hair lock */}
              <div className="absolute top-[12px] left-[23px] w-1.2 h-3.5 bg-[#1a1310] rounded-b-full z-22 rotate-[-5deg]" />

              {/* Tiny curved button human nose with specular glow tip */}
              <div className="absolute top-[34px] w-1.8 h-1.8 bg-[#d4a373]/80 rounded-full z-22 flex items-center justify-center border border-amber-950/5">
                <div className="w-0.5 h-0.5 bg-white/40 rounded-full absolute top-[0.5px] left-[0.5px]" />
              </div>

              {/* Double Eyelid Crease above eyes for extreme 3D cartoon realism */}
              <div className="absolute top-[15px] left-[8px] w-3 h-[1px] bg-[#9a3412]/35 rounded-full z-22" />
              <div className="absolute top-[15px] right-[8px] w-3 h-[1px] bg-[#9a3412]/35 rounded-full z-22" />

              {/* Studious Cute Black-Rimmed Round Glasses */}
              <div className="absolute top-[15px] left-[3px] right-[3px] h-[22px] flex items-center justify-between z-22 pointer-events-none">
                {/* Left Lens */}
                <div className="w-[21px] h-[21px] border-2 border-stone-900 rounded-full bg-white/5 backdrop-blur-[0.5px] shadow-xs relative">
                  {/* Subtle glass glare */}
                  <div className="w-4 h-4 bg-gradient-to-tr from-transparent via-white/15 to-transparent absolute inset-0 rounded-full" />
                </div>
                {/* Bridge */}
                <div className="w-[4px] h-[2px] bg-stone-900 rounded-full -mx-[1px]" />
                {/* Right Lens */}
                <div className="w-[21px] h-[21px] border-2 border-stone-900 rounded-full bg-white/5 backdrop-blur-[0.5px] shadow-xs relative">
                  <div className="w-4 h-4 bg-gradient-to-tr from-transparent via-white/15 to-transparent absolute inset-0 rounded-full" />
                </div>
              </div>

              {/* Highly Detailed Almond Anime/Cartoon Eyes (Multi-tone brown iris & glossy specular highlights) */}
              <div className="absolute top-[18px] left-[7px] flex gap-3.5 z-21">
                {/* Left Pupil / Eye */}
                <div className="w-[15px] h-[16.5px] bg-white rounded-[45%_45%_35%_35%] relative overflow-hidden border border-amber-950/20 shadow-inner flex items-center justify-center">
                  {blink ? (
                    <div className="absolute inset-0 bg-[#fcdcb2] border-b-2 border-amber-950/35" />
                  ) : (
                    /* Detailed brown iris */
                    <div className="absolute inset-0 bg-gradient-to-t from-[#2a1708] via-[#451a03] to-[#120a05] rounded-[45%] scale-[0.92] flex items-center justify-center">
                      {/* Iris gold-amber lighter ring at bottom for depth */}
                      <div className="absolute bottom-[0.5px] w-[10px] h-2 bg-gradient-to-t from-[#d97706]/40 to-transparent rounded-full" />
                      
                      {/* Core black pupil */}
                      <motion.div 
                        animate={
                          animationStep === "waiting" || animationStep === "bus-arriving"
                            ? { x: 1.2, y: -0.3 }
                            : { x: 0, y: 0 }
                        }
                        transition={{ duration: 0.3 }}
                        className="w-[7px] h-2.5 bg-[#030712] rounded-full relative"
                      >
                        {/* Primary shiny reflection (top-right) */}
                        <div className="absolute top-[0.5px] right-[0.5px] w-[3px] h-[3px] bg-white rounded-full shadow-xs" />
                        {/* Secondary soft reflection (bottom-left) */}
                        <div className="absolute bottom-[0.5px] left-[0.5px] w-[1.5px] h-[1.5px] bg-white/75 rounded-full" />
                      </motion.div>
                    </div>
                  )}
                </div>
                {/* Right Pupil / Eye */}
                <div className="w-[15px] h-[16.5px] bg-white rounded-[45%_45%_35%_35%] relative overflow-hidden border border-amber-950/20 shadow-inner flex items-center justify-center">
                  {blink ? (
                    <div className="absolute inset-0 bg-[#fcdcb2] border-b-2 border-amber-950/35" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-t from-[#2a1708] via-[#451a03] to-[#120a05] rounded-[45%] scale-[0.92] flex items-center justify-center">
                      <div className="absolute bottom-[0.5px] w-[10px] h-2 bg-gradient-to-t from-[#d97706]/40 to-transparent rounded-full" />
                      
                      <motion.div 
                        animate={
                          animationStep === "waiting" || animationStep === "bus-arriving"
                            ? { x: 1.2, y: -0.3 }
                            : { x: 0, y: 0 }
                        }
                        transition={{ duration: 0.3 }}
                        className="w-[7px] h-2.5 bg-[#030712] rounded-full relative"
                      >
                        {/* Primary shiny reflection */}
                        <div className="absolute top-[0.5px] right-[0.5px] w-[3px] h-[3px] bg-white rounded-full shadow-xs" />
                        {/* Secondary soft reflection */}
                        <div className="absolute bottom-[0.5px] left-[0.5px] w-[1.5px] h-[1.5px] bg-white/75 rounded-full" />
                      </motion.div>
                    </div>
                  )}
                </div>
              </div>

              {/* Upper natural neat eyelashes compliant with school rules */}
              <div className="absolute top-[17px] left-[7px] flex gap-[14px] z-22">
                <div className="w-[15px] h-[1.5px] bg-[#2a1708] rounded-full rotate-[4deg] relative" />
                <div className="w-[15px] h-[1.5px] bg-[#2a1708] rounded-full -rotate-[4deg] relative" />
              </div>

              {/* Expressive delicate eyebrows */}
              <motion.div 
                animate={animationStep === "bus-arriving" ? { y: -1.2, rotate: -2 } : { y: 0, rotate: 0 }}
                className="absolute top-[11px] left-[7.5px] flex gap-[14px] z-21"
              >
                <div className="w-4 h-[1.5px] bg-[#2a1708] rounded-full rotate-3" />
                <div className="w-4 h-[1.5px] bg-[#2a1708] rounded-full -rotate-3" />
              </motion.div>
              
              {/* Joyful open mouth with small white teeth row and pink tongue */}
              <div className="absolute bottom-[7px] w-5.5 h-4.8 bg-[#751111] rounded-b-full overflow-hidden border border-amber-950/20 z-22 flex flex-col justify-between shadow-xs">
                {/* Teeth row (tiny white line) */}
                <div className="w-full h-[1.8px] bg-white rounded-b-2xs shadow-xs" />
                {/* Tongue (bright pink) */}
                <div className="w-[15px] h-[6.5px] bg-[#ff7b7b] rounded-full mx-auto mb-[-1.5px] shadow-xs" />
              </div>

              {/* Delicate rosy airbrushed blushing cheeks with specular highlight gloss points */}
              <div className="absolute bottom-[11px] left-[3.5px] w-3.5 h-2.5 bg-rose-400/40 rounded-full blur-[0.8px] z-21 flex items-center justify-center">
                <div className="w-[1.2px] h-[1.2px] bg-white/60 rounded-full mb-[0.5px] ml-[0.5px]" />
              </div>
              <div className="absolute bottom-[11px] right-[3.5px] w-3.5 h-2.5 bg-rose-400/40 rounded-full blur-[0.8px] z-21 flex items-center justify-center">
                <div className="w-[1.2px] h-[1.2px] bg-white/60 rounded-full mb-[0.5px] mr-[0.5px]" />
              </div>
            </div>

            {/* Neck */}
            <div className="w-3.5 h-1.5 bg-gradient-to-b from-[#fcdcb2] to-[#f7be7e] relative z-10" />

            {/* C. School Uniform Pinafore Dress (Navy Blue with White blouse, gold buttons) */}
            <div className="w-[44px] h-[54px] bg-gradient-to-b from-[#1e3a8a] via-[#1e40af] to-[#172554] rounded-[14px_14px_8px_8px] relative z-15 border border-blue-900/40 flex flex-col items-center pt-2 px-1 shadow-md overflow-hidden">
              {/* White Peter Pan Collar with rich borders */}
              <div className="w-10 h-3 bg-white rounded-full border border-slate-200/80 shadow-xs flex justify-between px-0.5 absolute top-[-1px] z-18">
                <div className="w-[18px] h-2.5 bg-white rounded-b-full border-r border-slate-100 shadow-2xs rotate-[12deg] origin-top-left" />
                <div className="w-[18px] h-2.5 bg-white rounded-b-full border-l border-slate-100 shadow-2xs -rotate-[12deg] origin-top-right" />
              </div>

              {/* Red tie knot and mini ribbon with trailing ends */}
              <div className="absolute top-[3px] w-2.5 h-6 bg-[#dc2626] rounded-b-sm z-21 border border-red-700/20 shadow-xs flex flex-col items-center">
                <div className="w-3.5 h-1.5 bg-[#ef4444] rounded-sm shadow-2xs" />
                <div className="w-2 h-4 bg-gradient-to-b from-[#dc2626] to-[#b91c1c] rounded-b-md" />
              </div>

              {/* Pinafore braces / shoulder straps (Navy Blue matching the pinafore) */}
              <div className="absolute left-[5px] inset-y-0 w-2 bg-gradient-to-b from-[#1e3a8a] to-[#172554] border-r border-blue-900/30 z-19 shadow-xs" />
              <div className="absolute right-[5px] inset-y-0 w-2 bg-gradient-to-b from-[#1e3a8a] to-[#172554] border-l border-blue-900/30 z-19 shadow-xs" />

              {/* Gold Buttons on straps */}
              <div className="absolute top-[16px] left-[5px] w-1.2 h-1.2 bg-gradient-to-br from-yellow-300 to-amber-500 rounded-full border border-yellow-200 z-20 shadow-2xs" />
              <div className="absolute top-[16px] right-[5px] w-1.2 h-1.2 bg-gradient-to-br from-yellow-300 to-amber-500 rounded-full border border-yellow-200 z-20 shadow-2xs" />

              {/* Shiny gold academic crest / school badge on left lapel chest */}
              <div className="absolute top-[24px] left-[5px] w-2 h-2.5 bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-500 rounded-b-md border border-yellow-200 z-20 shadow-2xs flex items-center justify-center">
                <div className="w-1 h-1 bg-white rounded-full scale-50" />
              </div>

              {/* Authentic School ID Lanyard & Laminated Badge Card */}
              <div className="absolute top-[2px] inset-x-0 flex flex-col items-center z-22 pointer-events-none">
                {/* ID Card Lanyard cord loop hanging from neck */}
                <div className="w-[18px] h-[16px] border-b border-x border-blue-600/90 rounded-b-full absolute top-[1px] z-21" />
                {/* Laminated Student ID Badge card */}
                <div className="w-[12px] h-[16.5px] bg-white border border-slate-300 rounded-[2px] shadow-2xs flex flex-col items-center p-[0.5px] absolute top-[15px] z-23">
                  {/* Blue institution banner */}
                  <div className="w-full h-[2.5px] bg-blue-600 rounded-[1px_1px_0_0]" />
                  {/* Student photo area */}
                  <div className="w-[5px] h-[5px] bg-slate-800 rounded-[0.5px] mt-[1px] self-start ml-[0.5px]" />
                  {/* Micro student details text lines */}
                  <div className="w-[8px] h-[0.6px] bg-blue-500 mt-[1px]" />
                  <div className="w-[6px] h-[0.6px] bg-slate-400 mt-[0.5px]" />
                </div>
              </div>



              {/* School belt and buckle details */}
              <div className="absolute bottom-[10px] inset-x-0 h-2 bg-stone-900 border-y border-stone-800 z-11 flex items-center justify-center">
                <div className="w-2.5 h-2 bg-gradient-to-b from-yellow-300 to-amber-500 rounded-xs border border-yellow-200 shadow-2xs" />
              </div>

              {/* Sweet Pleated School Skirt bottom half (Navy Blue matching) */}
              <div className="absolute bottom-0 inset-x-0 h-3 bg-gradient-to-b from-[#172554] to-[#0f172a] border-t border-blue-950/30 flex justify-around z-11">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-[6px] h-full bg-[#1e293b]/50 border-r border-blue-950/25" />
                ))}
              </div>
            </div>

            {/* D. School Uniform Blouse Sleeves & Detailed Hands with wave reaction */}
            {/* Left Arm & wave reaction */}
            <motion.div
              variants={
                animationStep === "bus-arriving" 
                  ? armWave 
                  : animationStep === "walking" 
                  ? armSwingLeft 
                  : animationStep === "climbing"
                  ? armClimbLeft
                  : undefined
              }
              animate="animate"
              style={{ transformOrigin: "top center" }}
              className="absolute left-[-5.5px] top-[53px] w-3 h-[41px] bg-gradient-to-b from-[#fcdcb2] to-[#fbc38d] rounded-full z-10 border border-amber-900/10"
            >
              {/* White Blouse Sleeve covering upper arm (School Uniform) */}
              <div className="absolute top-0 inset-x-0 h-[18px] bg-white border-b border-slate-200 rounded-t-full z-11 shadow-2xs" />

              {/* Tucked Realistic School Textbook under her left arm */}
              <div className="absolute top-[10px] left-[-7px] w-[18px] h-[22px] bg-gradient-to-br from-amber-400 via-amber-500 to-yellow-600 border border-amber-600 rounded-[2px_4px_4px_2px] z-12 shadow-md flex flex-col justify-between p-[2px] rotate-[15deg] origin-center">
                {/* Book Spine design */}
                <div className="absolute left-[0.5px] top-0 bottom-0 w-[2px] bg-amber-700/50 rounded-l-md" />
                {/* Pages edges */}
                <div className="absolute right-[1px] top-[1px] bottom-[1px] w-[2.5px] bg-white border-l border-amber-600/20 shadow-inner" />
                {/* Cute subject label tag on cover */}
                <div className="w-[10px] h-[3px] bg-white/70 rounded-[1px] mt-[3px] ml-[1px] flex items-center justify-center">
                  <div className="w-[6px] h-[1px] bg-amber-800 rounded-3xs scale-75" />
                </div>
                <div className="w-[10px] h-[1.5px] bg-amber-200/50 rounded-3xs mb-[2px] ml-[1px]" />
              </div>

              {/* Left Hand with individual small chubby finger definitions */}
              <div className="absolute bottom-0 w-3 h-3 bg-[#fbc38d] rounded-full flex items-center justify-center z-12">
                {/* Individual cute fingers */}
                <div className="absolute left-[-1.5px] bottom-1 w-[3px] h-[3px] bg-[#fbc38d] rounded-full" /> {/* Thumb */}
                <div className="absolute left-[0.5px] bottom-[-1px] w-[2.2px] h-[3px] bg-[#fbc38d] rounded-full rotate-[15deg]" /> {/* Index */}
                <div className="absolute left-[1.5px] bottom-[-0.5px] w-[2.2px] h-[3px] bg-[#fbc38d] rounded-full rotate-[30deg]" /> {/* Middle */}
              </div>
            </motion.div>

            {/* Right Arm */}
            <motion.div
              variants={
                animationStep === "walking" 
                  ? armSwingRight 
                  : animationStep === "climbing"
                  ? armClimbRight
                  : undefined
              }
              animate="animate"
              style={{ transformOrigin: "top center" }}
              className="absolute right-[-5.5px] top-[53px] w-3 h-[41px] bg-gradient-to-b from-[#fcdcb2] to-[#fbc38d] rounded-full z-10 border border-amber-900/10"
            >
              {/* White Blouse Sleeve covering upper arm (School Uniform) */}
              <div className="absolute top-0 inset-x-0 h-[18px] bg-white border-b border-slate-200 rounded-t-full z-11 shadow-2xs" />

              {/* Right Hand with individual finger definitions */}
              <div className="absolute bottom-0 w-3 h-3 bg-[#fbc38d] rounded-full flex items-center justify-center z-12">
                <div className="absolute right-[-1.5px] bottom-1 w-[3px] h-[3px] bg-[#fbc38d] rounded-full" /> {/* Thumb */}
                <div className="absolute right-[0.5px] bottom-[-1px] w-[2.2px] h-[3px] bg-[#fbc38d] rounded-full -rotate-[15deg]" /> {/* Index */}
                <div className="absolute right-[1.5px] bottom-[-0.5px] w-[2.2px] h-[3px] bg-[#fbc38d] rounded-full -rotate-[30deg]" /> {/* Middle */}
              </div>
            </motion.div>

            {/* E. Detailed Human Legs: Calf definitions, knee-high white socks, and buckled Mary-Janes */}
            {/* Left Leg */}
            <motion.div
              variants={
                animationStep === "walking" 
                  ? legSwingLeft 
                  : animationStep === "climbing"
                  ? legClimbLeft
                  : undefined
              }
              animate="animate"
              style={{ transformOrigin: "top center" }}
              className="absolute left-[5px] top-[102px] w-3 h-11 bg-gradient-to-b from-[#fcdcb2] to-[#fbc38d] rounded-b-md z-5"
            >
              {/* Calf contour shading at knee */}
              <div className="absolute inset-x-0 top-0.5 h-3 bg-[#e4a86e]/20 rounded-full" />
              
              {/* Knee-High Neat White School Socks (uniform requirement) */}
              <div className="absolute bottom-[3.5px] top-[10px] left-[-1px] right-[-1px] bg-white border-t border-slate-200 z-6 shadow-2xs">
                {/* Traditional Navy School Stripes at cuffs */}
                <div className="absolute top-[1px] inset-x-0 h-[0.8px] bg-[#1e3a8a]" />
                <div className="absolute top-[2px] inset-x-0 h-[0.8px] bg-[#1e3a8a]" />
              </div>

              {/* Buckled black school shoes (Mary-Janes style) */}
              <div className="absolute bottom-0 left-[-2px] w-5.5 h-3.5 bg-gradient-to-b from-stone-900 to-black rounded-md shadow-xs border-t border-white/20 flex flex-col justify-between px-[1px] pt-[0.5px] z-7">
                {/* Silver strap buckle */}
                <div className="w-1 h-1.5 bg-slate-200 border border-slate-300 rounded-2xs absolute left-[0.5px] top-1 z-10 shadow-3xs" />
                <div className="w-full flex justify-center">
                  <div className="w-3.5 h-[1.2px] bg-stone-850 rounded-full" />
                </div>
                <div className="w-full h-1.5 bg-[#111] rounded-b-md" />
              </div>
            </motion.div>

            {/* Right Leg */}
            <motion.div
              variants={
                animationStep === "walking" 
                  ? legSwingRight 
                  : animationStep === "climbing"
                  ? legClimbRight
                  : (animationStep === "waiting" || animationStep === "bus-arriving")
                  ? legTapRight
                  : undefined
              }
              animate="animate"
              style={{ transformOrigin: "top center" }}
              className="absolute right-[5px] top-[102px] w-3 h-11 bg-gradient-to-b from-[#fcdcb2] to-[#fbc38d] rounded-b-md z-5"
            >
              {/* Calf contour shading at knee */}
              <div className="absolute inset-x-0 top-0.5 h-3 bg-[#e4a86e]/20 rounded-full" />
              
              {/* Knee-High Neat White School Socks (uniform requirement) */}
              <div className="absolute bottom-[3.5px] top-[10px] left-[-1px] right-[-1px] bg-white border-t border-slate-200 z-6 shadow-2xs">
                {/* Traditional Navy School Stripes at cuffs */}
                <div className="absolute top-[1px] inset-x-0 h-[0.8px] bg-[#1e3a8a]" />
                <div className="absolute top-[2px] inset-x-0 h-[0.8px] bg-[#1e3a8a]" />
              </div>

              {/* Buckled black school shoes */}
              <div className="absolute bottom-0 left-[-1.5px] w-5.5 h-3.5 bg-gradient-to-b from-stone-900 to-black rounded-md shadow-xs border-t border-white/20 flex flex-col justify-between px-[1px] pt-[0.5px] z-7">
                <div className="w-1 h-1.5 bg-slate-200 border border-slate-300 rounded-2xs absolute right-[0.5px] top-1 z-10 shadow-3xs" />
                <div className="w-full flex justify-center">
                  <div className="w-3.5 h-[1.2px] bg-stone-850 rounded-full" />
                </div>
                <div className="w-full h-1.5 bg-[#111] rounded-b-md" />
              </div>
            </motion.div>


          </motion.div>
        </motion.div>


        {/* ---------------- 2. THE YELLOW SCHOOL BUS ---------------- */}
        <motion.div
          initial={{ x: "700px" }}
          animate={
            animationStep === "walking" || animationStep === "waiting"
              ? { x: "700px" }
              : animationStep === "bus-arriving" || animationStep === "climbing"
              ? { x: "20px" }
              : { x: "-700px" }
          }
          transition={
            animationStep === "bus-arriving"
              ? { duration: 2.5, ease: "easeOut" }
              : animationStep === "bus-departing"
              ? { duration: 2.5, ease: "easeIn" }
              : { duration: 0.3 }
          }
          className="absolute bottom-[8px] z-18 flex flex-col items-center select-none"
        >
          {/* Bus main chassis and body with suspension tilt and bobbing */}
          <motion.div
            animate={
              animationStep === "bus-arriving"
                ? {
                    y: [0, -6, 2, -2, 0], // Settling shock bounce when arriving
                    rotate: [0, -1.5, 0.5, -0.2, 0],
                  }
                : animationStep === "climbing"
                ? {
                    y: [0, 4, 3, 4, 0], // Sinks down slightly under weight of boarding student, then sways up
                    rotate: [0, 1.2, 0.8, 1.2, 0], // Tilts toward the right side door where student climbs!
                  }
                : animationStep === "bus-departing"
                ? {
                    y: [0, -2, 1, -1, 0],
                    rotate: [0, -1, 0],
                  }
                : { y: 0, rotate: 0 }
            }
            transition={
              animationStep === "bus-arriving"
                ? { delay: 1.8, duration: 0.9, ease: "easeOut" }
                : animationStep === "climbing"
                ? { delay: 0.1, duration: 1.4, ease: "easeInOut" }
                : { duration: 0.5 }
            }
            className="relative w-44 h-24 bg-transparent rounded-2xl border-2 border-amber-600/30 flex flex-col justify-between overflow-hidden shadow-xl"
          >
            {/* Split Yellow Bus Body Panels (creates a hollow transparent door cutout) */}
            {/* Left Main Body Panel */}
            <div className="absolute left-0 top-0 bottom-0 right-[36px] bg-gradient-to-b from-amber-400 via-yellow-400 to-amber-500 rounded-l-xl z-0" />
            {/* Right Side Panel */}
            <div className="absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-b from-amber-400 via-yellow-400 to-amber-500 rounded-r-xl z-0" />
            {/* Top Header Panel above the Door */}
            <div className="absolute left-[140px] right-[12px] top-0 h-[38px] bg-gradient-to-b from-amber-400 via-yellow-400 to-amber-500 z-0" />
            {/* Front Side Mirror protruding from left edge */}
            <div className="absolute top-4 left-[-6px] z-25 flex flex-col items-end">
              {/* Mirror metal bracket arm */}
              <div className="w-[7px] h-[1.5px] bg-slate-500 rounded-full" />
              {/* Rectangular mirror plate */}
              <div className="w-[4px] h-[12px] bg-gradient-to-b from-slate-400 to-slate-600 rounded-xs border-[0.5px] border-slate-700/50 flex items-center justify-center">
                {/* Shiny silver mirror glass highlight */}
                <div className="w-[1.8px] h-[10px] bg-sky-200/95 rounded-3xs shadow-inner" />
              </div>
            </div>

            {/* Top Roof Marker Lights */}
            <div className="absolute top-[-1px] left-3 w-1.5 h-[3px] bg-amber-400 rounded-b-sm shadow-[0_0_3px_#fbbf24]" />
            <div className="absolute top-[-1px] right-3 w-1.5 h-[3px] bg-red-500 rounded-b-sm shadow-[0_0_3px_#f87171]" />

            {/* Subtle metal panel seam division lines across the bus side */}
            <div className="absolute inset-y-0 left-[52px] w-[1px] bg-amber-600/20 z-5" />
            <div className="absolute inset-y-0 left-[110px] w-[1px] bg-amber-600/20 z-5" />

            {/* Header with warning lights */}
            <div className="w-full bg-[#1e293b] py-0.5 px-3 flex justify-between items-center text-[7px] font-black text-amber-400 tracking-widest border-b border-amber-500/20 font-mono">
              <span>★ SCHOOL BUS ★</span>
              <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full shadow-[0_0_4px_#ef4444]" />
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full shadow-[0_0_4px_#f59e0b]" />
              </div>
            </div>

            {/* Windows row with fully detailed waving students */}
            <div className="flex justify-around px-3 mt-1.5 z-10">
              {/* Driver Window */}
              <div className="w-9 h-7 bg-gradient-to-b from-slate-950 to-slate-900 rounded-md border border-amber-400/20 relative overflow-hidden flex items-end justify-center">
                <div className="w-5 h-5 bg-slate-400/30 rounded-full relative bottom-[-2px] border border-white/5" />
                <div className="absolute top-1 left-1 w-2 h-2 bg-sky-300/10 rounded-sm filter blur-[0.5px]" />
                {/* Windshield wiper line */}
                <div className="absolute bottom-[2px] left-[1px] w-4 h-[1px] bg-slate-700 origin-bottom-left rotate-[35deg]" />
              </div>

              {/* Passenger Window 1 - Detailed Boy Student */}
              <div className="w-9 h-7 bg-gradient-to-b from-slate-950 to-slate-900 rounded-md border border-amber-400/20 relative overflow-hidden flex items-end justify-center">
                {/* Shiny glass reflections */}
                <div className="absolute top-0 right-0 w-8 h-8 bg-white/10 rotate-45 translate-x-3 -translate-y-3 pointer-events-none z-10" />
                <div className="absolute top-[2px] left-[2px] w-2.5 h-1.5 bg-white/5 rounded-full filter blur-[0.5px] pointer-events-none z-10" />
                
                {/* Detailed Boy Student */}
                <div className="relative flex flex-col items-center bottom-[-2px] z-5 scale-90">
                  {/* Curly Hair */}
                  <div className="absolute top-[-4px] w-5 h-4 bg-gradient-to-b from-[#2d1b0f] to-[#120a05] rounded-full" />
                  <div className="absolute top-[-5px] left-[1px] w-2 h-2 bg-[#2d1b0f] rounded-full" />
                  <div className="absolute top-[-5px] right-[1px] w-2 h-2 bg-[#2d1b0f] rounded-full" />
                  
                  {/* Face */}
                  <div className="w-[18px] h-[20px] bg-gradient-to-b from-[#fcdcb2] to-[#fbc38d] rounded-full relative border border-amber-900/10 flex items-center justify-center">
                    {/* Tiny eyes */}
                    <div className="absolute top-[6px] left-[3px] w-1.2 h-1.5 bg-[#0a0502] rounded-full">
                      <div className="w-[0.5px] h-[0.5px] bg-white rounded-full absolute top-[0.2px] right-[0.2px]" />
                    </div>
                    <div className="absolute top-[6px] right-[3px] w-1.2 h-1.5 bg-[#0a0502] rounded-full">
                      <div className="w-[0.5px] h-[0.5px] bg-white rounded-full absolute top-[0.2px] right-[0.2px]" />
                    </div>
                    {/* Smiling Mouth */}
                    <div className="absolute bottom-[3px] w-2 h-1 border-b-2 border-amber-950/40 rounded-b-full" />
                  </div>
                  {/* Shirt collar */}
                  <div className="w-4 h-2 bg-[#ea580c] rounded-b-xs border-t border-white/20 flex justify-around px-[1px]">
                    <div className="w-1.5 h-1 bg-white rounded-b-full" />
                    <div className="w-1.5 h-1 bg-white rounded-b-full" />
                  </div>
                </div>

                {/* Highly Realistic Animated Waving Arm/Hand (waves to the boarding girl!) */}
                {(animationStep === "bus-arriving" || animationStep === "climbing" || animationStep === "waiting") && (
                  <motion.div
                    variants={windowStudentWave1}
                    animate="animate"
                    style={{ transformOrigin: "bottom center" }}
                    className="absolute right-[1px] bottom-[2px] w-1.8 h-[13px] bg-gradient-to-b from-[#fcdcb2] to-[#fbc38d] rounded-full z-15 border border-amber-900/10 flex items-start justify-center"
                  >
                    {/* Hand with tiny fingers waving high! */}
                    <div className="absolute top-[-1px] w-2.5 h-2.5 bg-[#fbc38d] rounded-full flex items-center justify-center">
                      <div className="w-1 h-1.5 bg-[#ea580c]/50 rounded-full absolute bottom-[-1.5px]" />
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Passenger Window 2 - Detailed Girl Student */}
              <div className="w-9 h-7 bg-gradient-to-b from-slate-950 to-slate-900 rounded-md border border-amber-400/20 relative overflow-hidden flex items-end justify-center">
                {/* Shiny glass reflections */}
                <div className="absolute top-0 right-0 w-8 h-8 bg-white/10 rotate-45 translate-x-3 -translate-y-3 pointer-events-none z-10" />
                <div className="absolute top-[2px] left-[2px] w-2.5 h-1.5 bg-white/5 rounded-full filter blur-[0.5px] pointer-events-none z-10" />
                
                {/* Detailed Girl Student */}
                <div className="relative flex flex-col items-center bottom-[-2px] z-5 scale-90">
                  {/* Hair buns */}
                  <div className="absolute top-[-4px] left-[-2px] w-2.5 h-2.5 bg-[#3f2314] rounded-full" />
                  <div className="absolute top-[-4px] right-[-2px] w-2.5 h-2.5 bg-[#3f2314] rounded-full" />
                  <div className="absolute top-[-3px] w-[19px] h-[13px] bg-gradient-to-b from-[#3f2314] to-[#1e1008] rounded-full" />
                  
                  {/* Face */}
                  <div className="w-[18px] h-[20px] bg-gradient-to-b from-[#ffedd5] to-[#fdbb2d]/25 bg-[#fed7aa] rounded-full relative border border-amber-900/10 flex items-center justify-center">
                    {/* Pink cheeks */}
                    <div className="absolute bottom-[4px] left-[1px] w-1 h-[5px] bg-rose-400/40 rounded-full" />
                    <div className="absolute bottom-[4px] right-[1px] w-1 h-[5px] bg-rose-400/40 rounded-full" />
                    {/* Eyes */}
                    <div className="absolute top-[6px] left-[3px] w-1.2 h-1.5 bg-[#0a0502] rounded-full">
                      <div className="w-[0.5px] h-[0.5px] bg-white rounded-full absolute top-[0.2px] right-[0.2px]" />
                    </div>
                    <div className="absolute top-[6px] right-[3px] w-1.2 h-1.5 bg-[#0a0502] rounded-full">
                      <div className="w-[0.5px] h-[0.5px] bg-white rounded-full absolute top-[0.2px] right-[0.2px]" />
                    </div>
                    {/* Cute open mouth */}
                    <div className="absolute bottom-[3px] w-2 h-1 bg-[#751111] rounded-b-full" />
                  </div>
                  {/* Pink collar dress */}
                  <div className="w-4 h-2 bg-[#db2777] rounded-b-xs border-t border-white/20 flex justify-around px-[1px]">
                    <div className="w-1.5 h-1 bg-white rounded-b-full" />
                    <div className="w-1.5 h-1 bg-white rounded-b-full" />
                  </div>
                </div>

                {/* Highly Realistic Animated Waving Arm/Hand */}
                {(animationStep === "bus-arriving" || animationStep === "climbing" || animationStep === "waiting") && (
                  <motion.div
                    variants={windowStudentWave2}
                    animate="animate"
                    style={{ transformOrigin: "bottom center" }}
                    className="absolute left-[1px] bottom-[2px] w-1.8 h-[13px] bg-gradient-to-b from-[#ffedd5] to-[#fed7aa] rounded-full z-15 border border-amber-900/10 flex items-start justify-center"
                  >
                    {/* Hand waving high! */}
                    <div className="absolute top-[-1px] w-2.5 h-2.5 bg-[#fed7aa] rounded-full flex items-center justify-center" />
                  </motion.div>
                )}
              </div>
            </div>

            {/* Side Branding Band with detailed lettering */}
            <div className="w-full h-4 bg-[#1e293b] my-1 flex items-center px-3 border-y border-amber-500/15 z-10">
              <span className="text-[7.5px] font-extrabold tracking-[0.16em] text-yellow-400 font-sans mx-auto">
                SHIKSHANTAR ACADEMY
              </span>
            </div>

            {/* Bumper with Headlights and Grille lines */}
            <div className="w-full h-3 bg-gradient-to-r from-slate-700 via-slate-800 to-slate-900 flex justify-between items-center px-3 z-10 border-t border-slate-600/30">
              {/* Left headlight (Glows yellow/gold lens) */}
              <div className="w-3.5 h-2 bg-yellow-100 rounded-sm shadow-[0_0_12px_rgba(253,224,71,0.9)] border-r border-white/35 flex items-center justify-center">
                {/* Bulb node */}
                <div className="w-1.5 h-1 bg-white rounded-full" />
              </div>
              {/* Rear tail-lights */}
              <div className="w-2.5 h-1.5 bg-rose-600 rounded-sm shadow-[0_0_4px_rgba(244,63,94,0.5)]" />
            </div>

            {/* Interactive Automatic Door (Slides open during "climbing" step) */}
            <div className="absolute right-3 bottom-0.5 w-6 h-14 bg-slate-900/40 border border-amber-500/30 rounded-sm overflow-hidden z-12">
              {/* Left sliding door panel */}
              <motion.div 
                animate={animationStep === "climbing" ? { x: "-100%" } : { x: "0%" }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="absolute left-0 top-0 bottom-0 w-1/2 bg-[#1e293b] border-r border-amber-500/20 shadow-inner"
              />
              {/* Right sliding door panel */}
              <motion.div 
                animate={animationStep === "climbing" ? { x: "100%" } : { x: "0%" }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="absolute right-0 top-0 bottom-0 w-1/2 bg-[#1e293b] border-l border-amber-500/20 shadow-inner"
              />
            </div>

          </motion.div>

          {/* Exhaust Smoke Pipe */}
          <div className="absolute bottom-[4px] right-2 w-3.5 h-1.5 bg-gradient-to-r from-slate-600 to-slate-800 rounded-r-md border border-slate-700 z-5 flex items-center">
            {/* Tiny pipe opening */}
            <div className="absolute right-0 w-1 h-1 bg-black rounded-full" />
          </div>

          {/* Smoke Puff Particles (Framer Motion looping) */}
          {(animationStep === "bus-arriving" || animationStep === "climbing" || animationStep === "bus-departing") && (
            <div className="absolute bottom-[6px] right-[-14px] w-8 h-8 pointer-events-none z-4 overflow-visible">
              {[...Array(3)].map((_, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.1, x: 0, y: 0 }}
                  animate={{
                    opacity: [0, 0.65, 0],
                    scale: [0.3, 1.2, 1.9],
                    x: [0, 8 + idx * 4, 18 + idx * 6],
                    y: [0, -3 - idx * 2, -6 - idx * 3]
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.5,
                    delay: idx * 0.45,
                    ease: "easeOut"
                  }}
                  className="absolute bottom-1 left-0 w-3.5 h-3 bg-slate-300/40 rounded-full blur-[1px]"
                />
              ))}
            </div>
          )}

          {/* Spinning Wheels below chassis */}
          <div className="w-full flex justify-around px-6 mt-[-7px] z-10">
            {/* Front Wheel with textured rubber treads and shiny chrome hubcap */}
            <motion.div 
              variants={wheelRotation}
              animate="animate"
              className="w-7.5 h-7.5 bg-gradient-to-b from-[#111827] to-[#1f2937] rounded-full border-[3px] border-[#374151] flex items-center justify-center shadow-lg relative overflow-hidden"
            >
              {/* Outer Rubber Tread lines */}
              <div className="absolute inset-0.5 rounded-full border border-dashed border-slate-700/50 opacity-40" />
              
              {/* Chrome hubcap wheel core */}
              <div className="w-3.5 h-3.5 bg-gradient-to-br from-slate-200 via-slate-400 to-slate-300 rounded-full flex items-center justify-center border-[1.5px] border-slate-100 shadow-inner">
                {/* Center nut details */}
                <div className="w-1.5 h-1.5 bg-slate-600 rounded-full flex items-center justify-center relative">
                  <div className="w-[2.5px] h-[2.5px] bg-[#fbbf24] rounded-full" /> {/* Shiny center axle cap */}
                </div>
              </div>
            </motion.div>

            {/* Rear Wheel */}
            <motion.div 
              variants={wheelRotation}
              animate="animate"
              className="w-7.5 h-7.5 bg-gradient-to-b from-[#111827] to-[#1f2937] rounded-full border-[3px] border-[#374151] flex items-center justify-center shadow-lg relative overflow-hidden"
            >
              <div className="absolute inset-0.5 rounded-full border border-dashed border-slate-700/50 opacity-40" />
              
              <div className="w-3.5 h-3.5 bg-gradient-to-br from-slate-200 via-slate-400 to-slate-300 rounded-full flex items-center justify-center border-[1.5px] border-slate-100 shadow-inner">
                <div className="w-1.5 h-1.5 bg-slate-600 rounded-full flex items-center justify-center relative">
                  <div className="w-[2.5px] h-[2.5px] bg-[#fbbf24] rounded-full" />
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* ---------------- 3. MAGICAL BURST FLOATING ITEMS ---------------- */}
        <AnimatePresence>
          {(animationStep === "bus-departing" || animationStep === "completed") && (
            <div className="absolute bottom-[70px] w-72 h-44 pointer-events-none z-30 overflow-visible">
              {/* Floating Graduation Cap */}
              <motion.div
                initial={{ opacity: 0, scale: 0.2, x: 0, y: 10, rotate: -45 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1.1, 1.1, 0.7], x: -80, y: -80, rotate: -15 }}
                transition={{ duration: 2.2, repeat: Infinity }}
                className="absolute text-[#F0A500] left-1/3"
              >
                <GraduationCap className="w-7 h-7 filter drop-shadow-[0_4px_8px_rgba(240,165,0,0.5)]" />
              </motion.div>

              {/* Floating Open Book */}
              <motion.div
                initial={{ opacity: 0, scale: 0.2, x: 0, y: 10, rotate: 45 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1, 1, 0.7], x: 80, y: -70, rotate: 20 }}
                transition={{ duration: 2.5, repeat: Infinity, delay: 0.3 }}
                className="absolute text-sky-300 left-1/2"
              >
                <BookOpen className="w-6.5 h-6.5 filter drop-shadow-[0_4px_8px_rgba(56,189,248,0.5)]" />
              </motion.div>

              {/* Glowing star */}
              <motion.div
                initial={{ opacity: 0, scale: 0.2, x: 0, y: 10 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 0.9, 0.9, 0.5], x: -10, y: -110, rotate: 180 }}
                transition={{ duration: 2.0, repeat: Infinity, delay: 0.6 }}
                className="absolute text-[#ffd369] left-1/2"
              >
                <Star className="w-5 h-5 fill-current filter drop-shadow-[0_0_8px_rgba(240,165,0,0.8)]" />
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Skip Action Bar */}
      <div className="z-20 w-full max-w-sm flex flex-col items-center gap-3 mb-1">
        <div className="w-full flex flex-col items-center gap-2.5">
          <button
            type="button"
            onClick={onComplete}
            className="w-full py-3.5 px-6 rounded-2xl bg-[#F0A500] hover:bg-[#d99400] text-slate-950 text-xs font-black tracking-widest uppercase transition-all shadow-[0_6px_25px_rgba(240,165,0,0.5)] active:scale-[0.96] flex items-center justify-center gap-2.5 cursor-pointer border border-[#f7c04a] relative overflow-hidden group"
          >
            <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shine" />
            {animationStep === "completed" || animationStep === "bus-departing" ? (
              <>Entering Admission Form <ArrowRight className="w-4.5 h-4.5 text-slate-950 animate-bounce-right" /></>
            ) : (
              <>Skip & Open Admission Form <ArrowRight className="w-4.5 h-4.5 text-slate-950 animate-bounce-right" /></>
            )}
          </button>
          
          {/* Status real-time indicator */}
          <div className={`text-[10px] uppercase font-black tracking-widest flex items-center justify-center gap-2.5 py-1 min-h-[20px] transition-colors duration-1000 ${timeStyles[timeOfDay].statusText}`}>
            {animationStep !== "completed" && (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
                className="w-3.5 h-3.5 border-2 border-t-transparent border-[#F0A500] rounded-full shadow-[0_0_8px_rgba(240,165,0,0.4)]"
              />
            )}
            <span className="text-center">{getStatusText()}</span>
          </div>
        </div>
      </div>

    </div>
  );
}
