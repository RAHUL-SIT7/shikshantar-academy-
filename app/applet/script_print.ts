import fs from 'fs';

let content = fs.readFileSync('src/components/fee_management/CashLedgerTab.tsx', 'utf-8');

const printCode = `  const handlePrintReceipt = (entry: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let detailsHtml = '';
    
    if (entry.isSystem && entry.originalTx) {
       const tx = entry.originalTx;
       detailsHtml = \\\`
          <table class="table">
              <thead>
                  <tr>
                      <th>Description</th>
                      <th style="text-align: right;">Amount</th>
                  </tr>
              </thead>
              <tbody>
       \\\`;
       
       if (tx.breakdown) {
          if (tx.breakdown.tuition) {
              detailsHtml += \\\`<tr><td>Tuition Fee (\\\${tx.breakdown.months?.join(', ') || ''})</td><td style="text-align: right;">रू \\\${Number(tx.breakdown.tuition * (tx.breakdown.months?.length || 1)).toLocaleString()}</td></tr>\\\`;
          }
          if (tx.breakdown.additional && tx.breakdown.additional.length > 0) {
              tx.breakdown.additional.forEach((add: any) => {
                  detailsHtml += \\\`<tr><td>\\\${add.name || add.type}</td><td style="text-align: right;">रू \\\${Number(add.amount).toLocaleString()}</td></tr>\\\`;
              });
          }
       } else if (tx.receiptMonthsData) {
          tx.receiptMonthsData.forEach((m: any) => {
              detailsHtml += \\\`<tr><td colspan="2" style="font-weight: bold; background: #fdfdfd; padding: 8px 12px; font-size: 13px;">Month: \\\${m.month}</td></tr>\\\`;
              if (m.tuition) detailsHtml += \\\`<tr><td style="padding-left: 20px;">Tuition Fee</td><td style="text-align: right;">रू \\\${Number(m.tuition).toLocaleString()}</td></tr>\\\`;
              if (m.computer) detailsHtml += \\\`<tr><td style="padding-left: 20px;">Computer Fee</td><td style="text-align: right;">रू \\\${Number(m.computer).toLocaleString()}</td></tr>\\\`;
              if (m.exam) detailsHtml += \\\`<tr><td style="padding-left: 20px;">Exam Fee</td><td style="text-align: right;">रू \\\${Number(m.exam).toLocaleString()}</td></tr>\\\`;
              if (m.other) detailsHtml += \\\`<tr><td style="padding-left: 20px;">Other Fee</td><td style="text-align: right;">रू \\\${Number(m.other).toLocaleString()}</td></tr>\\\`;
          });
          if (tx.otherFees && tx.otherFees.length > 0) {
              tx.otherFees.forEach((add: any) => {
                  detailsHtml += \\\`<tr><td>\\\${add.name}</td><td style="text-align: right;">रू \\\${Number(add.amount).toLocaleString()}</td></tr>\\\`;
              });
          }
          if (tx.discount) {
              detailsHtml += \\\`<tr><td>Discount</td><td style="text-align: right;">- रू \\\${Number(tx.discount).toLocaleString()}</td></tr>\\\`;
          }
       } else {
          detailsHtml += \\\`<tr><td>Fee Collection (\\\${tx.months?.join(', ') || ''})</td><td style="text-align: right;">रू \\\${Number(tx.amount).toLocaleString()}</td></tr>\\\`;
       }
       
       detailsHtml += \\\`
                  <tr class="total-row">
                      <td style="text-align: right; text-transform: uppercase;">Total Received</td>
                      <td style="text-align: right;">रू \\\${Number(tx.amount).toLocaleString()}</td>
                  </tr>
              </tbody>
          </table>
       \\\`;
    } else {
       detailsHtml = \\\`
          <table class="table">
              <thead>
                  <tr>
                      <th>Category</th>
                      <th>Remarks</th>
                      <th style="text-align: right;">Amount</th>
                  </tr>
              </thead>
              <tbody>
                  <tr>
                      <td>\\\${entry.category || '-'}</td>
                      <td>\\\${entry.remarks || '-'}</td>
                      <td style="text-align: right;">रू \\\${Number(entry.amount).toLocaleString()}</td>
                  </tr>
                  <tr class="total-row">
                      <td colspan="2" style="text-align: right; text-transform: uppercase;">Total</td>
                      <td style="text-align: right;">रू \\\${Number(entry.amount).toLocaleString()}</td>
                  </tr>
              </tbody>
          </table>
       \\\`;
    }

    printWindow.document.write(\\\`
      <html>
      <head>
          <title>Receipt - \\\${entry.id || 'CASH'}</title>
          <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
              .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 30px; }
              .school-name { font-size: 26px; font-weight: bold; margin: 0 0 5px 0; color: #111; text-transform: uppercase; letter-spacing: 1px; }
              .school-address { font-size: 14px; color: #555; margin: 0 0 2px 0; }
              .receipt-title { font-size: 16px; color: #666; font-weight: bold; margin: 15px 0 0 0; text-transform: uppercase; letter-spacing: 2px; }
              .details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
              .details-box { background: #fdfdfd; border: 1px solid #eaeaea; padding: 15px; border-radius: 8px; }
              .details p { margin: 5px 0; font-size: 14px; }
              .details strong { color: #555; display: inline-block; width: 100px; }
              .table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
              .table th { background: #f8f9fa; border-bottom: 2px solid #eee; text-align: left; padding: 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #555; }
              .table td { padding: 12px; border-bottom: 1px solid #eee; font-size: 14px; }
              .total-row { font-weight: bold; font-size: 16px; background: #f8f9fa; }
              .total-row td { border-top: 2px solid #333; }
              .footer { margin-top: 50px; display: flex; justify-content: space-between; align-items: flex-end; }
              .signature { border-top: 1px solid #ccc; width: 200px; text-align: center; padding-top: 5px; font-size: 12px; font-weight: bold; color: #666; text-transform: uppercase; }
              .thank-you { font-size: 14px; color: #666; font-style: italic; }
              .type-badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #fff; }
              .type-Income { background: #10b981; }
              .type-Expense { background: #ef4444; }
          </style>
      </head>
      <body>
          <div class="header">
              <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
                  <img src="https://ui-avatars.com/api/?name=E+S&background=10b981&color=fff&size=100&bold=true" alt="Logo" style="height: 60px; margin-right: 15px; border-radius: 8px;" onerror="this.style.display='none'" />
                  <div style="text-align: left;">
                      <h1 class="school-name">EVEREST ENGLISH SCHOOL</h1>
                      <p class="school-address">Biratnagar, Province 1, Nepal</p>
                      <p class="school-address">Phone: 021-512345 | Email: info@everest.edu.np</p>
                  </div>
              </div>
              <h2 class="receipt-title">\\\${entry.isSystem ? 'FEE RECEIPT' : 'CASH / DAY BOOK VOUCHER'}</h2>
          </div>
          <div class="details">
              <div class="details-box">
                  <p><strong>Date (B.S.):</strong> \\\${entry.date}</p>
                  <p><strong>Voucher No:</strong> \\\${entry.isSystem ? (entry.originalTx?.receipt || entry.id?.substring(0,8).toUpperCase()) : (entry.id ? entry.id.substring(0,8).toUpperCase() : \\\`CASH-\\\${Date.now().toString().slice(-4)}\\\`)}</p>
                  \\\${(entry.isSystem && entry.originalTx) ? \\\`<p><strong>Student:</strong> \\\${entry.originalTx.studentName}</p>\\\` : ''}
                  \\\${(entry.isSystem && entry.originalTx) ? \\\`<p><strong>Class:</strong> \\\${entry.originalTx.class}</p>\\\` : ''}
              </div>
              <div class="details-box" style="text-align: right;">
                  <span class="type-badge type-\\\${entry.type}">\\\${entry.type}</span>
              </div>
          </div>
          \\\${detailsHtml}
          <div class="footer">
              <div class="thank-you">System Generated Receipt</div>
              <div class="signature">Authorized Signature</div>
          </div>
          <script>
             window.onload = function() { window.print(); }
          </script>
      </body>
      </html>
    \\\`);
    printWindow.document.close();
  };`;

content = content.replace(/ *const handlePrintReceipt = \(entry: any\) => \{[\s\S]*?printWindow\.document\.close\(\);\n *  \};/m, printCode);
content = content.replace(/isSystem: true\n *\}\)/g, 'isSystem: true,\n      originalTx: tx\n    })');

fs.writeFileSync('src/components/fee_management/CashLedgerTab.tsx', content);
