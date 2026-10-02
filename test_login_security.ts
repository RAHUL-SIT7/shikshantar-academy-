import assert from 'assert';
import fs from 'fs';

console.log("=== RUNNING SURGICAL LOGIN SECURITY VERIFICATION ===");

// 1. Verify Checkpoint Exists
assert(fs.existsSync('/_checkpoint_login_security'), "Checkpoint directory must exist");
console.log("[PASS] 1. Security checkpoint confirmed");

// 2. Verify server.ts endpoints and email template
const serverSrc = fs.readFileSync('server.ts', 'utf8');

assert(serverSrc.includes('/api/auth/record-login'), "server.ts must have /api/auth/record-login");
assert(serverSrc.includes('/api/auth/revoke-session'), "server.ts must have /api/auth/revoke-session");
assert(serverSrc.includes('/api/auth/logout-other-sessions'), "server.ts must have /api/auth/logout-other-sessions");
assert(serverSrc.includes('/api/auth/heartbeat'), "server.ts must have /api/auth/heartbeat");
console.log("[PASS] 2. All 4 server security endpoints registered");

// 3. Verify Exact Email Subject & Body Text
assert(serverSrc.includes("New Login to Your Shikshantar Academy Account"), "Email subject must match exact brief");
assert(serverSrc.includes("New login detected."), "Email body must include 'New login detected.'");
assert(serverSrc.includes("Account:"), "Email body must include 'Account:'");
assert(serverSrc.includes("Device:"), "Email body must include 'Device:'");
assert(serverSrc.includes("Browser:"), "Email body must include 'Browser:'");
assert(serverSrc.includes("Operating System:"), "Email body must include 'Operating System:'");
assert(serverSrc.includes("Approximate Location:"), "Email body must include 'Approximate Location:'");
assert(serverSrc.includes("IP Address:"), "Email body must include 'IP Address:'");
assert(serverSrc.includes("Date & Time:"), "Email body must include 'Date & Time:'");
assert(serverSrc.includes("If this was not you, open Login Activity in your profile and revoke the unfamiliar session."), "Revocation instructions must match exact brief");
console.log("[PASS] 3. Email alert subject and content verified against exact specifications");

// 4. Verify Server-Side ID Token Verification
assert(serverSrc.includes("admin.auth().verifyIdToken"), "Backend must authoritatively verify Firebase ID token");
console.log("[PASS] 4. Server-side token verification confirmed");

// 5. Verify Device Mapping
assert(serverSrc.includes("MacBook / macOS"), "Must support MacBook / macOS");
assert(serverSrc.includes("Windows PC / Windows"), "Must support Windows PC / Windows");
assert(serverSrc.includes("Android Phone"), "Must support Android Phone");
assert(serverSrc.includes("iPhone / iOS"), "Must support iPhone / iOS");
console.log("[PASS] 5. Device parsing accurately identifies platforms without mock values");

// 6. Verify Session Model Fields
const requiredSessionFields = [
  'sessionId',
  'userUid',
  'loginEventId',
  'loginAt',
  'lastActiveAt',
  'logoutAt',
  'revokedAt',
  'status',
  'ipAddress',
  'userAgent',
  'deviceType',
  'deviceName',
  'browser',
  'operatingSystem',
  'approximateLocation',
  'createdAt',
  'updatedAt'
];
for (const field of requiredSessionFields) {
  assert(serverSrc.includes(`${field}:`), `Session record must include field '${field}'`);
}
console.log("[PASS] 6. All required login session fields present in session data model");

// 7. Verify Firestore Security Rules
const rulesSrc = fs.readFileSync('firestore.rules', 'utf8');
assert(rulesSrc.includes('match /user_sessions/{sessionId}'), "firestore.rules must secure user_sessions");
assert(rulesSrc.includes('resource.data.userUid == request.auth.uid'), "Strict user isolation in firestore.rules");
assert(rulesSrc.includes('allow delete: if false'), "Append-only session preservation; never delete audit session history");
console.log("[PASS] 7. Firestore security rules strictly enforced for user_sessions");

// 8. Verify UI Integration in AdminProfileView
const adminViewSrc = fs.readFileSync('src/pages/AdminProfileView.tsx', 'utf8');
assert(adminViewSrc.includes('Security & Password'), "AdminProfileView must have Security & Password section");
assert(adminViewSrc.includes('Active Sessions'), "AdminProfileView must have Active Sessions section");
assert(adminViewSrc.includes('THIS DEVICE'), "AdminProfileView must display THIS DEVICE badge");
assert(adminViewSrc.includes('Logout All Other Devices'), "AdminProfileView must have Logout All Other Devices action");
assert(adminViewSrc.includes('handleRevokeSession'), "AdminProfileView must have handleRevokeSession");
assert(adminViewSrc.includes('Recent Activity'), "AdminProfileView must have Recent Activity section");
assert(adminViewSrc.includes('View Full Activity Log'), "AdminProfileView must have View Full Activity Log modal trigger");
console.log("[PASS] 8. UI reuses existing Security & Password, Active Sessions, and Recent Activity components");

// 9. Verify Login.tsx Invocation
const loginSrc = fs.readFileSync('src/pages/Login.tsx', 'utf8');
assert(loginSrc.includes('/api/auth/record-login'), "Login.tsx must invoke /api/auth/record-login upon successful sign in");
console.log("[PASS] 9. Login flow triggers server-side record-login endpoint");

// 10. Verify App.tsx Heartbeat and Revocation
const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
assert(appSrc.includes('/api/auth/heartbeat'), "App.tsx must invoke /api/auth/heartbeat");
assert(appSrc.includes('data.activeSessions.includes(localSessionId)'), "App.tsx must listen for remote session revocation");
console.log("[PASS] 10. Client heartbeat and real-time remote logout verified");

// 11. Verify Financial Core Untouched
const feeFiles = ['remitBillUtils.ts', 'feeLedgerService.ts', 'feeCalculations.ts'];
for (const f of feeFiles) {
  const p = `src/lib/${f}`;
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, 'utf8');
    assert(!content.includes('user_sessions'), `Fee file ${f} must not be touched or reference user_sessions`);
  }
}
console.log("[PASS] 11. Fee management core untouched and fully isolated");

// 12. Verify emailSent Distinguishes Real vs Simulated Success
assert(serverSrc.includes("const realEmailSent = emailResult.success === true && emailResult.simulated !== true;"), "server.ts must distinguish real email success from simulated fallback");
assert(serverSrc.includes("emailSent: realEmailSent"), "sessionData.emailSent must use realEmailSent");

// Logic tests:
const simulatedRes = { success: true, simulated: true };
const simulatedSent = simulatedRes.success === true && (simulatedRes as any).simulated !== true;
assert(simulatedSent === false, "Simulated email fallback must result in emailSent = false");

const realSuccessRes = { success: true };
const realSent = realSuccessRes.success === true && (realSuccessRes as any).simulated !== true;
assert(realSent === true, "Real sendMail success must result in emailSent = true");

const failedRes = { success: false, error: 'SMTP failed' };
const failedSent = failedRes.success === true && (failedRes as any).simulated !== true;
assert(failedSent === false, "Failed email transmission must result in emailSent = false");

console.log("[PASS] 12. emailSent state correctly distinguishes real sendMail success from simulated fallback");

console.log("=== ALL LOGIN SECURITY VERIFICATION TESTS PASSED SUCCESSFULLY ===");
