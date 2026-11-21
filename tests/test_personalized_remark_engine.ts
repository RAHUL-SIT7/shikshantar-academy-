/**
 * Comprehensive Automated Test Suite for Personalized Academic Remark Engine & Marksheet
 * 
 * Verifies all 49+ scenarios covering:
 * - Grade boundaries (A+ to NG, exact 35%, 40%, 50%, 60%, 70%, 80%, 90%)
 * - Subject analysis (standout strengths, relative weaknesses, all-round balance)
 * - Component failures (Theory pass + Practical fail)
 * - Theory-only subjects (clean evaluation, practical '-' display)
 * - Missing marks (evaluated as INCOMPLETE, never zero or NG)
 * - Absenteeism (AB in one, multiple, all subjects; distinguished from failure)
 * - Multiple NG subjects
 * - Ties & equal scores
 * - Data integrity (empty, malformed, non-numeric, negative)
 * - Teacher remark precedence (Option A) & safe bold formatting (**text**)
 * - Qualitative (PG-UKG) and CAS (Grades 1-3) tiers
 * - Marksheet Pass-Mark Audit (7 distinct cases):
 *   1. Theory-only subject
 *   2. Theory + practical subject
 *   3. Only theory pass mark configured
 *   4. Only practical pass mark configured
 *   5. Both pass marks configured
 *   6. Missing required pass-mark configuration
 *   7. Invalid or non-numeric pass marks
 * - Strict Non-Fabrication of Pass Marks on Dual Subjects
 * - Assessment Data-Completeness Audit for Qualitative & CAS
 */

import {
  generatePersonalizedRemark,
  parseBoldMarkers,
  getSubjectPassMarkDisplay,
  FormattedRemark
} from '../src/lib/personalizedRemarkEngine';
import { getNepalGradePoint } from '../src/lib/nepalGradingEngine';

interface TestResult {
  id: string;
  scenario: string;
  expectedStatus: string;
  actualStatus: string;
  expectedBoldContains?: string[];
  actualRaw: string;
  pass: boolean;
  notes?: string;
}

const testResults: TestResult[] = [];

function assertTest(
  id: string,
  scenario: string,
  remark: FormattedRemark,
  expectedStatus: string,
  expectedTextIncludes: string[],
  expectedBoldIncludes: string[] = []
) {
  const statusMatch = remark.status === expectedStatus;
  const textMatches = expectedTextIncludes.every(sub => remark.rawText.toLowerCase().includes(sub.toLowerCase()));
  const boldTexts = remark.segments.filter(s => s.bold).map(s => s.text);
  const boldMatches = expectedBoldIncludes.every(b => boldTexts.some(bt => bt.toLowerCase().includes(b.toLowerCase())));

  const pass = statusMatch && textMatches && boldMatches;

  testResults.push({
    id,
    scenario,
    expectedStatus,
    actualStatus: remark.status,
    expectedBoldContains: expectedBoldIncludes,
    actualRaw: remark.rawText,
    pass,
    notes: pass ? 'Verified' : `Failed. Status Match: ${statusMatch} (${remark.status} vs ${expectedStatus}). Missing texts: ${expectedTextIncludes.filter(sub => !remark.rawText.toLowerCase().includes(sub.toLowerCase())).join('; ')}`
  });
}

console.log('================================================================================');
console.log('STARTING AUTOMATED TEST SUITE: PERSONALIZED ACADEMIC REMARK ENGINE');
console.log('================================================================================\n');

// --------------------------------------------------------------------------------
// GROUP 1: GRADE BOUNDARIES & NUMERICAL BANDS (A+ to D, and NG)
// --------------------------------------------------------------------------------

// Test 01: Exactly 100% (A+)
const r01 = generatePersonalizedRemark({
  studentName: 'Aarav Sharma',
  class: 'Class 8',
  percentage: 100,
  grade: 'A+',
  subjects: {
    'Mathematics': { fullMarks: 100, obtained: 100, hasTh: true, hasPr: false },
    'Science': { fullMarks: 100, obtained: 100, hasTh: true, hasPr: false }
  }
});
assertTest('TC-01', 'Exact 100% (A+) Outstanding Academic Excellence', r01, 'COMPLETE', ['outstanding academic excellence', 'mathematics'], ['outstanding academic excellence']);

// Test 02: Exactly 90.0% (A+ boundary)
const r02 = generatePersonalizedRemark({
  studentName: 'Binod Thapa',
  class: 'Class 8',
  percentage: 90.0,
  grade: 'A+',
  subjects: {
    'Mathematics': { fullMarks: 100, obtained: 95, hasTh: true, hasPr: false },
    'English': { fullMarks: 100, obtained: 85, hasTh: true, hasPr: false }
  }
});
assertTest('TC-02', 'Exact 90.0% (A+ Boundary)', r02, 'COMPLETE', ['outstanding academic excellence', 'mathematics'], ['outstanding academic excellence']);

// Test 03: 89.9% (A boundary)
const r03 = generatePersonalizedRemark({
  studentName: 'Chanda Rai',
  class: 'Class 8',
  percentage: 89.9,
  grade: 'A',
  subjects: {
    'Science': { fullMarks: 100, obtained: 90, hasTh: true, hasPr: false },
    'Social Studies': { fullMarks: 100, obtained: 89.8, hasTh: true, hasPr: false }
  }
});
assertTest('TC-03', '89.9% (A Boundary)', r03, 'COMPLETE', ['excellent', 'science'], ['excellent']);

// Test 04: Exactly 80.0% (A boundary)
const r04 = generatePersonalizedRemark({
  studentName: 'Deepak Joshi',
  class: 'Class 7',
  percentage: 80.0,
  grade: 'A',
  subjects: {
    'Mathematics': { fullMarks: 100, obtained: 80, hasTh: true, hasPr: false },
    'Nepali': { fullMarks: 100, obtained: 80, hasTh: true, hasPr: false }
  }
});
assertTest('TC-04', 'Exact 80.0% (A Boundary)', r04, 'COMPLETE', ['excellent', 'mathematics and nepali'], ['excellent conceptual understanding']);

// Test 05: 79.9% (B+ boundary)
const r05 = generatePersonalizedRemark({
  studentName: 'Elina Shrestha',
  class: 'Class 7',
  percentage: 79.9,
  grade: 'B+',
  subjects: {
    'English': { fullMarks: 100, obtained: 82, hasTh: true, hasPr: false },
    'Mathematics': { fullMarks: 100, obtained: 77.8, hasTh: true, hasPr: false }
  }
});
assertTest('TC-05', '79.9% (B+ Boundary)', r05, 'COMPLETE', ['very good', 'english'], ['very good']);

// Test 06: Exactly 70.0% (B+ boundary)
const r06 = generatePersonalizedRemark({
  studentName: 'Farhan Ali',
  class: 'Class 6',
  percentage: 70.0,
  grade: 'B+',
  subjects: {
    'Computer': { fullMarks: 100, obtained: 70, hasTh: true, hasPr: false },
    'Science': { fullMarks: 100, obtained: 70, hasTh: true, hasPr: false }
  }
});
assertTest('TC-06', 'Exact 70.0% (B+ Boundary)', r06, 'COMPLETE', ['very good', 'computer and science'], ['very good academic capability']);

// Test 07: 69.9% (B boundary)
const r07 = generatePersonalizedRemark({
  studentName: 'Gita Karki',
  class: 'Class 6',
  percentage: 69.9,
  grade: 'B',
  subjects: {
    'English': { fullMarks: 100, obtained: 72, hasTh: true, hasPr: false },
    'Nepali': { fullMarks: 100, obtained: 67.8, hasTh: true, hasPr: false }
  }
});
assertTest('TC-07', '69.9% (B Boundary)', r07, 'COMPLETE', ['good general', 'english'], ['good general']);

// Test 08: Exactly 60.0% (B boundary)
const r08 = generatePersonalizedRemark({
  studentName: 'Hari Prasad',
  class: 'Class 5',
  percentage: 60.0,
  grade: 'B',
  subjects: {
    'Science': { fullMarks: 100, obtained: 60, hasTh: true, hasPr: false },
    'Math': { fullMarks: 100, obtained: 60, hasTh: true, hasPr: false }
  }
});
assertTest('TC-08', 'Exact 60.0% (B Boundary)', r08, 'COMPLETE', ['good general', 'all subjects'], ['good general']);

// Test 09: 59.9% (C+ boundary)
const r09 = generatePersonalizedRemark({
  studentName: 'Ishwar Yadav',
  class: 'Class 5',
  percentage: 59.9,
  grade: 'C+',
  subjects: {
    'Mathematics': { fullMarks: 100, obtained: 62, hasTh: true, hasPr: false },
    'Nepali': { fullMarks: 100, obtained: 57.8, hasTh: true, hasPr: false }
  }
});
assertTest('TC-09', '59.9% (C+ Boundary)', r09, 'COMPLETE', ['satisfactory foundation'], ['satisfactory foundation']);

// Test 10: Exactly 50.0% (C+ boundary)
const r10 = generatePersonalizedRemark({
  studentName: 'Janak Bohara',
  class: 'Class 5',
  percentage: 50.0,
  grade: 'C+',
  subjects: {
    'Social': { fullMarks: 100, obtained: 50, hasTh: true, hasPr: false },
    'English': { fullMarks: 100, obtained: 50, hasTh: true, hasPr: false }
  }
});
assertTest('TC-10', 'Exact 50.0% (C+ Boundary)', r10, 'COMPLETE', ['satisfactory foundation'], ['satisfactory foundation']);

// Test 11: 49.9% (C boundary)
const r11 = generatePersonalizedRemark({
  studentName: 'Kiran KC',
  class: 'Class 4',
  percentage: 49.9,
  grade: 'C',
  subjects: {
    'Math': { fullMarks: 100, obtained: 52, hasTh: true, hasPr: false },
    'Science': { fullMarks: 100, obtained: 47.8, hasTh: true, hasPr: false }
  }
});
assertTest('TC-11', '49.9% (C Boundary)', r11, 'COMPLETE', ['acceptable passing standard'], ['acceptable passing standard']);

// Test 12: Exactly 40.0% (C boundary)
const r12 = generatePersonalizedRemark({
  studentName: 'Laxmi Tamang',
  class: 'Class 4',
  percentage: 40.0,
  grade: 'C',
  subjects: {
    'Math': { fullMarks: 100, obtained: 40, hasTh: true, hasPr: false },
    'Nepali': { fullMarks: 100, obtained: 40, hasTh: true, hasPr: false }
  }
});
assertTest('TC-12', 'Exact 40.0% (C Boundary)', r12, 'COMPLETE', ['acceptable passing standard'], ['acceptable passing standard']);

// Test 13: 39.9% (D boundary)
const r13 = generatePersonalizedRemark({
  studentName: 'Manish Giri',
  class: 'Class 4',
  percentage: 39.9,
  grade: 'D',
  subjects: {
    'English': { fullMarks: 100, obtained: 41, hasTh: true, hasPr: false },
    'Math': { fullMarks: 100, obtained: 38.8, hasTh: true, hasPr: false }
  }
});
assertTest('TC-13', '39.9% (D Boundary)', r13, 'COMPLETE', ['basic passing level'], ['basic passing level']);

// Test 14: Exactly 35.0% (D boundary - minimum passing score in Nepal letter grading)
const r14 = generatePersonalizedRemark({
  studentName: 'Nirajan Shah',
  class: 'Class 4',
  percentage: 35.0,
  grade: 'D',
  subjects: {
    'English': { fullMarks: 100, obtained: 35, hasTh: true, hasPr: false },
    'Nepali': { fullMarks: 100, obtained: 35, hasTh: true, hasPr: false }
  }
});
assertTest('TC-14', 'Exact 35.0% (D Minimum Pass)', r14, 'COMPLETE', ['basic passing level'], ['basic passing level']);

// Test 15: 34.9% (Below 35% -> NG Non-Graded)
const r15 = generatePersonalizedRemark({
  studentName: 'Omkar Basnet',
  class: 'Class 8',
  percentage: 34.9,
  grade: 'NG',
  subjects: {
    'Mathematics': { fullMarks: 100, obtained: 34, hasTh: true, hasPr: false },
    'Science': { fullMarks: 100, obtained: 35.8, hasTh: true, hasPr: false }
  }
});
assertTest('TC-15', '34.9% (NG Threshold)', r15, 'NG', ['non-graded (ng) level', 'mathematics'], ['non-graded (ng) level']);

// --------------------------------------------------------------------------------
// GROUP 2: SUBJECT ANALYSIS & STANDOUT / WEAK BALANCE
// --------------------------------------------------------------------------------

// Test 16: One standout subject (Math 98% vs other 80%)
const r16 = generatePersonalizedRemark({
  studentName: 'Pooja Bhatta',
  class: 'Class 9',
  percentage: 84.5,
  grade: 'A',
  subjects: {
    'Mathematics': { fullMarks: 100, obtained: 98, hasTh: true, hasPr: false },
    'English': { fullMarks: 100, obtained: 80, hasTh: true, hasPr: false },
    'Science': { fullMarks: 100, obtained: 78, hasTh: true, hasPr: false },
    'Nepali': { fullMarks: 100, obtained: 82, hasTh: true, hasPr: false }
  }
});
assertTest('TC-16', 'One Standout Subject (Math 98%)', r16, 'COMPLETE', ['mathematics', 'excellent conceptual understanding'], ['mathematics']);

// Test 17: Multiple equally strong subjects (Physics 95%, Chem 95%)
const r17 = generatePersonalizedRemark({
  studentName: 'Qasim Khan',
  class: 'Class 10',
  percentage: 94.0,
  grade: 'A+',
  subjects: {
    'Mathematics': { fullMarks: 100, obtained: 95, hasTh: true, hasPr: false },
    'Science': { fullMarks: 100, obtained: 95, hasTh: true, hasPr: false },
    'English': { fullMarks: 100, obtained: 92, hasTh: true, hasPr: false }
  }
});
assertTest('TC-17', 'Multiple Equally Strong Subjects', r17, 'COMPLETE', ['mathematics and science', 'outstanding academic excellence'], ['mathematics and science']);

// Test 18: High overall with one weak subject (A overall, Social 45%)
const r18 = generatePersonalizedRemark({
  studentName: 'Ramesh Chaudhary',
  class: 'Class 8',
  percentage: 81.0,
  grade: 'A',
  subjects: {
    'Mathematics': { fullMarks: 100, obtained: 95, hasTh: true, hasPr: false },
    'Science': { fullMarks: 100, obtained: 92, hasTh: true, hasPr: false },
    'English': { fullMarks: 100, obtained: 90, hasTh: true, hasPr: false },
    'Social Studies': { fullMarks: 100, obtained: 47, hasTh: true, hasPr: false }
  }
});
assertTest('TC-18', 'High Overall with Specific Weak Subject', r18, 'COMPLETE', ['social studies', 'additional time'], ['social studies']);

// --------------------------------------------------------------------------------
// GROUP 3: COMPONENT FAILURES (Theory Pass, Practical Fail)
// --------------------------------------------------------------------------------

// Test 19: Theory Pass (50/75), Practical Fail (5/25, pass mark 10) -> Subject NG
const r19 = generatePersonalizedRemark({
  studentName: 'Sarita Mahato',
  class: 'Class 9',
  percentage: 55.0,
  grade: 'NG',
  subjects: {
    'Science': {
      fullMarks: 100,
      thFull: 75,
      prFull: 25,
      thPass: 27,
      prPass: 10,
      thMarks: 50,
      prMarks: 5, // Failed practical (< 10)
      hasTh: true,
      hasPr: true
    },
    'Mathematics': { fullMarks: 100, obtained: 70, hasTh: true, hasPr: false }
  }
});
assertTest('TC-19', 'Practical Component Failure (< pass mark)', r19, 'NG', ['non-graded (ng) level', 'science'], ['non-graded (ng) level']);

// Test 20: Theory Fail (20/75, pass 27), Practical Pass (22/25) -> Subject NG
const r20 = generatePersonalizedRemark({
  studentName: 'Tek Bahadur',
  class: 'Class 9',
  percentage: 42.0,
  grade: 'NG',
  subjects: {
    'Computer': {
      fullMarks: 100,
      thFull: 75,
      prFull: 25,
      thPass: 27,
      prPass: 10,
      thMarks: 20, // Failed theory (< 27)
      prMarks: 22,
      hasTh: true,
      hasPr: true
    }
  }
});
assertTest('TC-20', 'Theory Component Failure', r20, 'NG', ['non-graded (ng) level', 'computer'], ['non-graded (ng) level']);

// --------------------------------------------------------------------------------
// GROUP 4: THEORY-ONLY SUBJECTS
// --------------------------------------------------------------------------------

// Test 21: Theory-Only Subject with prMarks as '-' or null
const r21 = generatePersonalizedRemark({
  studentName: 'Umesh Subedi',
  class: 'Class 10',
  percentage: 85.0,
  grade: 'A',
  subjects: {
    'Nepali': { fullMarks: 100, obtained: 85, prMarks: '-', hasTh: true, hasPr: false },
    'Mathematics': { fullMarks: 100, obtained: 85, prMarks: null, hasTh: true, hasPr: false }
  }
});
assertTest('TC-21', 'Theory-Only Subjects with "-" Practical', r21, 'COMPLETE', ['excellent conceptual understanding'], ['excellent conceptual understanding']);

// --------------------------------------------------------------------------------
// GROUP 5: MISSING MARKS (INCOMPLETE EVALUATION)
// --------------------------------------------------------------------------------

// Test 22: Missing Theory Mark (null)
const r22 = generatePersonalizedRemark({
  studentName: 'Vandana Mishra',
  class: 'Class 8',
  percentage: 80,
  subjects: {
    'Mathematics': { fullMarks: 100, thMarks: null, hasTh: true, hasPr: false },
    'Science': { fullMarks: 100, thMarks: 80, hasTh: true, hasPr: false }
  }
});
assertTest('TC-22', 'Missing Theory Mark (null) -> INCOMPLETE', r22, 'INCOMPLETE', ['marks entry is', 'incomplete for mathematics', 'pending completion'], ['incomplete', 'pending completion']);

// Test 23: Missing Practical Mark on Dual Component Subject (empty string "")
const r23 = generatePersonalizedRemark({
  studentName: 'Wasim Akram',
  class: 'Class 7',
  subjects: {
    'Science': { fullMarks: 100, thFull: 75, prFull: 25, thPass: 30, prPass: 10, thMarks: 60, prMarks: '', hasTh: true, hasPr: true }
  }
});
assertTest('TC-23', 'Missing Practical Mark ("") on Dual Subject -> INCOMPLETE', r23, 'INCOMPLETE', ['incomplete for science'], ['incomplete']);

// --------------------------------------------------------------------------------
// GROUP 6: ABSENCE (AB)
// --------------------------------------------------------------------------------

// Test 24: AB in One Subject
const r24 = generatePersonalizedRemark({
  studentName: 'Xitiz Shrestha',
  class: 'Class 6',
  percentage: 50,
  subjects: {
    'Mathematics': { fullMarks: 100, obtained: 'AB', hasTh: true, hasPr: false },
    'English': { fullMarks: 100, obtained: 70, hasTh: true, hasPr: false }
  }
});
assertTest('TC-24', 'Absent (AB) in One Subject', r24, 'ABSENT', ['absent (ab) in mathematics', 'non-graded (ng) pending formal examination re-assessment'], ['absent (ab) in mathematics']);

// Test 25: AB in All Subjects
const r25 = generatePersonalizedRemark({
  studentName: 'Yamini Sharma',
  class: 'Class 6',
  subjects: {
    'Mathematics': { fullMarks: 100, obtained: 'AB', hasTh: true, hasPr: false },
    'Science': { fullMarks: 100, obtained: 'AB', hasTh: true, hasPr: false }
  }
});
assertTest('TC-25', 'Absent (AB) in All Subjects', r25, 'ABSENT', ['absent (ab) in mathematics, science'], ['absent (ab) in mathematics, science']);

// --------------------------------------------------------------------------------
// GROUP 7: MULTIPLE NG SUBJECTS
// --------------------------------------------------------------------------------

// Test 26: Multiple NG Subjects
const r26 = generatePersonalizedRemark({
  studentName: 'Zainab Bibi',
  class: 'Class 8',
  percentage: 30,
  grade: 'NG',
  subjects: {
    'Mathematics': { fullMarks: 100, obtained: 25, hasTh: true, hasPr: false },
    'Science': { fullMarks: 100, obtained: 28, hasTh: true, hasPr: false },
    'Nepali': { fullMarks: 100, obtained: 50, hasTh: true, hasPr: false }
  }
});
assertTest('TC-26', 'Multiple NG Subjects', r26, 'NG', ['mathematics, science', 'remedial support'], ['non-graded (ng) level']);

// --------------------------------------------------------------------------------
// GROUP 8: DATA INTEGRITY & EDGE CASES
// --------------------------------------------------------------------------------

// Test 27: Empty Subject Map
const r27 = generatePersonalizedRemark({
  studentName: 'Anil Gupta',
  class: 'Class 5',
  subjects: {}
});
assertTest('TC-27', 'Empty Subjects Object', r27, 'INCOMPLETE', ['assessment data is', 'not yet available'], ['not yet available']);

// Test 28: Malformed Non-numeric Mark ("xyz")
const r28 = generatePersonalizedRemark({
  studentName: 'Bibek Sharma',
  class: 'Class 5',
  subjects: {
    'Mathematics': { fullMarks: 100, obtained: 'xyz', hasTh: true, hasPr: false }
  }
});
assertTest('TC-28', 'Malformed Non-Numeric Mark -> INCOMPLETE', r28, 'INCOMPLETE', ['incomplete for mathematics'], ['incomplete']);

// Test 29: Negative Mark (-10)
const r29 = generatePersonalizedRemark({
  studentName: 'Chetan Regmi',
  class: 'Class 5',
  subjects: {
    'Mathematics': { fullMarks: 100, obtained: -10, hasTh: true, hasPr: false }
  }
});
assertTest('TC-29', 'Negative Mark -> INCOMPLETE', r29, 'INCOMPLETE', ['incomplete for mathematics'], ['incomplete']);

// --------------------------------------------------------------------------------
// GROUP 9: TEACHER REMARK PRECEDENCE (OPTION A) & SAFE BOLD RENDERING
// --------------------------------------------------------------------------------

// Test 30: Manual Teacher Remark Present (Strict Precedence on Complete Assessments)
const r30 = generatePersonalizedRemark({
  studentName: 'Damodar Ojha',
  class: 'Class 7',
  percentage: 95,
  classTeacherRemark: 'Damodar has shown exemplary dedication in all laboratory projects.'
});
assertTest('TC-30', 'Manual Teacher Remark Strict Precedence', r30, 'TEACHER_OVERRIDE', ['damodar has shown exemplary dedication'], []);

// Test 31: Manual Teacher Remark with Bold Asterisks (**Math**)
const r31 = generatePersonalizedRemark({
  studentName: 'Damodar Ojha',
  class: 'Class 7',
  percentage: 85,
  classTeacherRemark: 'Remarkable improvement in **Mathematics** and **Science**.'
});
assertTest('TC-31', 'Manual Teacher Remark with Safe Bold Formatting', r31, 'TEACHER_OVERRIDE', ['remarkable improvement in mathematics and science.'], ['mathematics', 'science']);

// Test 32: Manual Teacher Remark with HTML-like Characters (<script>alert(1)</script>)
const r32 = generatePersonalizedRemark({
  studentName: 'Damodar Ojha',
  class: 'Class 7',
  classTeacherRemark: '<b>Excellent</b> performance <script>alert(1)</script>'
});
assertTest('TC-32', 'Teacher Remark with HTML Literal Safety (No Injection)', r32, 'TEACHER_OVERRIDE', ['<b>excellent</b> performance <script>alert(1)</script>'], []);

// Test 33: Empty Teacher Remark ("") Fallback to Automatic Generation
const r33 = generatePersonalizedRemark({
  studentName: 'Esha Dahal',
  class: 'Class 8',
  percentage: 92,
  grade: 'A+',
  classTeacherRemark: '', // Empty, should fall back to auto-generated remark
  subjects: {
    'Mathematics': { fullMarks: 100, obtained: 92, hasTh: true, hasPr: false }
  }
});
assertTest('TC-33', 'Empty String Teacher Remark Falls Back to Automatic', r33, 'COMPLETE', ['outstanding academic excellence'], ['outstanding academic excellence']);

// Test 34: Whitespace-only Teacher Remark ("   ") Fallback to Automatic Generation
const r34 = generatePersonalizedRemark({
  studentName: 'Firoz Khan',
  class: 'Class 8',
  percentage: 88,
  grade: 'A',
  classTeacherRemark: '   ', // Whitespace, should fall back
  subjects: {
    'Science': { fullMarks: 100, obtained: 88, hasTh: true, hasPr: false }
  }
});
assertTest('TC-34', 'Whitespace Teacher Remark Falls Back to Automatic', r34, 'COMPLETE', ['excellent conceptual understanding'], ['excellent conceptual understanding']);

// --------------------------------------------------------------------------------
// GROUP 10: QUALITATIVE & CAS TIERS
// --------------------------------------------------------------------------------

// Test 35: Early Childhood (Play Group / UKG) Qualitative Evaluation with Complete Marks
const r35 = generatePersonalizedRemark({
  studentName: 'Gaurav Koirala',
  class: 'UKG',
  subjects: {
    'Drawing': { fullMarks: 50, obtained: 45, hasTh: true, hasPr: false },
    'Rhymes': { fullMarks: 50, obtained: 48, hasTh: true, hasPr: false }
  }
});
assertTest('TC-35', 'Early Childhood (UKG) Qualitative Report', r35, 'COMPLETE', ['foundational developmental records maintained'], ['early learning and developmental milestones']);

// --------------------------------------------------------------------------------
// GROUP 11: CRITICAL CODE REVIEW SCENARIOS
// --------------------------------------------------------------------------------

// Scenario 1: Missing full marks
const r36 = generatePersonalizedRemark({
  studentName: 'Alok Gupta',
  class: 'Class 8',
  subjects: {
    'Mathematics': { obtained: 50, hasTh: true, hasPr: false } as any // fullMarks omitted
  }
});
assertTest('TC-36', 'Scenario 1: Missing Full Marks -> INCOMPLETE', r36, 'INCOMPLETE', ['marks entry is', 'incomplete for mathematics', 'pending completion'], ['incomplete', 'pending completion']);

// Scenario 2: Zero full marks
const r37 = generatePersonalizedRemark({
  studentName: 'Bina Sharma',
  class: 'Class 8',
  subjects: {
    'Science': { fullMarks: 0, obtained: 0, hasTh: true, hasPr: false } // zero full marks
  }
});
assertTest('TC-37', 'Scenario 2: Zero Full Marks -> INCOMPLETE', r37, 'INCOMPLETE', ['marks entry is', 'incomplete for science'], ['incomplete']);

// Scenario 3: Invalid full marks (negative or non-numeric)
const r38 = generatePersonalizedRemark({
  studentName: 'Chirag Thapa',
  class: 'Class 8',
  subjects: {
    'Nepali': { fullMarks: -100, obtained: 40, hasTh: true, hasPr: false } // negative full marks
  }
});
assertTest('TC-38', 'Scenario 3: Invalid Negative Full Marks -> INCOMPLETE', r38, 'INCOMPLETE', ['incomplete for nepali'], ['incomplete']);

// Scenario 4: Missing subject component configuration (neither hasTh nor hasPr provided)
const r39 = generatePersonalizedRemark({
  studentName: 'Dinesh KC',
  class: 'Class 7',
  subjects: {
    'Computer': { fullMarks: 100, obtained: 80 } as any // hasTh and hasPr both omitted
  }
});
assertTest('TC-39', 'Scenario 4: Missing Subject Component Configuration -> INCOMPLETE', r39, 'INCOMPLETE', ['incomplete for computer'], ['incomplete']);

// Scenario 5: Missing hasPr with unentered practical marks
const r40 = generatePersonalizedRemark({
  studentName: 'Ekata Shrestha',
  class: 'Class 7',
  subjects: {
    'Science': { fullMarks: 100, thMarks: 60, hasTh: true } as any // hasPr omitted, prMarks not provided
  }
});
assertTest('TC-40', 'Scenario 5: Missing hasPr With Unentered Practical Marks -> INCOMPLETE', r40, 'INCOMPLETE', ['incomplete for science'], ['incomplete']);

// Scenario 6: Required practical component missing (hasPr is true, practical marks unentered)
const r41 = generatePersonalizedRemark({
  studentName: 'Gopal Bhattarai',
  class: 'Class 9',
  subjects: {
    'Physics': { fullMarks: 100, thFull: 75, prFull: 25, thPass: 30, prPass: 10, thMarks: 65, prMarks: null, hasTh: true, hasPr: true }
  }
});
assertTest('TC-41', 'Scenario 6: Required Practical Component Missing -> INCOMPLETE', r41, 'INCOMPLETE', ['incomplete for physics'], ['incomplete']);

// Scenario 7: Theory-only subject without practical marks (hasTh=true, hasPr=false, prMarks null or '-')
const r42 = generatePersonalizedRemark({
  studentName: 'Hema Gurung',
  class: 'Class 8',
  percentage: 82.0,
  grade: 'A',
  subjects: {
    'History': { fullMarks: 100, thMarks: 82, prMarks: '-', hasTh: true, hasPr: false },
    'Civics': { fullMarks: 100, thMarks: 82, prMarks: null, hasTh: true, hasPr: false }
  }
});
assertTest('TC-42', 'Scenario 7: Theory-Only Subject Without Practical Marks -> COMPLETE', r42, 'COMPLETE', ['excellent conceptual understanding'], ['excellent conceptual understanding']);

// Scenario 8: Missing configured pass marks on dual-component subject (cannot fabricate 35%)
const r43 = generatePersonalizedRemark({
  studentName: 'Indra Prasad',
  class: 'Class 8',
  percentage: 75.0,
  grade: 'B+',
  subjects: {
    'Science': { fullMarks: 100, thFull: 75, prFull: 25, thMarks: 55, prMarks: 20, hasTh: true, hasPr: true } // thPass and prPass omitted
  }
});
assertTest('TC-43', 'Scenario 8: Missing Configured Pass Marks On Dual Subject -> INCOMPLETE', r43, 'INCOMPLETE', ['incomplete for science'], ['incomplete']);

// Scenario 9: Marks exceeding full marks
const r44 = generatePersonalizedRemark({
  studentName: 'Jaya Subedi',
  class: 'Class 9',
  subjects: {
    'Chemistry': { fullMarks: 100, thFull: 75, prFull: 25, thPass: 30, prPass: 10, thMarks: 85, prMarks: 20, hasTh: true, hasPr: true } // thMarks 85 > thFull 75
  }
});
assertTest('TC-44', 'Scenario 9: Marks Exceeding Full Marks -> INCOMPLETE', r44, 'INCOMPLETE', ['incomplete for chemistry'], ['incomplete']);

// Scenario 10: Incomplete marks with manual teacher remark
const r45 = generatePersonalizedRemark({
  studentName: 'Kishor Nepal',
  class: 'Class 8',
  classTeacherRemark: 'Kishor demonstrates outstanding effort in collaborative science projects.',
  subjects: {
    'Mathematics': { fullMarks: 100, thMarks: null, hasTh: true, hasPr: false } // Missing marks
  }
});
assertTest(
  'TC-45',
  'Scenario 10: Incomplete Marks With Manual Teacher Remark -> INCOMPLETE with Teacher Note',
  r45,
  'INCOMPLETE',
  [
    'marks entry is',
    'incomplete for mathematics',
    'pending completion',
    'kishor demonstrates outstanding effort in collaborative science projects.'
  ],
  ['incomplete', 'pending completion']
);

// Scenario 11: Teacher remark with empty and whitespace content
const r46 = generatePersonalizedRemark({
  studentName: 'Lina Dahal',
  class: 'Class 8',
  percentage: 95.0,
  grade: 'A+',
  classTeacherRemark: '    \n\t   ', // Whitespace only
  subjects: {
    'Mathematics': { fullMarks: 100, obtained: 95, hasTh: true, hasPr: false }
  }
});
assertTest('TC-46', 'Scenario 11: Teacher Remark With Whitespace -> Falls Back to Auto Remark', r46, 'COMPLETE', ['outstanding academic excellence', 'mathematics'], ['outstanding academic excellence']);

// Scenario 12: Qualitative assessment with no behavioural observations
const r47 = generatePersonalizedRemark({
  studentName: 'Madhav Aryal',
  class: 'NURSERY',
  subjects: {
    'Rhymes': { fullMarks: 50, obtained: 45, hasTh: true, hasPr: false }
  }
});
const r47Text = r47.rawText.toLowerCase();
const hasNoUnsupportedBehavior = !r47Text.includes('enthusiastic') && !r47Text.includes('engagement') && !r47Text.includes('discipline') && !r47Text.includes('social learning');
const r47Pass = r47.status === 'COMPLETE' && r47Text.includes('foundational developmental records maintained') && hasNoUnsupportedBehavior;
testResults.push({
  id: 'TC-47',
  scenario: 'Scenario 12: Qualitative Assessment Without Behavioural Observations',
  expectedStatus: 'COMPLETE',
  actualStatus: r47.status,
  expectedBoldContains: ['early learning and developmental milestones'],
  actualRaw: r47.rawText,
  pass: r47Pass,
  notes: r47Pass ? 'Verified neutral developmental language' : `Failed: Found unsupported behavioural words or missing neutral phrasing: "${r47.rawText}"`
});

// Scenario 13: CAS assessment with no unsupported observations
const r48 = generatePersonalizedRemark({
  studentName: 'Nabin Regmi',
  class: 'Class 2', // Lower Primary tier
  subjects: {
    'Nepali': { fullMarks: 50, obtained: 40, hasTh: true, hasPr: false },
    'Mathematics': { fullMarks: 50, obtained: 42, hasTh: true, hasPr: false }
  }
});
const r48Text = r48.rawText.toLowerCase();
const hasNoUnsupportedCAS = !r48Text.includes('steady progress') && !r48Text.includes('classroom participation') && !r48Text.includes('reading practice');
const r48Pass = r48.status === 'COMPLETE' && r48Text.includes('continuous assessment system (cas)') && hasNoUnsupportedCAS;
testResults.push({
  id: 'TC-48',
  scenario: 'Scenario 13: CAS Assessment Without Unsupported Observations',
  expectedStatus: 'COMPLETE',
  actualStatus: r48.status,
  expectedBoldContains: [],
  actualRaw: r48.rawText,
  pass: r48Pass,
  notes: r48Pass ? 'Verified neutral CAS curriculum language' : `Failed: Found unsupported claims or missing CAS language: "${r48.rawText}"`
});

// Scenario 14: Invalid subject configuration (thFull + prFull !== fullMarks)
const r49 = generatePersonalizedRemark({
  studentName: 'Prakash Pandey',
  class: 'Class 9',
  subjects: {
    'Biology': { fullMarks: 100, thFull: 60, prFull: 20, thPass: 24, prPass: 8, thMarks: 50, prMarks: 15, hasTh: true, hasPr: true } // 60 + 20 !== 100
  }
});
assertTest('TC-49', 'Scenario 14: Invalid Subject Configuration (thFull + prFull !== fullMarks) -> INCOMPLETE', r49, 'INCOMPLETE', ['incomplete for biology'], ['incomplete']);

// --------------------------------------------------------------------------------
// GROUP 12: QUALITATIVE & CAS DATA COMPLETENESS AUDIT
// --------------------------------------------------------------------------------

// Test 50: Qualitative Early Childhood with Unentered/Missing Marks -> INCOMPLETE
const r50 = generatePersonalizedRemark({
  studentName: 'Aarohi Sen',
  class: 'LKG',
  subjects: {
    'Rhymes': { fullMarks: 50, obtained: null, hasTh: true, hasPr: false }, // Unentered
    'Story': { fullMarks: 50, obtained: '', hasTh: true, hasPr: false }
  }
});
assertTest('TC-50', 'Early Childhood With Missing Marks -> INCOMPLETE (Never claims assessed)', r50, 'INCOMPLETE', ['assessment data is', 'incomplete for rhymes, story', 'pending completion'], ['incomplete', 'pending completion']);

// Test 51: CAS Lower Primary with Missing Marks -> INCOMPLETE
const r51 = generatePersonalizedRemark({
  studentName: 'Biraj Magar',
  class: 'Class 1',
  subjects: {
    'Nepali': { fullMarks: 50, obtained: null, hasTh: true, hasPr: false }
  }
});
assertTest('TC-51', 'CAS Lower Primary With Missing Marks -> INCOMPLETE (Never claims assessed)', r51, 'INCOMPLETE', ['assessment data is', 'incomplete for nepali', 'pending completion'], ['incomplete', 'pending completion']);

// --------------------------------------------------------------------------------
// GROUP 13: MARKSHEET PASS MARK DISPLAY AUDIT (7 SPECIFIC CASES)
// --------------------------------------------------------------------------------

// Audit Case 1: Theory-Only Subject
const pmCase1 = getSubjectPassMarkDisplay({ fullMarks: 100, thFull: 100, thPass: 40, hasTh: true, hasPr: false });
testResults.push({
  id: 'PM-01',
  scenario: 'Audit Pass Mark: Theory-Only Subject',
  expectedStatus: '40',
  actualStatus: String(pmCase1),
  actualRaw: String(pmCase1),
  pass: pmCase1 === 40,
  notes: pmCase1 === 40 ? 'Verified' : `Expected 40, got ${pmCase1}`
});

// Audit Case 2: Theory + Practical Dual Subject (Both configured)
const pmCase2 = getSubjectPassMarkDisplay({ fullMarks: 100, thFull: 75, prFull: 25, thPass: 30, prPass: 10, hasTh: true, hasPr: true });
testResults.push({
  id: 'PM-02',
  scenario: 'Audit Pass Mark: Theory + Practical Subject (Both configured)',
  expectedStatus: '40',
  actualStatus: String(pmCase2),
  actualRaw: String(pmCase2),
  pass: pmCase2 === 40,
  notes: pmCase2 === 40 ? 'Verified' : `Expected 40, got ${pmCase2}`
});

// Audit Case 3: Only Theory Pass Mark Configured on Dual Subject
const pmCase3 = getSubjectPassMarkDisplay({ fullMarks: 100, thFull: 75, prFull: 25, thPass: 30, hasTh: true, hasPr: true }); // prPass missing
testResults.push({
  id: 'PM-03',
  scenario: 'Audit Pass Mark: Only Theory Pass Mark Configured on Dual Subject (No silent zero)',
  expectedStatus: '-',
  actualStatus: String(pmCase3),
  actualRaw: String(pmCase3),
  pass: pmCase3 === '-',
  notes: pmCase3 === '-' ? 'Verified' : `Expected '-', got ${pmCase3}`
});

// Audit Case 4: Only Practical Pass Mark Configured on Dual Subject
const pmCase4 = getSubjectPassMarkDisplay({ fullMarks: 100, thFull: 75, prFull: 25, prPass: 10, hasTh: true, hasPr: true }); // thPass missing
testResults.push({
  id: 'PM-04',
  scenario: 'Audit Pass Mark: Only Practical Pass Mark Configured on Dual Subject (No silent zero)',
  expectedStatus: '-',
  actualStatus: String(pmCase4),
  actualRaw: String(pmCase4),
  pass: pmCase4 === '-',
  notes: pmCase4 === '-' ? 'Verified' : `Expected '-', got ${pmCase4}`
});

// Audit Case 5: Both Pass Marks Configured with custom values
const pmCase5 = getSubjectPassMarkDisplay({ fullMarks: 50, thFull: 35, prFull: 15, thPass: 14, prPass: 6, hasTh: true, hasPr: true });
testResults.push({
  id: 'PM-05',
  scenario: 'Audit Pass Mark: Both Pass Marks Configured with custom values (14 + 6 = 20)',
  expectedStatus: '20',
  actualStatus: String(pmCase5),
  actualRaw: String(pmCase5),
  pass: pmCase5 === 20,
  notes: pmCase5 === 20 ? 'Verified' : `Expected 20, got ${pmCase5}`
});

// Audit Case 6: Missing Required Pass-Mark Configuration
const pmCase6 = getSubjectPassMarkDisplay({ fullMarks: 100, hasTh: true, hasPr: false }); // No thPass configured
testResults.push({
  id: 'PM-06',
  scenario: 'Audit Pass Mark: Missing Required Pass Mark Configuration (Never fabricates value)',
  expectedStatus: '-',
  actualStatus: String(pmCase6),
  actualRaw: String(pmCase6),
  pass: pmCase6 === '-',
  notes: pmCase6 === '-' ? 'Verified' : `Expected '-', got ${pmCase6}`
});

// Audit Case 7: Invalid or Non-Numeric Pass Marks
const pmCase7a = getSubjectPassMarkDisplay({ fullMarks: 100, thPass: 'invalid', hasTh: true, hasPr: false });
const pmCase7b = getSubjectPassMarkDisplay({ fullMarks: 100, thPass: -10, hasTh: true, hasPr: false });
const pass7 = pmCase7a === '-' && pmCase7b === '-';
testResults.push({
  id: 'PM-07',
  scenario: 'Audit Pass Mark: Invalid or Non-Numeric Pass Marks (Negative or string)',
  expectedStatus: '-',
  actualStatus: `${pmCase7a}, ${pmCase7b}`,
  actualRaw: `${pmCase7a}, ${pmCase7b}`,
  pass: pass7,
  notes: pass7 ? 'Verified' : `Expected '-,-', got ${pmCase7a}, ${pmCase7b}`
});

// --------------------------------------------------------------------------------
// PRINT AUDIT REPORT
// --------------------------------------------------------------------------------

let passCount = 0;
let failCount = 0;

console.log('--------------------------------------------------------------------------------');
console.log('TEST RESULTS EVIDENCE:');
console.log('--------------------------------------------------------------------------------');

for (const res of testResults) {
  const mark = res.pass ? '✅ PASS' : '❌ FAIL';
  if (res.pass) passCount++;
  else failCount++;
  console.log(`${mark} [${res.id}] ${res.scenario}`);
  console.log(`       Status: ${res.actualStatus} | Output: "${res.actualRaw}"`);
  if (!res.pass) {
    console.log(`       Notes: ${res.notes}`);
  }
}

console.log('\n================================================================================');
console.log(`TOTAL SCENARIOS EXECUTED: ${testResults.length}`);
console.log(`PASSED: ${passCount}`);
console.log(`FAILED: ${failCount}`);
console.log('================================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
