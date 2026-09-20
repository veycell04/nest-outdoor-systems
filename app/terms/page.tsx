import type { Metadata } from "next";
import { LegalPage } from "../../components/legal-page";

export const metadata: Metadata = {
  title: "Website Terms",
  description: "Terms for using the NEST Outdoor Systems website and AI project visualizer.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage title="Website Terms" updated="September 20, 2026">
      <p>
        These terms apply when you use nestpergola.com, its project visualizer
        and consultation tools. By using the site, you agree to use it lawfully
        and in accordance with these terms.
      </p>
      <h2>Concepts are preliminary</h2>
      <p>
        AI-assisted images are early design concepts. They are not construction
        drawings, engineering documents, surveys, exact-scale representations,
        quotations, permit approvals or guarantees of final appearance. Final
        dimensions, compatibility, finishes, engineering, pricing and schedules
        are confirmed through the project consultation and contract process.
      </p>
      <h2>Your uploads</h2>
      <p>
        You confirm that you have permission to upload and process each photograph
        or other item you submit. You retain your rights in your original material
        and give NEST permission to process it to provide the requested website
        and consultation services. Do not upload unlawful, confidential or
        rights-infringing material.
      </p>
      <h2>Permits and site conditions</h2>
      <p>
        Building, zoning, engineering and permit requirements vary by property
        and jurisdiction. Any website description is general information only.
        The applicable authority makes final approval decisions, and site
        conditions must be verified before fabrication or installation.
      </p>
      <h2>Website availability</h2>
      <p>
        We may update, suspend or discontinue website features. We work to keep
        information accurate and the service available, but we do not promise
        uninterrupted operation or that automated output will be error-free.
      </p>
      <h2>Acceptable use</h2>
      <p>
        You may not interfere with the website, bypass its security or usage
        limits, scrape private information, submit malicious content or use the
        service to violate another person’s rights.
      </p>
      <h2>Contact</h2>
      <p>
        Questions about these terms may be sent to
        {" "}<a href="mailto:hello@nestpergola.com">hello@nestpergola.com</a>.
      </p>
    </LegalPage>
  );
}
