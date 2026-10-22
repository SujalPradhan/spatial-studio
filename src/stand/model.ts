export const MAX_ANGLE=80;
export const FIXTURE='folding-stand-v1';
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export interface View {x:number;y:number;zoom:number;yaw:number;pitch:number}
export interface State {angle:number;view:View;frozen:boolean}
export const initial=():State=>({angle:60,view:{x:0,y:0,zoom:1,yaw:0,pitch:0},frozen:false});
// Coordinates in mm. Positive rotation folds the backrest up from the base.
export function backrestPoint(x:number,y:number,z:number,angle:number):[number,number,number]{
 const r=angle*Math.PI/180;return [x,15+y*Math.cos(r)-z*Math.sin(r),100+y*Math.sin(r)+z*Math.cos(r)];
}
export class StandStore {
 state=initial();owner:string|null=null;revision=0;
 history:({angle:number}|{view:View})[]=[];private before:number|null=null;private beforeView:View|null=null;
 private changed(){this.revision++;}
 begin(owner:string){if(this.state.frozen||this.owner&&this.owner!==owner)return false;if(!this.owner){this.owner=owner;this.before=this.state.angle;}return true;}
 set(angle:number,owner:string){if(this.owner!==owner||this.state.frozen||!Number.isFinite(angle))return false;this.state.angle=clamp(angle,0,MAX_ANGLE);this.changed();return true;}
 private save(entry:{angle:number}|{view:View}){this.history.push(entry);if(this.history.length>60)this.history.shift();}
 end(owner?:string){if(!this.owner&&this.before===null)return;if(owner&&this.owner!==owner)return;if(this.before!==null&&Math.abs(this.before-this.state.angle)>1e-8)this.save({angle:this.before});this.before=null;this.owner=null;this.changed();}
 action(angle:number){if(!this.begin('action'))return;this.set(angle,'action');this.end('action');}
 beginView(){if(!this.state.frozen)this.beforeView??={...this.state.view};}
 setView(patch:Partial<View>){if(this.state.frozen||Object.values(patch).some(n=>!Number.isFinite(n)))return;const v={...this.state.view,...patch};v.x=clamp(v.x,-350,350);v.y=clamp(v.y,-250,250);v.zoom=clamp(v.zoom,.5,3);v.pitch=clamp(v.pitch,-.4,1);this.state.view=v;this.changed();}
 endView(){if(this.beforeView&&JSON.stringify(this.beforeView)!==JSON.stringify(this.state.view))this.save({view:this.beforeView});this.beforeView=null;this.changed();}
 viewAction(patch:Partial<View>){this.beginView();this.setView(patch);this.endView();}
 undo(){if(this.state.frozen)return;this.end();this.endView();const entry=this.history.pop();if(entry){if('angle' in entry)this.state.angle=entry.angle;else this.state.view={...entry.view};this.changed();}}
 freeze(){this.end();this.endView();this.state.frozen=!this.state.frozen;this.changed();}
}
export interface SavedPose {name:string;angle:number}
export function readPoses(value:unknown):SavedPose[]{
 if(!Array.isArray(value))return [];
 return value.slice(0,8).filter(p=>p&&typeof p.name==='string'&&p.name.length<=40&&Number.isFinite(p.angle)&&p.angle>=0&&p.angle<=MAX_ANGLE).map(p=>({name:p.name,angle:p.angle}));
}
