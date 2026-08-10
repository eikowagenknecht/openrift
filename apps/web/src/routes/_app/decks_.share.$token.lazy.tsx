import type { PublicDeckCardResponse } from "@openrift/shared";
import { WellKnown, imageUrl } from "@openrift/shared";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { CopyIcon } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";

import { DeckMissingCardsDialog } from "@/components/deck/deck-missing-cards-dialog";
import { DeckOverview } from "@/components/deck/deck-overview";
import { DeckPlanView } from "@/components/deck/deck-plan-view";
import type { HoverOrigin } from "@/components/deck/hovered-card-preview";
import { HoveredCardPreview } from "@/components/deck/hovered-card-preview";
import { SharedDeckOwnershipBridge } from "@/components/deck/shared-deck-ownership-bridge";
import { Pane } from "@/components/layout/panes";
import { SelectionDetailOverlays } from "@/components/selection-detail-overlays";
import { CardDetailSkeleton, SelectionDetailPane } from "@/components/selection-detail-pane";
import { Button } from "@/components/ui/button";
import { useDeckItems } from "@/hooks/use-deck-items";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useCloneSharedDeck, usePublicDeck } from "@/hooks/use-decks";
import { useHeaderHeight } from "@/hooks/use-header-height";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { useSession } from "@/lib/auth-session";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import type { FilterSearch } from "@/lib/search-schemas";
import { FilterSearchProvider } from "@/lib/search-schemas";
import { CONTAINER_WIDTH, PAGE_PADDING, cn } from "@/lib/utils";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

export const Route = createLazyFileRoute("/_app/decks_/share/$token")({
  component: SharedDeckPage,
});

// The card detail pane (OwnedCollectionsPopover via PrintingPicker) reads the
// filter context to build collection links. This page has no filter UI, so an
// empty value is the whole contract — every FilterSearch field is optional and
// `view` falls back to the display-store default.
const EMPTY_FILTER_SEARCH: FilterSearch = {};

function SharedDeckPage() {
  // No page top bar here on purpose: the hero already carries the deck's name
  // and status, so the page opens straight with it. Attribution and the copy
  // CTA live in a slim row above the hero, and the sticky section nav keeps a
  // compact copy button reachable while scrolled.
  return (
    <FilterSearchProvider value={EMPTY_FILTER_SEARCH}>
      <div className="flex min-h-0 flex-1 flex-col">
        <SharedDeckContent />
      </div>
    </FilterSearchProvider>
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
    cardTypes: card.cardTypes,
    superTypes: card.superTypes,
    domains: card.domains,
    tags: card.tags,
    keywords: card.keywords,
    maxCopiesOverride: card.maxCopiesOverride,
    banned: card.banned,
    energy: card.energy,
    might: card.might,
    power: card.power,
  };
}

function thumbKey(cardId: string, preferredPrintingId: string | null): string {
  return `${cardId}|${preferredPrintingId ?? ""}`;
}

function SharedDeckContent() {
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

  // The share page uses the same tab strip as the editor. Old share links
  // deep-link with #deck-test / #deck-plan (the retired section nav's
  // anchors), so map the hash to a tab once on mount; anything else starts on
  // the Deck tab rather than inheriting a tab left over from another surface.
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
  const [pendingClick, setPendingClick] = useState<DeckBuilderCard | null>(null);

  // The whole share page is the deck overview, so every hover docks the
  // preview at the right edge ("main-right") instead of chasing the cursor.
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
      className={cn(PAGE_PADDING, CONTAINER_WIDTH, "relative flex flex-col gap-4 py-4")}
    >
      <HoveredCardPreview
        hoveredCard={hoveredCard}
        origin={hovered?.origin ?? "main"}
        containerRef={containerRef}
      />

      <div
        className="@container flex items-stretch gap-6"
        style={{ "--sticky-top": `${headerHeight}px` } as React.CSSProperties}
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
              videoUrl: data.deck.videoUrl,
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
            oddsConfig={data.deck.oddsConfig}
            onCardClick={handleCardClick}
            planSlot={
              data.plan ? (
                <DeckPlanView plan={data.plan} planCardMeta={data.planCardMeta} />
              ) : undefined
            }
            // The hero is the page header here: "by …" next to the deck
            // name, the copy CTA under the status chips.
            heroByline={<>by {data.owner.displayName}</>}
            heroActions={
              <Button onClick={handleClone} disabled={cloneMutation.isPending}>
                <CopyIcon />
                {cloneMutation.isPending
                  ? "Copying…"
                  : isLoggedIn
                    ? "Copy to my decks"
                    : "Sign in to copy"}
              </Button>
            }
          />
        </div>
        {!isMobile && (
          <Suspense fallback={pendingClick ? <SharedDetailSkeletonPane /> : null}>
            {hydrated && (
              <SharedDeckDetailPaneBridge cards={builderCards} showImages={showImages} />
            )}
            {!hydrated && pendingClick && <SharedDetailSkeletonPane />}
          </Suspense>
        )}
      </div>
      {/* Every viewport: the overlay component picks the drawer or the dialog.
          Gating this on isMobile left desktop clicks selecting a card with
          nothing to show whenever the pane was undocked. */}
      {hydrated && (
        <Suspense fallback={null}>
          <SharedDeckOverlayBridge
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
 * Catalog-gated bridge that renders the desktop detail pane. Suspends on first
 * call until the catalog query resolves — parent supplies a fallback that shows
 * a skeleton when a click is pending so the user sees instant feedback on the
 * share page.
 *
 * Resolving the pending click is {@link SharedDeckOverlayBridge}'s job, not
 * this one's: both bridges are mounted together on desktop, and two copies of
 * that effect would select the card twice.
 * @returns The desktop detail pane (returns its own null when undocked or nothing is selected).
 */
function SharedDeckDetailPaneBridge({
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
        // browser to drive. Swallow the click for now.
      }}
    />
  );
}

/**
 * Resolves a pending click into a Printing on the share page and renders the
 * detail overlay for the viewport. Mounted on every viewport: the overlay
 * component picks the drawer or the dialog itself, and this is the single owner
 * of the pending-click effect.
 * @returns The detail overlay (returns its own null when nothing is selected).
 */
function SharedDeckOverlayBridge({
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
      useSelectionStore.getState().selectCard(printing, items, "card", pendingClick.zone);
      onResolved();
    }
  }, [pendingClick, getPreferredPrinting, items, onResolved]);

  return (
    <SelectionDetailOverlays
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
