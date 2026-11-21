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
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Ignore service worker registration errors in unsupported contexts
      });
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
