import {Matrix4,Quaternion,Vector3} from 'three';
import {cloneState,initialState,planeAngles,planeNormal,type SceneState} from './scene-state';
import {objectPlane,type Section} from './geometry';
import {quaternionAngle} from './stats';
export interface Challenge {id:string;title:string;description:string;target:SceneState;start:SceneState;kind:string;objectOnly?:boolean}
const shape=(patch:Partial<SceneState>)=>({...initialState(),...patch});
export const examples:Record<string,SceneState>={circle:shape({}),ellipse:shape({plane:planeAngles(25,0)}),triangle:shape({solid:'cube',plane:new Quaternion().setFromUnitVectors(new Vector3(0,1,0),new Vector3(1,1,1).normalize()).toArray(),depth:1.05})};
export const challenges:Challenge[]=[
 {id:'circle',title:'Find a circle',description:'Level the cut through the cone. Match the dashed target plane at the center.',target:examples.circle,start:shape({plane:planeAngles(42,18),depth:.2}),kind:'circle'},
 {id:'ellipse',title:'Stretch the circle',description:'Tilt the cut by 25° without reaching the base. Match the dashed plane.',target:examples.ellipse,start:shape({plane:planeAngles(0,0),depth:.25}),kind:'ellipse'},
 {id:'triangle',title:'Find three corners',description:'Cut near a corner of the cube. Match the dashed plane to make a triangle.',target:examples.triangle,start:shape({solid:'cube',depth:.3}),kind:'polygon'},
 {id:'rotate',title:'Turn the solid',description:'Rotate the cube to match the amber outline. Try the same task with your mouse and webcam.',target:shape({solid:'cube',object:planeAngles(20,25)}),start:shape({solid:'cube'}),kind:'polygon',objectOnly:true},
];
export function scoreChallenge(challenge:Challenge,state:SceneState,cut:Section){
 if(state.solid!==challenge.target.solid)return {angle:180,depth:Infinity,matched:false};
 if(challenge.objectOnly){const target=new Quaternion().fromArray(challenge.target.object);const angle=Math.min(...cubeSymmetries.map(s=>quaternionAngle(state.object,target.clone().multiply(s).toArray())));return {angle,depth:0,matched:angle<=8};}
 const a=objectPlane(planeNormal(state),state.depth,state.object),b=objectPlane(planeNormal(challenge.target),challenge.target.depth,challenge.target.object);
 const dot=a.normal.dot(b.normal),sign=dot<0?-1:1;const angle=Math.acos(Math.min(1,Math.abs(dot)))*180/Math.PI;const depth=Math.abs(a.depth-sign*b.depth);
 const type=challenge.id==='triangle'?cut.label==='Triangle':cut.kind===challenge.kind&&!cut.clipped;
 return {angle,depth,matched:angle<=5&&depth<=.1&&type&&!cut.degenerate};
}
// The cube has 24 indistinguishable proper rotations. Matching its outline must
// accept any of these, rather than reject an identical visible configuration.
const cubeSymmetries:Quaternion[]=[];
for(const x of [new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)])for(const sx of [-1,1])for(const y of [new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)])for(const sy of [-1,1]){
 const a=x.clone().multiplyScalar(sx),b=y.clone().multiplyScalar(sy);if(a.dot(b)!==0)continue;cubeSymmetries.push(new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(a,b,a.clone().cross(b))));
}
export interface TaskRun {id:string;mode:string;started:string;elapsedSeconds:number;completed:boolean;events:Record<string,number>;angleError:number|null;depthError:number|null;comfort:number|null}
export class TaskSession {
 challenge:Challenge|null=null;started=0;private matchedSince:number|null=null;runs:TaskRun[]=[];current:TaskRun|null=null;
 start(challenge:Challenge,mode:string,now:number){this.cancel(now);this.challenge=challenge;this.started=now;this.matchedSince=null;this.current={id:challenge.id,mode,started:new Date().toISOString(),elapsedSeconds:0,completed:false,events:{},angleError:null,depthError:null,comfort:null};return cloneState(challenge.start);}
 event(name:string){if(this.current)this.current.events[name]=(this.current.events[name]??0)+1;}
 tick(state:SceneState,cut:Section,now:number){
  if(!this.challenge||!this.current)return null;const score=scoreChallenge(this.challenge,state,cut);this.current.elapsedSeconds=(now-this.started)/1000;this.current.angleError=score.angle;this.current.depthError=score.depth;
  if(score.matched&&!state.frozen){this.matchedSince??=now;}else this.matchedSince=null;
  if(this.matchedSince!==null&&now-this.matchedSince>=750){this.current.completed=true;this.runs.push(this.current);const done=this.current;this.current=null;this.challenge=null;this.matchedSince=null;return {score,done};}
  return {score,done:null};
 }
 cancel(now:number){if(this.current){this.current.elapsedSeconds=(now-this.started)/1000;this.runs.push(this.current);}this.challenge=null;this.current=null;this.matchedSince=null;}
}
