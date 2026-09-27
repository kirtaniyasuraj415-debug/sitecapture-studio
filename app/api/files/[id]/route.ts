import { NextResponse } from "next/server";
import { workerFileUrl } from "@/lib/worker-proxy";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const target = new URL(workerFileUrl(id));
  const incoming = new URL(request.url);
  if (incoming.searchParams.get("download") === "1") target.searchParams.set("download", "1");
  return NextResponse.redirect(target, 307);
}
