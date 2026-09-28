import { Monitor, Tablet, Smartphone, Scan } from 'lucide-react';
import type { DeviceKind } from '@/lib/types';
export function DevicePreview({kind,width,height,url}:{kind:DeviceKind;width:number;height:number;url:string}) {
  const Icon=kind==='mobile'?Smartphone:kind==='tablet'?Tablet:Monitor;
  return <div className="device-stage"><div className={`device-frame ${kind}`} style={{aspectRatio:`${width||1920}/${height||1080}`,maxWidth:kind==='mobile'?200:kind==='tablet'?310:540}}><div className="frame-bar"><span className="frame-dots">● ● ●</span><span>{url||'Your website'}</span></div><div className="frame-content"><Scan size={34} strokeWidth={1}/><span>{width||'—'} × {height||'—'}</span><small>Viewport frame</small></div></div><span className="frame-label"><Icon size={15}/>{kind==='custom'?'Custom viewport':`${kind[0].toUpperCase()+kind.slice(1)} viewport`}</span></div>;
}
