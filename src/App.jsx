import React, { useEffect, useMemo, useState } from "react";
import { Monitor, Radio, ShieldCheck, FileText, AlertTriangle } from "lucide-react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

/* =============================
   SOC COMMAND CENTER PRO UI
   Enterprise Visual Upgrade
============================= */

const STATUSES = [
  { key: "working", label: "Working", color: "bg-emerald-500" },
  { key: "offline", label: "Offline", color: "bg-red-600" },
  { key: "maintenance", label: "Maintenance", color: "bg-amber-500" },
  { key: "removed", label: "Removed", color: "bg-slate-600" },
];

const NAV = [
  { key: "CCTV", icon: Monitor },
  { key: "RT", icon: Radio },
  { key: "Supervisor", icon: ShieldCheck },
  { key: "Reports", icon: FileText },
];

const firebaseConfig = {
  apiKey: "AIzaSyBYihneL5770d1gLfwWAJ_sKjfL_hlgUws",
  authDomain: "landside-control-room.firebaseapp.com",
  projectId: "landside-control-room",
  storageBucket: "landside-control-room.firebasestorage.app",
  messagingSenderId: "85978595792",
  appId: "1:85978595792:web:5b6c5de9dbd737205bf9d5",
};

let app, auth, db;
try {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase init error", e);
}

function StatusBadge({ status }) {
  const s = STATUSES.find(x => x.key === status) || STATUSES[0];
  return (
    <span className={`px-2 py-1 text-xs rounded text-white ${s.color}`}>
      {s.label}
    </span>
  );
}

export default function App() {
  const [view, setView] = useState("CCTV");
  const [isAuthed, setIsAuthed] = useState(false);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [cameras, setCameras] = useState([]);
  const [rtList, setRtList] = useState([]);
  const [rtForm, setRtForm] = useState({ rtNumber: "", location: "T1", status: "working" });

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, "cameras"), snap => {
      const rows = [];
      snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
      setCameras(rows);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, "rt_inventory"), snap => {
      const rows = [];
      snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
      setRtList(rows);
    });
    return () => unsub();
  }, []);

  const counts = useMemo(() => {
    const base = { total: cameras.length, offline: 0 };
    cameras.forEach(c => c.status === "offline" && base.offline++);
    return base;
  }, [cameras]);

  const addRT = async () => {
    if (!rtForm.rtNumber.trim()) return;
    const payload = { ...rtForm, updatedAt: serverTimestamp() };
    await setDoc(doc(db, "rt_inventory", rtForm.rtNumber), payload);
    setRtForm(f => ({ ...f, rtNumber: "" }));
  };

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-black text-white grid place-items-center">
        <div className="bg-neutral-900 p-6 rounded-xl w-96">
          <h1 className="text-xl mb-4 font-bold">SOC COMMAND CENTER</h1>
          <input
            className="w-full p-2 mb-2 bg-neutral-800 rounded"
            placeholder="Email"
            value={login.email}
            onChange={e => setLogin({ ...login, email: e.target.value })}
          />
          <input
            type="password"
            className="w-full p-2 mb-2 bg-neutral-800 rounded"
            placeholder="Password"
            value={login.password}
            onChange={e => setLogin({ ...login, password: e.target.value })}
          />
          <button
            className="w-full bg-cyan-600 p-2 rounded"
            onClick={async () => {
              try {
                await signInWithEmailAndPassword(auth, login.email, login.password);
                setIsAuthed(true);
              } catch {
                alert("Login failed");
              }
            }}
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05070b] text-white flex">
      <aside className="w-64 bg-[#060b12] p-4 border-r border-neutral-800">
        <h2 className="text-cyan-400 font-bold mb-6 tracking-widest">SOC PRO</h2>
        {NAV.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className="flex items-center gap-2 w-full mb-2 p-2 bg-neutral-900 rounded hover:bg-neutral-800"
            >
              <Icon size={16} /> {item.key}
            </button>
          );
        })}
        <button
          className="mt-6 w-full bg-red-700 p-2 rounded"
          onClick={() => {
            signOut(auth);
            setIsAuthed(false);
          }}
        >
          Logout
        </button>
      </aside>

      <main className="flex-1 p-6 space-y-6">
        {/* COMMAND STATUS BAR */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-neutral-900 border border-cyan-900">
          <div className="flex items-center gap-2 text-cyan-400">
            <AlertTriangle size={18} />
            <span className="font-semibold">COMMAND STATUS</span>
          </div>
          <div>Total Cameras: {counts.total}</div>
          <div className={counts.offline > 0 ? "text-red-500 animate-pulse" : "text-emerald-400"}>
            {counts.offline > 0 ? "CRITICAL" : "STABLE"}
          </div>
        </div>

        {view === "CCTV" && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {cameras.map(c => (
              <div key={c.id} className="p-4 bg-neutral-900 rounded-xl border border-neutral-800">
                <div className="flex justify-between">
                  <div className="font-semibold">{c.id}</div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="text-sm text-neutral-400 mt-1">{c.location}</div>
              </div>
            ))}
          </div>
        )}

        {view === "RT" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                placeholder="RT Number"
                value={rtForm.rtNumber}
                onChange={e => setRtForm({ ...rtForm, rtNumber: e.target.value })}
                className="p-2 bg-neutral-800 rounded"
              />
              <button onClick={addRT} className="bg-cyan-600 px-4 rounded">
                Save
              </button>
            </div>
            {rtList.map(r => (
              <div key={r.id} className="flex justify-between p-3 bg-neutral-900 rounded border border-neutral-800">
                <span>{r.rtNumber}</span>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}