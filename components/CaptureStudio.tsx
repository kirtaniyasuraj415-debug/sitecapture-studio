"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Camera, Video, Monitor, Tablet, Smartphone, SlidersHorizontal, ChevronDown, ArrowUpRight, Download, RotateCcw, Link2, Check, LoaderCircle, AlertCircle } from 'lucide-react';
import { DEVICE_PRESETS, deviceById } from '@/lib/devices';
import { createJob, getJob } from '@/lib/api';
import type { CaptureJob, CaptureMode, DeviceKind, ScreenshotType } from '@/lib/types';
import { DevicePreview } from './DevicePreview';
import { Progress } from './Progress';

const delays = [0,1,2,3,5,10];
const formatBytes = (v:number) => v < 1024 * 1024 ? `${(v/1024).toFixed(1)} KB` : `${(v/1024/1024).toFixed(1)} MB`;
const kinds = [{id:'desktop',name:'Desktop',Icon:Monitor},{id:'tablet',name:'Tablet',Icon:Tablet},{id:'mobile',name:'Mobile',Icon:Smartphone},{id:'custom',name:'Custom',Icon:SlidersHorizontal}] as const;

export default function CaptureStudio() {
  const [mode,setMode] = useState<CaptureMode>('screenshot');
  const [url,setUrl] = useState('');
  const [kind,setKind] = useState<DeviceKind>('desktop');
  const [deviceId,setDeviceId] = useState('desktop-1920');
  const [width,setWidth] = useState(1920), [height,setHeight] = useState(1080);
  const [dpr,setDpr] = useState(2), [waitSeconds,setWaitSeconds] = useState(2);
  const [screenshotType,setScreenshotType] = useState<ScreenshotType>('viewport');
  const [selectedHeight,setSelectedHeight] = useState(3000);
  const [format,setFormat] = useState<'png'|'jpeg'|'webp'>('png'), [quality,setQuality] = useState(92);
  const [recordingMode,setRecordingMode] = useState<'autoScroll'|'static'>('autoScroll');
  const [durationSeconds,setDuration] = useState(10);
  const [scrollSpeed,setScrollSpeed] = useState<'slow'|'normal'|'fast'>('normal');
  const [output,setOutput] = useState<'mp4'|'webm'|'both'>('mp4');
  const [videoPreset,setVideoPreset] = useState<'device'|'1080p'|'1440p'|'4k'>('device');
  const [advanced,setAdvanced] = useState(false);
  const [colorScheme,setColorScheme] = useState<'dark'|'light'|'no-preference'>('no-preference');
  const [hideScrollbars,setHideScrollbars] = useState(true), [keepAnimations,setKeepAnimations] = useState(true);
  const [removeCookiePopup,setRemoveCookiePopup] = useState(false), [transparent,setTransparent] = useState(false);
  const [touch,setTouch] = useState(false), [userAgent,setUserAgent] = useState('');
  const [job,setJob] = useState<CaptureJob|null>(null), [error,setError] = useState('');
  const [submitting,setSubmitting] = useState(false), [polling,setPolling] = useState(false);
  const [capabilities,setCapabilities] = useState<{fourKVideo:boolean}|null>(null);
  const [connection,setConnection] = useState<'checking'|'online'|'offline'>('checking');
  const [copied,setCopied] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  const submitLock = useRef(false);
  const preset = deviceById(deviceId);
  const device = kind === 'custom' ? {width,height,isMobile:touch,hasTouch:touch,label:`Custom ${width} × ${height}`} : preset;
  const viewport = mode === 'video' && (kind === 'desktop' || kind === 'custom' && !touch) && videoPreset !== 'device'
    ? videoPreset === '4k' ? {width:3840,height:2160} : videoPreset === '1440p' ? {width:2560,height:1440} : {width:1920,height:1080}
    : device;
  const busy = submitting || polling;
  const jobId = job?.id;

  async function checkWorker() {
    setConnection('checking');
    try { const r=await fetch('/api/capabilities',{signal:AbortSignal.timeout(22_000),cache:'no-store'}); if (!r.ok) throw new Error(); setCapabilities(await r.json()); setConnection('online'); }
    catch { setConnection('offline'); }
  }
  useEffect(() => { void fetch('/api/capabilities',{signal:AbortSignal.timeout(22_000),cache:'no-store'}).then(async r=> {if(!r.ok) throw new Error(); setCapabilities(await r.json()); setConnection('online');}).catch(()=>setConnection('offline')); },[]);

  useEffect(() => {
    if (!jobId || !polling) return;
    let stopped=false, failures=0;
    let timer:ReturnType<typeof setTimeout>;
    const started=Date.now();
    const poll=async()=> {
      try {
        const next=await getJob(jobId); if(stopped) return;
        failures=0; setJob(next); setError('');
        if(['ready','error'].includes(next.status)) {setPolling(false); if(next.status==='ready') setTimeout(()=>resultRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),80); return;}
      } catch(e) { if(stopped) return; failures++; if(failures>=3) {setError(e instanceof Error?e.message:'Connection lost.'); setPolling(false); return;} }
      if(Date.now()-started>12*60*1000) {setError('This job is taking too long. Check its status again, or retry.');setPolling(false);return;}
      timer=setTimeout(poll,failures?2500:1000);
    };
    timer=setTimeout(poll,500);
    return ()=>{stopped=true;clearTimeout(timer);};
  },[jobId,polling]);

  function chooseKind(next:DeviceKind) {
    setKind(next); if(next!=='custom') {const p=DEVICE_PRESETS.find(d=>d.kind===next)!;setDeviceId(p.id);setWidth(p.width);setHeight(p.height);}
    setVideoPreset('device');
  }
  async function startCapture(e?:React.FormEvent) {
    e?.preventDefault(); if(submitLock.current || busy) return;
    submitLock.current=true; setSubmitting(true); setError(''); setJob(null);
    try {
      const normalized=new URL(url.trim());
      if(!['http:','https:'].includes(normalized.protocol)) throw new Error('Enter a public http:// or https:// website URL.');
      const common={url:normalized.toString(), ...(kind==='custom'?{width,height,isMobile:touch,hasTouch:touch}:{deviceId,...(touch?{isMobile:true,hasTouch:true}:{})}),waitSeconds,colorScheme,hideScrollbars,keepAnimations,removeCookiePopup,...(userAgent.trim()?{userAgent:userAgent.trim()}:{})};
      const payload=mode==='screenshot'?{...common,dpr,screenshotType,selectedHeight,format,quality,transparentBackground:transparent}:{...common,dpr:1,recordingMode,durationSeconds,scrollSpeed,output,videoPreset};
      const created=await createJob(mode,payload);
      setJob({id:created.id,type:mode,status:'queued',progress:3,message:'Queued',createdAt:new Date().toISOString()});setPolling(true);
    } catch(e) {setError(e instanceof TypeError?'Enter a valid URL, including https://.':e instanceof Error?e.message:'Could not start capture.');}
    finally {submitLock.current=false;setSubmitting(false);}
  }
  const result=job?.status==='ready'?job.result:null;
  const requestedHeight=mode==='screenshot'&&screenshotType==='selectedHeight'?selectedHeight:viewport.height;
  return <main className="studio-shell">
    <header className="studio-header"><Link href="/" className="brand"><span className="brand-mark"><Camera size={21}/></span><span>SiteCapture<span className="brand-suffix"> Studio</span></span></Link><div className="connection" role="status"><span className={`connection-dot ${connection}`}/>{connection==='online'?'Worker connected':connection==='checking'?'Connecting…':'Worker offline'}</div></header>
    <div className="workspace-heading"><div><p className="eyebrow">YOUR CAPTURE WORKSPACE</p><h1>A website. Every detail.</h1><p>Native-resolution screenshots and website recordings.</p></div><span className="workspace-note">PNG · JPEG · WebP · MP4 · WebM</span></div>
    {connection==='offline' && <div className="notice" role="status"><AlertCircle size={18}/><p>The capture worker is unavailable or waking up.</p><button onClick={checkWorker}>Check again</button></div>}
    <div className="workspace-grid">
      <form className="settings-panel" onSubmit={startCapture}>
        <fieldset disabled={busy} className="settings-fields">
          <div className="mode-tabs" aria-label="Capture mode">{(['screenshot','video'] as CaptureMode[]).map(m=><button key={m} type="button" aria-pressed={mode===m} className={mode===m?'active':''} onClick={()=>{setMode(m);setJob(null);setError('');}}>{m==='screenshot'?<Camera size={17}/>:<Video size={17}/>}<span>{m==='screenshot'?'Screenshot':'Record website'}</span></button>)}</div>
          <Field label="Website URL"><div className="url-field"><Link2 size={18}/><input aria-label="Website URL" type="url" required value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}/></div></Field>
          <div className="settings-section"><div className="section-label"><span>Device</span><span className="meta">CSS viewport</span></div><div className="device-tabs">{kinds.map(({id,name,Icon})=><button key={id} type="button" className={kind===id?'active':''} aria-pressed={kind===id} onClick={()=>chooseKind(id)}><Icon size={20}/><span>{name}</span></button>)}</div>
            {kind==='custom'?<div className="two-columns"><NumberField label="Width" value={width} min={320} max={3840} onChange={setWidth}/><NumberField label="Height" value={height} min={240} max={6000} onChange={setHeight}/></div>:<select aria-label="Device resolution" value={deviceId} onChange={e=>setDeviceId(e.target.value)} className="field size-select">{DEVICE_PRESETS.filter(d=>d.kind===kind).map(d=><option key={d.id} value={d.id}>{d.width} × {d.height}</option>)}</select>}
          </div>
          {mode==='screenshot'?<>
            <div className="two-columns settings-section"><Field label="Pixel density"><select className="field" value={dpr} onChange={e=>setDpr(Number(e.target.value))}>{[1,2,3].map(v=><option key={v} value={v}>{v}×{v===2?' · Default':''}</option>)}</select></Field><Field label="Image format"><select className="field" value={format} onChange={e=>setFormat(e.target.value as typeof format)}><option value="png">PNG · Lossless</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></Field></div>
            <div className="settings-section"><span className="section-label">Capture area</span><div className="segmented">{(['viewport','fullPage','selectedHeight'] as ScreenshotType[]).map(t=><button key={t} type="button" className={t===screenshotType?'active':''} aria-pressed={t===screenshotType} onClick={()=>setScreenshotType(t)}>{t==='viewport'?'Viewport':t==='fullPage'?'Full page':'Set height'}</button>)}</div></div>
            {screenshotType==='selectedHeight'&&<NumberField label="Capture height (CSS px)" value={selectedHeight} min={480} max={12000} onChange={setSelectedHeight}/>}
            {format!=='png'&&<Field label={`Quality · ${quality}${format==='webp'&&quality===100?' · Lossless':''}`}><input className="quality-range" type="range" min={60} max={100} value={quality} onChange={e=>setQuality(Number(e.target.value))}/></Field>}
          </>:<>
            <div className="two-columns settings-section"><Field label="Recording"><select className="field" value={recordingMode} onChange={e=>setRecordingMode(e.target.value as typeof recordingMode)}><option value="autoScroll">Auto scroll</option><option value="static">Static</option></select></Field><Field label="Export"><select className="field" value={output} onChange={e=>setOutput(e.target.value as typeof output)}><option value="mp4">MP4 · H.264</option><option value="webm">WebM</option><option value="both">MP4 + WebM</option></select></Field></div>
            <div className="settings-section"><span className="section-label">Duration</span><div className="segmented">{[5,10,15,30].map(d=><button key={d} type="button" className={durationSeconds===d?'active':''} aria-pressed={durationSeconds===d} onClick={()=>setDuration(d)}>{d}s</button>)}</div></div>
            <div className="two-columns"><NumberField label="Custom seconds" value={durationSeconds} min={3} max={30} onChange={setDuration}/>{recordingMode==='autoScroll'&&<Field label="Scroll speed"><select className="field" value={scrollSpeed} onChange={e=>setScrollSpeed(e.target.value as typeof scrollSpeed)}><option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option></select></Field>}</div>
            <Field label="Video resolution"><select className="field" value={videoPreset} disabled={kind==='mobile'||kind==='tablet'||kind==='custom'&&touch} onChange={e=>setVideoPreset(e.target.value as typeof videoPreset)}><option value="device">Use selected viewport</option><option value="1080p">1080p · 1920 × 1080</option><option value="1440p">1440p · 2560 × 1440</option><option value="4k" disabled={!capabilities?.fourKVideo}>4K · {capabilities?.fourKVideo?'3840 × 2160':'Unavailable on this host'}</option></select></Field>
          </>}
          <button type="button" className="advanced-toggle" aria-expanded={advanced} aria-controls="advanced-settings" onClick={()=>setAdvanced(!advanced)}><span><SlidersHorizontal size={16}/>Advanced settings</span><ChevronDown size={16} className={advanced?'rotate':''}/></button>
          {advanced&&<div id="advanced-settings" className="advanced-settings"><div className="two-columns"><Field label="Extra wait"><select className="field" value={waitSeconds} onChange={e=>setWaitSeconds(Number(e.target.value))}>{delays.map(d=><option key={d} value={d}>{d} seconds</option>)}</select></Field><Field label="Appearance"><select className="field" value={colorScheme} onChange={e=>setColorScheme(e.target.value as typeof colorScheme)}><option value="no-preference">Site default</option><option value="light">Light</option><option value="dark">Dark</option></select></Field></div><Toggle label="Hide scrollbars" checked={hideScrollbars} onChange={setHideScrollbars}/><Toggle label="Keep animations" checked={keepAnimations} onChange={setKeepAnimations}/><Toggle label="Mobile touch emulation" description={kind==='mobile'||kind==='tablet'?'Already enabled for this device':'Use mobile layout and touch input'} checked={touch||kind==='mobile'||kind==='tablet'} disabled={kind==='mobile'||kind==='tablet'} onChange={setTouch}/><Toggle label="Hide common cookie popups" description="Optional; some sites may still show a banner" checked={removeCookiePopup} onChange={setRemoveCookiePopup}/>{mode==='screenshot'&&format!=='jpeg'&&<Toggle label="Transparent background" description="Where the website allows transparency" checked={transparent} onChange={setTransparent}/>}<Field label="User agent override"><input className="field" value={userAgent} maxLength={512} onChange={e=>setUserAgent(e.target.value)} placeholder="Use device default"/></Field></div>}
          <div className="output-summary"><span>{mode==='screenshot'?'Expected output':'Recording size'}</span><strong>{viewport.width*(mode==='screenshot'?dpr:1)} × {mode==='screenshot'&&screenshotType==='fullPage'?'full height':requestedHeight*(mode==='screenshot'?dpr:1)}<span> px</span></strong></div>
        </fieldset>
        {error&&<div className="error-box" role="alert">{error}{job&& !['error','ready'].includes(job.status)&&<button type="button" onClick={()=>{setError('');setPolling(true);}}>Check this job again</button>}</div>}
        {job?.status==='error'&&<div className="error-box" role="alert">{job.error?.message}<span>Adjust the settings below or retry.</span></div>}
        {busy&&job&&<Progress status={job.status} progress={job.progress} message={job.message}/>}
        <button type="submit" className="capture-button" disabled={busy}>{busy?<LoaderCircle size={19} className="spin"/>:mode==='screenshot'?<Camera size={19}/>:<Video size={19}/>} {busy?submitting?'Starting capture…':job?.message||'Working…':job?.status==='error'?'Retry capture':mode==='screenshot'?'Capture Website':'Record Website'}{!busy&&<span aria-hidden="true">↗</span>}</button>
        <p className="retention-note">Downloads are kept for 30 minutes.</p>
      </form>
      <section className="preview-panel" ref={resultRef} aria-label="Capture result">
        <div className="preview-toolbar"><span>{result?'CAPTURE RESULT':'DEVICE FRAME'}</span><span>{result?`${result.format.toUpperCase()} · ${result.width} × ${result.height}`:`${viewport.width} × ${viewport.height}`}</span></div>
        {result&&job?<>
          <div className="result-media">{job.type==='screenshot'?<Image unoptimized src={result.previewUrl} alt={`Website screenshot of ${result.sourceUrl}`} width={result.width} height={result.height} className="capture-image"/>:<video src={result.previewUrl} controls playsInline preload="metadata" className="capture-video"/>}</div>
          <div className="result-details"><div className="result-title"><span className="result-check"><Check size={20}/></span><div><h2>Your capture is ready.</h2><p>{result.deviceLabel}</p></div>{job.type==='screenshot'&&<a className="icon-button" href={result.previewUrl} target="_blank" rel="noreferrer" aria-label="Open original at full resolution"><ArrowUpRight size={20}/></a>}</div>
            <div className="result-stats">{[['Dimensions',`${result.width} × ${result.height}`],['File size',formatBytes(result.fileSize)],['Pixel ratio',`${result.dpr}× DPR`],['Capture time',`${(result.captureTimeMs/1000).toFixed(1)}s`],...(job.type==='video'?[['Duration',`${result.durationSeconds?.toFixed(2)}s`],['Frame rate',result.frameRate||'25 fps']]:[])].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</div>
            {result.warnings?.length?<details className="capture-warnings"><summary>{result.warnings.length} loading note(s)</summary><ul>{result.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details>:null}
            <div className="result-actions"><a className="download-button" href={result.downloadUrl}><Download size={18}/>Download {result.format.toUpperCase()}</a>{result.secondaryFile&&<a className="secondary-button" href={result.secondaryFile.downloadUrl}><Download size={17}/>WebM</a>}</div>
            <div className="result-utilities"><button onClick={()=>void startCapture()}><RotateCcw size={15}/>Capture again</button><button onClick={()=>{setJob(null);document.querySelector('.settings-panel')?.scrollIntoView({behavior:'smooth'});}}>Change device</button><button onClick={async()=>{try{await navigator.clipboard.writeText(result.sourceUrl);setCopied(true);setTimeout(()=>setCopied(false),2500);}catch{setError('Clipboard unavailable. The original URL is shown below.');}}}>{copied?<Check size={15}/>:<Link2 size={15}/>} {copied?'Copied':'Copy URL'}</button></div><p className="source-url">{result.sourceUrl}</p><p className="retention-note">Download now. This capture expires after 30 minutes.</p>
          </div>
        </>:<><DevicePreview kind={kind} width={viewport.width} height={viewport.height} url={url}/><div className="preview-caption"><span className="small-mark"><Camera size={20}/></span><h2>{busy?'Getting every pixel ready.':'Ready when you are.'}</h2><p>{busy?'Your capture will appear here when processing finishes.':'Paste a URL, choose a device, and capture.'}</p></div><div className="preview-footer"><span>Actual viewport rendering</span><span>{mode==='screenshot'?`${dpr}× pixel density`:'Native browser motion'}</span><span>{mode==='screenshot'?format.toUpperCase():output==='both'?'MP4 + WebM':output.toUpperCase()}</span></div></>}
      </section>
    </div>
    <footer className="studio-footer"><span>SiteCapture Studio</span><span>Rendered with Chromium. Made for the details.</span></footer>
  </main>;
}
function Field({label,children}:{label:string;children:React.ReactNode}) {return <label className="form-field"><span>{label}</span>{children}</label>;}
function NumberField({label,value,min,max,onChange}:{label:string;value:number;min:number;max:number;onChange:(v:number)=>void}) {return <Field label={label}><input className="field" type="number" value={Number.isNaN(value)?'':value} required min={min} max={max} onChange={e=>onChange(e.target.valueAsNumber)}/></Field>;}
function Toggle({label,description,checked,disabled,onChange}:{label:string;description?:string;checked:boolean;disabled?:boolean;onChange:(v:boolean)=>void}) {return <label className="toggle-row"><span>{label}{description&&<small>{description}</small>}</span><input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e=>onChange(e.target.checked)}/></label>;}
