import { readFile, statfs } from "node:fs/promises";
import os from "node:os";
import { CaptureError } from "./errors.js";
import { TEMP_DIR, ensureTemp } from "./files.js";

export async function availableMemory() {
  let available = os.freemem(), total = os.totalmem();
  try {
    const [limit, used] = await Promise.all([readFile('/sys/fs/cgroup/memory.max', 'utf8'), readFile('/sys/fs/cgroup/memory.current', 'utf8')]);
    if (limit.trim() !== 'max') { total = Math.min(total, Number(limit)); available = Math.min(available, Number(limit) - Number(used)); }
  } catch { /* Non-Linux hosts use OS memory. Docker production uses cgroup v2. */ }
  return { available, total };
}

export async function checkResources(pixels: number, video = false) {
  const memory = await availableMemory();
  const required = 220 * 1024 * 1024 + pixels * (video ? 28 : 16);
  if (memory.available < required) throw new CaptureError("RESOURCE_LIMIT", "Not enough memory for this capture. Reduce DPR/resolution or wait for the current job.");
  await ensureTemp();
  const disk = await statfs(TEMP_DIR);
  if (disk.bavail * disk.bsize < 512 * 1024 * 1024) throw new CaptureError("RESOURCE_LIMIT", "Capture storage is nearly full. Wait for temporary files to expire.");
}

export async function capabilities() {
  const memory = await availableMemory();
  const maxVideo = Number(process.env.MAX_VIDEO_RENDER_PIXELS || 10_000_000);
  const allow4k = process.env.ENABLE_4K_VIDEO === "true" && memory.total >= 4 * 1024 ** 3 && maxVideo >= 3840 * 2160;
  return { fourKVideo: allow4k, maxVideoRenderPixels: maxVideo, maxScreenshotPixels: Number(process.env.MAX_SCREENSHOT_PIXELS || 100_000_000), maxDurationSeconds: 30, fileTtlSeconds: 1800 };
}
