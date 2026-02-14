import { Monitor, Radio, ShieldCheck, FileText } from "lucide-react";

export const STATUSES = [
  { key: "working", label: "Working", pill: "bg-emerald-500", row: "" },
  { key: "offline", label: "Offline", pill: "bg-slate-500", row: "bg-slate-900/50" },
  { key: "maintenance", label: "Maintenance", pill: "bg-amber-500", row: "bg-amber-950/20" },
  { key: "removed", label: "Removed", pill: "bg-rose-700", row: "bg-rose-950/30" },
];

export const NAV_ITEMS = [
  { key: "CCTV Dashboard", label: "CCTV Dashboard", icon: Monitor },
  { key: "RT Inventory", label: "RT Inventory", icon: Radio },
  { key: "Supervisor View", label: "Supervisor View", icon: ShieldCheck },
  { key: "Shift Reports", label: "Shift Reports", icon: FileText },
];
