import type { Card } from "@openrift/shared";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import type { CardFields } from "@/lib/card-fields";
import { IS_COARSE_POINTER } from "@/lib/pointer";

import { CardThumbnail } from "./card-thumbnail";

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
    const setCards = bySet.get(setInfo.code);
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
const HIDE_DELAY = 3000;
const POST_DRAG_HIDE_DELAY = IS_COARSE_POINTER ? 1500 : 600;
const INDICATOR_H_FALLBACK = 48;
const INDICATOR_PAD = 4;

interface CardGridProps {
  cards: Card[];
  totalCards: number;
  setOrder: SetInfo[];
  onCardClick: (card: Card) => void;
  onSiblingClick?: (card: Card) => void;
  showImages?: boolean;
  selectedCardId?: string;
  siblingPrintings?: Card[];
  printingsByCardId?: Map<string, Card[]>;
  priceRangeByCardId?: Map<string, { min: number; max: number }> | null;
  view?: "cards" | "printings";
  cardFields?: CardFields;
  maxColumns?: number | null;
  onPhysicalMaxChange?: (max: number) => void;
  onPhysicalMinChange?: (min: number) => void;
  onAutoColumnsChange?: (cols: number) => void;
}

export function CardGrid({
  cards,
  totalCards,
  setOrder,
  onCardClick,
  onSiblingClick,
  showImages,
  selectedCardId,
  siblingPrintings,
  printingsByCardId,
  priceRangeByCardId,
  view,
  cardFields,
  maxColumns,
  onPhysicalMaxChange,
  onPhysicalMinChange,
  onAutoColumnsChange,
}: CardGridProps) {
  const { containerRef, columns, physicalMax, physicalMin, autoColumns } =
    useResponsiveColumns(maxColumns);

  useLayoutEffect(() => {
    onPhysicalMaxChange?.(physicalMax);
  }, [physicalMax, onPhysicalMaxChange]);

  useLayoutEffect(() => {
    onPhysicalMinChange?.(physicalMin);
  }, [physicalMin, onPhysicalMinChange]);

  useLayoutEffect(() => {
    onAutoColumnsChange?.(autoColumns);
  }, [autoColumns, onAutoColumnsChange]);
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

  // Ref mirrors so scroll handlers always read current data without listing
  // the arrays as effect dependencies (they change every render).
  const virtualRowsRef = useRef(virtualRows);
  virtualRowsRef.current = virtualRows;

  const rowStartsRef = useRef(rowStarts);
  rowStartsRef.current = rowStarts;

  const siblingPrintingsRef = useRef(siblingPrintings);
  siblingPrintingsRef.current = siblingPrintings;

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
    const newMargin = Math.round(el.getBoundingClientRect().top + globalThis.scrollY);
    if (newMargin !== scrollMarginRef.current) {
      scrollMarginRef.current = newMargin;
      setScrollMargin(newMargin);
    }
  }, [cards, containerRef]);

  // multipleGroupsRef lets the scroll handler check the flag without
  // re-subscribing every time the card list changes.
  const multipleGroupsRef = useRef(multipleGroups);
  multipleGroupsRef.current = multipleGroups;

  useEffect(() => {
    if (!multipleGroups) {
      setActiveHeaderRow(null);
      return;
    }

    const update = () => {
      if (!multipleGroupsRef.current) {
        return;
      }

      // Read from refs (not the closed-over render values) so the handler is
      // always current without re-subscribing on every render. virtualRows and
      // rowStarts are new arrays each render — listing them as deps caused the
      // infinite update loop.
      const rows = virtualRowsRef.current;
      const starts = rowStartsRef.current;
      const threshold = globalThis.scrollY - scrollMarginRef.current + APP_HEADER_HEIGHT;

      // Build a map of measured start positions for currently-rendered items.
      // rowStarts uses estimated sizes and can drift significantly with many rows
      // (Math.ceil rounding accumulates). The virtualizer's own positions are
      // accurate for rendered items, so we prefer those at boundaries.
      const measuredStarts = new Map(
        virtualizerRef.current
          .getVirtualItems()
          .map((item) => [item.index, item.start - scrollMarginRef.current]),
      );

      // Walk header rows; the active one is the last header whose top has
      // reached or crossed the sticky threshold (≤ so the exact boundary
      // position — which scrollToIndex targets — activates the correct set).
      let active: (VRow & { kind: "header" }) | null = null;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.kind !== "header") {
          continue;
        }
        const start = measuredStarts.get(i) ?? starts[i];
        if (start <= threshold + 1) {
          active = row;
        }
      }
      setActiveHeaderRow(active);
    };

    update();
    globalThis.addEventListener("scroll", update, { passive: true });
    return () => globalThis.removeEventListener("scroll", update);
  }, [multipleGroups]);

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

  const [indicator, setIndicator] = useState({
    cardId: "",
    indicatorTop: APP_HEADER_HEIGHT + INDICATOR_PAD,
    visible: false,
    dragging: false,
  });
  const hideTimerRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isHoveredRef = useRef(false);
  const postDragCooldownRef = useRef(false);
  const dragStartRef = useRef({
    grabOffsetY: 0,
    trackTop: 0,
    trackBottom: 0,
    contentStart: 0,
    contentRange: 0,
  });
  const indicatorRef = useRef<HTMLDivElement>(null);
  const indicatorHRef = useRef(INDICATOR_H_FALLBACK);
  const cardIdRef = useRef<HTMLElement>(null);
  const dragTopRef = useRef(0);
  const dragTargetRowRef = useRef(-1);
  const snapPointsRef = useRef<{ screenY: number; rowIndex: number; firstCardId: string }[]>([]);

  // Measure the indicator's rendered height so track bounds are always accurate.
  useLayoutEffect(() => {
    if (indicatorRef.current) {
      indicatorHRef.current = indicatorRef.current.offsetHeight || INDICATOR_H_FALLBACK;
    }
  });

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
      const threshold = globalThis.scrollY + APP_HEADER_HEIGHT + 1;
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

      const viewportH = globalThis.innerHeight;
      const contentStart = scrollMarginRef.current - APP_HEADER_HEIGHT;
      const totalSize = virtualizerRef.current.getTotalSize();
      const contentEnd = scrollMarginRef.current + totalSize - viewportH;
      const contentRange = contentEnd - contentStart;
      const contentPct =
        contentRange > 0
          ? Math.max(0, Math.min(1, (globalThis.scrollY - contentStart) / contentRange))
          : 0;
      const halfH = indicatorHRef.current / 2;
      const trackTop = APP_HEADER_HEIGHT + halfH + INDICATOR_PAD;
      const trackBottom = viewportH - halfH - INDICATOR_PAD;
      const indicatorTop = trackTop + contentPct * (trackBottom - trackTop);

      // During drag: only update the card ID label. The pointer handler drives
      // the indicator position directly, so we must not reposition it here —
      // that would fight the pointer and cause jumps when scrollHeight shifts.
      if (isDraggingRef.current) {
        if (cardIdRef.current) {
          cardIdRef.current.textContent = firstCard.sourceId;
        }
        return;
      }

      // When hovered, freeze the indicator so the user can grab it easily.
      // Without this, it repositions on every scroll event making it a
      // moving target that's nearly impossible to click.
      if (isHoveredRef.current) {
        return;
      }

      // After a drag release, scrollTo triggers scroll events. Don't let
      // those reset the shorter post-drag hide timer.
      if (postDragCooldownRef.current) {
        return;
      }

      globalThis.clearTimeout(hideTimerRef.current);
      dragTopRef.current = indicatorTop;
      setIndicator((prev) => ({
        ...prev,
        cardId: firstCard.sourceId,
        indicatorTop,
        visible: true,
      }));
      hideTimerRef.current = globalThis.setTimeout(() => {
        if (!isHoveredRef.current) {
          setIndicator((prev) => ({ ...prev, visible: false }));
        }
      }, HIDE_DELAY);
    };
    globalThis.addEventListener("scroll", update, { passive: true });
    return () => {
      globalThis.removeEventListener("scroll", update);
      globalThis.clearTimeout(hideTimerRef.current);
    };
  }, []);

  const handleIndicatorPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    // Capture pointer so all subsequent move/up events route directly to
    // this element — no document-level listeners needed.
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // Freeze dimensions so mobile browser chrome changes don't shift the mapping.
    // dragTopRef is kept in sync by the scroll handler, so it always has the
    // current indicator Y — no need to parse style.top.
    const viewportH = globalThis.innerHeight;
    const totalSize = virtualizerRef.current.getTotalSize();
    const contentStart = scrollMarginRef.current - APP_HEADER_HEIGHT;
    const contentEnd = scrollMarginRef.current + totalSize - viewportH;
    dragStartRef.current = {
      grabOffsetY: e.clientY - dragTopRef.current,
      trackTop: APP_HEADER_HEIGHT + indicatorHRef.current / 2 + INDICATOR_PAD,
      trackBottom: viewportH - indicatorHRef.current / 2 - INDICATOR_PAD,
      contentStart,
      contentRange: contentEnd - contentStart,
    };
    // Lock the badge width so it doesn't jump as card IDs change length.
    const badge = cardIdRef.current?.parentElement as HTMLElement | null;
    if (badge) {
      badge.style.width = `${badge.offsetWidth}px`;
    }
    globalThis.clearTimeout(hideTimerRef.current);
    setIndicator((prev) => ({ ...prev, visible: true, dragging: true }));
  };

  // Drag move/up handlers. On desktop these fire on the indicator element
  // itself (via setPointerCapture). On touch they use document-level
  // TouchEvent listeners because mobile WebKit's PointerEvent is unreliable.
  // oxlint-disable-next-line no-empty-function
  const handleMoveRef = useRef((_clientY: number) => {});
  // oxlint-disable-next-line no-empty-function
  const handleUpRef = useRef(() => {});
  useEffect(() => {
    const handleMove = (clientY: number) => {
      const { trackTop, trackBottom, contentStart, contentRange } = dragStartRef.current;

      // Only move the indicator handle — the actual scroll happens on release
      // (handleUp). This avoids expensive virtualizer re-renders during drag.
      // Runs synchronously (no rAF) because the work is cheap (clamp, snap
      // check, two DOM writes) and deferring adds a full frame of latency.
      let indicatorTop = Math.max(
        trackTop,
        Math.min(trackBottom, clientY - dragStartRef.current.grabOffsetY),
      );

      // Snap to nearby ghost badges (set headers).
      const SNAP_DISTANCE = 20;
      let snapped = false;
      for (const sp of snapPointsRef.current) {
        if (Math.abs(indicatorTop - sp.screenY) <= SNAP_DISTANCE) {
          indicatorTop = sp.screenY;
          dragTopRef.current = indicatorTop;
          dragTargetRowRef.current = sp.rowIndex;
          if (indicatorRef.current) {
            indicatorRef.current.style.transform = `translateY(calc(${indicatorTop}px - 50%))`;
          }
          if (cardIdRef.current && sp.firstCardId) {
            cardIdRef.current.textContent = sp.firstCardId;
          }
          snapped = true;
          break;
        }
      }

      if (!snapped) {
        dragTopRef.current = indicatorTop;
        if (indicatorRef.current) {
          indicatorRef.current.style.transform = `translateY(calc(${indicatorTop}px - 50%))`;
        }

        // Project which card would be visible at this indicator position and
        // update the label so the user sees where they'll land on release.
        if (contentRange > 0 && cardIdRef.current) {
          const trackRange = trackBottom - trackTop;
          const contentPct = trackRange > 0 ? (indicatorTop - trackTop) / trackRange : 0;
          const targetScrollY = contentStart + contentPct * contentRange;
          const threshold = targetScrollY + APP_HEADER_HEIGHT + 1 - scrollMarginRef.current;

          const rows = virtualRowsRef.current;
          const starts = rowStartsRef.current;
          let cardId = "";
          let matchedRow = -1;
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.kind !== "cards") {
              continue;
            }
            const rowEnd = i + 1 < starts.length ? starts[i + 1] : starts[i] + 200;
            if (rowEnd > threshold) {
              cardId = row.items[0]?.sourceId ?? "";
              matchedRow = i;
              break;
            }
          }
          dragTargetRowRef.current = matchedRow;
          if (cardId) {
            cardIdRef.current.textContent = cardId;
          }
        }
      }
    };

    const handleUp = () => {
      isDraggingRef.current = false;
      // Unlock the badge width that was frozen on drag start.
      const badge = cardIdRef.current?.parentElement as HTMLElement | null;
      if (badge) {
        badge.style.width = "";
      }
      // Scroll to the exact row that the label is showing, so the card
      // aligns precisely below the header instead of a percentage estimate.
      if (dragTargetRowRef.current >= 0) {
        virtualizerRef.current.scrollToIndex(dragTargetRowRef.current, {
          align: "start",
          behavior: "auto",
        });
        dragTargetRowRef.current = -1;
      }

      const currentCardId = cardIdRef.current?.textContent || "";

      // Read back actual position for React state sync.
      const liveViewportH = globalThis.innerHeight;
      const liveTotalSize = virtualizerRef.current.getTotalSize();
      const liveContentStart = scrollMarginRef.current - APP_HEADER_HEIGHT;
      const liveContentEnd = scrollMarginRef.current + liveTotalSize - liveViewportH;
      const liveContentRange = liveContentEnd - liveContentStart;
      const liveContentPct =
        liveContentRange > 0
          ? Math.max(0, Math.min(1, (globalThis.scrollY - liveContentStart) / liveContentRange))
          : 0;
      const liveHalfH = indicatorHRef.current / 2;
      const liveTrackTop = APP_HEADER_HEIGHT + liveHalfH + INDICATOR_PAD;
      const liveTrackBottom = liveViewportH - liveHalfH - INDICATOR_PAD;
      const liveIndicatorTop = liveTrackTop + liveContentPct * (liveTrackBottom - liveTrackTop);

      postDragCooldownRef.current = true;
      dragTopRef.current = liveIndicatorTop;
      setIndicator((prev) => ({
        ...prev,
        dragging: false,
        indicatorTop: liveIndicatorTop,
        cardId: currentCardId,
      }));

      hideTimerRef.current = globalThis.setTimeout(() => {
        postDragCooldownRef.current = false;
        if (!isHoveredRef.current) {
          setIndicator((prev) => ({ ...prev, visible: false }));
        }
      }, POST_DRAG_HIDE_DELAY);
    };

    // Expose to element-level handlers via refs (the element uses
    // setPointerCapture, so onPointerMove/onPointerUp fire on it directly).
    handleMoveRef.current = handleMove;
    handleUpRef.current = handleUp;
  }, []);

  // Screen-space positions of each set header on the scrollbar track.
  // Recomputed on every render (indicator.thumbTop changes on scroll).
  const snapPoints = (() => {
    if (!multipleGroups) {
      return [];
    }
    const viewportH = globalThis.innerHeight;
    const totalSize = virtualizerRef.current.getTotalSize();
    const contentStart = scrollMarginRef.current - APP_HEADER_HEIGHT;
    const contentEnd = scrollMarginRef.current + totalSize - viewportH;
    const contentRange = contentEnd - contentStart;
    if (contentRange <= 0) {
      return [];
    }
    const halfH = indicatorHRef.current / 2;
    const trackTop = APP_HEADER_HEIGHT + halfH + INDICATOR_PAD;
    const trackBottom = viewportH - halfH - INDICATOR_PAD;

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
      const contentPct = Math.max(0, Math.min(1, (headerScrollY - contentStart) / contentRange));
      const screenY = Math.round(trackTop + contentPct * (trackBottom - trackTop));
      // First card ID in this set (for ghost badges)
      let firstCardId = "";
      for (let j = i + 1; j < virtualRows.length; j++) {
        const next = virtualRows[j];
        if (next.kind === "cards" && next.items.length > 0) {
          firstCardId = next.items[0].sourceId;
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
  snapPointsRef.current = snapPoints;

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

      // Up/Down: cycle sibling printings (versions)
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const siblings = siblingPrintingsRef.current;
        if (!siblings || siblings.length < 2) {
          return;
        }
        e.preventDefault();
        const idx = siblings.findIndex((p) => p.id === selectedCardId);
        const next =
          e.key === "ArrowUp"
            ? idx > 0
              ? idx - 1
              : siblings.length - 1
            : idx < siblings.length - 1
              ? idx + 1
              : 0;
        const targetPrinting = siblings[next];
        onCardClick(targetPrinting);

        // Scroll grid to the target printing if it's in the current view
        for (let i = 0; i < virtualRows.length; i++) {
          const row = virtualRows[i];
          if (row.kind === "cards" && row.items.some((c) => c.id === targetPrinting.id)) {
            virtualizer.scrollToIndex(i, { align: "auto" });
            break;
          }
        }
        return;
      }

      // Left/Right: grid navigation
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
      }

      if (targetCard && targetRowIndex !== undefined) {
        e.preventDefault();
        onCardClick(targetCard);
        virtualizer.scrollToIndex(targetRowIndex, { align: "auto" });
      }
    };

    globalThis.addEventListener("keydown", handler);
    return () => globalThis.removeEventListener("keydown", handler);
  }, [selectedCardId, virtualRows, columns, onCardClick, virtualizer]);

  // Scroll the selected card into view when it changes (e.g. switching
  // printings via the version picker or clicking a fanned sibling layer).
  // align: "auto" is a no-op when the card is already visible.
  // Also triggers a brief flash highlight so the user can spot the card.
  const [flashCardId, setFlashCardId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedCardId) {
      return;
    }
    const rows = virtualRowsRef.current;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.kind === "cards" && row.items.some((c) => c.id === selectedCardId)) {
        virtualizerRef.current.scrollToIndex(i, { align: "auto" });
        break;
      }
    }
    setFlashCardId(selectedCardId);
    const timer = setTimeout(() => setFlashCardId(null), 800);
    return () => clearTimeout(timer);
  }, [selectedCardId]);

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

  const items = virtualizer.getVirtualItems();

  // Cumulative card count per virtual row, so we can compute a flat card index
  // for each thumbnail and eager-load the first screenful of images.
  const cardStartIndex = new Map<number, number>();
  let cardsBefore = 0;
  for (let i = 0; i < virtualRows.length; i++) {
    cardStartIndex.set(i, cardsBefore);
    const row = virtualRows[i];
    if (row.kind === "cards") {
      cardsBefore += row.items.length;
    }
  }
  const eagerCount = columns * 2;

  return (
    <div ref={containerRef}>
      {cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
          {totalCards === 0 ? (
            <>
              <p className="text-lg font-medium text-muted-foreground">Couldn&apos;t load cards</p>
              <p className="text-sm text-muted-foreground">The server may be unreachable</p>
              <button
                type="button"
                className="mt-3 text-sm text-muted-foreground underline"
                onClick={() => globalThis.location.reload()}
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <p className="text-lg font-medium text-muted-foreground">No cards found</p>
              <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Scroll position indicator — appears while scrolling, fades out after idle.
              Draggable: grab to scrub through the page; snaps to set headers on release. */}
          <div
            ref={indicatorRef}
            className={`fixed z-20 transition-opacity duration-300 ${indicator.visible ? "pointer-events-auto" : "pointer-events-none"} ${IS_COARSE_POINTER ? "p-2 -m-2" : ""}`}
            style={{
              right: 20,
              top: 0,
              transform: `translateY(calc(${indicator.dragging ? dragTopRef.current : indicator.indicatorTop}px - 50%))`,
              willChange: "transform",
              opacity: indicator.visible ? 1 : 0,
              touchAction: "none",
            }}
            onPointerDown={handleIndicatorPointerDown}
            onPointerMove={(e) => {
              if (isDraggingRef.current) {
                handleMoveRef.current(e.clientY);
              }
            }}
            onPointerUp={() => {
              if (isDraggingRef.current) {
                handleUpRef.current();
              }
            }}
            onPointerCancel={() => {
              if (isDraggingRef.current) {
                handleUpRef.current();
              }
            }}
            onLostPointerCapture={() => {
              if (isDraggingRef.current) {
                handleUpRef.current();
              }
            }}
            onMouseEnter={() => {
              isHoveredRef.current = true;
              globalThis.clearTimeout(hideTimerRef.current);
            }}
            onMouseLeave={() => {
              isHoveredRef.current = false;
              if (indicator.visible && !isDraggingRef.current) {
                hideTimerRef.current = globalThis.setTimeout(() => {
                  setIndicator((prev) => ({ ...prev, visible: false }));
                }, HIDE_DELAY);
              }
            }}
          >
            <div
              className={`flex origin-right items-center gap-1.5 transition-transform duration-200 ease-out ${indicator.dragging ? "scale-110" : "scale-100"}`}
            >
              <div
                className={`inline-flex items-center whitespace-nowrap rounded-md bg-popover/90 font-mono font-medium text-popover-foreground shadow-md ring-1 backdrop-blur-sm select-none ${IS_COARSE_POINTER ? "px-5 py-2 text-base" : "px-5 py-2 text-sm"} ${indicator.dragging ? "cursor-grabbing ring-primary/60" : "cursor-grab ring-primary/40"}`}
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
                  transform: "translateY(-50%)",
                  opacity: indicator.dragging ? 1 : 0,
                }}
              >
                <div className="flex items-center gap-1.5">
                  <div
                    className={`whitespace-nowrap rounded-md bg-popover/80 font-mono font-medium text-popover-foreground/70 ring-1 ring-border/50 backdrop-blur-sm select-none ${IS_COARSE_POINTER ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs"}`}
                  >
                    {pt.firstCardId || pt.setInfo.code}
                  </div>
                  <div className="size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                </div>
              </div>
            ))}

          {/* Sticky set header overlay — lives inside the grid container so it
              naturally inherits the container's width and centers via CSS.
              height:0 + overflow:visible keeps it out of the flow so toggling
              activeHeaderRow never shifts the virtualizer content. */}
          <div className="sticky z-10 h-0" style={{ top: APP_HEADER_HEIGHT }}>
            {multipleGroups && activeHeaderRow && (
              <div className="flex justify-center pt-2">
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
          </div>
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
                      {row.items.map((card, colIndex) => {
                        const flatIndex = (cardStartIndex.get(vItem.index) ?? 0) + colIndex;
                        return (
                          <CardThumbnail
                            key={card.id}
                            card={card}
                            onClick={onCardClick}
                            onSiblingClick={onSiblingClick}
                            showImages={showImages}
                            isSelected={card.id === selectedCardId}
                            isFlashing={card.id === flashCardId}
                            siblings={printingsByCardId?.get(card.cardId)}
                            priceRange={priceRangeByCardId?.get(card.cardId)}
                            view={view}
                            cardFields={cardFields}
                            cardWidth={thumbWidth}
                            priority={flatIndex < eagerCount}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
