import type { PublicDeckCardResponse } from "@openrift/shared";
import { WellKnown, imageUrl } from "@openrift/shared";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { CopyIcon } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { DeckMissingCardsDialog } from "@/components/deck/deck-missing-cards-dialog";
import { DeckOverview } from "@/components/deck/deck-overview";
import { HoveredCardPreview } from "@/components/deck/hovered-card-preview";
import { SharedDeckOwnershipBridge } from "@/components/deck/shared-deck-ownership-bridge";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBar,
  PageTopBarActions,
  PageTopBarHeightContext,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { Pane } from "@/components/layout/panes";
import { CardDetailSkeleton, SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { Button } from "@/components/ui/button";
import { useDeckItems } from "@/hooks/use-deck-items";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useCloneSharedDeck, usePublicDeck } from "@/hooks/use-decks";
import { useDeckFormatList } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { useSession } from "@/lib/auth-session";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getHeaderHeight } from "@/lib/header-height";
import { CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

export const Route = createLazyFileRoute("/_app/decks_/share/$token")({
  component: SharedDeckPage,
});

function SharedDeckPage() {
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);

  return (
    <PageTopBarHeightContext value={topBarHeight}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={setTopBarSlot} className={PAGE_TOP_BAR_STICKY} />
        <SharedDeckContent topBarSlot={topBarSlot} topBarHeight={topBarHeight} />
      </div>
    </PageTopBarHeightContext>
  );
}

function toBuilderCardFromPublic(card: PublicDeckCardResponse): DeckBuilderCard {
  return {
    cardId: card.cardId,
    zone: card.zone,
    quantity: card.quantity,
    preferredPrintingId: card.preferredPrintingId,
    cardName: card.cardName,
    cardType: card.cardType,
    superTypes: card.superTypes,
    domains: card.domains,
    tags: card.tags,
    keywords: card.keywords,
    energy: card.energy,
    might: card.might,
    power: card.power,
  };
}

function thumbKey(cardId: string, preferredPrintingId: string | null): string {
  return `${cardId}|${preferredPrintingId ?? ""}`;
}

function SharedDeckContent({
  topBarSlot,
  topBarHeight,
}: {
  topBarSlot: HTMLDivElement | null;
  topBarHeight: number;
}) {
  const { token } = Route.useParams();
  const { data } = usePublicDeck(token);
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const cloneMutation = useCloneSharedDeck();
  const navigate = useNavigate();
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const marketplace = marketplaceOrder[0] ?? "cardtrader";
  const isMobile = useIsMobile();
  const hydrated = useHydrated();
  const showImages = useDisplayStore((state) => state.showImages);
  const detailOpen = useSelectionStore((state) => state.detailOpen);
  const { labels: formatLabels } = useDeckFormatList();

  // Everything the shell needs — builder cards, thumbnails, hover full-image
  // URLs — comes straight from the enriched payload. No catalog lookup, so
  // this branch is SSR-safe.
  const builderCards = useMemo(() => data.cards.map(toBuilderCardFromPublic), [data.cards]);
  const thumbByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const card of data.cards) {
      if (card.imageId) {
        map.set(thumbKey(card.cardId, card.preferredPrintingId), imageUrl(card.imageId, "400w"));
      }
    }
    return map;
  }, [data.cards]);
  const hoverMeta = useMemo(() => {
    const map = new Map<string, { fullUrl: string; landscape: boolean }>();
    for (const card of data.cards) {
      if (card.imageId) {
        map.set(thumbKey(card.cardId, card.preferredPrintingId), {
          fullUrl: imageUrl(card.imageId, "full"),
          landscape: card.cardType === WellKnown.cardType.BATTLEFIELD,
        });
      }
    }
    return map;
  }, [data.cards]);

  const [ownershipData, setOwnershipData] = useState<DeckOwnershipData>();

  const [hovered, setHovered] = useState<{
    id: string;
    preferredPrintingId: string | null;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [missingOpen, setMissingOpen] = useState(false);
  // When the catalog hasn't hydrated yet, capture the click so the bridge can
  // resolve it once printings are available.
  const [pendingClick, setPendingClick] = useState<DeckBuilderCard | null>(null);

  const onHoverCard = (id: string | null, preferredPrintingId?: string | null) =>
    setHovered(id ? { id, preferredPrintingId: preferredPrintingId ?? null } : null);

  // Suppress the floating hover preview while the detail pane is open — the
  // pane already shows the card, having both up at once is noisy.
  const hoveredCard = (() => {
    if (!hovered || isMobile || detailOpen) {
      return null;
    }
    const meta = hoverMeta.get(thumbKey(hovered.id, hovered.preferredPrintingId));
    if (!meta) {
      return null;
    }
    return {
      thumbnailUrl: meta.fullUrl,
      fullUrl: meta.fullUrl,
      landscape: meta.landscape,
    };
  })();

  const handleCardClick = (card: DeckBuilderCard) => setPendingClick(card);

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
      className={`${PAGE_PADDING} ${CONTAINER_WIDTH} relative flex flex-col gap-4 py-4`}
    >
      {topBarSlot &&
        createPortal(
          <PageTopBar>
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <PageTopBarTitle>{data.deck.name}</PageTopBarTitle>
              <span className="text-muted-foreground hidden truncate text-xs md:inline">
                {formatLabels[data.deck.format] ?? data.deck.format} · Shared by{" "}
                {data.owner.displayName}
              </span>
            </div>
            <PageTopBarActions>
              <Button size="sm" onClick={handleClone} disabled={cloneMutation.isPending}>
                <CopyIcon />
                {isLoggedIn ? "Copy to my decks" : "Sign in to copy"}
              </Button>
            </PageTopBarActions>
          </PageTopBar>,
          topBarSlot,
        )}

      <HoveredCardPreview hoveredCard={hoveredCard} origin="main" containerRef={containerRef} />

      <div
        className="flex items-stretch gap-6"
        style={{ "--sticky-top": `${getHeaderHeight() + topBarHeight}px` } as React.CSSProperties}
      >
        <div className="min-w-0 flex-1">
          <DeckOverview
            deck={{
              id: data.deck.id,
              name: data.deck.name,
              format: data.deck.format,
              formatConfig: data.deck.formatConfig,
            }}
            cards={builderCards}
            // Denormalized into the share response so anon viewers of a
            // Custom-Region deck see the same validation result as the owner.
            customTagAssignments={data.customTagAssignments}
            ownershipData={ownershipData}
            marketplace={marketplace}
            getThumbnail={(cardId, preferredPrintingId) =>
              thumbByKey.get(thumbKey(cardId, preferredPrintingId))
            }
            onHoverCard={onHoverCard}
            onViewMissing={() => setMissingOpen(true)}
            readOnly
            signInHref={
              isLoggedIn
                ? undefined
                : `/login?redirect=${encodeURIComponent(`/decks/share/${token}`)}`
            }
            description={data.deck.description ?? undefined}
            onCardClick={handleCardClick}
          />
        </div>
        {!isMobile && (
          <Suspense fallback={pendingClick ? <SharedDetailSkeletonPane /> : null}>
            {hydrated && (
              <SharedDeckDetailPaneBridge
                cards={builderCards}
                pendingClick={pendingClick}
                onResolved={() => setPendingClick(null)}
                showImages={showImages}
              />
            )}
            {!hydrated && pendingClick && <SharedDetailSkeletonPane />}
          </Suspense>
        )}
      </div>
      {isMobile && hydrated && (
        <Suspense fallback={null}>
          <SharedDeckMobileOverlayBridge
            cards={builderCards}
            pendingClick={pendingClick}
            onResolved={() => setPendingClick(null)}
            showImages={showImages}
          />
        </Suspense>
      )}

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

      {/*
        Ownership + price data still needs the global catalog (printings +
        prices) and the user's copies, both of which require client-only
        hooks. Gate behind hydration so SSR never tries to evaluate them.
      */}
      {hydrated && (
        <Suspense fallback={null}>
          <SharedDeckOwnershipBridge
            builderCards={builderCards}
            isLoggedIn={isLoggedIn}
            marketplace={marketplace}
            onResult={setOwnershipData}
          />
        </Suspense>
      )}
    </div>
  );
}

/**
 * Catalog-gated bridge that resolves a pending click to a Printing, opens the
 * detail pane, and renders it. Suspends on first call until the catalog query
 * resolves — parent supplies a fallback that shows a skeleton when a click is
 * pending so the user sees instant feedback on the share page.
 * @returns The desktop detail pane (returns its own null when nothing is selected).
 */
function SharedDeckDetailPaneBridge({
  cards,
  pendingClick,
  onResolved,
  showImages,
}: {
  cards: DeckBuilderCard[];
  pendingClick: DeckBuilderCard | null;
  onResolved: () => void;
  showImages: boolean;
}) {
  const { items, printingsByCardId } = useDeckItems(cards);
  const { getPreferredPrinting } = usePreferredPrinting();

  useEffect(() => {
    if (!pendingClick) {
      return;
    }
    const printing = getPreferredPrinting(pendingClick.cardId, pendingClick.preferredPrintingId);
    if (printing) {
      useSelectionStore.getState().selectCard(printing, items, "card");
      onResolved();
    }
  }, [pendingClick, getPreferredPrinting, items, onResolved]);

  return (
    <SelectionDetailPane
      items={items}
      printingsByCardId={printingsByCardId}
      showImages={showImages}
      onSearchAndClose={() => {
        // Anonymous viewers have no filter context here — there is no card
        // browser to drive. Swallow the click for now.
      }}
    />
  );
}

/**
 * Mobile counterpart to {@link SharedDeckDetailPaneBridge}. Resolves a pending
 * click into a Printing on the share page, then renders the mobile drawer.
 * @returns The mobile detail drawer (returns its own null when nothing is selected).
 */
function SharedDeckMobileOverlayBridge({
  cards,
  pendingClick,
  onResolved,
  showImages,
}: {
  cards: DeckBuilderCard[];
  pendingClick: DeckBuilderCard | null;
  onResolved: () => void;
  showImages: boolean;
}) {
  const { items, printingsByCardId } = useDeckItems(cards);
  const { getPreferredPrinting } = usePreferredPrinting();

  useEffect(() => {
    if (!pendingClick) {
      return;
    }
    const printing = getPreferredPrinting(pendingClick.cardId, pendingClick.preferredPrintingId);
    if (printing) {
      useSelectionStore.getState().selectCard(printing, items, "card");
      onResolved();
    }
  }, [pendingClick, getPreferredPrinting, items, onResolved]);

  return (
    <SelectionMobileOverlay
      items={items}
      printingsByCardId={printingsByCardId}
      showImages={showImages}
      onSearchAndClose={() => {
        // See SharedDeckDetailPaneBridge.
      }}
    />
  );
}

/**
 * Skeleton placeholder shown in the right rail while the catalog suspends and
 * the user already clicked a card. Wraps the shared CardDetailSkeleton in a
 * Pane so the layout matches the real detail pane that will replace it.
 * @returns A sticky right-side pane filled with skeletons.
 */
function SharedDetailSkeletonPane() {
  return (
    <Pane className="@md:block">
      <CardDetailSkeleton />
    </Pane>
  );
}
