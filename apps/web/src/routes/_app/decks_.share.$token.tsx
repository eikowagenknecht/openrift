import type { PublicDeckDetailResponse } from "@openrift/shared/types/api/deck";
import { sentenceCaseSlug } from "@openrift/shared/utils";
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
import { cn, PAGE_WIDTH, PAGE_PADDING } from "@/lib/utils";

export const Route = createFileRoute("/_app/decks_/share/$token")({
  head: ({ loaderData, params }) => {
    const siteUrl = getSiteUrl();
    const path = `/decks/share/${params.token}`;
    const data = loaderData as PublicDeckDetailResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Shared deck", path, unlisted: true });
    }
    const { deck, owner } = data;
    // Versioned off the deck's updatedAt so the immutable image URL busts on edit.
    const ogImage = deckShareImageUrl(siteUrl, params.token, shareImageVersion(deck.updatedAt));
    // The `<head>` strings ship in the HTML before /init runs, so the
    // admin-managed display label isn't available here.
    const formatLabel = sentenceCaseSlug(deck.format);
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
      return await context.queryClient.query({
        ...publicDeckQueryOptions(params.token),
        staleTime: "static",
      });
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

/** Mirrors the loaded page's shape (KPI strip, zone tiles, deck block) so content pops in without a layout jump. */
function SharedDeckPending() {
  return (
    <div className={cn(PAGE_PADDING, PAGE_WIDTH.full, "flex flex-col gap-6 py-4 pt-6")}>
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

function SharedDeckNotFound() {
  return (
    <div className={cn(PAGE_PADDING, PAGE_WIDTH.full)}>
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
