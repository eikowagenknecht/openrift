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

export interface ZoneTileProps {
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
  /** Splits a grouped zone's cards along the chosen axis (see groupDeckCards). */
  groupCards: (cards: DeckBuilderCard[]) => DeckCardGroup[];
  /** Orders cards inside one sub-group (see sortDeckOverviewList). */
  sortCards: (cards: DeckBuilderCard[]) => DeckBuilderCard[];
  /** The active grouping axis — type groups keep their icons. */
  groupBy: DeckOverviewGroup;
  /** Stacks mode: grouped zones render overlapping piles instead of wraps. */
  stacked: boolean;
  zone: DeckZone;
  label: string;
  cards: DeckBuilderCard[];
  allCards: DeckBuilderCard[];
  expected: number | undefined;
  emptyHint: string;
  /** Sections currently collapsed to their header row (zones and the tokens band). */
  collapsedZones: ReadonlySet<CollapsibleDeckSection>;
  /** Toggles a zone's collapsed state (wired to the builder UI store). */
  onToggleCollapsed: (zone: DeckZone) => void;
  zoneViolations: DeckViolation[];
  format: DeckFormat;
  className?: string;
  /** Grid placement from the caller (the small-zone row's spans). */
  style?: React.CSSProperties;
  onClick?: () => void;
  onHoverCard?: HoverHandler;
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
  readOnly?: boolean;
  onCardClick?: (card: CardOpenTarget) => void;
}

/**
 * One zone of the deck overview's thumbnail grid: a small-caps label over a
 * hairline rule, with the zone's cards beneath it as thumbnails, piles, or an
 * empty-state affordance. Also the zone's drop target.
 * @returns The zone tile.
 */
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

  // Grouped zones split along the user's axis and sort inside each group
  // (curve order by default); single-card zones keep the API-provided order
  // (alphabetical by card name within the zone), matching the sidebar.
  const groups = GROUPED_ZONES.has(zone) ? groupCards(cards) : null;

  // Drop-target wiring — the same hook the sidebar's zone sections use, so the
  // two reject the same drags (copy limit, battlefield dedupe, 12-rune cap,
  // type compatibility).
  const { dropRef, isOver, dropDisabled } = useDeckZoneDrop({
    id: `overview-zone-${zone}`,
    zone,
    allCards,
    format,
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
        // Same ring + offset as the sidebar's zone rows (deck-zone-section),
        // so the two drop-target markings read identically.
        !readOnly && isOver && !dropDisabled && "ring-primary/60 ring-2 ring-offset-2",
        !readOnly && dropDisabled && "opacity-40",
        className,
      )}
    >
      {/* Fixed height so the violation icon (a 20px button) can't stretch one
          tile's header past its row-mates' — side-by-side zones keep their
          rules aligned whether or not an issue is showing. */}
      <div className="flex h-6 items-center gap-2 border-b">
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
        </div>
      ) : groups ? (
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
