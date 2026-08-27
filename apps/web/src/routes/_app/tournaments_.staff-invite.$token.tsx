import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { tournamentStaffInviteLandingQueryOptions } from "@/hooks/use-tournaments";
import { sessionQueryOptions } from "@/lib/auth-session";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

// Outside `_authenticated` on purpose, so an invitee who is signed out reads
// what the link is for instead of a bare login wall. The landing API itself
// still requires a session, so the prefetch is skipped while anonymous and the
// page shows the sign-in step until there is one.
export const Route = createFileRoute("/_app/tournaments_/staff-invite/$token")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Staff invite", noIndex: true }),
  loader: async ({ context, params }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (!session?.user) {
      return;
    }
    await context.queryClient.ensureQueryData(
      tournamentStaffInviteLandingQueryOptions(params.token),
    );
  },
  errorComponent: RouteErrorFallback,
});
