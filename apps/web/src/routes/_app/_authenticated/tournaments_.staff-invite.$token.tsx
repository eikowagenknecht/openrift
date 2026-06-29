import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { tournamentStaffInviteLandingQueryOptions } from "@/hooks/use-tournaments";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/tournaments_/staff-invite/$token")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Staff invite", noIndex: true }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      tournamentStaffInviteLandingQueryOptions(params.token),
    );
  },
  errorComponent: RouteErrorFallback,
});
