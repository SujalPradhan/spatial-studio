import {collision,move,validConfig,validPose,type Config,type Part,type Pose} from './model';
import type {State} from './store';
export interface Sample extends Pose {t:number;selected:Part}
export interface Step {t:number;text:string;kind:'move'|'marker'|'contact'|'interruption'}
export interface Take {id:string;name:string;config:Config;samples:Sample[];steps:Step[];duration:number;interrupted:boolean;input:string}
export class Recorder {
 take:Take|null=null;paused=false;private startTime=0;private pausedAt=0;private pausedTotal=0;
 start(state:State,now:number,input:string){this.startTime=now;this.pausedTotal=0;this.paused=false;this.take={id:crypto.randomUUID(),name:'Opening and removal',config:{...state.config},samples:[],steps:[],duration:0,interrupted:false,input};this.sample(state,now,true);}
 time(now:number){return Math.min(30000,Math.max(0,(this.paused?this.pausedAt:now)-this.startTime-this.pausedTotal));}
 sample(s:State,now:number,force=false){if(!this.take||this.paused)return;const t=this.time(now),last=this.take.samples.at(-1);if(last&&t<=last.t)return;if(!force&&last&&t-last.t<1000/60)return;if(this.take.samples.length>=1805)return;this.take.samples.push({t,...s.pose,selected:s.selected});this.take.duration=t;}
 step(text:string,kind:Step['kind'],now:number){if(!this.take||this.paused||this.take.steps.length>=500)return;this.take.steps.push({t:this.time(now),text:text.slice(0,240),kind});}
 pause(s:State,now:number,reason:string){if(!this.take||this.paused)return;this.sample(s,now,true);this.step(reason,'interruption',now);this.take.interrupted=true;this.pausedAt=now;this.paused=true;}
 resume(now:number){if(!this.take||!this.paused)return;this.pausedTotal+=now-this.pausedAt;this.paused=false;}
 finish(s:State,now:number){if(!this.take)return null;this.sample(s,now,true);const result=this.take;this.take=null;this.paused=false;return result.duration>=100?result:null;}
}
export function poseAt(take:Take,t:number):Sample{
 const samples=take.samples,time=Math.max(0,Math.min(take.duration,t));
 let lo=0,hi=samples.length-1;while(lo<hi){const m=Math.ceil((lo+hi)/2);if(samples[m].t<=time)lo=m;else hi=m-1;}
 const a=samples[lo],b=samples[Math.min(lo+1,samples.length-1)],u=b.t>a.t?Math.min(1,(time-a.t)/(b.t-a.t)):0;
 return {t:time,angle:a.angle+(b.angle-a.angle)*u,lift:a.lift+(b.lift-a.lift)*u,selected:a.selected};
}
export function validateTake(value:unknown):Take{
 if(!value||typeof value!=='object')throw new Error('Invalid take.');const t=value as Take;
 if(typeof t.id!=='string'||t.id.length>80||typeof t.name!=='string'||t.name.length>100||typeof t.input!=='string'||t.input.length>80||typeof t.interrupted!=='boolean'||!t.config||!validConfig(t.config)||!Number.isFinite(t.duration)||t.duration<100||t.duration>30000)throw new Error('Unsupported take configuration.');
 if(!Array.isArray(t.samples)||t.samples.length<2||t.samples.length>1805||!Array.isArray(t.steps)||t.steps.length>500)throw new Error('Invalid recording size.');
 let previous:Sample|null=null;
 for(const s of t.samples){
  if(!validPose(s)||s.angle>t.config.limit||!['lid','tray'].includes(s.selected)||!Number.isFinite(s.t)||s.t<0||s.t>t.duration||previous&&s.t<=previous.t||collision(s,t.config))throw new Error('Recording contains an invalid pose or timestamp.');
  if(previous){const accepted=move(previous,s,t.config).pose;if(Math.abs(accepted.angle-s.angle)>1e-6||Math.abs(accepted.lift-s.lift)>1e-6)throw new Error('Recording path crosses a part.');}previous=s;
 }
 if(t.samples[0].t!==0||t.samples.at(-1)!.t!==t.duration)throw new Error('Recording endpoints do not match its duration.');
 let stepTime=-1;for(const s of t.steps){if(!s||!Number.isFinite(s.t)||s.t<stepTime||s.t<0||s.t>t.duration||typeof s.text!=='string'||s.text.length>240||!['move','marker','contact','interruption'].includes(s.kind))throw new Error('Invalid step.');stepTime=s.t;}
 return {id:t.id,name:t.name,input:t.input,interrupted:t.interrupted,duration:t.duration,config:{fixture:t.config.fixture,limit:t.config.limit},samples:t.samples.map(s=>({t:s.t,angle:s.angle,lift:s.lift,selected:s.selected})),steps:t.steps.map(s=>({t:s.t,text:s.text,kind:s.kind}))};
}
export function exportTakes(takes:Take[]){return {schema:1,fixture:'hinged-box-v1',units:{angle:'degrees',lift:'mm',time:'ms'},takes};}
export function importTakes(text:string):Take[]{
 if(text.length>2*1024*1024)throw new Error('Use a file smaller than 2 MB.');const data=JSON.parse(text);
 if(data.schema!==1||data.fixture!=='hinged-box-v1'||data.units?.angle!=='degrees'||data.units?.lift!=='mm'||data.units?.time!=='ms'||!Array.isArray(data.takes)||data.takes.length<1||data.takes.length>3)throw new Error('Unsupported demonstration format.');
 const takes=data.takes.map(validateTake);if(new Set(takes.map((t:Take)=>t.id)).size!==takes.length)throw new Error('Duplicate take identifiers.');return takes;
}
