import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const configPath = join(__dirname, 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(readFileSync(configPath, 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const docRef = doc(db, 'settings', 'admissionFormConfig');
  const snap = await getDoc(docRef);
  if (snap.exists() && snap.data().fields) {
    const f = snap.data().fields.find(f => f.id === 'gradeAppliedFor');
    console.log("gradeAppliedFor options:", f ? f.options : null);
  } else {
    console.log("No config found.");
  }
}
check().catch(console.error).then(() => process.exit(0));
