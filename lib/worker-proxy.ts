const workerBase = () => process.env.CAPTURE_WORKER_URL || process.env.NEXT_PUBLIC_CAPTURE_WORKER_URL || "http://localhost:8787";

export async function proxyWorker(path: string, init?: RequestInit) {
  return fetch(`${workerBase()}${path}`, { ...init, cache: "no-store" });
}

export function workerFileUrl(id: string) {
  return `${workerBase()}/api/files/${encodeURIComponent(id)}`;
}
