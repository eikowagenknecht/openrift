import { useDraggable } from "@dnd-kit/core";
import type { DeckZone } from "@openrift/shared";
import { WellKnown, legendDisplayName } from "@openrift/shared";
import {
  AlertTriangleIcon,
  HandHeartIcon,
  LockIcon,
  MinusIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";

import type { DeckCardDragData } from "@/components/deck/deck-dnd-context";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { HoverHandler } from "@/lib/card-row-interactions";
import { cardHoverProps, rowActivateProps } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDomainColor, getDomainGradientStyle } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

type ControlMode =
  | "quantity" // +/- with count (main, sideboard, runes)
  | "remove-only" // just an XIcon button (legend, champion, battlefield)
  | "none"; // no controls (search panel results)

interface DeckCardRowProps {
  card: DeckBuilderCard;
  hasViolation?: boolean;
  violationMessage?: string;
  /**
   * Copies still missing from the viewer's collection for this row. Rendered
   * as an amber owned/needed fraction; omit (or 0) to show nothing — fully
   * owned rows stay quiet.
   */
  shortfall?: number;
  /**
   * Copies the viewer holds but which are locked away from deck building
   * (loan, trade reservation, excluded collection), capped to this row's
   * shortfall. Rendered as a muted lock glyph with the count.
   */
  locked?: number;
  /** Tooltip sentence for the lock glyph — from `lockedReasonText`. */
  lockedReason?: string;
  /**
   * Copies of this row the viewer is borrowing from a friend (ADR-039). The
   * opposite sign of `locked`: these are in hand and already counted as
   * buildable, which is why they need their own glyph — they shrink the
   * shortfall, so a fully-borrowed row would otherwise render nothing at all.
   */
  borrowed?: number;
  /** Tooltip sentence for the borrow glyph — from `borrowedReasonText`. */
  borrowedReason?: string;
  dimmed?: boolean;
  controlMode?: ControlMode;
  /** Largest copy count in this row's zone — used to size the count column so names align. */
  maxQuantity?: number;
  draggable?: boolean;
  shiftHeld?: boolean;
  onIncrement?: (event: React.MouseEvent) => void;
  onDecrement?: (event: React.MouseEvent) => void;
  onRemove?: () => void;
  onClick?: () => void;
  onHover?: HoverHandler;
  onContextMenu?: (event: React.MouseEvent) => void;
}

/**
 * The wild Power symbol: a cost payable with a rune of any domain. Same glyph
 * the card art and the card designer reach for when a card has no single domain
 * rune to show — `/images/domains/colorless.svg` is the colorless *domain's*
 * icon and does not mean "any", which is what this used to draw here.
 */
const WILD_RUNE_ICON = "/images/glyphs/rune-rainbow.svg";

/**
 * One power pip: the card's domain rune, or the wild rune when it has no single
 * one. Mirrors `CardPlaceholderImage` and the designer, which pick the same
 * glyph for the same card. Decorative on purpose — `PowerPips` names the whole
 * stack once rather than letting a 4-power card announce its domain four times.
 * @returns The pip glyph.
 */
export function PowerDomainIcon({
  domains,
  colors,
}: {
  domains: string[];
  colors: Record<string, string>;
}) {
  const domain = domains[0] ?? WellKnown.domain.COLORLESS;
  if (domains.length === 1 && domain !== WellKnown.domain.COLORLESS) {
    const domainIcon = getFilterIconPath("domains", domain);
    return domainIcon ? <img src={domainIcon} alt="" className="inline size-3" /> : null;
  }
  // The domain badges ship as .webp and carry their own color, but both glyphs
  // below are SVG shapes filled with `currentColor` — inside an <img> that
  // resolves against the SVG's own document, paints black, and disappears in
  // dark mode. The other surfaces tint them against a domain-colored pip; a
  // deck row has no pip behind them, so the glyph paints the card's domain
  // colors itself through a mask.
  const icon =
    domains.length > 1 ? WILD_RUNE_ICON : getFilterIconPath("domains", WellKnown.domain.COLORLESS);
  const c1 = getDomainColor(domain, colors);
  const c2 = getDomainColor(domains[1] ?? domain, colors);
  return (
    <span
      aria-hidden
      className="inline-block size-3"
      style={{
        background: `linear-gradient(135deg, ${c1} 30%, ${c2} 70%)`,
        mask: `url(${icon}) center / contain no-repeat`,
        WebkitMask: `url(${icon}) center / contain no-repeat`,
      }}
    />
  );
}

/**
 * A card's power cost, one rune pip per point. The stack carries the accessible
 * name for all of them, since the pips repeat a single fact and reading it once
 * per pip is noise; a card with no power cost renders nothing at all.
 * @returns The pip row, or null when there is no power cost.
 */
export function PowerPips({
  power,
  domains,
  colors,
  domainLabels,
}: {
  power: number | null;
  domains: string[];
  colors: Record<string, string>;
  /** Slug → display name, from `useEnumOrders().labels.domains`. */
  domainLabels: Record<string, string>;
}) {
  if (power === null || power <= 0) {
    return null;
  }
  const named = domains.map((domain) => domainLabels[domain]).join(", ");
  const label = named.length > 0 ? `Power ${power} (${named})` : `Power ${power}`;
  return (
    <span role="img" aria-label={label} className="flex shrink-0 items-center gap-0.5">
      {Array.from({ length: power }, (_, index) => (
        <PowerDomainIcon key={index} domains={domains} colors={colors} />
      ))}
    </span>
  );
}

/**
 * A card's energy cost. Named like the power pips beside it, so the two costs
 * don't read as a bare number next to a labelled one.
 * @returns The energy glyph.
 */
export function EnergyGlyph({ value }: { value: number }) {
  return (
    <span
      role="img"
      aria-label={`Energy ${value}`}
      className="text-2xs flex size-4 shrink-0 items-center justify-center rounded-full bg-white leading-none font-bold text-[#013951]"
    >
      {value}
    </span>
  );
}

function CardControls({
  controlMode,
  quantity,
  countWidthClass,
  shiftHeld,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  controlMode: ControlMode;
  quantity: number;
  countWidthClass: string;
  shiftHeld?: boolean;
  onIncrement?: (event: React.MouseEvent) => void;
  onDecrement?: (event: React.MouseEvent) => void;
  onRemove?: () => void;
}) {
  if (controlMode === "none") {
    return null;
  }

  if (controlMode === "remove-only") {
    // Collapse the button out of layout until hover (display-based, like the +/-
    // buttons) so the name sits flush-left instead of being indented by an empty
    // delete slot. Always shown on touch, where there is no hover.
    return (
      <span className="contents md:hidden md:group-hover/card:contents">
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-5 shrink-0"
          onClick={(event) => {
            event.stopPropagation();
            onRemove?.();
          }}
        >
          <XIcon className="size-3" />
        </Button>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="contents md:hidden md:group-hover/card:contents">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={shiftHeld && quantity > 1 ? "destructive" : "ghost"}
                size="icon-sm"
                className="size-5"
                onClick={(event) => {
                  event.stopPropagation();
                  onDecrement?.(event);
                }}
                disabled={!onDecrement}
              />
            }
          >
            {shiftHeld && quantity > 1 ? (
              <span className="text-2xs leading-none font-semibold">-{quantity}</span>
            ) : (
              <MinusIcon className="size-3" />
            )}
          </TooltipTrigger>
          <TooltipContent>Shift+click to remove all</TooltipContent>
        </Tooltip>
      </span>
      <span className={cn("text-right text-xs font-medium tabular-nums", countWidthClass)}>
        {quantity}×
      </span>
      <span className="contents md:hidden md:group-hover/card:contents">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={shiftHeld && onIncrement ? "default" : "ghost"}
                size="icon-sm"
                className="size-5"
                onClick={(event) => {
                  event.stopPropagation();
                  onIncrement?.(event);
                }}
                disabled={!onIncrement}
              />
            }
          >
            <PlusIcon className="size-3" />
          </TooltipTrigger>
          <TooltipContent>Shift+click to add max</TooltipContent>
        </Tooltip>
      </span>
    </span>
  );
}

export function DeckCardRow({
  card,
  hasViolation,
  violationMessage,
  shortfall,
  locked,
  lockedReason,
  borrowed,
  borrowedReason,
  dimmed,
  controlMode = "quantity",
  maxQuantity,
  draggable,
  shiftHeld,
  onIncrement,
  onDecrement,
  onRemove,
  onClick,
  onHover,
  onContextMenu,
}: DeckCardRowProps) {
  const isMobile = useIsMobile();
  const domainColors = useDomainColors();
  const { labels } = useEnumOrders();
  const enableDrag = draggable && !isMobile;

  const dragData: DeckCardDragData = {
    type: "deck-card",
    cardId: card.cardId,
    cardName: legendDisplayName({ name: card.cardName, types: card.cardTypes, tags: card.tags }),
    fromZone: card.zone as DeckZone,
    quantity: card.quantity,
    preferredPrintingId: card.preferredPrintingId,
  };

  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `deck-card-${card.cardId}-${card.zone}-${card.preferredPrintingId ?? "default"}`,
    data: dragData,
    disabled: !enableDrag,
  });

  // When dragging 1 copy from a multi-copy stack, show the remaining count
  const displayQuantity = isDragging && card.quantity > 1 ? card.quantity - 1 : card.quantity;

  // Size the count column to the widest count in the zone so card names line up.
  // Single-digit zones (the common case) stay tight; only mixed/10×+ zones widen.
  const countDigits = String(maxQuantity ?? card.quantity).length;
  const countWidthClass = countDigits >= 3 ? "w-9" : countDigits === 2 ? "w-7" : "w-4";

  const domainTint = getDomainGradientStyle(card.domains, "40", domainColors);

  const baseClass = cn(
    "group/card flex items-center gap-1.5 rounded px-1 py-1 text-sm",
    dimmed && "opacity-50",
    hasViolation && "bg-destructive/10",
    isDragging && card.quantity === 1 && "opacity-40",
  );

  const content = (
    <>
      {hasViolation && (
        <Tooltip>
          <TooltipTrigger className="shrink-0">
            <AlertTriangleIcon className="text-destructive size-3.5" />
          </TooltipTrigger>
          {violationMessage && <TooltipContent>{violationMessage}</TooltipContent>}
        </Tooltip>
      )}

      <CardControls
        controlMode={controlMode}
        quantity={displayQuantity}
        countWidthClass={countWidthClass}
        shiftHeld={shiftHeld}
        onIncrement={onIncrement}
        onDecrement={onDecrement}
        onRemove={onRemove}
      />

      <span className="min-w-0 flex-1 truncate text-left">
        {legendDisplayName({ name: card.cardName, types: card.cardTypes, tags: card.tags })}
      </span>

      {shortfall !== undefined && shortfall > 0 && (
        <Tooltip>
          <TooltipTrigger className="shrink-0">
            <span className="text-2xs text-amber-600 tabular-nums dark:text-amber-500">
              {card.quantity - shortfall}/{card.quantity}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            You have {card.quantity - shortfall} of {card.quantity}{" "}
            {card.quantity === 1 ? "copy" : "copies"}
          </TooltipContent>
        </Tooltip>
      )}

      {locked !== undefined && locked > 0 && (
        <Tooltip>
          <TooltipTrigger className="text-muted-foreground flex shrink-0 items-center gap-0.5">
            <LockIcon className="size-3" />
            <span className="text-2xs tabular-nums">{locked}</span>
          </TooltipTrigger>
          <TooltipContent>{lockedReason}</TooltipContent>
        </Tooltip>
      )}

      {borrowed !== undefined && borrowed > 0 && (
        <Tooltip>
          <TooltipTrigger className="text-muted-foreground flex shrink-0 items-center gap-0.5">
            <HandHeartIcon className="size-3" />
            <span className="text-2xs tabular-nums">{borrowed}</span>
          </TooltipTrigger>
          <TooltipContent>{borrowedReason}</TooltipContent>
        </Tooltip>
      )}

      <PowerPips
        power={card.power}
        domains={card.domains}
        colors={domainColors}
        domainLabels={labels.domains}
      />

      {card.energy !== null && <EnergyGlyph value={card.energy} />}
    </>
  );

  const dragProps = enableDrag ? { ...listeners, ...attributes } : {};
  const hoverProps = cardHoverProps(onHover, card.cardId, card.preferredPrintingId);

  if (onClick) {
    return (
      <div
        ref={enableDrag ? setNodeRef : undefined}
        className={cn(enableDrag && "cursor-grab active:cursor-grabbing")}
        {...dragProps}
        {...hoverProps}
      >
        <div
          className={cn(baseClass, "hover:bg-muted/50 w-full cursor-pointer")}
          style={domainTint}
          onContextMenu={onContextMenu}
          {...rowActivateProps(onClick)}
        >
          {content}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={enableDrag ? setNodeRef : undefined}
      className={cn(baseClass, enableDrag && "cursor-grab active:cursor-grabbing")}
      style={domainTint}
      onContextMenu={onContextMenu}
      {...dragProps}
      {...hoverProps}
    >
      {content}
    </div>
  );
}
