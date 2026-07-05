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
import { imageUrl, legendDisplayName, WellKnown } from "@openrift/shared";
import type { DeckZone } from "@openrift/shared";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { DndScrollWatcher } from "@/components/dnd-scroll-watcher";
import { useDeckBuilderActions, useDeckCards } from "@/hooks/use-deck-builder";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";

export interface DeckCardDragData {
  type: "deck-card";
  cardId: string;
  cardName: string;
  fromZone: DeckZone;
  quantity: number;
  preferredPrintingId: string | null;
}

export interface BrowserCardDragData {
  type: "browser-card";
  card: DeckBuilderCard;
}

export interface DeckDropData {
  type: "deck-zone";
  zone: DeckZone;
  /**
   * True when the dragged card can't land in this zone (wrong type, or the zone
   * is full). The zone still registers as a droppable so a release over it is a
   * no-op rather than being treated as "dropped outside a zone" (which removes a
   * copy) — see handleDragEnd.
   */
  disabled?: boolean;
}

type AnyDragData = DeckCardDragData | BrowserCardDragData;

const DRAG_ACTIVATION = { distance: 8 };
// Zones that accept deck-card drops. Champion is included so a unit can be
// dragged from main/sideboard/overflow into the chosen-champion slot; the
// move action handles replacing whatever's currently there.
const DRAG_ZONES = new Set<DeckZone>([
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.OVERFLOW,
  WellKnown.deckZone.CHAMPION,
]);

/**
 * Whether a completed drag over `overData` must be a no-op for the dragged
 * `activeData`. A zone that reports itself `disabled` (incompatible card type,
 * full slot, or a zone the format doesn't play — e.g. a sideboard on a Custom
 * Region deck) rejects both browser and deck cards; a deck card is also
 * rejected when dropped back onto its own zone or onto a non-move zone
 * (Legend/Runes/Battlefields). Rejected drops leave the deck untouched: the
 * card stays where it is (deck card) or is not added (browser card).
 * @returns `true` when the drop target rejects the dragged card.
 */
export function isDropRejected(activeData: AnyDragData, overData: DeckDropData): boolean {
  if (overData.disabled === true) {
    return true;
  }
  return (
    activeData.type === "deck-card" &&
    (activeData.fromZone === overData.zone || !DRAG_ZONES.has(overData.zone))
  );
}
const MODIFIERS = [snapCenterToCursor];
const EDGE_SIZE = 40;
const SCROLL_SPEED = 15;

export function DeckDndContext({ deckId, children }: { deckId: string; children: ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: DRAG_ACTIVATION }));
  const actions = useDeckBuilderActions(deckId);
  const deckCards = useDeckCards(deckId);
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
        cardName: legendDisplayName({
          name: data.card.cardName,
          type: data.card.cardType,
          tags: data.card.tags,
        }),
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

    // Dropped outside a valid zone — remove from source zone
    if (overData?.type !== "deck-zone") {
      if (activeData.type === "deck-card") {
        if (moveAll || activeData.quantity === 1) {
          actions.setQuantity(
            activeData.cardId,
            activeData.fromZone,
            0,
            activeData.preferredPrintingId,
          );
        } else {
          actions.removeCard(
            activeData.cardId,
            activeData.fromZone,
            activeData.preferredPrintingId,
          );
        }
      }
      return;
    }

    if (activeData.type === "browser-card") {
      if (isDropRejected(activeData, overData)) {
        return;
      }
      if (moveAll) {
        if (overData.zone === WellKnown.deckZone.RUNES) {
          const runeTotal = deckCards
            .filter((card) => card.zone === WellKnown.deckZone.RUNES)
            .reduce((sum, card) => sum + card.quantity, 0);
          actions.addCard(activeData.card, overData.zone, Math.max(0, 12 - runeTotal));
        } else {
          actions.addCard(activeData.card, overData.zone, 3);
        }
      } else {
        actions.addCard(activeData.card, overData.zone);
      }
      return;
    }

    if (activeData.type === "deck-card") {
      if (isDropRejected(activeData, overData)) {
        return;
      }
      if (moveAll || activeData.quantity === 1) {
        actions.moveCard(
          activeData.cardId,
          activeData.fromZone,
          overData.zone,
          activeData.preferredPrintingId,
        );
      } else {
        actions.moveOneCard(
          activeData.cardId,
          activeData.fromZone,
          overData.zone,
          activeData.preferredPrintingId,
        );
      }
    }
  };

  // Overflow is excluded — it is a free parking zone, so copies parked there
  // neither count toward the 3-copy cap nor reduce how many a shift-drag adds.
  const browserRemaining = dragInfo?.fromBrowser
    ? 3 -
      deckCards
        .filter(
          (card) =>
            card.cardId === dragInfo.cardId &&
            (card.zone === WellKnown.deckZone.MAIN || card.zone === WellKnown.deckZone.SIDEBOARD),
        )
        .reduce((sum, card) => sum + card.quantity, 0)
    : 0;

  const moveAll =
    shiftHeld &&
    dragInfo !== null &&
    (dragInfo.fromBrowser ? browserRemaining > 1 : dragInfo.quantity > 1);

  const { getPreferredFrontImage } = usePreferredPrinting();
  const dragImageId = dragInfo ? (getPreferredFrontImage(dragInfo.cardId)?.imageId ?? null) : null;
  const dragImageUrl = dragImageId ? imageUrl(dragImageId, "400w") : null;

  const dragCount = moveAll
    ? dragInfo?.fromBrowser
      ? browserRemaining
      : (dragInfo?.quantity ?? 1)
    : 1;

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
          <div className="relative h-48 w-28">
            {dragImageUrl ? (
              <img
                src={dragImageUrl}
                alt=""
                className="absolute top-0 left-0 w-28 rounded-lg shadow-lg"
                draggable={false}
              />
            ) : (
              <div className="bg-muted absolute top-0 left-0 flex h-40 w-28 items-center justify-center rounded-lg shadow-lg">
                <span className="text-muted-foreground px-1 text-center text-xs">
                  {dragInfo.cardName}
                </span>
              </div>
            )}
            <div
              className="bg-background/80 absolute bottom-0 left-0 w-28 rounded-b-lg px-1.5 py-1 backdrop-blur-sm"
              style={{ zIndex: 1 }}
            >
              <p className="truncate text-center text-xs font-medium">{dragInfo.cardName}</p>
            </div>
            {dragCount > 1 && (
              <div className="bg-primary text-primary-foreground absolute -top-2 -right-2 z-10 flex size-6 items-center justify-center rounded-full text-xs font-bold shadow">
                {dragCount}
              </div>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
