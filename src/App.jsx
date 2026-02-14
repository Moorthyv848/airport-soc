import React, { useEffect, useMemo, useState } from "react";
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
  getDocs,
  limit,
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
  const [view, setView] = useState("CCTV");
  const [isAuthed, setIsAuthed] = useState(false);
  const [error, setError] = useState("");
  const [login, setLogin] = useState({ username: "", password: "" });

  const [rows, setRows] = useState([]);
  const [queryText, setQueryText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState({});
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const [cctvForm, setCctvForm] = useState({ id: "", name: "", client: "T1", status: "working" });
  const [rtForm, setRtForm] = useState({ name: "", status: "working" });

  const colName = view === "CCTV" ? "cameras" : "rt_inventory";

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setIsAuthed(!!u));
    return unsub;
  }, []);

  useEffect(() => {
    const qy = query(collection(db, colName), orderBy("status"));
    return onSnapshot(qy, (snap) => {
      setRows(snap.docs.map((d) => ({ docId: d.id, ...d.data() })));
      setSelectedIds({});
    });
  }, [colName]);

  const counts = useMemo(() => {
    const c = { total: rows.length, working: 0, offline: 0, maintenance: 0, removed: 0 };
    rows.forEach((r) => { if (c[r.status] !== undefined) c[r.status]++; });
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return rows
      .filter((r) => (statusFilter === "all" ? true : r.status === statusFilter))
      .filter((r) => (view === "RT" || clientFilter === "all" ? true : r.client === clientFilter))
      .filter((r) => {
        if (!q) return true;
        const parts = view === "RT" ? [String(r.slNo || ""), r.name] : [r.id, r.name];
        return parts.some((v) => (v || "").toString().toLowerCase().includes(q));
      })
      .sort((a, b) => statusPriority(a.status) - statusPriority(b.status));
  }, [rows, queryText, statusFilter, clientFilter, view]);

  const updateField = async (item, key, value) => {
    await updateDoc(doc(db, colName, item.docId), { [key]: value, updatedAt: serverTimestamp() });
  };

  const deleteItem = async (item) => {
    await deleteDoc(doc(db, colName, item.docId));
  };

  const toggleSelect = (docId, checked) => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      if (checked) next[docId] = true; else delete next[docId];
      return next;
    });
  };

  const bulkDeleteSelected = async () => {
    const ids = Object.keys(selectedIds).filter((k) => selectedIds[k]);
    if (!ids.length) return;
    const batch = writeBatch(db);
    ids.forEach((id) => batch.delete(doc(db, colName, id)));
    await batch.commit();
    setSelectedIds({});
    setShowBulkConfirm(false);
  };

  const addCctv = async () => {
    if (!cctvForm.id.trim()) return;
    await setDoc(doc(db, "cameras", cctvForm.id.trim()), {
      id: cctvForm.id.trim(),
      name: cctvForm.name.trim() || cctvForm.id.trim(),
      client: cctvForm.client,
      status: cctvForm.status,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setCctvForm({ id: "", name: "", client: cctvForm.client, status: "working" });
  };

  const addRT = async () => {
    const name = rtForm.name.trim();
    if (!name) return;
    const snap = await getDocs(query(collection(db, "rt_inventory"), orderBy("slNo", "desc"), limit(1)));
    const last = snap.docs[0]?.data()?.slNo || 0;
    const nextSl = Number(last || 0) + 1;
    const docId = `RT-${nextSl}`;
    await setDoc(doc(db, "rt_inventory", docId), {
      slNo: nextSl,
      name,
      status: rtForm.status,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setRtForm({ name: "", status: "working" });
  };

  const exportCSV = () => {
    const rowsCsv = filtered.map((i) => view === "RT"
      ? `${i.slNo || ""},${i.name || ""},${i.status || ""}`
      : `${i.id || ""},${i.name || ""},${i.client || ""},${i.status || ""}`);
    const header = view === "RT" ? "slNo,name,status" : "id,name,client,status";
    const csv = header + "\n" + rowsCsv.join("\n");
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
      const [id, name, client, status] = lines[i].split(",");
      if (!id?.trim()) continue;
      batch.set(doc(db, "cameras", id.trim()), {
        id: id.trim(),
        name: (name || "").trim() || id.trim(),
        client: (client || defaultClient || "T1").trim(),
        status: ((status || "working").trim().toLowerCase()),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
    e.target.value = "";
  };

  if (!isAuthed) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center p-4"><div className="w-full max-w-sm bg-zinc-900 rounded-2xl p-6"><h1 className="text-xl font-semibold mb-3">SOC Login</h1><input className="w-full p-2 mb-2 bg-zinc-800 rounded" placeholder="Email" onChange={(e)=>setLogin({...login, username:e.target.value})} /><input type="password" className="w-full p-2 mb-3 bg-zinc-800 rounded" placeholder="Password" onChange={(e)=>setLogin({...login, password:e.target.value})} /><button className="w-full bg-cyan-600 p-2 rounded" onClick={async()=>{try{setError("");await signInWithEmailAndPassword(auth, login.username, login.password);}catch(err){setError(err.message||"Login failed");}}}>Login</button>{error && <div className="text-red-400 text-xs mt-2">{error}</div>}</div></div>;
  }

  return (
    <div className="min-h-screen bg-[#05070b] text-white p-4 md:p-6">
      {showBulkConfirm && <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"><div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 w-full max-w-md"><div className="text-lg font-semibold mb-2">Confirm bulk delete</div><div className="text-sm text-zinc-300 mb-4">Delete {Object.keys(selectedIds).length} selected items?</div><div className="flex justify-end gap-2"><button onClick={()=>setShowBulkConfirm(false)} className="px-3 py-2 bg-zinc-700 rounded">Cancel</button><button onClick={bulkDeleteSelected} className="px-3 py-2 bg-red-700 rounded">Delete</button></div></div></div>}

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex gap-2"><button onClick={()=>setView("CCTV")} className={`px-3 py-2 rounded ${view==="CCTV"?"bg-cyan-600":"bg-zinc-800"}`}>CCTV</button><button onClick={()=>setView("RT")} className={`px-3 py-2 rounded ${view==="RT"?"bg-cyan-600":"bg-zinc-800"}`}>RT</button></div>
        <button onClick={()=>signOut(auth)} className="px-3 py-2 rounded bg-red-600">Logout</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">{Object.entries(counts).map(([k,v])=><div key={k} className="bg-zinc-900 rounded-2xl p-3 border border-zinc-800"><div className="text-xs text-zinc-400 uppercase">{k}</div><div className="text-2xl font-semibold">{v}</div></div>)}</div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 mb-4 flex flex-wrap gap-2 items-center">
        <input value={queryText} onChange={(e)=>setQueryText(e.target.value)} placeholder={view==="RT"?"Search SL No / Name":"Search ID / Name"} className="bg-zinc-800 rounded px-3 py-2 min-w-[220px]" />
        <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)} className="bg-zinc-800 rounded px-3 py-2"><option value="all">All Status</option>{STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select>
        {view === "CCTV" && <select value={clientFilter} onChange={(e)=>setClientFilter(e.target.value)} className="bg-zinc-800 rounded px-3 py-2"><option value="all">All Clients</option><option value="T1">T1</option><option value="T2">T2</option></select>}
        <button onClick={()=>setShowBulkConfirm(true)} className="bg-red-700 px-3 py-2 rounded">Bulk Delete (Safe)</button>
        <button onClick={exportCSV} className="bg-cyan-700 px-3 py-2 rounded">Export CSV</button>
        {view === "CCTV" ? <><label className="bg-zinc-800 px-3 py-2 rounded cursor-pointer">Upload T1 CSV<input hidden type="file" onChange={(e)=>uploadCSV(e,"T1")} /></label><label className="bg-zinc-800 px-3 py-2 rounded cursor-pointer">Upload T2 CSV<input hidden type="file" onChange={(e)=>uploadCSV(e,"T2")} /></label></> : null}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 mb-4 flex flex-wrap gap-2 items-center">
        {view === "CCTV" ? (
          <>
            <input className="bg-zinc-800 rounded px-3 py-2" placeholder="Camera ID" value={cctvForm.id} onChange={(e)=>setCctvForm({...cctvForm,id:e.target.value})} />
            <input className="bg-zinc-800 rounded px-3 py-2" placeholder="Camera Name" value={cctvForm.name} onChange={(e)=>setCctvForm({...cctvForm,name:e.target.value})} />
            <select className="bg-zinc-800 rounded px-3 py-2" value={cctvForm.client} onChange={(e)=>setCctvForm({...cctvForm,client:e.target.value})}><option value="T1">T1</option><option value="T2">T2</option></select>
            <button onClick={addCctv} className="bg-emerald-700 px-3 py-2 rounded">Add Camera</button>
          </>
        ) : (
          <>
            <input className="bg-zinc-800 rounded px-3 py-2" placeholder="RT Name" value={rtForm.name} onChange={(e)=>setRtForm({...rtForm,name:e.target.value})} />
            <button onClick={addRT} className="bg-emerald-700 px-3 py-2 rounded">Add RT</button>
          </>
        )}
      </div>

      <div className="overflow-auto bg-zinc-900 border border-zinc-800 rounded-2xl">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800 sticky top-0">
            <tr>
              <th className="p-2 text-left"><input type="checkbox" checked={filtered.length>0 && filtered.every(i=>selectedIds[i.docId])} onChange={(e)=>{const checked=e.target.checked; const next={}; if(checked) filtered.forEach(i=>next[i.docId]=true); setSelectedIds(next);}} /></th>
              {view === "RT" ? <><th className="p-2 text-left">SL No</th><th className="p-2 text-left">Name</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Edit</th><th className="p-2 text-left">Delete</th></> : <><th className="p-2 text-left">ID</th><th className="p-2 text-left">Name</th><th className="p-2 text-left">Client</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Edit</th><th className="p-2 text-left">Delete</th></>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.docId} className="border-t border-zinc-800">
                <td className="p-2"><input type="checkbox" checked={!!selectedIds[item.docId]} onChange={(e)=>toggleSelect(item.docId,e.target.checked)} /></td>
                {view === "RT" ? (
                  <>
                    <td className="p-2 font-mono">{item.slNo || "-"}</td>
                    <td className="p-2">{item.name || ""}</td>
                    <td className="p-2"><select value={item.status||"working"} onChange={(e)=>updateField(item,"status",e.target.value)} className="bg-zinc-800 rounded p-1">{STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select><span className={`inline-block ml-2 text-xs px-2 py-0.5 rounded ${STATUS_COLOR[item.status]||"bg-zinc-600"}`}>{item.status}</span></td>
                    <td className="p-2"><button className="bg-amber-700 px-2 py-1 rounded" onClick={async()=>{const v=window.prompt("Edit RT Name", item.name||""); if(v===null) return; await updateField(item,"name",v);}}>Edit</button></td>
                    <td className="p-2"><button onClick={()=>deleteItem(item)} className="bg-red-600 px-2 py-1 rounded">Delete</button></td>
                  </>
                ) : (
                  <>
                    <td className="p-2 font-mono">{item.id}</td>
                    <td className="p-2">{item.name || ""}</td>
                    <td className="p-2">{item.client}</td>
                    <td className="p-2"><select value={item.status||"working"} onChange={(e)=>updateField(item,"status",e.target.value)} className="bg-zinc-800 rounded p-1">{STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select><span className={`inline-block ml-2 text-xs px-2 py-0.5 rounded ${STATUS_COLOR[item.status]||"bg-zinc-600"}`}>{item.status}</span></td>
                    <td className="p-2"><button className="bg-amber-700 px-2 py-1 rounded" onClick={async()=>{const v=window.prompt("Edit Camera Name", item.name||""); if(v===null) return; await updateField(item,"name",v);}}>Edit</button></td>
                    <td className="p-2"><button onClick={()=>deleteItem(item)} className="bg-red-600 px-2 py-1 rounded">Delete</button></td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
