"use client";

import { Download, ImagePlus, Send, Sparkles, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import {
  getProductDisplayImage,
  isGeneratedResultUrl,
  products,
  type ProductDefinition,
} from "../lib/products";
import { trackEvent } from "../lib/analytics";
import {
  addOnIds,
  addOnLabels,
  compatibility,
  isPrimarySystemId,
  primaryLabels,
  primarySystemIds,
  reconcileAddOns,
  toggleAddOn,
  usesFabricColor,
  usesLouverColor,
  type AddOnId,
  type PrimarySystemId,
} from "../lib/visualizer-design";
import type { PolygonPoint } from "./installation-area-editor";

export type VisualizerHandoff = {
  productId: string;
  context: string;
  conceptImage?: string;
  conceptImages?: { viewId: ProjectViewId; label: string; image: string }[];
};
export type ProjectViewId = "front" | "left" | "right";
type Measurements = { width: string; depth: string; height: string };
type NormalizedPhoto = {
  uploadId: string; file: File; url: string; normalized: Blob; hash: string;
  originalBytes: number; width: number; height: number;
};
type ColorTarget = "frame" | "louver" | "zip_fabric" | "fabric" | "glass_system" | "frame_and_matching_louvers";
type Concept = {
  image: string;
  referenceUrl: string;
  productId: string;
  productLabel: string;
  measurements: Measurements;
  unit: "ft";
  frameColor: string;
  addOns: AddOnId[];
  quality: "preview" | "high";
};
export type ProjectView = {
  id: ProjectViewId;
  label: string;
  required: boolean;
  photo: NormalizedPhoto | null;
  placement: PolygonPoint[];
  concept: Concept | null;
  status: string;
  requestId: string | null;
  uploadProgress: number;
  generating: boolean;
  stale: boolean;
};
const projectViewDefinitions = [
  { id: "front", label: "Front View", required: true },
  { id: "left", label: "Left View", required: false },
  { id: "right", label: "Right View", required: false },
] as const;
export function createProjectViews(): ProjectView[] {
  return projectViewDefinitions.map((view) => ({
    ...view, photo: null, placement: [], concept: null, status: "",
    requestId: null, uploadProgress: 0, generating: false, stale: false,
  }));
}
export function updateProjectViewState(
  views: ProjectView[],
  viewId: ProjectViewId,
  patch: Partial<ProjectView>,
) {
  return views.map((view) => view.id === viewId ? { ...view, ...patch } : view);
}
export function resetProjectViewDesign(view: ProjectView): ProjectView {
  return {
    ...view,
    concept: null,
    status: view.photo
      ? "Design reset. Your photo and installation area were kept."
      : "",
    requestId: null,
    uploadProgress: 0,
    generating: false,
    stale: false,
  };
}
type ColorUpdate = { target: ColorTarget; source: Concept; sequence: number };
const frameColors = [
  ["Anthracite Gray", "#3b4141"], ["Matte Black", "#171918"],
  ["White", "#eeeeda"], ["Bronze", "#6d5544"], ["Custom Color", "custom"],
] as const;
const louverColors = [
  ["Match Frame", "match"], ["White", "#eeeeda"], ["Light Gray", "#aeb3b0"],
  ["Anthracite", "#3b4141"], ["Custom Color", "custom"],
] as const;
const zipColors = [
  ["White", "#eeeeda"], ["Sand", "#c9b78d"], ["Light Gray", "#aeb3b0"],
  ["Charcoal", "#4a4e4d"], ["Black", "#171918"], ["Custom Color", "custom"],
] as const;
const fabricColors = [
  ["White", "#eeeeda"], ["Sand", "#c9b78d"], ["Beige", "#c6ad8b"],
  ["Light Gray", "#aeb3b0"], ["Charcoal", "#4a4e4d"],
  ["Black", "#171918"], ["Custom Color", "custom"],
] as const;
const disclaimer =
  "Concept visualization only. Final compatibility, engineering, dimensions, finishes and color availability are confirmed during consultation.";
const InstallationAreaEditor = dynamic(
  () => import("./installation-area-editor"),
  { ssr: false },
);
function ColorSwatches({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly (readonly [string, string])[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="color-playground">
      <legend>{label}</legend>
      <div className="color-swatches">
        {options.map(([name, color]) => (
          <button
            key={name}
            type="button"
            className={value === name ? "active" : ""}
            aria-pressed={value === name}
            onClick={() => onChange(name)}
          >
            <span
              className={color === "custom" || color === "match" ? color : ""}
              style={color.startsWith("#") ? { background: color } : undefined}
            />
            {name}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
function CustomColorFields({
  component,
  color,
  name,
  onColorChange,
  onNameChange,
}: {
  component: string;
  color: string;
  name: string;
  onColorChange: (value: string) => void;
  onNameChange: (value: string) => void;
}) {
  return (
    <div className="custom-color-fields">
      <label>
        {component} custom color
        <input
          type="color"
          aria-label={`${component} custom color`}
          value={color}
          onChange={(event) => onColorChange(event.target.value)}
        />
      </label>
      <label>
        Optional {component.toLowerCase()} color name
        <input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="e.g. RAL preference"
        />
      </label>
    </div>
  );
}
function MultiAngleResults({ views }: { views: ProjectView[] }) {
  const generated = (["left", "front", "right"] as ProjectViewId[])
    .flatMap((id) => views.filter((view) => view.id === id && view.photo && view.concept));
  const [viewportRef, embla] = useEmblaCarousel({ loop: false, dragFree: false });
  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => {
    if (!embla) return;
    const select = () => setSelectedIndex(embla.selectedScrollSnap());
    embla.on("select", select);
    select();
    return () => { embla.off("select", select); };
  }, [embla]);
  if (!generated.length) return null;
  return (
    <section className="multi-angle-results" aria-label="Generated project angles">
      <strong className="project-view-mode">{generated.length === 3 ? "270° Project View" : generated.length === 2 ? "Two-angle Project View" : "Single Project View"}</strong>
      <h3>Explore Your Project</h3>
      <p>Swipe or drag to see your concept from each uploaded angle.</p>
      <div className="angle-carousel" ref={viewportRef} tabIndex={0} onKeyDown={(event) => {
        if (event.key === "ArrowLeft") embla?.scrollPrev();
        if (event.key === "ArrowRight") embla?.scrollNext();
      }}>
        <div className="angle-carousel-track">
          {generated.map((view, index) => (
            <article className={`angle-carousel-slide${selectedIndex === index ? " active" : ""}`} key={view.id}>
              <strong>{view.label}</strong>
              <div className="angle-pair">
                <figure><img src={view.photo!.url} width={view.photo!.width} height={view.photo!.height} alt={`Original ${view.label}`} /><figcaption>Before</figcaption></figure>
                <figure><img src={view.concept!.image} width={view.photo!.width} height={view.photo!.height} alt={`${view.label} AI concept`} /><figcaption>AI Concept</figcaption></figure>
              </div>
              {view.stale && <p className="update-needed">Update needed — Design selections changed. Regenerate this view to apply them.</p>}
            </article>
          ))}
        </div>
      </div>
      <div className="angle-carousel-controls">
        <button type="button" aria-label="Previous project angle" onClick={() => embla?.scrollPrev()}>Previous</button>
        <div role="tablist" aria-label="Generated angle thumbnails">
          {generated.map((view, index) => <button key={view.id} type="button" role="tab" aria-selected={selectedIndex === index} aria-label={`Show ${view.label}`} onClick={() => embla?.scrollTo(index)}>{view.label}</button>)}
        </div>
        <button type="button" aria-label="Next project angle" onClick={() => embla?.scrollNext()}>Next</button>
      </div>
    </section>
  );
}
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
export function isPlacementReady(points: readonly PolygonPoint[]) {
  return points.length === 4 && points.every(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y) &&
      point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1,
  );
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
export const sharedDesignFingerprintSource = (configuration: Record<string, unknown>) => {
  const canonicalize = (value: unknown): unknown =>
    Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalize(item)]))
      : value;
  return JSON.stringify(canonicalize(configuration));
};
const hashText = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");

export function ProjectVisualizer({
  onRequestProject,
  selectedProductId,
  onProductChange,
}: {
  onRequestProject: (handoff: VisualizerHandoff) => void;
  selectedProductId: string;
  onProductChange: (id: string) => void;
}) {
  const [views, setViews] = useState<ProjectView[]>(createProjectViews),
    [activeViewId, setActiveViewId] = useState<ProjectViewId>("front"),
    [batchGenerating, setBatchGenerating] = useState(false),
    [batchStatus, setBatchStatus] = useState(""),
    [classifyingViews, setClassifyingViews] = useState(false),
    [classificationNotice, setClassificationNotice] = useState(""),
    [correctingAngles, setCorrectingAngles] = useState(false),
    [draggingUpload, setDraggingUpload] = useState(false);
  const viewsRef = useRef(views),
    projectIdRef = useRef(crypto.randomUUID()),
    batchCancelledRef = useRef(false),
    batchGeneratingRef = useRef(false);
  const activeView = views.find((view) => view.id === activeViewId) || views[0],
    photo = activeView.photo,
    placement = activeView.placement,
    result = activeView.concept,
    status = activeView.status,
    uploadProgress = activeView.uploadProgress,
    generating = activeView.generating,
    uploadedViews = views.filter((view) => view.photo),
    readyPlacementCount = uploadedViews.filter((view) => isPlacementReady(view.placement)).length;
  const patchView = useCallback((viewId: ProjectViewId, patch: Partial<ProjectView>) => {
    setViews((current) => updateProjectViewState(current, viewId, patch));
  }, []);
  const setPlacement = useCallback((points: PolygonPoint[]) => patchView(activeViewId, { placement: points }), [activeViewId, patchView]);
  const setStatus = useCallback((next: string) => patchView(activeViewId, { status: next }), [activeViewId, patchView]);
  const setGenerating = useCallback((next: boolean) => patchView(activeViewId, { generating: next }), [activeViewId, patchView]);
  const [measurements, setMeasurements] = useState<Measurements>({
      width: "",
      depth: "",
      height: "",
    }),
    [addOns, setAddOns] = useState<AddOnId[]>([]),
    [frameColor, setFrameColor] = useState("Anthracite Gray"),
    [louverColor, setLouverColor] = useState("Match Frame"),
    [zipFabricColor, setZipFabricColor] = useState("Sand"),
    [fabricColor, setFabricColor] = useState("Sand"),
    [frameCustomColor, setFrameCustomColor] = useState("#8a735f"),
    [frameCustomColorName, setFrameCustomColorName] = useState(""),
    [louverCustomColor, setLouverCustomColor] = useState("#8a735f"),
    [louverCustomColorName, setLouverCustomColorName] = useState(""),
    [zipCustomColor, setZipCustomColor] = useState("#8a735f"),
    [zipCustomColorName, setZipCustomColorName] = useState(""),
    [fabricCustomColor, setFabricCustomColor] = useState("#8a735f"),
    [fabricCustomColorName, setFabricCustomColorName] = useState(""),
    [glassSystemColor, setGlassSystemColor] = useState("Anthracite Gray"),
    [glassCustomColor, setGlassCustomColor] = useState("#3b4141"),
    [glassCustomColorName, setGlassCustomColorName] = useState(""),
    [ledTemperature, setLedTemperature] = useState("Warm White"),
    [ledPlacement, setLedPlacement] = useState("Perimeter LED");
  const [compare, setCompare] = useState(50),
    [elapsed, setElapsed] = useState(0),
    [updatingColors, setUpdatingColors] = useState(false),
    [displayBounds, setDisplayBounds] =
      useState<ReturnType<typeof containRect>>(null);
  const abortRef = useRef<AbortController | null>(null),
    timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null),
    colorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null),
    colorSequenceRef = useRef(0),
    generatingRef = useRef(false),
    colorUpdateActiveRef = useRef(false),
    activeRequestRef = useRef<string | null>(null),
    generateRef = useRef<(highQuality?: boolean, colorUpdate?: ColorUpdate, viewId?: ProjectViewId, generationOrder?: number) => Promise<void>>(async () => {}),
    stageRef = useRef<HTMLDivElement | null>(null);
  const primaryId: PrimarySystemId = isPrimarySystemId(selectedProductId)
    ? selectedProductId
    : primarySystemIds[0];
  const selected = useMemo(
    () => products.find((product) => product.id === primaryId) || products[0],
    [primaryId],
  );
  const selectedAddOnProducts = useMemo(
    () => addOns.flatMap((id) => products.filter((product) => product.id === id)),
    [addOns],
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
      if (colorTimerRef.current) clearTimeout(colorTimerRef.current);
    },
    [],
  );
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [generating]);
  useEffect(() => () => {
    for (const view of viewsRef.current) {
      if (view.photo) URL.revokeObjectURL(view.photo.url);
      if (view.concept?.image.startsWith("blob:")) URL.revokeObjectURL(view.concept.image);
    }
  }, []);
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

  async function normalizePhoto(file: File): Promise<NormalizedPhoto> {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) throw new Error("Choose a JPG, PNG, or WebP photo no larger than 10 MB.");
    const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      if (bitmap.width < 512 || bitmap.height < 512) throw new Error("Choose a photo at least 512 × 512 pixels.");
      const scale = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height)),
        canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const normalizationContext = canvas.getContext("2d");
      if (!normalizationContext) throw new Error("This photo could not be prepared.");
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
      if (normalized.size > 2 * 1024 * 1024) throw new Error("This photo is too large to process. Please choose another photo.");
      const hash = await hashBlob(normalized);
      return {
        uploadId: `photo-${crypto.randomUUID()}`,
        file,
        url: URL.createObjectURL(normalized),
        normalized,
        hash,
        originalBytes: file.size,
        width: canvas.width,
        height: canvas.height,
      };
  }
  async function analysisCopy(photo: NormalizedPhoto) {
    const bitmap = await createImageBitmap(photo.normalized),
      scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height)),
      canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Analysis copy could not be prepared.");
    drawContain(context, bitmap, bitmap.width, bitmap.height, canvas.width, canvas.height);
    bitmap.close();
    return toJpeg(canvas, 0.72);
  }
  function arrangePhotos(
    photos: NormalizedPhoto[],
    assignments?: { uploadId: string; view: ProjectViewId; confidence: number }[],
  ) {
    const fallback: ProjectViewId[] = photos.length === 3 ? ["left", "front", "right"] : ["front", "left"],
      angleFor = (photo: NormalizedPhoto, index: number) => assignments?.find((item) => item.uploadId === photo.uploadId)?.view || fallback[index],
      previous = viewsRef.current;
    setViews(projectViewDefinitions.map((definition) => {
      const photo = photos.find((item, index) => angleFor(item, index) === definition.id),
        old = photo ? previous.find((view) => view.photo?.uploadId === photo.uploadId) : null;
      return photo ? {
        ...definition, photo,
        placement: old?.placement || [], concept: old?.concept || null,
        status: old?.status || `Photo ready · orientation normalized · ${photo.width} × ${photo.height}`,
        requestId: old?.requestId || null, uploadProgress: old?.uploadProgress || 0,
        generating: false, stale: old?.stale || false,
      } : { ...definition, photo: null, placement: [], concept: null, status: "", requestId: null, uploadProgress: 0, generating: false, stale: false };
    }));
    const first = (["front", "left", "right"] as ProjectViewId[]).find((id) => photos.some((photo, index) => angleFor(photo, index) === id));
    if (first) setActiveViewId(first);
  }
  async function classifyPhotos(photos: NormalizedPhoto[]) {
    setClassifyingViews(true);
    setClassificationNotice("Organizing your project views…");
    try {
      const sessionResponse = await fetch("/api/visualize/session", { method: "POST" });
      if (!sessionResponse.ok) throw new Error("Secure photo session unavailable.");
      const copies = await Promise.all(photos.map(analysisCopy)), form = new FormData();
      copies.forEach((copy, index) => {
        form.append("photos", copy, `${photos[index].uploadId}.jpg`);
        form.append("uploadIds", photos[index].uploadId);
      });
      const response = await fetch("/api/visualize/classify-views", { method: "POST", body: form }),
        payload = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(payload?.assignments)) throw new Error(payload?.error || "Angle classification unavailable.");
      arrangePhotos(photos, payload.assignments);
      const lowConfidence = payload.assignments.some((item: { confidence: number }) => item.confidence < 0.7);
      setClassificationNotice(!payload.sameLocation
        ? "These photos may show different locations. Please confirm the angles or choose photos of the same project area."
        : lowConfidence ? "We organized the views automatically. Please confirm the angles." : "Project views organized automatically.");
      setCorrectingAngles(!payload.sameLocation || lowConfidence);
    } catch (error) {
      arrangePhotos(photos);
      setClassificationNotice(`Angle classification unavailable. We kept your photos in a temporary order; please correct the angles. ${error instanceof Error ? error.message : ""}`.trim());
      setCorrectingAngles(true);
    } finally {
      setClassifyingViews(false);
    }
  }
  async function choosePhotos(files?: FileList | File[], replaceViewId?: ProjectViewId) {
    if (!files?.length) return;
    abortRef.current?.abort();
    const accepted = Array.from(files).slice(0, replaceViewId ? 1 : 3 - viewsRef.current.filter((view) => view.photo).length);
    setClassificationNotice("Preparing photos…");
    const settled = await Promise.allSettled(accepted.map(normalizePhoto)),
      prepared = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []),
      failures = settled.filter((item) => item.status === "rejected") as PromiseRejectedResult[];
    if (!prepared.length) {
      setClassificationNotice(failures[0]?.reason instanceof Error ? failures[0].reason.message : "The selected photos could not be prepared.");
      return;
    }
    const current = viewsRef.current.filter((view) => view.photo && view.id !== replaceViewId).map((view) => view.photo!),
      combined = [...current, ...prepared].slice(0, 3);
    if (replaceViewId) {
      const replaced = viewsRef.current.find((view) => view.id === replaceViewId);
      if (replaced?.photo) URL.revokeObjectURL(replaced.photo.url);
      if (replaced?.concept?.image.startsWith("blob:")) URL.revokeObjectURL(replaced.concept.image);
    }
    await classifyPhotos(combined);
    if (failures.length) setClassificationNotice((current) => `${current} ${failures.length} photo failed normalization; the other photos were kept.`.trim());
    setCompare(50);
  }
  function removePhoto(viewId: ProjectViewId) {
    const view = viewsRef.current.find((item) => item.id === viewId);
    if (!view || view.required || !view.photo) return;
    URL.revokeObjectURL(view.photo.url);
    if (view.concept?.image.startsWith("blob:")) URL.revokeObjectURL(view.concept.image);
    patchView(viewId, { photo: null, placement: [], concept: null, status: "", requestId: null, uploadProgress: 0, generating: false, stale: false });
    if (activeViewId === viewId) setActiveViewId("front");
  }
  function correctAngle(from: ProjectViewId, to: ProjectViewId) {
    if (from === to) return;
    setViews((current) => {
      const source = current.find((view) => view.id === from)!, target = current.find((view) => view.id === to)!;
      const content = (view: ProjectView) => ({ photo: view.photo, placement: view.placement, concept: view.concept, status: view.status, requestId: view.requestId, uploadProgress: view.uploadProgress, generating: view.generating, stale: view.stale });
      return current.map((view) => view.id === from ? { ...view, ...content(target) } : view.id === to ? { ...view, ...content(source) } : view);
    });
    setActiveViewId(to);
    setClassificationNotice("Angle labels updated.");
  }
  function continuePlacement() {
    const workflow = (["front", "left", "right"] as ProjectViewId[]).filter((id) => viewsRef.current.some((view) => view.id === id && view.photo)),
      next = workflow[workflow.indexOf(activeViewId) + 1];
    if (next) setActiveViewId(next);
  }
  async function automaticMask(view: ProjectView = activeView) {
    const { photo, placement } = view;
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
  async function normalizeConcept(imageUrl: string, targetPhoto: NormalizedPhoto = photo!) {
    if (!targetPhoto) throw new Error("Photo is not ready");
    const response = await fetch(imageUrl);
    if (!response.ok)
      throw new Error("The generated concept could not be loaded.");
    const bitmap = await createImageBitmap(await response.blob()),
      canvas = document.createElement("canvas");
    canvas.width = targetPhoto.width;
    canvas.height = targetPhoto.height;
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
  function clearConcept() {
    colorSequenceRef.current += 1;
    if (colorTimerRef.current) clearTimeout(colorTimerRef.current);
    colorTimerRef.current = null;
    if (updatingColors) abortRef.current?.abort();
    setViews((current) => current.map((view) => view.concept ? {
      ...view, stale: true,
      status: "Design selections changed. Regenerate this view to apply them.",
    } : view));
    setCompare(50);
  }
  const displayColor = (value: string, customHex: string, customName: string) =>
    value === "Custom Color"
      ? `Custom Color${customName ? ` — ${customName}` : ""} (${customHex})`
      : value;
  const resolvedFrameColor = displayColor(
    frameColor,
    frameCustomColor,
    frameCustomColorName,
  );
  useEffect(() => {
    viewsRef.current = views;
  }, [views]);
  const resolvedLouverColor =
    louverColor === "Match Frame"
      ? resolvedFrameColor
      : displayColor(louverColor, louverCustomColor, louverCustomColorName);
  const designSpecs = {
    addOnIds: addOns,
    frameColor: resolvedFrameColor,
    louverColor: usesLouverColor(primaryId) ? resolvedLouverColor : null,
    louverColorMatchesFrame:
      usesLouverColor(primaryId) && louverColor === "Match Frame",
    zipFabricColor:
      addOns.includes("zip") || addOns.includes("ceiling_zip")
        ? displayColor(zipFabricColor, zipCustomColor, zipCustomColorName)
        : null,
    fabricColor: usesFabricColor(primaryId)
      ? displayColor(fabricColor, fabricCustomColor, fabricCustomColorName)
      : null,
    glassSystemColor:
      addOns.includes("sliding_glass") || addOns.includes("guillotine") || addOns.includes("solidroll")
        ? displayColor(glassSystemColor, glassCustomColor, glassCustomColorName)
        : null,
    ledTemperature: addOns.includes("led") ? ledTemperature : null,
    ledPlacement: addOns.includes("led") ? ledPlacement : null,
  };
  function queueColorUpdate(target: ColorTarget, apply: () => void) {
    apply();
    setViews((current) => current.map((view) => view.id !== activeViewId && view.concept ? {
      ...view, stale: true,
      status: "Design selections changed. Regenerate this view to apply them.",
    } : view));
    if (!result) return;
    const sequence = ++colorSequenceRef.current;
    if (colorTimerRef.current) clearTimeout(colorTimerRef.current);
    if (updatingColors) abortRef.current?.abort();
    setStatus("Updating colors…");
    const source = result;
    const run = () => {
      if (sequence !== colorSequenceRef.current) return;
      if (generatingRef.current) {
        colorTimerRef.current = setTimeout(run, 100);
        return;
      }
      colorTimerRef.current = null;
      void generateRef.current(false, { target, source, sequence });
    };
    colorTimerRef.current = setTimeout(run, 650);
  }
  function cancelPendingColorUpdate() {
    colorSequenceRef.current += 1;
    if (colorTimerRef.current) clearTimeout(colorTimerRef.current);
    colorTimerRef.current = null;
    if (!colorUpdateActiveRef.current) return;
    abortRef.current?.abort();
    colorUpdateActiveRef.current = false;
    activeRequestRef.current = null;
    generatingRef.current = false;
    setGenerating(false);
    setUpdatingColors(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    abortRef.current = null;
  }
  function startManualGeneration(highQuality = false) {
    if (!viewsRef.current.find((view) => view.id === "front")?.photo) {
      setStatus("Front View photo missing. Upload the required Front View first.");
      return;
    }
    if (!photo) {
      setStatus("Photo missing. Upload a valid project-area photo first.");
      return;
    }
    if (!isPlacementReady(placement)) {
      setStatus("Installation area incomplete. Select exactly four valid corner points.");
      return;
    }
    cancelPendingColorUpdate();
    if (generatingRef.current) {
      setStatus("Another request active. Cancel it before starting a new concept.");
      return;
    }
    void generateRef.current(highQuality, undefined, activeViewId);
  }
  function choosePrimary(nextId: PrimarySystemId) {
    clearConcept();
    setAddOns((current) => reconcileAddOns(nextId, current));
    onProductChange(nextId);
  }
  function chooseAddOn(id: AddOnId) {
    clearConcept();
    setAddOns((current) => toggleAddOn(primaryId, current, id));
  }
  function changeMeasurement(key: keyof Measurements, value: string) {
    clearConcept();
    setMeasurements((current) => ({ ...current, [key]: value }));
  }
  function resetDesign() {
    batchCancelledRef.current = true;
    batchGeneratingRef.current = false;
    setBatchGenerating(false);
    setBatchStatus("");
    colorSequenceRef.current += 1;
    if (colorTimerRef.current) clearTimeout(colorTimerRef.current);
    colorTimerRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    activeRequestRef.current = null;
    colorUpdateActiveRef.current = false;
    generatingRef.current = false;
    setUpdatingColors(false);
    setElapsed(0);
    setCompare(50);
    setViews((current) => current.map((view) => {
      if (view.concept?.image.startsWith("blob:"))
        URL.revokeObjectURL(view.concept.image);
      return resetProjectViewDesign(view);
    }));
    setAddOns([]);
    setFrameColor("Anthracite Gray");
    setLouverColor("Match Frame");
    setZipFabricColor("Sand");
    setFabricColor("Sand");
    setFrameCustomColor("#8a735f");
    setFrameCustomColorName("");
    setLouverCustomColor("#8a735f");
    setLouverCustomColorName("");
    setZipCustomColor("#8a735f");
    setZipCustomColorName("");
    setFabricCustomColor("#8a735f");
    setFabricCustomColorName("");
    setGlassSystemColor("Anthracite Gray");
    setGlassCustomColor("#3b4141");
    setGlassCustomColorName("");
    setLedTemperature("Warm White");
    setLedPlacement("Perimeter LED");
    setMeasurements({ width: "", depth: "", height: "" });
    onProductChange(primarySystemIds[0]);
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
      `Primary system: ${primaryLabels[primaryId] || product.label}`,
      `Add-ons: ${addOns.length ? addOns.map((id) => addOnLabels[id]).join(", ") : "None"}`,
      `Frame color preference: ${designSpecs.frameColor}`,
      designSpecs.louverColor &&
        `Louver / roof color preference: ${designSpecs.louverColor}${designSpecs.louverColorMatchesFrame ? " (matches frame)" : ""}`,
      designSpecs.zipFabricColor && `ZIP screen fabric preference: ${designSpecs.zipFabricColor}`,
      designSpecs.fabricColor && `Fabric color preference: ${designSpecs.fabricColor}`,
      designSpecs.glassSystemColor && `Glass-system frame color preference: ${designSpecs.glassSystemColor}`,
      designSpecs.ledTemperature && `LED temperature: ${designSpecs.ledTemperature}`,
      designSpecs.ledPlacement && `LED placement: ${designSpecs.ledPlacement}`,
      `Provided measurements: ${dims}`,
      `AI concept generated: ${concept ? "Yes" : "No"}`,
    ].filter(Boolean).join("\n");
  }
  function multiViewSummary(successful: { viewId: ProjectViewId; label: string; image: string }[]) {
    const uploaded = viewsRef.current.filter((view) => view.photo);
    return [
      summary(selected, successful.length > 0),
      `Uploaded views: ${uploaded.length} (${uploaded.map((view) => view.label).join(", ")})`,
      `Successfully generated views: ${successful.length ? successful.map((view) => view.label).join(", ") : "None"}`,
      ...successful.map((view) => `${view.label} concept reference: ${view.image}`),
    ].join("\n");
  }
  async function generate(highQuality = false, colorUpdate?: ColorUpdate, viewId: ProjectViewId = activeViewId, generationOrder = 1) {
    const targetView = viewsRef.current.find((view) => view.id === viewId) || viewsRef.current[0],
      photo = targetView.photo,
      placement = targetView.placement,
      result = targetView.concept,
      setStatus = (next: string) => patchView(viewId, { status: next }),
      setUploadProgress = (next: number) => patchView(viewId, { uploadProgress: next }),
      setGenerating = (next: boolean) => patchView(viewId, { generating: next });
    if (!photo) {
      setStatus("Photo missing. Upload a valid project-area photo first.");
      return;
    }
    if (!isPlacementReady(placement)) {
      setStatus("Installation area incomplete. Select exactly four valid corner points.");
      return;
    }
    if (generatingRef.current) {
      setStatus("Another request active. Cancel it before starting a new concept.");
      return;
    }
    const requestId = crypto.randomUUID();
    patchView(viewId, { requestId });
    activeRequestRef.current = requestId;
    generatingRef.current = true;
    colorUpdateActiveRef.current = Boolean(colorUpdate);
    trackEvent("visualizer_generate_start", {
      product_id: selected.id,
      quality: highQuality ? "high" : "preview",
      add_on_count: addOns.length,
    });
    setElapsed(0);
    setGenerating(true);
    setUpdatingColors(Boolean(colorUpdate));
    setUploadProgress(0);
    setStatus(
      colorUpdate
        ? "Updating colors…"
        : highQuality
        ? "Creating your higher-quality concept…"
        : "Creating your concept…",
    );
    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    let requestStage: "preparing" | "session" | "upload" | "api" = "preparing";
    const armTimeout = (milliseconds: number) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, milliseconds);
    };
    // Uploading and AI generation are separate network operations. Do not let
    // photo preparation and Blob upload consume the provider's time budget.
    armTimeout(60_000);
    try {
      const sharedDesignFingerprint = await hashText(sharedDesignFingerprintSource({
          productId: selected.id, ...designSpecs, measurements,
        })),
        projectId = projectIdRef.current;
      const editSource = colorUpdate
          ? await fetch(colorUpdate.source.image).then((response) => {
              if (!response.ok) throw new Error("The current concept could not be prepared for recoloring.");
              return response.blob();
            })
          : photo.normalized,
        editSourceHash = colorUpdate ? await hashBlob(editSource) : photo.hash,
        mask = await automaticMask(targetView),
        diagnostic = new FormData();
      diagnostic.append("photo", editSource, "project.jpg");
      diagnostic.append("mask", mask, "mask.png");
      diagnostic.append("productId", selected.id);
      diagnostic.append(
        "specs",
        JSON.stringify({
          measurements,
          ...designSpecs,
          editMode: colorUpdate ? "color_update" : "install",
          colorTarget: colorUpdate?.target || null,
          projectId,
          viewId,
          viewLabel: targetView.label,
          sharedDesignFingerprint,
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
          normalizedPhotoBytes: editSource.size,
          maskBytes: mask.size,
          totalRequestBytes,
        }),
      }).catch(() => {});
      if (totalRequestBytes > 3.8 * 1024 * 1024)
        throw new Error(
          "This photo is too large to process. Please choose another photo.",
        );
      requestStage = "session";
      const sessionResponse = await fetch("/api/visualize/session", {
          method: "POST",
          headers: { "X-Request-ID": requestId },
          signal: controller.signal,
        }),
        session = await sessionResponse.json().catch(() => null);
      if (!sessionResponse.ok || typeof session?.uploadPrefix !== "string")
        throw new Error("The secure upload session could not be created.");
      const uploadPrivateImage = async (kind: "photo" | "mask", file: Blob) => {
        const form = new FormData();
        form.append("requestId", requestId);
        form.append("kind", kind);
        form.append("file", file, kind === "mask" ? "mask.png" : "photo.jpg");
        const response = await fetch("/api/visualize/upload", {
            method: "POST",
            headers: { "X-Request-ID": requestId },
            body: form,
            signal: controller.signal,
          }),
          payload = await response.json().catch(() => null);
        if (!response.ok || typeof payload?.pathname !== "string")
          throw new Error(payload?.error || `The ${kind} upload failed.`);
        return payload.pathname as string;
      };
      requestStage = "upload";
      setUploadProgress(10);
      const photoObjectId = await uploadPrivateImage("photo", editSource);
      setUploadProgress(55);
      const maskObjectId = await uploadPrivateImage("mask", mask);
      setUploadProgress(100);
      setStatus(
        colorUpdate
          ? "Updating colors…"
          : highQuality
          ? "Creating your higher-quality concept…"
          : "Creating your concept…",
      );
      requestStage = "api";
      timedOut = false;
      armTimeout(160_000);
      const response = await fetch("/api/visualize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Request-ID": requestId,
          },
          body: JSON.stringify({
            photoObjectId,
            maskObjectId,
            photoHash: editSourceHash,
            productId: selected.id,
            requestId,
            projectId,
            viewId,
            viewLabel: targetView.label,
            sharedDesignFingerprint,
            specs: {
              ...designSpecs,
              measurements,
              placement,
              unit: "ft",
              quality: highQuality ? "high" : "preview",
              editMode: colorUpdate ? "color_update" : "install",
              colorTarget: colorUpdate?.target || null,
              projectId,
              viewId,
              viewLabel: targetView.label,
              sharedDesignFingerprint,
              generationOrder,
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
          [
            ...selected.referenceImages,
            ...selectedAddOnProducts.flatMap((product) => product.referenceImages),
          ],
          window.location.href,
        )
      )
        throw new Error(
          `The image service returned the product reference instead of a generated concept. Reference: ${requestId}`,
        );
      const normalizedConceptUrl = await normalizeConcept(payload.imageUrl, photo),
        concept: Concept = {
          image: normalizedConceptUrl,
          referenceUrl: payload.imageUrl,
          productId: selected.id,
          productLabel: selected.label,
          measurements: { ...measurements },
          unit: "ft",
          frameColor: designSpecs.frameColor,
          addOns: [...addOns],
          quality: highQuality ? "high" : "preview",
        };
      if (colorUpdate && colorUpdate.sequence !== colorSequenceRef.current) {
        URL.revokeObjectURL(normalizedConceptUrl);
        return;
      }
      if (result?.image.startsWith("blob:") && result.image !== normalizedConceptUrl)
        URL.revokeObjectURL(result.image);
      patchView(viewId, { concept, stale: false, requestId, status: `${disclaimer}${payload.cached ? " Previous matching result reused." : ""}` });
      setCompare(50);
      trackEvent("visualizer_generate_complete", {
        product_id: selected.id,
        quality: highQuality ? "high" : "preview",
        add_on_count: addOns.length,
        cached_result: Boolean(payload.cached),
      });
      const successful = viewsRef.current.filter((view) => view.concept && view.id !== viewId)
        .map((view) => ({ viewId: view.id, label: view.label, image: view.concept!.referenceUrl }));
      successful.push({ viewId, label: targetView.label, image: payload.imageUrl });
      onRequestProject({ productId: selected.id, context: multiViewSummary(successful), conceptImage: payload.imageUrl, conceptImages: successful });
    } catch (error) {
      const superseded = Boolean(colorUpdate && colorUpdate.sequence !== colorSequenceRef.current);
      const rawMessage = error instanceof Error ? error.message : "Generation failed.",
        stageMessage = requestStage === "session"
          ? `Upload session failure. ${rawMessage}`
          : requestStage === "upload"
            ? `Photo upload failure. ${rawMessage}`
            : requestStage === "api"
              ? `API failure. ${rawMessage}`
              : rawMessage,
        message = timedOut
        ? requestStage === "api"
          ? `The image service did not finish this concept. Please retry. Reference: ${requestId}`
          : `The photo upload timed out. Please retry. Reference: ${requestId}`
        : controller.signal.aborted
          ? `Generation cancelled. Reference: ${requestId}`
          : stageMessage;
      if (!superseded) {
        setStatus(colorUpdate
          ? `Color update failed. Your previous concept is still available. Retry by selecting the color again. ${message.includes("Reference:") ? message : `Reference: ${requestId}`}`
          : message.includes("Reference:") ? message : `${message} Reference: ${requestId}`);
        if (!colorUpdate) patchView(viewId, { status: message.includes("Reference:") ? message : `${message} Reference: ${requestId}` });
        void fetch("/api/client-error", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Request-ID": requestId,
          },
          body: JSON.stringify({
            message: `[visualizer:${requestStage}] ${message}`,
            stack: error instanceof Error ? error.stack || null : null,
            componentStack: null,
            path: window.location.pathname,
          }),
        }).catch(() => {});
      }
    } finally {
      if (activeRequestRef.current === requestId) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        abortRef.current = null;
        activeRequestRef.current = null;
        colorUpdateActiveRef.current = false;
        generatingRef.current = false;
        setGenerating(false);
        setUpdatingColors(false);
      }
    }
  }
  useEffect(() => {
    generateRef.current = generate;
  });
  async function generateReadyViews(updateOnly = false) {
    if (batchGeneratingRef.current || generatingRef.current) {
      setBatchStatus("Another request active. Cancel it before starting a multi-angle batch.");
      return;
    }
    if (!viewsRef.current.find((view) => view.id === "front")?.photo) {
      setBatchStatus("Front View photo missing. Upload the required Front View before generating.");
      return;
    }
    const ready = viewsRef.current.filter((view) =>
      view.photo && isPlacementReady(view.placement) && (!updateOnly || view.stale || !view.concept),
    );
    if (!ready.length) {
      setBatchStatus("No uploaded views with four valid installation-area points are ready.");
      return;
    }
    batchCancelledRef.current = false;
    batchGeneratingRef.current = true;
    setBatchGenerating(true);
    try {
      for (let index = 0; index < ready.length; index += 1) {
        if (batchCancelledRef.current) break;
        const view = ready[index];
        setActiveViewId(view.id);
        setBatchStatus(`Generating view ${index + 1} of ${ready.length} — ${view.label}`);
        await generateRef.current(false, undefined, view.id, index + 1);
      }
    } finally {
      batchGeneratingRef.current = false;
      setBatchGenerating(false);
      setBatchStatus(batchCancelledRef.current ? "Multi-angle generation cancelled. Completed concepts were preserved." : "Multi-angle generation finished. Review each view below.");
    }
  }
  function cancelBatch() {
    batchCancelledRef.current = true;
    abortRef.current?.abort();
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
    const successful = viewsRef.current.filter((view) => view.concept).map((view) => ({ viewId: view.id, label: view.label, image: view.concept!.referenceUrl }));
    onRequestProject({
      productId: selected.id,
      context: multiViewSummary(successful),
      conceptImage: result?.referenceUrl,
      conceptImages: successful,
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
            <span /> AI Photo Visualizer
          </p>
          <h2 id="visualizer-title">
            Design Your Outdoor System.
            <br />
            <em>See it in your space.</em>
          </h2>
        </div>
        <p>
          Upload up to three photographs of the same installation area and create a consistent multi-angle concept. This is not a true 3D or 360° reconstruction.
        </p>
      </div>
      <div className="ai-workspace">
        <div className="ai-stage-shell">
        {uploadedViews.length > 0 && <div className="view-tabs" role="tablist" aria-label="Uploaded project views">
          {views.filter((view) => view.photo).map((view) => (
            <button key={view.id} type="button" role="tab" aria-selected={activeViewId === view.id} onClick={() => setActiveViewId(view.id)}>
              {view.label.replace(" View", "")}{view.stale ? " · Update needed" : ""}
            </button>
          ))}
          {uploadedViews.length < 3 && <label className="add-angle"><span>Add another angle</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => choosePhotos(event.target.files || undefined)} /></label>}
        </div>}
        {uploadedViews.length > 0 && <p className="active-view-label">Editing installation area: {activeView.label} · Installation areas: {readyPlacementCount} of {uploadedViews.length} ready</p>}
        <div className={`ai-stage${draggingUpload ? " upload-dragging" : ""}`} ref={stageRef}
          onDragOver={(event) => { event.preventDefault(); setDraggingUpload(true); }}
          onDragLeave={() => setDraggingUpload(false)}
          onDrop={(event) => { event.preventDefault(); setDraggingUpload(false); void choosePhotos(event.dataTransfer.files); }}>
          {uploadedViews.length === 0 ? (
            <div className="ai-empty multi-upload-empty">
              <ImagePlus />
              <strong>Upload Your Project Views</strong>
              <span>Select up to three photos showing different sides of the same installation area.</span>
              <label className="choose-project-photos"><span>Choose Project Photos</span><input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => choosePhotos(event.target.files || undefined)}
              /></label>
              <label className="camera-project-photo"><span>Take a photo</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => choosePhotos(event.target.files || undefined)} /></label>
              <small>Front and side photos work best. JPG, PNG or WebP · maximum 10 MB each.</small>
              <small>Photos are optimized in your browser and securely processed to organize your project views.</small>
            </div>
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
                  {activeView.stale && <span className="stale-concept">Update needed — Design selections changed. Regenerate this view to apply them.</span>}
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
                  width={photo.width}
                  height={photo.height}
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
            <div className={`generation-overlay${updatingColors ? " color-update" : ""}`} aria-live="polite">
              <Sparkles />
              <strong>
                {updatingColors
                  ? "Updating colors…"
                  : uploadProgress < 100
                  ? "Uploading optimized photo…"
                  : "Creating your concept…"}
              </strong>
              <span>
                {uploadProgress < 100 ? `${uploadProgress}% · ` : ""}Elapsed: {elapsed} seconds
              </span>
            </div>
          )}
          {classifyingViews && <div className="generation-overlay" aria-live="polite"><Sparkles /><strong>Organizing your project views…</strong></div>}
        </div>
        {uploadedViews.length > 0 && <div className="angle-classification" role="status" aria-live="polite">
          {classificationNotice && <span>{classificationNotice}</span>}
          <button type="button" onClick={() => setCorrectingAngles((value) => !value)}>Correct Angles</button>
          <label className="replace-angle"><span>Replace active photo</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => choosePhotos(event.target.files || undefined, activeViewId)} /></label>
          {uploadedViews.length > 1 && !activeView.required && <button type="button" onClick={() => removePhoto(activeViewId)}>Remove active photo</button>}
          {correctingAngles && <div className="angle-corrections">
            {uploadedViews.map((view) => <label key={view.photo!.uploadId}>{view.photo!.file.name}<select value={view.id} onChange={(event) => correctAngle(view.id, event.target.value as ProjectViewId)}><option value="left">Left</option><option value="front">Front</option><option value="right">Right</option></select></label>)}
          </div>}
        </div>}
        </div>
        <aside className="ai-panel">
          <div className="ai-step">
            <span>01</span>
            <div>
              <strong>Project-area photographs</strong>
              <small>
                Maximum 1536 px. The original full-resolution file is never
                uploaded.
              </small>
            </div>
          </div>
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
            {isPlacementReady(placement) && (["front", "left", "right"] as ProjectViewId[]).filter((id) => views.some((view) => view.id === id && view.photo)).indexOf(activeViewId) < uploadedViews.length - 1 && <button type="button" onClick={continuePlacement}>Continue to next angle</button>}
          </div>
          <div className="ai-step">
            <span>02</span>
            <div>
              <strong>Primary system</strong>
              <small>Choose one system. Generation starts only when you request it.</small>
            </div>
          </div>
          <div className="product-card-strip" role="radiogroup" aria-label="Primary system">
            {primarySystemIds.map((id) => {
              const product = products.find((item) => item.id === id)!;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={primaryId === id}
                  className={`design-product-card ${primaryId === id ? "selected" : ""}`}
                  onClick={() => choosePrimary(id)}
                >
                  <img
                    src={getProductDisplayImage(product)}
                    width={480}
                    height={320}
                    loading="lazy"
                    decoding="async"
                    alt=""
                  />
                  <span>{primaryLabels[id]}</span>
                  {primaryId === id && <strong aria-hidden="true">✓</strong>}
                </button>
              );
            })}
          </div>
          <div className="ai-step compact">
            <span>03</span>
            <div>
              <strong>Compatible add-ons</strong>
              <small>Select up to three. Unavailable choices explain why.</small>
            </div>
          </div>
          <div className="addon-card-grid" aria-label="Compatible add-ons">
            {addOnIds.map((id) => {
              const compatible = compatibility[primaryId].includes(id),
                active = addOns.includes(id),
                product = products.find((item) => item.id === id),
                atLimit = addOns.length >= 3 && !active,
                reason = !compatible
                  ? `Not currently offered with ${primaryLabels[primaryId]}.`
                  : atLimit
                    ? "Choose no more than three add-ons."
                    : "";
              return (
                <button
                  key={id}
                  type="button"
                  className={`addon-card ${active ? "selected" : ""}`}
                  aria-pressed={active}
                  disabled={!compatible || atLimit}
                  title={reason}
                  onClick={() => chooseAddOn(id)}
                >
                  {product?.referenceImages[0] && (
                    <img
                      src={getProductDisplayImage(product)}
                      width={480}
                      height={320}
                      loading="lazy"
                      decoding="async"
                      alt=""
                    />
                  )}
                  <span>{addOnLabels[id]}</span>
                  {active && <strong aria-hidden="true">✓</strong>}
                </button>
              );
            })}
          </div>
          <div className="ai-step">
            <span>04</span>
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
                onChange={(event) => changeMeasurement("width", event.target.value)}
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
                onChange={(event) => changeMeasurement("depth", event.target.value)}
              />
            </label>
            <label>
              Height<span>optional · ft</span>
              <input
                type="number"
                min="0"
                max="100"
                value={measurements.height}
                onChange={(event) => changeMeasurement("height", event.target.value)}
              />
            </label>
          </div>
          <div className="ai-step compact"><span>05</span><div><strong>Colors & lighting</strong><small>Preferences are confirmed during consultation.</small></div></div>
          <ColorSwatches label="Frame Color" options={frameColors} value={frameColor} onChange={(value) => queueColorUpdate(usesLouverColor(primaryId) && louverColor === "Match Frame" ? "frame_and_matching_louvers" : "frame", () => setFrameColor(value))} />
          {frameColor === "Custom Color" && <CustomColorFields component="Frame" color={frameCustomColor} name={frameCustomColorName} onColorChange={(value) => queueColorUpdate(usesLouverColor(primaryId) && louverColor === "Match Frame" ? "frame_and_matching_louvers" : "frame", () => setFrameCustomColor(value))} onNameChange={(value) => queueColorUpdate(usesLouverColor(primaryId) && louverColor === "Match Frame" ? "frame_and_matching_louvers" : "frame", () => setFrameCustomColorName(value))} />}
          {usesLouverColor(primaryId) && <ColorSwatches label="Louver Color" options={louverColors} value={louverColor} onChange={(value) => queueColorUpdate("louver", () => setLouverColor(value))} />}
          {usesLouverColor(primaryId) && louverColor === "Custom Color" && <CustomColorFields component="Louver" color={louverCustomColor} name={louverCustomColorName} onColorChange={(value) => queueColorUpdate("louver", () => setLouverCustomColor(value))} onNameChange={(value) => queueColorUpdate("louver", () => setLouverCustomColorName(value))} />}
          {(addOns.includes("zip") || addOns.includes("ceiling_zip")) && <ColorSwatches label="ZIP Screen Fabric Color" options={zipColors} value={zipFabricColor} onChange={(value) => queueColorUpdate("zip_fabric", () => setZipFabricColor(value))} />}
          {(addOns.includes("zip") || addOns.includes("ceiling_zip")) && zipFabricColor === "Custom Color" && <CustomColorFields component="ZIP fabric" color={zipCustomColor} name={zipCustomColorName} onColorChange={(value) => queueColorUpdate("zip_fabric", () => setZipCustomColor(value))} onNameChange={(value) => queueColorUpdate("zip_fabric", () => setZipCustomColorName(value))} />}
          {usesFabricColor(primaryId) && <ColorSwatches label="Fabric Color" options={fabricColors} value={fabricColor} onChange={(value) => queueColorUpdate("fabric", () => setFabricColor(value))} />}
          {usesFabricColor(primaryId) && fabricColor === "Custom Color" && <CustomColorFields component="Fabric" color={fabricCustomColor} name={fabricCustomColorName} onColorChange={(value) => queueColorUpdate("fabric", () => setFabricCustomColor(value))} onNameChange={(value) => queueColorUpdate("fabric", () => setFabricCustomColorName(value))} />}
          {(addOns.includes("sliding_glass") || addOns.includes("guillotine") || addOns.includes("solidroll")) && <ColorSwatches label="Glass System Frame Color" options={frameColors} value={glassSystemColor} onChange={(value) => queueColorUpdate("glass_system", () => setGlassSystemColor(value))} />}
          {(addOns.includes("sliding_glass") || addOns.includes("guillotine") || addOns.includes("solidroll")) && glassSystemColor === "Custom Color" && <CustomColorFields component="Glass system frame" color={glassCustomColor} name={glassCustomColorName} onColorChange={(value) => queueColorUpdate("glass_system", () => setGlassCustomColor(value))} onNameChange={(value) => queueColorUpdate("glass_system", () => setGlassCustomColorName(value))} />}
          {addOns.includes("led") && (
            <div className="lighting-options">
              <fieldset><legend>Light temperature</legend>{["Warm White", "Neutral White", "Cool White"].map((value) => <label key={value}><input type="radio" name="led-temperature" checked={ledTemperature === value} onChange={() => { clearConcept(); setLedTemperature(value); }} />{value}</label>)}</fieldset>
              <fieldset><legend>Lighting placement</legend>{["Perimeter LED", "Louver-integrated LED", "Both"].map((value) => <label key={value}><input type="radio" name="led-placement" checked={ledPlacement === value} onChange={() => { clearConcept(); setLedPlacement(value); }} />{value}</label>)}</fieldset>
            </div>
          )}
          <div className="design-summary">
            <div><strong>Your Design</strong><button type="button" onClick={resetDesign}>Reset Design</button></div>
            <dl>
              <dt>Primary system</dt><dd>{primaryLabels[primaryId]}</dd>
              <dt>Add-ons</dt><dd>{addOns.length ? addOns.map((id) => addOnLabels[id]).join(", ") : "None"}</dd>
              <dt>Frame color</dt><dd>{designSpecs.frameColor}</dd>
              <dt>Louver / roof color</dt><dd>{designSpecs.louverColor ? `${designSpecs.louverColor}${designSpecs.louverColorMatchesFrame ? " (matches frame)" : ""}` : "Not applicable"}</dd>
              <dt>ZIP fabric color</dt><dd>{designSpecs.zipFabricColor || "Not applicable"}</dd>
              <dt>Other fabric color</dt><dd>{designSpecs.fabricColor || "Not applicable"}</dd>
              <dt>Glass-system frame color</dt><dd>{designSpecs.glassSystemColor || "Not applicable"}</dd>
              <dt>LED selection</dt><dd>{designSpecs.ledTemperature ? `${designSpecs.ledTemperature} · ${designSpecs.ledPlacement}` : "None"}</dd>
              <dt>Dimensions</dt><dd>{[measurements.width && `${measurements.width} ft W`, measurements.depth && `${measurements.depth} ft ${secondLabel}`, measurements.height && `${measurements.height} ft H`].filter(Boolean).join(" · ") || "Not provided"}</dd>
            </dl>
          </div>
          <div className="visualizer-actions">
            {generating || batchGenerating ? (
              <button
                type="button"
                className="button generate"
                onClick={() => batchGenerating ? cancelBatch() : abortRef.current?.abort()}
              >
                <X /> Cancel
              </button>
            ) : (
              <button
                type="button"
                className="button generate"
                onClick={() => startManualGeneration(false)}
              >
                <Sparkles /> Generate This View
              </button>
            )}
            {!generating && !batchGenerating && <button type="button" className="visualizer-secondary batch-generate" onClick={() => generateReadyViews(false)}>Generate All Ready Views</button>}
            {!generating && !batchGenerating && views.some((view) => view.stale) && <button type="button" className="visualizer-secondary batch-generate" onClick={() => generateReadyViews(true)}>Update All Views</button>}
            {result && result.quality !== "high" && (
              <button
                type="button"
                className="visualizer-secondary quality"
                  onClick={() => startManualGeneration(true)}
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
          {batchStatus && <p className="batch-status" role="status" aria-live="polite">{batchStatus}</p>}
        </aside>
      </div>
      <MultiAngleResults views={views} />
    </section>
  );
}
