import {signedPhoneAngle} from '../mechanism/model';
import type {Packet} from '../types';
import {StandStore} from './model';
export class StandPhoneInput {
 enabled=false;held=false;lastFrame=0;private rearm=true;private reference:number[]|null=null;private base=0;private target:number|null=null;private source='';private screen=0;private invert=false;
 constructor(private store:StandStore){}
 release(requireRelease=true){this.store.end('phone');this.held=false;this.reference=null;this.target=null;if(requireRelease)this.rearm=true;}
 frame(p:Packet,now:number){
  this.lastFrame=now;if(!this.enabled||!p.active||!p.visible||this.store.state.frozen){this.release();return;}
  if(p.source!==this.source||p.screenAngle!==this.screen||!!p.invert!==this.invert){this.release();this.source=String(p.source);this.screen=Number(p.screenAngle);this.invert=!!p.invert;}
  if(!p.hold){this.release(false);this.rearm=false;return;}
  if(this.rearm||!Array.isArray(p.q))return;
  if(!this.reference){if(signedPhoneAngle(p.q,p.q,this.screen)===null||!this.store.begin('phone'))return;this.reference=[...p.q];this.base=this.store.state.angle;this.held=true;}
  const delta=signedPhoneAngle(this.reference,p.q,this.screen);if(delta===null){this.release();return;}this.target=this.base+delta*(this.invert?-1:1);
 }
 tick(now:number,dt:number){if(now-this.lastFrame>400){this.release();return;}if(this.held&&this.target!==null)this.store.set(this.store.state.angle+(this.target-this.store.state.angle)*(1-Math.exp(-24*Math.min(dt,.05))),'phone');}
}
