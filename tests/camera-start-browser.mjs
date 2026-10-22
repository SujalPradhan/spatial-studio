import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base=process.env.STUDIO_URL||'http://localhost:4174';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream']});
const context=await browser.newContext({permissions:['camera']});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
 for(const route of ['/','/mechanism/box']){
  await page.goto(`${base}${route}`);await page.waitForSelector('[data-mode="mouse"].active');
  const section=route==='/';if(section){assert.equal(await page.locator('[data-solid]').count(),3);assert.equal(await page.locator('#extra-tools').getAttribute('open'),null);}
  await page.locator(section?'#camera-shortcut':'#camera-toggle').click();
  await page.waitForFunction(selector=>{const v=document.querySelector(selector);return v?.readyState>=2&&v.videoWidth>0;},section?'#gesture-video':'#hand-video');
  assert.equal(await page.locator('[data-mode="webcam"]').getAttribute('class')==='active',true);
  assert.equal(await page.locator('#hand-region').inputValue(),'any');
  assert.equal(await page.locator(section?'#gesture-video':'#hand-video').isVisible(),true);
  if(section){const preview=await page.locator('.camera-preview-wrap').boundingBox(),solid=await page.locator('#solid-view').boundingBox();assert.ok(preview.x>=solid.x&&preview.y>=solid.y&&preview.y+preview.height<=solid.y+solid.height);}
  await page.locator(section?'#camera-shortcut':'#camera-toggle').click();await page.waitForFunction(selector=>[...document.querySelector(selector).srcObject.getTracks()].every(t=>t.readyState==='ended'),section?'#gesture-video':'#hand-video');
 }
 const denied=await context.newPage();await denied.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Camera permission denied','NotAllowedError');};});await denied.goto(base);await denied.locator('#camera-shortcut').click();await denied.waitForFunction(()=>document.querySelector('#gesture-state').textContent.includes('NotAllowedError'));assert.equal(await denied.locator('#camera-shortcut').isEnabled(),true);await denied.close();
 assert.deepEqual(errors,[]);await writeFile('reports/camera-start-check.json',JSON.stringify({passed:true,checks:['single click from Mouse starts camera on both workspaces','hand control activated automatically','default usable hand region','inline shape preview','stop releases tracks','permission failure remains visible and retryable','all three shapes retained','extra tools collapsed'],note:'Synthetic camera device verifies startup and UI behavior; separate actual-webcam check verifies real capture.'},null,2));console.log('Camera startup and simplified workspace checks passed.');
}finally{await browser.close();}
