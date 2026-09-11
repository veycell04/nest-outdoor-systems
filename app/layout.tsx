import type { Metadata } from "next";
import { ClientErrorBoundary } from "../components/client-error-boundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEST Outdoor Systems | Custom Pergolas",
  description:
    "Visualize custom pergolas, Wintent window awnings, retractable roofs, ZIP screens, Guillotine Glass and Solidroll systems for your home.",
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
      <body className="antialiased">
        <ClientErrorBoundary>{children}</ClientErrorBoundary>
      </body>
    </html>
  );
}
