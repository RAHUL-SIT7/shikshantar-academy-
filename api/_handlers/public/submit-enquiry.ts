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
    const { verificationToken } = body;
    const db = getVercelAdminDb();

    const captchaCheck = await consumeVerificationToken(db, verificationToken);
    if (!captchaCheck.valid) {
      return res.status(400).json({ error: captchaCheck.error || 'CAPTCHA verification required.' });
    }

    const name = String(body.name || '').trim().slice(0, 200);
    const phone = String(body.phone || '').trim().slice(0, 40);
    const email = String(body.email || '').trim().slice(0, 200);
    const grade = String(body.grade || 'General Enquiry').trim().slice(0, 100);
    const message = String(body.message || '').trim().slice(0, 2000);
    const studentName = String(body.studentName || '').trim().slice(0, 200);

    if (!name || !phone || (!message && !studentName)) {
      return res.status(400).json({ error: 'Name, phone, and enquiry details are required.' });
    }

    const refId = `ENQ-${Date.now().toString().slice(-6)}`;
    const docRef = await db.collection('contact_enquiries').add({
      name,
      studentName,
      phone,
      email: email || 'N/A',
      grade,
      message,
      rawMessage: String(body.rawMessage || message).trim().slice(0, 2000),
      refId,
      status: 'unread',
      createdAt: new Date().toISOString(),
      submittedAt: FieldValue.serverTimestamp()
    });

    return res.status(201).json({ success: true, id: docRef.id, refId });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to submit contact enquiry.' });
  }
}
