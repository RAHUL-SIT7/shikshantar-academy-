const fs = require('fs');
const files = [
  'src/pages/Home.tsx',
  'src/pages/Result.tsx',
  'src/components/fee_management/ReportsAnalyticsTab.tsx'
];
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const newContent = content.replace(/<ResponsiveContainer width="100%" height="100%">/g, '<ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>');
  fs.writeFileSync(file, newContent, 'utf8');
}
console.log('Replaced successfully');
