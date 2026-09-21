import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

async function runQuotaProbe() {
  const timestamp = new Date().toISOString();
  console.log(`[QUOTA PROBE START] Timestamp: ${timestamp}`);
  console.log(`Project ID: ${firebaseConfig.projectId}`);
  console.log(`Database ID: ${firebaseConfig.firestoreDatabaseId}`);

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

  try {
    const docRef = doc(db, 'settings', 'fee_structure');
    const snap = await getDoc(docRef);
    console.log(`[QUOTA PROBE SUCCESS] Document exists: ${snap.exists()}`);
    console.log(`QUOTA_GATE_STATUS=SUCCESS`);
  } catch (err: any) {
    console.error(`[QUOTA PROBE FAILED] Error message: ${err?.message}`);
    console.error(`Error code: ${err?.code}`);
    if (err?.message?.includes('resource-exhausted') || err?.code === 'resource-exhausted' || err?.message?.includes('Quota limit exceeded')) {
      console.log(`QUOTA_GATE_STATUS=RESOURCE_EXHAUSTED`);
    } else {
      console.log(`QUOTA_GATE_STATUS=ERROR_${err?.code || 'UNKNOWN'}`);
    }
  } finally {
    process.exit(0);
  }
}

runQuotaProbe().catch(e => {
  console.error("Probe script error:", e);
  process.exit(1);
});
