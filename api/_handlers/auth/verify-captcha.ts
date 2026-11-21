import {
  applyCorsAndSecurityHeaders,
  getVercelAdminDb,
  createSignedChallenge,
  verifyChallengeResponse,
  issueSignedVerificationToken,
  verifyTurnstileToken,
  getEffectiveNowMs
} from '../../_lib/auth';

export default async function handler(req: any, res: any) {
  applyCorsAndSecurityHeaders(req, res, 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    try {
      const challenge = createSignedChallenge();
      return res.status(200).json({ success: true, ...challenge });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Unable to generate security challenge.' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { turnstileToken, action, challengeToken, answer } = body;
    const db = getVercelAdminDb();
    const nowMs = getEffectiveNowMs(req);
    const forwarded = req.headers?.['x-forwarded-for'];
    const remoteIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : undefined;

    if (turnstileToken) {
      const tsRes = await verifyTurnstileToken(db, String(turnstileToken), remoteIp, action ? String(action) : undefined, nowMs);
      if (!tsRes.valid || !tsRes.verificationToken) {
        return res.status(tsRes.statusCode || 400).json({
          success: false,
          error: tsRes.error || 'Cloudflare Turnstile verification failed.'
        });
      }
      return res.status(200).json({
        success: true,
        verificationToken: tsRes.verificationToken,
        verifiedAt: new Date(nowMs).toISOString()
      });
    }

    if (!challengeToken || typeof challengeToken !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing Turnstile token or CAPTCHA challenge token.' });
    }

    const check = verifyChallengeResponse(challengeToken, answer);
    if (!check.valid || !check.challengeId) {
      return res.status(400).json({ success: false, error: check.error || 'CAPTCHA verification failed.' });
    }

    const challengeRef = db.collection('used_captcha_challenges').doc(`chal_${check.challengeId}`);
    const claimed = await db.runTransaction(async (txn) => {
      const snap = await txn.get(challengeRef);
      if (snap.exists) return false;
      txn.set(challengeRef, { kind: 'challenge', usedAtMs: nowMs, usedAt: new Date(nowMs).toISOString() });
      return true;
    });

    if (!claimed) {
      return res.status(409).json({ success: false, error: 'Security challenge already consumed. Please solve a fresh challenge.' });
    }

    return res.status(200).json({
      success: true,
      verificationToken: issueSignedVerificationToken(check.challengeId, 'challenge', nowMs),
      verifiedAt: new Date(nowMs).toISOString()
    });
  } catch (error) {
    console.error('[SECURITY] Error during server captcha verification:', error);
    return res.status(500).json({
      success: false,
      error: 'Security verification error. Please try again.'
    });
  }
}
