import crypto from 'crypto';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

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
    admin.initializeApp({
      projectId: fbConfig.projectId
    });
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

export async function verifyVercelCaller(req: any, res: any): Promise<VerifiedCaller | null> {
  const authHeader = req.headers?.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or malformed Authorization header.' });
    return null;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token || token.startsWith('mock_token_')) {
    res.status(401).json({ error: 'Unauthorized: Invalid authentication token format.' });
    return null;
  }

  ensureFirebaseAdmin();
  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await admin.auth().verifyIdToken(token, true);
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    const isHostProjectIamLookupError =
      msg.includes('USER_PROJECT_DENIED') ||
      msg.includes('SERVICE_DISABLED') ||
      msg.includes('accessNotConfigured') ||
      msg.includes('serviceusage.services.use') ||
      msg.includes('identitytoolkit.googleapis.com');

    if (isHostProjectIamLookupError) {
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

  const db = getVercelAdminDb();
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  const emailLower = (decoded.email || '').trim().toLowerCase();
  const isVerifiedBootstrapOwner = emailLower === BOOTSTRAP_OWNER_EMAIL && decoded.email_verified === true;

  if (!userSnap.exists) {
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

  const userData = userSnap.data() || {};
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

export function getCaptchaHmacSecret(): string {
  const configured = (process.env.CAPTCHA_HMAC_SECRET || process.env.IMPACT_TOKEN_SECRET || '').trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Server configuration error: CAPTCHA_HMAC_SECRET environment variable is required in production.');
  }
  return 'dev_captcha_secret_shikshantar_2083_local_only';
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
  const secretKey = (process.env.TURNSTILE_SECRET_KEY || CLOUDFLARE_TEST_SECRET).trim();
  const isCloudflareStaticDummyTestToken =
    secretKey === CLOUDFLARE_TEST_SECRET && cleanToken === 'XXXX.DUMMY.TOKEN.XXXX';
  const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');
  const usedRef = db.collection('used_turnstile_tokens').doc(`ts_${tokenHash}`);

  // Pre-check replay before calling external Siteverify
  // Cloudflare's official test keypair (1x0000...AA) always emits static dummy token 'XXXX.DUMMY.TOKEN.XXXX'.
  // Skip Firestore single-use replay storage ONLY for that official test dummy token under the test secret.
  if (!isCloudflareStaticDummyTestToken) {
    const preSnap = await usedRef.get();
    if (preSnap.exists) {
      return { valid: false, statusCode: 409, error: 'Turnstile token has already been used (replay rejected).' };
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
      if (remoteIp) formParams.append('remoteip', remoteIp);

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
        return {
          valid: false,
          statusCode: 400,
          error: 'Cloudflare Turnstile verification rejected. Please complete the challenge again.'
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
    const consumed = await db.runTransaction(async (txn) => {
      const snap = await txn.get(replayRef);
      if (snap.exists) return false;
      txn.set(replayRef, {
        challengeId: parsedSignedToken.challengeId,
        usedAtMs: nowMs,
        usedAt: new Date(nowMs).toISOString()
      });
      return true;
    });

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
  fromResults: string;
  fromSecurity: string;
  fromGeneral: string;
  transportOptions: Record<string, any> | null;
} {
  const stripWrappingQuotes = (val: string) => val.trim().replace(/^["']|["']$/g, '').trim();
  const isValidEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  const rawUser = stripWrappingQuotes(
    process.env.SMTP_USER || process.env.SMTP_EMAIL || ''
  );
  const rawHost = stripWrappingQuotes(process.env.SMTP_HOST || '');
  let rawPass = stripWrappingQuotes(
    process.env.SMTP_PASSWORD || process.env.SMTP_PASS || ''
  );

  const pickFrom = (specificEnv: string | undefined, fallbackEnv: string | undefined, defaultUser: string): string => {
    const specific = stripWrappingQuotes(specificEnv || '');
    if (isValidEmail(specific)) return specific;
    const fallback = stripWrappingQuotes(fallbackEnv || '');
    if (isValidEmail(fallback)) return fallback;
    return defaultUser;
  };

  const fromResults = pickFrom(process.env.SMTP_FROM_RESULTS, process.env.SMTP_FROM, rawUser);
  const fromSecurity = pickFrom(process.env.SMTP_FROM_SECURITY, process.env.SMTP_FROM, rawUser);
  const fromGeneral = pickFrom(process.env.SMTP_FROM_GENERAL, process.env.SMTP_FROM, rawUser);

  const isGmail = !rawHost || rawHost.toLowerCase().includes('gmail');
  if (isGmail && rawPass) {
    // Google App Passwords are displayed in 4-char groups; strip any pasted spaces
    rawPass = rawPass.replace(/\s+/g, '');
  }

  if (
    !rawUser ||
    !rawPass ||
    rawUser.toLowerCase() === 'school@gmail.com' ||
    PLACEHOLDER_SMTP_PASSWORDS.has(rawPass.toLowerCase())
  ) {
    return {
      configured: false,
      user: rawUser,
      fromResults,
      fromSecurity,
      fromGeneral,
      transportOptions: null
    };
  }

  if (rawHost) {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
    return {
      configured: true,
      user: rawUser,
      fromResults,
      fromSecurity,
      fromGeneral,
      transportOptions: {
        host: rawHost,
        port: Number.isFinite(port) && port > 0 ? port : 587,
        secure,
        auth: { user: rawUser, pass: rawPass }
      }
    };
  }

  return {
    configured: true,
    user: rawUser,
    fromResults,
    fromSecurity,
    fromGeneral,
    transportOptions: {
      service: 'gmail',
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
