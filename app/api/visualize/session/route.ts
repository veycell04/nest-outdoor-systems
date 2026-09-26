import {
  createSessionCookie,
  logTransfer,
  ownerPrefix,
  readSession,
} from "../../../../lib/visualizer-storage";
import {
  createRequestId,
  customerError,
  logFailure,
} from "../../../../lib/server-log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = createRequestId(request.headers.get("x-request-id"));
  try {
    const current = readSession(request);
    if (current) {
      logTransfer({ requestId, stage: "session_reused" });
      return Response.json(
        { ready: true, uploadPrefix: `visualizer/${ownerPrefix(current)}` },
        { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    }
    const session = createSessionCookie();
    logTransfer({ requestId, stage: "session_created" });
    return Response.json(
      { ready: true, uploadPrefix: `visualizer/${ownerPrefix(session.id)}` },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": session.header,
          "X-Request-ID": requestId,
        },
      },
    );
  } catch (error) {
    logFailure({ requestId, stage: "session", startedAt, status: 500, error });
    return customerError(
      "The secure upload session could not be created.",
      requestId,
      500,
    );
  }
}
