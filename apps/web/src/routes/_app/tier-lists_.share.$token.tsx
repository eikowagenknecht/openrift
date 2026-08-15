import type { PublicTierListDetailResponse } from "@openrift/shared";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Link2OffIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { RouteErrorFallback } from "@/components/error-message";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { publicTierListQueryOptions } from "@/hooks/use-tier-lists";
import { seoHead } from "@/lib/seo";
import { shareImageVersion, tierListShareImageUrl } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";
import { cn, CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";

export const Route = createFileRoute("/_app/tier-lists_/share/$token")({
  head: ({ loaderData, params }) => {
    const siteUrl = getSiteUrl();
    const path = `/tier-lists/share/${params.token}`;
    const data = loaderData as PublicTierListDetailResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Shared tier list", path, unlisted: true });
    }
    const { tierList, owner } = data;
    // Server-rendered board image, versioned off updatedAt (which every save
    // advances), so the immutably-cached URL busts whenever the ranking changes.
    const ogImage = tierListShareImageUrl(
      siteUrl,
      params.token,
      shareImageVersion(tierList.updatedAt),
    );
    const rankedCount = tierList.tiers.reduce((sum, tier) => sum + tier.cards.length, 0);
    return seoHead({
      siteUrl,
      title: tierList.title,
      description:
        tierList.description ??
        `A Riftbound tier list by ${owner.displayName}, ranking ${rankedCount} cards.`,
      path,
      ogImage,
      oembed: true,
      unlisted: true,
    });
  },
  loader: async ({ context, params }): Promise<PublicTierListDetailResponse> => {
    try {
      return await context.queryClient.ensureQueryData(publicTierListQueryOptions(params.token));
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  pendingComponent: SharedTierListPending,
  errorComponent: RouteErrorFallback,
  notFoundComponent: SharedTierListNotFound,
});

function SharedTierListPending() {
  return (
    <div className={cn(PAGE_PADDING, CONTAINER_WIDTH, "flex flex-col gap-4 py-4 pt-6")}>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

/**
 * Shown when the token resolves to nothing — a revoked link, or one that was
 * copied short.
 * @returns The revoked-share-link explanation.
 */
function SharedTierListNotFound() {
  return (
    <div className={cn(PAGE_PADDING, CONTAINER_WIDTH)}>
      <EmptyState
        className="py-16"
        icon={Link2OffIcon}
        title="This share link no longer works"
        description="The creator may have stopped sharing this tier list, or the link wasn't copied completely."
      >
        <Link to="/cards" className={buttonVariants()}>
          Browse cards
        </Link>
      </EmptyState>
    </div>
  );
}
