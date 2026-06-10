import { ConfirmActionDialog } from "@/components/confirm-action-dialog";

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
