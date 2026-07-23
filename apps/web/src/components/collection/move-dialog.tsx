import type { CollectionResponse } from "@openrift/shared";
import { InboxIcon, BookOpenIcon } from "lucide-react";
import { useState } from "react";

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
import { cn } from "@/lib/utils";

interface MoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: CollectionResponse[];
  onMove: (toCollectionId: string) => void;
  isPending: boolean;
}

export function MoveDialog({
  open,
  onOpenChange,
  collections,
  onMove,
  isPending,
}: MoveDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState("");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <DialogForm onSubmit={() => selectedId && onMove(selectedId)}>
          <AlertDialogTitle>Move to collection</AlertDialogTitle>
          <AlertDialogDescription>
            Choose a collection to move the selected cards to.
          </AlertDialogDescription>
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
