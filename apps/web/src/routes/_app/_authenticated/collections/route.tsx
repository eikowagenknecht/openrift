import type { DragEndEvent, DragStartEvent, Modifier } from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { createContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

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
import { FilterSearchProvider, filterSearchSchema } from "@/lib/search-schemas";

/** Portal slot for the full-width top bar rendered above the sidebar + content row. */
export const TopBarSlotContext = createContext<HTMLDivElement | null>(null);

const collectionsSearchSchema = filterSearchSchema.extend({
  browsing: z.boolean().optional(),
});

export const Route = createFileRoute("/_app/_authenticated/collections")({
  // data-only: the sidebar uses useLiveQuery on the copies collection
  // (derived copyCount), which calls useSyncExternalStore without a
  // getServerSnapshot. Skipping SSR for this subtree avoids the resulting
  // "Switched to client rendering" error; every child route is already
  // data-only for the same reason.
  ssr: "data-only",
  staticData: { hideFooter: true },
  validateSearch: collectionsSearchSchema,
  component: CollectionLayout,
});

const DRAG_ACTIVATION = { distance: 8 };
// Center the drag overlay under the cursor regardless of where the user grabbed.
const snapCenterToCursor: Modifier = ({
  activatorEvent,
  activeNodeRect,
  draggingNodeRect,
  transform,
}) => {
  if (
    typeof PointerEvent !== "undefined" &&
    activatorEvent instanceof PointerEvent &&
    activeNodeRect &&
    draggingNodeRect
  ) {
    const grabX = activatorEvent.clientX - activeNodeRect.left;
    const grabY = activatorEvent.clientY - activeNodeRect.top;
    return {
      ...transform,
      x: transform.x + grabX - draggingNodeRect.width / 2,
      y: transform.y + grabY - draggingNodeRect.height / 2,
    };
  }
  return transform;
};

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
              <TopBarSlotContext value={topBarSlot}>
                <CollectionSidebar />
                <CollectionContent />
              </TopBarSlotContext>
              <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
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
        const thumbnail = printing.images[0]?.thumbnail;
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
