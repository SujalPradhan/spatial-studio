import {LatheGeometry,Vector2,Vector3} from 'three';
export const BANDS=33,MIN_RADIUS=12,MAX_RADIUS=90,WALL=4,FLOOR=6,MAX_STROKES=64,MAX_POINTS=512;
export interface PaintStroke {id:string;color:string;width:number;points:[number,number][];wrap:boolean;finished:boolean;interrupted:boolean}
export interface Vase {id:string;name:string;height:number;radii:number[];color:string;strokes:PaintStroke[]}
export interface Project {schema:'pottery-v1';units:'mm';draft:Vase;variations:Vase[]}
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function newVase():Vase{return {id:crypto.randomUUID(),name:'My vase',height:180,radii:Array.from({length:BANDS},()=>40),color:'#bc7656',strokes:[]};}
export function radiusAt(v:Vase,t:number){const x=clamp(t,0,1)*(BANDS-1),i=Math.floor(x);return v.radii[i]+(v.radii[Math.min(BANDS-1,i+1)]-v.radii[i])*(x-i);}
export function reshape(v:Vase,band:number,radius:number,spread=3){
 const center=Math.round(clamp(band,0,BANDS-1)),target=clamp(radius,MIN_RADIUS,MAX_RADIUS),delta=target-v.radii[center];
 v.radii=v.radii.map((r,i)=>Math.abs(i-center)>spread?r:clamp(r+delta*Math.exp(-2.5*((i-center)/spread)**2),MIN_RADIUS,MAX_RADIUS));
}
export function validateVase(value:unknown):Vase {
 const v=value as Vase,numbers=(a:unknown)=>Array.isArray(a)&&a.length===BANDS&&a.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=MIN_RADIUS&&n<=MAX_RADIUS);
 const color=(c:unknown)=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
 if(!v||typeof v.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(v.id)||typeof v.name!=='string'||v.name.length>40||!Number.isFinite(v.height)||v.height<80||v.height>300||!numbers(v.radii)||!color(v.color)||!Array.isArray(v.strokes)||v.strokes.length>MAX_STROKES)throw Error('Invalid vase dimensions or profile.');
 const ids=new Set<string>();for(const s of v.strokes){if(!s||typeof s.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(s.id)||ids.has(s.id)||!color(s.color)||!Number.isFinite(s.width)||s.width<.005||s.width>.1||typeof s.wrap!=='boolean'||typeof s.finished!=='boolean'||typeof s.interrupted!=='boolean'||!Array.isArray(s.points)||s.points.length>MAX_POINTS||s.points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1)))throw Error('Invalid decoration stroke.');ids.add(s.id);}
 return structuredClone(v);
}
export function parseProject(value:unknown):Project {const p=value as Project;if(!p||p.schema!=='pottery-v1'||p.units!=='mm'||!Array.isArray(p.variations)||p.variations.length>3)throw Error('Unsupported pottery file.');return {schema:'pottery-v1',units:'mm',draft:validateVase(p.draft),variations:p.variations.map(validateVase)};}
export function vaseGeometry(v:Vase){
 // A meridian of the solid wall: bottom, exterior, lip, interior, inner floor.
 const points=[new Vector2(0,0),...v.radii.map((r,i)=>new Vector2(r,i*v.height/(BANDS-1)))];
 const outsideEnd=points.length-1;
 points.push(new Vector2(v.radii.at(-1)!-WALL,v.height));
 for(let i=BANDS-2;i>=0;i--){const y=i*v.height/(BANDS-1);if(y>FLOOR)points.push(new Vector2(v.radii[i]-WALL,y));}
 points.push(new Vector2(radiusAt(v,FLOOR/v.height)-WALL,FLOOR),new Vector2(0,FLOOR));
 const geometry=new LatheGeometry(points,96),uv=geometry.getAttribute('uv'),position=geometry.getAttribute('position'),index=geometry.index!;
 for(let i=0;i<uv.count;i++)uv.setY(i,position.getY(i)/v.height);
 // Group outside triangles together, keeping the plain interior/floor separate.
 const outside:number[]=[],plain:number[]=[],a=new Vector3(),b=new Vector3(),c=new Vector3();
 for(let j=0;j<index.count;j+=3){const ia=index.getX(j),ib=index.getX(j+1),ic=index.getX(j+2);a.fromBufferAttribute(position,ia);b.fromBufferAttribute(position,ib);c.fromBufferAttribute(position,ic);if(b.sub(a).cross(c.sub(a)).lengthSq()<1e-12)continue;const segment=Math.floor(j/6)%(points.length-1);(segment>=1&&segment<outsideEnd?outside:plain).push(ia,ib,ic);}
 geometry.setIndex([...outside,...plain]);geometry.clearGroups();geometry.addGroup(0,outside.length,0);geometry.addGroup(outside.length,plain.length,1);geometry.normalizeNormals();geometry.computeBoundingBox();return geometry;
}
export class VaseStore {
 value=newVase();history:Vase[]=[];future:Vase[]=[];owner:string|null=null;private before:Vase|null=null;revision=0;
 begin(owner:string){if(this.owner&&this.owner!==owner)return false;if(!this.owner){this.owner=owner;this.before=structuredClone(this.value);}return true;}
 changed(){this.revision++;}
 end(){if(!this.before)return;if(JSON.stringify(this.before)!==JSON.stringify(this.value)){this.history.push(this.before);this.history=this.history.slice(-40);this.future=[];this.changed();}this.before=null;this.owner=null;}
 action(fn:(v:Vase)=>void){this.end();this.begin('action');fn(this.value);this.changed();this.end();}
 undo(){this.end();const prev=this.history.pop();if(prev){this.future.push(structuredClone(this.value));this.value=prev;this.changed();}}
 redo(){this.end();const next=this.future.pop();if(next){this.history.push(structuredClone(this.value));this.value=next;this.changed();}}
}
