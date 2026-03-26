import type { Printing } from "@openrift/shared";
import type { Virtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { IS_COARSE_POINTER } from "@/lib/pointer";

import { APP_HEADER_HEIGHT } from "./card-grid-constants";
import type { IndicatorState, VRow } from "./card-grid-types";
import { computeSnapPoints } from "./compute-snap-points";

const HIDE_DELAY = IS_COARSE_POINTER ? 3000 : 800;
const POST_DRAG_HIDE_DELAY = IS_COARSE_POINTER ? 1500 : 600;
const INDICATOR_H_FALLBACK = 48;
const INDICATOR_PAD = 4;

interface UseScrollIndicatorParams {
  virtualRows: VRow[];
  rowStarts: number[];
  virtualizer: Virtualizer<Window, Element>;
  scrollMargin: number;
  multipleGroups: boolean;
}

export function useScrollIndicator({
  virtualRows,
  rowStarts,
  virtualizer,
  scrollMargin,
  multipleGroups,
}: UseScrollIndicatorParams) {
  // ── Mirror refs (read current values from event handlers) ──────────
  const virtualRowsRef = useRef(virtualRows);
  virtualRowsRef.current = virtualRows;

  const rowStartsRef = useRef(rowStarts);
  rowStartsRef.current = rowStarts;

  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  const scrollMarginRef = useRef(scrollMargin);
  scrollMarginRef.current = scrollMargin;

  // ── Indicator state ────────────────────────────────────────────────
  const [indicator, setIndicator] = useState<IndicatorState>({
    cardId: "",
    indicatorTop: APP_HEADER_HEIGHT + INDICATOR_PAD,
    visible: false,
    dragging: false,
  });

  // oxlint-disable-next-line unicorn/no-useless-undefined -- required by useRef overload signature
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
  const snapPointElsRef = useRef<Map<number, HTMLElement>>(new Map());

  // ── Measure indicator height ───────────────────────────────────────
  useLayoutEffect(() => {
    if (indicatorRef.current) {
      indicatorHRef.current = indicatorRef.current.offsetHeight || INDICATOR_H_FALLBACK;
    }
  });

  // ── Prevent native touch scrolling during drag ─────────────────────
  useEffect(() => {
    const preventScroll = (e: TouchEvent) => {
      if (isDraggingRef.current) {
        e.preventDefault();
      }
    };
    document.addEventListener("touchmove", preventScroll, { passive: false });
    return () => document.removeEventListener("touchmove", preventScroll);
  }, []);

  // ── Scroll-position tracking (updates indicator on scroll) ─────────
  useEffect(() => {
    let rafId = 0;
    const update = () => {
      const threshold = globalThis.scrollY + APP_HEADER_HEIGHT + 1;
      const vItems = virtualizerRef.current.getVirtualItems();
      const rows = virtualRowsRef.current;
      let firstCard: Printing | null = null;
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

      // During drag: only update the card ID label.
      if (isDraggingRef.current) {
        if (cardIdRef.current) {
          cardIdRef.current.textContent = firstCard.shortCode;
        }
        return;
      }

      // When hovered, freeze the indicator so the user can grab it easily.
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
      setIndicator((prev) => {
        const sameCard = prev.cardId === firstCard.shortCode;
        const sameTop = Math.abs(prev.indicatorTop - indicatorTop) < 0.5;
        if (prev.visible && sameCard && sameTop) {
          return prev;
        }
        return { ...prev, cardId: firstCard.shortCode, indicatorTop, visible: true };
      });
      hideTimerRef.current = globalThis.setTimeout(() => {
        if (!isHoveredRef.current) {
          setIndicator((prev) => ({ ...prev, visible: false }));
        }
      }, HIDE_DELAY);
    };

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };
    globalThis.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      globalThis.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
      globalThis.clearTimeout(hideTimerRef.current);
    };
  }, []);

  // ── Pointer down handler ───────────────────────────────────────────
  const handleIndicatorPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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

  // ── Drag move/up (exposed via refs for element-level handlers) ─────
  // oxlint-disable-next-line no-empty-function -- initialised lazily in effect
  const handleMoveRef = useRef((_clientY: number) => {});
  // oxlint-disable-next-line no-empty-function -- initialised lazily in effect
  const handleUpRef = useRef(() => {});

  useEffect(() => {
    const handleMove = (clientY: number) => {
      const { trackTop, trackBottom, contentStart, contentRange } = dragStartRef.current;

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

      // Hide snap point badges that overlap the drag indicator.
      for (const sp of snapPointsRef.current) {
        const el = snapPointElsRef.current.get(sp.rowIndex);
        if (el) {
          el.style.visibility =
            Math.abs(sp.screenY - indicatorTop) <= SNAP_DISTANCE ? "hidden" : "";
        }
      }

      if (!snapped) {
        dragTopRef.current = indicatorTop;
        if (indicatorRef.current) {
          indicatorRef.current.style.transform = `translateY(calc(${indicatorTop}px - 50%))`;
        }

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
              cardId = row.items[0]?.shortCode ?? "";
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
      const badge = cardIdRef.current?.parentElement as HTMLElement | null;
      if (badge) {
        badge.style.width = "";
      }
      // Reset snap point visibility overrides from drag.
      for (const el of snapPointElsRef.current.values()) {
        el.style.visibility = "";
      }
      if (dragTargetRowRef.current >= 0) {
        virtualizerRef.current.scrollToIndex(dragTargetRowRef.current, {
          align: "start",
          behavior: "auto",
        });
        dragTargetRowRef.current = -1;
      }

      const currentCardId = cardIdRef.current?.textContent || "";

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

    handleMoveRef.current = handleMove;
    handleUpRef.current = handleUp;
  }, []);

  // ── Snap points ────────────────────────────────────────────────────
  const snapPoints = computeSnapPoints({
    virtualRows,
    rowStarts,
    virtualizer,
    scrollMargin,
    multipleGroups,
    indicatorH: indicatorHRef.current,
  });
  snapPointsRef.current = snapPoints;

  // ── Hover handlers (for the indicator element) ─────────────────────
  const handleMouseEnter = () => {
    isHoveredRef.current = true;
    globalThis.clearTimeout(hideTimerRef.current);
  };

  const handleMouseLeave = () => {
    isHoveredRef.current = false;
    if (indicator.visible && !isDraggingRef.current) {
      hideTimerRef.current = globalThis.setTimeout(() => {
        setIndicator((prev) => ({ ...prev, visible: false }));
      }, HIDE_DELAY);
    }
  };

  return {
    indicator,
    indicatorRef,
    cardIdRef,
    dragTopRef,
    isDraggingRef,
    handleIndicatorPointerDown,
    handleMoveRef,
    handleUpRef,
    snapPointElsRef,
    handleMouseEnter,
    handleMouseLeave,
    snapPoints,
  };
}
