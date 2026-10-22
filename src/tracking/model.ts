import {Matrix3,Vector3} from 'three';
import type {Landmark} from '../hand-probe';
export interface CameraIdentity {captureId:string;width:number;height:number}
export interface TrackingFrame extends CameraIdentity {
 frameId:number;hands:Landmark[][];frameAt:number|null;dispatchAt:number;videoTimeMs:number;
 timestampSource:string;clockRttMs:number|null;inferenceMs:number;processedHz:number;
}
export interface Calibration {
 schema:'spatial-stereo-v1';units:'mm';desktop:CameraIdentity;phone:CameraIdentity;
 K1:number[];K2:number[];D1:number[];D2:number[];R:number[];T:number[];rms:number;
}
export const MAX_PAIR_SKEW_MS=40;
export function cameraMatches(a:CameraIdentity,b:CameraIdentity){return a.captureId===b.captureId&&a.width===b.width&&a.height===b.height;}
export function parseCalibration(x:unknown):Calibration {
 const c=x as Calibration;
 const numbers=(v:unknown,n:number)=>Array.isArray(v)&&v.length===n&&v.every(x=>typeof x==='number'&&Number.isFinite(x));
 const camera=(v:CameraIdentity)=>v&&typeof v.captureId==='string'&&v.captureId.length<=80&&[v.width,v.height].every(n=>Number.isInteger(n)&&n>=160&&n<=4096);
 if(!c||c.schema!=='spatial-stereo-v1'||c.units!=='mm'||!camera(c.desktop)||!camera(c.phone)||!numbers(c.K1,9)||!numbers(c.K2,9)||!numbers(c.D1,5)||!numbers(c.D2,5)||!numbers(c.R,9)||!numbers(c.T,3)||!Number.isFinite(c.rms)||c.rms<0||c.rms>3)throw Error('Unsupported calibration or reprojection RMS above 3 px.');
 for(const k of [c.K1,c.K2])if(k[0]<=0||k[4]<=0||Math.abs(k[1])+Math.abs(k[3])+Math.abs(k[6])+Math.abs(k[7])+Math.abs(k[8]-1)>1e-6)throw Error('Expected a standard pinhole camera matrix.');
 const r=new Matrix3().set(...c.R as [number,number,number,number,number,number,number,number,number]);
 const orth=r.clone().transpose().multiply(r).elements;
 if(Math.abs(r.determinant()-1)>.001||orth.some((n,i)=>Math.abs(n-(i%4===0?1:0))>.001)||Math.hypot(...c.T)<30||Math.hypot(...c.T)>1500)throw Error('Invalid camera rotation or baseline (30–1500 mm required).');
 if([...c.K1,...c.K2,...c.D1,...c.D2,...c.R,...c.T].some(n=>Math.abs(n)>1e5))throw Error('Calibration values are out of range.');
 return structuredClone(c);
}
function undistort(p:Landmark,c:CameraIdentity,k:number[],d:number[]){
 const xd=(p.x*c.width-k[2])/k[0],yd=(p.y*c.height-k[5])/k[4];let x=xd,y=yd;
 for(let i=0;i<12;i++){const r=x*x+y*y,radial=1+d[0]*r+d[1]*r*r+d[4]*r*r*r;if(!Number.isFinite(radial)||Math.abs(radial)<.1)throw Error('Unstable lens correction.');const dx=2*d[2]*x*y+d[3]*(r+2*x*x),dy=d[2]*(r+2*y*y)+2*d[3]*x*y;x=(xd-dx)/radial;y=(yd-dy)/radial;}
 return new Vector3(x,y,1).normalize();
}
function project(p:Vector3,k:number[],d:number[]){const x=p.x/p.z,y=p.y/p.z,r=x*x+y*y,s=1+d[0]*r+d[1]*r*r+d[4]*r*r*r;return [(x*s+2*d[2]*x*y+d[3]*(r+2*x*x))*k[0]+k[2],(y*s+d[2]*(r+2*y*y)+2*d[3]*x*y)*k[4]+k[5]];}
export interface Estimate {point:[number,number,number];gapMm:number;reprojectionPx:number;rayAngleDeg:number;skewMs:number}
export function triangulate(a:TrackingFrame,b:TrackingFrame,c:Calibration):{estimate?:Estimate;reason:string}{
 if(!cameraMatches(a,c.desktop)||!cameraMatches(b,c.phone))return {reason:'Camera session changed. Capture a new calibration.'};
 if(a.hands.length!==1||b.hands.length!==1)return {reason:'Show exactly one hand to both cameras.'};
 if(a.frameAt===null||b.frameAt===null||a.clockRttMs===null||b.clockRttMs===null)return {reason:'Waiting for both clock estimates.'};
 const skew=Math.abs(a.frameAt-b.frameAt);
 if(skew>MAX_PAIR_SKEW_MS)return {reason:`Frames differ by ${skew.toFixed(0)} ms. Move slowly.`};
 if((a.clockRttMs+b.clockRttMs)/2>150)return {reason:'Clock uncertainty is too high. Try a faster connection.'};
 const pa=a.hands[0][8],pb=b.hands[0][8];if(!pa||!pb)return {reason:'Index fingertip is missing.'};if([pa,pb].some(p=>p.x<0||p.x>1||p.y<0||p.y>1))return {reason:'Keep the index fingertip inside both camera images.'};
 try{
 const rot=new Matrix3().set(...c.R as [number,number,number,number,number,number,number,number,number]),inv=rot.clone().transpose(),t=new Vector3(...c.T),origin=t.clone().negate().applyMatrix3(inv),u=undistort(pa,a,c.K1,c.D1),v=undistort(pb,b,c.K2,c.D2).applyMatrix3(inv).normalize();
 const dot=u.dot(v),den=1-dot*dot,angle=Math.acos(Math.min(1,Math.abs(dot)))*180/Math.PI;
 if(angle<5||den<1e-6)return {reason:'Camera rays are too parallel.'};
 const w=origin.clone().negate(),d=u.dot(w),e=v.dot(w),s=(dot*e-d)/den,tt=(e-dot*d)/den;
 const p1=u.clone().multiplyScalar(s),p2=origin.clone().addScaledVector(v,tt),p=p1.clone().add(p2).multiplyScalar(.5),pp=p.clone().applyMatrix3(rot).add(t);
 if(s<50||tt<50||p.z<50||pp.z<50||p.length()>2500)return {reason:'Fingertip lies outside the usable camera volume.'};
 const gap=p1.distanceTo(p2),q1=project(p,c.K1,c.D1),q2=project(pp,c.K2,c.D2),err=Math.max(Math.hypot(q1[0]-pa.x*a.width,q1[1]-pa.y*a.height),Math.hypot(q2[0]-pb.x*b.width,q2[1]-pb.y*b.height));
 if(![gap,err,...p.toArray()].every(Number.isFinite)||gap>12||err>4)return {reason:'Views disagree. Reposition the hand or check calibration.'};
 return {reason:'Provisional fingertip · inferred occluded fingers can still be wrong',estimate:{point:p.toArray() as [number,number,number],gapMm:gap,reprojectionPx:err,rayAngleDeg:angle,skewMs:skew}};
 }catch{return {reason:'Lens correction failed. Check calibration.'};}
}
export function nearestFrame(frames:TrackingFrame[],time:number|null){if(time===null)return null;return frames.filter(f=>f.frameAt!==null).reduce<TrackingFrame|null>((best,f)=>!best||Math.abs(f.frameAt!-time)<Math.abs(best.frameAt!-time)?f:best,null);}
