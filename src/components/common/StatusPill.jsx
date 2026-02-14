import { STATUSES } from "../../constants/config";

export default function StatusPill({ status }) {
  const s = STATUSES.find(x => x.key === status) || STATUSES[0];

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] text-white ${s.pill}`}>
      {s.label}
    </span>
  );
}
