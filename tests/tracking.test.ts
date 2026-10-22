import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCalibration,triangulate,nearestFrame,type TrackingFrame,type Calibration} from '../src/tracking/model';
// @ts-ignore Shared relay validator.
import {validTrackingFrame,validTrackingPhoto} from '../tracking-protocol.mjs';
const c:Calibration={schema:'spatial-stereo-v1',units:'mm',desktop:{captureId:'desktop',width:640,height:480},phone:{captureId:'phone',width:640,height:480},K1:[800,0,320,0,800,240,0,0,1],K2:[800,0,320,0,800,240,0,0,1],D1:[0,0,0,0,0],D2:[0,0,0,0,0],R:[1,0,0,0,1,0,0,0,1],T:[-250,0,0],rms:.2};
function frame(phone=false,x=50,y=20,z=650):TrackingFrame {const id=phone?c.phone:c.desktop;return {...id,frameId:1,hands:[Array.from({length:21},()=>({x:(800*(x-(phone?250:0))/z+320)/640,y:(800*y/z+240)/480,z:0}))],frameAt:1000,dispatchAt:1010,videoTimeMs:100,timestampSource:'video-presentation-estimate',clockRttMs:30,inferenceMs:10,processedHz:25};}
test('calibrated rays recover known metric position; guards reject mismatched cameras, timing, identity and pose',()=>{
 const cal=parseCalibration(c),a=frame(),b=frame(true);const e=triangulate(a,b,cal).estimate!;assert.ok(e);assert.ok(Math.hypot(...e.point.map((v,i)=>v-[50,20,650][i]))<1e-6);
 assert.ok(!triangulate(a,{...b,frameAt:1100},cal).estimate);assert.ok(!triangulate(a,{...b,captureId:'another'},cal).estimate);assert.ok(!triangulate(a,{...b,hands:[...b.hands,...b.hands]},cal).estimate);assert.ok(!triangulate(a,{...b,clockRttMs:900},cal).estimate);
 const wrong=frame(true);wrong.hands[0][8].y+=.1;assert.ok(!triangulate(a,wrong,cal).estimate);
 assert.throws(()=>parseCalibration({...c,units:'metres'}));assert.throws(()=>parseCalibration({...c,T:[0,0,0]}));assert.throws(()=>parseCalibration({...c,R:[1,0,0,0,1,0,0,0,-1]}));assert.throws(()=>parseCalibration({...c,rms:5}));
 assert.equal(nearestFrame([a,{...a,frameId:2,frameAt:1020}],1019)?.frameId,2);
});
test('triangulation undistorts Brown-Conrady lens observations',()=>{
 const cal=parseCalibration({...c,D1:[.12,-.04,.001,-.002,0],D2:[-.09,.03,-.001,.001,0]});
 const project=(phone:boolean)=>{const d=phone?cal.D2:cal.D1,x=(60-(phone?250:0))/700,y=-40/700,r=x*x+y*y,s=1+d[0]*r+d[1]*r*r;return {x:(800*(x*s+2*d[2]*x*y+d[3]*(r+2*x*x))+320)/640,y:(800*(y*s+d[2]*(r+2*y*y)+2*d[3]*x*y)+240)/480,z:0};};
 const a=frame(),b=frame(true);a.hands[0][8]=project(false);b.hands[0][8]=project(true);const e=triangulate(a,b,cal).estimate!;assert.ok(e);assert.ok(Math.hypot(...e.point.map((v,i)=>v-[60,-40,700][i]))<.001);
});
test('tracking transport bounds landmark counts, numbers, images and metadata',()=>{
 const f=frame();assert.ok(validTrackingFrame(f));assert.ok(!validTrackingFrame({...f,hands:[[...f.hands[0],f.hands[0][0]]]}));assert.ok(!validTrackingFrame({...f,inferenceMs:Infinity}));assert.ok(!validTrackingFrame({...f,timestampSource:'exposure'}));assert.ok(!validTrackingFrame({...f,captureId:'../other'}));
 assert.ok(validTrackingPhoto({...c.phone,requestId:'request',jpeg:'data:image/jpeg;base64,YWJj'}));assert.ok(!validTrackingPhoto({...c.phone,requestId:'request',jpeg:'data:text/html;base64,YWJj'}));
});
// @ts-ignore Shared coordinator.
import {createControlRoom} from '../control-room.mjs';
test('tracking photos require a live explicit request and cannot cross acknowledgement, context or workspace boundaries',()=>{
 class Peer extends EventTarget{readyState=1;bufferedAmount=0;out:any[]=[];seq=0;send(raw:string){this.out.push(JSON.parse(raw));}close(){this.readyState=3;this.dispatchEvent(new Event('close'));}input(p:Record<string,unknown>){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({v:2,seq:this.seq++,...p})}));}}
 const room=createControlRoom(),d=new Peer(),p=new Peer();room.connect(d,'desktop');room.connect(p,'phone');
 const state={enabled:true,frozen:false,context:0,captureEnabled:true,trackingSession:'session'};
 d.input({type:'activate',workspace:'tracking',documentId:'tracking',focused:true,visible:true,state});const epoch=room.status.epoch;
 const photo={type:'tracking-photo',epoch,context:0,...c.phone,requestId:'first',jpeg:'data:image/jpeg;base64,YWJj'};
 p.input(photo);assert.equal(d.out.filter(x=>x.type==='tracking-photo').length,0);
 p.input({type:'ack',epoch,context:0,documentId:'tracking'});p.input({...frame(true),type:'tracking-frame',epoch,context:0,at:Date.now()});assert.equal(d.out.filter(x=>x.type==='tracking-frame').length,1);
 p.input(photo);assert.equal(d.out.filter(x=>x.type==='tracking-photo').length,0);
 d.input({type:'tracking-capture',epoch,context:0,requestId:'first'});assert.equal(p.out.filter(x=>x.type==='tracking-capture').length,1);p.input(photo);p.input(photo);assert.equal(d.out.filter(x=>x.type==='tracking-photo').length,1);
 d.input({type:'tracking-capture',epoch,context:0,requestId:'second'});d.input({type:'state',epoch,state:{...state,context:1}});p.input({...photo,requestId:'second',context:1});assert.equal(d.out.filter(x=>x.type==='tracking-photo').length,1);
 d.input({type:'release',epoch});p.input({...photo,requestId:'second'});assert.equal(d.out.filter(x=>x.type==='tracking-photo').length,1);
});
import {TrackingCamera} from '../src/tracking/camera';
test('pausing an in-flight resume retains camera identity and ignores play cancellation',async()=>{
 let rejectPlay:(reason:unknown)=>void=()=>{},stopped=false;
 const video={play:()=>new Promise<void>((_resolve,reject)=>rejectPlay=reject),pause:()=>rejectPlay(new Error('play interrupted')),srcObject:null} as unknown as HTMLVideoElement;
 const camera=new TrackingCamera(video,{} as HTMLCanvasElement,false,()=>{},()=>{});
 camera.stream={getTracks:()=>[{stop:()=>stopped=true}]} as unknown as MediaStream;camera.identity={captureId:'kept',width:640,height:480};
 camera.resume();camera.pause();await Promise.resolve();await Promise.resolve();
 assert.equal(camera.identity?.captureId,'kept');assert.ok(camera.stream);assert.equal(stopped,false);
});
