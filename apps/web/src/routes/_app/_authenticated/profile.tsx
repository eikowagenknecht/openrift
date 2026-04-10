import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/profile")({
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Profile", noIndex: true }),
});
