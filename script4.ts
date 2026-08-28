import fs from 'fs';

let content = fs.readFileSync('src/components/fee_management/TransactionHistoryTab.tsx', 'utf-8');
content = content.replace(/type="number"/g, `type="number" min="0" step="any" onKeyDown={(e) => { if (e.key === '-' || e.key === 'e') e.preventDefault(); }}`);
fs.writeFileSync('src/components/fee_management/TransactionHistoryTab.tsx', content);

console.log("Replaced");
