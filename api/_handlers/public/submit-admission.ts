import { FieldValue } from 'firebase-admin/firestore';
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
    const { verificationToken, formData: submittedForm } = body;
    const db = getVercelAdminDb();

    const captchaCheck = await consumeVerificationToken(db, verificationToken);
    if (!captchaCheck.valid) {
      return res.status(400).json({ error: captchaCheck.error || 'CAPTCHA verification required.' });
    }

    const payloadSource = (submittedForm && typeof submittedForm === 'object') ? submittedForm : body;
    const sanitized: Record<string, any> = {};
    for (const [k, v] of Object.entries(payloadSource)) {
      if (['verificationToken', 'status', 'submittedAt', 'approved', 'reviewedBy', 'trackingId'].includes(k)) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        sanitized[k] = typeof v === 'string' ? v.trim().slice(0, 1000) : v;
      }
    }

    if (!sanitized.studentName && !sanitized.fullName) {
      return res.status(400).json({ error: 'Student name is required.' });
    }

    const currentBSYear = new Date().getFullYear() + 57;
    const trackingId = `SA-${currentBSYear}-${Date.now().toString().slice(-6)}`;

    const docRef = await db.collection('admissions').add({
      ...sanitized,
      trackingId,
      status: 'Pending',
      submittedAt: FieldValue.serverTimestamp(),
      submittedAtIso: new Date().toISOString()
    });

    return res.status(201).json({ success: true, id: docRef.id, trackingId });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to submit admission application.' });
  }
}
