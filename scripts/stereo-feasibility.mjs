import {mkdir,writeFile} from 'node:fs/promises';
// Analytical rectified stereo experiment, NOT measurements from real cameras.
// Known calibration: parallel pinholes, 800 px focal length, 250 mm baseline.
const f=800,b=.25,z=.65,points=10000;let seed=42;
const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const gaussian=()=>Math.sqrt(-2*Math.log(Math.max(1e-9,random())))*Math.cos(2*Math.PI*random());
const quantile=(values,p)=>values.sort((a,b)=>a-b)[Math.floor((values.length-1)*p)];
const conditions=[{name:'Synchronized, noiseless',noisePx:0,lagMs:0,speed:0},{name:'Synchronized, 1 px noise',noisePx:1,lagMs:0,speed:0},{name:'10 ms offset, hand at 0.3 m/s',noisePx:0,lagMs:10,speed:.3},{name:'30 ms offset, hand at 0.3 m/s',noisePx:0,lagMs:30,speed:.3},{name:'30 ms offset, hand at 1 m/s',noisePx:0,lagMs:30,speed:1}];
const results=conditions.map(c=>{const errors=[];for(let i=0;i<points;i++){const x=(random()-.5)*.1;const left=f*x/z+gaussian()*c.noisePx;const right=f*(x+c.speed*c.lagMs/1000-b)/z+gaussian()*c.noisePx;const reconstructed=f*b/(left-right);errors.push(Math.abs(reconstructed-z)*1000);}return {...c,medianDepthErrorMm:quantile(errors,.5),p95DepthErrorMm:quantile(errors,.95)};});
const report={kind:'synthetic geometry only',calibration:{focalLengthPx:f,baselineM:b,targetDepthM:z},points,results,limitations:'Parallel rectified pinhole model. Pixel noise is hypothetical. No real camera calibration, hand detection, rolling shutter, camera movement or device performance measured. Epipolar-direction motion can create wrong depth with a plausible stereo match.'};
await mkdir('reports',{recursive:true});await writeFile('reports/stereo-feasibility.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
