import nodemailer from 'nodemailer';

console.log('[LOGIN_HANDLER_LOADED]');

const firebaseConfig = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "project-4b410c97-a152-49e7-940",
  apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "AIzaSyAGMCbz3zfJMrpgTruOH314BsNuSpyNPB4",
  firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || "ai-studio-2507c181-4e37-4730-b71a-25b639c27e22"
};

// Pure TypeScript Bikram Sambat day mapping (2060 B.S. to 2090 B.S.)
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
  'Baisakh',
  'Jestha',
  'Ashadh',
  'Shrawan',
  'Bhadra',
  'Ashwin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra'
];

const REF_AD_TIME = Date.UTC(2003, 3, 14); // 2003-04-14 UTC (2060-01-01 B.S.)
const REF_BS_YEAR = 2060;

function formatBSDateTimeServer(dateInput: Date | string | number = new Date()): string {
  try {
    const rawDate = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const validDate = isNaN(rawDate.getTime()) ? new Date() : rawDate;

    const timeStr = validDate.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kathmandu',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const nptString = validDate.toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' });
    const nptDate = new Date(nptString);
    const y = isNaN(nptDate.getTime()) ? validDate.getUTCFullYear() : nptDate.getFullYear();
    const m = isNaN(nptDate.getTime()) ? validDate.getUTCMonth() : nptDate.getMonth();
    const d = isNaN(nptDate.getTime()) ? validDate.getUTCDate() : nptDate.getDate();

    let diffDays = Math.floor((Date.UTC(y, m, d) - REF_AD_TIME) / 86400000);
    if (diffDays < 0) {
      return `${y + 57} B.S., ${timeStr}`;
    }

    let curYear = REF_BS_YEAR;
    let curMonth = 0;
    let curDay = 1;

    while (diffDays > 0) {
      const yearData = BS_CALENDAR_DATA[curYear];
      const daysInMonth = yearData ? yearData[curMonth] : 30;
      if (diffDays >= daysInMonth) {
        diffDays -= daysInMonth;
        curMonth++;
        if (curMonth > 11) {
          curMonth = 0;
          curYear++;
        }
      } else {
        curDay += diffDays;
        diffDays = 0;
      }
    }

    const monthName = NEPALI_MONTH_NAMES[curMonth] || 'Ashwin';
    const dayPadded = String(curDay).padStart(2, '0');
    return `${dayPadded} ${monthName} ${curYear}, ${timeStr}`;
  } catch {
    return new Date().toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' });
  }
}

interface DeviceDetails {
  browser: string;
  os: string;
  deviceType: string;
  deviceName: string;
}

function parseDeviceDetails(ua: string, clientBrowser?: string): DeviceDetails {
  let browser = 'Unknown Browser';

  const validClientBrowsers = ['Brave', 'Chrome', 'Safari', 'Firefox', 'Microsoft Edge', 'Opera', 'Samsung Internet', 'Vivaldi'];
  if (clientBrowser && typeof clientBrowser === 'string' && validClientBrowsers.includes(clientBrowser.trim())) {
    browser = clientBrowser.trim();
  } else {
    if (ua.includes('Edg/')) browser = 'Microsoft Edge';
    else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera';
    else if (ua.includes('Vivaldi/')) browser = 'Vivaldi';
    else if (ua.includes('SamsungBrowser/')) browser = 'Samsung Internet';
    else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
    else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
    else if (ua.includes('Firefox/')) browser = 'Firefox';
  }

  let os = 'Unknown OS';
  let deviceType = 'Desktop';
  let deviceName = 'Desktop';

  if (ua.includes('Windows')) os = 'Windows';
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
  } else {
    deviceType = 'Desktop';
    deviceName = `${os} Device`;
  }

  return { browser, os, deviceType, deviceName };
}

function toFirestoreFields(obj: any): any {
  const fields: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      fields[key] = { nullValue: null };
    } else if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else if (typeof value === 'number') {
      fields[key] = Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
  }
  return fields;
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
        if (parts.length > 0) {
          return parts.join(', ');
        }
      }
    }
  } catch {}

  return 'Location unavailable';
}

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

    const verifyData = await verifyRes.json();
    const user = verifyData.users?.[0];
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const uid = user.localId;
    const email = user.email || '';
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { sessionId, loginEventId, clientBrowser } = body;

    const cleanSessionId = sessionId?.trim() || `sess_${Date.now()}`;
    const cleanLoginEventId = loginEventId?.trim() || `login_${uid}_${Date.now()}`;

    console.log('[LOGIN_HANDLER_STARTED]', { loginEventId: cleanLoginEventId, sessionId: cleanSessionId });

    // Read user document
    const projectId = firebaseConfig.projectId;
    const databaseId = firebaseConfig.firestoreDatabaseId;
    const userDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${uid}?key=${firebaseConfig.apiKey}`;
    
    let userName = user.displayName || email.split('@')[0];
    let userRole = 'student';

    try {
      const uRes = await fetch(userDocUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (uRes.ok) {
        const uDoc = await uRes.json();
        const f = uDoc.fields || {};
        userName = f.fullName?.stringValue || f.name?.stringValue || userName;
        userRole = f.role?.stringValue || userRole;
      }
    } catch {}

    console.log('[AUTH_VERIFICATION_SUCCESS]', { uid, role: userRole });

    const ua = req.headers['user-agent'] || '';
    const device = parseDeviceDetails(ua, clientBrowser);
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.socket?.remoteAddress || '127.0.0.1');

    // Location: Approximate location derived from the actual login IP or fallback to Location unavailable
    let location = 'Location unavailable';
    try {
      location = await resolveApproximateLocation(ip);
    } catch {
      location = 'Location unavailable';
    }

    const now = new Date();
    const nowIso = now.toISOString();
    let dateTimeFormatted = '';
    try {
      dateTimeFormatted = formatBSDateTimeServer(now);
    } catch {
      dateTimeFormatted = now.toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' });
    }

    console.log('[LOGIN_EVENT_CREATED]', { loginEventId: cleanLoginEventId, location, bsDate: dateTimeFormatted });

    // SMTP configuration
    const smtpUser = process.env.SMTP_USER || process.env.SMTP_EMAIL || process.env.VITE_SMTP_EMAIL || 'security.shikshantar.edu.np@gmail.com';
    const smtpPass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.VITE_SMTP_PASSWORD;

    let emailSent = false;
    let messageId = '';

    if (smtpPass && email) {
      try {
        console.log('[SMTP_SEND_ATTEMPTED]', { recipient: email });
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: smtpUser,
            pass: smtpPass
          }
        });

        const msgToken = `sec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        messageId = `<${msgToken}@shikshantaracademy.edu.np>`;

        const htmlBody = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Security Alert</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; line-height: 1.5;">
            <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              
              <div style="background-color: #0f172a; padding: 20px 24px; border-bottom: 3px solid #2563eb;">
                <table style="width: 100%; border-collapse: collapse; border: 0;">
                  <tr>
                    <td style="width: 48px; vertical-align: middle; padding-right: 14px;">
                      <img src="https://www.shikshantaracademy.edu.np/logo.png" alt="Shikshantar Academy Logo" width="44" height="44" style="display: block; width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.2); object-fit: contain; background: #ffffff;" />
                    </td>
                    <td style="vertical-align: middle;">
                      <div style="font-size: 16px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px; text-transform: uppercase; line-height: 1.2;">
                        SHIKSHANTAR ACADEMY
                      </div>
                      <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                        School Information & Account Security System
                      </div>
                    </td>
                  </tr>
                </table>
              </div>

              <div style="padding: 24px;">
                <div style="display: inline-block; padding: 4px 10px; background-color: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 700; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
                  Account Security Alert
                </div>
                <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #0f172a;">
                  New sign-in detected for ${userName}
                </h2>
                <p style="font-size: 13px; color: #475569; margin: 0 0 18px 0;">
                  Your Shikshantar Academy Portal account was accessed from a verified session:
                </p>

                <table style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 20px; font-size: 13px;">
                  <tr>
                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600; width: 38%;">Account</td>
                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 700;">${userName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">Device</td>
                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #334155; font-weight: 600;">${device.deviceName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">Browser</td>
                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #334155; font-weight: 600;">${device.browser}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">Operating System</td>
                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #334155; font-weight: 600;">${device.os}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">Approx. Location</td>
                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #334155; font-weight: 600;">${location}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">IP Address</td>
                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #334155; font-family: monospace; font-weight: 600;">${ip}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 14px; color: #64748b; font-weight: 600;">Date & Time (B.S.)</td>
                    <td style="padding: 10px 14px; color: #334155; font-weight: 600;">${dateTimeFormatted}</td>
                  </tr>
                </table>

                <p style="font-size: 12px; color: #64748b; margin: 0 0 20px 0; line-height: 1.5;">
                  If this was you, you can safely ignore this alert. If you do not recognize this activity, please revoke the session from your account security panel immediately.
                </p>

                <div style="text-align: center; margin: 24px 0 16px 0;">
                  <a href="https://www.shikshantaracademy.edu.np/profile" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; font-size: 13px; font-weight: 700; text-decoration: none; border-radius: 8px; letter-spacing: 0.2px;">
                    Review Account Security
                  </a>
                </div>
              </div>

              <div style="background-color: #f1f5f9; padding: 16px 24px; font-size: 11px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0;">
                <div><strong>Shikshantar Academy</strong> • Karjanha-05, Bastipur, Siraha, Nepal</div>
                <div style="margin-top: 4px;">This automated notification was delivered to ${email} for security monitoring.</div>
              </div>

            </div>
          </body>
          </html>
        `;

        await transporter.sendMail({
          from: `"Shikshantar Academy Security" <${smtpUser}>`,
          to: email,
          replyTo: 'academyshikshantar@gmail.com',
          subject: 'Security Alert: New Sign-in to Shikshantar Academy Portal',
          html: htmlBody,
          text: `Security Alert: New Sign-in detected for ${userName}\nAccount: ${userName}\nDevice: ${device.deviceName}\nLocation: ${location}\nIP: ${ip}\nDate & Time (B.S.): ${dateTimeFormatted}`,
          messageId,
          headers: {
            'X-Auto-Response-Suppress': 'OOF, AutoReply',
            'Auto-Submitted': 'auto-generated',
            'X-Entity-Ref-ID': msgToken,
            'X-Report-Abuse-To': 'academyshikshantar@gmail.com'
          }
        });

        emailSent = true;
        console.log('[SMTP_SEND_SUCCESS]', { messageId, emailSent: true });
      } catch (mailErr: any) {
        console.warn('[SMTP_SEND_FAILED]', mailErr.message);
      }
    }

    // Save session in Firestore
    const sessionDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/user_sessions/${cleanSessionId}?key=${firebaseConfig.apiKey}`;
    const sessionData = {
      sessionId: cleanSessionId,
      userUid: uid,
      loginEventId: cleanLoginEventId,
      email,
      userName,
      role: userRole,
      loginAt: nowIso,
      lastActiveAt: nowIso,
      status: 'ACTIVE',
      ipAddress: ip,
      approximateLocation: location,
      deviceType: device.deviceType,
      deviceName: device.deviceName,
      browser: device.browser,
      operatingSystem: device.os,
      emailSent,
      emailSentAt: emailSent ? nowIso : null,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await fetch(sessionDocUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: toFirestoreFields(sessionData)
      })
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      sessionId: cleanSessionId,
      emailSent,
      location,
      dateTimeFormatted
    });
  } catch (err: any) {
    console.error('[API ERROR] record-login handler error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
