import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { podTournamentDetailQueryOptions } from "@/hooks/use-pod-tournaments";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/tournaments_/run/$id")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Tournament", noIndex: true }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      podTournamentDetailQueryOptions(context.userId, params.id),
    );
  },
  errorComponent: RouteErrorFallback,
});
