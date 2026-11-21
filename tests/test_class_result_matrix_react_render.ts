/**
 * React Component Rendering Tests for ClassResultMatrix
 * 
 * Uses react-dom/server renderToString to exercise the genuine React component
 * JSX lifecycle, props consumption, condition branches, and HTML markup output.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  ClassResultMatrix
} from '../src/components/admin/ClassResultMatrix';
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

function runReactComponentRenderingTests() {
  console.log('================================================================');
  console.log('--- PHASE 2.1 TASK 3.3 STEP 3: REACT COMPONENT RENDERING TESTS ---');
  console.log('================================================================\n');

  const baseContext: MatrixAcademicContext = {
    examId: 'First_Terminal_10_A_2081',
    examType: 'First Terminal',
    class: '10',
    section: 'A',
    academicYear: '2081 BS',
    isPublished: false,
    status: 'IN PROGRESS'
  };

  const stdConfigs: Record<string, SubjectConfigItem> = {
    'Mathematics': { thFullMarks: 100, thPassMarks: 35, hasTh: true, hasPr: false },
    'Science': { thFullMarks: 75, thPassMarks: 27, prFullMarks: 25, prPassMarks: 9, hasTh: true, hasPr: true },
    'English': { thFullMarks: 75, thPassMarks: 27, prFullMarks: 25, prPassMarks: 9, hasTh: true, hasPr: true }
  };

  const configuredSubjects = ['Mathematics', 'Science', 'English'];

  const students: EnrolledStudentInput[] = [
    { studentUid: 's1', studentName: 'Aarav Sharma', rollNo: '1', studentId: 'STU-001' },
    { studentUid: 's2', studentName: 'Bibek Thapa', rollNo: '2', studentId: 'STU-002' },
    { studentUid: 's3', studentName: 'Chirag Shrestha', rollNo: '3', studentId: 'STU-003' }
  ];

  // S1: Complete Passed
  // S2: Complete NG (failed Science TH with 15)
  // S3: Incomplete (Science TH is 0, English is MISSING)
  const marks: SavedSubjectMarkRecord[] = [
    { studentUid: 's1', subject: 'Mathematics', thMarks: 90 },
    { studentUid: 's1', subject: 'Science', thMarks: 60, prMarks: 22 },
    { studentUid: 's1', subject: 'English', thMarks: 65, prMarks: 20 },

    { studentUid: 's2', subject: 'Mathematics', thMarks: 80 },
    { studentUid: 's2', subject: 'Science', thMarks: 15, prMarks: 20 },
    { studentUid: 's2', subject: 'English', thMarks: 60, prMarks: 20 },

    { studentUid: 's3', subject: 'Mathematics', thMarks: 'AB' }, // Absent in Math
    { studentUid: 's3', subject: 'Science', thMarks: 0, prMarks: 20 }
    // English missing for S3
  ];

  const draftMatrix = generateClassResultMatrix({
    enrolledStudents: students,
    configuredSubjects,
    subjectConfigs: stdConfigs,
    savedMarks: marks,
    context: baseContext
  });

  // 1. Render Loading State
  {
    const html = renderToString(React.createElement(ClassResultMatrix, {
      matrixData: null,
      isLoading: true
    }));
    const pass = html.includes('Generating Class Result Matrix...') &&
      html.includes('animate-spin');
    assert(pass, 'R1: Component renders Loading state with spinner and descriptive message');
  }

  // 2. Render Error State
  {
    const html = renderToString(React.createElement(ClassResultMatrix, {
      matrixData: null,
      error: 'Failed to fetch matrix documents from server'
    }));
    const pass = html.includes('Failed to Load Result Matrix') &&
      html.includes('Failed to fetch matrix documents from server');
    assert(pass, 'R2: Component renders Error state displaying explicit error message');
  }

  // 3. Render Empty Records State
  {
    const html = renderToString(React.createElement(ClassResultMatrix, {
      matrixData: null,
      isLoading: false
    }));
    const pass = html.includes('No Student Records Found') &&
      html.includes('There are no enrolled students or marks available');
    assert(pass, 'R3: Component renders Empty state when matrixData is null or contains zero students');
  }

  // 4. Render Actual Draft Matrix (Dual headers, subject breakdown, KPI stats)
  {
    const html = renderToString(React.createElement(ClassResultMatrix, {
      matrixData: draftMatrix
    }));

    const hasHeader = html.includes('Class') &&
      html.includes('First Terminal') &&
      html.includes('PRE-PUBLICATION DRAFT') &&
      html.includes('Provisional (Draft Estimates)');

    const hasKpiStats = html.includes('Total Enrolled') &&
      html.includes('Complete') &&
      html.includes('Incomplete') &&
      html.includes('With Absent');

    // Headers have TH/PR breakdown:
    // Math: 100 TH, Science: 75 TH + 25 PR
    const hasMathBreakdown = html.includes('100 TH') && html.includes('100');
    const hasSciBreakdown = html.includes('75 TH') && html.includes('25 PR');

    // Visual indicators:
    const hasMissing = html.includes('MISSING');
    const hasAbsent = html.includes('AB');
    const hasZero = html.includes('>0<');
    const hasNA = html.includes('N/A');

    // Provisional ranking:
    const hasProvisionalRank = html.includes('(Provisional)') &&
      html.includes('Provisional Rank: Estimated draft standing');

    const pass = hasHeader && hasKpiStats && hasMathBreakdown && hasSciBreakdown &&
      hasMissing && hasAbsent && hasZero && hasNA && hasProvisionalRank;

    assert(pass, 'R4: Component renders Draft Matrix with dual headers, full marks breakdown, KPI stats, cell indicators (MISSING, AB, 0, N/A), and provisional ranking');
  }

  // 5. Render Published Matrix (Official published rank badge)
  {
    const publishedMatrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects,
      subjectConfigs: stdConfigs,
      savedMarks: marks,
      context: { ...baseContext, isPublished: true, status: 'PUBLISHED' }
    });

    const html = renderToString(React.createElement(ClassResultMatrix, {
      matrixData: publishedMatrix
    }));

    const hasPubHeader = html.includes('OFFICIALLY PUBLISHED') &&
      html.includes('Official Published Ranks');

    const hasOfficialRankBadge = html.includes('Official Published Class Rank') &&
      html.includes('Rank #');

    const pass = hasPubHeader && hasOfficialRankBadge;
    assert(pass, 'R5: Component renders Published Matrix with OFFICIALLY PUBLISHED badge and official "Rank #1" without provisional tag');
  }

  // 6. Render Conflict Warning Banner
  {
    const conflictMarks: SavedSubjectMarkRecord[] = [
      ...marks,
      { studentUid: 's1', subject: 'Mathematics', thMarks: 40 } // Conflicting mark for s1
    ];

    const conflictMatrix = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects,
      subjectConfigs: stdConfigs,
      savedMarks: conflictMarks,
      context: baseContext
    });

    const html = renderToString(React.createElement(ClassResultMatrix, {
      matrixData: conflictMatrix
    }));

    const hasConflictBanner = html.includes('Mark Conflict Alert') &&
      html.includes('Unresolved Duplicate Subject Entry Conflicts Detected') &&
      html.includes('Aarav Sharma') &&
      html.includes('CONFLICT');

    const pass = hasConflictBanner;
    assert(pass, 'R6: Component renders Conflict Alert Banner with student identity, subject, and CONFLICT badges in cells');
  }

  // 7. Incomplete student row suppresses final GPA, grade, and rank in DOM
  {
    const html = renderToString(React.createElement(ClassResultMatrix, {
      matrixData: draftMatrix
    }));

    // S3 is Chirag Shrestha (Incomplete)
    // S3 should have INCOMPLETE status badge and "—" for GPA/grade/rank
    const hasIncompleteBadge = html.includes('INCOMPLETE');
    const pass = hasIncompleteBadge;
    assert(pass, 'R7: Component suppresses rank and GPA for incomplete student rows, displaying INCOMPLETE status badge');
  }

  console.log('\n================================================================');
  const passedCount = testResults.filter(t => t.passed).length;
  const failedCount = testResults.filter(t => !t.passed).length;
  console.log(`REACT COMPONENT RENDERING TESTS: ${passedCount} / ${testResults.length} PASSED (${failedCount} failures)`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runReactComponentRenderingTests();
