import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { validatePublicUrl } from "./security.js";
import type { ScreenshotInput, VideoInput } from "../lib/schemas.js";
import { CaptureError } from "../lib/errors.js";

let browserPromise: Promise<Browser> | null = null;

export function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking"],
    }).catch((error) => { browserPromise = null; throw error; });
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (!browserPromise) return;
  try { (await browserPromise).close(); } finally { browserPromise = null; }
}

export async function securePage(page: Page) {
  const hostCache = new Map<string, boolean>();
  await page.route("**/*", async (route) => {
    const raw = route.request().url();
    if (raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("about:")) return route.continue();
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return route.abort("blockedbyclient");
      const key = `${parsed.protocol}//${parsed.hostname}`;
      if (!hostCache.has(key)) { await validatePublicUrl(raw); hostCache.set(key, true); }
      return route.continue();
    } catch {
      return route.abort("blockedbyclient");
    }
  });
}

export async function preparePage(page: Page, url: string, input: ScreenshotInput | VideoInput, onStage: (status: string, progress: number, message: string) => void) {
  await validatePublicUrl(url);
  await securePage(page);
  page.setDefaultNavigationTimeout(Number(process.env.NAVIGATION_TIMEOUT_MS || 20_000));
  page.setDefaultTimeout(Number(process.env.ACTION_TIMEOUT_MS || 10_000));

  onStage("opening", 15, "Opening website");
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: Number(process.env.NAVIGATION_TIMEOUT_MS || 20_000) });
  if (response && response.status() >= 400) throw new CaptureError("HTTP_ERROR", `Website returned HTTP ${response.status()}.`);

  await validatePublicUrl(page.url());
  onStage("loading", 30, "Loading page resources");
  await page.waitForLoadState("networkidle", { timeout: 7_000 }).catch(() => undefined);

  onStage("loading", 42, "Loading fonts and images");
  await page.evaluate(async () => {
    await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 7000))]);
    const images = Array.from(document.images).slice(0, 500);
    await Promise.race([
      Promise.all(images.map((img) => img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      }))),
      new Promise((resolve) => setTimeout(resolve, 7000)),
    ]);
  });

  onStage("rendering", 55, "Triggering lazy-loaded content");
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const max = Math.min(document.documentElement.scrollHeight, 100000);
    const step = Math.max(window.innerHeight * 0.8, 400);
    let count = 0;
    for (let y = 0; y < max && count < 20; y += step, count++) { window.scrollTo(0, y); await sleep(90); }
    window.scrollTo(0, 0);
    await sleep(150);
  });

  if (input.hideScrollbars) await page.addStyleTag({ content: "html,body,*{scrollbar-width:none!important}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}" });
  if (!input.keepAnimations) await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
  if (input.removeCookiePopup) {
    await page.addStyleTag({ content: `[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[aria-label*="cookie" i],.cc-window,.cookie-banner,.cookie-notice{display:none!important;visibility:hidden!important}` });
  }

  if (input.waitSeconds > 0) {
    onStage("rendering", 65, `Waiting ${input.waitSeconds}s for final render`);
    await page.waitForTimeout(input.waitSeconds * 1000);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

export async function withTimeout<T>(promise: Promise<T>, ms: number) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new CaptureError("CAPTURE_TIMEOUT", "Capture exceeded its maximum processing time.")), ms); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function safeClose(context?: BrowserContext) {
  if (!context) return;
  await context.close().catch(() => undefined);
}
