import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/reset-password")({
  head: () => seoHead({ title: "Reset Password", path: "/reset-password", noIndex: true }),
  validateSearch: (search: Record<string, unknown>) => ({
    email: (search.email as string) || "",
  }),
});
