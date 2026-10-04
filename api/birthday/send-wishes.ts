import nodemailer from 'nodemailer';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { email, role, name } = body;
    if (!email || !role || !name) {
      return res.status(400).json({ error: 'Missing user details to send birthday wishes.' });
    }

    const smtpUser = process.env.SMTP_USER || process.env.SMTP_EMAIL || process.env.VITE_SMTP_EMAIL || 'security.shikshantar.edu.np@gmail.com';
    const smtpPass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.VITE_SMTP_PASSWORD;

    let subject = '';
    let htmlBody = '';

    if (role === 'student') {
      subject = `🎉 Happy Birthday, ${name}! - Shikshantar Academy`;
      htmlBody = `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #4f46e5;">Happy Birthday, ${name}! 🎈</h2>
          <p>We hope your special day will bring you lots of happiness, love, and fun. You deserve them a lot. Enjoy!</p>
          <p>From,<br><strong>Shikshantar Academy | Bastipur, Karjanha-05, Siraha, Nepal</strong></p>
        </div>
      `;
    } else if (role === 'teacher') {
      subject = `🎂 Wishing You a Happy Birthday, ${name}! - Shikshantar Academy`;
      htmlBody = `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #4f46e5;">Warmest Birthday Wishes, ${name}! 🎓</h2>
          <p>Thank you for your dedication and hard work in shaping the future. We hope you have a relaxing and wonderful birthday.</p>
          <p>Warm regards,<br><strong>Shikshantar Academy Administration</strong><br>Bastipur, Karjanha-05, Siraha, Nepal</p>
        </div>
      `;
    } else {
      subject = `🎉 Happy Birthday to our Admin!`;
      htmlBody = `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #4f46e5;">Happy Birthday, ${name}! 🚀</h2>
          <p>Wishing you success, health, and a fantastic year ahead! Thanks for keeping the system running smoothly.</p>
          <p><strong>- Shikshantar Academy System</strong><br>Bastipur, Karjanha-05, Siraha, Nepal</p>
        </div>
      `;
    }

    if (smtpPass && smtpUser && smtpUser !== 'school@gmail.com') {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: smtpUser,
            pass: smtpPass
          }
        });

        await transporter.sendMail({
          from: `"Shikshantar Academy" <${smtpUser}>`,
          to: email,
          replyTo: 'academyshikshantar@gmail.com',
          subject,
          html: htmlBody
        });
        return res.status(200).json({ success: true, delivered: true, message: 'Birthday wish email delivered.' });
      } catch (mailErr: any) {
        console.warn('[VERCEL BIRTHDAY] Mail send failed:', mailErr.message);
      }
    }

    return res.status(200).json({ success: true, simulated: true, message: 'Birthday wish processed.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
