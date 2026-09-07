import type { DeckFormat, DeckViolation, DeckZone } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { PlusIcon, AlertTriangleIcon } from "lucide-react";

import { GroupedThumbs } from "@/components/deck/deck-grouped-thumbs";
import { LANDSCAPE_ZONES } from "@/components/deck/deck-overview-geometry";
import { StackPile } from "@/components/deck/deck-stack-pile";
import {
  LANDSCAPE_THUMB_CLASS,
  LANDSCAPE_THUMB_STYLE,
  PORTRAIT_THUMB_CLASS,
  PORTRAIT_THUMB_STYLE,
} from "@/components/deck/deck-thumb-metrics";
import { ZoneThumb } from "@/components/deck/deck-zone-thumbs";
import { Button } from "@/components/ui/button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { useDeckZoneDrop } from "@/hooks/use-deck-zone-drop";
import type { CardOpenTarget, HoverHandler } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDeckCardKey } from "@/lib/deck-builder-card";
import type { DeckCardGroup, DeckOverviewGroup } from "@/lib/deck-card-group";
import { GROUPED_ZONES } from "@/lib/deck-card-sort";
import { expandCopies, overviewHoverHandler } from "@/lib/deck-overview-derive";
import type { OwnershipBandSegments } from "@/lib/deck-ownership-band";
import type { StatsFocus } from "@/lib/deck-stats-focus";
import { cardMatchesStatsFocus } from "@/lib/deck-stats-focus";
import { zoneEmptyReadOnlyLabel } from "@/lib/deck-zone-labels";
import { cn } from "@/lib/utils";
import type { CollapsibleDeckSection } from "@/stores/deck-builder-ui-store";

const MAX_UNKNOWN_SLOTS = 3;

function UnknownSlots({ count, isLandscape }: { count: number; isLandscape: boolean }) {
  const slots = count <= MAX_UNKNOWN_SLOTS ? count : 1;
  const label = slots === count ? "Unknown" : `${count} unknown`;
  return Array.from({ length: slots }, (_, index) => (
    <div
      key={index}
      style={isLandscape ? LANDSCAPE_THUMB_STYLE : PORTRAIT_THUMB_STYLE}
      className={cn(
        isLandscape ? LANDSCAPE_THUMB_CLASS : PORTRAIT_THUMB_CLASS,
        "text-muted-foreground flex shrink-0 items-center justify-center rounded-md border border-dashed px-2 text-center text-xs",
      )}
    >
      {label}
    </div>
  ));
}

export interface ZoneTileProps {
  deckId: string;
  bandByCardKey: ReadonlyMap<string, OwnershipBandSegments>;
  priceTextByCardKey: ReadonlyMap<string, string>;
  addRoomByCardKey: ReadonlyMap<string, number>;
  resolveHoverPrintingId: (cardId: string, preferredPrintingId: string | null) => string | null;
  showAllCopies: boolean;
  statsFocus: StatsFocus | null;
  groupCards: (cards: DeckBuilderCard[]) => DeckCardGroup[];
  sortCards: (cards: DeckBuilderCard[]) => DeckBuilderCard[];
  groupBy: DeckOverviewGroup;
  stacked: boolean;
  zone: DeckZone;
  label: string;
  cards: DeckBuilderCard[];
  allCards: DeckBuilderCard[];
  expected: number | undefined;
  emptyHint: string;
  unknownCount?: number;
  collapsedZones: ReadonlySet<CollapsibleDeckSection>;
  onToggleCollapsed: (zone: DeckZone) => void;
  zoneViolations: DeckViolation[];
  format: DeckFormat;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  onHoverCard?: HoverHandler;
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
  readOnly?: boolean;
  onCardClick?: (card: CardOpenTarget) => void;
}

export function ZoneTile({
  deckId,
  bandByCardKey,
  priceTextByCardKey,
  addRoomByCardKey,
  resolveHoverPrintingId,
  showAllCopies,
  statsFocus,
  groupCards,
  sortCards,
  groupBy,
  stacked,
  zone,
  label,
  cards,
  allCards,
  expected,
  emptyHint,
  unknownCount = 0,
  collapsedZones,
  onToggleCollapsed,
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
  const hoverCard = overviewHoverHandler(stacked, onHoverCard);

  const groups = GROUPED_ZONES.has(zone) ? groupCards(cards) : null;
  const unknownSlots =
    unknownCount > 0 ? <UnknownSlots count={unknownCount} isLandscape={isLandscape} /> : null;

  const { dropRef, isOver, dropDisabled } = useDeckZoneDrop({
    id: `overview-zone-${zone}`,
    zone,
    allCards,
    format,
    disabled: readOnly,
  });

  const headerLabel = (
    <span className="text-2xs font-semibold tracking-wide uppercase">{label}</span>
  );

  return (
    <div
      ref={readOnly ? undefined : dropRef}
      style={style}
      className={cn(
        "relative flex flex-col gap-2 rounded-lg transition-all",
        !readOnly && isOver && !dropDisabled && "ring-primary/60 ring-2 ring-offset-2",
        !readOnly && dropDisabled && "opacity-40",
        className,
      )}
    >
      {/* Fixed height keeps sibling zone headers aligned whether the violation icon shows or not. */}
      <div className="flex h-6 items-center gap-2 border-b">
        <ExpandToggle
          expanded={!collapsed}
          onClick={() => onToggleCollapsed(zone)}
          aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
          chevronClassName="size-3.5"
          className="shrink-0 rounded-md"
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
            hasViolation
              ? "text-destructive"
              : isComplete
                ? "text-success"
                : "text-muted-foreground",
          )}
        >
          {unknownCount > 0 && expected !== undefined ? (
            `${quantity} of ${expected} known`
          ) : (
            <>
              {quantity}
              {expected !== undefined && `/${expected}`}
              {/* Sideboard's number is a cap, not a goal, so it never gets a "more" hint. */}
              {expected !== undefined &&
                zone !== WellKnown.deckZone.SIDEBOARD &&
                quantity > 0 &&
                quantity < expected && (
                  <span className="text-muted-foreground/70"> · {expected - quantity} more</span>
                )}
            </>
          )}
        </span>
      </div>

      {collapsed ? null : isEmpty ? (
        unknownSlots ? (
          <div className="flex flex-wrap items-center gap-1.5">{unknownSlots}</div>
        ) : zone === WellKnown.deckZone.RUNES || readOnly || !onClick ? (
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
      ) : stacked && isLandscape && cards.length > 1 ? (
        <div className="flex flex-wrap items-start gap-1.5">
          <StackPile
            deckId={deckId}
            entries={expandCopies(cards, showAllCopies)}
            zone={zone}
            statsFocus={statsFocus}
            bandByCardKey={bandByCardKey}
            priceTextByCardKey={priceTextByCardKey}
            addRoomByCardKey={addRoomByCardKey}
            resolveHoverPrintingId={resolveHoverPrintingId}
            getThumbnail={getThumbnail}
            readOnly={readOnly}
            onCardClick={onCardClick}
          />
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
                style={LANDSCAPE_THUMB_STYLE}
                className={cn(
                  LANDSCAPE_THUMB_CLASS,
                  "h-auto shrink-0 flex-col gap-1 rounded-md font-normal",
                )}
              >
                <PlusIcon className="size-4" />
                <span className="text-muted-foreground text-xs">Add</span>
              </Button>
            )}
          {unknownSlots}
        </div>
      ) : groups ? (
        <>
          <GroupedThumbs
            deckId={deckId}
            bandByCardKey={bandByCardKey}
            priceTextByCardKey={priceTextByCardKey}
            addRoomByCardKey={addRoomByCardKey}
            resolveHoverPrintingId={resolveHoverPrintingId}
            showAllCopies={showAllCopies}
            statsFocus={statsFocus}
            zone={zone}
            groups={groups}
            sortCards={sortCards}
            groupBy={groupBy}
            stacked={stacked}
            isLandscape={isLandscape}
            onHoverCard={hoverCard}
            getThumbnail={getThumbnail}
            readOnly={readOnly}
            onCardClick={onCardClick}
          />
          {unknownSlots && (
            <div className="flex flex-wrap items-center gap-1.5">{unknownSlots}</div>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {expandCopies(cards, showAllCopies).map(({ card, copyIndex }) => {
            const thumbnail = getThumbnail(card.cardId, card.preferredPrintingId);
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
                onHoverCard={hoverCard}
                readOnly={readOnly}
                onCardClick={onCardClick}
              />
            );
          })}
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
          {unknownSlots}
        </div>
      )}
    </div>
  );
}
