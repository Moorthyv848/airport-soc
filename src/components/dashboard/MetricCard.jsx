export default function MetricCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/85 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
        {title}
      </div>
      <div className="mt-1 text-2xl font-bold text-white">
        {value}
      </div>
    </div>
  );
}
