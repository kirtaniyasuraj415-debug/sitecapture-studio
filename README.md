# SiteCapture Studio

A personal website-capture studio for **real Chromium-rendered screenshots** and **website showcase recordings**. It does not use ScreenshotOne, Browserless, Urlbox, or any paid screenshot API, and it never creates “4K” output by stretching a smaller screenshot.

## Architecture

- **Web UI/API proxy:** Next.js 16.3.6, React 19.3, TypeScript, Tailwind CSS 4
- **Capture worker:** Node.js + Fastify + Playwright 1.63 / Chromium
- **Video processing:** FFmpeg, H.264 MP4 and WebM
- **Queue:** bounded in-memory queue, default concurrency 1
- **Storage:** temporary files only, default TTL 30 minutes
- **Network security:** application URL validation plus a local egress proxy that resolves destinations itself and blocks loopback, link-local, private/reserved IP ranges, unsafe protocols, redirects to private networks, and WebSocket/private-network bypasses

The Next.js app proxies job creation/status requests to the worker. The worker owns Chromium and FFmpeg, so it can run in Docker separately from a Vercel frontend.

## Screenshot quality

For a 1920×1080 viewport at DPR 2, Chromium really renders the page with `deviceScaleFactor: 2`, producing approximately **3840×2160 physical pixels**. The app never captures at 1366px and upscales afterward.

Before capture it performs bounded waits for:

1. DOMContentLoaded
2. network idle (best effort, timed)
3. `document.fonts.ready`
4. image completion
5. controlled scrolling for lazy-loaded content
6. another image/font readiness pass
7. optional 0/1/2/3/5/10 second final wait

Screenshot modes: viewport, full page, selected height. Formats: PNG, JPEG, WebP. PNG is the default.

## Video recording

Video mode uses the Playwright browser context recorder, then trims the page-loading portion and produces the requested output with FFmpeg.

- Static recording
- Smooth auto-scroll recording
- Slow / Normal / Fast scroll profiles
- Presets: selected device, 1080p, 1440p, optional 4K
- Duration: preset buttons plus any custom value from 3–30 seconds
- MP4 H.264, WebM, or both

4K must be explicitly enabled with `ENABLE_4K_VIDEO=true` and is still subject to the configured render-pixel limit.

## Reliability and limits

Every job has bounded navigation/action/capture/video/process timeouts. Chromium contexts and raw video directories are cleaned up after jobs. FFmpeg is killed when a job is cancelled/times out. Output files expire automatically. The worker also enforces:

- bounded queue length
- screenshot physical-pixel cap
- video render-pixel cap
- approximate page-transfer/DOM size cap
- output file-size cap
- browser/context cleanup after errors

User-facing errors do not expose stack traces.

## SSRF/security model

Only `http://` and `https://` input URLs are accepted. Embedded URL credentials are rejected. Hostnames are DNS-resolved and all returned addresses must be public. The worker blocks common private/reserved IPv4 and IPv6 ranges.

Chromium traffic is additionally forced through a local HTTP CONNECT egress proxy (`--proxy-bypass-list=<-loopback>`), so redirect chains and HTTPS/WebSocket connections are validated before the worker opens the outbound socket. Service workers are disabled for capture contexts and Playwright request/WebSocket routing provides a second application-level check.

For a publicly reachable worker, set `CAPTURE_API_KEY` and set the same secret as `CAPTURE_WORKER_API_KEY` on the Next.js frontend. File URLs use random UUIDs and expire with the temp-file TTL.

## Run locally — one command

Requirements: Docker + Docker Compose.

```bash
docker compose up --build
```

Open:

```text
http://localhost:3000
```

Local Docker is the reference setup for the fully capable version because it gives Chromium and FFmpeg a real container runtime.

## APIs

- `POST /api/capture/screenshot`
- `POST /api/capture/video`
- `GET /api/jobs/:id`
- `GET /api/files/:id`

Capture payloads are validated with Zod in the worker.

## Environment

Frontend (`.env.local`):

```env
CAPTURE_WORKER_URL=http://localhost:8787
CAPTURE_PUBLIC_WORKER_URL=http://localhost:8787
CAPTURE_WORKER_API_KEY=
```

Worker: copy `worker/.env.example`.

## Tests

The repository includes unit/integration coverage for:

1. normal static page rendering
2. live Next.js website
3. lazy-loaded images
4. Google Fonts readiness
5. long full-page screenshot
6. mobile responsive behavior
7. invalid/private URL rejection
8. hard timeout behavior
9. active CSS animations
10. actual `https://example.com` DPR-2 PNG capture validation
11. actual short MP4 capture + `ffprobe` validation

CI builds the Next.js frontend, compiles the worker, runs unit tests, installs Chromium/FFmpeg, and runs the smoke suite.

## Free deployment reality

### Frontend

Vercel is a good fit for the Next.js UI/API proxy.

### Capture worker

`render.yaml` is included for a **Render Free** Docker web service. The free instance is only 0.1 CPU / 512 MB RAM and spins down when idle, so the free configuration intentionally limits video to roughly 1080p-class render pixels and disables 4K. Basic screenshots are the realistic target. Smooth 1080p video may be slow or may hit memory limits on a 512 MB host.

The free worker filesystem is ephemeral, which is acceptable here because captures are intentionally temporary.

For reliable 1440p/4K video, move the unchanged worker container to a larger VM/container plan. No frontend API redesign is required.

## Deployment variables

When deploying the worker publicly, create a strong random `CAPTURE_API_KEY`. Configure the Vercel project with:

```env
CAPTURE_WORKER_URL=https://YOUR-WORKER.onrender.com
CAPTURE_PUBLIC_WORKER_URL=https://YOUR-WORKER.onrender.com
CAPTURE_WORKER_API_KEY=THE_SAME_SECRET
```

The Render Blueprint asks for the worker-side `CAPTURE_API_KEY` without storing the secret in Git.
