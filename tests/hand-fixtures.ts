import type {Landmark} from '../src/fist';
// Idealized joint poses for software regression, not recorded camera landmarks.
export function metricHand(closedFingers=0):Landmark[]{
 const h=Array.from({length:21},()=>({x:0,y:0,z:0}));
 h[1]={x:-.5,y:.3,z:0};h[2]={x:-.8,y:.6,z:0};h[3]={x:-.9,y:.9,z:0};h[4]={x:-1,y:1.1,z:0};
 for(const [i,mcp] of [5,9,13,17].entries()){
  const x=(i-1.5)*.3;h[mcp]={x,y:1,z:0};h[mcp+1]={x,y:1.6,z:0};
  h[mcp+2]={x,y:i<closedFingers?1.5:2,z:i<closedFingers?-.45:0};h[mcp+3]={x,y:i<closedFingers?1:2.4,z:i<closedFingers?-.45:0};
 }
 return h;
}
export function imageHand(closedFingers=0):Landmark[]{return metricHand(closedFingers).map(p=>({x:.5+p.x*.14,y:.75-p.y*.16,z:p.z*.14}));}
