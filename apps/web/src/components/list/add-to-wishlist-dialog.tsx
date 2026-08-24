import type { ListKind } from "@openrift/shared";
import { HeartIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { InitialEntry } from "@/components/list/create-list-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PickerList, PickerRow } from "@/components/ui/picker-list";
import { useBulkAddListEntries, useLists } from "@/hooks/use-lists";
import { cn } from "@/lib/utils";

// User-facing translation of a wishlist's kind, matching the create-flow
// copy: card-kind wishes accept any printing, printing-kind pin exact ones.
const KIND_LABEL: Record<ListKind, string> = {
  card: "Any printing",
  printing: "Exact printings",
  copy: "",
};

interface AddToWishlistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Entries to add, shaped for the picked list's kind (`cardId` for card-kind
   * lists, `printingId` for printing-kind). Return an empty array when nothing
   * maps to that kind.
   */
  entriesFor: (kind: ListKind) => InitialEntry[];
  /**
   * Invoked when the user picks "New wishlist" instead of an existing one.
   * The dialog closes itself first; the caller opens its create flow.
   */
  onCreateNew: () => void;
  onAdded?: (listId: string) => void;
}

/**
 * Picker that adds a prepared set of cards (e.g. a deck's missing cards) to
 * one of the user's existing wishlists, or hands off to the caller's
 * create-wishlist flow. Quantities are added on top of what's already on the
 * list — the server sums duplicates rather than replacing them.
 * @returns The dialog component.
 */
export function AddToWishlistDialog({
  open,
  onOpenChange,
  entriesFor,
  onCreateNew,
  onAdded,
}: AddToWishlistDialogProps) {
  const { data: wishlists } = useLists("wish");
  const bulkAdd = useBulkAddListEntries();
  const [highlightedId, setHighlightedId] = useState("");

  const addToList = (listId: string, listName: string, kind: ListKind) => {
    const entries = entriesFor(kind);
    if (entries.length === 0) {
      // Printing-kind list but none of the cards resolve to a printing —
      // nothing the server could accept.
      toast.info(`Nothing to add to "${listName}"`);
      return;
    }
    bulkAdd.mutate(
      { listId, entries },
      {
        onSuccess: (result) => {
          const total = result.added + result.updated;
          toast.success(`Added ${total} ${total === 1 ? "card" : "cards"} to "${listName}"`);
          onAdded?.(listId);
          onOpenChange(false);
        },
      },
    );
  };

  const handleCreateNew = () => {
    onOpenChange(false);
    onCreateNew();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to wishlist</DialogTitle>
        </DialogHeader>
        <div className="max-h-60 overflow-y-auto">
          {wishlists.length > 0 ? (
            <PickerList highlightedId={highlightedId} onHighlightChange={setHighlightedId}>
              {wishlists.map((list) => (
                <PickerRow
                  key={list.id}
                  value={list.id}
                  onSelect={
                    bulkAdd.isPending ? undefined : () => addToList(list.id, list.name, list.kind)
                  }
                  className={cn("px-3 py-2", bulkAdd.isPending && "pointer-events-none opacity-50")}
                >
                  <HeartIcon className="size-4 shrink-0" />
                  <span className="flex-1 truncate">{list.name}</span>
                  <span className="text-muted-foreground text-2xs shrink-0">
                    {KIND_LABEL[list.kind]}
                  </span>
                </PickerRow>
              ))}
            </PickerList>
          ) : (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No wishlists yet. Create one below.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground justify-start"
            onClick={handleCreateNew}
            disabled={bulkAdd.isPending}
          >
            <PlusIcon className="size-3.5" />
            New wishlist
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={bulkAdd.isPending}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
