const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const firebaseConfig = require('./firebase-applet-config.json');
const app = initializeApp({
  projectId: firebaseConfig.projectId
});
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  const querySnapshot = await db.collection('admissions')
    .orderBy('submittedAt', 'desc')
    .limit(10)
    .get();

  console.log("Found", querySnapshot.size, "admissions:");
  querySnapshot.forEach(doc => {
    const data = doc.data();
    console.log("ID:", doc.id);
    console.log("StudentName:", data.studentName, "or", data.studentFirstName, data.studentLastName);
    console.log("Fields:", Object.keys(data));
    console.log("PreviousSchool:", data.previousSchool);
    console.log("Raw Data:", JSON.stringify(data, null, 2));
    console.log("=========================================");
  });
}

run().catch(console.error);
