import type { ListKind } from "@openrift/shared/types/api/list";
import { HeartIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PickerList, PickerRow } from "@/components/ui/picker-list";
import { useBulkAddListEntries, useLists } from "@/features/lists/hooks/use-lists";
import type { InitialEntry } from "@/features/lists/lib/list-initial-entry";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<ListKind, string> = {
  card: "Any printing",
  printing: "Exact printings",
  copy: "",
};

interface AddToWishlistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entriesFor: (kind: ListKind) => InitialEntry[];
  onCreateNew: () => void;
  onAdded?: (listId: string) => void;
}

/** Adds a prepared set of cards to an existing wishlist, or hands off to the create-wishlist flow. */
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
