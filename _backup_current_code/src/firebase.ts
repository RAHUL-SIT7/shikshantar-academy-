import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  initializeAuth, 
  browserLocalPersistence, 
  browserSessionPersistence, 
  inMemoryPersistence, 
  browserPopupRedirectResolver, 
  getAuth 
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfigImport from '../firebase-applet-config.json';

export const firebaseConfig = {
  apiKey: firebaseConfigImport.apiKey,
  authDomain: firebaseConfigImport.authDomain,
  projectId: firebaseConfigImport.projectId,
  storageBucket: firebaseConfigImport.storageBucket,
  messagingSenderId: firebaseConfigImport.messagingSenderId,
  appId: firebaseConfigImport.appId,
  measurementId: firebaseConfigImport.measurementId || '',
  firestoreDatabaseId: firebaseConfigImport.firestoreDatabaseId
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