import { percentile } from './stats';

export type Landmark={x:number;y:number;z:number};
export class HandProbe {
  private worker:Worker|null=null;
  private timer?:ReturnType<typeof setTimeout>;
  private stopped=false;
  private lastVideoTime=-1;
  private started=0;
  private samples:number[]=[];
  private workerSamples:number[]=[];
  private modelStarted=0;
  private modelStartupMs=0;
  private frames=0;
  private detectedFrames=0;
  private maxHands=0;
  private readyTimer?:ReturnType<typeof setTimeout>;
  constructor(private video:HTMLVideoElement,private canvas:HTMLCanvasElement,private report:(data:Record<string,unknown>,message:string)=>void,private onFrame?:(hands:Landmark[][],capturedAt:number,worldHands:Landmark[][])=>void){}
  start(){
    this.modelStarted=performance.now();
    this.worker=new Worker('/hand-worker.js');
    this.readyTimer=setTimeout(()=>this.fail('Hand model did not initialize within 30 seconds.'),30000);
    this.worker.onerror=e=>this.fail(e.message);
    this.worker.onmessage=({data})=>{
      if(this.stopped)return;
      if(data.type==='error'){this.fail(data.message);return;}
      if(data.type==='ready'){clearTimeout(this.readyTimer);this.started=performance.now();this.modelStartupMs=this.started-this.modelStarted;void this.next();}
      if(data.type==='result'){
        this.frames++;this.samples.push(data.inferenceMs);if(this.samples.length>300)this.samples.shift();
        this.workerSamples.push(performance.now()-data.timestamp);if(this.workerSamples.length>300)this.workerSamples.shift();
        const hands=data.landmarks as Landmark[][];
        this.onFrame?.(hands,data.timestamp,data.worldLandmarks??[]);
        if(hands.length)this.detectedFrames++;this.maxHands=Math.max(this.maxHands,hands.length);
        const rate=this.frames/Math.max(.001,(performance.now()-this.started)/1000);
        this.draw(hands);
        const metrics={status:'running',frames:this.frames,detectedFrames:this.detectedFrames,maxHands:this.maxHands,handsNow:hands.length,processedHz:rate,modelStartupMs:this.modelStartupMs,inferenceP50Ms:percentile(this.samples,.5),inferenceP95Ms:percentile(this.samples,.95),workerP95Ms:percentile(this.workerSamples,.95)};
        this.report(metrics,`${hands.length} hand${hands.length===1?'':'s'} detected · ${rate.toFixed(1)} processed frames/s · inference p95 ${percentile(this.samples,.95)?.toFixed(1)} ms. ${hands.length?'Move slowly and check that the dots follow your fingers.':'Show an open hand to the webcam.'}`);
        window.dispatchEvent(new CustomEvent('studio-hand-metrics',{detail:metrics}));
        this.timer=setTimeout(()=>void this.next(),30);
      }
    };
    this.worker.postMessage({type:'init'});
  }
  private async next(){
    if(this.stopped)return;
    if(this.video.readyState<2||this.video.currentTime===this.lastVideoTime){this.timer=setTimeout(()=>void this.next(),30);return;}
    this.lastVideoTime=this.video.currentTime;
    try{
      const bitmap=await createImageBitmap(this.video);
      if(this.stopped){bitmap.close();return;}
      this.worker?.postMessage({type:'frame',bitmap,timestamp:performance.now()},[bitmap]);
    }catch(e){this.fail(String(e));}
  }
  private draw(hands:Landmark[][]){
    this.canvas.width=this.video.videoWidth;this.canvas.height=this.video.videoHeight;
    const c=this.canvas.getContext('2d')!;c.clearRect(0,0,this.canvas.width,this.canvas.height);
    for(const hand of hands)for(const p of hand){c.beginPath();c.arc(p.x*this.canvas.width,p.y*this.canvas.height,5,0,Math.PI*2);c.fillStyle='#d9ff83';c.fill();c.strokeStyle='#173b29';c.lineWidth=2;c.stroke();}
  }
  private fail(message:string){this.stop();this.report({status:'error',reason:message},`Hand tracking: ${message}`);window.dispatchEvent(new CustomEvent('studio-hand-metrics',{detail:{status:'error',reason:message}}));}
  stop(){
    this.stopped=true;clearTimeout(this.timer);clearTimeout(this.readyTimer);this.worker?.terminate();this.worker=null;
    this.canvas.getContext('2d')?.clearRect(0,0,this.canvas.width,this.canvas.height);
    window.dispatchEvent(new CustomEvent('studio-hand-metrics',{detail:{status:'off'}}));
  }
}
