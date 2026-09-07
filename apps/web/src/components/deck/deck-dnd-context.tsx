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
import { copyLimitFor, WellKnown, legendDisplayName } from "@openrift/shared";
import type { DeckZone } from "@openrift/shared";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { CardDragGhost } from "@/components/cards/card-drag-ghost";
import { DndScrollWatcher } from "@/components/dnd-scroll-watcher";
import { useDeckBuilderActions, useDeckCards } from "@/hooks/use-deck-builder";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { asDragData } from "@/lib/dnd-data";

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
  disabled?: boolean;
}

export type AnyDragData = DeckCardDragData | BrowserCardDragData;

/** For narrowing a dnd-kit payload with {@link asDragData}; the deck editor's own sortables produce payloads outside this list. */
export const DECK_DRAG_TYPES = [
  "deck-card",
  "browser-card",
] as const satisfies readonly AnyDragData["type"][];

const DECK_DROP_TYPES = ["deck-zone"] as const satisfies readonly DeckDropData["type"][];

const DRAG_ACTIVATION = { distance: 8 };
export const DRAG_SOURCE_ZONES: ReadonlySet<DeckZone> = new Set([
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.OVERFLOW,
]);

/** Looked up by the row's full key (card, zone, printing): a deck can hold one card in one zone twice under different printings, as separate rows. */
export function resolveDraggedCard(
  dragData: AnyDragData | undefined,
  allCards: readonly DeckBuilderCard[],
): DeckBuilderCard | undefined {
  if (dragData?.type === "browser-card") {
    return dragData.card;
  }
  if (dragData?.type === "deck-card") {
    return allCards.find(
      (card) =>
        card.cardId === dragData.cardId &&
        card.zone === dragData.fromZone &&
        card.preferredPrintingId === dragData.preferredPrintingId,
    );
  }
  return undefined;
}
// Champion is included so a unit can be dragged into the chosen-champion slot; the move action handles replacing whatever's there.
const DRAG_ZONES = new Set<DeckZone>([
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.OVERFLOW,
  WellKnown.deckZone.CHAMPION,
]);

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
/** How close to a container's edge the pointer must get before it auto-scrolls. */
const EDGE_SIZE = 40;
/** Pixels per frame at the very edge; scaled down across the edge band. */
const SCROLL_SPEED = 15;
/** The sidebar's own scroll container (SidebarContent sets this data-slot). */
const SIDEBAR_VIEWPORT_SELECTOR = '[data-slot="sidebar-content"]';

/** Speed ramps from 0 at the inner edge of the band to SCROLL_SPEED at the container's edge, clamped there. */
export function edgeScrollDelta(input: {
  pointerY: number;
  top: number;
  bottom: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}): number {
  const { pointerY, top, bottom, scrollTop, scrollHeight, clientHeight } = input;
  const maxScroll = scrollHeight - clientHeight;
  if (maxScroll <= 0) {
    return 0;
  }
  const distFromTop = pointerY - top;
  const distFromBottom = bottom - pointerY;
  if (distFromTop < EDGE_SIZE && scrollTop > 0) {
    return -SCROLL_SPEED * Math.min(1, 1 - distFromTop / EDGE_SIZE);
  }
  if (distFromBottom < EDGE_SIZE && scrollTop < maxScroll) {
    return SCROLL_SPEED * Math.min(1, 1 - distFromBottom / EDGE_SIZE);
  }
  return 0;
}

export function isPointInRect(
  x: number,
  y: number,
  rect: { top: number; right: number; bottom: number; left: number },
): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function DeckDndContext({ deckId, children }: { deckId: string; children: ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: DRAG_ACTIVATION }));
  const actions = useDeckBuilderActions(deckId);
  const deckCards = useDeckCards(deckId);
  const [dragInfo, setDragInfo] = useState<{
    cardId: string;
    cardName: string;
    quantity: number;
    fromBrowser: boolean;
    maxCopiesOverride: number | null;
    preferredPrintingId: string | null;
  } | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const activeNodeRef = useRef<HTMLElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const scrollRafRef = useRef<number>(0);

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

  // DragOverlay has pointer-events: none, so the cursor would otherwise reflect whatever is underneath.
  useEffect(() => {
    if (!dragInfo) {
      return;
    }
    document.body.style.cursor = "grabbing";
    return () => {
      document.body.style.cursor = "";
    };
  }, [dragInfo]);

  // dnd-kit's built-in auto-scroll only walks the active node's ancestors; this
  // covers a card dragged from the browser grid over the sidebar. Never scrolls the page itself.
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
        if (element === document.body || element === document.documentElement) {
          continue;
        }
        const { overflowY } = getComputedStyle(element);
        if (overflowY !== "auto" && overflowY !== "scroll") {
          continue;
        }

        const rect = element.getBoundingClientRect();
        const delta = edgeScrollDelta({
          pointerY: y,
          top: rect.top,
          bottom: rect.bottom,
          scrollTop: element.scrollTop,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        });
        if (delta !== 0) {
          element.scrollBy(0, delta);
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

    const data = asDragData<AnyDragData>(event.active.data.current, DECK_DRAG_TYPES);
    if (data?.type === "deck-card") {
      setDragInfo({
        cardId: data.cardId,
        cardName: data.cardName,
        quantity: data.quantity,
        fromBrowser: false,
        maxCopiesOverride: null,
        preferredPrintingId: data.preferredPrintingId,
      });
      setShiftHeld(false);
    } else if (data?.type === "browser-card") {
      setDragInfo({
        cardId: data.card.cardId,
        cardName: legendDisplayName({
          name: data.card.cardName,
          types: data.card.cardTypes,
          tags: data.card.tags,
        }),
        quantity: 1,
        fromBrowser: true,
        maxCopiesOverride: data.card.maxCopiesOverride,
        preferredPrintingId: data.card.preferredPrintingId,
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const moveAll = shiftHeld;
    setDragInfo(null);
    setShiftHeld(false);
    activeNodeRef.current = null;

    const activeData = asDragData<AnyDragData>(event.active.data.current, DECK_DRAG_TYPES);
    const overData = asDragData<DeckDropData>(event.over?.data.current, DECK_DROP_TYPES);

    if (!activeData) {
      return;
    }

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
          // Unlimited-override cards have no cap, so a shift-drop adds a chunk of 3 (matching shift-click).
          const limit = copyLimitFor(activeData.card);
          actions.addCard(activeData.card, overData.zone, Number.isFinite(limit) ? limit : 3);
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

  // Overflow is a free parking zone: copies there don't count toward the copy cap.
  const browserLimit = dragInfo?.fromBrowser ? copyLimitFor(dragInfo) : 3;
  const browserRemaining = dragInfo?.fromBrowser
    ? Number.isFinite(browserLimit)
      ? browserLimit -
        deckCards
          .filter(
            (card) =>
              card.cardId === dragInfo.cardId &&
              (card.zone === WellKnown.deckZone.MAIN || card.zone === WellKnown.deckZone.SIDEBOARD),
          )
          .reduce((sum, card) => sum + card.quantity, 0)
      : 3
    : 0;

  const moveAll =
    shiftHeld &&
    dragInfo !== null &&
    (dragInfo.fromBrowser ? browserRemaining > 1 : dragInfo.quantity > 1);

  const { getPreferredPrinting } = usePreferredPrinting();
  const dragPrinting = dragInfo
    ? getPreferredPrinting(dragInfo.cardId, dragInfo.preferredPrintingId)
    : undefined;

  const dragCount = moveAll
    ? dragInfo?.fromBrowser
      ? browserRemaining
      : (dragInfo?.quantity ?? 1)
    : 1;

  const pointerOverSidebar = () => {
    const rect = document.querySelector(SIDEBAR_VIEWPORT_SELECTOR)?.getBoundingClientRect();
    const { x, y } = pointerRef.current;
    return rect !== undefined && isPointInRect(x, y, rect);
  };

  // dnd-kit scrolls the page before the sidebar since both share the viewport's edges;
  // veto the page while the pointer is over the sidebar so its own scroll container gets the turn.
  const canScroll = (element: Element) => {
    const isPage =
      element === document.scrollingElement ||
      element === document.documentElement ||
      element === document.body;
    if (!isPage) {
      return true;
    }
    return !pointerOverSidebar();
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      autoScroll={{ canScroll }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <DndScrollWatcher />
      {children}
      <DragOverlay dropAnimation={null} modifiers={MODIFIERS}>
        {dragInfo && (
          <CardDragGhost
            printings={dragPrinting ? [dragPrinting] : []}
            card={dragPrinting?.card}
            label={dragInfo.cardName}
            count={dragCount}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
