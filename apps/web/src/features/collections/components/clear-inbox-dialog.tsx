import { ConfirmActionDialog } from "@/components/confirm-action-dialog";

interface ClearInboxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  copyCount: number;
  onConfirm: () => void;
  isPending: boolean;
}

export function ClearInboxDialog({
  open,
  onOpenChange,
  copyCount,
  onConfirm,
  isPending,
}: ClearInboxDialogProps) {
  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Clear inbox"
      description={
        <>
          {copyCount > 0
            ? `This permanently removes the ${copyCount} card${copyCount === 1 ? "" : "s"} in your Inbox, including any recorded details and list entries.`
            : "Your Inbox is empty, so there is nothing to remove."}{" "}
          The Inbox itself can&apos;t be deleted, only emptied.
        </>
      }
      confirmLabel="Clear inbox"
      pendingLabel="Clearing..."
      onConfirm={onConfirm}
      isPending={isPending}
    />
  );
}
