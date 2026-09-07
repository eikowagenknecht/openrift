import type { Printing } from "@openrift/shared";
import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface DeckTableActionsProps {
  printing: Printing;
  deckQuantity: number;
  maxReached: boolean;
  addLabel?: string;
  removeLabel?: string;
  shiftHeld: boolean;
  remainingCount?: number;
  onQuickAdd: (printing: Printing, event: { shiftKey?: boolean }) => void;
  onRemove: (printing: Printing, event: { shiftKey?: boolean }) => void;
}

export function DeckTableActions({
  printing,
  deckQuantity,
  maxReached,
  addLabel,
  removeLabel,
  shiftHeld,
  remainingCount,
  onQuickAdd,
  onRemove,
}: DeckTableActionsProps) {
  const showBulkAdd =
    shiftHeld && !addLabel && remainingCount !== undefined && remainingCount > 1 && !maxReached;
  const showBulkRemove = shiftHeld && deckQuantity > 1;

  if (removeLabel && deckQuantity > 0) {
    return (
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={(event) => {
          event.stopPropagation();
          onRemove(printing, event);
        }}
        aria-label={removeLabel}
      >
        {removeLabel}
      </Button>
    );
  }

  return (
    <>
      {deckQuantity > 0 && (
        <span className="text-primary text-xs font-semibold tabular-nums">×{deckQuantity}</span>
      )}
      {deckQuantity > 0 && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant={showBulkRemove ? "destructive" : "outline"}
                size="icon-sm"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(printing, event);
                }}
                aria-label="Remove from deck"
                className={cn(showBulkRemove && "min-w-9 px-1 text-xs font-semibold")}
              />
            }
          >
            {showBulkRemove ? `-${deckQuantity}` : <MinusIcon className="size-3.5" />}
          </TooltipTrigger>
          <TooltipContent>Shift+click to remove all</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="default"
              size={addLabel ? "sm" : "icon-sm"}
              disabled={maxReached}
              onClick={(event) => {
                event.stopPropagation();
                onQuickAdd(printing, event);
              }}
              aria-label={addLabel ? `${addLabel} card` : "Add to deck"}
              className={cn(showBulkAdd && "min-w-9 px-1 text-xs font-semibold")}
            />
          }
        >
          {!maxReached && addLabel ? (
            addLabel
          ) : showBulkAdd ? (
            `+${remainingCount}`
          ) : (
            <PlusIcon className="size-3.5" />
          )}
        </TooltipTrigger>
        {!maxReached && (
          <TooltipContent>
            {addLabel ? `Click to ${addLabel.toLowerCase()}` : "Shift+click to add max"}
          </TooltipContent>
        )}
      </Tooltip>
    </>
  );
}
