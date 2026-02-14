import React, { useEffect, useMemo, useState } from "react";
import { Monitor, Radio, ShieldCheck, FileText } from "lucide-react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  getDoc,
  addDoc,
} from "firebase/firestore";

/* ---------- CONFIG ---------- */

const STATUSES = [
  { key: "working", label: "Working", pill: "bg-emerald-500" },
  { key: "offline", label: "Offline", pill: "bg-red-600" },
  { key: "maintenance", label: "Maintenance", pill: "bg-amber-500" },
  { key: "removed", label: "Removed", pill: "bg-rose-700" },
];

const NAV_ITEMS = [
  { key: "CCTV Dashboard", label: "CCTV Dashboard", icon: Monitor },
  { key: "RT Inventory", label: "RT Inventory", icon: Radio },
  { key: "Supervisor View", label: "Supervisor View", icon: ShieldCheck },
  { key: "Shift Reports", label: "Shift Reports", icon: FileText },
];

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "landside-control-room.firebaseapp.com",
  projectId: "landside-control-room",
  storageBucket: "landside-control-room.firebasestorage.app",
  messagingSenderId: "85978595792",
  appId: "1:85978595792:web:5b6c5de9dbd737205bf9d5",
};

let app = null;
let auth = null;
let db = null;

try {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error(e);
}

/* ---------- HELPERS ---------- */

function StatusPill({ status }) {
  const s = STATUSES.find(x => x.key === status) || STATUSES[0];
  return (
    <span className={`px-2 py-1 text-xs rounded-full text-white ${s.pill}`}>
      {s.label}
    </span>
  );
}

/* ---------- MAIN APP ---------- */

const seedCameras = Array.from({ length: 30 }).map((_, i) => ({
  id: `CAM-${String(i + 1).padStart(4, "0")}`,
  client: i % 2 === 0 ? "T1" : "T2",
  cameraName: `Camera ${i + 1}`,
  location: i % 2 === 0 ? "T1 Zone" : "T2 Zone",
  status: i % 8 === 0 ? "offline" : "working",
}));

export default function App() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [login, setLogin] = useState({ username: "", password: "" });
  const [authError, setAuthError] = useState("");

  const [activeView, setActiveView] = useState("CCTV Dashboard");
  const [cameras, setCameras] = useState(seedCameras);

  const counts = useMemo(() => {
    const b = { total: cameras.length, working:0, offline:0, maintenance:0, removed:0 };
    cameras.forEach(c => b[c.status]++);
    return b;
  }, [cameras]);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, "cameras"), snap => {
      const rows = [];
      snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
      if (rows.length) setCameras(rows);
    });
    return () => unsub();
  }, []);

  const updateStatus = async (c, newStatus) => {
    setCameras(prev =>
      prev.map(x => x.id === c.id ? { ...x, status:newStatus } : x)
    );

    try {
      await addDoc(collection(db,"audit_logs"),{
        cameraId:c.id,
        newStatus,
        timestamp:serverTimestamp(),
      });
    } catch {}
  };

  /* ---------- LOGIN ---------- */

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-[#05070b] grid place-items-center text-white">
        <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <h1 className="text-xl font-bold mb-4 text-cyan-300">
            🛡️ AIRPORT SOC LOGIN
          </h1>

          <input
            placeholder="Email"
            className="w-full mb-2 p-2 rounded bg-neutral-800 border border-neutral-700"
            value={login.username}
            onChange={e=>setLogin({...login,username:e.target.value})}
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full mb-3 p-2 rounded bg-neutral-800 border border-neutral-700"
            value={login.password}
            onChange={e=>setLogin({...login,password:e.target.value})}
          />

          <button
            className="w-full bg-cyan-600 rounded p-2 font-semibold"
            onClick={async ()=>{
              setAuthError("");
              try{
                await signInWithEmailAndPassword(auth,login.username,login.password);
                setIsAuthed(true);
              }catch{
                setAuthError("Login failed");
              }
            }}
          >
            Login
          </button>

          {authError && <p className="text-red-400 mt-2">{authError}</p>}
        </div>
      </div>
    );
  }

  /* ---------- DASHBOARD ---------- */

  return (
    <div className="min-h-screen bg-[#05070b] text-white">
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr]">

        {/* SIDEBAR */}
        <aside className="border-r border-neutral-800 bg-[#060b12] p-5">
          <div className="text-cyan-300 font-bold mb-6">AIRPORT SOC</div>

          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={()=>setActiveView(item.key)}
              className="w-full mb-2 text-left px-3 py-2 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-800"
            >
              {item.label}
            </button>
          ))}

          <button
            onClick={async()=>{ await signOut(auth); setIsAuthed(false); }}
            className="mt-6 w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
          >
            Logout
          </button>
        </aside>

        {/* MAIN */}
        <main className="p-6 space-y-4">

          {/* COMMAND CENTER BAR */}
          <div className="rounded-xl border border-red-800 bg-red-950/30 p-3 flex gap-3 flex-wrap">
            <span className="text-red-400 font-bold">🚨 SOC COMMAND CENTER</span>
            <span>Total: {counts.total}</span>
            <span className={counts.offline>0?"animate-pulse text-red-400":"text-emerald-400"}>
              {counts.offline>0 ? "🔴 CRITICAL" : "🟢 STABLE"}
            </span>
          </div>

          {/* METRICS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(counts).map(([k,v])=>(
              <div key={k} className="rounded-xl bg-neutral-900 border border-neutral-800 p-4">
                <div className="text-xs uppercase text-neutral-400">{k}</div>
                <div className="text-2xl font-bold">{v}</div>
              </div>
            ))}
          </div>

          {/* CAMERA TABLE */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-800">
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Client</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {cameras.map(c=>(
                  <tr key={c.id} className={`border-t border-neutral-800 ${c.status==="offline"?"bg-red-950/30 animate-pulse":""}`}>
                    <td>{c.id}</td>
                    <td>{c.cameraName}</td>
                    <td>{c.client}</td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        <StatusPill status={c.status}/>
                        {STATUSES.map(st=>(
                          <button
                            key={st.key}
                            onClick={()=>updateStatus(c,st.key)}
                            className="px-2 py-1 text-xs bg-neutral-800 border border-neutral-700 rounded"
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </main>
      </div>
    </div>
  );
}
