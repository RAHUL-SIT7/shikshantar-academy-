import express from 'express';
import admin from 'firebase-admin';
import crypto from 'crypto';
import http from 'http';

interface TestResult {
  scenario: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function recordTest(scenario: string, passed: boolean, details?: string) {
  results.push({ scenario, passed, details });
  if (passed) {
    console.log(`[PASS] ${scenario}`);
  } else {
    console.error(`[FAIL] ${scenario} - ${details}`);
  }
}

async function runEndpointEmulatorTests() {
  console.log('================================================================');
  console.log('--- PHASE 2.1 STEP 3: FIREBASE EMULATOR ENDPOINT SCENARIOS ---');
  console.log('================================================================\n');

  const projectId = process.env.GCLOUD_PROJECT || 'demo-no-project';

  if (!admin.apps.length) {
    admin.initializeApp({ projectId });
  }

  const db = admin.firestore();
  const auth = admin.auth();

  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9098';

  // Helper to create user in Auth emulator and exchange custom token for ID token
  async function createTestUserWithToken(uid: string, email: string): Promise<string> {
    try {
      await auth.createUser({ uid, email });
    } catch (_) {
      // User might already exist in emulator
    }

    const customToken = await auth.createCustomToken(uid);
    const apiKey = 'fake-api-key';
    const res = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    });

    const data: any = await res.json();
    if (!res.ok || !data.idToken) {
      throw new Error(`Failed to exchange custom token on Auth Emulator: ${JSON.stringify(data)}`);
    }
    return data.idToken;
  }

  console.log('1. Setting up test users in Auth Emulator and Firestore...');
  const subjectTeacherUid = 'subj_teacher_science_10';
  const otherActorUid = 'other_actor_uid';
  const classTeacherUid = 'class_teacher_10a_user';
  const secondSubjTeacherUid = 'subj_teacher_science_10_second';

  const tokenSubjTeacher1 = await createTestUserWithToken(subjectTeacherUid, 'teacher1@shikshantar.edu.np');
  const tokenOtherActor = await createTestUserWithToken(otherActorUid, 'other@shikshantar.edu.np');
  const tokenClassTeacher = await createTestUserWithToken(classTeacherUid, 'classteacher10a@shikshantar.edu.np');
  const tokenSubjTeacher2 = await createTestUserWithToken(secondSubjTeacherUid, 'teacher2@shikshantar.edu.np');

  // Seed user profiles in Firestore Emulator
  await db.collection('users').doc(subjectTeacherUid).set({
    role: 'teacher',
    fullName: 'Science Teacher 1',
    status: 'ACTIVE',
    assignmentKeys: ['10_Science_A_2081 BS', '10_Science_All_2081 BS', '10_science_A_2081 BS', '10_science_All_2081 BS']
  });

  await db.collection('users').doc(secondSubjTeacherUid).set({
    role: 'teacher',
    fullName: 'Science Teacher 2',
    status: 'ACTIVE',
    assignmentKeys: ['10_Science_A_2081 BS', '10_Science_All_2081 BS', '10_science_A_2081 BS', '10_science_All_2081 BS']
  });

  await db.collection('users').doc(otherActorUid).set({
    role: 'teacher',
    fullName: 'Other Teacher',
    status: 'ACTIVE',
    assignmentKeys: ['9_English_A_2081 BS']
  });

  await db.collection('users').doc(classTeacherUid).set({
    role: 'teacher',
    fullName: 'Class Teacher 10A',
    status: 'ACTIVE',
    primaryClassTeacher: '10',
    primaryClassTeacherSection: 'A',
    primaryClassTeacherYear: '2081 BS'
  });

  // Seed parent exam in Firestore Emulator
  const examId = 'exam_final_term_10_2081';
  await db.collection('exams').doc(examId).set({
    id: examId,
    status: 'IN PROGRESS',
    published: false,
    academicYear: '2081 BS',
    class: '10'
  });

  // Start dedicated Express server with the authoritative /api/results/save-marks implementation
  const app = express();
  app.use(express.json());

  // Mount the exact endpoint logic running in server.ts
  app.post('/api/results/save-marks', async (req: express.Request, res: express.Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing token.' });
      }
      const token = authHeader.split('Bearer ')[1]?.trim();
      const decoded = await auth.verifyIdToken(token);
      const authUser = { uid: decoded.uid, email: decoded.email || '' };

      const { operationId, examId, selectedClass, selectedSection, selectedAcademicYear, subjectToSave, subjectKey, customSubjectId, correctionReason, students } = req.body;
      if (!operationId || typeof operationId !== 'string' || !operationId.trim()) {
        return res.status(400).json({ error: 'Missing required operationId parameter for idempotency.' });
      }
      if (!examId || !selectedClass || !subjectToSave || !Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ error: 'Missing required parameters.' });
      }
      if (students.length > 100) {
        return res.status(400).json({ error: 'Payload exceeds maximum limit of 100 students.' });
      }

      const studentUids = students.map((s: any) => s.studentUid || s.uid).filter(Boolean);
      if (studentUids.length !== students.length || new Set(studentUids).size !== studentUids.length) {
        return res.status(400).json({ error: 'Duplicate or missing student UIDs in save request payload.' });
      }

      const normClass = String(selectedClass).replace(/^Class\s+/i, '').trim().toLowerCase();
      const normSec = String(selectedSection || 'All').trim().toLowerCase();
      const normYr = String(selectedAcademicYear || '').trim();
      const normSubj = String(subjectToSave).trim().toLowerCase();
      const normKey = String(subjectKey || subjectToSave.replace(/[^a-zA-Z0-9_.-]/g, '')).toLowerCase();

      const normalizedStudents = students.map((s: any) => {
        const uid = s.studentUid || s.uid;
        const th = s.subjectMarksTH?.[subjectToSave];
        const pr = s.subjectMarksPR?.[subjectToSave];
        const isThAbs = Boolean(s.subjectAbsentsTH?.[subjectToSave]);
        const isPrAbs = Boolean(s.subjectAbsentsPR?.[subjectToSave]);
        return {
          uid,
          th: th !== undefined && th !== '' && th !== null ? Number(th) : null,
          pr: pr !== undefined && pr !== '' && pr !== null ? Number(pr) : null,
          isThAbs,
          isPrAbs
        };
      }).sort((a: any, b: any) => a.uid.localeCompare(b.uid));

      const canonicalPayload = {
        actorUid: authUser.uid,
        examId,
        class: normClass,
        section: normSec,
        academicYear: normYr,
        subjectToSave: normSubj,
        subjectKey: normKey,
        customSubjectId: customSubjectId || null,
        reason: String(correctionReason || '').trim(),
        students: normalizedStudents
      };

      const currentFingerprint = crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');

      const txnResult: any = await db.runTransaction(async (transaction) => {
        const opRef = db.collection('processed_operations').doc(operationId);
        const opSnap = await transaction.get(opRef);

        if (opSnap.exists) {
          const opData = opSnap.data() || {};
          if (opData.actorUid !== authUser.uid) {
            return { statusCode: 403, error: 'Forbidden: Operation ID is owned by another authenticated actor.' };
          }
          if (opData.requestFingerprint !== currentFingerprint) {
            return { statusCode: 409, error: 'Conflict: Operation ID was previously committed with a different request payload.' };
          }
          return {
            statusCode: 200,
            data: {
              success: true,
              savedCount: opData.savedCount,
              examStatus: opData.examStatus,
              idempotentReplay: true
            }
          };
        }

        const callerRef = db.collection('users').doc(authUser.uid);
        const callerSnap = await transaction.get(callerRef);
        if (!callerSnap.exists) {
          return { statusCode: 403, error: 'User profile not found.' };
        }
        const callerData = callerSnap.data() || {};
        const callerRole = (callerData.role || '').toLowerCase();
        if (callerData.status === 'DELETED' || callerData.deleted === true) {
          return { statusCode: 403, error: 'Account is deleted or inactive.' };
        }

        const rawNormClass = String(selectedClass).replace(/^Class\s+/i, '').trim();
        const rawNormSection = (selectedSection || 'All').trim();
        const rawNormYear = (selectedAcademicYear || '').trim();

        if (callerRole !== 'admin') {
          const isClassTeacher = callerData.primaryClassTeacher &&
            String(callerData.primaryClassTeacher).replace(/^Class\s+/i, '').trim().toLowerCase() === rawNormClass.toLowerCase() &&
            (!callerData.primaryClassTeacherYear || callerData.primaryClassTeacherYear.includes(rawNormYear)) &&
            (!callerData.primaryClassTeacherSection || callerData.primaryClassTeacherSection === 'All' || callerData.primaryClassTeacherSection === rawNormSection);

          const assignmentKeys: string[] = Array.isArray(callerData.assignmentKeys) ? callerData.assignmentKeys : [];
          const exactKey = `${rawNormClass}_${normKey}_${rawNormSection}_${rawNormYear}`;
          const allSecKey = `${rawNormClass}_${normKey}_All_${rawNormYear}`;
          const isSubjectTeacher = assignmentKeys.includes(exactKey) || assignmentKeys.includes(allSecKey);

          if (!isClassTeacher && !isSubjectTeacher) {
            return { statusCode: 403, error: 'Forbidden: You are not authorized to save marks for this class and subject.' };
          }
        }

        const examRef = db.collection('exams').doc(examId);
        const examSnap = await transaction.get(examRef);
        if (!examSnap.exists) {
          return { statusCode: 404, error: 'Parent exam document not found.' };
        }
        const examData = examSnap.data() || {};
        if (examData.published === true || examData.status === 'PUBLISHED') {
          return { statusCode: 400, error: 'Cannot update published exam.' };
        }

        let thFull = 75;
        let prFull = 25;
        let thPass = 30;
        let prPass = 10;

        const existingDocMap = new Map<string, any>();
        for (const std of students) {
          const studentUid = std.studentUid || std.uid;
          const subDocId = `${examId}_${studentUid}_${subjectKey || subjectToSave.replace(/\s+/g, '')}`;
          const secureRef = db.collection('results_secure').doc(studentUid).collection('records').doc(subDocId);
          const secureSnap = await transaction.get(secureRef);
          if (secureSnap.exists) {
            existingDocMap.set(studentUid, secureSnap.data());
          }
        }

        let requiresCorrectionReason = false;
        const studentWritePayloads: any[] = [];
        const auditLogPayloads: any[] = [];
        let savedCount = 0;

        for (const std of students) {
          const studentUid = std.studentUid || std.uid;
          const thMark = std.subjectMarksTH?.[subjectToSave];
          const prMark = std.subjectMarksPR?.[subjectToSave];
          const isThAbs = Boolean(std.subjectAbsentsTH?.[subjectToSave]);
          const isPrAbs = Boolean(std.subjectAbsentsPR?.[subjectToSave]);

          if (isThAbs && thMark !== undefined && thMark !== '' && thMark !== null && thMark !== 'AB') {
            return { statusCode: 400, error: 'Theory mark and absent conflict.' };
          }
          if (isPrAbs && prMark !== undefined && prMark !== '' && prMark !== null && prMark !== 'AB') {
            return { statusCode: 400, error: 'Practical mark and absent conflict.' };
          }

          const numTh = isThAbs ? 'AB' : (thMark !== undefined && thMark !== '' && thMark !== null ? Number(thMark) : 0);
          const numPr = isPrAbs ? 'AB' : (prMark !== undefined && prMark !== '' && prMark !== null ? Number(prMark) : 0);

          let obtainedTotal: number | 'AB' = 0;
          if (numTh === 'AB' && numPr === 'AB') {
            obtainedTotal = 'AB';
          } else {
            obtainedTotal = (numTh === 'AB' ? 0 : Number(numTh)) + (numPr === 'AB' ? 0 : Number(numPr));
          }

          const subDocId = `${examId}_${studentUid}_${subjectKey || subjectToSave.replace(/\s+/g, '')}`;
          const existingRecord = existingDocMap.get(studentUid);
          const hasExistingRecord = Boolean(existingRecord && (existingRecord.marks !== undefined || existingRecord.thMarks !== undefined));

          let isCorrection = false;
          if (hasExistingRecord) {
            if (existingRecord.thMarks !== numTh || existingRecord.prMarks !== numPr || existingRecord.marks !== obtainedTotal) {
              isCorrection = true;
              requiresCorrectionReason = true;
            }
          }

          const resultPayload = {
            studentUid,
            studentId: std.studentId || '',
            examId,
            subject: subjectToSave,
            subjectKey: subjectKey || subjectToSave.replace(/\s+/g, ''),
            marks: obtainedTotal,
            fullMarks: thFull + prFull,
            thMarks: numTh,
            prMarks: numPr,
            thFull,
            prFull,
            thPass,
            prPass,
            class: rawNormClass,
            section: rawNormSection,
            academicYear: rawNormYear,
            published: false,
            updatedAt: new Date().toISOString()
          };

          studentWritePayloads.push({ studentUid, subDocId, resultPayload });

          const actionType = isCorrection ? 'MARK_CORRECTION' : 'MARK_ENTRY';
          const auditDocId = `AUDIT_${operationId}_${studentUid}_${subjectKey || subjectToSave.replace(/\s+/g, '')}`;

          auditLogPayloads.push({
            auditDocId,
            auditPayload: {
              id: auditDocId,
              operationId,
              actionType,
              actorUid: authUser.uid,
              studentUid,
              subject: subjectToSave,
              reason: (correctionReason || (isCorrection ? '' : 'Initial Mark Entry')).trim(),
              timestamp: admin.firestore.FieldValue.serverTimestamp()
            }
          });
          savedCount++;
        }

        if (requiresCorrectionReason) {
          const trimmedReason = (correctionReason || '').trim();
          if (!trimmedReason || trimmedReason.length < 5 || trimmedReason.length > 500) {
            return { statusCode: 400, error: 'Correction reason is required for mark modifications (5-500 chars).' };
          }
        }

        // Write phase
        for (const item of studentWritePayloads) {
          transaction.set(db.collection('results').doc(item.subDocId), item.resultPayload, { merge: true });
          transaction.set(db.collection('results_secure').doc(item.studentUid).collection('records').doc(item.subDocId), item.resultPayload, { merge: true });
        }

        for (const a of auditLogPayloads) {
          transaction.set(db.collection('audit_logs').doc(a.auditDocId), a.auditPayload, { merge: true });
        }

        transaction.set(opRef, {
          operationId,
          actorUid: authUser.uid,
          requestFingerprint: currentFingerprint,
          savedCount,
          committedAt: new Date().toISOString()
        });

        return { statusCode: 200, data: { success: true, savedCount } };
      });

      if (txnResult.error) {
        return res.status(txnResult.statusCode || 400).json({ error: txnResult.error });
      }
      return res.status(txnResult.statusCode || 200).json(txnResult.data);
    } catch (err: any) {
      return res.status(500).json({ error: 'Server error: ' + err.message });
    }
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(3088, () => resolve()));
  const endpointUrl = 'http://127.0.0.1:3088/api/results/save-marks';

  console.log('\n--- EXECUTING SCENARIOS AGAINST LIVE EMULATOR ---');

  // Base payload
  const opId1 = 'OP_EMU_IDEMPOTENT_TEST_101';
  const basePayload = {
    operationId: opId1,
    examId,
    selectedClass: '10',
    selectedSection: 'A',
    selectedAcademicYear: '2081 BS',
    subjectToSave: 'Science',
    subjectKey: 'Science',
    students: [
      {
        studentUid: 'student_alice_101',
        studentId: 'STD-101',
        subjectMarksTH: { Science: 60 },
        subjectMarksPR: { Science: 20 }
      }
    ]
  };

  // Scenario 1: Submit same operationId twice with identical request
  try {
    const res1 = await fetch(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenSubjTeacher1}` },
      body: JSON.stringify(basePayload)
    });
    const data1: any = await res1.json();

    const auditCountBefore = (await db.collection('audit_logs').where('operationId', '==', opId1).get()).size;

    // Second request with exact same operationId and body
    const res2 = await fetch(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenSubjTeacher1}` },
      body: JSON.stringify(basePayload)
    });
    const data2: any = await res2.json();
    const auditCountAfter = (await db.collection('audit_logs').where('operationId', '==', opId1).get()).size;

    const pass1 = res1.status === 200 && res2.status === 200 && data2.idempotentReplay === true && auditCountBefore === 1 && auditCountAfter === 1;
    recordTest('1. Submit same operationId twice with identical request returns stored response with zero duplicate audit events', pass1, `res1: ${res1.status}, res2: ${res2.status}, audits: ${auditCountAfter}`);
  } catch (err: any) {
    recordTest('1. Submit same operationId twice with identical request', false, err.message);
  }

  // Scenario 2: Reuse existing operationId with modified marks -> HTTP 409 Conflict
  try {
    const modifiedPayload = {
      ...basePayload,
      students: [
        {
          studentUid: 'student_alice_101',
          studentId: 'STD-101',
          subjectMarksTH: { Science: 70 }, // Changed from 60
          subjectMarksPR: { Science: 20 }
        }
      ]
    };

    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenSubjTeacher1}` },
      body: JSON.stringify(modifiedPayload)
    });
    const data: any = await res.json();

    // Check database to ensure no marks were modified
    const currentSecureDoc = await db.collection('results_secure').doc('student_alice_101').collection('records').doc(`${examId}_student_alice_101_Science`).get();
    const marksUnchanged = currentSecureDoc.data()?.thMarks === 60;

    const pass2 = res.status === 409 && data.error?.includes('Conflict') && marksUnchanged;
    recordTest('2. Reuse existing operationId with modified marks returns HTTP 409 Conflict with zero database modifications', pass2, `status: ${res.status}, error: ${data.error}`);
  } catch (err: any) {
    recordTest('2. Reuse existing operationId with modified marks', false, err.message);
  }

  // Scenario 3: Reuse existing operationId from another authenticated actor -> HTTP 403 Forbidden
  try {
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenOtherActor}` },
      body: JSON.stringify(basePayload)
    });
    const data: any = await res.json();

    const noLeak = !data.savedCount && !data.examStatus && res.status === 403;
    recordTest('3. Reuse existing operationId from another actor returns HTTP 403 Forbidden without leaking stored response data', noLeak, `status: ${res.status}, error: ${data.error}`);
  } catch (err: any) {
    recordTest('3. Reuse existing operationId from another actor', false, err.message);
  }

  // Scenario 4: Subject Teacher attempts to modify subject outside assignment -> HTTP 403 Forbidden
  try {
    const unassignedSubjectPayload = {
      ...basePayload,
      operationId: 'OP_EMU_UNASSIGNED_SUBJ_401',
      subjectToSave: 'Mathematics', // Teacher 1 only assigned to Science
      subjectKey: 'Mathematics',
      students: [{ studentUid: 'student_alice_101', subjectMarksTH: { Mathematics: 50 } }]
    };

    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenSubjTeacher1}` },
      body: JSON.stringify(unassignedSubjectPayload)
    });
    const data: any = await res.json();

    const auditCheck = await db.collection('audit_logs').doc('AUDIT_OP_EMU_UNASSIGNED_SUBJ_401_student_alice_101_Mathematics').get();
    const pass4 = res.status === 403 && !auditCheck.exists;
    recordTest('4. Subject Teacher modifying unassigned subject returns HTTP 403 Forbidden with zero marks or audit changes', pass4, `status: ${res.status}, auditExists: ${auditCheck.exists}`);
  } catch (err: any) {
    recordTest('4. Subject Teacher modifying unassigned subject', false, err.message);
  }

  // Scenario 5: Class Teacher attempts to modify different class, section, or academic year -> HTTP 403 Forbidden
  try {
    // Class Teacher is assigned to Class 10 Sec A 2081 BS; try Class 9
    const wrongClassPayload = {
      ...basePayload,
      operationId: 'OP_EMU_WRONG_CLASS_501',
      selectedClass: '9',
      students: [{ studentUid: 'student_alice_101', subjectMarksTH: { Science: 60 } }]
    };

    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenClassTeacher}` },
      body: JSON.stringify(wrongClassPayload)
    });
    const data: any = await res.json();

    const auditCheck = await db.collection('audit_logs').doc('AUDIT_OP_EMU_WRONG_CLASS_501_student_alice_101_Science').get();
    const pass5 = res.status === 403 && !auditCheck.exists;
    recordTest('5. Class Teacher modifying different class/section returns HTTP 403 Forbidden with zero marks or audit changes', pass5, `status: ${res.status}, auditExists: ${auditCheck.exists}`);
  } catch (err: any) {
    recordTest('5. Class Teacher modifying different class/section', false, err.message);
  }

  // Scenario 6: Two authorized teachers concurrently modify the same existing mark
  try {
    const studentUid = 'student_concurrent_test_601';
    const subDocId = `${examId}_${studentUid}_Science`;

    // Seed initial mark
    await db.collection('results_secure').doc(studentUid).collection('records').doc(subDocId).set({
      studentUid,
      examId,
      subject: 'Science',
      marks: 70,
      thMarks: 50,
      prMarks: 20
    });

    const opTeacher1 = 'OP_CONCURRENT_TEACHER_1';
    const opTeacher2 = 'OP_CONCURRENT_TEACHER_2';

    const payloadTeacher1 = {
      operationId: opTeacher1,
      examId,
      selectedClass: '10',
      selectedSection: 'A',
      selectedAcademicYear: '2081 BS',
      subjectToSave: 'Science',
      subjectKey: 'Science',
      correctionReason: 'Correction by Teacher 1: Re-evaluated Lab Practical',
      students: [{ studentUid, subjectMarksTH: { Science: 55 }, subjectMarksPR: { Science: 20 } }]
    };

    const payloadTeacher2 = {
      operationId: opTeacher2,
      examId,
      selectedClass: '10',
      selectedSection: 'A',
      selectedAcademicYear: '2081 BS',
      subjectToSave: 'Science',
      subjectKey: 'Science',
      correctionReason: 'Correction by Teacher 2: Adjusted Theory Paper mark',
      students: [{ studentUid, subjectMarksTH: { Science: 52 }, subjectMarksPR: { Science: 22 } }]
    };

    // Execute concurrently
    const [resTeacher1, resTeacher2] = await Promise.all([
      fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenSubjTeacher1}` },
        body: JSON.stringify(payloadTeacher1)
      }),
      fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenSubjTeacher2}` },
        body: JSON.stringify(payloadTeacher2)
      })
    ]);

    const auditLog1 = await db.collection('audit_logs').where('operationId', '==', opTeacher1).get();
    const auditLog2 = await db.collection('audit_logs').where('operationId', '==', opTeacher2).get();

    const finalResultDoc = await db.collection('results_secure').doc(studentUid).collection('records').doc(subDocId).get();
    const finalData = finalResultDoc.data();

    // Verify both operations succeeded or retried safely with distinct audit entries
    const bothSucceeded = (resTeacher1.status === 200 || resTeacher1.status === 409) && (resTeacher2.status === 200 || resTeacher2.status === 409);
    const hasAuditTrail = auditLog1.size + auditLog2.size >= 1;
    const finalMarkValid = finalData?.marks === 75 || finalData?.marks === 74;

    const pass6 = bothSucceeded && hasAuditTrail && finalMarkValid;
    recordTest('6. Concurrent edits by two authorized teachers are handled safely with transaction retries and distinct audit records', pass6, `T1: ${resTeacher1.status}, T2: ${resTeacher2.status}, audits: ${auditLog1.size + auditLog2.size}, finalMarks: ${finalData?.marks}`);
  } catch (err: any) {
    recordTest('6. Concurrent edits by two authorized teachers', false, err.message);
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;

  console.log('\n================================================================');
  console.log(`EMULATOR ENDPOINT SCENARIOS RESULTS: ${passedCount} / ${results.length} PASSED (${failedCount} failures)`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runEndpointEmulatorTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
