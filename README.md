# SiteCapture Studio

A working Next.js + Playwright application for native-resolution website screenshots and browser recordings. No paid screenshot API, database, or image upscaling.

## Run with Docker

```sh
git clone https://github.com/kirtaniyasuraj415-debug/sitecapture-studio.git
cd sitecapture-studio
docker compose up --build
```

Open **http://localhost:3000**. A desktop/laptop or Linux server with Docker is needed; Docker does not run directly in an ordinary Android browser. The mobile UI works from a phone when the application is hosted.

The reference Compose setup reserves up to 4 GB for the worker and 768 MB for the web app. Use a Docker host with at least 6 GB available memory. Localhost binding prevents unintended public exposure. The worker has no published host port.

## Architecture

- **Web:** Next.js 16.3.6, React 19.3, TypeScript and Tailwind 4.
- **Worker:** Fastify, Zod, Playwright 1.63 and Chromium in a separate Node process/container.
- **Queue:** concurrency 1, configurable up to 2; four jobs maximum by default. Each active job has its own child process group.
- **Media:** direct Chromium PNG/JPEG; Sharp WebP encoding without resizing; Playwright recorder and FFmpeg H.264/VP9 export.
- **Storage:** temporary files, 30-minute expiry, no database. Downloads stream through the Next.js API with byte-range support.
- **Deployment:** separate web/worker Dockerfiles and `Dockerfile.single` for a combined container. Chromium/FFmpeg never run inside Vercel Functions.

Device definitions live in **`shared/devices.ts`** and are used by both frontend and worker.

```text
app/                 Next.js page, APIs, health route
components/          Responsive capture controls and results
lib/                 Frontend API client and worker proxy
shared/devices.ts    Single source of device presets
worker/src/capture/  Chromium, screenshots, video, network protection, process isolation
worker/src/lib/      Schemas, queue, files, resource budgets
worker/src/tests/    Security/queue tests, deterministic browser fixtures, live captures
scripts/             UI/API verification and single-container launcher
```

## Screenshots

Desktop: 1920×1080, 1440×900, 1366×768. Tablet: 1024×1366, 834×1194. Mobile: 390×844, 430×932, 360×800. Custom sizes are supported.

- DPR 1/2/3; default **2**. A 1920×1080 CSS viewport at DPR 2 produces **3840×2160 actual pixels**.
- PNG default; native JPEG quality 60–100; WebP quality 60–100 (lossless at 100).
- Viewport, full page and selected-height capture. Selected height extends the capture surface **without changing the CSS viewport or `vh` layout**.
- Explicit mobile user agent, touch, and `isMobile` emulation for mobile/tablet presets.
- Bounded DOM/network/font/image waits, controlled lazy-image scrolling, and extra wait of 0/1/2/3/5/10 seconds.
- Dark/light emulation, scrollbar hiding, keep/disable animations, optional common cookie-banner hiding, UA override and transparent PNG/WebP where the page permits it.
- Result dimensions come from the output file. Captures never upscale a smaller bitmap. A scaled-down preview can look less sharp; open/download the original to inspect native pixels.

## Recording

- Static or smooth auto-scroll, 3–30 seconds, slow/normal/fast scroll profiles.
- Selected viewport, desktop 1080p, 1440p, optional 4K.
- MP4 H.264, WebM VP9, or both. No audio recording.
- Recording uses **25 fps**, the Playwright recorder's native rate. It does not fabricate a 60 fps claim. Actual smoothness depends on website complexity and available CPU.
- Recording starts after page preparation; the loading interval is trimmed using the recorder's creation timestamp. An extra stop-frame interval from Playwright is excluded.
- Output dimensions, codec and duration are checked with FFprobe before success.
- Video uses DPR 1 with the actual selected output viewport. H.264 dimensions must be even. No post-capture resolution upscaling.
- Video preparation requests ordinary lazy `<img>` assets eagerly but avoids scrolling the page beforehand, preserving one-time scroll-triggered animations. Sites with custom loaders can still load content during recording.

4K requires `ENABLE_4K_VIDEO=true`, at least 4 GB host/container memory and a sufficient pixel budget. The UI disables it when the worker does not support it. Available memory and disk space are checked before capture; full-page image size is checked again before rendering.

## Reliability and security

Navigation (20s), action (10s), screenshot (75s), video (150s), DNS (5s), FFmpeg and API fetches all have limits. The queue supervisor kills the entire job process group after its deadline, including Chromium and FFmpeg. A crashed job releases its queue slot. The UI stops after repeated connection failures and offers status recovery/retry instead of polling forever.

Only public HTTP(S) destinations on ports 80, 443, 8080 and 8443 are supported. Loopback, private, link-local, multicast, reserved addresses, IPv4 aliases/mappings, IPv6 transition ranges, embedded URL credentials and unsupported protocols are blocked. All DNS answers must be public. Redirects and subresources are revalidated. Chromium is forced through a local egress proxy that connects to a **validated numeric IP**, preventing DNS rebinding between validation and socket connection. WebSockets use the same checks. Service workers and downloads are disabled; page popups are closed.

The proxy enforces a per-job transfer budget and connection limit. There are also request-body, rate, screenshot-pixel, video-pixel, output-file, queue, memory, disk and Docker process limits. Docker runs as `pwuser` with Chromium sandboxing enabled and Playwright's seccomp profile. These controls do not guarantee that a hostile browser exploit is impossible; keep Chromium updated and isolate the capture host from sensitive infrastructure.

Cookie-popup removal is opt-in and best-effort. It hides known banner containers; it does not accept consent. Login-only pages, CAPTCHAs and sites blocking automation are not bypassed. Broken/unfinished images and fonts are reported as loading notes instead of silently being described as complete.

## APIs

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/capture/screenshot` | Validate settings and enqueue screenshot |
| POST | `/api/capture/video` | Validate settings and enqueue recording |
| GET | `/api/jobs/:id` | Job stage, progress, error or output metadata |
| GET | `/api/files/:id` | Inline media; `?download=1` for attachment |
| GET | `/api/capabilities` | Host limits and 4K availability |
| GET | `/health` | Minimal worker availability |

Example:

```json
{"url":"https://example.com","deviceId":"desktop-1920","dpr":2,"screenshotType":"viewport","format":"png","waitSeconds":2}
```

A successful POST returns **202** plus a job ID. Only the terminal `ready` state indicates successful capture. Job IDs and file IDs are random UUIDs. Expired files return 404. Video streaming supports 206 partial responses and 416 invalid-range responses.

## Environment and public access

Copy `.env.example` to `.env` for Compose overrides. Set a strong `SITE_PASSWORD` before publishing. HTTP Basic authentication uses any username and this password; use HTTPS for public access. `CAPTURE_API_KEY` protects the worker, and the web server uses the matching `CAPTURE_WORKER_API_KEY`. Secrets are never sent to the browser.

For a separately hosted frontend, set `CAPTURE_WORKER_URL` to the worker's HTTPS endpoint and `CAPTURE_WORKER_API_KEY` to its key. Previews/downloads stream through the frontend, so no publicly exposed worker file endpoint or internal Docker hostname is leaked. Large video downloads may exceed a frontend serverless provider's transfer/runtime limits; hosting both services in the container avoids that limitation.

For development with Node 22+:

```sh
npm ci
npm --prefix worker ci
cd worker
npx playwright install --with-deps chromium
# Install system FFmpeg as well, then:
npm run dev
```

In another terminal, from the root: `npm run dev`. If the operating system does not permit Chromium sandboxing, configure that host appropriately; `CHROMIUM_NO_SANDBOX=true` is an explicit compatibility option, not the production default. Worker `dev` compiles first and watches emitted JavaScript; rerun `npm run worker:build` after worker TypeScript changes.

## Verification

```sh
npm run lint
npm run build
npm run worker:build
npm test
npm --prefix worker run smoke
bash scripts/test-local.sh
```

- Unit checks cover unsafe addresses/protocols, malformed options and bounded queue recovery.
- `smoke:fixtures` calls the real capture functions against deterministic page fixtures. It verifies native DPR dimensions, decoded image pixels, lazy images, a delayed real Roboto font, full page, viewport-preserving selected height, mobile CSS, JPEG/WebP, redirects, timeout recovery, animations, resource rejection, MP4/WebM duration, and cleanup.
- `smoke:live` captures `example.com`, `nextjs.org`, Google Fonts and a real 1080p video. It requires unrestricted outbound public DNS/HTTP(S).
- UI checks exercise desktop/phone layouts, controls and real worker errors.
- CI builds the production Docker images and captures a real URL through the Next.js API, then checks downloads, seeking, validation and size limits. It uploads media and machine-readable test reports as workflow artifacts.

## Free hosting: checked 28 September 2026

**Do not confuse free UI hosting with a working capture service.** A static frontend without the running worker cannot capture anything.

- Render provides a genuine free Docker web-service plan, but only **512 MB RAM and 0.1 CPU**, with idle sleep/cold starts. The included `render.yaml` explicitly selects that free plan and limits work. This is a constrained experiment, not a reliable host for arbitrary 1080p–4K video. Resource-heavy captures return errors instead of silently reducing quality.
- Hugging Face's current documentation requires a paid plan to create Docker Spaces, despite the CPU Basic hardware rate being listed as free. It is not an unconditional free Docker deployment option.
- Vercel is suitable for the web interface/API proxy with a separately hosted worker. This project does not attempt a Chromium+FFmpeg Vercel Function deployment.
- The full-featured, zero-hosting-fee reference option is local Docker on an existing computer/server. There is no paid screenshot service hidden in the app.

Sources: [Render free services](https://render.com/docs/free), [Render pricing](https://render.com/pricing), [Hugging Face Spaces](https://huggingface.co/docs/hub/spaces-overview), [Playwright Docker security](https://playwright.dev/docs/docker).

For a Render account you control, import this repository as a Blueprint and review `plan: free`. A compatible container runtime with sandbox support is required. If the host blocks sandboxing, do not silently turn it off for untrusted public websites; use a suitably isolated host. No paid upgrade is selected automatically.
