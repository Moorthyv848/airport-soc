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

/* ================= ENTERPRISE SOC CONFIG ================= */

const STATUSES = [
  { key: "working", label: "Working", color: "bg-emerald-500" },
  { key: "offline", label: "Offline", color: "bg-red-600" },
  { key: "maintenance", label: "Maintenance", color: "bg-amber-500" },
  { key: "removed", label: "Removed", color: "bg-slate-600" },
];

const NAV_ITEMS = [
  { key: "CCTV Dashboard", icon: Monitor },
  { key: "RT Inventory", icon: Radio },
  { key: "Supervisor View", icon: ShieldCheck },
  { key: "Shift Reports", icon: FileText },
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
  console.error(e);
}

/* ================= UI COMPONENTS ================= */

const StatusPill = ({ status }) => {
  const s = STATUSES.find(x => x.key === status);
  return (
    <span className={`px-2 py-1 text-xs rounded-full text-white ${s?.color}`}>
      {s?.label}
    </span>
  );
};

const Metric = ({ title, value }) => (
  <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
    <div className="text-xs text-neutral-400 uppercase">{title}</div>
    <div className="text-2xl font-bold text-cyan-300">{value}</div>
  </div>
);

/* ================= MAIN APP ================= */

export default function App() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [login, setLogin] = useState({ username:"", password:"" });
  const [authError, setAuthError] = useState("");
  const [activeView, setActiveView] = useState("CCTV Dashboard");

  const [cameras, setCameras] = useState([]);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(collection(db,"cameras"), snap => {
      const rows = [];
      snap.forEach(d => rows.push({ docId:d.id, ...d.data() }));
      setCameras(rows);
    });
  }, []);

  const counts = useMemo(()=>{
    const c = { total:cameras.length, working:0, offline:0 };
    cameras.forEach(x=>{
      if(x.status==="working") c.working++;
      if(x.status==="offline") c.offline++;
    });
    return c;
  },[cameras]);

  /* ===== LOGIN SCREEN ===== */

  if(!isAuthed){
    return (
      <div className="min-h-screen bg-[#05070b] flex items-center justify-center">
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
          <h1 className="text-2xl font-bold text-cyan-300 mb-4">
            🛡 AIRPORT SOC LOGIN
          </h1>

          <input
            className="w-full mb-2 rounded bg-neutral-800 p-2"
            placeholder="Email"
            value={login.username}
            onChange={e=>setLogin({...login,username:e.target.value})}
          />

          <input
            type="password"
            className="w-full mb-3 rounded bg-neutral-800 p-2"
            placeholder="Password"
            value={login.password}
            onChange={e=>setLogin({...login,password:e.target.value})}
          />

          <button
            className="w-full bg-cyan-600 hover:bg-cyan-500 rounded p-2 font-semibold"
            onClick={async()=>{
              try{
                await signInWithEmailAndPassword(
                  auth,
                  login.username,
                  login.password
                );
                setIsAuthed(true);
              }catch(err){
                setAuthError(err.message);
              }
            }}
          >
            Login
          </button>

          {authError && <p className="text-red-400 mt-2 text-sm">{authError}</p>}
        </div>
      </div>
    );
  }

  /* ===== ENTERPRISE DASHBOARD ===== */

  return (
    <div className="min-h-screen bg-[#05070b] text-white flex">

      {/* SIDEBAR */}
      <aside className="w-64 border-r border-neutral-800 bg-[#060b12] p-5">
        <h1 className="text-cyan-300 font-bold tracking-wider">
          AIRPORT SOC
        </h1>

        <nav className="mt-6 space-y-2">
          {NAV_ITEMS.map(n=>{
            const Icon=n.icon;
            return (
              <button
                key={n.key}
                onClick={()=>setActiveView(n.key)}
                className="w-full flex items-center gap-2 p-2 rounded-lg bg-neutral-900 hover:bg-neutral-800"
              >
                <Icon size={16}/> {n.key}
              </button>
            );
          })}
        </nav>

        <button
          onClick={()=>signOut(auth)}
          className="mt-8 w-full bg-neutral-800 p-2 rounded"
        >
          Logout
        </button>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-6 space-y-4">

        {/* COMMAND BAR */}
        <section className="bg-cyan-950/30 border border-cyan-800 rounded-xl p-4">
          <div className="text-cyan-300 font-bold">
            🛡 ENTERPRISE SOC COMMAND CENTER
          </div>
        </section>

        {/* METRICS */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric title="Total Cameras" value={counts.total}/>
          <Metric title="Working" value={counts.working}/>
          <Metric title="Offline" value={counts.offline}/>
          <Metric title="System Health" value={counts.offline>0?"CRITICAL":"STABLE"}/>
        </section>

        {/* CAMERA GRID */}
        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <h2 className="mb-3 font-semibold text-cyan-300">Live Camera Grid</h2>

          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-800">
                <tr>
                  <th className="p-2 text-left">ID</th>
                  <th className="p-2 text-left">Location</th>
                  <th className="p-2 text-left">Status</th>
                </tr>
              </thead>

              <tbody>
                {cameras.map(c=>(
                  <tr
                    key={c.id}
                    className={`border-t border-neutral-800 ${
                      c.status==="offline"
                        ? "bg-red-950/30 animate-pulse"
                        : ""
                    }`}
                  >
                    <td className="p-2">{c.id}</td>
                    <td className="p-2">{c.location}</td>
                    <td className="p-2"><StatusPill status={c.status}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </main>
    </div>
  );
}
