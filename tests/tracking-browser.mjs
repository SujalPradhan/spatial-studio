import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base=process.env.STUDIO_URL||'http://localhost:4175';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream']});
const desktop=await browser.newContext({permissions:['camera'],acceptDownloads:true}),mobile=await browser.newContext({permissions:['camera'],viewport:{width:393,height:852},isMobile:true,hasTouch:true});
for(const [context,isPhone] of [[desktop,false],[mobile,true]])await context.addInitScript(({isPhone})=>{
 const getMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=constraints=>{window.requestedFacing=constraints.video?.facingMode?.ideal;return getMedia(constraints);};
 const Native=window.Worker;window.testHand=false;window.testOcclusion=false;
 window.Worker=class extends Native{constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data.type==='result'&&window.testHand)e.data.landmarks=window.testOcclusion?[]:[Array.from({length:21},()=>({x:(800*(50-(isPhone?250:0))/650+320)/640,y:(800*20/650+240)/480,z:0}))];});}};
},{isPhone});
const d=await desktop.newPage(),p=await mobile.newPage(),errors=[],checks=[];
for(const page of [d,p])page.on('pageerror',e=>errors.push(e.message));
try{
 await d.goto(base+'/tracking');await d.locator('#pair-phone').click();await d.locator('#pairing-qr').waitFor({state:'visible'});const code=(await d.locator('#pairing-code').textContent()).replace('-','');await d.locator('#pair-close').click();
 await p.goto(base+'/phone#pair='+code);await p.waitForFunction(()=>document.querySelector('#workspace-title')?.textContent==='Two-camera tracking');assert.equal(await p.locator('#start').isVisible(),false);
 assert.equal(await p.locator('#tracking-phone-facing').inputValue(),'user');
 await d.locator('#tracking-start').click();await p.locator('#tracking-phone-start').click();
 await d.waitForFunction(()=>window.__trackingStudio.state.localFrames>3&&window.__trackingStudio.state.remoteFrames>3,null,{timeout:60000});
 assert.equal(await p.evaluate(()=>window.requestedFacing),'user');assert.equal(await d.evaluate(()=>window.__trackingStudio.state.calibrated),false);assert.equal(await d.evaluate(()=>window.__trackingStudio.state.estimate),null);
 checks.push('QR pairs Tracking workspace; real MediaPipe runs in both browser contexts on synthetic camera; phone landmarks reach desktop without continuous video');
 await d.locator('#tracking-capture').click();await d.waitForFunction(()=>window.__trackingStudio.state.pairs===1);
 const download=d.waitForEvent('download');await d.locator('#tracking-captures-export').click();const captureFile=await download;const captured=JSON.parse(await readFile(await captureFile.path(),'utf8'));
 checks.push('Explicit calibration capture transfers a single phone JPEG and exports paired photos');
 const id=v=>({captureId:v.captureId,width:v.width,height:v.height});const cal={schema:'spatial-stereo-v1',units:'mm',desktop:id(captured.pairs[0].desktop),phone:id(captured.pairs[0].phone),K1:[800,0,320,0,800,240,0,0,1],K2:[800,0,320,0,800,240,0,0,1],D1:[0,0,0,0,0],D2:[0,0,0,0,0],R:[1,0,0,0,1,0,0,0,1],T:[-250,0,0],rms:0};
 await d.evaluate(()=>window.testHand=true);await p.evaluate(()=>window.testHand=true);
 await d.locator('#tracking-calibration').setInputFiles({name:'synthetic-calibration.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(cal))});
 await d.waitForFunction(()=>!!window.__trackingStudio.state.estimate);const point=await d.evaluate(()=>window.__trackingStudio.state.estimate.point);assert.ok(Math.hypot(...point.map((v,i)=>v-[50,20,650][i]))<.001);
 await p.evaluate(()=>window.testOcclusion=true);await d.waitForFunction(()=>!window.__trackingStudio.state.estimate);await p.evaluate(()=>window.testOcclusion=false);await d.waitForFunction(()=>!!window.__trackingStudio.state.estimate);
 checks.push('Known synthetic stereo landmarks yield the independently expected 3D point; loss of one view removes the point');
 // Model Terminal/file-dialog focus loss without changing physical camera sessions.
 await d.evaluate(()=>{window.testBefore=window.__trackingStudio.state.localFrames;window.testRemoteBefore=window.__trackingStudio.state.remoteFrames;document.hasFocus=()=>false;window.dispatchEvent(new Event('blur'));});
 await d.waitForFunction(()=>!window.__trackingStudio.state.owns);await p.waitForFunction(()=>document.querySelector('#tracking-phone output').textContent.includes('paused'));
 assert.equal(await d.evaluate(()=>window.__trackingStudio.state.cameraOn),true);assert.equal(await p.locator('#tracking-phone video').evaluate(v=>v.srcObject?.getVideoTracks()[0].readyState),'live');
 await d.evaluate(()=>{document.hasFocus=()=>true;window.dispatchEvent(new Event('focus'));});await d.waitForFunction(()=>window.__trackingStudio.state.owns&&window.__trackingStudio.state.localFrames>window.testBefore&&window.__trackingStudio.state.remoteFrames>window.testRemoteBefore,null,{timeout:60000});
 await d.locator('#tracking-capture').click();await d.waitForFunction(()=>window.__trackingStudio.state.pairs===2);
 checks.push('Terminal-style blur pauses inference, retains both camera identities, and resumes the same calibration capture session');
 await p.locator('#tracking-phone-facing').selectOption('environment');await p.waitForFunction(()=>!document.querySelector('#tracking-phone video').srcObject);await d.waitForFunction(()=>!window.__trackingStudio.state.calibrated);assert.equal(await p.locator('#tracking-phone-start').textContent(),'Start rear camera');
 await p.locator('#tracking-phone-start').click();await d.waitForFunction(()=>window.__trackingStudio.state.remoteFrames>3,null,{timeout:60000});assert.equal(await p.evaluate(()=>window.requestedFacing),'environment');
 checks.push('Front camera is requested by default; rear selection closes the old stream and invalidates calibration before restart');
 const invalid=Buffer.from(JSON.stringify({schema:'wrong'}));await d.locator('#tracking-calibration').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:invalid});await d.waitForFunction(()=>document.querySelector('#tracking-status').textContent.includes('Unsupported'));assert.equal(await d.evaluate(()=>window.__trackingStudio.state.calibrated),false);
 await d.locator('#tracking-stop').click();await d.waitForFunction(()=>!window.__trackingStudio.state.cameraOn);await p.waitForFunction(()=>!document.querySelector('#tracking-phone video').srcObject);assert.equal(await d.evaluate(()=>window.__trackingStudio.state.estimate),null);
 checks.push('Malformed calibration is rejected; Stop cameras closes both streams and removes depth');
 await d.locator('.workspace-nav a[href="/cone"]').click();await p.waitForFunction(()=>document.querySelector('#workspace-title')?.textContent==='Cone');assert.equal(await p.locator('#start').isVisible(),true);assert.equal(await p.locator('#tracking-phone').isVisible(),false);
 checks.push('Existing shape controller returns after leaving Tracking lab');
 assert.deepEqual(errors,[]);await mkdir('reports',{recursive:true});await writeFile('reports/tracking-browser-check.json',JSON.stringify({passed:true,url:base,checks,note:'Synthetic video and separate browser contexts. Not real phone inference, stereo accuracy, hand matching or physical latency.'},null,2));console.log(checks.join('\n'));
}catch(e){console.log('Tracking state',await d.evaluate(()=>window.__trackingStudio?.state));console.log('Depth status',await d.locator('#tracking-status').textContent());console.log('Phone stream',await d.locator('#tracking-phone-stats').textContent());console.log('Capture status',await d.locator('#tracking-capture-status').textContent());console.log('Phone status',await p.locator('#tracking-phone output').textContent());console.log('Passed so far',checks);throw e;}finally{await browser.close();}
