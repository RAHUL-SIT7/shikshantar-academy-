const fs = require('fs');

function updateManualEntry() {
    let content = fs.readFileSync('src/components/admin/ManualEntryTab.tsx', 'utf8');

    // Update state to use th and pr
    const stateReplacer = `const [subjectConfigs, setSubjectConfigs] = useState<Record<string, {thFullMarks: number | '', thPassMarks: number | '', prFullMarks: number | '', prPassMarks: number | '', hasTh: boolean, hasPr: boolean}>>({});`;
    content = content.replace(/const \[subjectConfigs, setSubjectConfigs\] .*/, stateReplacer);

    // I will replace the whole component because it's too complicated to just string replace line by line.
}

try {
    updateManualEntry();
} catch (e) {
    console.error(e);
}
