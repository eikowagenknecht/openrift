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
  const [shiftHeld, setShiftHeld] = useState(false);
  const moveCopies = useMoveCopies();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: DRAG_ACTIVATION }));

  // Track Shift during drag so stack drags can "move all" on shift-release,
  // default to moving a single copy otherwise.
  useEffect(() => {
    if (!activeDrag) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setShiftHeld(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setShiftHeld(false);
      }
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    globalThis.addEventListener("keyup", handleKeyUp);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
      globalThis.removeEventListener("keyup", handleKeyUp);
    };
  }, [activeDrag]);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as CardDragData | undefined;
    if (data?.type === "collection-card") {
      setActiveDrag(data);
      setShiftHeld(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const moveAll = shiftHeld;
    setActiveDrag(null);
    setShiftHeld(false);

    const dragData = event.active.data.current as CardDragData | undefined;
    const dropData = event.over?.data.current as { type: string; collectionId: string } | undefined;

    if (
      !dropData ||
      dragData?.type !== "collection-card" ||
      dropData.type !== "collection" ||
      dragData.sourceCollectionId === dropData.collectionId
    ) {
      return;
    }

    const copyIds =
      dragData.isStackDrag && !moveAll ? dragData.copyIds.slice(0, 1) : dragData.copyIds;
    const count = copyIds.length;
    moveCopies.mutate(
      { copyIds, toCollectionId: dropData.collectionId },
      {
        onSuccess: () => {
          toast.success(`Moved ${count} card${count > 1 ? "s" : ""}`);
        },
      },
    );
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
                setShiftHeld(false);
              }}
            >
              <DndScrollWatcher />
              <TopBarSlotContext value={topBarSlot}>
                <CollectionSidebar />
                <CollectionContent />
              </TopBarSlotContext>
              <DragOverlay dropAnimation={null} modifiers={MODIFIERS}>
                {activeDrag && <DragPreview drag={activeDrag} shiftHeld={shiftHeld} />}
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

function DragPreview({ drag, shiftHeld }: { drag: CardDragData; shiftHeld: boolean }) {
  const printings = drag.previewPrintings;
  const count = drag.isStackDrag && !shiftHeld ? 1 : drag.copyIds.length;
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
