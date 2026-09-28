import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { validatePublicUrl } from "./security.js";
import { getEgressProxy, closeEgressProxy, assertEgressBudget } from "./egress-proxy.js";
import type { ScreenshotInput, VideoInput } from "../lib/schemas.js";
import { CaptureError } from "../lib/errors.js";

let browserPromise: Promise<Browser> | null = null;

export function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const proxy = await getEgressProxy();
      const browser = await chromium.launch({
        headless: true,
        timeout: 15_000,
        chromiumSandbox: process.env.CHROMIUM_NO_SANDBOX !== "true",
        ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
        proxy: { server: proxy.url, bypass: "" },
        args: [
          "--disable-dev-shm-usage",
          "--disable-background-networking",
          "--disable-quic",
          "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
          "--proxy-bypass-list=<-loopback>",
          ...(process.env.CHROMIUM_NO_SANDBOX === "true" ? ["--no-sandbox"] : []),
        ],
      });
      browser.on("disconnected", () => { browserPromise = null; });
      return browser;
    })().catch((error) => { browserPromise = null; throw error; });
  }
  return browserPromise;
}

export async function closeBrowser() {
  const current = browserPromise;
  browserPromise = null;
  if (current) await (await current).close().catch(() => undefined);
  await closeEgressProxy().catch(() => undefined);
}

export async function secureContext(context: BrowserContext) {
  await context.route("**/*", async (route) => {
    const raw = route.request().url();
    if (raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("about:")) return route.continue();
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return route.abort("blockedbyclient");
      await validatePublicUrl(raw);
      return route.continue();
    } catch {
      return route.abort("blockedbyclient");
    }
  });
  await context.routeWebSocket("**/*", async (socket) => {
    try {
      const raw = socket.url();
      const parsed = new URL(raw);
      if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") throw new Error("Unsupported socket protocol");
      parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
      await validatePublicUrl(parsed.toString());
      socket.connectToServer();
    } catch {
      await socket.close({ code: 1008, reason: "Blocked by SiteCapture SSRF policy" });
    }
  });
}

async function waitForImages(page: Page, timeoutMs = 7000) {
  await page.evaluate(async (timeout) => {
    const images = Array.from(document.images).slice(0, 1000);
    await Promise.race([
      Promise.all(images.map((img) => img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      }))),
      new Promise((resolve) => setTimeout(resolve, timeout)),
    ]);
  }, timeoutMs);
}

async function enforcePageBudget(page: Page, observedNetworkBytes = 0) {
  const maxBytes = Number(process.env.MAX_PAGE_TRANSFER_BYTES || 100 * 1024 * 1024);
  const summary = await page.evaluate(() => {
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    return {
      transferred: resources.reduce((sum, item) => sum + (item.transferSize || 0), 0),
      htmlChars: document.documentElement?.outerHTML.length || 0,
    };
  });
  if (Math.max(summary.transferred, observedNetworkBytes) > maxBytes || summary.htmlChars * 2 > maxBytes) {
    throw new CaptureError("RESOURCE_LIMIT", "Website exceeded this server's page-size limit.");
  }
}

export async function preparePage(page: Page, url: string, input: ScreenshotInput | VideoInput, onStage: (status: string, progress: number, message: string) => void) {
  const warnings: string[] = [];
  await validatePublicUrl(url);
  page.setDefaultNavigationTimeout(Number(process.env.NAVIGATION_TIMEOUT_MS || 20_000));
  page.setDefaultTimeout(Number(process.env.ACTION_TIMEOUT_MS || 10_000));
  page.on("popup", (popup) => { void popup.close().catch(() => undefined); });
  let observedNetworkBytes = 0;
  page.on("requestfinished", (request) => {
    void request.sizes().then((sizes) => {
      observedNetworkBytes += Math.max(0, sizes.responseBodySize) + Math.max(0, sizes.responseHeadersSize);
    }).catch(() => undefined);
  });

  onStage("opening", 15, "Opening website");
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: Number(process.env.NAVIGATION_TIMEOUT_MS || 20_000) });
  if (response && [401,403,429].includes(response.status())) throw new CaptureError("ACCESS_BLOCKED", "Website blocked automated access or requires sign-in.");
  if (response && response.status() >= 400) throw new CaptureError("HTTP_ERROR", `Website returned HTTP ${response.status()}.`);
  await validatePublicUrl(page.url());

  onStage("loading", 30, "Loading page resources");
  await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => { warnings.push("Some background requests remained active; capture used a bounded loading wait."); });

  onStage("loading", 42, "Loading fonts");
  await page.evaluate(async () => { await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 7000))]); });
  await waitForImages(page);

  onStage("rendering", 55, "Triggering lazy-loaded content");
  if ("recordingMode" in input) {
    await page.evaluate(() => { for (const img of Array.from(document.images)) img.loading = "eager"; });
  } else await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const max = Math.min(document.documentElement.scrollHeight, 30000);
    const style = document.createElement("style"); style.textContent = "html{scroll-behavior:auto!important;scroll-snap-type:none!important}"; document.head.append(style);
    const step = Math.max(window.innerHeight * 0.8, 400);
    let count = 0;
    for (let y = 0; y < max && count < 40; y += step, count++) { window.scrollTo(0, y); await sleep(100); }
    window.scrollTo(0, 0);
    await sleep(200);
    style.remove();
  });
  await waitForImages(page, 5000);
  await page.evaluate(async () => { await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 5000))]); });
  await enforcePageBudget(page, observedNetworkBytes);
  assertEgressBudget();

  if (input.hideScrollbars) await page.addStyleTag({ content: "html,body,*{scrollbar-width:none!important}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}" });
  if (!input.keepAnimations) await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
  if (input.removeCookiePopup) {
    await page.addStyleTag({ content: `#onetrust-banner-sdk,#onetrust-consent-sdk,#CybotCookiebotDialog,#CybotCookiebotDialogBodyUnderlay,.cc-window,.cookie-banner,.cookie-notice,[role="dialog"][aria-label*="cookie" i]{display:none!important;visibility:hidden!important}` });
  }

  if (input.waitSeconds > 0) {
    onStage("rendering", 65, `Waiting ${input.waitSeconds}s for final render`);
    await page.waitForTimeout(input.waitSeconds * 1000);
  }
  // Unused @font-face declarations stay unloaded by design; only failed/pending faces need a warning.
  const readiness = await page.evaluate(() => ({
    failedImages: Array.from(document.images).filter((img) => !img.complete || !img.naturalWidth).length,
    missingFonts: Array.from(document.fonts).filter((font) => font.status === 'loading' || font.status === 'error').length,
    height: document.documentElement.scrollHeight,
  }));
  if (readiness.failedImages) warnings.push(`${readiness.failedImages} image(s) could not finish loading.`);
  if (readiness.missingFonts) warnings.push(`${readiness.missingFonts} font face(s) are not loaded; the site may use a fallback.`);
  if (readiness.height > 30000) warnings.push('Lazy loading was limited to the first 30,000 CSS pixels.');

  await enforcePageBudget(page, observedNetworkBytes);
  assertEgressBudget();
  await validatePublicUrl(page.url());
  await page.evaluate(() => window.scrollTo({top:0,left:0,behavior:"instant"}));
  return warnings;
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void | Promise<void>) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          void Promise.resolve(onTimeout?.()).catch(() => undefined);
          reject(new CaptureError("CAPTURE_TIMEOUT", "Capture exceeded its maximum processing time."));
        }, ms);
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function safeClose(context?: BrowserContext) {
  if (!context) return;
  await Promise.race([context.close().catch(() => undefined), new Promise<void>((resolve) => { const t = setTimeout(resolve, 5000); t.unref(); })]);
}
