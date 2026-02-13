import React, { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";

/* =====================================================
   ENTERPRISE AIRPORT SOC — CONTROL ROOM PRO (STABLE)
   - Fixed syntax errors
   - Removed duplicated hooks/functions
   - Working single-page navigation (Option A)
===================================================== */

const STATUSES = [
  { key: "working", label: "Working", pill: "bg-emerald-500", row: "" },
  { key: "faulty", label: "Faulty", pill: "bg-red-500", row: "bg-red-950/25" },
  { key: "maintenance", label: "Maintenance", pill: "bg-amber-500", row: "bg-amber-950/20" },
  { key: "offline", label: "Offline", pill: "bg-slate-500", row: "bg-slate-900/50" },
];

const ROLES = ["operator", "supervisor", "admin"];
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
  const [login, setLogin] = useState({ username: "", password: "", role: "operator" });
  const [authError, setAuthError] = useState("");

  const [cameras, setCameras] = useState(seedCameras);
  const [selected, setSelected] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState("working");
  const [q, setQ] = useState("");
  const [client, setClient] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [tick, setTick] = useState(0);

  // ===== Role Security (Firebase-driven) =====
  const resolveRoleFromEmail = (email) => {
    const e = String(email || "").toLowerCase();
    if (e.includes("admin")) return "admin";
    if (e.includes("supervisor") || e.includes("sup")) return "supervisor";
    return "operator";
  };

  // ===== Advanced Shift Intelligence =====
  const [shiftMode, setShiftMode] = useState("AUTO");
  const [selectedShift, setSelectedShift] = useState("ALL");

  const getCurrentShiftByTime = () => {
    const h = new Date().getHours();
    if (h >= 6 && h < 14) return "Morning";
    if (h >= 14 && h < 22) return "Evening";
    return "Night";
  };

  const activeTimeShift = shiftMode === "AUTO" ? getCurrentShiftByTime() : shiftMode;

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

  const criticalCount = useMemo(
    () => cameras.filter((c) => c.status === "faulty" || c.status === "offline").length,
    [cameras]
  );

  const filtered = useMemo(() => {
    return cameras.filter((c) => {
      const matchQ = q.trim() === "" || c.id.toLowerCase().includes(q.toLowerCase()) || c.location.toLowerCase().includes(q.toLowerCase());
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
    setCameras((prev) => prev.map((c) => (c.id === id ? { ...c, status: newStatus, updatedAt: new Date().toISOString(), updatedBy: userName || "operator" } : c)));
    if (!db) return;
    try {
      await updateDoc(doc(db, "cameras", id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        updatedBy: userName || "operator",
      });
    } catch {
      // demo mode
    }
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
    setCameras((prev) => prev.map((c) => (selected.has(c.id) ? { ...c, status: bulkStatus, updatedAt: new Date().toISOString(), updatedBy: userName || "operator" } : c)));
    setSelected(new Set());
  };

  const exportCsv = () => {
    const header = ["CameraID", "Client", "Location", "Status", "UpdatedAt", "UpdatedBy", "Remarks"];
    const rows = filtered.map((c) => [c.id, c.client, c.location, c.status, c.updatedAt, c.updatedBy, c.remarks || ""]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cctv_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-[#05070b] text-neutral-100 grid place-items-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/90 p-6 shadow-2xl shadow-black/50">
          <h1 className="text-xl font-bold text-white">Airport SOC Login</h1>
          <p className="mt-1 text-sm text-neutral-400">Enterprise access • {auth ? "Firebase" : "Demo mode"}</p>
          <div className="mt-4 space-y-3">
            <input value={login.username} onChange={(e)=>setLogin({...login, username:e.target.value})} placeholder="Email" className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-700/40" />
            <input type="password" value={login.password} onChange={(e)=>setLogin({...login, password:e.target.value})} placeholder="Password" className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-700/40" />
            <div className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-400">
              Role is assigned automatically after login (Operator / Supervisor / Admin)
            </div>
            <button
              onClick={async () => {
                setAuthError("");
                if (!login.username.trim() || !login.password.trim()) {
                  setAuthError("Enter email and password");
                  return;
                }
                if (!auth) {
                  setAuthError("Firebase not connected");
                  return;
                }
                try {
                  await signInWithEmailAndPassword(auth, login.username.trim(), login.password);
                  const resolvedRole = resolveRoleFromEmail(login.username.trim());
                  setUserName(login.username.trim());
                  setRole(resolvedRole);
                  setIsAuthed(true);
                } catch (e) {
                  setAuthError("Invalid login credentials");
                }
              }}
              className="w-full rounded-xl bg-cyan-600 px-3 py-2 font-semibold hover:bg-cyan-500"
            >
              Login to Control Room
            </button>
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
          <div className="mt-1 text-xs text-neutral-400">Enterprise Control Room</div>
          <nav className="mt-6 space-y-2 text-sm">
            {NAV_ITEMS.map((i) => (
              <button
                key={i}
                onClick={() => setActiveView(i)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${activeView === i ? "border-cyan-700 bg-neutral-800 text-white" : "border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800"}`}
              >
                {i}
              </button>
            ))}
          </nav>
          <div className="mt-6 text-xs text-neutral-500 whitespace-pre-line">{`User: ${userName}\nRole: ${role}\nMode: LIVE`}</div>
          <button onClick={()=>setIsAuthed(false)} className="mt-4 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs hover:bg-neutral-800">Logout</button>
        </aside>

        <main className={`p-4 md:p-6 lg:p-8 space-y-4 ${wallMode ? "text-lg" : ""}`}>
          {role !== "operator" && (
            <div className="flex items-center justify-between rounded-xl border border-cyan-800 bg-cyan-900/20 px-4 py-2 text-xs">
              <div>Supervisor Command Mode Active</div>
              <button onClick={() => setWallMode(!wallMode)} className="rounded-lg bg-cyan-600 px-3 py-1 hover:bg-cyan-500">{wallMode ? "Exit Wall Mode" : "Wall Mode"}</button>
            </div>
          )}

          {criticalCount > 0 && (
            <div className="rounded-xl border border-red-800 bg-red-900/30 px-4 py-3 animate-pulse">🚨 CRITICAL ALERT: {criticalCount} Cameras Need Immediate Attention</div>
          )}

          <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">Airport CCTV Control Room</h1>
              <p className="text-sm text-neutral-400">Enterprise Operations Dashboard</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-800 bg-emerald-900/40 px-2 py-1 text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse"/>LIVE</span>
              <span className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 uppercase">{role}</span>
              <span className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1">Tick {tick}</span>
            </div>
          </header>

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
                  <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search camera ID or location" className="md:col-span-2 w-full rounded-xl border border-neutral-700 bg-neutral-800/90 px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-700/40" />
                  <select value={client} onChange={(e)=>setClient(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"><option value="ALL">All Clients</option><option value="T1">T1</option><option value="T2">T2</option></select>
                  <select value={status} onChange={(e)=>setStatus(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"><option value="ALL">All Status</option>{STATUSES.map((s)=><option key={s.key} value={s.key}>{s.label}</option>)}</select>
                  <button onClick={exportCsv} className="rounded-xl bg-cyan-600 px-3 py-2 font-medium hover:bg-cyan-500">Export CSV</button>
                  {canBulk ? (
                    <div className="flex gap-2">
                      <select value={bulkStatus} onChange={(e)=>setBulkStatus(e.target.value)} className="flex-1 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2">{STATUSES.map((s)=><option key={s.key} value={s.key}>{s.label}</option>)}</select>
                      <button onClick={applyBulkUpdate} className="rounded-xl bg-emerald-600 px-3 py-2 font-medium hover:bg-emerald-500">Bulk</button>
                    </div>
                  ) : <div className="flex items-center text-xs text-neutral-500">Bulk disabled for operator</div>}
                </div>
              </SectionCard>

              <SectionCard title="Live Camera Grid" right={<span className="text-xs text-neutral-400">PRO Mode Enabled</span>}>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-800 text-neutral-300">
                      <tr>
                        <th className="px-3 py-2 text-left">Sel</th>
                        <th className="px-3 py-2 text-left">Camera ID</th>
                        <th className="px-3 py-2 text-left">Client</th>
                        <th className="px-3 py-2 text-left">Location</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Quick Update</th>
                        <th className="px-3 py-2 text-left">Updated</th>
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
                            <td className="px-3 py-2">{c.client}</td>
                            <td className="px-3 py-2">{c.location}</td>
                            <td className="px-3 py-2"><StatusPill status={c.status} /></td>
                            <td className="px-3 py-2"><div className="flex flex-wrap gap-2">{STATUSES.map((st)=><button key={st.key} onClick={()=>updateStatus(c.id, st.key)} className={`rounded-lg border border-neutral-700 px-2 py-1 text-xs ${c.status===st.key?"bg-neutral-700":"bg-neutral-800 hover:bg-neutral-700"}`}>{st.label}</button>)}</div></td>
                            <td className="px-3 py-2 text-neutral-400">{new Date(c.updatedAt).toLocaleString()}</td>
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

          {activeView === "Supervisor View" && (
            <SectionCard title="Supervisor View" right={<span className="text-xs text-neutral-400">Priority insights</span>}>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                  <div className="text-sm font-semibold text-white mb-2">Critical Cameras</div>
                  <div className="space-y-2 max-h-64 overflow-auto">
                    {cameras.filter(c=>c.status==="faulty"||c.status==="offline").slice(0,10).map(c=>(
                      <div key={c.id} className="flex items-center justify-between text-xs">
                        <span className="text-neutral-200">{c.id} • {c.location}</span>
                        <StatusPill status={c.status} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                  <div className="text-sm font-semibold text-white mb-2">Recent Updates</div>
                  <div className="space-y-2 max-h-64 overflow-auto text-xs text-neutral-300">
                    {cameras.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,12).map(c=>(
                      <div key={c.id} className="flex justify-between gap-2">
                        <span className="truncate">{c.updatedBy || "system"} updated {c.id}</span>
                        <span className="text-neutral-500">{new Date(c.updatedAt).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </SectionCard>
          )}

          {activeView === "Shift Reports" && (
            <SectionCard
              title="Advanced Shift Intelligence"
              right={
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-neutral-400">Mode:</span>
                  <select value={shiftMode} onChange={(e)=>{ setShiftMode(e.target.value); if(e.target.value!=="AUTO") setSelectedShift(e.target.value); }} className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1">
                    <option value="AUTO">Auto (Time Based)</option>
                    <option value="Morning">Morning</option>
                    <option value="Evening">Evening</option>
                    <option value="Night">Night</option>
                  </select>
                  <span className="text-neutral-500">View:</span>
                  <select value={selectedShift} onChange={(e)=>setSelectedShift(e.target.value)} className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1">
                    <option value="ALL">All</option>
                    <option value="Morning">Morning</option>
                    <option value="Evening">Evening</option>
                    <option value="Night">Night</option>
                  </select>
                </div>
              }
            >
              {(() => {
                const effectiveShift = shiftMode === "AUTO" ? activeTimeShift : shiftMode;
                const shiftsToShow = selectedShift === "ALL" ? ["Morning","Evening","Night"] : [selectedShift];

                const inShiftWindow = (dateIso, shiftName) => {
                  const d = new Date(dateIso);
                  const h = d.getHours();
                  if (shiftName === "Morning") return h >= 6 && h < 14;
                  if (shiftName === "Evening") return h >= 14 && h < 22;
                  return h >= 22 || h < 6;
                };

                const getUpdatedInShift = (shiftName) => cameras.filter((c) => inShiftWindow(c.updatedAt, shiftName));

                return (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="text-neutral-400">Active Shift:</span>
                      <span className="rounded-md border border-cyan-800 bg-cyan-900/30 px-2 py-0.5 text-cyan-300 font-semibold">{effectiveShift}</span>
                      <span className="text-neutral-500">Total Cameras (all shifts):</span>
                      <span className="text-neutral-300">{cameras.length}</span>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4">
                      {shiftsToShow.map((shiftName) => {
                        const updatedList = getUpdatedInShift(shiftName);
                        const isActive = shiftName === effectiveShift;
                        return (
                          <div key={shiftName} className={"rounded-xl p-4 border " + (isActive ? "border-cyan-700 bg-cyan-950/20" : "border-neutral-800 bg-neutral-950")}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-sm font-semibold text-white">{shiftName} Shift</div>
                              {isActive && <span className="text-[10px] uppercase tracking-wide text-cyan-300">ACTIVE</span>}
                            </div>
                            <div className="text-xs text-neutral-300">Total Cameras: {cameras.length}</div>
                            <div className="mt-2 text-xs text-neutral-400">Updated in shift: {updatedList.length}</div>
                            <div className="text-xs text-neutral-400">Working (updated): {updatedList.filter((c)=>c.status==="working").length}</div>
                            <div className="text-xs text-neutral-400">Faulty (updated): {updatedList.filter((c)=>c.status==="faulty").length}</div>
                            <div className="text-xs text-neutral-400">Maintenance (updated): {updatedList.filter((c)=>c.status==="maintenance").length}</div>
                            <div className="text-xs text-neutral-400">Offline (updated): {updatedList.filter((c)=>c.status==="offline").length}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
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
