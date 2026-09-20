import type { Metadata } from "next";
import { LegalPage } from "../../components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How NEST Outdoor Systems collects, uses and protects project and website information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="September 20, 2026">
      <p>
        This policy explains how NEST Outdoor Systems collects and uses
        information when you visit nestpergola.com, create a project concept or
        request a consultation.
      </p>
      <h2>Information we collect</h2>
      <p>
        We may collect your name, email address, phone number, ZIP code, project
        details, measurements, product preferences and messages. If you use the
        visualizer, we process the property photographs and installation areas
        you choose to upload. We also receive basic technical information such
        as device, browser, page activity, referral source and diagnostic logs.
      </p>
      <h2>How we use information</h2>
      <p>
        We use information to create requested concept previews, respond to
        inquiries, plan consultations, operate and secure the website, diagnose
        errors, understand website performance and comply with legal obligations.
        We do not sell personal information.
      </p>
      <h2>Service providers and AI processing</h2>
      <p>
        We use service providers to host the website and uploaded project files,
        generate AI-assisted visualizations, deliver email and measure website
        usage. These providers may include Vercel, OpenAI, Resend and Google
        Analytics. They process information for the services they provide to us
        under their own contractual and privacy commitments.
      </p>
      <h2>Project photographs</h2>
      <p>
        Upload only photographs you are authorized to use. Avoid including
        people, license plates or other unnecessary personal information. AI
        concepts are planning aids and may not represent final construction.
      </p>
      <h2>Retention and your choices</h2>
      <p>
        We keep information only as reasonably necessary for project follow-up,
        service operation, security and legal requirements. You may ask to
        access, correct or delete information associated with your inquiry by
        emailing hello@nestpergola.com. Applicable law may provide additional
        rights depending on where you live.
      </p>
      <h2>Security and updates</h2>
      <p>
        We use reasonable administrative and technical safeguards, but no online
        system is completely secure. We may update this policy as our services
        change. The current version and update date will remain on this page.
      </p>
      <h2>Contact</h2>
      <p>
        Privacy questions and requests may be sent to
        {" "}<a href="mailto:hello@nestpergola.com">hello@nestpergola.com</a>.
      </p>
    </LegalPage>
  );
}
