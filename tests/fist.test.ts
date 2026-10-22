import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {FistGate,fistPose} from '../src/fist';
import {metricHand,imageHand} from './hand-fixtures';
const bounds={minX:0,maxX:1,minY:0,maxY:1};
test('a fist requires all four curled fingers; a thumb/index pinch cannot grab',()=>{
 assert.equal(fistPose(metricHand(4)).closed,true);assert.equal(fistPose(metricHand(0)).open,true);
 assert.equal(fistPose(metricHand(1)).closed,false);assert.equal(fistPose(metricHand(3)).closed,false);
 const gate=new FistGate();gate.region='any';gate.update([imageHand(0)],0,bounds,[metricHand(0)]);
 assert.notEqual(gate.update([imageHand(1)],100,bounds,[metricHand(1)]).phase,'start');
 assert.notEqual(gate.update([imageHand(1)],500,bounds,[metricHand(1)]).phase,'start');
});
test('fist classification survives scale, rigid rotation, mirroring and thumb position',()=>{
 const q=new Quaternion().setFromAxisAngle(new Vector3(1,2,3).normalize(),1.1);
 for(const closed of [0,4]){const transformed=metricHand(closed).map(p=>{const v=new Vector3(p.x,p.y,p.z).multiplyScalar(.02).applyQuaternion(q).add(new Vector3(3,2,-1));return {x:-v.x,y:v.y,z:v.z};});transformed[4]={x:8,y:8,z:8};assert.equal(fistPose(transformed).closed,closed===4);assert.equal(fistPose(transformed).open,closed===0);}
});
test('fist grab confirms after an open hand and releases on opening or loss',()=>{
 const gate=new FistGate();gate.region='any';const frame=(n:number,t:number)=>gate.update([imageHand(n)],t,bounds,[metricHand(n)]);
 assert.equal(frame(4,0).phase,'idle');assert.equal(frame(0,10).phase,'armed');assert.equal(frame(4,20).phase,'confirming');assert.equal(frame(4,150).phase,'start');assert.equal(frame(4,200).phase,'move');assert.equal(frame(0,250).phase,'end');
 assert.equal(frame(4,300).phase,'confirming');assert.equal(frame(4,450).phase,'start');assert.equal(gate.update([],500,bounds).phase,'end');assert.equal(frame(4,600).phase,'idle');
});
test('palm anchor does not jump when fingers close; region and bounds prevent stray grabs',()=>{
 const gate=new FistGate();gate.region='any';const open=gate.update([imageHand(0)],0,bounds,[metricHand(0)]);gate.update([imageHand(4)],10,bounds,[metricHand(4)]);const closed=gate.update([imageHand(4)],140,bounds,[metricHand(4)]);assert.equal(open.x,closed.x);assert.equal(open.y,closed.y);
 gate.reset();gate.region='left';assert.equal(gate.update([imageHand(0).map(p=>({...p,x:p.x-.3}))],200,bounds,[metricHand(0)]).phase,'idle');
 gate.region='any';gate.update([imageHand(0)],300,bounds,[metricHand(0)]);const outside={minX:.8,maxX:1,minY:.8,maxY:1};assert.equal(gate.update([imageHand(4)],500,outside,[metricHand(4)]).phase,'idle');
});
test('invalid or degenerate landmark sets cannot produce a fist',()=>{
 assert.equal(fistPose([]).closed,false);assert.equal(fistPose(metricHand(4).map(()=>({x:0,y:0,z:0}))).closed,false);
 const invalid=metricHand(4);invalid[8].x=NaN;assert.equal(fistPose(invalid).closed,false);
});
