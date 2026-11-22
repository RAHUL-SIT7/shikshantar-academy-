import crypto from 'crypto';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import {
  hybridGetDoc,
  shouldSkipAdminFirestore,
  markAdminCredentialsUnavailable
} from './firestoreRest.js';

export const BOOTSTRAP_OWNER_EMAIL = 'rahulsah4534@gmail.com';

const INACTIVE_STATUSES = new Set([
  'DELETED',
  'AUTH_DELETED_PENDING_FINALIZATION',
  'DELETION_PENDING',
  'INACTIVE',
  'SUSPENDED',
  'BLOCKED',
  'REJECTED',
  'PENDING',
  'ARCHIVED'
]);

function loadFirebaseConfig() {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {
    // Fallback to environment variables
  }
  return {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'project-4b410c97-a152-49e7-940',
    firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || 'ai-studio-2507c181-4e37-4730-b71a-25b639c27e22'
  };
}

export function getFirebaseAdminCredential(): admin.credential.Credential | undefined {
  const rawServiceAccount = String(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''
  ).trim();
  if (rawServiceAccount) {
    try {
      const jsonText = rawServiceAccount.startsWith('{')
        ? rawServiceAccount
        : Buffer.from(rawServiceAccount, 'base64').toString('utf8');
      const parsed = JSON.parse(jsonText);
      if (parsed && typeof parsed === 'object' && parsed.private_key && parsed.client_email) {
        parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
        return admin.credential.cert(parsed);
      }
    } catch (err) {
      console.error('[FIREBASE] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', err);
    }
  }

  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').trim();
  if (clientEmail && privateKey) {
    const fbConfig = loadFirebaseConfig();
    return admin.credential.cert({
      projectId: fbConfig.projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    });
  }

  return undefined;
}

export function isFirestoreCredentialUnavailableError(err: any): boolean {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || '');
  return (
    code === '7' ||
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
    msg.includes('ENOTFOUND')
  );
}

export function ensureFirebaseAdmin() {
  const fbConfig = loadFirebaseConfig();
  if (process.env.USE_FIREBASE_EMULATOR === 'true') {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
    }
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9098';
    }
  } else {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  }
  delete process.env.GOOGLE_CLOUD_QUOTA_PROJECT;
  if (!admin.apps.length) {
    const credential = getFirebaseAdminCredential();
    admin.initializeApp(
      credential
        ? { credential, projectId: fbConfig.projectId }
        : { projectId: fbConfig.projectId }
    );
  }
  return fbConfig;
}

export function getVercelAdminDb() {
  const fbConfig = ensureFirebaseAdmin();
  const isEmulator = process.env.USE_FIREBASE_EMULATOR === 'true' || Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const databaseId = isEmulator ? '(default)' : (fbConfig.firestoreDatabaseId || '(default)');
  return getFirestore(databaseId);
}

export function applyCorsAndSecurityHeaders(req: any, res: any, allowedMethods = 'POST, OPTIONS') {
  const origin = req.headers?.origin;
  if (origin && typeof origin === 'string') {
    const isAllowed =
      origin.startsWith('http://localhost:') ||
      origin.startsWith('https://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.endsWith('.run.app') ||
      origin.endsWith('.vercel.app') ||
      origin.includes('shikshantaracademy.edu.np');
    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
  }
  res.setHeader('Access-Control-Allow-Methods', allowedMethods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Operation-ID');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store');
}

export function isUserProfileInactive(data: any): boolean {
  if (!data || typeof data !== 'object') return true;
  if (data.deleted === true) return true;
  if (data.active === false) return true;
  const status = String(data.status || '').trim().toUpperCase();
  if (status && INACTIVE_STATUSES.has(status)) return true;
  return false;
}

export interface VerifiedCaller {
  uid: string;
  email: string;
  emailVerified: boolean;
  role: 'admin' | 'teacher' | 'student' | 'guest';
  adminTier: 'primary' | 'secondary' | '';
  userData: Record<string, any>;
  rawToken: string;
}

export function hasValidFirebaseIdTokenFormat(token: string): boolean {
  if (!token || typeof token !== 'string' || token.startsWith('mock_token_')) {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    return false;
  }

  let header: Record<string, any>;
  try {
    const parsed = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') return false;
    header = parsed;
  } catch {
    return false;
  }

  const isAuthEmulator =
    process.env.USE_FIREBASE_EMULATOR === 'true' ||
    Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);

  const hasProdKidAndAlg =
    header.alg === 'RS256' &&
    typeof header.kid === 'string' &&
    header.kid.trim().length > 0 &&
    parts[2].length > 0;

  if (isAuthEmulator) {
    return header.alg === 'none' || hasProdKidAndAlg;
  }

  return hasProdKidAndAlg;
}

export async function verifyVercelCaller(req: any, res: any): Promise<VerifiedCaller | null> {
  const authHeader = req.headers?.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or malformed Authorization header.' });
    return null;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  ensureFirebaseAdmin();
  if (!token || !hasValidFirebaseIdTokenFormat(token)) {
    res.status(401).json({ error: 'Unauthorized: Invalid, expired, or malformed authentication token.' });
    return null;
  }

  let decoded: admin.auth.DecodedIdToken;
  if (shouldSkipAdminFirestore()) {
    try {
      decoded = await admin.auth().verifyIdToken(token, false);
    } catch {
      res.status(401).json({
        error: 'Unauthorized: Invalid, expired, or malformed authentication token.'
      });
      return null;
    }
  } else {
    try {
      decoded = await admin.auth().verifyIdToken(token, true);
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      const isHostProjectIamLookupError =
        isFirestoreCredentialUnavailableError(err) ||
        msg.includes('USER_PROJECT_DENIED') ||
        msg.includes('SERVICE_DISABLED') ||
        msg.includes('accessNotConfigured') ||
        msg.includes('serviceusage.services.use') ||
        msg.includes('identitytoolkit.googleapis.com');

      if (isHostProjectIamLookupError) {
        if (isFirestoreCredentialUnavailableError(err)) {
          markAdminCredentialsUnavailable();
        }
        try {
          decoded = await admin.auth().verifyIdToken(token, false);
        } catch {
          res.status(401).json({
            error: 'Unauthorized: Invalid, expired, or malformed authentication token.'
          });
          return null;
        }
      } else {
        const isRevoked = err?.code === 'auth/id-token-revoked';
        res.status(401).json({
          error: isRevoked
            ? 'Unauthorized: Session token has been revoked. Please sign in again.'
            : 'Unauthorized: Invalid, expired, or malformed authentication token.'
        });
        return null;
      }
    }
  }

  const db = getVercelAdminDb();
  const userDoc = await hybridGetDoc(db, token, 'users', decoded.uid);
  const emailLower = (decoded.email || '').trim().toLowerCase();
  const isVerifiedBootstrapOwner = emailLower === BOOTSTRAP_OWNER_EMAIL && decoded.email_verified === true;

  if (!userDoc.exists) {
    if (isVerifiedBootstrapOwner) {
      return {
        uid: decoded.uid,
        email: decoded.email || BOOTSTRAP_OWNER_EMAIL,
        emailVerified: true,
        role: 'admin',
        adminTier: 'primary',
        userData: {
          email: decoded.email || BOOTSTRAP_OWNER_EMAIL,
          role: 'admin',
          adminTier: 'primary',
          active: true,
          status: 'approved'
        },
        rawToken: token
      };
    }
    res.status(403).json({ error: 'Forbidden: Authoritative user profile does not exist.' });
    return null;
  }

  const userData = userDoc.data || {};
  if (isUserProfileInactive(userData)) {
    res.status(403).json({ error: 'Forbidden: User account is inactive, pending, or deleted.' });
    return null;
  }

  const rawRole = String(userData.role || '').trim().toLowerCase();
  let role: VerifiedCaller['role'] | '' = '';
  if (rawRole === 'admin') role = 'admin';
  else if (rawRole === 'teacher' || rawRole === 'class_teacher') role = 'teacher';
  else if (rawRole === 'student') role = 'student';
  else if (rawRole === 'guest') role = 'guest';

  if (!role && isVerifiedBootstrapOwner) {
    role = 'admin';
  }

  if (!role) {
    res.status(403).json({ error: 'Forbidden: User account lacks a valid authoritative role.' });
    return null;
  }

  let adminTier: VerifiedCaller['adminTier'] = '';
  if (role === 'admin') {
    const rawTier = String(userData.adminTier || '').trim().toLowerCase();
    if (rawTier === 'primary' || isVerifiedBootstrapOwner) {
      adminTier = 'primary';
    } else {
      adminTier = 'secondary';
    }
  }

  return {
    uid: decoded.uid,
    email: decoded.email || userData.email || '',
    emailVerified: decoded.email_verified === true,
    role,
    adminTier,
    userData,
    rawToken: token
  };
}

let ephemeralCaptchaHmacSecret = '';

export function getCaptchaHmacSecret(): string {
  const configured = (process.env.CAPTCHA_HMAC_SECRET || process.env.IMPACT_TOKEN_SECRET || '').trim();
  if (configured) return configured;
  if (!ephemeralCaptchaHmacSecret) {
    ephemeralCaptchaHmacSecret = crypto.randomBytes(32).toString('hex');
  }
  return ephemeralCaptchaHmacSecret;
}

export function createSignedChallenge() {
  const secret = getCaptchaHmacSecret();
  const challengeId = crypto.randomBytes(12).toString('hex');
  const a = 2 + Math.floor(Math.random() * 8);
  const b = 1 + Math.floor(Math.random() * 9);
  const answer = a + b;
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 5 * 60 * 1000;
  const payload = `${challengeId}:${answer}:${issuedAt}:${expiresAt}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const challengeToken = Buffer.from(
    JSON.stringify({ challengeId, answerHash: crypto.createHash('sha256').update(`${challengeId}:${answer}:${secret}`).digest('hex'), issuedAt, expiresAt, signature })
  ).toString('base64url');
  return {
    challengeId,
    question: `What is ${a} + ${b}?`,
    expiresAt,
    challengeToken
  };
}

export function verifyChallengeResponse(challengeToken: string, userAnswer: string | number): { valid: boolean; challengeId?: string; error?: string } {
  try {
    const secret = getCaptchaHmacSecret();
    const parsed = JSON.parse(Buffer.from(challengeToken, 'base64url').toString('utf8'));
    if (!parsed || !parsed.challengeId || !parsed.answerHash || !parsed.expiresAt || !parsed.signature) {
      return { valid: false, error: 'Malformed CAPTCHA challenge token.' };
    }
    if (Date.now() > Number(parsed.expiresAt)) {
      return { valid: false, error: 'CAPTCHA challenge expired. Please refresh.' };
    }
    const cleanAnswer = String(userAnswer ?? '').trim();
    if (!/^\d+$/.test(cleanAnswer)) {
      return { valid: false, error: 'Invalid CAPTCHA answer format.' };
    }
    const answerNum = parseInt(cleanAnswer, 10);
    const expectedAnswerHash = crypto.createHash('sha256').update(`${parsed.challengeId}:${answerNum}:${secret}`).digest('hex');
    if (expectedAnswerHash !== parsed.answerHash) {
      return { valid: false, error: 'Incorrect CAPTCHA answer. Please try again.' };
    }
    const payload = `${parsed.challengeId}:${answerNum}:${parsed.issuedAt}:${parsed.expiresAt}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (expectedSig !== parsed.signature) {
      return { valid: false, error: 'Invalid CAPTCHA signature.' };
    }
    return { valid: true, challengeId: parsed.challengeId };
  } catch {
    return { valid: false, error: 'Invalid CAPTCHA challenge token.' };
  }
}

export function getEffectiveNowMs(req?: any): number {
  const isTestOrEmulator =
    process.env.NODE_ENV === 'test' ||
    process.env.USE_FIREBASE_EMULATOR === 'true' ||
    Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  if (isTestOrEmulator && req?.headers) {
    const testHeader = req.headers['x-test-current-time'] || req.headers['X-Test-Current-Time'];
    if (testHeader) {
      const parsed = Number(testHeader);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  return Date.now();
}

export function issueSignedVerificationToken(challengeId: string, kind: 'challenge' | 'turnstile' = 'turnstile', nowMs = Date.now()): string {
  const secret = getCaptchaHmacSecret();
  const nonce = crypto.randomBytes(10).toString('hex');
  const issuedAt = nowMs;
  const expiresAt = issuedAt + 10 * 60 * 1000;
  const raw = `${kind}:${challengeId}:${nonce}:${issuedAt}:${expiresAt}`;
  const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return Buffer.from(JSON.stringify({ kind, challengeId, nonce, issuedAt, expiresAt, sig })).toString('base64url');
}

const memoryUsedTurnstileTokens = new Map<string, number>();

function pruneMemoryTurnstileTokens(nowMs: number) {
  if (memoryUsedTurnstileTokens.size < 500) return;
  const cutoff = nowMs - 15 * 60 * 1000;
  for (const [k, ts] of memoryUsedTurnstileTokens.entries()) {
    if (ts < cutoff) memoryUsedTurnstileTokens.delete(k);
  }
}

const CLOUDFLARE_TEST_SECRET = '1x0000000000000000000000000000000AA';

export async function verifyTurnstileToken(
  db: FirebaseFirestore.Firestore,
  turnstileToken: string,
  remoteIp?: string,
  expectedAction?: string,
  nowMs = Date.now(),
  skipSignedToken = false
): Promise<{ valid: boolean; verificationToken?: string; error?: string; statusCode?: number }> {
  if (!turnstileToken || typeof turnstileToken !== 'string' || !turnstileToken.trim()) {
    return { valid: false, statusCode: 400, error: 'Missing Cloudflare Turnstile token.' };
  }

  const cleanToken = turnstileToken.trim();
  const rawSecret = String(process.env.TURNSTILE_SECRET_KEY || '').trim().replace(/^["']|["']$/g, '').trim();
  const secretKey = rawSecret || CLOUDFLARE_TEST_SECRET;
  const isCloudflareStaticDummyTestToken =
    secretKey === CLOUDFLARE_TEST_SECRET && cleanToken === 'XXXX.DUMMY.TOKEN.XXXX';
  const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');
  const usedRef = db.collection('used_turnstile_tokens').doc(`ts_${tokenHash}`);
  let useMemoryReplayStore = shouldSkipAdminFirestore();

  // Pre-check replay before calling external Siteverify
  // Cloudflare's official test keypair (1x0000...AA) always emits static dummy token 'XXXX.DUMMY.TOKEN.XXXX'.
  // Skip Firestore single-use replay storage ONLY for that official test dummy token under the test secret.
  if (!isCloudflareStaticDummyTestToken) {
    if (memoryUsedTurnstileTokens.has(tokenHash)) {
      return { valid: false, statusCode: 409, error: 'Turnstile token has already been used (replay rejected).' };
    }
    if (!useMemoryReplayStore) {
      try {
        const preSnap = await usedRef.get();
        if (preSnap.exists) {
          return { valid: false, statusCode: 409, error: 'Turnstile token has already been used (replay rejected).' };
        }
      } catch (err) {
        if (isFirestoreCredentialUnavailableError(err)) {
          markAdminCredentialsUnavailable();
          useMemoryReplayStore = true;
        } else {
          throw err;
        }
      }
    }
  }

  let siteverifySuccess = false;
  let siteverifyAction = '';
  let siteverifyHostname = '';

  const isTestOrEmulator =
    process.env.NODE_ENV === 'test' ||
    process.env.USE_FIREBASE_EMULATOR === 'true' ||
    Boolean(process.env.FIRESTORE_EMULATOR_HOST);

  if (isTestOrEmulator && cleanToken.startsWith('TEST_TURNSTILE_VALID_')) {
    siteverifySuccess = true;
    siteverifyAction = expectedAction || '';
    siteverifyHostname = 'localhost';
  } else if (isTestOrEmulator && cleanToken.startsWith('TEST_TURNSTILE_EXPIRED_')) {
    return { valid: false, statusCode: 400, error: 'Turnstile token has expired.' };
  } else if (isTestOrEmulator && cleanToken.startsWith('TEST_TURNSTILE_INVALID_')) {
    return { valid: false, statusCode: 400, error: 'Turnstile verification rejected.' };
  } else {
    try {
      const formParams = new URLSearchParams();
      formParams.append('secret', secretKey);
      formParams.append('response', cleanToken);
      const cleanIp = String(remoteIp || '').trim().replace(/^::ffff:/i, '');
      const isPrivateOrLocalIp =
        !cleanIp ||
        cleanIp === '::1' ||
        cleanIp === 'localhost' ||
        cleanIp.startsWith('127.') ||
        cleanIp.startsWith('10.') ||
        cleanIp.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(cleanIp);
      if (cleanIp && !isPrivateOrLocalIp) {
        formParams.append('remoteip', cleanIp);
      }

      const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formParams.toString()
      });
      const verifyData: any = await verifyRes.json();
      siteverifySuccess = verifyData?.success === true;
      siteverifyAction = String(verifyData?.action || '');
      siteverifyHostname = String(verifyData?.hostname || '');

      if (!siteverifySuccess) {
        const codes: string[] = Array.isArray(verifyData?.['error-codes'])
          ? verifyData['error-codes'].map((c: any) => String(c))
          : [];
        if (codes.includes('invalid-input-secret') || codes.includes('missing-input-secret')) {
          return {
            valid: false,
            statusCode: 500,
            error: 'Cloudflare Turnstile server secret key is misconfigured. Please verify TURNSTILE_SECRET_KEY.'
          };
        }
        if (codes.includes('timeout-or-duplicate')) {
          return {
            valid: false,
            statusCode: 400,
            error: 'Cloudflare Turnstile verification expired or already used. Please click Reset and verify again.'
          };
        }
        return {
          valid: false,
          statusCode: 400,
          error: codes.length
            ? `Cloudflare Turnstile verification rejected (${codes.join(', ')}). Please complete the challenge again.`
            : 'Cloudflare Turnstile verification rejected. Please complete the challenge again.'
        };
      }

      if (expectedAction && siteverifyAction && siteverifyAction !== expectedAction) {
        return {
          valid: false,
          statusCode: 400,
          error: `Turnstile action mismatch (expected "${expectedAction}", received "${siteverifyAction}").`
        };
      }
    } catch (err: any) {
      return {
        valid: false,
        statusCode: 502,
        error: 'Unable to reach Cloudflare Turnstile verification service.'
      };
    }
  }

  // Atomically claim single-use Turnstile token in Firestore (real tokens & emulator test tokens)
  if (!isCloudflareStaticDummyTestToken) {
    if (useMemoryReplayStore) {
      pruneMemoryTurnstileTokens(nowMs);
      if (memoryUsedTurnstileTokens.has(tokenHash)) {
        return { valid: false, statusCode: 409, error: 'Turnstile token has already been used (replay rejected).' };
      }
      memoryUsedTurnstileTokens.set(tokenHash, nowMs);
    } else {
      try {
        const claimed = await db.runTransaction(async (txn) => {
          const snap = await txn.get(usedRef);
          if (snap.exists) return false;
          txn.set(usedRef, {
            tokenHash,
            action: siteverifyAction || expectedAction || 'submit',
            hostname: siteverifyHostname || 'localhost',
            usedAtMs: nowMs,
            usedAt: new Date(nowMs).toISOString()
          });
          return true;
        });

        if (!claimed) {
          return { valid: false, statusCode: 409, error: 'Turnstile token has already been used (replay rejected).' };
        }
      } catch (err) {
        if (isFirestoreCredentialUnavailableError(err)) {
          pruneMemoryTurnstileTokens(nowMs);
          if (memoryUsedTurnstileTokens.has(tokenHash)) {
            return { valid: false, statusCode: 409, error: 'Turnstile token has already been used (replay rejected).' };
          }
          memoryUsedTurnstileTokens.set(tokenHash, nowMs);
        } else {
          throw err;
        }
      }
    }
  }

  const verificationToken = skipSignedToken
    ? cleanToken
    : issueSignedVerificationToken(tokenHash.slice(0, 24), 'turnstile', nowMs);
  return { valid: true, verificationToken };
}

export async function consumeVerificationToken(
  db: FirebaseFirestore.Firestore,
  token: string,
  nowMs = Date.now(),
  remoteIp?: string,
  expectedAction?: string
): Promise<{ valid: boolean; statusCode?: number; error?: string }> {
  try {
    if (!token || typeof token !== 'string' || !token.trim()) {
      return { valid: false, statusCode: 400, error: 'Missing security verification token.' };
    }
    const cleanToken = token.trim();

    // Check whether caller passed an HMAC-signed verificationToken (base64url JSON with .sig)
    let parsedSignedToken: any = null;
    if (!cleanToken.includes('.')) {
      try {
        const candidate = JSON.parse(Buffer.from(cleanToken, 'base64url').toString('utf8'));
        if (candidate && candidate.challengeId && candidate.nonce && candidate.issuedAt && candidate.expiresAt && candidate.sig) {
          parsedSignedToken = candidate;
        }
      } catch {
        // Not a base64url JSON verification token — fall through to Turnstile verification
      }
    }

    // If not a server-signed verification token, treat as a Cloudflare Turnstile token and verify + consume atomically
    if (!parsedSignedToken) {
      const tsCheck = await verifyTurnstileToken(db, cleanToken, remoteIp, expectedAction, nowMs, true);
      if (!tsCheck.valid) {
        return {
          valid: false,
          statusCode: tsCheck.statusCode || 400,
          error: tsCheck.error || 'Cloudflare Turnstile verification failed.'
        };
      }
      return { valid: true };
    }

    const secret = getCaptchaHmacSecret();
    if (nowMs > Number(parsedSignedToken.expiresAt)) {
      return { valid: false, statusCode: 400, error: 'Security verification token has expired. Please verify again.' };
    }
    const raw = `${parsedSignedToken.kind || 'challenge'}:${parsedSignedToken.challengeId}:${parsedSignedToken.nonce}:${parsedSignedToken.issuedAt}:${parsedSignedToken.expiresAt}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    if (expectedSig !== parsedSignedToken.sig) {
      return { valid: false, statusCode: 400, error: 'Forged or tampered security verification token.' };
    }

    const tokenId = crypto.createHash('sha256').update(parsedSignedToken.sig).digest('hex');
    const replayRef = db.collection('used_captcha_challenges').doc(`tok_${tokenId}`);
    let consumed = false;
    try {
      consumed = await db.runTransaction(async (txn) => {
        const snap = await txn.get(replayRef);
        if (snap.exists) return false;
        txn.set(replayRef, {
          challengeId: parsedSignedToken.challengeId,
          usedAtMs: nowMs,
          usedAt: new Date(nowMs).toISOString()
        });
        return true;
      });
    } catch (err) {
      if (isFirestoreCredentialUnavailableError(err)) {
        pruneMemoryTurnstileTokens(nowMs);
        if (memoryUsedTurnstileTokens.has(tokenId)) {
          consumed = false;
        } else {
          memoryUsedTurnstileTokens.set(tokenId, nowMs);
          consumed = true;
        }
      } else {
        throw err;
      }
    }

    if (!consumed) {
      return { valid: false, statusCode: 409, error: 'Security verification token has already been used (replay rejected).' };
    }
    return { valid: true };
  } catch {
    return { valid: false, statusCode: 400, error: 'Malformed security verification token.' };
  }
}

const PLACEHOLDER_SMTP_PASSWORDS = new Set([
  '',
  'your-app-password',
  'my_smtp_password',
  'replace-with-gmail-app-password',
  'changeme'
]);

export function getSmtpTransportConfig(): {
  configured: boolean;
  user: string;
  host: string;
  port: number;
  secure: boolean;
  fromResults: string;
  fromSecurity: string;
  fromGeneral: string;
  resendApiKey: string;
  transportOptions: Record<string, any> | null;
} {
  const stripWrappingQuotes = (val: string) => val.trim().replace(/^["']|["']$/g, '').trim();
  const isValidEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  const extractEmail = (val: string): string => {
    const clean = stripWrappingQuotes(val);
    if (!clean) return '';
    const angleMatch = clean.match(/<([^<>\s]+@[^<>\s]+)>/);
    if (angleMatch && isValidEmail(angleMatch[1])) return angleMatch[1].trim();
    if (isValidEmail(clean)) return clean;
    return '';
  };

  const resendApiKey = stripWrappingQuotes(process.env.RESEND_API_KEY || '');
  const rawUser = extractEmail(process.env.SMTP_USER || process.env.SMTP_EMAIL || '');
  const rawHost = stripWrappingQuotes(process.env.SMTP_HOST || '');
  let rawPass = stripWrappingQuotes(
    process.env.SMTP_PASSWORD || process.env.SMTP_PASS || ''
  );

  const pickFrom = (specificEnv: string | undefined, fallbackEnv: string | undefined, defaultUser: string): string => {
    const specific = extractEmail(specificEnv || '');
    if (specific) return specific;
    const fallback = extractEmail(fallbackEnv || '');
    if (fallback) return fallback;
    return defaultUser;
  };

  const defaultOfficialSecurityFrom = resendApiKey
    ? 'securityalerts@shikshantaracademy.edu.np'
    : (rawUser || 'securityalerts@shikshantaracademy.edu.np');
  const fromResults = pickFrom(process.env.SMTP_FROM_RESULTS, process.env.SMTP_FROM, rawUser || 'results@shikshantaracademy.edu.np');
  const fromSecurity = resendApiKey
    ? pickFrom(process.env.SMTP_FROM_SECURITY, undefined, 'securityalerts@shikshantaracademy.edu.np')
    : pickFrom(process.env.SMTP_FROM_SECURITY, process.env.SMTP_FROM, defaultOfficialSecurityFrom);
  const fromGeneral = pickFrom(process.env.SMTP_FROM_GENERAL, process.env.SMTP_FROM, rawUser || 'info@shikshantaracademy.edu.np');

  const isGmail = !rawHost || rawHost.toLowerCase().includes('gmail');
  if (isGmail && rawPass) {
    // Google App Passwords are displayed in 4-char groups; strip any pasted spaces
    rawPass = rawPass.replace(/\s+/g, '');
  }

  const hasValidSmtp = Boolean(
    rawUser &&
    rawPass &&
    rawUser.toLowerCase() !== 'school@gmail.com' &&
    !PLACEHOLDER_SMTP_PASSWORDS.has(rawPass.toLowerCase())
  );

  if (!hasValidSmtp) {
    return {
      configured: Boolean(resendApiKey),
      user: rawUser,
      host: rawHost,
      port: 587,
      secure: false,
      fromResults,
      fromSecurity,
      fromGeneral,
      resendApiKey,
      transportOptions: null
    };
  }

  if (rawHost) {
    const parsedPort = Number(process.env.SMTP_PORT || 587);
    const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 587;
    // Prevent common SSL wrong-version-number failure when SMTP_PORT=587 has SMTP_SECURE=true
    const secure =
      port === 465
        ? true
        : port === 587
          ? false
          : String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
    return {
      configured: true,
      user: rawUser,
      host: rawHost,
      port,
      secure,
      fromResults,
      fromSecurity,
      fromGeneral,
      resendApiKey,
      transportOptions: {
        host: rawHost,
        port,
        secure,
        ...(port === 587 ? { requireTLS: true } : {}),
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 10000,
        auth: { user: rawUser, pass: rawPass }
      }
    };
  }

  return {
    configured: true,
    user: rawUser,
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    fromResults,
    fromSecurity,
    fromGeneral,
    resendApiKey,
    transportOptions: {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
      auth: { user: rawUser, pass: rawPass }
    }
  };
}

export function isSmtpAuthError(err: any): boolean {
  const code = String(err?.code || '').toUpperCase();
  const responseCode = Number(err?.responseCode || 0);
  const msg = String(err?.message || '');
  return (
    code === 'EAUTH' ||
    responseCode === 535 ||
    msg.includes('535-5.7.8') ||
    msg.includes('535 5.7.8') ||
    /username and password not accepted/i.test(msg)
  );
}

const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLACEHOLDER_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'shikshantar.local',
  'test.local',
  'localhost',
  'invalid'
]);

function isDeliverableEmailAddress(raw: any): string {
  const clean = String(raw || '').trim();
  if (!clean || !EMAIL_FORMAT_REGEX.test(clean)) return '';
  const domain = clean.split('@')[1]?.toLowerCase() || '';
  if (!domain || PLACEHOLDER_EMAIL_DOMAINS.has(domain)) return '';
  return clean;
}

export function resolveResultNotificationRecipientEmail(
  data: Record<string, any> | null | undefined
): { email: string; source: 'guardian' | 'student' | '' } {
  if (!data || typeof data !== 'object') {
    return { email: '', source: '' };
  }

  const guardianCandidates = [
    data.guardianEmail,
    data.parentEmail,
    data.fatherEmail,
    data.motherEmail
  ];
  for (const candidate of guardianCandidates) {
    const valid = isDeliverableEmailAddress(candidate);
    if (valid) {
      return { email: valid, source: 'guardian' };
    }
  }

  const studentCandidates = [
    data.registeredEmail,
    data.email,
    data.studentEmail
  ];
  for (const candidate of studentCandidates) {
    const valid = isDeliverableEmailAddress(candidate);
    if (valid) {
      return { email: valid, source: 'student' };
    }
  }

  return { email: '', source: '' };
}
