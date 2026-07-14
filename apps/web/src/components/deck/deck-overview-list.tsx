import type { DeckFormat, DeckViolation, DeckZone, Marketplace } from "@openrift/shared";
import { WellKnown, formatHasSideboard, legendDisplayName } from "@openrift/shared";
import { AlertTriangleIcon } from "lucide-react";

import { EnergyGlyph, PowerDomainIcon } from "@/components/deck/deck-card-row";
import type { SortGroupOption } from "@/components/filters/sort-group-controls";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CardOwnership, DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDeckCardKey } from "@/lib/deck-builder-card";
import { GROUPED_ZONES, TYPE_GROUP_ORDER } from "@/lib/deck-card-sort";
import type { DeckListSortContext } from "@/lib/deck-overview-list-sort";
import { sortDeckOverviewList } from "@/lib/deck-overview-list-sort";
import { ZONE_LABELS, zoneExpected } from "@/lib/deck-zone-labels";
import { getPipBackgroundStyle } from "@/lib/domain";
import { formatterForMarketplace } from "@/lib/format";
import { getFilterIconPath, getTypeIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { DeckOverviewSort } from "@/stores/deck-overview-view-store";

/** Sort choices exposed by the overview list toolbar. */
export const DECK_OVERVIEW_SORT_OPTIONS: SortGroupOption<DeckOverviewSort>[] = [
  { value: "default", label: "Default" },
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
  onHoverCard?: (cardId: string | null, preferredPrintingId?: string | null) => void;
  onCardClick?: (card: DeckBuilderCard) => void;
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
  onHoverCard,
  onCardClick,
}: DeckOverviewListProps) {
  const { orders, labels } = useEnumOrders();
  const domainColors = useDomainColors();
  const fmtPrice = formatterForMarketplace(marketplace);

  const sortContext: DeckListSortContext = {
    getEntry: (card) => ownership?.byCardZone.get(`${card.cardId}:${card.zone}`),
    rarityOrder: orders.rarities,
  };

  const zones = ZONE_ORDER.map((zone) => ({
    zone,
    cards: cards.filter((card) => card.zone === zone),
  })).filter((entry) => entry.cards.length > 0);

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

    return (
      <section key={zone} className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 border-b pb-1">
          <span className="text-sm font-medium">{ZONE_LABELS[zone]}</span>
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
              zoneViolations.length > 0 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {quantity}
            {showExpected && `/${expected}`}
          </span>
        </div>

        {GROUPED_ZONES.has(zone) ? (
          <GroupedRows
            cards={zoneCards}
            typeLabels={labels.cardTypes}
            sortBy={sortBy}
            sortDir={sortDir}
            sortContext={sortContext}
            rarityLabels={labels.rarities}
            domainColors={domainColors}
            showOwnership={showOwnership}
            fmtPrice={fmtPrice}
            onHoverCard={onHoverCard}
            onCardClick={onCardClick}
          />
        ) : (
          <div className="flex flex-col gap-0.5">
            {sortDeckOverviewList(zoneCards, sortBy, sortDir, sortContext).map((card) => (
              <DeckListRow
                key={getDeckCardKey(card)}
                card={card}
                entry={sortContext.getEntry(card)}
                rarityLabels={labels.rarities}
                domainColors={domainColors}
                showOwnership={showOwnership}
                fmtPrice={fmtPrice}
                onHoverCard={onHoverCard}
                onCardClick={onCardClick}
              />
            ))}
          </div>
        )}
      </section>
    );
  };

  const mainEntry = zones.find((entry) => entry.zone === WellKnown.deckZone.MAIN);
  const otherEntries = zones.filter((entry) => entry.zone !== WellKnown.deckZone.MAIN);

  // On a wide container, split into two side-by-side columns: everything but the
  // main deck on the left, the main deck on the right. Narrow containers stack
  // the two columns, so the reading order stays other zones → main deck.
  return (
    <div className="flex w-full max-w-xl flex-col gap-5 @4xl:max-w-none @4xl:flex-row @4xl:items-start @4xl:gap-8">
      {otherEntries.length > 0 && (
        // The hover preview anchors to `data-deck-list-root`. With two columns
        // the only spot beside the rows that clears both is right of the main
        // (right) column, so tag that — or this column when there's no main.
        <div
          {...(mainEntry ? {} : { "data-deck-list-root": "" })}
          className="flex min-w-0 flex-col gap-5 @4xl:max-w-xl @4xl:flex-1"
        >
          {otherEntries.map((entry) => renderZone(entry))}
        </div>
      )}
      {mainEntry && (
        <div data-deck-list-root className="flex min-w-0 flex-col gap-5 @4xl:max-w-xl @4xl:flex-1">
          {renderZone(mainEntry)}
        </div>
      )}
    </div>
  );
}

/**
 * Renders a grouped zone (main / sideboard / overflow) as type sub-groups —
 * Units / Spells / Gear each with a small header — sorting rows inside each
 * group by the chosen sort.
 * @returns The stacked type-group sections.
 */
function GroupedRows({
  cards,
  typeLabels,
  sortBy,
  sortDir,
  sortContext,
  rarityLabels,
  domainColors,
  showOwnership,
  fmtPrice,
  onHoverCard,
  onCardClick,
}: {
  cards: DeckBuilderCard[];
  typeLabels: Record<string, string>;
  sortBy: DeckOverviewSort;
  sortDir: "asc" | "desc";
  sortContext: DeckListSortContext;
  rarityLabels: Record<string, string>;
  domainColors: Record<string, string>;
  showOwnership: boolean;
  fmtPrice: (cents: number) => string;
  onHoverCard?: (cardId: string | null, preferredPrintingId?: string | null) => void;
  onCardClick?: (card: DeckBuilderCard) => void;
}) {
  const grouped = Map.groupBy(cards, (card) => card.cardType);
  const presentTypes = [
    ...TYPE_GROUP_ORDER.filter((type) => grouped.has(type)),
    ...[...grouped.keys()].filter((type) => !TYPE_GROUP_ORDER.includes(type)),
  ];

  return (
    <div className="flex flex-col gap-3">
      {presentTypes.map((type) => {
        const group = grouped.get(type) ?? [];
        const count = group.reduce((sum, card) => sum + card.quantity, 0);
        const iconPath = getTypeIconPath(type, []);
        const sorted = sortDeckOverviewList(group, sortBy, sortDir, sortContext);
        return (
          <div key={type} className="flex flex-col gap-0.5">
            <div className="text-muted-foreground flex items-center gap-1.5 px-2 text-xs">
              {iconPath && (
                <img src={iconPath} alt="" className="size-3.5 brightness-0 dark:invert" />
              )}
              <span className="whitespace-nowrap">
                {typeLabels[type]}s <span className="text-muted-foreground/60">· {count}</span>
              </span>
            </div>
            {sorted.map((card) => (
              <DeckListRow
                key={getDeckCardKey(card)}
                card={card}
                entry={sortContext.getEntry(card)}
                rarityLabels={rarityLabels}
                domainColors={domainColors}
                showOwnership={showOwnership}
                fmtPrice={fmtPrice}
                onHoverCard={onHoverCard}
                onCardClick={onCardClick}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function DeckListRow({
  card,
  entry,
  rarityLabels,
  domainColors,
  showOwnership,
  fmtPrice,
  onHoverCard,
  onCardClick,
}: {
  card: DeckBuilderCard;
  entry: CardOwnership | undefined;
  rarityLabels: Record<string, string>;
  domainColors: Record<string, string>;
  showOwnership: boolean;
  fmtPrice: (cents: number) => string;
  onHoverCard?: (cardId: string | null, preferredPrintingId?: string | null) => void;
  onCardClick?: (card: DeckBuilderCard) => void;
}) {
  const displayName = legendDisplayName({
    name: card.cardName,
    types: card.cardTypes,
    tags: card.tags,
  });
  const rarity = entry?.displayPrinting?.rarity;
  const rarityIcon = rarity ? getFilterIconPath("rarities", rarity) : undefined;
  const missing = (entry?.shortfall ?? 0) > 0;

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

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded px-2 py-1 text-sm",
        onCardClick && "hover:bg-muted/50 cursor-pointer",
      )}
      onMouseEnter={() => onHoverCard?.(card.cardId, card.preferredPrintingId)}
      onMouseLeave={() => onHoverCard?.(null)}
      {...interactiveProps}
    >
      <span
        aria-hidden
        className="w-0.5 shrink-0 self-stretch rounded-full"
        style={getPipBackgroundStyle(card.domains, domainColors)}
      />

      <span className="hidden w-20 shrink-0 items-center gap-1.5 sm:flex">
        {rarityIcon && (
          <img
            src={rarityIcon}
            alt=""
            title={rarity ? rarityLabels[rarity] : undefined}
            className="size-3.5 shrink-0"
          />
        )}
        {entry?.displayPrinting && (
          <span className="text-muted-foreground truncate font-mono text-xs">
            {entry.displayPrinting.shortCode}
          </span>
        )}
      </span>

      <span className="w-6 shrink-0 text-right tabular-nums">{card.quantity}×</span>

      <span className="min-w-0 flex-1 truncate">{displayName}</span>

      {card.power !== null && card.power > 0 && (
        <span className="hidden shrink-0 items-center gap-0.5 sm:flex">
          {Array.from({ length: card.power }, (_, index) => (
            <PowerDomainIcon key={index} domains={card.domains} colors={domainColors} />
          ))}
        </span>
      )}

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

      {entry?.displayPrice !== undefined && (
        <span className="text-muted-foreground w-14 shrink-0 text-right tabular-nums">
          {fmtPrice(entry.displayPrice)}
        </span>
      )}
    </div>
  );
}
