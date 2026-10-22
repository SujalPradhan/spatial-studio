import test from 'node:test';
import assert from 'node:assert/strict';
import {chapterStart,demoDuration,projectionChapters,projectionDemo} from '../src/maths/demo';
import {annotationPoint,project,validateLesson} from '../src/maths/model';
import {readFileSync} from 'node:fs';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('projection demo keeps correct XY coordinates while only the camera orbits',()=>{
  const before=projectionDemo(chapterStart(2)),after=projectionDemo(chapterStart(2)+10);
  assert.deepEqual(before.state.q,after.state.q);assert.notEqual(before.state.view.yaw,after.state.view.yaw);
  for(const frame of [before,after]){
    const p=project([2,1,2],[0,0,0],frame.state.q);assert.deepEqual(p.z,[2,1]);assert.deepEqual(p.reconstructed,[2,1,0]);near(p.error,4);
  }
});
test('tilted endpoints have independently known projections and losses',()=>{
  const away=projectionDemo(chapterStart(3)+10),contained=projectionDemo(chapterStart(4)+11),final=projectionDemo(demoDuration);
  const a=project([2,1,2],[0,0,0],away.state.q);near(a.error,8);near(a.z[0],0);near(a.z[1],1);
  const c=project([2,1,2],[0,0,0],contained.state.q);near(c.error,0);near(c.z[0],Math.sqrt(8));near(c.z[1],1);
  c.reconstructed.forEach((v,i)=>near(v,[2,1,2][i]));near(project([2,1,2],[0,0,0],final.state.q).error,4);
});
test('every demo frame is valid, self-contained, and ink stays on its declared plane',()=>{
  for(let t=0;t<=demoDuration;t+=.25){const frame=projectionDemo(t);validateLesson(frame.state);
    for(const note of frame.state.annotations)for(const uv of note.points)near(project(annotationPoint(uv,note.frame),note.frame.origin,note.frame.q).error,0);
  }
  const a=projectionDemo(15),b=projectionDemo(15);a.state.q[0]=1;assert.equal(b.state.q[0],0);
});
test('chapter seeking and timeline endpoints are deterministic',()=>{
  assert.equal(demoDuration,76);assert.equal(projectionDemo(-10).time,0);assert.equal(projectionDemo(Infinity).time,0);assert.equal(projectionDemo(1000).finished,true);
  projectionChapters.forEach((_,i)=>assert.equal(projectionDemo(chapterStart(i)).chapter,i));
  assert.equal(projectionDemo(0).state.annotations.length,0);assert.ok(projectionDemo(22).state.annotations.some(n=>n.points.length>10));
});
test('bundled narration spans the timeline and contains timed non-overlapping speech',()=>{
  const wav=readFileSync(new URL('../public/audio/projection-narration.wav',import.meta.url));
  assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',36,40),'data');
  assert.equal(wav.readUInt16LE(22),1);assert.equal(wav.readUInt16LE(34),16);
  const sampleRate=wav.readUInt32LE(24),length=wav.readUInt32LE(40);assert.equal(length/sampleRate/2,demoDuration);
  let peak=0;for(let i=44;i<wav.length;i+=2)peak=Math.max(peak,Math.abs(wav.readInt16LE(i)));assert.ok(peak>1000);
  const manifest=JSON.parse(readFileSync(new URL('../public/audio/projection-narration.json',import.meta.url),'utf8'));
  assert.equal(manifest.duration,demoDuration);let end=0;for(const cue of manifest.cues){assert.ok(cue.start>=end);end=cue.start+cue.duration;assert.ok(end<=demoDuration);}
});
