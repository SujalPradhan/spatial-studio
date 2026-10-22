import {Euler,Quaternion,Vector3} from 'three';
import type {Quat} from './types';
import type {Solid} from './geometry';
export interface ViewState {x:number;y:number;zoom:number}
export interface SceneState {solid:Solid;object:Quat;plane:Quat;depth:number;frozen:boolean;view:ViewState}
export const identity:Quat=[0,0,0,1];
export const initialState=():SceneState=>({solid:'cone',object:[...identity],plane:[...identity],depth:0,frozen:false,view:{x:0,y:0,zoom:1}});
export const cloneState=(s:SceneState):SceneState=>({...s,object:[...s.object],plane:[...s.plane],view:{...s.view}});
const signature=(s:SceneState)=>JSON.stringify([s.solid,s.object,s.plane,s.depth,s.view]);
export const planeNormal=(s:SceneState)=>new Vector3(0,1,0).applyQuaternion(new Quaternion().fromArray(s.plane));
export const planeAngles=(pitch:number,roll:number)=>new Quaternion().setFromEuler(new Euler(pitch*Math.PI/180,0,roll*Math.PI/180)).toArray() as Quat;
export class SceneStore {
 state=initialState();revision=0;history:SceneState[]=[];private before:SceneState|null=null;private owners=new Set<string>();
 onChange:()=>void=()=>{};
 begin(owner:string){if(this.state.frozen)return;this.before??=cloneState(this.state);this.owners.add(owner);}
 update(patch:Partial<SceneState>,force=false){if(this.state.frozen&&!force)return;this.state=cloneState({...this.state,...patch});this.revision++;this.onChange();}
 end(owner:string){this.owners.delete(owner);if(!this.owners.size)this.commit();}
 private commit(){if(this.before&&signature(this.before)!==signature(this.state)){this.history.push(this.before);if(this.history.length>60)this.history.shift();this.onChange();}this.before=null;}
 finish(){this.owners.clear();this.commit();}
 action(patch:Partial<SceneState>){if(this.state.frozen)return;this.finish();this.begin('action');this.update(patch);this.end('action');}
 freeze(value:boolean){this.finish();this.update({frozen:value},true);}
 undo(){this.finish();const previous=this.history.pop();if(previous)this.update({...previous,frozen:this.state.frozen},true);}
 reset(){this.finish();this.update({frozen:false},true);this.begin('reset');this.update({...initialState(),solid:this.state.solid});this.end('reset');}
}
export function trackballPoint(x:number,y:number,aspect:number){const v=new Vector3((x-.5)*2*aspect,(.5-y)*2,0);const d=v.lengthSq();if(d<=1)v.z=Math.sqrt(1-d);else v.normalize();return v;}
export function trackballRotation(from:{x:number;y:number},to:{x:number;y:number},base:Quat,camera:Quaternion,aspect:number):Quat{
 const a=trackballPoint(from.x,from.y,aspect),b=trackballPoint(to.x,to.y,aspect);
 const delta=new Quaternion().setFromUnitVectors(a,b);delta.premultiply(camera).multiply(camera.clone().invert());
 return delta.multiply(new Quaternion().fromArray(base)).normalize().toArray() as Quat;
}
