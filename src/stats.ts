import type { Quat, Sample } from './types';
export function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  return sorted[Math.min(sorted.length-1, Math.floor((sorted.length-1)*fraction))];
}
export function summarize(samples: Sample[]) {
  const width = samples[0]?.values.length ?? 0;
  const n = samples.length;
  const mean = Array.from({length: width}, (_,i) => samples.reduce((s,v) => s+v.values[i],0)/n);
  const sd = mean.map((m,i) => Math.sqrt(samples.reduce((s,v) => s+(v.values[i]-m)**2,0)/n));
  const min = mean.map((_,i) => Math.min(...samples.map(s=>s.values[i])));
  const max = mean.map((_,i) => Math.max(...samples.map(s=>s.values[i])));
  const gaps = samples.slice(1).map((s,i) => s.t-samples[i].t).filter(x=>x>=0);
  const span = n>1 ? samples[n-1].t-samples[0].t : 0;
  return { count:n, rate:span>0?(n-1)*1000/span:0, mean, sd, min, max, gapP95:percentile(gaps,.95) };
}
export function quaternionAngle(a: Quat, b: Quat): number {
  const norm = Math.hypot(...a)*Math.hypot(...b);
  if (!norm) return 0;
  const dot = Math.abs(a.reduce((s,x,i)=>s+x*b[i],0)/norm);
  return 2*Math.acos(Math.min(1,dot))*180/Math.PI;
}
export function finiteValues(values: unknown[]): values is number[] {
  return values.every(v=>typeof v==='number' && Number.isFinite(v));
}
// Motion rotationRate uses alpha=X, beta=Y, gamma=Z. This differs from
// DeviceOrientation's Euler-angle naming. W3C orientation-event § rotation rate.
export function motionGyroRadians(rate:{alpha:number|null;beta:number|null;gamma:number|null}):number[]|null {
  const axes=[rate.alpha,rate.beta,rate.gamma];
  return finiteValues(axes)?axes.map(v=>v*Math.PI/180):null;
}
