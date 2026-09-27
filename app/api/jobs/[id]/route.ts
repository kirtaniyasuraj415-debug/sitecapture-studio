import { NextResponse } from "next/server";
import { proxyWorker } from "@/lib/worker-proxy";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const response = await proxyWorker(`/api/jobs/${encodeURIComponent(id)}`);
    const data = await response.text();
    return new NextResponse(data, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json" } });
  } catch {
    return NextResponse.json({ error: { code: "WORKER_UNAVAILABLE", message: "Capture worker is unavailable." } }, { status: 503 });
  }
}
