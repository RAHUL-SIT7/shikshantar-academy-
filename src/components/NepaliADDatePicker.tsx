import React, { useState, useEffect } from 'react';
import { Calendar, Info } from 'lucide-react';

interface NepaliADDatePickerProps {
  dob?: string;      // AD date, e.g. "2010-05-15"
  dobBs?: string;    // BS date, e.g. "2067-02-10"
  onChange: (dates: { dob: string; dobBs: string }) => void;
  required?: boolean;
}

const MONTHS_NEPALI = [
  { val: "01", name: "Baisakh" },
  { val: "02", name: "Jestha" },
  { val: "03", name: "Ashadh" },
  { val: "04", name: "Shrawan" },
  { val: "05", name: "Bhadra" },
  { val: "06", name: "Ashwin" },
  { val: "07", name: "Kartik" },
  { val: "08", name: "Mangsir" },
  { val: "09", name: "Poush" },
  { val: "10", name: "Magh" },
  { val: "11", name: "Falgun" },
  { val: "12", name: "Chaitra" },
];

export default function NepaliADDatePicker({ dob = '', dobBs = '', onChange, required = false }: NepaliADDatePickerProps) {
  // Determine initial system system based on truthiness
  const initialSystem = dobBs && !dob ? 'BS' : dob && !dobBs ? 'AD' : 'BS';
  const [dobSystem, setDobSystem] = useState<'BS' | 'AD'>(initialSystem);

  // Parse existing BS strings e.g. "2065-02-15" or "2065-02-15 B.S."
  const initialBs = (() => {
    if (!dobBs) return { year: '', month: '', day: '' };
    const clean = dobBs.replace(/\s?B\.?S\.?/i, '').trim();
    const parts = clean.split('-');
    if (parts.length === 3) {
      return { year: parts[0], month: parts[1], day: parts[2] };
    }
    return { year: '', month: '', day: '' };
  })();

  const [bsYear, setBsYear] = useState<string>(initialBs.year);
  const [bsMonth, setBsMonth] = useState<string>(initialBs.month);
  const [bsDay, setBsDay] = useState<string>(initialBs.day);

  // Parse existing AD string e.g. "2012-05-15"
  const [adDate, setAdDate] = useState<string>(() => {
    if (!dob) return '';
    return dob.replace(/\s?A\.?D\.?/i, '').trim();
  });

  // Track parent values to sync backwards if they change externally (e.g. on client swap or reset)
  useEffect(() => {
    const parentBs = (() => {
      if (!dobBs) return { year: '', month: '', day: '' };
      const clean = dobBs.replace(/\s?B\.?S\.?/i, '').trim();
      const parts = clean.split('-');
      if (parts.length === 3) {
        return { year: parts[0], month: parts[1], day: parts[2] };
      }
      return { year: '', month: '', day: '' };
    })();

    if (parentBs.year !== bsYear) setBsYear(parentBs.year);
    if (parentBs.month !== bsMonth) setBsMonth(parentBs.month);
    if (parentBs.day !== bsDay) setBsDay(parentBs.day);

    const parentAd = dob ? dob.replace(/\s?A\.?D\.?/i, '').trim() : '';
    if (parentAd !== adDate) setAdDate(parentAd);

    if (dobBs && !dob && dobSystem !== 'BS') setDobSystem('BS');
    if (dob && !dobBs && dobSystem !== 'AD') setDobSystem('AD');
  }, [dob, dobBs]);

  // Bubble changes up
  const handleBsChange = (y: string, m: string, d: string) => {
    setBsYear(y);
    setBsMonth(m);
    setBsDay(d);
    
    if (y && m && d) {
      onChange({
        dobBs: `${y}-${m}-${d}`,
        dob: '' // clear AD
      });
    } else {
      onChange({ dobBs: '', dob: '' });
    }
  };

  const handleAdChange = (val: string) => {
    setAdDate(val);
    if (val) {
      onChange({
        dob: val,
        dobBs: '' // clear BS
      });
    } else {
      onChange({ dobBs: '', dob: '' });
    }
  };

  const handleSystemToggle = (sys: 'BS' | 'AD') => {
    setDobSystem(sys);
    if (sys === 'BS') {
      if (bsYear && bsMonth && bsDay) {
        onChange({ dobBs: `${bsYear}-${bsMonth}-${bsDay}`, dob: '' });
      } else {
        onChange({ dobBs: '', dob: '' });
      }
    } else {
      if (adDate) {
        onChange({ dob: adDate, dobBs: '' });
      } else {
        onChange({ dobBs: '', dob: '' });
      }
    }
  };

  return (
    <div className="space-y-3 bg-slate-50 p-4 border border-slate-200/60 rounded-2xl">
      {/* Dynamic Selector Toggle Tabs */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5 text-slate-500" /> Date Calendar Type:
        </span>
        <div className="flex bg-slate-200/80 p-0.5 rounded-lg border border-slate-300/40 w-52 shrink-0">
          <button
            type="button"
            onClick={() => handleSystemToggle('BS')}
            className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider text-center transition-all cursor-pointer ${
              dobSystem === 'BS'
                ? "bg-[#1B4F72] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            B.S. (Nepali)
          </button>
          <button
            type="button"
            onClick={() => handleSystemToggle('AD')}
            className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider text-center transition-all cursor-pointer ${
              dobSystem === 'AD'
                ? "bg-[#1B4F72] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            A.D. (English)
          </button>
        </div>
      </div>

      {/* Date controls based on System tab */}
      {dobSystem === 'BS' ? (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {/* Year selector */}
            <div>
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">BS Year</label>
              <select
                value={bsYear}
                onChange={(e) => handleBsChange(e.target.value, bsMonth, bsDay)}
                required={required && dobSystem === 'BS'}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black text-slate-800 focus:ring-2 focus:ring-[#1B4F72]/15 focus:border-[#1B4F72] outline-none shadow-2xs"
              >
                <option value="">Year</option>
                {Array.from({ length: 70 }, (_, i) => 2085 - i).map((yr) => (
                  <option key={yr} value={yr}>
                    {yr} B.S.
                  </option>
                ))}
              </select>
            </div>

            {/* Month selector */}
            <div>
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">BS Month</label>
              <select
                value={bsMonth}
                onChange={(e) => handleBsChange(bsYear, e.target.value, bsDay)}
                required={required && dobSystem === 'BS'}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black text-slate-800 focus:ring-2 focus:ring-[#1B4F72]/15 focus:border-[#1B4F72] outline-none shadow-2xs"
              >
                <option value="">Month</option>
                {MONTHS_NEPALI.map((m) => (
                  <option key={m.val} value={m.val}>
                    {m.val} - {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Day selector */}
            <div>
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">BS Day</label>
              <select
                value={bsDay}
                onChange={(e) => handleBsChange(bsYear, bsMonth, e.target.value)}
                required={required && dobSystem === 'BS'}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black text-slate-800 focus:ring-2 focus:ring-[#1B4F72]/15 focus:border-[#1B4F72] outline-none shadow-2xs"
              >
                <option value="">Day</option>
                {Array.from({ length: 32 }, (_, i) => {
                  const dayNum = String(i + 1).padStart(2, "0");
                  return (
                    <option key={dayNum} value={dayNum}>
                      {dayNum}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-1 pl-1 pt-1.5 text-[10px] text-slate-500 font-bold">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Recommended for records matching Nepalese Birth Certificates.</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">Gregorian Date (AD)</label>
            <input
              type="date"
              value={adDate}
              onChange={(e) => handleAdChange(e.target.value)}
              required={required && dobSystem === 'AD'}
              max="2080-12-31"
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#1B4F72]/15 focus:border-[#1B4F72] outline-none shadow-2xs"
            />
          </div>
          <div className="flex items-center gap-1 pl-1 pt-1.5 text-[10px] text-slate-500 font-bold">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Choose if the certificate explicitly lists an English A.D. date of birth.</span>
          </div>
        </div>
      )}
    </div>
  );
}
