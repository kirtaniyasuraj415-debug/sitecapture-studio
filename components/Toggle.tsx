"use client";

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-3">
      <span><span className="block text-sm text-zinc-200">{label}</span>{description && <span className="mt-0.5 block text-xs text-zinc-500">{description}</span>}</span>
      <input className="sr-only" type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-white" : "bg-zinc-700"}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full transition ${checked ? "left-6 bg-black" : "left-1 bg-zinc-300"}`} />
      </span>
    </label>
  );
}
