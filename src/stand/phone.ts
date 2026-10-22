import {getSession} from '../session';
import './style.css';
import {SensorHub} from '../sensors';
import {MechanismLink} from '../mechanism/link';
import {FIXTURE,MAX_ANGLE} from './model';
import type {Packet} from '../types';
const $=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
document.title='Folding stand — phone controller';
const session=await getSession();
if(new URLSearchParams(location.search).get('session')!==session.token){$('#app').textContent='This connection has expired. Run npm run phone:mechanism again.';throw Error('Expired pairing');}
$('#app').innerHTML=`<header class="topbar"><a class="brand" href="/mechanism">◫ MECHANISM STUDIO</a><span id="connection" class="connection-pill">Connecting</span></header><main class="stand-phone"><h1>Folding stand</h1><p id="phone-message" role="status">Open Mechanism Studio on the computer.</p><button id="sensor-start">Start sensors</button><output class="phone-angle" id="phone-angle">60.0°</output><button id="joint-pad" disabled><b>Hold to adjust the stand</b><span>Tilt forward or back · release to stop</span></button><label for="phone-fine">Fine angle <output id="fine-output">60.0°</output></label><input type="range" id="phone-fine" min="0" max="80" step=".1" value="60"><div class="fine-row"><input type="number" id="phone-number" min="0" max="80" step=".1" value="60" aria-label="Exact backrest angle"><button id="set-angle">Set angle</button></div><div class="phone-actions"><button data-angle="0">Fold flat</button><button data-angle="65">Reading · 65°</button></div><button id="save-pose">＋ Save this pose</button><div class="phone-actions"><button id="undo">Undo</button><button id="freeze">Freeze</button></div><details><summary>Rotation direction</summary><label class="stand-checkbox"><input type="checkbox" id="invert"> Invert phone tilt</label><p>Each hold starts from your current phone position.</p></details><p id="sensor-status">Sensors stopped.</p></main>`;
const hub=new SensorHub();let state:Packet|null=null,claimed=false,hold=false,fine=false,lastContext=-1,lastEpoch=-1,wake:{release():Promise<void>}|null=null;
const link=new MechanismLink('phone',session.token,receive);
function action(action:string,value?:number){if(!state||!claimed)return;link.send({type:'action',action,...value===undefined?{}:{value}});}
function release(){if(fine)action('fine-end');hold=false;fine=false;$('#joint-pad').classList.remove('holding');}
function receive(p:Packet){
 if(p.type==='status'){claimed=!!p.claimed;if(!claimed){release();state=null;}update();}
 if(p.type==='state'){if(p.context!==lastContext||p.epoch!==lastEpoch){release();lastContext=Number(p.context);lastEpoch=Number(p.epoch);}state=p;link.send({type:'ack'});update();}
 if(['released','disconnected'].includes(p.type)){release();state=null;claimed=false;update();}
}
async function startStop(){release();if(hub.active){hub.stop();await wake?.release();wake=null;}else try{await hub.start();try{const w=(navigator as unknown as {wakeLock?:{request(t:string):Promise<{release():Promise<void>}>}}).wakeLock;wake=await w?.request('screen')??null;}catch{}}catch(e){$('#sensor-status').textContent=String(e);}update();}
$('#sensor-start').onclick=startStop;
const pad=$('#joint-pad');pad.addEventListener('pointerdown',e=>{e.preventDefault();if(!state?.enabled||state.fixture!==FIXTURE||!hub.active||!hub.quaternion||fine)return;pad.setPointerCapture(e.pointerId);hold=true;pad.classList.add('holding');sendFrame();});
for(const event of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(event,()=>{release();sendFrame();});
$('#phone-fine').addEventListener('pointerdown',()=>{release();sendFrame();fine=true;});$('#phone-fine').oninput=()=>{hold=false;fine=true;action('fine',Number($<HTMLInputElement>('#phone-fine').value));};
for(const event of ['pointerup','pointercancel','change','blur','keyup'])$('#phone-fine').addEventListener(event,()=>{if(fine){action('fine-end');fine=false;}});
function exact(angle:number){if(!Number.isFinite(angle)||angle<0||angle>MAX_ANGLE)return;release();sendFrame();action('fine',angle);action('fine-end');}
$('#set-angle').onclick=()=>exact(Number($<HTMLInputElement>('#phone-number').value));
for(const b of document.querySelectorAll<HTMLElement>('[data-angle]'))b.onclick=()=>exact(Number(b.dataset.angle));
$('#invert').onchange=()=>{release();sendFrame();};
$('#save-pose').onclick=()=>{release();sendFrame();action('save-pose');};$('#undo').onclick=()=>{release();sendFrame();action('undo');};$('#freeze').onclick=()=>{release();sendFrame();action(state?.frozen?'resume':'freeze');};
function sendFrame(){if(!state||!claimed||state.fixture!==FIXTURE)return;link.send({type:'frame',q:hub.quaternion,hold,active:hub.active,visible:!document.hidden,invert:$<HTMLInputElement>('#invert').checked,screenAngle:screen.orientation?.angle??0,source:hub.orientationSource});}
function update(){
 const correct=state?.fixture===FIXTURE,enabled=!!state?.enabled&&correct&&!state?.frozen;
 $('#connection').textContent=claimed?'Studio connected':'Waiting for studio';$('#sensor-start').textContent=hub.active?'Stop sensors':'Start sensors';
 const angle=Number(correct?state?.angle??60:60).toFixed(1);$('#phone-angle').textContent=angle+'°';$('#fine-output').textContent=angle+'°';
 const slider=$<HTMLInputElement>('#phone-fine');slider.disabled=!enabled||hold;if(!fine)slider.value=angle;
 if(document.activeElement!==$('#phone-number'))$<HTMLInputElement>('#phone-number').value=angle;
 $<HTMLInputElement>('#phone-number').disabled=!enabled||hold;
 $<HTMLButtonElement>('#joint-pad').disabled=!enabled||!hub.active||!hub.quaternion||fine;
 for(const el of document.querySelectorAll<HTMLButtonElement>('[data-angle],#set-angle,#undo,#save-pose'))el.disabled=!enabled;
 $<HTMLButtonElement>('#freeze').disabled=!correct;$('#freeze').textContent=state?.frozen?'Resume':'Freeze';
 if(state&&!correct)$('#phone-message').innerHTML=`The box example is open. <a href="/mechanism/box/phone?session=${session.token}">Use its controller</a>.`;
 else $('#phone-message').textContent=!claimed||!state?'Open Mechanism Studio on the computer.':state.frozen?'Stand frozen.':hold?'Following your phone. Release to stop.':'Hold the pad and tilt to adjust the backrest.';
 $('#sensor-status').textContent=hub.active?`${hub.orientationSource} · ${hub.snapshot().find(r=>r.id==='relative')?.rate.toFixed(0)??'0'} Hz`:'Sensors stopped.';
}
setInterval(sendFrame,1000/60);setInterval(update,200);
document.addEventListener('visibilitychange',()=>{if(document.hidden){release();sendFrame();hub.stop();void wake?.release();wake=null;}update();});
window.addEventListener('pagehide',()=>{release();hub.stop();link.close();void wake?.release();});
update();
