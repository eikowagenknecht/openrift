import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/groups/$slug_/members_/$userId")({
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Group member", noIndex: true }),
  errorComponent: RouteErrorFallback,
});
