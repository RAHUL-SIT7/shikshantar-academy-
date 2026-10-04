import NepaliDateImport from 'nepali-date-converter';

const NepaliDate: any = (NepaliDateImport as any)?.default || NepaliDateImport;

export const NEPALI_MONTHS = [
  'Baisakh',
  'Jestha',
  'Ashadh',
  'Shrawan',
  'Bhadra',
  'Ashwin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra'
];

export const NEPALI_MONTHS_NEP = [
  'बैशाख',
  'जेठ',
  'असार',
  'श्रावण',
  'भाद्र',
  'आश्विन',
  'कार्तिक',
  'मंसिर',
  'पौष',
  'माघ',
  'फाल्गुन',
  'चैत्र'
];

/**
 * Returns the Nepali month name by index (0-indexed or 1-indexed)
 */
export const getNepaliMonthName = (monthIndex: number): string => {
  const idx = monthIndex >= 1 && monthIndex <= 12 ? monthIndex - 1 : monthIndex;
  return NEPALI_MONTHS[idx] || NEPALI_MONTHS[0];
};

/**
 * Checks if a string represents a Bikram Sambat (B.S.) date string (year >= 2000 and <= 2150)
 */
export const isBSDateString = (dateStr?: string): boolean => {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const clean = dateStr.trim().replace(/\//g, '-');
  const match = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  return year >= 2000 && year <= 2150;
};

/**
 * Returns a JavaScript Date corresponding to the exact Gregorian calendar instant in Nepal Standard Time (Asia/Kathmandu).
 */
export const getNepalDate = (date: any = new Date()): Date => {
  let d: Date;
  if (typeof date === 'object' && date !== null && 'seconds' in date && typeof date.seconds === 'number') {
    d = new Date(date.seconds * 1000);
  } else if (typeof date === 'object' && date !== null && typeof date.toDate === 'function') {
    d = date.toDate();
  } else if (date instanceof Date) {
    d = date;
  } else if (typeof date === 'number') {
    d = new Date(date);
  } else if (typeof date === 'string') {
    d = new Date(date);
  } else {
    d = new Date();
  }
  if (isNaN(d.getTime())) d = new Date();

  try {
    const nf = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kathmandu',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    });
    const parts = nf.formatToParts(d);
    const map: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== 'literal') {
        map[p.type] = parseInt(p.value, 10);
      }
    }
    return new Date(map.year, map.month - 1, map.day, map.hour === 24 ? 0 : map.hour, map.minute, map.second);
  } catch {
    // Fallback if Intl timeZone is unsupported (+5:45 offset)
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    return new Date(utc + (345 * 60000));
  }
};

/**
 * Robust, timezone-safe parsing from various date representations into NepaliDate instance.
 * Avoids UTC midnight day-shift bugs by converting timestamps to Nepal Standard Time.
 */
export const parseToNepaliDate = (date: any): any => {
  if (!date) return new NepaliDate(getNepalDate(new Date()));

  if (typeof date === 'object' && date !== null) {
    if ('seconds' in date && typeof date.seconds === 'number') {
      return new NepaliDate(getNepalDate(new Date(date.seconds * 1000)));
    }
    if ('toDate' in date && typeof date.toDate === 'function') {
      return new NepaliDate(getNepalDate(date.toDate()));
    }
    if (date instanceof Date) {
      return new NepaliDate(getNepalDate(date));
    }
  }

  if (typeof date === 'number') {
    return new NepaliDate(getNepalDate(new Date(date)));
  }

  if (typeof date === 'string') {
    const clean = date.trim().replace(/\//g, '-');
    const dStr = clean.split('T')[0];
    const parts = dStr.split('-');
    if (parts.length >= 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);

      // If year > 2040, it is already a BS date representation
      if (year > 2040 && !isNaN(month) && !isNaN(day)) {
        return new NepaliDate(year, Math.max(0, month - 1), Math.max(1, day));
      }

      // If Gregorian date-only string (e.g. "2026-03-15"), parse at local noon (12:00) in Nepal time to prevent drift
      if (year <= 2040 && !isNaN(month) && !isNaN(day)) {
        const localNoon = new Date(year, month - 1, day, 12, 0, 0);
        return new NepaliDate(localNoon);
      }
    }
    try {
      return new NepaliDate(getNepalDate(new Date(date)));
    } catch {
      return new NepaliDate(getNepalDate(new Date()));
    }
  }

  return new NepaliDate(getNepalDate(new Date()));
};

/**
 * Formats date into B.S. standard YYYY-MM-DD (e.g. 2083-06-17)
 */
export const formatBSDateYMD = (date: Date | string | number | any): string => {
  if (!date) return '';
  try {
    const nd = parseToNepaliDate(date);
    return nd.format('YYYY-MM-DD');
  } catch {
    if (typeof date === 'string') return date.split('T')[0];
    return '';
  }
};

/**
 * Formats date into standard user-facing B.S. date string (e.g. 17 Ashwin 2083 or 17 Ashwin 2083 B.S.)
 */
export const formatBSDate = (date: Date | string | number | any, withSuffix: boolean = false): string => {
  if (!date) return '';
  try {
    const nd = parseToNepaliDate(date);
    const formatted = nd.format('DD MMMM YYYY');
    return withSuffix ? `${formatted} B.S.` : formatted;
  } catch {
    if (typeof date === 'string') return date;
    return '';
  }
};

/**
 * Formats date and time into standard user-facing B.S. date-time string (e.g. 17 Ashwin 2083, 11:30 AM)
 */
export const formatBSDateTime = (date: Date | string | number | any): string => {
  if (!date) return '';
  try {
    const nd = parseToNepaliDate(date);
    let timeDate: Date;
    if (typeof date === 'object' && date !== null && 'seconds' in date) {
      timeDate = new Date(date.seconds * 1000);
    } else if (date instanceof Date) {
      timeDate = date;
    } else if (typeof date === 'number') {
      timeDate = new Date(date);
    } else if (typeof date === 'string' && !isBSDateString(date)) {
      timeDate = new Date(date);
    } else {
      timeDate = new Date();
    }

    const timeStr = isNaN(timeDate.getTime())
      ? ''
      : timeDate.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Kathmandu',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });

    const formatted = nd.format('DD MMMM YYYY');
    return timeStr ? `${formatted}, ${timeStr}` : formatted;
  } catch {
    if (typeof date === 'string') return date;
    return '';
  }
};

/**
 * Returns current Bikram Sambat year, month (0-indexed), and date
 */
export const getBSYearMonthDate = (date: Date = new Date()) => {
  try {
    const nd = new NepaliDate(date);
    return {
      year: nd.getYear(),
      month: nd.getMonth(),
      date: nd.getDate()
    };
  } catch {
    return { year: date.getFullYear() + 57, month: 0, date: 1 };
  }
};

/**
 * Returns today's B.S. date string in YYYY-MM-DD
 */
export const getTodayBSDateYMD = (): string => {
  try {
    return new NepaliDate(new Date()).format('YYYY-MM-DD');
  } catch {
    return '';
  }
};

/**
 * Normalizes B.S. date string formatting with dashes
 */
export const normalizeBSDateStr = (dateStr?: string): string => {
  if (!dateStr) return '';
  return dateStr.replace(/\//g, '-').trim();
};

/**
 * Returns -1 if date1 < date2, 0 if equal, 1 if date1 > date2 in BS chronology
 */
export const compareBSDates = (date1?: string, date2?: string): number => {
  const d1 = normalizeBSDateStr(date1);
  const d2 = normalizeBSDateStr(date2);
  if (!d1 && !d2) return 0;
  if (!d1) return -1;
  if (!d2) return 1;
  if (d1 < d2) return -1;
  if (d1 > d2) return 1;
  return 0;
};

/**
 * Checks if a BS validUntil date has passed relative to today's BS date
 */
export const isBsDateExpired = (validUntilBs?: string): boolean => {
  if (!validUntilBs) return false;
  const todayBs = getTodayBSDateYMD();
  if (!todayBs) return false;
  return compareBSDates(validUntilBs, todayBs) < 0;
};
