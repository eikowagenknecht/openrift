import { ConfirmActionDialog } from "@/components/confirm-action-dialog";

interface ListRemoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: () => void;
  isPending: boolean;
}

export function ListRemoveDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
  isPending,
}: ListRemoveDialogProps) {
  const cardNoun = `card${count === 1 ? "" : "s"}`;
  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Remove from list"
      description={
        <>
          Remove {count} {cardNoun} from this list? You can always add {count === 1 ? "it" : "them"}{" "}
          back later.
        </>
      }
      confirmLabel={`Remove ${count} ${cardNoun}`}
      pendingLabel="Removing…"
      onConfirm={onConfirm}
      isPending={isPending}
    />
  );
}
