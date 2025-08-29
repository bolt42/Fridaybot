import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Check if all required environment variables are present
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
];

const missingVars = requiredEnvVars.filter(varName => !import.meta.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing Firebase environment variables:', missingVars);
  console.error('Please copy .env.example to .env and fill in your Firebase configuration');
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBRxd0gLACHrmQ5Jk0RkaY-tjYz9LhKx7g",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "jackpot-fd988.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "jackpot-fd988",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "jackpot-fd988.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "859370808626",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:859370808626:web:851e1452e9e0ec3b66232b",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://jackpot-fd988-default-rtdb.firebaseio.com"
};

// Initialize Firebase
let app;
let db;
let auth;

try {
  app = initializeApp(firebaseConfig);
  // Initialize Firebase services
  db = getFirestore(app);
  auth = getAuth(app);
} catch (error) {
  console.error('Firebase initialization failed:', error);
  console.error('Please check your Firebase configuration in .env file');
}

export { db, auth, app };