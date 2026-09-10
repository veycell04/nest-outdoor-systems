import { getProduct } from "../../../lib/products";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_DIMENSION = 4096;
const requests = new Map<string, number[]>();
const completed = new Map<string, { at: number }>();

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function pngSize(bytes: Uint8Array) {
  if (bytes.length < 33 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20), colorType: bytes[25] };
}

function cleanText(value: FormDataEntryValue | null, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return json({ error:"AI generation is not configured yet. You can still request a consultation." }, 503);
  const key = clientKey(request);
  const now = Date.now();
  for (const [id, entry] of completed) if (now - entry.at >= 15 * 60 * 1000) completed.delete(id);
  while (completed.size > 20) completed.delete(completed.keys().next().value as string);
  const recent = (requests.get(key) || []).filter((time) => now - time < 60 * 60 * 1000);
  if (recent.length >= 3) return json({ error:"Generation limit reached. Please try again later or request a consultation." }, 429);

  let data: FormData;
  try { data = await request.formData(); } catch { return json({ error:"The upload could not be read." }, 400); }
  const photo = data.get("photo");
  const mask = data.get("mask");
  const product = getProduct(cleanText(data.get("productId"), 50));
  const requestId = cleanText(data.get("requestId"), 100);
  if (!requestId) return json({ error:"Missing request identifier." }, 400);
  const prior = completed.get(requestId);
  if (prior && now - prior.at < 15 * 60 * 1000) return json({ error:"This generation request was already completed. Use the result already displayed or start a new request." }, 409);
  if (!(photo instanceof File) || !(mask instanceof File)) return json({ error:"A processed photo and installation-area mask are required." }, 400);
  if (!product) return json({ error:"Choose a valid NEST product." }, 400);
  if (product.referenceImages.length === 0) return json({ error:product.missingReference || "A verified product reference is not available." }, 422);
  if (photo.type !== "image/png" || mask.type !== "image/png" || photo.size > MAX_FILE_BYTES || mask.size > MAX_FILE_BYTES) return json({ error:"Processed images must be PNG files smaller than 6 MB." }, 413);

  const [photoBytes, maskBytes] = await Promise.all([photo.arrayBuffer(), mask.arrayBuffer()]);
  const photoInfo = pngSize(new Uint8Array(photoBytes));
  const maskInfo = pngSize(new Uint8Array(maskBytes));
  if (!photoInfo || !maskInfo) return json({ error:"The processed photo or mask is invalid." }, 400);
  if (photoInfo.width !== maskInfo.width || photoInfo.height !== maskInfo.height) return json({ error:"The mask must exactly match the processed photo." }, 400);
  if (photoInfo.width < 512 || photoInfo.height < 512 || photoInfo.width > MAX_DIMENSION || photoInfo.height > MAX_DIMENSION || photoInfo.width * photoInfo.height > 12_000_000) return json({ error:"Photo dimensions must be between 512 and 4096 pixels, with no more than 12 megapixels." }, 400);
  if (![4, 6].includes(maskInfo.colorType)) return json({ error:"The mask must include transparency." }, 400);

  let specs: Record<string, unknown> = {};
  try { specs = JSON.parse(cleanText(data.get("specs"), 4000)); } catch { return json({ error:"Product specifications are invalid." }, 400); }
  const allowedFinishes = product.finishes;
  const finish = typeof specs.finish === "string" && allowedFinishes.includes(specs.finish) ? specs.finish : allowedFinishes[0];
  const options = Array.isArray(specs.options) ? specs.options.filter((value): value is string => typeof value === "string" && product.options.includes(value)).slice(0, 6) : [];
  const measurements = typeof specs.measurements === "object" && specs.measurements ? specs.measurements : {};
  const unit = specs.unit === "m" ? "meters" : "feet and inches";
  const prompt = [
    `Create a photorealistic after-installation architectural concept using the first image as the customer's home and editing only the transparent masked installation area.`,
    `Install this exact product type: ${product.label}. Verified product description: ${product.details}`,
    `Use the later images only as NEST product references. Match their construction language and proportions without copying their background.`,
    `Finish: ${finish}. Options: ${options.length ? options.join(", ") : "none selected"}. Provided measurements (${unit}): ${JSON.stringify(measurements)}.`,
    `Preserve the house, doors, windows, landscaping, people, furniture, camera position, crop, and all unmasked surroundings. Match perspective, mounting, real-world materials, daylight direction, contact shadows, reflections, and occlusion. Do not add text, labels, dimensions, logos, or watermarks. This is a design concept, not an engineering drawing and not necessarily to scale.`,
  ].join("\n");

  const outbound = new FormData();
  outbound.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-sunburst");
  outbound.append("image[]", new Blob([photoBytes], { type:"image/png" }), "project.png");
  for (const [index, path] of product.referenceImages.entries()) {
    const reference = await fetch(new URL(path, request.url));
    if (!reference.ok) return json({ error:"A verified product reference could not be loaded." }, 500);
    outbound.append("image[]", new Blob([await reference.arrayBuffer()], { type:reference.headers.get("content-type") || "image/jpeg" }), `reference-${index}.jpg`);
  }
  outbound.append("mask", new Blob([maskBytes], { type:"image/png" }), "mask.png");
  outbound.append("prompt", prompt);
  outbound.append("quality", process.env.OPENAI_IMAGE_QUALITY || "medium");
  outbound.append("size", "auto");
  outbound.append("output_format", "jpeg");
  outbound.append("output_compression", "88");
  outbound.append("n", "1");

  recent.push(now); requests.set(key, recent);
  const timeout = AbortSignal.timeout(55_000);
  try {
    const response = await fetch("https://api.openai.com/v1/images/edits", { method:"POST", headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}` }, body:outbound, signal:AbortSignal.any([request.signal, timeout]) });
    const result = await response.json() as { data?: { b64_json?: string }[]; error?: { message?: string; code?: string } };
    if (!response.ok || !result.data?.[0]?.b64_json) {
      recent.pop();
      const retryable = response.status >= 500 || response.status === 429;
      return json({ error:retryable ? "The image service is temporarily unavailable. This attempt was not saved; you may retry." : "The image could not be generated from this request.", retryable }, retryable ? 503 : 422);
    }
    const payload = { image:`data:image/jpeg;base64,${result.data[0].b64_json}`, product:{ id:product.id, label:product.label }, specs:{ finish, options, measurements, unit }, disclaimer:"AI design concept — not to scale. Final design requires site measurement and engineering review." };
    completed.set(requestId, { at:now });
    return json(payload);
  } catch (error) {
    recent.pop();
    return json({ error:error instanceof DOMException && error.name === "AbortError" ? "Generation was cancelled." : "Generation timed out. This attempt was not saved; you may retry.", retryable:true }, 504);
  }
}
