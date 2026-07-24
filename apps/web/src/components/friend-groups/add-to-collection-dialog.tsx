import { Suspense, useState } from "react";
import { toast } from "sonner";

import {
  CollectionRadioPicker,
  NEW_COLLECTION_OPTION,
} from "@/components/collection/collection-radio-picker";
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
import { useApplyTradeSync } from "@/hooks/use-card-trades";
import { useCollections, useCreateCollection } from "@/hooks/use-collections";

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
    () => inbox?.id ?? collections[0]?.id ?? NEW_COLLECTION_OPTION,
  );
  const [newName, setNewName] = useState("Collection");

  const confirm = async () => {
    const newCollectionName = newName.trim() || "Collection";
    try {
      let targetCollectionId: string;
      if (selectedId === NEW_COLLECTION_OPTION) {
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

      <CollectionRadioPicker
        collections={collections}
        selectedId={selectedId}
        onSelectedIdChange={setSelectedId}
        newName={newName}
        onNewNameChange={setNewName}
        idPrefix="add-collection"
      />

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button
          type="submit"
          disabled={
            pending || (selectedId === NEW_COLLECTION_OPTION && newName.trim().length === 0)
          }
        >
          Add to collection
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
