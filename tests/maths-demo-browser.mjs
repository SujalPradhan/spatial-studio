import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.STUDIO_URL||'http://localhost:4174',browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
const seek=async t=>{await page.locator('#demo-timeline').fill(String(t));await page.waitForFunction(t=>Math.abs(window.__mathsStudio.demo.time-t)<.01,t);await page.waitForTimeout(80);};
try{
  await mkdir('reports',{recursive:true});await page.goto(base+'/maths');await page.waitForFunction(()=>window.__mathsStudio?.active);
  await page.locator('[data-stage="challenge"]').click();await page.locator('[data-save="0"]').click();const original=await page.evaluate(()=>window.__mathsStudio.state);
  await page.locator('#demo-launch').click();await page.waitForFunction(()=>window.__mathsStudio.demo.active&&window.__mathsStudio.demo.playing);
  await page.waitForFunction(()=>document.querySelector('#demo-audio').currentTime>.05);
  assert.equal(await page.locator('#demo-voice').isChecked(),true);assert.equal(await page.evaluate(()=>document.querySelector('#demo-audio').duration),76);
  await page.locator('#demo-play').click();await seek(20);assert.ok(await page.evaluate(()=>window.__mathsStudio.demo.state.annotations.some(n=>n.points.length>5)));
  await page.locator('#demo-speed').selectOption('2');await page.locator('#demo-play').click();await page.waitForFunction(()=>window.__mathsStudio.demo.time>20.1);
  const fastStart=await page.evaluate(()=>window.__mathsStudio.demo.time);await page.waitForTimeout(400);const fastEnd=await page.evaluate(()=>window.__mathsStudio.demo.time);assert.ok(fastEnd-fastStart>.5&&fastEnd-fastStart<1.2);
  assert.ok(await page.evaluate(()=>Math.abs(window.__mathsStudio.demo.time-document.querySelector('#demo-audio').currentTime)<.08));
  assert.equal(await page.evaluate(()=>document.querySelector('#demo-audio').playbackRate),2);assert.equal(await page.evaluate(()=>document.querySelector('#demo-audio').preservesPitch),true);
  await page.locator('#demo-voice').uncheck();assert.equal(await page.evaluate(()=>document.querySelector('#demo-audio').muted),true);
  await page.locator('#demo-play').click();const stopped=await page.evaluate(()=>document.querySelector('#demo-audio').currentTime);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>document.querySelector('#demo-audio').currentTime),stopped);
  await page.locator('#demo-voice').check();await page.locator('#demo-speed').selectOption('1');await seek(20);
  assert.match(await page.locator('#demo-equation').innerText(),/Lose \(0, 0, 2\)/);
  await seek(23);const q=await page.evaluate(()=>window.__mathsStudio.demo.state.q);await seek(33);assert.deepEqual(await page.evaluate(()=>window.__mathsStudio.demo.state.q),q);assert.equal(await page.locator('#error-value').innerText(),'2.00');
  await seek(47);assert.equal(await page.locator('#error-value').innerText(),'2.83');await page.screenshot({path:'reports/maths-demo-tilt.png',fullPage:true});
  await seek(61);assert.equal(await page.locator('#error-value').innerText(),'0.00');assert.match(await page.locator('#demo-equation').innerText(),/Lost distance: 0/);
  await seek(76);assert.match(await page.locator('#demo-equation').innerText(),/P\(a, b, c\)/);await page.screenshot({path:'reports/maths-demo-summary.png',fullPage:true});
  assert.deepEqual(await page.evaluate(()=>window.__mathsStudio.state),original);
  // Demo frames never replace the saved document, including after the save timer fires.
  await page.waitForTimeout(500);await page.reload();await page.waitForFunction(()=>window.__mathsStudio?.active);assert.deepEqual(await page.evaluate(()=>window.__mathsStudio.state),original);
  await page.locator('#demo-launch').click();await page.locator('#demo-play').click();await page.locator('#demo-next').click();assert.equal(await page.evaluate(()=>window.__mathsStudio.demo.time),9);await page.locator('#demo-previous').click();assert.equal(await page.evaluate(()=>window.__mathsStudio.demo.time),0);
  await page.locator('#demo-replay').click();await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>window.__mathsStudio.demo.time)>0);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForFunction(()=>!window.__mathsStudio.demo.playing);const paused=await page.evaluate(()=>window.__mathsStudio.demo.time);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.__mathsStudio.demo.time),paused);
  await page.locator('#demo-close').click();assert.deepEqual(await page.evaluate(()=>window.__mathsStudio.state),original);assert.equal(await page.locator('#demo-panel').isVisible(),false);
  await page.goto(base+'/maths?demo=projection');await page.waitForFunction(()=>window.__mathsStudio?.demo.active);assert.equal(await page.evaluate(()=>window.__mathsStudio.demo.playing),false);
  await page.setViewportSize({width:393,height:852});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);
  await page.route('**/audio/projection-narration.wav',route=>route.abort());await page.reload();await page.waitForFunction(()=>window.__mathsStudio?.demo.active&&window.__mathsStudio.demo.audioUnavailable);
  await page.locator('#demo-speed').selectOption('2');await page.locator('#demo-play').click();await page.waitForFunction(()=>window.__mathsStudio.demo.time>.3);assert.equal(await page.locator('#demo-voice').isDisabled(),true);assert.equal(await page.locator('#demo-audio-status').isVisible(),true);
  await writeFile('reports/maths-demo-check.json',JSON.stringify({passed:true,checks:['drawn annotations','orbit leaves projection fixed','tilt changes projection','zero-loss plane contains the vector','matrix summary','play/pause/replay and chapter seeking','blur pauses playback','original work survives close and reload','deep link preview','mobile layout'],note:'Browser/WebGL software validation of a scripted demonstration.'},null,2));console.log('Projection demo browser checks passed.');
}finally{await browser.close();}
