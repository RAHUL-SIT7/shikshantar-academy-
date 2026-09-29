import {createRoot} from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import App from './App.tsx';
import './index.css';
import { db, auth } from './firebase.ts';
import * as firestoreModule from 'firebase/firestore';
import * as authModule from 'firebase/auth';

if (typeof window !== 'undefined') {
  (window as any).__FIREBASE__ = {
    db,
    auth,
    firestore: firestoreModule,
    authModule: authModule
  };
}

createRoot(document.getElementById('root')!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
