import { chromium } from "playwright";
import { readFile, rm } from "node:fs/promises";
import { newFile } from "../lib/files.js";
import { validatePublicUrl } from "../capture/security.js";
import { withTimeout } from "../capture/browser.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pngSize(buffer: Buffer) {
  assert(buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", "Not a PNG file");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    // 1. Normal static website rendering.
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      await page.setContent("<!doctype html><main><h1>Static test</h1><p>Rendered by Chromium.</p></main>");
      const png = await page.screenshot({ type: "png" });
      assert(png.length > 1000, "Static website screenshot was unexpectedly small");
      await page.close();
      console.log("CASE OK: normal static website");
    }

    // 2. Live Next.js website.
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        try {
          await page.goto("https://nextjs.org", { waitUntil: "domcontentloaded", timeout: 20_000 });
          ok = await page.evaluate(() => document.documentElement.innerHTML.includes("/_next/"));
        } catch {
          if (attempt === 0) await page.waitForTimeout(800);
        }
      }
      assert(ok, "Live Next.js site did not expose expected /_next/ assets");
      const png = await page.screenshot({ type: "png" });
      assert(png.length > 10_000, "Next.js mobile screenshot was unexpectedly small");
      await page.close();
      console.log("CASE OK: Next.js website");
    }

    // 3. Lazy-loaded image after controlled scrolling.
    {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      const svg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="black"/><text x="20" y="90" fill="white">lazy</text></svg>');
      await page.setContent(`<div style="height:2200px">spacer</div><img id="lazy" loading="lazy" width="320" height="180" src="data:image/svg+xml,${svg}">`);
      await page.evaluate(async () => {
        const max = document.documentElement.scrollHeight;
        for (let y = 0; y < max; y += 500) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
      });
      assert(await page.locator("#lazy").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 320), "Lazy image did not load after scrolling");
      await page.close();
      console.log("CASE OK: lazy images");
    }

    // 4. Google Fonts readiness.
    {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await page.setContent('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet"><div style="font-family:Roboto,sans-serif;font-weight:700;font-size:48px">Font test</div>');
      await Promise.race([
        page.evaluate(() => document.fonts.ready),
        page.waitForTimeout(10_000),
      ]);
      const loaded = await page.evaluate(() => document.fonts.check('700 48px "Roboto"'));
      assert(loaded, "Google Font Roboto was not ready");
      await page.close();
      console.log("CASE OK: Google Fonts");
    }

    // 5. Long full-page capture.
    {
      const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
      await page.setContent('<div style="height:6200px;background:linear-gradient(#111,#eee)">Long page</div>');
      const out = newFile("png");
      await page.screenshot({ path: out.path, fullPage: true, type: "png" });
      const size = pngSize(await readFile(out.path));
      assert(size.width === 900 && size.height >= 6200, `Unexpected full-page dimensions ${size.width}x${size.height}`);
      await rm(out.path, { force: true });
      await page.close();
      console.log("CASE OK: long full-page capture");
    }

    // 6. Responsive mobile website behavior.
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><style>#mode{display:none}@media(max-width:600px){#mode{display:block;width:123px}}</style><div id="mode">mobile</div>');
      const state = await page.locator("#mode").evaluate((el) => ({ display: getComputedStyle(el).display, width: getComputedStyle(el).width }));
      assert(state.display === "block" && state.width === "123px", "Mobile responsive CSS did not activate");
      await page.close();
      console.log("CASE OK: responsive mobile viewport");
    }

    // 7. Invalid/private URLs.
    await validatePublicUrl("file:///etc/passwd").then(() => { throw new Error("file:// unexpectedly allowed"); }, () => undefined);
    await validatePublicUrl("http://127.0.0.1").then(() => { throw new Error("loopback unexpectedly allowed"); }, () => undefined);
    console.log("CASE OK: invalid/private URL rejection");

    // 8. Hard timeout utility.
    let timedOut = false;
    try { await withTimeout(new Promise<void>(() => undefined), 50); } catch { timedOut = true; }
    assert(timedOut, "Capture timeout helper did not abort a stuck task");
    console.log("CASE OK: timeout protection");

    // 9. Animation remains active when requested.
    {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await page.setContent('<style>@keyframes move{from{transform:translateX(0)}to{transform:translateX(200px)}}#box{width:20px;height:20px;background:#fff;animation:move 1s linear infinite}</style><div id="box"></div>');
      const first = await page.locator("#box").evaluate((el) => getComputedStyle(el).transform);
      await page.waitForTimeout(220);
      const second = await page.locator("#box").evaluate((el) => getComputedStyle(el).transform);
      assert(first !== second, "CSS animation did not advance over time");
      await page.close();
      console.log("CASE OK: animations");
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
