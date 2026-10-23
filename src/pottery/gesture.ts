import {fistPose,type Landmark} from '../fist';
export interface TwoHandFrame {phase:'idle'|'hover'|'start'|'move'|'end';band:number;gap:number;message:string}
const anchor=(h:Landmark[])=>[0,5,9,13,17].reduce((p,i)=>({x:p.x+h[i].x/5,y:p.y+h[i].y/5}),{x:0,y:0});
export class TwoHandGate {
 constructor(private bandHysteresis=0){}
 private armed=false;private active=false;private candidate:number|null=null;private previous:Landmark[]|null=null;private band=16;private lastTime:number|null=null;
 reset(message='Open both hands to choose a height.'):TwoHandFrame{const active=this.active;this.armed=false;this.active=false;this.candidate=null;this.previous=null;this.lastTime=null;return {phase:active?'end':'idle',band:this.band,gap:0,message};}
 update(hands:Landmark[][],time:number,aspect=1):TwoHandFrame{
 if(this.lastTime!==null&&(time-this.lastTime>400||time<this.lastTime))this.reset();this.lastTime=time;
 if(hands.length!==2||hands.some(h=>h.length!==21||h.some(p=>![p.x,p.y,p.z].every(Number.isFinite))))return this.reset('Show both hands. Open them before grabbing.');
 let ordered=[...hands].sort((a,b)=>a[0].x-b[0].x);
 const dist=(a:Landmark,b:Landmark)=>Math.hypot(a.x-b.x,a.y-b.y);
 if(this.previous){const normal=dist(ordered[0][0],this.previous[0])+dist(ordered[1][0],this.previous[1]),swapped=dist(ordered[1][0],this.previous[0])+dist(ordered[0][0],this.previous[1]);if(swapped<normal||ordered.some((h,i)=>dist(h[0],this.previous![i])>.2))return this.reset('Hands crossed or moved out of view. Open both to restart.');}
 const anchors=ordered.map(anchor);if(anchors[1].x-anchors[0].x<.12||anchors.some(p=>p.x<.02||p.x>.98||p.y<.02||p.y>.98))return this.reset('Keep your hands apart and inside the picture.');
 this.previous=ordered.map(h=>h[0]);const poses=ordered.map(h=>fistPose(h.map(p=>({...p,y:p.y/Math.max(.1,aspect)}))));const gap=anchors[1].x-anchors[0].x;
 if(poses.every(p=>p.open)){
 const was=this.active;this.active=false;this.armed=true;this.candidate=null;const nextBand=Math.max(0,Math.min(1,(.85-(anchors[0].y+anchors[1].y)/2)/.7))*32;if(Math.abs(nextBand-this.band)>this.bandHysteresis)this.band=Math.round(nextBand);
 return {phase:was?'end':'hover',band:this.band,gap,message:'Height selected. Close both fists, then move them apart or together.'};}
 if(this.active){if(poses.some(p=>p.open||p.curled<3||p.extended>=2))return this.reset('Released. Open both hands to choose the next height.');return {phase:'move',band:this.band,gap,message:'Shaping this band. Open either hand to stop.'};}
 if(this.armed&&poses.every(p=>p.closed)){this.candidate??=time;if(time-this.candidate>=120){this.active=true;this.armed=false;return {phase:'start',band:this.band,gap,message:'Grabbed. Move fists apart to widen, together to narrow.'};}return {phase:'idle',band:this.band,gap,message:'Hold both fists briefly…'};}
 this.candidate=null;return {phase:'idle',band:this.band,gap,message:'Open both hands, then close both fists.'};
 }
}

// Smooth small phone-camera tremor while following deliberate spacing changes.
// Release is handled before this filter; it never animates a pending target.
export class PhoneGapFilter {
 private value:number|null=null;private time:number|null=null;private speed=0;
 reset(){this.value=null;this.time=null;this.speed=0;}
 update(value:number,time:number){
  if(this.value===null||this.time===null||time<=this.time||time-this.time>400){this.value=value;this.time=time;this.speed=0;return value;}
  const dt=(time-this.time)/1000;this.speed+=.5*((value-this.value)/dt-this.speed);
  const alpha=1-Math.exp(-2*Math.PI*(3+12*Math.abs(this.speed))*dt);
  this.value+=alpha*(value-this.value);this.time=time;return this.value;
 }
}
