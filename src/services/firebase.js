import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/*
  ENTERPRISE SAFE FIREBASE SETUP
  - Uses .env variables
  - Prevents app crash if Firebase fails
*/

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app = null;
let auth = null;
let db = null;

try {
  // Prevent multiple firebase initialization
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);

  auth = getAuth(app);
  db = getFirestore(app);

  console.log("✅ Firebase initialized");
} catch (error) {
  console.error("❌ Firebase init failed:", error);
}

export { auth, db };
