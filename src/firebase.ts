import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  initializeAuth, 
  browserLocalPersistence, 
  browserSessionPersistence, 
  inMemoryPersistence, 
  browserPopupRedirectResolver, 
  getAuth,
  connectAuthEmulator
} from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfigImport from '../firebase-applet-config.json';

const isNodeEnv = typeof process !== 'undefined' && Boolean(process.env);
const emulatorFirestoreHost = isNodeEnv ? process.env.FIRESTORE_EMULATOR_HOST : undefined;
const emulatorAuthHost = isNodeEnv ? process.env.FIREBASE_AUTH_EMULATOR_HOST : undefined;
const emulatorProject = isNodeEnv ? process.env.GCLOUD_PROJECT : undefined;

const isEmulator = Boolean(emulatorFirestoreHost || emulatorAuthHost);
const effectiveProjectId = isEmulator ? (emulatorProject || 'demo-shikshantar-test') : firebaseConfigImport.projectId;
const effectiveDatabaseId = isEmulator ? '(default)' : firebaseConfigImport.firestoreDatabaseId;

export const firebaseConfig = {
  apiKey: firebaseConfigImport.apiKey,
  authDomain: firebaseConfigImport.authDomain,
  projectId: effectiveProjectId,
  storageBucket: firebaseConfigImport.storageBucket,
  messagingSenderId: firebaseConfigImport.messagingSenderId,
  appId: firebaseConfigImport.appId,
  measurementId: firebaseConfigImport.measurementId || '',
  firestoreDatabaseId: effectiveDatabaseId
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = typeof window !== 'undefined' 
  ? initializeAuth(app, {
      persistence: [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence],
      popupRedirectResolver: browserPopupRedirectResolver
    })
  : getAuth(app);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);

if (isEmulator) {
  if (emulatorAuthHost) {
    try {
      connectAuthEmulator(auth, `http://${emulatorAuthHost}`, { disableWarnings: true });
    } catch (_) {}
  }
  if (emulatorFirestoreHost) {
    try {
      const [host, portStr] = emulatorFirestoreHost.split(':');
      connectFirestoreEmulator(db, host || '127.0.0.1', parseInt(portStr || '8085', 10));
    } catch (_) {}
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  if (errInfo.error && errInfo.error.toLowerCase().includes('permissions')) {
    console.warn('Firestore Permission Check: ', JSON.stringify(errInfo));
  } else {
    console.warn('Firestore Error: ', JSON.stringify(errInfo));
  }
  // do not throw to prevent crashing snapshot listeners
}