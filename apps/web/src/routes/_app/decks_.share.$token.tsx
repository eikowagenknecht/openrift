import type { PublicDeckDetailResponse } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { RouteErrorFallback, RouteNotFoundFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { publicDeckQueryOptions } from "@/hooks/use-decks";
import { seoHead, toAbsoluteUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";

const FORMAT_LABELS: Record<"constructed" | "freeform", string> = {
  constructed: "Constructed",
  freeform: "Freeform",
};

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
    const ogImage = toAbsoluteUrl(siteUrl, legend?.fullImageUrl ?? undefined);
    const title = `${deck.name} (${FORMAT_LABELS[deck.format]} deck)`;
    const description =
      deck.description ??
      `A ${FORMAT_LABELS[deck.format]} Riftbound deck shared by ${owner.displayName}.`;
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
