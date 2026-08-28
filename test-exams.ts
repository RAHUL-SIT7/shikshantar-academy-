import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app);

async function run() {
  try {
    const res = await getDocs(collection(db, "exams"));
    console.log("Success! Docs:", res.docs.length);
  } catch(e) {
    console.error("Error:", e.message);
  }
}
run();
