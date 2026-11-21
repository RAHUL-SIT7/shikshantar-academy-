import { applyCorsAndSecurityHeaders, getVercelAdminDb, verifyVercelCaller } from '../_lib/auth';

export default async function handler(req: any, res: any) {
  applyCorsAndSecurityHeaders(req, res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const caller = await verifyVercelCaller(req, res);
    if (!caller) return;

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { sessionId } = body;
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      return res.status(400).json({ error: 'Missing sessionId.' });
    }

    const cleanSessionId = sessionId.trim();
    const db = getVercelAdminDb();
    const sessionRef = db.collection('user_sessions').doc(cleanSessionId);
    const sessionSnap = await sessionRef.get();

    if (sessionSnap.exists) {
      const sData = sessionSnap.data() || {};
      if (sData.userUid !== caller.uid || sData.status === 'REVOKED') {
        return res.status(401).json({ success: false, revoked: true, error: 'Session revoked or unauthorized.' });
      }
    }

    const nowIso = new Date().toISOString();
    await sessionRef.set(
      {
        sessionId: cleanSessionId,
        userUid: caller.uid,
        lastActiveAt: nowIso,
        updatedAt: nowIso
      },
      { merge: true }
    );

    return res.status(200).json({ success: true, active: true, timestamp: nowIso });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
