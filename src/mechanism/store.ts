import {clamp,collision,move,validConfig,type Config,type Contact,type Part,type Pose} from './model';
export interface View {x:number;y:number;zoom:number;yaw:number;pitch:number}
export interface State {pose:Pose;config:Config;selected:Part;view:View;frozen:boolean}
export const initial=():State=>({pose:{angle:0,lift:0},config:{fixture:'clear',limit:120},selected:'lid',view:{x:0,y:0,zoom:1,yaw:0,pitch:0},frozen:false});
export const clone=(s:State):State=>structuredClone(s);
export class MechanismStore {
 state=initial();revision=0;history:State[]=[];owner:string|null=null;contact:Contact|null=null;private before:State|null=null;
 private scopes:('mechanism'|'view')[]=[];private beforeView:State|null=null;
 onChange=()=>{};onContact=(_c:Contact)=>{};
 begin(owner:string){if(this.state.frozen||this.owner&&this.owner!==owner)return false;if(!this.owner){this.owner=owner;this.before=clone(this.state);}return true;}
 private save(state:State,scope:'mechanism'|'view'){this.history.push(state);this.scopes.push(scope);if(this.history.length>60){this.history.shift();this.scopes.shift();}}
 end(owner?:string){if(owner&&this.owner!==owner)return;if(this.before&&JSON.stringify([this.before.pose,this.before.config])!==JSON.stringify([this.state.pose,this.state.config]))this.save(this.before,'mechanism');this.before=null;this.owner=null;this.changed();}
 beginView(){if(!this.state.frozen)this.beforeView??=clone(this.state);}
 endView(){if(this.beforeView&&JSON.stringify(this.beforeView.view)!==JSON.stringify(this.state.view))this.save(this.beforeView,'view');this.beforeView=null;this.changed();}
 viewAction(patch:Partial<View>){this.beginView();this.view(patch);this.endView();}
 changed(){this.revision++;this.onChange();}
 setPose(pose:Pose,owner:string){if(this.owner!==owner||this.state.frozen)return false;const r=move(this.state.pose,pose,this.state.config);this.state.pose=r.pose;const fresh=!!r.contact&&r.contact.message!==this.contact?.message;this.contact=r.contact;if(fresh)this.onContact(r.contact!);this.changed();return true;}
 action(pose:Pose,owner='action'){if(!this.begin(owner))return false;this.setPose(pose,owner);this.end(owner);return true;}
 select(part:Part){if(this.owner||this.state.frozen)return false;this.state.selected=part;this.contact=null;this.changed();return true;}
 setConfig(config:Config,owner?:string){if(this.owner&&this.owner!==owner||this.state.frozen||!validConfig(config)||this.state.pose.angle>config.limit||collision(this.state.pose,config))return false;this.state.config={...config};this.contact=null;this.changed();return true;}
 view(patch:Partial<View>){if(this.state.frozen)return;this.state.view={...this.state.view,...patch};this.state.view.zoom=clamp(this.state.view.zoom,.5,3);this.state.view.x=clamp(this.state.view.x,-300,300);this.state.view.y=clamp(this.state.view.y,-300,300);this.state.view.pitch=clamp(this.state.view.pitch,-.7,1.1);this.changed();}
 freeze(){this.end();this.endView();this.state.frozen=!this.state.frozen;this.changed();}
 undo(){if(this.state.frozen)return;this.end();this.endView();const previous=this.history.pop(),scope=this.scopes.pop();if(previous){if(scope==='view')this.state.view={...previous.view};else{this.state.pose={...previous.pose};this.state.config={...previous.config};}this.contact=null;this.changed();}}
 reset(fixture=this.state.config.fixture){if(this.state.frozen)return false;this.end();this.begin('reset');const view={...this.state.view};this.state=initial();this.state.view=view;this.state.config.fixture=fixture;this.end();this.contact=null;this.changed();return true;}
}
