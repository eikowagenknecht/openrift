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
import { legendDisplayName } from "@openrift/shared/utils";
import { getRouteApi, Outlet } from "@tanstack/react-router";
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
import { TopBarSlotContext } from "@/components/layout/top-bar-slot";
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

const routeApi = getRouteApi("/_app/_authenticated/collections");

const DRAG_ACTIVATION = { distance: 8 };
const MODIFIERS = [snapCenterToCursor];

type CollectionDropData = { type: "collection"; collectionId: string } | SidebarListDropData;

const COLLECTION_DROP_TYPES = [
  "collection",
  "list",
] as const satisfies readonly CollectionDropData["type"][];

export function CollectionLayout() {
  const search = routeApi.useSearch();
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);
  const [activeDrag, setActiveDrag] = useState<AnyDragData | null>(null);
  // null → one copy, "all" → Shift held, number → digit key 2-9 held. Only
  // meaningful for `collection-card` drags; list-entry drags carry the whole entry.
  const [moveModifier, setMoveModifier] = useState<"all" | number | null>(null);
  // Read by the key listener below, which is mounted once and can't see
  // `activeDrag` without re-subscribing on every drag.
  const dragActiveRef = useRef(false);
  const moveCopies = useMoveCopies();
  const bulkAddCopiesToList = useBulkAddCopiesToList();
  const moveListEntries = useMoveListEntries();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: DRAG_ACTIVATION }));

  // Tracked for the whole layout so Shift held before grabbing a card isn't missed.
  // Digits only arm the modifier while dragActiveRef is set: unarmed, the same keys add copies (useGridKeyboardNav).
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
            if (dragData.fromSelection) {
              useGridSelectionStore.getState().clearSelection();
            }
          },
        },
      );
      return;
    }

    // Group-shared copies can't go on trade/wish lists; the server would
    // silently skip every one and report nothing added.
    if (dropData.listIntent !== "organize" && dragData.sourceAllGroupCopies) {
      toast.info("Cards from a shared group collection can't go on trade or wish lists");
      return;
    }

    // The trim (one/n/whole stack) only shows up on copy-kind lists; the server
    // derives the entry shape from the list's kind and dedupes.
    bulkAddCopiesToList.mutate(
      { listId: dropData.listId, copyIds: resolveDropCopyIds(dragData, modifier) },
      {
        onSuccess: (result) => {
          const listName = dropData.listName;
          toast[result.added + result.updated === 0 ? "info" : "success"](
            describeListAdd(result, listName),
          );
          if (dragData.fromSelection) {
            useGridSelectionStore.getState().clearSelection();
          }
        },
      },
    );
  }

  function handleListEntryDrop(dragData: ListEntryDragData, dropData: SidebarListDropData) {
    // Defense-in-depth against a same-list drop; the sidebar and server also check this.
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
      {/* No px-safe here: the column already clears iOS safe areas, and px-safe
          would double-inset the bar on notched phones in landscape. */}
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
  const printings = drag.previewPrintings.length > 0 ? drag.previewPrintings : [drag.printing];
  const selectionCount = useDragPreviewStore((s) => s.selectionCount);
  const selectionNoun = useDragPreviewStore((s) => s.selectionNoun);

  let count: number;
  let label: string;
  if (drag.fromSelection && selectionCount >= 1) {
    count = selectionCount;
    const plural = selectionNoun === "copy" ? "copies" : `${selectionNoun}s`;
    label =
      selectionCount === 1 ? legendDisplayName(drag.printing.card) : `${selectionCount} ${plural}`;
  } else {
    // Counted through the same helper the drop uses, so the badge can't
    // promise a number the drop won't deliver.
    count = resolveDropCopyIds(drag, modifier).length;
    label = count === 1 ? legendDisplayName(drag.printing.card) : `${count} copies`;
  }
  return <CardDragGhost printings={printings} label={label} count={count} />;
}
