import type { ReactNode } from "react";
import Link from "next/link";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="legal-page">
      <header className="legal-nav">
        <Link href="/" aria-label="NEST Outdoor Systems home">
          NEST Outdoor Systems
        </Link>
        <Link href="/#contact">Project consultation</Link>
      </header>
      <article>
        <p className="eyebrow dark"><span /> Website information</p>
        <h1>{title}</h1>
        <p className="legal-updated">Last updated: {updated}</p>
        {children}
      </article>
      <footer className="legal-footer">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/cookie-policy">Cookie Policy</Link>
        <a href="mailto:hello@nestpergola.com">hello@nestpergola.com</a>
      </footer>
    </main>
  );
}
