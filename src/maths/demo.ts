import {Quaternion,Vector3} from 'three';
import {initialLesson,project,type Annotation,type LessonState} from './model';
import type {Quat} from '../types';

export const projectionChapters=[
  {duration:9,title:'Start with a 3D vector',caption:'This arrow ends at (2, 1, 2): two across, one up, and two out of the plane.',equation:'Original vector: x = (2, 1, 2)'},
  {duration:14,title:'Keep the part in the plane',caption:'The blue drawing traces two across and one up. The perpendicular pink segment is the part we discard.',equation:'Keep (2, 1). Reconstruct (2, 1, 0). Lose (0, 0, 2).'},
  {duration:12,title:'Orbiting changes only our view',caption:'We move around the scene. The plane and vector stay fixed, so the two retained coordinates stay (2, 1).',equation:'Same plane → same projection → same lost distance: 2'},
  {duration:14,title:'Tilting changes the projection',caption:'Now the plane itself rotates. The perpendicular projection moves, and the two coordinates change.',equation:'A different plane keeps a different part of the same vector.'},
  {duration:15,title:'Put this vector in the plane',caption:'Tilt the plane until it contains the whole arrow. For this one vector, nothing is lost.',equation:'The reconstructed vector is now (2, 1, 2). Lost distance: 0.'},
  {duration:12,title:'Projection keeps one part and drops another',caption:'Back on the XY plane: keep the in-plane part, discard the perpendicular part. That is orthogonal projection.',equation:'P(a, b, c) = (a, b, 0)   ·   P(2, 1, 2) = (2, 1, 0)'}
] as const;
export const demoDuration=projectionChapters.reduce((n,s)=>n+s.duration,0);
export const chapterStart=(index:number)=>projectionChapters.slice(0,Math.max(0,Math.min(index,projectionChapters.length))).reduce((n,s)=>n+s.duration,0);
const smooth=(t:number)=>{const u=Math.max(0,Math.min(1,t));return u*u*(3-2*u);};
const identity:Quat=[0,0,0,1];
const rotated=(angle:number)=>new Quaternion().setFromAxisAngle(new Vector3(0,1,0),angle).toArray() as Quat;
const interpolate=(a:Quat,b:Quat,t:number)=>new Quaternion().fromArray(a).slerp(new Quaternion().fromArray(b),smooth(t)).toArray() as Quat;
type UV=[number,number];
function partial(points:UV[],progress:number):UV[]{
  const at=Math.max(0,Math.min(1,progress))*(points.length-1),i=Math.floor(at),result=points.slice(0,i+1).map(p=>[...p] as UV);
  if(i<points.length-1){const u=at-i;result.push([points[i][0]+(points[i+1][0]-points[i][0])*u,points[i][1]+(points[i+1][1]-points[i][1])*u]);}
  return result;
}
function note(id:string,q:Quat,points:UV[],progress:number):Annotation {
  return {id,frame:{q:[...q],origin:[0,0,0],aspect:1,color:'#2a60b0',width:.03,kind:'stable'},points:partial(points,progress),finished:true,interrupted:false};
}
function ring(u:number,v:number):UV[]{return Array.from({length:49},(_,i)=>[u+Math.cos(i*Math.PI/24)*.028,v+Math.sin(i*Math.PI/24)*.028]);}
function arrow(u:number,v:number):UV[][] {
  const length=Math.hypot(u,v),dx=u/length*.025,dy=v/length*.025;
  return [[[0,0],[u,v]],[[u-dx-dy*.6,v-dy+dx*.6],[u,v],[u-dx+dy*.6,v-dy-dx*.6]]];
}
export function projectionDemo(seconds:number){
  const time=Math.max(0,Math.min(demoDuration,Number.isFinite(seconds)?seconds:0));let chapter=0,start=0;
  while(chapter<projectionChapters.length-1&&time>=start+projectionChapters[chapter].duration){start+=projectionChapters[chapter].duration;chapter++;}
  const local=time-start,state:LessonState=initialLesson();state.mode='annotate';state.residuals=true;
  state.view={yaw:-.6,pitch:.4,zoom:1.22,x:.5,y:.2};
  if(chapter===1||chapter===2){
    const t=chapter===2?14:local;
    state.annotations=[note('demo-across',identity,[[0,0],[2/9,0]],t/3),note('demo-up',identity,[[2/9,0],[2/9,1/9]],(t-3)/3),note('demo-circle',identity,ring(2/9,1/9),(t-6)/3)];
  }
  if(chapter===2){state.view.yaw=-.6+1.3*smooth(local/9);state.view.pitch=.4+.08*smooth(local/9);}
  const away=rotated(Math.PI/4),containing=rotated(-Math.PI/4);
  if(chapter===3){state.q=interpolate(identity,away,local/8);state.view.yaw=.7-1.3*smooth(local/8);state.view.pitch=.48-.08*smooth(local/8);if(local>=8)state.annotations=[note('demo-away-circle',away,ring(0,1/9),(local-8)/3)];}
  if(chapter===4){
    state.q=interpolate(away,containing,local/9);
    if(local>=9){const z=project([2,1,2],[0,0,0],containing).z,paths=arrow(z[0]/9,z[1]/9);state.annotations=paths.map((p,i)=>note('demo-contained-'+i,containing,p,(local-9-i*2)/3));}
  }
  if(chapter===5){
    state.q=interpolate(containing,identity,local/4);state.view.yaw=-.6+.1*smooth(local/4);
    if(local>=4)state.annotations=[note('demo-final-circle',identity,ring(2/9,1/9),(local-4)/3)];
  }
  // At the start of a tilt, describe the motion rather than its eventual endpoint.
  let equation:string=projectionChapters[chapter].equation;
  if(chapter===4&&local<9)equation='The perpendicular gap shrinks as the plane turns toward the vector.';
  if(chapter===5&&local<4)equation='Return to the XY plane to read the projection matrix.';
  const caption=chapter===4&&local<9?'Rotate the plane toward the arrow. Watch the pink perpendicular gap shrink.':chapter===5&&local<4?'Turn the plane back to XY. We will keep the first two coordinates and discard the third.':projectionChapters[chapter].caption;
  return {state,chapter,time,local,title:projectionChapters[chapter].title,caption,equation,finished:time>=demoDuration};
}
