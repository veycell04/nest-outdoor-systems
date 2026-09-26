import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { put } from "@vercel/blob";
import {
  createRequestId,
  customerError,
  logFailure,
} from "../../../../lib/server-log";
import {
  MASK_MAX_BYTES,
  PHOTO_MAX_BYTES,
  logTransfer,
  readSession,
  uploadPath,
} from "../../../../lib/visualizer-storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now(),
    requestId = createRequestId(request.headers.get("x-request-id")),
    sessionId = readSession(request);
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    try {
      if (!sessionId) throw new Error("Missing upload session");
      const form = await request.formData(),
        uploadRequestId = createRequestId(String(form.get("requestId") || "")),
        kind = String(form.get("kind") || ""),
        file = form.get("file");
      if (kind !== "photo" && kind !== "mask")
        throw new Error("Invalid upload kind");
      if (!(file instanceof File)) throw new Error("Missing upload file");
      const isMask = kind === "mask",
        maximumSize = isMask ? MASK_MAX_BYTES : PHOTO_MAX_BYTES,
        allowedTypes = isMask
          ? ["image/png"]
          : ["image/jpeg", "image/webp"];
      if (!allowedTypes.includes(file.type) || file.size <= 0 || file.size > maximumSize)
        throw new Error("Upload type or size is invalid");
      const extension = isMask ? "png" : file.type === "image/webp" ? "webp" : "jpg",
        pathname = uploadPath(sessionId, uploadRequestId, kind, extension),
        blob = await put(pathname, file, {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: file.type,
        });
      logTransfer({
        requestId: uploadRequestId,
        stage: `${kind}_uploaded_server`,
        ...(isMask ? { maskBytes: file.size } : { photoBytes: file.size }),
      });
      return Response.json(
        { pathname: blob.pathname },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      logFailure({ requestId, stage: "upload", startedAt, status: 400, error });
      return customerError("The private upload could not be completed.", requestId, 400);
    }
  }
  let body: HandleUploadBody;
  try {
    body = await request.json();
  } catch (error) {
    logFailure({ requestId, stage: "upload", startedAt, status: 400, error });
    return customerError(
      "The upload authorization was invalid.",
      requestId,
      400,
    );
  }
  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!sessionId) throw new Error("Missing upload session");
        let input: { requestId?: string; kind?: string; extension?: string } =
          {};
        try {
          input = JSON.parse(clientPayload || "{}");
        } catch {
          throw new Error("Invalid upload metadata");
        }
        const id = createRequestId(input.requestId),
          kind = input.kind;
        if (kind !== "photo" && kind !== "mask")
          throw new Error("Invalid upload kind");
        const extension =
          kind === "mask" ? "png" : input.extension === "webp" ? "webp" : "jpg";
        if (pathname !== uploadPath(sessionId, id, kind, extension))
          throw new Error("Upload pathname was not authorized");
        return {
          allowedContentTypes:
            kind === "mask" ? ["image/png"] : ["image/jpeg", "image/webp"],
          maximumSizeInBytes:
            kind === "mask" ? MASK_MAX_BYTES : PHOTO_MAX_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ sessionId, requestId: id, kind }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const metadata = JSON.parse(tokenPayload || "{}");
        if (!blob.pathname.startsWith("visualizer/"))
          throw new Error("Upload ownership mismatch");
        logTransfer({
          requestId: metadata.requestId,
          stage: `${metadata.kind}_uploaded`,
        });
      },
    });
    return Response.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logFailure({ requestId, stage: "upload", startedAt, status: 400, error });
    return customerError(
      "The private upload could not be authorized.",
      requestId,
      400,
    );
  }
}
