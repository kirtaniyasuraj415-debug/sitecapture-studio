const privateWorkerBase = () => process.env.CAPTURE_WORKER_URL || "http://localhost:8787";
const publicWorkerBase = () => process.env.CAPTURE_PUBLIC_WORKER_URL || process.env.CAPTURE_WORKER_URL || "http://localhost:8787";

export async function proxyWorker(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const apiKey = process.env.CAPTURE_WORKER_API_KEY;
  if (apiKey) headers.set("x-sitecapture-key", apiKey);
  return fetch(`${privateWorkerBase()}${path}`, { ...init, headers, cache: "no-store" });
}

export function workerFileUrl(id: string) {
  return `${publicWorkerBase()}/api/files/${encodeURIComponent(id)}`;
}
