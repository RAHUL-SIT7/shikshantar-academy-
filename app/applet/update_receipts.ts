import fs from 'fs';

const files = [
    'src/components/fee_management/SimpleStudentLedgerTab.tsx',
    'src/components/fee_management/RecordPaymentTab.tsx',
    'src/components/fee_management/TransactionHistoryTab.tsx',
];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf-8');

    // For SimpleStudentLedgerTab
    content = content.replace(/<h1 class="school-name">.*?<\/h1>/, `<div style="display: flex; align-items: center; justify-content: center; margin-bottom: 5px;">
                            <img src="https://ui-avatars.com/api/?name=E+S&background=10b981&color=fff&size=100&bold=true" alt="Logo" style="height: 48px; margin-right: 15px; border-radius: 8px;" onerror="this.style.display='none'" />
                            <h1 class="school-name" style="margin: 0; font-size: 24px; font-weight: bold; text-transform: uppercase;">EVEREST ENGLISH SCHOOL</h1>
                        </div>`);
    content = content.replace(/<p class="school-addr">.*?<\/p>/, `<p class="school-addr" style="text-align: center; color: #666; font-size: 14px; margin: 4px 0 0 0;">Biratnagar, Province 1, Nepal | Phone: 021-512345</p>`);

    // For RecordPaymentTab and TransactionHistoryTab
    content = content.replace(/<h1 style="[^"]*">SHIKSHANTAR ACADEMY<\/h1>/i, `<h1 style="margin: 0 0 5px 0; font-size: 32px; font-weight: bold; font-family: Arial, sans-serif; letter-spacing: 1px;">EVEREST ENGLISH SCHOOL</h1>`);
    content = content.replace(/<p style="[^"]*">Siraha, Nepal<\/p>/i, `<p style="margin: 2px 0; font-size: 16px;">Biratnagar, Province 1, Nepal</p>`);
    content = content.replace(/<p style="[^"]*">Website: https:\/\/shikshantar.*?<\/p>/i, `<p style="margin: 2px 0; font-size: 14px;">Website: www.everest.edu.np</p>`);
    content = content.replace(/<p style="[^"]*">Contact: 01-1234567.*?<\/p>/i, `<p style="margin: 2px 0; font-size: 14px;">Contact: 021-512345 &nbsp; Email: info@everest.edu.np</p>`);
    
    // Also inject logo in RecordPayment/TransactionHistory
    content = content.replace(/<img src="https:\/\/i.postimg.cc\/SxGS5WxY\/logo.png".*?\/>/i, `<img src="https://ui-avatars.com/api/?name=E+S&background=fef08a&color=000&size=120&bold=true" alt="Logo" style="position: absolute; left: 20px; top: 15px; width: 60px; height: 60px; object-fit: contain; border: 1px solid #000;" onerror="this.style.display='none'" />`);

    fs.writeFileSync(file, content);
});

console.log("Updated specific receipts");
