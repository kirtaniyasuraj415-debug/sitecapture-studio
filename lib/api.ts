import type { CaptureJob } from "./types";

export async function createJob(kind: "screenshot" | "video", payload: unknown) {
  const response = await fetch(`/api/capture/${kind}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Could not start capture.");
  return data as { id: string };
}

export async function getJob(id: string) {
  const response = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Could not load job.");
  return data as CaptureJob;
}
