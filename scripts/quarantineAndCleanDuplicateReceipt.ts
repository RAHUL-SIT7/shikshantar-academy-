import { db, auth } from '../src/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  getDocs 
} from 'firebase/firestore';

async function main() {
  console.log('==============================================================================');
  console.log('PART 2: DUPLICATE RECEIPT FORENSIC QUARANTINE & VERIFICATION');
  console.log('==============================================================================\n');

  await signInWithEmailAndPassword(auth, 'admin_test_integration@shikshantar.edu.np', 'AdminTest@12345');
  console.log('[AUTH SUCCESS] Authenticated as Admin.');

  const targetDocIds = ['TXN_1789732856242_3W3RS', 'TXN_1789732858627_L3WQJ'];

  for (const docId of targetDocIds) {
    const docRef = doc(db, 'transactions', docId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      console.log(`[INFO] Document ${docId} does not exist in transactions.`);
      continue;
    }

    const data = snap.data();
    console.log(`\n[INSPECTING] ${docId}:`);
    console.log(`  Student: ${data.studentId} (${data.studentName})`);
    console.log(`  Receipt: ${data.receiptNo}`);
    console.log(`  Status:  ${data.status}`);
    console.log(`  Amount:  ${data.amount}`);

    // Safety checks
    const isTestFixture = 
      data.studentId === 'STU_STEP3_CLOSURE_001' || 
      data.studentName === 'Rohan Closure Test' ||
      data.status === 'CANCELLED';

    if (!isTestFixture) {
      throw new Error(`CRITICAL: Document ${docId} is not a verified test fixture! Aborting.`);
    }

    // 1. Archive to quarantined_test_fixtures
    const quarantineRef = doc(db, 'quarantined_test_fixtures', docId);
    await setDoc(quarantineRef, {
      ...data,
      quarantinedAt: new Date().toISOString(),
      quarantineReason: 'Forensic isolation of duplicate test fixture created during step-3 idempotency audit',
      originalDocId: docId,
      originalCollection: 'transactions'
    });
    console.log(`  -> Archived to quarantined_test_fixtures/${docId}`);

    // 2. Delete from transactions
    await deleteDoc(docRef);
    console.log(`  -> Safely removed from active transactions collection.`);
  }

  // Verification: Verify neither exists in transactions anymore
  for (const docId of targetDocIds) {
    const snap = await getDoc(doc(db, 'transactions', docId));
    if (snap.exists()) {
      throw new Error(`CRITICAL FAILURE: ${docId} still exists in transactions!`);
    }
  }
  console.log('\n[PASS] Target duplicate test documents verified removed from active transactions.');

  // Full receipt uniqueness scan across the entire production database
  console.log('\n--- FULL PRODUCTION RECEIPT UNIQUENESS SCAN ---');
  const txSnap = await getDocs(collection(db, 'transactions'));
  console.log(`Total active transactions in database: ${txSnap.size}`);

  const receiptMap: Record<string, any[]> = {};
  txSnap.forEach(d => {
    const tx = d.data();
    const rNo = tx.receiptNo || tx.receipt;
    if (rNo) {
      if (!receiptMap[rNo]) receiptMap[rNo] = [];
      receiptMap[rNo].push({
        id: d.id,
        studentId: tx.studentId,
        status: tx.status,
        amount: tx.amount,
        createdAt: tx.createdAt
      });
    }
  });

  let duplicateCount = 0;
  for (const [rNo, list] of Object.entries(receiptMap)) {
    if (list.length > 1) {
      duplicateCount++;
      console.log(`[ALERT] Duplicate receipt found: ${rNo} in ${list.length} docs:`);
      console.log(JSON.stringify(list, null, 2));
    }
  }

  console.log(`\nDuplicate active transactions count: ${duplicateCount}`);
  if (duplicateCount === 0) {
    console.log('[PROVEN] ZERO duplicate active/production receipt numbers exist across transactions.');
  } else {
    console.log(`[WARN] Found ${duplicateCount} duplicates remaining.`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Execution failed:', err);
  process.exit(1);
});
