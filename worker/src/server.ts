import Fastify from 'fastify';
import cors from '@fastify/cors';
import { timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { screenshotSchema, videoSchema } from './lib/schemas.js';
import { jobs, queue } from './lib/jobs.js';
import { cleanupFiles, ensureTemp, FILE_TTL_MS, findFile } from './lib/files.js';
import { runCapture, stopCaptures } from './capture/runner.js';
import { toPublicError } from './lib/errors.js';
import { capabilities } from './lib/resources.js';

const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.x-sitecapture-key'] }, bodyLimit: 16 * 1024, requestTimeout: 20_000, connectionTimeout: 30_000 });
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim());
await app.register(cors, { origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)) });
await ensureTemp();
await cleanupFiles();
const limits = new Map<string, {count: number; until: number}>();
const uuid = z.string().uuid();
const fail = (code: string, message: string) => ({ error: {code,message} });

app.addHook('onRequest', async (request, reply) => {
  reply.header('x-content-type-options', 'nosniff');
  reply.header('cache-control', 'no-store');
  if (!request.url.startsWith('/api/')) return;
  const expected = process.env.CAPTURE_API_KEY;
  const received = String(request.headers['x-sitecapture-key'] || '');
  if (expected && (Buffer.byteLength(received) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(received), Buffer.from(expected)))) return reply.code(401).send(fail('UNAUTHORIZED', 'Capture worker authorization failed.'));
  if (request.method === 'POST') {
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) return reply.code(403).send(fail('BAD_ORIGIN', 'This origin cannot create captures.'));
    const now = Date.now();
    const current = limits.get(request.ip);
    const entry = current && current.until > now ? current : {count:0, until:now + 300_000};
    if (++entry.count > 30) return reply.header('retry-after', '300').code(429).send(fail('RATE_LIMIT', 'Too many capture requests. Wait a few minutes.'));
    limits.set(request.ip, entry);
  }
});
app.get('/health', async () => ({ok:true, service:'sitecapture-worker'}));
app.get('/api/capabilities', async () => ({...await capabilities(), queue:queue.stats()}));

for (const kind of ['screenshot', 'video'] as const) {
  app.post(`/api/capture/${kind}`, async (request, reply) => {
    const parsed = (kind === 'screenshot' ? screenshotSchema : videoSchema).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(fail('INVALID_INPUT', parsed.error.issues[0]?.message || 'Invalid capture settings.'));
    const job = jobs.create(kind);
    const accepted = queue.enqueue(async () => {
      try {
        const result = await runCapture(kind, parsed.data, (status, progress, message) => {
          if (jobs.get(job.id)?.status !== 'error') jobs.update(job.id, {status:status as never, progress,message});
        });
        const secondary = result.secondaryFile as {fileId:string} | undefined;
        if (secondary) result.secondaryFile = {...secondary, downloadUrl:`/api/files/${secondary.fileId}?download=1`};
        jobs.update(job.id, {status:'ready',progress:100,message:'Ready', result:{...result, expiresAt: new Date(Date.now() + FILE_TTL_MS).toISOString(), downloadUrl:`/api/files/${result.fileId}?download=1`, previewUrl:`/api/files/${result.fileId}`}});
      } catch (error) { jobs.update(job.id, {status:'error',progress:100,message:'Capture failed',error:toPublicError(error)}); }
    });
    if (!accepted) { jobs.remove(job.id); return reply.header('retry-after','10').code(429).send(fail('QUEUE_FULL','Capture queue is full. Try again in a moment.')); }
    return reply.code(202).send({id:job.id,status:job.status});
  });
}

app.get<{Params:{id:string}}>('/api/jobs/:id', async (request, reply) => {
  if (!uuid.safeParse(request.params.id).success) return reply.code(400).send(fail('INVALID_ID','Invalid job ID.'));
  const job = jobs.get(request.params.id);
  if (!job) return reply.code(404).send(fail('JOB_NOT_FOUND','Capture job was not found or has expired.'));
  return {...job, queue:queue.stats()};
});

app.get<{Params:{id:string};Querystring:{download?:string}}>('/api/files/:id', async (request, reply) => {
  if (!uuid.safeParse(request.params.id).success) return reply.code(400).send(fail('INVALID_ID','Invalid file ID.'));
  const file = await findFile(request.params.id);
  if (!file) return reply.code(404).send(fail('FILE_NOT_FOUND','Capture file was not found or has expired.'));
  const info = await stat(file);
  const ext = path.extname(file);
  const mime = ({'.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm'} as Record<string,string>)[ext];
  if (!mime) return reply.code(404).send(fail('FILE_NOT_FOUND','Unknown capture format.'));
  reply.type(mime).header('accept-ranges','bytes');
  if (request.query.download === '1') reply.header('content-disposition', `attachment; filename="sitecapture-${request.params.id}${ext}"`);
  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || !match[1] && !match[2]) return reply.code(416).header('content-range',`bytes */${info.size}`).send();
    const start = match[1] ? Number(match[1]) : Math.max(0,info.size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]),info.size-1) : info.size-1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) return reply.code(416).header('content-range',`bytes */${info.size}`).send();
    reply.code(206).header('content-range',`bytes ${start}-${end}/${info.size}`).header('content-length',end-start+1);
    return reply.send(createReadStream(file,{start,end}));
  }
  reply.header('content-length',info.size);
  return reply.send(createReadStream(file));
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  const status = (error as {statusCode?:number}).statusCode;
  return reply.code(status && status < 500 ? status : 500).send(fail('REQUEST_FAILED', status === 413 ? 'Capture request is too large.' : status === 400 ? 'Invalid JSON request.' : 'Unexpected server error. Please retry.'));
});
const cleanup = setInterval(() => {
  void cleanupFiles().catch((error) => app.log.warn(error)); jobs.cleanup(FILE_TTL_MS);
  for (const [key,value] of limits) if (value.until < Date.now()) limits.delete(key);
}, 60_000); cleanup.unref();
for (const signal of ['SIGTERM','SIGINT'] as const) process.once(signal, async () => {
  clearInterval(cleanup); stopCaptures(); await app.close(); process.exit(0);
});
await app.listen({port:Number(process.env.PORT || 8787),host:process.env.HOST || '0.0.0.0'});
