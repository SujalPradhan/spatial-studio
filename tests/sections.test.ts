import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {section,objectPlane} from '../src/geometry';
import {SceneStore,planeAngles} from '../src/scene-state';
import {PhoneInput} from '../src/phone-input';
import {challenges,scoreChallenge,TaskSession} from '../src/challenges';
const Y=new Vector3(0,1,0);
test('cylinder and cone circles agree with analytical areas within tessellation tolerance',()=>{
 for(const [solid,depth,expected] of [['cylinder',0,Math.PI],['cone',0,Math.PI/4],['cone',-.5,Math.PI*.75**2]] as const){const s=section(solid,Y,depth);assert.equal(s.label,'Circle');assert.ok(Math.abs(s.area-expected)/expected<.00015);assert.ok(s.points.every(p=>Math.abs(p.y-depth)<1e-7));}
});
test('full oblique sections have analytical ellipse areas; finite caps are classified separately',()=>{
 const a=.35,n=new Vector3(0,Math.cos(a),Math.sin(a));
 const cylinder=section('cylinder',n,0);assert.equal(cylinder.label,'Ellipse');assert.ok(Math.abs(cylinder.area-Math.PI/Math.cos(a))/(Math.PI/Math.cos(a))<.0002);
 const cone=section('cone',n,0);assert.equal(cone.label,'Ellipse');
 // Substitute y=(d-nz*z)/ny into x²+z²=(1-y)²/4, then integrate the resulting ellipse.
 const t=Math.tan(a),A=1-.25*t*t,expected=Math.PI*.25/Math.pow(A,1.5)/Math.cos(a);
 assert.ok(Math.abs(cone.area-expected)/expected<.0003);
 assert.equal(section('cylinder',n,.9).clipped,true);
 assert.equal(section('cone',n,-.85).clipped,true);
});
test('finite cone apex, generator-parallel and base cases do not masquerade as full conics',()=>{
 assert.equal(section('cone',Y,1).kind,'point');
 assert.equal(section('cone',new Vector3(0,0,1),0).label,'Apex triangle');
 const n=new Vector3(0,1,2).normalize();assert.equal(section('cone',n,0).label,'Base-clipped parabola');
 assert.equal(section('cone',Y,-1).label,'Circle');assert.ok(section('cone',Y,-1).area>3.14);
});
test('cylinder vertical and arbitrarily oriented tangent contacts are robust',()=>{
 assert.equal(section('cylinder',new Vector3(1,0,0),0).label,'Rectangle');
 const n=new Vector3(.3,0,.7).normalize();const s=section('cylinder',n,1);assert.equal(s.kind,'line');assert.equal(s.area,0);
 assert.equal(section('cylinder',Y,1.01).kind,'empty');
});
test('cube cuts, sign reversal, and shared rigid rotations preserve geometry',()=>{
 const n=new Vector3(1,1,1).normalize();assert.equal(section('cube',n,0).flat.length,6);assert.equal(section('cube',n,1.05).label,'Triangle');assert.equal(section('cube',Y,1).label,'Square');
 const q=new Quaternion().setFromAxisAngle(new Vector3(1,2,3).normalize(),.7);const transformed=objectPlane(n.clone().applyQuaternion(q),.3,q.toArray());
 const a=section('cube',n,.3),b=section('cube',transformed.normal,.3),c=section('cube',n.clone().negate(),-.3);
 assert.ok(Math.abs(a.area-b.area)<1e-7);assert.ok(Math.abs(a.area-c.area)<1e-7);
 for(const p of a.points)assert.ok(b.points.some(v=>v.distanceTo(p)<1e-7));
});
test('one phone manipulation is one undo item, and release/re-grab does not jump',()=>{
 const store=new SceneStore(),input=new PhoneInput(store);input.enabled=true;
 const frame=(q:number[],hold:boolean,t:number)=>input.frame({type:'frame',q,hold,active:true,visible:true,depth:0,screenAngle:0,source:'test'},t);
 frame([0,0,0,1],false,0);frame([0,0,0,1],true,10);frame(planeAngles(30,0),true,30);input.tick(40,.05);
 const moved=[...store.state.plane];assert.notDeepEqual(moved,[0,0,0,1]);frame(planeAngles(30,0),false,50);assert.equal(store.history.length,1);
 frame(planeAngles(60,0),true,60);input.tick(70,.05);assert.deepEqual(store.state.plane,moved);
 input.tick(600,.05);assert.equal(input.held,false);store.undo();assert.deepEqual(store.state.plane,[0,0,0,1]);
});
test('a held control cannot engage on reconnect, screen rotation or resume',()=>{
 const store=new SceneStore(),input=new PhoneInput(store);input.enabled=true;
 const p={type:'frame',q:[0,0,0,1],hold:true,active:true,visible:true,depth:0,screenAngle:0,source:'test'};
 input.frame(p,0);assert.equal(input.held,false);input.frame({...p,hold:false},10);input.frame(p,20);assert.equal(input.held,true);
 input.frame({...p,screenAngle:90},30);assert.equal(input.held,false);
 store.freeze(true);input.frame({...p,hold:false},40);store.freeze(false);input.frame(p,50);assert.equal(input.held,false);
});
test('phone depth drags are coalesced into one undo and desktop freeze blocks motion',()=>{
 const store=new SceneStore(),input=new PhoneInput(store);input.enabled=true;
 const p={type:'frame',q:[0,0,0,1],hold:false,active:true,visible:true,depth:0,screenAngle:0,source:'test'};
 input.frame(p,0);input.frame({...p,depth:.2,depthActive:true},10);input.frame({...p,depth:.6,depthActive:true},20);assert.equal(store.history.length,0);
 input.frame({...p,depth:.6,depthActive:false},30);assert.equal(store.history.length,1);assert.equal(store.state.depth,.6);store.undo();assert.equal(store.state.depth,0);
 store.freeze(true);input.frame({...p,depth:.9},40);assert.equal(store.state.depth,0);store.reset();assert.equal(store.state.frozen,false);
});
test('rotation challenge accepts the cube’s visible symmetries',()=>{
 const c=challenges.find(c=>c.objectOnly)!;
 const equivalent={...c.target,object:new Quaternion().fromArray(c.target.object).multiply(new Quaternion().setFromAxisAngle(Y,Math.PI/2)).toArray()};
 assert.ok(scoreChallenge(c,equivalent,section('cube',Y,0)).matched);
 assert.equal(scoreChallenge(c,c.start,section('cube',Y,0)).matched,false);
});
test('challenge completion requires a sustained match and records cancelled trials honestly',()=>{
 const session=new TaskSession(),c=challenges[0];session.start(c,'mouse',0);
 const cut=section('cone',Y,0);assert.equal(session.tick(c.target,cut,100)?.done,null);assert.equal(session.tick(c.target,cut,800)?.done,null);assert.equal(session.tick(c.target,cut,900)?.done?.completed,true);
 session.start(c,'phone',1000);session.cancel(1500);assert.equal(session.runs[1].completed,false);assert.equal(session.runs[1].elapsedSeconds,.5);
});
