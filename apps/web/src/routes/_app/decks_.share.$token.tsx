import type { PublicDeckDetailResponse } from "@openrift/shared";
import { WellKnown, imageUrl } from "@openrift/shared";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { RouteErrorFallback, RouteNotFoundFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { publicDeckQueryOptions } from "@/hooks/use-decks";
import { seoHead, toAbsoluteUrl } from "@/lib/seo";
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
    const { deck, owner, cards } = data;
    // Constructed decks have exactly one Legend; freeform decks may have none,
    // in which case seoHead falls back to the branded site og-image.
    const legend = cards.find((card) => card.zone === WellKnown.deckZone.LEGEND);
    const ogImage = toAbsoluteUrl(
      siteUrl,
      legend?.imageId ? imageUrl(legend.imageId, "full") : undefined,
    );
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
  notFoundComponent: RouteNotFoundFallback,
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
