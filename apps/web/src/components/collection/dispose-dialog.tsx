import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface DisposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: () => void;
  isPending: boolean;
}

export function DisposeDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
  isPending,
}: DisposeDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Remove cards from collection</AlertDialogTitle>
        <AlertDialogDescription>
          This will permanently remove {count} card{count !== 1 ? "s" : ""} from your collection.
          This action cannot be undone, but the removal will be recorded in your activity history.
        </AlertDialogDescription>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Removing…" : `Remove ${count} card${count !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
