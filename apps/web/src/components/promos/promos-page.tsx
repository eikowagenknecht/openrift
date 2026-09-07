import { filterCards, getAvailableFilters, sortCards } from "@openrift/shared/filters";
import type { Printing } from "@openrift/shared/types/catalog";
import type { SortDirection, SortOption } from "@openrift/shared/types/search";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi, useLocation } from "@tanstack/react-router";
import { PackageIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { CardBrowserLayout } from "@/components/card-browser-layout";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { PageToc } from "@/components/layout/page-toc";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBarHeightContext,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { PromoSectionsContent } from "@/components/promos/promo-sections-content";
import { PromosIntro } from "@/components/promos/promos-intro";
import { PromosTopBar } from "@/components/promos/promos-top-bar";
import { SelectionDetailOverlays } from "@/components/selection-detail-overlays";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { Button } from "@/components/ui/button";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCardThumbnailDisplay } from "@/hooks/use-card-thumbnail-display";
import { useEnumOrders, useLanguageList } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { publicPromoListQueryOptions } from "@/hooks/use-public-promos";
import { useScopeEffect } from "@/hooks/use-scope-effect";
import { ViewSurfaceProvider } from "@/hooks/use-view-prefs";
import { useSession } from "@/lib/auth-session";
import { buildGroups } from "@/lib/card-groups";
import type { CardViewerItem } from "@/lib/card-viewer-types";
import { groupByOptionsFor } from "@/lib/group-by-field";
import { applyOwnedBucketFilter } from "@/lib/owned-bucket";
import { buildPromoTreeFromMatches } from "@/lib/promo-filters";
import { asPromoGrouping, PROMO_GROUPINGS, toPromoSections } from "@/lib/promo-groupings";
import type { FlatSectionKind, PromoTocItem } from "@/lib/promo-sections";
import {
  buildFlatRenderItems,
  collectChannelTocItems,
  collectFlatSectionTocItems,
  flattenChannelSections,
} from "@/lib/promo-sections";
import { computeLanguageAggregates } from "@/lib/promos-tree";
import { FilterSearchProvider } from "@/lib/search-schemas";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

const routeApi = getRouteApi("/_app/promos_/$language");

const PROMOS_BASE_HIDDEN_SECTIONS: ReadonlySet<string> = new Set(["promo"]);

const GROUP_OPTIONS = groupByOptionsFor(PROMO_GROUPINGS);

export function PromosPage() {
  const search = routeApi.useSearch();
  return (
    <ViewSurfaceProvider value="promos">
      <FilterSearchProvider value={{ ...search, view: "printings" }}>
        <PromosBrowser />
      </FilterSearchProvider>
    </ViewSurfaceProvider>
  );
}

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

function PromosBrowser() {
  const { language: activeLanguage } = routeApi.useParams();
  const { data } = useSuspenseQuery(publicPromoListQueryOptions(activeLanguage));
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

  const viewMode = useDisplayStore((s) => s.displayMode);

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

  const tocItems: PromoTocItem[] = [];
  if (grouping === "channel") {
    collectChannelTocItems(orderedChannelTree, activePrefix, 0, tocItems);
  } else if (flatSections && flatKind) {
    tocItems.push(...collectFlatSectionTocItems(flatSections, activePrefix, flatKind));
  }

  const hasContent = channelRenderItems.length > 0 || flatRenderItems.length > 0;

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
        <PromosTopBar
          activeLanguage={activeLanguage}
          presentLanguages={presentLanguages}
          languageLabelMap={languageLabelMap}
        />
      </div>
      <div className={cn(PAGE_PADDING_NO_TOP, "pt-3")}>
        <PromosIntro
          languageLabel={languageLabelMap.get(activeLanguage) ?? activeLanguage}
          aggregate={activeAggregate}
        />

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
