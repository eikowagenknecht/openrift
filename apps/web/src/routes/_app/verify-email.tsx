import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { sanitizeRedirect } from "@/lib/utils";

export const Route = createFileRoute("/_app/verify-email")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Verify Email",
      path: "/verify-email",
      noIndex: true,
    }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: sanitizeRedirect(search.redirect as string),
    email: (search.email as string) || "",
  }),
});
