import * as T from 'three';
import type { Quat } from './types';
export class PlanePreview {
  private renderer:T.WebGLRenderer;private scene=new T.Scene();private camera=new T.PerspectiveCamera(40,1,.1,100);
  private plane=new T.Group();private phoneStart:T.Quaternion|null=null;private planeStart=new T.Quaternion();
  private target=new T.Quaternion();private depth=0;private anim=0;private last=performance.now();
  private cube:T.Mesh;private cut:T.Mesh;
  frozen=false;active=false;updates=0;
  constructor(private host:HTMLElement){
    this.renderer=new T.WebGLRenderer({antialias:true,alpha:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    host.appendChild(this.renderer.domElement);this.camera.position.set(4,3.4,5.8);this.camera.lookAt(0,0,0);
    this.scene.add(new T.HemisphereLight(0xffffff,0xa0b5a6,3));
    const light=new T.DirectionalLight(0xffffff,3);light.position.set(4,6,3);this.scene.add(light);
    const box=new T.BoxGeometry(1.8,1.8,1.8);
    this.cube=new T.Mesh(box,new T.MeshStandardMaterial({color:0xd3e5d7,transparent:true,opacity:.16,depthWrite:false,roughness:.6}));
    this.scene.add(this.cube);
    this.scene.add(new T.LineSegments(new T.EdgesGeometry(box),new T.LineBasicMaterial({color:0x729d94,transparent:true,opacity:.65})));
    const surface=new T.Mesh(new T.PlaneGeometry(3.5,3.5),new T.MeshBasicMaterial({color:0x2f8e7c,transparent:true,opacity:.18,side:T.DoubleSide,depthWrite:false}));
    surface.rotateX(-Math.PI/2);this.plane.add(surface);
    const border=new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(3.5,3.5)),new T.LineBasicMaterial({color:0x24816f}));border.rotateX(-Math.PI/2);this.plane.add(border);
    const arrow=new T.ArrowHelper(new T.Vector3(0,1,0),new T.Vector3(),1.6,0xb17b35,.18,.1);this.plane.add(arrow);this.scene.add(this.plane);
    this.cut=new T.Mesh(new T.BufferGeometry(),new T.MeshBasicMaterial({color:0xdfa853,side:T.DoubleSide,transparent:true,opacity:.85}));this.scene.add(this.cut);
    const grid=new T.GridHelper(7,14,0xc7d5c9,0xe1e7df);grid.position.y=-1.2;this.scene.add(grid);
    const axes=new T.AxesHelper(1);axes.position.set(-2.1,-1.19,1.8);this.scene.add(axes);
    const resize=()=>{const {width,height}=host.getBoundingClientRect();this.renderer.setSize(width,height);this.camera.aspect=width/Math.max(height,1);this.camera.updateProjectionMatrix();};
    new ResizeObserver(resize).observe(host);resize();this.render();
  }
  frame(q:Quat|null,hold:boolean,depth:number|null){
    if(this.frozen||!q){this.release();return;}
    if(!hold){this.release();}else{
      const current=new T.Quaternion().fromArray(q);
      if(!this.phoneStart){this.phoneStart=current.clone();this.planeStart.copy(this.target);}
      // A body-relative delta is applied to the existing plane orientation.
      const delta=this.phoneStart.clone().invert().multiply(current);
      this.target.copy(this.planeStart).multiply(delta).normalize();this.active=true;this.updates++;
    }
    if(depth!==null)this.depth=depth;
  }
  release(){if(this.active)this.target.copy(this.plane.quaternion);this.phoneStart=null;this.active=false;}
  reset(){this.release();this.target.identity();this.depth=0;}
  setManual(pitch:number,roll:number,depth:number){if(!this.frozen){this.target.setFromEuler(new T.Euler(pitch,0,roll));this.depth=depth;}}
  get normal(){return new T.Vector3(0,1,0).applyQuaternion(this.plane.quaternion);}
  get diagnostic(){return {active:this.active,updates:this.updates,depth:this.depth,normal:this.normal.toArray()};}
  private render=()=>{
    this.anim=requestAnimationFrame(this.render);const now=performance.now();const dt=Math.min((now-this.last)/1000,.1);this.last=now;
    if(!this.frozen)this.plane.quaternion.slerp(this.target,1-Math.exp(-dt*18));
    const normal=this.normal;this.plane.position.copy(normal).multiplyScalar(this.depth);
    const points=boxSection(normal,this.depth,.9);
    const vertices:number[]=[];
    for(let i=1;i<points.length-1;i++)vertices.push(...points[0].toArray(),...points[i].toArray(),...points[i+1].toArray());
    this.cut.geometry.dispose();this.cut.geometry=new T.BufferGeometry();this.cut.geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    this.renderer.render(this.scene,this.camera);
  };
  dispose(){cancelAnimationFrame(this.anim);this.renderer.dispose();}
}
export function boxSection(normal:T.Vector3,depth:number,half:number):T.Vector3[]{
  const vertices:T.Vector3[]=[];for(const x of [-half,half])for(const y of [-half,half])for(const z of [-half,half])vertices.push(new T.Vector3(x,y,z));
  const points:T.Vector3[]=[];
  const add=(v:T.Vector3)=>{if(!points.some(p=>p.distanceToSquared(v)<1e-12))points.push(v);};
  for(let i=0;i<8;i++)for(let j=i+1;j<8;j++){
    const a=vertices[i],b=vertices[j];if(Math.abs(a.distanceTo(b)-2*half)>1e-8)continue;
    const da=normal.dot(a)-depth,db=normal.dot(b)-depth;
    if(Math.abs(da)<1e-8)add(a.clone());if(Math.abs(db)<1e-8)add(b.clone());
    if(da*db<0)add(a.clone().lerp(b,da/(da-db)));
  }
  if(points.length<3)return [];
  const center=points.reduce((s,p)=>s.add(p),new T.Vector3()).divideScalar(points.length);
  const ref=Math.abs(normal.y)<.9?new T.Vector3(0,1,0):new T.Vector3(1,0,0);
  const u=ref.cross(normal).normalize(),v=normal.clone().cross(u);
  return points.sort((a,b)=>Math.atan2(a.clone().sub(center).dot(v),a.clone().sub(center).dot(u))-Math.atan2(b.clone().sub(center).dot(v),b.clone().sub(center).dot(u)));
}
