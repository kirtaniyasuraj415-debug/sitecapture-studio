import {describe,it,expect} from 'vitest';
import {JobQueue} from '../lib/jobs.js';
const tick=()=>new Promise(r=>setTimeout(r,10));
describe('bounded queue',()=>{
 it('limits concurrency and recovers after a rejected task',async()=>{const q=new JobQueue(1,2);let release!:()=>void;const first=new Promise<void>(r=>{release=r});let next=false;expect(q.enqueue(()=>first)).toBe(true);expect(q.enqueue(async()=>{next=true;throw new Error('expected')})).toBe(true);expect(q.enqueue(async()=>{})).toBe(false);expect(q.stats()).toMatchObject({active:1,queued:1});release();await tick();expect(next).toBe(true);expect(q.stats()).toMatchObject({active:0,queued:0});});
});
