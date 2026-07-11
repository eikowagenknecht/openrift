import type { CopyListMembershipsResponse } from "@openrift/shared";
import { TriangleAlertIcon } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { disposeConfirmState } from "@/lib/dispose-confirm";

type Outcome = "keep" | "sold";

interface TakeOffTradelistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Number of cards being taken off (one tradelist tile = one physical copy). */
  count: number;
  /** Outcome 1: remove from the tradelist but keep the copies in the collection. */
  onKeep: () => void;
  /** Outcome 2: dispose the copies — remove them from the collection for good. */
  onSold: () => void;
  /** True while either the keep (remove) or sold (dispose) mutation is running. */
  isPending: boolean;
  /** Other lists (this list excluded) the copies also sit on — drives the sold warning. */
  memberships?: CopyListMembershipsResponse;
  /** True while the list-membership check is still in flight. */
  membershipsLoading?: boolean;
  /**
   * How many of the targeted copies are pinned to a live in-app trade. When
   * any are, the sold (dispose) outcome is blocked — disposing would break the
   * trade — so only the keep outcome is offered.
   */
  reservedCount?: number;
}

/**
 * Single entry point for taking copies off a tradelist. A card leaves a
 * tradelist for one of two reasons, and they differ in what happens to the
 * physical copy — so we ask the outcome here instead of offering two
 * lookalike buttons:
 *   - keep: just unlist it; the copy stays in the collection (non-destructive).
 *   - sold: dispose the copy, removing it from the collection for good. Since
 *     that hard-deletes the copy, it also drops off any *other* lists it's on;
 *     when it does, the same red cross-list warning + type-to-confirm friction
 *     as the collection dispose flow applies (reusing {@link disposeConfirmState}).
 * "keep" is the default so an accidental confirm can't delete a card.
 * @returns The take-off-tradelist confirmation dialog.
 */
export function TakeOffTradelistDialog({
  open,
  onOpenChange,
  count,
  onKeep,
  onSold,
  isPending,
  memberships,
  membershipsLoading = false,
  reservedCount = 0,
}: TakeOffTradelistDialogProps) {
  const cardNoun = `card${count === 1 ? "" : "s"}`;
  const pronoun = count === 1 ? "it" : "them";
  const { showListWarning, needsTypeConfirm, copiesOnAnyList } = disposeConfirmState(
    count,
    memberships,
  );
  // A copy pinned to a live trade can't be disposed without breaking the trade,
  // so block the sold outcome entirely when any target is reserved.
  const soldBlocked = reservedCount > 0;

  const [outcome, setOutcome] = useState<Outcome>("keep");
  const [confirmText, setConfirmText] = useState("");
  // Reset to the safe default and clear any typed value on every reopen.
  useEffect(() => {
    if (!open) {
      setOutcome("keep");
      setConfirmText("");
    }
  }, [open]);

  const sold = outcome === "sold";
  // Hold the sold confirm while the membership check resolves: until then we
  // don't know whether this is a cross-list dispose, so can't show the right
  // friction. Type-to-confirm only ever gates the destructive (sold) path.
  const typedConfirmSatisfied = !needsTypeConfirm || confirmText.trim() === String(count);
  const confirmDisabled = isPending || (sold && (membershipsLoading || !typedConfirmSatisfied));

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <DialogForm onSubmit={() => (sold ? onSold() : onKeep())}>
          <AlertDialogTitle>
            Take {count} {cardNoun} off your tradelist
          </AlertDialogTitle>
          <AlertDialogDescription>What happened to {pronoun}?</AlertDialogDescription>

          <RadioGroup value={outcome} onValueChange={(value) => setOutcome(value as Outcome)}>
            <label
              htmlFor="take-off-keep"
              className="hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-lg border p-3"
            >
              <RadioGroupItem id="take-off-keep" value="keep" className="mt-0.5" />
              <span className="space-y-0.5">
                <span className="block font-medium">I&apos;m keeping {pronoun}</span>
                <span className="text-muted-foreground block text-sm">
                  Just takes {pronoun} off this tradelist. {count === 1 ? "It stays" : "They stay"}{" "}
                  in your collection.
                </span>
              </span>
            </label>
            <label
              htmlFor="take-off-sold"
              className={
                soldBlocked
                  ? "flex items-start gap-3 rounded-lg border p-3 opacity-60"
                  : "hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-lg border p-3"
              }
            >
              <RadioGroupItem
                id="take-off-sold"
                value="sold"
                disabled={soldBlocked}
                className="mt-0.5"
              />
              <span className="space-y-0.5">
                <span className="block font-medium">I traded or sold {pronoun}</span>
                <span className="text-muted-foreground block text-sm">
                  Also removes {pronoun} from your collection for good. This can&apos;t be undone,
                  but it&apos;s recorded in your activity history.
                </span>
                {soldBlocked && (
                  <span className="text-destructive block text-sm">
                    {reservedCount === count
                      ? `${count === 1 ? "This card is" : "These cards are"} in a live trade. Complete or cancel it first.`
                      : `${reservedCount} of these are in a live trade and can't be sold here. Take those off separately.`}
                  </span>
                )}
              </span>
            </label>
          </RadioGroup>

          {sold && showListWarning && (
            <div className="border-destructive/40 bg-destructive/10 text-destructive flex gap-3 rounded-lg border p-3 text-sm">
              <TriangleAlertIcon className="mt-0.5 size-5 shrink-0" />
              <div className="space-y-1.5">
                <p className="font-medium">
                  {copiesOnAnyList} of these {copiesOnAnyList === 1 ? "is" : "are"} also on your
                  other lists
                </p>
                <p>
                  Removing {pronoun} from your collection drops{" "}
                  {copiesOnAnyList === 1 ? "it" : "them"} off:
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

          {sold && membershipsLoading && (
            <p className="text-muted-foreground text-sm">Checking your other lists…</p>
          )}

          {sold && needsTypeConfirm && (
            <div className="space-y-1.5">
              <label htmlFor="take-off-confirm" className="text-sm font-medium">
                Type <span className="font-mono">{count}</span> to confirm
              </label>
              <Input
                id="take-off-confirm"
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
            <Button
              type="submit"
              variant={sold ? "destructive" : "default"}
              disabled={confirmDisabled}
            >
              {isPending
                ? sold
                  ? "Removing…"
                  : "Taking off…"
                : sold
                  ? `Remove ${count} ${cardNoun}`
                  : "Take off list"}
            </Button>
          </div>
        </DialogForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}
