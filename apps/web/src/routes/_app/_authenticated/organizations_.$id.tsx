import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { organizationQueryOptions } from "@/features/tournaments/hooks/use-organizations";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/organizations_/$id")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Organization", noIndex: true }),
  loader: async ({ context, params }) => {
    await context.queryClient.query({
      ...organizationQueryOptions(context.userId, params.id),
      staleTime: "static",
    });
  },
  errorComponent: RouteErrorFallback,
});
