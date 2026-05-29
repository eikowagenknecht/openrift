import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface ListRemoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: () => void;
  isPending: boolean;
}

/**
 * Confirms removing the selected entries from a list. Mirrors the collection
 * DisposeDialog so the bulk-remove flow reads the same across surfaces, with
 * list-appropriate copy (a list entry is easily re-added, unlike a disposed
 * owned copy).
 * @returns The confirmation dialog.
 */
export function ListRemoveDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
  isPending,
}: ListRemoveDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Remove from list</AlertDialogTitle>
        <AlertDialogDescription>
          Remove {count} card{count === 1 ? "" : "s"} from this list? You can always add{" "}
          {count === 1 ? "it" : "them"} back later.
        </AlertDialogDescription>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Removing…" : `Remove ${count} card${count === 1 ? "" : "s"}`}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
