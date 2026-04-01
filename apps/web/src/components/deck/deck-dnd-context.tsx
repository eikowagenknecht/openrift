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
const AUTO_SCROLL_DISABLED = { enabled: false } as const;
const EDGE_SIZE = 40;
const SCROLL_SPEED = 15;

/**
 * Build a modifier that centers the overlay under the pointer using a fixed
 * grab offset captured at drag start. Using a fixed offset avoids drift caused
 * by dnd-kit updating `activeNodeRect` during container scroll.
 * @returns A dnd-kit Modifier function.
 */
function makeSnapCenterToCursor(grabOffset: { x: number; y: number }): Modifier {
  return ({ draggingNodeRect, transform }) => {
    if (draggingNodeRect) {
      return {
        ...transform,
        x: transform.x + grabOffset.x - draggingNodeRect.width / 2,
        y: transform.y + grabOffset.y - draggingNodeRect.height / 2,
      };
    }
    return transform;
  };
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
  const modifiersRef = useRef<Modifier[]>([]);
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

  // Custom auto-scroll: scroll whichever scrollable container the pointer hovers
  // over, not just ancestors of the dragged element (which is dnd-kit's default).
  useEffect(() => {
    if (!dragInfo) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };

    const scrollLoop = () => {
      const { x, y } = pointerRef.current;

      // Walk the elements under the pointer to find scrollable containers
      const elements = document.elementsFromPoint(x, y);
      for (const element of elements) {
        if (!(element instanceof HTMLElement)) {
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

      // Also handle window-level scrolling near viewport edges
      const docEl = document.documentElement;
      if (y < EDGE_SIZE && docEl.scrollTop > 0) {
        const intensity = 1 - y / EDGE_SIZE;
        globalThis.scrollBy(0, -SCROLL_SPEED * intensity);
      } else if (y > globalThis.innerHeight - EDGE_SIZE) {
        const intensity = 1 - (globalThis.innerHeight - y) / EDGE_SIZE;
        globalThis.scrollBy(0, SCROLL_SPEED * intensity);
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
    // Capture the grab offset once so the modifier stays stable during scroll.
    // Use `initial` — `translated` is null at drag start.
    const nodeRect = event.active.rect.current.initial;
    modifiersRef.current =
      event.activatorEvent instanceof PointerEvent && nodeRect
        ? [
            makeSnapCenterToCursor({
              x: event.activatorEvent.clientX - nodeRect.left,
              y: event.activatorEvent.clientY - nodeRect.top,
            }),
          ]
        : [];

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
      autoScroll={AUTO_SCROLL_DISABLED}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}
      <DragOverlay dropAnimation={null} modifiers={modifiersRef.current}>
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
