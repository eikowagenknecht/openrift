import { ConfirmActionDialog } from "@/components/confirm-action-dialog";

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
  const cardNoun = `card${count === 1 ? "" : "s"}`;
  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Remove cards from collection"
      description={
        <>
          This will permanently remove {count} {cardNoun} from your collection. This action cannot
          be undone, but the removal will be recorded in your activity history.
        </>
      }
      confirmLabel={`Remove ${count} ${cardNoun}`}
      pendingLabel="Removing…"
      onConfirm={onConfirm}
      isPending={isPending}
    />
  );
}
