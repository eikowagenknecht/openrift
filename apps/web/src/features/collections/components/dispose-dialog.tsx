import type { CopyListMembershipsResponse } from "@openrift/shared/types/api/collection";
import { LoaderIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { QuantityStepperField } from "@/components/ui/quantity-stepper";
import { disposeConfirmState } from "@/lib/dispose-confirm";

interface DisposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  singleCard?: boolean;
  onConfirm: () => void;
  isPending: boolean;
  memberships?: CopyListMembershipsResponse;
  membershipsLoading?: boolean;
  annotatedCount?: number;
}

/** Disposing hard-deletes each copy, so it silently drops off any list it's also on. */
export function DisposeDialog({
  open,
  onOpenChange,
  count,
  quantity,
  onQuantityChange,
  singleCard = false,
  onConfirm,
  isPending,
  memberships,
  membershipsLoading = false,
  annotatedCount = 0,
}: DisposeDialogProps) {
  const canChooseQuantity = singleCard && count > 1;
  const cardNoun = `card${quantity === 1 ? "" : "s"}`;
  const { showListWarning, needsTypeConfirm, copiesOnAnyList } = disposeConfirmState(
    quantity,
    memberships,
  );
  const onListNoun = `card${copiesOnAnyList === 1 ? "" : "s"}`;

  const [confirmText, setConfirmText] = useState("");
  // Start blank on every reopen so an earlier typed value can't carry over, and
  // on every quantity change — the typed number has to match what is removed.
  const [blankedFor, setBlankedFor] = useState({ open, quantity });
  if (blankedFor.open !== open || blankedFor.quantity !== quantity) {
    setBlankedFor({ open, quantity });
    setConfirmText("");
  }

  const typedConfirmSatisfied = !needsTypeConfirm || confirmText.trim() === String(quantity);
  const confirmDisabled = isPending || membershipsLoading || !typedConfirmSatisfied;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <DialogForm onSubmit={onConfirm}>
          <AlertDialogTitle>Remove cards from collection</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes {quantity} {cardNoun} from your collection. It can&apos;t be
            undone, but the removal is recorded in your activity history.
          </AlertDialogDescription>

          {canChooseQuantity && (
            <QuantityStepperField
              label="Copies to remove"
              value={quantity}
              onValueChange={onQuantityChange}
              max={count}
              disabled={isPending}
            />
          )}

          {showListWarning && (
            <div className="border-destructive/40 bg-destructive/10 text-destructive flex gap-3 rounded-lg border p-3 text-sm">
              <TriangleAlertIcon className="mt-0.5 size-5 shrink-0" />
              <div className="space-y-1.5">
                <p className="font-medium">
                  {copiesOnAnyList} of these {onListNoun} {copiesOnAnyList === 1 ? "is" : "are"} on
                  your lists
                </p>
                <p>
                  Removing {quantity === 1 ? "it" : "them"} here deletes the {cardNoun} for good, so{" "}
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
                Type <span className="font-mono">{quantity}</span> to confirm
              </label>
              <Input
                id="dispose-confirm"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder={String(quantity)}
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
                `Remove ${quantity} ${cardNoun}`
              )}
            </Button>
          </div>
        </DialogForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}
