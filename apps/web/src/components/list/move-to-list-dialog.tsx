import type { ListResponse } from "@openrift/shared";
import { ListIcon } from "lucide-react";
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

interface MoveToListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Eligible targets: same kind + intent as the source, current list excluded. */
  lists: ListResponse[];
  onMove: (toListId: string) => void;
  isPending: boolean;
}

/**
 * Picks a destination list for moving the selected entries. Mirrors the
 * collection MoveDialog; the caller filters `lists` to same-kind + same-intent
 * targets (the API rejects mismatches) and excludes the current list.
 * @returns The move-to-list picker dialog.
 */
export function MoveToListDialog({
  open,
  onOpenChange,
  lists,
  onMove,
  isPending,
}: MoveToListDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState("");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <DialogForm onSubmit={() => selectedId && onMove(selectedId)}>
          <AlertDialogTitle>Move to list</AlertDialogTitle>
          <AlertDialogDescription>
            Choose a list to move the selected cards to.
          </AlertDialogDescription>
          {/* No overflow here — CommandList scrolls internally, keeping the filter input pinned. */}
          <div>
            {lists.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                No other matching lists available.
              </p>
            ) : (
              <PickerList
                searchPlaceholder="Filter lists…"
                highlightedId={highlightedId}
                onHighlightChange={setHighlightedId}
              >
                <CommandEmpty>No matching lists.</CommandEmpty>
                {lists.map((list) => (
                  <PickerRow
                    key={list.id}
                    value={list.id}
                    keywords={[list.name]}
                    onSelect={() => setSelectedId(list.id)}
                    className={cn(
                      "px-3 py-2",
                      selectedId === list.id &&
                        "bg-primary/10 text-primary data-selected:bg-primary/10 data-selected:text-primary data-selected:**:text-primary",
                    )}
                  >
                    <ListIcon className="size-4 shrink-0" />
                    <span className="truncate">{list.name}</span>
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
