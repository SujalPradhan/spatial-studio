import {Euler, Quaternion, Vector3} from 'three';
import type {Quat, Vec3} from '../types';
import {validQ, validFrame, type InkFrame} from '../art/model';

export type Stage = 'point' | 'cloud' | 'challenge';
export interface Annotation {id:string; frame:InkFrame; points:[number,number][]; finished:boolean; interrupted:boolean}
export interface LessonPose {
  stage:Stage; q:Quat; selected:number; residuals:boolean; reveal:boolean;
  annotations:Annotation[]; view:{yaw:number; pitch:number; zoom:number; x:number; y:number};
}
export interface LessonState extends LessonPose {schema:1; mode:'rotate'|'annotate'; saved:(LessonPose|null)[]}
export const stages:Stage[] = ['point','cloud','challenge'];
export const titles = {point:'One point, two coordinates', cloud:'Find a plane for the data', challenge:'Try a different cloud'};
export const prompts = {
  point:'Which part of this point can the plane represent? Which part is lost?',
  cloud:'Keep two coordinates per point. Which plane makes the reconstruction error smallest?',
  challenge:'The data has changed direction. Predict the best plane before revealing PCA.'
};
export function initialLesson():LessonState {
  return {schema:1,stage:'point',q:[0,0,0,1],selected:0,residuals:false,reveal:false,
    annotations:[],mode:'rotate',saved:[null,null],view:{yaw:.52,pitch:.38,zoom:1,x:0,y:0}};
}
export function dataset(stage:Stage):Vec3[] {
  if(stage==='point')return [[2,1,2]];
  if(stage==='cloud')return [-3,3].flatMap(x=>[-2,2].flatMap(y=>[-.5,.5].map(z=>[x,y,z] as Vec3)));
  // Paired samples make the mean exactly zero before the known rigid rotation.
  let seed=173;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const q=new Quaternion().setFromEuler(new Euler(.72,-.48,.31));const points:Vec3[]=[];
  for(let i=0;i<30;i++){
    const v=new Vector3((random()-.5)*7,(random()-.5)*4,(random()-.5)*.8).applyQuaternion(q);
    points.push(v.toArray() as Vec3,v.clone().negate().toArray() as Vec3);
  }
  return points;
}
export function mean(points:Vec3[]):Vec3 {
  return points.reduce((a,p)=>a.map((n,i)=>n+p[i]/points.length) as Vec3,[0,0,0]);
}
export function centre(stage:Stage):Vec3 {return stage==='point'?[0,0,0]:mean(dataset(stage));}
export function basis(q:Quat) {
  const rotation=new Quaternion().fromArray(q).normalize();
  return {u:new Vector3(1,0,0).applyQuaternion(rotation),v:new Vector3(0,1,0).applyQuaternion(rotation),n:new Vector3(0,0,1).applyQuaternion(rotation)};
}
export function project(point:Vec3,origin:Vec3,q:Quat) {
  const {u,v,n}=basis(q),delta=new Vector3(...point).sub(new Vector3(...origin));
  const distance=delta.dot(n),z:[number,number]=[delta.dot(u),delta.dot(v)];
  const reconstructed=new Vector3(...point).addScaledVector(n,-distance).toArray() as Vec3;
  return {z,reconstructed,distance,error:distance*distance};
}
export function averageError(points:Vec3[],origin:Vec3,q:Quat) {
  return points.reduce((s,p)=>s+project(p,origin,q).error,0)/points.length;
}
// Symmetric 3x3 Jacobi eigensolver. No model service or network calculation.
export function pca(points:Vec3[]) {
  const origin=mean(points),a=Array.from({length:3},()=>[0,0,0]),vectors=[[1,0,0],[0,1,0],[0,0,1]];
  for(const p of points)for(let i=0;i<3;i++)for(let j=0;j<3;j++)a[i][j]+=(p[i]-origin[i])*(p[j]-origin[j])/points.length;
  for(let step=0;step<40;step++){
    let r=0,s=1;for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)if(Math.abs(a[i][j])>Math.abs(a[r][s])){r=i;s=j;}
    if(Math.abs(a[r][s])<1e-13)break;
    const theta=.5*Math.atan2(2*a[r][s],a[s][s]-a[r][r]),c=Math.cos(theta),t=Math.sin(theta);
    const rr=a[r][r],ss=a[s][s],rs=a[r][s];
    for(let k=0;k<3;k++)if(k!==r&&k!==s){const kr=a[k][r],ks=a[k][s];a[k][r]=a[r][k]=c*kr-t*ks;a[k][s]=a[s][k]=t*kr+c*ks;}
    a[r][r]=c*c*rr-2*c*t*rs+t*t*ss;a[s][s]=t*t*rr+2*c*t*rs+c*c*ss;a[r][s]=a[s][r]=0;
    for(let k=0;k<3;k++){const kr=vectors[k][r],ks=vectors[k][s];vectors[k][r]=c*kr-t*ks;vectors[k][s]=t*kr+c*ks;}
  }
  const order=[0,1,2].sort((i,j)=>a[j][j]-a[i][i]);
  const values=order.map(i=>Math.max(0,a[i][i]));
  const directions=order.map(i=>new Vector3(...vectors.map(row=>row[i]) as Vec3).normalize());
  const normal=directions[0].clone().cross(directions[1]).normalize();
  const q=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),normal).toArray() as Quat;
  return {origin,values,normal:normal.toArray() as Vec3,q,error:values[2],retained:values[0]+values[1],total:values.reduce((s,v)=>s+v,0)};
}
export function annotationPoint(uv:[number,number],frame:InkFrame):Vec3 {
  return new Vector3(uv[0]*9,uv[1]*9/frame.aspect,0).applyQuaternion(new Quaternion().fromArray(frame.q)).add(new Vector3(...frame.origin)).toArray() as Vec3;
}
export function pose(state:LessonState):LessonPose {
  const {stage,q,selected,residuals,reveal,annotations,view}=state;
  return structuredClone({stage,q,selected,residuals,reveal,annotations,view});
}
export function validateLesson(value:unknown):LessonState {
  const validPose=(x:unknown):x is LessonPose=>{
    const s=x as LessonPose;
    return !!s&&stages.includes(s.stage)&&validQ(s.q)&&Number.isInteger(s.selected)&&s.selected>=0&&s.selected<dataset(s.stage).length&&
      typeof s.residuals==='boolean'&&typeof s.reveal==='boolean'&&!!s.view&&['yaw','pitch','zoom','x','y'].every(k=>Number.isFinite(s.view[k as keyof typeof s.view])&&Math.abs(s.view[k as keyof typeof s.view])<=20)&&s.view.zoom>=.5&&s.view.zoom<=2.5&&
      Array.isArray(s.annotations)&&s.annotations.length<=40&&s.annotations.every(n=>n&&typeof n.id==='string'&&n.id.length<=100&&validFrame(n.frame)&&typeof n.finished==='boolean'&&typeof n.interrupted==='boolean'&&Array.isArray(n.points)&&n.points.length<=512&&n.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=.5)));
  };
  const s=value as LessonState;
  if(!validPose(s)||s.schema!==1||!['rotate','annotate'].includes(s.mode)||!Array.isArray(s.saved)||s.saved.length!==2||!s.saved.every(p=>p===null||validPose(p)))throw Error('Invalid maths lesson.');
  return structuredClone(s);
}
