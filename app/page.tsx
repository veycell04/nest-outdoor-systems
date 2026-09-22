"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ArrowRight, ImagePlus, Menu, Ruler, Sparkles, X } from "lucide-react";
import dynamic from "next/dynamic";
import type { VisualizerHandoff } from "./project-visualizer";
import { trackEvent } from "../lib/analytics";
import { products } from "../lib/products";
import { homeFaqs } from "../lib/site-content";

const ProjectVisualizer = dynamic(
  () => import("./project-visualizer").then((module) => module.ProjectVisualizer),
  {
    ssr: false,
    loading: () => (
      <section id="visualize" className="visualizer-section section visualizer-loading" aria-busy="true">
        <p className="eyebrow"><span /> AI Photo Visualizer</p>
        <h2>Preparing your project visualizer…</h2>
      </section>
    ),
  },
);

const systems = products;

const projects = [
  {
    image: "/projects/elevated-bioclimatic-double.png",
    displayImage: "/projects/elevated-bioclimatic-double.webp",
    width: 1536,
    height: 1024,
    title: "Louvered Pergola — Double Retracting",
    type: "Concept Visualization",
    system: "bioclimatic_double",
    concept: true,
  },
  {
    image: "/projects/elevated-rolling-roof.png",
    displayImage: "/projects/elevated-rolling-roof.webp",
    width: 1536,
    height: 1024,
    title: "Louvered Pergola — Retracting Roof",
    type: "Concept Visualization",
    system: "rolling_roof",
    concept: true,
  },
  {
    image: "/projects/elevated-tilt-system.png",
    displayImage: "/projects/elevated-tilt-system.webp",
    width: 1536,
    height: 1024,
    title: "Louvered Pergola — Tilting Louvers",
    type: "Concept Visualization",
    system: "tilt",
    concept: true,
  },
  {
    image: "/projects/elevated-pergola.jpeg",
    displayImage: "/projects/elevated-pergola.webp",
    width: 1200,
    height: 1600,
    title: "Classic PVC Pergola",
    type: "Retractable Roof",
    system: "pvc",
  },
  {
    image: "/projects/elevated-flat-pergola.png",
    displayImage: "/projects/elevated-flat-pergola.webp",
    width: 1536,
    height: 1024,
    title: "Flat Pergola — Premium",
    type: "Concept Visualization",
    system: "flat",
    concept: true,
  },
  {
    image: "/projects/elevated-glass-veranda.jpeg",
    displayImage: "/projects/elevated-glass-veranda.webp",
    width: 819,
    height: 1024,
    title: "Glass Veranda",
    type: "Glass Roof",
    system: "glass",
  },
  {
    image: "/projects/elevated-guillotine-glass.jpeg",
    displayImage: "/projects/elevated-guillotine-glass.webp",
    width: 900,
    height: 562,
    title: "Guillotine Glass",
    type: "Motorized Glass",
    system: "guillotine",
  },
  {
    image: "/projects/elevated-solidroll.jpg",
    displayImage: "/projects/elevated-solidroll.webp",
    width: 928,
    height: 1664,
    title: "Solidroll",
    type: "Product Photograph",
    system: "solidroll",
  },
  {
    image: "/projects/elevated-zip-screen.jpeg",
    displayImage: "/projects/elevated-zip-screen.webp",
    width: 960,
    height: 720,
    title: "Vertical ZIP Screen",
    type: "Motorized Screen",
    system: "zip",
  },
  {
    image: "/projects/elevated-ceiling-zip.png",
    displayImage: "/projects/elevated-ceiling-zip.webp",
    width: 1536,
    height: 1024,
    title: "Ceiling ZIP Screen",
    type: "Concept Visualization",
    system: "ceiling_zip",
    concept: true,
  },
  {
    image: "/projects/elevated-sliding-glass.png",
    displayImage: "/projects/elevated-sliding-glass.webp",
    width: 1536,
    height: 1024,
    title: "Sliding Glass",
    type: "Concept Visualization",
    system: "sliding_glass",
    concept: true,
  },
  {
    image: "/projects/elevated-cassette-awning.jpeg",
    displayImage: "/projects/elevated-cassette-awning.webp",
    width: 1200,
    height: 1600,
    title: "Cassette Awning",
    type: "Retractable Awning",
    system: "awning",
  },
  {
    image: "/projects/elevated-wintent.png",
    displayImage: "/projects/elevated-wintent.webp",
    width: 2010,
    height: 782,
    title: "Wintent Window Awning",
    type: "Concept Visualization",
    system: "wintent",
    concept: true,
  },
  {
    image: "/projects/elevated-umbrella.jpeg",
    displayImage: "/projects/elevated-umbrella.webp",
    width: 1440,
    height: 1080,
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
      trackEvent("generate_lead", {
        method: "consultation_form",
        product_id: system,
        visualizer_attached: Boolean(projectContext),
      });
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
            src="/brand/nest-outdoor-systems-final.webp"
            width={900}
            height={300}
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
          <a href="/about" onClick={() => setMenu(false)}>
            About &amp; team
          </a>
          <a href="#locations" onClick={() => setMenu(false)}>
            Locations
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
            We design custom pergolas and outdoor systems for your home, patio
            or business.
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
            See how a roof, lights, screens and glass can turn an open patio
            into a useful outdoor room.
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
              aria-label="Guillotine Glass product in operation"
            >
              <source
                src="/media/elevated-project-showcase-2.mp4"
                type="video/mp4"
              />
              Your browser does not support embedded video.
            </video>
            <div className="showcase-video-label">
              <span>02 · Guillotine Glass</span>
              <strong>Flexible glass enclosure</strong>
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
              aria-label="Solidroll product in operation"
            >
              <source
                src="/media/elevated-project-showcase-3.mp4"
                type="video/mp4"
              />
              Your browser does not support embedded video.
            </video>
            <div className="showcase-video-label">
              <span>03 · Solidroll</span>
              <strong>Open or enclosed</strong>
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
              poster="/projects/elevated-wintent.webp"
              aria-label="Wintent Window Awning in operation"
            >
              <source src="/media/nest-wintent-showcase.mp4" type="video/mp4" />
              Your browser does not support embedded video.
            </video>
            <div className="showcase-video-label">
              <span>04 · Window awning</span>
              <strong>Wintent Window Awning</strong>
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
            Browse each system we offer. Images marked “Concept Visualization”
            show a design idea. They are not finished customer projects.
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
                src={project.displayImage}
                width={project.width}
                height={project.height}
                alt={
                  project.concept
                    ? `Concept visualization of ${project.title}`
                    : `Completed ${project.title} project`
                }
                loading="lazy"
                decoding="async"
                fetchPriority="low"
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
              Add a photo and a rough size. You can also start with just your
              contact details.
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
              Create an AI concept. Then send it to our team for a site check
              and final plans.
            </p>
          </article>
        </div>
        <aside className="permit-note">
          <p>Permit support</p>
          <strong>Requirements vary by location and system.</strong>
          <span>
            We check permit needs as we plan the job. We can help with drawings
            and permit support. We confirm local fees after we review the address.
          </span>
        </aside>
      </section>

      <section id="locations" className="home-locations section">
        <div>
          <p className="eyebrow dark">
            <span /> Local project teams
          </p>
          <h2>
            Serving Chicago
            <br />
            <em>and Nashville.</em>
          </h2>
        </div>
        <div className="home-location-grid">
          <a href="/locations/chicago-il">
            <span>Illinois</span>
            <strong>Chicago &amp; surrounding suburbs</strong>
            <small>Explore Chicago services →</small>
          </a>
          <a href="/locations/nashville-tn">
            <span>Tennessee</span>
            <strong>Nashville &amp; surrounding communities</strong>
            <small>Explore Nashville services →</small>
          </a>
        </div>
      </section>

      <section className="home-faq section" aria-labelledby="home-faq-title">
        <p className="eyebrow dark"><span /> Helpful answers</p>
        <h2 id="home-faq-title">Common project questions.</h2>
        <div>
          {homeFaqs.map(({ question, answer }) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
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
            No photo or size yet? You can still start. Share your contact details
            and we will guide you through the next step.
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
            {submitting ? "Sending…" : "Discuss My Project"}{" "}
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
              src="/brand/nest-outdoor-systems-final.webp"
              width={900}
              height={300}
              alt="NEST Outdoor Systems"
            />
          </a>
          <p>
            <a href="/about">About &amp; team</a>
            <br />
            <a href="tel:+13123168047">(312) 316-8047</a>
          </p>
          <nav className="footer-legal" aria-label="Legal information">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/cookie-policy">Cookies</a>
          </nav>
          <p>
            Serving Chicagoland and Greater Nashville by appointment
            <br />© 2026 NEST Outdoor Systems
          </p>
        </div>
      </footer>
    </main>
  );
}
