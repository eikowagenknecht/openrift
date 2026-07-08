import { createFileRoute, redirect } from "@tanstack/react-router";
import { createContext } from "react";

import { RouteErrorFallback } from "@/components/error-message";
import { adminAccessQueryOptions } from "@/hooks/use-admin";
import { ADMIN_SECTION_ROUTES, adminSectionForPathname } from "@/lib/admin-sections";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

/** Portal slot for the sticky page top bar rendered above the admin content column. */
export const TopBarSlotContext = createContext<HTMLDivElement | null>(null);

export const Route = createFileRoute("/_app/_authenticated/admin")({
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Admin", noIndex: true }),
  staticData: { hideFooter: true },
  errorComponent: RouteErrorFallback,
  // Runs on every navigation within /admin, so partial admins are checked
  // per section: full admins pass everything, grant holders only the sections
  // they hold (anything else, including the /admin root redirect target,
  // bounces them to their first granted section).
  beforeLoad: async ({ context, location }) => {
    const access = await context.queryClient.ensureQueryData(
      adminAccessQueryOptions(context.userId),
    );
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
