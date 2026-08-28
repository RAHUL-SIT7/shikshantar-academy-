const fs = require('fs');
let content = fs.readFileSync('src/components/fee_management/StudentLedgerTab.tsx', 'utf8');

const s1 = '                                      ) : (\n                                         (() => {\n';
const e1 = '                                             ));\n                                         })()\n';

const startIndex = content.indexOf(s1);
const endIndex = content.indexOf(e1);

if(startIndex > -1 && endIndex > -1) {
    const toReplace = content.substring(startIndex, endIndex + e1.length);
    const replacement = `                                      ) : (
                                        [...s.fees]
                                        .map(f => {
                                            let m = f.month;
                                            if (m === 'Baishak') m = 'Baisakh';
                                            else if (m === 'Ashad') m = 'Asar';
                                            else if (m === 'Ashoj') m = 'Ashwin';
                                            return { ...f, month: m };
                                        })
                                        .sort((a, b) => {
                                            if (a.status === 'paid' && b.status !== 'paid') return -1;
                                            if (a.status !== 'paid' && b.status === 'paid') return 1;
                                            return 0;
                                        })
                                        .filter((f, index, self) => index === self.findIndex(t => t.month === f.month))
                                        .sort((a:any, b:any) => MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month))
                                        .map((f: any, fIdx: number) => (
                                         <tr key={f.id || \`\${f.month}-\${fIdx}\`} onClick={() => setSelectedPill({ student: s, month: f.month })} className="hover:bg-gray-50 transition-colors cursor-pointer" title="Click to view receipt or due details">
                                             <td className="py-2 px-4 font-bold text-gray-700">{f.month}</td>
                                             <td className="py-2 px-4 font-bold text-gray-900">NRs. {Number(f.totalFee || 0).toLocaleString()}</td>
                                             <td className="py-2 px-4">
                                                 {f.status === 'paid' ? <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-widest">Paid</span> : <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-widest">Due</span>}
                                             </td>
                                             <td className="py-2 px-4 text-gray-500 max-w-[200px] text-[10px]">
                                                 {f.breakdown ? Object.entries(f.breakdown).map(([k, v]) => Number(v) > 0 ? \`\${k}: \${v}\` : null).filter(Boolean).join(', ') : '-'}
                                             </td>
                                             <td className="py-2 px-4 text-gray-500 hidden sm:table-cell">{f.paidAt ? formatBSDate(new Date(f.paidAt)) : '-'}</td>
                                             <td className="py-2 px-4 font-mono text-[10px] text-gray-500 hidden sm:table-cell">{f.receiptNo || '-'}</td>
                                         </tr>
                                        ))\n`;
    content = content.replace(toReplace, replacement);
    fs.writeFileSync('src/components/fee_management/StudentLedgerTab.tsx', content);
    console.log('Reverted');
} else {
    console.log('Not found');
    console.log(startIndex, endIndex);
}
