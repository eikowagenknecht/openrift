import type { DeckZone } from "@openrift/shared";
import { imageUrl, WellKnown } from "@openrift/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  CornerLeftUpIcon,
  EllipsisVerticalIcon,
  FileTextIcon,
  LinkIcon,
  PencilIcon,
  PrinterIcon,
  RefreshCwIcon,
  Share2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { use, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { buildRunesByDomain, DeckCardBrowser } from "@/components/deck/deck-card-browser";
import { DeckDescriptionDialog } from "@/components/deck/deck-description-dialog";
import { DeckDndContext } from "@/components/deck/deck-dnd-context";
import { DeckExportDialog } from "@/components/deck/deck-export-dialog";
import { DeckMissingCardsDialog } from "@/components/deck/deck-missing-cards-dialog";
import { DeckRenameDialog } from "@/components/deck/deck-rename-dialog";
import { DeckShareDialog } from "@/components/deck/deck-share-dialog";
import { DeckFormatBadge } from "@/components/deck/deck-validation-banner";
import { DeckZonePanel } from "@/components/deck/deck-zone-panel";
import { HoveredCardPreview } from "@/components/deck/hovered-card-preview";
import type { HoverOrigin } from "@/components/deck/hovered-card-preview";
import { ProxyExportDialog } from "@/components/deck/proxy-export-dialog";
import { Footer } from "@/components/layout/footer";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarHeightContext,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NestedSidebar,
  SidebarContent,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { useFilterActions } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useDeckCards } from "@/hooks/use-deck-builder";
import { useDeckItems } from "@/hooks/use-deck-items";
import { useDeckOwnership } from "@/hooks/use-deck-ownership";
import { useDeckDetail, useUpdateDeck } from "@/hooks/use-decks";
import { useDeckFormatList } from "@/hooks/use-enums";
import { useDeckBuildingCounts } from "@/hooks/use-owned-count";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { useRequiredUserId, useSession } from "@/lib/auth-session";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { toDeckBuilderCard } from "@/lib/deck-builder-card";
import { hydrateDeckDraft, useDeckSaveStatus } from "@/lib/deck-builder-collection";
import { ZONE_LABELS } from "@/lib/deck-zone-labels";
import { getHeaderHeight } from "@/lib/header-height";
import { cn, CONTAINER_WIDTH } from "@/lib/utils";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

interface DeckEditorPageProps {
  deckId: string;
}

function MobileSidebarHeader() {
  const { setOpenMobile } = useSidebar();

  return (
    <div className="flex items-center justify-between p-4 md:hidden">
      <h2 className="text-base font-medium">Deck Zones</h2>
      <Button variant="ghost" size="icon-sm" onClick={() => setOpenMobile(false)}>
        <XIcon />
        <span className="sr-only">Close</span>
      </Button>
    </div>
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
  const userId = useRequiredUserId();
  const navigate = useNavigate();
  const { data } = useDeckDetail(deckId);
  const { cardsById, allPrintings } = useCards();
  const { getPreferredPrinting } = usePreferredPrinting();
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const deckCards = useDeckCards(deckId);
  const saveStatus = useDeckSaveStatus(queryClient, userId, deckId);
  const { isMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const activeZone = useDeckBuilderUiStore((state) => state.activeZone);
  const setActiveZone = useDeckBuilderUiStore((state) => state.setActiveZone);
  const resetUi = useDeckBuilderUiStore((state) => state.reset);
  const setRunesByDomain = useDeckBuilderUiStore((state) => state.setRunesByDomain);
  const [renameOpen, setRenameOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const updateDeck = useUpdateDeck();
  const { formats } = useDeckFormatList();
  const otherFormats = formats.filter((entry) => entry.slug !== data.deck.format);
  const handleFormatChange = (slug: string) => {
    updateDeck.mutate({ deckId, format: slug });
  };

  // Ownership data — split available vs locked so the deck builder respects
  // each collection's availableForDeckbuilding flag.
  const { data: session } = useSession();
  const { data: deckCounts } = useDeckBuildingCounts(Boolean(session?.user));
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const marketplace = marketplaceOrder[0] ?? "cardtrader";
  const ownershipData = useDeckOwnership(
    deckCards,
    allPrintings,
    deckCounts?.available,
    marketplace,
    deckCounts?.locked,
  );

  // Build the runes-by-domain catalog up here (always-mounted parent) so the
  // rebalance fallback can swap in an opposite-domain rune even on a fresh
  // page load before the user has activated any zone.
  useEffect(() => {
    if (allPrintings.length === 0) {
      return;
    }
    setRunesByDomain(buildRunesByDomain(allPrintings));
  }, [allPrintings, setRunesByDomain]);

  // Seed the draft from the server's deck detail when the deck id changes or
  // when a fresh load arrives. The collection's save handler is auto-wired —
  // any user edit after this debounces a PUT back to the server.
  useEffect(() => {
    if (data && hydratedId !== deckId) {
      const builderCards = data.cards
        .map((card) => toDeckBuilderCard(card, cardsById))
        .filter((card): card is DeckBuilderCard => card !== null);
      hydrateDeckDraft(queryClient, userId, deckId, builderCards);
      setHydratedId(deckId);
    }
  }, [data, deckId, hydratedId, queryClient, userId, cardsById]);

  // On unmount, reset UI scalars (active zone, runes catalog) so the next
  // deck load starts clean. The draft collection itself is intentionally
  // left alone: it stays cached per user so re-entering the same deck after
  // a brief navigation away skips re-hydration. On a user change the cache
  // is evicted and `cleanupWhenIdle` tears it down reactively. Any
  // debounced / in-flight save also keeps running so edits made right
  // before navigating away still persist.
  useEffect(
    () => () => {
      resetUi();
    },
    [resetUi],
  );

  // Warn on navigation with unsaved changes. The handler re-registers only
  // on the two transitions it actually reads — not on every card edit — so
  // the cost is a couple of listener swaps per save cycle.
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

  const { setArrayFilters, setSearch } = useFilterActions();

  const { items: deckItems, printingsByCardId } = useDeckItems(deckCards);
  const showImages = useDisplayStore((state) => state.showImages);
  const detailOpen = useSelectionStore((state) => state.detailOpen);
  const topBarHeight = use(PageTopBarHeightContext);

  // Switching between overview and zone mode swaps the items array under the
  // detail pane (deck items vs catalog items), so clear the selection at the
  // boundary to avoid an orphaned selectedIndex.
  useEffect(() => {
    useSelectionStore.getState().closeDetail();
  }, [activeZone]);

  const handleOverviewCardClick = (card: DeckBuilderCard) => {
    const printing = getPreferredPrinting(card.cardId, card.preferredPrintingId);
    if (!printing) {
      return;
    }
    // Pass the zone so a card appearing in multiple zones anchors at the
    // instance the user clicked, not at the first zone-occurrence.
    useSelectionStore.getState().selectCard(printing, deckItems, "card", card.zone);
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

    // Clear search from a previous zone (e.g. champion tag search),
    // then apply the new preset.
    setSearch("");

    const legend = deckCards.find((card) => card.zone === "legend");
    const legendDomains = legend?.domains ?? [];
    const domainsWithColorless =
      legendDomains.length > 0 ? [...legendDomains, WellKnown.domain.COLORLESS] : [];
    // Tag-locked formats (custom-region today, future custom-* formats too)
    // re-apply their tag selection on every zone change. Same pattern as
    // `domains` above — the format constraint follows the user across zones
    // so the browser stays narrowed to legal cards by default. Users can
    // still un-toggle chips within a zone to peek at out-of-format cards;
    // the next zone switch resets to the format's tag set.
    const formatTagSlugs = Array.isArray(data.deck.formatConfig?.tagSlugs)
      ? data.deck.formatConfig.tagSlugs
      : [];
    // Custom-Region drops both domain-match rules (runes and main-deck),
    // so any-color cards are legal across every zone. Skip the legend-domain
    // prefilter on each zone preset to avoid hiding cards the format
    // actually accepts.
    const isCustomRegion = data.deck.format === WellKnown.deckFormat.CUSTOM_REGION;
    const runesDomainFilter = isCustomRegion ? [] : legendDomains;
    const mainDomainFilter = isCustomRegion ? [] : domainsWithColorless;

    switch (zone) {
      case "legend": {
        setArrayFilters({
          types: [WellKnown.cardType.LEGEND],
          superTypes: [],
          domains: [],
          customTags: formatTagSlugs,
        });
        break;
      }
      case "champion": {
        setArrayFilters({
          types: [WellKnown.cardType.UNIT],
          superTypes: [WellKnown.superType.CHAMPION],
          domains: mainDomainFilter,
          customTags: formatTagSlugs,
        });
        if (legend?.tags[0]) {
          setSearch(`t:${legend.tags[0]}`);
        }
        break;
      }
      case "runes": {
        setArrayFilters({
          types: [WellKnown.cardType.RUNE],
          superTypes: [],
          domains: runesDomainFilter,
          customTags: formatTagSlugs,
        });
        break;
      }
      case "battlefield": {
        setArrayFilters({
          types: [WellKnown.cardType.BATTLEFIELD],
          superTypes: [],
          domains: [],
          customTags: formatTagSlugs,
        });
        break;
      }
      case "main":
      case "sideboard": {
        setArrayFilters({
          types: [WellKnown.cardType.UNIT, "spell", "gear"],
          superTypes: [],
          domains: mainDomainFilter,
          customTags: formatTagSlugs,
        });
        break;
      }
      case "overflow": {
        setArrayFilters({
          types: [WellKnown.cardType.UNIT, "spell", "gear", WellKnown.cardType.BATTLEFIELD],
          superTypes: [],
          domains: mainDomainFilter,
          customTags: formatTagSlugs,
        });
        break;
      }
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
  const setHoveredMain = (id: string | null, preferredPrintingId?: string | null) =>
    setHovered(
      id ? { id, origin: "main", preferredPrintingId: preferredPrintingId ?? null } : null,
    );

  // While the detail pane is open, the floating hover preview from the main
  // (overview) thumbnails would compete with the pane. Suppress it. Sidebar
  // hover stays — it's the primary way to peek at a card without committing.
  const suppressHoverPreview = detailOpen && hovered?.origin === "main";
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
          landscape: hoveredPrinting.card.type === "battlefield",
        }
      : null;

  const zoneCount = deckCards
    .filter((card) => card.zone === activeZone)
    .reduce((sum, card) => sum + card.quantity, 0);
  const totalCards = deckCards.reduce((sum, card) => sum + card.quantity, 0);

  if (hydratedId !== deckId) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {topBarSlot &&
        createPortal(
          <PageTopBar>
            <div className="hidden md:block">
              <PageTopBarBack to="/decks" />
            </div>
            <PageTopBarTitle onToggleSidebar={toggleSidebar}>
              <span className="md:hidden">
                {activeZone ? (
                  <>
                    {ZONE_LABELS[activeZone]}
                    <span className="text-muted-foreground ml-1">({zoneCount})</span>
                  </>
                ) : (
                  "Zones"
                )}
              </span>
              <span className="hidden md:inline">{data.deck.name}</span>
            </PageTopBarTitle>
            <DeckFormatBadge deckId={deckId} />
            <PageTopBarActions>
              <div className="hidden md:flex md:items-center md:gap-1">
                <DeckExportDialog
                  deckId={deckId}
                  deckName={data.deck.name}
                  isDirty={saveStatus.isDirty}
                />
                <ProxyExportDialog deckId={deckId} deckName={data.deck.name} />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                  <EllipsisVerticalIcon className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setRenameOpen(true)}>
                    <PencilIcon className="size-4" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDescriptionOpen(true)}>
                    <FileTextIcon className="size-4" />
                    Edit description
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      void navigate({
                        to: "/decks/import",
                        search: { replaceDeckId: deckId },
                      })
                    }
                  >
                    <UploadIcon className="size-4" />
                    Import &amp; replace cards…
                  </DropdownMenuItem>
                  {otherFormats.length > 0 && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <RefreshCwIcon className="size-4" />
                        Change format
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {otherFormats.map((entry) => (
                          <DropdownMenuItem
                            key={entry.slug}
                            onClick={() => handleFormatChange(entry.slug)}
                          >
                            {entry.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}
                  <DropdownMenuItem onClick={() => setShareOpen(true)}>
                    <LinkIcon className="size-4" />
                    Share deck
                  </DropdownMenuItem>
                  <div className="md:hidden">
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setExportOpen(true)}>
                      <Share2Icon className="size-4" />
                      Export
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setProxyOpen(true)}>
                      <PrinterIcon className="size-4" />
                      Proxies
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </PageTopBarActions>
          </PageTopBar>,
          topBarSlot,
        )}
      <DeckRenameDialog
        deckId={deckId}
        currentName={data.deck.name}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />
      <DeckDescriptionDialog
        deckId={deckId}
        currentDescription={data.deck.description ?? null}
        open={descriptionOpen}
        onOpenChange={setDescriptionOpen}
      />
      <DeckShareDialog
        deckId={deckId}
        isPublic={data.deck.isPublic}
        shareToken={data.deck.shareToken}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
      <DeckExportDialog
        deckId={deckId}
        deckName={data.deck.name}
        isDirty={saveStatus.isDirty}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
      <ProxyExportDialog
        open={proxyOpen}
        onOpenChange={setProxyOpen}
        deckId={deckId}
        deckName={data.deck.name}
      />
      {ownershipData && (
        <DeckMissingCardsDialog
          open={missingOpen}
          onOpenChange={setMissingOpen}
          missingCards={ownershipData.missingCards}
          totalMissingValue={ownershipData.missingValueCents}
          marketplace={marketplace}
        />
      )}
      <DeckDndContext deckId={deckId}>
        <div ref={containerRef} className={cn(CONTAINER_WIDTH, "relative flex gap-4 px-3")}>
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
                  onOverviewClick={() => setActiveZone(null)}
                  onHoverCard={setHoveredSidebar}
                  ownershipData={ownershipData}
                  marketplace={marketplace}
                  onViewMissing={() => setMissingOpen(true)}
                  hideStatsAndOwnership={activeZone === null}
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
                  "--sticky-top": `${getHeaderHeight() + topBarHeight}px`,
                } as React.CSSProperties
              }
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <DeckCardBrowser
                  deckId={deckId}
                  ownershipData={ownershipData}
                  marketplace={marketplace}
                  onZoneClick={handleZoneClick}
                  onViewMissing={() => setMissingOpen(true)}
                  onHoverCard={setHoveredMain}
                  onOverviewCardClick={handleOverviewCardClick}
                />
              </div>
              {!isMobile && activeZone === null && (
                <SelectionDetailPane
                  items={deckItems}
                  printingsByCardId={printingsByCardId}
                  showImages={showImages}
                  onSearchAndClose={() => {
                    // Tag/keyword chips have no filter context on the deck
                    // overview — there is no catalog grid to drive. Closing
                    // the pane on click would be jarring with no visible
                    // result, so swallow these clicks for now.
                  }}
                />
              )}
            </div>
            <Footer />
          </div>
        </div>
        {isMobile && (
          <SelectionMobileOverlay
            items={deckItems}
            printingsByCardId={printingsByCardId}
            showImages={showImages}
            onSearchAndClose={() => {
              // See comment on the desktop pane above.
            }}
          />
        )}
      </DeckDndContext>
    </div>
  );
}
