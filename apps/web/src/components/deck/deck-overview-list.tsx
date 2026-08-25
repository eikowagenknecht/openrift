import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import type { DeckFormat, DeckViolation, DeckZone, Marketplace } from "@openrift/shared";
import {
  SIDEBOARD_MAXIMUM,
  WellKnown,
  formatHasSideboard,
  getOrientation,
  legendDisplayName,
  setIndexById,
} from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon, HandHeartIcon, LockIcon, PlusIcon } from "lucide-react";

import { CardMiniRow } from "@/components/cards/card-mini-row";
import { DeckCardGroupHeader } from "@/components/deck/deck-card-group-header";
import { EnergyGlyph, PowerPips } from "@/components/deck/deck-card-row";
import type {
  AnyDragData,
  DeckCardDragData,
  DeckDropData,
} from "@/components/deck/deck-dnd-context";
import {
  DECK_DRAG_TYPES,
  DRAG_SOURCE_ZONES,
  resolveDraggedCard,
} from "@/components/deck/deck-dnd-context";
import { DeckZoneHeader } from "@/components/deck/deck-zone-header";
import type { SortGroupOption } from "@/components/filters/sort-group-controls";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCards } from "@/hooks/use-cards";
import type { CardOwnership, DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { lockedReasonText } from "@/hooks/use-deck-ownership";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useBorrowedLenders } from "@/hooks/use-loans";
import { pricesQueryOptions } from "@/hooks/use-prices";
import type { CardOpenTarget, HoverHandler } from "@/lib/card-row-interactions";
import { cardHoverProps, rowActivateProps } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import {
  getDeckCardKey,
  isCardAllowedInZone,
  isDeckZoneFullForDrag,
} from "@/lib/deck-builder-card";
import type { DeckCardGroup, DeckOverviewGroup } from "@/lib/deck-card-group";
import { groupDeckCards } from "@/lib/deck-card-group";
import { GROUPED_ZONES } from "@/lib/deck-card-sort";
import type { DeckListSortContext } from "@/lib/deck-overview-list-sort";
import { sortDeckOverviewList } from "@/lib/deck-overview-list-sort";
import type { StatsFocus } from "@/lib/deck-stats-focus";
import { cardMatchesStatsFocus } from "@/lib/deck-stats-focus";
import { ZONE_LABELS, zoneEmptyHint, zoneExpected } from "@/lib/deck-zone-labels";
import { asDragData } from "@/lib/dnd-data";
import { formatterForMarketplace } from "@/lib/format";
import { borrowedReasonText } from "@/lib/loan-derivation";
import { cn } from "@/lib/utils";
import type { DeckOverviewSort } from "@/stores/deck-overview-view-store";

/** The compact printing shape the ownership data carries for a row. */
type OwnershipPrinting = NonNullable<CardOwnership["displayPrinting"]>;

/** What a row renders about the printing it stands for. */
interface RowPrinting {
  /** Drives the set code and the rarity icon; absent when nothing resolved. */
  printing: OwnershipPrinting | undefined;
  /** Price of that printing on the selected marketplace, when it has one. */
  price: number | undefined;
  /** Printing id handed to the hover preview. */
  hoverPrintingId: string | null;
}

/**
 * Which optional cells every row reserves, decided once for the whole list. A
 * row is right-packed around its `flex-1` name, so a cell rendered on only some
 * rows shifts every column after the name on those rows out of line with their
 * neighbours. Reserving per list rather than always is what keeps the width for
 * card names in the decks that need neither cell.
 */
interface ReservedCells {
  /** Some row has copies locked away from deck building. */
  lock: boolean;
  /** Some row has copies borrowed from a friend. */
  borrowed: boolean;
  /** Some row has a price on the selected marketplace. */
  price: boolean;
}

/** Sort choices exposed by the overview list toolbar. */
export const DECK_OVERVIEW_SORT_OPTIONS: SortGroupOption<DeckOverviewSort>[] = [
  // "default" is the sidebar's curve order (energy → power → name) — named for
  // what it does rather than for being the fallback.
  { value: "default", label: "Curve order" },
  { value: "id", label: "ID" },
  { value: "name", label: "Name" },
  { value: "energy", label: "Energy" },
  { value: "price", label: "Price" },
  { value: "rarity", label: "Rarity" },
  { value: "ownership", label: "Ownership" },
];

// Zone render order — mirrors the sidebar and the thumbnail dashboard.
const ZONE_ORDER: readonly DeckZone[] = [
  WellKnown.deckZone.LEGEND,
  WellKnown.deckZone.CHAMPION,
  WellKnown.deckZone.RUNES,
  WellKnown.deckZone.BATTLEFIELD,
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.OVERFLOW,
];

interface DeckOverviewListProps {
  cards: DeckBuilderCard[];
  format: DeckFormat;
  violations: DeckViolation[];
  ownership?: DeckOwnershipData;
  /** Show the owned/needed column. False for anonymous share viewers. */
  showOwnership: boolean;
  marketplace: Marketplace;
  sortBy: DeckOverviewSort;
  sortDir: "asc" | "desc";
  /** Sub-grouping axis inside main / sideboard / overflow. */
  groupBy: DeckOverviewGroup;
  /** Direction for `groupBy` — flips the group order. */
  groupDir: "asc" | "desc";
  /** Active stats-chart focus: non-matching rows render dimmed. */
  statsFocus?: StatsFocus | null;
  onHoverCard?: HoverHandler;
  onCardClick?: (card: CardOpenTarget) => void;
  /**
   * The printing the viewer owns for a card, while "show my printings" is on —
   * `undefined` when the toggle is off or they own none. Built by
   * `DeckOverview` so the list, the grid and the hero all swap together. A row
   * shows this printing's set code, rarity and price.
   */
  ownedPrintingFor?: (cardId: string) => OwnershipPrinting | undefined;
  /**
   * Printing id to preview on hover. Also from `DeckOverview`, which knows
   * whether the host can resolve an arbitrary printing id.
   */
  resolveHoverPrintingId?: (cardId: string, preferredPrintingId: string | null) => string | null;
  /**
   * Enables drag-and-drop between zones, at parity with the thumbnail grid.
   * Every dnd-kit hook in this file sits behind it, because the read-only share
   * page renders the list with no DndContext ancestor — so pass `!readOnly`.
   * Phones are excluded here rather than at the call site (same as
   * `DeckCardRow`), since DnD is desktop-only everywhere.
   */
  draggable?: boolean;
  /**
   * Opens a zone's card browser. Its presence is the edit-mode gate: with it,
   * empty zones stay listed (so their violations are visible) and every zone
   * gets a trailing add row. The read-only share page passes nothing and keeps
   * the hide-empty layout.
   */
  onZoneClick?: (zone: DeckZone) => void;
  /**
   * The deck's tokens, rendered as one more block of the multicolumn flow after
   * the zones. Passed in rather than derived here because it suspends on the
   * catalog, which the host has already gated behind hydration.
   */
  tokensSlot?: React.ReactNode;
}

/**
 * Dense, read-only list rendering of a deck's contents, grouped by zone (and by
 * card type inside the grouped zones). Rows show count, rarity + short code,
 * name, energy/power, ownership, and price. Used as the overview's list mode
 * alongside the thumbnail dashboard.
 * @returns The deck list view.
 */
export function DeckOverviewList({
  cards,
  format,
  violations,
  ownership,
  showOwnership,
  marketplace,
  sortBy,
  sortDir,
  groupBy,
  groupDir,
  statsFocus,
  onHoverCard,
  onCardClick,
  ownedPrintingFor,
  resolveHoverPrintingId,
  draggable = false,
  onZoneClick,
  tokensSlot,
}: DeckOverviewListProps) {
  const isRowDimmed = (card: DeckBuilderCard) =>
    statsFocus !== null && statsFocus !== undefined && !cardMatchesStatsFocus(card, statsFocus);
  const { orders, labels } = useEnumOrders();
  const { sets } = useCards();
  const domainColors = useDomainColors();
  const isMobile = useIsMobile();
  const fmtPrice = formatterForMarketplace(marketplace);
  const dragEnabled = draggable && !isMobile;

  // The ownership data prices the deck's *display* printings, so an owned
  // printing has to be priced here instead. Non-suspending on purpose: the map
  // is shared with every other price consumer and usually already warm, and the
  // display price keeps the column filled until it lands. (This list only ever
  // mounts client-side — the display mode is hydration-gated to "grid" — so it
  // can't pull the price map into SSR.)
  const { data: prices } = useQuery(pricesQueryOptions);

  const resolveRowPrinting = (
    card: DeckBuilderCard,
    entry: CardOwnership | undefined,
  ): RowPrinting => {
    // No art gate on the printing itself: an owned printing with no image on
    // file still prices as the owned printing and still shows its set code.
    // The art gate lives in `resolveHoverPrintingId`, where an image is what's
    // actually being asked for. Without the owned override, the price is the
    // cheapest acceptable printing's — the same basis as the hero's value chip
    // — so the visible row prices sum to the headline even when a premium
    // printing is pinned for display.
    const owned = ownedPrintingFor?.(card.cardId);
    return {
      printing: owned ?? entry?.displayPrinting,
      price:
        owned && prices
          ? prices.get(owned.id, marketplace)
          : (entry?.cheapestPrice ?? entry?.displayPrice),
      hoverPrintingId:
        resolveHoverPrintingId?.(card.cardId, card.preferredPrintingId) ?? card.preferredPrintingId,
    };
  };

  const getEntry = (card: DeckBuilderCard) =>
    ownership?.byCardZone.get(`${card.cardId}:${card.zone}`);

  // Locked copies are rare and an unpriced printing rarer still, so both cells
  // are reserved per deck rather than always — see `ReservedCells`.
  // Names only, built once for the whole list — see `DeckListRowProps`.
  const { data: borrowedLenders } = useBorrowedLenders();
  const reserved: ReservedCells = {
    lock: showOwnership && cards.some((card) => (getEntry(card)?.locked ?? 0) > 0),
    borrowed: showOwnership && cards.some((card) => (getEntry(card)?.borrowed ?? 0) > 0),
    price: cards.some((card) => resolveRowPrinting(card, getEntry(card)).price !== undefined),
  };

  const sortContext: DeckListSortContext = {
    getEntry,
    rarityOrder: orders.rarities,
    setIndexById: setIndexById(sets),
    // Sort what the rows show: with "show my printings" on, the price, the
    // rarity icon and the set code all describe the owned printing, not the
    // deck's.
    getRowPrice: (card) => resolveRowPrinting(card, getEntry(card)).price,
    getRowRarity: (card) => resolveRowPrinting(card, getEntry(card)).printing?.rarity,
    getRowPrinting: (card) => resolveRowPrinting(card, getEntry(card)).printing,
  };

  const groupCards = (zoneCards: DeckBuilderCard[]): DeckCardGroup[] =>
    groupDeckCards(zoneCards, groupBy, groupDir, {
      typeLabels: labels.cardTypes,
      domainLabels: labels.domains,
      domainOrder: orders.domains,
      getEntry,
    });

  // Edit mode mirrors the grid's tile visibility, so both views scaffold the
  // same zones: an empty one still carries its header, its violation and its
  // add row. The sideboard shows only where the format plays one (or strays
  // are parked there), overflow only when occupied. Read-only keeps hiding
  // every empty zone — a share page shows the deck, not the scaffolding.
  const editing = onZoneClick !== undefined;
  const zoneVisible = (zone: DeckZone, count: number) => {
    if (count > 0) {
      return true;
    }
    if (!editing) {
      return false;
    }
    if (zone === WellKnown.deckZone.SIDEBOARD) {
      return formatHasSideboard(format);
    }
    return zone !== WellKnown.deckZone.OVERFLOW;
  };

  const zones = ZONE_ORDER.map((zone) => ({
    zone,
    cards: cards.filter((card) => card.zone === zone),
  })).filter((entry) => zoneVisible(entry.zone, entry.cards.length));

  const renderZone = ({ zone, cards: zoneCards }: (typeof zones)[number]) => {
    const quantity = zoneCards.reduce((sum, card) => sum + card.quantity, 0);
    const expected = zoneExpected(zone, format);
    // Formats without a sideboard still list a non-empty one so stray cards
    // are visible; the /8 target only applies where the zone is in-format.
    const showExpected =
      expected !== undefined &&
      (zone !== WellKnown.deckZone.SIDEBOARD || formatHasSideboard(format));
    const zoneViolations = violations.filter(
      (violation) => violation.zone === zone && !violation.cardId,
    );
    // Card-level violations annotate the offending row itself (first message
    // per card wins, matching the sidebar's behavior).
    const cardViolations = new Map<string, string>();
    for (const violation of violations) {
      if (violation.zone === zone && violation.cardId && !cardViolations.has(violation.cardId)) {
        cardViolations.set(violation.cardId, violation.message);
      }
    }

    const rowsDraggable = dragEnabled && DRAG_SOURCE_ZONES.has(zone);

    return (
      <ZoneSection key={zone} zone={zone} format={format} allCards={cards} droppable={dragEnabled}>
        {/* Same header grammar as the grid view's frameless zones: small-caps
            label over the hairline rule. */}
        <DeckZoneHeader label={ZONE_LABELS[zone]}>
          {zoneViolations.length > 0 && (
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Show ${ZONE_LABELS[zone]} issues`}
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
              zoneViolations.length > 0
                ? "text-destructive"
                : showExpected && quantity === expected
                  ? "text-green-600 dark:text-green-500"
                  : "text-muted-foreground",
            )}
          >
            {quantity}
            {showExpected && `/${expected}`}
          </span>
        </DeckZoneHeader>

        {zoneCards.length === 0 ? null : GROUPED_ZONES.has(zone) ? (
          <GroupedRows
            groups={groupCards(zoneCards)}
            groupBy={groupBy}
            sortBy={sortBy}
            sortDir={sortDir}
            sortContext={sortContext}
            rarityLabels={labels.rarities}
            domainLabels={labels.domains}
            domainColors={domainColors}
            showOwnership={showOwnership}
            reserved={reserved}
            borrowedLenders={borrowedLenders}
            fmtPrice={fmtPrice}
            resolveRowPrinting={resolveRowPrinting}
            cardViolations={cardViolations}
            isDimmed={isRowDimmed}
            onHoverCard={onHoverCard}
            onCardClick={onCardClick}
            draggable={rowsDraggable}
          />
        ) : (
          <div className="flex flex-col gap-0.5">
            {sortDeckOverviewList(zoneCards, sortBy, sortDir, sortContext).map((card) => (
              <ListRow
                key={getDeckCardKey(card)}
                card={card}
                entry={sortContext.getEntry(card)}
                rarityLabels={labels.rarities}
                domainLabels={labels.domains}
                domainColors={domainColors}
                showOwnership={showOwnership}
                reserved={reserved}
                borrowedLenders={borrowedLenders}
                fmtPrice={fmtPrice}
                resolveRowPrinting={resolveRowPrinting}
                violationMessage={cardViolations.get(card.cardId)}
                dimmed={isRowDimmed(card)}
                onHoverCard={onHoverCard}
                onCardClick={onCardClick}
                draggable={rowsDraggable}
              />
            ))}
          </div>
        )}

        {/* A full zone needs no invitation to add more: the row hides once the
            zone's target (or the sideboard's cap) is met. Freeform has no
            caps, and targetless zones (overflow) always take more. */}
        {onZoneClick &&
          (format === WellKnown.deckFormat.FREEFORM ||
            quantity <
              (expected ??
                (zone === WellKnown.deckZone.SIDEBOARD
                  ? SIDEBOARD_MAXIMUM
                  : Number.POSITIVE_INFINITY))) && (
            <ZoneAddRow
              zone={zone}
              format={format}
              isEmpty={zoneCards.length === 0}
              onClick={() => onZoneClick(zone)}
            />
          )}
      </ZoneSection>
    );
  };

  // Full-width CSS multicolumn: the browser fits as many ~30rem columns as the
  // container allows. The basis is generous on purpose — a row carries rarity,
  // code, pips, energy, ownership, and price around the name, so narrower
  // columns truncate card names. Every zone is an unbreakable block (header
  // and rows stay together), so columns are only as balanced as the zone
  // sizes allow — that's the intended trade.
  return (
    <div className="w-full columns-[30rem] gap-x-10">
      {zones.map((entry) => renderZone(entry))}
      {tokensSlot}
    </div>
  );
}

/**
 * One block of the list's multicolumn flow. A section never splits across
 * columns — its header and rows stay together. Exported for the tokens band,
 * which is not a zone but sits in the same flow and has to fold the same way.
 */
export const DECK_LIST_SECTION_CLASS =
  "mb-6 flex break-inside-avoid flex-col gap-1.5 rounded transition-all";

/**
 * Trailing add row for a zone, edit mode only: a dashed full-width target that
 * opens that zone's card browser. An empty zone spells out what's missing
 * (the same hint the grid's empty tile carries); a filled one just offers more.
 *
 * Empty Runes is the one non-interactive case, mirroring the grid tile: runes
 * auto-fill from the Legend, so the row states that rather than inviting a
 * click. The zone is still reachable — the section header opens it, which is
 * how you override the auto-fill.
 * @returns The add row.
 */
function ZoneAddRow({
  zone,
  format,
  isEmpty,
  onClick,
}: {
  zone: DeckZone;
  format: DeckFormat;
  isEmpty: boolean;
  onClick: () => void;
}) {
  const hint = zoneEmptyHint(zone, format);
  if (isEmpty && zone === WellKnown.deckZone.RUNES) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed px-2 py-1.5 text-center text-xs">
        {hint}
      </div>
    );
  }
  return (
    <Button
      type="button"
      variant="dashed"
      onClick={onClick}
      aria-label={isEmpty ? hint : `Add cards to ${ZONE_LABELS[zone]}`}
      className="h-auto w-full justify-start gap-1.5 rounded-md px-2 py-1.5 text-xs font-normal whitespace-normal"
    >
      <PlusIcon className="size-3.5 shrink-0" />
      <span>{isEmpty ? hint : "Add cards"}</span>
    </Button>
  );
}

/**
 * A zone's block in the list. With `droppable` it registers as a drop target
 * for the same `DeckDropData` the grid's zone tiles use, so a card released
 * over it lands in this zone. Split in two so the dnd hooks never run on the
 * read-only share page, which renders the list outside any DndContext.
 * @returns The zone section element.
 */
function ZoneSection({
  zone,
  format,
  allCards,
  droppable,
  children,
}: {
  zone: DeckZone;
  format: DeckFormat;
  /** The whole deck — zone-fullness checks count copies across zones. */
  allCards: DeckBuilderCard[];
  droppable: boolean;
  children: React.ReactNode;
}) {
  if (droppable) {
    return (
      <DroppableZoneSection zone={zone} format={format} allCards={allCards}>
        {children}
      </DroppableZoneSection>
    );
  }
  return <section className={DECK_LIST_SECTION_CLASS}>{children}</section>;
}

function DroppableZoneSection({
  zone,
  format,
  allCards,
  children,
}: {
  zone: DeckZone;
  format: DeckFormat;
  allCards: DeckBuilderCard[];
  children: React.ReactNode;
}) {
  // Mirrors the grid zone tiles: the same two helpers decide whether this zone
  // can take the card in flight, so both surfaces reject the same drags.
  const { active } = useDndContext();
  const dragData = asDragData<AnyDragData>(active?.data.current, DECK_DRAG_TYPES);
  const draggedCard = resolveDraggedCard(dragData, allCards);
  const isZoneFull =
    draggedCard !== undefined &&
    isDeckZoneFullForDrag({
      zone,
      draggedCard,
      fromZone: dragData?.type === "deck-card" ? dragData.fromZone : null,
      allCards,
      format,
    });
  const dropDisabled =
    draggedCard !== undefined && (!isCardAllowedInZone(draggedCard, zone) || isZoneFull);

  // Registered even when it can't accept the card, with the rejection carried
  // in the data — a disabled droppable leaves collision detection, and a
  // release over it would read as "dropped outside any zone" and remove a copy.
  // Same reasoning as the sidebar's zone sections.
  const dropData: DeckDropData = { type: "deck-zone", zone, disabled: dropDisabled };
  const { setNodeRef, isOver } = useDroppable({ id: `overview-list-zone-${zone}`, data: dropData });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        DECK_LIST_SECTION_CLASS,
        isOver && !dropDisabled && "ring-primary/60 ring-2 ring-offset-4",
        dropDisabled && "opacity-40",
      )}
    >
      {children}
    </section>
  );
}

/**
 * Renders a grouped zone (main / sideboard / overflow) as sub-groups along the
 * chosen axis — types by default, each with a small header — sorting rows
 * inside each group by the chosen sort. The single "none" group renders
 * headerless.
 * @returns The stacked sub-group sections.
 */
function GroupedRows({
  groups,
  groupBy,
  sortBy,
  sortDir,
  sortContext,
  rarityLabels,
  domainLabels,
  domainColors,
  showOwnership,
  reserved,
  borrowedLenders,
  fmtPrice,
  resolveRowPrinting,
  cardViolations,
  isDimmed,
  onHoverCard,
  onCardClick,
  draggable,
}: {
  groups: DeckCardGroup[];
  /** The active grouping axis — type groups keep their icons. */
  groupBy: DeckOverviewGroup;
  sortBy: DeckOverviewSort;
  sortDir: "asc" | "desc";
  sortContext: DeckListSortContext;
  rarityLabels: Record<string, string>;
  /** Slug → display name for the power pips accessible label. */
  domainLabels: Record<string, string>;
  domainColors: Record<string, string>;
  showOwnership: boolean;
  reserved: ReservedCells;
  borrowedLenders?: Record<string, string[]>;
  fmtPrice: (cents: number) => string;
  /** Resolves the printing a row stands for, plus its price and hover id. */
  resolveRowPrinting: (card: DeckBuilderCard, entry: CardOwnership | undefined) => RowPrinting;
  cardViolations: ReadonlyMap<string, string>;
  isDimmed: (card: DeckBuilderCard) => boolean;
  onHoverCard?: HoverHandler;
  onCardClick?: (card: CardOpenTarget) => void;
  draggable: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => {
        const sorted = sortDeckOverviewList(group.cards, sortBy, sortDir, sortContext);
        return (
          <div key={group.key} className="flex flex-col gap-0.5">
            <DeckCardGroupHeader group={group} groupBy={groupBy} className="px-2" />
            {sorted.map((card) => (
              <ListRow
                key={getDeckCardKey(card)}
                card={card}
                entry={sortContext.getEntry(card)}
                rarityLabels={rarityLabels}
                domainLabels={domainLabels}
                domainColors={domainColors}
                showOwnership={showOwnership}
                reserved={reserved}
                borrowedLenders={borrowedLenders}
                fmtPrice={fmtPrice}
                resolveRowPrinting={resolveRowPrinting}
                violationMessage={cardViolations.get(card.cardId)}
                dimmed={isDimmed(card)}
                onHoverCard={onHoverCard}
                onCardClick={onCardClick}
                draggable={draggable}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

interface DeckListRowProps {
  card: DeckBuilderCard;
  entry: CardOwnership | undefined;
  rarityLabels: Record<string, string>;
  /** Slug → display name for the power pips accessible label. */
  domainLabels: Record<string, string>;
  domainColors: Record<string, string>;
  showOwnership: boolean;
  /** The optional cells this row holds space for, whether it fills them or not. */
  reserved: ReservedCells;
  /**
   * Lender names per cardId, for the borrow glyph's tooltip. Threaded rather
   * than read per row: the aggregate is rebuilt on every call, so a hook here
   * would recompute it once per row and hand every row a fresh object.
   */
  borrowedLenders?: Record<string, string[]>;
  fmtPrice: (cents: number) => string;
  /** Resolves the printing a row stands for, plus its price and hover id. */
  resolveRowPrinting: (card: DeckBuilderCard, entry: CardOwnership | undefined) => RowPrinting;
  /** Card-level rule violation, rendered as a warning on the row itself. */
  violationMessage?: string;
  /** Stats-chart focus active and this card isn't in it — render faded. */
  dimmed?: boolean;
  onHoverCard?: HoverHandler;
  onCardClick?: (card: CardOpenTarget) => void;
}

/**
 * One list row, draggable or not. A plain function picking between two
 * components — the dnd hook lives in only one of them, so it never runs on the
 * share page (hooks can't be conditional; components can).
 * @returns The row element.
 */
function ListRow({ draggable, ...props }: DeckListRowProps & { draggable: boolean }) {
  if (draggable) {
    return <DraggableDeckListRow {...props} />;
  }
  return <DeckListRow {...props} />;
}

/**
 * Drag source wrapper. The payload is byte-for-byte the grid thumbnail's
 * `DeckCardDragData`, so every existing drop handler — zone tiles, sidebar
 * sections, the list's own sections — treats a list drag exactly like a grid
 * drag. Shift-to-move-all needs nothing here: DeckDndContext tracks the key
 * itself and reads `quantity` off this payload.
 * @returns The row, wired as a dnd-kit draggable.
 */
function DraggableDeckListRow(props: DeckListRowProps) {
  const { card } = props;
  const dragData: DeckCardDragData = {
    type: "deck-card",
    cardId: card.cardId,
    cardName: legendDisplayName({ name: card.cardName, types: card.cardTypes, tags: card.tags }),
    fromZone: card.zone,
    quantity: card.quantity,
    preferredPrintingId: card.preferredPrintingId,
  };
  // Destructured before the JSX below: member access on the hook's return
  // object during render makes the React Compiler bail (see CLAUDE.md).
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `overview-list-${card.cardId}-${card.zone}-${card.preferredPrintingId ?? "default"}`,
    data: dragData,
  });

  return (
    <DeckListRow
      {...props}
      dragRef={setNodeRef}
      dragProps={{ ...listeners, ...attributes }}
      isDragging={isDragging}
    />
  );
}

/**
 * The row itself, hook-free so the tests can render it on its own.
 * @returns One list row.
 */
export function DeckListRow({
  card,
  entry,
  rarityLabels,
  domainLabels,
  domainColors,
  showOwnership,
  reserved,
  borrowedLenders,
  fmtPrice,
  resolveRowPrinting,
  violationMessage,
  dimmed,
  onHoverCard,
  onCardClick,
  dragRef,
  dragProps,
  isDragging,
}: DeckListRowProps & {
  /** Set by DraggableDeckListRow; absent when the list isn't draggable. */
  dragRef?: (element: HTMLElement | null) => void;
  dragProps?: React.HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
}) {
  const displayName = legendDisplayName({
    name: card.cardName,
    types: card.cardTypes,
    tags: card.tags,
  });
  // Set code, rarity and price all describe one printing — the viewer's own
  // while "show my printings" is on, the deck's otherwise.
  const { printing, price, hoverPrintingId } = resolveRowPrinting(card, entry);
  const rarity = printing?.rarity;
  const missing = (entry?.shortfall ?? 0) > 0;

  return (
    <div
      ref={dragRef}
      className={cn(
        // Tighter gaps on phones: the row keeps every column but the set code
        // there, and the seven gaps are what the card name pays for them.
        "flex items-center gap-1.5 rounded px-2 py-1 text-sm sm:gap-2",
        onCardClick && "hover:bg-muted/50 cursor-pointer",
        // Gate on dragProps, not dragRef: reading a `…Ref`-named value during
        // render trips the compiler's refs-during-render check (build-failing
        // bailout); the two props are always set together.
        dragProps && "cursor-grab active:cursor-grabbing",
        // Dragging the only copy empties the row's slot; a stack keeps showing
        // because the copies left behind stay put. Matches the grid thumbs.
        isDragging && card.quantity === 1 && "opacity-40",
        dimmed && "opacity-30 transition-opacity",
      )}
      {...cardHoverProps(onHoverCard, card.cardId, hoverPrintingId)}
      {...rowActivateProps(onCardClick ? () => onCardClick(card) : undefined)}
      {...dragProps}
    >
      <CardMiniRow
        className="self-stretch"
        imageId={printing?.imageId}
        landscape={getOrientation(card.cardTypes) === "landscape"}
        domains={card.domains}
        domainColors={domainColors}
        rarity={rarity}
        rarityLabels={rarityLabels}
        shortCode={printing?.shortCode}
        loading="lazy"
        hideMetaOnMobile
      />

      <span className="w-6 shrink-0 text-right tabular-nums">{card.quantity}×</span>

      <span className="min-w-0 flex-1 truncate">
        {displayName}
        {violationMessage && (
          <Tooltip>
            <TooltipTrigger className="ml-1.5 inline-flex align-middle">
              <AlertTriangleIcon className="text-destructive size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{violationMessage}</TooltipContent>
          </Tooltip>
        )}
      </span>

      {/* Power shows on phones too, next to energy — it's half of what a card
          costs, and no more than four pips wide. */}
      <PowerPips
        power={card.power}
        domains={card.domains}
        colors={domainColors}
        domainLabels={domainLabels}
      />

      {card.energy !== null && <EnergyGlyph value={card.energy} />}

      {showOwnership && entry && (
        <span
          className={cn(
            "w-12 shrink-0 text-right tabular-nums",
            missing ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground",
          )}
        >
          {entry.owned}/{entry.needed}
        </span>
      )}
      {reserved.lock && (
        <span className="flex w-7 shrink-0 justify-end">
          {entry && entry.locked > 0 && (
            <Tooltip>
              <TooltipTrigger className="text-muted-foreground flex items-center gap-0.5">
                <LockIcon className="size-3" />
                <span className="text-xs tabular-nums">{entry.locked}</span>
              </TooltipTrigger>
              <TooltipContent>{lockedReasonText(entry)}</TooltipContent>
            </Tooltip>
          )}
        </span>
      )}
      {reserved.borrowed && (
        <span className="flex w-7 shrink-0 justify-end">
          {entry && entry.borrowed > 0 && (
            <Tooltip>
              <TooltipTrigger className="text-muted-foreground flex items-center gap-0.5">
                <HandHeartIcon className="size-3" />
                <span className="text-xs tabular-nums">{entry.borrowed}</span>
              </TooltipTrigger>
              <TooltipContent>
                {borrowedReasonText(entry.borrowed, borrowedLenders?.[card.cardId] ?? [])}
              </TooltipContent>
            </Tooltip>
          )}
        </span>
      )}

      {reserved.price && (
        <span className="text-muted-foreground w-14 shrink-0 text-right tabular-nums">
          {price === undefined ? null : fmtPrice(price)}
        </span>
      )}
    </div>
  );
}
