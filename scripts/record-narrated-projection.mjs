import {chromium} from 'playwright';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const base=process.env.STUDIO_URL||'http://localhost:4174';
const status=await fetch(base+'/api/status').then(r=>r.json());
if(status.phoneConnected)throw Error('Use an isolated server without a connected phone for recording.');
await mkdir('reports/demo-recording',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'/maths?demo=projection');
  await page.waitForFunction(()=>window.__mathsStudio?.demo.active&&document.querySelector('#demo-audio').readyState>=3);
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=1000;
    const c=canvas.getContext('2d'),audio=document.querySelector('#demo-audio');
    const sound=new AudioContext(),source=sound.createMediaElementSource(audio),destination=sound.createMediaStreamDestination();source.connect(destination);
    document.querySelector('#demo-play').addEventListener('click',()=>void sound.resume(),{once:true});
    const stream=new MediaStream([...canvas.captureStream(30).getVideoTracks(),...destination.stream.getAudioTracks()]);
    const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus'].find(m=>MediaRecorder.isTypeSupported(m));
    if(!mime)throw Error('A WebM audio/video encoder is required.');
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3000000,audioBitsPerSecond:128000}),chunks=[];
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    let running=true;
    const text=(value,x,y,width,font='18px "DM Sans", sans-serif',colour='#365e48',line=26)=>{
      c.font=font;c.fillStyle=colour;let row='';for(const word of value.split(/\s+/)){const next=row?row+' '+word:word;if(c.measureText(next).width>width&&row){c.fillText(row,x,y);row=word;y+=line;}else row=next;}c.fillText(row,x,y);return y+line;
    };
    const draw=()=>{
      c.fillStyle='#f6f7f0';c.fillRect(0,0,1440,1000);
      text('SPATIAL MATHS · VECTOR PROJECTION',40,44,1300,'14px "DM Sans", sans-serif');
      text(document.querySelector('#lesson-title').textContent,40,100,1360,'32px Manrope, sans-serif','#173b30',40);
      text(document.querySelector('#question').textContent,40,148,1320,'20px "DM Sans", sans-serif','#365e48',29);
      text(document.querySelector('#demo-equation').textContent,40,225,1360,'19px "DM Sans", sans-serif','#246b58');
      const scene=document.querySelector('#maths-view>canvas'),host=document.querySelector('#maths-view'),r=host.getBoundingClientRect();
      const width=960,height=width*scene.height/scene.width,scale=width/r.width;
      c.drawImage(scene,40,280,width,height);
      for(const label of host.querySelectorAll('.demo-point-label'))if(!label.hidden){const box=label.getBoundingClientRect(),x=40+(box.x-r.x)*scale,y=280+(box.y-r.y)*scale;
        c.fillStyle='#fffef9';c.fillRect(x,y,box.width*scale,box.height*scale);text(label.textContent,x+6,y+17,box.width*scale,'13px "DM Sans", sans-serif',label.classList.contains('original')?'#256b58':'#99621d');}
      text('Two retained coordinates',1050,302,340,'20px Manrope, sans-serif');
      const flat=document.querySelector('#flat-view');c.drawImage(flat,1040,320,350,350*flat.height/flat.width);
      let y=620;for(const item of document.querySelectorAll('#point-details p'))y=text(item.textContent,1050,y,340,'16px "DM Sans", sans-serif','#365e48',25);
      text('Perpendicular distance discarded',1050,800,340,'16px "DM Sans", sans-serif');text(document.querySelector('#error-value').textContent,1050,854,340,'40px Manrope, sans-serif');
      text('Green: original vector   ·   Amber: projection   ·   Pink: discarded component',40,920,1350,'17px "DM Sans", sans-serif');
      const progress=window.__mathsStudio.demo.time/76;c.fillStyle='#dce6d8';c.fillRect(40,952,1360,5);c.fillStyle='#256b58';c.fillRect(40,952,1360*progress,5);
      if(running)requestAnimationFrame(draw);
    };
    draw();recorder.start(1000);
    window.__demoCapture={sound,finish:()=>new Promise(resolve=>{recorder.onstop=()=>{running=false;stream.getTracks().forEach(t=>t.stop());void sound.close();const reader=new FileReader();reader.onload=()=>{const data=String(reader.result);resolve({base64:data.slice(data.indexOf(';base64,')+8),mime,audioTracks:1});};reader.readAsDataURL(new Blob(chunks,{type:mime}));};recorder.stop();})};
  });
  await page.locator('#demo-play').click();
  await page.waitForFunction(()=>window.__demoCapture.sound.state==='running'&&window.__mathsStudio.demo.audioTime>.05);
  await page.waitForFunction(()=>window.__mathsStudio.demo.time>=76,null,{timeout:180000});
  await page.waitForTimeout(1000);
  if(errors.length)throw Error(errors.join('\n'));
  const result=await page.evaluate(()=>window.__demoCapture.finish());
  const bytes=Buffer.from(result.base64,'base64');
  if(bytes.length<100000||bytes.readUInt32BE(0)!==0x1a45dfa3)throw Error('Recording is not a valid WebM file.');
  const target=resolve('reports/spatial-maths-projection-narrated.webm');await writeFile(target,bytes);
  // MediaRecorder streams omit a duration header. Optional lossless remux adds
  // an immediately seekable duration for standalone video players.
  if(process.env.FFMPEG_PATH){const ready=resolve('reports/demo-recording/narrated-seekable.webm');execFileSync(process.env.FFMPEG_PATH,['-hide_banner','-loglevel','error','-y','-i',target,'-c','copy',ready]);await rename(ready,target);}
  await writeFile('reports/demo-recording/narrated.json',JSON.stringify({file:target,lessonSeconds:76,mime:result.mime,audioTracks:result.audioTracks,voice:'Local synthetic Samantha voice',source:'Actual WebGL/flat canvases, captions and narration captured into one stream.'},null,2));
  console.log('Narrated projection demo saved: '+target);
}finally{await browser.close();}
