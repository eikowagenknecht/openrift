import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useRemoveListEntry, useUpdateListEntry } from "@/hooks/use-lists";
import type { WishEntryFlat } from "@/hooks/use-wish-entries";

interface TakeWishlistFollowUpDialogProps {
  /** The card just taken from the box, or null when the dialog is closed. */
  printing: Printing | null;
  /** Wish entries that match the taken card. */
  entries: WishEntryFlat[];
  /** How many copies were just taken — the amount to subtract from the wish. */
  takenQuantity: number;
  onOpenChange: (open: boolean) => void;
}

/**
 * Offered right after a card is taken from a group "bulk box" when it matched
 * the viewer's wishlist. One match → a single "Remove from {list}" action;
 * several → a checklist so the viewer chooses which lists to prune. Never
 * removes anything silently — taking the card leaves wishlists untouched until
 * the viewer confirms here. Taking one copy decrements the wish by one,
 * removing the entry only when it drops to zero.
 *
 * @returns The follow-up confirmation dialog.
 */
export function TakeWishlistFollowUpDialog({
  printing,
  entries,
  takenQuantity,
  onOpenChange,
}: TakeWishlistFollowUpDialogProps) {
  const open = printing !== null;
  const removeEntry = useRemoveListEntry();
  const updateEntry = useUpdateListEntry();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Re-arm the selection (everything checked) whenever the dialog opens for a
  // freshly-taken card.
  useEffect(() => {
    setSelectedIds(new Set(entries.map((entry) => entry.entryId)));
  }, [entries]);

  const isPending = removeEntry.isPending || updateEntry.isPending;
  const single = entries.length === 1;
  const cardName = printing ? legendDisplayName(printing.card) : "";

  const applyRemoval = async () => {
    const chosen = entries.filter((entry) => selectedIds.has(entry.entryId));
    // Reduce each chosen entry by the copies taken (capped at its own quantity),
    // removing it outright when that reaches zero. The common case is one list
    // at quantity 1, which is a plain removal.
    await Promise.all(
      chosen.map((entry) => {
        const decrement = Math.min(entry.quantity, takenQuantity);
        return entry.quantity - decrement <= 0
          ? removeEntry.mutateAsync({ listId: entry.listId, entryId: entry.entryId })
          : updateEntry.mutateAsync({
              listId: entry.listId,
              entryId: entry.entryId,
              quantity: entry.quantity - decrement,
            });
      }),
    );
    toast.success(
      chosen.length === 1 ? "Updated your wishlist" : `Updated ${chosen.length} wishlists`,
    );
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Remove from your wishlist?</AlertDialogTitle>
        <AlertDialogDescription>
          {single ? (
            <>
              You took {cardName}, which is on your wishlist &ldquo;{entries[0]?.listName}&rdquo;.
            </>
          ) : (
            <>You took {cardName}, which is on several of your wishlists.</>
          )}
        </AlertDialogDescription>
        {!single && (
          <div className="flex flex-col gap-2 py-1">
            {entries.map((entry) => (
              <label key={entry.entryId} className="flex items-center gap-2">
                <Checkbox
                  checked={selectedIds.has(entry.entryId)}
                  onCheckedChange={(checked) =>
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (checked) {
                        next.add(entry.entryId);
                      } else {
                        next.delete(entry.entryId);
                      }
                      return next;
                    })
                  }
                />
                <span className="truncate">{entry.listName}</span>
              </label>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Keep{single ? "" : " all"}
          </Button>
          <Button onClick={applyRemoval} disabled={isPending || selectedIds.size === 0}>
            {single ? `Remove from ${entries[0]?.listName}` : "Remove selected"}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
