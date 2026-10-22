import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.STUDIO_URL||'http://localhost:4175';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream']});
const errors=[];
async function desktop(){const c=await browser.newContext({permissions:['camera']});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/cone');await p.locator('#pair-phone').click();await p.waitForFunction(()=>/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(document.querySelector('#pairing-code')?.textContent||''));const code=await p.locator('#pairing-code').innerText();await p.locator('#pair-close').click();return {context:c,page:p,code};}
async function phone(code){const c=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{window.testDegrees=0;class Sensor extends EventTarget{quaternion=[0,0,0,1];timestamp=0;start(){this.timer=setInterval(()=>{const a=window.testDegrees*Math.PI/360;this.quaternion=[Math.sin(a),0,0,Math.cos(a)];this.timestamp=performance.now();this.dispatchEvent(new Event('reading'));},20);}stop(){clearInterval(this.timer);}}window.RelativeOrientationSensor=Sensor;});await p.goto(base+'/phone');await p.locator('#pair-code').fill(code);await p.locator('#pair-form button').click();await p.waitForSelector('#start');return {context:c,page:p};}
const title=(p,text)=>p.waitForFunction(t=>document.querySelector('#workspace-title')?.textContent===t,text);
const checks=[];
try{
 const a=await desktop(),b=await desktop();assert.notEqual(a.code,b.code);
 const pa=await phone(a.code),pb=await phone(b.code);await title(pa.page,'Cone');await title(pb.page,'Cone');
 await pa.page.locator('#start').click();await pa.page.waitForFunction(()=>!document.querySelector('#clutch').disabled);
 const pad=await pa.page.locator('#clutch').boundingBox();await pa.page.mouse.move(pad.x+pad.width*.5,pad.y+pad.height*.5);await pa.page.mouse.down();await pa.page.waitForTimeout(100);await pa.page.evaluate(()=>window.testDegrees=25);
 await a.page.waitForFunction(()=>Math.abs(window.__sectionStudio.state.plane[0])>.1);assert.deepEqual(await b.page.evaluate(()=>window.__sectionStudio.state.plane),[0,0,0,1]);
 await pa.page.mouse.up();const angle=await a.page.evaluate(()=>window.__sectionStudio.state.plane);await pa.page.evaluate(()=>window.testDegrees=60);await pa.page.waitForTimeout(300);assert.deepEqual(await a.page.evaluate(()=>window.__sectionStudio.state.plane),angle);
 checks.push('Two typed codes pair isolated laptop/phone sessions; tilt moves only the intended scene; release holds pose');
 await a.page.locator('[data-solid="cylinder"]').click();await title(pa.page,'Cylinder');await pa.page.locator('#fine').fill('0.4');await a.page.waitForFunction(()=>Math.abs(window.__sectionStudio.state.depth-.4)<.001);
 await a.page.locator('.workspace-nav a[href="/mechanism"]').click();await title(pa.page,'Folding stand');await pa.page.locator('#fine').fill('45');await a.page.waitForFunction(()=>window.__standStudio.state.angle===45);
 checks.push('Pair survives shape and route navigation; phone labels and fine controls follow the active workspace');
 await a.page.locator('.workspace-nav a[href="/maths"]').click();await title(pa.page,'Spatial Maths');await pa.page.locator('[data-action="math-annotate"]').click();await pa.page.locator('#drawing-pad').waitFor({state:'visible'});
 const r=await pa.page.locator('#drawing-pad').boundingBox();await pa.page.mouse.move(r.x+r.width*.3,r.y+r.height*.4);await pa.page.mouse.down();await pa.page.mouse.move(r.x+r.width*.7,r.y+r.height*.6,{steps:12});await pa.page.mouse.up();await a.page.waitForFunction(()=>window.__mathsStudio.state.annotations.some(n=>n.finished&&n.points.length>1));
 const original=await a.page.evaluate(()=>window.__mathsStudio.state.annotations);
 await pa.page.reload();await title(pa.page,'Spatial Maths');await pa.page.locator('#start').waitFor();assert.equal(await pa.page.locator('#start').innerText(),'Start sensors');assert.deepEqual(await a.page.evaluate(()=>window.__mathsStudio.state.annotations),original);
 checks.push('Maths annotations travel through the hosted relay; phone reload reconnects without restarting sensors or duplicating ink');
 const duplicate=await pa.context.newPage();await duplicate.goto(base+'/phone');await duplicate.getByText('Reconnect here',{exact:true}).waitFor();
 assert.ok(await duplicate.evaluate(()=>localStorage.getItem('spatial-pairing-v1:phone')));
 await duplicate.close();await pa.page.reload();await title(pa.page,'Spatial Maths');
 checks.push('A duplicate controller tab preserves the original phone capability and offers explicit reconnect');
 await a.page.locator('#pair-phone').click();await a.page.locator('#end-pairing').click();await pa.page.locator('#pair-code').waitFor();await a.page.locator('#pair-close').click();
 await a.page.locator('.workspace-nav a[href="/cone"]').click();await a.page.locator('#camera-shortcut').click();await a.page.waitForFunction(()=>window.__sectionStudio?.hands.status==='running',null,{timeout:60000});
 checks.push('Disconnect returns the phone to code entry; local webcam still runs without a paired relay');
 assert.deepEqual(errors,[]);await mkdir('reports',{recursive:true});await writeFile('reports/hosted-phone-check.json',JSON.stringify({passed:true,url:base,checks,note:'Synthetic orientation/touch and camera; actual handset motion and perceived latency need physical confirmation.'},null,2));console.log(checks.join('\n'));
}finally{await browser.close();}
