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
import { createContext, useState } from "react";
import { toast } from "sonner";

import { CollectionSidebar } from "@/components/collection/collection-sidebar";
import type { CardDragData } from "@/components/collection/dnd-types";
import { Footer } from "@/components/layout/footer";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useMoveCopies } from "@/hooks/use-copies";

/** Portal slot for the full-width top bar rendered above the sidebar + content row. */
export const TopBarSlotContext = createContext<HTMLDivElement | null>(null);

export const Route = createFileRoute("/_app/_authenticated/collections")({
  staticData: { hideFooter: true },
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
  if (activatorEvent instanceof PointerEvent && activeNodeRect && draggingNodeRect) {
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
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const [activeDrag, setActiveDrag] = useState<CardDragData | null>(null);
  const moveCopies = useMoveCopies();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: DRAG_ACTIVATION }));

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as CardDragData | undefined;
    if (data?.type === "collection-card") {
      setActiveDrag(data);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);

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

    const count = dragData.copyIds.length;
    moveCopies.mutate(
      { copyIds: dragData.copyIds, toCollectionId: dropData.collectionId },
      {
        onSuccess: () => {
          toast.success(`Moved ${count} card${count > 1 ? "s" : ""}`);
        },
      },
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={setTopBarSlot} className="px-3 pt-3" />
      <SidebarProvider className="flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDrag(null)}
        >
          <TopBarSlotContext value={topBarSlot}>
            <CollectionSidebar />
            <CollectionContent />
          </TopBarSlotContext>
          <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
            {activeDrag && <DragPreview drag={activeDrag} />}
          </DragOverlay>
        </DndContext>
      </SidebarProvider>
    </div>
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

function DragPreview({ drag }: { drag: CardDragData }) {
  const printings = drag.previewPrintings;
  const count = drag.copyIds.length;
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
