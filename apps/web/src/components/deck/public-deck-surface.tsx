import type { DeckZone, PublicDeckDetailResponse } from "@openrift/shared";
import { WellKnown, imageUrl } from "@openrift/shared";
import { Suspense, useEffect, useRef, useState } from "react";

import { CatalogSubsetProvider } from "@/components/cards/catalog-subset-provider";
import { DeckMissingCardsDialog } from "@/components/deck/deck-missing-cards-dialog";
import { DeckOverview } from "@/components/deck/deck-overview";
import { DeckOwnershipBridge } from "@/components/deck/deck-ownership-bridge";
import { DeckPlanView } from "@/components/deck/deck-plan-view";
import type { HoverOrigin } from "@/components/deck/hovered-card-preview";
import { HoveredCardPreview } from "@/components/deck/hovered-card-preview";
import { useMeasuredHeight } from "@/components/layout/page-top-bar";
import { Pane } from "@/components/layout/panes";
import { SelectionDetailOverlays } from "@/components/selection-detail-overlays";
import { CardDetailSkeleton, SelectionDetailPane } from "@/components/selection-detail-pane";
import { useDeckItems } from "@/hooks/use-deck-items";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useHeaderHeight } from "@/hooks/use-header-height";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import type { CardOpenTarget } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { toBuilderCardFromPublic } from "@/lib/deck-builder-card";
import type { FilterSearch } from "@/lib/search-schemas";
import { FilterSearchProvider } from "@/lib/search-schemas";
import { PAGE_WIDTH, PAGE_PADDING, cn } from "@/lib/utils";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

const EMPTY_FILTER_SEARCH: FilterSearch = {};

function thumbKey(cardId: string, preferredPrintingId: string | null): string {
  return `${cardId}|${preferredPrintingId ?? ""}`;
}

interface PublicDeckSurfaceProps {
  data: PublicDeckDetailResponse;
  isLoggedIn: boolean;
  returnPath: string;
  heroByline?: React.ReactNode;
  heroHeading?: React.ReactNode;
  heroLead?: React.ReactNode;
  heroActions?: React.ReactNode;
  topBar?: React.ReactNode;
  notice?: React.ReactNode;
  footer?: React.ReactNode;
  unknownZoneCounts?: ReadonlyMap<DeckZone, number>;
}

/**
 * The read-only deck page shared by `/decks/share/$token` and the meta
 * archive's `/meta/decks/$token`, which differ only in the props passed here.
 */
export function PublicDeckSurface({ topBar, ...props }: PublicDeckSurfaceProps) {
  const [barEl, setBarEl] = useState<HTMLDivElement | null>(null);
  const barHeight = useMeasuredHeight(barEl);
  return (
    <FilterSearchProvider value={EMPTY_FILTER_SEARCH}>
      <CatalogSubsetProvider catalog={props.data.catalog}>
        <div className="flex min-h-0 flex-1 flex-col">
          {topBar ? <div ref={setBarEl}>{topBar}</div> : null}
          <PublicDeckContent {...props} topBarHeight={barHeight} />
        </div>
      </CatalogSubsetProvider>
    </FilterSearchProvider>
  );
}

function PublicDeckContent({
  data,
  isLoggedIn,
  returnPath,
  heroByline,
  heroHeading,
  heroLead,
  heroActions,
  notice,
  footer,
  unknownZoneCounts,
  topBarHeight,
}: PublicDeckSurfaceProps & { topBarHeight: number }) {
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const marketplace = marketplaceOrder[0] ?? "cardtrader";
  const isMobile = useIsMobile();
  const hydrated = useHydrated();
  const headerHeight = useHeaderHeight();
  const showImages = useDisplayStore((state) => state.showImages);
  const detailOpen = useSelectionStore((state) => state.detailOpen);

  // Comes straight from the enriched payload, no catalog lookup, so this is SSR-safe.
  const builderCards = data.cards.map(toBuilderCardFromPublic);
  const thumbByKey = (() => {
    const map = new Map<string, string>();
    for (const card of data.cards) {
      if (card.imageId) {
        map.set(thumbKey(card.cardId, card.preferredPrintingId), imageUrl(card.imageId, "400w"));
      }
    }
    return map;
  })();
  const hoverMeta = (() => {
    const map = new Map<string, { fullUrl: string; landscape: boolean }>();
    for (const card of data.cards) {
      if (card.imageId) {
        map.set(thumbKey(card.cardId, card.preferredPrintingId), {
          fullUrl: imageUrl(card.imageId, "full"),
          landscape: card.cardTypes.includes(WellKnown.cardType.BATTLEFIELD),
        });
      }
    }
    return map;
  })();

  const [ownershipData, setOwnershipData] = useState<DeckOwnershipData>();

  // Old links deep-link with #deck-test / #deck-plan (retired section-nav
  // anchors); map the hash to a tab once on mount.
  const setOverviewTab = useDeckBuilderUiStore((state) => state.setOverviewTab);
  useEffect(() => {
    const hash = globalThis.location?.hash;
    setOverviewTab(hash === "#deck-test" ? "test" : hash === "#deck-plan" ? "plan" : "overview");
  }, [setOverviewTab]);

  const [hovered, setHovered] = useState<{
    id: string;
    preferredPrintingId: string | null;
    origin: HoverOrigin;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [missingOpen, setMissingOpen] = useState(false);
  const [pendingClick, setPendingClick] = useState<CardOpenTarget | null>(null);

  const onHoverCard = (id: string | null, preferredPrintingId?: string | null) =>
    setHovered(
      id ? { id, preferredPrintingId: preferredPrintingId ?? null, origin: "main-right" } : null,
    );

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

  const handleCardClick = (card: CardOpenTarget) => setPendingClick(card);

  return (
    <div
      ref={containerRef}
      className={cn(PAGE_PADDING, PAGE_WIDTH.full, "relative flex flex-col gap-4 py-4")}
    >
      <HoveredCardPreview
        hoveredCard={hoveredCard}
        origin={hovered?.origin ?? "main"}
        containerRef={containerRef}
      />

      <div
        className="@container flex items-stretch gap-6"
        style={{ "--sticky-top": `${headerHeight + topBarHeight}px` } as React.CSSProperties}
      >
        <div className="min-w-0 flex-1">
          <DeckOverview
            deck={{
              id: data.deck.id,
              name: data.deck.name,
              format: data.deck.format,
              formatConfig: data.deck.formatConfig,
              coverCardId: data.deck.coverCardId,
              coverPrintingId: data.deck.coverPrintingId,
              coverPosition: data.deck.coverPosition,
              links: data.deck.links,
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
              isLoggedIn ? undefined : `/login?redirect=${encodeURIComponent(returnPath)}`
            }
            description={data.deck.description ?? undefined}
            oddsConfig={data.deck.oddsConfig}
            onCardClick={handleCardClick}
            planSlot={
              data.plan ? (
                <DeckPlanView plan={data.plan} planCardMeta={data.planCardMeta} />
              ) : undefined
            }
            notice={notice}
            unknownZoneCounts={unknownZoneCounts}
            heroByline={heroByline}
            heroHeading={heroHeading}
            heroLead={heroLead}
            heroActions={heroActions}
          />
        </div>
        {!isMobile && (
          <Suspense fallback={pendingClick ? <PublicDeckSkeletonPane /> : null}>
            {hydrated && (
              <PublicDeckDetailPaneBridge cards={builderCards} showImages={showImages} />
            )}
            {!hydrated && pendingClick && <PublicDeckSkeletonPane />}
          </Suspense>
        )}
      </div>

      {footer}

      {/* Not gated on isMobile: the overlay itself picks the drawer or the dialog. */}
      {hydrated && (
        <Suspense fallback={null}>
          <PublicDeckOverlayBridge
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
          deckName={data.deck.name}
        />
      )}

      {/* Gated behind hydration: ownership + price data needs client-only hooks. */}
      {hydrated && (
        <Suspense fallback={null}>
          <DeckOwnershipBridge
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

// Resolving the pending click is PublicDeckOverlayBridge's job, not this
// one's: both are mounted together, and two effects would select it twice.
function PublicDeckDetailPaneBridge({
  cards,
  showImages,
}: {
  cards: DeckBuilderCard[];
  showImages: boolean;
}) {
  const { items, printingsByCardId } = useDeckItems(cards);

  return (
    <SelectionDetailPane
      items={items}
      printingsByCardId={printingsByCardId}
      showImages={showImages}
      onSearchAndClose={() => {
        // No filter context for anonymous viewers; swallow the click.
      }}
    />
  );
}

// The single owner of the pending-click effect; the paired bridge above only renders.
function PublicDeckOverlayBridge({
  cards,
  pendingClick,
  onResolved,
  showImages,
}: {
  cards: DeckBuilderCard[];
  pendingClick: CardOpenTarget | null;
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
      useSelectionStore.getState().selectCard(printing, items, "card", { zone: pendingClick.zone });
      onResolved();
    }
  }, [pendingClick, getPreferredPrinting, items, onResolved]);

  return (
    <SelectionDetailOverlays
      items={items}
      printingsByCardId={printingsByCardId}
      showImages={showImages}
      onSearchAndClose={() => {
        // No filter context for anonymous viewers; swallow the click.
      }}
    />
  );
}

function PublicDeckSkeletonPane() {
  return (
    <Pane className="@md:block">
      <CardDetailSkeleton />
    </Pane>
  );
}
