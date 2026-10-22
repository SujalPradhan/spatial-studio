import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const base=process.env.STUDIO_URL||'http://localhost:4174';
const status=await fetch(base+'/api/status').then(r=>r.json());
if(status.phoneConnected)throw Error('Use an isolated server without a connected phone for recording.');
await mkdir('reports/demo-recording',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1050},recordVideo:{dir:'reports/demo-recording',size:{width:1440,height:1050}}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'/maths?demo=projection');await page.waitForFunction(()=>window.__mathsStudio?.demo.active);
  await page.locator('#demo-play').click();
  await page.waitForFunction(()=>window.__mathsStudio.demo.time>=window.__mathsStudio.demo.duration,null,{timeout:180000});
  await page.waitForTimeout(1800);
  if(errors.length)throw Error(errors.join('\n'));
  const video=page.video();await context.close();const target=resolve('reports/spatial-maths-projection-demo.webm');
  await video.saveAs(target);await video.delete();
  await writeFile('reports/demo-recording/recording.json',JSON.stringify({file:target,lessonSeconds:76,captioned:true,audio:false,source:'Real browser/WebGL playback of the deterministic projection demo; no phone or webcam footage.'},null,2));
  console.log('Captioned projection demo saved: '+target);
}finally{await browser.close();}
