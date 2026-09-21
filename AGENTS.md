# Project Custom Instructions & Guidelines

## Universal Standard for All PDF & Printable Documents

Whenever generating, exporting, or printing any document (receipts, bills, ledgers, fee structures, result cards, salary slips, audit reports, or certificates):

1. **Mandatory Header Elements**:
   - **School Logo**: Always embed the official school logo (using `getSchoolLogoBase64()` from `src/lib/logoHelper.ts`). Provide crisp white circular or neutral backing if placed over colored banners.
   - **School Name**: Prominently display `SHIKSHANTAR ACADEMY` in bold display styling.
   - **School Institutional Details**:
     - Address: `Bastipur, Karjanha-05, Siraha, Nepal`
     - Registration: `Regd: 1482/071`
     - Phone: `+977 9709867048, +977 9807790805`
     - Email: `academyshikshantar@gmail.com`

2. **Professional Structure & Required Information Hierarchy**:
   - **Document Classification Badge**: Explicit document title (e.g., `OFFICIAL PHYSICAL CASH RECEIPT`, `REMIT FEE BILL`, `STUDENT LEDGER AUDIT STATEMENT`).
   - **Metadata Row**: Document/Receipt No, Issue Date (in both Nepali BS and English AD formats), Academic Year, and Session.
   - **Target Subject Profile**: Student/Employee Name, Student ID/Ref, Class & Roll No, and Guardian Information.
   - **Detailed Financial / Data Matrix**: Itemized breakdown table (base tuition, additional charges, approved discounts/scholarships, net payable, paid amount, remaining balance, and advance allocations).
   - **Verifiable Legal Signatures & Seal**: Cashier/Accountant signature line, official School Seal/Stamp placeholder or watermark, and Parent/Guardian signature line.
   - **Watermark**: Faint centered watermark (`opacity: 0.04 - 0.05`) of the school crest on bills and receipts.
