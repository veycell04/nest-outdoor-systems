import type { Metadata } from "next";
import { LocationPage } from "../../../components/location-page";

const title = "Custom Pergolas & Outdoor Systems in Nashville, TN";
const description =
  "Explore custom louvered pergolas, retractable roofs, awnings, ZIP screens and glass enclosure systems for homes and businesses across Greater Nashville.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/locations/nashville-tn" },
  openGraph: {
    title,
    description,
    url: "/locations/nashville-tn",
    images: ["/pergola-hero.png"],
  },
};

export default function NashvilleLocationPage() {
  return (
    <LocationPage
      city="Nashville"
      region="TN"
      intro="Custom shade, roof and enclosure systems for Greater Nashville homes, hospitality spaces and commercial properties."
      climateCopy="Nashville patios and terraces need flexible protection from summer sun, humidity and frequent rain while remaining open and comfortable in milder weather. We help plan a system around the property, intended use and local project requirements."
      communities={[
        "Nashville",
        "Belle Meade",
        "Brentwood",
        "Franklin",
        "Nolensville",
        "Spring Hill",
        "Mount Juliet",
        "Hendersonville",
        "Gallatin",
        "Goodlettsville",
        "Smyrna",
        "Murfreesboro",
        "La Vergne",
        "Lebanon",
        "Fairview",
      ]}
      faqs={[
        {
          question: "Does a pergola require a permit in the Nashville area?",
          answer:
            "It can. Requirements depend on the project jurisdiction, property, system size, structural scope and attachment method. We review the address during consultation; the applicable local authority makes the final determination.",
        },
        {
          question: "Which systems help with Nashville sun and rain?",
          answer:
            "A louvered or retractable roof can provide adjustable overhead coverage. Compatible ZIP screens, glass enclosures and integrated lighting can further extend how the space is used.",
        },
        {
          question: "How long does a custom outdoor-system project take?",
          answer:
            "Many projects require approximately 8–10 weeks after final measurement and design approval. Engineering, permits, configuration, shipping and site conditions can change the schedule.",
        },
        {
          question: "Can I see a concept before scheduling installation?",
          answer:
            "Yes. Upload a clear photo and select your preferred products to create an AI concept preview. It is a planning visualization, not a final construction drawing or guaranteed representation.",
        },
      ]}
    />
  );
}
