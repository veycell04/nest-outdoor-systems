"use client";

import { useEffect, useRef, useState } from "react";

export default function GlobalError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  const id=useRef(typeof crypto!=="undefined"?crypto.randomUUID():`client-${Date.now()}`),[reported,setReported]=useState(false);
  useEffect(()=>{const controller=new AbortController();fetch("/api/client-error",{method:"POST",headers:{"Content-Type":"application/json","X-Request-ID":id.current},body:JSON.stringify({message:error.message,stack:error.stack||null,componentStack:null,path:location.pathname}),signal:controller.signal}).then(()=>setReported(true)).catch(()=>setReported(false));return()=>controller.abort()},[error]);
  return <main className="error-page"><section><p className="eyebrow dark"><span/> Visualizer error</p><h1>We couldn’t display this part of the project.</h1><p>Your photo has not been submitted by this error screen. Try again, or use the reference below when contacting NEST.</p><code>Reference: {id.current}</code><button type="button" className="button" onClick={reset}>Try again</button><a href="mailto:hello@nestpergola.com">Contact hello@nestpergola.com</a><small>{reported?"The technical error was reported securely.":"The technical error could not be reported automatically."}</small></section></main>;
}
