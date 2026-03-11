import type { Virtualizer } from "@tanstack/react-virtual";
import type React from "react";
import { useEffect, useRef } from "react";

import { IS_COARSE_POINTER } from "@/lib/pointer";

import { APP_HEADER_HEIGHT } from "./card-grid-constants";
import type { IndicatorState, VRow } from "./card-grid-types";

const INDICATOR_PAD = 4;
const POST_DRAG_HIDE_DELAY = IS_COARSE_POINTER ? 1500 : 600;

interface UseIndicatorDragParams {
  virtualizerRef: React.RefObject<Virtualizer<Window, Element>>;
  virtualRowsRef: React.RefObject<VRow[]>;
  rowStartsRef: React.RefObject<number[]>;
  scrollMarginRef: React.RefObject<number>;
  indicatorHRef: React.RefObject<number>;
  indicatorRef: React.RefObject<HTMLDivElement | null>;
  cardIdRef: React.RefObject<HTMLElement | null>;
  snapPointsRef: React.RefObject<{ screenY: number; rowIndex: number; firstCardId: string }[]>;
  setIndicator: React.Dispatch<React.SetStateAction<IndicatorState>>;
}

export function useIndicatorDrag({
  virtualizerRef,
  virtualRowsRef,
  rowStartsRef,
  scrollMarginRef,
  indicatorHRef,
  indicatorRef,
  cardIdRef,
  snapPointsRef,
  setIndicator,
}: UseIndicatorDragParams) {
  const dragStartRef = useRef({
    grabOffsetY: 0,
    trackTop: 0,
    trackBottom: 0,
    contentStart: 0,
    contentRange: 0,
  });
  const dragTargetRowRef = useRef(-1);
  const isDraggingRef = useRef(false);
  const postDragCooldownRef = useRef(false);
  const isHoveredRef = useRef(false);
  const dragTopRef = useRef(0);
  const hideTimerRef = useRef(0);

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
      const badge = cardIdRef.current?.parentElement as HTMLElement | null;
      if (badge) {
        badge.style.width = "";
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
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- all params are stable refs/dispatchers
  }, []);

  return {
    isDraggingRef,
    postDragCooldownRef,
    isHoveredRef,
    dragTopRef,
    hideTimerRef,
    handleIndicatorPointerDown,
    handleMoveRef,
    handleUpRef,
  };
}
