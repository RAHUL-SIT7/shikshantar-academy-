import NepaliDate from 'nepali-date-converter';

const parseToNepaliDate = (date: Date | string | number) => {
  if (typeof date === 'string') {
    const dStr = date.split('T')[0];
    const year = parseInt(dStr.substring(0, 4), 10);
    // If year > 2040, assume it's already a BS string
    if (year > 2040 && dStr.includes('-')) {
      const [y, m, d] = dStr.split('-').map(Number);
      return new NepaliDate(y, m - 1, d);
    }
  }
  return new NepaliDate(new Date(date));
};

export const formatBSDateYMD = (date: Date | string | number): string => {
  try {
    const nd = parseToNepaliDate(date);
    return nd.format('YYYY-MM-DD'); 
  } catch(e) {
    if (typeof date === 'string') return date.split('T')[0];
    return new Date(date).toISOString().split('T')[0];
  }
}

export const formatBSDate = (date: Date | string | number): string => {
  try {
    const nd = parseToNepaliDate(date);
    return nd.format('DD MMMM YYYY'); 
  } catch(e) {
    if (typeof date === 'string') return date;
    return new Date(date).toLocaleDateString();
  }
}

export const formatBSDateTime = (date: Date | string | number): string => {
  try {
    const nd = parseToNepaliDate(date);
    const d = typeof date === 'string' && parseInt(date.substring(0,4)) > 2040 
       ? new Date() // fallback for time if it's pure BS date string without time
       : new Date(date);
       
    return nd.format('DD MMMM YYYY') + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); 
  } catch(e) {
    if (typeof date === 'string') return date;
    return new Date(date).toLocaleString();
  }
}

export const getBSYearMonthDate = (date: Date = new Date()) => {
  try {
    const nd = new NepaliDate(date);
    return {
      year: nd.getYear(),
      month: nd.getMonth(),
      date: nd.getDate()
    };
  } catch (e) {
    return { year: date.getFullYear() + 57, month: 0, date: 1 };
  }
}

export const getTodayBSDateYMD = (): string => {
  try {
    return new NepaliDate(new Date()).format('YYYY-MM-DD');
  } catch (e) {
    return '';
  }
};

export const normalizeBSDateStr = (dateStr?: string): string => {
  if (!dateStr) return '';
  return dateStr.replace(/\//g, '-').trim();
};

/**
 * Returns -1 if date1 < date2, 0 if equal, 1 if date1 > date2
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
