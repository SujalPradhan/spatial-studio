import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
const base=process.env.RELAY_URL||'http://127.0.0.1:8788',origin=process.env.STUDIO_URL||'http://localhost:4175';
async function api(path,method='POST',token){const r=await fetch(base+path,{method,headers:{Origin:origin,...token?{Authorization:'Bearer '+token}:{}}});return {status:r.status,data:await r.json()};}
const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out');};
const sockets=[];
async function connect(room,role,token){const ws=new WebSocket(base.replace(/^http/,'ws')+'/rooms/'+room+'/stream?'+new URLSearchParams({role,token}),{headers:{Origin:origin}});sockets.push(ws);const messages=[];let closed=null,seq=0;ws.on('message',m=>messages.push(JSON.parse(String(m))));ws.on('close',(code)=>closed=code);await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return {ws,messages,get closed(){return closed;},send:p=>ws.send(JSON.stringify({v:2,seq:seq++,...p}))};}
try{
 assert.equal((await fetch(base+'/rooms',{method:'POST',headers:{Origin:'https://wrong.example'}})).status,403);
 const a=(await api('/rooms')).data,b=(await api('/rooms')).data;assert.notEqual(a.code,b.code);assert.notEqual(a.token,b.token);
 const p=(await api('/rooms/'+a.code+'/join')).data;assert.notEqual(p.token,a.token);assert.ok(!('host' in p));assert.equal((await api('/rooms/'+a.code+'/join')).status,409);
 assert.equal((await api('/rooms/ABCDEFGH/join')).status,410);assert.equal((await api('/rooms/'+a.code,'GET','wrong')).status,403);
 const d=await connect(a.code,'desktop',a.token),d2=await connect(b.code,'desktop',b.token),phone=await connect(a.code,'phone',p.token);
 d.send({type:'activate',workspace:'shapes',documentId:'shapes',focused:true,visible:true,state:{enabled:true,frozen:false,solid:'cone',depth:0,context:0}});
 await wait(()=>phone.messages.some(m=>m.type==='state'));const epoch=phone.messages.findLast(m=>m.type==='state').epoch;
 phone.send({type:'ack',epoch,context:0,documentId:'shapes'});phone.send({type:'frame',epoch,context:0,hold:true,active:true,visible:true,screenAngle:0,source:'test',q:[0,0,0,1],at:Date.now()-2000});
 await new Promise(r=>setTimeout(r,60));assert.equal(d.messages.filter(m=>m.type==='frame').length,0);
 phone.send({type:'frame',epoch,context:0,hold:true,active:true,visible:true,screenAngle:0,source:'test',q:[0,0,0,1],at:Date.now()});await wait(()=>d.messages.some(m=>m.type==='frame'));
 assert.equal(d2.messages.filter(m=>m.type==='frame').length,0);
 const duplicate=await connect(a.code,'phone',p.token);await wait(()=>duplicate.closed!==null);assert.equal(duplicate.closed,4009);
 phone.send({type:'action',epoch,context:0,action:'fine',value:55,at:Date.now()-2000});await new Promise(r=>setTimeout(r,60));assert.equal(d.messages.filter(m=>m.type==='action').length,0);
 phone.send({type:'action',epoch,context:0,action:'undo',at:Date.now()});await wait(()=>d.messages.some(m=>m.type==='action'));
 const invalid=await connect(a.code,'desktop',p.token);await wait(()=>invalid.closed!==null);assert.equal(invalid.closed,4001);
 assert.equal((await api('/rooms/'+a.code,'DELETE',p.token)).status,403);assert.equal((await api('/rooms/'+a.code,'DELETE',a.token)).status,200);await wait(()=>phone.closed!==null);assert.equal(phone.closed,4001);
 await api('/rooms/'+b.code,'DELETE',b.token);
 console.log('Relay protocol passed: origins, private role tokens, single-use codes, room isolation, stale held-frame rejection, duplicate sockets, revocation.');
}finally{for(const ws of sockets)ws.terminate();}
