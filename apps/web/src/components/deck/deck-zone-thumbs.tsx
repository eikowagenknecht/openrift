import { useDraggable } from "@dnd-kit/core";
import type { DeckZone } from "@openrift/shared/types/enums";
import { legendDisplayName } from "@openrift/shared/utils";
import { ImageOffIcon, MinusIcon, PinIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { AFTER_BORDER } from "@/components/cards/card-thumbnail";
import { DeckCardPrintingMenu } from "@/components/deck/deck-card-printing-menu";
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
import { CARD_BORDER_RADIUS } from "@/lib/card-grid-constants";
import type { CardOpenTarget, HoverHandler } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { cardInteractiveProps, deckCardDragData } from "@/lib/deck-card-interaction";
import { DRAG_SOURCE_ZONES } from "@/lib/deck-dnd-data";
import { STEPPER_ZONES } from "@/lib/deck-overview-derive";
import type { OwnershipBandSegments } from "@/lib/deck-ownership-band";
import { ownershipBandTitle } from "@/lib/deck-ownership-band";
import { cn } from "@/lib/utils";
import { useSelectionStore } from "@/stores/selection-store";

/**
 * Its own component so the builder-action hooks never mount on read-only
 * surfaces (the share page renders no controls at all).
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
  addRoom: number;
  perCopy: boolean;
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
                "bg-background/80 hover:bg-background absolute top-1 right-1 size-5 rounded-md",
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
  band?: OwnershipBandSegments;
  priceText?: string;
  addRoom?: number;
  hoverPrintingId?: string | null;
  copyIndex?: number | null;
  dimmed?: boolean;
  zone: DeckZone;
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
  // Top-left, to clear the ownership band along the bottom edge and the
  // ×N badge at bottom-right.
  const hasCustomPrinting = card.preferredPrintingId !== null;
  // Match on (zone, cardId) so a card in multiple zones only lights up at
  // the instance the user actually clicked.
  const isSelected = useSelectionStore(
    (state) => state.selectedZone === zone && state.selectedCard?.cardId === card.cardId,
  );

  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `overview-thumb-${card.cardId}-${zone}-${card.preferredPrintingId ?? "default"}-${copyIndex ?? "stack"}`,
    data: deckCardDragData(card, zone, displayName),
    disabled: !enableDrag,
  });

  // Keyed by URL so a changed printing pick retries fresh.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showFallback = !thumbnail || thumbnail === failedUrl;

  const interactiveProps = cardInteractiveProps(card, onCardClick);

  const thumbBody = (
    // @container: the badge below is sized in cqw, tracking the thumb at any column count.
    <div
      ref={enableDrag ? setNodeRef : undefined}
      style={{
        ...(isLandscape ? LANDSCAPE_THUMB_STYLE : PORTRAIT_THUMB_STYLE),
        borderRadius: CARD_BORDER_RADIUS,
      }}
      className={cn(
        "group/thumb @container relative shrink-0",
        // The fallback name card draws its own dashed outline instead.
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
          className="bg-background/70 absolute top-1 left-1 rounded-md p-0.5"
        >
          <PinIcon className="text-muted-foreground size-2.5" />
        </span>
      )}
      {card.quantity > 1 && (copyIndex === null || copyIndex === undefined) && (
        <span
          className={cn(
            "bg-background/90 text-foreground absolute leading-tight font-medium tabular-nums",
            editable && (isMobile ? "hidden" : "group-hover/thumb:hidden"),
          )}
          // 11px floor: 10% of a narrow thumb would shrink below readability.
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
      {band && (
        <span
          title={ownershipBandTitle(card.quantity, band)}
          style={{
            borderBottomLeftRadius: "5% 100%",
            borderBottomRightRadius: "5% 100%",
          }}
          className="absolute inset-x-0 bottom-0 flex h-0.5 overflow-hidden"
        >
          {band.exact > 0 && (
            <span className="bg-success" style={{ flexGrow: band.exact, flexBasis: 0 }} />
          )}
          {band.other > 0 && (
            <span className="bg-info" style={{ flexGrow: band.other, flexBasis: 0 }} />
          )}
          {band.borrowed > 0 && (
            <span className="bg-violet" style={{ flexGrow: band.borrowed, flexBasis: 0 }} />
          )}
          {band.locked > 0 && (
            <span className="bg-warning" style={{ flexGrow: band.locked, flexBasis: 0 }} />
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
