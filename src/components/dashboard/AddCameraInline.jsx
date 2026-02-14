import { useState } from "react";
import { STATUSES } from "../../constants/config";

export default function AddCameraInline({ onAdd }) {
  const [form, setForm] = useState({
    id: "",
    cameraName: "",
    client: "T1",
    location: "",
    status: "working",
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
      <input
        value={form.id}
        onChange={(e)=>setForm(f=>({...f,id:e.target.value}))}
        placeholder="Camera ID"
        className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"
      />

      <input
        value={form.cameraName}
        onChange={(e)=>setForm(f=>({...f,cameraName:e.target.value}))}
        placeholder="Camera Name"
        className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"
      />

      <select
        value={form.client}
        onChange={(e)=>setForm(f=>({...f,client:e.target.value}))}
        className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"
      >
        <option>T1</option>
        <option>T2</option>
      </select>

      <input
        value={form.location}
        onChange={(e)=>setForm(f=>({...f,location:e.target.value}))}
        placeholder="Location"
        className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"
      />

      <select
        value={form.status}
        onChange={(e)=>setForm(f=>({...f,status:e.target.value}))}
        className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2"
      >
        {STATUSES.map(s=>(
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </select>

      <button
        className="rounded-xl bg-cyan-600 px-3 py-2"
        onClick={()=>{
          if(!form.id.trim()) return;

          onAdd({
            ...form,
            id:form.id.trim(),
            cameraName: form.cameraName || form.id.trim(),
            updatedAt:new Date().toISOString(),
            updatedBy:"manual"
          });

          setForm(f=>({...f,id:"",cameraName:"",location:""}));
        }}
      >
        Add Camera
      </button>
    </div>
  );
}
