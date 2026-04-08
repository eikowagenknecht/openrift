import { createFileRoute } from "@tanstack/react-router";

import { sanitizeRedirect } from "@/lib/utils";

export const Route = createFileRoute("/_app/signup")({
  head: () => ({ meta: [{ title: "Sign Up — OpenRift" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: sanitizeRedirect(search.redirect as string),
    email: (search.email as string) || undefined,
  }),
});
