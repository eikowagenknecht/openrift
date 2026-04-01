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
import type { DeckZone } from "@openrift/shared";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import type { DeckBuilderCard } from "@/stores/deck-builder-store";
import { useDeckBuilderStore } from "@/stores/deck-builder-store";

export interface DeckCardDragData {
  type: "deck-card";
  cardId: string;
  cardName: string;
  fromZone: DeckZone;
  quantity: number;
}

export interface BrowserCardDragData {
  type: "browser-card";
  card: DeckBuilderCard;
}

export interface DeckDropData {
  type: "deck-zone";
  zone: DeckZone;
}

type AnyDragData = DeckCardDragData | BrowserCardDragData;

const DRAG_ACTIVATION = { distance: 8 };
const DRAG_ZONES = new Set<DeckZone>(["main", "sideboard", "overflow"]);
const MODIFIERS = [snapCenterToCursor];
const EDGE_SIZE = 40;
const SCROLL_SPEED = 15;

/**
 * Forces dnd-kit to re-measure all droppable rects on any scroll event during
 * drag. This is needed because the sidebar uses `position: sticky`, and
 * dnd-kit's `Rect` class assumes all elements move with scroll (applying scroll
 * deltas to the initial getBoundingClientRect). Sticky elements don't move, so
 * the rects drift. Re-measuring creates fresh Rect objects with correct values.
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

export function DeckDndContext({ children }: { children: ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: DRAG_ACTIVATION }));
  const [dragInfo, setDragInfo] = useState<{
    cardId: string;
    cardName: string;
    quantity: number;
    fromBrowser: boolean;
  } | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const activeNodeRef = useRef<HTMLElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const scrollRafRef = useRef<number>(0);

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

  // Force grabbing cursor during drag — the DragOverlay has pointer-events: none
  // so the cursor would otherwise reflect whatever element is underneath.
  useEffect(() => {
    if (!dragInfo) {
      return;
    }
    document.body.style.cursor = "grabbing";
    return () => {
      document.body.style.cursor = "";
    };
  }, [dragInfo]);

  // Custom auto-scroll for containers that aren't ancestors of the dragged node.
  // dnd-kit's built-in auto-scroll handles ancestor containers; this covers the
  // case where a card dragged from the browser hovers over the sidebar.
  useEffect(() => {
    if (!dragInfo) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };

    const scrollLoop = () => {
      const { x, y } = pointerRef.current;

      const elements = document.elementsFromPoint(x, y);
      for (const element of elements) {
        if (!(element instanceof HTMLElement)) {
          continue;
        }
        // Skip containers that are ancestors of the active node — dnd-kit handles those.
        if (activeNodeRef.current && element.contains(activeNodeRef.current)) {
          continue;
        }
        const { overflowY } = getComputedStyle(element);
        if (overflowY !== "auto" && overflowY !== "scroll") {
          continue;
        }
        if (element.scrollHeight <= element.clientHeight) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        const distFromTop = y - rect.top;
        const distFromBottom = rect.bottom - y;

        if (distFromTop < EDGE_SIZE && element.scrollTop > 0) {
          const intensity = 1 - distFromTop / EDGE_SIZE;
          element.scrollBy(0, -SCROLL_SPEED * intensity);
          break;
        }
        if (
          distFromBottom < EDGE_SIZE &&
          element.scrollTop < element.scrollHeight - element.clientHeight
        ) {
          const intensity = 1 - distFromBottom / EDGE_SIZE;
          element.scrollBy(0, SCROLL_SPEED * intensity);
          break;
        }
      }

      scrollRafRef.current = requestAnimationFrame(scrollLoop);
    };

    globalThis.addEventListener("pointermove", handlePointerMove);
    scrollRafRef.current = requestAnimationFrame(scrollLoop);

    return () => {
      globalThis.removeEventListener("pointermove", handlePointerMove);
      cancelAnimationFrame(scrollRafRef.current);
    };
  }, [dragInfo]);

  const handleDragStart = (event: DragStartEvent) => {
    activeNodeRef.current = (event.activatorEvent.target as HTMLElement) ?? null;

    const data = event.active.data.current as AnyDragData | undefined;
    if (data?.type === "deck-card") {
      setDragInfo({
        cardId: data.cardId,
        cardName: data.cardName,
        quantity: data.quantity,
        fromBrowser: false,
      });
      setShiftHeld(false);
    } else if (data?.type === "browser-card") {
      setDragInfo({
        cardId: data.card.cardId,
        cardName: data.card.cardName,
        quantity: 1,
        fromBrowser: true,
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const moveAll = shiftHeld;
    setDragInfo(null);
    setShiftHeld(false);
    activeNodeRef.current = null;

    const activeData = event.active.data.current as AnyDragData | undefined;
    const overData = event.over?.data.current as DeckDropData | undefined;

    if (!activeData) {
      return;
    }

    const store = useDeckBuilderStore.getState();

    // Dropped outside a valid zone — remove from source zone
    if (overData?.type !== "deck-zone") {
      if (activeData.type === "deck-card") {
        if (moveAll || activeData.quantity === 1) {
          store.setQuantity(activeData.cardId, activeData.fromZone, 0);
        } else {
          store.removeCard(activeData.cardId, activeData.fromZone);
        }
      }
      return;
    }

    if (activeData.type === "browser-card") {
      store.addCard(activeData.card, overData.zone, moveAll ? 3 : undefined);
      return;
    }

    if (activeData.type === "deck-card") {
      if (activeData.fromZone === overData.zone || !DRAG_ZONES.has(overData.zone)) {
        return;
      }
      if (moveAll || activeData.quantity === 1) {
        store.moveCard(activeData.cardId, activeData.fromZone, overData.zone);
      } else {
        store.moveOneCard(activeData.cardId, activeData.fromZone, overData.zone);
      }
    }
  };

  const deckCards = useDeckBuilderStore((state) => state.cards);
  const browserRemaining = dragInfo?.fromBrowser
    ? 3 -
      deckCards
        .filter(
          (card) =>
            card.cardId === dragInfo.cardId &&
            (card.zone === "main" || card.zone === "sideboard" || card.zone === "overflow"),
        )
        .reduce((sum, card) => sum + card.quantity, 0)
    : 0;

  const moveAll =
    shiftHeld &&
    dragInfo !== null &&
    (dragInfo.fromBrowser ? browserRemaining > 1 : dragInfo.quantity > 1);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <DndScrollWatcher />
      {children}
      <DragOverlay dropAnimation={null} modifiers={MODIFIERS}>
        {dragInfo && (
          <div className="bg-popover text-popover-foreground rounded-md border px-3 py-1.5 text-sm font-medium shadow-lg">
            {dragInfo.cardName}
            {moveAll && (
              <span className="text-muted-foreground ml-1.5 text-xs">
                {dragInfo.fromBrowser
                  ? `×${browserRemaining} (max)`
                  : `×${dragInfo.quantity} (all)`}
              </span>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
