import type { Collection } from "@openrift/shared";
import { InboxIcon, BookOpenIcon } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface MoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: Collection[];
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

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Move to collection</AlertDialogTitle>
        <AlertDialogDescription>
          Choose a collection to move the selected cards to.
        </AlertDialogDescription>
        <div className="max-h-60 overflow-y-auto">
          {collections.map((col) => (
            <button
              key={col.id}
              type="button"
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                selectedId === col.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
              }`}
              onClick={() => setSelectedId(col.id)}
            >
              {col.isInbox ? (
                <InboxIcon className="size-4 shrink-0" />
              ) : (
                <BookOpenIcon className="size-4 shrink-0" />
              )}
              <span className="truncate">{col.name}</span>
            </button>
          ))}
          {collections.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No other collections available.
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
