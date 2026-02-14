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
  SOC PRO MAX — FIXED BUILD
  Main fixes:
  - Unterminated string constant in exportCsv ("\n" join)
  - Broken duplicated JSX tail removed
  - Clean RT Inventory ELITE section retained
*/

const STATUSES = [
  { key: "working", label: "Working", pill: "bg-emerald-500", row: "" },
  { key: "faulty", label: "Faulty", pill: "bg-red-500", row: "bg-red-950/25" },
  { key: "maintenance", label: "Maintenance", pill: "bg-amber-500", row: "bg-amber-950/20" },
  { key: "offline", label: "Offline", pill: "bg-slate-500", row: "bg-slate-900/50" },
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
    { id: "T1-RT-001", location: "T1", deviceType: "Workstation", quantity: 10, minThreshold: 5, updatedAt: new Date().toISOString() },
  ]);
  const [rtForm, setRtForm] = useState({ location: "T1", deviceType: "Workstation", quantity: 1, minThreshold: 3 });
  const [rtTransfer, setRtTransfer] = useState({ id: "", toLocation: "T2", qty: 1 });
  const [rtHistory, setRtHistory] = useState([]);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, "cameras"), (snap) => {
      const rows = [];
      snap.forEach((d) => rows.push({ docId: d.id, ...d.data() }));
      if (rows.length) setCameras(rows);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => cameras.filter((c) => {
    const qq = q.toLowerCase();
    return (!q || (c.id || "").toLowerCase().includes(qq) || (c.cameraName || "").toLowerCase().includes(qq)) &&
      (client === "ALL" || c.client === client) &&
      (status === "ALL" || c.status === status);
  }), [cameras, q, client, status]);

  const counts = useMemo(() => {
    const base = { total: cameras.length, working: 0, faulty: 0, maintenance: 0, offline: 0 };
    cameras.forEach((c) => { if (base[c.status] !== undefined) base[c.status] += 1; });
    return base;
  }, [cameras]);

  const canBulk = role !== "operator";

  const logAction = async (cameraId, oldStatus, newStatus) => {
    if (!db) return;
    try {
      await addDoc(collection(db, "audit_logs"), { cameraId, oldStatus, newStatus, updatedBy: userName || "operator", timestamp: serverTimestamp() });
    } catch {}
  };

  const updateStatus = async (camera, newStatus) => {
    const oldStatus = camera.status;
    setCameras((prev) => prev.map((c) => c.id === camera.id ? { ...c, status: newStatus, updatedAt: new Date().toISOString(), updatedBy: userName || "operator" } : c));
    if (!db || !camera.docId) return;
    try {
      await updateDoc(doc(db, "cameras", camera.docId), { status: newStatus, updatedAt: serverTimestamp(), updatedBy: userName || "operator" });
      logAction(camera.id, oldStatus, newStatus);
    } catch {}
  };

  const applyBulkUpdate = async () => {
    if (!db || !selected.size) return;
    const batch = writeBatch(db);
    cameras.forEach((c) => {
      if (selected.has(c.id) && c.docId) {
        batch.update(doc(db, "cameras", c.docId), { status: bulkStatus, updatedAt: serverTimestamp(), updatedBy: userName || "operator" });
      }
    });
    await batch.commit().catch(() => {});
    setSelected(new Set());
  };

  const exportCsv = () => {
    const header = ["CameraID", "Client", "CameraName", "Status", "UpdatedAt", "UpdatedBy"];
    const rows = filtered.map((c) => [c.id, c.client, c.cameraName || "", c.status, c.updatedAt, c.updatedBy || ""]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cctv_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addRTInventoryItem = () => {
    const qty = Number(rtForm.quantity);
    if (!rtForm.deviceType || qty <= 0) return;
    const loc = rtForm.location;
    const id = `${loc}-RT-${String(rtInventory.filter((r) => r.location === loc).length + 1).padStart(3, "0")}`;
    const item = { id, location: loc, deviceType: rtForm.deviceType, quantity: qty, minThreshold: Number(rtForm.minThreshold) || 0, updatedAt: new Date().toISOString() };
    setRtInventory((p) => [item, ...p]);
    setRtHistory((h) => [{ time: new Date().toISOString(), action: "ADD", detail: `${id} ${item.deviceType} qty ${qty}` }, ...h].slice(0, 200));
  };

  const updateRTQty = (id, delta) => setRtInventory((p) => p.map((r) => r.id === id ? { ...r, quantity: Math.max(0, r.quantity + delta), updatedAt: new Date().toISOString() } : r));
  const removeRTItem = (id) => setRtInventory((p) => p.filter((r) => r.id !== id));

  const transferRTInventory = () => {
    const qty = Number(rtTransfer.qty);
    if (!rtTransfer.id || qty <= 0) return;
    setRtInventory((prev) => {
      const src = prev.find((r) => r.id === rtTransfer.id);
      if (!src || src.quantity < qty) return prev;
      const toLoc = rtTransfer.toLocation;
      let next = prev.map((r) => r.id === src.id ? { ...r, quantity: r.quantity - qty } : r);
      const existing = next.find((r) => r.location === toLoc && r.deviceType === src.deviceType);
      if (existing) {
        next = next.map((r) => r.id === existing.id ? { ...r, quantity: r.quantity + qty } : r);
      } else {
        next.unshift({ id: `${toLoc}-RT-${String(next.filter((r) => r.location === toLoc).length + 1).padStart(3, "0")}`, location: toLoc, deviceType: src.deviceType, quantity: qty, minThreshold: src.minThreshold || 0, updatedAt: new Date().toISOString() });
      }
      setRtHistory((h) => [{ time: new Date().toISOString(), action: "TRANSFER", detail: `${src.id} -> ${toLoc} qty ${qty}` }, ...h].slice(0, 200));
      return next;
    });
  };

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-[#05070b] text-neutral-100 grid place-items-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6">
          <h1 className="text-xl font-bold text-white">Airport SOC Login</h1>
          <div className="mt-4 space-y-3">
            <input value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} placeholder="Email" className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
            <input type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} placeholder="Password" className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
            <button onClick={async () => {
              setAuthError("");
              if (!auth) return setAuthError("Firebase not connected");
              try {
                const cred = await signInWithEmailAndPassword(auth, login.username.trim(), login.password);
                setUserName(cred.user.email || login.username);
                let resolved = "operator";
                if (db) {
                  const snap = await getDoc(doc(db, "users", cred.user.email || login.username));
                  if (snap.exists()) resolved = snap.data()?.role || "operator";
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
            {NAV_ITEMS.map((i) => <button key={i} onClick={() => setActiveView(i)} className="w-full rounded-xl border border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 px-3 py-2 text-left">{i}</button>)}
          </nav>
          <div className="mt-6 text-xs text-neutral-500 whitespace-pre-line">{`User: ${userName}\nRole: ${role}`}</div>
          <button onClick={async () => { try { if (auth) await signOut(auth); } catch {} setIsAuthed(false); }} className="mt-4 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs hover:bg-neutral-800">Logout</button>
        </aside>

        <main className="p-4 md:p-6 lg:p-8 space-y-4">
          <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <MetricCard title="Total" value={counts.total} />
            <MetricCard title="Working" value={counts.working} tone="emerald" />
            <MetricCard title="Faulty" value={counts.faulty} tone="red" />
            <MetricCard title="Maintenance" value={counts.maintenance} tone="amber" />
            <MetricCard title="Offline" value={counts.offline} tone="slate" />
            <MetricCard title="Selected" value={selected.size} tone="cyan" />
            <MetricCard title="Health" value={(counts.faulty + counts.offline) > 0 ? "ATTN" : "OK"} tone={(counts.faulty + counts.offline) > 0 ? "red" : "emerald"} />
          </section>

          {activeView === "Dashboard" && (
            <SectionCard title="Filters & Actions" right={<span className="text-xs text-neutral-400">{filtered.length} cameras</span>}>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="md:col-span-2 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
                <select value={client} onChange={(e) => setClient(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"><option value="ALL">All Clients</option><option value="T1">T1</option><option value="T2">T2</option></select>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"><option value="ALL">All Status</option>{STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
                <button onClick={exportCsv} className="rounded-xl bg-cyan-600 px-3 py-2">Export CSV</button>
                {canBulk && <button onClick={applyBulkUpdate} className="rounded-xl bg-emerald-600 px-3 py-2">Bulk Apply</button>}
              </div>
            </SectionCard>
          )}

          {activeView === "RT Inventory" && (
            <SectionCard title="RT Inventory — ELITE" right={<span className="text-xs text-neutral-400">Analytics • History • Transfers</span>}>
              <div className="grid md:grid-cols-6 gap-3">
                <select value={rtForm.location} onChange={(e)=>setRtForm(f=>({...f, location:e.target.value}))} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"><option value="T1">T1</option><option value="T2">T2</option><option value="Other">Other</option></select>
                <input value={rtForm.deviceType} onChange={(e)=>setRtForm(f=>({...f, deviceType:e.target.value}))} className="md:col-span-2 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" placeholder="Device type" />
                <input type="number" min={1} value={rtForm.quantity} onChange={(e)=>setRtForm(f=>({...f, quantity:e.target.value}))} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
                <input type="number" min={0} value={rtForm.minThreshold} onChange={(e)=>setRtForm(f=>({...f, minThreshold:e.target.value}))} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
                <button onClick={addRTInventoryItem} className="rounded-xl bg-cyan-600 px-3 py-2">Add RT</button>
              </div>

              <div className="mt-4 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-800 text-neutral-300"><tr><th className="px-3 py-2 text-left">RT No</th><th className="px-3 py-2 text-left">Location</th><th className="px-3 py-2 text-left">Device</th><th className="px-3 py-2 text-left">Qty</th><th className="px-3 py-2 text-left">Min</th><th className="px-3 py-2 text-left">Actions</th></tr></thead>
                  <tbody>
                    {rtInventory.map((r) => (
                      <tr key={r.id} className="border-t border-neutral-800">
                        <td className="px-3 py-2 text-cyan-200 font-semibold">{r.id}</td>
                        <td className="px-3 py-2">{r.location}</td>
                        <td className="px-3 py-2">{r.deviceType}</td>
                        <td className="px-3 py-2">{r.quantity}</td>
                        <td className="px-3 py-2">{r.minThreshold}</td>
                        <td className="px-3 py-2"><div className="flex gap-2"><button onClick={()=>updateRTQty(r.id,1)} className="px-2 py-1 border border-neutral-700 rounded">+1</button><button onClick={()=>updateRTQty(r.id,-1)} className="px-2 py-1 border border-neutral-700 rounded">-1</button><button onClick={()=>removeRTItem(r.id)} className="px-2 py-1 border border-red-700 rounded text-red-300">Remove</button></div></td>
                      </tr>
                    ))}
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
