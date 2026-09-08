import { createFileRoute, notFound } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { tournamentReportQueryOptions } from "@/features/tournaments/hooks/use-tournament-run";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/tournaments_/report/$token")({
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Tournament", noIndex: true }),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.query({
        ...tournamentReportQueryOptions(params.token),
        staleTime: "static",
      });
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
