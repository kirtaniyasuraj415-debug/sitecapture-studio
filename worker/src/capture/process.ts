import { spawn } from "node:child_process";

export function runProcess(command: string, args: string[], timeoutMs = 60_000, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error(`${command} was cancelled`));
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => {
      child.kill("SIGKILL");
      finish(new Error(`${command} was cancelled`));
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`${command} timed out`));
    }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    child.stderr.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-6000); });
    child.on("error", (error) => finish(error));
    child.on("exit", (code) => {
      if (code === 0) finish(); else finish(new Error(`${command} exited with ${code}: ${stderr.slice(-1200)}`));
    });
  });
}
