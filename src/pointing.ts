import type {Landmark} from './fist';
const dist=(a:Landmark,b:Landmark)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function isPointing(h:Landmark[]){
 if(h.length!==21||h.some(p=>![p.x,p.y,p.z].every(Number.isFinite)))return false;
 const extended=(m:number)=>dist(h[m+3],h[0])>dist(h[m+1],h[0])*1.2;
 const curled=(m:number)=>dist(h[m+3],h[0])<dist(h[m+1],h[0])*1.1;
 return dist(h[0],h[9])>1e-5&&extended(5)&&[9,13,17].every(curled);
}
export class Dwell {
 private target:string|null=null;private started=0;private latched=false;
 reset(){this.target=null;this.latched=false;}
 update(target:string|null,time:number){if(!target){this.reset();return {progress:0,select:null};}if(target!==this.target){this.target=target;this.started=time;this.latched=false;}const progress=Math.min(1,Math.max(0,(time-this.started)/500));const select=progress===1&&!this.latched?target:null;if(select)this.latched=true;return {progress,select};}
}
