import { formatHasSideboard } from "@openrift/shared/deck-rules";
import { imageUrl } from "@openrift/shared/image-url";
import type { DeckZone } from "@openrift/shared/types/enums";
import { getOrientation } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";
import { useQueryClient } from "@tanstack/react-query";
import { CornerLeftUpIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Footer } from "@/components/layout/footer";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBarHeightContext,
  useMeasuredHeight,
  usePageTopBarHeight,
} from "@/components/layout/page-top-bar";
import {
  SectionHeader,
  SectionHeaderActions,
  SectionHeaderTitle,
} from "@/components/section-header";
import { Button } from "@/components/ui/button";
import {
  NestedSidebar,
  SidebarContent,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { SelectionDetailOverlays } from "@/features/cards/components/selection-detail-overlays";
import { SelectionDetailPane } from "@/features/cards/components/selection-detail-pane";
import { useFilterActions } from "@/features/cards/hooks/use-card-filters";
import { useCards } from "@/features/cards/hooks/use-cards";
import { usePreferredPrinting } from "@/features/cards/hooks/use-preferred-printing";
import type { CardOpenTarget } from "@/features/cards/lib/card-row-interactions";
import { useDeckBuildingCounts } from "@/features/collections/hooks/use-owned-count";
import { DeckCardBrowser } from "@/features/decks/components/deck-card-browser";
import { DeckDndContext } from "@/features/decks/components/deck-dnd-context";
import { DeckEditorDialogs } from "@/features/decks/components/deck-editor-dialogs";
import { DeckEditorTopBar } from "@/features/decks/components/deck-editor-top-bar";
import { DeckMobileDock } from "@/features/decks/components/deck-mobile-dock";
import { useDeckUndoShortcuts } from "@/features/decks/components/deck-undo-controls";
import { DeckVariantRail } from "@/features/decks/components/deck-variant-rail";
import { DeckZonePanel } from "@/features/decks/components/deck-zone-panel";
import { HoveredCardPreview } from "@/features/decks/components/hovered-card-preview";
import type { HoverOrigin } from "@/features/decks/components/hovered-card-preview";
import {
  hydrateDeckDraft,
  useDeckDraftHydrated,
  useDeckSaveStatus,
} from "@/features/decks/hooks/deck-builder-collection";
import { useDeckCards, useDeckViolations } from "@/features/decks/hooks/use-deck-builder";
import { useDeckEditorDialogs } from "@/features/decks/hooks/use-deck-editor-dialogs";
import { useDeckItems } from "@/features/decks/hooks/use-deck-items";
import { useDeckOwnership } from "@/features/decks/hooks/use-deck-ownership";
import { useDeckDetail } from "@/features/decks/hooks/use-decks";
import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { toDeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { buildRunesByDomain } from "@/features/decks/lib/deck-runes-by-domain";
import { deckZoneFilterPreset } from "@/features/decks/lib/deck-zone-filters";
import { requiredZoneProgress } from "@/features/decks/lib/deck-zone-labels";
import { isLocalDeckId } from "@/features/decks/lib/local-deck";
import { useDeckBuilderUiStore } from "@/features/decks/stores/deck-builder-ui-store";
import { useIncomingTradeCounts } from "@/features/groups/hooks/use-card-trades";
import { useBorrowedCounts } from "@/features/groups/hooks/use-loans";
import { useRegisterQuickAdd } from "@/hooks/use-command-palette";
import { useHeaderHeight } from "@/hooks/use-header-height";
import { useScopeEffect } from "@/hooks/use-scope-effect";
import { useSession, useUserId } from "@/lib/auth-session";
import { cn, PAGE_WIDTH } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

interface DeckEditorPageProps {
  deckId: string;
}

function MobileSidebarHeader() {
  const { setOpenMobile } = useSidebar();

  return (
    <SectionHeader className="items-center p-4 md:hidden">
      <SectionHeaderTitle level={3} as="h2">
        Deck Zones
      </SectionHeaderTitle>
      <SectionHeaderActions>
        <Button variant="ghost" size="icon-sm" onClick={() => setOpenMobile(false)}>
          <XIcon />
          <span className="sr-only">Close</span>
        </Button>
      </SectionHeaderActions>
    </SectionHeader>
  );
}

export function DeckEditorPage({ deckId }: DeckEditorPageProps) {
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);

  return (
    <PageTopBarHeightContext value={topBarHeight}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={setTopBarSlot} className={PAGE_TOP_BAR_STICKY} />
        <SidebarProvider defaultOpen>
          <DeckEditorContent deckId={deckId} topBarSlot={topBarSlot} />
        </SidebarProvider>
      </div>
    </PageTopBarHeightContext>
  );
}

function DeckEditorContent({
  deckId,
  topBarSlot,
}: {
  deckId: string;
  topBarSlot: HTMLDivElement | null;
}) {
  const queryClient = useQueryClient();
  const userId = useUserId();
  // The draft cache is keyed under a "local" sentinel scope so a browser-local
  // deck works logged out; a server deck keys under its userId.
  const isLocal = isLocalDeckId(deckId);
  const scope = isLocal ? "local" : (userId ?? "");
  const { data } = useDeckDetail(deckId);
  const { cardsById, allPrintings } = useCards();
  const { getPreferredPrinting } = usePreferredPrinting();
  const hydrated = useDeckDraftHydrated(queryClient, scope, deckId);
  const deckCards = useDeckCards(deckId);
  const saveStatus = useDeckSaveStatus(queryClient, scope, deckId);
  const { isMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const activeZone = useDeckBuilderUiStore((state) => state.activeZone);
  const setActiveZone = useDeckBuilderUiStore((state) => state.setActiveZone);
  const setOverviewTab = useDeckBuilderUiStore((state) => state.setOverviewTab);
  const resetUi = useDeckBuilderUiStore((state) => state.reset);
  const setRunesByDomain = useDeckBuilderUiStore((state) => state.setRunesByDomain);
  const dialogs = useDeckEditorDialogs();

  // Ownership data — split available vs locked so the deck builder respects
  // each collection's availableForDeckbuilding flag.
  const { data: session } = useSession();
  // The deck's home collection overrides the exclusion for this deck: the box
  // it's stored in is buildable here, and stays locked for every other deck.
  const { data: deckCounts } = useDeckBuildingCounts(
    Boolean(session?.user),
    data.deck.collectionId,
  );
  // Copies borrowed from friends are in hand and buildable.
  const { data: borrowedCounts } = useBorrowedCounts(Boolean(session?.user));
  // Cards arriving from reserved trades are not in hand: advisory only, so
  // the user doesn't buy a copy that's already on its way.
  const { data: incomingCounts } = useIncomingTradeCounts(Boolean(session?.user));
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const marketplace = marketplaceOrder[0];
  const editorViolations = useDeckViolations(deckId, data.deck.format, data.deck.formatConfig);
  // Ctrl+Z / Ctrl+Shift+Z over the whole editor; mounted here (not in a
  // conditional subtree) so the shortcuts survive zone and tab switches.
  useDeckUndoShortcuts(deckId);

  // Ctrl/Cmd+K reaches the quick-add omnibar through the command palette,
  // which resolves the chord to whichever quick-add the route registered.
  useRegisterQuickAdd({ key: `deck:${deckId}`, label: "Add cards to this deck" });
  const ownershipData = useDeckOwnership(
    deckCards,
    allPrintings,
    deckCounts?.available,
    marketplace,
    deckCounts?.locked,
    borrowedCounts,
    deckCounts && {
      loaned: deckCounts.lockedLoaned,
      reserved: deckCounts.lockedReserved,
      excluded: deckCounts.lockedExcluded,
    },
    incomingCounts,
  );

  // Built here (always-mounted parent) so the rebalance fallback can swap in
  // an opposite-domain rune even before the user activates any zone.
  useEffect(() => {
    if (allPrintings.length === 0) {
      return;
    }
    setRunesByDomain(buildRunesByDomain(allPrintings));
  }, [allPrintings, setRunesByDomain]);

  // Any user edit after this debounces a PUT back to the server through the
  // collection's auto-wired save handler.
  useEffect(() => {
    if (data && !hydrated) {
      const builderCards = data.cards
        .map((card) => toDeckBuilderCard(card, cardsById))
        .filter((card): card is DeckBuilderCard => card !== null);
      hydrateDeckDraft(queryClient, scope, deckId, builderCards);
    }
  }, [data, deckId, hydrated, queryClient, scope, cardsById]);

  // The draft collection is intentionally left alone here: it stays cached
  // per user so re-entering the same deck skips re-hydration.
  useEffect(
    () => () => {
      resetUi();
    },
    [resetUi],
  );

  // The handler re-registers only on the two transitions it reads, not on
  // every card edit.
  const unsavedWarning = saveStatus.isDirty || saveStatus.isSaving;
  useEffect(() => {
    if (!unsavedWarning) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    globalThis.addEventListener("beforeunload", handler);
    return () => globalThis.removeEventListener("beforeunload", handler);
  }, [unsavedWarning]);

  const { setArrayFilters, setRanges, setSearch } = useFilterActions();

  const { items: deckItems, printingsByCardId } = useDeckItems(deckCards);
  const showImages = useDisplayStore((state) => state.showImages);
  const detailOpen = useSelectionStore((state) => state.detailOpen);
  // Not `use(PageTopBarHeightContext)`: must stay at its pre-measurement 0
  // while the subtree hydrates, since it feeds an inline --sticky-top below.
  const topBarHeight = usePageTopBarHeight();
  const headerHeight = useHeaderHeight();

  // Switching between overview and zone mode swaps the items array under the
  // detail pane (deck items vs catalog items), so clear the selection at the
  // boundary to avoid an orphaned selectedIndex.
  useScopeEffect(activeZone, () => {
    useSelectionStore.getState().closeDetail();
  });

  // A hidden empty sideboard must not keep the browser targeting an unrendered zone.
  const sideboardHidden =
    !formatHasSideboard(data.deck.format) &&
    !deckCards.some((card) => card.zone === WellKnown.deckZone.SIDEBOARD);
  useEffect(() => {
    if (activeZone === WellKnown.deckZone.SIDEBOARD && sideboardHidden) {
      setActiveZone(null);
    }
  }, [activeZone, sideboardHidden, setActiveZone]);

  const handleOverviewCardClick = (card: CardOpenTarget) => {
    const printing = getPreferredPrinting(card.cardId, card.preferredPrintingId);
    if (!printing) {
      return;
    }
    // Pass the zone so a card appearing in multiple zones anchors at the
    // instance the user clicked, not at the first zone-occurrence.
    useSelectionStore.getState().selectCard(printing, deckItems, "card", { zone: card.zone });
  };

  const handleZoneClick = (zone: DeckZone) => {
    // Clicking the active zone again returns to the overview dashboard.
    if (zone === activeZone) {
      setActiveZone(null);
      setSearch("");
      if (isMobile) {
        setOpenMobile(false);
      }
      return;
    }

    const preset = deckZoneFilterPreset(zone, deckCards, data.deck.format, data.deck.formatConfig);
    setSearch(preset.search);
    setArrayFilters(preset.arrayFilters);
    if (preset.clearStatRanges) {
      setRanges({ energy: null, might: null, power: null });
    }

    setActiveZone(zone);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const [hovered, setHovered] = useState<{
    id: string;
    origin: HoverOrigin;
    preferredPrintingId: string | null;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const setHoveredSidebar = (id: string | null, preferredPrintingId?: string | null) =>
    setHovered(
      id ? { id, origin: "sidebar", preferredPrintingId: preferredPrintingId ?? null } : null,
    );
  // Overview hovers dock the preview at the right edge ("main-right") instead
  // of chasing the cursor; the zone browser keeps the cursor-following float.
  const setHoveredMain = (id: string | null, preferredPrintingId?: string | null) => {
    const overviewShowing = activeZone === null;
    setHovered(
      id
        ? {
            id,
            origin: overviewShowing ? "main-right" : "main",
            preferredPrintingId: preferredPrintingId ?? null,
          }
        : null,
    );
  };

  // Suppresses the main/overview hover preview while a card is shown (docked
  // pane or modal); `detailOpen` tracks the shown card, not pane presence.
  const suppressHoverPreview =
    detailOpen && (hovered?.origin === "main" || hovered?.origin === "main-right");
  const hoveredPrinting =
    hovered && !isMobile && !suppressHoverPreview
      ? (getPreferredPrinting(hovered.id, hovered.preferredPrintingId) ?? null)
      : null;
  const hoveredFrontImage = hoveredPrinting?.images.find((image) => image.face === "front") ?? null;
  const hoveredCard =
    hoveredPrinting && hoveredFrontImage
      ? {
          thumbnailUrl: imageUrl(hoveredFrontImage.imageId, "400w"),
          fullUrl: imageUrl(hoveredFrontImage.imageId, "full"),
          landscape: getOrientation(hoveredPrinting.card.types) === "landscape",
        }
      : null;

  const zoneCount = deckCards
    .filter((card) => card.zone === activeZone)
    .reduce((sum, card) => sum + card.quantity, 0);
  const totalCards = deckCards.reduce((sum, card) => sum + card.quantity, 0);
  const requiredCounts = requiredZoneProgress(deckCards, data.deck.format);

  if (!hydrated) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {topBarSlot &&
        createPortal(
          <DeckEditorTopBar
            deckId={deckId}
            deck={data.deck}
            cards={deckCards}
            isLocal={isLocal}
            activeZone={activeZone}
            zoneCount={zoneCount}
            requiredProgress={requiredCounts}
            hasViolations={editorViolations.length > 0}
            onToggleSidebar={toggleSidebar}
            openDialog={dialogs.openDialog}
          />,
          topBarSlot,
        )}
      <DeckEditorDialogs
        deckId={deckId}
        deck={data.deck}
        cards={deckCards}
        isLocal={isLocal}
        isDirty={saveStatus.isDirty}
        ownershipData={ownershipData}
        marketplace={marketplace}
        dialogs={dialogs}
      />
      <DeckDndContext deckId={deckId}>
        <div ref={containerRef} className={cn(PAGE_WIDTH.full, "px-safe relative flex gap-4")}>
          <NestedSidebar
            className="w-(--sidebar-width)!"
            extraOffset="calc(0.75rem + 2rem + 0.75rem)"
            style={{ "--sidebar-width": "18rem" } as React.CSSProperties}
          >
            <MobileSidebarHeader />
            <SidebarContent>
              <div className="p-3">
                <DeckZonePanel
                  deckId={deckId}
                  onZoneClick={handleZoneClick}
                  onOverviewClick={() => {
                    setActiveZone(null);
                    setOverviewTab("overview");
                  }}
                  onHoverCard={setHoveredSidebar}
                  ownershipData={ownershipData}
                  hideStats={activeZone === null}
                  overviewShowing={activeZone === null}
                  deckItems={deckItems}
                />
              </div>
            </SidebarContent>
          </NestedSidebar>

          <HoveredCardPreview
            hoveredCard={hoveredCard}
            origin={hovered?.origin ?? "sidebar"}
            containerRef={containerRef}
          />

          <div className="flex min-w-0 flex-1 flex-col pb-3">
            {totalCards === 0 && (
              <div className="text-muted-foreground flex items-center gap-2 pt-1 pb-2 pl-8 md:hidden">
                <CornerLeftUpIcon className="size-4 shrink-0" />
                <span>
                  Tap <span className="text-foreground font-medium">Zones</span> above to see all
                  zones
                </span>
              </div>
            )}
            <div
              className="@container flex flex-1 items-stretch gap-6"
              style={
                {
                  "--sticky-top": `${headerHeight + topBarHeight}px`,
                } as React.CSSProperties
              }
            >
              {/* pb-20 clears the mobile deck dock so the last grid row stays
                  reachable while a zone is open. */}
              <div
                className={cn("flex min-w-0 flex-1 flex-col", isMobile && activeZone && "pb-20")}
              >
                <DeckCardBrowser
                  deckId={deckId}
                  ownershipData={ownershipData}
                  marketplace={marketplace}
                  onZoneClick={handleZoneClick}
                  onViewMissing={() => dialogs.openDialog("missing")}
                  onHoverCard={setHoveredMain}
                  onOverviewCardClick={handleOverviewCardClick}
                  onEditDescription={isLocal ? undefined : () => dialogs.openDialog("details")}
                  // Variant families are server-only, so a local deck gets no
                  // rail at all.
                  variantRailSlot={isLocal ? undefined : <DeckVariantRail deckId={deckId} />}
                />
              </div>
              {!isMobile && activeZone === null && (
                <SelectionDetailPane
                  items={deckItems}
                  printingsByCardId={printingsByCardId}
                  showImages={showImages}
                  onSearchAndClose={() => {
                    // Swallowed: no catalog grid on the overview for these
                    // clicks to drive.
                  }}
                />
              )}
            </div>
            <Footer />
          </div>
        </div>
        {/* Overview only: with a zone open, DeckCardBrowser mounts its own
            overlay, and a second one here would duplicate it. */}
        {activeZone === null && (
          <SelectionDetailOverlays
            items={deckItems}
            printingsByCardId={printingsByCardId}
            showImages={showImages}
            onSearchAndClose={() => {
              // See comment on the desktop pane above.
            }}
          />
        )}
        {isMobile && activeZone && <DeckMobileDock deckId={deckId} zone={activeZone} />}
      </DeckDndContext>
    </div>
  );
}
