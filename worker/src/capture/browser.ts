import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { validatePublicUrl } from "./security.js";
import { getEgressProxy, closeEgressProxy } from "./egress-proxy.js";
import type { ScreenshotInput, VideoInput } from "../lib/schemas.js";
import { CaptureError } from "../lib/errors.js";

let browserPromise: Promise<Browser> | null = null;

export function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const proxy = await getEgressProxy();
      const browser = await chromium.launch({
        headless: true,
        proxy: { server: proxy.url, bypass: "" },
        args: [
          "--disable-dev-shm-usage",
          "--disable-background-networking",
          "--disable-quic",
          "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
          "--proxy-bypass-list=<-loopback>",
          ...(process.env.CHROMIUM_NO_SANDBOX === "false" ? [] : ["--no-sandbox"]),
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
  if (response && response.status() >= 400) throw new CaptureError("HTTP_ERROR", `Website returned HTTP ${response.status()}.`);
  await validatePublicUrl(page.url());

  onStage("loading", 30, "Loading page resources");
  await page.waitForLoadState("networkidle", { timeout: 7_000 }).catch(() => undefined);

  onStage("loading", 42, "Loading fonts and images");
  await page.evaluate(async () => { await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 7000))]); });
  await waitForImages(page);

  onStage("rendering", 55, "Triggering lazy-loaded content");
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const max = Math.min(document.documentElement.scrollHeight, 120000);
    const step = Math.max(window.innerHeight * 0.8, 400);
    let count = 0;
    for (let y = 0; y < max && count < 40; y += step, count++) { window.scrollTo(0, y); await sleep(70); }
    window.scrollTo(0, 0);
    await sleep(160);
  });
  await waitForImages(page, 5000);
  await page.evaluate(async () => { await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 5000))]); });
  await enforcePageBudget(page, observedNetworkBytes);

  if (input.hideScrollbars) await page.addStyleTag({ content: "html,body,*{scrollbar-width:none!important}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}" });
  if (!input.keepAnimations) await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
  if (input.removeCookiePopup) {
    await page.addStyleTag({ content: `[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[aria-label*="cookie" i],.cc-window,.cookie-banner,.cookie-notice{display:none!important;visibility:hidden!important}` });
  }

  if (input.waitSeconds > 0) {
    onStage("rendering", 65, `Waiting ${input.waitSeconds}s for final render`);
    await page.waitForTimeout(input.waitSeconds * 1000);
  }
  await validatePublicUrl(page.url());
  await page.evaluate(() => window.scrollTo(0, 0));
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
  await context.close().catch(() => undefined);
}
