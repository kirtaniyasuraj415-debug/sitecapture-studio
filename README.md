# SiteCapture Studio

Personal website-capture studio for sharp screenshots and smooth website showcase recordings using **real Chromium rendering**. No paid screenshot API and no post-capture resolution upscaling.

## Architecture

- **Web:** Next.js 16.3.6 + TypeScript + Tailwind CSS
- **Capture worker:** Fastify + Playwright Chromium
- **Video processing:** FFmpeg (MP4 H.264 + WebM)
- **Queue:** in-memory, concurrency 1–2
- **Storage:** temporary local files, default TTL 30 minutes
- **Security:** public HTTP(S) only, DNS/IP SSRF checks, redirect/fetch interception, size/time/resource limits

The web app proxies capture/job APIs to the worker. The worker owns Chromium and FFmpeg so the frontend can live on Vercel while the worker runs as a Docker service.

## Run locally

```bash
docker compose up --build
```

Open `http://localhost:3000`.

For non-Docker development, run the web app and worker separately and install Playwright Chromium in the worker.

## APIs

- `POST /api/capture/screenshot`
- `POST /api/capture/video`
- `GET /api/jobs/:id`
- `GET /api/files/:id`

All capture inputs are validated with Zod.

## Screenshot quality

A 1920×1080 viewport at DPR 2 is rendered as a real 3840×2160 physical screenshot. The app never captures at a smaller viewport and stretches the file afterward.

Page readiness includes DOMContentLoaded, bounded network-idle waiting, `document.fonts.ready`, image completion, controlled lazy-load scrolling, then an optional extra wait.

## Video behavior

Playwright records the real browser context. The page-loading portion is trimmed from the final output with FFmpeg. Auto-scroll uses animation frames and an eased top-to-bottom motion so scroll-triggered effects can run naturally.

## Free hosting reality

The frontend is suitable for Vercel. The worker needs a real Docker/container runtime with Chromium + FFmpeg. A free 512 MB container can be useful for basic screenshots but is not enough to promise reliable 1440p/4K recording. `render.yaml` intentionally caps free-host video pixels to 1080p and disables 4K.

For the fully capable version, local Docker is the zero-cost reference environment. Later, move the same worker container to a larger VM/container without changing the frontend API contract.

## Environment

Web:

```env
CAPTURE_WORKER_URL=http://localhost:8787
NEXT_PUBLIC_CAPTURE_WORKER_URL=http://localhost:8787
```

Worker: see `worker/.env.example`.

## Tests

Worker unit tests cover SSRF/private-range blocking and capture input validation. CI builds the Next.js app and worker, then runs tests.
