import React, { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, doc, onSnapshot, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";

/* =====================================================
   ENTERPRISE AIRPORT SOC — CONTROL ROOM PRO (STABLE)
===================================================== */

const STATUSES = [
  { key: "working", label: "Working", pill: "bg-emerald-500", row: "" },
  { key: "faulty", label: "Faulty", pill: "bg-red-500", row: "bg-red-950/25" },
  { key: "maintenance", label: "Maintenance", pill: "bg-amber-500", row: "bg-amber-950/20" },
  { key: "offline", label: "Offline", pill: "bg-slate-500", row: "bg-slate-900/50" },
];

const NAV_ITEMS = ["Dashboard", "Live Monitoring", "Supervisor View", "Shift Reports", "System Logs"];

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
} catch {
  app = null;
  auth = null;
  db = null;
}

const seedCameras = Array.from({ length: 120 }).map((_, i) => {
  const id = i + 1;
  return {
    id: `CAM-${String(id).padStart(4, "0")}`,
    client: id % 2 === 0 ? "T1" : "T2",
    location: id % 2 === 0 ? `T1 Zone ${((id % 10) + 1)}` : `T2 Zone ${((id % 10) + 1)}`,
    cameraName: id % 2 === 0 ? `T1 Camera ${id}` : `T2 Camera ${id}`,
    status: id % 9 === 0 ? "faulty" : id % 13 === 0 ? "maintenance" : id % 17 === 0 ? "offline" : "working",
    updatedAt: new Date().toISOString(),
    updatedBy: "system",
    remarks: "",
  };
});

function StatusPill({ status }) {
  const s = STATUSES.find((x) => x.key === status) || STATUSES[0];
  const dot = status === "working" ? "bg-emerald-200" : status === "maintenance" ? "bg-amber-200" : "bg-red-200";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide text-white ${s.pill}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot} animate-pulse`} />
      {s.label}
    </span>
  );
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
    <div className={`rounded-2xl border ${toneMap[tone]} bg-neutral-900/85 p-4 shadow-xl shadow-black/30`}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">{title}</div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function SectionCard({ title, right, children }) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 shadow-xl shadow-black/30">
      <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-neutral-800">
        <h2 className="text-sm md:text-base font-semibold text-white">{title}</h2>
        {right}
      </div>
      <div className="p-3 md:p-4">{children}</div>
    </section>
  );
}

export default function CCTVDashboardStarter() {
  const [activeView, setActiveView] = useState("Dashboard");
  const [wallMode, setWallMode] = useState(false);
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
  const [tick, setTick] = useState(0);

  const resolveRoleFromEmail = (email) => {
    const e = String(email || "").toLowerCase();
    if (e.includes("admin")) return "admin";
    if (e.includes("supervisor") || e.includes("sup")) return "supervisor";
    return "operator";
  };

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 3000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, "cameras"), (snap) => {
      const rows = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      if (rows.length) setCameras(rows);
    });
    return () => unsub();
  }, []);

  const criticalCount = useMemo(() => cameras.filter((c) => c.status === "faulty" || c.status === "offline").length, [cameras]);

  const filtered = useMemo(() => {
    return cameras.filter((c) => {
      const qq = q.toLowerCase();
      const matchQ = !q.trim() || c.id.toLowerCase().includes(qq) || (c.location || "").toLowerCase().includes(qq) || (c.cameraName || "").toLowerCase().includes(qq);
      const matchClient = client === "ALL" || c.client === client;
      const matchStatus = status === "ALL" || c.status === status;
      return matchQ && matchClient && matchStatus;
    });
  }, [cameras, q, client, status]);

  const counts = useMemo(() => {
    const base = { total: cameras.length, working: 0, faulty: 0, maintenance: 0, offline: 0 };
    cameras.forEach((c) => {
      if (base[c.status] !== undefined) base[c.status] += 1;
    });
    return base;
  }, [cameras]);

  const updateStatus = async (id, newStatus) => {
    const updater = userName || "operator";
    setCameras((prev) => prev.map((c) => (c.id === id ? { ...c, status: newStatus, updatedAt: new Date().toISOString(), updatedBy: updater } : c)));
    if (!db) return;
    try {
      await updateDoc(doc(db, "cameras", id), { status: newStatus, updatedAt: serverTimestamp(), updatedBy: updater });
    } catch {}
  };

  const toggleSelected = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const applyBulkUpdate = () => {
    if (!selected.size) return;
    const updater = userName || "operator";
    const nowIso = new Date().toISOString();
    setCameras((prev) => prev.map((c) => (selected.has(c.id) ? { ...c, status: bulkStatus, updatedAt: nowIso, updatedBy: updater } : c)));
    if (db) {
      const ops = [];
      selected.forEach((id) => {
        ops.push(updateDoc(doc(db, "cameras", id), { status: bulkStatus, updatedAt: serverTimestamp(), updatedBy: updater }).catch(() => {}));
      });
      Promise.all(ops).catch(() => {});
    }
    setSelected(new Set());
  };

  const exportCsv = () => {
    const header = ["CameraID", "Client", "CameraName", "Status", "UpdatedAt", "UpdatedBy", "Remarks"];
    const rows = filtered.map((c) => [c.id, c.client, c.cameraName || "", c.status, c.updatedAt, c.updatedBy, c.remarks || ""]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cctv_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvUpload = async (e, forcedClient = null) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return;

    const headers = lines[0].split(",").map((h) => h.trim());
    const idx = (name) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    const idIdx = idx("id") >= 0 ? idx("id") : idx("cameraid");
    if (idIdx < 0) {
      alert("CSV must contain id or CameraID column");
      return;
    }
    const clientIdx = idx("client");
    const cameraNameIdx = idx("cameraname");

    const updater = userName || "operator";
    const nowIso = new Date().toISOString();

    const parsed = lines.slice(1).map((line) => {
      const cols = line.split(",");
      const id = (cols[idIdx] || "").trim();
      if (!id) return null;
      const csvClient = clientIdx >= 0 ? (cols[clientIdx] || "").trim() : "";
      return {
        id,
        client: forcedClient || csvClient || "",
        cameraName: cameraNameIdx >= 0 ? (cols[cameraNameIdx] || "").trim() : "",
      };
    }).filter(Boolean);

    if (!parsed.length) return;

    setCameras((prev) => {
      const map = new Map(prev.map((c) => [c.id, c]));
      parsed.forEach((r) => {
        const existing = map.get(r.id);
        if (existing) {
          map.set(r.id, { ...existing, client: r.client || existing.client, cameraName: r.cameraName || existing.cameraName, updatedAt: nowIso, updatedBy: updater });
        } else {
          map.set(r.id, { id: r.id, client: r.client || "T1", cameraName: r.cameraName || "New Camera", location: "Unknown", status: "working", updatedAt: nowIso, updatedBy: updater, remarks: "" });
        }
      });
      return Array.from(map.values());
    });

    if (db) {
      const writes = parsed.map((r) => setDoc(doc(db, "cameras", r.id), { client: r.client || "T1", cameraName: r.cameraName || "", updatedAt: serverTimestamp(), updatedBy: updater }, { merge: true }).catch(() => {}));
      await Promise.all(writes);
      alert(`CSV synced to Firebase: ${parsed.length} cameras`);
    }

    e.target.value = "";
  };

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-[#05070b] text-neutral-100 grid place-items-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6">
          <h1 className="text-xl font-bold text-white">Airport SOC Login</h1>
          <p className="mt-1 text-sm text-neutral-400">Enterprise access • {auth ? "Firebase" : "Demo mode"}</p>
          <div className="mt-4 space-y-3">
            <input value={login.username} onChange={(e)=>setLogin({...login, username:e.target.value})} placeholder="Email" className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
            <input type="password" value={login.password} onChange={(e)=>setLogin({...login, password:e.target.value})} placeholder="Password" className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2" />
            <button
              onClick={async ()=>{
                setAuthError("");
                if (!login.username.trim() || !login.password.trim()) return setAuthError("Enter email and password");
                if (!auth) return setAuthError("Firebase not connected");
                try {
                  await signInWithEmailAndPassword(auth, login.username.trim(), login.password);
                  setUserName(login.username.trim());
                  setRole(resolveRoleFromEmail(login.username.trim()));
                  setIsAuthed(true);
                } catch {
                  setAuthError("Invalid login credentials");
                }
              }}
              className="w-full rounded-xl bg-cyan-600 px-3 py-2 font-semibold hover:bg-cyan-500"
            >Login to Control Room</button>
            {authError && <div className="text-xs text-red-400">{authError}</div>}
          </div>
        </div>
      </div>
    );
  }

  const canBulk = role !== "operator";

  return (
    <div className="min-h-screen bg-[#05070b] text-neutral-100">
      <div className="mx-auto grid min-h-screen max-w-[1800px] grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="border-r border-neutral-800 bg-[#060b12] p-5">
          <div className="text-sm font-semibold tracking-[0.22em] text-cyan-300">AIRPORT SOC</div>
          <nav className="mt-6 space-y-2 text-sm">
            {NAV_ITEMS.map((i) => (
              <button key={i} onClick={()=>setActiveView(i)} className={`w-full rounded-xl border px-3 py-2 text-left ${activeView===i?"border-cyan-700 bg-neutral-800":"border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800"}`}>{i}</button>
            ))}
          </nav>
          <div className="mt-6 text-xs text-neutral-500 whitespace-pre-line">{`User: ${userName}\nRole: ${role}\nMode: LIVE`}</div>
          <button onClick={()=>setIsAuthed(false)} className="mt-4 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs hover:bg-neutral-800">Logout</button>
        </aside>
        <main className={`p-4 md:p-6 lg:p-8 space-y-4 ${wallMode ? "text-lg" : ""}`}>
          {criticalCount > 0 && <div className="rounded-xl border border-red-800 bg-red-900/30 px-4 py-3 animate-pulse">🚨 CRITICAL ALERT: {criticalCount} Cameras Need Immediate Attention</div>}

          <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <MetricCard title="Total" value={counts.total} />
            <MetricCard title="Working" value={counts.working} tone="emerald" />
            <MetricCard title="Faulty" value={counts.faulty} tone="red" />
            <MetricCard title="Maintenance" value={counts.maintenance} tone="amber" />
            <MetricCard title="Offline" value={counts.offline} tone="slate" />
            <MetricCard title="Selected" value={selected.size} tone="cyan" />
            <MetricCard title="Health" value={criticalCount>0?"ATTN":"OK"} tone={criticalCount>0?"red":"emerald"} />
          </section>

          {activeView === "Dashboard" && (
            <>
              <SectionCard title="Filters & Actions" right={<span className="text-xs text-neutral-400">{filtered.length} cameras</span>}>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                  <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search camera ID, name or location" className="md:col-span-2 w-full rounded-xl border border-neutral-700 bg-neutral-800/90 px-3 py-2" />
                  <select value={client} onChange={(e)=>setClient(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"><option value="ALL">All Clients</option><option value="T1">T1</option><option value="T2">T2</option></select>
                  <select value={status} onChange={(e)=>setStatus(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"><option value="ALL">All Status</option>{STATUSES.map((s)=><option key={s.key} value={s.key}>{s.label}</option>)}</select>
                  <button onClick={exportCsv} className="rounded-xl bg-cyan-600 px-3 py-2 font-medium hover:bg-cyan-500">Export CSV</button>
                  <label className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs cursor-pointer hover:bg-neutral-700">Upload CSV (T1)<input type="file" accept=".csv" onChange={(e)=>handleCsvUpload(e, "T1")} className="hidden" /></label>
                  <label className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs cursor-pointer hover:bg-neutral-700">Upload CSV (T2)<input type="file" accept=".csv" onChange={(e)=>handleCsvUpload(e, "T2")} className="hidden" /></label>
                  {canBulk ? <div className="flex gap-2"><select value={bulkStatus} onChange={(e)=>setBulkStatus(e.target.value)} className="flex-1 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2">{STATUSES.map((s)=><option key={s.key} value={s.key}>{s.label}</option>)}</select><button onClick={applyBulkUpdate} className="rounded-xl bg-emerald-600 px-3 py-2 font-medium hover:bg-emerald-500">Bulk</button></div> : <div className="flex items-center text-xs text-neutral-500">Bulk disabled for operator</div>}
                </div>
              </SectionCard>

              <SectionCard title="Live Camera Grid" right={<span className="text-xs text-neutral-400">PRO Mode Enabled</span>}>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-800 text-neutral-300">
                      <tr>
                        <th className="px-3 py-2 text-left">Sel</th>
                        <th className="px-3 py-2 text-left">Camera ID</th>
                        <th className="px-3 py-2 text-left">Camera Name</th>
                        <th className="px-3 py-2 text-left">Client</th>
                        <th className="px-3 py-2 text-left">Location</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Quick Update</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c)=>{
                        const s = STATUSES.find((x)=>x.key===c.status);
                        const isCritical = c.status === "faulty" || c.status === "offline";
                        return (
                          <tr key={c.id} className={`border-t border-neutral-800 ${s?.row || ""} ${isCritical ? "animate-pulse border-red-700" : ""}`}>
                            <td className="px-3 py-2"><input type="checkbox" checked={selected.has(c.id)} onChange={()=>toggleSelected(c.id)} /></td>
                            <td className="px-3 py-2 font-semibold text-cyan-200">{c.id}</td>
                            <td className="px-3 py-2">{c.cameraName || "-"}</td>
                            <td className="px-3 py-2">{c.client}</td>
                            <td className="px-3 py-2">{c.location}</td>
                            <td className="px-3 py-2"><StatusPill status={c.status} /></td>
                            <td className="px-3 py-2"><div className="flex flex-wrap gap-2">{STATUSES.map((st)=><button key={st.key} onClick={()=>updateStatus(c.id, st.key)} className={`rounded-lg border border-neutral-700 px-2 py-1 text-xs ${c.status===st.key?"bg-neutral-700":"bg-neutral-800 hover:bg-neutral-700"}`}>{st.label}</button>)}</div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </>
          )}

          {activeView === "Live Monitoring" && (
            <SectionCard title="Live Monitoring" right={<span className="text-xs text-neutral-400">Auto-refresh every 3s</span>}>
              <div className="grid md:grid-cols-4 gap-3">
                <MetricCard title="Live Working" value={counts.working} tone="emerald" />
                <MetricCard title="Live Faulty" value={counts.faulty} tone="red" />
                <MetricCard title="Live Maintenance" value={counts.maintenance} tone="amber" />
                <MetricCard title="Live Offline" value={counts.offline} tone="slate" />
              </div>
            </SectionCard>
          )}

          {activeView === "System Logs" && (
            <SectionCard title="System Logs" right={<span className="text-xs text-neutral-400">Latest 20 events</span>}>
              <div className="space-y-2 text-xs text-neutral-300 max-h-80 overflow-auto">
                {cameras.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,20).map(c=>(
                  <div key={c.id} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                    <span>{c.updatedBy || "system"} changed {c.id} → {c.status}</span>
                    <span className="text-neutral-500">{new Date(c.updatedAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </main>
      </div>
    </div>
  );
}
