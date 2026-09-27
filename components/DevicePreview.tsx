import { Monitor, Tablet, Smartphone } from "lucide-react";
import type { DeviceKind } from "@/lib/types";

export function DevicePreview({ kind, width, height, url }: { kind: DeviceKind; width: number; height: number; url: string }) {
  const Icon = kind === "mobile" ? Smartphone : kind === "tablet" ? Tablet : Monitor;
  const ratio = Math.min(1, 430 / width, 360 / height);
  const boxW = Math.max(170, Math.round(width * ratio));
  const boxH = Math.max(210, Math.round(height * ratio));
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-white/10 bg-[#0e0e0e] p-6">
      <div className="mb-5 flex items-center gap-2 text-xs text-zinc-500"><Icon size={15} /><span>{width} × {height} CSS px</span></div>
      <div className={`relative overflow-hidden bg-[#181818] shadow-2xl shadow-black/60 ${kind === "mobile" ? "rounded-[28px] border-[7px] border-zinc-700" : kind === "tablet" ? "rounded-[22px] border-[8px] border-zinc-700" : "rounded-xl border-[5px] border-zinc-700"}`} style={{ width: boxW, height: boxH }}>
        <div className="absolute inset-x-0 top-0 flex h-7 items-center gap-1 border-b border-white/8 bg-[#202020] px-2"><i className="h-2 w-2 rounded-full bg-zinc-600"/><i className="h-2 w-2 rounded-full bg-zinc-600"/><i className="h-2 w-2 rounded-full bg-zinc-600"/><span className="ml-2 truncate text-[9px] text-zinc-500">{url || "https://example.com"}</span></div>
        <div className="absolute inset-x-0 bottom-0 top-7 bg-[linear-gradient(135deg,#1b1b1b,#101010)] p-5"><div className="h-3 w-2/3 rounded bg-zinc-700"/><div className="mt-3 h-2 w-4/5 rounded bg-zinc-800"/><div className="mt-2 h-2 w-1/2 rounded bg-zinc-800"/><div className="mt-6 grid grid-cols-2 gap-2"><div className="h-20 rounded-lg border border-white/5 bg-white/[0.03]"/><div className="h-20 rounded-lg border border-white/5 bg-white/[0.03]"/></div></div>
      </div>
      <p className="mt-5 max-w-sm text-center text-xs leading-5 text-zinc-600">Preview sirf framing ke liye hai. Final capture backend Chromium se hota hai.</p>
    </div>
  );
}
