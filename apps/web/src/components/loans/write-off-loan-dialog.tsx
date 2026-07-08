import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface WriteOffLoanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardName: string;
  /** Copies still out that the write-off covers. */
  outstanding: number;
  /** Whether the write-off mutation is in flight. */
  pending: boolean;
  onConfirm: (removeCopies: boolean) => void;
}

/**
 * Terminal dialog for a loan whose copies are never coming back (ADR-039):
 * whether they kept it by agreement or simply vanished. The choice is the
 * write-off proposal — remove the copies from the collection now, or keep the
 * data and fix it by hand later.
 * @returns The dialog element.
 */
export function WriteOffLoanDialog({
  open,
  onOpenChange,
  cardName,
  outstanding,
  pending,
  onConfirm,
}: WriteOffLoanDialogProps) {
  const [removeCopies, setRemoveCopies] = useState(true);
  const copiesNoun = outstanding === 1 ? "copy" : "copies";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Write off this loan</DialogTitle>
          <DialogDescription>
            Closes the loan for good: {outstanding} {copiesNoun} of {cardName} won&apos;t come back,
            whether they&apos;re keeping it or it&apos;s just gone. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={removeCopies ? "remove" : "keep"}
          onValueChange={(value) => setRemoveCopies(value === "remove")}
          className="gap-2 py-1"
        >
          <label
            htmlFor="write-off-remove"
            className="hover:bg-muted/60 flex cursor-pointer items-start gap-3 rounded-md border p-3"
          >
            <RadioGroupItem id="write-off-remove" value="remove" className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Also remove from my collection</span>
              <span className="text-muted-foreground text-xs">
                The {copiesNoun} left your hands, so your collection stops counting{" "}
                {outstanding === 1 ? "it" : "them"}.
              </span>
            </span>
          </label>
          <label
            htmlFor="write-off-keep"
            className="hover:bg-muted/60 flex cursor-pointer items-start gap-3 rounded-md border p-3"
          >
            <RadioGroupItem id="write-off-keep" value="keep" className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Keep my collection as it is</span>
              <span className="text-muted-foreground text-xs">
                The {copiesNoun} will show as available again until you fix your collection by hand.
              </span>
            </span>
          </label>
        </RadioGroup>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => onConfirm(removeCopies)}
          >
            Write off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
