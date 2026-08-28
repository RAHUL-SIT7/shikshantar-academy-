const fs = require('fs');

let c = fs.readFileSync('src/components/fee_management/CashLedgerTab.tsx', 'utf-8');
c = c.replace(/\\\$\{/g, '${');
fs.writeFileSync('src/components/fee_management/CashLedgerTab.tsx', c);
