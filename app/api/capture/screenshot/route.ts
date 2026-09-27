import { NextResponse } from "next/server";
import { proxyWorker } from "@/lib/worker-proxy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const response = await proxyWorker("/api/capture/screenshot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const data = await response.text();
    return new NextResponse(data, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json" } });
  } catch {
    return NextResponse.json({ error: { code: "WORKER_UNAVAILABLE", message: "Capture worker is unavailable. Try again shortly." } }, { status: 503 });
  }
}
