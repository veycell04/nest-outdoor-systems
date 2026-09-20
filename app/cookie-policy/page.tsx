import type { Metadata } from "next";
import { LegalPage } from "../../components/legal-page";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "How NEST Outdoor Systems uses cookies and similar website technologies.",
  alternates: { canonical: "/cookie-policy" },
};

export default function CookiePolicyPage() {
  return (
    <LegalPage title="Cookie Policy" updated="September 20, 2026">
      <p>
        Cookies and similar browser technologies help websites remember settings,
        maintain secure workflows and understand how pages are used. This page
        describes the technologies used on nestpergola.com.
      </p>
      <h2>Essential technologies</h2>
      <p>
        The site may use session storage, security tokens or similar technologies
        to preserve visualizer and consultation details, protect uploads and keep
        requested features working. These are used to provide the service you
        request.
      </p>
      <h2>Analytics</h2>
      <p>
        We use Google Analytics with IP anonymization enabled to understand page
        visits, interaction and website performance. Analytics may set or read
        identifiers in your browser. Google’s own policies explain how it handles
        information collected through its services.
      </p>
      <h2>Your controls</h2>
      <p>
        You can restrict or delete cookies through your browser settings. Blocking
        essential storage may prevent uploads, saved project details or other
        interactive features from working correctly. Browser privacy tools and
        Google’s analytics opt-out controls provide additional choices.
      </p>
      <h2>Contact</h2>
      <p>
        Questions about website technologies may be sent to
        {" "}<a href="mailto:hello@nestpergola.com">hello@nestpergola.com</a>.
      </p>
    </LegalPage>
  );
}
