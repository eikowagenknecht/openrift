import type { GroupByField, Printing, SortDirection, SortOption } from "@openrift/shared";
import { filterCards, getAvailableFilters, imageUrl, sortCards } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createLazyFileRoute,
  Link,
  useLocation,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { PackageIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { CardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { CardThumbnail, useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { OwnedCountStrip } from "@/components/cards/owned-count-strip";
import { ActiveFilters } from "@/components/filters/active-filters";
import {
  CollapsibleFilterPanel,
  FilterToggleButton,
} from "@/components/filters/collapsible-filter-panel";
import { FilterPanelContent } from "@/components/filters/filter-panel-content";
import { sortOptions } from "@/components/filters/options-bar";
import { SearchBar } from "@/components/filters/search-bar";
import { SortGroupControls } from "@/components/filters/sort-group-controls";
import type { PageTocItem } from "@/components/layout/page-toc";
import { PageToc } from "@/components/layout/page-toc";
import { MarkdownText } from "@/components/markdown-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useEnumOrders, useLanguageList } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { publicPromoListQueryOptions } from "@/hooks/use-public-promos";
import { useSession } from "@/lib/auth-session";
import { catalogQueryOptions } from "@/lib/catalog-query";
import { getHeaderHeight } from "@/lib/header-height";
import { buildPromoTreeFromMatches } from "@/lib/promo-filters";
import type { PromoGrouping, PromoSection } from "@/lib/promo-groupings";
import { asPromoGrouping, groupByCard, groupByMarker, groupByYear } from "@/lib/promo-groupings";
import type { ChannelNode } from "@/lib/promos-tree";
import { computeLanguageAggregates } from "@/lib/promos-tree";
import { FilterSearchProvider } from "@/lib/search-schemas";
import { cn, PAGE_PADDING } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

export const Route = createLazyFileRoute("/_app/promos_/$language")({
  component: PromosRoute,
  pendingComponent: PromosPending,
});

function PromosRoute() {
  const search = Route.useSearch();
  return (
    <FilterSearchProvider value={search}>
      <PromosPage />
    </FilterSearchProvider>
  );
}

const PROMOS_BASE_HIDDEN_SECTIONS: ReadonlySet<string> = new Set(["promo"]);

type ViewMode = "grid" | "list";

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "grid", label: "Grid" },
  { value: "list", label: "Table" },
];

const COMPACT_LEAF_THRESHOLD = 4;

const PROMOS_CARD_SIZES =
  "(min-width: 2560px) 261px, (min-width: 2160px) 211px, (min-width: 1720px) 217px, (min-width: 1280px) 230px, (min-width: 1024px) calc((100vw - 296px) / 3 - 12px), (min-width: 640px) calc((100vw - 56px) / 3 - 12px), calc((100vw - 40px) / 2 - 12px)";

const BREADCRUMB_SEP = " › ";

/**
 * A branch qualifies for compact-table rendering when every direct child is a
 * leaf and each leaf has ≤ COMPACT_LEAF_THRESHOLD printings. This collapses
 * many sparse one-card sections into a single readable table.
 *
 * @returns True when the branch should render as a compact table.
 */
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
 * Walk the channel tree and collect every channel that carries at least one
 * printing. The TOC keeps the hierarchical layout (depth-indented) even though
 * the content area renders sections flat — non-leaf entries scroll to a hidden
 * anchor at the start of their first descendant section.
 *
 * @returns Flat list of toc items in render order.
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

type FlatSectionKind = "card" | "year" | "marker";

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

const GROUP_OPTIONS: { value: PromoGrouping; label: string }[] = [
  { value: "channel", label: "Channel" },
  { value: "card", label: "Card" },
  { value: "year", label: "Year" },
  { value: "marker", label: "Marker" },
];

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
  /** Non-leaf parents introduced at this position; rendered as hidden anchors so the TOC can still scroll-target them. */
  parentAnchorIds: string[];
  /** Stable id for the visible section header. */
  sectionId: string;
  /** Full breadcrumb shown in the divider header and sticky pill. */
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
  const { data } = useSuspenseQuery(publicPromoListQueryOptions);
  const { language: activeLanguage } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const location = useLocation();
  const showImages = useDisplayStore((s) => s.showImages);
  const display = useCardThumbnailDisplay();
  const languageOrder = useDisplayStore((s) => s.languages);
  const languageList = useLanguageList();
  const languageLabelMap = new Map(languageList.map((l) => [l.code, l.name]));
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const catalogMode = useDisplayStore((s) => s.catalogMode);
  const showOwned = isLoggedIn && catalogMode !== "off";
  const { filters, ranges, filterState, groupDir, hasActiveFilters } = useFilterValues();
  const ownedFilterActive = filters.ownedFilter !== null;
  const fetchOwned = isLoggedIn && (showOwned || ownedFilterActive);
  // useOwnedCount → useLiveQuery uses useSyncExternalStore without a server
  // snapshot, which is invalid during SSR. Defer the call to OwnedCountBridge,
  // which mounts only after hydration; the result is lifted up via state. SSR
  // renders without owned counts (and ignores any owned filter) and the data
  // pops in once the client takes over.
  const hydrated = useHydrated();
  const [ownedCountByPrinting, setOwnedCountByPrinting] = useState<
    Record<string, number> | undefined
  >();
  const ownedCounts = showOwned ? ownedCountByPrinting : undefined;
  const togglePromoOwned = () => {
    useDisplayStore.setState({ catalogMode: catalogMode === "off" ? "count" : "off" });
  };
  const { orders: enumOrders } = useEnumOrders();
  const { setSortBy, setSortDir, setGroupBy, setGroupDir } = useFilterActions();

  const presentLanguageSet = new Set(data.printings.map((p) => p.language));
  const presentLanguages = [
    ...languageOrder.filter((lang) => presentLanguageSet.has(lang)),
    ...[...presentLanguageSet].filter((lang) => !languageOrder.includes(lang)).toSorted(),
  ];

  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const priceFilterEnabled = activeLanguage === "EN";

  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);
  const setIdToSlug = new Map(catalog.sets.map((s) => [s.id, s.slug] as const));
  const setSlugToName = new Map(catalog.sets.map((s) => [s.slug, s.name] as const));
  const setDisplayLabel = (slug: string) => setSlugToName.get(slug) ?? slug;

  const printingsWithSlug: Printing[] = data.printings.map((p) => ({
    ...p,
    setSlug: setIdToSlug.get(p.setId) ?? "",
  }));
  const activePrintings = printingsWithSlug.filter((p) => p.language === activeLanguage);

  const availableFilters = getAvailableFilters(activePrintings, {
    orders: enumOrders,
    sets: catalog.sets,
    channels: data.channels,
    getPrice: (p) => display.prices.get(p.id, display.favoriteMarketplace),
  });

  const sortBy = filterState.sort as SortOption;
  const sortDir = filterState.sortDir as SortDirection;
  const sortPrintings = (printings: Printing[]) =>
    sortCards(printings, sortBy, {
      sortDir,
      rarityOrder: enumOrders.rarities,
      getPrice: (p) => display.prices.get(p.id, display.favoriteMarketplace),
    });
  const cardFilters = {
    ...filters,
    languages: [activeLanguage],
    price: priceFilterEnabled ? ranges.price : { min: null, max: null },
  };
  const matchedPrintings = filterCards(activePrintings, cardFilters, {
    getPrice: (p) => display.prices.get(p.id, display.favoriteMarketplace),
  }).filter((p) => {
    if (filters.ownedFilter === null || !isLoggedIn) {
      return true;
    }
    const counts = ownedCountByPrinting;
    if (!counts) {
      return true;
    }
    const count = counts[p.id] ?? 0;
    if (filters.ownedFilter === "owned") {
      return count > 0;
    }
    if (filters.ownedFilter === "missing") {
      return count === 0;
    }
    return count < 4;
  });
  const grouping = asPromoGrouping(filterState.groupBy);

  // Apply groupDir uniformly across all groupings — the channel tree reverses
  // its top-level order; card, year, and marker reverse their section order
  // via their helpers. Mirrors how /cards' card-grid handles groupDir so the
  // toggle behaviour is consistent across pages.
  const channelTree = buildPromoTreeFromMatches(matchedPrintings, data.channels);
  const orderedChannelTree =
    grouping === "channel" ? (groupDir === "desc" ? channelTree.toReversed() : channelTree) : [];
  const cardSections = grouping === "card" ? groupByCard(matchedPrintings, groupDir) : undefined;
  const yearSections = grouping === "year" ? groupByYear(matchedPrintings, groupDir) : undefined;
  const markerSections =
    grouping === "marker" ? groupByMarker(matchedPrintings, groupDir) : undefined;
  const flatSections = cardSections ?? yearSections ?? markerSections;
  const flatKind: FlatSectionKind | null = cardSections
    ? "card"
    : yearSections
      ? "year"
      : markerSections
        ? "marker"
        : null;

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

  // Hash-scroll: TanStack Router navigations land before the lazy route's
  // content is in the DOM, so the native browser scroll-to-hash misses the
  // target. Re-run whenever the hash changes or the active language switches.
  useEffect(() => {
    if (!location.hash) {
      return;
    }
    // oxlint-disable-next-line prefer-query-selector -- section ids may start with a digit after the "ch-" prefix; getElementById avoids CSS-escape gymnastics.
    const element = document.getElementById(location.hash);
    if (element) {
      element.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, [location.hash, activeLanguage]);

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

  const handleCardClick = (printing: Printing) => {
    const { href } = router.buildLocation({
      to: "/cards/$cardSlug",
      params: { cardSlug: printing.card.slug },
      search: { printingId: printing.id },
    });
    window.open(href, "_blank", "noreferrer");
  };

  // Mirrors CardBrowserLayout: site header → sticky toolbar → sticky aboveGrid
  // → floating pill / sections. We don't reuse CardBrowserLayout itself
  // because /promos keeps the wide-breakpoint FilterPanelContent inline (not
  // in a leftPane) and its own PageToc as the sidebar. The padding/backdrop
  // classes, the offset stack, and the dual ResizeObservers all match /cards.
  const headerHeight = getHeaderHeight();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const aboveGridRef = useRef<HTMLDivElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  const [aboveGridHeight, setAboveGridHeight] = useState(0);
  useLayoutEffect(() => {
    const el = toolbarRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
      setToolbarHeight(Math.round(height));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = aboveGridRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
      setAboveGridHeight(Math.round(height));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const toolbarOffset = headerHeight + toolbarHeight;
  const stickyOffset = toolbarOffset + aboveGridHeight;

  // Track which section the viewport is currently scrolled into, so the
  // floating pill always reflects the current context. Active = the last
  // section whose top has crossed the sticky threshold.
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
    // Compute target manually rather than rely on scroll-margin-top, so the
    // section.top lands at exactly stickyOffset (right below the sticky
    // stack). Matches CardGrid's scrollToGroup; the h-0 pill above overlaps
    // the section's divider header for ~28px just like /cards.
    const top = el.getBoundingClientRect().top + globalThis.scrollY - stickyOffset;
    globalThis.scrollTo({ top, behavior: "auto" });
  };

  return (
    <div className={PAGE_PADDING}>
      {hydrated && <OwnedCountBridge enabled={fetchOwned} onChange={setOwnedCountByPrinting} />}
      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Promos</h1>
          {presentLanguages.length > 1 ? (
            <Select
              items={languageItems}
              value={activeLanguage}
              onValueChange={handleLanguageChange}
            >
              <SelectTrigger size="sm" aria-label="Language">
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
        </div>
        <p className="text-muted-foreground text-sm">
          Promos are all the cards you can&apos;t get by just opening booster packs. Two things vary
          across them: <strong className="font-semibold">how they look</strong>, shown as markers
          below each card (like &ldquo;Promo&rdquo; or &ldquo;Champion&rdquo;), and{" "}
          <strong className="font-semibold">where you can get them</strong>, which is how the
          sections below are organized (tournament prizes, event exclusives, bundles, or promo
          packs).
        </p>
        {activeAggregate && (
          <p className="text-muted-foreground mt-2 text-sm">
            {formatLanguageAggregate(
              languageLabelMap.get(activeLanguage) ?? activeLanguage,
              activeAggregate.printingCount,
              activeAggregate.cardCount,
            )}{" "}
            Spotted a missing promo?{" "}
            <Link to="/contribute" className="text-primary hover:underline">
              Suggest one
            </Link>
            .
          </p>
        )}
      </div>

      <div
        ref={toolbarRef}
        className={cn(
          "bg-background/80 sticky z-20 -mx-3 px-3 pt-3 backdrop-blur-lg",
          aboveGridHeight === 0 && "sm:rounded-b-xl",
        )}
        style={{ top: `${headerHeight}px` }}
      >
        <div className="mb-1.5 flex flex-wrap items-center gap-2 sm:mb-3">
          <SearchBar totalCards={activePrintings.length} filteredCount={matchedPrintings.length} />
          <SortGroupControls
            sortOptions={sortOptions}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortByChange={setSortBy}
            onSortDirChange={setSortDir}
            group={{
              options: GROUP_OPTIONS,
              value: grouping,
              dir: groupDir,
              onValueChange: (value) => setGroupBy(value as GroupByField),
              onDirChange: setGroupDir,
            }}
            view={{
              title: "View",
              value: viewMode,
              options: VIEW_OPTIONS,
              onChange: setViewMode,
            }}
          />
          {isLoggedIn && (
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
          )}
          <FilterToggleButton />
        </div>
        <CollapsibleFilterPanel
          availableFilters={availableFilters}
          setDisplayLabel={setDisplayLabel}
          hiddenSections={hiddenWithOwned}
        />
      </div>

      <div
        className="relative flex flex-1 items-stretch gap-6"
        style={{ "--sticky-top": `${toolbarOffset}px` } as React.CSSProperties}
      >
        <PageToc items={tocItems} className="lg:w-52" />

        <div className="min-w-0 flex-1">
          <div className="@wide:block bg-background/80 -mx-3 hidden px-3 pb-3 backdrop-blur-lg">
            <FilterPanelContent
              availableFilters={availableFilters}
              setDisplayLabel={setDisplayLabel}
              hiddenSections={hiddenWithOwned}
            />
          </div>

          <div
            ref={aboveGridRef}
            className="bg-background/80 sticky z-15 -mx-3 px-3 backdrop-blur-lg sm:rounded-b-xl"
            style={{ top: `${toolbarOffset}px` }}
          >
            <ActiveFilters
              availableFilters={availableFilters}
              setDisplayLabel={setDisplayLabel}
              hiddenSections={hiddenWithOwned}
            />
          </div>

          {/* Floating section pill — h-0 keeps it out of the layout flow so the
              grid keeps butting up against the sticky stack; the pill just
              hovers over the first row of cards while a section is active.
              z-20 keeps it above hovered cards (which elevate to z-10). */}
          <div className="sticky z-20 h-0" style={{ top: `${stickyOffset}px` }}>
            {activeSection && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={handlePillClick}
                  className="bg-background/70 ring-border/70 hover:bg-background/90 cursor-pointer rounded-full px-3 py-1 text-sm shadow-sm ring-1 backdrop-blur"
                >
                  <span className="font-semibold">{activeSection.label}</span>{" "}
                  <span className="text-muted-foreground tabular-nums">
                    ({activeSection.count})
                  </span>
                </button>
              </div>
            )}
          </div>

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
                      onCardClick={handleCardClick}
                      ownedCounts={ownedCounts}
                      sortPrintings={sortPrintings}
                    />
                  ) : (
                    <CompactSection
                      key={item.sectionId}
                      item={item}
                      stickyOffset={stickyOffset}
                      viewMode={viewMode}
                      showImages={showImages}
                      display={display}
                      onCardClick={handleCardClick}
                      ownedCounts={ownedCounts}
                      sortPrintings={sortPrintings}
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
                    onCardClick={handleCardClick}
                    ownedCounts={ownedCounts}
                    sortPrintings={sortPrintings}
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
      </div>
    </div>
  );
}

/**
 * Tracks the currently-active section as the user scrolls. "Active" is the
 * last section whose top has crossed the sticky threshold (header + toolbar);
 * matches CardGrid's sticky-pill behavior.
 *
 * @returns The id of the active section, or null when scrolled above all of them.
 */
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
}

/**
 * Centered title between two horizontal rules, mirroring CardGrid group
 * headers. The description (if any) sits centered beneath, capped to a
 * readable measure so multi-line markdown doesn't sprawl across the grid.
 *
 * @returns The divider header.
 */
function SectionDivider({ title, count, description }: SectionDividerProps) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-3">
        <div className="bg-border h-px flex-1" />
        <div className="flex items-baseline gap-2 text-sm">
          <span className="font-semibold">{title}</span>
          <span className="text-muted-foreground tabular-nums">({count})</span>
        </div>
        <div className="bg-border h-px flex-1" />
      </div>
      {description && (
        <MarkdownText
          text={description}
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
  onCardClick: (printing: Printing) => void;
  ownedCounts: Record<string, number> | undefined;
  sortPrintings: (printings: Printing[]) => Printing[];
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
  onCardClick,
  ownedCounts,
  sortPrintings,
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
      />
      {viewMode === "grid" ? (
        <div className="wide:grid-cols-6 xwide:grid-cols-8 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
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
                belowLabel={<BelowLabel printing={printing} />}
                aboveCard={ownedCounts ? <OwnedCountStrip count={ownedCount} /> : undefined}
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
  onCardClick,
  ownedCounts,
  sortPrintings,
}: { item: FlatRenderItem } & RenderedSectionProps) {
  const sortedPrintings = sortPrintings(item.section.printings);
  if (sortedPrintings.length === 0) {
    return null;
  }
  return (
    <section id={item.sectionId} style={{ scrollMarginTop: `${stickyOffset}px` }}>
      <SectionDivider title={item.title} count={sortedPrintings.length} />
      {viewMode === "grid" ? (
        <div className="wide:grid-cols-6 xwide:grid-cols-8 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
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
                belowLabel={<BelowLabel printing={printing} />}
                aboveCard={ownedCounts ? <OwnedCountStrip count={ownedCount} /> : undefined}
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
  onCardClick,
  ownedCounts,
  sortPrintings,
}: { item: ChannelRenderItem } & RenderedSectionProps) {
  // Compact: every direct child is a leaf with few printings. Render them as
  // a single combined section anchored under the parent's breadcrumb. Each
  // leaf still gets its own anchor (on the first card / row) so cross-route
  // hash links keep working even though the leaf has no header of its own.
  // localPrintingCount dedupes printings linked to multiple sibling channels;
  // the pill in the toolbar uses the same source so the two counts match.
  return (
    <section id={item.sectionId} style={{ scrollMarginTop: `${stickyOffset}px` }}>
      <ParentAnchors ids={item.parentAnchorIds} stickyOffset={stickyOffset} />
      <SectionDivider
        title={item.title}
        count={item.node.localPrintingCount}
        description={item.node.channel.description}
      />
      {viewMode === "list" ? (
        <CompactBranchTable
          node={item.node}
          stickyOffset={stickyOffset}
          onCardClick={onCardClick}
          ownedCounts={ownedCounts}
          sortPrintings={sortPrintings}
        />
      ) : (
        <CompactBranchGrid
          node={item.node}
          stickyOffset={stickyOffset}
          showImages={showImages}
          display={display}
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
  onCardClick,
  ownedCounts,
  sortPrintings,
}: {
  node: ChannelNode;
  stickyOffset: number;
  showImages: boolean;
  display: CardThumbnailDisplay;
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
                <MarkdownText text={child.channel.description ?? ""} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="wide:grid-cols-6 xwide:grid-cols-8 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
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
                belowLabel={<BelowLabel printing={printing} />}
                aboveCard={ownedCounts ? <OwnedCountStrip count={ownedCount} /> : undefined}
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
}: {
  node: ChannelNode;
  stickyOffset: number;
  onCardClick: (printing: Printing) => void;
  ownedCounts: Record<string, number> | undefined;
  sortPrintings: (printings: Printing[]) => Printing[];
}) {
  const columnHeader = node.channel.childrenLabel ?? "Variant";
  const rows = node.children.flatMap((child) =>
    sortPrintings(child.printings).map((printing, printingIndex) => ({
      printing,
      leafLabel: child.channel.label,
      anchorId:
        printingIndex === 0 ? `lang-${printing.language}-ch-${child.channel.id}` : undefined,
    })),
  );
  if (rows.length === 0) {
    return null;
  }
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-40">{columnHeader}</TableHead>
          <TableHead>Card</TableHead>
          <TableHead className="w-40">Code</TableHead>
          <TableHead className="w-32">Finish</TableHead>
          {ownedCounts && <TableHead className="w-24">Owned</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ printing, leafLabel, anchorId }) => {
          const image = printing.images[0];
          const ownedCount = ownedCounts?.[printing.id] ?? 0;
          return (
            <HoverCard key={`${leafLabel}-${printing.id}`}>
              <HoverCardTrigger
                render={
                  <TableRow
                    id={anchorId}
                    onClick={() => onCardClick(printing)}
                    className={cn("hover:bg-muted/50 cursor-pointer")}
                    style={anchorId ? { scrollMarginTop: `${stickyOffset}px` } : undefined}
                  />
                }
              >
                <TableCell className="truncate font-medium">{leafLabel}</TableCell>
                <TableCell className="truncate">{printing.card.name}</TableCell>
                <TableCell className="text-muted-foreground truncate tabular-nums">
                  {printing.publicCode}
                </TableCell>
                <TableCell className="truncate">{printing.finish}</TableCell>
                {ownedCounts && (
                  <TableCell
                    className={cn(
                      "truncate tabular-nums",
                      ownedCount === 0 && "text-muted-foreground",
                    )}
                  >
                    {ownedCount > 0 ? `×${ownedCount}` : ""}
                  </TableCell>
                )}
              </HoverCardTrigger>
              {image && (
                <HoverCardContent
                  side="right"
                  className="w-auto border-0 bg-transparent p-0 shadow-none ring-0"
                >
                  <img
                    src={imageUrl(image.imageId, "full")}
                    alt={printing.card.name}
                    className="h-96 w-auto rounded-lg shadow-xl"
                  />
                </HoverCardContent>
              )}
            </HoverCard>
          );
        })}
      </TableBody>
    </Table>
  );
}

function PromoListView({
  printings,
  onRowClick,
  ownedCounts,
}: {
  printings: Printing[];
  onRowClick: (printing: Printing) => void;
  ownedCounts: Record<string, number> | undefined;
}) {
  return (
    <>
      {/* Desktop: table with hover-to-preview */}
      <div className="hidden md:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-40">Code</TableHead>
              <TableHead className="w-32">Rarity</TableHead>
              <TableHead className="w-32">Finish</TableHead>
              {ownedCounts && <TableHead className="w-24">Owned</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {printings.map((printing) => {
              const image = printing.images[0];
              const ownedCount = ownedCounts?.[printing.id] ?? 0;
              return (
                <HoverCard key={printing.id}>
                  <HoverCardTrigger
                    render={
                      <TableRow
                        onClick={() => onRowClick(printing)}
                        className="hover:bg-muted/50 cursor-pointer"
                      />
                    }
                  >
                    <TableCell className="truncate font-medium">{printing.card.name}</TableCell>
                    <TableCell className="text-muted-foreground truncate tabular-nums">
                      {printing.publicCode}
                    </TableCell>
                    <TableCell className="truncate">{printing.rarity}</TableCell>
                    <TableCell className="truncate">{printing.finish}</TableCell>
                    {ownedCounts && (
                      <TableCell
                        className={cn(
                          "truncate tabular-nums",
                          ownedCount === 0 && "text-muted-foreground",
                        )}
                      >
                        {ownedCount > 0 ? `×${ownedCount}` : ""}
                      </TableCell>
                    )}
                  </HoverCardTrigger>
                  {image && (
                    <HoverCardContent
                      side="right"
                      className="w-auto border-0 bg-transparent p-0 shadow-none ring-0"
                    >
                      <img
                        src={imageUrl(image.imageId, "full")}
                        alt={printing.card.name}
                        className="h-96 w-auto rounded-lg shadow-xl"
                      />
                    </HoverCardContent>
                  )}
                </HoverCard>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {printings.map((printing) => {
          const image = printing.images[0];
          const ownedCount = ownedCounts?.[printing.id] ?? 0;
          return (
            <button
              key={printing.id}
              type="button"
              onClick={() => onRowClick(printing)}
              className="hover:bg-muted/50 flex w-full items-center gap-3 rounded-lg border p-2 text-left"
            >
              {image ? (
                <img
                  src={imageUrl(image.imageId, "400w")}
                  alt={printing.card.name}
                  className="aspect-card h-20 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="bg-muted aspect-card h-20 shrink-0 rounded" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="truncate font-medium">{printing.card.name}</div>
                  {ownedCounts && ownedCount > 0 && (
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      &times;{ownedCount}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground truncate text-xs tabular-nums">
                  {printing.publicCode}
                </div>
                <div className="text-muted-foreground truncate">
                  {printing.rarity} · {printing.finish}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function BelowLabel({ printing }: { printing: Printing }) {
  return (
    <>
      <SuggestImageOverlay printing={printing} />
      <MarkerChips printing={printing} />
    </>
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

function SuggestImageOverlay({ printing }: { printing: Printing }) {
  if (printing.images.length > 0) {
    return null;
  }
  return (
    <div className="aspect-card pointer-events-none absolute inset-x-1.5 top-1.5 z-20 flex items-center justify-center">
      <Link
        to="/contribute/$cardSlug/image/$printingId"
        params={{ cardSlug: printing.card.slug, printingId: printing.id }}
        className="bg-background/90 text-primary hover:bg-background pointer-events-auto rounded-md px-3 py-1.5 text-sm font-medium shadow-md"
      >
        Suggest image
      </Link>
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
