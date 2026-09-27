import Fastify from "fastify";
import cors from "@fastify/cors";
import { createReadStream } from "node:fs";
import path from "node:path";
import { screenshotSchema, videoSchema } from "./lib/schemas.js";
import { jobs, queue } from "./lib/jobs.js";
import { cleanupFiles, ensureTemp, FILE_TTL_MS, findFile } from "./lib/files.js";
import { captureScreenshot } from "./capture/screenshot.js";
import { captureVideo } from "./capture/video.js";
import { toPublicError } from "./lib/errors.js";
import { closeBrowser } from "./capture/browser.js";

const app = Fastify({ logger: true, bodyLimit: 64 * 1024 });
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",").map((x) => x.trim());
await app.register(cors, { origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) });
await ensureTemp();

function stage(jobId: string) {
  return (status: string, progress: number, message: string) => jobs.update(jobId, { status: status as never, progress, message });
}

app.get("/health", async () => ({ ok: true, service: "sitecapture-worker", concurrency: Math.max(1, Math.min(2, Number(process.env.CAPTURE_CONCURRENCY || 1))), fourKVideo: process.env.ENABLE_4K_VIDEO === "true" }));

app.post("/api/capture/screenshot", async (request, reply) => {
  const parsed = screenshotSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message || "Invalid capture settings." } });
  const job = jobs.create("screenshot");
  queue.enqueue(async () => {
    try {
      const result = await captureScreenshot(parsed.data, stage(job.id));
      jobs.update(job.id, { status: "ready", progress: 100, message: "Ready", result: { ...result, downloadUrl: `/api/files/${result.fileId}?download=1`, previewUrl: `/api/files/${result.fileId}` } });
    } catch (error) {
      jobs.update(job.id, { status: "error", progress: 100, message: "Capture failed", error: toPublicError(error) });
    }
  });
  return reply.code(202).send({ id: job.id, status: job.status });
});

app.post("/api/capture/video", async (request, reply) => {
  const parsed = videoSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message || "Invalid recording settings." } });
  const job = jobs.create("video");
  queue.enqueue(async () => {
    try {
      const result = await captureVideo(parsed.data, stage(job.id));
      const secondary = result.secondaryFile ? { ...result.secondaryFile, downloadUrl: `/api/files/${result.secondaryFile.fileId}?download=1` } : undefined;
      jobs.update(job.id, { status: "ready", progress: 100, message: "Ready", result: { ...result, secondaryFile: secondary, downloadUrl: `/api/files/${result.fileId}?download=1`, previewUrl: `/api/files/${result.fileId}` } });
    } catch (error) {
      jobs.update(job.id, { status: "error", progress: 100, message: "Recording failed", error: toPublicError(error) });
    }
  });
  return reply.code(202).send({ id: job.id, status: job.status });
});

app.get<{ Params: { id: string } }>("/api/jobs/:id", async (request, reply) => {
  const job = jobs.get(request.params.id);
  if (!job) return reply.code(404).send({ error: { code: "JOB_NOT_FOUND", message: "Capture job was not found or has expired." } });
  return job;
});

app.get<{ Params: { id: string }; Querystring: { download?: string } }>("/api/files/:id", async (request, reply) => {
  const file = await findFile(request.params.id);
  if (!file) return reply.code(404).send({ error: { code: "FILE_NOT_FOUND", message: "Capture file was not found or has expired." } });
  const ext = path.extname(file).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : ext === ".mp4" ? "video/mp4" : "video/webm";
  reply.type(mime);
  reply.header("cache-control", "private, max-age=1800");
  if (request.query.download === "1") reply.header("content-disposition", `attachment; filename="sitecapture-${request.params.id}${ext}"`);
  return reply.send(createReadStream(file));
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error. Please retry." } });
});

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "0.0.0.0";
const cleanup = setInterval(() => { cleanupFiles().catch((error) => app.log.warn(error)); jobs.cleanup(FILE_TTL_MS); }, 5 * 60 * 1000);
cleanup.unref();

for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, async () => { await closeBrowser(); await app.close(); process.exit(0); });

await app.listen({ port, host });
