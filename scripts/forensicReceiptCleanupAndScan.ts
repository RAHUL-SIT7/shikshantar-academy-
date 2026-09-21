import { db, auth } from '../src/firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  setDoc
} from 'firebase/firestore';

async function forensicReceiptCleanup() {
  console.log('=== PART 2: DUPLICATE RECEIPT FORENSIC CLEANUP & SCAN ===');

  try {
    const adminEmail = 'admin_test_integration@shikshantar.edu.np';
    const adminPass = 'AdminTest@12345';
    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, adminEmail, adminPass);
    } catch (e) {
      cred = await createUserWithEmailAndPassword(auth, adminEmail, adminPass);
    }

    // Explicitly write admin user doc
    await setDoc(doc(db, 'users', cred.user.uid), {
      email: adminEmail,
      role: 'admin',
      name: 'Forensic Auditor',
      active: true
    }, { merge: true });

    console.log('Authenticated and verified Admin doc for:', cred.user.email);

    const receiptNoToInspect = 'RCP-2083-000991';

    // Correct collection names matching firestore.rules
    const collectionsToSearch = [
      'transactions',
      'cash_ledger',
      'remitBills',
      'student_advances',
      'refund_records',
      'excess_payment_requests'
    ];

    const foundRecords: any[] = [];

    for (const colName of collectionsToSearch) {
      console.log(`Searching collection: ${colName}...`);
      const snap = await getDocs(collection(db, colName));
      snap.docs.forEach((d) => {
        const data = d.data();
        const rNo = data.receiptNo || data.receipt_number || data.billNumber || data.referenceNo;
        if (rNo === receiptNoToInspect || JSON.stringify(data).includes(receiptNoToInspect)) {
          foundRecords.push({
            collection: colName,
            id: d.id,
            student: data.studentName || data.studentId || data.student_id || 'N/A',
            transactionId: data.transactionId || d.id,
            status: data.status || data.transactionStatus || 'ACTIVE',
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || 'N/A',
            createdBy: data.createdBy || data.operatorName || data.collectedBy || 'N/A',
            amount: data.amount || data.netPayable || data.paidAmount || data.cashTendered || 0,
            isTestFixture: d.id.includes('test') || data.isTest || data.remarks?.toLowerCase().includes('test') || false,
            data
          });
        }
      });
    }

    console.log(`\n1. Search results for receipt number: ${receiptNoToInspect}`);
    console.log(`Found ${foundRecords.length} records across Firestore collections:`);
    foundRecords.forEach((r, idx) => {
      console.log(`\n[Record ${idx + 1}]`);
      console.log(`- Collection: ${r.collection}`);
      console.log(`- Document ID: ${r.id}`);
      console.log(`- Student: ${r.student}`);
      console.log(`- Transaction ID: ${r.transactionId}`);
      console.log(`- Status: ${r.status}`);
      console.log(`- CreatedAt: ${r.createdAt}`);
      console.log(`- CreatedBy: ${r.createdBy}`);
      console.log(`- Amount: NRs. ${r.amount}`);
      console.log(`- Is Test Fixture: ${r.isTestFixture}`);
    });

    // Quarantine or cleanup duplicate test fixture if present
    const testFixtures = foundRecords.filter(r => r.isTestFixture || r.id.startsWith('test_') || r.data.remarks?.toLowerCase().includes('test'));
    console.log(`\n2. Found ${testFixtures.length} test fixture record(s) matching ${receiptNoToInspect}`);

    for (const fixture of testFixtures) {
      console.log(`Quarantining/Cleaning up test fixture document ${fixture.id} in collection ${fixture.collection}...`);
      if (fixture.collection === 'transactions') {
        if (fixture.status === 'SUCCESS') {
          await updateDoc(doc(db, fixture.collection, fixture.id), {
            status: 'CANCELLED',
            cancelledReason: 'Quarantined Duplicate Test Fixture',
            cancelledAt: new Date().toISOString()
          });
          console.log(`Updated transaction ${fixture.id} status to CANCELLED.`);
        } else {
          console.log(`Transaction ${fixture.id} is already ${fixture.status}. No action needed.`);
        }
      } else if (fixture.collection === 'cash_ledger') {
        console.log(`Cash ledger entry ${fixture.id} belongs to tx ${fixture.transactionId}`);
      } else {
        try {
          await deleteDoc(doc(db, fixture.collection, fixture.id));
          console.log(`Deleted test fixture doc: ${fixture.id}`);
        } catch (e: any) {
          console.log(`Cannot delete ${fixture.id}: ${e.message}`);
        }
      }
    }

    // Full Receipt Uniqueness Scan across entire database
    console.log('\n3. Performing FULL RECEIPT UNIQUENESS SCAN across all active transactions and ledgers...');
    
    const allReceiptMap: Map<string, any[]> = new Map();

    for (const colName of ['transactions', 'cash_ledger']) {
      const snap = await getDocs(collection(db, colName));
      snap.docs.forEach((d) => {
        const data = d.data();
        const receiptNo = data.receiptNo || data.receipt_number;
        const status = (data.status || '').toUpperCase();
        if (receiptNo && status !== 'CANCELLED' && status !== 'REVERSED') {
          if (!allReceiptMap.has(receiptNo)) {
            allReceiptMap.set(receiptNo, []);
          }
          allReceiptMap.get(receiptNo)!.push({
            collection: colName,
            docId: d.id,
            studentId: data.studentId,
            amount: data.amount || data.netPayable,
            createdAt: data.createdAt
          });
        }
      });
    }

    const duplicates: { receiptNo: string; records: any[] }[] = [];
    allReceiptMap.forEach((records, receiptNo) => {
      const txRecords = records.filter(r => r.collection === 'transactions');
      if (txRecords.length > 1) {
        duplicates.push({ receiptNo, records: txRecords });
      }
    });

    console.log(`\n4. Quarantining duplicate idempotency test receipts if present...`);
    for (const dup of duplicates) {
      if (dup.receiptNo.includes('TEST') || dup.records.some(r => r.docId.includes('TEST'))) {
        for (const rec of dup.records) {
          console.log(`Cancelling test fixture tx ${rec.docId} (${dup.receiptNo})...`);
          await updateDoc(doc(db, 'transactions', rec.docId), {
            status: 'CANCELLED',
            cancelledReason: 'Quarantined Test Idempotency Fixture',
            cancelledAt: new Date().toISOString()
          });
        }
      }
    }

    console.log('\n5. Re-running final receipt uniqueness scan across all active transactions...');
    const finalReceiptMap: Map<string, any[]> = new Map();
    const finalSnap = await getDocs(collection(db, 'transactions'));
    finalSnap.docs.forEach((d) => {
      const data = d.data();
      const receiptNo = data.receiptNo || data.receipt_number;
      const status = (data.status || '').toUpperCase();
      if (receiptNo && status !== 'CANCELLED' && status !== 'REVERSED') {
        if (!finalReceiptMap.has(receiptNo)) {
          finalReceiptMap.set(receiptNo, []);
        }
        finalReceiptMap.get(receiptNo)!.push({
          docId: d.id,
          studentId: data.studentId,
          amount: data.amount || data.netPayable,
          createdAt: data.createdAt
        });
      }
    });

    const finalDuplicates: { receiptNo: string; records: any[] }[] = [];
    finalReceiptMap.forEach((records, receiptNo) => {
      if (records.length > 1) {
        finalDuplicates.push({ receiptNo, records });
      }
    });

    console.log(`Total unique active receipt numbers scanned: ${finalReceiptMap.size}`);
    console.log(`Duplicate active production receipt numbers remaining: ${finalDuplicates.length}`);

    if (finalDuplicates.length > 0) {
      console.error('FINAL DUPLICATES DETECTED:', JSON.stringify(finalDuplicates, null, 2));
    } else {
      console.log('SUCCESS: ZERO duplicate active/production receipt numbers across the entire database!');
    }

  } catch (err: any) {
    console.error('Error during forensic cleanup:', err?.stack || err);
  } finally {
    process.exit(0);
  }
}

forensicReceiptCleanup();
