import { captureProxy } from '@/lib/worker-proxy';
export const runtime = 'nodejs';
export const POST = (request: Request) => captureProxy(request, 'screenshot');
