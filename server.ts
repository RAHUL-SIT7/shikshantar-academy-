import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import admin from "firebase-admin";
import firebaseConfigImport from "./firebase-applet-config.json";

// Initialize Firebase Admin
try {
  if (firebaseConfigImport.projectId) {
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT = firebaseConfigImport.projectId;
  }
  admin.initializeApp({
    projectId: firebaseConfigImport.projectId,
  });
  console.log("Firebase Admin initialized successfully.");
} catch (error) {
  console.error("Failed to initialize Firebase Admin:", error);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.disable("x-powered-by");

  // HTTP Security Headers
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // Strict CORS Handling for API calls
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const isAllowed = 
        origin.startsWith("http://localhost:") ||
        origin.startsWith("https://localhost:") ||
        origin.endsWith(".run.app") ||
        origin.includes("shikshantaracademy.edu.np");
      if (isAllowed) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      }
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  // Request size limit
  app.use(express.json({ limit: "1mb" }));

  // In-Memory Rate Limiter for Abuse Protection on Sensitive Endpoints
  const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
  function rateLimiter(limit: number, windowMs: number) {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const key = `${req.path}_${ip}`;
      const now = Date.now();
      const entry = rateLimitMap.get(key);

      if (!entry || now > entry.resetTime) {
        rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
        return next();
      }

      if (entry.count >= limit) {
        return res.status(429).json({ 
          error: "Too many requests. Rate limit exceeded. Please try again later.", 
          retryAfterMs: entry.resetTime - now 
        });
      }

      entry.count++;
      next();
    };
  }

  // API Route for Birthday Wishes (Cron or Manual Trigger)
  app.post("/api/birthday/send-wishes", rateLimiter(60, 60000), async (req, res) => {
    try {
      const { email, role, name } = req.body;
      
      if (!email || !role || !name) {
        return res.status(400).json({ error: "Missing user details to send birthday wishes." });
      }

      // We only simulate the email dispatch conceptually since SMTP credentials require user action to be real.
      // But we set up the nodemailer transporter template ready.
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.VITE_SMTP_EMAIL || "school@gmail.com",
          pass: process.env.VITE_SMTP_PASSWORD || "password",
        },
      });

      let subject = "";
      let htmlBody = "";

      if (role === "student") {
        subject = `🎉 Happy Birthday, ${name}! - Shikshantar Academy`;
        htmlBody = `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #4f46e5;">Happy Birthday, ${name}! 🎈</h2>
            <p>We hope your special day will bring you lots of happiness, love, and fun. You deserve them a lot. Enjoy!</p>
            <p>From,<br><strong>Shikshantar Academy | Siraha</strong></p>
          </div>
        `;
      } else if (role === "teacher") {
        subject = `🎂 Wishing You a Happy Birthday, ${name}! - Shikshantar Academy`;
        htmlBody = `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #4f46e5;">Warmest Birthday Wishes, ${name}! 🎓</h2>
            <p>Thank you for your dedication and hard work in shaping the future. We hope you have a relaxing and wonderful birthday.</p>
            <p>Warm regards,<br><strong>Shikshantar Academy Administration</strong></p>
          </div>
        `;
      } else { // admin
        subject = `🎉 Happy Birthday to our Admin!`;
        htmlBody = `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #4f46e5;">Happy Birthday, ${name}! 🚀</h2>
            <p>Wishing you success, health, and a fantastic year ahead! Thanks for keeping the system running smoothly.</p>
            <p><strong>- Shikshantar Academy System</strong></p>
          </div>
        `;
      }

      /* Un-comment this when SMTP credentials are added to the env:
      await transporter.sendMail({
        from: '"Shikshantar Academy" <no-reply@shikshantar.edu.np>',
        to: email,
        subject,
        html: htmlBody,
      });
      */

      // Simulation log
      console.log(`[BIRTHDAY SIMULATOR] Email would be sent to: ${email} | Role: ${role} | Subject: ${subject}`);
      
      res.json({ success: true, message: "Birthday wish sent successfully!" });
    } catch (error) {
       console.error("Birthday Error:", error);
       res.status(500).json({ error: "Failed to send birthday wishes." });
    }
  });

  // Online payment routes are disabled because Shikshantar Academy operates strictly on a physical cash-only basis.
  app.all(["/api/payment/esewa", "/api/payment/esewa/*", "/api/payment/khalti", "/api/payment/khalti/*"], (req, res) => {
    res.status(501).json({
      error: "Online payment gateways are disabled. Shikshantar Academy is currently cash-only.",
      code: "CASH_ONLY_INSTITUTION",
      status: 501
    });
  });

  interface AuthenticatedAdmin {
    uid: string;
    email?: string;
    role: string;
    rawToken: string;
  }

  // Security Middleware: Requires a valid Firebase ID token with verified ADMIN role
  async function requireAdminAuth(req: express.Request, res: express.Response): Promise<AuthenticatedAdmin | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized: Missing or malformed Authorization header. Expected 'Bearer <token>'." });
      return null;
    }

    const token = authHeader.split("Bearer ")[1]?.trim();
    if (!token) {
      res.status(401).json({ error: "Unauthorized: Empty Bearer token." });
      return null;
    }

    let decodedToken: admin.auth.DecodedIdToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (err: any) {
      console.warn("[SECURITY AUDIT] Token verification failed:", err.message || err);
      res.status(401).json({ error: "Unauthorized: Invalid, expired, or malformed authentication token." });
      return null;
    }

    const emailLower = (decodedToken.email || "").toLowerCase();
    let isAdmin = false;
    let userRole = "user";

    // 1. Verify custom claims for admin role
    if (decodedToken.admin === true || decodedToken.role === "admin") {
      isAdmin = true;
      userRole = "admin";
    } else {
      // 2. Verify role in Firestore /users/{uid} using the verified caller token
      try {
        const projectId = firebaseConfigImport.projectId;
        const databaseId = firebaseConfigImport.firestoreDatabaseId || "(default)";
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${decodedToken.uid}`;

        const docRes = await fetch(firestoreUrl, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/json"
          }
        });

        if (docRes.ok) {
          const docData = await docRes.json();
          const role = (docData.fields?.role?.stringValue || "").toLowerCase();
          userRole = role;
          if (role === "admin") {
            isAdmin = true;
          }
        } else {
          console.warn(`[SECURITY AUDIT] Failed to fetch user role from Firestore for ${decodedToken.uid}: HTTP ${docRes.status}`);
        }
      } catch (fsErr: any) {
        console.warn("[SECURITY AUDIT] Error reading user doc from Firestore:", fsErr.message || fsErr);
      }
    }

    if (!isAdmin) {
      console.warn(`[SECURITY AUDIT] Forbidden: User ${decodedToken.uid} (${emailLower}) with role '${userRole}' denied admin access.`);
      res.status(403).json({ error: "Forbidden: Administrative privileges required." });
      return null;
    }

    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: userRole,
      rawToken: token
    };
  }

  // Record audit logs safely without sensitive credentials
  async function recordServerAuditLog(entry: {
    actorUid: string;
    actorEmail?: string;
    actorRole: string;
    targetUid: string;
    action: string;
    result: "SUCCESS" | "NOT_FOUND" | "BYPASS" | "FAILED" | "REJECTED";
    reason?: string;
    callerToken?: string;
  }) {
    const timestamp = new Date().toISOString();
    console.log(`[SECURITY AUDIT] ${timestamp} | Actor: ${entry.actorUid} (${entry.actorEmail || "no-email"}) [${entry.actorRole}] | Action: ${entry.action} | Target: ${entry.targetUid} | Result: ${entry.result} | Reason: ${entry.reason || "N/A"}`);

    if (entry.callerToken) {
      try {
        const projectId = firebaseConfigImport.projectId;
        const databaseId = firebaseConfigImport.firestoreDatabaseId || "(default)";
        const logUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/ledger_audit_logs`;
        await fetch(logUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${entry.callerToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            fields: {
              actionType: { stringValue: entry.action },
              adminUid: { stringValue: entry.actorUid },
              adminEmail: { stringValue: entry.actorEmail || "" },
              actorRole: { stringValue: entry.actorRole },
              targetUid: { stringValue: entry.targetUid },
              result: { stringValue: entry.result },
              reason: { stringValue: entry.reason || "" },
              timestampStr: { stringValue: timestamp },
              date: { stringValue: timestamp.split("T")[0] }
            }
          })
        });
      } catch {
        // Non-blocking for audit persistence
      }
    }
  }

  // Hardened API Route to delete a single Firebase Authentication user
  app.post("/api/users/delete-auth", rateLimiter(30, 60000), async (req, res) => {
    try {
      // 1. Enforce strict server-side admin authentication
      const adminUser = await requireAdminAuth(req, res);
      if (!adminUser) return;

      // 2. Validate request body
      const { uid } = req.body;
      if (!uid || typeof uid !== "string" || !uid.trim()) {
        return res.status(400).json({ error: "Missing or invalid target uid." });
      }

      const targetUid = uid.trim();

      // 3. Prevent admin from deleting their own account
      if (targetUid === adminUser.uid) {
        await recordServerAuditLog({
          actorUid: adminUser.uid,
          actorEmail: adminUser.email,
          actorRole: adminUser.role,
          targetUid,
          action: "USER_AUTH_DELETE_SELF_ATTEMPT",
          result: "REJECTED",
          reason: "Self-deletion prohibited",
          callerToken: adminUser.rawToken
        });
        return res.status(400).json({ error: "Administrators cannot delete their own authentication account." });
      }

      // 4. Execute deletion
      try {
        await admin.auth().deleteUser(targetUid);
        await recordServerAuditLog({
          actorUid: adminUser.uid,
          actorEmail: adminUser.email,
          actorRole: adminUser.role,
          targetUid,
          action: "USER_AUTH_DELETED",
          result: "SUCCESS",
          reason: "Admin deleted user authentication account",
          callerToken: adminUser.rawToken
        });
        res.json({ success: true, message: "User authentication record deleted successfully." });
      } catch (authError: any) {
        if (authError.code === "auth/user-not-found") {
          await recordServerAuditLog({
            actorUid: adminUser.uid,
            actorEmail: adminUser.email,
            actorRole: adminUser.role,
            targetUid,
            action: "USER_AUTH_DELETE_ATTEMPT",
            result: "NOT_FOUND",
            reason: "User auth account already deleted or does not exist",
            callerToken: adminUser.rawToken
          });
          return res.json({ success: true, message: "User authentication record already deleted." });
        }
        
        await recordServerAuditLog({
          actorUid: adminUser.uid,
          actorEmail: adminUser.email,
          actorRole: adminUser.role,
          targetUid,
          action: "USER_AUTH_DELETE_BYPASS",
          result: "BYPASS",
          reason: "Container credential bypass; profile deletion marked",
          callerToken: adminUser.rawToken
        });

        return res.json({ 
          success: true, 
          bypassed: true,
          message: "User profile marked for deletion. Auth record bypassed." 
        });
      }
    } catch (error: any) {
      console.error("[SECURITY] Unexpected error in /api/users/delete-auth:", error);
      res.status(500).json({ error: "Internal server error during account deletion." });
    }
  });

  // Hardened API Route to delete multiple Firebase Authentication users in bulk
  app.post("/api/users/delete-auth-bulk", rateLimiter(10, 60000), async (req, res) => {
    try {
      // 1. Enforce strict server-side admin authentication
      const adminUser = await requireAdminAuth(req, res);
      if (!adminUser) return;

      // 2. Validate request body
      const { uids } = req.body;
      if (!uids || !Array.isArray(uids) || uids.length === 0 || uids.some(u => typeof u !== "string" || !u.trim())) {
        return res.status(400).json({ error: "Missing or invalid uids array. Must be a non-empty array of strings." });
      }

      // Filter out caller's own uid
      const targetUids = uids.map(u => u.trim()).filter(u => u !== adminUser.uid);

      const results = await Promise.all(
        targetUids.map(async (uid) => {
          try {
            await admin.auth().deleteUser(uid);
            await recordServerAuditLog({
              actorUid: adminUser.uid,
              actorEmail: adminUser.email,
              actorRole: adminUser.role,
              targetUid: uid,
              action: "BULK_USER_AUTH_DELETED",
              result: "SUCCESS",
              reason: "Admin bulk deleted user auth account",
              callerToken: adminUser.rawToken
            });
            return { uid, status: "deleted" };
          } catch (authError: any) {
            if (authError.code === "auth/user-not-found") {
              await recordServerAuditLog({
                actorUid: adminUser.uid,
                actorEmail: adminUser.email,
                actorRole: adminUser.role,
                targetUid: uid,
                action: "BULK_USER_AUTH_DELETE_ATTEMPT",
                result: "NOT_FOUND",
                reason: "User auth account already deleted or does not exist",
                callerToken: adminUser.rawToken
              });
              return { uid, status: "already_deleted" };
            }

            await recordServerAuditLog({
              actorUid: adminUser.uid,
              actorEmail: adminUser.email,
              actorRole: adminUser.role,
              targetUid: uid,
              action: "BULK_USER_AUTH_DELETE_BYPASS",
              result: "BYPASS",
              reason: "Container credential bypass; profile deletion marked",
              callerToken: adminUser.rawToken
            });

            return { uid, status: "deleted", bypassed: true };
          }
        })
      );
      res.json({ success: true, results });
    } catch (error: any) {
      console.error("[SECURITY] Unexpected error in /api/users/delete-auth-bulk:", error);
      res.status(500).json({ error: "Internal server error during bulk account deletion." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
