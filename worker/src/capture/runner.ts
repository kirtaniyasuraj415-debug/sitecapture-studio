// Each queued job owns a process group: a stuck renderer cannot occupy the queue forever.
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CaptureError } from '../lib/errors.js';
const running = new Set<ChildProcess>();
function kill(child: ChildProcess) {
  if (!child.pid) return;
  try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* Already exited. */ }
}
export function stopCaptures() { for (const child of running) kill(child); }
export function runCapture(kind: 'screenshot' | 'video', input: unknown, stage: (s: string, p: number, m: string) => void): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const source = import.meta.url.endsWith('.ts') ? './job.ts' : './job.js';
    const child = fork(fileURLToPath(new URL(source, import.meta.url)), [], {
      detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      execArgv: source.endsWith('.ts') ? ['--import', 'tsx'] : [],
    });
    running.add(child);
    let done = false;
    let result: Record<string, unknown> | undefined;
    let failure: CaptureError | undefined;
    const finish = () => {
      if (done) return; done = true;
      clearTimeout(timer); running.delete(child); kill(child);
      if (failure) reject(failure); else if (result) resolve(result); else reject(new CaptureError('BROWSER_CRASH', 'Capture process stopped unexpectedly. Retry at a lower resolution.'));
    };
    const timer = setTimeout(() => {
      failure = new CaptureError('CAPTURE_TIMEOUT', 'Capture exceeded its time limit. Try a smaller capture or shorter recording.');
      kill(child); finish();
    }, kind === 'video' ? Number(process.env.VIDEO_TIMEOUT_MS || 150_000) + 10_000 : Number(process.env.CAPTURE_TIMEOUT_MS || 75_000) + 10_000);
    child.stderr?.on('data', () => {}); // Drain process output; never forward raw stack traces to clients.
    child.on('message', (raw) => {
      const msg = raw as { type: string; status: string; progress: number; message: string; result: Record<string, unknown>; error: {code:string;message:string} };
      if (done) return;
      if (msg.type === 'stage') stage(msg.status, msg.progress, msg.message);
      if (msg.type === 'result') result = msg.result;
      if (msg.type === 'error') failure = new CaptureError(msg.error.code, msg.error.message);
    });
    child.on('error', () => { failure = new CaptureError('WORKER_ERROR', 'Could not start the capture process.'); finish(); });
    child.on('exit', finish);
    child.send({ kind, input });
  });
}
