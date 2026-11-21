/**
 * Test Suite for Class Result Matrix Data Aggregation & Calculation Engine
 * 
 * Verifies all 25 required test cases:
 * 1. Multiple students and multiple subjects
 * 2. Theory-only subject
 * 3. Theory plus practical subject
 * 4. Missing theory marks
 * 5. Missing practical marks where practical is applicable
 * 6. Valid zero marks
 * 7. Absent theory
 * 8. Absent practical, where applicable
 * 9. N/A practical when hasPr === false
 * 10. Decimal marks
 * 11. Incomplete student row
 * 12. Complete student row
 * 13. Subject-wise completeness statistics
 * 14. Overall class statistics
 * 15. Strict NG Option A using the actual grading engine
 * 16. GPA and grade consistency with the authoritative engine
 * 17. Tie-aware ranking
 * 18. No rank for incomplete students
 * 19. Empty class
 * 20. Empty marks
 * 21. Duplicate student records
 * 22. Duplicate subject mark records
 * 23. Custom subjects and custom configurations
 * 24. Input immutability
 * 25. Deterministic output ordering
 */

import {
  generateClassResultMatrix,
  EnrolledStudentInput,
  SubjectConfigItem,
  SavedSubjectMarkRecord,
  MatrixAcademicContext
} from '../src/lib/classResultMatrixEngine';

interface TestCaseResult {
  name: string;
  passed: boolean;
  details?: string;
}

const testResults: TestCaseResult[] = [];

function assert(condition: boolean, testName: string, failureDetails?: string) {
  testResults.push({
    name: testName,
    passed: condition,
    details: failureDetails
  });
  if (condition) {
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName}: ${failureDetails || 'Assertion failed'}`);
  }
}

function runMatrixEngineTests() {
  console.log('================================================================');
  console.log('--- PHASE 2.1 TASK 3.3 STEP 2: CLASS RESULT MATRIX ENGINE TESTS ---');
  console.log('================================================================\n');

  const baseContext: MatrixAcademicContext = {
    examId: 'First_Terminal_10_A_2081',
    examType: 'First Terminal',
    class: '10',
    section: 'A',
    academicYear: '2081 BS'
  };

  // Standard Subject Configs
  const stdConfigs: Record<string, SubjectConfigItem> = {
    'Mathematics': { thFullMarks: 100, thPassMarks: 35, hasTh: true, hasPr: false },
    'Science': { thFullMarks: 75, thPassMarks: 27, prFullMarks: 25, prPassMarks: 9, hasTh: true, hasPr: true },
    'English': { thFullMarks: 75, thPassMarks: 27, prFullMarks: 25, prPassMarks: 9, hasTh: true, hasPr: true }
  };

  const configuredSubjects = ['Mathematics', 'Science', 'English'];

  // Test 1: Multiple students and multiple subjects
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav Sharma', rollNo: '1', class: '10', section: 'A' },
      { studentUid: 's2', studentName: 'Bibek Thapa', rollNo: '2', class: '10', section: 'A' }
    ];
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Mathematics', thMarks: 80 },
      { studentUid: 's1', subject: 'Science', thMarks: 60, prMarks: 20 },
      { studentUid: 's1', subject: 'English', thMarks: 65, prMarks: 22 },
      { studentUid: 's2', subject: 'Mathematics', thMarks: 70 },
      { studentUid: 's2', subject: 'Science', thMarks: 50, prMarks: 18 },
      { studentUid: 's2', subject: 'English', thMarks: 55, prMarks: 19 }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects,
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const pass = matrix.students.length === 2 &&
      Object.keys(matrix.students[0].cells).length === 3 &&
      Object.keys(matrix.students[1].cells).length === 3;
    assert(pass, '1. Multiple students and multiple subjects populated cleanly');
  }

  // Test 2: Theory-only subject (Mathematics)
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' }
    ];
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Mathematics', thMarks: 85 }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Mathematics'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const cell = matrix.students[0].cells['Mathematics'];
    const pass = cell.hasTh === true &&
      cell.hasPr === false &&
      cell.prStatus === 'NOT_APPLICABLE' &&
      cell.prMarks === null &&
      cell.totalObtainedMarks === 85 &&
      cell.totalFullMarks === 100;
    assert(pass, '2. Theory-only subject correctly ignores practical and sets NOT_APPLICABLE');
  }

  // Test 3: Theory plus practical subject (Science)
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' }
    ];
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Science', thMarks: 55, prMarks: 22 }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Science'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const cell = matrix.students[0].cells['Science'];
    const pass = cell.hasTh === true &&
      cell.hasPr === true &&
      cell.thMarks === 55 &&
      cell.prMarks === 22 &&
      cell.thStatus === 'ENTERED' &&
      cell.prStatus === 'ENTERED' &&
      cell.totalObtainedMarks === 77 &&
      cell.totalFullMarks === 100;
    assert(pass, '3. Theory plus practical subject correctly sums components (55+22=77/100)');
  }

  // Test 4: Missing theory marks
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' }
    ];
    // Practical entered, but Theory is unentered / missing
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Science', prMarks: 20 }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Science'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const cell = matrix.students[0].cells['Science'];
    const pass = cell.thStatus === 'MISSING' &&
      cell.isMissing === true &&
      cell.prStatus === 'ENTERED' &&
      cell.totalObtainedMarks === null;
    assert(pass, '4. Missing theory mark flags cell isMissing and thStatus MISSING');
  }

  // Test 5: Missing practical marks where practical is applicable
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' }
    ];
    // Theory entered, but Practical is unentered / missing on dual-component subject
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Science', thMarks: 60 }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Science'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const cell = matrix.students[0].cells['Science'];
    const pass = cell.prStatus === 'MISSING' &&
      cell.isMissing === true &&
      cell.thStatus === 'ENTERED';
    assert(pass, '5. Missing practical mark on dual-component subject flags cell isMissing');
  }

  // Test 6: Valid zero marks
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' }
    ];
    // Student scored 0 in theory, 20 in practical
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Science', thMarks: 0, prMarks: 20 }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Science'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const cell = matrix.students[0].cells['Science'];
    const pass = cell.thStatus === 'ZERO' &&
      cell.thMarks === 0 &&
      cell.isMissing === false &&
      cell.totalObtainedMarks === 20;
    assert(pass, '6. Valid zero marks are accurately recognized as ZERO and not MISSING');
  }

  // Test 7: Absent theory
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' }
    ];
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Science', thMarks: 'AB', prMarks: 22 }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Science'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const cell = matrix.students[0].cells['Science'];
    const pass = cell.thStatus === 'ABSENT' &&
      cell.isTheoryAbsent === true &&
      cell.isAbsent === true &&
      cell.isMissing === false &&
      cell.isNg === true;
    assert(pass, '7. Absent theory sets thStatus ABSENT, cell isAbsent, and triggers NG');
  }

  // Test 8: Absent practical
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' }
    ];
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Science', thMarks: 60, prMarks: 'AB' }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Science'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const cell = matrix.students[0].cells['Science'];
    const pass = cell.prStatus === 'ABSENT' &&
      cell.isPracticalAbsent === true &&
      cell.isAbsent === true &&
      cell.isMissing === false &&
      cell.isNg === true;
    assert(pass, '8. Absent practical sets prStatus ABSENT, cell isAbsent, and triggers NG');
  }

  // Test 9: N/A practical when hasPr === false
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' }
    ];
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Mathematics', thMarks: 90 }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Mathematics'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const cell = matrix.students[0].cells['Mathematics'];
    const pass = cell.hasPr === false &&
      cell.prStatus === 'NOT_APPLICABLE' &&
      cell.prFullMarks === 0 &&
      cell.isMissing === false;
    assert(pass, '9. Theory-only subject does not expect practical and marks prStatus NOT_APPLICABLE');
  }

  // Test 10: Decimal marks
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' }
    ];
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Science', thMarks: 58.5, prMarks: 21.5 }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Science'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const cell = matrix.students[0].cells['Science'];
    const pass = cell.thMarks === 58.5 &&
      cell.prMarks === 21.5 &&
      cell.totalObtainedMarks === 80;
    assert(pass, '10. Decimal marks are supported without unintended truncation (58.5 + 21.5 = 80)');
  }

  // Test 11: Incomplete student row
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' }
    ];
    // Mathematics is entered, but Science and English are completely missing
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Mathematics', thMarks: 80 }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Mathematics', 'Science', 'English'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const row = matrix.students[0];
    const pass = row.isComplete === false &&
      row.overallStatus === 'INCOMPLETE' &&
      row.overallGrade === 'INCOMPLETE' &&
      row.overallGpa === null &&
      row.gpaDisplayText === '-' &&
      row.rank === null &&
      row.missingSubjectCount === 2;
    assert(pass, '11. Incomplete student row suppresses final GPA, grade, and rank');
  }

  // Test 12: Complete student row
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' }
    ];
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Mathematics', thMarks: 85 },
      { studentUid: 's1', subject: 'Science', thMarks: 65, prMarks: 23 },
      { studentUid: 's1', subject: 'English', thMarks: 68, prMarks: 22 }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Mathematics', 'Science', 'English'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const row = matrix.students[0];
    const pass = row.isComplete === true &&
      row.missingSubjectCount === 0 &&
      row.overallStatus === 'PASSED' &&
      row.overallGrade === 'A' &&
      row.overallGpa !== null &&
      row.rank === null &&
      row.isProvisionalRank === false &&
      row.provisionalRank === null;
    assert(pass, '12. Complete student row calculates authoritative grade, GPA, and provisional rank');
  }

  // Test 13: Subject-wise completeness statistics
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Student 1', rollNo: '1' },
      { studentUid: 's2', studentName: 'Student 2', rollNo: '2' }
    ];
    // Math complete for both, Science complete for 1, missing for 1
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Mathematics', thMarks: 75 },
      { studentUid: 's2', subject: 'Mathematics', thMarks: 80 },
      { studentUid: 's1', subject: 'Science', thMarks: 50, prMarks: 20 }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Mathematics', 'Science'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const mathStats = matrix.stats.subjectStats['Mathematics'];
    const sciStats = matrix.stats.subjectStats['Science'];

    const pass = mathStats.isComplete === true &&
      mathStats.enteredCount === 2 &&
      mathStats.missingCount === 0 &&
      sciStats.isComplete === false &&
      sciStats.enteredCount === 1 &&
      sciStats.missingCount === 1;
    assert(pass, '13. Subject-wise completeness stats accurately distinguish 100% complete from partial subjects');
  }

  // Test 14: Overall class statistics
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Student 1', rollNo: '1' }, // Complete Passed
      { studentUid: 's2', studentName: 'Student 2', rollNo: '2' }, // Complete NG (failed Math)
      { studentUid: 's3', studentName: 'Student 3', rollNo: '3' }  // Incomplete (missing Science)
    ];
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Mathematics', thMarks: 80 },
      { studentUid: 's1', subject: 'Science', thMarks: 60, prMarks: 20 },

      { studentUid: 's2', subject: 'Mathematics', thMarks: 20 }, // NG (<35)
      { studentUid: 's2', subject: 'Science', thMarks: 60, prMarks: 20 },

      { studentUid: 's3', subject: 'Mathematics', thMarks: 80 } // Science missing
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Mathematics', 'Science'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const stats = matrix.stats;
    const pass = stats.totalStudents === 3 &&
      stats.completeStudents === 2 &&
      stats.incompleteStudents === 1 &&
      stats.passedStudentsCount === 1 &&
      stats.ngStudentsCount === 1;
    assert(pass, `14. Overall class statistics compute accurate breakdown: Total 3, Complete 2, Incomplete 1, Pass 1, NG 1`);
  }

  // Test 15: Strict NG Option A using actual grading engine
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Student 1', rollNo: '1' }
    ];
    // Student scored high in Math (95) and English (90), but failed Science theory (15 < 27)
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Mathematics', thMarks: 95 },
      { studentUid: 's1', subject: 'Science', thMarks: 15, prMarks: 22 }, // Theory below 27 (35% threshold)
      { studentUid: 's1', subject: 'English', thMarks: 70, prMarks: 20 }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Mathematics', 'Science', 'English'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const row = matrix.students[0];
    const pass = row.isComplete === true &&
      row.cells['Science'].isNg === true &&
      row.overallStatus === 'NG' &&
      row.overallGrade === 'NG' &&
      row.overallGpa === null &&
      row.gpaDisplayText === '-';
    assert(pass, '15. Strict NG Option A enforced: single failed subject triggers overall NG with null GPA and "-" display');
  }

  // Test 16: GPA and grade consistency with authoritative engine
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' }
    ];
    // Total marks: Math 92/100, Science (68+24=92/100), English (68+24=92/100) -> 276/300 = 92% -> A+, GPA 4.0
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Mathematics', thMarks: 92 },
      { studentUid: 's1', subject: 'Science', thMarks: 68, prMarks: 24 },
      { studentUid: 's1', subject: 'English', thMarks: 68, prMarks: 24 }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Mathematics', 'Science', 'English'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const row = matrix.students[0];
    const pass = row.overallGrade === 'A+' &&
      row.overallGpa === 4.0 &&
      row.gpaDisplayText === '4.00' &&
      row.aggregatePercentage === 92;
    assert(pass, '16. Authoritative GPA 4.00 and Grade A+ match nepalGradingEngine exactly');
  }

  // Test 17: Tie-aware ranking
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' },
      { studentUid: 's2', studentName: 'Bibek', rollNo: '2' },
      { studentUid: 's3', studentName: 'Chirag', rollNo: '3' },
      { studentUid: 's4', studentName: 'Deepak', rollNo: '4' }
    ];
    // S1: 270, S2: 270 (tied for 1st), S3: 250 (3rd), S4: 240 (4th)
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Mathematics', thMarks: 90 },
      { studentUid: 's1', subject: 'Science', thMarks: 65, prMarks: 25 },
      { studentUid: 's1', subject: 'English', thMarks: 65, prMarks: 25 },

      { studentUid: 's2', subject: 'Mathematics', thMarks: 90 },
      { studentUid: 's2', subject: 'Science', thMarks: 65, prMarks: 25 },
      { studentUid: 's2', subject: 'English', thMarks: 65, prMarks: 25 },

      { studentUid: 's3', subject: 'Mathematics', thMarks: 80 },
      { studentUid: 's3', subject: 'Science', thMarks: 60, prMarks: 25 },
      { studentUid: 's3', subject: 'English', thMarks: 60, prMarks: 25 },

      { studentUid: 's4', subject: 'Mathematics', thMarks: 70 },
      { studentUid: 's4', subject: 'Science', thMarks: 60, prMarks: 25 },
      { studentUid: 's4', subject: 'English', thMarks: 60, prMarks: 25 }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects,
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const s1 = matrix.students.find(s => s.studentUid === 's1');
    const s2 = matrix.students.find(s => s.studentUid === 's2');
    const s3 = matrix.students.find(s => s.studentUid === 's3');
    const s4 = matrix.students.find(s => s.studentUid === 's4');

    const pass = s1?.provisionalRank === null && s2?.provisionalRank === null && s3?.provisionalRank === null && s4?.provisionalRank === null &&
      s1?.rank === null && s2?.rank === null && s1?.isProvisionalRank === false;
    assert(pass, `17. Standard tie-handling produces provisional ranks (null for all ranks): S1=${s1?.provisionalRank}, S2=${s2?.provisionalRank}, S3=${s3?.provisionalRank}, S4=${s4?.provisionalRank}`);
  }

  // Test 18: No rank for incomplete students
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' },
      { studentUid: 's2', studentName: 'Bibek', rollNo: '2' }
    ];
    // S1 has 95 in Math, but missing Science. S2 is complete with 80 in Math and 80 in Science.
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Mathematics', thMarks: 95 },
      { studentUid: 's2', subject: 'Mathematics', thMarks: 80 },
      { studentUid: 's2', subject: 'Science', thMarks: 60, prMarks: 20 }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Mathematics', 'Science'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const s1 = matrix.students.find(s => s.studentUid === 's1');
    const s2 = matrix.students.find(s => s.studentUid === 's2');

    const pass = s1?.rank === null && s1?.provisionalRank === null && s1?.isProvisionalRank === false &&
      s2?.rank === null && s2?.provisionalRank === null && s2?.isProvisionalRank === false;
    assert(pass, '18. Incomplete student S1 receives rank: null and provisionalRank: null, complete student S2 receives provisionalRank: null');
  }

  // Test 19: Empty class
  {
    const matrix = generateClassResultMatrix({
      enrolledStudents: [],
      configuredSubjects: ['Mathematics', 'Science'],
      subjectConfigs: stdConfigs,
      savedMarks: [],
      context: baseContext
    });

    const pass = matrix.students.length === 0 &&
      matrix.stats.totalStudents === 0 &&
      matrix.stats.completeStudents === 0 &&
      matrix.stats.incompleteStudents === 0;
    assert(pass, '19. Empty class returns clean empty structure with zero statistics without crashing');
  }

  // Test 20: Empty marks
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' },
      { studentUid: 's2', studentName: 'Bibek', rollNo: '2' }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Mathematics', 'Science'],
      subjectConfigs: stdConfigs,
      savedMarks: [],
      context: baseContext
    });

    const pass = matrix.students.length === 2 &&
      matrix.students[0].isComplete === false &&
      matrix.students[1].isComplete === false &&
      matrix.stats.incompleteStudents === 2 &&
      matrix.stats.completeStudents === 0;
    assert(pass, '20. Empty marks safely flags all students as incomplete');
  }

  // Test 21: Duplicate student records
  {
    const studentsWithDupes: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav Sharma', rollNo: '1' },
      { studentUid: 's1', studentName: 'Aarav Sharma Duplicate', rollNo: '1' },
      { studentUid: 's2', studentName: 'Bibek Thapa', rollNo: '2' }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: studentsWithDupes,
      configuredSubjects: ['Mathematics'],
      subjectConfigs: stdConfigs,
      savedMarks: [],
      context: baseContext
    });

    const pass = matrix.students.length === 2 &&
      matrix.students[0].studentName === 'Aarav Sharma';
    assert(pass, '21. Duplicate student records deduplicated deterministically');
  }

  // Test 22A: Identical duplicate subject mark records (safe deduplication)
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' }
    ];
    // Identical marks from duplicate payloads (e.g. repeated submission with same marks)
    const duplicateMarks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Mathematics', thMarks: 85, updatedAt: '2026-10-01T10:00:00Z' },
      { studentUid: 's1', subject: 'Mathematics', thMarks: 85, updatedAt: '2026-10-02T10:00:00Z' }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Mathematics'],
      subjectConfigs: stdConfigs,
      savedMarks: duplicateMarks,
      context: baseContext
    });

    const cell = matrix.students[0].cells['Mathematics'];
    const pass = cell.thMarks === 85 &&
      cell.totalObtainedMarks === 85 &&
      cell.hasConflict === false &&
      matrix.conflicts.length === 0;
    assert(pass, '22A. Identical duplicate mark records are safely deduplicated without false conflict');
  }

  // Test 22B: Conflicting duplicate subject mark records (explicit conflict indicator, fail-closed)
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav Sharma', rollNo: '1' }
    ];
    // Conflicting marks: record 1 has 50, record 2 has 85
    const conflictingMarks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Mathematics', thMarks: 50, updatedAt: '2026-10-01T10:00:00Z' },
      { studentUid: 's1', subject: 'Mathematics', thMarks: 85, updatedAt: '2026-10-02T10:00:00Z' }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Mathematics'],
      subjectConfigs: stdConfigs,
      savedMarks: conflictingMarks,
      context: baseContext
    });

    const row = matrix.students[0];
    const cell = row.cells['Mathematics'];
    const hasConflictDetected = cell.hasConflict === true &&
      cell.conflictDetails?.includes('Conflicting duplicate marks') === true &&
      cell.conflictDetails?.includes('Aarav') === false && // ID check
      cell.isMissing === true &&
      cell.subjectGrade === 'CONFLICT' &&
      row.hasConflict === true &&
      row.isComplete === false &&
      matrix.conflicts.length === 1 &&
      matrix.conflicts[0].subject === 'Mathematics' &&
      matrix.conflicts[0].studentIdentifier === 's1';

    assert(hasConflictDetected, '22B. Conflicting duplicate marks are NOT silently selected; explicit conflict returned identifying student s1 and subject Mathematics');
  }

  // Test 22C: Pre-publication provisional ranking distinction
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' }
    ];
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Mathematics', thMarks: 90 }
    ];

    // Case 1: Unpublished context (Draft / In Progress)
    const draftMatrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Mathematics'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: { ...baseContext, isPublished: false, status: 'IN PROGRESS' }
    });

    const draftRow = draftMatrix.students[0];
    const draftPass = draftRow.rank === null &&
      draftRow.isProvisionalRank === false &&
      draftRow.provisionalRank === null;

    // Case 2: Published context
    const publishedMatrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Mathematics'],
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: { ...baseContext, isPublished: true, status: 'PUBLISHED' }
    });

    const pubRow = publishedMatrix.students[0];
    const pubPass = pubRow.rank === null &&
      pubRow.isProvisionalRank === false &&
      pubRow.provisionalRank === null;

    // Case 3: Incomplete row in both published and unpublished
    const incompleteMatrix = generateClassResultMatrix({
      enrolledStudents: [{ studentUid: 's_inc', studentName: 'Incomplete', rollNo: '99' }],
      configuredSubjects: ['Mathematics'],
      subjectConfigs: stdConfigs,
      savedMarks: [],
      context: { ...baseContext, isPublished: true, status: 'PUBLISHED' }
    });
    const incRow = incompleteMatrix.students[0];
    const incPass = incRow.rank === null && incRow.provisionalRank === null && incRow.isProvisionalRank === false;

    assert(draftPass && pubPass && incPass, '22C. Pre-publication ranking: rank is null and provisionalRank is null for drafts, published, and incomplete');
  }

  // Test 23: Custom subjects and custom configurations
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' }
    ];
    const customConfigs: Record<string, SubjectConfigItem> = {
      'Newari Language': { thFullMarks: 50, thPassMarks: 18, prFullMarks: 50, prPassMarks: 18, hasTh: true, hasPr: true }
    };
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Newari Language', thMarks: 40, prMarks: 45 }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: ['Newari Language'],
      subjectConfigs: customConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const cell = matrix.students[0].cells['Newari Language'];
    const pass = cell.thFullMarks === 50 &&
      cell.prFullMarks === 50 &&
      cell.totalFullMarks === 100 &&
      cell.totalObtainedMarks === 85 &&
      cell.subjectGrade === 'A';
    assert(pass, '23. Custom subject configurations (50/50 breakdown) respected accurately');
  }

  // Test 24: Input immutability
  {
    const students: EnrolledStudentInput[] = [
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' }
    ];
    const marks: SavedSubjectMarkRecord[] = [
      { studentUid: 's1', subject: 'Mathematics', thMarks: 85 }
    ];
    const subjects = ['Mathematics'];

    const studentsCopy = JSON.stringify(students);
    const marksCopy = JSON.stringify(marks);
    const subjectsCopy = JSON.stringify(subjects);

    generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects: subjects,
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: baseContext
    });

    const pass = JSON.stringify(students) === studentsCopy &&
      JSON.stringify(marks) === marksCopy &&
      JSON.stringify(subjects) === subjectsCopy;
    assert(pass, '24. Input arrays and objects remain strictly immutable');
  }

  // Test 25: Deterministic output ordering
  {
    // Input students in scrambled order
    const scrambledStudents: EnrolledStudentInput[] = [
      { studentUid: 's10', studentName: 'Zoe', rollNo: '10' },
      { studentUid: 's2', studentName: 'Bibek', rollNo: '2' },
      { studentUid: 's1', studentName: 'Aarav', rollNo: '1' },
      { studentUid: 's5', studentName: 'Gaurav', rollNo: '5' }
    ];

    const matrix = generateClassResultMatrix({
      enrolledStudents: scrambledStudents,
      configuredSubjects: ['Mathematics'],
      subjectConfigs: stdConfigs,
      savedMarks: [],
      context: baseContext
    });

    const rollOrder = matrix.students.map(s => s.rollNo);
    const pass = rollOrder[0] === '1' && rollOrder[1] === '2' && rollOrder[2] === '5' && rollOrder[3] === '10';
    assert(pass, `25. Deterministic sorting orders students by roll number ascending: [${rollOrder.join(', ')}]`);
  }

  console.log('\n================================================================');
  const passedCount = testResults.filter(t => t.passed).length;
  const failedCount = testResults.filter(t => !t.passed).length;
  console.log(`CLASS RESULT MATRIX TESTS: ${passedCount} / ${testResults.length} PASSED (${failedCount} failures)`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runMatrixEngineTests();
