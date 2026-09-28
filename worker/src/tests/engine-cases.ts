// Deterministic fixtures are fulfilled only in this test harness. Production SSRF checks stay enabled.
import assert from 'node:assert/strict';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { getBrowser, closeBrowser } from '../capture/browser.js';
import { captureScreenshot } from '../capture/screenshot.js';
import { captureVideo } from '../capture/video.js';
import { screenshotSchema, videoSchema } from '../lib/schemas.js';
import { ensureTemp, TEMP_DIR } from '../lib/files.js';
import { probeVideo } from '../capture/media.js';
import { runProcess } from '../capture/process.js';

const base='http://93.184.215.14'; // Public address checked by the real engine; no outbound fixture traffic.
const artifacts=path.resolve('../artifacts');
const stage=()=>{};
const results:{name:string;status:string;details?:unknown}[]=[];
const html=(body:string,extra='')=>`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#112335;color:white;font-family:Arial}h1{font-size:48px;padding:40px}section{height:100vh;box-sizing:border-box;padding:50px;font-size:32px} ${extra}</style></head><body>${body}</body></html>`;
const pages:Record<string,string>={
  '/static':html('<h1>SiteCapture: crisp text</h1><p>Native browser pixels at the requested viewport.</p>'),
  '/long':html('<section style="background:#15304b">01 — Made for details</section><section style="background:#395c36">02 — Real viewport</section><section style="background:#593534">03 — Native pixels</section><div style="height:3100px">Long page</div>'),
  '/lazy':html('<div style="height:1800px">Scroll to load</div><img id="lazy" width="300" height="200" loading="lazy" src="/lazy-image.png"><div style="height:300px"></div>'),
  '/mobile':html('<main id="responsive" style="height:100vh"></main>','#responsive{background:#a02020}@media(max-width:600px){#responsive{background:#20a040}}'),
  '/vh':html('<div style="height:100vh;background:#20a040"></div><div style="height:2500px;background:#a02020"></div>'),
  '/animation':html('<div id="moving"></div>','@keyframes travel{from{transform:translateX(0)}to{transform:translateX(250px)}}#moving{width:100px;height:100px;background:#20a040;animation:travel 2s linear infinite}'),
  '/fonts':html('<h1 style="font-family:CaptureFont">Waiting for web fonts</h1>',"@font-face{font-family:CaptureFont;src:url('/font.woff2')}"),
};
const pixel=async(file:string,x:number,y:number)=>{const {data}=await sharp(file).extract({left:x,top:y,width:1,height:1}).removeAlpha().raw().toBuffer({resolveWithObject:true});return Array.from(data);};

async function main(){
  await ensureTemp();await mkdir(artifacts,{recursive:true});
  const browser=await getBrowser();
  const newContext=browser.newContext.bind(browser);
  browser.newContext=async(options)=>{
    const context=await newContext(options);
    const newPage=context.newPage.bind(context);
    context.newPage=async()=>{
      const page=await newPage();
      await page.route(`${base}/**`,async route=>{
        const routePath=new URL(route.request().url()).pathname;
        if(routePath==='/timeout') {await new Promise(r=>setTimeout(r,1500)); await route.abort().catch(()=>{}); return;}
        if(routePath==='/redirect-private') {await route.fulfill({status:302,headers:{location:'http://127.0.0.1/'}});return;}
        if(routePath==='/lazy-image.png') {await new Promise(r=>setTimeout(r,220));await route.fulfill({contentType:'image/png',body:await sharp({create:{width:300,height:200,channels:3,background:'#fa861b'}}).png().toBuffer()});return;}
        if(routePath==='/font.woff2'){await new Promise(r=>setTimeout(r,350));await route.fulfill({contentType:'font/woff2',body:await readFile(path.resolve('src/tests/fixtures/roboto.woff2'))});return;}
        await route.fulfill({contentType:'text/html',body:pages[routePath]||pages['/static']});
      });return page;
    };return context;
  };
  async function shot(route:string,options:Record<string,unknown>={}){const result=await captureScreenshot(screenshotSchema.parse({url:base+route,width:800,height:600,dpr:1,waitSeconds:0,...options}),stage);return {result,file:path.join(TEMP_DIR,`${result.fileId}.${result.format==='jpeg'?'jpg':result.format}`)};}
  async function test(name:string,run:()=>Promise<unknown>){const details=await run();results.push({name,status:'passed',details});console.log('PASS',name,details||'');}
  await test('Static website / true 3840 × 2160 PNG',async()=>{const {result,file}=await shot('/static',{deviceId:'desktop-1920',dpr:2});const m=await sharp(file).metadata();assert.equal(m.width,3840);assert.equal(m.height,2160);await sharp(file).raw().toBuffer();await copyFile(file,path.join(artifacts,'native-dpr2.png'));return {width:m.width,height:m.height,bytes:result.fileSize};});
  await test('Long full-page render',async()=>{const {file}=await shot('/long',{screenshotType:'fullPage'});const m=await sharp(file).metadata();assert.equal(m.height,4900);return m.height;});
  await test('Selected height preserves 600px viewport/vh',async()=>{const {file}=await shot('/vh',{screenshotType:'selectedHeight',selectedHeight:1800});const m=await sharp(file).metadata();assert.equal(m.height,1800);assert.deepEqual(await pixel(file,10,599),[32,160,64]);assert.deepEqual(await pixel(file,10,601),[160,32,32]);return '800 × 1800, viewport unchanged';});
  await test('Lazy image really rendered',async()=>{const {file,result}=await shot('/lazy',{screenshotType:'fullPage'});assert.deepEqual(await pixel(file,20,1840),[250,134,27]);assert(!result.warnings.some(w=>w.includes('image(s)')));return 'Image pixels verified';});
  await test('Google Fonts WOFF2 load before capture (delayed fixture)',async()=>{const {result}=await shot('/fonts');assert(!result.warnings.some(w=>w.includes('font face')));return 'Bundled Roboto loaded';});
  await test('Responsive mobile + DPR3',async()=>{const {file,result}=await shot('/mobile',{deviceId:'mobile-390',dpr:3});assert.equal(result.width,1170);assert.equal(result.height,2532);assert.deepEqual(await pixel(file,10,10),[32,160,64]);await copyFile(file,path.join(artifacts,'responsive-mobile.png'));});
  await test('JPEG quality and WebP encode at original dimensions',async()=>{for(const format of ['jpeg','webp']){const {file}=await shot('/static',{format,quality:95});const m=await sharp(file).metadata();assert.equal(m.format,format);assert.equal(m.width,800);assert.equal(m.height,600);}});
  await test('Invalid URL and private redirect rejected',async()=>{await assert.rejects(()=>shot('/static',{url:'file:///etc/passwd'}));await assert.rejects(()=>shot('/redirect-private'));});
  await test('Navigation timeout + recovery',async()=>{process.env.NAVIGATION_TIMEOUT_MS='300';try{await assert.rejects(()=>shot('/timeout'));}finally{delete process.env.NAVIGATION_TIMEOUT_MS;}const {result}=await shot('/static');assert.equal(result.width,800);});
  await test('Animated page produces changing pixels',async()=>{const a=await shot('/animation');const b=await shot('/animation',{waitSeconds:1});assert.notDeepEqual(await readFile(a.file),await readFile(b.file));});
  await test('Oversized capture refused before rendering',async()=>{await assert.rejects(()=>shot('/long',{dpr:3,screenshotType:'selectedHeight',selectedHeight:12000,width:3840}),/too large|pixel limit/i);});
  await test('Auto-scroll MP4 + WebM actual duration/dimensions',async()=>{const result=await captureVideo(videoSchema.parse({url:base+'/long',width:800,height:600,waitSeconds:0,durationSeconds:3,output:'both',recordingMode:'autoScroll'}),stage);for(const id of [result.fileId,result.secondaryFile!.fileId]){const ext=id===result.fileId?'mp4':'webm';const file=path.join(TEMP_DIR,`${id}.${ext}`);const m=await probeVideo(file);assert.equal(m.width,800);assert.equal(m.height,600);assert(Math.abs(m.duration-3)<.15);await copyFile(file,path.join(artifacts,`auto-scroll.${ext}`));}const frame=path.join(artifacts,'video-first.png');await runProcess('ffmpeg',['-y','-i',path.join(artifacts,'auto-scroll.mp4'),'-frames:v','1',frame]);const rgb=await pixel(frame,5,590);assert(rgb[2]>rgb[1], 'Auto-scroll must start at page top, before second section');return {seconds:result.durationSeconds,fps:result.frameRate,startsAtTop:true};});
  await test('Short page auto-scroll still records full duration',async()=>{const result=await captureVideo(videoSchema.parse({url:base+'/static',width:800,height:600,waitSeconds:0,durationSeconds:3,recordingMode:'autoScroll',scrollSpeed:'fast',output:'mp4'}),stage);assert(Math.abs(result.durationSeconds-3)<.15);return result.durationSeconds;});
  await test('Browser contexts cleaned',async()=>{assert.equal(browser.contexts().length,0);});
  await writeFile(path.join(artifacts,'engine-tests.json'),JSON.stringify({at:new Date().toISOString(),browser:browser.version(),fixtureMode:true,results},null,2));
}
main().finally(closeBrowser).catch(error=>{console.error(error);process.exitCode=1;});
