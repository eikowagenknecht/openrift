/* oxlint-disable promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch()` is a sync fallback, not Promise#catch */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RouteErrorFallback } from "@/components/error-message";
import { friendGroupDetailQueryOptions } from "@/hooks/use-friend-groups";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

const groupSearchSchema = z.object({
  tab: z.enum(["trading", "collections", "members", "trades"]).default("trading").catch("trading"),
});

export const Route = createFileRoute("/_app/_authenticated/groups/$slug")({
  ssr: "data-only",
  validateSearch: groupSearchSchema,
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Group", noIndex: true }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      friendGroupDetailQueryOptions(context.userId, params.slug),
    );
  },
  errorComponent: RouteErrorFallback,
});
