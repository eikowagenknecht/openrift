import { useDraggable } from "@dnd-kit/core";
import type { DeckZone } from "@openrift/shared";
import { COLORLESS_DOMAIN } from "@openrift/shared";
import { AlertTriangle, GripVertical, Minus, Plus, X } from "lucide-react";

import type { DeckCardDragData } from "@/components/deck/deck-dnd-context";
import { Button } from "@/components/ui/button";
import { getTypeIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { DeckBuilderCard } from "@/stores/deck-builder-store";

type ControlMode =
  | "quantity" // +/- with count (main, sideboard, runes)
  | "remove-only" // just an X button (legend, champion, battlefield)
  | "none"; // no controls (search panel results)

interface DeckCardRowProps {
  card: DeckBuilderCard;
  hasViolation?: boolean;
  violationMessage?: string;
  dimmed?: boolean;
  controlMode?: ControlMode;
  draggable?: boolean;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onRemove?: () => void;
  onClick?: () => void;
}

function DomainDot({ domain }: { domain: string }) {
  const lower = domain.toLowerCase();
  const ext = domain === COLORLESS_DOMAIN ? "svg" : "webp";
  return <img src={`/images/domains/${lower}.${ext}`} alt={domain} className="size-3.5" />;
}

function CardControls({
  controlMode,
  quantity,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  controlMode: ControlMode;
  quantity: number;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onRemove?: () => void;
}) {
  if (controlMode === "none") {
    return null;
  }

  if (controlMode === "remove-only") {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-5 shrink-0"
        onClick={(event) => {
          event.stopPropagation();
          onRemove?.();
        }}
      >
        <X className="size-3" />
      </Button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-5"
        onClick={(event) => {
          event.stopPropagation();
          onDecrement?.();
        }}
        disabled={!onDecrement}
      >
        <Minus className="size-3" />
      </Button>
      <span className="w-4 text-center text-xs font-medium">{quantity}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-5"
        onClick={(event) => {
          event.stopPropagation();
          onIncrement?.();
        }}
        disabled={!onIncrement}
      >
        <Plus className="size-3" />
      </Button>
    </span>
  );
}

export function DeckCardRow({
  card,
  hasViolation,
  violationMessage,
  dimmed,
  controlMode = "quantity",
  draggable,
  onIncrement,
  onDecrement,
  onRemove,
  onClick,
}: DeckCardRowProps) {
  const dragData: DeckCardDragData = {
    type: "deck-card",
    cardId: card.cardId,
    cardName: card.cardName,
    fromZone: card.zone as DeckZone,
    quantity: card.quantity,
  };

  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `deck-card-${card.cardId}-${card.zone}`,
    data: dragData,
    disabled: !draggable,
  });

  // When dragging 1 copy from a multi-copy stack, show the remaining count
  const displayQuantity = isDragging && card.quantity > 1 ? card.quantity - 1 : card.quantity;

  const baseClass = cn(
    "flex items-center gap-1.5 rounded px-3 py-1 text-sm",
    dimmed && "opacity-50",
    hasViolation && "bg-destructive/10",
    isDragging && card.quantity === 1 && "opacity-40",
  );

  const content = (
    <>
      {draggable && (
        <span className="text-muted-foreground/50 -ml-1.5 shrink-0">
          <GripVertical className="size-3.5" />
        </span>
      )}

      {hasViolation && (
        <span title={violationMessage} className="shrink-0">
          <AlertTriangle className="text-destructive size-3.5" />
        </span>
      )}

      <img
        src={getTypeIconPath(card.cardType, card.superTypes)}
        alt={card.cardType}
        className="size-3.5 shrink-0 brightness-0 dark:invert"
      />

      <span className="flex shrink-0 items-center gap-0.5">
        {card.domains.map((domain) => (
          <DomainDot key={domain} domain={domain} />
        ))}
      </span>

      <span className="min-w-0 flex-1 truncate text-left">{card.cardName}</span>

      <CardControls
        controlMode={controlMode}
        quantity={displayQuantity}
        onIncrement={onIncrement}
        onDecrement={onDecrement}
        onRemove={onRemove}
      />
    </>
  );

  const dragProps = draggable ? { ...listeners, ...attributes } : {};

  if (onClick) {
    return (
      <div
        ref={setNodeRef}
        className={cn(draggable && "cursor-grab active:cursor-grabbing")}
        {...dragProps}
      >
        {/* oxlint-disable jsx-a11y/prefer-tag-over-role -- children contain <button> elements; a native button would create invalid nested buttons */}
        <div
          role="button"
          tabIndex={0}
          className={cn(baseClass, "hover:bg-muted/50 w-full cursor-pointer")}
          onClick={onClick}
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
      ref={setNodeRef}
      className={cn(baseClass, draggable && "cursor-grab active:cursor-grabbing")}
      {...dragProps}
    >
      {content}
    </div>
  );
}
