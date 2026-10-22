import type {Packet} from '../types';
import {ControlClient} from '../control';
export class MechanismLink {
 readonly client:ControlClient;
 get socket(){return this.client.socket;}get connected(){return this.client.connected;}get epoch(){return this.client.epoch;}
 get context(){return this.client.context;}set context(n:number){this.client.context=n;}
 constructor(role:'phone'|'desktop',token:string,receive:(p:Packet)=>void){
  this.client=new ControlClient(role,token,p=>{
   if(['local-release','lost'].includes(p.type)){receive({type:'lost'});return;}
   receive(p);
  },location.pathname==='/mechanism'?{fixture:'folding-stand-v1',selected:'backrest',angle:60,limit:80,enabled:false,frozen:false,context:0,phase:'idle',duration:0,time:0}:{selected:'lid',angle:0,lift:0,limit:120,enabled:false,frozen:false,context:0,phase:'idle',duration:0,time:0});
 }
 send(p:Packet){return this.client.send(p);}
 close(){this.client.close();}
}
