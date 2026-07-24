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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCollections, useCreateCollection } from "@/hooks/use-collections";
import { useAddCopies } from "@/hooks/use-copies";
import { useProductDetail } from "@/hooks/use-products";
import { chunkProductCopies, expandProductContents, productCopyTotal } from "@/lib/product-copies";

interface ProductAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productSlug: string;
  productName: string;
}

/**
 * Adds a product's full card list to one of the viewer's collections
 * (defaulting to the inbox), with a count for owning the product more than
 * once. The contents come from the product-detail query, so opening the
 * dialog from the products index fetches them on demand while the detail
 * page hits the already-primed cache.
 * @returns The dialog element.
 */
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
    try {
      let targetId = selectedId;
      let targetName = collections.find((collection) => collection.id === selectedId)?.name;
      if (selectedId === NEW_COLLECTION_OPTION) {
        const created = await createCollection.mutateAsync({
          name: newName.trim() || "Collection",
        });
        targetId = created.id;
        targetName = created.name;
      }
      const batches = chunkProductCopies(
        expandProductContents(data.contents, targetId, productCount),
      );
      for (const batch of batches) {
        await addCopies.mutateAsync({ copies: batch });
      }
      toast.success(
        `Added ${totalCards} ${totalCards === 1 ? "card" : "cards"} to ${targetName ?? "your collection"}.`,
      );
      onClose();
    } catch {
      toast.error("Adding failed. Some cards may have been added.");
      setIsAdding(false);
    }
  };

  return (
    <DialogForm onSubmit={confirm}>
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
