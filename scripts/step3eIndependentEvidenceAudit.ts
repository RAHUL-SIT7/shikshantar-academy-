import * as fs from 'fs';
import * as path from 'path';
import { 
  formatDocumentNumber, 
  parseDocumentNumber, 
  extractBSYear,
  FinancialDocumentType 
} from '../src/lib/documentNumberingEngine';
import { calculatePaymentBreakdown } from '../src/lib/cashPaymentEngine';

interface FreshTestResult {
  testId: string;
  testName: string;
  testType: 'PURE UNIT TEST' | 'STATIC CODE INSPECTION' | 'PROPERTY TEST' | 'NOT TESTABLE WITHOUT LIVE AUTH';
  productionCodeTested: boolean;
  expected: string;
  actual: string;
  evidence: string;
  status: 'PASS' | 'FAIL' | 'NOT EXECUTED';
}

const freshMatrix: FreshTestResult[] = [];

function record(res: FreshTestResult) {
  freshMatrix.push(res);
  console.log(`[${res.status}] (${res.testType}) ${res.testId}: ${res.testName}`);
}

async function runStep3eAudit() {
  console.log('==============================================================================');
  console.log('STEP 3E: INDEPENDENT TEST-EVIDENCE & REALITY AUDIT');
  console.log('==============================================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: Production Document Number Formatting (Pure Unit Test)
  // --------------------------------------------------------------------------
  const t1_701 = formatDocumentNumber('RMT', 2083, 701);
  const t1_702 = formatDocumentNumber('RMT', 2083, 702);
  const t1_703 = formatDocumentNumber('RMT', 2083, 703);
  const t1_rcp = formatDocumentNumber('RCP', 2083, 45);
  const t1_adv = formatDocumentNumber('ADV', 2083, 9);
  const t1_ref = formatDocumentNumber('REF', 2083, 10025);

  const t1Pass = 
    t1_701 === 'RMT-2083-000701' &&
    t1_702 === 'RMT-2083-000702' &&
    t1_703 === 'RMT-2083-000703' &&
    t1_rcp === 'RCP-2083-000045' &&
    t1_adv === 'ADV-2083-000009' &&
    t1_ref === 'REF-2083-010025';

  record({
    testId: 'UNIT-01-FORMATTER',
    testName: 'Production formatDocumentNumber 6-digit zero-padded canonical formatting',
    testType: 'PURE UNIT TEST',
    productionCodeTested: true,
    expected: 'RMT-2083-000701, RMT-2083-000702, RMT-2083-000703, RCP-2083-000045, ADV-2083-000009, REF-2083-010025',
    actual: `${t1_701}, ${t1_702}, ${t1_703}, ${t1_rcp}, ${t1_adv}, ${t1_ref}`,
    evidence: `Called production formatDocumentNumber from src/lib/documentNumberingEngine.ts`,
    status: t1Pass ? 'PASS' : 'FAIL'
  });

  // --------------------------------------------------------------------------
  // TEST 2: Production Document Number Parser (Pure Unit Test)
  // --------------------------------------------------------------------------
  const p1 = parseDocumentNumber('RMT-2083-000701');
  const p2 = parseDocumentNumber('RCP-2084-000005');
  const pInvalid1 = parseDocumentNumber('INVALID-DOC-123');
  const pInvalid2 = parseDocumentNumber('RMT-2083-XYZ');
  const pInvalid3 = parseDocumentNumber('');

  const pPass = 
    p1.isValid && p1.docType === 'RMT' && p1.bsYear === 2083 && p1.sequence === 701 &&
    p2.isValid && p2.docType === 'RCP' && p2.bsYear === 2084 && p2.sequence === 5 &&
    !pInvalid1.isValid && !pInvalid2.isValid && !pInvalid3.isValid;

  record({
    testId: 'UNIT-02-PARSER',
    testName: 'Production parseDocumentNumber validation & decomposition',
    testType: 'PURE UNIT TEST',
    productionCodeTested: true,
    expected: 'Valid for canonical numbers; Invalid for malformed strings',
    actual: `p1 valid=${p1.isValid} seq=${p1.sequence}, p2 valid=${p2.isValid} seq=${p2.sequence}, invalid strings correctly rejected (${!pInvalid1.isValid && !pInvalid2.isValid && !pInvalid3.isValid})`,
    evidence: `Called production parseDocumentNumber from src/lib/documentNumberingEngine.ts`,
    status: pPass ? 'PASS' : 'FAIL'
  });

  // --------------------------------------------------------------------------
  // TEST 3: Production BS Year Extraction (Pure Unit Test)
  // --------------------------------------------------------------------------
  const y1 = extractBSYear('2083-2084 BS');
  const y2 = extractBSYear('2084');
  const y3 = extractBSYear('Session 2081/82');
  const yDefault = extractBSYear(undefined);

  const yPass = y1 === 2083 && y2 === 2084 && y3 === 2081 && typeof yDefault === 'number';

  record({
    testId: 'UNIT-03-YEAR-EXTRACT',
    testName: 'Production extractBSYear from academic year labels',
    testType: 'PURE UNIT TEST',
    productionCodeTested: true,
    expected: '2083, 2084, 2081, fallback to current BS year',
    actual: `y1=${y1}, y2=${y2}, y3=${y3}, yDefault=${yDefault}`,
    evidence: `Called production extractBSYear from src/lib/documentNumberingEngine.ts`,
    status: yPass ? 'PASS' : 'FAIL'
  });

  // --------------------------------------------------------------------------
  // TEST 4: Property-Based Randomized Invariant Testing (1,000 random cases)
  // --------------------------------------------------------------------------
  const docTypes: FinancialDocumentType[] = ['RMT', 'RCP', 'ADV', 'REF', 'REV'];
  let propertyFailures = 0;
  let propertyEvidence = '';

  for (let i = 0; i < 1000; i++) {
    const randomType = docTypes[Math.floor(Math.random() * docTypes.length)];
    const randomYear = 2070 + Math.floor(Math.random() * 30); // 2070 - 2099
    const randomSeq = 1 + Math.floor(Math.random() * 999999);

    const formatted = formatDocumentNumber(randomType, randomYear, randomSeq);
    const parsed = parseDocumentNumber(formatted);

    const isMatch = 
      parsed.isValid &&
      parsed.docType === randomType &&
      parsed.bsYear === randomYear &&
      parsed.sequence === randomSeq &&
      formatted.startsWith(`${randomType}-${randomYear}-`) &&
      formatted.length === randomType.length + 1 + 4 + 1 + 6;

    if (!isMatch) {
      propertyFailures++;
      propertyEvidence = `Failed for ${randomType}, ${randomYear}, ${randomSeq} -> Formatted: ${formatted}`;
      break;
    }
  }

  record({
    testId: 'PROP-01-RANDOM-1000',
    testName: '1,000 Randomized Invariant & Round-trip Decomposition Assertions',
    testType: 'PROPERTY TEST',
    productionCodeTested: true,
    expected: '1,000/1,000 round-trip parses match original inputs with zero character drift',
    actual: propertyFailures === 0 ? '1,000/1,000 Passed with 0 violations' : propertyEvidence,
    evidence: `Executed 1,000 randomized combinations across RMT, RCP, ADV, REF, REV and years 2070-2099`,
    status: propertyFailures === 0 ? 'PASS' : 'FAIL'
  });

  // --------------------------------------------------------------------------
  // TEST 5: Production Cash Payment Breakdown Math (NPR 9,600 Matrix)
  // --------------------------------------------------------------------------
  const tuition = 2800 * 3;
  const transport = 400 * 3;
  const totalDue = tuition + transport; // 9600

  const breakdownPartial = calculatePaymentBreakdown(totalDue, 6000);
  const breakdownExact = calculatePaymentBreakdown(totalDue, 9600);
  const breakdownReturn = calculatePaymentBreakdown(totalDue, 10000, 'RETURN');
  const breakdownAdvance = calculatePaymentBreakdown(totalDue, 10000, 'ADVANCE');

  const mathPass = 
    breakdownPartial.amountApplied === 6000 &&
    breakdownPartial.remainingOutstanding === 3600 &&
    breakdownPartial.isPartial === true &&
    breakdownPartial.changeReturned === 0 &&
    breakdownExact.amountApplied === 9600 &&
    breakdownExact.remainingOutstanding === 0 &&
    breakdownExact.isPartial === false &&
    breakdownReturn.amountApplied === 9600 &&
    breakdownReturn.remainingOutstanding === 0 &&
    breakdownReturn.excessAmount === 400 &&
    breakdownReturn.changeReturned === 400 &&
    breakdownAdvance.amountApplied === 9600 &&
    breakdownAdvance.remainingOutstanding === 0 &&
    breakdownAdvance.excessAmount === 400 &&
    breakdownAdvance.changeReturned === 0;

  record({
    testId: 'UNIT-04-CASH-MATH',
    testName: 'Production calculatePaymentBreakdown NPR 9,600 matrix calculation',
    testType: 'PURE UNIT TEST',
    productionCodeTested: true,
    expected: 'Partial (App: 6000, Out: 3600), Exact (App: 9600, Out: 0), Return (App: 9600, Chg: 400), Advance (App: 9600, Adv: 400)',
    actual: `Partial:[App=${breakdownPartial.amountApplied}, Rem=${breakdownPartial.remainingOutstanding}], Exact:[Rem=${breakdownExact.remainingOutstanding}], Return:[Chg=${breakdownReturn.changeReturned}], Adv:[Adv=${breakdownAdvance.excessAmount}]`,
    evidence: `Called production calculatePaymentBreakdown from src/lib/cashPaymentEngine.ts`,
    status: mathPass ? 'PASS' : 'FAIL'
  });

  // --------------------------------------------------------------------------
  // TEST 6: Codebase Legacy Scan (Static Inspection)
  // --------------------------------------------------------------------------
  const srcDir = path.join(process.cwd(), 'src');
  function scanDir(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        scanDir(fullPath, fileList);
      } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  const allSrcFiles = scanDir(srcDir);
  const financialRegex = /(?:`|')(?:RMT|RCP|ADV|REF|REV)-\$\{Date\.now\(\)/g;
  const matches: { file: string; line: number; text: string }[] = [];

  for (const file of allSrcFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((l, idx) => {
      if (financialRegex.test(l)) {
        matches.push({ file: path.relative(process.cwd(), file), line: idx + 1, text: l.trim() });
      }
    });
  }

  record({
    testId: 'STATIC-01-CODEBASE-SCAN',
    testName: 'Codebase Static AST/Regex Scan for Timestamp Literals in Financial Identifiers',
    testType: 'STATIC CODE INSPECTION',
    productionCodeTested: true,
    expected: '0 occurrences of Date.now() in financial document number strings across all src files',
    actual: `Scanned ${allSrcFiles.length} source files. Found ${matches.length} financial timestamp patterns.`,
    evidence: matches.length === 0 ? 'Zero financial timestamp patterns found' : JSON.stringify(matches),
    status: matches.length === 0 ? 'PASS' : 'FAIL'
  });

  // --------------------------------------------------------------------------
  // TEST 7: Firestore Security Rules Static Inspection
  // --------------------------------------------------------------------------
  const rulesPath = path.join(process.cwd(), 'firestore.rules');
  const rulesText = fs.readFileSync(rulesPath, 'utf-8');

  const hasAdminGuard = rulesText.includes('match /document_sequences/{sequenceId}') && rulesText.includes('allow read, write: if isAdmin();');
  const hasRemitAdmin = rulesText.includes('match /remitBills/{billId}') && rulesText.includes('allow write: if isAdmin();');
  const hasTeacherBlock = rulesText.includes('!isTeacher()');
  const hasStudentIsolation = rulesText.includes('isStudentOwner(resource.data.get(\'studentId\', \'\'))');

  const rulesPass = hasAdminGuard && hasRemitAdmin && hasTeacherBlock && hasStudentIsolation;

  record({
    testId: 'STATIC-02-SECURITY-RULES',
    testName: 'Static Security Rules AST/Clause Verification in firestore.rules',
    testType: 'STATIC CODE INSPECTION',
    productionCodeTested: true,
    expected: 'isAdmin() on document_sequences & remitBills write, !isTeacher() gate, isStudentOwner() isolation',
    actual: `SeqAdmin=${hasAdminGuard}, RemitAdmin=${hasRemitAdmin}, TeacherBlock=${hasTeacherBlock}, StudentIsolation=${hasStudentIsolation}`,
    evidence: `Verified firestore.rules clauses directly from file system`,
    status: rulesPass ? 'PASS' : 'FAIL'
  });

  console.log('\n==============================================================================');
  console.log('STEP 3E AUDIT SUMMARY');
  console.log('==============================================================================\n');

  const total = freshMatrix.length;
  const passed = freshMatrix.filter(m => m.status === 'PASS').length;
  const failed = freshMatrix.filter(m => m.status === 'FAIL').length;

  console.log(`TOTAL FRESH VERIFIED TESTS: ${total}`);
  console.log(`PASSED:                      ${passed}`);
  console.log(`FAILED:                      ${failed}\n`);

  fs.writeFileSync(
    path.join(process.cwd(), 'step3e_independent_audit_evidence.json'),
    JSON.stringify(freshMatrix, null, 2)
  );
  console.log('Evidence written to step3e_independent_audit_evidence.json');
}

runStep3eAudit().catch(err => {
  console.error('Audit execution failed:', err);
  process.exit(1);
});
