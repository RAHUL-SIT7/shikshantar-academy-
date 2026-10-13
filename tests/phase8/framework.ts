import { initializeApp as initClientApp, deleteApp, getApps, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  connectAuthEmulator, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  IdTokenResult
} from 'firebase/auth';
import { 
  getFirestore, 
  connectFirestoreEmulator, 
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  terminate
} from 'firebase/firestore';
import admin from 'firebase-admin';

export interface RuntimeTestResult {
  id: string;
  category: string;
  scenario: string;
  command: string;
  input: any;
  beforeState?: any;
  operation: string;
  afterState?: any;
  expected: string;
  actual: string;
  difference: string;
  status: 'PASS-RUNTIME' | 'FAIL' | 'NOT-EXECUTED';
  rawOutput: string;
  exitCode: number;
}

export const allTestResults: RuntimeTestResult[] = [];

export function recordTest(res: RuntimeTestResult): void {
  allTestResults.push(res);
  const mark = res.status === 'PASS-RUNTIME' ? '✅ [PASS-RUNTIME]' : '❌ [FAIL]';
  console.log(`${mark} [${res.id}] [${res.category}] ${res.scenario}`);
  console.log(`   Operation : ${res.operation}`);
  console.log(`   Expected  : ${res.expected}`);
  console.log(`   Actual    : ${res.actual}`);
  if (res.status !== 'PASS-RUNTIME') {
    console.error(`   DIFFERENCE: ${res.difference}`);
  }
}

export const PROJECT_ID = 'demo-shikshantar-test';
export const AUTH_EMULATOR_HOST = '127.0.0.1:9098';
export const FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

// Authoritative Admin SDK Initialization
export function getAdminApp(): admin.app.App {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: PROJECT_ID,
    });
  }
  return admin.apps[0]!;
}

export const adminDb = getAdminApp().firestore();
export const adminAuth = getAdminApp().auth();

// Client SDK Instance Factory for Real Security Rules & Auth Testing
export interface TestClientContext {
  appName: string;
  app: FirebaseApp;
  auth: ReturnType<typeof getAuth>;
  db: Firestore;
  uid: string;
  email: string;
  role: 'admin' | 'teacher' | 'student' | 'guest';
  adminTier?: 'primary' | 'secondary';
  token: string;
}

const activeClientApps: FirebaseApp[] = [];

export async function createClientContext(options: {
  role: 'admin' | 'teacher' | 'student' | 'guest';
  adminTier?: 'primary' | 'secondary';
  emailPrefix?: string;
  permanentStudentId?: string;
  admissionNo?: string;
  class?: string;
}): Promise<TestClientContext> {
  const timestamp = Date.now() + Math.floor(Math.random() * 10000);
  const appName = `client_${options.role}_${timestamp}`;
  const emailPrefix = options.emailPrefix || `${options.role}_${timestamp}`;
  const email = `${emailPrefix}@shikshantar.edu.np`;
  const password = 'TestPassword123!';

  // 1. Authoritative creation via Admin Auth
  let authUser: admin.auth.UserRecord;
  try {
    authUser = await adminAuth.createUser({
      email,
      password,
      displayName: `Test ${options.role.toUpperCase()} ${timestamp}`,
    });
  } catch (err: any) {
    if (err.code === 'auth/email-already-exists') {
      authUser = await adminAuth.getUserByEmail(email);
    } else {
      throw err;
    }
  }

  // 2. Set Custom Claims authoritatively
  const claims: Record<string, any> = {
    role: options.role,
  };
  if (options.role === 'admin') {
    claims.adminTier = options.adminTier || 'secondary';
  }
  await adminAuth.setCustomUserClaims(authUser.uid, claims);

  // 3. Seed User Document in Firestore
  const userDocData: Record<string, any> = {
    uid: authUser.uid,
    email,
    role: options.role,
    name: `Test ${options.role.toUpperCase()}`,
    createdAt: new Date().toISOString(),
    status: 'ACTIVE',
    active: true,
  };
  if (options.role === 'admin') {
    userDocData.adminTier = options.adminTier || 'secondary';
  }
  if (options.role === 'student') {
    userDocData.studentId = options.permanentStudentId || `STU-${timestamp}`;
    userDocData.permanentStudentId = options.permanentStudentId || `STU-${timestamp}`;
    userDocData.admissionNo = options.admissionNo || `ADM-${timestamp}`;
    userDocData.admissionNumber = options.admissionNo || `ADM-${timestamp}`;
    userDocData.class = options.class || '10';
  }
  if (options.role === 'teacher') {
    userDocData.class = options.class || '10';
    userDocData.primaryClassTeacher = options.class || '10';
  }

  await adminDb.collection('users').doc(authUser.uid).set(userDocData);

  // 4. Initialize client SDK app for this user
  const app = initClientApp(
    {
      projectId: PROJECT_ID,
      apiKey: 'fake-api-key-for-emulator',
    },
    appName
  );
  activeClientApps.push(app);

  const clientAuth = getAuth(app);
  connectAuthEmulator(clientAuth, `http://${AUTH_EMULATOR_HOST}`, { disableWarnings: true });

  const clientDb = getFirestore(app);
  connectFirestoreEmulator(clientDb, '127.0.0.1', 8085);

  // 5. Sign in on client SDK to establish authentic Firestore Rule context
  const cred = await signInWithEmailAndPassword(clientAuth, email, password);
  const token = await cred.user.getIdToken();

  return {
    appName,
    app,
    auth: clientAuth,
    db: clientDb,
    uid: authUser.uid,
    email,
    role: options.role,
    adminTier: options.adminTier,
    token,
  };
}

export async function createGuestContext(): Promise<{ app: FirebaseApp; db: Firestore }> {
  const appName = `guest_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const app = initClientApp(
    {
      projectId: PROJECT_ID,
      apiKey: 'fake-api-key-for-emulator',
    },
    appName
  );
  activeClientApps.push(app);
  const clientDb = getFirestore(app);
  connectFirestoreEmulator(clientDb, '127.0.0.1', 8085);
  return { app, db: clientDb };
}

export async function teardownClients(): Promise<void> {
  for (const app of activeClientApps) {
    try {
      const db = getFirestore(app);
      await terminate(db);
      await deleteApp(app);
    } catch (_) {}
  }
  activeClientApps.length = 0;
}
