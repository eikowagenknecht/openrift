import type { CollectionResponse } from "@openrift/shared";
import { InboxIcon, BookOpenIcon } from "lucide-react";
import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CommandEmpty } from "@/components/ui/command";
import { DialogForm } from "@/components/ui/dialog-form";
import { PickerList, PickerRow } from "@/components/ui/picker-list";
import { QuantityStepperField } from "@/components/ui/quantity-stepper";
import { cn } from "@/lib/utils";

interface MoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: CollectionResponse[];
  /** How many copies the move can touch — the stepper's upper bound. */
  count: number;
  /**
   * True when all target copies are copies of the same card (the right-click /
   * single-card path). Only then is a "how many copies" choice meaningful, so
   * the dialog shows a 1..count stepper and moves just the chosen number. A
   * multi-card selection from the float bar keeps the move-all behavior.
   */
  singleCard?: boolean;
  onMove: (toCollectionId: string, quantity: number) => void;
  isPending: boolean;
}

/**
 * Picks the collection a set of owned copies moves into, and how many of them
 * move when they all belong to one card.
 * @returns The move dialog.
 */
export function MoveDialog({
  open,
  onOpenChange,
  collections,
  count,
  singleCard = false,
  onMove,
  isPending,
}: MoveDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState("");

  // Re-arm to "all copies" each time the dialog opens for a fresh target.
  const canChooseQuantity = singleCard && count > 1;
  const [quantity, setQuantity] = useState(count);
  useEffect(() => {
    if (open) {
      setQuantity(count);
    }
  }, [open, count]);
  const effectiveQuantity = canChooseQuantity ? quantity : count;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <DialogForm onSubmit={() => selectedId && onMove(selectedId, effectiveQuantity)}>
          <AlertDialogTitle>Move to collection</AlertDialogTitle>
          <AlertDialogDescription>
            {effectiveQuantity === 1
              ? "Choose a collection to move this copy to."
              : `Choose a collection to move these ${effectiveQuantity} copies to.`}
          </AlertDialogDescription>
          {canChooseQuantity && (
            <QuantityStepperField
              label="Copies to move"
              value={quantity}
              onValueChange={setQuantity}
              max={count}
              disabled={isPending}
            />
          )}
          {/* No overflow here — CommandList scrolls internally, keeping the filter input pinned. */}
          <div>
            {collections.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                No other collections available.
              </p>
            ) : (
              <PickerList
                searchPlaceholder="Filter collections…"
                highlightedId={highlightedId}
                onHighlightChange={setHighlightedId}
              >
                <CommandEmpty>No matching collections.</CommandEmpty>
                {collections.map((col) => (
                  <PickerRow
                    key={col.id}
                    value={col.id}
                    keywords={[col.name]}
                    onSelect={() => setSelectedId(col.id)}
                    className={cn(
                      "px-3 py-2",
                      selectedId === col.id &&
                        "bg-primary/10 text-primary data-selected:bg-primary/10 data-selected:text-primary data-selected:**:text-primary",
                    )}
                  >
                    {col.isInbox ? (
                      <InboxIcon className="size-4 shrink-0" />
                    ) : (
                      <BookOpenIcon className="size-4 shrink-0" />
                    )}
                    <span className="truncate">{col.name}</span>
                  </PickerRow>
                ))}
              </PickerList>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!selectedId || isPending}>
              {isPending ? "Moving…" : "Move"}
            </Button>
          </div>
        </DialogForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}
