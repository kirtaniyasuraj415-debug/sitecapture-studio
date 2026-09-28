import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const base=process.env.TEST_APP_URL||'http://127.0.0.1:3000';
const headers={'content-type':'application/json'};
const password=process.env.TEST_SITE_PASSWORD;
async function fetch(url,options={}) {
 const requestHeaders=new Headers(options.headers);
 if(password) requestHeaders.set('authorization','Basic '+Buffer.from('test:'+password).toString('base64'));
 return globalThis.fetch(url,{...options,headers:requestHeaders});
}
if(password) {
 const rejected=await globalThis.fetch(`${base}/api/capabilities`);
 assert.equal(rejected.status,401);
 const authorized=await fetch(`${base}/api/capabilities`);
 assert.equal(authorized.status,200);
}
async function job(kind,payload){
 const start=await fetch(`${base}/api/capture/${kind}`,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
 assert.equal(start.status,202,await start.clone().text());const {id}=await start.json();
 const end=Date.now()+240000;
 while(Date.now()<end){const r=await fetch(`${base}/api/jobs/${id}`);assert.equal(r.status,200);const j=await r.json();if(j.status==='error')throw new Error(JSON.stringify(j.error));if(j.status==='ready')return j;await new Promise(r=>setTimeout(r,1000));}
 throw new Error('API job did not finish within 240s');
}
const created=await job('screenshot',{url:'https://example.com',deviceId:'desktop-1920',dpr:2,waitSeconds:0});
assert.equal(created.result.width,3840);assert.equal(created.result.height,2160);
let response=await fetch(base+created.result.downloadUrl);assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/attachment/);
const buffer=Buffer.from(await response.arrayBuffer());assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(buffer.readUInt32BE(16),3840);assert.equal(buffer.readUInt32BE(20),2160);
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/api-capture.png',buffer);
response=await fetch(base+created.result.previewUrl,{headers:{range:'bytes=0-63'}});assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,64);
response=await fetch(base+created.result.previewUrl,{headers:{range:'bytes=99999999999-'}});assert.equal(response.status,416);
const recorded=await job('video',{url:'https://example.com',deviceId:'desktop-1920',waitSeconds:0,durationSeconds:5,recordingMode:'static',output:'both'});
assert.equal(recorded.result.width,1920);assert.equal(recorded.result.height,1080);
assert(Math.abs(recorded.result.durationSeconds-5)<.15);
response=await fetch(base+recorded.result.downloadUrl);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'video/mp4');
const mp4=Buffer.from(await response.arrayBuffer());assert.equal(mp4.subarray(4,8).toString(),'ftyp');await writeFile('artifacts/api-video.mp4',mp4);
response=await fetch(base+recorded.result.secondaryFile.downloadUrl);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'video/webm');
const webm=Buffer.from(await response.arrayBuffer());assert.equal(webm.subarray(0,4).toString('hex'),'1a45dfa3');await writeFile('artifacts/api-video.webm',webm);
response=await fetch(base+recorded.result.previewUrl,{headers:{range:'bytes=0-1023'}});assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,1024);
response=await fetch(`${base}/api/capture/video`,{method:'POST',headers,body:JSON.stringify({url:'https://example.com',durationSeconds:999})});assert.equal(response.status,400);
response=await fetch(`${base}/api/capture/screenshot`,{method:'POST',headers,body:'{invalid'});assert.equal(response.status,400);
response=await fetch(`${base}/api/capture/screenshot`,{method:'POST',headers:{...headers,origin:'https://unrelated.example'},body:'{}'});assert.equal(response.status,403);
response=await fetch(`${base}/api/capture/screenshot`,{method:'POST',headers:{...headers,origin:'null'},body:'{}'});assert.equal(response.status,403);
response=await fetch(`${base}/api/capture/screenshot`,{method:'POST',headers,body:JSON.stringify({url:'https://example.com',junk:'x'.repeat(20000)})});assert.equal(response.status,413);
await writeFile('artifacts/api-tests.json',JSON.stringify({status:'passed',dimensions:'3840x2160',video:'1920x1080 / 5 seconds / MP4 + WebM',passwordGate:!!password,checks:['Next.js → worker → Chromium → download','Video queue → recording → FFmpeg → MP4/WebM downloads','Byte-range 206 and invalid range 416','Zod duration validation','Malformed JSON','Cross-origin rejection including opaque origin','Request body limit']},null,2));
console.log('API end-to-end checks passed.');
