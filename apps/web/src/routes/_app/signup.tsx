import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";
import { sanitizeRedirect } from "@/lib/utils";

export const Route = createFileRoute("/_app/signup")({
  head: () =>
    seoHead({
      title: "Sign Up",
      description:
        "Create a free OpenRift account to track your Riftbound card collection and build decks.",
      path: "/signup",
      noIndex: true,
    }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: sanitizeRedirect(search.redirect as string),
    email: (search.email as string) || undefined,
  }),
});
