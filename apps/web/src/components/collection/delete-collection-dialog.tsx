import { ConfirmActionDialog } from "@/components/confirm-action-dialog";

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
    <ConfirmActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete collection"
      description={
        <>
          Are you sure you want to delete &ldquo;{collectionName}&rdquo;?
          {copyCount > 0
            ? ` The ${copyCount} card${copyCount === 1 ? "" : "s"} in this collection will be moved to your Inbox.`
            : " This collection is empty."}
        </>
      }
      confirmLabel="Delete"
      pendingLabel="Deleting..."
      onConfirm={onConfirm}
      isPending={isPending}
    />
  );
}
