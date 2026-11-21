import { FieldValue } from 'firebase-admin/firestore';
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
    const authUser = await verifyVercelCaller(req, res);
    if (!authUser) return;

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { sessionId } = body;
    const db = getVercelAdminDb();
    const nowIso = new Date().toISOString();

    if (sessionId && typeof sessionId === 'string' && sessionId.trim()) {
      const cleanSessionId = sessionId.trim();
      const sessionRef = db.collection('user_sessions').doc(cleanSessionId);
      const sSnap = await sessionRef.get();
      if (sSnap.exists && sSnap.data()?.userUid === authUser.uid) {
        await sessionRef.set({
          status: 'LOGGED_OUT',
          logoutAt: nowIso,
          updatedAt: nowIso
        }, { merge: true });
      }
      await db.collection('users').doc(authUser.uid).set({
        activeSessions: FieldValue.arrayRemove(cleanSessionId)
      }, { merge: true });
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to record logout.' });
  }
}
