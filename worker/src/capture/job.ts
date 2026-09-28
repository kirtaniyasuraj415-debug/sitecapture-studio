import { screenshotSchema, videoSchema } from '../lib/schemas.js';
import { captureScreenshot } from './screenshot.js';
import { captureVideo } from './video.js';
import { closeBrowser } from './browser.js';
import { toPublicError } from '../lib/errors.js';
process.once('message', async (raw) => {
  const { kind, input } = raw as {kind:string; input:unknown};
  const stage = (status: string, progress: number, message: string) => process.send?.({type:'stage',status,progress,message});
  let message: unknown;
  try {
    const result = kind === 'video' ? await captureVideo(videoSchema.parse(input), stage) : await captureScreenshot(screenshotSchema.parse(input), stage);
    message = {type:'result',result};
  } catch (error) { message = {type:'error',error:toPublicError(error)}; }
  finally { await closeBrowser().catch(() => undefined); }
  process.send?.(message, () => process.exit(0));
});
