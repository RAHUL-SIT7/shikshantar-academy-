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
    const { clientTimestamp, recaptchaToken } = body;
    const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;

    if (recaptchaSecret && recaptchaToken) {
      try {
        const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${encodeURIComponent(recaptchaSecret)}&response=${encodeURIComponent(recaptchaToken)}`;
        const googleRes = await fetch(verifyUrl, { method: 'POST' });
        const googleData = await googleRes.json();
        if (googleData.success) {
          return res.status(200).json({
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

    const now = Date.now();
    const clientTime = Number(clientTimestamp);
    if (!clientTime || Math.abs(now - clientTime) > 180000) {
      return res.status(400).json({
        success: false,
        error: 'Security challenge expired or invalid system clock. Please retry.'
      });
    }

    const serverToken = `srv_verified_${now}_${Math.random().toString(36).substring(2, 15)}`;
    return res.status(200).json({
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
}
