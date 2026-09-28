import { NextRequest, NextResponse } from 'next/server';
// Optional personal access gate for an internet-facing installation.
// Docker binds only to localhost by default; set this before exposing the app.
export function proxy(request: NextRequest) {
  const password=process.env.SITE_PASSWORD;
  if(!password) return NextResponse.next();
  const header=request.headers.get('authorization')||'';
  let supplied='';
  try {if(header.startsWith('Basic ')) supplied=atob(header.slice(6)).split(':').slice(1).join(':');} catch {}
  // No password or credential is sent to the capture worker.
  if(supplied===password) return NextResponse.next();
  return new NextResponse('SiteCapture Studio — enter your access password.',{status:401,headers:{'www-authenticate':'Basic realm="SiteCapture Studio", charset="UTF-8"','cache-control':'no-store'}});
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|health).*)']};
