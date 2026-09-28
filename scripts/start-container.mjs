import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const key=process.env.CAPTURE_API_KEY||randomBytes(32).toString('hex');
const worker=spawn(process.execPath,['worker/dist/worker/src/server.js'],{stdio:'inherit',cwd:'/app',env:{...process.env,PORT:'8787',HOST:'127.0.0.1',CAPTURE_API_KEY:key,TEMP_DIR:'/app/temp'}});
const web=spawn(process.execPath,['server.js'],{stdio:'inherit',cwd:'/app',env:{...process.env,PORT:process.env.PORT||'3000',HOSTNAME:'0.0.0.0',CAPTURE_WORKER_URL:'http://127.0.0.1:8787',CAPTURE_WORKER_API_KEY:key}});
let ending=false;
function stop(code=0){if(ending)return;ending=true;worker.kill('SIGTERM');web.kill('SIGTERM');setTimeout(()=>{worker.kill('SIGKILL');web.kill('SIGKILL');process.exit(code);},6000).unref();}
worker.on('exit',code=>stop(code||1));web.on('exit',code=>stop(code||1));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>stop());
