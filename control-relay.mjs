import {WebSocketServer,WebSocket} from 'ws';
const workspaces=new Set(['shapes','stand','box','art','lab','maths']);
const finiteQ=q=>Array.isArray(q)&&q.length===4&&q.every(Number.isFinite)&&Math.abs(Math.hypot(...q)-1)<.1;
const between=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b;
function descriptor(workspace,state){
 if(!state||typeof state.enabled!=='boolean'||typeof state.frozen!=='boolean'||!Number.isSafeInteger(state.context)||state.context<0)return null;
 const s={...state};for(const key of ['type','workspace','documentId','epoch','v','seq'])delete s[key];
 if(workspace==='shapes'&&(!['cone','cylinder','cube'].includes(s.solid)||!between(s.depth,-1.8,1.8)))return null;
 if(workspace==='stand'&&(s.fixture!=='folding-stand-v1'||s.selected!=='backrest'||!between(s.angle,0,80)||s.limit!==80))return null;
 if(workspace==='box'&&(!['lid','tray'].includes(s.selected)||!between(s.angle,0,120)||!between(s.lift,0,160)||!between(s.limit,0,120)))return null;
 if(workspace==='art'&&(!s.frame||!finiteQ(s.frame.q)||!Array.isArray(s.frame.origin)||s.frame.origin.length!==3||s.frame.origin.some(n=>!between(n,-50,50))||!['stable','twist'].includes(s.kind)||!/^#[a-f0-9]{6}$/i.test(s.color)||!between(s.width,.005,.1)))return null;
 if(workspace==='maths'&&(!['point','cloud','challenge'].includes(s.stage)||!['rotate','annotate'].includes(s.mode)||!s.frame||!finiteQ(s.frame.q)||!Array.isArray(s.frame.origin)||s.frame.origin.length!==3||s.frame.origin.some(n=>!between(n,-50,50))||s.frame.aspect!==1||typeof s.canDraw!=='boolean'))return null;
 return s;
}
export function attachControlRelay(server,{token,port}){
 const wss=new WebSocketServer({noServer:true,maxPayload:128*1024}),peers=new Map();let owner=null,phone=null,epoch=0,acked=false;
 const send=(ws,p)=>{if(ws?.readyState===WebSocket.OPEN&&ws.bufferedAmount<256*1024)ws.send(JSON.stringify({v:2,epoch,...p}));};
 const status=()=>{for(const [ws,p] of peers)send(ws,{type:'status',owner:owner===ws,claimed:!!owner,phoneConnected:!!phone,workspace:owner?peers.get(owner)?.workspace:null});};
 const pushState=()=>{if(owner&&phone){const p=peers.get(owner);send(phone,{type:'state',workspace:p.workspace,documentId:p.documentId,...p.state});}};
 const release=ws=>{if(owner!==ws)return;owner=null;acked=false;epoch++;send(phone,{type:'waiting'});status();};
 server.on('upgrade',(req,socket,head)=>{const url=new URL(req.url,`http://localhost:${port}`);if(url.pathname!=='/control-stream')return;if(url.searchParams.get('session')!==token||![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(req.headers.origin)){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});
 wss.on('connection',(ws,req)=>{
  const role=new URL(req.url,`http://localhost:${port}`).searchParams.get('role');if(!['desktop','phone'].includes(role)||role==='phone'&&phone)return ws.close(1008,'A phone is already connected');
  peers.set(ws,{role,seq:-1,focused:false,workspace:null,state:null});if(role==='phone'){phone=ws;acked=false;pushState();}status();
  ws.on('message',raw=>{let p;try{p=JSON.parse(raw);}catch{return ws.close(1007,'Invalid JSON');}if(!p||typeof p!=='object'||Array.isArray(p))return ws.close(1007,'Expected a message object');const peer=peers.get(ws);if(p.v!==2||!Number.isSafeInteger(p.seq)||p.seq<=peer.seq)return;peer.seq=p.seq;
   if(p.type==='ping'){send(ws,{type:'pong',t:p.t});return;}
   if(role==='desktop'){
    if(p.type==='activate'){
     if(!workspaces.has(p.workspace)||typeof p.documentId!=='string'||p.documentId.length>120||!p.state||JSON.stringify(p.state).length>16000||p.focused!==true||p.visible!==true)return;
     const valid=descriptor(p.workspace,p.state);if(!valid)return;const previous=owner;if(previous!==ws){send(previous,{type:'lost'});epoch++;acked=false;}owner=ws;Object.assign(peer,{focused:true,workspace:p.workspace,documentId:p.documentId,state:valid});status();pushState();return;
    }
    if(owner!==ws||p.epoch!==epoch)return;
    if(p.type==='release'){release(ws);return;}
    if(p.type==='state'&&p.state&&JSON.stringify(p.state).length<16000){const valid=descriptor(peer.workspace,p.state);if(!valid)return;const oldContext=peer.state?.context;peer.state=valid;if(oldContext!==p.state.context)acked=false;pushState();return;}
    if(p.type==='ink-rejected'&&p.documentId===peer.documentId&&typeof p.strokeId==='string')send(phone,{type:'ink-rejected',documentId:p.documentId,strokeId:p.strokeId,index:p.index,reason:String(p.reason).slice(0,120)});
    if(p.type==='checkpoint'&&p.documentId===peer.documentId&&typeof p.strokeId==='string'&&Number.isSafeInteger(p.index))send(phone,{type:'checkpoint',documentId:p.documentId,strokeId:p.strokeId,index:p.index,finished:!!p.finished});
    if(p.type==='cue')send(phone,{type:'cue',cue:p.cue,id:p.id,at:Date.now()});
    return;
   }
   if(!owner||p.epoch!==epoch)return;const target=peers.get(owner);
   if(p.type==='ack'){if(p.context===target.state.context&&p.documentId===target.documentId){acked=true;send(owner,{type:'phone-ready'});}return;}
   if(!acked||p.context!==target.state.context)return;
   if(p.type==='frame'){
    if(typeof p.hold!=='boolean'||typeof p.active!=='boolean'||typeof p.visible!=='boolean'||!Number.isFinite(p.screenAngle)||typeof p.source!=='string'||p.source.length>120||p.hold&&!finiteQ(p.q))return;
    send(owner,{...p,epoch,seq:undefined,received:Date.now()});return;
   }
   if(p.type==='action'){
    if(typeof p.action!=='string'||p.action.length>60||p.value!==undefined&&(!Number.isFinite(p.value)||Math.abs(p.value)>(p.action==='color'?0xffffff:30000)))return;
    send(owner,{type:'action',action:p.action,value:p.value,epoch,context:p.context});return;
   }
   if(p.type==='ink'){
    if(!['art','maths'].includes(target.workspace)||p.documentId!==target.documentId||typeof p.strokeId!=='string'||p.strokeId.length>100||!Number.isSafeInteger(p.start)||p.start<0||!Array.isArray(p.points)||p.points.length>256||p.points.some(x=>!Array.isArray(x)||x.length!==7||!x.every(Number.isFinite)||Math.abs(x[0])>1||Math.abs(x[1])>1||Math.abs(Math.hypot(...x.slice(3))-1)>.1)||!Number.isFinite(p.aspect)||p.aspect<.2||p.aspect>5)return;
    send(owner,{type:'ink',documentId:p.documentId,strokeId:p.strokeId,start:p.start,points:p.points,aspect:p.aspect,frame:p.frame,mode:p.mode==='position'?'position':'draw',finished:!!p.finished,interrupted:!!p.interrupted,epoch,context:p.context});return;
   }
   if(['telemetry','test','capability'].includes(p.type))send(owner,{...p,epoch,received:Date.now()});
  });
  ws.on('close',()=>{if(ws===phone){phone=null;acked=false;send(owner,{type:'phone-lost'});}release(ws);peers.delete(ws);status();});
 });
 return {get status(){return {phoneConnected:!!phone,clients:peers.size,workspace:peers.get(owner)?.workspace??null,epoch};},close(){for(const ws of peers.keys())ws.close();wss.close();}};
}
