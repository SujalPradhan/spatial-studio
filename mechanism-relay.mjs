import {WebSocketServer,WebSocket} from 'ws';
export function attachMechanismRelay(server,{token,port,onClaim,onRelease}){
 const wss=new WebSocketServer({noServer:true,maxPayload:65536});const clients=new Map();let owner=null,phone=null,epoch=0,state=null,acked=false;const lastSequence=new Map();
 const send=(ws,p)=>{if(ws?.readyState===WebSocket.OPEN&&ws.bufferedAmount<65536)ws.send(JSON.stringify({v:1,workspace:'mechanism',...p}));};
 const status=()=>{for(const [ws,role] of clients)send(ws,{type:'status',owner:ws===owner,phoneConnected:!!phone,epoch,role,claimed:!!owner});};
 const clear=()=>{owner=null;state=null;acked=false;epoch++;send(phone,{type:'released',epoch});onRelease();status();};
 server.on('upgrade',(req,socket,head)=>{
  const url=new URL(req.url,`http://localhost:${port}`);if(url.pathname!=='/mechanism-stream')return;
  if(url.searchParams.get('session')!==token||![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(req.headers.origin)){socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 wss.on('connection',(ws,req)=>{
  const role=new URL(req.url,`http://localhost:${port}`).searchParams.get('role');if(!['desktop','phone'].includes(role)||role==='phone'&&phone)return ws.close(1008,'Only one mechanism phone may connect.');
  clients.set(ws,role);if(role==='phone'){phone=ws;acked=false;if(state)send(phone,{...state,epoch});}status();
  ws.on('message',raw=>{
   let p;try{p=JSON.parse(raw.toString());}catch{return ws.close(1007,'Invalid JSON');}
   if(p.v!==1||p.workspace!=='mechanism')return send(ws,{type:'error',message:'Reconnect with the current controller version.'});
   if(!Number.isSafeInteger(p.seq)||p.seq<0||p.seq<=(lastSequence.get(ws)??-1))return;lastSequence.set(ws,p.seq);
   if(p.type==='ping')return send(ws,{type:'pong',t:p.t});
   if(role==='desktop'){
    if(p.type==='claim'){if(owner&&owner!==ws&&p.takeover!==true)return send(ws,{type:'error',message:'Another studio owns this phone. Use Take control to switch.'});if(owner!==ws){send(owner,{type:'lost',message:'Phone control moved to another studio.'});owner=ws;state=null;acked=false;epoch++;onClaim();}status();return;}
    if(ws!==owner)return;
    if(p.type==='release'){clear();return;}
    if(p.type==='state'){
     if(p.fixture==='folding-stand-v1'){
      if(p.selected!=='backrest'||!Number.isFinite(p.angle)||p.angle<0||p.angle>80||p.limit!==80||typeof p.enabled!=='boolean'||typeof p.frozen!=='boolean'||!Number.isSafeInteger(p.context)||p.context<0||!Number.isSafeInteger(p.revision))return;
      state={type:'state',fixture:p.fixture,selected:p.selected,angle:p.angle,limit:80,enabled:p.enabled,frozen:p.frozen,context:p.context,revision:p.revision,phase:'idle',duration:0,time:0};send(phone,{...state,epoch});return;
     }
     if(p.fixture!==undefined&&p.fixture!=='hinged-box-v1')return;
     if(!['lid','tray'].includes(p.selected)||!Number.isFinite(p.angle)||p.angle<0||p.angle>120||!Number.isFinite(p.lift)||p.lift<0||p.lift>160||!Number.isFinite(p.limit)||p.limit<0||p.limit>120||typeof p.enabled!=='boolean'||typeof p.frozen!=='boolean'||!Number.isSafeInteger(p.context)||!Number.isSafeInteger(p.revision)||!Number.isFinite(p.duration)||p.duration<0||p.duration>30000||!Number.isFinite(p.time)||p.time<0||p.time>30000||!['idle','countdown','recording','paused','review','playing'].includes(p.phase))return;
     state={type:'state',selected:p.selected,angle:p.angle,lift:p.lift,limit:p.limit,enabled:p.enabled,frozen:p.frozen,context:p.context,revision:p.revision,duration:p.duration,time:p.time,phase:p.phase};send(phone,{...state,epoch});return;
    }
    if(p.type==='cue'&&['contact','record','stop'].includes(p.cue)&&Number.isSafeInteger(p.id))send(phone,{type:'cue',cue:p.cue,id:p.id,epoch,at:Date.now()});
    return;
   }
   if(!owner||!state||p.epoch!==epoch)return;
   if(p.type==='ack'){acked=true;return;}
   if(!acked||p.context!==state.context)return;
   if(p.type==='frame'){
    if(typeof p.hold!=='boolean'||typeof p.active!=='boolean'||typeof p.visible!=='boolean'||!Number.isFinite(p.screenAngle)||typeof p.source!=='string'||p.source.length>120)return;
    if(p.hold&&(!Array.isArray(p.q)||p.q.length!==4||!p.q.every(Number.isFinite)||Math.abs(Math.hypot(...p.q)-1)>.1))return;
    send(owner,{type:'frame',q:p.q,hold:p.hold,active:p.active,visible:p.visible,screenAngle:p.screenAngle,source:p.source,invert:p.invert===true,epoch,context:p.context,at:Date.now()});
   }
   if(p.type==='action'){
    const stand=state.fixture==='folding-stand-v1';
    const actions=stand?['undo','freeze','resume','fine','fine-end','save-pose']:['select-lid','select-tray','record','stop','play','marker','undo','freeze','resume','fine','limit','scrub','fine-end'];
    if(!actions.includes(p.action))return;
    if(!state.enabled&&['select-lid','select-tray','fine','limit'].includes(p.action))return;
    const numeric=['fine','limit','scrub'].includes(p.action);if(numeric&&(!Number.isFinite(p.value)||p.value<0||p.value>(stand?80:p.action==='scrub'?30000:p.action==='limit'?120:160)))return;
    send(owner,{type:'action',action:p.action,...numeric?{value:p.value}:{},epoch,context:p.context});
   }
   if(p.type==='capability'&&typeof p.name==='string'&&p.name.length<80&&typeof p.value==='string'&&p.value.length<300)send(owner,{type:'capability',name:p.name,value:p.value});
  });
  ws.on('close',()=>{clients.delete(ws);lastSequence.delete(ws);if(phone===ws){phone=null;acked=false;send(owner,{type:'phone-lost'});}if(owner===ws)clear();else status();});
 });
 return {get active(){return !!owner;},close(){for(const ws of clients.keys())ws.close();wss.close();}};
}
