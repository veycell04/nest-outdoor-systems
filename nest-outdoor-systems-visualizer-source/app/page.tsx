"use client";

import { type FormEvent, useState } from "react";
import { ArrowRight, Check, ChevronDown, ImagePlus, Menu, Ruler, Sparkles, X } from "lucide-react";
import { PergolaViewer } from "./pergola-viewer";
import { ProjectVisualizer } from "./project-visualizer";
import { pricedSystems } from "./pricing";

const systems = [
  ...pricedSystems.map((item) => item.id === "awning" ? { ...item, label: "Full Cassette Awning" } : item),
];

const projects = [
  { image: "/projects/elevated-pergola.jpeg", title: "Classic PVC Pergola", type: "Retractable Roof", system: "pvc" },
  { image: "/projects/elevated-glass-veranda.jpeg", title: "Glass Veranda", type: "Glass Roof", system: "glass" },
  { image: "/projects/elevated-guillotine-glass.jpeg", title: "Guillotine Glass", type: "Motorized Glass", system: "guillotine" },
  { image: "/projects/elevated-solidroll.jpg", title: "Solidroll", type: "Product Photograph", system: "solidroll" },
  { image: "/projects/elevated-zip-screen.jpeg", title: "Vertical ZIP Screen", type: "Motorized Screen", system: "zip" },
  { image: "/projects/elevated-cassette-awning.jpeg", title: "Cassette Awning", type: "Retractable Awning", system: "awning" },
  { image: "/projects/elevated-umbrella.jpeg", title: "Square Garden Umbrella", type: "Architectural Shade", system: "umbrella" },
];

export default function Home() {
  const [menu, setMenu] = useState(false);
  const [width, setWidth] = useState<number | "">("");
  const [depth, setDepth] = useState<number | "">("");
  const [height, setHeight] = useState<number | "">("");
  const [system, setSystem] = useState("bioclimatic_double");
  const [structure, setStructure] = useState("attached");
  const [lighting, setLighting] = useState(true);
  const [screens, setScreens] = useState(false);
  const [roofOpen, setRoofOpen] = useState(35);
  const [frameColor, setFrameColor] = useState("#303332");
  const [fileName, setFileName] = useState("");
  const usesOpeningHeight = system === "zip" || system === "guillotine" || system === "sliding_glass";
  const secondDimensionLabel = usesOpeningHeight ? "Height" : system === "umbrella" ? "Length" : "Projection";
  const needsThirdDimension = !usesOpeningHeight && system !== "awning";
  const selectedSystem = systems.find((item) => item.id === system) ?? systems[0];
  const viewerWidth = typeof width === "number" ? width : 12;
  const viewerDepth = typeof depth === "number" ? depth : 16;

  const handleContactSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = encodeURIComponent(`U.S. project inquiry — ${selectedSystem.label}`);
    const body = encodeURIComponent([
      `Name: ${data.get("name")}`,
      `Email: ${data.get("email")}`,
      `Phone: ${data.get("phone") || "Not provided"}`,
      `Project ZIP code: ${data.get("zip") || "Not provided"}`,
      `Interested in: ${selectedSystem.label}`,
      `Dimensions: ${width || "Unknown"} ft wide × ${depth || "Unknown"} ft ${secondDimensionLabel.toLowerCase()}${height ? ` × ${height} ft high` : ""}`,
      `Message: ${data.get("message") || "No additional details"}`,
    ].join("\n"));
    window.location.href = `mailto:hello@nestpergola.com?subject=${subject}&body=${body}`;
  };

  return (
    <main>
      <header className="nav-shell">
        <a className="brand" href="#top" aria-label="NEST Outdoor Systems home"><img src="/brand/nest-outdoor-systems-final.png" alt="NEST Outdoor Systems"/></a>
        <nav className={menu ? "nav-links open" : "nav-links"} aria-label="Primary navigation">
          <a href="#systems" onClick={() => setMenu(false)}>Systems</a>
          <a href="#visualize" onClick={() => setMenu(false)}>Visualizer</a>
          <a href="#process" onClick={() => setMenu(false)}>Process</a>
          <a href="#estimate" onClick={() => setMenu(false)}>Project budget</a>
        </nav>
        <a className="nav-cta" href="#contact">Start a project <ArrowRight size={16} /></a>
        <button className="menu-button" onClick={() => setMenu(!menu)} aria-label="Toggle navigation">{menu ? <X /> : <Menu />}</button>
      </header>

      <section id="top" className="hero">
        <div className="hero-image" />
        <div className="hero-shade" />
        <div className="hero-content">
          <p className="eyebrow"><span /> Designed for life outside</p>
          <h1>Architecture that<br/><em>opens to the sky.</em></h1>
          <p className="hero-copy">Custom pergolas and outdoor enclosure systems, engineered around your home and the way you want to live.</p>
          <div className="hero-actions">
            <a className="button light" href="#visualize">Visualize your space <ArrowRight size={18} /></a>
            <a className="text-link" href="#systems">Explore our systems <ArrowRight size={17} /></a>
          </div>
        </div>
        <div className="hero-note"><span>01</span><div><strong>Tailored to your space</strong><small>Residential · Hospitality · Commercial</small></div></div>
      </section>

      <ProjectVisualizer onRequestProject={(systemId) => { setSystem(systemId); document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" }); }} />

      <section className="showcase-section section" aria-labelledby="showcase-title">
        <div className="showcase-copy">
          <p className="eyebrow"><span /> See it in motion</p>
          <h2 id="showcase-title">Three systems.<br/><em>One outdoor life.</em></h2>
          <p>See the details that transform an open terrace into a finished outdoor room: motorized louvers, integrated lighting and glass enclosures.</p>
          <div className="showcase-actions">
            <a className="button light" href="#estimate">Plan your project <ArrowRight size={18} /></a>
            <a className="text-link" href="#systems">View all systems <ArrowRight size={17} /></a>
          </div>
        </div>
        <div className="showcase-gallery">
          <article className="showcase-video-wrap">
            <video className="showcase-video" autoPlay muted loop playsInline controls preload="metadata" poster="/media/elevated-systems-showcase-poster.jpg" aria-label="Motorized louvered pergola system in operation">
              <source src="/media/elevated-systems-showcase.mp4" type="video/mp4" />
              Your browser does not support embedded video.
            </video>
            <div className="showcase-video-label"><span>01 · Louvered roof</span><strong>Sun and shade control</strong></div>
          </article>
          <article className="showcase-video-wrap">
            <video className="showcase-video" muted loop playsInline controls preload="metadata" poster="/media/elevated-project-showcase-2-poster.jpg" aria-label="Guillotine Glass product in operation">
              <source src="/media/elevated-project-showcase-2.mp4" type="video/mp4" />
              Your browser does not support embedded video.
            </video>
            <div className="showcase-video-label"><span>02 · Guillotine Glass</span><strong>Flexible glass enclosure</strong></div>
          </article>
          <article className="showcase-video-wrap">
            <video className="showcase-video" muted loop playsInline controls preload="metadata" poster="/media/elevated-project-showcase-3-poster.jpg" aria-label="Solidroll product in operation">
              <source src="/media/elevated-project-showcase-3.mp4" type="video/mp4" />
              Your browser does not support embedded video.
            </video>
            <div className="showcase-video-label"><span>03 · Solidroll</span><strong>Open or enclosed</strong></div>
          </article>
        </div>
      </section>

      <section id="systems" className="projects-section section">
        <div className="projects-head">
          <div><p className="eyebrow dark"><span /> Outdoor living systems</p><h2>See the work.<br/><em>Choose your system.</em></h2></div>
          <p>Each photograph shows a system we produce. Select a project to open its matching product in the estimator.</p>
        </div>
        <div className="project-gallery">
          {projects.map((project, index) => <button type="button" className={`project-tile tile-${index + 1}`} key={project.image} onClick={() => { setSystem(project.system); document.getElementById("estimate")?.scrollIntoView({ behavior: "smooth" }); }} aria-label={`Plan a ${project.title} project`}>
            <img src={project.image} alt={`Completed ${project.title} project`} loading={index > 1 ? "lazy" : "eager"}/>
            <span className="project-caption"><span>{project.type}</span><strong>{project.title}</strong><small>0{index + 1}</small></span>
          </button>)}
        </div>
      </section>

      <section id="process" className="process section">
        <div className="process-heading"><p className="eyebrow"><span /> Simple by design</p><h2>From a photograph<br/>to a finished space.</h2></div>
        <div className="steps">
          <article><span>01</span><ImagePlus/><h3>Share your space</h3><p>Add a photo, approximate dimensions, or simply your contact details.</p></article>
          <article><span>02</span><Ruler/><h3>Place your system</h3><p>Choose a product, finish and angle, then fit it over your project area.</p></article>
          <article><span>03</span><Sparkles/><h3>Refine it with a designer</h3><p>Send your concept to our team for measurements, engineering and a project proposal.</p></article>
        </div>
        <aside className="permit-note">
          <p>Permit support</p>
          <strong>Requirements vary by location and system.</strong>
          <span>We review permit needs during project planning and can coordinate engineering drawings and permit support when required. Local permit fees are confirmed after address review.</span>
        </aside>
      </section>

      <section id="estimate" className="estimate-section section">
        <div className="estimate-copy">
          <p className="eyebrow dark"><span /> Project budget request</p>
          <h2>Start with your space.<br/><em>We’ll shape the rest.</em></h2>
          <p>Share what you know and our design team will prepare a preliminary installed budget for your project.</p>
          <ul><li><Check/> No obligation</li><li><Check/> Measurements are optional</li><li><Check/> Your photos stay private</li></ul>
        </div>
        <div className="estimator-card">
          <PergolaViewer product={selectedSystem.viewer} width={viewerWidth} depth={viewerDepth} attached={structure === "attached"} roofOpen={roofOpen} color={frameColor} lighting={lighting} screens={screens} />
          <div className="viewer-controls">
            <label>Opening position <span>{roofOpen}%</span><input aria-label="Opening position" type="range" min="0" max="100" value={roofOpen} onChange={(e) => setRoofOpen(Number(e.target.value))}/></label>
            <fieldset><legend>Frame finish</legend><div className="swatches">
              {[{name:"Anthracite",value:"#303332"},{name:"Bronze",value:"#6d5a48"},{name:"White",value:"#deddd8"}].map((tone) => <button type="button" key={tone.value} className={frameColor === tone.value ? "active" : ""} style={{background:tone.value}} onClick={() => setFrameColor(tone.value)} aria-label={tone.name} title={tone.name}/>) }
            </div></fieldset>
          </div>
          <p className="optional-note">Measurements are helpful, but not required. Leave them blank if you are unsure.</p>
          <div className={`form-row ${needsThirdDimension ? "three" : "two"}`}>
            <label>Width <span>optional · feet</span><input aria-label="Optional width in feet" type="number" min="1" max="60" value={width} placeholder="Not sure" onChange={(e) => setWidth(e.target.value === "" ? "" : Number(e.target.value))}/></label>
            <label>{secondDimensionLabel} <span>optional · feet</span><input aria-label={`Optional ${secondDimensionLabel} in feet`} type="number" min="1" max="60" value={depth} placeholder="Not sure" onChange={(e) => setDepth(e.target.value === "" ? "" : Number(e.target.value))}/></label>
            {needsThirdDimension && <label>Height <span>optional · feet</span><input aria-label="Optional height in feet" type="number" min="1" max="30" value={height} placeholder="Not sure" onChange={(e) => setHeight(e.target.value === "" ? "" : Number(e.target.value))}/></label>}
          </div>
          <label className="select-label">Choose a product or service<div className="select-wrap"><select value={system} onChange={(e) => setSystem(e.target.value)}>{systems.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select><ChevronDown /></div></label>
          <fieldset><legend>Construction</legend><div className="choice-row"><button type="button" className={structure === "attached" ? "selected" : ""} onClick={() => setStructure("attached")}>Attached</button><button type="button" className={structure === "freestanding" ? "selected" : ""} onClick={() => setStructure("freestanding")}>Freestanding</button></div></fieldset>
          <fieldset><legend>Comfort options</legend><div className="option-list"><label><input type="checkbox" checked={lighting} onChange={(e) => setLighting(e.target.checked)}/><span><Check/></span>Integrated LED lighting</label><label><input type="checkbox" checked={screens} onChange={(e) => setScreens(e.target.checked)}/><span><Check/></span>Motorized ZIP screens</label></div></fieldset>
          <label className="upload"><input type="file" accept="image/*" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}/><ImagePlus/><span><strong>{fileName || "Add a photo of your space (optional)"}</strong><small>{fileName ? "Photo selected" : "JPG or PNG · up to 10 MB"}</small></span></label>
          <div className="estimate-result"><div><small>Next step</small><strong>Your project is ready for review</strong><span>Send your details to receive a preliminary installed budget from our design team.</span></div><a href="#contact" aria-label="Continue to consultation"><ArrowRight/></a></div>
          <p className="disclaimer">Online information is for planning only and is not a binding quotation. Final pricing follows site measurement, engineering review, selected options, delivery, and installation requirements.</p>
        </div>
      </section>

      <footer id="contact">
        <div className="contact-intro"><p className="eyebrow"><span /> Begin a project</p><h2>Let’s make room<br/><em>for the outdoors.</em></h2><p>No photo or measurements yet? That is completely fine. Share your contact information and we will guide you through the next step.</p><a className="contact-email" href="mailto:hello@nestpergola.com">hello@nestpergola.com <ArrowRight size={16}/></a></div>
        <form className="contact-form" onSubmit={handleContactSubmit}>
          <div className="contact-row"><label>Full name<input name="name" type="text" autoComplete="name" required /></label><label>Email address<input name="email" type="email" autoComplete="email" required /></label></div>
          <div className="contact-row"><label>Phone <span>optional</span><input name="phone" type="tel" autoComplete="tel" /></label><label>Project ZIP code <span>optional</span><input name="zip" type="text" inputMode="numeric" autoComplete="postal-code" /></label></div>
          <label>Product or service<select value={system} onChange={(event) => setSystem(event.target.value)}>{systems.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
          <label>How can we help? <span>optional</span><textarea name="message" rows={4} placeholder="Tell us about your patio, terrace or commercial space." /></label>
          <button className="button light" type="submit">Request my project budget <ArrowRight size={18}/></button>
          <small>This opens your email app with the project information ready to send.</small>
        </form>
        <div className="footer-line"><a className="brand" href="#top" aria-label="NEST Outdoor Systems home"><img src="/brand/nest-outdoor-systems-final.png" alt="NEST Outdoor Systems"/></a><p>Serving residential and commercial projects across the United States</p><p>© 2026 NEST Outdoor Systems</p></div>
      </footer>
    </main>
  );
}
