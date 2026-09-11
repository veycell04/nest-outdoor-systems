"use client";

import {
  Download,
  Eraser,
  ImagePlus,
  MousePointer2,
  Redo2,
  Send,
  Sparkles,
  SquareDashedMousePointer,
  Undo2,
  X,
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { upload } from "@vercel/blob/client";
import { products, type ProductDefinition } from "../lib/products";

export type VisualizerHandoff = {
  productId: string;
  context: string;
  conceptImage?: string;
};
type Tool = "brush" | "polygon";
type Point = { x: number; y: number };
type Mark = { type: Tool; points: Point[]; size: number };
type Concept = {
  image: string;
  productId: string;
  productLabel: string;
  measurements: Record<string, string>;
  unit: "ft" | "m";
  finish: string;
  options: string[];
};
const colors: Record<string, string> = {
  Anthracite: "#303332",
  Bronze: "#6d5a48",
  White: "#deddd8",
};

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))),
      "image/png",
    ),
  );
const toJpeg = (canvas: HTMLCanvasElement, quality = 0.82) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Photo compression failed")),
      "image/jpeg",
      quality,
    ),
  );
function draw(ctx: CanvasRenderingContext2D, mark: Mark, mask = false) {
  if (!mark.points.length) return;
  ctx.save();
  ctx.strokeStyle = mask ? "#000" : "rgba(216,176,142,.88)";
  ctx.fillStyle = mask ? "#000" : "rgba(216,176,142,.56)";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = mark.size;
  ctx.beginPath();
  ctx.moveTo(mark.points[0].x, mark.points[0].y);
  mark.points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  if (mark.type === "polygon" && mark.points.length > 2) {
    ctx.closePath();
    ctx.fill();
  } else ctx.stroke();
  ctx.restore();
}
const title = (value: string) => value[0].toUpperCase() + value.slice(1);
export function mapPointerToCanvas(
  canvas: HTMLCanvasElement | null,
  clientX: number,
  clientY: number,
) {
  if (!canvas || !canvas.isConnected) return null;
  const rect = canvas.getBoundingClientRect();
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    canvas.width <= 0 ||
    canvas.height <= 0
  )
    return null;
  return {
    x: ((clientX - rect.left) * canvas.width) / rect.width,
    y: ((clientY - rect.top) * canvas.height) / rect.height,
  };
}

export function ProjectVisualizer({
  onRequestProject,
}: {
  onRequestProject: (handoff: VisualizerHandoff) => void;
}) {
  const [photo, setPhoto] = useState<{
      file: File;
      url: string;
      normalized: Blob;
      originalBytes: number;
    } | null>(null),
    [processed, setProcessed] = useState<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<Tool>("brush"),
    [brush, setBrush] = useState(54),
    [marks, setMarks] = useState<Mark[]>([]),
    [redo, setRedo] = useState<Mark[]>([]),
    [draft, setDraft] = useState<Point[]>([]),
    [drawing, setDrawing] = useState(false);
  const [systemId, setSystemId] = useState("bioclimatic_double"),
    [finish, setFinish] = useState("Anthracite"),
    [options, setOptions] = useState<string[]>([]),
    [unit, setUnit] = useState<"ft" | "m">("ft"),
    [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [status, setStatus] = useState(""),
    [generating, setGenerating] = useState(false),
    [result, setResult] = useState<Concept | null>(null),
    [compare, setCompare] = useState(50);
  const canvasRef = useRef<HTMLCanvasElement>(null),
    abortRef = useRef<AbortController | null>(null),
    activePointerRef = useRef<number | null>(null);
  const selected = useMemo(
    () => products.find((p) => p.id === systemId) || products[0],
    [systemId],
  );
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );
  useEffect(
    () => () => {
      abortRef.current?.abort();
      const canvas = canvasRef.current,
        pointerId = activePointerRef.current;
      if (canvas && pointerId !== null && canvas.hasPointerCapture(pointerId))
        canvas.releasePointerCapture(pointerId);
    },
    [],
  );
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !processed) return;
    canvas.width = processed.width;
    canvas.height = processed.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    marks.forEach((m) => draw(ctx, m));
    if (draft.length) draw(ctx, { type: tool, points: draft, size: brush });
  }, [processed, marks, draft, tool, brush]);

  async function choosePhoto(file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 30 * 1024 * 1024
    ) {
      setStatus("Choose a JPG, PNG, or WEBP photo smaller than 30 MB.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      if (bitmap.width < 512 || bitmap.height < 512) throw 0;
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height)),
        canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas
        .getContext("2d")
        ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      let quality = 0.8,
        normalized = await toJpeg(canvas, quality);
      while (normalized.size > 2.5 * 1024 * 1024 && quality > 0.42) {
        quality -= 0.08;
        normalized = await toJpeg(canvas, quality);
      }
      if (normalized.size > 2.5 * 1024 * 1024)
        throw new Error("normalized-too-large");
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto({
        file,
        url: URL.createObjectURL(normalized),
        normalized,
        originalBytes: file.size,
      });
      setProcessed(canvas);
      setMarks([]);
      setRedo([]);
      setDraft([]);
      setResult(null);
      setStatus(
        `Photo normalized to ${canvas.width} × ${canvas.height}. Mark only the installation area.`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error && error.message === "normalized-too-large"
          ? "This photo is too large to process. Please choose another photo."
          : "This image could not be decoded. Try another photo at least 512 × 512 pixels.",
      );
    }
  }
  function down(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!processed) return;
    const canvas = e.currentTarget,
      clientX = e.clientX,
      clientY = e.clientY,
      pointerId = e.pointerId,
      p = mapPointerToCanvas(canvas, clientX, clientY);
    if (!p) {
      setStatus(
        "The photo editor is not ready. Your photo and marked area are still available; please try again.",
      );
      return;
    }
    try {
      canvas.setPointerCapture(pointerId);
      activePointerRef.current = pointerId;
    } catch {
      activePointerRef.current = null;
    }
    if (tool === "polygon") {
      setDraft((d) => [...d, p]);
      return;
    }
    setDrawing(true);
    setDraft([p]);
  }
  function move(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing || tool !== "brush") return;
    const canvas = e.currentTarget,
      clientX = e.clientX,
      clientY = e.clientY,
      p = mapPointerToCanvas(canvas, clientX, clientY);
    if (!p) {
      setStatus(
        "The photo editor was resized while drawing. Your photo and marked area were preserved; continue when it is visible.",
      );
      return;
    }
    setDraft((current) => [...current, p]);
  }
  function up(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget,
      pointerId = e.pointerId;
    try {
      if (canvas.hasPointerCapture(pointerId))
        canvas.releasePointerCapture(pointerId);
    } catch {}
    activePointerRef.current = null;
    if (drawing && draft.length) {
      const captured = [...draft];
      setMarks((m) => [...m, { type: "brush", points: captured, size: brush }]);
      setRedo([]);
      setDraft([]);
    }
    setDrawing(false);
  }
  function closePolygon() {
    if (draft.length > 2) {
      setMarks((m) => [...m, { type: "polygon", points: draft, size: brush }]);
      setRedo([]);
      setDraft([]);
    }
  }
  function undo() {
    if (draft.length) {
      setDraft((d) => d.slice(0, -1));
      return;
    }
    setMarks((current) => {
      const last = current.at(-1);
      if (last) setRedo((r) => [...r, last]);
      return current.slice(0, -1);
    });
  }
  function redoMark() {
    setRedo((current) => {
      const last = current.at(-1);
      if (last) setMarks((m) => [...m, last]);
      return current.slice(0, -1);
    });
  }
  async function maskBlob() {
    if (!processed) throw 0;
    const canvas = document.createElement("canvas");
    canvas.width = processed.width;
    canvas.height = processed.height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "destination-out";
    marks.forEach((m) => draw(ctx, m, true));
    return toBlob(canvas);
  }
  function summary(product: ProductDefinition, generated = Boolean(result)) {
    const dims =
      product.dimensions
        .filter((k) => measurements[k])
        .map((k) => `${title(k)}: ${measurements[k]} ${unit}`)
        .join(", ") || "None provided";
    return [
      `Product: ${product.label}`,
      `Finish: ${finish}`,
      `Options: ${options.join(", ") || "None"}`,
      `Provided measurements: ${dims}`,
      `AI concept generated: ${generated ? "Yes" : "No"}`,
    ].join("\n");
  }
  async function generate() {
    if (!processed || !photo) return setStatus("Add a project photo first.");
    if (!marks.length)
      return setStatus("Mark the installation area before generating.");
    setGenerating(true);
    setStatus(
      `Securely uploading the normalized photo and mask… Your ${result ? "previous result remains visible" : "photo remains visible"}.`,
    );
    const controller = new AbortController();
    abortRef.current = controller;
    const nextId = crypto.randomUUID();
    try {
      const mask = await maskBlob(),
        diagnostic = new FormData();
      diagnostic.append("photo", photo.normalized, "project.jpg");
      diagnostic.append("mask", mask, "mask.png");
      diagnostic.append("productId", selected.id);
      diagnostic.append("requestId", nextId);
      diagnostic.append(
        "specs",
        JSON.stringify({ finish, options, measurements, unit }),
      );
      const totalRequestBytes = (await new Response(diagnostic).arrayBuffer())
        .byteLength;
      void fetch("/api/visualize/client-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: nextId,
          productId: selected.id,
          originalPhotoBytes: photo.originalBytes,
          normalizedPhotoBytes: photo.normalized.size,
          maskBytes: mask.size,
          totalRequestBytes,
        }),
      }).catch(() => {});
      if (totalRequestBytes > 3.8 * 1024 * 1024)
        throw new Error(
          "This photo is too large to process. Please choose another photo.",
        );
      const sessionResponse = await fetch("/api/visualize/session", {
          method: "POST",
          signal: controller.signal,
        }),
        session = await sessionResponse.json().catch(() => null);
      if (!sessionResponse.ok || typeof session?.uploadPrefix !== "string")
        throw new Error(
          "The secure upload session could not be created. Please retry.",
        );
      const common = {
        access: "private" as const,
        handleUploadUrl: "/api/visualize/upload",
        abortSignal: controller.signal,
      };
      const [photoUpload, maskUpload] = await Promise.all([
        upload(
          `${session.uploadPrefix}/${nextId}/photo.jpg`,
          photo.normalized,
          {
            ...common,
            contentType: "image/jpeg",
            clientPayload: JSON.stringify({
              requestId: nextId,
              kind: "photo",
              extension: "jpg",
            }),
          },
        ),
        upload(`${session.uploadPrefix}/${nextId}/mask.png`, mask, {
          ...common,
          contentType: "image/png",
          clientPayload: JSON.stringify({
            requestId: nextId,
            kind: "mask",
            extension: "png",
          }),
        }),
      ]);
      const requestBody = JSON.stringify({
        photoObjectId: photoUpload.pathname,
        maskObjectId: maskUpload.pathname,
        productId: selected.id,
        requestId: nextId,
        specs: { finish, options, measurements, unit },
      });
      setStatus(
        `Creating a ${selected.label} concept… Your ${result ? "previous result remains visible" : "photo remains visible"}.`,
      );
      const response = await fetch("/api/visualize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Request-ID": nextId,
          },
          body: requestBody,
          signal: controller.signal,
        }),
        contentType = response.headers.get("content-type") || "",
        payload = contentType.includes("application/json")
          ? await response.json().catch(() => null)
          : null;
      if (!response.ok) {
        const reference = response.headers.get("x-request-id") || nextId;
        if (response.status === 413)
          throw new Error(
            `This photo is too large to process. Please choose another photo. Reference: ${reference}`,
          );
        throw new Error(
          payload?.error ||
            `Generation failed (${response.status}). Reference: ${reference}`,
        );
      }
      if (
        typeof payload?.imageUrl !== "string" ||
        !payload.imageUrl.startsWith("/api/visualize/result?")
      )
        throw new Error(
          "The image service did not return a usable private concept. Your previous view has been preserved.",
        );
      const concept = {
        image: payload.imageUrl,
        productId: selected.id,
        productLabel: selected.label,
        measurements: { ...measurements },
        unit,
        finish,
        options: [...options],
      };
      setResult(concept);
      setCompare(50);
      setStatus(payload.disclaimer);
      onRequestProject({
        productId: selected.id,
        context: summary(selected, true),
        conceptImage: payload.imageUrl,
      });
    } catch (error) {
      setStatus(
        controller.signal.aborted
          ? "Generation cancelled. Your photo and previous result are still available."
          : error instanceof Error
            ? error.message
            : "Generation failed. Your photo and previous result are still available.",
      );
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }
  async function downloadConcept() {
    if (!result) return;
    try {
      const image = new Image();
      image.src = result.image;
      await image.decode();
      const labels =
        products
          .find((p) => p.id === result.productId)
          ?.dimensions.filter((k) => result.measurements[k])
          .map(
            (k) => `${title(k)}: ${result.measurements[k]} ${result.unit}`,
          ) || [];
      const footer = labels.length ? 110 : 78,
        canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight + footer;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      ctx.fillStyle = "#101715";
      ctx.fillRect(0, image.naturalHeight, canvas.width, footer);
      ctx.fillStyle = "#d8b08e";
      ctx.font = `600 ${Math.max(18, canvas.width / 42)}px Arial`;
      ctx.fillText(
        "AI DESIGN CONCEPT · NOT TO SCALE",
        28,
        image.naturalHeight + 34,
      );
      ctx.fillStyle = "white";
      ctx.font = `${Math.max(16, canvas.width / 48)}px Arial`;
      ctx.fillText(result.productLabel, 28, image.naturalHeight + 64);
      if (labels.length)
        ctx.fillText(
          `Provided measurements — ${labels.join(" · ")}`,
          28,
          image.naturalHeight + 94,
        );
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/jpeg", 0.92);
      a.download = `nest-${result.productId}-ai-concept.jpg`;
      a.click();
    } catch {
      setStatus(
        "The concept could not be downloaded. The displayed result has been preserved.",
      );
    }
  }
  function consult() {
    onRequestProject({
      productId: selected.id,
      context: summary(selected),
      conceptImage: result?.image,
    });
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <section
      id="visualize"
      className="visualizer-section section"
      aria-labelledby="visualizer-title"
    >
      <div className="visualizer-heading">
        <div>
          <p className="eyebrow">
            <span /> AI project visualizer
          </p>
          <h2 id="visualizer-title">
            Picture the finished space.
            <br />
            <em>Keep the home you love.</em>
          </h2>
        </div>
        <p>
          Upload a photo, mark the installation area, and create a realistic AI
          concept using verified NEST product photography.
        </p>
      </div>
      <div className="ai-workspace">
        <div className="ai-stage">
          {!photo ? (
            <label className="ai-empty">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => choosePhoto(e.target.files?.[0])}
              />
              <ImagePlus />
              <strong>Add your home or patio photo</strong>
              <span>JPG, PNG, or WEBP · up to 30 MB</span>
            </label>
          ) : result ? (
            <div
              className="comparison"
              style={{ "--compare": `${compare}%` } as React.CSSProperties}
            >
              <img src={photo.url} alt="Original project area" />
              <div className="comparison-after">
                <img
                  src={result.image}
                  alt={`AI concept showing ${result.productLabel}`}
                />
              </div>
              <span className="compare-label before">Before</span>
              <span className="compare-label after">AI concept</span>
              {result.productId !== selected.id && (
                <span className="previous-result">
                  Previous result · {result.productLabel}
                </span>
              )}
              <div className="result-measurements">
                <strong>Provided measurements</strong>
                {products
                  .find((p) => p.id === result.productId)
                  ?.dimensions.map((key) =>
                    result.measurements[key] ? (
                      <span key={key}>
                        {title(key)}: {result.measurements[key]} {result.unit}
                      </span>
                    ) : null,
                  )}
              </div>
              <input
                aria-label="Before and after comparison"
                type="range"
                min="0"
                max="100"
                value={compare}
                onChange={(e) => setCompare(Number(e.target.value))}
              />
            </div>
          ) : (
            <div className="mask-editor">
              <img src={photo.url} alt="Uploaded project area" />
              <canvas
                ref={canvasRef}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onDoubleClick={closePolygon}
                aria-label="Installation area drawing canvas"
              />
              <div className="concept-badge">
                <Sparkles size={14} /> MARK INSTALLATION AREA
              </div>
            </div>
          )}
        </div>
        <aside className="ai-panel">
          <div className="ai-step">
            <span>01</span>
            <div>
              <strong>Photo & installation area</strong>
              <small>
                Your photo is normalized in your browser and stored privately
                only for this project workflow.
              </small>
            </div>
          </div>
          <label className="visualizer-upload">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => choosePhoto(e.target.files?.[0])}
            />
            <ImagePlus size={20} />
            <span>
              <strong>{photo?.file.name || "Choose photo"}</strong>
              <small>Orientation normalized automatically</small>
            </span>
          </label>
          {photo && !result && (
            <>
              <div className="draw-tools">
                <button
                  className={tool === "brush" ? "active" : ""}
                  type="button"
                  onClick={() => {
                    setTool("brush");
                    setDraft([]);
                  }}
                >
                  <MousePointer2 /> Brush
                </button>
                <button
                  className={tool === "polygon" ? "active" : ""}
                  type="button"
                  onClick={() => {
                    setTool("polygon");
                    setDraft([]);
                  }}
                >
                  <SquareDashedMousePointer /> Polygon
                </button>
              </div>
              {tool === "brush" ? (
                <label className="brush-control">
                  Brush size
                  <input
                    type="range"
                    min="20"
                    max="160"
                    value={brush}
                    onChange={(e) => setBrush(Number(e.target.value))}
                  />
                </label>
              ) : (
                <button
                  type="button"
                  className="polygon-close"
                  disabled={draft.length < 3}
                  onClick={closePolygon}
                >
                  Close polygon ({draft.length} points)
                </button>
              )}
              <div className="history-actions">
                <button
                  type="button"
                  onClick={undo}
                  disabled={!marks.length && !draft.length}
                >
                  <Undo2 /> Undo
                </button>
                <button
                  type="button"
                  onClick={redoMark}
                  disabled={!redo.length}
                >
                  <Redo2 /> Redo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMarks([]);
                    setRedo([]);
                    setDraft([]);
                  }}
                  disabled={!marks.length && !draft.length}
                >
                  <Eraser /> Reset
                </button>
              </div>
            </>
          )}
          <div className="ai-step">
            <span>02</span>
            <div>
              <strong>Product & finishes</strong>
              <small>
                Only verified catalog references are sent to the image model.
              </small>
            </div>
          </div>
          <label className="visualizer-field">
            Product
            <select
              value={systemId}
              onChange={(e) => setSystemId(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div
            className="finish-options"
            role="group"
            aria-label="Frame finish"
          >
            {selected.finishes.map((name) => (
              <button
                type="button"
                key={name}
                className={finish === name ? "active" : ""}
                onClick={() => setFinish(name)}
              >
                <i style={{ background: colors[name] }} />
                {name}
              </button>
            ))}
          </div>
          <div className="option-grid">
            {selected.options.map((name) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={options.includes(name)}
                  onChange={(e) =>
                    setOptions((current) =>
                      e.target.checked
                        ? [...current, name]
                        : current.filter((item) => item !== name),
                    )
                  }
                />
                <span>{name}</span>
              </label>
            ))}
          </div>
          <div className="ai-step">
            <span>03</span>
            <div>
              <strong>Provided measurements</strong>
              <small>
                Optional. One photo cannot establish real-world dimensions, and
                the concept is not to scale.
              </small>
            </div>
          </div>
          <div className="unit-toggle">
            <button
              type="button"
              className={unit === "ft" ? "active" : ""}
              onClick={() => setUnit("ft")}
            >
              Feet / inches
            </button>
            <button
              type="button"
              className={unit === "m" ? "active" : ""}
              onClick={() => setUnit("m")}
            >
              Meters
            </button>
          </div>
          <div className="measurement-grid">
            {selected.dimensions.map((key) => (
              <label key={key}>
                {title(key)}
                <span>optional · {unit}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step={unit === "m" ? "0.1" : "0.5"}
                  value={measurements[key] || ""}
                  placeholder="Unknown"
                  onChange={(e) =>
                    setMeasurements((current) => ({
                      ...current,
                      [key]: e.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <p className="privacy-note">
            By generating, you agree that the processed photo, mask, product
            references, and selections will be sent to OpenAI solely to create
            this concept. NEST does not save the upload or result on its server.
          </p>
          <div className="visualizer-actions">
            {generating ? (
              <button
                type="button"
                className="button generate"
                onClick={() => abortRef.current?.abort()}
              >
                <X /> Cancel generation
              </button>
            ) : (
              <button
                type="button"
                className="button generate"
                onClick={generate}
                disabled={!photo || !marks.length}
              >
                <Sparkles /> Generate my project
              </button>
            )}
            {result && (
              <button
                type="button"
                className="visualizer-secondary"
                onClick={downloadConcept}
              >
                <Download /> Download labeled concept
              </button>
            )}
            <button
              type="button"
              className="visualizer-secondary consultation"
              onClick={consult}
            >
              <Send /> Request consultation
            </button>
          </div>
          <p
            className={`visualizer-status ${status && /failed|error|could not|unavailable|cancelled/i.test(status) ? "error" : ""}`}
            role="status"
            aria-live="polite"
          >
            {status ||
              "No photo or measurements? You can request a consultation at any time."}
          </p>
        </aside>
      </div>
    </section>
  );
}
