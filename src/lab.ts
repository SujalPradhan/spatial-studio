import {getSession} from './session';
import './style.css';
import { SensorHub, testInstructions } from './sensors';
import { PlanePreview } from './plane';
import { Transport } from './transport';
import { HandProbe } from './hand-probe';
import type { Packet, Quat, SensorReading, TestResult } from './types';

const app=document.querySelector<HTMLDivElement>('#app')!;
const isPhone=location.pathname.startsWith('/phone');
const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const escape=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const fmt=(v:number|null|undefined,d=1)=>v==null||!Number.isFinite(v)?'—':v.toFixed(d);
const session=await getSession();
const supplied=new URLSearchParams(location.search).get('session');
if(isPhone&&supplied!==session.token){app.innerHTML='<main class="connection-error"><h1>Reconnect your phone</h1><p>This pairing link has expired. Run <code>npm run phone</code> on your Mac to open the current session.</p></main>';throw new Error('Expired phone pairing');}

const header=(phone=false)=>`<header class="topbar"><a class="brand" href="${phone?'#':'/'}"><span class="brand-mark">◫</span><span>SECTION<span class="brand-light">STUDIO</span></span></a><div class="top-right"><span class="phase">${phone?'PHONE CONTROLLER':'HARDWARE EXPLORATION · 01'}</span><span class="connection-pill" id="connection"><i></i>Connecting</span></div></header>`;
const sensorLabels:Record<string,string>={accel:'Accelerometer',gyro:'Gyroscope',linear:'Linear acceleration',gravity:'Gravity',relative:'Fused orientation',absolute:'Compass orientation',light:'Ambient light',magnetic:'Magnetic field',eventAccel:'Motion-event acceleration',eventGyro:'Motion-event gyro',eventLinear:'Motion-event linear acceleration',eventOrientation:'Orientation events'};
function download(name:string,data:unknown){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function setConnection(text:string,live:boolean){const el=$('#connection');el.innerHTML=`<i></i>${escape(text)}`;el.classList.toggle('live',live);}

if(isPhone)phone();else desktop();

function phone(){
  const hub=new SensorHub();let hold=false,depth=0,frozen=false,touchCount=0,maxTouches=0,controllerEnabled=true,depthActive=false;
  let wakeLock:{release():Promise<void>}|null=null;
  let lastSource='';let lastScreen=screen.orientation?.angle??0;
  const capabilities:Record<string,unknown>={};
  let previewStream:MediaStream|null=null,micStream:MediaStream|null=null,audio:AudioContext|null=null,analyser:AnalyserNode|null=null;
  let pendingTest:ReturnType<typeof setTimeout>|null=null;
  app.innerHTML=`${header(true)}<main class="phone-main">
    <div class="eyebrow">YOUR PHONE. A CUTTING PLANE.</div><h1>A plane in<br><em>your hands.</em></h1><p class="intro">Start sensors, hold the pad, and tilt gently. Each hold begins from your current pose.</p>
    <button class="button primary full" id="start">Start sensors <span>↗</span></button><p id="phone-status" class="status-text" role="status">Motion data stays on this USB connection.</p>
    <div class="phone-metrics"><div><span>ORIENTATION</span><strong id="phone-rate">— <small>Hz</small></strong></div><div><span>ROUND TRIP</span><strong id="phone-ping">— <small>ms</small></strong></div><div><span>LIVE STREAMS</span><strong id="phone-streams">0</strong></div></div>
    <section class="phone-card"><div class="card-label">PLANE CONTROL <span id="hold-state">Released</span></div><button id="clutch" class="clutch" disabled><span class="clutch-icon">◎</span><strong>Hold to tilt the plane</strong><small>Release to keep it still</small></button><label class="range-label" for="depth">Cut height / depth <output id="depth-value">0.00</output></label><input id="depth" type="range" min="-1.8" max="1.8" value="0" step="0.01"><div class="button-row"><button class="button" id="calibrate">Reset plane</button><button class="button" id="phone-undo">Undo</button><button class="button" id="freeze" aria-pressed="false">Freeze</button></div></section>
    <details class="phone-card"><summary>Sensor measurements</summary><div class="card-label">GUIDED MEASUREMENTS</div><p class="small">Use a steady support for repeatable results. Physical movement needs you.</p><div class="test-options">${Object.entries(testInstructions).map(([id,c])=>`<button class="test-option" data-test="${id}"><span>${c.title}</span><small>${c.duration}s <b>↗</b></small></button>`).join('')}</div><div id="test-progress" class="test-progress" hidden></div><div id="phone-result" role="status"></div><button class="button full" id="export">Export measurements</button></details>
    <details class="phone-card"><summary>Other hardware checks</summary><p class="small">These tests are optional and run only when opened. Browser access and physical hardware are different things.</p><div class="button-row"><button class="button" id="camera">Test rear camera</button><button class="button" id="mic">Test microphone</button></div><video id="camera-preview" playsinline muted hidden></video><meter id="mic-level" min="0" max="0.3" value="0" hidden></meter><p id="media-status" class="small" role="status"></p><div class="button-row"><button class="button" id="speaker">Play test tone</button><button class="button" id="vibrate">Request vibration</button></div><div class="touch-pad" id="touch-pad">Touch test · try several fingers<br><strong id="touch-result">0 contacts · maximum 0</strong></div><p id="capabilities" class="small"></p></details>
    <details class="phone-card"><summary>Live sensor readings</summary><div id="phone-sensors"></div></details>
    <footer>Checkpoint 0 · No cloud processing<br>Accelerometer values include gravity. Gyroscope values are angular velocity, not position.</footer>
  </main>`;
  const transport=new Transport('phone',session.token,p=>{
    if(p.type!=='controller-state')return;hold=false;depthActive=false;
    if(p.workspace&&p.workspace!=='lab'){location.replace('/phone?session='+session.token);return;}
    if(typeof p.enabled==='boolean')controllerEnabled=p.enabled;
    if(typeof p.frozen==='boolean'&&p.frozen!==frozen){frozen=p.frozen;hold=false;$('#freeze').textContent=frozen?'Resume':'Freeze';$('#freeze').setAttribute('aria-pressed',String(frozen));}
    if(typeof p.depth==='number'&&!depthActive){depth=p.depth;$<HTMLInputElement>('#depth').value=String(depth);$('#depth-value').textContent=depth.toFixed(2);}
    updateHold();
  },(connected,reason)=>{setConnection(connected?'Controller connected':reason??'Reconnecting',connected);if(!connected){hold=false;updateHold();}});
  const action=(name:string)=>transport.send({type:'action',action:name});
  function updateHold(){const el=$('#clutch');el.classList.toggle('holding',hold);$('#hold-state').textContent=frozen?'Frozen':hold?'Moving':'Released';}
  async function requestWake(){try{const w=(navigator as unknown as {wakeLock?:{request(type:string):Promise<{release():Promise<void>}>}}).wakeLock;if(w)wakeLock=await w.request('screen');}catch{/* Manual screen wake remains available. */}}
  $('#start').onclick=async()=>{
    if(hub.active){if(pendingTest){clearTimeout(pendingTest);pendingTest=null;$('#test-progress').hidden=true;}hub.stop();hold=false;updateHold();$('#start').textContent='Start sensors ↗';$('#phone-status').textContent='Stopped. Last readings remain available for inspection.';($<HTMLButtonElement>('#clutch')).disabled=true;await wakeLock?.release();wakeLock=null;return;}
    try{await hub.start();await requestWake();$('#start').textContent='Stop sensors';$('#phone-status').textContent='Listening for real sensor data…';}catch(e){$('#phone-status').textContent=String(e);}
  };
  const pad=$('#clutch');
  pad.addEventListener('pointerdown',e=>{e.preventDefault();if(!hub.active||!hub.quaternion||frozen||!controllerEnabled)return;pad.setPointerCapture(e.pointerId);hold=true;updateHold();});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(event,()=>{hold=false;updateHold();});
  for(const type of ['pointerdown','keydown'])$('#depth').addEventListener(type,()=>{depthActive=true;});
  for(const type of ['pointerup','pointercancel','change','blur','keyup'])$('#depth').addEventListener(type,()=>{depthActive=false;});
  $('#phone-undo').onclick=()=>{hold=false;updateHold();action('undo');};
  $<HTMLInputElement>('#depth').oninput=e=>{if(frozen||!controllerEnabled)return;depth=Number((e.target as HTMLInputElement).value);$('#depth-value').textContent=depth.toFixed(2);};
  $('#calibrate').onclick=()=>{hold=false;depth=0;$<HTMLInputElement>('#depth').value='0';$('#depth-value').textContent='0.00';updateHold();action('reset');};
  $('#freeze').onclick=()=>{frozen=!frozen;hold=false;updateHold();$('#freeze').textContent=frozen?'Resume':'Freeze';$('#freeze').setAttribute('aria-pressed',String(frozen));action(frozen?'freeze':'resume');};
  for(const el of document.querySelectorAll<HTMLButtonElement>('[data-test]'))el.onclick=()=>{
    if(!hub.active){$('#phone-result').textContent='Start sensors first.';return;}
    if(hub.progress||pendingTest){$('#phone-result').textContent='Finish the current measurement first.';return;}
    const kind=el.dataset.test!;$('#phone-result').textContent=testInstructions[kind].instruction;$('#test-progress').hidden=false;$('#test-progress').textContent='Starts in 3 seconds…';
    pendingTest=setTimeout(()=>{pendingTest=null;if(hub.active){hub.beginTest(kind);transport.send({type:'test',stage:'started',kind});}},3000);
  };
  hub.onTest=result=>{
    $('#test-progress').hidden=true;$('#phone-result').innerHTML=`<div class="result-note"><strong>${result.interrupted?'Interrupted':'Measurement complete'}</strong><p>${result.interpretation.map(escape).join('</p><p>')}</p></div>`;
    const summary={...result,sensors:Object.fromEntries(Object.entries(result.sensors).map(([id,s])=>[id,{...s,samples:[]}]))};
    transport.send({type:'test',stage:'finished',result:summary});
  };
  $('#export').onclick=()=>download('section-studio-phone-measurements.json',{schema:1,created:new Date().toISOString(),device:navigator.userAgent,secureContext:isSecureContext,readings:hub.snapshot(),results:hub.results,capabilities,rawSamplesIncluded:true,notes:'Browser-delivered samples. Not unfiltered sensor HAL data. Rates use browser callback arrival times.'});
  function capability(name:string,value:unknown){capabilities[name]=value;transport.send({type:'capability',name,value});$('#capabilities').textContent=Object.entries(capabilities).map(([k,v])=>`${k}: ${typeof v==='string'?v:JSON.stringify(v)}`).join(' · ');}
  $('#camera').onclick=async()=>{
    if(previewStream){previewStream.getTracks().forEach(t=>t.stop());previewStream=null;$<HTMLVideoElement>('#camera-preview').hidden=true;$('#camera').textContent='Test rear camera';return;}
    try{previewStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});const v=$<HTMLVideoElement>('#camera-preview');v.srcObject=previewStream;v.hidden=false;await v.play();const s=previewStream.getVideoTracks()[0].getSettings();capability('camera',{status:'Live preview opened',width:s.width,height:s.height,frameRate:s.frameRate});$('#camera').textContent='Stop camera';$('#media-status').textContent='Live camera preview. Nothing is recorded or sent to the Mac.';}catch(e){capability('camera',String(e));}
  };
  $('#mic').onclick=async()=>{
    if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null;await audio?.close();audio=null;analyser=null;$('#mic').textContent='Test microphone';$('#mic-level').hidden=true;return;}
    try{micStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});audio=new AudioContext();await audio.resume();analyser=audio.createAnalyser();analyser.fftSize=512;audio.createMediaStreamSource(micStream).connect(analyser);$('#mic-level').hidden=false;$('#mic').textContent='Stop microphone';$('#media-status').textContent='Speak or tap lightly near the microphone. The meter measures signal level; no audio is recorded or transmitted.';capability('microphone','Input opened; signal meter active');}catch(e){capability('microphone',String(e));}
  };
  $('#speaker').onclick=async()=>{const ctx=new AudioContext();await ctx.resume();const osc=ctx.createOscillator();const gain=ctx.createGain();osc.frequency.value=440;gain.gain.setValueAtTime(.05,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.25);osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.3);osc.onended=()=>void ctx.close();capability('speaker','Test tone requested; confirm audibility yourself');};
  $('#vibrate').onclick=()=>capability('vibration',navigator.vibrate?.(30)?'Request accepted; feeling the pulse is not verified':'Unavailable or rejected by browser');
  const contacts=new Set<number>();const touchPad=$('#touch-pad');
  touchPad.addEventListener('pointerdown',e=>{e.preventDefault();touchPad.setPointerCapture(e.pointerId);contacts.add(e.pointerId);touchCount=contacts.size;maxTouches=Math.max(maxTouches,touchCount);$('#touch-result').textContent=`${touchCount} contacts · maximum ${maxTouches}`;capability('touch',`${maxTouches} simultaneous contacts observed`);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])touchPad.addEventListener(type,e=>{contacts.delete((e as PointerEvent).pointerId);touchCount=contacts.size;$('#touch-result').textContent=`${touchCount} contacts · maximum ${maxTouches}`;});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){hold=false;depthActive=false;updateHold();if(pendingTest){clearTimeout(pendingTest);pendingTest=null;}hub.stop();previewStream?.getTracks().forEach(t=>t.stop());micStream?.getTracks().forEach(t=>t.stop());previewStream=micStream=null;void audio?.close();audio=null;analyser=null;transport.send({type:'heartbeat',visible:false,active:false,hold:false});$('#start').textContent='Resume sensors';$('#phone-status').textContent='Paused while hidden. Tap Resume sensors when ready.';}
  });
  setInterval(()=>{
    const orientationScreen=screen.orientation?.angle??0;
    if(orientationScreen!==lastScreen||hub.orientationSource!==lastSource){hold=false;updateHold();lastScreen=orientationScreen;lastSource=hub.orientationSource;}
    transport.send({type:'frame',q:hub.quaternion,hold,depth,frozen,active:hub.active,visible:!document.hidden,screenAngle:orientationScreen,source:hub.orientationSource,depthActive,orientationAge:hub.snapshot().find(r=>r.id===(hub.orientationSource==='RelativeOrientationSensor'?'relative':'eventOrientation'))?.age});
  },1000/60);
  setInterval(()=>{
    const readings=hub.snapshot();
    const rel=readings.find(s=>s.id===(hub.orientationSource==='RelativeOrientationSensor'?'relative':'eventOrientation'));
    $('#phone-rate').innerHTML=`${fmt(rel?.rate,0)} <small>Hz</small>`;$('#phone-ping').innerHTML=`${fmt(transport.rtt)} <small>ms</small>`;$('#phone-streams').textContent=String(readings.filter(r=>r.status==='live').length);
    $<HTMLButtonElement>('#clutch').disabled=!hub.active||!hub.quaternion||!controllerEnabled||frozen;
    $<HTMLInputElement>('#depth').disabled=frozen||!controllerEnabled;
    $<HTMLButtonElement>('#calibrate').disabled=frozen||!controllerEnabled;
    $<HTMLButtonElement>('#phone-undo').disabled=!controllerEnabled;
    $<HTMLButtonElement>('#freeze').disabled=!controllerEnabled;
    if(hub.active)$('#phone-status').textContent=!controllerEnabled?'Choose Phone + mouse or Phone + webcam on your Mac.':hub.quaternion?`Receiving ${hub.orientationSource}. Hold the pad to move the plane.`:'No orientation readings yet. Check browser sensor permissions.';
    const progress=hub.progress;if(progress){$('#test-progress').hidden=false;$('#test-progress').textContent=`${testInstructions[progress.kind].title} · ${Math.ceil(progress.remaining)}s remaining`;}
    $('#phone-sensors').innerHTML=readings.map(r=>`<div class="sensor-row"><strong>${escape(r.label)}</strong><span>${r.status==='live'?`${fmt(r.rate,0)} Hz · ${r.values?.map(v=>fmt(v,2)).join(', ')}`:escape(r.reason??r.status)}</span></div>`).join('');
    transport.send({type:'telemetry',readings,source:hub.orientationSource,active:hub.active,visible:!document.hidden,secureContext:isSecureContext,rtt:transport.rtt,device:navigator.userAgent,progress:hub.progress});
    transport.send({type:'heartbeat',visible:!document.hidden,active:hub.active,hold});
    if(analyser){const b=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(b);$<HTMLMeterElement>('#mic-level').value=Math.sqrt(b.reduce((s,v)=>s+v*v,0)/b.length);}
  },250);
  setInterval(()=>transport.ping(),1000);
  (window as unknown as Record<string,unknown>).__sensorHub=hub;
}

function desktop(){
  let connected=false,lastFrame=0,phoneActive=false,readings:SensorReading[]=[],selected='accel';
  let orientationSource='None';let latest:Packet|null=null;let currentTest:string|null=null;let lastPhoneDepth:number|null=null;
  const traces=new Map<string,number[][]>();const results:TestResult[]=[];const capabilities:Record<string,unknown>={};
  app.innerHTML=`${header()}<main class="desktop-main"><section class="intro-row"><div><div class="eyebrow"><span class="tiny-line"></span> PHONE × WEBCAM × SPACE</div><h1>Your phone,<br><em>measured.</em></h1><p class="intro">Explore the hardware before trusting the gesture.<br>Real readings. Deliberate movements. A plane you can feel.</p></div><div class="session-card"><div class="card-label">THIS SESSION <span class="local-tag">LOCAL</span></div><div class="session-metric"><strong id="live-count">0</strong><span>sensor streams<br>delivering data</span></div><div class="session-bottom"><span>USB round trip <b id="rtt">—</b></span><span>Controller <b id="controller-state">Waiting</b></span></div></div></section>
  <div class="section-heading"><div><span class="section-number">01</span><h2>Make the connection</h2></div><span id="device-name">POCO X5 Pro 5G · Android 14</span></div>
  <section class="lab-grid"><div class="visual-panel"><div class="panel-top"><div><span class="live-dot"></span><span id="plane-label">Plane preview</span></div><span class="mono" id="plane-source">MOUSE / TOUCH</span></div><div id="plane"></div><div class="plane-caption"><span class="axis-dot"></span><p id="plane-caption">Connect the phone, start sensors, then hold its tilt pad.<br>The amber polygon is the actual plane–cube intersection.</p><button class="icon-button" id="reset-plane" title="Reset plane" aria-label="Reset plane">↺</button></div><details class="manual"><summary>Try the plane with sliders</summary><div class="manual-sliders"><label>Tilt<input id="manual-x" type="range" min="-1.5" max="1.5" value="0" step=".01"></label><label>Roll<input id="manual-z" type="range" min="-1.5" max="1.5" value="0" step=".01"></label><label>Depth<input id="manual-d" type="range" min="-1.5" max="1.5" value="0" step=".01"></label></div></details></div>
  <div class="sensor-panel"><div class="panel-top"><span>LIVE SENSOR READINGS</span><span class="mono">60 Hz requested</span></div><div class="sensor-grid" id="sensor-grid">${['accel','gyro','linear','gravity','relative','absolute'].map(id=>sensorCard(id)).join('')}</div><p class="sensor-note">Measured delivery rates, not hardware specifications.<br>Acceleration includes gravity; linear acceleration removes it.</p></div></section>
  <section class="trace-panel"><div class="trace-header"><div><div class="card-label">SIGNAL DETAIL</div><h3 id="trace-title">Accelerometer</h3></div><div class="trace-legend"><span><i class="x"></i>X</span><span><i class="y"></i>Y</span><span><i class="z"></i>Z</span></div><div class="trace-stat"><span>CALLBACK GAP · P95</span><b id="trace-gap">—</b></div><div class="trace-stat"><span>SOURCE</span><b id="trace-source">Waiting for phone</b></div></div><canvas id="trace"></canvas><div class="trace-footer"><span id="trace-unit">m/s²</span><span>Recent values · 4 Hz preview · full samples retained in phone tests</span></div></section>
  <div class="section-heading"><div><span class="section-number">02</span><h2>Put the sensors to the test</h2></div><span>Run these on your phone</span></div><section class="test-grid">${Object.entries(testInstructions).map(([id,t],i)=>`<article class="test-card"><div class="test-index">0${i+1}<span>${t.duration} SEC</span></div><h3>${t.title}</h3><p>${t.instruction}</p><div class="test-state" id="test-${id}">○ Awaiting a physical test</div></article>`).join('')}</section>
  <div class="section-heading"><div><span class="section-number">03</span><h2>Capability notebook</h2></div><button class="button" id="export-desktop">Export session ↗</button></div><section class="notebook"><div class="notebook-row"><strong>Browser access ≠ missing hardware</strong><p id="extra-status">Ambient light and magnetic-field access will be checked when phone sensors start. Unavailable web APIs do not mean those sensors are absent.</p></div><div class="notebook-row"><strong>Touch, camera, microphone & feedback</strong><p id="capability-status">Optional checks are in “Other hardware checks” on the phone. Media stays on the phone; no recordings are made.</p></div><div class="notebook-row"><strong>Computer webcam</strong><div><p>Check camera capture, then show a hand to test local landmark detection. Gesture controls come later.</p><button class="button" id="webcam">Test webcam</button><button class="button" id="hand-check" disabled>Check hand tracking</button><div class="webcam-stage"><video id="webcam-preview" playsinline muted hidden></video><canvas id="hand-overlay"></canvas></div><p id="webcam-status" role="status"></p><p id="hand-status" role="status"></p></div></div><div class="notebook-row"><strong>What this verifies</strong><p>Signal availability, delivered rate and relative stability. Absolute accuracy, touch comfort and gesture usefulness still need physical tests. No AI interpretation is used here.</p></div></section><div id="result-list"></div><footer><span>SECTION STUDIO / HARDWARE LAB</span><span>Built for observation, before assumption.</span></footer></main>`;
  let preview:PlanePreview|null=null;
  try{preview=new PlanePreview($('#plane'));}catch(e){$('#plane').innerHTML=`<p class="render-error">3D preview unavailable: ${escape(e)}. Sensor diagnostics remain usable.</p>`;}
  const transport=new Transport('desktop',session.token,receive,live=>{if(!live)setConnection('Server disconnected',false);});
  function receive(p:Packet){
    if(p.type==='connection'){connected=Boolean(p.connected);setConnection(connected?'Phone connected':'Waiting for phone',connected);if(!connected){preview?.release();phoneActive=false;$('#controller-state').textContent='Disconnected';$('#live-count').textContent='0';for(const r of readings){if(r.status==='live')r.status='paused';const el=document.querySelector<HTMLElement>(`[data-sensor="${r.id}"]`);if(el)updateCard(el,r);}if(currentTest){$(`#test-${currentTest}`).textContent='◌ Connection lost — result unconfirmed';currentTest=null;}}}
    if(p.type==='frame'){
      lastFrame=performance.now();phoneActive=Boolean(p.active&&p.visible);
      const q=p.q as Quat|null;const d=Number(p.depth)||0;const depthChange=d!==lastPhoneDepth?d:null;lastPhoneDepth=d;
      if(preview){preview.frozen=Boolean(p.frozen);if(phoneActive)preview.frame(q,Boolean(p.hold),depthChange);else preview.release();}
      $('#plane-label').textContent=p.frozen?'Plane frozen':p.hold?'Following your phone':'Plane preview';
      $('#plane-source').textContent=p.hold?'PHONE ORIENTATION':'HOLD TO MOVE';
    }
    if(p.type==='telemetry'){
      latest=p;readings=p.readings as SensorReading[];orientationSource=String(p.source);phoneActive=Boolean(p.active&&p.visible);
      $('#live-count').textContent=String(readings.filter(r=>r.status==='live').length);
      $('#rtt').textContent=typeof p.rtt==='number'?`${fmt(p.rtt)} ms`:'—';
      $('#controller-state').textContent=phoneActive?'Active':'Paused';
      for(const r of readings){const el=document.querySelector<HTMLElement>(`[data-sensor="${r.id}"]`);if(el)updateCard(el,r);if(r.values&&r.status==='live'){const trace=traces.get(r.id)??[];trace.push(r.values);if(trace.length>120)trace.shift();traces.set(r.id,trace);}}
      $('#extra-status').textContent=readings.filter(r=>r.id==='light'||r.id==='magnetic').map(r=>`${r.label}: ${r.status==='live'?'live readings':r.reason??r.status}`).join(' ');
      currentTest=(p.progress as {kind:string}|null)?.kind??null;
      if(currentTest)$(`#test-${currentTest}`).textContent=`● Measuring · ${Math.ceil((p.progress as {remaining:number}).remaining)}s remaining`;
    }
    if(p.type==='test'&&p.stage==='finished'){
      const result=p.result as TestResult;results.push(result);$(`#test-${result.kind}`).textContent=result.interrupted?'◌ Interrupted':'● Measured — inspect results';
      $('#result-list').insertAdjacentHTML('afterbegin',`<article class="result-card"><div class="eyebrow">MEASUREMENT ${result.interrupted?'INTERRUPTED':'COMPLETE'}</div><h3>${escape(testInstructions[result.kind]?.title??result.kind)}</h3>${result.interpretation.map(t=>`<p>${escape(t)}</p>`).join('')}<p class="small">${fmt(result.duration)}s · ${Object.values(result.sensors).reduce((s,r)=>s+r.count,0)} samples across ${Object.keys(result.sensors).length} streams. Full sample export is available on the phone.</p></article>`);
    }
    if(p.type==='action'){if(p.action==='reset')preview?.reset();if(preview&&p.action==='freeze')preview.frozen=true;if(preview&&p.action==='resume')preview.frozen=false;}
    if(p.type==='capability'){capabilities[String(p.name)]=p.value;$('#capability-status').textContent=Object.entries(capabilities).map(([k,v])=>`${k}: ${typeof v==='string'?v:JSON.stringify(v)}`).join(' · ');}
  }
  for(const el of document.querySelectorAll<HTMLButtonElement>('[data-sensor]'))el.onclick=()=>{selected=el.dataset.sensor!;document.querySelectorAll('[data-sensor]').forEach(e=>e.classList.toggle('selected',(e as HTMLElement).dataset.sensor===selected));};
  for(const input of document.querySelectorAll<HTMLInputElement>('.manual input'))input.oninput=()=>preview?.setManual(Number($<HTMLInputElement>('#manual-x').value),Number($<HTMLInputElement>('#manual-z').value),Number($<HTMLInputElement>('#manual-d').value));
  $('#reset-plane').onclick=()=>preview?.reset();
  $('#export-desktop').onclick=()=>download('section-studio-session.json',{schema:1,created:new Date().toISOString(),latest,results,capabilities,orientationSource,rawSamplesIncluded:false,notes:'Desktop receives live summaries. Export on the phone for full recorded samples. Delivery rates and RTT do not measure absolute sensor accuracy or motion-to-photon delay.'});
  let webcam:MediaStream|null=null;let handProbe:HandProbe|null=null;
  function stopHands(){handProbe?.stop();handProbe=null;$('#hand-check').textContent='Check hand tracking';if(capabilities.handTracking)capabilities.handTracking={...capabilities.handTracking as Record<string,unknown>,status:'stopped'};}
  $('#hand-check').onclick=()=>{
    if(handProbe){stopHands();$('#hand-status').textContent='Hand check stopped.';return;}
    if(!webcam)return;
    $('#hand-status').textContent='Loading the local hand model…';$('#hand-check').textContent='Stop hand check';
    handProbe=new HandProbe($<HTMLVideoElement>('#webcam-preview'),$<HTMLCanvasElement>('#hand-overlay'),(data,message)=>{capabilities.handTracking=data;$('#hand-status').textContent=message;if(data.status==='error'){handProbe=null;$('#hand-check').textContent='Check hand tracking';}});
    handProbe.start();
  };
  $('#webcam').onclick=async()=>{
    if(webcam){stopHands();webcam.getTracks().forEach(t=>t.stop());webcam=null;$<HTMLButtonElement>('#hand-check').disabled=true;$('#hand-status').textContent='';$('#webcam-preview').hidden=true;$('#webcam').textContent='Test webcam';$('#webcam-status').textContent='Camera stopped.';return;}
    try{webcam=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720}},audio:false});const v=$<HTMLVideoElement>('#webcam-preview');v.srcObject=webcam;v.hidden=false;await v.play();$('#webcam').textContent='Stop webcam';const s=webcam.getVideoTracks()[0].getSettings();$('#webcam-status').textContent=`Live ${s.width} × ${s.height} preview. No recording or transmission.`;capabilities.webcam={width:s.width,height:s.height,frameRate:s.frameRate};$<HTMLButtonElement>('#hand-check').disabled=false;}catch(e){$('#webcam-status').textContent=`Camera access: ${String(e)}`;}
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&webcam)$('#webcam').click();});
  setInterval(()=>{
    if(performance.now()-lastFrame>400){preview?.release();if(connected&&phoneActive){$('#controller-state').textContent='No recent frames';$('#live-count').textContent='0';$('#plane-label').textContent='Plane paused';$('#plane-source').textContent='WAITING FOR DATA';}}
  },50);
  setInterval(()=>{
    const r=readings.find(r=>r.id===selected);$('#trace-title').textContent=r?.label??sensorLabels[selected];$('#trace-gap').textContent=r?.gapP95!=null?`${fmt(r.gapP95)} ms`:'—';$('#trace-source').textContent=r?.source??'Waiting for phone';$('#trace-unit').textContent=r?.unit??'m/s²';
    drawTrace($<HTMLCanvasElement>('#trace'),traces.get(selected)??[]);
  },250);
  setInterval(()=>transport.ping(),1000);
  (window as unknown as Record<string,unknown>).__studio={get readings(){return readings;},get results(){return results;},get connected(){return connected;},get plane(){return preview?.diagnostic;},get capabilities(){return capabilities;}};
}

function sensorCard(id:string){return `<button class="sensor-card ${id==='accel'?'selected':''}" data-sensor="${id}"><div class="sensor-card-top"><span>${sensorLabels[id]}</span><i></i></div><div class="sensor-value">— <small>Hz</small></div><div class="sensor-axes">Waiting for readings</div><div class="sensor-status">Not tested</div></button>`;}
function updateCard(el:HTMLElement,r:SensorReading){
  el.classList.toggle('streaming',r.status==='live');el.querySelector('.sensor-value')!.innerHTML=`${r.status==='live'?fmt(r.rate,0):'—'} <small>Hz</small>`;
  el.querySelector('.sensor-axes')!.textContent=r.values?r.values.slice(0,3).map((v,i)=>`${['X','Y','Z'][i]} ${fmt(v,2)}`).join('  '):'No samples received';
  el.querySelector('.sensor-status')!.textContent=r.status==='live'?`${r.count.toLocaleString()} samples · ${r.unit}`:r.status==='unavailable'?'Not exposed by browser':r.status==='error'?'Access error':r.status;
  el.title=r.reason??`${r.source} · ${r.unit}`;
}
function drawTrace(canvas:HTMLCanvasElement,values:number[][]){
  const ratio=devicePixelRatio||1;const w=canvas.clientWidth,h=canvas.clientHeight;
  if(canvas.width!==w*ratio||canvas.height!==h*ratio){canvas.width=w*ratio;canvas.height=h*ratio;}
  const c=canvas.getContext('2d')!;c.setTransform(ratio,0,0,ratio,0,0);c.clearRect(0,0,w,h);
  c.strokeStyle='#e5e9e2';c.lineWidth=1;for(let i=1;i<5;i++){c.beginPath();c.moveTo(0,h*i/5);c.lineTo(w,h*i/5);c.stroke();}
  if(!values.length){c.fillStyle='#89968c';c.font='13px system-ui';c.fillText('A live signal will appear here when the phone starts streaming.',16,h/2);return;}
  const max=Math.max(.1,...values.flat().map(Math.abs))*1.1;const colors=['#278979','#c58b41','#718fbc'];
  for(let axis=0;axis<3;axis++){c.strokeStyle=colors[axis];c.lineWidth=1.8;c.beginPath();values.forEach((v,i)=>{const x=w*i/119,y=h/2-(v[axis]??0)/max*h*.43;i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();}
}
