import {WebSocketServer} from 'ws';
import {createControlRoom} from './control-room.mjs';
export function attachControlRelay(server,{token,port}){
 const wss=new WebSocketServer({noServer:true,maxPayload:128*1024}),room=createControlRoom();
 server.on('upgrade',(req,socket,head)=>{
  const url=new URL(req.url,`http://localhost:${port}`);
  if(url.pathname!=='/control-stream')return;
  if(url.searchParams.get('session')!==token||![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(req.headers.origin)){socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>room.connect(ws,url.searchParams.get('role')));
 });
 return {get status(){return room.status;},close(){room.close();wss.close();}};
}
