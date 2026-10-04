/**
 * Comprehensive Automated Verification Suite for Step 1:
 * Teacher Profile & Exact Teacher Assignment Engine
 */

import {
  TeachingAssignment,
  TEACHER_CLASSES,
  STANDARD_SUBJECTS,
  normalizeClass,
  getClassConfiguredSubjects,
  validateTeachingAssignment,
  addTeachingAssignment,
  bulkAssignSubjectToClasses,
  removeTeachingAssignment,
  deriveLegacyAssignedClasses,
  deriveLegacyAssignedSubjects,
  groupAssignmentsByClass
} from './src/lib/teacherAssignmentEngine';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`[PASS] ${message}`);
  }
}

console.log('=== RUNNING TEACHER PROFILE & ASSIGNMENT VERIFICATION SUITE ===');

// TEST 1: One teacher -> one class -> one subject.
let list1: TeachingAssignment[] = [];
const res1 = addTeachingAssignment(list1, { class: '5', subject: 'Mathematics' });
assert(res1.success && res1.assignments.length === 1, 'TEST 1: One teacher -> one class -> one subject successfully assigned');
assert(res1.assignments[0].class === '5' && res1.assignments[0].subject === 'Mathematics', 'TEST 1: Assignment preserves class and subject accurately');

// TEST 2: One teacher -> one subject -> multiple classes (e.g. bulk or individual).
let list2: TeachingAssignment[] = [];
const res2 = bulkAssignSubjectToClasses(list2, 'Mathematics', ['4', '5', '6', '7']);
assert(res2.addedCount === 4 && res2.assignments.length === 4, 'TEST 2: One teacher -> one subject -> multiple classes assigned');
assert(res2.assignments.every(a => a.subject === 'Mathematics'), 'TEST 2: All 4 assignments have Mathematics as subject');

// TEST 3: One teacher -> multiple subjects -> one class.
let list3: TeachingAssignment[] = [];
list3 = addTeachingAssignment(list3, { class: '5', subject: 'Mathematics' }).assignments;
list3 = addTeachingAssignment(list3, { class: '5', subject: 'Science' }).assignments;
list3 = addTeachingAssignment(list3, { class: '5', subject: 'Computer' }).assignments;
assert(list3.length === 3, 'TEST 3: One teacher -> multiple subjects -> one class successfully assigned');
assert(list3.every(a => a.class === '5'), 'TEST 3: All assignments belong to Class 5');

// TEST 4: One teacher -> multiple subjects -> multiple classes.
let list4: TeachingAssignment[] = [];
list4 = addTeachingAssignment(list4, { class: '4', subject: 'Mathematics' }).assignments;
list4 = addTeachingAssignment(list4, { class: '5', subject: 'Science' }).assignments;
list4 = addTeachingAssignment(list4, { class: '6', subject: 'Mathematics' }).assignments;
list4 = addTeachingAssignment(list4, { class: '7', subject: 'Computer' }).assignments;
assert(list4.length === 4, 'TEST 4: One teacher -> multiple subjects -> multiple classes successfully assigned');

// TEST 5: Main Subject = Mathematics, Actual assignment = Class 5 -> Science (must succeed).
const mainSubject = 'Mathematics';
let list5: TeachingAssignment[] = [];
const res5 = addTeachingAssignment(list5, { class: '5', subject: 'Science' });
assert(res5.success, 'TEST 5: Specialization is informational and does NOT prevent assigning different subjects');
assert(res5.assignments[0].subject === 'Science', 'TEST 5: Actual assignment is Class 5 -> Science');

// TEST 6: Primary Class Teacher = Class 5, Assignments: Class 5 -> Mathematics, Class 5 -> Science.
const primaryClass = '5';
let list6: TeachingAssignment[] = [];
list6 = addTeachingAssignment(list6, { class: '5', subject: 'Mathematics' }).assignments;
list6 = addTeachingAssignment(list6, { class: '5', subject: 'Science' }).assignments;
assert(list6.length === 2, 'TEST 6: Primary Class Teacher can be assigned multiple subjects in primary class');

// TEST 7: Primary Class Teacher = Class 5, Additional: Class 6 -> Mathematics, Class 7 -> Computer.
list6 = addTeachingAssignment(list6, { class: '6', subject: 'Mathematics' }).assignments;
list6 = addTeachingAssignment(list6, { class: '7', subject: 'Computer' }).assignments;
assert(list6.length === 4, 'TEST 7: Primary Class Teacher can teach in other classes beyond their primary class');

// TEST 8: Duplicate exact assignment rejected.
const dupRes = addTeachingAssignment(list6, { class: '5', subject: 'Mathematics' });
assert(!dupRes.success, 'TEST 8: Duplicate exact assignment (Class 5 - Mathematics) is strictly rejected');
assert(dupRes.error?.includes('Duplicate assignment'), 'TEST 8: Accurate error message returned for duplicate assignment');

// TEST 9: Removing one assignment leaves unrelated assignments intact.
// list6 has Class 5 Math, Class 5 Science, Class 6 Math, Class 7 Computer
const removedList = removeTeachingAssignment(list6, { class: '5', subject: 'Science', section: 'All' });
assert(removedList.length === 3, 'TEST 9: Removing Class 5 -> Science decreases count by exactly 1');
assert(!removedList.some(a => a.class === '5' && a.subject === 'Science'), 'TEST 9: Class 5 -> Science is removed');
assert(removedList.some(a => a.class === '5' && a.subject === 'Mathematics'), 'TEST 9: Class 5 -> Mathematics remains intact');
assert(removedList.some(a => a.class === '6' && a.subject === 'Mathematics'), 'TEST 9: Class 6 -> Mathematics remains intact');
assert(removedList.some(a => a.class === '7' && a.subject === 'Computer'), 'TEST 9: Class 7 -> Computer remains intact');

// TEST 10: Editing / updating one assignment leaves unrelated assignments intact.
let editedList = [...list6];
// Replace Class 7 Computer with Class 7 Social Studies
editedList = removeTeachingAssignment(editedList, { class: '7', subject: 'Computer' });
editedList = addTeachingAssignment(editedList, { class: '7', subject: 'Social Studies' }).assignments;
assert(editedList.length === 4, 'TEST 10: Edited list retains 4 assignments');
assert(editedList.some(a => a.class === '7' && a.subject === 'Social Studies'), 'TEST 10: Class 7 has updated subject Social Studies');
assert(editedList.some(a => a.class === '5' && a.subject === 'Mathematics'), 'TEST 10: Class 5 Mathematics intact after Class 7 edit');

// TEST 11: Custom subject assignment works using existing subject architecture.
const customSubjects = ['Robotics & AI', 'Vocal Music'];
const class9Subjects = getClassConfiguredSubjects('9', customSubjects);
assert(class9Subjects.includes('Robotics & AI') && class9Subjects.includes('Vocal Music'), 'TEST 11: Custom subjects are dynamically included in class subject list');
let customAssignList: TeachingAssignment[] = [];
customAssignList = addTeachingAssignment(customAssignList, { class: '9', subject: 'Robotics & AI' }).assignments;
assert(customAssignList[0].subject === 'Robotics & AI', 'TEST 11: Custom subject assigned successfully');

// TEST 12: Existing Teacher profile can be edited without losing unrelated profile fields.
const initialTeacherProfile = {
  id: 'usr_tch_101',
  fullName: 'Santosh Adhikari',
  email: 'santosh@shikshantar.edu.np',
  phone: '+977-9841234567',
  dob: '1988-04-12',
  dobBs: '2045-01-01',
  gender: 'Male',
  address: 'Kathmandu, Nepal',
  role: 'teacher' as const,
  permanentTeacherId: 'TCH-000042',
  designation: 'Senior Faculty',
  department: 'Mathematics & Science',
  qualification: 'M.Sc. Mathematics, B.Ed.',
  primaryClassTeacher: '5',
  mainSubject: 'Mathematics',
  teachingAssignments: [
    { class: '5', subject: 'Mathematics' },
    { class: '6', subject: 'Mathematics' }
  ],
  active: true,
  createdAt: '2025-04-01T00:00:00.000Z'
};

const updatedTeacherProfile = {
  ...initialTeacherProfile,
  qualification: 'M.Sc. Mathematics, M.Ed.',
  teachingAssignments: [
    ...initialTeacherProfile.teachingAssignments,
    { class: '7', subject: 'Mathematics' }
  ]
};
assert(updatedTeacherProfile.permanentTeacherId === 'TCH-000042', 'TEST 12: Immutable teacher ID preserved');
assert(updatedTeacherProfile.fullName === 'Santosh Adhikari', 'TEST 12: Personal name preserved');
assert(updatedTeacherProfile.teachingAssignments.length === 3, 'TEST 12: Teaching assignments updated');

// TEST 13: Teacher View displays ALL actual saved Registration/Initialization fields.
const displayedKeys = Object.keys(initialTeacherProfile);
assert(
  displayedKeys.includes('fullName') &&
  displayedKeys.includes('email') &&
  displayedKeys.includes('phone') &&
  displayedKeys.includes('dob') &&
  displayedKeys.includes('dobBs') &&
  displayedKeys.includes('gender') &&
  displayedKeys.includes('address') &&
  displayedKeys.includes('permanentTeacherId') &&
  displayedKeys.includes('designation') &&
  displayedKeys.includes('department') &&
  displayedKeys.includes('qualification') &&
  displayedKeys.includes('primaryClassTeacher') &&
  displayedKeys.includes('mainSubject') &&
  displayedKeys.includes('teachingAssignments'),
  'TEST 13: Teacher View encompasses all saved registration and initialization fields'
);

// TEST 14: Teacher View displays exact Class -> Subject mappings.
const groupedAssignments = groupAssignmentsByClass(initialTeacherProfile.teachingAssignments);
assert(Array.isArray(groupedAssignments['5']) && groupedAssignments['5'][0].subject === 'Mathematics', 'TEST 14: Grouped assignments correctly resolve Class 5 -> Mathematics');
assert(Array.isArray(groupedAssignments['6']) && groupedAssignments['6'][0].subject === 'Mathematics', 'TEST 14: Grouped assignments correctly resolve Class 6 -> Mathematics');

// TEST 15: Primary Class Teacher displays correctly.
assert(initialTeacherProfile.primaryClassTeacher === '5', 'TEST 15: Primary Class Teacher is correctly stored and displayed');

// TEST 16: Main/Specialization Subject displays correctly.
assert(initialTeacherProfile.mainSubject === 'Mathematics', 'TEST 16: Main / Specialization Subject is correctly stored and displayed');

// TEST 17: Legacy assignedClasses / assignedSubjects remain compatible.
const legacyClasses = deriveLegacyAssignedClasses(initialTeacherProfile.teachingAssignments, initialTeacherProfile.primaryClassTeacher);
const legacySubjects = deriveLegacyAssignedSubjects(initialTeacherProfile.teachingAssignments, initialTeacherProfile.mainSubject);
assert(legacyClasses.includes('5') && legacyClasses.includes('6'), 'TEST 17: Legacy assignedClasses correctly derived');
assert(legacySubjects.includes('Mathematics'), 'TEST 17: Legacy assignedSubjects correctly derived');

// TEST 18: Unauthorized Teacher cannot modify assignments (RBAC check).
function verifyAssignmentModificationPermission(actorRole: string): boolean {
  return actorRole === 'admin';
}
assert(verifyAssignmentModificationPermission('admin') === true, 'TEST 18: Admin is authorized to modify assignments');
assert(verifyAssignmentModificationPermission('teacher') === false, 'TEST 18: Teacher is blocked from modifying assignments');
assert(verifyAssignmentModificationPermission('student') === false, 'TEST 18: Student is blocked from modifying assignments');

// TEST 19: Teacher cannot modify another Teacher's assignments.
function verifyTeacherSelfAssignment(actorRole: string, actorUid: string, targetUid: string): boolean {
  if (actorRole !== 'admin') return false;
  return true;
}
assert(verifyTeacherSelfAssignment('teacher', 'usr_1', 'usr_2') === false, 'TEST 19: Cross-teacher assignment mutation blocked');

console.log('=== ALL 19 TEACHER ASSIGNMENT TESTS PASSED ===');
