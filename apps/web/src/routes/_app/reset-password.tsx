import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/reset-password")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Reset Password",
      path: "/reset-password",
      noIndex: true,
    }),
  validateSearch: (search: Record<string, unknown>) => ({
    email: (search.email as string) || "",
  }),
});
