import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export async function probeVideo(file: string) {
  const { stdout } = await exec('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=width,height,codec_name,r_frame_rate:format=duration:format_tags=creation_time','-of','json',file], { timeout: 10_000, maxBuffer: 64 * 1024 });
  const data = JSON.parse(stdout);
  const stream = data.streams?.[0];
  if (!stream || !Number.isFinite(Number(data.format?.duration))) throw new Error('Invalid video output');
  return { width: Number(stream.width), height: Number(stream.height), codec: stream.codec_name, duration: Number(data.format.duration), frameRate: stream.r_frame_rate, createdAt: Date.parse(data.format.tags?.creation_time || "") };
}
