import { randomUUID } from "node:crypto";

export type JobStatus = "queued" | "opening" | "loading" | "rendering" | "capturing" | "processing" | "ready" | "error";
export type CaptureJob = {
  id: string;
  type: "screenshot" | "video";
  status: JobStatus;
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  result?: Record<string, unknown>;
  error?: { code: string; message: string };
};

export class JobStore {
  private jobs = new Map<string, CaptureJob>();
  create(type: CaptureJob["type"]) {
    const now = new Date().toISOString();
    const job: CaptureJob = { id: randomUUID(), type, status: "queued", progress: 3, message: "Queued", createdAt: now, updatedAt: now };
    this.jobs.set(job.id, job);
    return job;
  }
  get(id: string) { return this.jobs.get(id); }
  remove(id: string) { this.jobs.delete(id); }
  update(id: string, patch: Partial<CaptureJob>) {
    const job = this.jobs.get(id); if (!job) return;
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  }
  cleanup(maxAgeMs: number) {
    const cutoff = Date.now() - maxAgeMs;
    for (const [id, job] of this.jobs) if (new Date(job.createdAt).getTime() < cutoff) this.jobs.delete(id);
  }
}

export class JobQueue {
  private pending: Array<() => Promise<void>> = [];
  private active = 0;
  private maxQueued: number;
  constructor(private concurrency = 1, maxQueued = 20) { this.maxQueued = Math.max(concurrency, maxQueued); }
  enqueue(task: () => Promise<void>) {
    if (this.pending.length + this.active >= this.maxQueued) return false;
    this.pending.push(task);
    this.drain();
    return true;
  }
  stats() { return { active: this.active, queued: this.pending.length, capacity: this.maxQueued }; }
  private drain() {
    while (this.active < this.concurrency && this.pending.length) {
      const task = this.pending.shift()!;
      this.active++;
      task().catch(() => undefined).finally(() => { this.active--; this.drain(); });
    }
  }
}

export const jobs = new JobStore();
const concurrency = Math.max(1, Math.min(2, Number(process.env.CAPTURE_CONCURRENCY || 1)));
const maxQueued = Math.max(concurrency, Number(process.env.MAX_QUEUE_LENGTH || 20));
export const queue = new JobQueue(concurrency, maxQueued);
