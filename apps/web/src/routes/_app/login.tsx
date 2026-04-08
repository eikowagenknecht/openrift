import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";
import { sanitizeRedirect } from "@/lib/utils";

export const Route = createFileRoute("/_app/login")({
  head: () =>
    seoHead({
      title: "Log In",
      description: "Sign in to your OpenRift account.",
      path: "/login",
      noIndex: true,
    }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: sanitizeRedirect(search.redirect as string),
    email: (search.email as string) || undefined,
  }),
});
