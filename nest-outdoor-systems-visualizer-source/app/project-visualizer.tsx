"use client";

import { Canvas } from "@react-three/fiber";
import { Environment, PerspectiveCamera } from "@react-three/drei";
import { Download, ImagePlus, RotateCcw, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PergolaModel } from "./pergola-viewer";
import { products } from "../../lib/products";

const visualProducts = products.map((item) => ({
  id: item.id,
  label: item.label,
  viewer: item.viewer,
}));

type ProjectVisualizerProps = {
  onRequestProject: (systemId: string) => void;
};

function drawContain(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  context.drawImage(image, x, y, drawWidth, drawHeight);
}

export function ProjectVisualizer({ onRequestProject }: ProjectVisualizerProps) {
  const [photoUrl, setPhotoUrl] = useState("/pergola-hero.png");
  const [fileName, setFileName] = useState("");
  const [systemId, setSystemId] = useState("bioclimatic_double");
  const [frameColor, setFrameColor] = useState("#303332");
  const [scale, setScale] = useState(82);
  const [horizontal, setHorizontal] = useState(0);
  const [vertical, setVertical] = useState(-4);
  const [message, setMessage] = useState("");
  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const selected = visualProducts.find((item) => item.id === systemId) ?? visualProducts[0];

  useEffect(() => () => {
    if (photoUrl.startsWith("blob:")) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const choosePhoto = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      setMessage("Please choose a JPG, PNG or WEBP photo smaller than 10 MB.");
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setPhotoUrl((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current);
      return nextUrl;
    });
    setFileName(file.name);
    setMessage("Photo added. Use the placement controls to fit the system to your space.");
  };

  const reset = () => {
    setScale(82);
    setHorizontal(0);
    setVertical(-4);
    setFrameColor("#303332");
    setMessage("Placement reset.");
  };

  const downloadPreview = () => {
    const sourceImage = imageRef.current;
    const webglCanvas = stageRef.current?.querySelector("canvas");
    if (!sourceImage || !webglCanvas || !sourceImage.complete) return;
    const output = document.createElement("canvas");
    output.width = 1600;
    output.height = 1000;
    const context = output.getContext("2d");
    if (!context) return;
    drawContain(context, sourceImage, output.width, output.height);
    context.drawImage(webglCanvas, 0, 0, output.width, output.height);
    const link = document.createElement("a");
    link.download = `nest-${systemId}-concept.png`;
    link.href = output.toDataURL("image/png");
    link.click();
    setMessage("Concept image downloaded.");
  };

  return (
    <section id="visualize" className="visualizer-section section" aria-labelledby="visualizer-title">
      <div className="visualizer-heading">
        <div>
          <p className="eyebrow"><span /> Visualize your project</p>
          <h2 id="visualizer-title">See it on your home<br/><em>before it is built.</em></h2>
        </div>
        <p>Upload a clear photo of the installation area, choose a system, then position the concept over your space. No measurements are required.</p>
      </div>

      <div className="visualizer-workspace">
        <div className="visualizer-stage" ref={stageRef}>
          <img ref={imageRef} src={photoUrl} alt="Project area preview" />
          <div className="visualizer-model" aria-label={`${selected.label} concept overlay`}>
            <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}>
              <PerspectiveCamera makeDefault position={[9.8, 6.3, 11.5]} fov={37} />
              <ambientLight intensity={1.65} />
              <directionalLight position={[4, 10, 7]} intensity={3.2} castShadow />
              <group position={[horizontal * .052, vertical * -.035 - 1.05, 0]} scale={scale / 100}>
                <PergolaModel product={selected.viewer} width={12} depth={15} attached={false} roofOpen={28} color={frameColor} lighting screens={false} presentation="overlay" />
              </group>
              <Environment preset="city" />
            </Canvas>
          </div>
          <div className="concept-badge"><Sparkles size={14}/> CONCEPT PREVIEW</div>
          <span className="concept-note">Adjust the model to match the project area</span>
        </div>

        <aside className="visualizer-panel">
          <div className="visualizer-step"><span>01</span><div><strong>Add your project photo</strong><small>Show the full wall, patio, deck or terrace.</small></div></div>
          <label className="visualizer-upload">
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0])}/>
            <ImagePlus size={22}/><span><strong>{fileName || "Upload home photo"}</strong><small>JPG, PNG or WEBP · max 10 MB</small></span>
          </label>

          <div className="visualizer-step"><span>02</span><div><strong>Choose your system</strong><small>The product appears directly on your photo.</small></div></div>
          <label className="visualizer-field">Product or service<select value={systemId} onChange={(event) => setSystemId(event.target.value)}>{visualProducts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <div className="visualizer-finishes" role="group" aria-label="Frame finish">
            <span>Frame finish</span>
            {[{name:"Anthracite",value:"#303332"},{name:"Bronze",value:"#6d5a48"},{name:"White",value:"#deddd8"}].map((tone) => <button type="button" key={tone.value} className={frameColor === tone.value ? "active" : ""} style={{backgroundColor:tone.value}} onClick={() => setFrameColor(tone.value)} aria-label={tone.name}/>) }
          </div>

          <div className="visualizer-step"><span>03</span><div><strong>Fit it to your space</strong><small>Use the controls to create your concept.</small></div></div>
          <div className="placement-controls">
            <label>Size <span>{scale}%</span><input type="range" min="48" max="145" value={scale} onChange={(event) => setScale(Number(event.target.value))}/></label>
            <label>Left / right <span>{horizontal}</span><input type="range" min="-42" max="42" value={horizontal} onChange={(event) => setHorizontal(Number(event.target.value))}/></label>
            <label>Up / down <span>{vertical}</span><input type="range" min="-34" max="28" value={vertical} onChange={(event) => setVertical(Number(event.target.value))}/></label>
          </div>

          <div className="visualizer-actions">
            <button type="button" className="visualizer-secondary" onClick={reset}><RotateCcw size={16}/> Reset</button>
            <button type="button" className="visualizer-secondary" onClick={downloadPreview}><Download size={16}/> Download</button>
            <button type="button" className="button" onClick={() => onRequestProject(systemId)}>Send to our designer <Send size={16}/></button>
          </div>
          <p className="visualizer-status" aria-live="polite">{message || "This is a planning concept. Final design follows site measurement and engineering review."}</p>
        </aside>
      </div>
    </section>
  );
}
