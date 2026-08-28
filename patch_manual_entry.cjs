const fs = require('fs');

let code = fs.readFileSync('src/components/admin/ManualEntryTab.tsx', 'utf8');

// Replace state definition
code = code.replace(
  `const [subjectConfigs, setSubjectConfigs] = useState<Record<string, {fullMarks: number | '', passMarks: number | ''}>>({});`,
  `const [subjectConfigs, setSubjectConfigs] = useState<Record<string, {thFullMarks: number | '', thPassMarks: number | '', prFullMarks: number | '', prPassMarks: number | '', hasTh: boolean, hasPr: boolean}>>({});`
);

// Map students logic
// We use a regex to replace from "const mapped = classStudents.map(s => {" down to "setStudents(mapped);"
const mapStudentsRegex = /(const mapped = classStudents\.map\(s => {)[\s\S]*?(setStudents\(mapped\);)/;

const newMapStudents = `$1
              const existingRec = classResults.find(r => r.studentId === s.studentId && r.examType === examType);
              
              const subjectMarksTH: Record<string, string> = {};
              const subjectMarksPR: Record<string, string> = {};
              const subjectAbsentsTH: Record<string, boolean> = {};
              const subjectAbsentsPR: Record<string, boolean> = {};

              dynamicSubjects.forEach((subj: string) => {
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

              // for single subject
              const exSData = selectedSubject !== 'All Subjects' ? existingRec?.subjects?.[selectedSubject] : undefined;
              return {
                  ...s,
                  Class: selectedClass,
                  tempMarkTH: exSData?.thMarks !== undefined && exSData?.thMarks !== 'AB' ? String(exSData.thMarks) : '',
                  tempMarkPR: exSData?.prMarks !== undefined && exSData?.prMarks !== 'AB' ? String(exSData.prMarks) : '',
                  isAbsentTH: exSData?.thMarks === 'AB',
                  isAbsentPR: exSData?.prMarks === 'AB',
                  subjectMarksTH,
                  subjectMarksPR,
                  subjectAbsentsTH,
                  subjectAbsentsPR,
              };
          });

          $2`;
code = code.replace(mapStudentsRegex, newMapStudents);

// Handle mark change
const handleMarkChangeRegex = /const handleMarkChange = \(idx: number, rawVal: string, subj\?: string\) => {[\s\S]*?setStudents\(newS\);\n  };/;
const newHandleMarkChange = `const handleMarkChange = (idx: number, rawVal: string, type: 'TH'|'PR', subj?: string) => {
      let val = rawVal.replace(/[^0-9.]/g, '');
      val = val.replace(/^0+(?=\\d)/, '');
      
      const v = Number(val);
      const subjConfig = subjectConfigs[subj || selectedSubject] || { thFullMarks: 75, thPassMarks: 30, prFullMarks: 25, prPassMarks: 10, hasTh: true, hasPr: true };
      
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
  };`;
code = code.replace(handleMarkChangeRegex, newHandleMarkChange);

// Adding students logic
const addStudentRowRegex = /const addStudentRow = \(\) => {[\s\S]*?};/;
const newAddStudentRow = `const addStudentRow = () => {
      const newId = 'TEMP' + Math.floor(Math.random()*10000);
      setStudents([...students, {
          studentId: newId,
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
  };`;
code = code.replace(addStudentRowRegex, newAddStudentRow);

// Mark all present logic
const markAllPresentRegex = /const markAllPresent = \(\) => {[\s\S]*?};/;
const newMarkAllPresent = `const markAllPresent = () => {
      const newS = students.map(s => ({
          ...s,
          isAbsentTH: false,
          isAbsentPR: false,
          subjectAbsentsTH: {},
          subjectAbsentsPR: {}
      }));
      setStudents(newS);
  };`;
code = code.replace(markAllPresentRegex, newMarkAllPresent);

// Saving marks mapping
const saveMarksRegex = /let finalMarksParams: Record<string, number \| 'AB'> = {};[\s\S]*?if \(Object\.keys\(finalMarksParams\)\.length === 0\) continue; \/\/ Skip empty/;
const newSaveMarks = `let finalMarksParams: Record<string, {th: number | 'AB', pr: number | 'AB'}> = {};

              if (selectedSubject === 'All Subjects') {
                  dynamicSubjects.forEach((subj: string) => {
                      const thMark = std.subjectAbsentsTH[subj] ? 'AB' : (std.subjectMarksTH[subj] === '' ? null : Number(std.subjectMarksTH[subj]));
                      const prMark = std.subjectAbsentsPR[subj] ? 'AB' : (std.subjectMarksPR[subj] === '' ? null : Number(std.subjectMarksPR[subj]));
                      if (thMark !== null || prMark !== null) {
                          finalMarksParams[subj] = { th: thMark !== null ? thMark : 0, pr: prMark !== null ? prMark : 0 };
                      }
                  });
              } else {
                  const thVal = std.isAbsentTH ? 'AB' : (std.tempMarkTH === '' ? null : Number(std.tempMarkTH));
                  const prVal = std.isAbsentPR ? 'AB' : (std.tempMarkPR === '' ? null : Number(std.tempMarkPR));
                  if (thVal !== null || prVal !== null) {
                      finalMarksParams[selectedSubject] = { th: thVal !== null ? thVal : 0, pr: prVal !== null ? prVal : 0 };
                  }
              }

              if (Object.keys(finalMarksParams).length === 0) continue; // Skip empty`;
code = code.replace(saveMarksRegex, newSaveMarks);

// The subjects updating code block when saving
const newObjectEntriesSave1 = `Object.entries(finalMarksParams).forEach(([subj, val]) => {
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
                      const subjectDocId = \`\${examId}_\${std.studentId}_\${subj.replace(/\\s+/g, '')}\`;
                      batch.set(doc(db, 'results', subjectDocId), {
                          studentId: std.studentId,
                          examId: examId,
                          subject: subj,
                          marks: obtainedTotal,
                          fullMarks: tFM + pFM,
                          thMarks: val.th, prMarks: val.pr,
                          thFull: tFM, prFull: pFM
                      });
                      opCount++;
                  });`;
const newObjectEntriesSave2 = `Object.entries(finalMarksParams).forEach(([subj, val]) => {
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
                      const subjectDocId = \`\${examId}_\${std.studentId}_\${subj.replace(/\\s+/g, '')}\`;
                      batch.set(doc(db, 'results', subjectDocId), {
                          studentId: std.studentId,
                          examId: examId,
                          subject: subj,
                          marks: obtainedTotal,
                          fullMarks: tFM + pFM,
                          thMarks: val.th, prMarks: val.pr,
                          thFull: tFM, prFull: pFM
                      });
                      opCount++;
                  });`;

let replacedCount = 0;
code = code.replace(/Object\.entries\(finalMarksParams\)\.forEach\(\(\[subj, val\]\) => {[\s\S]*?\}\);/g, (match) => {
    replacedCount++;
    if(replacedCount === 1) return newObjectEntriesSave1;
    return newObjectEntriesSave2;
});

// Need to update the UI parts! Let's do that inline or we can use another string replacement.
// Wait, the UI block for inputs will need heavy changes. Let's do a multi-edit or rewrite by passing the string replacements for the TSX part.
const renderUI_1 = `
             {selectedSubject === 'All Subjects' ? (
                <div className="col-span-1 lg:col-span-4 mt-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Subject Full Marks & Pass Marks</label>
                    <div className="flex flex-col gap-3">
                        {dynamicSubjects.map((subj: string) => (
                            <div key={subj} className="border-primary text-primary p-3 rounded-lg border flex flex-col md:flex-row gap-4 justify-between items-center bg-gray-50">
                                <div className="text-sm font-bold text-gray-800 w-32 truncate">{subj}</div>
                                
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-600"><input type="checkbox" checked={subjectConfigs[subj]?.hasTh ?? true} onChange={e => setSubjectConfigs({...subjectConfigs, [subj]: {...(subjectConfigs[subj] || {thFullMarks:75, thPassMarks:30, prFullMarks:25, prPassMarks:10, hasPr:true}), hasTh: e.target.checked}})} /> TH</label>
                                    {(subjectConfigs[subj]?.hasTh ?? true) && (
                                        <div className="flex gap-2">
                                            <div><label className="text-[10px] text-gray-400">TH Full</label><input type="number" value={subjectConfigs[subj]?.thFullMarks ?? 75} onChange={e => setSubjectConfigs({...subjectConfigs, [subj]: {...(subjectConfigs[subj] || {thPassMarks:30, hasPr:true, hasTh:true, prFullMarks:25, prPassMarks:10}), thFullMarks: e.target.value === '' ? '' : Number(e.target.value)}})} className="w-16 px-1 py-1 text-sm border rounded text-center focus:outline-none bg-white font-bold" /></div>
                                            <div><label className="text-[10px] text-gray-400">TH Pass</label><input type="number" value={subjectConfigs[subj]?.thPassMarks ?? 30} onChange={e => setSubjectConfigs({...subjectConfigs, [subj]: {...(subjectConfigs[subj] || {thFullMarks:75, hasPr:true, hasTh:true, prFullMarks:25, prPassMarks:10}), thPassMarks: e.target.value === '' ? '' : Number(e.target.value)}})} className="w-16 px-1 py-1 text-sm border rounded text-center focus:outline-none bg-white font-bold" /></div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-600"><input type="checkbox" checked={subjectConfigs[subj]?.hasPr ?? true} onChange={e => setSubjectConfigs({...subjectConfigs, [subj]: {...(subjectConfigs[subj] || {thFullMarks:75, thPassMarks:30, prFullMarks:25, prPassMarks:10, hasTh:true}), hasPr: e.target.checked}})} /> PR</label>
                                    {(subjectConfigs[subj]?.hasPr ?? true) && (
                                        <div className="flex gap-2">
                                            <div><label className="text-[10px] text-gray-400">PR Full</label><input type="number" value={subjectConfigs[subj]?.prFullMarks ?? 25} onChange={e => setSubjectConfigs({...subjectConfigs, [subj]: {...(subjectConfigs[subj] || {thFullMarks:75, thPassMarks:30, hasPr:true, hasTh:true, prPassMarks:10}), prFullMarks: e.target.value === '' ? '' : Number(e.target.value)}})} className="w-16 px-1 py-1 text-sm border rounded text-center focus:outline-none bg-white font-bold" /></div>
                                            <div><label className="text-[10px] text-gray-400">PR Pass</label><input type="number" value={subjectConfigs[subj]?.prPassMarks ?? 10} onChange={e => setSubjectConfigs({...subjectConfigs, [subj]: {...(subjectConfigs[subj] || {thFullMarks:75, thPassMarks:30, hasPr:true, hasTh:true, prFullMarks:25}), prPassMarks: e.target.value === '' ? '' : Number(e.target.value)}})} className="w-16 px-1 py-1 text-sm border rounded text-center focus:outline-none bg-white font-bold" /></div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
             ) : (
                 selectedSubject && (
                    <div className="col-span-1 lg:col-span-4 flex flex-col md:flex-row gap-4 mt-2 p-3 bg-gray-50 border rounded-xl">
                        <div className="flex gap-4 items-center">
                            <label className="flex items-center gap-2 text-sm font-bold text-gray-600"><input type="checkbox" checked={subjectConfigs[selectedSubject]?.hasTh ?? true} onChange={e => setSubjectConfigs({...subjectConfigs, [selectedSubject]: {...(subjectConfigs[selectedSubject] || {thFullMarks:75, thPassMarks:30, prFullMarks:25, prPassMarks:10, hasPr:true}), hasTh: e.target.checked}})} /> TH</label>
                            {(subjectConfigs[selectedSubject]?.hasTh ?? true) && (
                                <div className="flex gap-2">
                                    <div><label className="text-[10px] text-gray-400">TH Full</label><input type="number" value={subjectConfigs[selectedSubject]?.thFullMarks ?? 75} onChange={e => setSubjectConfigs({...subjectConfigs, [selectedSubject]: {...(subjectConfigs[selectedSubject] || {thPassMarks:30, prFullMarks:25, prPassMarks:10, hasPr:true, hasTh:true}), thFullMarks: e.target.value === '' ? '' : Number(e.target.value)}})} className="w-20 px-2 py-1 border rounded bg-white text-center font-bold" /></div>
                                    <div><label className="text-[10px] text-gray-400">TH Pass</label><input type="number" value={subjectConfigs[selectedSubject]?.thPassMarks ?? 30} onChange={e => setSubjectConfigs({...subjectConfigs, [selectedSubject]: {...(subjectConfigs[selectedSubject] || {thFullMarks:75, prFullMarks:25, prPassMarks:10, hasPr:true, hasTh:true}), thPassMarks: e.target.value === '' ? '' : Number(e.target.value)}})} className="w-20 px-2 py-1 border rounded bg-white text-center font-bold" /></div>
                                </div>
                            )}
                        </div>
                        <div className="w-px bg-gray-300 hidden md:block"></div>
                        <div className="flex gap-4 items-center">
                            <label className="flex items-center gap-2 text-sm font-bold text-gray-600"><input type="checkbox" checked={subjectConfigs[selectedSubject]?.hasPr ?? true} onChange={e => setSubjectConfigs({...subjectConfigs, [selectedSubject]: {...(subjectConfigs[selectedSubject] || {thFullMarks:75, thPassMarks:30, prFullMarks:25, prPassMarks:10, hasTh:true}), hasPr: e.target.checked}})} /> PR</label>
                            {(subjectConfigs[selectedSubject]?.hasPr ?? true) && (
                                <div className="flex gap-2">
                                    <div><label className="text-[10px] text-gray-400">PR Full</label><input type="number" value={subjectConfigs[selectedSubject]?.prFullMarks ?? 25} onChange={e => setSubjectConfigs({...subjectConfigs, [selectedSubject]: {...(subjectConfigs[selectedSubject] || {thFullMarks:75, thPassMarks:30, prPassMarks:10, hasTh:true, hasPr:true}), prFullMarks: e.target.value === '' ? '' : Number(e.target.value)}})} className="w-20 px-2 py-1 border rounded bg-white text-center font-bold" /></div>
                                    <div><label className="text-[10px] text-gray-400">PR Pass</label><input type="number" value={subjectConfigs[selectedSubject]?.prPassMarks ?? 10} onChange={e => setSubjectConfigs({...subjectConfigs, [selectedSubject]: {...(subjectConfigs[selectedSubject] || {thFullMarks:75, thPassMarks:30, prFullMarks:25, hasTh:true, hasPr:true}), prPassMarks: e.target.value === '' ? '' : Number(e.target.value)}})} className="w-20 px-2 py-1 border rounded bg-white text-center font-bold" /></div>
                                </div>
                            )}
                        </div>
                    </div>
                 )
             )}
`;
const oldUI_Regex = /\{selectedSubject === 'All Subjects' \? \([\s\S]*? \)\n             \)\}/;
code = code.replace(oldUI_Regex, renderUI_1.trim());

// Render table header
const renderTableHeaderAllSubj = `
                               {selectedSubject === 'All Subjects' ? (
                                   dynamicSubjects.map((subj: string) => (
                                       <th key={subj} className="p-3 text-center border-l bg-gray-50 border-gray-100">
                                           <div className="text-xs mb-1">{subj}</div>
                                           <div className="flex justify-center text-[10px] gap-2 text-gray-400 font-normal">
                                               {(subjectConfigs[subj]?.hasTh ?? true) && <span className="w-12 text-center border-r">TH</span>}
                                               {(subjectConfigs[subj]?.hasPr ?? true) && <span className="w-12 text-center">PR</span>}
                                           </div>
                                       </th>
                                   ))
                               ) : (
                                   <>
                                      {(subjectConfigs[selectedSubject]?.hasTh ?? true) && <th className="p-3 text-center">Theory (TH) Marks</th>}
                                      {(subjectConfigs[selectedSubject]?.hasPr ?? true) && <th className="p-3 text-center">Practical (PR) Marks</th>}
                                   </>
                               )}
`;
const oldTbRegex = /\{selectedSubject === 'All Subjects' \? \([\s\S]*?<\/>\n                               \)\}/;
code = code.replace(oldTbRegex, renderTableHeaderAllSubj.trim());

// Render table body
const trBodyRender = `
                               {selectedSubject === 'All Subjects' ? (
                                   dynamicSubjects.map((subj: string) => {
                                      const cnf = subjectConfigs[subj] || { hasTh: true, hasPr: true };
                                      return (
                                       <td key={subj} className="p-2 border-l border-gray-100 text-center">
                                           <div className="flex gap-1 justify-center relative">
                                               {cnf.hasTh && (
                                                   <div className="flex flex-col items-center">
                                                       <input type="text" value={std.subjectAbsentsTH[subj] ? 'AB' : (std.subjectMarksTH[subj] || '')} onChange={(e) => handleMarkChange(idx, e.target.value, 'TH', subj)} placeholder="TH" className="w-12 text-center py-1 border rounded focus:ring-1 focus:ring-primary outline-none disabled:bg-gray-100 disabled:text-gray-400 transition-colors" disabled={std.subjectAbsentsTH[subj]} />
                                                       <label className="text-[9px] mt-0.5 text-gray-400 flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={std.subjectAbsentsTH[subj]} onChange={e => handleAbsentChange(idx, 'TH', e.target.checked, subj)} className="w-2.5 h-2.5" /> Abs</label>
                                                   </div>
                                               )}
                                               {cnf.hasPr && (
                                                   <div className="flex flex-col items-center">
                                                       <input type="text" value={std.subjectAbsentsPR[subj] ? 'AB' : (std.subjectMarksPR[subj] || '')} onChange={(e) => handleMarkChange(idx, e.target.value, 'PR', subj)} placeholder="PR" className="w-12 text-center py-1 border rounded focus:ring-1 focus:ring-primary outline-none disabled:bg-gray-100 disabled:text-gray-400 transition-colors" disabled={std.subjectAbsentsPR[subj]} />
                                                       <label className="text-[9px] mt-0.5 text-gray-400 flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={std.subjectAbsentsPR[subj]} onChange={e => handleAbsentChange(idx, 'PR', e.target.checked, subj)} className="w-2.5 h-2.5" /> Abs</label>
                                                   </div>
                                               )}
                                           </div>
                                       </td>
                                      )
                                   })
                               ) : (
                                   <>
                                      {(subjectConfigs[selectedSubject]?.hasTh ?? true) && (
                                          <td className="p-3 text-center">
                                              <div className="flex items-center gap-2 justify-center">
                                                  <input type="text" value={std.isAbsentTH ? 'AB' : std.tempMarkTH} onChange={(e) => handleMarkChange(idx, e.target.value, 'TH')} placeholder="Theory Marks" className="w-20 text-center py-1.5 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none disabled:bg-gray-100 disabled:text-gray-400 font-bold transition-colors" disabled={std.isAbsentTH} />
                                                  <label className="text-xs text-gray-500 font-bold flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={std.isAbsentTH} onChange={e => handleAbsentChange(idx, 'TH', e.target.checked)} className="w-3.5 h-3.5" /> Absent</label>
                                              </div>
                                          </td>
                                      )}
                                      {(subjectConfigs[selectedSubject]?.hasPr ?? true) && (
                                          <td className="p-3 text-center">
                                              <div className="flex items-center gap-2 justify-center">
                                                  <input type="text" value={std.isAbsentPR ? 'AB' : std.tempMarkPR} onChange={(e) => handleMarkChange(idx, e.target.value, 'PR')} placeholder="Practical Marks" className="w-20 text-center py-1.5 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none disabled:bg-gray-100 disabled:text-gray-400 font-bold transition-colors" disabled={std.isAbsentPR} />
                                                  <label className="text-xs text-gray-500 font-bold flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={std.isAbsentPR} onChange={e => handleAbsentChange(idx, 'PR', e.target.checked)} className="w-3.5 h-3.5" /> Absent</label>
                                              </div>
                                          </td>
                                      )}
                                   </>
                               )}
`;
const oldTbBodyRegex = /\{selectedSubject === 'All Subjects' \? \([\s\S]*?<\/>\n                               \)\}/;
code = code.replace(oldTbBodyRegex, trBodyRender.trim());

// Mobile View Replacement
const mobBodyRegex = /\{selectedSubject === 'All Subjects' \? \([\s\S]*?\{!isSingleSubjAbsent && \([\s\S]*?\}\)\n                                       <\/div>\n                                   \)\}/;
const renderMobRender = `
                               {selectedSubject === 'All Subjects' ? (
                                   <div className="space-y-4">
                                       {dynamicSubjects.map((subj: string) => {
                                           const cnf = subjectConfigs[subj] || { hasTh: true, hasPr: true };
                                           return (
                                           <div key={subj} className="flex justify-between items-center py-2 border-b border-gray-100">
                                               <span className="text-sm font-bold text-gray-700 w-24 truncate">{subj}</span>
                                               <div className="flex gap-2 text-right">
                                                    {cnf.hasTh && (
                                                       <div className="flex flex-col items-center">
                                                           <input type="text" value={std.subjectAbsentsTH[subj] ? 'AB' : (std.subjectMarksTH[subj] || '')} onChange={(e) => handleMarkChange(idx, e.target.value, 'TH', subj)} placeholder="TH" className="w-12 text-center py-1 border rounded focus:ring-1 focus:ring-primary outline-none disabled:bg-gray-100 disabled:text-gray-400 transition-colors" disabled={std.subjectAbsentsTH[subj]} />
                                                           <label className="text-[9px] mt-0.5 text-gray-400 flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={std.subjectAbsentsTH[subj]} onChange={e => handleAbsentChange(idx, 'TH', e.target.checked, subj)} className="w-2.5 h-2.5" /> Abs</label>
                                                       </div>
                                                    )}
                                                    {cnf.hasPr && (
                                                       <div className="flex flex-col items-center">
                                                           <input type="text" value={std.subjectAbsentsPR[subj] ? 'AB' : (std.subjectMarksPR[subj] || '')} onChange={(e) => handleMarkChange(idx, e.target.value, 'PR', subj)} placeholder="PR" className="w-12 text-center py-1 border rounded focus:ring-1 focus:ring-primary outline-none disabled:bg-gray-100 disabled:text-gray-400 transition-colors" disabled={std.subjectAbsentsPR[subj]} />
                                                           <label className="text-[9px] mt-0.5 text-gray-400 flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={std.subjectAbsentsPR[subj]} onChange={e => handleAbsentChange(idx, 'PR', e.target.checked, subj)} className="w-2.5 h-2.5" /> Abs</label>
                                                       </div>
                                                    )}
                                               </div>
                                           </div>
                                           )
                                       })}
                                   </div>
                               ) : (
                                   <div className="flex flex-col gap-3">
                                       {(subjectConfigs[selectedSubject]?.hasTh ?? true) && (
                                           <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                               <span className="font-bold text-gray-700 text-sm">Theory (TH)</span>
                                               <div className="flex gap-2">
                                                   <input type="text" value={std.isAbsentTH ? 'AB' : std.tempMarkTH} onChange={(e) => handleMarkChange(idx, e.target.value, 'TH')} placeholder="TH Marks" className="w-20 text-center py-1.5 border rounded-lg focus:ring-1 focus:ring-primary outline-none disabled:bg-gray-100 disabled:text-gray-400 font-bold" disabled={std.isAbsentTH} />
                                                   <label className="text-xs text-gray-500 font-bold flex items-center gap-1 cursor-pointer mt-1"><input type="checkbox" checked={std.isAbsentTH} onChange={e => handleAbsentChange(idx, 'TH', e.target.checked)} className="w-4 h-4" /> Absent</label>
                                               </div>
                                           </div>
                                       )}
                                       {(subjectConfigs[selectedSubject]?.hasPr ?? true) && (
                                           <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                               <span className="font-bold text-gray-700 text-sm">Practical (PR)</span>
                                               <div className="flex gap-2">
                                                   <input type="text" value={std.isAbsentPR ? 'AB' : std.tempMarkPR} onChange={(e) => handleMarkChange(idx, e.target.value, 'PR')} placeholder="PR Marks" className="w-20 text-center py-1.5 border rounded-lg focus:ring-1 focus:ring-primary outline-none disabled:bg-gray-100 disabled:text-gray-400 font-bold" disabled={std.isAbsentPR} />
                                                   <label className="text-xs text-gray-500 font-bold flex items-center gap-1 cursor-pointer mt-1"><input type="checkbox" checked={std.isAbsentPR} onChange={e => handleAbsentChange(idx, 'PR', e.target.checked)} className="w-4 h-4" /> Absent</label>
                                               </div>
                                           </div>
                                       )}
                                   </div>
                               )}
`;
code = code.replace(mobBodyRegex, renderMobRender.trim());

fs.writeFileSync('src/components/admin/ManualEntryTab.tsx', code);
console.log('Update Complete');
EOF

