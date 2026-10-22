import {BoxGeometry,BufferGeometry,ConeGeometry,CylinderGeometry,Quaternion,Vector3} from 'three';
import type {Quat} from './types';
export type Solid='cone'|'cylinder'|'cube';
export const SEGMENTS=256;
export const EPS=1e-7;
export const shapes:Record<Solid,BufferGeometry>={cone:new ConeGeometry(1,2,SEGMENTS),cylinder:new CylinderGeometry(1,1,2,SEGMENTS),cube:new BoxGeometry(2,2,2)};
export interface Point2 {x:number;y:number}
export interface Section {points:Vector3[];flat:Point2[];normal:Vector3;depth:number;area:number;perimeter:number;label:string;reason:string;kind:string;clipped:boolean;degenerate:boolean;approximate:boolean}
const edges=new Map<Solid,[Vector3,Vector3][]>();
for(const solid of Object.keys(shapes) as Solid[]){
 const g=shapes[solid],pos=g.getAttribute('position'),idx=g.index;const list:[Vector3,Vector3][]=[];
 for(let i=0;i<(idx?.count??pos.count);i+=3){const vs=[0,1,2].map(j=>new Vector3().fromBufferAttribute(pos,idx?idx.getX(i+j):i+j));for(let j=0;j<3;j++)list.push([vs[j],vs[(j+1)%3]]);}
 edges.set(solid,list);
}
export function planeBasis(n:Vector3){
 const u=new Vector3(1,0,0).addScaledVector(n,-n.x);
 if(u.lengthSq()<1e-5)u.set(0,0,1).addScaledVector(n,-n.z);
 u.normalize();return {u,v:n.clone().cross(u).normalize()};
}
function hull(points:Point2[]):Point2[]{
 const sorted=[...points].sort((a,b)=>a.x-b.x||a.y-b.y).filter((p,i,a)=>!i||Math.hypot(p.x-a[i-1].x,p.y-a[i-1].y)>EPS);
 if(sorted.length<=2)return sorted;
 const cross=(a:Point2,b:Point2,c:Point2)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 const chain=(ps:Point2[])=>{const out:Point2[]=[];for(const p of ps){while(out.length>=2&&cross(out.at(-2)!,out.at(-1)!,p)<=1e-10)out.pop();out.push(p);}return out;};
 const a=chain(sorted),b=chain([...sorted].reverse());a.pop();b.pop();return a.concat(b);
}
export function objectPlane(worldNormal:Vector3,depth:number,object:Quat){return {normal:worldNormal.clone().applyQuaternion(new Quaternion().fromArray(object).invert()).normalize(),depth};}
export function extent(solid:Solid,n:Vector3):[number,number]{
 const r=Math.hypot(n.x,n.z);
 if(solid==='cube'){const s=Math.abs(n.x)+Math.abs(n.y)+Math.abs(n.z);return [-s,s];}
 if(solid==='cylinder'){const s=r+Math.abs(n.y);return [-s,s];}
 return [Math.min(n.y,-n.y-r),Math.max(n.y,-n.y+r)];
}
export function section(solid:Solid,normal:Vector3,depth:number):Section{
 const norm=normal.length();if(!Number.isFinite(norm)||norm<EPS||!Number.isFinite(depth))throw new Error('A finite plane with nonzero normal is required');
 const n=normal.clone().divideScalar(norm),d=depth/norm,{u,v}=planeBasis(n);const raw:Vector3[]=[];
 const [min,max]=extent(solid,n);const outside=d<min-EPS||d>max+EPS;
 if(!outside)for(const [a,b] of edges.get(solid)!){
  const da=n.dot(a)-d,db=n.dot(b)-d;
  if(Math.abs(da)<EPS)raw.push(a);if(Math.abs(db)<EPS)raw.push(b);
  if(da*db<0)raw.push(a.clone().lerp(b,da/(da-db)));
 }
 // Exact curved support contacts avoid missing a tangent between radial mesh vertices.
 const r=Math.hypot(n.x,n.z);
 if(!outside&&solid!=='cube'&&(Math.abs(d-min)<EPS||Math.abs(d-max)<EPS)&&r>EPS){
  for(const sign of [-1,1]){
   const p=new Vector3(sign*n.x/r,-1,sign*n.z/r);if(Math.abs(n.dot(p)-d)<EPS)raw.push(p);
   if(solid==='cylinder'){const q=p.clone();q.y=1;if(Math.abs(n.dot(q)-d)<EPS)raw.push(q);}
  }
 }
 const flat=hull(raw.map(p=>({x:p.dot(u),y:p.dot(v)})));
 const points=flat.map(p=>n.clone().multiplyScalar(d).addScaledVector(u,p.x).addScaledVector(v,p.y));
 let signedArea=0,perimeter=0;for(let i=0;i<flat.length;i++){const a=flat[i],b=flat[(i+1)%flat.length];signedArea+=a.x*b.y-a.y*b.x;if(flat.length>2)perimeter+=Math.hypot(a.x-b.x,a.y-b.y);}
 const area=Math.abs(signedArea)/2;const degenerate=flat.length<3||area<1e-8;
 let label='',kind='',reason='',clipped=false;
 if(!flat.length){label='No intersection';kind='empty';reason=outside?'The cutting plane lies outside the solid. Move it inward to reveal a section.':'The plane is within the curved mesh’s boundary tolerance. Move it slightly inward to reveal a stable section.';}
 else if(degenerate){label=flat.length===1?'Point contact':'Line contact';kind=flat.length===1?'point':'line';reason='The plane only touches the boundary. A contact has no two-dimensional area.';}
 else if(solid==='cube'){
  kind='polygon';label=({3:'Triangle',4:'Quadrilateral',5:'Pentagon',6:'Hexagon'} as Record<number,string>)[flat.length]??`${flat.length}-sided polygon`;
  if(flat.length===4){const es=points.map((p,i)=>points[(i+1)%4].clone().sub(p));const rect=es.every((e,i)=>Math.abs(e.dot(es[(i+1)%4]))<1e-6*e.length()*es[(i+1)%4].length());if(rect){label=es.every(e=>Math.abs(e.length()-es[0].length())<1e-6)?'Square':'Rectangle';}}
  reason=`The plane meets ${flat.length} boundary edges of the cube. Joining those intersections makes a ${label.toLowerCase()}.`;
  if(Math.abs(Math.abs(d)-1)<EPS&&Math.max(Math.abs(n.x),Math.abs(n.y),Math.abs(n.z))>1-EPS)reason='The cutting plane coincides with a square face of the cube.';
 }else if(solid==='cylinder'){
  if(r<EPS){kind='circle';label='Circle';reason=Math.abs(Math.abs(d)-1)<EPS?'The plane coincides with one circular end face.':'The plane is perpendicular to the cylinder’s axis, so the section is a circle.';}
  else if(Math.abs(n.y)<EPS){kind='rectangle';label='Rectangle';reason='The plane runs parallel to the cylinder’s axis. Two straight sides join the matching chords on its end faces.';}
  else{
   const ys=[(d-r)/n.y,(d+r)/n.y].sort((a,b)=>a-b);clipped=ys[0]<-1-EPS||ys[1]>1+EPS;
   kind=clipped?'clipped':'ellipse';label=clipped?'End-clipped ellipse':'Ellipse';reason=clipped?'The infinite cylinder would give an ellipse, but this cut reaches an end face. Straight chords close the finite section.':'The plane crosses the cylinder at an angle, and the whole ellipse fits between its end faces.';
  }
 }else{
  if(r<EPS){kind='circle';label='Circle';reason=Math.abs(d/n.y+1)<EPS?'The plane coincides with the cone’s circular base.':'The plane is parallel to the cone’s base. Its distance from the apex sets the circle’s radius.';}
  else if(Math.abs(d-n.y)<EPS){kind='apex';label='Apex triangle';clipped=true;reason='The plane passes through the apex and cuts a chord across the base. The resulting section is a triangle.';}
  else{
   clipped=Math.abs(d+n.y)<=r+EPS;
   const discriminant=n.y*n.y-.25*r*r;
   if(!clipped&&discriminant>EPS){kind='ellipse';label='Ellipse';reason='The oblique plane meets the curved side in a closed ellipse, which fits above the cone’s base.';}
   else{kind='clipped';label=Math.abs(discriminant)<1e-6?'Base-clipped parabola':discriminant<0?'Base-clipped hyperbola':'Base-clipped ellipse';reason='This finite cone stops at its base. A chord across that base closes the curved section; the full boundary is not a single conic.';clipped=true;}
  }
 }
 return {points,flat,normal:n,depth:d,area,perimeter,label,reason,kind,clipped,degenerate,approximate:solid!=='cube'};
}
