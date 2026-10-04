import NepaliDateImport from 'nepali-date-converter';
const NepaliDate: any = (NepaliDateImport as any)?.default || NepaliDateImport;
import { isBsDateExpired, isBSDateString, parseToNepaliDate, getTodayBSDateYMD, compareBSDates, formatBSDateYMD } from './src/lib/nepaliDate';

interface Notice {
  id: string;
  title: string;
  priority: string;
  status: string;
  targets: string[];
  recipientUids?: string[];
  date: string;
  validUntil?: string;
  isPinned?: boolean;
  message?: string;
  readBy?: string[];
  displayDurationDays?: number;
  timestamp?: any;
}

export const isNoticePopupEligible = (notice: Notice, referenceDate: Date = new Date()): boolean => {
  if (!notice || notice.status !== 'Published') return false;

  // 1. Explicit Expiry Date Check (B.S. date)
  if (notice.validUntil && isBsDateExpired(notice.validUntil)) {
    return false;
  }

  // 2. Authoritative Popup Duration in Days (Default is strictly 7 days)
  const durationDays = (notice.displayDurationDays !== undefined && !isNaN(Number(notice.displayDurationDays)) && Number(notice.displayDurationDays) > 0)
    ? Number(notice.displayDurationDays)
    : 7;

  // 3. Compute publication NepaliDate safely
  let pubNepaliDate: any;
  if (notice.date && isBSDateString(notice.date)) {
    pubNepaliDate = parseToNepaliDate(notice.date);
  } else if (notice.timestamp) {
    pubNepaliDate = parseToNepaliDate(notice.timestamp);
  } else if (notice.date) {
    pubNepaliDate = parseToNepaliDate(notice.date);
  } else {
    pubNepaliDate = parseToNepaliDate(referenceDate);
  }

  const todayNepali = parseToNepaliDate(referenceDate);

  // Compare days elapsed using Gregorian conversion of canonical BS dates at noon
  const pubJsDate = pubNepaliDate.toJsDate ? pubNepaliDate.toJsDate() : new Date();
  const todayJsDate = todayNepali.toJsDate ? todayNepali.toJsDate() : new Date();

  const pubMidnight = new Date(pubJsDate.getFullYear(), pubJsDate.getMonth(), pubJsDate.getDate()).getTime();
  const todayMidnight = new Date(todayJsDate.getFullYear(), todayJsDate.getMonth(), todayJsDate.getDate()).getTime();

  const diffDays = Math.floor((todayMidnight - pubMidnight) / (1000 * 60 * 60 * 24));

  // If notice date is in future (diffDays < 0) or older than allowed popup duration (diffDays > durationDays), ineligible for popup
  if (diffDays < 0 || diffDays > durationDays) {
    return false;
  }

  return true;
};

console.log('================================================================');
console.log('🧪 RUNNING NOTICE POPUP 7-DAY EXPIRY & REALITY VERIFICATION');
console.log('================================================================');

const todayBs = getTodayBSDateYMD();
console.log('Current System Today BS Date:', todayBs);

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${msg}`);
    failed++;
  }
}

// 1. 7-day notice before expiry -> popup
const notice1: Notice = {
  id: 'n1',
  title: 'Annual Sports Meet',
  priority: 'Normal',
  status: 'Published',
  targets: ['All'],
  date: todayBs,
  displayDurationDays: 7
};
assert(isNoticePopupEligible(notice1) === true, 'Notice published today with 7-day duration is popup eligible');

// 2. 7-day notice at day 5 -> popup
const day5Ago = formatBSDateYMD(new Date(Date.now() - 5 * 86400000));
const notice2: Notice = {
  id: 'n2',
  title: 'Midterm Routine',
  priority: 'Normal',
  status: 'Published',
  targets: ['All'],
  date: day5Ago,
  displayDurationDays: 7
};
assert(isNoticePopupEligible(notice2) === true, '5-day old notice with 7-day duration is popup eligible');

// 3. Expired unread notice (8 days old with 7-day duration) -> NO popup
const day8Ago = formatBSDateYMD(new Date(Date.now() - 8 * 86400000));
const notice3: Notice = {
  id: 'n3',
  title: 'Holiday Circular',
  priority: 'Normal',
  status: 'Published',
  targets: ['All'],
  date: day8Ago,
  displayDurationDays: 7
};
assert(isNoticePopupEligible(notice3) === false, '8-day old notice with 7-day duration is strictly NOT popup eligible');

// 4. Expired urgent notice (8 days old, Urgent) -> NO popup
const notice4: Notice = {
  id: 'n4',
  title: 'Urgent Weather Warning',
  priority: 'Urgent',
  status: 'Published',
  targets: ['All'],
  date: day8Ago,
  displayDurationDays: 7
};
assert(isNoticePopupEligible(notice4) === false, 'Expired Urgent notice does NOT bypass 7-day popup expiry');

// 5. Expired pinned notice (8 days old, Pinned) -> NO popup
const notice5: Notice = {
  id: 'n5',
  title: 'Pinned Admission Announcement',
  priority: 'Normal',
  isPinned: true,
  status: 'Published',
  targets: ['All'],
  date: day8Ago,
  displayDurationDays: 7
};
assert(isNoticePopupEligible(notice5) === false, 'Expired Pinned notice does NOT bypass 7-day popup expiry');

// 6. Notice with explicit validUntil in past -> NO popup
const yesterdayBs = formatBSDateYMD(new Date(Date.now() - 86400000));
const notice6: Notice = {
  id: 'n6',
  title: 'Special Parent Meeting',
  priority: 'Urgent',
  isPinned: true,
  status: 'Published',
  targets: ['All'],
  date: todayBs,
  validUntil: yesterdayBs,
  displayDurationDays: 7
};
assert(isNoticePopupEligible(notice6) === false, 'Notice with past validUntil BS date is strictly NOT popup eligible');

// 7. Notice with validUntil in future -> popup
const nextWeekBs = formatBSDateYMD(new Date(Date.now() + 7 * 86400000));
const notice7: Notice = {
  id: 'n7',
  title: 'Fee Discount Deadline',
  priority: 'Normal',
  status: 'Published',
  targets: ['All'],
  date: todayBs,
  validUntil: nextWeekBs,
  displayDurationDays: 7
};
assert(isNoticePopupEligible(notice7) === true, 'Notice with future validUntil is popup eligible within duration');

// 8. Custom configured 3-day duration notice on Day 4 -> NO popup
const day4Ago = formatBSDateYMD(new Date(Date.now() - 4 * 86400000));
const notice8: Notice = {
  id: 'n8',
  title: 'One-Day Workshop',
  priority: 'Normal',
  status: 'Published',
  targets: ['All'],
  date: day4Ago,
  displayDurationDays: 3
};
assert(isNoticePopupEligible(notice8) === false, 'Notice exceeding custom 3-day duration (at day 4) is NOT popup eligible');

// 9. Draft notice published today -> NO popup
const notice9: Notice = {
  id: 'n9',
  title: 'Draft Circular',
  priority: 'Urgent',
  status: 'Draft',
  targets: ['All'],
  date: todayBs,
  displayDurationDays: 7
};
assert(isNoticePopupEligible(notice9) === false, 'Draft notice is strictly NOT popup eligible');

// 10. Month / Year boundary transition test (e.g. Chaitra 30 to Baisakh 1)
const chaitraEndBs = '2082-12-30';
const baisakhStartBs = '2083-01-01';
assert(compareBSDates(chaitraEndBs, baisakhStartBs) < 0, 'Year boundary comparison 2082-12-30 < 2083-01-01 is chronologically exact');

console.log('================================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================');

if (failed > 0) process.exit(1);
