import { get, head, put } from "@vercel/blob";
import { getProduct } from "../../../lib/products";
import {
  createRequestId,
  customerError,
  logFailure,
  type FailureStage,
} from "../../../lib/server-log";
import {
  MASK_MAX_BYTES,
  PHOTO_MAX_BYTES,
  RESULT_MAX_BYTES,
  logTransfer,
  ownsObject,
  readSession,
  signedResultUrl,
} from "../../../lib/visualizer-storage";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_DIMENSION = 4096,
  requests = new Map<string, number[]>(),
  completed = new Map<string, { at: number }>();
const json = (body: unknown, status = 200, requestId?: string) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(requestId ? { "X-Request-ID": requestId } : {}),
    },
  });
function pngSize(bytes: Uint8Array) {
  if (
    bytes.length < 33 ||
    bytes[0] !== 137 ||
    bytes[1] !== 80 ||
    bytes[2] !== 78 ||
    bytes[3] !== 71
  )
    return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
    colorType: bytes[25],
  };
}
function jpegSize(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216) return null;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 255) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1],
      length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (
      [
        192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
      ].includes(marker)
    )
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
      };
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}
const cleanText = (value: unknown, max = 200) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
export function generationLimit(env: NodeJS.ProcessEnv = process.env) {
  const configured = Number(env.VISUALIZER_GENERATION_LIMIT);
  if (Number.isInteger(configured) && configured > 0 && configured <= 100)
    return configured;
  return env.VERCEL_ENV === "production" ? 3 : 20;
}
async function blobBytes(objectId: string) {
  const result = await get(objectId, { access: "private" });
  if (!result || result.statusCode !== 200)
    throw new Error("Private object not found");
  return new Response(result.stream).arrayBuffer();
}

export async function POST(request: Request) {
  const startedAt = Date.now(),
    headerBytes = Number(request.headers.get("content-length") || 0) || null;
  let requestId = createRequestId(request.headers.get("x-request-id")),
    productId: string | null = null;
  const fail = (
    stage: FailureStage,
    status: number,
    message: string,
    error: unknown,
    providerCode?: string | null,
    providerRequestId?: string | null,
  ) => {
    logFailure({
      requestId,
      stage,
      productId,
      startedAt,
      status,
      error,
      providerCode,
      providerRequestId,
    });
    return customerError(message, requestId, status);
  };
  if (!process.env.OPENAI_API_KEY)
    return fail(
      "image_generation",
      503,
      "AI generation is not configured yet. You can still request a consultation.",
      new Error("OPENAI_API_KEY is not configured"),
    );
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    return fail(
      "upload",
      503,
      "Private image storage is not configured yet. You can still request a consultation.",
      new Error("BLOB_READ_WRITE_TOKEN is not configured"),
    );
  const sessionId = readSession(request);
  if (!sessionId)
    return fail(
      "upload",
      401,
      "Your secure upload session expired. Please retry.",
      new Error("Missing or invalid visualizer session"),
    );
  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch (error) {
    return fail(
      "upload",
      400,
      "The generation request could not be read.",
      error,
    );
  }
  const metadataBytes = new TextEncoder().encode(
    JSON.stringify(input),
  ).byteLength;
  requestId = createRequestId(cleanText(input.requestId, 100) || requestId);
  productId = cleanText(input.productId, 50) || null;
  logTransfer({
    requestId,
    stage: "request_received",
    productId,
    requestBytes: headerBytes,
    metadataBytes,
  });
  if (metadataBytes > 32768)
    return fail(
      "validation",
      413,
      "The project configuration is too large.",
      new Error(`Metadata size ${metadataBytes} exceeded 32768 bytes`),
    );
  const photoId = cleanText(input.photoObjectId, 300),
    maskId = cleanText(input.maskObjectId, 300),
    product = getProduct(productId || "");
  if (
    !ownsObject(sessionId, photoId) ||
    !ownsObject(sessionId, maskId) ||
    !photoId.includes("/photo.") ||
    !maskId.endsWith("/mask.png")
  )
    return fail(
      "upload",
      403,
      "The uploaded files could not be authorized.",
      new Error("Object ownership or object kind validation failed"),
    );
  if (!product)
    return fail(
      "validation",
      400,
      "Choose a valid NEST product.",
      new Error("Unknown product ID"),
    );
  if (!product.referenceImages.length)
    return fail(
      "validation",
      422,
      product.missingReference ||
        "A verified product reference is unavailable.",
      new Error("Product has no verified reference image"),
    );
  const now = Date.now(),
    key = sessionId,
    limit = generationLimit();
  for (const [id, entry] of completed)
    if (now - entry.at >= 900000) completed.delete(id);
  while (completed.size > 20)
    completed.delete(completed.keys().next().value as string);
  if (completed.has(requestId))
    return fail(
      "validation",
      409,
      "This request was already completed. Use the displayed result or start a new generation.",
      new Error("Duplicate completed request ID"),
    );
  const recent = (requests.get(key) || []).filter(
    (time) => now - time < 3600000,
  );
  if (recent.length >= limit) {
    logTransfer({
      requestId,
      stage: "rate_limited",
      productId,
      generationCount: recent.length,
      generationLimit: limit,
    });
    return fail(
      "validation",
      429,
      "Generation limit reached. Please try again later or request a consultation.",
      new Error(
        `Per-session generation limit reached: count=${recent.length} limit=${limit}`,
      ),
    );
  }
  let photoMeta, maskMeta;
  try {
    [photoMeta, maskMeta] = await Promise.all([head(photoId), head(maskId)]);
  } catch (error) {
    return fail("upload", 400, "The uploaded files are unavailable.", error);
  }
  if (
    photoMeta.size > PHOTO_MAX_BYTES ||
    maskMeta.size > MASK_MAX_BYTES ||
    !["image/jpeg", "image/webp"].includes(photoMeta.contentType) ||
    maskMeta.contentType !== "image/png"
  )
    return fail(
      "validation",
      413,
      "The normalized photo or mask exceeds the private upload limit.",
      new Error(
        `Stored object validation failed photo=${photoMeta.size} mask=${maskMeta.size}`,
      ),
    );
  logTransfer({
    requestId,
    stage: "objects_validated",
    productId,
    photoBytes: photoMeta.size,
    maskBytes: maskMeta.size,
    metadataBytes,
  });
  let photoBytes: ArrayBuffer, maskBytes: ArrayBuffer;
  try {
    [photoBytes, maskBytes] = await Promise.all([
      blobBytes(photoId),
      blobBytes(maskId),
    ]);
  } catch (error) {
    return fail("upload", 400, "The private images could not be read.", error);
  }
  const photoInfo =
      photoMeta.contentType === "image/jpeg"
        ? jpegSize(new Uint8Array(photoBytes))
        : null,
    maskInfo = pngSize(new Uint8Array(maskBytes));
  if (!photoInfo || !maskInfo)
    return fail(
      "validation",
      400,
      "The processed photo or mask is invalid.",
      new Error("Image signature or header validation failed"),
    );
  if (
    photoInfo.width !== maskInfo.width ||
    photoInfo.height !== maskInfo.height
  )
    return fail(
      "validation",
      400,
      "The mask must exactly match the processed photo.",
      new Error(
        `Mask dimension mismatch ${maskInfo.width}x${maskInfo.height} vs ${photoInfo.width}x${photoInfo.height}`,
      ),
    );
  if (
    photoInfo.width < 512 ||
    photoInfo.height < 512 ||
    photoInfo.width > MAX_DIMENSION ||
    photoInfo.height > MAX_DIMENSION ||
    photoInfo.width * photoInfo.height > 12000000
  )
    return fail(
      "validation",
      400,
      "Photo dimensions must be between 512 and 4096 pixels, with no more than 12 megapixels.",
      new Error(
        `Decoded dimensions rejected: ${photoInfo.width}x${photoInfo.height}`,
      ),
    );
  if (![4, 6].includes(maskInfo.colorType))
    return fail(
      "validation",
      400,
      "The mask must include transparency.",
      new Error(
        `Mask PNG color type ${maskInfo.colorType} has no alpha channel`,
      ),
    );
  const specs =
      typeof input.specs === "object" && input.specs
        ? (input.specs as Record<string, unknown>)
        : {},
    finish =
      typeof specs.finish === "string" &&
      product.finishes.includes(specs.finish)
        ? specs.finish
        : product.finishes[0],
    options = Array.isArray(specs.options)
      ? specs.options
          .filter(
            (value): value is string =>
              typeof value === "string" && product.options.includes(value),
          )
          .slice(0, 6)
      : [],
    measurements =
      typeof specs.measurements === "object" && specs.measurements
        ? specs.measurements
        : {},
    unit = specs.unit === "m" ? "meters" : "feet and inches";
  const prompt = [
    `Create a photorealistic after-installation architectural concept using the first image as the customer's home and editing only the transparent masked installation area.`,
    `Install this exact product type: ${product.label}. Verified product description: ${product.details}`,
    `Use the later images only as NEST product references. Match their construction language and proportions without copying their background.`,
    `Finish: ${finish}. Options: ${options.length ? options.join(", ") : "none selected"}. Provided measurements (${unit}): ${JSON.stringify(measurements)}.`,
    `Preserve the house, doors, windows, landscaping, people, furniture, camera position, crop, and all unmasked surroundings. Match perspective, mounting, real-world materials, daylight direction, contact shadows, reflections, and occlusion. Do not add text, labels, dimensions, logos, or watermarks. This is a design concept, not an engineering drawing and not necessarily to scale.`,
  ].join("\n");
  const outbound = new FormData();
  outbound.append(
    "model",
    process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst",
  );
  outbound.append(
    "image[]",
    new Blob([photoBytes], { type: photoMeta.contentType }),
    "project.jpg",
  );
  try {
    for (const [index, path] of product.referenceImages.entries()) {
      if (!/^\/projects\/[A-Za-z0-9._-]+$/.test(path))
        throw new Error("Unsafe product reference path");
      const reference = await fetch(new URL(path, request.url));
      if (!reference.ok)
        throw new Error(`Reference image returned HTTP ${reference.status}`);
      const bytes = Buffer.from(await reference.arrayBuffer());
      outbound.append(
        "image[]",
        new Blob([bytes], {
          type: reference.headers.get("content-type") || "image/jpeg",
        }),
        `reference-${index}.jpg`,
      );
    }
  } catch (error) {
    return fail(
      "image_generation",
      500,
      "A verified product reference could not be loaded.",
      error,
    );
  }
  outbound.append(
    "mask",
    new Blob([maskBytes], { type: "image/png" }),
    "mask.png",
  );
  outbound.append("prompt", prompt);
  outbound.append("quality", process.env.OPENAI_IMAGE_QUALITY || "medium");
  outbound.append("size", "auto");
  outbound.append("output_format", "jpeg");
  outbound.append("output_compression", "82");
  outbound.append("n", "1");
  logTransfer({
    requestId,
    stage: "provider_request",
    productId,
    photoBytes: photoBytes.byteLength,
    maskBytes: maskBytes.byteLength,
    metadataBytes,
  });
  recent.push(now);
  requests.set(key, recent);
  try {
    const response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: outbound,
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(55000)]),
      }),
      providerRequestId = response.headers.get("x-request-id");
    let result: {
      data?: { b64_json?: string }[];
      error?: { message?: string; code?: string };
    } = {};
    try {
      result = await response.json();
    } catch (error) {
      recent.pop();
      return fail(
        "image_generation",
        502,
        "The image service returned an unreadable response. Please retry.",
        error,
        null,
        providerRequestId,
      );
    }
    if (!response.ok || !result.data?.[0]?.b64_json) {
      recent.pop();
      const retryable = response.status >= 500 || response.status === 429;
      return fail(
        "image_generation",
        retryable ? 503 : 422,
        retryable
          ? "The image service is temporarily unavailable. Please retry."
          : "The image could not be generated from this request.",
        new Error(
          result.error?.message || `OpenAI returned HTTP ${response.status}`,
        ),
        result.error?.code,
        providerRequestId,
      );
    }
    const resultBytes = Buffer.from(result.data[0].b64_json, "base64");
    if (resultBytes.byteLength > RESULT_MAX_BYTES) {
      recent.pop();
      return fail(
        "image_generation",
        502,
        "The generated concept was too large to store safely. Please retry.",
        new Error(
          `Generated result size ${resultBytes.byteLength} exceeded ${RESULT_MAX_BYTES}`,
        ),
        null,
        providerRequestId,
      );
    }
    const owner = photoId.split("/")[1],
      stored = await put(
        `visualizer/${owner}/${requestId}/result.jpg`,
        resultBytes,
        {
          access: "private",
          contentType: "image/jpeg",
          addRandomSuffix: false,
          allowOverwrite: true,
          cacheControlMaxAge: 900,
        },
      );
    logTransfer({
      requestId,
      stage: "result_stored",
      productId,
      responseBytes: resultBytes.byteLength,
    });
    const payload = {
      imageUrl: signedResultUrl(stored.pathname),
      product: { id: product.id, label: product.label },
      specs: { finish, options, measurements, unit },
      disclaimer:
        "AI design concept — not to scale. Final design requires site measurement and engineering review.",
      requestId,
    };
    completed.set(requestId, { at: now });
    logTransfer({
      requestId,
      stage: "response_sent",
      productId,
      responseBytes: new TextEncoder().encode(JSON.stringify(payload))
        .byteLength,
    });
    return json(payload, 200, requestId);
  } catch (error) {
    recent.pop();
    return fail(
      "image_generation",
      504,
      request.signal.aborted
        ? "Generation was cancelled."
        : "Generation timed out. Please retry.",
      error,
    );
  }
}
