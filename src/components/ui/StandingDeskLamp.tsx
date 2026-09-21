import React from 'react';
import { motion } from 'motion/react';

interface StandingDeskLampProps {
  isOn: boolean;
  onToggle: () => void;
  className?: string;
}

export default function StandingDeskLamp({
  isOn,
  onToggle,
  className = "",
}: StandingDeskLampProps) {
  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      {/* ========================================================================= */}
      {/* SOFT VOLUMETRIC AMBIENT LIGHT LAYER (NO HARD POLYGONS, SOFT CINEMATIC FALLOFF) */}
      {/* ========================================================================= */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-visible">
        {/* Lamp Bulb Core Glow */}
        <motion.div
          animate={{
            opacity: isOn ? 1 : 0,
            scale: isOn ? 1 : 0.6,
          }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="absolute top-[80px] left-[180px] sm:left-[210px] w-48 h-48 rounded-full bg-amber-400/40 blur-[40px] pointer-events-none"
        />

        {/* Wide Warm Amber Atmospheric Glow expanding across the desk & portal */}
        <motion.div
          animate={{
            opacity: isOn ? 0.85 : 0,
            scale: isOn ? 1 : 0.7,
          }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="absolute top-[50px] left-[120px] sm:left-[150px] w-[500px] sm:w-[680px] lg:w-[850px] h-[380px] sm:h-[480px] rounded-[100%] bg-radial from-amber-300/30 via-amber-500/15 via-orange-500/5 to-transparent blur-[60px] sm:blur-[80px] pointer-events-none"
        />

        {/* Soft Conical Light Beam (Layered Gaussian blurred radial/conic gradient) */}
        <motion.div
          animate={{
            opacity: isOn ? 0.65 : 0,
          }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="absolute top-[90px] left-[170px] sm:left-[200px] w-[420px] sm:w-[580px] lg:w-[700px] h-[320px] sm:h-[420px] origin-top-left pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 10% 15%, rgba(254, 240, 138, 0.45) 0%, rgba(245, 158, 11, 0.25) 30%, rgba(217, 119, 6, 0.1) 60%, transparent 85%)",
            filter: "blur(24px)",
            transform: "rotate(15deg)",
          }}
        />

        {/* Warm Desk Pool Reflection */}
        <motion.div
          animate={{
            opacity: isOn ? 0.9 : 0,
          }}
          transition={{ duration: 0.5 }}
          className="absolute top-[260px] sm:top-[300px] left-[80px] sm:left-[120px] w-[400px] sm:w-[550px] h-[100px] sm:h-[130px] rounded-full bg-radial from-amber-400/35 via-amber-600/15 to-transparent blur-[32px] pointer-events-none"
        />
      </div>

      {/* ========================================================================= */}
      {/* REALISTIC ARCHITECT STUDY DESK LAMP SVG (CRISP, DARK METALLIC, BRASS ACCENTS) */}
      {/* ========================================================================= */}
      <svg
        viewBox="0 0 380 440"
        className="w-full h-auto max-w-[320px] sm:max-w-[380px] drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)] overflow-visible relative z-10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Metallic Dark Arm Gradient */}
          <linearGradient id="lampArmMetal" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="25%" stopColor="#1e293b" />
            <stop offset="60%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>

          {/* Lamp Shade Metallic Gradient */}
          <linearGradient id="shadeExterior" x1="10%" y1="0%" x2="90%" y2="100%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="35%" stopColor="#1e293b" />
            <stop offset="85%" stopColor="#090d16" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>

          {/* Polished Brass Joints */}
          <linearGradient id="brassJoints" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d97706" />
            <stop offset="30%" stopColor="#fbbf24" />
            <stop offset="70%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#78350f" />
          </linearGradient>

          {/* Inner Reflector Glow */}
          <radialGradient id="innerShadeGlow" cx="45%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="25%" stopColor="#fef08a" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#b45309" stopOpacity="0.2" />
          </radialGradient>

          {/* Glowing Bulb Core */}
          <radialGradient id="bulbCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="30%" stopColor="#fef08a" stopOpacity="1" />
            <stop offset="70%" stopColor="#fbbf24" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* --- Lamp Heavy Desk Base --- */}
        <ellipse cx="60" cy="400" rx="46" ry="14" fill="url(#lampArmMetal)" stroke="#475569" strokeWidth="1.5" />
        <ellipse cx="60" cy="397" rx="40" ry="10" fill="#0f172a" />
        <rect x="54" y="380" width="12" height="18" rx="2" fill="url(#brassJoints)" />

        {/* --- Base Pivot Joint --- */}
        <circle cx="60" cy="378" r="8" fill="url(#brassJoints)" stroke="#78350f" strokeWidth="1" />
        <circle cx="60" cy="378" r="3.5" fill="#0f172a" />

        {/* --- Lower Articulated Arm (Twin Steel Tubing) --- */}
        <line x1="57" y1="378" x2="108" y2="218" stroke="url(#lampArmMetal)" strokeWidth="6.5" strokeLinecap="round" />
        <line x1="63" y1="378" x2="114" y2="218" stroke="url(#lampArmMetal)" strokeWidth="4.5" strokeLinecap="round" opacity="0.6" />

        {/* Lower Arm Steel Tension Spring */}
        <line x1="60" y1="360" x2="106" y2="235" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.85" />

        {/* --- Elbow Joint (Pivot & Adjustment Knob) --- */}
        <circle cx="111" cy="216" r="11" fill="url(#brassJoints)" stroke="#78350f" strokeWidth="1.5" />
        <circle cx="111" cy="216" r="5" fill="#0f172a" />
        <rect x="102" y="210" width="18" height="4" rx="2" fill="url(#brassJoints)" />

        {/* --- Upper Curved Arm Reaching Outward --- */}
        <path
          d="M 111 216 C 125 125, 205 85, 265 105"
          stroke="url(#lampArmMetal)"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
        />

        {/* --- Wrist Joint --- */}
        <circle cx="265" cy="105" r="9" fill="url(#brassJoints)" stroke="#78350f" strokeWidth="1" />
        <circle cx="265" cy="105" r="4" fill="#0f172a" />

        {/* --- Lamp Shade Neck & Bell Shade (Clickable for Interactive Warm Glow) --- */}
        <g 
          className="cursor-pointer transition-transform duration-300 hover:scale-[1.03] origin-[265px_105px]" 
          onClick={onToggle}
          title="Click to toggle study lamp"
        >
          {/* Socket Mount */}
          <path d="M 260 105 L 280 122 L 272 130 L 252 113 Z" fill="url(#brassJoints)" />

          {/* Lamp Bell Shade Body */}
          <path
            d="M 268 126 C 275 114, 310 118, 326 142 C 342 166, 338 206, 322 222 C 302 238, 268 214, 252 188 C 242 164, 256 134, 268 126 Z"
            fill="url(#shadeExterior)"
            stroke="#475569"
            strokeWidth="1.5"
          />

          {/* Shade Specular Highlight */}
          <path
            d="M 276 132 C 290 128, 316 142, 322 162"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />

          {/* Inner Reflective Shade Lip */}
          <ellipse
            cx="286"
            cy="204"
            rx="36"
            ry="22"
            transform="rotate(-35 286 204)"
            fill={isOn ? "url(#innerShadeGlow)" : "#1e293b"}
            stroke={isOn ? "#f59e0b" : "#475569"}
            strokeWidth="2"
          />

          {/* Glowing Filament & Bulb Core */}
          {isOn && (
            <g>
              <ellipse
                cx="284"
                cy="202"
                rx="18"
                ry="14"
                transform="rotate(-35 284 202)"
                fill="url(#bulbCore)"
              />
              <circle
                cx="282"
                cy="200"
                r="7"
                fill="#ffffff"
                className="animate-pulse"
              />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
