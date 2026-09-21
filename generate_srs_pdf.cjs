const { jsPDF } = require('jspdf');
const autoTableModule = require('jspdf-autotable');
const autoTable = autoTableModule.default || autoTableModule;
const fs = require('fs');
const path = require('path');

// Initialize A4 Document (210 x 297 mm)
const doc = new jsPDF({
  orientation: 'portrait',
  unit: 'mm',
  format: 'a4',
});

const pageWidth = doc.internal.pageSize.getWidth();
const pageHeight = doc.internal.pageSize.getHeight();
const margin = 14;
const contentWidth = pageWidth - (margin * 2);

// Load logo if available
let logoBase64 = null;
const logoPaths = [
  path.join(__dirname, 'public', 'logo.png'),
  path.join(__dirname, 'src', 'assets', 'logo.png'),
];
for (const lp of logoPaths) {
  if (fs.existsSync(lp)) {
    try {
      const bitmap = fs.readFileSync(lp);
      logoBase64 = `data:image/png;base64,${bitmap.toString('base64')}`;
      break;
    } catch (e) {
      console.warn('Could not read logo from', lp);
    }
  }
}

// Styling Constants
const NAVY = [10, 61, 98]; // #0A3D62
const GOLD = [217, 119, 6]; // #D97706
const SLATE_DARK = [30, 41, 59]; // #1E293B
const SLATE_MUTED = [100, 116, 139]; // #64748B
const LIGHT_BG = [248, 250, 252]; // #F8FAFC
const BORDER_GRAY = [226, 232, 240];

let currentY = 0;

// Header on subsequent pages
const renderPageHeader = (pageNumber) => {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 5, 'F');
  
  if (pageNumber > 1) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_MUTED);
    doc.text('Shikshantar Academy — Software Requirements Specification (SRS) | SAMS ERP', margin, 10);
    doc.setDrawColor(...BORDER_GRAY);
    doc.setLineWidth(0.2);
    doc.line(margin, 12, pageWidth - margin, 12);
  }
};

// Footer on all pages
const renderPageFooter = (pageNumber, totalPages) => {
  doc.setDrawColor(...BORDER_GRAY);
  doc.setLineWidth(0.2);
  doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_MUTED);
  doc.text('Confidential & Academic Use — Department of Computer Science & Engineering', margin, pageHeight - 7);
  doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
};

// Section Heading Helper
const addSectionHeading = (title, level = 1) => {
  const neededHeight = level === 1 ? 16 : 12;
  if (currentY + neededHeight > pageHeight - 20) {
    doc.addPage();
    currentY = 18;
  }

  if (level === 1) {
    currentY += 4;
    doc.setFillColor(...LIGHT_BG);
    doc.rect(margin, currentY, contentWidth, 8, 'F');
    doc.setFillColor(...NAVY);
    doc.rect(margin, currentY, 3, 8, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text(title, margin + 6, currentY + 5.5);
    currentY += 12;
  } else if (level === 2) {
    currentY += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...SLATE_DARK);
    doc.text(title, margin, currentY + 4);
    currentY += 8;
  }
};

// Paragraph Helper with auto-wrap
const addParagraph = (text, spacing = 4) => {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_DARK);

  const lines = doc.splitTextToSize(text, contentWidth);
  const blockHeight = lines.length * 4.2;

  if (currentY + blockHeight > pageHeight - 20) {
    doc.addPage();
    currentY = 18;
  }

  doc.text(lines, margin, currentY);
  currentY += blockHeight + spacing;
};

// Key-Value Row Helper
const addBullet = (label, text) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_DARK);
  
  const bulletPrefix = '• ' + label + ': ';
  const fullText = bulletPrefix + text;
  const lines = doc.splitTextToSize(fullText, contentWidth - 4);
  const blockHeight = lines.length * 4.2;

  if (currentY + blockHeight > pageHeight - 20) {
    doc.addPage();
    currentY = 18;
  }

  doc.setFont('helvetica', 'bold');
  doc.text('• ' + label + ':', margin + 2, currentY);
  const labelWidth = doc.getTextWidth('• ' + label + ': ');

  doc.setFont('helvetica', 'normal');
  const remainingTextLines = doc.splitTextToSize(text, contentWidth - 4 - labelWidth);
  if (remainingTextLines.length === 1) {
    doc.text(text, margin + 2 + labelWidth, currentY);
    currentY += 4.5;
  } else {
    // If it wraps, draw full wrapped text cleanly
    const wrappedLines = doc.splitTextToSize(label + ': ' + text, contentWidth - 6);
    doc.setFont('helvetica', 'normal');
    doc.text(wrappedLines, margin + 6, currentY);
    doc.setFont('helvetica', 'bold');
    doc.text('•', margin + 2, currentY);
    currentY += (wrappedLines.length * 4.2) + 2;
  }
};

// ==========================================
// PAGE 1: TITLE PAGE & METADATA
// ==========================================
renderPageHeader(1);

// Top Decorative Banner
doc.setFillColor(...NAVY);
doc.rect(margin, 12, contentWidth, 36, 'F');

if (logoBase64) {
  try {
    doc.addImage(logoBase64, 'PNG', margin + 6, 16, 28, 28);
  } catch (e) {
    console.warn('Error rendering logo on cover', e);
  }
}

doc.setFont('helvetica', 'bold');
doc.setFontSize(16);
doc.setTextColor(255, 255, 255);
doc.text('SHIKSHANTAR ACADEMY SECONDARY SCHOOL', margin + (logoBase64 ? 38 : 6), 24);

doc.setFont('helvetica', 'normal');
doc.setFontSize(9);
doc.setTextColor(226, 232, 240);
doc.text('Bastipur, Karjanha-05, Siraha, Madhesh Province, Nepal | Estd: 2072 B.S.', margin + (logoBase64 ? 38 : 6), 30);
doc.text('Affiliated to National Examinations Board (NEB) & Ministry of Education, Nepal', margin + (logoBase64 ? 38 : 6), 35);
doc.text('Phone: +977 9807790805, +977 9709867048 | Email: shikshantaracademy@gmail.com', margin + (logoBase64 ? 38 : 6), 40);

currentY = 56;

// Document Title Box
doc.setFillColor(...LIGHT_BG);
doc.setDrawColor(...BORDER_GRAY);
doc.roundedRect(margin, currentY, contentWidth, 26, 2, 2, 'FD');

doc.setFont('helvetica', 'bold');
doc.setFontSize(14);
doc.setTextColor(...NAVY);
doc.text('SOFTWARE REQUIREMENTS SPECIFICATION (SRS)', margin + 6, currentY + 8);

doc.setFont('helvetica', 'normal');
doc.setFontSize(9);
doc.setTextColor(...GOLD);
doc.text('Academic Standard: IEEE 830-1998 Compliant | Field: Computer Science & Engineering (CSE)', margin + 6, currentY + 14);

doc.setFont('helvetica', 'normal');
doc.setFontSize(8.5);
doc.setTextColor(...SLATE_MUTED);
doc.text('System Name: Shikshantar Academy School Management & Cash Accounting System (SAMS)', margin + 6, currentY + 20);

currentY += 32;

// Document Metadata Card
autoTable(doc, {
  startY: currentY,
  head: [['Specification Attribute', 'Project Implementation Detail']],
  body: [
    ['System Title', 'Shikshantar Academy School Management System (SAMS)'],
    ['Architecture', 'Single-Page Application (SPA) with Cloud-Native Reactive Datastore'],
    ['Front-End Technology', 'React 18, TypeScript, Tailwind CSS, Vite, jsPDF, Lucide Icons'],
    ['Back-End & Database', 'Google Cloud Firestore (NoSQL Document Database), Firebase Auth'],
    ['Target Academic Year', 'Session 2083 B.S. (Bikram Sambat) & 2026-2027 A.D.'],
    ['Primary Domain', 'Physical Cash Desk Accounting, Student Ledgers, Batch Invoicing, RBAC'],
    ['Prepared For', 'Senior School Management, CSE Academic Reviewers, Systems Auditors'],
  ],
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, textColor: SLATE_DARK },
  headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
  columnStyles: {
    0: { cellWidth: 50, fontStyle: 'bold', fillColor: [241, 245, 249] },
    1: { cellWidth: contentWidth - 50 },
  },
  margin: { left: margin, right: margin },
});

currentY = doc.lastAutoTable.finalY + 6;

// 1. INTRODUCTION
addSectionHeading('1. INTRODUCTION & SYSTEM OVERVIEW', 1);
addParagraph('The Shikshantar Academy School Management System (SAMS) is an institutional ERP tailored specifically to the operational, economic, and regulatory needs of schooling in Nepal. Operating on a dual calendar system (Bikram Sambat B.S. and Gregorian A.D.), SAMS bridges traditional paper-based ledger registers (Khatas) with high-integrity digital ledger tracking.');
addBullet('Purpose', 'Establish definitive functional, structural, and security constraints for academic management and physical cash desk operations.');
addBullet('Scope', 'Encompasses Master Fee Tariffs, Monthly Batch Billing, Counter Cash Desk, Student Ledger Accounts, Daily Reversal Registers, and Immutable Forensic Audit Trails.');
addBullet('Target Users', 'Super Administrator (Principal), Chief Accountant, Counter Cashier, Faculty Members, Guardians, and Students.');

// ==========================================
// 2. SYSTEM ARCHITECTURE & DESIGN PATTERNS
// ==========================================
addSectionHeading('2. SYSTEM ARCHITECTURE & CSE DESIGN PATTERNS', 1);
addParagraph('From a Computer Science & Engineering standpoint, SAMS is structured around modern architectural patterns to ensure high responsiveness, consistency, and zero phantom calculations:');
addBullet('Flux / CQRS Pattern', 'Separates transactional command dispatches (WriteBatch) from reactive query listeners (Firestore onSnapshot). State updates reflect immediately without full page reloads.');
addBullet('Distributed Atomic Transactions', 'Multi-document mutations (such as recording a receipt, marking an invoice paid, and updating student debt) are wrapped inside atomic WriteBatches guaranteeing ACID compliance.');
addBullet('Compensatory Event Sourcing (Undo Engine)', 'Transactions are never destructively dropped or hard-deleted. Corrections are achieved by writing compensatory rollback states and flagging records with isVoid=true, preserving total auditability.');

// ==========================================
// 3. DATABASE ENTITIES & DATA DICTIONARY
// ==========================================
addSectionHeading('3. DATABASE ENTITIES & COLLECTIONS (DATA DICTIONARY)', 1);
addParagraph('The backend uses Google Cloud Firestore organized into normalized collections optimized for relational integrity within a document datastore:');

// Table of Collections Overview
autoTable(doc, {
  startY: currentY,
  head: [['Collection / Table', 'Key Entity Type', 'Primary Key Structure', 'Cardinality & Role']],
  body: [
    ['users', 'Student, Teacher, Staff', 'UID / Student ID', '1:N with transactions and fee records'],
    ['feeStructure', 'Master Tariffs', 'academic_fees (Singleton)', 'Defines class-wise tuition, bus routes, lab fees'],
    ['studentFees', 'Monthly Invoices', '{studentId}_{nepaliMonth}', 'Holds monthly billed dues, arrears, and paid status'],
    ['feeTransactions', 'Cash Receipts', 'REC-{Year}-{Serial}', 'Represents physical cash intake at the desk'],
    ['feeAuditLogs', 'Forensic Audit Trail', 'UUID (Immutable)', 'Captures who mutated what, timestamp, and diff snapshot'],
    ['expenses', 'Outflow Vouchers', 'EXP-{UUID}', 'Tracks cash disbursements from counter drawer'],
  ],
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, textColor: SLATE_DARK },
  headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
  columnStyles: {
    0: { cellWidth: 35, fontStyle: 'bold' },
    1: { cellWidth: 35 },
    2: { cellWidth: 45 },
    3: { cellWidth: contentWidth - 115 },
  },
  margin: { left: margin, right: margin },
});

currentY = doc.lastAutoTable.finalY + 6;

// Entity Detail: users
addSectionHeading('3.1 Collection Schema: users (Students & Staff)', 2);
autoTable(doc, {
  startY: currentY,
  head: [['Field Name', 'Type', 'Null / Req', 'Description & Business Constraint']],
  body: [
    ['id', 'string', 'Required', 'Primary Key: Firebase Auth UID or Custom Roll/Registration ID'],
    ['name', 'string', 'Required', 'Full legal name of the student or faculty member'],
    ['role', 'enum', 'Required', 'Access tier: "admin" | "accountant" | "teacher" | "student"'],
    ['class / studentClass', 'string', 'Optional', 'Academic grade (e.g., "PG", "Nursery", "Class 1" to "Class 10")'],
    ['rollNo', 'string', 'Optional', 'Assigned class roll number'],
    ['monthlyFee', 'number', 'Required', 'Base monthly tuition assigned to the student (synced from tariff)'],
    ['busStop', 'string', 'Optional', 'Assigned route station (e.g., "Mirchaiya", "Bastipur")'],
    ['transportFee', 'number', 'Optional', 'Monthly bus fare mapped from transportation structure'],
    ['scholarshipStatus', 'string', 'Optional', '"None" | "Provided" - indicates fee concession status'],
    ['scholarshipAmount', 'number', 'Optional', 'Concession value in NRs or percentage concession'],
    ['guardianPhone', 'string', 'Optional', '10-digit mobile contact number for SMS receipts'],
  ],
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.8, textColor: SLATE_DARK },
  headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
  margin: { left: margin, right: margin },
});

currentY = doc.lastAutoTable.finalY + 6;

// Entity Detail: feeTransactions
addSectionHeading('3.2 Collection Schema: feeTransactions (Cash Receipts)', 2);
autoTable(doc, {
  startY: currentY,
  head: [['Field Name', 'Type', 'Null / Req', 'Description & Financial Purpose']],
  body: [
    ['id', 'string', 'Required', 'Receipt Serial (e.g., "REC-2083-0491") with auto-increment guarantee'],
    ['studentId', 'string', 'Required', 'Foreign Key referencing users.id'],
    ['studentName', 'string', 'Required', 'Snapshot of student name at time of payment'],
    ['class', 'string', 'Required', 'Student grade level at transaction time'],
    ['amountPaid', 'number', 'Required', 'Net cash received (> 0) entered into school drawer'],
    ['cashTendered', 'number', 'Required', 'Physical currency note value handed by parent (>= amountPaid)'],
    ['changeReturned', 'number', 'Required', 'Computed: cashTendered - amountPaid'],
    ['khataPageNo', 'string', 'Optional', 'Cross-reference page number in physical paper registry book'],
    ['manualSlipNo', 'string', 'Optional', 'Serial number of manual carbon paper slip book'],
    ['cashierId', 'string', 'Required', 'Authenticated UID of counter operator'],
    ['nepaliDate', 'string', 'Required', 'Bikram Sambat transaction date (e.g., "2083-02-15")'],
    ['isVoid', 'boolean', 'Required', 'Default false; flagged true if reversed via Undo Log'],
    ['reversalReason', 'string', 'Nullable', 'Mandatory explanation string if receipt is voided'],
  ],
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.8, textColor: SLATE_DARK },
  headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
  margin: { left: margin, right: margin },
});

currentY = doc.lastAutoTable.finalY + 6;

// Entity Detail: studentFees & feeAuditLogs
addSectionHeading('3.3 Collection Schema: studentFees (Invoices) & feeAuditLogs', 2);
autoTable(doc, {
  startY: currentY,
  head: [['Collection', 'Field', 'Type', 'Constraint / Validation Rule']],
  body: [
    ['studentFees', 'id', 'string', 'Compound Key: {studentId}_{nepaliMonth}'],
    ['studentFees', 'totalFee', 'number', 'Tuition + Bus + Exam + Lab - Scholarship + Past Arrears'],
    ['studentFees', 'paidAmount', 'number', 'Accumulated payments towards this bill; cannot exceed totalFee'],
    ['studentFees', 'status', 'enum', '"due" (0 paid), "partial" (partially settled), "paid" (fully settled)'],
    ['feeAuditLogs', 'id', 'string', 'Primary Key: UUIDv4'],
    ['feeAuditLogs', 'eventType', 'enum', '"RECEIPT_ISSUED" | "RECEIPT_VOIDED" | "BASE_FEE_SYNCED" | "DISCOUNT"'],
    ['feeAuditLogs', 'actorUid', 'string', 'UID of authenticated operator performing mutation'],
    ['feeAuditLogs', 'previousState', 'map', 'Deep JSON copy of document state prior to mutation'],
    ['feeAuditLogs', 'newState', 'map', 'Deep JSON copy of document state after mutation'],
  ],
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.8, textColor: SLATE_DARK },
  headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
  margin: { left: margin, right: margin },
});

currentY = doc.lastAutoTable.finalY + 6;

// ==========================================
// 4. FUNCTIONAL REQUIREMENTS (FR)
// ==========================================
addSectionHeading('4. DETAILED FUNCTIONAL REQUIREMENTS (FR)', 1);

addParagraph('Functional requirements define the core operational tasks executed by the system:');

autoTable(doc, {
  startY: currentY,
  head: [['Req ID', 'Module / Component', 'Functional Requirement Statement & Acceptance Standard']],
  body: [
    ['FR-1.1', 'Master Fee Tariffs', 'System shall enable Super Admins to configure class-wise tuition, admission, exam, and computer fees across all levels (Playgroup to Class 10).'],
    ['FR-1.2', 'Route Management', 'System shall maintain zone-wise bus tariffs mapped to pickup stops.'],
    ['FR-1.3', 'Base Fee Sync', 'Clicking "Sync Base Fees" shall batch-update all student profile records with updated class tuition rates using atomic Firestore commits.'],
    ['FR-1.4', 'Official Tariff PDF', 'System shall generate print-ready official PDF documents featuring the school crest logo, board affiliations, and authorized signature lines.'],
    ['FR-2.1', 'Remit Invoicing', 'System shall execute batch billing for selected Nepali months, computing dues using tuition, transport, exam fees, and rolling forward unpaid arrears.'],
    ['FR-2.2', 'Concession Engine', 'Invoicing engine must subtract approved scholarship percentages or fixed amounts before computing net monthly due.'],
    ['FR-3.1', 'Cash Desk Search', 'Cashier can locate student by typing Roll, Name, or Grade in < 300ms.'],
    ['FR-3.2', 'Change Calculation', 'System calculates exact change return: Change = Tendered - Paid, blocking negative change.'],
    ['FR-3.3', 'Khata Linking', 'Mandates entry of physical ledger book page number and manual receipt serial.'],
    ['FR-3.4', 'Dual-Copy Receipts', 'Renders dual copies (Student + Accounts) with amount in words in Nepalese Rupees.'],
    ['FR-4.1', 'Student Ledger', 'Dynamically aggregates debits (billed) and credits (paid) with running balances.'],
    ['FR-5.1', 'Undo Engine', 'Allows authorized reversal of erroneous entries, marking records as isVoid=true, restoring student debt, and recording an immutable audit log.'],
    ['FR-6.1', 'Top Executive Bar', 'Displays real-time Inflow (Gross Receipts), Outflow (Expenses), and Net Cash in Counter.'],
  ],
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2, textColor: SLATE_DARK },
  headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
  columnStyles: {
    0: { cellWidth: 16, fontStyle: 'bold' },
    1: { cellWidth: 36, fontStyle: 'bold' },
    2: { cellWidth: contentWidth - 52 },
  },
  margin: { left: margin, right: margin },
});

currentY = doc.lastAutoTable.finalY + 6;

// ==========================================
// 5. NON-FUNCTIONAL REQUIREMENTS (NFR)
// ==========================================
addSectionHeading('5. NON-FUNCTIONAL REQUIREMENTS (NFR)', 1);

autoTable(doc, {
  startY: currentY,
  head: [['NFR Category', 'Standard Metric', 'Detailed Implementation Requirement']],
  body: [
    ['Data Integrity', 'ACID Compliance', 'All multi-table balance mutations MUST execute via Firestore WriteBatches; no partial state mutations permitted.'],
    ['Auditability', 'Non-Destructive DB', 'Zero hard deletes permitted on financial collections. Voided transactions retain complete forensic history.'],
    ['Performance', '< 300 ms Lookup', 'Student search and balance retrieval complete in under 300 ms over standard 4G/broadband connection.'],
    ['Throughput', '500 students / 5s', 'Batch invoice generation processes at least 100 students per second via chunked batch writes.'],
    ['Client Speed', '< 1.5s PDF Render', 'Official fee charts and dual-copy receipts generate entirely client-side via jsPDF with zero server CPU overhead.'],
    ['Security', 'RBAC & Firestore Rules', 'Granular Firestore security rules restrict tariff edits to Admins and deny write operations on audit logs.'],
    ['Localization', 'Dual Calendar (B.S. & A.D.)', 'All vouchers, daybooks, and reports display both Bikram Sambat and Gregorian dates alongside Nepalese currency formatting.'],
    ['Fault Tolerance', 'Offline Persistence', 'Firestore offline persistence enabled to prevent data loss during momentary network disconnects.'],
  ],
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2, textColor: SLATE_DARK },
  headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
  columnStyles: {
    0: { cellWidth: 28, fontStyle: 'bold' },
    1: { cellWidth: 38, fontStyle: 'bold' },
    2: { cellWidth: contentWidth - 66 },
  },
  margin: { left: margin, right: margin },
});

currentY = doc.lastAutoTable.finalY + 8;

// ==========================================
// 6. VERIFICATION & VALIDATION TRACEABILITY MATRIX
// ==========================================
addSectionHeading('6. VERIFICATION & VALIDATION TRACEABILITY MATRIX', 1);

autoTable(doc, {
  startY: currentY,
  head: [['Req ID', 'Target Module', 'Testing Methodology', 'Verification Criteria & Expected Outcome']],
  body: [
    ['FR-1.3', 'Fee Tariff', 'Integration Test', 'Altering Class 1 fee and executing Sync Base Fees updates all matching student user records.'],
    ['FR-2.1', 'Remit Invoicing', 'Unit Calculation Test', 'Generating Jestha invoice accurately calculates Tuition + Bus - Concession + Past Arrears.'],
    ['FR-3.2', 'Cash Counter', 'Boundary Analysis', 'Entering cash tendered < amount paid disables submit button and alerts cashier.'],
    ['FR-3.4', 'Receipt Engine', 'Visual & Print Audit', 'Receipt correctly outputs words (e.g., "NRs. Three Thousand Five Hundred Only") with dual copies.'],
    ['FR-5.1', 'Undo Engine', 'Negative / Regression Test', 'Reversing a transaction restores student debt, flags isVoid=true, and updates Top Executive Bar.'],
    ['NFR-1.1', 'Core Database', 'Network Interruption Test', 'Simulating dropped connection mid-batch results in clean rollback without orphaned rows.'],
  ],
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2, textColor: SLATE_DARK },
  headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
  columnStyles: {
    0: { cellWidth: 16, fontStyle: 'bold' },
    1: { cellWidth: 28, fontStyle: 'bold' },
    2: { cellWidth: 38 },
    3: { cellWidth: contentWidth - 82 },
  },
  margin: { left: margin, right: margin },
});

currentY = doc.lastAutoTable.finalY + 10;

// Signatory Block
if (currentY + 25 > pageHeight - 20) {
  doc.addPage();
  currentY = 20;
}

doc.setFont('helvetica', 'bold');
doc.setFontSize(9);
doc.setTextColor(...NAVY);
doc.text('DOCUMENT APPROVAL & SIGN-OFF', margin, currentY);
currentY += 12;

const sigColWidth = contentWidth / 3;
doc.setDrawColor(...BORDER_GRAY);
doc.setLineWidth(0.3);

// Sig 1
doc.line(margin + 5, currentY, margin + sigColWidth - 10, currentY);
doc.setFont('helvetica', 'normal');
doc.setFontSize(8);
doc.setTextColor(...SLATE_DARK);
doc.text('Prepared By (CSE Analyst)', margin + 12, currentY + 4);

// Sig 2
doc.line(margin + sigColWidth + 5, currentY, margin + (sigColWidth * 2) - 10, currentY);
doc.text('Reviewed By (Chief Accountant)', margin + sigColWidth + 10, currentY + 4);

// Sig 3
doc.line(margin + (sigColWidth * 2) + 5, currentY, margin + contentWidth - 10, currentY);
doc.text('Approved By (Principal / Admin)', margin + (sigColWidth * 2) + 12, currentY + 4);

// ==========================================
// POST-PROCESSING: FOOTERS ON ALL PAGES
// ==========================================
const totalPages = doc.internal.getNumberOfPages();
for (let i = 1; i <= totalPages; i++) {
  doc.setPage(i);
  renderPageHeader(i);
  renderPageFooter(i, totalPages);
}

// Write PDF to disk
const outDir = path.join(__dirname, 'public');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const outPath = path.join(outDir, 'Shikshantar_Academy_SAMS_SRS_Document.pdf');
const arrayBuf = doc.output('arraybuffer');
fs.writeFileSync(outPath, Buffer.from(arrayBuf));

// Also copy to dist if dist exists
const distPath = path.join(__dirname, 'dist', 'Shikshantar_Academy_SAMS_SRS_Document.pdf');
if (fs.existsSync(path.join(__dirname, 'dist'))) {
  fs.writeFileSync(distPath, Buffer.from(arrayBuf));
}

console.log(`SRS PDF successfully generated at: ${outPath}`);
console.log(`Total Pages: ${totalPages}, File Size: ${fs.statSync(outPath).size} bytes`);
