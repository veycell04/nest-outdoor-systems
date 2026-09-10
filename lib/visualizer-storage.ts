import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const MASK_MAX_BYTES = 4 * 1024 * 1024;
export const RESULT_MAX_BYTES = 20 * 1024 * 1024;
export const SESSION_COOKIE = "nest_visualizer_session";

function secret(){
  const value=process.env.VISUALIZER_SESSION_SECRET;
  if(!value||value.length<32)throw new Error("VISUALIZER_SESSION_SECRET must be at least 32 characters");
  return value;
}

function signature(value:string){return createHmac("sha256",secret()).update(value).digest("base64url")}
function safeEqual(left:string,right:string){const a=Buffer.from(left),b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b)}

export function createSessionCookie(){
  const id=crypto.randomUUID(),value=`${id}.${signature(id)}`;
  return {id,value,header:`${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=7200`};
}

export function readSession(request:Request){
  const raw=request.headers.get("cookie")?.split(";").map(value=>value.trim()).find(value=>value.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length+1);
  if(!raw)return null;const split=raw.lastIndexOf(".");if(split<1)return null;
  const id=raw.slice(0,split),provided=raw.slice(split+1);
  return /^[0-9a-f-]{36}$/i.test(id)&&safeEqual(provided,signature(id))?id:null;
}

export function ownerPrefix(sessionId:string){return createHash("sha256").update(sessionId).digest("hex").slice(0,32)}
export function uploadPath(sessionId:string,requestId:string,kind:"photo"|"mask",extension:string){return `visualizer/${ownerPrefix(sessionId)}/${requestId}/${kind}.${extension}`}
export function ownsObject(sessionId:string,objectId:string){return objectId.startsWith(`visualizer/${ownerPrefix(sessionId)}/`)&&/^visualizer\/[a-f0-9]{32}\/[A-Za-z0-9_-]{8,100}\/(photo\.(jpe?g|webp)|mask\.png|result\.jpe?g)$/.test(objectId)}

export function signedResultUrl(objectId:string,ttlSeconds=15*60){
  const expires=Math.floor(Date.now()/1000)+ttlSeconds,payload=`${objectId}:${expires}`;
  return `/api/visualize/result?objectId=${encodeURIComponent(objectId)}&expires=${expires}&signature=${signature(payload)}`;
}

export function verifyResultSignature(objectId:string,expiresText:string,provided:string){
  const expires=Number(expiresText);if(!Number.isSafeInteger(expires)||expires<Math.floor(Date.now()/1000)||expires>Math.floor(Date.now()/1000)+3600)return false;
  return safeEqual(provided,signature(`${objectId}:${expires}`));
}

export function logTransfer(details:{requestId:string;stage:string;productId?:string|null;requestBytes?:number|null;photoBytes?:number|null;maskBytes?:number|null;responseBytes?:number|null;metadataBytes?:number|null}){
  console.info(JSON.stringify({event:"nest_visualizer_transfer",requestId:details.requestId,stage:details.stage,productId:details.productId||null,requestBytes:details.requestBytes??null,photoBytes:details.photoBytes??null,maskBytes:details.maskBytes??null,responseBytes:details.responseBytes??null,metadataBytes:details.metadataBytes??null}));
}
