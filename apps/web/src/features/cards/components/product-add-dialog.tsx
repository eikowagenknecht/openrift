import { Suspense, useState } from "react";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import { useProductDetail } from "@/features/cards/hooks/use-products";
import type { ProductCopyRow } from "@/features/cards/lib/product-copies";
import {
  chunkProductCopies,
  expandProductContents,
  productCopyTotal,
} from "@/features/cards/lib/product-copies";
import {
  CollectionRadioPicker,
  NEW_COLLECTION_OPTION,
} from "@/features/collections/components/collection-radio-picker";
import { useCollections, useCreateCollection } from "@/features/collections/hooks/use-collections";
import { useAddCopies } from "@/features/collections/hooks/use-copies";

// Sends batches sequentially so the server never sees a later one before an
// earlier one. Lives outside the component: React Compiler cannot lower a
// loop that sits inside a try/catch.
async function addBatchesInOrder(
  batches: ProductCopyRow[][],
  addCopies: (input: { copies: ProductCopyRow[] }) => Promise<unknown>,
): Promise<void> {
  for (const batch of batches) {
    await addCopies({ copies: batch });
  }
}

interface ProductAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productSlug: string;
  productName: string;
}

export function ProductAddDialog({
  open,
  onOpenChange,
  productSlug,
  productName,
}: ProductAddDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open ? (
          <Suspense
            fallback={<div className="text-muted-foreground py-4 text-sm">Loading product…</div>}
          >
            <ProductAddBody
              productSlug={productSlug}
              productName={productName}
              onClose={() => onOpenChange(false)}
            />
          </Suspense>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProductAddBody({
  productSlug,
  productName,
  onClose,
}: {
  productSlug: string;
  productName: string;
  onClose: () => void;
}) {
  const { data } = useProductDetail(productSlug);
  const { data: collections } = useCollections();
  const createCollection = useCreateCollection();
  const addCopies = useAddCopies();
  // addCopies.isPending flickers between batches — track the whole confirm.
  const [isAdding, setIsAdding] = useState(false);

  const inbox = collections.find((collection) => collection.isInbox);
  const [selectedId, setSelectedId] = useState<string>(
    () => inbox?.id ?? collections[0]?.id ?? NEW_COLLECTION_OPTION,
  );
  const [newName, setNewName] = useState("Collection");
  const [countText, setCountText] = useState("1");

  // Number("") is 0 and trailing garbage yields NaN — both fail the >= 1 check.
  const productCount = Math.trunc(Number(countText));
  const countValid = Number.isInteger(productCount) && productCount >= 1;
  const totalCards = countValid ? productCopyTotal(data.contents, productCount) : 0;
  const pending = isAdding || createCollection.isPending;

  const confirm = async () => {
    if (!countValid || totalCards === 0) {
      return;
    }
    setIsAdding(true);
    // Every conditional is resolved up front: React Compiler cannot lower a
    // ternary, `??`, `||` or `?.` that sits inside a try/catch.
    const newCollectionName = newName.trim() || "Collection";
    const cardNoun = totalCards === 1 ? "card" : "cards";
    let targetId = selectedId;
    let targetName =
      collections.find((collection) => collection.id === selectedId)?.name ?? "your collection";
    try {
      if (selectedId === NEW_COLLECTION_OPTION) {
        const created = await createCollection.mutateAsync({ name: newCollectionName });
        targetId = created.id;
        targetName = created.name;
      }
      const batches = chunkProductCopies(
        expandProductContents(data.contents, targetId, productCount),
      );
      await addBatchesInOrder(batches, addCopies.mutateAsync);
      toast.success(`Added ${totalCards} ${cardNoun} to ${targetName}.`);
      onClose();
    } catch {
      // Second toast alongside the global mutation error one: batches before
      // the failing one already committed.
      toast.error("Adding failed. Some cards may have been added.");
      setIsAdding(false);
    }
  };

  return (
    <DialogForm onSubmit={() => void confirm()}>
      <DialogHeader>
        <DialogTitle>Add to collection</DialogTitle>
        <DialogDescription>
          Adds every card from {productName} to the collection you pick.
        </DialogDescription>
      </DialogHeader>

      <CollectionRadioPicker
        collections={collections}
        selectedId={selectedId}
        onSelectedIdChange={setSelectedId}
        newName={newName}
        onNewNameChange={setNewName}
        idPrefix="product-add"
      />

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="product-add-count">How many do you have?</Label>
        <Input
          id="product-add-count"
          type="number"
          min={1}
          inputMode="numeric"
          className="w-20"
          value={countText}
          onChange={(event) => setCountText(event.target.value)}
        />
      </div>

      <p className="text-muted-foreground text-sm" aria-live="polite">
        {countValid
          ? `This adds ${totalCards} ${totalCards === 1 ? "card" : "cards"}.`
          : "Enter how many of this product you have."}
      </p>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button
          type="submit"
          disabled={
            pending ||
            !countValid ||
            totalCards === 0 ||
            (selectedId === NEW_COLLECTION_OPTION && newName.trim().length === 0)
          }
        >
          {pending ? "Adding…" : "Add to collection"}
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
