import { Suspense, useState } from "react";

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
import { useCollections, useCreateCollection } from "@/hooks/use-collections";
import { useTradeAddTargetStore } from "@/stores/trade-add-target-store";

/**
 * Changes where incoming trade copies land, and nothing else. No trade is
 * touched: the settle session commits every row at once, so the target has to be
 * settable before there is anything to file — picking it mid-settle would mean
 * answering the same question once per card.
 * @returns The dialog element.
 */
export function TradeAddTargetDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open ? (
          <Suspense
            fallback={
              <div className="text-muted-foreground py-4 text-sm">Loading your collections…</div>
            }
          >
            <TradeAddTargetBody onClose={() => onOpenChange(false)} />
          </Suspense>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TradeAddTargetBody({ onClose }: { onClose: () => void }) {
  const { data: collections } = useCollections();
  const createCollection = useCreateCollection();
  const setTarget = useTradeAddTargetStore((state) => state.setTarget);

  // Opens on whatever the session would add to, so the dialog and the summary
  // above it never disagree. A remembered collection that has since been deleted
  // falls back to the inbox.
  const remembered = useTradeAddTargetStore((state) => state.target);
  const inbox = collections.find((collection) => collection.isInbox);
  const rememberedId = collections.find((collection) => collection.id === remembered?.id)?.id;
  const [selectedId, setSelectedId] = useState<string>(
    () => rememberedId ?? inbox?.id ?? collections[0]?.id ?? NEW_COLLECTION_OPTION,
  );
  const [newName, setNewName] = useState("Collection");

  const confirm = async () => {
    const newCollectionName = newName.trim() || "Collection";
    // Resolved up front: reading it inside the try would put an optional chain
    // in a try body, which the React Compiler bails on.
    const picked = collections.find((collection) => collection.id === selectedId);
    const pickedName = picked ? picked.name : newCollectionName;
    try {
      let targetId: string;
      if (selectedId === NEW_COLLECTION_OPTION) {
        const created = await createCollection.mutateAsync({ name: newCollectionName });
        targetId = created.id;
      } else {
        targetId = selectedId;
      }
      setTarget({ id: targetId, name: pickedName });
      onClose();
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  };

  return (
    <DialogForm onSubmit={() => void confirm()}>
      <DialogHeader>
        <DialogTitle>Where do incoming cards go?</DialogTitle>
        <DialogDescription>
          Cards you receive are filed here until you pick somewhere else.
        </DialogDescription>
      </DialogHeader>

      <CollectionRadioPicker
        collections={collections}
        selectedId={selectedId}
        onSelectedIdChange={setSelectedId}
        newName={newName}
        onNewNameChange={setNewName}
        idPrefix="trade-add-target"
      />

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button
          type="submit"
          disabled={
            createCollection.isPending ||
            (selectedId === NEW_COLLECTION_OPTION && newName.trim().length === 0)
          }
        >
          Use this collection
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
