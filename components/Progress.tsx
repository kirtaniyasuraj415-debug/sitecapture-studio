import type { JobStatus } from "@/lib/types";

const steps: JobStatus[] = ["queued", "opening", "loading", "rendering", "capturing", "processing", "ready"];

export function Progress({ status, progress, message }: { status: JobStatus; progress: number; message: string }) {
  const active = Math.max(0, steps.indexOf(status));
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between text-sm"><span className="text-zinc-200">{message}</span><span className="font-mono text-zinc-500">{progress}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${progress}%` }} /></div>
      <div className="mt-3 flex gap-1">{steps.map((step, i) => <div key={step} title={step} className={`h-1 flex-1 rounded-full ${i <= active ? "bg-zinc-300" : "bg-zinc-800"}`} />)}</div>
    </div>
  );
}
