import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import type { DeckViolation } from "@openrift/shared/deck-rules";
import { formatHasSideboard, SIDEBOARD_MAXIMUM } from "@openrift/shared/deck-rules";
import { setIndexById } from "@openrift/shared/set-order";
import type { DeckFormat, DeckZone } from "@openrift/shared/types/enums";
import type { Marketplace } from "@openrift/shared/types/pricing";
import { getOrientation, legendDisplayName } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon, HandHeartIcon, LockIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CardMiniRow } from "@/features/cards/components/card-mini-row";
import type { SortGroupOption } from "@/features/cards/components/sort-group-controls";
import { useCards } from "@/features/cards/hooks/use-cards";
import { pricesQueryOptions } from "@/features/cards/hooks/use-prices";
import type { CardOpenTarget, HoverHandler } from "@/features/cards/lib/card-row-interactions";
import { cardHoverProps, rowActivateProps } from "@/features/cards/lib/card-row-interactions";
import { DeckCardGroupHeader } from "@/features/decks/components/deck-card-group-header";
import { EnergyGlyph, PowerPips } from "@/features/decks/components/deck-card-row";
import { DeckZoneHeader } from "@/features/decks/components/deck-zone-header";
import { lockedReasonText } from "@/features/decks/hooks/use-deck-ownership";
import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import {
  getDeckCardKey,
  isCardAllowedInZone,
  isDeckZoneFullForDrag,
} from "@/features/decks/lib/deck-builder-card";
import type { DeckCardGroup, DeckOverviewGroup } from "@/features/decks/lib/deck-card-group";
import { groupDeckCards } from "@/features/decks/lib/deck-card-group";
import { GROUPED_ZONES } from "@/features/decks/lib/deck-card-sort";
import type {
  AnyDragData,
  DeckCardDragData,
  DeckDropData,
} from "@/features/decks/lib/deck-dnd-data";
import {
  DECK_DRAG_TYPES,
  DRAG_SOURCE_ZONES,
  resolveDraggedCard,
} from "@/features/decks/lib/deck-dnd-data";
import type {
  DeckListSortContext,
  DeckOverviewSort,
} from "@/features/decks/lib/deck-overview-list-sort";
import { sortDeckOverviewList } from "@/features/decks/lib/deck-overview-list-sort";
import type { CardOwnership, DeckOwnershipData } from "@/features/decks/lib/deck-ownership-types";
import type { StatsFocus } from "@/features/decks/lib/deck-stats-focus";
import { cardMatchesStatsFocus } from "@/features/decks/lib/deck-stats-focus";
import { ZONE_LABELS, zoneEmptyHint, zoneExpected } from "@/features/decks/lib/deck-zone-labels";
import { useBorrowedLenders } from "@/features/groups/hooks/use-loans";
import { borrowedReasonText } from "@/features/groups/lib/loan-derivation";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { asDragData } from "@/lib/dnd-data";
import { formatterForMarketplace } from "@/lib/format";
import { cn } from "@/lib/utils";

type OwnershipPrinting = NonNullable<CardOwnership["displayPrinting"]>;

interface RowPrinting {
  printing: OwnershipPrinting | undefined;
  price: number | undefined;
  hoverPrintingId: string | null;
}

/**
 * A row is right-packed around its `flex-1` name; a cell rendered on only
 * some rows shifts later columns out of line with their neighbours.
 */
interface ReservedCells {
  lock: boolean;
  borrowed: boolean;
  price: boolean;
}

export const DECK_OVERVIEW_SORT_OPTIONS: SortGroupOption<DeckOverviewSort>[] = [
  { value: "default", label: "Curve order" },
  { value: "id", label: "ID" },
  { value: "name", label: "Name" },
  { value: "energy", label: "Energy" },
  { value: "price", label: "Price" },
  { value: "rarity", label: "Rarity" },
  { value: "ownership", label: "Ownership" },
];

// Mirrors the sidebar and thumbnail dashboard's zone order.
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
  showOwnership: boolean;
  marketplace: Marketplace;
  sortBy: DeckOverviewSort;
  sortDir: "asc" | "desc";
  groupBy: DeckOverviewGroup;
  groupDir: "asc" | "desc";
  statsFocus?: StatsFocus | null;
  onHoverCard?: HoverHandler;
  onCardClick?: (card: CardOpenTarget) => void;
  ownedPrintingFor?: (cardId: string) => OwnershipPrinting | undefined;
  resolveHoverPrintingId?: (cardId: string, preferredPrintingId: string | null) => string | null;
  draggable?: boolean;
  onZoneClick?: (zone: DeckZone) => void;
  tokensSlot?: React.ReactNode;
}

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

  // Non-suspending: this map is shared with every other price consumer and
  // usually already warm.
  const { data: prices } = useQuery(pricesQueryOptions);

  const resolveRowPrinting = (
    card: DeckBuilderCard,
    entry: CardOwnership | undefined,
  ): RowPrinting => {
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
    const showExpected =
      expected !== undefined &&
      (zone !== WellKnown.deckZone.SIDEBOARD || formatHasSideboard(format));
    const zoneViolations = violations.filter(
      (violation) => violation.zone === zone && !violation.cardId,
    );
    const cardViolations = new Map<string, string>();
    for (const violation of violations) {
      if (violation.zone === zone && violation.cardId && !cardViolations.has(violation.cardId)) {
        cardViolations.set(violation.cardId, violation.message);
      }
    }

    const rowsDraggable = dragEnabled && DRAG_SOURCE_ZONES.has(zone);

    return (
      <ZoneSection key={zone} zone={zone} format={format} allCards={cards} droppable={dragEnabled}>
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
                    className="size-5 shrink-0 rounded-md"
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
                  ? "text-success"
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

  return (
    <div className="w-full columns-[30rem] gap-x-10">
      {zones.map((entry) => renderZone(entry))}
      {tokensSlot}
    </div>
  );
}

// Exported for the tokens band, which isn't a zone but shares this flow.
export const DECK_LIST_SECTION_CLASS =
  "mb-6 flex break-inside-avoid flex-col gap-1.5 rounded-md transition-all";

/**
 * Empty Runes stays non-interactive: runes auto-fill from the Legend, so the
 * row states that instead. The section header still opens the zone.
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

// Split in two so the dnd hooks never run on the read-only share page, which
// renders the list outside any DndContext.
function ZoneSection({
  zone,
  format,
  allCards,
  droppable,
  children,
}: {
  zone: DeckZone;
  format: DeckFormat;
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

  // Registered even when disabled: a droppable that drops out of collision
  // detection makes a release read as "outside any zone" and remove a copy.
  const dropData: DeckDropData = { type: "deck-zone", zone, disabled: dropDisabled };
  const { setNodeRef, isOver } = useDroppable({ id: `overview-list-zone-${zone}`, data: dropData });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        DECK_LIST_SECTION_CLASS,
        isOver && !dropDisabled && "ring-primary/60 ring-2 ring-offset-2",
        dropDisabled && "opacity-40",
      )}
    >
      {children}
    </section>
  );
}

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
  groupBy: DeckOverviewGroup;
  sortBy: DeckOverviewSort;
  sortDir: "asc" | "desc";
  sortContext: DeckListSortContext;
  rarityLabels: Record<string, string>;
  domainLabels: Record<string, string>;
  domainColors: Record<string, string>;
  showOwnership: boolean;
  reserved: ReservedCells;
  borrowedLenders?: Record<string, string[]>;
  fmtPrice: (cents: number) => string;
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
  domainLabels: Record<string, string>;
  domainColors: Record<string, string>;
  showOwnership: boolean;
  reserved: ReservedCells;
  borrowedLenders?: Record<string, string[]>;
  fmtPrice: (cents: number) => string;
  resolveRowPrinting: (card: DeckBuilderCard, entry: CardOwnership | undefined) => RowPrinting;
  violationMessage?: string;
  dimmed?: boolean;
  onHoverCard?: HoverHandler;
  onCardClick?: (card: CardOpenTarget) => void;
}

// The dnd hook lives in only one branch, so it never runs on the share page
// (hooks can't be conditional; components can).
function ListRow({ draggable, ...props }: DeckListRowProps & { draggable: boolean }) {
  if (draggable) {
    return <DraggableDeckListRow {...props} />;
  }
  return <DeckListRow {...props} />;
}

// The payload is byte-for-byte the grid thumbnail's `DeckCardDragData`, so
// every existing drop handler treats a list drag exactly like a grid drag.
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
  // Destructured before use: member access on the hook's return object during
  // render makes the React Compiler bail.
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

// Hook-free so tests can render it on its own.
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
  dragRef?: (element: HTMLElement | null) => void;
  dragProps?: React.HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
}) {
  const displayName = legendDisplayName({
    name: card.cardName,
    types: card.cardTypes,
    tags: card.tags,
  });
  const { printing, price, hoverPrintingId } = resolveRowPrinting(card, entry);
  const rarity = printing?.rarity;
  const missing = (entry?.shortfall ?? 0) > 0;

  return (
    <div
      ref={dragRef}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-sm sm:gap-2",
        onCardClick && "hover:bg-muted/50 cursor-pointer",
        // Gate on dragProps, not dragRef: reading a `…Ref`-named value during
        // render trips the React Compiler's refs-during-render check
        // (build-failing bailout); the two props are always set together.
        dragProps && "cursor-grab active:cursor-grabbing",
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
            missing ? "text-warning" : "text-muted-foreground",
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
