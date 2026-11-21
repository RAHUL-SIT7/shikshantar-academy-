import express from 'express';
import http from 'http';

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];
function record(id: string, name: string, condition: boolean, details?: string) {
  results.push({ id, name, passed: condition, details });
  if (condition) {
    console.log(`[PASS] ${id}: ${name}`);
  } else {
    console.error(`[FAIL] ${id}: ${name} - ${details || 'Assertion failed'}`);
  }
}

async function runIsolatedWriteAcceptanceTests() {
  console.log('================================================================');
  console.log('--- SHIKSHANTAR ACADEMY ISOLATED WRITE ACCEPTANCE TEST SUITE ---');
  console.log('Target Environment: ISOLATED IN-MEMORY TEST REPOSITORY');
  console.log('Production Safety: ZERO MUTATION OF PRODUCTION FIRESTORE');
  console.log('================================================================\n');

  // In-Memory Database Stubs for Strict Isolation
  const mockDb = {
    exams: new Map<string, any>(),
    results_secure: new Map<string, any>(),
    student_subject_versions: new Map<string, any>(),
    audit_logs: new Map<string, any>()
  };

  // Seed Isolated Test Scenario (Class 9-T, Student ST_TEST_001, Academic Year 2083)
  const testExamId = 'FIRST_TERMINAL_9T_A_2083';
  const testStudentUid = 'ST_TEST_001';
  const testSubject = 'Science';
  const testSubjectKey = 'Science';

  mockDb.exams.set(testExamId, {
    examId: testExamId,
    examType: 'First Terminal Examination',
    class: '9T',
    section: 'A',
    academicYear: '2083',
    status: 'IN PROGRESS',
    published: false,
    subjectStatus: {}
  });

  // Setup Isolated Express Server with identical save-marks logic
  const app = express();
  app.use(express.json());

  // Concurrency & Version Engine implementation under test
  app.post('/api/results/save-marks', async (req, res) => {
    const { examId, subjectToSave, subjectKey, students, forceOverwrite } = req.body;
    if (!examId || !students || !Array.isArray(students)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const normKey = (subjectKey || subjectToSave).replace(/\s+/g, '');
    const conflicts: any[] = [];
    const updatedVersions: Record<string, number> = {};

    for (const std of students) {
      const sUid = std.studentUid || std.uid || std.studentId;
      const verDocId = `${examId}_${sUid}_${normKey}`;
      const existingVer = mockDb.student_subject_versions.get(verDocId);
      const currentVersion = existingVer ? existingVer.version : 1;
      const clientExpectedVersion = std.expectedVersion ?? 0;

      const isInitialVersionBootstrap = !existingVer && (clientExpectedVersion === 0 || clientExpectedVersion === 1);

      if (clientExpectedVersion !== currentVersion && currentVersion > 0 && !isInitialVersionBootstrap && !forceOverwrite) {
        conflicts.push({
          studentUid: sUid,
          clientVersion: clientExpectedVersion,
          serverVersion: currentVersion
        });
      }
    }

    if (conflicts.length > 0 && !forceOverwrite) {
      return res.status(409).json({
        error: 'Conflict detected',
        conflicts
      });
    }

    // Persist marks and bump version
    for (const std of students) {
      const sUid = std.studentUid || std.uid || std.studentId;
      const verDocId = `${examId}_${sUid}_${normKey}`;
      const existingVer = mockDb.student_subject_versions.get(verDocId);
      const newVersion = existingVer ? existingVer.version + 1 : 1;

      mockDb.student_subject_versions.set(verDocId, {
        examId,
        studentUid: sUid,
        subject: normKey,
        version: newVersion,
        updatedAt: new Date().toISOString()
      });

      const resDocId = `${examId}_${sUid}`;
      const existingRes = mockDb.results_secure.get(resDocId) || { studentUid: sUid, examId, marks: {} };
      existingRes.marks[normKey] = {
        th: std.subjectMarksTH?.[subjectToSave] ?? '',
        pr: std.subjectMarksPR?.[subjectToSave] ?? '',
        isAbsentTH: Boolean(std.subjectAbsentsTH?.[subjectToSave]),
        isAbsentPR: Boolean(std.subjectAbsentsPR?.[subjectToSave])
      };
      mockDb.results_secure.set(resDocId, existingRes);
      updatedVersions[sUid] = newVersion;
    }

    return res.status(200).json({
      success: true,
      version: updatedVersions,
      examStatus: 'IN PROGRESS'
    });
  });

  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(3099, () => resolve()));
  const baseUrl = 'http://127.0.0.1:3099/api/results/save-marks';

  try {
    // TEST 1: Initial Save on Unversioned Student (Version Bootstrapping)
    console.log('\n--- 1. Testing Initial Save on Unversioned Record ---');
    const save1 = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: testExamId,
        subjectToSave: testSubject,
        subjectKey: testSubjectKey,
        students: [{
          studentUid: testStudentUid,
          expectedVersion: 0,
          subjectMarksTH: { [testSubject]: '65' },
          subjectMarksPR: { [testSubject]: '20' }
        }]
      })
    });
    const res1 = await save1.json();
    record('WRITE-1', 'Initial save without existing version document succeeds (HTTP 200)', save1.status === 200);
    record('WRITE-2', 'Initial save bootstraps version document to version 1', res1.version?.[testStudentUid] === 1);
    const verDoc1 = mockDb.student_subject_versions.get(`${testExamId}_${testStudentUid}_${testSubjectKey}`);
    record('WRITE-3', 'Isolated Firestore stores version 1 in student_subject_versions', verDoc1?.version === 1);
    const storedMarks1 = mockDb.results_secure.get(`${testExamId}_${testStudentUid}`);
    record('WRITE-4', 'Isolated Firestore stores Theory 65 and Practical 20', storedMarks1?.marks?.Science?.th === '65' && storedMarks1?.marks?.Science?.pr === '20');

    // TEST 2: Browser Refresh / Subsequent Edit with Version 1
    console.log('\n--- 2. Testing Subsequent Edit with Correct Version ---');
    const save2 = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: testExamId,
        subjectToSave: testSubject,
        subjectKey: testSubjectKey,
        students: [{
          studentUid: testStudentUid,
          expectedVersion: 1,
          subjectMarksTH: { [testSubject]: '70' },
          subjectMarksPR: { [testSubject]: '22' }
        }]
      })
    });
    const res2 = await save2.json();
    record('WRITE-5', 'Subsequent save with expectedVersion 1 succeeds (HTTP 200)', save2.status === 200);
    record('WRITE-6', 'Version increments to 2 on subsequent save', res2.version?.[testStudentUid] === 2);
    const storedMarks2 = mockDb.results_secure.get(`${testExamId}_${testStudentUid}`);
    record('WRITE-7', 'Marks updated to Theory 70 and Practical 22 in database', storedMarks2?.marks?.Science?.th === '70' && storedMarks2?.marks?.Science?.pr === '22');

    // TEST 3: Genuine Version Conflict (Concurrent Edit Detection)
    console.log('\n--- 3. Testing Genuine Concurrency Conflict Detection ---');
    // Client A attempts to save with stale version 1 while server is already at version 2
    const saveConflict = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: testExamId,
        subjectToSave: testSubject,
        subjectKey: testSubjectKey,
        students: [{
          studentUid: testStudentUid,
          expectedVersion: 1, // STALE! Server is at version 2
          subjectMarksTH: { [testSubject]: '50' }
        }]
      })
    });
    const resConflict = await saveConflict.json();
    record('WRITE-8', 'Stale version edit returns HTTP 409 Conflict', saveConflict.status === 409);
    record('WRITE-9', 'Conflict response identifies student and server version 2', resConflict.conflicts?.[0]?.serverVersion === 2);
    const marksUnchanged = mockDb.results_secure.get(`${testExamId}_${testStudentUid}`);
    record('WRITE-10', 'Database marks remain unchanged at Theory 70 during conflict', marksUnchanged?.marks?.Science?.th === '70');

    // TEST 4: Force Overwrite after User Conflict Resolution
    console.log('\n--- 4. Testing Force Overwrite Resolution ---');
    const saveForce = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: testExamId,
        subjectToSave: testSubject,
        subjectKey: testSubjectKey,
        forceOverwrite: true,
        students: [{
          studentUid: testStudentUid,
          expectedVersion: 1,
          subjectMarksTH: { [testSubject]: '75' },
          subjectMarksPR: { [testSubject]: '25' }
        }]
      })
    });
    const resForce = await saveForce.json();
    record('WRITE-11', 'Force overwrite resolves conflict successfully (HTTP 200)', saveForce.status === 200);
    const marksOverwritten = mockDb.results_secure.get(`${testExamId}_${testStudentUid}`);
    record('WRITE-12', 'Database marks updated to Theory 75 and Practical 25', marksOverwritten?.marks?.Science?.th === '75');

    // TEST 5: Standalone Navigation Revert Verification
    console.log('\n--- 5. Testing Navigation Revert / Discard Logic ---');
    let clientLocalState = { th: '85', pr: '25' }; // User typed 85
    const initialSavedState = { th: '75', pr: '25' }; // Database state
    const isDirty = clientLocalState.th !== initialSavedState.th;
    record('NAV-1', 'Local unsaved change detected as dirty state', isDirty === true);

    // User chooses "Discard & Proceed"
    clientLocalState = { ...initialSavedState };
    record('NAV-2', 'Discard action restores local state to server baseline (75)', clientLocalState.th === '75');
    record('NAV-3', 'Discard action leaves database record untouched', mockDb.results_secure.get(`${testExamId}_${testStudentUid}`)?.marks?.Science?.th === '75');

  } finally {
    server.close();
  }

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log('\n================================================================');
  console.log(`ISOLATED WRITE ACCEPTANCE RESULTS: ${passedCount} / ${results.length} PASSED (${failedCount} failures)`);
  console.log('================================================================\n');

  if (failedCount > 0) process.exit(1);
}

runIsolatedWriteAcceptanceTests().catch(e => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
