import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { screenshotSchema, videoSchema } from "../lib/schemas.js";
import { captureScreenshot } from "../capture/screenshot.js";
import { captureVideo } from "../capture/video.js";
import { closeBrowser } from "../capture/browser.js";

const stage = (status: string, progress: number, message: string) => console.log(`[${progress}%] ${status}: ${message}`);

async function main() {
  const screenshot = await captureScreenshot(screenshotSchema.parse({
    url: "https://example.com",
    deviceId: "desktop-1366",
    dpr: 2,
    waitSeconds: 0,
    format: "png",
    screenshotType: "viewport",
  }), stage);
  const screenshotPath = `./temp/${screenshot.fileId}.png`;
  const png = await readFile(screenshotPath);
  if (png.length < 1000 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("PNG smoke capture is invalid.");
  console.log(`PNG OK: ${screenshot.width}x${screenshot.height}, ${(await stat(screenshotPath)).size} bytes`);

  const video = await captureVideo(videoSchema.parse({
    url: "https://example.com",
    deviceId: "desktop-1366",
    dpr: 1,
    waitSeconds: 0,
    durationSeconds: 3,
    recordingMode: "static",
    output: "mp4",
  }), stage);
  const videoPath = `./temp/${video.fileId}.mp4`;
  if ((await stat(videoPath)).size < 5000) throw new Error("MP4 smoke capture is unexpectedly small.");
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", videoPath], { encoding: "utf8" });
  if (probe.status !== 0 || Number(probe.stdout.trim()) <= 0) throw new Error(`MP4 ffprobe validation failed: ${probe.stderr}`);
  console.log(`MP4 OK: ${video.width}x${video.height}, duration=${probe.stdout.trim()}s`);
}

main().finally(() => closeBrowser()).catch((error) => { console.error(error); process.exitCode = 1; });
