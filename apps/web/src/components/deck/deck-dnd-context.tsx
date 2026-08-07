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
import { copyLimitFor, imageUrl, legendDisplayName, WellKnown } from "@openrift/shared";
import type { DeckZone } from "@openrift/shared";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { DndScrollWatcher } from "@/components/dnd-scroll-watcher";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
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

export type AnyDragData = DeckCardDragData | BrowserCardDragData;

const DRAG_ACTIVATION = { distance: 8 };
/**
 * Zones whose cards can be picked up and re-homed by dragging. Every deck
 * surface that renders draggable cards (overview grid, overview list, sidebar)
 * uses this set, so they all offer the drag affordance on the same rows.
 */
export const DRAG_SOURCE_ZONES: ReadonlySet<DeckZone> = new Set([
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.OVERFLOW,
]);

/**
 * The deck card a drag is carrying, resolved against the current deck. A
 * browser drag carries its card outright; a deck drag carries ids, so the copy
 * living in the source zone is looked up — its quantity and types are what the
 * zone-fullness and type checks read.
 * @returns The dragged card, or undefined when nothing is being dragged (or the
 *   dragged deck card is no longer in its source zone).
 */
export function resolveDraggedCard(
  dragData: AnyDragData | undefined,
  allCards: readonly DeckBuilderCard[],
): DeckBuilderCard | undefined {
  if (dragData?.type === "browser-card") {
    return dragData.card;
  }
  if (dragData?.type === "deck-card") {
    return allCards.find(
      (card) => card.cardId === dragData.cardId && card.zone === dragData.fromZone,
    );
  }
  return undefined;
}
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
/** How close to a container's edge the pointer must get before it auto-scrolls. */
const EDGE_SIZE = 40;
/** Pixels per frame at the very edge; scaled down across the edge band. */
const SCROLL_SPEED = 15;
/** The sidebar's own scroll container (SidebarContent sets this data-slot). */
const SIDEBAR_VIEWPORT_SELECTOR = '[data-slot="sidebar-content"]';

/**
 * Vertical auto-scroll step for one frame of an edge-scrolling container. The
 * speed ramps from 0 at the inner edge of the band to SCROLL_SPEED at the
 * container's edge, and is clamped there so a pointer past the edge doesn't
 * scroll faster than one sitting on it.
 * @returns Pixels to scroll this frame — negative up, positive down, and 0 when
 *   the pointer is clear of both edges or the container is already at that end.
 */
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

/**
 * Whether a viewport point falls inside a rect, edges included.
 * @returns `true` when the point is within the rect.
 */
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
    /** Copy-limit override of the dragged card; only read for browser drags. */
    maxCopiesOverride: number | null;
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
  // dnd-kit's built-in auto-scroll only walks the active node's ancestors, so
  // this covers a card dragged from the browser grid over the sidebar. The page
  // itself is never scrolled here — that stays dnd-kit's job.
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
        // The page is dnd-kit's to scroll, gated by canScroll.
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

    const data = event.active.data.current as AnyDragData | undefined;
    if (data?.type === "deck-card") {
      setDragInfo({
        cardId: data.cardId,
        cardName: data.cardName,
        quantity: data.quantity,
        fromBrowser: false,
        maxCopiesOverride: null,
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
          // "Fill to the copy cap"; unlimited-override cards have no cap, so a
          // shift-drop adds a chunk of 3 (matching shift-click). addCardAction
          // clamps to the real remainder for finite limits.
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

  // Overflow is excluded — it is a free parking zone, so copies parked there
  // neither count toward the copy cap nor reduce how many a shift-drag adds.
  // Unlimited-override cards have no finite remainder; shift-drag adds a
  // chunk of 3 for them (matching shift-click).
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

  const { getPreferredFrontImage } = usePreferredPrinting();
  const dragImageId = dragInfo ? (getPreferredFrontImage(dragInfo.cardId)?.imageId ?? null) : null;
  const dragImageUrl = dragImageId ? imageUrl(dragImageId, "400w") : null;

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

  // dnd-kit walks the active node's scrollable ancestors outermost-first (its
  // default TraversalOrder.TreeOrder reverses the innermost-first list) and
  // scrolls the first one that wants to move. The sidebar is full-height, so
  // its top and bottom edges sit on the viewport's: dragging between its zone
  // sections put the pointer in the *page's* edge band first, which scrolled
  // the main view while the sidebar itself stayed put. Vetoing the page while
  // the pointer is over the sidebar lets that loop fall through to the
  // sidebar's own scroll container. Over the main area nothing is vetoed, so
  // page auto-scroll behaves as before. Measured per call rather than cached:
  // dnd-kit re-runs this on each pointer move, and a frame-old answer could
  // leave the page scrolling after the pointer crossed into the sidebar.
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
          <div className="relative h-48 w-28">
            {dragImageUrl ? (
              <ImgWithFallback
                src={dragImageUrl}
                alt=""
                className="absolute top-0 left-0 w-28 rounded-lg shadow-lg"
                draggable={false}
                fallback={
                  <div className="bg-muted absolute top-0 left-0 flex h-40 w-28 items-center justify-center rounded-lg shadow-lg">
                    <span className="text-muted-foreground px-1 text-center text-xs">
                      {dragInfo.cardName}
                    </span>
                  </div>
                }
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
