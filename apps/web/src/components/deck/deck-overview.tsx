import type {
  DeckFormat,
  DeckFormatConfig,
  DeckLink,
  DeckOddsConfig,
  DeckZone,
  Marketplace,
} from "@openrift/shared";
import {
  WellKnown,
  formatHasSideboard,
  imageUrl,
  setIndexById,
  validateDeck,
} from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { DeckBoxTab } from "@/components/deck/deck-box-tab";
import { DeckBuilderIntroBanner } from "@/components/deck/deck-builder-intro-banner";
import { DeckDescription, DeckLinkChips } from "@/components/deck/deck-description";
import { DeckHero } from "@/components/deck/deck-hero";
import {
  DECK_GRID_GAP,
  SMALL_ZONES,
  smallZoneGridStyles,
  UNMEASURED_CARD_WIDTH,
} from "@/components/deck/deck-overview-geometry";
import { DeckOverviewList } from "@/components/deck/deck-overview-list";
import {
  PlanTabActionsContext,
  SECTION_SCROLL_MARGIN,
  TabStrip,
} from "@/components/deck/deck-overview-tabs";
import type { DeckOrderingControls } from "@/components/deck/deck-overview-view-controls";
import {
  DeckOrderingControl,
  DeckOverviewViewControls,
} from "@/components/deck/deck-overview-view-controls";
import { ZoneTile } from "@/components/deck/deck-overview-zone-tile";
import { OwnershipBandSourcesBridge } from "@/components/deck/deck-ownership-bridge";
import { DeckTestBench } from "@/components/deck/deck-test-bench";
import { DeckTokensSection } from "@/components/deck/deck-tokens-section";
import { FormatConfigCard } from "@/components/deck/format-config-card";
import { DeckStatsBand } from "@/components/deck/stats/deck-stats-band";
import { MobileOptionsDrawer } from "@/components/filters/options-bar";
import type { SortGroupOption } from "@/components/filters/sort-group-controls";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCards } from "@/hooks/use-cards";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useDeckStats } from "@/hooks/use-deck-stats";
import { useChampionIdentifierTags, useEnumOrders } from "@/hooks/use-enums";
import { useHomeCollection } from "@/hooks/use-home-collection";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { pricesQueryOptions } from "@/hooks/use-prices";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import type { CardOpenTarget, HoverHandler } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { toRuleEngineCard } from "@/lib/deck-builder-card";
import type { DeckOverviewGroup } from "@/lib/deck-card-group";
import { groupDeckCards } from "@/lib/deck-card-group";
import { formatChancePct } from "@/lib/deck-draw-odds";
import {
  buildAddRoom,
  buildPriceTexts,
  NO_ADD_ROOM,
  NO_BANDS,
  NO_PRICE_TEXTS,
} from "@/lib/deck-overview-derive";
import type { DeckListSortContext } from "@/lib/deck-overview-list-sort";
import { sortDeckOverviewList } from "@/lib/deck-overview-list-sort";
import type { OwnershipBandSources } from "@/lib/deck-ownership-band";
import { buildOwnershipBands } from "@/lib/deck-ownership-band";
import type { StatsFocus } from "@/lib/deck-stats-focus";
import { statsFocusCount, statsFocusLabel, statsFocusOpeningChance } from "@/lib/deck-stats-focus";
import {
  requiredZoneProgress,
  ZONE_LABELS,
  zoneEmptyHint,
  zoneExpected,
} from "@/lib/deck-zone-labels";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";
import { useDeckOverviewViewStore } from "@/stores/deck-overview-view-store";
import { useOnboardingStore } from "@/stores/onboarding-store";

interface DeckOverviewProps {
  deck: {
    id: string;
    name: string;
    format: DeckFormat;
    formatConfig: DeckFormatConfig | null;
    /** Custom cover art; absent or null falls back to the legend. */
    coverCardId?: string | null;
    coverPrintingId?: string | null;
    coverPosition?: number | null;
    /** Outbound links, rendered as chips next to the description. */
    links?: readonly DeckLink[];
    /**
     * The deck's home collection. Its copies count as available for this deck
     * even when the collection is excluded from deck building. Absent on the
     * public share page — it's owner-only.
     */
    collectionId?: string | null;
  };
  cards: DeckBuilderCard[];
  /**
   * Card id → custom-tag slugs. Required so deck-level validation can fire
   * the tag-membership rule for Custom-Region decks. Pass `{}` from contexts
   * where custom tags aren't loaded (e.g. SSR snapshots) — validation will
   * report every card as out-of-region, matching the data we're rendering.
   */
  customTagAssignments: Record<string, readonly string[]>;
  ownershipData?: DeckOwnershipData;
  marketplace: Marketplace;
  /**
   * Resolves a zone-thumbnail URL for a card. Injected so callers can source
   * thumbs either from the live catalog (deck editor) or from a pre-denormalized
   * payload (public share page SSR). Returning `undefined` hides the thumb.
   */
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
  /** Omit on read-only views — zone tiles become non-clickable and edit affordances hide. */
  onZoneClick?: (zone: DeckZone) => void;
  onViewMissing?: () => void;
  onHoverCard?: HoverHandler;
  /** Disables DnD wiring, printing-menu popovers, and edit buttons. */
  readOnly?: boolean;
  /**
   * When set, renders the deck overview for an anonymous viewer: the
   * Ownership tile is replaced with a sign-in CTA linking here, and the
   * Value tile drops its owned/missing overlay. Used by the public share
   * page for logged-out visitors.
   */
  signInHref?: string;
  /** Long-form deck description rendered above the KPI strip. */
  description?: string;
  /**
   * Owner-only: opens the deck-details dialog. When set and a description
   * exists, an Edit affordance renders next to it. Read-only views and local
   * decks (which have no description) omit it.
   */
  onEditDescription?: () => void;
  /** Fired when a card thumbnail is clicked. Opens the detail pane. */
  onCardClick?: (card: CardOpenTarget) => void;
  /**
   * Whether a plan exists. Read-only views only: drives the section nav's Plan
   * entry (linked when present, absent when not; the host renders the plan
   * as the share page's read-only plan view).
   */
  /**
   * Editor only: content of the Plan tab (the plan editor). When omitted the
   * Plan tab is hidden — local decks have no plan.
   */
  planSlot?: React.ReactNode;
  /**
   * Editor only: the variant rail (ADR-042), drawn between the hero and the
   * tab strip. Omitted for local decks and read-only views, neither of which
   * has a variant family to show.
   */
  variantRailSlot?: React.ReactNode;
  /** Forwarded to the hero: owner attribution next to the deck name. */
  heroByline?: React.ReactNode;
  /** Forwarded to the hero: action row under the status chips (copy CTA). */
  heroActions?: React.ReactNode;
  /**
   * A callout about the deck as a whole, rendered between the hero and the tab
   * strip so it stays visible on every tab. The meta archive uses it to say a
   * list is only partly published; nothing else sets it.
   */
  notice?: React.ReactNode;
  /**
   * Per zone, cards the list's source never published. Archive surfaces pass
   * it so a zone the record stops short of renders dashed "Unknown" slots
   * rather than reading as one the player left empty.
   */
  unknownZoneCounts?: ReadonlyMap<DeckZone, number>;
  /**
   * The deck's server-stored draw-odds settings, forwarded to the test bench.
   * Omit for browser-local decks.
   */
  oddsConfig?: DeckOddsConfig | null;
  /** Owner save path for the odds settings; absent on read-only views. */
  onSaveOddsConfig?: (config: DeckOddsConfig) => void;
}

/**
 * Full-width summary shown in the main content area when no deck zone is active.
 * Acts as both a deck dashboard and zone picker — clicking a zone tile drops
 * the user into that zone's card browser. Read-only mode renders the same
 * layout without DnD or edit affordances, for the public share page.
 * @returns The deck overview view.
 */
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
  // Custom cover art bypasses the "show my printings" swap on purpose — the
  // owner picked this exact look. The share page resolves thumbnails by the
  // deck's own (card, printing) pairs, so a pinned cover printing that isn't
  // the deck entry's falls back to the entry's art rather than to the legend.
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

  // View mode (thumbnail grid vs dense list) is a persisted device-local pref.
  // Gate it behind hydration so SSR and the first client render both show the
  // default grid — otherwise a stored "list" pref would flip the tree after
  // hydration and trip a mismatch on the SSR'd public share page.
  const hydrated = useHydrated();
  // The box this deck lives in. Undefined for a viewer who doesn't own the
  // deck — the share page carries no collectionId to resolve.
  const homeCollection = useHomeCollection(deck.collectionId);
  // Drives the phone-specific layout swaps (stats band below the cards, the
  // tab strip's second control row). SSR-safe: false on the server.
  const isMobile = useIsMobile();
  const storedDisplayMode = useDeckOverviewViewStore((state) => state.displayMode);
  const storedColumns = useDeckOverviewViewStore((state) => state.columns);
  const storedPreferOwned = useDeckOverviewViewStore((state) => state.preferOwnedPrintings);
  const storedShowAllCopies = useDeckOverviewViewStore((state) => state.showAllCopies);
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
  const showBands = hydrated ? storedShowBands : true;
  const canPreferOwned = ownershipData !== undefined && !signInHref;
  const preferOwned = hydrated && canPreferOwned && storedPreferOwned;
  // Grouping is hydration-gated like the display mode (SSR renders the type
  // default), and a stored ownership axis quietly falls back to type on
  // surfaces without ownership data (anonymous share views).
  const hydratedGroupBy = hydrated ? storedGroupBy : "type";
  const groupBy: DeckOverviewGroup =
    hydratedGroupBy === "ownership" && !canPreferOwned ? "type" : hydratedGroupBy;
  const groupDir = hydrated ? storedGroupDir : "asc";

  // Card size is a column count here, like every other card surface: the zone
  // stack is measured, the user's override (or the measured Auto) picks the
  // count, and one shared card width falls out of it. It ships as a CSS
  // variable on the content wrapper, so each zone's flex-wrap rows land on the
  // same grid without a size prop threaded through every tile.
  const columnOverride = hydrated ? storedColumns : null;
  const { containerRef, columns, autoColumns, physicalMin, physicalMax, containerWidth, measured } =
    useResponsiveColumns(columnOverride);
  const cardWidth =
    measured && columns > 0 && containerWidth > 0
      ? `${Math.floor((containerWidth - (columns - 1) * DECK_GRID_GAP) / columns)}px`
      : UNMEASURED_CARD_WIDTH;
  const cardWidthStyle = { "--deck-card-w": cardWidth } as React.CSSProperties;
  // Until the container is measured everything stacks in one column, matching
  // the conservative card width above.
  const tileColumns = measured ? columns : 1;
  const smallZoneTemplateStyle: React.CSSProperties = {
    gridTemplateColumns: `repeat(${tileColumns}, minmax(0, 1fr))`,
  };
  const smallZoneStyles = smallZoneGridStyles(tileColumns, displayMode === "stacks");

  // Room left under the copy caps, per entry, for the thumbs' + buttons. Built
  // here rather than per thumb so the zones' `.map()` callbacks close over one
  // stable map; read-only surfaces have no controls to feed.
  const addRoomByCardKey = readOnly ? NO_ADD_ROOM : buildAddRoom(cards, deck.format);

  // Ownership bands need per-printing copy counts and the catalog, neither of
  // which `ownershipData` carries: it has already collapsed both into per-card
  // figures, and one card can sit in a zone as several entries with different
  // pinned printings. Both come from client-only hooks, so a child gathers them
  // (see OwnershipBandSourcesBridge) and lifts one object up — SSR never mounts
  // the subscription.
  const [bandSources, setBandSources] = useState<OwnershipBandSources>();
  // Thumbnail modes only: list mode already spells ownership out as amber
  // fractions. Stacks show the band on each pile's fully-visible card.
  const bandsActive = showBands && canPreferOwned && displayMode !== "list";
  const ownedPrintingByCardId = ownershipData?.ownedPrintingByCardId;
  // Computed whenever the sources are up (not just while bands show): the
  // stats band's ownership lens reads the same split in any display mode.
  const ownershipSegmentsByCardKey =
    canPreferOwned && bandSources
      ? buildOwnershipBands(cards, bandSources, ownedPrintingByCardId, preferOwned)
      : undefined;
  const bandByCardKey =
    bandsActive && ownershipSegmentsByCardKey ? ownershipSegmentsByCardKey : NO_BANDS;

  // Per-thumb price chips, opt-in via the toggle in the view controls. Gated
  // behind hydration through `showPrices`, so SSR always renders without chips.
  // The price map is only needed to price owned printings (non-suspending, same
  // reasoning as the list column); display printings are priced by ownership.
  const showPrices = hydrated && storedShowPrices;
  const { data: priceMap } = useQuery(pricesQueryOptions);
  const priceTextByCardKey =
    showPrices && displayMode !== "list" && ownershipData !== undefined
      ? buildPriceTexts(cards, ownershipData, preferOwned, priceMap, marketplace)
      : NO_PRICE_TEXTS;

  // "Show my printings": swap every deck thumbnail for the canonical printing
  // the viewer actually owns, falling back to the deck's display printing for
  // cards they don't own at all.
  // One resolver behind every "show my printings" swap, so the grid, the hero
  // and the list can't drift apart. Deliberately NOT art-gated: consumers that
  // render an image add that check themselves, while a row's set code, rarity
  // and price follow the owned printing whether or not it has art on file.
  const ownedPrintingFor = (cardId: string) =>
    preferOwned ? ownershipData?.ownedPrintingByCardId.get(cardId) : undefined;

  const resolveThumbnail = (cardId: string, preferredPrintingId: string | null) => {
    const owned = ownedPrintingFor(cardId);
    if (owned?.imageId) {
      return imageUrl(owned.imageId, "400w");
    }
    return getThumbnail(cardId, preferredPrintingId);
  };

  // Which printing a hover preview should show. The two hosts resolve the id
  // differently: the editor looks any printing up in the catalog, while the
  // share page reads a payload keyed by the deck's own printings, where an
  // owned printing id finds nothing. So read-only surfaces keep pointing at the
  // entry's own printing rather than losing the preview entirely.
  const resolveHoverPrintingId = (cardId: string, preferredPrintingId: string | null) => {
    const owned = ownedPrintingFor(cardId);
    if (!readOnly && owned?.imageId) {
      return owned.id;
    }
    return preferredPrintingId;
  };

  // The test bench reports plain (card, printing) hovers; resolve the owned
  // printing here so its previews match the thumbnails it renders.
  const hoverBenchCard: HoverHandler | undefined = onHoverCard
    ? (cardId, preferredPrintingId) =>
        cardId
          ? onHoverCard(cardId, resolveHoverPrintingId(cardId, preferredPrintingId ?? null))
          : onHoverCard(null)
    : undefined;

  // One ordering pipeline for the grid and stacks modes, mirroring what the
  // list mode resolves per row: prices and rarities follow the printing on
  // screen (the owned one while "show my printings" is on).
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

  // The axes on offer: ownership only where the viewer's collection is loaded.
  const groupOptions: SortGroupOption<DeckOverviewGroup>[] = [
    { value: "type", label: "Type" },
    { value: "energy", label: "Energy" },
    { value: "domain", label: "Domain" },
    ...(canPreferOwned ? [{ value: "ownership" as const, label: "Ownership" }] : []),
    { value: "none", label: "None" },
  ];

  // Tabs (mock A): Deck | Test | Plan under the hero, on the editor and the
  // read-only share page alike. The active tab lives in the builder UI store
  // so the sidebar's Plan entry (and the share route's #deck-test deep link)
  // can open a tab from outside this component.
  const tab = useDeckBuilderUiStore((state) => state.overviewTab);
  const setTab = useDeckBuilderUiStore((state) => state.setOverviewTab);
  const collapsedZones = useDeckBuilderUiStore((state) => state.collapsedZones);
  const toggleZoneCollapsed = useDeckBuilderUiStore((state) => state.toggleZoneCollapsed);

  // Stats focus: clicking a chart bar narrows the deck view to the cards that
  // bar counts, and clicking the same bar again clears it. Both surfaces put
  // the charts directly above that grid, so the focus always lands in view —
  // no scrolling to chase it.
  const [statsFocus, setStatsFocus] = useState<StatsFocus | null>(null);
  const applyStatsFocus = (focus: StatsFocus) => {
    const isSame =
      statsFocus !== null && statsFocus.kind === focus.kind && statsFocus.value === focus.value;
    setStatsFocus(isSame ? null : focus);
  };
  const focusOpeningChance = statsFocus ? statsFocusOpeningChance(cards, statsFocus) : null;
  // The Plan tab only exists when the host supplies its content. Any tab that
  // isn't available right now — a stale "plan" after switching to a local deck,
  // or a value left over from a tab that no longer exists — falls back to the
  // deck view rather than rendering an empty page.
  const showPlanTab = planSlot !== undefined;
  // The Box tab needs a box to fill and a viewer who owns the copies, so it
  // stays off the share page and off decks that live nowhere.
  const showBoxTab = homeCollection !== undefined && !readOnly;
  const tabAvailable =
    tab === "overview" ||
    tab === "test" ||
    (tab === "plan" && showPlanTab) ||
    (tab === "box" && showBoxTab);
  const activeTab = tabAvailable ? tab : "overview";
  // Where the Plan tab's content parks its action row: the trailing end of the
  // tab strip, the same slot the Deck tab fills with its view controls.
  const [planActionsSlot, setPlanActionsSlot] = useState<HTMLDivElement | null>(null);
  const showOverviewContent = activeTab === "overview";

  // Ordering: the Deck tab's controls and the Box tab's share it, since the
  // box lists the deck in the same order.
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

  // View controls (columns, sort, display options, view toggle) — rendered on
  // the right side of the tab strip row, deck view only. The desktop cluster is
  // wider than a phone screen, so phones get the compact one instead.
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
        showBands={showBands}
        showPrices={showPrices}
        preferOwned={preferOwned}
        canPreferOwned={canPreferOwned}
        hasOwnershipData={ownershipData !== undefined}
      />
    );

  // An empty deck has no list to render, so it falls back to the grid's empty
  // zone tiles whatever the stored mode says.
  const showList = totalCards > 0 && displayMode === "list";

  // Every zone tile takes the same two dozen props — the shared maps, the
  // ordering pipeline, the display mode, the read-only gates. Only the zone
  // itself and the small-zone row's grid placement differ, so the four call
  // sites go through here rather than repeating the block.
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
      showAllCopies={showAllCopies}
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

  // Built once for both display modes, which each drop it into their own flow:
  // the list hands it to DeckOverviewList as a block of the multicolumn run,
  // the grid appends it inside the measured container. Derived from the
  // catalog, which suspends, so it waits for hydration exactly like the
  // ownership-band bridge does.
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
        actions={heroActions}
      />
      {notice}
      {/* Renders nothing for a deck with no variants, so the hero and the tab
          strip keep their usual single gap between them. */}
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
            // The box lists the deck in the same order as the list view, so it
            // carries that ordering control and none of the grid-only ones.
            <DeckOrderingControl ordering={ordering} />
          ) : activeTab === "plan" ? (
            // Host container for the plan editor's own actions (save, clear,
            // dirty badge). It portals into this once the ref lands — see
            // PlanTabActionsContext. Read-only plan views portal nothing.
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
              {/* Only offered once there is something to edit — an empty deck
                  reaches the same dialog from the top bar's menu. */}
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

      {/* Reads the live copies feed, which has no server snapshot, so it waits
          for hydration like the ownership bridge does. */}
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

      {/* One stats band for both modes: the editor's Deck tab and the
          read-only share page render the identical collapsible. On desktop it
          sits directly above the grid its bars filter; on phones the cards
          come first and the band follows them (see below). `#deck-stats`
          stays on it so old deep links still land here. Expanded by default;
          the open state is device-local and hydration-gated, so SSR always
          renders it open. */}
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
              {/* Narrow screens stack the label above its numbers rather than
                  overflowing one long pill — the leading "·" separators only
                  show once the parts share a row. */}
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
              // "Show my printings" reaches the rows through these two: the set
              // code, rarity and price follow the owned printing, and the hover
              // preview shows it where the host can resolve it.
              ownedPrintingFor={ownedPrintingFor}
              resolveHoverPrintingId={resolveHoverPrintingId}
              // Also the list's edit gate: absent on read-only views, so empty
              // zones and their add rows only render in the editor.
              onZoneClick={onZoneClick}
              onHoverCard={onHoverCard}
              onCardClick={onCardClick}
              // Drag between zones, same as the thumbnail grid. The list drops
              // it on phones itself, so this only has to exclude read-only.
              draggable={!readOnly}
              tokensSlot={tokensSection}
            />
          ) : (
            // The measured container for the whole surface: every zone below
            // sizes its thumbs from the --deck-card-w it publishes, so one
            // column count governs the small-zone tiles and the big wraps
            // alike. A zone narrower than one card (a legend tile at five
            // columns) is covered by max-w-full on the thumbs.
            <div ref={containerRef} style={cardWidthStyle} className="flex flex-col gap-3">
              {/* The small zones sit on the same column grid as the cards, so a
                  tile is always a whole number of cards wide — no breakpoint
                  grid handing Runes a third of a row it can't fit two cards in.
                  The column gap must match the gap between thumbs (the card
                  width is derived from it), or a two-card tile would come out a
                  few pixels short and wrap; rows keep the wider gap. */}
              <div className="grid gap-x-1.5 gap-y-3" style={smallZoneTemplateStyle}>
                {SMALL_ZONES.map((zone) => renderZone(zone, smallZoneStyles[zone]))}
              </div>
              {/* Stacks mode: the grouped zones shrink to their piles' width
                  and flow side by side (a 3-pile main next to a 1-pile
                  sideboard); the other modes keep full-width bands. */}
              <div
                className={
                  displayMode === "stacks"
                    ? "flex flex-wrap items-start gap-x-8 gap-y-3"
                    : "contents"
                }
              >
                {renderZone(WellKnown.deckZone.MAIN)}
                {/* Formats without a sideboard hide the tile once it's empty; a
            non-empty sideboard (format switch, imported list) stays visible
            with its violation so the cards can be moved out. The /8 target
            only applies where the zone is part of the format. */}
                {(formatHasSideboard(deck.format) ||
                  cards.some((card) => card.zone === WellKnown.deckZone.SIDEBOARD)) &&
                  renderZone(WellKnown.deckZone.SIDEBOARD)}
                {cards.some((card) => card.zone === WellKnown.deckZone.OVERFLOW) &&
                  renderZone(WellKnown.deckZone.OVERFLOW)}
              </div>
              {/* Inside the measured container, as the last band: the token
                  thumbs size themselves from the --deck-card-w it publishes,
                  so they land on the same ladder as every zone above. */}
              {tokensSection}
            </div>
          )}
        </div>
      )}

      {/* Phones: the cards lead and the stats band follows them. */}
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
