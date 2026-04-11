import { createFileRoute } from "@tanstack/react-router";

import { randomEmailPlaceholder } from "@/lib/placeholders";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { sanitizeRedirect } from "@/lib/utils";

export const Route = createFileRoute("/_app/login")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Log In",
      description: "Sign in to your OpenRift account.",
      path: "/login",
      noIndex: true,
    }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: sanitizeRedirect(search.redirect as string),
    email: (search.email as string) || undefined,
  }),
  loader: () => ({ emailPlaceholder: randomEmailPlaceholder() }),
});
