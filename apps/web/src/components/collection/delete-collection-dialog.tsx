import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface DeleteCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionName: string;
  copyCount: number;
  onConfirm: () => void;
  isPending: boolean;
}

export function DeleteCollectionDialog({
  open,
  onOpenChange,
  collectionName,
  copyCount,
  onConfirm,
  isPending,
}: DeleteCollectionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Delete collection</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to delete &ldquo;{collectionName}&rdquo;?
          {copyCount > 0
            ? ` The ${copyCount} card${copyCount === 1 ? "" : "s"} in this collection will be moved to your Inbox.`
            : " This collection is empty."}
        </AlertDialogDescription>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
