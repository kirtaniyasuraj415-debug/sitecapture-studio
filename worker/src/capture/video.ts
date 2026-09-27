import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext } from "playwright";
import { getBrowser, preparePage, safeClose, secureContext, withTimeout } from "./browser.js";
import { resolveDevice } from "./devices.js";
import { newFile, TEMP_DIR } from "../lib/files.js";
import { runProcess } from "./process.js";
import { CaptureError } from "../lib/errors.js";
import type { VideoInput } from "../lib/schemas.js";

const scrollDurationFactor = { slow: 1, normal: 0.82, fast: 0.62 } as const;

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
  let activeContext: BrowserContext | undefined;
  const abortController = new AbortController();
  let rawDir = "";
  const createdPaths = new Set<string>();
  const keepPaths = new Set<string>();
  const operation = (async () => {
    const started = Date.now();
    const baseDevice = resolveDevice(input);
    const viewport = resolveVideoViewport(input, baseDevice);
    const outputSize = { width: viewport.width, height: viewport.height };
    const renderPixels = viewport.width * viewport.height * input.dpr * input.dpr;
    const maxRenderPixels = Number(process.env.MAX_VIDEO_RENDER_PIXELS || 10_000_000);
    if (renderPixels > maxRenderPixels) throw new CaptureError("RESOURCE_LIMIT", "Requested video render resolution exceeds this server's safe resource limit. Reduce video resolution.");

    await mkdir(TEMP_DIR, { recursive: true });
    rawDir = path.join(TEMP_DIR, `raw-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(rawDir, { recursive: true });
    const browser = await getBrowser();
    try {
      activeContext = await browser.newContext({
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
      await secureContext(activeContext);
      const page = await activeContext.newPage();
      const recordingStartedAt = Date.now();
      const video = page.video();
      if (!video) throw new CaptureError("VIDEO_INIT_FAILED", "Browser video recorder could not start.");
      await preparePage(page, input.url, input, onStage);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250);
      const captureStart = Date.now();
      onStage("capturing", 72, input.recordingMode === "autoScroll" ? "Recording smooth auto-scroll" : "Recording website");

      if (input.recordingMode === "autoScroll") {
        const scrollMs = Math.max(500, input.durationSeconds * 1000 * scrollDurationFactor[input.scrollSpeed]);
        await page.evaluate(async ({ scrollMs, totalMs }) => {
          const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          if (maxScroll > 0) {
            const start = performance.now();
            await new Promise<void>((resolve) => {
              const tick = (now: number) => {
                const progress = Math.min(1, (now - start) / scrollMs);
                const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                window.scrollTo(0, maxScroll * eased);
                if (progress < 1) requestAnimationFrame(tick); else resolve();
              };
              requestAnimationFrame(tick);
            });
          }
          const remaining = Math.max(0, totalMs - scrollMs);
          if (remaining) await new Promise((resolve) => setTimeout(resolve, remaining));
        }, { scrollMs, totalMs: input.durationSeconds * 1000 });
      } else {
        await page.waitForTimeout(input.durationSeconds * 1000);
      }

      const offsetSeconds = Math.max(0, (captureStart - recordingStartedAt) / 1000);
      const finalUrl = page.url();
      await activeContext.close();
      activeContext = undefined;
      const rawPath = await video.path();
      onStage("processing", 88, "Encoding final video");

      let primary: { id: string; path: string; name: string };
      let secondary: { id: string; path: string; name: string } | undefined;
      const ffmpegPrefix = ["-y", "-ss", offsetSeconds.toFixed(3), "-i", rawPath, "-t", String(input.durationSeconds), "-an"];

      if (input.output === "webm") {
        const webm = newFile("webm");
        createdPaths.add(webm.path);
        await runProcess("ffmpeg", [...ffmpegPrefix, "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "5", "-crf", "28", "-b:v", "0", webm.path], 90_000, abortController.signal);
        primary = webm;
      } else {
        const mp4 = newFile("mp4");
        createdPaths.add(mp4.path);
        await runProcess("ffmpeg", [...ffmpegPrefix, "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4.path], 90_000, abortController.signal);
        primary = mp4;
        if (input.output === "both") {
          const webm = newFile("webm");
          createdPaths.add(webm.path);
          await runProcess("ffmpeg", [...ffmpegPrefix, "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "5", "-crf", "28", "-b:v", "0", webm.path], 90_000, abortController.signal);
          secondary = webm;
        }
      }

      const info = await stat(primary.path);
      const maxOutput = Number(process.env.MAX_OUTPUT_FILE_BYTES || 250 * 1024 * 1024);
      if (info.size > maxOutput) throw new CaptureError("RESOURCE_LIMIT", "Generated video exceeded this server's file-size limit.");
      keepPaths.add(primary.path);
      if (secondary) {
        const secondaryInfo = await stat(secondary.path);
        if (secondaryInfo.size > maxOutput) throw new CaptureError("RESOURCE_LIMIT", "Generated secondary video exceeded this server's file-size limit.");
        keepPaths.add(secondary.path);
      }

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
    } finally {
      await safeClose(activeContext);
      activeContext = undefined;
      await Promise.all([...createdPaths].filter((file) => !keepPaths.has(file)).map((file) => rm(file, { force: true }).catch(() => undefined)));
      if (rawDir) await rm(rawDir, { recursive: true, force: true }).catch(() => undefined);
    }
  })();

  return withTimeout(operation, Number(process.env.VIDEO_TIMEOUT_MS || 150_000), () => { abortController.abort(); return safeClose(activeContext); });
}
