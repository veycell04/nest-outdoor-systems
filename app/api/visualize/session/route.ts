import { createSessionCookie, ownerPrefix, readSession } from "../../../../lib/visualizer-storage";

export const runtime="nodejs";

export async function POST(request:Request){
  const current=readSession(request);if(current)return Response.json({ready:true,uploadPrefix:`visualizer/${ownerPrefix(current)}`},{headers:{"Cache-Control":"no-store"}});
  const session=createSessionCookie();
  return Response.json({ready:true,uploadPrefix:`visualizer/${ownerPrefix(session.id)}`},{headers:{"Cache-Control":"no-store","Set-Cookie":session.header}});
}
