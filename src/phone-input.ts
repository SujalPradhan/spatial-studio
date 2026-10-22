import {Quaternion,Vector3} from 'three';
import {SceneStore} from './scene-state';
import type {Packet,Quat} from './types';
export class PhoneInput {
 enabled=false;held=false;lastFrame=0;private lastDepth:number|null=null;private screen:number|null=null;private source='';
 private mustRelease=true;private start:Quaternion|null=null;private base=new Quaternion();target:Quaternion|null=null;
 private map=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-Math.PI/2);
 constructor(private store:SceneStore){}
 release(requireRelease=true){this.store.end('phone');this.held=false;this.start=null;this.target=null;if(requireRelease){this.mustRelease=true;this.store.end('phone-depth');}}
 frame(p:Packet,now:number){
  this.lastFrame=now;
  if(!this.enabled||this.store.state.frozen||!p.active||!p.visible){this.release();return;}
  const angle=Number(p.screenAngle)||0,source=String(p.source);
  if(this.screen!==angle||this.source!==source){this.release();this.screen=angle;this.source=source;}
  const depth=Number(p.depth);if(Number.isFinite(depth)&&this.lastDepth!==depth){if(this.lastDepth!==null){this.store.begin('phone-depth');this.store.update({depth:Math.max(-1.8,Math.min(1.8,depth))});}this.lastDepth=depth;}
  if(!p.depthActive)this.store.end('phone-depth');
  if(!p.hold){this.release(false);this.mustRelease=false;return;}
  if(this.mustRelease)return;
  const q=p.q;if(!Array.isArray(q)||q.length!==4||!q.every(v=>typeof v==='number'&&Number.isFinite(v))||!Number.isFinite(Math.hypot(...q))||Math.hypot(...q)<.9||Math.hypot(...q)>1.1){this.release();return;}
  // A stationary orientation may suppress new readings. Connection/visibility
  // heartbeats, rather than a non-changing pose timestamp, govern release.
  const current=new Quaternion().fromArray(q as Quat).normalize().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-angle*Math.PI/180));
  if(!this.start){this.start=current.clone();this.base.fromArray(this.store.state.plane);this.store.begin('phone');}
  const delta=this.start.clone().invert().multiply(current);const mapped=this.map.clone().multiply(delta).multiply(this.map.clone().invert());
  this.target=this.base.clone().multiply(mapped).normalize();this.held=true;
 }
 tick(now:number,dt:number){
  if(now-this.lastFrame>400){this.release();return;}
  if(this.held&&this.target&&!this.store.state.frozen){const q=new Quaternion().fromArray(this.store.state.plane).slerp(this.target,1-Math.exp(-18*dt));if(q.angleTo(new Quaternion().fromArray(this.store.state.plane))>1e-7)this.store.update({plane:q.toArray() as Quat});}
 }
}
