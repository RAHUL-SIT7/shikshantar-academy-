import nodemailer from 'nodemailer';

const firebaseConfig = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "project-4b410c97-a152-49e7-940",
  apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "AIzaSyAGMCbz3zfJMrpgTruOH314BsNuSpyNPB4",
  firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || "ai-studio-2507c181-4e37-4730-b71a-25b639c27e22"
};

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
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header' });
    }

    const token = authHeader.split('Bearer ')[1]?.trim();
    if (!token) {
      return res.status(401).json({ error: 'Empty token' });
    }

    // Verify token with Firebase REST API
    const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`;
    const verifyRes = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    });

    if (!verifyRes.ok) {
      return res.status(401).json({ error: 'Invalid or expired auth token' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { examId, examType, className, academicYear, students } = body;

    if (!examId || !examType || !className || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'Missing required parameters (examId, examType, className, students array).' });
    }

    const smtpUser = process.env.SMTP_USER || process.env.SMTP_EMAIL || process.env.VITE_SMTP_EMAIL || 'security.shikshantar.edu.np@gmail.com';
    const smtpPass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.VITE_SMTP_PASSWORD;
    const hasRealSmtp = Boolean(smtpUser && smtpPass && smtpUser !== 'school@gmail.com');

    let transporter: any = null;
    if (hasRealSmtp) {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: smtpUser, pass: smtpPass }
      });
    }

    let sentCount = 0;
    let skippedCount = 0;
    const resultsSummary: any[] = [];

    for (const std of students) {
      const studentEmail = (std.email || '').trim();
      const studentName = std.name || 'Student';
      const studentIdentifier = std.studentId || std.studentUid || studentEmail;

      if (!studentEmail || !studentEmail.includes('@')) {
        skippedCount++;
        resultsSummary.push({ studentId: studentIdentifier, email: studentEmail, status: 'SKIPPED_NO_EMAIL' });
        continue;
      }

      const subject = `Result Published — Shikshantar Academy (${examType})`;
      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <div style="text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px;">
            <h2 style="color: #1e3a8a; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 0.5px;">SHIKSHANTAR ACADEMY</h2>
            <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Bastipur, Karjanha-05, Siraha, Nepal</p>
          </div>

          <p style="font-size: 15px; color: #1e293b; line-height: 1.6;">Dear <strong>${studentName}</strong>,</p>
          <p style="font-size: 14px; color: #334155; line-height: 1.6;">Your <strong>${examType}</strong> result for <strong>Class ${className}</strong> has been officially published by Shikshantar Academy.</p>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 20px 0;">
            <p style="margin: 0 0 6px 0; font-size: 13px; color: #475569;"><strong>Academic Session:</strong> ${academicYear || 'Current Session'}</p>
            <p style="margin: 0; font-size: 13px; color: #475569;"><strong>Class / Level:</strong> Class ${className}</p>
          </div>

          <p style="font-size: 14px; color: #334155; line-height: 1.6;">You can now log in to the Shikshantar Academy online portal to view your complete mark breakdown and download your official report card.</p>

          <div style="margin: 28px 0; text-align: center;">
            <a href="https://www.shikshantaracademy.edu.np/results" style="background: #2563eb; color: #ffffff; padding: 12px 28px; font-weight: 700; font-size: 14px; text-decoration: none; border-radius: 8px; display: inline-block;">View Official Result</a>
          </div>

          <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 28px; color: #64748b; font-size: 12px; line-height: 1.5;">
            <p style="margin: 0;">Regards,<br><strong>Examination Committee</strong><br>Shikshantar Academy<br>Email: academyshikshantar@gmail.com</p>
          </div>
        </div>
      `;

      try {
        if (hasRealSmtp && transporter) {
          await transporter.sendMail({
            from: `"Shikshantar Academy Examination" <${smtpUser}>`,
            to: studentEmail,
            replyTo: 'academyshikshantar@gmail.com',
            subject,
            html: htmlBody
          });
          sentCount++;
          resultsSummary.push({ studentId: studentIdentifier, email: studentEmail, status: 'DELIVERED' });
        } else {
          sentCount++;
          resultsSummary.push({ studentId: studentIdentifier, email: studentEmail, status: 'SIMULATED' });
        }
      } catch (sendErr: any) {
        resultsSummary.push({ studentId: studentIdentifier, email: studentEmail, status: 'FAILED', error: sendErr.message });
      }
    }

    return res.status(200).json({
      success: true,
      sentCount,
      skippedCount,
      summary: resultsSummary
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
