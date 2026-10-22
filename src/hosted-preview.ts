import './hosted-preview.css';

document.documentElement.classList.add('webcam-preview');
const bar=document.createElement('aside');
bar.className='hosted-preview';
bar.innerHTML='<span>Webcam preview · Phone control stays in the local build.</span><details><summary>Tracking timings</summary><output id="hosted-timings">Enable the webcam to measure this laptop.</output><p>Inference and worker timings exclude camera capture and display latency.</p><button id="save-timings" disabled>Save timings</button></details>';
const nav=document.querySelector('.workspace-nav');
if(nav)nav.after(bar);else document.querySelector('#app')!.prepend(bar);
for(const button of document.querySelectorAll<HTMLElement>('[data-mode="webcam"]'))button.textContent='Webcam';
let latest:Record<string,unknown>|null=null;
window.addEventListener('studio-hand-metrics',event=>{
 const metrics=(event as CustomEvent).detail;
 const out=bar.querySelector('output')!;
 if(metrics?.status!=='running'){out.textContent=metrics?.status==='error'?'Tracking failed. See the camera message.':'Camera stopped.';return;}
 latest=metrics;
 const number=(key:string)=>typeof latest?.[key]==='number'?(latest[key] as number).toFixed(1):'—';
 out.textContent=`Model ready: ${number('modelStartupMs')} ms · ${number('processedHz')} frames/s · Inference p50/p95: ${number('inferenceP50Ms')} / ${number('inferenceP95Ms')} ms · Worker round trip p95: ${number('workerP95Ms')} ms`;
 (bar.querySelector('button') as HTMLButtonElement).disabled=false;
});
bar.querySelector('button')!.onclick=()=>{
 if(!latest)return;
 const data={recordedAt:new Date().toISOString(),route:location.pathname,metrics:latest,userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},notes:'Browser-local CPU hand tracking. Worker round trip includes dispatch, inference and result delivery. These are not physical motion-to-display measurements. No camera frames included.'};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='webcam-timings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
