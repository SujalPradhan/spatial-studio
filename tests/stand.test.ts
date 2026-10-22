import test from 'node:test';
import assert from 'node:assert/strict';
import {backrestPoint,StandStore,readPoses} from '../src/stand/model';
import {StandPhoneInput} from '../src/stand/phone-input';
const q=(d:number)=>[Math.sin(d*Math.PI/360),0,0,Math.cos(d*Math.PI/360)];
test('backrest folds flat and remains above its base across its travel',()=>{
 assert.deepEqual(backrestPoint(0,0,-190,0),[0,15,-90]);
 const upright=backrestPoint(0,0,-190,80);assert.ok(Math.abs(upright[1]-(15+190*Math.sin(80*Math.PI/180)))<1e-8);
 for(let a=0;a<=80;a+=1)for(const x of [-64,64])for(const y of [-3,3])for(const z of [-190,0])assert.ok(backrestPoint(x,y,z,a)[1]>=12);
});
test('joint bounds, competing input and one undo step per hold',()=>{
 const s=new StandStore();assert.ok(s.begin('phone'));assert.equal(s.begin('mouse'),false);
 s.set(100,'phone');assert.equal(s.state.angle,80);s.set(70,'phone');s.set(35,'phone');s.end('phone');assert.equal(s.history.length,1);s.undo();assert.equal(s.state.angle,60);
 s.action(-100);assert.equal(s.state.angle,0);s.freeze();s.action(80);assert.equal(s.state.angle,0);
});
test('concurrent view and joint history restores only the changed scope',()=>{
 const s=new StandStore();s.begin('phone');s.beginView();s.set(40,'phone');s.setView({x:20});s.endView();s.end('phone');s.undo();assert.equal(s.state.angle,60);assert.equal(s.state.view.x,20);s.undo();assert.equal(s.state.view.x,0);
});
test('phone release cancels its target, re-grab is neutral, and stale input needs a release',()=>{
 const s=new StandStore(),p=new StandPhoneInput(s);p.enabled=true;
 const frame=(d:number,hold:boolean,t:number)=>p.frame({type:'frame',q:q(d),hold,active:true,visible:true,source:'test',screenAngle:0},t);
 frame(0,false,0);frame(0,true,10);frame(15,true,20);p.tick(30,.1);assert.ok(s.state.angle>60);frame(15,false,40);const stopped=s.state.angle;p.tick(45,.1);assert.equal(s.state.angle,stopped);
 frame(70,true,50);p.tick(55,.1);assert.equal(s.state.angle,stopped);frame(75,true,60);p.tick(70,.1);assert.ok(s.state.angle>stopped);p.tick(500,.1);const stale=s.state.angle;frame(0,true,510);p.tick(520,.1);assert.equal(s.state.angle,stale);frame(0,false,530);frame(0,true,540);assert.ok(p.held);
});
test('saved poses discard malformed values and unknown fields',()=>{
 assert.deepEqual(readPoses([{name:'Reading',angle:65,extra:42},{name:'bad',angle:90},{name:'bad',angle:NaN},null]),[{name:'Reading',angle:65}]);assert.deepEqual(readPoses({}),[]);
});
