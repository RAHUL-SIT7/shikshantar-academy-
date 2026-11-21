import { FieldValue } from 'firebase-admin/firestore';
import { applyCorsAndSecurityHeaders, getVercelAdminDb, verifyVercelCaller } from '../../_lib/auth';

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
    const { sessionId, currentSessionId } = body;

    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      return res.status(400).json({ error: 'Missing target sessionId.' });
    }

    const cleanSessionId = sessionId.trim();
    const cleanCurrentSessionId = typeof currentSessionId === 'string' ? currentSessionId.trim() : '';

    if (cleanCurrentSessionId && cleanSessionId === cleanCurrentSessionId) {
      return res.status(400).json({ error: 'Cannot revoke current active session on this device.' });
    }

    const db = getVercelAdminDb();
    const sessionRef = db.collection('user_sessions').doc(cleanSessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    const sessionData = sessionSnap.data() || {};
    if (sessionData.userUid !== caller.uid) {
      return res.status(403).json({ error: 'Forbidden: You can only revoke your own active sessions.' });
    }

    const nowIso = new Date().toISOString();
    await sessionRef.update({
      status: 'REVOKED',
      revokedAt: nowIso,
      updatedAt: nowIso
    });

    await db.collection('users').doc(caller.uid).update({
      activeSessions: FieldValue.arrayRemove(cleanSessionId)
    }).catch(() => {});

    return res.status(200).json({ success: true, message: 'Session revoked successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
