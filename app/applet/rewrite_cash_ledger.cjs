const fs = require('fs');

const file = 'src/components/fee_management/CashLedgerTab.tsx';
let content = fs.readFileSync(file, 'utf-8');

const regex = /const handlePrintReceipt = \(entry: any\) => \{[\s\S]*?printWindow\.document\.close\(\);\n  \};/;

const replacement = `const handlePrintReceipt = (entry: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let detailsHtml = '';
    
    if (entry.isSystem && entry.originalTx) {
       const tx = entry.originalTx;
       let count = 1;
       
       if (tx.breakdown) {
          if (tx.breakdown.tuition) {
              detailsHtml += \`<tr><td style="text-align: center;">\${count++}</td><td>Tuition Fee (\${tx.breakdown.months?.join(', ') || ''})</td><td style="text-align: right;">\${Number(tx.breakdown.tuition * (tx.breakdown.months?.length || 1)).toLocaleString()}</td></tr>\`;
          }
          if (tx.breakdown.additional && tx.breakdown.additional.length > 0) {
              tx.breakdown.additional.forEach((add: any) => {
                  detailsHtml += \`<tr><td style="text-align: center;">\${count++}</td><td>\${add.name || add.type}</td><td style="text-align: right;">\${Number(add.amount).toLocaleString()}</td></tr>\`;
              });
          }
       } else if (tx.receiptMonthsData) {
          tx.receiptMonthsData.forEach((m: any) => {
              detailsHtml += \`<tr><td colspan="3" style="font-weight: bold; background-color: #fef08a; padding: 8px 12px; font-size: 13px;">Month: \${m.month}</td></tr>\`;
              if (m.tuition) detailsHtml += \`<tr><td style="text-align: center;">\${count++}</td><td style="padding-left: 20px;">Tuition Fee</td><td style="text-align: right;">\${Number(m.tuition).toLocaleString()}</td></tr>\`;
              if (m.computer) detailsHtml += \`<tr><td style="text-align: center;">\${count++}</td><td style="padding-left: 20px;">Computer Fee</td><td style="text-align: right;">\${Number(m.computer).toLocaleString()}</td></tr>\`;
              if (m.exam) detailsHtml += \`<tr><td style="text-align: center;">\${count++}</td><td style="padding-left: 20px;">Exam Fee</td><td style="text-align: right;">\${Number(m.exam).toLocaleString()}</td></tr>\`;
              if (m.other) detailsHtml += \`<tr><td style="text-align: center;">\${count++}</td><td style="padding-left: 20px;">Other Fee</td><td style="text-align: right;">\${Number(m.other).toLocaleString()}</td></tr>\`;
          });
          if (tx.otherFees && tx.otherFees.length > 0) {
              tx.otherFees.forEach((add: any) => {
                  detailsHtml += \`<tr><td style="text-align: center;">\${count++}</td><td>\${add.name}</td><td style="text-align: right;">\${Number(add.amount).toLocaleString()}</td></tr>\`;
              });
          }
          if (tx.discount) {
              detailsHtml += \`<tr><td style="text-align: center;">\${count++}</td><td>Discount</td><td style="text-align: right;">- \${Number(tx.discount).toLocaleString()}</td></tr>\`;
          }
       } else {
          detailsHtml += \`<tr><td style="text-align: center;">1</td><td>Fee Collection (\${tx.months?.join(', ') || ''})</td><td style="text-align: right;">\${Number(tx.amount).toLocaleString()}</td></tr>\`;
       }
       
       detailsHtml += \`
          <tr>
              <td colspan="2" style="text-align: right; border-left: none;">Total</td>
              <td style="border-right: none; text-align: right; font-weight: bold;">\${Number(tx.amount).toLocaleString()}</td>
          </tr>
       \`;
    } else {
       detailsHtml = \`
          <tr>
              <td style="text-align: center;">1</td>
              <td>\${entry.category || '-'} - \${entry.remarks || '-'}</td>
              <td style="text-align: right;">\${Number(entry.amount).toLocaleString()}</td>
          </tr>
          <tr>
              <td colspan="2" style="text-align: right; border-left: none;">Total</td>
              <td style="border-right: none; text-align: right; font-weight: bold;">\${Number(entry.amount).toLocaleString()}</td>
          </tr>
       \`;
    }

    const receiptNo = entry.isSystem ? (entry.originalTx?.receipt || entry.id?.substring(0,8).toUpperCase()) : (entry.id ? entry.id.substring(0,8).toUpperCase() : \`CASH-\${Date.now().toString().slice(-4)}\`);
    const studentName = entry.isSystem && entry.originalTx ? entry.originalTx.studentName : '';
    const className = entry.isSystem && entry.originalTx ? entry.originalTx.class : '';
    const section = entry.isSystem && entry.originalTx ? (entry.originalTx.section || '') : '';
    const rollNo = entry.isSystem && entry.originalTx ? (entry.originalTx.rollNo || '') : '';
    const monthsText = entry.isSystem && entry.originalTx ? (entry.originalTx.months?.join(', ') || '') : '';

    printWindow.document.write(\`
      <html>
      <head>
          <title>Receipt - \${receiptNo}</title>
          <style>
              @page { size: auto; margin: 0; }
              body { background-color: #fff; font-family: 'Times New Roman', serif; padding: 20px; }
              .receipt-container { max-width: 800px; margin: 0 auto; border: 2px solid #000; background-color: #fef9c3; padding: 0; }
              .text-center { text-align: center; }
              .header-text { margin: 5px 0; }
              .info-row { display: flex; justify-content: space-between; margin-bottom: 20px; padding: 0 20px; }
              .line-input { border-bottom: 1px dashed #000; display: inline-block; min-width: 150px; font-style: normal; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; border-left: none; border-right: none; }
              th, td { border: 1px solid #000; padding: 10px; }
              th { background-color: #fef08a; }
              tr td:first-child, tr th:first-child { border-left: none; }
              tr td:last-child, tr th:last-child { border-right: none; }
          </style>
      </head>
      <body onload="setTimeout(() => { window.print(); window.close(); }, 500);">
          <div class="receipt-container">
              <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; padding-top: 15px;">
                  <div style="font-size: 16px;">Receipt</div>
                  <h1 style="margin: 5px 0; font-size: 28px; font-weight: bold; font-family: Arial, sans-serif;">SHIKSHANTAR ACADEMY</h1>
                  <p style="margin: 2px 0; font-size: 15px;">Siraha, Nepal</p>
                  <p style="margin: 2px 0; font-size: 15px;">Website: https://shikshantaracademy.edu.np</p>
                  <p style="margin: 2px 0; font-size: 15px;">Contact: +977 9709867048, +977 9807790805 | Email: academyshikshantar@gmail.com</p>
              </div>
              
              <div style="padding: 20px 20px 10px 20px;">
                  <span style="font-size: 18px;">Receipt No. <strong class="line-input">\${receiptNo}</strong></span>
              </div>
              
              \${entry.isSystem ? \\\`
              <div class="info-row">
                  <div style="flex: 1; font-size: 16px;">Name of Student: <strong class="line-input" style="min-width: 300px;">\${studentName}</strong></div>
                  <div style="font-size: 16px;">Class: <strong class="line-input" style="min-width: 100px; text-align: center;">\${className}</strong> 
                       Section: <strong class="line-input" style="min-width: 80px; text-align: center;">\${section}</strong></div>
              </div>
              
              <div class="info-row">
                  <div style="flex: 1; font-size: 16px;">Roll No: <strong class="line-input" style="min-width: 150px;">\${rollNo}</strong></div>
                  <div style="font-size: 16px;">Month: <strong class="line-input" style="min-width: 150px; text-align: center;">\${monthsText}</strong></div>
              </div>\\\` : \\\`
              <div class="info-row">
                  <div style="flex: 1; font-size: 16px;">Date (B.S.): <strong class="line-input" style="min-width: 300px;">\${entry.date}</strong></div>
                  <div style="font-size: 16px;">Type: <strong class="line-input" style="min-width: 100px; text-align: center;">\${entry.type}</strong></div>
              </div>
              \\\`}
              
              <table>
                  <thead>
                      <tr>
                          <th style="width: 80px; border-left: none;">Sr. No.</th>
                          <th>Particulars</th>
                          <th style="width: 150px; border-right: none;">Amount</th>
                      </tr>
                  </thead>
                  <tbody>
                      \${detailsHtml}
                  </tbody>
              </table>

              <div style="padding: 30px 20px 10px 20px; display: flex; justify-content: space-between; align-items: flex-end;">
                  <div style="font-size: 16px;">Paid By: <span style="text-decoration: underline; font-weight: bold;">\${entry.isSystem && entry.originalTx ? (entry.originalTx.paymentMethod || 'Cash') : 'Cash'}</span></div>
                  <div style="text-align: center;">
                      <div style="border-top: 1px solid #000; width: 200px; padding-top: 5px; font-size: 16px;">Signature of Centre Head</div>
                  </div>
              </div>
              
              <div style="text-align: center; font-size: 12px; margin-top: 10px; border-top: 2px solid #000; padding: 10px;">
                  All above mentioned Amount once paid are non refundable in any case whatsoever.
              </div>
          </div>
      </body>
      </html>
    \`);
    printWindow.document.close();
  };`;

content = content.replace(regex, replacement);

fs.writeFileSync(file, content);
console.log("Rewrite completed");
