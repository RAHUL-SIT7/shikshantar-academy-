import React, { useRef, useState, MouseEvent } from 'react';

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  spotlightColor?: string;
  borderGlowColor?: string;
  glowAuraColor?: string;
  roundedClass?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * SpotlightCard component
 * Effect: "Spotlight Effect" (Cursor-tracking Radial Glow & Dynamic High-Intensity Glowing Border Beam)
 * Tracks mouse coordinates in real-time to vividly illuminate the border and surface right under the cursor.
 */
export default function SpotlightCard({
  children,
  className = "",
  innerClassName = "",
  spotlightColor = "rgba(240, 165, 0, 0.28)",
  borderGlowColor = "#F0A500",
  glowAuraColor = "rgba(240, 165, 0, 0.45)",
  roundedClass = "rounded-2xl",
  onClick,
  ...props
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: -500, y: -500 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseEnter = (e: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={`relative ${roundedClass} p-[2px] transition-all duration-300 group/spotlight select-none ${className}`}
      {...props}
    >
      {/* 1. Ambient Background Bloom Aura on Hover */}
      <div
        className={`pointer-events-none absolute -inset-1 ${roundedClass} blur-xl transition-opacity duration-300 -z-10`}
        style={{
          opacity: isHovered ? 0.75 : 0,
          background: `radial-gradient(280px circle at ${position.x}px ${position.y}px, ${glowAuraColor}, transparent 75%)`,
        }}
      />

      {/* 2. Static Default Base Border */}
      <div className={`absolute inset-0 ${roundedClass} border border-slate-200/90 dark:border-slate-800 pointer-events-none z-0 transition-colors duration-300`} />

      {/* 3. High-Intensity Dynamic Cursor-Tracking Border Beam */}
      <div
        className={`pointer-events-none absolute inset-0 ${roundedClass} transition-opacity duration-200 z-0 overflow-hidden`}
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(260px circle at ${position.x}px ${position.y}px, ${borderGlowColor} 0%, rgba(59, 130, 246, 0.95) 30%, rgba(16, 185, 129, 0.85) 60%, transparent 80%)`,
        }}
      />

      {/* 4. Inner Card Mask Container */}
      <div className={`relative z-10 w-full h-full ${roundedClass} overflow-hidden bg-white dark:bg-[#0c1322] flex flex-col transition-colors duration-300 ${innerClassName}`}>
        {/* Luminous Surface Spotlight Glow directly following the mouse cursor */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-200 z-0"
          style={{
            opacity: isHovered ? 1 : 0,
            background: `radial-gradient(340px circle at ${position.x}px ${position.y}px, ${spotlightColor} 0%, rgba(59, 130, 246, 0.12) 45%, transparent 70%)`,
          }}
        />

        {/* Card Body */}
        <div className="relative z-10 flex flex-col flex-1 h-full">
          {children}
        </div>
      </div>
    </div>
  );
}
