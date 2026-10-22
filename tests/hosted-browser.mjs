import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';

const base=process.env.STUDIO_URL||'http://localhost:4175';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream']});
const context=await browser.newContext({permissions:['camera'],acceptDownloads:true});
const errors=[],backend=[],sockets=[];
context.on('page',page=>{
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('websocket',ws=>sockets.push(ws.url()));
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))backend.push(r.url());});
});
const page=await context.newPage();
const checks=[];
try{
 await page.goto(base+'/cone');
 await page.locator('.hosted-preview').waitFor();
 const phoneAvailable=await page.locator('#pair-phone').count()>0;
 assert.equal(await page.locator('#connect-help').isVisible(),false);
 assert.equal(await page.locator('[data-mode="phone"]').isVisible(),phoneAvailable);
 await page.locator('#camera-shortcut').click();
 await page.waitForFunction(()=>window.__sectionStudio?.hands.status==='running',null,{timeout:60000});
 const stats=await page.evaluate(()=>window.__sectionStudio.hands);
 for(const key of ['modelStartupMs','processedHz','inferenceP50Ms','inferenceP95Ms','workerP95Ms'])assert.ok(Number.isFinite(stats[key]),key);
 await page.locator('.hosted-preview summary').click();
 await page.waitForFunction(()=>document.querySelector('#hosted-timings').textContent.includes('Inference p50/p95'));
 const downloadPromise=page.waitForEvent('download');await page.locator('#save-timings').click();
 const download=await downloadPromise;const exported=JSON.parse(await readFile(await download.path(),'utf8'));
 assert.ok(exported.metrics.frames>0);assert.ok(!('landmarks' in exported.metrics));
 await page.locator('[data-solid="cylinder"]').click();
 assert.equal(await page.evaluate(()=>window.__sectionStudio.state.solid),'cylinder');
 assert.equal(await page.evaluate(()=>window.__sectionStudio.hands.status),'running');
 await page.locator('[data-solid="cube"]').click();
 assert.equal(await page.evaluate(()=>window.__sectionStudio.state.solid),'cube');
 checks.push('Real MediaPipe model and WASM initialize on synthetic video; metrics export; all three shapes retain camera');
 await page.locator('#camera-shortcut').click();
 assert.equal(await page.evaluate(()=>window.__sectionStudio.hands.status),'off');
 checks.push('Stopping camera releases tracking');

 await page.goto(base+'/mechanism');await page.locator('.hosted-preview').waitFor();
 await page.waitForFunction(()=>window.__standStudio?.phone.owns);
 await page.locator('[data-angle="45"]').click();
 assert.equal(await page.evaluate(()=>window.__standStudio.state.angle),45);
 // Headless Chrome reports both tabs focused; model real focus explicitly.
 await page.evaluate(()=>{document.hasFocus=()=>false;window.dispatchEvent(new Event('blur'));});
 const second=await context.newPage();await second.goto(base+'/mechanism');await second.bringToFront();
 await second.waitForFunction(()=>window.__standStudio?.phone.owns);
 await second.locator('[data-angle="65"]').click();await second.locator('.workspace-nav a[href="/cube"]').click();
 await second.waitForFunction(()=>!!window.__sectionStudio);
 await second.evaluate(()=>{document.hasFocus=()=>false;window.dispatchEvent(new Event('blur'));});
 await page.bringToFront();await page.evaluate(()=>{document.hasFocus=()=>true;window.dispatchEvent(new Event('focus'));});await page.waitForFunction(()=>window.__standStudio?.phone.owns&&window.__standStudio.state.angle===65);
 assert.equal(await second.evaluate(()=>window.__sectionStudio?.phone.connected),false);
 await second.close();
 checks.push('Browser-local ownership transfers between tabs and restores persisted changes');

 await page.goto(base+'/art');await page.locator('.hosted-preview').waitFor();
 await page.waitForFunction(()=>window.__artStudio?.owns);
 await page.locator('[data-tool="draw"]').click();
 const bounds=await page.locator('#art-view').boundingBox();
 await page.mouse.move(bounds.x+bounds.width*.4,bounds.y+bounds.height*.45);await page.mouse.down();
 await page.mouse.move(bounds.x+bounds.width*.6,bounds.y+bounds.height*.5,{steps:8});await page.mouse.up();
 await page.waitForFunction(()=>window.__artStudio.state.strokes.some(s=>s.finished&&s.points.length>1));
 checks.push('Mouse spatial ink draws and finishes without crashing');

 await page.goto(base+'/maths?demo=projection');await page.locator('.hosted-preview').waitFor();
 await page.waitForFunction(()=>window.__mathsStudio?.demo.active);
 await page.locator('#demo-play').click();await page.waitForFunction(()=>window.__mathsStudio.demo.time>.5);
 await page.locator('#demo-play').click();assert.equal(await page.evaluate(()=>window.__mathsStudio.demo.playing),false);
 checks.push('Maths narrated demo plays and pauses without a relay');
 await page.goto(base+'/mechanism/box');await page.locator('.hosted-preview').waitFor();
 assert.equal(await page.locator('#camera-toggle').isEnabled(),true);
 await page.goto(base+'/phone');
 if(phoneAvailable)await page.locator('#pair-code').waitFor();else{await page.waitForSelector('a[href="/cone"]');assert.ok((await page.locator('#app').innerText()).includes('local build'));}
 await page.goto(base+'/lab');await page.waitForSelector('a[href="/cone"]');assert.ok((await page.locator('#app').innerText()).includes('local build'));
 checks.push('Box route loads; phone entry reflects deployment capabilities; lab remains local');
 assert.deepEqual(backend,[]);assert.deepEqual(sockets,[]);assert.deepEqual(errors,[]);
 checks.push('No API calls, WebSockets or page errors in hosted mode');
 await mkdir('reports',{recursive:true});await writeFile('reports/hosted-check.json',JSON.stringify({passed:true,checks,syntheticVideoTimings:stats,note:'Synthetic camera confirms execution, not human gesture accuracy or physical motion-to-display latency.'},null,2));
 console.log(checks.join('\n'));
}finally{await browser.close();}
