import { useDraggable } from "@dnd-kit/core";
import type { DeckZone } from "@openrift/shared/types/enums";
import { legendDisplayName } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";
import {
  AlertTriangleIcon,
  HandHeartIcon,
  LockIcon,
  MinusIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { HoverHandler } from "@/features/cards/lib/card-row-interactions";
import { cardHoverProps, rowActivateProps } from "@/features/cards/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import type { DeckCardDragData } from "@/features/decks/lib/deck-dnd-data";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { getDomainColor, getDomainGradientStyle } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

type ControlMode = "quantity" | "remove-only" | "none";

interface DeckCardRowProps {
  card: DeckBuilderCard;
  hasViolation?: boolean;
  violationMessage?: string;
  shortfall?: number;
  locked?: number;
  lockedReason?: string;
  borrowed?: number;
  borrowedReason?: string;
  dimmed?: boolean;
  controlMode?: ControlMode;
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

// `/images/domains/colorless.svg` is the colorless *domain's* icon, not a
// wild/any-domain glyph; the rainbow rune is used for that instead.
const WILD_RUNE_ICON = "/images/glyphs/rune-rainbow.svg";

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
  // These glyphs are `currentColor` SVGs; inside an <img> that paints black
  // and vanishes in dark mode, so they're masked and tinted instead.
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

export function PowerPips({
  power,
  domains,
  colors,
  domainLabels,
}: {
  power: number | null;
  domains: string[];
  colors: Record<string, string>;
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
    // Collapsed out of layout until hover so the name sits flush-left; always
    // shown on touch, where there is no hover.
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

  const displayQuantity = isDragging && card.quantity > 1 ? card.quantity - 1 : card.quantity;

  const countDigits = String(maxQuantity ?? card.quantity).length;
  const countWidthClass = countDigits >= 3 ? "w-9" : countDigits === 2 ? "w-7" : "w-4";

  const domainTint = getDomainGradientStyle(card.domains, "40", domainColors);

  const baseClass = cn(
    "group/card flex items-center gap-1.5 rounded-md px-1 py-1 text-sm",
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
            <span className="text-2xs text-warning tabular-nums">
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
