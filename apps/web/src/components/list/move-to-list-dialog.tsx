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

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Move to list</AlertDialogTitle>
        <AlertDialogDescription>
          Choose a list to move the selected cards to.
        </AlertDialogDescription>
        <div className="max-h-60 overflow-y-auto">
          {lists.map((list) => (
            <button
              key={list.id}
              type="button"
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                selectedId === list.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
              }`}
              onClick={() => setSelectedId(list.id)}
            >
              <ListIcon className="size-4 shrink-0" />
              <span className="truncate">{list.name}</span>
            </button>
          ))}
          {lists.length === 0 && (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No other matching lists available.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => selectedId && onMove(selectedId)}
            disabled={!selectedId || isPending}
          >
            {isPending ? "Moving…" : "Move"}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
