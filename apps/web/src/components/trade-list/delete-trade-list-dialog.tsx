import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface DeleteTradeListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tradeListName: string;
  itemCount: number;
  onConfirm: () => void;
  isPending: boolean;
}

export function DeleteTradeListDialog({
  open,
  onOpenChange,
  tradeListName,
  itemCount,
  onConfirm,
  isPending,
}: DeleteTradeListDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Delete trade list</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to delete &ldquo;{tradeListName}&rdquo;?
          {itemCount > 0
            ? ` The ${itemCount} ${itemCount === 1 ? "copy" : "copies"} on this list will stay in your collection, but will no longer be marked for trade.`
            : " This trade list is empty."}
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
