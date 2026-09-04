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

// The card detail pane (OwnedCollectionsPopover via PrintingPicker) reads the
// filter context to build collection links. These pages have no filter UI, so an
// empty value is the whole contract — every FilterSearch field is optional and
// `view` falls back to the display-store default.
const EMPTY_FILTER_SEARCH: FilterSearch = {};

function thumbKey(cardId: string, preferredPrintingId: string | null): string {
  return `${cardId}|${preferredPrintingId ?? ""}`;
}

interface PublicDeckSurfaceProps {
  /**
   * The enriched share payload. The meta archive's response is this shape plus
   * its own `meta` block, which the caller reads for the byline rather than
   * passing down.
   */
  data: PublicDeckDetailResponse;
  /**
   * Whether a user is signed in. Passed rather than derived: the share page
   * reads the session, the archive follows the deck importer and reads the
   * presence of a user id, not a session load state.
   */
  isLoggedIn: boolean;
  /** Where a signed-out viewer comes back to after logging in. */
  returnPath: string;
  /** Rendered next to the deck name: the owner, or the archive's event facts. */
  heroByline?: React.ReactNode;
  /** Replaces the hero's name-and-subtitle block. */
  heroHeading?: React.ReactNode;
  /** Rendered left of the hero's text column. */
  heroLead?: React.ReactNode;
  /** The copy CTA under the status chips, for a page with no top bar. */
  heroActions?: React.ReactNode;
  /**
   * A sticky bar above the page, for a caller whose page needs a breadcrumb and
   * a title row (the archive). The share page has neither and passes nothing.
   */
  topBar?: React.ReactNode;
  /** Optional callout between the hero and the tab strip. */
  notice?: React.ReactNode;
  /** Credits and correction links, rendered below the deck. */
  footer?: React.ReactNode;
  /** Forwarded to the overview: per zone, cards this list's source never published. */
  unknownZoneCounts?: ReadonlyMap<DeckZone, number>;
}

/**
 * The read-only deck page shared by `/decks/share/$token` and the meta
 * archive's `/meta/decks/$token`. Both render the same deck overview with the
 * same hover preview, detail pane, ownership overlay, and missing-cards dialog;
 * they differ only in where the payload came from and what the hero says, so
 * those are props and everything else lives here.
 *
 * The payload carries the catalogue rows the deck needs, and they are provided
 * here rather than fetched: `useCards` under this tree reads the subset, so
 * neither page pulls the whole catalogue into its SSR payload.
 *
 * No page top bar of its own: the hero already carries the deck's name and
 * status, so the share page opens straight with it. A caller that needs one
 * anyway — the archive, whose breadcrumb walks back to the event — hands it in
 * as `topBar`.
 *
 * @returns The public deck surface.
 */
export function PublicDeckSurface({ topBar, ...props }: PublicDeckSurfaceProps) {
  // Everything sticky below the bar offsets past it, so the bar is measured
  // rather than assumed. Zero without one, which is the share page.
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

  // Everything the shell needs — builder cards, thumbnails, hover full-image
  // URLs — comes straight from the enriched payload. No catalog lookup, so
  // this branch is SSR-safe.
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

  // These pages use the same tab strip as the editor. Old links deep-link with
  // #deck-test / #deck-plan (the retired section nav's anchors), so map the
  // hash to a tab once on mount; anything else starts on the Deck tab rather
  // than inheriting a tab left over from another surface.
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
  // When the catalog hasn't hydrated yet, capture the click so the bridge can
  // resolve it once printings are available.
  const [pendingClick, setPendingClick] = useState<CardOpenTarget | null>(null);

  // The whole page is the deck overview, so every hover docks the preview at
  // the right edge ("main-right") instead of chasing the cursor.
  const onHoverCard = (id: string | null, preferredPrintingId?: string | null) =>
    setHovered(
      id ? { id, preferredPrintingId: preferredPrintingId ?? null, origin: "main-right" } : null,
    );

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

      {/* Every viewport: the overlay component picks the drawer or the dialog.
          Gating this on isMobile left desktop clicks selecting a card with
          nothing to show whenever the pane was undocked. */}
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

      {/*
        Ownership + price data still needs the global catalog (printings +
        prices) and the user's copies, both of which require client-only
        hooks. Gate behind hydration so SSR never tries to evaluate them.
      */}
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

/**
 * Catalog-gated bridge that renders the desktop detail pane. Suspends on first
 * call until the catalog query resolves — the parent supplies a fallback that
 * shows a skeleton when a click is pending, so the user sees instant feedback.
 *
 * Resolving the pending click is {@link PublicDeckOverlayBridge}'s job, not
 * this one's: both bridges are mounted together on desktop, and two copies of
 * that effect would select the card twice.
 * @returns The desktop detail pane (returns its own null when undocked or nothing is selected).
 */
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
        // Anonymous viewers have no filter context here — there is no card
        // browser to drive. Swallow the click.
      }}
    />
  );
}

/**
 * Resolves a pending click into a Printing and renders the detail overlay for
 * the viewport. Mounted on every viewport: the overlay component picks the
 * drawer or the dialog itself, and this is the single owner of the
 * pending-click effect.
 * @returns The detail overlay (returns its own null when nothing is selected).
 */
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
        // See PublicDeckDetailPaneBridge.
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
function PublicDeckSkeletonPane() {
  return (
    <Pane className="@md:block">
      <CardDetailSkeleton />
    </Pane>
  );
}
