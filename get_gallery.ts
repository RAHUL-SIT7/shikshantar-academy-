import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const firebaseConfig = {
  apiKey: config.apiKey,
  authDomain: config.authDomain,
  projectId: config.projectId,
  storageBucket: config.storageBucket,
  messagingSenderId: config.messagingSenderId,
  appId: config.appId,
};

const app = initializeApp(firebaseConfig);
const db = config.firestoreDatabaseId 
  ? getFirestore(app, config.firestoreDatabaseId) 
  : getFirestore(app);

async function run() {
  try {
    const docRef = doc(db, 'school_data', 'gallery');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      fs.writeFileSync('gallery_data.json', JSON.stringify(docSnap.data(), null, 2));
      console.log('SUCCESS_WROTE_GALLERY_DATA');
    } else {
      console.log('NO_SUCH_DOCUMENT');
    }
  } catch (err) {
    console.error('ERROR_FETCHING:', err);
  }
}

run();
