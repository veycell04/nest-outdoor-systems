import {
  createRequestId,
  customerError,
  logFailure,
} from "../../../../lib/server-log";
import { logTransfer } from "../../../../lib/visualizer-storage";

export const runtime = "nodejs";
const submissions = new Map<string, number[]>();
const safeBytes = (value: unknown) =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 50 * 1024 * 1024
    ? value
    : null;

export async function POST(request: Request) {
  const startedAt = Date.now(),
    key =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "anonymous",
    now = Date.now(),
    recent = (submissions.get(key) || []).filter(
      (time) => now - time < 3600000,
    ),
    requestId = createRequestId(request.headers.get("x-request-id"));
  if (recent.length >= 30)
    return customerError(
      "Upload diagnostics are temporarily rate limited.",
      requestId,
      429,
    );
  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch (error) {
    logFailure({ requestId, stage: "upload", startedAt, status: 400, error });
    return customerError("Upload diagnostics were invalid.", requestId, 400);
  }
  const productId =
      typeof input.productId === "string" &&
      /^[a-z0-9_]{1,50}$/.test(input.productId)
        ? input.productId
        : null,
    id = createRequestId(
      typeof input.requestId === "string" ? input.requestId : requestId,
    ),
    original = safeBytes(input.originalPhotoBytes),
    photo = safeBytes(input.normalizedPhotoBytes),
    mask = safeBytes(input.maskBytes),
    total = safeBytes(input.totalRequestBytes);
  if (original === null || photo === null || mask === null || total === null)
    return customerError("Upload diagnostics were invalid.", id, 400);
  recent.push(now);
  submissions.set(key, recent);
  logTransfer({
    requestId: id,
    stage: "client_payload_measured",
    productId,
    requestBytes: total,
    photoBytes: photo,
    maskBytes: mask,
  });
  console.info(
    JSON.stringify({
      event: "nest_visualizer_original_photo",
      requestId: id,
      productId,
      originalPhotoBytes: original,
    }),
  );
  return Response.json(
    { accepted: true },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
