import { get } from "@vercel/blob";
import { createRequestId, customerError, logFailure } from "../../../../lib/server-log";
import { ownsObject, readSession, verifyResultSignature } from "../../../../lib/visualizer-storage";

export const runtime="nodejs";

export async function GET(request:Request){
  const startedAt=Date.now(),requestId=createRequestId(request.headers.get("x-request-id")),url=new URL(request.url),objectId=url.searchParams.get("objectId")||"",sessionId=readSession(request);
  if(!sessionId||!ownsObject(sessionId,objectId)||!verifyResultSignature(objectId,url.searchParams.get("expires")||"",url.searchParams.get("signature")||""))return customerError("This concept link expired. Generate it again for a new private link.",requestId,403);
  try{const result=await get(objectId,{access:"private"});if(!result||result.statusCode!==200)return customerError("The concept is no longer available.",requestId,404);return new Response(result.stream,{headers:{"Content-Type":result.blob.contentType||"image/jpeg","Content-Length":String(result.blob.size||""),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Disposition":"inline"}})}catch(error){logFailure({requestId,stage:"image_generation",startedAt,status:502,error});return customerError("The private concept could not be loaded.",requestId,502)}
}
