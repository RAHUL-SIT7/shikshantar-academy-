import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { FieldValue } from 'firebase-admin/firestore';
import { applyCorsAndSecurityHeaders, getSmtpTransportConfig, getVercelAdminDb, isSmtpAuthError, verifyVercelCaller } from '../../_lib/auth';

const BS_CALENDAR_DATA: Record<number, number[]> = {
  2060: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2061: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2062: [30, 32, 31, 32, 31, 31, 29, 30, 29, 30, 29, 31],
  2063: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2064: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2065: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2066: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2067: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2068: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2069: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2070: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2071: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2072: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2073: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2074: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2075: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2076: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2077: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2081: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2082: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2083: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2084: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2085: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2086: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2087: [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30],
  2088: [30, 31, 32, 32, 30, 31, 30, 30, 29, 30, 30, 30],
  2089: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2090: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30]
};

const NEPALI_MONTH_NAMES = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

const REF_AD_TIME = Date.UTC(2003, 3, 14);
const REF_BS_YEAR = 2060;

function formatBSDateTimeServer(dateInput: Date | string | number = new Date()): string {
  try {
    const rawDate = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const validDate = isNaN(rawDate.getTime()) ? new Date() : rawDate;
    const timeStr = validDate.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', hour12: true
    });
    const nptString = validDate.toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' });
    const nptDate = new Date(nptString);
    const y = isNaN(nptDate.getTime()) ? validDate.getUTCFullYear() : nptDate.getFullYear();
    const m = isNaN(nptDate.getTime()) ? validDate.getUTCMonth() : nptDate.getMonth();
    const d = isNaN(nptDate.getTime()) ? validDate.getUTCDate() : nptDate.getDate();

    let diffDays = Math.floor((Date.UTC(y, m, d) - REF_AD_TIME) / 86400000);
    if (diffDays < 0) return `${y + 57} B.S., ${timeStr}`;

    let curYear = REF_BS_YEAR;
    let curMonth = 0;
    let curDay = 1;
    while (diffDays > 0) {
      const yearData = BS_CALENDAR_DATA[curYear];
      const daysInMonth = yearData ? yearData[curMonth] : 30;
      if (diffDays >= daysInMonth) {
        diffDays -= daysInMonth;
        curMonth++;
        if (curMonth > 11) { curMonth = 0; curYear++; }
      } else {
        curDay += diffDays;
        diffDays = 0;
      }
    }
    return `${String(curDay).padStart(2, '0')} ${NEPALI_MONTH_NAMES[curMonth] || 'Ashwin'} ${curYear}, ${timeStr}`;
  } catch {
    return new Date().toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' });
  }
}

function parseDeviceDetails(ua: string, clientBrowser?: string) {
  let browser = 'Unknown Browser';
  const validClientBrowsers = ['Brave', 'Chrome', 'Safari', 'Firefox', 'Microsoft Edge', 'Opera', 'Samsung Internet', 'Vivaldi'];
  if (clientBrowser && typeof clientBrowser === 'string' && validClientBrowsers.includes(clientBrowser.trim())) {
    browser = clientBrowser.trim();
  } else if (ua.includes('Edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera';
  else if (ua.includes('Vivaldi/')) browser = 'Vivaldi';
  else if (ua.includes('SamsungBrowser/')) browser = 'Samsung Internet';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
  else if (ua.includes('Firefox/')) browser = 'Firefox';

  let os = 'Unknown OS';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Macintosh') || ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';

  let deviceType = 'Desktop';
  let deviceName = `${os} Device`;
  if (ua.includes('iPhone')) { deviceType = 'iPhone'; deviceName = 'iPhone / iOS'; }
  else if (ua.includes('iPad')) { deviceType = 'iPad'; deviceName = 'iPad / iOS'; }
  else if (ua.includes('Android')) { deviceType = ua.includes('Mobile') ? 'Android Phone' : 'Android Device'; deviceName = `${deviceType} / Android`; }
  else if (os === 'macOS') { deviceType = 'MacBook'; deviceName = 'MacBook / macOS'; }
  else if (os === 'Windows') { deviceType = 'Windows PC'; deviceName = 'Windows PC / Windows'; }

  return { browser, os, deviceType, deviceName };
}

async function resolveApproximateLocation(ip: string): Promise<string> {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
    return 'Location unavailable';
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data: any = await res.json();
      if (data.status === 'success') {
        const parts = [data.city, data.regionName, data.country].filter(Boolean);
        if (parts.length > 0) return parts.join(', ');
      }
    }
  } catch {}
  return 'Location unavailable';
}

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
    const { sessionId, loginEventId, clientBrowser } = body;

    const db = getVercelAdminDb();
    const nowMs = Date.now();
    const email = caller.email || caller.userData.email || '';
    const normEmail = String(email).trim().toLowerCase();
    if (normEmail) {
      const acctKey = `login_acct_${crypto.createHash('sha256').update(normEmail).digest('hex').slice(0, 32)}`;
      const acctSnap = await db.collection('security_rate_limits').doc(acctKey).get();
      const lockedUntilMs = Number(acctSnap.data()?.lockedUntilMs || 0);
      if (lockedUntilMs > nowMs) {
        const retryAfterSeconds = Math.ceil((lockedUntilMs - nowMs) / 1000);
        return res.status(423).json({
          error: `Account is temporarily locked for ${Math.ceil(retryAfterSeconds / 60)} minute(s). Please wait before signing in.`,
          locked: true,
          retryAfterSeconds,
          lockedUntil: new Date(lockedUntilMs).toISOString()
        });
      }
    }

    const cleanSessionId = sessionId?.trim() || `sess_${Date.now()}`;
    const cleanLoginEventId = loginEventId?.trim() || `login_${caller.uid}_${Date.now()}`;
    const userName = caller.userData.fullName || caller.userData.name || (caller.email ? caller.email.split('@')[0] : 'Portal User');
    const userRole = caller.role;
    const activeSessions: string[] = Array.isArray(caller.userData?.activeSessions) ? [...caller.userData.activeSessions] : [];

    const sessionRef = db.collection('user_sessions').doc(cleanSessionId);
    const sessionSnap = await sessionRef.get();
    const existingSession: any = sessionSnap.exists ? sessionSnap.data() : null;

    if (existingSession && existingSession.userUid && existingSession.userUid !== caller.uid) {
      return res.status(403).json({ error: 'Forbidden: Session identifier belongs to another user.' });
    }
    if (existingSession && existingSession.status === 'REVOKED') {
      return res.status(401).json({ error: 'Session has been revoked. Please sign in again.', revoked: true });
    }

    // Persist activeSessions immediately before slow GeoIP / SMTP lookups
    if (!activeSessions.includes(cleanSessionId)) {
      await db.collection('users').doc(caller.uid).set({
        activeSessions: FieldValue.arrayUnion(cleanSessionId)
      }, { merge: true });
    }

    const ua = req.headers['user-agent'] || '';
    const device = parseDeviceDetails(ua, clientBrowser);
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.socket?.remoteAddress || '127.0.0.1');
    const location = await resolveApproximateLocation(ip);

    const now = new Date();
    const nowIso = now.toISOString();
    const dateTimeFormatted = formatBSDateTimeServer(now);

    const smtpConfig = getSmtpTransportConfig();
    let emailSent = Boolean(existingSession?.emailSent === true);

    const alreadyAlertedForSession = Boolean(
      existingSession && existingSession.emailSent === true && existingSession.status === 'ACTIVE'
    );

    if (!alreadyAlertedForSession && smtpConfig.configured && smtpConfig.transportOptions && email) {
      try {
        const transporter = nodemailer.createTransport(smtpConfig.transportOptions as any);
        await transporter.sendMail({
          from: `"Shikshantar Academy Security" <${smtpConfig.fromSecurity}>`,
          to: email,
          replyTo: smtpConfig.fromSecurity,
          subject: 'Security Alert: New Sign-in to Shikshantar Academy Portal',
          text: `Security Alert: New Sign-in detected for ${userName}\nDevice: ${device.deviceName}\nLocation: ${location}\nIP: ${ip}\nDate & Time (B.S.): ${dateTimeFormatted}`
        });
        emailSent = true;
      } catch (mailErr: any) {
        if (isSmtpAuthError(mailErr)) {
          console.info('[LOGIN SECURITY] SMTP credentials not accepted by mail provider (check Gmail App Password); login recorded without alert email.');
        } else {
          console.info('[LOGIN SECURITY] Alert email skipped due to transient SMTP error:', mailErr?.message || 'SMTP error');
        }
      }
    }

    await sessionRef.set({
      sessionId: cleanSessionId,
      userUid: caller.uid,
      loginEventId: cleanLoginEventId,
      email,
      userName,
      role: userRole,
      loginAt: existingSession?.loginAt || nowIso,
      lastActiveAt: nowIso,
      revokedAt: null,
      logoutAt: null,
      status: 'ACTIVE',
      ipAddress: ip,
      approximateLocation: location,
      deviceType: device.deviceType,
      deviceName: device.deviceName,
      browser: device.browser,
      operatingSystem: device.os,
      emailSent,
      emailSentAt: emailSent ? nowIso : null,
      createdAt: existingSession?.createdAt || nowIso,
      updatedAt: nowIso
    }, { merge: true });

    return res.status(200).json({
      success: true,
      sessionId: cleanSessionId,
      emailSent,
      location,
      dateTimeFormatted
    });
  } catch (err: any) {
    console.error('[API ERROR] record-login handler error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
