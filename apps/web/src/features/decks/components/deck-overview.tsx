import type { DeckOddsConfig } from "@openrift/shared/contracts/decks";
import { formatHasSideboard, validateDeck } from "@openrift/shared/deck-rules";
import { imageUrl } from "@openrift/shared/image-url";
import { setIndexById } from "@openrift/shared/set-order";
import type { DeckFormatConfig, DeckLink } from "@openrift/shared/types/api/deck";
import type { DeckFormat, DeckZone } from "@openrift/shared/types/enums";
import type { Marketplace } from "@openrift/shared/types/pricing";
import { WellKnown } from "@openrift/shared/well-known";
import { useQuery } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOnboardingStore } from "@/features/account/stores/onboarding-store";
import { MobileOptionsDrawer } from "@/features/cards/components/options-bar";
import type { SortGroupOption } from "@/features/cards/components/sort-group-controls";
import { useCards } from "@/features/cards/hooks/use-cards";
import { pricesQueryOptions } from "@/features/cards/hooks/use-prices";
import { useResponsiveColumns } from "@/features/cards/hooks/use-responsive-columns";
import type { CardOpenTarget, HoverHandler } from "@/features/cards/lib/card-row-interactions";
import { useHomeCollection } from "@/features/collections/hooks/use-home-collection";
import { DeckBoxTab } from "@/features/decks/components/deck-box-tab";
import { DeckBuilderIntroBanner } from "@/features/decks/components/deck-builder-intro-banner";
import { DeckDescription, DeckLinkChips } from "@/features/decks/components/deck-description";
import { DeckHero } from "@/features/decks/components/deck-hero";
import {
  DECK_GRID_GAP,
  SMALL_ZONES,
  smallZoneGridStyles,
  UNMEASURED_CARD_WIDTH,
} from "@/features/decks/components/deck-overview-geometry";
import { DeckOverviewList } from "@/features/decks/components/deck-overview-list";
import {
  PlanTabActionsContext,
  SECTION_SCROLL_MARGIN,
  TabStrip,
} from "@/features/decks/components/deck-overview-tabs";
import type { DeckOrderingControls } from "@/features/decks/components/deck-overview-view-controls";
import {
  DeckOrderingControl,
  DeckOverviewViewControls,
} from "@/features/decks/components/deck-overview-view-controls";
import { ZoneTile } from "@/features/decks/components/deck-overview-zone-tile";
import { OwnershipBandSourcesBridge } from "@/features/decks/components/deck-ownership-bridge";
import { DeckTestBench } from "@/features/decks/components/deck-test-bench";
import { DeckTokensSection } from "@/features/decks/components/deck-tokens-section";
import { FormatConfigCard } from "@/features/decks/components/format-config-card";
import { DeckStatsBand } from "@/features/decks/components/stats/deck-stats-band";
import { useDeckStats } from "@/features/decks/hooks/use-deck-stats";
import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { toRuleEngineCard } from "@/features/decks/lib/deck-builder-card";
import type { DeckOverviewGroup } from "@/features/decks/lib/deck-card-group";
import { groupDeckCards } from "@/features/decks/lib/deck-card-group";
import { formatChancePct } from "@/features/decks/lib/deck-draw-odds";
import {
  buildAddRoom,
  buildPriceTexts,
  NO_ADD_ROOM,
  NO_BANDS,
  NO_PRICE_TEXTS,
  zoneShowsAllCopies,
} from "@/features/decks/lib/deck-overview-derive";
import type { DeckListSortContext } from "@/features/decks/lib/deck-overview-list-sort";
import { sortDeckOverviewList } from "@/features/decks/lib/deck-overview-list-sort";
import type { OwnershipBandSources } from "@/features/decks/lib/deck-ownership-band";
import { buildOwnershipBands } from "@/features/decks/lib/deck-ownership-band";
import type { DeckOwnershipData } from "@/features/decks/lib/deck-ownership-types";
import type { StatsFocus } from "@/features/decks/lib/deck-stats-focus";
import {
  statsFocusCount,
  statsFocusLabel,
  statsFocusOpeningChance,
} from "@/features/decks/lib/deck-stats-focus";
import {
  requiredZoneProgress,
  ZONE_LABELS,
  zoneEmptyHint,
  zoneExpected,
} from "@/features/decks/lib/deck-zone-labels";
import { useDeckBuilderUiStore } from "@/features/decks/stores/deck-builder-ui-store";
import { useDeckOverviewViewStore } from "@/features/decks/stores/deck-overview-view-store";
import { useChampionIdentifierTags, useEnumOrders } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";

interface DeckOverviewProps {
  deck: {
    id: string;
    name: string;
    format: DeckFormat;
    formatConfig: DeckFormatConfig | null;
    coverCardId?: string | null;
    coverPrintingId?: string | null;
    coverPosition?: number | null;
    links?: readonly DeckLink[];
    collectionId?: string | null;
  };
  cards: DeckBuilderCard[];
  customTagAssignments: Record<string, readonly string[]>;
  ownershipData?: DeckOwnershipData;
  marketplace: Marketplace;
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
  onZoneClick?: (zone: DeckZone) => void;
  onViewMissing?: () => void;
  onHoverCard?: HoverHandler;
  readOnly?: boolean;
  signInHref?: string;
  description?: string;
  onEditDescription?: () => void;
  onCardClick?: (card: CardOpenTarget) => void;
  planSlot?: React.ReactNode;
  variantRailSlot?: React.ReactNode;
  heroByline?: React.ReactNode;
  heroHeading?: React.ReactNode;
  heroLead?: React.ReactNode;
  heroActions?: React.ReactNode;
  notice?: React.ReactNode;
  unknownZoneCounts?: ReadonlyMap<DeckZone, number>;
  oddsConfig?: DeckOddsConfig | null;
  onSaveOddsConfig?: (config: DeckOddsConfig) => void;
}

export function DeckOverview({
  deck,
  cards,
  customTagAssignments,
  ownershipData,
  marketplace,
  getThumbnail,
  onZoneClick,
  onViewMissing,
  onHoverCard,
  readOnly,
  signInHref,
  description,
  onEditDescription,
  onCardClick,
  planSlot,
  variantRailSlot,
  heroByline,
  heroHeading,
  heroLead,
  heroActions,
  notice,
  unknownZoneCounts,
  oddsConfig,
  onSaveOddsConfig,
}: DeckOverviewProps) {
  const championIdentifierTags = useChampionIdentifierTags();
  const { labels: enumLabels, orders: enumOrders } = useEnumOrders();
  const { sets } = useCards();
  const violations = validateDeck({
    format: deck.format,
    formatConfig: deck.formatConfig,
    cards: cards.map((card) => toRuleEngineCard(card, customTagAssignments)),
    championIdentifierTags,
  });
  const stats = useDeckStats(cards);
  const hasLinks = (deck.links?.length ?? 0) > 0;

  const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);
  const { progress: requiredProgress, total: requiredTotal } = requiredZoneProgress(
    cards,
    deck.format,
  );
  const legendCard = cards.find((card) => card.zone === WellKnown.deckZone.LEGEND);
  const championCard = cards.find((card) => card.zone === WellKnown.deckZone.CHAMPION);
  const coverEntry = deck.coverCardId
    ? cards.find((card) => card.cardId === deck.coverCardId)
    : undefined;
  const coverThumb = deck.coverCardId
    ? (getThumbnail(deck.coverCardId, deck.coverPrintingId ?? null) ??
      (coverEntry ? getThumbnail(coverEntry.cardId, coverEntry.preferredPrintingId) : undefined))
    : undefined;
  const hasLegend = legendCard !== undefined;
  const introDismissed = useOnboardingStore((state) => state.deckBuilderIntroDismissed);
  const dismissIntro = useOnboardingStore((state) => state.dismissDeckBuilderIntro);
  const showIntroBanner = !readOnly && totalCards === 0 && !introDismissed;
  const fallbackHint =
    !readOnly && totalCards > 0 && !hasLegend
      ? "Pick a Legend to unlock matching Champions and auto-fill Runes."
      : null;

  // Gate behind hydration: SSR and the first client render must both show grid,
  // or a stored "list" pref flips the tree after hydration and trips a mismatch.
  const hydrated = useHydrated();
  const homeCollection = useHomeCollection(deck.collectionId);
  const isMobile = useIsMobile();
  const storedDisplayMode = useDeckOverviewViewStore((state) => state.displayMode);
  const storedColumns = useDeckOverviewViewStore((state) => state.columns);
  const storedPreferOwned = useDeckOverviewViewStore((state) => state.preferOwnedPrintings);
  const storedShowAllCopies = useDeckOverviewViewStore((state) => state.showAllCopies);
  const storedShowAllRuneCopies = useDeckOverviewViewStore((state) => state.showAllRuneCopies);
  const listSortBy = useDeckOverviewViewStore((state) => state.sortBy);
  const listSortDir = useDeckOverviewViewStore((state) => state.sortDir);
  const storedGroupBy = useDeckOverviewViewStore((state) => state.groupBy);
  const storedGroupDir = useDeckOverviewViewStore((state) => state.groupDir);
  const setSortBy = useDeckOverviewViewStore((state) => state.setSortBy);
  const setSortDir = useDeckOverviewViewStore((state) => state.setSortDir);
  const setGroupBy = useDeckOverviewViewStore((state) => state.setGroupBy);
  const setGroupDir = useDeckOverviewViewStore((state) => state.setGroupDir);
  const storedStatsOpen = useDeckOverviewViewStore((state) => state.statsOpen);
  const setStatsOpen = useDeckOverviewViewStore((state) => state.setStatsOpen);
  const storedShowBands = useDeckOverviewViewStore((state) => state.showOwnershipBands);
  const storedShowPrices = useDeckOverviewViewStore((state) => state.showPrices);
  const displayMode = hydrated ? storedDisplayMode : "grid";
  const statsOpen = hydrated ? storedStatsOpen : true;
  const showAllCopies = hydrated && storedShowAllCopies;
  const showAllRuneCopies = hydrated && storedShowAllRuneCopies;
  const showBands = hydrated ? storedShowBands : true;
  const canPreferOwned = ownershipData !== undefined && !signInHref;
  const preferOwned = hydrated && canPreferOwned && storedPreferOwned;
  const hydratedGroupBy = hydrated ? storedGroupBy : "type";
  const groupBy: DeckOverviewGroup =
    hydratedGroupBy === "ownership" && !canPreferOwned ? "type" : hydratedGroupBy;
  const groupDir = hydrated ? storedGroupDir : "asc";

  const columnOverride = hydrated ? storedColumns : null;
  const { containerRef, columns, autoColumns, physicalMin, physicalMax, containerWidth, measured } =
    useResponsiveColumns(columnOverride);
  const cardWidth =
    measured && columns > 0 && containerWidth > 0
      ? `${Math.floor((containerWidth - (columns - 1) * DECK_GRID_GAP) / columns)}px`
      : UNMEASURED_CARD_WIDTH;
  const cardWidthStyle = { "--deck-card-w": cardWidth } as React.CSSProperties;
  const tileColumns = measured ? columns : 1;
  const smallZoneTemplateStyle: React.CSSProperties = {
    gridTemplateColumns: `repeat(${tileColumns}, minmax(0, 1fr))`,
  };
  const smallZoneStyles = smallZoneGridStyles(tileColumns, displayMode === "stacks");

  const addRoomByCardKey = readOnly ? NO_ADD_ROOM : buildAddRoom(cards, deck.format);

  const [bandSources, setBandSources] = useState<OwnershipBandSources>();
  const bandsActive = showBands && canPreferOwned && displayMode !== "list";
  const ownedPrintingByCardId = ownershipData?.ownedPrintingByCardId;
  // Computed whenever sources are up, not just while bands show: the stats
  // band's ownership lens reads the same split in any display mode.
  const ownershipSegmentsByCardKey =
    canPreferOwned && bandSources
      ? buildOwnershipBands(cards, bandSources, ownedPrintingByCardId, preferOwned)
      : undefined;
  const bandByCardKey =
    bandsActive && ownershipSegmentsByCardKey ? ownershipSegmentsByCardKey : NO_BANDS;

  // priceMap only prices owned printings; display printings are already priced by ownership.
  const showPrices = hydrated && storedShowPrices;
  const { data: priceMap } = useQuery(pricesQueryOptions);
  const priceTextByCardKey =
    showPrices && displayMode !== "list" && ownershipData !== undefined
      ? buildPriceTexts(cards, ownershipData, preferOwned, priceMap, marketplace)
      : NO_PRICE_TEXTS;

  // Deliberately not art-gated: image-rendering consumers check art themselves,
  // while a row's set code, rarity and price follow the owned printing regardless.
  const ownedPrintingFor = (cardId: string) =>
    preferOwned ? ownershipData?.ownedPrintingByCardId.get(cardId) : undefined;

  const resolveThumbnail = (cardId: string, preferredPrintingId: string | null) => {
    const owned = ownedPrintingFor(cardId);
    if (owned?.imageId) {
      return imageUrl(owned.imageId, "400w");
    }
    return getThumbnail(cardId, preferredPrintingId);
  };

  // The share page's payload is keyed by the deck's own printings; an owned
  // printing id finds nothing there, so read-only surfaces keep the entry's own.
  const resolveHoverPrintingId = (cardId: string, preferredPrintingId: string | null) => {
    const owned = ownedPrintingFor(cardId);
    if (!readOnly && owned?.imageId) {
      return owned.id;
    }
    return preferredPrintingId;
  };

  const hoverBenchCard: HoverHandler | undefined = onHoverCard
    ? (cardId, preferredPrintingId) =>
        cardId
          ? onHoverCard(cardId, resolveHoverPrintingId(cardId, preferredPrintingId ?? null))
          : onHoverCard(null)
    : undefined;

  const getOwnershipEntry = (card: DeckBuilderCard) =>
    ownershipData?.byCardZone.get(`${card.cardId}:${card.zone}`);
  const overviewSortContext: DeckListSortContext = {
    getEntry: getOwnershipEntry,
    rarityOrder: enumOrders.rarities,
    setIndexById: setIndexById(sets),
    getRowPrice: (card) => {
      const owned = ownedPrintingFor(card.cardId);
      if (owned && priceMap) {
        return priceMap.get(owned.id, marketplace);
      }
      const entry = getOwnershipEntry(card);
      return entry?.cheapestPrice ?? entry?.displayPrice;
    },
    getRowRarity: (card) =>
      (ownedPrintingFor(card.cardId) ?? getOwnershipEntry(card)?.displayPrinting)?.rarity,
    getRowPrinting: (card) =>
      ownedPrintingFor(card.cardId) ?? getOwnershipEntry(card)?.displayPrinting,
  };
  const sortZoneCards = (zoneCards: DeckBuilderCard[]) =>
    sortDeckOverviewList(zoneCards, listSortBy, listSortDir, overviewSortContext);
  const groupZoneCards = (zoneCards: DeckBuilderCard[]) =>
    groupDeckCards(zoneCards, groupBy, groupDir, {
      typeLabels: enumLabels.cardTypes,
      domainLabels: enumLabels.domains,
      domainOrder: enumOrders.domains,
      getEntry: getOwnershipEntry,
    });

  const groupOptions: SortGroupOption<DeckOverviewGroup>[] = [
    { value: "type", label: "Type" },
    { value: "energy", label: "Energy" },
    { value: "domain", label: "Domain" },
    ...(canPreferOwned ? [{ value: "ownership" as const, label: "Ownership" }] : []),
    { value: "none", label: "None" },
  ];

  const tab = useDeckBuilderUiStore((state) => state.overviewTab);
  const setTab = useDeckBuilderUiStore((state) => state.setOverviewTab);
  const collapsedZones = useDeckBuilderUiStore((state) => state.collapsedZones);
  const toggleZoneCollapsed = useDeckBuilderUiStore((state) => state.toggleZoneCollapsed);

  const [statsFocus, setStatsFocus] = useState<StatsFocus | null>(null);
  const applyStatsFocus = (focus: StatsFocus) => {
    const isSame =
      statsFocus !== null && statsFocus.kind === focus.kind && statsFocus.value === focus.value;
    setStatsFocus(isSame ? null : focus);
  };
  const focusOpeningChance = statsFocus ? statsFocusOpeningChance(cards, statsFocus) : null;
  // A stale "plan" (e.g. after switching to a local deck) falls back to the deck view.
  const showPlanTab = planSlot !== undefined;
  const showBoxTab = homeCollection !== undefined && !readOnly;
  const tabAvailable =
    tab === "overview" ||
    tab === "test" ||
    (tab === "plan" && showPlanTab) ||
    (tab === "box" && showBoxTab);
  const activeTab = tabAvailable ? tab : "overview";
  const [planActionsSlot, setPlanActionsSlot] = useState<HTMLDivElement | null>(null);
  const showOverviewContent = activeTab === "overview";

  const ordering: DeckOrderingControls = {
    sortBy: listSortBy,
    sortDir: listSortDir,
    onSortByChange: setSortBy,
    onSortDirChange: setSortDir,
    groupOptions,
    groupBy,
    groupDir,
    onGroupByChange: setGroupBy,
    onGroupDirChange: setGroupDir,
  };

  const renderViewControls = (compact: boolean) =>
    totalCards > 0 && (
      <DeckOverviewViewControls
        compact={compact}
        displayMode={displayMode}
        ordering={ordering}
        columnOverride={columnOverride}
        autoColumns={autoColumns}
        minColumns={physicalMin}
        maxColumnsLimit={physicalMax}
        showAllCopies={showAllCopies}
        showAllRuneCopies={showAllRuneCopies}
        showBands={showBands}
        showPrices={showPrices}
        preferOwned={preferOwned}
        canPreferOwned={canPreferOwned}
        hasOwnershipData={ownershipData !== undefined}
      />
    );

  const showList = totalCards > 0 && displayMode === "list";

  const renderZone = (zone: DeckZone, style?: React.CSSProperties) => (
    <ZoneTile
      key={zone}
      deckId={deck.id}
      collapsedZones={collapsedZones}
      onToggleCollapsed={toggleZoneCollapsed}
      bandByCardKey={bandByCardKey}
      priceTextByCardKey={priceTextByCardKey}
      addRoomByCardKey={addRoomByCardKey}
      resolveHoverPrintingId={resolveHoverPrintingId}
      showAllCopies={zoneShowsAllCopies(zone, showAllCopies, showAllRuneCopies)}
      statsFocus={statsFocus}
      groupCards={groupZoneCards}
      sortCards={sortZoneCards}
      groupBy={groupBy}
      stacked={displayMode === "stacks"}
      zone={zone}
      label={ZONE_LABELS[zone]}
      cards={cards.filter((card) => card.zone === zone)}
      allCards={cards}
      expected={zoneExpected(zone, deck.format)}
      emptyHint={zoneEmptyHint(zone, deck.format)}
      unknownCount={unknownZoneCounts?.get(zone) ?? 0}
      format={deck.format}
      zoneViolations={violations.filter(
        (violation) => violation.zone === zone && !violation.cardId,
      )}
      style={style}
      onClick={onZoneClick ? () => onZoneClick(zone) : undefined}
      onHoverCard={onHoverCard}
      getThumbnail={resolveThumbnail}
      readOnly={readOnly}
      onCardClick={onCardClick}
    />
  );

  // Derived from the catalog, which suspends, so it waits for hydration like
  // the ownership-band bridge does.
  const tokensSection = hydrated ? (
    <Suspense fallback={null}>
      <DeckTokensSection
        cards={cards}
        variant={showList ? "list" : "grid"}
        onHoverCard={onHoverCard}
      />
    </Suspense>
  ) : null;

  return (
    <div className="@container flex flex-col gap-6 px-1 pt-3 pb-4">
      {hydrated && canPreferOwned && (
        <Suspense fallback={null}>
          <OwnershipBandSourcesBridge
            cards={cards}
            homeCollectionId={deck.collectionId}
            onResult={setBandSources}
          />
        </Suspense>
      )}
      <DeckHero
        name={deck.name}
        format={deck.format}
        violations={violations}
        totalCards={totalCards}
        requiredProgress={requiredProgress}
        requiredTotal={requiredTotal}
        legend={legendCard}
        champion={championCard}
        getThumbnail={resolveThumbnail}
        cover={
          coverThumb ? { thumbnail: coverThumb, position: deck.coverPosition ?? null } : undefined
        }
        domainDistribution={stats.domainDistribution}
        domainTotal={stats.totalCards}
        ownershipData={ownershipData}
        marketplace={marketplace}
        signInHref={signInHref}
        onViewMissing={onViewMissing}
        onCardClick={onCardClick}
        box={
          showBoxTab && homeCollection
            ? { name: homeCollection.name, onOpen: () => setTab("box") }
            : undefined
        }
        byline={heroByline}
        heading={heroHeading}
        lead={heroLead}
        actions={heroActions}
      />
      {notice}
      {variantRailSlot}
      <TabStrip
        tab={activeTab}
        onTabChange={setTab}
        showPlanTab={showPlanTab}
        showBoxTab={showBoxTab}
        trailingMobile={
          activeTab === "overview" ? (
            renderViewControls(true)
          ) : activeTab === "box" ? (
            <MobileOptionsDrawer>
              <DeckOrderingControl compact ordering={ordering} />
            </MobileOptionsDrawer>
          ) : undefined
        }
        trailing={
          activeTab === "overview" ? (
            renderViewControls(false)
          ) : activeTab === "box" ? (
            <DeckOrderingControl ordering={ordering} />
          ) : activeTab === "plan" ? (
            // Plan editor's actions portal in here once the ref lands (PlanTabActionsContext).
            <div ref={setPlanActionsSlot} className="flex items-center gap-2" />
          ) : undefined
        }
      />
      {showOverviewContent && (
        <FormatConfigCard
          deckId={deck.id}
          format={deck.format}
          formatConfig={deck.formatConfig}
          readOnly={readOnly}
        />
      )}
      {showOverviewContent && (description || hasLinks) && (
        <div className="flex flex-col gap-3">
          {description && (
            <div className="flex min-w-0 items-start gap-2">
              <DeckDescription
                text={description}
                className="text-muted-foreground min-w-0 flex-1 text-sm"
                onHoverCard={onHoverCard}
                onCardClick={onCardClick}
              />
              {!readOnly && onEditDescription && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        aria-label="Edit description"
                        onClick={onEditDescription}
                      />
                    }
                  >
                    <PencilIcon className="size-4" />
                  </TooltipTrigger>
                  <TooltipContent>Edit description</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
          {hasLinks && <DeckLinkChips links={deck.links ?? []} />}
        </div>
      )}
      {showOverviewContent && showIntroBanner && (
        <DeckBuilderIntroBanner format={deck.format} onDismiss={dismissIntro} />
      )}
      {showOverviewContent && fallbackHint && <p className="text-sm">{fallbackHint}</p>}

      {activeTab === "plan" && (
        <PlanTabActionsContext value={planActionsSlot}>{planSlot}</PlanTabActionsContext>
      )}

      {/* No server snapshot for the live copies feed, so it waits for hydration too. */}
      {activeTab === "box" && hydrated && homeCollection && (
        <DeckBoxTab
          deckId={deck.id}
          cards={cards}
          homeCollectionId={homeCollection.id}
          homeCollectionName={homeCollection.name}
          onViewMissing={onViewMissing}
          sortCards={sortZoneCards}
          groupCards={groupZoneCards}
          groupBy={groupBy}
          onCardClick={onCardClick}
          onHoverCard={onHoverCard}
        />
      )}

      {activeTab === "test" && (
        <DeckTestBench
          cards={cards}
          deckId={deck.id}
          oddsConfig={oddsConfig}
          onSaveOddsConfig={onSaveOddsConfig}
          getThumbnail={resolveThumbnail}
          onHoverCard={hoverBenchCard}
          onCardClick={onCardClick}
        />
      )}

      {showOverviewContent && !isMobile && (
        <DeckStatsBand
          cards={cards}
          stats={stats}
          ownershipData={ownershipData}
          ownershipSegmentsByCardKey={ownershipSegmentsByCardKey}
          ownedPrintingFor={ownedPrintingFor}
          enumLabels={enumLabels}
          enumOrders={enumOrders}
          statsFocus={statsFocus}
          applyStatsFocus={applyStatsFocus}
          statsOpen={statsOpen}
          onStatsOpenChange={setStatsOpen}
        />
      )}

      {showOverviewContent && (
        <div id="deck-cards" style={{ scrollMarginTop: SECTION_SCROLL_MARGIN }}>
          {statsFocus && (
            <div className="mb-3 flex">
              <span className="border-primary/40 bg-primary/10 flex max-w-full items-center gap-1.5 rounded-2xl border py-1 pr-2 pl-3 text-sm sm:rounded-full">
                <span className="flex min-w-0 flex-col gap-x-1.5 sm:flex-row sm:items-center">
                  <span>
                    {statsFocusLabel(statsFocus, enumLabels.cardTypes, enumLabels.rarities)}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    <span className="hidden sm:inline">· </span>
                    {statsFocusCount(cards, statsFocus)} in deck
                    {focusOpeningChance !== null && (
                      <> · {formatChancePct(focusOpeningChance)} in your opening hand</>
                    )}
                  </span>
                </span>
                <ChipRemoveButton
                  aria-label="Show all cards"
                  className="shrink-0"
                  onClick={() => setStatsFocus(null)}
                />
              </span>
            </div>
          )}
          {showList ? (
            <DeckOverviewList
              cards={cards}
              format={deck.format}
              violations={violations}
              ownership={ownershipData}
              showOwnership={ownershipData !== undefined && !signInHref}
              marketplace={marketplace}
              sortBy={listSortBy}
              sortDir={listSortDir}
              groupBy={groupBy}
              groupDir={groupDir}
              statsFocus={statsFocus}
              ownedPrintingFor={ownedPrintingFor}
              resolveHoverPrintingId={resolveHoverPrintingId}
              onZoneClick={onZoneClick}
              onHoverCard={onHoverCard}
              onCardClick={onCardClick}
              draggable={!readOnly}
              tokensSlot={tokensSection}
            />
          ) : (
            <div ref={containerRef} style={cardWidthStyle} className="flex flex-col gap-3">
              {/* Column gap must match the thumb gap (card width derives from it),
                  or a two-card tile comes out short and wraps. */}
              <div className="grid gap-x-1.5 gap-y-3" style={smallZoneTemplateStyle}>
                {SMALL_ZONES.map((zone) => renderZone(zone, smallZoneStyles[zone]))}
              </div>
              <div
                className={
                  displayMode === "stacks"
                    ? "flex flex-wrap items-start gap-x-8 gap-y-3"
                    : "contents"
                }
              >
                {renderZone(WellKnown.deckZone.MAIN)}
                {/* A non-empty sideboard stays visible with its violation even in
                    formats without one, so the cards can be moved out. */}
                {(formatHasSideboard(deck.format) ||
                  cards.some((card) => card.zone === WellKnown.deckZone.SIDEBOARD)) &&
                  renderZone(WellKnown.deckZone.SIDEBOARD)}
                {cards.some((card) => card.zone === WellKnown.deckZone.OVERFLOW) &&
                  renderZone(WellKnown.deckZone.OVERFLOW)}
              </div>
              {tokensSection}
            </div>
          )}
        </div>
      )}

      {showOverviewContent && isMobile && (
        <DeckStatsBand
          cards={cards}
          stats={stats}
          ownershipData={ownershipData}
          ownershipSegmentsByCardKey={ownershipSegmentsByCardKey}
          ownedPrintingFor={ownedPrintingFor}
          enumLabels={enumLabels}
          enumOrders={enumOrders}
          statsFocus={statsFocus}
          applyStatsFocus={applyStatsFocus}
          statsOpen={statsOpen}
          onStatsOpenChange={setStatsOpen}
        />
      )}
    </div>
  );
}
