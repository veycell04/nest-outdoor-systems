import { createRequestId, customerError, logFailure } from "../../../../lib/server-log";
import { readSession } from "../../../../lib/visualizer-storage";

export const runtime = "nodejs";
export const maxDuration = 30;

type ViewId = "left" | "front" | "right";
type Assignment = { uploadId: string; view: ViewId; confidence: number };
const requests = new Map<string, number[]>();
const uploadIdPattern = /^[A-Za-z0-9_-]{8,100}$/;

export function validateViewClassification(value: unknown, uploadIds: string[]) {
  if (!value || typeof value !== "object") return null;
  const result = value as { sameLocation?: unknown; assignments?: unknown };
  if (typeof result.sameLocation !== "boolean" || !Array.isArray(result.assignments)) return null;
  const assignments = result.assignments as Assignment[];
  if (assignments.length !== uploadIds.length) return null;
  const ids = new Set<string>(), views = new Set<ViewId>();
  for (const assignment of assignments) {
    if (!assignment || !uploadIds.includes(assignment.uploadId) || ids.has(assignment.uploadId)) return null;
    if (!["left", "front", "right"].includes(assignment.view) || views.has(assignment.view)) return null;
    if (typeof assignment.confidence !== "number" || assignment.confidence < 0 || assignment.confidence > 1) return null;
    ids.add(assignment.uploadId);
    views.add(assignment.view);
  }
  return { sameLocation: result.sameLocation, assignments };
}

export async function POST(request: Request) {
  const startedAt = Date.now(), requestId = createRequestId(request.headers.get("x-request-id"));
  const fail = (status: number, message: string, error: unknown, providerRequestId?: string | null) => {
    logFailure({ requestId, stage: "validation", startedAt, status, error, providerRequestId });
    return customerError(message, requestId, status);
  };
  if (!readSession(request)) return fail(401, "Your secure visualizer session expired. Please retry.", new Error("Missing visualizer session"));
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_VISION_MODEL)
    return fail(503, "Angle classification is temporarily unavailable.", new Error("OpenAI vision configuration is incomplete"));
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous",
    now = Date.now(), recent = (requests.get(key) || []).filter((time) => now - time < 60 * 60 * 1000);
  if (recent.length >= 12) return fail(429, "Angle classification is temporarily unavailable. Please confirm the angles manually.", new Error("Classification rate limit reached"));
  let form: FormData;
  try { form = await request.formData(); }
  catch (error) { return fail(400, "The project photos could not be read.", error); }
  const photos = form.getAll("photos"), uploadIds = form.getAll("uploadIds").map(String);
  if (photos.length < 1 || photos.length > 3 || photos.length !== uploadIds.length || new Set(uploadIds).size !== uploadIds.length || uploadIds.some((id) => !uploadIdPattern.test(id)))
    return fail(400, "Choose between one and three valid project photos.", new Error("Invalid classification metadata"));
  if (photos.some((photo) => !(photo instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(photo.type) || photo.size > 1_500_000))
    return fail(400, "One analysis photo was invalid or too large.", new Error("Invalid analysis image"));
  const imageParts = await Promise.all(photos.map(async (photo, index) => ({
    type: "input_image",
    detail: "low",
    image_url: `data:${(photo as File).type};base64,${Buffer.from(await (photo as File).arrayBuffer()).toString("base64")}`,
    upload_id: uploadIds[index],
  })));
  const content: Record<string, unknown>[] = [{
    type: "input_text",
    text: `Analyze these ${photos.length} photographs together. They should show the same property or installation area. Match each image to its supplied upload_id using shared walls, windows, doors, perspective, and camera position. Assign unique relative angles left, front, or right. Do not use filenames or input order. For one photo, assign front. For two or three photos, ensure every assigned angle is unique and include front as the most frontal view. Set sameLocation false if the photos do not appear to show the same place. Confidence must be 0 through 1.`,
  }];
  imageParts.forEach(({ upload_id, ...image }) => {
    content.push({ type: "input_text", text: `upload_id: ${upload_id}` }, image);
  });
  let provider: Response;
  try {
    provider = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL,
        store: false,
        input: [{ role: "user", content }],
        text: { format: { type: "json_schema", name: "project_view_classification", strict: true, schema: {
          type: "object", additionalProperties: false, required: ["sameLocation", "assignments"], properties: {
            sameLocation: { type: "boolean" },
            assignments: { type: "array", minItems: photos.length, maxItems: photos.length, items: {
              type: "object", additionalProperties: false, required: ["uploadId", "view", "confidence"], properties: {
                uploadId: { type: "string", enum: uploadIds }, view: { type: "string", enum: ["left", "front", "right"] }, confidence: { type: "number", minimum: 0, maximum: 1 },
              },
            } },
          },
        } } },
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) { return fail(502, "Angle classification is temporarily unavailable.", error); }
  const body = await provider.json().catch(() => null) as Record<string, unknown> | null,
    providerRequestId = provider.headers.get("x-request-id");
  if (!provider.ok) return fail(502, "Angle classification is temporarily unavailable.", new Error(`OpenAI classification failed with ${provider.status}`), providerRequestId);
  const outputText = typeof body?.output_text === "string" ? body.output_text : Array.isArray(body?.output)
    ? (body.output as Array<{ content?: Array<{ text?: string }> }>).flatMap((item) => item.content || []).map((item) => item.text || "").join("") : "";
  let parsed: unknown;
  try { parsed = JSON.parse(outputText); }
  catch (error) { return fail(502, "Angle classification returned an invalid response.", error, providerRequestId); }
  const rawAssignments = parsed && typeof parsed === "object" && Array.isArray((parsed as { assignments?: unknown }).assignments)
    ? (parsed as { assignments: Array<{ view?: unknown }> }).assignments : [],
    rawViews = rawAssignments.map((assignment) => assignment?.view).filter((view): view is string => typeof view === "string");
  if (new Set(rawViews).size !== rawViews.length)
    return fail(409, "Two photos appear to show the same angle. Please confirm the angle labels.", new Error("Duplicate classified view"), providerRequestId);
  const result = validateViewClassification(parsed, uploadIds);
  if (!result) return fail(502, "Angle classification returned an invalid response.", new Error("Classification schema validation failed"), providerRequestId);
  recent.push(now); requests.set(key, recent);
  console.info(JSON.stringify({ event: "nest_view_classification", requestId, photoCount: photos.length, sameLocation: result.sameLocation, views: result.assignments.map(({ view, confidence }) => ({ view, confidence })), providerRequestId }));
  return Response.json(result, { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } });
}
