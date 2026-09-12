export const GA_MEASUREMENT_ID = "G-CHTWGTBPLH";

type AnalyticsValue = string | number | boolean | undefined;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(
  eventName: string,
  parameters: Record<string, AnalyticsValue> = {},
) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", eventName, parameters);
}
