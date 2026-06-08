/* oxlint-disable promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch()` is a sync fallback, not Promise#catch */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { RouteErrorFallback } from "@/components/error-message";
import { friendGroupDetailQueryOptions } from "@/hooks/use-friend-groups";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

// The group page used to be a single route with a `?tab=` switch. Tabs are now
// real sub-routes; we keep `tab` parseable only to redirect old links/bookmarks.
const groupSearchSchema = z.object({
  tab: z.enum(["trading", "collections", "members", "trades"]).optional().catch("trading"),
});

export const Route = createFileRoute("/_app/_authenticated/groups/$slug")({
  ssr: "data-only",
  validateSearch: groupSearchSchema,
  beforeLoad: ({ params, search }) => {
    if (search.tab === undefined) {
      return;
    }
    // trading + trades both fold into the merged Trades page.
    const to =
      search.tab === "collections"
        ? "/groups/$slug/shared"
        : search.tab === "members"
          ? "/groups/$slug/members"
          : "/groups/$slug/trades";
    throw redirect({ to, params: { slug: params.slug } });
  },
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Group", noIndex: true }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      friendGroupDetailQueryOptions(context.userId, params.slug),
    );
  },
  errorComponent: RouteErrorFallback,
});
