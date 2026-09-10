import { getProduct } from "../../../lib/products";
import { createRequestId, customerError, logFailure, type FailureStage } from "../../../lib/server-log";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_DIMENSION = 4096;
const requests = new Map<string, number[]>();
const completed = new Map<string, { at:number }>();

function json(body:unknown,status=200,requestId?:string){return Response.json(body,{status,headers:{"Cache-Control":"no-store",...(requestId?{"X-Request-ID":requestId}:{})}})}
function pngSize(bytes:Uint8Array){if(bytes.length<33||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)return null;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return{width:view.getUint32(16),height:view.getUint32(20),colorType:bytes[25]}}
function cleanText(value:FormDataEntryValue|null,max=200){return typeof value==="string"?value.trim().slice(0,max):""}
function clientKey(request:Request){return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"anonymous"}

export async function POST(request:Request){
  const startedAt=Date.now();
  let requestId=createRequestId(request.headers.get("x-request-id"));
  let productId:string|null=null;
  const fail=(stage:FailureStage,status:number,customerMessage:string,error:unknown,providerCode?:string|null,providerRequestId?:string|null)=>{
    logFailure({requestId,stage,productId,startedAt,status,error,providerCode,providerRequestId});
    return customerError(customerMessage,requestId,status);
  };

  if(!process.env.OPENAI_API_KEY)return fail("image_generation",503,"AI generation is not configured yet. You can still request a consultation.",new Error("OPENAI_API_KEY is not configured"));
  const key=clientKey(request),now=Date.now();
  for(const[id,entry]of completed)if(now-entry.at>=15*60*1000)completed.delete(id);
  while(completed.size>20)completed.delete(completed.keys().next().value as string);
  const recent=(requests.get(key)||[]).filter(time=>now-time<60*60*1000);
  if(recent.length>=3)return fail("validation",429,"Generation limit reached. Please try again later or request a consultation.",new Error("Per-client generation limit reached"));

  let data:FormData;
  try{data=await request.formData()}catch(error){return fail("upload",400,"The upload could not be read.",error)}
  productId=cleanText(data.get("productId"),50)||null;
  requestId=createRequestId(cleanText(data.get("requestId"),100)||requestId);
  const photo=data.get("photo"),mask=data.get("mask"),product=getProduct(productId||"");
  const prior=completed.get(requestId);
  if(prior&&now-prior.at<15*60*1000)return fail("validation",409,"This request was already completed. Use the displayed result or start a new generation.",new Error("Duplicate completed request ID"));
  if(!(photo instanceof File)||!(mask instanceof File))return fail("upload",400,"A processed photo and installation-area mask are required.",new Error("Missing photo or mask file"));
  if(!product)return fail("validation",400,"Choose a valid NEST product.",new Error("Unknown product ID"));
  if(!product.referenceImages.length)return fail("validation",422,product.missingReference||"A verified product reference is unavailable.",new Error("Product has no verified reference image"));
  if(photo.type!=="image/png"||mask.type!=="image/png"||photo.size>MAX_FILE_BYTES||mask.size>MAX_FILE_BYTES)return fail("validation",413,"Processed images must be PNG files smaller than 6 MB.",new Error("Upload type or size validation failed"));

  let photoBytes:ArrayBuffer,maskBytes:ArrayBuffer;
  try{[photoBytes,maskBytes]=await Promise.all([photo.arrayBuffer(),mask.arrayBuffer()])}catch(error){return fail("upload",400,"The processed images could not be read.",error)}
  const photoInfo=pngSize(new Uint8Array(photoBytes)),maskInfo=pngSize(new Uint8Array(maskBytes));
  if(!photoInfo||!maskInfo)return fail("validation",400,"The processed photo or mask is invalid.",new Error("PNG signature or header validation failed"));
  if(photoInfo.width!==maskInfo.width||photoInfo.height!==maskInfo.height)return fail("validation",400,"The mask must exactly match the processed photo.",new Error(`Mask dimension mismatch ${maskInfo.width}x${maskInfo.height} vs ${photoInfo.width}x${photoInfo.height}`));
  if(photoInfo.width<512||photoInfo.height<512||photoInfo.width>MAX_DIMENSION||photoInfo.height>MAX_DIMENSION||photoInfo.width*photoInfo.height>12_000_000)return fail("validation",400,"Photo dimensions must be between 512 and 4096 pixels, with no more than 12 megapixels.",new Error(`Decoded dimensions rejected: ${photoInfo.width}x${photoInfo.height}`));
  if(![4,6].includes(maskInfo.colorType))return fail("validation",400,"The mask must include transparency.",new Error(`Mask PNG color type ${maskInfo.colorType} has no alpha channel`));

  let specs:Record<string,unknown>={};
  try{specs=JSON.parse(cleanText(data.get("specs"),4000))}catch(error){return fail("validation",400,"Product specifications are invalid.",error)}
  const finish=typeof specs.finish==="string"&&product.finishes.includes(specs.finish)?specs.finish:product.finishes[0];
  const options=Array.isArray(specs.options)?specs.options.filter((value):value is string=>typeof value==="string"&&product.options.includes(value)).slice(0,6):[];
  const measurements=typeof specs.measurements==="object"&&specs.measurements?specs.measurements:{};
  const unit=specs.unit==="m"?"meters":"feet and inches";
  const prompt=[`Create a photorealistic after-installation architectural concept using the first image as the customer's home and editing only the transparent masked installation area.`,`Install this exact product type: ${product.label}. Verified product description: ${product.details}`,`Use the later images only as NEST product references. Match their construction language and proportions without copying their background.`,`Finish: ${finish}. Options: ${options.length?options.join(", "):"none selected"}. Provided measurements (${unit}): ${JSON.stringify(measurements)}.`,`Preserve the house, doors, windows, landscaping, people, furniture, camera position, crop, and all unmasked surroundings. Match perspective, mounting, real-world materials, daylight direction, contact shadows, reflections, and occlusion. Do not add text, labels, dimensions, logos, or watermarks. This is a design concept, not an engineering drawing and not necessarily to scale.`].join("\n");

  const outbound=new FormData();
  outbound.append("model",process.env.OPENAI_IMAGE_MODEL||"gpt-image-2.5-sunburst");
  outbound.append("image[]",new Blob([photoBytes],{type:"image/png"}),"project.png");
  try{for(const[index,path]of product.referenceImages.entries()){const reference=await fetch(new URL(path,request.url));if(!reference.ok)throw new Error(`Reference image returned HTTP ${reference.status}`);outbound.append("image[]",new Blob([await reference.arrayBuffer()],{type:reference.headers.get("content-type")||"image/jpeg"}),`reference-${index}.jpg`)}}catch(error){return fail("image_generation",500,"A verified product reference could not be loaded.",error)}
  outbound.append("mask",new Blob([maskBytes],{type:"image/png"}),"mask.png");outbound.append("prompt",prompt);outbound.append("quality",process.env.OPENAI_IMAGE_QUALITY||"medium");outbound.append("size","auto");outbound.append("output_format","jpeg");outbound.append("output_compression","88");outbound.append("n","1");

  recent.push(now);requests.set(key,recent);
  try{
    const response=await fetch("https://api.openai.com/v1/images/edits",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:outbound,signal:AbortSignal.any([request.signal,AbortSignal.timeout(55_000)])});
    const providerRequestId=response.headers.get("x-request-id");
    let result:{data?:{b64_json?:string}[];error?:{message?:string;code?:string}}={};
    try{result=await response.json()}catch(error){recent.pop();return fail("image_generation",502,"The image service returned an unreadable response. Please retry.",error,null,providerRequestId)}
    if(!response.ok||!result.data?.[0]?.b64_json){recent.pop();const retryable=response.status>=500||response.status===429,status=retryable?503:422;return fail("image_generation",status,retryable?"The image service is temporarily unavailable. Please retry.":"The image could not be generated from this request.",new Error(result.error?.message||`OpenAI returned HTTP ${response.status}`),result.error?.code,providerRequestId)}
    const payload={image:`data:image/jpeg;base64,${result.data[0].b64_json}`,product:{id:product.id,label:product.label},specs:{finish,options,measurements,unit},disclaimer:"AI design concept — not to scale. Final design requires site measurement and engineering review.",requestId};
    completed.set(requestId,{at:now});return json(payload,200,requestId);
  }catch(error){recent.pop();return fail("image_generation",504,request.signal.aborted?"Generation was cancelled.":"Generation timed out. Please retry.",error)}
}
