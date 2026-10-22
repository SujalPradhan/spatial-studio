import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {WebSocket} from 'ws';
// @ts-ignore Node relay source is deliberately plain JavaScript.
import {attachControlRelay} from '../control-relay.mjs';
test('coordinator fences inactive clients, stale epochs, held input before ack and duplicate packets',async()=>{
 const server=http.createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port,origin='http://localhost:'+port;const relay=attachControlRelay(server,{token:'test',port});const sockets:WebSocket[]=[];
 async function connect(role:string){const ws=new WebSocket(`ws://127.0.0.1:${port}/control-stream?session=test&role=${role}`,{headers:{Origin:origin}});const messages:any[]=[];ws.on('message',raw=>messages.push(JSON.parse(raw.toString())));await new Promise<void>((r,j)=>{ws.once('open',r);ws.once('error',j);});sockets.push(ws);let seq=0;return {ws,messages,send:(p:any)=>ws.send(JSON.stringify({v:2,seq:seq++,...p}))};}
 const wait=async(f:()=>boolean)=>{for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out');};
 try{const d=await connect('desktop'),phone=await connect('phone');const state={context:0,enabled:true,frozen:false,solid:'cone',depth:0};d.send({type:'activate',workspace:'shapes',documentId:'shapes',state,focused:true,visible:true});await wait(()=>phone.messages.some(p=>p.type==='state'));const epoch=relay.status.epoch;
 phone.send({type:'action',epoch,context:0,action:'undo'});await new Promise(r=>setTimeout(r,20));assert.equal(d.messages.filter(p=>p.type==='action').length,0);
 phone.send({type:'ack',epoch,context:0,documentId:'shapes'});phone.send({type:'action',epoch,context:0,action:'undo'});await wait(()=>d.messages.some(p=>p.type==='action'));
 const second=await connect('desktop');second.send({type:'activate',workspace:'art',documentId:'art:a',state:{context:3,enabled:true,frozen:false,kind:'stable',color:'#abcdef',width:.02,frame:{q:[0,0,0,1],origin:[0,0,0]}},focused:true,visible:true});await wait(()=>relay.status.workspace==='art');const next=relay.status.epoch;d.send({type:'release',epoch});await new Promise(r=>setTimeout(r,20));assert.equal(relay.status.workspace,'art');
 phone.send({type:'ack',epoch:next,context:3,documentId:'art:a'});phone.send({type:'action',epoch,context:0,action:'undo'});phone.send({type:'action',epoch:next,context:3,action:'color',value:0xabcdef});await wait(()=>second.messages.some(p=>p.type==='action'));assert.deepEqual(second.messages.filter(p=>p.type==='action').map(p=>p.action),['color']);
 second.send({type:'release',epoch:next});await wait(()=>relay.status.workspace===null);
 const malformed=await connect('desktop');const closed=new Promise<void>(resolve=>malformed.ws.once('close',()=>resolve()));malformed.ws.send('null');await closed;
 // Rejecting a valid-JSON non-object must leave the coordinator serving other peers.
 d.send({type:'ping',t:123});await wait(()=>d.messages.some(p=>p.type==='pong'&&p.t===123));
 }finally{for(const s of sockets)s.terminate();relay.close();await new Promise<void>(r=>server.close(()=>r()));}
});
