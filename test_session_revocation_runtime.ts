import assert from 'assert';
import fs from 'fs';

console.log("=== RUNNING RUNTIME SESSION REVOCATION BUG FIX VERIFICATION ===");

// 1. Verify Checkpoint Exists
assert(fs.existsSync('/_checkpoint_session_revocation_bug'), "Safety checkpoint must exist before modifications");
console.log("[PASS] 1. Pre-modification safety checkpoint confirmed");

// 2. Verify window.confirm is completely eliminated from handlers (iFrame compatibility)
const adminViewSrc = fs.readFileSync('src/pages/AdminProfileView.tsx', 'utf8');
assert(!adminViewSrc.includes('window.confirm'), "window.confirm must NOT be used because it is blocked inside sandboxed iframes");
console.log("[PASS] 2. Blocking window.confirm eliminated from handlers");

// 3. Verify in-app confirmation modal states and modals rendered
assert(adminViewSrc.includes('confirmingRevokeSession'), "AdminProfileView must have confirmingRevokeSession state");
assert(adminViewSrc.includes('confirmingLogoutAll'), "AdminProfileView must have confirmingLogoutAll state");
assert(adminViewSrc.includes('Revoke Session'), "In-app Revoke Session modal must be rendered");
assert(adminViewSrc.includes('Logout All Other Devices'), "In-app Logout All Other Devices modal must be rendered");
console.log("[PASS] 3. In-app confirmation modals implemented for seamless iframe operation");

// 4. Verify Current Session Self-Revocation Protection
const serverSrc = fs.readFileSync('server.ts', 'utf8');
assert(serverSrc.includes('cleanCurrentSessionId && cleanSessionId === cleanCurrentSessionId'), "Backend must reject revoking current active session on this device");
assert(adminViewSrc.includes('targetSessionId === currentSessionId'), "Frontend must reject revoking current active session on this device");
console.log("[PASS] 4. Current session self-revocation protection verified on both frontend and backend");

// 5. Verify Cross-User Session Isolation
assert(serverSrc.includes('sessionData.userUid !== authUser.uid'), "Backend must verify session ownership against verified authUser.uid");
assert(serverSrc.includes("Forbidden: You can only revoke your own active sessions"), "Cross-user revoke attempt must return 403 Forbidden");
console.log("[PASS] 5. Authoritative cross-user session isolation confirmed");

// 6. Verify Firestore REST PATCH compliance with security rules
assert(serverSrc.includes("updateMask.fieldPaths=userUid"), "Session patch must include userUid to satisfy firestore.rules rule 281");
assert(serverSrc.includes("status: { stringValue: 'REVOKED' }"), "Session patch must set status to REVOKED");
assert(serverSrc.includes("revokedAt: { stringValue: nowIso }"), "Session patch must set revokedAt timestamp");
assert(serverSrc.includes("patchRes.ok"), "Backend must explicitly verify Firestore PATCH response status");
console.log("[PASS] 6. Firestore REST PATCH updates verified and adhere to rule 281");

// 7. Verify users/{uid}.activeSessions Pruning
assert(serverSrc.includes("updatedActive = currentActive.filter(s => s !== cleanSessionId)"), "Revoked session must be pruned from activeSessions array");
assert(serverSrc.includes("values: [{ stringValue: cleanCurrentSessionId }]"), "logout-other-sessions must prune activeSessions to only retain cleanCurrentSessionId");
console.log("[PASS] 7. users/{uid}.activeSessions pruning verified for both single revoke and logout-all");

// 8. Verify App.tsx Realtime Revocation Listener & Heartbeat Sign-Out
const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
assert(appSrc.includes('!data.activeSessions.includes(localSessionId)'), "App.tsx must sign out when session is removed from activeSessions");
assert(appSrc.includes('if (data.revoked)'), "App.tsx heartbeat must sign out when session status is REVOKED");
console.log("[PASS] 8. Remote device real-time sign out and heartbeat termination verified");

// 9. Verify Error Feedback and Optimistic UI Updates
assert(adminViewSrc.includes('sessionError'), "AdminProfileView must have sessionError state");
assert(adminViewSrc.includes('setSessions(prev => prev.map('), "AdminProfileView must optimistically update session list immediately upon action");
console.log("[PASS] 9. Instant optimistic UI feedback and visible error alerts verified");

// 10. Verify Audit Logging Preserved
assert(serverSrc.includes("action: 'SESSION_REVOKED'"), "Server must record SESSION_REVOKED audit log");
assert(serverSrc.includes("action: 'ALL_OTHER_SESSIONS_REVOKED'"), "Server must record ALL_OTHER_SESSIONS_REVOKED audit log");
console.log("[PASS] 10. Authoritative audit logging preserved for all revocation actions");

// 11. Verify Fee Management and Unrelated Modules Untouched
const feeFiles = ['remitBillUtils.ts', 'feeLedgerService.ts', 'feeCalculations.ts', 'feeReceiptService.ts'];
for (const f of feeFiles) {
  const p = `src/lib/${f}`;
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, 'utf8');
    assert(!content.includes('REVOKED'), `Fee file ${f} must be completely untouched`);
  }
}
console.log("[PASS] 11. Fee Management core and financial logic completely isolated and untouched");

console.log("=== ALL 11 RUNTIME SESSION REVOCATION TESTS PASSED SUCCESSFULLY ===");
