import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base=process.env.STUDIO_URL||'http://localhost:4173';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const state=()=>page.evaluate(()=>window.__sectionStudio.state);
const geometry=s=>JSON.stringify([s.solid,s.object,s.plane,s.depth]);
const drag=async(dx,dy)=>{const r=await page.locator('#solid-view').boundingBox();const x=r.x+r.width*.45,y=r.y+r.height*.5;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();await page.waitForTimeout(50);};
try{
 await page.goto(base);await page.waitForFunction(()=>!!window.__sectionStudio);const original=await state();
 assert.equal(await page.evaluate(()=>window.__sectionStudio.tool),'move');
 const bounds=await page.evaluate(()=>window.__sectionStudio.projectedBounds);const area=await page.evaluate(()=>window.__sectionStudio.section.area);
 await drag(65,-45);const moved=await state();assert.ok(moved.view.x>0&&moved.view.y>0);assert.equal(geometry(moved),geometry(original));
 const after=await page.evaluate(()=>window.__sectionStudio.projectedBounds);assert.ok(after.minX>bounds.minX);assert.ok(after.minY<bounds.minY);assert.equal(await page.evaluate(()=>window.__sectionStudio.section.area),area);
 assert.equal(await page.evaluate(()=>window.__sectionStudio.history),1);await page.locator('#undo').click();await page.waitForFunction(()=>window.__sectionStudio.state.view.x===0&&window.__sectionStudio.state.view.y===0);
 await page.locator('#zoom-in').click();await page.waitForFunction(()=>window.__sectionStudio.state.view.zoom>1);const zoomed=await state();assert.equal(geometry(zoomed),geometry(original));
 await page.locator('#solid-view').hover();await page.mouse.wheel(0,-200);await page.waitForTimeout(250);assert.ok((await state()).view.zoom>zoomed.view.zoom);assert.equal((await state()).depth,0);
 await page.locator('[data-tool="zoom"]').click();const beforeZoom=(await state()).view.zoom;await drag(0,-40);assert.ok((await state()).view.zoom>beforeZoom);
 await page.locator('#reset-view').click();await page.waitForFunction(()=>window.__sectionStudio.state.view.zoom===1);assert.deepEqual((await state()).view,{x:0,y:0,zoom:1});
 await page.locator('[data-tool="height"]').click();await drag(0,-55);const raised=await state();assert.ok(raised.depth>0);assert.deepEqual(raised.view,original.view);assert.deepEqual(raised.object,original.object);assert.ok(await page.evaluate(()=>window.__sectionStudio.section.area)<area);
 await page.locator('#undo').click();await page.waitForFunction(()=>window.__sectionStudio.state.depth===0);
 await page.locator('#view-x').fill('0.65');await page.locator('#view-y').fill('-0.4');await page.locator('#view-zoom').fill('1.6');await page.locator('#save-cut').click();
 await page.locator('#reset').click();await page.waitForFunction(()=>window.__sectionStudio.state.view.zoom===1);await page.locator('[data-saved]').click();await page.waitForFunction(()=>window.__sectionStudio.state.frozen&&document.querySelector('#zoom-in').disabled&&document.querySelector('#view-y').disabled);assert.deepEqual((await state()).view,{x:.65,y:-.4,zoom:1.6});assert.equal(await page.locator('#zoom-in').isDisabled(),true);assert.equal(await page.locator('#view-y').isDisabled(),true);
 assert.equal(await page.evaluate(()=>document.body.textContent.toLowerCase().includes('pinch')),false);assert.deepEqual(errors,[]);
 await writeFile('reports/navigation-check.json',JSON.stringify({passed:true,checks:['screen-space X/Y movement','projected direction','geometry invariant under pan/zoom','one undo per drag','HUD zoom buttons','scroll zoom','drag zoom','view reset','independent cut height','snapshot view restore','freeze'],errors,note:'Automated real-WebGL software checks; not physical fist-recognition evidence.'},null,2));
 console.log('Navigation passed: X/Y pan, zoom buttons/wheel/drag, cut height, geometric invariance, undo, snapshot restore and freeze.');
}finally{await browser.close();}
