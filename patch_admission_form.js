import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const configPath = join(__dirname, 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(readFileSync(configPath, 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function patch() {
  const docRef = doc(db, 'settings', 'admissionFormConfig');
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = snap.data();
    if (data.fields) {
      let updated = false;
      const newFields = data.fields.map(f => {
        if (f.id === 'gradeAppliedFor') {
             updated = true;
             f.options = ['Play Group', 'Nursery', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9'];
        }
        return f;
      });
      if (updated) {
        await setDoc(docRef, { ...data, fields: newFields });
        console.log("Updated gradeAppliedFor options in DB settings!");
      } else {
        console.log("gradeAppliedFor not found in DB.");
      }
    }
  } else {
    console.log("Settings doc does not exist.");
  }
}
patch().catch(console.error).then(() => process.exit(0));
