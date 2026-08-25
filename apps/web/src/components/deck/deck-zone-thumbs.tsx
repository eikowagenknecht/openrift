import { useDraggable } from "@dnd-kit/core";
import type { DeckZone } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { ImageOffIcon, MinusIcon, PinIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { AFTER_BORDER } from "@/components/cards/card-thumbnail";
import { DeckCardPrintingMenu } from "@/components/deck/deck-card-printing-menu";
import { DRAG_SOURCE_ZONES } from "@/components/deck/deck-dnd-context";
import {
  LANDSCAPE_THUMB_CLASS,
  LANDSCAPE_THUMB_STYLE,
  PORTRAIT_THUMB_CLASS,
  PORTRAIT_THUMB_STYLE,
} from "@/components/deck/deck-thumb-metrics";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeckBuilderActions } from "@/hooks/use-deck-builder";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { CardOpenTarget, HoverHandler } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { cardInteractiveProps, deckCardDragData } from "@/lib/deck-card-interaction";
import { STEPPER_ZONES } from "@/lib/deck-overview-derive";
import type { OwnershipBandSegments } from "@/lib/deck-ownership-band";
import { ownershipBandTitle } from "@/lib/deck-ownership-band";
import { cn } from "@/lib/utils";
import { useSelectionStore } from "@/stores/selection-store";

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

/**
 * One card in a deck zone, drawn as its thumbnail: the art, its ×N badge, the
 * optional price chip and collection band, and — in the editor — the hover
 * controls layered on top.
 * @returns The thumbnail.
 */
export function ZoneThumb({
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
  /** Absent when the shown printing has no image — renders the name card. */
  thumbnail?: string;
  isLandscape: boolean;
  onHoverCard?: HoverHandler;
  readOnly?: boolean;
  onCardClick?: (card: CardOpenTarget) => void;
}) {
  const isMobile = useIsMobile();
  const enableDrag = !readOnly && !isMobile && DRAG_SOURCE_ZONES.has(zone);
  const editable = !readOnly;
  const displayName = legendDisplayName({
    name: card.cardName,
    types: card.cardTypes,
    tags: card.tags,
  });
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

  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `overview-thumb-${card.cardId}-${zone}-${card.preferredPrintingId ?? "default"}-${copyIndex ?? "stack"}`,
    data: deckCardDragData(card, zone, displayName),
    disabled: !enableDrag,
  });

  // A missing or failed thumbnail degrades to a name card in the same slot,
  // keeping the stepper and printing menu reachable so the pick can be fixed.
  // Keyed by URL so a changed printing pick retries fresh.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showFallback = !thumbnail || thumbnail === failedUrl;

  const interactiveProps = cardInteractiveProps(card, onCardClick);

  const thumbBody = (
    // The wrapper (not the img) carries the size so it can be a size container:
    // the badge below is sized in cqw and scales with the thumb at any column
    // count instead of sitting at one fixed step.
    <div
      ref={enableDrag ? setNodeRef : undefined}
      style={{
        ...(isLandscape ? LANDSCAPE_THUMB_STYLE : PORTRAIT_THUMB_STYLE),
        // The canonical proportional card radius, same as the /cards grid.
        borderRadius: CARD_BORDER_RADIUS,
      }}
      className={cn(
        "group/thumb @container relative shrink-0",
        // The card-edge border only frames real art; the fallback name card
        // draws its own dashed outline instead.
        !showFallback && AFTER_BORDER,
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
      {showFallback ? (
        <div className="border-muted-foreground/25 bg-muted/30 flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-[inherit] border border-dashed p-2 text-center">
          <ImageOffIcon aria-hidden="true" className="text-muted-foreground/70 size-5 shrink-0" />
          <span className="text-muted-foreground line-clamp-3 text-xs">{displayName}</span>
        </div>
      ) : (
        <img
          src={thumbnail}
          alt={displayName}
          className="h-full w-full rounded-[inherit] object-cover shadow-sm"
          draggable={false}
          onError={() => setFailedUrl(thumbnail)}
        />
      )}
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
          violet for copies borrowed from a friend, amber for copies locked away
          from deck building, and clear for the ones still missing. Sits on the
          card's bottom edge so a zone reads as a row of progress ticks. */}
      {band && (
        <span
          title={ownershipBandTitle(card.quantity, band)}
          // The bottom corners follow the card's horizontal radius (5% of the
          // width, like CARD_BORDER_RADIUS) so the band stays inside the
          // rounded corners; 100% vertical just curves the band's own 2px.
          style={{
            borderBottomLeftRadius: "5% 100%",
            borderBottomRightRadius: "5% 100%",
          }}
          className="absolute inset-x-0 bottom-0 flex h-0.5 overflow-hidden"
        >
          {band.exact > 0 && (
            <span className="bg-green-500" style={{ flexGrow: band.exact, flexBasis: 0 }} />
          )}
          {band.other > 0 && (
            <span className="bg-sky-500" style={{ flexGrow: band.other, flexBasis: 0 }} />
          )}
          {band.borrowed > 0 && (
            <span className="bg-violet-500" style={{ flexGrow: band.borrowed, flexBasis: 0 }} />
          )}
          {band.locked > 0 && (
            <span className="bg-amber-500" style={{ flexGrow: band.locked, flexBasis: 0 }} />
          )}
          {band.missing > 0 && <span style={{ flexGrow: band.missing, flexBasis: 0 }} />}
        </span>
      )}
    </div>
  );

  if (readOnly) {
    return thumbBody;
  }

  return (
    <DeckCardPrintingMenu deckId={deckId} card={card}>
      {thumbBody}
    </DeckCardPrintingMenu>
  );
}
