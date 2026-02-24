import type { Card } from "@openrift/shared";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import { IS_COARSE_POINTER } from "@/lib/pointer";

import type { CardFields } from "./CardThumbnail";
import { CardThumbnail } from "./CardThumbnail";

export interface SetInfo {
  name: string;
  code: string;
}

interface CardGroup {
  set: SetInfo;
  cards: Card[];
}

function groupCardsBySet(cards: Card[], setOrder: SetInfo[]): CardGroup[] {
  const bySet = new Map<string, Card[]>();
  for (const card of cards) {
    let group = bySet.get(card.set);
    if (!group) {
      group = [];
      bySet.set(card.set, group);
    }
    group.push(card);
  }

  const groups: CardGroup[] = [];
  for (const setInfo of setOrder) {
    const setCards = bySet.get(setInfo.name);
    if (setCards) {
      groups.push({ set: setInfo, cards: setCards });
    }
  }

  return groups;
}

type VRow = { kind: "header"; set: SetInfo; cardCount: number } | { kind: "cards"; items: Card[] };

function buildVirtualRows(groups: CardGroup[], columns: number, showHeaders: boolean): VRow[] {
  const rows: VRow[] = [];
  for (const group of groups) {
    if (showHeaders) {
      rows.push({ kind: "header", set: group.set, cardCount: group.cards.length });
    }
    for (let i = 0; i < group.cards.length; i += columns) {
      rows.push({ kind: "cards", items: group.cards.slice(i, i + columns) });
    }
  }
  return rows;
}

const CARD_ASPECT = 1039 / 744;
const GAP = 16; // gap-4
const APP_HEADER_HEIGHT = 56; // h-14
const HIDE_DELAY = IS_COARSE_POINTER ? 3000 : 1200;
const POST_DRAG_HIDE_DELAY = IS_COARSE_POINTER ? 1500 : 600;

interface CardGridProps {
  cards: Card[];
  setOrder: SetInfo[];
  onCardClick: (card: Card) => void;
  showImages?: boolean;
  selectedCardId?: string;
  cardFields?: CardFields;
  maxColumns?: number | null;
  onPhysicalMaxChange?: (max: number) => void;
}

export function CardGrid({
  cards,
  setOrder,
  onCardClick,
  showImages,
  selectedCardId,
  cardFields,
  maxColumns,
  onPhysicalMaxChange,
}: CardGridProps) {
  const { containerRef, columns, physicalMax } = useResponsiveColumns(maxColumns);

  const prevPhysicalMax = useRef(physicalMax);
  if (prevPhysicalMax.current !== physicalMax) {
    prevPhysicalMax.current = physicalMax;
    onPhysicalMaxChange?.(physicalMax);
  }
  const outerWidth = containerRef.current?.offsetWidth ?? 400;
  const thumbWidth = (outerWidth - GAP * (columns - 1)) / columns;

  const groups = groupCardsBySet(cards, setOrder);
  const multipleGroups = groups.length > 1;

  const virtualRows = buildVirtualRows(groups, columns, multipleGroups);

  const hasLabel = cardFields
    ? cardFields.number || cardFields.title || cardFields.type || cardFields.rarity
    : true;

  const estimateSize = (index: number): number => {
    const row = virtualRows[index];
    if (!row) {
      return 200;
    }
    if (row.kind === "header") {
      return 44;
    }
    const containerWidth = containerRef.current?.offsetWidth ?? 400;
    const cardWidth = (containerWidth - GAP * (columns - 1)) / columns;
    const imgHeight = cardWidth * CARD_ASPECT;
    const labelHeight = hasLabel ? 50 : 0;
    return Math.ceil(imgHeight + labelHeight) + GAP;
  };

  // Precompute cumulative start offsets (within the virtual list) for each row.
  // Used by the sticky-header scroll listener to find which header is active
  // without touching the DOM on every scroll event.
  const rowStarts = (() => {
    const starts: number[] = [];
    let acc = 0;
    for (let i = 0; i < virtualRows.length; i++) {
      starts.push(acc);
      acc += estimateSize(i);
    }
    return starts;
  })();

  // scrollMarginRef holds the same value as scrollMargin state but is readable
  // synchronously inside the scroll listener without a stale closure — this is
  // what breaks the update cycle that previously caused infinite re-renders.
  const scrollMarginRef = useRef(0);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Which header row has fully scrolled past the sticky point.
  // "Fully" means its END is above the threshold so the virtual row itself
  // is no longer visible — this prevents the sticky overlay and the virtual
  // header row from being visible at the same time.
  const [activeHeaderRow, setActiveHeaderRow] = useState<(VRow & { kind: "header" }) | null>(null);

  // Re-measure the container's document offset when the card list changes.
  // useLayoutEffect runs before paint so corrections are invisible to the user.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const newMargin = Math.round(el.getBoundingClientRect().top + window.scrollY);
    if (newMargin !== scrollMarginRef.current) {
      scrollMarginRef.current = newMargin;
      setScrollMargin(newMargin);
    }
  }, [cards, containerRef]);

  useEffect(() => {
    if (!multipleGroups) {
      setActiveHeaderRow(null);
      return;
    }

    const update = () => {
      // Read from ref (not the closed-over state value) so the threshold is
      // always current even when the sticky overlay's presence shifts the
      // container. scrollMargin is intentionally excluded from deps to avoid
      // the re-subscribe cycle that caused the infinite update loop.
      const threshold = window.scrollY - scrollMarginRef.current + APP_HEADER_HEIGHT;

      // Build a map of measured start positions for currently-rendered items.
      // rowStarts uses estimated sizes and can drift significantly with many rows
      // (Math.ceil rounding accumulates). The virtualizer's own positions are
      // accurate for rendered items, so we prefer those at boundaries.
      // vItem.start is an absolute document position (includes scrollMargin).
      // Subtract scrollMarginRef to convert to virtual-list coordinates so it
      // can be compared against threshold (which is also virtual-list-relative).
      const measuredStarts = new Map(
        virtualizerRef.current
          .getVirtualItems()
          .map((item) => [item.index, item.start - scrollMarginRef.current]),
      );

      // Walk header rows; the active one is the last header whose top has
      // reached or crossed the sticky threshold (≤ so the exact boundary
      // position — which scrollToIndex targets — activates the correct set).
      let active: (VRow & { kind: "header" }) | null = null;
      for (let i = 0; i < virtualRows.length; i++) {
        const row = virtualRows[i];
        if (row.kind !== "header") {
          continue;
        }
        const start = measuredStarts.get(i) ?? rowStarts[i];
        if (start <= threshold + 1) {
          active = row;
        }
      }
      setActiveHeaderRow(active);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [virtualRows, rowStarts, multipleGroups]);

  const virtualizer = useWindowVirtualizer({
    count: virtualRows.length,
    estimateSize,
    scrollMargin,
    scrollPaddingStart: APP_HEADER_HEIGHT,
    overscan: 3,
  });

  // Keep a ref so the scroll handler always reads the virtualizer's current
  // measured item positions rather than estimated ones (which drift at scale).
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  // Ref mirror of virtualRows so the scroll-indicator effect can read the
  // latest rows without listing virtualRows as a dependency — that reference
  // changes every render which would tear down the effect and cancel the
  // hide timer, keeping the indicator permanently visible.
  const virtualRowsRef = useRef(virtualRows);
  virtualRowsRef.current = virtualRows;

  const rowStartsRef = useRef(rowStarts);
  rowStartsRef.current = rowStarts;

  const [indicator, setIndicator] = useState({
    cardId: "",
    thumbTop: 0,
    thumbH: 0,
    visible: false,
    dragging: false,
  });
  const hideTimerRef = useRef(0);
  const isDraggingRef = useRef(false);
  const postDragCooldownRef = useRef(false);
  const dragStartRef = useRef({ grabOffsetY: 0, viewportH: 0, docH: 0 });
  const indicatorRef = useRef<HTMLDivElement>(null);
  const cardIdRef = useRef<HTMLElement>(null);
  const rafIdRef = useRef(0);
  const dragTopRef = useRef(0);
  const dragPointerIdRef = useRef(-1);

  // Prevent native touch scrolling while the indicator is being dragged.
  // touch-action: none on the element alone is unreliable on mobile — the
  // browser can still initiate a scroll gesture. A non-passive touchmove
  // handler on the document lets us call preventDefault() to suppress it.
  useEffect(() => {
    const preventScroll = (e: TouchEvent) => {
      if (isDraggingRef.current) {
        e.preventDefault();
      }
    };
    document.addEventListener("touchmove", preventScroll, { passive: false });
    return () => document.removeEventListener("touchmove", preventScroll);
  }, []);

  useEffect(() => {
    const update = () => {
      const threshold = window.scrollY + APP_HEADER_HEIGHT + 1;
      const vItems = virtualizerRef.current.getVirtualItems();
      const rows = virtualRowsRef.current;
      let firstCard: Card | null = null;
      for (const vItem of vItems) {
        const row = rows[vItem.index];
        if (!row || row.kind !== "cards") {
          continue;
        }
        if (vItem.start + vItem.size > threshold) {
          firstCard = row.items[0] ?? null;
          break;
        }
      }
      if (!firstCard) {
        return;
      }

      const viewportH = window.innerHeight;
      const docH = document.documentElement.scrollHeight;
      const thumbH = Math.max(18, Math.floor((viewportH / docH) * viewportH));
      const scrollableHeight = docH - viewportH;
      const yPercent = scrollableHeight > 0 ? window.scrollY / scrollableHeight : 0;
      const thumbTop = yPercent * (viewportH - thumbH);

      // During drag: only update the card ID label. The pointer handler drives
      // the indicator position directly, so we must not reposition it here —
      // that would fight the pointer and cause jumps when scrollHeight shifts.
      if (isDraggingRef.current) {
        if (cardIdRef.current) {
          cardIdRef.current.textContent = firstCard.id;
        }
        return;
      }

      // After a drag release, scrollTo triggers scroll events. Don't let
      // those reset the shorter post-drag hide timer.
      if (postDragCooldownRef.current) {
        return;
      }

      window.clearTimeout(hideTimerRef.current);
      setIndicator((prev) => ({
        ...prev,
        cardId: firstCard.id,
        thumbTop,
        thumbH,
        visible: true,
      }));
      hideTimerRef.current = window.setTimeout(() => {
        setIndicator((prev) => ({ ...prev, visible: false }));
      }, HIDE_DELAY);
    };
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  const handleIndicatorPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    // Don't use setPointerCapture — on mobile WebKit it causes
    // pointermove to report garbage clientY values (±100000).
    isDraggingRef.current = true;
    dragPointerIdRef.current = e.pointerId;
    // Grab offset in style.top space so the indicator stays pinned to the finger.
    // Freeze viewport & document dimensions so mobile browser chrome changes
    // (address bar collapse/expand) don't shift the scroll-to-thumb mapping.
    const styleTop = parseFloat((e.currentTarget as HTMLElement).style.top) || 0;
    dragTopRef.current = styleTop;
    dragStartRef.current = {
      grabOffsetY: e.clientY - styleTop,
      viewportH: window.innerHeight,
      docH: document.documentElement.scrollHeight,
    };
    window.clearTimeout(hideTimerRef.current);
    setIndicator((prev) => ({ ...prev, visible: true, dragging: true }));
  };

  // Document-level move/up listeners for drag.
  // Touch devices use TouchEvent (touchmove/touchend) because PointerEvent
  // pointermove reports garbage clientY values (±100000) on mobile WebKit.
  // Desktop uses PointerEvent as usual.
  useEffect(() => {
    const handleMove = (clientY: number) => {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
        const { viewportH, docH } = dragStartRef.current;

        // Only move the indicator handle — the actual scroll happens on release
        // (handleUp). This avoids expensive virtualizer re-renders during drag.
        const indicatorTop = Math.max(
          APP_HEADER_HEIGHT + 4,
          Math.min(viewportH - 28, clientY - dragStartRef.current.grabOffsetY),
        );
        dragTopRef.current = indicatorTop;
        if (indicatorRef.current) {
          indicatorRef.current.style.top = `${indicatorTop}px`;
        }

        // Project which card would be visible at this indicator position and
        // update the label so the user sees where they'll land on release.
        const scrollableHeight = docH - viewportH;
        if (scrollableHeight > 0 && cardIdRef.current) {
          const thumbH = Math.max(18, Math.floor((viewportH / docH) * viewportH));
          const thumbTop = indicatorTop - thumbH / 2 + 12;
          const yPercent = Math.max(0, Math.min(1, thumbTop / (viewportH - thumbH)));
          const targetScrollY = yPercent * scrollableHeight;
          const threshold = targetScrollY + APP_HEADER_HEIGHT + 1 - scrollMarginRef.current;

          const rows = virtualRowsRef.current;
          const starts = rowStartsRef.current;
          let cardId = "";
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.kind !== "cards") {
              continue;
            }
            const rowEnd = i + 1 < starts.length ? starts[i + 1] : starts[i] + 200;
            if (rowEnd > threshold) {
              cardId = row.items[0]?.id ?? "";
              break;
            }
          }
          if (cardId) {
            cardIdRef.current.textContent = cardId;
          }
        }
      });
    };

    const handleUp = () => {
      isDraggingRef.current = false;
      dragPointerIdRef.current = -1;
      cancelAnimationFrame(rafIdRef.current);

      // Final exact scroll to sync content with indicator position.
      const { viewportH, docH } = dragStartRef.current;
      const scrollableHeight = docH - viewportH;
      if (scrollableHeight > 0) {
        const thumbH = Math.max(18, Math.floor((viewportH / docH) * viewportH));
        const thumbTop = dragTopRef.current - thumbH / 2 + 12;
        const yPercent = Math.max(0, Math.min(1, thumbTop / (viewportH - thumbH)));
        window.scrollTo(0, yPercent * scrollableHeight);
      }

      // Read back the actual scroll position for React state sync.
      const liveViewportH = window.innerHeight;
      const liveDocH = document.documentElement.scrollHeight;
      const liveThumbH = Math.max(18, Math.floor((liveViewportH / liveDocH) * liveViewportH));
      const liveScrollable = liveDocH - liveViewportH;
      const liveYPercent = liveScrollable > 0 ? window.scrollY / liveScrollable : 0;
      const liveThumbTop = liveYPercent * (liveViewportH - liveThumbH);
      const currentCardId = cardIdRef.current?.textContent || "";

      postDragCooldownRef.current = true;
      setIndicator((prev) => ({
        ...prev,
        dragging: false,
        thumbTop: liveThumbTop,
        thumbH: liveThumbH,
        cardId: currentCardId,
      }));

      hideTimerRef.current = window.setTimeout(() => {
        postDragCooldownRef.current = false;
        setIndicator((prev) => ({ ...prev, visible: false }));
      }, POST_DRAG_HIDE_DELAY);
    };

    if (IS_COARSE_POINTER) {
      // Touch path — Touch.clientY is reliable on all mobile browsers.
      const onTouchMove = (e: TouchEvent) => {
        if (!isDraggingRef.current) {
          return;
        }
        const touch = e.touches[0];
        if (touch) {
          handleMove(touch.clientY);
        }
      };
      const onTouchEnd = () => {
        if (!isDraggingRef.current) {
          return;
        }
        handleUp();
      };
      document.addEventListener("touchmove", onTouchMove);
      document.addEventListener("touchend", onTouchEnd);
      document.addEventListener("touchcancel", onTouchEnd);
      return () => {
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
        document.removeEventListener("touchcancel", onTouchEnd);
      };
    }

    // Pointer path — desktop only.
    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current || e.pointerId !== dragPointerIdRef.current) {
        return;
      }
      handleMove(e.clientY);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!isDraggingRef.current || e.pointerId !== dragPointerIdRef.current) {
        return;
      }
      handleUp();
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  // Screen-space positions of each set header on the scrollbar track.
  // Recomputed on every render (indicator.thumbTop changes on scroll).
  const snapPoints = (() => {
    if (!multipleGroups) {
      return [];
    }
    const viewportH = window.innerHeight;
    const docH = document.documentElement.scrollHeight;
    const scrollableHeight = docH - viewportH;
    if (scrollableHeight <= 0) {
      return [];
    }
    const thumbH = Math.max(18, Math.floor((viewportH / docH) * viewportH));

    // Prefer the virtualizer's measured positions over rowStarts (estimated).
    // rowStarts accumulates Math.ceil rounding across many rows, so ghost badges
    // computed from it drift away from the indicator (which uses real scrollY).
    const measuredStarts = new Map(
      virtualizerRef.current
        .getVirtualItems()
        .map((item) => [item.index, item.start - scrollMarginRef.current]),
    );

    const points: {
      rowIndex: number;
      setInfo: SetInfo;
      screenY: number;
      cardCount: number;
      firstCardId: string;
    }[] = [];

    for (let i = 0; i < virtualRows.length; i++) {
      const row = virtualRows[i];
      if (row.kind !== "header") {
        continue;
      }
      const rowStart = measuredStarts.get(i) ?? rowStarts[i];
      const headerScrollY = rowStart + scrollMarginRef.current - APP_HEADER_HEIGHT;
      const yPct = Math.max(0, Math.min(1, headerScrollY / scrollableHeight));
      const snapThumbTop = yPct * (viewportH - thumbH);
      const screenY = Math.max(
        APP_HEADER_HEIGHT + 4,
        Math.min(viewportH - 28, Math.round(snapThumbTop + thumbH / 2 - 12)),
      );
      // First card ID in this set (for ghost badges)
      let firstCardId = "";
      for (let j = i + 1; j < virtualRows.length; j++) {
        const next = virtualRows[j];
        if (next.kind === "cards" && next.items.length > 0) {
          firstCardId = next.items[0].id;
          break;
        }
        if (next.kind === "header") {
          break;
        }
      }
      points.push({
        rowIndex: i,
        setInfo: row.set,
        screenY,
        cardCount: row.cardCount,
        firstCardId,
      });
    }

    // Collision avoidance: push badges apart when they overlap vertically.
    // Each badge is roughly 24px tall (text + padding); use a minimum gap.
    const MIN_GAP = IS_COARSE_POINTER ? 32 : 26;
    for (let p = 1; p < points.length; p++) {
      const gap = points[p].screenY - points[p - 1].screenY;
      if (gap < MIN_GAP) {
        points[p].screenY = points[p - 1].screenY + MIN_GAP;
      }
    }

    return points;
  })();

  // Click a ghost badge to jump directly to that set header.
  // Arrow-key navigation: when a card is selected, Left/Right/Up/Down moves
  // to adjacent cards in the grid while skipping set headers.
  useEffect(() => {
    if (!selectedCardId) {
      return;
    }

    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") {
        return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        return;
      }

      // Build nav index: cardId → { vRowIndex, colIndex }
      const cardPos = new Map<string, { vRowIndex: number; colIndex: number }>();
      const cardRowIndices: number[] = [];
      for (let i = 0; i < virtualRows.length; i++) {
        const row = virtualRows[i];
        if (row.kind !== "cards") {
          continue;
        }
        cardRowIndices.push(i);
        for (let c = 0; c < row.items.length; c++) {
          cardPos.set(row.items[c].id, { vRowIndex: i, colIndex: c });
        }
      }

      const current = cardPos.get(selectedCardId);
      if (!current) {
        return;
      }

      const crIdx = cardRowIndices.indexOf(current.vRowIndex);
      let targetCard: Card | undefined;
      let targetRowIndex: number | undefined;

      if (e.key === "ArrowLeft") {
        if (current.colIndex > 0) {
          const row = virtualRows[current.vRowIndex];
          if (row.kind === "cards") {
            targetCard = row.items[current.colIndex - 1];
            targetRowIndex = current.vRowIndex;
          }
        } else if (crIdx > 0) {
          const prevRow = virtualRows[cardRowIndices[crIdx - 1]];
          if (prevRow.kind === "cards") {
            targetCard = prevRow.items.at(-1);
            targetRowIndex = cardRowIndices[crIdx - 1];
          }
        }
      } else if (e.key === "ArrowRight") {
        const row = virtualRows[current.vRowIndex];
        if (row.kind === "cards" && current.colIndex < row.items.length - 1) {
          targetCard = row.items[current.colIndex + 1];
          targetRowIndex = current.vRowIndex;
        } else if (crIdx < cardRowIndices.length - 1) {
          const nextRow = virtualRows[cardRowIndices[crIdx + 1]];
          if (nextRow.kind === "cards") {
            targetCard = nextRow.items[0];
            targetRowIndex = cardRowIndices[crIdx + 1];
          }
        }
      } else if (e.key === "ArrowUp" && crIdx > 0) {
        const prevRow = virtualRows[cardRowIndices[crIdx - 1]];
        if (prevRow.kind === "cards") {
          const col = Math.min(current.colIndex, prevRow.items.length - 1);
          targetCard = prevRow.items[col];
          targetRowIndex = cardRowIndices[crIdx - 1];
        }
      } else if (e.key === "ArrowDown" && crIdx < cardRowIndices.length - 1) {
        const nextRow = virtualRows[cardRowIndices[crIdx + 1]];
        if (nextRow.kind === "cards") {
          const col = Math.min(current.colIndex, nextRow.items.length - 1);
          targetCard = nextRow.items[col];
          targetRowIndex = cardRowIndices[crIdx + 1];
        }
      }

      if (targetCard && targetRowIndex !== undefined) {
        e.preventDefault();
        onCardClick(targetCard);
        virtualizer.scrollToIndex(targetRowIndex, { align: "auto" });
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedCardId, virtualRows, columns, onCardClick, virtualizer]);

  const scrollToGroup = (setName: string) => {
    const rowIndex = virtualRows.findIndex((r) => r.kind === "header" && r.set.name === setName);
    if (rowIndex !== -1) {
      // behavior: "instant" avoids the smooth-scroll retry jitter: the
      // virtualizer internally retries up to 10 times to nail the exact
      // position as dynamic item sizes are measured. With "smooth" those
      // retries produce visible animation stutter; with "instant" they
      // complete invisibly in successive animation frames.
      virtualizer.scrollToIndex(rowIndex, { align: "start", behavior: "auto" });
    }
  };

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg font-medium text-muted-foreground">No cards found</p>
        <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();

  return (
    <>
      {/* Scroll position indicator — appears while scrolling, fades out after idle.
          Draggable: grab to scrub through the page; snaps to set headers on release. */}
      <div
        ref={indicatorRef}
        className={`fixed z-20 transition-opacity duration-300 ${indicator.visible ? "pointer-events-auto" : "pointer-events-none"} ${IS_COARSE_POINTER ? "p-2 -m-2" : ""}`}
        style={{
          right: 20,
          top: indicator.dragging
            ? dragTopRef.current
            : Math.max(
                APP_HEADER_HEIGHT + 4,
                Math.min(
                  window.innerHeight - 28,
                  Math.round(indicator.thumbTop + indicator.thumbH / 2 - 12),
                ),
              ),
          opacity: indicator.visible ? 1 : 0,
          touchAction: "none",
        }}
        onPointerDown={handleIndicatorPointerDown}
      >
        <div className="flex items-center gap-1.5">
          <div
            className={`inline-flex items-center rounded-md bg-popover/90 font-mono font-medium text-popover-foreground shadow-md ring-1 backdrop-blur-sm select-none ${IS_COARSE_POINTER ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs"} ${indicator.dragging ? "cursor-grabbing ring-primary/60" : "cursor-grab ring-primary/40"}`}
          >
            <span ref={cardIdRef}>{indicator.cardId || "\u00A0"}</span>
          </div>
          <div className="size-2 shrink-0 rounded-full bg-primary/70" />
        </div>
      </div>

      {/* Ghost badges — set-section marks, visible only while dragging */}
      {indicator.visible &&
        multipleGroups &&
        snapPoints.map((pt) => (
          <div
            key={pt.rowIndex}
            className={`pointer-events-none fixed z-19 transition-opacity duration-300 ${IS_COARSE_POINTER ? "p-2 -m-2" : ""}`}
            style={{
              right: 20,
              top: pt.screenY,
              opacity: indicator.dragging ? 1 : 0,
            }}
          >
            <div className="flex items-center gap-1.5">
              <div
                className={`rounded-md bg-popover/40 font-mono font-medium text-popover-foreground/30 ring-1 ring-border/20 backdrop-blur-sm select-none ${IS_COARSE_POINTER ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs"}`}
              >
                {pt.firstCardId || pt.setInfo.code}
              </div>
              <div className="size-1.5 shrink-0 rounded-full bg-muted-foreground/20" />
            </div>
          </div>
        ))}

      {/* Sticky set header overlay — visible only after a section header has
          fully scrolled above the sticky threshold. Just the label, no lines. */}
      {multipleGroups && activeHeaderRow && (
        <div
          className="fixed left-0 right-0 z-10 flex justify-center py-2"
          style={{ top: APP_HEADER_HEIGHT }}
        >
          <button
            type="button"
            className="flex cursor-pointer items-center gap-2 rounded-full bg-background/95 px-3 py-1 shadow-sm ring-1 ring-border/50 backdrop-blur supports-[backdrop-filter]:bg-background/60"
            onClick={() => scrollToGroup(activeHeaderRow.set.name)}
          >
            <span className="text-sm font-medium text-muted-foreground">
              {activeHeaderRow.set.code}
            </span>
            <span className="text-sm font-semibold">{activeHeaderRow.set.name}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {activeHeaderRow.cardCount}
            </span>
          </button>
        </div>
      )}

      <div ref={containerRef}>
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
          {items.map((vItem) => {
            const row = virtualRows[vItem.index];
            if (!row) {
              return null;
            }

            return (
              <div
                key={vItem.key}
                data-index={vItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vItem.start - scrollMargin}px)`,
                }}
              >
                {row.kind === "header" ? (
                  <div className="flex items-center gap-3 pt-4 pb-2">
                    <div className="h-px flex-1 bg-border" />
                    <button
                      type="button"
                      className="flex cursor-pointer items-center gap-2"
                      onClick={() => scrollToGroup(row.set.name)}
                    >
                      <span className="text-sm font-medium text-muted-foreground">
                        {row.set.code}
                      </span>
                      <span className="text-sm font-semibold">{row.set.name}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {row.cardCount}
                      </span>
                    </button>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                      gap: `${GAP}px`,
                      paddingBottom: `${GAP}px`,
                    }}
                  >
                    {row.items.map((card) => (
                      <CardThumbnail
                        key={card.id}
                        card={card}
                        onClick={onCardClick}
                        showImages={showImages}
                        isSelected={card.id === selectedCardId}
                        cardFields={cardFields}
                        cardWidth={thumbWidth}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
