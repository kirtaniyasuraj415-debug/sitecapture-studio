import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { getBrowser, preparePage, safeClose, withTimeout } from "./browser.js";
import { resolveDevice } from "./devices.js";
import { newFile, TEMP_DIR } from "../lib/files.js";
import { runProcess } from "./process.js";
import { CaptureError } from "../lib/errors.js";
import type { VideoInput } from "../lib/schemas.js";

const speedMultiplier = { slow: 0.75, normal: 1, fast: 1.35 } as const;

function resolveVideoViewport(input: VideoInput, device: ReturnType<typeof resolveDevice>) {
  if (device.kind !== "desktop" || input.videoPreset === "device") return { width: device.width, height: device.height };
  if (input.videoPreset === "1080p") return { width: 1920, height: 1080 };
  if (input.videoPreset === "1440p") return { width: 2560, height: 1440 };
  if (input.videoPreset === "4k") {
    if (process.env.ENABLE_4K_VIDEO !== "true") throw new CaptureError("RESOURCE_LIMIT", "4K recording is disabled on this server to prevent resource exhaustion.");
    return { width: 3840, height: 2160 };
  }
  return { width: device.width, height: device.height };
}

export async function captureVideo(input: VideoInput, onStage: (status: string, progress: number, message: string) => void) {
  return withTimeout((async () => {
    const started = Date.now();
    const baseDevice = resolveDevice(input);
    const viewport = resolveVideoViewport(input, baseDevice);
    const outputSize = { width: viewport.width, height: viewport.height };
    const renderPixels = viewport.width * viewport.height * input.dpr * input.dpr;
    const maxRenderPixels = Number(process.env.MAX_VIDEO_RENDER_PIXELS || 10_000_000);
    if (renderPixels > maxRenderPixels) throw new CaptureError("RESOURCE_LIMIT", "Requested video render resolution exceeds this server's safe resource limit. Reduce DPR or video preset.");

    await mkdir(TEMP_DIR, { recursive: true });
    const rawDir = path.join(TEMP_DIR, `raw-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(rawDir, { recursive: true });
    const browser = await getBrowser();
    let context;
    let rawPath = "";
    try {
      const pageCreatedAt = Date.now();
      context = await browser.newContext({
        viewport,
        deviceScaleFactor: input.dpr,
        isMobile: baseDevice.isMobile,
        hasTouch: baseDevice.hasTouch,
        userAgent: input.userAgent || baseDevice.userAgent,
        colorScheme: input.colorScheme,
        reducedMotion: input.keepAnimations ? "no-preference" : "reduce",
        serviceWorkers: "block",
        acceptDownloads: false,
        recordVideo: { dir: rawDir, size: outputSize },
      });
      const page = await context.newPage();
      const video = page.video();
      if (!video) throw new CaptureError("VIDEO_INIT_FAILED", "Browser video recorder could not start.");
      await preparePage(page, input.url, input, onStage);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250);
      const captureStart = Date.now();
      onStage("capturing", 72, input.recordingMode === "autoScroll" ? "Recording smooth auto-scroll" : "Recording website");

      if (input.recordingMode === "autoScroll") {
        await page.evaluate(async ({ duration, multiplier }) => {
          const start = performance.now();
          const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          await new Promise<void>((resolve) => {
            const tick = (now: number) => {
              const elapsed = now - start;
              const raw = Math.min(1, elapsed / duration);
              const adjusted = Math.min(1, raw * multiplier);
              const eased = adjusted < 0.5 ? 2 * adjusted * adjusted : 1 - Math.pow(-2 * adjusted + 2, 2) / 2;
              window.scrollTo(0, maxScroll * eased);
              if (raw < 1) requestAnimationFrame(tick); else resolve();
            };
            requestAnimationFrame(tick);
          });
        }, { duration: input.durationSeconds * 1000, multiplier: speedMultiplier[input.scrollSpeed] });
      } else {
        await page.waitForTimeout(input.durationSeconds * 1000);
      }
      const offsetSeconds = Math.max(0, (captureStart - pageCreatedAt) / 1000);
      const finalUrl = page.url();
      await context.close();
      context = undefined;
      rawPath = await video.path();
      onStage("processing", 88, "Encoding final video");

      const webm = newFile("webm");
      await runProcess("ffmpeg", ["-y", "-ss", offsetSeconds.toFixed(3), "-i", rawPath, "-t", String(input.durationSeconds), "-an", "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "5", "-crf", "30", "-b:v", "0", webm.path], 90_000);

      let primary = webm;
      let secondary: { id: string; path: string; name: string } | undefined;
      if (input.output === "mp4" || input.output === "both") {
        const mp4 = newFile("mp4");
        await runProcess("ffmpeg", ["-y", "-i", webm.path, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4.path], 90_000);
        if (input.output === "mp4") primary = mp4; else { primary = mp4; secondary = webm; }
      }
      const info = await stat(primary.path);
      return {
        fileId: primary.id,
        fileName: `sitecapture-${baseDevice.id}-${Date.now()}.${primary.path.endsWith(".mp4") ? "mp4" : "webm"}`,
        format: primary.path.endsWith(".mp4") ? "mp4" : "webm",
        width: outputSize.width,
        height: outputSize.height,
        fileSize: info.size,
        captureTimeMs: Date.now() - started,
        sourceUrl: input.url,
        finalUrl,
        deviceLabel: `${baseDevice.label} · ${outputSize.width} × ${outputSize.height} output`,
        dpr: input.dpr,
        secondaryFile: secondary ? { fileId: secondary.id, fileName: `sitecapture-${baseDevice.id}-${Date.now()}.webm`, format: "webm" } : undefined,
      };
    } finally { await safeClose(context); }
  })(), Number(process.env.VIDEO_TIMEOUT_MS || 120_000));
}
