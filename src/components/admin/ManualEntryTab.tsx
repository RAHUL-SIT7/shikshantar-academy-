import React, { useState, useEffect } from 'react';
import { CheckCircle2, Save, Loader2, AlertCircle } from 'lucide-react';
import { StudentResult } from '../../data/resultsState';
import { doc, writeBatch, setDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { recordAuditLog } from '../../lib/auditLogger';

const CLASS_SUBJECTS: any = {
  'PG': ['English', 'Nepali', 'Math', 'Drawing', 'Rhymes'],
  'Nursery': ['English', 'Nepali', 'Math', 'Drawing', 'Rhymes'],
  'LKG': ['English', 'Nepali', 'Math', 'Drawing', 'Rhymes'],
  'UKG': ['English', 'Nepali', 'Math', 'Drawing', 'Rhymes'],
  '1': ['English', 'Nepali', 'Math', 'Science', 'Social', 'Computer', 'GK'],
  '2': ['English', 'Nepali', 'Math', 'Science', 'Social', 'Computer', 'GK'],
  '3': ['English', 'Nepali', 'Math', 'Science', 'Social', 'Computer', 'GK'],
  '4': ['English', 'Nepali', 'Math', 'Science', 'Social', 'Computer', 'GK', 'Moral Science'],
  '5': ['English', 'Nepali', 'Math', 'Science', 'Social', 'Computer', 'GK', 'Moral Science'],
  '6': ['English', 'Nepali', 'Math', 'Science', 'Social', 'Computer', 'GK', 'Moral Science', 'Opt Math'],
  '7': ['English', 'Nepali', 'Math', 'Science', 'Social', 'Computer', 'GK', 'Moral Science', 'Opt Math'],
  '8': ['English', 'Nepali', 'Math', 'Science', 'Social', 'Computer', 'GK', 'Moral Science', 'Opt Math'],
  '9': ['English', 'Nepali', 'Math', 'Science', 'Social', 'Opt Math', 'Opt II'],
  '10': ['English', 'Nepali', 'Math', 'Science', 'Social', 'Opt Math', 'Opt II']
};

export const getNepalGPA = (pct: number) => {
    if (pct >= 90) return 4.0;
    if (pct >= 80) return 3.6;
    if (pct >= 70) return 3.2;
    if (pct >= 60) return 2.8;
    if (pct >= 50) return 2.4;
    if (pct >= 40) return 2.0;
    if (pct >= 35) return 1.6;
    return 0.0;
};

export const getGrade = (marks: number | 'AB', fm: number, pm?: number) => {
  if (marks === 'AB') return 'NG';
  if (pm !== undefined && marks < pm) return 'NG';
  const pct = (marks / fm) * 100;
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C+';
  if (pct >= 40) return 'C';
  if (pct >= 30) return 'D';
  return 'NG';
};

export function ManualEntryTab({ EXAM_TYPES, allClasses, allSubjects, data, setStatus, userRole, assignedClasses, assignedSubjects, teacherProfile }: any) {
  const [examCategory, setExamCategory] = useState<'Test' | 'Terminal'>('Test');
  const [examType, setExamType] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [activeSubjects, setActiveSubjects] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [editSubjectValue, setEditSubjectValue] = useState('');
  const [newSubjectInput, setNewSubjectInput] = useState('');
  const [subjectConfigs, setSubjectConfigs] = useState<Record<string, {thFullMarks: number | string, thPassMarks: number | string, prFullMarks: number | string, prPassMarks: number | string, hasTh: boolean, hasPr: boolean}>>({});
  
  const [students, setStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [publishSuccessMessage, setPublishSuccessMessage] = useState<string | null>(null);

  const isTeacher = userRole === 'teacher';
  const teacherClass = isTeacher && teacherProfile && teacherProfile.class
    ? String(teacherProfile.class).replace(/^Class\s+/i, '')
    : '';

  const allowedClasses = isTeacher
    ? Array.from(new Set([
        ...(teacherClass ? [teacherClass] : []),
        ...(Array.isArray(assignedClasses) ? assignedClasses : [])
      ])).filter(Boolean)
    : (userRole === 'admin' ? allClasses : assignedClasses);

  useEffect(() => {
    if (isTeacher && teacherClass) {
      setSelectedClass(teacherClass);
    } else if (allowedClasses.length === 1 && !selectedClass) {
      setSelectedClass(allowedClasses[0]);
    }
  }, [isTeacher, teacherClass, allowedClasses, selectedClass]);

  useEffect(() => {
    if (selectedClass) {
      let list = CLASS_SUBJECTS[selectedClass] || allSubjects || [];
      if (userRole === 'teacher') {
        const normalizeClass = (cls: string) => {
          if (!cls) return '';
          return String(cls).replace(/^Class\s+/i, '').trim();
        };
        const isClassTeacherOfSelected = normalizeClass(selectedClass) === normalizeClass(teacherProfile?.class);

        // If not the class teacher of the selected class, restrict to assigned subjects
        if (!isClassTeacherOfSelected) {
          const assigned = Array.isArray(assignedSubjects) ? assignedSubjects : [];
          list = list.filter((subj: string) => assigned.includes(subj));
        }
      }
      setActiveSubjects(list);
      setSelectedSubjects(list); 
    } else {
      setActiveSubjects([]);
      setSelectedSubjects([]);
    }
  }, [selectedClass, allSubjects, userRole, assignedSubjects, teacherProfile]);

  useEffect(() => {
    if (!selectedClass || !examType) return;

    const loadStudents = async () => {
      setLoadingStudents(true);
      try {
          // Get all students in this class from the users collection
          const usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('class', '==', selectedClass)));
          
          let classStudents = usersSnap.docs.map(d => {
             const usr = d.data();
             let fallbackRoll = '';
             let sId = usr.studentId || usr.permanentStudentId || '';
             
             if (!usr.rollNumber && !usr.rollNo && !!sId) {
                 const match = sId.match(/^SA\d+([A-Z]*\d*)*$/i);
                 if (match) {
                     const numPart = sId.replace(/^SA/i, '');
                     let clsStr = usr.class || '';
                     if (numPart.startsWith(clsStr)) {
                         fallbackRoll = numPart.substring(clsStr.length);
                     } else if (numPart.startsWith('0' + clsStr)) {
                         fallbackRoll = numPart.substring(clsStr.length + 1);
                     } else {
                         fallbackRoll = numPart;
                     }
                 } else {
                     fallbackRoll = sId;
                 }
             }

             const permId = usr.permanentStudentId || usr.studentId || d.id;
             const emis = usr.emisNumber || usr.studentEmis || '';
             const rollSnap = usr.rollNumber || usr.rollNo || fallbackRoll || '';

             return {
                 studentUid: d.id,
                 studentId: permId,
                 permanentStudentId: permId,
                 studentEmis: emis,
                 schoolId: rollSnap || permId,
                 rollNumberSnapshot: rollSnap,
                 rollNo: rollSnap,
                 section: usr.section || 'A',
                 studentName: usr.fullName ? usr.fullName : (usr.firstName && usr.lastName ? `${usr.firstName} ${usr.lastName}` : (usr.email || 'Unknown'))
             };
          });

          // Fallback if no students in users col: try the current results to prefill
          if (classStudents.length === 0) {
              const classResults = (data as StudentResult[]).filter(r => String(r.class) === selectedClass);
              const uniqueStudentsMap = new Map<string, {studentUid: string, studentId: string, permanentStudentId?: string, studentEmis?: string, schoolId: string, rollNumberSnapshot?: string, rollNo?: string, section?: string, studentName: string}>();
              classResults.forEach(r => uniqueStudentsMap.set(r.studentUid || r.studentId, {
                studentUid: r.studentUid || r.studentId,
                studentId: r.permanentStudentId || r.studentId,
                permanentStudentId: r.permanentStudentId || r.studentId,
                studentEmis: r.studentEmis || '',
                schoolId: r.rollNo || r.rollNumberSnapshot || '',
                rollNumberSnapshot: r.rollNo || r.rollNumberSnapshot || '',
                rollNo: r.rollNo || r.rollNumberSnapshot || '',
                section: r.section || 'A',
                studentName: r.studentName
              }));
              classStudents = Array.from(uniqueStudentsMap.values());
          }
          
          const classResults = (data as StudentResult[]).filter(r => String(r.class) === selectedClass);
          const subjectsToLoad = activeSubjects.length > 0 ? activeSubjects : (CLASS_SUBJECTS[selectedClass] || allSubjects || []);

          // Load configs from database if existing records exist
          const loadedConfigs: Record<string, any> = {};
          const examRec = classResults.find(r => r.examType === examType);
          if (examRec && examRec.subjects) {
              Object.entries(examRec.subjects).forEach(([subj, sData]: [string, any]) => {
                  loadedConfigs[subj] = {
                      thFullMarks: sData.thFull !== undefined ? sData.thFull : (sData.thFullMarks !== undefined ? sData.thFullMarks : 75),
                      thPassMarks: sData.thPass !== undefined ? sData.thPass : (sData.thPassMarks !== undefined ? sData.thPassMarks : 30),
                      prFullMarks: sData.prFull !== undefined ? sData.prFull : (sData.prFullMarks !== undefined ? sData.prFullMarks : 25),
                      prPassMarks: sData.prPass !== undefined ? sData.prPass : (sData.prPassMarks !== undefined ? sData.prPassMarks : 10),
                      hasTh: sData.thFull !== 0,
                      hasPr: sData.prFull !== 0,
                  };
              });
          }
          
          subjectsToLoad.forEach((subj: string) => {
              if (!loadedConfigs[subj]) {
                  loadedConfigs[subj] = {
                      thFullMarks: 75,
                      thPassMarks: 30,
                      prFullMarks: 25,
                      prPassMarks: 10,
                      hasTh: true,
                      hasPr: true
                  };
              }
          });
          setSubjectConfigs(loadedConfigs);

          const mapped = classStudents.map(s => {
              const existingRec = classResults.find(r => r.studentId === s.studentId && r.examType === examType);
              
              const subjectMarksTH: Record<string, string> = {};
              const subjectMarksPR: Record<string, string> = {};
              const subjectAbsentsTH: Record<string, boolean> = {};
              const subjectAbsentsPR: Record<string, boolean> = {};

              subjectsToLoad.forEach((subj: string) => {
                  const sData = existingRec?.subjects?.[subj];
                  const thM = sData?.thMarks;
                  const prM = sData?.prMarks;
                  
                  if (thM !== undefined) {
                     if (thM === 'AB') { subjectAbsentsTH[subj] = true; subjectMarksTH[subj] = ''; } 
                     else { subjectMarksTH[subj] = String(thM); subjectAbsentsTH[subj] = false; }
                  } else {
                     subjectMarksTH[subj] = ''; subjectAbsentsTH[subj] = false;
                  }

                  if (prM !== undefined) {
                     if (prM === 'AB') { subjectAbsentsPR[subj] = true; subjectMarksPR[subj] = ''; } 
                     else { subjectMarksPR[subj] = String(prM); subjectAbsentsPR[subj] = false; }
                  } else {
                     subjectMarksPR[subj] = ''; subjectAbsentsPR[subj] = false;
                  }
              });

              return {
                  ...s,
                  Class: selectedClass,
                  tempMarkTH: '',
                  tempMarkPR: '',
                  isAbsentTH: false,
                  isAbsentPR: false,
                  subjectMarksTH,
                  subjectMarksPR,
                  subjectAbsentsTH,
                  subjectAbsentsPR,
              };
          });

          setStudents(mapped);
      } catch (err) {
          console.error("Error loading students config:", err);
      } finally {
          setLoadingStudents(false);
      }
    };

    loadStudents();
  }, [selectedClass, examType, data, activeSubjects]);

  const handleRenameSubject = (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) return;
    if (activeSubjects.includes(newName)) {
      setStatus({ type: 'error', message: 'Subject directory already has a subject with this name!' });
      return;
    }

    setActiveSubjects(prev => prev.map(s => s === oldName ? newName : s));
    setSelectedSubjects(prev => prev.map(s => s === oldName ? newName : s));
    setSubjectConfigs(prev => {
      const updated = { ...prev };
      if (updated[oldName]) {
        updated[newName] = updated[oldName];
        delete updated[oldName];
      }
      return updated;
    });
    setStudents(prev => prev.map(std => {
      const nextStd = { ...std };
      if (nextStd.subjectMarksTH && oldName in nextStd.subjectMarksTH) {
        nextStd.subjectMarksTH[newName] = nextStd.subjectMarksTH[oldName];
        delete nextStd.subjectMarksTH[oldName];
      }
      if (nextStd.subjectMarksPR && oldName in nextStd.subjectMarksPR) {
        nextStd.subjectMarksPR[newName] = nextStd.subjectMarksPR[oldName];
        delete nextStd.subjectMarksPR[oldName];
      }
      if (nextStd.subjectAbsentsTH && oldName in nextStd.subjectAbsentsTH) {
        nextStd.subjectAbsentsTH[newName] = nextStd.subjectAbsentsTH[oldName];
        delete nextStd.subjectAbsentsTH[oldName];
      }
      if (nextStd.subjectAbsentsPR && oldName in nextStd.subjectAbsentsPR) {
        nextStd.subjectAbsentsPR[newName] = nextStd.subjectAbsentsPR[oldName];
        delete nextStd.subjectAbsentsPR[oldName];
      }
      return nextStd;
    }));
  };

  const handleAddSubject = () => {
    const name = newSubjectInput.trim();
    if (!name) return;
    if (activeSubjects.includes(name)) {
      setStatus({ type: 'error', message: 'Subject already exists!' });
      return;
    }
    setActiveSubjects(prev => [...prev, name]);
    setSelectedSubjects(prev => [...prev, name]);
    setSubjectConfigs(prev => ({
      ...prev,
      [name]: { thFullMarks: 75, thPassMarks: 30, prFullMarks: 25, prPassMarks: 10, hasTh: true, hasPr: true }
    }));
    setStudents(prev => prev.map(std => ({
      ...std,
      subjectMarksTH: { ...std.subjectMarksTH, [name]: '' },
      subjectMarksPR: { ...std.subjectMarksPR, [name]: '' },
      subjectAbsentsTH: { ...std.subjectAbsentsTH, [name]: false },
      subjectAbsentsPR: { ...std.subjectAbsentsPR, [name]: false },
    })));
    setNewSubjectInput('');
  };

  const handleDeleteSubject = (name: string) => {
    setActiveSubjects(prev => prev.filter(s => s !== name));
    setSelectedSubjects(prev => prev.filter(s => s !== name));
  };

  const handleConfigChange = (subj: string, field: 'thFullMarks' | 'prFullMarks', val: string) => {
      let cleaned = val.replace(/[^0-9.]/g, '');
      setSubjectConfigs(prev => {
          const prevConf = prev[subj] || { thFullMarks: 75, thPassMarks: 30, prFullMarks: 25, prPassMarks: 10, hasTh: true, hasPr: true };
          const newConf = { ...prevConf, [field]: cleaned };
          
          let numVal = Number(cleaned);
          if (!isNaN(numVal) && cleaned !== '') {
              if (field === 'thFullMarks') {
                  newConf.thPassMarks = Math.round(numVal * 0.4);
              }
              if (field === 'prFullMarks') {
                  newConf.prPassMarks = Math.round(numVal * 0.4);
              }
          } else {
              if (field === 'thFullMarks') {
                  newConf.thPassMarks = '';
              }
              if (field === 'prFullMarks') {
                  newConf.prPassMarks = '';
              }
          }
          return { ...prev, [subj]: newConf };
      });
  };

  const handleMarkChange = (idx: number, rawVal: string, type: 'TH'|'PR', subj?: string) => {
      let val = rawVal.replace(/[^0-9.]/g, '');
      val = val.replace(/^0+(?=\d)/, '');
      
      const v = Number(val);
      const subjConfig = subjectConfigs[subj || selectedSubjects[0] || ''] || { thFullMarks: 75, thPassMarks: 30, prFullMarks: 25, prPassMarks: 10, hasTh: true, hasPr: true };
      
      const maxMarks = type === 'TH' ? (subjConfig.thFullMarks === '' ? Infinity : subjConfig.thFullMarks) : (subjConfig.prFullMarks === '' ? Infinity : subjConfig.prFullMarks);
      
      if (val !== '' && (v > maxMarks || v < 0)) return; // prevent invalid
      const newS = [...students];
      if (subj) {
          if(type === 'TH') newS[idx].subjectMarksTH[subj] = val;
          else newS[idx].subjectMarksPR[subj] = val;
      } else {
          if(type === 'TH') newS[idx].tempMarkTH = val;
          else newS[idx].tempMarkPR = val;
      }
      setStudents(newS);
  };

  const handleAbsentChange = (idx: number, type: 'TH'|'PR', checked: boolean, subj?: string) => {
      const newS = [...students];
      if (subj) {
          if(type === 'TH') {
              newS[idx].subjectAbsentsTH[subj] = checked;
              if (checked) newS[idx].subjectMarksTH[subj] = '';
          } else {
              newS[idx].subjectAbsentsPR[subj] = checked;
              if (checked) newS[idx].subjectMarksPR[subj] = '';
          }
      } else {
          if(type === 'TH') {
              newS[idx].isAbsentTH = checked;
              if (checked) newS[idx].tempMarkTH = '';
          } else {
              newS[idx].isAbsentPR = checked;
              if (checked) newS[idx].tempMarkPR = '';
          }
      }
      setStudents(newS);
  };

  const handleStudentChange = (idx: number, field: string, val: string) => {
      const newS = [...students];
      newS[idx][field] = val;
      setStudents(newS);
  };

  const addStudentRow = () => {
      const newId = 'TEMP' + Date.now().toString().slice(-5);
      setStudents([...students, {
          studentId: newId,
          schoolId: '',
          studentName: 'New Student',
          Class: selectedClass,
          tempMarkTH: '',
          tempMarkPR: '',
          isAbsentTH: false,
          isAbsentPR: false,
          subjectMarksTH: {},
          subjectMarksPR: {},
          subjectAbsentsTH: {},
          subjectAbsentsPR: {}
      }]);
  };

  const markAllPresent = () => {
      const newS = students.map(s => ({
          ...s,
          isAbsentTH: false,
          isAbsentPR: false,
          subjectAbsentsTH: {},
          subjectAbsentsPR: {}
      }));
      setStudents(newS);
  };

  const saveMarks = async () => {
      try {
          const examId = `${examType.replace(/\s+/g, '_')}_${selectedClass}`;

          setStatus({type: 'info', message: 'Saving marks to Firebase...'});

          try {
              await setDoc(doc(db, "exams", examId), {
                  name: examType,
                  type: examType,
                  class: selectedClass,
                  academicYear: new Date().getFullYear().toString(),
                  published: false
              }, { merge: true });
          } catch (e: any) {
              console.error("Error creating exam document:", e);
              throw new Error("Failed to create Exam document: " + e.message);
          }

          let batch = writeBatch(db);
          let opCount = 0;

          for (const std of students) {
              let finalMarksParams: Record<string, {th: number | 'AB', pr: number | 'AB'}> = {};

              selectedSubjects.forEach((subj: string) => {
                  const thMark = std.subjectAbsentsTH?.[subj] ? 'AB' : (std.subjectMarksTH?.[subj] === '' || std.subjectMarksTH?.[subj] === undefined ? null : Number(std.subjectMarksTH[subj]));
                  const prMark = std.subjectAbsentsPR?.[subj] ? 'AB' : (std.subjectMarksPR?.[subj] === '' || std.subjectMarksPR?.[subj] === undefined ? null : Number(std.subjectMarksPR[subj]));
                  if (thMark !== null || prMark !== null) {
                      finalMarksParams[subj] = { th: thMark !== null ? thMark : 0, pr: prMark !== null ? prMark : 0 };
                  }
              });

              if (Object.keys(finalMarksParams).length === 0) continue; // Skip empty

              const primaryUid = std.studentUid || std.studentId;
              const permId = std.permanentStudentId || std.studentId;
              const emisVal = std.studentEmis || '';
              const rollSnapshot = std.rollNo || std.rollNumberSnapshot || std.schoolId || '';
              const sectionVal = std.section || 'A';
              const acadYear = std.academicYear || new Date().getFullYear().toString();

              const existingIdx = (data as StudentResult[]).findIndex(r => 
                (r.studentUid && r.studentUid === primaryUid && r.examType === examType) ||
                (r.studentId === permId && r.examType === examType) ||
                (r.studentId === primaryUid && r.examType === examType)
              );
              
              if (existingIdx >= 0) {
                  const rec = { ...data[existingIdx] };
                  let updatedSubjects = { ...rec.subjects };
                  
                  Object.entries(finalMarksParams).forEach(([subj, val]) => {
                      const subjConfig = subjectConfigs[subj] || { thFullMarks: 75, thPassMarks: 30, prFullMarks: 25, prPassMarks: 10, hasTh: true, hasPr: true };
                      const sumObtained = (val.th === 'AB' ? 0 : val.th) + (val.pr === 'AB' ? 0 : val.pr);
                      const isCompleteAB = val.th === 'AB' && val.pr === 'AB';
                      const obtainedTotal = isCompleteAB ? 'AB' : sumObtained;
                      
                      const tFM = subjConfig.hasTh ? Number(subjConfig.thFullMarks || 0) : 0;
                      const pFM = subjConfig.hasPr ? Number(subjConfig.prFullMarks || 0) : 0;
                      
                      const updateData = { 
                          fullMarks: tFM + pFM,
                          obtained: obtainedTotal,
                          thMarks: val.th, prMarks: val.pr,
                          thFull: tFM, prFull: pFM, 
                          thPass: Number(subjConfig.thPassMarks || 0), prPass: Number(subjConfig.prPassMarks || 0)
                      };
                      
                      updatedSubjects[subj] = updateData;
                      const subjectDocId = `${examId}_${primaryUid}_${subj.replace(/\s+/g, '')}`;
                      batch.set(doc(db, 'results', subjectDocId), {
                          studentUid: primaryUid,
                          studentId: permId,
                          permanentStudentId: permId,
                          studentEmis: emisVal,
                          examId: examId,
                          subject: subj,
                          marks: obtainedTotal,
                          fullMarks: tFM + pFM,
                          thMarks: val.th, prMarks: val.pr,
                          thFull: tFM, prFull: pFM,
                          class: String(rec.class || selectedClass),
                          section: sectionVal,
                          academicYear: acadYear,
                          rollNo: rollSnapshot,
                          rollNumberSnapshot: rollSnapshot
                      });
                      batch.set(doc(db, 'results_secure', primaryUid, 'records', subjectDocId), {
                          studentUid: primaryUid,
                          studentId: permId,
                          permanentStudentId: permId,
                          studentEmis: emisVal,
                          examId: examId,
                          subject: subj,
                          marks: obtainedTotal,
                          fullMarks: tFM + pFM,
                          thMarks: val.th, prMarks: val.pr,
                          thFull: tFM, prFull: pFM,
                          class: String(rec.class || selectedClass),
                          section: sectionVal,
                          academicYear: acadYear,
                          rollNo: rollSnapshot,
                          rollNumberSnapshot: rollSnapshot
                      });
                      opCount++;
                  });
                  rec.subjects = updatedSubjects;
                  
                  // Recalculate totals
                  let t = 0; let ft = 0;
                  Object.values(rec.subjects).forEach((s: any) => {
                      if (s.obtained !== 'AB') t += s.obtained;
                      ft += s.fullMarks;
                  });
                  rec.total = t;
                  rec.fullTotal = ft;
                  rec.percentage = ft > 0 ? (t / ft) * 100 : 0;
                  rec.grade = getGrade(t, ft); // Note: Simple sum grade
                  rec.gpa = getNepalGPA(rec.percentage);
                  rec.studentName = std.studentName || rec.studentName;
                  rec.rollNo = rollSnapshot || '00';
                  rec.rollNumberSnapshot = rollSnapshot || '00';
                  rec.studentUid = primaryUid;
                  rec.studentId = permId;
                  rec.permanentStudentId = permId;
                  rec.studentEmis = emisVal;

                  const summaryDocId = `${examId}_${primaryUid}`;
                  batch.set(doc(db, 'resultSummary', summaryDocId), {
                      studentUid: primaryUid,
                      studentId: permId,
                      permanentStudentId: permId,
                      studentEmis: emisVal,
                      studentName: rec.studentName,
                      rollNo: rollSnapshot || '00',
                      rollNumberSnapshot: rollSnapshot || '00',
                      class: String(rec.class),
                      section: sectionVal,
                      academicYear: acadYear,
                      examId: examId,
                      examType: examType,
                      total: rec.total,
                      fullTotal: rec.fullTotal,
                      percentage: rec.percentage,
                      grade: rec.grade,
                      rank: rec.rank || 0,
                      gpa: rec.gpa
                  });
                  opCount++;

              } else {
                  // Creating a new result for this student + exam
                  
                  let newSubjects: any = {};
                  Object.entries(finalMarksParams).forEach(([subj, val]) => {
                      const subjConfig = subjectConfigs[subj] || { thFullMarks: 75, thPassMarks: 30, prFullMarks: 25, prPassMarks: 10, hasTh: true, hasPr: true };
                      const sumObtained = (val.th === 'AB' ? 0 : val.th) + (val.pr === 'AB' ? 0 : val.pr);
                      const isCompleteAB = val.th === 'AB' && val.pr === 'AB';
                      const obtainedTotal = isCompleteAB ? 'AB' : sumObtained;
                      
                      const tFM = subjConfig.hasTh ? Number(subjConfig.thFullMarks || 0) : 0;
                      const pFM = subjConfig.hasPr ? Number(subjConfig.prFullMarks || 0) : 0;
                      
                      newSubjects[subj] = { 
                          fullMarks: tFM + pFM,
                          obtained: obtainedTotal,
                          thMarks: val.th, prMarks: val.pr,
                          thFull: tFM, prFull: pFM, 
                          thPass: Number(subjConfig.thPassMarks || 0), prPass: Number(subjConfig.prPassMarks || 0)
                      };
                      const subjectDocId = `${examId}_${primaryUid}_${subj.replace(/\s+/g, '')}`;
                      batch.set(doc(db, 'results', subjectDocId), {
                          studentUid: primaryUid,
                          studentId: permId,
                          permanentStudentId: permId,
                          studentEmis: emisVal,
                          examId: examId,
                          subject: subj,
                          marks: obtainedTotal,
                          fullMarks: tFM + pFM,
                          thMarks: val.th, prMarks: val.pr,
                          thFull: tFM, prFull: pFM,
                          class: String(std.Class || selectedClass),
                          section: sectionVal,
                          academicYear: acadYear,
                          rollNo: rollSnapshot,
                          rollNumberSnapshot: rollSnapshot
                      });
                      batch.set(doc(db, 'results_secure', primaryUid, 'records', subjectDocId), {
                          studentUid: primaryUid,
                          studentId: permId,
                          permanentStudentId: permId,
                          studentEmis: emisVal,
                          examId: examId,
                          subject: subj,
                          marks: obtainedTotal,
                          fullMarks: tFM + pFM,
                          thMarks: val.th, prMarks: val.pr,
                          thFull: tFM, prFull: pFM,
                          class: String(std.Class || selectedClass),
                          section: sectionVal,
                          academicYear: acadYear,
                          rollNo: rollSnapshot,
                          rollNumberSnapshot: rollSnapshot
                      });
                      opCount++;
                  });

                  // Calculate totals for new
                  let t = 0; let ft = 0;
                  Object.values(newSubjects).forEach((s: any) => {
                      if (s.obtained !== 'AB') t += s.obtained;
                      ft += s.fullMarks;
                  });

                  const newRec: StudentResult = {
                      studentUid: primaryUid,
                      studentId: permId,
                      permanentStudentId: permId,
                      studentEmis: emisVal,
                      studentName: std.studentName,
                      class: std.Class || selectedClass,
                      section: sectionVal,
                      academicYear: acadYear,
                      rollNo: rollSnapshot || '00',
                      rollNumberSnapshot: rollSnapshot || '00',
                      examType: examType,
                      subjects: newSubjects,
                      total: t,
                      fullTotal: ft,
                      percentage: ft > 0 ? (t / ft) * 100 : 0,
                      grade: getGrade(t, ft),
                      gpa: getNepalGPA(ft > 0 ? (t / ft) * 100 : 0),
                      rank: 0,
                      published: false,
                      classTeacherRemark: '' // added
                  };
                  
                  const summaryDocId = `${examId}_${primaryUid}`;
                  batch.set(doc(db, 'resultSummary', summaryDocId), {
                      studentUid: primaryUid,
                      studentId: permId,
                      permanentStudentId: permId,
                      studentEmis: emisVal,
                      studentName: newRec.studentName,
                      rollNo: newRec.rollNo,
                      rollNumberSnapshot: newRec.rollNumberSnapshot,
                      class: String(newRec.class),
                      section: sectionVal,
                      academicYear: acadYear,
                      examId: examId,
                      examType: examType,
                      total: newRec.total,
                      fullTotal: newRec.fullTotal,
                      percentage: newRec.percentage,
                      grade: newRec.grade,
                      rank: newRec.rank,
                      gpa: newRec.gpa
                  });
                  opCount++;
              }

              if (opCount > 400) {
                  try {
                      await batch.commit();
                  } catch (e: any) {
                      throw new Error("Batch commit failed (>400): " + e.message);
                  }
                  batch = writeBatch(db);
                  opCount = 0;
              }
          }
          if (opCount > 0) {
              try {
                  await batch.commit();
              } catch (e: any) {
                  throw new Error("Final batch commit failed: " + e.message);
              }
          }

          // Record audit log for mark entry
          try {
              await recordAuditLog({
                  category: 'academic',
                  actionType: 'MARK_ENTRY',
                  targetType: 'class_exam_results',
                  targetId: examId,
                  studentClass: String(selectedClass),
                  academicYear: new Date().getFullYear().toString(),
                  reason: `Saved marks for Class ${selectedClass} - ${examType} (${students.length} students)`,
                  previousValue: 'Draft/Unsaved state',
                  newValue: `Marks saved for ${students.length} students in Class ${selectedClass}`,
                  result: 'SUCCESS'
              });
          } catch (auditErr) {
              console.warn('Audit logging failed for manual mark entry:', auditErr);
          }

          setStatus({type: 'success', message: `Class ${selectedClass} - ${examType} marks saved successfully!` });
          setPublishSuccessMessage(null);
      } catch (err: any) {
          console.error("Manual save error", err);
          setStatus({type: 'error', message: 'Failed to save marks: ' + err.message});
      }
  };

  const publishResults = async () => {
    if (!selectedClass || !examType) return;
    setStatus({type: 'info', message: 'Calculating ranks and publishing results...'});
    try {
        const examId = `${examType.replace(/\s+/g, '_')}_${selectedClass}`;
        const summaryDocs = await getDocs(query(collection(db, 'resultSummary'), where('examId', '==', examId)));
        
        let allStudents = summaryDocs.docs.map(d => ({ id: d.id, ...d.data() } as any));
        allStudents.sort((a, b) => b.total - a.total);
        
        let batch = writeBatch(db);
        let opCount = 0;
        let currentRank = 1;
        let prevTotal = -1;
        let sameRankCount = 0;
        
        allStudents.forEach((std, idx) => {
             if (std.total === prevTotal) {
                 std.rank = currentRank;
                 sameRankCount++;
             } else {
                 currentRank += sameRankCount;
                 if (idx === 0) currentRank = 1;
                 std.rank = currentRank;
                 sameRankCount = 1;
                 prevTotal = std.total;
             }
             
             batch.update(doc(db, 'resultSummary', std.id), {
                 rank: std.rank,
                 published: true
             });
             opCount++;
             
             // Keep batch limits safe
        });
        
        batch.update(doc(db, 'exams', examId), { published: true });
        
        await batch.commit();

        try {
            await recordAuditLog({
                category: 'academic',
                actionType: 'EXAM_PUBLISHED',
                targetType: 'class_exam_results',
                targetId: examId,
                studentClass: String(selectedClass),
                academicYear: new Date().getFullYear().toString(),
                reason: `Calculated ranks and published results for Class ${selectedClass} - ${examType}`,
                previousValue: 'Draft/Unpublished',
                newValue: `Published results for ${allStudents.length} students`,
                result: 'SUCCESS'
            });
        } catch (auditErr) {
            console.warn('Audit logging failed for exam publication:', auditErr);
        }

        setStatus({type: 'success', message: `Results and Ranks Published successfully for Class ${selectedClass}.`});
        setPublishSuccessMessage(`Marks have been successfully published and ranks calculated for Class ${selectedClass}!`);
    } catch(err: any) {
        setStatus({type: 'error', message: 'Publish failed: ' + err.message});
    }
  };

  const isDataComplete = () => {
      if (students.length === 0) return false;
      if (selectedSubjects.length === 0) return false;
      for (const std of students) {
          if (!std.studentId?.trim() || !std.studentName?.trim()) return false;
          for (const subj of selectedSubjects) {
              const cnf = subjectConfigs[subj] || { hasTh: true, hasPr: true };
              if (cnf.hasTh && !std.subjectAbsentsTH?.[subj] && (std.subjectMarksTH?.[subj] === '' || std.subjectMarksTH?.[subj] === undefined)) return false;
              if (cnf.hasPr && !std.subjectAbsentsPR?.[subj] && (std.subjectMarksPR?.[subj] === '' || std.subjectMarksPR?.[subj] === undefined)) return false;
          }
      }
      return true;
  };

  const isAnyDataEntered = () => {
      if (students.length === 0) return false;
      if (selectedSubjects.length === 0) return false;
      for (const std of students) {
          for (const subj of selectedSubjects) {
              const cnf = subjectConfigs[subj] || { hasTh: true, hasPr: true };
              if (cnf.hasTh && (std.subjectAbsentsTH?.[subj] || (std.subjectMarksTH?.[subj] !== '' && std.subjectMarksTH?.[subj] !== undefined))) return true;
              if (cnf.hasPr && (std.subjectAbsentsPR?.[subj] || (std.subjectMarksPR?.[subj] !== '' && std.subjectMarksPR?.[subj] !== undefined))) return true;
          }
      }
      return false;
  };

  return (
    <div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="flex flex-col justify-end">
               <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Type</label>
               <div className="flex gap-4 items-center h-[42px] overflow-hidden">
                   <label className="flex items-center gap-2 cursor-pointer shrink-0">
                       <input type="radio" value="Terminal" checked={examCategory === 'Terminal'} onChange={() => { setExamCategory('Terminal'); setExamType(''); }} className="w-4 h-4 text-primary focus:ring-primary outline-none" />
                       <span className="text-sm font-bold">Terminal</span>
                   </label>
                   <label className="flex items-center gap-2 cursor-pointer shrink-0">
                       <input type="radio" value="Test" checked={examCategory === 'Test'} onChange={() => { setExamCategory('Test'); setExamType(''); }} className="w-4 h-4 text-primary focus:ring-primary outline-none" />
                       <span className="text-sm font-bold">Test</span>
                   </label>
               </div>
            </div>
            <div>
               <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Exam Name</label>
               {examCategory === 'Terminal' ? (
                 <select 
                   value={examType} 
                   onChange={e=>setExamType(e.target.value)} 
                   className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-primary outline-none font-medium h-[42px]"
                 >
                     <option value="">-- Select Terminal --</option>
                     {EXAM_TYPES.map((ex:string) => <option key={ex} value={ex}>{ex}</option>)}
                 </select>
               ) : (
                 <input 
                   type="text" 
                   value={examType} 
                   onChange={e=>setExamType(e.target.value)} 
                   className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-primary outline-none font-medium h-[42px]"
                   placeholder="e.g. Unit Test 1"
                 />
               )}
            </div>
            <div>
               <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Class</label>
               {isTeacher && teacherClass ? (
                 <div className="w-full px-3 py-2 border rounded-lg bg-[#f0fdf4] border-emerald-200 text-emerald-800 font-extrabold h-[42px] flex items-center justify-between">
                    <span>Class {teacherClass}</span>
                    <span className="text-[10px] md:text-sm text-emerald-700 font-black bg-emerald-100 px-2 py-0.5 md:py-1 rounded">
                      Class Teacher: {teacherProfile?.fullName || teacherProfile?.name || "Teacher"}
                    </span>
                 </div>
               ) : (
                 <select value={selectedClass} onChange={e=>setSelectedClass(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-primary outline-none font-medium">
                     <option value="">-- Select Class --</option>
                     {allowedClasses.map((c: string) => (
                        <option key={c} value={c}>
                          Class {c} {String(c).replace(/^Class\s+/i, '').trim() === String(teacherClass).trim() ? '(My Class)' : ''}
                        </option>
                      ))}
                 </select>
               )}
            </div>
        </div>

        {!(selectedClass && examType) ? (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-10 text-center flex flex-col items-center justify-center mb-6">
                <div className="w-16 h-16 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-black text-gray-800 mb-2">Ready to Enter Marks?</h3>
                <p className="text-sm font-medium text-gray-500 max-w-md">
                    Please select the <span className="text-gray-800 font-bold">Exam Name</span> and <span className="text-gray-800 font-bold">Class</span> from the options above to generate the result entry sheet.
                </p>
            </div>
        ) : (
            <>
                {/* Custom Subjects Config panel */}
                {(userRole === 'admin' || userRole === 'teacher') && (
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 mb-4">
                            <div>
                                <h3 className="text-lg font-black text-gray-800">Customize Subjects & Marks Config</h3>
                                <p className="text-xs text-gray-500 font-medium mt-0.5">
                                    Add, rename, or toggle subjects to include/exclude for the results. (Active subjects edit titles inline)
                                </p>
                            </div>
                            
                            <div className="flex items-center gap-2 max-w-sm w-full">
                                <input 
                                    type="text"
                                    value={newSubjectInput}
                                    onChange={e => setNewSubjectInput(e.target.value)}
                                    placeholder="Add school subject..."
                                    className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-primary font-bold h-[38px]"
                                    onKeyDown={e => { if (e.key === 'Enter') handleAddSubject(); }}
                                />
                                <button 
                                    onClick={handleAddSubject}
                                    className="bg-primary text-white text-xs px-4 py-2 font-black uppercase rounded-lg shadow hover:bg-opacity-90 active:scale-95 transition-all shrink-0 h-[38px]"
                                >
                                    Add
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {activeSubjects.map((subj) => {
                                const isSelected = selectedSubjects.includes(subj);
                                const isEditing = editingSubject === subj;
                                const cnf = subjectConfigs[subj] || { thFullMarks: 75, thPassMarks: 30, prFullMarks: 25, prPassMarks: 10, hasTh: true, hasPr: true };

                                return (
                                    <div key={subj} className={`p-3 border-2 rounded-xl transition-all ${isSelected ? 'border-primary/20 bg-primary/5' : 'border-gray-100 bg-gray-50/50 opacity-60'}`}>
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <input 
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={e => {
                                                        if (e.target.checked) {
                                                            setSelectedSubjects(prev => [...prev, subj]);
                                                        } else {
                                                            setSelectedSubjects(prev => prev.filter(s => s !== subj));
                                                        }
                                                    }}
                                                    className="w-4 h-4 text-primary focus:ring-primary accent-primary rounded cursor-pointer shrink-0"
                                                />
                                                
                                                {isEditing ? (
                                                    <input 
                                                        type="text"
                                                        value={editSubjectValue}
                                                        onChange={e => setEditSubjectValue(e.target.value)}
                                                        className="px-2 py-0.5 border border-primary rounded text-xs font-bold w-full outline-none"
                                                        autoFocus
                                                        onBlur={() => {
                                                            handleRenameSubject(subj, editSubjectValue);
                                                            setEditingSubject(null);
                                                        }}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') {
                                                                handleRenameSubject(subj, editSubjectValue);
                                                                setEditingSubject(null);
                                                            } else if (e.key === 'Escape') {
                                                                setEditingSubject(null);
                                                            }
                                                        }}
                                                    />
                                                ) : (
                                                    <span 
                                                        className="font-bold text-gray-800 text-sm truncate cursor-pointer hover:text-primary transition-colors flex-1"
                                                        onClick={() => {
                                                            setEditingSubject(subj);
                                                            setEditSubjectValue(subj);
                                                        }}
                                                        title="Click to edit"
                                                    >
                                                        {subj}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                                <button 
                                                    onClick={() => {
                                                        if (isEditing) {
                                                            handleRenameSubject(subj, editSubjectValue);
                                                            setEditingSubject(null);
                                                        } else {
                                                            setEditingSubject(subj);
                                                            setEditSubjectValue(subj);
                                                        }
                                                    }}
                                                    className="text-gray-400 hover:text-primary p-0.5 rounded hover:bg-gray-100"
                                                >
                                                    ✏️
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteSubject(subj)}
                                                    className="text-gray-400 hover:text-red-500 p-0.5 rounded hover:bg-gray-100"
                                                >
                                                    ❌
                                                </button>
                                            </div>
                                        </div>

                                        {isSelected && (
                                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                                                <div>
                                                    <label className="block text-[9px] font-bold text-gray-400 uppercase">TH Full</label>
                                                    <div className="flex items-center gap-1 mt-0.5">
                                                        <input 
                                                            type="checkbox"
                                                            checked={cnf.hasTh}
                                                            onChange={e => {
                                                                setSubjectConfigs(prev => ({
                                                                    ...prev,
                                                                    [subj]: { ...(prev[subj] || cnf), hasTh: e.target.checked }
                                                                }));
                                                            }}
                                                            className="w-3.5 h-3.5 accent-primary shrink-0"
                                                        />
                                                        <input 
                                                            type="text"
                                                            inputMode="decimal"
                                                            value={cnf.thFullMarks ?? ''} 
                                                            disabled={!cnf.hasTh}
                                                            onChange={e => handleConfigChange(subj, 'thFullMarks', e.target.value)}
                                                            className="w-full px-1.5 py-0.5 border text-xs font-bold rounded outline-none focus:border-primary disabled:bg-gray-100"
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] font-bold text-gray-400 uppercase">PR Full</label>
                                                    <div className="flex items-center gap-1 mt-0.5">
                                                        <input 
                                                            type="checkbox"
                                                            checked={cnf.hasPr}
                                                            onChange={e => {
                                                                setSubjectConfigs(prev => ({
                                                                    ...prev,
                                                                    [subj]: { ...(prev[subj] || cnf), hasPr: e.target.checked }
                                                                }));
                                                            }}
                                                            className="w-3.5 h-3.5 accent-primary shrink-0"
                                                        />
                                                        <input 
                                                            type="text"
                                                            inputMode="decimal"
                                                            value={cnf.prFullMarks ?? ''} 
                                                            disabled={!cnf.hasPr}
                                                            onChange={e => handleConfigChange(subj, 'prFullMarks', e.target.value)}
                                                            className="w-full px-1.5 py-0.5 border text-xs font-bold rounded outline-none focus:border-primary disabled:bg-gray-100"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {activeSubjects.length === 0 && (
                                <div className="col-span-full py-4 text-center text-gray-400 font-bold text-sm">
                                    No subjects configurations found.
                                </div>
                            )}
                        </div>
                    </div>
                )}

        {students.length > 0 ? (
            <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-100/80 text-gray-700">
                            <tr>
                                <th className="p-3 font-bold uppercase tracking-wider w-24">Roll/ID</th>
                                <th className="p-3 font-bold uppercase tracking-wider">Student Name</th>
                                {selectedSubjects.map((subj: string) => {
                                    const cnf = subjectConfigs[subj] || { hasTh: true, hasPr: true };
                                    return (
                                        <th key={subj} className="p-3 font-bold uppercase tracking-wider text-center border-l border-gray-200">
                                            <span className="block mb-1 text-primary">{subj}</span>
                                            <div className="flex justify-center gap-2 text-[10px] text-gray-500">
                                                {cnf.hasTh && <span>TH</span>}
                                                {cnf.hasPr && <span>PR</span>}
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {students.map((std, i) => (
                                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="p-3">
                                        <input type="text" value={std.schoolId || ''} onChange={e => handleStudentChange(i, 'schoolId', e.target.value)} className="w-full min-w-[80px] px-2 py-1.5 border rounded-md font-medium text-gray-600 focus:ring-1 focus:ring-primary outline-none" placeholder="Roll/ID" />
                                    </td>
                                    <td className="p-3">
                                        <input type="text" value={std.studentName || ''} onChange={e => handleStudentChange(i, 'studentName', e.target.value)} className="w-full min-w-[150px] px-2 py-1.5 border rounded-md font-bold text-gray-800 uppercase focus:ring-1 focus:ring-primary outline-none" placeholder="Student Name" />
                                    </td>
                                    {selectedSubjects.map((subj: string, sIndex: number) => {
                                        const cnf = subjectConfigs[subj] || { hasTh: true, hasPr: true };
                                        return (
                                            <td key={subj} className="p-2 border-l border-gray-100 text-center min-w-[130px]">
                                                <div className="flex gap-1 justify-center relative">
                                                    {cnf.hasTh && (
                                                        <div className="flex flex-col items-center">
                                                            <input type="text" value={std.subjectAbsentsTH?.[subj] ? 'AB' : (std.subjectMarksTH?.[subj] || '')} onChange={(e) => handleMarkChange(i, e.target.value, 'TH', subj)} placeholder="TH" className="w-12 text-center py-1.5 border rounded focus:ring-1 focus:ring-primary outline-none disabled:bg-gray-100 disabled:text-gray-400 font-bold transition-colors" disabled={std.subjectAbsentsTH?.[subj]} tabIndex={i * selectedSubjects.length + sIndex + 1} />
                                                            <label className="text-[10px] mt-0.5 text-gray-500 font-bold flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={std.subjectAbsentsTH?.[subj] || false} onChange={e => handleAbsentChange(i, 'TH', e.target.checked, subj)} className="w-3 h-3 text-red-600 rounded focus:ring-red-600 accent-red-600" /> Abs</label>
                                                        </div>
                                                    )}
                                                    {cnf.hasPr && (
                                                        <div className="flex flex-col items-center">
                                                            <input type="text" value={std.subjectAbsentsPR?.[subj] ? 'AB' : (std.subjectMarksPR?.[subj] || '')} onChange={(e) => handleMarkChange(i, e.target.value, 'PR', subj)} placeholder="PR" className="w-12 text-center py-1.5 border rounded focus:ring-1 focus:ring-primary outline-none disabled:bg-gray-100 disabled:text-gray-400 font-bold transition-colors" disabled={std.subjectAbsentsPR?.[subj]} />
                                                            <label className="text-[10px] mt-0.5 text-gray-500 font-bold flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={std.subjectAbsentsPR?.[subj] || false} onChange={e => handleAbsentChange(i, 'PR', e.target.checked, subj)} className="w-3 h-3 text-red-600 rounded focus:ring-red-600 accent-red-600" /> Abs</label>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile view */}
                <div className="md:hidden flex flex-col gap-3 p-3 text-primary">
                   {students.map((std, i) => (
                       <div key={i} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                          <input type="text" value={std.studentName || ''} onChange={e => handleStudentChange(i, 'studentName', e.target.value)} className="w-full mb-2 px-2 py-1.5 border rounded-md font-bold text-gray-900 uppercase text-lg focus:ring-1 focus:ring-primary outline-none" placeholder="Student Name" />
                          <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs text-gray-500">ID:</span>
                              <input type="text" value={std.schoolId || ''} onChange={e => handleStudentChange(i, 'schoolId', e.target.value)} className="flex-1 px-2 py-1 text-sm border rounded-md font-medium text-gray-600 focus:ring-1 focus:ring-primary outline-none" placeholder="Roll/ID" />
                          </div>
                            <div className="flex flex-col gap-3 mt-4">
                                {selectedSubjects.map((subj: string) => {
                                    const cnf = subjectConfigs[subj] || { hasTh: true, hasPr: true };
                                    return (
                                        <div key={subj} className="border-primary text-primary p-3 rounded-lg border">
                                            <p className="text-sm font-bold text-gray-700 mb-2">{subj}</p>
                                            <div className="flex items-center gap-4">
                                                {cnf.hasTh && (
                                                    <div className="flex flex-col items-center gap-1">
                                                        <div className="flex items-center gap-2">
                                                            <input type="text" inputMode="decimal" 
                                                                value={std.subjectMarksTH?.[subj] || ''} 
                                                                onChange={e => handleMarkChange(i, e.target.value, 'TH', subj)} 
                                                                disabled={std.subjectAbsentsTH?.[subj]}
                                                                className="w-full px-2 py-1 border rounded-md font-black text-sm text-center focus:ring-1 focus:ring-primary outline-none disabled:bg-gray-100"
                                                                placeholder="TH Marks" 
                                                             />
                                                            <label className="text-xs font-bold text-gray-500 flex items-center gap-1">
                                                                <input type="checkbox" checked={std.subjectAbsentsTH?.[subj] || false} onChange={e => handleAbsentChange(i, 'TH', e.target.checked, subj)} className="w-4 h-4 accent-red-600" /> Abs
                                                            </label>
                                                        </div>
                                                    </div>
                                                )}
                                                {cnf.hasPr && (
                                                    <div className="flex flex-col items-center gap-1">
                                                        <div className="flex items-center gap-2">
                                                            <input type="text" inputMode="decimal" 
                                                                value={std.subjectMarksPR?.[subj] || ''} 
                                                                onChange={e => handleMarkChange(i, e.target.value, 'PR', subj)} 
                                                                disabled={std.subjectAbsentsPR?.[subj]}
                                                                className="w-full px-2 py-1 border rounded-md font-black text-sm text-center focus:ring-1 focus:ring-primary outline-none disabled:bg-gray-100"
                                                                placeholder="PR Marks" 
                                                            />
                                                            <label className="text-xs font-bold text-gray-500 flex items-center gap-1">
                                                                <input type="checkbox" checked={std.subjectAbsentsPR?.[subj] || false} onChange={e => handleAbsentChange(i, 'PR', e.target.checked, subj)} className="w-4 h-4 accent-red-600" /> Abs
                                                            </label>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                       </div>
                    ))}
                </div>

                <div className="p-4 border-t text-primary flex flex-col items-end gap-3 border-x bg-gray-50/50 rounded-b-xl">
                    <div className="flex gap-4">
                        <button 
                           onClick={publishResults} 
                           disabled={!isDataComplete()}
                           className={`px-6 py-3 rounded-lg font-bold flex items-center gap-2 shadow-lg transition-all ${isDataComplete() && isAnyDataEntered() ? 'bg-green-600 text-white hover:bg-green-700 active:scale-95' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
                           <CheckCircle2 className="w-5 h-5" /> Calculate Rank & Publish
                        </button>
                        {isAnyDataEntered() && (
                            <button onClick={saveMarks} className="bg-primary text-white px-6 py-3 rounded-lg font-bold hover:bg-primary-dark flex items-center gap-2 shadow-lg active:scale-95 transition-all">
                               <Save className="w-5 h-5" /> Save Marks
                            </button>
                        )}
                    </div>
                    {publishSuccessMessage && (
                        <div className="w-full mt-1 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center gap-2 font-bold text-sm animate-fade-in shadow-sm">
                            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                            <span>{publishSuccessMessage}</span>
                        </div>
                    )}
                </div>
            </div>
        ) : null}
      </>
    )}
    </div>
  );
}
