import { NextResponse } from 'next/server';
import { proxyWorker } from '@/lib/worker-proxy';
export async function GET() {
  try { const r = await proxyWorker('/api/capabilities'); return new NextResponse(await r.text(),{status:r.status,headers:{'content-type':'application/json','cache-control':'no-store'}}); }
  catch { return NextResponse.json({error:{message:'Capture worker unavailable'}},{status:503}); }
}
