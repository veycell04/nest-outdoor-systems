import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

const siteUrl = "https://www.nestpergola.com";

export const metadata: Metadata = {
  title: "About NEST | Project Team & Process",
  description:
    "Meet the NEST Outdoor Systems project lead and learn how we coordinate design, engineering, fabrication, installation and follow-up.",
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    url: `${siteUrl}/about`,
    title: "About NEST Outdoor Systems",
    description:
      "One accountable project lead supported by a coordinated outdoor-system delivery process.",
    images: [{ url: "/pergola-hero.webp", alt: "NEST Outdoor Systems pergola project" }],
  },
};

const stages = [
  { title: "Project intake", copy: "We review your goals, property photos, approximate dimensions and preferred systems." },
  { title: "Site survey", copy: "Field conditions and measurements are checked before final design decisions are made." },
  { title: "Design & approvals", copy: "The project is refined and engineering or permit support is coordinated when required." },
  { title: "Fabrication & logistics", copy: "Approved project details move into production, delivery planning and site coordination." },
  { title: "Installation", copy: "The assigned installation team completes the system for the approved site conditions." },
  { title: "Commissioning & handoff", copy: "Movement, controls, drainage and selected options are checked before customer handoff." },
];

export default function AboutPage() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": `${siteUrl}/about#about`,
    name: "About NEST Outdoor Systems",
    url: `${siteUrl}/about`,
    description: "Information about NEST Outdoor Systems, its project lead and coordinated project delivery process.",
    mainEntity: { "@id": `${siteUrl}/#organization` },
  };

  return (
    <main className="about-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      <header className="location-nav">
        <Link className="brand" href="/" aria-label="NEST Outdoor Systems home">
          <Image src="/brand/nest-outdoor-systems-final.webp" alt="NEST Outdoor Systems" width={900} height={300} priority />
        </Link>
        <div>
          <Link href="/#systems">Systems</Link>
          <Link href="/locations/chicago-il">Chicago</Link>
          <Link href="/locations/nashville-tn">Nashville</Link>
          <Link className="button light" href="/#contact">Request consultation</Link>
        </div>
      </header>

      <section className="about-hero">
        <div className="about-hero-image" />
        <div className="about-hero-shade" />
        <div className="about-hero-content">
          <p className="eyebrow"><span /> About NEST Outdoor Systems</p>
          <h1>One project lead.<br /><em>A coordinated delivery team.</em></h1>
          <p>You should always know who owns the next step. NEST provides one accountable contact while coordinating the specialists required for your project.</p>
        </div>
      </section>

      <section className="about-lead section">
        <div className="about-lead-copy">
          <p className="eyebrow dark"><span /> Who you work with</p>
          <h2>Clear ownership from the first conversation.</h2>
          <p>Veysel Yildirim manages project intake and customer communication. Design, field measurement, engineering, approvals, fabrication, logistics, installation and commissioning resources are assigned to match the project scope.</p>
          <p>This keeps quotes, scheduling decisions and job handoffs connected without asking the customer to manage several separate contacts.</p>
        </div>
        <aside className="about-contact-card">
          <span>Project lead</span>
          <h2>Veysel Yildirim</h2>
          <p>Manager</p>
          <a href="mailto:hello@nestpergola.com">hello@nestpergola.com</a>
          <a href="tel:+13123168047">(312) 316-8047</a>
          <small>Appointment-only service for residential, hospitality and commercial projects in Chicagoland and Greater Nashville.</small>
        </aside>
      </section>

      <section className="about-model section">
        <div className="about-model-heading">
          <p className="eyebrow"><span /> How projects move</p>
          <h2>Six stages. One connected project record.</h2>
          <p>Website concepts are an early planning tool. Measurements, engineering, product details, permits, schedule and final scope are confirmed during the stages below.</p>
        </div>
        <div className="about-stage-grid">
          {stages.map((stage, index) => (
            <article key={stage.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{stage.title}</h3>
              <p>{stage.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-service section">
        <div>
          <p className="eyebrow dark"><span /> Service model</p>
          <h2>Project visits by appointment.</h2>
        </div>
        <div>
          <p>NEST serves Chicago, Nashville and surrounding communities through scheduled consultations and project visits. Our location pages describe service areas; they are not walk-in showroom addresses.</p>
          <p>Start with a photo, an approximate measurement or a conversation. We will explain the next step and what information is needed before a proposal is finalized.</p>
          <Link className="button" href="/#contact">Discuss your project</Link>
        </div>
      </section>

      <footer className="location-footer">
        <Link href="/">NEST Outdoor Systems</Link>
        <a href="mailto:hello@nestpergola.com">hello@nestpergola.com</a>
        <a href="tel:+13123168047">(312) 316-8047</a>
        <span>© 2026 NEST Outdoor Systems</span>
      </footer>
    </main>
  );
}
