import type { Card } from "@openrift/shared";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { GripVertical } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useResponsiveColumns } from "@/hooks/use-responsive-columns";

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
const IS_COARSE_POINTER = window.matchMedia("(pointer: coarse)").matches;
const HIDE_DELAY = IS_COARSE_POINTER ? 3000 : 1200;
const HIDE_DELAY_SHORT = IS_COARSE_POINTER ? 2000 : 800;

interface CardGridProps {
  cards: Card[];
  setOrder: SetInfo[];
  onCardClick: (card: Card) => void;
  showImages?: boolean;
  selectedCardId?: string;
  cardFields?: CardFields;
  maxColumns?: number | null;
  onMaxColumnsChange?: (value: number | null) => void;
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
  onMaxColumnsChange,
  onPhysicalMaxChange,
}: CardGridProps) {
  const { containerRef, columns, physicalMax } = useResponsiveColumns(maxColumns);

  const prevPhysicalMax = useRef(physicalMax);
  if (prevPhysicalMax.current !== physicalMax) {
    prevPhysicalMax.current = physicalMax;
    onPhysicalMaxChange?.(physicalMax);
  }
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

  const [indicator, setIndicator] = useState({
    cardId: "",
    thumbTop: 0,
    thumbH: 0,
    visible: false,
    dragging: false,
  });
  const hideTimerRef = useRef(0);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ pointerY: 0, scrollY: 0 });

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

  // Pinch-to-zoom: two-finger gesture to change maxColumns on touch devices.
  // Spread (pinch out) → fewer columns (bigger cards), squeeze → more columns.
  const pinchRef = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    startDistance: number;
    startColumns: number;
    accumulatedSteps: number;
  } | null>(null);

  useEffect(() => {
    if (!IS_COARSE_POINTER || !onMaxColumnsChange) {
      return;
    }
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const STEP_THRESHOLD = 50;

    const getDistance = (pts: Map<number, { x: number; y: number }>) => {
      const values = [...pts.values()];
      const dx = values[1].x - values[0].x;
      const dy = values[1].y - values[0].y;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") {
        return;
      }
      if (!pinchRef.current) {
        pinchRef.current = {
          pointers: new Map(),
          startDistance: 0,
          startColumns: columns,
          accumulatedSteps: 0,
        };
      }
      pinchRef.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchRef.current.pointers.size === 2) {
        pinchRef.current.startDistance = getDistance(pinchRef.current.pointers);
        pinchRef.current.startColumns = maxColumns ?? columns;
        pinchRef.current.accumulatedSteps = 0;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const state = pinchRef.current;
      if (!state || !state.pointers.has(e.pointerId) || state.pointers.size < 2) {
        return;
      }
      state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const currentDist = getDistance(state.pointers);
      const delta = currentDist - state.startDistance;
      const steps = Math.trunc(delta / STEP_THRESHOLD);
      if (steps !== state.accumulatedSteps) {
        state.accumulatedSteps = steps;
        // Spread (positive delta) → fewer columns; squeeze → more columns
        const newCols = Math.max(2, Math.min(8, state.startColumns - steps));
        onMaxColumnsChange(newCols);
      }
    };

    const onPointerUpOrCancel = (e: PointerEvent) => {
      const state = pinchRef.current;
      if (!state) {
        return;
      }
      state.pointers.delete(e.pointerId);
      if (state.pointers.size < 2) {
        pinchRef.current = null;
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUpOrCancel);
    el.addEventListener("pointercancel", onPointerUpOrCancel);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUpOrCancel);
      el.removeEventListener("pointercancel", onPointerUpOrCancel);
    };
  }, [columns, maxColumns, onMaxColumnsChange, containerRef]);

  useEffect(() => {
    const update = () => {
      // Use virtualizer's actual measured start positions — vItem.start is the
      // absolute document Y of the row top (scrollMargin already included).
      // +1 avoids an off-by-one when scrollToIndex lands a header exactly at
      // the boundary — without it the previous row's sub-pixel bottom edge
      // can satisfy "> threshold" and the indicator shows the wrong card.
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
      // Compute the scrollbar thumb position so the indicator can track it.
      // Browsers enforce a minimum thumb height (~17px); we use a safe floor.
      const viewportH = window.innerHeight;
      const docH = document.documentElement.scrollHeight;
      // Chrome uses max(18, floor(viewportH² / docH)) internally.
      const thumbH = Math.max(18, Math.floor((viewportH / docH) * viewportH));
      const scrollableHeight = docH - viewportH;
      const yPercent = scrollableHeight > 0 ? window.scrollY / scrollableHeight : 0;
      const thumbTop = yPercent * (viewportH - thumbH);
      window.clearTimeout(hideTimerRef.current);
      setIndicator((prev) => ({
        ...prev,
        cardId: firstCard.id,
        thumbTop,
        thumbH,
        visible: true,
      }));
      if (!isDraggingRef.current) {
        hideTimerRef.current = window.setTimeout(() => {
          setIndicator((prev) => ({ ...prev, visible: false }));
        }, HIDE_DELAY);
      }
    };
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  const handleIndicatorPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragStartRef.current = { pointerY: e.clientY, scrollY: window.scrollY };
    window.clearTimeout(hideTimerRef.current);
    setIndicator((prev) => ({ ...prev, visible: true, dragging: true }));
  };

  const handleIndicatorPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) {
      return;
    }
    const viewportH = window.innerHeight;
    const docH = document.documentElement.scrollHeight;
    const scrollableHeight = docH - viewportH;
    if (scrollableHeight <= 0) {
      return;
    }
    const thumbH = Math.max(18, Math.floor((viewportH / docH) * viewportH));
    const trackH = viewportH - thumbH;
    const ratio = trackH > 0 ? scrollableHeight / trackH : 0;
    const deltaY = e.clientY - dragStartRef.current.pointerY;
    const newScrollY = Math.max(
      0,
      Math.min(scrollableHeight, dragStartRef.current.scrollY + deltaY * ratio),
    );
    window.scrollTo(0, newScrollY);
  };

  const handleIndicatorPointerUp = () => {
    if (!isDraggingRef.current) {
      return;
    }
    isDraggingRef.current = false;
    setIndicator((prev) => ({ ...prev, dragging: false }));

    hideTimerRef.current = window.setTimeout(() => {
      setIndicator((prev) => ({ ...prev, visible: false }));
    }, HIDE_DELAY);
  };

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
    return points;
  })();

  // Click a ghost badge to jump directly to that set header.
  const handleSnapBadgeClick = (rowIndex: number) => {
    virtualizer.scrollToIndex(rowIndex, { align: "start", behavior: "auto" });
  };

  // Keep indicator visible while hovering ghost badges so the user has time to click.
  const handleSnapBadgeEnter = () => {
    window.clearTimeout(hideTimerRef.current);
  };

  const handleSnapBadgeLeave = () => {
    if (isDraggingRef.current) {
      return;
    }
    hideTimerRef.current = window.setTimeout(() => {
      setIndicator((prev) => ({ ...prev, visible: false }));
    }, HIDE_DELAY_SHORT);
  };

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
        className={`fixed z-20 transition-opacity duration-300 ${indicator.visible ? "pointer-events-auto" : "pointer-events-none"} ${IS_COARSE_POINTER ? "p-2 -m-2" : ""}`}
        style={{
          right: 20,
          top: Math.max(
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
        onPointerMove={handleIndicatorPointerMove}
        onPointerUp={handleIndicatorPointerUp}
        onPointerCancel={handleIndicatorPointerUp}
      >
        <div
          className={`inline-flex items-center rounded-md bg-popover/90 font-mono font-medium text-popover-foreground shadow-md ring-1 backdrop-blur-sm select-none ${IS_COARSE_POINTER ? "pr-3 pl-1.5 py-1.5 text-sm" : "pr-2.5 pl-1 py-1 text-xs"} ${indicator.dragging ? "cursor-grabbing ring-primary/50" : "cursor-grab ring-border/50"}`}
        >
          <GripVertical className="mr-0.5 size-3 shrink-0 text-muted-foreground/40" />
          {indicator.cardId || "\u00A0"}
        </div>
      </div>

      {/* Ghost badges — clickable set-header jump targets, visible whenever indicator is */}
      {indicator.visible &&
        multipleGroups &&
        snapPoints.map((pt) => (
          <button
            type="button"
            key={pt.rowIndex}
            className={`fixed z-19 transition-opacity duration-300 ${indicator.dragging ? "pointer-events-none" : "pointer-events-auto"} ${IS_COARSE_POINTER ? "p-2 -m-2" : ""}`}
            style={{
              right: 20,
              top: pt.screenY,
              opacity: indicator.visible ? 1 : 0,
            }}
            onClick={() => handleSnapBadgeClick(pt.rowIndex)}
            onMouseEnter={handleSnapBadgeEnter}
            onMouseLeave={handleSnapBadgeLeave}
          >
            <div
              className={`rounded-md font-mono font-medium select-none ring-1 backdrop-blur-sm transition-all ${IS_COARSE_POINTER ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs"} ${
                indicator.dragging
                  ? "bg-popover/40 text-popover-foreground/30 ring-border/20"
                  : "cursor-pointer bg-popover/80 text-popover-foreground/70 ring-border/40 hover:bg-popover/95 hover:text-popover-foreground hover:ring-border/60"
              }`}
            >
              {pt.firstCardId || pt.setInfo.code}
            </div>
          </button>
        ))}

      {/* Sticky set header overlay — visible only after a section header has
          fully scrolled above the sticky threshold. The incoming virtual header
          row handles the visual "push" as it approaches from below. */}
      {multipleGroups && activeHeaderRow && (
        <div
          className="fixed left-0 right-0 z-10 flex items-center gap-3 bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60"
          style={{ top: APP_HEADER_HEIGHT }}
        >
          <div className="h-px flex-1 bg-border" />
          <button
            type="button"
            className="flex cursor-pointer items-center gap-2"
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
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      {/* pan-x pan-y prevents the browser from claiming pinch-zoom so our
          JS-based pinch-to-resize gesture works on touch devices. */}
      <div
        ref={containerRef}
        style={IS_COARSE_POINTER && onMaxColumnsChange ? { touchAction: "pan-x pan-y" } : undefined}
      >
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
                  <div className="flex items-center gap-3 py-2">
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
