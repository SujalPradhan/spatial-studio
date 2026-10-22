import type {Packet} from '../types';
import {signedPhoneAngle} from './model';
import {MechanismStore} from './store';
export class JointPhoneInput {
 enabled=false;held=false;invert=false;lastFrame=0;private mustRelease=true;private reference:number[]|null=null;private baseAngle=0;private target:number|null=null;private source='';private screen=0;
 constructor(private store:MechanismStore,private completed:()=>void){}
 release(requireRelease=true){const was=this.held;this.store.end('phone');this.held=false;this.reference=null;this.target=null;if(requireRelease)this.mustRelease=true;if(was)this.completed();}
 frame(p:Packet,now:number){
  this.lastFrame=now;if(!this.enabled||this.store.state.frozen||!p.active||!p.visible||this.store.state.selected!=='lid'){this.release();return;}
  if(typeof p.invert==='boolean'&&p.invert!==this.invert){this.release();this.invert=p.invert;}
  if(this.source!==p.source||this.screen!==p.screenAngle){this.release();this.source=String(p.source);this.screen=Number(p.screenAngle);}
  if(!p.hold){this.release(false);this.mustRelease=false;return;}
  if(this.mustRelease||!Array.isArray(p.q))return;
  if(!this.reference){if(signedPhoneAngle(p.q,p.q,this.screen)===null||!this.store.begin('phone'))return;this.reference=[...p.q];this.baseAngle=this.store.state.pose.angle;this.held=true;}
  const delta=signedPhoneAngle(this.reference,p.q,this.screen);if(delta===null){this.release();return;}
  this.target=this.baseAngle+delta*(this.invert?-1:1);
 }
 tick(now:number,dt:number){if(now-this.lastFrame>400){const lost=this.held;this.release();return lost;}if(this.held&&this.target!==null){const angle=this.store.state.pose.angle+(this.target-this.store.state.pose.angle)*(1-Math.exp(-24*Math.min(dt,.05)));this.store.setPose({...this.store.state.pose,angle},'phone');}return false;}
}
