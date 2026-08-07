import type { PublicDeckDetailResponse } from "@openrift/shared";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Link2OffIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { RouteErrorFallback } from "@/components/error-message";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { publicDeckQueryOptions } from "@/hooks/use-decks";
import { seoHead } from "@/lib/seo";
import { deckShareImageUrl, shareImageVersion } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";
import { cn, CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";

/**
 * Capitalize a deck-format slug for the SSR/meta context where no React hooks
 * are available. The `<head>` strings ship in the HTML before /init runs, so
 * we can't look up the admin-managed display label here — render the slug
 * with hyphens turned into spaces and the first letter capitalized.
 * @returns A presentable rendering of the slug.
 */
function formatLabelFromSlug(slug: string): string {
  const spaced = slug.replaceAll("-", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const Route = createFileRoute("/_app/decks_/share/$token")({
  head: ({ loaderData, params }) => {
    const siteUrl = getSiteUrl();
    const path = `/decks/share/${params.token}`;
    const data = loaderData as PublicDeckDetailResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Shared deck", path, unlisted: true });
    }
    const { deck, owner } = data;
    // Server-rendered beautified deck image (ADR-031): Legend hero, rune-domain
    // summary, battlefields, and the cost-sorted deck. Versioned off the deck's
    // updatedAt (bumped on every card change), so the immutable URL busts on edit.
    const ogImage = deckShareImageUrl(siteUrl, params.token, shareImageVersion(deck.updatedAt));
    const formatLabel = formatLabelFromSlug(deck.format);
    const title = `${deck.name} (${formatLabel} deck)`;
    const description =
      deck.description ?? `A ${formatLabel} Riftbound deck shared by ${owner.displayName}.`;
    return seoHead({
      siteUrl,
      title,
      description,
      path,
      ogImage,
      oembed: true,
      unlisted: true,
    });
  },
  loader: async ({ context, params }): Promise<PublicDeckDetailResponse> => {
    try {
      return await context.queryClient.ensureQueryData(publicDeckQueryOptions(params.token));
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  pendingComponent: SharedDeckPending,
  errorComponent: RouteErrorFallback,
  notFoundComponent: SharedDeckNotFound,
});

/**
 * Loading skeleton that mirrors the loaded page's shape: the KPI strip, the
 * small-zone tile row, and the main-deck block, so content pops in without a
 * layout jump.
 * @returns The share-page pending skeleton.
 */
function SharedDeckPending() {
  return (
    <div className={cn(PAGE_PADDING, CONTAINER_WIDTH, "flex flex-col gap-6 py-4 pt-6")}>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

/**
 * Shown when the share token resolves to nothing — a revoked link or a
 * mistyped/truncated one. Says so instead of the generic 404 joke.
 * @returns The revoked-share-link explanation.
 */
function SharedDeckNotFound() {
  return (
    <div className={cn(PAGE_PADDING, CONTAINER_WIDTH)}>
      <EmptyState
        className="py-16"
        icon={Link2OffIcon}
        title="This share link no longer works"
        description="The deck's owner may have stopped sharing it, or the link wasn't copied completely."
      >
        <Link to="/decks" className={buttonVariants()}>
          Go to your decks
        </Link>
      </EmptyState>
    </div>
  );
}
