"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, ChevronDown, Clipboard, Download, Film, Gauge, RefreshCcw, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { DEVICE_PRESETS, deviceById } from "@/lib/devices";
import { createJob, getJob } from "@/lib/api";
import type { CaptureJob, CaptureMode, ScreenshotType } from "@/lib/types";
import { DevicePreview } from "./DevicePreview";
import { Progress } from "./Progress";
import { Toggle } from "./Toggle";

const delays = [0, 1, 2, 3, 5, 10];
const durations = [5, 10, 15, 30];

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default function CaptureStudio() {
  const [mode, setMode] = useState<CaptureMode>("screenshot");
  const [url, setUrl] = useState("https://example.com");
  const [deviceId, setDeviceId] = useState("desktop-1920");
  const [custom, setCustom] = useState(false);
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [dpr, setDpr] = useState(2);
  const [waitSeconds, setWaitSeconds] = useState(2);
  const [screenshotType, setScreenshotType] = useState<ScreenshotType>("viewport");
  const [selectedHeight, setSelectedHeight] = useState(3000);
  const [format, setFormat] = useState<"png" | "jpeg" | "webp">("png");
  const [quality, setQuality] = useState(92);
  const [recordingMode, setRecordingMode] = useState<"static" | "autoScroll">("autoScroll");
  const [durationSeconds, setDurationSeconds] = useState(10);
  const [scrollSpeed, setScrollSpeed] = useState<"slow" | "normal" | "fast">("normal");
  const [output, setOutput] = useState<"mp4" | "webm" | "both">("mp4");
  const [videoPreset, setVideoPreset] = useState<"device" | "1080p" | "1440p" | "4k">("device");
  const [advanced, setAdvanced] = useState(false);
  const [colorScheme, setColorScheme] = useState<"dark" | "light" | "no-preference">("no-preference");
  const [hideScrollbars, setHideScrollbars] = useState(false);
  const [keepAnimations, setKeepAnimations] = useState(true);
  const [removeCookiePopup, setRemoveCookiePopup] = useState(false);
  const [transparentBackground, setTransparentBackground] = useState(false);
  const [userAgent, setUserAgent] = useState("");
  const [forceTouch, setForceTouch] = useState(false);
  const [job, setJob] = useState<CaptureJob | null>(null);
  const [error, setError] = useState("");

  const preset = deviceById(deviceId);
  const device = useMemo(() => custom ? { ...preset, id: "custom", label: `Custom ${width} × ${height}`, width, height, kind: width <= 600 ? "mobile" as const : width <= 1100 ? "tablet" as const : "desktop" as const, isMobile: width <= 1100, hasTouch: width <= 1100 } : preset, [custom, width, height, preset]);
  const busy = job && !["ready", "error"].includes(job.status);

  useEffect(() => {
    if (!job || job.status === "ready" || job.status === "error") return;
    const timer = window.setInterval(async () => {
      try { const next = await getJob(job.id); setJob(next); } catch (e) { setError(e instanceof Error ? e.message : "Could not read capture progress."); }
    }, 900);
    return () => window.clearInterval(timer);
  }, [job]);

  function chooseDevice(id: string) {
    setCustom(false); setDeviceId(id);
    const next = deviceById(id); setWidth(next.width); setHeight(next.height);
    if (next.kind !== "desktop") setVideoPreset("device");
  }

  async function startCapture() {
    setError(""); setJob(null);
    try {
      const normalized = new URL(url.trim());
      if (!["http:", "https:"].includes(normalized.protocol)) throw new Error("Sirf http:// ya https:// URL allowed hai.");
      const common = {
        url: normalized.toString(),
        ...(custom ? { width, height, isMobile: forceTouch || device.isMobile, hasTouch: forceTouch || device.hasTouch } : { deviceId, ...(forceTouch ? { isMobile: true, hasTouch: true } : {}) }),
        dpr, waitSeconds, colorScheme, hideScrollbars, keepAnimations, removeCookiePopup, transparentBackground,
        ...(userAgent.trim() ? { userAgent: userAgent.trim() } : {}),
      };
      const payload = mode === "screenshot"
        ? { ...common, screenshotType, ...(screenshotType === "selectedHeight" ? { selectedHeight } : {}), format, quality }
        : { ...common, recordingMode, durationSeconds, scrollSpeed, output, videoPreset };
      const created = await createJob(mode, payload);
      setJob({ id: created.id, type: mode, status: "queued", progress: 3, message: "Queued", createdAt: new Date().toISOString() });
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid capture settings."); }
  }

  function captureAgain() { setJob(null); setError(""); }

  return (
    <main className="mx-auto min-h-screen max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-4 border-b border-white/8 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-xl bg-white text-black"><Camera size={18}/></div><h1 className="text-xl font-semibold tracking-tight">SiteCapture Studio</h1></div><p className="mt-2 text-sm text-zinc-500">Real Chromium rendering. Crisp pixels. No fake upscaling.</p></div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-400"><ShieldCheck size={14}/><span>Public URLs only · SSRF protected</span></div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)]">
        <section className="rounded-3xl border border-white/10 bg-[#101010]/95 p-4 sm:p-6">
          <div className="mb-5 grid grid-cols-2 rounded-xl bg-black p-1">
            <button onClick={() => { setMode("screenshot"); setJob(null); }} className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm transition ${mode === "screenshot" ? "bg-white text-black" : "text-zinc-500 hover:text-white"}`}><Camera size={16}/>Screenshot</button>
            <button onClick={() => { setMode("video"); setJob(null); }} className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm transition ${mode === "video" ? "bg-white text-black" : "text-zinc-500 hover:text-white"}`}><Film size={16}/>Record Website</button>
          </div>

          <label className="mb-2 block text-xs font-medium uppercase tracking-[.14em] text-zinc-500">Website URL</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoCapitalize="none" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3.5 text-sm outline-none transition placeholder:text-zinc-700 focus:border-white/30" placeholder="https://example.com" />

          <div className="mt-6 flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-[.14em] text-zinc-500">Device preset</span><button onClick={() => setCustom((v) => !v)} className={`text-xs ${custom ? "text-white" : "text-zinc-500 hover:text-white"}`}>Custom size</button></div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DEVICE_PRESETS.map((item) => <button key={item.id} onClick={() => chooseDevice(item.id)} className={`rounded-xl border px-3 py-3 text-left transition ${!custom && deviceId === item.id ? "border-white/35 bg-white/10" : "border-white/8 bg-white/[0.025] hover:bg-white/[0.05]"}`}><span className="block text-xs text-zinc-300">{item.kind[0].toUpperCase()+item.kind.slice(1)}</span><span className="mt-1 block font-mono text-[11px] text-zinc-600">{item.width} × {item.height}</span></button>)}
          </div>
          {custom && <div className="mt-3 grid grid-cols-2 gap-3"><NumberField label="Width" value={width} min={320} max={3840} onChange={setWidth}/><NumberField label="Height" value={height} min={480} max={6000} onChange={setHeight}/></div>}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Device Pixel Ratio"><select value={dpr} onChange={(e) => setDpr(Number(e.target.value))} className="field"><option value={1}>1×</option><option value={2}>2× — Recommended</option><option value={3}>3×</option></select></Field>
            <Field label="Extra wait"><select value={waitSeconds} onChange={(e) => setWaitSeconds(Number(e.target.value))} className="field">{delays.map((v) => <option key={v} value={v}>{v} sec{v === 2 ? " — Default" : ""}</option>)}</select></Field>
          </div>

          {mode === "screenshot" ? <>
            <div className="mt-6"><span className="text-xs font-medium uppercase tracking-[.14em] text-zinc-500">Capture type</span><div className="mt-3 grid grid-cols-3 gap-2">{(["viewport","fullPage","selectedHeight"] as ScreenshotType[]).map((v) => <button key={v} onClick={() => setScreenshotType(v)} className={`rounded-xl border p-3 text-xs ${screenshotType === v ? "border-white/30 bg-white/10 text-white" : "border-white/8 text-zinc-500"}`}>{v === "fullPage" ? "Full page" : v === "selectedHeight" ? "Selected height" : "Viewport"}</button>)}</div></div>
            {screenshotType === "selectedHeight" && <div className="mt-3"><NumberField label="Capture height" value={selectedHeight} min={480} max={12000} onChange={setSelectedHeight}/></div>}
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Image format"><select value={format} onChange={(e) => setFormat(e.target.value as typeof format)} className="field"><option value="png">PNG — Sharpest</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></Field>{format !== "png" && <NumberField label={`Quality · ${quality}`} value={quality} min={60} max={100} onChange={setQuality} type="range"/>}</div>
          </> : <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Recording mode"><select value={recordingMode} onChange={(e) => setRecordingMode(e.target.value as typeof recordingMode)} className="field"><option value="autoScroll">Auto scroll</option><option value="static">Static recording</option></select></Field><Field label="Duration"><select value={durationSeconds} onChange={(e) => setDurationSeconds(Number(e.target.value))} className="field">{durations.map((v) => <option key={v} value={v}>{v} sec</option>)}</select></Field></div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">{recordingMode === "autoScroll" && <Field label="Scroll speed"><select value={scrollSpeed} onChange={(e) => setScrollSpeed(e.target.value as typeof scrollSpeed)} className="field"><option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option></select></Field>}<Field label="Output"><select value={output} onChange={(e) => setOutput(e.target.value as typeof output)} className="field"><option value="mp4">MP4 H.264</option><option value="webm">WebM</option><option value="both">MP4 + WebM</option></select></Field></div>
            <div className="mt-4"><Field label="Desktop video preset"><select disabled={device.kind !== "desktop"} value={videoPreset} onChange={(e) => setVideoPreset(e.target.value as typeof videoPreset)} className="field disabled:opacity-40"><option value="device">Use selected device</option><option value="1080p">1080p · 1920 × 1080</option><option value="1440p">1440p · 2560 × 1440</option><option value="4k">4K · host permitting</option></select></Field>{device.kind !== "desktop" && <p className="mt-2 text-xs text-zinc-600">Mobile/tablet recording keeps the selected responsive viewport instead of forcing a desktop video size.</p>}</div>
          </>}

          <button onClick={() => setAdvanced((v) => !v)} className="mt-6 flex w-full items-center justify-between rounded-xl border border-white/8 bg-black/30 px-4 py-3 text-sm text-zinc-400 hover:text-white"><span className="flex items-center gap-2"><Settings2 size={15}/>Advanced settings</span><ChevronDown size={15} className={`transition ${advanced ? "rotate-180" : ""}`}/></button>
          {advanced && <div className="mt-3 space-y-2 rounded-2xl border border-white/8 bg-black/20 p-3"><Field label="Color scheme"><select value={colorScheme} onChange={(e) => setColorScheme(e.target.value as typeof colorScheme)} className="field"><option value="no-preference">System / no preference</option><option value="dark">Dark</option><option value="light">Light</option></select></Field><Toggle checked={hideScrollbars} onChange={setHideScrollbars} label="Hide scrollbars"/><Toggle checked={forceTouch} onChange={setForceTouch} label="Force mobile touch emulation" description="Applies isMobile + hasTouch to the selected viewport"/><Toggle checked={keepAnimations} onChange={setKeepAnimations} label="Keep animations" description="Recommended for video and scroll effects"/><Toggle checked={removeCookiePopup} onChange={setRemoveCookiePopup} label="Remove common cookie popups" description="Best-effort CSS hiding · default off"/><Toggle checked={transparentBackground} onChange={setTransparentBackground} label="Transparent screenshot background" description="PNG works best; site CSS can still paint a background"/><Field label="User Agent override"><input value={userAgent} onChange={(e) => setUserAgent(e.target.value)} className="field" placeholder="Leave empty for device default"/></Field></div>}

          {error && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-200">{error}</div>}
          {job?.status === "error" && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3"><p className="text-sm text-red-200">{job.error?.message || "Capture failed."}</p><button onClick={captureAgain} className="mt-3 flex items-center gap-2 text-xs text-white"><RefreshCcw size={13}/>Retry</button></div>}
          {busy && <div className="mt-4"><Progress status={job.status} progress={job.progress} message={job.message}/></div>}

          <button disabled={Boolean(busy)} onClick={startCapture} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-4 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50">{mode === "screenshot" ? <Camera size={17}/> : <Film size={17}/>} {busy ? "Working…" : mode === "screenshot" ? "Capture Website" : "Record Website"}</button>
          <p className="mt-3 flex items-center justify-center gap-2 text-center text-[11px] text-zinc-600"><Gauge size={12}/>Queue-limited capture · browser/temp files auto-cleaned</p>
        </section>

        <section className="min-w-0">
          {job?.status === "ready" && job.result ? <Result job={job} onAgain={captureAgain} onCopy={() => navigator.clipboard.writeText(job.result?.sourceUrl || url)}/> : <>
            <DevicePreview kind={device.kind} width={device.width} height={device.height} url={url}/>
            <div className="mt-5 grid gap-3 sm:grid-cols-3"><Info icon={<Sparkles size={16}/>} title="Native sharpness" text={`${device.width * dpr} × ${device.height * dpr} px viewport output at ${dpr}× DPR`}/><Info icon={<ShieldCheck size={16}/>} title="Safe capture" text="Public HTTP(S) destinations only, with private-network blocking."/><Info icon={<Film size={16}/>} title="Real browser" text="Chromium loads fonts, images, responsive CSS and scroll-triggered motion."/></div>
          </>}
        </section>
      </div>
      <style jsx global>{`.field{width:100%;border:1px solid rgba(255,255,255,.09);background:#080808;border-radius:.75rem;padding:.75rem;color:#e5e5e5;outline:none}.field:focus{border-color:rgba(255,255,255,.28)}`}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-xs text-zinc-500">{label}</span>{children}</label>; }
function NumberField({ label, value, min, max, onChange, type = "number" }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; type?: "number" | "range" }) { return <Field label={label}><input type={type} value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} className="field"/></Field>; }
function Info({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4"><div className="mb-3 text-zinc-400">{icon}</div><h3 className="text-sm text-zinc-200">{title}</h3><p className="mt-1 text-xs leading-5 text-zinc-600">{text}</p></div>; }

function Result({ job, onAgain, onCopy }: { job: CaptureJob; onAgain: () => void; onCopy: () => void }) {
  const result = job.result!;
  return <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#101010]">
    <div className="flex items-center justify-between border-b border-white/8 px-5 py-4"><div><p className="text-xs uppercase tracking-[.14em] text-zinc-600">Capture complete</p><h2 className="mt-1 text-lg font-medium">Ready to use</h2></div><span className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1 text-xs text-emerald-300">Ready</span></div>
    <div className="grid min-h-[420px] place-items-center bg-black p-4">{job.type === "screenshot" ? <img src={result.previewUrl} alt="Website capture" className="max-h-[650px] max-w-full rounded-xl border border-white/10 object-contain"/> : <video src={result.previewUrl} controls autoPlay muted playsInline className="max-h-[650px] max-w-full rounded-xl border border-white/10"/>}</div>
    <div className="grid grid-cols-2 gap-px bg-white/8 sm:grid-cols-4">{[["Dimensions",`${result.width} × ${result.height}`],["File size",bytes(result.fileSize)],["Device",result.deviceLabel],["Capture time",`${(result.captureTimeMs/1000).toFixed(1)}s`]].map(([k,v]) => <div key={k} className="bg-[#101010] p-4"><p className="text-[10px] uppercase tracking-wider text-zinc-600">{k}</p><p className="mt-1 truncate text-xs text-zinc-300">{v}</p></div>)}</div>
    <div className="flex flex-wrap gap-2 p-4"><a href={result.downloadUrl} className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black"><Download size={16}/>Download {result.format.toUpperCase()}</a>{result.secondaryFile && <a href={result.secondaryFile.downloadUrl} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-300"><Download size={16}/>Download {result.secondaryFile.format.toUpperCase()}</a>}<button onClick={onAgain} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-300"><RefreshCcw size={15}/>Capture Again</button><button onClick={onCopy} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-300"><Clipboard size={15}/>Copy Original URL</button></div>
  </div>;
}
