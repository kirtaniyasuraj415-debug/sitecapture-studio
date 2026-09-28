import {NextResponse} from 'next/server';
import {proxyWorker} from '@/lib/worker-proxy';
export async function GET(){try{const response=await proxyWorker('/health');return NextResponse.json({ok:response.ok},{status:response.ok?200:503});}catch{return NextResponse.json({ok:false},{status:503});}}
