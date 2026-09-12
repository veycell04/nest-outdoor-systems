type LocationFaq = {
  question: string;
  answer: string;
};

type LocationPageProps = {
  city: string;
  region: string;
  intro: string;
  climateCopy: string;
  communities: string[];
  faqs: LocationFaq[];
};

const systems = [
  "Louvered pergolas",
  "Retractable roof systems",
  "Cassette and Wintent awnings",
  "Vertical and ceiling ZIP screens",
  "Sliding and guillotine glass",
  "Solidroll enclosure systems",
  "Glass verandas",
  "Integrated LED lighting",
];

export function LocationPage({
  city,
  region,
  intro,
  climateCopy,
  communities,
  faqs,
}: LocationPageProps) {
  const slug = `${city.toLowerCase().replaceAll(" ", "-")}-${region.toLowerCase()}`;
  const canonical = `https://www.nestpergola.com/locations/${slug}`;
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: `Custom pergolas and outdoor systems in ${city}, ${region}`,
      serviceType: "Pergola design and outdoor enclosure installation",
      url: canonical,
      provider: {
        "@type": "Organization",
        name: "NEST Outdoor Systems",
        url: "https://www.nestpergola.com",
        telephone: "+1-312-316-8047",
      },
      areaServed: {
        "@type": "City",
        name: city,
        addressRegion: region,
        addressCountry: "US",
      },
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "Outdoor systems",
        itemListElement: systems.map((name) => ({
          "@type": "Offer",
          itemOffered: { "@type": "Service", name },
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://www.nestpergola.com",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: `${city}, ${region}`,
          item: canonical,
        },
      ],
    },
  ];

  return (
    <main className="location-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <header className="location-nav">
        <a className="brand" href="/" aria-label="NEST Outdoor Systems home">
          <img
            src="/brand/nest-outdoor-systems-final.png"
            alt="NEST Outdoor Systems"
          />
        </a>
        <div>
          <a href="/locations/chicago-il">Chicago</a>
          <a href="/locations/nashville-tn">Nashville</a>
          <a className="button light" href="/#contact">
            Request consultation
          </a>
        </div>
      </header>

      <section className="location-hero">
        <div className="location-hero-image" />
        <div className="location-hero-shade" />
        <div className="location-hero-content">
          <p className="eyebrow">
            <span /> Serving {city} and surrounding communities
          </p>
          <h1>
            Custom pergolas and
            <br />
            <em>outdoor systems in {city}.</em>
          </h1>
          <p>{intro}</p>
          <div className="hero-actions">
            <a className="button light" href="/#visualize">
              Visualize your project
            </a>
            <a className="text-link" href="tel:+13123168047">
              Call (312) 316-8047
            </a>
          </div>
        </div>
      </section>

      <section className="location-intro section">
        <div>
          <p className="eyebrow dark">
            <span /> Designed for your property
          </p>
          <h2>
            Outdoor comfort,
            <br />
            <em>planned for {city}.</em>
          </h2>
        </div>
        <div className="location-intro-copy">
          <p>{climateCopy}</p>
          <p>
            Upload a photograph and choose one or more systems to create an AI
            concept preview. The preview is an early design aid; final dimensions,
            engineering and installation details are confirmed during consultation.
          </p>
        </div>
      </section>

      <section className="location-systems section">
        <p className="eyebrow">
          <span /> Available systems
        </p>
        <h2>Build the outdoor space around your needs.</h2>
        <div className="location-system-grid">
          {systems.map((system, index) => (
            <article key={system}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{system}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="location-process section">
        <div>
          <p className="eyebrow dark">
            <span /> Project planning
          </p>
          <h2>From concept to site-ready plan.</h2>
        </div>
        <div className="location-process-copy">
          <p>
            Many custom projects require approximately 8–10 weeks after final
            measurements and design approval. Product configuration, engineering,
            permits, shipping and site conditions can affect the schedule.
          </p>
          <p>
            Permit requirements vary by property and municipality. NEST reviews the
            project location and system during planning and coordinates engineering
            or permit support when required. Approval is always determined by the
            applicable local authority.
          </p>
        </div>
      </section>

      <section className="location-areas section">
        <p className="eyebrow dark">
          <span /> Service area
        </p>
        <h2>{city} and nearby communities</h2>
        <ul>
          {communities.map((community) => (
            <li key={community}>{community}</li>
          ))}
        </ul>
        <p className="location-area-note">
          Don’t see your community? Contact us to confirm availability for your ZIP
          code.
        </p>
      </section>

      <section className="location-faq section">
        <p className="eyebrow">
          <span /> Frequently asked questions
        </p>
        <h2>Planning an outdoor project in {city}</h2>
        <div>
          {faqs.map(({ question, answer }) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="location-cta">
        <p className="eyebrow">
          <span /> Start with your space
        </p>
        <h2>See what is possible before it is built.</h2>
        <p>
          Add a photo for an AI concept preview or speak with our team. Photos and
          measurements are helpful, but they are not required to begin.
        </p>
        <div className="hero-actions">
          <a className="button light" href="/#visualize">
            Upload a project photo
          </a>
          <a className="text-link" href="mailto:hello@nestpergola.com">
            hello@nestpergola.com
          </a>
        </div>
      </section>

      <footer className="location-footer">
        <a href="/">NEST Outdoor Systems</a>
        <span>Chicago · Nashville</span>
        <span>© 2026 NEST Outdoor Systems</span>
      </footer>
    </main>
  );
}
