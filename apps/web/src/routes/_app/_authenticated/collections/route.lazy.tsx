import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { imageUrl, legendDisplayName } from "@openrift/shared";
import { createLazyFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { resolveSelectionDrag } from "@/components/collection/collection-drag";
import { CollectionSidebar } from "@/components/collection/collection-sidebar";
import type {
  AnyDragData,
  CardDragData,
  ListEntryDragData,
} from "@/components/collection/dnd-types";
import { DndScrollWatcher } from "@/components/dnd-scroll-watcher";
import { Footer } from "@/components/layout/footer";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBarHeightContext,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import type { SidebarListDropData } from "@/components/list/droppable-sidebar-list";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useMoveCopies } from "@/hooks/use-copies";
import { useBulkAddCopiesToList, useMoveListEntries } from "@/hooks/use-lists";
import { describeListAdd } from "@/lib/list-toast";
import { FilterSearchProvider } from "@/lib/search-schemas";
import { cn } from "@/lib/utils";
import { useDragPreviewStore } from "@/stores/drag-preview-store";
import { useGridSelectionStore } from "@/stores/grid-selection-store";

import { TopBarSlotContext } from "./route";

export const Route = createLazyFileRoute("/_app/_authenticated/collections")({
  component: CollectionLayout,
});

const DRAG_ACTIVATION = { distance: 8 };
const MODIFIERS = [snapCenterToCursor];

function CollectionLayout() {
  const search = Route.useSearch();
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);
  const [activeDrag, setActiveDrag] = useState<AnyDragData | null>(null);
  // null → move 1 (default), "all" → Shift held, number → digit key 2-9 held.
  // Only meaningful for `collection-card` drags — list-entry drags always
  // carry the whole entry (no per-key trimming).
  const [moveModifier, setMoveModifier] = useState<"all" | number | null>(null);
  const moveCopies = useMoveCopies();
  const bulkAddCopiesToList = useBulkAddCopiesToList();
  const moveListEntries = useMoveListEntries();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: DRAG_ACTIVATION }));

  // Track Shift and digit keys 2-9 for the whole collections layout, not just
  // while a drag is active — otherwise pressing a modifier before grabbing a
  // card would be missed (the keydown fires before listeners attach). Editable
  // targets are ignored so typing a "3" in a search field doesn't update state.
  useEffect(() => {
    const parseDigit = (key: string) => {
      if (key.length !== 1) {
        return null;
      }
      const value = Number(key);
      return Number.isInteger(value) && value >= 2 && value <= 9 ? value : null;
    };
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }
      if (event.key === "Shift") {
        setMoveModifier("all");
        return;
      }
      const digit = parseDigit(event.key);
      if (digit !== null) {
        setMoveModifier(digit);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setMoveModifier((current) => (current === "all" ? null : current));
        return;
      }
      const digit = parseDigit(event.key);
      if (digit !== null) {
        setMoveModifier((current) => (current === digit ? null : current));
      }
    };
    // Clear on blur: if the user alt-tabs while holding a key, the keyup
    // arrives in another window and we never see it.
    const handleBlur = () => setMoveModifier(null);
    globalThis.addEventListener("keydown", handleKeyDown);
    globalThis.addEventListener("keyup", handleKeyUp);
    globalThis.addEventListener("blur", handleBlur);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
      globalThis.removeEventListener("keyup", handleKeyUp);
      globalThis.removeEventListener("blur", handleBlur);
    };
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as AnyDragData | undefined;
    if (data?.type === "collection-card") {
      // Resolve the live multi-selection at grab time so the overlay fans and
      // counts the whole selection, not just the grabbed tile's copies.
      setActiveDrag(resolveSelectionDrag(data));
      return;
    }
    if (data?.type === "list-entry") {
      setActiveDrag(data);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const modifier = moveModifier;
    setActiveDrag(null);

    const dragData = event.active.data.current as AnyDragData | undefined;
    const dropData = event.over?.data.current as
      | { type: "collection"; collectionId: string }
      | SidebarListDropData
      | undefined;

    if (!dropData || !dragData) {
      return;
    }

    if (dragData.type === "collection-card") {
      handleCollectionCardDrop(resolveSelectionDrag(dragData), dropData, modifier);
      return;
    }

    if (dragData.type === "list-entry" && dropData.type === "list") {
      handleListEntryDrop(dragData, dropData);
    }
  };

  function handleCollectionCardDrop(
    dragData: CardDragData,
    dropData: { type: "collection"; collectionId: string } | SidebarListDropData,
    modifier: "all" | number | null,
  ) {
    if (dropData.type === "collection") {
      // Same-collection drop is a no-op.
      if (dragData.sourceCollectionId === dropData.collectionId) {
        return;
      }
      const copyIds =
        dragData.isStackDrag && modifier !== "all"
          ? dragData.copyIds.slice(0, typeof modifier === "number" ? modifier : 1)
          : dragData.copyIds;
      const count = copyIds.length;
      moveCopies.mutate(
        { copyIds, toCollectionId: dropData.collectionId },
        {
          onSuccess: () => {
            toast.success(`Moved ${count} card${count > 1 ? "s" : ""}`);
            // The dragged copies left this collection; drop the selection that
            // pointed at them, matching the floating action bar's move.
            if (dragData.fromSelection) {
              useGridSelectionStore.getState().clearSelection();
            }
          },
        },
      );
      return;
    }

    // Copies you only have group access to aren't yours to trade away or wish
    // for. The sidebar already won't highlight such a drop, but a drop still
    // fires here, so refuse it with a clear note rather than a silent no-op
    // (the server would skip every copy and report nothing added).
    if (dropData.listIntent !== "organize" && dragData.sourceAllGroupCopies) {
      toast.info("Cards from a shared group collection can't go on trade or wish lists");
      return;
    }

    // Adding to a list is non-destructive (copies stay in their collection),
    // so the stack-trim-to-one default doesn't apply — all copies under the
    // dragged tile flow into the server, which derives the right entry shape
    // (card / printing / copy) from the list's kind and dedupes.
    bulkAddCopiesToList.mutate(
      { listId: dropData.listId, copyIds: dragData.copyIds },
      {
        onSuccess: (result) => {
          const listName = dropData.listName;
          toast[result.added + result.updated === 0 ? "info" : "success"](
            describeListAdd(result, listName),
          );
          // Mirror the "add to list" dialog, which clears the selection once
          // the cards are added.
          if (dragData.fromSelection) {
            useGridSelectionStore.getState().clearSelection();
          }
        },
      },
    );
  }

  function handleListEntryDrop(dragData: ListEntryDragData, dropData: SidebarListDropData) {
    // Defense-in-depth: the sidebar already refuses to highlight incompatible
    // targets and the server re-checks. Keeping the gate here too avoids
    // firing a pointless mutation on a no-op same-list drop.
    if (
      dropData.listId === dragData.sourceListId ||
      dropData.listKind !== dragData.sourceKind ||
      dropData.listIntent !== dragData.sourceIntent
    ) {
      return;
    }
    moveListEntries.mutate(
      {
        fromListId: dragData.sourceListId,
        toListId: dropData.listId,
        entryIds: dragData.entryIds,
      },
      {
        onSuccess: (result) => {
          if (result.moved === 0) {
            return;
          }
          const noun =
            dragData.sourceKind === "copy"
              ? `cop${result.moved === 1 ? "y" : "ies"}`
              : dragData.sourceKind === "printing"
                ? `printing${result.moved === 1 ? "" : "s"}`
                : `card${result.moved === 1 ? "" : "s"}`;
          toast.success(`Moved ${result.moved} ${noun} to ${dropData.listName}`);
        },
      },
    );
  }

  return (
    <FilterSearchProvider value={search}>
      <PageTopBarHeightContext value={topBarHeight}>
        <div className="flex min-h-0 flex-1 flex-col">
          <SidebarProvider className="flex-1">
            <DndContext
              sensors={sensors}
              collisionDetection={pointerWithin}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => {
                setActiveDrag(null);
              }}
            >
              <DndScrollWatcher />
              <TopBarSlotContext value={topBarSlot}>
                <CollectionSidebar />
                <CollectionContent setTopBarSlot={setTopBarSlot} />
              </TopBarSlotContext>
              <DragOverlay dropAnimation={null} modifiers={MODIFIERS}>
                {activeDrag?.type === "collection-card" && (
                  <DragPreview drag={activeDrag} modifier={moveModifier} />
                )}
                {activeDrag?.type === "list-entry" && <ListEntryDragPreview drag={activeDrag} />}
              </DragOverlay>
            </DndContext>
          </SidebarProvider>
        </div>
      </PageTopBarHeightContext>
    </FilterSearchProvider>
  );
}

function CollectionContent({
  setTopBarSlot,
}: {
  setTopBarSlot: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="pr-safe flex min-w-0 flex-1 flex-col pb-3 pl-3">
      {/* Page top bar lives in the content column (not full-width above the sidebar)
          so the sidebar can rise to the header. -mx-3 full-bleeds the blur across the
          column while PAGE_TOP_BAR_STICKY's own px-3 keeps its content aligned. */}
      <div ref={setTopBarSlot} className={cn(PAGE_TOP_BAR_STICKY, "-mx-3")} />
      <div className="flex flex-1 flex-col pb-3">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}

const FAN_OFFSETS = [
  { x: 0, y: 0, rotate: 0 },
  { x: 12, y: -4, rotate: 6 },
  { x: 24, y: -2, rotate: 12 },
];

function ListEntryDragPreview({ drag }: { drag: ListEntryDragData }) {
  const firstImageId = drag.printing.images[0]?.imageId;
  const thumbnail = firstImageId ? imageUrl(firstImageId, "240w") : undefined;
  return (
    <div className="relative h-48 w-28">
      <img
        src={thumbnail ?? ""}
        alt=""
        className="absolute top-0 left-0 w-28 rounded-lg shadow-lg"
        draggable={false}
      />
      <div className="bg-background/80 absolute right-0 bottom-0 left-0 rounded-b-lg px-1.5 py-1 backdrop-blur-sm">
        <p className="truncate text-center text-xs font-medium">
          {legendDisplayName(drag.printing.card)}
        </p>
      </div>
      {drag.totalQuantity > 1 && (
        <div className="bg-primary text-primary-foreground absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full text-xs font-bold shadow">
          {drag.totalQuantity}
        </div>
      )}
    </div>
  );
}

function DragPreview({ drag, modifier }: { drag: CardDragData; modifier: "all" | number | null }) {
  const printings = drag.previewPrintings;
  // The selected-tile count + noun are published by the grid as the selection
  // changes (frozen for the duration of a drag, since selection can't change
  // mid-drag).
  const selectionCount = useDragPreviewStore((s) => s.selectionCount);
  const selectionNoun = useDragPreviewStore((s) => s.selectionNoun);

  let count: number;
  let label: string;
  if (drag.fromSelection && selectionCount >= 1) {
    // Multi-selection drag: label the selected tiles ("3 printings"), not the
    // underlying copies, and never trim (the whole selection moves). A single
    // selected tile shows its card name, like any lone drag.
    count = selectionCount;
    const plural = selectionNoun === "copy" ? "copies" : `${selectionNoun}s`;
    label = selectionCount === 1 ? drag.printing.card.name : `${selectionCount} ${plural}`;
  } else {
    // Lone stack/copy drag: the modifier may trim a stack down, and a single
    // card shows its name.
    const requested =
      modifier === "all" ? drag.copyIds.length : typeof modifier === "number" ? modifier : 1;
    count = drag.isStackDrag ? Math.min(requested, drag.copyIds.length) : drag.copyIds.length;
    label = count === 1 ? drag.printing.card.name : `${count} copies`;
  }
  // Show up to 3 fanned cards, front card on top
  const cards = printings.slice(0, 3);

  return (
    <div className="relative h-48 w-28">
      {cards.toReversed().map((printing, reversedIndex) => {
        const index = cards.length - 1 - reversedIndex;
        const offset = FAN_OFFSETS[index];
        const firstImageId = printing.images[0]?.imageId;
        const thumbnail = firstImageId ? imageUrl(firstImageId, "240w") : undefined;
        return (
          <img
            key={printing.id}
            src={thumbnail ?? ""}
            alt=""
            className="absolute top-0 left-0 w-28 rounded-lg shadow-lg"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) rotate(${offset.rotate}deg)`,
              zIndex: index,
            }}
            draggable={false}
          />
        );
      })}
      <div
        className="bg-background/80 absolute bottom-0 left-0 w-28 rounded-b-lg px-1.5 py-1 backdrop-blur-sm"
        style={{ zIndex: cards.length }}
      >
        <p className="truncate text-center text-xs font-medium">{label}</p>
      </div>
      {count > 1 && (
        <div
          className="bg-primary text-primary-foreground absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full text-xs font-bold shadow"
          style={{ zIndex: cards.length + 1 }}
        >
          {count}
        </div>
      )}
    </div>
  );
}
