import { createFileRoute, notFound } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { tournamentReportQueryOptions } from "@/hooks/use-tournaments";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/tournaments_/report/$token_/standings")({
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Standings", noIndex: true }),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(tournamentReportQueryOptions(params.token));
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
