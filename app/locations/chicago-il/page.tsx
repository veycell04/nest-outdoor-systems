import type { Metadata } from "next";
import { LocationPage } from "../../../components/location-page";

const title = "Custom Pergolas & Outdoor Systems in Chicago, IL";
const description =
  "Explore custom louvered pergolas, retractable roofs, awnings, ZIP screens and glass enclosure systems for homes and businesses across Chicagoland.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/locations/chicago-il" },
  openGraph: {
    title,
    description,
    url: "/locations/chicago-il",
    images: ["/pergola-hero.png"],
  },
};

export default function ChicagoLocationPage() {
  return (
    <LocationPage
      city="Chicago"
      region="IL"
      intro="Custom shade, roof and enclosure systems planned for Chicagoland homes, hospitality spaces and commercial properties."
      climateCopy="Chicago outdoor spaces experience strong seasonal changes, wind, rain, snow and intense summer sun. We help select a system and configuration suited to the property, intended use and local project requirements."
      communities={[
        "Chicago",
        "Evanston",
        "Skokie",
        "Glenview",
        "Northbrook",
        "Highland Park",
        "Park Ridge",
        "Des Plaines",
        "Arlington Heights",
        "Schaumburg",
        "Oak Park",
        "Elmhurst",
        "Oak Brook",
        "Hinsdale",
        "Naperville",
      ]}
      faqs={[
        {
          question: "Does a pergola require a permit in the Chicago area?",
          answer:
            "It can. Requirements depend on the municipality, property, system size, attachment method and structural scope. We review the project address during consultation; the local authority makes the final determination.",
        },
        {
          question: "Can a pergola include ZIP screens, glass and lighting?",
          answer:
            "Yes. Compatible pergola systems can be planned with motorized ZIP screens, sliding or moving glass systems and integrated LED lighting. Compatibility is confirmed for the selected structure and dimensions.",
        },
        {
          question: "How long does a custom outdoor-system project take?",
          answer:
            "Many projects require approximately 8–10 weeks after final measurement and design approval. Engineering, permits, configuration, shipping and site conditions can change the schedule.",
        },
        {
          question: "Do I need measurements before contacting NEST?",
          answer:
            "No. You may begin with a photo, approximate measurements or only your contact details. Final measurements are confirmed before production and installation.",
        },
      ]}
    />
  );
}
