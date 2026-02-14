import React, { useEffect, useMemo, useRef, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

/* ================= FIREBASE ================= */
const firebaseConfig = {
  apiKey: "AIzaSyBYihneL5770d1gLfwWAJ_sKjfL_hlgUws",
  authDomain: "landside-control-room.firebaseapp.com",
  projectId: "landside-control-room",
  storageBucket: "landside-control-room.firebasestorage.app",
  messagingSenderId: "85978595792",
  appId: "1:85978595792:web:5b6c5de9dbd737205bf9d5",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const STATUSES = ["working", "offline", "maintenance", "removed"];
const ROLE_OPTIONS = ["admin", "supervisor", "operator", "viewer"];
const STATUS_COLOR = {
  working: "bg-emerald-600",
  offline: "bg-red-600 animate-pulse",
  maintenance: "bg-amber-500",
  removed: "bg-zinc-600",
};

function statusPriority(s) {
  if (s === "offline") return 0;
  if (s === "maintenance") return 1;
  if (s === "working") return 2;
  return 3;
}

export default function App() {
  const [role, setRole] = useState("operator");
  const [wallMode, setWallMode] = useState(false);
  const [offlineSince, setOfflineSince] = useState({});
  const [view, setView] = useState("CCTV");
  const [isAuthed, setIsAuthed] = useState(false);
  const [error, setError] = useState("");
  const [login, setLogin] = useState({ username: "", password: "" });

  const [rows, setRows] = useState([]);
  const [queryText, setQueryText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [soundOn, setSoundOn] = useState(true);
  const [lastOfflineCount, setLastOfflineCount] = useState(0);

  const [form, setForm] = useState({
    id: "",
    name: "",
    client: "T1",
    location: "",
    status: "working",
  });

  const colName = view === "CCTV" ? "cameras" : "rt_inventory";

  /* ================= AUTH ================= */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setIsAuthed(!!u));
    return unsub;
  }, []);

  /* ================= LIVE DATA ================= */
  useEffect(() => {
    const q = query(collection(db, colName), orderBy("status"));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ docId: d.id, ...d.data() }));
      setRows(list);
    });
  }, [colName]);

  const counts = useMemo(() => {
    const c = { total: rows.length, working: 0, offline: 0, maintenance: 0, removed: 0 };
    rows.forEach((r) => {
      if (c[r.status] !== undefined) c[r.status]++;
    });
    return c;
  }, [rows]);

  useEffect(() => {
    if (!soundOn) {
      setLastOfflineCount(counts.offline);
      return;
    }
    if (counts.offline > lastOfflineCount) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = "sine"; o.frequency.value = 880;
        g.gain.setValueAtTime(0.001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        o.start(); o.stop(ctx.currentTime + 0.25);
      } catch {}
    }
    setLastOfflineCount(counts.offline);
  }, [counts.offline, lastOfflineCount, soundOn]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return rows
      .filter((r) => (statusFilter === "all" ? true : r.status === statusFilter))
      .filter((r) => (clientFilter === "all" ? true : r.client === clientFilter))
      .filter((r) => {
        if (!q) return true;
        return [r.id, r.name, r.location].some((v) => (v || "").toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const p = statusPriority(a.status) - statusPriority(b.status);
        if (p !== 0) return p;
        const ta = offlineSince[a.docId] || 0;
        const tb = offlineSince[b.docId] || 0;
        return ta - tb;
      });
  }, [rows, queryText, statusFilter, clientFilter, offlineSince]);

  /* ================= CRUD ================= */
  const addItem = async () => {
    if (!form.id.trim()) return;
    await setDoc(
      doc(db, colName, form.id.trim()),
      { ...form, id: form.id.trim(), updatedAt: serverTimestamp() },
      { merge: true }
    );
    setForm({ id: "", name: "", client: "T1", location: "", status: "working" });
  };

  const updateField = async (item, key, value) => {
    await updateDoc(doc(db, colName, item.docId), { [key]: value, updatedAt: serverTimestamp() });
  };

  const deleteItem = async (item) => {
    await deleteDoc(doc(db, colName, item.docId));
  };

  /* ================= CSV ================= */
  const exportCSV = () => {
    const rowsCsv = filtered.map((i) => `${i.id},${i.name || ""},${i.client || ""},${i.location || ""},${i.status}`);
    const csv = "id,name,client,location,status\n" + rowsCsv.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${view}_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const uploadCSV = async (e, defaultClient) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const batch = writeBatch(db);
    for (let i = 1; i < lines.length; i++) {
      const [id, name, client, location, status] = lines[i].split(",");
      if (!id?.trim()) continue;
      batch.set(
        doc(db, colName, id.trim()),
        {
          id: id.trim(),
          name: (name || "").trim() || id.trim(),
          client: (client || defaultClient || "T1").trim(),
          location: (location || "").trim(),
          status: ((status || "working").trim().toLowerCase()),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
    e.target.value = "";
  };

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-zinc-900 rounded-2xl p-6 shadow-2xl">
          <h1 className="text-xl font-semibold mb-3">SOC PRO MAX Login</h1>
          <input className="w-full p-2 mb-2 bg-zinc-800 rounded" placeholder="Email" onChange={(e)=>setLogin({...login, username:e.target.value})} />
          <input type="password" className="w-full p-2 mb-3 bg-zinc-800 rounded" placeholder="Password" onChange={(e)=>setLogin({...login, password:e.target.value})} />
          <button className="w-full bg-cyan-600 hover:bg-cyan-500 p-2 rounded" onClick={async()=>{try{setError("");await signInWithEmailAndPassword(auth, login.username, login.password);}catch(err){setError(err.message||"Login failed");}}}>Login</button>
          {error && <div className="text-red-400 text-xs mt-2">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05070b] text-white p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex gap-2">
          <button onClick={()=>setView("CCTV")} className={`px-3 py-2 rounded ${view==="CCTV"?"bg-cyan-600":"bg-zinc-800"}`}>CCTV</button>
          <button onClick={()=>setView("RT")} className={`px-3 py-2 rounded ${view==="RT"?"bg-cyan-600":"bg-zinc-800"}`}>RT</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setSoundOn(s=>!s)} className="px-3 py-2 rounded bg-zinc-800">Alarm: {soundOn?"ON":"OFF"}</button>
          <button onClick={()=>signOut(auth)} className="px-3 py-2 rounded bg-red-600">Logout</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {Object.entries(counts).map(([k,v])=> (
          <div key={k} className="bg-zinc-900 rounded-2xl p-3 border border-zinc-800">
            <div className="text-xs text-zinc-400 uppercase">{k}</div>
            <div className="text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 mb-4 flex flex-wrap gap-2 items-center">
        <input value={queryText} onChange={(e)=>setQueryText(e.target.value)} placeholder="Search ID / Name / Location" className="bg-zinc-800 rounded px-3 py-2 min-w-[220px]" />
        <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)} className="bg-zinc-800 rounded px-3 py-2">
          <option value="all">All Status</option>
          {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <select value={clientFilter} onChange={(e)=>setClientFilter(e.target.value)} className="bg-zinc-800 rounded px-3 py-2">
          <option value="all">All Clients</option>
          <option value="T1">T1</option>
          <option value="T2">T2</option>
        </select>
        <button onClick={exportCSV} className="bg-cyan-700 px-3 py-2 rounded">Export CSV</button>
        <label className="bg-zinc-800 px-3 py-2 rounded cursor-pointer">Upload T1 CSV<input hidden type="file" onChange={(e)=>uploadCSV(e,"T1")} /></label>
        <label className="bg-zinc-800 px-3 py-2 rounded cursor-pointer">Upload T2 CSV<input hidden type="file" onChange={(e)=>uploadCSV(e,"T2")} /></label>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 mb-4">
        <div className="text-sm text-zinc-300 mb-2">Add New Item</div>
        <div className="grid md:grid-cols-6 gap-2">
          <input value={form.id} onChange={(e)=>setForm({...form,id:e.target.value})} placeholder="ID" className="bg-zinc-800 rounded p-2" />
          <input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} placeholder="Name" className="bg-zinc-800 rounded p-2" />
          <select value={form.client} onChange={(e)=>setForm({...form,client:e.target.value})} className="bg-zinc-800 rounded p-2"><option>T1</option><option>T2</option></select>
          <input value={form.location} onChange={(e)=>setForm({...form,location:e.target.value})} placeholder="Location" className="bg-zinc-800 rounded p-2" />
          <select value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})} className="bg-zinc-800 rounded p-2">{STATUSES.map(s=><option key={s}>{s}</option>)}</select>
          <button onClick={addItem} className="bg-emerald-600 rounded p-2">Add / Update</button>
        </div>
      </div>

      <div className="overflow-auto bg-zinc-900 border border-zinc-800 rounded-2xl">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800 sticky top-0">
            <tr>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-left">Client</th>
              <th className="p-2 text-left">Location</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Delete</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item)=>(
              <tr key={item.docId} className="border-t border-zinc-800">
                <td className="p-2 font-mono">{item.id}</td>
                <td className="p-2"><input defaultValue={item.name||""} onBlur={(e)=>updateField(item,"name",e.target.value)} className="bg-zinc-800 rounded p-1 w-full" /></td>
                <td className="p-2">{item.client}</td>
                <td className="p-2"><input defaultValue={item.location||""} onBlur={(e)=>updateField(item,"location",e.target.value)} className="bg-zinc-800 rounded p-1 w-full" /></td>
                <td className="p-2">
                  <select defaultValue={item.status} onChange={(e)=>updateField(item,"status",e.target.value)} className="bg-zinc-800 rounded p-1">
                    {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                  <span className={`inline-block ml-2 text-xs px-2 py-0.5 rounded ${STATUS_COLOR[item.status]||"bg-zinc-600"}`}>{item.status}</span>
                </td>
                <td className="p-2"><button onClick={()=>deleteItem(item)} className="bg-red-600 px-2 py-1 rounded">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
