export type FailureStage = "upload" | "validation" | "image_generation" | "consultation" | "client_render";

type FailureDetails = {
  requestId: string;
  stage: FailureStage;
  productId?: string | null;
  startedAt: number;
  status: number;
  error: unknown;
  providerCode?: string | null;
  providerRequestId?: string | null;
};

const SAFE_MAX = 300;

export function createRequestId(candidate?: string | null) {
  return candidate && /^[A-Za-z0-9_-]{8,100}$/.test(candidate) ? candidate : crypto.randomUUID();
}

function redact(raw: string) {
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "[REDACTED_IMAGE]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_KEY]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[REDACTED_PHONE]");
}

export function sanitizeError(error: unknown) {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
  return redact(raw).slice(0, SAFE_MAX);
}

export function logFailure(details: FailureDetails) {
  const event = {
    event: "nest_request_failure",
    requestId: details.requestId,
    stage: details.stage,
    productId: details.productId || null,
    elapsedMs: Math.max(0, Date.now() - details.startedAt),
    httpStatus: details.status,
    error: sanitizeError(details.error),
    providerCode: details.providerCode || null,
    providerRequestId: details.providerRequestId || null,
  };
  console.error(JSON.stringify(event));
  if (details.error instanceof Error && details.error.stack) console.error(`[${details.requestId}] server stack`, redact(details.error.stack));
  return event;
}

export function customerError(message: string, requestId: string, status: number) {
  return Response.json(
    { error: `${message} Reference: ${requestId}`, requestId },
    { status, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
  );
}
