/**
 * Server-only Bikram Sambat (B.S.) date & time utility.
 * Safe for Vercel Node.js Serverless Function runtimes with zero client-side dependencies.
 */

// Safe dynamic resolution for nepali-date-converter across CJS and ESM environments
function getNepaliDateClass() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('nepali-date-converter');
    return mod.default || mod;
  } catch {
    return null;
  }
}

/**
 * Returns a JavaScript Date shifted to Asia/Kathmandu standard time (UTC+5:45).
 */
export function getNepalDate(dateInput: Date | string | number = new Date()): Date {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return new Date();
  
  // Format to Nepal local time string and parse back to Date
  try {
    const nptString = d.toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' });
    const nptDate = new Date(nptString);
    return isNaN(nptDate.getTime()) ? d : nptDate;
  } catch {
    // Fallback: manual offset calculation (+5h 45m = +345 minutes)
    const utcTime = d.getTime() + (d.getTimezoneOffset() * 60000);
    return new Date(utcTime + (345 * 60000));
  }
}

/**
 * Formats a given date/time into authoritative B.S. format for server emails.
 * e.g. "19 Ashwin 2083, 05:42 AM"
 */
export function formatBSDateTimeServer(dateInput: Date | string | number = new Date()): string {
  try {
    const rawDate = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const validDate = isNaN(rawDate.getTime()) ? new Date() : rawDate;

    // Time in Asia/Kathmandu
    const timeStr = validDate.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kathmandu',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const NepaliDateClass = getNepaliDateClass();
    if (NepaliDateClass) {
      const nptDate = getNepalDate(validDate);
      const nd = new NepaliDateClass(nptDate);
      const formattedDate = nd.format('DD MMMM YYYY');
      return timeStr ? `${formattedDate}, ${timeStr}` : formattedDate;
    }

    // Mathematical fallback if library cannot be loaded dynamically
    // Approximate B.S. offset is +56 years, 8 months, 17 days
    const npt = getNepalDate(validDate);
    const bsYear = npt.getFullYear() + 57;
    return `${bsYear} B.S., ${timeStr}`;
  } catch {
    return new Date().toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' });
  }
}
