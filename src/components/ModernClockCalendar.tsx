import React, { useState, useEffect } from "react";
import { Clock, Calendar as CalendarIcon, Moon, Sun } from "lucide-react";
import NepaliDate from "nepali-date-converter";
import { formatBSDate, getBSYearMonthDate } from "../lib/nepaliDate";

const NEPALI_MONTHS = ["वैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज", "कात्तिक", "मंसिर", "पुस", "माघ", "फागुन", "चैत"];
const NEPALI_DAYS = ["आइतबार", "सोमबार", "मंगलबार", "बुधबार", "बिहीबार", "शुक्रबार", "शनिबार"];
const NEPALI_NUMERALS = ["१२", "१", "२", "३", "४", "५", "६", "७", "८", "९", "१०", "११"];

export default function ModernClockCalendar() {
  const [time, setTime] = useState(new Date());
  const [nepaliDateStr, setNepaliDateStr] = useState("");

  // Use requestAnimationFrame for a liquid-smooth 60fps analog second hand sweep
  useEffect(() => {
    let animFrameId: number;
    const updateTime = () => {
      setTime(new Date());
      animFrameId = requestAnimationFrame(updateTime);
    };
    animFrameId = requestAnimationFrame(updateTime);
    return () => cancelAnimationFrame(animFrameId);
  }, []);

  // Update Nepali date string once a day
  useEffect(() => {
    try {
      const bsStr = formatBSDate(time);
      setNepaliDateStr(bsStr);
    } catch (e) {
      console.error("Error setting Nepali date in clock widget:", e);
    }
  }, [time.getDate()]);

  // Calculations for analog clock hands
  const hours = time.getHours();
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();
  const ms = time.getMilliseconds();

  // Smooth rotation degrees
  const secondsDeg = ((seconds + ms / 1000) / 60) * 360;
  const minutesDeg = ((minutes + seconds / 60) / 60) * 360;
  const hoursDeg = (((hours % 12) + minutes / 60) / 12) * 360;

  // Concentric Nepali date parameters
  const currentMonthIdx = getBSYearMonthDate(time).month; // 0-11 (Baisakh = 0)
  const currentDayIdx = time.getDay(); // 0-6 (Sunday = 0, Saturday = 6)

  // Rotate entire rings so the active item always glides to the 12 o'clock position (0 degrees)
  const monthRingRotation = -currentMonthIdx * 30; // 360 / 12 = 30 deg each
  const dayRingRotation = -currentDayIdx * (360 / 7); // 360 / 7 ≈ 51.43 deg each

  return (
    <div className="w-full bg-[#111827] dark:bg-[#070b13] text-white p-6 md:p-8 rounded-[32px] border border-slate-850 dark:border-slate-900 shadow-2xl relative overflow-hidden flex flex-col items-center justify-between min-h-[420px] select-none font-sans">
      {/* Decorative Background Mesh Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(30,58,138,0.2),_transparent_70%)] pointer-events-none" />
      
      {/* Top Title/Header */}
      <div className="w-full flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-[#F0A500] animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-[#F0A500]">
            Nepali Chrono System
          </span>
        </div>
        <div className="flex items-center gap-1 text-[9px] text-slate-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full font-mono">
          {hours >= 18 || hours < 6 ? <Moon className="w-2.5 h-2.5 text-sky-400" /> : <Sun className="w-2.5 h-2.5 text-amber-400" />}
          <span>{hours >= 12 ? "PM" : "AM"}</span>
        </div>
      </div>

      {/* Main Circular Clock/Calendar System */}
      <div className="relative w-[260px] h-[260px] flex items-center justify-center scale-95 md:scale-100 my-2 z-10">
        
        {/* Outer Circular Glass Container */}
        <div className="absolute inset-0 rounded-full border border-slate-800/80 bg-slate-950/40 backdrop-blur-md shadow-[inset_0_0_20px_rgba(30,58,138,0.3)]" />
        
        {/* MONTHS RING (Outer Ring, Radius = 110px) */}
        <div 
          className="absolute inset-0 transition-transform duration-1000 ease-out"
          style={{ transform: `rotate(${monthRingRotation}deg)` }}
        >
          {NEPALI_MONTHS.map((month, i) => {
            const angle = i * 30; // 360 / 12 = 30 deg each
            const isActive = i === currentMonthIdx;
            return (
              <div
                key={month}
                className="absolute text-[10px] font-black tracking-widest transition-all duration-300 pointer-events-none"
                style={{
                  left: "50%",
                  top: "50%",
                  transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-110px)`,
                  color: isActive ? "#F0A500" : "rgba(148, 163, 184, 0.18)",
                  textShadow: isActive ? "0 0 10px rgba(240, 165, 0, 0.8)" : "none",
                }}
              >
                {month}
              </div>
            );
          })}
        </div>

        {/* DAYS OF WEEK RING (Inner Ring, Radius = 82px) */}
        <div 
          className="absolute inset-0 transition-transform duration-1000 ease-out"
          style={{ transform: `rotate(${dayRingRotation}deg)` }}
        >
          {NEPALI_DAYS.map((day, i) => {
            const angle = i * (360 / 7); // 360 / 7 ≈ 51.4 deg each
            const isActive = i === currentDayIdx;
            return (
              <div
                key={day}
                className="absolute text-[9px] font-black tracking-widest transition-all duration-300 pointer-events-none"
                style={{
                  left: "50%",
                  top: "50%",
                  transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-82px)`,
                  color: isActive ? "#38BDF8" : "rgba(148, 163, 184, 0.12)",
                  textShadow: isActive ? "0 0 10px rgba(56, 189, 248, 0.8)" : "none",
                }}
              >
                {day}
              </div>
            );
          })}
        </div>

        {/* CENTRAL ANALOG CLOCK BODY (Radius = 55px) */}
        <div className="absolute w-[110px] h-[110px] rounded-full bg-slate-900 border-2 border-slate-800/90 shadow-2xl flex items-center justify-center">
          
          {/* Subtle Radial Clock Grids */}
          <div className="absolute inset-2 rounded-full border border-slate-850/50" />
          
          {/* Clock Dial Numerals (Fully Nepali) */}
          {NEPALI_NUMERALS.map((num, i) => {
            const angle = i * 30; // 360 / 12 = 30 deg each
            return (
              <div
                key={num}
                className="absolute text-[10px] font-black text-slate-400 select-none pointer-events-none"
                style={{
                  transform: `rotate(${angle}deg) translateY(-40px) rotate(${-angle}deg)`,
                }}
              >
                {num}
              </div>
            );
          })}

          {/* Hour Hand with realistic center-pivot tail balance */}
          <div
            className="absolute bg-slate-100 rounded-full"
            style={{
              width: "4px",
              height: "34px",
              left: "calc(50% - 2px)",
              bottom: "calc(50% - 6px)", // Offset by tail length to keep center centered
              transform: `rotate(${hoursDeg}deg)`,
              transformOrigin: "50% calc(100% - 6px)",
              boxShadow: "0 0 4px rgba(255,255,255,0.2)",
              transition: "none",
            }}
          />

          {/* Minute Hand with realistic center-pivot tail balance */}
          <div
            className="absolute bg-sky-400 rounded-full"
            style={{
              width: "3px",
              height: "46px",
              left: "calc(50% - 1.5px)",
              bottom: "calc(50% - 8px)", // Offset by tail length to keep center centered
              transform: `rotate(${minutesDeg}deg)`,
              transformOrigin: "50% calc(100% - 8px)",
              boxShadow: "0 0 6px rgba(56, 189, 248, 0.4)",
              transition: "none",
            }}
          />

          {/* Second Hand (Smooth Sweep) with realistic tail balance */}
          <div
            className="absolute bg-[#F0A500] rounded-full"
            style={{
              width: "1.5px",
              height: "54px",
              left: "calc(50% - 0.75px)",
              bottom: "calc(50% - 10px)", // Offset by tail length to keep center centered
              transform: `rotate(${secondsDeg}deg)`,
              transformOrigin: "50% calc(100% - 10px)",
              boxShadow: "0 0 8px rgba(240, 165, 0, 0.5)",
              transition: "none",
            }}
          />

          {/* Center Pin Overlay */}
          <div className="absolute w-2.5 h-2.5 rounded-full bg-slate-950 border-2 border-[#F0A500] z-20" />
        </div>
      </div>

      {/* Modern Digital Footer & Nepali/BS Synchronized Date */}
      <div className="w-full flex flex-col items-center gap-1 mt-3 relative z-10 text-center">
        {/* Gregorian Date */}
        <p className="text-[11px] font-black tracking-widest text-slate-450 uppercase flex items-center gap-1 justify-center">
          <CalendarIcon className="w-3 h-3 text-sky-400" />
          {time.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
        
        {/* Nepali Bikram Sambat Date */}
        {nepaliDateStr && (
          <p className="text-[10px] font-extrabold text-[#F0A500] flex items-center gap-1 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
            <span>{nepaliDateStr}</span>
          </p>
        )}
      </div>
    </div>
  );
}
