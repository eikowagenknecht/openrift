import { Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogForm } from "@/components/ui/dialog-form";
import { errorText } from "@/lib/error-text";

export interface AdminDeleteConfig<TData> {
  onDelete: (row: TData) => Promise<unknown>;
  confirm?: (row: TData) => { title: string; description: ReactNode };
}

export function DeleteButton<TData>({
  row,
  config,
  deleteError,
  setDeleteError,
}: {
  row: TData;
  config: AdminDeleteConfig<TData>;
  deleteError: string;
  setDeleteError: (err: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  async function handleConfirmedDelete() {
    if (deletePending) {
      return;
    }
    setDeleteError("");
    setDeletePending(true);
    // React Compiler can lower neither a `finally` clause nor a conditional
    // inside a try/catch, so the reset runs on both paths and the message
    // comes from a plain helper.
    try {
      await config.onDelete(row);
      setOpen(false);
    } catch (error) {
      setDeleteError(errorText(error, "Delete failed"));
    }
    setDeletePending(false);
  }

  async function handleDelete() {
    try {
      await config.onDelete(row);
    } catch (error) {
      setDeleteError(errorText(error, "Delete failed"));
    }
  }

  if (config.confirm) {
    const { title, description } = config.confirm(row);
    return (
      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setDeleteError("");
          }
        }}
      >
        <AlertDialogTrigger
          render={<Button variant="ghost" size="icon" className="text-destructive" />}
        >
          <Trash2Icon className="h-4 w-4" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <DialogForm onSubmit={() => void handleConfirmedDelete()}>
            <AlertDialogHeader>
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription>{description}</AlertDialogDescription>
            </AlertDialogHeader>
            {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction type="submit" variant="destructive" disabled={deletePending}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </DialogForm>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Button
      variant="ghost"
      className="text-destructive hover:text-destructive"
      onClick={() => void handleDelete()}
    >
      Delete
    </Button>
  );
}
