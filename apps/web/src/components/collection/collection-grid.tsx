import type { Printing } from "@openrift/shared";
import { comparePrintings } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { Check, Layers, Minus, Package, Plus, Search, Trash2, X } from "lucide-react";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CardBrowser } from "@/components/card-browser";
import { CardViewer } from "@/components/card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFilterActions } from "@/hooks/use-card-filters";
import { useCardSelection } from "@/hooks/use-card-selection";
import { useCards } from "@/hooks/use-cards";
import { useCollections } from "@/hooks/use-collections";
import { useDisposeCopies, useMoveCopies } from "@/hooks/use-copies";
import { useOwnedCount } from "@/hooks/use-owned-count";
import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { useStackedCopies } from "@/hooks/use-stacked-copies";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

import { DisposeDialog } from "./dispose-dialog";
import { MoveDialog } from "./move-dialog";
import { QuickAddPalette } from "./quick-add-palette";

function SelectionCheckbox({
  isSelected,
  onToggle,
}: {
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Select card"
      className={cn(
        "absolute top-3 left-3 z-20 flex size-5 cursor-pointer items-center justify-center rounded border transition-all",
        isSelected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-white/70 bg-black/30 text-transparent hover:border-white hover:text-white/70",
      )}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Check className="size-3" />
    </button>
  );
}

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

  const { selected, toggleSelect, toggleStack, toggleSelectAll, clearSelection } =
    useCardSelection();
  const [stacked, setStacked] = useState(true);
  const [moveOpen, setMoveOpen] = useState(false);
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // Inline browse & add mode
  const [browsing, setBrowsing] = useQueryState("browsing", parseAsBoolean.withDefault(false));
  const { clearAllFilters } = useFilterActions();
  const navigate = useNavigate();

  const inboxId = collections.find((collection) => collection.isInbox)?.id;

  const startBrowsing = () => {
    if (collectionId) {
      void setBrowsing(true);
    } else if (inboxId) {
      void navigate({
        to: "/collections/$collectionId",
        params: { collectionId: inboxId },
        search: { browsing: true },
      });
    }
  };

  const handleCloseBrowsing = () => {
    clearAllFilters();
    void setBrowsing(null);
    useSelectionStore.getState().closeDetail();
    globalThis.scrollTo(0, 0);
  };

  // Data for quick-add palette
  const { allPrintings, sets } = useCards();
  const { data: session } = useSession();
  const { data: ownedCountByPrinting } = useOwnedCount(Boolean(session?.user));

  const setOrderMap = new Map(sets.map((s, index) => [s.id, index]));

  function toComparable(p: Printing) {
    return { ...p, setOrder: setOrderMap.get(p.setId), promoTypeSlug: p.promoType?.slug };
  }

  const printingsByCardId = new Map<string, Printing[]>();
  for (const p of allPrintings) {
    let group = printingsByCardId.get(p.card.id);
    if (!group) {
      group = [];
      printingsByCardId.set(p.card.id, group);
    }
    group.push(p);
  }
  for (const group of printingsByCardId.values()) {
    group.sort((a, b) => comparePrintings(toComparable(a), toComparable(b)));
  }

  // Cmd+K / Ctrl+K shortcut (skip when inline browser is open — it has its own search)
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (browsing) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setQuickAddOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [browsing]);

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

  const currentCollection = collections.find((collection) => collection.id === collectionId);
  const addTarget = collectionId ?? collections.find((collection) => collection.isInbox)?.id;

  // Inline browse & add: render CardBrowser in place of the collection grid
  if (browsing && addTarget) {
    return <CardBrowser collectionId={addTarget} onDone={handleCloseBrowsing} />;
  }

  // Build item list and lookup map for renderCard
  const stackByItemId = new Map<string, StackedEntry>();
  const items: CardViewerItem[] = stacked
    ? stacks.map((stack) => {
        stackByItemId.set(stack.printingId, stack);
        return { id: stack.printingId, printing: stack.printing };
      })
    : stacks.flatMap((stack) =>
        stack.copyIds.map((copyId) => {
          stackByItemId.set(copyId, stack);
          return { id: copyId, printing: stack.printing };
        }),
      );

  const allCopyIds = stacks.flatMap((stack) => stack.copyIds);

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const stack = stackByItemId.get(item.id);
    if (!stack) {
      return null;
    }

    const isItemSelected = stacked
      ? stack.copyIds.every((id) => selected.has(id))
      : selected.has(item.id);

    const handleToggle = () => {
      if (stacked) {
        toggleStack(stack.copyIds);
      } else {
        toggleSelect(item.id);
      }
    };

    return (
      <div className="relative">
        <SelectionCheckbox isSelected={isItemSelected} onToggle={handleToggle} />
        {isItemSelected && (
          <div className="ring-primary/50 pointer-events-none absolute inset-1.5 z-10 rounded-lg ring-2" />
        )}
        <CardThumbnail
          printing={item.printing}
          onClick={handleToggle}
          showImages={showImages}
          visibleFields={visibleFields}
          view="printings"
          cardWidth={ctx.cardWidth}
          priority={ctx.priority}
          ownedCount={stacked && stack.copyIds.length > 1 ? stack.copyIds.length : undefined}
        />
      </div>
    );
  };

  const toolbar = (
    <div className="text-muted-foreground flex items-center gap-1 text-sm sm:gap-4">
      <span className="shrink-0">
        {totalCopies} card{totalCopies === 1 ? "" : "s"}
        {stacks.length !== totalCopies && ` (${stacks.length} unique)`}
      </span>
      {selected.size > 0 && (
        <Badge variant="secondary" className="hidden gap-1 sm:flex">
          <Check className="size-3" />
          {selected.size} selected
        </Badge>
      )}
      <div className="flex-1" />
      {addTarget && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setQuickAddOpen(true)}
            className="text-xs"
            title="Quick add"
          >
            <Search className="size-3 sm:mr-1" />
            <span className="hidden sm:inline">Quick add</span>
            <kbd className="bg-muted text-muted-foreground ml-1.5 hidden rounded px-1 py-0.5 font-mono text-[10px] sm:inline">
              ⌘K
            </kbd>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={startBrowsing}
            className="text-xs"
            title="Browse & add"
          >
            <Plus className="size-3 sm:mr-1" />
            <span className="hidden sm:inline">Browse & add</span>
          </Button>
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setStacked((prev) => !prev)}
        className="text-xs"
        title={stacked ? "Show individual copies" : "Stack duplicates"}
      >
        <Layers className="size-3 sm:mr-1" />
        <span className="hidden sm:inline">{stacked ? "Expand" : "Stack"}</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => toggleSelectAll(allCopyIds)}
        className="text-xs"
        title={selected.size === totalCopies ? "Deselect all" : "Select all"}
      >
        <span className="sm:hidden">{selected.size === totalCopies ? "Deselect" : "All"}</span>
        <span className="hidden sm:inline">
          {selected.size === totalCopies ? "Deselect all" : "Select all"}
        </span>
      </Button>
    </div>
  );

  return (
    <>
      {stacks.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-20">
          <Package className="size-10 opacity-50" />
          <p>No cards yet</p>
          <p className="text-xs">
            Browse the card catalog and add cards to{" "}
            {currentCollection ? `"${currentCollection.name}"` : "your collection"}.
          </p>
          {addTarget && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setQuickAddOpen(true)}>
                <Search className="mr-1 size-3.5" />
                Quick add
              </Button>
              <Button size="sm" onClick={startBrowsing}>
                <Plus className="mr-1 size-3.5" />
                Browse & add
              </Button>
            </div>
          )}
        </div>
      ) : (
        <CardViewer
          items={items}
          totalItems={totalCopies}
          renderCard={renderCard}
          toolbar={toolbar}
        >
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
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                aria-label="Clear selection"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          )}

          <MoveDialog
            open={moveOpen}
            onOpenChange={setMoveOpen}
            collections={collections.filter((collection) => collection.id !== collectionId)}
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
        </CardViewer>
      )}

      {addTarget && (
        <QuickAddPalette
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          collectionId={addTarget}
          collectionName={currentCollection?.name ?? "Collection"}
          printingsByCardId={printingsByCardId}
          ownedCountByPrinting={ownedCountByPrinting}
        />
      )}
    </>
  );
}
