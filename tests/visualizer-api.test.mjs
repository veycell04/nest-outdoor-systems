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

test("validates decoded mask alignment before contacting the provider",async()=>{
  const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY="test-only";
  const body=new FormData();body.append("photo",new File([png(1024,1024)],"photo.png",{type:"image/png"}));body.append("mask",new File([png(1024,900)],"mask.png",{type:"image/png"}));body.append("productId","awning");body.append("requestId","alignment-test");body.append("specs",JSON.stringify({finish:"Anthracite",options:[],measurements:{},unit:"ft"}));
  const response=await visualize(new Request("http://localhost/api/visualize",{method:"POST",body}));
  assert.equal(response.status,400);assert.match((await response.json()).error,/exactly match/i);
  if(old)process.env.OPENAI_API_KEY=old;else delete process.env.OPENAI_API_KEY;
});

test("blocks products that lack a verified reference",async()=>{
  const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY="test-only";
  const body=new FormData();body.append("photo",new File([png(1024,1024)],"photo.png",{type:"image/png"}));body.append("mask",new File([png(1024,1024)],"mask.png",{type:"image/png"}));body.append("productId","sliding_glass");body.append("requestId","missing-reference-test");
  const response=await visualize(new Request("http://localhost/api/visualize",{method:"POST",body}));
  assert.equal(response.status,422);assert.match((await response.json()).error,/verified Sliding Glass/i);
  if(old)process.env.OPENAI_API_KEY=old;else delete process.env.OPENAI_API_KEY;
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
  assert.match(source,/download=`nest-/);assert.match(source,/onRequestProject\(\{productId/);assert.match(source,/Request consultation/);
});
