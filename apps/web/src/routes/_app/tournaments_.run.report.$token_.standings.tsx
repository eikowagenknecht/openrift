import { createFileRoute, notFound } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { podTournamentReportQueryOptions } from "@/hooks/use-pod-tournaments";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/tournaments_/run/report/$token_/standings")({
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Standings", noIndex: true }),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(podTournamentReportQueryOptions(params.token));
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  errorComponent: RouteErrorFallback,
  notFoundComponent: NotFoundFallback,
});
