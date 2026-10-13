import { 
  getDocs, 
  collection, 
  doc, 
  getDoc 
} from 'firebase/firestore';
import { 
  recordTest, 
  createGuestContext 
} from './framework';

export async function runPartKTests(): Promise<void> {
  console.log('\n======================================================================');
  console.log('PART K: PUBLIC / GUEST ISOLATION');
  console.log('======================================================================\n');

  const guest = await createGuestContext();

  // 1. Guest attempts direct query of transactions collection -> DENIED
  try {
    let denied = false;
    try {
      await getDocs(collection(guest.db, 'transactions'));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'GST-01',
      category: 'GUEST ISOLATION',
      scenario: 'Guest direct query of transactions collection rejected',
      command: 'getDocs(guestDb, "transactions")',
      input: { caller: 'GUEST', collection: 'transactions' },
      operation: 'Direct Firestore collection query without auth',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (FINANCIAL LEAK)',
      difference: denied ? 'None (Matched)' : 'Public access to transactions permitted',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'GST-01', category: 'GUEST ISOLATION', scenario: 'Guest query transactions', command: 'getDocs', input: {}, operation: 'Query', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 2. Guest attempts direct query of remitBills -> DENIED
  try {
    let denied = false;
    try {
      await getDocs(collection(guest.db, 'remitBills'));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'GST-02',
      category: 'GUEST ISOLATION',
      scenario: 'Guest direct query of remitBills collection rejected',
      command: 'getDocs(guestDb, "remitBills")',
      input: { caller: 'GUEST', collection: 'remitBills' },
      operation: 'Direct Firestore collection query without auth',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (FINANCIAL LEAK)',
      difference: denied ? 'None (Matched)' : 'Public access to bills permitted',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'GST-02', category: 'GUEST ISOLATION', scenario: 'Guest query bills', command: 'getDocs', input: {}, operation: 'Query', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 3. Guest attempts direct query of cash_ledger -> DENIED
  try {
    let denied = false;
    try {
      await getDocs(collection(guest.db, 'cash_ledger'));
    } catch {
      denied = true;
    }
    recordTest({
      id: 'GST-03',
      category: 'GUEST ISOLATION',
      scenario: 'Guest direct query of cash_ledger collection rejected',
      command: 'getDocs(guestDb, "cash_ledger")',
      input: { caller: 'GUEST', collection: 'cash_ledger' },
      operation: 'Direct Firestore collection query without auth',
      expected: 'DENIED with permission-denied',
      actual: denied ? 'DENIED (permission-denied)' : 'ALLOWED (FINANCIAL LEAK)',
      difference: denied ? 'None (Matched)' : 'Public access to cash ledger permitted',
      status: denied ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `denied=${denied}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'GST-03', category: 'GUEST ISOLATION', scenario: 'Guest query cash ledger', command: 'getDocs', input: {}, operation: 'Query', expected: 'DENIED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 4. Guest calls /api/users/delete-auth-bulk -> 401/403
  try {
    const res = await fetch('http://127.0.0.1:3000/api/users/delete-auth-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uids: ['uid_1', 'uid_2'] }),
    });
    const passed = res.status === 401 || res.status === 403;
    recordTest({
      id: 'GST-04',
      category: 'GUEST ISOLATION',
      scenario: 'Guest calling bulk user deletion API rejected',
      command: 'fetch(/api/users/delete-auth-bulk, { no auth })',
      input: { caller: 'GUEST' },
      operation: 'Unauthenticated bulk user deletion attempt',
      expected: 'HTTP 401/403 Forbidden',
      actual: `HTTP ${res.status}`,
      difference: passed ? 'None (Matched)' : `Unexpected status: ${res.status}`,
      status: passed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `Status: ${res.status}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'GST-04', category: 'GUEST ISOLATION', scenario: 'Guest bulk delete', command: 'fetch', input: {}, operation: 'Call', expected: '401/403', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }

  // 5. Guest reads public site content -> ALLOWED
  try {
    let allowed = false;
    try {
      await getDocs(collection(guest.db, 'site_content'));
      allowed = true;
    } catch (_) {}
    recordTest({
      id: 'GST-05',
      category: 'GUEST ISOLATION',
      scenario: 'Guest reads public site_content for institutional website',
      command: 'getDocs(guestDb, "site_content")',
      input: { caller: 'GUEST' },
      operation: 'Public content read for website visitors',
      expected: 'ALLOWED (Public portal content)',
      actual: allowed ? 'ALLOWED (Public content accessible)' : 'DENIED (Unexpected block)',
      difference: allowed ? 'None (Matched)' : 'Public site content blocked',
      status: allowed ? 'PASS-RUNTIME' : 'FAIL',
      rawOutput: `allowed=${allowed}`,
      exitCode: 0,
    });
  } catch (err: any) {
    recordTest({ id: 'GST-05', category: 'GUEST ISOLATION', scenario: 'Guest read site content', command: 'getDocs', input: {}, operation: 'Read', expected: 'ALLOWED', actual: err.message, difference: err.message, status: 'FAIL', rawOutput: err.stack, exitCode: 1 });
  }
}
