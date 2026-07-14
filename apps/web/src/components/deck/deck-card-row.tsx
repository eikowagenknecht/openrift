import { useDraggable } from "@dnd-kit/core";
import type { DeckZone } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { AlertTriangleIcon, MinusIcon, PlusIcon, XIcon } from "lucide-react";

import type { DeckCardDragData } from "@/components/deck/deck-dnd-context";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useIsMobile } from "@/hooks/use-is-mobile";
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
  onHover?: (cardId: string | null, preferredPrintingId?: string | null) => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}

export function PowerDomainIcon({
  domains,
  colors,
}: {
  domains: string[];
  colors: Record<string, string>;
}) {
  if (domains.length === 1) {
    const domainIcon = getFilterIconPath("domains", domains[0]);
    return domainIcon ? <img src={domainIcon} alt={domains[0]} className="inline size-3" /> : null;
  }
  const c1 = getDomainColor(domains[0], colors);
  const c2 = getDomainColor(domains[1], colors);
  return (
    <span
      className="inline-block size-3"
      style={{
        background: `linear-gradient(135deg, ${c1} 30%, ${c2} 70%)`,
        mask: "url(/images/domains/colorless.svg) center / contain no-repeat",
        WebkitMask: "url(/images/domains/colorless.svg) center / contain no-repeat",
      }}
    />
  );
}

export function EnergyGlyph({ value }: { value: number }) {
  return (
    <span className="text-2xs flex size-4 shrink-0 items-center justify-center rounded-full bg-white leading-none font-bold text-[#013951]">
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

      {card.power !== null && card.power > 0 && (
        <span className="flex shrink-0 items-center gap-0.5">
          {Array.from({ length: card.power }, (_, index) => (
            <PowerDomainIcon key={index} domains={card.domains} colors={domainColors} />
          ))}
        </span>
      )}

      {card.energy !== null && <EnergyGlyph value={card.energy} />}
    </>
  );

  const dragProps = enableDrag ? { ...listeners, ...attributes } : {};
  const hoverProps = onHover
    ? {
        onMouseEnter: () => onHover(card.cardId, card.preferredPrintingId),
        onMouseLeave: () => onHover(null),
      }
    : {};

  if (onClick) {
    return (
      <div
        ref={enableDrag ? setNodeRef : undefined}
        className={cn(enableDrag && "cursor-grab active:cursor-grabbing")}
        {...dragProps}
        {...hoverProps}
      >
        {/* oxlint-disable jsx-a11y/prefer-tag-over-role -- children contain <button> elements; a native button would create invalid nested buttons */}
        <div
          role="button"
          tabIndex={0}
          className={cn(baseClass, "hover:bg-muted/50 w-full cursor-pointer")}
          style={domainTint}
          onClick={onClick}
          onContextMenu={onContextMenu}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onClick();
            }
          }}
        >
          {content}
        </div>
        {/* oxlint-enable jsx-a11y/prefer-tag-over-role */}
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
