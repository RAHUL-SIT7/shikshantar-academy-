import React, { useState, useRef, MouseEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface LiquidButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'guest' | 'secondary' | 'danger';
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLButtonElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLButtonElement>) => void;
}

interface LiquidDrop {
  id: number;
  x: number;
  y: number;
  size: number;
}

export default function LiquidButton({
  children,
  variant = 'primary',
  className = '',
  buttonClassName = '',
  disabled = false,
  type = 'button',
  onClick,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: LiquidButtonProps) {
  const [ripples, setRipples] = useState<LiquidDrop[]>([]);
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handlePointerMove = (e: MouseEvent<HTMLButtonElement>) => {
    if (!buttonRef.current || disabled) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });
  };

  const handlePointerDown = (e: MouseEvent<HTMLButtonElement>) => {
    if (disabled || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const size = Math.max(rect.width, rect.height) * 2.2;
    const newDrop: LiquidDrop = {
      id: Date.now() + Math.random(),
      x,
      y,
      size,
    };

    setRipples((prev) => [...prev.slice(-3), newDrop]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newDrop.id));
    }, 850);
  };

  const isPrimary = variant === 'primary';
  const isGuest = variant === 'guest';
  const isDanger = variant === 'danger';

  return (
    <div className={`relative inline-block w-full group select-none ${className}`}>
      {/* Outer Apple Liquid Aura / Ambient Bloom Glow */}
      <div 
        className={`absolute -inset-1 rounded-2xl blur-lg transition-all duration-500 pointer-events-none -z-10 ${
          isPrimary
            ? 'bg-gradient-to-r from-[#0a3d62] via-sky-500 to-[#F0A500] opacity-35 group-hover:opacity-75 group-hover:blur-xl'
            : isGuest
            ? 'bg-gradient-to-r from-slate-200 via-sky-200 to-amber-100 opacity-30 group-hover:opacity-60 group-hover:blur-md'
            : isDanger
            ? 'bg-gradient-to-r from-rose-600 to-amber-500 opacity-40 group-hover:opacity-80 group-hover:blur-lg'
            : 'bg-gradient-to-r from-[#0a3d62] to-sky-400 opacity-25 group-hover:opacity-60'
        }`} 
      />

      <motion.button
        ref={buttonRef}
        type={type}
        disabled={disabled}
        onClick={onClick}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseEnter={(e) => {
          setIsHovered(true);
          onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          setIsHovered(false);
          onMouseLeave?.(e);
        }}
        whileHover={!disabled ? { scale: 1.018, y: -0.5 } : {}}
        whileTap={!disabled ? { scale: 0.968, y: 1 } : {}}
        transition={{ type: 'spring', stiffness: 500, damping: 28, mass: 0.75 }}
        className={`relative w-full overflow-hidden rounded-2xl px-5 py-3.5 sm:py-4 font-bold transition-all duration-300 flex items-center justify-center gap-2.5 cursor-pointer outline-none focus:outline-none focus:ring-2 focus:ring-amber-400/50 backdrop-blur-2xl ${
          isPrimary
            ? 'bg-gradient-to-b from-[#0e4a77] via-[#0a3d62] to-[#052137] text-white border border-white/25 shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),inset_0_-1.5px_2px_rgba(0,0,0,0.4),0_8px_24px_-4px_rgba(10,61,98,0.45)]'
            : isGuest
            ? 'bg-gradient-to-b from-white/95 via-white/85 to-slate-100/90 dark:from-slate-800/95 dark:to-slate-900/90 text-[#0a3d62] dark:text-slate-100 border border-white/70 dark:border-slate-700/70 shadow-[inset_0_1.5px_1.5px_rgba(255,255,255,0.95),inset_0_-1px_2px_rgba(0,0,0,0.06),0_6px_20px_rgba(0,0,0,0.06)] hover:border-amber-400/70'
            : isDanger
            ? 'bg-gradient-to-b from-rose-500 via-rose-600 to-rose-800 text-white border border-rose-300/40 shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.6),0_8px_24px_-4px_rgba(225,29,72,0.4)]'
            : 'bg-gradient-to-b from-slate-100 to-slate-200 text-[#0a3d62] border border-slate-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]'
        } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''} ${buttonClassName}`}
        {...(rest as any)}
      >
        {/* Layer 1: Apple Dynamic Specular Light Follow Refraction Spot */}
        <div 
          className="absolute inset-0 pointer-events-none transition-opacity duration-300 opacity-70 group-hover:opacity-100"
          style={{
            background: isPrimary
              ? `radial-gradient(140px circle at ${mousePos.x}% ${mousePos.y}%, rgba(255,255,255,0.35), rgba(56,189,248,0.2) 40%, transparent 75%)`
              : isGuest
              ? `radial-gradient(140px circle at ${mousePos.x}% ${mousePos.y}%, rgba(240,165,0,0.25), rgba(255,255,255,0.6) 45%, transparent 75%)`
              : `radial-gradient(140px circle at ${mousePos.x}% ${mousePos.y}%, rgba(255,255,255,0.4), transparent 70%)`
          }}
        />

        {/* Layer 2: Apple Fluid Glass Lens Curved Sheen (Upper Hemisphere Glaze) */}
        <div 
          className="absolute top-0 inset-x-1 h-[48%] rounded-t-xl bg-gradient-to-b from-white/40 via-white/12 to-transparent pointer-events-none z-10"
        />

        {/* Layer 3: Dynamic Under-Liquid Waves (Gentle Cupertino Viscous Flow) */}
        <div 
          className={`absolute inset-x-0 bottom-0 pointer-events-none transition-all duration-700 ease-out overflow-hidden ${
            isHovered ? 'h-[135%]' : 'h-[50%]'
          }`}
        >
          {/* Wave 1: Fast oscillating fluid crest */}
          <div className="absolute inset-0 w-[200%] h-full animate-liquid-wave-1 opacity-35">
            <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="w-full h-full">
              <path
                d="M0,0 C150,90 350,-40 500,45 C650,130 900,-30 1200,30 L1200,120 L0,120 Z"
                fill={isPrimary ? '#0ea5e9' : isGuest ? '#bae6fd' : '#f43f5e'}
              />
            </svg>
          </div>

          {/* Wave 2: Slower deep liquid undercurrent with iridescent gold/cyan tint */}
          <div className="absolute inset-0 w-[200%] h-full animate-liquid-wave-2 opacity-40">
            <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="w-full h-full">
              <path
                d="M0,30 C300,-40 450,110 700,20 C950,-70 1050,80 1200,10 L1200,120 L0,120 Z"
                fill={isPrimary ? '#F0A500' : isGuest ? '#fde68a' : '#fb7185'}
              />
            </svg>
          </div>
        </div>

        {/* Layer 4: Interactive Apple Liquid Viscous Shockwave on Click */}
        <AnimatePresence>
          {ripples.map((drop) => (
            <motion.span
              key={drop.id}
              initial={{ scale: 0, opacity: 0.85 }}
              animate={{ scale: 1, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              style={{
                left: drop.x - drop.size / 2,
                top: drop.y - drop.size / 2,
                width: drop.size,
                height: drop.size,
              }}
              className={`absolute rounded-full pointer-events-none z-20 ${
                isPrimary
                  ? 'bg-radial from-white via-sky-300 to-transparent'
                  : 'bg-radial from-amber-300 via-white to-transparent'
              }`}
            />
          ))}
        </AnimatePresence>

        {/* Layer 5: Apple Glass Edge High-Refraction Rim Glow */}
        <div className="absolute inset-0 rounded-2xl border border-white/20 pointer-events-none z-20" />

        {/* Layer 6: Dynamic Light Glint Shimmer Streak */}
        <div className="absolute -inset-full w-[250%] h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -rotate-45 pointer-events-none group-hover:translate-x-full transition-transform duration-1000 ease-in-out z-20" />

        {/* Layer 7: Button Content Typography */}
        <span className="relative z-30 flex items-center justify-center gap-2.5 font-black tracking-wider text-xs sm:text-sm uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
          {children}
        </span>
      </motion.button>
    </div>
  );
}
