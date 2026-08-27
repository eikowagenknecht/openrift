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
import { legendDisplayName } from "@openrift/shared";
import { createLazyFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { CardDragGhost } from "@/components/cards/card-drag-ghost";
import { resolveDropCopyIds, resolveSelectionDrag } from "@/components/collection/collection-drag";
import { CollectionSidebar } from "@/components/collection/collection-sidebar";
import type {
  AnyDragData,
  CardDragData,
  ListEntryDragData,
} from "@/components/collection/dnd-types";
import { COLLECTION_DRAG_TYPES } from "@/components/collection/dnd-types";
import { DndScrollWatcher } from "@/components/dnd-scroll-watcher";
import { Footer } from "@/components/layout/footer";
import {
  PAGE_TOP_BAR_STICKY_BASE,
  PageTopBarHeightContext,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import type { SidebarListDropData } from "@/components/list/droppable-sidebar-list";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useMoveCopies } from "@/hooks/use-copies";
import { useBulkAddCopiesToList, useMoveListEntries } from "@/hooks/use-lists";
import { ViewSurfaceProvider } from "@/hooks/use-view-prefs";
import { asDragData } from "@/lib/dnd-data";
import { isTypingTarget } from "@/lib/keyboard-target";
import { describeListAdd } from "@/lib/list-toast";
import { parseMoveDigit } from "@/lib/parse-digit-key";
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

/** Where a collections drag can land: another collection, or a sidebar list. */
type CollectionDropData = { type: "collection"; collectionId: string } | SidebarListDropData;

const COLLECTION_DROP_TYPES = [
  "collection",
  "list",
] as const satisfies readonly CollectionDropData["type"][];

function CollectionLayout() {
  const search = Route.useSearch();
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);
  const [activeDrag, setActiveDrag] = useState<AnyDragData | null>(null);
  // null → one copy (default), "all" → Shift held, number → digit key 2-9 held
  // during the drag. Applies to both drop targets (another collection, or a
  // sidebar list). Only meaningful for `collection-card` drags — list-entry
  // drags always carry the whole entry (no per-key trimming).
  const [moveModifier, setMoveModifier] = useState<"all" | number | null>(null);
  // Read by the key listener below, which is mounted once and can't see
  // `activeDrag` without re-subscribing on every drag.
  const dragActiveRef = useRef(false);
  const moveCopies = useMoveCopies();
  const bulkAddCopiesToList = useBulkAddCopiesToList();
  const moveListEntries = useMoveListEntries();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: DRAG_ACTIVATION }));

  // Track Shift and digit keys 2-9 for the whole collections layout, not just
  // while a drag is active — otherwise pressing Shift before grabbing a card
  // would be missed (the keydown fires before listeners attach). Editable
  // targets are ignored so typing a "3" in a search field doesn't update state.
  //
  // Digits are the exception: they only arm the drag quantity while a drag is
  // already in flight. Outside a drag the same keys add copies of the focused
  // card (useGridKeyboardNav), so accepting them here too would make
  // "press 3, then grab" add three copies *and* move three.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.key === "Shift") {
        setMoveModifier("all");
        return;
      }
      const digit = parseMoveDigit(event.key);
      if (digit !== null && dragActiveRef.current) {
        setMoveModifier(digit);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setMoveModifier((current) => (current === "all" ? null : current));
        return;
      }
      const digit = parseMoveDigit(event.key);
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
    dragActiveRef.current = true;
    const data = asDragData<AnyDragData>(event.active.data.current, COLLECTION_DRAG_TYPES);
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
    dragActiveRef.current = false;
    setActiveDrag(null);

    const dragData = asDragData<AnyDragData>(event.active.data.current, COLLECTION_DRAG_TYPES);
    const dropData = asDragData<CollectionDropData>(
      event.over?.data.current,
      COLLECTION_DROP_TYPES,
    );

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
      const copyIds = resolveDropCopyIds(dragData, modifier);
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

    // Same stack-trim rule as a collection drop: one copy by default, `n` with
    // a digit key held, the whole stack with Shift. The server derives the
    // right entry shape (card / printing / copy) from the list's kind and
    // dedupes, so the trim only shows up on copy-kind lists.
    bulkAddCopiesToList.mutate(
      { listId: dropData.listId, copyIds: resolveDropCopyIds(dragData, modifier) },
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
    <ViewSurfaceProvider value="collections">
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
                  dragActiveRef.current = false;
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
    </ViewSurfaceProvider>
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
          so the sidebar can rise to the header. The column already clears the iOS
          safe areas (ml-safe sidebar left, pr-safe right), so no px-safe here — it
          would double-inset the bar's content on notched phones in landscape. Left:
          -ml-3/pl-3 full-bleed the blur across the interior gap and re-align with
          the column content. Right: mr-safe-neg/pr-safe bleed to the viewport edge
          and re-inset past the safe area. */}
      <div
        ref={setTopBarSlot}
        className={cn(PAGE_TOP_BAR_STICKY_BASE, "mr-safe-neg pr-safe -ml-3 pl-3")}
      />
      <div className="flex flex-1 flex-col pb-3">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}

function ListEntryDragPreview({ drag }: { drag: ListEntryDragData }) {
  return (
    <CardDragGhost
      printings={[drag.printing]}
      label={legendDisplayName(drag.printing.card)}
      count={drag.totalQuantity}
    />
  );
}

function DragPreview({ drag, modifier }: { drag: CardDragData; modifier: "all" | number | null }) {
  // A select-mode drag publishes its fan; a lone drag has none, and shows the
  // printing it was grabbed from.
  const printings = drag.previewPrintings.length > 0 ? drag.previewPrintings : [drag.printing];
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
    // card shows its name. Counted through the same helper the drop uses, so
    // the badge can't promise a number the drop won't deliver.
    count = resolveDropCopyIds(drag, modifier).length;
    label = count === 1 ? drag.printing.card.name : `${count} copies`;
  }
  // The ghost fans the first few itself; the drag can carry more, which is what
  // the count says.
  return <CardDragGhost printings={printings} label={label} count={count} />;
}
