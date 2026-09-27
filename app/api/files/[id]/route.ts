import { NextResponse } from "next/server";
import { workerFileUrl } from "@/lib/worker-proxy";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.redirect(workerFileUrl(id), 307);
}
