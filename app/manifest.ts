import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NEST Outdoor Systems",
    short_name: "NEST",
    description:
      "Custom pergolas and outdoor enclosure systems in Chicago and Nashville.",
    start_url: "/",
    display: "standalone",
    background_color: "#101715",
    theme_color: "#101715",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
