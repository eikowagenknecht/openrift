import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDndContext,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { imageUrl } from "@openrift/shared";
import { createLazyFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CollectionSidebar } from "@/components/collection/collection-sidebar";
import type { CardDragData } from "@/components/collection/dnd-types";
import { Footer } from "@/components/layout/footer";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBarHeightContext,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useMoveCopies } from "@/hooks/use-copies";
import { useBulkAddCopiesToList } from "@/hooks/use-lists";
import { describeListAdd } from "@/lib/list-toast";
import { FilterSearchProvider } from "@/lib/search-schemas";

import { TopBarSlotContext } from "./route";

export const Route = createLazyFileRoute("/_app/_authenticated/collections")({
  component: CollectionLayout,
});

const DRAG_ACTIVATION = { distance: 8 };
const MODIFIERS = [snapCenterToCursor];

/**
 * Forces dnd-kit to re-measure all droppable rects on any scroll event during
 * drag. The sidebar uses `position: sticky`, and dnd-kit's `Rect` class assumes
 * all elements move with scroll (applying scroll deltas to the initial
 * getBoundingClientRect). Sticky elements don't move, so the rects drift and
 * the drop target ends up offset from the cursor. Re-measuring creates fresh
 * Rect objects with correct values.
 * @returns Nothing (invisible helper component).
 */
function DndScrollWatcher() {
  const { active, measureDroppableContainers } = useDndContext();

  useEffect(() => {
    if (!active) {
      return;
    }

    let rafId = 0;
    const handleScroll = () => {
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          measureDroppableContainers([]);
          rafId = 0;
        });
      }
    };

    // Capture phase catches scroll on any element (sidebar, page, etc.)
    globalThis.addEventListener("scroll", handleScroll, true);
    return () => {
      globalThis.removeEventListener("scroll", handleScroll, true);
      cancelAnimationFrame(rafId);
    };
  }, [active, measureDroppableContainers]);

  return null;
}

function CollectionLayout() {
  const search = Route.useSearch();
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);
  const [activeDrag, setActiveDrag] = useState<CardDragData | null>(null);
  // null → move 1 (default), "all" → Shift held, number → digit key 2-9 held.
  const [moveModifier, setMoveModifier] = useState<"all" | number | null>(null);
  const moveCopies = useMoveCopies();
  const bulkAddCopiesToList = useBulkAddCopiesToList();

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
    const data = event.active.data.current as CardDragData | undefined;
    if (data?.type === "collection-card") {
      setActiveDrag(data);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const modifier = moveModifier;
    setActiveDrag(null);

    const dragData = event.active.data.current as CardDragData | undefined;
    const dropData = event.over?.data.current as
      | { type: "collection"; collectionId: string }
      | { type: "list"; listId: string; listName: string }
      | undefined;

    if (!dropData || dragData?.type !== "collection-card") {
      return;
    }

    if (dropData.type === "collection") {
      // Same-collection drop is a no-op; the route used to bail on this.
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
          },
        },
      );
      return;
    }

    if (dropData.type === "list") {
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
          },
        },
      );
    }
  };

  return (
    <FilterSearchProvider value={search}>
      <PageTopBarHeightContext value={topBarHeight}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={setTopBarSlot} className={PAGE_TOP_BAR_STICKY} />
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
                <CollectionContent />
              </TopBarSlotContext>
              <DragOverlay dropAnimation={null} modifiers={MODIFIERS}>
                {activeDrag && <DragPreview drag={activeDrag} modifier={moveModifier} />}
              </DragOverlay>
            </DndContext>
          </SidebarProvider>
        </div>
      </PageTopBarHeightContext>
    </FilterSearchProvider>
  );
}

function CollectionContent() {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-x-clip px-3 pb-3">
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

function DragPreview({ drag, modifier }: { drag: CardDragData; modifier: "all" | number | null }) {
  const printings = drag.previewPrintings;
  const requested =
    modifier === "all" ? drag.copyIds.length : typeof modifier === "number" ? modifier : 1;
  const count = drag.isStackDrag ? Math.min(requested, drag.copyIds.length) : drag.copyIds.length;
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
        <p className="truncate text-center text-xs font-medium">
          {count === 1 ? drag.printing.card.name : `${count} copies`}
        </p>
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
