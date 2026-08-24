import type { Printing } from "@openrift/shared";
import { MinusIcon, PlusIcon, PlusSquareIcon } from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { listKindIcon } from "@/components/list/create-list-dialog";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCreateTrade } from "@/hooks/use-card-trades";
import {
  useFriendGroupMatches,
  useFriendGroupShareableLists,
  useShareListWithFriendGroup,
} from "@/hooks/use-friend-groups";
import { useBulkAddListEntries, useCreateList } from "@/hooks/use-lists";
import {
  entryForPrinting,
  listKindNoun,
  listTargetOptions,
  preferredListId,
  requestListKind,
} from "@/lib/tradelist-exchange";

/** Sentinel for the "create a new wishlist" radio option. */
const NEW_LIST = "__new__";

export interface TradelistRequestContext {
  /** The group slug, used as the trade + share scope. */
  groupSlug: string;
  groupName: string;
  /** The tradelist owner — the giver of the requested copies. */
  counterpartyUserId: string;
  counterpartyName: string;
}

interface RequestFromTradelistDialogProps extends TradelistRequestContext {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The printing being requested; `null` while the dialog is closed. */
  printing: Printing | null;
  /** Copies of this printing visible on the tradelist — a soft cap for the stepper. */
  availableHint: number;
}

/**
 * "I want this" flow launched from a member's shared tradelist. Adds the card to
 * one of the viewer's wishlists (creating one if needed), shares that wishlist
 * with the group after an explicit confirmation so a match exists, then sends
 * the trade request. When the card already matches a shared wishlist the picker
 * is skipped and it goes straight to a one-tap confirm.
 *
 * @returns The dialog element.
 */
export function RequestFromTradelistDialog({
  open,
  onOpenChange,
  printing,
  availableHint,
  groupSlug,
  groupName,
  counterpartyUserId,
  counterpartyName,
}: RequestFromTradelistDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && printing ? (
          <Suspense
            fallback={<div className="text-muted-foreground py-4 text-sm">Loading your lists…</div>}
          >
            <RequestBody
              printing={printing}
              availableHint={availableHint}
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

function RequestBody({
  printing,
  availableHint,
  groupSlug,
  groupName,
  counterpartyUserId,
  counterpartyName,
  onClose,
}: TradelistRequestContext & {
  printing: Printing;
  availableHint: number;
  onClose: () => void;
}) {
  const { data: shareable } = useFriendGroupShareableLists(groupSlug);
  const { data: matches } = useFriendGroupMatches(groupSlug);
  const options = listTargetOptions(shareable.items, "wish");

  // If the card already matches a wishlist shared with this group, there is
  // nothing to add or share — skip straight to the request confirm. This also
  // avoids bumping the existing wish quantity on every click.
  const existingMatch = matches.othersHaveYourWants.find(
    (row) => row.printingId === printing.id && row.counterpartyUserId === counterpartyUserId,
  );

  const createList = useCreateList();
  const bulkAdd = useBulkAddListEntries();
  const shareWithGroup = useShareListWithFriendGroup();
  const createTrade = useCreateTrade();
  const pending =
    createList.isPending || bulkAdd.isPending || shareWithGroup.isPending || createTrade.isPending;

  const maxQuantity = Math.max(
    1,
    existingMatch ? Math.min(existingMatch.buyQuantity, availableHint) : availableHint,
  );
  const [quantity, setQuantity] = useState(1);
  const clampQuantity = (value: number) => Math.min(Math.max(1, value), maxQuantity);

  const [phase, setPhase] = useState<"pick" | "confirm-share">("pick");
  const [selectedId, setSelectedId] = useState<string>(() => preferredListId(options) ?? NEW_LIST);
  const [newName, setNewName] = useState("Wishlist");

  const cardName = printing.card.name;
  const chosen = options.find((option) => option.listId === selectedId);
  // The kind a new wishlist would be created as, shown as its glyph on the
  // "New wishlist" option so the picker stays consistent with the rows above.
  const NewKindIcon = listKindIcon(requestListKind());
  // New lists are always private at first, and an existing list the viewer
  // picked might not be shared with this group yet — both need the explicit
  // share confirmation before the request can match.
  const needsShare = selectedId === NEW_LIST ? true : chosen ? !chosen.isShared : false;
  const chosenName =
    selectedId === NEW_LIST ? newName.trim() || "Wishlist" : (chosen?.listName ?? "");

  const sendRequest = async () => {
    const newListName = newName.trim() || "Wishlist";
    try {
      if (existingMatch) {
        await createTrade.mutateAsync({
          groupSlug,
          counterpartyUserId,
          role: "receiver",
          printingId: printing.id,
          quantity,
        });
      } else {
        let listId: string;
        const listKind = requestListKind(chosen);
        if (selectedId === NEW_LIST) {
          const created = await createList.mutateAsync({
            name: newListName,
            intent: "wish",
            kind: listKind,
          });
          listId = created.id;
        } else if (chosen) {
          listId = chosen.listId;
        } else {
          return;
        }
        await bulkAdd.mutateAsync({
          listId,
          entries: [entryForPrinting(listKind, printing, quantity)],
        });
        if (needsShare) {
          await shareWithGroup.mutateAsync({ slug: groupSlug, listId });
        }
        await createTrade.mutateAsync({
          groupSlug,
          counterpartyUserId,
          role: "receiver",
          printingId: printing.id,
          quantity,
        });
      }
      toast.success(`Requested ${cardName} from ${counterpartyName}`);
      onClose();
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  };

  const stepper = (
    <div className="flex items-center justify-between gap-4 py-2">
      <span>How many?</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Decrease quantity"
          disabled={quantity <= 1}
          onClick={() => setQuantity((current) => clampQuantity(current - 1))}
        >
          <MinusIcon />
        </Button>
        <Input
          type="number"
          min={1}
          max={maxQuantity}
          value={quantity}
          aria-label="Quantity"
          className="w-16 [appearance:textfield] text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          onChange={(event) => setQuantity(clampQuantity(Number(event.target.value)))}
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Increase quantity"
          disabled={quantity >= maxQuantity}
          onClick={() => setQuantity((current) => clampQuantity(current + 1))}
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  );

  // Already a shared match → one-tap confirm, no list picking or sharing.
  if (existingMatch) {
    return (
      <DialogForm onSubmit={sendRequest}>
        <DialogHeader>
          <DialogTitle>Request this card</DialogTitle>
          <DialogDescription>
            Ask {counterpartyName} for {cardName}. They&apos;ll get a notification, and accepting
            reserves it for you.
          </DialogDescription>
        </DialogHeader>
        {stepper}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" disabled={pending}>
            Send request
          </Button>
        </DialogFooter>
      </DialogForm>
    );
  }

  // Share confirmation step (only reached when the chosen list isn't shared yet).
  if (phase === "confirm-share") {
    return (
      <DialogForm onSubmit={sendRequest}>
        <DialogHeader>
          <DialogTitle>
            Share {chosenName} with {groupName}?
          </DialogTitle>
          <DialogDescription>
            Members of {groupName} will be able to view every card on {chosenName}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setPhase("pick")}>
            Back
          </Button>
          <Button type="submit" disabled={pending}>
            Share and send request
          </Button>
        </DialogFooter>
      </DialogForm>
    );
  }

  return (
    <DialogForm onSubmit={needsShare ? () => setPhase("confirm-share") : sendRequest}>
      <DialogHeader>
        <DialogTitle>Request this card</DialogTitle>
        <DialogDescription>
          Pick a wishlist for {cardName}. Sharing it with {groupName} is what lets{" "}
          {counterpartyName} see your request.
        </DialogDescription>
      </DialogHeader>

      <RadioGroup value={selectedId} onValueChange={(value) => setSelectedId(String(value))}>
        {options.map((option) => {
          const inputId = `request-wishlist-${option.listId}`;
          const KindIcon = listKindIcon(option.listKind);
          return (
            <label
              key={option.listId}
              htmlFor={inputId}
              className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2"
            >
              <RadioGroupItem id={inputId} value={option.listId} />
              <span className="min-w-0 flex-1 truncate font-medium">{option.listName}</span>
              <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs">
                <KindIcon className="size-3" />
                {option.entryCount} {listKindNoun(option.listKind, option.entryCount)}
              </span>
              <Badge variant={option.isShared ? "secondary" : "outline"} className="shrink-0">
                {option.isShared ? "Shared" : "Will be shared"}
              </Badge>
            </label>
          );
        })}
        <label
          htmlFor="request-wishlist-new"
          className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2"
        >
          <RadioGroupItem id="request-wishlist-new" value={NEW_LIST} />
          <PlusSquareIcon className="text-muted-foreground size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate font-medium">New wishlist</span>
          <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs">
            <NewKindIcon className="size-3" />
            printings
          </span>
          <Badge variant="outline" className="shrink-0">
            Will be shared
          </Badge>
        </label>
      </RadioGroup>

      {selectedId === NEW_LIST ? (
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Wishlist name"
          aria-label="New wishlist name"
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
            Send request
          </Button>
        )}
      </DialogFooter>
    </DialogForm>
  );
}
