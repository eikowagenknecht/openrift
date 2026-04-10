import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/verify-email")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Verify Email",
      path: "/verify-email",
      noIndex: true,
    }),
  validateSearch: (search: Record<string, unknown>) => ({
    email: (search.email as string) || "",
  }),
});
