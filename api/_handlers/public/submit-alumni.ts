import { applyCorsAndSecurityHeaders, consumeVerificationToken, getVercelAdminDb } from '../../_lib/auth';

export default async function handler(req: any, res: any) {
  applyCorsAndSecurityHeaders(req, res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { verificationToken } = body;
    const db = getVercelAdminDb();

    const captchaCheck = await consumeVerificationToken(db, verificationToken);
    if (!captchaCheck.valid) {
      return res.status(400).json({ error: captchaCheck.error || 'CAPTCHA verification required.' });
    }

    const name = String(body.name || '').trim().slice(0, 200);
    const batch = String(body.batch || 'SEE Batch 2082').trim().slice(0, 100);
    const currentStatus = String(body.currentStatus || '').trim().slice(0, 200);
    const organization = String(body.organization || '').trim().slice(0, 200);

    if (!name || !currentStatus || !organization) {
      return res.status(400).json({ error: 'Name, current status, and organization are required.' });
    }

    const docRef = await db.collection('alumni_submissions').add({
      name,
      graduationYear: `${batch} Alumni`,
      batch,
      class: 'Class 10',
      seeBand: String(body.seeBand || '3.80 GPA').trim().slice(0, 50),
      currentStatus,
      organization,
      degree: String(body.degree || '').trim().slice(0, 200),
      location: String(body.location || '').trim().slice(0, 200),
      quote: String(body.quote || '').trim().slice(0, 1500),
      achievement: String(body.achievement || '').trim().slice(0, 300),
      category: String(body.category || 'Technology').trim().slice(0, 80),
      photo: null,
      featured: false,
      isGuestRecommended: true,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    return res.status(201).json({ success: true, id: docRef.id });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to submit alumni story.' });
  }
}
