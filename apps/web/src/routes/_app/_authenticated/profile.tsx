import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/profile")({
  head: () => seoHead({ title: "Profile", noIndex: true }),
});
