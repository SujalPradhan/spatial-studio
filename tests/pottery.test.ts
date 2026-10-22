import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {newVase,reshape,vaseGeometry,VaseStore,parseProject,validateVase} from '../src/pottery/model';
import {TwoHandGate} from '../src/pottery/gesture';
import {metricHand} from './hand-fixtures';
const pair=(closed=0,gap=.4,y=.65)=>[.5-gap/2,.5+gap/2].map(cx=>metricHand(closed).map(p=>({x:cx+p.x*.1,y:y-p.y*.1,z:p.z*.1})));
test('two hands choose height open, grab with fists, keep band fixed and release on either hand/loss/crossing',()=>{
 const g=new TwoHandGate();const hover=g.update(pair(),0);assert.equal(hover.phase,'hover');assert.notEqual(g.update(pair(4),10).phase,'start');assert.equal(g.update(pair(4),140).phase,'start');const move=g.update(pair(4,.5,.55),180);assert.equal(move.phase,'move');assert.equal(move.band,hover.band);assert.ok(move.gap>.49);
 const oneOpen=pair(4,.5,.55);oneOpen[0]=pair(0,.5,.55)[0];assert.equal(g.update(oneOpen,200).phase,'end');assert.equal(g.update(pair(4),220).phase,'idle');g.update(pair(),240);g.update(pair(4),260);g.update(pair(4),400);assert.equal(g.update([pair()[0]],410).phase,'end');
 g.update(pair(),500);g.update(pair(4),510);g.update(pair(4),650);assert.equal(g.update(pair(4,.1),680).phase,'end');assert.equal(g.update(pair(4),700).phase,'idle');g.update(pair(),750);g.update(pair(4),760);assert.notEqual(g.update(pair(4),2760).phase,'start');
});
test('local shaping preserves distant bands, bounds radius, and coalesces a grab into one undo',()=>{
 const s=new VaseStore();assert.ok(s.begin('hands'));assert.equal(s.begin('mouse'),false);reshape(s.value,25,70);reshape(s.value,25,1000);assert.equal(s.value.radii[25],90);assert.equal(s.value.radii[0],40);s.changed();s.end();assert.equal(s.history.length,1);const snapshot=structuredClone(s.value);s.undo();assert.equal(s.value.radii[25],40);s.redo();assert.deepEqual(s.value,snapshot);
 const saved=structuredClone(s.value);s.action(v=>reshape(v,16,12));assert.notDeepEqual(s.value,saved);assert.equal(saved.radii[16],40);
});
test('hollow vase mesh has outward volume, watertight welded edges, finite unit normals and valid UVs',()=>{
 const v=newVase(),g=vaseGeometry(v),p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv'),ix=g.index!;
 const a=new Vector3(),b=new Vector3(),c=new Vector3(),edges=new Map<string,number>();let volume=0;
 const key=(i:number)=>[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*10000)).join(',');
 for(let i=0;i<ix.count;i+=3){const ids=[ix.getX(i),ix.getX(i+1),ix.getX(i+2)];a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);volume+=a.dot(b.clone().cross(c))/6;for(let j=0;j<3;j++){const e=[key(ids[j]),key(ids[(j+1)%3])].sort().join('|');edges.set(e,(edges.get(e)??0)+1);}}
 assert.ok([...edges.values()].every(n=>n===2));const expected=Math.PI*(40*40*180-36*36*174);assert.ok(Math.abs(volume-expected)/expected<.001);assert.equal(g.groups.length,2);
 for(let i=0;i<p.count;i++){assert.ok([p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite));assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5);assert.ok(uv.getX(i)>=0&&uv.getX(i)<=1&&uv.getY(i)>=0&&uv.getY(i)<=1);}g.dispose();
});
test('project import round-trips independent painted variations and rejects bad geometry or payloads',()=>{
 const v=newVase();v.strokes=[{id:'stroke',color:'#123456',width:.025,points:[[0,.3],[1,.3]],wrap:true,finished:true,interrupted:false}];const p=parseProject(JSON.parse(JSON.stringify({schema:'pottery-v1',units:'mm',draft:v,variations:[v]})));p.draft.radii[0]=70;assert.equal(p.variations[0].radii[0],40);assert.equal(p.draft.strokes.length,1);
 assert.throws(()=>validateVase({...v,height:NaN}));assert.throws(()=>validateVase({...v,radii:[-1]}));assert.throws(()=>validateVase({...v,strokes:[{...v.strokes[0],points:[[2,0]]}]}));assert.throws(()=>parseProject({schema:'pottery-v1',units:'metres',draft:v,variations:[]}));
});
// @ts-ignore Shared coordinator source.
import {createControlRoom} from '../control-room.mjs';
test('pottery relay isolates camera frames and UV paint by stage, context and vase identity',()=>{
 class Peer extends EventTarget{readyState=1;bufferedAmount=0;seq=0;out:any[]=[];send(raw:string){this.out.push(JSON.parse(raw));}close(){this.readyState=3;this.dispatchEvent(new Event('close'));}input(p:Record<string,unknown>){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({v:2,seq:this.seq++,...p})}));}}
 const d=new Peer(),p=new Peer(),room=createControlRoom();room.connect(d,'desktop');room.connect(p,'phone');
 const s={enabled:true,frozen:false,context:0,stage:'shape',modelId:'vase',trackingSession:'session',captureEnabled:true,band:16,height:180,radius:40,color:'#123456',width:.025,frame:{q:[0,0,0,1],aspect:1}};
 d.input({type:'activate',workspace:'pottery',documentId:'pottery',focused:true,visible:true,state:s});const epoch=room.status.epoch;p.input({type:'ack',documentId:'pottery',epoch,context:0});
 const ink={type:'ink',epoch,context:0,documentId:'pottery',modelId:'vase',strokeId:'stroke',start:0,points:[[0,0,0,0,0,0,1]],aspect:1,frame:{color:'#123456',width:.025}};
 p.input(ink);assert.equal(d.out.filter(x=>x.type==='ink').length,0);
 d.input({type:'state',epoch,state:{...s,stage:'decorate',captureEnabled:false,context:1}});p.input({type:'ack',documentId:'pottery',epoch,context:1});p.input({...ink,context:1,modelId:'old-vase'});assert.equal(d.out.filter(x=>x.type==='ink').length,0);p.input({...ink,context:1});assert.equal(d.out.filter(x=>x.type==='ink').length,1);assert.equal(d.out.find(x=>x.type==='ink').modelId,'vase');
});
