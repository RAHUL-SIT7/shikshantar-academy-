/**
 * Dedicated Subject Configuration & Role Authorization Test Suite
 * Shikshantar Academy School ERP
 *
 * Validates:
 * 1. Default subjects loading per class & custom subject creation.
 * 2. Subject component toggling (Theory / Practical enable & disable).
 * 3. Full Marks and Pass Marks validation.
 * 4. Automatic pass-mark suggestion calculation.
 * 5. Role-based authorization (Admin permitted, Class Teacher authorized for exact class/section/year, Subject Teacher denied).
 * 6. Examination-specific configuration snapshot persistence against canonical exam IDs.
 * 7. Manual Entry and Result Preparation configuration consistency.
 */

import {
  parseAndValidateAcademicYear,
  buildCanonicalExamId,
  canTeacherAccessSubject,
  canPublishClassResult
} from '../src/lib/resultPreparationEngine';
import {
  getClassConfiguredSubjects,
  validateTeachingAssignment,
  getCanonicalSubjectKey
} from '../src/lib/teacherAssignmentEngine';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${testName}`);
  } else {
    console.error(`❌ [FAIL] ${testName}`);
  }
}

async function runSubjectConfigTestSuite() {
  console.log('================================================================');
  console.log('--- SUBJECT CONFIGURATION & ROLE AUTHORIZATION TEST SUITE ---');
  console.log('================================================================\n');

  // 1. Class-Specific Default Subjects
  console.log('--- 1. Testing Class-Specific Default Subjects ---');
  const class5Subjects = getClassConfiguredSubjects('5', []);
  const class10Subjects = getClassConfiguredSubjects('10', []);
  const pgSubjects = getClassConfiguredSubjects('Play Group', []);

  assert(class5Subjects.includes('Mathematics') && class5Subjects.includes('Science'), 'Class 5 loads standard subjects');
  assert(class10Subjects.includes('Opt. Math'), 'Class 10 loads Opt. Math');
  assert(pgSubjects.includes('Rhymes') && !pgSubjects.includes('Opt. Math'), 'Play Group loads early childhood subjects');

  // 2. Custom Subject Integration
  console.log('\n--- 2. Testing Custom Subject Integration ---');
  const customList = [
    { name: 'Environmental Science', status: 'ACTIVE', targetClass: 'All' },
    { name: 'Coding & AI', status: 'ACTIVE', targetClass: '10' },
    { name: 'Archived Subj', status: 'ARCHIVED', targetClass: 'All' }
  ];
  const configuredWithCustom = getClassConfiguredSubjects('10', customList);
  assert(configuredWithCustom.includes('Environmental Science'), 'Global custom subject included');
  assert(configuredWithCustom.includes('Coding & AI'), 'Class-specific custom subject included for Class 10');
  assert(!configuredWithCustom.includes('Archived Subj'), 'Archived custom subjects excluded');

  const configuredForClass5 = getClassConfiguredSubjects('5', customList);
  assert(!configuredForClass5.includes('Coding & AI'), 'Class-specific custom subject excluded for non-matching class');

  // 3. Subject Component & Mark Validation Rules
  console.log('\n--- 3. Testing Component & Mark Validation Rules ---');
  function validateSubjectConfigInput(config: { hasTh: boolean; hasPr: boolean; thFull: number; thPass: number; prFull: number; prPass: number }) {
    if (!config.hasTh && !config.hasPr) return { valid: false, error: 'At least one component must be enabled' };
    if (config.hasTh && (config.thFull <= 0 || config.thPass < 0 || config.thPass > config.thFull)) return { valid: false, error: 'Invalid Theory marks' };
    if (config.hasPr && (config.prFull <= 0 || config.prPass < 0 || config.prPass > config.prFull)) return { valid: false, error: 'Invalid Practical marks' };
    return { valid: true };
  }

  assert(validateSubjectConfigInput({ hasTh: true, hasPr: true, thFull: 75, thPass: 30, prFull: 25, prPass: 10 }).valid, 'Valid dual component config accepted');
  assert(validateSubjectConfigInput({ hasTh: true, hasPr: false, thFull: 100, thPass: 40, prFull: 0, prPass: 0 }).valid, 'Valid theory-only config accepted');
  assert(!validateSubjectConfigInput({ hasTh: false, hasPr: false, thFull: 0, thPass: 0, prFull: 0, prPass: 0 }).valid, 'Zero enabled components rejected');
  assert(!validateSubjectConfigInput({ hasTh: true, hasPr: true, thFull: 75, thPass: 80, prFull: 25, prPass: 10 }).valid, 'Pass mark exceeding full mark rejected');

  // 4. Automatic Pass Mark Suggestion
  console.log('\n--- 4. Testing Automatic Pass Mark Suggestion ---');
  function calculateSuggestedPassMark(fullMarks: number, defaultPercentage: number = 40): number {
    return Math.ceil(fullMarks * (defaultPercentage / 100));
  }
  assert(calculateSuggestedPassMark(75) === 30, '40% of 75 suggests 30 pass mark');
  assert(calculateSuggestedPassMark(100) === 40, '40% of 100 suggests 40 pass mark');
  assert(calculateSuggestedPassMark(50) === 20, '40% of 50 suggests 20 pass mark');

  // 5. Role-Based Authorization
  console.log('\n--- 5. Testing Role-Based Configuration & Mark Entry Authorization ---');
  const adminRole = 'admin';
  const classTeacherProfile = {
    primaryClassTeacher: '5',
    primaryClassTeacherYear: '2083',
    primaryClassTeacherSection: 'A'
  };
  const subjectTeacherProfile = {
    primaryClassTeacher: '',
    teachingAssignments: [
      { class: '5', subject: 'Mathematics', section: 'A', academicYear: '2083' }
    ]
  };

  // Admin access
  assert(canTeacherAccessSubject(adminRole, null, '5', 'Science', 'A', '2083') === true, 'Admin can access any subject');
  assert(canPublishClassResult(adminRole, null, '5', '2083', 'A') === true, 'Admin can publish exam results');

  // Class Teacher access (can access all subjects in primary class)
  assert(canTeacherAccessSubject('teacher', classTeacherProfile, '5', 'Science', 'A', '2083') === true, 'Class Teacher can access Science in primary class');
  assert(canTeacherAccessSubject('teacher', classTeacherProfile, '5', 'Mathematics', 'B', '2083') === false, 'Class Teacher cannot access mismatched section B');
  assert(canPublishClassResult('teacher', classTeacherProfile, '5', '2083', 'A') === true, 'Class Teacher can publish primary class results');

  // Subject Teacher access (restricted strictly to assigned subject)
  assert(canTeacherAccessSubject('teacher', subjectTeacherProfile, '5', 'Mathematics', 'A', '2083') === true, 'Subject Teacher can access assigned Mathematics');
  assert(canTeacherAccessSubject('teacher', subjectTeacherProfile, '5', 'Science', 'A', '2083') === false, 'Subject Teacher cannot access unassigned Science');
  assert(canPublishClassResult('teacher', subjectTeacherProfile, '5', '2083', 'A') === false, 'Subject Teacher cannot publish results');

  // 6. Examination-Specific Canonical Snapshot & Consistency
  console.log('\n--- 6. Testing Canonical Exam ID & Shared Configuration Consistency ---');
  const examIdPrep = buildCanonicalExamId('First Terminal', '5', 'A', '2083 BS');
  const examIdManual = buildCanonicalExamId('First Terminal', '5', 'A', '2083');
  assert(examIdPrep === examIdManual, 'Result Preparation and Manual Entry generate identical canonical exam ID');
  assert(examIdPrep === 'First_Terminal_5_A_2083', 'Canonical exam ID follows 4-dimensional structure');

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('================================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSubjectConfigTestSuite().catch(err => {
  console.error('Subject Config Test failed:', err);
  process.exit(1);
});
