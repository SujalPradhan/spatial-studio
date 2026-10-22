const finite=(n,a,b)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b;
export function validCameraIdentity(p){return p&&typeof p.captureId==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(p.captureId)&&[p.width,p.height].every(n=>Number.isInteger(n)&&n>=160&&n<=4096);}
export function validTrackingFrame(p){
 return validCameraIdentity(p)&&Number.isSafeInteger(p.frameId)&&p.frameId>0&&Array.isArray(p.hands)&&p.hands.length<=2&&p.hands.every(h=>Array.isArray(h)&&h.length===21&&h.every(v=>v&&['x','y','z'].every(k=>finite(v[k],-5,5))))
 &&(p.frameAt===null||finite(p.frameAt,0,1e14))&&finite(p.dispatchAt,0,1e14)&&finite(p.videoTimeMs,0,1e14)&&['video-presentation-estimate','bitmap-start-estimate'].includes(p.timestampSource)
 &&(p.clockRttMs===null||finite(p.clockRttMs,0,1000))&&finite(p.inferenceMs,0,30000)&&finite(p.processedHz,0,240);
}
export const validCaptureId=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(id);
export function validTrackingPhoto(p){return validCameraIdentity(p)&&validCaptureId(p.requestId)&&typeof p.jpeg==='string'&&p.jpeg.length<=110000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.jpeg);}
