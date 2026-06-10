import type { ListKind } from "@openrift/shared";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";

interface DeleteListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listName: string;
  kind: ListKind;
  entryCount: number;
  onConfirm: () => void;
  isPending: boolean;
}

export function DeleteListDialog({
  open,
  onOpenChange,
  listName,
  kind,
  entryCount,
  onConfirm,
  isPending,
}: DeleteListDialogProps) {
  // Only copy-kind lists reference specific physical cards, so the
  // "stays in your collection" reassurance is copy-specific.
  const itemNoun = kind === "copy" ? "copy" : kind === "printing" ? "printing" : "card";
  const itemPluralNoun = kind === "copy" ? "copies" : kind === "printing" ? "printings" : "cards";
  const tailMessage =
    entryCount === 0
      ? " This list is empty."
      : kind === "copy"
        ? ` The ${entryCount} ${entryCount === 1 ? "copy" : "copies"} on this list will stay in your collection, but will no longer be on this list.`
        : ` This list has ${entryCount} ${entryCount === 1 ? itemNoun : itemPluralNoun}, which will no longer be grouped.`;

  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete list"
      description={
        <>
          Are you sure you want to delete &ldquo;{listName}&rdquo;?
          {tailMessage}
        </>
      }
      confirmLabel="Delete"
      pendingLabel="Deleting..."
      onConfirm={onConfirm}
      isPending={isPending}
    />
  );
}
