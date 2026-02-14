export default function SectionCard({ title, right, children }) {
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
