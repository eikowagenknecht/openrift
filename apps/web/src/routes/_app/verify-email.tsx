import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/verify-email")({
  head: () => seoHead({ title: "Verify Email", path: "/verify-email", noIndex: true }),
  validateSearch: (search: Record<string, unknown>) => ({
    email: (search.email as string) || "",
  }),
});
