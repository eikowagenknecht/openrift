import type { Printing } from "@openrift/shared";
import { sortCards } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { Check, Layers, Minus, Package, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { useCards } from "@/hooks/use-cards";
import { useCollections } from "@/hooks/use-collections";
import { useCopies, useDisposeCopies, useMoveCopies } from "@/hooks/use-copies";
import { useDisplayStore } from "@/stores/display-store";

import { DisposeDialog } from "./dispose-dialog";
import { MoveDialog } from "./move-dialog";

interface CollectionGridProps {
  collectionId?: string;
}

/** Copies of the same printing, stacked into one visual entry. */
interface StackedEntry {
  printingId: string;
  printing: Printing;
  copyIds: string[];
}

export function CollectionGrid({ collectionId }: CollectionGridProps) {
  const { data: copies } = useCopies(collectionId);
  const { allCards } = useCards();
  const { data: collections } = useCollections();
  const moveCopies = useMoveCopies();
  const disposeCopies = useDisposeCopies();
  const showImages = useDisplayStore((s) => s.showImages);
  const cardFields = useDisplayStore((s) => s.cardFields);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stacked, setStacked] = useState(true);
  const [moveOpen, setMoveOpen] = useState(false);
  const [disposeOpen, setDisposeOpen] = useState(false);

  // Build a map from printing ID → Printing for quick lookups
  const printingById = new Map<string, Printing>();
  for (const p of allCards) {
    printingById.set(p.id, p);
  }

  // Group copies by printing ID into stacks
  const stacks: StackedEntry[] = [];
  const stackMap = new Map<string, StackedEntry>();
  for (const copy of copies) {
    const printing = printingById.get(copy.printingId);
    if (!printing) {
      continue;
    }
    const existing = stackMap.get(copy.printingId);
    if (existing) {
      existing.copyIds.push(copy.id);
    } else {
      const entry: StackedEntry = { printingId: copy.printingId, printing, copyIds: [copy.id] };
      stackMap.set(copy.printingId, entry);
      stacks.push(entry);
    }
  }

  // Sort stacks in the same order as the main card browser (default: by card ID)
  const sortedCards = sortCards(
    stacks.map((s) => s.printing),
    "id",
  );
  const stackByPrintingId = new Map(stacks.map((s) => [s.printingId, s]));
  const sortedStacks = sortedCards
    .map((c) => stackByPrintingId.get(c.id))
    .filter((s): s is StackedEntry => s !== undefined);

  const totalCopies = sortedStacks.reduce((sum, s) => sum + s.copyIds.length, 0);

  const toggleSelect = (copyId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(copyId)) {
        next.delete(copyId);
      } else {
        next.add(copyId);
      }
      return next;
    });
  };

  const toggleStack = (copyIds: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = copyIds.every((id) => next.has(id));
      for (const id of copyIds) {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === totalCopies) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sortedStacks.flatMap((s) => s.copyIds)));
    }
  };

  const handleMove = (toCollectionId: string) => {
    moveCopies.mutate(
      { copyIds: [...selected], toCollectionId },
      {
        onSuccess: () => {
          toast.success(`Moved ${selected.size} card${selected.size > 1 ? "s" : ""}`);
          setSelected(new Set());
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
          setSelected(new Set());
          setDisposeOpen(false);
        },
      },
    );
  };

  const currentCollection = collections.find((c) => c.id === collectionId);

  const addTarget = collectionId ?? collections.find((c) => c.isInbox)?.id;

  if (sortedStacks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
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

  return (
    <div className="flex flex-col gap-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>
          {totalCopies} card{totalCopies === 1 ? "" : "s"}
          {sortedStacks.length !== totalCopies && ` (${sortedStacks.length} unique)`}
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
          onClick={() => setStacked((s) => !s)}
          className="text-xs"
          title={stacked ? "Show individual copies" : "Stack duplicates"}
        >
          <Layers className="mr-1 size-3" />
          {stacked ? "Expand" : "Stack"}
        </Button>
        <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs">
          {selected.size === totalCopies ? "Deselect all" : "Select all"}
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {stacked
          ? sortedStacks.map((stack) => {
              const stackSelected = stack.copyIds.every((id) => selected.has(id));
              return (
                <div key={stack.printingId} className="relative">
                  <button
                    type="button"
                    className={`absolute left-3 top-3 z-20 flex size-5 cursor-pointer items-center justify-center rounded border transition-all ${
                      stackSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-white/70 bg-black/30 text-transparent hover:border-white hover:text-white/70"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStack(stack.copyIds);
                    }}
                  >
                    <Check className="size-3" />
                  </button>
                  {stackSelected && (
                    <div className="pointer-events-none absolute inset-1.5 z-10 rounded-lg ring-2 ring-primary/50" />
                  )}
                  <CardThumbnail
                    printing={stack.printing}
                    onClick={() => toggleStack(stack.copyIds)}
                    showImages={showImages}
                    cardFields={cardFields}
                    view="printings"
                    ownedCount={stack.copyIds.length > 1 ? stack.copyIds.length : undefined}
                  />
                </div>
              );
            })
          : sortedStacks.flatMap((stack) =>
              stack.copyIds.map((copyId) => (
                <div key={copyId} className="relative">
                  <button
                    type="button"
                    className={`absolute left-3 top-3 z-20 flex size-5 cursor-pointer items-center justify-center rounded border transition-all ${
                      selected.has(copyId)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-white/70 bg-black/30 text-transparent hover:border-white hover:text-white/70"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(copyId);
                    }}
                  >
                    <Check className="size-3" />
                  </button>
                  {selected.has(copyId) && (
                    <div className="pointer-events-none absolute inset-1.5 z-10 rounded-lg ring-2 ring-primary/50" />
                  )}
                  <CardThumbnail
                    printing={stack.printing}
                    onClick={() => toggleSelect(copyId)}
                    showImages={showImages}
                    cardFields={cardFields}
                    view="printings"
                  />
                </div>
              )),
            )}
      </div>

      {/* Floating action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-background px-4 py-2 shadow-lg">
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
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            ✕
          </Button>
        </div>
      )}

      <MoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        collections={collections.filter((c) => c.id !== collectionId)}
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
