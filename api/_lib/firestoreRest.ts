import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Firestore } from 'firebase-admin/firestore';

function loadRestFirebaseConfig(): { projectId: string; firestoreDatabaseId: string } {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (parsed?.projectId) {
        return {
          projectId: String(parsed.projectId),
          firestoreDatabaseId: String(parsed.firestoreDatabaseId || '(default)')
        };
      }
    }
  } catch {
    // Fallback to environment variables
  }
  return {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'project-4b410c97-a152-49e7-940',
    firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || 'ai-studio-2507c181-4e37-4730-b71a-25b639c27e22'
  };
}

function getRestBaseUrl(): { baseUrl: string; databasePath: string } {
  const cfg = loadRestFirebaseConfig();
  const isEmulator = process.env.USE_FIREBASE_EMULATOR === 'true' || Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const databaseId = isEmulator ? '(default)' : (cfg.firestoreDatabaseId || '(default)');
  const databasePath = `projects/${encodeURIComponent(cfg.projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
  const host = isEmulator && process.env.FIRESTORE_EMULATOR_HOST
    ? `http://${process.env.FIRESTORE_EMULATOR_HOST}`
    : 'https://firestore.googleapis.com';
  return {
    baseUrl: `${host}/v1/${databasePath}`,
    databasePath
  };
}

export function isAdminCredentialError(err: any): boolean {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || '');
  return (
    code === '7' ||
    code === '16' ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('Could not load the default credentials') ||
    msg.includes('Could not refresh access token') ||
    msg.includes('Unable to detect a Project Id') ||
    msg.includes('Metadata server') ||
    msg.includes('metadata.google.internal') ||
    msg.includes('UNAUTHENTICATED') ||
    msg.includes('invalid_grant') ||
    msg.includes('Failed to retrieve') ||
    msg.includes('GOOGLE_APPLICATION_CREDENTIALS') ||
    msg.includes('DECODER routines') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('invalid_rapt')
  );
}

let cachedAdminCredsUnavailable = false;

export function hasExplicitAdminCredentialsEnv(): boolean {
  return Boolean(
    String(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '').trim() ||
    String(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').trim() ||
    (String(process.env.FIREBASE_CLIENT_EMAIL || '').trim() && String(process.env.FIREBASE_PRIVATE_KEY || '').trim()) ||
    String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim() ||
    process.env.USE_FIREBASE_EMULATOR === 'true' ||
    Boolean(process.env.FIRESTORE_EMULATOR_HOST)
  );
}

/**
 * Returns true immediately on Vercel (or after any Admin SDK credential failure)
 * when no GCP service account key is configured, avoiding 4-5s GCE metadata
 * server timeouts on every single Firestore/Auth operation.
 */
export function shouldSkipAdminFirestore(): boolean {
  if (cachedAdminCredsUnavailable) return true;
  if (hasExplicitAdminCredentialsEnv()) return false;
  if (process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV)) {
    return true;
  }
  return false;
}

export function markAdminCredentialsUnavailable(): void {
  cachedAdminCredsUnavailable = true;
}

// ============================================================
// Firestore REST v1 Value Codec
// ============================================================

export function toFirestoreValue(val: any): Record<string, any> {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val) && Number.isSafeInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: Number.isFinite(val) ? val : 0 };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (val instanceof Date) {
    return { timestampValue: val.toISOString() };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.filter((v) => v !== undefined).map((v) => toFirestoreValue(v))
      }
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function fromFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) {
    const n = Number(val.integerValue);
    return Number.isNaN(n) ? 0 : n;
  }
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('stringValue' in val) return String(val.stringValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('arrayValue' in val) {
    const arr = Array.isArray(val.arrayValue?.values) ? val.arrayValue.values : [];
    return arr.map((item: any) => fromFirestoreValue(item));
  }
  if ('mapValue' in val) {
    const out: Record<string, any> = {};
    const fields = val.mapValue?.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return null;
}

function toFirestoreFields(data: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
  }
  return fields;
}

function fromFirestoreDoc(docObj: any): { id: string; data: Record<string, any> } {
  const name = String(docObj?.name || '');
  const id = name.split('/').pop() || '';
  const fields = docObj?.fields || {};
  const data: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    data[k] = fromFirestoreValue(v);
  }
  return { id, data };
}

// ============================================================
// Firestore REST Operations (authenticated with user ID Token)
// ============================================================

export interface HybridDocResult {
  exists: boolean;
  id: string;
  data: Record<string, any> | null;
  viaRest: boolean;
}

export async function restGetDoc(
  collection: string,
  docId: string,
  idToken: string
): Promise<HybridDocResult> {
  const { baseUrl } = getRestBaseUrl();
  const url = `${baseUrl}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json'
    }
  });
  if (res.status === 404) {
    return { exists: false, id: docId, data: null, viaRest: true };
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Firestore REST GET ${collection}/${docId} failed (${res.status}): ${errText.slice(0, 240)}`);
  }
  const parsed = await res.json();
  const decoded = fromFirestoreDoc(parsed);
  return { exists: true, id: decoded.id || docId, data: decoded.data, viaRest: true };
}

export async function restSetDoc(
  collection: string,
  docId: string,
  data: Record<string, any>,
  idToken: string,
  options?: { merge?: boolean }
): Promise<void> {
  const { baseUrl } = getRestBaseUrl();
  const cleanEntries = Object.entries(data).filter(([, v]) => v !== undefined);
  const cleanObj: Record<string, any> = Object.fromEntries(cleanEntries);
  const params = new URLSearchParams();
  if (options?.merge) {
    for (const key of Object.keys(cleanObj)) {
      params.append('updateMask.fieldPaths', key);
    }
  }
  const query = params.toString() ? `?${params.toString()}` : '';
  const url = `${baseUrl}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}${query}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      fields: toFirestoreFields(cleanObj)
    })
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Firestore REST PATCH ${collection}/${docId} failed (${res.status}): ${errText.slice(0, 240)}`);
  }
}

export async function restQueryEq(
  collection: string,
  field: string,
  value: string | number | boolean,
  idToken: string
): Promise<Array<{ id: string; data: Record<string, any> }>> {
  const { baseUrl } = getRestBaseUrl();
  const url = `${baseUrl}:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: 'EQUAL',
            value: toFirestoreValue(value)
          }
        }
      }
    })
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Firestore REST QUERY ${collection} failed (${res.status}): ${errText.slice(0, 240)}`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) return [];
  const out: Array<{ id: string; data: Record<string, any> }> = [];
  for (const row of rows) {
    if (row?.document) {
      out.push(fromFirestoreDoc(row.document));
    }
  }
  return out;
}

// ============================================================
// Hybrid Admin SDK -> Firestore REST Automatic Fallback
// ============================================================

export async function hybridGetDoc(
  db: Firestore,
  idToken: string,
  collection: string,
  docId: string
): Promise<HybridDocResult> {
  if (idToken && shouldSkipAdminFirestore()) {
    return restGetDoc(collection, docId, idToken);
  }
  try {
    const snap = await db.collection(collection).doc(docId).get();
    return {
      exists: snap.exists,
      id: snap.id,
      data: snap.exists ? ((snap.data() as Record<string, any>) || {}) : null,
      viaRest: false
    };
  } catch (err: any) {
    if (!isAdminCredentialError(err) || !idToken) throw err;
    markAdminCredentialsUnavailable();
    return restGetDoc(collection, docId, idToken);
  }
}

export async function hybridSetDoc(
  db: Firestore,
  idToken: string,
  collection: string,
  docId: string,
  data: Record<string, any>,
  options?: { merge?: boolean }
): Promise<{ viaRest: boolean }> {
  if (idToken && shouldSkipAdminFirestore()) {
    await restSetDoc(collection, docId, data, idToken, options);
    return { viaRest: true };
  }
  try {
    if (options?.merge) {
      await db.collection(collection).doc(docId).set(data, { merge: true });
    } else {
      await db.collection(collection).doc(docId).set(data);
    }
    return { viaRest: false };
  } catch (err: any) {
    if (!isAdminCredentialError(err) || !idToken) throw err;
    markAdminCredentialsUnavailable();
    await restSetDoc(collection, docId, data, idToken, options);
    return { viaRest: true };
  }
}

export async function hybridQueryEq(
  db: Firestore,
  idToken: string,
  collection: string,
  field: string,
  value: string | number | boolean
): Promise<{ docs: Array<{ id: string; data: Record<string, any> }>; viaRest: boolean }> {
  if (idToken && shouldSkipAdminFirestore()) {
    const docs = await restQueryEq(collection, field, value, idToken);
    return { docs, viaRest: true };
  }
  try {
    const snap = await db.collection(collection).where(field, '==', value).get();
    return {
      docs: snap.docs.map((d) => ({
        id: d.id,
        data: (d.data() as Record<string, any>) || {}
      })),
      viaRest: false
    };
  } catch (err: any) {
    if (!isAdminCredentialError(err) || !idToken) throw err;
    markAdminCredentialsUnavailable();
    const docs = await restQueryEq(collection, field, value, idToken);
    return { docs, viaRest: true };
  }
}

// ============================================================
// Unforgeable Server-Signed Cryptographic Tokens (HMAC-SHA256)
// Works identically on Vercel Serverless & Cloud Run with ZERO
// GCP Service Account Keys required!
// ============================================================

function getDeviceSecuritySigningSecret(): string {
  const secret = String(
    process.env.DEVICE_SECURITY_SECRET ||
    process.env.CAPTCHA_HMAC_SECRET ||
    process.env.TURNSTILE_SECRET_KEY ||
    process.env.SMTP_PASSWORD ||
    process.env.GEMINI_API_KEY ||
    ''
  ).trim();
  if (secret) {
    return crypto.createHash('sha256').update(`shikshantar-device-sec-v2:${secret}`).digest('hex');
  }
  const cfg = loadRestFirebaseConfig();
  return crypto
    .createHash('sha256')
    .update(`shikshantar-dev-fallback:${cfg.projectId}:${cfg.firestoreDatabaseId}`)
    .digest('hex');
}

function hmacSign(domain: string, payloadB64: string): string {
  return crypto
    .createHmac('sha256', getDeviceSecuritySigningSecret())
    .update(`${domain}:${payloadB64}`)
    .digest('base64url');
}

function timingSafeCompareStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Keyed HMAC-SHA256 hash of a 6-digit OTP so the hash embedded in a signed
 * challenge token cannot be offline brute-forced even over the 1M keyspace.
 */
export function hashOtpKeyed(otpCode: string, salt: string): string {
  return crypto
    .createHmac('sha256', getDeviceSecuritySigningSecret())
    .update(`otp:${salt}:${otpCode}`)
    .digest('hex');
}

/**
 * Unforgeable server-side seal written onto user_sessions/{sessionId} when
 * the server legitimately activates a session (first device, trusted device,
 * or verified 6-digit OTP). Prevents bypassing OTP via direct client Firestore writes.
 */
export function issueSessionSeal(uid: string, sessionId: string): string {
  return crypto
    .createHmac('sha256', getDeviceSecuritySigningSecret())
    .update(`session_seal_v1:${uid}:${sessionId}`)
    .digest('base64url');
}

export function verifySessionSeal(uid: string, sessionId: string, seal: unknown): boolean {
  if (typeof seal !== 'string' || !seal.trim()) return false;
  const expected = issueSessionSeal(uid, sessionId);
  return timingSafeCompareStr(expected, seal.trim());
}

export interface SignedTrustPayload {
  uid: string;
  did: string;
  b: string;
  o: string;
  l: string;
  iat: number;
  exp: number;
}

export function issueSignedTrustToken(input: {
  uid: string;
  deviceId?: string;
  browser: string;
  os: string;
  locationKey: string;
  nowMs: number;
  ttlMs: number;
}): { token: string; deviceId: string } {
  const deviceId =
    input.deviceId ||
    crypto.createHash('sha256').update(`${input.uid}:${crypto.randomBytes(24).toString('hex')}`).digest('hex').slice(0, 48);
  const payload: SignedTrustPayload = {
    uid: input.uid,
    did: deviceId,
    b: input.browser,
    o: input.os,
    l: input.locationKey,
    iat: input.nowMs,
    exp: input.nowMs + input.ttlMs
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = hmacSign('dt_v1', payloadB64);
  return {
    token: `dt.${payloadB64}.${sig}`,
    deviceId
  };
}

export function verifySignedTrustToken(
  rawToken: string,
  expectedUid: string,
  nowMs: number
): SignedTrustPayload | null {
  if (!rawToken || typeof rawToken !== 'string' || !rawToken.startsWith('dt.')) {
    return null;
  }
  const parts = rawToken.split('.');
  if (parts.length !== 3 || parts[0] !== 'dt' || !parts[1] || !parts[2]) {
    return null;
  }
  const expectedSig = hmacSign('dt_v1', parts[1]);
  if (!timingSafeCompareStr(expectedSig, parts[2])) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as SignedTrustPayload;
    if (!parsed || parsed.uid !== expectedUid || !parsed.did) return null;
    if (Number(parsed.exp || 0) <= nowMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface SignedOtpChallengePayload {
  uid: string;
  sid: string;
  h: string; // keyed OTP HMAC hash
  s: string; // random salt
  r: string; // reason
  b: string; // browser
  o: string; // os
  d: string; // deviceName
  loc: string; // location
  ip: string; // ipAddress
  rc: number; // resendCount
  ls: number; // lastSentAtMs
  exp: number; // expiresAtMs
  ed: boolean; // emailDispatched
  sn: boolean; // smtpNotConfigured
}

export function issueSignedOtpChallengeToken(payload: SignedOtpChallengePayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = hmacSign('otp_ch_v1', payloadB64);
  return `otp.${payloadB64}.${sig}`;
}

export function verifySignedOtpChallengeToken(
  rawToken: string,
  expectedUid: string,
  expectedSessionId: string
): SignedOtpChallengePayload | null {
  if (!rawToken || typeof rawToken !== 'string' || !rawToken.startsWith('otp.')) {
    return null;
  }
  const parts = rawToken.split('.');
  if (parts.length !== 3 || parts[0] !== 'otp' || !parts[1] || !parts[2]) {
    return null;
  }
  const expectedSig = hmacSign('otp_ch_v1', parts[1]);
  if (!timingSafeCompareStr(expectedSig, parts[2])) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as SignedOtpChallengePayload;
    if (!parsed || parsed.uid !== expectedUid || parsed.sid !== expectedSessionId) return null;
    if (!parsed.h || !parsed.s) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function resolveTrustedDeviceDocId(uid: string, rawToken: string): string {
  if (rawToken && rawToken.startsWith('dt.')) {
    const parts = rawToken.split('.');
    if (parts.length === 3 && parts[1] && parts[2]) {
      const expectedSig = hmacSign('dt_v1', parts[1]);
      if (timingSafeCompareStr(expectedSig, parts[2])) {
        try {
          const parsed = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          if (parsed?.uid === uid && typeof parsed?.did === 'string' && parsed.did.trim()) {
            return parsed.did.trim();
          }
        } catch {
          // fall through
        }
      }
    }
  }
  return crypto.createHash('sha256').update(`${uid}:${rawToken}`).digest('hex').slice(0, 48);
}
