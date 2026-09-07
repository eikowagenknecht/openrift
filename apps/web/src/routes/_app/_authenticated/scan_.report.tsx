import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/scan_/report")({
  // data-only: the journal it reports on lives in this device's localStorage.
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Scan report", noIndex: true }),
  errorComponent: RouteErrorFallback,
});
