import type { Printing } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { PackageIcon, PackagePlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useDeferredValue, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { BrowserCardViewer } from "@/components/browser-card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { CardThumbnail, useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { OwnedCountStrip } from "@/components/cards/owned-count-strip";
import { CollectionAddStrip } from "@/components/collection/collection-add-strip";
import { DisposePickerPopover } from "@/components/collection/dispose-picker-popover";
import { QuickAddPalette } from "@/components/collection/quick-add-palette";
import { VariantAddPopover } from "@/components/collection/variant-add-popover";
import { ActiveFilters } from "@/components/filters/active-filters";
import {
  CollapsibleFilterPanel,
  FilterToggleButton,
} from "@/components/filters/collapsible-filter-panel";
import { FilterPanelContent } from "@/components/filters/filter-panel-content";
import {
  DesktopOptionsBar,
  MobileFilterContent,
  MobileOptionsContent,
  MobileOptionsDrawer,
} from "@/components/filters/options-bar";
import { SearchBar } from "@/components/filters/search-bar";
import { Pane } from "@/components/layout/panes";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { Button } from "@/components/ui/button";
import { useCardData } from "@/hooks/use-card-data";
import { useCardDeepLink } from "@/hooks/use-card-deep-link";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { collectionsQueryOptions } from "@/hooks/use-collections";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useQuickAddActions } from "@/hooks/use-quick-add-actions";
import { useSeedLanguagesFromPrefs } from "@/hooks/use-seed-languages-from-prefs";
import { useSession } from "@/lib/auth-session";
import { useAddModeStore } from "@/stores/add-mode-store";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

// Logged-out users have no collection counts, so the Owned chip would always
// read 0 — hide it instead of leaving a dead filter in the panel.
const OWNED_HIDDEN: ReadonlySet<string> = new Set(["owned"]);

/**
 * Standalone catalog browser for the /cards route.
 * Provides filters, search, and a card detail pane — no collection or add-mode features.
 * @returns The catalog browser view.
 */
export function CardBrowser() {
  const isMobile = useIsMobile();
  const showImages = useDisplayStore((s) => s.showImages);
  const catalogMode = useDisplayStore((s) => s.catalogMode);
  const cycleCatalogMode = useDisplayStore((s) => s.cycleCatalogMode);
  const { allPrintings, printingsById, sets } = useCards();
  // Lifted out of <CardThumbnail> — see useCardThumbnailDisplay for the why.
  // We reuse display.prices / display.favoriteMarketplace below for useCardData.
  const display = useCardThumbnailDisplay();
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const { data: ownedCountByPrinting } = useOwnedCount(isLoggedIn);
  const { data: collections } = useQuery({
    ...collectionsQueryOptions,
    enabled: isLoggedIn,
  });
  const inboxId = collections?.find((col) => col.isInbox)?.id;
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const isAddMode = isLoggedIn && catalogMode === "add" && Boolean(inboxId);
  const {
    handleQuickAdd,
    handleUndoAdd,
    handleOpenVariants,
    handleDisposeFromCollection,
    closeVariants,
    adjustedCount,
  } = useQuickAddActions(isAddMode ? inboxId : undefined);

  const variantPopover = useAddModeStore((s) => s.variantPopover);
  const disposePicker = useAddModeStore((s) => s.disposePicker);
  const closeDisposePicker = useAddModeStore((s) => s.closeDisposePicker);
  const variantPopoverRef = useRef<HTMLDivElement>(null);
  const disposePickerRef = useRef<HTMLDivElement>(null);

  const [topPrintingOverrides, setTopPrintingOverrides] = useState<Map<string, string>>(new Map());

  // Close variant popover on click outside
  useEffect(() => {
    if (!variantPopover) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (variantPopoverRef.current && !variantPopoverRef.current.contains(event.target as Node)) {
        closeVariants();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [variantPopover, closeVariants]);

  useEffect(() => {
    if (!disposePicker) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (disposePickerRef.current && !disposePickerRef.current.contains(event.target as Node)) {
        closeDisposePicker();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [disposePicker, closeDisposePicker]);

  const {
    filters,
    sortBy,
    sortDir,
    view: rawView,
    groupBy,
    groupDir,
    hasActiveFilters,
  } = useFilterValues();
  const { setSearch } = useFilterActions();

  // "copies" is a collection-only view — clamp to "printings" in the catalog browser
  const view = rawView === "copies" ? "printings" : rawView;
  const keywordReverseMap = useKeywordReverseMap();

  // On first mount, seed the URL from user prefs if no languages are set.
  // After seeding, `filters.languages` is the single source of truth — empty
  // means "show all" (the user cleared every language within this session).
  useSeedLanguagesFromPrefs(filters.languages);

  const {
    availableFilters,
    availableLanguages,
    filterCounts,
    sortedCards,
    printingsByCardId,
    priceRangeByCardId,
    totalUniqueCards,
    setDisplayLabel,
  } = useCardData({
    allPrintings,
    sets,
    filters,
    ownedFilter: filters.ownedFilter,
    sortBy,
    sortDir,
    view,
    groupBy,
    ownedCountByPrinting,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    keywordReverseMap,
  });

  const hiddenFilterSections = isLoggedIn ? undefined : OWNED_HIDDEN;

  const deferredSortedCards = useDeferredValue(sortedCards);
  const isGridStale = deferredSortedCards !== sortedCards;

  const items: CardViewerItem[] = deferredSortedCards.map((printing) => ({
    id: printing.id,
    printing,
  }));

  // Cards+set renders one tile per (card, set), so multiple cells share a
  // cardId and click selection has to navigate by printing — otherwise
  // clicking the SFD reprint would jump back to the OGN tile that shares its
  // cardId. The variant chevron, override mechanism, and per-tile owned count
  // still treat the cell as a card; siblings are filtered to same-set so the
  // chevron only offers in-set variants and the override-by-cardId fallback
  // works correctly across the duplicated cells.
  const inCardsView = view === "cards";
  const scopeVariantsToSet = inCardsView && groupBy === "set";
  const findBy: "card" | "printing" = inCardsView && groupBy !== "set" ? "card" : "printing";

  // Tag the variant popover with the cell's setId in cards+set mode so the
  // popover can filter to in-set variants only.
  const handleOpenVariantsScoped = handleOpenVariants
    ? (printing: Printing, anchorEl: HTMLElement) =>
        handleOpenVariants(printing, anchorEl, scopeVariantsToSet)
    : undefined;

  // Deep-link: open a specific printing when navigating from e.g. activity page
  const { printingId: linkedPrintingId } = useSearch({ from: "/_app/cards" });
  useCardDeepLink({ linkedPrintingId, printingsById, items });

  // Cmd+K / Ctrl+K shortcut to open quick-add palette
  useEffect(() => {
    if (!inboxId) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setQuickAddOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [inboxId]);

  const handleGridCardClick = (printing: Printing) => {
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  const handleSiblingClick = (printing: Printing) => {
    handleGridCardClick(printing);
    setTopPrintingOverrides((prev) => new Map(prev).set(printing.cardId, printing.id));
  };

  const searchAndClose = (query: string) => {
    setSearch(query);
    if (isMobile) {
      useSelectionStore.getState().closeDetail();
    }
  };

  const showStrip = isLoggedIn && catalogMode !== "off";

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const cardId = item.printing.cardId;
    const allCardSiblings = printingsByCardId.get(cardId);
    // Filter to in-set siblings when grouping by set so the variant chevron
    // and the override-by-cardId fallback don't cross set boundaries.
    const siblings =
      inCardsView && groupBy === "set"
        ? allCardSiblings?.filter((sibling) => sibling.setId === item.printing.setId)
        : allCardSiblings;

    const overrideId = inCardsView ? topPrintingOverrides.get(cardId) : undefined;
    const displayPrinting =
      overrideId && siblings
        ? (siblings.find((sibling) => sibling.id === overrideId) ?? item.printing)
        : item.printing;

    let aboveCard: ReactNode | undefined;
    const ownedCount = showStrip
      ? inCardsView
        ? (siblings?.reduce(
            (sum, p) => sum + adjustedCount(p.id, ownedCountByPrinting?.[p.id] ?? 0),
            0,
          ) ?? 0)
        : adjustedCount(displayPrinting.id, ownedCountByPrinting?.[displayPrinting.id] ?? 0)
      : undefined;

    if (ownedCount !== undefined) {
      aboveCard = handleQuickAdd ? (
        <CollectionAddStrip
          printing={displayPrinting}
          ownedCount={ownedCount}
          hasVariants={inCardsView && (siblings?.length ?? 0) > 1}
          onQuickAdd={handleQuickAdd}
          onUndoAdd={handleUndoAdd}
          onOpenVariants={handleOpenVariantsScoped}
        />
      ) : (
        <OwnedCountStrip
          count={ownedCount}
          printingId={displayPrinting.id}
          cardName={displayPrinting.card.name}
          shortCode={displayPrinting.shortCode}
          siblings={inCardsView ? siblings : undefined}
        />
      );
    }

    return (
      <CardThumbnail
        printing={displayPrinting}
        onClick={handleGridCardClick}
        onSiblingClick={handleSiblingClick}
        showImages={showImages}
        isSelected={ctx.isSelected}
        isFlashing={ctx.isFlashing}
        dimmed={ownedCount === 0}
        siblings={inCardsView ? siblings : undefined}
        priceRange={priceRangeByCardId?.get(cardId)}
        view={view}
        cardWidth={ctx.cardWidth}
        priority={ctx.priority}
        display={display}
        aboveCard={aboveCard}
      />
    );
  };

  const toolbar = (
    <>
      <div className="mb-1.5 flex items-start gap-3 sm:mb-3">
        <SearchBar totalCards={totalUniqueCards} filteredCount={sortedCards.length} />
        <DesktopOptionsBar className="hidden sm:flex" />
        {isLoggedIn && (
          <Button
            variant={catalogMode === "off" ? "outline" : "default"}
            size="icon"
            onClick={cycleCatalogMode}
            title={
              catalogMode === "off"
                ? "Show owned count"
                : catalogMode === "count"
                  ? "Switch to add mode"
                  : "Turn off"
            }
          >
            {catalogMode === "add" ? (
              <PackagePlusIcon className="size-4" />
            ) : (
              <PackageIcon className="size-4" />
            )}
          </Button>
        )}
        <FilterToggleButton className="@wide:hidden hidden sm:flex" />
        <MobileOptionsDrawer
          doneLabel={
            hasActiveFilters
              ? `Show ${sortedCards.length} ${view === "cards" ? "cards" : "printings"}`
              : undefined
          }
          className="sm:hidden"
        >
          <MobileOptionsContent />
          <MobileFilterContent
            availableFilters={availableFilters}
            availableLanguages={availableLanguages}
            setDisplayLabel={setDisplayLabel}
            filterCounts={filterCounts}
            hiddenSections={hiddenFilterSections}
          />
        </MobileOptionsDrawer>
      </div>
      <CollapsibleFilterPanel
        availableFilters={availableFilters}
        availableLanguages={availableLanguages}
        setDisplayLabel={setDisplayLabel}
        filterCounts={filterCounts}
        hiddenSections={hiddenFilterSections}
      />
    </>
  );

  const leftPane = (
    <Pane className="@wide:block px-3">
      <h2 className="pb-4 text-lg font-semibold">Filters</h2>
      <div className="space-y-4 pb-4">
        <FilterPanelContent
          availableFilters={availableFilters}
          availableLanguages={availableLanguages}
          setDisplayLabel={setDisplayLabel}
          filterCounts={filterCounts}
          hiddenSections={hiddenFilterSections}
        />
      </div>
    </Pane>
  );

  const rightPane = isMobile ? undefined : (
    <SelectionDetailPane
      items={items}
      printingsByCardId={printingsByCardId}
      showImages={showImages}
      onSearchAndClose={searchAndClose}
    />
  );

  return (
    <BrowserCardViewer
      items={items}
      totalItems={allPrintings.length}
      renderCard={renderCard}
      setOrder={sets}
      groupBy={groupBy}
      groupDir={groupDir}
      deferredSortedCards={deferredSortedCards}
      printingsByCardId={printingsByCardId}
      view={view}
      onItemClick={handleGridCardClick}
      stale={isGridStale}
      toolbar={toolbar}
      leftPane={leftPane}
      aboveGrid={
        <ActiveFilters availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />
      }
      rightPane={rightPane}
      addStripHeight={showStrip ? ADD_STRIP_HEIGHT : undefined}
    >
      {isMobile && (
        <SelectionMobileOverlay
          items={items}
          printingsByCardId={printingsByCardId}
          showImages={showImages}
          onSearchAndClose={searchAndClose}
        />
      )}
      {inboxId && (
        <QuickAddPalette
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          collectionId={inboxId}
          collectionName="Inbox"
          printingsByCardId={printingsByCardId}
          ownedCountByPrinting={ownedCountByPrinting}
        />
      )}
      {variantPopover &&
        handleQuickAdd &&
        handleUndoAdd &&
        (() => {
          const allCardPrintings = printingsByCardId.get(variantPopover.cardId);
          const variantPrintings = variantPopover.setId
            ? allCardPrintings?.filter((p) => p.setId === variantPopover.setId)
            : allCardPrintings;
          if (!variantPrintings) {
            return null;
          }
          return createPortal(
            <div
              ref={variantPopoverRef}
              className="fixed z-[100]"
              style={{ top: variantPopover.pos.top, left: variantPopover.pos.left }}
            >
              <VariantAddPopover
                printings={variantPrintings}
                ownedCounts={Object.fromEntries(
                  variantPrintings.map((p) => [
                    p.id,
                    adjustedCount(p.id, ownedCountByPrinting?.[p.id] ?? 0),
                  ]),
                )}
                onQuickAdd={handleQuickAdd}
                onUndoAdd={handleUndoAdd}
              />
            </div>,
            document.body,
          );
        })()}
      {disposePicker &&
        createPortal(
          <div
            ref={disposePickerRef}
            className="fixed z-[100]"
            style={{ top: disposePicker.pos.top, left: disposePicker.pos.left }}
          >
            <DisposePickerPopover
              printing={disposePicker.printing}
              onPick={handleDisposeFromCollection}
            />
          </div>,
          document.body,
        )}
    </BrowserCardViewer>
  );
}
