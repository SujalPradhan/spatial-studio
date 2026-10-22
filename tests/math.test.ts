import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { boxSection } from '../src/plane';
import { quaternionAngle, summarize, finiteValues, motionGyroRadians } from '../src/stats';

test('cube center cut has four corners all in the cutting plane',()=>{
  const points=boxSection(new Vector3(0,1,0),0,1);
  assert.equal(points.length,4);for(const p of points){assert.equal(p.y,0);assert.equal(Math.abs(p.x),1);assert.equal(Math.abs(p.z),1);}
});
test('cube diagonal section is a hexagon; near corner section is a triangle',()=>{
  const normal=new Vector3(1,1,1).normalize();
  assert.equal(boxSection(normal,0,1).length,6);
  const triangle=boxSection(normal,1.2,1);assert.equal(triangle.length,3);
  for(const p of triangle)assert.ok(Math.abs(normal.dot(p)-1.2)<1e-9);
});
test('empty, tangent-point and coincident-face cuts are handled',()=>{
  assert.equal(boxSection(new Vector3(0,1,0),2,1).length,0);
  assert.equal(boxSection(new Vector3(1,1,1).normalize(),Math.sqrt(3),1).length,0);
  assert.equal(boxSection(new Vector3(0,1,0),1,1).length,4);
});
test('normal and depth sign reversal preserves the section',()=>{
  const n=new Vector3(1,2,3).normalize();const a=boxSection(n,.3,1);const b=boxSection(n.clone().negate(),-.3,1);
  assert.equal(a.length,b.length);for(const p of a)assert.ok(b.some(q=>q.distanceTo(p)<1e-9));
});
test('sample rates use intervals, do not count a lone reading as an active rate',()=>{
  assert.equal(summarize([]).rate,0);assert.equal(summarize([{t:0,values:[1]}]).rate,0);
  const r=summarize([{t:0,values:[1,3]},{t:20,values:[3,5]},{t:40,values:[5,7]}]);
  assert.equal(r.rate,50);assert.deepEqual(r.mean,[3,5]);assert.equal(r.gapP95,20);
});
test('orientation drift respects equivalent quaternion signs',()=>{
  assert.equal(quaternionAngle([0,0,0,1],[0,0,0,-1]),0);
  assert.ok(Math.abs(quaternionAngle([0,0,0,1],[Math.SQRT1_2,0,0,Math.SQRT1_2])-90)<1e-8);
  assert.equal(finiteValues([null,1,2]),false);assert.equal(finiteValues([0,1,2]),true);
});
test('motion-event rotation rates preserve X/Y/Z order, unlike orientation Euler names',()=>{
  assert.deepEqual(motionGyroRadians({alpha:180,beta:90,gamma:-180}),[Math.PI,Math.PI/2,-Math.PI]);
  assert.deepEqual(motionGyroRadians({alpha:0,beta:0,gamma:0}),[0,0,0]);
  assert.equal(motionGyroRadians({alpha:null,beta:1,gamma:2}),null);
});
