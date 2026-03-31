import type { DragEndEvent, DragStartEvent, Modifier } from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DeckZone } from "@openrift/shared";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import type { DeckBuilderCard } from "@/stores/deck-builder-store";
import { useDeckBuilderStore } from "@/stores/deck-builder-store";

export interface DeckCardDragData {
  type: "deck-card";
  cardId: string;
  cardName: string;
  fromZone: DeckZone;
  quantity: number;
}

interface BrowserCardDragData {
  type: "browser-card";
  card: DeckBuilderCard;
}

export interface DeckDropData {
  type: "deck-zone";
  zone: DeckZone;
}

type AnyDragData = DeckCardDragData | BrowserCardDragData;

const DRAG_ACTIVATION = { distance: 8 };

// Modifier that centers the overlay under the pointer (same as collection DnD).
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

export function DeckDndContext({ children }: { children: ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: DRAG_ACTIVATION }));
  const [dragInfo, setDragInfo] = useState<{
    cardName: string;
    quantity: number;
    fromBrowser: boolean;
  } | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);

  // Track Shift key during drag for "move all" modifier
  useEffect(() => {
    if (!dragInfo) {
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
  }, [dragInfo]);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as AnyDragData | undefined;
    if (data?.type === "deck-card") {
      setDragInfo({ cardName: data.cardName, quantity: data.quantity, fromBrowser: false });
      setShiftHeld(false);
    } else if (data?.type === "browser-card") {
      setDragInfo({ cardName: data.card.cardName, quantity: 1, fromBrowser: true });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const moveAll = shiftHeld;
    setDragInfo(null);
    setShiftHeld(false);

    const activeData = event.active.data.current as AnyDragData | undefined;
    const overData = event.over?.data.current as DeckDropData | undefined;

    if (!activeData || overData?.type !== "deck-zone") {
      return;
    }

    const store = useDeckBuilderStore.getState();

    if (activeData.type === "browser-card") {
      store.addCard(activeData.card, overData.zone);
      return;
    }

    if (activeData.type === "deck-card") {
      if (activeData.fromZone === overData.zone) {
        return;
      }
      if (moveAll || activeData.quantity === 1) {
        store.moveCard(activeData.cardId, activeData.fromZone, overData.zone);
      } else {
        store.moveOneCard(activeData.cardId, activeData.fromZone, overData.zone);
      }
    }
  };

  const moveAll = shiftHeld && dragInfo !== null && !dragInfo.fromBrowser && dragInfo.quantity > 1;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}
      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
        {dragInfo && (
          <div className="bg-popover text-popover-foreground rounded-md border px-3 py-1.5 text-sm font-medium shadow-lg">
            {dragInfo.cardName}
            {moveAll && (
              <span className="text-muted-foreground ml-1.5 text-xs">
                ×{dragInfo.quantity} (all)
              </span>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
