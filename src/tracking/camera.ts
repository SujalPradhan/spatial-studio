import {HandProbe,type Landmark,type HandFrameMeta} from '../hand-probe';
import type {CameraIdentity} from './model';
export class TrackingCamera {
 stream:MediaStream|null=null;probe:HandProbe|null=null;identity:CameraIdentity|null=null;starting=false;private generation=0;private sequence=0;
 facing:'user'|'environment'='user';
 metrics:Record<string,unknown>={};
 constructor(readonly video:HTMLVideoElement,readonly canvas:HTMLCanvasElement,private mobile:boolean,private frame:(hands:Landmark[][],meta:HandFrameMeta)=>void,private status:(message:string)=>void){}
 async start(){
 if(this.stream){this.resume();return;}if(this.starting)return;this.starting=true;const generation=++this.generation;this.status('Opening camera…');
 try{
 const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30},...(this.mobile?{facingMode:{ideal:this.facing}}:{})}});
 if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
 this.stream=stream;this.video.srcObject=stream;await this.video.play();if(generation!==this.generation)return;
 this.identity={captureId:crypto.randomUUID(),width:this.video.videoWidth,height:this.video.videoHeight};
 const settings=stream.getVideoTracks()[0].getSettings();this.metrics={settings:{width:settings.width,height:settings.height,frameRate:settings.frameRate,facingMode:settings.facingMode},status:'starting'};
 stream.getVideoTracks()[0].onended=()=>this.stop('Camera disconnected.');
 this.sequence=0;this.launch();
 }catch(e){if(generation===this.generation)this.stop(e instanceof Error?e.message:String(e));}finally{if(generation===this.generation)this.starting=false;}
 }
 private launch(){if(!this.stream||this.probe)return;
 this.probe=new HandProbe(this.video,this.canvas,(data,message)=>{this.metrics={...this.metrics,...data};if(data.status==='error'){this.stop(message);return;}this.status(message);},(hands,_t,_world,meta)=>{if(!this.identity||!meta)return;if(meta.width!==this.identity.width||meta.height!==this.identity.height){this.stop('Camera dimensions changed. Start again and recalibrate.');return;}this.frame(hands,{...meta,frameId:++this.sequence});});this.probe.start();
 }
 pause(){if(this.starting&&!this.identity){this.stop('Camera startup paused. Start again.');return;}this.generation++;this.probe?.stop();this.probe=null;this.video.pause();this.status('Tracking paused. Camera session retained for calibration.');}
 resume(){if(!this.stream||this.probe)return;const generation=this.generation;void this.video.play().then(()=>{if(generation===this.generation)this.launch();}).catch(e=>{if(generation===this.generation)this.stop(String(e));});}

 stop(message='Camera stopped.'){
 this.generation++;this.starting=false;this.probe?.stop();this.probe=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.video.srcObject=null;this.identity=null;this.metrics={status:'off'};this.status(message);
 }
 photo(){if(!this.identity||!this.stream)throw Error('Start the camera first.');const c=document.createElement('canvas');c.width=this.video.videoWidth;c.height=this.video.videoHeight;c.getContext('2d')!.drawImage(this.video,0,0);for(const quality of [.85,.65,.45]){const jpeg=c.toDataURL('image/jpeg',quality);if(jpeg.length<110000)return {jpeg,...this.identity};}throw Error('Image too large. Try lower camera resolution.');}
}
