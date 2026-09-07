import type { Printing } from "@openrift/shared/types/catalog";
import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  dispatchDecrement,
  dispatchIncrement,
} from "@/features/cards/stores/card-row-actions-store";

interface CountWithAddControlsProps {
  printing: Printing;
  ownedCount: number;
  totalOwnedCount?: number;
}

/**
 * Increments and decrements go through the module-stable trampolines on the
 * card-row-actions store; the active surface registers handlers there.
 */
export function CountWithAddControls({
  printing,
  ownedCount,
  totalOwnedCount,
}: CountWithAddControlsProps) {
  const showTotal = totalOwnedCount !== undefined && totalOwnedCount !== ownedCount;
  return (
    <>
      <span className="text-center font-medium tabular-nums">
        {ownedCount}
        {showTotal && <span className="opacity-60"> ({totalOwnedCount})</span>}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={(event) => {
          event.stopPropagation();
          dispatchDecrement(printing, event.currentTarget, { shift: event.shiftKey });
        }}
        disabled={!ownedCount}
        aria-label="Remove one"
      >
        <MinusIcon className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="default"
        size="icon-sm"
        onClick={(event) => {
          event.stopPropagation();
          dispatchIncrement(printing, { shift: event.shiftKey });
        }}
        aria-label="Add one"
      >
        <PlusIcon className="size-3.5" />
      </Button>
    </>
  );
}
