import type { Printing, SortDirection, SortOption } from "@openrift/shared";
import { filterCards, getAvailableFilters, legendDisplayName, sortCards } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LinkIcon, PackageIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CardBrowserLayout, useCardBrowserLayoutOffsets } from "@/components/card-browser-layout";
import type { CardViewerItem } from "@/components/card-viewer-types";
import { CardArtThumb } from "@/components/cards/card-art-thumb";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { CardCountStrip } from "@/components/cards/card-count-strip";
import { computeGridMetrics } from "@/components/cards/card-grid-metrics";
import type { ActionsColumn, CardTableColumnOptions } from "@/components/cards/card-table-row";
import {
  CardTableGroupHeader,
  CardTableRow,
  getCardTableColumns,
  getCardTableMinWidth,
} from "@/components/cards/card-table-row";
import type { CardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { CardThumbnail, useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { FinishIcon } from "@/components/cards/finish-icon";
import { PrintingChannelCell } from "@/components/cards/printing-channel-cell";
import { PrintingNotesCell } from "@/components/cards/printing-notes-cell";
import { StaticCountTableActions } from "@/components/cards/static-count-table-actions";
import type { PageTocItem } from "@/components/layout/page-toc";
import { PageToc } from "@/components/layout/page-toc";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBar,
  PageTopBarActions,
  PageTopBarHeightContext,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { MarkdownText } from "@/components/markdown-text";
import { SelectionDetailOverlays } from "@/components/selection-detail-overlays";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pressable } from "@/components/ui/pressable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useEnumOrders, useLanguageList } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { publicPromoListQueryOptions } from "@/hooks/use-public-promos";
import {
  SSR_RESPONSIVE_GRID_COLS,
  SSR_RESPONSIVE_GRID_GAP,
  useResponsiveColumns,
} from "@/hooks/use-responsive-columns";
import { useScopeEffect } from "@/hooks/use-scope-effect";
import { ViewSurfaceProvider } from "@/hooks/use-view-prefs";
import { useSession } from "@/lib/auth-session";
import { buildGroups } from "@/lib/card-groups";
import { groupByOptionsFor } from "@/lib/group-by-field";
import { applyOwnedBucketFilter } from "@/lib/owned-bucket";
import { buildPromoTreeFromMatches } from "@/lib/promo-filters";
import type { PromoGrouping, PromoSection } from "@/lib/promo-groupings";
import { asPromoGrouping, PROMO_GROUPINGS, toPromoSections } from "@/lib/promo-groupings";
import type { ChannelNode } from "@/lib/promos-tree";
import { computeLanguageAggregates } from "@/lib/promos-tree";
import { FilterSearchProvider } from "@/lib/search-schemas";
import { cn, PAGE_PADDING, PAGE_PADDING_NO_TOP } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useGridViewportStore } from "@/stores/grid-viewport-store";
import { useSelectionStore } from "@/stores/selection-store";

export const Route = createLazyFileRoute("/_app/promos_/$language")({
  component: PromosRoute,
  pendingComponent: PromosPending,
});

function PromosRoute() {
  const search = Route.useSearch();
  return (
    <ViewSurfaceProvider value="promos">
      <FilterSearchProvider value={{ ...search, view: "printings" }}>
        <PromosPage />
      </FilterSearchProvider>
    </ViewSurfaceProvider>
  );
}

const PROMOS_BASE_HIDDEN_SECTIONS: ReadonlySet<string> = new Set(["promo"]);

type ViewMode = "grid" | "table";

const COMPACT_LEAF_THRESHOLD = 4;

const PROMOS_CARD_SIZES =
  "(min-width: 2560px) 261px, (min-width: 2160px) 211px, (min-width: 1720px) 217px, (min-width: 1280px) 230px, (min-width: 1024px) calc((100vw - 296px) / 3 - 12px), (min-width: 640px) calc((100vw - 56px) / 3 - 12px), calc((100vw - 40px) / 2 - 12px)";

const BREADCRUMB_SEP = " › ";

const PROMO_TABLE_OPTIONS: CardTableColumnOptions = {
  columns: ["image", "name", "notes"],
  stretch: "notes",
};

const PROMO_TABLE_OPTIONS_WITH_CHANNEL: CardTableColumnOptions = {
  columns: ["image", "name", "channel", "notes"],
  stretch: "channel",
};

function isCompactBranch(node: ChannelNode): boolean {
  if (node.children.length === 0) {
    return false;
  }
  return node.children.every(
    (child) => child.children.length === 0 && child.printings.length <= COMPACT_LEAF_THRESHOLD,
  );
}

function formatLanguageAggregate(
  languageLabel: string,
  printingCount: number,
  cardCount: number,
): string {
  const printingWord = printingCount === 1 ? "printing" : "printings";
  const cardWord = cardCount === 1 ? "card" : "cards";
  return `OpenRift currently has data on ${printingCount} ${languageLabel} promo ${printingWord} across ${cardCount} ${cardWord}.`;
}

/**
 * Non-leaf entries scroll to a hidden anchor at the start of their first
 * descendant section; the TOC stays depth-indented though content is flat.
 */
function collectChannelTocItems(
  nodes: ChannelNode[],
  languageSectionId: string,
  depth: number,
  items: PageTocItem[],
): void {
  for (const node of nodes) {
    if (node.localPrintingCount === 0) {
      continue;
    }
    items.push({
      id: `${languageSectionId}-ch-${node.channel.id}`,
      label: node.channel.label,
      level: depth,
    });
    if (node.children.length === 0) {
      continue;
    }
    collectChannelTocItems(node.children, languageSectionId, depth + 1, items);
  }
}

type FlatSectionKind = Exclude<PromoGrouping, "channel">;

function flatSectionAnchor(languagePrefix: string, kind: FlatSectionKind, id: string): string {
  return `${languagePrefix}-${kind}-${id}`;
}

function collectFlatSectionTocItems(
  sections: PromoSection[],
  languagePrefix: string,
  kind: FlatSectionKind,
): PageTocItem[] {
  return sections.map((section) => ({
    id: flatSectionAnchor(languagePrefix, kind, section.id),
    label: section.label,
    level: 0,
  }));
}

const GROUP_OPTIONS = groupByOptionsFor(PROMO_GROUPINGS);

function OwnedCountBridge({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (data: Record<string, number> | undefined) => void;
}) {
  const { data } = useOwnedCount(enabled);
  useEffect(() => {
    onChange(data);
  }, [data, onChange]);
  return null;
}

interface ChannelRenderItem {
  kind: "leaf" | "compact";
  node: ChannelNode;
  ancestors: string[];
  parentAnchorIds: string[];
  sectionId: string;
  title: string;
}

function flattenChannelSections(nodes: ChannelNode[], languagePrefix: string): ChannelRenderItem[] {
  const items: ChannelRenderItem[] = [];
  let pending: string[] = [];

  function walk(currentNodes: ChannelNode[], ancestors: string[]) {
    for (const node of currentNodes) {
      if (node.localPrintingCount === 0) {
        continue;
      }
      const sectionId = `${languagePrefix}-ch-${node.channel.id}`;
      const titleParts = [...ancestors, node.channel.label];
      const title = titleParts.join(BREADCRUMB_SEP);
      if (node.children.length === 0) {
        items.push({
          kind: "leaf",
          node,
          ancestors,
          parentAnchorIds: pending,
          sectionId,
          title,
        });
        pending = [];
      } else if (isCompactBranch(node)) {
        items.push({
          kind: "compact",
          node,
          ancestors,
          parentAnchorIds: pending,
          sectionId,
          title,
        });
        pending = [];
      } else {
        pending = [...pending, sectionId];
        walk(node.children, titleParts);
      }
    }
  }

  walk(nodes, []);
  return items;
}

interface FlatRenderItem {
  section: PromoSection;
  sectionId: string;
  title: string;
}

function buildFlatRenderItems(
  sections: PromoSection[],
  languagePrefix: string,
  kind: FlatSectionKind,
): FlatRenderItem[] {
  return sections.map((section) => ({
    section,
    sectionId: flatSectionAnchor(languagePrefix, kind, section.id),
    title: section.label,
  }));
}

function PromosPage() {
  const { language: activeLanguage } = Route.useParams();
  const { data } = useSuspenseQuery(publicPromoListQueryOptions(activeLanguage));
  const navigate = useNavigate();
  const location = useLocation();
  const showImages = useDisplayStore((s) => s.showImages);
  const display = useCardThumbnailDisplay();
  const languageOrder = useDisplayStore((s) => s.languages);
  const languageList = useLanguageList();
  const languageLabelMap = new Map(languageList.map((l) => [l.code, l.name]));
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const cardsShowCounts = useDisplayStore((s) => s.cardsShowCounts);
  const toggleCardsShowCounts = useDisplayStore((s) => s.toggleCardsShowCounts);
  const showOwned = isLoggedIn && cardsShowCounts;
  const { filters, ranges, filterState, groupDir, hasActiveFilters } = useFilterValues();
  const ownedFilterActive = filters.ownedFilter.length > 0;
  const fetchOwned = isLoggedIn && (showOwned || ownedFilterActive);
  // useOwnedCount's useSyncExternalStore has no server snapshot, invalid during
  // SSR, so the call is deferred to OwnedCountBridge, which mounts post-hydration.
  const hydrated = useHydrated();
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);
  const [ownedCountByPrinting, setOwnedCountByPrinting] = useState<
    Record<string, number> | undefined
  >();
  const ownedCounts = showOwned ? ownedCountByPrinting : undefined;
  const togglePromoOwned = () => {
    toggleCardsShowCounts();
  };
  const { orders: enumOrders, labels: enumLabels } = useEnumOrders();
  const { setSearch } = useFilterActions();
  const isMobile = useIsMobile();

  const presentLanguageSet = new Set(data.languages);
  const presentLanguages = [
    ...languageOrder.filter((lang) => presentLanguageSet.has(lang)),
    ...[...presentLanguageSet].filter((lang) => !languageOrder.includes(lang)).toSorted(),
  ];

  const viewMode: ViewMode = useDisplayStore((s) => s.displayMode);

  const promoSets = data.sets;
  const setSlugToName = new Map(promoSets.map((s) => [s.slug, s.name] as const));
  const setDisplayLabel = (slug: string) => setSlugToName.get(slug) ?? slug;

  const activePrintings = data.printings;

  // Keyed off price presence, not an EN assumption: Cardmarket/TCGplayer are
  // EN-only with no language field, but CardTrader prices per-language variants.
  const priceFilterEnabled = activePrintings.some(
    (p) => display.prices.get(p.id, display.favoriteMarketplace) !== undefined,
  );

  const availableFilters = getAvailableFilters(activePrintings, {
    orders: enumOrders,
    sets: promoSets,
    channels: data.channels,
    getPrice: (p) => display.prices.get(p.id, display.favoriteMarketplace),
  });

  const sortBy = filterState.sort as SortOption;
  const sortDir = filterState.sortDir as SortDirection;
  const sortPrintings = (printings: Printing[]) =>
    sortCards(printings, sortBy, {
      sortDir,
      sets: promoSets,
      rarityOrder: enumOrders.rarities,
      getPrice: (p) => display.prices.get(p.id, display.favoriteMarketplace),
    });
  const cardFilters = {
    ...filters,
    languages: [activeLanguage],
    price: priceFilterEnabled ? ranges.price : { min: null, max: null },
  };
  const initialMatches = filterCards(activePrintings, cardFilters, {
    getPrice: (p) => display.prices.get(p.id, display.favoriteMarketplace),
  });
  const matchedPrintings =
    !ownedFilterActive || !isLoggedIn || !ownedCountByPrinting
      ? initialMatches
      : applyOwnedBucketFilter(initialMatches, filters.ownedFilter, ownedCountByPrinting);
  const grouping = asPromoGrouping(filterState.groupBy);

  const selectionItems: CardViewerItem[] = matchedPrintings.map((printing) => ({
    id: printing.id,
    printing,
  }));

  // The channel tree reverses its own top-level order here; every other axis
  // reverses inside buildGroups instead.
  const channelTree = buildPromoTreeFromMatches(matchedPrintings, data.channels);
  const orderedChannelTree =
    grouping === "channel" ? (groupDir === "desc" ? channelTree.toReversed() : channelTree) : [];
  const flatKind: FlatSectionKind | null = grouping === "channel" ? null : grouping;
  const flatSections =
    flatKind === null
      ? undefined
      : toPromoSections(
          buildGroups(selectionItems, flatKind, promoSets, groupDir, enumOrders, enumLabels),
        );

  const activePrefix = `lang-${activeLanguage}`;

  const channelRenderItems =
    grouping === "channel" ? flattenChannelSections(orderedChannelTree, activePrefix) : [];
  const flatRenderItems =
    flatSections && flatKind ? buildFlatRenderItems(flatSections, activePrefix, flatKind) : [];

  const hiddenFilterSections = priceFilterEnabled
    ? PROMOS_BASE_HIDDEN_SECTIONS
    : new Set([...PROMOS_BASE_HIDDEN_SECTIONS, "price"]);
  const hiddenWithOwned = isLoggedIn
    ? hiddenFilterSections
    : new Set([...hiddenFilterSections, "owned"]);

  const activeAggregate = computeLanguageAggregates(data.printings).get(activeLanguage);

  const tocItems: PageTocItem[] = [];
  if (grouping === "channel") {
    collectChannelTocItems(orderedChannelTree, activePrefix, 0, tocItems);
  } else if (flatSections && flatKind) {
    tocItems.push(...collectFlatSectionTocItems(flatSections, activePrefix, flatKind));
  }

  const hasContent = channelRenderItems.length > 0 || flatRenderItems.length > 0;

  const languageItems = presentLanguages.map((code) => ({
    value: code,
    label: languageLabelMap.get(code) ?? code,
  }));

  // TanStack Router navigations land before the lazy route's content is in the
  // DOM, so the native browser scroll-to-hash misses the target; re-run manually.
  useScopeEffect(`${activeLanguage} ${location.hash}`, () => {
    if (!location.hash) {
      return;
    }
    // oxlint-disable-next-line prefer-query-selector -- section ids may start with a digit after the "ch-" prefix; getElementById avoids CSS-escape gymnastics.
    const element = document.getElementById(location.hash);
    if (element) {
      element.scrollIntoView({ behavior: "auto", block: "start" });
    }
  });

  const currentSearch = Route.useSearch();
  function handleLanguageChange(next: string | null) {
    if (!next || next === activeLanguage) {
      return;
    }
    void navigate({
      to: "/promos/$language",
      params: { language: next },
      search: currentSearch,
      hash: "",
    });
  }

  const printingsByCardId = Map.groupBy(activePrintings, (printing) => printing.cardId);

  const handleCardClick = (printing: Printing) => {
    useSelectionStore.getState().selectCard(printing, selectionItems, "printing");
  };

  const handleSearchAndClose = (query: string) => {
    setSearch(query);
    if (isMobile) {
      useSelectionStore.getState().closeDetail();
    }
  };

  return (
    <PageTopBarHeightContext value={topBarHeight}>
      {hydrated && <OwnedCountBridge enabled={fetchOwned} onChange={setOwnedCountByPrinting} />}
      <div ref={setTopBarSlot} className={PAGE_TOP_BAR_STICKY}>
        <PageTopBar>
          <PageTopBarTitle>Promos</PageTopBarTitle>
          <PageTopBarActions>
            {presentLanguages.length > 1 ? (
              <Select
                items={languageItems}
                value={activeLanguage}
                onValueChange={handleLanguageChange}
              >
                <SelectTrigger aria-label="Language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languageItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-muted-foreground text-sm">
                {languageLabelMap.get(activeLanguage) ?? activeLanguage}
              </span>
            )}
          </PageTopBarActions>
        </PageTopBar>
      </div>
      <div className={cn(PAGE_PADDING_NO_TOP, "pt-3")}>
        <div className="mb-6">
          <p className="text-muted-foreground text-sm">
            All the cards you can&apos;t pull from booster packs.{" "}
            <strong className="font-semibold">Markers</strong> say how a card differs from the base
            printing, <strong className="font-semibold">distribution channels</strong> say where it
            was available.
          </p>
          {activeAggregate && (
            <p className="text-muted-foreground mt-2 text-sm">
              {formatLanguageAggregate(
                languageLabelMap.get(activeLanguage) ?? activeLanguage,
                activeAggregate.printingCount,
                activeAggregate.cardCount,
              )}{" "}
              If you spotted a missing promo or can help out with a picture I don&apos;t have yet,
              suggest one{" "}
              <Link to="/contribute" className="text-primary hover:underline">
                here
              </Link>
              .
            </p>
          )}
        </div>

        <CardBrowserFilterProvider
          availableFilters={availableFilters}
          setDisplayLabel={setDisplayLabel}
          hiddenSections={hiddenWithOwned}
        >
          <CardBrowserLayout
            toolbar={
              <BrowserToolbar
                totalCards={activePrintings.length}
                filteredCount={matchedPrintings.length}
                mobileDoneLabel={
                  hasActiveFilters ? `Show ${matchedPrintings.length} promos` : undefined
                }
                hideViewToggle
                groupByOptions={GROUP_OPTIONS}
                groupByValue={grouping}
                extras={
                  isLoggedIn ? (
                    <Button
                      variant={showOwned ? "default" : "outline"}
                      size="icon"
                      onClick={togglePromoOwned}
                      aria-label={showOwned ? "Hide owned counts" : "Show owned counts"}
                      aria-pressed={showOwned}
                      title={showOwned ? "Hide owned counts" : "Show owned counts"}
                    >
                      <PackageIcon className="size-4" />
                    </Button>
                  ) : null
                }
              />
            }
            leftPane={<PageToc items={tocItems} className="lg:w-52" />}
            rightPane={
              isMobile ? undefined : (
                <SelectionDetailPane
                  items={selectionItems}
                  printingsByCardId={printingsByCardId}
                  showImages={showImages}
                  onSearchAndClose={handleSearchAndClose}
                />
              )
            }
            gridSlot={
              <PromoSectionsContent
                grouping={grouping}
                channelRenderItems={channelRenderItems}
                flatRenderItems={flatRenderItems}
                hasContent={hasContent}
                hasActiveFilters={hasActiveFilters}
                viewMode={viewMode}
                showImages={showImages}
                display={display}
                ownedCounts={ownedCounts}
                onCardClick={handleCardClick}
                sortPrintings={sortPrintings}
                setNameBySlug={setSlugToName}
              />
            }
          >
            <SelectionDetailOverlays
              items={selectionItems}
              printingsByCardId={printingsByCardId}
              showImages={showImages}
              onSearchAndClose={handleSearchAndClose}
            />
          </CardBrowserLayout>
        </CardBrowserFilterProvider>
      </div>
    </PageTopBarHeightContext>
  );
}

interface PromoSectionsContentProps {
  grouping: PromoGrouping;
  channelRenderItems: ChannelRenderItem[];
  flatRenderItems: FlatRenderItem[];
  hasContent: boolean;
  hasActiveFilters: boolean;
  viewMode: ViewMode;
  showImages: boolean;
  display: CardThumbnailDisplay;
  ownedCounts: Record<string, number> | undefined;
  onCardClick: (printing: Printing) => void;
  sortPrintings: (printings: Printing[]) => Printing[];
  setNameBySlug: Map<string, string>;
}

function PromoSectionsContent({
  grouping,
  channelRenderItems,
  flatRenderItems,
  hasContent,
  hasActiveFilters,
  viewMode,
  showImages,
  display,
  ownedCounts,
  onCardClick,
  sortPrintings,
  setNameBySlug,
}: PromoSectionsContentProps) {
  const { stickyOffset } = useCardBrowserLayoutOffsets();

  const maxColumns = useDisplayStore((s) => s.maxColumns);
  const setMeasurements = useGridViewportStore((s) => s.setMeasurements);
  const { containerRef, columns, autoColumns, physicalMax, physicalMin, containerWidth, measured } =
    useResponsiveColumns(maxColumns);
  // Resolved once and spread onto every section grid, so the column count and
  // the gap can't drift apart between sections.
  const sectionGrid = buildGridProps(columns, containerWidth, measured);
  useEffect(() => {
    setMeasurements({ physicalMax, physicalMin, autoColumns });
  }, [autoColumns, physicalMax, physicalMin, setMeasurements]);

  const sectionEntries: { id: string; label: string; count: number }[] =
    grouping === "channel"
      ? channelRenderItems.map((item) => ({
          id: item.sectionId,
          label: item.title,
          count: item.node.localPrintingCount,
        }))
      : flatRenderItems.map((item) => ({
          id: item.sectionId,
          label: item.title,
          count: item.section.printings.length,
        }));
  const activeSectionId = useActiveSection(sectionEntries, stickyOffset);
  const activeSection = sectionEntries.find((entry) => entry.id === activeSectionId) ?? null;

  const handlePillClick = () => {
    if (!activeSection) {
      return;
    }
    // oxlint-disable-next-line prefer-query-selector -- ids derive from channel ids that may start with a digit; getElementById skips CSS-escape gymnastics.
    const el = document.getElementById(activeSection.id);
    if (!el) {
      return;
    }
    // Must land exactly at stickyOffset, matching CardGrid's scrollToGroup.
    const top = el.getBoundingClientRect().top + globalThis.scrollY - stickyOffset;
    globalThis.scrollTo({ top, behavior: "auto" });
  };

  return (
    <>
      {/* h-0 keeps the pill out of layout flow (it hovers over the first row);
          z-20 keeps it above hovered cards, which elevate to z-10. */}
      <div className="sticky z-20 h-0" style={{ top: `${stickyOffset}px` }}>
        {activeSection && (
          <div className="flex justify-center pt-2">
            <Button
              variant="glass-pill"
              className="h-auto px-3 py-1 text-sm font-normal"
              onClick={handlePillClick}
            >
              <span className="font-semibold">{activeSection.label}</span>{" "}
              <span className="text-muted-foreground tabular-nums">({activeSection.count})</span>
            </Button>
          </div>
        )}
      </div>

      {/* Single wrapper so useResponsiveColumns' ResizeObserver stays wired
          across the channel/flat branch swap below. */}
      <div ref={containerRef}>
        {hasContent ? (
          grouping === "channel" ? (
            <div className="space-y-10">
              {channelRenderItems.map((item) =>
                item.kind === "leaf" ? (
                  <LeafSection
                    key={item.sectionId}
                    item={item}
                    stickyOffset={stickyOffset}
                    viewMode={viewMode}
                    showImages={showImages}
                    display={display}
                    grid={sectionGrid}
                    onCardClick={onCardClick}
                    ownedCounts={ownedCounts}
                    sortPrintings={sortPrintings}
                    setNameBySlug={setNameBySlug}
                  />
                ) : (
                  <CompactSection
                    key={item.sectionId}
                    item={item}
                    stickyOffset={stickyOffset}
                    viewMode={viewMode}
                    showImages={showImages}
                    display={display}
                    grid={sectionGrid}
                    onCardClick={onCardClick}
                    ownedCounts={ownedCounts}
                    sortPrintings={sortPrintings}
                    setNameBySlug={setNameBySlug}
                  />
                ),
              )}
            </div>
          ) : (
            <div className="space-y-10">
              {flatRenderItems.map((item) => (
                <FlatSection
                  key={item.sectionId}
                  item={item}
                  stickyOffset={stickyOffset}
                  viewMode={viewMode}
                  showImages={showImages}
                  display={display}
                  grid={sectionGrid}
                  onCardClick={onCardClick}
                  ownedCounts={ownedCounts}
                  sortPrintings={sortPrintings}
                  setNameBySlug={setNameBySlug}
                />
              ))}
            </div>
          )
        ) : (
          <p className="text-muted-foreground text-sm">
            {hasActiveFilters ? (
              "No promos match the current filters."
            ) : (
              <>
                No promos yet.{" "}
                <Link to="/contribute" className="text-primary hover:underline">
                  Suggest one
                </Link>
                .
              </>
            )}
          </p>
        )}
      </div>
    </>
  );
}

// Must match CardGrid's sticky-pill "active" definition.
function useActiveSection(
  entries: { id: string; label: string }[],
  threshold: number,
): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);
  const entriesRef = useRef(entries);
  const thresholdRef = useRef(threshold);

  useEffect(() => {
    entriesRef.current = entries;
    thresholdRef.current = threshold;
  });

  useEffect(() => {
    const update = () => {
      const list = entriesRef.current;
      const limit = thresholdRef.current + 4;
      let active: string | null = null;
      for (const entry of list) {
        // oxlint-disable-next-line prefer-query-selector -- ids derive from channel ids that may start with a digit; getElementById skips CSS-escape gymnastics.
        const el = document.getElementById(entry.id);
        if (!el) {
          continue;
        }
        if (el.getBoundingClientRect().top <= limit) {
          active = entry.id;
        } else {
          break;
        }
      }
      setActiveId((prev) => (prev === active ? prev : active));
    };
    update();
    globalThis.addEventListener("scroll", update, { passive: true });
    return () => globalThis.removeEventListener("scroll", update);
  }, []);

  return activeId;
}

interface SectionDividerProps {
  title: string;
  count: number;
  description?: string | null;
  anchorId?: string;
}

function SectionDivider({ title, count, description, anchorId }: SectionDividerProps) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-3">
        <div className="bg-border h-px flex-1" />
        <div className="flex items-baseline gap-2 text-sm">
          <span className="font-semibold">{title}</span>
          <span className="text-muted-foreground tabular-nums">({count})</span>
          {anchorId && (
            <a
              href={`#${anchorId}`}
              aria-label={`Link to ${title}`}
              className="text-muted-foreground/60 hover:text-foreground self-center transition-colors"
            >
              <LinkIcon className="size-3.5" />
            </a>
          )}
        </div>
        <div className="bg-border h-px flex-1" />
      </div>
      {description && (
        <MarkdownText
          text={description}
          links="any"
          className="text-muted-foreground mx-auto mt-1 max-w-2xl text-center text-sm"
        />
      )}
    </div>
  );
}

interface RenderedSectionProps {
  stickyOffset: number;
  viewMode: ViewMode;
  showImages: boolean;
  display: CardThumbnailDisplay;
  grid: SectionGridProps;
  onCardClick: (printing: Printing) => void;
  ownedCounts: Record<string, number> | undefined;
  sortPrintings: (printings: Printing[]) => Printing[];
  setNameBySlug: Map<string, string>;
}

interface SectionGridProps {
  className: string;
  style: React.CSSProperties;
}

// Pre-measurement uses container-query Tailwind classes so SSR HTML matches
// the eventual column count; post-measurement switches to inline `gridTemplateColumns`.
function buildGridProps(
  columns: number,
  containerWidth: number,
  measured: boolean,
): SectionGridProps {
  if (!measured) {
    return {
      className: cn("grid", SSR_RESPONSIVE_GRID_COLS, SSR_RESPONSIVE_GRID_GAP),
      style: {},
    };
  }
  return {
    className: "grid",
    style: {
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: `${computeGridMetrics(containerWidth, columns).gap}px`,
    },
  };
}

function ParentAnchors({ ids, stickyOffset }: { ids: string[]; stickyOffset: number }) {
  if (ids.length === 0) {
    return null;
  }
  return (
    <>
      {ids.map((id) => (
        <div key={id} id={id} aria-hidden style={{ scrollMarginTop: `${stickyOffset}px` }} />
      ))}
    </>
  );
}

function LeafSection({
  item,
  stickyOffset,
  viewMode,
  showImages,
  display,
  grid,
  onCardClick,
  ownedCounts,
  sortPrintings,
  setNameBySlug,
}: { item: ChannelRenderItem } & RenderedSectionProps) {
  const sortedPrintings = sortPrintings(item.node.printings);
  if (sortedPrintings.length === 0) {
    return null;
  }
  return (
    <section id={item.sectionId} style={{ scrollMarginTop: `${stickyOffset}px` }}>
      <ParentAnchors ids={item.parentAnchorIds} stickyOffset={stickyOffset} />
      <SectionDivider
        title={item.title}
        count={sortedPrintings.length}
        description={item.node.channel.description}
        anchorId={item.sectionId}
      />
      {viewMode === "grid" ? (
        <div {...grid}>
          {sortedPrintings.map((printing) => {
            const ownedCount = ownedCounts?.[printing.id] ?? 0;
            return (
              <CardThumbnail
                key={printing.id}
                printing={printing}
                onClick={onCardClick}
                showImages={showImages}
                display={display}
                sizes={PROMOS_CARD_SIZES}
                belowLabel={<MarkerChips printing={printing} />}
                aboveCard={ownedCounts ? <CardCountStrip count={ownedCount} /> : undefined}
                dimmed={ownedCounts ? ownedCount === 0 : undefined}
              />
            );
          })}
        </div>
      ) : (
        <PromoListView
          printings={sortedPrintings}
          onRowClick={onCardClick}
          ownedCounts={ownedCounts}
          setNameBySlug={setNameBySlug}
        />
      )}
    </section>
  );
}

function FlatSection({
  item,
  stickyOffset,
  viewMode,
  showImages,
  display,
  grid,
  onCardClick,
  ownedCounts,
  sortPrintings,
  setNameBySlug,
}: { item: FlatRenderItem } & RenderedSectionProps) {
  const sortedPrintings = sortPrintings(item.section.printings);
  if (sortedPrintings.length === 0) {
    return null;
  }
  return (
    <section id={item.sectionId} style={{ scrollMarginTop: `${stickyOffset}px` }}>
      <SectionDivider title={item.title} count={sortedPrintings.length} anchorId={item.sectionId} />
      {viewMode === "grid" ? (
        <div {...grid}>
          {sortedPrintings.map((printing) => {
            const ownedCount = ownedCounts?.[printing.id] ?? 0;
            return (
              <CardThumbnail
                key={printing.id}
                printing={printing}
                onClick={onCardClick}
                showImages={showImages}
                display={display}
                sizes={PROMOS_CARD_SIZES}
                belowLabel={<MarkerChips printing={printing} />}
                aboveCard={ownedCounts ? <CardCountStrip count={ownedCount} /> : undefined}
                dimmed={ownedCounts ? ownedCount === 0 : undefined}
              />
            );
          })}
        </div>
      ) : (
        // Card / year / marker sections say nothing about where a printing came
        // from, so the rows carry the channel themselves.
        <PromoListView
          printings={sortedPrintings}
          onRowClick={onCardClick}
          ownedCounts={ownedCounts}
          setNameBySlug={setNameBySlug}
          showChannel
        />
      )}
    </section>
  );
}

function CompactSection({
  item,
  stickyOffset,
  viewMode,
  showImages,
  display,
  grid,
  onCardClick,
  ownedCounts,
  sortPrintings,
  setNameBySlug,
}: { item: ChannelRenderItem } & RenderedSectionProps) {
  return (
    <section id={item.sectionId} style={{ scrollMarginTop: `${stickyOffset}px` }}>
      <ParentAnchors ids={item.parentAnchorIds} stickyOffset={stickyOffset} />
      <SectionDivider
        title={item.title}
        // localPrintingCount dedupes printings linked to multiple sibling
        // channels; the toolbar pill uses the same source so the counts match.
        count={item.node.localPrintingCount}
        description={item.node.channel.description}
        anchorId={item.sectionId}
      />
      {viewMode === "table" ? (
        <CompactBranchTable
          node={item.node}
          stickyOffset={stickyOffset}
          onCardClick={onCardClick}
          ownedCounts={ownedCounts}
          sortPrintings={sortPrintings}
          setNameBySlug={setNameBySlug}
        />
      ) : (
        <CompactBranchGrid
          node={item.node}
          stickyOffset={stickyOffset}
          showImages={showImages}
          display={display}
          grid={grid}
          onCardClick={onCardClick}
          ownedCounts={ownedCounts}
          sortPrintings={sortPrintings}
        />
      )}
    </section>
  );
}

function CompactBranchGrid({
  node,
  stickyOffset,
  showImages,
  display,
  grid,
  onCardClick,
  ownedCounts,
  sortPrintings,
}: {
  node: ChannelNode;
  stickyOffset: number;
  showImages: boolean;
  display: CardThumbnailDisplay;
  grid: SectionGridProps;
  onCardClick: (printing: Printing) => void;
  ownedCounts: Record<string, number> | undefined;
  sortPrintings: (printings: Printing[]) => Printing[];
}) {
  const entries = node.children.flatMap((child) =>
    sortPrintings(child.printings).map((printing, printingIndex) => ({
      printing,
      leafLabel: child.channel.label,
      anchorId:
        printingIndex === 0 ? `lang-${printing.language}-ch-${child.channel.id}` : undefined,
    })),
  );
  const legend = node.children.filter(
    (child) => child.channel.description && child.printings.length > 0,
  );
  return (
    <>
      {legend.length > 0 && (
        <dl className="mx-auto mb-3 max-w-2xl space-y-0.5 text-center text-sm">
          {legend.map((child) => (
            <div
              key={child.channel.id}
              className="flex flex-wrap items-baseline justify-center gap-x-2"
            >
              <dt className="font-semibold">{child.channel.label}</dt>
              <dd className="text-muted-foreground min-w-0">
                <MarkdownText text={child.channel.description ?? ""} links="any" />
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div {...grid}>
        {entries.map(({ printing, leafLabel, anchorId }) => {
          const ownedCount = ownedCounts?.[printing.id] ?? 0;
          return (
            <div
              key={`${leafLabel}-${printing.id}`}
              id={anchorId}
              style={anchorId ? { scrollMarginTop: `${stickyOffset}px` } : undefined}
            >
              <div className="mb-1 px-1.5 font-semibold">{leafLabel}</div>
              <CardThumbnail
                printing={printing}
                onClick={onCardClick}
                showImages={showImages}
                display={display}
                sizes={PROMOS_CARD_SIZES}
                belowLabel={<MarkerChips printing={printing} />}
                aboveCard={ownedCounts ? <CardCountStrip count={ownedCount} /> : undefined}
                dimmed={ownedCounts ? ownedCount === 0 : undefined}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

function CompactBranchTable({
  node,
  stickyOffset,
  onCardClick,
  ownedCounts,
  sortPrintings,
  setNameBySlug,
}: {
  node: ChannelNode;
  stickyOffset: number;
  onCardClick: (printing: Printing) => void;
  ownedCounts: Record<string, number> | undefined;
  sortPrintings: (printings: Printing[]) => Printing[];
  setNameBySlug: Map<string, string>;
}) {
  const { labels } = useEnumOrders();
  const actionsColumn: ActionsColumn = ownedCounts === undefined ? "none" : "narrow";
  const columns = getCardTableColumns(actionsColumn, undefined, PROMO_TABLE_OPTIONS);
  const minWidth = getCardTableMinWidth(actionsColumn, undefined, PROMO_TABLE_OPTIONS);
  const branches = node.children
    .map((child) => ({ child, printings: sortPrintings(child.printings) }))
    .filter(({ printings }) => printings.length > 0);
  if (branches.length === 0) {
    return null;
  }
  const multipleBranches = branches.length > 1;
  return (
    <>
      {/* Tracks are fixed px, so the wrapper scrolls sideways on narrow desktops
          rather than letting rows spill past the content column. */}
      <div className="hidden overflow-x-auto overflow-y-clip md:block">
        <div style={{ minWidth }}>
          {branches.map(({ child, printings }) => {
            const anchorId = `lang-${printings[0].language}-ch-${child.channel.id}`;
            return (
              <div
                key={child.channel.id}
                id={anchorId}
                style={{ scrollMarginTop: `${stickyOffset}px` }}
              >
                {multipleBranches && (
                  <CardTableGroupHeader
                    columns={columns}
                    name={child.channel.label}
                    count={printings.length}
                    anchorId={anchorId}
                  />
                )}
                {printings.map((printing) => (
                  <CardTableRow
                    key={printing.id}
                    printing={printing}
                    actionsColumn={actionsColumn}
                    columns={columns}
                    cardTypeLabels={labels.cardTypes}
                    superTypeLabels={labels.superTypes}
                    rarityLabels={labels.rarities}
                    setNameBySlug={setNameBySlug}
                    options={PROMO_TABLE_OPTIONS}
                    onRowClick={onCardClick}
                    actionsCell={
                      ownedCounts ? (
                        <StaticCountTableActions count={ownedCounts[printing.id] ?? 0} />
                      ) : undefined
                    }
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-4 md:hidden">
        {branches.map(({ child, printings }) => {
          const anchorId = `lang-${printings[0].language}-ch-${child.channel.id}`;
          return (
            <div
              key={child.channel.id}
              id={anchorId}
              style={{ scrollMarginTop: `${stickyOffset}px` }}
            >
              {multipleBranches && <div className="mb-2 font-semibold">{child.channel.label}</div>}
              <div className="flex flex-col gap-2">
                {printings.map((printing) => (
                  <PromoMobileCard
                    key={printing.id}
                    printing={printing}
                    ownedCount={ownedCounts?.[printing.id] ?? 0}
                    showOwnedCount={ownedCounts !== undefined}
                    onClick={onCardClick}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function PromoListView({
  printings,
  onRowClick,
  ownedCounts,
  setNameBySlug,
  showChannel,
}: {
  printings: Printing[];
  onRowClick: (printing: Printing) => void;
  ownedCounts: Record<string, number> | undefined;
  setNameBySlug: Map<string, string>;
  showChannel?: boolean;
}) {
  const { labels } = useEnumOrders();
  const actionsColumn: ActionsColumn = ownedCounts === undefined ? "none" : "narrow";
  const tableOptions = showChannel ? PROMO_TABLE_OPTIONS_WITH_CHANNEL : PROMO_TABLE_OPTIONS;
  const columns = getCardTableColumns(actionsColumn, undefined, tableOptions);
  const minWidth = getCardTableMinWidth(actionsColumn, undefined, tableOptions);
  return (
    <>
      {/* Desktop: shared CardTable layout. Sideways scroll for the same reason
          as the compact branch table above. */}
      <div className="hidden overflow-x-auto overflow-y-clip md:block">
        <div style={{ minWidth }}>
          {printings.map((printing) => (
            <CardTableRow
              key={printing.id}
              printing={printing}
              actionsColumn={actionsColumn}
              columns={columns}
              cardTypeLabels={labels.cardTypes}
              superTypeLabels={labels.superTypes}
              rarityLabels={labels.rarities}
              setNameBySlug={setNameBySlug}
              options={tableOptions}
              onRowClick={onRowClick}
              actionsCell={
                ownedCounts ? (
                  <StaticCountTableActions count={ownedCounts[printing.id] ?? 0} />
                ) : undefined
              }
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 md:hidden">
        {printings.map((printing) => (
          <PromoMobileCard
            key={printing.id}
            printing={printing}
            ownedCount={ownedCounts?.[printing.id] ?? 0}
            showOwnedCount={ownedCounts !== undefined}
            showChannel={showChannel}
            onClick={onRowClick}
          />
        ))}
      </div>
    </>
  );
}

// The note holds source links, so its click target is a stretched Pressable
// behind the content, with the note rising above it to keep its links clickable.
function PromoMobileCard({
  printing,
  ownedCount,
  showOwnedCount,
  showChannel,
  onClick,
}: {
  printing: Printing;
  ownedCount: number;
  showOwnedCount: boolean;
  showChannel?: boolean;
  onClick: (printing: Printing) => void;
}) {
  const image = printing.images[0];
  const cardName = legendDisplayName(printing.card);
  return (
    <div className="hover:bg-muted/50 relative flex w-full items-start gap-3 rounded-lg border p-2">
      <CardArtThumb imageId={image?.imageId} variant="400w" alt={cardName} className="h-20" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="truncate font-medium">{cardName}</div>
          {showOwnedCount && ownedCount > 0 && (
            <span className="text-muted-foreground shrink-0 tabular-nums">&times;{ownedCount}</span>
          )}
        </div>
        <div className="space-y-1 text-sm">
          <div className="text-muted-foreground flex items-center gap-1">
            <span className="truncate tabular-nums">{printing.publicCode}</span>
            <FinishIcon finish={printing.finish} className="shrink-0" />
          </div>
          {showChannel && <PrintingChannelCell channels={printing.distributionChannels} />}
          <PrintingNotesCell
            comment={printing.comment}
            markers={printing.markers}
            citations={printing.citations ?? []}
            className="relative z-10"
          />
        </div>
      </div>
      <Pressable
        aria-label={cardName}
        onClick={() => onClick(printing)}
        className="absolute inset-0 rounded-lg"
      />
    </div>
  );
}

function MarkerChips({ printing }: { printing: Printing }) {
  if (printing.markers.length === 0) {
    return null;
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {printing.markers.map((marker) => (
        <Badge key={marker.id} variant="secondary" title={marker.description ?? undefined}>
          {marker.label}
        </Badge>
      ))}
    </div>
  );
}

function PromosPending() {
  return (
    <div className={PAGE_PADDING}>
      <Skeleton className="mb-1 h-8 w-48" />
      <Skeleton className="mb-6 h-5 w-64" />
      <Skeleton className="mb-2 h-7 w-36" />
      <Skeleton className="mb-4 h-4 w-48" />
      {/* Fixed breakpoints on purpose: a pending placeholder can't know the
          live container-measured column count yet. */}
      <div className="wide:grid-cols-6 xwide:grid-cols-8 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="p-1.5">
            <Skeleton className="aspect-card rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
