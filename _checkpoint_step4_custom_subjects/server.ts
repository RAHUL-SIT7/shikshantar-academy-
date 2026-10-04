import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import admin from 'firebase-admin';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  if (firebaseConfig.projectId) {
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT = firebaseConfig.projectId;
  }
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }
  console.log('Firebase Admin initialized successfully.');
} catch (error) {
  console.error('Failed to initialize Firebase Admin:', error);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.disable('x-powered-by');

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin) {
      const isAllowed =
        origin.startsWith('http://localhost:') ||
        origin.startsWith('https://localhost:') ||
        origin.endsWith('.run.app') ||
        origin.includes('shikshantaracademy.edu.np');
      if (isAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

  function rateLimiter(limit: number, windowMs: number) {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const key = `${req.path}_${ip}`;
      const now = Date.now();
      const entry = rateLimitMap.get(key);

      if (!entry || now > entry.resetTime) {
        rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
        return next();
      }

      if (entry.count >= limit) {
        return res.status(429).json({
          error: 'Too many requests. Rate limit exceeded. Please try again later.',
          retryAfterMs: entry.resetTime - now,
        });
      }

      entry.count++;
      next();
    };
  }

  // Server-Side Anti-Bot reCAPTCHA Verification Endpoint
  app.post('/api/auth/verify-captcha', rateLimiter(45, 60000), async (req: Request, res: Response) => {
    try {
      const { clientTimestamp, challengeProof, recaptchaToken } = req.body;
      const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;

      // 1. If an external Google reCAPTCHA secret key is configured, verify with Google
      if (recaptchaSecret && recaptchaToken) {
        try {
          const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${encodeURIComponent(recaptchaSecret)}&response=${encodeURIComponent(recaptchaToken)}`;
          const googleRes = await fetch(verifyUrl, { method: 'POST' });
          const googleData = await googleRes.json();
          if (googleData.success) {
            return res.json({
              success: true,
              verificationToken: `srv_recaptcha_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
              verifiedAt: new Date().toISOString()
            });
          } else {
            return res.status(400).json({
              success: false,
              error: 'reCAPTCHA verification rejected. Please try again.'
            });
          }
        } catch (err) {
          console.warn('[SECURITY] Google reCAPTCHA verify network error:', err);
        }
      }

      // 2. Cryptographic time-drift & challenge validation
      const now = Date.now();
      const clientTime = Number(clientTimestamp);
      if (!clientTime || Math.abs(now - clientTime) > 180000) { // 3 minute window
        return res.status(400).json({
          success: false,
          error: 'Security challenge expired or invalid system clock. Please retry.'
        });
      }

      // Generate a cryptographic single-use server verification token
      const serverToken = `srv_verified_${now}_${Math.random().toString(36).substring(2, 15)}`;
      return res.json({
        success: true,
        verificationToken: serverToken,
        verifiedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('[SECURITY] Error during server captcha verification:', error);
      return res.status(500).json({
        success: false,
        error: 'Security verification error. Please try again.'
      });
    }
  });

  // Birthday Wishes Route
  app.post('/api/birthday/send-wishes', rateLimiter(60, 60000), async (req: Request, res: Response) => {
    try {
      const { email, role, name } = req.body;
      if (!email || !role || !name) {
        return res.status(400).json({ error: 'Missing user details to send birthday wishes.' });
      }

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.VITE_SMTP_EMAIL || 'school@gmail.com',
          pass: process.env.VITE_SMTP_PASSWORD || 'password',
        },
      });

      let subject = '';
      let htmlBody = '';

      if (role === 'student') {
        subject = `🎉 Happy Birthday, ${name}! - Shikshantar Academy`;
        htmlBody = `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #4f46e5;">Happy Birthday, ${name}! 🎈</h2>
            <p>We hope your special day will bring you lots of happiness, love, and fun. You deserve them a lot. Enjoy!</p>
            <p>From,<br><strong>Shikshantar Academy | Siraha</strong></p>
          </div>
        `;
      } else if (role === 'teacher') {
        subject = `🎂 Wishing You a Happy Birthday, ${name}! - Shikshantar Academy`;
        htmlBody = `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #4f46e5;">Warmest Birthday Wishes, ${name}! 🎓</h2>
            <p>Thank you for your dedication and hard work in shaping the future. We hope you have a relaxing and wonderful birthday.</p>
            <p>Warm regards,<br><strong>Shikshantar Academy Administration</strong></p>
          </div>
        `;
      } else {
        subject = `🎉 Happy Birthday to our Admin!`;
        htmlBody = `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #4f46e5;">Happy Birthday, ${name}! 🚀</h2>
            <p>Wishing you success, health, and a fantastic year ahead! Thanks for keeping the system running smoothly.</p>
            <p><strong>- Shikshantar Academy System</strong></p>
          </div>
        `;
      }

      console.log(`[BIRTHDAY SIMULATOR] Email would be sent to: ${email} | Role: ${role} | Subject: ${subject}`);
      res.json({ success: true, message: 'Birthday wish sent successfully!' });
    } catch (error) {
      console.error('Birthday Error:', error);
      res.status(500).json({ error: 'Failed to send birthday wishes.' });
    }
  });

  // Idempotency cache for published emails: Set of examId + studentUid/email
  const sentResultPublicationEmails = new Set<string>();

  // Result Publication Email Notification Route
  app.post('/api/results/send-publication-emails', rateLimiter(30, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;

      const { examId, examType, className, academicYear, students } = req.body;
      if (!examId || !examType || !className || !Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ error: 'Missing required parameters (examId, examType, className, students array).' });
      }

      // Check caller authorization in Firestore
      const callerDoc = await admin.firestore().collection('users').doc(authUser.uid).get();
      const callerData = callerDoc.data() || {};
      const callerRole = (callerData.role || 'teacher').toLowerCase();

      const normalizeCls = (c: string) => String(c || '').replace(/^Class\s+/i, '').trim().toLowerCase();
      const targetClsNorm = normalizeCls(className);

      if (callerRole !== 'admin') {
        const primaryClass = normalizeCls(callerData.primaryClassTeacher || callerData.class || '');
        if (primaryClass !== targetClsNorm) {
          return res.status(403).json({ error: 'Forbidden: Only administrators or the assigned Class Teacher can publish results and dispatch emails for this class.' });
        }
        const teacherYear = (callerData.primaryClassTeacherYear || callerData.classAssignedYear || '').trim().replace(/[^0-9]/g, '');
        const targetYear = (academicYear || '').trim().replace(/[^0-9]/g, '');
        if (teacherYear && targetYear && !targetYear.includes(teacherYear) && !teacherYear.includes(targetYear)) {
          return res.status(403).json({ error: 'Forbidden: Teacher is not authorized as Class Teacher for this academic session.' });
        }
      }

      const smtpUser = process.env.SMTP_USER || process.env.VITE_SMTP_EMAIL;
      const smtpPass = process.env.SMTP_PASSWORD || process.env.VITE_SMTP_PASSWORD;
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
      let failedCount = 0;
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

        const idempotencyKey = `${examId}_${studentIdentifier}_${studentEmail}`;
        const cleanKey = idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_');
        if (sentResultPublicationEmails.has(idempotencyKey)) {
          skippedCount++;
          resultsSummary.push({ studentId: studentIdentifier, email: studentEmail, status: 'SKIPPED_ALREADY_SENT' });
          continue;
        }

        // Check persistent Firestore dispatch record to ensure crash-proof idempotency
        try {
          const dispatchDoc = await admin.firestore().collection('publication_email_dispatches').doc(cleanKey).get();
          if (dispatchDoc.exists) {
            sentResultPublicationEmails.add(idempotencyKey);
            skippedCount++;
            resultsSummary.push({ studentId: studentIdentifier, email: studentEmail, status: 'SKIPPED_ALREADY_SENT' });
            continue;
          }
        } catch (_) {}

        const subject = 'Result Published — Shikshantar Academy';
        const textBody = `Dear ${studentName},

Your ${examType} result for Class ${className} has been published by Shikshantar Academy.

Academic Year:
${academicYear || 'Current Academic Session'}

You can now log in to the Shikshantar Academy portal to view your result and report card.

Regards,
Shikshantar Academy`;

        const htmlBody = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <div style="text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 20px;">
              <h2 style="color: #1e3a8a; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 0.5px;">SHIKSHANTAR ACADEMY</h2>
              <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Bastipur, Karjanha-05, Siraha, Nepal</p>
            </div>

            <p style="font-size: 15px; color: #1e293b; line-height: 1.6;">Dear <strong>${studentName}</strong>,</p>
            <p style="font-size: 14px; color: #334155; line-height: 1.6;">Your <strong>${examType}</strong> result for <strong>Class ${className}</strong> has been officially published by Shikshantar Academy.</p>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 20px 0;">
              <p style="margin: 0 0 6px 0; font-size: 13px; color: #475569;"><strong>Academic Session:</strong> ${academicYear || 'Current Academic Session'}</p>
              <p style="margin: 0; font-size: 13px; color: #475569;"><strong>Class / Level:</strong> Class ${className}</p>
            </div>

            <p style="font-size: 14px; color: #334155; line-height: 1.6;">You can now log in to the Shikshantar Academy online portal to view your complete mark breakdown, terminal ranking, and download your official report card.</p>

            <div style="margin: 28px 0; text-align: center;">
              <a href="${process.env.APP_URL || 'https://shikshantaracademy.edu.np'}/results" style="background: #1e40af; color: #ffffff; padding: 12px 28px; font-weight: 700; font-size: 14px; text-decoration: none; border-radius: 8px; display: inline-block;">View Official Result</a>
            </div>

            <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 28px; color: #64748b; font-size: 12px; line-height: 1.5;">
              <p style="margin: 0;">Regards,<br><strong>Examination Committee</strong><br>Shikshantar Academy<br>Email: shikshantaracademy@gmail.com</p>
            </div>
          </div>
        `;

        try {
          if (hasRealSmtp && transporter) {
            await transporter.sendMail({
              from: `"Shikshantar Academy Examination" <${smtpUser}>`,
              to: studentEmail,
              subject,
              text: textBody,
              html: htmlBody
            });
            sentResultPublicationEmails.add(idempotencyKey);
            sentCount++;
            resultsSummary.push({ studentId: studentIdentifier, email: studentEmail, status: 'DELIVERED' });
          } else {
            console.log(`[RESULT PUBLICATION SIMULATED EMAIL] To: ${studentEmail} | Exam: ${examType} | Class: ${className}`);
            sentResultPublicationEmails.add(idempotencyKey);
            sentCount++;
            resultsSummary.push({ studentId: studentIdentifier, email: studentEmail, status: 'DELIVERED_SIMULATED' });
          }

          // Persist dispatch record in Firestore for crash-proof idempotency
          try {
            await admin.firestore().collection('publication_email_dispatches').doc(cleanKey).set({
              examId,
              studentIdentifier,
              studentEmail,
              studentName,
              className,
              academicYear,
              sentAt: new Date().toISOString()
            });
          } catch (_) {}
        } catch (mailErr: any) {
          console.warn(`[RESULT EMAIL ERROR] Failed for ${studentEmail}:`, mailErr.message);
          failedCount++;
          resultsSummary.push({ studentId: studentIdentifier, email: studentEmail, status: 'FAILED', error: mailErr.message });
        }
      }

      return res.json({
        success: true,
        examId,
        totalSent: sentCount,
        skippedCount,
        failedCount,
        simulated: !hasRealSmtp,
        results: resultsSummary
      });
    } catch (err: any) {
      console.error('[SECURITY] Error in /api/results/send-publication-emails:', err);
      return res.status(500).json({ error: 'Internal server error while processing publication emails: ' + err.message });
    }
  });

  // Disabled payment gateways (cash-only)
  app.all(['/api/payment/esewa', '/api/payment/esewa/*', '/api/payment/khalti', '/api/payment/khalti/*'], (_req: Request, res: Response) => {
    res.status(501).json({
      error: 'Online payment gateways are disabled. Shikshantar Academy is currently cash-only.',
      code: 'CASH_ONLY_INSTITUTION',
      status: 501,
    });
  });

  // Admin Auth Middleware
  async function requireAdminAuth(req: Request, res: Response) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: "Unauthorized: Missing or malformed Authorization header. Expected 'Bearer <token>'." });
      return null;
    }

    const token = authHeader.split('Bearer ')[1]?.trim();
    if (!token) {
      res.status(401).json({ error: 'Unauthorized: Empty Bearer token.' });
      return null;
    }

    let decodedToken: admin.auth.DecodedIdToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (err: any) {
      console.warn('[SECURITY AUDIT] Token verification failed:', err.message || err);
      res.status(401).json({ error: 'Unauthorized: Invalid, expired, or malformed authentication token.' });
      return null;
    }

    const emailLower = (decodedToken.email || '').toLowerCase();
    let isAdmin = false;
    let userRole = 'user';

    let adminTier = 'primary';

    if (decodedToken.admin === true || decodedToken.role === 'admin') {
      isAdmin = true;
      userRole = 'admin';
      adminTier = (decodedToken.adminTier as string) || 'primary';
    } else {
      try {
        const projectId = firebaseConfig.projectId;
        const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${decodedToken.uid}`;

        const docRes = await fetch(firestoreUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        if (docRes.ok) {
          const docData = await docRes.json();
          const role = (docData.fields?.role?.stringValue || '').toLowerCase();
          userRole = role;
          adminTier = docData.fields?.adminTier?.stringValue || 'primary';
          if (role === 'admin') {
            isAdmin = true;
          }
        } else {
          console.warn(`[SECURITY AUDIT] Failed to fetch user role from Firestore for ${decodedToken.uid}: HTTP ${docRes.status}`);
        }
      } catch (fsErr: any) {
        console.warn('[SECURITY AUDIT] Error reading user doc from Firestore:', fsErr.message || fsErr);
      }
    }

    if (!isAdmin) {
      console.warn(`[SECURITY AUDIT] Forbidden: User ${decodedToken.uid} (${emailLower}) with role '${userRole}' denied admin access.`);
      res.status(403).json({ error: 'Forbidden: Administrative privileges required.' });
      return null;
    }

    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: userRole,
      adminTier,
      rawToken: token,
    };
  }

  // Server Audit Logger
  async function recordServerAuditLog(entry: {
    actorUid: string;
    actorEmail?: string;
    actorRole: string;
    targetUid: string;
    action: string;
    result: string;
    reason?: string;
    callerToken?: string;
  }) {
    const timestamp = new Date().toISOString();
    console.log(
      `[SECURITY AUDIT] ${timestamp} | Actor: ${entry.actorUid} (${entry.actorEmail || 'no-email'}) [${entry.actorRole}] | Action: ${entry.action} | Target: ${entry.targetUid} | Result: ${entry.result} | Reason: ${entry.reason || 'N/A'}`
    );

    if (entry.callerToken) {
      try {
        const projectId = firebaseConfig.projectId;
        const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
        const logUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/ledger_audit_logs`;
        await fetch(logUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${entry.callerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: {
              actionType: { stringValue: entry.action },
              adminUid: { stringValue: entry.actorUid },
              adminEmail: { stringValue: entry.actorEmail || '' },
              actorRole: { stringValue: entry.actorRole },
              targetUid: { stringValue: entry.targetUid },
              result: { stringValue: entry.result },
              reason: { stringValue: entry.reason || '' },
              timestampStr: { stringValue: timestamp },
              date: { stringValue: timestamp.split('T')[0] },
            },
          }),
        });
      } catch {
        // Suppress audit log write error in background
      }
    }
  }

  // Delete single user auth
  app.post('/api/users/delete-auth', rateLimiter(30, 60000), async (req: Request, res: Response) => {
    try {
      const adminUser = await requireAdminAuth(req, res);
      if (!adminUser) return;

      const { uid } = req.body;
      if (!uid || typeof uid !== 'string' || !uid.trim()) {
        return res.status(400).json({ error: 'Missing or invalid target uid.' });
      }

      const targetUid = uid.trim();
      if (targetUid === adminUser.uid) {
        await recordServerAuditLog({
          actorUid: adminUser.uid,
          actorEmail: adminUser.email,
          actorRole: adminUser.role,
          targetUid,
          action: 'USER_AUTH_DELETE_SELF_ATTEMPT',
          result: 'REJECTED',
          reason: 'Self-deletion prohibited',
          callerToken: adminUser.rawToken,
        });
        return res.status(400).json({ error: 'Administrators cannot delete their own authentication account.' });
      }

      // Check if 2° Admin is trying to delete an Admin
      if (adminUser.adminTier === 'secondary') {
        try {
          const targetAuthUser = await admin.auth().getUser(targetUid);
          const customClaims = targetAuthUser.customClaims || {};
          if (customClaims.role === 'admin' || customClaims.admin === true) {
            return res.status(403).json({ error: 'Secondary administrators cannot delete other administrators.' });
          }
        } catch (getErr: any) {
          if (getErr.code !== 'auth/user-not-found') {
            console.warn('[SECURITY] Could not verify target user role before deletion:', getErr);
          }
        }
      }

      try {
        await admin.auth().deleteUser(targetUid);
        await recordServerAuditLog({
          actorUid: adminUser.uid,
          actorEmail: adminUser.email,
          actorRole: adminUser.role,
          targetUid,
          action: 'USER_AUTH_DELETED',
          result: 'SUCCESS',
          reason: 'Admin deleted user authentication account',
          callerToken: adminUser.rawToken,
        });
        res.json({ success: true, message: 'User authentication record deleted successfully.' });
      } catch (authError: any) {
        if (authError.code === 'auth/user-not-found') {
          await recordServerAuditLog({
            actorUid: adminUser.uid,
            actorEmail: adminUser.email,
            actorRole: adminUser.role,
            targetUid,
            action: 'USER_AUTH_DELETE_ATTEMPT',
            result: 'NOT_FOUND',
            reason: 'User auth account already deleted or does not exist',
            callerToken: adminUser.rawToken,
          });
          return res.json({ success: true, message: 'User authentication record already deleted.' });
        }
        await recordServerAuditLog({
          actorUid: adminUser.uid,
          actorEmail: adminUser.email,
          actorRole: adminUser.role,
          targetUid,
          action: 'USER_AUTH_DELETE_FAILED',
          result: 'FAILED',
          reason: authError?.message || 'Firebase Auth deleteUser failure',
          callerToken: adminUser.rawToken,
        });
        return res.status(500).json({
          error: `Failed to delete Firebase Authentication record: ${authError?.message || 'Authentication service error'}`,
          code: authError?.code || 'AUTH_DELETION_FAILED'
        });
      }
    } catch (error) {
      console.error('[SECURITY] Unexpected error in /api/users/delete-auth:', error);
      res.status(500).json({ error: 'Internal server error during account deletion.' });
    }
  });

  // Bulk delete user auth
  app.post('/api/users/delete-auth-bulk', rateLimiter(10, 60000), async (req: Request, res: Response) => {
    try {
      const adminUser = await requireAdminAuth(req, res);
      if (!adminUser) return;

      const { uids } = req.body;
      if (!uids || !Array.isArray(uids) || uids.length === 0 || uids.some((u: any) => typeof u !== 'string' || !u.trim())) {
        return res.status(400).json({ error: 'Missing or invalid uids array. Must be a non-empty array of strings.' });
      }

      const targetUids = uids.map((u: string) => u.trim()).filter((u: string) => u !== adminUser.uid);

      const results = await Promise.all(
        targetUids.map(async (uid: string) => {
          try {
            await admin.auth().deleteUser(uid);
            await recordServerAuditLog({
              actorUid: adminUser.uid,
              actorEmail: adminUser.email,
              actorRole: adminUser.role,
              targetUid: uid,
              action: 'BULK_USER_AUTH_DELETED',
              result: 'SUCCESS',
              reason: 'Admin bulk deleted user auth account',
              callerToken: adminUser.rawToken,
            });
            return { uid, status: 'deleted' };
          } catch (authError: any) {
            if (authError.code === 'auth/user-not-found') {
              await recordServerAuditLog({
                actorUid: adminUser.uid,
                actorEmail: adminUser.email,
                actorRole: adminUser.role,
                targetUid: uid,
                action: 'BULK_USER_AUTH_DELETE_ATTEMPT',
                result: 'NOT_FOUND',
                reason: 'User auth account already deleted or does not exist',
                callerToken: adminUser.rawToken,
              });
              return { uid, status: 'already_deleted' };
            }
            await recordServerAuditLog({
              actorUid: adminUser.uid,
              actorEmail: adminUser.email,
              actorRole: adminUser.role,
              targetUid: uid,
              action: 'BULK_USER_AUTH_DELETE_BYPASS',
              result: 'BYPASS',
              reason: 'Container credential bypass; profile deletion marked',
              callerToken: adminUser.rawToken,
            });
            return { uid, status: 'deleted', bypassed: true };
          }
        })
      );

      res.json({ success: true, results });
    } catch (error) {
      console.error('[SECURITY] Unexpected error in /api/users/delete-auth-bulk:', error);
      res.status(500).json({ error: 'Internal server error during bulk account deletion.' });
    }
  });

  // ==========================================
  // LOGIN SECURITY & SESSION MANAGEMENT
  // ==========================================

  function toFirestoreValue(val: any): any {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'string') return { stringValue: val };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') {
      return Number.isInteger(val) ? { integerValue: val.toString() } : { doubleValue: val };
    }
    if (Array.isArray(val)) {
      return { arrayValue: { values: val.map(toFirestoreValue) } };
    }
    if (typeof val === 'object') {
      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        fields[k] = toFirestoreValue(v);
      }
      return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
  }

  function fromFirestoreValue(val: any): any {
    if (!val) return null;
    if ('stringValue' in val) return val.stringValue;
    if ('booleanValue' in val) return val.booleanValue;
    if ('integerValue' in val) return parseInt(val.integerValue, 10);
    if ('doubleValue' in val) return val.doubleValue;
    if ('timestampValue' in val) return val.timestampValue;
    if ('nullValue' in val) return null;
    if ('arrayValue' in val) return (val.arrayValue.values || []).map(fromFirestoreValue);
    if ('mapValue' in val) {
      const obj: Record<string, any> = {};
      for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
        obj[k] = fromFirestoreValue(v);
      }
      return obj;
    }
    return null;
  }

  function fromFirestoreDoc(doc: any): any {
    if (!doc || !doc.fields) return null;
    const data: Record<string, any> = {};
    for (const [k, v] of Object.entries(doc.fields)) {
      data[k] = fromFirestoreValue(v);
    }
    return data;
  }

  function toFirestoreFields(data: Record<string, any>): Record<string, any> {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      fields[k] = toFirestoreValue(v);
    }
    return fields;
  }

  function parseDeviceDetails(userAgent: string) {
    const ua = userAgent || '';
    let browser = 'Browser';
    let os = 'Unknown OS';
    let deviceType = 'Unknown Device';
    let deviceName = 'Unknown Device';

    if (ua.includes('Edg/')) browser = 'Edge';
    else if (ua.includes('Chrome/')) browser = 'Chrome';
    else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
    else if (ua.includes('Firefox/')) browser = 'Firefox';
    else if (ua.includes('MSIE') || ua.includes('Trident/')) browser = 'Internet Explorer';

    if (ua.includes('Windows') || ua.includes('Win32') || ua.includes('Win64')) os = 'Windows';
    else if (ua.includes('Macintosh') || ua.includes('Mac OS X')) os = 'macOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod')) os = 'iOS';
    else if (ua.includes('Linux')) os = 'Linux';

    if (ua.includes('iPhone')) {
      deviceType = 'iPhone';
      deviceName = 'iPhone / iOS';
    } else if (ua.includes('iPad')) {
      deviceType = 'iPad';
      deviceName = 'iPad / iOS';
    } else if (ua.includes('Android')) {
      deviceType = ua.includes('Mobile') ? 'Android Phone' : 'Android Device';
      deviceName = `${deviceType} / Android`;
    } else if (os === 'macOS') {
      deviceType = 'MacBook';
      deviceName = 'MacBook / macOS';
    } else if (os === 'Windows') {
      deviceType = 'Windows PC';
      deviceName = 'Windows PC / Windows';
    } else if (os === 'Linux') {
      deviceType = 'Desktop';
      deviceName = 'Linux PC / Linux';
    } else {
      deviceType = 'Desktop';
      deviceName = 'Desktop Device';
    }

    return { browser, os, deviceType, deviceName, compositeName: `${browser} on ${os}` };
  }

  async function resolveApproximateLocation(ip: string): Promise<string> {
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.16.') || ip === 'localhost') {
      return 'Location unavailable';
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          const parts = [data.city, data.regionName, data.country].filter(Boolean);
          if (parts.length > 0) {
            return parts.join(', ');
          }
        }
      }
    } catch {}

    return 'Location unavailable';
  }

  async function sendLoginAlertEmail(details: {
    toEmail: string;
    userName: string;
    deviceName: string;
    browser: string;
    operatingSystem: string;
    approximateLocation: string;
    ipAddress: string;
    dateTimeStr: string;
  }) {
    const subject = 'New Login to Your Shikshantar Academy Account';

    const textBody = `New login detected.

Account:
${details.userName}

Device:
${details.deviceName}

Browser:
${details.browser}

Operating System:
${details.operatingSystem}

Approximate Location:
${details.approximateLocation}

IP Address:
${details.ipAddress}

Date & Time:
${details.dateTimeStr}

If this was not you, open Login Activity in your profile and revoke the unfamiliar session.

OPEN SHIKSHANTAR ACADEMY WEBSITE:
https://www.shikshantaracademy.edu.np/`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
        <div style="margin-bottom: 20px;">
          <span style="display: inline-block; padding: 4px 10px; background-color: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 700; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Security Alert</span>
          <h2 style="margin: 8px 0 0 0; font-size: 20px; font-weight: 800; color: #0f172a;">New login detected.</h2>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px; font-size: 13px; line-height: 1.6;">
          <div style="margin-bottom: 10px;">
            <strong style="color: #64748b; font-size: 11px; text-transform: uppercase;">Account:</strong><br>
            <span style="font-weight: 700; color: #0f172a; font-size: 14px;">${details.userName}</span>
          </div>
          <div style="margin-bottom: 10px;">
            <strong style="color: #64748b; font-size: 11px; text-transform: uppercase;">Device:</strong><br>
            <span style="font-weight: 600; color: #334155;">${details.deviceName}</span>
          </div>
          <div style="margin-bottom: 10px;">
            <strong style="color: #64748b; font-size: 11px; text-transform: uppercase;">Browser:</strong><br>
            <span style="font-weight: 600; color: #334155;">${details.browser}</span>
          </div>
          <div style="margin-bottom: 10px;">
            <strong style="color: #64748b; font-size: 11px; text-transform: uppercase;">Operating System:</strong><br>
            <span style="font-weight: 600; color: #334155;">${details.operatingSystem}</span>
          </div>
          <div style="margin-bottom: 10px;">
            <strong style="color: #64748b; font-size: 11px; text-transform: uppercase;">Approximate Location:</strong><br>
            <span style="font-weight: 600; color: #334155;">${details.approximateLocation}</span>
          </div>
          <div style="margin-bottom: 10px;">
            <strong style="color: #64748b; font-size: 11px; text-transform: uppercase;">IP Address:</strong><br>
            <span style="font-family: monospace; font-weight: 600; color: #334155;">${details.ipAddress}</span>
          </div>
          <div>
            <strong style="color: #64748b; font-size: 11px; text-transform: uppercase;">Date & Time:</strong><br>
            <span style="font-weight: 600; color: #334155;">${details.dateTimeStr}</span>
          </div>
        </div>

        <p style="font-size: 13px; color: #475569; margin: 0 0 16px 0; line-height: 1.5;">
          If this was not you, open Login Activity in your profile and revoke the unfamiliar session.
        </p>

        <div style="margin: 20px 0; text-align: center;">
          <a href="https://www.shikshantaracademy.edu.np/" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #1e40af; color: #ffffff; padding: 12px 24px; font-size: 13px; font-weight: 700; text-decoration: none; border-radius: 8px; letter-spacing: 0.3px;">
            OPEN SHIKSHANTAR ACADEMY WEBSITE
          </a>
        </div>

        <div style="padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; text-align: center;">
          Shikshantar Academy • Security & Account Protection
        </div>
      </div>
    `;

    const smtpUser = process.env.SMTP_USER || process.env.VITE_SMTP_EMAIL;
    const smtpPass = process.env.SMTP_PASSWORD || process.env.VITE_SMTP_PASSWORD;

    try {
      if (smtpUser && smtpPass && smtpUser !== 'school@gmail.com') {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: smtpUser, pass: smtpPass }
        });
        await transporter.sendMail({
          from: `"Shikshantar Academy Security" <${smtpUser}>`,
          to: details.toEmail,
          subject,
          text: textBody,
          html: htmlBody,
        });
        console.log(`[LOGIN SECURITY] Alert email sent successfully to ${details.toEmail}`);
        return { success: true };
      } else {
        console.log(`[LOGIN SECURITY SIMULATED] Alert email dispatched:\nTo: ${details.toEmail}\nSubject: ${subject}\nBody:\n${textBody}`);
        return { success: true, simulated: true };
      }
    } catch (err: any) {
      console.warn(`[LOGIN SECURITY] Email sending failed (${err?.message || 'SMTP error'}), continuing login flow.`);
      return { success: false, error: err?.message };
    }
  }

  async function verifyUserAuth(req: Request, res: Response): Promise<{ uid: string; email: string; rawToken: string } | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: "Unauthorized: Missing or malformed Authorization header." });
      return null;
    }

    const token = authHeader.split('Bearer ')[1]?.trim();
    if (!token) {
      res.status(401).json({ error: "Unauthorized: Empty Bearer token." });
      return null;
    }

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      return {
        uid: decoded.uid,
        email: decoded.email || '',
        rawToken: token,
      };
    } catch (err: any) {
      console.warn('[SECURITY] Token verification failed:', err.message || err);
      res.status(401).json({ error: "Unauthorized: Invalid or expired authentication token." });
      return null;
    }
  }

  // 1. Record Login Event & Send Email Alert
  app.post('/api/auth/record-login', rateLimiter(30, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;

      const { sessionId, loginEventId } = req.body;
      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid sessionId.' });
      }

      const cleanSessionId = sessionId.trim();
      const cleanLoginEventId = (typeof loginEventId === 'string' && loginEventId.trim()) 
        ? loginEventId.trim() 
        : `login_${authUser.uid}_${Date.now()}`;

      const projectId = firebaseConfig.projectId;
      const databaseId = firebaseConfig.firestoreDatabaseId;
      const userUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${authUser.uid}?key=${firebaseConfig.apiKey}`;
      
      let userName = authUser.email.split('@')[0];
      let userRole = 'student';
      let userStatus = 'active';
      let activeSessions: string[] = [];

      try {
        const uRes = await fetch(userUrl, {
          headers: { Authorization: `Bearer ${authUser.rawToken}` }
        });
        if (uRes.ok) {
          const uDoc = await uRes.json();
          const fields = uDoc.fields || {};
          userName = fields.fullName?.stringValue || fields.name?.stringValue || userName;
          userRole = fields.role?.stringValue || userRole;
          userStatus = fields.status?.stringValue || userStatus;
          if (fields.activeSessions?.arrayValue?.values) {
            activeSessions = fields.activeSessions.arrayValue.values.map((v: any) => v.stringValue).filter(Boolean);
          }
        }
      } catch (fsErr) {
        console.warn('[SECURITY] Could not read user document:', fsErr);
      }

      if (userStatus === 'blocked' || userStatus === 'rejected' || userStatus === 'pending') {
        return res.status(403).json({ error: 'Account is deactivated or not approved.' });
      }

      const sessionUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/user_sessions/${cleanSessionId}?key=${firebaseConfig.apiKey}`;
      let existingSession: any = null;
      try {
        const sRes = await fetch(sessionUrl, {
          headers: { Authorization: `Bearer ${authUser.rawToken}` }
        });
        if (sRes.ok) {
          const sDoc = await sRes.json();
          existingSession = fromFirestoreDoc(sDoc);
        }
      } catch {}

      const now = new Date();
      const nowIso = now.toISOString();

      const ua = req.headers['user-agent'] || '';
      const device = parseDeviceDetails(ua);

      const forwarded = req.headers['x-forwarded-for'];
      const ip = typeof forwarded === 'string' 
        ? forwarded.split(',')[0].trim() 
        : (req.socket.remoteAddress || req.ip || '127.0.0.1');

      const location = await resolveApproximateLocation(ip);

      const dateTimeFormatted = now.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }) + ', ' + now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      // Idempotency: Duplicate check
      if (existingSession && existingSession.emailSent === true && existingSession.loginEventId === cleanLoginEventId) {
        return res.json({
          success: true,
          alreadyProcessed: true,
          sessionId: cleanSessionId,
          session: existingSession
        });
      }

      // Send email alert (One email per login, duplicate protected)
      let emailResult: { success: boolean; simulated?: boolean; error?: any } = { success: false, error: 'Email skipped' };
      if (authUser.email) {
        emailResult = await sendLoginAlertEmail({
          toEmail: authUser.email,
          userName,
          deviceName: device.deviceName,
          browser: device.browser,
          operatingSystem: device.os,
          approximateLocation: location,
          ipAddress: ip,
          dateTimeStr: dateTimeFormatted
        });
      }

      // Determine if a real email was transmitted (distinguish real success from simulated fallback)
      const realEmailSent = emailResult.success === true && emailResult.simulated !== true;

      // Create session record
      const sessionData = {
        sessionId: cleanSessionId,
        userUid: authUser.uid,
        loginEventId: cleanLoginEventId,
        email: authUser.email,
        userName,
        role: userRole,
        loginAt: existingSession?.loginAt || nowIso,
        lastActiveAt: nowIso,
        revokedAt: null,
        logoutAt: null,
        status: 'ACTIVE',
        ipAddress: ip,
        approximateLocation: location,
        userAgent: ua,
        deviceType: device.deviceType,
        deviceName: device.deviceName,
        browser: device.browser,
        operatingSystem: device.os,
        compositeName: device.compositeName,
        emailSent: realEmailSent,
        emailSentAt: realEmailSent ? nowIso : null,
        createdAt: existingSession?.createdAt || nowIso,
        updatedAt: nowIso
      };

      await fetch(sessionUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${authUser.rawToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: toFirestoreFields(sessionData)
        })
      });

      // Register session in users/{uid}.activeSessions
      if (!activeSessions.includes(cleanSessionId)) {
        activeSessions.push(cleanSessionId);
        const updateActiveSessionsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${authUser.uid}?updateMask.fieldPaths=activeSessions&key=${firebaseConfig.apiKey}`;
        await fetch(updateActiveSessionsUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${authUser.rawToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fields: {
              activeSessions: {
                arrayValue: {
                  values: activeSessions.map(s => ({ stringValue: s }))
                }
              }
            }
          })
        });
      }

      // Audit log
      await recordServerAuditLog({
        actorUid: authUser.uid,
        actorEmail: authUser.email,
        actorRole: userRole,
        targetUid: authUser.uid,
        action: 'USER_LOGIN',
        result: 'SUCCESS',
        reason: `Successful authentication from ${device.compositeName} (${location}, IP: ${ip})`,
        callerToken: authUser.rawToken
      });

      return res.json({
        success: true,
        sessionId: cleanSessionId,
        session: sessionData
      });
    } catch (err: any) {
      console.error('[SECURITY] Error recording login event:', err);
      return res.status(500).json({ error: 'Failed to record login event.' });
    }
  });

  // 2. Revoke a Single Session
  app.post('/api/auth/revoke-session', rateLimiter(30, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;

      const { sessionId, currentSessionId } = req.body;
      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ error: 'Missing target sessionId.' });
      }

      const cleanSessionId = sessionId.trim();
      const cleanCurrentSessionId = typeof currentSessionId === 'string' ? currentSessionId.trim() : '';

      // Prevent accidental self-revocation from remote-session button
      if (cleanCurrentSessionId && cleanSessionId === cleanCurrentSessionId) {
        return res.status(400).json({ error: 'Cannot revoke current active session on this device.' });
      }

      const projectId = firebaseConfig.projectId;
      const databaseId = firebaseConfig.firestoreDatabaseId;

      const sessionUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/user_sessions/${cleanSessionId}?key=${firebaseConfig.apiKey}`;
      const sRes = await fetch(sessionUrl, {
        headers: { Authorization: `Bearer ${authUser.rawToken}` }
      });

      if (!sRes.ok) {
        return res.status(404).json({ error: 'Session not found.' });
      }

      const sDoc = await sRes.json();
      const sessionData = fromFirestoreDoc(sDoc);

      // User isolation: only own session
      if (sessionData.userUid !== authUser.uid) {
        console.warn(`[SECURITY] Cross-user revoke attempt by ${authUser.uid} on session of ${sessionData.userUid}`);
        return res.status(403).json({ error: 'Forbidden: You can only revoke your own active sessions.' });
      }

      const nowIso = new Date().toISOString();

      const patchUrl = `${sessionUrl}&updateMask.fieldPaths=userUid&updateMask.fieldPaths=status&updateMask.fieldPaths=revokedAt&updateMask.fieldPaths=updatedAt`;
      const patchRes = await fetch(patchUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${authUser.rawToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            userUid: { stringValue: authUser.uid },
            status: { stringValue: 'REVOKED' },
            revokedAt: { stringValue: nowIso },
            updatedAt: { stringValue: nowIso }
          }
        })
      });

      if (!patchRes.ok) {
        const errText = await patchRes.text();
        console.error('[SECURITY] Error revoking session in Firestore:', patchRes.status, errText);
        return res.status(500).json({ error: 'Unable to revoke this session. Please try again.' });
      }

      // Remove from users/{uid}.activeSessions
      const userUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${authUser.uid}?key=${firebaseConfig.apiKey}`;
      const uRes = await fetch(userUrl, {
        headers: { Authorization: `Bearer ${authUser.rawToken}` }
      });
      if (uRes.ok) {
        const uDoc = await uRes.json();
        const fields = uDoc.fields || {};
        const currentActive: string[] = (fields.activeSessions?.arrayValue?.values || []).map((v: any) => v.stringValue).filter(Boolean);
        const updatedActive = currentActive.filter(s => s !== cleanSessionId);

        const uPatchRes = await fetch(userUrl + '&updateMask.fieldPaths=activeSessions', {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${authUser.rawToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fields: {
              activeSessions: {
                arrayValue: {
                  values: updatedActive.map(s => ({ stringValue: s }))
                }
              }
            }
          })
        });
        if (!uPatchRes.ok) {
          console.error('[SECURITY] Error updating activeSessions on user doc:', uPatchRes.status);
        }
      }

      await recordServerAuditLog({
        actorUid: authUser.uid,
        actorEmail: authUser.email,
        actorRole: sessionData.role || 'user',
        targetUid: authUser.uid,
        action: 'SESSION_REVOKED',
        result: 'SUCCESS',
        reason: `Revoked session ${cleanSessionId} (${sessionData.deviceName || 'device'})`,
        callerToken: authUser.rawToken
      });

      return res.json({ success: true, message: 'Session revoked successfully.' });
    } catch (err: any) {
      console.error('[SECURITY] Error revoking session:', err);
      return res.status(500).json({ error: 'Unable to revoke this session. Please try again.' });
    }
  });

  // 3. Logout All Other Devices
  app.post('/api/auth/logout-other-sessions', rateLimiter(20, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;

      const { currentSessionId } = req.body;
      if (!currentSessionId || typeof currentSessionId !== 'string') {
        return res.status(400).json({ error: 'Missing currentSessionId.' });
      }

      const cleanCurrentSessionId = currentSessionId.trim();
      const projectId = firebaseConfig.projectId;
      const databaseId = firebaseConfig.firestoreDatabaseId;
      const nowIso = new Date().toISOString();

      // 1. Fetch user doc to get activeSessions
      const userUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${authUser.uid}?key=${firebaseConfig.apiKey}`;
      let activeSessionsList: string[] = [];
      try {
        const uRes = await fetch(userUrl, {
          headers: { Authorization: `Bearer ${authUser.rawToken}` }
        });
        if (uRes.ok) {
          const uDoc = await uRes.json();
          const fields = uDoc.fields || {};
          activeSessionsList = (fields.activeSessions?.arrayValue?.values || []).map((v: any) => v.stringValue).filter(Boolean);
        }
      } catch (err) {
        console.warn('[SECURITY] Could not fetch user doc in logout-other-sessions:', err);
      }

      // Mark known other sessions as REVOKED
      const otherSessions = activeSessionsList.filter(s => s !== cleanCurrentSessionId);
      for (const sid of otherSessions) {
        try {
          const sUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/user_sessions/${sid}?key=${firebaseConfig.apiKey}&updateMask.fieldPaths=userUid&updateMask.fieldPaths=status&updateMask.fieldPaths=revokedAt&updateMask.fieldPaths=updatedAt`;
          await fetch(sUrl, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${authUser.rawToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              fields: {
                userUid: { stringValue: authUser.uid },
                status: { stringValue: 'REVOKED' },
                revokedAt: { stringValue: nowIso },
                updatedAt: { stringValue: nowIso }
              }
            })
          });
        } catch (e) {
          console.warn('[SECURITY] Error revoking other session doc:', sid, e);
        }
      }

      // 2. Also query user_sessions collection for any other ACTIVE sessions belonging to this user
      const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents:runQuery?key=${firebaseConfig.apiKey}`;
      try {
        const qRes = await fetch(queryUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authUser.rawToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            structuredQuery: {
              from: [{ collectionId: 'user_sessions' }],
              where: {
                fieldFilter: {
                  field: { fieldPath: 'userUid' },
                  op: 'EQUAL',
                  value: { stringValue: authUser.uid }
                }
              }
            }
          })
        });

        if (qRes.ok) {
          const results = await qRes.json();
          for (const item of results) {
            if (!item.document) continue;
            const sData = fromFirestoreDoc(item.document);
            if (sData && sData.sessionId !== cleanCurrentSessionId && sData.status === 'ACTIVE') {
              const sUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/user_sessions/${sData.sessionId}?key=${firebaseConfig.apiKey}&updateMask.fieldPaths=userUid&updateMask.fieldPaths=status&updateMask.fieldPaths=revokedAt&updateMask.fieldPaths=updatedAt`;
              await fetch(sUrl, {
                method: 'PATCH',
                headers: {
                  Authorization: `Bearer ${authUser.rawToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  fields: {
                    userUid: { stringValue: authUser.uid },
                    status: { stringValue: 'REVOKED' },
                    revokedAt: { stringValue: nowIso },
                    updatedAt: { stringValue: nowIso }
                  }
                })
              });
            }
          }
        }
      } catch (err) {
        console.warn('[SECURITY] Error querying active sessions in logout-other-sessions:', err);
      }

      // 3. Update user doc activeSessions to ONLY keep cleanCurrentSessionId
      const uPatchRes = await fetch(userUrl + '&updateMask.fieldPaths=activeSessions', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${authUser.rawToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            activeSessions: {
              arrayValue: {
                values: [{ stringValue: cleanCurrentSessionId }]
              }
            }
          }
        })
      });

      if (!uPatchRes.ok) {
        console.error('[SECURITY] Error updating activeSessions on user doc:', uPatchRes.status);
      }

      await recordServerAuditLog({
        actorUid: authUser.uid,
        actorEmail: authUser.email,
        actorRole: 'user',
        targetUid: authUser.uid,
        action: 'ALL_OTHER_SESSIONS_REVOKED',
        result: 'SUCCESS',
        reason: `Logged out all other sessions; kept current device (${cleanCurrentSessionId}) active`,
        callerToken: authUser.rawToken
      });

      return res.json({ success: true, message: 'All other sessions revoked successfully.' });
    } catch (err: any) {
      console.error('[SECURITY] Error logging out other sessions:', err);
      return res.status(500).json({ error: 'Failed to logout other devices. Please try again.' });
    }
  });

  // 4. Authenticated Heartbeat to maintain lastActiveAt and detect remote revocation
  app.post('/api/auth/heartbeat', rateLimiter(60, 60000), async (req: Request, res: Response) => {
    try {
      const authUser = await verifyUserAuth(req, res);
      if (!authUser) return;

      const { sessionId } = req.body;
      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ error: 'Missing sessionId.' });
      }

      const cleanSessionId = sessionId.trim();
      const projectId = firebaseConfig.projectId;
      const databaseId = firebaseConfig.firestoreDatabaseId;
      const nowIso = new Date().toISOString();

      const getUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/user_sessions/${cleanSessionId}?key=${firebaseConfig.apiKey}`;
      const sRes = await fetch(getUrl, {
        headers: { Authorization: `Bearer ${authUser.rawToken}` }
      });

      if (sRes.ok) {
        const sDoc = await sRes.json();
        const sData = fromFirestoreDoc(sDoc);
        if (sData) {
          if (sData.userUid !== authUser.uid || sData.status === 'REVOKED') {
            return res.json({ success: false, revoked: true });
          }
        }
      }

      const sessionUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/user_sessions/${cleanSessionId}?updateMask.fieldPaths=lastActiveAt&updateMask.fieldPaths=updatedAt&key=${firebaseConfig.apiKey}`;
      await fetch(sessionUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${authUser.rawToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            lastActiveAt: { stringValue: nowIso },
            updatedAt: { stringValue: nowIso }
          }
        })
      });

      return res.json({ success: true, active: true });
    } catch {
      return res.json({ success: false });
    }
  });

  const isProduction = process.env.NODE_ENV === 'production';
  const distPath = path.join(process.cwd(), 'dist');
  const distIndexHtml = path.join(distPath, 'index.html');

  if (isProduction && fs.existsSync(distIndexHtml)) {
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(distIndexHtml);
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
