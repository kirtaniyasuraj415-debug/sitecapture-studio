import { stat } from "node:fs/promises";
import { getBrowser, preparePage, safeClose, withTimeout } from "./browser.js";
import { resolveDevice } from "./devices.js";
import { newFile } from "../lib/files.js";
import { CaptureError } from "../lib/errors.js";
import { runProcess } from "./process.js";
import type { ScreenshotInput } from "../lib/schemas.js";

export async function captureScreenshot(input: ScreenshotInput, onStage: (status: string, progress: number, message: string) => void) {
  return withTimeout((async () => {
    const started = Date.now();
    const device = resolveDevice(input);
    const browser = await getBrowser();
    let context;
    const png = newFile("png");
    try {
      context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        deviceScaleFactor: input.dpr,
        isMobile: device.isMobile,
        hasTouch: device.hasTouch,
        userAgent: input.userAgent || device.userAgent,
        colorScheme: input.colorScheme,
        reducedMotion: input.keepAnimations ? "no-preference" : "reduce",
        serviceWorkers: "block",
        acceptDownloads: false,
      });
      const page = await context.newPage();
      await preparePage(page, input.url, input, onStage);
      onStage("capturing", 76, "Capturing crisp browser pixels");

      let cssHeight = device.height;
      const screenshotOptions: Parameters<typeof page.screenshot>[0] = { path: png.path, type: "png", omitBackground: input.transparentBackground, animations: input.keepAnimations ? "allow" : "disabled" };
      if (input.screenshotType === "fullPage") {
        screenshotOptions.fullPage = true;
        cssHeight = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0));
      } else if (input.screenshotType === "selectedHeight") {
        cssHeight = input.selectedHeight || device.height;
        await page.addStyleTag({ content: `html,body{min-height:${cssHeight}px!important}` });
        await page.setViewportSize({ width: device.width, height: cssHeight });
      }
      const physicalPixels = device.width * cssHeight * input.dpr * input.dpr;
      const maxPixels = Number(process.env.MAX_SCREENSHOT_PIXELS || 100_000_000);
      if (physicalPixels > maxPixels) throw new CaptureError("RESOURCE_LIMIT", "Requested screenshot is too large for this server. Reduce DPR or capture height.");
      await page.screenshot(screenshotOptions);

      onStage("processing", 88, input.format === "png" ? "Finalizing PNG" : `Encoding ${input.format.toUpperCase()}`);
      let output = png;
      if (input.format !== "png") {
        output = newFile(input.format === "jpeg" ? "jpg" : "webp");
        const codecArgs = input.format === "jpeg"
          ? ["-y", "-i", png.path, "-q:v", String(Math.max(2, Math.round((100 - input.quality) / 3) + 2)), output.path]
          : ["-y", "-i", png.path, "-c:v", "libwebp", "-quality", String(input.quality), output.path];
        await runProcess("ffmpeg", codecArgs, 30_000);
      }
      const info = await stat(output.path);
      return {
        fileId: output.id,
        fileName: `sitecapture-${device.id}-${Date.now()}.${input.format === "jpeg" ? "jpg" : input.format}`,
        format: input.format,
        width: device.width * input.dpr,
        height: Math.max(1, Math.round(cssHeight * input.dpr)),
        fileSize: info.size,
        captureTimeMs: Date.now() - started,
        sourceUrl: input.url,
        finalUrl: page.url(),
        deviceLabel: device.label,
        dpr: input.dpr,
      };
    } finally { await safeClose(context); }
  })(), Number(process.env.CAPTURE_TIMEOUT_MS || 60_000));
}
