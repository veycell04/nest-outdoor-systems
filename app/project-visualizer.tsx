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
};
type Measurements = { width: string; depth: string; height: string };
type ColorTarget = "frame" | "louver" | "zip_fabric" | "fabric" | "glass_system" | "frame_and_matching_louvers";
type Concept = {
  image: string;
  productId: string;
  productLabel: string;
  measurements: Measurements;
  unit: "ft";
  frameColor: string;
  addOns: AddOnId[];
  quality: "preview" | "high";
};
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
  const [result, setResult] = useState<Concept | null>(null),
    [compare, setCompare] = useState(50),
    [generating, setGenerating] = useState(false),
    [status, setStatus] = useState(""),
    [uploadProgress, setUploadProgress] = useState(0),
    [elapsed, setElapsed] = useState(0),
    [updatingColors, setUpdatingColors] = useState(false),
    [placement, setPlacement] = useState<PolygonPoint[]>([]),
    [displayBounds, setDisplayBounds] =
      useState<ReturnType<typeof containRect>>(null);
  const abortRef = useRef<AbortController | null>(null),
    timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null),
    colorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null),
    colorSequenceRef = useRef(0),
    generatingRef = useRef(false),
    colorUpdateActiveRef = useRef(false),
    activeRequestRef = useRef<string | null>(null),
    generateRef = useRef<(highQuality?: boolean, colorUpdate?: ColorUpdate) => Promise<void>>(async () => {}),
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
  function clearConcept() {
    colorSequenceRef.current += 1;
    if (colorTimerRef.current) clearTimeout(colorTimerRef.current);
    colorTimerRef.current = null;
    if (updatingColors) abortRef.current?.abort();
    if (result?.image.startsWith("blob:")) URL.revokeObjectURL(result.image);
    setResult(null);
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
  const placementReady = isPlacementReady(placement);
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
    if (!photo) {
      setStatus("Photo missing. Upload a valid project-area photo first.");
      return;
    }
    if (!placementReady) {
      setStatus("Installation area incomplete. Select exactly four valid corner points.");
      return;
    }
    cancelPendingColorUpdate();
    if (generatingRef.current) {
      setStatus("Another request active. Cancel it before starting a new concept.");
      return;
    }
    void generateRef.current(highQuality);
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
    clearConcept();
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
  async function generate(highQuality = false, colorUpdate?: ColorUpdate) {
    if (!photo) {
      setStatus("Photo missing. Upload a valid project-area photo first.");
      return;
    }
    if (!placementReady) {
      setStatus("Installation area incomplete. Select exactly four valid corner points.");
      return;
    }
    if (generatingRef.current) {
      setStatus("Another request active. Cancel it before starting a new concept.");
      return;
    }
    const requestId = crypto.randomUUID();
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
    timeoutRef.current = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 90_000);
    try {
      const editSource = colorUpdate
          ? await fetch(colorUpdate.source.image).then((response) => {
              if (!response.ok) throw new Error("The current concept could not be prepared for recoloring.");
              return response.blob();
            })
          : photo.normalized,
        editSourceHash = colorUpdate ? await hashBlob(editSource) : photo.hash,
        mask = await automaticMask(),
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
      requestStage = "upload";
      const [photoUpload, maskUpload] = await Promise.all([
        upload(
          `${session.uploadPrefix}/${requestId}/photo.jpg`,
          editSource,
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
        colorUpdate
          ? "Updating colors…"
          : highQuality
          ? "Creating your higher-quality concept…"
          : "Creating your concept…",
      );
      requestStage = "api";
      const response = await fetch("/api/visualize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Request-ID": requestId,
          },
          body: JSON.stringify({
            photoObjectId: photoUpload.pathname,
            maskObjectId: maskUpload.pathname,
            photoHash: editSourceHash,
            productId: selected.id,
            requestId,
            specs: {
              ...designSpecs,
              measurements,
              placement,
              unit: "ft",
              quality: highQuality ? "high" : "preview",
              editMode: colorUpdate ? "color_update" : "install",
              colorTarget: colorUpdate?.target || null,
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
      const normalizedConceptUrl = await normalizeConcept(payload.imageUrl),
        concept: Concept = {
          image: normalizedConceptUrl,
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
      setResult(concept);
      setCompare(50);
      trackEvent("visualizer_generate_complete", {
        product_id: selected.id,
        quality: highQuality ? "high" : "preview",
        add_on_count: addOns.length,
        cached_result: Boolean(payload.cached),
      });
      setStatus(
        `${disclaimer}${payload.cached ? " Previous matching result reused." : ""}`,
      );
      onRequestProject({
        productId: selected.id,
        context: summary(selected, true),
        conceptImage: payload.imageUrl,
      });
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
        ? `Generation timed out after 90 seconds. Reference: ${requestId}`
        : controller.signal.aborted
          ? `Generation cancelled. Reference: ${requestId}`
          : stageMessage;
      if (!superseded) {
        setStatus(colorUpdate
          ? `Color update failed. Your previous concept is still available. Retry by selecting the color again. ${message.includes("Reference:") ? message : `Reference: ${requestId}`}`
          : message.includes("Reference:") ? message : `${message} Reference: ${requestId}`);
        if (!colorUpdate) setResult(null);
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
  generateRef.current = generate;
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
            <span /> AI Photo Visualizer
          </p>
          <h2 id="visualizer-title">
            Design Your Outdoor System.
            <br />
            <em>See it in your space.</em>
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
                  <img src={product.referenceImages[0]} alt="" />
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
                  {product?.referenceImages[0] && <img src={product.referenceImages[0]} alt="" />}
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
                onClick={() => startManualGeneration(false)}
              >
                <Sparkles /> Generate My Concept
              </button>
            )}
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
        </aside>
      </div>
    </section>
  );
}
