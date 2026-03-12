import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, browserLocalPersistence, setPersistence } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { FIREBASE_CONFIG } from '../config.js?v=step24-r28-card-batch-workflow-20260312h';

export const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn('Auth persistence setup failed:', error);
});
export const db = getFirestore(app);
export const functions = getFunctions(app, 'asia-east1');
