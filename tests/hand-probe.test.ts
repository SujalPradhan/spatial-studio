import test from 'node:test';
import assert from 'node:assert/strict';
import {HandProbe} from '../src/hand-probe';
const flush=()=>new Promise<void>(r=>setImmediate(r));
async function withProbe(deferBitmap:boolean,check:(h:any)=>Promise<void>){
 const globals=globalThis as any,keys=['Worker','window','createImageBitmap'],before=keys.map(k=>globals[k]);
 let worker:any,delivered=0,oldClosed=0,resolveBitmap:(b:any)=>void=()=>{};
 class WorkerMock{onmessage:any;onerror:any;frames:any[]=[];constructor(){worker=this;}postMessage(p:any){if(p.type==='frame')this.frames.push(p);}terminate(){}emit(p:any){this.onmessage({data:p});}}
 const video={readyState:2,currentTime:1,videoWidth:640,videoHeight:480};
 const context={clearRect(){},beginPath(){},arc(){},fill(){},stroke(){}};
 const canvas={width:640,height:480,getContext:()=>context};let calls=0;
 globals.Worker=WorkerMock;globals.window=new EventTarget();
 globals.createImageBitmap=()=>{calls++;if(deferBitmap&&calls===1)return new Promise(r=>resolveBitmap=r);return Promise.resolve({width:640,height:480,close(){}});};
 const probe=new HandProbe(video as any,canvas as any,()=>{},()=>delivered++,{targetHz:24});
 try{probe.start();worker.emit({type:'ready',delegate:'CPU'});await flush();await check({probe,worker,video,get delivered(){return delivered;},finishBitmap(){resolveBitmap({width:640,height:480,close(){oldClosed++;}});},get oldClosed(){return oldClosed;}});}
 finally{probe.stop();keys.forEach((k,i)=>{if(before[i]===undefined)delete globals[k];else globals[k]=before[i];});}
}
test('focus recovery discards pre-pause inference and processes a fresh frame without a new worker',async()=>{
 await withProbe(false,async h=>{
  assert.equal(h.worker.frames.length,1);const old=h.worker.frames[0];h.probe.pause();h.probe.resume();h.video.currentTime=2;
  h.worker.emit({type:'result',timestamp:old.timestamp,landmarks:[],worldLandmarks:[],inferenceMs:1});await flush();
  assert.equal(h.delivered,0);assert.equal(h.worker.frames.length,2);const fresh=h.worker.frames[1];
  h.worker.emit({type:'result',timestamp:fresh.timestamp,landmarks:[],worldLandmarks:[],inferenceMs:1});assert.equal(h.delivered,1);
 });
});
test('a bitmap captured before pause is closed instead of dispatched after resume',async()=>{
 await withProbe(true,async h=>{
  h.probe.pause();h.probe.resume();h.video.currentTime=2;h.finishBitmap();await flush();
  assert.equal(h.oldClosed,1);assert.equal(h.worker.frames.length,1);assert.equal(h.delivered,0);
  h.worker.emit({type:'result',timestamp:h.worker.frames[0].timestamp,landmarks:[],worldLandmarks:[],inferenceMs:1});assert.equal(h.delivered,1);
 });
});
