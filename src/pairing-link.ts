export const normalizePairCode=(code:string)=>code.toUpperCase().replace(/[-\s]/g,'');
export const validPairCode=(code:string)=>/^[A-HJ-NP-Z2-9]{8}$/.test(code);
export function phonePairingUrl(origin:string,code:string){
 if(!validPairCode(code))throw Error('Invalid pairing code.');
 const url=new URL('/phone',origin);url.hash=new URLSearchParams({pair:code}).toString();return url.href;
}
export function takePairingInvite(){
 const hash=new URLSearchParams(location.hash.slice(1));
 if(!hash.has('pair'))return {requested:false,code:null};
 const code=normalizePairCode(hash.get('pair')||'');hash.delete('pair');
 history.replaceState(history.state,'',location.pathname+location.search+(hash.size?'#'+hash.toString():''));
 return {requested:true,code:validPairCode(code)?code:null};
}
