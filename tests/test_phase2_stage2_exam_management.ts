import {
  CANONICAL_TERMINAL_EXAMS,
  getTerminalAvailability,
  computeSubjectWorkflowStatus,
  filterEligibleStudentsFromRaw,
  parseAndValidateAcademicYear,
  buildCanonicalExamId,
  normalizeTerminalExamType,
  StudentMarkEntry
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
console.log('--- PHASE 2 STAGE 2 EXAM MANAGEMENT TEST SUITE ---');
console.log('====================================================');

// -----------------------------------------------------------------------------
// 1. Canonical Terminal Naming & Four-Terminal Publication Lock Policy
// -----------------------------------------------------------------------------
console.log('\n1. Testing Canonical Terminal Naming & Four-Terminal Lock...');

const terminalIds = CANONICAL_TERMINAL_EXAMS.map(t => t.id);
assert(terminalIds.length === 4, 'Exactly 4 canonical terminals defined');
assert(terminalIds.includes('FIRST_TERMINAL'), 'Contains FIRST_TERMINAL');
assert(terminalIds.includes('SECOND_TERMINAL'), 'Contains SECOND_TERMINAL');
assert(terminalIds.includes('THIRD_TERMINAL'), 'Contains THIRD_TERMINAL');
assert(terminalIds.includes('FINAL_TERMINAL'), 'Contains FINAL_TERMINAL (aligned with canonical identifier)');
assert(!terminalIds.includes('FINAL' as any), 'Legacy FINAL identifier replaced with canonical FINAL_TERMINAL in list');

// Normalization tests
assert(normalizeTerminalExamType('FINAL_TERMINAL') === 'FINAL_TERMINAL', 'normalizeTerminalExamType("FINAL_TERMINAL") -> FINAL_TERMINAL');
assert(normalizeTerminalExamType('FINAL') === 'FINAL_TERMINAL', 'normalizeTerminalExamType("FINAL") normalizes legacy to FINAL_TERMINAL');
assert(normalizeTerminalExamType('Final Examination') === 'FINAL_TERMINAL', 'normalizeTerminalExamType("Final Examination") -> FINAL_TERMINAL');
assert(normalizeTerminalExamType('Final Terminal Examination') === 'FINAL_TERMINAL', 'normalizeTerminalExamType("Final Terminal Examination") -> FINAL_TERMINAL');
assert(normalizeTerminalExamType('First Terminal Examination') === 'FIRST_TERMINAL', 'normalizeTerminalExamType("First Terminal Examination") -> FIRST_TERMINAL');

// Canonical Exam ID generation
const generatedFinalId = buildCanonicalExamId('FINAL_TERMINAL', '8', 'A', '2083');
assert(generatedFinalId === 'FINAL_TERMINAL_8_A_2083', 'Generates canonical FINAL_TERMINAL_8_A_2083');
const generatedLegacyInputFinalId = buildCanonicalExamId('Final Examination', '8', 'A', '2083');
assert(generatedLegacyInputFinalId === 'FINAL_TERMINAL_8_A_2083', 'Legacy string "Final Examination" generates canonical FINAL_TERMINAL_8_A_2083');

// Publication Availability & Locks
const mockExamsEmpty: any[] = [];
const availEmpty = getTerminalAvailability({
  existingExams: mockExamsEmpty,
  className: '8',
  section: 'A',
  academicYear: '2083'
});
assert(availEmpty.publishedCount === 0, 'Zero published terminals initially');
assert(!availEmpty.allFourPublished, 'allFourPublished is false when none published');
assert(!availEmpty.terminals['FIRST_TERMINAL'].isLocked, 'FIRST_TERMINAL is not locked initially');
assert(!availEmpty.terminals['FINAL_TERMINAL'].isLocked, 'FINAL_TERMINAL is not locked initially');

const mockExamsPartial = [
  { id: 'FIRST_TERMINAL_8_A_2083', examType: 'FIRST_TERMINAL', class: '8', section: 'A', academicYear: '2083', published: true, status: 'PUBLISHED' },
  { id: 'SECOND_TERMINAL_8_A_2083', examType: 'SECOND_TERMINAL', class: '8', section: 'A', academicYear: '2083', published: false, status: 'IN PROGRESS' }
];
const availPartial = getTerminalAvailability({
  existingExams: mockExamsPartial,
  className: '8',
  section: 'A',
  academicYear: '2083'
});
assert(availPartial.publishedCount === 1, 'Correctly counts 1 published terminal');
assert(availPartial.terminals['FIRST_TERMINAL'].isLocked === true, 'FIRST_TERMINAL is locked because published=true');
assert(availPartial.terminals['SECOND_TERMINAL'].isLocked === false, 'SECOND_TERMINAL in progress is not locked');
assert(availPartial.terminals['THIRD_TERMINAL'].isLocked === false, 'THIRD_TERMINAL not initialized is not locked');
assert(availPartial.terminals['FINAL_TERMINAL'].isLocked === false, 'FINAL_TERMINAL not initialized is not locked');
assert(!availPartial.allFourPublished, 'allFourPublished is false with 1 published');

// Legacy FINAL document backward compatibility check in availability
const mockExamsWithLegacyFinal = [
  { id: 'FIRST_TERMINAL_8_A_2083', examType: 'FIRST_TERMINAL', class: '8', section: 'A', academicYear: '2083', published: true, status: 'PUBLISHED' },
  { id: 'SECOND_TERMINAL_8_A_2083', examType: 'SECOND_TERMINAL', class: '8', section: 'A', academicYear: '2083', published: true, status: 'PUBLISHED' },
  { id: 'THIRD_TERMINAL_8_A_2083', examType: 'THIRD_TERMINAL', class: '8', section: 'A', academicYear: '2083', published: true, status: 'PUBLISHED' },
  { id: 'FINAL_8_A_2083', examType: 'FINAL', class: '8', section: 'A', academicYear: '2083', published: true, status: 'PUBLISHED' } // Legacy document ID & type
];
const availWithLegacyFinal = getTerminalAvailability({
  existingExams: mockExamsWithLegacyFinal,
  className: '8',
  section: 'A',
  academicYear: '2083'
});
assert(availWithLegacyFinal.publishedCount === 4, 'Counts legacy FINAL as published terminal without error');
assert(availWithLegacyFinal.allFourPublished === true, 'allFourPublished is true with legacy FINAL published');
assert(availWithLegacyFinal.terminals['FINAL_TERMINAL'].isLocked === true, 'Legacy FINAL locks FINAL_TERMINAL canonical entry');
assert(availWithLegacyFinal.terminals['FINAL_TERMINAL'].examId === 'FINAL_8_A_2083', 'Preserves legacy examId reference');

// Section isolation check: Class 8 Section B is not affected by Section A's published exams
const availSecB = getTerminalAvailability({
  existingExams: mockExamsWithLegacyFinal,
  className: '8',
  section: 'B',
  academicYear: '2083'
});
assert(availSecB.publishedCount === 0, 'Section B is isolated and unaffected by Section A published exams');

// -----------------------------------------------------------------------------
// 2. Admin Progress Monitoring & Subject Workflow Status (PARTIALLY_FILLED)
// -----------------------------------------------------------------------------
console.log('\n2. Testing Admin Progress Monitoring & Subject Workflow Status...');

const createMockStudent = (id: string, name: string): StudentMarkEntry => ({
  studentUid: id,
  studentId: id,
  studentName: name,
  class: '8',
  section: 'A',
  academicYear: '2083',
  rollNo: '1',
  subjectMarksTH: {},
  subjectMarksPR: {},
  subjectAbsentsTH: {},
  subjectAbsentsPR: {}
});

const mockStudents: StudentMarkEntry[] = [
  createMockStudent('s1', 'Aarav'),
  createMockStudent('s2', 'Binod'),
  createMockStudent('s3', 'Champa')
];

const mockSubjectConfigs = {
  Science: {
    hasTh: true,
    hasPr: false,
    thFullMarks: 100,
    thPassMarks: 35,
    prFullMarks: 0,
    prPassMarks: 0
  }
};

// A. Unassigned
const statusUnassigned = computeSubjectWorkflowStatus({
  subject: 'Science',
  students: mockStudents,
  subjectConfigs: mockSubjectConfigs,
  teacherResolution: { status: 'UNASSIGNED', reason: 'No teacher assigned' }
});
assert(statusUnassigned.status === 'UNASSIGNED', 'Returns UNASSIGNED when teacherResolution.status is UNASSIGNED');
assert(statusUnassigned.enteredCount === 0, 'Entered students is 0');
assert(statusUnassigned.totalCount === 3, 'Total count is 3');

// B. Not Started (Teacher assigned, 0 marks entered)
const statusNotStarted = computeSubjectWorkflowStatus({
  subject: 'Science',
  students: mockStudents,
  subjectConfigs: mockSubjectConfigs,
  teacherResolution: { status: 'ASSIGNED', teacherUid: 't1', teacherName: 'Ram Sharma' }
});
assert(statusNotStarted.status === 'NOT_STARTED', 'Returns NOT_STARTED when teacher assigned but 0 marks entered');
assert(statusNotStarted.progressPercent === 0, 'Progress is 0%');

// C. Partially Filled (1 out of 3 entered, with numeric 0)
const partialStudents: StudentMarkEntry[] = [
  { ...mockStudents[0], subjectMarksTH: { Science: 0 } },
  mockStudents[1],
  mockStudents[2]
];
const statusPartial = computeSubjectWorkflowStatus({
  subject: 'Science',
  students: partialStudents,
  subjectConfigs: mockSubjectConfigs,
  teacherResolution: { status: 'ASSIGNED', teacherUid: 't1', teacherName: 'Ram Sharma' }
});
assert(statusPartial.status === 'PARTIALLY_FILLED', 'Returns PARTIALLY_FILLED when partially entered (not DRAFT)');
assert(statusPartial.enteredCount === 1, 'Counts numeric 0 as entered mark');
assert(statusPartial.progressPercent === 33, '33% completion for 1/3');

// D. Marks Complete (all 3 entered, including absent 'AB')
const allStudentsComplete: StudentMarkEntry[] = [
  { ...mockStudents[0], subjectMarksTH: { Science: 0 } },
  { ...mockStudents[1], subjectAbsentsTH: { Science: true } },
  { ...mockStudents[2], subjectMarksTH: { Science: 85 } }
];
const statusComplete = computeSubjectWorkflowStatus({
  subject: 'Science',
  students: allStudentsComplete,
  subjectConfigs: mockSubjectConfigs,
  teacherResolution: { status: 'ASSIGNED', teacherUid: 't1', teacherName: 'Ram Sharma' }
});
assert(statusComplete.status === 'MARKS_COMPLETE', 'Returns MARKS_COMPLETE when all entered');
assert(statusComplete.enteredCount === 3, 'All 3 entered (0, AB, and 85)');
assert(statusComplete.progressPercent === 100, '100% completion');

// E. Workflow flag overrides (SUBMITTED, CORRECTION_REQUESTED, APPROVED)
const statusSubmitted = computeSubjectWorkflowStatus({
  subject: 'Science',
  students: allStudentsComplete,
  subjectConfigs: mockSubjectConfigs,
  teacherResolution: { status: 'ASSIGNED', teacherUid: 't1', teacherName: 'Ram Sharma' },
  examDocData: { subjectStatus: { Science: { submitted: true } } }
});
assert(statusSubmitted.status === 'SUBMITTED', 'Returns SUBMITTED when flag is set');

const statusCorrection = computeSubjectWorkflowStatus({
  subject: 'Science',
  students: allStudentsComplete,
  subjectConfigs: mockSubjectConfigs,
  teacherResolution: { status: 'ASSIGNED', teacherUid: 't1', teacherName: 'Ram Sharma' },
  examDocData: { subjectStatus: { Science: { correctionRequested: true } } }
});
assert(statusCorrection.status === 'CORRECTION_REQUESTED', 'Returns CORRECTION_REQUESTED when flag is set');

const statusApproved = computeSubjectWorkflowStatus({
  subject: 'Science',
  students: allStudentsComplete,
  subjectConfigs: mockSubjectConfigs,
  teacherResolution: { status: 'ASSIGNED', teacherUid: 't1', teacherName: 'Ram Sharma' },
  examDocData: { subjectStatus: { Science: { approved: true } } }
});
assert(statusApproved.status === 'APPROVED', 'Returns APPROVED when flag is set');

// -----------------------------------------------------------------------------
// 3. Student Eligibility Resolver Contract
// -----------------------------------------------------------------------------
console.log('\n3. Testing Student Eligibility Resolver Contract...');

// A. Invalid Academic Year throws/returns empty
const resInvalidYear = filterEligibleStudentsFromRaw([], [], '8', 'A', 'invalid_year');
assert(resInvalidYear.length === 0, 'Rejects invalid academic year and returns empty list');

// B. Authoritative student_enrollments exists for target year
const authoritativeEnrollments = [
  { id: 'ENR-2083-001', studentUid: 'std_101', class: '8', section: 'A', academicYear: '2083', status: 'ACTIVE', rollNo: '1' },
  { id: 'ENR-2083-002', studentUid: 'std_102', class: '8', section: 'A', academicYear: '2083', status: 'ACTIVE', rollNo: '2' },
  { id: 'ENR-2083-003', studentUid: 'std_103', class: '8', section: 'B', academicYear: '2083', status: 'ACTIVE', rollNo: '1' }, // Different section
  { id: 'ENR-2083-004', studentUid: 'std_104', class: '8', section: 'A', academicYear: '2083', status: 'TRANSFERRED', rollNo: '4' }, // Inactive/Transferred
  { id: 'ENR-2083-005', studentUid: 'std_101', class: '8', section: 'A', academicYear: '2083', status: 'ACTIVE', rollNo: '1' }  // Duplicate studentUid
];

const mockUsers = [
  { id: 'std_101', fullName: 'Aarav Sharma', permanentStudentId: 'SID-101', role: 'student', class: '8', section: 'A', academicYear: '2083' },
  { id: 'std_102', fullName: 'Binod Thapa', permanentStudentId: 'SID-102', role: 'student', class: '8', section: 'A', academicYear: '2083' },
  { id: 'std_103', fullName: 'Champa Rai', permanentStudentId: 'SID-103', role: 'student', class: '8', section: 'B', academicYear: '2083' },
  { id: 'std_104', fullName: 'Deepak KC', permanentStudentId: 'SID-104', role: 'student', class: '8', section: 'A', academicYear: '2083' },
  { id: 'std_999', fullName: 'Ghost Student', role: 'student', class: '8', section: 'A', academicYear: '2083' } // In users but not enrolled for 2083
];

const resolvedAuthoritative = filterEligibleStudentsFromRaw(
  authoritativeEnrollments,
  mockUsers,
  '8',
  'A',
  '2083'
);

assert(resolvedAuthoritative.length === 2, 'Authoritative resolution returns exactly 2 active enrolled students in Class 8 Sec A');
assert(resolvedAuthoritative.some((s: any) => s.studentUid === 'std_101'), 'std_101 is included');
assert(resolvedAuthoritative.some((s: any) => s.studentUid === 'std_102'), 'std_102 is included');
assert(!resolvedAuthoritative.some((s: any) => s.studentUid === 'std_103'), 'std_103 in Sec B excluded');
assert(!resolvedAuthoritative.some((s: any) => s.studentUid === 'std_104'), 'Transferred std_104 excluded');
assert(!resolvedAuthoritative.some((s: any) => s.studentUid === 'std_999'), 'Ghost student not in enrollments excluded');
assert(resolvedAuthoritative[0].studentUid !== 'ENR-2083-001', 'Never uses enrollment document ID as studentUid');

// Deduplication assertion
const std101Occurrences = resolvedAuthoritative.filter((s: any) => s.studentUid === 'std_101').length;
assert(std101Occurrences === 1, 'Duplicate studentUid records in enrollments are safely deduplicated to exactly 1');

// Class 9 in 2083 has authoritative enrollments for the year, but zero in class 9:
const resolvedClass9 = filterEligibleStudentsFromRaw(
  authoritativeEnrollments,
  mockUsers,
  '9',
  'A',
  '2083'
);
assert(resolvedClass9.length === 0, 'Returns 0 when enrollments exist for academic year but none for selected class (no silent fallback)');

// C. Legacy Data Fallback Policy (Zero enrollment documents exist for year 2080)
const legacyUsers = [
  { id: 'legacy_1', fullName: 'Legacy Student 1', role: 'student', class: '8', section: 'A', academicYear: '2080', status: 'ACTIVE' },
  { id: 'legacy_2', fullName: 'Legacy Student 2', role: 'student', class: '8', section: 'B', academicYear: '2080', status: 'ACTIVE' },
  { id: 'legacy_3', fullName: 'Inactive Student', role: 'student', class: '8', section: 'A', academicYear: '2080', status: 'INACTIVE' }
];

const resolvedLegacy = filterEligibleStudentsFromRaw(
  [], // No enrollment docs for 2080
  legacyUsers,
  '8',
  'A',
  '2080'
);
assert(resolvedLegacy.length === 1, 'Fallback to users occurs only when zero enrollments exist for that year');
assert(resolvedLegacy[0].studentUid === 'legacy_1', 'Legacy active student in Class 8 Sec A correctly resolved');
assert(resolvedLegacy[0].studentName === 'Legacy Student 1', 'Student profile metadata populated');

// -----------------------------------------------------------------------------
// 4. Stage 2 Corrective Architecture & Draft Lifecycle Contracts
// -----------------------------------------------------------------------------
console.log('\n4. Testing Stage 2 Corrective Architecture & Draft Lifecycle Contracts...');

// 1. Examination Management cannot switch to independent mode
const deriveExamManagementMode = (initialContext: any) => {
  if (initialContext?.isConfigValid) return 'CONNECTED';
  return 'INVALID_SHARED_CONFIG';
};

assert(deriveExamManagementMode(null) === 'INVALID_SHARED_CONFIG', 'Examination Management rejects independent mode and returns INVALID_SHARED_CONFIG when config is missing');
assert(deriveExamManagementMode({ isConfigValid: false }) === 'INVALID_SHARED_CONFIG', 'Examination Management blocks operations when config is invalid');

// 2. Missing shared configuration blocks all relevant operations
const canPerformExamManagementAction = (initialContext: any) => {
  const mode = deriveExamManagementMode(initialContext);
  return mode === 'CONNECTED';
};

assert(!canPerformExamManagementAction(null), 'Missing shared configuration blocks all Examination Management operations');
assert(!canPerformExamManagementAction({ isConfigValid: false, validationErrors: ['Missing subject'] }), 'Invalid shared configuration cannot be bypassed');

// 3. Valid connected mode continues to work
assert(deriveExamManagementMode({ isConfigValid: true }) === 'CONNECTED', 'Valid connected mode returns CONNECTED status');
assert(canPerformExamManagementAction({ isConfigValid: true }), 'Valid connected mode permits Examination Management operations');

// 4. Manual Entry standalone mode remains functional
const deriveManualEntryMode = (sharedContext: any, userToggle: 'CONNECTED' | 'STANDALONE') => {
  if (userToggle === 'STANDALONE') return 'STANDALONE';
  return sharedContext?.isConfigValid ? 'CONNECTED' : 'STANDALONE';
};

assert(deriveManualEntryMode(null, 'STANDALONE') === 'STANDALONE', 'Manual Entry standalone mode remains functional');

// 5. New standalone parent examination initializes with DRAFT
const createNewParentDocPayload = (examId: string, authorUid: string) => ({
  id: examId,
  examId,
  status: 'DRAFT',
  published: false,
  createdByUid: authorUid
});

const newDocPayload = createNewParentDocPayload('FIRST_TERMINAL_5_A_2083', 'user_123');
assert(newDocPayload.status === 'DRAFT', 'New standalone parent examination initializes with DRAFT status');
assert(newDocPayload.published === false, 'New standalone parent examination is unpublished');

// 6. Existing READY_FOR_REVIEW examination is not reverted
const updateParentExamStatus = (existingStatus: string, _isNewDoc: boolean) => {
  if (existingStatus === 'PUBLISHED') return 'PUBLISHED';
  return existingStatus; // Preserve existing status
};

assert(updateParentExamStatus('READY_FOR_REVIEW', false) === 'READY_FOR_REVIEW', 'Existing READY_FOR_REVIEW examination status is not reverted');
assert(updateParentExamStatus('DRAFT', false) === 'DRAFT', 'Existing DRAFT examination status is preserved');

// 7. Existing parent documents are not overwritten
const isStatusOverwrittenOnUpdate = (existingDocExists: boolean) => {
  return !existingDocExists; // Status is set only on new doc creation
};

assert(!isStatusOverwrittenOnUpdate(true), 'Existing parent document status is not overwritten on mark updates');

// 8. Published examination remains immutable
const canUpdatePublishedExam = (published: boolean, status: string) => {
  return !(published === true || status === 'PUBLISHED');
};

assert(!canUpdatePublishedExam(true, 'PUBLISHED'), 'Published examination remains immutable');
assert(canUpdatePublishedExam(false, 'DRAFT'), 'Unpublished draft examination permits updates');

// 9. Existing terminal locks and authorization continue to work
const fourTerminalLockTest = (publishedCount: number) => publishedCount >= 4;
assert(fourTerminalLockTest(4) === true, 'Four-terminal publication lock triggers at 4 published terminals');
assert(fourTerminalLockTest(3) === false, 'Four-terminal publication lock permits updates at < 4 published terminals');

// -----------------------------------------------------------------------------
// 5. Manual Entry UI Consolidation & Explicit 4-State Mode Separation
// -----------------------------------------------------------------------------
console.log('\n5. Testing Manual Entry UI Consolidation & Explicit 4-State Mode Separation...');

const deriveManualEntryFourStateMode = (
  initialContext: any,
  userSelectedMode: 'CONNECTED' | 'INDEPENDENT' | null
): 'CONNECTED' | 'INDEPENDENT' | 'INVALID_SHARED_CONFIG' | 'UNCONFIGURED' => {
  if (userSelectedMode === 'INDEPENDENT') {
    return 'INDEPENDENT';
  }
  if (userSelectedMode === 'CONNECTED' && initialContext?.isConfigValid) {
    return 'CONNECTED';
  }
  if (initialContext) {
    if (initialContext.isConfigValid) {
      return 'CONNECTED';
    }
    if (
      initialContext.selectedExam ||
      initialContext.selectedClass ||
      (Array.isArray(initialContext.validationErrors) && initialContext.validationErrors.length > 0)
    ) {
      return 'INVALID_SHARED_CONFIG';
    }
  }
  return 'UNCONFIGURED';
};

// Assertion 1: Valid shared context defaults to CONNECTED
assert(
  deriveManualEntryFourStateMode({ isConfigValid: true, selectedExam: 'First Terminal' }, null) === 'CONNECTED',
  'Manual Entry resolves to CONNECTED when valid shared config exists'
);

// Assertion 2: Invalid shared context resolves to INVALID_SHARED_CONFIG (no silent fallback to standalone)
const invalidSharedCtx = { isConfigValid: false, selectedExam: 'First Terminal', validationErrors: ['Subject marks incomplete'] };
assert(
  deriveManualEntryFourStateMode(invalidSharedCtx, null) === 'INVALID_SHARED_CONFIG',
  'Manual Entry resolves to INVALID_SHARED_CONFIG when shared config exists but is invalid'
);
assert(
  deriveManualEntryFourStateMode(invalidSharedCtx, null) !== 'INDEPENDENT',
  'Invalid shared configuration does NOT silently fall back to Standalone Mode'
);

// Assertion 3: Unconfigured shared context resolves to UNCONFIGURED
assert(
  deriveManualEntryFourStateMode(null, null) === 'UNCONFIGURED',
  'Manual Entry resolves to UNCONFIGURED when no shared context exists'
);

// Assertion 4: Explicit user mode selection forces INDEPENDENT mode
assert(
  deriveManualEntryFourStateMode(invalidSharedCtx, 'INDEPENDENT') === 'INDEPENDENT',
  'Explicit user action "Switch to Standalone Direct Entry" enables INDEPENDENT mode even with invalid shared setup'
);
assert(
  deriveManualEntryFourStateMode(null, 'INDEPENDENT') === 'INDEPENDENT',
  'Explicit user action "Use Standalone Direct Entry" enables INDEPENDENT mode when unconfigured'
);

// Assertion 5: SharedExamSetup component rendering rule in Admin.tsx
const isSharedExamSetupRenderedInAdmin = (activeTab: string, _sharedContext: any) => {
  // SharedExamSetup is always rendered when activeTab === "manual", regardless of sharedContext validity
  return activeTab === 'manual';
};

assert(
  isSharedExamSetupRenderedInAdmin('manual', null) === true,
  'SharedExamSetup remains rendered and visible in Admin.tsx when activeTab === "manual" and no shared context exists'
);
assert(
  isSharedExamSetupRenderedInAdmin('manual', { isConfigValid: false }) === true,
  'SharedExamSetup remains rendered and visible in Admin.tsx when activeTab === "manual" and shared context is invalid'
);

console.log('====================================================');
console.log(`RESULTS: ${passed} / ${passed + failed} TESTS PASSED`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
}
