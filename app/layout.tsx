import type { Metadata } from "next";
import { ClientErrorBoundary } from "../components/client-error-boundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEST Outdoor Systems | Custom Pergolas",
  description: "Upload a photo of your home and visualize a custom pergola, retractable roof, ZIP screen or glass enclosure before it is built.",
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
      <body className="antialiased"><ClientErrorBoundary>{children}</ClientErrorBoundary></body>
    </html>
  );
}
