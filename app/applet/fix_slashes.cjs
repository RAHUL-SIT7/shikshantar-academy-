const fs = require('fs');
const file = 'src/components/fee_management/CashLedgerTab.tsx';
let content = fs.readFileSync(file, 'utf-8');

content = content.replace(/\${entry\.isSystem \? \\`/g, '${entry.isSystem ? `');
content = content.replace(/\\` : \\`/g, '` : `');
content = content.replace(/\\`}/g, '`}');

fs.writeFileSync(file, content);
console.log("Fixed backslashes");
