import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  try {
    const q1 = query(collection(db, 'notices'));
    const s1 = await getDocs(q1);
    console.log("SUCCESS notices list:", s1.size);
  } catch(e: any) {
    console.error("FAIL notices list:", e);
  }
  try {
    const q2 = query(collection(db, 'test_xyz'));
    const s2 = await getDocs(q2);
    console.log("SUCCESS test_xyz list:", s2.size);
  } catch(e: any) {
    console.error("FAIL test_xyz list:", e);
  }
  process.exit();
}
run();
