import nodemailer from 'nodemailer';
import {
  applyCorsAndSecurityHeaders,
  verifyVercelCaller,
  getVercelAdminDb,
  getSmtpTransportConfig,
  resolveResultNotificationRecipientEmail
} from '../_lib/auth';

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
    const { examId, examType, className, academicYear, students } = body;

    if (!examId || !examType || !className || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'Missing required parameters (examId, examType, className, students array).' });
    }

    const db = getVercelAdminDb();
    const examSnap = await db.collection('exams').doc(String(examId)).get();
    if (!examSnap.exists) {
      return res.status(404).json({ error: 'Examination record not found.' });
    }
    const examData = examSnap.data() || {};
    if (examData.published !== true && examData.status !== 'PUBLISHED') {
      return res.status(400).json({ error: 'Publication notifications can only be sent after the examination is officially published.' });
    }

    const smtpConfig = getSmtpTransportConfig();

    if (!smtpConfig.configured || !smtpConfig.transportOptions) {
      return res.status(503).json({
        success: false,
        error: 'Email delivery service (SMTP) is not configured on the server.',
        code: 'SMTP_NOT_CONFIGURED'
      });
    }

    const transporter = nodemailer.createTransport(smtpConfig.transportOptions as any);

    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const resultsSummary: any[] = [];

    for (const std of students) {
      const studentName = String(std?.name || std?.studentName || 'Student').trim();
      const guardianName = String(std?.guardianName || 'Parent / Guardian').trim();
      const studentUid = String(std?.studentUid || '').trim();
      const studentIdentifier = String(std?.studentId || studentUid || '').trim();

      let mergedEmailLookup: Record<string, any> = {
        guardianEmail: std?.guardianEmail || '',
        parentEmail: std?.parentEmail || '',
        fatherEmail: std?.fatherEmail || '',
        motherEmail: std?.motherEmail || '',
        registeredEmail: std?.registeredEmail || '',
        email: std?.email || ''
      };

      let resolved = resolveResultNotificationRecipientEmail(mergedEmailLookup);
      if (!resolved.email && studentUid) {
        try {
          const userSnap = await db.collection('users').doc(studentUid).get();
          if (userSnap.exists) {
            mergedEmailLookup = { ...(userSnap.data() || {}), ...mergedEmailLookup };
            resolved = resolveResultNotificationRecipientEmail(mergedEmailLookup);
          }
        } catch (_) {}
      }

      const targetEmail = resolved.email;
      const recipientSource = resolved.source;

      if (!targetEmail) {
        skippedCount++;
        resultsSummary.push({ studentId: studentIdentifier, email: '', status: 'SKIPPED_NO_RECIPIENT_EMAIL' });
        continue;
      }

      const idempotencyKey = `${examId}_${studentIdentifier || targetEmail}_${targetEmail}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const uidDispatchKey = studentUid
        ? `${examId}_${studentUid}_${targetEmail}`.replace(/[^a-zA-Z0-9_-]/g, '_')
        : '';
      const dispatchDoc = await db.collection('publication_email_dispatches').doc(idempotencyKey).get();
      const uidDispatchDoc = (uidDispatchKey && uidDispatchKey !== idempotencyKey)
        ? await db.collection('publication_email_dispatches').doc(uidDispatchKey).get()
        : null;
      if (dispatchDoc.exists || uidDispatchDoc?.exists) {
        skippedCount++;
        resultsSummary.push({ studentId: studentIdentifier, email: targetEmail, source: recipientSource, status: 'SKIPPED_ALREADY_SENT' });
        continue;
      }

      const portalLink = `${process.env.APP_URL || 'https://shikshantaracademy.edu.np'}/result`;
      const greetingName = recipientSource === 'student' ? studentName : guardianName;
      const subject = `Academic Result Published: ${studentName} — Shikshantar Academy`;
      const htmlBody = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;"><div style="text-align:center;border-bottom:2px solid #3b82f6;padding-bottom:16px;margin-bottom:20px;"><h2 style="color:#1e3a8a;margin:0;font-size:22px;font-weight:800;">SHIKSHANTAR ACADEMY</h2><p style="color:#64748b;font-size:13px;margin:4px 0 0 0;">Bastipur, Karjanha-05, Siraha, Nepal</p></div><p style="font-size:15px;color:#1e293b;">Dear <strong>${greetingName}</strong>,</p><p style="font-size:14px;color:#334155;">The official <strong>${examType}</strong> academic results for <strong>${studentName}</strong> (Class ${className}, Session ${academicYear || 'Current Session'}) have been officially published.</p><div style="margin:28px 0;text-align:center;"><a href="${portalLink}" style="background:#1e40af;color:#ffffff;padding:12px 28px;font-weight:700;font-size:14px;text-decoration:none;border-radius:8px;display:inline-block;">View Official Result</a></div></div>`;

      try {
        await transporter.sendMail({
          from: `"Shikshantar Academy Results" <${smtpConfig.fromResults}>`,
          to: targetEmail,
          replyTo: smtpConfig.fromResults,
          subject,
          html: htmlBody
        });
        sentCount++;
        resultsSummary.push({ studentId: studentIdentifier, email: targetEmail, source: recipientSource, status: 'DELIVERED' });
        const dispatchPayload = {
          examId,
          studentUid: studentUid || '',
          studentIdentifier,
          recipientEmail: targetEmail,
          recipientSource,
          guardianEmail: recipientSource === 'guardian' ? targetEmail : (mergedEmailLookup.guardianEmail || ''),
          guardianName,
          studentName,
          className,
          academicYear: academicYear || '',
          dispatchedByUid: caller.uid,
          sentAt: new Date().toISOString()
        };
        await db.collection('publication_email_dispatches').doc(idempotencyKey).set(dispatchPayload);
        if (uidDispatchKey && uidDispatchKey !== idempotencyKey) {
          await db.collection('publication_email_dispatches').doc(uidDispatchKey).set(dispatchPayload);
        }
      } catch (sendErr: any) {
        failedCount++;
        resultsSummary.push({ studentId: studentIdentifier, email: targetEmail, status: 'FAILED', error: sendErr.message });
      }
    }

    return res.status(200).json({
      success: true,
      examId,
      totalSent: sentCount,
      skippedCount,
      failedCount,
      results: resultsSummary
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
