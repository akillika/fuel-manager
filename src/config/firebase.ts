import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { isSupported as analyticsSupported, getAnalytics } from 'firebase/analytics';
import { DEMO_MODE } from './demo';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

if (!DEMO_MODE && (!firebaseConfig.apiKey || !firebaseConfig.projectId)) {
  const missing: string[] = [];
  if (!firebaseConfig.apiKey) missing.push('VITE_FIREBASE_API_KEY');
  if (!firebaseConfig.authDomain) missing.push('VITE_FIREBASE_AUTH_DOMAIN');
  if (!firebaseConfig.projectId) missing.push('VITE_FIREBASE_PROJECT_ID');
  if (!firebaseConfig.appId) missing.push('VITE_FIREBASE_APP_ID');
  throw new Error(
    `Missing Firebase configuration: ${missing.join(', ')}. Set VITE_FIREBASE_* in .env.local, or VITE_DEV_DEMO=true to preview.`,
  );
}

const app = initializeApp(DEMO_MODE ? {
  apiKey: 'demo', authDomain: 'demo.firebaseapp.com', projectId: 'demo-project',
  storageBucket: 'demo.appspot.com', messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000',
} : firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

if (!DEMO_MODE && firebaseConfig.measurementId) {
  analyticsSupported().then(ok => { if (ok) getAnalytics(app); }).catch(() => {});
}

export default app;
