const admin = require('firebase-admin');
const fs = require('fs');
const serviceAccount = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function update() {
  await db.collection('settings').doc('home_content').set({
    testi2Text: "Best school in Karjanha Municipality for affordable quality education. My daughter got A+ in Science and Mathematics in SEE."
  }, { merge: true });
  console.log('Homepage content updated successfully!');
  process.exit(0);
}

update();
