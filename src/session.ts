import {takePairingInvite} from './pairing-link';
export const hosted = import.meta.env.MODE === 'hosted';
export const relayOrigin = (import.meta.env.VITE_RELAY_URL||(hosted?'https://spatial-studio-phone-relay.cbse-homework-worker.workers.dev':'')).replace(/\/$/,'');
export const webcamOnly = hosted&&!relayOrigin;
export interface Pairing {code:string;token:string;role:'desktop'|'phone';paired:boolean;joinExpiresAt:number;expiresAt:number}
export let pairing:Pairing|null=null;
export const pairingStatus={connected:false};
const phoneRoute=()=>location.pathname.includes('/phone');
window.addEventListener('hashchange',()=>{if(hosted&&phoneRoute()&&new URLSearchParams(location.hash.slice(1)).has('pair'))location.reload();});
const key=(role:string)=>'spatial-pairing-v1:'+role;
export function savePairing(value:Pairing){pairing=value;localStorage.setItem(key(value.role),JSON.stringify(value));}
export function clearPairing(expectedCode=pairing?.code){const role=pairing?.role??(phoneRoute()?'phone':'desktop');try{const stored=JSON.parse(localStorage.getItem(key(role))||'null');if(!expectedCode||stored?.code===expectedCode)localStorage.removeItem(key(role));}catch{localStorage.removeItem(key(role));}if(!expectedCode||pairing?.code===expectedCode)pairing=null;}
export async function pairingRequest(path:string,method='POST',token?:string):Promise<any>{
 const response=await fetch(relayOrigin+path,{method,headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(10000)});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Could not connect. Please try again.');return data;
}
export async function createPairing(){const value=await pairingRequest('/rooms');savePairing(value);return value as Pairing;}
export async function endPairing(){const previous=pairing;if(previous){await pairingRequest('/rooms/'+previous.code,'DELETE',previous.token);clearPairing(previous.code);}}
export function socketUrl(token:string,role:string,roomCode=pairing?.code){
 if(hosted&&roomCode&&relayOrigin){const url=new URL(relayOrigin);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/rooms/'+roomCode+'/stream';url.search=new URLSearchParams({token,role}).toString();return url.href;}
 return `${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/control-stream?session=${token}&role=${role}`;
}
export async function getSession(): Promise<{token:string;phoneUrl?:string}> {
  if(hosted){
   const role=phoneRoute()?'phone':'desktop';
   const invite=role==='phone'?takePairingInvite():{requested:false,code:null};
   try{const value=JSON.parse(localStorage.getItem(key(role))||'null');if(value?.role===role&&/^[A-HJ-NP-Z2-9]{8}$/.test(value.code)&&/^[a-f0-9]{64}$/.test(value.token)&&value.expiresAt>Date.now())pairing=value;else localStorage.removeItem(key(role));}catch{localStorage.removeItem(key(role));}
   if(role==='phone'&&!webcamOnly){
    if(invite.requested&&(!invite.code||invite.code!==pairing?.code))await enterCode(invite.code,invite.requested);
    else if(!pairing)await enterCode();
   }
   return {token:pairing?.token??''};
  }
  const response = await fetch('/api/session');
  if (!response.ok) throw Error('Could not connect to the local studio server.');
  return response.json();
}

async function enterCode(invitedCode:string|null=null,requested=false){
 await import('./phone.css');
 const app=document.querySelector('#app')!;
 app.innerHTML='<main class="controller pairing-entry"><header>3D STUDIO</header><h1>Connect your phone</h1><p>On the laptop, choose Connect phone. Enter its code below.</p><form id="pair-form"><label for="pair-code">Pairing code</label><input id="pair-code" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH" maxlength="12" required><button type="submit">Connect</button></form><p id="pair-error" role="status"></p><a href="/cone">Open the laptop workspace</a></main>';
 await new Promise<void>(resolve=>{
  const form=app.querySelector('form')!,input=app.querySelector('input')!,button=app.querySelector('button')!,message=app.querySelector('#pair-error')!;
  const join=async(code:string)=>{button.disabled=true;message.textContent='Connecting…';try{const next=await pairingRequest('/rooms/'+code+'/join');savePairing(next);resolve();}catch(e){message.textContent=e instanceof Error?e.message:'Connection failed. Scan a new QR code or try again.';button.disabled=false;form.hidden=false;}};
  form.onsubmit=event=>{event.preventDefault();const code=input.value.toUpperCase().replace(/[-\s]/g,'');if(!/^[A-HJ-NP-Z2-9]{8}$/.test(code)){message.textContent='Enter the eight-character code from the laptop.';return;}void join(code);};
  if(requested){app.querySelector('h1')!.textContent='Connecting to your laptop';app.querySelector('p')!.textContent='The QR code connects this phone automatically.';if(invitedCode){input.value=invitedCode;form.hidden=true;void join(invitedCode);}else{message.textContent='That connection link is invalid. Scan a new QR code on the laptop.';}}
 });
}
