import { db, auth } from '../src/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';

async function main() {
  console.log('=== FORENSIC RECEIPT SCAN FOR RCP-2083-000991 & ALL DUPLICATES ===\n');

  try {
    await signInWithEmailAndPassword(auth, 'admin_test_integration@shikshantar.edu.np', 'AdminTest@12345');
    console.log('Authenticated as admin successfully.');
  } catch (err: any) {
    console.log('Auth note:', err.message);
  }

  const collectionsToScan = [
    'transactions',
    'fee_records',
    'fee_bills',
    'student_ledgers',
    'students',
    'audit_logs',
    'ledger_audit_logs',
    'invoices'
  ];

  const targetReceipt = 'RCP-2083-000991';
  const targetMatches: any[] = [];
  const allReceiptMap: Record<string, any[]> = {};

  for (const colName of collectionsToScan) {
    try {
      const snap = await getDocs(collection(db, colName));
      console.log(`Scanned collection '${colName}': ${snap.size} documents found.`);
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const docId = docSnap.id;
        const jsonStr = JSON.stringify(data);

        // Check for specific receipt
        if (
          jsonStr.includes(targetReceipt) ||
          data.receiptNo === targetReceipt ||
          data.receipt === targetReceipt
        ) {
          targetMatches.push({
            collection: colName,
            docId,
            receiptNo: data.receiptNo || data.receipt,
            studentId: data.studentId || data.student?.id,
            studentName: data.studentName || data.student?.name || data.student?.fullName,
            transactionId: data.transactionId || docId,
            status: data.status,
            createdAt: data.createdAt,
            createdBy: data.createdBy || data.operatorName || data.operatorUid,
            amount: data.amount || data.paidAmount || data.cashTendered || data.netPayable,
            isTest: data.isTest || data.testFixture || docId.includes('TEST') || docId.includes('STEP3') || (data.studentId && data.studentId.includes('TEST')) || (data.studentName && data.studentName.includes('Test')),
            dataPreview: data
          });
        }

        // Also track all receipt numbers across collections to check for other duplicates
        const rNo = data.receiptNo || data.receipt;
        if (rNo && typeof rNo === 'string' && rNo.startsWith('RCP-')) {
          if (!allReceiptMap[rNo]) allReceiptMap[rNo] = [];
          allReceiptMap[rNo].push({
            collection: colName,
            docId,
            studentId: data.studentId || data.student?.id,
            amount: data.amount || data.paidAmount,
            status: data.status,
            createdAt: data.createdAt
          });
        }
      });
    } catch (err: any) {
      console.warn(`Error scanning collection ${colName}:`, err.message);
    }
  }

  console.log('\n--- TARGET RECEIPT MATCHES (RCP-2083-000991) ---');
  console.log(`Total occurrences found: ${targetMatches.length}`);
  targetMatches.forEach((m, idx) => {
    console.log(`\nMatch #${idx + 1}:`);
    console.log(`  Collection:    ${m.collection}`);
    console.log(`  Doc ID:        ${m.docId}`);
    console.log(`  Student:       ${m.studentId} (${m.studentName})`);
    console.log(`  Tx ID:         ${m.transactionId}`);
    console.log(`  Status:        ${m.status}`);
    console.log(`  Created At:    ${JSON.stringify(m.createdAt)}`);
    console.log(`  Created By:    ${m.createdBy}`);
    console.log(`  Amount:        ${m.amount}`);
    console.log(`  Is Test Data:  ${m.isTest}`);
  });

  console.log('\n--- ALL DUPLICATE RECEIPTS ACROSS PRODUCTION DB ---');
  let duplicateCount = 0;
  for (const [rNo, list] of Object.entries(allReceiptMap)) {
    if (list.length > 1) {
      duplicateCount++;
      console.log(`Duplicate Receipt ${rNo} found in ${list.length} docs:`);
      list.forEach(item => {
        console.log(`  - [${item.collection}] docId: ${item.docId}, student: ${item.studentId}, status: ${item.status}, amount: ${item.amount}`);
      });
    }
  }
  console.log(`\nTotal unique duplicate receipt numbers: ${duplicateCount}`);
}

main().catch(console.error);
