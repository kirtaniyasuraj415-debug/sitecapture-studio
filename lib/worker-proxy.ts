import { NextResponse } from 'next/server';
const privateWorkerBase = () => process.env.CAPTURE_WORKER_URL || 'http://127.0.0.1:8787';
export async function proxyWorker(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (process.env.CAPTURE_WORKER_API_KEY) headers.set('x-sitecapture-key', process.env.CAPTURE_WORKER_API_KEY);
  return fetch(`${privateWorkerBase()}${path}`, {...init, headers, cache:'no-store', redirect:'error', signal:AbortSignal.timeout(20_000)});
}
export async function captureProxy(request: Request, kind: 'screenshot' | 'video') {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== request.headers.get('host')) return NextResponse.json({error:{message:'Cross-origin capture requests are not allowed.'}}, {status:403});
  try {
    // Stream with an enforced limit, including chunked requests without Content-Length.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = []; let bytes = 0;
    if (!reader) return NextResponse.json({error:{message:'Capture settings are required.'}}, {status:400});
    const timeout = setTimeout(() => { void reader.cancel(); }, 10_000);
    try { while (true) { const {done,value} = await reader.read(); if (done) break; bytes += value.length;
      if (bytes > 16 * 1024) { await reader.cancel(); return NextResponse.json({error:{message:'Capture request is too large.'}}, {status:413}); } chunks.push(value); } }
    finally { clearTimeout(timeout); }
    const body = Buffer.concat(chunks).toString('utf8');
    try { JSON.parse(body); } catch { return NextResponse.json({error:{message:'Invalid JSON request.'}}, {status:400}); }
    const response = await proxyWorker(`/api/capture/${kind}`, {method:'POST',headers:{'content-type':'application/json'},body});
    return new NextResponse(await response.text(), {status:response.status,headers:{'content-type':'application/json','cache-control':'no-store'}});
  } catch { return NextResponse.json({error:{code:'WORKER_UNAVAILABLE',message:'Capture worker is unavailable or waking up. Try again shortly.'}}, {status:503}); }
}
