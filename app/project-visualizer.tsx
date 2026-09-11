"use client";

import { Download, ImagePlus, Send, Sparkles, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  isGeneratedResultUrl,
  products,
  type ProductDefinition,
} from "../lib/products";
import type { PolygonPoint } from "./installation-area-editor";

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
  quality: "preview" | "high";
};
const colors: Record<string, string> = {
  Anthracite: "#303332",
  Bronze: "#6d5a48",
  White: "#deddd8",
};
const disclaimer =
  "Concept visualization — final design, engineering and dimensions require professional verification.";
const InstallationAreaEditor = dynamic(
  () => import("./installation-area-editor"),
  { ssr: false },
);
export function containRect(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
) {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    imageWidth <= 0 ||
    imageHeight <= 0
  )
    return null;
  const scale = Math.min(
      containerWidth / imageWidth,
      containerHeight / imageHeight,
    ),
    width = imageWidth * scale,
    height = imageHeight * scale;
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  };
}
export function drawContain(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  const bounds = containRect(
    canvasWidth,
    canvasHeight,
    imageWidth,
    imageHeight,
  );
  if (!bounds) return null;
  context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height);
  return bounds;
}
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
    );
  const [result, setResult] = useState<Concept | null>(null),
    [compare, setCompare] = useState(50),
    [generating, setGenerating] = useState(false),
    [status, setStatus] = useState(""),
    [uploadProgress, setUploadProgress] = useState(0),
    [elapsed, setElapsed] = useState(0),
    [placement, setPlacement] = useState<PolygonPoint[]>([]),
    [displayBounds, setDisplayBounds] =
      useState<ReturnType<typeof containRect>>(null);
  const abortRef = useRef<AbortController | null>(null),
    timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null),
    stageRef = useRef<HTMLDivElement | null>(null);
  const selected = useMemo(
    () =>
      products.find((product) => product.id === selectedProductId) ||
      products[0],
    [selectedProductId],
  );
  const secondLabel =
    selected.id === "umbrella"
      ? "Length"
      : selected.id === "awning" || selected.id === "wintent"
        ? "Projection"
        : "Depth / projection";
  const recalculateDisplayBounds = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !photo) return setDisplayBounds(null);
    setDisplayBounds(
      containRect(
        stage.clientWidth,
        stage.clientHeight,
        photo.width,
        photo.height,
      ),
    );
  }, [photo]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [generating]);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );
  useEffect(
    () => () => {
      if (result?.image.startsWith("blob:")) URL.revokeObjectURL(result.image);
    },
    [result],
  );
  useEffect(() => {
    recalculateDisplayBounds();
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(recalculateDisplayBounds);
    observer.observe(stage);
    window.addEventListener("resize", recalculateDisplayBounds);
    window.addEventListener("orientationchange", recalculateDisplayBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recalculateDisplayBounds);
      window.removeEventListener("orientationchange", recalculateDisplayBounds);
    };
  }, [recalculateDisplayBounds]);

  async function choosePhoto(file?: File) {
    if (!file) return;
    abortRef.current?.abort();
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
      const normalizationContext = canvas.getContext("2d");
      if (!normalizationContext) throw new Error("canvas");
      drawContain(
        normalizationContext,
        bitmap,
        bitmap.width,
        bitmap.height,
        canvas.width,
        canvas.height,
      );
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
      setCompare(50);
      setPlacement([]);
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
    const context = canvas.getContext("2d"),
      bounds = containRect(
        canvas.width,
        canvas.height,
        photo.width,
        photo.height,
      );
    if (!context || !bounds) throw new Error("Mask preparation failed");
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (placement.length !== 4)
      throw new Error("Select all four installation-area corners first.");
    context.save();
    context.beginPath();
    placement.forEach((point, index) => {
      const x = bounds.x + point.x * bounds.width,
        y = bounds.y + point.y * bounds.height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.clip();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    return toPng(canvas);
  }
  async function normalizeConcept(imageUrl: string) {
    if (!photo) throw new Error("Photo is not ready");
    const response = await fetch(imageUrl);
    if (!response.ok)
      throw new Error("The generated concept could not be loaded.");
    const bitmap = await createImageBitmap(await response.blob()),
      canvas = document.createElement("canvas");
    canvas.width = photo.width;
    canvas.height = photo.height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("The generated concept could not be prepared.");
    context.fillStyle = "#161b19";
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawContain(
      context,
      bitmap,
      bitmap.width,
      bitmap.height,
      canvas.width,
      canvas.height,
    );
    bitmap.close();
    return URL.createObjectURL(await toJpeg(canvas, 0.9));
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
      `Provided measurements: ${dims}`,
      `AI concept generated: ${concept ? "Yes" : "No"}`,
    ].join("\n");
  }
  async function generate(highQuality = false) {
    if (!photo) return setStatus("Upload a project-area photo first.");
    if (placement.length !== 4)
      return setStatus("Select all four installation-area corners first.");
    if (generating) return;
    setElapsed(0);
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
              measurements,
              placement,
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
      if (
        !isGeneratedResultUrl(
          payload.imageUrl,
          selected.referenceImages,
          window.location.href,
        )
      )
        throw new Error(
          `The image service returned the product reference instead of a generated concept. Reference: ${requestId}`,
        );
      const normalizedConceptUrl = await normalizeConcept(payload.imageUrl),
        concept: Concept = {
          image: normalizedConceptUrl,
          productId: selected.id,
          productLabel: selected.label,
          measurements: { ...measurements },
          unit: "ft",
          finish,
          structure,
          quality: highQuality ? "high" : "preview",
        };
      if (result?.image.startsWith("blob:")) URL.revokeObjectURL(result.image);
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
      if (result?.image.startsWith("blob:")) URL.revokeObjectURL(result.image);
      setResult(null);
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
      drawContain(
        ctx,
        image,
        image.naturalWidth,
        image.naturalHeight,
        canvas.width,
        image.naturalHeight,
      );
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
        <div className="ai-stage" ref={stageRef}>
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
          ) : (
            <div
              className="contained-media"
              style={
                displayBounds
                  ? {
                      left: displayBounds.x,
                      top: displayBounds.y,
                      width: displayBounds.width,
                      height: displayBounds.height,
                    }
                  : undefined
              }
            >
              {result ? (
                <div
                  className="comparison"
                  style={{ "--compare": `${compare}%` } as React.CSSProperties}
                >
                  <img
                    src={photo.url}
                    width={photo.width}
                    height={photo.height}
                    alt="Original uploaded project photo"
                    onLoad={recalculateDisplayBounds}
                  />
                  <div className="comparison-after">
                    <img
                      src={result.image}
                      width={photo.width}
                      height={photo.height}
                      alt={`AI concept showing ${result.productLabel}`}
                    />
                  </div>
                  <span className="compare-label before">BEFORE</span>
                  <span className="compare-label after">AI CONCEPT</span>
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
                          {result.productId === "awning" ||
                          result.productId === "wintent"
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
                    aria-label="Before and AI concept comparison"
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
                  onLoad={recalculateDisplayBounds}
                />
              )}
              {!result && (
                <InstallationAreaEditor
                  points={placement}
                  onChange={setPlacement}
                  disabled={generating}
                />
              )}
            </div>
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
          <div className="placement-help">
            <small>
              Click or tap four corners around the intended installation area.
              Drag any corner to adjust the polygon before generating.
            </small>
            {placement.length > 0 && (
              <button type="button" onClick={() => setPlacement([])}>
                Reset area
              </button>
            )}
          </div>
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
              onChange={(event) => {
                abortRef.current?.abort();
                if (result?.image.startsWith("blob:"))
                  URL.revokeObjectURL(result.image);
                setResult(null);
                setCompare(50);
                onProductChange(event.target.value);
              }}
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
                disabled={!photo || placement.length !== 4}
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
        </aside>
      </div>
    </section>
  );
}
