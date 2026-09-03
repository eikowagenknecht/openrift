import { useDraggable } from "@dnd-kit/core";
import type { DeckZone } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { useState } from "react";

import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { AFTER_BORDER } from "@/components/cards/card-thumbnail";
import { DeckCardPrintingMenu } from "@/components/deck/deck-card-printing-menu";
import { DRAG_SOURCE_ZONES } from "@/components/deck/deck-dnd-context";
import type { StackStripVariant } from "@/components/deck/deck-overview-geometry";
import {
  isLandscapeCard,
  STACK_GAP_PX,
  stackStripGeometry,
} from "@/components/deck/deck-overview-geometry";
import { ZoneThumb } from "@/components/deck/deck-zone-thumbs";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { CardOpenTarget } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDeckCardKey } from "@/lib/deck-builder-card";
import { cardInteractiveProps, deckCardDragData } from "@/lib/deck-card-interaction";
import type { OwnershipBandSegments } from "@/lib/deck-ownership-band";
import type { StatsFocus } from "@/lib/deck-stats-focus";
import { cardMatchesStatsFocus } from "@/lib/deck-stats-focus";
import { cn } from "@/lib/utils";
import { useSelectionStore } from "@/stores/selection-store";

/**
 * One buried card in a stacks-mode pile: a horizontal window onto the card's
 * name bar, styled as its own small tile (rounded corners, hairline ring,
 * gap to its neighbors). Riftbound prints the name mid-card at a per-type
 * height (unit / spell / gear higher, legend / rune lower), so a top crop
 * the way MTG stacks do would never show it; cutting the name bar keeps the
 * pile legible, and the separated-tile styling makes it read as a stack of
 * labeled dividers rather than one card sliced apart. Hovering raises the
 * usual floating full-card preview; click, drag, and the printing menu match
 * the full thumbs.
 * @returns The strip element.
 */
function StackStrip({
  deckId,
  card,
  copyIndex,
  dimmed,
  variant,
  expanded,
  zone,
  thumbnail,
  readOnly,
  onCardClick,
}: {
  deckId: string;
  card: DeckBuilderCard;
  /** Set when "show every copy" expanded this strip: hides the ×N chip. */
  copyIndex?: number | null;
  /** Stats-chart focus active and this card isn't in it — render faded. */
  dimmed?: boolean;
  /**
   * Resting window: the pile's "top" card is the art anchor (its whole top
   * half down through the name bar); every other card shows the name bar
   * alone, so the pile reads as a cover card over a uniform index.
   */
  variant: StackStripVariant;
  /** Unfold the full card (pile hover hit-testing, or the selected card). */
  expanded: boolean;
  zone: DeckZone;
  /** Absent when the shown printing has no image — renders the text strip. */
  thumbnail?: string;
  readOnly?: boolean;
  onCardClick?: (card: CardOpenTarget) => void;
}) {
  const isMobile = useIsMobile();
  const enableDrag = !readOnly && !isMobile && DRAG_SOURCE_ZONES.has(zone);
  const displayName = legendDisplayName({
    name: card.cardName,
    types: card.cardTypes,
    tags: card.tags,
  });
  const isSelected = useSelectionStore(
    (state) => state.selectedZone === zone && state.selectedCard?.cardId === card.cardId,
  );

  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `overview-stack-${card.cardId}-${zone}-${card.preferredPrintingId ?? "default"}-${copyIndex ?? "stack"}`,
    data: deckCardDragData(card, zone, displayName),
    disabled: !enableDrag,
  });

  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const interactiveProps = cardInteractiveProps(card, onCardClick);

  // Resting window per variant, as fractions of the card's height; the pile
  // owns hover hit-testing (see StackPile), so the geometry is driven purely
  // by the `expanded` prop and the transitions animate the inline changes.
  // Both read the same model, so the pile's hit boxes can't drift off the
  // rows they are testing against.
  const geometry = stackStripGeometry(card, variant);
  const stripWidth = `calc(var(--deck-card-w) * ${geometry.widthRatio})`;
  const stripHeight = `calc(var(--deck-card-w) * ${geometry.cardHeightRatio * geometry.restFraction})`;
  const cardHeight = `calc(var(--deck-card-w) * ${geometry.cardHeightRatio})`;
  // The image anchors to the strip's bottom edge, at the name bar's lower
  // edge; expanding slides it to the card's true bottom as the strip grows.
  const imageBottomOffset = `calc(var(--deck-card-w) * ${-geometry.cardHeightRatio * (1 - geometry.band.y1)})`;

  const stripBody =
    !thumbnail || thumbnail === failedUrl ? (
      // A missing or failed image degrades to a text strip so the pile keeps
      // its slot and the card stays reachable.
      <div
        style={{
          width: stripWidth,
          height: stripHeight,
          borderRadius: geometry.restRadius,
        }}
        className={cn(
          "bg-muted text-muted-foreground flex shrink-0 items-center gap-1 truncate px-2 text-xs",
          dimmed && "opacity-25",
        )}
      >
        <span className="truncate">{displayName}</span>
        {card.quantity > 1 && (copyIndex === null || copyIndex === undefined) && (
          <span className="shrink-0 tabular-nums">×{card.quantity}</span>
        )}
      </div>
    ) : (
      <div
        ref={enableDrag ? setNodeRef : undefined}
        style={{
          width: stripWidth,
          height: expanded ? cardHeight : stripHeight,
          // The same absolute corner size in both states: unfolded it is the
          // canonical proportional card radius from the /cards grid, resting
          // it is that radius re-expressed against the width (the percentage
          // pair's height component would collapse on a thin slice).
          borderRadius: expanded ? CARD_BORDER_RADIUS : geometry.restRadius,
        }}
        className={cn(
          // Each strip is its own rounded tile (card-edge border + shadow +
          // the pile's gap), so the stack reads as labeled dividers, not one
          // cut-up card.
          "relative shrink-0 overflow-hidden shadow-sm",
          AFTER_BORDER,
          "transition-[height,border-radius] duration-200 ease-out motion-reduce:transition-none",
          expanded && "z-10 shadow-lg",
          enableDrag && "cursor-grab active:cursor-grabbing",
          onCardClick && !enableDrag && "cursor-pointer",
          isDragging && card.quantity === 1 && "opacity-40",
          isSelected && "ring-primary z-10 ring-2",
          dimmed && "opacity-25",
        )}
        {...interactiveProps}
        {...(enableDrag ? listeners : {})}
        {...(enableDrag ? attributes : {})}
      >
        <img
          src={thumbnail}
          alt={displayName}
          draggable={false}
          onError={() => setFailedUrl(thumbnail)}
          style={{ height: cardHeight, bottom: expanded ? "0px" : imageBottomOffset }}
          className="absolute left-0 w-full object-cover transition-[bottom] duration-200 ease-out motion-reduce:transition-none"
        />
        {card.quantity > 1 && (copyIndex === null || copyIndex === undefined) && (
          <span
            className={cn(
              "bg-background/85 text-foreground absolute right-1 rounded-md px-1.5 text-sm leading-tight font-medium tabular-nums",
              // Centered only in the thin middle slices so the larger size
              // never clips; the tall top anchor and the unfolded card keep
              // the grid badge's bottom-right corner.
              expanded || variant === "top" ? "bottom-1" : "top-1/2 -translate-y-1/2",
            )}
          >
            ×{card.quantity}
          </span>
        )}
      </div>
    );

  if (readOnly) {
    return stripBody;
  }

  return (
    <DeckCardPrintingMenu deckId={deckId} card={card}>
      {stripBody}
    </DeckCardPrintingMenu>
  );
}

/**
 * One stacks-mode pile. Owns the expansion state with deterministic hit-testing:
 * the expanded index is computed from the pointer's Y position against the
 * pile's own layout model (rest windows, the expanded card, the 1px gaps)
 * instead of CSS :hover. The browser only re-evaluates :hover on pointer
 * events, so while the pile animates under a slow-moving cursor, CSS hover
 * misses rows — the model can't, in either scan direction.
 *
 * Touch has no hover, so a tap takes its place: the first tap on a strip
 * unfolds it, and only a tap on the already-unfolded card opens the detail.
 * @returns The pile column.
 */
export function StackPile({
  deckId,
  entries,
  zone,
  bandByCardKey,
  priceTextByCardKey,
  addRoomByCardKey,
  resolveHoverPrintingId,
  statsFocus,
  getThumbnail,
  readOnly,
  onCardClick,
}: {
  deckId: string;
  entries: { card: DeckBuilderCard; copyIndex: number | null }[];
  zone: DeckZone;
  bandByCardKey: ReadonlyMap<string, OwnershipBandSegments>;
  priceTextByCardKey: ReadonlyMap<string, string>;
  addRoomByCardKey: ReadonlyMap<string, number>;
  resolveHoverPrintingId: (cardId: string, preferredPrintingId: string | null) => string | null;
  statsFocus: StatsFocus | null;
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
  readOnly?: boolean;
  onCardClick?: (card: CardOpenTarget) => void;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const coarsePointer = useCoarsePointer();
  // The selected card holds its expansion; the pile needs it for the layout
  // model, the strips' own subscription only draws the ring.
  const selectedCardId = useSelectionStore((state) =>
    state.selectedZone === zone ? (state.selectedCard?.cardId ?? null) : null,
  );

  const items = entries.map(({ card, copyIndex }) => ({
    card,
    copyIndex,
    thumbnail: getThumbnail(card.cardId, card.preferredPrintingId),
  }));

  // A single-card pile is just the card.
  const singleCardPile = items.length === 1;
  const variantFor = (index: number): StackStripVariant => (index === 0 ? "top" : "middle");
  const isExpanded = (index: number) =>
    !singleCardPile && (hoverIndex === index || items[index].card.cardId === selectedCardId);

  // The model mirrors the strips' geometry exactly (see stackStripGeometry):
  // rest windows per variant, full height when expanded, 1px gaps between rows.
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    // A tap synthesizes a mousemove before the click, which would unfold the
    // strip under the finger and let that same tap read as already unfolded.
    if (coarsePointer) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const pointerY = event.clientY - rect.top;
    let top = 0;
    let found: number | null = null;
    for (let index = 0; index < items.length; index++) {
      // A landscape pile is one landscape card wide, so `heightPerWidth` turns
      // the pile's measured width straight into a card height either way.
      const geometry = stackStripGeometry(items[index].card, variantFor(index));
      const cardHeightPx = width * geometry.heightPerWidth;
      const height =
        singleCardPile || isExpanded(index) ? cardHeightPx : cardHeightPx * geometry.restFraction;
      if (pointerY < top + height + STACK_GAP_PX) {
        found = index;
        break;
      }
      top += height + STACK_GAP_PX;
    }
    setHoverIndex(found);
  };

  const activateStrip = (index: number, target: CardOpenTarget) => {
    if (coarsePointer && !isExpanded(index)) {
      setHoverIndex(index);
      return;
    }
    onCardClick?.(target);
  };

  return (
    <div
      className="flex flex-col gap-1"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverIndex(null)}
    >
      {items.map(({ card, copyIndex, thumbnail }, index) =>
        singleCardPile ? (
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
            isLandscape={isLandscapeCard(card)}
            readOnly={readOnly}
            onCardClick={onCardClick}
          />
        ) : (
          <StackStrip
            key={`${getDeckCardKey(card)}-${copyIndex ?? "stack"}`}
            deckId={deckId}
            card={card}
            copyIndex={copyIndex}
            dimmed={statsFocus !== null && !cardMatchesStatsFocus(card, statsFocus)}
            variant={variantFor(index)}
            expanded={isExpanded(index)}
            zone={zone}
            thumbnail={thumbnail}
            readOnly={readOnly}
            onCardClick={onCardClick ? (target) => activateStrip(index, target) : undefined}
          />
        ),
      )}
    </div>
  );
}
