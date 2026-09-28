import assert from 'node:assert/strict';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {screenshotSchema,videoSchema} from '../lib/schemas.js';
import {captureScreenshot} from '../capture/screenshot.js';
import {captureVideo} from '../capture/video.js';
import {closeBrowser} from '../capture/browser.js';
import {probeVideo} from '../capture/media.js';
import {TEMP_DIR} from '../lib/files.js';
const artifacts=path.resolve('../artifacts');
const results:unknown[]=[];
const stage=(status:string,_p:number,message:string)=>console.log(status,message);
async function main(){
 await mkdir(artifacts,{recursive:true});
 for(const [name,url,deviceId,dpr] of [
  ['public-example','https://example.com','desktop-1920',2],
  ['public-nextjs','https://nextjs.org','mobile-390',2],
  ['public-google-fonts','https://fonts.google.com/specimen/Roboto','desktop-1440',1],
 ] as const){
  const r=await captureScreenshot(screenshotSchema.parse({url,deviceId,dpr,waitSeconds:2}),stage);
  const file=path.join(TEMP_DIR,r.fileId+'.png');
  const m=await sharp(file).metadata();assert.equal(m.width,r.width);assert.equal(m.height,r.height);
  await sharp(file).raw().toBuffer();await copyFile(file,path.join(artifacts,name+'.png'));
  results.push({name,status:'passed',...r});console.log('PASS',name,`${m.width}x${m.height}`);
  await closeBrowser();
 }
 const r=await captureVideo(videoSchema.parse({url:'https://example.com',deviceId:'desktop-1920',waitSeconds:0,durationSeconds:5,recordingMode:'static',output:'mp4'}),stage);
 const file=path.join(TEMP_DIR,r.fileId+'.mp4'), m=await probeVideo(file);
 assert.equal(m.codec,'h264');assert.equal(m.width,1920);assert.equal(m.height,1080);assert(Math.abs(m.duration-5)<.15);
 await copyFile(file,path.join(artifacts,'public-example.mp4'));
 results.push({name:'public-website-video',status:'passed',...r});
 await writeFile(path.join(artifacts,'live-tests.json'),JSON.stringify({at:new Date().toISOString(),fixtureMode:false,results},null,2));
 console.log('PASS real public URL screenshots and H.264 recording');
}
main().finally(closeBrowser).catch(error=>{console.error(error);process.exitCode=1;});
