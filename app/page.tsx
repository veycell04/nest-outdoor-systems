"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ArrowRight, ImagePlus, Menu, Ruler, Sparkles, X } from "lucide-react";
import {
  ProjectVisualizer,
  type VisualizerHandoff,
} from "./project-visualizer";
import { products } from "../lib/products";

const systems = products;

const projects = [
  {
    image: "/projects/elevated-bioclimatic-double.png",
    title: "Bioclimatic Pergola — Double Moving",
    type: "Concept Visualization",
    system: "bioclimatic_double",
    concept: true,
  },
  {
    image: "/projects/elevated-rolling-roof.png",
    title: "Bioclimatic Pergola — Rolling Roof",
    type: "Concept Visualization",
    system: "rolling_roof",
    concept: true,
  },
  {
    image: "/projects/elevated-tilt-system.png",
    title: "Bioclimatic Pergola — Tilt System",
    type: "Concept Visualization",
    system: "tilt",
    concept: true,
  },
  {
    image: "/projects/elevated-pergola.jpeg",
    title: "Classic PVC Pergola",
    type: "Retractable Roof",
    system: "pvc",
  },
  {
    image: "/projects/elevated-flat-pergola.png",
    title: "Flat Pergola — Premium",
    type: "Concept Visualization",
    system: "flat",
    concept: true,
  },
  {
    image: "/projects/elevated-glass-veranda.jpeg",
    title: "Glass Veranda",
    type: "Glass Roof",
    system: "glass",
  },
  {
    image: "/projects/elevated-guillotine-glass.jpeg",
    title: "Guillotine Glass",
    type: "Motorized Glass",
    system: "guillotine",
  },
  {
    image: "/projects/elevated-zip-screen.jpeg",
    title: "Vertical ZIP Screen",
    type: "Motorized Screen",
    system: "zip",
  },
  {
    image: "/projects/elevated-ceiling-zip.png",
    title: "Ceiling ZIP Screen",
    type: "Concept Visualization",
    system: "ceiling_zip",
    concept: true,
  },
  {
    image: "/projects/elevated-sliding-glass.png",
    title: "Sliding Glass",
    type: "Concept Visualization",
    system: "sliding_glass",
    concept: true,
  },
  {
    image: "/projects/elevated-cassette-awning.jpeg",
    title: "Cassette Awning",
    type: "Retractable Awning",
    system: "awning",
  },
  {
    image: "/projects/elevated-umbrella.jpeg",
    title: "Square Garden Umbrella",
    type: "Architectural Shade",
    system: "umbrella",
  },
];

export default function Home() {
  const [menu, setMenu] = useState(false);
  const [system, setSystem] = useState("bioclimatic_double");
  const [projectContext, setProjectContext] = useState("");
  const [contactStatus, setContactStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const selectedSystem =
    systems.find((item) => item.id === system) ?? systems[0];

  useEffect(() => {
    const saved = sessionStorage.getItem("nest-consultation");
    if (saved) setProjectContext(saved);
  }, []);

  const acceptHandoff = (handoff: VisualizerHandoff) => {
    setSystem(handoff.productId);
    setProjectContext(handoff.context);
    sessionStorage.setItem("nest-consultation", handoff.context);
  };

  const handleContactSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    data.append("requestId", crypto.randomUUID());
    data.append("productId", system);
    data.append(
      "projectContext",
      projectContext || `Product: ${selectedSystem.label}`,
    );
    setSubmitting(true);
    setContactStatus("Sending your inquiry…");
    try {
      const response = await fetch("/api/consultation", {
          method: "POST",
          body: data,
        }),
        payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Inquiry not accepted.");
      setContactStatus(
        "Your inquiry was accepted. Our design team will follow up by email.",
      );
      form.reset();
      setProjectContext("");
      sessionStorage.removeItem("nest-consultation");
    } catch (error) {
      setContactStatus(
        error instanceof Error
          ? error.message
          : "Your inquiry was not sent. Please email hello@nestpergola.com.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main>
      <header className="nav-shell">
        <a className="brand" href="#top" aria-label="NEST Outdoor Systems home">
          <img
            src="/brand/nest-outdoor-systems-final.png"
            alt="NEST Outdoor Systems"
          />
        </a>
        <nav
          className={menu ? "nav-links open" : "nav-links"}
          aria-label="Primary navigation"
        >
          <a href="#systems" onClick={() => setMenu(false)}>
            Systems
          </a>
          <a href="#visualize" onClick={() => setMenu(false)}>
            Visualizer
          </a>
          <a href="#process" onClick={() => setMenu(false)}>
            Process
          </a>
          <a href="#contact" onClick={() => setMenu(false)}>
            Project consultation
          </a>
        </nav>
        <a className="nav-cta" href="#contact">
          Start a project <ArrowRight size={16} />
        </a>
        <button
          className="menu-button"
          onClick={() => setMenu(!menu)}
          aria-label="Toggle navigation"
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>

      <section id="top" className="hero">
        <div className="hero-image" />
        <div className="hero-shade" />
        <div className="hero-content">
          <p className="eyebrow">
            <span /> Designed for life outside
          </p>
          <h1>
            Architecture that
            <br />
            <em>opens to the sky.</em>
          </h1>
          <p className="hero-copy">
            Custom pergolas and outdoor enclosure systems, engineered around
            your home and the way you want to live.
          </p>
          <div className="hero-actions">
            <a className="button light" href="#visualize">
              Visualize your space <ArrowRight size={18} />
            </a>
            <a className="text-link" href="#systems">
              Explore our systems <ArrowRight size={17} />
            </a>
          </div>
        </div>
        <div className="hero-note">
          <span>01</span>
          <div>
            <strong>Tailored to your space</strong>
            <small>Residential · Hospitality · Commercial</small>
          </div>
        </div>
      </section>

      <ProjectVisualizer
        onRequestProject={acceptHandoff}
        selectedProductId={system}
        onProductChange={setSystem}
      />

      <section
        className="showcase-section section"
        aria-labelledby="showcase-title"
      >
        <div className="showcase-copy">
          <p className="eyebrow">
            <span /> See it in motion
          </p>
          <h2 id="showcase-title">
            Three systems.
            <br />
            <em>One outdoor life.</em>
          </h2>
          <p>
            See the details that transform an open terrace into a finished
            outdoor room: motorized louvers, integrated lighting and glass
            enclosures.
          </p>
          <div className="showcase-actions">
            <a className="button light" href="#visualize">
              Plan your project <ArrowRight size={18} />
            </a>
            <a className="text-link" href="#systems">
              View all systems <ArrowRight size={17} />
            </a>
          </div>
        </div>
        <div className="showcase-gallery">
          <article className="showcase-video-wrap">
            <video
              className="showcase-video"
              autoPlay
              muted
              loop
              playsInline
              controls
              preload="metadata"
              poster="/media/elevated-systems-showcase-poster.jpg"
              aria-label="Motorized louvered pergola system in operation"
            >
              <source
                src="/media/elevated-systems-showcase.mp4"
                type="video/mp4"
              />
              Your browser does not support embedded video.
            </video>
            <div className="showcase-video-label">
              <span>01 · Louvered roof</span>
              <strong>Sun and shade control</strong>
            </div>
          </article>
          <article className="showcase-video-wrap">
            <video
              className="showcase-video"
              muted
              loop
              playsInline
              controls
              preload="metadata"
              poster="/media/elevated-project-showcase-2-poster.jpg"
              aria-label="Completed louvered roof and integrated lighting project"
            >
              <source
                src="/media/elevated-project-showcase-2.mp4"
                type="video/mp4"
              />
              Your browser does not support embedded video.
            </video>
            <div className="showcase-video-label">
              <span>02 · Integrated lighting</span>
              <strong>Comfort after sunset</strong>
            </div>
          </article>
          <article className="showcase-video-wrap">
            <video
              className="showcase-video"
              muted
              loop
              playsInline
              controls
              preload="metadata"
              poster="/media/elevated-project-showcase-3-poster.jpg"
              aria-label="Guillotine glass enclosure in operation"
            >
              <source
                src="/media/elevated-project-showcase-3.mp4"
                type="video/mp4"
              />
              Your browser does not support embedded video.
            </video>
            <div className="showcase-video-label">
              <span>03 · Guillotine glass</span>
              <strong>Open or enclosed</strong>
            </div>
          </article>
        </div>
      </section>

      <section id="systems" className="projects-section section">
        <div className="projects-head">
          <div>
            <p className="eyebrow dark">
              <span /> Outdoor living systems
            </p>
            <h2>
              See the work.
              <br />
              <em>Choose your system.</em>
            </h2>
          </div>
          <p>
            Explore every system we produce. Images marked “Concept
            Visualization” are design concepts, not completed customer projects.
          </p>
        </div>
        <div className="project-gallery">
          {projects.map((project, index) => (
            <button
              type="button"
              className={`project-tile tile-${index + 1}`}
              key={project.image}
              onClick={() => {
                setSystem(project.system);
                document
                  .getElementById("visualize")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
              aria-label={`Visualize a ${project.title} project`}
            >
              <img
                src={project.image}
                alt={
                  project.concept
                    ? `Concept visualization of ${project.title}`
                    : `Completed ${project.title} project`
                }
                loading={index > 1 ? "lazy" : "eager"}
              />
              <span className="project-caption">
                <span>{project.type}</span>
                <strong>{project.title}</strong>
                <small>0{index + 1}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section id="process" className="process section">
        <div className="process-heading">
          <p className="eyebrow">
            <span /> Simple by design
          </p>
          <h2>
            From a photograph
            <br />
            to a finished space.
          </h2>
        </div>
        <div className="steps">
          <article>
            <span>01</span>
            <ImagePlus />
            <h3>Share your space</h3>
            <p>
              Add a photo, approximate dimensions, or simply your contact
              details.
            </p>
          </article>
          <article>
            <span>02</span>
            <Ruler />
            <h3>Add project details</h3>
            <p>Choose a product and enter any measurements you know.</p>
          </article>
          <article>
            <span>03</span>
            <Sparkles />
            <h3>Generate and refine</h3>
            <p>
              Create an AI design concept, then send the specifications to our
              team for site measurement and engineering.
            </p>
          </article>
        </div>
        <aside className="permit-note">
          <p>Permit support</p>
          <strong>Requirements vary by location and system.</strong>
          <span>
            We review permit needs during project planning and can coordinate
            engineering drawings and permit support when required. Local permit
            fees are confirmed after address review.
          </span>
        </aside>
      </section>

      <footer id="contact">
        <div className="contact-intro">
          <p className="eyebrow">
            <span /> Begin a project
          </p>
          <h2>
            Let’s make room
            <br />
            <em>for the outdoors.</em>
          </h2>
          <p>
            No photo or measurements yet? That is completely fine. Share your
            contact information and we will guide you through the next step.
          </p>
          <a className="contact-email" href="mailto:hello@nestpergola.com">
            hello@nestpergola.com <ArrowRight size={16} />
          </a>
        </div>
        <form className="contact-form" onSubmit={handleContactSubmit}>
          <div className="contact-row">
            <label>
              Full name
              <input name="name" type="text" autoComplete="name" required />
            </label>
            <label>
              Email address
              <input name="email" type="email" autoComplete="email" required />
            </label>
          </div>
          <div className="contact-row">
            <label>
              Phone <span>optional</span>
              <input name="phone" type="tel" autoComplete="tel" />
            </label>
            <label>
              Project ZIP code <span>optional</span>
              <input
                name="zip"
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
              />
            </label>
          </div>
          <label>
            Product or service
            <select
              value={system}
              onChange={(event) => setSystem(event.target.value)}
            >
              {systems.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            How can we help? <span>optional</span>
            <textarea
              name="message"
              rows={4}
              placeholder="Tell us about your patio, terrace or commercial space."
            />
          </label>
          {projectContext && (
            <div className="consultation-context">
              <strong>Visualizer details attached</strong>
              <pre>{projectContext}</pre>
            </div>
          )}
          <button className="button light" type="submit" disabled={submitting}>
            {submitting ? "Sending…" : "Request my project budget"}{" "}
            <ArrowRight size={18} />
          </button>
          <small aria-live="polite">
            {contactStatus ||
              "Your information is submitted securely to NEST. If delivery is unavailable, your entries stay in this form."}
          </small>
        </form>
        <div className="footer-line">
          <a
            className="brand"
            href="#top"
            aria-label="NEST Outdoor Systems home"
          >
            <img
              src="/brand/nest-outdoor-systems-final.png"
              alt="NEST Outdoor Systems"
            />
          </a>
          <p>
            Serving residential and commercial projects across the United States
          </p>
          <p>© 2026 NEST Outdoor Systems</p>
        </div>
      </footer>
    </main>
  );
}
