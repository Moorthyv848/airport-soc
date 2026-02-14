import React, { useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
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

export default function App() {
  const [view, setView] = useState("CCTV");
  const [isAuthed, setIsAuthed] = useState(false);
  const [error, setError] = useState("");

  const [login, setLogin] = useState({ username: "", password: "" });

  const [cameras, setCameras] = useState([]);
  const [rts, setRts] = useState([]);

  const [form, setForm] = useState({
    id: "",
    name: "",
    client: "T1",
    location: "",
    status: "working",
  });

  /* ============= LIVE FIREBASE ============= */

  useEffect(() => {
    return onSnapshot(collection(db, "cameras"), (snap) => {
      setCameras(snap.docs.map((d) => ({ docId: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "rt_inventory"), (snap) => {
      setRts(snap.docs.map((d) => ({ docId: d.id, ...d.data() })));
    });
  }, []);

  const data = view === "CCTV" ? cameras : rts;

  /* ============= LIVE COUNTS ============= */

  const counts = useMemo(() => {
    const c = {
      total: data.length,
      working: 0,
      offline: 0,
      maintenance: 0,
      removed: 0,
    };
    data.forEach((x) => {
      if (c[x.status] !== undefined) c[x.status]++;
    });
    return c;
  }, [data]);

  /* ============= CRUD ============= */

  const addItem = async () => {
    if (!form.id) return;

    const col = view === "CCTV" ? "cameras" : "rt_inventory";

    await setDoc(
      doc(db, col, form.id.trim()),
      { ...form, id: form.id.trim() },
      { merge: true }
    );

    setForm({
      id: "",
      name: "",
      client: "T1",
      location: "",
      status: "working",
    });
  };

  const updateField = async (item, key, value) => {
    const col = view === "CCTV" ? "cameras" : "rt_inventory";
    await updateDoc(doc(db, col, item.docId), { [key]: value });
  };

  const deleteItem = async (item) => {
    const col = view === "CCTV" ? "cameras" : "rt_inventory";
    await deleteDoc(doc(db, col, item.docId));
  };

  /* ============= CSV EXPORT ============= */

  const exportCSV = () => {
    const rows = data.map(
      (i) =>
        `${i.id},${i.name || ""},${i.client || ""},${i.location || ""},${
          i.status
        }`
    );

    const csv = "id,name,client,location,status\n" + rows.join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${view}_export.csv`;
    a.click();
  };

  /* ============= CSV UPLOAD ============= */

  const uploadCSV = async (e, client) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split("\n").filter(Boolean);

    for (let i = 1; i < lines.length; i++) {
      const [id, name, location, status] = lines[i].split(",");
      if (!id) continue;

      await setDoc(
        doc(db, "cameras", id.trim()),
        {
          id: id.trim(),
          name: name || id,
          client,
          location: location || "",
          status: (status || "working").toLowerCase(),
        },
        { merge: true }
      );
    }
  };

  /* ============= LOGIN ============= */

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="bg-neutral-900 p-6 rounded-xl w-96">
          <h1 className="text-xl mb-3">🛡 SOC Login</h1>

          <input
            className="w-full p-2 mb-2 bg-neutral-800 rounded"
            placeholder="Email"
            onChange={(e) =>
              setLogin({ ...login, username: e.target.value })
            }
          />

          <input
            type="password"
            className="w-full p-2 mb-3 bg-neutral-800 rounded"
            placeholder="Password"
            onChange={(e) =>
              setLogin({ ...login, password: e.target.value })
            }
          />

          <button
            className="w-full bg-cyan-600 p-2 rounded"
            onClick={async () => {
              try {
                setError("");
                await signInWithEmailAndPassword(
                  auth,
                  login.username,
                  login.password
                );
                setIsAuthed(true);
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            Login
          </button>

          {error && <div className="text-red-400 text-xs mt-2">{error}</div>}
        </div>
      </div>
    );
  }

  /* ============= DASHBOARD ============= */

  return (
    <div className="min-h-screen bg-[#05070b] text-white p-5">

      <div className="flex justify-between mb-4">
        <div className="flex gap-2">
          <button onClick={() => setView("CCTV")} className="bg-cyan-600 px-3 py-2 rounded">CCTV Dashboard</button>
          <button onClick={() => setView("RT")} className="bg-neutral-800 px-3 py-2 rounded">RT Dashboard</button>
        </div>

        <button onClick={() => signOut(auth)} className="bg-red-600 px-3 py-2 rounded">
          Logout
        </button>
      </div>

      <div className="grid md:grid-cols-5 gap-3 mb-4">
        {Object.entries(counts).map(([k, v]) => (
          <div key={k} className="bg-neutral-900 p-3 rounded">{k}: {v}</div>
        ))}
      </div>

      {view === "CCTV" && (
        <div className="flex gap-2 mb-4">
          <label className="bg-neutral-800 p-2 rounded cursor-pointer">
            Upload T1 CSV
            <input hidden type="file" onChange={(e) => uploadCSV(e, "T1")} />
          </label>

          <label className="bg-neutral-800 p-2 rounded cursor-pointer">
            Upload T2 CSV
            <input hidden type="file" onChange={(e) => uploadCSV(e, "T2")} />
          </label>

          <button onClick={exportCSV} className="bg-cyan-700 p-2 rounded">
            Export CSV
          </button>
        </div>
      )}

      <table className="w-full bg-neutral-900">
        <thead className="bg-neutral-800">
          <tr>
            <th>ID</th><th>Name</th><th>Client</th>
            <th>Location</th><th>Status</th><th>Delete</th>
          </tr>
        </thead>

        <tbody>
          {data.map((item) => (
            <tr key={item.docId} className="border-t border-neutral-700">
              <td>{item.id}</td>

              <td>
                <input
                  value={item.name || ""}
                  onChange={(e) => updateField(item, "name", e.target.value)}
                  className="bg-neutral-800 p-1"
                />
              </td>

              <td>{item.client}</td>

              <td>
                <input
                  value={item.location || ""}
                  onChange={(e) => updateField(item, "location", e.target.value)}
                  className="bg-neutral-800 p-1"
                />
              </td>

              <td>
                <select
                  value={item.status}
                  onChange={(e) => updateField(item, "status", e.target.value)}
                  className="bg-neutral-800"
                >
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </td>

              <td>
                <button onClick={() => deleteItem(item)} className="bg-red-600 px-2 rounded">
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
