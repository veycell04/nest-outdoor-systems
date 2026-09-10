import { createRequestId, customerError, logFailure, sanitizeError } from "../../../lib/server-log";

export const runtime="nodejs";
const reports=new Map<string,number[]>();

export async function POST(request:Request){
  const startedAt=Date.now(),requestId=createRequestId(request.headers.get("x-request-id"));
  const key=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"anonymous",now=Date.now(),recent=(reports.get(key)||[]).filter(time=>now-time<60*60*1000);
  if(recent.length>=10){const error=new Error("Client error report rate limit reached");logFailure({requestId,stage:"client_render",startedAt,status:429,error});return customerError("The error was displayed but could not be reported automatically.",requestId,429)}
  let body:unknown;try{body=await request.json()}catch(error){logFailure({requestId,stage:"client_render",startedAt,status:400,error});return customerError("The error report was invalid.",requestId,400)}
  if(!body||typeof body!=="object"){const error=new Error("Client error report body was not an object");logFailure({requestId,stage:"client_render",startedAt,status:400,error});return customerError("The error report was invalid.",requestId,400)}
  const input=body as Record<string,unknown>,message=sanitizeError(typeof input.message==="string"?input.message:"Client render error"),path=typeof input.path==="string"&&/^\/[A-Za-z0-9/_-]{0,200}$/.test(input.path)?input.path:"/",originalStack=typeof input.stack==="string"?input.stack.slice(0,12000):null,componentStack=typeof input.componentStack==="string"?input.componentStack.slice(0,12000):null;
  recent.push(now);reports.set(key,recent);logFailure({requestId,stage:"client_render",productId:null,startedAt,status:500,error:`${message} at ${path}`,originalStack,componentStack});
  return Response.json({accepted:true,requestId},{status:202,headers:{"Cache-Control":"no-store","X-Request-ID":requestId}});
}
