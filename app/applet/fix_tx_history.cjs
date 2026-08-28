const fs = require('fs');

let content = fs.readFileSync('src/components/fee_management/TransactionHistoryTab.tsx', 'utf-8');

content = content.replace('Shikshantar Academy', 'EVEREST ENGLISH SCHOOL');
content = content.replace('Siraha, Nepal', 'Biratnagar, Province 1, Nepal');
content = content.replace('https://i.postimg.cc/SxGS5WxY/logo.png', 'https://ui-avatars.com/api/?name=E+S&background=10b981&color=fff&size=100&bold=true');

fs.writeFileSync('src/components/fee_management/TransactionHistoryTab.tsx', content);

console.log("Replaced DOM render string too");
