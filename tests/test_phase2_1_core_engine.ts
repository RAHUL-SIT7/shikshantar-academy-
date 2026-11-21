/**
 * Test Suite: Phase 2.1 Step 1 — Core Engine Verification
 * Tests:
 * 1. Academic Year Parser (valid BS, sessions with -, –, —, and invalid inputs)
 * 2. Canonical Exam ID generation & historical compatibility & invalid input rejection
 * 3. Lifecycle state transitions & role constraints
 * 4. Teacher assignment key derivation & section 'All' expansion
 * 5. Class Teacher 4D authorization with fail-closed checks
 */

import {
  parseAndValidateAcademicYear,
  buildCanonicalExamId,
  validateLifecycleTransition,
  isPrimaryClassTeacher,
  canPublishClassResult,
  ExamLifecycleStatus
} from '../src/lib/resultPreparationEngine';

import {
  generateAssignmentKey,
  deriveTeacherAssignmentKeys,
  getCanonicalSubjectKey,
  STANDARD_SUBJECTS
} from '../src/lib/teacherAssignmentEngine';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName}`);
  }
}

console.log('====================================================');
console.log('--- PHASE 2.1 STEP 1 CORE ENGINE TEST SUITE ---');
console.log('====================================================\n');

// ----------------------------------------------------
// 1. ACADEMIC YEAR PARSER TESTS
// ----------------------------------------------------
console.log('1. Testing Academic Year Parser...');
assert(parseAndValidateAcademicYear('2083') === '2083', 'Single BS year "2083"');
assert(parseAndValidateAcademicYear('2083–2084 B.S.') === '2083', 'Session with en-dash "2083–2084 B.S."');
assert(parseAndValidateAcademicYear('2083-2084 BS') === '2083', 'Session with hyphen "2083-2084 BS"');
assert(parseAndValidateAcademicYear('2083—2084 BS') === '2083', 'Session with em-dash "2083—2084 BS"');
assert(parseAndValidateAcademicYear('') === null, 'Empty string returns null');
assert(parseAndValidateAcademicYear('N/A') === null, 'String "N/A" returns null');
assert(parseAndValidateAcademicYear('20832084') === null, 'Concatenated year "20832084" returns null');
assert(parseAndValidateAcademicYear('2083–2090 B.S.') === null, 'Non-consecutive session "2083–2090 B.S." returns null');
assert(parseAndValidateAcademicYear('2083–2083 BS') === null, 'Identical years session "2083–2083 BS" returns null');
assert(parseAndValidateAcademicYear('2083–invalid') === null, 'Malformed session "2083–invalid" returns null');
assert(parseAndValidateAcademicYear(null) === null, 'null input returns null');
assert(parseAndValidateAcademicYear(undefined) === null, 'undefined input returns null');

// ----------------------------------------------------
// 2. CANONICAL EXAM ID GENERATION & COMPATIBILITY
// ----------------------------------------------------
console.log('\n2. Testing Canonical Exam ID Generation...');
assert(
  buildCanonicalExamId('First Terminal', 'Class 5', 'A', '2083–2084 B.S.', { category: 'TERMINAL' }) === 'FIRST_TERMINAL_5_A_2083',
  'Full 4-dimensional canonical exam ID'
);
assert(
  buildCanonicalExamId('Final', '5', 'All', '2083', { category: 'TERMINAL' }) === 'FINAL_TERMINAL_5_A_2083',
  'Section "All" omitted from canonical ID with FINAL_TERMINAL'
);
assert(
  buildCanonicalExamId('First Terminal', 'Class 5') === 'FIRST_TERMINAL_5_A_2083',
  'Historical backward-compatible 2-part ID (no section, no year) normalizes to 4D canonical ID'
);
assert(
  buildCanonicalExamId('First Terminal', '5', 'B') === 'FIRST_TERMINAL_5_B_2083',
  'Historical 3-part ID with section normalizes to 4D canonical ID'
);

let caughtInvalidYear = false;
try {
  buildCanonicalExamId('First Terminal', '5', 'A', 'invalid-year');
} catch (e: any) {
  caughtInvalidYear = e.message.includes('INVALID_ACADEMIC_YEAR');
}
assert(caughtInvalidYear, 'buildCanonicalExamId throws on invalid academic year');

// ----------------------------------------------------
// 3. LIFECYCLE TRANSITIONS & ROLE RESTRICTIONS
// ----------------------------------------------------
console.log('\n3. Testing Lifecycle Transition Engine...');

// Valid sequence: NOT STARTED -> DRAFT -> READY FOR REVIEW -> PUBLISHED
assert(
  validateLifecycleTransition({
    currentStatus: 'NOT STARTED',
    targetStatus: 'DRAFT',
    userRole: 'teacher',
    targetClass: '5',
    hasEntries: true
  }).allowed === true,
  'NOT STARTED -> DRAFT allowed when marks entered'
);

assert(
  validateLifecycleTransition({
    currentStatus: 'NOT STARTED',
    targetStatus: 'DRAFT',
    userRole: 'teacher',
    targetClass: '5',
    hasEntries: false
  }).allowed === false,
  'NOT STARTED -> DRAFT rejected when no entries'
);

assert(
  validateLifecycleTransition({
    currentStatus: 'DRAFT',
    targetStatus: 'READY FOR REVIEW',
    userRole: 'teacher',
    targetClass: '5',
    allSubjectsComplete: true
  }).allowed === true,
  'DRAFT -> READY FOR REVIEW allowed when all subjects complete'
);

assert(
  validateLifecycleTransition({
    currentStatus: 'DRAFT',
    targetStatus: 'READY FOR REVIEW',
    userRole: 'teacher',
    targetClass: '5',
    allSubjectsComplete: false
  }).allowed === false,
  'DRAFT -> READY FOR REVIEW rejected when subjects incomplete'
);

// Subject teacher cannot publish
const subjectTeacherProfile = {
  primaryClassTeacher: '',
  primaryClassTeacherYear: '',
  primaryClassTeacherSection: ''
};
assert(
  validateLifecycleTransition({
    currentStatus: 'READY FOR REVIEW',
    targetStatus: 'PUBLISHED',
    userRole: 'teacher',
    teacherProfile: subjectTeacherProfile,
    targetClass: '5',
    targetAcademicYear: '2083',
    targetSection: 'A'
  }).allowed === false,
  'Subject Teacher strictly denied from publishing'
);

// Authorized Class teacher can publish
const classTeacherProfile = {
  primaryClassTeacher: '5',
  primaryClassTeacherYear: '2083',
  primaryClassTeacherSection: 'All'
};
assert(
  validateLifecycleTransition({
    currentStatus: 'READY FOR REVIEW',
    targetStatus: 'PUBLISHED',
    userRole: 'teacher',
    teacherProfile: classTeacherProfile,
    targetClass: '5',
    targetAcademicYear: '2083',
    targetSection: 'A'
  }).allowed === true,
  'Authorized Class Teacher can publish from READY FOR REVIEW'
);

// Admin can publish
assert(
  validateLifecycleTransition({
    currentStatus: 'READY FOR REVIEW',
    targetStatus: 'PUBLISHED',
    userRole: 'admin',
    targetClass: '5'
  }).allowed === true,
  'Admin can publish from READY FOR REVIEW'
);

// Invalid jump: NOT STARTED -> PUBLISHED
assert(
  validateLifecycleTransition({
    currentStatus: 'NOT STARTED',
    targetStatus: 'PUBLISHED',
    userRole: 'admin',
    targetClass: '5'
  }).allowed === false,
  'Direct jump NOT STARTED -> PUBLISHED rejected'
);

// Reopening published exam rejected for teachers
assert(
  validateLifecycleTransition({
    currentStatus: 'PUBLISHED',
    targetStatus: 'DRAFT',
    userRole: 'teacher',
    teacherProfile: classTeacherProfile,
    targetClass: '5'
  }).allowed === false,
  'Teachers cannot reopen published exam (reopen forbidden)'
);

// ----------------------------------------------------
// 4. TEACHER ASSIGNMENT KEYS & SECTION 'ALL'
// ----------------------------------------------------
// ----------------------------------------------------
// 4. TEACHER ASSIGNMENT KEYS & SECTION 'ALL'
// ----------------------------------------------------
console.log('\n4. Testing Teacher Assignment Keys...');

assert(getCanonicalSubjectKey('Opt. Math') === 'Opt.Math', 'Canonical key for Opt. Math preserves dot');
assert(getCanonicalSubjectKey('Social Studies') === 'SocialStudies', 'Canonical key for Social Studies');
assert(getCanonicalSubjectKey('Mathematics') === 'Mathematics', 'Canonical key for Mathematics');

// Test unknown subjects return empty string (no custom-subject fallback)
assert(getCanonicalSubjectKey('Robotics & AI') === '', 'Unknown subject "Robotics & AI" returns empty string');
assert(getCanonicalSubjectKey('Data Science') === '', 'Unknown subject "Data Science" returns empty string');
assert(getCanonicalSubjectKey('Custom Subject') === '', 'Unknown subject "Custom Subject" returns empty string');
assert(getCanonicalSubjectKey('') === '', 'Empty subject returns empty string');

assert(
  generateAssignmentKey('Class 5', 'Mathematics', 'A', '2083') === '5_Mathematics_A_2083',
  'generateAssignmentKey for specific section'
);
assert(
  generateAssignmentKey('5', 'Opt. Math', 'All', '2083') === '5_Opt.Math_All_2083',
  'generateAssignmentKey for section All'
);
assert(
  generateAssignmentKey('', 'Mathematics', 'A', '2083') === '',
  'generateAssignmentKey fails closed on empty class'
);
assert(
  generateAssignmentKey('5', 'Robotics & AI', 'A', '2083') === '',
  'generateAssignmentKey fails closed for unknown subject'
);

// Test deriveTeacherAssignmentKeys
const sampleAssignments = [
  { class: '5', subject: 'Mathematics', section: 'A', academicYear: '2083' },
  { class: 'Class 6', subject: 'Opt. Math', section: 'All', academicYear: '2083' },
  { class: '', subject: 'English', section: 'A', academicYear: '2083' }, // invalid class
  { class: '5', subject: 'Unknown Robotics', section: 'A', academicYear: '2083' } // invalid subject
];
const derivedKeys = deriveTeacherAssignmentKeys(sampleAssignments);

assert(derivedKeys.includes('5_Mathematics_A_2083'), 'Includes specific section key');
assert(derivedKeys.includes('6_Opt.Math_All_2083'), 'Includes section All key');
assert(derivedKeys.includes('6_Opt.Math_A_2083'), 'Expands section All to section A');
assert(derivedKeys.includes('6_Opt.Math_B_2083'), 'Expands section All to section B');
assert(derivedKeys.includes('6_Opt.Math_C_2083'), 'Expands section All to section C');
assert(!derivedKeys.some(k => k.includes('English')), 'Skips invalid assignment with empty class');
assert(!derivedKeys.some(k => k.includes('Robotics')), 'Skips invalid assignment with unknown subject');

// ----------------------------------------------------
// 5. CLASS TEACHER 4D AUTHORIZATION & FAIL-CLOSED
// ----------------------------------------------------
console.log('\n5. Testing Class Teacher Authorization (Fail-Closed)...');

// Explicit matching profile
assert(
  isPrimaryClassTeacher(
    { primaryClassTeacher: '5', primaryClassTeacherYear: '2083', primaryClassTeacherSection: 'A' },
    '5',
    '2083',
    'A'
  ) === true,
  'Class teacher matches exact class, year, and section'
);

// Section All matches any target section
assert(
  isPrimaryClassTeacher(
    { primaryClassTeacher: 'Class 5', primaryClassTeacherYear: '2083', primaryClassTeacherSection: 'All' },
    '5',
    '2083',
    'B'
  ) === true,
  'Explicit section All in profile authorizes any section'
);

// Teacher with specific section A cannot access section B
assert(
  isPrimaryClassTeacher(
    { primaryClassTeacher: '5', primaryClassTeacherYear: '2083', primaryClassTeacherSection: 'A' },
    '5',
    '2083',
    'B'
  ) === false,
  'Mismatched section fails closed'
);

// Target section All fails closed if teacher is only assigned to section A
assert(
  isPrimaryClassTeacher(
    { primaryClassTeacher: '5', primaryClassTeacherYear: '2083', primaryClassTeacherSection: 'A' },
    '5',
    '2083',
    'All'
  ) === false,
  'Specific section A teacher cannot claim All section authority'
);

// Missing section fails closed
assert(
  isPrimaryClassTeacher(
    { primaryClassTeacher: '5', primaryClassTeacherYear: '2083' },
    '5',
    '2083',
    'A'
  ) === false,
  'Missing section assignment fails closed'
);

// Missing academic year in profile fails closed
assert(
  isPrimaryClassTeacher(
    { primaryClassTeacher: '5', primaryClassTeacherSection: 'All' },
    '5',
    '2083',
    'A'
  ) === false,
  'Missing academic year in profile fails closed'
);

// Missing target academic year fails closed
assert(
  isPrimaryClassTeacher(
    { primaryClassTeacher: '5', primaryClassTeacherYear: '2083', primaryClassTeacherSection: 'All' },
    '5',
    '',
    'A'
  ) === false,
  'Empty target academic year fails closed'
);

// Missing target section fails closed
assert(
  isPrimaryClassTeacher(
    { primaryClassTeacher: '5', primaryClassTeacherYear: '2083', primaryClassTeacherSection: 'All' },
    '5',
    '2083',
    ''
  ) === false,
  'Empty target section fails closed'
);

// classAssignedYear fallback is strictly removed
assert(
  isPrimaryClassTeacher(
    { primaryClassTeacher: '5', classAssignedYear: '2083', primaryClassTeacherSection: 'All' },
    '5',
    '2083',
    'A'
  ) === false,
  'classAssignedYear fallback strictly removed - must use primaryClassTeacherYear'
);

// Mismatched class fails closed
assert(
  isPrimaryClassTeacher(
    { primaryClassTeacher: '6', primaryClassTeacherYear: '2083', primaryClassTeacherSection: 'All' },
    '5',
    '2083',
    'A'
  ) === false,
  'Mismatched class fails closed'
);

// Mismatched academic year fails closed
assert(
  isPrimaryClassTeacher(
    { primaryClassTeacher: '5', primaryClassTeacherYear: '2082', primaryClassTeacherSection: 'All' },
    '5',
    '2083',
    'A'
  ) === false,
  'Mismatched academic year fails closed'
);

// Legacy class fallback removed
assert(
  isPrimaryClassTeacher(
    { class: '5', primaryClassTeacherYear: '2083', primaryClassTeacherSection: 'All' },
    '5',
    '2083',
    'A'
  ) === false,
  'Legacy profile without primaryClassTeacher fails closed'
);

// canPublishClassResult check
assert(
  canPublishClassResult('teacher', { primaryClassTeacher: '5', primaryClassTeacherYear: '2083', primaryClassTeacherSection: 'All' }, '5', '2083', 'A') === true,
  'canPublishClassResult allows authorized Class Teacher'
);
assert(
  canPublishClassResult('teacher', { primaryClassTeacher: '5', primaryClassTeacherYear: '2082', primaryClassTeacherSection: 'All' }, '5', '2083', 'A') === false,
  'canPublishClassResult denies teacher with mismatched year'
);
assert(
  canPublishClassResult('teacher', { primaryClassTeacher: '5', primaryClassTeacherYear: '2083', primaryClassTeacherSection: 'A' }, '5', '2083', 'B') === false,
  'canPublishClassResult denies teacher with mismatched section'
);
assert(
  canPublishClassResult('teacher', { primaryClassTeacher: '5', primaryClassTeacherYear: '2083', primaryClassTeacherSection: 'All' }, '5', '', 'A') === false,
  'canPublishClassResult denies when academic year is missing'
);

console.log('\n====================================================');
console.log(`RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log('====================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
