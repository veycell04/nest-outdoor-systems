import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root=fileURLToPath(new URL("..",import.meta.url));
const vite=await createServer({appType:"custom",configFile:false,root,resolve:{alias:{"@":root}},server:{middlewareMode:true}});
let visualize,consultation;

before(async()=>{
  ({POST:visualize}=await vite.ssrLoadModule("/app/api/visualize/route.ts"));
  ({POST:consultation}=await vite.ssrLoadModule("/app/api/consultation/route.ts"));
});
after(async()=>vite.close());

function png(width,height,colorType=6){
  const bytes=new Uint8Array(33);bytes.set([137,80,78,71,13,10,26,10]);
  const view=new DataView(bytes.buffer);view.setUint32(16,width);view.setUint32(20,height);bytes[25]=colorType;return bytes;
}

test("rejects generation cleanly when the server credential is absent",async()=>{
  const old=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
  const response=await visualize(new Request("http://localhost/api/visualize",{method:"POST",body:new FormData()}));
  assert.equal(response.status,503);assert.match((await response.json()).error,/not configured/i);
  if(old)process.env.OPENAI_API_KEY=old;
});

test("generation limits default by environment and support a bounded override",async()=>{
  const {generationLimit}=await vite.ssrLoadModule("/app/api/visualize/route.ts");
  assert.equal(generationLimit({VERCEL_ENV:"production"}),3);
  assert.equal(generationLimit({VERCEL_ENV:"preview"}),20);
  assert.equal(generationLimit({VERCEL_ENV:"development"}),20);
  assert.equal(generationLimit({VERCEL_ENV:"production",VISUALIZER_GENERATION_LIMIT:"17"}),17);
  assert.equal(generationLimit({VERCEL_ENV:"preview",VISUALIZER_GENERATION_LIMIT:"0"}),20);
});

test("rate-limit transfer logs include request ID and current count",async()=>{
  const {logTransfer}=await vite.ssrLoadModule("/lib/visualizer-storage.ts"),lines=[],original=console.info;console.info=(line)=>lines.push(line);
  try{logTransfer({requestId:"rate-limit-test",stage:"rate_limited",productId:"awning",generationCount:20,generationLimit:20})}finally{console.info=original}
  const event=JSON.parse(lines[0]);assert.equal(event.requestId,"rate-limit-test");assert.equal(event.generationCount,20);assert.equal(event.generationLimit,20);
});

test("does not claim consultation delivery without provider setup",async()=>{
  const old=process.env.RESEND_API_KEY;delete process.env.RESEND_API_KEY;
  const body=new FormData();body.append("name","Test Customer");body.append("email","customer@example.com");body.append("productId","awning");
  const response=await consultation(new Request("http://localhost/api/consultation",{method:"POST",body}));
  assert.equal(response.status,503);assert.match((await response.json()).error,/not configured/i);
  if(old)process.env.RESEND_API_KEY=old;
});

test("visualizer source includes download and consultation handoff actions",async()=>{
  const source=await import("node:fs/promises").then(fs=>fs.readFile(new URL("../app/project-visualizer.tsx",import.meta.url),"utf8"));
  assert.match(source,/a\.download\s*=\s*`nest-/);assert.match(source,/onRequestProject\(\{/);assert.match(source,/Request consultation/);
  assert.doesNotMatch(source,/setMeasurements\(\{\}\).*setResult\(null\)/);
  assert.doesNotMatch(source,/setGenerating\(true\);setResult\(null\)/);
  assert.match(source,/Provided measurements —/);
});

test("large phone uploads are normalized and measured before generation",async()=>{
  const source=await import("node:fs/promises").then(fs=>fs.readFile(new URL("../app/project-visualizer.tsx",import.meta.url),"utf8"));
  assert.match(source,/1600\s*\/\s*Math\.max/);assert.match(source,/quality\s*=\s*0\.8/);assert.match(source,/2\.5\s*\*\s*1024\s*\*\s*1024/);assert.match(source,/new Response\(diagnostic\)\.arrayBuffer/);assert.match(source,/3\.8\s*\*\s*1024\s*\*\s*1024/);assert.match(source,/This photo is too large to process\. Please choose another photo\./);
  const form=new FormData();form.append("photo",new Blob([new Uint8Array(2.5*1024*1024)],{type:"image/jpeg"}),"project.jpg");form.append("mask",new Blob([new Uint8Array(220*1024)],{type:"image/png"}),"mask.png");form.append("productId","awning");form.append("specs",JSON.stringify({measurements:{width:"12",projection:"9"},unit:"ft"}));assert.ok((await new Response(form).arrayBuffer()).byteLength<3.8*1024*1024);
});

test("visualize exchanges private object IDs and never returns base64 image JSON",async()=>{
  const fs=await import("node:fs/promises"),route=await fs.readFile(new URL("../app/api/visualize/route.ts",import.meta.url),"utf8"),client=await fs.readFile(new URL("../app/project-visualizer.tsx",import.meta.url),"utf8");
  assert.doesNotMatch(route,/request\.formData\(/);assert.match(route,/photoObjectId/);assert.match(route,/fetch\(new URL\(path, request\.url\)\)/);assert.match(route,/Buffer\.from\(await reference\.arrayBuffer\(\)\)/);assert.doesNotMatch(route,/node:fs|node:path|readFile\(/);assert.match(route,/put\(/);assert.match(route,/imageUrl:\s*signedResultUrl/);assert.doesNotMatch(route,/data:image\/jpeg;base64/);assert.match(client,/@vercel\/blob\/client/);
});

test("large generated results are stored before a small JSON response",async()=>{
  const fs=await import("node:fs/promises"),route=await fs.readFile(new URL("../app/api/visualize/route.ts",import.meta.url),"utf8"),storage=await fs.readFile(new URL("../lib/visualizer-storage.ts",import.meta.url),"utf8");
  assert.match(route,/Buffer\.from\(result\.data\[0\]\.b64_json,\s*"base64"\)/);assert.match(route,/resultBytes\.byteLength\s*>\s*RESULT_MAX_BYTES/);assert.match(route,/await put\(/);assert.match(storage,/RESULT_MAX_BYTES\s*=\s*20\s*\*\s*1024\s*\*\s*1024/);
});

test("private object ownership and expiring result links are enforced",async()=>{
  const old=process.env.VISUALIZER_SESSION_SECRET;process.env.VISUALIZER_SESSION_SECRET="test-secret-that-is-longer-than-thirty-two-characters";const storage=await vite.ssrLoadModule("/lib/visualizer-storage.ts"),session=storage.createSessionCookie(),photo=storage.uploadPath(session.id,"request-1234","photo","jpg");assert.equal(storage.ownsObject(session.id,photo),true);assert.equal(storage.ownsObject(crypto.randomUUID(),photo),false);const url=new URL(storage.signedResultUrl(photo),"http://localhost");assert.equal(storage.verifyResultSignature(photo,url.searchParams.get("expires"),url.searchParams.get("signature")),true);if(old)process.env.VISUALIZER_SESSION_SECRET=old;else delete process.env.VISUALIZER_SESSION_SECRET;
});

test("Cassette Awning maps to width and projection",async()=>{
  const {products}=await vite.ssrLoadModule("/lib/products.ts");
  const awning=products.find(product=>product.id==="awning");
  assert.equal(awning.label,"Cassette Awning");
  assert.deepEqual(awning.dimensions,["width","projection"]);
  assert.deepEqual(awning.referenceImages,["/projects/elevated-cassette-awning.jpeg"]);
});

test("Sliding Glass uses its deployed concept visualization reference",async()=>{
  const {products}=await vite.ssrLoadModule("/lib/products.ts"),sliding=products.find(product=>product.id==="sliding_glass");
  assert.equal(sliding.label,"Sliding Glass — Concept Visualization");assert.deepEqual(sliding.referenceImages,["/projects/elevated-sliding-glass.png"]);assert.equal(sliding.missingReference,undefined);assert.match(sliding.details,/concept visualization, not a completed project/i);
});

test("structured logs redact credentials, images, and contact details",async()=>{
  const {logFailure}=await vite.ssrLoadModule("/lib/server-log.ts"),lines=[],original=console.error;
  console.error=(...args)=>lines.push(args.join(" "));
  try{logFailure({requestId:"controlled-log-test",stage:"image_generation",productId:"awning",startedAt:Date.now()-12,status:502,error:new Error("Bearer secret-token sk-test123 customer@example.com +1 312 555 0100 data:image/png;base64,AAAA"),providerCode:"provider_test",providerRequestId:"req_provider_123"})}finally{console.error=original}
  const event=JSON.parse(lines[0]);assert.equal(event.requestId,"controlled-log-test");assert.equal(event.stage,"image_generation");assert.equal(event.productId,"awning");assert.equal(event.httpStatus,502);assert.equal(event.providerCode,"provider_test");assert.equal(event.providerRequestId,"req_provider_123");assert.doesNotMatch(lines.join("\n"),/secret-token|sk-test123|customer@example|312 555|base64,AAAA/);assert.match(lines[1],/server stack/);
});

test("pointer coordinates are captured without retaining the React event",async()=>{
  const {mapPointerToCanvas}=await vite.ssrLoadModule("/app/project-visualizer.tsx");
  const canvas={isConnected:true,width:1000,height:500,getBoundingClientRect(){return{left:10,top:20,width:500,height:250}}};
  assert.deepEqual(mapPointerToCanvas(canvas,260,145),{x:500,y:250});
  assert.equal(mapPointerToCanvas(null,0,0),null);
  assert.equal(mapPointerToCanvas({...canvas,getBoundingClientRect(){return{left:0,top:0,width:0,height:250}}},0,0),null);
});

test("client render logs retain sanitized original and component stacks",async()=>{
  const {logFailure}=await vite.ssrLoadModule("/lib/server-log.ts"),lines=[],original=console.error;console.error=(...args)=>lines.push(args.join(" "));
  try{logFailure({requestId:"client-stack-test",stage:"client_render",startedAt:Date.now(),status:500,error:"render failed",originalStack:"Error: user@example.com\n at Visualizer (app.js:1)",componentStack:"at ProjectVisualizer (+1 312 555 0100)"})}finally{console.error=original}
  assert.equal(lines.length,1);const event=JSON.parse(lines[0]);assert.match(event.clientStack,/Visualizer/);assert.match(event.componentStack,/ProjectVisualizer/);assert.doesNotMatch(lines[0],/user@example|312 555/);
});
