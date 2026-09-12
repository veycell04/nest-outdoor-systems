"use client";

import { useEffect } from "react";
import { trackEvent } from "../lib/analytics";

export function AnalyticsClickTracker() {
  useEffect(() => {
    const trackClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a");
      if (!link) return;

      const href = link.getAttribute("href") || "";
      const pagePath = window.location.pathname;

      if (href.startsWith("tel:")) {
        trackEvent("contact_click", { method: "phone", page_path: pagePath });
      } else if (href.startsWith("mailto:")) {
        trackEvent("contact_click", { method: "email", page_path: pagePath });
      } else if (href.includes("/locations/")) {
        trackEvent("location_page_click", {
          destination: href,
          page_path: pagePath,
        });
      } else if (href.endsWith("#visualize")) {
        trackEvent("visualizer_cta_click", { page_path: pagePath });
      }
    };

    document.addEventListener("click", trackClick);
    return () => document.removeEventListener("click", trackClick);
  }, []);

  return null;
}
