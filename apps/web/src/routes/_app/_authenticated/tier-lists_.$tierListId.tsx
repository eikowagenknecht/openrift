import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { Link2OffIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { RouteErrorFallback } from "@/components/error-message";
import { buttonVariants } from "@/components/ui/button";
import { tierListQueryOptions } from "@/hooks/use-tier-lists";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { cn, CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";

export const Route = createFileRoute("/_app/_authenticated/tier-lists_/$tierListId")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Tier list", noIndex: true }),
  beforeLoad: async ({ context }) => {
    const flags = (await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions,
    )) as FeatureFlags;
    if (!featureEnabled(flags, "tier-lists")) {
      throw redirect({ to: "/cards" });
    }
  },
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(
        tierListQueryOptions(context.userId, params.tierListId),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  errorComponent: RouteErrorFallback,
  notFoundComponent: TierListNotFound,
});

/**
 * Shown when the id resolves to nothing — a deleted list, or one belonging to
 * another account.
 * @returns The not-found explanation.
 */
function TierListNotFound() {
  return (
    <div className={cn(PAGE_PADDING, CONTAINER_WIDTH)}>
      <EmptyState
        className="py-16"
        icon={Link2OffIcon}
        title="This tier list is gone"
        description="It may have been deleted, or it belongs to another account."
      >
        <Link to="/tier-lists" className={buttonVariants()}>
          Go to your tier lists
        </Link>
      </EmptyState>
    </div>
  );
}
