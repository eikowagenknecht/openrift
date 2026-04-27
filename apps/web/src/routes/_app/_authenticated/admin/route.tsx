import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { isAdminQueryOptions } from "@/hooks/use-admin";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/admin")({
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Admin", noIndex: true }),
  staticData: { hideFooter: true },
  errorComponent: RouteErrorFallback,
  beforeLoad: async ({ context }) => {
    const isAdmin = await context.queryClient.ensureQueryData(isAdminQueryOptions);
    if (!isAdmin) {
      throw redirect({ to: "/cards" });
    }
  },
});
