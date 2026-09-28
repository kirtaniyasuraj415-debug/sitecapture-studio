import { rm, stat } from "node:fs/promises";
import sharp from "sharp";
import type { BrowserContext } from "playwright";
import { getBrowser, preparePage, safeClose, secureContext, withTimeout } from "./browser.js";
import { resolveDevice } from "./devices.js";
import { newFile, ensureTemp } from "../lib/files.js";
import { CaptureError } from "../lib/errors.js";
import { checkResources } from "../lib/resources.js";
import { assertEgressBudget } from "./egress-proxy.js";
import type { ScreenshotInput } from "../lib/schemas.js";

export async function captureScreenshot(input: ScreenshotInput, onStage: (status: string, progress: number, message: string) => void) {
  let activeContext: BrowserContext | undefined;
  let cancelled = false;
  const output = newFile(input.format === 'jpeg' ? 'jpg' : input.format);
  let success = false;
  const operation = (async () => {
    const started = Date.now();
    const device = resolveDevice(input);
    const maxPixels = Number(process.env.MAX_SCREENSHOT_PIXELS || 100_000_000);
    const initialPixels = device.width * device.height * input.dpr ** 2;
    if (initialPixels > maxPixels) throw new CaptureError('RESOURCE_LIMIT', 'Requested viewport exceeds the screenshot pixel limit.');
    await ensureTemp();
    await checkResources(initialPixels);
    const browser = await getBrowser();
    try {
      if (cancelled) throw new Error('Capture cancelled');
      activeContext = await browser.newContext({
        viewport: { width: device.width, height: device.height }, deviceScaleFactor: input.dpr,
        isMobile: device.isMobile, hasTouch: device.hasTouch, userAgent: input.userAgent || device.userAgent,
        colorScheme: input.colorScheme, reducedMotion: input.keepAnimations ? 'no-preference' : 'reduce',
        serviceWorkers: 'block', acceptDownloads: false,
      });
      await secureContext(activeContext);
      const page = await activeContext.newPage();
      const warnings = await preparePage(page, input.url, input, onStage);
      onStage('capturing', 76, 'Capturing native browser pixels');
      let cssHeight = device.height;
      if (input.screenshotType === 'fullPage') cssHeight = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0));
      if (input.screenshotType === 'selectedHeight') {
        cssHeight = input.selectedHeight!;
        // Extend the capture surface without changing viewport/vh/responsive layout.
        await page.addStyleTag({ content: `html{min-height:${cssHeight}px!important}` });
      }
      const pixels = device.width * cssHeight * input.dpr ** 2;
      if (pixels > maxPixels || cssHeight * input.dpr > 32760) throw new CaptureError('RESOURCE_LIMIT', 'Requested screenshot is too large. Reduce DPR or capture height.');
      await checkResources(pixels);
      const buffer = await page.screenshot({
        type: input.format === 'jpeg' ? 'jpeg' : 'png',
        ...(input.format === 'jpeg' ? { quality: input.quality } : { omitBackground: input.transparentBackground }),
        animations: input.keepAnimations ? 'allow' : 'disabled', scale: 'device',
        fullPage: input.screenshotType !== 'viewport',
        // Keep requested width even when a website has accidental horizontal overflow.
        clip: { x: 0, y: 0, width: device.width, height: cssHeight }, timeout: 20_000,
      });
      if (cancelled) throw new Error('Capture cancelled');
      assertEgressBudget();
      onStage('processing', 90, `Finalizing ${input.format.toUpperCase()}`);
      if (input.format === 'webp') await sharp(buffer).webp({ quality: input.quality, lossless: input.quality === 100 }).toFile(output.path);
      else { const { writeFile } = await import('node:fs/promises'); await writeFile(output.path, buffer); }
      const info = await stat(output.path);
      if (info.size > Number(process.env.MAX_OUTPUT_FILE_BYTES || 120 * 1024 * 1024)) throw new CaptureError('RESOURCE_LIMIT', 'Image exceeded the output file-size limit.');
      const metadata = await sharp(output.path).metadata();
      const width = metadata.width!, height = metadata.height!;
      if (width !== device.width * input.dpr || height !== cssHeight * input.dpr) throw new CaptureError('DIMENSION_MISMATCH', 'Website did not render at the requested dimensions. Try a desktop preset or a shorter capture.');
      success = !cancelled;
      return { fileId: output.id, fileName: `sitecapture-${device.id}.${input.format === 'jpeg' ? 'jpg' : input.format}`, format: input.format,
        width, height, fileSize: info.size, captureTimeMs: Date.now() - started, sourceUrl: input.url, finalUrl: page.url(),
        deviceLabel: device.label, dpr: input.dpr, warnings };
    } finally {
      await safeClose(activeContext);
      activeContext = undefined;
      if (!success || cancelled) await rm(output.path, { force: true }).catch(() => undefined);
    }
  })();
  return withTimeout(operation, Number(process.env.CAPTURE_TIMEOUT_MS || 75_000), () => { cancelled = true; return safeClose(activeContext); });
}
