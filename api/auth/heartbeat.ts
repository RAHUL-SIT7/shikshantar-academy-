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

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { sessionId } = body;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Missing sessionId.' });
    }

    const cleanSessionId = sessionId.trim();
    const projectId = firebaseConfig.projectId;
    const databaseId = firebaseConfig.firestoreDatabaseId;
    const nowIso = new Date().toISOString();

    const sessionUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/user_sessions/${cleanSessionId}?updateMask.fieldPaths=lastActiveAt&updateMask.fieldPaths=updatedAt&key=${firebaseConfig.apiKey}`;
    await fetch(sessionUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          lastActiveAt: { stringValue: nowIso },
          updatedAt: { stringValue: nowIso }
        }
      })
    }).catch(() => {});

    return res.status(200).json({ success: true, timestamp: nowIso });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
