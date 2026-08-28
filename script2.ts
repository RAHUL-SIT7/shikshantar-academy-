import fs from 'fs';

// Fix StudentLedgerTab inputs
let content = fs.readFileSync('src/components/fee_management/StudentLedgerTab.tsx', 'utf-8');
content = content.replace(/type="number"/g, `type="number" min="0" step="any" onKeyDown={(e) => { if (e.key === '-' || e.key === 'e') e.preventDefault(); }}`);
content = content.replace(/onChange=\{e => setEditingFee\(\{\.\.\.editingFee, monthlyFee: e\.target\.value\}\)\}/g, `onChange={e => { const val = Number(e.target.value); setEditingFee({...editingFee, monthlyFee: val >= 0 ? e.target.value : '0'}) }}`);
content = content.replace(/onChange=\{e => setEditingFee\(\{\.\.\.editingFee, examFee: e\.target\.value\}\)\}/g, `onChange={e => { const val = Number(e.target.value); setEditingFee({...editingFee, examFee: val >= 0 ? e.target.value : '0'}) }}`);
content = content.replace(/onChange=\{e => setEditingFee\(\{\.\.\.editingFee, computerFee: e\.target\.value\}\)\}/g, `onChange={e => { const val = Number(e.target.value); setEditingFee({...editingFee, computerFee: val >= 0 ? e.target.value : '0'}) }}`);
content = content.replace(/onChange=\{e => setEditingFee\(\{\.\.\.editingFee, otherFee: e\.target\.value\}\)\}/g, `onChange={e => { const val = Number(e.target.value); setEditingFee({...editingFee, otherFee: val >= 0 ? e.target.value : '0'}) }}`);
fs.writeFileSync('src/components/fee_management/StudentLedgerTab.tsx', content);

// Fix FeeStructure inputs
let feeStruct = fs.readFileSync('src/pages/FeeStructure.tsx', 'utf-8');
feeStruct = feeStruct.replace(/type="number"/g, `type="number" min="0" step="any" onKeyDown={(e) => { if (e.key === '-' || e.key === 'e') e.preventDefault(); }}`);
fs.writeFileSync('src/pages/FeeStructure.tsx', feeStruct);

console.log("Replaced");
