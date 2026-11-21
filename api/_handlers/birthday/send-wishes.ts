import nodemailer from 'nodemailer';
import { applyCorsAndSecurityHeaders, getSmtpTransportConfig, verifyVercelCaller } from '../../_lib/auth';

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
    if (caller.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Administrative privileges required.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { email, role, name } = body;
    if (!email || !role || !name) {
      return res.status(400).json({ error: 'Missing user details to send birthday wishes.' });
    }

    const cleanEmail = String(email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Invalid recipient email address.' });
    }

    const smtpConfig = getSmtpTransportConfig();
    if (!smtpConfig.configured || !smtpConfig.transportOptions) {
      return res.status(503).json({
        success: false,
        error: 'Email delivery service (SMTP) is not configured on the server.',
        code: 'SMTP_NOT_CONFIGURED'
      });
    }

    const safeName = String(name).replace(/[<>]/g, '');
    let subject = `Happy Birthday, ${safeName}! - Shikshantar Academy`;
    let htmlBody = `<div style="font-family: sans-serif; padding: 20px; color: #333;"><h2 style="color: #4f46e5;">Happy Birthday, ${safeName}!</h2><p>Wishing you happiness and success.</p><p><strong>Shikshantar Academy | Bastipur, Karjanha-05, Siraha, Nepal</strong></p></div>`;

    if (role === 'teacher') {
      subject = `Wishing You a Happy Birthday, ${safeName}! - Shikshantar Academy`;
    }

    const transporter = nodemailer.createTransport(smtpConfig.transportOptions as any);

    await transporter.sendMail({
      from: `"Shikshantar Academy" <${smtpConfig.fromGeneral}>`,
      to: cleanEmail,
      replyTo: smtpConfig.fromGeneral,
      subject,
      html: htmlBody
    });

    return res.status(200).json({ success: true, delivered: true, message: 'Birthday wish sent successfully!' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to send birthday wishes.' });
  }
}
