import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const isConfigured = Object.entries(firebaseConfig)
  .filter(([k]) => k !== 'measurementId')
  .every(([, v]) => v && v !== 'COLE_AQUI' && v.length > 4);

const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const auth           = isConfigured ? getAuth(app) : null;
// Cache local persistente: writes atualizam o onSnapshot imediatamente (offline-first)
export const db = isConfigured
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  : null;
export const googleProvider = isConfigured ? new GoogleAuthProvider() : null;
