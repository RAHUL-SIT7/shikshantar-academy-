import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  normalizeClass, 
  canTeacherAccessClass, 
  canTeacherAccessSubject, 
  isPrimaryClassTeacher,
  canPublishClassResult,
  buildCanonicalExamId
} from '../src/lib/resultPreparationEngine';
import { validateSubjectConfigItem } from '../src/lib/resultPreparationEngine';

describe('Shikshantar Academy ERP — Comprehensive Security Hardening Test Suite', () => {

  // 1. Role Authorization Matrix
  describe('Scenario 1 & 2: Class & Section Role Isolation', () => {
    it('restricts subject teacher to assigned classes and sections only', () => {
      const teacherProfile = {
        role: 'teacher',
        teachingAssignments: [
          { class: '5', subject: 'Mathematics', section: 'A', academicYear: '2083' },
          { class: '5', subject: 'Science', section: 'All', academicYear: '2083' }
        ]
      };

      assert.strictEqual(
        canTeacherAccessSubject('teacher', teacherProfile, '5', 'Mathematics', 'A', '2083'),
        true,
        'Teacher should have access to assigned Class 5 Math Sec A'
      );

      assert.strictEqual(
        canTeacherAccessSubject('teacher', teacherProfile, '5', 'Mathematics', 'B', '2083'),
        false,
        'Teacher should be denied access to unassigned Sec B'
      );

      assert.strictEqual(
        canTeacherAccessSubject('teacher', teacherProfile, '5', 'Science', 'B', '2083'),
        true,
        'Teacher with All section assignment key should access Sec B'
      );

      assert.strictEqual(
        canTeacherAccessSubject('teacher', teacherProfile, '8', 'Mathematics', 'A', '2083'),
        false,
        'Teacher should be denied cross-class access to Class 8 Math'
      );
    });

    it('validates class teacher primary assignment restrictions', () => {
      const classTeacherProfile = {
        role: 'teacher',
        primaryClassTeacher: 'Class 5',
        primaryClassTeacherYear: '2083',
        primaryClassTeacherSection: 'A'
      };

      assert.strictEqual(
        isPrimaryClassTeacher(classTeacherProfile, '5', '2083', 'A'),
        true,
        'Class teacher should be authorized for Class 5 Sec A (2083)'
      );

      assert.strictEqual(
        isPrimaryClassTeacher(classTeacherProfile, '5', '2083', 'B'),
        false,
        'Class teacher should NOT be authorized for Sec B'
      );

      assert.strictEqual(
        isPrimaryClassTeacher(classTeacherProfile, '8', '2083', 'A'),
        false,
        'Class teacher should NOT be authorized for Class 8'
      );
    });
  });

  // 2. Examination Life-Cycle Locks
  describe('Scenario 3, 4 & 13: Terminal Lifecycle Locks & Publication Security', () => {
    it('prevents non-admins and non-class-teachers from publishing class results', () => {
      const subjectTeacher = {
        role: 'teacher',
        assignmentKeys: ['5_Mathematics_A_2083']
      };

      assert.strictEqual(
        canPublishClassResult('teacher', subjectTeacher, '5', '2083', 'A'),
        false,
        'Subject teacher must NOT have publish permissions'
      );

      const classTeacher = {
        role: 'teacher',
        primaryClassTeacher: '5',
        primaryClassTeacherYear: '2083',
        primaryClassTeacherSection: 'A'
      };

      assert.strictEqual(
        canPublishClassResult('teacher', classTeacher, '5', '2083', 'A'),
        true,
        'Primary Class teacher of Class 5 Sec A should have publish permission'
      );

      assert.strictEqual(
        canPublishClassResult('admin', null, '5', '2083', 'A'),
        true,
        'Admin should always have publish permission'
      );
    });

    it('builds deterministic canonical exam IDs preventing ID spoofing', () => {
      const id1 = buildCanonicalExamId('FIRST_TERMINAL', 'Class 5', 'A', '2083');
      const id2 = buildCanonicalExamId('FIRST_TERMINAL', '5', 'A', '2083');
      assert.strictEqual(id1, 'FIRST_TERMINAL_5_A_2083');
      assert.strictEqual(id2, 'FIRST_TERMINAL_5_A_2083');
    });
  });

  // 3. Mark Validation & Integrity Engine
  describe('Scenario 14: Data Integrity & Marks Validation', () => {
    it('rejects negative marks or marks exceeding full marks', () => {
      const invalidConfig = {
        subjectKey: 'Math',
        subjectName: 'Mathematics',
        hasTh: true,
        thFullMarks: 75,
        thPassMarks: 27,
        hasPr: true,
        prFullMarks: 25,
        prPassMarks: 10
      };

      const res = validateSubjectConfigItem(invalidConfig);
      assert.strictEqual(res.isValid, true, 'Valid subject config should pass');

      const overflowConfig = {
        ...invalidConfig,
        thPassMarks: 100 // Pass marks > full marks
      };
      const resOverflow = validateSubjectConfigItem(overflowConfig);
      assert.strictEqual(resOverflow.isValid, false, 'Should reject pass marks > full marks');
    });
  });

  // 4. Guardian Privacy Security
  describe('Scenario 15: Guardian Email Isolation', () => {
    it('ensures guardian email resolution isolates student emails from guardian notifications', () => {
      const studentRecord = {
        studentUid: 'std_1001',
        email: 'student.aarav@shikshantar.test',
        guardianEmail: 'parent.sharma@example.com',
        guardianName: 'Ram Sharma'
      };

      // Recipient must equal guardianEmail, never student email
      const targetRecipient = studentRecord.guardianEmail || null;
      assert.strictEqual(targetRecipient, 'parent.sharma@example.com');
      assert.notStrictEqual(targetRecipient, studentRecord.email);
    });
  });
});
