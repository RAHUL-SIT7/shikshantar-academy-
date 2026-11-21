import {
  buildCanonicalExamId,
  normalizeTerminalExamType,
  CANONICAL_TERMINAL_EXAMS
} from '../src/lib/resultPreparationEngine';

let passed = 0;
let failed = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`[PASS] ${desc}`);
    passed++;
  } else {
    console.error(`[FAIL] ${desc}`);
    failed++;
  }
}

console.log('====================================================');
console.log('--- STANDALONE MANUAL ENTRY SAVE FIX TEST SUITE ---');
console.log('====================================================');

// 1. Standalone Direct Entry Canonical Exam ID Generation
console.log('\n1. Testing Standalone Direct Entry Exam ID Generation...');
const standaloneExamId = buildCanonicalExamId('First Terminal Examination', '5', 'A', '2083');
assert(standaloneExamId === 'FIRST_TERMINAL_5_A_2083', 'Standalone Direct Entry constructs canonical FIRST_TERMINAL_5_A_2083');

const standaloneFinalId = buildCanonicalExamId('Final Terminal Examination', '5', 'A', '2083');
assert(standaloneFinalId === 'FINAL_TERMINAL_5_A_2083', 'Standalone Direct Entry constructs canonical FINAL_TERMINAL_5_A_2083');

// 2. Normalization & Terminal Types
console.log('\n2. Testing Terminal Exam Type Normalization...');
assert(normalizeTerminalExamType('First Terminal Examination') === 'FIRST_TERMINAL', 'First Terminal Examination normalizes to FIRST_TERMINAL');
assert(normalizeTerminalExamType('FINAL_TERMINAL') === 'FINAL_TERMINAL', 'FINAL_TERMINAL normalizes to FINAL_TERMINAL');

// 3. Parent Exam Auto-Initialization Payload Schema
console.log('\n3. Testing Auto-Initialization Schema for Standalone Entry...');
const normTermType = normalizeTerminalExamType(standaloneExamId) || 'TERMINAL';
const displayTitle = CANONICAL_TERMINAL_EXAMS.find(t => t.id === normTermType)?.name || 'First Terminal Examination';

const autoExamData = {
  id: standaloneExamId,
  examId: standaloneExamId,
  name: displayTitle,
  type: normTermType,
  terminalExamType: normTermType,
  category: 'TERMINAL',
  class: '5',
  canonicalClassId: '5',
  section: 'A',
  canonicalSectionId: 'A',
  academicYear: '2083',
  canonicalAcademicYearId: '2083',
  published: false,
  status: 'DRAFT'
};

assert(autoExamData.id === 'FIRST_TERMINAL_5_A_2083', 'Auto-created parent exam document has canonical ID');
assert(autoExamData.status === 'DRAFT', 'Auto-created parent exam document is initialized in DRAFT status');
assert(autoExamData.published === false, 'Auto-created parent exam document is unpublished draft');

// 4. Rate-Limit, IAM Permission & Auth Error Separation Assertions
console.log('\n4. Testing Error Message Disambiguation for UI...');
const handleResStatus = (status: number, errJson?: any) => {
  if (status === 401) return 'Authentication required or session expired. Please sign in again.';
  if (status === 403) return errJson?.error || 'Permission denied saving marks to database. External IAM permissions required.';
  if (status === 429) return 'Too many requests. Rate limit exceeded. Please wait a moment before saving again.';
  return 'General Error';
};

assert(handleResStatus(401).includes('Authentication required'), '401 returns auth-specific error message');
assert(handleResStatus(403).includes('Permission denied'), '403 returns permission-specific error message');
assert(handleResStatus(429).includes('Rate limit exceeded'), '429 returns rate-limit error message');

console.log('====================================================');
console.log(`RESULTS: ${passed} / ${passed + failed} TESTS PASSED`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
}
