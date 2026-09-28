import { NextResponse } from 'next/server';
import { proxyWorker } from '@/lib/worker-proxy';
export const runtime = 'nodejs';
export async function GET(request: Request, {params}: {params:Promise<{id:string}>}) {
  const {id} = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({error:{message:'Invalid file ID.'}},{status:400});
  try {
    const download = new URL(request.url).searchParams.get('download') === '1' ? '?download=1' : '';
    const headers = new Headers(); if (request.headers.has('range')) headers.set('range',request.headers.get('range')!);
    const response = await proxyWorker(`/api/files/${id}${download}`,{headers},300_000);
    const outputHeaders = new Headers({'cache-control':'no-store','x-content-type-options':'nosniff'});
    for (const key of ['content-type','content-length','content-range','accept-ranges','content-disposition']) {const value=response.headers.get(key); if(value) outputHeaders.set(key,value);}
    return new Response(response.body,{status:response.status,headers:outputHeaders});
  } catch {return NextResponse.json({error:{message:'Capture file is unavailable. Try again.'}},{status:503});}
}
