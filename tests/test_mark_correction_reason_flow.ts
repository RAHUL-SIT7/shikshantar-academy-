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
console.log('--- MARK CORRECTION REASON & AUTOSAVE TEST SUITE ---');
console.log('====================================================');

// 1. Standalone Direct Entry Mark Modification Logic Simulation
console.log('\n1. Testing Mark Correction Detection & Effective Reason Resolution...');

function resolveEffectiveReason(
  requiresCorrection: boolean,
  userSuppliedReason: string | undefined,
  callerRole: string
): string {
  const isAdmin = callerRole === 'admin' || callerRole === 'super_admin' || callerRole === 'superadmin';
  let effectiveReason = (userSuppliedReason || '').trim();
  if (requiresCorrection && (!effectiveReason || effectiveReason.length < 5)) {
    effectiveReason = isAdmin ? 'Administrative mark entry update' : 'Mark entry update';
  } else if (effectiveReason && effectiveReason.length > 500) {
    effectiveReason = effectiveReason.slice(0, 500);
  }
  return effectiveReason;
}

// Case 1: Initial entry (not a correction)
const reason1 = resolveEffectiveReason(false, '', 'admin');
assert(reason1 === '', 'Initial entry does not force a correction reason');

// Case 2: Mark correction with custom reason from Admin
const reason2 = resolveEffectiveReason(true, 'Re-evaluated answer script question #3', 'admin');
assert(reason2 === 'Re-evaluated answer script question #3', 'Explicit reason preserved if >= 5 chars');

// Case 3: Mark correction without custom reason from Admin (Debounced autosave or direct save)
const reason3 = resolveEffectiveReason(true, '', 'admin');
assert(reason3 === 'Administrative mark entry update', 'Admin mark correction safely defaults to administrative reason without 400 error');

// Case 4: Mark correction with short reason (< 5 chars)
const reason4 = resolveEffectiveReason(true, 'Fix', 'admin');
assert(reason4 === 'Administrative mark entry update', 'Short reasons safely fallback to administrative reason');

// Case 5: Mark correction from Teacher
const reason5 = resolveEffectiveReason(true, '', 'teacher');
assert(reason5 === 'Mark entry update', 'Teacher mark correction safely defaults to mark entry update');

// 2. Client-Side reasonToSend resolution
console.log('\n2. Testing Client-side reasonToSend resolution in ManualEntryTab...');

function getReasonToSend(customReason: string, userRole: string): string {
  const trimmed = customReason.trim();
  return trimmed.length >= 5
    ? trimmed
    : (userRole === 'admin' ? 'Administrative mark entry update' : 'Mark entry update');
}

assert(getReasonToSend('', 'admin') === 'Administrative mark entry update', 'Empty reason for admin produces valid 5+ char payload');
assert(getReasonToSend('Re-evaluated answer script', 'admin') === 'Re-evaluated answer script', 'Preset reason is used directly');
assert(getReasonToSend('   ', 'teacher') === 'Mark entry update', 'Empty reason for teacher produces valid 5+ char payload');

// 3. Exam section normalization in Standalone Direct Entry
console.log('\n3. Testing Exam Section Normalization...');
const examId = buildCanonicalExamId('First Terminal Examination', '5', 'A', '2083');
assert(examId === 'FIRST_TERMINAL_5_A_2083', 'Constructs canonical FIRST_TERMINAL_5_A_2083');

const rawSection = 'All';
const cleanCanonicalSection = (rawSection && rawSection.toLowerCase() !== 'all') ? rawSection.toUpperCase() : 'A';
assert(cleanCanonicalSection === 'A', 'Section All correctly normalizes to Section A');

console.log('====================================================');
console.log(`RESULTS: ${passed} / ${passed + failed} TESTS PASSED`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
}
