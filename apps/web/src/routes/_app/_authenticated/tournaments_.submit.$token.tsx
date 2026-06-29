import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { tournamentSubmitLandingQueryOptions } from "@/hooks/use-tournaments";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/tournaments_/submit/$token")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Join tournament", noIndex: true }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(tournamentSubmitLandingQueryOptions(params.token));
  },
  errorComponent: RouteErrorFallback,
});
