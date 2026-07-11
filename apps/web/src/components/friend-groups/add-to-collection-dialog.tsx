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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useApplyTradeSync } from "@/hooks/use-card-trades";
import { useCollections, useCreateCollection } from "@/hooks/use-collections";

/** Sentinel for the "create a new collection" radio option. */
const NEW_COLLECTION = "__new__";

interface AddToCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The completed trade whose received copies are being added. */
  tradeId: string;
  /** For trade-cache invalidation after the sync applies. */
  groupSlug: string;
  cardName: string;
  /** How many copies the trade brings in — added as-is, so there is no stepper. */
  quantity: number;
}

/**
 * Lets the receiver of a completed trade choose which collection the incoming
 * copies land in (defaulting to the inbox), or create a new collection on the
 * spot. Picking nothing else is needed — the quantity is fixed by the trade.
 * @returns The dialog element.
 */
export function AddToCollectionDialog({
  open,
  onOpenChange,
  tradeId,
  groupSlug,
  cardName,
  quantity,
}: AddToCollectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open ? (
          <Suspense
            fallback={
              <div className="text-muted-foreground py-4 text-sm">Loading your collections…</div>
            }
          >
            <AddToCollectionBody
              tradeId={tradeId}
              groupSlug={groupSlug}
              cardName={cardName}
              quantity={quantity}
              onClose={() => onOpenChange(false)}
            />
          </Suspense>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AddToCollectionBody({
  tradeId,
  groupSlug,
  cardName,
  quantity,
  onClose,
}: {
  tradeId: string;
  groupSlug: string;
  cardName: string;
  quantity: number;
  onClose: () => void;
}) {
  const { data: collections } = useCollections();
  const createCollection = useCreateCollection();
  const applySync = useApplyTradeSync();
  const pending = createCollection.isPending || applySync.isPending;

  const inbox = collections.find((collection) => collection.isInbox);
  const [selectedId, setSelectedId] = useState<string>(
    () => inbox?.id ?? collections[0]?.id ?? NEW_COLLECTION,
  );
  const [newName, setNewName] = useState("Collection");

  const confirm = async () => {
    const newCollectionName = newName.trim() || "Collection";
    try {
      let targetCollectionId: string;
      if (selectedId === NEW_COLLECTION) {
        const created = await createCollection.mutateAsync({
          name: newCollectionName,
        });
        targetCollectionId = created.id;
      } else {
        targetCollectionId = selectedId;
      }
      await applySync.mutateAsync({ tradeId, targetCollectionId, groupSlug });
      toast.success(`Added ${cardName} to your collection`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add to your collection");
    }
  };

  return (
    <DialogForm onSubmit={confirm}>
      <DialogHeader>
        <DialogTitle>Add to my collection</DialogTitle>
        <DialogDescription>
          Choose where the {quantity}× {cardName} you received should go.
        </DialogDescription>
      </DialogHeader>

      <RadioGroup value={selectedId} onValueChange={(value) => setSelectedId(String(value))}>
        {collections.map((collection) => {
          const inputId = `add-collection-${collection.id}`;
          return (
            <label
              key={collection.id}
              htmlFor={inputId}
              className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2"
            >
              <RadioGroupItem id={inputId} value={collection.id} />
              <span className="min-w-0 flex-1 truncate font-medium">{collection.name}</span>
              {collection.isInbox ? (
                <Badge variant="secondary" className="shrink-0">
                  Inbox
                </Badge>
              ) : null}
              {collection.groupName ? (
                // Group-shared: adding here makes the card visible to that group.
                <Badge variant="outline" className="max-w-32 shrink-0 truncate">
                  {collection.groupName}
                </Badge>
              ) : null}
              <span className="text-muted-foreground shrink-0 text-xs">
                {collection.copyCount} {collection.copyCount === 1 ? "card" : "cards"}
              </span>
            </label>
          );
        })}
        <label
          htmlFor="add-collection-new"
          className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2"
        >
          <RadioGroupItem id="add-collection-new" value={NEW_COLLECTION} />
          <span className="flex-1 font-medium">New collection</span>
          <PlusSquareIcon className="text-muted-foreground size-4 shrink-0" />
        </label>
      </RadioGroup>

      {selectedId === NEW_COLLECTION ? (
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Collection name"
          aria-label="New collection name"
        />
      ) : null}

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button
          type="submit"
          disabled={pending || (selectedId === NEW_COLLECTION && newName.trim().length === 0)}
        >
          Add to collection
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
