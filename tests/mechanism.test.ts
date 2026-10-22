import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {collision,move,panels,signedPhoneAngle,type Config} from '../src/mechanism/model';
import {MechanismStore} from '../src/mechanism/store';
import {Recorder,poseAt,validateTake,exportTakes,importTakes} from '../src/mechanism/takes';
import {JointPhoneInput} from '../src/mechanism/phone-input';
import {Dwell,isPointing} from '../src/pointing';
import {metricHand} from './hand-fixtures';
const clear:Config={fixture:'clear',limit:120};
test('hollow box dimensions, closed pose and fully opened removal are geometrically valid',()=>{
 const p=panels({angle:0,lift:0},clear);assert.equal(p.filter(x=>x.part==='body').length,5);assert.equal(p.filter(x=>x.part==='tray').length,5);assert.equal(collision({angle:0,lift:0},clear),null);
 assert.deepEqual(move({angle:0,lift:0},{angle:120,lift:0},clear),{pose:{angle:120,lift:0},contact:null});assert.equal(collision({angle:120,lift:160},clear),null);
 assert.deepEqual(move({angle:100,lift:0},{angle:100,lift:160},clear).pose,{angle:100,lift:160});
});
test('closed lid contact occurs at the independently known ten millimetre gap',()=>{
 const r=move({angle:0,lift:0},{angle:0,lift:160},clear);assert.ok(Math.abs(r.pose.lift-10.02)<.001);assert.match(r.contact!.message,/lid/);assert.equal(collision(r.pose,clear),null);
 const away=move(r.pose,{angle:0,lift:0},clear);assert.equal(away.contact,null);assert.equal(away.pose.lift,0);
});
test('closing onto a raised tray and the shelf stop at collision and can retreat',()=>{
 const r=move({angle:100,lift:60},{angle:0,lift:60},clear);assert.ok(r.pose.angle>70&&r.pose.angle<80);assert.match(r.contact!.message,/tray/);assert.equal(collision(r.pose,clear),null);assert.equal(move(r.pose,{angle:100,lift:60},clear).contact,null);
 const shelf=move({angle:0,lift:0},{angle:120,lift:0},{fixture:'shelf',limit:120});assert.ok(shelf.pose.angle>28&&shelf.pose.angle<31);assert.match(shelf.contact!.message,/shelf/);
 // The end pose is clear; only a swept test catches crossing the shelf.
 assert.equal(collision({angle:120,lift:0},{fixture:'shelf',limit:120}),null);
});
test('limits, nonfinite input and mixed motion cannot bypass collision',()=>{
 assert.equal(move({angle:0,lift:0},{angle:150,lift:0},{fixture:'clear',limit:80}).pose.angle,80);
 assert.deepEqual(move({angle:0,lift:0},{angle:NaN,lift:0},clear).pose,{angle:0,lift:0});
 const r=move({angle:0,lift:0},{angle:120,lift:160},clear);assert.ok(r.contact);assert.equal(collision(r.pose,clear),null);
});
test('transactions enforce ownership, coalesce edits, undo limits and freeze',()=>{
 const s=new MechanismStore();assert.ok(s.begin('mouse'));assert.equal(s.begin('phone'),false);s.setPose({angle:40,lift:0},'phone');assert.equal(s.state.pose.angle,0);s.setPose({angle:40,lift:0},'mouse');s.setPose({angle:60,lift:0},'mouse');s.setConfig({fixture:'clear',limit:80},'mouse');s.end('mouse');assert.equal(s.history.length,1);s.undo();assert.equal(s.state.pose.angle,0);assert.equal(s.state.config.limit,120);
 s.freeze();assert.equal(s.begin('mouse'),false);s.action({angle:20,lift:0});assert.equal(s.state.pose.angle,0);s.freeze();s.action({angle:100,lift:0});s.action({angle:100,lift:120});s.undo();assert.equal(s.state.pose.lift,0);
});
test('phone signed quaternion twist is sign invariant, clutched and release cancels targets',()=>{
 const q=(n:number)=>new Quaternion().setFromAxisAngle(new Vector3(1,0,0),n*Math.PI/180).toArray();assert.ok(Math.abs(signedPhoneAngle(q(30),q(80))!-50)<1e-8);assert.ok(Math.abs(signedPhoneAngle(q(30),q(80).map(x=>-x))!-50)<1e-8);assert.ok(Math.abs(signedPhoneAngle(q(170),q(-170))!-20)<1e-8);assert.equal(signedPhoneAngle([0,0,0,0],q(0)),null);
 const s=new MechanismStore(),p=new JointPhoneInput(s,()=>{});p.enabled=true;const f=(hold:boolean,n:number,t:number)=>p.frame({type:'frame',hold,q:q(n),source:'test',screenAngle:0,active:true,visible:true},t);
 f(true,0,0);assert.equal(p.held,false);f(false,0,1);f(true,0,2);f(true,40,3);p.tick(20,.02);assert.ok(s.state.pose.angle>0);f(false,40,21);const stopped=s.state.pose.angle;p.tick(50,.03);assert.equal(s.state.pose.angle,stopped);f(true,90,51);p.tick(60,.01);assert.equal(s.state.pose.angle,stopped);assert.equal(p.tick(500,.05),true);assert.equal(p.held,false);f(true,100,501);assert.equal(p.held,false);
});
test('concurrent view and joint history undo only the completed operation',()=>{
 const s=new MechanismStore();s.begin('phone');s.beginView();s.setPose({angle:50,lift:0},'phone');s.view({zoom:2});s.endView();s.setPose({angle:60,lift:0},'phone');s.end('phone');assert.equal(s.history.length,2);s.undo();assert.equal(s.state.pose.angle,0);assert.equal(s.state.view.zoom,2);s.undo();assert.equal(s.state.view.zoom,1);assert.equal(s.state.pose.angle,0);
});
test('pointing distinguishes index extension from open palm and fist; dwell cancels and latches',()=>{
 const point=metricHand(4),open=metricHand(0);for(let i=5;i<=8;i++)point[i]={...open[i]};assert.equal(isPointing(point),true);assert.equal(isPointing(open),false);assert.equal(isPointing(metricHand(4)),false);assert.equal(isPointing([]),false);
 const d=new Dwell();assert.equal(d.update('lid',0).select,null);assert.equal(d.update('lid',499).select,null);assert.equal(d.update('lid',500).select,'lid');assert.equal(d.update('lid',700).select,null);d.update(null,701);assert.equal(d.update('tray',800).progress,0);assert.equal(d.update('tray',1300).select,'tray');
});
test('recording uses monotonic accepted state and excludes paused duration',()=>{
 const s=new MechanismStore(),r=new Recorder();r.start(s.state,1000,'mouse');s.action({angle:50,lift:0});r.sample(s.state,1200,true);r.pause(s.state,1300,'Input lost');r.resume(2300);s.action({angle:100,lift:0});const t=r.finish(s.state,2500)!;assert.equal(t.duration,500);assert.equal(t.interrupted,true);assert.equal(t.samples[0].t,0);assert.equal(t.samples.at(-1)!.t,500);assert.equal(t.steps[0].kind,'interruption');assert.equal(poseAt(t,500).angle,100);assert.ok(poseAt(t,100).angle>0&&poseAt(t,100).angle<50);assert.equal(validateTake(t).duration,500);
 const roundtrip=importTakes(JSON.stringify(exportTakes([t])));assert.deepEqual(roundtrip,[t]);
});
test('import rejects tunnelling, malformed timestamps, out-of-range state and oversized recordings',()=>{
 const s=new MechanismStore(),r=new Recorder();r.start(s.state,0,'mouse');const t=r.finish(s.state,1000)!;const bad=structuredClone(t);bad.config.fixture='shelf';bad.samples[1].angle=120;assert.throws(()=>validateTake(bad),/crosses/);bad.config.fixture='clear';bad.samples[1].t=0;assert.throws(()=>validateTake(bad),/timestamp/);bad.samples[1].t=1000;bad.samples[1].angle=999;assert.throws(()=>validateTake(bad),/invalid pose/);assert.throws(()=>importTakes(' '.repeat(2097153)),/smaller/);assert.throws(()=>importTakes(JSON.stringify({...exportTakes([t]),schema:2})),/Unsupported/);
});
