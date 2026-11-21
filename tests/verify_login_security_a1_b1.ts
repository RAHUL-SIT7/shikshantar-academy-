/**
 * Isolated Local Firebase Emulator Verification for Option A1 (Cloudflare Turnstile Fail-Closed)
 * and Option B1 (4-Attempt Progressive Cooldown Lockout Policy + Campus Wi-Fi IP Fairness).
 * NEVER touches production Firebase!
 */
process.env.USE_FIREBASE_EMULATOR = 'true';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9098';
process.env.SKIP_SERVER_START = 'true';

import assert from 'node:assert/strict';
import http from 'node:http';
import admin from 'firebase-admin';
import { createApp, getAdminDb } from '../server';

const PROJECT_ID = 'project-4b410c97-a152-49e7-940';
const AUTH_EMU_URL = 'http://127.0.0.1:9098';
const FIRESTORE_EMU_URL = 'http://127.0.0.1:8085';

interface TestResult {
  group: string;
  name: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];

async function testCase(group: string, name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ group, name, passed: true });
    console.log(`  [PASS] (${group}) ${name}`);
  } catch (err: any) {
    results.push({ group, name, passed: false, detail: err?.message || String(err) });
    console.error(`  [FAIL] (${group}) ${name} -> ${err?.message || err}`);
  }
}

async function clearEmulators() {
  await fetch(`${FIRESTORE_EMU_URL}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: 'DELETE'
  });
  await fetch(`${AUTH_EMU_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE'
  });
}

async function createAuthUserAndToken(uid: string, email: string, displayName: string): Promise<string> {
  await admin.auth().createUser({
    uid,
    email,
    emailVerified: true,
    password: 'TestPassword123!',
    displayName
  });
  const customToken = await admin.auth().createCustomToken(uid);
  const resp = await fetch(
    `${AUTH_EMU_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    }
  );
  const data: any = await resp.json();
  if (!data.idToken) {
    throw new Error(`Failed to exchange custom token: ${JSON.stringify(data)}`);
  }
  return data.idToken;
}

async function callApi(
  baseUrl: string,
  path: string,
  body: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function run() {
  await clearEmulators();
  const db = getAdminDb();

  await db.collection('users').doc('uid_sec_test').set({
    uid: 'uid_sec_test',
    email: 'student.sec@shikshantar.edu.np',
    fullName: 'Security Test Student',
    role: 'student',
    active: true,
    status: 'approved'
  });
  const studentToken = await createAuthUserAndToken('uid_sec_test', 'student.sec@shikshantar.edu.np', 'Security Test Student');

  const app = await createApp({ skipVite: true, skipOutboxWorker: true });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const t0 = Date.UTC(2026, 10, 19, 12, 0, 0);

  try {
    console.log('\n=== OPTION A1: CLOUDFLARE TURNSTILE FAIL-CLOSED GATE ===');

    await testCase('A1_TURNSTILE', 'Rejects /api/auth/login-precheck when turnstileToken is missing (fail-closed 400)', async () => {
      const r = await callApi(baseUrl, '/api/auth/login-precheck', {
        identifier: 'student.sec@shikshantar.edu.np'
      }, { 'X-Test-Current-Time': String(t0) });
      assert.equal(r.status, 400);
      assert.equal(r.data.allowed, false);
    });

    await testCase('A1_TURNSTILE', 'Rejects invalid and expired Turnstile tokens (400)', async () => {
      const rInvalid = await callApi(baseUrl, '/api/auth/login-precheck', {
        identifier: 'student.sec@shikshantar.edu.np',
        turnstileToken: 'TEST_TURNSTILE_INVALID_1',
        action: 'login'
      }, { 'X-Test-Current-Time': String(t0) });
      assert.equal(rInvalid.status, 400);
      assert.equal(rInvalid.data.allowed, false);

      const rExpired = await callApi(baseUrl, '/api/auth/login-precheck', {
        identifier: 'student.sec@shikshantar.edu.np',
        turnstileToken: 'TEST_TURNSTILE_EXPIRED_1',
        action: 'login'
      }, { 'X-Test-Current-Time': String(t0) });
      assert.equal(rExpired.status, 400);
      assert.equal(rExpired.data.allowed, false);
    });

    await testCase('A1_TURNSTILE', 'Accepts valid Turnstile token once and rejects single-use replay (409)', async () => {
      const r1 = await callApi(baseUrl, '/api/auth/login-precheck', {
        identifier: 'student.sec@shikshantar.edu.np',
        turnstileToken: 'TEST_TURNSTILE_VALID_ONCE_1',
        action: 'login'
      }, { 'X-Test-Current-Time': String(t0) });
      assert.equal(r1.status, 200);
      assert.equal(r1.data.allowed, true);
      assert.equal(r1.data.maxAttempts, 4);
      assert.equal(r1.data.remainingAttemptsBeforeCooldown, 4);

      const rReplay = await callApi(baseUrl, '/api/auth/login-precheck', {
        identifier: 'student.sec@shikshantar.edu.np',
        turnstileToken: 'TEST_TURNSTILE_VALID_ONCE_1',
        action: 'login'
      }, { 'X-Test-Current-Time': String(t0) });
      assert.equal(rReplay.status, 409);
      assert.equal(rReplay.data.allowed, false);
    });

    await testCase('A1_TURNSTILE', 'Password reset enforces Turnstile single-use + max 2 requests per 5 min', async () => {
      const rNoTok = await callApi(baseUrl, '/api/auth/password-reset', {
        identifier: 'student.sec@shikshantar.edu.np'
      }, { 'X-Test-Current-Time': String(t0) });
      assert.equal(rNoTok.status, 400);

      const r1 = await callApi(baseUrl, '/api/auth/password-reset', {
        identifier: 'student.sec@shikshantar.edu.np',
        turnstileToken: 'TEST_TURNSTILE_VALID_RESET_1'
      }, { 'X-Test-Current-Time': String(t0) });
      assert.equal(r1.status, 200);

      const rReplay = await callApi(baseUrl, '/api/auth/password-reset', {
        identifier: 'student.sec@shikshantar.edu.np',
        turnstileToken: 'TEST_TURNSTILE_VALID_RESET_1'
      }, { 'X-Test-Current-Time': String(t0) });
      assert.equal(rReplay.status, 409);

      const r2 = await callApi(baseUrl, '/api/auth/password-reset', {
        identifier: 'student.sec@shikshantar.edu.np',
        turnstileToken: 'TEST_TURNSTILE_VALID_RESET_2'
      }, { 'X-Test-Current-Time': String(t0 + 1000) });
      assert.equal(r2.status, 200);

      const r3 = await callApi(baseUrl, '/api/auth/password-reset', {
        identifier: 'student.sec@shikshantar.edu.np',
        turnstileToken: 'TEST_TURNSTILE_VALID_RESET_3'
      }, { 'X-Test-Current-Time': String(t0 + 2000) });
      assert.equal(r3.status, 429);
    });

    console.log('\n=== OPTION B1: 4-ATTEMPT PROGRESSIVE LOCKOUT & BYPASS PROTECTION ===');

    const acct = 'student.sec@shikshantar.edu.np';

    await testCase('B1_LOCKOUT', 'Attempts 1-3 show 3->2->1 remaining attempts; 4th failure locks for 5 minutes (300s)', async () => {
      for (let i = 1; i <= 3; i++) {
        const res = await callApi(baseUrl, '/api/auth/login-attempt', {
          identifier: acct,
          outcome: 'FAILURE'
        }, { 'X-Test-Current-Time': String(t0 + i * 1000) });
        assert.equal(res.status, 200);
        assert.equal(res.data.locked, false);
        assert.equal(res.data.consecutiveFailures, i);
        assert.equal(res.data.remainingAttemptsBeforeCooldown, 4 - i);
      }

      const res4 = await callApi(baseUrl, '/api/auth/login-attempt', {
        identifier: acct,
        outcome: 'FAILURE'
      }, { 'X-Test-Current-Time': String(t0 + 4000) });
      assert.equal(res4.status, 429);
      assert.equal(res4.data.locked, true);
      assert.equal(res4.data.consecutiveFailures, 4);
      assert.equal(res4.data.cooldownTier, 1);
      assert.equal(res4.data.retryAfterSeconds, 300);
    });

    await testCase('B1_LOCKOUT', 'Precheck blocks locked account (429) AND preserves Turnstile token unconsumed', async () => {
      const rLocked = await callApi(baseUrl, '/api/auth/login-precheck', {
        identifier: acct,
        turnstileToken: 'TEST_TURNSTILE_VALID_UNTOUCHED',
        action: 'login'
      }, { 'X-Test-Current-Time': String(t0 + 10000) });
      assert.equal(rLocked.status, 429);
      assert.equal(rLocked.data.locked, true);
      assert.ok(rLocked.data.retryAfterSeconds > 280);
    });

    await testCase('B1_LOCKOUT', 'Blocks active-lockout bypass on /login-attempt SUCCESS and /record-login (423 Locked)', async () => {
      const rBypassAttempt = await callApi(
        baseUrl,
        '/api/auth/login-attempt',
        { identifier: acct, outcome: 'SUCCESS' },
        { Authorization: `Bearer ${studentToken}`, 'X-Test-Current-Time': String(t0 + 15000) }
      );
      assert.equal(rBypassAttempt.status, 423);
      assert.equal(rBypassAttempt.data.locked, true);

      const rBypassRecord = await callApi(
        baseUrl,
        '/api/auth/record-login',
        { sessionId: 'sess_bypass_1' },
        { Authorization: `Bearer ${studentToken}`, 'X-Test-Current-Time': String(t0 + 15000) }
      );
      assert.equal(rBypassRecord.status, 423);
      assert.equal(rBypassRecord.data.locked, true);
    });

    await testCase('B1_LOCKOUT', 'Progressive escalation after expiry: 15m -> 30m -> 60m max', async () => {
      // After 5m01s -> Tier 2 (15 minutes = 900s)
      const tTier2 = t0 + 4000 + 5 * 60 * 1000 + 1000;
      const rTier2 = await callApi(baseUrl, '/api/auth/login-attempt', {
        identifier: acct,
        outcome: 'FAILURE'
      }, { 'X-Test-Current-Time': String(tTier2) });
      assert.equal(rTier2.status, 429);
      assert.equal(rTier2.data.cooldownTier, 2);
      assert.equal(rTier2.data.retryAfterSeconds, 900);

      // After 15m01s -> Tier 3 (30 minutes = 1800s)
      const tTier3 = tTier2 + 15 * 60 * 1000 + 1000;
      const rTier3 = await callApi(baseUrl, '/api/auth/login-attempt', {
        identifier: acct,
        outcome: 'FAILURE'
      }, { 'X-Test-Current-Time': String(tTier3) });
      assert.equal(rTier3.status, 429);
      assert.equal(rTier3.data.cooldownTier, 3);
      assert.equal(rTier3.data.retryAfterSeconds, 1800);

      // After 30m01s -> Tier 4 (60 minutes = 3600s max)
      const tTier4 = tTier3 + 30 * 60 * 1000 + 1000;
      const rTier4 = await callApi(baseUrl, '/api/auth/login-attempt', {
        identifier: acct,
        outcome: 'FAILURE'
      }, { 'X-Test-Current-Time': String(tTier4) });
      assert.equal(rTier4.status, 429);
      assert.equal(rTier4.data.cooldownTier, 4);
      assert.equal(rTier4.data.retryAfterSeconds, 3600);

      // After 60m01s -> Authenticated SUCCESS resets counters and previously untouched Turnstile token still works
      const tUnlocked = tTier4 + 60 * 60 * 1000 + 1000;
      const rUnauthReset = await callApi(baseUrl, '/api/auth/login-attempt', {
        identifier: acct,
        outcome: 'SUCCESS'
      }, { 'X-Test-Current-Time': String(tUnlocked) });
      assert.equal(rUnauthReset.status, 401);

      const rAuthReset = await callApi(
        baseUrl,
        '/api/auth/login-attempt',
        { identifier: acct, outcome: 'SUCCESS' },
        { Authorization: `Bearer ${studentToken}`, 'X-Test-Current-Time': String(tUnlocked) }
      );
      assert.equal(rAuthReset.status, 200);
      assert.equal(rAuthReset.data.consecutiveFailures, 0);
      assert.equal(rAuthReset.data.remainingAttemptsBeforeCooldown, 4);

      const rPrecheckAfterUnlock = await callApi(baseUrl, '/api/auth/login-precheck', {
        identifier: acct,
        turnstileToken: 'TEST_TURNSTILE_VALID_UNTOUCHED',
        action: 'login'
      }, { 'X-Test-Current-Time': String(tUnlocked + 500) });
      assert.equal(rPrecheckAfterUnlock.status, 200);
      assert.equal(rPrecheckAfterUnlock.data.allowed, true);
    });

    await testCase('B1_WIFI_FAIRNESS', 'Shared campus IP is NOT locked after 15 failed attempts across different students', async () => {
      for (let i = 1; i <= 15; i++) {
        const res = await callApi(baseUrl, '/api/auth/login-attempt', {
          identifier: `wifi.student.${i}@shikshantar.edu.np`,
          outcome: 'FAILURE'
        }, { 'X-Forwarded-For': '203.0.113.55', 'X-Test-Current-Time': String(t0 + i * 100) });
        assert.equal(res.status, 200);
        assert.equal(res.data.locked, false);
      }
      const rGoodStudent = await callApi(baseUrl, '/api/auth/login-precheck', {
        identifier: 'good.wifi.student@shikshantar.edu.np',
        turnstileToken: 'TEST_TURNSTILE_VALID_WIFI_1',
        action: 'login'
      }, { 'X-Forwarded-For': '203.0.113.55', 'X-Test-Current-Time': String(t0 + 2000) });
      assert.equal(rGoodStudent.status, 200);
      assert.equal(rGoodStudent.data.allowed, true);
    });

    await testCase('SESSION_RACE', 'Returning user keeps existing activeSessions while registering new sessionId (200)', async () => {
      await db.collection('users').doc('uid_sec_test').set({
        activeSessions: ['old_sess_1']
      }, { merge: true });

      const rRecord = await callApi(
        baseUrl,
        '/api/auth/record-login',
        { sessionId: 'new_sess_2', loginEventId: 'login_ev_2' },
        { Authorization: `Bearer ${studentToken}` }
      );
      assert.equal(rRecord.status, 200);
      assert.equal(rRecord.data.success, true);

      const userSnap = await db.collection('users').doc('uid_sec_test').get();
      const sessions: string[] = userSnap.data()?.activeSessions || [];
      assert.ok(sessions.includes('old_sess_1'), 'Should keep previous active session old_sess_1');
      assert.ok(sessions.includes('new_sess_2'), 'Should add newly logged in session new_sess_2');
    });

    await testCase('SESSION_RACE', 'Rejects re-recording a REVOKED sessionId with 401 { revoked: true }', async () => {
      await db.collection('user_sessions').doc('revoked_sess_1').set({
        sessionId: 'revoked_sess_1',
        userUid: 'uid_sec_test',
        status: 'REVOKED'
      });

      const rRevoked = await callApi(
        baseUrl,
        '/api/auth/record-login',
        { sessionId: 'revoked_sess_1' },
        { Authorization: `Bearer ${studentToken}` }
      );
      assert.equal(rRevoked.status, 401);
      assert.equal(rRevoked.data.revoked, true);
    });
  } finally {
    server.close();
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`\n==============================================================`);
  console.log(`A1 + B1 LOGIN SECURITY VERIFICATION: ${passed} PASSED, ${failed} FAILED (Total ${results.length})`);
  console.log(`==============================================================`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test failure:', err);
  process.exit(1);
});
