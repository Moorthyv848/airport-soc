import React, { useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";

/* ---------------- FIREBASE CONFIG ---------------- */

const firebaseConfig = {
  apiKey: "AIzaSyBYihneL5770d1gLfwWAJ_sKjfL_hlgUws",
  authDomain: "landside-control-room.firebaseapp.com",
  projectId: "landside-control-room",
  storageBucket: "landside-control-room.firebasestorage.app",
  messagingSenderId: "85978595792",
  appId: "1:85978595792:web:5b6c5de9dbd737205bf9d5",
};

let app = null;
let auth = null;

try {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
} catch (e) {
  console.error(e);
}

/* ---------------- APP ---------------- */

export default function App() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [login, setLogin] = useState({ username: "", password: "" });
  const [authError, setAuthError] = useState("");

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-[#05070b] text-white grid place-items-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <h1 className="text-xl font-bold text-cyan-300 mb-4">
            🛡️ AIRPORT SOC LOGIN
          </h1>

          <input
            placeholder="Email"
            value={login.username}
            onChange={(e) =>
              setLogin({ ...login, username: e.target.value })
            }
            className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 mb-2"
          />

          <input
            type="password"
            placeholder="Password"
            value={login.password}
            onChange={(e) =>
              setLogin({ ...login, password: e.target.value })
            }
            className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 mb-3"
          />

          <button
            className="w-full rounded-xl bg-cyan-600 px-3 py-2 font-semibold"
            onClick={async () => {
              setAuthError("");

              try {
                const cred = await signInWithEmailAndPassword(
                  auth,
                  login.username.trim(),
                  login.password
                );

                console.log("LOGIN SUCCESS:", cred.user.email);
                setIsAuthed(true);
              } catch (error) {
                // 🔥 IMPORTANT CHANGE
                console.error("FIREBASE ERROR:", error);
                setAuthError(error.message);
              }
            }}
          >
            Login
          </button>

          {authError && (
            <div className="text-red-400 text-sm mt-3">{authError}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05070b] text-white grid place-items-center">
      <div className="text-2xl font-bold text-cyan-300">
        ✅ APP IS WORKING (LOGGED IN)
      </div>

      <button
        onClick={async () => {
          await signOut(auth);
          setIsAuthed(false);
        }}
        className="mt-4 px-4 py-2 rounded bg-neutral-800"
      >
        Logout
      </button>
    </div>
  );
}
