import type { Printing } from "@openrift/shared";
import { useState } from "react";
import { toast } from "sonner";

import { CardMetaLine } from "@/components/friend-groups/trade-row-parts";
import { Badge } from "@/components/ui/badge";
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
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { UserAvatar } from "@/components/user-avatar";
import { useEnumOrders } from "@/hooks/use-enums";
import { useCreateLoan, useLoanBorrowerOptions } from "@/hooks/use-loans";

/** Sentinel radio value for the free-text "someone else" borrower option. */
const FREE_TEXT = "__name__";

interface LendCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The exact printing the loan targets — named in the dialog so a multi-printing owner sees which variant goes out. */
  printing: Printing;
  cardName: string;
  /**
   * Upper bound for the quantity stepper — the viewer's owned copies of this
   * printing. The server additionally rejects copies already reserved or lent
   * ("only N available"), surfaced as an error toast.
   */
  maxQuantity: number;
  /** Collection the lend action was triggered in; biases copy selection (ADR-039). */
  contextCollectionId?: string;
}

/**
 * The "Lend to a friend" dialog (ADR-039): pick a borrower (a group co-member,
 * or anyone by name) and a quantity. Recording is one-sided — the loan is
 * active immediately; a member borrower gets it as unconfirmed.
 * @returns The dialog element.
 */
export function LendCardDialog({
  open,
  onOpenChange,
  printing,
  cardName,
  maxQuantity,
  contextCollectionId,
}: LendCardDialogProps) {
  const { data: options } = useLoanBorrowerOptions(open);
  const { labels } = useEnumOrders();
  const createLoan = useCreateLoan();

  const [quantity, setQuantity] = useState(1);
  const [borrower, setBorrower] = useState<string>(FREE_TEXT);
  const [name, setName] = useState("");

  const members = options?.members ?? [];
  const recentNames = options?.recentNames ?? [];
  const freeText = borrower === FREE_TEXT;
  const trimmedName = name.trim();
  const canConfirm = maxQuantity > 0 && (freeText ? trimmedName.length > 0 : true);

  function confirm(): void {
    createLoan.mutate(
      {
        printingId: printing.id,
        quantity,
        borrowerUserId: freeText ? undefined : borrower,
        borrowerName: freeText ? trimmedName : undefined,
        contextCollectionId,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast.success(`Lent ${cardName} — track it on the Lending page`);
        },
        // Reported by the global mutation error toast (see reportMutationError).
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogForm onSubmit={confirm}>
          <DialogHeader>
            <DialogTitle>Lend to a friend</DialogTitle>
            <DialogDescription>
              It stays in your collection, marked as on loan, and stops counting for deck building
              and trades until it&apos;s back.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{cardName}</span>
            <CardMetaLine
              shortCode={printing.shortCode}
              rarity={printing.rarity}
              rarityLabel={labels.rarities[printing.rarity]}
              finish={printing.finish}
              finishLabel={labels.finishes[printing.finish]}
            />
          </div>

          <RadioGroup value={borrower} onValueChange={setBorrower} className="gap-2 py-1">
            {members.map((member) => (
              <label
                key={member.userId}
                className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md border p-2.5"
              >
                <RadioGroupItem value={member.userId} />
                <UserAvatar
                  image={member.image}
                  name={member.name}
                  gravatarHash={member.gravatarHash}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate text-sm">{member.name ?? "Member"}</span>
              </label>
            ))}
            <label className="hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-md border p-2.5">
              <RadioGroupItem value={FREE_TEXT} className="mt-2" />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Input
                  placeholder={members.length > 0 ? "Someone else, by name" : "Who has it?"}
                  value={name}
                  aria-label="Borrower name"
                  onFocus={() => setBorrower(FREE_TEXT)}
                  onChange={(event) => setName(event.target.value)}
                />
                {recentNames.length > 0 && freeText ? (
                  <span className="flex flex-wrap gap-1">
                    {recentNames.map((recent) => (
                      <Badge
                        key={recent}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => setName(recent)}
                      >
                        {recent}
                      </Badge>
                    ))}
                  </span>
                ) : null}
              </span>
            </label>
          </RadioGroup>

          <div className="flex items-center justify-between gap-4">
            <span>How many?</span>
            <QuantityStepper
              value={quantity}
              onValueChange={setQuantity}
              max={Math.max(1, maxQuantity)}
              editable
            />
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={createLoan.isPending || !canConfirm}>
              Lend it out
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
