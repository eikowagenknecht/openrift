import type { CopyResponse } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogForm } from "@/components/ui/dialog-form";
import { useEnumOrders } from "@/hooks/use-enums";
import type { PendingAnnotatedDispose } from "@/hooks/use-quick-add-actions";
import type { EnumLabels } from "@/lib/enum-labels";

/** Lists what the copy has recorded, for the confirmation body (e.g. "graded PSA 9.5, notes"). */
function recordedDetails(copy: CopyResponse, labels: EnumLabels): string[] {
  const parts: string[] = [];
  if (copy.grader !== null && copy.grade !== null) {
    parts.push(`graded ${labels.graders[copy.grader]} ${copy.grade}`);
  }
  if (copy.condition !== null) {
    parts.push(`condition ${labels.conditions[copy.condition]}`);
  }
  if (copy.isAltered) {
    parts.push("marked as altered");
  }
  if (copy.notesPublic !== null || copy.notesPrivate !== null) {
    parts.push("notes");
  }
  if (copy.links.length > 0) {
    parts.push(
      copy.links.length === 1 ? "1 photo/video link" : `${copy.links.length} photo/video links`,
    );
  }
  return parts;
}

/**
 * Only appears when a minus-button removal would destroy recorded details;
 * bare copies are removed silently. Stays mounted with a null `pending` so
 * open/close animates.
 */
export function AnnotatedDisposeDialog({
  pending,
  onConfirm,
  onCancel,
  isPending,
}: {
  pending: PendingAnnotatedDispose | null;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const { labels } = useEnumOrders();
  const details = pending ? recordedDetails(pending.copy, labels) : [];
  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent>
        <DialogForm onSubmit={onConfirm}>
          <AlertDialogTitle>Remove this copy?</AlertDialogTitle>
          <AlertDialogDescription>
            {pending
              ? `This copy of ${legendDisplayName(pending.printing.card)} has details recorded` +
                `${details.length > 0 ? ` (${details.join(", ")})` : ""}. ` +
                "Removing the copy permanently deletes these details too."
              : ""}
          </AlertDialogDescription>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onCancel} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? "Removing…" : "Remove copy"}
            </Button>
          </div>
        </DialogForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}
