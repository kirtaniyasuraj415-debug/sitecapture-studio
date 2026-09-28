import type {JobStatus} from '@/lib/types';
const steps=['Queued','Opening','Loading fonts','Rendering','Capturing','Processing','Ready'];
export function Progress({status,progress,message}:{status:JobStatus;progress:number;message:string}) {return <div className="progress-box" role="status" aria-live="polite"><div><span>{message}</span><span>{progress}%</span></div><progress max={100} value={progress} aria-label={message}/><span className="progress-label">{steps[['queued','opening','loading','rendering','capturing','processing','ready'].indexOf(status)]||message}</span></div>;}
