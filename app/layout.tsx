import type { Metadata } from "next";
import { AnalyticsClickTracker } from "../components/analytics-click-tracker";
import { ClientErrorBoundary } from "../components/client-error-boundary";
import { GA_MEASUREMENT_ID } from "../lib/analytics";
import "./globals.css";

const siteUrl = "https://www.nestpergola.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "NEST Outdoor Systems | Custom Pergolas & Outdoor Systems",
    template: "%s | NEST Outdoor Systems",
  },
  description:
    "Visualize custom pergolas, Wintent window awnings, Guillotine Glass and Solidroll outdoor systems for projects in Chicago and Nashville.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "NEST Outdoor Systems",
    title: "NEST Outdoor Systems | Custom Pergolas & Outdoor Systems",
    description:
      "Visualize and plan a custom pergola or outdoor enclosure in Chicago and Nashville.",
    images: [
      {
        url: "/pergola-hero.png",
        alt: "Modern NEST outdoor pergola system",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NEST Outdoor Systems",
    description:
      "Custom pergolas and outdoor enclosure systems in Chicago and Nashville.",
    images: ["/pergola-hero.png"],
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-US">
      <head>
        <script
          async
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}',{'anonymize_ip':true});`,
          }}
        />
      </head>
      <body className="antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "NEST Outdoor Systems",
              url: siteUrl,
              logo: `${siteUrl}/brand/nest-outdoor-systems-final.png`,
              email: "hello@nestpergola.com",
              telephone: "+1-312-316-8047",
              areaServed: [
                { "@type": "City", name: "Chicago", addressRegion: "IL" },
                { "@type": "City", name: "Nashville", addressRegion: "TN" },
              ],
            }),
          }}
        />
        <AnalyticsClickTracker />
        <ClientErrorBoundary>{children}</ClientErrorBoundary>
      </body>
    </html>
  );
}
