import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base=process.env.STUDIO_URL||'http://localhost:4174';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream']});
const context=await browser.newContext({permissions:['camera'],viewport:{width:1440,height:1050}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const angle=()=>page.evaluate(()=>window.__standStudio.state.angle);
const setAngle=async n=>{await page.locator('#angle-number').fill(String(n));await page.locator('#set-angle').click();await page.waitForFunction(n=>window.__standStudio.state.angle===n,n);};
const drag=async(dx,dy)=>{const r=await page.locator('#stand-view').boundingBox();await page.mouse.move(r.x+r.width*.5,r.y+r.height*.5);await page.mouse.down();await page.mouse.move(r.x+r.width*.5+dx,r.y+r.height*.5+dy,{steps:6});await page.mouse.up();};
try{
 assert.equal((await page.goto(base+'/mechanism')).status(),200);await page.waitForFunction(()=>!!window.__standStudio);
 await page.locator('[data-angle="0"]').click();await page.waitForFunction(()=>window.__standStudio.state.angle===0);
 await drag(0,-100);assert.ok(await angle()>10);await page.locator('#undo').click();await page.waitForFunction(()=>window.__standStudio.state.angle===0);
 await setAngle(53.2);await page.locator('#save-pose').click();await page.locator('[data-name="0"]').fill('Drawing');await page.locator('[data-name="0"]').press('Tab');
 await page.reload();await page.waitForFunction(()=>window.__standStudio?.poses[0]?.name==='Drawing');await page.locator('[data-load="0"]').click();await page.waitForFunction(()=>window.__standStudio.state.angle===53.2);
 await page.locator('#freeze').click();await page.waitForFunction(()=>document.querySelector('[data-angle="0"]').disabled);assert.equal(await page.locator('[data-angle="0"]').isDisabled(),true);await page.locator('#freeze').click();await page.waitForFunction(()=>!document.querySelector('[data-angle="0"]').disabled);
 for(const tool of ['move','rotate','zoom']){await page.locator(`[data-tool="${tool}"]`).click();const before=await page.evaluate(()=>window.__standStudio.state.view);await drag(40,-30);assert.equal(await angle(),53.2);assert.notDeepEqual(await page.evaluate(()=>window.__standStudio.state.view),before);}
 await page.locator('#center').click();await page.locator('#camera-toggle').click();await page.waitForFunction(()=>document.querySelector('#hand-video').videoWidth>0);assert.equal(await page.locator('#camera-preview').isVisible(),true);
 await page.locator('#camera-toggle').click();await page.waitForFunction(()=>document.querySelector('#hand-video').srcObject.getTracks().every(t=>t.readyState==='ended'));
 await page.screenshot({path:'reports/stand-desktop.png',fullPage:true});
 await page.setViewportSize({width:393,height:852});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'reports/stand-mobile.png',fullPage:true});
 const {token}=await fetch(base+'/api/session').then(r=>r.json());await page.goto(base+'/mechanism/phone?session='+token);await page.waitForSelector('#workspace-title');assert.equal(await page.locator('#workspace-title').innerText(),'Waiting for studio');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'reports/stand-phone.png',fullPage:true});
 await page.goto(base+'/mechanism/box');await page.waitForFunction(()=>!!window.__mechanismStudio);assert.equal(await page.locator('[data-part]').count(),2);
 assert.deepEqual(errors,[]);await writeFile('reports/stand-browser-check.json',JSON.stringify({passed:true,checks:['fold flat and mouse drag','undo per drag','exact angle','saved pose survives reload and rename','freeze','pan/rotate/zoom do not change joint','single-click camera startup and stop','mobile/phone layout','old box route preserved'],note:'Real WebGL software checks. Camera device synthetic; physical phone and webcam checked separately.'},null,2));console.log('Folding stand browser checks passed.');
}finally{await browser.close();}
