import type { PublicDeckDetailResponse } from "@openrift/shared";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { CopyIcon } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import { DeckMissingCardsDialog } from "@/components/deck/deck-missing-cards-dialog";
import { DeckOverview } from "@/components/deck/deck-overview";
import { HoveredCardPreview } from "@/components/deck/hovered-card-preview";
import { RouteErrorFallback, RouteNotFoundFallback } from "@/components/error-message";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBar,
  PageTopBarActions,
  PageTopBarHeightContext,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCards } from "@/hooks/use-cards";
import { useDeckOwnership } from "@/hooks/use-deck-ownership";
import { publicDeckQueryOptions, useCloneSharedDeck, usePublicDeck } from "@/hooks/use-decks";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { useSession } from "@/lib/auth-session";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { toDeckBuilderCard } from "@/lib/deck-builder-card";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { PAGE_PADDING } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

const FORMAT_LABELS: Record<"constructed" | "freeform", string> = {
  constructed: "Constructed",
  freeform: "Freeform",
};

export const Route = createFileRoute("/_app/decks_/share/$token")({
  head: ({ loaderData }) => {
    const siteUrl = getSiteUrl();
    const data = loaderData as PublicDeckDetailResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Shared deck" });
    }
    const { deck, owner } = data;
    const title = `${deck.name} — ${FORMAT_LABELS[deck.format]} deck`;
    const description =
      deck.description ??
      `A ${FORMAT_LABELS[deck.format]} Riftbound deck shared by ${owner.displayName}.`;
    return seoHead({
      siteUrl,
      title,
      description,
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
  component: SharedDeckPage,
  pendingComponent: SharedDeckPending,
  errorComponent: RouteErrorFallback,
  notFoundComponent: RouteNotFoundFallback,
});

function SharedDeckPage() {
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);

  return (
    <PageTopBarHeightContext value={topBarHeight}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={setTopBarSlot} className={PAGE_TOP_BAR_STICKY} />
        <SharedDeckContent topBarSlot={topBarSlot} />
      </div>
    </PageTopBarHeightContext>
  );
}

function SharedDeckContent({ topBarSlot }: { topBarSlot: HTMLDivElement | null }) {
  const { token } = Route.useParams();
  const { data } = usePublicDeck(token);
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const deckSharingEnabled = useFeatureEnabled("deck-sharing");
  const cloneMutation = useCloneSharedDeck();
  const navigate = useNavigate();
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const marketplace = marketplaceOrder[0] ?? "cardtrader";
  const isMobile = useIsMobile();

  const { cardsById, allPrintings } = useCards();
  const { getPreferredPrinting } = usePreferredPrinting();
  const { data: ownedCountByPrinting } = useOwnedCount(isLoggedIn);

  const builderCards: DeckBuilderCard[] = data.cards
    .map((card) => toDeckBuilderCard(card, cardsById))
    .filter((card): card is DeckBuilderCard => card !== null);

  // Pass `{}` for logged-out viewers so useDeckOwnership still computes
  // deck pricing (it bails out only when the owned-count map is undefined).
  // The Value tile then shows even without a real collection to compare to.
  const ownershipData = useDeckOwnership(
    builderCards,
    allPrintings,
    ownedCountByPrinting ?? (isLoggedIn ? undefined : {}),
    marketplace,
  );

  const [hovered, setHovered] = useState<{
    id: string;
    preferredPrintingId: string | null;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [missingOpen, setMissingOpen] = useState(false);

  const onHoverCard = (id: string | null, preferredPrintingId?: string | null) =>
    setHovered(id ? { id, preferredPrintingId: preferredPrintingId ?? null } : null);

  const hoveredPrinting =
    hovered && !isMobile
      ? (getPreferredPrinting(hovered.id, hovered.preferredPrintingId) ?? null)
      : null;
  const hoveredFrontImage = hoveredPrinting?.images.find((image) => image.face === "front") ?? null;
  const hoveredCard =
    hoveredPrinting && hoveredFrontImage
      ? {
          thumbnailUrl: hoveredFrontImage.thumbnail,
          fullUrl: hoveredFrontImage.full,
          landscape: hoveredPrinting.card.type === "Battlefield",
        }
      : null;

  const handleClone = async () => {
    if (!isLoggedIn) {
      void navigate({
        to: "/login",
        search: { redirect: `/decks/share/${token}`, email: undefined },
      });
      return;
    }
    const result = await cloneMutation.mutateAsync(token);
    void navigate({ to: "/decks/$deckId", params: { deckId: result.deckId } });
  };

  return (
    <div
      ref={containerRef}
      className={`${PAGE_PADDING} relative mx-auto flex w-full max-w-6xl flex-col gap-4 py-4`}
    >
      {topBarSlot &&
        createPortal(
          <PageTopBar>
            <PageTopBarTitle>{data.deck.name}</PageTopBarTitle>
            <PageTopBarActions>
              {deckSharingEnabled && (
                <Button size="sm" onClick={handleClone} disabled={cloneMutation.isPending}>
                  <CopyIcon />
                  {isLoggedIn ? "Copy to my decks" : "Sign in to copy"}
                </Button>
              )}
            </PageTopBarActions>
          </PageTopBar>,
          topBarSlot,
        )}

      <HoveredCardPreview hoveredCard={hoveredCard} origin="main" containerRef={containerRef} />

      <DeckOverview
        deck={{ id: data.deck.id, name: data.deck.name, format: data.deck.format }}
        cards={builderCards}
        ownershipData={ownershipData}
        marketplace={marketplace}
        onHoverCard={onHoverCard}
        onViewMissing={() => setMissingOpen(true)}
        readOnly
        signInHref={
          isLoggedIn ? undefined : `/login?redirect=${encodeURIComponent(`/decks/share/${token}`)}`
        }
        subtitle={`Shared by ${data.owner.displayName}`}
        description={data.deck.description ?? undefined}
      />

      {ownershipData && (
        <DeckMissingCardsDialog
          open={missingOpen}
          onOpenChange={setMissingOpen}
          missingCards={ownershipData.missingCards}
          totalMissingValue={ownershipData.missingValueCents}
          marketplace={marketplace}
          mode={isLoggedIn ? "missing" : "prices"}
        />
      )}
    </div>
  );
}

function SharedDeckPending() {
  return (
    <div className={`${PAGE_PADDING} mx-auto flex w-full max-w-6xl flex-col gap-4 py-4`}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
