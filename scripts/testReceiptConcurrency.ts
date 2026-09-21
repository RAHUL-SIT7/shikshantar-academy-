import { db, auth } from '../src/firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { allocateNextDocumentNumber, parseDocumentNumber } from '../src/lib/documentNumberingEngine.js';

async function testReceiptConcurrency() {
  console.log('=== PART 3: REAL FIRESTORE RECEIPT NUMBERING CONCURRENCY TEST ===');

  try {
    const adminEmail = 'admin_test_integration@shikshantar.edu.np';
    const adminPass = 'AdminTest@12345';
    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, adminEmail, adminPass);
    } catch (e) {
      cred = await createUserWithEmailAndPassword(auth, adminEmail, adminPass);
      await setDoc(doc(db, 'users', cred.user.uid), {
        email: adminEmail,
        role: 'admin',
        name: 'Concurrency Tester',
        active: true
      });
    }

    console.log('Authenticated Admin:', cred.user.email);

    const CONCURRENCY_COUNT = 10;
    console.log(`Launching ${CONCURRENCY_COUNT} concurrent Firestore transaction number allocations for 'RCP'...`);

    const startTime = Date.now();
    const promises = Array.from({ length: CONCURRENCY_COUNT }, (_, i) =>
      allocateNextDocumentNumber('RCP', '2083 BS').catch((err) => {
        console.error(`Allocation ${i + 1} failed:`, err);
        return null;
      })
    );

    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;

    console.log(`Allocated ${results.length} numbers in ${duration}ms:`);
    results.forEach((res, idx) => {
      console.log(`  [Thread ${idx + 1}] allocated: ${res}`);
    });

    // Validations
    const validResults = results.filter((r): r is string => typeof r === 'string');
    if (validResults.length !== CONCURRENCY_COUNT) {
      throw new Error(`Concurrency test failed: Only ${validResults.length}/${CONCURRENCY_COUNT} allocations succeeded.`);
    }

    // Check uniqueness
    const uniqueSet = new Set(validResults);
    if (uniqueSet.size !== CONCURRENCY_COUNT) {
      throw new Error(`COLLISION DETECTED! ${CONCURRENCY_COUNT - uniqueSet.size} duplicate receipt numbers generated during concurrent execution!`);
    }

    // Check sequence numbers
    const sequences = validResults.map(r => {
      const parsed = parseDocumentNumber(r);
      if (!parsed.isValid || !parsed.sequence) {
        throw new Error(`Invalid format produced: ${r}`);
      }
      return parsed.sequence;
    }).sort((a, b) => a - b);

    console.log('Sorted allocated sequences:', sequences);

    // Verify contiguous increment (no gaps, no duplicates)
    for (let i = 1; i < sequences.length; i++) {
      if (sequences[i] !== sequences[i - 1] + 1) {
        throw new Error(`SEQUENCE GAP OR REUSE DETECTED between ${sequences[i - 1]} and ${sequences[i]}`);
      }
    }

    console.log('SUCCESS: Receipt Numbering Concurrency Test PASSED cleanly!');
    console.log('- 0 Duplicates');
    console.log('- 0 Collisions');
    console.log('- 0 Number Reuses');
    console.log('- Contiguous Monotonic Sequence Guaranteed via Firestore Transactions');

  } catch (err: any) {
    console.error('Concurrency Test Failed:', err?.stack || err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

testReceiptConcurrency();
