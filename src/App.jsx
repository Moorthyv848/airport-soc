import React, { useEffect, useMemo, useState } from "react";
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
  writeBatch,
  addDoc,
} from "firebase/firestore";

/*
  SOC PRO MAX — STABLE BUILD (JSX FIXED)
  - Fixed missing </main> / stray JSX after RT Inventory
  - RT Inventory shows RT information only
  - Camera dashboard retained with enterprise selection
*/

const STATUSES = [
  { key: "working", label: "Working", pill: "bg-emerald-500", row: "" },
  { key: "offline", label: "Offline", pill: "bg-slate-500", row: "bg-slate-900/50" },
  { key: "maintenance", label: "Maintenance", pill: "bg-amber-500", row: "bg-amber-950/20" },
  { key: "removed", label: "Removed", pill: "bg-rose-700", row: "bg-rose-950/30" },
];

const NAV_ITEMS = ["Dashboard", "RT Inventory", "Supervisor View", "Shift Reports"];

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
  console.error("Firebase init failed", e);
}

const seedCameras = Array.from({ length: 120 }).map((_, i) => {
  const id = i + 1;
  return {
    id: `CAM-${String(id).padStart(4, "0")}`,
    client: id % 2 === 0 ? "T1" : "T2",
    location: id % 2 === 0 ? `T1 Zone ${((id % 10) + 1)}` : `T2 Zone ${((id % 10) + 1)}`,
    cameraName: id % 2 === 0 ? `T1 Camera ${id}` : `T2 Camera ${id}`,
    status: "working",
    updatedAt: new Date().toISOString(),
    updatedBy: "system",
  };
});

function StatusPill({ status }) {
  const s = STATUSES.find((x) => x.key === status) || STATUSES[0];
  return <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] text-white ${s.pill}`}>{s.label}</span>;
}

function MetricCard({ title, value, tone = "neutral" }) {
  const toneMap = {
    neutral: "border-neutral-800",
    emerald: "border-emerald-800",
    red: "border-red-800",
    amber: "border-amber-800",
    slate: "border-slate-700",
    cyan: "border-cyan-800",
  };
  return (
    <div className={`rounded-2xl border ${toneMap[tone]} bg-neutral-900/85 p-4`}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">{title}</div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
    </div>
  );
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

function AddCameraInline({ onAdd }) {
  const [form, setForm] = useState({ id: "", cameraName: "", client: "T1", location: "", status: "working" });
  const submit = () => {
    const id = form.id.trim();
    if (!id) return;
    onAdd({
      id,
      cameraName: form.cameraName.trim() || id,
      client: form.client,
      location: form.location.trim() || "Unknown",
      status: form.status,
      updatedAt: new Date().toISOString(),
      updatedBy: "manual",
    });
    setForm((f) => ({ ...f, id: "", cameraName: "", location: "" }));
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
      <input value={form.id} onChange={(e)=>setForm(f=>({...f,id:e.target.value}))} placeholder="Camera ID (e.g. CAM-0121)" className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
      <input value={form.cameraName} onChange={(e)=>setForm(f=>({...f,cameraName:e.target.value}))} placeholder="Camera Name" className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
      <select value={form.client} onChange={(e)=>setForm(f=>({...f,client:e.target.value}))} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"><option value="T1">T1</option><option value="T2">T2</option></select>
      <input value={form.location} onChange={(e)=>setForm(f=>({...f,location:e.target.value}))} placeholder="Location" className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
      <select value={form.status} onChange={(e)=>setForm(f=>({...f,status:e.target.value}))} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2">{STATUSES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select>
      <button onClick={submit} className="rounded-xl bg-cyan-600 px-3 py-2">Add Camera</button>
    </div>
  );
}

export default function CCTVDashboardSocProMax() {
  const [activeView, setActiveView] = useState("Dashboard");
  const [isAuthed, setIsAuthed] = useState(false);
  const [userName, setUserName] = useState("");
  const [role, setRole] = useState("operator");
  const [login, setLogin] = useState({ username: "", password: "" });
  const [authError, setAuthError] = useState("");

  const [cameras, setCameras] = useState(seedCameras);
  const [selected, setSelected] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState("working");
  const [q, setQ] = useState("");
  const [client, setClient] = useState("ALL");
  const [status, setStatus] = useState("ALL");

  const [rtInventory, setRtInventory] = useState([
    { rtNumber: "RT-001", location: "T1", status: "working", updatedAt: new Date().toISOString() },
    { rtNumber: "RT-002", location: "T2", status: "working", updatedAt: new Date().toISOString() },
  ]);
  const [rtForm, setRtForm] = useState({ location: "T1", rtNumber: "", status: "working" });

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, "cameras"), (snap) => {
      const rows = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        rows.push({ docId: d.id, id: data.id || d.id, ...data });
      });
      if (rows.length) setCameras(rows);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => cameras.filter((c) => {
    const qq = q.toLowerCase();
    return (!q || (c.id || "").toLowerCase().includes(qq) || (c.cameraName || "").toLowerCase().includes(qq) || (c.location || "").toLowerCase().includes(qq)) &&
      (client === "ALL" || c.client === client) &&
      (status === "ALL" || c.status === status);
  }), [cameras, q, client, status]);

  const counts = useMemo(() => {
    const base = { total: cameras.length, working: 0, offline: 0, maintenance: 0, removed: 0 };
    cameras.forEach((c) => { if (base[c.status] !== undefined) base[c.status] += 1; });
    return base;
  }, [cameras]);

  const canBulk = role !== "operator";
  const getRowKey = (c) => c.docId || c.id;

  const toggleSelected = (rowKey) => setSelected(prev => {
    const n = new Set(prev);
    n.has(rowKey) ? n.delete(rowKey) : n.add(rowKey);
    return n;
  });

  const selectVisible = () => setSelected(prev => {
    const n = new Set(prev);
    filtered.forEach((c) => n.add(getRowKey(c)));
    return n;
  });

  const clearSelection = () => setSelected(new Set());
  const selectByStatus = (k) => setSelected(prev => {
    const n = new Set(prev);
    cameras.filter(c => c.status === k).forEach(c => n.add(getRowKey(c)));
    return n;
  });
  const selectByClient = (k) => setSelected(prev => {
    const n = new Set(prev);
    cameras.filter(c => c.client === k).forEach(c => n.add(getRowKey(c)));
    return n;
  });

  const updateStatus = async (camera, newStatus) => {
    const oldStatus = camera.status;
    setCameras(prev => prev.map(c => c.id === camera.id ? { ...c, status: newStatus, updatedAt: new Date().toISOString(), updatedBy: userName || "operator" } : c));
    if (!db || !camera.docId) return;
    try {
      await updateDoc(doc(db, "cameras", camera.docId), { status: newStatus, updatedAt: serverTimestamp(), updatedBy: userName || "operator" });
      await addDoc(collection(db, "audit_logs"), { cameraId: camera.id, oldStatus, newStatus, updatedBy: userName || "operator", timestamp: serverTimestamp() });
    } catch {}
  };

  const applyBulkUpdate = async () => {
    if (!db || !selected.size) return;
    const batch = writeBatch(db);
    cameras.forEach((c) => {
      if (selected.has(getRowKey(c)) && c.docId) {
        batch.update(doc(db, "cameras", c.docId), { status: bulkStatus, updatedAt: serverTimestamp(), updatedBy: userName || "operator" });
      }
    });
    await batch.commit().catch(() => {});
    setSelected(new Set());
  };

  const exportCsv = () => {
    const header = ["CameraID","Client","CameraName","Status","Location","UpdatedAt","UpdatedBy"];
    const rows = filtered.map(c => [c.id, c.client, c.cameraName || "", c.status, c.location || "", c.updatedAt, c.updatedBy || ""]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cctv_report_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvUpload = async (e, forcedClient) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return;
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const idx = (n) => headers.indexOf(n);
    const idIdx = idx("cameraid") >= 0 ? idx("cameraid") : idx("id");
    if (idIdx < 0) return;
    const nameIdx = idx("cameraname");
    const locationIdx = idx("location");
    const statusIdx = idx("status");
    const parsed = lines.slice(1).map(line => {
      const cols = line.split(",");
      const id = (cols[idIdx] || "").trim();
      if (!id) return null;
      return {
        id,
        cameraName: nameIdx >= 0 ? (cols[nameIdx] || "").trim() : id,
        client: forcedClient || "T1",
        location: locationIdx >= 0 ? (cols[locationIdx] || "").trim() : "Unknown",
        status: statusIdx >= 0 ? (cols[statusIdx] || "working").trim().toLowerCase() : "working",
        updatedAt: new Date().toISOString(),
        updatedBy: "csv",
      };
    }).filter(Boolean);
    setCameras(prev => {
      const map = new Map(prev.map(c => [c.id, c]));
      parsed.forEach(c => map.set(c.id, { ...(map.get(c.id) || {}), ...c }));
      return Array.from(map.values());
    });
    e.target.value = "";
  };

  const RT_LOCATIONS = ["T1", "T2", "Landside", "Control Room"];
  const RT_STATUS = ["working", "offline", "maintenance", "removed"];

  const addRTInventoryItem = () => {
    const rtNumber = String(rtForm.rtNumber || "").trim();
    if (!rtNumber) return;
    setRtInventory(prev => {
      const exists = prev.find(r => r.rtNumber.toLowerCase() === rtNumber.toLowerCase());
      if (exists) {
        return prev.map(r => r.rtNumber.toLowerCase() === rtNumber.toLowerCase()
          ? { ...r, location: rtForm.location, status: rtForm.status, updatedAt: new Date().toISOString() }
          : r);
      }
      return [{ rtNumber, location: rtForm.location, status: rtForm.status, updatedAt: new Date().toISOString() }, ...prev];
    });
    setRtForm(f => ({ ...f, rtNumber: "" }));
  };

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-[#05070b] text-neutral-100 grid place-items-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6">
          <h1 className="text-xl font-bold text-white">Airport SOC Login</h1>
          <div className="mt-4 space-y-3">
            <input value={login.username} onChange={(e)=>setLogin({...login, username:e.target.value})} placeholder="Email" className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
            <input type="password" value={login.password} onChange={(e)=>setLogin({...login, password:e.target.value})} placeholder="Password" className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
            <button onClick={async ()=>{
              setAuthError("");
              if(!auth) return setAuthError("Firebase not connected");
              try {
                const cred = await signInWithEmailAndPassword(auth, login.username.trim(), login.password);
                setUserName(cred.user.email || login.username);
                let resolved = "operator";
                if(db){
                  const snap = await getDoc(doc(db, "users", cred.user.email || login.username));
                  if(snap.exists()) resolved = snap.data()?.role || "operator";
                }
                setRole(resolved);
                setIsAuthed(true);
              } catch {
                setAuthError("Invalid login credentials");
              }
            }} className="w-full rounded-xl bg-cyan-600 px-3 py-2 font-semibold hover:bg-cyan-500">Login to Control Room</button>
            {authError && <div className="text-xs text-red-400">{authError}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05070b] text-neutral-100">
      <div className="mx-auto grid min-h-screen max-w-[1800px] grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="border-r border-neutral-800 bg-[#060b12] p-5">
          <div className="text-sm font-semibold tracking-[0.22em] text-cyan-300">AIRPORT SOC</div>
          <nav className="mt-6 space-y-2 text-sm">
            {NAV_ITEMS.map(i => <button key={i} onClick={()=>setActiveView(i)} className="w-full rounded-xl border border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 px-3 py-2 text-left">{i}</button>)}
          </nav>
          <div className="mt-6 text-xs text-neutral-500 whitespace-pre-line">{`User: ${userName}\nRole: ${role}`}</div>
          <button onClick={async ()=>{ try{ if(auth) await signOut(auth);}catch{} setIsAuthed(false); }} className="mt-4 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs hover:bg-neutral-800">Logout</button>
        </aside>

        <main className="p-4 md:p-6 lg:p-8 space-y-4">
          <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <MetricCard title="Total" value={counts.total} />
            <MetricCard title="Working" value={counts.working} tone="emerald" />
            <MetricCard title="Offline" value={counts.offline} tone="slate" />
            <MetricCard title="Maintenance" value={counts.maintenance} tone="amber" />
            <MetricCard title="Removed" value={counts.removed} tone="red" />
            <MetricCard title="Selected" value={selected.size} tone="cyan" />
            <MetricCard title="Health" value={(counts.offline + counts.removed) > 0 ? "ATTN" : "OK"} tone={(counts.offline + counts.removed) > 0 ? "red" : "emerald"} />
          </section>

          {activeView === "Dashboard" && (
            <>
              <SectionCard title="Filters & Actions" right={<span className="text-xs text-neutral-400">{filtered.length} cameras</span>}>
                <div className="grid grid-cols-1 md:grid-cols-8 gap-3">
                  <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search camera ID / name / location" className="md:col-span-2 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
                  <select value={client} onChange={(e)=>setClient(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"><option value="ALL">All Clients</option><option value="T1">T1</option><option value="T2">T2</option></select>
                  <select value={status} onChange={(e)=>setStatus(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"><option value="ALL">All Status</option>{STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
                  <button onClick={exportCsv} className="rounded-xl bg-cyan-600 px-3 py-2">Export CSV</button>
                  <label className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-center cursor-pointer hover:bg-neutral-700">Upload CSV T1<input type="file" accept=".csv" className="hidden" onChange={(e)=>handleCsvUpload(e,"T1")} /></label>
                  <label className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-center cursor-pointer hover:bg-neutral-700">Upload CSV T2<input type="file" accept=".csv" className="hidden" onChange={(e)=>handleCsvUpload(e,"T2")} /></label>
                  {canBulk && <button onClick={applyBulkUpdate} className="rounded-xl bg-emerald-600 px-3 py-2">Bulk Apply</button>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <button onClick={selectVisible} className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 hover:bg-neutral-700">Select Visible</button>
                  <button onClick={clearSelection} className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 hover:bg-neutral-700">Clear Selection</button>
                  <button onClick={() => selectByStatus("offline")} className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-1.5">Select Offline</button>
                  <button onClick={() => selectByStatus("maintenance")} className="rounded-lg border border-amber-700 bg-amber-900/30 px-3 py-1.5">Select Maintenance</button>
                  <button onClick={() => selectByStatus("removed")} className="rounded-lg border border-rose-700 bg-rose-900/30 px-3 py-1.5">Select Removed</button>
                  <button onClick={() => selectByClient("T1")} className="rounded-lg border border-cyan-700 bg-cyan-900/20 px-3 py-1.5">Select T1</button>
                  <button onClick={() => selectByClient("T2")} className="rounded-lg border border-cyan-700 bg-cyan-900/20 px-3 py-1.5">Select T2</button>
                  <span className="text-neutral-400 self-center">Selected: {selected.size}</span>
                </div>
              </SectionCard>

              <SectionCard title="Add Camera" right={<span className="text-xs text-neutral-400">Manual entry</span>}>
                <AddCameraInline onAdd={(cam)=>setCameras(p=>[cam, ...p])} />
              </SectionCard>

              <SectionCard title="Live Camera Grid" right={<span className="text-xs text-neutral-400">Realtime</span>}>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-800 text-neutral-300">
                      <tr>
                        <th className="px-3 py-2 text-left">Select</th>
                        <th className="px-3 py-2 text-left">Camera ID</th>
                        <th className="px-3 py-2 text-left">Camera Name</th>
                        <th className="px-3 py-2 text-left">Client</th>
                        <th className="px-3 py-2 text-left">Location</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Quick Update</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(c => {
                        const s = STATUSES.find(x=>x.key===c.status) || STATUSES[0];
                        return (
                          <tr key={getRowKey(c)} className={`border-t border-neutral-800 ${s.row||""}`}>
                            <td className="px-3 py-2"><input type="checkbox" checked={selected.has(getRowKey(c))} onChange={()=>toggleSelected(getRowKey(c))} /></td>
                            <td className="px-3 py-2 text-cyan-200 font-semibold">{c.id}</td>
                            <td className="px-3 py-2">{c.cameraName||"-"}</td>
                            <td className="px-3 py-2">{c.client}</td>
                            <td className="px-3 py-2">{c.location||"-"}</td>
                            <td className="px-3 py-2"><StatusPill status={c.status} /></td>
                            <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{STATUSES.map(st=><button key={st.key} onClick={()=>updateStatus(c, st.key)} className="px-2 py-1 rounded border border-neutral-700 bg-neutral-800 text-xs">{st.label}</button>)}</div></td>
                          </tr>
                        );
                      })}
                      {filtered.length===0 && <tr><td colSpan={7} className="px-3 py-4 text-neutral-400">No cameras found</td></tr>}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </>
          )}

          {activeView === "RT Inventory" && (
            <SectionCard title="RT Inventory" right={<span className="text-xs text-neutral-400">RT information only</span>}>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <select value={rtForm.location} onChange={(e)=>setRtForm(f=>({...f, location:e.target.value}))} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2">
                  {RT_LOCATIONS.map((l)=><option key={l} value={l}>{l}</option>)}
                </select>
                <input value={rtForm.rtNumber} onChange={(e)=>setRtForm(f=>({...f, rtNumber:e.target.value}))} placeholder="RT Number (e.g. RT-010)" className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
                <select value={rtForm.status} onChange={(e)=>setRtForm(f=>({...f, status:e.target.value}))} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2">
                  {RT_STATUS.map((s)=><option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={addRTInventoryItem} className="rounded-xl bg-cyan-600 px-3 py-2">Add / Update RT</button>
              </div>
              <div className="mt-4 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-800 text-neutral-300">
                    <tr>
                      <th className="px-3 py-2 text-left">RT Number</th>
                      <th className="px-3 py-2 text-left">Location</th>
                      <th className="px-3 py-2 text-left">Working Status</th>
                      <th className="px-3 py-2 text-left">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rtInventory.map((r) => {
                      const st = STATUSES.find((x) => x.key === r.status) || STATUSES[0];
                      return (
                        <tr key={r.rtNumber} className={`border-t border-neutral-800 ${st.row || ""}`}>
                          <td className="px-3 py-2 text-cyan-200 font-semibold">{r.rtNumber}</td>
                          <td className="px-3 py-2">{r.location}</td>
                          <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                          <td className="px-3 py-2 text-neutral-400">{new Date(r.updatedAt).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                    {rtInventory.length===0 && <tr><td colSpan={4} className="px-3 py-4 text-neutral-400">No RT records yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </main>
      </div>
    </div>
  );
}
