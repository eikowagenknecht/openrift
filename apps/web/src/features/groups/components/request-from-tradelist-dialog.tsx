import type { Printing } from "@openrift/shared/types/catalog";
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
import { useCreateTrade } from "@/features/groups/hooks/use-card-trades";
import {
  useFriendGroupMatches,
  useFriendGroupShareableLists,
  useShareListWithFriendGroup,
} from "@/features/groups/hooks/use-friend-groups";
import {
  entryForPrinting,
  listKindNoun,
  listTargetOptions,
  preferredListId,
  requestListKind,
} from "@/features/groups/lib/tradelist-exchange";
import { LIST_KIND_ICON } from "@/features/lists/components/create-list-dialog";
import { useBulkAddListEntries, useCreateList } from "@/features/lists/hooks/use-lists";

const NEW_LIST = "__new__";

export interface TradelistRequestContext {
  groupSlug: string;
  groupName: string;
  counterpartyUserId: string;
  counterpartyName: string;
}

interface RequestFromTradelistDialogProps extends TradelistRequestContext {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  printing: Printing | null;
  availableHint: number;
}

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

  const [phase, setPhase] = useState<"pick" | "confirm-share">("pick");
  const [selectedId, setSelectedId] = useState<string>(() => preferredListId(options) ?? NEW_LIST);
  const [newName, setNewName] = useState("Wishlist");

  const cardName = printing.card.name;
  const chosen = options.find((option) => option.listId === selectedId);
  const NewKindIcon = LIST_KIND_ICON[requestListKind()];
  // New lists are always private; an unshared existing list needs the same
  // confirmation. Either way the request can't match until it's shared.
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
      // Reported by the global mutation error toast.
    }
  };

  const stepper = (
    <div className="flex items-center justify-between gap-4 py-2">
      <span>How many?</span>
      <QuantityStepper value={quantity} onValueChange={setQuantity} max={maxQuantity} editable />
    </div>
  );

  if (existingMatch) {
    return (
      <DialogForm onSubmit={() => void sendRequest()}>
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

  if (phase === "confirm-share") {
    return (
      <DialogForm onSubmit={() => void sendRequest()}>
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
          const KindIcon = LIST_KIND_ICON[option.listKind];
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
