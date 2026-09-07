import type { DeckZone } from "@openrift/shared";
import { formatHasSideboard, getOrientation, imageUrl, WellKnown } from "@openrift/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BoxIcon,
  CopyIcon,
  CornerLeftUpIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  FlaskConicalIcon,
  GitBranchIcon,
  GitCompareArrowsIcon,
  ImageIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  PrinterIcon,
  RefreshCwIcon,
  Share2Icon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { DeckCardBrowser } from "@/components/deck/deck-card-browser";
import { DeckCoverDialog } from "@/components/deck/deck-cover-dialog";
import { DeckDetailsDialog } from "@/components/deck/deck-details-dialog";
import { DeckDndContext } from "@/components/deck/deck-dnd-context";
import { DeckExportDialog } from "@/components/deck/deck-export-dialog";
import { DeckHomeCollectionDialog } from "@/components/deck/deck-home-collection-dialog";
import { DeckMissingCardsDialog } from "@/components/deck/deck-missing-cards-dialog";
import { DeckMobileDock } from "@/components/deck/deck-mobile-dock";
import { DeckPrintDialog } from "@/components/deck/deck-print-dialog";
import { DeckQuickAdd } from "@/components/deck/deck-quick-add";
import { DeckRenameDialog } from "@/components/deck/deck-rename-dialog";
import { DeckShareDialog } from "@/components/deck/deck-share-dialog";
import { DeckUndoControls, useDeckUndoShortcuts } from "@/components/deck/deck-undo-controls";
import { DeckVariantCreateDialog } from "@/components/deck/deck-variant-create-dialog";
import { DeckVariantRail } from "@/components/deck/deck-variant-rail";
import { DeckVariantsDialog } from "@/components/deck/deck-variants-dialog";
import { DeckZonePanel } from "@/components/deck/deck-zone-panel";
import { HoveredCardPreview } from "@/components/deck/hovered-card-preview";
import type { HoverOrigin } from "@/components/deck/hovered-card-preview";
import { LocalDeckBadge } from "@/components/deck/local-save-hint";
import { Footer } from "@/components/layout/footer";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarButton,
  PageTopBarHeightContext,
  PageTopBarIconButton,
  PageTopBarTitle,
  useMeasuredHeight,
  usePageTopBarHeight,
} from "@/components/layout/page-top-bar";
import {
  SectionHeader,
  SectionHeaderActions,
  SectionHeaderTitle,
} from "@/components/section-header";
import { SelectionDetailOverlays } from "@/components/selection-detail-overlays";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogForm } from "@/components/ui/dialog-form";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFilterActions } from "@/hooks/use-card-filters";
import { useIncomingTradeCounts } from "@/hooks/use-card-trades";
import { useCards } from "@/hooks/use-cards";
import { useRegisterQuickAdd } from "@/hooks/use-command-palette";
import { useDeckCards, useDeckViolations } from "@/hooks/use-deck-builder";
import { useDeckItems } from "@/hooks/use-deck-items";
import { useDeckOwnership } from "@/hooks/use-deck-ownership";
import {
  useDeckDetail,
  useDeleteDeck,
  useEncodeDeckCards,
  useExportDeck,
  useUpdateDeck,
  useUpdateDeckMeta,
} from "@/hooks/use-decks";
import { useDeckFormatList } from "@/hooks/use-enums";
import { useHeaderHeight } from "@/hooks/use-header-height";
import { useBorrowedCounts } from "@/hooks/use-loans";
import { useDeckBuildingCounts } from "@/hooks/use-owned-count";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { useScopeEffect } from "@/hooks/use-scope-effect";
import { useSession, useUserId } from "@/lib/auth-session";
import type { CardOpenTarget } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { toDeckBuilderCard } from "@/lib/deck-builder-card";
import {
  hydrateDeckDraft,
  useDeckDraftHydrated,
  useDeckSaveStatus,
} from "@/lib/deck-builder-collection";
import { toEncodeDeckCards } from "@/lib/deck-encode-input";
import { buildRunesByDomain } from "@/lib/deck-runes-by-domain";
import { requiredZoneProgress, ZONE_LABELS } from "@/lib/deck-zone-labels";
import { cn, PAGE_WIDTH } from "@/lib/utils";
import { useCommandPaletteStore } from "@/stores/command-palette-store";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";
import { useDisplayStore } from "@/stores/display-store";
import { isLocalDeckId, useLocalDecksStore } from "@/stores/local-decks-store";
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
  const navigate = useNavigate();
  const { data } = useDeckDetail(deckId);
  const { cardsById, allPrintings } = useCards();
  const { getPreferredPrinting, getPreferredFrontImage } = usePreferredPrinting();
  const hydrated = useDeckDraftHydrated(queryClient, scope, deckId);
  const deckCards = useDeckCards(deckId);
  const saveStatus = useDeckSaveStatus(queryClient, scope, deckId);
  const { isMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const activeZone = useDeckBuilderUiStore((state) => state.activeZone);
  const setActiveZone = useDeckBuilderUiStore((state) => state.setActiveZone);
  const setOverviewTab = useDeckBuilderUiStore((state) => state.setOverviewTab);
  const resetUi = useDeckBuilderUiStore((state) => state.reset);
  const setRunesByDomain = useDeckBuilderUiStore((state) => state.setRunesByDomain);
  const [renameOpen, setRenameOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [homeCollectionOpen, setHomeCollectionOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);
  // One create dialog for both variant modes; the mode outlives the close so
  // the dialog doesn't switch copy while it fades out.
  const [variantCreateOpen, setVariantCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { update: updateDeckMeta } = useUpdateDeckMeta(deckId);
  const updateDeck = useUpdateDeck();
  const deleteDeck = useDeleteDeck();
  const deleteLocalDeck = useLocalDecksStore((state) => state.deleteDeck);
  const exportDeck = useExportDeck();
  const encodeDeck = useEncodeDeckCards();
  const { formats } = useDeckFormatList();
  const otherFormats = formats.filter((entry) => entry.slug !== data.deck.format);
  const handleFormatChange = (slug: string) => {
    updateDeckMeta({ format: slug });
  };
  const handleDelete = () => {
    setDeleteOpen(false);
    // A local deck lives only in the store, so it never reaches the server
    // mutation. Both paths land back on the list.
    if (isLocal) {
      deleteLocalDeck(deckId);
      void navigate({ to: "/decks" });
      return;
    }
    // Guard against double-submission: a second confirm while the first delete
    // is still in flight would 404 on the server.
    if (deleteDeck.isPending) {
      return;
    }
    deleteDeck.mutate(deckId, {
      onSuccess: () => {
        void navigate({ to: "/decks" });
      },
      // Errors are reported by the global mutation error toast.
    });
  };
  const handlePlayOnRiftAtlas = () => {
    // Open the placeholder tab synchronously so it survives the popup blocker
    // while we fetch the piltover deck code; navigate it once the code arrives.
    const playTab = window.open("about:blank", "_blank");
    if (!playTab) {
      return;
    }
    playTab.opener = null;
    const onSuccess = ({ code }: { code: string }) => {
      playTab.location.href = `https://play.riftatlas.com/?deckCode=${encodeURIComponent(code)}`;
    };
    const onError = () => playTab.close();
    // A local deck has no server row to export by id — encode its cards via the
    // public endpoint instead.
    if (isLocal) {
      encodeDeck.mutate(
        { format: "piltover", cards: toEncodeDeckCards(deckCards) },
        { onSuccess, onError },
      );
      return;
    }
    exportDeck.mutate({ deckId, format: "piltover" }, { onSuccess, onError });
  };

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
  const marketplace = marketplaceOrder[0] ?? "cardtrader";
  const editorViolations = useDeckViolations(deckId, data.deck.format, data.deck.formatConfig);
  // Ctrl+Z / Ctrl+Shift+Z over the whole editor; mounted here (not in a
  // conditional subtree) so the shortcuts survive zone and tab switches.
  useDeckUndoShortcuts(deckId);

  // Ctrl/Cmd+K reaches the quick-add omnibar through the command palette,
  // which resolves the chord to whichever quick-add the route registered.
  const quickAddOpen = useCommandPaletteStore((state) => state.quickAddOpen);
  const setQuickAddOpen = useCommandPaletteStore((state) => state.setQuickAddOpen);
  const openQuickAdd = useCommandPaletteStore((state) => state.openQuickAdd);
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

    setSearch("");

    const legend = deckCards.find((card) => card.zone === WellKnown.deckZone.LEGEND);
    const legendDomains = legend?.domains ?? [];
    const domainsWithColorless =
      legendDomains.length > 0 ? [...legendDomains, WellKnown.domain.COLORLESS] : [];
    // Tag-locked formats re-apply their tag selection on every zone change,
    // resetting any chips the user un-toggled within the previous zone.
    const formatTagSlugs = Array.isArray(data.deck.formatConfig?.tagSlugs)
      ? data.deck.formatConfig.tagSlugs
      : [];
    // Custom-Region drops both domain-match rules, so any-color cards are
    // legal across every zone; skip the legend-domain prefilter.
    const isCustomRegion = data.deck.format === WellKnown.deckFormat.CUSTOM_REGION;
    const runesDomainFilter = isCustomRegion ? [] : legendDomains;
    const mainDomainFilter = isCustomRegion ? [] : domainsWithColorless;

    // Legends, runes, and battlefields have no energy / might / power, so a
    // carried-over range filter would hide every card in these zones.
    const clearStatRanges = () => {
      setRanges({ energy: null, might: null, power: null });
    };

    // Every token is colorless today, so excluding tokens keeps them from
    // leaking into the main/sideboard browser through the colorless bucket.
    const excludeTokens = [WellKnown.superType.TOKEN];

    switch (zone) {
      case WellKnown.deckZone.LEGEND: {
        setArrayFilters({
          types: [WellKnown.cardType.LEGEND],
          superTypes: [],
          superTypesEx: excludeTokens,
          domains: [],
          customTags: formatTagSlugs,
        });
        clearStatRanges();
        break;
      }
      case WellKnown.deckZone.CHAMPION: {
        setArrayFilters({
          types: [WellKnown.cardType.UNIT],
          superTypes: [WellKnown.superType.CHAMPION],
          superTypesEx: excludeTokens,
          domains: mainDomainFilter,
          customTags: formatTagSlugs,
        });
        if (legend?.tags[0]) {
          setSearch(`t:${legend.tags[0]}`);
        }
        break;
      }
      case WellKnown.deckZone.RUNES: {
        setArrayFilters({
          types: [WellKnown.cardType.RUNE],
          superTypes: [],
          superTypesEx: excludeTokens,
          domains: runesDomainFilter,
          customTags: formatTagSlugs,
        });
        clearStatRanges();
        break;
      }
      case WellKnown.deckZone.BATTLEFIELD: {
        setArrayFilters({
          types: [WellKnown.cardType.BATTLEFIELD],
          superTypes: [],
          superTypesEx: excludeTokens,
          domains: [],
          customTags: formatTagSlugs,
        });
        clearStatRanges();
        break;
      }
      case WellKnown.deckZone.MAIN:
      case WellKnown.deckZone.SIDEBOARD: {
        setArrayFilters({
          types: [WellKnown.cardType.UNIT, "spell", WellKnown.cardType.GEAR],
          superTypes: [],
          superTypesEx: excludeTokens,
          domains: mainDomainFilter,
          customTags: formatTagSlugs,
        });
        break;
      }
      case WellKnown.deckZone.OVERFLOW: {
        setArrayFilters({
          types: [
            WellKnown.cardType.UNIT,
            "spell",
            WellKnown.cardType.GEAR,
            WellKnown.cardType.BATTLEFIELD,
          ],
          superTypes: [],
          superTypesEx: excludeTokens,
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

  // While a zone browser fills the main area (the hero out of sight), the top
  // bar carries the completion figure shared with the hero and sidebar header.
  const inZoneView = activeZone !== null;
  const requiredCounts = requiredZoneProgress(deckCards, data.deck.format);

  if (!hydrated) {
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
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
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
              {/* In editing mode the hero scrolls out of reach, so the bar
                  carries the shared completion figure as a compact chip. */}
              {inZoneView && data.deck.format !== WellKnown.deckFormat.FREEFORM && (
                <span
                  className={cn(
                    "hidden shrink-0 text-xs tabular-nums md:inline",
                    editorViolations.length > 0
                      ? "text-destructive"
                      : requiredCounts.progress === requiredCounts.total
                        ? "text-success"
                        : "text-muted-foreground",
                  )}
                >
                  {requiredCounts.progress}/{requiredCounts.total}
                </span>
              )}
              {isLocal && <LocalDeckBadge className="hidden shrink-0 sm:inline-flex" />}
            </div>
            <PageTopBarActions>
              {/* No tooltip on the phone icon: no hover to open one and no
                    Ctrl+K to advertise. */}
              <PageTopBarIconButton
                className="md:hidden"
                aria-label="Add a card"
                onClick={() => openQuickAdd("add")}
              >
                <PlusIcon className="size-4" />
              </PageTopBarIconButton>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <PageTopBarButton
                      className="hidden md:inline-flex"
                      aria-keyshortcuts="Control+K"
                      onClick={() => openQuickAdd("add")}
                    />
                  }
                >
                  <PlusIcon className="size-4" />
                  Add card
                </TooltipTrigger>
                <TooltipContent>Add a card (Ctrl+K)</TooltipContent>
              </Tooltip>
              <DeckUndoControls deckId={deckId} />
              <div className="hidden md:flex md:items-center md:gap-1">
                <PageTopBarButton onClick={() => setShareOpen(true)}>
                  <Share2Icon className="size-4" />
                  Share
                </PageTopBarButton>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger render={<PageTopBarIconButton />}>
                  <EllipsisVerticalIcon className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {/* Share has its own button in the bar from md up, so the
                        entry here is the phone's only way to it. */}
                  <div className="md:hidden">
                    <DropdownMenuItem onClick={() => setShareOpen(true)}>
                      <Share2Icon className="size-4" />
                      Share…
                    </DropdownMenuItem>
                  </div>
                  <DropdownMenuItem onClick={() => setExportOpen(true)}>
                    <DownloadIcon className="size-4" />
                    Export…
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPrintOpen(true)}>
                    <PrinterIcon className="size-4" />
                    Print…
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
                  <DropdownMenuSeparator />
                  {/* Descriptions are a signed-in feature, so a local deck
                        gets the name on its own. */}
                  <DropdownMenuItem
                    onClick={() => (isLocal ? setRenameOpen(true) : setDetailsOpen(true))}
                  >
                    <PencilIcon className="size-4" />
                    {isLocal ? "Rename" : "Name & description"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCoverOpen(true)}>
                    <ImageIcon className="size-4" />
                    Change cover art
                  </DropdownMenuItem>
                  {/* A home collection points at a server collection, which
                        a browser-local deck can't reference. */}
                  {!isLocal && (
                    <DropdownMenuItem onClick={() => setHomeCollectionOpen(true)}>
                      <BoxIcon className="size-4" />
                      Stored in…
                    </DropdownMenuItem>
                  )}
                  {/* Opens the comparison page with this deck pinned as the
                        left side and the other still to pick. */}
                  <DropdownMenuItem
                    render={<Link to="/decks/compare" search={{ from: deckId, to: undefined }} />}
                  >
                    <GitCompareArrowsIcon className="size-4" />
                    Compare with another deck…
                  </DropdownMenuItem>
                  {/* Variants are server decks in a family, which a
                        browser-local deck can't join until it's claimed. */}
                  {!isLocal && (
                    <DropdownMenuItem onClick={() => setVariantCreateOpen(true)}>
                      <CopyIcon className="size-4" />
                      New variant…
                    </DropdownMenuItem>
                  )}
                  {/* Always available for a server deck: the dialog is also
                        where a standalone deck gets linked to its first sibling. */}
                  {!isLocal && (
                    <DropdownMenuItem onClick={() => setVariantsOpen(true)}>
                      <GitBranchIcon className="size-4" />
                      Variants…
                    </DropdownMenuItem>
                  )}
                  {!isLocal && (
                    <DropdownMenuItem
                      onClick={() => updateDeck.mutate({ deckId, isDraft: !data.deck.isDraft })}
                    >
                      <FlaskConicalIcon className="size-4" />
                      {data.deck.isDraft ? "Remove draft mark" : "Mark as draft"}
                    </DropdownMenuItem>
                  )}
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
                  <DropdownMenuItem onClick={handlePlayOnRiftAtlas}>
                    <PlayIcon className="size-4" />
                    Play on RiftAtlas
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {/* A variant is a deck of its own, so this is also how a
                        single version of a family is deleted. */}
                  <DropdownMenuItem
                    onClick={() => setDeleteOpen(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2Icon className="size-4" />
                    Delete deck
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </PageTopBarActions>
          </PageTopBar>,
          topBarSlot,
        )}
      {isLocal && (
        <DeckRenameDialog
          deckId={deckId}
          currentName={data.deck.name}
          open={renameOpen}
          onOpenChange={setRenameOpen}
        />
      )}
      {!isLocal && (
        <DeckDetailsDialog
          deckId={deckId}
          currentName={data.deck.name}
          currentDescription={data.deck.description ?? null}
          currentLinks={data.deck.links}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
        />
      )}
      {!isLocal && (
        <DeckHomeCollectionDialog
          deckId={deckId}
          currentCollectionId={data.deck.collectionId}
          open={homeCollectionOpen}
          onOpenChange={setHomeCollectionOpen}
        />
      )}
      {!isLocal && (
        <DeckVariantCreateDialog
          deckId={deckId}
          deckName={data.deck.name}
          open={variantCreateOpen}
          onOpenChange={setVariantCreateOpen}
        />
      )}
      {!isLocal && (
        <DeckVariantsDialog
          deckId={deckId}
          deckName={data.deck.name}
          open={variantsOpen}
          onOpenChange={setVariantsOpen}
        />
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <DialogForm onSubmit={handleDelete}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete deck</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &ldquo;{data.deck.name}&rdquo;?{" "}
                {isLocal
                  ? "It only exists on this device, so this cannot be undone."
                  : "This cannot be undone."}
                {data.deck.familyId !== null && " The other versions of it stay."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction type="submit" disabled={deleteDeck.isPending}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </DialogForm>
        </AlertDialogContent>
      </AlertDialog>
      <DeckShareDialog
        deckId={deckId}
        deckName={data.deck.name}
        isPublic={data.deck.isPublic}
        shareToken={data.deck.shareToken}
        isDirty={saveStatus.isDirty}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
      <DeckExportDialog
        deckId={deckId}
        isDirty={saveStatus.isDirty}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
      <DeckPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
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
          deckName={data.deck.name}
        />
      )}
      <DeckQuickAdd
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        deckId={deckId}
        format={data.deck.format}
        cards={deckCards}
      />
      <DeckCoverDialog
        open={coverOpen}
        onOpenChange={setCoverOpen}
        deckId={deckId}
        cards={deckCards}
        coverCardId={data.deck.coverCardId}
        coverPrintingId={data.deck.coverPrintingId}
        coverPosition={data.deck.coverPosition}
        getThumbnail={(cardId, preferredPrintingId) => {
          const id = getPreferredFrontImage(cardId, preferredPrintingId)?.imageId;
          return id ? imageUrl(id, "400w") : undefined;
        }}
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
                  onViewMissing={() => setMissingOpen(true)}
                  onHoverCard={setHoveredMain}
                  onOverviewCardClick={handleOverviewCardClick}
                  onEditDescription={isLocal ? undefined : () => setDetailsOpen(true)}
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
