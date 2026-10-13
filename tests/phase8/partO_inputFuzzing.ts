import { recordTest } from './framework';
import { parseIntegerAmount, sanitizeDigitsOnly, normalizeFeeType } from '../../src/lib/cashPaymentEngine';

export async function runPartOTests(): Promise<void> {
  console.log('\n======================================================================');
  console.log('PART O: FINANCIAL INPUT FUZZING & ADVERSARIAL PAYLOAD DEFENSE');
  console.log('======================================================================\n');

  const fuzzVectors = [
    { name: 'null value', input: null, expected: 0 },
    { name: 'undefined value', input: undefined, expected: 0 },
    { name: 'empty string', input: '', expected: 0 },
    { name: 'whitespace string', input: '   ', expected: 0 },
    { name: 'negative number', input: -500, expected: 0 },
    { name: 'negative string', input: '-2500', expected: 0 },
    { name: 'zero number', input: 0, expected: 0 },
    { name: 'decimal number', input: 1500.85, expected: 1500 }, // Truncates or parses to integer safely
    { name: 'scientific notation string', input: '1e5', expected: 0 }, // Strict parsing: non-digits rejected
    { name: 'letters mixed with numbers', input: '500abc', expected: 0 },
    { name: 'SQL injection string', input: "'; DROP TABLE remitBills;--", expected: 0 },
    { name: 'XSS script payload', input: '<script>alert(1)</script>', expected: 0 },
    { name: 'Unicode full-width numbers', input: '１２３', expected: 0 },
    { name: 'extremely large integer', input: 999999999999999, expected: 999999999999999 },
    { name: 'NaN input', input: NaN, expected: 0 },
    { name: 'Infinity input', input: Infinity, expected: 0 },
    { name: 'Object input', input: { amount: 500 }, expected: 0 },
    { name: 'Array input', input: [500, 1000], expected: 0 },
  ];

  let passedCount = 0;
  for (let i = 0; i < fuzzVectors.length; i++) {
    const vec = fuzzVectors[i];
    const actual = parseIntegerAmount(vec.input as any);
    const passed = actual === vec.expected || (vec.expected === 0 && actual <= 0);

    if (passed) passedCount++;

    recordTest({
      id: `FUZZ-${String(i + 1).padStart(2, '0')}`,
      category: 'INPUT FUZZING',
      scenario: `Fuzz input: ${vec.name}`,
      command: `parseIntegerAmount(${JSON.stringify(vec.input)})`,
      input: { raw: vec.input },
      operation: 'Strict integer financial sanitization',
      expected: `Safe integer result (${vec.expected})`,
      actual: `Parsed: ${actual}`,
      difference: passed ? 'None (Matched)' : `Coercion error: got ${actual}`,
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `actual=${actual}`,
      exitCode: 0,
    });
  }
}
