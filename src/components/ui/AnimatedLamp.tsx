import React from 'react';
import { motion } from 'motion/react';

interface AnimatedLampProps {
  isOn: boolean;
  onToggle: () => void;
  isFocused?: boolean;
  className?: string;
}

export default function AnimatedLamp({
  isOn,
  onToggle,
  isFocused = false,
  className = "",
}: AnimatedLampProps) {
  return (
    <div className={`relative flex flex-col items-center select-none z-30 ${className}`}>
      {/* Ceiling Mount Fixture */}
      <div className="w-16 sm:w-20 h-2.5 bg-gradient-to-r from-amber-700 via-amber-300 to-amber-700 rounded-t-sm shadow-md border-b border-amber-800/60" />

      {/* Main Lamp Fixture with Subtle Natural Sway */}
      <motion.div
        animate={{
          rotate: isOn ? [-0.5, 0.5, -0.5] : [0, 0, 0],
        }}
        transition={{
          repeat: Infinity,
          duration: 5,
          ease: "easeInOut",
        }}
        className="flex flex-col items-center origin-top relative"
      >
        {/* Main Hanging Wire */}
        <div className="w-[3px] h-14 sm:h-20 bg-gradient-to-b from-amber-300 via-slate-400 to-amber-500 shadow-sm" />

        {/* Lamp Base Socket */}
        <div className="w-8 h-2 bg-gradient-to-r from-amber-700 via-amber-300 to-amber-700 rounded-full shadow-xs -mt-[1px]" />
        <div className="w-5 h-3 bg-gradient-to-b from-amber-500 to-amber-800 rounded-t-sm" />

        {/* Lamp Shade (Pendant Bell Hood) */}
        <div className="relative flex flex-col items-center cursor-pointer group" onClick={onToggle} title="Click to toggle lamp">
          <div className="w-28 sm:w-36 h-12 sm:h-16 bg-gradient-to-b from-[#082035] via-[#0d3b60] to-[#051829] rounded-t-[3.5rem] border-t-2 border-x-2 border-amber-400/80 shadow-[0_8px_20px_rgba(0,0,0,0.6)] relative overflow-hidden flex justify-center transition-all duration-300 group-hover:border-amber-300">
            {/* Top Gloss Reflection */}
            <div className="absolute top-1.5 left-3 right-3 h-3 bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-full" />
            
            {/* Inner Shade Glow when ON */}
            {isOn && (
              <div className="absolute bottom-0 inset-x-2 h-6 bg-gradient-to-t from-amber-400/60 to-transparent rounded-t-full blur-xs" />
            )}

            {/* Bottom Metallic Ring Trim */}
            <div className="absolute bottom-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-700 via-amber-300 to-amber-700" />
          </div>

          {/* Glowing Light Bulb Under Shade */}
          <div className="relative -mt-1.5 flex flex-col items-center z-20">
            <motion.div
              animate={{
                scale: isOn ? (isFocused ? [1, 1.08, 1] : [1, 1.04, 1]) : 0.95,
                filter: isOn
                  ? isFocused
                    ? [
                        "drop-shadow(0 0 16px rgba(240, 165, 0, 1)) drop-shadow(0 0 35px rgba(251, 191, 36, 0.85))",
                        "drop-shadow(0 0 24px rgba(240, 165, 0, 1)) drop-shadow(0 0 55px rgba(251, 191, 36, 0.95))",
                        "drop-shadow(0 0 16px rgba(240, 165, 0, 1)) drop-shadow(0 0 35px rgba(251, 191, 36, 0.85))",
                      ]
                    : [
                        "drop-shadow(0 0 12px rgba(240, 165, 0, 0.85)) drop-shadow(0 0 28px rgba(251, 191, 36, 0.6))",
                        "drop-shadow(0 0 18px rgba(240, 165, 0, 0.95)) drop-shadow(0 0 38px rgba(251, 191, 36, 0.75))",
                        "drop-shadow(0 0 12px rgba(240, 165, 0, 0.85)) drop-shadow(0 0 28px rgba(251, 191, 36, 0.6))",
                      ]
                  : "drop-shadow(0 0 2px rgba(100, 116, 139, 0.4))",
              }}
              transition={{
                repeat: isOn ? Infinity : 0,
                duration: 3,
                ease: "easeInOut",
              }}
              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center transition-colors duration-500 ${
                isOn
                  ? "bg-gradient-to-br from-amber-100 via-amber-300 to-amber-500 border-amber-200/90 shadow-inner"
                  : "bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800 border-slate-600/60"
              }`}
            >
              {/* Inner Glowing Filament */}
              <div
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  isOn
                    ? "bg-white blur-[0.5px] shadow-[0_0_10px_#ffffff]"
                    : "bg-slate-500/40"
                }`}
              />
            </motion.div>
          </div>

          {/* Interactive Pull Cord Switch on the side */}
          <motion.div
            whileTap={{ y: 12 }}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="absolute -right-5 sm:-right-7 top-7 flex flex-col items-center cursor-pointer group/cord z-30"
            title="Pull chain to turn on/off"
          >
            {/* Chain links */}
            <div className="w-[1.5px] h-16 sm:h-20 bg-gradient-to-b from-amber-300 via-amber-400 to-amber-200 group-hover/cord:from-amber-200 group-hover/cord:to-amber-100 transition-colors shadow-xs" />
            {/* Tassel / Golden Beaded Pull Handle */}
            <motion.div 
              whileHover={{ scale: 1.25 }}
              className="w-3.5 h-6 rounded-full bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 border border-amber-200 shadow-md flex items-center justify-center -mt-0.5 group-hover/cord:shadow-[0_0_12px_rgba(240,165,0,0.9)]"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-amber-100" />
            </motion.div>
          </motion.div>
        </div>

        {/* Ambient Conical Light Beam radiating onto the login area */}
        <motion.div
          animate={{
            opacity: isOn ? (isFocused ? 1 : 0.88) : 0,
            scaleY: isOn ? 1 : 0.8,
          }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="absolute top-14 sm:top-18 w-[380px] sm:w-[580px] md:w-[680px] h-[520px] sm:h-[620px] pointer-events-none -z-10 origin-top flex justify-center"
          style={{
            clipPath: "polygon(22% 0%, 78% 0%, 100% 100%, 0% 100%)",
            background: isFocused
              ? "linear-gradient(180deg, rgba(240, 165, 0, 0.55) 0%, rgba(251, 191, 36, 0.28) 45%, rgba(14, 165, 233, 0.08) 85%, transparent 100%)"
              : "linear-gradient(180deg, rgba(240, 165, 0, 0.42) 0%, rgba(251, 191, 36, 0.18) 45%, rgba(14, 165, 233, 0.04) 85%, transparent 100%)",
          }}
        />

        {/* Wide Soft Radial Aura */}
        <motion.div
          animate={{
            opacity: isOn ? (isFocused ? 0.95 : 0.75) : 0,
            scale: isOn ? 1 : 0.6,
          }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="absolute top-16 w-80 sm:w-[480px] h-60 sm:h-80 rounded-full blur-3xl pointer-events-none -z-10 bg-amber-400/30"
        />
      </motion.div>
    </div>
  );
}
