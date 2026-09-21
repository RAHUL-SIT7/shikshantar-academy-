import { db, auth } from '../src/firebase.js';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

async function checkDoc() {
  await signInWithEmailAndPassword(auth, 'admin_test_integration@shikshantar.edu.np', 'AdminTest@12345');
  const d1 = await getDoc(doc(db, 'transactions', 'TX_IDEMP_TEST_1789826546055'));
  console.log('TX1:', d1.exists() ? d1.data() : 'NOT_FOUND');
  const d2 = await getDoc(doc(db, 'transactions', 'TX_IDEMP_TEST_1789826582862'));
  console.log('TX2:', d2.exists() ? d2.data() : 'NOT_FOUND');
  process.exit(0);
}
checkDoc();
