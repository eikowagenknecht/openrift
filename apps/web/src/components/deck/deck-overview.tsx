import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import type {
  DeckFormat,
  DeckFormatConfig,
  DeckOddsConfig,
  DeckViolation,
  DeckZone,
  Marketplace,
  PriceLookup,
} from "@openrift/shared";
import {
  EUR_MARKETPLACES,
  WellKnown,
  copyLimitFor,
  formatHasSideboard,
  imageUrl,
  legendDisplayName,
  validateDeck,
} from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  CircleCheckIcon,
  InfoIcon,
  LayersIcon,
  LayoutGridIcon,
  ListIcon,
  DollarSignIcon,
  EuroIcon,
  MinusIcon,
  PinIcon,
  PlusIcon,
  WalletCardsIcon,
  XIcon,
} from "lucide-react";
import { createContext, Suspense, useEffect, useState } from "react";

import { DeckCardPrintingMenu } from "@/components/deck/deck-card-printing-menu";
import type {
  BrowserCardDragData,
  DeckCardDragData,
  DeckDropData,
} from "@/components/deck/deck-dnd-context";
import { DRAG_SOURCE_ZONES } from "@/components/deck/deck-dnd-context";
import { DeckHero } from "@/components/deck/deck-hero";
import { DeckOverviewList, DECK_OVERVIEW_SORT_OPTIONS } from "@/components/deck/deck-overview-list";
import { DeckTestBench } from "@/components/deck/deck-test-bench";
import { FormatConfigCard } from "@/components/deck/format-config-card";
import { EnergyChart, PowerChart } from "@/components/deck/stats/energy-power-chart";
import { LensBar } from "@/components/deck/stats/lens-bar";
import { TypeBreakdown } from "@/components/deck/stats/type-breakdown";
import { ColumnControls } from "@/components/filters/column-controls";
import { SortGroupControls } from "@/components/filters/sort-group-controls";
import { MarkdownText } from "@/components/markdown-text";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCards } from "@/hooks/use-cards";
import { canAddRune, useDeckBuilderActions } from "@/hooks/use-deck-builder";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useDeckStats } from "@/hooks/use-deck-stats";
import { useChampionIdentifierTags, useEnumOrders } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useMeasuredWidth } from "@/hooks/use-measured-width";
import { useDeckBuildingCounts } from "@/hooks/use-owned-count";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { pricesQueryOptions } from "@/hooks/use-prices";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import {
  COPY_LIMIT_ZONES,
  getDeckCardKey,
  isCardAllowedInZone,
  isDeckZoneFullForDrag,
  RUNE_TARGET,
  toRuleEngineCard,
} from "@/lib/deck-builder-card";
import { GROUPED_ZONES, sortOverviewCards, TYPE_GROUP_ORDER } from "@/lib/deck-card-sort";
import { formatChancePct } from "@/lib/deck-draw-odds";
import type { OwnershipBandSegments, OwnershipBandSources } from "@/lib/deck-ownership-band";
import {
  buildOwnershipBands,
  collectOwnershipBandSources,
  ownershipBandTitle,
  sameOwnershipBandSources,
} from "@/lib/deck-ownership-band";
import {
  buildOwnershipRows,
  buildRarityByCardKey,
  buildRarityRows,
  OWNERSHIP_LENS_SERIES,
  ownershipFocusKeys,
  rarityFocusKeys,
  rarityLensSeries,
} from "@/lib/deck-stat-lenses";
import type { StatsFocus } from "@/lib/deck-stats-focus";
import {
  cardMatchesStatsFocus,
  statsFocusCount,
  statsFocusLabel,
  statsFocusOpeningChance,
} from "@/lib/deck-stats-focus";
import {
  requiredZoneProgress,
  ZONE_LABELS,
  zoneEmptyHint,
  zoneEmptyReadOnlyLabel,
  zoneExpected,
} from "@/lib/deck-zone-labels";
import { formatterForMarketplace } from "@/lib/format";
import { getTypeIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { DeckOverviewTab, StatsLens } from "@/stores/deck-builder-ui-store";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";
import { useDeckOverviewViewStore } from "@/stores/deck-overview-view-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useSelectionStore } from "@/stores/selection-store";

const LANDSCAPE_ZONES: ReadonlySet<DeckZone> = new Set([WellKnown.deckZone.BATTLEFIELD]);

// Small-zone row layout:
//  • @lg: 3 columns — Legend / Champion / Runes on row 1, Battlefield on row 2
//  • @5xl: 5 columns — all four on a single row (1+1+1+2)
const SMALL_ZONES: DeckZone[] = [
  WellKnown.deckZone.LEGEND,
  WellKnown.deckZone.CHAMPION,
  WellKnown.deckZone.RUNES,
  WellKnown.deckZone.BATTLEFIELD,
];
// Every thumb on the surface is one card wide. The width is measured once for
// the whole overview and published as --deck-card-w on the content wrapper, so
// a zone's flex-wrap rows land on the column grid without any zone needing to
// know the count. Gap between thumbs (gap-1.5) — the card width is derived from
// it, so the two must stay in step.
const DECK_GRID_GAP = 6;
// Width until the container has been measured. Small enough that a phone
// always gets two cards per row, so the SSR paint never shows a giant card.
const UNMEASURED_CARD_WIDTH = "min(11rem, 40vw)";
// Portrait thumbs are one card wide; landscape (battlefield) art is rotated, so
// it spans a card's *height* instead — keeping both orientations on the same
// scale, the way the old fixed ladder swapped its axes.
const PORTRAIT_THUMB_STYLE: React.CSSProperties = { width: "var(--deck-card-w)" };
const LANDSCAPE_THUMB_STYLE: React.CSSProperties = {
  width: "calc(var(--deck-card-w) * 88 / 63)",
};
/** Aspect classes matching the two thumb styles above. */
const PORTRAIT_THUMB_CLASS = "aspect-card max-w-full";
const LANDSCAPE_THUMB_CLASS = "aspect-[88/63] max-w-full";

/** Stable empty map for the thumbs when ownership bands are off or unloaded. */
const NO_BANDS: ReadonlyMap<string, OwnershipBandSegments> = new Map();

/** Stable empty map for the thumbs while the price chips are off. */
const NO_PRICE_TEXTS: ReadonlyMap<string, string> = new Map();

/** Stable empty list so the focused-stats pass doesn't recompute when nothing is focused. */
const NO_CARDS: DeckBuilderCard[] = [];

/**
 * Zones whose thumbs get the full − / N / + stepper. The rest hold exactly one
 * card (legend, champion) or one copy per card (battlefield), so their only
 * edit is removal.
 */
const STEPPER_ZONES: ReadonlySet<DeckZone> = new Set([
  WellKnown.deckZone.RUNES,
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.OVERFLOW,
]);

/** Stable empty map for read-only surfaces, which never show the stepper. */
const NO_ADD_ROOM: ReadonlyMap<string, number> = new Map();

/**
 * Copies each entry's + button can still add before the format's caps stop it,
 * keyed by {@link getDeckCardKey}. `Infinity` where nothing caps the zone.
 * Mirrors the checks `addCardAction` makes so the button can disable itself
 * rather than silently doing nothing, and so shift-click knows how many copies
 * "fill up" means.
 * @returns Deck card key → copies the + button may still add.
 */
function buildAddRoom(cards: DeckBuilderCard[], format: DeckFormat): Map<string, number> {
  const room = new Map<string, number>();
  // Freeform validates nothing, so every zone stays open.
  const freeform = format === WellKnown.deckFormat.FREEFORM;
  const runeTotal = cards.reduce(
    (sum, card) => (card.zone === WellKnown.deckZone.RUNES ? sum + card.quantity : sum),
    0,
  );
  for (const card of cards) {
    const key = getDeckCardKey(card);
    if (freeform || !STEPPER_ZONES.has(card.zone)) {
      room.set(key, Number.POSITIVE_INFINITY);
      continue;
    }
    if (card.zone === WellKnown.deckZone.RUNES) {
      // At the 12-rune target `canAddRune` still allows a swap on a two-domain
      // legend, which is one copy at a time rather than a bulk fill.
      room.set(key, canAddRune(card, cards) ? Math.max(1, RUNE_TARGET - runeTotal) : 0);
      continue;
    }
    if (COPY_LIMIT_ZONES.has(card.zone)) {
      const held = cards.reduce(
        (sum, entry) =>
          entry.cardId === card.cardId && COPY_LIMIT_ZONES.has(entry.zone)
            ? sum + entry.quantity
            : sum,
        0,
      );
      room.set(key, Math.max(0, copyLimitFor(card) - held));
      continue;
    }
    // Overflow parks cards without a cap.
    room.set(key, Number.POSITIVE_INFINITY);
  }
  return room;
}

/**
 * Preformatted per-copy price for each entry, keyed by {@link getDeckCardKey}.
 * Resolution mirrors the list rows: the owned printing's price while "show my
 * printings" is on (falling back to the display price until the price map
 * lands), the entry's display printing otherwise.
 * @returns Deck card key → formatted price string.
 */
function buildPriceTexts(
  cards: DeckBuilderCard[],
  ownershipData: DeckOwnershipData,
  preferOwned: boolean,
  priceMap: PriceLookup | undefined,
  marketplace: Marketplace,
): Map<string, string> {
  const fmtPrice = formatterForMarketplace(marketplace);
  const texts = new Map<string, string>();
  for (const card of cards) {
    const owned = preferOwned ? ownershipData.ownedPrintingByCardId.get(card.cardId) : undefined;
    const entry = ownershipData.byCardZone.get(`${card.cardId}:${card.zone}`);
    const cents = owned && priceMap ? priceMap.get(owned.id, marketplace) : entry?.displayPrice;
    if (cents !== undefined) {
      texts.set(getDeckCardKey(card), fmtPrice(cents));
    }
  }
  return texts;
}

/**
 * The Plan tab's action slot in the tab strip. The tab's content (the plan
 * editor) portals its save / clear controls in here so they share the tab row
 * with the other tabs' trailing controls instead of stacking a second bar
 * underneath. `null` means the host's slot hasn't attached yet (render
 * nothing); the `undefined` default means there is no host at all, so a
 * standalone consumer keeps its actions inline.
 */
export const PlanTabActionsContext = createContext<HTMLElement | null | undefined>(undefined);

/**
 * Grid placement for the small-zone row, on the same column grid the cards use.
 * Legend and champion are one card wide. Runes claims whatever it takes to keep
 * its two cards side by side: from four columns up it shares row one (leaving
 * exactly one card each for legend and champion), below that it takes a row of
 * its own — at three columns that leaves one cell empty after champion, which
 * beats stacking the runes. Battlefields always get a full-width band, since
 * three landscape cards never fit a narrow cell.
 * @returns Per-zone `style` objects for the tiles.
 */
function smallZoneGridStyles(columns: number): Partial<Record<DeckZone, React.CSSProperties>> {
  const runeSpan = columns >= 4 ? columns - 2 : columns;
  return {
    legend: { gridColumn: "span 1 / span 1" },
    champion: { gridColumn: "span 1 / span 1" },
    runes: { gridColumn: `span ${runeSpan} / span ${runeSpan}` },
    battlefield: { gridColumn: "1 / -1" },
  };
}

interface DeckOverviewProps {
  deck: { id: string; name: string; format: DeckFormat; formatConfig: DeckFormatConfig | null };
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
  onHoverCard?: (cardId: string | null, preferredPrintingId?: string | null) => void;
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
  /** Fired when a card thumbnail is clicked. Opens the detail pane. */
  onCardClick?: (card: DeckBuilderCard) => void;
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
  /** Forwarded to the hero: owner attribution next to the deck name. */
  heroByline?: React.ReactNode;
  /** Forwarded to the hero: action row under the status chips (copy CTA). */
  heroActions?: React.ReactNode;
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
  onCardClick,
  planSlot,
  heroByline,
  heroActions,
  oddsConfig,
  onSaveOddsConfig,
}: DeckOverviewProps) {
  const championIdentifierTags = useChampionIdentifierTags();
  const { labels: enumLabels, orders: enumOrders } = useEnumOrders();
  const violations = validateDeck({
    format: deck.format,
    formatConfig: deck.formatConfig,
    cards: cards.map((card) => toRuleEngineCard(card, customTagAssignments)),
    championIdentifierTags,
  });
  const stats = useDeckStats(cards);

  const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);
  const { progress: requiredProgress, total: requiredTotal } = requiredZoneProgress(
    cards,
    deck.format,
  );
  const legendCard = cards.find((card) => card.zone === WellKnown.deckZone.LEGEND);
  const championCard = cards.find((card) => card.zone === WellKnown.deckZone.CHAMPION);
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
  // Drives the phone-specific layout swaps (stats band below the cards, the
  // tab strip's second control row). SSR-safe: false on the server.
  const isMobile = useIsMobile();
  const storedDisplayMode = useDeckOverviewViewStore((state) => state.displayMode);
  const storedColumns = useDeckOverviewViewStore((state) => state.columns);
  const storedPreferOwned = useDeckOverviewViewStore((state) => state.preferOwnedPrintings);
  const setPreferOwnedPrintings = useDeckOverviewViewStore(
    (state) => state.setPreferOwnedPrintings,
  );
  const storedShowAllCopies = useDeckOverviewViewStore((state) => state.showAllCopies);
  const setShowAllCopies = useDeckOverviewViewStore((state) => state.setShowAllCopies);
  const listSortBy = useDeckOverviewViewStore((state) => state.sortBy);
  const listSortDir = useDeckOverviewViewStore((state) => state.sortDir);
  const setDisplayMode = useDeckOverviewViewStore((state) => state.setDisplayMode);
  const setColumns = useDeckOverviewViewStore((state) => state.setColumns);
  const setSortBy = useDeckOverviewViewStore((state) => state.setSortBy);
  const setSortDir = useDeckOverviewViewStore((state) => state.setSortDir);
  const storedStatsOpen = useDeckOverviewViewStore((state) => state.statsOpen);
  const setStatsOpen = useDeckOverviewViewStore((state) => state.setStatsOpen);
  const storedShowBands = useDeckOverviewViewStore((state) => state.showOwnershipBands);
  const setShowOwnershipBands = useDeckOverviewViewStore((state) => state.setShowOwnershipBands);
  const storedShowPrices = useDeckOverviewViewStore((state) => state.showPrices);
  const setShowPrices = useDeckOverviewViewStore((state) => state.setShowPrices);
  const displayMode = hydrated ? storedDisplayMode : "grid";
  const statsOpen = hydrated ? storedStatsOpen : true;
  const showAllCopies = hydrated && storedShowAllCopies;
  const showBands = hydrated ? storedShowBands : true;
  const canPreferOwned = ownershipData !== undefined && !signInHref;
  const preferOwned = hydrated && canPreferOwned && storedPreferOwned;

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
  const smallZoneStyles = smallZoneGridStyles(tileColumns);

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
  // Grid only: list mode already spells ownership out as amber fractions.
  const bandsActive = showBands && canPreferOwned && displayMode === "grid";
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
  // The toggle's icon speaks the marketplace's currency.
  const PriceToggleIcon = EUR_MARKETPLACES.has(marketplace) ? EuroIcon : DollarSignIcon;
  const { data: priceMap } = useQuery(pricesQueryOptions);
  const priceTextByCardKey =
    showPrices && displayMode === "grid" && ownershipData !== undefined
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
  const hasMultiTypeCards = cards.some(
    (card) =>
      (card.zone === WellKnown.deckZone.MAIN || card.zone === WellKnown.deckZone.CHAMPION) &&
      card.cardTypes.length > 1,
  );
  // The Plan tab only exists when the host supplies its content. Any tab that
  // isn't available right now — a stale "plan" after switching to a local deck,
  // or a value left over from a tab that no longer exists — falls back to the
  // deck view rather than rendering an empty page.
  const showPlanTab = planSlot !== undefined;
  const tabAvailable = tab === "overview" || tab === "test" || (tab === "plan" && showPlanTab);
  const activeTab = tabAvailable ? tab : "overview";
  // Where the Plan tab's content parks its action row: the trailing end of the
  // tab strip, the same slot the Deck tab fills with its view controls.
  const [planActionsSlot, setPlanActionsSlot] = useState<HTMLDivElement | null>(null);
  const showOverviewContent = activeTab === "overview";
  const hasStats =
    stats.energyCurve.length > 0 || stats.powerCurve.length > 0 || stats.typeBreakdown.length > 0;

  // Cards matching the active focus, run through the same stats pipeline. The
  // two charts the focus doesn't belong to use these counts to keep the
  // matching part of every column lit and fade the rest, so a focus reads as
  // a cross-filter rather than "the other charts are switched off".
  const focusedCards = statsFocus
    ? cards.filter((card) => cardMatchesStatsFocus(card, statsFocus))
    : NO_CARDS;
  const focusedStats = useDeckStats(focusedCards);

  // Rarity lens: the rarity each row stands for (owned printing while "show my
  // printings" is on, display printing otherwise — same resolution as the list
  // rows), one column per rarity in the rarity icons' colors.
  const rarityByCardKey = ownershipData
    ? buildRarityByCardKey(
        cards,
        (card) =>
          (
            ownedPrintingFor(card.cardId) ??
            ownershipData.byCardZone.get(`${card.cardId}:${card.zone}`)?.displayPrinting
          )?.rarity,
      )
    : undefined;
  const rarityRows = rarityByCardKey
    ? buildRarityRows(cards, rarityByCardKey, enumOrders.rarities, enumLabels.rarities)
    : undefined;
  const raritySeries = rarityRows ? rarityLensSeries(rarityRows, enumLabels.rarities) : [];
  const rarityHitRows =
    statsFocus && statsFocus.kind !== "rarity" && rarityByCardKey
      ? buildRarityRows(focusedCards, rarityByCardKey, enumOrders.rarities, enumLabels.rarities)
      : undefined;

  // Ownership lens: the deck's copies split owned / other printing / missing,
  // from the same per-entry segments the thumbnails' bands draw.
  const ownershipRows = ownershipSegmentsByCardKey
    ? buildOwnershipRows(cards, ownershipSegmentsByCardKey)
    : undefined;
  const ownershipHitRows =
    statsFocus && statsFocus.kind !== "ownership" && ownershipSegmentsByCardKey
      ? buildOwnershipRows(focusedCards, ownershipSegmentsByCardKey)
      : undefined;

  // Stats band layout: measured, not breakpoint-guessed. When the band is
  // wide enough for every chart on one row, all five render side by side
  // (energy/power on wider tracks). Otherwise the band keeps its three slots
  // and the third cycles Types / Rarity / Collection via the lens switcher.
  const [statsChartsEl, setStatsChartsEl] = useState<HTMLDivElement | null>(null);
  const statsChartsWidth = useMeasuredWidth(statsChartsEl);
  const rarityLensAvailable = rarityRows !== undefined && rarityRows.length > 0;
  const ownershipLensAvailable = ownershipRows !== undefined;
  const lensOptions: { key: StatsLens; label: string }[] = [
    ...(stats.typeBreakdown.length > 0 ? [{ key: "types" as const, label: "Types" }] : []),
    ...(rarityLensAvailable ? [{ key: "rarity" as const, label: "Rarity" }] : []),
    ...(ownershipLensAvailable ? [{ key: "ownership" as const, label: "Collection" }] : []),
  ];
  const storedStatsLens = useDeckBuilderUiStore((state) => state.statsLens);
  const setStatsLens = useDeckBuilderUiStore((state) => state.setStatsLens);
  // An unavailable stored choice (deck switch, signed-out view) falls back to
  // the first lens that exists rather than an empty slot.
  const statsLens = lensOptions.some((option) => option.key === storedStatsLens)
    ? storedStatsLens
    : (lensOptions[0]?.key ?? "types");
  // Per-chart minimum widths the one-row layout must fit (the curves need
  // room for their many columns, the categorical charts for three to five).
  const chartTracks = [
    { present: stats.energyCurve.length > 0, track: "1.5fr", minWidth: 260 },
    { present: stats.powerCurve.length > 0, track: "1.5fr", minWidth: 260 },
    { present: stats.typeBreakdown.length > 0, track: "1fr", minWidth: 170 },
    // Rarity and Collection render as thin bars and share one column.
    { present: rarityLensAvailable || ownershipLensAvailable, track: "1fr", minWidth: 200 },
  ].filter((chart) => chart.present);
  // Wide mode separates cells with a centered hairline: pr-5 + border + pl-5.
  const statsGap = 40;
  const wideMinWidth =
    chartTracks.reduce((sum, chart) => sum + chart.minWidth, 0) +
    (chartTracks.length - 1) * statsGap;
  const hasLensCharts = lensOptions.length > 1;
  const wideStats = hasLensCharts && statsChartsWidth >= wideMinWidth;

  const typesChart = (withHeading: boolean) =>
    stats.typeBreakdown.length > 0 ? (
      <TypeBreakdown
        data={stats.typeBreakdown}
        domains={stats.typeBreakdownDomains}
        revealDomainsOnHover
        showTotals
        onBarClick={(value) => applyStatsFocus({ kind: "type", value })}
        footnote={hasMultiTypeCards ? "A card with two types counts under both." : undefined}
        focusValue={statsFocus?.kind === "type" ? statsFocus.value : null}
        hitData={statsFocus && statsFocus.kind !== "type" ? focusedStats.typeBreakdown : undefined}
        hideHeading={!withHeading}
      />
    ) : null;

  const rarityChart = (withHeading: boolean) =>
    rarityRows && rarityLensAvailable ? (
      <LensBar
        title={withHeading ? "Rarity" : undefined}
        rows={rarityRows}
        series={raritySeries}
        onSegmentClick={(value) => {
          if (!rarityByCardKey) {
            return;
          }
          applyStatsFocus({
            kind: "rarity",
            value,
            cardKeys: rarityFocusKeys(cards, rarityByCardKey, value),
          });
        }}
        focusValue={statsFocus?.kind === "rarity" ? statsFocus.value : null}
        hitRows={rarityHitRows}
      />
    ) : null;

  const ownershipChart = (withHeading: boolean) =>
    ownershipRows ? (
      <LensBar
        title={withHeading ? "Collection" : undefined}
        rows={ownershipRows}
        series={OWNERSHIP_LENS_SERIES}
        footnote="Counts the main deck and champion against your collection."
        onSegmentClick={(value) => {
          if (!ownershipSegmentsByCardKey) {
            return;
          }
          const ownershipClass = OWNERSHIP_LENS_SERIES.find((series) => series.key === value)?.key;
          if (!ownershipClass) {
            return;
          }
          applyStatsFocus({
            kind: "ownership",
            value: ownershipClass,
            cardKeys: ownershipFocusKeys(cards, ownershipSegmentsByCardKey, ownershipClass),
          });
        }}
        focusValue={statsFocus?.kind === "ownership" ? statsFocus.value : null}
        hitRows={ownershipHitRows}
      />
    ) : null;

  // The deck's curves and lenses, rendered bare (no cards): the band's
  // hairline header is the only chrome. The focused chart dims its
  // non-matching columns via focusValue; every other chart splits its
  // segments into the focus-matching part (lit) and the rest (faded).
  const energyChartNode =
    stats.energyCurve.length > 0 ? (
      <EnergyChart
        data={stats.energyCurve}
        stacks={stats.energyCurveStacks}
        average={stats.averageEnergy}
        // Domain color is Power's story (runes pay power); here the split
        // only shows on the hovered column, so the two curves read apart.
        revealDomainsOnHover
        footnote="Counts the main deck and champion only. Click a bar to see its cards."
        showTotals
        onBarClick={(value) => applyStatsFocus({ kind: "energy", value })}
        focusValue={statsFocus?.kind === "energy" ? statsFocus.value : null}
        hitData={statsFocus && statsFocus.kind !== "energy" ? focusedStats.energyCurve : undefined}
      />
    ) : null;

  const powerChartNode =
    stats.powerCurve.length > 0 ? (
      <PowerChart
        data={stats.powerCurve}
        stacks={stats.powerCurveStacks}
        average={stats.averagePower}
        showTotals
        onBarClick={(value) => applyStatsFocus({ kind: "power", value })}
        focusValue={statsFocus?.kind === "power" ? statsFocus.value : null}
        hitData={statsFocus && statsFocus.kind !== "power" ? focusedStats.powerCurve : undefined}
      />
    ) : null;

  // Wide mode's one-row cells, in track order, dropped where a chart has no
  // data — the track list above filters on the same conditions. The two lens
  // bars stack inside one cell, top-aligned against the taller charts.
  const lensBarsNode =
    rarityLensAvailable || ownershipLensAvailable ? (
      <div className="flex flex-col gap-4">
        {rarityChart(true)}
        {ownershipChart(true)}
      </div>
    ) : null;
  const wideCells = [
    { key: "energy", node: energyChartNode },
    { key: "power", node: powerChartNode },
    { key: "types", node: typesChart(true) },
    { key: "lenses", node: lensBarsNode },
  ].filter((cell) => cell.node !== null);

  // Narrow mode's third slot: the lens switcher, or the single remaining
  // chart when there's nothing to cycle through.
  const thirdSlotNode = hasLensCharts ? (
    <div>
      {/* Same grammar as the charts' own heading rows, with the active
          lens standing where the h4 would be. */}
      <div className="mb-1 flex items-center gap-3 text-xs">
        {lensOptions.map((option) => (
          <Pressable
            key={option.key}
            onClick={() => setStatsLens(option.key)}
            aria-pressed={statsLens === option.key}
            className={cn(
              "font-medium transition-colors",
              statsLens !== option.key && "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </Pressable>
        ))}
      </div>
      {statsLens === "types"
        ? typesChart(false)
        : statsLens === "rarity"
          ? rarityChart(false)
          : ownershipChart(false)}
    </div>
  ) : (
    (typesChart(true) ?? rarityChart(true) ?? ownershipChart(true))
  );
  const narrowCells = [
    { key: "energy", node: energyChartNode },
    { key: "power", node: powerChartNode },
    { key: "slot", node: thirdSlotNode },
  ].filter((cell) => cell.node !== null);

  // The deck's curves and lenses, rendered bare (no cards): the band's
  // hairline header is the only chrome. The focused chart dims its
  // non-matching columns via focusValue; every other chart splits its
  // segments into the focus-matching part (lit) and the rest (faded).
  const statsCharts = (
    <div
      ref={setStatsChartsEl}
      className={cn("grid gap-y-4", !wideStats && "@lg:grid-cols-2 @3xl:grid-cols-3")}
      style={
        wideStats
          ? { gridTemplateColumns: chartTracks.map((chart) => chart.track).join(" ") }
          : undefined
      }
    >
      {wideStats
        ? wideCells.map((cell, index) => (
            <div
              key={cell.key}
              className={cn(
                "min-w-0",
                // Hairline dividers centered in the gaps — the frameless
                // charts otherwise run into each other on one row.
                index > 0 && "border-l pl-5",
                index < wideCells.length - 1 && "pr-5",
              )}
            >
              {cell.node}
            </div>
          ))
        : narrowCells.map((cell, index) => (
            <div
              key={cell.key}
              className={cn(
                "min-w-0",
                // Same dividers, applied only where the responsive grid puts
                // two cells side by side: the second cell borders from two
                // columns up, the third only in the three-column layout (at
                // two columns it starts its own row).
                index === 0 && "@lg:pr-5",
                index === 1 && "@lg:border-l @lg:pl-5 @3xl:pr-5",
                index === 2 && "@3xl:border-l @3xl:pl-5",
              )}
            >
              {cell.node}
            </div>
          ))}
    </div>
  );

  // The collapsible band hosting the charts; rendered above the grid on
  // desktop and below it on phones (one instance either way).
  const statsBand = hasStats ? (
    <div
      id="deck-stats"
      style={{ scrollMarginTop: SECTION_SCROLL_MARGIN }}
      className="flex flex-col gap-3"
    >
      <div className="flex h-6 items-center gap-2 border-b">
        <ExpandToggle
          expanded={statsOpen}
          chevronClassName="size-3.5"
          onClick={() => setStatsOpen(!statsOpen)}
          className="text-muted-foreground hover:text-foreground flex-1 transition-colors"
        >
          <span className="text-2xs font-semibold tracking-widest uppercase">Stats</span>
        </ExpandToggle>
      </div>
      {statsOpen && statsCharts}
    </div>
  ) : null;

  // View controls (columns, list sort, grid/list toggle) — rendered on the
  // right side of the tab strip / section nav row, deck view only.
  const viewControls = totalCards > 0 && (
    <div className="flex items-center gap-2">
      {displayMode === "grid" && (
        // Same control the card browser and deck check use: fewer columns means
        // bigger cards, and the middle label resets to the measured Auto.
        <ColumnControls
          compact
          maxColumns={columnOverride}
          autoColumns={autoColumns}
          minColumns={physicalMin}
          maxColumnsLimit={physicalMax}
          onMaxColumnsChange={setColumns}
        />
      )}
      {displayMode === "grid" && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={showAllCopies ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label="Show every copy"
                aria-pressed={showAllCopies}
                onClick={() => setShowAllCopies(!showAllCopies)}
              />
            }
          >
            <LayersIcon className="size-4" />
          </TooltipTrigger>
          <TooltipContent>
            {showAllCopies ? "Showing every copy" : "Show every copy"}
          </TooltipContent>
        </Tooltip>
      )}
      {displayMode === "list" && (
        <SortGroupControls
          sortOptions={DECK_OVERVIEW_SORT_OPTIONS}
          sortBy={listSortBy}
          sortDir={listSortDir}
          onSortByChange={setSortBy}
          onSortDirChange={setSortDir}
        />
      )}
      {displayMode === "grid" && canPreferOwned && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={showBands ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label="Show what you own"
                aria-pressed={showBands}
                onClick={() => setShowOwnershipBands(!showBands)}
              />
            }
          >
            <CircleCheckIcon className="size-4" />
          </TooltipTrigger>
          <TooltipContent>
            Show what you own — green: this printing, blue: another printing
          </TooltipContent>
        </Tooltip>
      )}
      {displayMode === "grid" && ownershipData !== undefined && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={showPrices ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label="Show prices"
                aria-pressed={showPrices}
                onClick={() => setShowPrices(!showPrices)}
              />
            }
          >
            <PriceToggleIcon className="size-4" />
          </TooltipTrigger>
          <TooltipContent>{showPrices ? "Showing prices" : "Show prices"}</TooltipContent>
        </Tooltip>
      )}
      {canPreferOwned && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={preferOwned ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label="Show the printings you own"
                aria-pressed={preferOwned}
                onClick={() => setPreferOwnedPrintings(!preferOwned)}
              />
            }
          >
            <WalletCardsIcon className="size-4" />
          </TooltipTrigger>
          <TooltipContent>
            {preferOwned ? "Showing your printings" : "Show the printings you own"}
          </TooltipContent>
        </Tooltip>
      )}
      <ToggleGroup
        variant="outline"
        spacing={0}
        value={[displayMode]}
        onValueChange={([next]) => {
          if (next === "grid" || next === "list") {
            setDisplayMode(next);
          }
        }}
        aria-label="Deck view"
      >
        <Tooltip>
          <TooltipTrigger render={<ToggleGroupItem value="grid" aria-label="Grid view" />}>
            <LayoutGridIcon className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Grid view</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<ToggleGroupItem value="list" aria-label="List view" />}>
            <ListIcon className="size-4" />
          </TooltipTrigger>
          <TooltipContent>List view</TooltipContent>
        </Tooltip>
      </ToggleGroup>
    </div>
  );

  return (
    <div className="@container flex flex-col gap-6 px-1 pt-3 pb-4">
      {hydrated && canPreferOwned && (
        <Suspense fallback={null}>
          <OwnershipBandSourcesBridge cards={cards} onResult={setBandSources} />
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
        domainDistribution={stats.domainDistribution}
        domainTotal={stats.totalCards}
        ownershipData={ownershipData}
        marketplace={marketplace}
        signInHref={signInHref}
        onViewMissing={onViewMissing}
        onCardClick={onCardClick}
        byline={heroByline}
        actions={heroActions}
      />
      <TabStrip
        tab={activeTab}
        onTabChange={setTab}
        showPlanTab={showPlanTab}
        trailing={
          activeTab === "overview" ? (
            viewControls
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
      {showOverviewContent && description && (
        <MarkdownText text={description} className="text-muted-foreground text-sm" />
      )}
      {showOverviewContent && showIntroBanner && (
        <DeckBuilderIntroBanner format={deck.format} onDismiss={dismissIntro} />
      )}
      {showOverviewContent && fallbackHint && <p className="text-sm">{fallbackHint}</p>}

      {activeTab === "plan" && (
        <PlanTabActionsContext value={planActionsSlot}>{planSlot}</PlanTabActionsContext>
      )}

      {activeTab === "test" && (
        <DeckTestBench
          cards={cards}
          deckId={deck.id}
          oddsConfig={oddsConfig}
          onSaveOddsConfig={onSaveOddsConfig}
          getThumbnail={resolveThumbnail}
        />
      )}

      {/* One stats band for both modes: the editor's Deck tab and the
          read-only share page render the identical collapsible. On desktop it
          sits directly above the grid its bars filter; on phones the cards
          come first and the band follows them (see below). `#deck-stats`
          stays on it so old deep links still land here. Expanded by default;
          the open state is device-local and hydration-gated, so SSR always
          renders it open. */}
      {showOverviewContent && !isMobile && statsBand}

      {showOverviewContent && (
        <div id="deck-cards" style={{ scrollMarginTop: SECTION_SCROLL_MARGIN }}>
          {statsFocus && (
            <div className="mb-3 flex">
              <span className="border-primary/40 bg-primary/10 inline-flex items-center gap-1.5 rounded-full border py-1 pr-2 pl-3 text-sm">
                {statsFocusLabel(statsFocus, enumLabels.cardTypes, enumLabels.rarities)}
                <span className="text-muted-foreground tabular-nums">
                  · {statsFocusCount(cards, statsFocus)} in deck
                </span>
                {focusOpeningChance !== null && (
                  <span className="text-muted-foreground tabular-nums">
                    · {formatChancePct(focusOpeningChance)} in your opening hand
                  </span>
                )}
                <ChipRemoveButton aria-label="Show all cards" onClick={() => setStatsFocus(null)} />
              </span>
            </div>
          )}
          {totalCards > 0 && displayMode === "list" ? (
            <DeckOverviewList
              cards={cards}
              format={deck.format}
              violations={violations}
              ownership={ownershipData}
              showOwnership={ownershipData !== undefined && !signInHref}
              marketplace={marketplace}
              sortBy={listSortBy}
              sortDir={listSortDir}
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
                {SMALL_ZONES.map((zone) => (
                  <ZoneTile
                    key={zone}
                    deckId={deck.id}
                    collapsedZones={collapsedZones}
                    onToggleCollapsed={toggleZoneCollapsed}
                    stickyHeader={!readOnly}
                    bandByCardKey={bandByCardKey}
                    priceTextByCardKey={priceTextByCardKey}
                    addRoomByCardKey={addRoomByCardKey}
                    resolveHoverPrintingId={resolveHoverPrintingId}
                    showAllCopies={showAllCopies}
                    statsFocus={statsFocus}
                    zone={zone}
                    label={ZONE_LABELS[zone]}
                    cards={cards.filter((card) => card.zone === zone)}
                    allCards={cards}
                    expected={zoneExpected(zone, deck.format)}
                    emptyHint={zoneEmptyHint(zone, deck.format)}
                    format={deck.format}
                    zoneViolations={violations.filter(
                      (violation) => violation.zone === zone && !violation.cardId,
                    )}
                    style={smallZoneStyles[zone]}
                    onClick={onZoneClick ? () => onZoneClick(zone) : undefined}
                    onHoverCard={onHoverCard}
                    getThumbnail={resolveThumbnail}
                    readOnly={readOnly}
                    onCardClick={onCardClick}
                  />
                ))}
              </div>
              <ZoneTile
                deckId={deck.id}
                collapsedZones={collapsedZones}
                onToggleCollapsed={toggleZoneCollapsed}
                stickyHeader={!readOnly}
                bandByCardKey={bandByCardKey}
                priceTextByCardKey={priceTextByCardKey}
                addRoomByCardKey={addRoomByCardKey}
                resolveHoverPrintingId={resolveHoverPrintingId}
                showAllCopies={showAllCopies}
                statsFocus={statsFocus}
                zone={WellKnown.deckZone.MAIN}
                label={ZONE_LABELS.main}
                cards={cards.filter((card) => card.zone === WellKnown.deckZone.MAIN)}
                allCards={cards}
                expected={zoneExpected(WellKnown.deckZone.MAIN, deck.format)}
                emptyHint={zoneEmptyHint(WellKnown.deckZone.MAIN, deck.format)}
                format={deck.format}
                zoneViolations={violations.filter(
                  (violation) => violation.zone === WellKnown.deckZone.MAIN && !violation.cardId,
                )}
                onClick={onZoneClick ? () => onZoneClick(WellKnown.deckZone.MAIN) : undefined}
                onHoverCard={onHoverCard}
                getThumbnail={resolveThumbnail}
                readOnly={readOnly}
                onCardClick={onCardClick}
              />
              {/* Formats without a sideboard hide the tile once it's empty; a
            non-empty sideboard (format switch, imported list) stays visible
            with its violation so the cards can be moved out. The /8 target
            only applies where the zone is part of the format. */}
              {(formatHasSideboard(deck.format) ||
                cards.some((card) => card.zone === WellKnown.deckZone.SIDEBOARD)) && (
                <ZoneTile
                  deckId={deck.id}
                  collapsedZones={collapsedZones}
                  onToggleCollapsed={toggleZoneCollapsed}
                  stickyHeader={!readOnly}
                  bandByCardKey={bandByCardKey}
                  priceTextByCardKey={priceTextByCardKey}
                  addRoomByCardKey={addRoomByCardKey}
                  resolveHoverPrintingId={resolveHoverPrintingId}
                  showAllCopies={showAllCopies}
                  statsFocus={statsFocus}
                  zone={WellKnown.deckZone.SIDEBOARD}
                  label={ZONE_LABELS.sideboard}
                  cards={cards.filter((card) => card.zone === WellKnown.deckZone.SIDEBOARD)}
                  allCards={cards}
                  expected={zoneExpected(WellKnown.deckZone.SIDEBOARD, deck.format)}
                  emptyHint={zoneEmptyHint(WellKnown.deckZone.SIDEBOARD, deck.format)}
                  format={deck.format}
                  zoneViolations={violations.filter(
                    (violation) =>
                      violation.zone === WellKnown.deckZone.SIDEBOARD && !violation.cardId,
                  )}
                  onClick={
                    onZoneClick ? () => onZoneClick(WellKnown.deckZone.SIDEBOARD) : undefined
                  }
                  onHoverCard={onHoverCard}
                  getThumbnail={resolveThumbnail}
                  readOnly={readOnly}
                  onCardClick={onCardClick}
                />
              )}
              {cards.some((card) => card.zone === WellKnown.deckZone.OVERFLOW) && (
                <ZoneTile
                  deckId={deck.id}
                  collapsedZones={collapsedZones}
                  onToggleCollapsed={toggleZoneCollapsed}
                  stickyHeader={!readOnly}
                  bandByCardKey={bandByCardKey}
                  priceTextByCardKey={priceTextByCardKey}
                  addRoomByCardKey={addRoomByCardKey}
                  resolveHoverPrintingId={resolveHoverPrintingId}
                  showAllCopies={showAllCopies}
                  statsFocus={statsFocus}
                  zone={WellKnown.deckZone.OVERFLOW}
                  label={ZONE_LABELS.overflow}
                  cards={cards.filter((card) => card.zone === WellKnown.deckZone.OVERFLOW)}
                  allCards={cards}
                  expected={zoneExpected(WellKnown.deckZone.OVERFLOW, deck.format)}
                  emptyHint={zoneEmptyHint(WellKnown.deckZone.OVERFLOW, deck.format)}
                  format={deck.format}
                  zoneViolations={violations.filter(
                    (violation) =>
                      violation.zone === WellKnown.deckZone.OVERFLOW && !violation.cardId,
                  )}
                  onClick={onZoneClick ? () => onZoneClick(WellKnown.deckZone.OVERFLOW) : undefined}
                  onHoverCard={onHoverCard}
                  getThumbnail={resolveThumbnail}
                  readOnly={readOnly}
                  onCardClick={onCardClick}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Phones: the cards lead and the stats band follows them. */}
      {showOverviewContent && isMobile && statsBand}
    </div>
  );
}

/**
 * Client-only sibling that gathers everything the ownership bands need — the
 * viewer's deck-building copy counts plus the catalog's printings — and
 * publishes them as one object. The counts come from a `useLiveQuery` (no
 * server snapshot) and the catalog suspends, so this lives in a child the
 * overview mounts only after hydration, inside a Suspense boundary; the shell
 * itself stays SSR-safe. "Available" (not raw owned) is the right figure here:
 * copies in collections excluded from deck building can't be sleeved tonight.
 * @returns null — the lookups flow through `onResult`.
 */
function OwnershipBandSourcesBridge({
  cards,
  onResult,
}: {
  cards: DeckBuilderCard[];
  onResult: React.Dispatch<React.SetStateAction<OwnershipBandSources | undefined>>;
}) {
  const { printingsByCardId } = useCards();
  const { getPreferredPrinting } = usePreferredPrinting();
  const { data } = useDeckBuildingCounts(true);
  const available = data?.available;
  const sources = available
    ? collectOwnershipBandSources(cards, printingsByCardId, getPreferredPrinting, available)
    : undefined;
  useEffect(() => {
    onResult((previous) => (sameOwnershipBandSources(previous, sources) ? previous : sources));
  }, [sources, onResult]);
  return null;
}

/**
 * Anchor offset for the in-page anchors (#deck-stats, #deck-cards): the
 * sticky chain (header + page top bar, published as --sticky-top by the
 * hosts) plus breathing room.
 */
const SECTION_SCROLL_MARGIN = "calc(var(--sticky-top, 57px) + 3.5rem)";

/**
 * Editor tab strip under the hero (mock A): Deck | Stats | Test | Plan, with
 * the accent underline marking the active tab. The Plan tab hosts the plan
 * editor itself, so every tab is a real destination.
 * @returns The tab strip.
 */
function TabStrip({
  tab,
  onTabChange,
  showPlanTab,
  trailing,
}: {
  tab: DeckOverviewTab;
  onTabChange: (tab: DeckOverviewTab) => void;
  showPlanTab: boolean;
  /** Right-aligned controls sharing the row (view toggles on the Deck tab). */
  trailing?: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const tabClass = (active: boolean) =>
    cn(
      "-mb-px border-b-2 pb-2 text-sm font-medium transition-colors",
      active
        ? "border-primary text-foreground"
        : "text-muted-foreground hover:text-foreground border-transparent",
    );
  // Same vocabulary as the share page's section nav — the two surfaces must not
  // name the same things differently. The charts have no tab of their own: they
  // sit inside the Deck tab, above the grid their bars filter.
  // Phones get the trailing controls on their own row below the tabs — sharing
  // the row makes the strip wider than the screen. Rendered once either way
  // (the Plan tab's trailing is a portal target, so it must never duplicate).
  const strip = (
    // items-end keeps the tab underlines glued to the rule; the fixed height
    // reserves the trailing controls' room on every tab, so switching from
    // Deck (which has them) to Test/Plan doesn't shift the layout.
    <div role="tablist" aria-label="Deck views" className="flex h-10 items-end gap-6 border-b">
      <Pressable
        role="tab"
        aria-selected={tab === "overview"}
        className={tabClass(tab === "overview")}
        onClick={() => onTabChange("overview")}
      >
        Deck
      </Pressable>
      <Pressable
        role="tab"
        aria-selected={tab === "test"}
        className={tabClass(tab === "test")}
        onClick={() => onTabChange("test")}
      >
        Test
      </Pressable>
      {showPlanTab && (
        <Pressable
          role="tab"
          aria-selected={tab === "plan"}
          className={tabClass(tab === "plan")}
          onClick={() => onTabChange("plan")}
        >
          Plan
        </Pressable>
      )}
      {trailing && !isMobile && (
        <div className="ml-auto flex items-center gap-2 pb-1.5">{trailing}</div>
      )}
    </div>
  );

  if (isMobile && trailing) {
    return (
      <div className="flex flex-col gap-2">
        {strip}
        <div className="flex items-center justify-end gap-2">{trailing}</div>
      </div>
    );
  }
  return strip;
}

/**
 * Expands a zone's cards for rendering: with "show every copy" on, a card held
 * in multiples becomes one entry per physical copy (badge-less); otherwise one
 * entry per card with its ×N badge. `copyIndex` is null for the stacked form.
 * @returns One entry per thumb to render.
 */
function expandCopies(
  cards: DeckBuilderCard[],
  showAllCopies: boolean,
): { card: DeckBuilderCard; copyIndex: number | null }[] {
  if (!showAllCopies) {
    return cards.map((card) => ({ card, copyIndex: null }));
  }
  return cards.flatMap((card): { card: DeckBuilderCard; copyIndex: number | null }[] =>
    card.quantity > 1
      ? Array.from({ length: card.quantity }, (_, copyIndex) => ({ card, copyIndex }))
      : [{ card, copyIndex: null }],
  );
}

interface ZoneTileProps {
  deckId: string;
  /** Deck card key → collection-status band; empty when bands are off. */
  bandByCardKey: ReadonlyMap<string, OwnershipBandSegments>;
  /** Deck card key -> preformatted price chip text; empty when chips are off. */
  priceTextByCardKey: ReadonlyMap<string, string>;
  /** Copies each entry may still add, keyed by deck card key (empty read-only). */
  addRoomByCardKey: ReadonlyMap<string, number>;
  /** Printing id the hover preview should show for an entry. */
  resolveHoverPrintingId: (cardId: string, preferredPrintingId: string | null) => string | null;
  showAllCopies: boolean;
  /** Active stats-chart focus: non-matching thumbs render dimmed. */
  statsFocus: StatsFocus | null;
  zone: DeckZone;
  label: string;
  cards: DeckBuilderCard[];
  allCards: DeckBuilderCard[];
  expected: number | undefined;
  emptyHint: string;
  /** Zones currently collapsed to their header row. */
  collapsedZones: ReadonlySet<DeckZone>;
  /** Toggles a zone's collapsed state (wired to the builder UI store). */
  onToggleCollapsed: (zone: DeckZone) => void;
  /** Editor only: pin the header below the sticky chain while its zone scrolls. */
  stickyHeader?: boolean;
  zoneViolations: DeckViolation[];
  format: DeckFormat;
  className?: string;
  /** Grid placement from the caller (the small-zone row's spans). */
  style?: React.CSSProperties;
  onClick?: () => void;
  onHoverCard?: (cardId: string | null, preferredPrintingId?: string | null) => void;
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
  readOnly?: boolean;
  onCardClick?: (card: DeckBuilderCard) => void;
}

function ZoneTile({
  deckId,
  bandByCardKey,
  priceTextByCardKey,
  addRoomByCardKey,
  resolveHoverPrintingId,
  showAllCopies,
  statsFocus,
  zone,
  label,
  cards,
  allCards,
  expected,
  emptyHint,
  collapsedZones,
  onToggleCollapsed,
  stickyHeader,
  zoneViolations,
  format,
  className,
  style,
  onClick,
  onHoverCard,
  getThumbnail,
  readOnly,
  onCardClick,
}: ZoneTileProps) {
  const hasViolation = zoneViolations.length > 0;
  const collapsed = collapsedZones.has(zone);
  const quantity = cards.reduce((sum, card) => sum + card.quantity, 0);
  const isEmpty = cards.length === 0;
  const isComplete = !hasViolation && expected !== undefined && quantity === expected;
  const isLandscape = LANDSCAPE_ZONES.has(zone);

  // Match the sidebar's sort: grouped zones order by type (Unit → Spell → Gear)
  // and curve (energy → power → name); single-card zones use the API-provided
  // order (alphabetical by card name within the zone).
  const sortedCards = sortOverviewCards(cards, zone);

  // Drop-target wiring — mirrors the logic in deck-zone-section.tsx so the
  // sidebar and overview reject the same drags (copy limit, battlefield
  // dedupe, 12-rune cap, type compatibility).
  const { active } = useDndContext();
  const dragData = active?.data.current as DeckCardDragData | BrowserCardDragData | undefined;
  const draggedCard =
    dragData?.type === "browser-card"
      ? dragData.card
      : dragData?.type === "deck-card"
        ? allCards.find(
            (card) => card.cardId === dragData.cardId && card.zone === dragData.fromZone,
          )
        : undefined;
  const isDragging = active !== null;

  const isZoneFull =
    isDragging && draggedCard
      ? isDeckZoneFullForDrag({
          zone,
          draggedCard,
          fromZone: dragData?.type === "deck-card" ? dragData.fromZone : null,
          allCards,
          format,
        })
      : false;

  const dropDisabled =
    isDragging &&
    draggedCard !== undefined &&
    (!isCardAllowedInZone(draggedCard, zone) || isZoneFull);

  // The zone stays registered as a droppable even when it rejects the dragged
  // card: a disabled droppable leaves collision detection, and a release over
  // it would then read as "dropped outside a zone", which REMOVES a copy (see
  // handleDragEnd). The rejection travels in dropData.disabled instead, like
  // the sidebar's zone sections.
  const dropData: DeckDropData = { type: "deck-zone", zone, disabled: dropDisabled };
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `overview-zone-${zone}`,
    data: dropData,
    disabled: readOnly,
  });

  // T3 "frameless bands": no boxes — a zone is a small-caps label over a
  // hairline rule with its thumbnails beneath. The whole header is the
  // click target for entering the zone (the old corner pencil is gone).
  // Complete zones stay quiet (the green count says it); only problems get
  // an icon.
  const headerLabel = (
    <span className="text-2xs font-semibold tracking-widest uppercase">{label}</span>
  );

  return (
    <div
      ref={readOnly ? undefined : dropRef}
      style={style}
      className={cn(
        "relative flex flex-col gap-2 rounded-lg transition-all",
        !readOnly && isOver && !dropDisabled && "ring-primary/60 ring-2 ring-offset-4",
        !readOnly && dropDisabled && "opacity-40",
        className,
      )}
    >
      {/* Fixed height so the violation icon (a 20px button) can't stretch one
          tile's header past its row-mates' — side-by-side zones keep their
          rules aligned whether or not an issue is showing. */}
      <div
        className={cn(
          "flex h-6 items-center gap-2 border-b",
          // Frosted while pinned, so the cards scrolling underneath don't
          // bleed through the label. z-10 sits under the top bar (z-30).
          stickyHeader && "bg-background/85 sticky z-10 backdrop-blur-sm",
        )}
        style={stickyHeader ? { top: "var(--sticky-top, 57px)" } : undefined}
      >
        <ExpandToggle
          expanded={!collapsed}
          onClick={() => onToggleCollapsed(zone)}
          aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
          chevronClassName="size-3.5"
          className="shrink-0 rounded"
        />
        {onClick && !readOnly ? (
          <Pressable
            onClick={onClick}
            aria-label={`Edit ${label}`}
            className="text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-2 text-left transition-colors"
          >
            {headerLabel}
          </Pressable>
        ) : (
          <span className="text-muted-foreground flex min-w-0 flex-1 items-center gap-2">
            {headerLabel}
          </span>
        )}
        {hasViolation && (
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Show ${label} issues`}
                  className="size-5 shrink-0 rounded"
                />
              }
            >
              <AlertTriangleIcon className="text-destructive size-3.5" />
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-auto max-w-80 p-2">
              <ul className="space-y-0.5">
                {zoneViolations.map((violation) => (
                  <li key={violation.code} className="text-xs">
                    {violation.message}
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        )}
        <span
          className={cn(
            "ml-auto text-xs tabular-nums",
            hasViolation
              ? "text-destructive"
              : isComplete
                ? "text-green-600 dark:text-green-500"
                : "text-muted-foreground",
          )}
        >
          {quantity}
          {expected !== undefined && `/${expected}`}
          {/* "· N more" only for zones with a real target (the sideboard's
              figure is a cap, not a goal) and only once building has started —
              empty zones already carry their hint. */}
          {expected !== undefined &&
            zone !== WellKnown.deckZone.SIDEBOARD &&
            quantity > 0 &&
            quantity < expected && (
              <span className="text-muted-foreground/70"> · {expected - quantity} more</span>
            )}
        </span>
      </div>

      {collapsed ? null : isEmpty ? (
        zone === WellKnown.deckZone.RUNES || readOnly || !onClick ? (
          // Runes fills itself when a Legend is set, so the primary path
          // isn't "click this button" — mirror the CTA styling minus the
          // icon and interactivity; the clickable header covers the rare
          // manual-override case. Read-only views also land here since
          // there's no action to take.
          <div className="text-muted-foreground flex items-center justify-center rounded-md border border-dashed px-3 py-4 text-center">
            {readOnly ? zoneEmptyReadOnlyLabel(zone) : emptyHint}
          </div>
        ) : (
          <Button
            type="button"
            variant="dashed"
            onClick={onClick}
            aria-label={`Edit ${label}`}
            className="h-auto w-full gap-2 rounded-md px-3 py-4 font-normal"
          >
            <PlusIcon className="size-4" />
            <span>{emptyHint}</span>
          </Button>
        )
      ) : GROUPED_ZONES.has(zone) ? (
        <GroupedThumbs
          deckId={deckId}
          bandByCardKey={bandByCardKey}
          priceTextByCardKey={priceTextByCardKey}
          addRoomByCardKey={addRoomByCardKey}
          resolveHoverPrintingId={resolveHoverPrintingId}
          showAllCopies={showAllCopies}
          statsFocus={statsFocus}
          zone={zone}
          cards={sortedCards}
          isLandscape={isLandscape}
          onHoverCard={onHoverCard}
          getThumbnail={getThumbnail}
          readOnly={readOnly}
          onCardClick={onCardClick}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {expandCopies(sortedCards, showAllCopies).map(({ card, copyIndex }) => {
            const thumbnail = getThumbnail(card.cardId, card.preferredPrintingId);
            if (!thumbnail) {
              return null;
            }
            return (
              <ZoneThumb
                key={`${getDeckCardKey(card)}-${copyIndex ?? "stack"}`}
                deckId={deckId}
                card={card}
                band={bandByCardKey.get(getDeckCardKey(card))}
                priceText={priceTextByCardKey.get(getDeckCardKey(card))}
                addRoom={addRoomByCardKey.get(getDeckCardKey(card)) ?? 0}
                hoverPrintingId={resolveHoverPrintingId(card.cardId, card.preferredPrintingId)}
                copyIndex={copyIndex}
                dimmed={statsFocus !== null && !cardMatchesStatsFocus(card, statsFocus)}
                zone={zone}
                thumbnail={thumbnail}
                isLandscape={isLandscape}
                onHoverCard={onHoverCard}
                readOnly={readOnly}
                onCardClick={onCardClick}
              />
            );
          })}
          {/* Partially-filled target zones keep their gap visible: the open
              slot itself is the add affordance, inline where the next card
              will land. */}
          {!readOnly &&
            onClick !== undefined &&
            expected !== undefined &&
            quantity > 0 &&
            quantity < expected && (
              <Button
                type="button"
                variant="dashed"
                onClick={onClick}
                aria-label={`Add to ${label}`}
                style={isLandscape ? LANDSCAPE_THUMB_STYLE : PORTRAIT_THUMB_STYLE}
                className={cn(
                  isLandscape ? LANDSCAPE_THUMB_CLASS : PORTRAIT_THUMB_CLASS,
                  "h-auto shrink-0 flex-col gap-1 rounded-md font-normal",
                )}
              >
                <PlusIcon className="size-4" />
                <span className="text-muted-foreground text-xs">Add</span>
              </Button>
            )}
        </div>
      )}
    </div>
  );
}

/**
 * Renders grouped thumbs for main / sideboard / overflow zones. Each type
 * group (Unit / Spell / Gear / other) gets its own row with an icon + name +
 * count header above a flex-wrap of thumbs, mirroring the sidebar's grouped
 * layout but with thumbnails instead of list rows.
 * @returns Stacked type-group sections.
 */
function GroupedThumbs({
  deckId,
  bandByCardKey,
  priceTextByCardKey,
  addRoomByCardKey,
  resolveHoverPrintingId,
  showAllCopies,
  statsFocus,
  zone,
  cards,
  isLandscape,
  onHoverCard,
  getThumbnail,
  readOnly,
  onCardClick,
}: {
  deckId: string;
  bandByCardKey: ReadonlyMap<string, OwnershipBandSegments>;
  /** Deck card key -> preformatted price chip text; empty when chips are off. */
  priceTextByCardKey: ReadonlyMap<string, string>;
  /** Copies each entry may still add, keyed by deck card key (empty read-only). */
  addRoomByCardKey: ReadonlyMap<string, number>;
  /** Printing id the hover preview should show for an entry. */
  resolveHoverPrintingId: (cardId: string, preferredPrintingId: string | null) => string | null;
  showAllCopies: boolean;
  statsFocus: StatsFocus | null;
  zone: DeckZone;
  cards: DeckBuilderCard[];
  isLandscape: boolean;
  onHoverCard?: (cardId: string | null, preferredPrintingId?: string | null) => void;
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
  readOnly?: boolean;
  onCardClick?: (card: DeckBuilderCard) => void;
}) {
  const { labels } = useEnumOrders();
  const grouped = Map.groupBy(cards, (card) => card.cardType);
  const presentTypes = [
    ...TYPE_GROUP_ORDER.filter((type) => grouped.has(type)),
    // Any card types outside TYPE_GROUP_ORDER still get a row at the end,
    // preserving the deck's sort order.
    ...[...grouped.keys()].filter((type) => !TYPE_GROUP_ORDER.includes(type)),
  ];

  return (
    <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
      {presentTypes.map((type) => {
        const group = grouped.get(type) ?? [];
        const count = group.reduce((sum, card) => sum + card.quantity, 0);
        const iconPath = getTypeIconPath(type, []);
        return (
          <div key={type} className="flex flex-col gap-1.5">
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              {iconPath && (
                <img src={iconPath} alt="" className="size-3.5 brightness-0 dark:invert" />
              )}
              <span className="whitespace-nowrap">
                {labels.cardTypes[type]}s{" "}
                <span className="text-muted-foreground/60">· {count}</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {expandCopies(group, showAllCopies).map(({ card, copyIndex }) => {
                const thumbnail = getThumbnail(card.cardId, card.preferredPrintingId);
                if (!thumbnail) {
                  return null;
                }
                return (
                  <ZoneThumb
                    key={`${getDeckCardKey(card)}-${copyIndex ?? "stack"}`}
                    deckId={deckId}
                    card={card}
                    band={bandByCardKey.get(getDeckCardKey(card))}
                    priceText={priceTextByCardKey.get(getDeckCardKey(card))}
                    addRoom={addRoomByCardKey.get(getDeckCardKey(card)) ?? 0}
                    hoverPrintingId={resolveHoverPrintingId(card.cardId, card.preferredPrintingId)}
                    copyIndex={copyIndex}
                    dimmed={statsFocus !== null && !cardMatchesStatsFocus(card, statsFocus)}
                    zone={zone}
                    thumbnail={thumbnail}
                    isLandscape={isLandscape}
                    onHoverCard={onHoverCard}
                    readOnly={readOnly}
                    onCardClick={onCardClick}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Editor-only controls layered on a deck thumbnail: the copy count grows into a
 * − / N / + cluster where the ×N badge sits, and a remove button takes the
 * opposite corner. Both appear on hover, or stay up on touch, which has no
 * hover — the same rule the sidebar's card rows follow.
 *
 * Its own component for two reasons: the builder-action hooks never mount on
 * read-only surfaces (the share page renders no controls at all), and each
 * thumb owns its handlers instead of the zone's `.map()` closing over a set per
 * card. Undo comes free — every action here records history.
 *
 * @returns The thumbnail's edit controls.
 */
function ThumbEditControls({
  deckId,
  card,
  zone,
  addRoom,
  perCopy,
  alwaysVisible,
}: {
  deckId: string;
  card: DeckBuilderCard;
  zone: DeckZone;
  /** Copies the + button may still add before the format's caps stop it. */
  addRoom: number;
  /** "Show every copy" is on, so this thumb is one physical copy, not the stack. */
  perCopy: boolean;
  /** Touch: nothing to hover, so the controls stay up. */
  alwaysVisible: boolean;
}) {
  const { addCard, removeCard, setQuantity } = useDeckBuilderActions(deckId);
  const cardName = legendDisplayName({
    name: card.cardName,
    types: card.cardTypes,
    tags: card.tags,
  });
  // Per-copy thumbs have no count of their own to step, and the one-card zones
  // (legend, champion, battlefield) can only be emptied.
  const showStepper = !perCopy && STEPPER_ZONES.has(zone);
  const reveal = alwaysVisible ? "flex" : "hidden group-hover/thumb:flex";

  // Every handler stops propagation: the thumb itself opens the card detail on
  // click, and dnd-kit's activation distance handles the drag case.
  const decrement = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (event.shiftKey) {
      setQuantity(card.cardId, zone, 0, card.preferredPrintingId);
      return;
    }
    removeCard(card.cardId, zone, card.preferredPrintingId);
  };

  const increment = (event: React.MouseEvent) => {
    event.stopPropagation();
    // Shift fills the entry up to whatever the caps allow; an uncapped zone has
    // no "max" to fill to, so it stays one copy per click.
    const bulk = event.shiftKey && Number.isFinite(addRoom) && addRoom > 1;
    addCard(card, zone, bulk ? addRoom : 1);
  };

  const remove = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (perCopy) {
      removeCard(card.cardId, zone, card.preferredPrintingId);
      return;
    }
    setQuantity(card.cardId, zone, 0, card.preferredPrintingId);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn(
                "bg-background/80 hover:bg-background absolute top-1 right-1 size-5 rounded",
                reveal,
              )}
              aria-label={perCopy ? `Remove one copy of ${cardName}` : `Remove ${cardName}`}
              onClick={remove}
            />
          }
        >
          <XIcon className="size-3" />
        </TooltipTrigger>
        <TooltipContent>{perCopy ? "Remove this copy" : "Remove from deck"}</TooltipContent>
      </Tooltip>
      {showStepper && (
        // Same chip chrome as the ×N badge it replaces, in the same corner.
        <span
          className={cn(
            "bg-background/90 text-foreground absolute right-1 bottom-1 items-center gap-0.5 rounded-full p-0.5",
            reveal,
          )}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-5"
                  aria-label={`Remove one copy of ${cardName}`}
                  onClick={decrement}
                />
              }
            >
              <MinusIcon className="size-3" />
            </TooltipTrigger>
            <TooltipContent>Shift+click to remove all</TooltipContent>
          </Tooltip>
          <span className="min-w-3 text-center text-xs leading-none font-medium tabular-nums">
            {card.quantity}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-5"
                  disabled={addRoom <= 0}
                  aria-label={`Add one copy of ${cardName}`}
                  onClick={increment}
                />
              }
            >
              <PlusIcon className="size-3" />
            </TooltipTrigger>
            {addRoom > 0 && <TooltipContent>Shift+click to add max</TooltipContent>}
          </Tooltip>
        </span>
      )}
    </>
  );
}

function ZoneThumb({
  deckId,
  card,
  band,
  priceText,
  addRoom,
  hoverPrintingId,
  copyIndex,
  dimmed,
  zone,
  thumbnail,
  isLandscape,
  onHoverCard,
  readOnly,
  onCardClick,
}: {
  deckId: string;
  card: DeckBuilderCard;
  /** How this entry's copies split by collection status; absent when it owns none. */
  band?: OwnershipBandSegments;
  /** Preformatted per-copy price, shown as a chip when the toggle is on. */
  priceText?: string;
  /** Copies this entry may still add before the format's caps stop it. */
  addRoom?: number;
  /** Printing the hover preview shows — the owned one while "show my printings" is on. */
  hoverPrintingId?: string | null;
  /** Set when "show every copy" expanded this thumb: hides the ×N badge. */
  copyIndex?: number | null;
  /** Stats-chart focus active and this card isn't in it — render faded. */
  dimmed?: boolean;
  zone: DeckZone;
  thumbnail: string;
  isLandscape: boolean;
  onHoverCard?: (cardId: string | null, preferredPrintingId?: string | null) => void;
  readOnly?: boolean;
  onCardClick?: (card: DeckBuilderCard) => void;
}) {
  const isMobile = useIsMobile();
  const enableDrag = !readOnly && !isMobile && DRAG_SOURCE_ZONES.has(zone);
  const editable = !readOnly;
  // A pinned (non-default) printing is marked by a small pin in the thumb's
  // top-left corner — quiet enough to sit on the art, and clear of both the
  // ownership band along the bottom edge and the ×N badge at bottom-right.
  const hasCustomPrinting = card.preferredPrintingId !== null;
  // Per-thumb selector: only this thumb re-renders when its selected-state
  // flips. Match on (zone, cardId) so a card in multiple zones lights up
  // only at the instance the user actually clicked.
  const isSelected = useSelectionStore(
    (state) => state.selectedZone === zone && state.selectedCard?.cardId === card.cardId,
  );

  const dragData: DeckCardDragData = {
    type: "deck-card",
    cardId: card.cardId,
    cardName: legendDisplayName({ name: card.cardName, types: card.cardTypes, tags: card.tags }),
    fromZone: zone,
    quantity: card.quantity,
    preferredPrintingId: card.preferredPrintingId,
  };

  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `overview-thumb-${card.cardId}-${zone}-${card.preferredPrintingId ?? "default"}-${copyIndex ?? "stack"}`,
    data: dragData,
    disabled: !enableDrag,
  });

  // A failed thumbnail collapses the thumb entirely — the same behavior as a
  // card with no image (the zone list skips those before rendering ZoneThumb).
  // Keyed by URL so a changed printing pick retries fresh.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  // When onCardClick is provided, the thumb becomes a button: spread role +
  // tabIndex + click/key handlers together so the static analyzer sees a
  // consistent interactive element (no jsx-a11y/no-static-element-interactions
  // false positive from conditional props).
  const interactiveProps: React.HTMLAttributes<HTMLDivElement> = onCardClick
    ? {
        role: "button",
        tabIndex: 0,
        onClick: () => onCardClick(card),
        onKeyDown: (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onCardClick(card);
          }
        },
      }
    : {};

  const thumbBody = (
    // The wrapper (not the img) carries the size so it can be a size container:
    // the badge below is sized in cqw and scales with the thumb at any column
    // count instead of sitting at one fixed step.
    <div
      ref={enableDrag ? setNodeRef : undefined}
      style={isLandscape ? LANDSCAPE_THUMB_STYLE : PORTRAIT_THUMB_STYLE}
      className={cn(
        "group/thumb @container relative shrink-0 rounded-md",
        isLandscape ? LANDSCAPE_THUMB_CLASS : PORTRAIT_THUMB_CLASS,
        enableDrag && "cursor-grab active:cursor-grabbing",
        onCardClick && !enableDrag && "cursor-pointer",
        isDragging && card.quantity === 1 && "opacity-40",
        isSelected && "ring-primary ring-offset-background ring-2 ring-offset-2",
        dimmed && "opacity-25 transition-opacity",
      )}
      onMouseEnter={() => onHoverCard?.(card.cardId, hoverPrintingId ?? card.preferredPrintingId)}
      onMouseLeave={() => onHoverCard?.(null)}
      {...interactiveProps}
      {...(enableDrag ? listeners : {})}
      {...(enableDrag ? attributes : {})}
    >
      <img
        src={thumbnail}
        alt={legendDisplayName({ name: card.cardName, types: card.cardTypes, tags: card.tags })}
        className="h-full w-full rounded-md object-cover shadow-sm"
        draggable={false}
        onError={() => setFailedUrl(thumbnail)}
      />
      {hasCustomPrinting && (
        <span
          title="Pinned printing"
          className="bg-background/70 absolute top-1 left-1 rounded p-0.5"
        >
          <PinIcon className="text-muted-foreground size-2.5" />
        </span>
      )}
      {card.quantity > 1 && (copyIndex === null || copyIndex === undefined) && (
        <span
          className={cn(
            "bg-background/90 text-foreground absolute leading-tight font-medium tabular-nums",
            // Where the controls take over, the badge gives up its corner: on
            // touch straight away, on a pointer once the thumb is hovered.
            editable && (isMobile ? "hidden" : "group-hover/thumb:hidden"),
          )}
          // Card-anchored chrome, not UI text: sized in container units (1cqw
          // = 1% of the thumb's width) so the badge stays proportional to the
          // card at every zoom step, the way the card's own printed elements do.
          // The 11px floor keeps the count legible at high column counts,
          // where 10% of a narrow thumb would shrink below readability.
          style={{
            fontSize: "max(11px, 10cqw)",
            padding: "0.5cqw 3cqw",
            borderRadius: "3.5cqw",
            right: "2cqw",
            bottom: "2cqw",
          }}
        >
          ×{card.quantity}
        </span>
      )}
      {priceText && (
        <span
          className="bg-background/85 text-muted-foreground absolute leading-tight font-medium tabular-nums"
          // Card-anchored chrome like the ×N badge, one step quieter: sized in
          // container units, bottom-left corner (the badge and the edit
          // controls own bottom-right), floored for legibility.
          style={{
            fontSize: "max(10px, 7.5cqw)",
            padding: "0.5cqw 2.5cqw",
            borderRadius: "3cqw",
            left: "2cqw",
            bottom: "2cqw",
          }}
        >
          {priceText}
        </span>
      )}
      {editable && (
        <ThumbEditControls
          deckId={deckId}
          card={card}
          zone={zone}
          addRoom={addRoom ?? 0}
          perCopy={copyIndex !== null && copyIndex !== undefined}
          alwaysVisible={isMobile}
        />
      )}
      {/* Collection status, split by copy: green for the copies on hand in the
          printing shown, blue for copies in another printing of the same card,
          and clear for the ones still missing. Sits on the card's bottom edge
          so a zone reads as a row of progress ticks. */}
      {band && (
        <span
          title={ownershipBandTitle(card.quantity, band)}
          className="absolute inset-x-0 bottom-0 flex h-0.5 overflow-hidden rounded-b-md"
        >
          {band.exact > 0 && (
            <span className="bg-green-500" style={{ flexGrow: band.exact, flexBasis: 0 }} />
          )}
          {band.other > 0 && (
            <span className="bg-sky-500" style={{ flexGrow: band.other, flexBasis: 0 }} />
          )}
          {band.missing > 0 && <span style={{ flexGrow: band.missing, flexBasis: 0 }} />}
        </span>
      )}
    </div>
  );

  if (thumbnail === failedUrl) {
    return null;
  }

  if (readOnly) {
    return thumbBody;
  }

  return (
    <DeckCardPrintingMenu deckId={deckId} card={card}>
      {thumbBody}
    </DeckCardPrintingMenu>
  );
}

/**
 * @returns The four intro steps, with the battlefield step adjusted to the
 *   format's cap (custom-region plays a single battlefield).
 */
function introSteps(format: DeckFormat): readonly { title: string; description: string }[] {
  const singleBattlefield = format === WellKnown.deckFormat.CUSTOM_REGION;
  return [
    { title: "Pick a Legend", description: "Sets your deck's domains. Runes auto-fill 6/6." },
    { title: "Choose a Champion", description: "Suggested by your Legend's tag." },
    singleBattlefield
      ? { title: "Add a Battlefield", description: "One battlefield card." }
      : { title: "Add Battlefields", description: "Three unique battlefield cards." },
    { title: "Fill the Main Deck", description: "39 units, spells, and gear from your domains." },
  ];
}

const INTRO_TIPS: readonly string[] = [
  "Once you're inside a zone, each card in the browser has a small + button on its row. Click it to add a copy, or drag the card onto a zone in the sidebar. Hold Shift to add the maximum allowed copies at once.",
  "Edits save automatically as you go.",
];

function DeckBuilderIntroBanner({
  format,
  onDismiss,
}: {
  format: DeckFormat;
  onDismiss: () => void;
}) {
  const formatTip =
    format === WellKnown.deckFormat.CONSTRUCTED
      ? "This deck uses the Constructed format, so it's checked against the rules as you build and violations show up right away. Switch to Freeform if you want to experiment without those restrictions."
      : format === WellKnown.deckFormat.CUSTOM_REGION
        ? "This deck uses the Custom-Region format: every card must belong to your chosen regions, one battlefield is played, there is no sideboard, and signature cards need their champion in the deck. Violations show up as you build."
        : "This deck uses the Freeform format, so you can build without rule restrictions. Switch to Constructed if you want the rules validated as you go.";
  return (
    <div className="border-border bg-muted/30 relative rounded-lg border p-4">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onDismiss}
        aria-label="Dismiss this guide"
        className="text-muted-foreground absolute top-2 right-2"
      >
        <XIcon className="size-4" />
      </Button>
      <div className="mx-auto flex max-w-5xl gap-3 pr-6">
        <InfoIcon className="text-primary mt-0.5 size-5 shrink-0" />
        <div className="flex flex-col gap-3">
          <div>
            <p className="font-medium">Build your deck in four steps</p>
            <p className="text-muted-foreground mt-0.5">
              The card browser auto-filters as you fill each zone, so you only see what fits.
            </p>
          </div>
          <div className="grid gap-4 @lg:grid-cols-2">
            <ol className="grid gap-2 self-start">
              {introSteps(format).map((step, index) => (
                <li
                  key={step.title}
                  className="border-border bg-background flex items-start gap-2 rounded-md border p-2"
                >
                  <span className="bg-primary/10 text-primary flex size-5 shrink-0 items-center justify-center rounded-full font-semibold">
                    {index + 1}
                  </span>
                  <div>
                    <span className="font-medium">{step.title}</span>
                    <p className="text-muted-foreground">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div>
              <p className="font-medium">Good to know</p>
              <ul className="text-muted-foreground mt-1 list-disc space-y-0.5 pl-5">
                <li>
                  Decks track{" "}
                  <Link
                    to="/help/$slug"
                    params={{ slug: "cards-printings-copies" }}
                    className="text-primary hover:underline"
                  >
                    cards, not specific printings
                  </Link>
                  , so any printing you own counts toward the deck.
                </li>
                {INTRO_TIPS.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
                <li>{formatTip}</li>
              </ul>
            </div>
          </div>
          <Link
            to="/help/$slug"
            params={{ slug: "deck-building" }}
            className="text-primary hover:underline"
          >
            Read the full guide →
          </Link>
        </div>
      </div>
    </div>
  );
}
