import type { CaptureJob } from './types';
async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, {...init, cache:'no-store', signal:AbortSignal.timeout(25_000)});
  let data;
  try { data = await response.json(); } catch { throw new Error('Server returned an unexpected response. Retry in a moment.'); }
  if (!response.ok) throw new Error(data?.error?.message || 'Could not connect to capture worker.');
  return data;
}
export const createJob = (kind:'screenshot'|'video', payload:unknown):Promise<{id:string}> => request(`/api/capture/${kind}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
export const getJob = (id:string):Promise<CaptureJob> => request(`/api/jobs/${id}`);
