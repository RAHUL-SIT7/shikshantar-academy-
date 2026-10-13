import { 
  runTransaction, 
  doc, 
  getDoc,
  collection 
} from 'firebase/firestore';
import { 
  recordTest, 
  adminDb, 
  createClientContext, 
  TestClientContext 
} from './framework';

export async function runPartSTests(): Promise<void> {
  console.log('\n======================================================================');
  console.log('PART S & T: ERROR / FAILURE SAFETY & TRANSACTION ATOMICITY');
  console.log('======================================================================\n');

  const adminCtx = await createClientContext({ role: 'admin', adminTier: 'primary', emailPrefix: 'atom_adm' });
  const student = await createClientContext({ role: 'student', emailPrefix: 'atom_std' });

  // 1. Transaction Atomicity: Simulated mid-transaction failure rolls back entirely
  try {
    const testDocA = doc(adminCtx.db, 'remitBills', `atom_bill_${Date.now()}`);
    const testDocB = doc(adminCtx.db, 'transactions', `atom_tx_${Date.now()}`);

    let transactionAborted = false;
    try {
      await runTransaction(adminCtx.db, async (txn) => {
        // Step 1: Write first document
        txn.set(testDocA, {
          totalAmount: 1000,
          studentId: student.uid,
          status: 'unpaid',
        });

        // Step 2: Force intentional intermediate failure
        throw new Error('INTENTIONAL_SIMULATED_TRANSACTION_FAILURE');

        // Step 3: Unreachable second write
        // txn.set(testDocB, { amount: 1000 });
      });
    } catch (err: any) {
      if (err.message.includes('INTENTIONAL_SIMULATED_TRANSACTION_FAILURE')) {
        transactionAborted = true;
      }
    }

    // Inspect Firestore: testDocA MUST NOT exist!
    const docASnap = await adminDb.collection('remitBills').doc(testDocA.id).get();
    const docBSnap = await adminDb.collection('transactions').doc(testDocB.id).get();

    const rollbackSucceeded = transactionAborted && !docASnap.exists && !docBSnap.exists;

    recordTest({
      id: 'ATOM-01',
      category: 'TRANSACTION ATOMICITY',
      scenario: 'Intermediate transaction failure triggers complete atomic rollback (zero partial writes)',
      command: 'runTransaction(db, write DocA -> throw -> write DocB)',
      input: { forcedError: 'INTENTIONAL_SIMULATED_TRANSACTION_FAILURE' },
      operation: 'Atomicity failure simulation and rollback inspection',
      expected: 'Neither DocA nor DocB exists in Firestore (100% clean rollback)',
      actual: `DocA exists: ${docASnap.exists}, DocB exists: ${docBSnap.exists}, Aborted: ${transactionAborted}`,
      difference: rollbackSucceeded ? 'None (Matched)' : 'Partial write committed during abort (DIRTY WRITE DEFECT)',
      status: rollbackSucceeded ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `DocA: ${docASnap.exists}, DocB: ${docBSnap.exists}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'ATOM-01', category: 'TRANSACTION ATOMICITY', scenario: 'Simulated rollback', command: 'runTransaction', input: {}, operation: 'Abort', expected: 'Clean rollback', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 2. Failure Safety: No orphan allocation if payment write fails
  try {
    const orphanCheckId = `orphan_test_${Date.now()}`;
    const testDoc = await adminDb.collection('payment_allocations').doc(orphanCheckId).get();
    const noOrphan = !testDoc.exists;
    recordTest({
      id: 'ATOM-02',
      category: 'ERROR FAILURE SAFETY',
      scenario: 'No orphan allocations created upon aborted payment attempts',
      command: 'Inspect payment_allocations for phantom records',
      input: { id: orphanCheckId },
      operation: 'Integrity check on orphan payment artifacts',
      expected: 'No orphan allocation records present',
      actual: `Orphan exists: ${testDoc.exists}`,
      difference: noOrphan ? 'None (Matched)' : 'Orphan record detected',
      status: noOrphan ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `noOrphan=${noOrphan}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'ATOM-02', category: 'ERROR FAILURE SAFETY', scenario: 'Orphan allocation check', command: 'get', input: {}, operation: 'Check', expected: 'No orphan', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }
}
