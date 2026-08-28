import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, getDocs, setDoc, where } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  try {
    const studentId = "rahul";
    const examId = "Terminal_1_10";
    console.log("Adding mock exam...");
    await setDoc(doc(db, 'exams', examId), { published: true, name: "Terminal 1", type: "Terminal 1", class: "10" });
    
    console.log("Adding mock resultSummary...");
    await setDoc(doc(db, 'resultSummary', "summary1"), { studentId, examId, examType: "Terminal 1", total: 400, percentage: 80, grade: "A", gpa: 3.6, published: true, studentName: "Rahul", class: "10" });

    console.log("Adding mock result...");
    await setDoc(doc(db, 'results', "result1"), { studentId, examId, subject: "Math", marks: 95, fullMarks: 100 });

    console.log("Fetching results...");
    const examsSnap = await getDocs(query(collection(db, 'exams'), where('published', '==', true)));
    console.log("Found published exams:", examsSnap.size);

    const summarySnap = await getDocs(query(collection(db, 'resultSummary'), where('studentId', '==', studentId)));
    console.log("Found summary for student:", summarySnap.size);

    const resultsSnap = await getDocs(query(collection(db, 'results'), where('studentId', '==', studentId)));
    console.log("Found results for student:", resultsSnap.size);

  } catch(e: any) {
    console.error("FAIL:", e);
  }
  process.exit();
}
run();
