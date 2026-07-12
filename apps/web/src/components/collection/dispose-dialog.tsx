import type { CopyListMembershipsResponse } from "@openrift/shared";
import { LoaderIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { disposeConfirmState } from "@/lib/dispose-confirm";

interface DisposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: () => void;
  isPending: boolean;
  /** Which of the viewer's lists reference the copies being disposed. */
  memberships?: CopyListMembershipsResponse;
  /** True while the list-membership check is still in flight. */
  membershipsLoading?: boolean;
  /** How many targets carry recorded details (condition, notes, photos — ADR-038). */
  annotatedCount?: number;
}

/**
 * Confirms permanently removing copies from a collection. Disposing
 * hard-deletes each copy, so a copy that also sits on one of the viewer's lists
 * silently drops off it too — when that happens this dialog surfaces a red
 * cross-list warning that names the lists. A cross-list dispose, or a large
 * batch, also asks the user to type the count before the button enables.
 * @returns The dispose confirmation dialog.
 */
export function DisposeDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
  isPending,
  memberships,
  membershipsLoading = false,
  annotatedCount = 0,
}: DisposeDialogProps) {
  const cardNoun = `card${count === 1 ? "" : "s"}`;
  const { showListWarning, needsTypeConfirm, copiesOnAnyList } = disposeConfirmState(
    count,
    memberships,
  );
  const onListNoun = `card${copiesOnAnyList === 1 ? "" : "s"}`;

  const [confirmText, setConfirmText] = useState("");
  // Start blank on every reopen so an earlier typed value can't carry over.
  useEffect(() => {
    if (!open) {
      setConfirmText("");
    }
  }, [open]);

  // Hold the button while the membership check resolves: until then we don't
  // know whether this is a cross-list dispose, so we can't show the right
  // friction.
  const typedConfirmSatisfied = !needsTypeConfirm || confirmText.trim() === String(count);
  const confirmDisabled = isPending || membershipsLoading || !typedConfirmSatisfied;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <DialogForm onSubmit={onConfirm}>
          <AlertDialogTitle>Remove cards from collection</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes {count} {cardNoun} from your collection. It can&apos;t be
            undone, but the removal is recorded in your activity history.
          </AlertDialogDescription>

          {showListWarning && (
            <div className="border-destructive/40 bg-destructive/10 text-destructive flex gap-3 rounded-lg border p-3 text-sm">
              <TriangleAlertIcon className="mt-0.5 size-5 shrink-0" />
              <div className="space-y-1.5">
                <p className="font-medium">
                  {copiesOnAnyList} of these {onListNoun} {copiesOnAnyList === 1 ? "is" : "are"} on
                  your lists
                </p>
                <p>
                  Removing {count === 1 ? "it" : "them"} here deletes the {cardNoun} for good, so{" "}
                  {copiesOnAnyList === 1 ? "it" : "they"} will also drop off:
                </p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {memberships?.lists.map((list) => (
                    <li key={list.id}>
                      <span className="font-medium">{list.name}</span> ({list.copyCount})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {annotatedCount > 0 && (
            <div className="border-destructive/40 bg-destructive/10 text-destructive flex gap-3 rounded-lg border p-3 text-sm">
              <TriangleAlertIcon className="mt-0.5 size-5 shrink-0" />
              <p>
                <span className="font-medium">
                  {annotatedCount} of these {annotatedCount === 1 ? "card has" : "cards have"}{" "}
                  details recorded
                </span>{" "}
                (condition, grading, notes, or photo links). Removing{" "}
                {annotatedCount === 1 ? "it" : "them"} permanently deletes those details too.
              </p>
            </div>
          )}

          {needsTypeConfirm && (
            <div className="space-y-1.5">
              <label htmlFor="dispose-confirm" className="text-sm font-medium">
                Type <span className="font-mono">{count}</span> to confirm
              </label>
              <Input
                id="dispose-confirm"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder={String(count)}
                disabled={isPending}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={confirmDisabled}>
              {membershipsLoading ? (
                <>
                  <LoaderIcon className="animate-spin" />
                  Checking your lists…
                </>
              ) : isPending ? (
                "Removing…"
              ) : (
                `Remove ${count} ${cardNoun}`
              )}
            </Button>
          </div>
        </DialogForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}
