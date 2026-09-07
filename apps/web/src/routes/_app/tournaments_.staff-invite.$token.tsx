import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { tournamentStaffInviteLandingQueryOptions } from "@/features/tournaments/hooks/use-tournaments";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

// Outside `_authenticated` on purpose: the landing API is public, so a signed-out
// invitee can read the invite before creating an account. Accepting still needs a session.
export const Route = createFileRoute("/_app/tournaments_/staff-invite/$token")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Staff invite", noIndex: true }),
  loader: async ({ context, params }) => {
    await context.queryClient.query({
      ...tournamentStaffInviteLandingQueryOptions(params.token),
      staleTime: "static",
    });
  },
  errorComponent: RouteErrorFallback,
});
