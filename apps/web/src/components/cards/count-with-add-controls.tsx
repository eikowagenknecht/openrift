import type { Printing } from "@openrift/shared";
import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { dispatchDecrement, dispatchIncrement } from "@/stores/card-row-actions-store";

interface CountWithAddControlsProps {
  printing: Printing;
  ownedCount: number;
  /**
   * Optional aggregate count rendered in parens after `ownedCount` when the
   * two differ (e.g. `2 (5)` for "2 here, 5 total"). Omit to render only the
   * primary count.
   */
  totalOwnedCount?: number;
}

/**
 * Shared visual for the wide actions cell: primary count, optional `(total)`
 * hint, and the +/- buttons. Both CatalogTableActions and CollectionTableActions
 * use this — they differ only in how they compute the counts.
 *
 * Increments and decrements go through the module-stable trampolines on the
 * card-row-actions store; the active surface registers handlers there.
 *
 * @returns The count + buttons content (no wrapper — CardTableRow renders that).
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
