import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEST Outdoor Systems | Custom Pergolas",
  description: "Custom pergolas, retractable roofs, ZIP screens and glass outdoor enclosures. Share your project details and receive a preliminary installed budget from NEST Outdoor Systems.",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
