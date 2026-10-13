import { 
  recordTest, 
  adminDb, 
  createClientContext, 
  TestClientContext 
} from './framework';

export async function runPartHTests(): Promise<void> {
  console.log('\n======================================================================');
  console.log('PART H: USER PROFILE TYPE SAFETY & ROUTE VALIDATION');
  console.log('======================================================================\n');

  const student = await createClientContext({ 
    role: 'student', 
    emailPrefix: 'prof_std',
    permanentStudentId: 'STU-PROF-001',
    admissionNo: 'ADM-PROF-001',
    class: '10'
  });

  const teacher = await createClientContext({ 
    role: 'teacher', 
    emailPrefix: 'prof_tch',
    class: '9'
  });

  const adminCtx = await createClientContext({ 
    role: 'admin', 
    adminTier: 'primary', 
    emailPrefix: 'prof_adm' 
  });

  // 1. Verify Student document does NOT have teacher salary or staff keys
  try {
    const studentDoc = await adminDb.collection('users').doc(student.uid).get();
    const data = studentDoc.data() || {};
    const hasTeacherFields = 'salary' in data || 'salaryStructure' in data || 'assignedSalary' in data;
    const passed = !hasTeacherFields && data.role === 'student';
    recordTest({
      id: 'PROF-01',
      category: 'PROFILE TYPE SAFETY',
      scenario: 'Student user profile does not contain teacher salary fields',
      command: 'Inspect users/studentUid fields',
      input: { uid: student.uid, role: 'student' },
      operation: 'Schema verification of student profile fields',
      expected: 'No salary, salaryStructure, or staff-only attributes present',
      actual: `hasTeacherFields=${hasTeacherFields}, role=${data.role}`,
      difference: passed ? 'None (Matched)' : 'Teacher fields leaked into student schema',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(data),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'PROF-01', category: 'PROFILE TYPE SAFETY', scenario: 'Student profile schema', command: 'get', input: {}, operation: 'Inspect', expected: 'Clean schema', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 2. Verify Teacher document does NOT have student financial or admission keys
  try {
    const teacherDoc = await adminDb.collection('users').doc(teacher.uid).get();
    const data = teacherDoc.data() || {};
    const hasStudentFields = 'advanceBalance' in data || 'previousYearDue' in data || 'scholarship' in data || 'admissionNo' in data;
    const passed = !hasStudentFields && data.role === 'teacher';
    recordTest({
      id: 'PROF-02',
      category: 'PROFILE TYPE SAFETY',
      scenario: 'Teacher user profile does not contain student financial fields',
      command: 'Inspect users/teacherUid fields',
      input: { uid: teacher.uid, role: 'teacher' },
      operation: 'Schema verification of teacher profile fields',
      expected: 'No advanceBalance, previousYearDue, scholarship, or admissionNo',
      actual: `hasStudentFields=${hasStudentFields}, role=${data.role}`,
      difference: passed ? 'None (Matched)' : 'Student fields leaked into teacher schema',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(data),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'PROF-02', category: 'PROFILE TYPE SAFETY', scenario: 'Teacher profile schema', command: 'get', input: {}, operation: 'Inspect', expected: 'Clean schema', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 3. Admin profile contains correct governance tier and identity
  try {
    const adminDoc = await adminDb.collection('users').doc(adminCtx.uid).get();
    const data = adminDoc.data() || {};
    const passed = data.role === 'admin' && data.adminTier === 'primary';
    recordTest({
      id: 'PROF-03',
      category: 'PROFILE TYPE SAFETY',
      scenario: 'Admin profile displays authentic role and primary governance tier',
      command: 'Inspect users/adminUid fields',
      input: { uid: adminCtx.uid },
      operation: 'Governance tier validation on admin document',
      expected: 'role="admin" and adminTier="primary"',
      actual: `role=${data.role}, adminTier=${data.adminTier}`,
      difference: passed ? 'None (Matched)' : 'Admin governance tier mismatch',
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: JSON.stringify(data),
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'PROF-03', category: 'PROFILE TYPE SAFETY', scenario: 'Admin tier schema', command: 'get', input: {}, operation: 'Inspect', expected: 'role=admin', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }
}
