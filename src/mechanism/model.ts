import {Matrix3, Matrix4, Quaternion, Vector3} from 'three';
import {OBB} from 'three/addons/math/OBB.js';
export type Part='lid'|'tray';
export type Fixture='clear'|'shelf';
export interface Pose {angle:number;lift:number}
export interface Config {fixture:Fixture;limit:number}
export interface Panel {id:string;part:'body'|Part|'shelf';size:[number,number,number];center:[number,number,number];rotation:number}
export interface Contact {parts:string[];message:string}
export const CONTACT_TOLERANCE=.02; // mm; touching surfaces may share a boundary.
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export const validPose=(p:Pose)=>Number.isFinite(p.angle)&&Number.isFinite(p.lift)&&p.angle>=0&&p.angle<=120&&p.lift>=0&&p.lift<=160;
export const validConfig=(c:Config)=>['clear','shelf'].includes(c.fixture)&&Number.isFinite(c.limit)&&c.limit>=0&&c.limit<=120;
export function panels(p:Pose,c:Config):Panel[]{
 const box=(id:string,part:Panel['part'],size:Panel['size'],center:Panel['center'],rotation=0):Panel=>({id,part,size,center,rotation});
 const out=[box('floor','body',[240,8,160],[0,4,0]),box('left wall','body',[8,100,160],[-116,50,0]),box('right wall','body',[8,100,160],[116,50,0]),box('front wall','body',[224,100,8],[0,50,76]),box('rear wall','body',[224,100,8],[0,50,-76])];
 const r=-p.angle*Math.PI/180;const v=new Vector3(0,4,80).applyAxisAngle(new Vector3(1,0,0),r).add(new Vector3(0,100,-80));
 out.push(box('lid','lid',[240,8,160],v.toArray() as Panel['center'],r));
 const y=60+p.lift;
 out.push(box('tray floor','tray',[212,3,132],[0,y+1.5,0]),box('tray left','tray',[3,30,132],[-104.5,y+15,0]),box('tray right','tray',[3,30,132],[104.5,y+15,0]),box('tray front','tray',[206,30,3],[0,y+15,64.5]),box('tray rear','tray',[206,30,3],[0,y+15,-64.5]));
 if(c.fixture==='shelf')out.push(box('overhead shelf','shelf',[300,10,210],[0,190,15]));
 return out;
}
function bounds(p:Panel){return new OBB(new Vector3(...p.center),new Vector3(...p.size).multiplyScalar(.5).addScalar(-CONTACT_TOLERANCE/2),new Matrix3().setFromMatrix4(new Matrix4().makeRotationX(p.rotation)));}
export function collision(p:Pose,c:Config):Contact|null{
 const list=panels(p,c),boxes=list.map(bounds);
 for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
  const a=list[i],b=list[j];if(a.part===b.part||!([a.part,b.part].includes('lid')||[a.part,b.part].includes('tray')))continue;
  if(boxes[i].intersectsOBB(boxes[j]))return {parts:[a.part,b.part],message:`Movement blocked: ${a.id} meets ${b.id}.`};
 }
 return null;
}
// Maximum surface travel per subdivision is <0.5 mm, below the thinnest 3 mm panel.
// Test every step, then refine the first contact; endpoints alone can tunnel.
export function move(from:Pose,to:Pose,c:Config):{pose:Pose;contact:Contact|null}{
 if(!validPose(from)||!validConfig(c)||collision(from,c))return {pose:{...from},contact:{parts:[],message:'Invalid starting configuration.'}};
 if(!Number.isFinite(to.angle)||!Number.isFinite(to.lift))return {pose:{...from},contact:{parts:[],message:'Invalid movement.'}};
 const target={angle:clamp(to.angle,0,c.limit),lift:clamp(to.lift,0,160)};
 const limit:Contact|null=target.angle!==to.angle?{parts:['lid'],message:'Lid opening limit reached.'}:target.lift!==to.lift?{parts:['tray'],message:'Tray travel limit reached.'}:null;
 const steps=Math.max(1,Math.ceil((Math.abs(target.angle-from.angle)*Math.PI/180*161+Math.abs(target.lift-from.lift))/.5));
 const at=(t:number)=>({angle:from.angle+(target.angle-from.angle)*t,lift:from.lift+(target.lift-from.lift)*t});
 let previous=0;
 for(let i=1;i<=steps;i++){
  const t=i/steps,hit=collision(at(t),c);
  if(hit){let lo=previous,hi=t;for(let k=0;k<16;k++){const mid=(lo+hi)/2;if(collision(at(mid),c))hi=mid;else lo=mid;}return {pose:at(lo),contact:hit};}
  previous=t;
 }
 return {pose:target,contact:limit};
}
export function signedPhoneAngle(start:number[],current:number[],screen=0){
 const valid=(q:number[])=>q.length===4&&q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<.1;
 if(!valid(start)||!valid(current))return null;
 const screenQ=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-screen*Math.PI/180);
 const a=new Quaternion().fromArray(start).normalize().multiply(screenQ),b=new Quaternion().fromArray(current).normalize().multiply(screenQ);
 const delta=a.invert().multiply(b);if(Math.hypot(delta.x,delta.w)<1e-5)return null;
 let degrees=2*Math.atan2(delta.x,delta.w)*180/Math.PI;
 degrees=((degrees+180)%360+360)%360-180;return degrees;
}
