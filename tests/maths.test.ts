import test from 'node:test';
import assert from 'node:assert/strict';
import {Euler,Quaternion,Vector3} from 'three';
import {averageError,basis,dataset,initialLesson,mean,pca,project,validateLesson} from '../src/maths/model';
import type {Quat,Vec3} from '../src/types';
const near=(a:number,b:number,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
test('projection produces two coordinates and a perpendicular residual',()=>{
  const q=new Quaternion().setFromEuler(new Euler(.4,.7,.2)).toArray() as Quat,point:Vec3=[3,1,4],origin:Vec3=[1,2,-1];
  const result=project(point,origin,q),{u,v,n}=basis(q),residual=new Vector3(...point).sub(new Vector3(...result.reconstructed));
  near(residual.dot(u),0);near(residual.dot(v),0);near(residual.dot(n),result.distance);
  near(residual.lengthSq(),result.error);
  const reconstructed=new Vector3(...origin).addScaledVector(u,result.z[0]).addScaledVector(v,result.z[1]);
  near(reconstructed.distanceTo(new Vector3(...result.reconstructed)),0);
});
test('box fixture has independently known PCA covariance and error',()=>{
  const data=dataset('cloud'),best=pca(data);assert.equal(data.length,8);assert.deepEqual(mean(data),[0,0,0]);
  best.values.forEach((v,i)=>near(v,[9,4,.25][i]));near(best.error,.25);near(best.retained/best.total,52/53);
  near(averageError(data,best.origin,best.q),.25);
  near(averageError(data,[0,0,0],new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/2).toArray() as Quat),4);
});
test('PCA follows a rotated and translated dataset, retaining the known optimum',()=>{
  const rotation=new Quaternion().setFromEuler(new Euler(.8,-.4,.35));
  const data=dataset('cloud').map(p=>new Vector3(...p).applyQuaternion(rotation).add(new Vector3(5,-2,7)).toArray() as Vec3),best=pca(data);
  near(best.error,.25);best.values.forEach((v,i)=>near(v,[9,4,.25][i]));
  near(new Vector3(...best.normal).cross(new Vector3(0,0,1).applyQuaternion(rotation)).length(),0);
  near(averageError(data,best.origin,best.q),.25);
});
test('normal sign and in-plane rotation do not change reconstruction or error',()=>{
  const data=dataset('challenge'),q=pca(data).q,spin=new Quaternion().fromArray(q).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.8)).toArray() as Quat;
  const reversed=new Quaternion().fromArray(q).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI)).toArray() as Quat;
  for(const other of [spin,reversed,q.map(x=>-x) as Quat]){
    near(averageError(data,mean(data),q),averageError(data,mean(data),other));
    project(data[4],mean(data),q).reconstructed.forEach((v,i)=>near(v,project(data[4],mean(data),other).reconstructed[i]));
  }
});
test('challenge is repeatable, centred, and PCA beats arbitrary planes',()=>{
  const data=dataset('challenge');assert.deepEqual(data,dataset('challenge'));mean(data).forEach(n=>near(n,0));const best=pca(data);
  for(let i=0;i<20;i++){const q=new Quaternion().setFromEuler(new Euler(i*.4,i*.7,i*.2)).toArray() as Quat;assert.ok(averageError(data,best.origin,q)>=best.error-1e-9);}
  assert.ok(best.total>0);near(averageError(data,best.origin,best.q),best.error);
});
test('lesson persistence validates geometry and snapshots without sharing references',()=>{
  const state=initialLesson(),restored=validateLesson(state);restored.q[0]=.1;assert.equal(state.q[0],0);
  for(const bad of [{...state,q:[0,0,0,0]},{...state,selected:100},{...state,stage:'missing'},{...state,saved:[null]},{...state,annotations:[{id:'a',points:[[Infinity,0]]}]}])assert.throws(()=>validateLesson(bad));
});
