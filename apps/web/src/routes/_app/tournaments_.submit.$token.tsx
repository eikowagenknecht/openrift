import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { tournamentSubmitLandingQueryOptions } from "@/hooks/use-tournaments";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

// Outside `_authenticated` on purpose: the landing API is public, so a
// signed-out invitee sees the tournament and its host before signing in,
// mirroring the participant claim link.
export const Route = createFileRoute("/_app/tournaments_/submit/$token")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Join tournament", noIndex: true }),
  loader: async ({ context, params }) => {
    await context.queryClient.query({
      ...tournamentSubmitLandingQueryOptions(params.token),
      staleTime: "static",
    });
  },
  errorComponent: RouteErrorFallback,
});
