import { Link } from "@tanstack/react-router";
import { Check, Layers, Minus, Package, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { useCardSelection } from "@/hooks/use-card-selection";
import { useCollections } from "@/hooks/use-collections";
import { useDisposeCopies, useMoveCopies } from "@/hooks/use-copies";
import { useStackedCopies } from "@/hooks/use-stacked-copies";
import { useDisplayStore } from "@/stores/display-store";

import { DisposeDialog } from "./dispose-dialog";
import { MoveDialog } from "./move-dialog";

interface CollectionGridProps {
  collectionId?: string;
}

export function CollectionGrid({ collectionId }: CollectionGridProps) {
  const { stacks, totalCopies } = useStackedCopies(collectionId);
  const { data: collections } = useCollections();
  const moveCopies = useMoveCopies();
  const disposeCopies = useDisposeCopies();
  const showImages = useDisplayStore((state) => state.showImages);
  const visibleFields = useDisplayStore((state) => state.visibleFields);

  const { selected, toggleSelect, toggleStack, selectAll, clearSelection } = useCardSelection();
  const [stacked, setStacked] = useState(true);
  const [moveOpen, setMoveOpen] = useState(false);
  const [disposeOpen, setDisposeOpen] = useState(false);

  const handleMove = (toCollectionId: string) => {
    moveCopies.mutate(
      { copyIds: [...selected], toCollectionId },
      {
        onSuccess: () => {
          toast.success(`Moved ${selected.size} card${selected.size > 1 ? "s" : ""}`);
          clearSelection();
          setMoveOpen(false);
        },
      },
    );
  };

  const handleDispose = () => {
    disposeCopies.mutate(
      { copyIds: [...selected] },
      {
        onSuccess: () => {
          toast.success(`Removed ${selected.size} card${selected.size > 1 ? "s" : ""}`);
          clearSelection();
          setDisposeOpen(false);
        },
      },
    );
  };

  const currentCollection = collections.find((col) => col.id === collectionId);
  const addTarget = collectionId ?? collections.find((col) => col.isInbox)?.id;

  if (stacks.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-20">
        <Package className="size-10 opacity-50" />
        <p>No cards yet</p>
        <p className="text-xs">
          Browse the card catalog and add cards to{" "}
          {currentCollection ? `"${currentCollection.name}"` : "your collection"}.
        </p>
        {addTarget && (
          <Link
            to="/cards"
            search={{ adding: true, addingTo: addTarget }}
            className={buttonVariants({ size: "sm" })}
          >
            <Plus className="mr-1 size-3.5" />
            Add cards
          </Link>
        )}
      </div>
    );
  }

  const allCopyIds = stacks.flatMap((stack) => stack.copyIds);

  return (
    <div className="flex flex-col gap-4">
      {/* Stats bar */}
      <div className="text-muted-foreground flex items-center gap-4 text-sm">
        <span>
          {totalCopies} card{totalCopies === 1 ? "" : "s"}
          {stacks.length !== totalCopies && ` (${stacks.length} unique)`}
        </span>
        {selected.size > 0 && (
          <Badge variant="secondary" className="gap-1">
            <Check className="size-3" />
            {selected.size} selected
          </Badge>
        )}
        <div className="flex-1" />
        {addTarget && (
          <Link
            to="/cards"
            search={{ adding: true, addingTo: addTarget }}
            className={buttonVariants({ variant: "ghost", size: "sm", className: "text-xs" })}
          >
            <Plus className="mr-1 size-3" />
            Add cards
          </Link>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStacked((prev) => !prev)}
          className="text-xs"
          title={stacked ? "Show individual copies" : "Stack duplicates"}
        >
          <Layers className="mr-1 size-3" />
          {stacked ? "Expand" : "Stack"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => selectAll(allCopyIds)} className="text-xs">
          {selected.size === totalCopies ? "Deselect all" : "Select all"}
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {stacked
          ? stacks.map((stack) => {
              const stackSelected = stack.copyIds.every((id) => selected.has(id));
              return (
                <div key={stack.printingId} className="relative">
                  <button
                    type="button"
                    className={`absolute top-3 left-3 z-20 flex size-5 cursor-pointer items-center justify-center rounded border transition-all ${
                      stackSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-white/70 bg-black/30 text-transparent hover:border-white hover:text-white/70"
                    }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleStack(stack.copyIds);
                    }}
                  >
                    <Check className="size-3" />
                  </button>
                  {stackSelected && (
                    <div className="ring-primary/50 pointer-events-none absolute inset-1.5 z-10 rounded-lg ring-2" />
                  )}
                  <CardThumbnail
                    printing={stack.printing}
                    onClick={() => toggleStack(stack.copyIds)}
                    showImages={showImages}
                    visibleFields={visibleFields}
                    view="printings"
                    ownedCount={stack.copyIds.length > 1 ? stack.copyIds.length : undefined}
                  />
                </div>
              );
            })
          : stacks.flatMap((stack) =>
              stack.copyIds.map((copyId) => (
                <div key={copyId} className="relative">
                  <button
                    type="button"
                    className={`absolute top-3 left-3 z-20 flex size-5 cursor-pointer items-center justify-center rounded border transition-all ${
                      selected.has(copyId)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-white/70 bg-black/30 text-transparent hover:border-white hover:text-white/70"
                    }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleSelect(copyId);
                    }}
                  >
                    <Check className="size-3" />
                  </button>
                  {selected.has(copyId) && (
                    <div className="ring-primary/50 pointer-events-none absolute inset-1.5 z-10 rounded-lg ring-2" />
                  )}
                  <CardThumbnail
                    printing={stack.printing}
                    onClick={() => toggleSelect(copyId)}
                    showImages={showImages}
                    visibleFields={visibleFields}
                    view="printings"
                  />
                </div>
              )),
            )}
      </div>

      {/* Floating action bar */}
      {selected.size > 0 && (
        <div className="border-border bg-background fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-4 py-2 shadow-lg">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMoveOpen(true)}
            disabled={moveCopies.isPending}
          >
            <Minus className="mr-1 size-3.5" />
            Move
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDisposeOpen(true)}
            disabled={disposeCopies.isPending}
          >
            <Trash2 className="mr-1 size-3.5" />
            Dispose
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            ✕
          </Button>
        </div>
      )}

      <MoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        collections={collections.filter((col) => col.id !== collectionId)}
        onMove={handleMove}
        isPending={moveCopies.isPending}
      />

      <DisposeDialog
        open={disposeOpen}
        onOpenChange={setDisposeOpen}
        count={selected.size}
        onConfirm={handleDispose}
        isPending={disposeCopies.isPending}
      />
    </div>
  );
}
