import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/hand-worker.js',import.meta.url),'utf8');
function harness(failInit=false,failFrame=false){
 const delegates:string[]=[],messages:any[]=[];let closed=0;
 const self:any={postMessage:(p:any)=>messages.push(p)};
 const context=vm.createContext({self,performance,OffscreenCanvas:class{},importScripts(){},Vision:{FilesetResolver:{forVisionTasks:async()=>({})},HandLandmarker:{createFromOptions:async(_files:any,options:any)=>{const delegate=options.baseOptions.delegate;delegates.push(delegate);if(failInit&&delegate==='GPU')throw Error('No WebGL');return {close(){closed++;if(failFrame&&delegate==='GPU')throw Error('Lost GPU context');},detectForVideo(){if(failFrame&&delegate==='GPU')throw Error('GPU context lost');return {landmarks:[],worldLandmarks:[]};}};}}}});
 vm.runInContext(source,context);return {self,delegates,messages,get closed(){return closed;}};
}
test('mobile worker falls back to CPU when GPU initialization is unavailable',async()=>{
 const h=harness(true);await h.self.onmessage({data:{type:'init',preferGPU:true}});
 assert.deepEqual(h.delegates,['GPU','CPU']);assert.equal(h.messages.at(-1).delegate,'CPU');
});
test('GPU context loss retries the same frame on CPU and closes its bitmap exactly once',async()=>{
 const h=harness(false,true);await h.self.onmessage({data:{type:'init',preferGPU:true}});let closed=0;
 await h.self.onmessage({data:{type:'frame',timestamp:10,bitmap:{close(){closed++;}}}});
 assert.deepEqual(h.delegates,['GPU','CPU']);assert.equal(h.messages.at(-1).type,'result');assert.equal(h.messages.at(-1).delegate,'CPU');assert.equal(closed,1);assert.equal(h.closed,1);
});
test('ordinary webcam worker keeps the existing CPU default',async()=>{
 const h=harness();await h.self.onmessage({data:{type:'init'}});assert.deepEqual(h.delegates,['CPU']);
});
