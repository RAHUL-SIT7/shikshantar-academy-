/**
 * React Component DOM Interaction Test Suite for ClassResultMatrix
 * 
 * Uses JSDOM and React 19 createRoot / act to test actual mounted component behavior:
 * 1. Search input updates visible rows dynamically.
 * 2. Status filter clicks (Incomplete, NG, Absent, Conflicts) update visible rows.
 * 3. Search and status filters operate concurrently.
 * 4. Filter reset restores the full cohort.
 * 5. Empty search results display appropriate empty state and query text.
 * 6. Conflict alerts render student identity, subject, and collision details.
 */

import React, { act } from 'react';
import ReactDOMClient from 'react-dom/client';
import jsdom from 'jsdom';
const { JSDOM } = jsdom;

// 1. Initialize JSDOM Environment
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000'
});

global.window = dom.window as any;
global.document = dom.window.document as any;
try {
  Object.defineProperty(global, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
    writable: true
  });
} catch {
  // Navigator getter pre-defined
}
global.HTMLElement = dom.window.HTMLElement as any;
global.HTMLInputElement = dom.window.HTMLInputElement as any;
(global as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ClassResultMatrix } from '../src/components/admin/ClassResultMatrix';
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

// Helper to simulate typing into React controlled inputs
function simulateInput(inputEl: HTMLInputElement, value: string) {
  const reactPropsKey = Object.keys(inputEl).find(k => k.startsWith('__reactProps'));
  if (reactPropsKey) {
    const props = (inputEl as any)[reactPropsKey];
    if (props && typeof props.onChange === 'function') {
      act(() => {
        props.onChange({ target: { value } });
      });
      return;
    }
  }
  // Fallback
  act(() => {
    inputEl.value = value;
    inputEl.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
}

// Helper to simulate clicking an element
function simulateClick(el: Element) {
  act(() => {
    el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
}

function runMountedComponentInteractionTests() {
  console.log('================================================================');
  console.log('--- PHASE 2.1 TASK 3.3 STEP 3: MOUNTED COMPONENT INTERACTION TESTS ---');
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

  // S1: Complete, Passed
  // S2: Complete, NG (scored 15 in Science TH)
  // S3: Incomplete (missing English)
  // S4: Complete, Absent in Math
  const students: EnrolledStudentInput[] = [
    { studentUid: 's1', studentName: 'Aarav Sharma', rollNo: '1', studentId: 'STU-001', permanentStudentId: 'PERM-001' },
    { studentUid: 's2', studentName: 'Bibek Thapa', rollNo: '2', studentId: 'STU-002', permanentStudentId: 'PERM-002' },
    { studentUid: 's3', studentName: 'Chirag Shrestha', rollNo: '3', studentId: 'STU-003', permanentStudentId: 'PERM-003' },
    { studentUid: 's4', studentName: 'Deepa Pokharel', rollNo: '4', studentId: 'STU-004', permanentStudentId: 'PERM-004' }
  ];

  const marks: SavedSubjectMarkRecord[] = [
    { studentUid: 's1', subject: 'Mathematics', thMarks: 90 },
    { studentUid: 's1', subject: 'Science', thMarks: 60, prMarks: 22 },
    { studentUid: 's1', subject: 'English', thMarks: 65, prMarks: 20 },

    { studentUid: 's2', subject: 'Mathematics', thMarks: 80 },
    { studentUid: 's2', subject: 'Science', thMarks: 15, prMarks: 20 },
    { studentUid: 's2', subject: 'English', thMarks: 60, prMarks: 20 },

    { studentUid: 's3', subject: 'Mathematics', thMarks: 75 },
    { studentUid: 's3', subject: 'Science', thMarks: 50, prMarks: 18 },
    // English missing for S3

    { studentUid: 's4', subject: 'Mathematics', thMarks: 'AB' },
    { studentUid: 's4', subject: 'Science', thMarks: 50, prMarks: 20 },
    { studentUid: 's4', subject: 'English', thMarks: 55, prMarks: 20 }
  ];

  const matrixData = generateClassResultMatrix({
    enrolledStudents: students,
    configuredSubjects,
    subjectConfigs: stdConfigs,
    savedMarks: marks,
    context: baseContext
  });

  const rootEl = document.getElementById('root')!;
  const root = ReactDOMClient.createRoot(rootEl);

  // Initial Mount
  act(() => {
    root.render(React.createElement(ClassResultMatrix, { matrixData }));
  });

  // Verify Initial Mounting State
  const initialRowCount = document.querySelectorAll('tbody tr').length;
  assert(initialRowCount === 4, 'INT-01: Component mounts successfully in JSDOM and renders all 4 student rows');

  // Test 1: Typing in Search Input updates visible rows
  {
    const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    simulateInput(searchInput, 'Aarav');
    const rowsAfterSearch = document.querySelectorAll('tbody tr');
    const matchedName = rowsAfterSearch[0]?.querySelector('td:nth-child(2)')?.textContent || '';
    
    const pass = rowsAfterSearch.length === 1 && matchedName.includes('Aarav Sharma');
    assert(pass, 'INT-02: Typing "Aarav" in search input dynamically filters table to 1 row matching Aarav Sharma');

    // Reset search
    simulateInput(searchInput, '');
    assert(document.querySelectorAll('tbody tr').length === 4, 'INT-02b: Clearing search input restores all 4 student rows');
  }

  // Test 2: Clicking Status Filter Pills
  {
    const getFilterButton = (label: string) => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.textContent?.includes(label));
    };

    // A. Incomplete Filter
    const incBtn = getFilterButton('Incomplete');
    if (incBtn) simulateClick(incBtn);
    const incRows = document.querySelectorAll('tbody tr');
    const incStudentName = incRows[0]?.querySelector('td:nth-child(2)')?.textContent || '';
    assert(incRows.length === 1 && incStudentName.includes('Chirag Shrestha'), 'INT-03: Clicking Incomplete filter renders only Chirag Shrestha (missing English)');

    // B. NG Filter
    const ngBtn = getFilterButton('NG');
    if (ngBtn) simulateClick(ngBtn);
    const ngRows = document.querySelectorAll('tbody tr');
    assert(ngRows.length === 2, 'INT-04: Clicking NG filter renders 2 failed rows (Bibek with Science NG and Deepa with Absent)');

    // C. Absent Filter
    const abBtn = getFilterButton('Absent');
    if (abBtn) simulateClick(abBtn);
    const abRows = document.querySelectorAll('tbody tr');
    const abStudentName = abRows[0]?.querySelector('td:nth-child(2)')?.textContent || '';
    assert(abRows.length === 1 && abStudentName.includes('Deepa Pokharel'), 'INT-05: Clicking Absent filter renders only Deepa Pokharel (recorded AB in Math)');

    // D. All Filter
    const allBtn = getFilterButton('All');
    if (allBtn) simulateClick(allBtn);
    assert(document.querySelectorAll('tbody tr').length === 4, 'INT-06: Clicking All filter restores all 4 student rows');
  }

  // Test 3: Search and Status Filters operate concurrently
  {
    const getFilterButton = (label: string) => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find(b => b.textContent?.includes(label));
    };

    // Filter by NG (2 students: Bibek and Deepa)
    const ngBtn = getFilterButton('NG');
    if (ngBtn) simulateClick(ngBtn);

    // Search for Deepa
    const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    simulateInput(searchInput, 'Deepa');

    const filteredRows = document.querySelectorAll('tbody tr');
    const visibleName = filteredRows[0]?.querySelector('td:nth-child(2)')?.textContent || '';
    assert(filteredRows.length === 1 && visibleName.includes('Deepa Pokharel'), 'INT-07: Search ("Deepa") and status filter ("NG") operate together to isolate Deepa Pokharel');
  }

  // Test 4: Reset Button clears both Search and Filter
  {
    // Currently search has "Deepa" and statusFilter is "ng"
    const resetBtn = Array.from(document.querySelectorAll('button')).find(b => b.title === 'Reset Filters');
    if (resetBtn) simulateClick(resetBtn);

    const rows = document.querySelectorAll('tbody tr');
    const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    const pass = rows.length === 4 && searchInput.value === '';
    assert(pass, 'INT-08: Clicking Reset button clears search input and restores All status filter (4 rows)');
  }

  // Test 5: Empty Search Results display empty state with query
  {
    const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    simulateInput(searchInput, 'Nonexistent Student');

    const tableRows = document.querySelectorAll('tbody tr').length;
    const emptyStateHeading = document.querySelector('h4')?.textContent || '';
    const emptyStateText = Array.from(document.querySelectorAll('p')).find(p => p.textContent?.includes('No students match'))?.textContent || '';

    const pass = tableRows === 0 &&
      emptyStateHeading.includes('No Matching Students Found') &&
      emptyStateText.includes('Nonexistent Student');

    assert(pass, 'INT-09: Unmatched search displays empty state banner with the query string and zero table rows');

    // Click "Reset Filters" in empty state banner
    const bannerResetBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Reset Filters'));
    if (bannerResetBtn) simulateClick(bannerResetBtn);
    assert(document.querySelectorAll('tbody tr').length === 4, 'INT-09b: Reset button inside empty state banner restores all 4 student rows');
  }

  // Test 6: Conflict Alert Banner and Conflicts filter
  {
    const conflictMarks: SavedSubjectMarkRecord[] = [
      ...marks,
      { studentUid: 's1', subject: 'Mathematics', thMarks: 50 } // Conflicting mark for s1
    ];

    const conflictMatrixData = generateClassResultMatrix({
      enrolledStudents: students,
      configuredSubjects,
      subjectConfigs: stdConfigs,
      savedMarks: conflictMarks,
      context: baseContext
    });

    act(() => {
      root.render(React.createElement(ClassResultMatrix, { matrixData: conflictMatrixData }));
    });

    // Verify Conflict Alert Banner rendered
    const bannerText = document.querySelector('.bg-red-50')?.textContent || '';
    const hasConflictDetails = bannerText.includes('Mark Conflict Alert') &&
      bannerText.includes('Aarav Sharma') &&
      bannerText.includes('Mathematics');

    // Verify Conflicts Filter Button rendered and clickable
    const conflictsBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Conflicts'));
    if (conflictsBtn) simulateClick(conflictsBtn);

    const conflictRows = document.querySelectorAll('tbody tr');
    const studentInConflictRow = conflictRows[0]?.querySelector('td:nth-child(2)')?.textContent || '';

    const pass = hasConflictDetails && conflictRows.length === 1 && studentInConflictRow.includes('Aarav Sharma');
    assert(pass, 'INT-10: Conflict Alert Banner renders student name and subject; Conflicts filter renders only the conflicting student row');
  }

  console.log('\n================================================================');
  const passedCount = testResults.filter(t => t.passed).length;
  const failedCount = testResults.filter(t => !t.passed).length;
  console.log(`MOUNTED INTERACTION TESTS: ${passedCount} / ${testResults.length} PASSED (${failedCount} failures)`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runMountedComponentInteractionTests();
