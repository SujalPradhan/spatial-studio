export interface Landmark {x:number;y:number;z:number}
export interface Bounds {minX:number;maxX:number;minY:number;maxY:number}
export interface FistPose {curled:number;extended:number;closed:boolean;open:boolean}
export interface FistFrame {phase:'idle'|'armed'|'confirming'|'start'|'move'|'end';x:number;y:number;pose:FistPose;message:string}
const distance=(a:Landmark,b:Landmark)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function jointCos(a:Landmark,b:Landmark,c:Landmark){
 const u={x:a.x-b.x,y:a.y-b.y,z:a.z-b.z},v={x:c.x-b.x,y:c.y-b.y,z:c.z-b.z};
 const length=Math.hypot(u.x,u.y,u.z)*Math.hypot(v.x,v.y,v.z);
 return length>1e-9?(u.x*v.x+u.y*v.y+u.z*v.z)/length:null;
}
// Joint bending and wrist-relative fingertip distances distinguish a whole fist
// from a thumb/index pinch. The thumb may sit outside the fist naturally.
export function fistPose(hand:Landmark[]):FistPose{
 const empty={curled:0,extended:0,closed:false,open:false};
 if(hand.length!==21||hand.some(p=>![p.x,p.y,p.z].every(Number.isFinite)))return empty;
 const palm=distance(hand[0],hand[9]);if(palm<1e-5)return empty;
 let curled=0,extended=0;
 for(const mcp of [5,9,13,17]){
  const pip=hand[mcp+1],dip=hand[mcp+2],tip=hand[mcp+3];
  const bend=jointCos(hand[mcp],pip,dip),endBend=jointCos(pip,dip,tip);if(bend===null||endBend===null)continue;
  const near=distance(tip,hand[0])<distance(pip,hand[0])*1.08;
  if((bend>-.4&&(endBend>-.75||near))||(near&&bend>-.65))curled++;
  if(bend<-.72&&distance(tip,hand[0])>distance(pip,hand[0])*1.12)extended++;
 }
 return {curled,extended,closed:curled===4,open:extended>=3};
}
export class FistGate {
 private armed=false;private active=false;private candidate:number|null=null;private wrist:Landmark|null=null;
 region:'any'|'left'|'right'='right';
 reset():FistFrame{const active=this.active;this.armed=false;this.active=false;this.candidate=null;this.wrist=null;return {phase:active?'end':'idle',x:0,y:0,pose:{curled:0,extended:0,closed:false,open:false},message:'Open your free hand to prepare.'};}
 update(hands:Landmark[][],time:number,bounds:Bounds,worldHands:Landmark[][]=[],aspect=1):FistFrame{
  let choices=hands.map((hand,index)=>({hand,index})).filter(({hand:h})=>h.length===21&&h.every(p=>[p.x,p.y,p.z].every(Number.isFinite))).filter(({hand:h})=>this.region==='any'||(this.region==='left'?1-h[0].x<.5:1-h[0].x>=.5));
  const distance2=(a:Landmark,b:Landmark)=>Math.hypot(a.x-b.x,a.y-b.y);
  if(this.wrist)choices=choices.filter(({hand:h})=>distance2(h[0],this.wrist!)<.22).sort((a,b)=>distance2(a.hand[0],this.wrist!)-distance2(b.hand[0],this.wrist!));
  if(!choices.length){const result=this.reset();result.message='Hand lost. Open your hand before grabbing again.';return result;}
  const {hand,index}=choices[0];this.wrist=hand[0];
  const metric=worldHands[index]?.length===21?worldHands[index]:hand.map(p=>({...p,y:p.y/Math.max(.1,aspect)}));
  const pose=fistPose(metric);const center=[0,5,9,13,17].reduce((p,i)=>({x:p.x+hand[i].x/5,y:p.y+hand[i].y/5}),{x:0,y:0});
  const x=1-center.x,y=center.y;const inside=x>=bounds.minX&&x<=bounds.maxX&&y>=bounds.minY&&y<=bounds.maxY;
  if(pose.open){const was=this.active;this.active=false;this.candidate=null;this.armed=true;return {phase:was?'end':'armed',x,y,pose,message:'Ready. Close your fist, then move your hand.'};}
  if(this.active){
   if(pose.curled<3||pose.extended>=2){const result=this.reset();return {...result,x,y,pose,message:'Released. Open your hand to prepare again.'};}
   return {phase:'move',x,y,pose,message:'Fist grabbed · move your hand. Open to release.'};
  }
  if(!this.armed||!inside){this.candidate=null;return {phase:'idle',x,y,pose,message:this.armed?'Move your palm into the active region.':'Open your hand before making a fist.'};}
  if(pose.closed){this.candidate??=time;if(time-this.candidate>=120){this.active=true;this.armed=false;this.candidate=null;return {phase:'start',x,y,pose,message:'Fist grabbed · move your hand. Open to release.'};}return {phase:'confirming',x,y,pose,message:'Hold your fist briefly…'};}
  this.candidate=null;return {phase:'armed',x,y,pose,message:'Ready. Curl all four fingers into a fist.'};
 }
}
