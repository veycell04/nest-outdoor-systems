import { getProduct } from "../../../lib/products";
import { createRequestId, customerError, logFailure } from "../../../lib/server-log";

export const runtime="nodejs";
export const maxDuration=20;

function json(body:unknown,status=200,requestId?:string){return Response.json(body,{status,headers:{"Cache-Control":"no-store",...(requestId?{"X-Request-ID":requestId}:{})}})}
function value(data:FormData,key:string,max=1000){const entry=data.get(key);return typeof entry==="string"?entry.trim().slice(0,max):""}

export async function POST(request:Request){
  const startedAt=Date.now();let requestId=createRequestId(request.headers.get("x-request-id")),productId:string|null=null;
  const fail=(status:number,message:string,error:unknown,providerCode?:string|null,providerRequestId?:string|null)=>{logFailure({requestId,stage:"consultation",productId,startedAt,status,error,providerCode,providerRequestId});return customerError(message,requestId,status)};
  let data:FormData;
  try{data=await request.formData()}catch(error){return fail(400,"The inquiry could not be read.",error)}
  requestId=createRequestId(value(data,"requestId",100)||requestId);productId=value(data,"productId",50)||null;
  const name=value(data,"name",120),email=value(data,"email",254),phone=value(data,"phone",40),zip=value(data,"zip",20),message=value(data,"message",2000),product=getProduct(productId||"");
  if(!name||!/^\S+@\S+\.\S+$/.test(email)||!product)return fail(400,"Enter your name, email, and a valid product.",new Error("Consultation input validation failed"));
  if(!process.env.RESEND_API_KEY||!process.env.CONSULTATION_FROM_EMAIL)return fail(503,"Online delivery is not configured yet. Your entries remain in this browser; please email hello@nestpergola.com.",new Error("Consultation provider environment is incomplete"));
  const context=value(data,"projectContext",5000);
  try{
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:process.env.CONSULTATION_FROM_EMAIL,to:[process.env.CONSULTATION_TO_EMAIL||"hello@nestpergola.com"],reply_to:email,subject:`NEST project inquiry — ${product.label}`,text:[`Name: ${name}`,`Email: ${email}`,`Phone: ${phone||"Not provided"}`,`ZIP: ${zip||"Not provided"}`,`Product: ${product.label}`,...(product.pricingNote?[`Pricing: ${product.pricingNote}`]:[]),`Message: ${message||"Not provided"}`,"",context?`Visualizer details:\n${context}`:"No visualizer details provided."].join("\n")})});
    const providerRequestId=response.headers.get("x-request-id");
    let result:{id?:string;message?:string;name?:string}={};try{result=await response.json()}catch(error){return fail(502,"The email service returned an unreadable response. Your inquiry was not confirmed.",error,null,providerRequestId)}
    if(!response.ok)return fail(502,"Your inquiry was not accepted by the email service. Your entries remain available.",new Error(result.message||`Resend returned HTTP ${response.status}`),result.name,providerRequestId);
    return json({accepted:true,id:result.id||null,requestId},200,requestId);
  }catch(error){return fail(502,"The email service could not be reached. Your entries remain available.",error)}
}
