import { get, head, put } from "@vercel/blob";
import { createHash } from "node:crypto";
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
export const maxDuration = 100;
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
    legacyOptions = Array.isArray(specs.options)
      ? specs.options
          .filter(
            (value): value is string =>
              typeof value === "string" && product.options.includes(value),
          )
          .slice(0, 6)
      : [],
    structure =
      specs.structure === "freestanding" ? "freestanding" : "attached",
    lighting = specs.lighting === true,
    screens = specs.screens === true,
    roofOpen = Math.max(0, Math.min(100, Number(specs.roofOpen) || 0)),
    requestedQuality = specs.quality === "high" ? "high" : "preview",
    options = [
      ...legacyOptions,
      structure === "freestanding" ? "Freestanding" : "Attached",
      ...(lighting ? ["Integrated lighting"] : []),
      ...(screens ? ["ZIP screens"] : []),
      `Roof ${roofOpen}% open`,
    ],
    measurements =
      typeof specs.measurements === "object" && specs.measurements
        ? specs.measurements
        : {},
    placement =
      typeof specs.placement === "object" && specs.placement
        ? specs.placement
        : null,
    unit = specs.unit === "m" ? "meters" : "feet and inches",
    owner = photoId.split("/")[1],
    cacheKey = createHash("sha256")
      .update("customer-photo-edit-v2-solidroll-boundaries")
      .update(Buffer.from(photoBytes))
      .update(Buffer.from(maskBytes))
      .update(
        JSON.stringify({
          productId,
          finish,
          structure,
          lighting,
          screens,
          roofOpen,
          measurements,
          placement,
          unit,
          requestedQuality,
        }),
      )
      .digest("hex"),
    cachedPath = `visualizer/${owner}/cache/${cacheKey}/result.jpg`;
  try {
    const cached = await head(cachedPath);
    const payload = {
      imageUrl: signedResultUrl(cached.pathname),
      product: { id: product.id, label: product.label },
      specs: { finish, options, measurements, unit },
      disclaimer:
        "Concept visualization — final design, engineering and dimensions require professional verification.",
      requestId,
      cached: true,
    };
    logTransfer({
      requestId,
      stage: "cache_hit",
      productId,
      responseUrl: payload.imageUrl,
      responseBytes: new TextEncoder().encode(JSON.stringify(payload))
        .byteLength,
    });
    return json(payload, 200, requestId);
  } catch {
    // A cache miss is expected. Generation continues below.
  }
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
  const productInstruction =
    product.id === "solidroll"
      ? "Edit the customer photo only. Install a Solidroll motorized vertical glass enclosure inside the marked storefront opening. Preserve everything outside the marked installation area. The product reference image is appearance guidance only and must not replace the customer photo."
      : "Edit Image 1 only. Install the selected product inside the marked area. Image 3 is reference-only and must never replace the customer's property or background.";
  const prompt = [
    `Image 1 is the customer's property photo and the only edit target. Image 2 is the placement mask and restricts every modification to its transparent marked area. Image 3 and any later images are product appearance references only.`,
    productInstruction,
    `Install this exact product type: ${product.label}. Verified product description: ${product.details}`,
    product.id === "solidroll"
      ? `Treat the marked area's left boundary as the pink vertical height line and its bottom boundary as the green horizontal width line. Fit the Solidroll realistically across that storefront window opening. Preserve the storefront, brick, windows, sidewalk, signage, camera angle, mounting surfaces, and surroundings. Marked placement coordinates: ${JSON.stringify(placement)}.`
      : `Marked placement coordinates: ${JSON.stringify(placement)}.`,
    `Use the product reference only for the product's construction, materials, finish, and proportions. Never copy, composite, recreate, or return any reference-image building, background, ground, landscaping, furniture, sky, or surroundings.`,
    `Finish: ${finish}. Options: ${options.length ? options.join(", ") : "none selected"}. Provided measurements (${unit}): ${JSON.stringify(measurements)}.`,
    `Preserve every pixel outside the placement mask, including the customer's building, windows, doors, ground, landscaping, people, furniture, perspective, camera position, crop, and surroundings. Infer product rotation and perspective from Image 1 and the placement area. Match mounting, daylight direction, contact shadows, reflections, and occlusion. Do not add text, labels, dimensions, logos, or watermarks. This is a design concept, not an engineering drawing and not necessarily to scale.`,
  ].join("\n");
  const outbound = new FormData();
  outbound.append(
    "model",
    process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst",
  );
  outbound.append(
    "image[]",
    new Blob([photoBytes], { type: photoMeta.contentType }),
    "image-1-customer-edit-target.jpg",
  );
  outbound.append(
    "mask",
    new Blob([maskBytes], { type: "image/png" }),
    "image-2-placement-mask.png",
  );
  const referenceHashes: string[] = [];
  try {
    for (const [index, path] of product.referenceImages.entries()) {
      if (!/^\/(?:projects|media)\/[A-Za-z0-9._-]+$/.test(path))
        throw new Error("Unsafe product reference path");
      const reference = await fetch(new URL(path, request.url));
      if (!reference.ok)
        throw new Error(`Reference image returned HTTP ${reference.status}`);
      const bytes = Buffer.from(await reference.arrayBuffer());
      referenceHashes.push(createHash("sha256").update(bytes).digest("hex"));
      outbound.append(
        "image[]",
        new Blob([bytes], {
          type: reference.headers.get("content-type") || "image/jpeg",
        }),
        `image-${index + 3}-product-reference-only${path.endsWith(".png") ? ".png" : ".jpg"}`,
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
  outbound.append("prompt", prompt);
  outbound.append(
    "quality",
    requestedQuality === "high"
      ? process.env.OPENAI_IMAGE_HIGH_QUALITY || "high"
      : process.env.OPENAI_IMAGE_PREVIEW_QUALITY || "low",
  );
  outbound.append("size", "auto");
  outbound.append("input_fidelity", "high");
  outbound.append("output_format", "jpeg");
  outbound.append(
    "output_compression",
    requestedQuality === "high" ? "92" : "78",
  );
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
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(88000)]),
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
    const resultHash = createHash("sha256").update(resultBytes).digest("hex");
    if (referenceHashes.includes(resultHash)) {
      recent.pop();
      return fail(
        "image_generation",
        502,
        "The image service returned an invalid concept. Please retry.",
        new Error("Generated output exactly matched a catalog reference image"),
        null,
        providerRequestId,
      );
    }
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
    const stored = await put(cachedPath, resultBytes, {
      access: "private",
      contentType: "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 900,
    });
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
        "Concept visualization — final design, engineering and dimensions require professional verification.",
      requestId,
      cached: false,
    };
    completed.set(requestId, { at: now });
    logTransfer({
      requestId,
      stage: "response_sent",
      productId,
      responseUrl: payload.imageUrl,
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
