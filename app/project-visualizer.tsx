"use client";

import { Download, ImagePlus, Send, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { products, type ProductDefinition } from "../lib/products";
import { PergolaViewer } from "./pergola-viewer";

export type VisualizerHandoff = {
  productId: string;
  context: string;
  conceptImage?: string;
};
type Measurements = { width: string; depth: string; height: string };
type Concept = {
  image: string;
  productId: string;
  productLabel: string;
  measurements: Measurements;
  unit: "ft";
  finish: string;
  structure: "attached" | "freestanding";
  lighting: boolean;
  screens: boolean;
  quality: "preview" | "high";
};
const colors: Record<string, string> = {
  Anthracite: "#303332",
  Bronze: "#6d5a48",
  White: "#deddd8",
};
const disclaimer =
  "Concept visualization — final design, engineering and dimensions require professional verification.";
const toJpeg = (canvas: HTMLCanvasElement, quality = 0.82) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Photo compression failed")),
      "image/jpeg",
      quality,
    ),
  );
const toPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Mask preparation failed")),
      "image/png",
    ),
  );
const hashBlob = async (blob: Blob) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
    ),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export function ProjectVisualizer({
  onRequestProject,
  selectedProductId,
  onProductChange,
}: {
  onRequestProject: (handoff: VisualizerHandoff) => void;
  selectedProductId: string;
  onProductChange: (id: string) => void;
}) {
  const [photo, setPhoto] = useState<{
    file: File;
    url: string;
    normalized: Blob;
    hash: string;
    originalBytes: number;
    width: number;
    height: number;
  } | null>(null);
  const [measurements, setMeasurements] = useState<Measurements>({
      width: "",
      depth: "",
      height: "",
    }),
    [finish, setFinish] = useState("Anthracite"),
    [structure, setStructure] = useState<"attached" | "freestanding">(
      "attached",
    ),
    [lighting, setLighting] = useState(true),
    [screens, setScreens] = useState(false),
    [roofOpen, setRoofOpen] = useState(35);
  const [result, setResult] = useState<Concept | null>(null),
    [compare, setCompare] = useState(50),
    [advanced, setAdvanced] = useState(false),
    [generating, setGenerating] = useState(false),
    [status, setStatus] = useState(""),
    [uploadProgress, setUploadProgress] = useState(0),
    [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null),
    timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selected = useMemo(
    () =>
      products.find((product) => product.id === selectedProductId) ||
      products[0],
    [selectedProductId],
  );
  const secondLabel =
    selected.id === "umbrella" ? "Length" : "Depth / projection";
  const viewerWidth = Number(measurements.width) || 12,
    viewerDepth = Number(measurements.depth) || 16;

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );
  useEffect(() => {
    if (!generating) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [generating]);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );

  async function choosePhoto(file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 30 * 1024 * 1024
    ) {
      setStatus("Choose a JPG, PNG, or WEBP photo smaller than 30 MB.");
      return;
    }
    setStatus("Preparing photo…");
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      if (bitmap.width < 512 || bitmap.height < 512) throw new Error("small");
      const scale = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height)),
        canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas
        .getContext("2d")
        ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      let quality = 0.82,
        normalized = await toJpeg(canvas, quality);
      while (normalized.size > 2 * 1024 * 1024 && quality > 0.42) {
        quality -= 0.08;
        normalized = await toJpeg(canvas, quality);
      }
      if (normalized.size > 2 * 1024 * 1024) throw new Error("large");
      const hash = await hashBlob(normalized);
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto({
        file,
        url: URL.createObjectURL(normalized),
        normalized,
        hash,
        originalBytes: file.size,
        width: canvas.width,
        height: canvas.height,
      });
      setResult(null);
      setStatus(
        `Photo ready · ${canvas.width} × ${canvas.height} · ${(normalized.size / 1024 / 1024).toFixed(1)} MB`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error && error.message === "large"
          ? "This photo is too large to process. Please choose another photo."
          : "This image could not be prepared. Choose another photo at least 512 × 512 pixels.",
      );
    }
  }
  async function automaticMask() {
    if (!photo) throw new Error("Photo is not ready");
    const canvas = document.createElement("canvas");
    canvas.width = photo.width;
    canvas.height = photo.height;
    return toPng(canvas);
  }
  function summary(product: ProductDefinition, concept = Boolean(result)) {
    const dims =
      [
        measurements.width && `Width: ${measurements.width} ft`,
        measurements.depth && `${secondLabel}: ${measurements.depth} ft`,
        measurements.height && `Height: ${measurements.height} ft`,
      ]
        .filter(Boolean)
        .join(", ") || "None provided";
    return [
      `Product: ${product.label}`,
      `Frame: ${finish}`,
      `Structure: ${structure}`,
      `Lighting: ${lighting ? "Yes" : "No"}`,
      `Screens: ${screens ? "Yes" : "No"}`,
      `Roof position: ${roofOpen}%`,
      `Provided measurements: ${dims}`,
      `AI concept generated: ${concept ? "Yes" : "No"}`,
    ].join("\n");
  }
  async function generate(highQuality = false) {
    if (!photo) return setStatus("Upload a project-area photo first.");
    if (generating) return;
    setGenerating(true);
    setUploadProgress(0);
    setStatus(
      highQuality
        ? "Creating your higher-quality concept…"
        : "Creating your concept…",
    );
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = crypto.randomUUID();
    let timedOut = false;
    timeoutRef.current = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 90_000);
    try {
      const mask = await automaticMask(),
        diagnostic = new FormData();
      diagnostic.append("photo", photo.normalized, "project.jpg");
      diagnostic.append("mask", mask, "mask.png");
      diagnostic.append("productId", selected.id);
      diagnostic.append(
        "specs",
        JSON.stringify({
          measurements,
          finish,
          structure,
          lighting,
          screens,
          roofOpen,
          quality: highQuality ? "high" : "preview",
        }),
      );
      const totalRequestBytes = (await new Response(diagnostic).arrayBuffer())
        .byteLength;
      void fetch("/api/visualize/client-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
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
        throw new Error("The secure upload session could not be created.");
      let photoPct = 0,
        maskPct = 0;
      const progress = () =>
        setUploadProgress(Math.round((photoPct + maskPct) / 2));
      const common = {
        access: "private" as const,
        handleUploadUrl: "/api/visualize/upload",
        abortSignal: controller.signal,
      };
      const [photoUpload, maskUpload] = await Promise.all([
        upload(
          `${session.uploadPrefix}/${requestId}/photo.jpg`,
          photo.normalized,
          {
            ...common,
            contentType: "image/jpeg",
            clientPayload: JSON.stringify({
              requestId,
              kind: "photo",
              extension: "jpg",
            }),
            onUploadProgress: (event) => {
              photoPct = event.percentage;
              progress();
            },
          },
        ),
        upload(`${session.uploadPrefix}/${requestId}/mask.png`, mask, {
          ...common,
          contentType: "image/png",
          clientPayload: JSON.stringify({
            requestId,
            kind: "mask",
            extension: "png",
          }),
          onUploadProgress: (event) => {
            maskPct = event.percentage;
            progress();
          },
        }),
      ]);
      setUploadProgress(100);
      setStatus(
        highQuality
          ? "Creating your higher-quality concept…"
          : "Creating your concept…",
      );
      const response = await fetch("/api/visualize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Request-ID": requestId,
          },
          body: JSON.stringify({
            photoObjectId: photoUpload.pathname,
            maskObjectId: maskUpload.pathname,
            photoHash: photo.hash,
            productId: selected.id,
            requestId,
            specs: {
              finish,
              structure,
              lighting,
              screens,
              roofOpen,
              measurements,
              unit: "ft",
              quality: highQuality ? "high" : "preview",
            },
          }),
          signal: controller.signal,
        }),
        contentType = response.headers.get("content-type") || "",
        payload = contentType.includes("application/json")
          ? await response.json().catch(() => null)
          : null;
      if (!response.ok) {
        const reference = response.headers.get("x-request-id") || requestId;
        throw new Error(
          `${payload?.error || `Generation failed (${response.status}).`} Reference: ${reference}`,
        );
      }
      if (typeof payload?.imageUrl !== "string")
        throw new Error(
          `The image service did not return a usable concept. Reference: ${requestId}`,
        );
      const concept: Concept = {
        image: payload.imageUrl,
        productId: selected.id,
        productLabel: selected.label,
        measurements: { ...measurements },
        unit: "ft",
        finish,
        structure,
        lighting,
        screens,
        quality: highQuality ? "high" : "preview",
      };
      setResult(concept);
      setCompare(50);
      setStatus(
        `${disclaimer}${payload.cached ? " Previous matching result reused." : ""}`,
      );
      onRequestProject({
        productId: selected.id,
        context: summary(selected, true),
        conceptImage: payload.imageUrl,
      });
    } catch (error) {
      const message = timedOut
        ? `Generation timed out after 90 seconds. Reference: ${requestId}`
        : controller.signal.aborted
          ? `Generation cancelled. Reference: ${requestId}`
          : error instanceof Error
            ? error.message
            : `Generation failed. Reference: ${requestId}`;
      setStatus(
        message.includes("Reference:")
          ? message
          : `${message} Reference: ${requestId}`,
      );
    } finally {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      abortRef.current = null;
      setGenerating(false);
    }
  }
  async function downloadConcept() {
    if (!result) return;
    try {
      const image = new Image();
      image.src = result.image;
      await image.decode();
      const labels = [
        result.measurements.width && `Width: ${result.measurements.width} ft`,
        result.measurements.depth &&
          `${secondLabel}: ${result.measurements.depth} ft`,
        result.measurements.height &&
          `Height: ${result.measurements.height} ft`,
      ].filter(Boolean);
      const footer = labels.length ? 118 : 86,
        canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight + footer;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      ctx.fillStyle = "#101715";
      ctx.fillRect(0, image.naturalHeight, canvas.width, footer);
      ctx.fillStyle = "#d8b08e";
      ctx.font = `600 ${Math.max(16, canvas.width / 48)}px Arial`;
      ctx.fillText("CONCEPT VISUALIZATION", 28, image.naturalHeight + 32);
      ctx.fillStyle = "white";
      ctx.font = `${Math.max(14, canvas.width / 54)}px Arial`;
      ctx.fillText(result.productLabel, 28, image.naturalHeight + 61);
      if (labels.length)
        ctx.fillText(
          `Provided measurements — ${labels.join(" · ")}`,
          28,
          image.naturalHeight + 90,
        );
      ctx.font = `${Math.max(11, canvas.width / 70)}px Arial`;
      ctx.fillText(
        "Final design, engineering and dimensions require professional verification.",
        28,
        image.naturalHeight + footer - 12,
      );
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/jpeg", 0.9);
      link.download = `nest-${result.productId}-concept.jpg`;
      link.click();
    } catch {
      setStatus(
        "The concept could not be downloaded. The displayed result remains available.",
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
            <span /> Project visualizer
          </p>
          <h2 id="visualizer-title">
            See your space.
            <br />
            <em>Shape the details.</em>
          </h2>
        </div>
        <p>
          Upload one project-area photo, choose a system, add any measurements
          you know, and create a photorealistic concept.
        </p>
      </div>
      <div className="ai-workspace">
        <div className="ai-stage">
          {!photo ? (
            <label className="ai-empty">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => choosePhoto(event.target.files?.[0])}
              />
              <ImagePlus />
              <strong>Upload your project-area photo</strong>
              <span>Optimized privately in your browser</span>
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
                  alt={`Concept visualization showing ${result.productLabel}`}
                />
              </div>
              <span className="compare-label before">Original</span>
              <span className="compare-label after">Concept</span>
              {(result.measurements.width ||
                result.measurements.depth ||
                result.measurements.height) && (
                <div className="result-measurements">
                  <strong>Provided measurements</strong>
                  {result.measurements.width && (
                    <span>Width: {result.measurements.width} ft</span>
                  )}
                  {result.measurements.depth && (
                    <span>
                      {result.productId === "awning"
                        ? "Projection"
                        : "Depth / length"}
                      : {result.measurements.depth} ft
                    </span>
                  )}
                  {result.measurements.height && (
                    <span>Height: {result.measurements.height} ft</span>
                  )}
                </div>
              )}
              {result.productId !== selected.id && (
                <span className="previous-result">
                  Previous result · {result.productLabel}
                </span>
              )}
              <input
                aria-label="Before and after comparison"
                type="range"
                min="0"
                max="100"
                value={compare}
                onChange={(event) => setCompare(Number(event.target.value))}
              />
            </div>
          ) : (
            <img
              className="prepared-photo"
              src={photo.url}
              alt="Uploaded project area"
            />
          )}
          {generating && (
            <div className="generation-overlay">
              <Sparkles />
              <strong>
                {uploadProgress < 100
                  ? "Uploading optimized photo…"
                  : "Creating your concept…"}
              </strong>
              <span>
                {uploadProgress < 100 ? `${uploadProgress}% · ` : ""}${elapsed}s
                elapsed
              </span>
            </div>
          )}
        </div>
        <aside className="ai-panel">
          <div className="ai-step">
            <span>01</span>
            <div>
              <strong>Project-area photo</strong>
              <small>
                Maximum 1536 px. The original full-resolution file is never
                uploaded.
              </small>
            </div>
          </div>
          <label className="visualizer-upload">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => choosePhoto(event.target.files?.[0])}
            />
            <ImagePlus size={20} />
            <span>
              <strong>{photo?.file.name || "Choose photo"}</strong>
              <small>
                {photo
                  ? `${(photo.normalized.size / 1024 / 1024).toFixed(1)} MB optimized`
                  : "JPG, PNG or WEBP"}
              </small>
            </span>
          </label>
          <div className="ai-step">
            <span>02</span>
            <div>
              <strong>Product</strong>
              <small>
                Changing the product updates the configuration but does not
                generate automatically.
              </small>
            </div>
          </div>
          <label className="visualizer-field">
            Choose product
            <select
              value={selected.id}
              onChange={(event) => onProductChange(event.target.value)}
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.label}
                </option>
              ))}
            </select>
          </label>
          <div className="ai-step">
            <span>03</span>
            <div>
              <strong>Optional measurements</strong>
              <small>
                Leave anything unknown blank. Concepts are not to scale.
              </small>
            </div>
          </div>
          <div className="measurement-grid simple">
            <label>
              Width<span>optional · ft</span>
              <input
                type="number"
                min="0"
                max="100"
                value={measurements.width}
                onChange={(event) =>
                  setMeasurements((current) => ({
                    ...current,
                    width: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              {secondLabel}
              <span>optional · ft</span>
              <input
                type="number"
                min="0"
                max="100"
                value={measurements.depth}
                onChange={(event) =>
                  setMeasurements((current) => ({
                    ...current,
                    depth: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Height<span>optional · ft</span>
              <input
                type="number"
                min="0"
                max="100"
                value={measurements.height}
                onChange={(event) =>
                  setMeasurements((current) => ({
                    ...current,
                    height: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <div className="quick-options">
            <label>
              Frame color
              <select
                value={finish}
                onChange={(event) => setFinish(event.target.value)}
              >
                {Object.keys(colors).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Structure
              <select
                value={structure}
                onChange={(event) =>
                  setStructure(
                    event.target.value as "attached" | "freestanding",
                  )
                }
              >
                <option value="attached">Attached</option>
                <option value="freestanding">Freestanding</option>
              </select>
            </label>
          </div>
          <div className="visualizer-actions">
            {generating ? (
              <button
                type="button"
                className="button generate"
                onClick={() => abortRef.current?.abort()}
              >
                <X /> Cancel
              </button>
            ) : (
              <button
                type="button"
                className="button generate"
                onClick={() => generate(false)}
                disabled={!photo}
              >
                <Sparkles /> Generate My Concept
              </button>
            )}
            {result && result.quality !== "high" && (
              <button
                type="button"
                className="visualizer-secondary quality"
                onClick={() => generate(true)}
                disabled={generating}
              >
                Create Higher-Quality Version
              </button>
            )}
            {result && (
              <button
                type="button"
                className="visualizer-secondary"
                onClick={downloadConcept}
              >
                <Download /> Download concept
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
            className={`visualizer-status ${status && /failed|error|could not|timed out|too large/i.test(status) ? "error" : ""}`}
            role="status"
            aria-live="polite"
          >
            {status || disclaimer}
          </p>
          <button
            type="button"
            className="advanced-toggle"
            aria-expanded={advanced}
            onClick={() => setAdvanced((open) => !open)}
          >
            Customize in 3D <span>{advanced ? "−" : "+"}</span>
          </button>
          {advanced && (
            <div className="advanced-3d">
              <PergolaViewer
                product={selected.viewer}
                width={viewerWidth}
                depth={viewerDepth}
                attached={structure === "attached"}
                roofOpen={roofOpen}
                color={colors[finish]}
                lighting={lighting}
                screens={screens}
              />
              <label>
                Roof position <span>{roofOpen}%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={roofOpen}
                  onChange={(event) => setRoofOpen(Number(event.target.value))}
                />
              </label>
              <div className="advanced-checks">
                <label>
                  <input
                    type="checkbox"
                    checked={lighting}
                    onChange={(event) => setLighting(event.target.checked)}
                  />{" "}
                  Integrated lighting
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={screens}
                    onChange={(event) => setScreens(event.target.checked)}
                  />{" "}
                  ZIP screens
                </label>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
