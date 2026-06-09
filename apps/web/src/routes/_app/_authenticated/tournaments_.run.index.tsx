import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { podTournamentsQueryOptions } from "@/hooks/use-pod-tournaments";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/tournaments_/run/")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Run a tournament", noIndex: true }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(podTournamentsQueryOptions(context.userId));
  },
  errorComponent: RouteErrorFallback,
});
