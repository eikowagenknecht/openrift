import type { PublicDeckDetailResponse } from "@openrift/shared";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { publicDeckQueryOptions } from "@/hooks/use-decks";
import { seoHead } from "@/lib/seo";
import { deckShareImageUrl, shareImageVersion } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";
import { CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";

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
      return seoHead({ siteUrl, title: "Shared deck", path });
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
  notFoundComponent: NotFoundFallback,
});

function SharedDeckPending() {
  return (
    <div className={`${PAGE_PADDING} ${CONTAINER_WIDTH} flex flex-col gap-4 py-4`}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
