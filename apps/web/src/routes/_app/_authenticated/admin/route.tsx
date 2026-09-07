import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { adminAccessQueryOptions } from "@/hooks/use-admin";
import { ADMIN_SECTION_ROUTES, adminSectionForPathname } from "@/lib/admin-sections";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/admin")({
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Admin", noIndex: true }),
  staticData: { hideFooter: true },
  errorComponent: RouteErrorFallback,
  // Reruns on every /admin navigation, since grant holders are gated per section.
  beforeLoad: async ({ context, location }) => {
    const access = await context.queryClient.query({
      ...adminAccessQueryOptions(context.userId),
      staleTime: "static",
    });
    if (access.isAdmin) {
      return;
    }
    const firstGranted = access.sections.at(0);
    if (firstGranted === undefined) {
      throw redirect({ to: "/cards" });
    }
    const section = adminSectionForPathname(location.pathname);
    if (section === null || !access.sections.some((s) => s === section)) {
      throw redirect({ to: ADMIN_SECTION_ROUTES[firstGranted] });
    }
  },
});
