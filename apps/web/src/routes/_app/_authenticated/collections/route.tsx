import type { DragEndEvent, DragStartEvent, Modifier } from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { createContext, use, useEffect, useState } from "react";

import { toast } from "sonner";

import { CollectionSidebar } from "@/components/collection/collection-sidebar";
import type { CardDragData } from "@/components/collection/dnd-types";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { useMoveCopies } from "@/hooks/use-copies";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { getCardImageUrl } from "@/lib/images";

type SetTitle = (title: string) => void;

// oxlint-disable-next-line no-empty-function -- default is a no-op before the provider mounts
const CollectionTitleContext = createContext<SetTitle>(() => {});

/** Call from a child route to set the collection layout header title. */
export function useCollectionTitle(title: string) {
  const setTitle = use(CollectionTitleContext);
  useEffect(() => {
    setTitle(title);
  }, [setTitle, title]);
}

/** Portal slot for mobile header actions (add-mode controls and collection action buttons). */
export const AddModeSlotContext = createContext<HTMLDivElement | null>(null);

export const Route = createFileRoute("/_app/_authenticated/collections")({
  staticData: { hideFooter: true },
  beforeLoad: async ({ context }) => {
    const flags = (await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions,
    )) as FeatureFlags;
    if (!featureEnabled(flags, "collection")) {
      throw redirect({ to: "/cards" });
    }
  },
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
  const isMobile = useIsMobile();
  const [title, setTitle] = useState("Collection");
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
    <SidebarProvider>
      <DndContext
        sensors={isMobile ? undefined : sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDrag(null)}
      >
        <CollectionSidebar />
        <CollectionTitleContext value={setTitle}>
          <CollectionContent title={title} />
        </CollectionTitleContext>
        <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
          {activeDrag && <DragPreview drag={activeDrag} />}
        </DragOverlay>
      </DndContext>
    </SidebarProvider>
  );
}

function CollectionTitleButton({ title }: { title: string }) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 gap-1 text-sm font-medium"
      onClick={toggleSidebar}
    >
      {title}
      <ChevronDownIcon className="text-muted-foreground size-4" />
    </Button>
  );
}

function CollectionContent({ title }: { title: string }) {
  const [addModeSlot, setAddModeSlot] = useState<HTMLDivElement | null>(null);

  return (
    <AddModeSlotContext value={addModeSlot}>
      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip p-3">
        {/* Header only for mobile */}
        <header className="flex h-12 items-center gap-2 px-4 md:hidden">
          <CollectionTitleButton title={title} />
          <div ref={setAddModeSlot} className="flex flex-1 items-center gap-2" />
        </header>
        {/* Main content */}
        <Outlet />
        <Footer className="pt-3" />
      </div>
    </AddModeSlotContext>
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
        const imageUrl = printing.images[0]?.url;
        return (
          <img
            key={printing.id}
            src={imageUrl ? getCardImageUrl(imageUrl, "thumbnail") : ""}
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
