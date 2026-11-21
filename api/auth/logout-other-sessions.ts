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
    const { currentSessionId } = body;

    if (!currentSessionId || typeof currentSessionId !== 'string' || !currentSessionId.trim()) {
      return res.status(400).json({ error: 'Missing currentSessionId.' });
    }

    const cleanCurrentSessionId = currentSessionId.trim();
    const db = getVercelAdminDb();
    const nowIso = new Date().toISOString();

    const sessionsSnap = await db.collection('user_sessions').where('userUid', '==', caller.uid).get();
    const batch = db.batch();
    let ops = 0;
    sessionsSnap.forEach((docSnap) => {
      const sData = docSnap.data() || {};
      if (docSnap.id !== cleanCurrentSessionId && sData.status === 'ACTIVE') {
        batch.update(docSnap.ref, {
          status: 'REVOKED',
          revokedAt: nowIso,
          updatedAt: nowIso
        });
        ops++;
      }
    });
    if (ops > 0) {
      await batch.commit();
    }

    await db.collection('users').doc(caller.uid).update({
      activeSessions: [cleanCurrentSessionId]
    });

    return res.status(200).json({ success: true, message: 'All other sessions have been logged out successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
