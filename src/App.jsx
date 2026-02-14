import React, { useEffect, useMemo, useState } from "react";
import { Monitor, Radio, ShieldCheck, FileText } from "lucide-react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, collection, doc, onSnapshot, updateDoc, serverTimestamp, getDoc, addDoc, setDoc, writeBatch } from "firebase/firestore";

/*
 SOC ELITE — CLEAN SINGLE SOURCE VERSION
 - No duplicate blocks
 - Compile-safe JSX
 - CCTV + RT Enterprise features
 - Incident panel + replay
*/

const STATUSES = [
  { key: "working", label: "Working", pill: "bg-emerald-500", row: "" },
  { key: "offline", label: "Offline", pill: "bg-slate-500", row: "bg-slate-900/50" },
  { key: "maintenance", label: "Maintenance", pill: "bg-amber-500", row: "bg-amber-950/20" },
  { key: "removed", label: "Removed", pill: "bg-rose-700", row: "bg-rose-950/30" },
];

const NAV_ITEMS = [
  { key: "CCTV Dashboard", label: "CCTV Dashboard", icon: Monitor },
  { key: "RT Inventory", label: "RT Inventory", icon: Radio },
  { key: "Supervisor View", label: "Supervisor View", icon: ShieldCheck },
  { key: "Shift Reports", label: "Shift Reports", icon: FileText },
];

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
let db = null;
try {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error(e);
}

const seedCameras = Array.from({ length: 40 }).map((_, i) => ({
  id: `CAM-${String(i + 1).padStart(4, "0")}`,
  client: i % 2 === 0 ? "T1" : "T2",
  cameraName: `Camera ${i + 1}`,
  location: i % 2 === 0 ? "T1 Zone" : "T2 Zone",
  status: "working",
  updatedAt: new Date().toISOString(),
  updatedBy: "system",
}));

function StatusPill({ status }) {
  const s = STATUSES.find((x) => x.key === status) || STATUSES[0];
  return <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] text-white ${s.pill}`}>{s.label}</span>;
}

function SectionCard({ title, right, children }) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MetricCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/85 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">{title}</div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function AddCameraInline({ onAdd }) {
  const [form, setForm] = useState({ id: "", cameraName: "", client: "T1", location: "", status: "working" });
  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
      <input value={form.id} onChange={(e)=>setForm(f=>({...f,id:e.target.value}))} placeholder="Camera ID" className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
      <input value={form.cameraName} onChange={(e)=>setForm(f=>({...f,cameraName:e.target.value}))} placeholder="Camera Name" className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
      <select value={form.client} onChange={(e)=>setForm(f=>({...f,client:e.target.value}))} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"><option>T1</option><option>T2</option></select>
      <input value={form.location} onChange={(e)=>setForm(f=>({...f,location:e.target.value}))} placeholder="Location" className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
      <select value={form.status} onChange={(e)=>setForm(f=>({...f,status:e.target.value}))} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2">{STATUSES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select>
      <button className="rounded-xl bg-cyan-600 px-3 py-2" onClick={()=>{ if(!form.id.trim()) return; onAdd({ ...form, id: form.id.trim(), cameraName: form.cameraName || form.id.trim(), updatedAt:new Date().toISOString(), updatedBy:"manual" }); setForm(f=>({...f,id:"",cameraName:"",location:""})); }}>Add Camera</button>
    </div>
  );
}

export default function CCTVDashboardSocProMax() {
  const [activeView, setActiveView] = useState("CCTV Dashboard");
  const [isAuthed, setIsAuthed] = useState(false);
  const [login, setLogin] = useState({ username: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [userName, setUserName] = useState("");
  const [role, setRole] = useState("operator");

  const [cameras, setCameras] = useState(seedCameras);
  const [selected, setSelected] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState("working");
  const [q, setQ] = useState("");
  const [client, setClient] = useState("ALL");
  const [status, setStatus] = useState("ALL");

  const [editingKey, setEditingKey] = useState(null);
  const [editingForm, setEditingForm] = useState({ id:"", cameraName:"", client:"T1", location:"", status:"working" });

  const [incidentLogs, setIncidentLogs] = useState([]);
  const [actionHistory, setActionHistory] = useState([]);

  const [rtInventory, setRtInventory] = useState([]);
  const [rtForm, setRtForm] = useState({ rtNumber: "", location: "T1", status: "working" });
  const RT_LOCATIONS = ["T1","T2","Landside","Control Room"];

  const getRowKey = (c) => c.docId || c.id;

  const pushIncident = (message, level="info") => {
    setIncidentLogs(prev => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2,6)}`, message, level, time: new Date().toISOString() }, ...prev].slice(0,50));
  };
  const pushAction = (action) => setActionHistory(prev => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2,6)}`, ...action }, ...prev].slice(0,50));

  useEffect(()=>{
    if(!db) return;
    const unsub = onSnapshot(collection(db,"cameras"),(snap)=>{
      const rows=[]; snap.forEach(d=>rows.push({ docId:d.id, ...d.data(), id:d.data()?.id || d.id }));
      if(rows.length) setCameras(rows);
    });
    return ()=>unsub();
  },[]);

  const filtered = useMemo(()=>{
    const base = cameras.filter(c=>{
      const qq=q.toLowerCase();
      return (!q || c.id.toLowerCase().includes(qq) || (c.cameraName||"").toLowerCase().includes(qq) || (c.location||"").toLowerCase().includes(qq))
      && (client==="ALL" || c.client===client)
      && (status==="ALL" || c.status===status);
    });
    const pr={offline:0,maintenance:1,removed:2,working:3};
    return [...base].sort((a,b)=>(pr[a.status]??9)-(pr[b.status]??9) || String(a.id).localeCompare(String(b.id)));
  },[cameras,q,client,status]);

  const counts = useMemo(()=>{ const b={total:cameras.length,working:0,offline:0,maintenance:0,removed:0}; cameras.forEach(c=>{ if(b[c.status]!==undefined) b[c.status]++;}); return b; },[cameras]);
  const rtCounts = useMemo(()=>{ const b={total:rtInventory.length,working:0,offline:0,maintenance:0,removed:0}; rtInventory.forEach(r=>{ if(b[r.status]!==undefined) b[r.status]++;}); return b; },[rtInventory]);
  const activeCounts = activeView==="RT Inventory" ? rtCounts : counts;

  const updateStatus = async (c,newStatus)=>{
    pushAction({ type:"status", cameraId:c.id, from:c.status, to:newStatus });
    pushIncident(`Camera ${c.id}: ${c.status} → ${newStatus}`, newStatus==="offline"?"critical":"info");
    setCameras(prev=>prev.map(x=>x.id===c.id?{...x,status:newStatus,updatedAt:new Date().toISOString(),updatedBy:userName||"operator"}:x));
    if(db && c.docId){ try{ await updateDoc(doc(db,"cameras",c.docId),{status:newStatus,updatedAt:serverTimestamp(),updatedBy:userName||"operator"}); await addDoc(collection(db,"audit_logs"),{cameraId:c.id,oldStatus:c.status,newStatus,timestamp:serverTimestamp()}); }catch{} }
  };

  const replayLastAction = ()=>{
    const last=actionHistory[0]; if(!last) return;
    if(last.type==="status"){ setCameras(prev=>prev.map(c=>c.id===last.cameraId?{...c,status:last.from}:c)); pushIncident(`Replay: ${last.cameraId} restored to ${last.from}`); }
    setActionHistory(prev=>prev.slice(1));
  };

  const startEdit=(c)=>{ setEditingKey(getRowKey(c)); setEditingForm({ id:c.id||"", cameraName:c.cameraName||"", client:c.client||"T1", location:c.location||"", status:c.status||"working" }); };
  const saveEdit=()=>{ if(!editingKey) return; setCameras(prev=>prev.map(c=>getRowKey(c)===editingKey?{...c,...editingForm,updatedAt:new Date().toISOString(),updatedBy:userName||"operator"}:c)); pushIncident(`Camera ${editingForm.id} edited`); setEditingKey(null); };
  const deleteCamera=(rowKey)=>{ const cam=cameras.find(c=>getRowKey(c)===rowKey); if(cam) pushIncident(`Camera ${cam.id} deleted`,`warning`); setSelected(prev=>{const n=new Set(prev); n.delete(rowKey); return n;}); setCameras(prev=>prev.filter(c=>getRowKey(c)!==rowKey)); };

  const toggleSelected=(k)=> setSelected(prev=>{const n=new Set(prev); n.has(k)?n.delete(k):n.add(k); return n;});
  const selectVisible=()=> setSelected(new Set(filtered.map(getRowKey)));
  const clearSelection=()=> setSelected(new Set());

  const applyBulkUpdate = async ()=>{
    if(!selected.size) return;
    setCameras(prev=>prev.map(c=>selected.has(getRowKey(c))?{...c,status:bulkStatus,updatedAt:new Date().toISOString(),updatedBy:userName||"operator"}:c));
    if(db){ const batch=writeBatch(db); cameras.forEach(c=>{ if(selected.has(getRowKey(c)) && c.docId){ batch.update(doc(db,"cameras",c.docId),{status:bulkStatus,updatedAt:serverTimestamp(),updatedBy:userName||"operator"}); }}); try{ await batch.commit(); }catch{} }
    clearSelection();
  };

  const addRT=()=>{ const rt=rtForm.rtNumber.trim(); if(!rt) return; setRtInventory(prev=>[{ rtNumber:rt, location:rtForm.location, status:rtForm.status, updatedAt:new Date().toISOString() }, ...prev.filter(x=>x.rtNumber!==rt)]); setRtForm(f=>({...f,rtNumber:""})); pushIncident(`RT ${rt} added/updated`); };

  if(!isAuthed){
    return <div className="min-h-screen bg-[#05070b] text-neutral-100 grid place-items-center p-4"><div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6"><h1 className="text-xl font-bold text-white">Airport SOC Login</h1><div className="mt-4 space-y-3"><input value={login.username} onChange={e=>setLogin({...login,username:e.target.value})} placeholder="Email" className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" /><input type="password" value={login.password} onChange={e=>setLogin({...login,password:e.target.value})} placeholder="Password" className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" /><button className="w-full rounded-xl bg-cyan-600 px-3 py-2 font-semibold" onClick={async()=>{ setAuthError(""); if(!auth) return setAuthError("Firebase not connected"); try{ const cred=await signInWithEmailAndPassword(auth,login.username.trim(),login.password); setUserName(cred.user.email||login.username); if(db){ const snap=await getDoc(doc(db,"users",cred.user.email||login.username)); if(snap.exists()) setRole(snap.data()?.role||"operator"); } setIsAuthed(true);}catch{ setAuthError("Invalid login credentials"); }}}>Login to Control Room</button>{authError && <div className="text-xs text-red-400">{authError}</div>}</div></div></div>;
  }

  return (
    <div className="min-h-screen bg-[#05070b] text-neutral-100">
      <div className="mx-auto grid min-h-screen max-w-[1800px] grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="border-r border-neutral-800 bg-[#060b12] p-5">
          <div className="text-sm font-semibold tracking-[0.22em] text-cyan-300">AIRPORT SOC</div>
          <nav className="mt-6 space-y-2 text-sm">{NAV_ITEMS.map(item=>{ const Icon=item.icon; const active=activeView===item.key; return <button key={item.key} onClick={()=>setActiveView(item.key)} className={`w-full rounded-xl border px-3 py-2 text-left flex items-center gap-2 ${active?"border-cyan-700 bg-neutral-800 text-cyan-300":"border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800"}`}><Icon size={16}/><span>{item.label}</span></button>; })}</nav>
          <div className="mt-6 text-xs text-neutral-500 whitespace-pre-line">{`User: ${userName}\nRole: ${role}`}</div>
          <button onClick={async()=>{ try{ if(auth) await signOut(auth);}catch{} setIsAuthed(false); }} className="mt-4 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs">Logout</button>
        </aside>

        <main className="p-4 md:p-6 lg:p-8 space-y-4">
          <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <MetricCard title="Total" value={activeCounts.total} />
            <MetricCard title="Working" value={activeCounts.working} />
            <MetricCard title="Offline" value={activeCounts.offline} />
            <MetricCard title="Maintenance" value={activeCounts.maintenance} />
            <MetricCard title="Removed" value={activeCounts.removed} />
            <MetricCard title="Selected" value={selected.size} />
            <MetricCard title="Health" value={(activeCounts.offline+activeCounts.removed)>0?"ATTN":"OK"} />
          </section>

          {activeView==="CCTV Dashboard" && <>
            <SectionCard title="Filters & Actions" right={<span className="text-xs text-neutral-400">{filtered.length} cameras</span>}>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search" className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
                <select value={client} onChange={e=>setClient(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"><option value="ALL">All Clients</option><option value="T1">T1</option><option value="T2">T2</option></select>
                <select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"><option value="ALL">All Status</option>{STATUSES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select>
                <select value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2">{STATUSES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select>
                <button onClick={applyBulkUpdate} className="rounded-xl bg-emerald-600 px-3 py-2">Bulk Apply</button>
                <div className="flex gap-2"><button onClick={selectVisible} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2">Select Visible</button><button onClick={clearSelection} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2">Clear</button></div>
              </div>
            </SectionCard>

            <SectionCard title="Add Camera"><AddCameraInline onAdd={(cam)=>setCameras(prev=>[cam,...prev])} /></SectionCard>

            <SectionCard title="Live Camera Grid">
              <div className="overflow-auto"><table className="w-full text-sm"><thead className="bg-neutral-800 text-neutral-300"><tr><th className="px-3 py-2">Sel</th><th className="px-3 py-2 text-left">ID</th><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Client</th><th className="px-3 py-2 text-left">Location</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Actions</th></tr></thead><tbody>
                {filtered.map(c=>{ const rk=getRowKey(c); const editing=editingKey===rk; return <tr key={rk} className="border-t border-neutral-800"><td className="px-3 py-2"><input type="checkbox" checked={selected.has(rk)} onChange={()=>toggleSelected(rk)} /></td><td className="px-3 py-2 text-cyan-200">{editing?<input value={editingForm.id} onChange={e=>setEditingForm(f=>({...f,id:e.target.value}))} className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"/>:c.id}</td><td className="px-3 py-2">{editing?<input value={editingForm.cameraName} onChange={e=>setEditingForm(f=>({...f,cameraName:e.target.value}))} className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"/>:c.cameraName}</td><td className="px-3 py-2">{editing?<select value={editingForm.client} onChange={e=>setEditingForm(f=>({...f,client:e.target.value}))} className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"><option>T1</option><option>T2</option></select>:c.client}</td><td className="px-3 py-2">{editing?<input value={editingForm.location} onChange={e=>setEditingForm(f=>({...f,location:e.target.value}))} className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"/>:c.location}</td><td className="px-3 py-2"><div className="flex flex-wrap gap-1"><StatusPill status={c.status}/>{STATUSES.map(st=><button key={st.key} onClick={()=>updateStatus(c,st.key)} className="px-2 py-1 text-xs rounded border border-neutral-700 bg-neutral-800">{st.label}</button>)}</div></td><td className="px-3 py-2"><div className="flex gap-1">{editing?<><button onClick={saveEdit} className="px-2 py-1 text-xs rounded border border-emerald-700">Save</button><button onClick={()=>setEditingKey(null)} className="px-2 py-1 text-xs rounded border border-neutral-700">Cancel</button></>:<><button onClick={()=>startEdit(c)} className="px-2 py-1 text-xs rounded border border-neutral-700">Edit</button><button onClick={()=>deleteCamera(rk)} className="px-2 py-1 text-xs rounded border border-rose-700">Delete</button></>}</div></td></tr>; })}
                {filtered.length===0 && <tr><td colSpan={7} className="px-3 py-4 text-neutral-400">No cameras found</td></tr>}
              </tbody></table></div>
            </SectionCard>
          </>}

          {activeView==="RT Inventory" && <SectionCard title="RT Inventory" right={<button onClick={addRT} className="rounded-lg bg-cyan-600 px-2 py-1 text-xs">Add / Update RT</button>}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3"><select value={rtForm.location} onChange={e=>setRtForm(f=>({...f,location:e.target.value}))} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2">{RT_LOCATIONS.map(l=><option key={l}>{l}</option>)}</select><input value={rtForm.rtNumber} onChange={e=>setRtForm(f=>({...f,rtNumber:e.target.value}))} placeholder="RT Number" className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"/><select value={rtForm.status} onChange={e=>setRtForm(f=>({...f,status:e.target.value}))} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2">{STATUSES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
            <div className="space-y-2 text-sm">{rtInventory.map(r=><div key={r.rtNumber} className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2 flex items-center justify-between"><span>{r.rtNumber} • {r.location}</span><StatusPill status={r.status}/></div>)}</div>
          </SectionCard>}

          <SectionCard title="LIVE Incident Panel" right={<button onClick={replayLastAction} className="rounded-lg border border-cyan-700 bg-cyan-900/30 px-2 py-1 text-xs text-cyan-200">Replay Last Action</button>}>
            <div className="max-h-72 overflow-auto space-y-2 text-xs">{incidentLogs.length===0 && <div className="text-neutral-400">No incidents yet.</div>}{incidentLogs.map(log=><div key={log.id} className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 flex items-center justify-between"><span>{log.message}</span><span className="text-neutral-400">{new Date(log.time).toLocaleTimeString()}</span></div>)}</div>
          </SectionCard>
        </main>
      </div>
    </div>
  );
}
