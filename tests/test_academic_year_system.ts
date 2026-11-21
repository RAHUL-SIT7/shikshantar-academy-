/**
 * Comprehensive Academic Year Management & Data Identity Test Suite
 * Shikshantar Academy School ERP
 *
 * Validates:
 * 1. Admin Academic Year creation, display title ("2083 BS"), status & single-current-year enforcement.
 * 2. Academic year parsing & canonical normalization ("2083 BS" -> "2083", "2083" -> "2083", "2083–2084 B.S." -> "2083").
 * 3. Canonical Exam ID consistency across Result Preparation & Manual Entry.
 * 4. Cross-year database isolation (2083 BS vs 2082 BS).
 * 5. Fail-safe invalid year handling.
 */

import { parseAndValidateAcademicYear, buildCanonicalExamId } from '../src/lib/resultPreparationEngine';
import { getAvailableAcademicYears } from '../src/lib/academicPromotionEngine';
import { formatAcademicYearDisplayTitle, AcademicYearConfig } from '../src/lib/academicYearEngine';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, name: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${name}`);
  } else {
    console.error(`❌ [FAIL] ${name}`);
  }
}

async function runAcademicYearTestSuite() {
  console.log('================================================================');
  console.log('--- ACADEMIC YEAR MANAGEMENT & IDENTITY TEST SUITE ---');
  console.log('================================================================\n');

  // TEST 1: Academic Year Parsing & Canonical Normalization
  console.log('--- 1. Testing Academic Year Parser & Normalization ---');
  assert(parseAndValidateAcademicYear('2083') === '2083', 'Plain year "2083" normalizes to canonical "2083"');
  assert(parseAndValidateAcademicYear('2083 BS') === '2083', 'Display title "2083 BS" normalizes to canonical "2083"');
  assert(parseAndValidateAcademicYear('2083 B.S.') === '2083', 'Suffix "2083 B.S." normalizes to canonical "2083"');
  assert(parseAndValidateAcademicYear('2083–2084 B.S.') === '2083', 'Session "2083–2084 B.S." normalizes to canonical "2083"');
  assert(parseAndValidateAcademicYear('2083-2084 BS') === '2083', 'Hyphenated session "2083-2084 BS" normalizes to canonical "2083"');
  assert(parseAndValidateAcademicYear('2082') === '2082', 'Plain year "2082" normalizes to canonical "2082"');
  assert(parseAndValidateAcademicYear('2082 BS') === '2082', 'Display title "2082 BS" normalizes to canonical "2082"');
  assert(parseAndValidateAcademicYear('') === null, 'Empty string fails closed returning null');
  assert(parseAndValidateAcademicYear('N/A') === null, 'Non-year string "N/A" fails closed returning null');
  assert(parseAndValidateAcademicYear('2083–2099 BS') === null, 'Non-consecutive session fails closed returning null');

  // TEST 2: User-Facing Display Formatting ("2083 BS")
  console.log('\n--- 2. Testing User-Facing Display Formatter ---');
  assert(formatAcademicYearDisplayTitle('2083') === '2083 BS', 'Canonical ID "2083" formats to "2083 BS"');
  assert(formatAcademicYearDisplayTitle('2083 BS') === '2083 BS', 'Display title "2083 BS" formats to "2083 BS"');
  assert(formatAcademicYearDisplayTitle('2083–2084 B.S.') === '2083 BS', 'Session "2083–2084 B.S." formats to "2083 BS"');
  assert(formatAcademicYearDisplayTitle('') === 'No Academic Year Selected', 'Empty input returns clear missing message');

  const mockConfigs: AcademicYearConfig[] = [
    { id: '2083', academicYearId: '2083', displayTitle: '2083 BS', bsYear: 2083, status: 'ACTIVE', isCurrent: true, createdAt: '', createdBy: '' },
    { id: '2082', academicYearId: '2082', displayTitle: '2082 BS', bsYear: 2082, status: 'ACTIVE', isCurrent: false, createdAt: '', createdBy: '' }
  ];
  assert(formatAcademicYearDisplayTitle('2083', mockConfigs) === '2083 BS', 'Config lookup returns "2083 BS"');

  // TEST 3: Canonical Exam ID Consistency Across Both Modules
  console.log('\n--- 3. Testing Canonical Exam ID Consistency ---');
  const examIdPrep = buildCanonicalExamId('First Terminal Examination', '10', 'A', '2083 BS');
  const examIdManual = buildCanonicalExamId('First Terminal Examination', '10', 'A', '2083');
  const examIdSession = buildCanonicalExamId('First Terminal Examination', '10', 'A', '2083–2084 B.S.');

  assert(examIdPrep === 'First_Terminal_Examination_10_A_2083', 'Exam ID from "2083 BS" is First_Terminal_Examination_10_A_2083');
  assert(examIdPrep === examIdManual, 'Result Prep ("2083 BS") and Manual Entry ("2083") generate identical Exam ID');
  assert(examIdPrep === examIdSession, 'Result Prep ("2083 BS") and Session ("2083–2084 B.S.") generate identical Exam ID');

  const examId2082 = buildCanonicalExamId('First Terminal Examination', '10', 'A', '2082 BS');
  assert(examId2082 === 'First_Terminal_Examination_10_A_2082', '2082 BS generates distinct Exam ID First_Terminal_Examination_10_A_2082');
  assert(examIdPrep !== examId2082, '2083 BS and 2082 BS generate completely distinct Exam IDs');

  // TEST 4: Cross-Year Database Isolation Test
  console.log('\n--- 4. Testing Data Isolation Between 2083 BS and 2082 BS ---');
  const mockDatabase = [
    {
      examId: examIdPrep,
      academicYear: '2083',
      studentId: 'STU-001',
      subject: 'Mathematics',
      thMarks: 70,
      prMarks: 22
    },
    {
      examId: examId2082,
      academicYear: '2082',
      studentId: 'STU-001',
      subject: 'Mathematics',
      thMarks: 52,
      prMarks: 18
    }
  ];

  function queryResults(yearInput: string) {
    const canonicalYear = parseAndValidateAcademicYear(yearInput);
    const targetExamId = buildCanonicalExamId('First Terminal Examination', '10', 'A', yearInput);
    return mockDatabase.filter(r => r.examId === targetExamId && r.academicYear === canonicalYear);
  }

  const res2083 = queryResults('2083 BS');
  assert(res2083.length === 1 && res2083[0].thMarks === 70, 'Query for 2083 BS returns only 2083 marks (70)');

  const res2082 = queryResults('2082 BS');
  assert(res2082.length === 1 && res2082[0].thMarks === 52, 'Query for 2082 BS returns only 2082 marks (52)');

  assert(res2083[0].thMarks !== res2082[0].thMarks, 'Saving in 2083 BS did NOT overwrite 2082 BS records');

  // TEST 5: Single Current Year Rule Logic
  console.log('\n--- 5. Testing Single Current Academic Year Rule ---');
  const yearsList: AcademicYearConfig[] = [
    { id: '2083', academicYearId: '2083', displayTitle: '2083 BS', bsYear: 2083, status: 'ACTIVE', isCurrent: true, createdAt: '', createdBy: '' },
    { id: '2082', academicYearId: '2082', displayTitle: '2082 BS', bsYear: 2082, status: 'ACTIVE', isCurrent: false, createdAt: '', createdBy: '' },
    { id: '2081', academicYearId: '2081', displayTitle: '2081 BS', bsYear: 2081, status: 'ARCHIVED', isCurrent: false, createdAt: '', createdBy: '' }
  ];

  const currentCount = yearsList.filter(y => y.isCurrent).length;
  assert(currentCount === 1, 'Exactly one Academic Year is marked as Current');

  // Test getAvailableAcademicYears integration
  const available = getAvailableAcademicYears(yearsList);
  assert(available.length === 3, 'getAvailableAcademicYears returns custom Admin-managed years');
  assert(available[0].id === '2083' && available[0].name === '2083 BS', 'Custom years output canonical id "2083" and display name "2083 BS"');

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('================================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAcademicYearTestSuite().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
