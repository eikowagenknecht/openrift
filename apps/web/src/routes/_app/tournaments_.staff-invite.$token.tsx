import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { tournamentStaffInviteLandingQueryOptions } from "@/hooks/use-tournaments";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

// Outside `_authenticated` on purpose: the landing API is public, so an
// invitee who is signed out reads which event and role the link is for before
// creating an account. Accepting still needs a session.
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
