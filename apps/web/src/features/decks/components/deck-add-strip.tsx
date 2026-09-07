import type { Printing } from "@openrift/shared/types/catalog";
import { LayersIcon, MinusIcon, PackageIcon, PlusIcon } from "lucide-react";

import { CountPill } from "@/components/ui/count-pill";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CardStrip,
  StripActionButton,
  StripIconButton,
} from "@/features/cards/components/card-strip";
import { cn } from "@/lib/utils";

interface DeckAddStripProps {
  printing: Printing;
  ownedCount: number;
  deckQuantity: number;
  maxReached?: boolean;
  addLabel?: string;
  removeLabel?: string;
  shiftHeld?: boolean;
  remainingCount?: number;
  onQuickAdd: (printing: Printing, event: React.MouseEvent) => void;
  onRemove?: (printing: Printing, event: React.MouseEvent) => void;
}

export function DeckAddStrip({
  printing,
  ownedCount,
  deckQuantity,
  maxReached,
  addLabel,
  removeLabel,
  shiftHeld,
  remainingCount,
  onQuickAdd,
  onRemove,
}: DeckAddStripProps) {
  if (removeLabel && deckQuantity > 0 && onRemove) {
    return (
      <CardStrip
        right={
          <StripActionButton variant="destructive" onClick={(event) => onRemove(printing, event)}>
            {removeLabel}
          </StripActionButton>
        }
      />
    );
  }

  const showBulkAdd = shiftHeld && !addLabel && remainingCount !== undefined && remainingCount > 1;
  const showBulkRemove = shiftHeld && deckQuantity > 1;

  const ownedPill = (
    <CountPill
      variant="ghost"
      title={`${ownedCount} owned`}
      className={cn(ownedCount === 0 && "opacity-50")}
    >
      <PackageIcon className="size-3" aria-hidden />
      <span>{ownedCount}</span>
      <span className="sr-only">owned</span>
    </CountPill>
  );

  const deckPill = deckQuantity > 0 && (
    <CountPill variant="primary" title={`${deckQuantity} in deck`}>
      <LayersIcon className="size-3" aria-hidden />
      <span>{deckQuantity}</span>
      <span className="sr-only">in deck</span>
    </CountPill>
  );

  const removeButton = deckQuantity > 0 && onRemove && (
    <Tooltip>
      <TooltipTrigger
        render={
          showBulkRemove ? (
            <StripActionButton
              variant="destructive"
              aria-label="Remove from deck"
              onClick={(event) => onRemove(printing, event)}
            />
          ) : (
            <StripIconButton
              className="text-muted-foreground"
              aria-label="Remove from deck"
              onClick={(event) => onRemove(printing, event)}
            />
          )
        }
      >
        {showBulkRemove ? `-${deckQuantity}` : <MinusIcon />}
      </TooltipTrigger>
      <TooltipContent>Shift+click to remove all</TooltipContent>
    </Tooltip>
  );

  const addButton = (
    <Tooltip>
      <TooltipTrigger
        render={
          !maxReached && (addLabel || showBulkAdd) ? (
            <StripActionButton
              aria-label={addLabel ? `${addLabel} card` : "Add to deck"}
              onClick={(event) => onQuickAdd(printing, event)}
            />
          ) : (
            <StripIconButton
              className={maxReached ? "text-muted-foreground/30" : "text-muted-foreground"}
              disabled={maxReached}
              aria-label={addLabel ? `${addLabel} card` : "Add to deck"}
              onClick={(event) => onQuickAdd(printing, event)}
            />
          )
        }
      >
        {!maxReached && addLabel ? (
          addLabel
        ) : showBulkAdd && !maxReached ? (
          `+${remainingCount}`
        ) : (
          <PlusIcon />
        )}
      </TooltipTrigger>
      {!maxReached && (
        <TooltipContent>
          {addLabel ? `Click to ${addLabel.toLowerCase()}` : "Shift+click to add max"}
        </TooltipContent>
      )}
    </Tooltip>
  );

  return (
    <CardStrip
      left={removeButton}
      center={
        <>
          {ownedPill}
          {deckPill}
        </>
      }
      right={addButton}
    />
  );
}
