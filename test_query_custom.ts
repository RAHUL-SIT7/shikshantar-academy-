import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfigImport = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));

const firebaseConfig = {
  apiKey: firebaseConfigImport.apiKey,
  authDomain: firebaseConfigImport.authDomain,
  projectId: firebaseConfigImport.projectId,
  storageBucket: firebaseConfigImport.storageBucket,
  messagingSenderId: firebaseConfigImport.messagingSenderId,
  appId: firebaseConfigImport.appId,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfigImport.firestoreDatabaseId);

async function run() {
  try {
    const snap = await getDocs(collection(db, 'studentFees'));
    console.log(`FOUND ${snap.size} TOTAL studentFees RECORDS:`);
    snap.forEach((doc) => {
      console.log(`- Fee ID: ${doc.id} ->`, JSON.stringify(doc.data()));
    });
  } catch (err) {
    console.error("Error querying studentFees:", err);
  }
}

run();



