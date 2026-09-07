import type { Printing } from "@openrift/shared";
import { PlusSquareIcon } from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";

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
import { useCreateTrade } from "@/hooks/use-card-trades";
import {
  useFriendGroupMatches,
  useFriendGroupShareableLists,
  useShareListWithFriendGroup,
} from "@/hooks/use-friend-groups";
import { useBulkAddListEntries, useCreateList } from "@/hooks/use-lists";
import { listTargetOptions, preferredListId } from "@/lib/tradelist-exchange";

const NEW_LIST = "__new__";

export interface OfferToWishlistContext {
  groupSlug: string;
  groupName: string;
  counterpartyUserId: string;
  counterpartyName: string;
}

export interface OfferablePrintingChoice {
  printing: Printing;
  copyIds: string[];
}

interface OfferToWishlistDialogProps extends OfferToWishlistContext {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  choices: OfferablePrintingChoice[];
  wantQuantity: number;
}

export function OfferToWishlistDialog({
  open,
  onOpenChange,
  choices,
  wantQuantity,
  groupSlug,
  groupName,
  counterpartyUserId,
  counterpartyName,
}: OfferToWishlistDialogProps) {
  const [firstChoice, ...otherChoices] = choices;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && firstChoice !== undefined ? (
          <Suspense
            fallback={<div className="text-muted-foreground py-4 text-sm">Loading your lists…</div>}
          >
            <OfferBody
              choices={[firstChoice, ...otherChoices]}
              wantQuantity={wantQuantity}
              groupSlug={groupSlug}
              groupName={groupName}
              counterpartyUserId={counterpartyUserId}
              counterpartyName={counterpartyName}
              onClose={() => onOpenChange(false)}
            />
          </Suspense>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function OfferBody({
  choices,
  wantQuantity,
  groupSlug,
  groupName,
  counterpartyUserId,
  counterpartyName,
  onClose,
}: OfferToWishlistContext & {
  choices: [OfferablePrintingChoice, ...OfferablePrintingChoice[]];
  wantQuantity: number;
  onClose: () => void;
}) {
  const { data: shareable } = useFriendGroupShareableLists(groupSlug);
  const { data: matches } = useFriendGroupMatches(groupSlug);
  const options = listTargetOptions(shareable.items, "trade");

  const createList = useCreateList();
  const bulkAdd = useBulkAddListEntries();
  const shareWithGroup = useShareListWithFriendGroup();
  const createTrade = useCreateTrade();
  const pending =
    createList.isPending || bulkAdd.isPending || shareWithGroup.isPending || createTrade.isPending;

  // `choices` arrives most-owned first.
  const [choiceIndex, setChoiceIndex] = useState(0);
  const chosenPrinting = choices[choiceIndex] ?? choices[0];
  const ownedCount = chosenPrinting.copyIds.length;
  const cardName = chosenPrinting.printing.card.name;

  const existingMatch = matches.othersWantYourHaves.find(
    (row) =>
      row.printingId === chosenPrinting.printing.id &&
      row.counterpartyUserId === counterpartyUserId,
  );

  const matchCap = existingMatch ? existingMatch.buyQuantity : wantQuantity;
  const maxQuantity = Math.max(1, Math.min(ownedCount, matchCap));
  const [quantity, setQuantity] = useState(1);
  const clampQuantity = (value: number) => Math.min(Math.max(1, value), maxQuantity);
  const effectiveQuantity = clampQuantity(quantity);

  const [phase, setPhase] = useState<"pick" | "confirm-share">("pick");
  const [selectedId, setSelectedId] = useState<string>(() => preferredListId(options) ?? NEW_LIST);
  const [newName, setNewName] = useState("Tradelist");

  const chosenList = options.find((option) => option.listId === selectedId);
  // New lists are always private; an unshared existing list needs the same
  // confirmation. Either way the offer can't match until it's shared.
  const needsShare = selectedId === NEW_LIST ? true : chosenList ? !chosenList.isShared : false;
  const chosenListName =
    selectedId === NEW_LIST ? newName.trim() || "Tradelist" : (chosenList?.listName ?? "");

  const sendOffer = async () => {
    const newListName = newName.trim() || "Tradelist";
    try {
      const copyIds = chosenPrinting.copyIds.slice(0, effectiveQuantity);
      if (!existingMatch) {
        let listId: string;
        if (selectedId === NEW_LIST) {
          const created = await createList.mutateAsync({
            name: newListName,
            intent: "trade",
            kind: "copy",
          });
          listId = created.id;
        } else if (chosenList) {
          listId = chosenList.listId;
        } else {
          return;
        }
        await bulkAdd.mutateAsync({
          listId,
          entries: copyIds.map((copyId) => ({ copyId })),
        });
        if (needsShare) {
          await shareWithGroup.mutateAsync({ slug: groupSlug, listId });
        }
      }
      await createTrade.mutateAsync({
        groupSlug,
        counterpartyUserId,
        role: "giver",
        printingId: chosenPrinting.printing.id,
        quantity: effectiveQuantity,
      });
      toast.success(`Offered ${cardName} to ${counterpartyName}`);
      onClose();
    } catch {
      // Reported by the global mutation error toast.
    }
  };

  const printingPicker =
    choices.length > 1 ? (
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-sm">Which printing are you offering?</span>
        <RadioGroup
          value={String(choiceIndex)}
          onValueChange={(value) => {
            setChoiceIndex(Number(value));
            setQuantity(1);
          }}
        >
          {choices.map((choice, index) => {
            const inputId = `offer-printing-${choice.printing.id}`;
            return (
              <label
                key={choice.printing.id}
                htmlFor={inputId}
                className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2"
              >
                <RadioGroupItem id={inputId} value={String(index)} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {choice.printing.shortCode}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {choice.copyIds.length} owned
                </span>
              </label>
            );
          })}
        </RadioGroup>
      </div>
    ) : null;

  const stepper = (
    <div className="flex items-center justify-between gap-4 py-2">
      <span>How many?</span>
      <QuantityStepper
        value={effectiveQuantity}
        onValueChange={setQuantity}
        max={maxQuantity}
        editable
      />
    </div>
  );

  if (existingMatch) {
    return (
      <DialogForm onSubmit={() => void sendOffer()}>
        <DialogHeader>
          <DialogTitle>Offer this card</DialogTitle>
          <DialogDescription>
            Offer {cardName} to {counterpartyName}. They&apos;ll get a notification, and accepting
            reserves it for them.
          </DialogDescription>
        </DialogHeader>
        {printingPicker}
        {stepper}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" disabled={pending}>
            Send offer
          </Button>
        </DialogFooter>
      </DialogForm>
    );
  }

  if (phase === "confirm-share") {
    return (
      <DialogForm onSubmit={() => void sendOffer()}>
        <DialogHeader>
          <DialogTitle>
            Share {chosenListName} with {groupName}?
          </DialogTitle>
          <DialogDescription>
            Members of {groupName} will be able to view every card on {chosenListName}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setPhase("pick")}>
            Back
          </Button>
          <Button type="submit" disabled={pending}>
            Share and send offer
          </Button>
        </DialogFooter>
      </DialogForm>
    );
  }

  return (
    <DialogForm onSubmit={needsShare ? () => setPhase("confirm-share") : sendOffer}>
      <DialogHeader>
        <DialogTitle>Offer this card</DialogTitle>
        <DialogDescription>
          Pick a tradelist for {cardName}. Sharing it with {groupName} is what lets{" "}
          {counterpartyName} see your offer.
        </DialogDescription>
      </DialogHeader>

      {printingPicker}

      <RadioGroup value={selectedId} onValueChange={(value) => setSelectedId(String(value))}>
        {options.map((option) => {
          const inputId = `offer-tradelist-${option.listId}`;
          return (
            <label
              key={option.listId}
              htmlFor={inputId}
              className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2"
            >
              <RadioGroupItem id={inputId} value={option.listId} />
              <span className="min-w-0 flex-1 truncate font-medium">{option.listName}</span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {option.entryCount} {option.entryCount === 1 ? "copy" : "copies"}
              </span>
              <Badge variant={option.isShared ? "secondary" : "outline"} className="shrink-0">
                {option.isShared ? "Shared" : "Will be shared"}
              </Badge>
            </label>
          );
        })}
        <label
          htmlFor="offer-tradelist-new"
          className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2"
        >
          <RadioGroupItem id="offer-tradelist-new" value={NEW_LIST} />
          <PlusSquareIcon className="text-muted-foreground size-4 shrink-0" />
          <span className="flex-1 font-medium">New tradelist</span>
          <Badge variant="outline" className="shrink-0">
            Will be shared
          </Badge>
        </label>
      </RadioGroup>

      {selectedId === NEW_LIST ? (
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Tradelist name"
          aria-label="New tradelist name"
        />
      ) : null}

      {stepper}

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        {needsShare ? (
          <Button
            type="submit"
            disabled={pending || (selectedId === NEW_LIST && newName.trim().length === 0)}
          >
            Continue
          </Button>
        ) : (
          <Button type="submit" disabled={pending}>
            Send offer
          </Button>
        )}
      </DialogFooter>
    </DialogForm>
  );
}
