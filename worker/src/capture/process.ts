import { spawn } from "node:child_process";

export function runProcess(command: string, args: string[], timeoutMs = 60_000) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${command} timed out`)); }, timeoutMs);
    child.stderr.on("data", (chunk) => { stderr += String(chunk).slice(-6000); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(); else reject(new Error(`${command} exited with ${code}: ${stderr.slice(-1200)}`));
    });
  });
}
