import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBRxd0gLACHrmQ5Jk0RkaY-tjYz9LhKx7g",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "jackpot-fd988.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "jackpot-fd988",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "jackpot-fd988.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "859370808626",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:859370808626:web:851e1452e9e0ec3b66232b"
};

if (typeof window !== 'undefined') {
  // Log Firebase config in the browser for debugging
  console.log('FIREBASE CONFIG:', firebaseConfig);
}

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

// Enable offline persistence for development
if (import.meta.env.DEV && !import.meta.env.VITE_FIREBASE_PROJECT_ID) {
  try {
    connectFirestoreEmulator(db, 'localhost', 8080);
  } catch (error) {
    // Emulator already connected or not available
    console.log('Firebase emulator not available, using demo mode');
  }
}

export default app;