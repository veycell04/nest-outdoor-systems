import { get, head, put } from "@vercel/blob";
import { createHash } from "node:crypto";
import { getProduct, getProductDisplayImage } from "../../../lib/products";
import {
  addOnIds,
  addOnLabels,
  compatibility,
  isPrimarySystemId,
  type AddOnId,
} from "../../../lib/visualizer-design";
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
export const maxDuration = 180;
const MAX_DIMENSION = 4096,
  requests = new Map<string, number[]>(),
  completed = new Map<string, { at: number }>();
const expectedAddOnReferences: Partial<Record<AddOnId, string>> = {
  zip: "/projects/elevated-zip-screen.jpeg",
  ceiling_zip: "/projects/elevated-ceiling-zip.png",
  sliding_glass: "/projects/elevated-sliding-glass.png",
  guillotine: "/projects/elevated-guillotine-glass.jpeg",
  solidroll: "/projects/elevated-solidroll.jpg",
};
export function generationCacheKey(
  photoBytes: ArrayBuffer,
  maskBytes: ArrayBuffer,
  configuration: Record<string, unknown>,
) {
  return createHash("sha256")
    .update("customer-photo-edit-v7-fast-preview-model")
    .update(Buffer.from(photoBytes))
    .update(Buffer.from(maskBytes))
    .update(JSON.stringify(configuration))
    .digest("hex");
}
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
  if (!isPrimarySystemId(product.id))
    return fail(
      "validation",
      400,
      "Choose a primary NEST outdoor system.",
      new Error("An add-on product cannot be used as the primary system"),
    );
  const primaryProductId = product.id;
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
    requestedAddOns = Array.isArray(specs.addOnIds)
      ? specs.addOnIds.filter(
          (value): value is AddOnId =>
            typeof value === "string" && addOnIds.includes(value as AddOnId),
        )
      : [],
    selectedAddOns = requestedAddOns
      .filter((id) => compatibility[primaryProductId].includes(id))
      .slice(0, 3),
    addOnProducts = selectedAddOns
      .filter((id) => id !== "led")
      .map((id) => getProduct(id))
      .filter((value) => Boolean(value)),
    frameColor = cleanText(specs.frameColor, 100) || "Not specified",
    louverColor = cleanText(specs.louverColor, 100) || null,
    zipFabricColor = cleanText(specs.zipFabricColor, 100) || null,
    fabricColor = cleanText(specs.fabricColor, 100) || null,
    glassSystemColor = cleanText(specs.glassSystemColor, 100) || null,
    ledTemperature = selectedAddOns.includes("led")
      ? cleanText(specs.ledTemperature, 40) || "Warm White"
      : null,
    ledPlacement = selectedAddOns.includes("led")
      ? cleanText(specs.ledPlacement, 50) || "Perimeter LED"
      : null,
    colorsDiffer = Boolean(
      louverColor &&
        frameColor.toLocaleLowerCase() !== louverColor.toLocaleLowerCase(),
    ),
    editMode = specs.editMode === "color_update" ? "color_update" : "install",
    colorTarget = ["frame", "louver", "zip_fabric", "fabric", "glass_system", "frame_and_matching_louvers"].includes(String(specs.colorTarget))
      ? String(specs.colorTarget)
      : null,
    requestedQuality = specs.quality === "high" ? "high" : "preview",
    providerModel = requestedQuality === "high"
      ? process.env.OPENAI_IMAGE_HIGH_QUALITY_MODEL ||
        process.env.OPENAI_IMAGE_MODEL ||
        "gpt-image-2.5-sunburst"
      : process.env.OPENAI_IMAGE_PREVIEW_MODEL || "gpt-image-2.5-flare",
    projectId = cleanText(input.projectId, 100) || cleanText(specs.projectId, 100) || requestId,
    viewId = ["front", "left", "right"].includes(String(input.viewId || specs.viewId)) ? String(input.viewId || specs.viewId) : "front",
    viewLabel = cleanText(input.viewLabel, 40) || cleanText(specs.viewLabel, 40) || "Front View",
    sharedDesignFingerprint = cleanText(input.sharedDesignFingerprint, 100) || cleanText(specs.sharedDesignFingerprint, 100) || "single-view-legacy",
    generationOrder = Number.isInteger(specs.generationOrder) ? Number(specs.generationOrder) : 1,
    options = selectedAddOns.map((id) => addOnLabels[id]),
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
    cacheConfiguration = {
          productId,
          selectedAddOns,
          frameColor,
          louverColor,
          zipFabricColor,
          fabricColor,
          glassSystemColor,
          ledTemperature,
          ledPlacement,
          measurements,
          placement,
          unit,
          requestedQuality,
          editMode,
          colorTarget,
          projectId,
          viewId,
          sharedDesignFingerprint,
        },
    cacheKey = generationCacheKey(photoBytes, maskBytes, cacheConfiguration),
    cachedPath = `visualizer/${owner}/cache/${cacheKey}/result.jpg`;
  const missingOrInvalidReference = addOnProducts.find((addOn) => {
    const expected = expectedAddOnReferences[addOn!.id as AddOnId];
    return !expected || addOn!.referenceImages.length !== 1 || addOn!.referenceImages[0] !== expected;
  });
  if (
    addOnProducts.length !== selectedAddOns.filter((id) => id !== "led").length ||
    missingOrInvalidReference
  )
    return fail(
      "validation",
      500,
      "A selected add-on reference is not configured correctly.",
      new Error(`Add-on reference mapping mismatch: ${missingOrInvalidReference?.id || "missing catalog product"}`),
    );
  const referencePaths = [
    ...product.referenceImages,
    ...addOnProducts.flatMap((addOn) => addOn!.referenceImages),
  ],
    providerReferencePaths = [product, ...addOnProducts]
      .map((referenceProduct) => getProductDisplayImage(referenceProduct!));
  logTransfer({
    requestId,
    stage: "configuration_validated",
    productId,
    selectedAddOns,
    referencePaths,
    providerReferencePaths,
    projectId,
    viewId,
    generationOrder,
  });
  try {
    const cached = await head(cachedPath);
    const payload = {
      imageUrl: signedResultUrl(cached.pathname),
      product: { id: product.id, label: product.label },
      specs: {
        frameColor,
        louverColor,
        zipFabricColor,
        fabricColor,
        glassSystemColor,
        selectedAddOns,
        referencePaths,
        projectId,
        viewId,
        viewLabel,
        sharedDesignFingerprint,
        options,
        measurements,
        unit,
      },
      disclaimer:
        "Concept visualization only. Final compatibility, engineering, dimensions, finishes and color availability are confirmed during consultation.",
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
  const editInstruction =
    "Edit the customer’s uploaded photograph only. Install the selected NEST product realistically within the identified installation area. Preserve the original building, storefront, windows, doors, ground, signage, perspective and surroundings outside the installation area. The catalog product image is reference-only and must never replace the customer photo.";
  const referenceRoles = [
    `Image 3: ${product.label} — primary-system appearance reference only.`,
    ...addOnProducts.map(
      (addOn, index) =>
        `Image ${index + 4}: ${addOn!.label} — add-on appearance reference only.`,
    ),
  ].join(" ");
  const mandatoryAddOnInstructions = selectedAddOns.map((id) => ({
    zip: "MANDATORY VERTICAL ZIP SCREEN INSTALLATION: Install the selected Vertical ZIP Screen visibly within the marked area, with tensioned screen fabric, cassette, and side guides.",
    ceiling_zip: "MANDATORY CEILING ZIP SCREEN INSTALLATION: Install the selected Ceiling ZIP Screen visibly beneath the roof opening, with its tensioned horizontal fabric and guide system.",
    sliding_glass: "MANDATORY SLIDING GLASS INSTALLATION: Install the selected transparent sliding glass panels visibly around the relevant open side, with slim frames and stacking tracks.",
    guillotine: "MANDATORY GUILLOTINE GLASS INSTALLATION: Install the selected motorized vertically moving framed glass panels visibly beneath the perimeter beams around the relevant open side.",
    solidroll: "MANDATORY SOLIDROLL INSTALLATION: Install a clearly visible Solidroll motorized vertical glass enclosure inside the marked installation area. Place transparent framed glass panels between the pergola posts and directly beneath the perimeter beams. Show the recognizable horizontal moving-panel divisions, slim aluminum side guides, rails and mullions from the Solidroll reference image. Keep the glass transparent with realistic reflections. Solidroll must enclose the relevant open pergola side; it must not be replaced by an ordinary window, railing, ZIP screen, Guillotine Glass or open space. Preserve the primary pergola and add Solidroll to it—the add-on must not replace the pergola.",
    led: "MANDATORY INTEGRATED LED INSTALLATION: Install the selected integrated LED lighting visibly in the specified structural location and temperature without changing the product geometry.",
  }[id])).join(" ");
  const colorTargetInstructions: Record<string, string> = {
    frame: `Recolor only the structural frame zones to ${frameColor}.`,
    louver: `Recolor only the louver blades or moving roof panels to ${louverColor || frameColor}.`,
    zip_fabric: `Recolor only the ZIP screen fabric to ${zipFabricColor || "the requested color"}; keep its cassette and guide rails ${frameColor}.`,
    fabric: `Recolor only the awning, PVC, or other fabric or membrane to ${fabricColor || "the requested color"}.`,
    glass_system: `Recolor only the selected glass system's frames, rails, and mullions to ${glassSystemColor || frameColor}; do not tint or recolor the glass panes.`,
    frame_and_matching_louvers: `Recolor the structural frame zones and the matching louver blades or moving roof panels to ${frameColor}, keeping their material boundaries distinct.`,
  };
  const colorTargetInstruction = colorTargetInstructions[colorTarget || ""];
  const generationTask = editMode === "color_update"
    ? [
        "Image 1 is the existing generated NEST concept and the only edit target.",
        colorTargetInstruction || "Recolor only the requested product component.",
        "Recolor only the requested product component. Do not redesign, move, resize, replace, regenerate, or remove the installed system.",
        "Do not change the customer’s building, background, crop, perspective, lighting, measurements, installation geometry, position, scale, add-ons, or other selected products.",
      ].join(" ")
    : editInstruction;
  const pvcEnclosureInstructions = primaryProductId === "pvc"
    ? [
        selectedAddOns.includes("guillotine")
          ? "Build the Classic PVC Pergola first, then install Guillotine Glass beneath its roof and around its open sides, aligned to the pergola structure."
          : null,
        selectedAddOns.includes("solidroll")
          ? "Build the Classic PVC Pergola first, then install Solidroll around its open sides beneath the PVC roof, aligned to the pergola structure. Keep the PVC roof fabric, pergola structural frame, and Solidroll enclosure visually distinct."
          : null,
      ].filter(Boolean).join(" ")
    : "";
  const prompt = [
    `Image 1 is the customer's property photo and the only edit target. Image 2 is the four-corner polygon mask and restricts every modification to its transparent editable region. ${referenceRoles}`,
    generationTask,
    `MULTI-ANGLE CONSISTENCY: This photograph is the ${viewLabel} of the same customer project (${projectId}). Preserve exactly the selected primary system, selected add-ons, frame construction, roof construction, component colors, glass configuration and lighting configuration across every project view. Change only camera perspective and the portions naturally visible from this angle. Shared design fingerprint: ${sharedDesignFingerprint}. Every selected add-on remains mandatory where its installation side is naturally visible; do not force invisible rear components into the photograph when they are naturally occluded.`,
    editMode === "color_update"
      ? `Keep the installed ${product.label} and every installed add-on unchanged except for the requested color zone: ${options.length ? options.join(", ") : "none"}. Solidroll and every other installed product must remain clearly visible and must not be removed, replaced, redesigned, moved, or regenerated.`
      : `Install the primary system first: ${product.label}. Verified description: ${product.details}. Then install these selected add-ons: ${options.length ? options.join(", ") : "none"}. Every selected add-on must be clearly and visibly installed in the final concept. The result is invalid if any selected add-on is missing. ${mandatoryAddOnInstructions} ${pvcEnclosureInstructions}`,
    `Four-corner installation polygon coordinates: ${JSON.stringify(placement)}.`,
    editMode === "color_update"
      ? "Keep the existing structure size and footprint exactly unchanged."
      : "REFINED POLYGON FIT: The provided coordinates are an intentionally inset construction footprint inside the customer's visible selection. Keep the entire finished structure within this effective polygon. Align its outer posts and roof perimeter close to these corners in the photograph's perspective without expanding back toward the customer's outer points. Use elegant, slender structural proportions, balanced post spacing, realistic headroom, and appropriately thin perimeter beams and roof components. Avoid bulky, oversized, squat, or cramped geometry. Integrate the system cleanly with the existing architecture and preserve entrances, walking clearance, and the surrounding property.",
    `Use every product reference only for construction, materials, finish, and proportions. Never copy, composite, recreate, or return any reference-image property or background.`,
    `STRICT COLOR ZONES: Apply frame color ${frameColor} only to posts, columns, perimeter beams, gutters, and structural rails. Apply louver or roof color ${louverColor || "not applicable"} only to louver blades or moving roof panels. Apply ZIP fabric color ${zipFabricColor || "not applicable"} only to screen fabric; every ZIP cassette and guide rail must use the frame color ${frameColor}. Apply awning, PVC, or other fabric color ${fabricColor || "not applicable"} only to fabric or membrane surfaces. Apply glass-system frame color ${glassSystemColor || "not applicable"} only to the selected glass enclosure's frames, rails, and mullions; keep glass panes transparent and natural. Do not spread any component color into another material zone.`,
    colorsDiffer
      ? `The frame and louver colors are intentionally different. Preserve a clearly visible two-tone result: structural frame zones must remain ${frameColor}, while louver blades or moving roof panels must remain ${louverColor}. Never let the most recently listed color overwrite both materials.`
      : `Keep each specified color confined to its defined component zone, even where selected colors match.`,
    `LED temperature: ${ledTemperature || "not selected"}. LED placement: ${ledPlacement || "not selected"}. Provided measurements (${unit}): ${JSON.stringify(measurements)}.`,
    `Preserve every pixel outside the placement mask, including the customer's building, windows, doors, ground, landscaping, people, furniture, perspective, camera position, crop, and surroundings. Infer product rotation and perspective from Image 1 and the placement area. Match mounting, daylight direction, contact shadows, reflections, and occlusion. Do not add text, labels, dimensions, logos, or watermarks. This is a design concept, not an engineering drawing and not necessarily to scale.`,
  ].join("\n");
  const outbound = new FormData();
  outbound.append(
    "model",
    providerModel,
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
    for (const [index, path] of providerReferencePaths.entries()) {
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
    logTransfer({
      requestId,
      stage: "references_loaded",
      productId,
      selectedAddOns,
      referencePaths,
      providerReferencePaths,
      projectId,
      viewId,
      generationOrder,
    });
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
  outbound.append(
    "size",
    photoInfo.width > photoInfo.height
      ? "1536x1024"
      : photoInfo.height > photoInfo.width
        ? "1024x1536"
        : "1024x1024",
  );
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
    selectedAddOns,
    referencePaths,
    providerReferencePaths,
    providerModel,
    projectId,
    viewId,
    generationOrder,
  });
  recent.push(now);
  requests.set(key, recent);
  try {
    const response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: outbound,
        // Leave enough time after the provider responds to validate and store
        // the generated concept before Vercel reaches maxDuration.
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(150000)]),
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
      specs: {
        frameColor,
        louverColor,
        zipFabricColor,
        fabricColor,
        glassSystemColor,
        selectedAddOns,
        referencePaths,
        projectId,
        viewId,
        viewLabel,
        sharedDesignFingerprint,
        options,
        measurements,
        unit,
      },
      disclaimer:
        "Concept visualization only. Final compatibility, engineering, dimensions, finishes and color availability are confirmed during consultation.",
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
