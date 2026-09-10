"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";

type Props={children:ReactNode};
type State={error:Error|null;requestId:string|null;reported:boolean};

export class ClientErrorBoundary extends Component<Props,State>{
  state:State={error:null,requestId:null,reported:false};

  static getDerivedStateFromError(error:Error):State{return{error,requestId:crypto.randomUUID(),reported:false}}

  componentDidCatch(error:Error,info:ErrorInfo){
    const requestId=this.state.requestId||crypto.randomUUID();
    fetch("/api/client-error",{method:"POST",headers:{"Content-Type":"application/json","X-Request-ID":requestId},body:JSON.stringify({message:error.message,stack:error.stack||null,componentStack:info.componentStack||null,path:location.pathname})}).then(response=>this.setState({reported:response.ok})).catch(()=>this.setState({reported:false}));
  }

  render(){
    if(!this.state.error)return this.props.children;
    return <main className="error-page"><section><p className="eyebrow dark"><span/> Visualizer error</p><h1>We couldn’t display this part of the project.</h1><p>Your photo is not transmitted by this error report. Reload the page and try again, or share the reference below with NEST.</p><code>Reference: {this.state.requestId}</code><button type="button" className="button" onClick={()=>location.reload()}>Reload page</button><a href="mailto:hello@nestpergola.com">Contact hello@nestpergola.com</a><small>{this.state.reported?"The original client and component stacks were reported securely.":"The technical error could not be reported automatically."}</small></section></main>;
  }
}
