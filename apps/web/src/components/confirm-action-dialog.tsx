import type { ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogForm } from "@/components/ui/dialog-form";

interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  /** Label for the confirm button (e.g. "Delete"). */
  confirmLabel: ReactNode;
  /** Confirm-button label while the action is in flight (e.g. "Deleting..."). Falls back to confirmLabel. */
  pendingLabel?: ReactNode;
  /** Cancel-button label. Defaults to "Cancel". */
  cancelLabel?: ReactNode;
  onConfirm: () => void;
  /** Disables both buttons and swaps in pendingLabel while the action runs. */
  isPending?: boolean;
  /** Style the confirm button as destructive (red). Defaults to true. */
  destructive?: boolean;
}

/**
 * Confirmation dialog for a single action (usually destructive): a title, a
 * description, a Cancel button, and a confirm button that shows a pending
 * label while the action runs. Callers own the trigger and the open state.
 * @returns The confirmation dialog.
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancel",
  onConfirm,
  isPending = false,
  destructive = true,
}: ConfirmActionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <DialogForm onSubmit={onConfirm}>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={isPending}
            >
              {isPending && pendingLabel !== undefined ? pendingLabel : confirmLabel}
            </Button>
          </div>
        </DialogForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}
