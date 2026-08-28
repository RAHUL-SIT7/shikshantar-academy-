const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const firebaseConfig = require('./firebase-applet-config.json');
if (firebaseConfig.projectId) {
    process.env.FIRESTORE_EMULATOR_HOST = undefined;
}

const app = initializeApp({
  projectId: firebaseConfig.projectId
});

const db = getFirestore(app);

async function check() {
  const users = await db.collection('users').get();
  console.log("Users count:", users.size);
  // Check admins
  users.forEach(u => {
     if (u.data().role === 'admin') {
         console.log("Admin:", u.id, u.data());
     }
  });
}
check().catch(console.error);
